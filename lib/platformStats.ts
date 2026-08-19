import { getItem, putItem } from '@/lib/aws/dynamodb'
import { listR2BucketStats } from '@/lib/aws/r2'

const PLATFORM_STATS_TABLE = process.env.DYNAMO_PLATFORM_STATS_TABLE ?? 'vayu-platform-stats'
const STAT_KEY = 'r2-storage'

export interface PlatformStorageStats {
  statKey: string
  totalObjects: number
  totalBytes: number
  lastSyncedAt: string
}

// Cached, not live — a full bucket listing on every dashboard load doesn't
// scale. Read by app/api/admin/stats, written by app/api/admin/r2-sync's
// "Sync Now" button (or a future periodic cron, same underlying call).
// Swallows a missing table (ResourceNotFoundException) so the rest of the
// Overview dashboard still loads before vayu-platform-stats is provisioned
// — the UI already has a "Not synced yet" state for a null result.
export async function getCachedR2Stats(): Promise<PlatformStorageStats | null> {
  try {
    return await getItem<PlatformStorageStats>(PLATFORM_STATS_TABLE, { statKey: STAT_KEY })
  } catch (err) {
    console.error('[platformStats] getCachedR2Stats failed (table may not exist yet)', err)
    return null
  }
}

export async function syncR2Stats(): Promise<PlatformStorageStats> {
  const { totalObjects, totalBytes } = await listR2BucketStats()
  const record: PlatformStorageStats = {
    statKey: STAT_KEY,
    totalObjects,
    totalBytes,
    lastSyncedAt: new Date().toISOString(),
  }
  await putItem(PLATFORM_STATS_TABLE, record)
  return record
}
