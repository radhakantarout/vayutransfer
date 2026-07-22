import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, TABLES } from '@/lib/studio/dynamodb'
import { sendGalleryShareEmail } from '@/lib/aws/ses'
import type { StudioProject, Studio } from '@/types/studio'

// Explicit "Send" action from the Quick Share modal — re-notifies the
// client about the link that's already active on this project. Never
// rotates the token/password; the admin must Generate first.
export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { projectId } = params
    const studioId = auth.studioId!

    const [project, studio] = await Promise.all([
      studioGetItem<StudioProject>(TABLES.projects, { studioId, projectId }),
      studioGetItem<Studio>(TABLES.studios, { studioId }),
    ])

    if (!project) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    if (!project.clientShareToken || !project.clientShareExpiresAt || new Date(project.clientShareExpiresAt) < new Date()) {
      return NextResponse.json({ success: false, error: 'NO_ACTIVE_LINK', message: 'Generate a link before sending it' }, { status: 400 })
    }
    if (!project.clientEmail) {
      return NextResponse.json({ success: false, error: 'NO_CLIENT_EMAIL', message: 'This client has no email on file' }, { status: 400 })
    }

    const shareUrl = `${req.nextUrl.origin}/studio/gallery/${project.clientShareToken}`
    const expiryDays = Math.max(1, Math.ceil(
      (new Date(project.clientShareExpiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    ))

    await sendGalleryShareEmail(
      project.clientEmail,
      project.clientName,
      studio?.name ?? 'Your photographer',
      project.eventType,
      project.eventDate,
      shareUrl,
      expiryDays
    )

    return NextResponse.json({ success: true, data: { sentTo: project.clientEmail } })
  } catch (err) {
    console.error('[share-link/email]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
