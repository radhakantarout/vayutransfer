import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioQueryByPK, studioGetItem, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import { getStudioAdminEmails } from '@/lib/studio/notify'
import { sendSelectionSubmittedEmail } from '@/lib/aws/ses'
import type { Selection, StudioProject } from '@/types/studio'

async function resolveProjectId(auth: { projectId?: string; studioId?: string }, requestedId?: string): Promise<string | null> {
  if (!requestedId) return auth.projectId ?? null
  const [entry, requested] = await Promise.all([
    studioGetItem<StudioProject>(TABLES.projects, { studioId: auth.studioId!, projectId: auth.projectId! }),
    studioGetItem<StudioProject>(TABLES.projects, { studioId: auth.studioId!, projectId: requestedId }),
  ])
  if (!entry || !requested || entry.clientEmail !== requested.clientEmail) return null
  return requestedId
}

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || auth.role !== 'CLIENT') {
      return NextResponse.json({ success: false, error: 'UNAUTHENTICATED' }, { status: 401 })
    }

    const { projectId: reqProjectId } = await req.json().catch(() => ({}))
    const resolvedId = await resolveProjectId(auth, reqProjectId)
    if (!resolvedId) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }
    const projectId = resolvedId
    const studioId  = auth.studioId!

    const project = await studioGetItem<StudioProject>(TABLES.projects, { studioId, projectId })
    if (!project) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }

    // Hard block — photographer has finalised the project
    if (project.status === 'COMPLETED') {
      return NextResponse.json(
        { success: false, error: 'PROJECT_COMPLETED', message: 'Your photographer has already completed your project.' },
        { status: 400 }
      )
    }

    // Soft block — first submission exists but 12-hour resubmit window has closed
    const RESUBMIT_WINDOW_MS = 12 * 60 * 60 * 1000
    const firstSubmittedAt = (project as StudioProject & { selectionSubmittedAt?: string }).selectionSubmittedAt
    if (firstSubmittedAt && Date.now() - new Date(firstSubmittedAt).getTime() > RESUBMIT_WINDOW_MS) {
      return NextResponse.json(
        { success: false, error: 'RESUBMIT_WINDOW_CLOSED', message: 'The 12-hour resubmit window has closed. Contact your photographer to make changes.' },
        { status: 400 }
      )
    }

    const allSelections = await studioQueryByPK<Selection>(TABLES.selections, 'projectId', projectId)
    const selected = allSelections.filter((s) => s.isSelected)

    if (selected.length === 0) {
      return NextResponse.json(
        { success: false, error: 'NO_SELECTIONS', message: 'Please select at least one photo' },
        { status: 400 }
      )
    }

    const editingCount  = selected.filter((s) => s.editingRequired).length
    const commentCount  = allSelections.filter((s) => s.comment && s.comment.trim()).length
    const now = new Date().toISOString()
    // Preserve the original submission timestamp so the 12h window is anchored to first submit
    const submittedAt = firstSubmittedAt ?? now

    await studioUpdateItem(
      TABLES.projects,
      { studioId, projectId },
      'SET #s = :status, selectedFilesCount = :sel, editingRequiredCount = :edit, commentsCount = :comments, selectionSubmittedAt = :sat, updatedAt = :now',
      {
        ':status':   'SELECTION_RECEIVED',
        ':sel':      selected.length,
        ':edit':     editingCount,
        ':comments': commentCount,
        ':sat':      submittedAt,
        ':now':      now,
      },
      { '#s': 'status' }
    )

    // Notify studio admins async (fire-and-forget)
    const dashboardUrl = `${req.nextUrl.origin}/studio/dashboard/projects/${projectId}/selections`
    getStudioAdminEmails(studioId)
      .then((emails) => emails.forEach((to) =>
        sendSelectionSubmittedEmail(
          to, project.clientName, project.eventType,
          selected.length, editingCount, commentCount, dashboardUrl
        ).catch((err) => console.error('[selection email]', err))
      ))
      .catch((err) => console.error('[selection email — admin lookup]', err))

    return NextResponse.json({ success: true, data: { selectedCount: selected.length, submittedAt } })
  } catch (err) {
    console.error('[selections submit POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
