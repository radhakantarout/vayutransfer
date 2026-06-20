import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://vayutransfer.com'
  return [
    { url: base,                   lastModified: new Date(), changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${base}/pricing`,      lastModified: new Date(), changeFrequency: 'monthly', priority: 0.9 },
    { url: `${base}/login`,        lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/transfers`,    lastModified: new Date(), changeFrequency: 'weekly',  priority: 0.8 },
    { url: `${base}/wallet`,       lastModified: new Date(), changeFrequency: 'weekly',  priority: 0.7 },
    { url: `${base}/about`,        lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/privacy`,      lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/terms`,        lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/support`,      lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
  ]
}
