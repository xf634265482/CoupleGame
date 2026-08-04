import { assetManager, AssetManager, SpriteFrame } from 'cc';
import { EDITOR } from 'cc/env';
import {
  cacheUiSprite,
  getCachedSprite,
  isWechatRuntime,
  loadUiSprite,
  loadWechatSubpackage,
} from '../ui/UiAssets';
import { normalizeUiSpriteFrame } from '../ui/UiSprite';

const CH1_BG_KEY = 'pve/backgrounds/bg_pve_ch1';
const MIGRATED_CHAPTERS = new Set<number>([2, 3, 4, 5]);

type ChapterAssetEntry = {
  bundlePath: string;
  cacheKey: string;
};

export type ChapterLoadProgress = {
  text: string;
  progress: number;
};

function chapterBgPath(chapter: number): string {
  return `bg_pve_ch${chapter}/spriteFrame`;
}

function chapterBundleName(chapter: number): string {
  return `chapter_${chapter}`;
}

function usesChapterBundle(chapter: number): boolean {
  return MIGRATED_CHAPTERS.has(chapter);
}

function chapterBgKey(chapter: number): string | null {
  if (chapter === 1) return CH1_BG_KEY;
  if (chapter >= 2 && chapter <= 5) return `pve/backgrounds/bg_pve_ch${chapter}_runtime`;
  return null;
}

const CHAPTER_ASSETS: Record<number, ChapterAssetEntry[]> = {
  2: [
    { bundlePath: 'map/icon_monster_ch2_normal/spriteFrame', cacheKey: 'pve/map/icon_monster_ch2_normal' },
    { bundlePath: 'map/icon_monster_ch2_hopper_lizard/spriteFrame', cacheKey: 'pve/map/icon_monster_ch2_hopper_lizard' },
    { bundlePath: 'map/icon_monster_ch2_dune_sentinel/spriteFrame', cacheKey: 'pve/map/icon_monster_ch2_dune_sentinel' },
    { bundlePath: 'map/icon_monster_ch2_elite/spriteFrame', cacheKey: 'pve/map/icon_monster_ch2_elite' },
    { bundlePath: 'map/icon_monster_ch2_anima/spriteFrame', cacheKey: 'pve/map/icon_monster_ch2_anima' },
    { bundlePath: 'map/icon_monster_ch2_boss/spriteFrame', cacheKey: 'pve/map/icon_monster_ch2_boss' },
    { bundlePath: 'map/icon_sand_pit_permanent/spriteFrame', cacheKey: 'pve/map/icon_sand_pit_permanent' },
  ],
  3: [
    { bundlePath: 'map/icon_monster_ch3_normal/spriteFrame', cacheKey: 'pve/map/icon_monster_ch3_normal' },
    { bundlePath: 'map/icon_monster_ch3_frostspike_porcupine/spriteFrame', cacheKey: 'pve/map/icon_monster_ch3_frostspike_porcupine' },
    { bundlePath: 'map/icon_monster_ch3_glacier_shaper/spriteFrame', cacheKey: 'pve/map/icon_monster_ch3_glacier_shaper' },
    { bundlePath: 'map/icon_monster_ch3_elite/spriteFrame', cacheKey: 'pve/map/icon_monster_ch3_elite' },
    { bundlePath: 'map/icon_monster_ch3_anima/spriteFrame', cacheKey: 'pve/map/icon_monster_ch3_anima' },
    { bundlePath: 'map/icon_monster_ch3_boss/spriteFrame', cacheKey: 'pve/map/icon_monster_ch3_boss' },
    { bundlePath: 'map/terrain_ice_wall/spriteFrame', cacheKey: 'pve/map/terrain_ice_wall' },
    { bundlePath: 'map/terrain_ice_tile/spriteFrame', cacheKey: 'pve/map/terrain_ice_tile' },
    { bundlePath: 'map/terrain_freeze_wall/spriteFrame', cacheKey: 'pve/map/terrain_freeze_wall' },
    { bundlePath: 'map/terrain_shattered_ice/spriteFrame', cacheKey: 'pve/map/terrain_shattered_ice' },
  ],
  4: [
    { bundlePath: 'map/icon_monster_ch4_normal/spriteFrame', cacheKey: 'pve/map/icon_monster_ch4_normal' },
    { bundlePath: 'map/icon_monster_ch4_ash_hound/spriteFrame', cacheKey: 'pve/map/icon_monster_ch4_ash_hound' },
    { bundlePath: 'map/icon_monster_ch4_magma_crab/spriteFrame', cacheKey: 'pve/map/icon_monster_ch4_magma_crab' },
    { bundlePath: 'map/icon_monster_ch4_fire_elemental/spriteFrame', cacheKey: 'pve/map/icon_monster_ch4_fire_elemental' },
    { bundlePath: 'map/icon_monster_ch4_elite/spriteFrame', cacheKey: 'pve/map/icon_monster_ch4_elite' },
    { bundlePath: 'map/icon_monster_ch4_anima/spriteFrame', cacheKey: 'pve/map/icon_monster_ch4_anima' },
    { bundlePath: 'map/icon_monster_ch4_boss/spriteFrame', cacheKey: 'pve/map/icon_monster_ch4_boss' },
    { bundlePath: 'map/terrain_lava/spriteFrame', cacheKey: 'pve/map/terrain_lava' },
    // 熔岩领主锁链 fx：拉扯动画用，只在第 4 章 boss 战触发
    { bundlePath: 'map/lava_chain/spriteFrame', cacheKey: 'pve/fx/lava_chain' },
  ],
  5: [
    { bundlePath: 'map/icon_monster_ch5_normal/spriteFrame', cacheKey: 'pve/map/icon_monster_ch5_normal' },
    { bundlePath: 'map/icon_monster_ch5_fatewheel_beast/spriteFrame', cacheKey: 'pve/map/icon_monster_ch5_fatewheel_beast' },
    { bundlePath: 'map/icon_monster_ch5_fate_watcher/spriteFrame', cacheKey: 'pve/map/icon_monster_ch5_fate_watcher' },
    { bundlePath: 'map/icon_monster_ch5_elite/spriteFrame', cacheKey: 'pve/map/icon_monster_ch5_elite' },
    { bundlePath: 'map/icon_monster_ch5_anima/spriteFrame', cacheKey: 'pve/map/icon_monster_ch5_anima' },
    { bundlePath: 'map/icon_monster_ch5_boss/spriteFrame', cacheKey: 'pve/map/icon_monster_ch5_boss' },
  ],
};

