'use client'

import { setVayustudiosPath } from '@/lib/vayustudiosPathCookie'

interface Props {
  href: string
  value: 'moments' | 'studio'
  className?: string
  style?: React.CSSProperties
  children: React.ReactNode
}

// The only interactive piece of /studio/welcome — everything else on that
// page is static server-rendered content. Remembers the choice (see
// setVayustudiosPath) so a returning visitor skips the chooser next time —
// middleware.ts's root-path branch reads this same cookie.
export default function ChooserCard({ href, value, className = '', style, children }: Props) {
  const handleClick = () => {
    setVayustudiosPath(value)
    window.location.href = href
  }

  return (
    <button onClick={handleClick} style={style} className={`text-left w-full ${className}`}>
      {children}
    </button>
  )
}
