# VAYUSTUDIO — CLAUDE CODE REQUIREMENTS
# Subdomain: studio.vayutransfer.com
# Base codebase: vayutransfer.com (Next.js, AWS S3, DynamoDB, Lambda, Razorpay, Cloudflare R2)
# Phase: 1 — Gallery Delivery, Client Selection & Platform Admin

---

## CONTEXT FOR CLAUDE CODE

You are extending the existing **VayuTransfer** codebase at `vayutransfer.com` to add a new
product called **VayuStudio**, served at `studio.vayutransfer.com`.

VayuTransfer already has:
- Next.js 14 (App Router) deployed on Vercel
- AWS S3 multipart upload with presigned URLs
- DynamoDB for file/wallet metadata
- Cloudflare R2 for storage
- Razorpay payment integration
- AWS SES for transactional email
- JWT-based authentication
- Lambda functions for async jobs

VayuStudio reuses ALL of the above infrastructure and adds:
- Four user roles with separate auth flows
- Studio project management
- Client gallery with photo selection, comments, and edit flags
- Album print user portal (read-only download)
- Platform Owner super-admin panel

Do NOT rewrite VayuTransfer. Build VayuStudio as an additive feature set under
the `studio.vayutransfer.com` subdomain using the existing infra.

---

## SUBDOMAIN SETUP

### Vercel Configuration
```
# vercel.json — add to existing file
{
  "rewrites": [
    {
      "source": "/:path*",
      "has": [{ "type": "host", "value": "studio.vayutransfer.com" }],
      "destination": "/studio/:path*"
    }
  ]
}
```

### Next.js App Router Structure
```
app/
  studio/                          ← all VayuStudio routes live here
    layout.tsx                     ← studio root layout (separate from main VayuTransfer)
    page.tsx                       ← studio landing / login router
    (auth)/
      login/page.tsx               ← studio admin login
      otp/page.tsx                 ← client OTP login
      magic/page.tsx               ← client magic link landing
    (platform-owner)/
      admin/
        layout.tsx                 ← platform owner guard (OWNER role only)
        page.tsx                   ← platform dashboard
        studios/page.tsx           ← studio management
        users/page.tsx             ← user management
        tokens/page.tsx            ← access token control
        logs/page.tsx              ← audit + error logs
        flags/page.tsx             ← feature flags
        billing/page.tsx           ← billing overview
    (studio-admin)/
      dashboard/
        layout.tsx                 ← studio admin guard (ADMIN role only)
        page.tsx                   ← projects overview
        projects/
          new/page.tsx             ← create project
          [projectId]/
            page.tsx               ← project detail + upload
            selection/page.tsx     ← view client selection + comments
    (client)/
      gallery/
        [token]/
          page.tsx                 ← client gallery (token-gated, no login wall for browsing)
          submit/page.tsx          ← submission confirmation
    (print)/
      download/
        [token]/
          page.tsx                 ← print user download portal
```

### Environment Variables to Add
```bash
# .env.local — add these to existing VayuTransfer env vars

# VayuStudio subdomain
NEXT_PUBLIC_STUDIO_URL=https://studio.vayutransfer.com

# Platform Owner super-admin credentials (server-side only, never expose to client)
PLATFORM_OWNER_EMAIL=your-email@vayutransfer.com
PLATFORM_OWNER_PASSWORD_HASH=<bcrypt hash>

# Watermark Lambda
WATERMARK_LAMBDA_ARN=arn:aws:lambda:ap-south-1:ACCOUNT:function:vayustudio-watermark
ZIP_LAMBDA_ARN=arn:aws:lambda:ap-south-1:ACCOUNT:function:vayustudio-zip

# S3 buckets (can reuse existing VayuTransfer bucket with prefix separation)
STUDIO_S3_BUCKET=vayutransfer-studio-originals
STUDIO_R2_BUCKET=vayutransfer-studio-previews

# CloudFront distribution for studio (separate from VayuTransfer CDN)
STUDIO_CLOUDFRONT_DOMAIN=https://dXXXXXXXX.cloudfront.net
STUDIO_CLOUDFRONT_KEY_PAIR_ID=APKA...
STUDIO_CLOUDFRONT_PRIVATE_KEY=<PEM key>

# Token expiry defaults (seconds)
CLIENT_LINK_EXPIRY_SECONDS=2592000     # 30 days
PRINT_LINK_EXPIRY_SECONDS=604800       # 7 days
```

---

## DYNAMODB SCHEMA

### New Tables (create these — do NOT modify existing VayuTransfer tables)

#### Table 1: `vayustudio-studios`
```
PK: studioId (String, UUID)
Attributes:
  - name (String) — studio display name
  - ownerUserId (String) — links to vayustudio-users
  - plan (String) — STARTER | PRO | STUDIO | ENTERPRISE
  - brandingConfig (Map):
      logoS3Key (String)
      primaryColor (String, hex)
      galleryTitle (String)
  - storageUsedBytes (Number)
  - projectCount (Number)
  - status (String) — ACTIVE | SUSPENDED
  - createdAt (String, ISO8601)
  - updatedAt (String, ISO8601)
  - featureFlags (Map):
      videoSupport (Boolean, default: true)
      watermarkToggle (Boolean, default: true)
      extendedStorage (Boolean, default: false)

GSI-1: status-createdAt-index (GSI on status + createdAt) — platform owner lists all studios
```

