'use client'

import { describeAccuracy } from '@/lib/studio/faceAccuracy'

interface Props {
  value: number
  onChange: (level: number) => void
  label?: string
}

// Single 0-100 dial standing in for the two technical Rekognition knobs
// (QualityFilter at index time, FaceMatchThreshold at search time) — see
// lib/studio/faceAccuracy.ts for the mapping and reasoning.
export default function AccuracySlider({ value, onChange, label = 'AI accuracy' }: Props) {
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
