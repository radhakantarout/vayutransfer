import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminJWT } from '@/lib/adminAuth'
import { scanAll } from '@/lib/aws/dynamodb'
import type { ApiResponse, Feedback } from '@/types'

const FEEDBACK_TABLE = process.env.DYNAMO_FEEDBACK_TABLE ?? 'vayu-feedback'

export interface FeedbackStats {
  total: number
  averageRating: number
  byRole: Record<Feedback['role'], number>
}

// Scan + in-memory filter/sort — same reasoning as app/api/admin/users/route.ts
// (admin-only, off the user-facing hot path, fine at current scale).
export async function GET(req: NextRequest) {
  const auth = await verifyAdminJWT(req)
  if (!auth) {
    return NextResponse.json<ApiResponse<never>>({ success: false, error: 'FORBIDDEN' }, { status: 403 })
  }

  try {
    const all = await scanAll<Feedback>(FEEDBACK_TABLE)

    const stats: FeedbackStats = {
      total: all.length,
      averageRating: all.length ? all.reduce((s, f) => s + f.rating, 0) / all.length : 0,
      byRole: {
        sender: all.filter((f) => f.role === 'sender').length,
        downloader: all.filter((f) => f.role === 'downloader').length,
        requester: all.filter((f) => f.role === 'requester').length,
        uploader: all.filter((f) => f.role === 'uploader').length,
      },
    }

    all.sort((a, b) => b.createdAt.localeCompare(a.createdAt))

    return NextResponse.json<ApiResponse<{ feedback: Feedback[]; stats: FeedbackStats }>>({
      success: true,
      data: { feedback: all.slice(0, 200), stats },
    })
  } catch (err) {
    console.error('[admin/feedback]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to load feedback' },
      { status: 500 }
    )
  }
}
