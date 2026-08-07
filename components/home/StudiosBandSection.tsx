import { ArrowRightIcon, ImageIcon } from '@/components/icons'

const STUDIO_URL = process.env.NEXT_PUBLIC_STUDIO_URL ?? `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/studio/home`

export default function StudiosBandSection() {
  return (
    <section className="py-10 md:py-14">
      <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-8 md:p-12 flex flex-col md:flex-row items-center justify-between gap-10 animate-fade-up">
        <div
          className="absolute w-80 h-80 rounded-full pointer-events-none -right-24 -top-24"
          style={{ background: 'radial-gradient(circle, rgb(var(--accent) / 0.14), transparent 70%)' }}
        />
        <div className="relative z-10 max-w-lg text-center md:text-left">
          <div className="font-mono text-xs uppercase tracking-widest text-accent/80 mb-3">For photographers &amp; videographers</div>
          <h2 className="font-display text-2xl md:text-[1.9rem] font-bold leading-tight text-text-primary text-balance">
            Shot the wedding? Try VayuStudios.
          </h2>
          <p className="mt-3.5 text-sm md:text-[15px] text-muted leading-relaxed">
            A companion product built for the way you deliver work — private galleries, clients who pick their own favourites, and a link that feels like your brand, not a file dump.
          </p>
          <a
            href={STUDIO_URL}
            className="inline-flex items-center gap-2 mt-6 bg-accent text-bg font-bold text-sm px-6 py-3.5 rounded-2xl hover:opacity-90 transition-opacity"
          >
            Explore VayuStudios
            <ArrowRightIcon className="w-4 h-4" />
          </a>
        </div>
        <div className="relative z-10 hidden sm:flex gap-3.5">
          {[{ r: -8, y: 10 }, { r: 4, y: -8 }, { r: -3, y: 14 }].map((t, i) => (
            <div
              key={i}
              className="w-[100px] h-[136px] rounded-2xl border border-border bg-bg flex items-center justify-center shadow-lg"
              style={{ transform: `rotate(${t.r}deg) translateY(${t.y}px)`, zIndex: i === 1 ? 2 : 1 }}
            >
              <ImageIcon className="w-7 h-7 text-muted" />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
