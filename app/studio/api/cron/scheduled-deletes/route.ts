import { NextRequest, NextResponse } from 'next/server'
import { studioScanTable, TABLES } from '@/lib/studio/dynamodb'
import { deleteProjectCascade } from '@/lib/studio/projectDelete'
import { logAuditEvent } from '@/lib/studio/auditLog'
import type { StudioProject } from '@/types/studio'

// Same auth pattern as cron/storage-check — Vercel sends
// `Authorization: Bearer $CRON_SECRET` automatically on scheduled invocations.
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization')
  const query = req.nextUrl.searchParams.get('secret')
  return auth === `Bearer ${secret}` || query === secret
}

// Sweeps admin-scheduled project deletions (set via the project "⋯" menu's
// Delete popup) that are past due. Cancel is just clearing scheduledDeleteAt,
// so anything still set here is genuinely meant to go.
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
  }

  const projects = await studioScanTable<StudioProject>(TABLES.projects)
  const now = Date.now()
  const dueProjects = projects.filter(p => p.scheduledDeleteAt && new Date(p.scheduledDeleteAt).getTime() <= now)

  let deleted = 0
  const failed: string[] = []
  for (const project of dueProjects) {
    try {
      const { photoCount, totalBytes } = await deleteProjectCascade(project.studioId, project.projectId)
      logAuditEvent({
        studioId: project.studioId,
        actorId: 'system-cron',
        actorRole: 'SYSTEM',
        action: 'DELETE_PROJECT',
        targetType: 'PROJECT',
        targetId: project.projectId,
        metadata: {
          clientName: project.clientName,
          eventType: project.eventType,
          eventDate: project.eventDate,
          photoCount,
          totalBytes,
          scheduledDeleteAt: project.scheduledDeleteAt,
          trigger: 'scheduled-deletes-cron',
        },
      })
      deleted++
    } catch (err) {
      console.error('[scheduled-deletes] failed to delete', project.projectId, err)
      failed.push(project.projectId)
    }
  }

  return NextResponse.json({ success: true, data: { checked: projects.length, due: dueProjects.length, deleted, failed } })
}
