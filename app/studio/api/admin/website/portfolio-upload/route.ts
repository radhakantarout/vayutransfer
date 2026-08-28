import { NextRequest, NextResponse } from 'next/server'
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import { syncBillingCycle, checkStorageAvailable } from '@/lib/studio/quota'
import type { Studio } from '@/types/studio'
import { randomUUID } from 'crypto'

function r2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: process.env.STUDIO_R2_ENDPOINT,
    credentials: {
      accessKeyId:     process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  })
}

const PREVIEW_BASE = process.env.NEXT_PUBLIC_STUDIO_PREVIEW_URL ?? 'https://previews.vayustudios.com'
const BUCKET       = process.env.STUDIO_R2_BUCKET ?? 'vayustudio-previews'

const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']
const MAX_IMAGE_BYTES         = 100 * 1024 * 1024
const MAX_GALLERY_VIDEO_BYTES = 150 * 1024 * 1024
// Smaller cap for hero backgrounds — these autoplay immediately on page load,
// so a large file directly hurts first-paint time.
const MAX_HERO_VIDEO_BYTES    = 60  * 1024 * 1024

// Returns a presigned PUT URL so the browser uploads the file directly to R2 —
// proxying the file bytes through this route hit serverless request-body limits
// well before the client's own image-size cap, which silently broke uploads.
//
// sizeBytes is billed against the studio's storage quota the moment the
// upload URL is issued (same client-supplied trust level as the gallery's
// own upload-url route) — there's no separate "upload-complete" callback
// for this simpler, admin-only, low-volume asset type (portfolio/hero
// images), so this is the only server-side moment available. The size is
// persisted onto the WebsiteGalleryPhoto/heroImageSizeBytes record when the
// studio saves it (see WebsiteManager.tsx), so DELETE below can decrement
// by the real stored amount rather than trusting a client-sent number again.
export async function POST(req: NextRequest) {
  const auth = await verifyStudioJWT(req)
  if (!auth || !['ADMIN', 'OWNER'].includes(auth.role) || !auth.studioId) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as { filename?: string; contentType?: string; category?: string; kind?: 'portfolio' | 'hero'; sizeBytes?: number } | null
  if (!body?.filename || !body?.contentType) {
    return NextResponse.json({ error: 'filename and contentType are required' }, { status: 400 })
  }
  const isImage = body.contentType.startsWith('image/')
  const isVideo = ALLOWED_VIDEO_TYPES.includes(body.contentType)
  if (!isImage && !isVideo) {
    return NextResponse.json({ error: 'Image or video file required (jpg, png, gif, mp4, webm, mov)' }, { status: 400 })
  }
  if (!body.sizeBytes || body.sizeBytes <= 0) {
    return NextResponse.json({ error: 'sizeBytes is required' }, { status: 400 })
  }
  // Defense in depth — WebsiteManager.tsx already enforces these client-side,
  // but nothing previously capped size server-side at all.
  if (isImage && body.sizeBytes > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: 'Image exceeds the 100MB limit' }, { status: 400 })
  }
  if (isVideo) {
    const cap = body.kind === 'hero' ? MAX_HERO_VIDEO_BYTES : MAX_GALLERY_VIDEO_BYTES
    if (body.sizeBytes > cap) {
      return NextResponse.json({ error: `Video exceeds the ${Math.round(cap / (1024 * 1024))}MB limit` }, { status: 400 })
    }
  }

  let studio = await studioGetItem<Studio>(TABLES.studios, { studioId: auth.studioId })
  if (studio) {
    studio = await syncBillingCycle(studio)
    const quota = checkStorageAvailable(studio, body.sizeBytes)
    if (!quota.ok) {
      return NextResponse.json({
        error: 'QUOTA_EXCEEDED', quotaType: 'storage',
        message: 'You’re out of storage space. Top up storage or upgrade your plan in Settings → Billing to keep uploading.',
        usedBytes: quota.usedBytes, quotaBytes: quota.quotaBytes, usedPct: quota.usedPct,
      }, { status: 402 })
    }
  }

  const category = body.category ?? 'General'
  const folder   = body.kind === 'hero' ? 'hero' : 'portfolio'
  const ext      = body.filename.split('.').pop()?.toLowerCase() ?? 'jpg'
  const id       = randomUUID()
  const key      = `${folder}/${auth.studioId}/${id}.${ext}`

  const uploadUrl = await getSignedUrl(
    r2Client(),
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: body.contentType }),
    { expiresIn: 300 }
  )

  await studioUpdateItem(
    TABLES.studios,
    { studioId: auth.studioId },
    'ADD storageUsedBytes :size, billableStorageBytes :size SET updatedAt = :now',
    { ':size': body.sizeBytes, ':now': new Date().toISOString() }
  )

  const publicUrl = `${PREVIEW_BASE}/${key}`
  return NextResponse.json({ success: true, uploadUrl, publicUrl, category, id, sizeBytes: body.sizeBytes })
}

export async function DELETE(req: NextRequest) {
  const auth = await verifyStudioJWT(req)
  if (!auth || !['ADMIN', 'OWNER'].includes(auth.role) || !auth.studioId) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  }

  const { url, sizeBytes } = await req.json() as { url: string; sizeBytes?: number }
  if (!url) return NextResponse.json({ error: 'URL required' }, { status: 400 })

  // Extract R2 key from public URL
  const key = url.replace(`${PREVIEW_BASE}/`, '')
  // Only allow deleting from this studio's own portfolio or hero folder
  if (!key.startsWith(`portfolio/${auth.studioId}/`) && !key.startsWith(`hero/${auth.studioId}/`)) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  }

  await r2Client().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))

  if (sizeBytes && sizeBytes > 0) {
    await studioUpdateItem(
      TABLES.studios,
      { studioId: auth.studioId },
      'ADD billableStorageBytes :negSize SET updatedAt = :now',
      { ':negSize': -sizeBytes, ':now': new Date().toISOString() }
    )
  }

  return NextResponse.json({ success: true })
}
