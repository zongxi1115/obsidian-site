import graph from '@/content/graph.json';
import type { GraphLink, GraphNode } from '@/components/graph-view';

export const fullGraph: { nodes: GraphNode[]; links: GraphLink[] } = {
  nodes: graph.nodes,
  links: graph.links,
};

/**
 * 侧栏小窗只画当前笔记周围那一小块，不然 13 篇挤在 256px 里根本看不清。
 * 取的范围：同目录的所有笔记（这是主要目的）+ 有双链直连的 + 子目录/父目录的笔记。
 * 圈出来太小（比如根目录只有两篇）就干脆退回整张图。
 */
export function localGraph(activeId?: string) {
  const { nodes, links } = fullGraph;
  const active = nodes.find((n) => n.id === activeId);
  if (!active) return fullGraph;

  const keep = new Set<string>([active.id]);

  for (const n of nodes) {
    if (n.folder === active.folder) keep.add(n.id); // 同目录
    if (active.folder && n.folder.startsWith(`${active.folder}/`)) keep.add(n.id); // 子目录
  }

  for (const l of links) {
    if (l.source === active.id) keep.add(l.target);
    if (l.target === active.id) keep.add(l.source);
  }

  // 自己所在目录太空（比如整个目录就一篇），把父目录的笔记也捞进来
  if (keep.size < 6 && active.folder.includes('/')) {
    const parent = active.folder.slice(0, active.folder.lastIndexOf('/'));
    for (const n of nodes) if (n.folder === parent) keep.add(n.id);
  }

  // 孤零零一篇（目录里就它、也没双链）才退回整张图
  if (keep.size < 2) return fullGraph;

  return {
    nodes: nodes.filter((n) => keep.has(n.id)),
    links: links.filter((l) => keep.has(l.source) && keep.has(l.target)),
  };
}
