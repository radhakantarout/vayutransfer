import type { ReactNode } from 'react'

export function TrustBadge({ icon, label, sub }: { icon: ReactNode; label: string; sub: string }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 flex items-start gap-3">
      <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent flex-shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-bold text-text-primary">{label}</div>
        <div className="text-xs text-muted leading-snug mt-0.5">{sub}</div>
      </div>
    </div>
  )
}

export function LegalSection({
  id, icon, title, children,
}: { id: string; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 bg-card border border-border rounded-2xl p-6 sm:p-7">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent flex-shrink-0">
          {icon}
        </div>
        <h2 className="text-lg font-extrabold text-text-primary">{title}</h2>
      </div>
      <div className="text-muted text-sm leading-relaxed space-y-3 [&_ul]:space-y-2 [&_ul]:list-disc [&_ul]:list-inside [&_strong]:text-text-primary [&_a]:text-accent [&_a:hover]:underline">
        {children}
      </div>
    </section>
  )
}

export function LegalToc({ items }: { items: { id: string; label: string }[] }) {
  return (
    <nav className="flex flex-wrap gap-2 justify-center">
      {items.map(({ id, label }) => (
        <a
          key={id}
          href={`#${id}`}
          className="text-xs font-medium text-muted hover:text-accent bg-card border border-border hover:border-accent/40 rounded-full px-3 py-1.5 transition-colors"
        >
          {label}
        </a>
      ))}
    </nav>
  )
}

export function LegalHero({
  eyebrow, title, updated, tagline,
}: { eyebrow: string; title: string; updated: string; tagline: string }) {
  return (
    <section className="bg-card border-b border-border py-16 text-center">
      <div className="max-w-2xl mx-auto px-4">
        <span className="inline-block text-accent text-xs font-bold uppercase tracking-widest mb-3 px-3 py-1 bg-accent/10 border border-accent/20 rounded-full">
          {eyebrow}
        </span>
        <h1 className="text-4xl font-extrabold text-text-primary mt-3 mb-4">{title}</h1>
        <p className="text-muted text-base leading-relaxed">{tagline}</p>
        <p className="text-muted/70 text-xs mt-4">Last updated: {updated}</p>
      </div>
    </section>
  )
}

// Shared icon set — inline SVG, no external icon library used anywhere in this codebase
export const Icons = {
  Lock: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <rect x="5" y="11" width="14" height="9" rx="2" /><path strokeLinecap="round" d="M8 11V7a4 4 0 018 0v4" />
    </svg>
  ),
  Server: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <rect x="3" y="4" width="18" height="6" rx="1.5" /><rect x="3" y="14" width="18" height="6" rx="1.5" />
      <path strokeLinecap="round" d="M7 7h.01M7 17h.01" />
    </svg>
  ),
  Clock: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="12" cy="12" r="9" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 3" />
    </svg>
  ),
  Card: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <rect x="2" y="5" width="20" height="14" rx="2" /><path strokeLinecap="round" d="M2 10h20M6 15h4" />
    </svg>
  ),
  Face: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="12" cy="12" r="9" /><path strokeLinecap="round" d="M9 10h.01M15 10h.01M8.5 15c1 1 2 1.5 3.5 1.5s2.5-.5 3.5-1.5" />
    </svg>
  ),
  Shield: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
    </svg>
  ),
  Mail: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <rect x="2" y="4" width="20" height="16" rx="3" /><path strokeLinecap="round" d="M2 7l9.293 6.293a1 1 0 001.414 0L22 7" />
    </svg>
  ),
  Users: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="9" cy="8" r="3" /><path strokeLinecap="round" d="M3 20c0-3 2.5-5 6-5s6 2 6 5" />
      <circle cx="17" cy="9" r="2.3" /><path strokeLinecap="round" d="M16 15.2c2.4.4 4 1.9 4 4.8" />
    </svg>
  ),
  Doc: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 3h7l4 4v14H7z" />
      <path strokeLinecap="round" d="M11 3v5h5" />
    </svg>
  ),
  Wallet: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <rect x="2" y="6" width="20" height="14" rx="2" /><path strokeLinecap="round" d="M2 10h20" />
      <circle cx="17" cy="14.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  ),
  Ban: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="12" cy="12" r="9" /><path strokeLinecap="round" d="M6 6l12 12" />
    </svg>
  ),
  Scale: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" d="M12 3v18M5 7l-3 6a3 3 0 006 0l-3-6zM19 7l-3 6a3 3 0 006 0l-3-6zM5 7h14" />
    </svg>
  ),
  Alert: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    </svg>
  ),
  Camera: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 8a2 2 0 012-2h2l1.5-2h5L16 6h2a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V8z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  ),
}
