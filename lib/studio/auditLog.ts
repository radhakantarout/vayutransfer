import { randomUUID } from 'crypto'
import { studioPutItem, TABLES } from '@/lib/studio/dynamodb'
import type { AuditLog, AuditAction, AuditTargetType } from '@/types/studio'

// Fire-and-forget, same convention as VayuTransfer's own lib/audit.ts —
// never awaited by a caller, a logging failure must never block or fail
// the actual user-facing action it's recording. This is the platform's
// only record of who deleted/suspended/changed what and how much; keep
// every call site's metadata as complete as the data on hand allows, since
// it's the only thing that can answer a future claim/dispute.
//
// The underlying table's base key (actorId/timestamp) predates this
// governance work and was never actually used by anything — rather than a
// destructive table recreation, this writes both the legacy `timestamp`
// attribute (satisfies the existing key schema) and the new `createdAt`
// attribute (what the studioId-createdAt-index GSI actually queries on),
// holding the same value.
export function logAuditEvent(entry: {
  studioId: string
  actorId: string
  actorEmail?: string
  actorRole: AuditLog['actorRole']
  action: AuditAction
  targetType: AuditTargetType
  targetId?: string
  metadata: Record<string, unknown>
}): void {
  const now = new Date().toISOString()
  const row: AuditLog & { timestamp: string } = {
    auditId: randomUUID(),
    createdAt: now,
    timestamp: now,
    ...entry,
  }
  studioPutItem(TABLES.auditlog, row as unknown as Record<string, unknown>)
    .catch((err) => console.error('[auditLog]', entry.action, err))
}
