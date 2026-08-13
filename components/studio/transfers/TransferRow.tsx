'use client'

import { useState } from 'react'
import type { StudioTransfer } from '@/types/studio'
import PhotoActionsMenu from '@/components/studio/PhotoActionsMenu'
import Tooltip from '@/components/studio/Tooltip'
import TransferDestinationPicker from './TransferDestinationPicker'
import TransferExtendPopover from './TransferExtendPopover'
import TransferResharePopover from './TransferResharePopover'
import TransferDeleteConfirm from './TransferDeleteConfirm'
import DownloadActivityPopover from './DownloadActivityPopover'
import ReceiveProgressCard from './ReceiveProgressCard'
import { SendIcon, ReceiveIcon, CopyLinkIcon, ReshareIcon, ExtendIcon, DetailsIcon, MoreIcon, MoveIcon, CopyToIcon, DeleteIcon, ImportIcon, DownloadStatIcon, FileTypeIcon } from './TransferIcons'
import { fmtBytes, fmtExact, fmtRelative, fmtExpiryCountdown, derivedStatus, STATUS_META, fileKindFromMime } from './transferUtils'

type Popover = 'extend' | 'reshare' | 'delete' | 'download' | null

interface Props {
  transfer: StudioTransfer
  projectId: string
  clientName: string
  clientEmail: string
  clientPhone: string
  onChanged: () => void
  onOpenDetail: () => void
}

