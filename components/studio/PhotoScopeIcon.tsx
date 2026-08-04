import type { PhotoScope } from '@/lib/studio/photoScope'

// One small icon per lifecycle stage — reused by the gallery header filter,
// Quick Share, and AI Sorting so the same seven stages always look identical
// wherever they're offered.
export default function PhotoScopeIcon({ scope, className = 'w-3.5 h-3.5' }: { scope: PhotoScope; className?: string }) {
  switch (scope) {
    case 'ALL':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h10" />
        </svg>
      )
    case 'DRAFT':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h4m3-13.414L18.414 7H15a1 1 0 01-1-1V2.586zM6 2h8l6 6v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2z" />
        </svg>
      )
    case 'STARRED':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2l2.9 6.26L21.5 9.27l-4.75 4.63L17.8 21 12 17.77 6.2 21l1.05-7.1L2.5 9.27l6.6-1.01L12 2z" />
        </svg>
      )
    case 'CLIENT_FAVORITE':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 21.593c-5.63-5.539-11-10.297-11-14.402 0-3.791 3.068-5.191 5.281-5.191 1.312 0 4.151.501 5.719 4.457 1.59-3.968 4.464-4.447 5.726-4.447 2.54 0 5.274 1.621 5.274 5.181 0 4.069-5.136 8.625-11 14.402z" />
        </svg>
      )
    case 'EDIT_REQUIRED':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      )
    case 'EDITED':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75l2 2 4-4M20 12a8 8 0 11-16 0 8 8 0 0116 0z" />
        </svg>
      )
    case 'FINAL_PRINT':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 9V3h12v6M6 21h12v-6H6v6zM6 15H4a2 2 0 01-2-2v-4a2 2 0 012-2h16a2 2 0 012 2v4a2 2 0 01-2 2h-2" />
        </svg>
      )
  }
}
