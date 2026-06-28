import { NextRequest, NextResponse } from 'next/server'
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioQueryByPK, studioGetItem, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import type { Selection, StudioProject } from '@/types/studio'

const lambda = new LambdaClient({ region: process.env.AWS_REGION ?? 'ap-south-1' })

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || auth.role !== 'CLIENT') {
      return NextResponse.json({ success: false, error: 'UNAUTHENTICATED' }, { status: 401 })
    }

    const projectId = auth.projectId!
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

    // Notify studio async (fire-and-forget)
    if (process.env.NOTIFY_LAMBDA_ARN) {
      lambda.send(new InvokeCommand({
        FunctionName: process.env.NOTIFY_LAMBDA_ARN,
        InvocationType: 'Event',
        Payload: Buffer.from(JSON.stringify({
          event: 'SELECTION_SUBMITTED',
          projectId,
          studioId,
          clientName:       project.clientName,
          clientEmail:      project.clientEmail,
          selectedCount:    selected.length,
          editingCount,
          submittedAt:      now,
        })),
      })).catch((err: unknown) => console.error('[notify-lambda invoke]', err))
    } else {
      console.log(`[DEV] Selection submitted — project: ${projectId}, selected: ${selected.length}`)
    }

    return NextResponse.json({ success: true, data: { selectedCount: selected.length, submittedAt } })
  } catch (err) {
    console.error('[selections submit POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
