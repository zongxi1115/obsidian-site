import { defineConfig } from 'fumadocs-mdx/config';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

export default defineConfig({
  mdxOptions: {
    // preset: 'fumadocs' 保留默认插件（标题锚点、代码高亮、TOC），只往上加数学公式
    remarkPlugins: (v) => [remarkMath, ...v],
    rehypePlugins: (v) => [rehypeKatex, ...v],
  },
});
