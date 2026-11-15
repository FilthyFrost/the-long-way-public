# 第一阶段审计摘要（导出时写入）

记录时间：2026-11-15 约 16:00（Asia/Shanghai）

- 原检出：`/home/box/road-trip-game`，分支 `dev/m1`，提交 `d8fd175ef1a54b1cc4e72aa7d10d6dd5d32a2a43`（提交于北京时间 2026-11-15 03:48），工作区干净，已与 `origin/dev/m1` 同步。
- 远程 `https://github.com/FilthyFrost/the-long-way` 为 **private**，仅有分支 `dev/m1`。
- 公开仓库：https://github.com/FilthyFrost/the-long-way-public （本快照推送到 `main`）。
- 公开导出：`/workspace/the-long-way-public-export`。含原仓全部 282 个已跟踪文件，外加交接文档与 `wip/`。
- 私有资料改为 8 个可独立解压、每个小于 24 MB 的分卷，目录：`/workspace/the-long-way-private-packs/`。不要上传到 GitHub。
- 排除：原私有仓 `.git` 历史、`node_modules`、`dist`、`.claude`、参考原图、Painted Valley 源码、历史截图、凭据。公开导出内未检出密钥模式，也没有参考原图。
- 原项目未修改，未改变原私有仓可见性。
- 验证：`npm ci`、`npm run check`、`npm test`（779 通过 / 4 跳过）、`npm run build` 均成功。
