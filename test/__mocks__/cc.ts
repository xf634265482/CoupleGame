export namespace AssetManager {
  export interface Bundle {
    base?: string;
    name?: string;
    load: (
      path: string,
      type: unknown,
      cb?: (err: unknown, asset?: SpriteFrame) => void,
    ) => void;
  }
}

type MockComponent = {
  enabled?: boolean;
  alignCanvasWithScreen?: boolean;
  orthoHeight?: number;
  visibility?: number;
  node?: Node;
  sizeMode?: number;
  type?: number;
  spriteFrame?: SpriteFrame | null;
  setContentSize: (w: number, h: number) => void;
  setAnchorPoint?: (x: number, y: number) => void;
  destroy?: () => void;
};

export const assetManager = {
  bundles: new Map<string, AssetManager.Bundle>(),
  downloader: {},
  loadBundle: (
    _name: string,
    cb?: (err: unknown, bundle?: AssetManager.Bundle | null) => void,
  ) => {
    cb?.(null, null);
  },
  loadAny: (_items: unknown[], cb?: (err: unknown, asset?: unknown) => void) => {
    cb?.(null, null);
  },
  removeBundle: (_bundle: AssetManager.Bundle) => {},
  getBundle: (_name?: string): AssetManager.Bundle | null => null,
};

export class ImageAsset {
  width = 1;
  height = 1;

  constructor(_image?: unknown) {}
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
  name = '';
  children: Node[] = [];

  constructor(_name?: string) {
    if (_name) this.name = _name;
  }

  getChildByName(_name: string): Node | null {
    return null;
  }

  setParent(_parent: Node): void {}

  setPosition(_x: number, _y: number, _z: number): void {}

  setScale(_x: number, _y: number, _z: number): void {}

  addComponent(_type: unknown): any {
    return { setContentSize: () => {} };
  }

  setSiblingIndex(_index: number): void {}

  getComponent(_type: unknown): any {
    return { setContentSize: () => {} };
  }

  getComponentInChildren(_type: unknown): any {
    return null;
  }
}

export class UITransform {
  setContentSize(_w: number, _h: number): void {}

  setAnchorPoint(_x: number, _y: number): void {}
}

export class Camera {}

export class Canvas {}

export class Widget {}

export class Graphics {
  destroy(): void {}
}

export class Sprite {
  static SizeMode = { CUSTOM: 0 };
  static Type = { SIMPLE: 0, SLICED: 1 };

  sizeMode = 0;
  type = 0;
  spriteFrame: SpriteFrame | null = null;
}

export const Layers = {
  Enum: {
    DEFAULT: 1,
    UI_2D: 2,
  },
};

export const ResolutionPolicy = {
  FIXED_WIDTH: 0,
};

export const view = {
  setDesignResolutionSize: (_w: number, _h: number, _policy: number) => {},
  getVisibleSize: () => ({ width: 1280, height: 1280 }),
};

export const director = {
  root: { batcher2D: {} },
};

export const resources = {
  load: (_path: string, _type: unknown, cb?: (err: unknown, sf?: SpriteFrame) => void) => {
    cb?.(null, null);
  },
};
