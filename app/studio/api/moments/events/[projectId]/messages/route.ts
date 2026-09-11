import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioQueryByPK, studioPutItem, TABLES } from '@/lib/studio/dynamodb'
import { resolveProjectForViewer, isApprovedMember, isOwnerOrAdmin } from '@/lib/studio/galleryMembers'
import type { GalleryMessage } from '@/types/studio'

const MAX_MESSAGE_LENGTH = 1000

// One flat group chat per gallery — polling-based (see memory: chosen over
// WebSocket push to avoid new AWS infra for this pass). GET returns the
// whole thread every call; galleries are small enough that this is simpler
// and cheaper than an incremental "since" cursor for now.
export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth?.studioId) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })

    const { projectId } = params
    const resolved = await resolveProjectForViewer(auth, projectId)
    if (!resolved) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    if (!isOwnerOrAdmin(auth.studioId, resolved.project, resolved.member) && !isApprovedMember(resolved.member)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const messages = await studioQueryByPK<GalleryMessage>(TABLES.galleryMessages, 'projectId', projectId)
    messages.sort((a, b) => a.messageId.localeCompare(b.messageId))

    return NextResponse.json({
      success: true,
      data: messages.map((m) => ({ ...m, isMine: m.userId === auth.userId })),
    })
  } catch (err) {
    console.error('[moments messages GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth?.studioId) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })

    const { projectId } = params
    const resolved = await resolveProjectForViewer(auth, projectId)
    if (!resolved) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    if (!isOwnerOrAdmin(auth.studioId, resolved.project, resolved.member) && !isApprovedMember(resolved.member)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { text } = await req.json().catch(() => ({})) as { text?: string }
    const trimmed = text?.trim().slice(0, MAX_MESSAGE_LENGTH)
    if (!trimmed) return NextResponse.json({ success: false, error: 'INVALID_INPUT' }, { status: 400 })

    const now = new Date()
    const message: GalleryMessage = {
      projectId,
      messageId: `${now.getTime()}_${randomUUID()}`,
      userId: auth.userId,
      name: resolved.member?.name,
      text: trimmed,
      createdAt: now.toISOString(),
    }
    await studioPutItem(TABLES.galleryMessages, message as unknown as Record<string, unknown>)

    return NextResponse.json({ success: true, data: { ...message, isMine: true } }, { status: 201 })
  } catch (err) {
    console.error('[moments messages POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
