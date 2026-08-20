import siteMeta from '@/content/site.json';

/**
 * 站点里所有跟「谁的仓库」有关的东西都从这里出，没有一处写死。
 *
 * - 仓库信息由 scripts/sync-vault.mjs 从 VAULT_REPO 解析后写进 content/site.json，
 *   所以换一个笔记仓库只要改 VAULT_REPO 一个变量
 * - 站名和作者可以用 NEXT_PUBLIC_ 变量覆盖，不填就拿仓库名和 owner 顶上
 */

/** 笔记本体所在的仓库，「在 GitHub 上编辑」的链接靠它 */
export const gitConfig = siteMeta.repo;

export const appName = process.env.NEXT_PUBLIC_SITE_NAME?.trim() || gitConfig.repo;

export const author = {
  name: process.env.NEXT_PUBLIC_SITE_AUTHOR?.trim() || gitConfig.user,
  url:
    process.env.NEXT_PUBLIC_SITE_AUTHOR_URL?.trim() ||
    `https://${gitConfig.host}/${gitConfig.user}`,
};

/** 笔记在仓库里的地址，用来拼「编辑此页」 */
export const vaultFileUrl = (relativePath: string) =>
  `https://${gitConfig.host}/${gitConfig.user}/${gitConfig.repo}/blob/${gitConfig.branch}/${relativePath}`;

/** 仓库首页 */
export const vaultRepoUrl = `https://${gitConfig.host}/${gitConfig.user}/${gitConfig.repo}`;

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
