'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import ConfirmButton from '@/components/admin/ConfirmButton'

interface StorageUser { userId: string; name: string; email: string }
interface StorageTransfer {
  fileId: string
  fileName: string
  displayName?: string
  fileSizeBytes: number
  fileCount?: number
  status: string
  createdAt: string
}
interface StorageReceiveRequest {
  requestId: string
  requestTitle?: string
  status: string
  resultFileId?: string
  createdAt: string
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

export default function AdminUserStoragePage() {
  const { userId } = useParams<{ userId: string }>()
  const [user, setUser] = useState<StorageUser | null>(null)
  const [transfers, setTransfers] = useState<StorageTransfer[]>([])
  const [receiveRequests, setReceiveRequests] = useState<StorageReceiveRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [actionMsg, setActionMsg] = useState<string | null>(null)

  const load = () => {
    fetch(`/api/admin/users/${userId}/storage`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setUser(data.data.user)
          setTransfers(data.data.transfers)
          setReceiveRequests(data.data.receiveRequests)
        }
      })
      .finally(() => setLoading(false))
  }

  useEffect(load, [userId])

  const activeTransfers = transfers.filter((t) => t.status !== 'deleted')
  const activeRequests = receiveRequests.filter((r) => r.status !== 'cancelled')
  const totalUsageBytes = activeTransfers.filter((t) => t.status === 'active').reduce((s, t) => s + t.fileSizeBytes, 0)

  const doDeleteTransfer = async (fileId: string) => {
    const res = await fetch(`/api/admin/users/${userId}/transfers/${fileId}/delete`, { method: 'POST' }).then((r) => r.json())
    setActionMsg(res.success ? 'Transfer deleted.' : res.message ?? 'Failed')
    load()
  }

  const doDeleteRequest = async (requestId: string) => {
    const res = await fetch(`/api/admin/users/${userId}/receive-requests/${requestId}/delete`, { method: 'POST' }).then((r) => r.json())
    setActionMsg(res.success ? 'Request cleared.' : res.message ?? 'Failed')
    load()
  }

  const doClearAll = async () => {
    const res = await fetch(`/api/admin/users/${userId}/clear-all`, { method: 'POST' }).then((r) => r.json())
    setActionMsg(res.success
      ? `Cleared ${res.data.transfersDeleted} transfer${res.data.transfersDeleted !== 1 ? 's' : ''} and ${res.data.requestsCleared} request${res.data.requestsCleared !== 1 ? 's' : ''}.`
      : res.message ?? 'Failed')
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
      <Link href={`/admin/users/${userId}`} className="text-sm text-muted hover:text-text-primary">← Back to {user.name}</Link>

      <div className="bg-card border border-border rounded-2xl p-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="font-bold text-text-primary text-lg">Manage Storage</div>
          <div className="text-sm text-muted mt-0.5">{user.name} · {user.email}</div>
          <div className="text-xs text-muted mt-1">
            {formatBytes(totalUsageBytes)} currently stored · {activeTransfers.length} transfer{activeTransfers.length !== 1 ? 's' : ''} · {activeRequests.length} receive request{activeRequests.length !== 1 ? 's' : ''}
          </div>
        </div>
        {(activeTransfers.length > 0 || activeRequests.length > 0) && (
          <ConfirmButton
            label="Clear All"
            confirmLabel="Confirm clear all"
            onConfirm={doClearAll}
            className="text-xs font-semibold bg-danger/10 text-danger border border-danger/30 px-3 py-1.5 rounded-lg hover:bg-danger/20 transition-colors"
          />
        )}
      </div>

      {actionMsg && <div className="text-xs text-muted">{actionMsg}</div>}

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
                <td className="px-4 py-2 text-text-primary truncate max-w-[220px]">
                  {t.displayName ?? t.fileName}{t.fileCount ? ` (${t.fileCount} files)` : ''}
                </td>
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

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border text-sm font-semibold text-text-primary">Receive Requests</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="px-4 py-2 font-medium">Title</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {receiveRequests.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-muted">No receive requests</td></tr>
            ) : receiveRequests.map((r) => (
              <tr key={r.requestId} className="border-b border-border last:border-0">
                <td className="px-4 py-2 text-text-primary truncate max-w-[220px]">{r.requestTitle ?? 'Untitled request'}</td>
                <td className="px-4 py-2 text-muted capitalize">{r.status}</td>
                <td className="px-4 py-2 text-muted">{new Date(r.createdAt).toLocaleDateString('en-IN')}</td>
                <td className="px-4 py-2 text-right">
                  {r.status !== 'cancelled' && (
                    <ConfirmButton
                      label="Delete"
                      confirmLabel="Confirm"
                      onConfirm={() => doDeleteRequest(r.requestId)}
                      className="text-xs font-semibold text-danger hover:underline"
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
