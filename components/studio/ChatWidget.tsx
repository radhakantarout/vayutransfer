'use client'

import { useState, useRef, useEffect } from 'react'

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  isError?: boolean
}

const SUGGESTIONS = [
  'How do I share photos with my client?',
  'How does the booking form work?',
  'How do clients download their photos?',
  'Can clients select their favourite photos?',
]

const WHATSAPP_URL = 'https://wa.me/918984769522'

export default function ChatWidget() {
  const [open, setOpen]           = useState(false)
  const [messages, setMessages]   = useState<Message[]>([])
  const [input, setInput]         = useState('')
  const [streaming, setStreaming] = useState(false)
  const bottomRef    = useRef<HTMLDivElement>(null)
  const inputRef     = useRef<HTMLInputElement>(null)
  const messagesRef  = useRef<Message[]>([])

  useEffect(() => { messagesRef.current = messages }, [messages])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 320)
  }, [open])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const invokeBedrock = async (payload: { role: string; content: string }[], aId: string) => {
    try {
      const res = await fetch('/studio/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: payload }),
      })

      if (!res.ok || !res.body) throw new Error('non-ok')

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        setMessages(m => m.map(msg => msg.id === aId ? { ...msg, content: msg.content + chunk } : msg))
      }
    } catch {
      setMessages(m => m.map(msg => msg.id === aId ? { ...msg, isError: true, content: '' } : msg))
    } finally {
      setStreaming(false)
    }
  }

  const send = async (text: string) => {
    if (!text.trim() || streaming) return
    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: text.trim() }
    const updated = [...messagesRef.current, userMsg]
    setMessages(updated)
    setInput('')
    setStreaming(true)
    const aId = `a-${Date.now()}`
    setMessages(m => [...m, { id: aId, role: 'assistant', content: '' }])
    await invokeBedrock(updated.map(m => ({ role: m.role, content: m.content })).slice(-10), aId)
  }

  const retry = async (errorMsgId: string) => {
    if (streaming) return
    const withoutError = messagesRef.current.filter(m => m.id !== errorMsgId)
    const newAId = `a-retry-${Date.now()}`
    setMessages([...withoutError, { id: newAId, role: 'assistant', content: '' }])
    setStreaming(true)
    const payload = withoutError.map(m => ({ role: m.role, content: m.content })).slice(-10)
    await invokeBedrock(payload, newAId)
  }

  return (
    <>
      {/* ── Panel ── */}
      <div
        className={`
          fixed right-4 sm:right-6 z-40
          w-[calc(100vw-2rem)] sm:w-[360px]
          bg-card border border-border rounded-2xl shadow-2xl
          flex flex-col overflow-hidden
          transition-all duration-300 ease-out origin-bottom-right
          ${open
            ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 scale-95 translate-y-4 pointer-events-none'}
        `}
        style={{ bottom: '8.5rem', maxHeight: 'min(520px, calc(100vh - 10rem))' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-accent flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <SparkleIcon size={16} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-white leading-snug">VayuStudios AI</p>
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-300 animate-pulse" />
                <p className="text-[10px] text-white/70">Replies instantly</p>
              </div>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">

          {/* Welcome */}
          {messages.length === 0 && (
            <div className="space-y-3">
              <div className="flex gap-2 items-start">
                <BotAvatar />
                <div className="bg-bg border border-border/60 rounded-2xl rounded-tl-sm px-4 py-3 max-w-[260px]">
                  <p className="text-sm font-semibold text-text-primary mb-1">Hi there! 👋</p>
                  <p className="text-xs text-muted leading-relaxed">
                    I'm the VayuStudios assistant. Ask me anything about features, how-tos, or getting started.
                  </p>
                </div>
              </div>
              <p className="text-[10px] text-muted px-1">Quick questions:</p>
              <div className="space-y-1.5">
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="w-full text-left text-xs px-3.5 py-2.5 rounded-xl border border-border bg-bg text-text-primary hover:border-accent/50 hover:bg-accent/5 hover:text-accent transition-all duration-150"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message bubbles */}
          {messages.map(msg => (
            <div
              key={msg.id}
              className={`flex gap-2 items-end ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && <BotAvatar />}

              {msg.isError ? (
                <ErrorCard onRetry={() => retry(msg.id)} />
              ) : (
                <div
                  className={`
                    max-w-[240px] text-sm leading-relaxed rounded-2xl px-4 py-2.5
                    ${msg.role === 'user'
                      ? 'bg-accent text-white rounded-br-sm'
                      : 'bg-bg border border-border/60 text-text-primary rounded-bl-sm'}
                  `}
                >
                  {msg.content === '' && streaming
                    ? <TypingDots />
                    : <span className="whitespace-pre-wrap break-words">{msg.content}</span>
                  }
                </div>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* WhatsApp link — appears after a few messages */}
        {messages.filter(m => !m.isError).length >= 4 && (
          <div className="px-4 py-2.5 border-t border-border/60 bg-bg/60 flex-shrink-0">
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs font-medium text-[#25D366] hover:text-[#128C7E] transition-colors"
            >
              <WhatsAppMiniIcon />
              Need more help? Talk to our team on WhatsApp
            </a>
          </div>
        )}

        {/* Input */}
        <div className="px-3 py-3 border-t border-border flex-shrink-0">
          <form onSubmit={e => { e.preventDefault(); send(input) }} className="flex gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask me anything…"
              disabled={streaming}
              className="flex-1 min-w-0 bg-bg border border-border rounded-xl px-3.5 py-2.5 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent/60 transition-colors disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || streaming}
              className="w-10 h-10 flex-shrink-0 bg-accent rounded-xl flex items-center justify-center text-white hover:bg-accent/90 disabled:opacity-40 active:scale-95 transition-all"
            >
              <SendIcon />
            </button>
          </form>
          <p className="text-center text-[9px] text-muted/50 mt-2">Powered by Claude AI</p>
        </div>
      </div>

      {/* ── Trigger button ── */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`
          fixed bottom-24 right-4 sm:right-6 z-40
          flex items-center gap-2 px-4 py-2.5
          bg-accent text-white rounded-full
          shadow-[0_4px_16px_rgba(0,0,0,0.2)]
          hover:bg-accent/90 hover:shadow-[0_6px_24px_rgba(0,0,0,0.25)]
          hover:scale-105 active:scale-95
          transition-all duration-200
        `}
        aria-label={open ? 'Close AI chat' : 'Open AI chat'}
      >
        <span className={`transition-transform duration-300 ${open ? 'rotate-180' : 'rotate-0'}`}>
          {open ? <ChevronDownIcon /> : <SparkleIcon size={16} className="text-white" />}
        </span>
        <span className="text-sm font-semibold">{open ? 'Close' : 'Ask AI'}</span>
      </button>
    </>
  )
}

/* ── Sub-components ── */

function ErrorCard({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="max-w-[260px] bg-bg border border-border/60 rounded-2xl rounded-bl-sm px-4 py-3">
      <div className="flex items-start gap-2 mb-3">
        <span className="text-sm mt-0.5">⚠️</span>
        <p className="text-sm text-text-primary leading-relaxed">
          I'm having trouble connecting right now. You can try again or reach our team directly.
        </p>
      </div>
      <div className="flex items-center gap-4">
        <button
          onClick={onRetry}
          className="text-xs font-semibold text-accent hover:text-accent/70 transition-colors"
        >
          Try again
        </button>
        <a
          href={WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs font-semibold text-[#25D366] hover:text-[#128C7E] transition-colors"
        >
          <WhatsAppMiniIcon />
          WhatsApp support
        </a>
      </div>
    </div>
  )
}

function BotAvatar() {
  return (
    <div className="w-6 h-6 rounded-full bg-accent/15 flex items-center justify-center flex-shrink-0 mb-0.5">
      <SparkleIcon size={12} className="text-accent" />
    </div>
  )
}

function TypingDots() {
  return (
    <span className="flex items-center gap-1 py-0.5">
      {[0, 150, 300].map(delay => (
        <span
          key={delay}
          className="w-1.5 h-1.5 rounded-full bg-muted animate-bounce"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  )
}

function SparkleIcon({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  )
}

function ChevronDownIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
}

function WhatsAppMiniIcon() {
  return (
    <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.38 5.07L2 22l5.07-1.38C8.42 21.5 10.15 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm4.64 13.71c-.19.54-1.14 1.04-1.57 1.1-.43.07-.97.1-1.56-.1-.36-.12-.82-.27-1.41-.53-2.47-1.07-4.08-3.56-4.2-3.72-.12-.16-1-1.33-1-2.54 0-1.21.63-1.8.86-2.05.22-.25.49-.31.65-.31h.47c.15 0 .35-.06.55.43.2.48.68 1.67.74 1.79.06.12.1.26.02.42-.08.16-.12.26-.24.4-.12.14-.25.31-.36.42-.12.12-.24.25-.1.49.14.24.62 1.03 1.33 1.66.92.82 1.69 1.07 1.93 1.19.24.12.38.1.52-.06.14-.16.6-.7.76-.94.16-.24.32-.2.54-.12.22.08 1.4.66 1.64.78.24.12.4.18.46.28.06.1.06.58-.13 1.11z" />
    </svg>
  )
}
