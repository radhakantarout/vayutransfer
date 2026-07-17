import type { MediaFile, Selection, StudioProject } from '@/types/studio'

// The one canonical photo lifecycle vocabulary — used by the gallery header's
// filter, Quick Share, and AI Sorting, so all three always offer exactly the
// same stages. DRAFT/STARRED/FINAL_PRINT are the admin's own curation
// pipeline (MediaFile.curationStatus) — CLIENT_FAVORITE/EDIT_REQUIRED are the
// client's own submitted selection (Selection.isSelected/editingRequired).
// The admin pipeline's middle stage (curationStatus 'FAVORITE', reached by
// cycling the star button twice) intentionally has no standalone filter here
// — it's a transitional state between Starred and Final Print, not one of
// the six named stages this vocabulary exposes.
export type PhotoScope = 'ALL' | 'DRAFT' | 'STARRED' | 'CLIENT_FAVORITE' | 'EDIT_REQUIRED' | 'EDITED' | 'FINAL_PRINT'

export const PHOTO_SCOPE_ORDER: PhotoScope[] = ['ALL', 'DRAFT', 'STARRED', 'CLIENT_FAVORITE', 'EDIT_REQUIRED', 'EDITED', 'FINAL_PRINT']

export const PHOTO_SCOPE_LABEL: Record<PhotoScope, string> = {
  ALL:             'All Photos',
  DRAFT:           'Draft',
  STARRED:         'Starred',
  CLIENT_FAVORITE: 'Client Favorite',
  EDIT_REQUIRED:   'Edit Required',
  EDITED:          'Edited',
  FINAL_PRINT:     'Final Print',
}

// Returns undefined for ALL (meaning "no filter, use everything downstream"),
// otherwise the exact fileIds matching the scope.
export function resolveScopeFileIds(
  scope: PhotoScope,
  files: MediaFile[],
  selections: Selection[],
  project: StudioProject
): string[] | undefined {
  if (scope === 'ALL') return undefined

  switch (scope) {
    case 'DRAFT':
      return files.filter(f => !f.curationStatus).map(f => f.fileId)
    case 'STARRED':
      return files.filter(f => f.curationStatus === 'STARRED').map(f => f.fileId)
    case 'FINAL_PRINT':
      return files.filter(f => f.curationStatus === 'FINAL').map(f => f.fileId)
    case 'CLIENT_FAVORITE': {
      const selectionByFileId = new Map(selections.map(s => [s.fileId, s]))
      return files.filter(f => selectionByFileId.get(f.fileId)?.isSelected).map(f => f.fileId)
    }
    case 'EDIT_REQUIRED': {
      const selectionByFileId = new Map(selections.map(s => [s.fileId, s]))
      return files.filter(f => selectionByFileId.get(f.fileId)?.editingRequired).map(f => f.fileId)
    }
    case 'EDITED':
      return files.filter(f => f.editedS3Key || f.editedR2Key).map(f => f.fileId)
  }
}
