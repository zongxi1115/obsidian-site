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
| 没有 frontmatter | 自动补 `title`（取正文一级标题，没有就用文件名）和 `description`（取第一段） |
| `![[images/xx.png]]` | `![](/vault/images/xx.png)`，图片复制到 `public/vault/` |
| `[[某篇笔记]]`、`[[笔记#小节\|别名]]` | 指向对应页面的链接；只写文件名也能解析，解析不到就退化成纯文本 |
| `$x^2$`、`$$...$$` | KaTeX 公式（`source.config.ts` 里挂的 remark-math + rehype-katex） |
| `*.excalidraw.md`、`Excalidraw/`、`.obsidian/` | 跳过 |
| 中文文件名 / 目录名 | 转成拼音当 URL，中文放进 `title` 和 `meta.json`（原因见下一节） |

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

## 双链和关系图谱

同步脚本在转换 `[[]]` 的时候顺手把笔记之间的指向关系收集下来，写进 `content/graph.json`
（节点 / 连线 / 反向链接），站点上有三处用到：

- **右侧栏小窗** —— 每篇笔记的 "On this page" 上面，样式照着 Obsidian 的关系图谱：当前笔记钉在正中央并用主题色高亮，右上角两个图标分别是目录连线开关和放大（弹模态框）
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

不是每次 push 都重建，**提交信息里带 `(publish)` 才会**：

```bash
git commit -m "整理计算机网络的笔记"            # 只是存个档，站点不动
git commit -m "整理计算机网络的笔记 (publish)"   # 这条会触发 Vercel 重建
```

一次 push 里任意一条 commit 带上就算数；`contains` 是大小写不敏感的，`(Publish)` 也行。
另外改 `.obsidian/` 配置和 `.github/` 本身不会触发，想不管提交信息直接发布就去
Actions 页面手动跑一次（或者 `gh workflow run deploy-site.yml --repo <你的笔记仓库>`）。

用 obsidian-git 插件自动 push 的话，记得把它的 commit message 模板改成带 `(publish)`，
或者平时让它随便提交、要发布时手动补一条带 `(publish)` 的空提交。

## 需要注意的

- 笔记仓库现在是公开的，同步脚本才能免密克隆。如果改成私有，需要在 Vercel 加一个有读权限的
  token，并把 `VAULT_REPO` 换成 `https://x-access-token:$TOKEN@github.com/...` 的形式。
- 站点会把笔记全文公开，写之前想一想别把私密内容放进这个仓库。
- Excalidraw 画板目前是跳过的，需要展示的话得额外做导出。
