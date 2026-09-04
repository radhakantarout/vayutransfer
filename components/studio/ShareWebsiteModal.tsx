'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

interface Props {
  url: string
  studioName: string
  onClose: () => void
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

function ShareIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
    </svg>
  )
}

// A permanent, always-valid public URL (unlike the client-gallery share
// links elsewhere in this app, which are per-project tokens with expiry) —
// so this modal has no "generate a link" step at all, just ready-to-use
// share actions the moment it opens. QR is generated once on mount, cached
// in state for the lifetime of the modal.
export default function ShareWebsiteModal({ url, studioName, onClose }: Props) {
  const [copied, setCopied] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState('')

  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(url, { width: 480, margin: 2, color: { dark: '#0B0F1A', light: '#FFFFFF' } })
      .then(d => { if (!cancelled) setQrDataUrl(d) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [url])

  const copyLink = async () => {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const shareMessage = `Check out our photography website — ${studioName}\n${url}`
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`
  const smsHref = `sms:?&body=${encodeURIComponent(shareMessage)}`
  const emailHref = `mailto:?subject=${encodeURIComponent(`${studioName} — our photography website`)}&body=${encodeURIComponent(shareMessage)}`

  const handlePrint = () => {
    if (!qrDataUrl) return
    const w = window.open('', '_blank', 'width=480,height=640')
    if (!w) return
    w.document.write(`<!DOCTYPE html><html><head><title>${escapeHtml(studioName)} — Website QR</title>
      <style>
        body { font-family: system-ui, -apple-system, sans-serif; text-align: center; padding: 48px 24px; }
        h1 { font-size: 34px; font-weight: 800; margin: 0; letter-spacing: -0.01em; }
        img { width: 420px; height: 420px; margin: 32px auto; display: block; }
        p.url { font-size: 13px; color: #555; word-break: break-all; margin-top: 8px; }
        p.powered { font-size: 11px; color: #999; margin-top: 28px; letter-spacing: 0.02em; }
      </style></head>
      <body>
        <h1>${escapeHtml(studioName)}</h1>
        <img src="${qrDataUrl}" alt="QR code" />
        <p class="url">${escapeHtml(url)}</p>
        <p class="powered">Powered by VayuStudios</p>
      </body></html>`)
    w.document.close()
    setTimeout(() => { try { w.print() } catch { /* window may already be closed */ } }, 300)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <div>
            <h2 className="text-sm font-bold text-text-primary">Share your website</h2>
            <p className="text-[11px] text-muted mt-0.5 truncate">{studioName}</p>
          </div>
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded-lg text-muted hover:text-text-primary hover:bg-border/60 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* QR — always on a white card regardless of app theme, since a
              dark background behind a dark-foreground QR would stop scanning. */}
          <div className="flex justify-center">
            <div className="bg-white rounded-2xl p-3 shadow-sm">
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrDataUrl} alt="Website QR code" className="w-40 h-40" />
              ) : (
                <div className="w-40 h-40 flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
          </div>

          {/* Link + copy */}
          <div className="flex items-center gap-2 bg-bg border border-border rounded-xl px-3 py-2.5">
            <span className="flex-1 text-xs text-text-primary truncate">{url}</span>
            <button onClick={copyLink}
              className="flex-shrink-0 text-[11px] font-bold text-accent hover:underline">
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>

          {/* Share row */}
          <div className="flex items-center gap-1.5">
            <a href={whatsappHref} target="_blank" rel="noopener noreferrer" title="Share via WhatsApp"
              className="flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border border-border text-green-500 hover:bg-green-500/10 transition-colors">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.198.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                <path d="M12 2C6.477 2 2 6.477 2 12c0 1.9.525 3.68 1.438 5.2L2 22l4.938-1.396A9.94 9.94 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18.148a8.11 8.11 0 01-4.13-1.13l-.296-.176-3.05.862.833-3.037-.192-.311A8.113 8.113 0 013.89 12c0-4.478 3.632-8.11 8.11-8.11 4.477 0 8.11 3.632 8.11 8.11 0 4.477-3.633 8.148-8.11 8.148z" />
              </svg>
              <span className="text-[10px] font-semibold">WhatsApp</span>
            </a>
            <a href={smsHref} title="Share via message"
              className="flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border border-border text-accent hover:bg-accent/10 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              <span className="text-[10px] font-semibold">Message</span>
            </a>
            <a href={emailHref} title="Share via email"
              className="flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border border-border text-muted hover:text-text-primary hover:bg-border/40 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25H4.5a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5H4.5a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.909a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
              <span className="text-[10px] font-semibold">Email</span>
            </a>
          </div>

          {/* Large printable QR button — the headline action for studios who
              want a physical poster/card (e.g. at their studio counter or a
              wedding reception desk) rather than a digital share. */}
          <button onClick={handlePrint} disabled={!qrDataUrl}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-accent text-bg text-sm font-bold hover:bg-accent/90 disabled:opacity-50 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
            </svg>
            Print QR Poster
          </button>
        </div>
      </div>
    </div>
  )
}
