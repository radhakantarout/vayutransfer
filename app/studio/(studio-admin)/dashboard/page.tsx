'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { StudioProject } from '@/types/studio'

const STATUS_COLOR: Record<string, string> = {
  DRAFT:              'text-muted',
  ACTIVE:             'text-accent',
  SELECTION_RECEIVED: 'text-yellow-400',
  COMPLETED:          'text-success',
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT:              'Draft',
  ACTIVE:             'Active',
  SELECTION_RECEIVED: 'Selection received',
  COMPLETED:          'Completed',
}

export default function DashboardPage() {
  const [projects, setProjects] = useState<StudioProject[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => {
    fetch('/studio/api/admin/projects')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setProjects(d.data)
        else setError(d.message ?? 'Failed to load projects')
      })
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-text-primary">Projects</h1>
        <Link
          href="/studio/dashboard/projects/new"
          className="bg-accent text-bg text-sm font-semibold px-4 py-2 rounded-lg hover:bg-accent/90 transition-colors"
        >
          + New Project
        </Link>
      </div>

      {loading && (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-xl px-4 py-3 text-sm text-danger">{error}</div>
      )}

      {!loading && !error && projects.length === 0 && (
        <div className="text-center py-20 space-y-4">
          <div className="text-5xl">📷</div>
          <div className="text-text-primary font-semibold text-lg">No projects yet</div>
          <div className="text-muted text-sm">Create your first project to start uploading photos</div>
          <Link
            href="/studio/dashboard/projects/new"
            className="inline-block bg-accent text-bg text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-accent/90 transition-colors mt-2"
          >
            Create Project
          </Link>
        </div>
      )}

      {!loading && projects.length > 0 && (
        <div className="space-y-3">
          {projects.map((p) => (
            <Link
              key={p.projectId}
              href={`/studio/dashboard/projects/${p.projectId}`}
              className="block bg-card border border-border rounded-2xl p-5 hover:border-accent/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-semibold text-text-primary">{p.clientName}</div>
                  <div className="text-xs text-muted mt-1 flex items-center gap-2 flex-wrap">
                    <span>{p.eventType.replace('_', ' ')}</span>
                    <span>·</span>
                    <span>{new Date(p.eventDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    {p.clientEmail && <><span>·</span><span>{p.clientEmail}</span></>}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className={`text-xs font-semibold ${STATUS_COLOR[p.status] ?? 'text-muted'}`}>
                    {STATUS_LABEL[p.status] ?? p.status}
                  </span>
                  <div className="text-xs text-muted mt-1">{p.totalFiles} photos</div>
                </div>
              </div>

              {p.status === 'SELECTION_RECEIVED' && (
                <div className="mt-3 flex gap-4 text-xs">
                  <span className="text-accent">{p.selectedFilesCount} selected</span>
                  {p.editingRequiredCount > 0 && (
                    <span className="text-yellow-400">{p.editingRequiredCount} need edits</span>
                  )}
                  {p.commentsCount > 0 && (
                    <span className="text-muted">{p.commentsCount} comments</span>
                  )}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
