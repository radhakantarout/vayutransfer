import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import { sendGalleryShareEmail } from '@/lib/aws/ses'
import type { StudioProject, Studio } from '@/types/studio'

export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { expiryDays = 30, selectionMin, selectionMax } = await req.json().catch(() => ({}))
    const { projectId } = params
    const studioId = auth.studioId!

    const [project, studio] = await Promise.all([
      studioGetItem<StudioProject>(TABLES.projects, { studioId, projectId }),
      studioGetItem<Studio>(TABLES.studios, { studioId }),
    ])

    if (!project) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }
    if (project.totalFiles === 0) {
      return NextResponse.json(
        { success: false, error: 'NO_FILES', message: 'Upload at least one photo before generating a share link' },
        { status: 400 }
      )
    }

    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString()
    const now = new Date().toISOString()

    const hasRange = typeof selectionMin === 'number' && typeof selectionMax === 'number' && selectionMax > 0
    await studioUpdateItem(
      TABLES.projects,
      { studioId, projectId },
      hasRange
        ? 'SET clientShareToken = :token, clientShareExpiresAt = :exp, updatedAt = :now, #s = :active, selectionMin = :smin, selectionMax = :smax'
        : 'SET clientShareToken = :token, clientShareExpiresAt = :exp, updatedAt = :now, #s = :active',
      hasRange
        ? { ':token': token, ':exp': expiresAt, ':now': now, ':active': 'ACTIVE', ':smin': selectionMin, ':smax': selectionMax }
        : { ':token': token, ':exp': expiresAt, ':now': now, ':active': 'ACTIVE' },
      { '#s': 'status' }
    )

    const shareUrl = `${req.nextUrl.origin}/studio/gallery/${token}`

    // Send email to client
    if (project.clientEmail) {
      sendGalleryShareEmail(
        project.clientEmail,
        project.clientName,
        studio?.name ?? 'Your photographer',
        project.eventType,
        project.eventDate,
        shareUrl,
        expiryDays
      ).catch((err) => console.error('[share-link] email send failed', err))
    }

    return NextResponse.json({ success: true, data: { shareUrl, expiresAt } })
  } catch (err) {
    console.error('[share-link]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
