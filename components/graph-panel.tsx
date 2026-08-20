import { GraphModalButton, GraphSidePanel } from '@/components/graph-dialog';
import { fullGraph, localGraph } from '@/lib/graph';

/** 右侧栏里的关系图谱，放在 "On this page" 上面 */
export function GraphPanel({ activeId }: { activeId?: string }) {
  const local = localGraph(activeId);

  return (
    <div className="mb-5">
      <h3 className="mb-2 text-sm font-medium">关系图谱</h3>
      {/* 小窗画局部（同目录 + 直连），放大后的模态框画整张图 */}
      <GraphSidePanel local={local} full={fullGraph} activeId={activeId} />
    </div>
  );
}

/**
 * 移动端顶部那个目录弹层里用的版本。
 * 弹层本来就矮，再塞一个 256px 的图谱进去，目录就只剩一条缝了，
 * 所以这里只放一行按钮，想看图点开模态框。
 */
export function GraphPanelCompact({ activeId }: { activeId?: string }) {
  return (
    <div className="mb-3">
      <GraphModalButton local={localGraph(activeId)} full={fullGraph} activeId={activeId} />
    </div>
  );
}
