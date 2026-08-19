'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { GraphView, type GraphLink, type GraphNode } from '@/components/graph-view';

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

/**
 * 侧栏小窗 + 放大后的模态框。
 * 小窗只画局部（同目录 + 直连），模态框画整张图。
 * 小窗右上角那两个图标由 GraphView 自己画（照着 Obsidian 的位置），这里只管弹窗。
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
  const [open, setOpen] = useState(false);

  // showModal 才有 ::backdrop 和 Esc 关闭
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <>
      <GraphView
        nodes={local.nodes}
        links={local.links}
        activeId={activeId}
        compact
        onExpand={() => setOpen(true)}
      />

      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          // 点到 dialog 本体（也就是遮罩区域）时关掉
          if (e.target === ref.current) setOpen(false);
        }}
        className="bg-fd-popover text-fd-popover-foreground m-auto w-[min(1100px,92vw)] rounded-2xl border p-4 shadow-xl backdrop:bg-black/50 backdrop:backdrop-blur-sm"
      >
        {open && (
          <>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-medium">关系图谱</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="关闭"
                className="hover:bg-fd-accent rounded-lg p-1.5"
              >
                <X className="size-4" />
              </button>
            </div>
            <GraphView
              nodes={full.nodes}
              links={full.links}
              activeId={activeId}
              heightClass="h-[72vh]"
            />
          </>
        )}
      </dialog>
    </>
  );
}
