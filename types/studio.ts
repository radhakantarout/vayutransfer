export type StudioRole = 'OWNER' | 'ADMIN' | 'CLIENT' | 'PRINT'
export type StudioStatus = 'ACTIVE' | 'SUSPENDED'
export type ProjectStatus = 'DRAFT' | 'ACTIVE' | 'SELECTION_RECEIVED' | 'COMPLETED'
export type ProcessingStatus = 'UPLOADING' | 'PROCESSING' | 'READY' | 'FAILED'
export type EventType = 'WEDDING' | 'MEHENDI' | 'RECEPTION' | 'ENGAGEMENT' | 'PRE_WEDDING' | 'BIRTHDAY' | 'CORPORATE' | 'SCHOOL' | 'OTHER'
export type StudioPlan = 'STARTER' | 'PRO' | 'STUDIO' | 'ENTERPRISE'

export interface StudioUser {
  userId: string
  role: StudioRole
  email?: string
  phone?: string
  name?: string
  passwordHash?: string
  linkedStudioId?: string
  linkedProjectIds?: string[]
  status: StudioStatus
  lastLoginAt: string
  createdAt: string
  updatedAt: string
}

export interface StorageGrant {
  id: string
  bytes: number
  expiresAt: string | null   // null = free baseline grant, never expires on its own
  source: 'free' | 'topup'
  purchasedTxnId?: string
  createdAt: string
}

export interface Studio {
  studioId: string
  name: string
  ownerUserId: string
  plan: StudioPlan
  brandingConfig: {
    logoS3Key?: string
    primaryColor?: string
    galleryTitle?: string
  }
  // Historical, monotonically-increasing total of everything ever uploaded —
  // shown on the dashboard as "Total Upload Size". Never decrements.
  storageUsedBytes: number
  // Live, accurate current storage — increments on upload, decrements on
  // delete. This is the number billing/quota enforcement actually uses.
  billableStorageBytes: number
  storageGrants: StorageGrant[]
  dataRetentionGraceDays: number
  storageOverageStartedAt?: string
  storageReminderCount?: number
  projectCount: number
  status: StudioStatus
  createdAt: string
  updatedAt: string
  featureFlags: {
    videoSupport: boolean
    watermarkToggle: boolean
    extendedStorage: boolean
    clientComments: boolean
    editingRequired: boolean
    aiFaceRecognition: boolean
  }
}

export interface StudioProject {
  studioId: string
  projectId: string
  clientName: string
  clientEmail: string
  clientPhone: string
  eventDate: string
  eventType: EventType
  status: ProjectStatus
  totalFiles: number
  selectedFilesCount: number
  editingRequiredCount: number
  commentsCount: number
  eventLocation?: string
  selectionMin?: number
  selectionMax?: number
  clientShareToken?: string
  clientShareExpiresAt?: string
  printShareToken?: string
  printShareExpiresAt?: string
  selectionSubmittedAt?: string
  selectionLockedBy?: string
  sharedFileIds?: string[]
  // Admin-chosen cover photo for this event — shown on the client gallery's
  // event card. Falls back to the first READY photo by displayOrder when
  // unset (or if the chosen file was since deleted).
  coverPhotoFileId?: string
  // Admin-only favorite flag for the My Projects dashboard — has no effect
  // on client-facing views.
  isStarred?: boolean
  createdAt: string
  updatedAt: string
}

export interface MediaFile {
  projectId: string
  fileId: string
  studioId: string
  originalFilename: string
  fileType: 'IMAGE' | 'VIDEO'
  mimeType: string
  sizeBytes: number
  // Optional now that new uploads write to R2 instead — a file has exactly
  // one of s3Key or r2Key set, never neither. See storageBackend below.
  s3Key?: string
  r2PreviewKey?: string
  r2PreviewUrl?: string
  editedS3Key?: string
  watermarkEnabled: boolean
  displayOrder: number
  uploadedAt: string
  processingStatus: ProcessingStatus
  // S3 -> Cloudflare R2 originals migration (zero-downtime: absent/"S3" means
  // read s3Key/editedS3Key from AWS S3 as before; "R2" means read r2Key/
  // editedR2Key from Cloudflare R2 instead). Only ever set explicitly for the
  // ORIGINAL file — the current-best-copy resolver in lib/studio/storage.ts
  // infers the edited copy's backend independently from which edited key is
  // populated, since an edit can be uploaded on R2 even if the original is
  // still on S3.
  storageBackend?: 'S3' | 'R2'
  r2Key?: string
  editedR2Key?: string
  // Phase 2 — face indexing
  faceIds?: string[]
  faceCount?: number
  faceIndexed?: boolean
  faceIndexedAt?: string
  // Set when this file arrived via a Raw File Transfer import rather than a
  // direct gallery upload — provenance only, doesn't change how it's served.
  importedFromTransferId?: string
}

