import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { jwtVerify } from 'jose'
import { studioGetItem, studioQueryByIndex, TABLES } from '@/lib/studio/dynamodb'
import type { Studio, MediaFile } from '@/types/studio'
import WebsiteManager from './WebsiteManager'

async function getAuth() {
  try {
    const token = (await cookies()).get('studio_token')?.value
    if (!token) return null
    const secret = new TextEncoder().encode(process.env.STUDIO_JWT_SECRET!)
    const { payload } = await jwtVerify(token, secret)
    return payload as { userId: string; role: string; studioId?: string }
  } catch { return null }
}

export default async function WebsitePage() {
  const auth = await getAuth()
  if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) redirect('/studio/login')
  const studioId = auth.studioId
  if (!studioId) redirect('/studio/login')

  const studio = await studioGetItem<Studio>(TABLES.studios, { studioId })
  if (!studio) redirect('/studio/login')

  // Collect a sample of READY preview URLs from this studio's projects for gallery picker
  const allFiles = await studioQueryByIndex<MediaFile>(
    TABLES.mediafiles,
    'studioId-uploadedAt-index',
    'studioId = :s',
    { ':s': studioId },
    undefined,
    200
  ).catch(() => [] as MediaFile[])

  const previewUrls = allFiles
    .filter(f => f.processingStatus === 'READY' && f.r2PreviewUrl && f.fileType === 'IMAGE')
    .map(f => f.r2PreviewUrl!)
    .slice(0, 100)

  return (
    <div className="p-6 max-w-4xl">
      <WebsiteManager studioId={studioId} studioName={studio.name} r2PreviewUrls={previewUrls} />
    </div>
  )
}
