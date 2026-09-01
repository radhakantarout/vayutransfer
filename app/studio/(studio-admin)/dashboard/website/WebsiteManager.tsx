'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import type { StudioWebsite, WebsiteService, WebsiteGalleryPhoto, WebsiteTestimonial, WebsiteGalleryStyle, WebsiteSectionStyle, WebsiteSectionKey } from '@/types/studio'
import { WEBSITE_TEMPLATES as TEMPLATES } from '@/lib/studio/websiteTemplates'
import { BACKGROUND_PRESET_OPTIONS } from '@/lib/studio/backgroundPresets'
import { LANGUAGE_OPTIONS } from '@/lib/studio/i18n'
import { EMPHASIS_OPTIONS, SECTION_BG_SWATCHES } from '@/lib/studio/sectionStyle'
import LivePreviewPanel from './LivePreviewPanel'

// Which templates read as dark-background — used to pick a phone-bezel color
// that contrasts with whatever the preview is actually showing (see
// LivePreviewPanel's isDarkTemplate prop).
const DARK_TEMPLATE_IDS = new Set(['lumina', 'bold'])

// Only these 3 templates darken their cover with a built-in overlay whose
// opacity heroBrightness controls directly (see each template's hero
// section) — matches their own hardcoded default exactly so the slider
// starts wherever the template already sits before it's ever touched.
// Every other template shows its cover as-is always, unaffected by this field.
const HERO_VISIBILITY_DEFAULTS: Record<string, number> = { lumina: 0.2, ember: 0.85, bold: 0.4 }

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

const FONT_COLOR_PRESETS: { label: string; color: string }[] = [
  { label: 'Cream',    color: '#F5F0E8' },
  { label: 'White',    color: '#FFFFFF' },
  { label: 'Dark',     color: '#1A1A1A' },
  { label: 'Charcoal', color: '#374151' },
  { label: 'Warm',     color: '#4A3728' },
  { label: 'Navy',     color: '#1E3A5F' },
  { label: 'Custom',   color: '' },
]

// Presentation style is independent of templateId — pick any style with any
// template. 'classic' (undefined too) is today's grid + 3D flip-book,
// unchanged; see app/(studio-site)/.../templates/Gallery.tsx for the dispatch.
const GALLERY_STYLES: { id: WebsiteGalleryStyle; name: string; desc: string }[] = [
  { id: 'classic',         name: 'Classic Album',    desc: '3D page-flip book' },
  { id: 'rotateScroll',    name: 'Rotate Scroll',     desc: 'Tilts as you scroll' },
  { id: 'stack',           name: 'Card Stack',        desc: 'Tap-through deck' },
  { id: 'coverflow',       name: 'Coverflow',         desc: '3D carousel' },
  { id: 'parallaxMasonry', name: 'Parallax Masonry',  desc: 'Depth-scrolling grid' },
  { id: 'cube',            name: '3D Cube',           desc: 'Hexagonal 3D rotating carousel' },
  { id: 'orbit',           name: '3D Orbit',          desc: 'Photos circle around you' },
  { id: 'spiral',          name: '3D Spiral',         desc: 'Spiral through moments' },
  { id: 'horizontalParallax', name: 'Horizontal Parallax', desc: 'Drag-follow depth carousel' },
  { id: 'filmReel',        name: 'Film Reel',          desc: 'Curved 35mm filmstrip' },
  { id: 'cinemaScreen',    name: 'Cinema Screen',      desc: 'Widescreen with Ken Burns zoom' },
  { id: 'rackFocus',       name: 'Rack Focus',         desc: 'Cinematic blur focus pull' },
  { id: 'spotlightStage',  name: 'Spotlight Stage',    desc: 'Dark stage with a spotlight' },
  { id: 'projectorSlide',  name: 'Projector Slide',    desc: 'Classic slide-mount carousel' },
]

