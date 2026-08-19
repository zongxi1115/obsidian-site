'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useTheme } from 'next-themes';

/**
 * ```mermaid 代码块（Obsidian 原生支持的那个）渲染成图。
 * mermaid 包挺大，所以只在真的有图的页面上动态 import。
 */
export function Mermaid({ chart }: { chart: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const container = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const { default: mermaid } = await import('mermaid');
      mermaid.initialize({
        startOnLoad: false,
        theme: resolvedTheme === 'dark' ? 'dark' : 'default',
        fontFamily: 'inherit',
      });

      try {
        const { svg } = await mermaid.render(`mermaid-${id}`, chart.trim());
        if (!cancelled && container.current) {
          container.current.innerHTML = svg;
          setError(undefined);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chart, id, resolvedTheme]);

  if (error) {
    return (
      <pre className="my-4 overflow-auto rounded-lg border border-fd-error/40 p-3 text-xs text-fd-muted-foreground">
        mermaid 画不出来：{error}
        {'\n\n'}
        {chart}
      </pre>
    );
  }

  return <div ref={container} className="my-4 flex justify-center [&_svg]:max-w-full" />;
}
