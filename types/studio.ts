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
  // Total AI-search (face-indexing) credits ever granted — free baseline +
  // every top-up, cumulative, never decrements. Undefined on studios created
  // before this field existed — treat as just the free baseline (see
  // FREE_AI_SEARCH_CREDITS).
  aiSearchCreditsTotal?: number
  // Cumulative photos ever successfully indexed by Rekognition — incremented
  // only by the indexing Lambda, right after a batch completes. Deliberately
  // NEVER decremented on photo/project delete: the Rekognition cost was
  // already incurred and is non-refundable, so deleting the photo later must
  // not make it look like that AI-search credit was never spent.
  aiSearchCreditsUsed?: number
  // Real self-service billing plan — separate from the legacy `plan` field
  // above (an owner-assigned cosmetic label from an older admin tool, not
  // tied to actual quota enforcement). Every studio has one of these three;
  // 'free' is the default from signup. Undefined on studios created before
  // this field existed — treated as 'free' with the free baseline amounts.
  billingPlanId?: 'free' | 'pro' | 'custom'
  // Base allotment for the current billing plan — Free is fixed
  // (FREE_STORAGE_GB/FREE_AI_CREDITS), Pro is whatever the studio's slider
  // chose at checkout, Custom is negotiated. This is what resets each cycle
  // (AI credits) or forms the storage floor (storage); top-ups add on top
  // of it without changing it. See lib/studio/quota.ts.
  planStorageGB?: number
  planAiCreditsPerMonth?: number
  billingCycle?: 'monthly' | 'annual'
  // Fixed 30-day rolling window from signup/last plan-change, used purely
  // for AI-credit reset bookkeeping — advances every 30 days regardless of
  // billingCycle or top-ups. Separate from planRenewsAt (payment due date)
  // below: a monthly-billed studio's AI credits and payment both happen to
  // land on the same 30-day cadence, but an annual studio's AI credits
  // still reset every 30 days even though they only pay once a year.
  billingPeriodStart?: string
  billingPeriodEnd?: string
  // When the studio next needs to manually pay to keep its Pro/Custom plan
  // (no real recurring auto-debit exists yet — see lib/studio/quota.ts).
  // 30 days out for monthly, 365 for annual, set at plan-change time.
  // Undefined for Free (never needs renewal).
  planRenewsAt?: string
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
  // Optional gate on clientShareToken access — off by default (direct access,
  // no code needed). When on, sharePassword is a static code generated at
  // share-link creation time, shown to the admin to hand out separately from
  // the link itself (e.g. by phone/WhatsApp) — distinct from the at-access-
  // time emailed OTP the existing client-otp-request/verify flow already does.
  sharePasswordProtected?: boolean
  sharePassword?: string
  // Recent Transfers panel — stamped on real client visits (not admin
  // preview) and incremented on each client download, so the studio can see
  // whether/when a shared link was actually opened and used.
  shareLastOpenedAt?: string
  shareDownloadCount?: number
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
  // Set when the admin schedules this project for deletion (delete-now bypasses
  // this entirely). Past-due projects are swept by the daily scheduled-deletes
  // cron. Cancel by clearing this field.
  scheduledDeleteAt?: string
  // True only for the "client shell" row created by New Project before any
  // real event exists — hidden from every event list/count until the first
  // Add Event promotes it in place (see AddEventModal + PATCH route).
  isPlaceholder?: boolean
  // Client-spanning cover photo pointer — which event + which file — set via
  // the My Projects card's "Change cover" action. Independent of the
  // per-event coverPhotoFileId above, and may point at a different project.
  clientCoverProjectId?: string
  clientCoverFileId?: string
  // Admin-chosen sidebar/gallery display order among a client's events —
  // set via drag-to-reorder in the sidebar's event list. Absent means "use
  // the default (updatedAt) order" — only populated once the admin actually
  // reorders that client's events for the first time.
  eventOrder?: number
  createdAt: string
  updatedAt: string
}

export type CurationStatus = 'STARRED' | 'FAVORITE' | 'FINAL'

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
  // Admin-only photo curation pipeline — the photographer's own culling
  // workflow (e.g. picking best shots to send for print), entirely separate
  // from the client's own loved/selected state (Selection.isSelected).
  // Ordered: STARRED -> FAVORITE -> FINAL. Never shown to clients.
  curationStatus?: CurationStatus
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

// One row per admin-initiated *action*, not per underlying record — a bulk
// delete of 40 photos is one row with metadata.photoCount = 40, never 40
// rows. This is the platform's only record of who deleted/suspended/changed
// what and how much, for resolving future claims/disputes — see
// lib/studio/auditLog.ts for the write helper, never write to this table
// directly.
export type AuditAction =
  | 'DELETE_PHOTOS' | 'DELETE_PROJECT' | 'DELETE_CLIENT' | 'DELETE_STUDIO'
  | 'DELETE_TRANSFER' | 'DELETE_WEBSITE_MEDIA'
  | 'SUSPEND_STUDIO' | 'REACTIVATE_STUDIO' | 'TOGGLE_AI_FLAG'
export type AuditTargetType = 'PHOTO_BATCH' | 'PROJECT' | 'CLIENT' | 'STUDIO' | 'TRANSFER' | 'WEBSITE_MEDIA'

export interface AuditLog {
  auditId: string
  studioId: string
  createdAt: string
  actorId: string
  actorEmail?: string
  actorRole: StudioRole | 'SYSTEM'
  action: AuditAction
  targetType: AuditTargetType
  targetId?: string
  metadata: Record<string, unknown>
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
  // Billed against the studio's storage quota — see
  // app/studio/api/admin/website/portfolio-upload/route.ts.
  sizeBytes?: number
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
  heroImageSizeBytes?: number
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

// Downloads are never metered under the R2 (zero-egress-fee) pricing model —
// 'download_topup' intentionally removed. 'plan_change' covers Free→Pro,
// Pro storage/AI/billingCycle adjustments, and manual cycle renewal — all
// reuse the same Razorpay order→verify pipeline as top-ups.
export type StudioTxnType = 'storage_topup' | 'ai_search_topup' | 'plan_change'
export type StudioTxnStatus = 'pending' | 'success' | 'failed'

export interface StudioTransaction {
  txnId: string
  studioId: string
  type: StudioTxnType
  // Descriptive label (e.g. "custom_150gb", "plan_pro_100gb_500ai") — no
  // longer a lookup key into a fixed catalog since amounts are now
  // computed from a linear rate, not chosen from a package list.
  packageId: string
  amountPaise: number
  gbPurchased: number
  months?: number            // set for storage_topup only
  creditsPurchased?: number  // set for ai_search_topup only
  // set for plan_change only — the plan/cycle this transaction moved the
  // studio to, so a receipt or audit trail can show what actually changed.
  planId?: 'free' | 'pro' | 'custom'
  billingCycle?: 'monthly' | 'annual'
  razorpayOrderId?: string
  razorpayPaymentId?: string
  status: StudioTxnStatus
  createdAt: string
}
