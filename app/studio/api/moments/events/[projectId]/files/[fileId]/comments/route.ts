import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioQueryByPK, studioPutItem, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import { resolveProjectForViewer, isApprovedMember, isOwnerOrAdmin } from '@/lib/studio/galleryMembers'
import type { GalleryComment } from '@/types/studio'

const MAX_COMMENT_LENGTH = 500

// GET — flat, newest-first comment list for one photo/video. Any approved
// member can read.
export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string; fileId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth?.studioId) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })

    const { projectId, fileId } = params
    const resolved = await resolveProjectForViewer(auth, projectId)
    if (!resolved) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    if (!isOwnerOrAdmin(auth.studioId, resolved.project, resolved.member) && !isApprovedMember(resolved.member)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const comments = await studioQueryByPK<GalleryComment>(TABLES.galleryComments, 'fileId', fileId)
    comments.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))

    return NextResponse.json({
      success: true,
      data: comments.map((c) => ({ ...c, isMine: c.userId === auth.userId })),
    })
  } catch (err) {
    console.error('[moments comments GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

// POST — add a comment. Never trusts a client-supplied name — always the
// caller's own StudioUser name, resolved server-side (same discipline as
// every other write in this codebase).
export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string; fileId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth?.studioId) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })

    const { projectId, fileId } = params
    const resolved = await resolveProjectForViewer(auth, projectId)
    if (!resolved) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    if (!isOwnerOrAdmin(auth.studioId, resolved.project, resolved.member) && !isApprovedMember(resolved.member)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { text } = await req.json().catch(() => ({})) as { text?: string }
    const trimmed = text?.trim().slice(0, MAX_COMMENT_LENGTH)
    if (!trimmed) return NextResponse.json({ success: false, error: 'INVALID_INPUT' }, { status: 400 })

    const name = resolved.member?.name
    const now = new Date().toISOString()
    const comment: GalleryComment = {
      fileId, commentId: randomUUID(), projectId, userId: auth.userId, name, text: trimmed, createdAt: now,
    }
    await studioPutItem(TABLES.galleryComments, comment as unknown as Record<string, unknown>)
    await studioUpdateItem(TABLES.mediafiles, { projectId, fileId }, 'ADD commentCount :one', { ':one': 1 }).catch(() => {})

    return NextResponse.json({ success: true, data: { ...comment, isMine: true } }, { status: 201 })
  } catch (err) {
    console.error('[moments comments POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
