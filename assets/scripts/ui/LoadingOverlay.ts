import { _decorator, Color, Component, Graphics, Label, Node, screen, SpriteFrame, UITransform } from 'cc';
import { applyUiLayerTree, visibleDesignSize } from '../platform/wechat/ViewAdapt';
import { loadUiSprite } from './UiAssets';
import { ensureArtCover } from './UiSprite';

const { ccclass } = _decorator;

const TIMEOUT_MS = 10000;
const PROGRESS_WIDTH = 430;
const PROGRESS_HEIGHT = 18;
const PROGRESS_SMOOTH_SPEED = 3.4;
const PROGRESS_CARD_W = 540;
const PROGRESS_CARD_H = 200;
const PROGRESS_CARD_Y = -180;
const LOADING_BG_KEY = 'pve/backgrounds/bg_pve_loading_expedition';

type LoadingOverlayMode = 'default' | 'startup' | 'chapter';

type LoadingOverlayState = {
  mode?: LoadingOverlayMode;
  title?: string;
  subtitle?: string;
  text?: string;
  hint?: string;
  progress?: number;
};

type LoadingOverlayOptions = LoadingOverlayState & {
  onTimeout?: () => void;
  timeoutMs?: number;
  hideOnTimeout?: boolean;
};

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

@ccclass('LoadingOverlayView')
export class LoadingOverlayView extends Component {
  private _titleLabel: Label | null = null;
  private _subtitleLabel: Label | null = null;
  private _statusLabel: Label | null = null;
  private _hintLabel: Label | null = null;
  private _progressTrack: Graphics | null = null;
  private _progressFill: Graphics | null = null;
  private _symbolGraphics: Graphics | null = null;
  private _fogNodes: Node[] = [];
  private _particleNodes: Node[] = [];
  private _particleSeeds: Array<{ x: number; y: number; speed: number; drift: number; size: number }> = [];
  private _displayProgress = 0;
  private _targetProgress = 0;
  private _time = 0;
  private _width = 0;
  private _height = 0;
  private _mode: LoadingOverlayMode = 'default';
  private _bgLoaded = false;
  private _bgLoadStarted = false;
  private _bgSpriteFrame: SpriteFrame | null = null;
  private _decorNodes: Node[] = [];

  onLoad(): void {
    const { w, h } = visibleDesignSize();
    this._width = w;
    this._height = h;
    this._build();
    this._drawBase();
    this._drawProgress();
    this._drawSymbol();
    void this._tryLoadBackground();
    // 启动期 visibleDesignSize() 可能返回兜底 720×1280，等屏幕适配完成后再重算一次。
    screen.on('window-resize', this._onScreenResize, this);
  }

  onDestroy(): void {
    screen.off('window-resize', this._onScreenResize, this);
  }

  private _onScreenResize = (): void => {
    const { w, h } = visibleDesignSize();
    if (w === this._width && h === this._height) return;
    this._width = w;
    this._height = h;
    // 根节点 + Backdrop 跟随屏幕尺寸
    this.node.getComponent(UITransform)?.setContentSize(w, h);
    this.node.getChildByName('Backdrop')?.getComponent(UITransform)?.setContentSize(w, h);
    this._drawBase();
    // 背景图重新铺满
    if (this._bgSpriteFrame) {
      ensureArtCover(this.node, 'BackgroundArt', this._bgSpriteFrame, w, h);
      this.node.getChildByName('BackgroundArt')?.setSiblingIndex(0);
    }
  };

  update(dt: number): void {
    this._time += dt;
    const alpha = Math.min(1, dt * PROGRESS_SMOOTH_SPEED);
    this._displayProgress += (this._targetProgress - this._displayProgress) * alpha;
    if (Math.abs(this._targetProgress - this._displayProgress) < 0.001) {
      this._displayProgress = this._targetProgress;
    }
    this._drawProgress();
    this._drawSymbol();
    this._animateFog();
    this._animateParticles();
  }

  applyState(state: LoadingOverlayState): void {
    if (state.title !== undefined && this._titleLabel) this._titleLabel.string = state.title;
    if (state.subtitle !== undefined && this._subtitleLabel) this._subtitleLabel.string = state.subtitle;
    if (state.text !== undefined && this._statusLabel) this._statusLabel.string = state.text;
    if (state.hint !== undefined && this._hintLabel) this._hintLabel.string = state.hint;
    if (state.progress !== undefined) {
      this._targetProgress = clamp01(state.progress);
      if (this._displayProgress > this._targetProgress) {
        this._displayProgress = this._targetProgress;
      }
    }
    if (state.mode !== undefined) {
      this._applyMode(state.mode);
    }
  }

