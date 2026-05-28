import { Button, Color, Graphics, Label, Node, UITransform, Vec3 } from 'cc';
import { countdownSecRemaining } from '../core/Countdown';

export type MinigamePromptOptions = {
  title: string;
  message: string;
  countdownSec?: number;
  confirmText?: string;
};

/** 小游戏提示（整秒倒计时 + 确认）；进入小游戏前由 dismissAll 统一关闭 */
export class MinigamePromptDialog {
  private static _instances = new Set<MinigamePromptDialog>();

  private _root: Node;
  private _titleLabel: Label | null = null;
  private _msgLabel: Label | null = null;
  private _countdownLabel: Label | null = null;
  private _resolve: (() => void) | null = null;
  private _timer: ReturnType<typeof setInterval> | null = null;
  private _deadline = 0;
  private _shownSec = -1;

  /** 关闭所有实例（切场景进吹牛前调用） */
  static dismissAll(): void {
    for (const d of MinigamePromptDialog._instances) {
      d.hide();
    }
  }

  constructor(parent: Node) {
    MinigamePromptDialog._instances.add(this);
    this._root = new Node('MinigamePromptDialog');
    this._root.setParent(parent);
    this._root.active = false;

    const mask = new Node('Mask');
    mask.setParent(this._root);
    mask.addComponent(UITransform).setContentSize(750, 1280);
    const mg = mask.addComponent(Graphics);
    mg.fillColor = new Color(0, 0, 0, 180);
    mg.rect(-375, -640, 750, 1280);
    mg.fill();

    const box = new Node('Box');
    box.setParent(this._root);
    box.setPosition(new Vec3(0, 60, 0));
    box.addComponent(UITransform).setContentSize(640, 380);
    const bg = box.addComponent(Graphics);
    bg.fillColor = new Color(32, 38, 55, 252);
    bg.rect(-320, -190, 640, 380);
    bg.fill();

    const titleN = new Node('Title');
    titleN.setParent(box);
    titleN.setPosition(new Vec3(0, 130, 0));
    titleN.addComponent(UITransform).setContentSize(600, 52);
    this._titleLabel = titleN.addComponent(Label);
    this._titleLabel.fontSize = 40;
    this._titleLabel.lineHeight = 48;
    this._titleLabel.color = new Color(255, 220, 100, 255);
    this._titleLabel.horizontalAlign = Label.HorizontalAlign.CENTER;

    const msgN = new Node('Msg');
    msgN.setParent(box);
    msgN.setPosition(new Vec3(0, 40, 0));
    msgN.addComponent(UITransform).setContentSize(580, 140);
    this._msgLabel = msgN.addComponent(Label);
    this._msgLabel.fontSize = 30;
    this._msgLabel.lineHeight = 38;
    this._msgLabel.color = new Color(235, 238, 245, 255);
    this._msgLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    this._msgLabel.overflow = Label.Overflow.SHRINK;

    const cdN = new Node('Countdown');
    cdN.setParent(box);
    cdN.setPosition(new Vec3(0, -50, 0));
    cdN.addComponent(UITransform).setContentSize(580, 40);
    this._countdownLabel = cdN.addComponent(Label);
    this._countdownLabel.fontSize = 28;
    this._countdownLabel.color = new Color(180, 200, 255, 255);
    this._countdownLabel.horizontalAlign = Label.HorizontalAlign.CENTER;

    const ok = new Node('Ok');
    ok.setParent(box);
    ok.setPosition(new Vec3(0, -120, 0));
    ok.addComponent(UITransform).setContentSize(300, 58);
    const og = ok.addComponent(Graphics);
    og.fillColor = new Color(55, 140, 90, 255);
    og.rect(-150, -29, 300, 58);
    og.fill();
    const ol = new Node('L');
    ol.setParent(ok);
    ol.addComponent(UITransform).setContentSize(300, 58);
    const olbl = ol.addComponent(Label);
    olbl.string = '确认';
    olbl.fontSize = 32;
    olbl.color = new Color(255, 255, 255, 255);
    olbl.horizontalAlign = Label.HorizontalAlign.CENTER;
    olbl.verticalAlign = Label.VerticalAlign.CENTER;
    ok.addComponent(Button);
    ok.on(Button.EventType.CLICK, () => this._finish(), this);
  }

  show(opts: MinigamePromptOptions): Promise<void> {
    return new Promise((resolve) => {
      if (this._resolve) {
        const prev = this._resolve;
        this._resolve = null;
        prev();
      }
      if (this._timer) {
        clearInterval(this._timer);
        this._timer = null;
      }
      this._resolve = resolve;
      const sec = opts.countdownSec ?? 5;
      this._deadline = Date.now() + sec * 1000;
      this._shownSec = -1;

      if (this._titleLabel) this._titleLabel.string = opts.title;
      if (this._msgLabel) this._msgLabel.string = opts.message;
      this._updateCountdown();

      this._root.active = true;
      this._root.setSiblingIndex(10000);

      this._timer = setInterval(() => {
        if (Date.now() >= this._deadline) {
          this._finish();
          return;
        }
        this._updateCountdown();
      }, 1000);
    });
  }

  private _updateCountdown(): void {
    if (!this._countdownLabel) return;
    const sec = countdownSecRemaining(this._deadline);
    if (sec === this._shownSec) return;
    this._shownSec = sec;
    this._countdownLabel.string = `剩余 ${sec} 秒自动继续，也可点确认`;
  }

  private _finish(): void {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    this._root.active = false;
    const done = this._resolve;
    this._resolve = null;
    done?.();
  }

  hide(): void {
    this._finish();
  }

  destroy(): void {
    this.hide();
    MinigamePromptDialog._instances.delete(this);
    this._root.destroy();
  }
}
