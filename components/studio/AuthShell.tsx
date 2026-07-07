import Link from 'next/link'

// Full-screen takeover shared by the login and Google-signup-completion pages —
// brand mark top-left, close (→ /studio/home) top-right, centered content below.
export default function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[100] bg-bg overflow-y-auto">
      <div className="flex items-center justify-between px-6 py-5">
        <Link href="/studio/home" className="text-base font-extrabold tracking-[0.25em] text-text-primary uppercase">
          Vayu<span className="text-accent">Studios</span>
        </Link>
        <Link
          href="/studio/home"
          aria-label="Close and return to VayuStudios home"
          className="text-muted hover:text-text-primary transition-colors"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </Link>
      </div>
      <div className="flex justify-center px-4 pb-16">
        {children}
      </div>
    </div>
  )
}
