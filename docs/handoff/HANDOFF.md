# 换电脑交接说明（HANDOFF）

这份说明写给要在**另一台电脑**上继续开发本游戏的人（以及后续的编程助手）。公开导出是干净快照，不含 `.git` 历史、`node_modules`、缓存、Claude 会话日志或任何凭据。

更完整的迁移背景见同目录的 `SOURCE_SNAPSHOT.md`、`../MIGRATION.zh.md` 和 `../../wip/README.md`。

## 1. 这是什么项目

温馨的后末日合作公路旅行游戏原型。技术栈只能是 **HTML5 + Three.js + TypeScript + Vite**，不要用 Godot，也不要换别的游戏引擎。

权威材料（按这个顺序理解）：

1. `docs/upstream/GAME_DESIGN.md`（或 https://github.com/FilthyFrost/the-long-way-design）——玩法大纲
2. `docs/DESIGN_V2.md` ——实现方案（对标、数值、车辆、优先级）
3. `specs/art/STYLE.md` ——吉卜力式手绘风格，不要偏离
4. `docs/PLAN.md`、`docs/VEHICLE_SYSTEMS.md`、`loop/LOOP.md` ——当前进度、车辆系统和自我迭代规程
5. `docs/handoff/instructions/.go7.txt` ——用户最新的模型分工（优先级最高）
6. `docs/handoff/instructions/.go6.txt`、`.go5.txt` ——较早但仍有效的补充；冲突时以 `.go7.txt` 为准

## 2. 在新电脑上启动

需要 Node.js（建议 20 或更新）和 npm。下面这组命令已在 2026-11-15 15:57（Asia/Shanghai）于本快照目录验证：Node v24.22.1、npm 11.21.1；`npm ci` 成功；`npm run check` 通过；`npm test` 为 779 项通过、4 项跳过；`npm run build` 成功。

```bash
git clone https://github.com/FilthyFrost/the-long-way-public.git
cd the-long-way-public
npm ci
npm run dev        # 打开 http://127.0.0.1:5173
```

常用检查：

```bash
npm run check      # TypeScript（已验证通过）
npm test           # Vitest（已验证：779 通过，4 跳过）
npm run build      # 生产构建（已验证通过）
npm run measure    # 规格卡测量
npm run loop:fast  # 检查 + 测量 + 测试 + 评审（不含完整截图矩阵）
```

开发时按 `README.md` 里的键位和网址参数操作。截图与视觉评审还需要 Playwright 和本机参考图：

- 参考图不在公开仓库里。请把随消息提供的 8 个私有分卷 zip（每个小于 24 MB，可单独解压）全部解压到仓库根目录，使 `refs/rv-reference/*.jpg` 与 `refs/artstation-1NKWJK/cover.webp` 就位。不要把这些 zip 推到 GitHub。
- 历史截图在分卷 02–08 解压后的 `loop/shots/`（约 114 MB、151 张），可选。不放进去也能开发，只是少了旧的对比证据。
- `npm run shots` / `npm run style` 会写到 `loop/shots/`（该目录默认不进 git）。

原云电脑上的 `.watchdog.sh` 绑定了那台机器的 Claude Code 会话、显示号和路径，**不要**在新电脑上运行。副本在 `01-references-and-source.zip` 的 `box-only/` 里，仅作历史记录。

## 3. 后续模型分工（继续有效）

来自用户指令 `.go7.txt`（最高优先）：

- **Opus 5.5**（含子代理）负责整套车辆系统，对标 Drive Beyond Horizons、Arctic Drive、Pacific Drive：驾驶手感（油门 / 刹车 / 手刹 / 挡位 / 转向 / 悬挂）、内饰与可交互部件（开车门、车窗、灯、仪表、收音机等）、磨损与维修（换零件、换轮胎、油电等）。房车外观仍以 Chris Bennett 参考为准，内饰、通道、驾驶室自行设计。
- **Fable 5.2** 负责世界内容与美术一致性：地形与道路、复杂天气（目标 3A 级体验）、沿途可搜刮的小建筑、随机箱子与物资、废弃车、狩猎区、湖泊钓鱼区、加油站，并审核车辆模型是否符合 `specs/art/STYLE.md`。

若某模型额度用完，不要擅自改分工；按当时可用的模型接着做，但不要偏离上面的职责边界。

## 4. 当前优先级（以 `docs/PLAN.md` 交接节为准，并加上未合并 WIP）

代码主线停在 `d8fd175`。优先把 `wip/` 里已经做完但未合入的工作审阅、变基到这条主线：

1. 车模线：C 型房车正式外观（`wip/vehicle-model/`）
2. 车辆系统线：R3 拖钩回到路上、随车维修工具、旅程钩子（`wip/vehicle-systems/`）
3. 步行 / 钓鱼线：F1 + F2（`wip/onfoot-fishing/`，先解决 `player.ts` 的未结束合并状态）
4. 世界侧：海岸与灯塔画面、站点 / 巨物材质向 1NKWJK 封面靠、工业废墟站点、砂石 / 土路与搓板、鱼影、天气剩余项（雷声延迟、热浪、尘卷风），然后做独立视觉评审（目标均分 ≥ 3.5）
5. 合入后跑门禁，再把“截图门禁全绿”的标记往前推（历史上本地 `main` 停在 `55e8b38`，已落后）

仍然只用 HTML5 + Three.js，自我迭代，定期提交。

## 5. 还需要用户本人确认的事

- `docs/DESIGN_V2.md` 第 2 章的暂定答案尚未由用户确认。
- 还没有真人试驾。
- 房车车头的铁丝网和尖木桩是否保留（参考图里有，但这个世界没有敌人；设计上已做成可单独关掉的一组）。

## 6. 安全与版权约束

- 不要把 `refs/rv-reference/` 下的参考图、`refs/artstation-1NKWJK/cover.webp`、以及私有迁移包里的第三方工程推到公开仓库。
- 不要把 API 密钥、GitHub token、`.env`、Claude 会话日志、本机凭据提交进仓库。本快照扫描时未发现这类密钥文件。
- 本项目目前没有许可证文件。在决定开源协议之前，不要假设他人可以任意再分发。
- 原私有仓库 `FilthyFrost/the-long-way` 应保持私有，不要为了“省事”直接改成公开——那会把完整 git 历史一次性暴露出去。推荐使用本干净快照作为新的公开仓库起点。
