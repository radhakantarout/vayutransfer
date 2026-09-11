import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { resolveProjectForViewer } from '@/lib/studio/galleryMembers'

// GET /studio/api/moments/events/[projectId] — event detail, for the owner
// OR an approved member (Phase 3) — resolveProjectForViewer handles both
// without leaking which case applies via the response shape, so a member
// who isn't yet approved (or was never invited) gets the same 404 an owner
// of some unrelated project would.
export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth?.studioId) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })

    const resolved = await resolveProjectForViewer(auth, params.projectId)
    if (!resolved) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })

    return NextResponse.json({ success: true, data: resolved.project })
  } catch (err) {
    console.error('[moments/events/[projectId] GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
