'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { KeyRoundIcon, LoaderCircleIcon, LockIcon } from 'lucide-react';
import { buttonVariants } from 'fumadocs-ui/components/ui/button';
import { cn } from '@/lib/cn';

const ITERATIONS = 200_000;

function fromBase64(value: string) {
  const raw = atob(value);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** 字节布局跟 scripts/sync-vault.mjs 里对齐：salt(16) | iv(12) | 密文+tag */
async function decrypt(payload: string, password: string) {
  const bytes = fromBase64(payload);
  const salt = bytes.slice(0, 16);
  const iv = bytes.slice(16, 28);
  const data = bytes.slice(28);

  const base = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(plain);
}

export function ProtectedNote({ payload }: { payload: string }) {
  const pathname = usePathname();
  const [content, setContent] = useState<ReactNode>();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);

  // 同一个标签页里解锁过就不用再输一遍，关掉标签页就忘了
  const memoryKey = `note-password:${pathname}`;

  async function open(value: string, silent = false) {
    setBusy(true);
    if (!silent) setError(undefined);

    try {
      if (!globalThis.crypto?.subtle) throw new Error('no-subtle');
      const markdown = await decrypt(payload, value);
      // 渲染器和它带的一堆插件只在解锁之后才加载
      const { renderNote } = await import('@/lib/render-note');
      setContent(await renderNote(markdown));
      sessionStorage.setItem(memoryKey, value);
      setPassword('');
      return true;
    } catch (e) {
      sessionStorage.removeItem(memoryKey);
      if (!silent) {
        setError(
          e instanceof Error && e.message === 'no-subtle'
            ? '这个浏览器环境不能解密，站点需要跑在 https 或 localhost 上'
            : // AES-GCM 校验不过就是口令不对，分不出别的情况
              '口令不对，再试一次',
        );
        setShake((n) => n + 1);
        setPassword(''); // 清空重输，卡片会重挂一次顺便把焦点还回去
      }
      return false;
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const saved = sessionStorage.getItem(memoryKey);
    if (saved) void open(saved, true);
    // 只在进页面时试一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memoryKey]);

  if (content !== undefined) return <>{content}</>;

  return (
    <div className="my-10 flex justify-center not-prose">
      <div
        key={shake}
        className={cn(
          'w-full max-w-sm rounded-2xl border bg-fd-card p-8 text-center shadow-sm',
          shake > 0 && 'note-shake',
        )}
      >
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-fd-primary/10 text-fd-primary">
          <LockIcon className="size-5" />
        </div>
        <h2 className="text-base font-medium text-fd-card-foreground">这篇笔记上了锁</h2>
        <p className="mt-1.5 text-sm text-fd-muted-foreground">
          正文是加密存的，口令只在你自己的浏览器里用来解密，不会发给服务器。
        </p>

        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (!busy && password.length > 0) void open(password);
          }}
          className="mt-6 flex flex-col gap-2.5"
        >
          <div className="relative">
            <KeyRoundIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-fd-muted-foreground" />
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(undefined);
              }}
              disabled={busy}
              autoFocus
              autoComplete="off"
              placeholder="输入口令"
              aria-label="口令"
              aria-invalid={Boolean(error)}
              className={cn(
                'w-full rounded-lg border bg-fd-background py-2 pe-3 ps-9 text-sm outline-none transition-colors',
                'placeholder:text-fd-muted-foreground focus-visible:border-fd-primary',
                error && 'border-fd-error',
              )}
            />
          </div>

          <button
            type="submit"
            disabled={busy || password.length === 0}
            className={cn(
              buttonVariants({ variant: 'primary' }),
              'w-full gap-1.5 disabled:opacity-50',
            )}
          >
            {busy && <LoaderCircleIcon className="size-4 animate-spin" />}
            {busy ? '解锁中' : '解锁'}
          </button>

          {/* 固定高度，出错时不会把卡片顶一下 */}
          <p role="alert" className="min-h-4 text-xs text-fd-error">
            {error}
          </p>
        </form>
      </div>
    </div>
  );
}
