import { NextRequest, NextResponse } from 'next/server'
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { verifyStudioJWT } from '@/lib/studio/auth'
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
export async function POST(req: NextRequest) {
  const auth = await verifyStudioJWT(req)
  if (!auth || !['ADMIN', 'OWNER'].includes(auth.role) || !auth.studioId) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as { filename?: string; contentType?: string; category?: string; kind?: 'portfolio' | 'hero' } | null
  if (!body?.filename || !body?.contentType) {
    return NextResponse.json({ error: 'filename and contentType are required' }, { status: 400 })
  }
  if (!body.contentType.startsWith('image/')) {
    return NextResponse.json({ error: 'Image file required' }, { status: 400 })
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

  const publicUrl = `${PREVIEW_BASE}/${key}`
  return NextResponse.json({ success: true, uploadUrl, publicUrl, category, id })
}

export async function DELETE(req: NextRequest) {
  const auth = await verifyStudioJWT(req)
  if (!auth || !['ADMIN', 'OWNER'].includes(auth.role) || !auth.studioId) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  }

  const { url } = await req.json() as { url: string }
  if (!url) return NextResponse.json({ error: 'URL required' }, { status: 400 })

  // Extract R2 key from public URL
  const key = url.replace(`${PREVIEW_BASE}/`, '')
  // Only allow deleting from this studio's own portfolio or hero folder
  if (!key.startsWith(`portfolio/${auth.studioId}/`) && !key.startsWith(`hero/${auth.studioId}/`)) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  }

  await r2Client().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
  return NextResponse.json({ success: true })
}
