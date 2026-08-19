import { defineConfig } from 'fumadocs-mdx/config';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import { remarkMdxMermaid } from 'fumadocs-core/mdx-plugins';
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
  mdxOptions: {
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