#### Table 2: `vayustudio-projects`
```
PK: studioId (String)
SK: projectId (String, UUID)
Attributes:
  - clientName (String)
  - clientEmail (String)
  - clientPhone (String)
  - eventDate (String, YYYY-MM-DD)
  - eventType (String) — WEDDING | PRE_WEDDING | CORPORATE | SCHOOL | OTHER
  - status (String) — DRAFT | ACTIVE | SELECTION_RECEIVED | COMPLETED
  - totalFiles (Number)
  - selectedFilesCount (Number)
  - editingRequiredCount (Number)
  - commentsCount (Number)
  - clientShareToken (String) — hashed token for share link
  - clientShareExpiresAt (String, ISO8601)
  - printShareToken (String) — hashed token for print link
  - printShareExpiresAt (String, ISO8601)
  - selectionSubmittedAt (String, ISO8601)
  - selectionLockedBy (String) — clientId who submitted
  - createdAt (String, ISO8601)
  - updatedAt (String, ISO8601)

GSI-1: status-createdAt-index (GSI on status + createdAt) — filter projects by status
GSI-2: clientShareToken-index (GSI on clientShareToken) — lookup project by share token
GSI-3: printShareToken-index (GSI on printShareToken) — lookup project by print token
```

#### Table 3: `vayustudio-mediafiles`
```
PK: projectId (String)
SK: fileId (String, UUID)
Attributes:
  - studioId (String)
  - originalFilename (String)
  - fileType (String) — IMAGE | VIDEO
  - mimeType (String)
  - sizeBytes (Number)
  - s3Key (String) — private S3 key for original
  - r2PreviewKey (String) — R2 key for watermarked 1080px JPEG
  - r2PreviewUrl (String) — public R2 URL for preview
  - watermarkEnabled (Boolean, default: true)
  - displayOrder (Number)
  - uploadedAt (String, ISO8601)
  - processingStatus (String) — UPLOADING | PROCESSING | READY | FAILED

GSI-1: studioId-uploadedAt-index — admin lists all files across projects
GSI-2: processingStatus-index — Lambda job queue monitoring
```

#### Table 4: `vayustudio-selections`
```
PK: projectId (String)
SK: fileId (String)
Attributes:
  - studioId (String)
  - clientId (String)
  - isSelected (Boolean)
  - editingRequired (Boolean, default: false)
  - comment (String, max 300 chars) — client's note to studio
  - selectedAt (String, ISO8601)
  - updatedAt (String, ISO8601)

GSI-1: projectId-isSelected-index — fetch only selected files for a project
GSI-2: projectId-editingRequired-index — fetch files needing edits
```

#### Table 5: `vayustudio-users`
```
PK: userId (String, UUID)
Attributes:
  - role (String) — OWNER | ADMIN | CLIENT | PRINT
  - email (String)
  - phone (String)
  - name (String)
  - passwordHash (String) — only for OWNER and ADMIN roles
  - linkedStudioId (String) — for ADMIN role
  - linkedProjectIds (List<String>) — for CLIENT and PRINT roles
  - status (String) — ACTIVE | SUSPENDED
  - lastLoginAt (String, ISO8601)
  - createdAt (String, ISO8601)
  - updatedAt (String, ISO8601)

GSI-1: email-index — login lookup by email
GSI-2: phone-index — OTP login lookup by phone
GSI-3: role-status-index — platform owner lists all users by role
GSI-4: linkedStudioId-index — get all users for a studio
```

#### Table 6: `vayustudio-auditlog`
```
PK: actorId (String)
SK: timestamp (String, ISO8601 + UUID suffix for uniqueness)
Attributes:
  - actorRole (String)
  - action (String) — e.g. USER_PROFILE_UPDATED, TOKEN_REVOKED, PROJECT_UNLOCKED
  - targetId (String)
  - targetType (String) — USER | PROJECT | STUDIO | TOKEN
  - metadata (Map) — action-specific details
  - ipAddress (String)
  - userAgent (String)

GSI-1: targetId-timestamp-index — see all actions on a specific resource
GSI-2: action-timestamp-index — filter audit log by action type
```

### DynamoDB Helper: Create All Tables
```bash
# Run this once to create all new VayuStudio tables
# Use existing AWS credentials from VayuTransfer setup

aws dynamodb create-table \
  --table-name vayustudio-studios \
  --attribute-definitions \
    AttributeName=studioId,AttributeType=S \
    AttributeName=status,AttributeType=S \
    AttributeName=createdAt,AttributeType=S \
  --key-schema AttributeName=studioId,KeyType=HASH \
  --global-secondary-indexes \
    '[{"IndexName":"status-createdAt-index","KeySchema":[{"AttributeName":"status","KeyType":"HASH"},{"AttributeName":"createdAt","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}}]' \
  --billing-mode PAY_PER_REQUEST \
  --region ap-south-1

# Repeat pattern for other tables — see schema above for GSI definitions
```

