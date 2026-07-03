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
  storageUsedBytes: number
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
  s3Key: string
  r2PreviewKey?: string
  r2PreviewUrl?: string
  editedS3Key?: string
  watermarkEnabled: boolean
  displayOrder: number
  uploadedAt: string
  processingStatus: ProcessingStatus
  // Phase 2 — face indexing
  faceIds?: string[]
  faceCount?: number
  faceIndexed?: boolean
  faceIndexedAt?: string
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
