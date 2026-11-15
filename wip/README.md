# 未完成工作（WIP）说明

这里保存的是原始云电脑检出里**还没有合进 `dev/m1`（`d8fd175`）**的工作。它们不在 GitHub 私有远程上。公开仓库如果只上传主快照、不带这个目录，换电脑后这些进展会丢失。

不要在未阅读本说明的情况下一键把所有补丁打到主分支。三条车/步行线都比 `dev/m1` 落后 1 个提交（`d8fd175` 本身），而且步行线还处于未结束的合并状态。

## 建议处理顺序

1. 先用本导出的主目录（`d8fd175`）把游戏跑起来，确认 `npm install`、`npm run dev`、`npm test` 正常。
2. **车模线** `vehicle-model/`：房车已按 Chris Bennett 参考改成 C 型外观，优先审阅和合入。补丁在 `commits/`。未提交的只有渲染指标 JSON，可重新跑截图生成，不一定要保留。
3. **车辆系统线** `vehicle-systems/`：R3（拖钩回到路上、随车补胎/维修工具、旅程钩子）。工作区干净，只有 `commits/` 里那一个补丁。
4. **步行 / 钓鱼线** `onfoot-fishing/`：抽油管、空间索引、货斗、房车门口下车、背包标签、钓鱼第一版。先看 `commits/`，再把 `working-tree/` 里未提交的文件当作进行中的草稿。特别检查 `working-tree/src/game/player/player.ts`（原工作区标记为未合并，但文件中无冲突标记）。
5. **世界站点** `world-sites/`：基于较旧的游离提交 `b7ab9c7`（比 `dev/m1` 落后 5 个提交）上的未提交改动，涉及 `sites.ts`、`siteBuild.ts` 和截图集。不要按那个旧 HEAD 整树覆盖，只移植这几个文件里仍然有用的改动。
6. `gate-metrics/` 只是门禁跑出来的指标，不是玩法代码，可忽略或用来对照。
7. `obsolete-world-v4/` 是很早的本地快照，落后 53 个提交，默认不要合入。

## 每个目录里有什么

- `commits/*.patch`：相对分叉点的独立提交（已排除合并提交），可用 `git am` 或 `git apply`。
- `against-merge-base.diff`：相对分叉点 `540dc37` 的累计差异。
- `against-dev-m1-two-dot.diff`：直接相对当前 `d8fd175` 的差异（更可能在当前树上应用，也更容易冲突）。
- `uncommitted.diff` 与 `working-tree/`：工作区里还没提交的文件副本。
- `STATUS.porcelain`、`HEAD_SHA.txt`、`MERGE_BASE.txt`、`COMMITS.txt`：当时的精确状态。
