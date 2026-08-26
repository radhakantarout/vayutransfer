import { getItem, putItem } from '@/lib/aws/dynamodb'
import { classifyR2Orphans, type OrphanUserGroup } from '@/lib/r2Orphans'

const PLATFORM_STATS_TABLE = process.env.DYNAMO_PLATFORM_STATS_TABLE ?? 'vayu-platform-stats'
const STORAGE_STAT_KEY = 'r2-storage'
const ORPHANS_STAT_KEY = 'r2-orphans'

export interface PlatformStorageStats {
  statKey: string
  totalObjects: number
  totalBytes: number
  lastSyncedAt: string
}

export interface PlatformOrphanStats {
  statKey: string
  groups: OrphanUserGroup[]
  totalOrphanBytes: number
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
    return await getItem<PlatformStorageStats>(PLATFORM_STATS_TABLE, { statKey: STORAGE_STAT_KEY })
  } catch (err) {
    console.error('[platformStats] getCachedR2Stats failed (table may not exist yet)', err)
    return null
  }
}

export async function getCachedR2Orphans(): Promise<PlatformOrphanStats | null> {
  try {
    return await getItem<PlatformOrphanStats>(PLATFORM_STATS_TABLE, { statKey: ORPHANS_STAT_KEY })
  } catch (err) {
    console.error('[platformStats] getCachedR2Orphans failed (table may not exist yet)', err)
    return null
  }
}

// One full bucket listing (via classifyR2Orphans) produces both the
// aggregate totals and the per-user orphan breakdown, cached as two rows so
// app/api/admin/stats can keep reading just the totals cheaply while
// app/api/admin/storage-orphans reads the fuller breakdown separately.
export async function syncR2Stats(): Promise<PlatformStorageStats> {
  const { totalObjects, totalBytes, groups } = await classifyR2Orphans()
  const now = new Date().toISOString()

  const storageRecord: PlatformStorageStats = {
    statKey: STORAGE_STAT_KEY,
    totalObjects,
    totalBytes,
    lastSyncedAt: now,
  }
  const orphanRecord: PlatformOrphanStats = {
    statKey: ORPHANS_STAT_KEY,
    groups,
    totalOrphanBytes: groups.reduce((s, g) => s + g.totalBytes, 0),
    lastSyncedAt: now,
  }

  await Promise.all([
    putItem(PLATFORM_STATS_TABLE, storageRecord),
    putItem(PLATFORM_STATS_TABLE, orphanRecord),
  ])

  return storageRecord
}
