// Lightweight hover tooltip — native `title` attributes have a long,
// browser-controlled delay (~1s+) before they appear, which felt sluggish
// on the selection bar's small icon buttons. This shows in 150ms instead,
// via a CSS-only opacity/scale transition on a named hover group (no JS
// timers, no state).
export default function Tooltip({ label, position = 'top', children }: { label: string; position?: 'top' | 'bottom'; children: React.ReactNode }) {
  return (
    <span className="relative inline-flex group/tip">
      {children}
      <span
        className={`pointer-events-none absolute left-1/2 -translate-x-1/2 ${position === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'}
          whitespace-nowrap rounded-md bg-nav text-white text-[10px] font-semibold px-2 py-1 shadow-lg z-[110]
          opacity-0 scale-95 group-hover/tip:opacity-100 group-hover/tip:scale-100 transition-all duration-100 delay-150`}
      >
        {label}
      </span>
    </span>
  )
}
