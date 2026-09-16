import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { getPricingConfig, savePricingConfig, validatePricingConfigPatch, DEFAULT_PRICING_CONFIG } from '@/lib/pricingConfig'
import { logAuditEvent } from '@/lib/studio/auditLog'
import type { PricingConfig } from '@/types/pricingConfig'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await verifyStudioJWT(req)
  if (!auth || auth.role !== 'OWNER') {
    return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
  }
  const config = await getPricingConfig()
  return NextResponse.json({ success: true, data: { config, defaults: DEFAULT_PRICING_CONFIG } })
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || auth.role !== 'OWNER') {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const patch = await req.json().catch(() => ({})) as Partial<PricingConfig>
    const validationError = validatePricingConfigPatch(patch)
    if (validationError) {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT', message: validationError }, { status: 400 })
    }

    const before = await getPricingConfig()
    const after = await savePricingConfig(patch, auth.userId)

    // Global platform config, not studio-scoped — the real platform-owner
    // JWT (app/studio/api/auth/admin-login/route.ts) has role: 'OWNER' but
    // NO studioId at all (userId: 'platform-owner' instead), unlike every
    // other OWNER token which is scoped to one photography studio. AuditLog
    // rows still require a studioId, so this uses auth.userId for both
    // fields (same actorId convention as every other owner route here) with
    // targetId 'live' identifying the one config row.
    logAuditEvent({
      studioId: auth.studioId ?? auth.userId, actorId: auth.userId, actorRole: auth.role,
      action: 'UPDATE_PRICING_CONFIG', targetType: 'PRICING_CONFIG', targetId: 'live',
      metadata: { before, after, changedFields: Object.keys(patch) },
    })

    return NextResponse.json({ success: true, data: after })
  } catch (err) {
    console.error('[owner pricing-config PATCH]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