---

## API ROUTES

All routes live under `app/studio/api/` and are separate from VayuTransfer API routes.

### Authentication Routes

#### `POST /studio/api/auth/admin-login`
```typescript
// Body: { email: string, password: string }
// Returns: { token: string, role: 'OWNER' | 'ADMIN', studioId?: string }
// Logic:
//   1. Look up user by email in vayustudio-users (GSI-1)
//   2. Verify bcrypt password hash
//   3. Issue JWT with { userId, role, studioId, exp: 24h }
//   4. Write lastLoginAt to DynamoDB
//   5. If role === OWNER, write to auditlog
```

#### `POST /studio/api/auth/client-otp-request`
```typescript
// Body: { phone: string, projectToken: string }
// Returns: { sessionId: string }
// Logic:
//   1. Validate projectToken exists and is not expired (GSI on clientShareToken)
//   2. Generate 6-digit OTP, store in DynamoDB with 10-min TTL
//   3. Send OTP via AWS SNS SMS to the phone number
//   4. Return sessionId (do not return OTP)
```

#### `POST /studio/api/auth/client-otp-verify`
```typescript
// Body: { sessionId: string, otp: string, projectToken: string }
// Returns: { token: string, role: 'CLIENT' }
// Logic:
//   1. Verify OTP against stored value and TTL
//   2. Find or create CLIENT user record in vayustudio-users
//   3. Issue JWT with { userId, role: 'CLIENT', projectId, exp: 30d }
//   4. Delete used OTP from store
```

#### `POST /studio/api/auth/magic-link-send`
```typescript
// Body: { email: string, projectToken: string }
// Sends email via SES with a one-time magic link
// Link format: studio.vayutransfer.com/studio/magic?t=<signed-token>
```

#### `GET /studio/api/auth/magic-link-verify?t=<token>`
```typescript
// Validates signed magic link token
// Returns: { token: string, role: 'CLIENT' }
```

### Platform Owner Routes (OWNER role only — enforce in middleware)

#### `GET /studio/api/owner/dashboard`
```typescript
// Returns platform-wide metrics:
// { totalStudios, activeStudios, totalProjects, projectsToday,
//   uploadsToday, totalStorageBytes, mrrInr, failedJobsLast24h }
// Source: DynamoDB scans + Lambda CloudWatch metrics
```

#### `GET /studio/api/owner/studios`
```typescript
// Query params: status?, page?, limit?
// Returns: paginated list of studios with { studioId, name, plan, status,
//   storageUsedBytes, projectCount, createdAt }
```

#### `GET /studio/api/owner/studios/[studioId]`
```typescript
// Returns full studio record + usage stats + last 10 projects
```

#### `PATCH /studio/api/owner/studios/[studioId]`
```typescript
// Body: { status?, plan?, featureFlags? }
// Updates studio status, plan or feature flags
// Writes to auditlog
```

#### `POST /studio/api/owner/studios/[studioId]/impersonate`
```typescript
// Returns a short-lived impersonation JWT (1h) with role ADMIN
// scoped to the studioId — allows Platform Owner to see the exact
// studio admin view without knowing their password
// Writes IMPERSONATION_STARTED to auditlog with Platform Owner's userId
```

#### `GET /studio/api/owner/users`
```typescript
// Query params: role?, email?, phone?, page?, limit?
// Searches vayustudio-users by role, email or phone
```

#### `GET /studio/api/owner/users/[userId]`
```typescript
// Returns full user profile + linked projects + last login
```

#### `PATCH /studio/api/owner/users/[userId]`
```typescript
// Body: { name?, email?, phone?, status? }
// Platform Owner can update any user profile
// Writes to auditlog
```

#### `GET /studio/api/owner/tokens`
```typescript
// Lists all active access tokens with expiresAt, lastAccessedAt, lastIP
// Filterable by role (CLIENT | PRINT), studioId, expired?
```

#### `PATCH /studio/api/owner/tokens/[token]`
```typescript
// Body: { action: 'REVOKE' | 'EXTEND', extendBySeconds?: number }
// Revoke or extend any share/print link
// Writes to auditlog
```

#### `PATCH /studio/api/owner/projects/[projectId]/unlock`
```typescript
// Unlocks a locked client selection so client can resubmit
// Body: { reason: string }
// Writes to auditlog
// Sends notification email to studio admin
```

#### `GET /studio/api/owner/auditlog`
```typescript
// Query params: actorId?, targetId?, action?, from?, to?, page?
// Returns paginated audit log
```

### Studio Admin Routes (ADMIN role only)

