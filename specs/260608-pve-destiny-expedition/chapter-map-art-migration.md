# 章节地图美术迁移计划（第二阶段）

> 第一阶段（章节背景迁 chapter_N 分包）已真机验证通过。本阶段把第2-5章专属的**怪物图标、地砖、地形贴图**也并入各自 chapter_N bundle 按章加载，修复真机上这些贴图 `file ... does not exist` 报错（控制台噪音 + 战场只显示 glyph 占位）。

## 前置门（开工前必须满足）
- chapter_2/3/4/5 背景在**真机**全部显示正常、无 Error 4930。
- patch 日志 `subpackages: resources, chapter_2, chapter_3, chapter_4, chapter_5`、`est. main < 4096 KB`。

## 资产归属（精确清单，按代码实际生成推导）

| 章节 | 怪物图标 | 地砖 | 章节专属地形/实体 |
|---|---|---|---|
| ch2 | `icon_monster_ch2_{normal,elite,anima,boss}` | `tile_floor_ch2` | `icon_sand_pit_permanent`（SAND_PIT/SAND_PIT_DYNAMIC 共用）|
| ch3 | `icon_monster_ch3_*` | `tile_floor_ch3` | `terrain_ice_wall` / `terrain_ice_tile` / `terrain_freeze_wall` / `terrain_shattered_ice` |
| ch4 | `icon_monster_ch4_*` | `tile_floor_ch4` | `terrain_lava` |
| ch5 | `icon_monster_ch5_*` | `tile_floor_ch5` | （无章节地形）|

**例外（留在主包 critical，禁迁）**：
- `terrain_rock` — 第1章 GoblinChief 召唤 + 第3章 FrostGiant 检测路径，**跨章共享**。
- 第1章所有美术（`icon_monster_goblin_*`、`tile_floor_ch1` 等）。

## 架构（让 FogMapView 几乎不动）

`FogMapView` 用同步 `getCachedSprite('pve/map/xxx')` 取图。做法：把这些贴图移入 `chapter_N` bundle → `ChapterResourceLoader` 在进章 gating 时 `bundle.load` → **以同名 key 注入回 `UiAssets.cache`** → `getCachedSprite` 命中，渲染层无需改。

### 接口设计

**`UiAssets.ts` 新增 export**：
```ts
export function cacheUiSprite(key: string, sf: SpriteFrame): SpriteFrame {
  normalizeUiSpriteFrame(sf);
  cache.set(key, sf);
  return sf;
}
```

**`ChapterResourceLoader.ts` 扩展**：
```ts
// 每章资产清单：背景 + 怪物图标 + 地砖 + 章节地形
type ChapterAssetEntry = {
  /** bundle 内资源相对路径，如 'bg_pve_ch3/spriteFrame' / 'map/terrain_ice_wall/spriteFrame' */
  bundlePath: string;
  /** 注入 UiAssets 缓存的 key（与 FogMapView 同步取图的 key 一致）；背景为 null（走旧通道） */
  cacheKey: string | null;
};

const CHAPTER_ASSETS: Record<number, ChapterAssetEntry[]> = { ... };

/** 加载该章全部资产（背景+图标+地形），完成后 UiAssets 缓存已就绪，FogMapView 可同步取图。 */
export async function ensureChapterAssets(chapter: number): Promise<boolean>;
```

`loadChapterBackground` / `preloadChapter` 内部统一走 `ensureChapterAssets`（向后兼容）。

**`ExpeditionController._ensureChapterReady`** 把当前的 `await loadChapterBackground` 改成 `await ensureChapterAssets`，loading 文案不变。

**`FogMapView._loadBaseArt`** 中遍历 `for (let ch = 1; ch <= 5; ch++) loadUiSprite('icon_monster_chN_*')` 的预热块只保留 ch1；ch2-5 删除（由 ensureChapterAssets 在进章时统一加载）。`_refreshFloorPlane` 不动。

## 资产移动规则

