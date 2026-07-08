import Image from 'next/image'

interface Props {
  uploadSamples: string[]
  mockupPhotos: string[]
  // 'grid' — full detailed mockup cards, used on the marketing home page.
  // 'stack' — compact vertical timeline (no mockup graphics), sized to fit
  // a fixed-height side panel with no scrolling.
  variant?: 'grid' | 'stack'
}

function StepShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-[#060910] border border-white/8 p-3 mb-5">
      <div className="flex gap-1 mb-2.5">
        <span className="w-2 h-2 rounded-full bg-white/15" /><span className="w-2 h-2 rounded-full bg-white/15" /><span className="w-2 h-2 rounded-full bg-white/15" />
      </div>
      {children}
    </div>
  )
}

function StepLabel({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[10px] font-black text-accent bg-accent/10 border border-accent/20 rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0">{n}</span>
        <h3 className="font-bold text-accent text-sm">{title}</h3>
      </div>
      <p className="text-muted text-xs leading-relaxed">{body}</p>
    </>
  )
}

const STEPS = [
  { title: 'Upload your shoot',       body: 'Drag in full-res files. Watermarked previews generate automatically in the cloud.' },
  { title: 'Share the gallery',       body: 'One secure link. Client logs in with OTP — no app, no password.' },
  { title: 'Client picks favourites', body: 'Heart to keep, pencil to retouch. You see every selection live.' },
  { title: 'Print-ready delivery',    body: 'Generate a 7-day secure download link for your print lab. Job done.' },
]

