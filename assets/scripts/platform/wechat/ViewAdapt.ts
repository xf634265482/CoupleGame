import {
  Camera,
  Canvas,
  director,
  Layers,
  Node,
  ResolutionPolicy,
  UITransform,
  view,
  Widget,
} from 'cc';
import { removePlaceholderGraphics } from '../../ui/UiSprite';

export const DESIGN_W = 720;
export const DESIGN_H = 1280;

/** 竖屏固定宽度：宽度 720，超长屏向下扩展可视高度 */
export function applyPortraitResolution(): void {
  try {
    view.setDesignResolutionSize(DESIGN_W, DESIGN_H, ResolutionPolicy.FIXED_WIDTH);
  } catch (err) {
    console.warn('[ViewAdapt] setDesignResolutionSize', err);
  }
}

/**
 * UI 布局坐标系（与 Canvas 固定宽 720、高随设备扩展一致）。
 * 勿用 wx 窗口逻辑高做布局高，否则纵向内容会超出画布，表现为碎块、裁切错位。
 */
export function visibleDesignSize(): { w: number; h: number } {
  const visible = view.getVisibleSize();
  return {
    w: DESIGN_W,
    h: Math.max(DESIGN_H, Math.round(visible.height || DESIGN_H)),
  };
}

/**
 * 微信右上角胶囊按钮底边对应的设计坐标 Y。
 * 内容应放在返回值以下；非微信环境使用与常见异形屏接近的保守兜底。
 */
export function topSafeBoundaryY(margin = 12): number {
  const { h } = visibleDesignSize();
  try {
    if (typeof wx === 'undefined') return h / 2 - 166 - margin;
    const wxApi = wx as unknown as {
      getMenuButtonBoundingClientRect?: () => { bottom?: number };
      getWindowInfo?: () => { windowWidth?: number; screenWidth?: number };
      getSystemInfoSync?: () => { windowWidth?: number; screenWidth?: number };
    };
    if (
      typeof wxApi.getMenuButtonBoundingClientRect === 'function'
    ) {
      const rect = wxApi.getMenuButtonBoundingClientRect();
      const info = typeof wxApi.getWindowInfo === 'function'
        ? wxApi.getWindowInfo()
        : wxApi.getSystemInfoSync?.();
      const windowW = info?.windowWidth || info?.screenWidth;
      if (rect?.bottom > 0 && typeof windowW === 'number' && windowW > 0) {
        const pxToDesign = DESIGN_W / windowW;
        return h / 2 - rect.bottom * pxToDesign - margin;
      }
    }
  } catch (err) {
    console.warn('[ViewAdapt] menu safe boundary', err);
  }
  return h / 2 - 166 - margin;
}

/**
 * 微信竖屏适配组合（需配合 game.json portrait + patch 脚本）：
 * - Widget 关闭，Canvas 固定宽 720、高随设备扩展，位置 (0,0)
 * - alignCanvasWithScreen 关闭，避免与手动原点双重偏移
 * - 相机 orthoHeight 跟随设计高度一半动态变化，匹配 FIXED_WIDTH 策略
 */
export function prepareCanvasRoot(canvas: Node): void {
  applyPortraitResolution();

  const widget = canvas.getComponent(Widget);
  if (widget) widget.enabled = false;

  const ut = canvas.getComponent(UITransform);
  if (ut) {
    const size = visibleDesignSize();
    ut.setContentSize(size.w, size.h);
    ut.setAnchorPoint(0.5, 0.5);
  }

  canvas.setPosition(0, 0, 0);

  const canvasComp = canvas.getComponent(Canvas);
  if (canvasComp) canvasComp.alignCanvasWithScreen = false;

  syncCanvasCamera(canvas);

  for (const ch of canvas.children) {
    if (ch.name !== 'Camera' && ch.name !== 'ScreenBg') {
      applyUiLayerTree(ch, canvas.layer);
    }
  }
}

export function syncCanvasCamera(canvas: Node): void {
  const cam = canvas.getComponentInChildren(Camera);
  if (!cam) return;

  cam.orthoHeight = visibleDesignSize().h / 2;
  cam.node.setPosition(0, 0, 1000);
  cam.visibility = Layers.Enum.DEFAULT | Layers.Enum.UI_2D;
}

/** 动态 UI 节点继承 Canvas 的 UI 层 */
export function applyUiLayerTree(root: Node, layer: number): void {
  root.layer = layer;
  for (const ch of root.children) applyUiLayerTree(ch, layer);
}

/** 铺满设计分辨率的背景容器（Art 子节点由 UiAssets.applyScreenBackground 填充） */
export function ensureScreenBackground(parent: Node): void {
  const { w, h } = visibleDesignSize();
  let bg = parent.getChildByName('ScreenBg');
  if (!bg) {
    bg = new Node('ScreenBg');
    bg.setParent(parent);
    bg.setPosition(0, 0, 0);
    bg.addComponent(UITransform).setContentSize(w, h);
  }

  bg.getComponent(UITransform)?.setContentSize(w, h);
  bg.setSiblingIndex(0);
  removePlaceholderGraphics(bg);
  applyUiLayerTree(bg, parent.layer);
}

export function refreshScreenAdapt(canvas: Node, retries = 0): void {
  if (!director.root?.batcher2D) {
    if (retries < 120) {
      setTimeout(() => refreshScreenAdapt(canvas, retries + 1), 16);
    } else {
      console.warn('[ViewAdapt] batcher2D not ready, skip screen adapt');
    }
    return;
  }
  prepareCanvasRoot(canvas);
  ensureScreenBackground(canvas);
}

/** 绑定窗口尺寸变化后重算适配（微信横屏就绪较晚） */
export function bindWindowResize(canvas: Node, onResize: () => void): () => void {
  const handler = () => {
    refreshScreenAdapt(canvas);
    onResize();
  };
  if (typeof wx !== 'undefined' && wx.onWindowResize) {
    wx.onWindowResize(handler);
    return () => wx.offWindowResize?.(handler);
  }
  return () => {};
}
