import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { jwtVerify } from 'jose'
import { studioGetItem, TABLES } from '@/lib/studio/dynamodb'
import type { Studio } from '@/types/studio'
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

  return (
    <div className="p-6 max-w-4xl">
      <WebsiteManager studioId={studioId} studioName={studio.name} />
    </div>
  )
}
