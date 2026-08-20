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
import { appName, author, gitConfig } from '@/lib/shared';
import vaultMap from '@/content/vault-map.json';
import { Backlinks } from '@/components/backlinks';
import { GraphPanel, GraphPanelCompact } from '@/components/graph-panel';
import { ProtectedNote } from '@/components/protected-note';
import { Comments } from '@/components/comments';
import { commentsEnabled } from '@/lib/comments';

export default async function Page(props: PageProps<'/docs/[[...slug]]'>) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;
  const markdownUrl = getPageMarkdownUrl(page).url;
  // 站点里的文件名是拼音，映射回笔记仓库里的中文原路径
  const vaultPath = (vaultMap as Record<string, string>)[page.path];
  const graphId = page.path.replace(/\.mdx?$/, '');
  // frontmatter 里写了 password：正文在产物里是密文，解锁后在浏览器里渲染
  const encrypted = page.data.encrypted;
  // 生成出来的索引页没有对应笔记；加密的那篇也不开评论，免得讨论区把内容漏出去
  const showComments = commentsEnabled && Boolean(vaultPath) && !encrypted && page.data.comments !== false;

  return (
    <DocsPage
      toc={page.data.toc}
      full={page.data.full}
      // 图谱小窗放在右侧栏 "On this page" 上面
      tableOfContent={{ header: <GraphPanel activeId={graphId} /> }}
      // 移动端的目录弹层矮，图谱只留一个按钮，把高度让给目录
      tableOfContentPopover={{ header: <GraphPanelCompact activeId={graphId} /> }}
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
        {encrypted ? (
          <ProtectedNote payload={encrypted} />
        ) : (
          <MDX
            components={getMDXComponents({
              // this allows you to link to other pages with relative file paths
              a: createRelativeLink(source, page),
            })}
          />
        )}
      </DocsBody>
      {/* 首页那种生成出来的索引页没有对应笔记，就不显示反链 */}
      {vaultPath && <Backlinks id={graphId} />}
      {showComments && <Comments />}
      {/* 结构化数据：搜索引擎和分享卡片认这个，作者署名比 meta 标签更硬 */}
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': vaultPath ? 'BlogPosting' : 'CollectionPage',
            headline: page.data.title,
            description: page.data.description,
            author: { '@type': 'Person', name: author.name, url: author.url },
            publisher: { '@type': 'Person', name: author.name, url: author.url },
            inLanguage: 'zh-CN',
            isAccessibleForFree: !encrypted,
          }),
        }}
      />
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

  // 藏起来的和上了锁的不进搜索引擎
  const noIndex = page.data.display === 'none' || Boolean(page.data.encrypted);

  return {
    title: page.data.title,
    description: page.data.description,
    authors: [author],
    creator: author.name,
    publisher: author.name,
    alternates: { canonical: page.url },
    ...(noIndex ? { robots: { index: false, follow: false } } : {}),
    openGraph: {
      type: 'article',
      title: page.data.title,
      description: page.data.description,
      url: page.url,
      siteName: appName,
      locale: 'zh_CN',
      authors: [author.name],
      images: getPageImageUrl(page).url,
    },
    twitter: {
      card: 'summary_large_image',
      title: page.data.title,
      description: page.data.description,
      creator: author.name,
      images: getPageImageUrl(page).url,
    },
  };
}
