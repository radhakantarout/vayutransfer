'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import UserStatusBadge from '@/components/admin/UserStatusBadge'
import ConfirmButton from '@/components/admin/ConfirmButton'

interface DetailUser {
  userId: string
  email: string
  name: string
  status?: 'active' | 'warned' | 'blocked'
  warningCount?: number
  lastWarningAt?: string
  blockedAt?: string
  blockedReason?: string
  createdAt: string
}
interface Wallet { walletId: string; balance: number; totalLoaded: number; totalSpent: number }
interface Transaction { txnId: string; type: string; amount: number; bonusAmount: number; status: string; createdAt: string }
interface Transfer { fileId: string; fileName: string; fileSizeBytes: number; status: string; createdAt: string; fileCount?: number }
interface AuditEvent { auditId: string; eventType: string; outcome: string; createdAt: string; metadata?: Record<string, unknown> }

function formatPaise(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}
function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

export default function AdminUserDetailPage() {
  const { userId } = useParams<{ userId: string }>()
  const [user, setUser] = useState<DetailUser | null>(null)
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [reason, setReason] = useState('')
  const [actionMsg, setActionMsg] = useState<string | null>(null)

  const load = () => {
    fetch(`/api/admin/users/${userId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setUser(data.data.user)
          setWallet(data.data.wallet)
          setTransactions(data.data.transactions)
          setTransfers(data.data.transfers)
          setAuditEvents(data.data.auditEvents)
        }
      })
      .finally(() => setLoading(false))
  }

  useEffect(load, [userId])

  const doWarn = async () => {
    const res = await fetch(`/api/admin/users/${userId}/warn`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason || 'Flagged for suspicious activity' }),
    }).then((r) => r.json())
    setActionMsg(res.success ? `Warning ${res.data.warningNumber}/3 sent.${res.data.readyToBlock ? ' Consider blocking now.' : ''}` : res.message ?? 'Failed')
    setReason('')
    load()
  }
  const doBlock = async () => {
    const res = await fetch(`/api/admin/users/${userId}/block`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason || 'Blocked by platform admin' }),
    }).then((r) => r.json())
    setActionMsg(res.success ? 'User blocked.' : res.message ?? 'Failed')
    setReason('')
    load()
  }
  const doUnblock = async () => {
    const res = await fetch(`/api/admin/users/${userId}/unblock`, { method: 'POST' }).then((r) => r.json())
    setActionMsg(res.success ? 'User unblocked.' : res.message ?? 'Failed')
    load()
  }
  const doDeleteTransfer = async (fileId: string) => {
    const res = await fetch(`/api/admin/users/${userId}/transfers/${fileId}/delete`, { method: 'POST' }).then((r) => r.json())
    setActionMsg(res.success ? 'Transfer deleted.' : res.message ?? 'Failed')
    load()
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  if (!user) {
    return <div className="text-muted text-sm">User not found.</div>
  }

  return (
    <div className="space-y-6">
      <Link href="/admin/users" className="text-sm text-muted hover:text-text-primary">← Back to Users</Link>

      <div className="bg-card border border-border rounded-2xl p-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <div className="font-bold text-text-primary text-lg">{user.name}</div>
            <UserStatusBadge status={user.status} />
          </div>
          <div className="text-sm text-muted mt-0.5">{user.email}</div>
          <div className="text-xs text-muted mt-1">Joined {new Date(user.createdAt).toLocaleDateString('en-IN')}</div>
          {user.status === 'blocked' && user.blockedReason && (
            <div className="text-xs text-danger mt-2">Blocked: {user.blockedReason}</div>
          )}
          {typeof user.warningCount === 'number' && user.warningCount > 0 && (
            <div className="text-xs text-yellow-500 mt-1">{user.warningCount}/3 warnings issued</div>
          )}
        </div>
        {wallet && (
          <div className="text-right">
            <div className="text-xs text-muted">Wallet Balance</div>
            <div className="text-xl font-bold text-text-primary">{formatPaise(wallet.balance)}</div>
            <div className="text-[11px] text-muted mt-0.5">Lifetime loaded {formatPaise(wallet.totalLoaded)} · spent {formatPaise(wallet.totalSpent)}</div>
          </div>
        )}
      </div>

      {/* Moderation actions */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
        <div className="text-sm font-semibold text-text-primary">Moderation</div>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (used in the warning/block email)…"
          className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent/60"
        />
        <div className="flex items-center gap-2 flex-wrap">
          {user.status !== 'blocked' && (
            <>
              <ConfirmButton
                label="Send Warning"
                confirmLabel="Confirm send"
                onConfirm={doWarn}
                className="text-xs font-semibold bg-yellow-500/10 text-yellow-500 border border-yellow-500/30 px-3 py-1.5 rounded-lg hover:bg-yellow-500/20 transition-colors"
              />
              <ConfirmButton
                label="Block User"
                confirmLabel="Confirm block"
                onConfirm={doBlock}
                className="text-xs font-semibold bg-danger/10 text-danger border border-danger/30 px-3 py-1.5 rounded-lg hover:bg-danger/20 transition-colors"
              />
            </>
          )}
          {user.status === 'blocked' && (
            <ConfirmButton
              label="Unblock User"
              confirmLabel="Confirm unblock"
              onConfirm={doUnblock}
              className="text-xs font-semibold bg-success/10 text-success border border-success/30 px-3 py-1.5 rounded-lg hover:bg-success/20 transition-colors"
            />
          )}
        </div>
        {actionMsg && <div className="text-xs text-muted">{actionMsg}</div>}
      </div>

      {/* Transactions */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border text-sm font-semibold text-text-primary">Wallet Transactions</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Amount</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-muted">No transactions</td></tr>
            ) : transactions.map((t) => (
              <tr key={t.txnId} className="border-b border-border last:border-0">
                <td className="px-4 py-2 text-text-primary capitalize">{t.type}</td>
                <td className="px-4 py-2 text-text-primary">{formatPaise(t.amount)}{t.bonusAmount > 0 && ` +${formatPaise(t.bonusAmount)} bonus`}</td>
                <td className="px-4 py-2 text-muted capitalize">{t.status}</td>
                <td className="px-4 py-2 text-muted">{new Date(t.createdAt).toLocaleString('en-IN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Transfers */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border text-sm font-semibold text-text-primary">Transfers</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="px-4 py-2 font-medium">File</th>
              <th className="px-4 py-2 font-medium">Size</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {transfers.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-muted">No transfers</td></tr>
            ) : transfers.map((t) => (
              <tr key={t.fileId} className="border-b border-border last:border-0">
                <td className="px-4 py-2 text-text-primary truncate max-w-[200px]">{t.fileName}</td>
                <td className="px-4 py-2 text-muted">{formatBytes(t.fileSizeBytes)}</td>
                <td className="px-4 py-2 text-muted capitalize">{t.status}</td>
                <td className="px-4 py-2 text-muted">{new Date(t.createdAt).toLocaleDateString('en-IN')}</td>
                <td className="px-4 py-2 text-right">
                  {t.status !== 'deleted' && (
                    <ConfirmButton
                      label="Delete"
                      confirmLabel="Confirm"
                      onConfirm={() => doDeleteTransfer(t.fileId)}
                      className="text-xs font-semibold text-danger hover:underline"
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Audit trail */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border text-sm font-semibold text-text-primary">Audit Trail</div>
        <div className="max-h-80 overflow-y-auto divide-y divide-border">
          {auditEvents.length === 0 ? (
            <div className="px-4 py-6 text-center text-muted text-sm">No activity recorded</div>
          ) : auditEvents.map((e) => (
            <div key={e.auditId} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
              <span className="text-text-primary">{e.eventType.replace(/_/g, ' ').toLowerCase()}</span>
              <span className="text-xs text-muted flex-shrink-0">{new Date(e.createdAt).toLocaleString('en-IN')}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
