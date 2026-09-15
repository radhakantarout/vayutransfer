import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, TABLES } from '@/lib/studio/dynamodb'
import { getMediaDownloadUrl } from '@/lib/studio/storage'
import { resolveProjectForViewer, isApprovedMember, isOwnerOrAdmin } from '@/lib/studio/galleryMembers'
import type { MediaFile } from '@/types/studio'

// Mirrors app/studio/api/guest/[token]/download/[fileId]/route.ts's exact
// allowOriginalDownload principle: ?original=true is only ever honored when
// the GALLERY's own admin has turned it on (resolved.project.allowOriginalDownloads,
// read fresh from DynamoDB here) — never trusted from the query param alone,
// so a member can't force original access via a hand-crafted URL. Falls
// back to the web-optimized preview otherwise, matching the guest route's
// own silent-downgrade behavior rather than a hard error.
export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string; fileId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth?.studioId) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })

    const { projectId, fileId } = params
    const resolved = await resolveProjectForViewer(auth, projectId)
    if (!resolved) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })

    const isAdmin = isOwnerOrAdmin(auth.studioId, resolved.project, resolved.member)
    if (!isAdmin) {
      if (!isApprovedMember(resolved.member)) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
      if (!resolved.project.allowMemberDownloads) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const file = await studioGetItem<MediaFile>(TABLES.mediafiles, { projectId, fileId })
    if (!file) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })

    const wantsOriginal = resolved.project.allowOriginalDownloads === true && req.nextUrl.searchParams.get('original') === 'true'
    const downloadUrl = await getMediaDownloadUrl(file, file.originalFilename, { original: wantsOriginal })
    return NextResponse.redirect(downloadUrl)
  } catch (err) {
    console.error('[moments download GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
