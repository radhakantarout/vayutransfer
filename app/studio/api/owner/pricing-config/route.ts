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
    if (!auth || auth.role !== 'OWNER' || !auth.studioId) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const patch = await req.json().catch(() => ({})) as Partial<PricingConfig>
    const validationError = validatePricingConfigPatch(patch)
    if (validationError) {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT', message: validationError }, { status: 400 })
    }

    const before = await getPricingConfig()
    const after = await savePricingConfig(patch, auth.studioId)

    // Global platform config, not studio-scoped — logged under the editing
    // owner's own studioId (same as every other AuditLog row, which is
    // always studioId-anchored) with targetId 'live' identifying the one
    // config row, per the plan's "who/when/old→new" audit trail requirement.
    logAuditEvent({
      studioId: auth.studioId, actorId: auth.studioId, actorRole: 'OWNER',
      action: 'UPDATE_PRICING_CONFIG', targetType: 'PRICING_CONFIG', targetId: 'live',
      metadata: { before, after, changedFields: Object.keys(patch) },
    })

    return NextResponse.json({ success: true, data: after })
  } catch (err) {
    console.error('[owner pricing-config PATCH]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
