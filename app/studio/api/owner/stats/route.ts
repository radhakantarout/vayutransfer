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

    // billableStorageBytes, not storageUsedBytes — the latter is a
    // historical, never-decremented "Total Upload Size" figure, so it drifts
    // further from reality every time anything gets deleted. billable is the
    // live, delete-aware number (see lib/studio/quota.ts's currentStorageBytes).
    const totalStorageBytes = studios.reduce((sum, s) => sum + Math.max(0, s.billableStorageBytes ?? 0), 0)
    const usersByRole = users.reduce<Record<string, number>>((acc, u) => {
      acc[u.role] = (acc[u.role] ?? 0) + 1
      return acc
    }, {})

    // Client stats
    const clients = users.filter((u) => u.role === 'CLIENT')
    const projectStudioMap = new Map(projects.map((p) => [p.projectId, p.studioId]))

    const crossStudioClients = clients.filter((c) => {
      if (!c.linkedProjectIds?.length) return false
      const studioIds = new Set(
        c.linkedProjectIds.map((pid) => projectStudioMap.get(pid)).filter(Boolean)
      )
      return studioIds.size > 1
    }).length

    // Per-studio client count
    const clientsPerStudio: Record<string, number> = {}
    for (const client of clients) {
      const seen = new Set<string>()
      for (const pid of client.linkedProjectIds ?? []) {
        const sid = projectStudioMap.get(pid)
        if (sid && !seen.has(sid)) {
          seen.add(sid)
          clientsPerStudio[sid] = (clientsPerStudio[sid] ?? 0) + 1
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        totalStudios:       studios.length,
        activeStudios:      studios.filter((s) => s.status === 'ACTIVE').length,
        totalProjects:      projects.length,
        totalStorageGB:     +(totalStorageBytes / (1024 ** 3)).toFixed(2),
        totalUsers:         users.length,
        totalClients:       clients.length,
        crossStudioClients,
        clientsPerStudio,
        usersByRole,
      },
    })
  } catch (err) {
    console.error('[owner stats]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
