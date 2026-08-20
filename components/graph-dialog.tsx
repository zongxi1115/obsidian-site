'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { GraphView, type GraphLink, type GraphNode } from '@/components/graph-view';

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

type Scope = 'local' | 'full';

const TITLE: Record<Scope, string> = {
  local: '关系图谱 · 这一块',
  full: '关系图谱 · 全部笔记',
};

/**
 * 侧栏小窗 + 放大后的模态框。
 * 小窗只画局部（同目录 + 直连），右上角两个按钮分别放大局部和整张图。
 * 「按目录连线」的开关在放大后的弹窗里（GraphView 非 compact 模式自带）。
 */
export function GraphSidePanel({
  local,
  full,
  activeId,
}: {
  local: GraphData;
  full: GraphData;
  activeId?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [scope, setScope] = useState<Scope | null>(null);

  // showModal 才有 ::backdrop 和 Esc 关闭
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (scope && !el.open) el.showModal();
    if (!scope && el.open) el.close();
  }, [scope]);

  const data = scope === 'full' ? full : local;

  return (
    <>
      <GraphView
        nodes={local.nodes}
        links={local.links}
        activeId={activeId}
        compact
        onExpand={setScope}
      />

      <dialog
        ref={ref}
        onClose={() => setScope(null)}
        onClick={(e) => {
          // 点到 dialog 本体（也就是遮罩区域）时关掉
          if (e.target === ref.current) setScope(null);
        }}
        className="bg-fd-popover text-fd-popover-foreground m-auto w-[min(1100px,92vw)] rounded-2xl border p-4 shadow-xl backdrop:bg-black/50 backdrop:backdrop-blur-sm"
      >
        {scope && (
          <>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-medium">{TITLE[scope]}</h2>
              <button
                type="button"
                onClick={() => setScope(null)}
                aria-label="关闭"
                className="hover:bg-fd-accent rounded-lg p-1.5"
              >
                <X className="size-4" />
              </button>
            </div>
            {/* key 让切换 local/full 时重建一次力导图，不然节点会从旧位置乱飞 */}
            <GraphView
              key={scope}
              nodes={data.nodes}
              links={data.links}
              activeId={activeId}
              heightClass="h-[72vh]"
            />
          </>
        )}
      </dialog>
    </>
  );
}
