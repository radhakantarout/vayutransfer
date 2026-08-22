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
  | 'SLOTS_ADDED'
  | 'EXPIRY_EXTENDED'
  | 'RECEIVE_REQUEST_CREATED'
  | 'RECEIVE_UPLOAD_STARTED'
  | 'RECEIVE_UPLOAD_COMPLETED'
  | 'RECEIVE_INSUFFICIENT_BALANCE'
  | 'ZIP_DOWNLOAD_STARTED'
  | 'ZIP_DOWNLOAD_FAILED'
  | 'DRIVE_CONNECTED'
  | 'DRIVE_DISCONNECTED'
  | 'DRIVE_IMPORT_STARTED'
  | 'DRIVE_IMPORT_FAILED'
  | 'TRANSFER_SETTINGS_UPDATED'
  | 'TRANSFER_DELETED'
  | 'USER_BLOCKED'
  | 'USER_UNBLOCKED'
  | 'USER_WARNED'

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

// A Transfer is the shareable LINK/batch — one wallet deduction (or free),
// one expiry, downloads unlimited until expiry (a silent abuse ceiling is
// enforced but never surfaced as a "slot count" to the user). It can hold
// 1..N raw files.
//
// Pre-batch-model records (created before this field existed) implicitly
// ARE the one file they describe: their own fileName/fileSizeBytes/
// storageBackend/s3Key/r2Key are that single file's real info, and no
// TransferFile rows exist for them. fileCount is undefined/1 for these.
//
// Batch records (fileCount >= 1, created by the batch upload flow) always
// have exactly fileCount matching TransferFile rows (keyed by this
// Transfer's fileId as their batchId) — fileName here becomes a display
// label ("3 files") and fileSizeBytes becomes the total across all of them;
// neither is a real single object's info once a batch exists, so nothing
// should read storageBackend/s3Key/r2Key off a batch Transfer directly —
// always resolve those per-file via TransferFile instead. See
// lib/transferBatch.ts for the read-path that branches on this.
export interface Transfer {
  fileId: string
  walletId: string
  fileName: string
  fileSizeBytes: number
  billableGB: number
  // Informational only — how many times this link has been opened for
  // download. Not a cap; see MAX_DOWNLOADS_PER_LINK in constants/pricing.ts
  // for the silent abuse ceiling enforced separately.
  downloadsUsed: number
  recipientEmails?: string[]
  // Optional note from the sender, shown in the recipient notification
  // email — plain text, 200-char UI-enforced max (not re-validated
  // server-side beyond a generous length cap; it's a courtesy message, not
  // security-sensitive input).
  message?: string
  // Sender's own notification address — distinct from recipientEmails.
  // When set, sendDownloadNotificationEmail fires once per download visit
  // (not once per file in a batch). See app/api/download/[fileId]/route.ts.
  senderNotifyEmail?: string
  // Editable display name, independent of fileName (which stays whatever
  // the first uploaded file/batch was called). Falls back to fileName
  // everywhere it's shown when unset.
  displayName?: string
  passwordHash?: string
  passwordEnabled?: boolean
  amountDeducted: number        // paise
  // 'deleted' — sender explicitly deleted the transfer (no refund; the
  // underlying R2/S3 objects are removed too, see DELETE /api/transfers/[fileId]).
  status: 'pending' | 'active' | 'expired' | 'failed' | 'deleted'
  // S3->R2 migration: every record has exactly one of these two populated,
  // matching storageBackend. Existing pre-migration records only ever have
  // s3Key; new uploads only ever get r2Key. See lib/aws/storage.ts.
  // For a batch (fileCount set), these describe nothing real — see above.
  storageBackend: 'S3' | 'R2'
  s3Key?: string
  r2Key?: string
  // Present only on batch transfers — see the type-level comment above.
  fileCount?: number
  // Additive marker, informational only — never read/branched-on by any
  // existing upload/download/expiry logic. Absent (undefined) means a
  // normal local upload, same as always. Only 'drive-import' batches ever
  // set this. See lib/transferBatch.ts#createDriveImportBatch.
  source?: 'upload' | 'drive-import'
  // Set once a server-side "Download All" zip build (ZipJob) has been
  // started for this batch — cached so repeat clicks reuse the same
  // finished zip instead of re-building it on every visit. Only used for
  // large batches (>=1GB total); small batches zip client-side and never
  // touch this field. See types.ZipJob and lib/aws/zipJob.ts.
  zipJobId?: string
  // The currently-active retention choice (3/7/15/19 days from createdAt) —
  // expiryTime is always createdAt + expiryDays, recomputed on extension.
  // Capped at MAX_EXPIRY_DAYS_FROM_UPLOAD (19), always inside the R2
  // bucket's hard 20-day-from-upload delete rule with a 1-day margin.
  expiryDays: number
  expiryTime: string            // ISO string
  createdAt: string             // ISO string
  completedAt?: string          // ISO string
}

