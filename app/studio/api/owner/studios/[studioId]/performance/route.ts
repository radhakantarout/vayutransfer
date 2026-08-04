import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioQueryByPK, studioQueryByIndex, TABLES } from '@/lib/studio/dynamodb'
import type { AuditLog, MediaFile, Studio, StudioProject } from '@/types/studio'

type Period = 'daily' | 'monthly' | 'yearly'

// GET .../performance?view=summary&period=daily|monthly|yearly
//     .../performance?view=deletes&from=&to=
//     .../performance?view=uploads&from=&to=
// One file, one shared owner-auth check — three views branch on ?view=
// rather than three separate route files, since they're inherently tied
// together (same studio, same page) and share almost all of their setup.
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
    const studio = await studioGetItem<Studio>(TABLES.studios, { studioId })
    if (!studio) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })

    const view = req.nextUrl.searchParams.get('view') ?? 'summary'

    if (view === 'summary') {
      const period = (req.nextUrl.searchParams.get('period') as Period) || 'monthly'
      const projects = await studioQueryByPK<StudioProject>(TABLES.projects, 'studioId', studioId)
      const realProjects = projects.filter((p) => !p.isPlaceholder)

      const now = new Date()
      const rangeStart = period === 'daily'
        ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
        : period === 'monthly'
          ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
          : new Date(Date.UTC(now.getUTCFullYear(), 0, 1))

      // Upload bytes for the period — derived straight from MediaFile.uploadedAt,
      // no separate tracking table needed (unlike downloads, see below).
      const allFiles = (await Promise.all(
        realProjects.map((p) => studioQueryByPK<MediaFile>(TABLES.mediafiles, 'projectId', p.projectId))
      )).flat()
      const uploadBytes = allFiles
        .filter((f) => f.uploadedAt && new Date(f.uploadedAt) >= rangeStart)
        .reduce((sum, f) => sum + (f.sizeBytes ?? 0), 0)

      return NextResponse.json({
        success: true,
        data: {
          totalClients: new Set(realProjects.map((p) => p.clientName)).size,
          totalEvents: realProjects.length,
          uploadBytes,
        },
      })
    }

    if (view === 'deletes') {
      const from = req.nextUrl.searchParams.get('from')
        ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
      const to = req.nextUrl.searchParams.get('to') ?? new Date().toISOString()

      const items = await studioQueryByIndex<AuditLog>(
        TABLES.auditlog, 'studioId-createdAt-index',
        'studioId = :sid AND createdAt BETWEEN :from AND :to',
        { ':sid': studioId, ':from': from, ':to': to },
        undefined, 200
      )
      const deletes = items
        .filter((i) => i.action === 'DELETE_PHOTOS' || i.action === 'DELETE_PROJECT' || i.action === 'DELETE_CLIENT')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

      return NextResponse.json({ success: true, data: { items: deletes } })
    }

    if (view === 'uploads') {
      const from = req.nextUrl.searchParams.get('from')
        ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      const to = req.nextUrl.searchParams.get('to') ?? new Date().toISOString()

      const projects = await studioQueryByPK<StudioProject>(TABLES.projects, 'studioId', studioId)
      const projectMap = new Map(projects.map((p) => [p.projectId, p]))
      const allFiles = (await Promise.all(
        projects.filter((p) => !p.isPlaceholder).map((p) => studioQueryByPK<MediaFile>(TABLES.mediafiles, 'projectId', p.projectId))
      )).flat()

      const uploads = allFiles
        .filter((f) => f.uploadedAt && f.uploadedAt >= from && f.uploadedAt <= to)
        .sort((a, b) => (b.uploadedAt ?? '').localeCompare(a.uploadedAt ?? ''))
        .slice(0, 500)
        .map((f) => ({
          fileId: f.fileId,
          projectId: f.projectId,
          clientName: projectMap.get(f.projectId)?.clientName ?? '—',
          originalFilename: f.originalFilename,
          sizeBytes: f.sizeBytes,
          uploadedAt: f.uploadedAt,
        }))

      return NextResponse.json({ success: true, data: { items: uploads } })
    }

    return NextResponse.json({ success: false, error: 'INVALID_VIEW' }, { status: 400 })
  } catch (err) {
    console.error('[owner studio performance GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
