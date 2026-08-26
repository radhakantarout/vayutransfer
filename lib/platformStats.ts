import { getItem, putItem } from '@/lib/aws/dynamodb'
import { classifyR2Orphans, type OrphanUserGroup } from '@/lib/r2Orphans'

const PLATFORM_STATS_TABLE = process.env.DYNAMO_PLATFORM_STATS_TABLE ?? 'vayu-platform-stats'
const STORAGE_STAT_KEY = 'r2-storage'
const ORPHANS_STAT_KEY = 'r2-orphans'
const USAGE_BY_WALLET_STAT_KEY = 'r2-usage-by-wallet'

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

export interface PlatformUsageByWalletStats {
  statKey: string
  usageByWallet: Record<string, number>
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

// Real per-user R2 usage (every byte attributable to a wallet, orphaned or
// not) — used by /admin/users to show genuine R2 usage next to the
// DynamoDB-derived "active transfers" estimate, so a per-user gap is
// visible the same way the Overview page's aggregate gap is.
export async function getCachedR2UsageByWallet(): Promise<PlatformUsageByWalletStats | null> {
  try {
    return await getItem<PlatformUsageByWalletStats>(PLATFORM_STATS_TABLE, { statKey: USAGE_BY_WALLET_STAT_KEY })
  } catch (err) {
    console.error('[platformStats] getCachedR2UsageByWallet failed (table may not exist yet)', err)
    return null
  }
}

// One full bucket listing (via classifyR2Orphans) produces the aggregate
// totals, the per-user orphan breakdown, AND the per-user real-usage map —
// cached as three rows so each reader only pays for what it needs.
export async function syncR2Stats(): Promise<PlatformStorageStats> {
  const { totalObjects, totalBytes, groups, realUsageByWallet } = await classifyR2Orphans()
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
  const usageRecord: PlatformUsageByWalletStats = {
    statKey: USAGE_BY_WALLET_STAT_KEY,
    usageByWallet: realUsageByWallet,
    lastSyncedAt: now,
  }

  await Promise.all([
    putItem(PLATFORM_STATS_TABLE, storageRecord),
    putItem(PLATFORM_STATS_TABLE, orphanRecord),
    putItem(PLATFORM_STATS_TABLE, usageRecord),
  ])

  return storageRecord
}

// Cheap, in-place patch of the three cached records after a batch of
// orphans has actually been deleted — deliberately NOT a call to
// syncR2Stats(), which re-scans the whole bucket + 3 full DynamoDB tables
// and is exactly the kind of work that blew past Vercel's serverless
// timeout when a single delete request tried to do it after clearing 272
// files. The caller (app/api/admin/storage-orphans/delete) already knows
// exactly what it removed, so this just applies that delta directly.
export async function applyOrphanCleanup(params: {
  updatedGroups: OrphanUserGroup[]
  totalBytesFreed: number
  totalCountFreed: number
  walletUsageDeltas: Record<string, number>
}): Promise<void> {
  const [orphans, storage, usage] = await Promise.all([
    getCachedR2Orphans(),
    getCachedR2Stats(),
    getCachedR2UsageByWallet(),
  ])

  const writes: Promise<void>[] = []

  if (orphans) {
    writes.push(putItem(PLATFORM_STATS_TABLE, {
      ...orphans,
      groups: params.updatedGroups,
      totalOrphanBytes: params.updatedGroups.reduce((s, g) => s + g.totalBytes, 0),
    }))
  }
  if (storage) {
    writes.push(putItem(PLATFORM_STATS_TABLE, {
      ...storage,
      totalObjects: Math.max(0, storage.totalObjects - params.totalCountFreed),
      totalBytes: Math.max(0, storage.totalBytes - params.totalBytesFreed),
    }))
  }
  if (usage && Object.keys(params.walletUsageDeltas).length > 0) {
    const nextUsage = { ...usage.usageByWallet }
    for (const [walletId, delta] of Object.entries(params.walletUsageDeltas)) {
      nextUsage[walletId] = Math.max(0, (nextUsage[walletId] ?? 0) - delta)
    }
    writes.push(putItem(PLATFORM_STATS_TABLE, { ...usage, usageByWallet: nextUsage }))
  }

  await Promise.all(writes)
}
