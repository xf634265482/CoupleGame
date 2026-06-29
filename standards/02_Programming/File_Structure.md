# File_Structure — 文件结构

## Purpose

为代码 / 资源 / 文档定义可预测的位置。新文件 90% 的归属应能"凭直觉"找到。

## Standards

### 1. 顶层

```
CoupleGame/
├── assets/                    # Cocos 资源 + 客户端代码
├── cloudfunctions/            # 微信云函数
├── shared/                    # 前后端共享类型
├── specs/                     # 设计文档（按迭代）
├── standards/                 # AI 开发规范库（本目录）
├── art_pipeline/              # AI 美术生产 pipeline
├── scripts/                   # 构建 / 同步脚本
├── test/                      # 客户端单测（独立于 assets）
├── build/                     # 构建产物（gitignore）
├── library/                   # Cocos 缓存（gitignore）
└── settings/ config/ profiles/  # Cocos 项目元
```

### 2. 客户端 `assets/scripts/`

```
core/        — 全局服务
platform/    — 平台适配
network/     — 与云端通信
ui/          — UI 基础
audio/       — 音频
pve/         — 命运之塔主模块
  core/        纯逻辑
  controllers/ 控制层
  views/       视图
  types/       类型
lobby/ board/ settlement/  — 历史 PVP（冻结）
types/       — 全局类型
```

### 3. 资源 `assets/resources/`

```
art/
  ui/
    backgrounds/    — 大背景
    pve/
      hud/          — 战斗 HUD
      map/          — 地图实体 / Tile
      panel/        — 弹窗 / 面板
    common/         — 跨模块通用
audio/
  bgm/
  sfx/
prefab/             — 不推荐用 prefab（代码构建优先）
```

### 4. 测试

- 客户端：`test/pve/` 用 ts-jest
- 云端：`cloudfunctions/common/__tests__/` 用 jest
- 不在 `assets/` 内放测试

### 5. 文档

- 项目级入门：`README.md` `CLAUDE.md` `DEVELOPMENT_GUIDE.md`
- 导航：`PROJECT_NAVIGATION.md` `CALL_FLOW.md`
- 规范：`standards/` ← 本目录
- 迭代设计：`specs/<date>-<slug>/design.md`
- 美术 pipeline：`art_pipeline/README.md`

### 6. 新文件放哪

| 文件类型 | 默认位置 |
|---------|---------|
| PVE 玩法纯逻辑 | `assets/scripts/pve/core/` |
| PVE UI | `assets/scripts/pve/views/` |
| PVE 控制 | `assets/scripts/pve/controllers/` |
| PVE 云端逻辑 | `cloudfunctions/common/pve/` + `cloudfunctions/pve/` |
| 共享类型 | `shared/protocol.ts` |
| 新资源 | `art_pipeline/generated/` → 审核 → `assets/resources/art/` |
| 新文档 | 按主题归 `specs/` 或 `standards/` |

### 7. 不允许

- ❌ 在 `assets/` 顶层放散文件
- ❌ 在 `pve/core/` 放 view
- ❌ 跨模块 import（pve 不导入 lobby/）
- ❌ 直接写 `cloudfunctions/pve/common/`

## Examples

### 正确
```
assets/scripts/pve/core/CellResolver.ts
assets/scripts/pve/views/FogMapView.ts
cloudfunctions/common/pve/resolver.js
```

### 错误
```
assets/scripts/CellResolver.ts          ❌ 平铺
assets/scripts/pve/views/CellResolver.ts ❌ 放错层
cloudfunctions/pve/common/resolver.js   ❌ 改副本
```

## AI Notes

- 新建文件前先在 `PROJECT_NAVIGATION.md` 查最相近文件，看它在哪
- 如果犹豫归属，开会问，不要"先放着"

## Checklist

- [ ] 新文件按 §6 表归位
- [ ] 没碰 cloudfunctions 副本
- [ ] PVE / 历史 PVP 不混
