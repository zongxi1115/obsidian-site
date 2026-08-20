import { defineConfig } from 'fumadocs-mdx/config';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import { rehypeCodeDefaultOptions, remarkMdxMermaid } from 'fumadocs-core/mdx-plugins';
import { remarkObsidianCallout, remarkObsidianInline } from './lib/mdx/remark-obsidian';

// 笔记是 .md，MDX 会用 markdown 模式解析，默认把裸 HTML 整段丢掉。
// 加 rehype-raw 把它们变回真的元素，<iframe>、<details>、<kbd> 这些就能用了。
// passThrough 是给上面几个 remark 插件产出的 JSX 节点留的，不然会被 HTML 解析器吃掉。
const MDX_NODES = [
  'mdxFlowExpression',
  'mdxJsxFlowElement',
  'mdxJsxTextElement',
  'mdxTextExpression',
  'mdxjsEsm',
];

export default defineConfig({
  // 内容是别人写的笔记，什么都可能出现。这里的原则是「渲染不出来就降级，别让构建挂掉」
  mdxOptions: {
    remarkImageOptions: {
      // 默认会把 ![](路径) 编译成真正的 import，图片少一张整个构建就失败。
      // 关掉之后只是拿不到尺寸，页面照样出得来
      useImport: false,
      onError: 'ignore',
    },
    rehypeCodeOptions: {
      ...rehypeCodeDefaultOptions, // 主题和 // [!code highlight] 那几个 transformer
      // 代码块写了 shiki 不认识的语言（Pseudocode、伪代码、随手写的标记）时，
      // 不抛错，按纯文本渲染
      fallbackLanguage: 'text',
      onError: (error) => {
        console.warn('[mdx] 代码高亮失败，按纯文本处理：', error);
      },
    },
    // preset: 'fumadocs' 保留默认插件（标题锚点、代码高亮、TOC），只往上加自己要的
    remarkPlugins: (v) => [
      remarkMath,
      remarkObsidianCallout,
      remarkObsidianInline,
      remarkMdxMermaid, // ```mermaid 代码块 → <Mermaid />
      ...v,
    ],
    rehypePlugins: (v) => [[rehypeRaw, { passThrough: MDX_NODES }], rehypeKatex, ...v],
  },
});