export default function TransferRow({ transfer: t, projectId, clientName, clientEmail, clientPhone, onChanged, onOpenDetail }: Props) {
  const [popover, setPopover] = useState<Popover>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [picker, setPicker] = useState<'move' | 'copy' | null>(null)

  const status = derivedStatus(t)
  const meta = STATUS_META[status]
  const kind = fileKindFromMime(t.mimeType)
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
    if (res.success) onChanged()
    return res
  }

  const overflowActions = [
    { label: 'Move to event', icon: <MoveIcon className="w-3.5 h-3.5" />, onClick: () => setPicker('move') },
    ...(t.status === 'READY'
      ? [{ label: 'Copy to event', icon: <CopyToIcon className="w-3.5 h-3.5" />, onClick: () => setPicker('copy') }]
      : []),
    ...(!t.importedToGallery
      ? [{ label: 'Delete', icon: <DeleteIcon className="w-3.5 h-3.5" />, onClick: () => setPopover('delete'), danger: true }]
      : []),
  ]

  return (
    <div className="group border border-border rounded-xl p-3.5 space-y-2 hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:-translate-y-px transition-all duration-150">
      <div className="flex items-start justify-between gap-3">
        <button onClick={onOpenDetail} className="flex items-start gap-3 min-w-0 flex-1 text-left">
          <span className={`w-9 h-9 flex-shrink-0 rounded-lg flex items-center justify-center ${
            t.direction === 'SEND' ? 'bg-accent/10 text-accent' : 'bg-success/10 text-success'
          }`}>
            <FileTypeIcon kind={kind} className="w-4.5 h-4.5" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${
                t.direction === 'SEND' ? 'text-accent bg-accent/10 border-accent/20' : 'text-success bg-success/10 border-success/20'
              }`}>
                {t.direction === 'SEND' ? <SendIcon className="w-2.5 h-2.5" /> : <ReceiveIcon className="w-2.5 h-2.5" />}
                {t.direction === 'SEND' ? 'Sent' : 'Received'}
              </span>
              <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${meta.className}`}>
                {meta.label}
              </span>
              {t.importedToGallery && (
                <span className="text-[10px] font-bold text-success">✓ In gallery</span>
              )}
            </div>
            <div className="text-sm font-semibold text-text-primary mt-1 truncate max-w-[240px]">
              {t.filename ?? (t.direction === 'RECEIVE' ? 'Waiting for upload…' : '—')}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted mt-0.5 flex-wrap">
              <span>{fmtBytes(t.sizeBytes)}</span>
              <span>·</span>
              <span title={fmtExact(t.createdAt)}>{fmtRelative(t.createdAt)}</span>
              {t.status === 'READY' && (
                <>
                  <span>·</span>
                  <span className={status === 'EXPIRING_SOON' || isExpired ? 'text-yellow-500 font-semibold' : ''}>
                    {fmtExpiryCountdown(t)}
                  </span>
                </>
              )}
              {t.direction === 'SEND' && (
                <>
                  <span>·</span>
                  <button onClick={(e) => { e.stopPropagation(); setPopover(popover === 'download' ? null : 'download') }}
                    className="flex items-center gap-1 hover:text-text-primary transition-colors relative">
                    <DownloadStatIcon className="w-3 h-3" />
                    {t.downloadCount}
                    {popover === 'download' && <DownloadActivityPopover transfer={t} onClose={() => setPopover(null)} />}
                  </button>
                </>
              )}
            </div>
          </div>
        </button>
      </div>

      {error && <p className="text-[11px] text-danger">{error}</p>}

      {t.direction === 'RECEIVE' && t.status === 'UPLOADING' && (
        <ReceiveProgressCard transfer={t} projectId={projectId} onChanged={onChanged} />
      )}

      {t.direction === 'RECEIVE' && t.status === 'READY' && !t.importedToGallery && (
        <button onClick={importToGallery} disabled={busy}
          className="flex items-center gap-1.5 text-xs bg-accent text-bg font-bold px-3 py-1.5 rounded-lg hover:bg-accent/90 disabled:opacity-50 transition-colors">
          <ImportIcon className="w-3.5 h-3.5" />
          {busy ? 'Importing…' : 'Import to Gallery'}
        </button>
      )}

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150">
        {canShare && !isExpired && (
          <>
            <Tooltip label="Copy link">
              <button onClick={copyLink}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-text-primary hover:bg-border/50 transition-colors">
                {copied ? <span className="text-[10px] font-bold text-success">✓</span> : <CopyLinkIcon className="w-3.5 h-3.5" />}
              </button>
            </Tooltip>
            <div className="relative">
              <Tooltip label="Reshare">
                <button onClick={() => setPopover(popover === 'reshare' ? null : 'reshare')}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-text-primary hover:bg-border/50 transition-colors">
                  <ReshareIcon className="w-3.5 h-3.5" />
                </button>
              </Tooltip>
              {popover === 'reshare' && (
                <TransferResharePopover transfer={t} isExpired={false} resendBusy={busy} onResend={resend} onClose={() => setPopover(null)} />
              )}
            </div>
            <div className="relative">
              <Tooltip label="Extend">
                <button onClick={() => setPopover(popover === 'extend' ? null : 'extend')}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-text-primary hover:bg-border/50 transition-colors">
                  <ExtendIcon className="w-3.5 h-3.5" />
                </button>
              </Tooltip>
              {popover === 'extend' && (
                <TransferExtendPopover transfer={t} busy={busy} onExtend={extend} onClose={() => setPopover(null)} />
              )}
            </div>
          </>
        )}
        {canShare && isExpired && (
          <div className="relative">
            <button onClick={() => setPopover(popover === 'extend' ? null : 'extend')}
              className="flex items-center gap-1.5 text-xs bg-accent text-bg font-bold px-3 py-1.5 rounded-lg hover:bg-accent/90 transition-colors">
              <ExtendIcon className="w-3.5 h-3.5" />
              Extend
            </button>
            {popover === 'extend' && (
              <TransferExtendPopover transfer={t} busy={busy} onExtend={extend} onClose={() => setPopover(null)} />
            )}
          </div>
        )}
        {isExpired && (
          <Tooltip label="Reshare">
            <button onClick={() => setPopover(popover === 'reshare' ? null : 'reshare')}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-text-primary hover:bg-border/50 transition-colors relative">
              <ReshareIcon className="w-3.5 h-3.5" />
              {popover === 'reshare' && (
                <TransferResharePopover transfer={t} isExpired resendBusy={busy} onResend={resend} onClose={() => setPopover(null)} />
              )}
            </button>
          </Tooltip>
        )}
        <Tooltip label="Details">
          <button onClick={onOpenDetail}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-text-primary hover:bg-border/50 transition-colors">
            <DetailsIcon className="w-3.5 h-3.5" />
          </button>
        </Tooltip>
        <div className="relative">
          <PhotoActionsMenu
            actions={overflowActions}
            trigger={
              <span className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-text-primary hover:bg-border/50 transition-colors">
                <MoreIcon className="w-3.5 h-3.5" />
              </span>
            }
          />
          {popover === 'delete' && (
            <TransferDeleteConfirm busy={busy} onConfirm={deleteTransfer} onCancel={() => setPopover(null)} />
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
