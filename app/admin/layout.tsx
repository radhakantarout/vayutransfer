'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import AdminSidebar from '@/components/admin/AdminSidebar'

// The admin_token cookie is httpOnly (can't be read client-side), so this
// layout confirms auth via a lightweight GET that middleware.ts already
// gates — a 401 here means "not logged in," not "server error." Fully
// separate from VayuTransfer's own signed-in app shell
// (ConditionalNavbar/ConditionalSidebar) — no shared chrome or state.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [status, setStatus] = useState<'checking' | 'ok' | 'denied'>('checking')
  const [adminEmail, setAdminEmail] = useState('')

  const isLoginPage = pathname === '/admin/login'

  useEffect(() => {
    if (isLoginPage) return
    fetch('/api/admin/auth/me')
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setAdminEmail(data.data.email)
          setStatus('ok')
        } else {
          setStatus('denied')
          router.replace('/admin/login')
        }
      })
      .catch(() => { setStatus('denied'); router.replace('/admin/login') })
  }, [isLoginPage, router])

  if (isLoginPage) return <>{children}</>

  if (status !== 'ok') {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg flex">
      <AdminSidebar adminEmail={adminEmail} />
      <div className="flex-1 min-w-0 p-6">{children}</div>
    </div>
  )
}
