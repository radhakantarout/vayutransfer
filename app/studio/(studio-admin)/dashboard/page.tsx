'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

interface ProductCardDef {
  key: string
  title: string
  description: string
  href: string
  accent: string
  icon: React.ReactNode
}

const PRODUCTS: ProductCardDef[] = [
  {
    key: 'gallery',
    title: 'Client Gallery',
    description: 'Manage events, upload photos, and share client galleries.',
    href: '/studio/dashboard/projects',
    accent: 'from-accent/25 to-accent/5',
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
      </svg>
    ),
  },
  {
    key: 'website',
    title: 'My Website',
    description: 'Your own branded portfolio site, live in minutes.',
    href: '/studio/dashboard/website',
    accent: 'from-purple-400/25 to-purple-400/5',
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" />
      </svg>
    ),
  },
  {
    key: 'bookings',
    title: 'My Booking',
    description: 'Track and respond to new client enquiries.',
    href: '/studio/dashboard/bookings',
    accent: 'from-orange-400/25 to-orange-400/5',
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
      </svg>
    ),
  },
]

function TiltCard({ product, onClick }: { product: ProductCardDef; onClick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null)
  const [style, setStyle] = useState<React.CSSProperties>({})

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    const px = (e.clientX - rect.left) / rect.width
    const py = (e.clientY - rect.top) / rect.height
    const rotateY = (px - 0.5) * 14
    const rotateX = (0.5 - py) * 14
    setStyle({
      transform: `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.03, 1.03, 1.03)`,
    })
  }

  const handleMouseLeave = () => {
    setStyle({ transform: 'perspective(800px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)' })
  }

  return (
    <button
      ref={ref}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ ...style, transition: 'transform 150ms ease-out' }}
      className="group relative text-left rounded-3xl border border-border bg-card p-8 shadow-lg hover:shadow-2xl overflow-hidden will-change-transform"
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${product.accent} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
      <div className="relative">
        <div className="w-14 h-14 rounded-2xl bg-accent/10 text-accent flex items-center justify-center mb-5">
          {product.icon}
        </div>
        <h3 className="text-lg font-bold text-text-primary">{product.title}</h3>
        <p className="text-sm text-muted mt-1.5 leading-relaxed">{product.description}</p>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-accent mt-5">
          Open
          <svg className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </span>
      </div>
    </button>
  )
}

export default function DashboardLandingPage() {
  const router = useRouter()
  const [studioName, setStudioName] = useState('')

  useEffect(() => {
    fetch('/studio/api/admin/stats')
      .then(r => r.json())
      .then(d => { if (d?.success) setStudioName(d.data.studioName) })
      .catch(() => {})
  }, [])

  return (
    <div className="min-h-full flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-12">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-text-primary">
            Welcome back{studioName ? `, ${studioName}` : ''}
          </h1>
          <p className="text-sm text-muted mt-2">Pick where you'd like to go</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {PRODUCTS.map(p => (
            <TiltCard key={p.key} product={p} onClick={() => router.push(p.href)} />
          ))}
        </div>
      </div>
    </div>
  )
}