function CompactTimeline() {
  return (
    <div>
      {STEPS.map((s, i) => (
        <div key={s.title} className="flex gap-3.5">
          <div className="flex flex-col items-center flex-shrink-0">
            <span className="w-7 h-7 rounded-full bg-accent/10 border border-accent/30 flex items-center justify-center text-xs font-black text-accent">
              {i + 1}
            </span>
            {i < STEPS.length - 1 && <span className="w-px flex-1 bg-border my-1" />}
          </div>
          <div className={i < STEPS.length - 1 ? 'pb-5' : ''}>
            <h3 className="font-bold text-text-primary text-sm mb-1">{s.title}</h3>
            <p className="text-muted text-xs leading-relaxed">{s.body}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function ProductLifecycle({ uploadSamples, mockupPhotos, variant = 'grid' }: Props) {
  if (variant === 'stack') {
    return (
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <span className="inline-block text-accent text-xs font-bold uppercase tracking-widest mb-2 px-3 py-1 bg-accent/10 border border-accent/20 rounded-full">
            Product lifecycle
          </span>
          <h2 className="text-xl font-extrabold text-text-primary mt-2">From shoot to client in 4 steps</h2>
          <p className="text-muted mt-2 text-xs">Everything happens inside VayuStudios — no third-party tools, no manual handoffs.</p>
        </div>
        <CompactTimeline />
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4">
      <div className="text-center mb-14">
        <span className="inline-block text-accent text-xs font-bold uppercase tracking-widest mb-3 px-3 py-1 bg-accent/10 border border-accent/20 rounded-full">
          Product lifecycle
        </span>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-text-primary mt-2">
          From shoot to client in 4 steps
        </h2>
        <p className="text-muted mt-3 text-sm max-w-lg mx-auto">
          Everything happens inside VayuStudios — no third-party tools, no manual handoffs.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

        {/* Step 1 — Upload */}
        <div className="relative bg-bg border border-border rounded-2xl p-5 hover:border-accent/40 hover:-translate-y-1 transition-all duration-300">
          <StepShell>
            <div className="border-2 border-dashed border-accent/30 rounded-lg p-2 flex flex-col items-center gap-1.5 mb-2">
              <div className="w-5 h-5 rounded bg-accent/20 flex items-center justify-center">
                <svg className="w-3 h-3 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
              </div>
              <span className="text-[8px] text-muted">Drop photos here</span>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {([100, 67, 33] as const).map((w, i) => (
                <div key={i} className="aspect-square rounded-sm bg-white/5 relative overflow-hidden">
                  {uploadSamples[i] && (
                    <Image src={uploadSamples[i]} alt={`sample ${i + 1}`} fill className="object-cover" sizes="60px" />
                  )}
                  <div className="absolute bottom-0 left-0 h-1 bg-accent/70" style={{ width: `${w}%` }} />
                </div>
              ))}
            </div>
            <div className="mt-2 bg-white/5 rounded-full h-1 overflow-hidden">
              <div className="h-full w-2/3 bg-accent rounded-full" />
            </div>
          </StepShell>
          <StepLabel n={1} title="Upload your shoot" body="Drag in full-res files. Watermarked previews generate automatically in the cloud." />
          <div className="hidden lg:flex absolute -right-3 top-24 z-10 w-6 h-6 items-center justify-center rounded-full bg-border border border-border text-accent text-xs font-bold">›</div>
        </div>

        {/* Step 2 — Watermark + share */}
        <div className="relative bg-bg border border-border rounded-2xl p-5 hover:border-accent/40 hover:-translate-y-1 transition-all duration-300">
          <StepShell>
            <div className="grid grid-cols-3 gap-1 mb-2">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="aspect-square rounded-sm bg-white/5 relative overflow-hidden flex items-center justify-center">
                  {mockupPhotos[i] && (
                    <Image src={mockupPhotos[i]} alt={`preview ${i + 1}`} fill className="object-cover" sizes="60px" />
                  )}
                  <div className="absolute inset-0 bg-black/30 z-[5]" />
                  <span className="absolute inset-0 flex items-center justify-center text-[7px] text-white/60 font-black rotate-[-25deg] select-none tracking-wide z-10 whitespace-nowrap">VayuStudios</span>
                  <div className="absolute top-0.5 right-0.5 z-10 flex flex-col gap-[1.5px] items-center justify-center w-3 h-3">
                    {[0,1,2].map((d) => (
                      <span key={d} className="w-[2px] h-[2px] rounded-full bg-white/60" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-accent/10 border border-accent/25 rounded-lg px-2 py-1.5 flex items-center gap-1.5">
              <svg className="w-2.5 h-2.5 text-accent flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" /><path strokeLinecap="round" strokeLinejoin="round" d="M14.828 14.828a4 4 0 015.656 0l-4 4a4 4 0 01-5.656-5.656l1.102-1.101" /></svg>
              <span className="text-[7px] text-accent font-medium truncate">vayu.studio/g/abc123</span>
            </div>
          </StepShell>
          <StepLabel n={2} title="Share the gallery" body="One secure link. Client logs in with OTP — no app, no password. Originals stay locked in the cloud." />
          <div className="hidden lg:flex absolute -right-3 top-24 z-10 w-6 h-6 items-center justify-center rounded-full bg-border border border-border text-accent text-xs font-bold">›</div>
        </div>

        {/* Step 3 — Client selects */}
        <div className="relative bg-bg border border-border rounded-2xl p-5 hover:border-accent/40 hover:-translate-y-1 transition-all duration-300">
          <StepShell>
            <div className="grid grid-cols-3 gap-1 mb-2">
              {[
                { heart:true,  comment:false },
                { heart:false, comment:true  },
                { heart:true,  comment:false },
                { heart:false, comment:false },
                { heart:true,  comment:true  },
                { heart:false, comment:false },
              ].map(({ heart, comment }, i) => (
                <div key={i} className="aspect-square rounded-sm bg-white/5 relative overflow-hidden">
                  {mockupPhotos[i] && (
                    <Image src={mockupPhotos[i]} alt={`select ${i + 1}`} fill className="object-cover" sizes="60px" />
                  )}
                  <div className="absolute inset-0 bg-black/20 z-[5]" />
                  {heart && <div className="absolute inset-0 border border-rose-400/70 rounded-sm z-10" />}
                  {heart && (
                    <span className="absolute inset-0 flex items-center justify-center text-[11px] z-10">❤️</span>
                  )}
                  <div className="absolute top-0.5 right-0.5 z-10 flex flex-col gap-[1.5px] items-center justify-center w-3 h-3">
                    {[0,1,2].map((d) => (
                      <span key={d} className={`w-[2px] h-[2px] rounded-full ${comment ? 'bg-accent' : 'bg-white/50'}`} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-1.5">
              <span className="text-[6px] bg-rose-500/20 text-rose-300 px-1.5 py-0.5 rounded-full font-medium">3 ❤️ liked</span>
              <span className="text-[6px] bg-yellow-500/20 text-yellow-300 px-1.5 py-0.5 rounded-full font-medium">2 ✏️ edits</span>
            </div>
          </StepShell>
          <StepLabel n={3} title="Client picks favourites" body="Heart to keep, pencil to retouch. Comments per photo. You see every selection live." />
          <div className="hidden lg:flex absolute -right-3 top-24 z-10 w-6 h-6 items-center justify-center rounded-full bg-border border border-border text-accent text-xs font-bold">›</div>
        </div>

        {/* Step 4 — Deliver */}
        <div className="relative bg-bg border border-border rounded-2xl p-5 hover:border-accent/40 hover:-translate-y-1 transition-all duration-300">
          <StepShell>
            <div className="flex gap-1 mb-2">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="flex-1 aspect-square rounded-sm bg-white/5 relative overflow-hidden">
                  {mockupPhotos[i + 3] && (
                    <Image src={mockupPhotos[i + 3]} alt={`final ${i + 1}`} fill className="object-cover" sizes="50px" />
                  )}
                  <div className="absolute inset-0 bg-green-500/10" />
                </div>
              ))}
            </div>
            <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-2 mb-1.5">
              <div className="flex items-center gap-1 mb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                <span className="text-[8px] text-green-400 font-bold">Finals ready to deliver</span>
              </div>
              <div className="text-[7px] text-muted/70 mb-2 truncate">Rajesh_Wedding_Edited.zip · 1.2 GB</div>
              <div className="bg-accent rounded text-[7px] font-bold text-[#0B0F1A] text-center py-1">
                Download for print lab
              </div>
            </div>
            <div className="flex items-center gap-1">
              <svg className="w-2.5 h-2.5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" d="M12 6v6l4 2"/></svg>
              <span className="text-[7px] text-muted">Link expires in </span>
              <span className="text-[7px] text-accent font-bold">7 days</span>
            </div>
          </StepShell>
          <StepLabel n={4} title="Print-ready delivery" body="Upload your edited finals. Generate a 7-day secure download link for your print lab. Job done." />
        </div>

      </div>
    </div>
  )
}
