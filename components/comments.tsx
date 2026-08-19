'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { giscusConfig } from '@/lib/comments';

const ORIGIN = 'https://giscus.app';

const giscusTheme = (dark: boolean) => (dark ? 'dark_dimmed' : 'light');

export function Comments() {
  const container = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { resolvedTheme } = useTheme();

  // 换页面要换一条讨论串，所以整个重挂一次
  useEffect(() => {
    const el = container.current;
    if (!el) return;

    const script = document.createElement('script');
    script.src = `${ORIGIN}/client.js`;
    script.async = true;
    script.crossOrigin = 'anonymous';
    const attrs: Record<string, string> = {
      'data-repo': giscusConfig.repo,
      'data-repo-id': giscusConfig.repoId,
      'data-category': giscusConfig.category,
      'data-category-id': giscusConfig.categoryId,
      'data-mapping': 'pathname',
      'data-strict': '1',
      'data-reactions-enabled': '1',
      'data-emit-metadata': '0',
      'data-input-position': 'top',
      // next-themes 在 hydration 之前就把 class 打好了，直接读 DOM 最准
      'data-theme': giscusTheme(document.documentElement.classList.contains('dark')),
      'data-lang': 'zh-CN',
      'data-loading': 'lazy',
    };
    for (const [k, v] of Object.entries(attrs)) script.setAttribute(k, v);
    el.appendChild(script);

    return () => {
      el.innerHTML = '';
    };
  }, [pathname]);

  // 切主题时给 iframe 发个消息就行，不用重新加载评论
  useEffect(() => {
    container.current
      ?.querySelector<HTMLIFrameElement>('iframe.giscus-frame')
      ?.contentWindow?.postMessage(
        { giscus: { setConfig: { theme: giscusTheme(resolvedTheme === 'dark') } } },
        ORIGIN,
      );
  }, [resolvedTheme]);

  return (
    <section className="mt-12 border-t pt-8">
      <h2 className="mb-4 text-sm font-medium text-fd-muted-foreground">评论</h2>
      <div ref={container} />
    </section>
  );
}
