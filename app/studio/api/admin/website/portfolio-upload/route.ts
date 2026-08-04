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

// Returns a presigned PUT URL so the browser uploads the file directly to R2 —
// proxying the file bytes through this route hit serverless request-body limits
// well before the client's own 10MB cap, which silently broke uploads.
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
  if (!body.contentType.startsWith('image/')) {
    return NextResponse.json({ error: 'Image file required' }, { status: 400 })
  }
  if (!body.sizeBytes || body.sizeBytes <= 0) {
    return NextResponse.json({ error: 'sizeBytes is required' }, { status: 400 })
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