#### `GET /studio/api/admin/projects`
```typescript
// Returns all projects for the authenticated studioId
// Sorted by updatedAt desc
// Includes status, totalFiles, selectedFilesCount, editingRequiredCount
```

#### `POST /studio/api/admin/projects`
```typescript
// Body: { clientName, clientEmail, clientPhone, eventDate, eventType }
// Creates new project with status DRAFT
// Returns: { projectId }
```

#### `PATCH /studio/api/admin/projects/[projectId]`
```typescript
// Body: { clientName?, clientEmail?, clientPhone?, eventDate?, eventType?, status? }
// Updates project metadata
```

#### `POST /studio/api/admin/projects/[projectId]/upload-url`
```typescript
// Body: { filename, mimeType, sizeBytes, partCount }
// Creates multipart upload — reuses existing VayuTransfer S3 presigned URL logic
// S3 key format: studios/{studioId}/projects/{projectId}/originals/{fileId}/{filename}
// Creates MediaFile record with status UPLOADING
// Returns: { fileId, uploadId, presignedUrls: string[] }
```

#### `POST /studio/api/admin/projects/[projectId]/upload-complete`
```typescript
// Body: { fileId, uploadId, parts: [{ ETag, PartNumber }] }
// Completes S3 multipart upload
// Updates MediaFile status to PROCESSING
// Triggers Watermark Lambda asynchronously
// Returns: { fileId, status: 'PROCESSING' }
```

#### `DELETE /studio/api/admin/projects/[projectId]/files/[fileId]`
```typescript
// Deletes: S3 original + R2 preview + MediaFile record
// Cannot delete if project status is SELECTION_RECEIVED or COMPLETED
```

#### `PATCH /studio/api/admin/projects/[projectId]/files/[fileId]`
```typescript
// Body: { watermarkEnabled?, displayOrder? }
// Toggle watermark or reorder a file
// If watermarkEnabled changes, re-trigger Watermark Lambda
```

#### `POST /studio/api/admin/projects/[projectId]/share-link`
```typescript
// Generates a new client share link (invalidates previous if exists)
// Body: { expiryDays?: number } — default 30
// Returns: { shareUrl: 'https://studio.vayutransfer.com/studio/gallery/<token>' }
// Sends share link via email to clientEmail using SES
```

#### `POST /studio/api/admin/projects/[projectId]/print-link`
```typescript
// Generates a print user access link (only after selection received)
// Body: { expiryDays?: number } — default 7
// Returns: { printUrl: 'https://studio.vayutransfer.com/studio/download/<token>' }
```

#### `GET /studio/api/admin/projects/[projectId]/selection`
```typescript
// Returns all selected files with their comments and editingRequired flags
// Includes summary: { totalSelected, editingRequired, withComments }
```

#### `POST /studio/api/admin/projects/[projectId]/selection/download`
```typescript
// Triggers ZIP Lambda to package all selected originals from S3
// Returns: { jobId } — client polls /download-status/[jobId]
```

#### `GET /studio/api/admin/projects/[projectId]/selection/download-status/[jobId]`
```typescript
// Returns: { status: 'PENDING' | 'READY' | 'FAILED', downloadUrl?: string }
// downloadUrl is a CloudFront signed URL (expiry 1h)
```

#### `POST /studio/api/admin/projects/[projectId]/selection/reset`
```typescript
// Unlocks the client selection so client can change and resubmit
// Only available to studio admin (or Platform Owner)
```

### Client Routes (CLIENT role only, token-gated)

#### `GET /studio/api/client/gallery/[token]`
```typescript
// Validates token, returns project + all MediaFiles
// Each file includes: r2PreviewUrl, fileType, displayOrder, fileId
// Also returns: { projectName, studioName, studioLogo, totalFiles }
// Does NOT return s3Key or any private storage reference
// Updates clientShareToken lastAccessedAt
```

#### `GET /studio/api/client/gallery/[token]/selections`
```typescript
// Returns existing selections for this client (so UI can restore state on revisit)
// Returns: [{ fileId, isSelected, editingRequired, comment }]
```

#### `PUT /studio/api/client/gallery/[token]/selections/[fileId]`
```typescript
// Body: { isSelected: boolean, editingRequired?: boolean, comment?: string }
// Upserts a single selection record
// editingRequired defaults to false if not provided
// comment max 300 chars — validate server-side
// Only allowed if project status is ACTIVE (not locked)
```

#### `POST /studio/api/client/gallery/[token]/submit`
```typescript
// Locks the selection — sets project status to SELECTION_RECEIVED
// Validates: at least 1 photo selected
// Returns: { totalSelected, editingRequired, withComments }
// Triggers notification Lambda: email to studio admin + confirmation to client
// After this call, PUT selections returns 403 until admin resets
```

### Print User Routes (PRINT token-gated, no JWT required)

#### `GET /studio/api/print/[token]`
```typescript
// Validates print token, returns only SELECTED files
// Each file: { fileId, originalFilename, r2PreviewUrl, displayOrder }
// Does NOT issue JWT — all print routes use the token directly
// Updates printShareToken lastAccessedAt and lastIP
```

