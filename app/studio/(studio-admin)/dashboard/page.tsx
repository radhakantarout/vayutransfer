'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

interface ProductCardDef {
  key: string
  title: string
  description: string
  href: string
  iconBg: string
  iconColor: string
  image: string
  pathD: string
}

function ProductIcon({ d, className }: { d: string; className: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  )
}

const PRODUCTS: ProductCardDef[] = [
  {
    key: 'gallery',
    title: 'Client Gallery',
    description: 'Manage events, upload photos, and share client galleries.',
    href: '/studio/dashboard/projects',
    iconBg: 'bg-accent/15',
    iconColor: 'text-accent',
    image: '/images/dashboard/dash_client.png',
    pathD: 'M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z',
  },
  {
    key: 'website',
    title: 'My Website',
    description: 'Your own branded portfolio site, live in minutes.',
    href: '/studio/dashboard/website',
    iconBg: 'bg-purple-400/15',
    iconColor: 'text-purple-400',
    image: '/images/dashboard/dash_website.png',
    pathD: 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9',
  },
  {
    key: 'bookings',
    title: 'My Booking',
    description: 'Track and respond to new client enquiries.',
    href: '/studio/dashboard/bookings',
    iconBg: 'bg-orange-400/15',
    iconColor: 'text-orange-400',
    image: '/images/dashboard/dash_booking.png',
    pathD: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z',
  },
]

const FEATURES = [
  {
    label: 'Secure Cloud Storage',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 15a4.5 4.5 0 01-.437-8.98A5.5 5.5 0 0117.5 8h.5a4 4 0 010 8H7.5z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 12v6m0-6l-2.25 2.25M12 12l2.25 2.25" />
      </svg>
    ),
  },
  {
    label: 'Client Collaboration',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
  },
  {
    label: 'AI-Powered Search',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <circle cx="12" cy="8" r="4" />
        <path strokeLinecap="round" d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
        <path strokeLinecap="round" d="M19 3l1 1-1 1M21 5h-2" />
      </svg>
    ),
  },
  {
    label: 'Enterprise Security',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.75h-.152c-3.196 0-6.1-1.248-8.25-3.286z" />
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
    const rotateY = (px - 0.5) * 12
    const rotateX = (0.5 - py) * 12
    setStyle({
      transform: `perspective(900px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.03, 1.03, 1.03)`,
    })
  }

  const handleMouseLeave = () => {
    setStyle({ transform: 'perspective(900px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)' })
  }

  return (
    <button
      ref={ref}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ ...style, transition: 'transform 150ms ease-out' }}
      className="group relative text-left rounded-3xl border border-border bg-card shadow-lg hover:shadow-2xl hover:border-accent/40 overflow-visible will-change-transform"
    >
      {/* Hero band — real photo preview, faded into the card body at the seam */}
      <div className="relative h-32 rounded-t-3xl overflow-hidden">
        <Image src={product.image} alt="" fill sizes="(max-width: 640px) 100vw, 33vw" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/10 to-transparent" />
      </div>

      {/* Icon badge, overlapping the band/body seam */}
      <div className={`absolute left-7 top-[104px] w-14 h-14 rounded-2xl ${product.iconBg} ${product.iconColor} flex items-center justify-center ring-4 ring-card shadow-md`}>
        <ProductIcon d={product.pathD} className="w-7 h-7" />
      </div>

      <div className="relative px-7 pt-9 pb-7">
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
    <div className="relative isolate min-h-full overflow-hidden flex items-center justify-center px-6 py-16">
      {/* Background — studio photo, faded into the theme background toward the
          center via a radial scrim so the heading/cards/tagline stay legible
          in both light and dark mode while the photo still reads at the edges. */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <Image src="/images/dashboard/dash_back.png" alt="" fill priority sizes="100vw" className="object-cover opacity-75" />
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse 90% 80% at 50% 42%, rgb(var(--bg)) 8%, rgb(var(--bg) / 0.6) 35%, rgb(var(--bg) / 0.2) 65%, rgb(var(--bg) / 0.05) 100%)' }}
        />
      </div>

      <div className="w-full max-w-5xl">
        <div className="flex flex-col items-center text-center mb-12 animate-fade-up">
          <Image src="/logo.png" alt="VayuStudios" width={48} height={48} className="h-12 w-12 mb-4" />
          <h1 className="text-2xl sm:text-3xl font-extrabold text-text-primary">
            Welcome back{studioName ? `, ${studioName}` : ''}
          </h1>
          <p className="text-sm text-muted mt-2">Pick where you'd like to go</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 pt-3 animate-fade-up-delay">
          {PRODUCTS.map(p => (
            <TiltCard key={p.key} product={p} onClick={() => router.push(p.href)} />
          ))}
        </div>

        <div className="text-center mt-14 animate-fade-up-delay-2">
          <p className="text-base text-muted">All your photography business.</p>
          <p className="text-xl font-bold text-accent mt-0.5">One beautiful, AI-powered place.</p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 mt-10 animate-fade-up-delay-2">
          {FEATURES.map(f => (
            <div key={f.label} className="flex items-center gap-2 text-muted">
              <span className="text-accent">{f.icon}</span>
              <span className="text-xs font-medium">{f.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
