import Link from 'fumadocs-core/link';
import type { Metadata } from 'next';
import { TagIcon } from 'lucide-react';
import { tagList } from '@/lib/tags';

export const metadata: Metadata = {
  title: '标签',
  description: '按标签浏览全部笔记',
};

export default function TagsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-16">
      <h1 className="mb-2 text-2xl font-semibold">标签</h1>
      <p className="text-fd-muted-foreground mb-8 text-sm">
        {tagList.length > 0
          ? `共 ${tagList.length} 个标签`
          : '还没有标签。在笔记的 frontmatter 里写 tags: [xxx] 就会出现在这里。'}
      </p>

      <div className="flex flex-wrap gap-2">
        {tagList.map(({ tag, slug, count }) => (
          <Link
            key={slug}
            href={`/tags/${slug}`}
            className="bg-fd-secondary hover:bg-fd-accent hover:text-fd-accent-foreground inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm transition-colors"
          >
            <TagIcon className="size-3.5" />
            {tag}
            <span className="text-fd-muted-foreground text-xs">{count}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
