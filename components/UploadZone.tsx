'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { MAX_FILE_SIZE_GB } from '@/constants/pricing'
import { FileTypeIcon, UploadCloudIcon, FolderIcon, CloseIcon, DriveIcon } from '@/components/icons'
import DuplicateFilesModal from '@/components/DuplicateFilesModal'
import PastTransferDuplicateModal from '@/components/PastTransferDuplicateModal'
import GoogleDriveImportButton from '@/components/GoogleDriveImportButton'
import type { FileEntry, DriveFileEntry } from '@/types'

const BLOCK_BYTES = MAX_FILE_SIZE_GB * 1024 * 1024 * 1024
const WARN_BYTES  = 2 * 1024 * 1024 * 1024   // 2 GB

// Finds the first free "name (1).ext" / "name (2).ext" ... variant of `path`
// against `taken` — same convention OS file managers use for "keep both".
// Works for a plain filename or a folder-prefixed relative path alike.
function dedupeName(path: string, taken: Set<string>): string {
  if (!taken.has(path)) return path
  const slash = path.lastIndexOf('/')
  const dir = slash >= 0 ? path.slice(0, slash + 1) : ''
  const base = slash >= 0 ? path.slice(slash + 1) : path
  const dot = base.lastIndexOf('.')
  const stem = dot > 0 ? base.slice(0, dot) : base
  const ext = dot > 0 ? base.slice(dot) : ''
  let n = 1
  let candidate = `${dir}${stem} (${n})${ext}`
  while (taken.has(candidate)) {
    n++
    candidate = `${dir}${stem} (${n})${ext}`
  }
  return candidate
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

// Reads all entries from a directory reader (batches of ≤100)
async function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  const all: FileSystemEntry[] = []
  const read = (): Promise<void> =>
    new Promise((resolve) =>
      reader.readEntries((batch) => {
        if (batch.length === 0) return resolve()
        all.push(...batch)
        read().then(resolve)
      })
    )
  await read()
  return all
}

// Recursively traverses a FileSystemEntry, returning flat FileEntry list
async function traverseEntry(entry: FileSystemEntry, basePath = ''): Promise<FileEntry[]> {
  if (entry.isFile) {
    return new Promise((resolve, reject) =>
      (entry as FileSystemFileEntry).file(
        (f) => resolve([{ file: f, path: basePath + f.name }]),
        reject
      )
    )
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    const subEntries = await readAllEntries(reader)
    const nested = await Promise.all(
      subEntries.map((e) => traverseEntry(e, `${basePath}${entry.name}/`))
    )
    return nested.flat()
  }
  return []
}

interface Props {
  onFilesSelect: (entries: FileEntry[]) => void
  entries?: FileEntry[]
  disabled?: boolean
  selectedPath?: string | null
  onSelectPath?: (path: string) => void
  // Opt-in — checks a newly-added single file against the caller's own past
  // ACTIVE transfers (server-side, by exact fileName+size) and offers "Use
  // existing link" / "Replace" / "Cancel". Off by default since it only
  // makes sense for the main upload flow (checking against MY past
  // transfers) — not the receive-link uploader, who has no wallet of their
  // own to check against.
  enableDuplicateCheck?: boolean
  // Google Drive-picked files, rendered in the exact same list as local
  // entries (same row styling, same remove button) — the two sources are
  // mutually exclusive per transfer (picking one clears the other), since
  // they go through genuinely different upload pipelines downstream
  // (client-chunked bytes vs. a server-side Lambda streaming from Drive).
  // Omit entirely to not offer the Drive button at all (e.g. the
  // receive-link uploader, who has no VayuTransfer wallet/session of their
  // own to run Drive import through).
  driveEntries?: DriveFileEntry[]
  onDriveFilesSelect?: (files: DriveFileEntry[]) => void
}

interface PastDuplicateMatch {
  fileId: string
  shareableLink: string
  createdAt: string
  expiryTime: string
}

