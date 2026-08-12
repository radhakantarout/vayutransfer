'use client'

import type { StudioTransfer } from '@/types/studio'
import TransferRow from './TransferRow'
import { EmptyBoxIcon } from './TransferIcons'

interface Props {
  transfers: StudioTransfer[] | null
  loading: boolean
  projectId: string
  clientName: string
  clientEmail: string
  clientPhone: string
  onChanged: () => void
  onOpenDetail: (transfer: StudioTransfer) => void
}

export default function TransferList({ transfers, loading, projectId, clientName, clientEmail, clientPhone, onChanged, onOpenDetail }: Props) {
  if (loading && transfers === null) {
    return (
      <div className="flex justify-center py-14">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if ((transfers ?? []).length === 0) {
    return (
      <div className="border border-dashed border-border rounded-2xl p-10 text-center space-y-2.5">
        <div className="flex justify-center text-muted"><EmptyBoxIcon /></div>
        <p className="text-sm text-muted">No transfers yet for this event.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2.5">
      {(transfers ?? []).map(t => (
        <TransferRow
          key={t.transferId}
          transfer={t}
          projectId={projectId}
          clientName={clientName}
          clientEmail={clientEmail}
          clientPhone={clientPhone}
          onChanged={onChanged}
          onOpenDetail={() => onOpenDetail(t)}
        />
      ))}
    </div>
  )
}