#### `GET /studio/api/print/[token]/download/[fileId]`
```typescript
// Returns a CloudFront signed URL for the S3 original (expiry 1h)
// Only for files in the SELECTED set for this project
```

#### `POST /studio/api/print/[token]/download-all`
```typescript
// Triggers ZIP Lambda for all selected files
// Returns: { jobId }
// Poll /print/[token]/download-all-status/[jobId] for completion
```

---

## LAMBDA FUNCTIONS

### Lambda 1: `vayustudio-watermark`
```
Trigger: Invoked by /upload-complete API route (async invoke)
Runtime: Node.js 20
Memory: 1024 MB
Timeout: 5 minutes
Layers: sharp (use Lambda layer for sharp — do not bundle)

Input event:
{
  "fileId": "uuid",
  "projectId": "uuid",
  "studioId": "uuid",
  "s3Bucket": "vayutransfer-studio-originals",
  "s3Key": "studios/.../originals/.../filename.jpg",
  "r2Bucket": "vayutransfer-studio-previews",
  "r2Key": "studios/.../previews/fileId.jpg",
  "logoS3Key": "studios/studioId/logo.png",
  "watermarkEnabled": true
}

Logic:
  1. Download original from S3 using getObject
  2. Download studio logo from S3
  3. Use sharp to resize original to max 1080px on longest side
  4. If watermarkEnabled: composite studio logo (bottom-right, 15% width, 70% opacity)
  5. Upload result to Cloudflare R2 via S3-compatible API (R2 endpoint)
  6. Update MediaFile in DynamoDB:
       processingStatus = READY
       r2PreviewUrl = public R2 URL
  7. On error: set processingStatus = FAILED, log to CloudWatch

Note: For VIDEO files, generate a thumbnail from frame 0 using ffprobe/ffmpeg layer
      Save thumbnail to R2 as preview; do not transcode video in Phase 1
```

### Lambda 2: `vayustudio-zip`
```
Trigger: Invoked by /selection/download and /print/download-all API routes
Runtime: Node.js 20
Memory: 3008 MB
Timeout: 15 minutes
Ephemeral storage: 10 GB (/tmp)

Input event:
{
  "jobId": "uuid",
  "projectId": "uuid",
  "studioId": "uuid",
  "fileIds": ["uuid1", "uuid2", ...],
  "outputS3Bucket": "vayutransfer-studio-originals",
  "outputS3Key": "studios/studioId/zips/jobId.zip"
}

Logic:
  1. Fetch MediaFile records for all fileIds from DynamoDB
  2. Stream each S3 original into archiver.js ZIP stream
  3. Use filename: {displayOrder}_{originalFilename}
  4. Upload completed ZIP to S3 at outputS3Key
  5. Generate CloudFront signed URL for the ZIP (expiry 1h)
  6. Write result to a DynamoDB jobs table: { jobId, status: READY, downloadUrl }
  7. Set S3 lifecycle rule on ZIP object: delete after 24h
  8. On error: write status: FAILED to jobs table
```

### Lambda 3: `vayustudio-notify`
```
Trigger: Invoked by /submit, /share-link, /print-link API routes
Runtime: Node.js 20
Memory: 256 MB
Timeout: 30 seconds

Input event:
{
  "type": "SELECTION_SUBMITTED" | "SHARE_LINK_SENT" | "PRINT_LINK_OPENED" | "CLIENT_CONFIRMATION",
  "studioId": "uuid",
  "projectId": "uuid",
  "recipientEmail": "string",
  "payload": { ... type-specific data ... }
}

Email templates (inline, no external template service):
  SELECTION_SUBMITTED → to studio admin:
    Subject: "[VayuStudio] {clientName} has submitted their photo selection"
    Body: Project name, total selected, editing required count, comments count,
          CTA button: "View Selection" → studio.vayutransfer.com/studio/dashboard/projects/{projectId}/selection

  CLIENT_CONFIRMATION → to client:
    Subject: "Your photo selection has been submitted — {studioName}"
    Body: Thank you message, selected count, studio contact info

  SHARE_LINK_SENT → to client:
    Subject: "Your wedding gallery is ready — {studioName}"
    Body: Gallery link, expiry date, how to use guide

  PRINT_LINK_OPENED → to studio admin:
    Subject: "[VayuStudio] Print user accessed the album files"
    Body: Timestamp, IP address, project name
```

---

## MIDDLEWARE

