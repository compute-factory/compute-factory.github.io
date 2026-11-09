<p align="center">
  <img src="docs/public/banner.png" alt="算力工地 · Compute Factory" width="100%">
</p>

# 算力工地 · Compute Factory

**前方施工 · 新手可进**

算力工地是面向新手的中文 AI Infra 教学站。我们把概念、动手实验和延伸资料按学习顺序放在一起，从模型如何占用内存、如何生成 token，一路学到推理服务、GPU 算子和分布式训练。

- [网站](https://www.compute-factory.com/)
- [学习路线](docs/guide/index.md)
- [第一张工单](docs/guide/first-lab.md)
- [资料架](docs/resources.md)

## 本地预览

使用 Node.js 24 和 npm。在仓库根目录运行以下命令。

```bash
npm ci
npm run dev
```

提交前运行 `npm run build` 检查链接和站点构建。用 `npm run preview` 可以预览构建产物。GitHub Actions 会在 PR 上构建检查，并在更新 `main` 后发布到 GitHub Pages。

## 贡献教程

修改前请阅读 [代码架构与修改指南](ARCHITECTURE.md)，其中记录了页面入口、组件职责、内容配置和验证方法。

教程写在 `docs/guide/`，参考资料集中放在 `docs/resources.md`，导航配置在 `docs/.vitepress/config.mts`。一篇教程应说明读完能做什么、需要什么软硬件、运行哪些命令，以及如何判断结果是否正确。引用外部资料时附上原始链接，并标明适合在哪个学习阶段阅读。

可以先开 Issue 讨论选题，再提交 PR 供另一位维护者复跑示例或审阅。勘误也欢迎直接提交 PR。

## 许可

本仓库的内容和代码分开授权：

| 范围 | 许可 |
| --- | --- |
| 教程与文章正文、配图（`docs/` 下的 Markdown 文字和图片） | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.zh-hans)，全文见 [LICENSE-CONTENT.txt](LICENSE-CONTENT.txt) |
| 站点代码与配置（`docs/.vitepress/`、`package.json`、`.github/`）以及教程里的代码示例 | [MIT](LICENSE) |

转载或改编正文时，请注明出处「算力工地 · Compute Factory」并附上原文链接，同时说明是否做了修改。
