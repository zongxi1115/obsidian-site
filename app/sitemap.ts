import type { MetadataRoute } from 'next';
import { isIndexable, source } from '@/lib/source';
import { siteUrl } from '@/lib/shared';

export const revalidate = false;

const abs = (path: string) => new URL(path, siteUrl).toString();

/** 藏起来的和上了锁的不进 sitemap，跟 robots: noindex 保持一致 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: abs('/'), changeFrequency: 'weekly', priority: 1 },
    { url: abs('/graph'), changeFrequency: 'weekly', priority: 0.5 },
    ...source
      .getPages()
      .filter(isIndexable)
      .map((page) => ({
        url: abs(page.url),
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      })),
  ];
}