const _bundlePromises = new Map<number, Promise<AssetManager.Bundle | null>>();
const _bgCache = new Map<number, SpriteFrame>();
const _bgPromises = new Map<number, Promise<SpriteFrame | null>>();
const _assetsPromises = new Map<number, Promise<boolean>>();

function loadBundleByName(name: string): Promise<AssetManager.Bundle | null> {
  const existing = assetManager.bundles.get(name);
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve) => {
    try {
      assetManager.loadBundle(name, (err, bundle) => {
        if (err || !bundle) {
          console.error('[ChapterResourceLoader] loadBundle failed', name, err);
          resolve(null);
          return;
        }
        console.log('[ChapterResourceLoader] bundle ready', name, bundle.base);
        resolve(bundle);
      });
    } catch (syncErr) {
      console.error('[ChapterResourceLoader] loadBundle threw', name, syncErr);
      resolve(null);
    }
  });
}

function loadChapterBundleOnce(chapter: number): Promise<AssetManager.Bundle | null> {
  const name = chapterBundleName(chapter);
  if (EDITOR || !isWechatRuntime()) {
    return loadBundleByName(name);
  }
  console.log('[ChapterResourceLoader] loading subpackage…', name);
  // 章节包比 resources 小；缩短落盘 settle，避免「下载完还干等 1~2s」。
  return loadWechatSubpackage(name, { settleMs: 350, zeroBytesSettleMs: 500 })
    .then(() => loadBundleByName(name))
    .catch((err) => {
      console.error('[ChapterResourceLoader] loadSubpackage failed', name, err);
      return null;
    });
}

export function ensureChapterBundle(chapter: number): Promise<boolean> {
  if (!usesChapterBundle(chapter)) {
    return Promise.resolve(true);
  }
  let promise = _bundlePromises.get(chapter);
  if (!promise) {
    promise = loadChapterBundleOnce(chapter);
    _bundlePromises.set(chapter, promise);
    void promise.then((bundle) => {
      if (!bundle) _bundlePromises.delete(chapter);
    });
  }
  return promise.then((bundle) => bundle != null);
}

