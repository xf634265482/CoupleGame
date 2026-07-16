# 真机大厅冷启动加载优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 真机冷启动下，第二段「正在加载大厅资源」起至大厅背景+首屏图标齐全可点尽量 ≤15s，并进厅后后台预热营地。

**Architecture:** 大厅首屏只等主包 critical native（`bg_lobby` + lobby icons）；`ensureResourcesBundle` 与营地资源/档案改为进厅后后台预热。营地/远征入口在预热未完成时用现有 `LoadingOverlay` 短等，不新建加载页。读条在切场景后从高水位续跑，避免满条闪回 0%。

**Tech Stack:** TypeScript、Cocos Creator 3.8.8、微信小游戏 `wx.loadSubpackage`、现有 `UiAssets` / `LoadingOverlay` / `PveLobbyController`。

## Global Constraints

- 计时窗口：第二段「正在加载大厅资源」→ 大厅可点（不含登录/协议）。
- 关条条件：`bg_lobby` + Logo + 导航/芯片图标全部就绪。
- 只用现有 `LoadingOverlay`，禁止新建第二套加载页。
- 不把整包 `resources` 塞回主包（4MB 红线）。
- 不擅自大幅缩短真机分包 settle/重试。
- 玩法数值无关；若改启动链描述须同步 `CALL_FLOW.md`。

**Spec:** `docs/superpowers/specs/2026-07-16-lobby-load-perf-design.md`

---

## File map

| 文件 | 职责 |
| --- | --- |
| `assets/scripts/ui/UiAssets.ts` | 收紧大厅阻塞 key；导出营地预热 key/`preloadPveCampUi`；`isResourcesBundleReady` |
| `assets/scripts/lobby/PveLobbyController.ts` | 首屏不硬等分包；读条高水位；进厅后预热；营地/远征 gating |
| `assets/scripts/core/GameApp.ts` | 进厅前读条勿假装「已完成再重来」的观感（停在高水位再切场景） |
| `assets/scripts/ui/LoadingOverlay.ts` | 可选：`isVisible()`，便于续跑判断（若不用可跳过） |
| `CALL_FLOW.md` | 启动链与进厅后预热一句同步 |
| `test/pve/LobbyLoadKeys.test.ts` | 断言阻塞清单不含 loading 图、含 bg_lobby 与营地 warm keys |

---

### Task 1: 收紧大厅阻塞清单并导出营地预热 API

**Files:**
- Modify: `assets/scripts/ui/UiAssets.ts`
- Create: `test/pve/LobbyLoadKeys.test.ts`

**Interfaces:**
- Produces: `export const PVE_LOBBY_ESSENTIAL_KEYS`（去掉 `bg_pve_loading_expedition`，保留 `backgrounds/bg_lobby` + 全部大厅图标）
- Produces: `export const PVE_CAMP_WARM_KEYS = ['pve/backgrounds/bg_pve_camp', 'pve/camp/panel_camp_main_9s'] as const`
- Produces: `export async function preloadPveCampUi(): Promise<void>`
- Produces: `export function isResourcesBundleReady(): boolean`
- Consumes: 现有 `preloadKeys` / `ensureResourcesBundle` / `loadUiSprite`

- [ ] **Step 1: 写失败测试**

```ts
// test/pve/LobbyLoadKeys.test.ts
import {
  PVE_LOBBY_ESSENTIAL_KEYS,
  PVE_CAMP_WARM_KEYS,
} from '../../assets/scripts/ui/UiAssets';

describe('lobby load keys', () => {
  it('blocks only first-paint lobby assets', () => {
    expect(PVE_LOBBY_ESSENTIAL_KEYS).toContain('backgrounds/bg_lobby');
    expect(PVE_LOBBY_ESSENTIAL_KEYS).toContain('pve/lobby/icon_nav_camp');
    expect(PVE_LOBBY_ESSENTIAL_KEYS).not.toContain('pve/backgrounds/bg_pve_loading_expedition');
  });

  it('defines camp warm keys for post-lobby preload', () => {
    expect(PVE_CAMP_WARM_KEYS).toEqual([
      'pve/backgrounds/bg_pve_camp',
      'pve/camp/panel_camp_main_9s',
    ]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx jest test/pve/LobbyLoadKeys.test.ts -v`  
Expected: FAIL（`PVE_LOBBY_ESSENTIAL_KEYS` / `PVE_CAMP_WARM_KEYS` 未导出，或仍含 loading 图）

