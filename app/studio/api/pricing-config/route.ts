import { NextResponse } from 'next/server'
import { getPricingConfig } from '@/lib/pricingConfig'

// Public, read-only — prices aren't secret (the marketing pricing page
// already shows them), and every client-side cost estimate (e.g.
// ReelMvpModal's pre-generation quote) needs the SAME live, owner-editable
// numbers the server enforces at charge time, or the quote and the actual
// charge silently drift apart the moment an admin changes a rate.
//
// No request-scoped API (no cookies/headers/searchParams) means Next would
// otherwise treat this as static and execute it once at BUILD time — which
// fails outright before the pricing-config table exists, and would freeze
// stale prices into the build even once it does. Forcing dynamic keeps this
// a real per-request DynamoDB read, same as every other pricing route here.
export const dynamic = 'force-dynamic'

export async function GET() {
  const config = await getPricingConfig()
  return NextResponse.json({ success: true, data: config })
}
