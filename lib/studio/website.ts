import { studioGetItem, studioPutItem, studioQueryByIndex, TABLES } from './dynamodb'
import type { StudioWebsite, WebsiteTemplateId } from '@/types/studio'
import { randomUUID } from 'crypto'

export async function getWebsiteByStudioId(studioId: string): Promise<StudioWebsite | null> {
  return studioGetItem<StudioWebsite>(TABLES.websites, { studioId })
}

export async function getWebsiteBySubdomain(subdomain: string): Promise<StudioWebsite | null> {
  const results = await studioQueryByIndex<StudioWebsite>(
    TABLES.websites,
    'subdomain-index',
    'subdomain = :s',
    { ':s': subdomain }
  )
  return results[0] ?? null
}

export async function getWebsiteByCustomDomain(customDomain: string): Promise<StudioWebsite | null> {
  const results = await studioQueryByIndex<StudioWebsite>(
    TABLES.websites,
    'customDomain-index',
    'customDomain = :d',
    { ':d': customDomain }
  )
  return results[0] ?? null
}

export async function isSubdomainAvailable(subdomain: string): Promise<boolean> {
  const existing = await getWebsiteBySubdomain(subdomain)
  return existing === null
}

export function slugifyStudioName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 32)
}

export function buildDefaultWebsite(studioId: string, studioName: string, subdomain: string): StudioWebsite {
  const now = new Date().toISOString()
  return {
    studioId,
    subdomain,
    templateId: 'lumina' as WebsiteTemplateId,
    status: 'DRAFT',
    heroTitle: studioName,
    heroSubtitle: 'Capturing your most precious moments',
    tagline: 'Professional photography for every occasion',
    about: `Welcome to ${studioName}. We are passionate photographers dedicated to capturing the beauty and emotion of your special moments. With years of experience and an eye for detail, we deliver stunning images that tell your unique story.`,
    services: [
      { id: randomUUID(), name: 'Wedding Photography', description: 'Full-day wedding coverage with edited gallery delivery', price: 'Contact for pricing' },
      { id: randomUUID(), name: 'Pre-Wedding Shoot', description: 'Romantic couple sessions at beautiful locations', price: 'Contact for pricing' },
      { id: randomUUID(), name: 'Portrait Session', description: 'Professional portraits for individuals and families', price: 'Contact for pricing' },
    ],
    galleryPhotos: [],
    bookingEnabled: true,
    bookingMessage: 'Fill in your details and we\'ll get back to you within 24 hours.',
    createdAt: now,
    updatedAt: now,
  }
}

export async function saveWebsite(website: StudioWebsite): Promise<void> {
  await studioPutItem(TABLES.websites, { ...website, updatedAt: new Date().toISOString() })
}
