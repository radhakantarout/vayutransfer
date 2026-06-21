import { redirect } from 'next/navigation'

// Studio root → redirect to login
export default function StudioRoot() {
  redirect('/studio/login')
}
