'use client'

// Raw Transfer's "Send" page — a 4-step flow (idle → select → review →
// uploading) mirroring VayuTransfer's own TransferFlow.tsx shape, rebuilt
// natively for VayuStudios' storage-quota billing and images/video-only
// restriction. Multi-file/folder selection, a live preview panel, a review
// step (title/expiry/mandatory event tag), and a per-file progress list with
// auto-retry-per-chunk and cross-reload resume (both already existing
// infrastructure — see lib/studio/clientUpload.ts / rawTransferUpload.ts —
// just correctly wired here for the first time in a multi-file flow).

import { useRef, useState } from 'react'
import type { StudioProject } from '@/types/studio'
import TransferDestinationPicker from './TransferDestinationPicker'
import StorageStatusCard from './StorageStatusCard'
import RawTransferHowItWorks from './RawTransferHowItWorks'
import RawTransferFileList from './RawTransferFileList'
import RawTransferUploadProgress from './RawTransferUploadProgress'
import { useBatchSend, type PickedFile } from './useBatchSend'
import { useRawTransfers } from './useRawTransfers'
import { DEFAULT_TRANSFER_EXPIRY_DAYS, TRANSFER_EXTEND_DAY_OPTIONS } from '@/lib/studio/transferConfig'
import { fmtBytes } from './transferUtils'

type Step = 'idle' | 'select' | 'review' | 'uploading'
const MAX_TITLE_CHARS = 100

function isAcceptedType(file: File): boolean {
  return file.type.startsWith('image/') || file.type.startsWith('video/')
}

// Recursively flattens a dropped folder into { file, relativePath } pairs —
// same webkitGetAsEntry technique VayuTransfer's own UploadZone.tsx uses (new
// local implementation, not shared code, per the established product-
// separation rule).
async function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  const entries: FileSystemEntry[] = []
  let batch: FileSystemEntry[]
  do {
    batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject))
    entries.push(...batch)
  } while (batch.length > 0)
  return entries
}

async function traverseEntry(entry: FileSystemEntry, path: string, out: { file: File; relativePath: string }[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject))
    out.push({ file, relativePath: `${path}${entry.name}` })
  } else if (entry.isDirectory) {
    const children = await readAllEntries((entry as FileSystemDirectoryEntry).createReader())
    for (const child of children) await traverseEntry(child, `${path}${entry.name}/`, out)
  }
}

async function extractFromDataTransfer(dataTransfer: DataTransfer): Promise<{ file: File; relativePath: string }[]> {
  const items = Array.from(dataTransfer.items)
  const entries = items.map(i => i.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => !!e)
  if (entries.length === 0) {
    return Array.from(dataTransfer.files).map(file => ({ file, relativePath: file.name }))
  }
  const out: { file: File; relativePath: string }[] = []
  for (const entry of entries) await traverseEntry(entry, '', out)
  return out
}

function filesFromInput(fileList: FileList): { file: File; relativePath: string }[] {
  return Array.from(fileList).map(file => ({
    file, relativePath: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
  }))
}

