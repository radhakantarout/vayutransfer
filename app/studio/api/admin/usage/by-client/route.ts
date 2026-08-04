import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioQueryByPK, TABLES } from '@/lib/studio/dynamodb'
import type { StudioProject, MediaFile } from '@/types/studio'

// Real per-client storage breakdown for Settings > Usage — no cached
// per-project byte total exists (only the studio-wide billableStorageBytes
// aggregate does), so this sums each real project's MediaFile.sizeBytes on
// read. Same pattern already used by the owner Performance route's
// uploadBytes calc — acceptable N-query cost for a settings page load.
export async function GET(req: NextRequest) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role) || !auth.studioId) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const projects = await studioQueryByPK<StudioProject>(TABLES.projects, 'studioId', auth.studioId)
    const realProjects = projects.filter((p) => !p.isPlaceholder)

    const withBytes = await Promise.all(realProjects.map(async (p) => {
      const files = await studioQueryByPK<MediaFile>(TABLES.mediafiles, 'projectId', p.projectId)
      const storageBytes = files.reduce((sum, f) => sum + (f.sizeBytes ?? 0), 0)
      return {
        projectId: p.projectId,
        eventType: p.eventType,
        storageBytes,
        lastActivity: p.updatedAt ?? p.createdAt,
      }
    }))

    const byClient = new Map<string, { clientName: string; events: typeof withBytes }>()
    for (let i = 0; i < realProjects.length; i++) {
      const clientName = realProjects[i].clientName
      const entry = byClient.get(clientName) ?? { clientName, events: [] }
      entry.events.push(withBytes[i])
      byClient.set(clientName, entry)
    }

    const clients = Array.from(byClient.values())
      .map((c) => ({ ...c, totalBytes: c.events.reduce((s, e) => s + e.storageBytes, 0) }))
      .sort((a, b) => b.totalBytes - a.totalBytes)

    return NextResponse.json({ success: true, data: { clients } })
  } catch (err) {
    console.error('[admin/usage/by-client GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
