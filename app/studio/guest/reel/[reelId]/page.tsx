'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'

type PageState = 'loading' | 'generating' | 'ready' | 'failed' | 'not_found'

// Public, unauthenticated — the whole point is a guest can bookmark/share
// this link to themselves via WhatsApp and reopen it anytime with no
// login. See app/studio/api/guest/reel/[reelId]/route.ts for the access
// model (unguessable reelId, scoped to guest-sourced reels only).
export default function GuestReelSharePage() {
  const { reelId } = useParams<{ reelId: string }>()
  const [state, setState] = useState<PageState>('loading')
  const [outputUrl, setOutputUrl] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false
    const check = () => {
      fetch(`/studio/api/guest/reel/${reelId}`)
        .then((r) => r.json())
        .then((res) => {
          if (cancelled) return
          if (!res.success) { setState('not_found'); return }
          if (res.data.status === 'completed') {
            setOutputUrl(res.data.outputUrl)
            setState('ready')
          } else if (res.data.status === 'failed') {
            setErrorMessage(res.data.errorMessage)
            setState('failed')
          } else {
            setState('generating')
            pollRef.current = setTimeout(check, 5000)
          }
        })
        .catch(() => { if (!cancelled) setState('not_found') })
    }
    check()
    return () => { cancelled = true; if (pollRef.current) clearTimeout(pollRef.current) }
  }, [reelId])

  const shareUrl = typeof window !== 'undefined' ? window.location.href : ''

  const handleShare = async () => {
    const shareData = { title: 'My AI Reel', text: 'Check out my reel! 🎬✨', url: shareUrl }
    if (navigator.share) {
      await navigator.share(shareData).catch(() => {})
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(`${shareData.text} ${shareUrl}`)}`, '_blank')
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4 py-10">
      <div className="max-w-sm w-full bg-card border border-border rounded-3xl p-6 space-y-5">
        <div className="text-center space-y-1">
          <div className="text-3xl">🎬</div>
          <h1 className="text-lg font-bold text-text-primary">Your AI Reel</h1>
        </div>

        {state === 'loading' && (
          <div className="flex justify-center py-14">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {state === 'generating' && (
          <div className="text-center space-y-3 py-10">
            <div className="w-10 h-10 mx-auto border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted">Still being created — this page will update automatically.</p>
          </div>
        )}

        {state === 'not_found' && (
          <div className="text-center space-y-2 py-10">
            <div className="text-3xl">🔗</div>
            <p className="text-sm text-muted">This reel link isn't valid or has expired.</p>
          </div>
        )}

        {state === 'failed' && (
          <div className="text-center space-y-2 py-10">
            <div className="text-3xl">😕</div>
            <p className="text-sm text-muted">{errorMessage ?? 'This reel could not be created.'}</p>
          </div>
        )}

        {state === 'ready' && outputUrl && (
          <div className="space-y-4">
            <div className="aspect-[9/16] max-h-[60vh] mx-auto rounded-2xl overflow-hidden bg-black">
              <video src={outputUrl} controls autoPlay className="w-full h-full object-contain" />
            </div>
            <div className="flex gap-3">
              <a href={outputUrl} download className="flex-1 border border-border text-text-primary text-sm font-semibold py-3 rounded-xl hover:bg-border transition-colors text-center">Download</a>
              <button onClick={handleShare} className="flex-1 bg-accent text-bg text-sm font-bold py-3 rounded-xl hover:bg-accent/90 transition-colors">Share</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
