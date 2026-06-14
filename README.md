# CoupleGame

微信小游戏 · 线上派对棋 · Cocos Creator 3.8.8 + 微信云开发

## 开发分工（重要）

| 做什么 | 用什么 |
|--------|--------|
| 游戏场景、UI、脚本 | **Cocos Creator**（主工程，日常只开这个） |
| 构建微信包 | Cocos → 构建发布 → 微信小游戏 |
| 预览、云数据库、上传云函数 | **微信开发者工具**（辅助，不用在这里写游戏） |

## 快速开始

### 一、你需要亲自做的（约 15 分钟，仅一次）

这些步骤需要你的微信账号，AI / 脚本无法代劳：

1. **注册小游戏并拿到 AppID**
   - 打开 [微信公众平台](https://mp.weixin.qq.com/) → 小程序/小游戏
   - 创建小游戏，复制 **AppID**（形如 `wx...`）

2. **开通云开发**
   - 安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
   - Cocos 先 **构建一次** 微信小游戏（见下方「Cocos 构建」）
   - 开发者工具 → 导入项目 → 选择本仓库根目录（或 `build/wechatgame`，见 note）
   - 顶部 **云开发** → 开通 → 创建环境 → 复制 **环境 ID（envId）**

3. **填写本地配置**
   - 复制 `config/wechat.local.json.example` → `config/wechat.local.json`
   - 填入 `appId` 和 `cloudEnvId`
   - 编辑根目录 `project.config.json`，把 `"appid"` 改成你的 AppID

4. **（可选）首次上传云函数占位**
   - 开发者工具 → 云开发 → 云函数 → 右键 `login` 等 → 上传并部署
   - 此时仍是 stub，Task 1.5 起会写真实逻辑

> **导入目录说明**：根目录 `project.config.json` 的 `miniprogramRoot` 指向 `build/wechatgame/`。  
> 若尚未构建，可先导入 `build/wechatgame`（构建后生成）；云函数目录仍在仓库根 `cloudfunctions/`。

### 二、已在仓库里准备好的（Task 1.1）

- `project.config.json` — 微信项目配置（含 `cloudfunctionRoot`）
- `cloudfunctions/` — login / room / match / game / scheduler 占位云函数
- `specs/260526-online-party-board-game/` — 设计、计划、任务文档
- `config/wechat.local.json.example` — 本地密钥配置模板

### Cocos 构建

1. Cocos Creator 打开本工程
2. **项目 → 构建发布** → 平台选 **微信小游戏**
3. 填入 AppID → 构建
4. 输出目录默认 `build/wechatgame/`
5. 构建后执行（或启用扩展 `wechatgame-post-patch` 自动执行）：

```bash
node scripts/patch-wechatgame-config.js
```

真机资源与分包细节见 `.cursor/rules/cocos-wechatgame-subpackage.mdc`。

### Cocos 首场景

1. Cocos Creator 打开工程
2. **项目 → 项目设置 → 项目数据 → 默认场景** 选 `assets/scenes/bootstrap`
3. 打开 `bootstrap` 场景，确认 Canvas 上已挂 **GameApp** 组件（可选：拖 Label 到 statusLabel）

### 部署云函数

修改 `cloudfunctions/common/` 后，先同步再部署：

```bash
node scripts/sync-cloud-common.js
```

然后在微信开发者工具右键对应云函数 → **创建并部署：云端安装依赖**。

**login 控制台测试**（无 OPENID 时）参数示例：

```json
{"testOpenId": "test-user-001", "nickname": "测试玩家"}
```

正式环境从小游戏 `wx.cloud.callFunction` 调用时会自动带真实 OPENID，无需 `testOpenId`。

## 目录结构（目标）

```
CoupleGame/
├── assets/              # Cocos 资源与脚本（主开发目录）
├── cloudfunctions/      # 微信云函数
├── build/wechatgame/    # Cocos 构建输出（gitignore）
├── config/              # 本地微信配置（wechat.local.json 勿提交）
├── specs/               # 需求 / 计划 / 任务
└── project.config.json  # 微信开发者工具配置
```

## 文档索引（游戏说明在哪）

| 你想查什么 | 路径 |
|------------|------|
| **项目入门、构建、云函数** | 本文件 `README.md` |
| **联机派对初版：设计 / 计划 / 任务** | `specs/260526-online-party-board-game/`（`design.md`、`plan.md`、`tasks.md`） |
| **战斗棋盘改版：玩法、验收、双端联调** | `specs/260529-combat-board-game-rework/`（`design.md`、`acceptance-checklist.md`、`dual-device-debug.md`） |
| **UI 美术接入、大厅/棋盘视觉、真机分包（当前版本）** | `specs/260603-ui-entry/README.md`、`ui-asset-checklist.md` |
| **出门联测、不用预览二维码** | `specs/260603-ui-entry/mobile-testing.md` |
| **微信构建 patch 规则（防改坏）** | `.cursor/rules/cocos-wechatgame-subpackage.mdc` |
| **云数据库与索引** | `cloud/database/`、`specs/*/ddl-sql.md` |
| **云函数 common 同步** | `cloudfunctions/common/README.md` |

当前 **UI / 真机资源** 迭代说明以 `specs/260603-ui-entry/README.md` 为准；**棋盘规则与 AC** 仍以 `specs/260529-combat-board-game-rework/design.md` 为准。

## 任务进度

- 初版联机：`specs/260526-online-party-board-game/tasks.md`
- 战斗改版：`specs/260529-combat-board-game-rework/tasks.md`
