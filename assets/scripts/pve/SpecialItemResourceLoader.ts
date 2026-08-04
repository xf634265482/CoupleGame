import { ImageAsset, Rect, Size, SpriteFrame, Texture2D } from 'cc';
import { EDITOR } from 'cc/env';
import { loadWechatSubpackage } from '../ui/UiAssets';
import { loadEquipmentSprite } from './EquipmentResourceLoader';
import {
  getBossSpoilIconEntry,
  getSpecialIconBundle,
  getSpecialIconChaptersForChapter,
  type SpecialIconBundle,
  type SpecialIconEntry,
} from './SpecialItemCatalog';
import type { EquipItem } from './core/PveTypes';

type LoadStage = {
  text: string;
  progress: number;
};

const MAIN_ROOT = 'pve_special_icons';
const SUBPACKAGE_ROOT = 'subpackages';
const ICON_DIR = 'icons';
const CACHE_PREFIX = 'pve/special/';

const _loadedBundles = new Set<SpecialIconBundle>();
const _bundlePromises = new Map<SpecialIconBundle, Promise<boolean>>();
const _spriteCache = new Map<string, SpriteFrame>();
const _spritePromises = new Map<string, Promise<SpriteFrame | null>>();

function isWechatRuntime(): boolean {
  return typeof wx !== 'undefined' && typeof wx.loadSubpackage === 'function';
}

function iconRelativePath(entry: SpecialIconEntry): string {
  const bundle = getSpecialIconBundle(entry);
  if (bundle === 'equipment_tier1') {
    return `${SUBPACKAGE_ROOT}/${bundle}/${MAIN_ROOT}/chapter_1/${ICON_DIR}/${entry.fileName}`;
  }
  if (bundle) {
    return `${SUBPACKAGE_ROOT}/${bundle}/${MAIN_ROOT}/${ICON_DIR}/${entry.fileName}`;
  }
  return `${MAIN_ROOT}/chapter_1/${ICON_DIR}/${entry.fileName}`;
}

function cacheKeyForEntry(entry: SpecialIconEntry): string {
  return `${CACHE_PREFIX}${entry.chapter}/${entry.fileName}`;
}

function readWechatFileToTempOnce(srcPath: string, tempPath: string): Promise<string | null> {
  if (!isWechatRuntime() || !wx.getFileSystemManager) {
    return Promise.resolve(null);
  }
  const fs = wx.getFileSystemManager();
  return new Promise((resolve) => {
    const fallbackRead = () => {
      fs.readFile({
        filePath: srcPath,
        success: (res) => {
          fs.writeFile({
            filePath: tempPath,
            data: res.data,
            success: () => resolve(tempPath),
            fail: () => resolve(null),
          });
        },
        fail: () => resolve(null),
      });
    };

    if (typeof fs.copyFile === 'function') {
      fs.copyFile({
        srcPath,
        destPath: tempPath,
        success: () => resolve(tempPath),
        fail: () => fallbackRead(),
      });
      return;
    }
    fallbackRead();
  });
}

async function readWechatFileToTemp(paths: readonly string[], tempPath: string): Promise<string | null> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    for (const srcPath of paths) {
      const hit = await readWechatFileToTempOnce(srcPath, tempPath);
      if (hit) return hit;
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  return null;
}

function imageToSpriteFrame(cacheKey: string, imagePath: string): Promise<SpriteFrame | null> {
  return new Promise((resolve) => {
    const image =
      typeof wx !== 'undefined' && typeof wx.createImage === 'function'
        ? wx.createImage()
        : new Image();
    image.onload = () => {
      const imageAsset = new ImageAsset(image);
      const texture = new Texture2D();
      texture.image = imageAsset;
      const spriteFrame = new SpriteFrame();
      spriteFrame.texture = texture;
      const width = image.width || imageAsset.width || 1;
      const height = image.height || imageAsset.height || 1;
      spriteFrame.rect = new Rect(0, 0, width, height);
      spriteFrame.originalSize = new Size(width, height);
      _spriteCache.set(cacheKey, spriteFrame);
      resolve(spriteFrame);
    };
    image.onerror = () => resolve(null);
    image.src = imagePath;
  });
}

async function ensureBundle(bundle: SpecialIconBundle | null): Promise<boolean> {
  if (!bundle || EDITOR || !isWechatRuntime()) {
    if (bundle) _loadedBundles.add(bundle);
    return true;
  }
  if (_loadedBundles.has(bundle)) {
    return true;
  }
  let promise = _bundlePromises.get(bundle);
  if (!promise) {
    promise = loadWechatSubpackage(bundle)
      .then(() => {
        _loadedBundles.add(bundle);
        return true;
      })
      .catch((err) => {
        console.error('[SpecialItemResourceLoader] subpackage load failed', bundle, err);
        return false;
      })
      .finally(() => {
        if (!_loadedBundles.has(bundle)) {
          _bundlePromises.delete(bundle);
        }
      });
    _bundlePromises.set(bundle, promise);
  }
  return promise;
}

async function loadEntrySprite(entry: SpecialIconEntry | null): Promise<SpriteFrame | null> {
  if (!entry || EDITOR || !isWechatRuntime()) {
    return null;
  }

  const cacheKey = cacheKeyForEntry(entry);
  const cached = _spriteCache.get(cacheKey);
  if (cached && cached.isValid) {
    return cached;
  }

  let promise = _spritePromises.get(cacheKey);
  if (!promise) {
    promise = (async () => {
      const ready = await ensureBundle(getSpecialIconBundle(entry));
      if (!ready) return null;
      const relativePath = iconRelativePath(entry);
      const tempPath = `${wx.env.USER_DATA_PATH}/special-${entry.chapter}-${entry.fileName}`;
      const localPath = await readWechatFileToTemp(
        [relativePath, `./${relativePath}`, `/${relativePath}`],
        tempPath,
      );
      if (!localPath) {
        console.warn('[SpecialItemResourceLoader] icon read failed', entry.fileName, relativePath);
        return null;
      }
      return imageToSpriteFrame(cacheKey, localPath);
    })().finally(() => {
      _spritePromises.delete(cacheKey);
    });
    _spritePromises.set(cacheKey, promise);
  }
  return promise;
}

export async function ensureSpecialIconAssets(
  chapter: number,
  onStage?: (stage: LoadStage) => void,
): Promise<boolean> {
  const bundles = [...new Set(
    getSpecialIconChaptersForChapter(chapter)
      .map((current) => getSpecialIconBundle({ chapter: current, fileName: '' }))
      .filter((bundle): bundle is SpecialIconBundle => !!bundle),
  )];
  for (let i = 0; i < bundles.length; i += 1) {
    const bundle = bundles[i];
    if (_loadedBundles.has(bundle)) continue;
    onStage?.({
      text: `姝ｅ湪鍑嗗绔犺妭涓撳睘鍥炬爣 ${i + 1}/${bundles.length}鈥`,
      progress: 0.9 + ((i + 1) / Math.max(1, bundles.length)) * 0.05,
    });
    const ok = await ensureBundle(bundle);
    if (!ok) return false;
  }
  return true;
}

export async function loadPveEquipSprite(item: EquipItem | null | undefined): Promise<SpriteFrame | null> {
  const bossExclusive = await loadEntrySprite(getBossSpoilIconEntry(item));
  if (bossExclusive) return bossExclusive;
  return loadEquipmentSprite(item);
}
