import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import type { Studio, WatermarkPreset } from '@/types/studio'

// GET — this studio's saved watermark presets (Settings → Watermark tab,
// and the watermark-apply modal's preset picker).
export async function GET(req: NextRequest) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role) || !auth.studioId) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }
    const studio = await studioGetItem<Studio>(TABLES.studios, { studioId: auth.studioId })
    if (!studio) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    return NextResponse.json({ success: true, data: studio.watermarkPresets ?? [] })
  } catch (err) {
    console.error('[admin/settings/watermark-presets GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

// PUT — replaces the whole array (create/edit/delete/set-default all funnel
// through one save from WatermarkTab.tsx, same as its local-state-only
// predecessor did before this route existed). Only one preset may be
// isDefault — enforced here rather than trusted from the client, since a
// stale second browser tab or a client bug could otherwise send two.
export async function PUT(req: NextRequest) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role) || !auth.studioId) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const body = await req.json().catch(() => null) as { watermarkPresets?: WatermarkPreset[] } | null
    if (!Array.isArray(body?.watermarkPresets)) {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT' }, { status: 400 })
    }

    let seenDefault = false
    const presets = body.watermarkPresets.map((p) => {
      const isDefault = !!p.isDefault && !seenDefault
      if (isDefault) seenDefault = true
      return { ...p, isDefault }
    })

    await studioUpdateItem(
      TABLES.studios,
      { studioId: auth.studioId },
      'SET watermarkPresets = :presets, updatedAt = :now',
      { ':presets': presets, ':now': new Date().toISOString() }
    )

    return NextResponse.json({ success: true, data: presets })
  } catch (err) {
    console.error('[admin/settings/watermark-presets PUT]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
