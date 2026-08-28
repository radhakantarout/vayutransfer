import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { getWebsiteBySubdomain, getWebsiteByCustomDomain } from '@/lib/studio/website'
import { verifyPreviewToken } from '@/lib/studio/previewToken'
import type { StudioWebsite } from '@/types/studio'

import Lumina from './templates/Lumina'
import Clarity from './templates/Clarity'
import Ember from './templates/Ember'
import Bold from './templates/Bold'
import Bloom from './templates/Bloom'
import { WhatsAppFloatingButton } from './templates/SocialIcons'

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

  if (site.status === 'DRAFT') {
    // Draft sites 404 to the public — the one exception is the dashboard's own
    // live-preview panel / manual preview link, which appends a short-lived
    // signed token (see lib/studio/previewToken.ts) scoped to exactly this
    // subdomain. A guessable/shared URL with no valid token still 404s.
    const { previewToken } = await searchParams
    const isValidPreview = !!previewToken && await verifyPreviewToken(previewToken, subdomain)
    if (!isValidPreview) notFound()
  }

  const template = (() => {
    switch (site.templateId) {
      case 'lumina':  return <Lumina site={site} />
      case 'clarity': return <Clarity site={site} />
      case 'ember':   return <Ember site={site} />
      case 'bold':    return <Bold site={site} />
      case 'bloom':   return <Bloom site={site} />
      default:        return <Lumina site={site} />
    }
  })()

  return (
    <>
      {template}
      <WhatsAppFloatingButton number={site.whatsapp} />
    </>
  )
}
