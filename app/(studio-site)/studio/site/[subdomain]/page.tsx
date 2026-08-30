import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { getWebsiteBySubdomain, getWebsiteByCustomDomain } from '@/lib/studio/website'
import { verifyPreviewToken } from '@/lib/studio/previewToken'
import type { StudioWebsite } from '@/types/studio'
import LiveTemplateRenderer from './LiveTemplateRenderer'

async function getSite(subdomain: string): Promise<StudioWebsite | null> {
  if (subdomain === '__custom') {
    const headersList = headers()
    const customDomain = headersList.get('x-studio-custom-domain')
    if (!customDomain) return null
    return getWebsiteByCustomDomain(customDomain)
  }
  return getWebsiteBySubdomain(subdomain)
}

export async function generateMetadata({ params }: { params: Promise<{ subdomain: string }> }): Promise<Metadata> {
  const { subdomain } = await params
  const site = await getSite(subdomain)
  if (!site) return {}
  return {
    title: `${site.heroTitle} — Photography Studio`,
    description: site.heroSubtitle,
    openGraph: {
      title: site.heroTitle,
      description: site.heroSubtitle,
      images: site.galleryPhotos[0] ? [site.galleryPhotos[0].url] : [],
    },
  }
}

export default async function StudioSitePage({
  params, searchParams,
}: {
  params: Promise<{ subdomain: string }>
  searchParams: Promise<{ previewToken?: string }>
}) {
  const { subdomain } = await params
  const site = await getSite(subdomain)

  if (!site) notFound()

  // isPreview is independent of DRAFT/LIVE status — it's just "was this
  // request verified as coming from this studio's own dashboard preview."
  // A DRAFT site requires it to be viewable at all; a LIVE site doesn't
  // require it, but still uses it (when present) to enable the instant
  // live-update channel below — a real, unauthenticated visitor to a LIVE
  // site never has a token, so they always get the plain saved render.
  const { previewToken } = await searchParams
  const isPreview = !!previewToken && await verifyPreviewToken(previewToken, subdomain)

  if (site.status === 'DRAFT' && !isPreview) {
    // Draft sites 404 to the public — the one exception is the dashboard's
    // own live-preview panel / manual preview link, which appends this
    // short-lived signed token (see lib/studio/previewToken.ts) scoped to
    // exactly this subdomain. A guessable/shared URL with no valid token
    // still 404s.
    notFound()
  }

  return <LiveTemplateRenderer initialSite={site} isPreview={isPreview} />
}
