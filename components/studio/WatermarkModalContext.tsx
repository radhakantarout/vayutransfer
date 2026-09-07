'use client'

import { createContext, useContext, useState } from 'react'

// Every trigger point (sidebar per-client menu, selection-bar dropdown, a
// single photo's "⋯" menu) resolves its own targeting up front — same
// resolution each already did before this modal existed — and hands it to
// openWatermarkModal, rather than the modal itself knowing about
// photoSelections/selectedIds internals from three different call sites.
export interface WatermarkModalRequest {
  // Shown in the modal's header for context, e.g. a client or event name.
  label: string
  // Every project the "apply/remove to ALL photos" scope should cover.
  projectIds: string[]
  // Pre-grouped selected-file targets. Omitted/empty disables the
  // "selected" scope buttons (nothing to apply/remove from).
  selectedTargets?: { projectId: string; fileIds: string[] }[]
}

interface WatermarkModalState {
  request: WatermarkModalRequest | null
  openWatermarkModal: (req: WatermarkModalRequest) => void
  closeWatermarkModal: () => void
}

const WatermarkModalContext = createContext<WatermarkModalState>({
  request: null,
  openWatermarkModal: () => {},
  closeWatermarkModal: () => {},
})

export function WatermarkModalProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<WatermarkModalRequest | null>(null)
  return (
    <WatermarkModalContext.Provider value={{
      request,
      openWatermarkModal: setRequest,
      closeWatermarkModal: () => setRequest(null),
    }}>
      {children}
    </WatermarkModalContext.Provider>
  )
}

export function useWatermarkModal() {
  return useContext(WatermarkModalContext)
}
