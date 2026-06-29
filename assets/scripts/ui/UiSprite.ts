import { Graphics, Node, Sprite, SpriteFrame, UITransform } from 'cc';

/** 移除占位 Graphics（微信端与 Sprite 同节点时可能仍遮挡底图） */
export function removePlaceholderGraphics(node: Node): void {
  const g = node.getComponent(Graphics);
  if (g) g.destroy();
}

export function spriteSourceSize(sf: SpriteFrame): { w: number; h: number } {
  const rect = sf.rect;
  // 用 trim 后的 rect 算比例；originalSize 常为整图正方形，会导致棋子被拉成扁块
  if (rect.width > 0 && rect.height > 0) {
    return { w: rect.width, h: rect.height };
  }
  return {
    w: sf.originalSize?.width ?? 0,
    h: sf.originalSize?.height ?? 0,
  };
}

type InsetFrame = SpriteFrame & {
  insetTop?: number;
  insetBottom?: number;
  insetLeft?: number;
  insetRight?: number;
  packable?: boolean;
};

/** 微信端：清空 meta 九宫格切边，否则 SIMPLE 也可能被渲染成碎块 */
export function normalizeUiSpriteFrame(sf: SpriteFrame): SpriteFrame {
  const f = sf as InsetFrame;
  f.insetTop = 0;
  f.insetBottom = 0;
  f.insetLeft = 0;
  f.insetRight = 0;
  f.packable = false;
  return sf;
}

/** 等比缩放进目标盒（contain） */
export function pickSpriteLayout(
  sf: SpriteFrame,
  boxW: number,
  boxH: number,
): { w: number; h: number } {
  const { w: sw, h: sh } = spriteSourceSize(sf);
  if (sw <= 0 || sh <= 0) {
    return { w: boxW, h: boxH };
  }
  const scale = Math.min(boxW / sw, boxH / sh);
  return {
    w: Math.max(1, Math.round(sw * scale)),
    h: Math.max(1, Math.round(sh * scale)),
  };
}

/** 等比缩放进目标盒，但不允许放大超过素材原始裁切尺寸。 */
export function pickSpriteLayoutNoUpscale(
  sf: SpriteFrame,
  boxW: number,
  boxH: number,
): { w: number; h: number } {
  const { w: sw, h: sh } = spriteSourceSize(sf);
  if (sw <= 0 || sh <= 0) {
    return { w: boxW, h: boxH };
  }
  const scale = Math.min(1, boxW / sw, boxH / sh);
  return {
    w: Math.max(1, Math.round(sw * scale)),
    h: Math.max(1, Math.round(sh * scale)),
  };
}

/** 铺满目标盒（cover），用于全屏背景 */
export function pickSpriteCover(
  sf: SpriteFrame,
  boxW: number,
  boxH: number,
): { w: number; h: number } {
  const { w: sw, h: sh } = spriteSourceSize(sf);
  if (sw <= 0 || sh <= 0) {
    return { w: boxW, h: boxH };
  }
  const scale = Math.max(boxW / sw, boxH / sh);
  return {
    w: Math.max(1, Math.round(sw * scale)),
    h: Math.max(1, Math.round(sh * scale)),
  };
}

/** 在节点上铺 Sprite，并关闭占位 Graphics */
function applySpriteSize(
  node: Node,
  sf: SpriteFrame,
  w: number,
  h: number,
): Sprite {
  normalizeUiSpriteFrame(sf);
  const ut = node.getComponent(UITransform) || node.addComponent(UITransform);
  ut.setContentSize(w, h);

  let sp = node.getComponent(Sprite);
  if (!sp) sp = node.addComponent(Sprite);
  sp.sizeMode = Sprite.SizeMode.CUSTOM;
  sp.type = Sprite.Type.SIMPLE;
  sp.spriteFrame = sf;
  // 替换 SpriteFrame 时 Cocos 可能按原图尺寸刷新 UITransform。
  // 赋图后再次锁定目标尺寸，避免固定布局被 256×256 等素材尺寸撑大。
  ut.setContentSize(w, h);

  removePlaceholderGraphics(node);
  return sp;
}

export function applySpriteFill(
  node: Node,
  sf: SpriteFrame,
  boxW: number,
  boxH: number,
): Sprite {
  const lay = pickSpriteLayout(sf, boxW, boxH);
  return applySpriteSize(node, sf, lay.w, lay.h);
}

