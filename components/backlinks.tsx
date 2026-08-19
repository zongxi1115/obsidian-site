import Link from 'next/link';
import graph from '@/content/graph.json';

const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
const backlinks: Record<string, string[]> = graph.backlinks;

/** 页面底部的反向链接区：哪些笔记用 [[]] 指到了这一篇 */
export function Backlinks({ id }: { id: string }) {
  const sources = (backlinks[id] ?? []).map((s) => nodeById.get(s)).filter((n) => n !== undefined);

  return (
    <section className="mt-12 border-t pt-6">
      <h2 className="mb-3 text-sm font-medium">反向链接（{sources.length}）</h2>
      {sources.length === 0 ? (
        <p className="text-fd-muted-foreground text-sm">
          还没有笔记链接到这里。在 Obsidian 里用 <code>[[笔记名]]</code> 引用它，这里就会出现，
          <Link href="/graph" className="text-fd-primary underline underline-offset-4">
            关系图谱
          </Link>
          上也会多出一条连线。
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {sources.map((n) => (
            <li key={n.id}>
              <Link
                href={n.url}
                className="hover:bg-fd-accent/50 block rounded-lg border p-3 text-sm transition-colors"
              >
                <span className="font-medium">{n.title}</span>
                {n.folder && (
                  <span className="text-fd-muted-foreground ms-2 text-xs">{n.folder}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
