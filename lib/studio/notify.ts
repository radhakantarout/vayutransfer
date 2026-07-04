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
