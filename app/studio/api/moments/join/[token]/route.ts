import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioQueryByIndex, studioQueryByPK, studioPutItem, studioGetItem, TABLES } from '@/lib/studio/dynamodb'
import { getGalleryMember, checkAndBumpJoinRateLimit } from '@/lib/studio/galleryMembers'
import { sendGalleryJoinRequestEmail } from '@/lib/aws/ses'
import type { StudioProject, GalleryMember, StudioUser, Studio } from '@/types/studio'

// Exempted from middleware's blanket CLIENT-only guard on /studio/api/moments/*
// (see middleware.ts) — GET must work for a visitor who hasn't signed in yet.

async function resolveInviteProject(token: string): Promise<StudioProject | null> {
  const projects = await studioQueryByIndex<StudioProject>(
    TABLES.projects, 'clientShareToken-index', 'clientShareToken = :t', { ':t': token }
  )
  const project = projects.find((p) => p.isIndividualGallery === true)
  if (!project) return null
  if (!project.clientShareExpiresAt || new Date(project.clientShareExpiresAt) < new Date()) return null
  return project
}

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  try {
    const project = await resolveInviteProject(params.token)
    if (!project) return NextResponse.json({ success: false, error: 'INVALID_OR_EXPIRED' }, { status: 404 })

    const members = await studioQueryByPK<GalleryMember>(TABLES.galleryMembers, 'projectId', project.projectId)
    let hostName = members.find((m) => m.role === 'ADMIN')?.name

    // Falls back to the personal Studio's own owner when no admin
    // GalleryMember row exists yet (e.g. this event was created before the
    // membership system existed — no backfill script, this covers it live)
    // or that row simply never captured a name.
    if (!hostName) {
      const studio = await studioGetItem<Studio>(TABLES.studios, { studioId: project.studioId })
      if (studio?.ownerUserId) {
        const owner = await studioGetItem<StudioUser>(TABLES.users, { userId: studio.ownerUserId })
        hostName = owner?.name
      }
    }
    hostName = hostName ?? 'Someone'

    // If the visitor is already signed in, tell the frontend their existing
    // relationship to this gallery too, so it can skip straight to "already
    // a member" / "request pending" instead of always showing the join CTA.
    const auth = await verifyStudioJWT(req)
    let existingStatus: string | null = null
    if (auth?.role === 'CLIENT') {
      if (auth.studioId === project.studioId) existingStatus = 'APPROVED'
      else {
        const member = await getGalleryMember(project.projectId, auth.userId)
        existingStatus = member?.status ?? null
      }
    }

    return NextResponse.json({
      success: true,
      data: { projectId: project.projectId, eventName: project.clientName, hostName, existingStatus },
    })
  } catch (err) {
    console.error('[moments join GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || auth.role !== 'CLIENT') {
      return NextResponse.json({ success: false, error: 'AUTH_REQUIRED' }, { status: 401 })
    }

    const project = await resolveInviteProject(params.token)
    if (!project) return NextResponse.json({ success: false, error: 'INVALID_OR_EXPIRED' }, { status: 404 })

    // The owner visiting their own invite link — already an approved admin
    // from event-creation time, nothing to create.
    if (auth.studioId === project.studioId) {
      return NextResponse.json({ success: true, data: { status: 'APPROVED' } })
    }

    const existing = await getGalleryMember(project.projectId, auth.userId)
    if (existing) {
      return NextResponse.json({ success: true, data: { status: existing.status } })
    }

    const allowed = await checkAndBumpJoinRateLimit(project)
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'RATE_LIMITED', message: 'Too many join requests right now — try again in a bit.' }, { status: 429 })
    }

    const { name: submittedName } = await req.json().catch(() => ({})) as { name?: string }
    const joiner = await studioGetItem<StudioUser>(TABLES.users, { userId: auth.userId })
    // The name typed on the join page (per-gallery display name, like a
    // WhatsApp group nickname) always wins over the account's own name —
    // falls back to the account name only if the join request somehow
    // arrives with no name at all.
    const displayName = submittedName?.trim() || joiner?.name
    const now = new Date().toISOString()
    const status: GalleryMember['status'] = project.autoApproveMembers ? 'APPROVED' : 'PENDING'
    const member: GalleryMember = {
      projectId: project.projectId, studioId: project.studioId, userId: auth.userId, role: 'MEMBER', status,
      name: displayName, email: joiner?.email,
      createdAt: now, updatedAt: now, ...(status === 'APPROVED' ? { respondedAt: now } : {}),
    }
    await studioPutItem(TABLES.galleryMembers, member as unknown as Record<string, unknown>)

    if (status === 'PENDING') {
      const members = await studioQueryByPK<GalleryMember>(TABLES.galleryMembers, 'projectId', project.projectId)
      let notifyTargets: { name?: string; email: string }[] = members
        .filter((m): m is GalleryMember & { email: string } => m.role === 'ADMIN' && !!m.email)
        .map((m) => ({ name: m.name, email: m.email }))

      // Same pre-Phase-3-event fallback as the GET handler's hostName — no
      // admin GalleryMember row yet means falling back to the personal
      // Studio's own owner, otherwise this event's owner would never be
      // notified of their own pending join requests.
      if (notifyTargets.length === 0) {
        const studio = await studioGetItem<Studio>(TABLES.studios, { studioId: project.studioId })
        const owner = studio?.ownerUserId ? await studioGetItem<StudioUser>(TABLES.users, { userId: studio.ownerUserId }) : null
        if (owner?.email) notifyTargets = [{ name: owner.name, email: owner.email }]
      }

      notifyTargets.forEach((admin) => {
        sendGalleryJoinRequestEmail(admin.email, admin.name ?? 'there', displayName ?? 'Someone', project.clientName, project.projectId)
          .catch((err) => console.error('[moments join] notify admin failed', err))
      })
    }

    return NextResponse.json({ success: true, data: { status } })
  } catch (err) {
    console.error('[moments join POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
