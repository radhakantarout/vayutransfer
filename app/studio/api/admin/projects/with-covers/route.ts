import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioQueryByPK, TABLES } from '@/lib/studio/dynamodb'
import { getMediaPreviewUrl } from '@/lib/studio/storage'
import type { StudioProject, MediaFile } from '@/types/studio'

// Deterministic pick so cards don't flicker between different photos on
// refresh, while still varying across projects that have no explicit cover.
function stableRandomIndex(seed: string, length: number): number {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % length
}

// GET /studio/api/admin/projects/with-covers — project list + resolved cover
// photo + photo count, for the My Projects dashboard's grid/list cards.
export async function GET(req: NextRequest) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const studioId = auth.studioId ?? req.nextUrl.searchParams.get('studioId')
    if (!studioId) {
      return NextResponse.json({ success: false, error: 'MISSING_STUDIO_ID' }, { status: 400 })
    }

    const projects = await studioQueryByPK<StudioProject>(TABLES.projects, 'studioId', studioId)
    projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

    const withCovers = await Promise.all(
      projects.map(async (project) => {
        const allFiles = await studioQueryByPK<MediaFile>(TABLES.mediafiles, 'projectId', project.projectId)
        const readyFiles = allFiles.filter(f => f.processingStatus === 'READY')

        const chosenCover = project.coverPhotoFileId
          ? readyFiles.find(f => f.fileId === project.coverPhotoFileId)
          : undefined
        const coverFile = chosenCover
          ?? (readyFiles.length > 0 ? readyFiles[stableRandomIndex(project.projectId, readyFiles.length)] : undefined)
        const coverUrl: string | null = coverFile ? (await getMediaPreviewUrl(coverFile)) ?? null : null

        return {
          ...project,
          coverUrl,
          photoCount: readyFiles.length,
        }
      })
    )

    return NextResponse.json({ success: true, data: withCovers })
  } catch (err) {
    console.error('[admin/projects with-covers GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
