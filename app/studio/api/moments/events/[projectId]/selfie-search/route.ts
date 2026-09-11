import { NextRequest, NextResponse } from 'next/server'
import { RekognitionClient, SearchFacesByImageCommand } from '@aws-sdk/client-rekognition'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, BatchGetCommand } from '@aws-sdk/lib-dynamodb'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, TABLES } from '@/lib/studio/dynamodb'
import { resolveProjectForViewer, isApprovedMember, isOwnerOrAdmin } from '@/lib/studio/galleryMembers'
import type { Studio, MediaFile } from '@/types/studio'

// Mirrors the Client Gallery's own authenticated "Find My Photos"
// (app/studio/api/client/gallery/[token]/selfie-search/route.ts) almost
// exactly — same Rekognition collection naming (`vayustudio-${projectId}`,
// keyed by project, not by studio, so it already works unchanged for a
// Moments personal Studio's own projects), same threshold/response shape.
// Deliberately NOT the anonymous Guest Selfie Search flow — every Moments
// member has a real signed-in identity, so none of that flow's trust-
// boundary work (session-scoped match tokens) applies here.
const rek = new RekognitionClient({ region: process.env.AWS_REGION ?? 'ap-south-1' })
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION ?? 'ap-south-1' }))

const MAX_SELFIE_BYTES = 5 * 1024 * 1024

export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth?.studioId) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })

    const { projectId } = params
    const resolved = await resolveProjectForViewer(auth, projectId)
    if (!resolved) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    if (!isOwnerOrAdmin(auth.studioId, resolved.project, resolved.member) && !isApprovedMember(resolved.member)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const studio = await studioGetItem<Studio>(TABLES.studios, { studioId: resolved.project.studioId })
    if (!studio?.featureFlags?.aiFaceRecognition) {
      return NextResponse.json({ success: false, error: 'FEATURE_DISABLED' }, { status: 403 })
    }

    const contentType = req.headers.get('content-type') ?? ''
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ success: false, error: 'INVALID_CONTENT_TYPE' }, { status: 400 })
    }

    const formData = await req.formData()
    const selfieFile = formData.get('selfie') as File | null
    if (!selfieFile) return NextResponse.json({ success: false, error: 'NO_FILE' }, { status: 400 })
    if (selfieFile.size > MAX_SELFIE_BYTES) return NextResponse.json({ success: false, error: 'FILE_TOO_LARGE' }, { status: 413 })
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(selfieFile.type)) {
      return NextResponse.json({ success: false, error: 'INVALID_TYPE' }, { status: 400 })
    }

    const selfieBuffer = Buffer.from(await selfieFile.arrayBuffer())

    let searchRes
    try {
      searchRes = await rek.send(new SearchFacesByImageCommand({
        CollectionId: `vayustudio-${projectId}`,
        Image: { Bytes: selfieBuffer },
        FaceMatchThreshold: 85,
        MaxFaces: 4096,
      }))
    } catch (err: unknown) {
      const errName = (err as { name?: string }).name ?? ''
      if (errName === 'InvalidParameterException') {
        return NextResponse.json({ success: true, data: { error: 'NO_FACE_DETECTED', totalPhotos: 0, photos: [] } })
      }
      if (errName === 'ResourceNotFoundException') {
        return NextResponse.json({ success: false, error: 'NOT_INDEXED_YET' }, { status: 403 })
      }
      throw err
    }

    if (!searchRes.FaceMatches?.length) {
      return NextResponse.json({ success: true, data: { matchedFaceCount: 0, totalPhotos: 0, photos: [] } })
    }

    const matchedFileIds = Array.from(new Set(
      searchRes.FaceMatches.map((m) => m.Face?.ExternalImageId).filter((id): id is string => !!id)
    ))
    if (!matchedFileIds.length) {
      return NextResponse.json({ success: true, data: { matchedFaceCount: 0, totalPhotos: 0, photos: [] } })
    }

    const chunks: string[][] = []
    for (let i = 0; i < matchedFileIds.length; i += 100) chunks.push(matchedFileIds.slice(i, i + 100))

    const allItems: MediaFile[] = []
    for (const chunk of chunks) {
      const batchRes = await ddb.send(new BatchGetCommand({
        RequestItems: { [TABLES.mediafiles]: { Keys: chunk.map((fileId) => ({ projectId, fileId })) } },
      }))
      allItems.push(...((batchRes.Responses?.[TABLES.mediafiles] ?? []) as MediaFile[]))
    }

    const photos = allItems
      .filter((f) => f.processingStatus === 'READY')
      .sort((a, b) => a.displayOrder - b.displayOrder)

    return NextResponse.json({
      success: true,
      data: { matchedFaceCount: searchRes.FaceMatches.length, totalPhotos: photos.length, photos },
    })
  } catch (err) {
    console.error('[moments selfie-search POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