export interface StudioFace {
  projectId: string
  faceId: string
  studioId: string
  photoIds: string[]
  photoCount: number
  confidence: number
  thumbnailR2Key: string
  thumbnailUrl: string
  label?: string
  boundingBox?: string
  createdAt: string
  updatedAt: string
}

export type JobType   = 'INDEX_FACES' | 'ZIP_DOWNLOAD' | 'SELFIE_SEARCH'
export type JobStatus = 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED'

export interface StudioJob {
  jobId: string
  jobType: JobType
  status: JobStatus
  projectId: string
  studioId: string
  inputPayload?: Record<string, unknown>
  outputPayload?: Record<string, unknown>
  errorMessage?: string
  createdAt: string
  completedAt?: string
  ttl?: number
}

// ── Raw File Transfer ────────────────────────────────────────────────────────
// Native VayuStudios feature (not an integration with VayuTransfer) letting a
// studio owner send a large RAW file to, or request one back from, anyone
// outside the platform — via presigned R2 links, no watermarking, no separate
// billing. Scoped per-project; storage/download bytes fold into the studio's
// existing quota (Studio.billableStorageBytes / StudioUsageMonth).

export type TransferDirection = 'SEND' | 'RECEIVE'
export type TransferStatus = 'PENDING' | 'UPLOADING' | 'READY' | 'FAILED' | 'EXPIRED'

export interface StudioTransfer {
  projectId: string        // PK
  transferId: string       // SK
  studioId: string
  direction: TransferDirection
  // Known at creation for SEND; unknown until the recipient uploads for RECEIVE.
  filename?: string
  mimeType?: string
  sizeBytes?: number
  r2Key?: string
  status: TransferStatus
  shareToken: string
  shareExpiresAt: string
  downloadCount: number
  lastDownloadedAt?: string
  // RECEIVE only — set once the studio owner explicitly imports the received
  // file into the project gallery (triggers the normal MediaFile/watermark
  // pipeline). Once true, deleting the transfer must never touch R2/billing —
  // the MediaFile record owns that object going forward.
  importedToGallery: boolean
  importedFileId?: string
  note?: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface Selection {
  projectId: string
  fileId: string
  studioId: string
  clientId: string
  isSelected: boolean
  editingRequired: boolean
  comment?: string
  selectedAt: string
  updatedAt: string
}

export interface AuditLog {
  actorId: string
  timestamp: string
  actorRole: StudioRole
  action: string
  targetId: string
  targetType: 'USER' | 'PROJECT' | 'STUDIO' | 'TOKEN'
  metadata?: Record<string, unknown>
  ipAddress?: string
  userAgent?: string
}

// ── Website Builder ────────────────────────────────────────────────────────────

export type WebsiteTemplateId = 'lumina' | 'clarity' | 'ember' | 'bold' | 'bloom'
export type WebsiteStatus = 'DRAFT' | 'LIVE'

export interface WebsiteService {
  id: string
  name: string
  description: string
  price?: string
}

export interface WebsiteGalleryPhoto {
  id: string
  url: string
  caption?: string
  category?: string
}

export interface StudioWebsite {
  studioId: string
  subdomain: string
  customDomain?: string
  templateId: WebsiteTemplateId
  status: WebsiteStatus
  heroTitle: string
  heroSubtitle: string
  tagline?: string
  about: string
  city?: string
  services: WebsiteService[]
  galleryPhotos: WebsiteGalleryPhoto[]
  heroImageUrl?: string
  contactEmail?: string
  contactPhone?: string
  whatsapp?: string
  socialLinks?: {
    instagram?: string
    facebook?: string
    youtube?: string
  }
  themeAccent?: string
  fontColor?: string
  bookingEnabled: boolean
  bookingMessage?: string
  createdAt: string
  updatedAt: string
}

// ── Bookings ──────────────────────────────────────────────────────────────────

export type BookingStatus = 'NEW' | 'SEEN' | 'REPLIED'

export interface Booking {
  bookingId: string
  studioId: string
  subdomain: string
  name: string
  email: string
  phone?: string
  eventType?: string
  eventDate?: string
  message?: string
  status: BookingStatus
  createdAt: string
}

// ── Billing ───────────────────────────────────────────────────────────────────

export type StudioTxnType = 'storage_topup' | 'download_topup'
export type StudioTxnStatus = 'pending' | 'success' | 'failed'

export interface StudioTransaction {
  txnId: string
  studioId: string
  type: StudioTxnType
  packageId: string
  amountPaise: number
  gbPurchased: number
  months?: number            // set for storage_topup only
  razorpayOrderId?: string
  razorpayPaymentId?: string
  status: StudioTxnStatus
  createdAt: string
}

// Monthly download counter — PK studioId, SK month ("2026-07"). A new month
// simply starts a fresh record at zero, no reset job needed.
export interface StudioUsageMonth {
  studioId: string
  month: string
  downloadBytes: number
  downloadTopupBytes: number
  updatedAt: string
}
