# CoupleGame — AI 协作指南

微信小游戏 · Cocos Creator 3.8.8 + 微信云开发。两套独立玩法：

- **PVP**：联机派对棋盘对战（云端权威）。设计主文档 `specs/260529-combat-board-game-rework/design.md`
- **PVE**：单人「命运远征」迷雾爬塔（客户端模拟 + 云端校验）。设计主文档 `specs/260608-pve-destiny-expedition/design.md`

两套玩法互不覆盖，改动只影响一侧。

## 目录心智模型

```
assets/scripts/        # 客户端 TS（~81 文件），按模块分
  core/                # GameApp / SceneLoader / EventBus / Constants
  network/             # CloudService / GameService / LobbyService / PveService
  lobby/  board/  settlement/   # PVP 流程
  pve/                 # PVE 模块（core 纯逻辑 + controllers + views）
  ui/  audio/  platform/  game/  types/

cloudfunctions/        # 云函数
  common/              # ★ 共享源码的唯一权威源 ★
  login/ room/ match/ game/ pve/ initDb/ scheduler/
    └─ common/         # ⚠️ 自动同步的副本，禁止直接编辑（见下）

specs/                 # 真正的需求/计划/AC 文档（按迭代分目录）
test/pve/              # PVE 客户端 ts-jest 单测（不在 assets/，避免被打进游戏包）
shared/                # 前后端共享类型（protocol.ts）
scripts/               # 构建/同步脚本
```

## ⚠️ 最大的坑：cloudfunctions/common 同步副本

**`cloudfunctions/common/` 是唯一源头。** 它被 `node scripts/sync-cloud-common.js` 复制到 7 个子目录下的 `cloudfunctions/{login,room,match,game,pve,initDb,scheduler}/common/`，因为微信部署单个云函数时不会带兄弟目录。

- ✅ **改 `cloudfunctions/common/<file>.js`，然后跑 `node scripts/sync-cloud-common.js`**
- ❌ 改 `cloudfunctions/game/common/<file>.js`（会被下次 sync 覆盖）
- 🔍 **Grep 时排除副本**：`--glob '!cloudfunctions/*/common/**'` 或路径只搜 `cloudfunctions/common/`。否则会命中 8 份同名文件。

副本文件清单见 `scripts/sync-cloud-common.js` 顶部数组。

## 常用命令

```bash
npm test                            # 全部 jest（含 cloudfunctions/common/__tests__）
npm run test:pve                    # PVE 客户端单测（test/pve/）
node scripts/sync-cloud-common.js   # 改 cloudfunctions/common/ 后必跑
node scripts/patch-wechatgame-config.js  # Cocos 构建后跑（细节见 .cursor/rules/cocos-wechatgame-subpackage.mdc）
```

云函数 jest 在 `cloudfunctions/common/`：`cd cloudfunctions/common && npm test`。

## 玩法改动 → 必须同步设计文档

- 改 PVP 玩法代码（`Constants.ts` / `GameEngine.js` / `CellResolver.js` / `ShopResolver.js` / `CombatResolver.js` 等）→ 同步 `specs/260529-combat-board-game-rework/design.md`
- 改 PVE 玩法代码（`assets/scripts/pve/core/**` / `cloudfunctions/common/pve/**`）→ 同步 `specs/260608-pve-destiny-expedition/design.md`

详细约束见 `.cursor/rules/gameplay-design-doc.mdc` 与 `.cursor/rules/pve-module.mdc`（Cursor 规则，Codex 不会自动读，需要时手动 Read）。

## 工程约定

- UI 用代码构建，不依赖 prefab；命名 `XxxController.ts`（`@ccclass`）/ `XxxView.ts`（普通类）/ `xxxLayout.ts`（工具）
- 不用 enum，用 `as const` 对象或字面量联合；私有字段 `_` 前缀；`import type` 引类型
- 错误处理：`err instanceof Error ? err.message : String(err)`；并发输入用 `_busy` 守卫
- 复用 `SceneLoader` / `GameSession` / `EventBus` / `CloudService.callFunction` / `UiAssets`
- PVE `core/` **零框架依赖**：禁止 `import 'cc'`、禁止直接 `Math.random()`（用 `core/rng.ts`）

## 微信真机/构建相关

每次重大改动后的真机发布流程、主包 4MB 红线、`UiAssets` critical native 清单规则 —— 全部见 `.cursor/rules/cocos-wechatgame-subpackage.mdc`（"2026-06 真机 UI/BGM 事故复盘"那节是必读）。

## 代码导航规则（必须遵守）

1. **定位功能时，优先阅读 `PROJECT_NAVIGATION.md`**，通过系统列表找到入口文件，再打开代码。
2. **理解调用链时，优先查 `CALL_FLOW.md`**，找到对应操作的完整执行路径。
3. **修改代码时，从导航指定的入口文件开始，逐层向下追踪**，不要从中间层切入。
4. **除非导航无法定位，否则禁止全项目全文搜索**（`grep -r` 整个 `assets/` 或 `cloudfunctions/`）。
5. **如果发现导航文档指向的入口不准确或缺失**，先更新 `PROJECT_NAVIGATION.md` / `CALL_FLOW.md`，再继续开发。

## 文档入口（按问题查）

| 想查什么 | 去哪里 |
|----------|--------|
| **系统入口 / 文件职责** | `PROJECT_NAVIGATION.md` |
| **操作的完整调用链** | `CALL_FLOW.md` |
| **开发规则 / 常见陷阱** | `DEVELOPMENT_GUIDE.md` |
| 项目入门 / 构建 / 云函数部署 | `README.md` |
| PVP 玩法规则 / AC / 双端联调 | `specs/260529-combat-board-game-rework/` |
| PVE 玩法规则 / AC / 数值 | `specs/260608-pve-destiny-expedition/` |
| 大厅 UI / 真机分包 | `specs/260603-ui-entry/` |
| 命运树（PVE 元进度 UI） | `specs/260610-destiny-tree-ui/` |
| 云数据库 / 索引 | `cloud/database/`、各 spec 的 `ddl-sql.md` |
| 各 specs 索引（按主题） | `README.md` 底部"文档索引"表 |

## 给自己的提醒

- 看到 8 份同名云函数文件 → 只信 `cloudfunctions/common/`
- 改了 `cloudfunctions/common/**` → 提醒用户跑 sync 脚本
- 改 PVE/PVP 玩法 → 主动询问是否同步对应 design.md
- specs/ 已有的 design.md 就是当前的"代码地图"，不要再造 PROJECT_MAP.md 类文档
