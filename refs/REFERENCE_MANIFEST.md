# 第三方参考资料清单（公开仓库只保留来源，不上传原图 / 原工程）

这些材料只供本机学习与对标，**不要**推到公开 GitHub。原项目的 `.gitignore` 已经排除了图片和第三方工程。本清单纯记录来源、本机文件名和用途，方便换电脑后重新取用。

完整的本机参考图和第三方工程在**不进 GitHub** 的迁移包里：

- 目录：`/workspace/the-long-way-private-migration/`
- 压缩包：`/workspace/the-long-way-private-migration.tar.gz`

把压缩包解到游戏仓库根目录后，下列相对路径应能对上。

## 1. 房车外观参考（禁止上传）

- 作者 / 作品：Chris Bennett，《Camper-Van Vehicle set dressing and cutaway》
- 官方页面：https://chrisbennettt.artstation.com/projects/d03WrJ
- 用途：房车外观建模的指定参考。内饰、通道、驾驶室由项目自行设计，不照抄剖面里的布置。
- 版权：归原作者。仅限本机参考，不入库、不上传。
- 本机目录：`refs/rv-reference/`（说明文件 `README.md` 已在公开导出中）

| 本机文件 | 实际规格 | 内容 |
| --- | --- | --- |
| `chris-bennett-van-fin.jpg` | 3840×2806 JPEG，约 1.2 MB | 上色成品：右前方外观、左后方剖面、手套箱特写 |
| `chris-bennett-van-lineart.jpg` | 3840×2806 JPEG，约 1.0 MB | 外观 + 剖面 + 手套箱线稿合图 |
| `chris-bennett-lineart1.jpg` | 2569×2027 JPEG，约 453 KB | 外观线稿 |
| `chris-bennett-lineart2.jpg` | 2569×2027 JPEG，约 617 KB | 剖面线稿 |
| `chris-bennett-3d-model-van.jpg` | 894×583 JPEG，约 29 KB | 白模（这张本机副本偏小，不是 4K） |

取图说明：ArtStation 页面和 JSON 对普通 curl 常返回 Cloudflare 403，但 `cdna.artstation.com` / `cdnb.artstation.com` 上的图片一般可以直接下载。若地址里是 `/large/`，改成 `/4k/` 有时能拿到 4K 版。换电脑后若要补图，优先打开上面的官方页面，或直接使用私有迁移包里的文件。

## 2. 画面风格封面（禁止上传）

- 作者 / 作品：Junwoo Park，《Overgrown Facility - UE5》
- 官方页面：https://www.artstation.com/artwork/1NKWJK
- 用途：吉卜力式手绘风格的画面对标（奶油白墙、青绿金属、锈、藤蔓等）。画廊其余图当时未能抓取，先用封面。
- 版权：归原作者。仅限本机参考，不入库、不上传。
- 本机文件：`refs/artstation-1NKWJK/cover.webp`（1670×1253 WEBP，约 331 KB）
- 说明文件 `refs/artstation-1NKWJK/README.md` 已在公开导出中。

## 3. Painted Valley（第三方风格研究工程，默认不进公开仓）

- 官方源码 / 文件页：https://patch.gg/blendi/painted-valley/files
- 用途：研究着色器、光照、草地、天空、雾、调色和后处理；美术规格见 `specs/art/STYLE.md`。只学习技术，不要原样复制受版权保护的资源。
- 许可证（工程自述）：代码主要为 MIT，仓库内多数美术为 CC0；部分环境音不在源码仓中（见其 `LICENCE-NOTES.md` / `MISSING_ASSETS.md`）。
- 本机位置（仅私有迁移包）：`refs/painted-valley/`、`refs/painted-valley-zip/painted-valley-1.1.1.zip`
- 已进入公开快照的风格对标图（原私有仓已经跟踪）：`refs/targets/painted-valley/*.jpg`。它们来自该演示的静帧，许可证按 Painted Valley 自述为 CC0，但仍建议保留来源说明。

## 4. 世界观氛围（只参考气氛，不跟画面风格）

- Simon Stålenhag：https://www.simonstalenhag.se/new/es.html
- 早期提示里还有：https://www.simonstalenhag.se/new/other.html
- 只参考巨物、废弃科技与自然共存的超现实感，渲染仍以 Painted Valley 与 1NKWJK 为准。

## 5. 权威设计文档（已是公开仓库，可直接克隆）

- https://github.com/FilthyFrost/the-long-way-design
- 本地快照：`docs/upstream/GAME_DESIGN.md`（提交 `b46194ed58fc1bbe41d0a8cbcff393c46bf35e10`）
- 游戏节奏、系统与目标以这份大纲为准；实现方案以 `docs/DESIGN_V2.md` 为准；美术以 `specs/art/STYLE.md` 为准。

## 6. 玩法对标（无需下载原游戏资源）

驾驶与车辆系统：Drive Beyond Horizons、Arctic Drive、Pacific Drive、Nomad Drive、OUTBOUND。

世界与活动：设计文档和 `.go5.txt` 中列出的钓鱼、做菜、生存、狩猎、照相、建造等对标游戏。不要把那些游戏的素材上传到本仓库。
