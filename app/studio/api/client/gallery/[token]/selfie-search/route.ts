import { NextRequest, NextResponse } from 'next/server'
import { RekognitionClient, SearchFacesByImageCommand } from '@aws-sdk/client-rekognition'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, BatchGetCommand } from '@aws-sdk/lib-dynamodb'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioQueryByIndex, TABLES } from '@/lib/studio/dynamodb'
import type { StudioProject, Studio, MediaFile } from '@/types/studio'

const rek = new RekognitionClient({ region: process.env.AWS_REGION ?? 'ap-south-1' })
const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION ?? 'ap-south-1' })
)

const MAX_SELFIE_BYTES = 5 * 1024 * 1024

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || auth.role !== 'CLIENT') {
      return NextResponse.json({ success: false, error: 'UNAUTHENTICATED' }, { status: 401 })
    }

    const { token } = params

    const projects = await studioQueryByIndex<StudioProject>(
      TABLES.projects, 'clientShareToken-index',
      'clientShareToken = :token', { ':token': token }
    )
    const project = projects[0]
    if (!project) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    if (!project.clientShareExpiresAt || new Date(project.clientShareExpiresAt) < new Date()) {
      return NextResponse.json({ success: false, error: 'TOKEN_EXPIRED' }, { status: 410 })
    }
    if (auth.projectId !== project.projectId) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const studio = await studioGetItem<Studio>(TABLES.studios, { studioId: project.studioId })
    if (!studio?.featureFlags?.aiFaceRecognition) {
      return NextResponse.json({ success: false, error: 'FEATURE_DISABLED' }, { status: 403 })
    }

    const contentType = req.headers.get('content-type') ?? ''
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ success: false, error: 'INVALID_CONTENT_TYPE' }, { status: 400 })
    }

    const formData = await req.formData()
    const selfieFile = formData.get('selfie') as File | null
    if (!selfieFile) {
      return NextResponse.json({ success: false, error: 'NO_FILE' }, { status: 400 })
    }
    if (selfieFile.size > MAX_SELFIE_BYTES) {
      return NextResponse.json({ success: false, error: 'FILE_TOO_LARGE' }, { status: 413 })
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(selfieFile.type)) {
      return NextResponse.json({ success: false, error: 'INVALID_TYPE' }, { status: 400 })
    }

    const selfieBuffer = Buffer.from(await selfieFile.arrayBuffer())

    let searchRes
    try {
      searchRes = await rek.send(new SearchFacesByImageCommand({
        CollectionId: `vayustudio-${project.projectId}`,
        Image: { Bytes: selfieBuffer },
        // Raised from 70 -> 85 to cut down false-positive matches (wrong
        // person pulled in due to similar angle/lighting/makeup).
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

    // Collect unique fileIds from matches (ExternalImageId = fileId)
    const matchedFileIds = Array.from(new Set(
      searchRes.FaceMatches
        .map(m => m.Face?.ExternalImageId)
        .filter((id): id is string => !!id)
    ))

    if (!matchedFileIds.length) {
      return NextResponse.json({ success: true, data: { matchedFaceCount: 0, totalPhotos: 0, photos: [] } })
    }

    // Batch-fetch matched MediaFiles — DynamoDB BatchGet limit is 100 keys per request
    const chunks: string[][] = []
    for (let i = 0; i < matchedFileIds.length; i += 100) chunks.push(matchedFileIds.slice(i, i + 100))

    const allItems: MediaFile[] = []
    for (const chunk of chunks) {
      const batchRes = await ddb.send(new BatchGetCommand({
        RequestItems: {
          [TABLES.mediafiles]: {
            Keys: chunk.map(fileId => ({ projectId: project.projectId, fileId })),
          },
        },
      }))
      allItems.push(...((batchRes.Responses?.[TABLES.mediafiles] ?? []) as MediaFile[]))
    }

    const photos = allItems
      .filter(f => f.processingStatus === 'READY')
      .sort((a, b) => a.displayOrder - b.displayOrder)

    return NextResponse.json({
      success: true,
      data: {
        matchedFaceCount: searchRes.FaceMatches.length,
        totalPhotos: photos.length,
        photos,
      },
    })
  } catch (err) {
    console.error('[selfie-search POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
