import { ImageAsset, Rect, Size, SpriteFrame, Texture2D } from 'cc';
import { EDITOR } from 'cc/env';
import { loadWechatSubpackage } from '../ui/UiAssets';
import {
  EquipmentTierBundle,
  getEquipmentBundlesForChapter,
  getEquipmentBundlesForFloor,
  resolveEquipmentIconEntry,
} from './EquipmentCatalog';
import type { EquipItem } from './core/PveTypes';

type LoadStage = {
  text: string;
  progress: number;
};

const SUBPACKAGE_ROOT = 'subpackages';
const ICON_DIR = 'icons';
const CACHE_PREFIX = 'pve/equipment/';

const _loadedBundles = new Set<EquipmentTierBundle>();
const _bundlePromises = new Map<EquipmentTierBundle, Promise<boolean>>();
const _spriteCache = new Map<string, SpriteFrame>();
const _spritePromises = new Map<string, Promise<SpriteFrame | null>>();

function isWechatRuntime(): boolean {
  return typeof wx !== 'undefined' && typeof wx.loadSubpackage === 'function';
}

function bundleIconPath(bundle: EquipmentTierBundle, fileName: string): string {
  return `${SUBPACKAGE_ROOT}/${bundle}/${ICON_DIR}/${fileName}`;
}

function cacheKeyForItem(item: EquipItem): string | null {
  const entry = resolveEquipmentIconEntry(item);
  if (!entry) return null;
  return `${CACHE_PREFIX}${entry.fileName}`;
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

async function ensureBundle(bundle: EquipmentTierBundle): Promise<boolean> {
  if (EDITOR || !isWechatRuntime()) {
    _loadedBundles.add(bundle);
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
        console.error('[EquipmentResourceLoader] subpackage load failed', bundle, err);
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

export async function ensureEquipmentAssets(
  chapter: number,
  onStage?: (stage: LoadStage) => void,
): Promise<boolean> {
  return ensureEquipmentBundles(getEquipmentBundlesForChapter(chapter), onStage);
}

export async function ensureEquipmentAssetsForFloor(
  floor: number,
  onStage?: (stage: LoadStage) => void,
): Promise<boolean> {
  return ensureEquipmentBundles(getEquipmentBundlesForFloor(floor), onStage);
}

async function ensureEquipmentBundles(
  bundles: EquipmentTierBundle[],
  onStage?: (stage: LoadStage) => void,
): Promise<boolean> {
  if (bundles.every((bundle) => _loadedBundles.has(bundle))) {
    return true;
  }
  for (let i = 0; i < bundles.length; i += 1) {
    const bundle = bundles[i];
    if (_loadedBundles.has(bundle)) continue;
    onStage?.({
      text: `正在准备装备图资源 ${i + 1}/${bundles.length}…`,
      progress: 0.7 + ((i + 1) / bundles.length) * 0.18,
    });
    const ok = await ensureBundle(bundle);
    if (!ok) return false;
  }
  return true;
}

export function isEquipmentReadyForChapter(chapter: number): boolean {
  if (EDITOR || !isWechatRuntime()) return true;
  return getEquipmentBundlesForChapter(chapter).every((bundle) => _loadedBundles.has(bundle));
}

export function clearEquipmentSpriteForNode(node: { getChildByName(name: string): { destroy?: () => void; active?: boolean } | null }): void {
  const child = node.getChildByName('EquipArt');
  if (child && typeof child.destroy === 'function') {
    child.destroy();
  }
}

export async function loadEquipmentSprite(item: EquipItem | null | undefined): Promise<SpriteFrame | null> {
  const entry = item ? resolveEquipmentIconEntry(item) : null;
  if (!item || !entry || EDITOR || !isWechatRuntime()) {
    return null;
  }

  const cacheKey = cacheKeyForItem(item);
  if (!cacheKey) return null;
  const cached = _spriteCache.get(cacheKey);
  if (cached && cached.isValid) {
    return cached;
  }

  let promise = _spritePromises.get(cacheKey);
  if (!promise) {
    promise = (async () => {
      const ready = await ensureBundle(entry.bundle);
      if (!ready) return null;
      const subpackagePath = bundleIconPath(entry.bundle, entry.fileName);
      const tempPath = `${wx.env.USER_DATA_PATH}/equip-${entry.fileName}`;
      const localPath = await readWechatFileToTemp([subpackagePath, `/${subpackagePath}`], tempPath);
      if (!localPath) {
        console.warn('[EquipmentResourceLoader] icon read failed', entry.fileName);
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
