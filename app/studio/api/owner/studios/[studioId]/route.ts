import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioUpdateItem, studioDeleteItem, studioQueryByIndex, studioQueryByPK, TABLES } from '@/lib/studio/dynamodb'
import { sendStudioSuspendedEmail, sendStudioReactivatedEmail, sendStudioDeletedEmail } from '@/lib/aws/ses'
import { logAuditEvent } from '@/lib/studio/auditLog'
import { deleteMediaObjects } from '@/lib/studio/storage'
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
    const { status, featureFlag, reason } = body as {
      status?: string
      featureFlag?: { key: string; value: boolean }
      reason?: string
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
      logAuditEvent({
        studioId, actorId: auth.userId, actorRole: auth.role,
        action: 'TOGGLE_AI_FLAG', targetType: 'STUDIO', targetId: studioId,
        metadata: { flagKey: featureFlag.key, newValue: featureFlag.value, studioName: studio.name },
      })
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

    const admins = adminUsers.filter((u) => u.role === 'ADMIN')

    await Promise.all(
      admins.map((u) =>
        studioUpdateItem(TABLES.users, { userId: u.userId }, 'SET #s = :status, updatedAt = :now', { ':status': status, ':now': now }, { '#s': 'status' })
      )
    )

    // Notify admins async (fire-and-forget) — only on an actual status change, never blocks the response
    if (status !== studio.status) {
      admins.filter((u) => u.email).forEach((u) => {
        const send = status === 'SUSPENDED'
          ? sendStudioSuspendedEmail(u.email!, studio.name, reason)
          : sendStudioReactivatedEmail(u.email!, studio.name)
        send.catch((err) => console.error('[studio status email]', err))
      })
      logAuditEvent({
        studioId, actorId: auth.userId, actorRole: auth.role,
        action: status === 'SUSPENDED' ? 'SUSPEND_STUDIO' : 'REACTIVATE_STUDIO',
        targetType: 'STUDIO', targetId: studioId,
        metadata: { studioName: studio.name, reason, previousStatus: studio.status },
      })
    }

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
    const { reason } = await req.json().catch(() => ({})) as { reason?: string }

    const studio = await studioGetItem<Studio>(TABLES.studios, { studioId })
    if (!studio) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })

    // Cascade: fetch all child data
    const [projects, users] = await Promise.all([
      studioQueryByPK<StudioProject>(TABLES.projects, 'studioId', studioId),
      studioQueryByIndex<StudioUser>(TABLES.users, 'linkedStudioId-index', 'linkedStudioId = :sid', { ':sid': studioId }).catch(() => [] as StudioUser[]),
    ])

    // For each project, delete R2/S3 objects + mediafiles + selections —
    // tallied for the audit entry below, since this is the single most
    // consequential action an owner can take and needs the fullest possible
    // record. R2 cleanup here matters just as much as the single-project
    // delete path (lib/studio/projectDelete.ts) — without it, deleting a
    // whole studio silently leaks every one of its photos into storage
    // forever, same bug, same fix.
    let photoCount = 0
    let totalBytes = 0
    for (const project of projects) {
      const [mediafiles, selections] = await Promise.all([
        studioQueryByPK<MediaFile>(TABLES.mediafiles, 'projectId', project.projectId),
        studioQueryByPK<Selection>(TABLES.selections, 'projectId', project.projectId),
      ])
      await Promise.all(mediafiles.map((f) => deleteMediaObjects(f).catch((err) => console.error('[owner studio DELETE] R2 delete failed', f.fileId, err))))
      await Promise.all([
        ...mediafiles.map((f) => studioDeleteItem(TABLES.mediafiles, { projectId: project.projectId, fileId: f.fileId })),
        ...selections.map((s) => studioDeleteItem(TABLES.selections, { projectId: project.projectId, fileId: s.fileId })),
      ])
      photoCount += mediafiles.length
      totalBytes += mediafiles.reduce((sum, f) => sum + (f.sizeBytes ?? 0), 0)
    }

    // Delete projects, users, studio in parallel
    await Promise.all([
      ...projects.map((p) => studioDeleteItem(TABLES.projects, { studioId, projectId: p.projectId })),
      ...users.map((u) => studioDeleteItem(TABLES.users, { userId: u.userId })),
    ])
    await studioDeleteItem(TABLES.studios, { studioId })

    logAuditEvent({
      studioId, actorId: auth.userId, actorRole: auth.role,
      action: 'DELETE_STUDIO', targetType: 'STUDIO', targetId: studioId,
      metadata: {
        studioName: studio.name, reason,
        projectCount: projects.length,
        clientCount: new Set(projects.map((p) => p.clientName)).size,
        userCount: users.length,
        photoCount, totalBytes,
      },
    })

    // Notify former admins async (fire-and-forget) — captured emails before the cascade delete above
    users
      .filter((u) => u.role === 'ADMIN' && u.email)
      .forEach((u) => {
        sendStudioDeletedEmail(u.email!, studio.name, reason)
          .catch((err) => console.error('[studio deleted email]', err))
      })

    return NextResponse.json({ success: true, data: { studioId } })
  } catch (err) {
    console.error('[owner studio DELETE]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
