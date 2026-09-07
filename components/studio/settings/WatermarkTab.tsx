'use client'

import { useEffect, useState } from 'react'
import type { WatermarkPreset as Watermark, WatermarkPosition as Position } from '@/types/studio'

type WatermarkType = Watermark['type']

const PREVIEW_BASE = (process.env.NEXT_PUBLIC_STUDIO_PREVIEW_URL ?? 'https://previews.vayustudios.com').replace(/\/$/, '')
const logoUrl = (r2Key: string) => `${PREVIEW_BASE}/${r2Key}`

function StarIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 20 20" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={filled ? 0 : 1.5}>
      <path strokeLinejoin="round" d="M10 1.5l2.6 5.27 5.82.85-4.21 4.1.99 5.8L10 14.9l-5.2 2.73.99-5.8-4.21-4.1 5.82-.85L10 1.5z" />
    </svg>
  )
}

const FONT_CLASS: Record<Watermark['font'], string> = {
  sans: 'font-sans font-bold',
  serif: 'font-serif font-semibold italic',
  script: 'font-serif italic',
}

const POSITION_CLASS: Record<Position, string> = {
  'top-left': 'items-start justify-start',
  'top-center': 'items-start justify-center',
  'top-right': 'items-start justify-end',
  'center-left': 'items-center justify-start',
  'center': 'items-center justify-center',
  'center-right': 'items-center justify-end',
  'bottom-left': 'items-end justify-start',
  'bottom-center': 'items-end justify-center',
  'bottom-right': 'items-end justify-end',
}

