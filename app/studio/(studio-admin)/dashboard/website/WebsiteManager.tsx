'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import type { StudioWebsite, WebsiteTemplateId, WebsiteService, WebsiteGalleryPhoto } from '@/types/studio'
import { randomUUID } from 'crypto'

const TEMPLATES: { id: WebsiteTemplateId; name: string; desc: string; preview: string }[] = [
  { id: 'lumina',  name: 'Lumina',  desc: 'Dark & elegant, full-bleed',     preview: 'bg-gradient-to-br from-zinc-900 to-amber-950' },
  { id: 'clarity', name: 'Clarity', desc: 'Minimal white, editorial',         preview: 'bg-gradient-to-br from-white to-gray-100' },
  { id: 'ember',   name: 'Ember',   desc: 'Warm earth tones, soft',           preview: 'bg-gradient-to-br from-orange-50 to-amber-100' },
  { id: 'bold',    name: 'Bold',    desc: 'High contrast, large typography',  preview: 'bg-gradient-to-br from-zinc-950 to-red-950' },
  { id: 'bloom',   name: 'Bloom',   desc: 'Pastel, feminine, romantic',       preview: 'bg-gradient-to-br from-pink-50 to-rose-100' },
]

const ACCENT_PRESETS: { label: string; color: string }[] = [
  { label: 'Gold',      color: '#C9A84C' },
  { label: 'Rose',      color: '#D4849A' },
  { label: 'Coral',     color: '#C4622D' },
  { label: 'Crimson',   color: '#FF3B30' },
  { label: 'Indigo',    color: '#6366F1' },
  { label: 'Teal',      color: '#14B8A6' },
  { label: 'Slate',     color: '#475569' },
  { label: 'Custom',    color: '' },
]

type Tab = 'template' | 'content' | 'gallery' | 'services' | 'contact' | 'booking' | 'domain'

interface Props {
  studioId: string
  studioName: string
}

