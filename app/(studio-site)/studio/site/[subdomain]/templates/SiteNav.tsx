'use client'

import { useEffect, useState } from 'react'

export interface SiteNavLink { label: string; href: string }

// Shared nav links + mobile menu for every template. Previously each template
// hand-rolled its own <nav>, and two of them (Clarity, Ember) hid it entirely
// below the `sm` breakpoint with no replacement — mobile visitors had no way
// to jump to a section at all. This renders a real desktop row AND a working
// hamburger → full-screen panel on mobile, themed via the same accent/
// fontColor props every other shared template component already takes.
export default function SiteNav({
  links, accent, fontColor, panelBg = '#0A0A0A',
  linkClassName = 'text-xs uppercase tracking-widest',
  desktopClassName = 'hidden md:flex items-center gap-8',
}: {
  links: SiteNavLink[]
  accent: string
  fontColor: string
  panelBg?: string
  linkClassName?: string
  desktopClassName?: string
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (links.length === 0) return null

  return (
    <>
      {/* Desktop */}
      <nav className={desktopClassName}>
        {links.map(l => (
          <a key={l.href} href={l.href} style={{ color: fontColor }}
            className={`${linkClassName} hover:opacity-70 transition-opacity`}>
            {l.label}
          </a>
        ))}
      </nav>

      {/* Mobile hamburger trigger */}
      <button onClick={() => setOpen(true)} className="md:hidden flex flex-col gap-[5px] p-2 -m-2 z-10 relative" aria-label="Open menu">
        <span className="w-6 h-0.5 rounded-full transition-all" style={{ background: fontColor }} />
        <span className="w-6 h-0.5 rounded-full transition-all" style={{ background: fontColor }} />
        <span className="w-4 h-0.5 rounded-full self-end transition-all" style={{ background: fontColor }} />
      </button>

      {/* Mobile full-screen panel */}
      {open && (
        <div className="fixed inset-0 z-[100] md:hidden" style={{ background: panelBg }}>
          <button onClick={() => setOpen(false)}
            className="absolute top-6 right-6 text-3xl font-light leading-none w-10 h-10 flex items-center justify-center"
            style={{ color: fontColor }} aria-label="Close menu">
            ✕
          </button>
          <div className="h-full flex flex-col items-center justify-center gap-7 px-8">
            {links.map(l => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)}
                className="text-2xl font-light tracking-wide" style={{ color: fontColor }}>
                {l.label}
              </a>
            ))}
            <span className="mt-2 w-10 h-px" style={{ background: accent }} />
          </div>
        </div>
      )}
    </>
  )
}
