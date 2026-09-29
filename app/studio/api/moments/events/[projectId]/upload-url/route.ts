import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioPutItem, TABLES } from '@/lib/studio/dynamodb'
import { initiateStudioR2MultipartUpload, getStudioR2PartPresignedUrls, getStudioR2Key } from '@/lib/studio/r2'
import { syncBillingCycle, checkStorageAvailable } from '@/lib/studio/quota'
import { resolveProjectForViewer, isOwnerOrAdmin } from '@/lib/studio/galleryMembers'
import type { MediaFile, Studio } from '@/types/studio'

// Mirrors admin/projects/[projectId]/upload-url exactly (same R2 multipart +
// quota-gate pattern) — gated to the gallery's own admin(s): the owner, or
// anyone promoted (Phase 5), not just a raw studioId match.
export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth?.studioId) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })

    const { filename, mimeType, sizeBytes, partCount, purpose: requestedPurpose } = await req.json()
    if (!filename || !mimeType || !sizeBytes || !partCount) {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT' }, { status: 400 })
    }
    if (partCount < 1 || partCount > 10000) {
      return NextResponse.json({ success: false, error: 'INVALID_PART_COUNT' }, { status: 400 })
    }
    // Never trust a client-supplied purpose blindly — only these two real
    // values exist (see MediaFile.purpose's own comment); anything else
    // falls back to the always-safe default rather than rejecting outright.
    const purpose: 'GALLERY' | 'REEL_REFERENCE' = requestedPurpose === 'REEL_REFERENCE' ? 'REEL_REFERENCE' : 'GALLERY'

    const { projectId } = params
    const resolved = await resolveProjectForViewer(auth, projectId)
    if (!resolved) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    const { project, member } = resolved
    // Gallery uploads stay owner/admin-only, unchanged. A Kling 3.0 Omni
    // reference upload (reel-generator-omni-redesign plan, Phase 2) is
    // personal to whoever is about to create a reel — same gate the reels
    // route itself already uses (isOwnerOrAdmin, or any member when the
    // gallery owner has turned reels on for members).
    const canUpload = purpose === 'REEL_REFERENCE'
      ? isOwnerOrAdmin(auth.studioId, project, member) || project.allowMemberReels
      : isOwnerOrAdmin(auth.studioId, project, member)
    if (!canUpload) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }
    // Uploads always land under the GALLERY's own personal Studio (billing/
    // quota owner), never the uploading admin's own studioId — those differ
    // exactly when a promoted (non-owner) admin is the one uploading.
    const studioId = project.studioId

    let studio = await studioGetItem<Studio>(TABLES.studios, { studioId })
    if (studio) {
      studio = await syncBillingCycle(studio)
      const quota = checkStorageAvailable(studio, sizeBytes)
      if (!quota.ok) {
        return NextResponse.json({
          success: false, error: 'QUOTA_EXCEEDED', quotaType: 'storage',
          message: 'You’re out of free storage for this gallery.',
          usedBytes: quota.usedBytes, quotaBytes: quota.quotaBytes, usedPct: quota.usedPct,
        }, { status: 402 })
      }
    }

    const fileId = randomUUID()
    const fileType = mimeType.startsWith('video/') ? 'VIDEO' : mimeType.startsWith('audio/') ? 'AUDIO' : 'IMAGE'
    const r2Key = getStudioR2Key(studioId, projectId, fileId, filename)

    const uploadId = await initiateStudioR2MultipartUpload(r2Key, mimeType)
    const presignedUrls = await getStudioR2PartPresignedUrls(r2Key, uploadId, partCount)

    const now = new Date().toISOString()
    const mediaFile: MediaFile = {
      projectId,
      fileId,
      studioId,
      originalFilename: filename,
      fileType,
      purpose,
      mimeType,
      sizeBytes,
      storageBackend: 'R2',
      r2Key,
      watermarkEnabled: false,
      displayOrder: Date.now(),
      uploadedAt: now,
      processingStatus: 'UPLOADING',
    }

    await studioPutItem(TABLES.mediafiles, mediaFile as unknown as Record<string, unknown>)

    return NextResponse.json({ success: true, data: { fileId, uploadId, presignedUrls } })
  } catch (err) {
    console.error('[moments upload-url]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