export default function UploadZone({
  onFilesSelect, entries: entriesProp, disabled, selectedPath, onSelectPath, enableDuplicateCheck,
  driveEntries = [], onDriveFilesSelect,
}: Props) {
  const [dragOver, setDragOver] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [entries, setEntries] = useState<FileEntry[]>(entriesProp ?? [])
  // Set only while a just-added batch has name collisions against what's
  // already selected, awaiting the user's Overwrite/Keep both/Cancel choice.
  const [pendingAdd, setPendingAdd] = useState<{ incoming: FileEntry[]; prev: FileEntry[] } | null>(null)
  // Set only while a just-added single file matches a past ACTIVE transfer
  // from this same wallet, awaiting Use-existing/Replace/Cancel.
  const [crossDuplicate, setCrossDuplicate] = useState<{ entry: FileEntry; prev: FileEntry[]; match: PastDuplicateMatch } | null>(null)
  const [replacing, setReplacing] = useState(false)
  // Transient — cleared as soon as anything else changes the selection.
  const [driveUnsupported, setDriveUnsupported] = useState<string[]>([])
  const filesRef = useRef<HTMLInputElement>(null)
  const folderRef = useRef<HTMLInputElement>(null)
  // Guards the async check-duplicate/invalidate calls against calling
  // setState after this component has unmounted.
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // Restore entries when re-mounted in pricing layout
  useEffect(() => {
    if (entriesProp && entriesProp.length > 0) setEntries(entriesProp)
  }, [entriesProp])

  const emit = useCallback((updated: FileEntry[]) => {
    setEntries(updated)
    onFilesSelect(updated)
  }, [onFilesSelect])

  // Fire-and-continue: checks a single newly-added file against the
  // wallet's own past ACTIVE transfers. On no match (or on any error —
  // failing open rather than blocking upload over a non-critical check),
  // merges the file in as normal; on a match, pauses and surfaces the
  // Use-existing/Replace/Cancel choice instead.
  const checkPastDuplicate = useCallback(async (entry: FileEntry, prev: FileEntry[]) => {
    try {
      const res = await fetch(
        `/api/transfers/check-duplicate?fileName=${encodeURIComponent(entry.file.name)}&fileSizeBytes=${entry.file.size}`
      ).then((r) => r.json())
      if (!mountedRef.current) return
      if (res.success && res.data?.duplicate) {
        setCrossDuplicate({ entry, prev, match: res.data })
        return
      }
    } catch {
      if (!mountedRef.current) return
    }
    const updated = [...prev, entry]
    setEntries(updated)
    onFilesSelect(updated)
  }, [onFilesSelect])

  const addEntries = useCallback((incoming: FileEntry[]) => {
    // Local files replace any active Drive selection — the two sources
    // can't be mixed into one transfer (different upload pipelines).
    if (driveEntries.length > 0) {
      onDriveFilesSelect?.([])
      setDriveUnsupported([])
    }
    setEntries((prev) => {
      const prevPaths = new Set(prev.map((e) => e.path))
      const hasDuplicate = incoming.some((e) => prevPaths.has(e.path))
      if (hasDuplicate) {
        // Don't merge yet — surface the Overwrite/Keep both/Cancel choice
        // and leave `prev` untouched until the user decides.
        setPendingAdd({ incoming, prev })
        return prev
      }
      if (enableDuplicateCheck && incoming.length === 1) {
        checkPastDuplicate(incoming[0], prev)
        return prev // merge happens once the async check resolves
      }
      const updated = [...prev, ...incoming]
      onFilesSelect(updated)
      return updated
    })
  }, [onFilesSelect, enableDuplicateCheck, checkPastDuplicate, driveEntries, onDriveFilesSelect])

  // Google Drive resolution replaces any active local selection — same
  // mutual-exclusivity rule as above, the other direction.
  const handleDriveResolved = useCallback((files: DriveFileEntry[], unsupported: string[]) => {
    if (entries.length > 0) emit([])
    onDriveFilesSelect?.(files)
    setDriveUnsupported(unsupported)
  }, [entries, emit, onDriveFilesSelect])

  const removeDriveEntry = (driveFileId: string) => {
    onDriveFilesSelect?.(driveEntries.filter((f) => f.driveFileId !== driveFileId))
  }

  const dismissCrossDuplicate = () => setCrossDuplicate(null)

  const replaceCrossDuplicate = useCallback(async () => {
    if (!crossDuplicate) return
    setReplacing(true)
    try {
      await fetch(`/api/transfers/${crossDuplicate.match.fileId}/invalidate`, { method: 'POST' })
    } catch {
      // Best-effort — even if invalidation failed, still let the new
      // upload through rather than blocking the user entirely.
    }
    if (!mountedRef.current) return
    const { entry, prev } = crossDuplicate
    setReplacing(false)
    setCrossDuplicate(null)
    const updated = [...prev, entry]
    setEntries(updated)
    onFilesSelect(updated)
  }, [crossDuplicate, onFilesSelect])

  const resolveDuplicates = useCallback((choice: 'overwrite' | 'keep-both' | 'cancel') => {
    if (!pendingAdd) return
    const { incoming, prev } = pendingAdd
    setPendingAdd(null)

    if (choice === 'cancel') {
      const prevPaths = new Set(prev.map((e) => e.path))
      const nonDuplicates = incoming.filter((e) => !prevPaths.has(e.path))
      if (nonDuplicates.length === 0) return
      emit([...prev, ...nonDuplicates])
      return
    }

    if (choice === 'overwrite') {
      const incomingPaths = new Set(incoming.map((e) => e.path))
      const kept = prev.filter((e) => !incomingPaths.has(e.path))
      emit([...kept, ...incoming])
      return
    }

    // keep-both — rename every incoming duplicate to the next free "(n)" slot
    const taken = new Set(prev.map((e) => e.path))
    const renamed = incoming.map((e) => {
      const path = dedupeName(e.path, taken)
      taken.add(path)
      return { ...e, path }
    })
    emit([...prev, ...renamed])
  }, [pendingAdd, emit])

  const removeEntry = (path: string) =>
    emit(entries.filter((e) => e.path !== path))

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (disabled) return
    const items = Array.from(e.dataTransfer.items)
    const fsEntries = items
      .map((i) => i.webkitGetAsEntry())
      .filter(Boolean) as FileSystemEntry[]
    if (!fsEntries.length) return
    setScanning(true)
    try {
      const results = await Promise.all(fsEntries.map((fe) => traverseEntry(fe)))
      addEntries(results.flat())
    } finally {
      setScanning(false)
    }
  }, [disabled, addEntries])

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    if (!disabled) setDragOver(true)
  }

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    addEntries(files.map((f) => ({ file: f, path: f.webkitRelativePath || f.name })))
    e.target.value = ''
  }

  const totalBytes = entries.reduce((s, e) => s + e.file.size, 0) + driveEntries.reduce((s, f) => s + f.sizeBytes, 0)
  const totalCount = entries.length + driveEntries.length
  const isBundle    = totalCount > 1
  const isOverBlock = isBundle && totalBytes > BLOCK_BYTES
  const isOverWarn  = isBundle && !isOverBlock && totalBytes > WARN_BYTES

  const clearAll = () => {
    emit([])
    onDriveFilesSelect?.([])
    setDriveUnsupported([])
  }

  // ── Files selected view ──────────────────────────────────────────────────
  if (totalCount > 0) {
    return (
      <>
      <div className={`border rounded-2xl overflow-hidden transition-all duration-200 shadow-sm ${
        isOverBlock ? 'border-danger' : isOverWarn ? 'border-yellow-500/60' : 'border-border'
      }`}>
        {/* Scrollable file list — local entries first, then any active
            Google Drive selection (the two never coexist in practice, since
            picking one clears the other, but rendered as one unified list
            either way so this screen looks identical regardless of source). */}
        <div className="max-h-56 overflow-y-auto divide-y divide-border">
          {entries.map((entry) => {
            const isSelected = selectedPath === entry.path
            return (
              <div
                key={entry.path}
                onClick={() => onSelectPath?.(entry.path)}
                className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${onSelectPath ? 'cursor-pointer' : ''} ${
                  isSelected ? 'bg-accent/10' : 'hover:bg-bg'
                }`}
              >
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-accent/20 text-accent' : 'bg-bg text-muted'}`}>
                  <FileTypeIcon fileName={entry.path} isFolder={entry.path.includes('/')} className="w-4 h-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className={`text-xs truncate ${isSelected ? 'text-accent font-medium' : 'text-text-primary'}`}>{entry.path}</div>
                </div>
                <span className="text-xs text-muted flex-shrink-0">{formatBytes(entry.file.size)}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); removeEntry(entry.path) }}
                  className="text-muted hover:text-danger transition-colors flex-shrink-0 p-0.5"
                >
                  <CloseIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            )
          })}
          {driveEntries.map((f) => {
            const isSelected = selectedPath === f.relativePath
            return (
              <div
                key={f.driveFileId}
                onClick={() => onSelectPath?.(f.relativePath)}
                className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${onSelectPath ? 'cursor-pointer' : ''} ${
                  isSelected ? 'bg-accent/10' : 'hover:bg-bg'
                }`}
              >
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-accent/20 text-accent' : 'bg-bg text-muted'}`}>
                  <FileTypeIcon fileName={f.relativePath} className="w-4 h-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className={`text-xs truncate ${isSelected ? 'text-accent font-medium' : 'text-text-primary'}`}>{f.relativePath}</div>
                </div>
                <DriveIcon className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="text-xs text-muted flex-shrink-0">{formatBytes(f.sizeBytes)}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); removeDriveEntry(f.driveFileId) }}
                  className="text-muted hover:text-danger transition-colors flex-shrink-0 p-0.5"
                >
                  <CloseIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-bg/50 border-t border-border space-y-2">
          {isOverBlock && (
            <p className="text-xs text-danger">Selection exceeds the {MAX_FILE_SIZE_GB} GB limit. Remove some files.</p>
          )}
          {isOverWarn && (
            <p className="text-xs text-yellow-400">Large selection — upload may take a while on slow connections.</p>
          )}
          {driveUnsupported.length > 0 && (
            <p className="text-xs text-muted">
              Skipped (unsupported): {driveUnsupported.slice(0, 3).join(', ')}{driveUnsupported.length > 3 ? '…' : ''}
            </p>
          )}

          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">
              {totalCount} {totalCount === 1 ? 'file' : 'files'} · {formatBytes(totalBytes)}
            </span>
            <button onClick={clearAll} className="text-xs text-danger hover:underline">
              Clear all
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => filesRef.current?.click()}
              className="flex-1 min-w-[45%] text-xs border border-border rounded-lg py-1.5 text-muted hover:border-accent hover:text-accent transition-colors"
            >
              + Add Files
            </button>
            <button
              onClick={() => folderRef.current?.click()}
              className="flex-1 min-w-[45%] text-xs border border-border rounded-lg py-1.5 text-muted hover:border-accent hover:text-accent transition-colors"
            >
              + Add Folder
            </button>
            {onDriveFilesSelect && <GoogleDriveImportButton variant="compact" mode="files" onFilesResolved={handleDriveResolved} />}
            {onDriveFilesSelect && <GoogleDriveImportButton variant="compact" mode="folder" onFilesResolved={handleDriveResolved} />}
          </div>
        </div>

        <input ref={filesRef} type="file" multiple className="hidden" onChange={onInputChange} />
        {/* @ts-expect-error webkitdirectory is non-standard but widely supported */}
        <input ref={folderRef} type="file" className="hidden" onChange={onInputChange} webkitdirectory="" />
      </div>
      {pendingAdd && (
        <DuplicateFilesModal
          duplicatePaths={pendingAdd.incoming
            .filter((e) => pendingAdd.prev.some((p) => p.path === e.path))
            .map((e) => e.path)}
          onOverwrite={() => resolveDuplicates('overwrite')}
          onKeepBoth={() => resolveDuplicates('keep-both')}
          onCancel={() => resolveDuplicates('cancel')}
        />
      )}
      {crossDuplicate && (
        <PastTransferDuplicateModal
          fileName={crossDuplicate.entry.file.name}
          shareableLink={crossDuplicate.match.shareableLink}
          createdAt={crossDuplicate.match.createdAt}
          expiryTime={crossDuplicate.match.expiryTime}
          replacing={replacing}
          onUseExisting={dismissCrossDuplicate}
          onReplace={replaceCrossDuplicate}
          onCancel={dismissCrossDuplicate}
        />
      )}
      </>
    )
  }

  // ── Empty drop zone ───────────────────────────────────────────────────────
  return (
    <>
    <div
      className={`
        relative border-2 border-dashed rounded-2xl p-10 text-center
        transition-all duration-200 select-none
        ${dragOver ? 'border-accent bg-accent/5 scale-[1.01]' : 'border-border bg-card hover:border-accent/60'}
        ${disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}
      `}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={() => setDragOver(false)}
    >
      <input ref={filesRef} type="file" multiple className="hidden" onChange={onInputChange} />
      {/* @ts-expect-error webkitdirectory is non-standard but widely supported */}
      <input ref={folderRef} type="file" className="hidden" onChange={onInputChange} webkitdirectory="" />

      <div className="space-y-4">
        <div className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center transition-colors ${dragOver ? 'bg-accent/20 text-accent' : 'bg-accent/10 text-accent'}`}>
          {dragOver ? <FolderIcon className="w-8 h-8" /> : <UploadCloudIcon className="w-8 h-8" />}
        </div>
        <div className="text-text-primary font-semibold text-lg">
          {scanning ? 'Scanning folders…' : dragOver ? 'Drop to add' : 'Drag & drop files or folders'}
        </div>
        {!scanning && !dragOver && (
          <>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <button
                onClick={(e) => { e.stopPropagation(); filesRef.current?.click() }}
                className="flex items-center gap-1.5 px-4 py-2 bg-accent/10 hover:bg-accent/20 border border-accent/30 text-accent text-sm font-medium rounded-lg transition-colors"
              >
                <FileTypeIcon fileName="" className="w-4 h-4" /> Add Files
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); folderRef.current?.click() }}
                className="flex items-center gap-1.5 px-4 py-2 bg-accent/10 hover:bg-accent/20 border border-accent/30 text-accent text-sm font-medium rounded-lg transition-colors"
              >
                <FolderIcon className="w-4 h-4" /> Add Folder
              </button>
              {onDriveFilesSelect && <GoogleDriveImportButton variant="primary" mode="files" onFilesResolved={handleDriveResolved} />}
              {onDriveFilesSelect && <GoogleDriveImportButton variant="primary" mode="folder" onFilesResolved={handleDriveResolved} />}
            </div>
            <div className="text-muted text-sm">up to 10 GB · any file type · folder structure preserved</div>
          </>
        )}
      </div>
    </div>
    {crossDuplicate && (
      <PastTransferDuplicateModal
        fileName={crossDuplicate.entry.file.name}
        shareableLink={crossDuplicate.match.shareableLink}
        createdAt={crossDuplicate.match.createdAt}
        expiryTime={crossDuplicate.match.expiryTime}
        replacing={replacing}
        onUseExisting={dismissCrossDuplicate}
        onReplace={replaceCrossDuplicate}
        onCancel={dismissCrossDuplicate}
      />
    )}
    </>
  )
}
