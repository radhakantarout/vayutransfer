import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { RekognitionClient, SearchFacesByImageCommand } from '@aws-sdk/client-rekognition'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, BatchGetCommand } from '@aws-sdk/lib-dynamodb'
import { TABLES } from '@/lib/studio/dynamodb'
import { getStudioSignedDownloadUrl } from '@/lib/studio/s3'
import type { MediaFile } from '@/types/studio'

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
    try {
      const { payload } = await jwtVerify(params.token, getSecret())
      if (payload.type !== 'GUEST_QR') {
        return NextResponse.json({ success: false, error: 'INVALID_TOKEN' }, { status: 401 })
      }
      projectId = payload.projectId as string
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
        FaceMatchThreshold: 70,
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

    // Generate signed download URLs for each photo
    const photos = await Promise.all(
      readyFiles.map(async f => ({
        fileId:       f.fileId,
        previewUrl:   f.r2PreviewUrl ?? '',
        filename:     f.originalFilename,
        downloadUrl:  await getStudioSignedDownloadUrl(f.s3Key, f.originalFilename).catch(() => ''),
      }))
    )

    return NextResponse.json({
      success: true,
      data: { totalPhotos: photos.length, photos },
    })
  } catch (err) {
    console.error('[guest search POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
