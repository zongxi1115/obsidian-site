'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'fumadocs-core/link';
import { LinkIcon, LoaderCircleIcon, LockIcon } from 'lucide-react';
import previews from '@/content/previews.json';

interface Entry {
  title: string;
  locked?: boolean;
}

const MAP = previews as Record<string, Entry>;

const WIDTH = 520;
const GAP = 10;
const MAX_HEIGHT = 460;
const OPEN_DELAY = 280;
const CLOSE_DELAY = 160;

/** 渲染好的正文按 url 缓存，同一篇再浮第二次就是瞬间的 */
const cache = new Map<string, Promise<ReactNode>>();

async function loadBody(url: string): Promise<ReactNode> {
  const res = await fetch(`/previews${url.slice('/docs'.length)}.md`);
  if (!res.ok) throw new Error(String(res.status));
  // 渲染器跟口令解锁那边是同一个，带 GFM / 公式 / callout / 代码高亮
  const { renderNote } = await import('@/lib/render-note');
  return renderNote(await res.text());
}

interface Popup extends Entry {
  url: string;
  x: number;
  y: number;
  /** 窗口窄的时候要收着点 */
  w: number;
  /** 下面塞不下就翻到链接上方 */
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
  const [body, setBody] = useState<ReactNode>();
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 指针在链接上或者在卡片上，都算「还想看」 */
  const alive = useRef({ link: false, card: false });

  const clearTimers = () => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  };

  const close = useCallback(() => {
    clearTimers();
    alive.current = { link: false, card: false };
    setPopup(null);
    setBody(undefined);
  }, []);

  /** 离开链接或卡片：等一下再关，好让鼠标能从链接挪到卡片上 */
  const scheduleClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      if (!alive.current.link && !alive.current.card) close();
    }, CLOSE_DELAY);
  }, [close]);

  useEffect(() => {
    // 触屏没有 hover，弹出来只会挡着内容
    if (window.matchMedia('(pointer: coarse)').matches) return;

    function onOver(e: MouseEvent) {
      const target = e.target as Element | null;
      const link = target?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!link) return;
      // 侧栏、导航、目录里的链接不弹，只管正文和反向链接
      if (link.closest('aside, nav, header, [role="dialog"], [data-link-preview]')) return;

      const url = (link.getAttribute('href') ?? '').split('#')[0];
      const entry = MAP[url];
      if (!entry) return;

      alive.current.link = true;
      clearTimers();

      openTimer.current = setTimeout(() => {
        const rect = link.getBoundingClientRect();
        const above = rect.bottom + MAX_HEIGHT > window.innerHeight && rect.top > MAX_HEIGHT;
        const w = Math.min(WIDTH, window.innerWidth - GAP * 2);
        setPopup({
          ...entry,
          url,
          w,
          // 尽量对着链接左边，够不着就往回收，别顶出屏幕
          x: Math.min(Math.max(GAP, rect.left), window.innerWidth - w - GAP),
          y: above ? rect.top - GAP : rect.bottom + GAP,
          above,
        });
        setBody(undefined);

        if (entry.locked) return;
        const pending = cache.get(url) ?? loadBody(url);
        cache.set(url, pending);
        pending.then(
          (node) => setBody(node),
          () => {
            cache.delete(url);
            setBody(null);
          },
        );
      }, OPEN_DELAY);
    }

    function onOut(e: MouseEvent) {
      const from = (e.target as Element | null)?.closest?.('a[href]');
      if (!from) return;
      if ((e.relatedTarget as Element | null)?.closest?.('a[href]') === from) return;
      alive.current.link = false;
      scheduleClose();
    }

    // 捕获阶段才能听到页面里任意容器的滚动；但卡片自己滚不算，不然一滑就没了
    function onScroll(e: Event) {
      const target = e.target;
      if (target instanceof Element && target.closest('[data-link-preview]')) return;
      close();
    }

    document.addEventListener('mouseover', onOver);
    document.addEventListener('mouseout', onOut);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('blur', close);

    return () => {
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mouseout', onOut);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('blur', close);
      clearTimers();
    };
  }, [close, scheduleClose]);

  if (!popup) return null;

  return (
    <div
      data-link-preview
      className="animate-fd-fade-in bg-fd-popover text-fd-popover-foreground fixed z-50 flex flex-col overflow-hidden rounded-xl border shadow-xl"
      style={{
        left: popup.x,
        top: popup.y,
        width: popup.w,
        maxHeight: MAX_HEIGHT,
        transform: popup.above ? 'translateY(-100%)' : undefined,
      }}
      onMouseEnter={() => {
        alive.current.card = true;
        if (closeTimer.current) clearTimeout(closeTimer.current);
      }}
      onMouseLeave={() => {
        alive.current.card = false;
        scheduleClose();
      }}
    >
      <div className="flex items-start gap-2 border-b px-4 py-2.5">
        <p className="min-w-0 flex-1 truncate font-medium">{popup.title}</p>
        <Link
          href={popup.url}
          title="打开这一篇"
          className="text-fd-muted-foreground hover:text-fd-primary shrink-0"
          onClick={close}
        >
          <LinkIcon className="size-3.5" />
        </Link>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
        {popup.locked ? (
          <p className="text-fd-muted-foreground flex items-center gap-1.5 py-3 text-xs">
            <LockIcon className="size-3.5 shrink-0" />
            这篇上了锁，要输口令才能看
          </p>
        ) : body === undefined ? (
          <p className="text-fd-muted-foreground flex items-center gap-1.5 py-3 text-xs">
            <LoaderCircleIcon className="size-3.5 shrink-0 animate-spin" />
            读取中
          </p>
        ) : body === null ? (
          <p className="text-fd-muted-foreground py-3 text-xs">这一篇读不出来</p>
        ) : (
          <div className="prose prose-no-margin">{body}</div>
        )}
      </div>
    </div>
  );
}
