# VAYU PLATFORM — R2 ARCHITECTURE MIGRATION
# VayuTransfer + VayuStudios — Zero Egress Cost Redesign
# Claude Code Session Prompt — Paste this as first message

---

## WHO YOU ARE WORKING WITH

You are working on two LIVE products with real users:
- **VayuTransfer** (vayutransfer.com) — file transfer platform, prepaid wallet
- **VayuStudios** (vayustudios.com) — wedding photo gallery CRM

BOTH HAVE LIVE USERS. Every change must be zero-downtime and backwards compatible.
Old S3 links must keep working during and after migration.

---

## WHY WE ARE DOING THIS

Current problem:
```
S3 egress cost: ₹9.29 per GB downloaded
Studio downloads 100GB selected photos = ₹929 per event
Indian rural studios cannot afford this
```

Solution:
```
Cloudflare R2 egress cost: ₹0 forever
Same 100GB download = ₹0
R2 uses S3-compatible API — same SDK, minimal code change
```

---

## CURRENT ARCHITECTURE (what exists today)

### VayuTransfer (current — HIGH COST)
```
User uploads file
  → AWS S3 bucket (ap-south-1)
  → DynamoDB metadata
  → Presigned S3 URL generated
  → User downloads directly from S3
  → Cost: ₹9.29/GB every download ❌

Multi-file download:
  → ZIP Lambda creates ZIP in S3
  → CloudFront serves ZIP
  → Cost: ₹9.69/GB egress ❌

No upload resume on failure ❌
No download resume on failure ❌
```

### VayuStudios (current — MIXED)
```
Studio uploads RAW photos
  → AWS S3 vayustudio-originals (private) ← expensive to download
  → Watermark Lambda → Cloudflare R2 preview bucket ← free to browse ✅
  → DynamoDB MediaFile records

Client gallery browsing:
  → R2 watermarked previews → ₹0 egress ✅ CORRECT

AI face indexing:
  → Rekognition reads directly from S3
  → Will need change after migration

Studio downloads selected photos:
  → CloudFront → S3 originals → ₹9.29/GB ❌

R2 preview paths may be visible in UI ❌ security risk
```

---

## TARGET ARCHITECTURE (what we are building)

### R2 Bucket Plan — Create These 5 Buckets in Cloudflare

```
BUCKET 1: vayutransfer-original
  Access:   PRIVATE (no public access)
  Contents: All uploaded files from VayuTransfer
  Lifecycle: 10 days default TTL (configurable per plan)
  Serves:   Presigned URL only (1 hour expiry)

BUCKET 2: vayutransfer-temporary
  Access:   PRIVATE
  Contents: ZIP bundles for multi-file downloads
  Lifecycle: AUTO-DELETE after 2 hours (R2 lifecycle rule)
  Serves:   Presigned URL only

BUCKET 3: vayustudio-original
  Access:   PRIVATE
  Contents: RAW wedding photos from VayuStudios uploads
  Lifecycle: Per studio plan (no auto-delete)
  Serves:   Presigned URL only — studio admins only

BUCKET 4: vayustudio-preview
  Access:   PUBLIC (Cloudflare CDN)
  Contents: Watermarked 1080px JPEGs + face thumbnails
  Cache:    CacheControl: public, max-age=31536000, immutable
  Serves:   Public CDN URL (already correct — keep as is)

BUCKET 5: vayustudio-guest
  Access:   PRIVATE
  Contents: Compressed high-quality JPEGs for guest downloads
  Lifecycle: Linked to project lifetime
  Serves:   Presigned URL only — guest sessions only
```

---

## THE GOLDEN SECURITY RULE

```
R2 PATHS AND BUCKET NAMES MUST NEVER APPEAR IN:
  ❌ Any API response body
  ❌ Any page HTML source
  ❌ Any JavaScript bundle (no process.env.R2_BUCKET in client code)
  ❌ Browser DevTools network tab
  ❌ Any URL in browser address bar

CORRECT pattern:
  Client calls: POST /api/download/presigned { fileId }
  Server:       looks up r2Key from DynamoDB
                generates presigned URL (r2Key stays server-side)
  Response:     { downloadUrl: "https://...presigned...", filename, size }
  Client:       downloads from presigned URL

WRONG pattern:
  Response: { r2Key: "studios/abc/originals/photo.jpg" }  ← NEVER
  Response: { url: "https://abc.r2.cloudflarestorage.com/..." }  ← NEVER
```

---

## ZERO DOWNTIME MIGRATION STRATEGY

### The storageBackend Field — Most Critical Change

Add `storageBackend: "S3" | "R2"` to ALL DynamoDB file records.

