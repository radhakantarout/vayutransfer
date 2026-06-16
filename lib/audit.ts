import { v4 as uuidv4 } from 'uuid'
import type { AuditEventType } from '@/types'

interface LogAuditParams {
  eventType: AuditEventType
  actor: 'user' | 'system' | 'razorpay' | 'scheduler'
  outcome: 'success' | 'failure' | 'warning'
  walletId?: string
  fileId?: string
  txnId?: string
  downloadId?: string
  amountPaise?: number
  metadata?: Record<string, unknown>
  errorCode?: string
  errorMessage?: string
  durationMs?: number
}

export async function logAudit(params: LogAuditParams): Promise<void> {
  try {
    const { putItem } = await import('@/lib/aws/dynamodb')

    const auditId = uuidv4()
    const createdAt = new Date().toISOString()

    const item: Record<string, unknown> = {
      auditId,
      eventType: params.eventType,
      actor: params.actor,
      outcome: params.outcome,
      createdAt,
    }

    if (params.walletId)     item.walletId     = params.walletId
    if (params.fileId)       item.fileId       = params.fileId
    if (params.txnId)        item.txnId        = params.txnId
    if (params.downloadId)   item.downloadId   = params.downloadId
    if (params.amountPaise !== undefined) item.amountPaise = params.amountPaise
    if (params.metadata)     item.metadata     = params.metadata
    if (params.errorCode)    item.errorCode    = params.errorCode
    if (params.errorMessage) item.errorMessage = params.errorMessage
    if (params.durationMs !== undefined) item.durationMs = params.durationMs

    const table = process.env.DYNAMO_AUDIT_TABLE ?? 'vayu-audit'
    await putItem(table, item)
  } catch (err) {
    // Audit must never break the main flow
    console.error('[audit] Failed to log event:', params.eventType, err)
  }
}
