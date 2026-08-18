'use client'

import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Sidebar from './Sidebar'

// Always visible once signed in, on every route — the permanent app shell
// for the whole session, including the New Transfer flow (no chromeless
// routes anymore). Anonymous visitors never see it.
export default function ConditionalSidebar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  if (pathname.startsWith('/studio')) return null
  if (!session) return null
  return <Sidebar />
}
