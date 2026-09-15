'use client'

import { useEffect, useState } from 'react'

const GRADIENT = 'linear-gradient(135deg,#f97316,#ec4899,#8b5cf6)'
const DISMISSED_KEY = 'moments-a2hs-dismissed'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type Platform = 'android' | 'ios' | null

function isStandaloneAlready() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

function detectIOS() {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/i.test(ua)) return true
  // iPadOS 13+ reports as "MacIntel" in the UA string — only a real touch
  // device with that platform string can be an iPad, a desktop Mac never has
  // maxTouchPoints > 1.
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

// Mounted once inside an actual opened gallery (app/studio/moments/[projectId]/page.tsx)
// — never on the Moments hub/list, search, profile, or join/register pages —
// so it only ever appears once a user has "started accessing" a gallery, per
// the product ask. Handles both service-worker registration (required by
// some browsers for install-eligibility) and the banner itself.
export default function InstallPrompt() {
  const [platform, setPlatform] = useState<Platform>(null)
  const [visible, setVisible] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/moments-sw.js', { scope: '/studio/moments/' }).catch(() => {})
    }

    if (isStandaloneAlready() || localStorage.getItem(DISMISSED_KEY)) return

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setPlatform('android')
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)

    let timer: ReturnType<typeof setTimeout> | undefined
    if (detectIOS()) {
      setPlatform('ios')
      timer = setTimeout(() => setVisible(true), 2000)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      if (timer) clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    if (platform === 'android' && deferredPrompt) {
      const timer = setTimeout(() => setVisible(true), 2000)
      return () => clearTimeout(timer)
    }
  }, [platform, deferredPrompt])

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1')
    setVisible(false)
  }

  const install = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    await deferredPrompt.userChoice
    dismiss()
  }

  if (!visible || !platform) return null

  return (
    <div className="fixed z-[95] left-4 right-4 bottom-20 md:left-auto md:right-6 md:bottom-6 md:w-96">
      <div className="bg-card border border-border rounded-3xl shadow-2xl p-4 flex gap-3 items-start">
        <div
          className="w-11 h-11 rounded-2xl flex-shrink-0 flex items-center justify-center text-lg"
          style={{ background: GRADIENT }}
        >
          ✨
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-text-primary">Keep this moment close ✨</p>
          <p className="text-xs text-muted mt-0.5 leading-relaxed">
            Add vayustudio Moments to your home screen for quicker access.
          </p>

          {platform === 'ios' ? (
            <div className="mt-3 flex items-center gap-2 text-xs text-muted bg-bg/60 border border-border rounded-xl px-3 py-2">
              <span className="text-base leading-none">📤</span>
              <span>Tap <strong className="text-text-primary">Share</strong>, then <strong className="text-text-primary">Add to Home Screen</strong></span>
            </div>
          ) : null}

          <div className="mt-3 flex items-center gap-2">
            {platform === 'android' && (
              <button
                onClick={install}
                className="px-4 py-1.5 rounded-full text-xs font-bold text-white"
                style={{ background: GRADIENT }}
              >
                Install
              </button>
            )}
            <button onClick={dismiss} className="px-4 py-1.5 rounded-full text-xs font-semibold text-muted hover:bg-border/50">
              {platform === 'ios' ? 'Got it' : 'Not now'}
            </button>
          </div>
        </div>
        <button onClick={dismiss} className="w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-full hover:bg-border/60 text-muted text-sm">✕</button>
      </div>
    </div>
  )
}
