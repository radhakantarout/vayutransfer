import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioQueryByPK, studioQueryByIndex, studioGetItem, TABLES } from '@/lib/studio/dynamodb'
import { getMediaPreviewUrl } from '@/lib/studio/storage'
import type { StudioProject, MediaFile, Selection, Studio } from '@/types/studio'

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || auth.role !== 'CLIENT') {
      return NextResponse.json({ success: false, error: 'UNAUTHENTICATED' }, { status: 401 })
    }

    const { token } = params

    // Resolve the entry project (the one whose token the client used to auth)
    const entryProjects = await studioQueryByIndex<StudioProject>(
      TABLES.projects,
      'clientShareToken-index',
      'clientShareToken = :token',
      { ':token': token }
    )
    const entry = entryProjects[0]
    if (!entry) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }
    if (!entry.clientShareExpiresAt || new Date(entry.clientShareExpiresAt) < new Date()) {
      return NextResponse.json({ success: false, error: 'TOKEN_EXPIRED' }, { status: 410 })
    }
    if (auth.projectId !== entry.projectId) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { studioId, clientEmail } = entry

    // Load all projects for this studio and filter to this client
    const [allProjects, studio] = await Promise.all([
      studioQueryByPK<StudioProject>(TABLES.projects, 'studioId', studioId),
      studioGetItem<Studio>(TABLES.studios, { studioId }),
    ])

    const now = new Date()
    const clientProjects = allProjects.filter(p =>
      p.clientEmail === clientEmail &&
      p.clientShareToken &&
      p.clientShareExpiresAt &&
      new Date(p.clientShareExpiresAt) > now
    )

    // For each event: get cover photo + selection counts (parallel)
    const events = await Promise.all(
      clientProjects.map(async (project) => {
        const [allFiles, selections] = await Promise.all([
          studioQueryByPK<MediaFile>(TABLES.mediafiles, 'projectId', project.projectId),
          studioQueryByPK<Selection>(TABLES.selections, 'projectId', project.projectId),
        ])

        const sharedSet = project.sharedFileIds && project.sharedFileIds.length > 0
          ? new Set(project.sharedFileIds)
          : null

        const readyFiles = allFiles
          .filter(f => f.processingStatus === 'READY' && (!sharedSet || sharedSet.has(f.fileId)))
          .sort((a, b) => a.displayOrder - b.displayOrder)

        // Cover = first ready photo
        const coverUrl: string | null = readyFiles[0] ? (await getMediaPreviewUrl(readyFiles[0])) ?? null : null

        const lovedCount = selections.filter(s => s.isSelected).length
        const editCount  = selections.filter(s => s.editingRequired).length

        return {
          project,
          coverUrl,
          photoCount:  readyFiles.length,
          lovedCount,
          editCount,
          isSubmitted: !!project.selectionSubmittedAt,
          submittedAt: project.selectionSubmittedAt ?? null,
        }
      })
    )

    // Sort events by eventDate ascending
    events.sort((a, b) => a.project.eventDate.localeCompare(b.project.eventDate))

    const totalLoved     = events.reduce((s, e) => s + e.lovedCount, 0)
    const totalEdit      = events.reduce((s, e) => s + e.editCount, 0)
    const totalSubmitted = events.filter(e => e.isSubmitted).length

    return NextResponse.json({
      success: true,
      data: {
        studio: { name: studio?.name ?? '', brandingConfig: studio?.brandingConfig ?? {} },
        clientName: entry.clientName,
        events,
        totalLoved,
        totalEdit,
        totalSubmitted,
      },
    })
  } catch (err) {
    console.error('[client-gallery overview GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
