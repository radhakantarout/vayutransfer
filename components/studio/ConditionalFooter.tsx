'use client'
import { usePathname } from 'next/navigation'
import StudioFooter from './StudioFooter'

export default function ConditionalFooter() {
  const pathname = usePathname()
  if (pathname.startsWith('/studio/dashboard')) return null
  return <StudioFooter />
}