/** Keep the node hitbox/layout fixed, and scale only the sprite inside that box. */
export function applySpriteInsideFixedBox(
  node: Node,
  sf: SpriteFrame,
  boxW: number,
  boxH: number,
): Sprite {
  normalizeUiSpriteFrame(sf);
  const lay = pickSpriteLayout(sf, boxW, boxH);
  const ut = node.getComponent(UITransform) || node.addComponent(UITransform);
  ut.setContentSize(lay.w, lay.h);

  let sp = node.getComponent(Sprite);
  if (!sp) sp = node.addComponent(Sprite);
  sp.sizeMode = Sprite.SizeMode.CUSTOM;
  sp.type = Sprite.Type.SIMPLE;
  sp.spriteFrame = sf;
  ut.setContentSize(lay.w, lay.h);

  // 节点会被格子池反复复用。尺寸直接写入 UITransform，节点缩放始终归一，
  // 避免上一张图片的宽高比缩放残留到下一次渲染。
  node.setScale(1, 1, 1);

  removePlaceholderGraphics(node);
  return sp;
}

/** 子节点铺底图（置于最底层，居中） */
export function ensureArtChild(
  parent: Node,
  childName: string,
  sf: SpriteFrame,
  boxW: number,
  boxH: number,
): Sprite {
  const lay = pickSpriteLayout(sf, boxW, boxH);
  let ch = parent.getChildByName(childName);
  if (!ch) {
    ch = new Node(childName);
    ch.setParent(parent);
    ch.setSiblingIndex(0);
    ch.setPosition(0, 0, 0);
  }
  return applySpriteSize(ch, sf, lay.w, lay.h);
}

/** 子节点等比 contain，但不放大超过素材原始裁切尺寸。 */
export function ensureArtContainNoUpscale(
  parent: Node,
  childName: string,
  sf: SpriteFrame,
  boxW: number,
  boxH: number,
): Sprite {
  const lay = pickSpriteLayoutNoUpscale(sf, boxW, boxH);
  let ch = parent.getChildByName(childName);
  if (!ch) {
    ch = new Node(childName);
    ch.setParent(parent);
    ch.setSiblingIndex(0);
    ch.setPosition(0, 0, 0);
  }
  return applySpriteSize(ch, sf, lay.w, lay.h);
}

export type SliceInsets = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export function applySliceInsets(sf: SpriteFrame, insets: SliceInsets): SpriteFrame {
  const f = sf as InsetFrame;
  f.insetTop = insets.top;
  f.insetBottom = insets.bottom;
  f.insetLeft = insets.left;
  f.insetRight = insets.right;
  f.packable = false;
  return sf;
}

function applySpriteSliced(
  node: Node,
  sf: SpriteFrame,
  w: number,
  h: number,
  insets: SliceInsets,
): Sprite {
  applySliceInsets(sf, insets);
  const ut = node.getComponent(UITransform) || node.addComponent(UITransform);
  ut.setContentSize(w, h);

  let sp = node.getComponent(Sprite);
  if (!sp) sp = node.addComponent(Sprite);
  sp.sizeMode = Sprite.SizeMode.CUSTOM;
  sp.type = Sprite.Type.SLICED;
  sp.spriteFrame = sf;
  ut.setContentSize(w, h);

  removePlaceholderGraphics(node);
  return sp;
}

/** 子节点九宫格铺底（边框不拉伸变形，用于面板框） */
export function ensureArtSliced(
  parent: Node,
  childName: string,
  sf: SpriteFrame,
  boxW: number,
  boxH: number,
  insets: SliceInsets,
): Sprite {
  let ch = parent.getChildByName(childName);
  if (!ch) {
    ch = new Node(childName);
    ch.setParent(parent);
    ch.setSiblingIndex(0);
    ch.setPosition(0, 0, 0);
  }
  return applySpriteSliced(ch, sf, boxW, boxH, insets);
}

/** 子节点铺底图（强制拉伸到目标盒，用于 9s 面板底图） */
export function ensureArtStretch(
  parent: Node,
  childName: string,
  sf: SpriteFrame,
  boxW: number,
  boxH: number,
): Sprite {
  let ch = parent.getChildByName(childName);
  if (!ch) {
    ch = new Node(childName);
    ch.setParent(parent);
    ch.setSiblingIndex(0);
    ch.setPosition(0, 0, 0);
  }
  return applySpriteSize(ch, sf, boxW, boxH);
}

/** 全屏铺满（cover） */
export function ensureArtCover(
  parent: Node,
  childName: string,
  sf: SpriteFrame,
  boxW: number,
  boxH: number,
): Sprite {
  const lay = pickSpriteCover(sf, boxW, boxH);
  let ch = parent.getChildByName(childName);
  if (!ch) {
    ch = new Node(childName);
    ch.setParent(parent);
    ch.setSiblingIndex(0);
    ch.setPosition(0, 0, 0);
  }
  return applySpriteSize(ch, sf, lay.w, lay.h);
}
