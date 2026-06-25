import { NextResponse } from 'next/server'

export async function POST() {
  const response = NextResponse.json({ success: true })
  response.cookies.set('studio_token', '', { maxAge: 0, path: '/' })
  response.cookies.set('studio_ui',    '', { maxAge: 0, path: '/' })
  return response
}
