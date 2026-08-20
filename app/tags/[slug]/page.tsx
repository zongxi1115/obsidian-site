import Link from 'fumadocs-core/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeftIcon } from 'lucide-react';
import { allTags, tagFromSlug, tagList } from '@/lib/tags';

export function generateStaticParams() {
  return tagList.map(({ slug }) => ({ slug }));
}

export async function generateMetadata(props: PageProps<'/tags/[slug]'>): Promise<Metadata> {
  const { slug } = await props.params;
  const tag = tagFromSlug(slug);
  if (!tag) notFound();

  return { title: `#${tag}`, description: `标签 ${tag} 下的全部笔记` };
}

export default async function TagPage(props: PageProps<'/tags/[slug]'>) {
  const { slug } = await props.params;
  const tag = tagFromSlug(slug);
  if (!tag) notFound();

  const notes = allTags[tag] ?? [];

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-16">
      <Link
        href="/tags"
        className="text-fd-muted-foreground hover:text-fd-foreground mb-6 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeftIcon className="size-3.5" />
        全部标签
      </Link>

      <h1 className="mb-2 text-2xl font-semibold">#{tag}</h1>
      <p className="text-fd-muted-foreground mb-8 text-sm">{notes.length} 篇笔记</p>

      <ul className="flex flex-col gap-1">
        {notes.map((note) => (
          <li key={note.url}>
            <Link
              href={note.url}
              className="hover:bg-fd-accent hover:text-fd-accent-foreground block rounded-lg px-3 py-2 transition-colors"
            >
              {note.title}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
