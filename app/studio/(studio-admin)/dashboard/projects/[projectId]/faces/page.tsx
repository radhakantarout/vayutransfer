'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import type { StudioFace } from '@/types/studio'

const QUICK_LABELS = ['Bride', 'Groom', 'Father of Bride', 'Mother of Bride',
  'Father of Groom', 'Mother of Groom', 'Best Man', 'Bridesmaid', 'Guest', 'Custom']

interface FaceData {
  totalFaces: number
  indexedPhotos: number
  pendingPhotos: number
  activeJob: { jobId: string; status: string } | null
  lastCompletedAt: string | null
  faces: (StudioFace & { previewUrls: string[] })[]
}

interface DetailFace extends StudioFace { previewUrls: string[] }

export default function FacesPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const router = useRouter()

  const [data, setData]             = useState<FaceData | null>(null)
  const [loading, setLoading]       = useState(true)
  const [triggering, setTriggering] = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [featureOff, setFeatureOff] = useState(false)
  const [detailFace, setDetailFace] = useState<DetailFace | null>(null)
  const [labelInput, setLabelInput] = useState('')
  const [labelSaving, setLabelSaving] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/studio/api/admin/projects/${projectId}/faces`).then(r => r.json())
    if (!res.success) return
    setData(res.data)
    setLoading(false)
  }, [projectId])

  useEffect(() => { load() }, [load])

  // Poll while a job is active
  useEffect(() => {
    if (!data?.activeJob) return
    const t = setInterval(load, 8000)
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
      if (res.error === 'FEATURE_DISABLED') setFeatureOff(true)
      else setError(res.message ?? res.error)
      return
    }
    setData(prev => prev ? { ...prev, activeJob: { jobId: res.data.jobId, status: 'PENDING' } } : prev)
  }

  const saveLabel = async (faceId: string, label: string) => {
    setLabelSaving(true)
    await fetch(`/studio/api/admin/projects/${projectId}/faces/${faceId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label }),
    })
    setLabelSaving(false)
    setDetailFace(prev => prev ? { ...prev, label } : prev)
    setData(prev => prev ? {
      ...prev,
      faces: prev.faces.map(f => f.faceId === faceId ? { ...f, label } : f),
    } : prev)
  }

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-7 h-7 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (featureOff) return (
    <div className="max-w-lg mx-auto px-6 py-16 text-center space-y-4">
      <div className="text-5xl">🔒</div>
      <h2 className="text-lg font-bold text-text-primary">AI Face Recognition</h2>
      <p className="text-sm text-muted">This feature is available on Studio and Enterprise plans. Contact us to upgrade.</p>
      <button onClick={() => router.back()} className="text-sm text-accent hover:underline">← Go back</button>
    </div>
  )

  const isIndexing = !!data?.activeJob
  const hasPhotos  = (data?.totalFaces ?? 0) > 0 || (data?.indexedPhotos ?? 0) > 0
  const neverRun   = !hasPhotos && !isIndexing

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      {/* Detail modal */}
      {detailFace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
            <div className="flex items-start gap-4">
              <img src={detailFace.thumbnailUrl} alt=""
                className="w-20 h-20 rounded-full object-cover border-2 border-accent/30 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-base font-bold text-text-primary">{detailFace.label || 'Unlabelled'}</p>
                <p className="text-xs text-muted mt-0.5">{detailFace.photoCount} photo{detailFace.photoCount !== 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => setDetailFace(null)} className="text-muted hover:text-text-primary">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Quick-label buttons */}
            <div>
              <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Quick Label</p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_LABELS.filter(l => l !== 'Custom').map(l => (
                  <button key={l}
                    onClick={() => l === detailFace.label ? null : saveLabel(detailFace.faceId, l)}
                    className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                      detailFace.label === l
                        ? 'bg-accent text-bg border-accent'
                        : 'border-border text-muted hover:text-text-primary hover:border-accent/40'
                    }`}
                  >{l}</button>
                ))}
              </div>
            </div>

            {/* Custom label input */}
            <div className="flex gap-2">
              <input
                value={labelInput || detailFace.label || ''}
                onChange={e => setLabelInput(e.target.value)}
                placeholder="Custom label…"
                maxLength={50}
                className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent/60"
              />
              <button
                disabled={labelSaving || !labelInput}
                onClick={() => { if (labelInput) { saveLabel(detailFace.faceId, labelInput); setLabelInput('') } }}
                className="text-xs bg-accent text-bg font-semibold px-3 py-2 rounded-lg hover:bg-accent/90 disabled:opacity-50 transition-colors"
              >Save</button>
            </div>

            {/* Photo mosaic */}
            {detailFace.previewUrls.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Photos</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {detailFace.previewUrls.slice(0, 6).map((url, i) => (
                    <div key={i} className="aspect-square rounded-lg overflow-hidden bg-card border border-border">
                      <img src={url} alt="" className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <a
              href={`/studio/dashboard/projects/${projectId}/faces/${detailFace.faceId}/photos`}
              className="block text-center text-xs text-accent hover:underline"
            >
              View all {detailFace.photoCount} photos →
            </a>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <button onClick={() => router.back()} className="text-sm text-muted hover:text-text-primary transition-colors">← Back</button>
            <span className="text-muted/40">/</span>
            <h1 className="text-xl font-bold text-text-primary">People</h1>
          </div>
          {data && (
            <p className="text-xs text-muted">
              {data.totalFaces} face{data.totalFaces !== 1 ? 's' : ''} · {data.indexedPhotos} photos indexed
              {data.pendingPhotos > 0 && ` · ${data.pendingPhotos} pending`}
            </p>
          )}
        </div>

        {!isIndexing && (
          <button
            onClick={triggerIndexing}
            disabled={triggering}
            className="flex items-center gap-2 bg-accent text-bg text-sm font-semibold px-4 py-2 rounded-xl hover:bg-accent/90 disabled:opacity-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.344.344a.75.75 0 01-.53.22H9.75a.75.75 0 01-.53-.22l-.344-.344z" />
            </svg>
            {neverRun ? 'Generate AI Faces' : triggering ? 'Starting…' : 'Re-index Faces'}
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
              {data?.activeJob?.status === 'PENDING' ? 'Queued — starting face indexing…' : `Indexing faces across ${data?.indexedPhotos ?? 0} photos…`}
            </p>
            <p className="text-xs text-muted mt-0.5">This runs in the background. You can leave this page — the bell icon will notify you when done.</p>
          </div>
        </div>
      )}

      {/* Never run state */}
      {neverRun && !isIndexing && (
        <div className="border border-dashed border-border rounded-2xl p-12 text-center space-y-4">
          <div className="text-5xl">✨</div>
          <h2 className="text-base font-bold text-text-primary">Discover the people in your photos</h2>
          <p className="text-sm text-muted max-w-sm mx-auto">
            AI Face Recognition groups photos by person automatically. Your client can then filter the gallery by face — or find all their own photos with a single selfie.
          </p>
          <div className="text-xs text-muted/60 bg-border/20 rounded-xl px-4 py-2 inline-block">
            ~₹95 per 1,000 photos · Free for first 1,000 images / month (AWS free tier)
          </div>
        </div>
      )}

      {/* Face grid */}
      {data && data.faces.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {data.faces.map(face => (
            <button
              key={face.faceId}
              onClick={() => { setDetailFace(face); setLabelInput('') }}
              className="group flex flex-col items-center gap-2 p-3 rounded-2xl border border-border hover:border-accent/40 hover:bg-accent/5 transition-all"
            >
              <div className="relative">
                <img
                  src={face.thumbnailUrl}
                  alt={face.label ?? 'Face'}
                  className="w-20 h-20 rounded-full object-cover border-2 border-border group-hover:border-accent/40 transition-colors"
                />
                <span className="absolute -bottom-1 -right-1 bg-card border border-border text-[10px] font-bold text-muted px-1.5 py-0.5 rounded-full">
                  {face.photoCount}
                </span>
              </div>
              <p className="text-xs font-medium text-text-primary text-center leading-tight">
                {face.label ?? <span className="text-muted/60 italic">Add label</span>}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* Indexed but no qualifying faces */}
      {data && !isIndexing && data.faces.length === 0 && !neverRun && (
        <div className="text-center py-12 text-sm text-muted">
          No faces found with 3+ photos. Try uploading more photos and re-indexing.
        </div>
      )}
    </div>
  )
}
