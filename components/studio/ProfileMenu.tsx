'use client'

// Popover for the sidebar's profile trigger — same portal + outside-click
// pattern as PhotoActionsMenu. Supports opening above OR below the trigger
// (PhotoActionsMenu only ever opens below, which runs off-screen for a
// trigger sitting at the very bottom of the sidebar; "above" is only needed
// for that case — the top-anchored profile icon uses "below" instead).

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'

interface Props {
  trigger: React.ReactNode
  onEditProfile: () => void
  onLogout: () => void
  position?: 'above' | 'below'
  align?: 'left' | 'right'
}

export default function ProfileMenu({ trigger, onEditProfile, onLogout, position = 'above', align = 'left' }: Props) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left?: number; right?: number } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const openMenu = () => {
    const rect = rootRef.current?.getBoundingClientRect()
    if (!rect) return
    setPos({
      ...(position === 'above' ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
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
    document.addEventListener('mousedown', onDocClick)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className="inline-block">
      <div onClick={() => (open ? setOpen(false) : openMenu())}>{trigger}</div>
      {open && pos && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left, right: pos.right, width: 224 }}
          className="z-[100] bg-card border border-border rounded-xl shadow-2xl py-1.5"
        >
          <Link href="/studio/dashboard/settings" onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-text-primary hover:bg-border/50 transition-colors">
            Settings
          </Link>
          <button onClick={() => { setOpen(false); onEditProfile() }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-left text-text-primary hover:bg-border/50 transition-colors">
            Edit profile
          </button>
          <Link href="/studio/dashboard/settings#billing" onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-text-primary hover:bg-border/50 transition-colors">
            Billing &amp; usage
          </Link>
          <div className="h-px bg-border my-1" />
          <button onClick={() => { setOpen(false); onLogout() }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-left text-red-400 hover:bg-red-500/10 transition-colors">
            Log out
          </button>
        </div>,
        document.body
      )}
    </div>
  )
}