### `middleware.ts` — add to existing VayuTransfer middleware
```typescript
// Add studio subdomain routing to existing middleware
// Pattern: if host === studio.vayutransfer.com, rewrite to /studio/*

import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'

const STUDIO_PROTECTED_PREFIXES = [
  '/studio/api/owner/',    // OWNER role required
  '/studio/api/admin/',    // ADMIN or OWNER role required
  '/studio/dashboard/',    // ADMIN or OWNER role required
  '/studio/admin/',        // OWNER role required
]

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host') || ''
  const path = request.nextUrl.pathname

  // Studio subdomain routing
  if (host === 'studio.vayutransfer.com' && !path.startsWith('/studio')) {
    return NextResponse.rewrite(new URL(`/studio${path}`, request.url))
  }

  // Studio API auth enforcement
  if (path.startsWith('/studio/api/owner/')) {
    const auth = await verifyStudioJWT(request)
    if (!auth || auth.role !== 'OWNER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  if (path.startsWith('/studio/api/admin/')) {
    const auth = await verifyStudioJWT(request)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/studio/:path*']
}
```

### `lib/studio/auth.ts` — JWT utilities for VayuStudio
```typescript
// JWT payload shape for VayuStudio tokens
interface StudioJWTPayload {
  userId: string
  role: 'OWNER' | 'ADMIN' | 'CLIENT' | 'PRINT'
  studioId?: string      // present for ADMIN role
  projectId?: string     // present for CLIENT role
  isImpersonation?: boolean  // true when Platform Owner impersonates
  originalUserId?: string    // Platform Owner's userId during impersonation
  exp: number
}

// Use a SEPARATE JWT secret from VayuTransfer main app
// Add STUDIO_JWT_SECRET to .env.local
```

---

## UI COMPONENTS TO BUILD

### Shared Components (`components/studio/`)
```
StudioLayout.tsx          — shell with sidebar nav, adapts per role
RoleBadge.tsx             — colour-coded badge: OWNER | ADMIN | CLIENT | PRINT
ProjectStatusBadge.tsx    — DRAFT | ACTIVE | SELECTION_RECEIVED | COMPLETED
FileGrid.tsx              — responsive photo/video grid with lazy loading
FileCard.tsx              — single photo card with heart, comment, edit-flag overlay
SelectionPanel.tsx        — slide-in panel showing selected photos + per-photo comments
ConfirmModal.tsx          — submission confirmation showing counts
UploadZone.tsx            — drag-and-drop uploader reusing VayuTransfer multipart logic
ProgressBar.tsx           — per-file upload progress (can reuse from VayuTransfer)
```

### Page-Specific Components

#### Client Gallery (`app/studio/(client)/gallery/[token]/`)
```
GalleryHeader.tsx
  - Studio logo + name (left)
  - "X of Y selected" counter (centre)
  - "Submit Selection" button (right, disabled until ≥1 selected)

PhotoCard.tsx
  - Watermarked preview image (from r2PreviewUrl)
  - Heart toggle (top-right corner overlay)
  - On heart toggle ON → show inline expansion below card:
      [ Editing required? ]  [ Toggle: No / Yes ]
      [ Comment for studio ] [ _____________ max 300 chars ]
  - On heart toggle OFF → collapse panel, clear comment and editingRequired
  - All three fields saved together via PUT /selections/[fileId]

VideoCard.tsx
  - Thumbnail preview with play icon overlay
  - Same heart + comment UI as PhotoCard
  - Click thumbnail → opens lightbox with video player

SubmitModal.tsx
  Shows before final submission:
  ┌────────────────────────────────────────────┐
  │  Ready to submit your selection?           │
  │                                            │
  │  📸 Photos selected:        42             │
  │  ✏️  Editing required:       8              │
  │  💬 With comments:          12             │
  │                                            │
  │  Once submitted, you cannot change your    │
  │  selection without contacting the studio.  │
  │                                            │
  │  [ Cancel ]          [ Confirm & Submit ]  │
  └────────────────────────────────────────────┘
```

#### Studio Admin Selection View (`app/studio/(studio-admin)/dashboard/projects/[projectId]/selection/`)
```
SelectionSummaryBar.tsx
  - Total selected | Editing required (orange badge) | With comments (blue badge)
  - "Download Selected ZIP" button → triggers ZIP Lambda, shows progress

SelectionGrid.tsx
  - Shows only selected files
  - Each card shows:
      - Full preview image
      - If editingRequired: orange "Edit required" badge top-left
      - If comment exists: speech bubble icon, click to expand comment
      - Comment shown in side panel or tooltip

CommentSidePanel.tsx
  - Slide-in panel listing all photos with comments
  - Shows: photo thumbnail | comment text | editingRequired badge
  - Read-only (studio admin cannot edit client comments)
```

#### Platform Owner Dashboard (`app/studio/(platform-owner)/admin/`)
```
PlatformMetricsBar.tsx
  Row of metric cards:
  [ Active Studios ] [ Projects Today ] [ Uploads Today ]
  [ Total Storage  ] [ MRR (₹)        ] [ Failed Jobs   ]

StudioTable.tsx
  Columns: Studio Name | Plan | Status | Projects | Storage | Created | Actions
  Actions: View | Impersonate | Suspend | Edit Plan

UserSearchTable.tsx
  Search by email or phone
  Columns: Name | Role | Email | Phone | Status | Last Login | Actions
  Actions: View Profile | Edit | Suspend | View Projects

TokenTable.tsx
  Columns: Type | Project | Expires | Last Accessed | IP | Actions
  Actions: Revoke | Extend 7 days | Extend 30 days

AuditLogTable.tsx
  Columns: Actor | Action | Target | Timestamp | IP
  Filterable by: actor, action type, target, date range
```

