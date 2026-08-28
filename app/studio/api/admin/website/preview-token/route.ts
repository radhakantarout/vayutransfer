import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { getWebsiteByStudioId } from '@/lib/studio/website'
import { signPreviewToken } from '@/lib/studio/previewToken'

// Issues a short-lived token the dashboard's live-preview iframes append to the
// public site URL so a DRAFT (not-yet-published) site can be viewed without
// making it publicly reachable — see [subdomain]/page.tsx for the check.
export async function GET(req: NextRequest) {
  const auth = await verifyStudioJWT(req)
  if (!auth || !['ADMIN', 'OWNER'].includes(auth.role) || !auth.studioId) {
    return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
  }

  const website = await getWebsiteByStudioId(auth.studioId)
  if (!website?.subdomain) {
    return NextResponse.json({ success: false, error: 'NO_SUBDOMAIN' }, { status: 400 })
  }

  const token = await signPreviewToken({ studioId: auth.studioId, subdomain: website.subdomain })
  return NextResponse.json({ success: true, token })
}
