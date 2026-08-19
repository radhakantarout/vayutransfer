// Shared line-icon set for VayuTransfer — plain stroke SVGs (24x24
// viewBox, currentColor) matching VayuStudios' inline-icon visual language,
// centralized here instead of duplicated per-component. Replaces the emoji
// icons used across the upload/download/receive flows.

import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const base = (props: IconProps) => ({
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  ...props,
})

export function ImageIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  )
}

export function VideoIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="2" y="5" width="14" height="14" rx="2" />
      <path d="M16 10l6-3v10l-6-3" />
    </svg>
  )
}

export function AudioIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  )
}

export function PdfIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M9 15h1.5a1.5 1.5 0 0 0 0-3H9v5" />
      <path d="M13 12v5h1a2 2 0 0 0 0-5h-1z" />
      <path d="M17.5 12H16v5" />
    </svg>
  )
}

export function ArchiveIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" />
      <path d="M10 12h4" />
    </svg>
  )
}

export function FileIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  )
}

export function DocumentTextIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8" />
      <path d="M8 17h5" />
    </svg>
  )
}

export function FolderIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  )
}

export function PackageIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M21 8l-9-5-9 5 9 5 9-5z" />
      <path d="M3 8v8l9 5 9-5V8" />
      <path d="M12 13v8" />
    </svg>
  )
}

export function ClockIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  )
}

export function CheckCircleIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.5 2.5L16 9" />
    </svg>
  )
}

export function AlertCircleIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5" />
      <path d="M12 16.5v.01" />
    </svg>
  )
}

export function LockIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

export function EyeIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export function DownloadIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M4 20h16" />
    </svg>
  )
}

export function UploadCloudIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M7 18a4.5 4.5 0 0 1-1-8.9A5.5 5.5 0 0 1 16.7 7.5 4.5 4.5 0 0 1 17 18" />
      <path d="M12 12v8" />
      <path d="M9 15l3-3 3 3" />
    </svg>
  )
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  )
}

export function CopyIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

export function MailIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M2 7l10 6 10-6" />
    </svg>
  )
}

export function ShareIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.59 13.51l6.83 3.98" />
      <path d="M15.41 6.51L8.59 10.49" />
    </svg>
  )
}

export function SendIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7z" />
    </svg>
  )
}

export function InboxIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  )
}

export function PlusCircleIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8" />
      <path d="M8 12h8" />
    </svg>
  )
}

export function RefreshIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 4v6h6" />
      <path d="M20 20v-6h-6" />
      <path d="M4.5 15a8 8 0 0 0 14.5 3" />
      <path d="M19.5 9A8 8 0 0 0 5 6" />
    </svg>
  )
}

export function WalletIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v3" />
      <path d="M3 7v10a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-6a1 1 0 0 0-1-1H16a2 2 0 1 0 0 4h5" />
    </svg>
  )
}

export function UsersIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

export function ShieldIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 2l8 3.5v6c0 5-3.5 8.5-8 10.5-4.5-2-8-5.5-8-10.5v-6z" />
    </svg>
  )
}

export function ListIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9 6h11" /><path d="M9 12h11" /><path d="M9 18h11" />
      <path d="M4.5 6h.01" /><path d="M4.5 12h.01" /><path d="M4.5 18h.01" />
    </svg>
  )
}

export function SpeedIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" />
    </svg>
  )
}

export function QrCodeIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3z" /><path d="M20 14v3" /><path d="M14 20h3" /><path d="M20 20h.01" />
    </svg>
  )
}

export function EditIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

export function TrashIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" /><path d="M14 11v6" />
    </svg>
  )
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  )
}

// Small, simplified triangle glyph in Google Drive's brand colors — not the
// exact official logo path (avoids hand-transcribing complex brand SVG path
// data that's easy to get subtly wrong), but reads clearly as "Drive" at a
// glance. Deliberately filled/multi-color, unlike the rest of this
// stroke-icon set, since a monochrome outline wouldn't read as Drive at all.
export function DriveIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" {...props}>
      <polygon points="12,3 3,20 12,14.3" fill="#0F9D58" />
      <polygon points="12,3 12,14.3 21,20" fill="#4285F4" />
      <polygon points="3,20 12,14.3 21,20" fill="#FFC107" />
    </svg>
  )
}

