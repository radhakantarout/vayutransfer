'use client'

// Static "how a transfer moves" explainer — mirrors VayuTransfer's own
// homepage section (components/home/HowItWorksSection.tsx), same layout
// (numbered badges on a connecting line), VayuStudios-flavored copy: no
// wallet/₹ mentions, storage-quota + auto-resume framing instead. Shown only
// on the idle (nothing picked yet) state, same as VayuTransfer keeps it on
// the marketing page rather than mid-flow.

const STEPS = [
  { n: '01', title: 'Pick & tag', body: 'Drop in photos or videos, or a whole folder, and tag the event they belong to.' },
  { n: '02', title: 'Carried, uninterrupted', body: 'Uploads in parallel, chunk by chunk. If your connection drops, it automatically retries — and resumes right where it left off if you come back later.' },
  { n: '03', title: 'Shared, ready to import', body: 'Get a link valid for up to 20 days. Once they upload, one click imports it straight into that event’s gallery.' },
]

export default function RawTransferHowItWorks() {
  return (
    <div className="max-w-4xl mx-auto pt-4">
      <p className="text-[11px] font-bold text-accent uppercase tracking-widest text-center">How a transfer moves</p>
      <h2 className="text-2xl sm:text-3xl font-bold text-text-primary text-center mt-1">Three steps, start to finish.</h2>
      <p className="text-sm text-muted text-center mt-2 max-w-md mx-auto">
        No wallet, no per-GB charges — Raw Transfer runs on your existing VayuStudios storage.
      </p>

      <div className="relative grid grid-cols-1 sm:grid-cols-3 gap-6 mt-8">
        <div className="hidden sm:block absolute top-9 left-[16.6%] right-[16.6%] h-px bg-gradient-to-r from-transparent via-border to-transparent" />
        {STEPS.map(step => (
          <div key={step.n} className="relative text-center sm:text-left space-y-2">
            <div className="w-[72px] h-[72px] mx-auto sm:mx-0 rounded-2xl bg-card border border-border shadow-sm flex items-center justify-center font-mono text-lg font-bold text-accent">
              {step.n}
            </div>
            <h3 className="text-sm font-bold text-text-primary">{step.title}</h3>
            <p className="text-xs text-muted leading-relaxed">{step.body}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
