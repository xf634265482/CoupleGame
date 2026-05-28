# 线上派对棋 计划决策记录

> 记录 AI 在制定开发计划时的思考过程。
> **核心用途**：帮助团队发现 harness 上下文的信息缺口，持续优化 AI 编码体验。
>
> 生成时间：2026-05-26

---

## 代码探索日志

| # | 探索目标 | 搜索方式 | 找到的关键文件 | 信息来源 | 难度 |
|---|---------|---------|--------------|---------|------|
| 1 | 设计文档与 AC | 读取 specs 目录 | `specs/260526-online-party-board-game/design.md`、`decisions.md` | 用户前序 requirement-design 产出 | 直接找到 |
| 2 | 项目根配置 | Glob `package.json`、`tsconfig.json` | `package.json`（Cocos 3.8.8）、`tsconfig.json` | 手动搜索 | 直接找到 |
| 3 | 客户端业务代码 | Glob `assets/**/*.{ts,js}` | **0 文件** | 手动搜索 | 直接找到（空） |
| 4 | 场景与资源 | Glob `assets/**` | 仅 `assets/couple.scene` + meta | 手动搜索 | 直接找到 |
| 5 | 引擎与构建配置 | 读取 `settings/v2/packages/` | `engine.json`（2D、websocket 未启用）、`builder.json`（占位） | 手动搜索 | 直接找到 |
| 6 | 项目文档 / harness | Glob `CLAUDE.md`、`README.md` | **不存在** | 手动搜索 | 直接找到（缺失） |
| 7 | 服务端代码 | Glob `server/**` | **不存在** | 手动搜索 | 直接找到（空） |
| 8 | 微信构建配置 | Grep `wechat`、`mini-game` | 仅出现在 design.md，仓库无构建 profile | 手动搜索 | 多次搜索 |
| 9 | npm 依赖 | 读 `package.json` | 无 dependencies、无 node_modules | 直接读取 | 直接找到 |

---

## 实现决策

| ID | 决策主题 | 备选方案 | 最终选择 | 决策理由 |
|----|---------|---------|---------|---------|
| PD1 | 后端技术栈（T6） | 微信云开发 / Node.js / Go | **微信云开发**（云函数+云数据库+定时器） | 用户审核确认；免自建服与域名备案 |
| PD1-old | ↑ 初版 plan | Node.js 自建服 | — | **已替换为 PD1** |
| PD2 | 对局状态存储 | 云数据库 / Redis / MySQL | **云数据库 collections**（rooms/games/match_queue/users） | 与云开发一体；games 运行时文档，无 history 表 |
| PD3 | 通信方式 | callFunction+watch / WebSocket / 轮询 | **callFunction 写 + db.watch 推** | 云开发标准模式；无需 WSS 域名 |
| PD4 | 匹配策略（T1） | 满员才开 / 15s / 30s / 60s | **30 秒单队列，≥2 人开局** | 落实 design 待确认默认值；兼顾情侣 2 人 |
| PD5 | 局内金币（T2） | 不允许负 / 允许负 | **允许负数** | 厄运与随机格实现简单，与 design 建议一致 |
| PD6 | 平局（T3） | 第三排序 / 显示平局 | **显示平局** | 首版 UI 成本最低 |
| PD7 | 吹牛后回合（T4） | 触发者继续 / 下家继续 | **下家继续** | 触发者本回合落点事件已消耗 |
| PD8 | 吹牛断线（T5） | 单独处理 / 等同退出 | **等同棋盘退出，整局结算** | 与 D24 一致，首版无重连 |
| PD9 | 服务端目录 | `server/` / `cloudfunctions/` | **`CoupleGame/cloudfunctions/`** | 微信云开发标准目录；common 共享游戏逻辑 |
| PD10 | 客户端目录约定 | 平铺 scripts / 分模块 | **`assets/scripts/{core,network,platform,lobby,game,settlement}`** | Cocos 3.8 常规；对齐 design 模块划分 |
| PD11 | 场景划分 | 单场景 / 多场景 | **多场景**：lobby、board、minigame_bluff、settlement | 降低单场景复杂度 |
| PD12 | 实时推送 | WebSocket / db.watch | **云数据库 watch** | 云开发选型下不需要 engine websocket |
| PD15 | 对局历史表 | 做 / 不做 | **首版不做** | 用户审核确认；仅 users.diamond 持久化 |
| PD13 | 主键生成 | DB 自增 / 应用层雪花 | **应用层雪花 ID** | 遵循 design 与项目规范 |
| PD14 | 吹牛 UI 形态 | 独立场景 / Board 弹层 | **独立场景（或 Board 全屏 Modal）** | 便于 MINIGAME 阶段切换；实现时二选一 |

---

## 上下文缺口

| # | 缺失的上下文 | 实际查找方式 | 耗费的额外动作 | 建议补充到 |
|---|------------|-----------|--------------|----------|
| 1 | 项目结构说明、构建步骤 | Glob 找 README/CLAUDE.md → 不存在 | 全目录 Glob + 读 engine.json 推断 | 根目录 `README.md` + `CLAUDE.md` |
| 2 | 客户端脚本目录约定 | assets 仅 1 个 scene，无 scripts | Subagent 全量探索 | `CLAUDE.md` §目录结构 |
| 3 | 微信 AppID / 合法域名 | 仓库无配置 | 读 design + grep wechat | `README.md` §联调环境变量 |
| 4 | 是否已有后端或云开发账号 | 无 server 目录 | Glob server/** | `decisions.md` 或 README |
| 5 | Cocos 启动场景配置 | profiles 被 gitignore | 读 couple.scene 推断 | README：首场景设置步骤 |
| 6 | engine 模块裁剪（websocket） | 读 engine.json | 手动打开 JSON | CLAUDE.md §引擎模块 |
| 7 | API 契约 / 协议定义 | 无 api-registry | 从 design 推导并写入 plan.md §4 | `shared/protocol.ts` + CLAUDE.md 链接 |
| 8 | 美术/UI 规范 | 无 | 无法找到 | 后续 `rules/biz/ui-style.md`（可选） |

---

## Harness 改进建议

1. **在仓库根目录新增 `CLAUDE.md`**：说明 CoupleGame 为 Cocos 3.8.8 微信小游戏、目录约定、`assets/scripts` 模块划分、后端在 `cloudfunctions/`、规格文档在 `specs/`。
2. **新增 `README.md`**：微信开发者工具导入路径、Creator 构建步骤、云开发 envId 配置、云函数上传命令。
3. **创建 `shared/protocol.ts`**：REST/WS 类型与 design AC 对照表，client/server 同步引用，避免 plan 与实现漂移。
4. **在 `.gitignore` 例外或文档中记录**：哪些 `profiles/` 构建配置需要团队共享（如微信 build 模板），减少「仓库里找不到 wechat 配置」的反复探索。
5. **首迭代后补充 `rules/coding/cocos-ts.md`**：@ccclass 命名、禁止客户端权威随机、Scene 切换模式等项目约定，因当前无任何可参考的既有代码模式。
