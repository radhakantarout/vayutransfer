'use client'

// Raw Transfer's "Request" page — mirrors VayuTransfer's RequestFlow.tsx
// shape (options → created, ending in a shareable link + QR + copy button),
// simplified to match what VayuStudios' receive-transfer actually supports
// today: no invited-email tracking, no notify-on-upload toggle — those
// don't exist server-side, so this page doesn't pretend they do. Like Send,
// every request still requires tagging an event via the same studio-wide
// TransferDestinationPicker.

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import type { StudioProject } from '@/types/studio'
import TransferDestinationPicker from './TransferDestinationPicker'
import { useRawTransfers } from './useRawTransfers'

type Step = 'idle' | 'created'

export default function RawTransferRequestFlow() {
  const { resolveProject } = useRawTransfers()
  const [step, setStep] = useState<Step>('idle')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [target, setTarget] = useState<StudioProject | null>(null)
  const [shareUrl, setShareUrl] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (step !== 'created' || !shareUrl) return
    QRCode.toDataURL(shareUrl, { width: 240, margin: 2, color: { dark: '#0B0F1A', light: '#FFFFFF' } })
      .then(setQrDataUrl).catch(() => {})
  }, [step, shareUrl])

  const createRequest = async (targetProjectId: string): Promise<{ success: boolean; message?: string }> => {
    setBusy(true); setError(null)
    const [chosen, res] = await Promise.all([
      resolveProject(targetProjectId),
      fetch(`/studio/api/admin/projects/${targetProjectId}/transfers`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction: 'RECEIVE' }),
      }).then(r => r.json()),
    ])
    setBusy(false)
    if (!res.success) { setError(res.message ?? 'Could not create request link'); return { success: false, message: res.message } }
    setTarget(chosen)
    setShareUrl(res.data.shareUrl)
    setStep('created')
    return { success: true }
  }

  const copyLink = async () => {
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const reset = () => {
    setStep('idle'); setShareUrl(''); setQrDataUrl(''); setTarget(null); setError(null)
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-text-primary">Request a file.</h1>
        <p className="text-sm text-muted">Get a RAW photo or video sent back to you — no login required for the other side.</p>
      </div>

      {step === 'idle' ? (
        <div className="bg-card border border-border rounded-2xl p-8 text-center space-y-4">
          <div className="text-4xl">📥</div>
          <p className="text-sm text-muted">Create a link, tag it to an event, and share it with whoever has the file.</p>
          {error && <p className="text-xs text-danger">{error}</p>}
          <button onClick={() => setPickerOpen(true)} disabled={busy}
            className="bg-accent text-bg text-sm font-bold px-6 py-3 rounded-xl hover:bg-accent/90 disabled:opacity-60 transition-colors">
            {busy ? 'Creating…' : 'Create Request Link'}
          </button>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl p-6 space-y-5 text-center">
          <div className="text-4xl">✓</div>
          <div>
            <p className="text-sm font-semibold text-text-primary">Request link ready</p>
            {target && (
              <p className="text-xs text-muted mt-0.5">Tagged to {target.clientName} · {(target.eventType ?? '').replace(/_/g, ' ')}</p>
            )}
          </div>

          {qrDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt="QR code" className="mx-auto rounded-xl border border-border" width={180} height={180} />
          )}

          <div className="flex items-center gap-2">
            <input readOnly value={shareUrl}
              className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-xs text-text-primary" />
            <button onClick={copyLink}
              className="flex-shrink-0 bg-accent text-bg text-xs font-bold px-3 py-2 rounded-lg hover:bg-accent/90 transition-colors">
              {copied ? 'Copied!' : 'Copy Link'}
            </button>
          </div>

          <div className="flex items-center justify-center gap-4 text-xs">
            <a href="/studio/dashboard/transfers/manage" className="text-accent font-semibold hover:underline">View in My Transfers</a>
            <button onClick={reset} className="text-muted font-semibold hover:text-text-primary transition-colors">Create another</button>
          </div>
        </div>
      )}

      {pickerOpen && (
        <TransferDestinationPicker
          title="Request file into"
          mode="studio-wide"
          onClose={() => setPickerOpen(false)}
          onChoose={createRequest}
        />
      )}
    </div>
  )
}
