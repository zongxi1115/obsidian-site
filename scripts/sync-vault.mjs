/**
 * 把 Obsidian 仓库同步成 fumadocs 的内容目录。
 *
 * 来源优先级：
 *   1. 环境变量 VAULT_DIR（本地开发时指向你的 Obsidian 目录）
 *   2. 环境变量 VAULT_REPO（默认下面的 GitHub 仓库），构建时浅克隆
 *
 * 产物（都在 .gitignore 里，不提交）：
 *   content/docs/**      —— 加好 frontmatter、转换过链接的 markdown，文件名是拼音
 *   content/vault-map.json —— 页面路径 → 笔记仓库里的原始路径（给"编辑此页"用）
 *   content/graph.json     —— 双链图谱的节点/连线/反向链接
 *   content/previews.json  —— 每篇的标题/是否上锁，鼠标浮到双链上弹的那个小窗用
 *   content/site.json      —— 从 VAULT_REPO 解析出来的仓库信息，「编辑此页」和默认站名靠它
 *   content/tags.json      —— 标签 → 笔记，/tags 那几个页面用
 *   public/previews/**     —— 那个小窗里要渲染的正文（截断过），悬浮时才去取
 *   public/vault/**      —— 笔记里引用到的图片
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createCipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';
import { pinyin } from 'pinyin-pro';
import GithubSlugger from 'github-slugger';

const ROOT = path.resolve(import.meta.dirname, '..');

// 本地开发时读 .env.local（Vercel 上环境变量由平台注入，没有这个文件）
try {
  process.loadEnvFile(path.join(ROOT, '.env.local'));
} catch {
  // 没有就算了
}

const OUT_DOCS = path.join(ROOT, 'content/docs');
const OUT_MAP = path.join(ROOT, 'content/vault-map.json');
const OUT_GRAPH = path.join(ROOT, 'content/graph.json');
const OUT_PREVIEWS = path.join(ROOT, 'content/previews.json');
const OUT_SITE = path.join(ROOT, 'content/site.json');
const OUT_TAGS = path.join(ROOT, 'content/tags.json');
const OUT_ASSETS = path.join(ROOT, 'public/vault');
const OUT_PREVIEW_DOCS = path.join(ROOT, 'public/previews');
const CACHE = path.join(ROOT, '.vault-cache');

// Vercel 上没填值的环境变量会以空字符串注入，所以空白一律当没设过处理
const env = (name, fallback = '') => {
  const value = process.env[name]?.trim();
  return value ? value : fallback;
};

const DEFAULT_REPO = 'https://github.com/zongxi1115/obsidian-computer';
const VAULT_REPO = env('VAULT_REPO', DEFAULT_REPO);
const VAULT_BRANCH = env('VAULT_BRANCH', 'main');

if (!env('VAULT_REPO')) {
  console.warn(
    '[sync] ⚠️ 没设 VAULT_REPO，用的是内置的示例仓库。' +
      '要换成自己的笔记仓库，设置 VAULT_REPO（本地开发也可以用 VAULT_DIR 指本机目录）。',
  );
}

/**
 * 从仓库地址解析出 owner / repo —— 「在 GitHub 上编辑」的链接和默认站名都靠它。
 * 这样整套换成别人的仓库只需要改 VAULT_REPO 一个变量。
 *
 * 认这几种写法：
 *   https://github.com/owner/repo(.git)
 *   git@github.com:owner/repo.git
 *   https://x-access-token:TOKEN@github.com/owner/repo   （私有仓库）
 */
function parseRepo(url) {
  const cleaned = url.replace(/\.git$/, '').replace(/\/$/, '');
  const m = /^(?:[a-z+]+:\/\/)?(?:[^@/]*@)?([^/:]+)[/:]([^/]+)\/([^/]+)$/i.exec(cleaned);
  if (!m) {
    console.warn(`[sync] 解析不了仓库地址 ${url}，「编辑此页」的链接会不可用`);
    return { host: 'github.com', user: '', repo: 'notes', branch: VAULT_BRANCH };
  }
  const [, host, user, repo] = m;
  return { host, user, repo, branch: VAULT_BRANCH };
}

const repoInfo = parseRepo(VAULT_REPO);

