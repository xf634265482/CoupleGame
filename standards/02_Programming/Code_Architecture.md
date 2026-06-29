# Code_Architecture — 代码架构

## Purpose

锁定《命运之塔》客户端 + 云端架构骨架，让所有模块在同一层级语义下生长。

## Standards

### 1. 客户端分层

```
assets/scripts/
├── core/              # 全局服务（GameApp / SceneLoader / EventBus / Constants）
├── platform/          # 平台适配（微信 / H5）
├── network/           # 与云端交互（CloudService / PveService / ...）
├── ui/                # UI 基础组件
├── audio/             # 音频
├── pve/               # 命运之塔 PVE 主模块
│   ├── core/          # ★ 纯逻辑层 — 零框架依赖、纯函数、可单测
│   ├── controllers/   # 控制层 — 状态机 / 流程 / 服务调用
│   ├── views/         # 视图层 — UI 渲染 + 动效
│   └── types/         # 类型与常量
├── lobby/ board/ settlement/   # 历史 PVP（冻结，不扩展）
└── types/             # 全局类型
```

### 2. 三层规则（pve/）

| 层 | 允许依赖 | 禁止 |
|----|--------|------|
| `core/` | 纯 TS / 自身 | `import 'cc'` / `Math.random()` / 网络 / DOM / Time API |
| `controllers/` | core + network + EventBus + cc | 直接操作 view 节点 |
| `views/` | controllers + cc + UI 工具 | 直接发请求 / 写玩法逻辑 |

> 任何"AI 想给 core 加一个 cocos 调用"的行为视为违规（违反 PROJECT_CONTEXT P5 + R7）。

### 3. 云端结构

```
cloudfunctions/
├── common/            # ★ 唯一源 ★ 共享代码
├── login/ room/ match/ game/ initDb/ scheduler/   # 历史
├── pve/               # 命运之塔云端
└── <each>/common/     # ⚠️ sync 副本，禁止编辑
```

详见 `CLAUDE.md` 关于 sync 脚本的说明。

### 4. 状态权威

| 数据 | 权威 |
|------|------|
| 玩家单局战斗状态 | 客户端 `core/`（纯模拟） |
| 单局结束结果 | 云端校验回放 |
| 元进度（命运树 / 章节解锁 / 永久遗物） | 云端 |
| 商城 / 抽奖 / 货币 | 云端 |
| 配置数据 | 云端 + 客户端缓存 |

### 5. 通信约定

- 所有云函数调用走 `CloudService.callFunction`
- 不同模块的 service 文件分开（`PveService.ts` / `LobbyService.ts`）
- 请求必须有超时保护与错误兜底
- 不在 UI 层裸调云函数

### 6. 事件总线

- 跨模块通信走 `EventBus`，事件名常量定义在 `core/Constants.ts`
- 事件命名 `module:action`（如 `pve:cell-entered`）
- 不允许字符串字面量直接当事件名

## Examples

### 正确
> 战斗一格判定走 `pve/core/CellResolver`（纯函数）→ controller 调用 → view 播动效

### 错误
> 直接在 `views/FogMapView.ts` 里 `Math.random()` 决定是否怪物出现 → 违反 §2 + R3

## AI Notes

- 不论 AI 觉得多"方便"，都不能跨层调用
- 改架构必须先开会（写 spec），不在单一 PR 里"顺手重构"

## Checklist

- [ ] 改动遵循 §2 三层规则
- [ ] core/ 没有 cc / Math.random
- [ ] 云函数走 CloudService
- [ ] 事件名常量化
