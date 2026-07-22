import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import type { StudioProject } from '@/types/studio'

const PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I — avoids read-aloud ambiguity
function generateSharePassword(): string {
  const bytes = randomBytes(6)
  return Array.from(bytes, (b) => PASSWORD_CHARS[b % PASSWORD_CHARS.length]).join('')
}

export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { expiryDays = 1, selectionMin, selectionMax, includedFileIds, passwordProtected } = await req.json().catch(() => ({}))
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

    // Validate includedFileIds when provided
    const hasFilter = Array.isArray(includedFileIds) && includedFileIds.length > 0
    if (Array.isArray(includedFileIds) && includedFileIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'NO_SELECTION', message: 'Please select at least one photo to share' },
        { status: 400 }
      )
    }

    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString()
    const now = new Date().toISOString()

    const hasRange = typeof selectionMin === 'number' && typeof selectionMax === 'number' && selectionMax > 0
    const isProtected = passwordProtected === true
    const sharePassword = isProtected ? generateSharePassword() : undefined

    let updateExpr = 'SET clientShareToken = :token, clientShareExpiresAt = :exp, updatedAt = :now, #s = :active, sharePasswordProtected = :prot'
    const exprValues: Record<string, unknown> = { ':token': token, ':exp': expiresAt, ':now': now, ':active': 'ACTIVE', ':prot': isProtected }
    if (hasRange)     { updateExpr += ', selectionMin = :smin, selectionMax = :smax'; exprValues[':smin'] = selectionMin; exprValues[':smax'] = selectionMax }
    if (hasFilter)    { updateExpr += ', sharedFileIds = :sfids'; exprValues[':sfids'] = includedFileIds }
    if (sharePassword) { updateExpr += ', sharePassword = :pwd'; exprValues[':pwd'] = sharePassword }

    // Re-sharing always clears the prior submission lock — the client should see a fresh,
    // submittable gallery (their previous heart/edit selections still load from the
    // Selection table and appear pre-checked; only the submit lock resets).
    const removeAttrs = ['selectionSubmittedAt']
    if (!hasFilter) removeAttrs.push('sharedFileIds')
    if (!sharePassword) removeAttrs.push('sharePassword')
    updateExpr += ` REMOVE ${removeAttrs.join(', ')}`

    await studioUpdateItem(TABLES.projects, { studioId, projectId }, updateExpr, exprValues, { '#s': 'status' })

    const shareUrl = `${req.nextUrl.origin}/studio/gallery/${token}`

    // Sending to the client is now a separate, explicit action (see
    // share-link/email) — never a side effect of generating/regenerating
    // the link itself.
    return NextResponse.json({
      success: true,
      data: { shareUrl, expiresAt, ...(sharePassword ? { sharePassword } : {}) },
    })
  } catch (err) {
    console.error('[share-link]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
