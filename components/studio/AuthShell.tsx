import Link from 'next/link'
import Image from 'next/image'

interface Props {
  children: React.ReactNode
  // Optional right-hand panel (e.g. the product showcase on the register page).
  // Omit for a single centered column (the login page).
  aside?: React.ReactNode
}

// Full-screen takeover shared by the login and Google-signup-completion pages —
// brand mark top-left (matching StudioNavbar exactly), close (→ /studio/home)
// top-right, centered content below.
export default function AuthShell({ children, aside }: Props) {
  return (
    <div className="fixed inset-0 z-[100] bg-bg overflow-y-auto flex flex-col">
      <div className="flex items-center justify-between px-6 py-5 flex-shrink-0">
        <Link href="/studio/home" className="flex items-center gap-2.5">
          <Image src="/logo.png" alt="VayuStudios" width={32} height={32} className="h-8 w-8" />
          <span className="text-base font-extrabold text-text-primary">
            Vayu<span className="text-accent">Studios</span>
          </span>
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

      {aside ? (
        <div className="flex-1 flex px-4 pb-16">
          <div className="flex-1 flex justify-center lg:justify-end lg:pr-16">
            {children}
          </div>
          <div className="hidden lg:flex flex-1 items-center justify-start pl-16 border-l border-border">
            {aside}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex justify-center px-4 pb-16">
          {children}
        </div>
      )}
    </div>
  )
}
