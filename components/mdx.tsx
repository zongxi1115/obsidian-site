import defaultMdxComponents from 'fumadocs-ui/mdx';
import { ImageZoom } from 'fumadocs-ui/components/image-zoom';
import type { MDXComponents } from 'mdx/types';
import type { ComponentProps } from 'react';
import { ObsidianCallout } from '@/components/obsidian-callout';
import { Mermaid } from '@/components/mermaid';
import { cn } from '@/lib/cn';

/**
 * 笔记里的图，点一下放大预览。
 *
 * next/image 强制要 width/height，而这两个值要靠构建期去读图片文件才拿得到 ——
 * 图片没跟着笔记一起提交、或者是运行时渲染（悬浮预览、口令解锁）的时候就没有。
 * 少一张图不该让整个页面挂掉，所以拿不到尺寸就退回原生 <img>。
 * ImageZoom 传了 children 就不会再套 next/image，放大照样有。
 */
export function Img({ className, ...props }: ComponentProps<'img'>) {
  const sized = props.width !== undefined && props.height !== undefined;

  if (sized) {
    return <ImageZoom {...({ ...props, className } as ComponentProps<typeof ImageZoom>)} />;
  }

  return (
    <ImageZoom {...({ src: props.src } as ComponentProps<typeof ImageZoom>)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img {...props} alt={props.alt ?? ''} className={cn('rounded-lg', className)} />
    </ImageZoom>
  );
}

/** 笔记里直接写 <iframe>（B 站、YouTube、地图那些）时给个统一的外框 */
function Frame({ className, ...props }: ComponentProps<'iframe'>) {
  return (
    <span className="my-6 block overflow-hidden rounded-xl border bg-fd-muted">
      <iframe
        loading="lazy"
        allowFullScreen
        {...props}
        className={cn('w-full border-0', props.height ? undefined : 'aspect-video', className)}
      />
    </span>
  );
}

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    img: Img,
    iframe: Frame,
    // > [!tip] 这类 Obsidian callout，由 lib/mdx/remark-obsidian.ts 转过来
    ObsidianCallout,
    // ```mermaid 代码块
    Mermaid,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