- [ ] **Step 3: 改 UiAssets**

1. 将 `PVE_LOBBY_ESSENTIAL_KEYS` 改为 `export const`，并删除 `'pve/backgrounds/bg_pve_loading_expedition'`：

```ts
export const PVE_LOBBY_ESSENTIAL_KEYS = [
  'backgrounds/bg_lobby',
  'pve/lobby/logo_destiny_tower',
  'pve/lobby/icon_chip_stardust',
  'pve/lobby/icon_chip_stamina',
  'pve/lobby/icon_nav_relic',
  'pve/lobby/icon_nav_expedition',
  'pve/lobby/icon_nav_camp',
  'pve/lobby/icon_nav_leaderboard',
] as const;

export const PVE_CAMP_WARM_KEYS = [
  'pve/backgrounds/bg_pve_camp',
  'pve/camp/panel_camp_main_9s',
] as const;
```

2. 在 `preloadPveLobbyUi` 旁增加：

```ts
export async function preloadPveCampUi(): Promise<void> {
  await preloadKeys([...PVE_CAMP_WARM_KEYS], { parallel: true });
}

export function isResourcesBundleReady(): boolean {
  const existing = assetManager.bundles.get('resources');
  if (!existing) return false;
  if (!isWechatRuntime()) return true;
  return isWechatResourcesBundleReady(existing);
}
```

注意：`isWechatResourcesBundleReady` 若当前是模块内私有函数，保持私有，仅给 `isResourcesBundleReady` 调用即可。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx jest test/pve/LobbyLoadKeys.test.ts -v`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add assets/scripts/ui/UiAssets.ts test/pve/LobbyLoadKeys.test.ts
git commit -m "perf: trim lobby blocking preload keys and export camp warm API"
```

---

### Task 2: 大厅首屏与 resources 分包解耦 + 读条高水位

**Files:**
- Modify: `assets/scripts/lobby/PveLobbyController.ts`（`onLoad`、`_loadArt`、`_getMissingLobbyArtKeys`）
- Modify: `assets/scripts/core/GameApp.ts`（`_completeStartupOverlay` / 进厅前进度）

**Interfaces:**
- Consumes: `preloadPveLobbyUi`、`getCachedSprite`、`applyScreenBackground`（不再在首屏 `await ensureResourcesBundle`）
- Produces: 大厅关条时背景+图标齐全；读条从约 `0.55` 起而非 `0.05`

- [ ] **Step 1: 改 `GameApp` 进厅前读条观感**

在 `GameApp.ts` 的 `_completeStartupOverlay` 调用处（进 `loadLobby` 前）：不要让用户感觉「已经 100% 完成又重来」。将完成进度改为高水位并缩短停留，例如：

```ts
private async _completeStartupOverlay(text: string): Promise<void> {
  // 场景切换会销毁本 Canvas 上的 overlay；停在高水位，交给大厅续跑
  this._setStartupStage(text, 0.92, '通往大厅的路已经显现');
  await delay(OVERLAY_COMPLETE_DELAY_MS);
  this._hideStartupOverlay();
}
```

（保持函数名不变；关键是进度用 `0.92` 而非 `1`，避免「满条完成」错觉。若现有调用处已传文案，无需改调用签名。）

- [ ] **Step 2: 改大厅 `onLoad` 读条起点**

`PveLobbyController.onLoad` 中 `LoadingOverlay.show`：

```ts
LoadingOverlay.show(this.node, '正在加载大厅资源…', {
  mode: 'startup',
  title: '塔塔远征团',
  subtitle: '正在进入大厅',
  hint: '正在加载大厅素材',
  progress: 0.55,
  hideOnTimeout: false,
  timeoutMs: 0,
});
```

- [ ] **Step 3: 改 `_loadArt`：首屏不硬等分包**

将 `_loadArt` 改为大致如下逻辑（保留现有绘制/缺失错误路径）：

