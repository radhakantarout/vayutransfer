import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioUpdateItem, studioDeleteItem, studioQueryByIndex, studioQueryByPK, TABLES } from '@/lib/studio/dynamodb'
import type { Studio, StudioUser, StudioProject, MediaFile, Selection } from '@/types/studio'

export async function GET(
  req: NextRequest,
  { params }: { params: { studioId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || auth.role !== 'OWNER') {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { studioId } = params
    const [studio, users] = await Promise.all([
      studioGetItem<Studio>(TABLES.studios, { studioId }),
      studioQueryByIndex<StudioUser>(TABLES.users, 'linkedStudioId-index', 'linkedStudioId = :sid', { ':sid': studioId }).catch(() => [] as StudioUser[]),
    ])

    if (!studio) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    return NextResponse.json({ success: true, data: { studio, users } })
  } catch (err) {
    console.error('[owner studio GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { studioId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || auth.role !== 'OWNER') {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const body = await req.json()
    const { status, featureFlag } = body as {
      status?: string
      featureFlag?: { key: string; value: boolean }
    }

    const { studioId } = params
    const studio = await studioGetItem<Studio>(TABLES.studios, { studioId })
    if (!studio) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })

    const now = new Date().toISOString()

    // Feature flag toggle
    if (featureFlag) {
      const allowed = ['videoSupport', 'watermarkToggle', 'extendedStorage', 'clientComments', 'editingRequired', 'aiFaceRecognition']
      if (!allowed.includes(featureFlag.key) || typeof featureFlag.value !== 'boolean') {
        return NextResponse.json({ success: false, error: 'INVALID_FLAG' }, { status: 400 })
      }
      await studioUpdateItem(
        TABLES.studios,
        { studioId },
        `SET featureFlags.#flag = :val, updatedAt = :now`,
        { ':val': featureFlag.value, ':now': now },
        { '#flag': featureFlag.key }
      )
      return NextResponse.json({ success: true, data: { studioId, featureFlag } })
    }

    // Status toggle
    if (!status || !['ACTIVE', 'SUSPENDED'].includes(status)) {
      return NextResponse.json({ success: false, error: 'INVALID_STATUS' }, { status: 400 })
    }

    await studioUpdateItem(
      TABLES.studios,
      { studioId },
      'SET #s = :status, updatedAt = :now',
      { ':status': status, ':now': now },
      { '#s': 'status' }
    )

    // Suspend/reactivate the studio's admin users too
    const adminUsers = await studioQueryByIndex<StudioUser>(
      TABLES.users, 'linkedStudioId-index',
      'linkedStudioId = :sid',
      { ':sid': studioId }
    ).catch(() => [] as StudioUser[])

    await Promise.all(
      adminUsers
        .filter((u) => u.role === 'ADMIN')
        .map((u) =>
          studioUpdateItem(TABLES.users, { userId: u.userId }, 'SET #s = :status, updatedAt = :now', { ':status': status, ':now': now }, { '#s': 'status' })
        )
    )

    return NextResponse.json({ success: true, data: { studioId, status } })
  } catch (err) {
    console.error('[owner studio PATCH]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

// DELETE /studio/api/owner/studios/[studioId] — permanently delete studio + all data
export async function DELETE(
  req: NextRequest,
  { params }: { params: { studioId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || auth.role !== 'OWNER') {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { studioId } = params
    const studio = await studioGetItem<Studio>(TABLES.studios, { studioId })
    if (!studio) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })

    // Cascade: fetch all child data
    const [projects, users] = await Promise.all([
      studioQueryByPK<StudioProject>(TABLES.projects, 'studioId', studioId),
      studioQueryByIndex<StudioUser>(TABLES.users, 'linkedStudioId-index', 'linkedStudioId = :sid', { ':sid': studioId }).catch(() => [] as StudioUser[]),
    ])

    // For each project, delete mediafiles + selections
    for (const project of projects) {
      const [mediafiles, selections] = await Promise.all([
        studioQueryByPK<MediaFile>(TABLES.mediafiles, 'projectId', project.projectId),
        studioQueryByPK<Selection>(TABLES.selections, 'projectId', project.projectId),
      ])
      await Promise.all([
        ...mediafiles.map((f) => studioDeleteItem(TABLES.mediafiles, { projectId: project.projectId, fileId: f.fileId })),
        ...selections.map((s) => studioDeleteItem(TABLES.selections, { projectId: project.projectId, fileId: s.fileId })),
      ])
    }

    // Delete projects, users, studio in parallel
    await Promise.all([
      ...projects.map((p) => studioDeleteItem(TABLES.projects, { studioId, projectId: p.projectId })),
      ...users.map((u) => studioDeleteItem(TABLES.users, { userId: u.userId })),
    ])
    await studioDeleteItem(TABLES.studios, { studioId })

    return NextResponse.json({ success: true, data: { studioId } })
  } catch (err) {
    console.error('[owner studio DELETE]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
