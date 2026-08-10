import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { getUserById } from '@/lib/users'
import { queryItems } from '@/lib/aws/dynamodb'
import type { ApiResponse, Transfer, AuditEvent } from '@/types'

const TRANSFERS_TABLE = process.env.DYNAMO_TRANSFERS_TABLE ?? 'vayu-transfers'
const AUDIT_TABLE = process.env.DYNAMO_AUDIT_TABLE ?? 'vayu-audit'

function dayKey(iso: string): string {
  return iso.slice(0, 10) // YYYY-MM-DD
}

export interface DashboardUsage {
  totalStorageBytes: number
  monthlyStorageBytes: number
  dailyStorageBytes: number
  totalTransfers: number
  totalDownloads: number
  totalSpentPaise: number
  // Last 30 days, oldest first — for a simple bar chart.
  dailySeries: { date: string; bytes: number }[]
  recentActivity: {
    auditId: string
    eventType: string
    outcome: string
    fileId?: string
    amountPaise?: number
    createdAt: string
  }[]
}

export async function GET(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'UNAUTHORIZED', message: 'Sign in to view your dashboard' },
        { status: 401 }
      )
    }
    const user = await getUserById(session.user.id)
    if (!user) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'NOT_FOUND', message: 'User not found' },
        { status: 404 }
      )
    }

    const transfers = await queryItems<Transfer>(
      TRANSFERS_TABLE, 'walletId-index', 'walletId = :w', { ':w': user.walletId }
    )

    const now = new Date()
    const todayKey = dayKey(now.toISOString())
    const monthPrefix = todayKey.slice(0, 7) // YYYY-MM

    // "Currently stored" excludes only failed (aborted-before-completion,
    // no object was ever finished) uploads — an expired-by-app-time
    // transfer's file still physically occupies storage until the bucket's
    // hard delete, so it still counts toward total storage used.
    const stored = transfers.filter((t) => t.status !== 'failed')

    let totalStorageBytes = 0, monthlyStorageBytes = 0, dailyStorageBytes = 0, totalSpentPaise = 0, totalDownloads = 0
    const byDay = new Map<string, number>()

    for (const t of stored) {
      totalStorageBytes += t.fileSizeBytes
      const k = dayKey(t.createdAt)
      byDay.set(k, (byDay.get(k) ?? 0) + t.fileSizeBytes)
      if (k.startsWith(monthPrefix)) monthlyStorageBytes += t.fileSizeBytes
      if (k === todayKey) dailyStorageBytes += t.fileSizeBytes
    }
    for (const t of transfers) {
      totalSpentPaise += t.amountDeducted
      totalDownloads += t.downloadsUsed
    }

    const dailySeries: { date: string; bytes: number }[] = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
      const k = dayKey(d.toISOString())
      dailySeries.push({ date: k, bytes: byDay.get(k) ?? 0 })
    }

    const auditEvents = await queryItems<AuditEvent>(
      AUDIT_TABLE, 'walletId-index', 'walletId = :w', { ':w': user.walletId }
    )
    const recentActivity = auditEvents
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 20)
      .map((e) => ({
        auditId: e.auditId,
        eventType: e.eventType,
        outcome: e.outcome,
        fileId: e.fileId,
        amountPaise: e.amountPaise,
        createdAt: e.createdAt,
      }))

    return NextResponse.json<ApiResponse<DashboardUsage>>({
      success: true,
      data: {
        totalStorageBytes,
        monthlyStorageBytes,
        dailyStorageBytes,
        totalTransfers: transfers.length,
        totalDownloads,
        totalSpentPaise,
        dailySeries,
        recentActivity,
      },
    })
  } catch (err) {
    console.error('[dashboard/usage GET]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to load usage' },
      { status: 500 }
    )
  }
}
