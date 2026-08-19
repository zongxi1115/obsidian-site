import { isIndexable, source } from '@/lib/source';
import { createFromSource } from 'fumadocs-core/search/server';

// createFromSource 只会调 loader.getPages()，包一层把不该被搜到的页面挡掉：
// display: none 的（藏起来的）和加了口令的（正文本来就是密文）
const searchable = new Proxy(source, {
  get(target, prop, receiver) {
    if (prop === 'getPages') return () => target.getPages().filter(isIndexable);
    return Reflect.get(target, prop, receiver);
  },
});

export const { GET } = createFromSource(searchable);
