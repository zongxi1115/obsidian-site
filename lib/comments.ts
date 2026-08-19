/**
 * 评论区走 giscus —— 评论存在 GitHub Discussions 里，不用自己开数据库，
 * 读者用 GitHub 账号登录就能评。
 *
 * 四个值去 https://giscus.app 填一下仓库就会生成，必须是 NEXT_PUBLIC_ 前缀，
 * 因为要在浏览器里用。没配全就整个不显示评论区。
 */
export const giscusConfig = {
  repo: process.env.NEXT_PUBLIC_GISCUS_REPO?.trim() ?? '',
  repoId: process.env.NEXT_PUBLIC_GISCUS_REPO_ID?.trim() ?? '',
  category: process.env.NEXT_PUBLIC_GISCUS_CATEGORY?.trim() || 'Announcements',
  categoryId: process.env.NEXT_PUBLIC_GISCUS_CATEGORY_ID?.trim() ?? '',
};

export const commentsEnabled =
  giscusConfig.repo.length > 0 &&
  giscusConfig.repoId.length > 0 &&
  giscusConfig.categoryId.length > 0;
