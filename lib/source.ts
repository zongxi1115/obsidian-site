import { loader } from 'fumadocs-core/source';
import { lucideIconsPlugin } from 'fumadocs-core/source/lucide-icons';
import { docsContentRoute, docsImageRoute, docsRoute } from './shared';
import { defineDocs } from 'fumadocs-mdx/macro';
import { metaSchema, pageSchema } from 'fumadocs-core/source/schema';
import { z } from 'zod';

const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    // 笔记 frontmatter 里额外认三个开关，由 scripts/sync-vault.mjs 写进来
    schema: pageSchema.extend({
      /** display: none —— 不进侧栏 / 首页索引 / 图谱 / 搜索，链接照样能打开 */
      display: z.string().optional(),
      /** comments: false —— 关掉这一篇的评论区 */
      comments: z.boolean().optional(),
      /** password: xxx —— 正文加密后的 base64，明文不进构建产物 */
      encrypted: z.string().optional(),
      /** tags: [...] —— 标签，页面上显示，也生成 /tags 下的索引页 */
      tags: z.array(z.string()).optional(),
      /** 笔记仓库里这个文件最后一次提交的时间 */
      lastModified: z.string().optional(),
    }),
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
  meta: {
    schema: metaSchema,
  },
});

// See https://fumadocs.dev/docs/headless/source-api for more info
export const source = loader({
  baseUrl: docsRoute,
  source: docs.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
});

export type NotePage = (typeof source)['$inferPage'];

/** display: none 的页面不该出现在搜索结果和 AI 的检索范围里 */
export const isListed = (page: NotePage) => page.data.display !== 'none';

/** 加了口令的页面，正文在构建产物里就是密文，任何索引都不该碰 */
export const isIndexable = (page: NotePage) => isListed(page) && !page.data.encrypted;

export function getPageImageUrl(page: (typeof source)['$inferPage']) {
  const segments = [...page.slugs, 'image.png'];

  return {
    segments,
    url: '/' + [page.locale, ...docsImageRoute.split('/'), ...segments].filter(Boolean).join('/'),
  };
}

export function getPageMarkdownUrl(page: (typeof source)['$inferPage']) {
  const segments = [...page.slugs, 'content.md'];

  return {
    segments,
    url: '/' + [page.locale, ...docsContentRoute.split('/'), ...segments].filter(Boolean).join('/'),
  };
}

export async function getLLMText(page: (typeof source)['$inferPage']) {
  const processed = await page.data.getText('processed');

  return `# ${page.data.title} (${page.url})

${processed}`;
}

