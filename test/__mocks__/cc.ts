export const assetManager = {
  bundles: new Map<string, unknown>(),
  downloader: {},
  loadBundle: (_name: string, cb?: (err: unknown, bundle?: unknown) => void) => {
    cb?.(null, null);
  },
  loadAny: (_items: unknown[], cb?: (err: unknown, asset?: unknown) => void) => {
    cb?.(null, null);
  },
  removeBundle: () => {},
  getBundle: () => null,
};

export class ImageAsset {
  width = 1;
  height = 1;
}

export class Texture2D {
  image: ImageAsset | null = null;
  width = 1;
  height = 1;
}

export class SpriteFrame {
  texture: Texture2D | null = null;
  rect = { width: 0, height: 0, x: 0, y: 0 };
  originalSize = { width: 0, height: 0 };
}

export class Rect {
  constructor(
    public x: number,
    public y: number,
    public width: number,
    public height: number,
  ) {}
}

export class Size {
  constructor(
    public width: number,
    public height: number,
  ) {}
}

export class Node {
  layer = 0;

  getChildByName(_name: string): Node | null {
    return null;
  }

  setParent(_parent: Node): void {}

  setPosition(_x: number, _y: number, _z: number): void {}

  addComponent(_type: unknown): { setContentSize: (w: number, h: number) => void } {
    return { setContentSize: () => {} };
  }

  setSiblingIndex(_index: number): void {}

  getComponent(_type: unknown): { setContentSize: (w: number, h: number) => void } | null {
    return { setContentSize: () => {} };
  }
}

export class UITransform {}

export const resources = {
  load: (_path: string, _type: unknown, cb?: (err: unknown, sf?: unknown) => void) => {
    cb?.(null, null);
  },
};
