import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import type { StudioProject } from '@/types/studio'

export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { expiryDays = 30 } = await req.json().catch(() => ({}))
    const { projectId } = params
    const studioId = auth.studioId!

    const project = await studioGetItem<StudioProject>(TABLES.projects, { studioId, projectId })
    if (!project) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }

    if (project.totalFiles === 0) {
      return NextResponse.json(
        { success: false, error: 'NO_FILES', message: 'Upload at least one photo before generating a share link' },
        { status: 400 }
      )
    }

    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString()
    const now = new Date().toISOString()

    await studioUpdateItem(
      TABLES.projects,
      { studioId, projectId },
      'SET clientShareToken = :token, clientShareExpiresAt = :exp, updatedAt = :now, #s = :active',
      { ':token': token, ':exp': expiresAt, ':now': now, ':active': 'ACTIVE' },
      { '#s': 'status' }
    )

    const studioUrl = process.env.NEXT_PUBLIC_STUDIO_URL ?? 'https://studio.vayutransfer.com'
    const shareUrl = `${studioUrl}/studio/gallery/${token}`

    return NextResponse.json({ success: true, data: { shareUrl, expiresAt } })
  } catch (err) {
    console.error('[share-link]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