export function loadChapterBackground(chapter: number): Promise<SpriteFrame | null> {
  const cached = _bgCache.get(chapter);
  if (cached && cached.isValid) return Promise.resolve(cached);

  if (!usesChapterBundle(chapter)) {
    const key = chapterBgKey(chapter);
    if (!key) return Promise.resolve(null);
    return loadUiSprite(key).then((spriteFrame) => {
      if (spriteFrame) _bgCache.set(chapter, spriteFrame);
      return spriteFrame;
    });
  }

  let promise = _bgPromises.get(chapter);
  if (!promise) {
    promise = ensureChapterBundle(chapter)
      .then((ok) => {
        if (!ok) return null;
        const bundle = assetManager.bundles.get(chapterBundleName(chapter));
        if (!bundle) return null;
        return new Promise<SpriteFrame | null>((resolve) => {
          bundle.load(chapterBgPath(chapter), SpriteFrame, (err, spriteFrame) => {
            if (err || !spriteFrame) {
              console.error('[ChapterResourceLoader] bg load failed', chapter, err);
              resolve(null);
              return;
            }
            normalizeUiSpriteFrame(spriteFrame);
            _bgCache.set(chapter, spriteFrame);
            resolve(spriteFrame);
          });
        });
      })
      .finally(() => {
        _bgPromises.delete(chapter);
      });
    _bgPromises.set(chapter, promise);
  }
  return promise;
}

export function ensureChapterAssets(
  chapter: number,
  onStage?: (stage: ChapterLoadProgress) => void,
): Promise<boolean> {
  let promise = _assetsPromises.get(chapter);
  if (promise) return promise;

  promise = (async () => {
    if (usesChapterBundle(chapter)) {
      onStage?.({
        text: `正在下载第${chapter}章资源包…`,
        progress: 0.35,
      });
    } else {
      onStage?.({
        text: `正在准备第${chapter}章背景…`,
        progress: 0.6,
      });
    }

    const bg = await loadChapterBackground(chapter).catch(() => null);
    if (!bg) return false;

    if (usesChapterBundle(chapter)) {
      onStage?.({
        text: `正在准备第${chapter}章背景…`,
        progress: 0.6,
      });
    }

    if (!usesChapterBundle(chapter)) return true;
    const entries = CHAPTER_ASSETS[chapter] ?? [];
    if (entries.length === 0) return true;

    const bundle = assetManager.bundles.get(chapterBundleName(chapter));
    if (!bundle) return false;

    const pending = entries.filter((entry) => !getCachedSprite(entry.cacheKey));
    if (pending.length === 0) return true;

    onStage?.({
      text: `正在加载第${chapter}章地图资源…`,
      progress: 0.85,
    });

    const results = await Promise.all(
      pending.map(
        (entry) =>
          new Promise<boolean>((resolve) => {
            bundle.load(entry.bundlePath, SpriteFrame, (err, spriteFrame) => {
              if (err || !spriteFrame) {
                console.error(
                  '[ChapterResourceLoader] asset load failed',
                  chapter,
                  entry.bundlePath,
                  err,
                );
                resolve(false);
                return;
              }
              cacheUiSprite(entry.cacheKey, spriteFrame);
              resolve(true);
            });
          }),
      ),
    );
    return results.every((ok) => ok);
  })();

  _assetsPromises.set(chapter, promise);
  void promise.then((ok) => {
    if (!ok) _assetsPromises.delete(chapter);
  });
  return promise;
}

export function preloadChapter(chapter: number): void {
  if (isChapterReady(chapter)) return;
  void ensureChapterAssets(chapter).catch(() => {
    // Fire-and-forget preloading.
  });
}

export function isChapterReady(chapter: number): boolean {
  if (chapter === 1) return true;
  const bg = _bgCache.get(chapter);
  if (!bg || !bg.isValid) return false;
  if (!usesChapterBundle(chapter)) return true;
  const entries = CHAPTER_ASSETS[chapter] ?? [];
  for (const entry of entries) {
    if (!getCachedSprite(entry.cacheKey)) return false;
  }
  return true;
}
