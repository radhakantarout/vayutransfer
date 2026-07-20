import { studioDeleteItem, studioQueryByPK, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import type { MediaFile, Selection } from '@/types/studio'

// Full cascade delete for a project: mediafiles, selections, the project
// record itself, and the studio's projectCount/billableStorageBytes counters.
// Shared by the DELETE route (admin-triggered, immediate) and the
// scheduled-deletes cron (admin-scheduled, deferred). Returns what was
// actually freed so both callers can log one accurate audit entry without
// re-querying the mediafiles this function just deleted.
export async function deleteProjectCascade(studioId: string, projectId: string): Promise<{ photoCount: number; totalBytes: number }> {
  const [mediafiles, selections] = await Promise.all([
    studioQueryByPK<MediaFile>(TABLES.mediafiles, 'projectId', projectId),
    studioQueryByPK<Selection>(TABLES.selections, 'projectId', projectId),
  ])

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
