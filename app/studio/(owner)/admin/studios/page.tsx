'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { Studio, StudioPlan } from '@/types/studio'

const PLANS: StudioPlan[] = ['STARTER', 'PRO', 'STUDIO', 'ENTERPRISE']

function formatBytes(bytes: number) {
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(0)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
}

function isValidPhone(digits: string) {
  return /^[6-9]\d{9}$/.test(digits.trim())
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

interface FormState {
  studioName: string
  plan: StudioPlan
  adminName: string
  adminEmail: string
  adminPhone: string
}

const EMPTY_FORM: FormState = {
  studioName: '', plan: 'STARTER',
  adminName: '', adminEmail: '', adminPhone: '',
}

export default function OwnerStudiosPage() {
  const [studios, setStudios]   = useState<Studio[]>([])
  const [stats, setStats]       = useState<Stats | null>(null)
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [toggling, setToggling]           = useState<string | null>(null)
  const [togglingAI, setTogglingAI]       = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleting, setDeleting]           = useState<string | null>(null)
  const [confirmSuspend, setConfirmSuspend] = useState<string | null>(null)
  const [reasonDrafts, setReasonDrafts]     = useState<Record<string, string>>({})
  const [search, setSearch]     = useState('')
  const [sortKey, setSortKey]   = useState<'name' | 'storage' | 'createdAt'>('createdAt')
  const [sortDir, setSortDir]   = useState<'asc' | 'desc'>('desc')

  const [form, setForm]         = useState<FormState>(EMPTY_FORM)
  const [touched, setTouched]   = useState<Partial<Record<keyof FormState, boolean>>>({})
  const [creating, setCreating] = useState(false)
  const [formError, setFormError]     = useState<string | null>(null)
  const [formSuccess, setFormSuccess] = useState<string | null>(null)

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

  const toggleSort = (key: 'name' | 'storage' | 'createdAt') => {
    if (sortKey === key) { setSortDir((d) => (d === 'asc' ? 'desc' : 'asc')); return }
    setSortKey(key)
    // Storage/date read most-naturally newest/largest-first on first click;
    // name reads most-naturally A→Z first.
    setSortDir(key === 'name' ? 'asc' : 'desc')
  }

  const visibleStudios = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = q ? studios.filter((s) => s.name.toLowerCase().includes(q)) : studios
    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name)
      else if (sortKey === 'storage') cmp = (a.billableStorageBytes ?? 0) - (b.billableStorageBytes ?? 0)
      else cmp = (a.createdAt ?? '').localeCompare(b.createdAt ?? '')
      return sortDir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [studios, search, sortKey, sortDir])

  const setField = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const touch = (k: keyof FormState) => setTouched((t) => ({ ...t, [k]: true }))

  const getFieldError = (k: keyof FormState): string | null => {
    if (!touched[k]) return null
    switch (k) {
      case 'studioName':
        return form.studioName.trim().length < 2 ? 'Studio name must be at least 2 characters' : null
      case 'adminName':
        return form.adminName.trim().length < 2 ? 'Admin name must be at least 2 characters' : null
      case 'adminEmail':
        if (!form.adminEmail.trim()) return 'Email is required'
        return !isValidEmail(form.adminEmail) ? 'Enter a valid email address (e.g. ravi@studio.com)' : null
      case 'adminPhone':
        if (!form.adminPhone.trim()) return 'Phone number is required'
        if (!/^\d+$/.test(form.adminPhone.trim())) return 'Enter digits only (no spaces or dashes)'
        if (!isValidPhone(form.adminPhone)) return 'Enter a valid 10-digit number starting with 6–9'
        return null
      default: return null
    }
  }

  const allRequiredFields: (keyof FormState)[] = [
    'studioName', 'adminName', 'adminEmail', 'adminPhone',
  ]

  const isFormValid = (() => {
    if (form.studioName.trim().length < 2) return false
    if (form.adminName.trim().length < 2) return false
    if (!isValidEmail(form.adminEmail)) return false
    if (!isValidPhone(form.adminPhone)) return false
    return true
  })()

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const allTouched = Object.fromEntries(allRequiredFields.map((k) => [k, true])) as Partial<Record<keyof FormState, boolean>>
    setTouched(allTouched)
    if (!isFormValid) return
    setFormError(null)
    setFormSuccess(null)
    setCreating(true)
    const res = await fetch('/studio/api/owner/studios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studioName: form.studioName.trim(),
        plan:       form.plan,
        adminName:  form.adminName.trim(),
        adminEmail: form.adminEmail.trim().toLowerCase(),
        adminPhone: `+91${form.adminPhone.trim()}`,
      }),
    }).then((r) => r.json())
    setCreating(false)
    if (!res.success) {
      setFormError(
        res.error === 'EMAIL_TAKEN'
          ? 'An admin account with this email already exists. Use a different email address.'
          : res.message ?? 'Failed to create studio. Please try again.'
      )
      return
    }
    setFormSuccess(`Studio "${form.studioName.trim()}" created! Welcome email sent to ${form.adminEmail.trim().toLowerCase()}.`)
    setShowForm(false)
    setForm(EMPTY_FORM)
    setTouched({})
    load()
  }

  const handleDelete = async (s: Studio) => {
    if (confirmDelete !== s.studioId) { setConfirmDelete(s.studioId); setConfirmSuspend(null); return }
    setDeleting(s.studioId)
    setConfirmDelete(null)
    await fetch(`/studio/api/owner/studios/${s.studioId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reasonDrafts[s.studioId]?.trim() || undefined }),
    })
    setDeleting(null)
    setReasonDrafts((d) => ({ ...d, [s.studioId]: '' }))
    load()
  }

  const toggleStatus = async (s: Studio) => {
    // Suspending needs a confirm step (with optional reason) — reactivating is instant
    if (s.status === 'ACTIVE' && confirmSuspend !== s.studioId) {
      setConfirmSuspend(s.studioId)
      setConfirmDelete(null)
      return
    }
    setToggling(s.studioId)
    setConfirmSuspend(null)
    const next = s.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE'
    await fetch(`/studio/api/owner/studios/${s.studioId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next, reason: reasonDrafts[s.studioId]?.trim() || undefined }),
    })
    setToggling(null)
    setReasonDrafts((d) => ({ ...d, [s.studioId]: '' }))
    load()
  }

  const toggleAI = async (s: Studio) => {
    setTogglingAI(s.studioId)
    const next = !s.featureFlags?.aiFaceRecognition
    await fetch(`/studio/api/owner/studios/${s.studioId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ featureFlag: { key: 'aiFaceRecognition', value: next } }),
    })
    setTogglingAI(null)
    load()
  }

  const inputBase = 'w-full bg-bg border rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder:text-muted focus:outline-none transition-colors'
  const inputClass = (k: keyof FormState) =>
    `${inputBase} ${getFieldError(k) ? 'border-danger focus:border-danger' : 'border-border focus:border-accent'}`

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">
      {(confirmDelete || confirmSuspend) && (
        <div className="fixed inset-0 z-10" onClick={() => { setConfirmDelete(null); setConfirmSuspend(null) }} />
      )}

      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Studios',      value: stats.totalStudios },
            { label: 'Projects',     value: stats.totalProjects },
            { label: 'Storage',      value: `${stats.totalStorageGB} GB` },
            { label: 'Clients',      value: stats.totalClients },
            { label: 'Cross-studio', value: stats.crossStudioClients, hint: 'clients in 2+ studios' },
            { label: 'Admins',       value: stats.usersByRole['ADMIN'] ?? 0 },
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
          onClick={() => { setShowForm((v) => !v); setFormError(null); setFormSuccess(null) }}
          className="bg-accent text-bg text-sm font-semibold px-4 py-2 rounded-lg hover:bg-accent/90 transition-colors"
        >
          {showForm ? 'Cancel' : '+ New Studio'}
        </button>
      </div>

      {/* Success banner after create */}
      {formSuccess && !showForm && (
        <div className="bg-success/10 border border-success/30 rounded-xl px-4 py-3 text-sm text-success flex items-start gap-2">
          <span>✓</span><span>{formSuccess}</span>
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleCreate} className="bg-card border border-border rounded-2xl p-6 space-y-5">
          <div>
            <h2 className="font-semibold text-text-primary">Create Studio + Admin Account</h2>
            <p className="text-xs text-muted mt-1">
              Admin receives a welcome email with a link to set their own password and sign in.
              You&apos;ll receive a creation confirmation at support@vayutransfer.com.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Studio name */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted">Studio name <span className="text-danger">*</span></label>
              <input
                type="text"
                value={form.studioName}
                onChange={(e) => setField('studioName', e.target.value)}
                onBlur={() => touch('studioName')}
                placeholder="Ravi Clicks"
                className={inputClass('studioName')}
              />
              {getFieldError('studioName') && <p className="text-xs text-danger">{getFieldError('studioName')}</p>}
            </div>

            {/* Admin name */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted">Admin name <span className="text-danger">*</span></label>
              <input
                type="text"
                value={form.adminName}
                onChange={(e) => setField('adminName', e.target.value)}
                onBlur={() => touch('adminName')}
                placeholder="Ravi Kumar"
                className={inputClass('adminName')}
              />
              {getFieldError('adminName') && <p className="text-xs text-danger">{getFieldError('adminName')}</p>}
            </div>

            {/* Admin email */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted">Admin email <span className="text-danger">*</span></label>
              <input
                type="email"
                value={form.adminEmail}
                onChange={(e) => setField('adminEmail', e.target.value)}
                onBlur={() => touch('adminEmail')}
                placeholder="ravi@raviphotos.com"
                className={inputClass('adminEmail')}
              />
              {getFieldError('adminEmail') && <p className="text-xs text-danger">{getFieldError('adminEmail')}</p>}
              {touched.adminEmail && !getFieldError('adminEmail') && form.adminEmail.trim() && (
                <p className="text-xs text-muted">Stored as lowercase — login works regardless of case</p>
              )}
            </div>

            {/* Admin phone with +91 prefix */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted">Admin phone <span className="text-danger">*</span></label>
              <div className={`flex items-center border rounded-lg overflow-hidden transition-colors ${getFieldError('adminPhone') ? 'border-danger' : 'border-border focus-within:border-accent'}`}>
                <span className="bg-muted/10 text-muted text-sm px-3 py-2.5 border-r border-border select-none whitespace-nowrap">+91</span>
                <input
                  type="tel"
                  value={form.adminPhone}
                  onChange={(e) => setField('adminPhone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                  onBlur={() => touch('adminPhone')}
                  placeholder="9876543210"
                  maxLength={10}
                  className="flex-1 bg-bg px-3 py-2.5 text-sm text-text-primary placeholder:text-muted focus:outline-none"
                />
              </div>
              {getFieldError('adminPhone') && <p className="text-xs text-danger">{getFieldError('adminPhone')}</p>}
            </div>

          </div>

          {/* Plan */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted">Plan</label>
            <select
              value={form.plan}
              onChange={(e) => setField('plan', e.target.value)}
              className="bg-bg border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent"
            >
              {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {formError && (
            <div className="bg-danger/10 border border-danger/30 rounded-lg px-3 py-2 text-sm text-danger">{formError}</div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={creating}
              className="bg-accent text-bg font-bold px-6 py-2.5 rounded-xl hover:bg-accent/90 transition-colors disabled:opacity-50 text-sm"
            >
              {creating ? 'Creating…' : 'Create Studio'}
            </button>
            <span className="text-xs text-muted">Admin will receive a welcome email with login link</span>
          </div>
        </form>
      )}

      {/* Search + sort toolbar */}
      {!loading && studios.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative w-64 flex-shrink-0">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search studios…"
              className="w-full bg-card border border-border rounded-xl pl-9 pr-8 py-2 text-sm text-text-primary placeholder:text-muted/60 focus:outline-none focus:border-accent/60 transition-colors"
            />
            {search && (
              <button onClick={() => setSearch('')} title="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full text-muted hover:text-text-primary hover:bg-border/60 transition-colors">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-muted">Sort:</span>
            {([['name', 'Name'], ['storage', 'Storage'], ['createdAt', 'Created']] as const).map(([key, label]) => (
              <button key={key} onClick={() => toggleSort(key)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border font-semibold transition-colors ${
                  sortKey === key ? 'border-accent/50 bg-accent/10 text-accent' : 'border-border text-muted hover:text-text-primary'
                }`}>
                {label}
                {sortKey === key && (
                  <svg className={`w-3 h-3 transition-transform ${sortDir === 'asc' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Studios list */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : studios.length === 0 ? (
        <div className="text-center py-16 text-muted">No studios yet. Create the first one above.</div>
      ) : visibleStudios.length === 0 ? (
        <div className="text-center py-16 text-muted">No studios match &quot;{search}&quot;.</div>
      ) : (
        <div className="space-y-2">
          {visibleStudios.map((s) => (
            <div key={s.studioId} className="bg-card border border-border rounded-2xl px-5 py-4 space-y-3">
              <div className="flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-text-primary text-sm">{s.name}</div>
                  <div className="text-xs text-muted mt-0.5 flex gap-3 flex-wrap">
                    <span>{s.plan}</span>
                    <span>·</span>
                    <span>{s.projectCount} events</span>
                    <span>·</span>
                    <span>{stats?.clientsPerStudio?.[s.studioId] ?? 0} clients</span>
                    <span>·</span>
                    <span title="Live storage — decreases as photos are deleted">{formatBytes(Math.max(0, s.billableStorageBytes ?? 0))}</span>
                    <span>·</span>
                    <span title="Cumulative photos ever indexed — never decreases">{s.aiSearchCreditsUsed ?? 0} AI indexed</span>
                    <span>·</span>
                    <span>Created {new Date(s.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 relative z-20">
                  <Link
                    href={`/studio/admin/studios/${s.studioId}/performance`}
                    className="text-xs border border-border text-muted hover:text-accent hover:border-accent/40 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                    title="View performance — deletes, uploads, downloads, clients, events"
                  >
                    Performance
                  </Link>
                  <button
                    onClick={() => toggleAI(s)}
                    disabled={togglingAI === s.studioId}
                    title={s.featureFlags?.aiFaceRecognition ? 'Disable AI Face Recognition' : 'Enable AI Face Recognition'}
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-colors disabled:opacity-40 ${
                      s.featureFlags?.aiFaceRecognition
                        ? 'bg-purple-500/15 text-purple-400 hover:bg-purple-500/25'
                        : 'bg-muted/10 text-muted hover:bg-muted/20'
                    }`}
                  >
                    {togglingAI === s.studioId ? '…' : s.featureFlags?.aiFaceRecognition ? '✦ AI On' : '✦ AI Off'}
                  </button>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                    s.status === 'ACTIVE' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
                  }`}>
                    {s.status}
                  </span>
                  <button
                    onClick={() => toggleStatus(s)}
                    disabled={toggling === s.studioId}
                    className={`text-xs border px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40 ${
                      confirmSuspend === s.studioId
                        ? 'bg-danger text-white border-danger font-semibold'
                        : 'border-border text-muted hover:text-text-primary hover:border-accent'
                    }`}
                  >
                    {toggling === s.studioId
                      ? '…'
                      : s.status === 'ACTIVE'
                        ? (confirmSuspend === s.studioId ? 'Confirm suspend' : 'Suspend')
                        : 'Activate'}
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

              {(confirmSuspend === s.studioId || confirmDelete === s.studioId) && (
                <div className="relative z-20 flex items-center gap-2 pl-1">
                  <input
                    type="text"
                    value={reasonDrafts[s.studioId] ?? ''}
                    onChange={(e) => setReasonDrafts((d) => ({ ...d, [s.studioId]: e.target.value }))}
                    placeholder={`Reason (optional, included in the email to the studio)`}
                    className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-muted focus:outline-none focus:border-accent"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
