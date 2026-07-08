import { NextRequest, NextResponse } from 'next/server'
import {
  studioScanTable, studioQueryByPK, studioUpdateItem, studioDeleteItem, TABLES,
} from '@/lib/studio/dynamodb'
import { deleteStudioS3Object } from '@/lib/studio/s3'
import { getStudioAdminEmails } from '@/lib/studio/notify'
import { sendStorageOverageReminderEmail } from '@/lib/aws/ses'
import { activeStorageGrantBytes, currentStorageBytes, isOverStorageQuota } from '@/lib/studio/usage'
import { GB, DEFAULT_RETENTION_GRACE_DAYS } from '@/constants/studioPricing'
import type { Studio, StudioProject, MediaFile, Selection } from '@/types/studio'

// Vercel automatically sends `Authorization: Bearer $CRON_SECRET` on every
// scheduled invocation as long as a project env var literally named
// CRON_SECRET is set — no header config needed in vercel.json. The query-param
// fallback is only for manually triggering this route yourself while testing
// (e.g. to verify the reminder/delete logic without waiting for the daily
// schedule) — never put the actual secret value in any committed file.
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization')
  const query = req.nextUrl.searchParams.get('secret')
  return auth === `Bearer ${secret}` || query === secret
}

// Deletes the oldest projects first, only enough to bring the studio back
// at-or-under its active storage grant. Mirrors the cascade already used by
// DELETE /studio/api/admin/projects/[projectId] (S3 + mediafiles + selections
// + project record + billableStorageBytes decrement).
async function deleteOldestProjectsUntilUnderQuota(studio: Studio): Promise<number> {
  const projects = await studioQueryByPK<StudioProject>(TABLES.projects, 'studioId', studio.studioId)
  projects.sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  const grant = activeStorageGrantBytes(studio)
  let remaining = currentStorageBytes(studio)
  let deletedBytes = 0

  for (const project of projects) {
    if (remaining <= grant) break

    const [mediafiles, selections] = await Promise.all([
      studioQueryByPK<MediaFile>(TABLES.mediafiles, 'projectId', project.projectId),
      studioQueryByPK<Selection>(TABLES.selections, 'projectId', project.projectId),
    ])

    await Promise.all(mediafiles.map((f) => deleteStudioS3Object(f.s3Key).catch((e) => console.error('[storage-check] s3 delete', e))))
    await Promise.all([
      ...mediafiles.map((f) => studioDeleteItem(TABLES.mediafiles, { projectId: project.projectId, fileId: f.fileId })),
      ...selections.map((s) => studioDeleteItem(TABLES.selections, { projectId: project.projectId, fileId: s.fileId })),
    ])
    await studioDeleteItem(TABLES.projects, { studioId: studio.studioId, projectId: project.projectId })

    const projectBytes = mediafiles.reduce((sum, f) => sum + (f.sizeBytes ?? 0), 0)
    remaining -= projectBytes
    deletedBytes += projectBytes
  }

  return deletedBytes
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
  }

  const studios = await studioScanTable<Studio>(TABLES.studios)
  const now = Date.now()
  let checked = 0, reminded = 0, deletedFrom = 0

  for (const studio of studios) {
    checked++
    const overQuota = isOverStorageQuota(studio)

    if (!overQuota) {
      if (studio.storageOverageStartedAt) {
        await studioUpdateItem(
          TABLES.studios, { studioId: studio.studioId },
          'REMOVE storageOverageStartedAt, storageReminderCount SET updatedAt = :now',
          { ':now': new Date().toISOString() }
        )
      }
      continue
    }

    const graceDays = studio.dataRetentionGraceDays ?? DEFAULT_RETENTION_GRACE_DAYS
    const overageGB = ((currentStorageBytes(studio) - activeStorageGrantBytes(studio)) / GB).toFixed(1)

    if (!studio.storageOverageStartedAt) {
      // First time seeing this studio over quota — start the countdown, send reminder #1 now.
      await studioUpdateItem(
        TABLES.studios, { studioId: studio.studioId },
        'SET storageOverageStartedAt = :now, storageReminderCount = :one, updatedAt = :now',
        { ':now': new Date().toISOString(), ':one': 1 }
      )
      const emails = await getStudioAdminEmails(studio.studioId)
      await Promise.all(emails.map((to) =>
        sendStorageOverageReminderEmail(to, studio.name, overageGB, graceDays, 1).catch((e) => console.error('[storage-check] email', e))
      ))
      reminded++
      continue
    }

    const daysElapsed = (now - new Date(studio.storageOverageStartedAt).getTime()) / (24 * 60 * 60 * 1000)
    const reminderCount = studio.storageReminderCount ?? 1
    const daysRemaining = Math.max(0, Math.ceil(graceDays - daysElapsed))

    if (daysElapsed >= graceDays) {
      // Grace period over — delete the minimum needed, oldest projects first.
      const deleted = await deleteOldestProjectsUntilUnderQuota(studio)
      if (deleted > 0) {
        await studioUpdateItem(
          TABLES.studios, { studioId: studio.studioId },
          'ADD billableStorageBytes :neg REMOVE storageOverageStartedAt, storageReminderCount SET updatedAt = :now',
          { ':neg': -deleted, ':now': new Date().toISOString() }
        )
        deletedFrom++
      }
      continue
    }

    if (reminderCount < 2 && daysElapsed >= graceDays * 0.5) {
      const emails = await getStudioAdminEmails(studio.studioId)
      await Promise.all(emails.map((to) =>
        sendStorageOverageReminderEmail(to, studio.name, overageGB, daysRemaining, 2).catch((e) => console.error('[storage-check] email', e))
      ))
      await studioUpdateItem(TABLES.studios, { studioId: studio.studioId }, 'SET storageReminderCount = :two, updatedAt = :now', { ':two': 2, ':now': new Date().toISOString() })
      reminded++
    } else if (reminderCount < 3 && daysElapsed >= graceDays * 0.9) {
      const emails = await getStudioAdminEmails(studio.studioId)
      await Promise.all(emails.map((to) =>
        sendStorageOverageReminderEmail(to, studio.name, overageGB, daysRemaining, 3).catch((e) => console.error('[storage-check] email', e))
      ))
      await studioUpdateItem(TABLES.studios, { studioId: studio.studioId }, 'SET storageReminderCount = :three, updatedAt = :now', { ':three': 3, ':now': new Date().toISOString() })
      reminded++
    }
  }

  return NextResponse.json({ success: true, data: { checked, reminded, deletedFrom } })
}
