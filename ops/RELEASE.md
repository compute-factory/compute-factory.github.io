# 发布流程

本文档描述从写完内容到线上生效的完整流程,以及出问题时怎么退回去。

适用于当前架构:VitePress 构建静态站,GitHub Actions 部署到 GitHub Pages,`main` 分支即线上。

---

## 一、发布前(本地)

```bash
npm ci          # 只在依赖变动后需要
npm run verify  # 大小写检查 + 构建(构建自带死链检查)
npm run preview # 起本地服务,浏览器打开 http://localhost:4173
```

`npm run verify` 必须通过。它做两件事:

1. `npm run check` —— 按字节比对站内链接和资源的大小写。本地是 Windows 不区分大小写,CI 是 Linux 区分,这一步专挡"本地能过、线上 404"。
2. `npm run build` —— 真实产物构建,顺带检查站内死链。

`dev` 模式不能替代这一步:SSR 报错、死链、搜索索引、图片路径都只在 build 时暴露。

### 检查清单

- [ ] `npm run verify` 通过
- [ ] `npm run preview` 里点过:首页、`/guide/`、至少一个文章页
- [ ] 新增图片的体积合理(`docs/public/` 下,单张建议 < 300 KB)
- [ ] 移动端宽度看过(375px 不失衡、不横向滚动)
- [ ] 新增页面已加入 `docs/.vitepress/content/curriculum.ts`(否则侧栏没有入口)

---

## 二、提交与合并

```bash
git add <具体文件>      # 不用 git add -A,避免把临时文件带进去
git commit -m "..."
git push
```

- 推 `main` 会直接触发构建和部署,**没有中间审核**。
- 开 PR 的话,CI 会跑 `npm run check` 和 `npm run build`,但**不会部署**。红灯不许合。

> 以后接入 PR 预览后,PR 上会多一个可访问的预览地址,内容确认后再合。

---

## 三、部署

推 `main` 后,去仓库 **Actions** 页看 `GitHub Pages` 这个 workflow:

```
build  ✅  npm ci → npm run check → npm run build
deploy ✅  上传产物 → deploy-pages
```

两个 job 都绿才算发布成功。`build` 绿而 `deploy` 红,说明是 Pages 权限或环境问题,不是内容问题。

完整流程通常 1–3 分钟。

---

## 四、发布后 60 秒冒烟

部署变绿后立刻做,别等:

1. 打开 https://www.compute-factory.com/
2. **硬刷新**(`Ctrl + F5`),避免看到缓存
3. 点进一个文章页,确认正文渲染正常
4. 用站内搜索搜一个词,确认索引有结果
5. 打开浏览器控制台,确认没有红色报错

发现异常,直接执行下面的回滚。

---

## 五、回滚

静态站回滚 = 把上一次的提交重新部署一次。

### 情况 A:刚合并,还没别人用

```bash
git revert <出问题的提交>
git push
```

等 Actions 跑完,自动回到上一版。1–3 分钟。

### 情况 B:需要立刻止血

在 GitHub 仓库 **Actions** 页,找到上一次成功的 `GitHub Pages` run,点 **Re-run all jobs**。会重新部署那次的产物,比 revert 更快。

### 情况 C:连 Actions 都跑不起来

在仓库 **Settings → Pages** 里切换 Source 到 "Deploy from a branch",选 `gh-pages` 分支(如果存在)。这是兜底方案,平时不用。

---

## 六、常见故障对照

| 现象 | 多半是 | 怎么办 |
|---|---|---|
| build 红,提示 dead link | 站内链接写错或删了页面 | 按报错路径改链接 |
| build 红,提示大小写不一致 | 链接大小写和文件名不符 | `npm run check` 看具体行号 |
| 线上某页 404,本地正常 | 大小写 / 扩展名 | 同上,推 `main` 前必须过 `check` |
| 图片裂开 | 引用了 `public/` 里不存在的文件,或大小写不符 | 确认 `docs/public/` 下有同名文件 |
| 样式全丢 | `base` 配错 | 本仓库是用户站,`base` 应为空 |
| 搜不到内容 | 搜索索引没生成 | 确认 build 产物里有 `hashmap.json` |
| deploy 红 | Pages 权限 / environment 保护 | 看 deploy job 日志,检查 `permissions` |

---

## 七、待办(上线前)

- [ ] 修复自定义域名 HTTPS:GitHub Pages 的 `Custom domain` 填 `www.compute-factory.com`,等证书签发后勾选 `Enforce HTTPS`
- [ ] 裸域名 `compute-factory.com` 加 4 条 A 记录(见 `release-plan.md` 的 B0)
- [ ] HTTPS 修好后再定 `sitemap` 的 hostname 用 `https://`
