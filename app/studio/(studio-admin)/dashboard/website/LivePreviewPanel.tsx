'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { StudioWebsite } from '@/types/studio'

const DESKTOP = { width: 1280, height: 800 }
const MOBILE  = { width: 390, height: 844 }
const MOBILE_COLUMN_WIDTH = 200 // fixed — the phone bezel is sized to exactly this, so there's no leftover whitespace around it

// Measures its own rendered width and computes the scale needed to fit a
// fixed-size iframe into it — fixed iframe dimensions are what make the
// templates' own Tailwind sm:/md:/lg: breakpoints evaluate correctly per
// frame (each iframe has its own real viewport, unlike rendering the same
// component twice directly on the page, which would share one viewport
// width for both "desktop" and "mobile" copies).
function useContainerScale(targetWidth: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setScale(el.clientWidth / targetWidth)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [targetWidth])

  return { ref, scale }
}

function DeviceFrame({
  width, height, src, title, iframeRef,
}: {
  width: number; height: number; src: string | undefined; title: string
  iframeRef: React.RefObject<HTMLIFrameElement>
}) {
  const { ref, scale } = useContainerScale(width)
  return (
    <div ref={ref} className="relative w-full overflow-hidden bg-bg" style={{ height: scale ? height * scale : width * (height / width) }}>
      {src ? (
        <iframe
          key={src}
          ref={iframeRef}
          src={src}
          title={title}
          style={{ width, height, border: 0, transform: `scale(${scale || 0.01})`, transformOrigin: 'top left' }}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted">Loading preview…</div>
      )}
    </div>
  )
}

// A tight, realistic phone mockup — bezel width is fixed to exactly fit the
// scaled screen inside it, so there's no dead space around the "phone" the
// way a phone centered in a much wider generic card would have. Bezel color
// contrasts with whatever the selected template actually looks like (dark
// templates get a light/silver bezel, light templates get a black bezel) so
// the edge of the "device" always reads clearly against its own screen.
function PhoneMockup({ src, isDarkTemplate, iframeRef }: {
  src: string | undefined; isDarkTemplate: boolean; iframeRef: React.RefObject<HTMLIFrameElement>
}) {
  const bezelColor = isDarkTemplate ? '#E4E4E7' : '#161618'
  const screenBg   = isDarkTemplate ? '#111112' : '#000'
  return (
    <div className="flex-shrink-0 mx-auto" style={{ width: MOBILE_COLUMN_WIDTH }}>
      <div className="rounded-[2.1rem] shadow-2xl" style={{ background: bezelColor, padding: 8 }}>
        <div className="relative rounded-[1.5rem] overflow-hidden" style={{ background: screenBg }}>
          <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-12 h-3.5 bg-black rounded-full z-10" />
          <DeviceFrame width={MOBILE.width} height={MOBILE.height} src={src} title="Mobile preview" iframeRef={iframeRef} />
        </div>
      </div>
    </div>
  )
}

