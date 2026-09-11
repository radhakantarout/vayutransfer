import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { randomUUID } from 'crypto'
import { RekognitionClient, SearchFacesByImageCommand } from '@aws-sdk/client-rekognition'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, BatchGetCommand } from '@aws-sdk/lib-dynamodb'
import { TABLES, studioPutItem } from '@/lib/studio/dynamodb'
import { getMediaDownloadUrl, getMediaPreviewUrl } from '@/lib/studio/storage'
import type { MediaFile, StudioJob } from '@/types/studio'

const rek = new RekognitionClient({ region: process.env.AWS_REGION ?? 'ap-south-1' })
const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION ?? 'ap-south-1' })
)

function getSecret() {
  return new TextEncoder().encode(process.env.STUDIO_JWT_SECRET!)
}

const MAX_SELFIE_BYTES = 5 * 1024 * 1024

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    // Validate guest JWT
    let projectId: string
    let studioId: string
    try {
      const { payload } = await jwtVerify(params.token, getSecret())
      if (payload.type !== 'GUEST_QR') {
        return NextResponse.json({ success: false, error: 'INVALID_TOKEN' }, { status: 401 })
      }
      projectId = payload.projectId as string
      studioId = payload.studioId as string
    } catch (err: unknown) {
      const name = (err as { name?: string }).name ?? ''
      if (name === 'JWTExpired') {
        return NextResponse.json({ success: false, error: 'TOKEN_EXPIRED' }, { status: 410 })
      }
      return NextResponse.json({ success: false, error: 'INVALID_TOKEN' }, { status: 401 })
    }

    // Parse multipart selfie
    const contentType = req.headers.get('content-type') ?? ''
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ success: false, error: 'INVALID_CONTENT_TYPE' }, { status: 400 })
    }
    const formData   = await req.formData()
    const selfieFile = formData.get('selfie') as File | null
    if (!selfieFile) return NextResponse.json({ success: false, error: 'NO_FILE' }, { status: 400 })
    if (selfieFile.size > MAX_SELFIE_BYTES) {
      return NextResponse.json({ success: false, error: 'FILE_TOO_LARGE' }, { status: 413 })
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(selfieFile.type)) {
      return NextResponse.json({ success: false, error: 'INVALID_TYPE' }, { status: 400 })
    }

    const selfieBuffer = Buffer.from(await selfieFile.arrayBuffer())

    // Search Rekognition collection
    let searchRes
    try {
      searchRes = await rek.send(new SearchFacesByImageCommand({
        CollectionId: `vayustudio-${projectId}`,
        Image: { Bytes: selfieBuffer },
        // Raised from 70 -> 85 to cut down false-positive matches (wrong
        // person pulled in due to similar angle/lighting/makeup).
        FaceMatchThreshold: 85,
        MaxFaces: 4096,
      }))
    } catch (err: unknown) {
      const name = (err as { name?: string }).name ?? ''
      if (name === 'InvalidParameterException') {
        return NextResponse.json({ success: true, data: { error: 'NO_FACE_DETECTED', photos: [] } })
      }
      if (name === 'ResourceNotFoundException') {
        return NextResponse.json({ success: false, error: 'NOT_INDEXED_YET' }, { status: 404 })
      }
      throw err
    }

    if (!searchRes.FaceMatches?.length) {
      return NextResponse.json({ success: true, data: { photos: [] } })
    }

    // Collect unique fileIds
    const matchedFileIds = Array.from(new Set(
      searchRes.FaceMatches
        .map(m => m.Face?.ExternalImageId)
        .filter((id): id is string => !!id)
    ))

    // Batch-fetch MediaFiles in chunks of 100 (DynamoDB limit)
    const allFiles: MediaFile[] = []
    for (let i = 0; i < matchedFileIds.length; i += 100) {
      const chunk = matchedFileIds.slice(i, i + 100)
      const batchRes = await ddb.send(new BatchGetCommand({
        RequestItems: {
          [TABLES.mediafiles]: {
            Keys: chunk.map(fileId => ({ projectId, fileId })),
          },
        },
      }))
      allFiles.push(...((batchRes.Responses?.[TABLES.mediafiles] ?? []) as MediaFile[]))
    }

    const readyFiles = allFiles
      .filter(f => f.processingStatus === 'READY')
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))

    // Generate signed URLs — prefer the edited version for both preview and
    // download when one exists (never serve the stale original silently)
    const photos = await Promise.all(
      readyFiles.map(async f => {
        const [previewUrl, downloadUrl] = await Promise.all([
          getMediaPreviewUrl(f).then(u => u ?? ''),
          getMediaDownloadUrl(f, f.originalFilename).catch(() => ''),
        ])
        return {
          fileId: f.fileId, previewUrl, filename: f.originalFilename, downloadUrl,
          isEdited: !!(f.editedS3Key || f.editedR2Key), sizeBytes: f.sizeBytes,
        }
      })
    )

    // Trust-boundary fix (design doc §5): a guest's search results were
    // previously only ever returned in this response, never persisted —
    // meaning nothing stopped a guest from later claiming an arbitrary
    // fileId (from the whole project, not just their own matches) belonged
    // to their own search. Persisting the matched set here, keyed by a
    // fresh session id, lets any later action (AI Reel creation) validate
    // "is this photoId actually one MY search matched" instead of trusting
    // the client. Reuses the existing (previously-unused-by-this-flow)
    // SELFIE_SEARCH jobType on the shared jobs table rather than a new one.
    // 2h TTL — long enough to browse results and decide, short enough that
    // this isn't a lingering biometric-adjacent record.
    const searchSessionId = randomUUID()
    const now = new Date().toISOString()
    const sessionJob: StudioJob = {
      jobId: searchSessionId, jobType: 'SELFIE_SEARCH', status: 'READY',
      projectId, studioId,
      outputPayload: { matchedFileIds: readyFiles.map((f) => f.fileId) },
      createdAt: now, completedAt: now,
      ttl: Math.floor(Date.now() / 1000) + 2 * 60 * 60,
    }
    await studioPutItem(TABLES.jobs, sessionJob as unknown as Record<string, unknown>)

    return NextResponse.json({
      success: true,
      data: { totalPhotos: photos.length, photos, searchSessionId },
    })
  } catch (err) {
    console.error('[guest search POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