export default function RawTransferSend() {
  const { resolveProject } = useRawTransfers()
  const batch = useBatchSend()

  const [step, setStep] = useState<Step>('idle')
  const [pickedFiles, setPickedFiles] = useState<PickedFile[]>([])
  const [rejectedCount, setRejectedCount] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const [target, setTarget] = useState<StudioProject | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [expiryDays, setExpiryDays] = useState<number>(DEFAULT_TRANSFER_EXPIRY_DAYS)
  const [error, setError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  const addPicked = (incoming: { file: File; relativePath: string }[]) => {
    const accepted = incoming.filter(i => isAcceptedType(i.file))
    setRejectedCount(incoming.length - accepted.length)
    if (accepted.length === 0) return
    setPickedFiles(prev => {
      const existingPaths = new Set(prev.map(p => p.relativePath))
      const additions = accepted
        .filter(i => !existingPaths.has(i.relativePath))
        .map(i => ({ id: crypto.randomUUID(), file: i.file, relativePath: i.relativePath }))
      return [...prev, ...additions]
    })
    setStep('select')
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const extracted = await extractFromDataTransfer(e.dataTransfer)
    addPicked(extracted)
  }

  const removeItem = (id: string) => setPickedFiles(prev => prev.filter(p => p.id !== id))
  const clearAll = () => { setPickedFiles([]); setStep('idle') }

  const startUpload = async () => {
    if (!target) { setPickerOpen(true); return }
    setError(null)
    setStep('uploading')
    await batch.start(pickedFiles, target, { note: title.trim() || undefined, expiryDays })
  }

  const onPickerChoose = async (targetProjectId: string): Promise<{ success: boolean }> => {
    const chosen = await resolveProject(targetProjectId)
    setTarget(chosen)
    return { success: true }
  }

  const startOver = () => {
    setStep('idle'); setPickedFiles([]); setTitle(''); setExpiryDays(DEFAULT_TRANSFER_EXPIRY_DAYS)
    setTarget(null); batch.reset()
  }

  const totalSize = pickedFiles.reduce((sum, p) => sum + p.file.size, 0)

  if (step === 'uploading') {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <RawTransferUploadProgress
          items={batch.items}
          startedAt={batch.startedAt}
          shareUrl={batch.shareUrl}
          onRetry={(id) => batch.retry(id)}
          onCancel={batch.cancelAll}
        />
        {batch.items.length > 0 && batch.items.every(i => i.status === 'done' || i.status === 'failed') && (
          <div className="text-center">
            <button onClick={startOver} className="text-sm text-accent font-semibold hover:underline">Send more files</button>
          </div>
        )}
      </div>
    )
  }

  if (step === 'review') {
    return (
      <div className="max-w-lg mx-auto space-y-4">
        <button onClick={() => setStep('select')} className="text-xs text-muted hover:text-text-primary transition-colors">← Back</button>
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <h2 className="text-base font-bold text-text-primary">Review Your Transfer</h2>

          <div className="flex items-center justify-between bg-bg border border-border rounded-xl px-3 py-2.5">
            <div className="text-xs">
              <span className="font-semibold text-text-primary">{pickedFiles.length} items</span>
              <span className="text-muted"> · {fmtBytes(totalSize)}</span>
            </div>
            <button onClick={() => setStep('select')} className="text-xs text-accent font-semibold hover:underline">Edit items</button>
          </div>

          <div>
            <label className="text-xs font-semibold text-text-primary">Give a title to this transfer</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, MAX_TITLE_CHARS))}
              placeholder="e.g. Wedding raws, Reception drone footage…"
              className="w-full mt-1 bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent/60"
            />
            <div className="text-right text-[10px] text-muted mt-0.5">{title.length}/{MAX_TITLE_CHARS}</div>
          </div>

          <div>
            <label className="text-xs font-semibold text-text-primary">Link stays active for</label>
            <div className="flex items-center gap-2 mt-1.5">
              {TRANSFER_EXTEND_DAY_OPTIONS.map(d => (
                <button key={d} onClick={() => setExpiryDays(d)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                    expiryDays === d ? 'bg-accent text-bg border-accent' : 'border-border text-muted hover:text-text-primary'
                  }`}>
                  {d}d
                </button>
              ))}
              <span className="text-[11px] text-muted">extendable later</span>
            </div>
          </div>

          <div className="bg-bg border border-border rounded-xl px-3 py-2.5 text-xs text-text-primary">
            {fmtBytes(totalSize)} · <span className="text-success font-semibold">Included in your VayuStudios plan</span>
          </div>

          {target ? (
            <div className="flex items-center gap-1.5 text-xs text-muted">
              <span>Tagged to <span className="font-semibold text-text-primary">{target.clientName} · {(target.eventType ?? '').replace(/_/g, ' ')}</span></span>
              <button onClick={() => setPickerOpen(true)} className="text-accent font-semibold hover:underline">Change</button>
            </div>
          ) : (
            <button onClick={() => setPickerOpen(true)}
              className="w-full border border-border text-sm font-semibold text-text-primary py-2.5 rounded-xl hover:bg-border/40 transition-colors">
              Tag an event
            </button>
          )}

          {error && <p className="text-xs text-danger">{error}</p>}

          <button onClick={startUpload} disabled={!target}
            className="w-full bg-gradient-to-r from-accent to-[#7C3AED] text-white text-sm font-bold py-2.5 rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity">
            {target ? 'Create Transfer' : 'Tag an event to continue'}
          </button>
        </div>

        {pickerOpen && (
          <TransferDestinationPicker
            title="Send file to"
            mode="studio-wide"
            onClose={() => setPickerOpen(false)}
            onChoose={onPickerChoose}
          />
        )}
      </div>
    )
  }

  if (step === 'select') {
    return (
      <div className="max-w-4xl mx-auto">
        <RawTransferFileList
          items={pickedFiles}
          onRemove={removeItem}
          onClearAll={clearAll}
          onAddFiles={(files) => addPicked(filesFromInput(files))}
          onAddFolder={(files) => addPicked(filesFromInput(files))}
          onBack={() => setStep('idle')}
          onContinue={() => setStep('review')}
        />
      </div>
    )
  }

  // idle
  return (
    <div className="max-w-4xl mx-auto space-y-10">
      <div className="text-center space-y-2 relative">
        {/* Floating decorative file-type chips — pure CSS motion, no image
            assets, same "dynamic" feel as VayuTransfer's own hero without
            needing an actual GIF (see plan Context for why). */}
        <div className="hidden sm:block absolute -top-2 left-1/4 text-2xl opacity-70 animate-[float_6s_ease-in-out_infinite]">🖼️</div>
        <div className="hidden sm:block absolute top-4 right-1/4 text-2xl opacity-70 animate-[float_7s_ease-in-out_infinite_0.5s]">🎬</div>
        <div className="hidden sm:block absolute -top-4 right-[15%] text-xl opacity-60 animate-[float_5s_ease-in-out_infinite_1s]">📷</div>
        <style>{`@keyframes float { 0%,100% { transform: translateY(0) rotate(0deg) } 50% { transform: translateY(-10px) rotate(6deg) } }`}</style>

        <h1 className="text-3xl sm:text-4xl font-bold text-text-primary">Send it, they&apos;ll love it.</h1>
        <p className="text-sm text-muted">Drop in a RAW photo, video, or a whole folder — tagged straight to the right event.</p>
      </div>

      <div className="flex flex-wrap justify-center gap-8">
        <div className="text-center"><div className="text-lg font-bold text-text-primary">Included</div><div className="text-[11px] text-muted max-w-[140px]">in your plan — storage &amp; downloads</div></div>
        <div className="text-center"><div className="text-lg font-bold text-text-primary">Auto-resume</div><div className="text-[11px] text-muted max-w-[140px]">picks up right where a dropped connection left off</div></div>
        <div className="text-center"><div className="text-lg font-bold text-text-primary">Photos &amp; Videos</div><div className="text-[11px] text-muted max-w-[140px]">the only file types accepted</div></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1.35fr_1fr] gap-4 items-start">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all space-y-3 hover:shadow-lg hover:-translate-y-0.5 ${
            dragOver ? 'border-accent bg-accent/5 scale-[1.01]' : 'border-border hover:border-accent/50'
          }`}
        >
          <div className="text-4xl">📤</div>
          <div className="text-text-primary font-semibold">Drop files or folders anywhere</div>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <button onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
              className="text-xs font-bold bg-gradient-to-r from-accent to-[#7C3AED] text-white px-4 py-2 rounded-lg hover:opacity-90 transition-opacity">
              Browse Files
            </button>
            <button onClick={(e) => { e.stopPropagation(); folderInputRef.current?.click() }}
              className="text-xs font-semibold border border-border text-text-primary px-4 py-2 rounded-lg hover:bg-border/40 transition-colors">
              Browse Folder
            </button>
          </div>
          <div className="text-xs text-muted">photos and videos only</div>
          {rejectedCount > 0 && (
            <p className="text-[11px] text-danger">{rejectedCount} file{rejectedCount !== 1 ? 's' : ''} skipped — photos and videos only.</p>
          )}
          <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple className="hidden"
            onChange={(e) => { if (e.target.files) addPicked(filesFromInput(e.target.files)); e.target.value = '' }} />
          {/* @ts-expect-error webkitdirectory isn't in the standard input attribute typings */}
          <input ref={folderInputRef} type="file" webkitdirectory="" directory="" className="hidden"
            onChange={(e) => { if (e.target.files) addPicked(filesFromInput(e.target.files)); e.target.value = '' }} />
        </div>

        <StorageStatusCard />
      </div>

      <RawTransferHowItWorks />
    </div>
  )
}
