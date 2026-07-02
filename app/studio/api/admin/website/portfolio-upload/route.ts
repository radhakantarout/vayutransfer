import { NextRequest, NextResponse } from 'next/server'
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
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
const MAX_SIZE     = 10 * 1024 * 1024 // 10 MB

export async function POST(req: NextRequest) {
  const auth = await verifyStudioJWT(req)
  if (!auth || !['ADMIN', 'OWNER'].includes(auth.role) || !auth.studioId) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  }

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })

  const file     = form.get('file') as File | null
  const category = (form.get('category') as string | null) ?? 'General'

  if (!file || !file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Image file required' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'Max file size is 10 MB' }, { status: 400 })
  }

  const ext  = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const key  = `portfolio/${auth.studioId}/${randomUUID()}.${ext}`
  const body = Buffer.from(await file.arrayBuffer())

  await r2Client().send(new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         key,
    Body:        body,
    ContentType: file.type,
  }))

  const url = `${PREVIEW_BASE}/${key}`
  return NextResponse.json({ success: true, url, category, id: randomUUID() })
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
  // Only allow deleting from this studio's portfolio folder
  if (!key.startsWith(`portfolio/${auth.studioId}/`)) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  }

  await r2Client().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
  return NextResponse.json({ success: true })
}
