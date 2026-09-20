import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, TABLES } from '@/lib/studio/dynamodb'
import { getStudioR2SignedDownloadUrl } from '@/lib/studio/r2'
import { resolveProjectForViewer, isOwnerOrApprovedMember } from '@/lib/studio/galleryMembers'
import { aiImageJobProgress } from '@/lib/studio/aiImageProgress'
import type { StudioAiImage } from '@/types/studio'

export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string; imageId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth?.studioId) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })

    const { projectId, imageId } = params
    const resolved = await resolveProjectForViewer(auth, projectId)
    if (!resolved || !isOwnerOrApprovedMember(auth.studioId, resolved.project, resolved.member)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const image = await studioGetItem<StudioAiImage>(TABLES.aiImages, { imageId })
    if (!image || image.projectId !== projectId || image.studioId !== resolved.project.studioId) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }

    const stagedUrls = image.status === 'completed' && image.outputR2Keys
      ? await Promise.all(image.outputR2Keys.map((key, i) => getStudioR2SignedDownloadUrl(key, `ai-image-${imageId}-${i}.jpg`, 3600)))
      : []
    const progress = image.status === 'generating' ? await aiImageJobProgress(image.jobId) : null

    return NextResponse.json({
      success: true,
      data: { status: image.status, stagedUrls, errorMessage: image.errorMessage ?? null, progress },
    })
  } catch (err) {
    console.error('[moments ai-image status GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
