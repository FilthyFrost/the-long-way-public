# 原始仓库快照记录

这份公开导出对应下面这个**原样保留、未改动**的本地检出。导出过程没有 clone，也没有改写 `/home/box/road-trip-game`。

记录时间：2026-11-15 16:00 左右（Asia/Shanghai，北京时间）

## 检出位置与远程

- 本地路径：`/home/box/road-trip-game`
- 远程：`https://github.com/FilthyFrost/the-long-way.git`
- 远程可见性（查询时）：**private**
- 远程仅有分支：`dev/m1`（也是默认分支）
- 本地当前分支：`dev/m1`
- 工作区状态：`nothing to commit, working tree clean`，与 `origin/dev/m1` 一致

## 精确提交

- 分支：`dev/m1`
- SHA：`d8fd175ef1a54b1cc4e72aa7d10d6dd5d32a2a43`
- 说明：Repair kits stay in a workshop's drawers; the economy cards re-measured on the changed world
- 提交时间：2026-11-14 11:48:25 -0800，合北京时间 **2026-11-15 03:48（Asia/Shanghai）**

权威设计文档另有公开仓库（不是本游戏代码仓）：

- https://github.com/FilthyFrost/the-long-way-design （public，默认分支 `main`）
- 本导出内离线副本：`docs/upstream/GAME_DESIGN.md`
- 副本对应提交：`b46194ed58fc1bbe41d0a8cbcff393c46bf35e10`（2026-11-14 00:20:08 +0800）

## 本地未推送的分支 / 工作树（已打包装进 `wip/`）

这些分支**都不在** GitHub 私有远程上，换电脑时只能靠本导出里的补丁和文件副本。

| 名称 | 当时 HEAD | 相对 `dev/m1` | 未提交改动 | 导出目录 |
| --- | --- | --- | --- | --- |
| 步行 / 钓鱼线 `worktree-agent-a06f45e805e4ac32c` | `8f94135` | 超前 8、落后 1 | 有（含未结束合并的 `player.ts`） | `wip/onfoot-fishing/` |
| 车模线 `worktree-agent-a27aa57a8f63ad6c9` | `4b86ec9` | 超前 4、落后 1 | 仅部分截图指标 | `wip/vehicle-model/` |
| 车辆系统线 `worktree-agent-a786e9facdec62a24` | `d46a55e` | 超前 1、落后 1 | 无 | `wip/vehicle-systems/` |
| 视图工作树（游离 `b7ab9c7`） | `b7ab9c7` | 超前 0、落后 5 | 有站点相关改动 | `wip/world-sites/` |
| 门禁工作树（游离，等于 `d8fd175`） | `d8fd175` | 相同 | 仅 `loop/metrics` 与 scoreboard | `wip/gate-metrics/` |
| 本地旧分支 `wip/world-v4` | `28d6aaa` | 超前 1、落后 53 | 无 | `wip/obsolete-world-v4/`（基本过时） |
| 本地 `main` | `55e8b38` | 超前 0、落后 52 | 无 | 未单独导出；这是上一次截图门禁全绿的标记点 |
| `integ` | `4ee1dd7` | 超前 0、落后 38 | 无实质改动 | 未导出 |

三条进行中的 Opus 线的共同分叉点（merge-base）是 `540dc37`，也就是当前 `dev/m1` 的父提交。把它们合回 `d8fd175` 时可能需要处理那 1 个落后提交。

步行线工作区里 `src/game/player/player.ts` 的 git 状态当时是 `UU`（未结束的合并），但工作副本里**没有**冲突标记。换电脑后续做前请先人工核对这份文件，不要直接当成已解决。