const EXT_ICON: Record<string, (props: IconProps) => JSX.Element> = {
  jpg: ImageIcon, jpeg: ImageIcon, png: ImageIcon, gif: ImageIcon, webp: ImageIcon, svg: ImageIcon, bmp: ImageIcon, avif: ImageIcon,
  raw: ImageIcon, cr2: ImageIcon, nef: ImageIcon, arw: ImageIcon, dng: ImageIcon,
  mp4: VideoIcon, webm: VideoIcon, mov: VideoIcon, m4v: VideoIcon, avi: VideoIcon, mkv: VideoIcon,
  mp3: AudioIcon, wav: AudioIcon, ogg: AudioIcon, m4a: AudioIcon,
  pdf: PdfIcon,
  zip: ArchiveIcon, rar: ArchiveIcon, '7z': ArchiveIcon,
  xlsx: DocumentTextIcon, xls: DocumentTextIcon,
  txt: DocumentTextIcon, md: DocumentTextIcon, csv: DocumentTextIcon, json: DocumentTextIcon,
  log: DocumentTextIcon, xml: DocumentTextIcon, yaml: DocumentTextIcon, yml: DocumentTextIcon,
  js: DocumentTextIcon, ts: DocumentTextIcon, tsx: DocumentTextIcon, jsx: DocumentTextIcon,
  css: DocumentTextIcon, html: DocumentTextIcon, py: DocumentTextIcon, java: DocumentTextIcon,
  c: DocumentTextIcon, cpp: DocumentTextIcon, sh: DocumentTextIcon,
  doc: DocumentTextIcon, docx: DocumentTextIcon,
}

// Picks the right icon component for a filename's extension — used
// anywhere a file-type glyph is shown (upload list, download list, previews).
export function FileTypeIcon({ fileName, isFolder, ...props }: IconProps & { fileName: string; isFolder?: boolean }) {
  if (isFolder) return <FolderIcon {...props} />
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  const Icon = EXT_ICON[ext] ?? FileIcon
  return <Icon {...props} />
}

// Per-extension accent color for contexts that want a colorful, scannable
// file list (folder yellow, video blue, image green, RAW purple, PDF red,
// spreadsheet green, zip orange, audio purple) — opt-in via this helper
// rather than baked into FileTypeIcon itself, since most existing call
// sites intentionally use one contextual color (muted/accent/selected)
// instead of per-type coloring.
const EXT_COLOR: Record<string, string> = {
  jpg: 'text-emerald-400', jpeg: 'text-emerald-400', png: 'text-emerald-400', gif: 'text-emerald-400',
  webp: 'text-emerald-400', svg: 'text-emerald-400', bmp: 'text-emerald-400', avif: 'text-emerald-400',
  raw: 'text-purple-400', cr2: 'text-purple-400', nef: 'text-purple-400', arw: 'text-purple-400', dng: 'text-purple-400',
  mp4: 'text-blue-400', webm: 'text-blue-400', mov: 'text-blue-400', m4v: 'text-blue-400', avi: 'text-blue-400', mkv: 'text-blue-400',
  mp3: 'text-violet-400', wav: 'text-violet-400', ogg: 'text-violet-400', m4a: 'text-violet-400',
  pdf: 'text-red-400',
  zip: 'text-orange-400', rar: 'text-orange-400', '7z': 'text-orange-400',
  xlsx: 'text-emerald-400', xls: 'text-emerald-400', csv: 'text-emerald-400',
  doc: 'text-blue-300', docx: 'text-blue-300',
}
const FOLDER_COLOR = 'text-amber-400'

export function fileTypeColor(fileName: string, isFolder?: boolean): string {
  if (isFolder) return FOLDER_COLOR
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  return EXT_COLOR[ext] ?? 'text-muted'
}
