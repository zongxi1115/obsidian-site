import { getPageImageUrl, getPageMarkdownUrl, source } from '@/lib/source';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  MarkdownCopyButton,
  ViewOptionsPopover,
} from 'fumadocs-ui/layouts/docs/page';
import { notFound } from 'next/navigation';
import { getMDXComponents } from '@/components/mdx';
import type { Metadata } from 'next';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { gitConfig } from '@/lib/shared';
import vaultMap from '@/content/vault-map.json';
import { Backlinks } from '@/components/backlinks';
import { GraphPanel } from '@/components/graph-panel';

export default async function Page(props: PageProps<'/docs/[[...slug]]'>) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;
  const markdownUrl = getPageMarkdownUrl(page).url;
  // 站点里的文件名是拼音，映射回笔记仓库里的中文原路径
  const vaultPath = (vaultMap as Record<string, string>)[page.path];
  const graphId = page.path.replace(/\.mdx?$/, '');

  return (
    <DocsPage
      toc={page.data.toc}
      full={page.data.full}
      // 图谱小窗放在右侧栏 "On this page" 上面，移动端的目录弹层里也放一份
      tableOfContent={{ header: <GraphPanel activeId={graphId} /> }}
      tableOfContentPopover={{ header: <GraphPanel activeId={graphId} /> }}
    >
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription className="mb-0">{page.data.description}</DocsDescription>
      <div className="flex flex-row gap-2 items-center border-b pb-6">
        <MarkdownCopyButton markdownUrl={markdownUrl} />
        <ViewOptionsPopover
          markdownUrl={markdownUrl}
          githubUrl={`https://github.com/${gitConfig.user}/${gitConfig.repo}/blob/${gitConfig.branch}/${vaultPath ?? ''}`}
        />
      </div>
      <DocsBody>
        <MDX
          components={getMDXComponents({
            // this allows you to link to other pages with relative file paths
            a: createRelativeLink(source, page),
          })}
        />
      </DocsBody>
      {/* 首页那种生成出来的索引页没有对应笔记，就不显示反链 */}
      {vaultPath && <Backlinks id={graphId} />}
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: PageProps<'/docs/[[...slug]]'>): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
    openGraph: {
      images: getPageImageUrl(page).url,
    },
  };
}
