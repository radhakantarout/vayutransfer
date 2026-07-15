import type { MediaFile, Selection, StudioProject } from '@/types/studio'

// Shared scope vocabulary for Quick Share and AI Sorting — keeps the five
// (six, including AI-only EDITED) filter definitions in exactly one place.
// STARRED/FAVORITE/FINAL are the admin's own curation pipeline
// (MediaFile.curationStatus) — not the client's loved/submitted state.
export type PhotoScope = 'ALL' | 'STARRED' | 'FAVORITE' | 'FINAL' | 'EDIT_REQUIRED' | 'EDITED'

export const PHOTO_SCOPE_LABEL: Record<PhotoScope, string> = {
  ALL:           'All gallery',
  STARRED:       'Starred (Admin only)',
  FAVORITE:      'Favorite (Admin only)',
  FINAL:         'Final (Admin only)',
  EDIT_REQUIRED: 'Edit required',
  EDITED:        'Edited',
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
    case 'STARRED':
      return files.filter(f => f.curationStatus === 'STARRED').map(f => f.fileId)
    case 'FAVORITE':
      return files.filter(f => f.curationStatus === 'FAVORITE').map(f => f.fileId)
    case 'FINAL':
      return files.filter(f => f.curationStatus === 'FINAL').map(f => f.fileId)
    case 'EDIT_REQUIRED': {
      const selectionByFileId = new Map(selections.map(s => [s.fileId, s]))
      return files.filter(f => selectionByFileId.get(f.fileId)?.editingRequired).map(f => f.fileId)
    }
    case 'EDITED':
      return files.filter(f => f.editedS3Key || f.editedR2Key).map(f => f.fileId)
  }
}