```ts
private async _loadArt(): Promise<void> {
  try {
    LoadingOverlay.update({
      text: '正在加载大厅资源…',
      hint: '正在加载大厅背景与图标',
      progress: 0.62,
    });
    await this._preloadLobbyArtUntilReady();

    LoadingOverlay.update({
      text: '正在绘制大厅…',
      hint: '正在应用大厅背景与导航图标',
      progress: 0.85,
    });
    await applyScreenBackground(this.node, 'lobby');
    // ... 现有 logo / nav / chip / button art 应用 ...

    const missing = this._getMissingLobbyArtKeys();
    if (missing.length > 0) {
      // 现有错误路径：update 文案 progress:1，return，不 hide
      ...
      return;
    }

    this._lobbyReady = true;
    // 显示 lobbyRoot ...
    LoadingOverlay.update({ text: '大厅准备完成', hint: '即将进入大厅', progress: 1 });
    LoadingOverlay.hide();
    void this._warmLobbyBackground();
  } catch (err: unknown) {
    // 现有 catch
  }
}
```

要点：
- **删除** `Promise.all([ensureResourcesBundle(), this._preloadLobbyArtUntilReady()])`
- **删除** 首屏路径里的 `playMainBgm(bundle)`（移到 `_warmLobbyBackground`）
- `_getMissingLobbyArtKeys` **必须加入** `'backgrounds/bg_lobby'`（关条条件 B）

```ts
private _getMissingLobbyArtKeys(): string[] {
  const keys = [
    'backgrounds/bg_lobby',
    'pve/lobby/logo_destiny_tower',
    'pve/lobby/icon_chip_stardust',
    'pve/lobby/icon_chip_stamina',
    ...Array.from(this._navIconKeys.values()),
  ];
  ...
}
```

- [ ] **Step 4: 静态检查**

确认 `_loadArt` 内无 `ensureResourcesBundle` 调用；`onLoad` progress 为 `0.55`。  
Run: `npx jest test/pve/LobbyLoadKeys.test.ts -v`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add assets/scripts/lobby/PveLobbyController.ts assets/scripts/core/GameApp.ts
git commit -m "perf: unlock lobby first paint from resources subpackage"
```

---

### Task 3: 进厅后后台预热营地 + 入口 gating

**Files:**
- Modify: `assets/scripts/lobby/PveLobbyController.ts`（新增 `_warmLobbyBackground`、`_ensureWarmReady`；改 `_showCampModal`、`_enterExpedition` 或选层进场景处）
- Modify: `CALL_FLOW.md`（启动链 + 进厅后预热一句）

**Interfaces:**
- Consumes: `ensureResourcesBundle`、`isResourcesBundleReady`、`preloadPveCampUi`、`playMainBgm`、`loadPveProfile`、`LoadingOverlay`
- Produces: `_warmPromise: Promise<void> | null`；进厅后自动预热；营地/远征未就绪时用现有 overlay 短等

- [ ] **Step 1: 实现 `_warmLobbyBackground`**

在 `PveLobbyController` 增加字段与方法：

```ts
private _warmPromise: Promise<void> | null = null;
private _warmedProfile: PveProfile | null = null;

private _warmLobbyBackground(): void {
  if (this._warmPromise) return;
  this._warmPromise = (async () => {
    const bundle = await ensureResourcesBundle();
    if (bundle) void playMainBgm(bundle);
    await preloadPveCampUi();
    try {
      const res = await loadPveProfile();
      this._warmedProfile = res.profile;
    } catch (err: unknown) {
      console.warn('[PveLobby] camp profile warm failed', err);
    }
  })().catch((err: unknown) => {
    console.warn('[PveLobby] background warm failed', err);
  });
}

