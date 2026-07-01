'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'

// ── Types ────────────────────────────────────────────────────────────────────
export type PageContent =
  | { type: 'cover';  title: string; label: string; accent: string }
  | { type: 'photos'; srcs: (string | null)[];       alt: string }
  | { type: 'cta';    accent: string; catName: string }
  | { type: 'back';   accent: string }
  | { type: 'blank' }

export interface Spread {
  left:  PageContent
  right: PageContent
}

interface Props {
  spreads:   Spread[]
  catName:   string
  catAccent: string
}

// ── Main component ───────────────────────────────────────────────────────────
export default function AlbumBook({ spreads, catName, catAccent }: Props) {
  const [current,    setCurrent]    = useState(0)
  const [flipping,   setFlipping]   = useState<'forward' | 'backward' | null>(null)
  const [flipAngle,  setFlipAngle]  = useState(0)
  const [pendingIdx, setPendingIdx] = useState(0)

  const touchStartX = useRef(0)
  const mouseStartX = useRef(0)
  const isDragging  = useRef(false)

  // ── Navigation ──────────────────────────────────────────────────────────
  const next = useCallback(() => {
    if (flipping || current >= spreads.length - 1) return
    const p = current + 1
    setPendingIdx(p)
    setFlipping('forward')
    setFlipAngle(0)
    requestAnimationFrame(() => requestAnimationFrame(() => setFlipAngle(-180)))
  }, [flipping, current, spreads.length])

  const prev = useCallback(() => {
    if (flipping || current <= 0) return
    const p = current - 1
    setPendingIdx(p)
    setFlipping('backward')
    setFlipAngle(0)
    requestAnimationFrame(() => requestAnimationFrame(() => setFlipAngle(180)))
  }, [flipping, current])

  const onFlipDone = useCallback(() => {
    setCurrent(pendingIdx)
    setFlipping(null)
    setFlipAngle(0)
  }, [pendingIdx])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') next()
      if (e.key === 'ArrowLeft')  prev()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [next, prev])

  // ── Touch / mouse drag ──────────────────────────────────────────────────
  const onTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX }
  const onTouchEnd   = (e: React.TouchEvent) => {
    const d = e.changedTouches[0].clientX - touchStartX.current
    if (d < -50) next()
    else if (d > 50) prev()
  }
  const onMouseDown  = (e: React.MouseEvent) => { isDragging.current = true; mouseStartX.current = e.clientX }
  const onMouseUp    = (e: React.MouseEvent) => {
    if (!isDragging.current) return
    isDragging.current = false
    const d = e.clientX - mouseStartX.current
    if (d < -50) next()
    else if (d > 50) prev()
  }
  const onMouseLeave = () => { isDragging.current = false }

  // ── Resolve page content per slot ──────────────────────────────────────
  const curr = spreads[current]
  const pend = spreads[pendingIdx] ?? curr

  const staticLeft:   PageContent = flipping === 'backward' ? pend.left  : curr.left
  const staticRight:  PageContent = flipping === 'forward'  ? pend.right : curr.right
  const turningFront: PageContent = flipping === 'forward'  ? curr.right : curr.left
  const turningBack:  PageContent = flipping === 'forward'  ? pend.left  : pend.right

  const isForward = flipping === 'forward'

  return (
    <div className="w-full max-w-5xl mx-auto px-4 select-none">

      {/* Spread indicator */}
      <div className="flex items-center justify-center gap-2.5 mb-7">
        {spreads.map((_, i) => (
          <div
            key={i}
            className="h-1.5 rounded-full transition-all duration-300"
            style={{
              width:      i === current ? 28 : 6,
              background: i === current ? catAccent : 'rgba(255,255,255,0.18)',
            }}
          />
        ))}
      </div>

      {/* Outer perspective */}
      <div style={{ perspective: '1600px' }}>
        <div
          className="relative cursor-grab active:cursor-grabbing"
          style={{
            display:             'grid',
            gridTemplateColumns: '1fr 14px 1fr',
            height:              'clamp(320px, 54vh, 560px)',
            transform:           'rotateX(4deg)',
            transformStyle:      'preserve-3d',
            perspective:         '1000px',
            borderRadius:        4,
            boxShadow:           '0 50px 120px rgba(0,0,0,0.88), 0 0 0 1px rgba(255,255,255,0.04)',
          }}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          onMouseDown={onMouseDown}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseLeave}
        >
          {/* Leather album frame */}
          <div style={{
            position: 'absolute', top: -10, bottom: -34, left: -10, right: -10,
            background: '#120F0B', borderRadius: 8, zIndex: 0,
            boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.6)',
          }} />

          {/* Left page */}
          <div
            className="relative overflow-hidden"
            style={{ zIndex: 1, borderRadius: '3px 0 0 3px', background: '#0E1018', cursor: current > 0 ? 'w-resize' : 'default' }}
            onClick={prev}
          >
            <PageFace content={staticLeft} catName={catName} side="left" />
          </div>

          {/* Spine */}
          <div style={{
            zIndex: 5,
            background: 'linear-gradient(to right, #040302 0%, #1A130E 45%, #1A130E 55%, #040302 100%)',
            boxShadow:  'inset 0 0 8px rgba(0,0,0,0.9)',
            position:   'relative',
          }}>
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1, background: 'rgba(255,255,255,0.03)' }} />
          </div>

          {/* Right page */}
          <div
            className="relative overflow-hidden"
            style={{ zIndex: 1, borderRadius: '0 3px 3px 0', background: '#0E1018', cursor: current < spreads.length - 1 ? 'e-resize' : 'default' }}
            onClick={next}
          >
            <PageFace content={staticRight} catName={catName} side="right" />
          </div>

          {/* Turning page */}
          {flipping && (
            <div
              style={{
                position:        'absolute',
                top: 0, bottom: 0,
                left:            isForward ? '50%' : 0,
                right:           isForward ? 0      : '50%',
                zIndex:          20,
                transformOrigin: isForward ? 'left center' : 'right center',
                transform:       `rotateY(${flipAngle}deg)`,
                transition:      'transform 0.75s cubic-bezier(0.645, 0.045, 0.355, 1.000)',
                transformStyle:  'preserve-3d',
              }}
              onTransitionEnd={onFlipDone}
            >
              {/* Front */}
              <div style={{
                position: 'absolute', inset: 0, overflow: 'hidden',
                backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden',
                borderRadius: isForward ? '0 3px 3px 0' : '3px 0 0 3px',
                background: '#0E1018',
              }}>
                <PageFace content={turningFront} catName={catName} side={isForward ? 'right' : 'left'} />
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: `linear-gradient(to ${isForward ? 'left' : 'right'}, rgba(0,0,0,0.45) 0%, transparent 55%)` }} />
              </div>
              {/* Back */}
              <div style={{
                position: 'absolute', inset: 0, overflow: 'hidden',
                backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden',
                transform:    'rotateY(180deg)',
                borderRadius: isForward ? '3px 0 0 3px' : '0 3px 3px 0',
                background: '#0E1018',
              }}>
                <PageFace content={turningBack} catName={catName} side={isForward ? 'left' : 'right'} />
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: `linear-gradient(to ${isForward ? 'right' : 'left'}, rgba(0,0,0,0.4) 0%, transparent 55%)` }} />
              </div>
            </div>
          )}

          {/* Cast shadow on static pages during flip */}
          {flipping && (
            <div style={{
              position: 'absolute', top: 0, bottom: 0,
              left:     isForward ? 0       : '50%',
              right:    isForward ? '50%'   : 0,
              zIndex:   15, pointerEvents: 'none',
              background: `linear-gradient(to ${isForward ? 'right' : 'left'}, transparent 30%, rgba(0,0,0,0.32) 100%)`,
            }} />
          )}

          {/* Bottom strip — more visible text */}
          <div style={{
            position: 'absolute', bottom: -34, left: -10, right: -10,
            height: 34, zIndex: 6,
            background: '#0E0C09',
            borderRadius: '0 0 8px 8px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 20px',
          }}>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.52)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em' }}>
              VayuStudios
            </span>
            <div className="flex items-center gap-1.5">
              {spreads.map((_, i) => (
                <div key={i} style={{
                  width:      i === current ? 12 : 4,
                  height:     4,
                  borderRadius: 2,
                  background: i === current ? catAccent : 'rgba(255,255,255,0.2)',
                  transition: 'all 0.3s',
                }} />
              ))}
            </div>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.52)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em' }}>
              {catName}
            </span>
          </div>
        </div>
      </div>

      {/* Nav buttons */}
      <div className="flex items-center justify-center gap-6 mt-14">
        <button
          onClick={prev}
          disabled={current === 0 || !!flipping}
          className="w-11 h-11 rounded-full border border-white/15 flex items-center justify-center hover:border-white/30 disabled:opacity-20 transition-all"
          style={{ color: 'rgba(255,255,255,0.5)' }}
          aria-label="Previous spread"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>

        <p className="text-xs text-center font-medium" style={{ color: 'rgba(255,255,255,0.38)', minWidth: 180 }}>
          {current === 0
            ? 'Click right page or swipe to turn →'
            : current === spreads.length - 1
            ? '← Click left page or swipe back'
            : `Spread ${current} of ${spreads.length - 1} · use ← → keys`}
        </p>

        <button
          onClick={next}
          disabled={current === spreads.length - 1 || !!flipping}
          className="w-11 h-11 rounded-full border border-white/15 flex items-center justify-center hover:border-white/30 disabled:opacity-20 transition-all"
          style={{ color: 'rgba(255,255,255,0.5)' }}
          aria-label="Next spread"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>

      <p className="text-center text-xs mt-2.5 sm:hidden" style={{ color: 'rgba(255,255,255,0.22)' }}>
        Swipe left / right to turn pages
      </p>
    </div>
  )
}

