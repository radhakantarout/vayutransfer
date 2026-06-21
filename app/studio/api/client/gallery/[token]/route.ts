import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioQueryByIndex, TABLES } from '@/lib/studio/dynamodb'
import type { StudioProject, MediaFile } from '@/types/studio'

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

    const projects = await studioQueryByIndex<StudioProject>(
      TABLES.projects,
      'clientShareToken-index',
      'clientShareToken = :token',
      { ':token': token }
    )
    const project = projects[0]
    if (!project) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }
    if (new Date(project.clientShareExpiresAt) < new Date()) {
      return NextResponse.json({ success: false, error: 'TOKEN_EXPIRED' }, { status: 410 })
    }
    if (auth.projectId !== project.projectId) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const files = await studioQueryByIndex<MediaFile>(
      TABLES.mediafiles,
      'projectId-index',
      'projectId = :pid',
      { ':pid': project.projectId }
    )

    const readyFiles = files
      .filter((f) => f.processingStatus === 'READY')
      .sort((a, b) => a.displayOrder - b.displayOrder)

    return NextResponse.json({ success: true, data: { project, files: readyFiles } })
  } catch (err) {
    console.error('[client-gallery GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