  private _build(): void {
    const rootTransform = this.node.getComponent(UITransform) || this.node.addComponent(UITransform);
    rootTransform.setContentSize(this._width, this._height);

    const bgNode = new Node('Backdrop');
    bgNode.setParent(this.node);
    bgNode.addComponent(UITransform).setContentSize(this._width, this._height);
    bgNode.addComponent(Graphics);

    const topGlow = this._makeCircle('TopGlow', 0, 250, 280, new Color(50, 86, 160, 34));
    topGlow.setParent(this.node);
    const moonGlow = this._makeCircle('MoonGlow', 164, 208, 88, new Color(243, 210, 118, 34));
    moonGlow.setParent(this.node);
    this._decorNodes.push(topGlow, moonGlow);

    const fogA = this._makeCircle('FogA', -210, 110, 185, new Color(96, 120, 178, 24));
    const fogB = this._makeCircle('FogB', 180, 52, 170, new Color(76, 96, 150, 20));
    const fogC = this._makeCircle('FogC', 0, -42, 250, new Color(62, 84, 136, 22));
    this._fogNodes.push(fogA, fogB, fogC);
    this._decorNodes.push(fogA, fogB, fogC);

    const towerNode = new Node('Tower');
    towerNode.setParent(this.node);
    towerNode.setPosition(0, 40, 0);
    towerNode.addComponent(UITransform).setContentSize(220, 320);
    const towerGraphics = towerNode.addComponent(Graphics);
    this._drawTower(towerGraphics);
    this._decorNodes.push(towerNode);

    const symbolNode = new Node('Symbol');
    symbolNode.setParent(this.node);
    symbolNode.setPosition(0, 58, 0);
    symbolNode.addComponent(UITransform).setContentSize(120, 120);
    this._symbolGraphics = symbolNode.addComponent(Graphics);
    // 背景图加载后这块装饰会与图重叠，跟其它兜底装饰一起隐藏
    this._decorNodes.push(symbolNode);

    // 标题/副标题浮在背景图上方，加描边保证可读
    const titleNode = this._makeLabelNode('Title', 0, 198, Math.round(this._width * 0.8), 60, 40, new Color(245, 236, 210, 255));
    this._titleLabel = titleNode.getComponent(Label);
    if (this._titleLabel) {
      this._titleLabel.isBold = true;
      this._titleLabel.enableOutline = true;
      this._titleLabel.outlineColor = new Color(8, 14, 28, 230);
      this._titleLabel.outlineWidth = 4;
    }
    titleNode.setParent(this.node);

    const subtitleNode = this._makeLabelNode('Subtitle', 0, 152, Math.round(this._width * 0.78), 48, 24, new Color(220, 232, 252, 255));
    this._subtitleLabel = subtitleNode.getComponent(Label);
    if (this._subtitleLabel) {
      this._subtitleLabel.isBold = true;
      this._subtitleLabel.enableOutline = true;
      this._subtitleLabel.outlineColor = new Color(8, 14, 28, 200);
      this._subtitleLabel.outlineWidth = 3;
    }
    subtitleNode.setParent(this.node);

    // 悬浮卡片：包裹进度条 + 状态 + 提示
    const cardNode = new Node('ProgressCard');
    cardNode.setParent(this.node);
    cardNode.setPosition(0, PROGRESS_CARD_Y, 0);
    cardNode.addComponent(UITransform).setContentSize(PROGRESS_CARD_W, PROGRESS_CARD_H);
    cardNode.addComponent(Graphics);
    this._drawProgressCard();

    // 卡片内坐标（相对 cardNode 中心）
    const statusNode = this._makeLabelNode('Status', 0, 56, Math.round(PROGRESS_CARD_W - 40), 36, 24, new Color(237, 240, 246, 255));
    this._statusLabel = statusNode.getComponent(Label);
    if (this._statusLabel) this._statusLabel.isBold = true;
    statusNode.setParent(cardNode);

    const progressNode = new Node('Progress');
    progressNode.setParent(cardNode);
    progressNode.setPosition(0, 8, 0);
    progressNode.addComponent(UITransform).setContentSize(PROGRESS_WIDTH, PROGRESS_HEIGHT);

    const trackNode = new Node('Track');
    trackNode.setParent(progressNode);
    trackNode.addComponent(UITransform).setContentSize(PROGRESS_WIDTH, PROGRESS_HEIGHT);
    this._progressTrack = trackNode.addComponent(Graphics);

    const fillNode = new Node('Fill');
    fillNode.setParent(progressNode);
    fillNode.addComponent(UITransform).setContentSize(PROGRESS_WIDTH, PROGRESS_HEIGHT);
    this._progressFill = fillNode.addComponent(Graphics);

    const hintNode = this._makeLabelNode('Hint', 0, -42, Math.round(PROGRESS_CARD_W - 60), 30, 18, new Color(186, 206, 232, 230));
    this._hintLabel = hintNode.getComponent(Label);
    hintNode.setParent(cardNode);

    this._buildParticles();
  }