export default function WebsiteManager({ studioId, studioName }: Props) {
  const [site, setSite] = useState<StudioWebsite | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [tab, setTab] = useState<Tab>('template')
  const [subdomainInput, setSubdomainInput] = useState('')
  const [subdomainCheck, setSubdomainCheck] = useState<{ available: boolean; message: string } | null>(null)
  const [checkingSlug, setCheckingSlug] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  // Load existing config
  useEffect(() => {
    fetch('/studio/api/admin/website')
      .then(r => r.json())
      .then(res => {
        if (res.data) {
          setSite(res.data)
          setSubdomainInput(res.data.subdomain ?? '')
        } else {
          // No website yet — show defaults
          setSite({
            studioId,
            subdomain: '',
            templateId: 'lumina',
            status: 'DRAFT',
            heroTitle: studioName,
            heroSubtitle: 'Capturing your most precious moments',
            about: `Welcome to ${studioName}. We are passionate photographers dedicated to capturing the beauty and emotion of your special moments.`,
            services: [],
            galleryPhotos: [],
            bookingEnabled: true,
            createdAt: '',
            updatedAt: '',
          })
        }
      })
      .finally(() => setLoading(false))
  }, [studioId, studioName])

  const update = (patch: Partial<StudioWebsite>) => setSite(s => s ? { ...s, ...patch } : s)

  const save = async (patch?: Partial<StudioWebsite>) => {
    if (!site) return
    setSaving(true); setSaved(false)
    const body = patch ? { ...site, ...patch } : site
    const res = await fetch('/studio/api/admin/website', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(r => r.json())
    setSaving(false)
    if (res.success) { setSite(res.data); setSaved(true); setTimeout(() => setSaved(false), 2500) }
  }

  const checkSubdomain = useCallback(async (slug: string) => {
    if (slug.length < 3) { setSubdomainCheck(null); return }
    setCheckingSlug(true)
    const res = await fetch(`/studio/api/admin/website/check-subdomain?slug=${encodeURIComponent(slug)}`).then(r => r.json())
    setSubdomainCheck({ available: res.available, message: res.message })
    setCheckingSlug(false)
  }, [])

  const onSubdomainChange = (val: string) => {
    const slug = val.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32)
    setSubdomainInput(slug)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => checkSubdomain(slug), 500)
  }

  const addService = () => {
    if (!site) return
    update({ services: [...site.services, { id: randomUUID(), name: '', description: '', price: '' }] })
  }

  const removeService = (id: string) => {
    if (!site) return
    update({ services: site.services.filter(s => s.id !== id) })
  }

  const patchService = (id: string, patch: Partial<WebsiteService>) => {
    if (!site) return
    update({ services: site.services.map(s => s.id === id ? { ...s, ...patch } : s) })
  }

  const [uploading, setUploading] = useState(false)
  const [uploadCategory, setUploadCategory] = useState('General')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const CATEGORIES = ['Wedding', 'Pre-Wedding', 'Portrait', 'Corporate', 'Fashion', 'School', 'General']

  const handlePhotoUpload = async (files: FileList | null) => {
    if (!files || !site) return
    setUploading(true)
    for (const file of Array.from(files)) {
      const form = new FormData()
      form.append('file', file)
      form.append('category', uploadCategory)
      const res = await fetch('/studio/api/admin/website/portfolio-upload', { method: 'POST', body: form })
      const data = await res.json()
      if (data.success) {
        setSite(prev => prev ? {
          ...prev,
          galleryPhotos: [...prev.galleryPhotos, { id: data.id, url: data.url, caption: '', category: data.category }]
        } : prev)
      }
    }
    setUploading(false)
  }

  const removeGalleryPhoto = async (id: string) => {
    if (!site) return
    const photo = site.galleryPhotos.find(p => p.id === id)
    if (photo) {
      fetch('/studio/api/admin/website/portfolio-upload', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: photo.url }),
      }).catch(() => {})
    }
    update({ galleryPhotos: site.galleryPhotos.filter(p => p.id !== id) })
  }

  const movePhoto = (id: string, dir: -1 | 1) => {
    if (!site) return
    const arr = [...site.galleryPhotos]
    const idx = arr.findIndex(p => p.id === id)
    if (idx < 0) return
    const to = idx + dir
    if (to < 0 || to >= arr.length) return
    ;[arr[idx], arr[to]] = [arr[to], arr[idx]]
    update({ galleryPhotos: arr })
  }

  const studioUrl  = process.env.NEXT_PUBLIC_STUDIO_URL ?? 'https://vayustudios.com'
  const studioBase = studioUrl.replace(/^https?:\/\//, '')
  const isTest     = studioBase.startsWith('test.')
  // In test env, use a direct path URL (*.test.vayustudios.com needs paid SSL).
  // In production, use the real subdomain URL.
  const publishUrl = site?.subdomain
    ? isTest
      ? `${studioUrl}/studio/site/${site.subdomain}`
      : `https://${site.subdomain}.${studioBase}`
    : null

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full" /></div>
  if (!site) return null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-text-primary">My Website</h2>
          {publishUrl && (
            <a href={publishUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline mt-0.5 block">{publishUrl}</a>
          )}
        </div>
        <div className="flex items-center gap-3">
          {site.status === 'LIVE' ? (
            <button
              onClick={() => save({ status: 'DRAFT' })}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 transition-colors">
              ● Live — click to unpublish
            </button>
          ) : (
            <button
              onClick={() => save({ status: 'LIVE' })}
              disabled={!site.subdomain}
              title={!site.subdomain ? 'Set a subdomain first in the Domain tab' : ''}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-accent text-bg hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed">
              ↑ Publish Website
            </button>
          )}
          <button onClick={() => save()} disabled={saving}
            className="px-5 py-2 bg-accent text-bg text-xs font-bold rounded-xl disabled:opacity-60 transition-opacity">
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-card border border-border rounded-2xl p-1 overflow-x-auto">
        {([
          ['template', 'Template'],
          ['content',  'Content'],
          ['gallery',  'Gallery'],
          ['services', 'Services'],
          ['contact',  'Contact'],
          ['booking',  'Booking'],
          ['domain',   'Domain'],
        ] as [Tab, string][]).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${tab === id ? 'bg-accent text-bg' : 'text-muted hover:text-text-primary'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Template ── */}
      {tab === 'template' && (
        <div className="space-y-4">
          <p className="text-xs text-muted">Choose a design. You can switch anytime — your content stays.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {TEMPLATES.map(t => (
              <button key={t.id} onClick={() => update({ templateId: t.id })}
                className={`rounded-2xl overflow-hidden border-2 transition-all text-left ${site.templateId === t.id ? 'border-accent scale-[1.02]' : 'border-border hover:border-accent/50'}`}>
                <div className={`h-24 ${t.preview} flex items-center justify-center`}>
                  <span className="text-xs font-bold text-white drop-shadow">{t.name}</span>
                </div>
                <div className="p-2 bg-card">
                  <p className="text-xs font-semibold text-text-primary">{t.name}</p>
                  <p className="text-[10px] text-muted leading-tight">{t.desc}</p>
                </div>
              </button>
            ))}
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-3">Accent colour</label>
            <div className="flex items-center gap-2 flex-wrap">
              {ACCENT_PRESETS.map(p => (
                <button key={p.label} onClick={() => p.color ? update({ themeAccent: p.color }) : undefined}
                  title={p.label}
                  className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${site.themeAccent === p.color ? 'border-white scale-110' : 'border-transparent'}`}
                  style={{ background: p.color || 'conic-gradient(red,orange,yellow,green,blue,indigo,violet,red)' }}
                />
              ))}
              <input type="color" value={site.themeAccent ?? '#6366f1'} onChange={e => update({ themeAccent: e.target.value })}
                className="w-8 h-8 rounded-full cursor-pointer border-0 bg-transparent" title="Custom colour" />
            </div>
          </div>
          {publishUrl && (
            <a href={`${publishUrl}?preview=1`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-xs text-accent border border-accent/30 px-4 py-2 rounded-xl hover:bg-accent/10 transition-colors">
              ↗ Preview your site
            </a>
          )}
        </div>
      )}

      {/* ── Content ── */}
      {tab === 'content' && (
        <div className="space-y-4 max-w-2xl">
          <Field label="Studio / Hero title" value={site.heroTitle} onChange={v => update({ heroTitle: v })} placeholder="Ram Photography" />
          <Field label="Hero subtitle" value={site.heroSubtitle} onChange={v => update({ heroSubtitle: v })} placeholder="Capturing your most precious moments" />
          <Field label="Tagline (short)" value={site.tagline ?? ''} onChange={v => update({ tagline: v })} placeholder="Professional photography for every occasion" />
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">About your studio</label>
            <textarea value={site.about} onChange={e => update({ about: e.target.value })} rows={5}
              className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm text-text-primary outline-none focus:border-accent resize-none"
              placeholder="Tell your story…" />
          </div>
          <Field label="City / Location" value={site.city ?? ''} onChange={v => update({ city: v })} placeholder="Bhubaneswar, Odisha" />
        </div>
      )}

      {/* ── Gallery ── */}
      {tab === 'gallery' && (
        <div className="space-y-5">
          <p className="text-xs text-muted">Upload your best portfolio photos. Visitors see a clean gallery with a 3D album viewer — no watermarks.</p>

          {/* Upload area */}
          <div className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <select value={uploadCategory} onChange={e => setUploadCategory(e.target.value)}
                className="bg-card border border-border rounded-xl px-3 py-2 text-sm text-text-primary outline-none focus:border-accent">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                className="px-5 py-2 bg-accent text-bg text-xs font-bold rounded-xl disabled:opacity-50 hover:opacity-90 transition-opacity">
                {uploading ? 'Uploading…' : '+ Upload Photos'}
              </button>
              <span className="text-xs text-muted">Select category first, then upload</span>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
              onChange={e => handlePhotoUpload(e.target.files)} />

            {/* Drop zone */}
            <div
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); handlePhotoUpload(e.dataTransfer.files) }}
              className="border-2 border-dashed border-border rounded-2xl p-8 text-center text-muted text-sm hover:border-accent/50 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}>
              Drag & drop photos here or click to select
            </div>
          </div>

          {/* Existing gallery grid */}
          {site.galleryPhotos.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
                Portfolio photos ({site.galleryPhotos.length})
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                {site.galleryPhotos.map((photo, idx) => (
                  <div key={photo.id} className="relative group rounded-xl overflow-hidden" style={{ aspectRatio: '1' }}>
                    <img src={photo.url} alt="" className="w-full h-full object-cover" />
                    {photo.category && (
                      <span className="absolute top-1 left-1 bg-black/70 text-white text-[8px] font-bold px-1 py-0.5 rounded truncate max-w-[70%]">
                        {photo.category}
                      </span>
                    )}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                      <button onClick={() => movePhoto(photo.id, -1)} className="bg-white/20 text-white text-xs px-1.5 py-0.5 rounded" disabled={idx === 0}>←</button>
                      <button onClick={() => movePhoto(photo.id, 1)} className="bg-white/20 text-white text-xs px-1.5 py-0.5 rounded" disabled={idx === site.galleryPhotos.length - 1}>→</button>
                      <button onClick={() => removeGalleryPhoto(photo.id)} className="bg-red-500/80 text-white text-xs px-1.5 py-0.5 rounded">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Services ── */}
      {tab === 'services' && (
        <div className="space-y-4 max-w-2xl">
          {site.services.map(s => (
            <div key={s.id} className="bg-card border border-border rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted uppercase tracking-wider">Service</span>
                <button onClick={() => removeService(s.id)} className="text-xs text-red-400 hover:text-red-300">Remove</button>
              </div>
              <Field label="Name" value={s.name} onChange={v => patchService(s.id, { name: v })} placeholder="Wedding Photography" />
              <Field label="Description" value={s.description} onChange={v => patchService(s.id, { description: v })} placeholder="Full-day coverage with edited gallery" />
              <Field label="Price (optional)" value={s.price ?? ''} onChange={v => patchService(s.id, { price: v })} placeholder="₹50,000 onwards" />
            </div>
          ))}
          <button onClick={addService} className="w-full border-2 border-dashed border-border rounded-2xl py-4 text-sm text-muted hover:border-accent hover:text-accent transition-colors">
            + Add Service
          </button>
        </div>
      )}

      {/* ── Contact ── */}
      {tab === 'contact' && (
        <div className="space-y-4 max-w-2xl">
          <Field label="Contact email" value={site.contactEmail ?? ''} onChange={v => update({ contactEmail: v })} placeholder="ram@ramstudio.com" type="email" />
          <Field label="Phone number" value={site.contactPhone ?? ''} onChange={v => update({ contactPhone: v })} placeholder="+91 98765 43210" />
          <Field label="WhatsApp number (with country code)" value={site.whatsapp ?? ''} onChange={v => update({ whatsapp: v })} placeholder="+919876543210" />
          <div className="pt-2">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Social links (full URL)</p>
            <div className="space-y-3">
              <Field label="Instagram" value={site.socialLinks?.instagram ?? ''} onChange={v => update({ socialLinks: { ...site.socialLinks, instagram: v } })} placeholder="https://instagram.com/ramstudio" />
              <Field label="Facebook" value={site.socialLinks?.facebook ?? ''} onChange={v => update({ socialLinks: { ...site.socialLinks, facebook: v } })} placeholder="https://facebook.com/ramstudio" />
              <Field label="YouTube" value={site.socialLinks?.youtube ?? ''} onChange={v => update({ socialLinks: { ...site.socialLinks, youtube: v } })} placeholder="https://youtube.com/@ramstudio" />
            </div>
          </div>
        </div>
      )}

      {/* ── Booking ── */}
      {tab === 'booking' && (
        <div className="space-y-4 max-w-2xl">
          <div className="flex items-center gap-3">
            <button onClick={() => update({ bookingEnabled: !site.bookingEnabled })}
              className={`relative w-12 h-6 rounded-full transition-colors ${site.bookingEnabled ? 'bg-accent' : 'bg-border'}`}>
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${site.bookingEnabled ? 'translate-x-7' : 'translate-x-1'}`} />
            </button>
            <span className="text-sm font-medium text-text-primary">Enable booking / enquiry form</span>
          </div>
          {site.bookingEnabled && (
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">Form intro message</label>
              <textarea value={site.bookingMessage ?? ''} onChange={e => update({ bookingMessage: e.target.value })} rows={3}
                className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm text-text-primary outline-none focus:border-accent resize-none"
                placeholder="Fill in your details and we'll get back to you within 24 hours." />
            </div>
          )}
          <div className="bg-card border border-border rounded-2xl p-4">
            <p className="text-xs font-semibold text-text-primary mb-1">Booking notifications</p>
            <p className="text-xs text-muted">When a client submits the form, you&apos;ll get an email at your contact email. View all enquiries in the <strong>Bookings</strong> tab in your dashboard.</p>
          </div>
        </div>
      )}

      {/* ── Domain ── */}
      {tab === 'domain' && (
        <div className="space-y-6 max-w-md">
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">Your subdomain</label>
            <div className="flex items-center gap-0 rounded-xl overflow-hidden border border-border focus-within:border-accent">
              <input value={subdomainInput} onChange={e => onSubdomainChange(e.target.value)}
                className="flex-1 bg-card px-4 py-3 text-sm text-text-primary outline-none"
                placeholder="ramstudio" />
              <span className="bg-card/50 px-3 py-3 text-xs text-muted border-l border-border whitespace-nowrap">
                {isTest ? ` → ${studioBase}/studio/site/` : `.${studioBase}`}
              </span>
            </div>
            {checkingSlug && <p className="text-xs text-muted mt-1.5">Checking…</p>}
            {subdomainCheck && !checkingSlug && (
              <p className={`text-xs mt-1.5 font-medium ${subdomainCheck.available ? 'text-green-400' : 'text-red-400'}`}>
                {subdomainCheck.available ? '✓' : '✗'} {subdomainCheck.message}
              </p>
            )}
          </div>
          <button
            onClick={() => save({ subdomain: subdomainInput })}
            disabled={saving || !subdomainCheck?.available}
            className="px-6 py-2.5 bg-accent text-bg text-xs font-bold rounded-xl disabled:opacity-50">
            {saving ? 'Saving…' : 'Apply Subdomain'}
          </button>
          {site.subdomain && (
            <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
              <p className="text-xs font-semibold text-text-primary">Your website is at:</p>
              <a href={publishUrl!} target="_blank" rel="noopener noreferrer"
                className="text-sm text-accent hover:underline break-all">
                {publishUrl}
              </a>
              <p className="text-xs text-muted mt-2">Make sure your site is set to <strong>Live</strong> for it to be publicly visible.</p>
            </div>
          )}
          <div className="bg-card border border-border rounded-2xl p-4 space-y-1">
            <p className="text-xs font-semibold text-text-primary">Custom domain coming soon</p>
            <p className="text-xs text-muted">You&apos;ll soon be able to connect your own domain (e.g. www.ramstudio.in) to your VayuStudios website.</p>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({
  label, value, onChange, placeholder, type = 'text',
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm text-text-primary outline-none focus:border-accent placeholder-muted/50" />
    </div>
  )
}
