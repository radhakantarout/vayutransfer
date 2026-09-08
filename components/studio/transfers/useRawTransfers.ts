'use client'

// Shared data-fetching for every Raw Transfer page (Send/Request/My
// Transfers/Activity) — each is a genuinely separate route with its own
// local state (no cross-page context, matching how VayuTransfer itself
// structures these as independent pages), but Manage/Activity both need the
// full transfers+projects list and its derived stats, and Send/Request both
// need resolveProject for the mandatory event-tag picker. Centralized here
// once instead of copy-pasted four times.

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { StudioProject, StudioTransfer } from '@/types/studio'
import { derivedStatus } from './transferUtils'

export function useRawTransfers() {
  const [transfers, setTransfers] = useState<StudioTransfer[] | null>(null)
  const [projects, setProjects] = useState<StudioProject[] | null>(null)
  const [loading, setLoading] = useState(false)

  const loadTransfers = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/studio/api/admin/transfers').then(r => r.json())
    if (res.success) setTransfers(res.data)
    setLoading(false)
  }, [])

  const loadProjects = useCallback(async (): Promise<StudioProject[]> => {
    const res = await fetch('/studio/api/admin/projects').then(r => r.json())
    const list: StudioProject[] = res.success ? res.data.filter((p: StudioProject) => !p.isPlaceholder) : []
    setProjects(list)
    return list
  }, [])

  useEffect(() => { loadTransfers(); loadProjects() }, [loadTransfers, loadProjects])

  // Poll while anything studio-wide is still PENDING/UPLOADING.
  useEffect(() => {
    const active = (transfers ?? []).some(t => t.status === 'PENDING' || t.status === 'UPLOADING')
    if (!active) return
    const timer = setInterval(loadTransfers, 5000)
    return () => clearInterval(timer)
  }, [transfers, loadTransfers])

  const projectsById = useMemo(() => {
    const map = new Map<string, StudioProject>()
    for (const p of projects ?? []) map.set(p.projectId, p)
    return map
  }, [projects])

  // The destination picker only ever hands back a projectId — a freshly
  // created event isn't in the cached `projects` list yet, so check the
  // cache first and refetch once before giving up.
  const resolveProject = useCallback(async (projectId: string): Promise<StudioProject | null> => {
    const cached = (projects ?? []).find(p => p.projectId === projectId)
    if (cached) return cached
    const fresh = await loadProjects()
    return fresh.find(p => p.projectId === projectId) ?? null
  }, [projects, loadProjects])

  const stats = useMemo(() => {
    const list = transfers ?? []
    const totalSize = list.reduce((sum, t) => sum + (t.sizeBytes ?? 0), 0)
    const active = list.filter(t => {
      const s = derivedStatus(t)
      return s === 'ACTIVE' || s === 'EXTENDED' || s === 'EXPIRING_SOON'
    }).length
    const expired = list.filter(t => derivedStatus(t) === 'EXPIRED').length
    return { total: list.length, totalSize, active, expired }
  }, [transfers])

  return { transfers, projects, projectsById, loading, loadTransfers, loadProjects, resolveProject, stats }
}