  private _applyMode(mode: LoadingOverlayMode): void {
    this._mode = mode;
    if (!this._hintLabel) return;
    if (mode === 'chapter' && !this._hintLabel.string) {
      this._hintLabel.string = '远征之路正在向更深处延伸';
    }
    if (mode === 'startup' && !this._hintLabel.string) {
      this._hintLabel.string = '正在展开你的远征世界';
    }
    if (this._bgLoaded && this._bgSpriteFrame) {
      this._applyBackground(this._bgSpriteFrame);
    }
  }

  private _drawBase(): void {
    const bg = this.node.getChildByName('Backdrop')?.getComponent(Graphics);
    if (!bg) return;
    const w = this._width;
    const h = this._height;
    bg.clear();

    // 背景图已加载：完全透出背景图，不再覆盖任何暗化层（标题已有深色描边保证可读）。
    if (this._bgLoaded) return;

    // 背景图未加载时的兜底渐变。
    bg.fillColor = new Color(7, 12, 24, 255);
    bg.rect(-w / 2, -h / 2, w, h);
    bg.fill();

    bg.fillColor = new Color(16, 26, 48, 255);
    bg.rect(-w / 2, -h / 2, w, h * 0.72);
    bg.fill();

    bg.fillColor = new Color(20, 34, 62, 190);
    bg.circle(0, 110, 240);
    bg.fill();
  }

  /** 进度区悬浮卡片：包裹进度条 + 状态文字 + 提示，独立于背景图。 */
  private _drawProgressCard(): void {
    const card = this.node.getChildByName('ProgressCard')?.getComponent(Graphics);
    if (!card) return;
    const w = PROGRESS_CARD_W;
    const h = PROGRESS_CARD_H;
    card.clear();
    card.fillColor = new Color(7, 18, 38, 178);
    card.roundRect(-w / 2, -h / 2, w, h, 18);
    card.fill();
    card.strokeColor = new Color(120, 165, 220, 130);
    card.lineWidth = 2;
    card.roundRect(-w / 2 + 1, -h / 2 + 1, w - 2, h - 2, 17);
    card.stroke();
  }

  private _drawTower(g: Graphics): void {
    g.clear();

    g.fillColor = new Color(8, 10, 18, 240);
    g.moveTo(-54, -130);
    g.lineTo(-54, 52);
    g.lineTo(-28, 104);
    g.lineTo(-12, 130);
    g.lineTo(12, 130);
    g.lineTo(28, 104);
    g.lineTo(54, 52);
    g.lineTo(54, -130);
    g.close();
    g.fill();

    g.fillColor = new Color(12, 18, 32, 255);
    g.rect(-70, -140, 140, 18);
    g.fill();

    g.fillColor = new Color(217, 186, 112, 105);
    g.rect(-10, 4, 20, 52);
    g.fill();
    g.rect(-6, 72, 12, 18);
    g.fill();

    g.strokeColor = new Color(240, 202, 128, 82);
    g.lineWidth = 2;
    g.moveTo(-52, 46);
    g.lineTo(52, 46);
    g.moveTo(-38, 84);
    g.lineTo(38, 84);
    g.stroke();
  }

