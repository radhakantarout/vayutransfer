'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'

function ApprovedContent() {
  const params     = useSearchParams()
  const status     = params.get('status')   // 'created' | 'already_active' | 'error'
  const studioName = params.get('name')
  const email      = params.get('email')

  if (status === 'created') {
    return (
      <div className="text-center space-y-5">
        <div className="w-20 h-20 rounded-full bg-success/10 border-2 border-success/30 flex items-center justify-center mx-auto">
          <svg className="w-9 h-9 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <h1 className="text-3xl font-extrabold text-text-primary mb-2">Studio approved!</h1>
          {studioName && (
            <p className="text-lg font-semibold text-accent">{studioName}</p>
          )}
        </div>
        <p className="text-muted leading-relaxed max-w-sm mx-auto">
          The studio account has been created and login credentials have been sent to{' '}
          {email
            ? <strong className="text-text-primary">{email}</strong>
            : 'the studio admin'
          }.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Link
            href="/studio/admin/studios"
            className="px-5 py-2.5 rounded-xl bg-accent text-bg text-sm font-bold hover:bg-accent/90 transition-colors"
          >
            View all studios
          </Link>
          <Link
            href="/studio/home"
            className="px-5 py-2.5 rounded-xl border border-border text-text-primary text-sm font-semibold hover:bg-border/40 transition-colors"
          >
            Back to home
          </Link>
        </div>
      </div>
    )
  }

  if (status === 'already_active') {
    return (
      <div className="text-center space-y-5">
        <div className="w-20 h-20 rounded-full bg-accent/10 border-2 border-accent/30 flex items-center justify-center mx-auto">
          <svg className="w-9 h-9 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" />
          </svg>
        </div>
        <div>
          <h1 className="text-3xl font-extrabold text-text-primary mb-2">Already active</h1>
        </div>
        <p className="text-muted leading-relaxed max-w-sm mx-auto">
          A studio account for{' '}
          {email
            ? <strong className="text-text-primary">{email}</strong>
            : 'this email'
          }{' '}
          already exists and is active. No changes were made.
        </p>
        <p className="text-sm text-muted">
          If this was a new request, the photographer may have re-submitted the form. Check the studio list to confirm.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Link
            href="/studio/admin/studios"
            className="px-5 py-2.5 rounded-xl bg-accent text-bg text-sm font-bold hover:bg-accent/90 transition-colors"
          >
            View all studios
          </Link>
          <Link
            href="/studio/home"
            className="px-5 py-2.5 rounded-xl border border-border text-text-primary text-sm font-semibold hover:bg-border/40 transition-colors"
          >
            Back to home
          </Link>
        </div>
      </div>
    )
  }

  /* error / invalid token fallback */
  return (
    <div className="text-center space-y-5">
      <div className="w-20 h-20 rounded-full bg-danger/10 border-2 border-danger/30 flex items-center justify-center mx-auto">
        <svg className="w-9 h-9 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
      <div>
        <h1 className="text-3xl font-extrabold text-text-primary mb-2">Invalid or expired link</h1>
      </div>
      <p className="text-muted leading-relaxed max-w-sm mx-auto">
        This approval link has expired (links are valid for 7 days) or is invalid.
        Ask the photographer to submit the registration form again.
      </p>
      <Link
        href="/studio/home"
        className="inline-flex px-5 py-2.5 rounded-xl border border-border text-text-primary text-sm font-semibold hover:bg-border/40 transition-colors"
      >
        Back to home
      </Link>
    </div>
  )
}

export default function ApprovedPage() {
  return (
    <div className="flex-1 flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <Suspense fallback={<div className="text-center text-muted">Loading…</div>}>
          <ApprovedContent />
        </Suspense>
      </div>
    </div>
  )
}
