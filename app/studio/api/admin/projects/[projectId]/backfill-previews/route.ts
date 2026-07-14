import { NextRequest, NextResponse } from 'next/server'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, TABLES } from '@/lib/studio/dynamodb'
import { invokeStudioWatermarkLambda } from '@/lib/studio/watermark'
import type { MediaFile, StudioProject } from '@/types/studio'

const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION ?? 'ap-south-1' })
)

export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    if (!process.env.WATERMARK_LAMBDA_ARN) {
      return NextResponse.json({ success: false, error: 'LAMBDA_NOT_CONFIGURED' }, { status: 503 })
    }

    const { projectId } = params
    const studioId = auth.studioId!

    const project = await studioGetItem<StudioProject>(TABLES.projects, { studioId, projectId })
    if (!project) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })

    // Query all READY IMAGE files without r2PreviewUrl
    const res = await ddb.send(new QueryCommand({
      TableName: TABLES.mediafiles,
      KeyConditionExpression: 'projectId = :pid',
      FilterExpression:
        'processingStatus = :ready AND fileType = :img AND ' +
        '(attribute_not_exists(r2PreviewUrl) OR r2PreviewUrl = :empty)',
      ExpressionAttributeValues: {
        ':pid':   projectId,
        ':ready': 'READY',
        ':img':   'IMAGE',
        ':empty': '',
      },
    }))

    const files = (res.Items ?? []) as MediaFile[]

    if (files.length === 0) {
      return NextResponse.json({ success: true, data: { queued: 0, message: 'All previews already generated' } })
    }

    // Invoke watermark Lambda async for each file (fire-and-forget)
    let queued = 0
    await Promise.all(
      files.map(async (f) => {
        try {
          await invokeStudioWatermarkLambda({
            fileId: f.fileId,
            projectId,
            studioId,
            sourceKey: f.r2Key ?? f.s3Key!,
            sourceBackend: f.r2Key ? 'R2' : 'S3',
            watermarkEnabled: f.watermarkEnabled ?? true,
            fileType: f.fileType,
          })
          queued++
        } catch (err) {
          console.error(`[backfill-previews] failed to invoke for ${f.fileId}:`, err)
        }
      })
    )

    console.log(`[backfill-previews] queued ${queued}/${files.length} files for project ${projectId}`)

    return NextResponse.json({
      success: true,
      data: { queued, total: files.length },
    })
  } catch (err) {
    console.error('[backfill-previews POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
