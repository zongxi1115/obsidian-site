import Link from 'next/link';
import { source } from '@/lib/source';
import { appName } from '@/lib/shared';

export default function HomePage() {
  const count = source.getPages().length - 1; // 减掉自动生成的索引页

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-3xl font-bold">{appName}</h1>
      <p className="text-fd-muted-foreground max-w-lg">
        Obsidian 笔记的公开版本，每次推送到笔记仓库后自动重新构建，目前共 {count} 篇。
      </p>
      <Link
        href="/docs"
        className="bg-fd-primary text-fd-primary-foreground rounded-full px-5 py-2.5 text-sm font-medium"
      >
        开始阅读
      </Link>
    </main>
  );
}
