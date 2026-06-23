'use client'

import { useEffect, useState } from 'react'
import type { Studio, StudioPlan } from '@/types/studio'

const PLANS: StudioPlan[] = ['STARTER', 'PRO', 'STUDIO', 'ENTERPRISE']

function formatBytes(bytes: number) {
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(0)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

interface Stats {
  totalStudios: number
  activeStudios: number
  totalProjects: number
  totalStorageGB: number
  totalUsers: number
  totalClients: number
  crossStudioClients: number
  clientsPerStudio: Record<string, number>
  usersByRole: Record<string, number>
}

export default function OwnerStudiosPage() {
  const [studios, setStudios]   = useState<Studio[]>([])
  const [stats, setStats]       = useState<Stats | null>(null)
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [toggling, setToggling]       = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleting, setDeleting]       = useState<string | null>(null)

  const [form, setForm] = useState({
    studioName: '', plan: 'STARTER' as StudioPlan,
    adminName: '', adminEmail: '', adminPhone: '', adminPassword: '',
  })
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const load = async () => {
    const [studiosRes, statsRes] = await Promise.all([
      fetch('/studio/api/owner/studios').then((r) => r.json()),
      fetch('/studio/api/owner/stats').then((r) => r.json()),
    ])
    if (studiosRes.success) setStudios(studiosRes.data)
    if (statsRes.success) setStats(statsRes.data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setCreating(true)
    const res = await fetch('/studio/api/owner/studios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    }).then((r) => r.json())
    setCreating(false)
    if (!res.success) { setFormError(res.message ?? 'Failed to create studio'); return }
    setShowForm(false)
    setForm({ studioName: '', plan: 'STARTER', adminName: '', adminEmail: '', adminPhone: '', adminPassword: '' })
    load()
  }

  const handleDelete = async (s: Studio) => {
    if (confirmDelete !== s.studioId) { setConfirmDelete(s.studioId); return }
    setDeleting(s.studioId)
    setConfirmDelete(null)
    await fetch(`/studio/api/owner/studios/${s.studioId}`, { method: 'DELETE' })
    setDeleting(null)
    load()
  }

  const toggleStatus = async (s: Studio) => {
    setToggling(s.studioId)
    const next = s.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE'
    await fetch(`/studio/api/owner/studios/${s.studioId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    })
    setToggling(null)
    load()
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">
      {confirmDelete && <div className="fixed inset-0 z-10" onClick={() => setConfirmDelete(null)} />}
      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Studios',         value: stats.totalStudios },
            { label: 'Projects',        value: stats.totalProjects },
            { label: 'Storage',         value: `${stats.totalStorageGB} GB` },
            { label: 'Clients',         value: stats.totalClients },
            { label: 'Cross-studio',    value: stats.crossStudioClients, hint: 'clients in 2+ studios' },
            { label: 'Admins',          value: stats.usersByRole['ADMIN'] ?? 0 },
          ].map(({ label, value, hint }) => (
            <div key={label} className="bg-card border border-border rounded-xl px-4 py-3">
              <div className="text-xl font-bold text-text-primary">{value}</div>
              <div className="text-xs text-muted mt-0.5">{label}</div>
              {hint && <div className="text-xs text-muted/60 mt-0.5">{hint}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Studios</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="bg-accent text-bg text-sm font-semibold px-4 py-2 rounded-lg hover:bg-accent/90 transition-colors"
        >
          {showForm ? 'Cancel' : '+ New Studio'}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleCreate} className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <h2 className="font-semibold text-text-primary">Create Studio + Admin Account</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { label: 'Studio name',     key: 'studioName',     type: 'text',     placeholder: 'Ravi Clicks' },
              { label: 'Admin name',      key: 'adminName',      type: 'text',     placeholder: 'Ravi Kumar' },
              { label: 'Admin email',     key: 'adminEmail',     type: 'email',    placeholder: 'ravi@raviphotos.com' },
              { label: 'Admin phone',     key: 'adminPhone',     type: 'tel',      placeholder: '9876543210' },
              { label: 'Admin password',  key: 'adminPassword',  type: 'password', placeholder: 'Min 8 characters' },
            ].map(({ label, key, type, placeholder }) => (
              <div key={key} className="space-y-1.5">
                <label className="text-xs text-muted">{label}</label>
                <input
                  type={type}
                  value={form[key as keyof typeof form]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  required
                  placeholder={placeholder}
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent"
                />
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted">Plan</label>
            <select
              value={form.plan}
              onChange={(e) => setForm((f) => ({ ...f, plan: e.target.value as StudioPlan }))}
              className="bg-bg border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent"
            >
              {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {formError && (
            <div className="bg-danger/10 border border-danger/30 rounded-lg px-3 py-2 text-sm text-danger">{formError}</div>
          )}

          <button
            type="submit"
            disabled={creating}
            className="bg-accent text-bg font-bold px-6 py-2.5 rounded-xl hover:bg-accent/90 transition-colors disabled:opacity-50 text-sm"
          >
            {creating ? 'Creating…' : 'Create Studio'}
          </button>
        </form>
      )}

      {/* Studios table */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : studios.length === 0 ? (
        <div className="text-center py-16 text-muted">No studios yet. Create the first one above.</div>
      ) : (
        <div className="space-y-2">
          {studios.map((s) => (
            <div key={s.studioId} className="bg-card border border-border rounded-2xl px-5 py-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-text-primary text-sm">{s.name}</div>
                <div className="text-xs text-muted mt-0.5 flex gap-3 flex-wrap">
                  <span>{s.plan}</span>
                  <span>·</span>
                  <span>{s.projectCount} projects</span>
                  <span>·</span>
                  <span>{stats?.clientsPerStudio?.[s.studioId] ?? 0} clients</span>
                  <span>·</span>
                  <span>{formatBytes(s.storageUsedBytes ?? 0)}</span>
                  <span>·</span>
                  <span>Created {new Date(s.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 relative z-20">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                  s.status === 'ACTIVE' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
                }`}>
                  {s.status}
                </span>
                <button
                  onClick={() => toggleStatus(s)}
                  disabled={toggling === s.studioId}
                  className="text-xs border border-border text-muted hover:text-text-primary hover:border-accent px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                >
                  {toggling === s.studioId ? '…' : s.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                </button>
                {confirmDelete === s.studioId ? (
                  <button
                    onClick={() => handleDelete(s)}
                    disabled={deleting === s.studioId}
                    className="text-xs bg-danger text-white font-semibold px-3 py-1.5 rounded-lg hover:bg-danger/80 transition-colors whitespace-nowrap"
                  >
                    {deleting === s.studioId ? '…' : 'Confirm delete'}
                  </button>
                ) : (
                  <button
                    onClick={() => handleDelete(s)}
                    disabled={deleting === s.studioId}
                    className="text-xs border border-border text-muted hover:text-danger hover:border-danger px-3 py-1.5 rounded-lg transition-colors"
                    title="Delete studio permanently"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
