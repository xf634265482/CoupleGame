// fx/FxGallery.ts —— 程序动画框架的可视化验收面板（调试工具，不进正式玩法）。
//
// 用法：在任意场景新建一个空节点（或直接用 Canvas），挂上本组件 FxGallery，运行/预览即可。
// 一屏按钮逐个点放，目视确认每个效果的实际播放手感（cc 耦合部分无法单测，靠这里验收）。
// 本文件只依赖 cc 与 fx 自身，零业务依赖，保持 fx/ 模块独立。

import {
  _decorator, Color, Component, Label, Node, Rect, Size, Sprite, SpriteFrame, Texture2D,
  UIOpacity, UITransform, Vec3, view,
} from 'cc';
import { Effects } from './Effects';

const { ccclass } = _decorator;

interface ButtonSpec {
  label: string;
  run: () => void;
}

/** 运行时生成一张纯白 4×4 贴图的 SpriteFrame（避免依赖 resources 资源包）。 */
function makeWhiteSpriteFrame(): SpriteFrame {
  const tex = new Texture2D();
  tex.reset({ width: 4, height: 4, format: Texture2D.PixelFormat.RGBA8888 });
  const data = new Uint8Array(4 * 4 * 4);
  data.fill(255);
  tex.uploadData(data);
  const sf = new SpriteFrame();
  sf.texture = tex;
  sf.rect = new Rect(0, 0, 4, 4);
  sf.originalSize = new Size(4, 4);
  return sf;
}

@ccclass('FxGallery')
export class FxGallery extends Component {
  private _white: SpriteFrame | null = null;
  private _sample!: Node;          // 主样本（多数效果作用对象）
  private _icon!: Node;            // Buff 图标样本
  private _projectile!: Node;      // flyTo/jumpTo 飞行体
  private _marker!: Node;          // flyTo 目标点
  private _sampleBase = new Vec3();
  private _iconBase = new Vec3();
  private _projBase = new Vec3();

  onLoad(): void {
    const size = view.getVisibleSize();
    const w = size.width, h = size.height;

    // 保证 screenRoot（本节点）有 UITransform，供 worldToLocal / 飘字定位用。
    if (!this.node.getComponent(UITransform)) {
      this.node.addComponent(UITransform).setContentSize(w, h);
    }
    Effects.setScreenRoot(this.node);

    this._white = makeWhiteSpriteFrame();

    // ── 样本节点 ──
    this._sample = this._makeSprite('Sample', new Color(90, 170, 255, 255), 120, 120);
    this._sample.setPosition(0, h * 0.18, 0);
    this._sampleBase.set(this._sample.position);

    this._icon = this._makeSprite('BuffIcon', new Color(255, 200, 90, 255), 64, 64);
    this._icon.setPosition(-150, h * 0.18, 0);
    this._iconBase.set(this._icon.position);

    this._projectile = this._makeSprite('Projectile', new Color(160, 255, 160, 255), 48, 48);
    this._projectile.setPosition(150, h * 0.18, 0);
    this._projBase.set(this._projectile.position);

    this._marker = this._makeSprite('Marker', new Color(255, 120, 120, 120), 40, 40);
    this._marker.setPosition(w * 0.32, h * 0.36, 0);

    this._buildButtons(w, h);
  }

  // ── 样本构建 ──
  private _makeSprite(name: string, color: Color, w: number, h: number): Node {
    const n = new Node(name);
    n.setParent(this.node);
    const ui = n.addComponent(UITransform);
    const sp = n.addComponent(Sprite);
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    sp.spriteFrame = this._white;
    sp.color = color;
    n.addComponent(UIOpacity);
    // ⚠️ 必须在 spriteFrame 赋值后再次 setContentSize：Cocos 3.x 内部把
    // spriteFrame 应用到节点时，可能（即便 sizeMode=CUSTOM）也会把
    // UITransform.contentSize 重置为 SpriteFrame.originalSize（这里是 4×4 白贴图）。
    // 在尾部强制覆盖，肉眼可见的样本才不会缩成 4×4 小点。
    ui.setContentSize(w, h);
    return n;
  }

  private _resetSample(): void {
    Effects.stop(this._sample);
    this._sample.setPosition(this._sampleBase);
    this._sample.setScale(1, 1, 1);
    this._sample.angle = 0;
    const op = this._sample.getComponent(UIOpacity);
    if (op) op.opacity = 255;
    const sp = this._sample.getComponent(Sprite);
    if (sp) sp.color = new Color(90, 170, 255, 255);
  }

  private _resetIcon(): void {
    Effects.stop(this._icon);
    this._icon.setPosition(this._iconBase);
    this._icon.setScale(1, 1, 1);
    const op = this._icon.getComponent(UIOpacity);
    if (op) op.opacity = 255;
    const sp = this._icon.getComponent(Sprite);
    if (sp) sp.color = new Color(255, 200, 90, 255);
  }

  private _resetProjectile(): void {
    Effects.stop(this._projectile);
    this._projectile.setPosition(this._projBase);
    this._projectile.setScale(1, 1, 1);
  }

