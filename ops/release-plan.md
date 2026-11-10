# 算力工地 · 上线准备任务清单

> 生成日期:2026-11-10
> 位置:`ops/release-plan.md`
> 为什么放这里:VitePress 只构建 `docs/` 目录,`ops/` 下的文件**不会**被构建成公开页面,也不会出现在 compute-factory.com 上。

## 进度(2026-11-10)

| 任务 | 状态 | 说明 |
|---|---|---|
| A1 大小写检查脚本 | ✅ 已完成 | `scripts/check-assets.mjs`,已用假目录自测能抓错 |
| A2 `npm run verify` | ✅ 已完成 | check + build 串联 |
| A3 `ops/RELEASE.md` | ✅ 已完成 | 发布/冒烟/回滚/故障对照 |
| A4 接入 CI | ✅ 已完成 | `pages.yml` 在 build 前加 `npm run check` |
| A5 sitemap / robots | ⏸ 挂起 | 等 B0 的 HTTPS 修好后定 hostname |
| A6 本地验证 + 点站 | ✅ 已完成 | 41 页面 / 47 资源,全部 200 |
| A7 本地 commit | ⏳ 待确认 | 等你点头 |

---

## 0. 怎么读这份清单

| 标记 | 含义 |
|---|---|
| 🟢 **我可全做** | 不需要你介入,我改完给你看 diff |
| 🔵 **需你操作** | 账号、密钥、DNS 之类,我没法代做 |
| 🟡 **等你拍板** | 我给方案和取舍,你决定做不做 |
| 🔷 **一起做** | 机器能做的我做,人才能判断的你看 |

每个任务写三件事:

- **作用** —— 为什么做这件事
- **做法** —— 具体动哪个文件、加什么内容
- **边界** —— 明确不会碰什么(防止我顺手改了你不希望改的东西)

---

## 1. 我先说清楚:默认不会做的事

除非你在对话里明确说"做",以下动作我不执行:

- 不 `git push`、不开 PR、不合并。**只在本地 commit**,且 commit 前会问你。
- 不改 `docs/` 下的正文文章。
- 不改 `docs/.vitepress/config.mts` 里除 sitemap 以外的配置(`base`、`themeConfig`、导航、sidebar 都不动)。
- 不装新依赖,不动 `package-lock.json`。
- 不删除任何现有文件。
- 不碰域名解析、CDN、GitHub 仓库设置。
- 不触发线上部署。

---

## 2. 现状盘点

### 已经有的(不用重做)

- ✅ PR 上会跑 `npm run build`,但**不会部署**;只有推 `main` 才 deploy。这道门禁已经挡住了大部分"合并即事故"。
- ✅ `build` 自带站内死链检查。
- ✅ 用户站(`compute-factory.github.io`),根路径部署,没有 `base` 路径问题。
- ✅ `npm run preview` 可用,能跑真实产物。

### 缺的

- ❌ 没有能在浏览器里点开的预览环境(PR 预览)。
- ❌ 没有大小写检查。Windows 本地能过、Linux CI/线上的坑没人守。

### ⚠️ 刚查出来的线上问题(P0)

**HTTPS 打不开,证书是错的。**

实测结果:

```
https://www.compute-factory.com/
  → curl: (60) certificate check failed
  → 证书 subject = CN=*.github.io   ← 不是你的域名
http://www.compute-factory.com/    → 200 OK,能访问
compute-factory.com                → 没有任何 A 记录,域名不解析
www.compute-factory.com            → CNAME → compute-factory.github.io ✅(DNS 是对的)
```

意思是:

1. 访客用 `https://` 打开会看到浏览器的安全警告。
2. 访客直接输 `compute-factory.com`(不带 www)打开是空白页。
3. 你现在只能发 `http://` 链接,而这在微信、某些浏览器里会被拦截或降权。

这不是代码问题,是 **GitHub 仓库设置 + DNS** 的问题,只能你来操作。详见 B0。

---

## 3. 任务清单

### A 组 · 纯本地,零账号依赖 —— 🟢 我可全做

#### A1. 大小写 / 死链检查脚本