```
Existing files → storageBackend = "S3" (default, batch update)
New uploads    → storageBackend = "R2"

Download API logic:
  if (file.storageBackend === "S3") {
    // serve from existing S3 presigned URL
    url = await generateS3PresignedUrl(file.s3Key)
  } else {
    // serve from R2 presigned URL
    url = await generateR2PresignedUrl(file.r2Key)
  }

This means OLD and NEW files work simultaneously.
No user sees any difference.
Migration is completely invisible.
```

### Migration Phases

```
Phase 1 (Week 1, Day 1 — DEPLOY FIRST):
  Add storageBackend field to DynamoDB schemas
  Batch update all existing records to storageBackend="S3"
  Update download API to check storageBackend
  ZERO impact — just adds a field and a conditional

Phase 2 (Week 1):
  Create 5 R2 buckets in Cloudflare dashboard
  Add R2 env vars to .env.local and Vercel
  Create lib/r2.ts R2 client utility
  Test R2 read/write from Lambda
  DO NOT change any upload or download logic yet

Phase 3 (Week 2):
  Switch VayuTransfer new uploads to R2 vayutransfer-original
  Old files: storageBackend=S3, served from S3
  New files: storageBackend=R2, served from R2
  Both work. No user impact.

Phase 4 (Week 2):
  Switch VayuStudios new uploads to R2 vayustudio-original
  Update Watermark Lambda: read from R2 (check storageBackend field)
  Update IndexFaces Lambda: download R2 bytes → send to Rekognition as bytes
  Old projects: still served from S3
  New projects: served from R2

Phase 5 (Week 3):
  Background migration Lambda: S3 → R2 for all existing files
  Rate limited: 100 files/minute (respect R2 rate limits)
  For each file: copy S3 → R2, verify MD5 checksum, update storageBackend=R2
  DO NOT delete from S3 yet

Phase 6 (Week 4):
  After 7 days of clean R2-only serving with zero errors
  Delete S3 originals (keep S3 bucket empty 30 days before closing)
  Remove S3 credentials from env vars
```

---

## NEW FEATURES TO BUILD

### Feature 1: Resumable Upload (Both Products)

```
Upload flow:
  1. POST /api/upload/init-multipart
     Body: { filename, fileSize, mimeType, product: "TRANSFER"|"STUDIO" }
     Returns: { uploadId, fileId, partPresignedUrls: string[] }
     Part size: 50MB chunks
     Presigned URLs: direct to R2 (client uploads without going through server)

  2. Browser uploads parts in parallel (max 5 concurrent)
     PUT directly to R2 presigned URL for each part
     On success: collect ETag from response header

  3. localStorage persistence for resume:
     Key: "upload_${fileId}"
     Value: { uploadId, fileId, completedParts: [{ETag, PartNumber}], filename }
     Update localStorage after each successful part

  4. On network failure:
     Show: "Upload paused — connection lost"
     On reconnect: resume from localStorage
     GET /api/upload/${uploadId}/status → returns completedParts from DynamoDB
     Skip completed parts, continue from last failed

  5. POST /api/upload/${uploadId}/complete
     Body: { parts: [{ETag, PartNumber}] }
     Server calls R2 CompleteMultipartUpload
     Triggers metadata extraction Lambda async
     Returns: { fileId, status: "READY" }

  6. Abort: POST /api/upload/${uploadId}/abort
     Calls R2 AbortMultipartUpload
     Cleans up DynamoDB
     Clears localStorage

UI states:
  IDLE → UPLOADING (progress bar per file) → PAUSED → RESUMING → COMPLETE
```

### Feature 2: Resumable Download

```
Single file download:
  POST /api/download/presigned { fileId, token }
  Returns: { downloadUrl, filename, sizeBytes }
  Client: window.location.href = downloadUrl OR fetch with Range header
  R2 supports HTTP Range requests natively — browser resume works automatically

ZIP download (multiple files or > 200MB):
  POST /api/download/zip/init { fileIds[], token }
  Returns: { jobId }

  ZIP Worker Lambda:
    1. Stream each file from R2 (GetObjectCommand with streaming)
    2. Pipe through archiver.js in streaming mode (never full file in memory)
    3. Pipe ZIP stream to R2 vayutransfer-temporary via multipart upload
    4. Update DynamoDB job progress every 10 files: { processed, total, percent }
    5. On complete: generate presigned URL for ZIP (expiry 2 hours)
    6. Update job: { status: "READY", downloadUrl, filename: "files.zip" }

  Client polls: GET /api/download/zip/${jobId}/status every 3 seconds
  Show progress bar: "Creating ZIP... 67% (334 of 500 files)"
  On READY: show Download button with presigned URL
  ZIP auto-deletes from vayutransfer-temporary after 2 hours (R2 lifecycle)
```

