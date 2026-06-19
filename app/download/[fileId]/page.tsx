import DownloadCard from '@/components/DownloadCard'

interface Props {
  params: { fileId: string }
}

export default function DownloadPage({ params }: Props) {
  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-1">
            <div className="font-bold text-accent text-2xl">VayuTransfer</div>
            <div className="text-muted text-sm">Secure file transfer. Prepaid. No surprises.</div>
          </div>

          <DownloadCard fileId={params.fileId} />
        </div>
      </main>

      <footer className="border-t border-border py-4">
        <p className="text-center text-xs text-muted">
          © {new Date().getFullYear()} VayuTransfer · Fast. Secure. Prepaid.
        </p>
      </footer>
    </div>
  )
}
