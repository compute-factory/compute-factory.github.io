# 仓库内的技能

这里放可以复用的 agent 技能。每个技能一个目录，目录名与 `SKILL.md` frontmatter 里的 `name` 一致。

## 现有技能

| 技能 | 版本 | 用途 | 什么时候用 |
|---|---|---|---|
| [ai-infra-tutorial](ai-infra-tutorial/SKILL.md) | 1.1.0 | 撰写面向工程师与学习者的中文 AI Infra 与系统技术教学文章 | 用户要求编写概念讲解、原理拆解、架构概览、动手实验教程或专题指南时 |
| [paper-reading-report](paper-reading-report/SKILL.md) | 1.8.0 | 把论文、聊天记录与笔记整理成可直接发布的中文论文读后报告 | 用户说「论文精读」「读后报告」「把这篇论文写成文章」，或提供论文 PDF / arXiv 链接并附带笔记时 |

## 怎么用

- **Claude Code / Antigravity / Codex 等支持 skills 的工具**：把对应技能目录复制到项目的 `.claude/skills/`、`.agents/skills/` 或全局技能目录，或从 `AGENTS.md` 的「技能」一节找到入口文件手工读取。
- **其他 agent**：直接读 `skills/<name>/SKILL.md`，它引用的 `references/`、`scripts/`、`assets/` 都在同目录下。

## 新增一个技能

1. 建目录 `skills/<kebab-case-name>/`。
2. 写 `SKILL.md`，frontmatter 至少包含：
   ```yaml
   ---
   name: <与目录名一致>
   description: <一句话说明用途与触发场景>
   metadata:
     version: 1.0.0
   ---
   ```
3. 细则放 `references/`，脚本放 `scripts/`，模板放 `assets/`。
4. 在上面的表格里加一行。
5. 跑 `npm run check`，`scripts/check-skills.mjs` 会校验结构与引用。

改已有技能时同步升 `metadata.version`，并在提交信息里写清改了什么。
