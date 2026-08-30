import type { WebsiteTestimonial } from '@/types/studio'

// Grid-only, no section chrome — each template wraps this in its own
// <section> with its own heading style, same pattern as PortfolioGallery
// (just the grid/lightbox, heading supplied by the caller). Renders nothing
// when a site has no testimonials yet, so every existing site is unaffected.
export default function Testimonials({
  testimonials, accent, fontColor,
}: {
  testimonials?: WebsiteTestimonial[]
  accent: string
  fontColor: string
}) {
  if (!testimonials || testimonials.length === 0) return null

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {testimonials.map(t => (
        <div key={t.id}
          className="rounded-2xl p-6 border transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
          style={{ borderColor: `${accent}33`, background: `${accent}0a` }}>
          {!!t.rating && (
            <div className="flex gap-0.5 mb-3" style={{ color: accent }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <span key={i} style={{ opacity: i < t.rating! ? 1 : 0.25 }}>★</span>
              ))}
            </div>
          )}
          <p className="text-sm leading-relaxed opacity-80 mb-4" style={{ color: fontColor }}>&ldquo;{t.quote}&rdquo;</p>
          <p className="text-xs font-semibold" style={{ color: fontColor }}>{t.name}</p>
          {t.eventType && (
            <p className="text-[10px] opacity-50 uppercase tracking-widest mt-0.5" style={{ color: fontColor }}>{t.eventType}</p>
          )}
        </div>
      ))}
    </div>
  )
}
