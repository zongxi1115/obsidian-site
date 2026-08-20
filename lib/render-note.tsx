import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import { toJsxRuntime } from 'hast-util-to-jsx-runtime';
import { visit } from 'unist-util-visit';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { Children, type ComponentProps, type ReactElement, type ReactNode } from 'react';
import { DynamicCodeBlock } from 'fumadocs-ui/components/dynamic-codeblock';
import { ImageZoom } from 'fumadocs-ui/components/image-zoom';
import { getMDXComponents } from '@/components/mdx';
import { cn } from '@/lib/cn';
import { remarkObsidianCallout, remarkObsidianInline } from '@/lib/mdx/remark-obsidian';

/**
 * 口令保护的笔记是在浏览器里解密的，没法走构建期那条 MDX 流水线，
 * 所以这里用同一批插件在客户端重建一遍：GFM、公式、Obsidian callout、裸 HTML。
 *
 * 这个模块只在解锁成功后才 import()，平时不会进首屏包。
 */

const MDX_NODES = ['mdxJsxFlowElement', 'mdxJsxTextElement'];

/** remark 插件产出的是 JSX 节点，转成普通 hast 元素，交给下面的 components 映射 */
function rehypeMdxToElements() {
  return (tree: object) => {
    visit(tree as never, (node: Record<string, unknown>) => {
      if (!MDX_NODES.includes(node.type as string)) return;
      const properties: Record<string, string> = {};
      for (const a of (node.attributes ?? []) as { type: string; name: string; value: unknown }[]) {
        if (a.type === 'mdxJsxAttribute' && typeof a.value === 'string') properties[a.name] = a.value;
      }
      Object.assign(node, { type: 'element', tagName: node.name, properties });
    });
  };
}

/**
 * 构建期那条流水线里 remarkImage 会去读图片文件、把 width/height 填好，
 * next/image 才不会报错。这里是运行时渲染的，没这一步，所以退回原生 <img>。
 * ImageZoom 传了 children 就不会再套 next/image，点击放大还是有的。
 */
function Img({ className, ...props }: ComponentProps<'img'>) {
  return (
    <ImageZoom {...({ src: props.src } as ComponentProps<typeof ImageZoom>)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img {...props} alt={props.alt ?? ''} className={cn('rounded-lg', className)} />
    </ImageZoom>
  );
}

function Pre(props: ComponentProps<'pre'>) {
  const code = Children.only(props.children) as ReactElement;
  const codeProps = code.props as ComponentProps<'code'>;
  const content = codeProps.children;
  if (typeof content !== 'string') return null;

  const lang =
    codeProps.className
      ?.split(' ')
      .find((v) => v.startsWith('language-'))
      ?.slice('language-'.length) ?? 'text';

  return <DynamicCodeBlock lang={lang} code={content.trimEnd()} />;
}

const processor = remark()
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkObsidianCallout)
  .use(remarkObsidianInline)
  .use(remarkRehype, { allowDangerousHtml: true, passThrough: MDX_NODES } as never)
  .use(rehypeRaw, { passThrough: MDX_NODES })
  .use(rehypeMdxToElements)
  .use(rehypeKatex);

export async function renderNote(markdown: string): Promise<ReactNode> {
  const hast = await processor.run(processor.parse({ value: markdown }));

  return toJsxRuntime(hast as never, {
    development: false,
    jsx,
    jsxs,
    Fragment,
    components: getMDXComponents({ pre: Pre, img: Img }) as never,
  });
}
