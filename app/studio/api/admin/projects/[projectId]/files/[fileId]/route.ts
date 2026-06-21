import { NextRequest, NextResponse } from 'next/server'
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioUpdateItem, studioDeleteItem, TABLES } from '@/lib/studio/dynamodb'
import { deleteStudioS3Object } from '@/lib/studio/s3'
import type { MediaFile, StudioProject } from '@/types/studio'

const lambda = new LambdaClient({ region: process.env.AWS_REGION ?? 'ap-south-1' })

// PATCH — toggle watermark or update display order
export async function PATCH(
  req: NextRequest,
  { params }: { params: { projectId: string; fileId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { projectId, fileId } = params
    const { watermarkEnabled, displayOrder } = await req.json()
    const now = new Date().toISOString()

    const file = await studioGetItem<MediaFile>(TABLES.mediafiles, { projectId, fileId })
    if (!file || file.studioId !== auth.studioId) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }

    const updates: string[] = ['updatedAt = :now']
    const values: Record<string, unknown> = { ':now': now }

    if (watermarkEnabled !== undefined) {
      updates.push('watermarkEnabled = :wm')
      values[':wm'] = watermarkEnabled

      // Re-trigger watermark Lambda if toggled
      if (process.env.WATERMARK_LAMBDA_ARN) {
        lambda.send(new InvokeCommand({
          FunctionName: process.env.WATERMARK_LAMBDA_ARN,
          InvocationType: 'Event',
          Payload: Buffer.from(JSON.stringify({
            fileId, projectId, studioId: file.studioId,
            s3Bucket: process.env.STUDIO_S3_BUCKET,
            s3Key: file.s3Key,
            r2Bucket: process.env.STUDIO_R2_BUCKET,
            r2Key: `studios/${file.studioId}/projects/${projectId}/previews/${fileId}.jpg`,
            r2Endpoint: process.env.STUDIO_R2_ENDPOINT,
            r2AccessKeyId: process.env.R2_ACCESS_KEY_ID,
            r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
            watermarkEnabled,
            fileType: file.fileType,
          })),
        })).catch((e: unknown) => console.error('[watermark re-invoke]', e))
      }
    }

    if (displayOrder !== undefined) {
      updates.push('displayOrder = :order')
      values[':order'] = displayOrder
    }

    await studioUpdateItem(
      TABLES.mediafiles,
      { projectId, fileId },
      `SET ${updates.join(', ')}`,
      values
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[files PATCH]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

// DELETE — remove file from project
export async function DELETE(
  req: NextRequest,
  { params }: { params: { projectId: string; fileId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { projectId, fileId } = params

    const file = await studioGetItem<MediaFile>(TABLES.mediafiles, { projectId, fileId })
    if (!file || file.studioId !== auth.studioId) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }

    // Block deletion if selection is received or completed
    const project = await studioGetItem<StudioProject>(
      TABLES.projects,
      { studioId: file.studioId, projectId }
    )
    if (project && ['SELECTION_RECEIVED', 'COMPLETED'].includes(project.status)) {
      return NextResponse.json(
        { success: false, error: 'LOCKED', message: 'Cannot delete files after selection is received' },
        { status: 400 }
      )
    }

    // Delete S3 original and R2 preview (best effort)
    await deleteStudioS3Object(file.s3Key).catch((e) => console.error('[s3 delete]', e))
    if (file.r2PreviewKey) {
      // R2 deletion via S3-compatible API would go here — skipping for now, lifecycle handles cleanup
    }

    await studioDeleteItem(TABLES.mediafiles, { projectId, fileId })

    const now = new Date().toISOString()
    await studioUpdateItem(
      TABLES.projects,
      { studioId: file.studioId, projectId },
      'ADD totalFiles :neg SET updatedAt = :now',
      { ':neg': -1, ':now': now }
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[files DELETE]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
