import defaultMdxComponents from 'fumadocs-ui/mdx';
import { ImageZoom } from 'fumadocs-ui/components/image-zoom';
import type { MDXComponents } from 'mdx/types';
import type { ComponentProps } from 'react';
import { ObsidianCallout } from '@/components/obsidian-callout';
import { Mermaid } from '@/components/mermaid';
import { cn } from '@/lib/cn';

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
    // 笔记里的图点一下放大预览，再点/Esc 收起
    img: (props: ComponentProps<'img'>) => (
      <ImageZoom {...(props as ComponentProps<typeof ImageZoom>)} />
    ),
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
