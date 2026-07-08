import { studioGetItem, studioUpdateItem, TABLES } from './dynamodb'
import { FREE_STORAGE_BYTES, FREE_DOWNLOAD_BYTES } from '@/constants/studioPricing'
import type { Studio, StudioUsageMonth } from '@/types/studio'

export function currentMonthKey(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

// Called from every download path (admin, guest-QR, print-lab) at the moment
// a download URL is issued — the closest practical proxy we have for "bytes
// downloaded" without S3/CloudFront access-log ingestion. Fire-and-forget by
// callers; never blocks the actual download.
export async function recordDownload(studioId: string, bytes: number): Promise<void> {
  const month = currentMonthKey()
  const now = new Date().toISOString()
  await studioUpdateItem(
    TABLES.usage,
    { studioId, month },
    'ADD downloadBytes :b SET updatedAt = :now',
    { ':b': bytes, ':now': now }
  )
}

// A record can legitimately exist with only one of these two fields set —
// e.g. a download top-up purchased before any download happens this month
// writes via `ADD downloadTopupBytes`, which creates the item WITHOUT a
// downloadBytes attribute at all (not zero — genuinely absent). Normalize
// both fields here so every caller always gets real numbers.
export async function getMonthUsage(studioId: string, month = currentMonthKey()): Promise<StudioUsageMonth> {
  const existing = await studioGetItem<StudioUsageMonth>(TABLES.usage, { studioId, month })
  return {
    studioId,
    month,
    downloadBytes: existing?.downloadBytes ?? 0,
    downloadTopupBytes: existing?.downloadTopupBytes ?? 0,
    updatedAt: existing?.updatedAt ?? new Date().toISOString(),
  }
}

// Total currently-active storage grant (free baseline + any unexpired top-ups).
export function activeStorageGrantBytes(studio: Studio): number {
  const now = Date.now()
  const topupBytes = (studio.storageGrants ?? [])
    .filter((g) => g.source === 'topup' && (!g.expiresAt || new Date(g.expiresAt).getTime() > now))
    .reduce((sum, g) => sum + g.bytes, 0)
  return FREE_STORAGE_BYTES + topupBytes
}

// billableStorageBytes only ever decrements via best-effort ADD with no floor
// guard (kept simple, matches this codebase's existing totalFiles/projectCount
// decrement pattern) — clamp here rather than adding conditional-write
// complexity to every delete path.
export function currentStorageBytes(studio: Studio): number {
  return Math.max(0, studio.billableStorageBytes ?? 0)
}

export function isOverStorageQuota(studio: Studio): boolean {
  return currentStorageBytes(studio) > activeStorageGrantBytes(studio)
}

export function monthDownloadQuota(usage: StudioUsageMonth): number {
  return FREE_DOWNLOAD_BYTES + (usage.downloadTopupBytes ?? 0)
}

export function isOverDownloadQuota(usage: StudioUsageMonth): boolean {
  return usage.downloadBytes > monthDownloadQuota(usage)
}
