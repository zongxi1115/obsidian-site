import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { baseOptions } from '@/lib/layout.shared';
import { aiEnabled } from '@/lib/ai';
import { AISearch, AISearchPanel, AISearchTrigger } from '@/components/ai/search';
import { buttonVariants } from 'fumadocs-ui/components/ui/button';
import { MessageCircleIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export default function Layout({ children }: LayoutProps<'/docs'>) {
  return (
    <DocsLayout tree={source.getPageTree()} {...baseOptions()}>
      {/* 没配 AI_API_KEY 就不显示，免得点了报错 */}
      {aiEnabled && (
        <AISearch>
          <AISearchPanel />
          <AISearchTrigger
            position="float"
            className={cn(
              buttonVariants({
                variant: 'secondary',
                className: 'text-fd-muted-foreground rounded-2xl',
              }),
            )}
          >
            <MessageCircleIcon className="size-4.5" />
            问问 AI
          </AISearchTrigger>
        </AISearch>
      )}
      {children}
    </DocsLayout>
  );
}
