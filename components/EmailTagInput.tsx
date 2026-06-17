'use client'

import { useState, useRef, KeyboardEvent } from 'react'

interface Props {
  emails: string[]
  onChange: (emails: string[]) => void
  maxEmails?: number
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

export default function EmailTagInput({ emails, onChange, maxEmails = 10 }: Props) {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const addEmail = (raw: string) => {
    const email = raw.trim().toLowerCase()
    if (!email) return
    if (!isValidEmail(email)) return
    if (emails.includes(email)) { setInput(''); return }
    if (emails.length >= maxEmails) return
    onChange([...emails, email])
    setInput('')
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      e.preventDefault()
      addEmail(input)
    }
    if (e.key === 'Backspace' && input === '' && emails.length > 0) {
      onChange(emails.slice(0, -1))
    }
  }

  const removeEmail = (index: number) => {
    onChange(emails.filter((_, i) => i !== index))
  }

  const isTypingValid = input.trim() === '' || isValidEmail(input.trim())
  const showValidation = input.trim().length > 3

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-sm text-muted">
          Recipient emails <span className="text-xs opacity-60">(optional — press Enter to add)</span>
        </label>
        {emails.length > 0 && (
          <span className="text-xs text-muted">{emails.length}/{maxEmails}</span>
        )}
      </div>

      <div
        onClick={() => inputRef.current?.focus()}
        className="min-h-[44px] w-full bg-card border border-border rounded-lg px-3 py-2 flex flex-wrap gap-1.5 cursor-text focus-within:border-accent transition-colors"
      >
        {emails.map((email, i) => (
          <span
            key={email}
            className="flex items-center gap-1 bg-accent/10 border border-accent/30 text-accent text-xs px-2 py-1 rounded-md"
          >
            {email}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeEmail(i) }}
              className="hover:text-danger transition-colors leading-none"
            >
              ×
            </button>
          </span>
        ))}

        <div className="flex items-center gap-1.5 flex-1 min-w-[160px]">
          <input
            ref={inputRef}
            type="email"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => addEmail(input)}
            placeholder={emails.length === 0 ? 'recipient@example.com' : 'Add another...'}
            disabled={emails.length >= maxEmails}
            className="flex-1 bg-transparent text-text-primary text-sm placeholder:text-muted focus:outline-none disabled:opacity-40"
          />
          {showValidation && (
            <span className={`text-xs flex-shrink-0 font-medium ${isTypingValid ? 'text-success' : 'text-danger'}`}>
              {isTypingValid ? '✓' : '✗'}
            </span>
          )}
        </div>
      </div>

      {emails.length > 0 && (
        <p className="text-xs text-muted">
          Download link will be emailed to {emails.length} recipient{emails.length > 1 ? 's' : ''}
        </p>
      )}
    </div>
  )
}