private async _ensureWarmReady(text: string): Promise<boolean> {
  if (isResourcesBundleReady() && this._warmPromise == null) {
    this._warmLobbyBackground();
  }
  if (this._warmPromise) {
    LoadingOverlay.show(this.node, text, {
      mode: 'default',
      hint: '请稍候',
      progress: 0.35,
      hideOnTimeout: false,
      timeoutMs: 30000,
      onTimeout: () => LoadingOverlay.update({ text: '加载较慢，仍在继续…' }),
    });
    await this._warmPromise;
    LoadingOverlay.hide();
  } else if (!isResourcesBundleReady()) {
    LoadingOverlay.show(this.node, text, { hideOnTimeout: false, timeoutMs: 30000 });
    const bundle = await ensureResourcesBundle();
    if (!bundle) {
      LoadingOverlay.hide();
      this._setStatus('资源加载失败，请检查网络后重试');
      return false;
    }
    await preloadPveCampUi();
    LoadingOverlay.hide();
  }
  return true;
}
```

说明：`LoadingOverlay.show` 的 options 形态以现有类型为准；若 `mode:'default'` 不需要 title，可只传 `text` + timeout 回调（与 `_gotoScene` 一致）。**禁止**新建其它加载 Node/场景。

- [ ] **Step 2: 营地入口 gating**

将 `_showCampModal` 改为 async 短等：

```ts
private async _showCampModal(): Promise<void> {
  if (this._busy) return;
  this._busy = true;
  try {
    const ok = await this._ensureWarmReady('正在加载营地资源…');
    if (!ok) return;
    const controller = this.node.getComponent(CampController) ?? this.node.addComponent(CampController);
    controller.open(this.node);
  } finally {
    this._busy = false;
  }
}
```

导航按钮回调改为 `() => void this._showCampModal()`。

- [ ] **Step 3: 远征入口 gating**

在真正进远征场景前 gating（选层后 `_gotoScene` 之前），例如在确认楼层的 handler 内：

```ts
private async _confirmFloorAndEnter(floor: number): Promise<void> {
  if (this._busy) return;
  this._busy = true;
  try {
    const ok = await this._ensureWarmReady('正在进入远征…');
    if (!ok) return;
    GameSession.pendingPveFloor = floor;
    this._closeFloorSelectModal();
    this._gotoScene(`进入第 ${floor} 层…`, () => SceneLoader.loadPveExpedition());
  } finally {
    this._busy = false;
  }
}
```

若现有选层直接写 `GameSession.pendingPveFloor` + `_gotoScene`，把那段抽到上述方法。  
楼层选择弹窗本身（`_enterExpedition` 拉档案）可不挡分包；**进场景**必须挡。

- [ ] **Step 4: 更新 CALL_FLOW.md 启动段**

将「1. 启动到大厅」改为类似：

```text
GameApp.onLoad()
  -> 微信云初始化 / 登录
  -> SceneLoader.loadLobby()
  -> lobby.scene / PveLobbyController
       -> 主包加载 bg_lobby + 大厅图标 → 关 LoadingOverlay
       -> 后台 ensureResourcesBundle + 预热营地图/档案 + BGM
```

- [ ] **Step 5: Commit**

```bash
git add assets/scripts/lobby/PveLobbyController.ts CALL_FLOW.md
git commit -m "perf: warm camp after lobby entry and gate camp/expedition on overlay"
```

---

### Task 4: 真机验收清单（手工）

**Files:** 无代码；执行构建与真机步骤。

- [ ] **Step 1: 构建并 patch**

```bash
# Cocos 构建 wechatgame 后：
node scripts/patch-wechatgame-config.js
```

确认日志含 `critical native`、`est. main` **< 4096 KB**，且含 `backgrounds/bg_lobby` 与 `pve/lobby/*`。

- [ ] **Step 2: 真机冷启动**

微信开发者工具 → 清缓存 → 真机调试：

1. 观察第二段读条：应从约一半以上续跑，**不应**满条闪一下再从接近 0% 重来。
2. 计时：第二段出现 → 大厅背景+图标齐全可点，尽量 ≤15s。
3. 进厅后不点任何按钮等数秒，再点「营地」：多数情况下应很快打开（档案已预热）。
4. 冷启动后立刻点「远征」选层进入：允许短等，且必须是现有 `LoadingOverlay`，无新加载页。
5. BGM 可晚于大厅出现。

- [ ] **Step 3: 开发者工具回归**

模拟器启动进大厅仍快，图标与背景正常。

- [ ] **Step 4: 若验收失败**

- 仍 ~30s：查控制台是否还有首屏路径打 `loading resources subpackage`；有则 Task 2 未生效。
- 缺图标：查 patch critical 清单与 `PVE_LOBBY_CRITICAL_KEYS` 是否与阻塞 key 一致；**不要**用把整包塞主包来「修」。
- 读条仍闪回 0%：查大厅 `show` 的 `progress` 是否仍为 `0.05`。

---

## Spec coverage (self-review)

| Spec 要求 | Task |
| --- | --- |
| 首屏不硬等 `resources` | Task 2 |
| 阻塞清单去掉 loading 远征图 | Task 1 |
| 关条需 bg_lobby + 图标 | Task 2 `_getMissingLobbyArtKeys` |
| 读条不重置观感 | Task 2 GameApp + lobby `progress:0.55` |
| 进厅后预热营地图+档案+BGM | Task 3 |
| 营地/远征短等用现有 LoadingOverlay | Task 3 |
| ≤15s 真机验收 | Task 4 |
| 不做第二套加载页 / 不塞整包主包 | Global + Task 3/4 |
