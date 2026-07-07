import type { Metadata } from 'next'
import Link from 'next/link'
import AuthShell from '@/components/studio/AuthShell'
import GoogleIcon from '@/components/studio/GoogleIcon'
import ProductLifecycle from '@/components/studio/ProductLifecycle'
import EnquiryForm from '@/app/studio/home/EnquiryForm'
import { getPhotosForSlug, getSamplePhotos } from '@/lib/studio/sampleImages'

export const metadata: Metadata = {
  title: 'Set up your studio — VayuStudios',
  description: 'Create your studio with Google, or fill in a few details — we\'ll set it up within 24 hours.',
}

export default async function GetStartedPage() {
  const uploadSamples = getSamplePhotos()
  const mockupPhotos  = getPhotosForSlug('wedding')

  return (
    <AuthShell aside={<ProductLifecycle variant="stack" uploadSamples={uploadSamples} mockupPhotos={mockupPhotos} />}>
      <div className="w-full max-w-sm space-y-6 pt-4">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-extrabold text-text-primary">Set up your studio</h1>
          <p className="text-sm text-muted">
            Already have an account?{' '}
            <Link href="/studio/login" className="text-accent hover:underline">Sign in →</Link>
          </p>
        </div>

        <a
          href="/studio/api/auth/google?next=/studio/dashboard"
          className="flex items-center justify-center gap-2.5 w-full bg-card border border-border rounded-xl py-2.5 text-sm font-semibold text-text-primary hover:border-accent/40 transition-colors"
        >
          <GoogleIcon />
          Create with Google
        </a>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-muted whitespace-nowrap">Or fill in your details</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <EnquiryForm />
      </div>
    </AuthShell>
  )
}