// ── Page face ────────────────────────────────────────────────────────────────
function PageFace({ content, catName, side }: { content: PageContent; catName: string; side: 'left' | 'right' }) {

  // Two photos stacked
  if (content.type === 'photos') {
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: 3, padding: 3, background: '#0A0C12' }}>
        {content.srcs.map((src, i) => (
          <div key={i} style={{ flex: 1, position: 'relative', overflow: 'hidden', borderRadius: 2 }}>
            {src ? (
              <>
                <Image
                  src={src}
                  alt={`${content.alt} ${i + 1}`}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 45vw, 380px"
                  draggable={false}
                />
                <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.45) 100%)', pointerEvents: 'none' }} />
                <CornerMounts small />
              </>
            ) : (
              <div style={{ position: 'absolute', inset: 0, background: '#0D0F14' }} />
            )}
          </div>
        ))}
        {/* Page label */}
        <span style={{
          position: 'absolute', bottom: 6,
          ...(side === 'left' ? { left: 8 } : { right: 8 }),
          fontSize: 7, color: 'rgba(255,255,255,0.22)', textTransform: 'uppercase', letterSpacing: '0.15em',
        }}>{catName}</span>
      </div>
    )
  }

  // Cover page
  if (content.type === 'cover') {
    return (
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(145deg, #0D0A07 0%, #1C1208 50%, #0D0A07 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: 28, textAlign: 'center',
      }}>
        <OrnamentCorners />
        <div style={{ width: 36, height: 1, background: content.accent, opacity: 0.45, marginBottom: 18 }} />
        <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.3em', textTransform: 'uppercase', color: content.accent, opacity: 0.7, marginBottom: 10 }}>
          VayuStudios
        </p>
        <h2 style={{ fontSize: 'clamp(16px, 3.5vw, 28px)', fontWeight: 900, color: '#ffffff', lineHeight: 1.2, marginBottom: 8 }}>
          {content.title}
        </h2>
        <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 20 }}>{content.label}</p>
        <div style={{ width: 36, height: 1, background: content.accent, opacity: 0.45 }} />
      </div>
    )
  }

  // CTA page
  if (content.type === 'cta') {
    return (
      <div style={{
        position: 'absolute', inset: 0, background: '#0B0E18',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: 24, textAlign: 'center', gap: 10,
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: `${content.accent}18`, border: `1px solid ${content.accent}38`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 2,
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={content.accent} strokeWidth={2}><path d="M4 6h16M4 12h16M4 18h7"/></svg>
        </div>
        <p style={{ fontSize: 13, fontWeight: 800, color: '#ffffff', lineHeight: 1.35 }}>
          Deliver this album to your clients
        </p>
        <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.42)', lineHeight: 1.6 }}>
          Branded, shareable, print-ready.<br/>No design skills needed.
        </p>
        <Link
          href="/studio/home#get-started"
          onClick={e => e.stopPropagation()}
          style={{
            fontSize: 10, fontWeight: 700, padding: '7px 18px',
            borderRadius: 8, background: content.accent, color: '#07090E',
            textDecoration: 'none', marginTop: 4, display: 'inline-block',
          }}
        >
          Get started →
        </Link>
        <div style={{ width: 28, height: 1, background: 'rgba(255,255,255,0.08)', marginTop: 6 }} />
        <p style={{ fontSize: 8, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700 }}>
          VayuStudios
        </p>
      </div>
    )
  }

  // Back cover
  if (content.type === 'back') {
    return (
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(145deg, #0D0A07 0%, #1C1208 50%, #0D0A07 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: 28, textAlign: 'center',
      }}>
        <OrnamentCorners />
        <div style={{ width: 28, height: 1, background: content.accent, opacity: 0.3, marginBottom: 14 }} />
        <p style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)', marginBottom: 6 }}>
          End of album
        </p>
        <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.18)' }}>
          VayuStudios
        </p>
        <div style={{ width: 28, height: 1, background: content.accent, opacity: 0.3, marginTop: 14 }} />
      </div>
    )
  }

  return <div style={{ position: 'absolute', inset: 0, background: '#0E1018' }} />
}