// 宁可多认几种：认不出来的图会被当成死链降级掉，白白少一张图
const IMAGE_EXT = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.jfif',
  '.gif',
  '.svg',
  '.webp',
  '.avif',
  '.bmp',
  '.ico',
  '.tif',
  '.tiff',
  '.apng',
  '.heic',
]);
const SKIP_DIRS = new Set(['.git', '.obsidian', '.trash', '.claudian', 'node_modules', 'Excalidraw']);

/* ---------------------------------------------------------------- 取内容源 */

function resolveVault() {
  const local = env('VAULT_DIR');
  if (local && fs.existsSync(local)) {
    console.log(`[sync] 使用本地仓库 ${local}`);
    return local;
  }
  if (local) {
    console.warn(`[sync] VAULT_DIR=${local} 不存在，改成克隆远端仓库`);
  }

  console.log(`[sync] 内容来源：${VAULT_REPO} (${VAULT_BRANCH})`);

  try {
    if (fs.existsSync(path.join(CACHE, '.git'))) {
      execFileSync('git', ['-C', CACHE, 'fetch', 'origin', VAULT_BRANCH], { stdio: 'inherit' });
      execFileSync('git', ['-C', CACHE, 'reset', '--hard', `origin/${VAULT_BRANCH}`], {
        stdio: 'inherit',
      });
    } else {
      fs.rmSync(CACHE, { recursive: true, force: true });
      // 用 blobless 而不是 --depth 1：要留着提交历史才能算每篇的「最后更新」，
      // 但不下载历史版本的文件内容，速度和浅克隆差不多
      execFileSync(
        'git',
        ['clone', '--filter=blob:none', '--branch', VAULT_BRANCH, VAULT_REPO, CACHE],
        { stdio: 'inherit' },
      );
    }
  } catch {
    throw new Error(
      `拉取笔记仓库失败：${VAULT_REPO} (${VAULT_BRANCH})。\n` +
        '检查一下 VAULT_REPO / VAULT_BRANCH 有没有填错，' +
        '仓库如果是私有的要用 https://x-access-token:<token>@github.com/... 的形式。',
    );
  }
  return CACHE;
}

/* ------------------------------------------------------------------ 扫描 */

function walk(dir, base = dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, base, acc);
    else acc.push(path.relative(base, abs).split(path.sep).join('/'));
  }
  return acc;
}

const isExcalidraw = (p) => p.endsWith('.excalidraw.md');
const isNote = (p) => p.endsWith('.md') && !isExcalidraw(p);
const isAsset = (p) => IMAGE_EXT.has(path.extname(p).toLowerCase());

/* ------------------------------------------------------------------ 取名 */

/**
 * 中文路径不能直接进 URL：fumadocs 会把 slug 存成百分号编码，
 * Next 的客户端路由匹配不上，页面会先渲染出来再被 404 顶掉。
 * 所以文件名一律转成拼音，中文只留在 frontmatter 的 title 和 meta.json 里。
 */
function toSlug(name) {
  const parts = pinyin(name, { toneType: 'none', type: 'array', nonZh: 'consecutive' });
  const slug = parts
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'page';
}

/** 同一层里 slug 撞了就加序号 */
function uniqueSlug(name, used) {
  const base = toSlug(name);
  let slug = base;
  let n = 2;
  while (used.has(slug)) slug = `${base}-${n++}`;
  used.add(slug);
  return slug;
}

/* ------------------------------------------------------------- 文本工具 */

const yamlString = (s) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

