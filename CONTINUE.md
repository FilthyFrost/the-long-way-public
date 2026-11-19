# 换电脑继续开发（2026-11-18，America/Los_Angeles）

你现在看到的默认分支 `main`（`65fbcaa`，以及本文件所在的文档更新）是 **2026-11-15 的旧公开快照**，代码停在更早的 ModCar 阶段，**不要从这里接着写 V3**。

当前工程已经推送到同一仓库的其它分支。完整交接说明、用户三张美术参考图和精选游戏内截图在：

**https://github.com/FilthyFrost/the-long-way-public/blob/snapshot/2026-11-18-handoff/CONTINUE.md**

对应分支：`snapshot/2026-11-18-handoff`（提交 `9c4a5cfe44180ed25cec2d8a9ec06e1c01bdf128`，标签 `snapshot-2026-11-18`）。

## 在新电脑上怎么接着做

```bash
git clone https://github.com/FilthyFrost/the-long-way-public.git
cd the-long-way-public
git fetch --tags origin
git checkout snapshot/2026-11-18-handoff   # 读 CONTINUE.md、看截图与参考图
npm ci
# 开发请改用集成主线或未合并工作分支：
git checkout feat/v3          # fcd972b01144653a7a59980983bb444301ca7058  干净的当前主线
# git checkout v3/l1-relief  # a678efd09b670740298279792a435fcd825a5cc1  L1 地形，未合入、未自审完成
# git checkout v3/c1-game    # 827b9bdab21b0eefaf9b30274a00f402d5a21936  烹饪游戏模块，未合入
npm run dev                   # http://127.0.0.1:5173
```

需要 Node.js 20 或更新。保存时环境为 Node v24.22.1、npm 11.21.1。技术栈只能是 HTML5 + Three.js + TypeScript + Vite。

## 关键引用（push 后应与远端一致）

| 用途 | 引用 | SHA |
| --- | --- | --- |
| 完整交接快照 | `snapshot/2026-11-18-handoff` / 标签 `snapshot-2026-11-18` | `9c4a5cfe44180ed25cec2d8a9ec06e1c01bdf128` |
| 当前集成主线 | `feat/v3` | `fcd972b01144653a7a59980983bb444301ca7058` |
| L1 山与谷（未合并） | `v3/l1-relief` | `a678efd09b670740298279792a435fcd825a5cc1` |
| L2 树分支（研究已在主线，尚无新树实现） | `v3/l2-trees` | `5874c0dfb09cd711c1212d8f25ac74ec7b02a864` |
| C1 烹饪游戏模块（未合并） | `v3/c1-game` | `827b9bdab21b0eefaf9b30274a00f402d5a21936` |
| C1 工作区那一行文档的快照 | `snapshot/2026-11-18-c1-game-wip` | `d47fe2448c402542db92d5fd77322e7ee68ac627` |
| 已完成世界/植被/采集标签 | `v3-w1-worldgen` / `v3-w2-flora` / `v3-w3-forage` / `v3-n0` | 见完整 CONTINUE.md |

最高优先级是驾驶风景的地形、道路与生态视觉纠偏（现地形太平、树太简陋），不是先做钓鱼。先世界视觉，再收尾烹饪，再钓鱼。L1 脚本曾两次跑通但未主会话自审、未合入；C1 实机脚本最终 forage 分类断言失败（rc=1），不能当作完整验收。开发暂停是订阅/组织权限 403，不是代码错误；看门狗已暂停。不要降低美术目标；软件渲染截图不是目标 GPU 验收。

不要把未完成功能强行合并进 `main` 或 `feat/v3`。细节、约束、排除项和重建工作树的方法以快照分支上的 `CONTINUE.md` 为准。
