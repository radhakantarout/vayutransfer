'use client'

// Small self-contained dropdown menu — no menu/dropdown library exists
// anywhere in this codebase, so this is the first reusable pattern for one.
// Used both as the grid tile's hover 3-dot menu and the lightbox's own "⋮".

import { useEffect, useRef, useState } from 'react'

export interface PhotoMenuAction {
  label: string
  icon: React.ReactNode
  onClick: () => void
  danger?: boolean
}

interface PhotoActionsMenuProps {
  actions: PhotoMenuAction[]
  trigger: React.ReactNode
  align?: 'left' | 'right'
  menuClassName?: string
}

export default function PhotoActionsMenu({ actions, trigger, align = 'right', menuClassName = '' }: PhotoActionsMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
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
    <div ref={rootRef} className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <div onClick={() => setOpen((v) => !v)}>{trigger}</div>
      {open && (
        <div
          className={`absolute z-10 top-full mt-1 ${align === 'right' ? 'right-0' : 'left-0'} min-w-[170px]
            bg-card border border-border rounded-xl shadow-2xl py-1.5 ${menuClassName}`}
        >
          {actions.map((action, i) => (
            <button
              key={i}
              onClick={() => { setOpen(false); action.onClick() }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-left transition-colors
                ${action.danger ? 'text-red-400 hover:bg-red-500/10' : 'text-text-primary hover:bg-border/50'}`}
            >
              <span className="w-4 h-4 flex-shrink-0">{action.icon}</span>
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
