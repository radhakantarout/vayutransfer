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
    if (project.status === 'COMPLETED') {
      return NextResponse.json(
        { success: false, error: 'ALREADY_SUBMITTED', message: 'Selections already submitted' },
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

    await studioUpdateItem(
      TABLES.projects,
      { studioId, projectId },
      'SET #s = :status, selectedFilesCount = :sel, editingRequiredCount = :edit, commentsCount = :comments, selectionSubmittedAt = :now, updatedAt = :now',
      {
        ':status':   'SELECTION_RECEIVED',
        ':sel':      selected.length,
        ':edit':     editingCount,
        ':comments': commentCount,
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

    return NextResponse.json({ success: true, data: { selectedCount: selected.length } })
  } catch (err) {
    console.error('[selections submit POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