type Tab = 'template' | 'content' | 'gallery' | 'services' | 'testimonials' | 'contact' | 'booking' | 'domain'
const VALID_TABS: Tab[] = ['template', 'content', 'gallery', 'services', 'testimonials', 'contact', 'booking', 'domain']

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
  const debounceRef    = useRef<ReturnType<typeof setTimeout>>()
  const accentColorRef = useRef<HTMLInputElement>(null)
  const fontColorRef   = useRef<HTMLInputElement>(null)

  // Tracks the content of the last known-saved state (server-managed fields
  // like updatedAt stripped out) so the auto-save effect below can tell "the
  // user changed something" apart from "site was just re-set by a save's own
  // response" — without this, saving would re-trigger the effect, which would
  // schedule another save, forever.
  const lastAutoSavedSnapshot = useRef<string>('')
  const snapshotForCompare = (s: StudioWebsite) => JSON.stringify({ ...s, updatedAt: undefined })

  // Load existing config
  useEffect(() => {
    fetch('/studio/api/admin/website')
      .then(r => r.json())
      .then(res => {
        if (res.data) {
          setSite(res.data)
          setSubdomainInput(res.data.subdomain ?? '')
          lastAutoSavedSnapshot.current = snapshotForCompare(res.data)
        } else {
          // No website yet — show defaults
          const defaults: StudioWebsite = {
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
          }
          setSite(defaults)
          lastAutoSavedSnapshot.current = snapshotForCompare(defaults)
        }
      })
      .finally(() => setLoading(false))
  }, [studioId, studioName])

  const update = (patch: Partial<StudioWebsite>) => setSite(s => s ? { ...s, ...patch } : s)

  const updateSectionStyle = (key: WebsiteSectionKey, patch: Partial<WebsiteSectionStyle>) =>
    setSite(s => s ? { ...s, sectionStyles: { ...s.sectionStyles, [key]: { ...s.sectionStyles?.[key], ...patch } } } : s)

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
    if (res.success) {
      setSite(res.data)
      lastAutoSavedSnapshot.current = snapshotForCompare(res.data)
      setSaved(true); setTimeout(() => setSaved(false), 2500)
    }
  }

  // Debounced auto-save for the live preview panel — deliberately DRAFT-only.
  // This data model has no draft/published content fork (status only gates
  // whether the public page 404s; the content shown once LIVE is whatever's
  // currently saved), so auto-saving every keystroke on an already-public site
  // could flash half-typed edits to real visitors. Once LIVE, the preview only
  // refreshes on an explicit "Save Changes"/publish click, same as today.
  const previewSaveDebounceRef = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => {
    if (!site || site.status !== 'DRAFT') return
    if (snapshotForCompare(site) === lastAutoSavedSnapshot.current) return
    clearTimeout(previewSaveDebounceRef.current)
    previewSaveDebounceRef.current = setTimeout(() => { save() }, 800)
    return () => clearTimeout(previewSaveDebounceRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site])

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
    update({ services: [...site.services, { id: crypto.randomUUID(), name: '', description: '', price: '' }] })
  }

  const removeService = (id: string) => {
    if (!site) return
    update({ services: site.services.filter(s => s.id !== id) })
  }

  const patchService = (id: string, patch: Partial<WebsiteService>) => {
    if (!site) return
    update({ services: site.services.map(s => s.id === id ? { ...s, ...patch } : s) })
  }

  const addTestimonial = () => {
    if (!site) return
    update({ testimonials: [...(site.testimonials ?? []), { id: crypto.randomUUID(), name: '', quote: '', eventType: '', rating: 5 }] })
  }

  const removeTestimonial = (id: string) => {
    if (!site) return
    update({ testimonials: (site.testimonials ?? []).filter(t => t.id !== id) })
  }

  const patchTestimonial = (id: string, patch: Partial<WebsiteTestimonial>) => {
    if (!site) return
    update({ testimonials: (site.testimonials ?? []).map(t => t.id === id ? { ...t, ...patch } : t) })
  }

  const [uploading, setUploading] = useState(false)
  const [uploadingHero, setUploadingHero] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadCategory, setUploadCategory] = useState('General')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const heroFileInputRef = useRef<HTMLInputElement>(null)

  const CATEGORIES = ['Wedding', 'Pre-Wedding', 'Portrait', 'Corporate', 'Fashion', 'School', 'General']
  const MAX_IMAGE_BYTES         = 100 * 1024 * 1024 // 100 MB
  const MAX_GALLERY_VIDEO_BYTES = 150 * 1024 * 1024 // 150 MB
  const MAX_HERO_VIDEO_BYTES    = 60  * 1024 * 1024 // 60 MB — must load fast, it autoplays immediately

  // Draws the frame at ~0.5s of a video file to a canvas and exports it as a
  // JPEG — used so the gallery grid and admin thumbnails don't have to decode
  // a video file just to show a preview. Best-effort: callers fall back to
  // rendering the video itself (preload="metadata") if this fails.
  const generateVideoPoster = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.muted = true
      video.playsInline = true
      const objectUrl = URL.createObjectURL(file)
      video.src = objectUrl
      const cleanup = () => URL.revokeObjectURL(objectUrl)
      video.onloadeddata = () => { video.currentTime = Math.min(0.5, (video.duration || 1) / 2) }
      video.onseeked = () => {
        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth || 640
        canvas.height = video.videoHeight || 360
        const ctx = canvas.getContext('2d')
        if (!ctx) { cleanup(); reject(new Error('Canvas unavailable')); return }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        canvas.toBlob(blob => {
          cleanup()
          if (blob) resolve(blob); else reject(new Error('Could not generate thumbnail'))
        }, 'image/jpeg', 0.82)
      }
      video.onerror = () => { cleanup(); reject(new Error('Could not read video file')) }
    })
  }

  // Gets a presigned R2 URL and PUTs the file directly to storage — the file bytes
  // never pass through our server, so it isn't limited by serverless body-size caps.
  const uploadFileToR2 = async (file: File, kind: 'portfolio' | 'hero', category?: string) => {
    const isVideo = file.type.startsWith('video/')
    const isImage = file.type.startsWith('image/')
    if (!isImage && !isVideo) throw new Error(`${file.name}: only image or video files are allowed`)
    if (isImage && file.size > MAX_IMAGE_BYTES) throw new Error(`${file.name}: max image size is 100 MB`)
    if (isVideo) {
      const cap = kind === 'hero' ? MAX_HERO_VIDEO_BYTES : MAX_GALLERY_VIDEO_BYTES
      if (file.size > cap) throw new Error(`${file.name}: max video size is ${Math.round(cap / (1024 * 1024))} MB`)
    }

    const initRes = await fetch('/studio/api/admin/website/portfolio-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: file.name, contentType: file.type, category, kind, sizeBytes: file.size }),
    }).then(r => r.json())
    if (!initRes.success) throw new Error(initRes.error ?? 'Failed to prepare upload')

    const putRes = await fetch(initRes.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    })
    if (!putRes.ok) throw new Error('Upload to storage failed — please try again')

    return { id: initRes.id as string, url: initRes.publicUrl as string, category: initRes.category as string, sizeBytes: file.size, isVideo }
  }

  const handlePhotoUpload = async (files: FileList | null) => {
    if (!files || !site) return
    setUploading(true)
    setUploadError(null)
    try {
      const newPhotos: WebsiteGalleryPhoto[] = []
      for (const file of Array.from(files)) {
        const { id, url, category, sizeBytes, isVideo } = await uploadFileToR2(file, 'portfolio', uploadCategory)
        if (!isVideo) {
          newPhotos.push({ id, url, type: 'photo', caption: '', category, sizeBytes })
          continue
        }
        // Video — also generate + upload a poster frame for the grid thumbnail.
        // Best-effort: a failure here still keeps the video itself, the gallery
        // just falls back to rendering the video file with preload="metadata".
        let thumbnailUrl: string | undefined
        let thumbnailSizeBytes: number | undefined
        try {
          const posterBlob = await generateVideoPoster(file)
          const posterFile = new File([posterBlob], `${id}-poster.jpg`, { type: 'image/jpeg' })
          const poster = await uploadFileToR2(posterFile, 'portfolio', category)
          thumbnailUrl = poster.url
          thumbnailSizeBytes = poster.sizeBytes
        } catch (posterErr) {
          console.error('Video poster generation failed', posterErr)
        }
        newPhotos.push({ id, url, type: 'video', thumbnailUrl, thumbnailSizeBytes, caption: '', category, sizeBytes })
      }
      if (newPhotos.length > 0) {
        const updatedPhotos = [...site.galleryPhotos, ...newPhotos]
        setSite(prev => prev ? { ...prev, galleryPhotos: updatedPhotos } : prev)
        const saveRes = await fetch('/studio/api/admin/website', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...site, galleryPhotos: updatedPhotos }),
        }).then(r => r.json())
        if (!saveRes.success) throw new Error('Upload succeeded but could not be saved — please try again')
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed — please try again')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
      setUploading(false)
    }
  }

  const handleHeroImageUpload = async (files: FileList | null) => {
    const file = files?.[0]
    if (!file || !site) return
    setUploadingHero(true)
    setUploadError(null)
    try {
      const { url, sizeBytes, isVideo } = await uploadFileToR2(file, 'hero')
      let heroPosterUrl = ''
      let heroPosterSizeBytes = 0
      if (isVideo) {
        try {
          const posterBlob = await generateVideoPoster(file)
          const posterFile = new File([posterBlob], `hero-poster-${Date.now()}.jpg`, { type: 'image/jpeg' })
          const poster = await uploadFileToR2(posterFile, 'hero')
          heroPosterUrl = poster.url
          heroPosterSizeBytes = poster.sizeBytes
        } catch (posterErr) {
          console.error('Hero video poster generation failed', posterErr)
        }
      }
      const patch = {
        heroImageUrl: url,
        heroImageSizeBytes: sizeBytes,
        heroMediaType: (isVideo ? 'video' : 'photo') as 'video' | 'photo',
        heroPosterUrl,
        heroPosterSizeBytes,
      }
      setSite(prev => prev ? { ...prev, ...patch } : prev)
      const saveRes = await fetch('/studio/api/admin/website', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...site, ...patch }),
      }).then(r => r.json())
      if (!saveRes.success) throw new Error('Cover uploaded but could not be saved — please try again')
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Cover upload failed — please try again')
    } finally {
      if (heroFileInputRef.current) heroFileInputRef.current.value = ''
      setUploadingHero(false)
    }
  }

  const removeHeroImage = () => {
    if (!site) return
    if (site.heroImageUrl) {
      fetch('/studio/api/admin/website/portfolio-upload', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: site.heroImageUrl, sizeBytes: site.heroImageSizeBytes }),
      }).catch(() => {})
    }
    if (site.heroPosterUrl) {
      fetch('/studio/api/admin/website/portfolio-upload', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: site.heroPosterUrl, sizeBytes: site.heroPosterSizeBytes }),
      }).catch(() => {})
    }
    // Empty string (not undefined) so it survives JSON — the API merges by spreading
    // the request body over the existing record, and `undefined` keys are dropped by
    // JSON.stringify before the request is even sent, so the old value would stick.
    const patch = { heroImageUrl: '', heroImageSizeBytes: 0, heroMediaType: 'photo' as const, heroPosterUrl: '', heroPosterSizeBytes: 0 }
    update(patch)
    fetch('/studio/api/admin/website', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...site, ...patch }),
    }).catch(() => {})
  }

  const removeGalleryPhoto = (id: string) => {
    if (!site) return
    const photo = site.galleryPhotos.find(p => p.id === id)
    if (photo) {
      fetch('/studio/api/admin/website/portfolio-upload', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: photo.url, sizeBytes: photo.sizeBytes }),
      }).catch(() => {})
      if (photo.thumbnailUrl) {
        fetch('/studio/api/admin/website/portfolio-upload', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: photo.thumbnailUrl, sizeBytes: photo.thumbnailSizeBytes }),
        }).catch(() => {})
      }
    }
    const updatedPhotos = site.galleryPhotos.filter(p => p.id !== id)
    update({ galleryPhotos: updatedPhotos })
    fetch('/studio/api/admin/website', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...site, galleryPhotos: updatedPhotos }),
    }).catch(() => {})
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
    fetch('/studio/api/admin/website', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...site, galleryPhotos: arr }),
    }).catch(() => {})
  }

  // ── AI content drafts (About / Tagline / Hero subtitle / Service description) ──
  // Never writes directly into a field — always shown in AiDraftBox for the
  // studio owner to accept, regenerate, or dismiss.
  const [aiDraft, setAiDraft]     = useState<{ key: string; text: string } | null>(null)
  const [aiLoading, setAiLoading] = useState<string | null>(null)
  const [aiError, setAiError]     = useState<{ key: string; message: string } | null>(null)

  // Both "Ask AI to write this" and "Regenerate" open this same prompt dialog
  // rather than generating immediately — lets the studio owner optionally
  // steer what the AI emphasizes, every time, not just on the first try.
  const [aiPromptModal, setAiPromptModal] = useState<{
    field: 'about' | 'tagline' | 'heroSubtitle' | 'serviceDescription'
    opts?: { serviceId?: string; serviceName?: string }
    value: string
  } | null>(null)

  const askAiForContent = async (
    field: 'about' | 'tagline' | 'heroSubtitle' | 'serviceDescription',
    opts?: { serviceId?: string; serviceName?: string },
    userPrompt?: string
  ) => {
    const key = opts?.serviceId ? `service:${opts.serviceId}` : field
    setAiLoading(key)
    setAiError(null)
    setAiDraft(null)
    try {
      const res = await fetch('/studio/api/ai/website-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field, studioName: site?.heroTitle, city: site?.city, serviceName: opts?.serviceName, userPrompt }),
      }).then(r => r.json())
      if (!res.success) throw new Error(res.error ?? 'Could not generate a draft')
      setAiDraft({ key, text: res.text })
    } catch (err) {
      setAiError({ key, message: err instanceof Error ? err.message : 'Could not generate a draft' })
    } finally {
      setAiLoading(null)
    }
  }

  // ── AI template recommendation (advisory only — never selects on its own) ──
  const [templateHint, setTemplateHint]           = useState('')
  const [templateSuggesting, setTemplateSuggesting] = useState(false)
  const [templateSuggestion, setTemplateSuggestion] = useState<{ templateId: string; reason: string } | null>(null)
  const [templateSuggestError, setTemplateSuggestError] = useState<string | null>(null)

  const askAiForTemplate = async () => {
    if (!templateHint.trim()) return
    setTemplateSuggesting(true)
    setTemplateSuggestError(null)
    try {
      const res = await fetch('/studio/api/ai/website-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: templateHint.trim() }),
      }).then(r => r.json())
      if (!res.success) throw new Error(res.error ?? 'Could not get a recommendation')
      setTemplateSuggestion({ templateId: res.templateId, reason: res.reason })
    } catch (err) {
      setTemplateSuggestError(err instanceof Error ? err.message : 'Could not get a recommendation')
    } finally {
      setTemplateSuggesting(false)
    }
  }

  const studioUrl  = process.env.NEXT_PUBLIC_STUDIO_URL ?? 'https://vayustudios.com'
  const studioBase = studioUrl.replace(/^https?:\/\//, '')
  // Real wildcard subdomains (<slug>.vayustudios.com) only resolve where DNS/SSL
  // is actually set up for them — test.vayustudios.com's own subdomains, and
  // localhost (no *.localhost wildcard exists at all). Everywhere else that
  // isn't production, fall back to the path-based route the app already serves
  // subdomains through directly.
  const isTest       = studioBase.startsWith('test.')
  const isLocalhost  = studioBase.startsWith('localhost')
  const isPathBased  = isTest || isLocalhost
  const publishUrl = site?.subdomain
    ? isPathBased
      ? `${studioUrl}/studio/site/${site.subdomain}`
      : `https://${site.subdomain}.${studioBase}`
    : null

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full" /></div>
  if (!site) return null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="inline-flex items-center flex-wrap gap-4 bg-card border border-border rounded-2xl px-4 py-2 max-w-full">
        <div>
          <h2 className="text-sm font-bold text-text-primary">My Website</h2>
          {publishUrl && (
            <a href={publishUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-accent hover:underline block">{publishUrl}</a>
          )}
        </div>
        <div className="flex items-center gap-2">
          {publishUrl && (
            <a href={`${publishUrl}?preview=1`} target="_blank" rel="noopener noreferrer"
              className="px-3 py-1.5 text-[11px] font-semibold text-accent border border-accent/30 rounded-full hover:bg-accent/10 transition-colors whitespace-nowrap">
              ↗ Preview
            </a>
          )}
          {site.status === 'LIVE' ? (
            <button
              onClick={() => save({ status: 'DRAFT' })}
              className="px-3 py-1.5 rounded-full text-[11px] font-bold bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 transition-colors whitespace-nowrap">
              ● Live — click to unpublish
            </button>
          ) : (
            <button
              onClick={() => save({ status: 'LIVE' })}
              disabled={!site.subdomain}
              title={!site.subdomain ? 'Set a subdomain first in the Domain tab' : ''}
              className="px-3 py-1.5 rounded-full text-[11px] font-bold bg-accent text-bg hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap">
              ↑ Publish
            </button>
          )}
          <button onClick={() => save()} disabled={saving}
            className="px-4 py-1.5 bg-accent text-bg text-[11px] font-bold rounded-full disabled:opacity-60 transition-all whitespace-nowrap">
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Side-by-side editor+preview only kicks in on genuinely wide desktop
          monitors — lg (1024px) sounds like "not a phone" but plenty of real
          laptops sit in the 1280-1440px range, which is wide enough to
          trigger a two-column attempt but not wide enough to fit both
          columns without squeezing the preview into an overflowing mess.
          Below this threshold, the editor and the live preview each get the
          full page width, stacked — the preview's own desktop+mobile row
          then has plenty of room to lay out cleanly on its own. */}
      <div className="grid grid-cols-1 min-[1680px]:grid-cols-[minmax(0,680px)_1fr] gap-6 items-start">
      <div className="space-y-6 min-w-0">

      {/* Tabs */}
      <div className="flex gap-1 bg-card border border-border rounded-2xl p-1 overflow-x-auto">
        {([
          ['template', 'Template'],
          ['content',  'Content'],
          ['gallery',  'Gallery'],
          ['services', 'Services'],
          ['testimonials', 'Testimonials'],
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

          <div className="bg-card border border-border rounded-xl px-3 py-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-semibold text-muted uppercase tracking-wider whitespace-nowrap">Not sure which fits?</label>
              <input value={templateHint} onChange={e => setTemplateHint(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') askAiForTemplate() }}
                placeholder="e.g. soft, romantic pre-wedding shoots in pastel tones"
                className="flex-1 bg-bg border border-border rounded-lg px-3 py-1.5 text-xs text-text-primary outline-none focus:border-accent placeholder-muted/50" />
              <button onClick={askAiForTemplate} disabled={templateSuggesting || !templateHint.trim()}
                className="px-3 py-1.5 bg-accent text-bg text-[11px] font-bold rounded-lg disabled:opacity-50 hover:opacity-90 transition-opacity whitespace-nowrap">
                {templateSuggesting ? '✨ Thinking…' : '✨ Recommend'}
              </button>
            </div>
            {templateSuggestError && <p className="text-[10px] text-danger">{templateSuggestError}</p>}
            {templateSuggestion && (
              <p className="text-[10px] text-muted">
                ✨ Recommended: <span className="font-semibold text-accent">{TEMPLATES.find(t => t.id === templateSuggestion.templateId)?.name}</span> — {templateSuggestion.reason}
              </p>
            )}
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
            {TEMPLATES.map(t => {
              const isRecommended = templateSuggestion?.templateId === t.id
              return (
                <button key={t.id} onClick={() => update({ templateId: t.id })}
                  className={`relative rounded-lg overflow-hidden border transition-all text-left ${site.templateId === t.id ? 'border-accent scale-[1.02] shadow-md' : isRecommended ? 'border-accent/60 ring-1 ring-accent/30' : 'border-border hover:border-accent/50'}`}>
                  {isRecommended && (
                    <span className="absolute top-1 right-1 z-10 bg-accent text-bg text-[8px] font-bold px-1 py-px rounded-full">✨ AI</span>
                  )}
                  <div className={`h-12 ${t.preview} flex items-center justify-center`}>
                    <span className="text-[10px] font-bold text-white drop-shadow">{t.name}</span>
                  </div>
                  <div className="px-1.5 py-1 bg-card">
                    <p className="text-[10px] font-semibold text-text-primary leading-tight">{t.name}</p>
                    <p className="text-[8px] text-muted leading-tight">{t.desc}</p>
                  </div>
                </button>
              )
            })}
          </div>
          {(() => {
            const bgOptions = BACKGROUND_PRESET_OPTIONS[site.templateId] ?? []
            if (bgOptions.length <= 1) return null
            return (
              <div>
                <label className="block text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">Background</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {bgOptions.map(opt => (
                    <button key={opt.id} onClick={() => update({ backgroundPreset: opt.id })} title={opt.label}
                      className={`flex items-center gap-2 pl-1 pr-3 py-1 rounded-full border-2 transition-all ${
                        (site.backgroundPreset ?? 'default') === opt.id ? 'border-accent' : 'border-border hover:border-accent/50'}`}>
                      <span className="w-5 h-5 rounded-full border border-white/10" style={{ background: opt.swatch }} />
                      <span className="text-[10px] font-medium text-text-primary whitespace-nowrap">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )
          })()}
          <div>
            <label className="block text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">Accent colour <span className="font-normal normal-case">(buttons, highlights)</span></label>
            <div className="flex items-center gap-1.5 flex-wrap">
              {ACCENT_PRESETS.map(p => (
                <button key={p.label} onClick={() => p.color ? update({ themeAccent: p.color }) : accentColorRef.current?.click()}
                  title={p.label}
                  className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${site.themeAccent === p.color ? 'border-white scale-110' : 'border-transparent'}`}
                  style={{ background: p.color || 'conic-gradient(red,orange,yellow,green,blue,indigo,violet,red)' }}
                />
              ))}
              <input ref={accentColorRef} type="color" value={site.themeAccent ?? '#6366f1'} onChange={e => update({ themeAccent: e.target.value })}
                className="sr-only" title="Custom accent colour" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">Font colour <span className="font-normal normal-case">(headings & body text)</span></label>
            <div className="flex items-center gap-1.5 flex-wrap">
              {FONT_COLOR_PRESETS.map(p => (
                <button key={p.label} onClick={() => p.color ? update({ fontColor: p.color }) : fontColorRef.current?.click()}
                  title={p.label}
                  className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${site.fontColor === p.color ? 'border-accent scale-110' : 'border-border'}`}
                  style={{ background: p.color || 'conic-gradient(red,orange,yellow,green,blue,indigo,violet,red)' }}
                />
              ))}
              <input ref={fontColorRef} type="color" value={site.fontColor ?? '#F5F0E8'} onChange={e => update({ fontColor: e.target.value })}
                className="sr-only" title="Custom font colour" />
            </div>
            <p className="text-[9px] text-muted mt-1.5">Leave unset to use each template&apos;s default text colour.</p>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">Website language <span className="font-normal normal-case">(nav, headings, booking form, gallery)</span></label>
            <div className="flex items-center gap-1.5 flex-wrap">
              {LANGUAGE_OPTIONS.map(opt => (
                <button key={opt.id} onClick={() => update({ language: opt.id === 'en' ? undefined : opt.id })}
                  className={`px-3 py-1.5 rounded-full border-2 text-xs font-medium transition-all ${
                    (site.language ?? 'en') === opt.id ? 'border-accent bg-accent/10 text-text-primary' : 'border-border text-muted hover:border-accent/50'}`}>
                  {opt.nativeLabel}
                </button>
              ))}
            </div>
            <p className="text-[9px] text-muted mt-1.5">Your own text (about, services, testimonials, hero title) is never translated — only the fixed page chrome changes language.</p>
          </div>
        </div>
      )}

      {/* ── Content ── */}
      {tab === 'content' && (
        <div className="space-y-4 max-w-2xl">
          <SectionStyleControls label="Hero style" current={site.sectionStyles?.hero}
            onChange={patch => updateSectionStyle('hero', patch)} />
          <Field label="Studio / Hero title" value={site.heroTitle} onChange={v => update({ heroTitle: v })} placeholder="Ram Photography" />

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-muted uppercase tracking-wider">Hero subtitle</label>
              <AskAiButton loading={aiLoading === 'heroSubtitle'} onClick={() => setAiPromptModal({ field: 'heroSubtitle', value: '' })} />
            </div>
            <input value={site.heroSubtitle} onChange={e => update({ heroSubtitle: e.target.value })} placeholder="Capturing your most precious moments"
              className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm text-text-primary outline-none focus:border-accent placeholder-muted/50" />
            <AiDraftBox draftKey="heroSubtitle" aiDraft={aiDraft} aiError={aiError}
              onUse={text => { update({ heroSubtitle: text }); setAiDraft(null) }}
              onRegenerate={() => setAiPromptModal({ field: 'heroSubtitle', value: '' })}
              onDismiss={() => setAiDraft(null)} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-muted uppercase tracking-wider">Tagline (short)</label>
              <AskAiButton loading={aiLoading === 'tagline'} onClick={() => setAiPromptModal({ field: 'tagline', value: '' })} />
            </div>
            <input value={site.tagline ?? ''} onChange={e => update({ tagline: e.target.value })} placeholder="Professional photography for every occasion"
              className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm text-text-primary outline-none focus:border-accent placeholder-muted/50" />
            <AiDraftBox draftKey="tagline" aiDraft={aiDraft} aiError={aiError}
              onUse={text => { update({ tagline: text }); setAiDraft(null) }}
              onRegenerate={() => setAiPromptModal({ field: 'tagline', value: '' })}
              onDismiss={() => setAiDraft(null)} />
          </div>

          <SectionStyleControls label="About style" current={site.sectionStyles?.about}
            onChange={patch => updateSectionStyle('about', patch)} />
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-muted uppercase tracking-wider">About your studio</label>
              <AskAiButton loading={aiLoading === 'about'} onClick={() => setAiPromptModal({ field: 'about', value: '' })} />
            </div>
            <textarea value={site.about} onChange={e => update({ about: e.target.value })} rows={5}
              className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm text-text-primary outline-none focus:border-accent resize-none"
              placeholder="Tell your story…" />
            <AiDraftBox draftKey="about" aiDraft={aiDraft} aiError={aiError}
              onUse={text => { update({ about: text }); setAiDraft(null) }}
              onRegenerate={() => setAiPromptModal({ field: 'about', value: '' })}
              onDismiss={() => setAiDraft(null)} />
          </div>

          <Field label="City / Location" value={site.city ?? ''} onChange={v => update({ city: v })} placeholder="Bhubaneswar, Odisha" />

          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
              Cover image <span className="font-normal normal-case">(hero background)</span>
            </label>
            {site.heroImageUrl ? (
              <div className="relative rounded-xl overflow-hidden border border-border" style={{ aspectRatio: '16/7' }}>
                {site.heroMediaType === 'video' ? (
                  <video src={site.heroImageUrl} poster={site.heroPosterUrl || undefined} muted loop autoPlay playsInline
                    className="w-full h-full object-cover" />
                ) : (
                  <img src={site.heroImageUrl} alt="" className="w-full h-full object-cover" />
                )}
                <button onClick={removeHeroImage}
                  className="absolute top-2 right-2 bg-black/70 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-red-500/80 transition-colors">
                  Remove
                </button>
              </div>
            ) : (
              <button onClick={() => heroFileInputRef.current?.click()} disabled={uploadingHero}
                className="w-full border-2 border-dashed border-border rounded-2xl py-8 text-center text-sm text-muted hover:border-accent hover:text-accent transition-colors disabled:opacity-50">
                {uploadingHero ? 'Uploading…' : '+ Upload a cover image or video'}
              </button>
            )}
            <input ref={heroFileInputRef} type="file" accept="image/*,video/mp4,video/webm,video/quicktime" className="hidden"
              onChange={e => handleHeroImageUpload(e.target.files)} />
            {uploadError && (
              <div className="bg-danger/10 border border-danger/30 rounded-xl px-4 py-2.5 text-xs text-danger mt-2">{uploadError}</div>
            )}
            <p className="text-[10px] text-muted mt-2">Shown behind your hero title — photo or a short looping video (max 60MB). If left unset, your first portfolio item is used instead.</p>

            {HERO_VISIBILITY_DEFAULTS[site.templateId] !== undefined && (() => {
              const defaultVisibility = HERO_VISIBILITY_DEFAULTS[site.templateId]
              const visibility = site.heroBrightness ?? defaultVisibility
              return (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-muted uppercase tracking-wider">Cover visibility</label>
                    <span className="text-xs text-muted">{Math.round(visibility * 100)}%</span>
                  </div>
                  <input type="range" min={0} max={100} step={5}
                    value={Math.round(visibility * 100)}
                    onChange={e => update({ heroBrightness: Number(e.target.value) / 100 })}
                    className="w-full accent-accent" />
                  <p className="text-[10px] text-muted mt-1">This template darkens its cover by design (starts at {Math.round(defaultVisibility * 100)}%) — drag to 100% to show it fully as-is, with no darkening at all.</p>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* ── Gallery ── */}
      {tab === 'gallery' && (
        <div className="space-y-5">
          <p className="text-xs text-muted">Upload your best portfolio photos and videos. Visitors see a clean gallery with a 3D album viewer for photos and a fullscreen player for videos — no watermarks.</p>

          <SectionStyleControls label="Gallery section background" current={site.sectionStyles?.gallery} showEmphasis={false}
            onChange={patch => updateSectionStyle('gallery', patch)} />

          {/* Gallery style */}
          <div>
            <label className="block text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">Gallery style <span className="font-normal normal-case">(how visitors browse your portfolio)</span></label>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
              {GALLERY_STYLES.map(g => (
                <button key={g.id} onClick={() => update({ galleryStyle: g.id })}
                  className={`rounded-xl border p-3 text-left transition-all ${(site.galleryStyle ?? 'classic') === g.id ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/40'}`}>
                  <p className="text-xs font-semibold text-text-primary">{g.name}</p>
                  <p className="text-[9px] text-muted leading-tight mt-1">{g.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Upload area */}
          <div className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <select value={uploadCategory} onChange={e => setUploadCategory(e.target.value)}
                className="bg-card border border-border rounded-xl px-3 py-2 text-sm text-text-primary outline-none focus:border-accent">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                className="px-5 py-2 bg-accent text-bg text-xs font-bold rounded-xl disabled:opacity-50 hover:opacity-90 transition-opacity">
                {uploading ? 'Uploading…' : '+ Upload Photos / Videos'}
              </button>
              <span className="text-xs text-muted">Select category first, then upload</span>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*,video/mp4,video/webm,video/quicktime" multiple className="hidden"
              onChange={e => handlePhotoUpload(e.target.files)} />

            {uploadError && (
              <div className="bg-danger/10 border border-danger/30 rounded-xl px-4 py-2.5 text-xs text-danger">{uploadError}</div>
            )}

            {/* Drop zone */}
            <div
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); handlePhotoUpload(e.dataTransfer.files) }}
              className="border-2 border-dashed border-border rounded-2xl p-8 text-center text-muted text-sm hover:border-accent/50 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}>
              Drag & drop photos or videos here or click to select
            </div>
          </div>

          {/* Existing gallery grid */}
          {site.galleryPhotos.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
                Portfolio items ({site.galleryPhotos.length})
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                {site.galleryPhotos.map((photo, idx) => (
                  <div key={photo.id} className="relative group rounded-xl overflow-hidden" style={{ aspectRatio: '1' }}>
                    {photo.type === 'video' ? (
                      photo.thumbnailUrl
                        ? <img src={photo.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                        : <video src={photo.url} preload="metadata" muted className="w-full h-full object-cover" />
                    ) : (
                      <img src={photo.url} alt="" className="w-full h-full object-cover" />
                    )}
                    {photo.type === 'video' && (
                      <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <span className="w-6 h-6 rounded-full bg-black/50 backdrop-blur flex items-center justify-center text-white text-[10px]">▶</span>
                      </span>
                    )}
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
          <SectionStyleControls label="Services style" current={site.sectionStyles?.services}
            onChange={patch => updateSectionStyle('services', patch)} />
          {site.services.map(s => (
            <div key={s.id} className="bg-card border border-border rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted uppercase tracking-wider">Service</span>
                <button onClick={() => removeService(s.id)} className="text-xs text-red-400 hover:text-red-300">Remove</button>
              </div>
              <Field label="Name" value={s.name} onChange={v => patchService(s.id, { name: v })} placeholder="Wedding Photography" />
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-muted uppercase tracking-wider">Description</label>
                  <AskAiButton loading={aiLoading === `service:${s.id}`} onClick={() => setAiPromptModal({ field: 'serviceDescription', opts: { serviceId: s.id, serviceName: s.name }, value: '' })} />
                </div>
                <input value={s.description} onChange={e => patchService(s.id, { description: e.target.value })} placeholder="Full-day coverage with edited gallery"
                  className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm text-text-primary outline-none focus:border-accent placeholder-muted/50" />
                <AiDraftBox draftKey={`service:${s.id}`} aiDraft={aiDraft} aiError={aiError}
                  onUse={text => { patchService(s.id, { description: text }); setAiDraft(null) }}
                  onRegenerate={() => setAiPromptModal({ field: 'serviceDescription', opts: { serviceId: s.id, serviceName: s.name }, value: '' })}
                  onDismiss={() => setAiDraft(null)} />
              </div>
              <Field label="Price (optional)" value={s.price ?? ''} onChange={v => patchService(s.id, { price: v })} placeholder="₹50,000 onwards" />
            </div>
          ))}
          <button onClick={addService} className="w-full border-2 border-dashed border-border rounded-2xl py-4 text-sm text-muted hover:border-accent hover:text-accent transition-colors">
            + Add Service
          </button>
        </div>
      )}

      {/* ── Testimonials ── */}
      {tab === 'testimonials' && (
        <div className="space-y-4 max-w-2xl">
          <SectionStyleControls label="Testimonials style" current={site.sectionStyles?.testimonials}
            onChange={patch => updateSectionStyle('testimonials', patch)} />
          <p className="text-xs text-muted">Client quotes build trust — shown on your site if you add any. Leave empty and the section just won&apos;t appear.</p>
          {(site.testimonials ?? []).map(t => (
            <div key={t.id} className="bg-card border border-border rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted uppercase tracking-wider">Testimonial</span>
                <button onClick={() => removeTestimonial(t.id)} className="text-xs text-red-400 hover:text-red-300">Remove</button>
              </div>
              <Field label="Client name" value={t.name} onChange={v => patchTestimonial(t.id, { name: v })} placeholder="Priya & Arjun" />
              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">Quote</label>
                <textarea value={t.quote} onChange={e => patchTestimonial(t.id, { quote: e.target.value })} rows={3}
                  className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm text-text-primary outline-none focus:border-accent resize-none placeholder-muted/50"
                  placeholder="They captured our wedding day beautifully — every emotion, every moment." />
              </div>
              <div className="flex items-center gap-4 flex-wrap">
                <Field label="Event type (optional)" value={t.eventType ?? ''} onChange={v => patchTestimonial(t.id, { eventType: v })} placeholder="Wedding" />
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">Rating</label>
                  <div className="flex items-center gap-1 py-1">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button key={n} onClick={() => patchTestimonial(t.id, { rating: n })}
                        className="text-xl leading-none transition-opacity"
                        style={{ opacity: (t.rating ?? 0) >= n ? 1 : 0.25 }}>★</button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
          <button onClick={addTestimonial} className="w-full border-2 border-dashed border-border rounded-2xl py-4 text-sm text-muted hover:border-accent hover:text-accent transition-colors">
            + Add Testimonial
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
          <SectionStyleControls label="Booking / Contact style" current={site.sectionStyles?.book}
            onChange={patch => updateSectionStyle('book', patch)} />
          <div className="flex items-center gap-3">
            <button onClick={() => update({ bookingEnabled: !site.bookingEnabled })}
              className={`relative flex-shrink-0 w-12 h-6 rounded-full transition-colors ${site.bookingEnabled ? 'bg-accent' : 'bg-border'}`}>
              <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${site.bookingEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
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
                {isPathBased ? ` → ${studioBase}/studio/site/` : `.${studioBase}`}
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

      <LivePreviewPanel site={site} publishUrl={publishUrl} refreshKey={site.updatedAt} isDarkTemplate={DARK_TEMPLATE_IDS.has(site.templateId)}
        onEditRequest={tab => { if ((VALID_TABS as string[]).includes(tab)) setTab(tab as Tab) }} />
      </div>

      {aiPromptModal && (
        <AiPromptDialog
          value={aiPromptModal.value}
          onChange={v => setAiPromptModal(m => m ? { ...m, value: v } : m)}
          onSkip={() => { const m = aiPromptModal; setAiPromptModal(null); askAiForContent(m.field, m.opts) }}
          onGenerate={() => { const m = aiPromptModal; setAiPromptModal(null); askAiForContent(m.field, m.opts, m.value.trim() || undefined) }}
          onClose={() => setAiPromptModal(null)}
        />
      )}
    </div>
  )
}

// Compact inline block embedded at the top of each relevant tab — lets the
// studio owner override one section's text emphasis and/or background color
// without leaving the tab they're already editing that section's content in.
// `current` is undefined until the owner sets anything for this section, in
// which case the section renders exactly as its template's own default (see
// each template's own `sx(key)` fallback chain).
function SectionStyleControls({
  label, current, onChange, showEmphasis = true,
}: {
  label: string
  current: WebsiteSectionStyle | undefined
  onChange: (patch: Partial<WebsiteSectionStyle>) => void
  showEmphasis?: boolean
}) {
  const customColorRef = useRef<HTMLInputElement>(null)
  return (
    <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
      <p className="text-xs font-semibold text-text-primary">{label}</p>
      {showEmphasis && (
        <div>
          <label className="block text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">Emphasis</label>
          <div className="flex items-center gap-1.5 flex-wrap">
            {EMPHASIS_OPTIONS.map(opt => (
              <button key={opt.id} onClick={() => onChange({ emphasis: opt.id === 'normal' ? undefined : opt.id })}
                className={`px-3 py-1.5 rounded-full border-2 text-xs font-medium transition-all ${
                  (current?.emphasis ?? 'normal') === opt.id ? 'border-accent bg-accent/10 text-text-primary' : 'border-border text-muted hover:border-accent/50'}`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div>
        <label className="block text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">Background</label>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button onClick={() => onChange({ background: undefined })} title="Default"
            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-[8px] transition-transform hover:scale-110 ${!current?.background ? 'border-accent scale-110' : 'border-border'}`}
            style={{ background: 'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 0 0/8px 8px' }}>
            ✕
          </button>
          {SECTION_BG_SWATCHES.map(color => (
            <button key={color} onClick={() => onChange({ background: color })} title={color}
              className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${current?.background === color ? 'border-accent scale-110' : 'border-border'}`}
              style={{ background: color }} />
          ))}
          <button onClick={() => customColorRef.current?.click()} title="Custom"
            className="w-5 h-5 rounded-full border-2 border-transparent transition-transform hover:scale-110"
            style={{ background: 'conic-gradient(red,orange,yellow,green,blue,indigo,violet,red)' }} />
          <input ref={customColorRef} type="color" value={current?.background ?? '#000000'}
            onChange={e => onChange({ background: e.target.value })} className="sr-only" title="Custom background" />
        </div>
      </div>
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

function AskAiButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={loading}
      className="text-[11px] font-semibold text-accent hover:underline disabled:opacity-50 disabled:no-underline">
      {loading ? '✨ Thinking…' : '✨ Ask AI to write this'}
    </button>
  )
}

// Shows a generated draft for the studio owner to review — never applied to the
// real field until they explicitly click "Use this".
function AiDraftBox({
  draftKey, aiDraft, aiError, onUse, onRegenerate, onDismiss,
}: {
  draftKey: string
  aiDraft: { key: string; text: string } | null
  aiError: { key: string; message: string } | null
  onUse: (text: string) => void
  onRegenerate: () => void
  onDismiss: () => void
}) {
  if (aiError?.key === draftKey) {
    return <p className="text-[11px] text-danger mt-1.5">{aiError.message}</p>
  }
  if (aiDraft?.key !== draftKey) return null
  return (
    <div className="mt-2 bg-accent/5 border border-accent/20 rounded-xl p-3 space-y-2">
      <p className="text-xs text-text-primary leading-relaxed">{aiDraft.text}</p>
      <div className="flex items-center gap-4">
        <button onClick={() => onUse(aiDraft.text)} className="text-[11px] font-bold text-accent hover:underline">Use this</button>
        <button onClick={onRegenerate} className="text-[11px] font-semibold text-muted hover:text-text-primary">Regenerate</button>
        <button onClick={onDismiss} className="text-[11px] text-muted hover:text-text-primary">Dismiss</button>
      </div>
    </div>
  )
}

// Opened by both "Ask AI to write this" and "Regenerate" — lets the studio
// owner optionally steer what the AI emphasizes before every generation,
// not just the first. "Not sure — generate for me" skips straight to
// generating with no extra instruction, identical to the old one-click
// behavior, so nobody who doesn't care about this is slowed down.
function AiPromptDialog({
  value, onChange, onSkip, onGenerate, onClose,
}: {
  value: string
  onChange: (v: string) => void
  onSkip: () => void
  onGenerate: () => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">✨</span>
          <h3 className="text-sm font-bold text-text-primary">Ask AI to write this</h3>
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
            What should it emphasize? <span className="font-normal normal-case">(optional)</span>
          </label>
          <textarea autoFocus value={value} onChange={e => onChange(e.target.value)} rows={3} maxLength={300}
            placeholder="e.g. mention we specialize in destination weddings and candid photography"
            className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-sm text-text-primary outline-none focus:border-accent resize-none placeholder-muted/50" />
        </div>
        <div className="flex items-center justify-between gap-3 pt-1">
          <button onClick={onSkip} className="text-xs font-semibold text-muted hover:text-text-primary transition-colors whitespace-nowrap">
            Not sure — generate for me
          </button>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={onClose} className="px-4 py-2 text-xs font-semibold text-muted hover:text-text-primary transition-colors">Cancel</button>
            <button onClick={onGenerate} className="px-4 py-2 bg-accent text-bg text-xs font-bold rounded-xl hover:opacity-90 transition-opacity whitespace-nowrap">
              ✨ Generate
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
