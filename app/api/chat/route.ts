import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  tool,
  toUIMessageStream,
} from 'ai';
import { z } from 'zod';
import { isIndexable, source } from '@/lib/source';
import { aiConfig, aiEnabled } from '@/lib/ai';
import { Document, type DocumentData } from 'flexsearch';
import { ChatUIMessage, SearchTool } from '../../../components/ai/search';

interface CustomDocument extends DocumentData {
  url: string;
  title: string;
  description: string;
  content: string;
}
const searchServer = createSearchServer();

async function createSearchServer() {
  const search = new Document<CustomDocument>({
    document: {
      id: 'url',
      index: ['title', 'description', 'content'],
      store: true,
    },
  });

  const docs = await chunkedAll(
    // 藏起来的和加了口令的笔记不进 AI 的检索范围
    source.getPages().filter(isIndexable).map(async (page) => {
      if (!('getText' in page.data)) return null;

      return {
        title: page.data.title,
        description: page.data.description,
        url: page.url,
        content: await page.data.getText('processed'),
      } as CustomDocument;
    }),
  );

  for (const doc of docs) {
    if (doc) search.add(doc);
  }

  return search;
}

async function chunkedAll<O>(promises: Promise<O>[]): Promise<O[]> {
  const SIZE = 50;
  const out: O[] = [];
  for (let i = 0; i < promises.length; i += SIZE) {
    out.push(...(await Promise.all(promises.slice(i, i + SIZE))));
  }
  return out;
}

const provider = createOpenAICompatible({
  name: 'custom',
  baseURL: aiConfig.baseURL,
  apiKey: aiConfig.apiKey,
});

/** System prompt, you can update it to provide more specific information */
const systemPrompt = [
  '你是这个个人笔记站的问答助手，站上的内容是作者自己的 Obsidian 笔记，主题偏计算机、前端和大模型。',
  '回答之前先用 `search` 工具检索笔记，不要凭记忆作答。',
  '`search` 返回的是笔记的原始 JSON，用它来支撑回答，并用结果里的 `url` 字段以 markdown 链接的形式给出出处。',
  '如果检索不到相关内容，就直说笔记里没有写，并建议换个说法再搜一次，不要编造笔记里没有的内容。',
  '默认用中文回答，语气平实，能引用笔记原文就引用。',
].join('\n');

export async function POST(req: Request) {
  if (!aiEnabled) {
    return Response.json({ error: '还没配 AI_API_KEY，AI 问答不可用' }, { status: 503 });
  }

  const reqJson = await req.json();

  const result = streamText({
    model: provider.chatModel(aiConfig.model),
    stopWhen: stepCountIs(5),
    tools: {
      search: searchTool,
    },
    // ai@7 起 system 不能混在 messages 里，要走 instructions
    instructions: systemPrompt,
    messages: [
      ...(await convertToModelMessages<ChatUIMessage>(reqJson.messages ?? [], {
        convertDataPart(part) {
          if (part.type === 'data-client')
            return {
              type: 'text',
              text: `[Client Context: ${JSON.stringify(part.data)}]`,
            };
        },
      })),
    ],
    toolChoice: 'auto',
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}

const searchTool = tool({
  description: 'Search the docs content and return raw JSON results.',
  inputSchema: z.object({
    query: z.string(),
    limit: z.number().int().min(1).max(100).default(10),
  }),
  async execute({ query, limit }) {
    const search = await searchServer;
    return await search.searchAsync(query, { limit, merge: true, enrich: true });
  },
}) satisfies SearchTool;