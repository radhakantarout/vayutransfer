'use client'

import type { StudioProject, StudioTransfer } from '@/types/studio'
import TransferRow from './TransferRow'
import { EmptyBoxIcon } from './TransferIcons'

interface Props {
  transfers: StudioTransfer[] | null
  loading: boolean
  // Studio-wide: every transfer can belong to a different event, so each
  // row resolves its own project by projectId rather than the whole list
  // sharing one fixed context (the old single-event tab's assumption).
  projectsById: Map<string, StudioProject>
  emptyMessage?: string
  onChanged: () => void
  onOpenDetail: (transfer: StudioTransfer) => void
}

export default function TransferList({ transfers, loading, projectsById, emptyMessage, onChanged, onOpenDetail }: Props) {
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
        <p className="text-sm text-muted">{emptyMessage ?? 'No transfers yet.'}</p>
      </div>
    )
  }

  return (
    <div className="space-y-2.5">
      {(transfers ?? []).map(t => {
        // Defensive — the tagged event could have been deleted independently;
        // skip rather than crash on a stale row (it'll disappear from the
        // list entirely once cron/manual cleanup catches up).
        const project = projectsById.get(t.projectId)
        if (!project) return null
        return (
          <TransferRow
            key={t.transferId}
            transfer={t}
            project={project}
            onChanged={onChanged}
            onOpenDetail={() => onOpenDetail(t)}
          />
        )
      })}
    </div>
  )
}
