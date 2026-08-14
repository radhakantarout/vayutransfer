'use client'

import { useState, useRef, useEffect } from 'react'
import { useSession, signIn } from 'next-auth/react'
import { AlertCircleIcon, DriveIcon, FolderIcon } from '@/components/icons'
import type { DriveFileEntry } from '@/types'

declare global {
  interface Window {
    gapi?: { load: (api: string, cb: () => void) => void }
    google?: {
      picker: {
        PickerBuilder: new () => GooglePickerBuilder
        DocsView: new (viewId?: unknown) => GoogleDocsView
        ViewId: { DOCS: unknown }
        DocsViewMode: { LIST: unknown }
        Feature: { MULTISELECT_ENABLED: unknown }
        Action: { PICKED: string; CANCEL: string }
      }
    }
  }
}
// Minimal structural types for the pieces of the Picker API this component
// actually calls — the full type surface isn't published as an npm
// package, so this avoids pulling in `any` for what is otherwise
// well-defined usage.
interface GoogleDocsView {
  setIncludeFolders: (v: boolean) => GoogleDocsView
  setSelectFolderEnabled: (v: boolean) => GoogleDocsView
  setOwnedByMe: (v: boolean) => GoogleDocsView
  setLabel: (label: string) => GoogleDocsView
  setMode: (mode: unknown) => GoogleDocsView
}
interface GooglePickerBuilder {
  addView: (view: GoogleDocsView) => GooglePickerBuilder
  setOAuthToken: (token: string) => GooglePickerBuilder
  setDeveloperKey: (key: string) => GooglePickerBuilder
  setAppId: (id: string) => GooglePickerBuilder
  setTitle: (title: string) => GooglePickerBuilder
  setSize: (width: number, height: number) => GooglePickerBuilder
  enableFeature: (feature: unknown) => GooglePickerBuilder
  setCallback: (cb: (data: PickerResponse) => void) => GooglePickerBuilder
  build: () => { setVisible: (v: boolean) => void }
}
interface PickerDoc {
  id: string
  name: string
  mimeType: string
}
interface PickerResponse {
  action: string
  docs?: PickerDoc[]
}

let pickerScriptPromise: Promise<void> | null = null
function loadPickerScript(): Promise<void> {
  if (window.google?.picker) return Promise.resolve()
  if (pickerScriptPromise) return pickerScriptPromise
  pickerScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://apis.google.com/js/api.js'
    script.onload = () => {
      window.gapi!.load('picker', () => resolve())
    }
    script.onerror = () => reject(new Error('Could not load Google Picker'))
    document.body.appendChild(script)
  })
  return pickerScriptPromise
}

interface Props {
  // Matches the two call sites in UploadZone.tsx (empty drop-zone vs. the
  // files-selected footer) so this reads like a natural sibling of the
  // existing Add Files/Add Folder buttons in both places.
  variant?: 'primary' | 'compact'
  // Mirrors the local Add Files vs. Add Folder split rather than one button
  // trying to do both. Google's Picker changes what a single click on a
  // folder row does depending on setSelectFolderEnabled: off, a click opens
  // the folder (normal browsing, for picking individual files inside it);
  // on, a click *selects* the folder itself and you must double-click to
  // look inside it. Trying to support both in one button/one click-model
  // was the source of the "no back / confusing" complaint — two clearly
  // labeled entry points removes the ambiguity instead of fighting Google's
  // own widget behavior.
  mode: 'files' | 'folder'
  // Hands the resolved selection to the caller instead of showing any
  // confirm UI of its own — the caller (UploadZone -> the upload page)
  // folds these into the exact same file-list/pricing/confirm screen a
  // local file or folder selection already goes through. This component's
  // only job is: connect, pick, resolve, hand off. (No need to also pass
  // the raw Picker items — each resolved file carries its own driveFileId,
  // which is all /api/google-drive/import needs to re-verify later.)
  onFilesResolved: (files: DriveFileEntry[], unsupported: string[]) => void
}

