# 自主迭代协议（LOOP）

本文件是每一轮迭代的工作规程。新会话开始时先读这里，再读 `loop/backlog.md` 和 `loop/scoreboard.json`，然后直接接着干，不需要等人确认。

技术栈固定为 **HTML5 + Three.js + TypeScript + Vite**（不要引入其他引擎）。方案全文在 artifact「后末日公路旅行游戏 · 方案 v0.1」，本地摘要见 `docs/PLAN.md`。

## 每一轮

1. 读 `loop/backlog.md`，取最靠前、未阻塞的一项。
2. 写一句假设（改什么 → 预期哪个指标怎么变）。
3. 小步实现，单一目的。
4. `npm run check`（类型）+ `npm test`（Node 仿真门禁）。失败自修，最多 3 次。
5. 涉及画面：`npm run shots`，自己看截图（Read 工具），对照 `specs/art/rubric.md`。
6. `npm run measure && node harness/judge/judge.mjs --record "本轮说明"` 更新记分板。
7. 指标变好且无回归 → `git commit`；否则 `git checkout .` 回滚，并在报告里记下失败的假设。
8. 在 `loop/reports/` 写或追加当日报告（改了什么、数据、截图路径、下一步）。
9. 同一项连续 3 轮无进展 → 在 backlog 标 `[需要人]`，写清问题，换下一项。

## 规则

- `specs/` 是目标，不许为了过关放宽。确实要改（目标本身不合理）必须在 `specs/CHANGELOG.md` 写明理由。
- `src/core/` 不许依赖 three、DOM、`src/game/`（有测试把关）。所有玩法相关的生成必须确定性。
- 视觉评审用独立上下文（子智能体）只看截图和评分表，不看代码。
- 截图在这台机器上是软件渲染：像素有效，帧率无效。性能结论只认真实显卡上的 `?bench=1`。
- 分支：日常提交在 `dev/m1`；全部门禁为绿时把 `main` 指到该提交（`main` 永远是最近一个绿色版本）。
- 里程碑完成时，更新方案 artifact 顶部的「开发进度」表和迭代日志。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 本地运行（http://127.0.0.1:5173） |
| `npm run check` | TypeScript 类型检查 |
| `npm test` | Node 仿真门禁（Vitest） |
| `npm run measure` | 跑全部无头测量，写 `loop/metrics/*.json` |
| `npm run judge` | 对照规格卡打印结果、更新 `loop/scoreboard.json` |
| `npm run shots` | 无头 Chrome 截图矩阵，写 `loop/shots/` |

## 网址参数（调试与测试）

`?seed=` 世界种子 · `?s=` 起始里程（米）· `?time=` 钟点（0–24）· `?weather=` 天气 · `?quality=low|med|high` · `?view=cockpit|chase` · `?auto=1` 机器人司机 · `?shot=1` 截图模式（不跑主循环，由脚本驱动）· `?bench=1` 基准模式。
