import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioScanTable, TABLES } from '@/lib/studio/dynamodb'
import type { Studio, StudioProject, StudioUser } from '@/types/studio'

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || auth.role !== 'OWNER') {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const [studios, projects, users] = await Promise.all([
      studioScanTable<Studio>(TABLES.studios),
      studioScanTable<StudioProject>(TABLES.projects),
      studioScanTable<StudioUser>(TABLES.users),
    ])

    const totalStorageBytes = studios.reduce((sum, s) => sum + (s.storageUsedBytes ?? 0), 0)
    const usersByRole = users.reduce<Record<string, number>>((acc, u) => {
      acc[u.role] = (acc[u.role] ?? 0) + 1
      return acc
    }, {})

    return NextResponse.json({
      success: true,
      data: {
        totalStudios:    studios.length,
        activeStudios:   studios.filter((s) => s.status === 'ACTIVE').length,
        totalProjects:   projects.length,
        totalStorageGB:  +(totalStorageBytes / (1024 ** 3)).toFixed(2),
        totalUsers:      users.length,
        usersByRole,
      },
    })
  } catch (err) {
    console.error('[owner stats]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
