# obsidian-site

把一个装着 Markdown 的 GitHub 仓库渲染成公网可访问的笔记站，用
[fumadocs](https://fumadocs.dev) + Next.js。功能对标 Obsidian Publish：双链、关系图谱、
反向链接、悬浮预览、笔记嵌入、标签、全文搜索、AI 问答、评论区、口令保护。

**笔记和站点代码分开放。** 这个仓库不放任何笔记，构建的时候把笔记仓库克隆下来转换成
fumadocs 的内容目录。笔记仓库里也就不会多出 `node_modules` 这种东西污染 Obsidian 的索引。

```
笔记仓库 (markdown)  ──clone──▶  sync-vault.mjs  ──▶  content/ + public/  ──▶  Next.js 构建
```

---

## 目录

- [快速开始](#快速开始)
- [环境变量](#环境变量)
- [笔记怎么被转换](#笔记怎么被转换)
- [frontmatter 开关](#frontmatter-开关)
- [站点功能](#站点功能)
- [部署](#部署)
- [换成别的仓库](#换成别的仓库)
- [设计取舍](#设计取舍)

---

## 快速开始

```bash
cp .env.example .env.local   # 至少把 VAULT_DIR 改成你本机的笔记目录
pnpm install
pnpm dev
```

`pnpm dev` 和 `pnpm build` 都会先跑一遍 `scripts/sync-vault.mjs`：

- 设了 `VAULT_DIR` 且目录存在 → 直接读本机目录，改完笔记刷新就能看到
- 否则 → 克隆 `VAULT_REPO`（Vercel 上走的是这条）

---

## 环境变量

一份完整清单。**只有内容来源是必填的**，其余全部可选，不填就是功能关闭或走默认值。
本地写在 `.env.local`，线上填在 Vercel 的 Environment Variables。

### 内容来源

| 变量 | 必填 | 说明 |
| --- | :---: | --- |
| `VAULT_DIR` | | 本机笔记目录的绝对路径。**只给本地开发用**，设了就不去克隆远端。线上不要设 |
| `VAULT_REPO` | ✅ | 笔记仓库地址。私有仓库写成 `https://x-access-token:<token>@github.com/owner/repo` |
| `VAULT_BRANCH` | | 分支名，默认 `main` |

> `VAULT_REPO` 不填会退回内置的示例仓库并打一条警告 —— 别依赖这个行为。

### 站点信息

| 变量 | 不填时 | 说明 |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_NAME` | 仓库名 | 导航栏标题、页面 title 后缀 |
| `NEXT_PUBLIC_SITE_AUTHOR` | 仓库 owner | SEO 署名、AI 回复的名字 |
| `NEXT_PUBLIC_SITE_AUTHOR_URL` | `https://<host>/<owner>` | 署名链接到哪 |
| `NEXT_PUBLIC_SITE_URL` | Vercel 给的域名 | 用了自定义域名就填，影响 canonical / sitemap / OG 图的绝对地址 |

### AI 问答

不填 `AI_API_KEY` 就**整个不显示「问问 AI」按钮**，API 也直接返回 503。

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `AI_BASE_URL` | `https://openrouter.ai/api/v1` | 任何 OpenAI 兼容端点：OpenRouter / 官方 / 中转站 / 自建 |
| `AI_API_KEY` | 空 | 密钥。换服务商只改这三个变量，代码不用动 |
| `AI_MODEL` | `anthropic/claude-haiku-4.5` | 必须是该端点认识的模型 ID |

### 评论区

四个**全部填齐**才显示评论区，缺一个就整个不显示。取值方式见[部署 › 评论区](#评论区)。
这几个是公开值不是密钥，所以必须带 `NEXT_PUBLIC_` 前缀（要在浏览器里用）。

| 变量 | 说明 |
| --- | --- |
| `NEXT_PUBLIC_GISCUS_REPO` | `owner/repo`，必须是**公开**仓库且开了 Discussions |
| `NEXT_PUBLIC_GISCUS_REPO_ID` | giscus.app 生成的仓库 ID |
| `NEXT_PUBLIC_GISCUS_CATEGORY` | Discussion 分类名，一般是 `Announcements` |
| `NEXT_PUBLIC_GISCUS_CATEGORY_ID` | giscus.app 生成的分类 ID |

---

## 笔记怎么被转换

`scripts/sync-vault.mjs` 读笔记仓库，产出这些（都在 `.gitignore` 里，不提交）：

| 产物 | 内容 |
| --- | --- |
| `content/docs/**` | 补好 frontmatter、转换过链接的 markdown，文件名是拼音 |
| `content/vault-map.json` | 页面路径 → 笔记仓库原路径，「编辑此页」靠它 |
| `content/graph.json` | 图谱的节点 / 连线 / 反向链接 |
| `content/previews.json` | 每篇的标题和是否上锁，悬浮预览的索引 |
| `content/tags.json` | 标签 → 笔记 |
| `content/site.json` | 从 `VAULT_REPO` 解析出的仓库信息 |
| `public/previews/**` | 悬浮预览要渲染的正文（截断过），悬浮时才去取 |
| `public/vault/**` | 笔记里引用到的图片 |

### 支持的语法

| 笔记里写 | 站点上的效果 |
| --- | --- |
| `[[某篇笔记]]`、`[[笔记#小节\|别名]]` | 指向对应页面的链接，只写文件名也能解析；解析不到退化成纯文本 |
| `![[某篇笔记]]`、`![[笔记#小节]]` | **原地展开**那篇笔记（或那一节），带标题链接和左侧竖线 |
| `![[images/xx.png]]` | 图片，自动复制到 `public/vault/` |
| `> [!tip] 标题` | Callout，13 种类型，配色和图标照 Obsidian；`[!tip]-` 折叠、`[!tip]+` 默认展开 |
| ` ```mermaid ` | 流程图，跟着深浅色主题走 |
| `$x^2$`、`$$...$$` | KaTeX 公式 |
| `==高亮==`、`%%注释%%` | `<mark>` / 直接删掉 |
| 表格、任务列表、删除线、脚注 | GFM 全套 |
| `<iframe>`、`<details>`、`<kbd>` | 裸 HTML 原样渲染，`<iframe>` 自动套 16:9 圆角框 |
| `*.excalidraw.md`、`Excalidraw/`、`.obsidian/` | 跳过 |

图片点击放大预览；`[[]]` 悬浮出小窗看内容。

---

## frontmatter 开关

Obsidian 里不影响阅读，站点上会生效：

```yaml
---
tags: [算法, 笔记]   # 或者 YAML 列表写法
display: none        # 不列出来
password: 我的口令    # 上锁
comments: false      # 关掉这一篇的评论
title: 自定义标题     # 不写就用文件名
description: 自定义简介 # 不写就取正文第一段
---
```

### `tags`

三种写法都认：`tags: [a, b]`、`tags: a, b`、以及多行的 `- a` 列表。`#` 前缀会自动去掉。

标签显示在标题下面，点进去是 `/tags/<拼音>`；`/tags` 是全部标签的索引。
**只认 frontmatter 里的标签**，正文里的行内 `#标签` 不解析（会和代码里的 `#include` 之类冲突）。

### `display: none`

侧栏、首页索引、关系图谱、站内搜索、AI 检索、sitemap 里都不出现，页面本身还带 `robots: noindex`。
**但链接照样能打开** —— 是「不公开列出」的意思，不是保险箱。要真藏内容用 `password`。

（`hide` / `hidden` / `false` 同义。）

### `password`

正文在**构建时**就用 AES-256-GCM 加密了（口令过 PBKDF2-SHA256 20 万轮），产物里只有密文：

- 页面 HTML、`content/`、`llms.txt`、站内搜索、AI 检索里都拿不到正文
- 简介不再自动生成（否则等于把开头一段抄到侧栏上）
- 这一篇不显示评论区，也不能被别的笔记 `![[]]` 嵌入
- 打开页面是输口令的卡片，输对了在**浏览器里**解密渲染（公式、代码高亮、callout 都在）
- 同一个标签页内解锁过就记住，关掉标签页就忘

标题和文件名仍是明文（侧栏要显示），想连标题都藏就再加 `display: none`。

> **这个加密防的是站点读者，不是能翻你笔记仓库的人。** 口令写在笔记的 frontmatter 里，
> 笔记仓库公开的话口令也就公开了。要防后者得把笔记仓库设为私有。

---

## 站点功能

### 双链和关系图谱

同步时顺手把笔记之间的 `[[]]` 指向收集进 `content/graph.json`，三处用到：

- **右侧栏小窗** —— 每篇「On this page」上面，样式照 Obsidian 的关系图谱。只画局部（同目录 +
  直连），当前笔记的气泡放大并用主题色高亮。右上角两个按钮分别是「放大这一块」和「放大整张图」
- **`/graph` 整页图谱** —— 带「按目录连线」开关和重置视角
- **页面底部反向链接** —— 哪些笔记指到了这一篇

**实心圆是笔记**（连线越多越大），**空心圈是目录节点**，目录之间按父子关系连成树。
因为笔记之间的 `[[]]` 还不多，默认把同目录的笔记挂到目录节点上先连起来；
双链多起来之后（连线数 ≥ 笔记数的一半）会自动关掉目录连线。

指向图片的 `[[]]` 不算双链，指向笔记的普通 markdown 链接（`[文字](./笔记.md)`）算。

### 悬浮预览

鼠标停在指向笔记的链接上 280ms，弹出渲染好的正文（标题、列表、callout、公式、代码高亮都在），
可以滚动，右上角能直接跳过去。正文是构建期生成的静态文件，悬浮时才 fetch，不占首屏。
触屏不弹（没有 hover，弹出来只挡内容）。

### AI 问答

右下角「问问 AI」，后端在 [app/api/chat/route.ts](app/api/chat/route.ts)：用 flexsearch 把笔记建成索引，
以 tool 形式交给模型，模型先检索再回答，并用站内链接给出处。系统提示词限定了"先检索再回答、
不要编造、默认中文"。

### 搜索

`Ctrl/Cmd + K`。`display: none` 和上了锁的笔记不进索引。

### SEO

每页带 `author` / `canonical` / `og:article` / `twitter:card` 和 JSON-LD 结构化数据
（`BlogPosting` + `Person`），另有 `/sitemap.xml` 和 `/robots.txt`。

---

## 部署

### 1. 站点本身

1. 把这个目录推到一个 GitHub 仓库。
2. Vercel → Add New Project → 选它。框架自动识别 Next.js，构建命令保持默认的 `pnpm build`
   （已包含同步步骤），不用改 Root Directory。
3. 填[环境变量](#环境变量)，至少 `VAULT_REPO`。
4. 之后**改站点代码** push，Vercel 自己会重新构建。

### 2. 让「笔记推送」也触发构建

站点和笔记是两个仓库，笔记 push 时要主动通知 Vercel：

1. Vercel 项目 → Settings → Git → Deploy Hooks，建一个（分支填 `main`），复制 URL。
2. 笔记仓库 → Settings → Secrets and variables → Actions → New repository secret，
   名字 `VERCEL_DEPLOY_HOOK`，值就是那条 URL。
3. 把 [vault-workflow/deploy-site.yml](vault-workflow/deploy-site.yml) 放进笔记仓库的
   `.github/workflows/deploy-site.yml`。

**不是每次 push 都重建，提交信息里带 `publish` 才会**：

```bash
git commit -m "整理计算机网络的笔记"            # 只存档，站点不动
git commit -m "整理计算机网络的笔记 (publish)"   # 触发重建
```

一次 push 里任意一条 commit 带上就算数。只认 `publish` 这个词、不管括号形状，
`(publish)`、`（publish）`、`[publish]` 都行（中文输入法容易打成全角），大小写也不敏感。
改 `.obsidian/` 和 `.github/` 本身不会触发。

用 obsidian-git 自动 push 的话，把它的 commit message 模板改成带 `publish`。

> **空提交不管用。** `paths-ignore` 是按改动的文件判断的，`--allow-empty` 的提交一个文件都没动，
> 工作流根本不会启动（不是 skipped，是压根没有这次运行）。想不改笔记直接重建用手动触发：
>
> ```bash
> gh workflow run deploy-site.yml --repo <你的笔记仓库>
> ```

### 评论区

用 [giscus](https://giscus.app)，评论存在 GitHub Discussions 里，读者用 GitHub 账号登录就能评，
主题跟着站点深浅色走。

1. 找一个**公开**仓库当容器（笔记仓库就行），Settings → General → Features 勾上 **Discussions**。
2. 给它装上 [giscus app](https://github.com/apps/giscus)。
3. 打开 https://giscus.app ，填仓库名、分类选 `Announcements`、映射选 **pathname**，
   把生成的 `data-repo-id` 和 `data-category-id` 抄进[环境变量](#评论区)。

生成的索引页、上了锁的笔记、写了 `comments: false` 的笔记不显示评论。

---

## 换成别的仓库

站点代码里**没有写死任何跟某个仓库有关的东西**，指向另一个仓库只要改 `VAULT_REPO`：

```bash
VAULT_REPO=https://github.com/someone/their-notes
```

owner / repo 会从这个地址解析出来（`parseRepo`）写进 `content/site.json`，
「编辑此页」、导航栏 GitHub 图标、默认站名和作者都从那儿取。要覆盖就填
`NEXT_PUBLIC_SITE_NAME` 那几个。

### 对仓库的要求

**其实跟 Obsidian 没什么关系**，需要的只是「一个装着 markdown 的 GitHub 仓库」：

- 任意层级的 `.md`，目录结构直接变成侧栏分组
- 图片跟笔记放一起就行，路径会自动重写
- 公开仓库免密克隆；私有仓库把地址写成 `https://x-access-token:<token>@github.com/owner/repo`

Obsidian 特有的写法（`[[双链]]`、`![[嵌入]]`、`> [!tip]`、`==高亮==`、`%%注释%%`）**有就认、没有也不影响**；
`.obsidian/`、`*.excalidraw.md` 不存在也无所谓。

### 已知的水土不服

- **URL 是拼音**（见下一节）。英文文件名原样保留，但日文、韩文、西里尔字母会被 `pinyin-pro` 丢掉，
  退化成 `page`、`page-2`。非中文仓库要把 `toSlug` 换成 `slugify` 之类按 Unicode 转写的库。
- 侧栏几个文案（"笔记"、"关系图谱"、"标签"、"散记"）是写死的中文，在
  [lib/layout.shared.tsx](lib/layout.shared.tsx) 和 `scripts/sync-vault.mjs` 里，就几行。
- giscus 的仓库是单独配的，不一定要和笔记仓库是同一个。

---

## 设计取舍

### 为什么 URL 是拼音

`计算机网络/计算机体系结构.md` → `/docs/ji-suan-ji-wang-luo/ji-suan-ji-ti-xi-jie-gou`。

一开始直接用中文路径，结果是**页面闪一下就变成 404**：fumadocs 把中文文件名存成百分号编码的
slug，服务端渲染出来的 HTML 完全正常，但 Next 的客户端路由匹配不上这种编码段，hydration 之后
就把页面换成了 404。dev 和 production 都一样，应用层改不掉。

所以文件名转拼音，中文只留在三个地方：每篇的 `title`（页面标题、侧栏、搜索结果都用它）、
每层目录的 `meta.json`（侧栏分组名）、`content/vault-map.json`（还原「编辑此页」的链接）。

同层拼音撞车会自动加 `-2`、`-3` 后缀。**副作用是改笔记文件名会导致 URL 变化**，老链接失效。

### 为什么克隆不用 `--depth 1`

每篇的「最后更新」时间是从笔记仓库的 git 历史里读的，浅克隆只有一个提交，
所有文件的时间都会一样。所以改成 `--filter=blob:none`：保留完整历史，但不下载历史版本的
文件内容，速度和浅克隆差不多。

### 其他要注意的

- 笔记里的裸 HTML 是**直接渲染**的，没做过滤 —— 笔记只有你自己写，所以没拦。
  真要粘别人的 HTML 片段之前先看一眼里面有没有 `<script>`。
- 站点会把笔记全文公开，写之前想一想别把私密内容放进笔记仓库（或者用 `password`）。
- Excalidraw 画板目前跳过，要展示得额外做导出。
- 笔记数量涨到几百篇之后，`/graph` 整页图谱和运行时建搜索索引会先成为瓶颈，
  构建时间和 Vercel 额度反而是最后才需要担心的。
