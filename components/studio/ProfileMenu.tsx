'use client'

// Popover for the sidebar's profile trigger — same portal + outside-click
// pattern as PhotoActionsMenu. Supports opening above OR below the trigger
// (PhotoActionsMenu only ever opens below, which runs off-screen for a
// trigger sitting at the very bottom of the sidebar; "above" is only needed
// for that case — the top-anchored profile icon uses "below" instead).

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { SettingsTab } from './settings/SettingsModal'

interface Props {
  trigger: React.ReactNode
  // Name + role shown in the header row so the popover is self-identifying
  // wherever it's mounted (dashboard sidebar, marketing navbar, etc).
  name: string
  roleLabel: string
  // Real current plan name (e.g. "Free", "Pro") — callers fetch this from
  // /studio/api/admin/stats's billing.billingPlanId. Defaults to "Free"
  // rather than guessing, since that's every studio's starting plan.
  planLabel?: string
  // Opens the Settings popup directly on the given tab — same modal/icons
  // as the sidebar's own Settings button, just a shortcut into a specific
  // section instead of always landing on General.
  onOpenSettings: (tab: SettingsTab) => void
  onLogout: () => void
  position?: 'above' | 'below'
  align?: 'left' | 'right'
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2) || '?'
  return (
    <div className="w-9 h-9 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center text-sm font-bold text-accent flex-shrink-0">
      {initials}
    </div>
  )
}

function EditIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
    </svg>
  )
}
function BillingIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3M3.75 6h16.5a1.5 1.5 0 011.5 1.5v9a1.5 1.5 0 01-1.5 1.5H3.75a1.5 1.5 0 01-1.5-1.5v-9a1.5 1.5 0 011.5-1.5z" />
    </svg>
  )
}
function UsageIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  )
}
function LogoutIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 9V5.25A2.25 2.25 0 0110.5 3h6a2.25 2.25 0 012.25 2.25v13.5A2.25 2.25 0 0116.5 21h-6a2.25 2.25 0 01-2.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
    </svg>
  )
}

export default function ProfileMenu({ trigger, name, roleLabel, planLabel = 'Free', onOpenSettings, onLogout, position = 'above', align = 'left' }: Props) {
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
          className="z-[100] bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
        >
          <div className="px-3.5 py-3.5 border-b border-border flex items-center gap-3 bg-bg/50">
            <Avatar name={name} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-text-primary truncate">{name || 'Studio User'}</p>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <span className="text-[10px] font-semibold text-accent bg-accent/10 border border-accent/20 rounded-full px-2 py-0.5">{roleLabel}</span>
                <span className="text-[10px] font-semibold text-text-primary bg-border/50 border border-border rounded-full px-2 py-0.5">{planLabel} Plan</span>
              </div>
            </div>
          </div>
          <div className="py-1.5">
          <button onClick={() => { setOpen(false); onOpenSettings('general') }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-left text-text-primary hover:bg-border/50 transition-colors">
            <EditIcon /> Edit profile
          </button>
          <button onClick={() => { setOpen(false); onOpenSettings('billing') }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-left text-text-primary hover:bg-border/50 transition-colors">
            <BillingIcon /> Billing
          </button>
          <button onClick={() => { setOpen(false); onOpenSettings('usage') }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-left text-text-primary hover:bg-border/50 transition-colors">
            <UsageIcon /> Usage
          </button>
          <div className="h-px bg-border my-1" />
          <button onClick={() => { setOpen(false); onLogout() }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-left text-red-400 hover:bg-red-500/10 transition-colors">
            <LogoutIcon /> Log out
          </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