---

## S3 BUCKET STRUCTURE

```
vayutransfer-studio-originals/          ← private S3 bucket
  studios/
    {studioId}/
      logo.png                          ← studio branding logo
      projects/
        {projectId}/
          originals/
            {fileId}/
              {originalFilename}        ← RAW original, never public
          zips/
            {jobId}.zip                 ← temp ZIP, lifecycle delete after 24h

vayutransfer-studio-previews/           ← Cloudflare R2 bucket (public)
  studios/
    {studioId}/
      projects/
        {projectId}/
          previews/
            {fileId}.jpg                ← watermarked 1080px JPEG, publicly readable
          thumbnails/
            {fileId}.jpg                ← video thumbnail (Phase 1 videos)
```

### S3 Bucket Policies
```json
// vayutransfer-studio-originals — PRIVATE (no public access)
// Access only via:
//   - Lambda execution role (for watermark + ZIP jobs)
//   - CloudFront signed URL (for admin and print user downloads)
//   - Presigned URLs (for multipart upload from Next.js API only)

// CloudFront Origin Access Control (OAC) must be configured on this bucket
// Lifecycle rule: move to S3-IA after 90 days, delete after 365 days
//   EXCEPT objects with prefix studios/*/zips/ → delete after 1 day
```

---

## CLOUDFRONT SETUP FOR STUDIO

```
Create a separate CloudFront distribution for VayuStudio:

Origin: vayutransfer-studio-originals (S3)
Origin Access: OAC (Origin Access Control) — NOT legacy OAI
Price Class: PriceClass_200 (includes Asia Pacific — Mumbai edge)
Cache Policy: CachingDisabled (all studio URLs are signed, no caching of originals)
Viewer Protocol: HTTPS only
Signed URLs: Yes — use CloudFront key pair
  Key Pair ID: stored in STUDIO_CLOUDFRONT_KEY_PAIR_ID env var
  Private Key: stored in STUDIO_CLOUDFRONT_PRIVATE_KEY env var

Signed URL generation (in Next.js API):
  Expiry: 1 hour for download URLs, 15 minutes for preview fallback
  Use @aws-sdk/cloudfront-signer package
```

---

## CLOUDFLARE R2 SETUP FOR STUDIO

```
R2 bucket: vayutransfer-studio-previews
Access: Public (previews are watermarked — safe to make public)
Custom domain: previews.studio.vayutransfer.com → R2 bucket

Configure in R2 dashboard:
  - Enable public access
  - Add custom domain: previews.studio.vayutransfer.com
  - Cloudflare will automatically provision SSL

In Lambda watermark function, upload to R2 via S3-compatible API:
  Endpoint: https://<account-id>.r2.cloudflarestorage.com
  Credentials: R2 API token (add R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY to env)
  Bucket: vayutransfer-studio-previews

Preview URL format:
  https://previews.studio.vayutransfer.com/studios/{studioId}/projects/{projectId}/previews/{fileId}.jpg
```

---

## FEATURE FLAGS PER STUDIO

Stored in `vayustudio-studios.featureFlags` (Map in DynamoDB).
Platform Owner can toggle via `/studio/api/owner/studios/[studioId]` PATCH.

```typescript
interface StudioFeatureFlags {
  videoSupport: boolean        // default: true  — allow video uploads
  watermarkToggle: boolean     // default: true  — studio can toggle watermark per file
  extendedStorage: boolean     // default: false — storage retained >90 days
  multiEventProjects: boolean  // default: false — Phase 2: multiple events per project
  clientComments: boolean      // default: true  — client can add comments on selection
  editingRequired: boolean     // default: true  — client can flag editing required
}
```

---

## IMPERSONATION FLOW (Platform Owner)

```
1. Platform Owner calls POST /studio/api/owner/studios/[studioId]/impersonate
2. Server issues short-lived JWT:
   {
     userId: studioAdminUserId,
     role: 'ADMIN',
     studioId: studioId,
     isImpersonation: true,
     originalUserId: ownerUserId,   ← preserved for audit
     exp: now + 1hour
   }
3. Server writes to auditlog:
   { action: 'IMPERSONATION_STARTED', actorId: ownerUserId, targetId: studioId }
4. Response includes the impersonation JWT
5. Platform Owner frontend stores token and redirects to:
   /studio/dashboard (studio admin view)
6. A persistent banner is shown: "Viewing as {studioName} — Exit Impersonation"
7. Exit button clears the impersonation JWT and returns to /studio/admin
8. All API calls during impersonation write to auditlog with isImpersonation: true
```

---

## EMAIL TEMPLATES (AWS SES)