  private _drawSymbol(): void {
    const g = this._symbolGraphics;
    if (!g) return;
    const pulse = 0.84 + Math.sin(this._time * 1.8) * 0.08;
    const rotate = this._time * 0.9;

    g.clear();
    g.lineWidth = 2.5;
    g.strokeColor = new Color(232, 208, 146, 210);
    g.circle(0, 0, 42 * pulse);
    g.stroke();

    g.lineWidth = 5;
    g.strokeColor = new Color(253, 222, 129, 235);
    g.arc(0, 0, 42 * pulse, rotate, rotate + Math.PI * 0.95, false);
    g.stroke();

    g.fillColor = new Color(255, 241, 196, 220);
    g.moveTo(0, 20);
    g.lineTo(13, 0);
    g.lineTo(0, -20);
    g.lineTo(-13, 0);
    g.close();
    g.fill();

    g.fillColor = new Color(96, 152, 255, 140);
    g.circle(0, 0, 8);
    g.fill();
  }

  private _drawProgress(): void {
    const track = this._progressTrack;
    const fill = this._progressFill;
    if (!track || !fill) return;

    track.clear();
    track.fillColor = new Color(14, 24, 44, 220);
    track.roundRect(-PROGRESS_WIDTH / 2, -PROGRESS_HEIGHT / 2, PROGRESS_WIDTH, PROGRESS_HEIGHT, PROGRESS_HEIGHT / 2);
    track.fill();
    track.strokeColor = new Color(104, 140, 198, 130);
    track.lineWidth = 1.5;
    track.roundRect(-PROGRESS_WIDTH / 2, -PROGRESS_HEIGHT / 2, PROGRESS_WIDTH, PROGRESS_HEIGHT, PROGRESS_HEIGHT / 2);
    track.stroke();

    const width = Math.max(0, PROGRESS_WIDTH * this._displayProgress);
    fill.clear();
    if (width <= 0) return;

    // 单色填充（去掉金色前导段和白色 shimmer，进度感更清晰）
    const left = -PROGRESS_WIDTH / 2;
    fill.fillColor = new Color(95, 158, 255, 240);
    fill.roundRect(left, -PROGRESS_HEIGHT / 2, width, PROGRESS_HEIGHT, PROGRESS_HEIGHT / 2);
    fill.fill();
  }

  private _buildParticles(): void {
    const count = 8;
    for (let i = 0; i < count; i++) {
      const node = new Node(`Particle_${i}`);
      node.setParent(this.node);
      node.addComponent(UITransform).setContentSize(12, 12);
      const g = node.addComponent(Graphics);
      const size = 2 + (i % 3);
      g.fillColor = new Color(240, 218, 148, i % 2 === 0 ? 110 : 74);
      g.circle(0, 0, size);
      g.fill();
      this._particleNodes.push(node);
      this._particleSeeds.push({
        x: -170 + i * 48,
        y: -36 - (i % 3) * 30,
        speed: 10 + i * 1.4,
        drift: 10 + (i % 4) * 4,
        size,
      });
    }
    this._animateParticles();
  }

  private _animateFog(): void {
    const offsets = [
      { x: -210, y: 110, ampX: 12, ampY: 4, speed: 0.55 },
      { x: 180, y: 52, ampX: 16, ampY: 5, speed: 0.47 },
      { x: 0, y: -42, ampX: 10, ampY: 3, speed: 0.36 },
    ];
    this._fogNodes.forEach((node, index) => {
      const config = offsets[index];
      node.setPosition(
        config.x + Math.sin(this._time * config.speed + index) * config.ampX,
        config.y + Math.cos(this._time * config.speed + index * 0.7) * config.ampY,
        0,
      );
    });
  }

  private _animateParticles(): void {
    const travel = 140;
    this._particleNodes.forEach((node, index) => {
      const seed = this._particleSeeds[index];
      const y = ((this._time * seed.speed + index * 9) % travel) - travel / 2;
      const x = seed.x + Math.sin(this._time * 0.9 + index) * seed.drift;
      node.setPosition(x, -8 + y, 0);
    });
  }

  private _makeCircle(name: string, x: number, y: number, radius: number, color: Color): Node {
    const node = new Node(name);
    node.addComponent(UITransform).setContentSize(radius * 2, radius * 2);
    node.setPosition(x, y, 0);
    const g = node.addComponent(Graphics);
    g.fillColor = color;
    g.circle(0, 0, radius);
    g.fill();
    return node;
  }

  private _makeLabelNode(
    name: string,
    x: number,
    y: number,
    width: number,
    height: number,
    fontSize: number,
    color: Color,
  ): Node {
    const node = new Node(name);
    node.setPosition(x, y, 0);
    node.addComponent(UITransform).setContentSize(width, height);
    const label = node.addComponent(Label);
    label.fontSize = fontSize;
    label.lineHeight = fontSize + 6;
    label.color = color;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = Label.Overflow.SHRINK;
    return node;
  }

