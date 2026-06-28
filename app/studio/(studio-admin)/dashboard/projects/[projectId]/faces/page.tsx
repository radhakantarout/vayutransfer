'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'

interface StatusData {
  totalPhotos:    number
  indexedPhotos:  number
  pendingPhotos:  number
  activeJob:      { jobId: string; status: string } | null
  lastCompletedAt: string | null
}

export default function FaceIndexPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const router = useRouter()

  const [data, setData]             = useState<StatusData | null>(null)
  const [loading, setLoading]       = useState(true)
  const [triggering, setTriggering] = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [featureOff, setFeatureOff] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/studio/api/admin/projects/${projectId}/faces`).then(r => r.json())
      if (res.success) setData(res.data)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { load() }, [load])

  // Poll while a job is active
  useEffect(() => {
    if (!data?.activeJob) return
    const t = setInterval(load, 6000)
    return () => clearInterval(t)
  }, [data?.activeJob, load])

  const triggerIndexing = async () => {
    setTriggering(true)
    setError(null)
    const res = await fetch(`/studio/api/admin/projects/${projectId}/faces/index`, {
      method: 'POST',
    }).then(r => r.json())
    setTriggering(false)
    if (!res.success) {
      if (res.error === 'FEATURE_DISABLED') { setFeatureOff(true); return }
      setError(res.message ?? res.error)
      return
    }
    setData(prev => prev
      ? { ...prev, activeJob: { jobId: res.data.jobId, status: 'PENDING' } }
      : prev
    )
  }

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-7 h-7 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (featureOff) return (
    <div className="max-w-lg mx-auto px-6 py-16 text-center space-y-4">
      <div className="text-5xl">🔒</div>
      <h2 className="text-lg font-bold text-text-primary">AI Face Search</h2>
      <p className="text-sm text-muted">This feature is not enabled on your plan. Contact us to upgrade.</p>
      <button onClick={() => router.back()} className="text-sm text-accent hover:underline">← Go back</button>
    </div>
  )

  const isIndexing  = !!data?.activeJob
  const isReady     = !isIndexing && (data?.indexedPhotos ?? 0) > 0 && (data?.pendingPhotos ?? 0) === 0
  const hasPartial  = !isIndexing && (data?.indexedPhotos ?? 0) > 0 && (data?.pendingPhotos ?? 0) > 0
  const neverRun    = !isIndexing && (data?.indexedPhotos ?? 0) === 0

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <button onClick={() => router.back()} className="text-sm text-muted hover:text-text-primary transition-colors">← Back</button>
            <span className="text-muted/40">/</span>
            <h1 className="text-xl font-bold text-text-primary">Face Index</h1>
          </div>
          <p className="text-xs text-muted">
            Index faces so guests can find their own photos by uploading a selfie.
          </p>
        </div>

        {!isIndexing && (
          <button
            onClick={triggerIndexing}
            disabled={triggering}
            className="flex items-center gap-2 bg-accent text-bg text-sm font-semibold px-4 py-2 rounded-xl hover:bg-accent/90 disabled:opacity-50 transition-colors flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.344.344a.75.75 0 01-.53.22H9.75a.75.75 0 01-.53-.22l-.344-.344z" />
            </svg>
            {neverRun ? 'Generate Face Index' : triggering ? 'Starting…' : 'Re-index Faces'}
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>
      )}

      {/* Active job banner */}
      {isIndexing && (
        <div className="bg-accent/10 border border-accent/30 rounded-xl px-5 py-4 flex items-center gap-4">
          <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-text-primary">
              {data?.activeJob?.status === 'PENDING' ? 'Queued — starting face indexing…' : 'Indexing faces…'}
            </p>
            <p className="text-xs text-muted mt-0.5">This runs in the background. You can leave this page.</p>
          </div>
        </div>
      )}

      {/* Status card */}
      <div className="border border-border rounded-2xl divide-y divide-border overflow-hidden">

        {/* Photo count row */}
        <div className="px-5 py-4 flex items-center justify-between">
          <span className="text-sm text-muted">Photos indexed</span>
          <span className="text-sm font-bold text-text-primary">
            {data?.indexedPhotos ?? 0} / {data?.totalPhotos ?? 0}
          </span>
        </div>

        {/* Status row */}
        <div className="px-5 py-4 flex items-center justify-between">
          <span className="text-sm text-muted">Status</span>
          <span className={`text-sm font-bold ${
            isIndexing ? 'text-accent' :
            isReady    ? 'text-success' :
            hasPartial ? 'text-yellow-400' :
            'text-muted'
          }`}>
            {isIndexing  ? 'Indexing…' :
             isReady     ? '✓ Ready for guest search' :
             hasPartial  ? `${data?.pendingPhotos} photos pending` :
             'Not indexed yet'}
          </span>
        </div>

        {/* Last run row */}
        {data?.lastCompletedAt && (
          <div className="px-5 py-4 flex items-center justify-between">
            <span className="text-sm text-muted">Last indexed</span>
            <span className="text-sm text-text-primary">
              {new Date(data.lastCompletedAt).toLocaleDateString('en-IN', {
                day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
              })}
            </span>
          </div>
        )}
      </div>

      {/* Never-run empty state */}
      {neverRun && !error && (
        <div className="border border-dashed border-border rounded-2xl p-10 text-center space-y-3">
          <div className="text-4xl">🔍</div>
          <h2 className="text-sm font-bold text-text-primary">No faces indexed yet</h2>
          <p className="text-xs text-muted max-w-xs mx-auto">
            Once you generate the index, guests can open the gallery and upload a selfie to instantly find all their photos.
          </p>
          <div className="text-xs text-muted/60 bg-border/20 rounded-xl px-4 py-2 inline-block">
            ~₹83 per 1,000 photos · First 5,000 photos/month free (AWS free tier)
          </div>
        </div>
      )}

      {/* Ready state — how guests use it */}
      {isReady && (
        <div className="bg-success/5 border border-success/20 rounded-2xl px-5 py-5 space-y-2">
          <p className="text-sm font-bold text-success">✓ Face index ready</p>
          <p className="text-xs text-muted leading-relaxed">
            Guests can now open the gallery link and tap <strong className="text-text-primary">Find My Photos</strong> to upload a selfie and instantly see all photos with them.
          </p>
        </div>
      )}
    </div>
  )
}