export default function LivePreviewPanel({
  site, publishUrl, refreshKey, isDarkTemplate,
}: {
  site: StudioWebsite
  publishUrl: string | null // null until a subdomain is set
  refreshKey: string        // change this (e.g. site.updatedAt) to force a full reload (fallback resync after a save)
  isDarkTemplate: boolean
}) {
  const [token, setToken] = useState<string | null>(null)
  const desktopIframeRef = useRef<HTMLIFrameElement>(null)
  const mobileIframeRef  = useRef<HTMLIFrameElement>(null)
  // Always holds the latest site, independent of when the ready-ping
  // listener below was (re)attached — without this, that listener's closure
  // would keep resending whatever `site` looked like at the moment it was
  // created (effectively once, since publishUrl rarely changes), silently
  // reverting the preview to an old snapshot every time an iframe reloads.
  const siteRef = useRef(site)
  useEffect(() => { siteRef.current = site }, [site])

  const fetchToken = async () => {
    const res = await fetch('/studio/api/admin/website/preview-token').then(r => r.json())
    if (res.success) setToken(res.token)
  }

  // Refresh periodically so a long editing session never sits on an expired
  // token, and immediately whenever refreshKey changes (i.e. right after a
  // save) so the reload and the fresh token land together. This is now just
  // a fallback full resync — day-to-day edits reach the preview instantly
  // below via postMessage, without waiting for a save at all.
  useEffect(() => {
    if (!publishUrl) return
    fetchToken()
    const interval = setInterval(fetchToken, 4 * 60 * 1000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publishUrl])

  useEffect(() => {
    if (publishUrl) fetchToken()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  // Instant preview: post the current in-memory site object (including
  // unsaved edits) into both iframes every time it changes. The page loaded
  // inside those iframes only ever acts on this when it was reached via a
  // verified preview token (see LiveTemplateRenderer.tsx) — a real visitor
  // to the published site never runs this listener at all, so nothing here
  // can affect what anyone else sees, and nothing here writes to the saved
  // record either. Saves still happen on their own existing schedule
  // (debounced while Draft, manual once Live) — this is purely visual.
  useEffect(() => {
    if (!publishUrl) return
    const targetOrigin = new URL(publishUrl, window.location.origin).origin
    const post = (win: Window | null | undefined) => {
      win?.postMessage({ type: 'vayustudio-preview-update', site }, targetOrigin)
    }
    post(desktopIframeRef.current?.contentWindow)
    post(mobileIframeRef.current?.contentWindow)
  }, [site, publishUrl])

  // The iframe pings us once it's mounted and listening — covers the case
  // where an edit happens right as the iframe (re)loads and the very first
  // postMessage above would otherwise land before anyone's listening.
  useEffect(() => {
    if (!publishUrl) return
    const targetOrigin = new URL(publishUrl, window.location.origin).origin
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== targetOrigin || e.data?.type !== 'vayustudio-preview-ready') return
      if (e.source === desktopIframeRef.current?.contentWindow || e.source === mobileIframeRef.current?.contentWindow) {
        ;(e.source as Window).postMessage({ type: 'vayustudio-preview-update', site: siteRef.current }, targetOrigin)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publishUrl])

  // "sticky" only makes sense once the grid is actually two columns (see the
  // matching min-[1680px]: breakpoint in WebsiteManager.tsx) — below that,
  // this panel sits in normal stacked document flow under the editor, where
  // sticking it to the viewport top would just make it overlap the tabs
  // above it while scrolling.
  if (!publishUrl) {
    return (
      <div className="bg-card border border-border rounded-2xl p-8 text-center min-[1680px]:sticky min-[1680px]:top-6">
        <p className="text-sm text-muted">Set a subdomain in the <span className="font-semibold text-text-primary">Domain</span> tab to see a live preview here.</p>
      </div>
    )
  }

  const src = token ? `${publishUrl}?previewToken=${encodeURIComponent(token)}&v=${encodeURIComponent(refreshKey)}` : undefined

  return (
    <div className="space-y-3 min-[1680px]:sticky min-[1680px]:top-6">
      <p className="text-xs font-semibold text-muted uppercase tracking-wider">Live Preview</p>

      {/* flex-wrap is the safety net: if the container ever gets narrower
          than the mobile mockup's fixed width plus a usable minimum for the
          desktop frame, the phone wraps onto its own line below instead of
          forcing a horizontal overflow that spills over other elements. */}
      <div className="flex flex-wrap items-start gap-4">
        {/* Desktop — grows to fill whatever width is available */}
        <div className="flex-1 min-w-[240px] bg-card border border-border rounded-2xl p-3">
          <div className="flex items-center gap-1.5 mb-2 px-1">
            <span className="w-2.5 h-2.5 rounded-full bg-red-400/50" />
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-400/50" />
            <span className="w-2.5 h-2.5 rounded-full bg-green-400/50" />
          </div>
          <div className="rounded-xl overflow-hidden">
            <DeviceFrame width={DESKTOP.width} height={DESKTOP.height} src={src} title="Desktop preview" iframeRef={desktopIframeRef} />
          </div>
        </div>

        {/* Mobile — fixed-width column beside it, exactly as wide as the phone itself */}
        <div className="flex-shrink-0 pt-1">
          <PhoneMockup src={src} isDarkTemplate={isDarkTemplate} iframeRef={mobileIframeRef} />
        </div>
      </div>
    </div>
  )
}