const unquote = (v) => v.replace(/^["']|["']$/g, '').trim();

function stripFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { data: {}, body: text };
  const data = {};
  let listKey = null;
  for (const line of m[1].split(/\r?\n/)) {
    // YAML 列表：紧跟在 "key:" 后面的 "  - 值"。tags 经常这么写
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (listKey && item) {
      data[listKey].push(unquote(item[1]));
      continue;
    }
    listKey = null;

    const kv = /^([A-Za-z_-]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const [, key, raw] = kv;

    if (raw.trim() === '') {
      listKey = key; // 值在下面几行的列表里
      data[key] = [];
    } else if (/^\[.*\]$/.test(raw.trim())) {
      data[key] = raw.trim().slice(1, -1).split(',').map(unquote).filter(Boolean); // tags: [a, b]
    } else {
      data[key] = unquote(raw);
    }
  }
  return { data, body: text.slice(m[0].length) };
}

/** tags 可以写成数组、逗号分隔、或者带 # 前缀，统一成干净的字符串数组 */
function readTags(data) {
  const raw = data.tags ?? data.tag ?? [];
  const list = Array.isArray(raw) ? raw : String(raw).split(/[,，\s]+/);
  return [...new Set(list.map((t) => String(t).replace(/^#/, '').trim()).filter(Boolean))];
}

/* ------------------------------------------------------- frontmatter 开关 */

/** frontmatter 里 display: none / hide / false 都算「不在目录里列出来」 */
const isHidden = (data) => ['none', 'hide', 'hidden', 'false'].includes(String(data.display ?? '').toLowerCase());

/** frontmatter 里 comments: false / no / off 就关掉这一篇的评论区 */
const commentsOff = (data) =>
  'comments' in data && ['false', 'no', 'off', '0'].includes(String(data.comments).toLowerCase());

const PBKDF2_ITERATIONS = 200_000;

/**
 * frontmatter 里写了 password 就把正文整段加密，构建产物里不留明文。
 * 前端拿到的是这一串 base64，输对口令才在浏览器里解出来渲染。
 *
 * 字节布局：salt(16) | iv(12) | 密文 | GCM tag(16)
 * —— WebCrypto 解密时要求 tag 跟在密文后面，所以这里直接拼一起。
 */
function encryptBody(text, password) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, 'sha256');
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return Buffer.concat([salt, iv, data, cipher.getAuthTag()]).toString('base64');
}

/**
 * 悬浮小窗里要渲染的正文。整篇太长了没必要，截一段就行 ——
 * 在段落边界切，免得把代码块或者 callout 拦腰砍断。
 */
function makePreviewBody(body, limit = 2400) {
  const text = body.trim();
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const boundary = cut.lastIndexOf('\n\n');
  return `${(boundary > limit / 3 ? cut.slice(0, boundary) : cut).trimEnd()}\n\n……`;
}

/**
 * 每篇的「最后更新」时间，从笔记仓库的 git 历史里读。
 *
 * 一次 git log 把所有文件的提交时间都拿到（一个文件一个进程太慢了），
 * 输出是「时间戳 + 该次提交改动的文件列表」交替出现，第一次见到某个文件
 * 就是它最近一次被改的时间。
 *
 * 仓库不是 git、或者是浅克隆没有历史，就返回空对象，页面上不显示。
 */
function readLastModified(dir, notePaths) {
  const wanted = new Set(notePaths);
  const out = {};
  let log;

  try {
    log = execFileSync('git', ['-C', dir, 'log', '--pretty=format:%cI', '--name-only', '-z'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    console.warn('[sync] 读不到 git 历史，页面上不显示「最后更新」');
    return out;
  }

  let current = null;
  for (const chunk of log.split('\0')) {
    const line = chunk.trim();
    if (!line) continue;
    // 时间戳那一行后面可能还粘着上一批文件名，用换行再切一次
    const parts = line.split('\n');
    for (const part of parts) {
      const value = part.trim();
      if (!value) continue;
      if (/^\d{4}-\d{2}-\d{2}T/.test(value)) current = value;
      else if (current && wanted.has(value) && !out[value]) out[value] = current;
    }
  }
  return out;
}

/** 用正文第一段做简介 */
function makeDescription(body) {
  for (const block of body.split(/\r?\n\s*\r?\n/)) {
    const line = block
      .trim()
      .replace(/<[^>]+>/g, '') // 裸 HTML 标签
      .replace(/%%[\s\S]*?%%/g, '') // Obsidian 的注释
      .replace(/^\s*>\s?/gm, '') // 引用 / callout 的 > 前缀
      .replace(/^\[![\w-]+\][+-]?\s*/gm, '') // callout 的 [!tip] 标记
      .replace(/^[#\-*\s]+/, '')
      .replace(/!?\[\[.*?\]\]/g, '')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[`*_$=]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (line.length > 8) return line.length > 100 ? `${line.slice(0, 100)}…` : line;
  }
  return undefined;
}

/* -------------------------------------------------------------- 主流程 */

const vault = resolveVault();
const files = walk(vault);
const notes = files.filter(isNote).sort();
const assets = files.filter(isAsset);

// 目录和文件都按层级算 slug，同层去重
const dirSlugs = new Map([['', '']]); // 原始目录 → slug 目录
const usedInDir = new Map([['', new Set(['index'])]]); // index 是首页占用的

function slugDir(dir) {
  if (dirSlugs.has(dir)) return dirSlugs.get(dir);
  const parent = path.dirname(dir) === '.' ? '' : path.dirname(dir);
  const parentSlug = slugDir(parent);
  if (!usedInDir.has(parentSlug)) usedInDir.set(parentSlug, new Set());
  const slug = uniqueSlug(path.basename(dir), usedInDir.get(parentSlug));
  const full = parentSlug ? `${parentSlug}/${slug}` : slug;
  dirSlugs.set(dir, full);
  usedInDir.set(full, new Set());
  return full;
}

/** 原始笔记路径 → 站点里的路径（不含扩展名） */
const noteSlugPath = new Map();
for (const notePath of notes) {
  const dir = path.dirname(notePath) === '.' ? '' : path.dirname(notePath);
  const dirSlug = slugDir(dir);
  if (!usedInDir.has(dirSlug)) usedInDir.set(dirSlug, new Set());
  const slug = uniqueSlug(path.basename(notePath, '.md'), usedInDir.get(dirSlug));
  noteSlugPath.set(notePath, dirSlug ? `${dirSlug}/${slug}` : slug);
}

// Obsidian 的 wiki 链接可以只写文件名，所以按 basename 也建一份索引
const noteByName = new Map();
for (const p of notes) {
  const name = path.basename(p, '.md');
  if (!noteByName.has(name)) noteByName.set(name, p);
}
const assetByPath = new Map(assets.map((p) => [p, p]));
const assetByName = new Map();
for (const p of assets) {
  const name = path.basename(p);
  if (!assetByName.has(name)) assetByName.set(name, p);
}

const docUrl = (notePath) => `/docs/${noteSlugPath.get(notePath)}`;

/**
 * [[笔记#小节]] 里的锚点要和页面上标题的 id 对得上。
 * fumadocs 用 github-slugger 生成标题 id（去标点、空格转连字符），
 * 以前这里直接 encodeURIComponent，带标点的标题就跳不过去。
 */
const headingAnchor = (text) => new GithubSlugger().slug(text.trim());
// 图片名里的空格等字符也编码一下，避免 markdown 链接被截断
const assetUrl = (assetPath) => `/vault/${assetPath.split('/').map(encodeURIComponent).join('/')}`;

function resolveNote(target) {
  const clean = target.replace(/^\.\//, '');
  if (noteSlugPath.has(clean)) return clean;
  if (noteSlugPath.has(`${clean}.md`)) return `${clean}.md`;
  return noteByName.get(path.basename(clean, '.md')) ?? null;
}

function resolveAsset(target) {
  const clean = target.replace(/^\.\//, '');
  return assetByPath.get(clean) ?? assetByName.get(path.basename(clean)) ?? null;
}

/* ------------------------------------------------------------ 笔记嵌入 */

/** 原始笔记路径 → 去掉 frontmatter 的正文，嵌入的时候要取 */
const noteBodies = new Map();

/** 从一篇笔记里截出某个小节：从匹配的标题开始，到下一个同级或更高级标题为止 */
function sliceSection(body, heading) {
  const lines = body.split(/\r?\n/);
  const wanted = headingAnchor(heading);
  let start = -1;
  let level = 0;

  for (let i = 0; i < lines.length; i++) {
    const m = /^(#{1,6})\s+(.*)$/.exec(lines[i]);
    if (!m) continue;
    if (start === -1) {
      if (headingAnchor(m[2]) === wanted) {
        start = i;
        level = m[1].length;
      }
      continue;
    }
    if (m[1].length <= level) return lines.slice(start, i).join('\n');
  }
  return start === -1 ? null : lines.slice(start).join('\n');
}

/**
 * ![[笔记]] / ![[笔记#小节]] —— Obsidian 的「嵌入」，把整篇（或某一节）原地展开。
 *
 * 产出的是一段裸 HTML 包着 markdown：`<div>` 后面空一行，CommonMark 就会把里面
 * 当普通 markdown 解析，再靠 rehype-raw 把外层 div 还原成元素（样式在 global.css）。
 *
 * depth 限制递归层数，顺便防止两篇互相嵌入把脚本转死。
 */
function expandEmbeds(body, notePath, outgoing, depth = 0) {
  if (depth >= 2) return body;

  return body.replace(/^[ \t]*!\[\[([^\]\n]+)\]\][ \t]*$/gm, (raw, inner) => {
    const [linkPart, alias] = inner.split('|').map((s) => s.trim());
    const [target, hash] = linkPart.split('#');

    if (resolveAsset(target)) return raw; // 图片交给下面的 rewriteLinks
    const note = resolveNote(target);
    if (!note || note === notePath) return raw;

    const source = noteBodies.get(note);
    if (source === undefined) return raw;

    const section = hash ? sliceSection(source, hash) : source;
    if (section === null) {
      console.warn(`[sync] ${notePath}: 嵌入的 [[${inner}]] 里找不到小节「${hash}」`);
      return raw;
    }

    outgoing.add(note);
    const title = alias ?? (hash ? `${path.basename(note, '.md')} › ${hash}` : path.basename(note, '.md'));
    const inner_ = expandEmbeds(section.trim(), note, outgoing, depth + 1);

    return [
      `<div class="note-embed">`,
      '',
      `<a class="note-embed-title" href="${docUrl(note)}${hash ? `#${headingAnchor(hash)}` : ''}">${title}</a>`,
      '',
      inner_,
      '',
      '</div>',
    ].join('\n');
  });
}

/**
 * ![[x]] / [[x|别名]] / ![](images/x.png) → 站点里能用的链接
 * 顺便把指向别的笔记的链接收进 outgoing，用来画知识图谱和反向链接
 */
function rewriteLinks(body, notePath, outgoing) {
  let out = body.replace(/(!?)\[\[([^\]\n]+)\]\]/g, (raw, bang, inner) => {
    const [linkPart, alias] = inner.split('|').map((s) => s.trim());
    const [target, hash] = linkPart.split('#');
    const label = alias ?? linkPart;

    const asset = resolveAsset(target);
    if (asset) return `![${alias ?? ''}](${assetUrl(asset)})`;

    const note = resolveNote(target);
    if (note) {
      if (note !== notePath) outgoing.add(note);
      const anchor = hash ? `#${headingAnchor(hash)}` : '';
      return `[${label}](${docUrl(note)}${anchor})`;
    }

    console.warn(`[sync] ${notePath}: 未解析的链接 [[${inner}]]`);
    return label; // 找不到就退化成纯文本，避免死链
  });

  // 普通 markdown 链接：图片换成站点路径，指向 .md 的换成页面路径。
  // 括号里整段取，这样 ![](Pasted image 2026.png) 这种带空格的路径也认
  out = out.replace(/(!?)\[([^\]]*)\]\(([^)]+)\)/g, (raw, bang, text, target) => {
    // 尾巴上可能挂着 markdown 的 title： [x](y "标题")
    const withTitle = /^(.*?)\s+("[^"]*"|'[^']*')$/.exec(target.trim());
    const title = withTitle ? ` ${withTitle[2]}` : '';
    const href = (withTitle ? withTitle[1] : target).trim().replace(/^<|>$/g, '');

    if (/^(https?:|\/|#|data:|mailto:)/.test(href)) return raw;

    let decoded = href;
    try {
      decoded = decodeURIComponent(href);
    } catch {
      // 路径里有落单的 % 之类，解不开就按原样当路径用
    }

    const asset = resolveAsset(decoded);
    if (asset) return `![${text}](${assetUrl(asset)}${title})`;

    if (bang) {
      // 图片没找到就地降级成 alt 文本。
      // 千万不能原样留着：remarkImage 会把相对路径编译成真正的 import，
      // 文件不存在的话整个构建直接失败（Module not found）。
      console.warn(`[sync] ${notePath}: 找不到图片 ${href}，已降级成文字`);
      return text;
    }

    const [targetPath, hash] = decoded.split('#');
    const note = targetPath ? resolveNote(targetPath) : null;
    if (note) {
      if (note !== notePath) outgoing.add(note);
      const anchor = hash ? `#${headingAnchor(hash)}` : '';
      return `[${text}](${docUrl(note)}${anchor})`;
    }
    return raw;
  });

  return out;
}

fs.rmSync(OUT_DOCS, { recursive: true, force: true });
fs.rmSync(OUT_ASSETS, { recursive: true, force: true });
fs.rmSync(OUT_PREVIEW_DOCS, { recursive: true, force: true });
fs.mkdirSync(OUT_DOCS, { recursive: true });

const written = [];
const vaultMap = {}; // 站点页面路径 → 笔记仓库里的原始路径

// 先把所有笔记读一遍：![[笔记]] 嵌入要拿到别篇的正文，没法边读边处理
const parsed = new Map();
for (const notePath of notes) {
  const { data, body } = stripFrontmatter(fs.readFileSync(path.join(vault, notePath), 'utf8'));
  parsed.set(notePath, data);
  // 上了锁的不给别人嵌入，不然口令就白设了
  if (!String(data.password ?? '').trim()) noteBodies.set(notePath, body);
}

const lastModified = readLastModified(vault, notes);

for (const notePath of notes) {
  const data = parsed.get(notePath);

  // 标题就用文件名 —— Obsidian 里文件名本来就是标题。
  // 正文一律原样保留，不去猜哪个 # 是"整篇的标题"。
  let body = stripFrontmatter(fs.readFileSync(path.join(vault, notePath), 'utf8')).body;
  const title = data.title ?? path.basename(notePath, '.md');

  const hidden = isHidden(data);
  const password = String(data.password ?? '').trim();
  const tags = readTags(data);

  // 简介要在展开嵌入之前算，不然会把嵌进来的别篇内容当成自己的开头
  const description = data.description ?? (password ? undefined : makeDescription(body));

  const outgoing = new Set();
  body = expandEmbeds(body, notePath, outgoing); // 先展开嵌入，再统一改链接
  body = rewriteLinks(body, notePath, outgoing);

  const encrypted = password ? encryptBody(body.trimStart(), password) : undefined;
  const rewritten = body;
  if (password) {
    console.log(`[sync] ${notePath} 已加密（口令保护）`);
    body = ''; // 产物里不留明文
  }

  const frontmatter = [
    '---',
    `title: ${yamlString(title)}`,
    ...(description ? [`description: ${yamlString(description)}`] : []),
    ...(hidden ? ['display: none'] : []),
    ...(commentsOff(data) ? ['comments: false'] : []),
    ...(encrypted ? [`encrypted: ${yamlString(encrypted)}`] : []),
    ...(tags.length ? [`tags: [${tags.map(yamlString).join(', ')}]`] : []),
    ...(lastModified[notePath] ? [`lastModified: ${yamlString(lastModified[notePath])}`] : []),
    '---',
    '',
  ].join('\n');

  const slugPath = noteSlugPath.get(notePath);
  const dest = path.join(OUT_DOCS, `${slugPath}.md`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, frontmatter + body.trimStart());
  vaultMap[`${slugPath}.md`] = notePath;
  written.push({
    notePath,
    slugPath,
    title,
    hidden,
    tags,
    locked: Boolean(password),
    previewBody: password ? '' : makePreviewBody(rewritten),
    outgoing: [...outgoing],
  });
}

/** display: none 的笔记：不进侧栏、不进首页索引、不进图谱、不进搜索。链接照样能打开 */
const listed = written.filter((item) => !item.hidden);

// 图片
for (const asset of assets) {
  const dest = path.join(OUT_ASSETS, asset);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(vault, asset), dest);
}

/* ------------------------------------------- 目录名 + 首页 + 侧栏排序 */

// 每层目录里被藏起来的页面，用 meta.json 的 "!名字" 语法从侧栏里剔掉
const hiddenByDir = new Map();
for (const item of written) {
  if (!item.hidden) continue;
  const slugDirOf = path.dirname(item.slugPath) === '.' ? '' : path.dirname(item.slugPath);
  if (!hiddenByDir.has(slugDirOf)) hiddenByDir.set(slugDirOf, []);
  hiddenByDir.get(slugDirOf).push(`!${path.basename(item.slugPath)}`);
}

// 目录名是拼音，侧栏要显示中文，靠每层的 meta.json
for (const [dir, dirSlug] of dirSlugs) {
  if (!dir) continue;
  const excluded = hiddenByDir.get(dirSlug);
  fs.writeFileSync(
    path.join(OUT_DOCS, dirSlug, 'meta.json'),
    `${JSON.stringify(
      {
        title: path.basename(dir),
        // "..." 代表"其余的按默认顺序排"，前面的 "!x" 会先把 x 排除掉
        ...(excluded ? { pages: [...excluded, '...'] } : {}),
      },
      null,
      2,
    )}\n`,
  );
}

const byFolder = new Map();
for (const item of listed) {
  const folder = path.dirname(item.notePath) === '.' ? '' : path.dirname(item.notePath);
  if (!byFolder.has(folder)) byFolder.set(folder, []);
  byFolder.get(folder).push(item);
}

const sections = [...byFolder.entries()].sort(([a], [b]) => a.localeCompare(b, 'zh'));
const indexBody = sections
  .map(([folder, items]) => {
    const heading = folder === '' ? '## 散记' : `## ${folder}`;
    const list = items
      .sort((a, b) => a.title.localeCompare(b.title, 'zh'))
      .map((i) => `- [${i.title}](/docs/${i.slugPath})`)
      .join('\n');
    return `${heading}\n\n${list}`;
  })
  .join('\n\n');

fs.writeFileSync(
  path.join(OUT_DOCS, 'index.mdx'),
  `---
title: 全部笔记
description: 由 Obsidian 仓库自动生成，共 ${listed.length} 篇
---

${indexBody}
`,
);

// 让首页永远排在最前面
fs.writeFileSync(
  path.join(OUT_DOCS, 'meta.json'),
  `${JSON.stringify({ pages: ['index', ...(hiddenByDir.get('') ?? []), '...'] }, null, 2)}\n`,
);

fs.writeFileSync(OUT_MAP, `${JSON.stringify(vaultMap, null, 2)}\n`);
// 仓库信息也落一份，前端不用再读环境变量
fs.writeFileSync(OUT_SITE, `${JSON.stringify({ repo: repoInfo }, null, 2)}
`);

/* ------------------------------------------------- 双链图谱 + 反向链接 */

const nodes = listed.map((item) => {
  const folder = path.dirname(item.notePath) === '.' ? '' : path.dirname(item.notePath);
  return {
    id: item.slugPath,
    title: item.title,
    url: `/docs/${item.slugPath}`,
    folder, // 用中文目录名分组配色
  };
});

const visibleSlugs = new Set(listed.map((item) => item.slugPath));
const links = [];
const seenLink = new Set();
for (const item of listed) {
  for (const target of item.outgoing) {
    const targetSlug = noteSlugPath.get(target);
    // 指向隐藏页面的连线也不画，否则藏起来的标题会从图谱里漏出去
    if (!targetSlug || !visibleSlugs.has(targetSlug)) continue;
    const key = `${item.slugPath}→${targetSlug}`;
    if (seenLink.has(key)) continue;
    seenLink.add(key);
    links.push({ source: item.slugPath, target: targetSlug });
  }
}

// 反向链接：谁指向了我
const backlinks = {};
for (const { source, target } of links) {
  (backlinks[target] ??= []).push(source);
}

fs.writeFileSync(
  OUT_GRAPH,
  `${JSON.stringify({ nodes, links, backlinks }, null, 2)}\n`,
);

/* ------------------------------------------------------------- 标签 */

// tag → 这个标签下的笔记，/tags 和 /tags/xxx 两个页面用
const byTag = new Map();
for (const item of listed) {
  for (const tag of item.tags) {
    if (!byTag.has(tag)) byTag.set(tag, []);
    byTag.get(tag).push({ title: item.title, url: `/docs/${item.slugPath}` });
  }
}

fs.writeFileSync(
  OUT_TAGS,
  `${JSON.stringify(
    Object.fromEntries(
      [...byTag.entries()]
        .sort(([a], [b]) => a.localeCompare(b, 'zh'))
        .map(([tag, items]) => [tag, items.sort((a, b) => a.title.localeCompare(b.title, 'zh'))]),
    ),
    null,
    2,
  )}\n`,
);

const hiddenCount = written.length - listed.length;
/* --------------------------------------------------- 双链的悬浮预览 */

// 索引只放标题和有没有上锁，够小，可以直接打进前端包
fs.writeFileSync(
  OUT_PREVIEWS,
  `${JSON.stringify(
    Object.fromEntries(
      written.map((item) => [
        `/docs/${item.slugPath}`,
        { title: item.title, locked: item.locked },
      ]),
    ),
    null,
    2,
  )}
`,
);

// 正文单独放静态文件，鼠标真的浮上去了才去取，不占首屏
for (const item of written) {
  if (item.locked) continue; // 上了锁的当然不给预览
  const dest = path.join(OUT_PREVIEW_DOCS, `${item.slugPath}.md`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, item.previewBody);
}

console.log(
  `[sync] 完成：${written.length} 篇笔记${hiddenCount ? `（其中 ${hiddenCount} 篇不列出来）` : ''}，` +
    `${assets.length} 张图片，${links.length} 条双链`,
);
