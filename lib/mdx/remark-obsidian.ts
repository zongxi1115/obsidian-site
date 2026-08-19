import { visit } from 'unist-util-visit';
import type { Nodes, Parent, PhrasingContent, Root, RootContent, Text } from 'mdast';

/**
 * Obsidian / GitHub 的 callout 语法：
 *
 *   > [!tip] 标题
 *   > 正文
 *
 * `[!tip]-` 折叠、`[!tip]+` 默认展开，两种都认。
 * 转成 <ObsidianCallout type="tip" title="标题" fold="-">，
 * 组件在 components/mdx.tsx 里，按 Obsidian 的配色和图标渲染。
 */
const CALLOUT = /^\[!([A-Za-z][\w-]*)\]([+-]?)[ \t]*([^\n]*)/;

function attr(name: string, value: string) {
  return { type: 'mdxJsxAttribute' as const, name, value };
}

export function remarkObsidianCallout() {
  return (tree: Root) => {
    visit(tree, 'blockquote', (node, index, parent) => {
      if (!parent || index === undefined) return;

      const first = node.children[0];
      if (first?.type !== 'paragraph') return;
      const lead = first.children[0];
      if (lead?.type !== 'text') return;

      const m = CALLOUT.exec(lead.value);
      if (!m) return;
      const [matched, type, fold, title] = m;

      // 把 "[!tip] 标题" 这段从正文里摘掉，剩下的换行开始才是内容
      lead.value = lead.value.slice(matched.length).replace(/^\r?\n/, '');
      if (lead.value.length === 0) {
        first.children.shift();
        if (first.children.length === 0) node.children.shift();
      }

      parent.children[index] = {
        type: 'mdxJsxFlowElement',
        name: 'ObsidianCallout',
        attributes: [
          attr('type', type.toLowerCase()),
          ...(title ? [attr('title', title.trim())] : []),
          ...(fold ? [attr('fold', fold)] : []),
        ],
        children: node.children,
        // callout 可以套 callout，替换完回到原位再走一遍，里层才会被处理到
      } as unknown as RootContent;
      return index;
    });
  };
}

/** ==高亮== → <mark>，%%注释%% 直接删掉（Obsidian 里这两个都不是标准 markdown） */
export function remarkObsidianInline() {
  return (tree: Root) => {
    visit(tree, 'text', (node: Text, index, parent) => {
      if (!parent || index === undefined) return;
      if (!node.value.includes('==') && !node.value.includes('%%')) return;

      const out: PhrasingContent[] = [];
      let rest = node.value;

      while (rest.length > 0) {
        const m = /==([^\n=][^\n]*?)==|%%([\s\S]*?)%%/.exec(rest);
        if (!m) break;

        if (m.index > 0) out.push({ type: 'text', value: rest.slice(0, m.index) });
        if (m[1] !== undefined) {
          // emphasis + hName：借 <em> 的节点类型渲染成 <mark>，不用额外注册组件
          out.push({
            type: 'emphasis',
            data: { hName: 'mark' },
            children: [{ type: 'text', value: m[1] }],
          });
        }
        rest = rest.slice(m.index + m[0].length);
      }

      if (out.length === 0) return;
      if (rest.length > 0) out.push({ type: 'text', value: rest });
      (parent as Parent).children.splice(index, 1, ...(out as Nodes[] as never[]));
      return index + out.length;
    });

    // 整段都是 %%注释%% 的话，上面会留下一个空段落
    visit(tree, 'paragraph', (node, index, parent) => {
      if (!parent || index === undefined) return;
      if (node.children.length === 0) {
        parent.children.splice(index, 1);
        return index;
      }
    });
  };
}
