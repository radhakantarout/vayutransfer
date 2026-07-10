import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import type { StudioTransfer } from '@/types/studio'

const studioUrl = () => process.env.NEXT_PUBLIC_STUDIO_URL ?? 'https://studio.vayutransfer.com'
const expirySeconds = () => parseInt(process.env.TRANSFER_LINK_EXPIRY_SECONDS ?? '604800', 10)

// Mints a brand-new token + expiry, overwriting the old one — same pattern
// as print-link/share-link (never just extends the existing token's expiry).
export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string; transferId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { projectId, transferId } = params
    const transfer = await studioGetItem<StudioTransfer>(TABLES.transfers, { projectId, transferId })
    if (!transfer || transfer.studioId !== auth.studioId) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }

    // A RECEIVE transfer mid-upload has an in-flight multipart upload keyed
    // to the OLD token's r2Key — regenerating now would orphan its eventual
    // upload-complete call (the parts would sit as a dangling multipart
    // upload nobody ever finishes).
    if (transfer.status === 'UPLOADING') {
      return NextResponse.json(
        { success: false, error: 'UPLOAD_IN_PROGRESS', message: 'Upload in progress — cannot regenerate this link yet' },
        { status: 409 }
      )
    }

    const shareToken = randomBytes(32).toString('hex')
    const shareExpiresAt = new Date(Date.now() + expirySeconds() * 1000).toISOString()
    const now = new Date().toISOString()

    await studioUpdateItem(
      TABLES.transfers,
      { projectId, transferId },
      'SET shareToken = :token, shareExpiresAt = :exp, updatedAt = :now',
      { ':token': shareToken, ':exp': shareExpiresAt, ':now': now }
    )

    const shareUrl = transfer.direction === 'SEND'
      ? `${studioUrl()}/studio/transfer/send/${shareToken}`
      : `${studioUrl()}/studio/transfer/receive/${shareToken}`

    return NextResponse.json({ success: true, data: { shareUrl, shareExpiresAt } })
  } catch (err) {
    console.error('[transfers resend POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
