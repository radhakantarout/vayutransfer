'use client'

import { describeAccuracy } from '@/lib/studio/faceAccuracy'

interface Props {
  value: number
  onChange: (level: number) => void
  label?: string
  // Single-row layout (label + thin track + value, no caption row, no
  // description) — for tight spots like the Start Sorting picker, which
  // already has a mode selector and other controls competing for height.
  compact?: boolean
}

// Single 0-100 dial standing in for the two technical Rekognition knobs
// (QualityFilter at index time, FaceMatchThreshold at search time) — see
// lib/studio/faceAccuracy.ts for the mapping and reasoning.
export default function AccuracySlider({ value, onChange, label = 'AI accuracy', compact = false }: Props) {
  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <label className="text-[11px] font-semibold text-muted whitespace-nowrap flex-shrink-0">{label}</label>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="flex-1 h-1 rounded-full appearance-none bg-border accent-accent cursor-pointer"
        />
        <span className="text-[11px] font-bold text-accent w-6 text-right flex-shrink-0">{value}</span>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-muted">{label}</label>
        <span className="text-xs font-bold text-accent">{value}</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none bg-border accent-accent cursor-pointer"
      />
      <div className="flex items-center justify-between text-[9px] text-muted">
        <span>More matches</span>
        <span>Fewer, more precise</span>
      </div>
      <p className="text-[11px] text-muted text-center">{describeAccuracy(value)}</p>
    </div>
  )
}
