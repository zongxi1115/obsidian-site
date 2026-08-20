'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { LockIcon } from 'lucide-react';
import previews from '@/content/previews.json';

interface Preview {
  title: string;
  excerpt: string;
  locked?: boolean;
}

const MAP = previews as Record<string, Preview>;

const WIDTH = 320;
const GAP = 10;
const DELAY = 260;

interface Popup extends Preview {
  x: number;
  y: number;
  /** 空间不够就翻到链接上方 */
  above: boolean;
}

/**
 * 鼠标浮在双链上时弹一个小窗看内容，跟 Obsidian 的页面预览一个意思。
 *
 * 挂在文档布局上监听整个页面，而不是包一层 <a> 组件 —— 这样正文、反向链接、
 * 首页索引里的链接全都自动有，MDX 那边一行都不用改。
 */
export function LinkPreview() {
  const [popup, setPopup] = useState<Popup | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setPopup(null);
  }, []);

  useEffect(() => {
    // 触屏没有 hover，弹出来只会挡着内容
    if (window.matchMedia('(pointer: coarse)').matches) return;

    function onOver(e: MouseEvent) {
      const target = e.target as Element | null;
      const link = target?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!link) return;
      // 侧栏、导航、目录里的链接不弹，只管正文和反向链接
      if (link.closest('aside, nav, header, [role="dialog"]')) return;

      const href = link.getAttribute('href') ?? '';
      if (!href.startsWith('/docs/')) return;
      const data = MAP[href.split('#')[0]];
      if (!data) return;

      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const rect = link.getBoundingClientRect();
        const above = rect.bottom + 180 > window.innerHeight;
        setPopup({
          ...data,
          // 尽量对着链接左边，够不着就往回收，别顶出屏幕
          x: Math.min(Math.max(GAP, rect.left), window.innerWidth - WIDTH - GAP),
          y: above ? rect.top - GAP : rect.bottom + GAP,
          above,
        });
      }, DELAY);
    }

    function onOut(e: MouseEvent) {
      const from = e.target as Element | null;
      if (!from?.closest?.('a[href]')) return;
      const to = e.relatedTarget as Element | null;
      if (to?.closest?.('a[href]') === from.closest('a[href]')) return;
      cancel();
    }

    document.addEventListener('mouseover', onOver);
    document.addEventListener('mouseout', onOut);
    window.addEventListener('scroll', cancel, true);
    window.addEventListener('blur', cancel);
    document.addEventListener('click', cancel);

    return () => {
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mouseout', onOut);
      window.removeEventListener('scroll', cancel, true);
      window.removeEventListener('blur', cancel);
      document.removeEventListener('click', cancel);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [cancel]);

  if (!popup) return null;

  return (
    <div
      role="tooltip"
      // 不吃鼠标事件，纯展示，免得挡住底下的链接
      className="animate-fd-fade-in bg-fd-popover text-fd-popover-foreground pointer-events-none fixed z-50 rounded-xl border p-3 shadow-lg"
      style={{
        left: popup.x,
        top: popup.y,
        width: WIDTH,
        transform: popup.above ? 'translateY(-100%)' : undefined,
      }}
    >
      <p className="truncate text-sm font-medium">{popup.title}</p>
      {popup.locked ? (
        <p className="text-fd-muted-foreground mt-1 flex items-center gap-1 text-xs">
          <LockIcon className="size-3 shrink-0" />
          这篇上了锁，要输口令
        </p>
      ) : (
        popup.excerpt && (
          <p className="text-fd-muted-foreground mt-1 line-clamp-4 text-xs leading-relaxed">
            {popup.excerpt}
          </p>
        )
      )}
    </div>
  );
}