// Renders the mock "sample photo" with a watermark overlaid approximately
// the way the real Lambda-based pipeline renders it (lambda/vayustudio-
// watermark/index.js) — pure CSS/img here, not real image processing, so
// treat this as "close enough to judge the design," not pixel-exact.
function WatermarkPreview({ wm, className = '' }: { wm: Watermark; className?: string }) {
  const label = wm.text || 'Watermark'
  return (
    <div className={`relative overflow-hidden rounded-xl bg-gradient-to-br from-accent/30 via-border to-accent/10 ${className}`}>
      {wm.tiled ? (
        <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
          <div className="grid grid-cols-3 gap-8 rotate-[-28deg] scale-150">
            {Array.from({ length: 9 }).map((_, i) => (
              wm.type === 'logo' && wm.logoR2Key ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={logoUrl(wm.logoR2Key)} alt="" className="object-contain"
                  style={{ width: wm.size, opacity: wm.opacity / 100 }} />
              ) : (
                <span key={i} className={`whitespace-nowrap ${FONT_CLASS[wm.font]}`}
                  style={{ color: wm.color, opacity: wm.opacity / 100, fontSize: Math.max(10, wm.size * 0.5) }}>
                  {label}
                </span>
              )
            ))}
          </div>
        </div>
      ) : (
        <div className={`absolute inset-0 flex p-3 ${POSITION_CLASS[wm.position]}`}>
          {wm.type === 'logo' ? (
            wm.logoR2Key ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl(wm.logoR2Key)} alt="" className="object-contain"
                style={{ width: wm.size, opacity: wm.opacity / 100 }} />
            ) : (
              <div className="rounded-lg bg-white/90 flex items-center justify-center font-black text-accent"
                style={{ width: wm.size, height: wm.size * 0.6, opacity: wm.opacity / 100, fontSize: wm.size * 0.28 }}>
                LOGO
              </div>
            )
          ) : (
            <span className={`whitespace-nowrap ${FONT_CLASS[wm.font]}`}
              style={{ color: wm.color, opacity: wm.opacity / 100, fontSize: wm.size }}>
              {label}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function WatermarkCard({ wm, onEdit, onDelete, onToggleDefault }: { wm: Watermark; onEdit: () => void; onDelete: () => void; onToggleDefault: () => void }) {
  return (
    <div className="border border-border rounded-2xl overflow-hidden group">
      <div className="relative">
        <WatermarkPreview wm={wm} className="aspect-[4/3]" />
        {wm.isDefault && (
          <span className="absolute top-2 left-2 flex items-center gap-1 bg-accent text-bg text-[9px] font-bold px-2 py-0.5 rounded-full shadow">
            <StarIcon filled /> Default
          </span>
        )}
      </div>
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-bold text-text-primary truncate">{wm.name}</p>
            <p className="text-[10px] text-muted uppercase tracking-wide">{wm.type === 'logo' ? 'Logo' : 'Text'} watermark</p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={onEdit} title="Edit"
              className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-accent hover:bg-accent/10 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
              </svg>
            </button>
            <button onClick={onDelete} title="Delete"
              className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-danger hover:bg-danger/10 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </button>
          </div>
        </div>
        <button onClick={onToggleDefault}
          title={wm.isDefault ? 'Unset as default' : 'Use as default across new projects'}
          className={`flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-full border transition-colors ${
            wm.isDefault ? 'bg-accent/10 border-accent/40 text-accent' : 'border-border text-muted hover:text-text-primary hover:border-accent/40'
          }`}>
          <StarIcon filled={wm.isDefault} />
          {wm.isDefault ? 'Default' : 'Set as default'}
        </button>
      </div>
    </div>
  )
}

const POSITIONS: Position[] = ['top-left', 'top-center', 'top-right', 'center-left', 'center', 'center-right', 'bottom-left', 'bottom-center', 'bottom-right']

function WatermarkEditor({ initial, onSave, onCancel }: { initial: Watermark; onSave: (wm: Watermark) => void; onCancel: () => void }) {
  const [wm, setWm] = useState<Watermark>(initial)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const set = <K extends keyof Watermark>(key: K, value: Watermark[K]) => setWm(prev => ({ ...prev, [key]: value }))

  const handleLogoFile = async (file: File | undefined) => {
    if (!file) return
    setUploading(true); setUploadError(null)
    try {
      const initRes = await fetch('/studio/api/admin/settings/watermark-logo-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentType: file.type, sizeBytes: file.size }),
      }).then(r => r.json())
      if (!initRes.success) throw new Error(initRes.error ?? 'Could not prepare upload')

      const putRes = await fetch(initRes.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
      if (!putRes.ok) throw new Error('Upload to storage failed — please try again')

      set('logoR2Key', initRes.r2Key)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Logo upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Controls */}
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted">Watermark name</label>
          <input value={wm.name} onChange={e => set('name', e.target.value)}
            className="w-full bg-bg border border-border rounded-xl px-3.5 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent/60 transition-colors" />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted">Type</label>
          <div className="flex items-center gap-1.5">
            {(['text', 'logo'] as WatermarkType[]).map(t => (
              <button key={t} onClick={() => set('type', t)}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                  wm.type === t ? 'bg-accent text-bg border-accent' : 'border-border text-muted hover:text-text-primary'
                }`}>
                {t === 'text' ? 'Letter / Text' : 'Logo image'}
              </button>
            ))}
          </div>
        </div>

        {wm.type === 'text' ? (
          <>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted">Text</label>
              <input value={wm.text} onChange={e => set('text', e.target.value)} placeholder="e.g. © Rk Studio"
                className="w-full bg-bg border border-border rounded-xl px-3.5 py-2.5 text-sm text-text-primary placeholder:text-muted/50 focus:outline-none focus:border-accent/60 transition-colors" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted">Font style</label>
              <div className="flex items-center gap-1.5">
                {(['sans', 'serif', 'script'] as Watermark['font'][]).map(f => (
                  <button key={f} onClick={() => set('font', f)}
                    className={`flex-1 py-2 rounded-xl text-xs capitalize border transition-colors ${FONT_CLASS[f]} ${
                      wm.font === f ? 'bg-accent/10 border-accent/50 text-accent' : 'border-border text-muted hover:text-text-primary'
                    }`}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted">Colour</label>
              <div className="flex items-center gap-2">
                <input type="color" value={wm.color} onChange={e => set('color', e.target.value)}
                  className="w-10 h-9 rounded-lg border border-border cursor-pointer bg-bg" />
                <span className="text-xs text-muted font-mono">{wm.color}</span>
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted">Logo image</label>
            {wm.logoR2Key && (
              <div className="flex items-center gap-2 bg-bg border border-border rounded-xl px-3 py-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoUrl(wm.logoR2Key)} alt="" className="w-8 h-8 object-contain rounded bg-white/50" />
                <span className="text-xs text-muted flex-1 truncate">Logo uploaded</span>
              </div>
            )}
            <label className="flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-border rounded-xl py-6 cursor-pointer hover:border-accent/50 transition-colors">
              <svg className="w-6 h-6 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <span className="text-xs text-muted">{uploading ? 'Uploading…' : wm.logoR2Key ? 'Click to replace (PNG, transparent background works best)' : 'Click to upload PNG (transparent background works best)'}</span>
              <input type="file" accept="image/*" className="hidden" disabled={uploading}
                onChange={e => handleLogoFile(e.target.files?.[0])} />
            </label>
            {uploadError && <p className="text-[10px] text-danger font-medium">{uploadError}</p>}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted flex items-center justify-between">Size <span className="text-accent">{wm.size}px</span></label>
            <input type="range" min={10} max={80} value={wm.size} onChange={e => set('size', Number(e.target.value))}
              className="w-full h-1.5 rounded-full accent-accent cursor-pointer" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted flex items-center justify-between">Opacity <span className="text-accent">{wm.opacity}%</span></label>
            <input type="range" min={5} max={100} value={wm.opacity} onChange={e => set('opacity', Number(e.target.value))}
              className="w-full h-1.5 rounded-full accent-accent cursor-pointer" />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="flex items-center justify-between text-xs font-semibold text-muted">
            Repeat diagonally across photo
            <button type="button" onClick={() => set('tiled', !wm.tiled)}
              className={`relative w-9 h-5 rounded-full transition-colors ${wm.tiled ? 'bg-accent' : 'bg-border'}`}>
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${wm.tiled ? 'translate-x-4' : ''}`} />
            </button>
          </label>
          {!wm.tiled && (
            <>
              <label className="text-xs font-semibold text-muted">Position</label>
              <div className="grid grid-cols-3 gap-1.5 w-40">
                {POSITIONS.map(p => (
                  <button key={p} onClick={() => set('position', p)}
                    className={`aspect-square rounded-lg border flex items-center justify-center transition-colors ${
                      wm.position === p ? 'bg-accent border-accent' : 'border-border hover:border-accent/40'
                    }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${wm.position === p ? 'bg-white' : 'bg-muted'}`} />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          <button onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted hover:text-text-primary hover:bg-border/40 transition-colors">
            Cancel
          </button>
          <button onClick={() => onSave(wm)} disabled={uploading || (wm.type === 'logo' && !wm.logoR2Key)}
            title={wm.type === 'logo' && !wm.logoR2Key ? 'Upload a logo image first' : undefined}
            className="flex-1 py-2.5 rounded-xl bg-accent text-bg text-sm font-bold hover:bg-accent/90 disabled:opacity-60 transition-colors">
            Save watermark
          </button>
        </div>
      </div>

      {/* Live preview */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-muted uppercase tracking-wider">Live preview</label>
        <WatermarkPreview wm={wm} className="aspect-[4/3] w-full" />
        <p className="text-[11px] text-muted text-center">Sample photo — approximates the real Lambda-rendered result, not pixel-exact.</p>
      </div>
    </div>
  )
}

function blankWatermark(): Watermark {
  return {
    id: crypto.randomUUID(), name: 'New Watermark', type: 'text', text: '© Your Studio',
    font: 'sans', color: '#ffffff', size: 24, opacity: 70, position: 'bottom-right', tiled: false, isDefault: false,
  }
}

export default function WatermarkTab() {
  const [watermarks, setWatermarks] = useState<Watermark[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Watermark | null>(null)

  useEffect(() => {
    fetch('/studio/api/admin/settings/watermark-presets')
      .then(r => r.json())
      .then(res => { if (res.success) setWatermarks(res.data) })
      .finally(() => setLoading(false))
  }, [])

  // Single funnel for every mutation (toggle default, add, edit, delete) —
  // optimistic local update + persist, mirroring the try/catch/finally +
  // error-surfacing pattern in WebsiteManager.tsx's save() this session, so
  // a failed save is visible instead of silently not sticking (which is
  // exactly the bug this whole feature used to have, back when it was a
  // UI-only mockup with no persistence at all).
  const persist = async (next: Watermark[]) => {
    setWatermarks(next)
    setSaving(true); setSaveError(null)
    try {
      const res = await fetch('/studio/api/admin/settings/watermark-presets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watermarkPresets: next }),
      }).then(r => r.json())
      if (!res.success) { setSaveError(res.error ?? 'Could not save — please try again'); return }
      setWatermarks(res.data)
    } catch {
      setSaveError('Could not save — check your connection and try again')
    } finally {
      setSaving(false)
    }
  }

  // Only one watermark can be the default at a time — setting one clears
  // the others; clicking the current default again clears it to none.
  const toggleDefault = (id: string) => {
    persist(watermarks.map(w => ({ ...w, isDefault: w.id === id ? !w.isDefault : false })))
  }

  if (editing) {
    return (
      <WatermarkEditor
        initial={editing}
        onCancel={() => setEditing(null)}
        onSave={(wm) => {
          persist(watermarks.some(w => w.id === wm.id) ? watermarks.map(w => w.id === wm.id ? wm : w) : [...watermarks, wm])
          setEditing(null)
        }}
      />
    )
  }

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted max-w-lg">
          Create text or logo watermarks and preview exactly how they'll look before applying them to a gallery. Mark one as default to have it pre-selected whenever you apply a watermark.
        </p>
        {saving && <span className="text-[10px] text-muted flex-shrink-0">Saving…</span>}
      </div>
      {saveError && <p className="text-xs text-danger">{saveError}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {watermarks.map(wm => (
          <WatermarkCard key={wm.id} wm={wm}
            onEdit={() => setEditing(wm)}
            onDelete={() => persist(watermarks.filter(w => w.id !== wm.id))}
            onToggleDefault={() => toggleDefault(wm.id)}
          />
        ))}
        <button onClick={() => setEditing(blankWatermark())}
          className="aspect-[4/3] rounded-2xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 text-muted hover:text-accent hover:border-accent/50 transition-colors">
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          <span className="text-xs font-bold">New Watermark</span>
        </button>
      </div>
    </div>
  )
}
