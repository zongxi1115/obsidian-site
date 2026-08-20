export const appName = '计算机笔记';

/** 站点作者，进每一页的 SEO 元信息和结构化数据 */
export const author = {
  name: 'zongxi',
  url: 'https://github.com/zongxi1115',
};

/**
 * 站点的绝对地址：canonical、OG 图、sitemap 都要用。
 * 优先自己配的域名，其次 Vercel 给的，最后本地。
 */
export const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:3000');

export const docsRoute = '/docs';
export const docsImageRoute = '/og/docs';
export const docsContentRoute = '/llms.mdx/docs';

// 笔记本体所在的 Obsidian 仓库
export const gitConfig = {
  user: 'zongxi1115',
  repo: 'obsidian-computer',
  branch: 'main',
};
