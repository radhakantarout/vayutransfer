'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

interface Props {
  onFileSelect: (file: File) => void
  file?: File | null
  disabled?: boolean
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export default function UploadZone({ onFileSelect, file: fileProp, disabled }: Props) {
  const [dragOver, setDragOver] = useState(false)
  const [selected, setSelected] = useState<File | null>(fileProp ?? null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (fileProp) setSelected(fileProp)
  }, [fileProp])

  const handleFile = useCallback((file: File) => {
    setSelected(file)
    onFileSelect(file)
  }, [onFileSelect])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (disabled) return
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [disabled, handleFile])

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    if (!disabled) setDragOver(true)
  }

  const onDragLeave = () => setDragOver(false)

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  return (
    <div
      className={`
        relative border-2 border-dashed rounded-xl p-10 text-center cursor-pointer
        transition-all duration-200 select-none
        ${dragOver
          ? 'border-accent bg-accent/5 scale-[1.01]'
          : selected
          ? 'border-success bg-success/5'
          : 'border-border bg-card hover:border-accent/60 hover:bg-card/80'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onClick={() => !disabled && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={onInputChange}
        disabled={disabled}
      />

      {selected ? (
        <div className="space-y-2">
          <div className="text-4xl">📄</div>
          <div className="font-semibold text-text-primary truncate max-w-xs mx-auto">
            {selected.name}
          </div>
          <div className="text-muted text-sm">{formatBytes(selected.size)}</div>
          <div className="text-accent text-sm mt-2">Click to change file</div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-5xl">{dragOver ? '📂' : '☁️'}</div>
          <div className="text-text-primary font-semibold text-lg">
            {dragOver ? 'Drop to upload' : 'Drag & drop your file here'}
          </div>
          <div className="text-muted text-sm">or click to browse · up to 10GB</div>
        </div>
      )}
    </div>
  )
}
