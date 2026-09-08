import { studioQueryByIndex, TABLES } from './dynamodb'
import type { StudioTransfer } from '@/types/studio'

// Studio-wide "all transfers" read, backing the top-level Raw Transfer
// product page — every StudioTransfer row already stores studioId as a
// plain attribute (set at creation in the per-project transfers route), it
// just wasn't indexed until the studioId-createdAt-index GSI was added
// alongside this function. Modeled directly on getBookingsByStudio in
// lib/studio/bookings.ts — same one-query, no per-project fan-out shape.
export async function getTransfersByStudio(studioId: string, limit = 200): Promise<StudioTransfer[]> {
  return studioQueryByIndex<StudioTransfer>(
    TABLES.transfers,
    'studioId-createdAt-index',
    'studioId = :s',
    { ':s': studioId },
    undefined,
    limit
  )
}
