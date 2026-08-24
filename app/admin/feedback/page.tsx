'use client'

import { useEffect, useMemo, useState } from 'react'
import StatCard from '@/components/admin/StatCard'
import { StarIcon } from '@/components/icons'
import type { Feedback } from '@/types'
import type { FeedbackStats } from '@/app/api/admin/feedback/route'

type RoleFilter = 'all' | Feedback['role']
type RatingFilter = 'all' | '5' | '4' | '3' | '2' | '1'
type SortOption = 'newest' | 'oldest' | 'highest' | 'lowest'

const ROLE_LABEL: Record<Feedback['role'], string> = {
  sender: 'Sender',
  downloader: 'Downloader',
  requester: 'Requester',
  uploader: 'Uploader',
}

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <StarIcon key={n} filled={n <= rating} className={`w-3.5 h-3.5 ${n <= rating ? 'text-yellow-500' : 'text-border'}`} />
      ))}
    </div>
  )
}

export default function AdminFeedbackPage() {
  const [feedback, setFeedback] = useState<Feedback[]>([])
  const [stats, setStats] = useState<FeedbackStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>('all')
  const [sortOption, setSortOption] = useState<SortOption>('newest')

  useEffect(() => {
    fetch('/api/admin/feedback')
      .then((r) => r.json())
      .then((data) => {
        if (data.success) { setFeedback(data.data.feedback); setStats(data.data.stats) }
      })
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = feedback.filter((f) => {
      if (roleFilter !== 'all' && f.role !== roleFilter) return false
      if (ratingFilter !== 'all' && f.rating !== Number(ratingFilter)) return false
      if (q && !(f.comment ?? '').toLowerCase().includes(q) && !f.subjectId.toLowerCase().includes(q)) return false
      return true
    })
    list = [...list].sort((a, b) => {
      if (sortOption === 'oldest') return a.createdAt.localeCompare(b.createdAt)
      if (sortOption === 'highest') return b.rating - a.rating
      if (sortOption === 'lowest') return a.rating - b.rating
      return b.createdAt.localeCompare(a.createdAt)
    })
    return list
  }, [feedback, search, roleFilter, ratingFilter, sortOption])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-text-primary">Feedback</h1>
        <p className="text-sm text-muted mt-0.5">{feedback.length.toLocaleString('en-IN')} total submissions</p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Average Rating" value={stats.total ? stats.averageRating.toFixed(2) : '—'} sub={`${stats.total} ratings`} />
          <StatCard label="From Senders" value={stats.byRole.sender.toLocaleString('en-IN')} />
          <StatCard label="From Downloaders" value={stats.byRole.downloader.toLocaleString('en-IN')} />
          <StatCard label="Requesters + Uploaders" value={(stats.byRole.requester + stats.byRole.uploader).toLocaleString('en-IN')} />
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search comment or subject id…"
          className="flex-1 min-w-[200px] bg-card border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent/60"
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
          className="bg-card border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent/60"
        >
          <option value="all">All Roles</option>
          <option value="sender">Sender</option>
          <option value="downloader">Downloader</option>
          <option value="requester">Requester</option>
          <option value="uploader">Uploader</option>
        </select>
        <select
          value={ratingFilter}
          onChange={(e) => setRatingFilter(e.target.value as RatingFilter)}
          className="bg-card border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent/60"
        >
          <option value="all">All Ratings</option>
          <option value="5">5 stars</option>
          <option value="4">4 stars</option>
          <option value="3">3 stars</option>
          <option value="2">2 stars</option>
          <option value="1">1 star</option>
        </select>
        <select
          value={sortOption}
          onChange={(e) => setSortOption(e.target.value as SortOption)}
          className="bg-card border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent/60"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="highest">Highest rating</option>
          <option value="lowest">Lowest rating</option>
        </select>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Rating</th>
              <th className="px-4 py-3 font-medium">Comment</th>
              <th className="px-4 py-3 font-medium">Subject</th>
              <th className="px-4 py-3 font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-muted">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-muted">No feedback found</td></tr>
            ) : (
              filtered.map((f) => (
                <tr key={f.feedbackId} className="border-b border-border last:border-0 hover:bg-border/20 transition-colors align-top">
                  <td className="px-4 py-3">
                    <span className="text-xs font-medium text-text-primary">{ROLE_LABEL[f.role]}</span>
                    <div className="text-[10px] text-muted mt-0.5">{f.subjectType === 'transfer' ? 'Transfer' : 'Request'}</div>
                  </td>
                  <td className="px-4 py-3"><Stars rating={f.rating} /></td>
                  <td className="px-4 py-3 text-muted max-w-xs truncate" title={f.comment}>{f.comment || '—'}</td>
                  <td className="px-4 py-3 text-muted font-mono text-xs truncate max-w-[140px]" title={f.subjectId}>{f.subjectId}</td>
                  <td className="px-4 py-3 text-muted whitespace-nowrap">{new Date(f.createdAt).toLocaleDateString('en-IN')}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