- **作用**:专治 Windows 开发、Linux 构建的不一致。本地 NTFS 不分大小写,链接写 `/guide/HashMap` 指向 `hashmap.md` 能过;CI 是 Ubuntu,线上直接 404。这是你这个项目最可能翻车的地方。
- **做法**:新建 `scripts/check-assets.mjs`(约 60 行,零依赖)。扫描 `docs/**/*.md` 里的站内链接和图片路径,与磁盘上的真实文件名做**严格区分大小写**的比对,不一致就打印 `文件:行号`,退出码 1。
- **边界**:只读,不改任何文件;只查站内路径,不校验外链,不发任何网络请求。

#### A2. 加 `npm run verify` 一条命令

- **作用**:把"构建 + 大小写检查"合成一条,以后发内容只跑这一条,不靠记忆。
- **做法**:在 `package.json` 的 `scripts` 里加一行 `"verify": "npm run build && node scripts/check-assets.mjs"`。
- **边界**:不动现有 `dev` / `build` / `preview`;不装依赖。依赖 A1 先完成。

#### A3. 写 `ops/RELEASE.md` 发布流程

- **作用**:把"发一篇文章"的步骤、上线检查清单、出事怎么回滚固化成文档,以后照着走,不靠临场想。
- **做法**:新建 `ops/RELEASE.md`,纯 Markdown。内容:发布前检查 → 合并 → 部署后 60 秒冒烟 → 回滚步骤。
- **边界**:只新建文件。**不放 `docs/` 里**,因为 VitePress 会把 `docs/` 下所有 md 都构建成公开页面,内部运维文档不该出现在教学站上。

#### A4. 把检查接进 CI

- **作用**:让大小写错误在 PR 阶段就红,而不是上线后才发现 404。
- **做法**:在 `.github/workflows/pages.yml` 的 `npm ci` 之后、`npm run build` 之前加一步 `run: node scripts/check-assets.mjs`。
- **边界**:只加一行 step。不改触发条件、不改 deploy job、不动 `permissions`。

#### A5. 补 sitemap.xml 和 robots.txt

- **作用**:让搜索引擎正确收录(FACT 里记的缺口);robots 告诉爬虫什么能抓。
- **做法**:在 `docs/.vitepress/config.mts` 加 `sitemap: { hostname: '...' }`(VitePress 内置能力,构建时自动生成);新建 `docs/public/robots.txt`,内容指向 sitemap 地址。
- **边界**:只加 sitemap 这一段,不动其它配置项;`robots.txt` 是全新文件,不改现有 `public/` 内容。
- **依赖**:hostname 用 `https://` 还是 `http://` 取决于 B0 修没修好。**建议等 B0 修完再定**,否则 sitemap 里全是打不开的 https 链接。

#### A6. 本地完整验证 + 自动化点站

- **作用**:交给你的眼睛之前,先让机器把"链接死没死、console 报不报错、移动端会不会横向溢出"筛一遍。
- **做法**:跑 `npm run verify`,再起 `npm run preview`;用 Playwright 爬站内所有页面,记录 404、console error、375px / 1440px 截图;输出一份简短报告。
- **边界**:只访问本地服务。不碰线上站,不改文件。

#### A7. 本地 commit

- **作用**:把改动分粒度存进 git,方便回看和回滚。
- **做法**:按 A1–A5 分 3–4 个 commit,信息写清楚改了什么。
- **边界**:**只 commit,不 push**。push 要你点头。

---

### B 组 · 需要你操作 —— 🔵

#### B0.（P0)修 HTTPS 和裸域名

- **作用**:让访客能用 `https://` 正常打开,并且输 `compute-factory.com` 也能到站。当前状态会让浏览器弹安全警告,是上线前必须解决的硬伤。
- **做法**(三步,都需要你来):
  1. GitHub 仓库 `Settings → Pages`:`Custom domain` 填 `www.compute-factory.com`,保存,等 `DNS check successful`。
  2. 同一页面等证书签发(通常几分钟到几小时),然后勾上 `Enforce HTTPS`。
  3. 域名商后台(你的 DNS 在 Spaceship)给裸域名 `compute-factory.com` 加记录。GitHub Pages 推荐 4 条 A 记录:`185.199.108.153` / `185.199.109.153` / `185.199.110.153` / `185.199.111.153`;或者用 `ALIAS/ANAME` 指向 `compute-factory.github.io`(Spaceship 不一定支持)。
