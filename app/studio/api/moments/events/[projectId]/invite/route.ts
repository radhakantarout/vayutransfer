import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import { resolveProjectForViewer, isOwnerOrAdmin } from '@/lib/studio/galleryMembers'
import { MOMENTS_RETENTION_DAYS, MOMENTS_INVITE_DEFAULT_DAYS, MOMENTS_INVITE_EXTEND_DAY_OPTIONS } from '@/constants/studioPricing'
import type { StudioProject } from '@/types/studio'

const DAY_MS = 24 * 60 * 60 * 1000

// Reuses clientShareToken/clientShareExpiresAt (and its existing
// clientShareToken-index GSI) as the invite-link storage — see the field's
// comment in types/studio.ts for why this is safe (isIndividualGallery rows
// never use it for the real client-access purpose it was built for).
//
// Expiry policy deliberately mirrors the studio-admin client-gallery
// share-link's own generate/extend split (app/studio/api/admin/projects/
// [projectId]/share-link/route.ts) — same extend-day options, same
// Math.max(current, now)-then-add math — so there's one consistent mental
// model for link-expiry policy across both admin surfaces. The one
// Moments-specific rule: an invite can never be extended past the gallery's
// own 19-day retention window (MOMENTS_RETENTION_DAYS) — no point in a join
// link outliving the gallery it points at.
function maxExpiresAtMs(project: StudioProject): number {
  return new Date(project.createdAt).getTime() + MOMENTS_RETENTION_DAYS * DAY_MS
}

// GET — current invite state + permission toggles (owner/admin only).
export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth?.studioId) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })

    const { projectId } = params
    const resolved = await resolveProjectForViewer(auth, projectId)
    if (!resolved || !isOwnerOrAdmin(auth.studioId, resolved.project, resolved.member)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }
    const { project } = resolved

    const expiresAtMs = project.clientShareExpiresAt ? new Date(project.clientShareExpiresAt).getTime() : 0
    const hasActiveInvite = !!project.clientShareToken && expiresAtMs > Date.now()
    const maxMs = maxExpiresAtMs(project)

    return NextResponse.json({
      success: true,
      data: {
        inviteUrl: hasActiveInvite ? `${req.nextUrl.origin}/studio/moments/join/${project.clientShareToken}` : null,
        expiresAt: hasActiveInvite ? project.clientShareExpiresAt : null,
        daysRemaining: hasActiveInvite ? Math.max(0, Math.ceil((expiresAtMs - Date.now()) / DAY_MS)) : 0,
        atMaxExpiry: hasActiveInvite && expiresAtMs >= maxMs,
        extendDayOptions: MOMENTS_INVITE_EXTEND_DAY_OPTIONS,
        autoApproveMembers: !!project.autoApproveMembers,
        allowMemberDownloads: !!project.allowMemberDownloads,
        allowMemberReels: !!project.allowMemberReels,
      },
    })
  } catch (err) {
    console.error('[moments invite GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

// POST — (re)generate the invite link and/or update its settings. Owner/admin
// only. A settings-only save (no regenerate, link already exists) leaves the
// current expiry untouched — only a fresh/regenerated link gets a new
// default 9-day expiry, capped at the gallery's 19-day retention window.
export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth?.studioId) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })

    const { projectId } = params
    const resolved = await resolveProjectForViewer(auth, projectId)
    if (!resolved || !isOwnerOrAdmin(auth.studioId, resolved.project, resolved.member)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }
    const { project } = resolved

    const body = await req.json().catch(() => ({})) as {
      autoApproveMembers?: boolean; allowMemberDownloads?: boolean; allowMemberReels?: boolean; regenerate?: boolean
    }
    const now = new Date().toISOString()
    const isNewLink = body.regenerate || !project.clientShareToken
    const token = isNewLink ? randomUUID() : project.clientShareToken
    const expiresAt = isNewLink
      ? new Date(Math.min(Date.now() + MOMENTS_INVITE_DEFAULT_DAYS * DAY_MS, maxExpiresAtMs(project))).toISOString()
      : project.clientShareExpiresAt

    await studioUpdateItem(
      TABLES.projects,
      { studioId: project.studioId, projectId },
      'SET clientShareToken = :token, clientShareExpiresAt = :exp, autoApproveMembers = :auto, allowMemberDownloads = :dl, allowMemberReels = :reels, updatedAt = :now',
      {
        ':token': token, ':exp': expiresAt,
        ':auto': body.autoApproveMembers === true,
        ':dl': body.allowMemberDownloads === true,
        ':reels': body.allowMemberReels === true,
        ':now': now,
      }
    )

    return NextResponse.json({
      success: true,
      data: {
        inviteUrl: `${req.nextUrl.origin}/studio/moments/join/${token}`,
        expiresAt,
        autoApproveMembers: body.autoApproveMembers === true,
        allowMemberDownloads: body.allowMemberDownloads === true,
        allowMemberReels: body.allowMemberReels === true,
      },
    })
  } catch (err) {
    console.error('[moments invite POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

// PATCH — extend the invite's expiry, same fixed-increment pattern as the
// client-gallery share-link's own PATCH: base off whichever is later (the
// current expiry, or now — so extending an already-expired link starts
// counting from today, not from a stale past date), capped at the gallery's
// 19-day retention window.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth?.studioId) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })

    const { extendDays } = await req.json().catch(() => ({}))
    if (!(MOMENTS_INVITE_EXTEND_DAY_OPTIONS as readonly number[]).includes(extendDays)) {
      return NextResponse.json({ success: false, error: 'INVALID_EXTEND_DAYS' }, { status: 400 })
    }

    const { projectId } = params
    const resolved = await resolveProjectForViewer(auth, projectId)
    if (!resolved || !isOwnerOrAdmin(auth.studioId, resolved.project, resolved.member)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }
    const { project } = resolved
    if (!project.clientShareToken) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND', message: 'Create an invite link first.' }, { status: 404 })
    }

    const maxMs = maxExpiresAtMs(project)
    const base = Math.max(new Date(project.clientShareExpiresAt ?? 0).getTime(), Date.now())
    if (base >= maxMs) {
      return NextResponse.json({ success: false, error: 'AT_MAX_EXPIRY', message: `Can't extend past this gallery's 19-day limit.` }, { status: 400 })
    }
    const expiresAt = new Date(Math.min(base + extendDays * DAY_MS, maxMs)).toISOString()

    await studioUpdateItem(
      TABLES.projects, { studioId: project.studioId, projectId },
      'SET clientShareExpiresAt = :exp, updatedAt = :now',
      { ':exp': expiresAt, ':now': new Date().toISOString() }
    )

    return NextResponse.json({ success: true, data: { expiresAt, atMaxExpiry: new Date(expiresAt).getTime() >= maxMs } })
  } catch (err) {
    console.error('[moments invite PATCH]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
