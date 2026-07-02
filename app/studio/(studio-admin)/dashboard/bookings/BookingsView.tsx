'use client'
import { useState, useEffect } from 'react'
import type { Booking, BookingStatus } from '@/types/studio'

const STATUS_LABEL: Record<BookingStatus, string> = {
  NEW: 'New', SEEN: 'Seen', REPLIED: 'Replied',
}
const STATUS_COLOR: Record<BookingStatus, string> = {
  NEW: 'text-amber-400 bg-amber-400/10 border-amber-400/30',
  SEEN: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
  REPLIED: 'text-green-400 bg-green-400/10 border-green-400/30',
}

export default function BookingsView() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Booking | null>(null)

  useEffect(() => {
    fetch('/studio/api/admin/bookings')
      .then(r => r.json())
      .then(res => { if (res.success) setBookings(res.data) })
      .finally(() => setLoading(false))
  }, [])

  const updateStatus = async (bookingId: string, status: BookingStatus) => {
    await fetch(`/studio/api/admin/bookings/${bookingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setBookings(bs => bs.map(b => b.bookingId === bookingId ? { ...b, status } : b))
    if (selected?.bookingId === bookingId) setSelected(s => s ? { ...s, status } : s)
  }

  const openBooking = (b: Booking) => {
    setSelected(b)
    if (b.status === 'NEW') updateStatus(b.bookingId, 'SEEN')
  }

  if (loading) return <div className="flex items-center justify-center h-40"><div className="animate-spin w-6 h-6 border-2 border-accent border-t-transparent rounded-full" /></div>

  const newCount = bookings.filter(b => b.status === 'NEW').length

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-bold text-text-primary">Booking Enquiries</h2>
        {newCount > 0 && (
          <span className="bg-accent text-bg text-xs font-bold px-2 py-0.5 rounded-full">{newCount} new</span>
        )}
      </div>

      {bookings.length === 0 ? (
        <div className="text-center py-16 text-muted">
          <div className="text-4xl mb-3">📩</div>
          <p className="font-semibold text-text-primary">No enquiries yet</p>
          <p className="text-sm mt-1">When clients fill in your booking form, they&apos;ll appear here.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {/* List */}
          <div className="space-y-2">
            {bookings.map(b => (
              <button key={b.bookingId} onClick={() => openBooking(b)}
                className={`w-full text-left rounded-2xl border p-4 transition-colors ${selected?.bookingId === b.bookingId ? 'border-accent bg-accent/5' : 'border-border bg-card hover:border-accent/50'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-sm text-text-primary">{b.name}</p>
                    <p className="text-xs text-muted">{b.email}</p>
                    {b.eventType && <p className="text-xs text-muted mt-0.5">{b.eventType}{b.eventDate ? ` · ${b.eventDate}` : ''}</p>}
                  </div>
                  <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_COLOR[b.status]}`}>
                    {STATUS_LABEL[b.status]}
                  </span>
                </div>
                <p className="text-xs text-muted mt-2">{new Date(b.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
              </button>
            ))}
          </div>

          {/* Detail */}
          {selected && (
            <div className="bg-card border border-border rounded-2xl p-5 space-y-4 sticky top-4 self-start">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-text-primary">{selected.name}</h3>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_COLOR[selected.status]}`}>
                  {STATUS_LABEL[selected.status]}
                </span>
              </div>
              <div className="space-y-2 text-sm">
                <Row label="Email" value={<a href={`mailto:${selected.email}`} className="text-accent hover:underline">{selected.email}</a>} />
                {selected.phone && <Row label="Phone" value={<a href={`tel:${selected.phone}`} className="text-accent hover:underline">{selected.phone}</a>} />}
                {selected.eventType && <Row label="Event" value={selected.eventType} />}
                {selected.eventDate && <Row label="Date" value={selected.eventDate} />}
                {selected.message && (
                  <div>
                    <span className="text-xs text-muted uppercase tracking-wider font-semibold block mb-1">Message</span>
                    <p className="text-sm text-text-primary bg-bg rounded-xl p-3 leading-relaxed">{selected.message}</p>
                  </div>
                )}
                <Row label="Received" value={new Date(selected.createdAt).toLocaleString('en-IN')} />
              </div>
              <div className="flex gap-2 pt-2">
                <a href={`mailto:${selected.email}?subject=Re: Your photography enquiry`}
                  onClick={() => updateStatus(selected.bookingId, 'REPLIED')}
                  className="flex-1 text-center bg-accent text-bg text-xs font-bold py-2.5 rounded-xl hover:opacity-80 transition-opacity">
                  Reply via Email
                </a>
                {selected.phone && (
                  <a href={`https://wa.me/${selected.phone.replace(/\D/g,'')}?text=Hi ${encodeURIComponent(selected.name)}, thank you for your enquiry!`}
                    target="_blank" rel="noopener noreferrer"
                    onClick={() => updateStatus(selected.bookingId, 'REPLIED')}
                    className="flex-1 text-center bg-[#25D366] text-white text-xs font-bold py-2.5 rounded-xl hover:opacity-80 transition-opacity">
                    WhatsApp
                  </a>
                )}
              </div>
              {selected.status !== 'REPLIED' && (
                <button onClick={() => updateStatus(selected.bookingId, 'REPLIED')}
                  className="w-full text-xs text-muted hover:text-text-primary transition-colors">
                  Mark as replied
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="text-xs text-muted uppercase tracking-wider font-semibold w-16 flex-shrink-0 pt-0.5">{label}</span>
      <span className="text-text-primary">{value}</span>
    </div>
  )
}