- **为什么必须你来**:GitHub 仓库 Settings 和域名 DNS 都是你的控制权。
- **修完我能做**:重跑一遍证书检查、确认 http 会 301 跳到 https、确认裸域名可达。

#### B1. GitHub CLI 登录

- **作用**:登录后我才能开 PR、查 Actions 日志、用 API 读仓库设置。
- **做法**:你在终端跑 `gh auth login`,选 GitHub.com → HTTPS → 浏览器登录。
- **为什么必须你来**:要你的账号和二次验证,我不能代登录。

#### B2. Cloudflare / Netlify 注册并授权仓库

- **作用**:给每个 PR 自动生成一个可点开的预览 URL,在真 CDN 上点一遍再合并。
- **做法**:你注册账号 → 授权 GitHub → 新建项目选 `compute-factory.github.io` → 填两个值:`Build command = npm run build`,`Output directory = docs/.vitepress/dist`。
- **为什么必须你来**:账号注册和 OAuth 授权。
- **前提**:C1 选"要"。

#### B3. DNS 加 staging 的 CNAME

- **作用**:让 `staging.compute-factory.com` 指向预发环境。
- **做法**:域名商后台加一条 CNAME。
- **为什么必须你来**:域名控制权。
- **前提**:C2 选"要"。

---

### C 组 · 等你拍板 —— 🟡

#### C1. 要不要接 Cloudflare Pages 做 PR 预览?

- **选项 A(推荐)**:接。只用来出预览 URL,正式发布仍然走 GitHub Pages,两个平台互不干扰,免费。
- **选项 B**:不接。退回"本地 preview + CI 绿 + 发布后 60 秒冒烟",够用,但少了真环境验收。
- **影响**:选 A 需要做 B2,多一个平台要维护;选 B 则 A 组做完就能收工。

#### C2. 要不要 `staging.compute-factory.com`?

- **建议**:先不要。等内容量上来、或者开始接外部投稿时再考虑。
- **影响**:要的话需要 B3,而且 GitHub Pages 一个仓库只能挂一个站,得另开仓库或用别的托管。

#### C3. 分支保护开多严?

- **建议**:只开"CI 必须通过才能合 `main`",不强制 PR(你 solo,强制 PR 太烦)。
- **影响**:开了之后坏构建进不了 `main`;代价是你自己改东西也得等 CI 跑完。

#### C4. 哪些内容可以公开?

- **作用**:上线验收最终是内容判断,机器判断不了。
- **需要你**:给一个范围,我按这个范围做 A6 的点站验证。

---

### D 组 · 一起做 —— 🔷

#### D1. 发布后 60 秒冒烟

- **我做**:合并后等 deploy job 变绿,打开线上首页、一个文章页、搜索,抓 console、截图。
- **你看**:内容对不对、读起来是不是你要的调性。

#### D2. 移动端视觉验收

- **我做**:出 375px / 768px 截图。
- **你看**:排版、留白、字号可读性。

#### D3. 跨浏览器 / 真机

- **我只能**:桌面 Chromium。
- **需要你**:Safari、微信内置浏览器、真手机点一遍。教学站大概率有人从微信点进来,这条别省。

---

## 4. 建议顺序

**第 0 批(最急,只有你能做)**
B0 修 HTTPS —— 其他都能等,这个不行。

**第 1 批(零账号,今天能做完)**
A1 → A2 → A3 → A4 → A6 → A7
(A5 等 B0 修完再定 hostname)

**第 2 批(等你决定 C1)**
B1 → (C1 选 A) B2 → 用一次 PR 预览做验收

**第 3 批(可选)**
C2 → B3 → staging

---

## 5. 这份清单本身

- 位置 `ops/release-plan.md`,不在 `docs/` 下,不会被构建进站点,也不会自动提交。
- 你想改就改。做完一项我打勾;不想做的直接删掉那一节。
