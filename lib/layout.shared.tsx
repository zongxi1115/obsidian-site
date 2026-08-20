import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { appName, vaultRepoUrl } from './shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      // JSX supported
      title: appName,
    },
    links: [
      { text: '笔记', url: '/docs' },
      { text: '关系图谱', url: '/graph' },
      { text: '标签', url: '/tags' },
    ],
    githubUrl: vaultRepoUrl,
  };
}
