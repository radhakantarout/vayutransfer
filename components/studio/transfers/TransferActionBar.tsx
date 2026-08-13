'use client'

// Send/Request buttons + the context strip showing which event is the
// upload/receive target. Single checked event -> silent default, no popup.
// Multiple checked events -> the destination picker opens automatically
// before anything starts. The context strip's own "Change" link opens the
// same picker against the full same-client event list, for switching away
// from the default even in the single-event case.

import { useRef, useState } from 'react'
import type { StudioProject } from '@/types/studio'
import TransferDestinationPicker from './TransferDestinationPicker'
import UploadTrackerCard from './UploadTrackerCard'
import { SendIcon, ReceiveIcon } from './TransferIcons'
import type { SendProgress } from './transferUtils'

interface Props {
  project: StudioProject
  activeSourceProjects: StudioProject[]
  sendBusy: boolean
  sendProgress: SendProgress | null
  requestBusy: boolean
  onSend: (file: File, targetProjectId: string) => void
  onRequest: (targetProjectId: string) => void
  onCancelSend: () => void
}

export default function TransferActionBar({ project, activeSourceProjects, sendBusy, sendProgress, requestBusy, onSend, onRequest, onCancelSend }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [explicitTarget, setExplicitTarget] = useState<StudioProject | null>(null)
  const [pickerMode, setPickerMode] = useState<'auto-select' | 'change' | null>(null)
  const [pendingAction, setPendingAction] = useState<'send' | 'request' | null>(null)

  const isMultiSource = activeSourceProjects.length > 1
  const defaultTarget = isMultiSource ? null : (activeSourceProjects[0] ?? project)
  const effectiveTarget = explicitTarget ?? defaultTarget

  const startSend = () => {
    if (effectiveTarget) { fileInputRef.current?.click(); return }
    setPendingAction('send')
    setPickerMode('auto-select')
  }

  const startRequest = () => {
    if (effectiveTarget) { onRequest(effectiveTarget.projectId); return }
    setPendingAction('request')
    setPickerMode('auto-select')
  }

  const handleFile = (file: File) => {
    if (effectiveTarget) onSend(file, effectiveTarget.projectId)
  }

  const resolvePendingChoice = async (targetProjectId: string): Promise<{ success: boolean }> => {
    const chosen = activeSourceProjects.find(p => p.projectId === targetProjectId) ?? { ...project, projectId: targetProjectId }
    setExplicitTarget(chosen)
    if (pendingAction === 'send') {
      // File dialog needs a user gesture — the picker's own "choose" click
      // still counts as one, so this stays inside the same synchronous flow.
      setTimeout(() => fileInputRef.current?.click(), 0)
    } else if (pendingAction === 'request') {
      onRequest(targetProjectId)
    }
    setPendingAction(null)
    return { success: true }
  }

  return (
    <div className="space-y-2.5">
      <div className="flex gap-3">
        <button
          onClick={startSend}
          disabled={sendBusy}
          className="flex-1 flex items-center justify-center gap-2 bg-accent text-bg text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-accent/90 hover:-translate-y-px disabled:opacity-50 disabled:translate-y-0 transition-all duration-150"
        >
          <SendIcon className="w-4 h-4" />
          Send Raw File
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
        />
        <button
          onClick={startRequest}
          disabled={requestBusy}
          className="flex-1 flex items-center justify-center gap-2 border border-border text-text-primary text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-border/40 hover:-translate-y-px disabled:opacity-50 disabled:translate-y-0 transition-all duration-150"
        >
          <ReceiveIcon className="w-4 h-4" />
          {requestBusy ? 'Creating…' : 'Request File'}
        </button>
      </div>

      {effectiveTarget && (
        <div className="flex items-center gap-1.5 text-xs text-muted px-1">
          <span>Targeting <span className="font-semibold text-text-primary">{(effectiveTarget.eventType ?? '').replace(/_/g, ' ')}</span></span>
          <button onClick={() => setPickerMode('change')} className="text-accent font-semibold hover:underline">Change</button>
        </div>
      )}

      {sendProgress && <UploadTrackerCard sendProgress={sendProgress} onCancelSend={onCancelSend} />}

      {pickerMode && (
        <TransferDestinationPicker
          title={pendingAction === 'request' ? 'Request file into' : 'Send file to'}
          clientName={project.clientName}
          clientEmail={project.clientEmail}
          clientPhone={project.clientPhone}
          mode={pickerMode === 'auto-select' ? 'checked-events' : 'same-client-siblings'}
          candidateProjects={activeSourceProjects}
          excludeProjectIds={effectiveTarget ? [effectiveTarget.projectId] : []}
          onClose={() => { setPickerMode(null); setPendingAction(null) }}
          onChoose={resolvePendingChoice}
        />
      )}
    </div>
  )
}
