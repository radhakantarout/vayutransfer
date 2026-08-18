'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { MAX_FILE_SIZE_GB } from '@/constants/pricing'
import { FileTypeIcon, UploadCloudIcon, FolderIcon, CloseIcon, DriveIcon, CheckCircleIcon, fileTypeColor, ChevronDownIcon, ImageIcon, VideoIcon, DocumentTextIcon } from '@/components/icons'
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
  // Empty-state "Browse Files" is a single button that reveals a small
  // Files/Folder dropdown on click (local browsing needs two native input
  // modes — see UploadZone's own file-vs-folder input refs below). Google
  // Drive doesn't need this anymore — one click, one Picker session covers
  // both files and folders now (see GoogleDriveImportButton).
  const [showBrowseMenu, setShowBrowseMenu] = useState(false)
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
    // Folders aren't separate selectable rows (drag-drop/folder-pick flattens
    // straight to individual files with a path), so "folder count" here is
    // the number of distinct top-level folder names among local entries —
    // derived for the summary line, matching the mockup's "N folders · M
    // files" format without needing a structural change elsewhere.
    const folderCount = new Set(
      entries.filter((e) => e.path.includes('/')).map((e) => e.path.split('/')[0])
    ).size
    const fileCount = totalCount - folderCount

    return (
      <>
      <div className={`border rounded-2xl overflow-hidden transition-all duration-200 shadow-sm ${
        isOverBlock ? 'border-danger' : isOverWarn ? 'border-yellow-500/60' : 'border-border'
      }`}>
        {/* Card header */}
        <div className="px-4 py-3 border-b border-border">
          <span className="text-sm font-semibold text-text-primary">Selected Items ({totalCount})</span>
        </div>

        {/* Scrollable file list — local entries first, then any active
            Google Drive selection (the two never coexist in practice, since
            picking one clears the other, but rendered as one unified list
            either way so this screen looks identical regardless of source). */}
        <div className="max-h-56 overflow-y-auto divide-y divide-border">
          {entries.map((entry) => {
            const isSelected = selectedPath === entry.path
            const isFolder = entry.path.includes('/')
            return (
              <div
                key={entry.path}
                onClick={() => onSelectPath?.(entry.path)}
                className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${onSelectPath ? 'cursor-pointer' : ''} ${
                  isSelected ? 'bg-accent/10' : 'hover:bg-bg'
                }`}
              >
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-accent/10 ring-1 ring-accent/40' : 'bg-bg'}`}>
                  <FileTypeIcon fileName={entry.path} isFolder={isFolder} className={`w-4 h-4 ${fileTypeColor(entry.path, isFolder)}`} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className={`text-xs truncate ${isSelected ? 'text-accent font-medium' : 'text-text-primary'}`}>{entry.path}</div>
                </div>
                <CheckCircleIcon className="w-3.5 h-3.5 text-success flex-shrink-0" />
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
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-accent/10 ring-1 ring-accent/40' : 'bg-bg'}`}>
                  <FileTypeIcon fileName={f.relativePath} className={`w-4 h-4 ${fileTypeColor(f.relativePath)}`} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className={`text-xs truncate ${isSelected ? 'text-accent font-medium' : 'text-text-primary'}`}>{f.relativePath}</div>
                </div>
                <DriveIcon className="w-3.5 h-3.5 flex-shrink-0" />
                <CheckCircleIcon className="w-3.5 h-3.5 text-success flex-shrink-0" />
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
              {totalCount} {totalCount === 1 ? 'item' : 'items'}
              {folderCount > 0 && ` · ${folderCount} ${folderCount === 1 ? 'folder' : 'folders'} · ${fileCount} ${fileCount === 1 ? 'file' : 'files'}`}
              {' '}· Total size: {formatBytes(totalBytes)}
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
            {onDriveFilesSelect && <GoogleDriveImportButton variant="compact" onFilesResolved={handleDriveResolved} />}
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
        <div className="relative w-40 h-24 mx-auto">
          {/* Decorative floating file-type icons around the cloud — purely
              cosmetic, matching the reference mockup's scattered doc/image/
              video glyphs. Hidden while dragging so they don't compete with
              the "Drop to add" state. */}
          {!dragOver && (
            <>
              <span className="absolute left-1 top-0 w-6 h-6 rounded-lg bg-card border border-border text-muted flex items-center justify-center opacity-60 -rotate-12 motion-safe:animate-[float_4s_ease-in-out_infinite]" aria-hidden>
                <ImageIcon className="w-3 h-3" />
              </span>
              <span className="absolute right-2 top-1 w-6 h-6 rounded-lg bg-card border border-border text-muted flex items-center justify-center opacity-60 rotate-12 motion-safe:animate-[float_5s_ease-in-out_infinite_0.5s]" aria-hidden>
                <DocumentTextIcon className="w-3 h-3" />
              </span>
              <span className="absolute left-0 bottom-1 px-1.5 h-5 rounded-md bg-card border border-border text-[9px] font-bold text-muted flex items-center opacity-60 -rotate-6 motion-safe:animate-[float_4.5s_ease-in-out_infinite_1s]" aria-hidden>
                MP4
              </span>
              <span className="absolute right-0 bottom-0 w-6 h-6 rounded-lg bg-card border border-border text-muted flex items-center justify-center opacity-60 rotate-6 motion-safe:animate-[float_5.5s_ease-in-out_infinite_1.5s]" aria-hidden>
                <VideoIcon className="w-3 h-3" />
              </span>
            </>
          )}
          <div className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-accent/20 blur-xl" aria-hidden />
          <div className={`absolute inset-0 m-auto w-16 h-16 rounded-2xl flex items-center justify-center transition-colors motion-safe:animate-[float_3s_ease-in-out_infinite] ${dragOver ? 'bg-accent/20 text-accent' : 'bg-accent/10 text-accent'}`}>
            {dragOver ? <FolderIcon className="w-8 h-8" /> : <UploadCloudIcon className="w-8 h-8" />}
          </div>
        </div>
        <div className="text-text-primary font-semibold text-lg">
          {scanning ? 'Scanning folders…' : dragOver ? 'Drop to add' : 'Drop files or folders anywhere'}
        </div>
        {!scanning && !dragOver && (
          <>
            <div className="flex flex-col items-center gap-3">
              <div className="flex items-center justify-center gap-3 flex-wrap">
                {/* Browse Files — one button, dropdown reveals Files/Folder */}
                <div className="relative">
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowBrowseMenu((v) => !v) }}
                    className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-accent to-[#7C3AED] text-white text-sm font-bold rounded-xl shadow-md shadow-accent/25 hover:shadow-lg hover:shadow-accent/30 hover:-translate-y-0.5 transition-all"
                  >
                    Browse Files
                    <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform ${showBrowseMenu ? 'rotate-180' : ''}`} />
                  </button>
                  {showBrowseMenu && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowBrowseMenu(false)} />
                      <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-20 bg-card border border-border rounded-xl shadow-xl py-1 min-w-[160px]">
                        <button
                          onClick={(e) => { e.stopPropagation(); setShowBrowseMenu(false); filesRef.current?.click() }}
                          className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-text-primary hover:bg-border/50 transition-colors text-left"
                        >
                          <FileTypeIcon fileName="" className="w-4 h-4 flex-shrink-0" /> Browse Files
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setShowBrowseMenu(false); folderRef.current?.click() }}
                          className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-text-primary hover:bg-border/50 transition-colors text-left"
                        >
                          <FolderIcon className="w-4 h-4 flex-shrink-0" /> Browse Folder
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Google Drive — one click, one session, picks loose files
                    and whole folders together (setSelectFolderEnabled(true)
                    inside the component now — see its own comment). */}
                {onDriveFilesSelect && <GoogleDriveImportButton variant="primary" onFilesResolved={handleDriveResolved} />}
              </div>
            </div>
            <div className="flex items-center justify-center gap-2 flex-wrap">
              {['Up to 10 GB', 'Any file type', 'Folder structure preserved'].map((pill) => (
                <span key={pill} className="text-[11px] text-muted bg-bg border border-border rounded-full px-2.5 py-1">
                  {pill}
                </span>
              ))}
            </div>
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
