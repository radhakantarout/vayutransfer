'use client'

import { signIn, useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, Suspense } from 'react'
import Link from 'next/link'
import AuthMarketingPanel from '@/components/AuthMarketingPanel'
import EmailOtpForm from '@/components/EmailOtpForm'

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  )
}

// Wraps the email/OTP form's initial value so someone bounced here from
// the signup page (via "An account with this email already exists ->
// Sign in") doesn't have to retype it. useSearchParams() needs its own
// Suspense boundary per Next.js's App Router rules — see LoginPage below.
function LoginPageInner() {
  const { status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialEmail = searchParams.get('email') ?? ''

  useEffect(() => {
    if (status === 'authenticated') router.replace('/')
  }, [status, router])

  if (status === 'loading' || status === 'authenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
        <AuthMarketingPanel
          title="Welcome back."
          subtitle="Your wallet, your transfers, right where you left them."
        />

        <div className="bg-card border border-border rounded-2xl p-8 flex flex-col justify-center space-y-5">
          <div>
            <h2 className="text-xl font-bold text-text-primary">Sign in</h2>
            <p className="text-sm text-muted mt-1">We'll email you a one-time code — no password needed.</p>
          </div>

          <EmailOtpForm mode="login" callbackUrl="/" initialEmail={initialEmail} />

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[11px] text-muted uppercase tracking-wide">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <button
            onClick={() => signIn('google', { callbackUrl: '/' })}
            className="w-full flex items-center justify-center gap-3 bg-white text-gray-800 font-semibold py-3 px-4 rounded-xl hover:bg-gray-100 hover:shadow-md hover:-translate-y-0.5 transition-all border border-gray-200 shadow-sm"
          >
            <GoogleGlyph />
            Continue with Google
          </button>

          <p className="text-sm text-muted text-center">
            New here?{' '}
            <Link href="/signup" className="text-accent font-semibold hover:underline">Create an account</Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <LoginPageInner />
    </Suspense>
  )
}
