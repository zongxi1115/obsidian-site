import type { Metadata } from 'next';
import { GraphView } from '@/components/graph-view';
import graph from '@/content/graph.json';

export const metadata: Metadata = {
  title: '关系图谱',
  description: '笔记之间的双向链接关系',
};

export default function GraphPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-bold">关系图谱</h1>
      <p className="text-fd-muted-foreground mt-1 mb-5 text-sm">
        点节点跳到对应笔记，拖动可以摆位置，滚轮缩放，悬停会高亮它的邻居。空心圈是目录节点。
      </p>
      <GraphView nodes={graph.nodes} links={graph.links} />
    </main>
  );
}
