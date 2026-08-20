import { GraphSidePanel } from '@/components/graph-dialog';
import { fullGraph, localGraph } from '@/lib/graph';

/** 右侧栏和移动端目录弹层里的关系图谱，放在 "On this page" 上面 */
export function GraphPanel({ activeId }: { activeId?: string }) {
  const local = localGraph(activeId);

  return (
    <div className="mb-5">
      <h3 className="mb-2 text-sm font-medium">关系图谱</h3>
      {/* 小窗画局部（同目录 + 直连），两个放大按钮分别放大局部和整张图 */}
      <GraphSidePanel local={local} full={fullGraph} activeId={activeId} />
    </div>
  );
}
