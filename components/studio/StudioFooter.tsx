export default function StudioFooter() {
  return (
    <footer className="border-t border-border px-6 py-4 flex items-center justify-between text-xs text-muted">
      <span>© 2026 VayuStudio by VayuTransfer</span>
      <a
        href={process.env.NEXT_PUBLIC_APP_URL ?? 'https://vayutransfer.com'}
        className="hover:text-text-primary transition-colors"
      >
        vayutransfer.com →
      </a>
    </footer>
  )
}
