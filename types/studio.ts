export type StudioRole = 'OWNER' | 'ADMIN' | 'CLIENT' | 'PRINT'
export type StudioStatus = 'ACTIVE' | 'SUSPENDED'
export type ProjectStatus = 'DRAFT' | 'ACTIVE' | 'SELECTION_RECEIVED' | 'COMPLETED'
export type ProcessingStatus = 'UPLOADING' | 'PROCESSING' | 'READY' | 'FAILED'
export type EventType = 'WEDDING' | 'PRE_WEDDING' | 'CORPORATE' | 'SCHOOL' | 'OTHER'
export type StudioPlan = 'STARTER' | 'PRO' | 'STUDIO' | 'ENTERPRISE'

export interface StudioUser {
  userId: string
  role: StudioRole
  email: string
  phone: string
  name: string
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
  clientShareToken: string
  clientShareExpiresAt: string
  printShareToken?: string
  printShareExpiresAt?: string
  selectionSubmittedAt?: string
  selectionLockedBy?: string
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
  watermarkEnabled: boolean
  displayOrder: number
  uploadedAt: string
  processingStatus: ProcessingStatus
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
