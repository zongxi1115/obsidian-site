import type { ReactNode } from 'react';
import {
  CalloutContainer,
  CalloutDescription,
  CalloutTitle,
} from 'fumadocs-ui/components/callout';
import {
  Bug,
  Check,
  ChevronDown,
  CircleCheck,
  CircleHelp,
  ClipboardList,
  Flame,
  Info,
  List,
  Pencil,
  Quote,
  TriangleAlert,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';

/** 配色抄的 Obsidian 自己那套，深浅色主题下都够亮 */
const STYLES: Record<string, { color: string; icon: LucideIcon; label: string }> = {
  note: { color: '#086ddd', icon: Pencil, label: 'Note' },
  abstract: { color: '#00bfbc', icon: ClipboardList, label: 'Abstract' },
  info: { color: '#086ddd', icon: Info, label: 'Info' },
  todo: { color: '#086ddd', icon: CircleCheck, label: 'Todo' },
  tip: { color: '#00bfbc', icon: Flame, label: 'Tip' },
  success: { color: '#08b94e', icon: Check, label: 'Success' },
  question: { color: '#ec7500', icon: CircleHelp, label: 'Question' },
  warning: { color: '#ec7500', icon: TriangleAlert, label: 'Warning' },
  failure: { color: '#e93147', icon: X, label: 'Failure' },
  danger: { color: '#e93147', icon: Zap, label: 'Danger' },
  bug: { color: '#e93147', icon: Bug, label: 'Bug' },
  example: { color: '#7852ee', icon: List, label: 'Example' },
  quote: { color: '#9e9e9e', icon: Quote, label: 'Quote' },
};

/** Obsidian 里同一种 callout 有好几个写法 */
const ALIASES: Record<string, keyof typeof STYLES> = {
  summary: 'abstract',
  tldr: 'abstract',
  hint: 'tip',
  important: 'tip',
  check: 'success',
  done: 'success',
  help: 'question',
  faq: 'question',
  caution: 'warning',
  attention: 'warning',
  fail: 'failure',
  missing: 'failure',
  error: 'danger',
  cite: 'quote',
};

export interface ObsidianCalloutProps {
  type?: string;
  title?: string;
  /** `-` 默认折叠，`+` 默认展开但可以折 */
  fold?: string;
  children?: ReactNode;
}

export function ObsidianCallout({ type = 'note', title, fold, children }: ObsidianCalloutProps) {
  const key = type.toLowerCase();
  const style = STYLES[key] ?? STYLES[ALIASES[key]] ?? STYLES.note;
  const Icon = style.icon;
  // 不写标题时 Obsidian 会拿类型名当标题
  const heading = title || style.label;

  const container = (
    <CalloutContainer
      type="info"
      style={{ '--callout-color': style.color } as React.CSSProperties}
      icon={<Icon className="size-5 -me-0.5 text-(--callout-color)" />}
    >
      {fold ? (
        <details open={fold === '+'} className="group/callout">
          <summary className="flex cursor-pointer list-none items-center gap-1 font-medium marker:hidden">
            {heading}
            <ChevronDown className="size-4 text-fd-muted-foreground transition-transform group-open/callout:rotate-180" />
          </summary>
          <CalloutDescription className="mt-2">{children}</CalloutDescription>
        </details>
      ) : (
        <>
          <CalloutTitle>{heading}</CalloutTitle>
          <CalloutDescription>{children}</CalloutDescription>
        </>
      )}
    </CalloutContainer>
  );

  return container;
}
