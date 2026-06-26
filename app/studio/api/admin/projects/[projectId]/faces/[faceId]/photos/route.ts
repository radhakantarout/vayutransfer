import { NextRequest, NextResponse } from 'next/server'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, TABLES } from '@/lib/studio/dynamodb'
import type { StudioProject, StudioFace, MediaFile } from '@/types/studio'

const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION ?? 'ap-south-1' })
)

export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string; faceId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { projectId, faceId } = params
    const studioId = auth.studioId!
    const url    = new URL(req.url)
    const page   = Math.max(1, Number(url.searchParams.get('page') ?? '1'))
    const limit  = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') ?? '50')))

    const project = await studioGetItem<StudioProject>(TABLES.projects, { studioId, projectId })
    if (!project) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })

    const faceRes = await ddb.send(new GetCommand({ TableName: TABLES.faces, Key: { projectId, faceId } }))
    const face = faceRes.Item as StudioFace | undefined
    if (!face) return NextResponse.json({ success: false, error: 'FACE_NOT_FOUND' }, { status: 404 })

    const allPhotoIds = [...(face.photoIds ?? [])]
    const start = (page - 1) * limit
    const pageIds = allPhotoIds.slice(start, start + limit)

    if (!pageIds.length) {
      return NextResponse.json({ success: true, data: { files: [], total: 0, page, limit } })
    }

    const batchRes = await ddb.send(new BatchGetCommand({
      RequestItems: {
        [TABLES.mediafiles]: {
          Keys: pageIds.map(fileId => ({ projectId, fileId })),
        },
      },
    }))

    const files = (batchRes.Responses?.[TABLES.mediafiles] ?? []) as MediaFile[]
    files.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))

    return NextResponse.json({
      success: true,
      data: { files, total: allPhotoIds.length, page, limit },
    })
  } catch (err) {
    console.error('[face photos GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
