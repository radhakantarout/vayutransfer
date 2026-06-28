import { NextRequest, NextResponse } from 'next/server'
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, TABLES } from '@/lib/studio/dynamodb'
import type { MediaFile, Studio } from '@/types/studio'

const lambda = new LambdaClient({ region: process.env.AWS_REGION ?? 'ap-south-1' })
const ddb    = DynamoDBDocumentClient.from(
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

    // Fetch studio for logo key
    const studio = await studioGetItem<Studio>(TABLES.studios, { studioId })

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
        const payload = {
          fileId:           f.fileId,
          projectId,
          studioId,
          s3Bucket:         process.env.STUDIO_S3_BUCKET ?? 'vayutransfer-studio-originals',
          s3Key:            f.s3Key,
          r2Bucket:         process.env.STUDIO_R2_BUCKET ?? 'vayustudio-previews-test',
          r2Key:            `studios/${studioId}/projects/${projectId}/previews/${f.fileId}.jpg`,
          r2Endpoint:       process.env.STUDIO_R2_ENDPOINT,
          r2AccessKeyId:    process.env.R2_ACCESS_KEY_ID,
          r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
          studioName:       studio?.name ?? 'Studio',
          logoS3Key:        studio?.brandingConfig?.logoS3Key ?? null,
          watermarkEnabled: f.watermarkEnabled ?? true,
          fileType:         f.fileType,
        }

        try {
          await lambda.send(new InvokeCommand({
            FunctionName:   process.env.WATERMARK_LAMBDA_ARN,
            InvocationType: 'Event',  // async — don't wait for result
            Payload:        Buffer.from(JSON.stringify(payload)),
          }))
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
