import Link from 'next/link'

export default function StudioHomePage() {
  return (
    <div className="min-h-screen bg-bg flex flex-col">

      {/* Nav */}
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="text-xl font-extrabold text-text-primary">
          Vayu<span className="text-accent">Studio</span>
        </div>
        <Link
          href="/studio/login"
          className="text-sm text-muted hover:text-text-primary transition-colors"
        >
          Sign in
        </Link>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16 text-center">
        <div className="max-w-lg space-y-4 mb-14">
          <div className="inline-flex items-center gap-2 bg-accent/10 border border-accent/20 rounded-full px-4 py-1.5 text-accent text-xs font-semibold mb-2">
            For professional photographers
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-text-primary leading-tight">
            Share photos.<br />Let clients choose.
          </h1>
          <p className="text-muted text-base leading-relaxed">
            Upload RAW or edited photos, share a private gallery link, and let your clients
            select their favourites — all in one place.
          </p>
        </div>

        {/* Cards */}
        <div className="w-full max-w-xl space-y-3">

          {/* Studio login */}
          <Link
            href="/studio/login"
            className="flex items-center justify-between bg-card border border-border hover:border-accent/50 rounded-2xl px-6 py-5 group transition-colors"
          >
            <div className="text-left">
              <div className="font-bold text-text-primary group-hover:text-accent transition-colors">
                Studio sign in
              </div>
              <div className="text-sm text-muted mt-0.5">
                Access your dashboard, projects and galleries
              </div>
            </div>
            <div className="text-muted group-hover:text-accent transition-colors text-xl">→</div>
          </Link>

          {/* Register / Enquiry */}
          <Link
            href="/#get-started"
            className="flex items-center justify-between bg-accent text-bg rounded-2xl px-6 py-5 group hover:bg-accent/90 transition-colors"
          >
            <div className="text-left">
              <div className="font-bold">Register your studio</div>
              <div className="text-sm text-bg/70 mt-0.5">
                Get your studio set up in minutes
              </div>
            </div>
            <div className="text-xl">→</div>
          </Link>

          {/* Client access info */}
          <div className="bg-card border border-border rounded-2xl px-6 py-5 text-left">
            <div className="font-semibold text-text-primary text-sm">
              Looking for your gallery?
            </div>
            <div className="text-sm text-muted mt-1 leading-relaxed">
              Use the link your photographer sent to your email — it will open your gallery directly.
              No separate login needed.
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-4 flex items-center justify-between text-xs text-muted">
        <span>© 2026 VayuStudio by VayuTransfer</span>
        <a href="https://vayutransfer.com" className="hover:text-text-primary transition-colors">
          vayutransfer.com →
        </a>
      </footer>

    </div>
  )
}
