# obsidian-site

把 Obsidian 仓库 [`zongxi1115/obsidian-computer`](https://github.com/zongxi1115/obsidian-computer)
渲染成公网可访问的文档站，用 [fumadocs](https://fumadocs.dev) + Next.js。

**笔记和站点代码分开放**：这个仓库不放任何笔记，笔记还是留在 Obsidian 仓库里。
构建的时候把笔记仓库浅克隆下来，转换成 fumadocs 的内容目录。

## 本地开发

```bash
cp .env.example .env.local   # 把 VAULT_DIR 改成你本机 Obsidian 目录
pnpm install
pnpm dev
```

`pnpm dev` / `pnpm build` 都会先跑一遍 `scripts/sync-vault.mjs`：

- 有 `VAULT_DIR` 且目录存在 → 直接读本机的 Obsidian 目录（改完笔记刷新就能看到）
- 没有 → 浅克隆 `VAULT_REPO`（Vercel 上走的是这条）

## 同步脚本做了什么

`scripts/sync-vault.mjs` → 产出 `content/docs/**` 和 `public/vault/**`（两个目录都不提交）：

| 笔记里的写法 | 站点上的结果 |
| --- | --- |
| 没有 frontmatter | 自动补 `title`（就用文件名）和 `description`（取第一段），正文原样保留 |
| `![[images/xx.png]]` | `![](/vault/images/xx.png)`，图片复制到 `public/vault/` |
| `[[某篇笔记]]`、`[[笔记#小节\|别名]]` | 指向对应页面的链接；只写文件名也能解析，解析不到就退化成纯文本 |
| `$x^2$`、`$$...$$` | KaTeX 公式（`source.config.ts` 里挂的 remark-math + rehype-katex） |
| `> [!tip] 标题` | Obsidian / GitHub 的 callout，颜色和图标照 Obsidian 那套；`[!tip]-` 折叠、`[!tip]+` 默认展开 |
| ` ```mermaid ` | 渲染成图（客户端画，跟着深浅色主题走） |
| `==高亮==`、`%%注释%%` | `<mark>` / 直接删掉 |
| 裸 HTML：`<iframe>`、`<details>`、`<kbd>` … | 原样渲染，`<iframe>` 会自动套个 16:9 的圆角框 |
| `*.excalidraw.md`、`Excalidraw/`、`.obsidian/` | 跳过 |
| 中文文件名 / 目录名 | 转成拼音当 URL，中文放进 `title` 和 `meta.json`（原因见下一节） |

frontmatter 里还认三个开关，见 [frontmatter 开关](#frontmatter-开关)。

## 换成别的仓库

站点代码里**没有写死任何跟某个仓库有关的东西**。指向另一个 GitHub 仓库只要改 `VAULT_REPO`：

```bash
VAULT_REPO=https://github.com/someone/their-notes
VAULT_BRANCH=main
```

owner / repo 会从这个地址解析出来（`scripts/sync-vault.mjs` 里的 `parseRepo`），写进
`content/site.json`，「在 GitHub 上编辑」的链接、导航栏的 GitHub 图标、默认站名和作者都从那儿取。
想覆盖默认值就填这几个（都可选）：

| 变量 | 不填时 |
| --- | --- |
| `NEXT_PUBLIC_SITE_NAME` | 仓库名 |
| `NEXT_PUBLIC_SITE_AUTHOR` | 仓库 owner |
| `NEXT_PUBLIC_SITE_AUTHOR_URL` | `https://<host>/<owner>` |
| `NEXT_PUBLIC_SITE_URL` | Vercel 给的域名 |

### 对仓库的要求

其实**跟 Obsidian 没什么关系** —— 需要的只是「一个装着 markdown 的 GitHub 仓库」：

- 任意层级的 `.md` 文件，目录结构直接变成侧栏分组
- 图片跟笔记放一起就行，路径会自动重写
- 公开仓库免密克隆；私有仓库把 `VAULT_REPO` 写成
  `https://x-access-token:<token>@github.com/owner/repo`

Obsidian 特有的写法（`[[双链]]`、`![[嵌入]]`、`> [!tip]`、`==高亮==`、`%%注释%%`）**有就认，没有也不影响**，
普通 markdown 仓库照样能跑。`.obsidian/`、`.trash/`、`*.excalidraw.md` 会跳过 —— 这些目录不存在也无所谓。

### 已知的水土不服

- **URL 是拼音**（见下一节）。英文文件名原样保留；但日文、韩文、西里尔字母会被
  `pinyin-pro` 丢掉，退化成 `page`、`page-2`……这种。非中文仓库要改 `toSlug`，
  换成 `slugify` 之类按 Unicode 转写的库。
- 侧栏文案（"笔记"、"关系图谱"、"全部笔记"、"散记"）是写死的中文，
  在 `lib/layout.shared.tsx` 和 `scripts/sync-vault.mjs` 里，不多，要改很快。
- 评论区的 giscus 仓库是单独配的，不一定要和笔记仓库是同一个。

## 为什么 URL 是拼音

`计算机网络/计算机体系结构.md` → `/docs/ji-suan-ji-wang-luo/ji-suan-ji-ti-xi-jie-gou`。

一开始是直接用中文路径的，结果是**页面闪一下就变成 404**：fumadocs 把中文文件名存成百分号编码的
slug（`%E8%AE%A1...`），服务端渲染出来的 HTML 完全正常，但 Next 客户端路由匹配不上这种编码段，
hydration 之后就把页面换成了 404。dev 和 production 都一样，应用层改不掉。

所以同步脚本把文件名转成拼音（`pinyin-pro`），中文只留在：

- 每篇的 frontmatter `title` —— 页面标题、侧栏条目、搜索结果都用它
- 每层目录的 `meta.json` `title` —— 侧栏的分组名
- `content/vault-map.json` —— 拼音路径 → 笔记仓库原路径，"编辑此页" 的 GitHub 链接靠它还原

同一层里拼音撞车（不同的字同音）会自动加 `-2`、`-3` 后缀。副作用是**改笔记文件名会导致 URL 变化**，
老链接会失效。

## frontmatter 开关

笔记的 frontmatter 里可以写这几个，Obsidian 里不影响阅读，站点上会生效：

```yaml
---
display: none        # 不列出来
password: 我的口令    # 上锁
comments: false      # 关掉这一篇的评论
---
```

### `display: none`

侧栏、首页索引、关系图谱、站内搜索、AI 检索里都不会出现这一篇，**但链接照样能打开**。
就是「不公开列出来，知道地址的人能看」的意思，不是保险箱 —— 要真藏内容用 `password`。

（`hide` / `hidden` / `false` 也认同一个意思。）

### `password: xxx`

正文在**构建的时候**就用 AES-256-GCM 加密了（口令过一遍 PBKDF2-SHA256，20 万轮），
构建产物里只有一串密文，明文一个字都不留：

- 页面 HTML、`content/` 目录、`llms.txt`、站内搜索、AI 检索，全都拿不到正文
- 简介也不自动生成了（不然等于把开头一段抄到侧栏上去）
- 这一篇不显示评论区
- 打开页面是个输口令的卡片，输对了在**浏览器里**解密并渲染（公式、代码高亮、callout 都在）
- 同一个标签页里解锁过就记住了，关掉标签页就忘

标题和文件名还是明文的（侧栏要显示），想连标题都藏起来就再加一个 `display: none`。

> 口令写在笔记的 frontmatter 里，所以**笔记仓库本身能看到口令**。笔记仓库现在是公开的，
> 也就是说这个加密防的是「站点的读者」，不是「能翻你笔记仓库的人」。
> 真要防后者，得把笔记仓库改成私有。

### `comments: false`

只关这一篇的评论区。

## 评论区

用 [giscus](https://giscus.app)：评论存在 GitHub Discussions 里，不用自己开数据库，
读者拿 GitHub 账号登录就能评，主题跟着站点深浅色走。

开起来要三步：

1. 找一个**公开**仓库当评论的容器（笔记仓库 `obsidian-computer` 就行），
   Settings → General → Features 勾上 **Discussions**。
2. 给这个仓库装上 [giscus app](https://github.com/apps/giscus)。
3. 打开 https://giscus.app ，填仓库名、Discussion 分类选 `Announcements`、
   映射方式选 **pathname**，它会生成一段 `<script>`，把里面这四个值抄出来：

```
NEXT_PUBLIC_GISCUS_REPO=zongxi1115/obsidian-computer
NEXT_PUBLIC_GISCUS_REPO_ID=R_kgD...
NEXT_PUBLIC_GISCUS_CATEGORY=Announcements
NEXT_PUBLIC_GISCUS_CATEGORY_ID=DIC_kwD...
```

填到 Vercel 的环境变量里（本地开发就写进 `.env.local`），重新构建就有了。
**四个值不填全就整个不显示评论区**，跟 AI 那个按钮一样的逻辑。

必须是 `NEXT_PUBLIC_` 前缀 —— 这几个值要在浏览器里用，本来就是公开的，不算密钥。

生成出来的首页索引、加了口令的笔记、写了 `comments: false` 的笔记，都不显示评论。

## 双链和关系图谱

同步脚本在转换 `[[]]` 的时候顺手把笔记之间的指向关系收集下来，写进 `content/graph.json`
（节点 / 连线 / 反向链接），站点上有三处用到：

- **右侧栏小窗** —— 每篇笔记的 "On this page" 上面，样式照着 Obsidian 的关系图谱：只画局部（同目录 + 直连），当前笔记的气泡放大并用主题色高亮，右上角两个图标分别是目录连线开关和放大（弹模态框，里面是整张图）
- **`/graph` 整页图谱** —— 导航栏进去，带 "按目录连线" 开关和重置视角
- **页面底部反向链接** —— 哪些笔记用 `[[]]` 指到了这一篇

图谱里**实心圆是笔记（越多连线越大），空心圈是目录节点**。因为现在笔记之间还几乎没有 `[[]]`，
只按双链画会是一堆孤点，所以默认把同目录的笔记挂到一个目录节点上先连起来；
双链多起来之后（连线数 ≥ 笔记数的一半）会自动默认关掉目录连线，也可以在 `/graph` 上手动切换。

指向图片的 `[[]]` 不算双链，指向笔记的普通 markdown 链接（`[文字](./笔记.md)`）算。

## 部署到 Vercel

1. 把这个目录推到一个新的 GitHub 仓库（比如 `obsidian-site`）。
2. Vercel → Add New Project → 选这个仓库。框架会自动认出 Next.js，构建命令保持默认的
   `pnpm build`（它已经包含同步步骤），不用改 Root Directory。
3. 部署完就能访问了。之后**改站点代码** push，Vercel 自己会重新构建。

## 让「笔记推送」也触发构建

站点仓库和笔记仓库是两个仓库，所以笔记 push 时要主动通知 Vercel：

1. Vercel 项目 → Settings → Git → Deploy Hooks，建一个（分支填 `main`），复制那条 URL。
2. 笔记仓库 `obsidian-computer` → Settings → Secrets and variables → Actions → New repository secret，
   名字 `VERCEL_DEPLOY_HOOK`，值就是上面那条 URL。
3. 把 `vault-workflow/deploy-site.yml` 放进笔记仓库的 `.github/workflows/deploy-site.yml` 并提交。

### 什么时候才会重建

不是每次 push 都重建，**提交信息里带 `publish` 才会**：

```bash
git commit -m "整理计算机网络的笔记"            # 只是存个档，站点不动
git commit -m "整理计算机网络的笔记 (publish)"   # 这条会触发 Vercel 重建
```

一次 push 里任意一条 commit 带上就算数。只认 `publish` 这个词、不管括号形状，`(publish)`、`（publish）`、`[publish]` 都行 —— 中文输入法很容易打成全角括号，只认半角的话会静默跳过。`contains` 大小写不敏感。
另外改 `.obsidian/` 配置和 `.github/` 本身不会触发，想不管提交信息直接发布就去
Actions 页面手动跑一次（或者 `gh workflow run deploy-site.yml --repo <你的笔记仓库>`）。

用 obsidian-git 插件自动 push 的话，记得把它的 commit message 模板改成带 `publish`。

> **空提交不管用。** `paths-ignore` 是按改动的文件判断的，`--allow-empty` 的提交一个文件都没动，
> 工作流根本不会启动（不是 skipped，是压根没有这次运行）。想不改笔记直接重建，用手动触发：
>
> ```bash
> gh workflow run deploy-site.yml --repo zongxi1115/obsidian-computer
> ```

## AI 问答

文档页右下角有个「问问 AI」浮动按钮，点开是侧边对话面板（fumadocs 官方组件）。
后端在 [app/api/chat/route.ts](app/api/chat/route.ts)：用 flexsearch 把全部笔记建成索引，
以 tool 的形式交给模型，模型先检索再回答，并用笔记的站内链接给出处。

接的是**任意 OpenAI 兼容端点**，三个环境变量：

| 变量 | 说明 |
| --- | --- |
| `AI_BASE_URL` | 端点地址，默认 `https://openrouter.ai/api/v1`。换中转站/自建服务改这里 |
| `AI_API_KEY` | 密钥。**不填就整个不显示「问问 AI」按钮**，API 也直接返回 503 |
| `AI_MODEL` | 模型 ID，必须是该端点认识的写法 |

换服务商只改变量，代码不用动（[lib/ai.ts](lib/ai.ts)）。系统提示词在 route.ts 里，
限定了"先检索再回答、不要编造、默认中文"。

## 需要注意的

- 笔记仓库现在是公开的，同步脚本才能免密克隆。如果改成私有，需要在 Vercel 加一个有读权限的
  token，并把 `VAULT_REPO` 换成 `https://x-access-token:$TOKEN@github.com/...` 的形式。
- 站点会把笔记全文公开，写之前想一想别把私密内容放进这个仓库。
- 笔记里的裸 HTML 是**直接渲染**的，没做过滤 —— 笔记只有你自己写，所以没拦；
  真要粘别人的 HTML 片段之前先看一眼里面有没有 `<script>`。
- Excalidraw 画板目前是跳过的，需要展示的话得额外做导出。
