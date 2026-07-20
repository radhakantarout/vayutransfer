import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, TABLES } from '@/lib/studio/dynamodb'
import { activeStorageGrantBytes, currentStorageBytes, getMonthUsage, isOverStorageQuota, monthDownloadQuota } from '@/lib/studio/usage'
import { DEFAULT_RETENTION_GRACE_DAYS, FREE_AI_SEARCH_CREDITS } from '@/constants/studioPricing'
import type { Studio } from '@/types/studio'

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }
    const studioId = auth.studioId
    if (!studioId) {
      return NextResponse.json({ success: false, error: 'MISSING_STUDIO_ID' }, { status: 400 })
    }
    const studio = await studioGetItem<Studio>(TABLES.studios, { studioId })
    if (!studio) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }

    const monthUsage = await getMonthUsage(studioId)

    return NextResponse.json({
      success: true,
      data: {
        studioName:       studio.name,
        storageUsedBytes: studio.storageUsedBytes,
        plan:             studio.plan,
        billing: {
          storageUsedBytes:  currentStorageBytes(studio),
          storageGrantBytes: activeStorageGrantBytes(studio),
          storageOverQuota:  isOverStorageQuota(studio),
          storageOverageStartedAt: studio.storageOverageStartedAt ?? null,
          dataRetentionGraceDays: studio.dataRetentionGraceDays ?? DEFAULT_RETENTION_GRACE_DAYS,
          downloadUsedBytes: monthUsage.downloadBytes,
          downloadQuotaBytes: monthDownloadQuota(monthUsage),
          // Persisted, incremented only by the indexing Lambda — never
          // decremented on delete, so this always reflects what was
          // actually billed by Rekognition, not just what still exists.
          aiSearchCreditsUsed: studio.aiSearchCreditsUsed ?? 0,
          aiSearchCreditsTotal: studio.aiSearchCreditsTotal ?? FREE_AI_SEARCH_CREDITS,
        },
      },
    })
  } catch (err) {
    console.error('[admin/stats GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
