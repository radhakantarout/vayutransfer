'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import type { FileEntry } from '@/types'

const BLOCK_BYTES = 5 * 1024 * 1024 * 1024   // 5 GB
const WARN_BYTES  = 2 * 1024 * 1024 * 1024   // 2 GB

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function fileIcon(entry: FileEntry): string {
  const t = entry.file.type
  if (t.startsWith('image/')) return '🖼️'
  if (t.startsWith('video/')) return '🎬'
  if (t.startsWith('audio/')) return '🎵'
  if (t.includes('pdf'))      return '📕'
  if (t.includes('zip') || t.includes('rar') || t.includes('7z')) return '🗜️'
  if (entry.path.includes('/')) return '📁'
  return '📄'
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
}

export default function UploadZone({ onFilesSelect, entries: entriesProp, disabled }: Props) {
  const [dragOver, setDragOver] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [entries, setEntries] = useState<FileEntry[]>(entriesProp ?? [])
  const filesRef = useRef<HTMLInputElement>(null)
  const folderRef = useRef<HTMLInputElement>(null)

  // Restore entries when re-mounted in pricing layout
  useEffect(() => {
    if (entriesProp && entriesProp.length > 0) setEntries(entriesProp)
  }, [entriesProp])

  const emit = useCallback((updated: FileEntry[]) => {
    setEntries(updated)
    onFilesSelect(updated)
  }, [onFilesSelect])

  const addEntries = useCallback((incoming: FileEntry[]) => {
    setEntries((prev) => {
      const updated = [...prev, ...incoming]
      onFilesSelect(updated)
      return updated
    })
  }, [onFilesSelect])

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

  const totalBytes = entries.reduce((s, e) => s + e.file.size, 0)
  const isOverBlock = totalBytes > BLOCK_BYTES
  const isOverWarn  = !isOverBlock && totalBytes > WARN_BYTES

  // ── Files selected view ──────────────────────────────────────────────────
  if (entries.length > 0) {
    return (
      <div className={`border-2 border-dashed rounded-xl overflow-hidden transition-all duration-200 ${
        isOverBlock ? 'border-danger' : isOverWarn ? 'border-yellow-500/60' : 'border-success'
      }`}>
        {/* Scrollable file list */}
        <div className="max-h-52 overflow-y-auto divide-y divide-border">
          {entries.map((entry) => (
            <div key={entry.path} className="flex items-center gap-3 px-4 py-2">
              <span className="text-base flex-shrink-0">{fileIcon(entry)}</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-text-primary truncate">{entry.path}</div>
              </div>
              <span className="text-xs text-muted flex-shrink-0">{formatBytes(entry.file.size)}</span>
              <button
                onClick={() => removeEntry(entry.path)}
                className="text-muted hover:text-danger transition-colors text-base leading-none flex-shrink-0"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-card/50 border-t border-border space-y-2">
          {isOverBlock && (
            <p className="text-xs text-danger">Package exceeds 5 GB browser limit. Remove some files or upload individually.</p>
          )}
          {isOverWarn && (
            <p className="text-xs text-yellow-400">⚠️ Large package — zipping may be slow on some devices.</p>
          )}

          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">
              {entries.length} {entries.length === 1 ? 'file' : 'files'} · {formatBytes(totalBytes)}
              {entries.length > 1 && <span className="text-accent ml-1">· will be zipped</span>}
            </span>
            <button onClick={() => emit([])} className="text-xs text-danger hover:underline">
              Clear all
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => filesRef.current?.click()}
              className="flex-1 text-xs border border-border rounded-lg py-1.5 text-muted hover:border-accent hover:text-accent transition-colors"
            >
              + Add Files
            </button>
            <button
              onClick={() => folderRef.current?.click()}
              className="flex-1 text-xs border border-border rounded-lg py-1.5 text-muted hover:border-accent hover:text-accent transition-colors"
            >
              + Add Folder
            </button>
          </div>
        </div>

        <input ref={filesRef} type="file" multiple className="hidden" onChange={onInputChange} />
        {/* @ts-expect-error webkitdirectory is non-standard but widely supported */}
        <input ref={folderRef} type="file" className="hidden" onChange={onInputChange} webkitdirectory="" />
      </div>
    )
  }

  // ── Empty drop zone ───────────────────────────────────────────────────────
  return (
    <div
      className={`
        relative border-2 border-dashed rounded-xl p-10 text-center
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
        <div className="text-5xl">
          {scanning ? '⏳' : dragOver ? '📂' : '☁️'}
        </div>
        <div className="text-text-primary font-semibold text-lg">
          {scanning ? 'Scanning folders…' : dragOver ? 'Drop to add' : 'Drag & drop files or folders'}
        </div>
        {!scanning && !dragOver && (
          <>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={(e) => { e.stopPropagation(); filesRef.current?.click() }}
                className="flex items-center gap-1.5 px-4 py-2 bg-accent/10 hover:bg-accent/20 border border-accent/30 text-accent text-sm font-medium rounded-lg transition-colors"
              >
                📄 Add Files
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); folderRef.current?.click() }}
                className="flex items-center gap-1.5 px-4 py-2 bg-accent/10 hover:bg-accent/20 border border-accent/30 text-accent text-sm font-medium rounded-lg transition-colors"
              >
                📁 Add Folder
              </button>
            </div>
            <div className="text-muted text-sm">up to 10 GB · any file type · folder structure preserved</div>
          </>
        )}
      </div>
    </div>
  )
}