### Feature 3: File Metadata Extraction

```
After upload complete, Lambda extracts metadata and stores in DynamoDB:

// DynamoDB: vayutransfer-files table fields to ADD
fileId:           String (UUID)
originalFilename: String
fileExtension:    String (.jpg .mp4 .pdf)
mimeType:         String
sizeBytes:        Number
sizeFormatted:    String ("2.4 GB")
r2Bucket:         String (server-side only)
r2Key:            String (server-side only, NEVER in API response)
storageBackend:   String "R2"
checksum:         String (MD5 from multipart ETags)
uploadedAt:       String ISO8601
uploadDurationMs: Number
status:           String UPLOADING|READY|DELETED|EXPIRED
expiresAt:        Number (Unix TTL for DynamoDB auto-delete)

// Image-specific (extract with sharp):
imageWidth:       Number
imageHeight:      Number
imageFormat:      String (JPEG PNG WEBP RAW CR2 NEF)
colorSpace:       String

// Video-specific (extract with ffprobe in Lambda layer):
videoDuration:    Number (seconds)
videoResolution:  String (4K 1080p 720p)
videoCodec:       String (H.264 H.265 ProRes)
videoFps:         Number
```

### Feature 4: Updated Rekognition for R2

```
AWS Rekognition CANNOT read from R2 directly.
Solution: download from R2 in Lambda, pass as raw bytes.

// lambdas/vayustudio-indexfaces/index.mjs
// Replace S3Object reference with raw bytes:

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  }
})

// Download from R2 as bytes
const obj = await r2.send(new GetObjectCommand({
  Bucket: 'vayustudio-original',
  Key: mediaFile.r2Key,
}))
const imageBytes = await obj.Body.transformToByteArray()

// Send bytes to Rekognition (no S3 needed)
await rekognition.send(new IndexFacesCommand({
  CollectionId: `vayustudio-${projectId}`,
  Image: { Bytes: imageBytes },  // ← bytes instead of S3Object
  ExternalImageId: fileId,
  MaxFaces: 20,
  QualityFilter: 'MEDIUM',
}))

// Cost: R2 download in Lambda = ₹0 (R2 free egress)
// Rekognition cost: same as before ($0.001 per image)
// Extra latency: ~100ms for R2 download (acceptable for background job)

// Also update Watermark Lambda same way:
// Check mediaFile.storageBackend
// If "R2": read from r2 client
// If "S3": read from s3 client (backwards compat during migration)
```

---

## R2 CLIENT UTILITY

Create this file first — used everywhere:

```typescript
// lib/r2.ts
import { S3Client, GetObjectCommand, PutObjectCommand,
         DeleteObjectCommand, CreateMultipartUploadCommand,
         UploadPartCommand, CompleteMultipartUploadCommand,
         AbortMultipartUploadCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  }
})

export async function generateR2PresignedUrl(
  bucket: string,
  key: string,
  expiresIn: number = 3600,
  filename?: string
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ResponseContentDisposition: filename
      ? `attachment; filename="${filename}"`
      : undefined,
  })
  return getSignedUrl(r2, command, { expiresIn })
}

export async function generateDownloadUrl(
  file: { storageBackend: string, r2Key?: string, s3Key?: string,
          r2Bucket?: string, s3Bucket?: string, originalFilename: string }
): Promise<string> {
  if (file.storageBackend === 'R2') {
    return generateR2PresignedUrl(
      file.r2Bucket!,
      file.r2Key!,
      3600,
      file.originalFilename
    )
  } else {
    // S3 fallback for existing files during migration
    return generateS3PresignedUrl(file.s3Bucket!, file.s3Key!, file.originalFilename)
  }
}
```

---

## ENVIRONMENT VARIABLES

```bash
# Add to .env.local AND Vercel project settings

# Cloudflare R2 (get from R2 dashboard → Manage API tokens)
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key-id
R2_SECRET_ACCESS_KEY=your-r2-secret-access-key
R2_ENDPOINT=https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com

# R2 bucket names
R2_VAYUTRANSFER_ORIGINAL=vayutransfer-original
R2_VAYUTRANSFER_TEMPORARY=vayutransfer-temporary
R2_VAYUSTUDIO_ORIGINAL=vayustudio-original
R2_VAYUSTUDIO_PREVIEW=vayustudio-preview
R2_VAYUSTUDIO_GUEST=vayustudio-guest

# Public URL for preview bucket
R2_PREVIEW_PUBLIC_URL=https://previews.vayustudios.com

# Presigned URL expiry (seconds)
PRESIGNED_DOWNLOAD_EXPIRY=3600
PRESIGNED_ZIP_EXPIRY=7200
PRESIGNED_UPLOAD_PART_EXPIRY=7200

# Upload/ZIP config
UPLOAD_PART_SIZE_MB=50
UPLOAD_MAX_CONCURRENT_PARTS=5
ZIP_MAX_CONCURRENT_FILES=5

# Keep existing S3 vars during migration (remove in Phase 6)
# AWS_S3_BUCKET=existing-value
# STUDIO_S3_BUCKET=existing-value
```

