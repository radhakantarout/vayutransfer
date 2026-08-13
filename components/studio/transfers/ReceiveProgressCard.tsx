'use client'

// RECEIVE-direction counterpart to UploadTrackerCard — but since the
// anonymous uploader's browser never reports live progress, this is an
// on-demand "Check progress" button (rate-limited server-side to once per
// RECEIVE_PROGRESS_CHECK_COOLDOWN_MS) showing average speed + a buffered
// ETA from the last check, not a live percent bar.

import { useEffect, useState } from 'react'
import type { StudioTransfer } from '@/types/studio'
import { RECEIVE_PROGRESS_CHECK_COOLDOWN_MS } from '@/lib/studio/transferConfig'
import { estimateReceiveProgress, fmtBytes, fmtEta, fmtExact, fmtCooldown } from './transferUtils'
import { ReceiveIcon, SpeedIcon } from './TransferIcons'

interface Props {
  transfer: StudioTransfer
  projectId: string
  onChanged: () => void
}

export default function ReceiveProgressCard({ transfer: t, projectId, onChanged }: Props) {
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, setTick] = useState(0)

  const lastCheckMs = t.lastProgressCheckAt ? new Date(t.lastProgressCheckAt).getTime() : 0
  const cooldownRemainingMs = Math.max(RECEIVE_PROGRESS_CHECK_COOLDOWN_MS - (Date.now() - lastCheckMs), 0)
  const onCooldown = lastCheckMs > 0 && cooldownRemainingMs > 0

  // Live-updates the "check again in mm:ss" countdown and re-enables the
  // button once the cooldown elapses, without a full refetch.
  useEffect(() => {
    if (!onCooldown) return
    const timer = setInterval(() => setTick(v => v + 1), 1000)
    return () => clearInterval(timer)
  }, [onCooldown])

  const estimate = estimateReceiveProgress(t)

  const checkProgress = async () => {
    setChecking(true); setError(null)
    const res = await fetch(`/studio/api/admin/projects/${projectId}/transfers/${t.transferId}/check-receive-progress`, { method: 'POST' }).then(r => r.json())
    setChecking(false)
    if (!res.success) { setError(res.message ?? 'Could not check progress'); return }
    onChanged()
  }

  return (
    <div className="border border-border rounded-xl px-4 py-3 space-y-2.5">
      <div className="flex items-center gap-2.5">
        <span className="w-8 h-8 flex-shrink-0 rounded-lg bg-success/10 text-success flex items-center justify-center animate-pulse">
          <ReceiveIcon className="w-4 h-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm text-text-primary font-medium">Waiting on the other side to finish uploading</div>
          {estimate ? (
            <div className="flex items-center gap-2.5 text-[11px] text-muted mt-0.5 flex-wrap">
              <span>{fmtBytes(estimate.uploadedBytes)} / {fmtBytes(estimate.totalBytes)} ({estimate.percent}%)</span>
              <span className="flex items-center gap-1"><SpeedIcon className="w-3 h-3" />~{fmtBytes(estimate.speedBps)}/s avg</span>
              <span>~{fmtEta(estimate.etaSecondsBuffered)}</span>
            </div>
          ) : (
            <div className="text-[11px] text-muted mt-0.5">No progress checked yet.</div>
          )}
        </div>
      </div>

      {estimate && (
        <p className="text-[10px] text-muted">Last checked {fmtExact(estimate.checkedAt)} — estimate only, includes a buffer</p>
      )}
      {error && <p className="text-[11px] text-danger">{error}</p>}

      <button onClick={checkProgress} disabled={checking || onCooldown}
        className="w-full text-xs font-semibold text-text-primary border border-border rounded-lg px-3 py-2 hover:bg-border/40 disabled:opacity-50 transition-colors">
        {checking ? 'Checking…' : onCooldown ? `Check again in ${fmtCooldown(cooldownRemainingMs)}` : 'Check progress'}
      </button>
    </div>
  )
}
