import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Studio Dashboard — VayuStudios',
  description: 'Manage every shoot from one place. Track status, view client selections, manage team access, and deliver — all from your studio dashboard.',
}

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-bg">
      <section className="bg-card border-b border-border py-20">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-6">
            <svg className="w-7 h-7 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
          </div>
          <span className="inline-block text-blue-400 text-xs font-bold uppercase tracking-widest mb-3 px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full">Product</span>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-text-primary mt-3 mb-4">Studio Dashboard</h1>
          <p className="text-muted text-lg max-w-2xl mx-auto leading-relaxed">
            Every shoot, every client, every selection — managed from one clean dashboard. Track project status in real time and know exactly where each delivery stands.
          </p>
          <Link href="/studio/home#get-started" className="inline-block mt-8 bg-accent text-bg font-bold px-8 py-3.5 rounded-xl hover:bg-accent/90 transition-colors shadow-lg shadow-accent/20">Get started</Link>
        </div>
      </section>

      {/* Status lifecycle */}
      <section className="max-w-5xl mx-auto px-4 py-16">
        <h2 className="text-2xl font-extrabold text-text-primary text-center mb-10">Every project tracked through its lifecycle</h2>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
          {['Draft','Active','Client Reviewing','Selection Received','Editing','Delivered'].map((s, i, arr) => (
            <div key={s} className="flex items-center gap-2">
              <div className="bg-card border border-accent/30 rounded-xl px-4 py-2.5 text-center">
                <p className="text-xs font-bold text-accent">{s}</p>
              </div>
              {i < arr.length - 1 && <span className="text-muted text-sm hidden sm:block">→</span>}
            </div>
          ))}
        </div>
      </section>

      <section className="bg-card border-y border-border py-16">
        <div className="max-w-5xl mx-auto px-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            { icon: '📁', title: 'All shoots in one place', body: 'Every project — wedding, corporate, school — listed with status, client name, and photo count.' },
            { icon: '👥', title: 'Team roles', body: 'Add Studio Admin and Print Admin users. Each role sees only what they need. Owner controls everything.' },
            { icon: '📊', title: 'Live selection view', body: 'Open any project and see which photos the client has hearted, which need editing, and all their comments.' },
            { icon: '🖨️', title: 'One-click print link', body: 'When finals are ready, generate a 7-day lab download link without leaving the dashboard.' },
            { icon: '🤖', title: 'AI backfill button', body: 'Trigger AI face indexing for an entire event with one click — ready for AI search and Guest QR.' },
            { icon: '📱', title: 'Mobile-ready', body: 'Dashboard works on any device. Check client selections from the wedding venue itself.' },
          ].map((f) => (
            <div key={f.title} className="bg-bg border border-border rounded-2xl p-5 hover:border-blue-500/30 transition-all space-y-2">
              <span className="text-2xl">{f.icon}</span>
              <h3 className="font-bold text-text-primary">{f.title}</h3>
              <p className="text-muted text-sm leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-2xl mx-auto px-4 py-16 text-center">
        <h2 className="text-2xl font-extrabold text-text-primary mb-3">Run your studio with clarity</h2>
        <p className="text-muted text-sm mb-6">Every shoot tracked. Every client served. Zero confusion.</p>
        <Link href="/studio/home#get-started" className="inline-block bg-accent text-bg font-bold px-8 py-4 rounded-xl hover:bg-accent/90 transition-colors">Get started →</Link>
      </section>
    </main>
  )
}
