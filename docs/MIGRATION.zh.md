# 换电脑迁移说明

本目录是公路旅行游戏在 2026-11-15（Asia/Shanghai）从云电脑检出整理出的**公开迁移快照**，目的是让你在另一台电脑上把开发接下去。它不是原来那个私有仓库的 git 克隆，也不包含密钥或第三方参考原图。

## 公开仓库

- 游戏代码公开快照：https://github.com/FilthyFrost/the-long-way-public
- 原开发仓仍保持私有：https://github.com/FilthyFrost/the-long-way （`dev/m1` = `d8fd175`）
- 权威设计大纲（原本就是公开的）：https://github.com/FilthyFrost/the-long-way-design

默认分支是 `main`。这个提交是干净快照，来源是私有仓 `dev/m1` 的 `d8fd175ef1a54b1cc4e72aa7d10d6dd5d32a2a43`，并加上交接文档和未合入的 `wip/`。

## 在新电脑上启动（已在导出目录验证）

需要 Node.js（建议 20 或更新）和 npm。验证时使用的是 Node v24.22.1、npm 11.21.1，时间是 2026-11-15 15:57（Asia/Shanghai）。

```bash
git clone https://github.com/FilthyFrost/the-long-way-public.git
cd the-long-way-public
npm ci
npm run dev        # 打开 http://127.0.0.1:5173
```

同一次验证的结果（均在本导出目录、未改游戏代码）：

| 命令 | 结果 |
| --- | --- |
| `npm ci` | 成功（53 个包装好，0 个漏洞） |
| `npm run check` | 成功（`tsc --noEmit` 退出码 0） |
| `npm test` | 成功：25 个测试文件通过；779 项通过，4 项跳过 |
| `npm run build` | 成功（Vite 8.3.8，约 0.36 秒） |

`npm install` 也可以，但 `npm ci` 会严格按 `package-lock.json` 安装，更适合换电脑复现。

可选参考图和历史截图不在 GitHub 上。把随消息提供的 8 个私有分卷 zip 全部解压到仓库根目录（与 `package.json` 同级），例如：

```bash
unzip -o 01-references-and-source.zip
unzip -o 02-shots-world.zip
unzip -o 03-shots-vehicles.zip
unzip -o 04-shots-water.zip
unzip -o 05-shots-weather.zip
unzip -o 06-shots-land-and-sky.zip
unzip -o 07-shots-judges.zip
unzip -o 08-shots-style-sites-driving.zip
```

每个 zip 都小于 24 MB，可单独解压，不必先拼接。它们会补齐 `refs/` 与 `loop/shots/`。原迁移包根目录的说明会写到 `docs/handoff/PRIVATE_PACK_README.md`，避免覆盖本仓库 README。这些分卷不要再推回 GitHub。

## 这个快照里有什么

- 主线源代码、规格、设计文档、测试与截图脚本，精确对应 `dev/m1` 提交 `d8fd175ef1a54b1cc4e72aa7d10d6dd5d32a2a43`
- `package.json` 与 `package-lock.json`，可在新电脑上复现依赖
- 换电脑说明：`docs/handoff/HANDOFF.md`
- 用户任务指令副本：`docs/handoff/instructions/.go5.txt` 至 `.go7.txt` 等
- 权威设计文档副本：`docs/upstream/GAME_DESIGN.md`
- 未合入的 WIP 补丁与工作副本：`wip/`
- 第三方资料来源清单：`refs/REFERENCE_MANIFEST.md`

## 这个快照里没有什么（有意排除）

| 排除项 | 原因 | 若还需要，去哪里取 |
| --- | --- | --- |
| 原私有仓的完整 `.git` 历史 | 干净快照，避免把私有仓历史和本机配置带出去 | 原私有仓仍保留完整历史 |
| `node_modules/`、`dist/` | 可重建的依赖和构建产物 | 新电脑上 `npm ci`、`npm run build` |
| `.claude/` 工作树与会话 | 体积约 1.4 GB，且含本机会话状态 | 有用的未完成代码已提取到 `wip/` |
| Claude 会话 jsonl、看门狗脚本 | 本机自动化，换电脑无用；且不应公开会话 | 私有分卷 `01-references-and-source.zip` 里的 `box-only/` |
| `refs/rv-reference/*.jpg`、`refs/artstation-1NKWJK/cover.webp` | 第三方版权图，明确规定只作本地参考、不上传 | 私有分卷，或按 `refs/REFERENCE_MANIFEST.md` 自行下载 |
| `refs/painted-valley/`、zip、`refs/_raw/` | 第三方工程与抓取的页面，原仓就未入库 | 私有分卷，或 https://patch.gg/blendi/painted-valley/files |
| `loop/shots/**` 共约 114 MB | 本地评审截图，原仓就不入库 | 私有分卷 02–08 |

更细的交接、模型分工和未合入工作处理顺序见 `docs/handoff/HANDOFF.md` 与 `wip/README.md`。
