# 真机大厅冷启动加载优化设计

## 目标

微信真机冷启动下，第二段「正在加载大厅资源」读条出现起，到大厅背景与全部首屏图标齐全可点，尽量在 **15 秒以内**。

开发者工具路径保持现有速度，不因本次改动变慢或缺图。

## 问题根因

1. **读条闪一下重来**：`GameApp` 启动 overlay 走到 100% 后关闭，切到 `lobby.scene` 后 `PveLobbyController` 再开一条从低进度开始的 overlay。
2. **真机第二段误绑整包下载**：大厅首屏图（`bg_lobby` + `pve/lobby/*`）已由 `copyCriticalNativeToMain` 进主包；真机 `loadUiSprite` 走主包 native 即可。但 `_loadArt` 用 `Promise.all` 硬等 `ensureResourcesBundle()`（`wx.loadSubpackage('resources')`），冷启动常拖到数十秒。开发者工具几乎不走这条下载链，所以看起来快。
3. **大厅阻塞清单含无关图**：`PVE_LOBBY_ESSENTIAL_KEYS` 含 `bg_pve_loading_expedition`，不是进大厅关条所需。

## 约束（已确认）

| 项 | 决定 |
| --- | --- |
| 计时窗口 | C：第二段「正在加载大厅资源」→ 进大厅 |
| 关条条件 | B：图标 + `bg_lobby` 都必须就绪 |
| 进大厅后立刻点远征 | 允许短加载；必须用现有 `LoadingOverlay`，不新做加载页 |
| BGM | 可晚于大厅出现 |
| 进大厅后 | 自动后台预热营地内容 |

## 方案

大厅首屏与 `resources` 分包解耦：首屏只等主包 critical native；分包与营地在进大厅后后台预热。

### 启动 → 进大厅

1. `GameApp` 登录完成后切 `lobby.scene`（真机启动阶段仍可不阻塞等整包 `resources`）。
2. `PveLobbyController` 只用现有 `LoadingOverlay`（startup 模式）：
   - 若启动 overlay 仍在：用 `update` 续跑进度，**禁止重置到接近 0**。
   - 若已关闭：再 `show` 一次时进度从较高水位（约 0.55）起，避免「满了又从 5% 重来」。
3. 并行从主包加载并缓存首屏清单（见下）；绘制背景、Logo、导航与芯片图标。
4. 关条条件全部满足 → 进度 100% → `hide` → 露出大厅。
5. **不**把 `ensureResourcesBundle()` 放进首屏关条的关键路径。

### 首屏阻塞清单

```
backgrounds/bg_lobby
pve/lobby/logo_destiny_tower
pve/lobby/icon_chip_stardust
pve/lobby/icon_chip_stamina
pve/lobby/icon_nav_leaderboard
pve/lobby/icon_nav_relic
pve/lobby/icon_nav_expedition
pve/lobby/icon_nav_camp
```

从大厅阻塞预加载移除 `bg_pve_loading_expedition`；进远征时再用现有 `LoadingOverlay` 加载。

### 进大厅后后台预热（不挡首屏）

大厅可见后 fire-and-forget：

1. `ensureResourcesBundle()`（下载并注册 `resources` 分包）
2. 营地相关图：至少 `pve/backgrounds/bg_pve_camp`、`pve/camp/panel_camp_main_9s`（及后续营地实际用到的同批 UI）
3. 营地档案：复用/预取 `loadPveProfile`（与大厅已有 `_refreshLobbyData` 去重，避免重复打爆）；点「营地」时尽量直接展示
4. BGM：分包就绪后播放；失败静默

### 点「营地 / 远征」时预热未完

- 继续用现有 `LoadingOverlay` 短等（文案如「正在加载营地资源…」「正在进入远征…」）
- **禁止**新建第二套加载页或独立加载场景

## 主要改动面

| 文件 | 改动 |
| --- | --- |
| `assets/scripts/lobby/PveLobbyController.ts` | 首屏不再硬等 `ensureResourcesBundle`；读条续跑；进厅后后台预热营地+分包；营地/远征入口按需 gating |
| `assets/scripts/ui/UiAssets.ts` | 收紧 `PVE_LOBBY_ESSENTIAL_KEYS`；可导出营地预热 key 列表或小函数 |
| `assets/scripts/core/GameApp.ts` | 与大厅读条衔接（避免双条重置）；真机仍可不在启动阶段等整包 |
| `assets/scripts/ui/LoadingOverlay.ts` | 仅在必要时小改（续跑进度 / 不重置）；不新增加载页 |

玩法数值与 `design.md` 无关；若 `PROJECT_NAVIGATION.md` / `CALL_FLOW.md` 启动链描述过时，实现时同步一句。

## 错误处理

- 首屏主包图失败：读条停在错误文案，不假装进大厅（沿用现有缺失/失败提示）
- `resources` 后台失败：大厅仍可进；点营地/远征时用现有 overlay 重试；失败则状态栏/toast，不新建加载页
- 营地档案预取失败：不挡大厅；点营地再请求，失败走 `CampView.showError`
- BGM 失败：静默

## 明确不做

- 不把整包 `resources` 塞回主包（主包 4MB 红线）
- 不新做第二套加载页
- 不擅自大幅缩短真机分包 settle/重试到可能偶发缺图的程度（有证据再单独议）

## 验收

1. 真机冷启动：第二段读条起 → 大厅背景+首屏图标齐全可点，尽量 ≤15s
2. 不再出现：读条读满 → 闪一下 → 又从低进度重读
3. 进大厅后自动后台预热营地；多数情况下点「营地」可直接开；未完则短等且仍用现有 `LoadingOverlay`
4. 点「远征」在分包未就绪时同样走现有 `LoadingOverlay`，不新做加载页
5. 开发者工具：进大厅不回归变慢，首屏图标与背景正常

## 风险说明

- 进大厅后立刻点远征/营地：可能多一次短 overlay（已接受）
- BGM 可能晚几秒响起（已接受）
- 主包 critical 清单若漏拷贝会导致真机缺图；实现时保持现有 patch/`PVE_LOBBY_CRITICAL_KEYS` 与阻塞清单一致，不扩大主包体积
