import { studioQueryByIndex, TABLES } from './dynamodb'
import type { StudioUser } from '@/types/studio'

export async function getStudioAdminEmails(studioId: string): Promise<string[]> {
  const users = await studioQueryByIndex<StudioUser>(
    TABLES.users, 'linkedStudioId-index', 'linkedStudioId = :sid', { ':sid': studioId }
  ).catch(() => [] as StudioUser[])

  const emails = users
    .filter((u) => u.role === 'ADMIN' && u.status === 'ACTIVE' && u.email)
    .map((u) => u.email!.toLowerCase())

  return Array.from(new Set(emails))
}

// A VayuStudios Moments personal Studio has exactly one owning user, with
// role CLIENT (not ADMIN — see app/studio/api/auth/moments-onboard/route.ts),
// so getStudioAdminEmails above (which filters to ADMIN) always returns
// empty for one. Used by the retention-reminder sweep to find who to email.
export async function getMomentsGalleryOwnerEmail(studioId: string): Promise<string | null> {
  const users = await studioQueryByIndex<StudioUser>(
    TABLES.users, 'linkedStudioId-index', 'linkedStudioId = :sid', { ':sid': studioId }
  ).catch(() => [] as StudioUser[])
  const owner = users.find((u) => u.status === 'ACTIVE' && u.email)
  return owner?.email?.toLowerCase() ?? null
}
