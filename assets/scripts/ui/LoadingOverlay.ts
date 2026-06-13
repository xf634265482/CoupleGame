// 上线前必做（260613-prelaunch-must-do）阶段1：大厅 → 棋盘/PVE 切换 spinner（AC-501）。
// 全屏半透明遮罩 + Graphics 旋转圆弧 + 文案，挂在调用方传入的 Canvas 节点下；
// 不引入图片资源，10s 超时自动 hide 并触发 onTimeout 回调（由调用方 toast 提示）。

import { _decorator, Color, Component, Graphics, Label, Node, UITransform } from 'cc';
import { applyUiLayerTree, visibleDesignSize } from '../platform/wechat/ViewAdapt';

const { ccclass } = _decorator;

const MASK_ALPHA = 160;
const SPINNER_RADIUS = 28;
const SPINNER_LINE_WIDTH = 6;
/** 圆弧每秒旋转角度 */
const SPIN_SPEED_DEG = 320;
/** 圆弧弧长（弧度），约 80% 圆周 */
const SPINNER_ARC = Math.PI * 1.6;
const TIMEOUT_MS = 10000;

/** 内部组件：负责圆弧旋转动画，不对外暴露。 */
@ccclass('LoadingOverlaySpinner')
class LoadingOverlaySpinner extends Component {
  private _angle = 0;
  private _graphics: Graphics | null = null;

  onLoad(): void {
    this._graphics = this.getComponent(Graphics) || this.addComponent(Graphics);
    this._draw();
  }

  update(dt: number): void {
    this._angle = (this._angle + dt * SPIN_SPEED_DEG) % 360;
    this._draw();
  }

  private _draw(): void {
    const g = this._graphics;
    if (!g) return;
    g.clear();
    g.lineWidth = SPINNER_LINE_WIDTH;
    g.strokeColor = new Color(255, 255, 255, 230);
    const start = (this._angle * Math.PI) / 180;
    g.arc(0, 0, SPINNER_RADIUS, start, start + SPINNER_ARC, false);
    g.stroke();
  }
}

/**
 * 场景切换/异步加载期间的全屏遮罩。
 * - `show(host, text)`：在 host（场景 Canvas 根节点）下创建/复用遮罩并显示，10s 后自动 hide + onTimeout
 * - `update(text)`：更新文案，不重置超时
 * - `hide()`：隐藏遮罩并清除超时计时
 */
export class LoadingOverlay {
  private static _node: Node | null = null;
  private static _label: Label | null = null;
  private static _timeoutTimer: ReturnType<typeof setTimeout> | null = null;

  static show(host: Node, text = '加载中…', onTimeout?: () => void): void {
    this._ensureNode(host);
    if (this._node) {
      this._node.active = true;
      this._node.setSiblingIndex(host.children.length - 1);
    }
    if (this._label) this._label.string = text;

    this._clearTimeout();
    this._timeoutTimer = setTimeout(() => {
      this.hide();
      onTimeout?.();
    }, TIMEOUT_MS);
  }

  static update(text: string): void {
    if (this._label) this._label.string = text;
  }

  static hide(): void {
    if (this._node?.isValid) this._node.active = false;
    this._clearTimeout();
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

    const mask = root.addComponent(Graphics);
    mask.fillColor = new Color(0, 0, 0, MASK_ALPHA);
    mask.rect(-w / 2, -h / 2, w, h);
    mask.fill();

    const spinnerNode = new Node('Spinner');
    spinnerNode.setParent(root);
    spinnerNode.setPosition(0, 40, 0);
    spinnerNode.addComponent(UITransform).setContentSize(SPINNER_RADIUS * 2, SPINNER_RADIUS * 2);
    spinnerNode.addComponent(LoadingOverlaySpinner);

    const labelNode = new Node('Label');
    labelNode.setParent(root);
    labelNode.setPosition(0, -40, 0);
    labelNode.addComponent(UITransform).setContentSize(Math.round(w * 0.8), 60);
    const label = labelNode.addComponent(Label);
    label.fontSize = 28;
    label.lineHeight = 34;
    label.color = new Color(235, 235, 235, 255);
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = Label.Overflow.SHRINK;

    applyUiLayerTree(root, host.layer);

    this._node = root;
    this._label = label;
  }
}
