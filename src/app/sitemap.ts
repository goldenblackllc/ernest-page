import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: 'https://earnestpage.com', lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
    { url: 'https://earnestpage.com/apply', lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: 'https://earnestpage.com/vision', lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: 'https://earnestpage.com/press', lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: 'https://earnestpage.com/privacy', lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    { url: 'https://earnestpage.com/terms', lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    { url: 'https://earnestpage.com/acceptable-use', lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
  ]
}
