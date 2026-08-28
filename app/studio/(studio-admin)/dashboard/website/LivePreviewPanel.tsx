'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'

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
  width, height, src, title,
}: {
  width: number; height: number; src: string | undefined; title: string
}) {
  const { ref, scale } = useContainerScale(width)
  return (
    <div ref={ref} className="relative w-full overflow-hidden bg-bg" style={{ height: scale ? height * scale : width * (height / width) }}>
      {src ? (
        <iframe
          key={src}
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
function PhoneMockup({ src, isDarkTemplate }: { src: string | undefined; isDarkTemplate: boolean }) {
  const bezelColor = isDarkTemplate ? '#E4E4E7' : '#161618'
  const screenBg   = isDarkTemplate ? '#111112' : '#000'
  return (
    <div className="flex-shrink-0 mx-auto" style={{ width: MOBILE_COLUMN_WIDTH }}>
      <div className="rounded-[2.1rem] shadow-2xl" style={{ background: bezelColor, padding: 8 }}>
        <div className="relative rounded-[1.5rem] overflow-hidden" style={{ background: screenBg }}>
          <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-12 h-3.5 bg-black rounded-full z-10" />
          <DeviceFrame width={MOBILE.width} height={MOBILE.height} src={src} title="Mobile preview" />
        </div>
      </div>
    </div>
  )
}

export default function LivePreviewPanel({
  publishUrl, refreshKey, isDarkTemplate,
}: {
  publishUrl: string | null // null until a subdomain is set
  refreshKey: string        // change this (e.g. site.updatedAt) to force a reload
  isDarkTemplate: boolean
}) {
  const [token, setToken] = useState<string | null>(null)

  const fetchToken = async () => {
    const res = await fetch('/studio/api/admin/website/preview-token').then(r => r.json())
    if (res.success) setToken(res.token)
  }

  // Refresh periodically so a long editing session never sits on an expired
  // token, and immediately whenever refreshKey changes (i.e. right after a
  // save) so the reload and the fresh token land together.
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

  if (!publishUrl) {
    return (
      <div className="bg-card border border-border rounded-2xl p-8 text-center lg:sticky lg:top-6">
        <p className="text-sm text-muted">Set a subdomain in the <span className="font-semibold text-text-primary">Domain</span> tab to see a live preview here.</p>
      </div>
    )
  }

  const src = token ? `${publishUrl}?previewToken=${encodeURIComponent(token)}&v=${encodeURIComponent(refreshKey)}` : undefined

  return (
    <div className="space-y-3 lg:sticky lg:top-6">
      <p className="text-xs font-semibold text-muted uppercase tracking-wider">Live Preview</p>

      <div className="flex items-start gap-4">
        {/* Desktop — grows to fill whatever width is available */}
        <div className="flex-1 min-w-0 bg-card border border-border rounded-2xl p-3">
          <div className="flex items-center gap-1.5 mb-2 px-1">
            <span className="w-2.5 h-2.5 rounded-full bg-red-400/50" />
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-400/50" />
            <span className="w-2.5 h-2.5 rounded-full bg-green-400/50" />
          </div>
          <div className="rounded-xl overflow-hidden">
            <DeviceFrame width={DESKTOP.width} height={DESKTOP.height} src={src} title="Desktop preview" />
          </div>
        </div>

        {/* Mobile — fixed-width column beside it, exactly as wide as the phone itself */}
        <div className="flex-shrink-0 pt-1">
          <PhoneMockup src={src} isDarkTemplate={isDarkTemplate} />
        </div>
      </div>
    </div>
  )
}
