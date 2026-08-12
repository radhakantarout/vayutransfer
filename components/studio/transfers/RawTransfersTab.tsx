'use client'

// Owns all Raw Transfers state/data-fetching for the host project — the tab
// is inherently single-project (see EventSection's own Props comment), so
// the list here is always scoped to `project.projectId` even though Send/
// Request can target a different event via the destination picker. Mounted
// only while the tab is active (EventSection conditionally renders this),
// so there's no separate "is this tab active" gate to manage internally.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { StudioProject, StudioTransfer } from '@/types/studio'
import { CHUNK_SIZE, uploadFileInChunks, type PartRecord } from '@/lib/studio/clientUpload'
import TransferActionBar from './TransferActionBar'
import TransferList from './TransferList'
import TransferDetailPanel from './TransferDetailPanel'
import type { SendProgress } from './transferUtils'

interface Props {
  project: StudioProject
  activeSourceProjects: StudioProject[]
}

export default function RawTransfersTab({ project, activeSourceProjects }: Props) {
  const [transfers, setTransfers] = useState<StudioTransfer[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [selected, setSelected] = useState<StudioTransfer | null>(null)
  const [sendBusy, setSendBusy] = useState(false)
  const [sendProgress, setSendProgress] = useState<SendProgress | null>(null)
  const [requestBusy, setRequestBusy] = useState(false)
  // Tracks the currently-active send so Cancel can reach it — the R2
  // uploadId is only ever known client-side (never persisted on the
  // transfer record, same as the regular gallery upload flow).
  const activeSendRef = useRef<{ projectId: string; transferId: string; uploadId: string } | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const loadTransfers = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/studio/api/admin/projects/${project.projectId}/transfers`).then(r => r.json())
    if (res.success) setTransfers(res.data.transfers)
    setLoading(false)
  }, [project.projectId])

  useEffect(() => { loadTransfers() }, [loadTransfers])

  // Poll while anything is still PENDING/UPLOADING for this project.
  useEffect(() => {
    const active = (transfers ?? []).some(t => t.status === 'PENDING' || t.status === 'UPLOADING')
    if (!active) return
    const timer = setInterval(loadTransfers, 5000)
    return () => clearInterval(timer)
  }, [transfers, loadTransfers])

  // Keep the open detail panel in sync with the list — and close it if the
  // transfer it's showing was moved out of this project or deleted.
  useEffect(() => {
    if (!selected) return
    const fresh = (transfers ?? []).find(t => t.transferId === selected.transferId)
    setSelected(fresh ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transfers])

  const sendTransferFile = async (file: File, targetProjectId: string) => {
    setError(null); setActionMessage(null)
    setSendBusy(true)
    setSendProgress({ filename: file.name, percent: 0, uploadedBytes: 0, totalBytes: file.size, speedBps: 0, etaSeconds: 0 })
    const partCount = Math.ceil(file.size / CHUNK_SIZE)
    const startedAt = Date.now()
    const abortController = new AbortController()
    abortControllerRef.current = abortController

    try {
      const initRes = await fetch(`/studio/api/admin/projects/${targetProjectId}/transfers`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction: 'SEND', filename: file.name, mimeType: file.type, sizeBytes: file.size, partCount }),
      }).then(r => r.json())
      if (!initRes.success) throw new Error(initRes.message ?? 'Could not start upload')
      const { transferId, uploadId, presignedUrls } = initRes.data
      activeSendRef.current = { projectId: targetProjectId, transferId, uploadId }
      setSendProgress(prev => prev ? { ...prev, transferId } : prev)
      // The transfer row already exists server-side (status UPLOADING) the
      // moment initRes resolves — refresh now so it's clickable in the list
      // right away, letting the admin open its detail panel mid-upload and
      // see this same tracker there (see TransferDetailPanel).
      if (targetProjectId === project.projectId) loadTransfers()

      const parts: PartRecord[] = await uploadFileInChunks(file, presignedUrls, [], (uploadedBytes, partsDone) => {
        const elapsedSec = Math.max((Date.now() - startedAt) / 1000, 0.001)
        const speedBps = uploadedBytes / elapsedSec
        const etaSeconds = speedBps > 0 ? Math.max(file.size - uploadedBytes, 0) / speedBps : 0
        setSendProgress({
          transferId,
          filename: file.name,
          percent: Math.round((partsDone / partCount) * 100),
          uploadedBytes, totalBytes: file.size, speedBps, etaSeconds,
        })
      }, abortController.signal)

      const completeRes = await fetch(`/studio/api/admin/projects/${targetProjectId}/transfers/${transferId}/upload-complete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId, parts }),
      }).then(r => r.json())
      if (!completeRes.success) throw new Error(completeRes.message ?? 'Could not finish upload')

      setSendProgress(null)
      if (targetProjectId === project.projectId) await loadTransfers()
      else setActionMessage('Sent — this transfer will appear in the target event\'s Raw Transfers tab.')
    } catch (err) {
      setSendProgress(null)
      if (err instanceof DOMException && err.name === 'AbortError') {
        setActionMessage('Upload cancelled.')
      } else {
        setError(err instanceof Error ? err.message : 'Upload failed')
      }
    } finally {
      setSendBusy(false)
      activeSendRef.current = null
      abortControllerRef.current = null
    }
  }

  const cancelSend = async () => {
    const active = activeSendRef.current
    abortControllerRef.current?.abort()
    if (!active) return
    // Best-effort cleanup — abort the R2 multipart upload and delete the
    // half-created transfer record. The upload loop's own AbortError catch
    // above already resets sendProgress/sendBusy regardless of how this call
    // turns out, so a failure here just leaves an orphaned dangling upload
    // for the daily cron/manual cleanup rather than blocking the user.
    await fetch(`/studio/api/admin/projects/${active.projectId}/transfers/${active.transferId}/abort`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uploadId: active.uploadId }),
    }).catch(() => {})
    if (active.projectId === project.projectId) loadTransfers()
  }

  const requestTransferFile = async (targetProjectId: string) => {
    setRequestBusy(true)
    setError(null); setActionMessage(null)
    const res = await fetch(`/studio/api/admin/projects/${targetProjectId}/transfers`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ direction: 'RECEIVE' }),
    }).then(r => r.json())
    setRequestBusy(false)
    if (!res.success) { setError(res.message ?? 'Could not create request link'); return }
    if (targetProjectId === project.projectId) await loadTransfers()
    else setActionMessage('Request link created — it will appear in the target event\'s Raw Transfers tab.')
  }

  return (
    <div className="flex items-start">
      <div className="flex-1 min-w-0 p-5 space-y-4">
        <p className="text-xs text-muted">
          Send large RAW files to anyone, or request one back — no login required for the other side, no watermarking.
        </p>

        {error && <div className="bg-danger/10 border border-danger/30 rounded-xl px-4 py-3 text-sm text-danger">{error}</div>}
        {actionMessage && <div className="bg-success/10 border border-success/30 rounded-xl px-4 py-3 text-sm text-success">{actionMessage}</div>}

        <TransferActionBar
          project={project}
          activeSourceProjects={activeSourceProjects}
          sendBusy={sendBusy}
          sendProgress={sendProgress}
          requestBusy={requestBusy}
          onSend={sendTransferFile}
          onRequest={requestTransferFile}
          onCancelSend={cancelSend}
        />

        <TransferList
          transfers={transfers}
          loading={loading}
          projectId={project.projectId}
          clientName={project.clientName}
          clientEmail={project.clientEmail}
          clientPhone={project.clientPhone}
          onChanged={loadTransfers}
          onOpenDetail={setSelected}
        />
      </div>

      {selected && (
        <TransferDetailPanel
          transfer={selected}
          projectId={project.projectId}
          clientName={project.clientName}
          clientEmail={project.clientEmail}
          clientPhone={project.clientPhone}
          onClose={() => setSelected(null)}
          onChanged={loadTransfers}
          sendProgress={sendProgress?.transferId === selected.transferId ? sendProgress : null}
          onCancelSend={cancelSend}
        />
      )}
    </div>
  )
}