Use inline HTML templates in the Notify Lambda. Style consistently with VayuTransfer emails.
All emails include:
- Studio logo (if configured) or VayuStudio logo as fallback
- Studio name in subject line
- Footer: "Powered by VayuStudio | studio.vayutransfer.com"

SES sender: `noreply@vayutransfer.com` (use existing verified domain)
Reply-to: studio's email address

---

## SECURITY CHECKLIST

- [ ] All S3 originals bucket: Block Public Access = ON
- [ ] All CloudFront URLs for originals use signed URLs with short expiry (1h max)
- [ ] R2 previews are watermarked before upload — safe to be public
- [ ] JWT secret for VayuStudio (STUDIO_JWT_SECRET) is different from VayuTransfer JWT secret
- [ ] Platform Owner credentials are env vars only — never in DB (no DynamoDB lookup for OWNER login)
- [ ] Impersonation tokens are flagged in JWT and all actions logged to auditlog
- [ ] Client token (gallery link) does not grant API access beyond their projectId
- [ ] Print token does not grant selection rights — read + download only
- [ ] Rate limit OTP endpoint: max 3 attempts per phone per 10 minutes (use DynamoDB TTL counter)
- [ ] All file deletions check studioId ownership before proceeding
- [ ] ZIP Lambda validates fileIds belong to the correct projectId before packaging
- [ ] Comment field sanitised server-side (strip HTML, enforce 300 char limit)
- [ ] Audit log is append-only — no UPDATE or DELETE operations on auditlog table

---

## PHASE 1 SUCCESS METRICS

- 20 active studios onboarded within 3 months of launch
- 100+ projects created
- Client gallery completion rate > 80% (client submits selection)
- Upload success rate > 99%
- Gallery load time < 2 seconds on Indian 4G (test via BrowserStack on Jio SIM profile)
- Zero security incidents (no unauthorised file access)

---

## OUT OF SCOPE FOR PHASE 1

Do NOT build these — they are Phase 2 or later:
- Razorpay subscription billing for studios (plans are manually managed by Platform Owner)
- Contract generation and digital signature
- Invoice and payment collection from clients
- Shoot scheduling calendar
- Editor / retoucher collaboration portal
- Album design approval workflow
- Print order dispatch tracking
- Multi-branch / white-label per studio (custom domain per studio)
- AI face grouping via AWS Rekognition
- Video transcoding via AWS MediaConvert (Phase 1: thumbnail only)
- Native mobile app (web-first)
- Hindi UI labels (English only in Phase 1)

---

## BUILD ORDER RECOMMENDATION FOR CLAUDE CODE

Follow this sequence to avoid blockers:

```
Week 1-2:
  1. DynamoDB table creation (all 6 tables + GSIs)
  2. lib/studio/auth.ts — JWT sign/verify with role system
  3. middleware.ts — subdomain routing + role enforcement
  4. POST /auth/admin-login — Platform Owner + Studio Admin login
  5. POST /auth/client-otp-request + verify
  6. app/studio/login page

Week 3-4:
  7. POST /admin/projects — create project
  8. GET /admin/projects — list projects
  9. POST /admin/projects/[projectId]/upload-url — multipart S3 (reuse VayuTransfer)
  10. POST /admin/projects/[projectId]/upload-complete
  11. vayustudio-watermark Lambda + deploy
  12. app/studio/dashboard/projects pages (list + new)

Week 5-6:
  13. POST /admin/projects/[projectId]/share-link
  14. GET /client/gallery/[token] — gallery data
  15. PUT /client/gallery/[token]/selections/[fileId] — heart + comment + editingRequired
  16. POST /client/gallery/[token]/submit — lock selection
  17. app/studio/gallery/[token] — full client gallery UI
  18. vayustudio-notify Lambda — SHARE_LINK_SENT + SELECTION_SUBMITTED + CLIENT_CONFIRMATION

Week 7:
  19. GET /admin/projects/[projectId]/selection — admin selection view
  20. POST /admin/projects/[projectId]/selection/download — trigger ZIP
  21. vayustudio-zip Lambda + deploy
  22. app/studio/dashboard/projects/[projectId]/selection page

Week 8:
  23. POST /admin/projects/[projectId]/print-link
  24. GET /print/[token] + /print/[token]/download/[fileId]
  25. app/studio/download/[token] — print portal

Week 9:
  26. Remaining notify Lambda event types
  27. SES email templates

Week 10:
  28. GET /owner/dashboard — platform metrics
  29. GET/PATCH /owner/studios — studio management
  30. GET/PATCH /owner/users — user management
  31. PATCH /owner/tokens — revoke/extend
  32. POST /owner/studios/[studioId]/impersonate
  33. GET /owner/auditlog
  34. app/studio/admin/* pages — Platform Owner panel

Week 11-12:
  35. QA, load testing, mobile browser testing
  36. Fix upload failures and retry logic
  37. Beta onboarding with 3 studios
```

---

*VayuStudio — built on VayuTransfer infrastructure*
*studio.vayutransfer.com | Radhakanta, Founder*
