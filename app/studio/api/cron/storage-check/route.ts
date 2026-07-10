import { NextRequest, NextResponse } from 'next/server'
import {
  studioScanTable, studioQueryByPK, studioUpdateItem, studioDeleteItem, TABLES,
} from '@/lib/studio/dynamodb'
import { deleteMediaObjects } from '@/lib/studio/storage'
import { deleteStudioR2Object } from '@/lib/studio/r2'
import { getStudioAdminEmails } from '@/lib/studio/notify'
import { sendStorageOverageReminderEmail } from '@/lib/aws/ses'
import { activeStorageGrantBytes, currentStorageBytes, isOverStorageQuota } from '@/lib/studio/usage'
import { GB, DEFAULT_RETENTION_GRACE_DAYS } from '@/constants/studioPricing'
import type { Studio, StudioProject, MediaFile, Selection, StudioTransfer } from '@/types/studio'

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

    await Promise.all(mediafiles.map((f) => deleteMediaObjects(f)))
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

// Raw File Transfers store large objects outside the mediafiles/selections
// world the function above knows about — without this, reclaim would keep
// deleting a studio's oldest gallery projects forever while multi-GB
// transfer blobs sit untouched. Only ever deletes non-imported transfers
// (importedToGallery:true means a MediaFile now owns that R2 object).
async function deleteOldestTransfersUntilUnderQuota(
  transfers: StudioTransfer[],
  remaining: number,
  grant: number
): Promise<number> {
  const eligible = transfers
    .filter((t) => !t.importedToGallery && t.status === 'READY' && t.r2Key && t.sizeBytes)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  let deletedBytes = 0
  for (const t of eligible) {
    if (remaining <= grant) break
    await deleteStudioR2Object(t.r2Key!).catch((e) => console.error('[storage-check] transfer r2 delete', e))
    await studioDeleteItem(TABLES.transfers, { projectId: t.projectId, transferId: t.transferId })
    remaining -= t.sizeBytes!
    deletedBytes += t.sizeBytes!
  }
  return deletedBytes
}

// Expired, never-imported transfers are billable dead weight even for a
// studio that's nowhere near its quota — "expired" should mean the link
// stops working AND storage stops being billed, not just the former.
// Returns bytes freed per studio so the caller can adjust its in-memory
// quota check — the DB write happens here, but the studios array was
// already loaded before this ran, so it doesn't see the decrement itself.
async function sweepExpiredTransfers(transfers: StudioTransfer[]): Promise<{ freedByStudio: Map<string, number>; count: number }> {
  const now = new Date()
  const expired = transfers.filter((t) => !t.importedToGallery && t.status === 'READY' && new Date(t.shareExpiresAt) < now)

  const freedByStudio = new Map<string, number>()
  for (const t of expired) {
    if (t.r2Key) await deleteStudioR2Object(t.r2Key).catch((e) => console.error('[storage-check] expired transfer r2 delete', e))
    await studioDeleteItem(TABLES.transfers, { projectId: t.projectId, transferId: t.transferId })
    if (t.sizeBytes) {
      await studioUpdateItem(
        TABLES.studios, { studioId: t.studioId },
        'ADD billableStorageBytes :neg SET updatedAt = :now',
        { ':neg': -t.sizeBytes, ':now': new Date().toISOString() }
      )
      freedByStudio.set(t.studioId, (freedByStudio.get(t.studioId) ?? 0) + t.sizeBytes)
    }
  }
  return { freedByStudio, count: expired.length }
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
  }

  const studios = await studioScanTable<Studio>(TABLES.studios)
  const allTransfers = await studioScanTable<StudioTransfer>(TABLES.transfers)
  const transfersByStudio = new Map<string, StudioTransfer[]>()
  for (const t of allTransfers) {
    const list = transfersByStudio.get(t.studioId) ?? []
    list.push(t)
    transfersByStudio.set(t.studioId, list)
  }

  // Applied to the in-memory studios array below so quota checks reflect
  // what was just freed — the DB write already happened inside the sweep,
  // this only keeps this function's own view of billableStorageBytes honest.
  const expiredSwept = await sweepExpiredTransfers(allTransfers)
  for (const studio of studios) {
    const freed = expiredSwept.freedByStudio.get(studio.studioId)
    if (freed) studio.billableStorageBytes = Math.max(0, (studio.billableStorageBytes ?? 0) - freed)
  }

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
      // Grace period over — delete the minimum needed, oldest projects first,
      // then oldest non-imported transfers if projects alone weren't enough
      // (transfers can be large enough on their own to drive the overage).
      const deletedFromProjects = await deleteOldestProjectsUntilUnderQuota(studio)
      const grant = activeStorageGrantBytes(studio)
      let remaining = currentStorageBytes(studio) - deletedFromProjects
      let deletedFromTransfers = 0
      if (remaining > grant) {
        deletedFromTransfers = await deleteOldestTransfersUntilUnderQuota(
          transfersByStudio.get(studio.studioId) ?? [], remaining, grant
        )
        remaining -= deletedFromTransfers
      }
      const deleted = deletedFromProjects + deletedFromTransfers
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

  return NextResponse.json({ success: true, data: { checked, reminded, deletedFrom, expiredTransfersSwept: expiredSwept.count } })
}
