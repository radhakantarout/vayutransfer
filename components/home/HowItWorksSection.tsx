const STEPS = [
  {
    n: '01',
    title: 'Upload',
    body: 'Drag in files, a whole folder, or ask someone else to send you one. Every transfer is a flat ₹4.99/GB of its exact size — that’s the only charge, ever. New accounts start with ₹50 free credit.',
  },
  {
    n: '02',
    title: 'Carried, uninterrupted',
    body: 'Multiple files upload individually, not zipped — folder structure stays intact. If your connection drops mid-upload, it picks up exactly where it stopped.',
  },
  {
    n: '03',
    title: 'Shared, unlimited',
    body: 'Get a link that stays live for up to 19 days. Anyone with it can download as many times as they need — completely free, no limit shown or hit.',
  },
]

export default function HowItWorksSection() {
  return (
    <section className="py-20 md:py-24">
      <div className="max-w-xl mb-14 animate-fade-up">
        <div className="font-mono text-xs uppercase tracking-widest text-accent/80 mb-3">How a transfer moves</div>
        <h2 className="font-display text-3xl md:text-[2.5rem] font-bold leading-tight text-text-primary text-balance">
          Three steps, start to finish.
        </h2>
        <p className="mt-3.5 text-muted text-base leading-relaxed">
          No installs, no accounts required. A transfer moves through exactly one path, every time — nothing to configure and nothing to guess.
        </p>
      </div>

      <div className="relative grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="hidden md:block absolute top-9 left-[12%] right-[12%] h-px bg-gradient-to-r from-transparent via-border to-transparent" />
        {STEPS.map((step, i) => (
          <div key={step.n} className={`relative animate-fade-up${i === 1 ? '-delay' : i === 2 ? '-delay-2' : ''}`}>
            <div className="relative z-10 w-[72px] h-[72px] rounded-2xl bg-card border border-border flex items-center justify-center font-mono text-xl font-semibold text-accent mb-5 shadow-sm">
              {step.n}
            </div>
            <h3 className="font-display text-lg font-semibold text-text-primary mb-2">{step.title}</h3>
            <p className="text-sm text-muted leading-relaxed">{step.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
