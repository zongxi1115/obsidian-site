import Link from 'fumadocs-core/link';
import { CalendarIcon, TagIcon } from 'lucide-react';
import { tagSlug } from '@/lib/tags';

/** 只显示到天，笔记站没必要精确到分秒 */
function formatDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Shanghai',
  }).format(date);
}

/** 标题下面那一行：标签 + 最后更新时间 */
export function NoteMeta({ tags = [], lastModified }: { tags?: string[]; lastModified?: string }) {
  const updated = lastModified ? formatDate(lastModified) : null;
  if (tags.length === 0 && !updated) return null;

  return (
    <div className="text-fd-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      {tags.map((tag) => (
        <Link
          key={tag}
          href={`/tags/${tagSlug(tag)}`}
          className="bg-fd-secondary hover:bg-fd-accent hover:text-fd-accent-foreground inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs transition-colors"
        >
          <TagIcon className="size-3" />
          {tag}
        </Link>
      ))}
      {updated && (
        <span className="inline-flex items-center gap-1 text-xs">
          <CalendarIcon className="size-3" />
          最后更新 {updated}
        </span>
      )}
    </div>
  );
}