// ── Corner photo mounts ──────────────────────────────────────────────────────
function CornerMounts({ small = false }: { small?: boolean }) {
  const s = small ? 10 : 13
  const off = small ? 5 : 8
  const corners = [
    { pos: { top: off,    left: off   }, rotate: '0deg'    },
    { pos: { top: off,    right: off  }, rotate: '90deg'   },
    { pos: { bottom: off, left: off   }, rotate: '-90deg'  },
    { pos: { bottom: off, right: off  }, rotate: '180deg'  },
  ]
  return (
    <>
      {corners.map(({ pos, rotate }, i) => (
        <svg key={i} style={{ position: 'absolute', ...pos, transform: `rotate(${rotate})`, opacity: 0.28, pointerEvents: 'none' }}
          width={s} height={s} viewBox="0 0 13 13" fill="none">
          <path d="M1 7 L1 1 L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ))}
    </>
  )
}

// ── Ornament corners for cover / back pages ──────────────────────────────────
function OrnamentCorners() {
  const corners = [
    { pos: { top: 10,    left: 10   }, rotate: '0deg'    },
    { pos: { top: 10,    right: 10  }, rotate: '90deg'   },
    { pos: { bottom: 10, left: 10   }, rotate: '-90deg'  },
    { pos: { bottom: 10, right: 10  }, rotate: '180deg'  },
  ]
  return (
    <>
      {corners.map(({ pos, rotate }, i) => (
        <svg key={i} style={{ position: 'absolute', ...pos, transform: `rotate(${rotate})`, opacity: 0.13, pointerEvents: 'none' }}
          width="22" height="22" viewBox="0 0 22 22" fill="none">
          <path d="M1 11 L1 1 L11 1" stroke="white" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ))}
    </>
  )
}
