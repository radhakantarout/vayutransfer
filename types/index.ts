// ─── Audit Event Types ─────────────────────────────────────────────────────

export type AuditEventType =
  | 'WALLET_CREATED'
  | 'WALLET_TOPUP_INITIATED'
  | 'WALLET_TOPUP_SUCCESS'
  | 'WALLET_TOPUP_FAILED'
  | 'WALLET_DEDUCTED'
  | 'WALLET_REFUNDED'
  | 'UPLOAD_INITIATED'
  | 'UPLOAD_COMPLETED'
  | 'UPLOAD_FAILED'
  | 'UPLOAD_EXPIRED_PENDING'
  | 'DOWNLOAD_ATTEMPTED'
  | 'DOWNLOAD_SUCCESS'
  | 'DOWNLOAD_BLOCKED_EXPIRED'
  | 'DOWNLOAD_BLOCKED_EXHAUSTED'
  | 'DOWNLOAD_BLOCKED_INVALID'
  | 'LINK_EXPIRED'
  | 'LINK_EXHAUSTED'
  | 'RATE_LIMIT_HIT'
  | 'WEBHOOK_RECEIVED'
  | 'WEBHOOK_VERIFIED'
  | 'WEBHOOK_REJECTED'
  | 'USER_CREATED'

// ─── DynamoDB Table Interfaces ─────────────────────────────────────────────

export interface Wallet {
  walletId: string
  sessionId: string
  balance: number       // paise
  totalLoaded: number   // paise, lifetime
  totalSpent: number    // paise, lifetime
  createdAt: string     // ISO string
  updatedAt: string     // ISO string
}

export interface Transfer {
  fileId: string
  walletId: string
  fileName: string
  fileSizeBytes: number
  billableGB: number
  downloadSlots: number
  downloadsUsed: number
  recipientEmails?: string[]
  amountDeducted: number        // paise
  storageCostPaise: number
  downloadCostPaise: number
  status: 'pending' | 'active' | 'expired' | 'exhausted' | 'failed'
  s3Key: string
  expiryTime: string            // ISO string
  createdAt: string             // ISO string
  completedAt?: string          // ISO string
}

export interface Transaction {
  txnId: string
  walletId: string
  type: 'topup' | 'deduction' | 'bonus' | 'refund'
  amount: number                // paise
  bonusAmount: number           // paise, 0 for non-topup
  razorpayOrderId?: string
  razorpayPaymentId?: string
  fileId?: string               // for deductions
  status: 'pending' | 'success' | 'failed'
  createdAt: string             // ISO string
}

export interface Download {
  downloadId: string
  fileId: string
  walletId: string
  attemptedAt: string           // ISO string
  outcome: 'success' | 'expired' | 'exhausted' | 'invalid'
  downloadsUsedAtTime: number
  downloadsAllowedAtTime: number
  userAgent?: string
  ipHash: string                // SHA256 of IP, never raw IP
  countryCode?: string
}

export interface AuditEvent {
  auditId: string
  eventType: AuditEventType
  walletId?: string
  fileId?: string
  txnId?: string
  downloadId?: string
  actor: 'user' | 'system' | 'razorpay' | 'scheduler'
  outcome: 'success' | 'failure' | 'warning'
  amountPaise?: number
  metadata?: Record<string, unknown>
  errorCode?: string
  errorMessage?: string
  durationMs?: number
  createdAt: string             // ISO string
}

// ─── Business Logic Types ──────────────────────────────────────────────────

export interface PriceBreakdown {
  billableGB: number
  storageCostPaise: number
  downloadSlots: number
  downloadCostPaise: number
  totalPaise: number
  totalFormatted: string        // e.g. "₹44.00"
  slabApplied: string           // e.g. "flat rate" | "₹29/GB" | "₹25/GB" | "₹22/GB"
  marginPercent: number
}

export interface WalletTopupTier {
  id: string
  label: string
  pricePaise: number
  bonusPaise: number
  popular: boolean
  effectiveValuePaise: number   // pricePaise + bonusPaise
}

// ─── API Response Wrapper ──────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}
