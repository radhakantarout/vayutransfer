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

    const { expiryDays = 30, selectionMin, selectionMax, includedFileIds } = await req.json().catch(() => ({}))
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

    // Validate includedFileIds when provided
    const hasFilter = Array.isArray(includedFileIds) && includedFileIds.length > 0
    if (Array.isArray(includedFileIds) && includedFileIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'NO_SELECTION', message: 'Please select at least one photo to share' },
        { status: 400 }
      )
    }

    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString()
    const now = new Date().toISOString()

    const hasRange = typeof selectionMin === 'number' && typeof selectionMax === 'number' && selectionMax > 0

    let updateExpr = 'SET clientShareToken = :token, clientShareExpiresAt = :exp, updatedAt = :now, #s = :active'
    const exprValues: Record<string, unknown> = { ':token': token, ':exp': expiresAt, ':now': now, ':active': 'ACTIVE' }
    if (hasRange)   { updateExpr += ', selectionMin = :smin, selectionMax = :smax'; exprValues[':smin'] = selectionMin; exprValues[':smax'] = selectionMax }
    if (hasFilter)  { updateExpr += ', sharedFileIds = :sfids'; exprValues[':sfids'] = includedFileIds }
    else            { updateExpr += ' REMOVE sharedFileIds' }

    await studioUpdateItem(TABLES.projects, { studioId, projectId }, updateExpr, exprValues, { '#s': 'status' })

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
