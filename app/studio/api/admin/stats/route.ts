import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, TABLES } from '@/lib/studio/dynamodb'
import {
  activeStorageGrantBytes, currentStorageBytes, isOverStorageQuota, storageUsagePct,
  aiCreditsQuota, aiCreditsUsed, isOverAiQuota, aiUsagePct, syncBillingCycle,
  planStorageBytes, planAiCredits,
} from '@/lib/studio/quota'
import { DEFAULT_RETENTION_GRACE_DAYS, GB } from '@/constants/studioPricing'
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
    let studio = await studioGetItem<Studio>(TABLES.studios, { studioId })
    if (!studio) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }
    // Self-heals the billing cycle (backfills a missing one, or rolls it
    // forward + resets AI credits if the daily cron hasn't run yet) so this
    // route's numbers are never stale even if the cron is delayed.
    studio = await syncBillingCycle(studio)

    return NextResponse.json({
      success: true,
      data: {
        studioName:       studio.name,
        storageUsedBytes: studio.storageUsedBytes,
        plan:             studio.plan,
        billing: {
          billingPlanId: studio.billingPlanId ?? 'free',
          // Goes through the same live-constant-for-Free logic as every
          // other quota number (see lib/studio/quota.ts) — never a stale
          // per-studio snapshot for a Free studio.
          planStorageGB: planStorageBytes(studio) / GB,
          planAiCreditsPerMonth: planAiCredits(studio),
          billingCycle: studio.billingCycle ?? 'monthly',
          billingPeriodStart: studio.billingPeriodStart ?? null,
          billingPeriodEnd: studio.billingPeriodEnd ?? null,
          planRenewsAt: studio.planRenewsAt ?? null,

          storageUsedBytes:  currentStorageBytes(studio),
          storageGrantBytes: activeStorageGrantBytes(studio),
          storageOverQuota:  isOverStorageQuota(studio),
          storageUsagePct:   storageUsagePct(studio),
          storageOverageStartedAt: studio.storageOverageStartedAt ?? null,
          dataRetentionGraceDays: studio.dataRetentionGraceDays ?? DEFAULT_RETENTION_GRACE_DAYS,

          // Persisted, incremented only by the indexing Lambda — never
          // decremented on delete, so this always reflects what was
          // actually billed by Rekognition, not just what still exists.
          aiSearchCreditsUsed: aiCreditsUsed(studio),
          aiSearchCreditsTotal: aiCreditsQuota(studio),
          aiSearchOverQuota: isOverAiQuota(studio),
          aiSearchUsagePct: aiUsagePct(studio),
        },
      },
    })
  } catch (err) {
    console.error('[admin/stats GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
