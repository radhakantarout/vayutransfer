import { ImageIcon, VideoIcon, DocumentTextIcon, ArchiveIcon } from '@/components/icons'

// Decorative only — files "carried on the wind" from one side to the
// other, sitting in its own region above the real dropzone. Pure CSS
// (motion-path + keyframes in globals.css), no JS, so it can't interfere
// with actual drag-and-drop. Hidden on mobile and for reduced-motion users.
export default function WindAnimation() {
  return (
    <div className="wind-stage hidden md:block" aria-hidden="true">
      <svg viewBox="0 0 1200 220" preserveAspectRatio="none">
        <defs>
          <linearGradient id="windPathGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity="0" />
            <stop offset="20%" stopColor="rgb(var(--accent))" />
            <stop offset="80%" stopColor="rgb(var(--accent))" />
            <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path className="wind-path" d="M -20 160 C 200 40, 380 220, 600 80 S 960 40, 1180 130" />
        <path className="wind-path wind-path-2" d="M -20 185 C 220 90, 400 240, 630 110 S 980 90, 1190 165" />
      </svg>

      <div className="wind-chip wc-1"><ImageIcon /></div>
      <div className="wind-chip wc-2"><VideoIcon /></div>
      <div className="wind-chip wc-3"><DocumentTextIcon /></div>
      <div className="wind-chip wc-4"><ArchiveIcon /></div>
    </div>
  )
}
