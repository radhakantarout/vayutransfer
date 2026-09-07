import { NextRequest, NextResponse } from 'next/server'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { randomUUID } from 'crypto'

// Presigned-upload for a watermark logo image — same R2 bucket/credentials
// the watermark Lambda already reads/writes previews with (STUDIO_R2_BUCKET
// via r2AccessKeyId/r2SecretAccessKey in lib/studio/watermark.ts), just a
// different key prefix, so the Lambda needs no new credentials threaded
// through to fetch a logo at render time. Mirrors the presigned-PUT pattern
// in app/studio/api/admin/website/portfolio-upload/route.ts.
//
// Deliberately no storage-quota bookkeeping (unlike that route) — logos are
// a tiny, one-per-preset branding asset, not billable client content.

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
const MAX_LOGO_BYTES = 5 * 1024 * 1024 // 5MB — a watermark logo, not a photo

export async function POST(req: NextRequest) {
  const auth = await verifyStudioJWT(req)
  if (!auth || !['ADMIN', 'OWNER'].includes(auth.role) || !auth.studioId) {
    return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as { filename?: string; contentType?: string; sizeBytes?: number } | null
  if (!body?.filename || !body?.contentType) {
    return NextResponse.json({ success: false, error: 'filename and contentType are required' }, { status: 400 })
  }
  if (!body.contentType.startsWith('image/')) {
    return NextResponse.json({ success: false, error: 'An image file is required (PNG recommended for transparency)' }, { status: 400 })
  }
  if (!body.sizeBytes || body.sizeBytes <= 0 || body.sizeBytes > MAX_LOGO_BYTES) {
    return NextResponse.json({ success: false, error: 'Logo must be under 5MB' }, { status: 400 })
  }

  const ext = body.filename.split('.').pop()?.toLowerCase() ?? 'png'
  const key = `watermark-logos/${auth.studioId}/${randomUUID()}.${ext}`

  const uploadUrl = await getSignedUrl(
    r2Client(),
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: body.contentType }),
    { expiresIn: 300 }
  )

  return NextResponse.json({ success: true, uploadUrl, r2Key: key, publicUrl: `${PREVIEW_BASE}/${key}` })
}
