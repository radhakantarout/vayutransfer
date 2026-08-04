import { studioDeleteItem, studioQueryByPK, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import { deleteMediaObjects } from '@/lib/studio/storage'
import type { MediaFile, Selection } from '@/types/studio'

// Full cascade delete for a project: R2/S3 objects, mediafiles, selections,
// the project record itself, and the studio's projectCount/billableStorageBytes
// counters. Shared by the DELETE route (admin-triggered, immediate) and the
// scheduled-deletes cron (admin-scheduled, deferred). Returns what was
// actually freed so both callers can log one accurate audit entry without
// re-querying the mediafiles this function just deleted.
//
// Previously this only deleted the DynamoDB rows, never the actual R2/S3
// objects — every project ever deleted silently leaked its photos into
// storage forever (found via a real ~17GB gap between R2's actual bucket
// size and the tracked billableStorageBytes total). deleteMediaObjects is
// the same per-file helper the single-photo delete route already uses.
export async function deleteProjectCascade(studioId: string, projectId: string): Promise<{ photoCount: number; totalBytes: number }> {
  const [mediafiles, selections] = await Promise.all([
    studioQueryByPK<MediaFile>(TABLES.mediafiles, 'projectId', projectId),
    studioQueryByPK<Selection>(TABLES.selections, 'projectId', projectId),
  ])

  await Promise.all(mediafiles.map(f => deleteMediaObjects(f).catch((err) => console.error('[deleteProjectCascade] R2 delete failed', f.fileId, err))))

  await Promise.all([
    ...mediafiles.map(f => studioDeleteItem(TABLES.mediafiles, { projectId, fileId: f.fileId })),
    ...selections.map(s => studioDeleteItem(TABLES.selections, { projectId, fileId: s.fileId })),
  ])

  await studioDeleteItem(TABLES.projects, { studioId, projectId })

  const now = new Date().toISOString()
  const freedBytes = mediafiles.reduce((sum, f) => sum + (f.sizeBytes ?? 0), 0)
  await studioUpdateItem(
    TABLES.studios,
    { studioId },
    'ADD projectCount :neg, billableStorageBytes :negSize SET updatedAt = :now',
    { ':neg': -1, ':negSize': -freedBytes, ':now': now }
  )

  return { photoCount: mediafiles.length, totalBytes: freedBytes }
}
