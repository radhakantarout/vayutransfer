'use client'

// Slide-in detail panel — rendered as a sibling flex column by RawTransfersTab
// (which shrinks the list to make room, never covers it). Same action set as
// the row, but always visible here rather than hover-gated, since this is
// the "I clicked in for detail" context.

import { useState } from 'react'
import type { StudioTransfer } from '@/types/studio'
import TransferPreview from './TransferPreview'
import TransferDestinationPicker from './TransferDestinationPicker'
import TransferExtendPopover from './TransferExtendPopover'
import TransferResharePopover from './TransferResharePopover'
import TransferDeleteConfirm from './TransferDeleteConfirm'
import UploadTrackerCard from './UploadTrackerCard'
import ReceiveProgressCard from './ReceiveProgressCard'
import { CopyLinkIcon, ReshareIcon, ExtendIcon, MoveIcon, CopyToIcon, DeleteIcon, ImportIcon, CloseIcon } from './TransferIcons'
import { fmtBytes, fmtExact, fmtRelative, derivedStatus, STATUS_META, type SendProgress } from './transferUtils'

type Popover = 'extend' | 'reshare' | 'delete' | null

interface Props {
  transfer: StudioTransfer
  projectId: string
  clientName: string
  clientEmail: string
  clientPhone: string
  onClose: () => void
  onChanged: () => void
  // Set only when this specific transfer is the one actively being uploaded
  // in this browser session right now (matched by transferId in the parent)
  // — shows the same live tracker here as the action bar, per request.
  sendProgress?: SendProgress | null
  onCancelSend?: () => void
}

