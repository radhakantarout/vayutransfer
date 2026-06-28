'use client'

import { useEffect, useState } from 'react'

type Platform = 'ios' | 'android' | 'other'

export default function InAppBrowserGuard() {
  const [show, setShow]           = useState(false)
  const [platform, setPlatform]   = useState<Platform>('other')
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const ua = navigator.userAgent

    const isIOS     = /iphone|ipad|ipod/i.test(ua)
    const isAndroid = /android/i.test(ua)

    // Known in-app browser signatures
    const knownApp =
      ua.includes('FBAN') || ua.includes('FBAV') ||        // Facebook
      ua.includes('Instagram') ||
      /\bTwitter\b/i.test(ua) ||
      ua.includes('WhatsApp') ||
      ua.includes('Snapchat') ||
      ua.includes('TikTok') ||
      ua.includes('MicroMessenger') ||                     // WeChat
      ua.includes('Line/')

    // Generic WebView detection
    const androidWebView = isAndroid && /wv\)/.test(ua)
    // iOS in-app: has Mobile/Safari base but no "Safari" version token
    const iosInApp = isIOS && !ua.includes('Safari')

    if (knownApp || androidWebView || iosInApp) {
      setShow(true)
      setPlatform(isIOS ? 'ios' : isAndroid ? 'android' : 'other')
    }
  }, [])

  if (!show || dismissed) return null

  const url  = typeof window !== 'undefined' ? window.location.href : ''
  // Android intent URL opens the current page directly in Chrome
  const intentUrl = url.replace(/^https?:\/\//, 'intent://') +
    '#Intent;scheme=https;package=com.android.chrome;end'

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-end justify-end bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-card rounded-3xl overflow-hidden shadow-2xl">

        {/* Top section */}
        <div className="px-6 pt-6 pb-4">
          <div className="text-4xl mb-3">🌐</div>
          <h2 className="text-base font-bold text-text-primary mb-2">Open in your browser</h2>
          <p className="text-sm text-muted leading-relaxed">
            {platform === 'ios'
              ? 'You\'re viewing this inside an app. For the best experience and to save your photos, open it in Safari.'
              : 'You\'re viewing this inside an app. Open in Chrome to download and share your photos properly.'}
          </p>
        </div>

        {/* Android — one-tap open in Chrome */}
        {platform === 'android' && (
          <a
            href={intentUrl}
            className="mx-4 mb-3 flex items-center justify-center gap-2 bg-accent text-bg text-sm font-bold py-3.5 rounded-2xl hover:bg-accent/90 active:scale-[0.98] transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
            Open in Chrome
          </a>
        )}

        {/* iOS — step-by-step instructions */}
        {platform === 'ios' && (
          <div className="mx-4 mb-3 bg-border/30 rounded-2xl divide-y divide-border/50">
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="text-text-primary font-bold text-base">1</span>
              <p className="text-sm text-muted">
                Tap the <span className="font-semibold text-text-primary">Share</span> icon{' '}
                <span className="font-bold text-text-primary">⎙</span> at the bottom of the screen
              </p>
            </div>
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="text-text-primary font-bold text-base">2</span>
              <p className="text-sm text-muted">
                Scroll down and tap{' '}
                <span className="font-semibold text-text-primary">Open in Safari</span>
              </p>
            </div>
          </div>
        )}

        {/* Dismiss */}
        <button
          onClick={() => setDismissed(true)}
          className="w-full py-3.5 text-sm text-muted hover:text-text-primary transition-colors border-t border-border"
        >
          Continue anyway
        </button>
      </div>
    </div>
  )
}