  // ── 按钮网格 ──
  private _buildButtons(w: number, h: number): void {
    const S = this._sample;
    const specs: ButtonSpec[] = [
      // L1
      { label: 'move', run: () => { this._resetSample(); Effects.move(S, new Vec3(this._sampleBase.x + 140, this._sampleBase.y, 0)); } },
      { label: 'scale', run: () => { this._resetSample(); Effects.scale(S, 1.6); } },
      { label: 'rotate', run: () => { this._resetSample(); Effects.rotate(S, 180); } },
      { label: 'fade', run: () => { this._resetSample(); Effects.fade(S, 50); } },
      { label: 'delay→pop', run: async () => { this._resetSample(); await Effects.delay(0.4); await Effects.pop(S); } },
      // L2
      { label: 'shake', run: () => { this._resetSample(); Effects.shake(S); } },
      { label: 'punch', run: () => { this._resetSample(); Effects.punch(S); } },
      { label: 'bounce', run: () => { this._resetSample(); Effects.bounce(S); } },
      { label: 'pop', run: () => { this._resetSample(); Effects.pop(S); } },
      { label: 'float', run: () => { this._resetSample(); Effects.float(S); } },
      { label: 'flash', run: () => { this._resetSample(); Effects.flash(S); } },
      // L3
      { label: 'hit', run: () => { this._resetSample(); Effects.hit(S, { strength: 1.5 }); } },
      { label: 'hit+camShake', run: () => { this._resetSample(); void Effects.hit(S, { strength: 2 }); void Effects.cameraShake({ strength: 1.5 }); } },
      { label: 'flyTo', run: () => { this._resetProjectile(); Effects.flyTo(this._projectile, { target: this._marker }); } },
      { label: 'jumpTo', run: () => { this._resetProjectile(); Effects.jumpTo(this._projectile, { target: new Vec3(this._projBase.x + 160, this._projBase.y, 0) }); } },
      { label: 'knockBack', run: () => { this._resetSample(); Effects.knockBack(S, { from: new Vec3(this._sampleBase.x - 200, this._sampleBase.y, 0) }); } },
      { label: 'damageNumber', run: () => { Effects.damageNumber(S, 123); } },
      { label: 'damage crit', run: () => { Effects.damageNumber(S, 999, { crit: true }); } },
      { label: 'healNumber', run: () => { Effects.healNumber(S, 45); } },
      { label: 'buffGain', run: () => { this._resetIcon(); Effects.buffGain(this._icon); } },
      { label: 'buffLose', run: () => { this._resetIcon(); Effects.buffLose(this._icon); } },
      // L4
      { label: 'cameraShake', run: () => Effects.cameraShake() },
      { label: 'cameraPunch', run: () => Effects.cameraPunch() },
      { label: 'cameraZoom', run: () => Effects.cameraZoom({ to: 1.2, autoReturn: true }) },
      // L5
      { label: 'hitStop', run: async () => { this._resetSample(); void Effects.move(S, new Vec3(this._sampleBase.x + 180, this._sampleBase.y, 0), { duration: 1.2 }); await Effects.delay(0.3); Effects.hitStop(0.25); } },
      { label: 'slowMotion', run: () => { this._resetSample(); Effects.slowMotion(0.25, 1.2); void Effects.shake(S, { duration: 0.6, strength: 2 }); } },
    ];

    // 网格布局：从屏幕底部往上排。
    const cols = Math.max(3, Math.floor(w / 150));
    const btnW = Math.floor((w - 40) / cols) - 10;
    const btnH = 46;
    const gapX = 10, gapY = 10;
    const startX = -w / 2 + 20 + btnW / 2;
    const startY = -h / 2 + 24 + btnH / 2;

    specs.forEach((spec, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (btnW + gapX);
      const y = startY + row * (btnH + gapY);
      this._makeButton(spec.label, x, y, btnW, btnH, spec.run);
    });

    // 标题
    const title = new Node('Title');
    title.setParent(this.node);
    title.setPosition(0, h / 2 - 40, 0);
    title.addComponent(UITransform).setContentSize(w, 40);
    const lbl = title.addComponent(Label);
    lbl.string = 'FX Gallery · 点击逐个验收';
    lbl.fontSize = 28;
    lbl.color = new Color(235, 238, 245, 255);
    lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
  }

  private _makeButton(text: string, x: number, y: number, w: number, h: number, onClick: () => void): void {
    const n = new Node(`Btn_${text}`);
    n.setParent(this.node);
    n.setPosition(x, y, 0);
    const ui = n.addComponent(UITransform);
    const sp = n.addComponent(Sprite);
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    sp.spriteFrame = this._white;
    sp.color = new Color(46, 58, 82, 255);
    ui.setContentSize(w, h);

    const labelNode = new Node('L');
    labelNode.setParent(n);
    labelNode.addComponent(UITransform).setContentSize(w, h);
    const lbl = labelNode.addComponent(Label);
    lbl.string = text;
    lbl.fontSize = 18;
    lbl.lineHeight = 20;
    lbl.color = new Color(235, 238, 245, 255);
    lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
    lbl.verticalAlign = Label.VerticalAlign.CENTER;
    lbl.overflow = Label.Overflow.SHRINK;

    n.on(Node.EventType.TOUCH_END, onClick, this);
  }

  onDestroy(): void {
    Effects.stopAll();
    Effects.setScreenRoot(null);
  }
}