---

## RISKS — READ BEFORE WRITING CODE

```
RISK 1 (HIGH): Breaking existing download links
  Mitigation: storageBackend field — download API serves from S3 or R2 based on this
  Test: After Phase 3, verify old S3 links still work

RISK 2 (CONFIRMED): Rekognition cannot read R2
  Mitigation: Download R2 file as bytes in Lambda → pass bytes to Rekognition
  Already handled in Feature 4 above

RISK 3 (MEDIUM): R2 multipart upload differs from S3
  Mitigation: R2 uses S3-compatible API — same SDK. Test with 1GB file before Phase 3.

RISK 4 (MEDIUM): Upload localStorage state lost
  Mitigation: Also persist completedParts to DynamoDB on each part success
  GET /api/upload/${uploadId}/status always returns current state for recovery

RISK 5 (MEDIUM): ZIP streaming memory for large sets
  Mitigation: archiver.js streaming mode — never loads full file in memory
  Test with 10GB set before production

RISK 6 (LOW): R2 presigned URL format
  Mitigation: R2 generates standard AWS Sig4 presigned URLs — same format as S3
```

---

## BUILD ORDER — START HERE

```
WEEK 1:
  Task 1: Add storageBackend field to DynamoDB
    - Update vayustudio-mediafiles schema: add storageBackend, r2Bucket, r2Key
    - Update vayutransfer-files schema: add storageBackend, r2Bucket, r2Key
    - Write migration script: scan all existing records, set storageBackend="S3"
    - Show me the script before running it

  Task 2: Create lib/r2.ts utility
    - R2 client initialisation
    - generateR2PresignedUrl function
    - generateDownloadUrl function (checks storageBackend, serves from S3 or R2)

  Task 3: Update all download API routes
    - Use generateDownloadUrl (auto-selects S3 or R2 based on storageBackend)
    - Ensure r2Key and r2Bucket NEVER appear in API response
    - Test: existing S3 files still download correctly

  Task 4: Set up R2 buckets (manual step — do in Cloudflare dashboard)
    - Create all 5 buckets
    - Set vayustudio-preview as public
    - Add R2 credentials to env vars

WEEK 2:
  Task 5: VayuTransfer — switch upload to R2 multipart with localStorage resume
  Task 6: VayuTransfer — ZIP worker streaming to vayutransfer-temporary
  Task 7: VayuStudios — switch upload to R2 vayustudio-original
  Task 8: Update Watermark Lambda to read from R2 (check storageBackend)
  Task 9: Update IndexFaces Lambda to use R2 bytes for Rekognition

WEEK 3:
  Task 10: Background migration Lambda (S3 → R2 for existing files)
  Task 11: File metadata extraction Lambda
  Task 12: Resumable download UI with progress bar
  Task 13: VayuStudios studio download ZIP from R2
  Task 14: Guest download from R2 presigned URL

WEEK 4:
  Task 15: End-to-end testing (1GB upload, download, checksum verify)
  Task 16: DevTools audit (confirm zero R2 paths in network tab)
  Task 17: Monitor 7 days clean → begin S3 cleanup
```

---

## DO NOT BUILD (OUT OF SCOPE)

```
❌ New UI design changes (infra migration only)
❌ New VayuStudios features unrelated to storage
❌ Remove S3 code until Phase 6 Week 4 confirmed clean
❌ Change existing DynamoDB table names or keys (only ADD fields)
❌ Change authentication or user management
❌ Modify VayuStudios Phase 1 gallery or selection flow
```

---

## START COMMAND FOR CLAUDE CODE

```
Read this entire file. Then start with Task 1:
Show me the DynamoDB migration script to add storageBackend="S3"
to all existing records in vayustudio-mediafiles and vayutransfer-files.
Show the script BEFORE running it so I can review.
```

---
*Vayu Platform — R2 Architecture Migration*
*VayuTransfer + VayuStudios | Radhakanta, Founder*
*Zero egress cost target: ₹0 for all file downloads*
