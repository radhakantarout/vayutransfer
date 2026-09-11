import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { VideoProviderRouter } from '@/lib/studio/videoProviders'
import { DEFAULT_REEL_STYLE, DEFAULT_REEL_ASPECT_RATIO, DEFAULT_REEL_RESOLUTION, DEFAULT_REEL_DURATION_SEC } from '@/constants/videoProviders'

// OWNER-only internal wiring check for the VideoProvider abstraction (design
// doc Phase 1 step 1). Not part of the public API surface (§4.5) and never
// called from any customer-facing flow.
//
// GET alone (no query param) is free/safe — router selection + capabilities
// only, no real Kling call. GET with ?checkTaskId=<id> and POST both make a
// REAL, BILLED Kling API call — only trigger those deliberately.
async function requireOwner(req: NextRequest) {
  const auth = await verifyStudioJWT(req)
  if (!auth || auth.role !== 'OWNER') return null
  return auth
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireOwner(req)
    if (!auth) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })

    const router = new VideoProviderRouter()
    const provider = router.select({
      style: DEFAULT_REEL_STYLE,
      durationSec: DEFAULT_REEL_DURATION_SEC,
      aspectRatio: DEFAULT_REEL_ASPECT_RATIO,
      resolution: DEFAULT_REEL_RESOLUTION,
    })

    const checkTaskId = req.nextUrl.searchParams.get('checkTaskId')
    if (checkTaskId) {
      // Real, billed Kling call — polls by the external_task_id passed to
      // POST below (see generateImageToVideo — providerJobId IS the
      // external_task_id we chose, not Kling's own internal task id).
      const status = await provider.getGenerationStatus(checkTaskId)
      return NextResponse.json({ success: true, data: { selectedProvider: provider.name, status } })
    }

    return NextResponse.json({
      success: true,
      data: {
        selectedProvider: provider.name,
        capabilities: provider.getCapabilities(),
        klingApiKeyConfigured: Boolean(process.env.KLING_API_KEY),
      },
    })
  } catch (err) {
    console.error('[owner/reel-provider-test GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR', message: String((err as Error)?.message ?? err) }, { status: 500 })
  }
}

// Kicks off one real, billed Kling generation — defaults to Kling's own
// documented sample image so this can be re-run without spending against a
// real client photo. Returns immediately with the providerJobId to poll via
// GET ?checkTaskId= above; does not block waiting for completion (Kling
// generation can take minutes, well past a reasonable request timeout).
export async function POST(req: NextRequest) {
  try {
    const auth = await requireOwner(req)
    if (!auth) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })

    const body = await req.json().catch(() => ({})) as { imageUrl?: string; prompt?: string; durationSec?: number }
    const externalTaskId = `owner-test-${Date.now()}`

    const router = new VideoProviderRouter()
    const provider = router.select({
      style: DEFAULT_REEL_STYLE,
      durationSec: body.durationSec ?? 5,
      aspectRatio: DEFAULT_REEL_ASPECT_RATIO,
      resolution: DEFAULT_REEL_RESOLUTION,
    })

    const result = await provider.generateImageToVideo({
      imageUrl: body.imageUrl ?? 'https://p2-kling.klingai.com/kcdn/cdn-kcdn112452/kling-tob-release_note/image_25.png',
      prompt: body.prompt ?? 'A girl sat on the train, looking out the window with a melancholic expression, her head swaying with the train.',
      motion: 'slow_push_in',
      durationSec: body.durationSec ?? 5,
      aspectRatio: DEFAULT_REEL_ASPECT_RATIO,
      resolution: DEFAULT_REEL_RESOLUTION,
      externalTaskId,
    })

    return NextResponse.json({ success: true, data: { ...result, pollUrl: `/studio/api/owner/reel-provider-test?checkTaskId=${externalTaskId}` } })
  } catch (err) {
    console.error('[owner/reel-provider-test POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR', message: String((err as Error)?.message ?? err) }, { status: 500 })
  }
}
