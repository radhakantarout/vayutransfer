'use client'

import { useState, useEffect } from 'react'
import ReceiveUploadForm from '@/components/ReceiveUploadForm'
import { CheckCircleIcon, ClockIcon, FolderIcon, PackageIcon, InboxIcon, ChevronDownIcon } from '@/components/icons'

interface Props {
  requestId: string
}

type State = 'loading' | 'pending' | 'uploading' | 'fulfilled' | 'expired' | 'cancelled' | 'error'

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(bytes % (1024 * 1024 * 1024) === 0 ? 0 : 1)} GB`
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`
}

export default function ReceivePageContent({ requestId }: Props) {
  const [state, setState] = useState<State>('loading')
  const [requestTitle, setRequestTitle] = useState<string | undefined>()
  const [message, setMessage] = useState<string | undefined>()
  const [maxSizeBytes, setMaxSizeBytes] = useState<number | undefined>()
  const [accessMode, setAccessMode] = useState<'anyone' | 'invited' | undefined>()
  const [expiryTime, setExpiryTime] = useState<string | undefined>()
  const [errorMsg, setErrorMsg] = useState('')
  // Shows the branded request-preview card first (matching what the
  // requester previewed on their own "share" screen) — the actual
  // dropzone/upload form only appears once the uploader commits by
  // clicking "Upload Files", instead of dropping straight into a bare
  // file picker.
  const [started, setStarted] = useState(false)

  useEffect(() => {
    fetch(`/api/receive/${requestId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setRequestTitle(data.data.requestTitle)
          setMessage(data.data.message)
          setMaxSizeBytes(data.data.maxSizeBytes)
          setAccessMode(data.data.accessMode)
          setExpiryTime(data.data.expiryTime)
          setState(data.data.status as State)
        } else {
          setState('error')
          setErrorMsg(data.message ?? 'This receive link is not available')
        }
      })
      .catch(() => { setState('error'); setErrorMsg('Network error') })
  }, [requestId])

  if (state === 'loading') {
    return (
      <div className="bg-card border border-border rounded-2xl p-8 text-center space-y-3">
        <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
        <div className="text-muted text-sm">Loading...</div>
      </div>
    )
  }

  if (state === 'fulfilled') {
    return (
      <div className="bg-card border border-border rounded-2xl p-8 text-center space-y-3">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-success/10 text-success flex items-center justify-center">
          <CheckCircleIcon className="w-7 h-7" />
        </div>
        <div className="text-text-primary font-semibold text-lg">Already delivered</div>
        <div className="text-muted text-sm">This receive link has already been used.</div>
      </div>
    )
  }

  if (state === 'expired') {
    return (
      <div className="bg-card border border-danger/40 rounded-2xl p-8 text-center space-y-3">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-danger/10 text-danger flex items-center justify-center">
          <ClockIcon className="w-7 h-7" />
        </div>
        <div className="text-danger font-semibold text-lg">Link Expired</div>
        <div className="text-muted text-sm">This receive link is no longer accepting uploads.</div>
      </div>
    )
  }

  if (state === 'uploading' || state === 'cancelled' || state === 'error') {
    return (
      <div className="bg-card border border-border rounded-2xl p-8 text-center space-y-3">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-accent/10 text-accent flex items-center justify-center">
          <ClockIcon className="w-7 h-7" />
        </div>
        <div className="text-text-primary font-semibold text-lg">
          {state === 'uploading' ? 'Someone else is uploading right now' : 'Not available'}
        </div>
        <div className="text-muted text-sm">{errorMsg || 'Please check back in a few minutes.'}</div>
      </div>
    )
  }

  if (!started) {
    const expiryDays = expiryTime ? Math.max(1, Math.ceil((new Date(expiryTime).getTime() - Date.now()) / (24 * 60 * 60 * 1000))) : undefined
    return (
      <div className="bg-card border border-border rounded-2xl p-6 text-center space-y-3">
        <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted">
          <div className="w-4 h-4 rounded-full bg-accent flex items-center justify-center flex-shrink-0">
            <CheckCircleIcon className="w-2.5 h-2.5 text-bg" />
          </div>
          VayuTransfer Request
        </div>
        <div className="w-14 h-14 mx-auto rounded-2xl bg-yellow-500/15 text-yellow-500 flex items-center justify-center">
          <FolderIcon className="w-7 h-7" />
        </div>
        <div>
          <div className="font-bold text-text-primary text-lg">{requestTitle || 'Files requested'}</div>
          {message && <p className="text-xs text-muted mt-1.5 leading-relaxed">{message}</p>}
        </div>
        <div className="text-left text-xs text-muted space-y-1.5 max-w-[240px] mx-auto pt-1">
          {maxSizeBytes && (
            <div className="flex items-center gap-1.5"><PackageIcon className="w-3.5 h-3.5 flex-shrink-0" /> Accepts up to {formatBytes(maxSizeBytes)}</div>
          )}
          <div className="flex items-center gap-1.5"><InboxIcon className="w-3.5 h-3.5 flex-shrink-0" /> {accessMode === 'invited' ? 'Only invited people can upload' : 'Anyone with the link can upload'}</div>
          {expiryDays !== undefined && (
            <div className="flex items-center gap-1.5"><ChevronDownIcon className="w-3.5 h-3.5 flex-shrink-0 rotate-180" /> Expires in {expiryDays} {expiryDays === 1 ? 'day' : 'days'}</div>
          )}
        </div>
        <button
          onClick={() => setStarted(true)}
          className="w-full bg-gradient-to-r from-accent to-[#7C3AED] text-white font-bold py-3.5 rounded-xl hover:opacity-90 transition-opacity mt-2"
        >
          Upload Files
        </button>
        <div className="text-[10px] text-muted pt-1">vayutransfer.com</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {message && (
        <div className="bg-card border border-border rounded-xl px-4 py-3 text-sm text-text-primary">
          <span className="text-muted">Message: </span>{message}
        </div>
      )}
      <ReceiveUploadForm requestId={requestId} />
    </div>
  )
}
