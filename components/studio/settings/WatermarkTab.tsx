'use client'

import { useState } from 'react'

type WatermarkType = 'text' | 'logo'
type Position = 'top-left' | 'top-center' | 'top-right' | 'center-left' | 'center' | 'center-right' | 'bottom-left' | 'bottom-center' | 'bottom-right'

interface Watermark {
  id: string
  name: string
  type: WatermarkType
  text: string
  font: 'sans' | 'serif' | 'script'
  color: string
  size: number       // px, roughly
  opacity: number     // 0-100
  position: Position
  tiled: boolean
  // The one watermark auto-applied to new projects unless overridden.
  isDefault: boolean
}

const SAMPLE_WATERMARKS: Watermark[] = [
  { id: 'w1', name: 'Studio Signature', type: 'text', text: 'Rk Studio', font: 'script', color: '#ffffff', size: 28, opacity: 70, position: 'bottom-right', tiled: false, isDefault: true },
  { id: 'w2', name: 'Copyright Tile',   type: 'text', text: '© RK STUDIO', font: 'sans',   color: '#ffffff', size: 16, opacity: 25, position: 'center',       tiled: true,  isDefault: false },
  { id: 'w3', name: 'Logo Corner',      type: 'logo', text: 'LOGO',       font: 'sans',   color: '#ffffff', size: 48, opacity: 85, position: 'bottom-left',  tiled: false, isDefault: false },
]

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

// Renders the mock "sample photo" with a watermark overlaid exactly the way
// the real Lambda-based watermarking pipeline would (see project memory on
// watermark_lambda) — pure CSS here since this pass is UI-only, no image
// processing.
function WatermarkPreview({ wm, className = '' }: { wm: Watermark; className?: string }) {
  const label = wm.type === 'logo' ? wm.text || 'LOGO' : wm.text || 'Watermark'
  return (
    <div className={`relative overflow-hidden rounded-xl bg-gradient-to-br from-accent/30 via-border to-accent/10 ${className}`}>
      {wm.tiled ? (
        <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
          <div className="grid grid-cols-3 gap-8 rotate-[-28deg] scale-150">
            {Array.from({ length: 9 }).map((_, i) => (
              <span key={i} className={`whitespace-nowrap ${FONT_CLASS[wm.font]}`}
                style={{ color: wm.color, opacity: wm.opacity / 100, fontSize: Math.max(10, wm.size * 0.5) }}>
                {label}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className={`absolute inset-0 flex p-3 ${POSITION_CLASS[wm.position]}`}>
          {wm.type === 'logo' ? (
            <div className="rounded-lg bg-white/90 flex items-center justify-center font-black text-accent"
              style={{ width: wm.size, height: wm.size * 0.6, opacity: wm.opacity / 100, fontSize: wm.size * 0.28 }}>
              {label}
            </div>
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
  const set = <K extends keyof Watermark>(key: K, value: Watermark[K]) => setWm(prev => ({ ...prev, [key]: value }))

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
            <label className="flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-border rounded-xl py-6 cursor-pointer hover:border-accent/50 transition-colors">
              <svg className="w-6 h-6 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <span className="text-xs text-muted">Click to upload PNG (transparent background works best)</span>
              <input type="file" accept="image/png" className="hidden" onChange={e => set('text', e.target.files?.[0]?.name.slice(0, 12).toUpperCase() ?? 'LOGO')} />
            </label>
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
          <button onClick={() => onSave(wm)}
            className="flex-1 py-2.5 rounded-xl bg-accent text-bg text-sm font-bold hover:bg-accent/90 transition-colors">
            Save watermark
          </button>
        </div>
      </div>

      {/* Live preview */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-muted uppercase tracking-wider">Live preview</label>
        <WatermarkPreview wm={wm} className="aspect-[4/3] w-full" />
        <p className="text-[11px] text-muted text-center">Sample photo — real preview uses your own uploaded photos once wired up</p>
      </div>
    </div>
  )
}

function blankWatermark(): Watermark {
  return { id: `w${Date.now()}`, name: 'New Watermark', type: 'text', text: '© Your Studio', font: 'sans', color: '#ffffff', size: 24, opacity: 70, position: 'bottom-right', tiled: false, isDefault: false }
}

// UI-only mockup — sample watermarks + editor, no persistence/upload yet.
export default function WatermarkTab() {
  const [watermarks, setWatermarks] = useState<Watermark[]>(SAMPLE_WATERMARKS)
  const [editing, setEditing] = useState<Watermark | null>(null)

  // Only one watermark can be the default at a time — setting one clears
  // the others; clicking the current default again clears it to none.
  const toggleDefault = (id: string) => {
    setWatermarks(prev => prev.map(w => ({ ...w, isDefault: w.id === id ? !w.isDefault : false })))
  }

  if (editing) {
    return (
      <WatermarkEditor
        initial={editing}
        onCancel={() => setEditing(null)}
        onSave={(wm) => {
          setWatermarks(prev => prev.some(w => w.id === wm.id) ? prev.map(w => w.id === wm.id ? wm : w) : [...prev, wm])
          setEditing(null)
        }}
      />
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted max-w-lg">
        Create text or logo watermarks and preview exactly how they'll look before applying them to a gallery. You can build as many as you like and pick one per project later.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {watermarks.map(wm => (
          <WatermarkCard key={wm.id} wm={wm}
            onEdit={() => setEditing(wm)}
            onDelete={() => setWatermarks(prev => prev.filter(w => w.id !== wm.id))}
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
