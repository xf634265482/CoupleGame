# 260603 UI 入口与微信真机资源（功能说明）

> 本目录记录 **UI 美术接入、大厅/棋盘视觉、微信分包真机补丁** 等近期改动。玩法与云函数仍以战斗改版规格为准。

## 本版本已交付（客户端）

| 功能 | 说明 | 主要代码 |
|------|------|----------|
| `resources` 美术包 | UI 图统一放 `assets/resources/art/ui/`，运行时 `resources.load` / 缓存 | `assets/scripts/ui/UiAssets.ts` |
| 场景背景 | 大厅 / 房间 / 棋盘自动铺 `bg_lobby`、`bg_room`、`bg_board` | `SceneUiBackground.ts`、`LobbyController.ts`、`BoardController.ts` |
| 进大厅前加载分包 | 微信须先 `loadSubpackage('resources')` 再 `loadBundle`；失败不进大厅 | `GameApp.ts`、`UiAssets.ensureResourcesBundle` |
| 棋盘 UI 布局 | 横版侧栏按钮、战斗日志区高度可配；格子面**不**再叠字 | `BoardUiLayout.ts`、`BoardView.ts`、`BoardSidePanel.ts` |
| 格子说明 | 右侧 **说明** 按钮 → 可滚动弹窗（左图标 + 右文案） | `BoardCombatUi.showCellGuide` |
| 微信横屏与安全区 | 设计分辨率与安全区适配 | `ViewAdapt.ts`、`WxLandscape.ts` |
| 微信昵称输入 | 大厅昵称走平台输入能力 | `WxGameNameInput.ts` |
| 构建后自动 patch | Cocos 构建微信包后执行分包搬迁与 `engine-adapter` 补丁 | `scripts/patch-wechatgame-config.js`、扩展 `wechatgame-post-patch` |

## 本版本已交付（构建 / 真机）

| 项 | 说明 | 文档 |
|----|------|------|
| resources 微信分包 | Cocos 将 `assets/resources` 打成小游戏分包 | `assets/resources.meta` |
| Post-build patch | 主包 stub：`config.json` + `import/`；分包保留 `native/`；引擎读主包 config、重写 import URL | `.cursor/rules/cocos-wechatgame-subpackage.mdc` |
| 真机资源 probe | 日志 `[UiAssets] probe ok bg_lobby` 表示大厅背景可加载 | 规则文件 §发布流程 |

## 资源与接入进度

- 资源清单、尺寸、目录约定：**[`ui-asset-checklist.md`](./ui-asset-checklist.md)**
- 已落地背景 / 格子图 / 部分图标见 checklist 勾选与 `assets/resources/art/ui/`
- 大厅按钮、面板 9-slice 等仍为 checklist 待办项（代码可先用色块）

## 构建与预览（每次）

1. Cocos → 构建 **wechatgame**
2. `node scripts/patch-wechatgame-config.js`（或启用扩展 `wechatgame-post-patch` 自动执行）
3. 微信开发者工具导入 **`build/wechatgame`** → 清缓存 → 预览 / 真机调试

## 外出与他人联测（不依赖预览二维码）

见 **[`mobile-testing.md`](./mobile-testing.md)**（体验版上传、体验成员、小程序助手）。

## 相关规格（玩法 / 联调，非本目录）

| 文档 | 用途 |
|------|------|
| `specs/260529-combat-board-game-rework/design.md` | 战斗棋盘玩法、格子类型、AC |
| `specs/260529-combat-board-game-rework/dual-device-debug.md` | 双开开发者工具联调步骤 |
| `specs/260529-combat-board-game-rework/acceptance-checklist.md` | 验收勾选 |
| `specs/260526-online-party-board-game/` | 初版联机大厅 / 云函数设计 |

## 文档同步状态（2026-06）

| 内容 | 已写入 |
|------|--------|
| UI 资源清单与微信包体 / 真机报错 | `ui-asset-checklist.md` |
| 分包 patch 规则（勿改坏） | `.cursor/rules/cocos-wechatgame-subpackage.mdc` |
| 自动 patch 扩展 | `extensions/wechatgame-post-patch/README.md` |
| 本版本功能总览 | 本文 `README.md` |
| 外出联测 | `mobile-testing.md` |
| 根目录文档地图 | `README.md` §文档索引 |
| 战斗玩法细节 | **未**改 `260529/design.md`（UI 属表现层，玩法文档仍有效） |
