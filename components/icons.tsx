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

export function ArrowRightIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  )
}

const EXT_ICON: Record<string, (props: IconProps) => JSX.Element> = {
  jpg: ImageIcon, jpeg: ImageIcon, png: ImageIcon, gif: ImageIcon, webp: ImageIcon, svg: ImageIcon, bmp: ImageIcon, avif: ImageIcon,
  mp4: VideoIcon, webm: VideoIcon, mov: VideoIcon, m4v: VideoIcon,
  mp3: AudioIcon, wav: AudioIcon, ogg: AudioIcon, m4a: AudioIcon,
  pdf: PdfIcon,
  zip: ArchiveIcon, rar: ArchiveIcon, '7z': ArchiveIcon,
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
