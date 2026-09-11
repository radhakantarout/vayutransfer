// VayuStudios Moments membership — shared helpers so every route that needs
// to know "is this caller allowed to see/administer this gallery" asks the
// same question the same way, instead of re-deriving it per route.
import { studioGetItem, studioPutItem, studioUpdateItem, TABLES } from './dynamodb'
import type { GalleryMember, StudioProject } from '@/types/studio'
import type { StudioJWTPayload } from './auth'

export async function getGalleryMember(projectId: string, userId: string): Promise<GalleryMember | null> {
  return studioGetItem<GalleryMember>(TABLES.galleryMembers, { projectId, userId })
}

export function isApprovedMember(member: GalleryMember | null): boolean {
  return !!member && member.status === 'APPROVED'
}

export function isGalleryAdmin(member: GalleryMember | null): boolean {
  return !!member && member.status === 'APPROVED' && member.role === 'ADMIN'
}

// Owns-the-Studio always counts as admin, in addition to an explicit
// GalleryMember(role: ADMIN) row — covers events created before this
// membership system existed (no backfill needed) and is simply always true
// for the creator anyway (whose membership row IS role ADMIN from day one).
export function isOwnerOrAdmin(studioId: string | undefined, project: StudioProject, member: GalleryMember | null): boolean {
  return studioId === project.studioId || isGalleryAdmin(member)
}

export function isOwnerOrApprovedMember(studioId: string | undefined, project: StudioProject, member: GalleryMember | null): boolean {
  return studioId === project.studioId || isApprovedMember(member)
}

// The one place that knows how to find a project for whoever's asking,
// whether they own its personal Studio or are just an approved member of it
// (a member's own auth.studioId is their unrelated personal Studio, so the
// projects table's studioId+projectId composite key can't resolve them
// directly — GalleryMember.studioId, denormalized at membership-creation
// time, is what makes this possible without a new GSI). Every relaxed
// owner-or-member route should call this instead of re-deriving the same
// two-path lookup itself.
export async function resolveProjectForViewer(
  auth: StudioJWTPayload, projectId: string
): Promise<{ project: StudioProject; member: GalleryMember | null } | null> {
  if (!auth.studioId) return null

  const ownProject = await studioGetItem<StudioProject>(TABLES.projects, { studioId: auth.studioId, projectId })
  if (ownProject) {
    const member = await getGalleryMember(projectId, auth.userId)
    return { project: ownProject, member }
  }

  const member = await getGalleryMember(projectId, auth.userId)
  if (!member || !isApprovedMember(member)) return null

  const project = await studioGetItem<StudioProject>(TABLES.projects, { studioId: member.studioId, projectId })
  if (!project) return null
  return { project, member }
}

// Called once, at event-creation time — the creator is always an approved
// admin of their own gallery. This is what makes "is this an admin" a single
// uniform check everywhere else (role==='ADMIN' && status==='APPROVED')
// instead of a separate "or are they the Studio owner" branch on every route.
export async function createOwnerMembership(
  projectId: string, studioId: string, userId: string, name?: string, email?: string
): Promise<void> {
  const now = new Date().toISOString()
  const member: GalleryMember = {
    projectId, studioId, userId, role: 'ADMIN', status: 'APPROVED', name, email,
    createdAt: now, updatedAt: now, respondedAt: now,
  }
  await studioPutItem(TABLES.galleryMembers, member as unknown as Record<string, unknown>)
}

const JOIN_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000
const JOIN_RATE_LIMIT_MAX = 50

// Simple sliding-window limiter stored directly on the StudioProject row
// (design doc decision #4: "max 50 join requests per link per hour") —
// nothing more elaborate exists anywhere in this codebase to reuse for
// rate-limiting, so this is intentionally the cheapest correct mechanism,
// not a placeholder for something fancier later.
export async function checkAndBumpJoinRateLimit(project: StudioProject): Promise<boolean> {
  const now = Date.now()
  const windowStart = project.joinRequestWindowStart ? new Date(project.joinRequestWindowStart).getTime() : 0
  const windowExpired = now - windowStart > JOIN_RATE_LIMIT_WINDOW_MS

  if (windowExpired) {
    await studioUpdateItem(
      TABLES.projects,
      { studioId: project.studioId, projectId: project.projectId },
      'SET joinRequestCount = :one, joinRequestWindowStart = :now',
      { ':one': 1, ':now': new Date(now).toISOString() }
    )
    return true
  }

  if ((project.joinRequestCount ?? 0) >= JOIN_RATE_LIMIT_MAX) return false

  await studioUpdateItem(
    TABLES.projects,
    { studioId: project.studioId, projectId: project.projectId },
    'ADD joinRequestCount :one',
    { ':one': 1 }
  )
  return true
}
