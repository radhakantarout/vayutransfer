'use client'

import { useState, useEffect } from 'react'
import ReceiveUploadForm from '@/components/ReceiveUploadForm'
import { CheckCircleIcon, ClockIcon } from '@/components/icons'

interface Props {
  requestId: string
}

type State = 'loading' | 'pending' | 'uploading' | 'fulfilled' | 'expired' | 'cancelled' | 'error'

export default function ReceivePageContent({ requestId }: Props) {
  const [state, setState] = useState<State>('loading')
  const [message, setMessage] = useState<string | undefined>()
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    fetch(`/api/receive/${requestId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setMessage(data.data.message)
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