// One raw file within a batch Transfer. PK batchId (= the owning
// Transfer's fileId), SK fileId (its own globally-unique id) — a Query on
// batchId lists every file in the batch, no GSI needed.
export interface TransferFile {
  batchId: string
  fileId: string
  fileName: string
  relativePath?: string         // preserves folder structure on multi-file/folder uploads
  fileSizeBytes: number
  contentType: string
  storageBackend: 'S3' | 'R2'
  s3Key?: string
  r2Key?: string
  uploadId?: string             // set once the multipart upload for this file has started
  // 'skipped' — the sender chose to proceed without this file after it
  // failed and they declined to keep retrying; its share of the batch price
  // gets refunded (see /api/upload/batch/[id]/finalize-partial) and the
  // rest of the batch activates without it, same as if it were 'uploaded'
  // for the purposes of "is this batch done".
  status: 'pending' | 'uploaded' | 'failed' | 'skipped'
  createdAt: string             // ISO string
}

// A shareable link the wallet owner sends to someone ELSE, asking them to
// upload a file back. Payment works exactly like a normal send: nothing is
// reserved at creation, the wallet is deducted only once the uploader picks
// files and the real total size is known — just resolved from requestId
// instead of a client-supplied walletId, since the uploader has no wallet
// of their own. If the balance is short, the uploader is blocked and the
// requester gets a throttled "add funds" email instead of the upload
// silently failing.
export interface ReceiveRequest {
  requestId: string
  walletId: string
  requesterEmail: string
  requestTitle?: string
  message?: string
  // Optional cap tighter than the platform-wide MAX_FILE_SIZE_GB, chosen by
  // the requester at creation time — enforced in
  // /api/receive/[requestId]/initiate alongside the existing global cap.
  maxSizeBytes?: number
  // 'invited' just controls who the link gets emailed to at creation time
  // (sendReceiveRequestInviteEmail) — the upload link itself still has no
  // identity check, same as 'anyone'. Not an access-control gate.
  accessMode?: 'anyone' | 'invited'
  invitedEmails?: string[]
  // Whether sendFileReceivedEmail fires on fulfillment. Defaults to true
  // when absent (pre-existing requests, created before this field existed).
  notifyOnUpload?: boolean
  status: 'pending' | 'uploading' | 'fulfilled' | 'expired' | 'cancelled'
  // Set once an upload has actually started — points at the batch Transfer
  // (its fileId doubles as the batchId) created for this request.
  resultFileId?: string
  // Throttles the insufficient-balance nudge email to once per hour so a
  // stuck/retrying uploader can't spam the requester's inbox.
  lastTopupNudgeAt?: string
  expiryTime: string            // ISO string — link stops accepting uploads after this
  createdAt: string             // ISO string
  fulfilledAt?: string          // ISO string
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

// One row per server-side "Download All" zip build for a batch Transfer
// (>=1GB total — smaller batches zip entirely client-side and never create
// one of these). PK jobId, lives in its own vayu-zip-jobs table. Built by
// a dedicated Lambda (lambda/vayu-transfer-zip) that streams each file
// from R2 into an archive and uploads the result back to R2 — mirrors
// VayuStudios' StudioJob/vayustudio-zip pattern conceptually, but is
// entirely separate code/table per the no-shared-runtime-code rule between
// the two products.
export type ZipJobStatus = 'pending' | 'processing' | 'ready' | 'failed'

export interface ZipJob {
  jobId: string
  batchId: string          // the owning Transfer's fileId
  status: ZipJobStatus
  processed: number
  total: number
  downloadUrl?: string
  zipFileName?: string
  errorMessage?: string
  createdAt: string        // ISO string
  completedAt?: string     // ISO string
  ttl: number               // unix seconds — DynamoDB TTL, 24h from creation
}

// One row per NextAuth-signed-in user who has authorized VayuTransfer's
// Drive-import feature. PK userId (NextAuth's `session.user.id`, same id
// resolveOwnWalletId()/getUserById use elsewhere). Holds only a refresh
// token (encrypted at rest by DynamoDB's default table encryption, same as
// every other table in this app — no bespoke crypto layer) — short-lived
// access tokens are minted from this on demand server-side and never
// stored. This is a separate consent step from NextAuth login itself
// (drive.file scope only, requested only when the user clicks "Import from
// Google Drive"), so ordinary sign-in never touches Drive permissions.
export interface DriveToken {
  userId: string
  refreshToken: string
  scope: string
  connectedAt: string      // ISO string
}

// One row per server-side Drive import job for a batch Transfer
// (source: 'drive-import'). PK jobId, lives in its own vayu-drive-jobs
// table. Built by a dedicated Lambda (lambda/vayu-drive-import) that
// streams each Drive file directly into R2 — mirrors ZipJob/
// lambda/vayu-transfer-zip's proven job+poll shape, kept as its own
// separate code/table since the transport (Drive API source vs R2 source)
// is genuinely different work.
export type DriveJobStatus = 'pending' | 'processing' | 'ready' | 'failed'

export interface DriveJob {
  jobId: string
  batchId: string           // the owning Transfer's fileId
  status: DriveJobStatus
  processed: number
  total: number
  currentFileName?: string  // for the "Importing… fileName" progress label
  errorMessage?: string
  createdAt: string         // ISO string
  completedAt?: string      // ISO string
  ttl: number                // unix seconds — DynamoDB TTL, 24h from creation
}

export interface Download {
  downloadId: string
  fileId: string
  walletId: string
  attemptedAt: string           // ISO string
  // 'exhausted' now only means the silent MAX_DOWNLOADS_PER_LINK abuse
  // ceiling was hit, not a user-configured limit.
  outcome: 'success' | 'expired' | 'exhausted' | 'invalid'
  downloadsUsedAtTime: number
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
  actor: 'user' | 'system' | 'razorpay' | 'scheduler' | 'admin'
  outcome: 'success' | 'failure' | 'warning'
  amountPaise?: number
  metadata?: Record<string, unknown>
  errorCode?: string
  errorMessage?: string
  durationMs?: number
  createdAt: string             // ISO string
}

// ─── File Entry (multi-file / folder upload) ──────────────────────────────

export interface FileEntry {
  file: File
  path: string   // relative path used as zip entry name (e.g. "photos/img1.jpg")
}

// A Google Drive-picked file, resolved server-side (real name/size/mimeType
// — never the client-supplied Picker values). Deliberately declared here
// rather than imported from lib/googleDrive/resolveSelection.ts, which
// pulls in the server-only `googleapis` package — this file is plain data
// and safe to use in both server routes and client components (e.g. the
// upload page's file list, which renders these next to local FileEntry
// items in the same list/pricing screen).
export interface DriveFileEntry {
  driveFileId: string
  name: string
  relativePath: string
  sizeBytes: number
  mimeType: string
  isWorkspaceExport: boolean
  exportMimeType?: string
}

// ─── Business Logic Types ──────────────────────────────────────────────────

export interface PriceBreakdown {
  billableGB: number
  totalPaise: number
  totalFormatted: string        // e.g. "₹44.00"
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
