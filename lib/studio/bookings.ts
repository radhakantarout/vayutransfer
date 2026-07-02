import { studioPutItem, studioGetItem, studioUpdateItem, studioQueryByIndex, TABLES } from './dynamodb'
import type { Booking, BookingStatus } from '@/types/studio'
import { randomUUID } from 'crypto'

export async function createBooking(data: Omit<Booking, 'bookingId' | 'status' | 'createdAt'>): Promise<Booking> {
  const booking: Booking = {
    ...data,
    bookingId: randomUUID(),
    status: 'NEW',
    createdAt: new Date().toISOString(),
  }
  await studioPutItem(TABLES.bookings, booking as unknown as Record<string, unknown>)
  return booking
}

export async function getBookingsByStudio(studioId: string, limit = 50): Promise<Booking[]> {
  return studioQueryByIndex<Booking>(
    TABLES.bookings,
    'studioId-createdAt-index',
    'studioId = :s',
    { ':s': studioId },
    undefined,
    limit
  )
}

export async function updateBookingStatus(bookingId: string, status: BookingStatus): Promise<void> {
  await studioUpdateItem(
    TABLES.bookings,
    { bookingId },
    'SET #st = :s',
    { ':s': status },
    { '#st': 'status' }
  )
}

export async function getBooking(bookingId: string): Promise<Booking | null> {
  return studioGetItem<Booking>(TABLES.bookings, { bookingId })
}