每章在 `assets/chapter_backgrounds/chapter_N/` 下新增 `map/` 子目录（避免和背景同级 jpg 重名），把 `assets/resources/art/ui/pve/map/<asset>.png[+.meta]` `git mv` 进去（**保留原 uuid，仅在 meta 改 displayName**）。bundle 内加载路径形如 `map/terrain_ice_wall/spriteFrame`、`map/icon_monster_ch3_normal/spriteFrame`。

## 第3章 spike 优先（铺开顺序）

地形最多 + 主包 critical 涉及最多，第3章作 spike：
1. 移动资产：`icon_monster_ch3_{normal,elite,anima,boss}`、`tile_floor_ch3`、`terrain_ice_wall`、`terrain_ice_tile`、`terrain_freeze_wall`、`terrain_shattered_ice` → `assets/chapter_backgrounds/chapter_3/map/`。
2. 实现 `UiAssets.cacheUiSprite`、`ChapterResourceLoader.ensureChapterAssets` + ch3 清单。
3. `ExpeditionController._ensureChapterReady` 改用 `ensureChapterAssets`；`FogMapView._loadBaseArt` 删 ch3 预热。
4. patch 脚本 `PVE_MAP_CRITICAL_KEYS` 删 `tile_floor_ch3` + `icon_monster_ch3_*`；`UI_SPRITE_UUID` 删 ch3 已迁出 key（参考背景迁移）。
5. tsc + jest 通过 → 用户在 Cocos 刷新 import + 构建 + patch → 确认 `subpackages: ... chapter_3` 体积包含 ch3 美术、`est. main` 进一步下降、无 `critical native missing`。
6. **真机**进第3章验：冰系地形/怪物图标正常显示、控制台无 `terrain_ice_* does not exist`、第1/2/4/5章不受影响。

✅ 通过 → 用完全相同模式铺开 ch2（`icon_sand_pit_permanent`、`tile_floor_ch2`、`icon_monster_ch2_*`）、ch4（`terrain_lava`、`tile_floor_ch4`、`icon_monster_ch4_*`）、ch5（`tile_floor_ch5`、`icon_monster_ch5_*`，无地形）。

## 受影响文件
- 改：`assets/scripts/ui/UiAssets.ts`（export `cacheUiSprite`；删迁出 key 的 `UI_SPRITE_UUID` / `PVE_MAP_KEYS` 条目）
- 改：`assets/scripts/pve/ChapterResourceLoader.ts`（资产清单 + `ensureChapterAssets` + 缓存注入）
- 改：`assets/scripts/pve/controllers/ExpeditionController.ts`（`_ensureChapterReady` 切到 `ensureChapterAssets`）
- 改：`assets/scripts/pve/views/FogMapView.ts`（`_loadBaseArt` 删 ch2-5 预热）
- 改：`scripts/patch-wechatgame-config.js`（`PVE_MAP_CRITICAL_KEYS` 删迁出 key）
- 资产移动：`assets/resources/art/ui/pve/map/<*>.png[.meta]` → `assets/chapter_backgrounds/chapter_N/map/`
- 新增：每个 chapter_N 目录下 `map/` 子目录

## 不做
- 不动 `FogMapView` 渲染逻辑（artMap / glyphFallback / paintArt）。
- 不动 `terrain_rock` 归属（跨章共享，留主包）。
- 不动 chapter_N.meta（bundle 配置已验证可用）。
- 不改 patch 的分包搬迁/注册逻辑（通用 `chapter_*` 已支持）。
- 不与背景迁移混做。

## 预算预期
全部迁完后主包将进一步下降（粗估再省 ~200-300KB，给后续迭代留余地），同时去掉真机所有 `terrain_* does not exist` 报错。

## 风险与回退
- **缓存注入时机**：必须在 FogMapView `refresh` 前完成 → 已在 `_ensureChapterReady` await，OK。
- **续档进 chN**：续档路径已走 `_ensureChapterReady`（背景迁移时接入），自动覆盖。
- 任一资产 bundle.load 失败 → 整章 ensureChapterAssets 返回 false → 现有「回大厅」兜底生效。
- 单章失败可单独回退：把该章 key 移回 resources、还原 patch 清单、`MIGRATED_CHAPTERS` 不变（背景仍走分包）。
