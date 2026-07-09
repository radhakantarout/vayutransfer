import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioQueryByPK, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import type { StudioProject, Selection, MediaFile } from '@/types/studio'

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

    const project = await studioGetItem<StudioProject>(TABLES.projects, { studioId, projectId })
    if (!project) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }
    if (!['SELECTION_RECEIVED', 'COMPLETED'].includes(project.status)) {
      return NextResponse.json(
        { success: false, error: 'NOT_READY', message: 'Client must submit selections before generating a print link' },
        { status: 400 }
      )
    }

    // Block if any selected photo is still flagged "needs editing" with no
    // edited version uploaded yet — otherwise the print gallery would silently
    // serve the original (unedited) file instead.
    const [allSelections, allFiles] = await Promise.all([
      studioQueryByPK<Selection>(TABLES.selections, 'projectId', projectId),
      studioQueryByPK<MediaFile>(TABLES.mediafiles, 'projectId', projectId),
    ])
    const fileMap = new Map(allFiles.map((f) => [f.fileId, f]))
    const pendingEdits = allSelections.filter((s) => {
      if (!s.isSelected || !s.editingRequired) return false
      const file = fileMap.get(s.fileId)
      return !file?.editedS3Key && !file?.editedR2Key
    })
    if (pendingEdits.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'EDITS_PENDING',
          message: `${pendingEdits.length} selected photo${pendingEdits.length > 1 ? 's are' : ' is'} still marked "Needs Editing" with no edited version uploaded yet. Upload the edited version (or download the original to edit) before sharing the print link.`,
          pendingCount: pendingEdits.length,
        },
        { status: 409 }
      )
    }

    const expirySeconds = parseInt(process.env.PRINT_LINK_EXPIRY_SECONDS ?? '604800', 10)
    const token    = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + expirySeconds * 1000).toISOString()
    const now      = new Date().toISOString()

    await studioUpdateItem(
      TABLES.projects,
      { studioId, projectId },
      'SET printShareToken = :token, printShareExpiresAt = :exp, updatedAt = :now, #s = :completed',
      { ':token': token, ':exp': expiresAt, ':now': now, ':completed': 'COMPLETED' },
      { '#s': 'status' }
    )

    const studioUrl = process.env.NEXT_PUBLIC_STUDIO_URL ?? 'https://studio.vayutransfer.com'
    const printUrl  = `${studioUrl}/studio/print/${token}`

    return NextResponse.json({ success: true, data: { printUrl, expiresAt } })
  } catch (err) {
    console.error('[print-link POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
