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
 *   public/vault/**      —— 笔记里引用到的图片
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createCipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';
import { pinyin } from 'pinyin-pro';

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
const OUT_ASSETS = path.join(ROOT, 'public/vault');
const CACHE = path.join(ROOT, '.vault-cache');

// Vercel 上没填值的环境变量会以空字符串注入，所以空白一律当没设过处理
const env = (name, fallback = '') => {
  const value = process.env[name]?.trim();
  return value ? value : fallback;
};

const VAULT_REPO = env('VAULT_REPO', 'https://github.com/zongxi1115/obsidian-computer');
const VAULT_BRANCH = env('VAULT_BRANCH', 'main');

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.avif']);
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
      execFileSync('git', ['-C', CACHE, 'fetch', '--depth', '1', 'origin', VAULT_BRANCH], {
        stdio: 'inherit',
      });
      execFileSync('git', ['-C', CACHE, 'reset', '--hard', `origin/${VAULT_BRANCH}`], {
        stdio: 'inherit',
      });
    } else {
      fs.rmSync(CACHE, { recursive: true, force: true });
      execFileSync('git', ['clone', '--depth', '1', '--branch', VAULT_BRANCH, VAULT_REPO, CACHE], {
        stdio: 'inherit',
      });
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

function stripFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { data: {}, body: text };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_-]+):\s*(.*)$/.exec(line);
    if (kv) data[kv[1]] = kv[2].replace(/^["']|["']$/g, '').trim();
  }
  return { data, body: text.slice(m[0].length) };
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

/** 用正文第一段做简介 */
function makeDescription(body) {
  for (const block of body.split(/\r?\n\s*\r?\n/)) {
    const line = block
      .trim()
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
      const anchor = hash ? `#${encodeURIComponent(hash.trim())}` : '';
      return `[${label}](${docUrl(note)}${anchor})`;
    }

    console.warn(`[sync] ${notePath}: 未解析的链接 [[${inner}]]`);
    return label; // 找不到就退化成纯文本，避免死链
  });

  // 普通 markdown 链接：图片换成站点路径，指向 .md 的换成页面路径
  out = out.replace(/(!?)\[([^\]]*)\]\(([^)\s]+)\)/g, (raw, bang, text, href) => {
    if (/^(https?:|\/|#|data:|mailto:)/.test(href)) return raw;
    const decoded = decodeURIComponent(href);

    const asset = resolveAsset(decoded);
    if (asset) return `![${text}](${assetUrl(asset)})`;
    if (bang) return raw;

    const [targetPath, hash] = decoded.split('#');
    const note = targetPath ? resolveNote(targetPath) : null;
    if (note) {
      if (note !== notePath) outgoing.add(note);
      const anchor = hash ? `#${encodeURIComponent(hash)}` : '';
      return `[${text}](${docUrl(note)}${anchor})`;
    }
    return raw;
  });

  return out;
}

fs.rmSync(OUT_DOCS, { recursive: true, force: true });
fs.rmSync(OUT_ASSETS, { recursive: true, force: true });
fs.mkdirSync(OUT_DOCS, { recursive: true });

const written = [];
const vaultMap = {}; // 站点页面路径 → 笔记仓库里的原始路径

for (const notePath of notes) {
  const raw = fs.readFileSync(path.join(vault, notePath), 'utf8');
  const { data, body: rawBody } = stripFrontmatter(raw);

  // 标题就用文件名 —— Obsidian 里文件名本来就是标题。
  // 正文一律原样保留，不去猜哪个 # 是"整篇的标题"。
  let body = rawBody;
  const title = data.title ?? path.basename(notePath, '.md');

  const hidden = isHidden(data);
  const password = String(data.password ?? '').trim();

  const outgoing = new Set();
  body = rewriteLinks(body, notePath, outgoing);

  // 加密的那篇，简介也不能自动生成 —— 那等于把开头一段明文抄到侧栏和搜索结果里
  const description = data.description ?? (password ? undefined : makeDescription(body));
  const encrypted = password ? encryptBody(body.trimStart(), password) : undefined;
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
    '---',
    '',
  ].join('\n');

  const slugPath = noteSlugPath.get(notePath);
  const dest = path.join(OUT_DOCS, `${slugPath}.md`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, frontmatter + body.trimStart());
  vaultMap[`${slugPath}.md`] = notePath;
  written.push({ notePath, slugPath, title, hidden, outgoing: [...outgoing] });
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

const hiddenCount = written.length - listed.length;
console.log(
  `[sync] 完成：${written.length} 篇笔记${hiddenCount ? `（其中 ${hiddenCount} 篇不列出来）` : ''}，` +
    `${assets.length} 张图片，${links.length} 条双链`,
);