export default function GoogleDriveImportButton({ variant = 'primary', mode, onFilesResolved }: Props) {
  const { status: sessionStatus } = useSession()
  const [busy, setBusy] = useState(false)
  // Distinguishes "waiting on the Picker/network" (fast) from "server is
  // walking a large folder tree" (can take a while) so the button can say
  // something more honest than a static "Loading…" the whole time — a
  // static label with no other feedback is what made the page feel frozen
  // on a big folder.
  const [resolving, setResolving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const handleClick = async () => {
    setError(null)
    setBusy(true)
    try {
      if (sessionStatus !== 'authenticated') {
        await signIn('google')
        return // signIn triggers a redirect; nothing more to do here
      }

      const statusRes = await fetch('/api/google-drive/status').then((r) => r.json())
      if (!statusRes.data?.connected) {
        window.location.href = '/api/google-drive/auth'
        return
      }

      const tokenRes = await fetch('/api/google-drive/picker-token', { method: 'POST' }).then((r) => r.json())
      if (!tokenRes.success) {
        setError('Reconnect your Google Drive account and try again.')
        return
      }

      await loadPickerScript()
      if (!mountedRef.current) return

      const google = window.google!
      const folderMode = mode === 'folder'
      // Two labeled views ("My Drive" + "Shared with me") instead of one
      // bare DocsView — Picker only renders its left-hand source sidebar
      // (the thing that makes it actually look/feel like Drive rather than
      // a stripped-down file list) once more than one view is added.
      //
      // LIST mode (not GRID/thumbnail) on purpose: Picker's own thumbnail
      // images fail to load under third-party-cookie blocking (Safari by
      // default, many privacy-hardened Chrome/Brave/Firefox setups) —
      // confirmed 2026-08-14, not something this app can fix since it's
      // Google's own iframe fetching Google's own thumbnail URLs. A grid of
      // broken checkerboard placeholders reads as "this is broken"; a plain
      // list with small file-type icons degrades gracefully instead. The
      // app's own post-selection preview panel (FilePreviewPanel, backed by
      // /api/google-drive/thumbnail) is unaffected either way — it fetches
      // server-side, not through the browser's cookie jar.
      const makeView = (label: string, ownedByMe: boolean) => {
        const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
          .setIncludeFolders(true)
          .setSelectFolderEnabled(folderMode)
          .setLabel(label)
          .setMode(google.picker.DocsViewMode.LIST)
        if (!ownedByMe) view.setOwnedByMe(false)
        return view
      }

      const picker = new google.picker.PickerBuilder()
        .addView(makeView('My Drive', true))
        .addView(makeView('Shared with me', false))
        .setTitle(folderMode ? 'Select a folder to import' : 'Select files to import')
        // Google's default dialog size left the grid cramped (2 rows
        // visible before scrolling) — this is near the widget's own max
        // of (1051, 650), auto-centered on screen.
        .setSize(1050, 650)
        .setOAuthToken(tokenRes.data.accessToken)
        .setDeveloperKey(process.env.NEXT_PUBLIC_GOOGLE_API_KEY ?? '')
        .setAppId(process.env.NEXT_PUBLIC_GOOGLE_APP_ID ?? '')
        .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
        .setCallback((data: PickerResponse) => {
          if (data.action === google.picker.Action.PICKED && data.docs?.length) {
            void handlePicked(data.docs)
          }
        })
        .build()
      picker.setVisible(true)
    } catch (err) {
      console.error('[drive import]', err)
      setError('Something went wrong opening Google Drive. Please try again.')
    } finally {
      if (mountedRef.current) setBusy(false)
    }
  }

  const handlePicked = async (docs: PickerDoc[]) => {
    setBusy(true)
    setResolving(true)
    try {
      const items = docs.map((d) => ({ id: d.id, mimeType: d.mimeType }))
      const listRes = await fetch('/api/google-drive/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      }).then((r) => r.json())
      if (!mountedRef.current) return

      if (!listRes.success) {
        setError(listRes.message ?? 'Could not read your Google Drive selection.')
        return
      }

      onFilesResolved(listRes.data.files, listRes.data.unsupported ?? [])
    } catch {
      if (mountedRef.current) setError('Network error — please try again.')
    } finally {
      if (mountedRef.current) { setBusy(false); setResolving(false) }
    }
  }

  const buttonClass = variant === 'primary'
    ? 'flex items-center gap-1.5 px-4 py-2 bg-accent/10 hover:bg-accent/20 border border-accent/30 text-accent text-sm font-medium rounded-lg transition-colors disabled:opacity-50'
    : 'flex items-center justify-center gap-1.5 flex-1 text-xs border border-border rounded-lg py-1.5 text-muted hover:border-accent hover:text-accent transition-colors disabled:opacity-50'

  const label = resolving ? 'Reading Drive folder…' : busy ? 'Connecting…' : mode === 'folder' ? 'Drive Folder' : 'Drive Files'

  return (
    <div className={variant === 'compact' ? 'flex-1 min-w-[45%]' : undefined}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); handleClick() }}
        disabled={busy}
        className={buttonClass}
      >
        {busy
          ? <span className="w-3.5 h-3.5 flex-shrink-0 border-2 border-accent/40 border-t-accent rounded-full animate-spin" />
          : mode === 'folder' ? <FolderIcon className="w-4 h-4 flex-shrink-0" /> : <DriveIcon className="w-4 h-4 flex-shrink-0" />}
        {label}
      </button>
      {error && (
        <div className="flex items-start gap-1.5 mt-1.5 text-xs text-danger">
          <AlertCircleIcon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}
