import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioQueryByPK, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import type { StudioProject } from '@/types/studio'

// PATCH /studio/api/admin/clients/[clientName] — bulk-update contact info
// across every project belonging to this client. Clients aren't a real
// DynamoDB entity — this matches by exact clientName string against the
// studio's own projects, the same virtual grouping the sidebar already uses.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { clientName: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const studioId = auth.studioId!
    const currentClientName = decodeURIComponent(params.clientName)
    const body = await req.json().catch(() => ({}))
    const { clientName, clientEmail, clientPhone } = body

    if (clientName !== undefined && typeof clientName === 'string' && clientName.trim().length < 2) {
      return NextResponse.json(
        { success: false, error: 'INVALID_INPUT', message: 'Client name must be at least 2 characters' },
        { status: 400 }
      )
    }

    const allProjects = await studioQueryByPK<StudioProject>(TABLES.projects, 'studioId', studioId)
    const clientProjects = allProjects.filter(p => p.clientName === currentClientName)

    if (clientProjects.length === 0) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }

    const now = new Date().toISOString()
    const updates: string[] = ['updatedAt = :now']
    const values: Record<string, unknown> = { ':now': now }
    if (clientName !== undefined)  { updates.push('clientName = :cn');  values[':cn'] = clientName.trim() }
    if (clientEmail !== undefined) { updates.push('clientEmail = :ce'); values[':ce'] = clientEmail }
    if (clientPhone !== undefined) { updates.push('clientPhone = :cp'); values[':cp'] = clientPhone }
    const expression = `SET ${updates.join(', ')}`

    const results = await Promise.allSettled(
      clientProjects.map(p =>
        studioUpdateItem(TABLES.projects, { studioId, projectId: p.projectId }, expression, values)
      )
    )
    const failed = results.filter(r => r.status === 'rejected').length

    return NextResponse.json({
      success: true,
      data: { updated: clientProjects.length - failed, failed, total: clientProjects.length },
    })
  } catch (err) {
    console.error('[admin clients PATCH]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