export default function TransferDetailPanel({ transfer: t, projectId, clientName, clientEmail, clientPhone, onClose, onChanged, sendProgress, onCancelSend }: Props) {
  const [popover, setPopover] = useState<Popover>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [picker, setPicker] = useState<'move' | 'copy' | null>(null)

  const status = derivedStatus(t)
  const meta = STATUS_META[status]
  const canShare = t.status === 'READY' || (t.direction === 'RECEIVE' && t.status === 'PENDING')
  const isExpired = status === 'EXPIRED'

  const api = (path: string, init?: RequestInit) =>
    fetch(`/studio/api/admin/projects/${projectId}/transfers/${t.transferId}${path}`, init).then(r => r.json())

  const copyLink = async () => {
    const base = process.env.NEXT_PUBLIC_STUDIO_URL ?? 'https://studio.vayutransfer.com'
    const url = `${base}/studio/transfer/${t.direction === 'SEND' ? 'send' : 'receive'}/${t.shareToken}`
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const extend = async (additionalDays: number) => {
    setBusy(true); setError(null)
    const res = await api('/extend', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ additionalDays }) })
    setBusy(false); setPopover(null)
    if (!res.success) { setError(res.message ?? 'Could not extend link'); return }
    onChanged()
  }

  const resend = async () => {
    setBusy(true); setError(null)
    const res = await api('/resend', { method: 'POST' })
    setBusy(false)
    if (!res.success) { setError(res.message ?? 'Could not regenerate link'); return }
    setPopover(null)
    onChanged()
  }

  const deleteTransfer = async () => {
    setBusy(true); setError(null)
    const res = await api('', { method: 'DELETE' })
    setBusy(false); setPopover(null)
    if (!res.success) { setError(res.message ?? 'Could not delete transfer'); return }
    onChanged()
    onClose()
  }

  const importToGallery = async () => {
    setBusy(true); setError(null)
    const res = await api('/import', { method: 'POST' })
    setBusy(false)
    if (!res.success) { setError(res.message ?? 'Could not import to gallery'); return }
    onChanged()
  }

  const moveOrCopy = async (targetProjectId: string): Promise<{ success: boolean; message?: string }> => {
    const res = await api(`/${picker}`, {
      method: picker === 'move' ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetProjectId }),
    })
    if (res.success) { onChanged(); if (picker === 'move') onClose() }
    return res
  }

  return (
    <div className="w-[380px] flex-shrink-0 border-l border-border bg-card sticky top-4 self-start max-h-[calc(100vh-120px)] overflow-y-auto animate-[slidein_180ms_ease-out]">
      <style>{`@keyframes slidein { from { transform: translateX(16px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }`}</style>
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-border">
        <h3 className="text-sm font-bold text-text-primary">Transfer details</h3>
        <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-text-primary hover:bg-border/60 transition-colors">
          <CloseIcon className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {sendProgress ? (
          <UploadTrackerCard sendProgress={sendProgress} onCancelSend={onCancelSend ?? (() => {})} />
        ) : t.direction === 'RECEIVE' && t.status === 'UPLOADING' ? (
          <ReceiveProgressCard transfer={t} projectId={projectId} onChanged={onChanged} />
        ) : (
          <TransferPreview transfer={t} projectId={projectId} />
        )}

        {error && <p className="text-[11px] text-danger">{error}</p>}

        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${
            t.direction === 'SEND' ? 'text-accent bg-accent/10 border-accent/20' : 'text-success bg-success/10 border-success/20'
          }`}>
            {t.direction === 'SEND' ? 'Sent' : 'Received'}
          </span>
          <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${meta.className}`}>
            {meta.label}
          </span>
          {t.importedToGallery && <span className="text-[10px] font-bold text-success">✓ In gallery</span>}
        </div>

        <div className="text-sm font-semibold text-text-primary break-all">{t.filename ?? 'Waiting for upload…'}</div>

        <dl className="text-xs space-y-1.5">
          <div className="flex justify-between"><dt className="text-muted">Size</dt><dd className="text-text-primary font-medium">{fmtBytes(t.sizeBytes)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Type</dt><dd className="text-text-primary font-medium">{t.mimeType ?? '—'}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Created</dt><dd className="text-text-primary font-medium" title={fmtExact(t.createdAt)}>{fmtRelative(t.createdAt)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Expiry</dt><dd className="text-text-primary font-medium" title={fmtExact(t.shareExpiresAt)}>{fmtExact(t.shareExpiresAt)}</dd></div>
          {t.note && <div className="flex justify-between gap-2"><dt className="text-muted flex-shrink-0">Note</dt><dd className="text-text-primary font-medium italic text-right">"{t.note}"</dd></div>}
        </dl>

        {t.direction === 'SEND' && (
          <div className="border-t border-border pt-3">
            <div className="text-xs font-bold text-text-primary mb-1">Download activity</div>
            <p className="text-xs text-muted">
              {t.downloadCount} download{t.downloadCount !== 1 ? 's' : ''}
              {t.lastDownloadedAt && <> · last {fmtRelative(t.lastDownloadedAt)}</>}
            </p>
          </div>
        )}

        {t.direction === 'RECEIVE' && t.status === 'READY' && !t.importedToGallery && (
          <button onClick={importToGallery} disabled={busy}
            className="w-full flex items-center justify-center gap-1.5 text-xs bg-accent text-bg font-bold px-3 py-2 rounded-lg hover:bg-accent/90 disabled:opacity-50 transition-colors">
            <ImportIcon className="w-3.5 h-3.5" />
            {busy ? 'Importing…' : 'Import to Gallery'}
          </button>
        )}

        <div className="border-t border-border pt-3 space-y-2">
          {canShare && !isExpired && (
            <>
              <button onClick={copyLink}
                className="w-full flex items-center gap-2 text-xs font-semibold text-text-primary border border-border rounded-lg px-3 py-2 hover:bg-border/40 transition-colors">
                <CopyLinkIcon className="w-3.5 h-3.5" />{copied ? 'Copied!' : 'Copy link'}
              </button>
              <div className="relative">
                <button onClick={() => setPopover(popover === 'reshare' ? null : 'reshare')}
                  className="w-full flex items-center gap-2 text-xs font-semibold text-text-primary border border-border rounded-lg px-3 py-2 hover:bg-border/40 transition-colors">
                  <ReshareIcon className="w-3.5 h-3.5" />Reshare
                </button>
                {popover === 'reshare' && <TransferResharePopover transfer={t} isExpired={false} resendBusy={busy} onResend={resend} onClose={() => setPopover(null)} />}
              </div>
              <div className="relative">
                <button onClick={() => setPopover(popover === 'extend' ? null : 'extend')}
                  className="w-full flex items-center gap-2 text-xs font-semibold text-text-primary border border-border rounded-lg px-3 py-2 hover:bg-border/40 transition-colors">
                  <ExtendIcon className="w-3.5 h-3.5" />Extend
                </button>
                {popover === 'extend' && <TransferExtendPopover transfer={t} busy={busy} onExtend={extend} onClose={() => setPopover(null)} />}
              </div>
            </>
          )}
          {canShare && isExpired && (
            <div className="relative">
              <button onClick={() => setPopover(popover === 'extend' ? null : 'extend')}
                className="w-full flex items-center justify-center gap-2 text-xs font-bold bg-accent text-bg rounded-lg px-3 py-2 hover:bg-accent/90 transition-colors">
                <ExtendIcon className="w-3.5 h-3.5" />Extend
              </button>
              {popover === 'extend' && <TransferExtendPopover transfer={t} busy={busy} onExtend={extend} onClose={() => setPopover(null)} />}
            </div>
          )}
          {isExpired && (
            <div className="relative">
              <button onClick={() => setPopover(popover === 'reshare' ? null : 'reshare')}
                className="w-full flex items-center gap-2 text-xs font-semibold text-text-primary border border-border rounded-lg px-3 py-2 hover:bg-border/40 transition-colors">
                <ReshareIcon className="w-3.5 h-3.5" />Reshare
              </button>
              {popover === 'reshare' && <TransferResharePopover transfer={t} isExpired resendBusy={busy} onResend={resend} onClose={() => setPopover(null)} />}
            </div>
          )}
          <button onClick={() => setPicker('move')}
            className="w-full flex items-center gap-2 text-xs font-semibold text-text-primary border border-border rounded-lg px-3 py-2 hover:bg-border/40 transition-colors">
            <MoveIcon className="w-3.5 h-3.5" />Move to event
          </button>
          {t.status === 'READY' && (
            <button onClick={() => setPicker('copy')}
              className="w-full flex items-center gap-2 text-xs font-semibold text-text-primary border border-border rounded-lg px-3 py-2 hover:bg-border/40 transition-colors">
              <CopyToIcon className="w-3.5 h-3.5" />Copy to event
            </button>
          )}
          {!t.importedToGallery && (
            <div className="relative">
              <button onClick={() => setPopover(popover === 'delete' ? null : 'delete')}
                className="w-full flex items-center gap-2 text-xs font-semibold text-danger border border-danger/30 rounded-lg px-3 py-2 hover:bg-danger/10 transition-colors">
                <DeleteIcon className="w-3.5 h-3.5" />Delete
              </button>
              {popover === 'delete' && <TransferDeleteConfirm busy={busy} onConfirm={deleteTransfer} onCancel={() => setPopover(null)} />}
            </div>
          )}
        </div>
      </div>

      {picker && (
        <TransferDestinationPicker
          title={`${picker === 'move' ? 'Move' : 'Copy'} transfer to`}
          clientName={clientName}
          clientEmail={clientEmail}
          clientPhone={clientPhone}
          mode="same-client-siblings"
          excludeProjectIds={[projectId]}
          onClose={() => setPicker(null)}
          onChoose={moveOrCopy}
        />
      )}
    </div>
  )
}
