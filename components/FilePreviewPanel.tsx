'use client'

import { useState, useEffect } from 'react'
import { FileTypeIcon, EyeIcon } from '@/components/icons'
import type { FileEntry } from '@/types'

interface Props {
  entries: FileEntry[]
  selectedPath: string | null
}

// Extensions the browser can't natively render but we can still preview by
// parsing the file ourselves, entirely client-side, before anything uploads.
const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'csv', 'json', 'log', 'xml', 'yaml', 'yml',
  'js', 'ts', 'tsx', 'jsx', 'css', 'html', 'py', 'java', 'c', 'cpp', 'sh',
])
const TEXT_PREVIEW_MAX_CHARS = 50_000

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

type Kind = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'docx' | 'none'

function kindOf(type: string, ext: string): Kind {
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('audio/')) return 'audio'
  if (ext === 'pdf') return 'pdf'
  if (ext === 'docx') return 'docx'
  if (TEXT_EXTENSIONS.has(ext) || type.startsWith('text/') || type === 'application/json') return 'text'
  return 'none'
}

// Browser-native preview of a locally selected file, before anything is
// uploaded — objectURLs/parsed content are created client-side only.
// docx is converted to HTML via mammoth.js (client-side, no upload needed);
// plain-text/code files are read and shown as-is. Everything else (xlsx,
// pptx, proprietary formats) has no reliable client-side renderer, so it
// falls back to an icon + filename.
export default function FilePreviewPanel({ entries, selectedPath }: Props) {
  const selected = entries.find((e) => e.path === selectedPath) ?? entries[0] ?? null
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [textContent, setTextContent] = useState<string | null>(null)
  const [docxHtml, setDocxHtml] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [loadingContent, setLoadingContent] = useState(false)

  useEffect(() => {
    setObjectUrl(null)
    setTextContent(null)
    setDocxHtml(null)
    setPreviewError(null)
    if (!selected) return

    let cancelled = false
    const url = URL.createObjectURL(selected.file)
    setObjectUrl(url)

    const ext = selected.path.split('.').pop()?.toLowerCase() ?? ''
    const kind = kindOf(selected.file.type, ext)

    if (kind === 'text') {
      setLoadingContent(true)
      selected.file.text()
        .then((text) => { if (!cancelled) setTextContent(text.slice(0, TEXT_PREVIEW_MAX_CHARS)) })
        .catch(() => { if (!cancelled) setPreviewError('Could not read this file') })
        .finally(() => { if (!cancelled) setLoadingContent(false) })
    } else if (kind === 'docx') {
      setLoadingContent(true)
      Promise.all([selected.file.arrayBuffer(), import('mammoth/mammoth.browser')])
        .then(([buffer, mammoth]) => mammoth.convertToHtml({ arrayBuffer: buffer }))
        .then((result) => { if (!cancelled) setDocxHtml(result.value) })
        .catch(() => { if (!cancelled) setPreviewError('Could not preview this document') })
        .finally(() => { if (!cancelled) setLoadingContent(false) })
    }

    return () => {
      cancelled = true
      URL.revokeObjectURL(url)
    }
  }, [selected])

  if (!selected || !objectUrl) {
    return (
      <div className="bg-card border border-border rounded-2xl p-10 flex flex-col items-center justify-center gap-3 text-center min-h-[280px]">
        <EyeIcon className="w-8 h-8 text-muted" />
        <div className="text-sm text-muted">Select a file to preview it here</div>
      </div>
    )
  }

  const type = selected.file.type
  const ext = selected.path.split('.').pop()?.toLowerCase() ?? ''
  const kind = kindOf(type, ext)

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="bg-bg flex items-center justify-center min-h-[220px] max-h-[360px] overflow-hidden">
        {kind === 'image' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={objectUrl} alt={selected.path} className="max-w-full max-h-[360px] object-contain" />
        ) : kind === 'video' ? (
          <video src={objectUrl} controls className="max-w-full max-h-[360px]" />
        ) : kind === 'audio' ? (
          <div className="w-full p-8 space-y-4 text-center">
            <FileTypeIcon fileName={selected.path} className="w-12 h-12 mx-auto text-accent" />
            <audio src={objectUrl} controls className="w-full" />
          </div>
        ) : kind === 'pdf' ? (
          <iframe src={objectUrl} title={selected.path} className="w-full h-[360px]" />
        ) : loadingContent ? (
          <div className="p-10 text-center space-y-3">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
            <div className="text-sm text-muted">Preparing preview…</div>
          </div>
        ) : previewError ? (
          <div className="p-10 text-center space-y-3">
            <FileTypeIcon fileName={selected.path} className="w-12 h-12 mx-auto text-muted" />
            <div className="text-sm text-muted">{previewError}</div>
          </div>
        ) : kind === 'text' && textContent !== null ? (
          <pre className="w-full h-[360px] overflow-auto p-4 text-xs text-text-primary font-mono whitespace-pre-wrap break-words text-left">
            {textContent}
          </pre>
        ) : kind === 'docx' && docxHtml !== null ? (
          <div
            className="w-full h-[360px] overflow-auto p-6 text-sm text-text-primary text-left prose-sm [&_p]:mb-3 [&_h1]:font-bold [&_h1]:text-lg [&_h2]:font-bold [&_h2]:text-base [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1"
            dangerouslySetInnerHTML={{ __html: docxHtml }}
          />
        ) : (
          <div className="p-10 text-center space-y-3">
            <FileTypeIcon fileName={selected.path} className="w-12 h-12 mx-auto text-muted" />
            <div className="text-sm text-muted">No preview available for this file type</div>
          </div>
        )}
      </div>
      <div className="px-4 py-3 border-t border-border flex items-center gap-3">
        <FileTypeIcon fileName={selected.path} className="w-4 h-4 text-muted flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm text-text-primary truncate">{selected.path}</div>
          <div className="text-xs text-muted">{formatBytes(selected.file.size)}</div>
        </div>
      </div>
    </div>
  )
}