  private async _tryLoadBackground(): Promise<void> {
    if (this._bgLoadStarted) return;
    this._bgLoadStarted = true;
    try {
      const spriteFrame = await loadUiSprite(LOADING_BG_KEY);
      if (!spriteFrame || !spriteFrame.isValid || !this.node.isValid) return;
      this._applyBackground(spriteFrame);
    } catch (err) {
      console.warn('[LoadingOverlay] background load failed', err);
    }
  }

  private _applyBackground(spriteFrame: SpriteFrame): void {
    this._bgSpriteFrame = spriteFrame;
    // 统一用 cover 模式铺满（不再按 mode 走 ContainNoUpscale，否则启动期 576×1024 源图
    // 在 720×1624 屏幕上保留原尺寸 → 视觉上变成"小图框在中间"。chapter loading 一直是 cover）。
    ensureArtCover(this.node, 'BackgroundArt', spriteFrame, this._width, this._height);
    const bgNode = this.node.getChildByName('BackgroundArt');
    bgNode?.setSiblingIndex(0);
    this._bgLoaded = true;
    this._decorNodes.forEach((node) => {
      if (node.isValid) node.active = false;
    });
    this._drawBase();
  }
}

export class LoadingOverlay {
  private static _node: Node | null = null;
  private static _view: LoadingOverlayView | null = null;
  private static _timeoutTimer: ReturnType<typeof setTimeout> | null = null;

  static show(host: Node, text = '加载中…', options?: (() => void) | LoadingOverlayOptions): void {
    this._ensureNode(host);
    if (this._node) {
      this._node.active = true;
      this._node.setSiblingIndex(host.children.length - 1);
    }

    const resolvedOptions = typeof options === 'function'
      ? { onTimeout: options, timeoutMs: TIMEOUT_MS, hideOnTimeout: true }
      : {
          onTimeout: options?.onTimeout,
          timeoutMs: options?.timeoutMs ?? TIMEOUT_MS,
          hideOnTimeout: options?.hideOnTimeout ?? true,
          mode: options?.mode,
          title: options?.title,
          subtitle: options?.subtitle,
          hint: options?.hint,
          progress: options?.progress,
        };

    this._view?.applyState({
      mode: resolvedOptions.mode ?? 'default',
      title: resolvedOptions.title ?? '命运远征',
      subtitle: resolvedOptions.subtitle ?? '迷雾中的高塔正在苏醒',
      text,
      hint: resolvedOptions.hint ?? '远征之路正在缓缓展开',
      progress: resolvedOptions.progress ?? 0,
    });

    this._clearTimeout();
    if (resolvedOptions.timeoutMs > 0) {
      this._timeoutTimer = setTimeout(() => {
        if (resolvedOptions.hideOnTimeout) this.hide();
        resolvedOptions.onTimeout?.();
      }, resolvedOptions.timeoutMs);
    }
  }

  static update(state: string | LoadingOverlayState): void {
    if (!this._view) return;
    if (typeof state === 'string') {
      this._view.applyState({ text: state });
      return;
    }
    this._view.applyState(state);
  }

  static hide(): void {
    if (this._node?.isValid) this._node.active = false;
    this._clearTimeout();
  }

  /** 屏幕尺寸适配后调用一次，避免启动期 overlay 用了兜底 720×1280 出现黑边。 */
  static recompute(): void {
    if (!this._view) return;
    // 借用 view 的私有 resize handler：直接触发一次即可
    (this._view as unknown as { _onScreenResize: () => void })._onScreenResize();
  }

  private static _clearTimeout(): void {
    if (this._timeoutTimer) {
      clearTimeout(this._timeoutTimer);
      this._timeoutTimer = null;
    }
  }

  private static _ensureNode(host: Node): void {
    if (this._node?.isValid && this._node.parent === host) return;
    this._node?.destroy();

    const { w, h } = visibleDesignSize();
    const root = new Node('LoadingOverlay');
    root.setParent(host);
    root.setPosition(0, 0, 0);
    root.addComponent(UITransform).setContentSize(w, h);
    applyUiLayerTree(root, host.layer);

    this._node = root;
    this._view = root.addComponent(LoadingOverlayView);
  }
}
