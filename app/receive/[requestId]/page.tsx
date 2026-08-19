import ReceivePageContent from '@/components/ReceivePageContent'

interface Props {
  params: { requestId: string }
}

// The global Navbar (real logo) and Footer already render around every
// page — this used to duplicate both with its own text-only "VayuTransfer"
// header and a second footer, left over from before the app-wide chrome
// was always-on. Dropped so this page's theme/branding matches the rest
// of the app (including the signed-in Send/Request flow) instead of
// drifting with its own copy.
export default function ReceivePage({ params }: Props) {
  return (
    <main className="min-h-[calc(100vh-56px)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <ReceivePageContent requestId={params.requestId} />
      </div>
    </main>
  )
}
