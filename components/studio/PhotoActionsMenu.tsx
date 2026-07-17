'use client'

// Small self-contained dropdown menu — no menu/dropdown library exists
// anywhere in this codebase, so this is the first reusable pattern for one.
// Used both as the grid tile's hover 3-dot menu and the lightbox's own "⋯".
//
// The dropdown panel is rendered into a portal at document.body with
// position: fixed, computed from the trigger's own screen position — not
// absolute-positioned inside the trigger's own DOM subtree. Every place this
// component is used (grid tiles, list rows) sits inside an ancestor with
// overflow-hidden (needed for the tile's rounded photo corners), which was
// silently clipping the old absolute-positioned dropdown.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface PhotoMenuAction {
  label: string
  icon?: React.ReactNode
  onClick: () => void
  danger?: boolean
  // When set, the row renders as a checkbox instead of icon+label, and
  // clicking it does NOT close the menu — for a "select all / deselect
  // individually" style list where the admin toggles several rows in a row.
  checked?: boolean
}

interface PhotoActionsMenuProps {
  actions: PhotoMenuAction[]
  trigger: React.ReactNode
  align?: 'left' | 'right'
  // 'down' (default) opens below the trigger — wrong for triggers sitting
  // near the bottom of the viewport (e.g. the floating selection pill),
  // where the panel would render mostly/entirely off-screen. Pass 'up' there.
  direction?: 'down' | 'up'
  menuClassName?: string
}

export default function PhotoActionsMenu({ actions, trigger, align = 'right', direction = 'down', menuClassName = '' }: PhotoActionsMenuProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left?: number; right?: number } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const openMenu = () => {
    const rect = rootRef.current?.getBoundingClientRect()
    if (!rect) return
    setPos({
      ...(direction === 'up' ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
      ...(align === 'right' ? { right: window.innerWidth - rect.right } : { left: rect.left }),
    })
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    // Closes on any scroll — the portal's fixed position isn't recomputed
    // live, and closing on scroll is simpler/more robust than tracking every
    // scrollable ancestor to keep it glued to a moving trigger.
    const onScroll = () => setOpen(false)
    document.addEventListener('mousedown', onDocClick)
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <div onClick={() => (open ? setOpen(false) : openMenu())}>{trigger}</div>
      {open && pos && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          onClick={(e) => e.stopPropagation()}
          style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left, right: pos.right }}
          className={`z-[100] min-w-[170px] bg-card border border-border rounded-xl shadow-2xl py-1.5 ${menuClassName}`}
        >
          {actions.map((action, i) => (
            <button
              key={i}
              onClick={() => { if (action.checked === undefined) setOpen(false); action.onClick() }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-left transition-colors
                ${action.danger ? 'text-red-400 hover:bg-red-500/10' : 'text-text-primary hover:bg-border/50'}`}
            >
              {action.checked !== undefined ? (
                <span className={`w-3.5 h-3.5 flex-shrink-0 rounded border flex items-center justify-center transition-colors
                  ${action.checked ? 'bg-accent border-accent text-white' : 'border-muted'}`}>
                  {action.checked && (
                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
              ) : (
                <span className="w-4 h-4 flex-shrink-0">{action.icon}</span>
              )}
              {action.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}
