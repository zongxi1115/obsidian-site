'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Globe, Maximize2 } from 'lucide-react';
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';

export interface GraphNode {
  id: string;
  title: string;
  url: string;
  folder: string;
}

export interface GraphLink {
  source: string;
  target: string;
}

interface SimNode extends SimulationNodeDatum {
  id: string;
  title: string;
  url: string | null; // 目录节点没有页面可跳
  folder: string;
  degree: number;
  isFolder: boolean;
}

type SimLink = SimulationLinkDatum<SimNode> & { kind: 'note' | 'folder' | 'tree' };

/**
 * 配色照着 Obsidian 的关系图谱来：节点统一是灰蓝色，靠大小和连线表达结构，
 * 只有当前正在看的这篇用主题色跳出来。目录节点画成空心圈，类似 Obsidian 里的未解析节点。
 */
const ACCENT = 'var(--color-fd-primary)';
const NODE = 'var(--color-fd-muted-foreground)';
const TEXT = 'var(--color-fd-muted-foreground)';
const TEXT_STRONG = 'var(--color-fd-foreground)';

export function GraphView({
  nodes,
  links,
  activeId,
  compact = false,
  heightClass,
  className,
  onExpand,
}: {
  nodes: GraphNode[];
  links: GraphLink[];
  /** 当前正在看的笔记：钉在正中央，用主题色高亮 */
  activeId?: string;
  /** 侧栏小窗模式：工具栏收成右上角两个图标 */
  compact?: boolean;
  /** 画布高度的 tailwind class */
  heightClass?: string;
  className?: string;
  /** 传了就在右上角显示放大按钮 */
  /** 小窗右上角两个放大按钮：local = 只放大眼前这块，full = 放大整张图 */
  onExpand?: (scope: 'local' | 'full') => void;
}) {
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);

  const [size, setSize] = useState({ width: 0, height: 0 });
  const [showFolders, setShowFolders] = useState(links.length < nodes.length / 2);
  const [hovered, setHovered] = useState<string | null>(null);
  const [transform, setTransform] = useState({ k: 1, x: 0, y: 0 });
  const [, forceRerender] = useState(0);

  const parentOf = (folder: string) =>
    folder.includes('/') ? folder.slice(0, folder.lastIndexOf('/')) : '';

  /** 目录集合要带上所有祖先 —— 有的目录自己没笔记只有子目录，不补的话父子就断开了 */
  const folders = useMemo(() => {
    const set = new Set<string>();
    for (const n of nodes) {
      set.add(n.folder);
      let dir = n.folder;
      while (dir.includes('/')) {
        dir = dir.slice(0, dir.lastIndexOf('/'));
        set.add(dir);
      }
    }

    // 根目录只在「它自己有笔记」或者「要用它把好几个顶层目录连起来」时才画，
    // 不然局部小图里会多出一串 根目录 → LLM → 智能体实践 的空壳
    const topLevel = [...set].filter((f) => f !== '' && !f.includes('/'));
    if (!nodes.some((n) => n.folder === '') && topLevel.length < 2) set.delete('');
    else set.add('');

    return [...set].sort();
  }, [nodes]);

  // 节点和连线：目录节点是可选的虚拟节点，用来在双链还不多的时候把图连起来
  const { simNodes, simLinks } = useMemo(() => {
    const degree = new Map<string, number>();
    for (const l of links) {
      degree.set(l.source, (degree.get(l.source) ?? 0) + 1);
      degree.set(l.target, (degree.get(l.target) ?? 0) + 1);
    }

    const list: SimNode[] = nodes.map((n) => ({
      id: n.id,
      title: n.title,
      url: n.url,
      folder: n.folder,
      degree: degree.get(n.id) ?? 0,
      isFolder: false,
    }));

    const edges: SimLink[] = links.map((l) => ({
      source: l.source,
      target: l.target,
      kind: 'note',
    }));

    if (showFolders) {
      for (const folder of folders) {
        const id = `folder:${folder}`;
        const members = nodes.filter((n) => n.folder === folder);
        const children = folders.filter((f) => f !== folder && parentOf(f) === folder);
        list.push({
          id,
          title: folder === '' ? '根目录' : (folder.split('/').at(-1) ?? folder),
          url: null,
          folder,
          degree: members.length + children.length,
          isFolder: true,
        });
        for (const m of members) edges.push({ source: id, target: m.id, kind: 'folder' });
        // 目录挂到父目录上，整棵目录树才是连着的（父目录被省掉了就不连）
        const parent = parentOf(folder);
        if (folder !== '' && folders.includes(parent)) {
          edges.push({ source: `folder:${parent}`, target: id, kind: 'tree' });
        }
      }
    }

    return { simNodes: list, simLinks: edges };
  }, [nodes, links, folders, showFolders]);

  // 容器尺寸：ResizeObserver 在个别环境里不触发，所以再兜一层直接量 + window resize
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      setSize((prev) =>
        Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1
          ? prev
          : { width, height },
      );
    };

    measure();
    const raf = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener('resize', measure);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  // 力导向布局
  useEffect(() => {
    if (!size.width || !size.height) return;
    const scale = compact ? 0.55 : 1; // 小窗里整体收紧一点
    const cx = size.width / 2;
    const cy = size.height / 2;

    const sim = forceSimulation<SimNode, SimLink>(simNodes)
      .force(
        'link',
        forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance((l) => ({ tree: 60, folder: 80, note: 110 })[l.kind] * scale)
          .strength((l) => ({ tree: 0.6, folder: 0.25, note: 0.7 })[l.kind]),
      )
      .force(
        'charge',
        forceManyBody<SimNode>().strength((d) => (d.isFolder ? -420 : -260) * scale),
      )
      .force('center', forceCenter(cx, cy))
      .force(
        'collide',
        forceCollide<SimNode>().radius((d) => radiusOf(d, compact, d.id === activeId) + (compact ? 10 : 24)),
      )
      .force('x', forceX(cx).strength(0.03))
      .force('y', forceY(cy).strength(0.03))
      .on('tick', () => forceRerender((v) => v + 1));

    simRef.current = sim;
    return () => {
      sim.stop();
      simRef.current = null;
    };
  }, [simNodes, simLinks, size.width, size.height, compact, activeId]);

  /* ------------------------------------------------------ 缩放 / 拖拽 */

  const dragging = useRef<SimNode | null>(null);
  const panning = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const moved = useRef(false);
  /**
   * 按下去的那个节点先放这儿，手指移动超过阈值才算真的在拖。
   * 手指本来就会抖几像素，以前一动就当拖拽，导致手机上点节点老是跳不过去。
   */
  const pending = useRef<{
    node: SimNode;
    x: number;
    y: number;
    pointerId: number;
    target: Element;
    touch: boolean;
  } | null>(null);

  const dragThreshold = (touch: boolean) => (touch ? 12 : 4);

  // 触屏上给节点套一圈更大的透明命中区，鼠标就不用了（免得点歪到邻居身上）
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    const sync = () => setCoarse(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  const hitPadding = coarse ? 10 : 3;

  const toSimCoords = (clientX: number, clientY: number) => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - transform.x) / transform.k,
      y: (clientY - rect.top - transform.y) / transform.k,
    };
  };

  const onWheel = (e: React.WheelEvent) => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const k = Math.min(4, Math.max(0.2, transform.k * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    // 以指针位置为锚点缩放
    setTransform({
      k,
      x: px - ((px - transform.x) / transform.k) * k,
      y: py - ((py - transform.y) / transform.k) * k,
    });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = pending.current;
    if (p) {
      const dist = Math.hypot(e.clientX - p.x, e.clientY - p.y);
      if (dist < dragThreshold(p.touch)) return; // 还在抖动范围里，当没动
      // 真的开始拖了，这时候才抓指针、才让 d3 跟手
      try {
        p.target.setPointerCapture?.(p.pointerId);
      } catch {
        // 指针已经不在了（触控、合成事件等），捕获失败不影响拖拽
      }
      dragging.current = p.node;
      moved.current = true;
      pending.current = null;
    }

    if (dragging.current) {
      const { x, y } = toSimCoords(e.clientX, e.clientY);
      dragging.current.fx = x;
      dragging.current.fy = y;
      simRef.current?.alphaTarget(0.3).restart();
      return;
    }
    if (panning.current) {
      // 先把值取出来：setTransform 的 updater 是延后跑的，
      // 那时候 panning.current 可能已经被 pointerup 清成 null 了
      const { x: startX, y: startY, tx, ty } = panning.current;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      setTransform((t) => ({ ...t, x: tx + dx, y: ty + dy }));
    }
  };

  const endInteraction = () => {
    if (dragging.current) {
      dragging.current.fx = null;
      dragging.current.fy = null;
      simRef.current?.alphaTarget(0);
    }
    dragging.current = null;
    panning.current = null;
    pending.current = null;
  };

  /* ---------------------------------------------------------- 高亮 */

  const neighbors = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const l of simLinks) {
      const s = typeof l.source === 'object' ? (l.source as SimNode).id : String(l.source);
      const t = typeof l.target === 'object' ? (l.target as SimNode).id : String(l.target);
      if (!map.has(s)) map.set(s, new Set());
      if (!map.has(t)) map.set(t, new Set());
      map.get(s)!.add(t);
      map.get(t)!.add(s);
    }
    return map;
  }, [simLinks]);

  const related = (id: string) => id === hovered || (hovered !== null && !!neighbors.get(hovered)?.has(id));
  const dimmed = (id: string) => hovered !== null && !related(id);
  // Obsidian 缩太小的时候会把标签藏起来
  const labelsVisible = transform.k > (compact ? 0.75 : 0.5);

  return (
    <div className={className}>
      {!compact && (
        <div className="text-fd-muted-foreground mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <label className="flex items-center gap-2 select-none">
            <input
              type="checkbox"
              checked={showFolders}
              onChange={(e) => setShowFolders(e.target.checked)}
              className="accent-fd-primary"
            />
            按目录连线
          </label>
          <span>
            {nodes.length} 篇 · {links.length} 条双链
          </span>
          <button
            type="button"
            onClick={() => setTransform({ k: 1, x: 0, y: 0 })}
            className="hover:text-fd-foreground ms-auto"
          >
            重置视角
          </button>
        </div>
      )}

      <div
        ref={wrapperRef}
        className={`bg-fd-card relative w-full overflow-hidden rounded-xl border ${
          heightClass ?? (compact ? 'h-64' : 'h-[70vh]')
        }`}
        onWheel={onWheel}
        onPointerMove={onPointerMove}
        onPointerUp={endInteraction}
        onPointerLeave={() => {
          endInteraction();
          setHovered(null);
        }}
        onPointerDown={(e) => {
          panning.current = { x: e.clientX, y: e.clientY, tx: transform.x, ty: transform.y };
        }}
      >
        {compact && onExpand && (
          <div className="text-fd-muted-foreground absolute end-2 top-2 z-10 flex items-center gap-1">
            {/* 「按目录连线」的开关挪进放大后的弹窗里了，小窗上只留两个放大 */}
            <button
              type="button"
              title="放大这一块（同目录 + 直连）"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onExpand('local')}
              className="hover:bg-fd-accent hover:text-fd-foreground rounded p-1"
            >
              <Maximize2 className="size-3.5" />
            </button>
            <button
              type="button"
              title="放大整张图（全部笔记）"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onExpand('full')}
              className="hover:bg-fd-accent hover:text-fd-foreground rounded p-1"
            >
              <Globe className="size-3.5" />
            </button>
          </div>
        )}

        <svg width={size.width} height={size.height} className="touch-none">
          <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
            {simLinks.map((l, i) => {
              const s = l.source as SimNode;
              const t = l.target as SimNode;
              if (typeof s !== 'object' || typeof t !== 'object') return null;
              const highlight = hovered !== null && (s.id === hovered || t.id === hovered);
              const fade = hovered !== null && !highlight;
              return (
                <line
                  key={i}
                  x1={s.x}
                  y1={s.y}
                  x2={t.x}
                  y2={t.y}
                  style={{
                    stroke: highlight ? TEXT_STRONG : NODE,
                    strokeWidth: highlight ? 1.6 : 1,
                    opacity: fade ? 0.1 : highlight ? 0.9 : 0.35,
                    transition: 'opacity 160ms ease-out, stroke-width 160ms ease-out',
                  }}
                />
              );
            })}

            {simNodes.map((n) => {
              const isActive = n.id === activeId;
              const r = radiusOf(n, compact, isActive);
              const isHovered = n.id === hovered;
              const fade = dimmed(n.id);
              return (
                <g
                  key={n.id}
                  transform={`translate(${n.x ?? 0},${n.y ?? 0})`}
                  style={{ opacity: fade ? 0.25 : 1, transition: 'opacity 160ms ease-out' }}
                  className={n.url ? 'cursor-pointer' : 'cursor-grab'}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    moved.current = false;
                    pending.current = {
                      node: n,
                      x: e.clientX,
                      y: e.clientY,
                      pointerId: e.pointerId,
                      target: e.currentTarget as Element,
                      touch: e.pointerType !== 'mouse',
                    };
                  }}
                  onPointerEnter={() => setHovered(n.id)}
                  onPointerLeave={() => setHovered(null)}
                  onClick={() => {
                    // 拖完不要顺手把人跳走
                    if (n.url && !moved.current) router.push(n.url);
                  }}
                >
                  {/* 手指点得到的范围：圆点本身太小了，套一圈透明的
                      （除以缩放系数，保证屏幕上看到的那圈始终一样大） */}
                  <circle r={r + hitPadding / transform.k} fill="transparent" />
                  <circle
                    style={{
                      // r 在 SVG2 里是 CSS 属性，能直接过渡；浮上去稍微鼓一点
                      r: isHovered ? r * 1.25 : r,
                      fill: n.isFolder ? 'transparent' : isActive ? ACCENT : NODE,
                      stroke: isActive ? ACCENT : NODE,
                      opacity: n.isFolder ? 0.7 : isHovered ? 1 : 0.85,
                      transition: 'r 160ms ease-out, opacity 160ms ease-out',
                    }}
                    // r 属性兜底：万一浏览器不认 CSS 的 r，至少尺寸是对的
                    r={r}
                    strokeWidth={n.isFolder ? 1.5 : 0}
                  />
                  {labelsVisible && (
                    <text
                      y={r + (compact ? 11 : 14)}
                      textAnchor="middle"
                      style={{
                        // 字号本身就能过渡，居中对齐所以是从中间长开的
                        fontSize: (compact ? 9 : 11) * (isHovered ? 1.35 : 1),
                        fill: isActive ? ACCENT : isHovered ? TEXT_STRONG : TEXT,
                        fontWeight: isActive || isHovered ? 600 : 400,
                        // 同时往下挪一点，不然放大后正好被鼠标指针盖住
                        transform: isHovered ? `translateY(${compact ? 6 : 8}px)` : undefined,
                        pointerEvents: 'none',
                        transition:
                          'font-size 160ms ease-out, fill 160ms ease-out, transform 160ms ease-out',
                      }}
                    >
                      {n.title}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}

/** 连线越多的节点越大，和 Obsidian 一样；当前正在看的这篇再放大一圈 */
function radiusOf(n: SimNode, compact = false, isActive = false) {
  const scale = compact ? 0.75 : 1;
  if (n.isFolder) return 5.5 * scale;
  const base = 4.5 + Math.min(8, Math.sqrt(n.degree) * 3);
  return (isActive ? base * 1.7 + 2 : base) * scale;
}
