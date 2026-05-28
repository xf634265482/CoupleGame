import { Button, Color, Graphics, Label, Node, UITransform, Vec3 } from 'cc';
import type { CellType } from '../../types/GameTypes';

export type CellEventItem = {
  type: string;
  message: string;
};

const TYPE_TITLE: Record<string, string> = {
  NORMAL: '普通格',
  GOLD: '金币格',
  DIAMOND: '钻石格',
  EVENT: '事件格',
  MINIGAME: '小游戏格',
};

const TYPE_COLOR: Record<string, Color> = {
  NORMAL: new Color(120, 125, 140, 255),
  GOLD: new Color(220, 180, 60, 255),
  DIAMOND: new Color(80, 200, 240, 255),
  EVENT: new Color(200, 90, 200, 255),
  MINIGAME: new Color(230, 120, 70, 255),
};

/** 落格醒目弹窗 */
export class CellEventToast {
  private _root: Node;
  private _titleLabel: Label | null = null;
  private _msgLabel: Label | null = null;
  private _hideTimer: ReturnType<typeof setTimeout> | null = null;
  private _visible = false;

  constructor(parent: Node) {
    this._root = new Node('CellEventToast');
    this._root.setParent(parent);
    this._root.active = false;

    const mask = new Node('Mask');
    mask.setParent(this._root);
    mask.addComponent(UITransform).setContentSize(900, 1400);
    const mg = mask.addComponent(Graphics);
    mg.fillColor = new Color(0, 0, 0, 160);
    mg.rect(-450, -700, 900, 1400);
    mg.fill();

    const box = new Node('Box');
    box.setParent(this._root);
    box.setPosition(new Vec3(0, 80, 0));
    box.addComponent(UITransform).setContentSize(620, 320);
    const bg = box.addComponent(Graphics);
    bg.fillColor = new Color(32, 36, 52, 250);
    bg.rect(-310, -160, 620, 320);
    bg.fill();

    const titleN = new Node('Title');
    titleN.setParent(box);
    titleN.setPosition(new Vec3(0, 95, 0));
    titleN.addComponent(UITransform).setContentSize(580, 56);
    this._titleLabel = titleN.addComponent(Label);
    this._titleLabel.fontSize = 40;
    this._titleLabel.lineHeight = 48;
    this._titleLabel.color = new Color(255, 220, 100, 255);
    this._titleLabel.horizontalAlign = Label.HorizontalAlign.CENTER;

    const msgN = new Node('Msg');
    msgN.setParent(box);
    msgN.setPosition(new Vec3(0, 10, 0));
    msgN.addComponent(UITransform).setContentSize(560, 120);
    this._msgLabel = msgN.addComponent(Label);
    this._msgLabel.fontSize = 32;
    this._msgLabel.lineHeight = 40;
    this._msgLabel.color = new Color(240, 240, 245, 255);
    this._msgLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    this._msgLabel.overflow = Label.Overflow.SHRINK;

    const ok = new Node('Ok');
    ok.setParent(box);
    ok.setPosition(new Vec3(0, -105, 0));
    ok.addComponent(UITransform).setContentSize(280, 56);
    const og = ok.addComponent(Graphics);
    og.fillColor = new Color(60, 130, 210, 255);
    og.rect(-140, -28, 280, 56);
    og.fill();
    const ol = new Node('L');
    ol.setParent(ok);
    ol.addComponent(UITransform).setContentSize(280, 56);
    const olbl = ol.addComponent(Label);
    olbl.string = '知道了';
    olbl.fontSize = 34;
    olbl.color = new Color(255, 255, 255, 255);
    olbl.horizontalAlign = Label.HorizontalAlign.CENTER;
    olbl.verticalAlign = Label.VerticalAlign.CENTER;
    ok.addComponent(Button);
    ok.on(Button.EventType.CLICK, () => this.hide(), this);
  }

  /** @param actorName 如「你」或对方昵称，会显示在标题前 */
  show(events: CellEventItem[], cellType?: CellType, actorName?: string): void {
    if (!events.length) return;
    const main = events[0];
    const type = cellType || main.type || 'NORMAL';
    const title = TYPE_TITLE[type] || '格子';
    const color = TYPE_COLOR[type] || TYPE_COLOR.NORMAL;
    const who = actorName ? `${actorName} · ` : '';

    if (this._titleLabel) {
      this._titleLabel.string = `${who}停留在【${title}】`;
      this._titleLabel.color = color;
    }
    if (this._msgLabel) {
      this._msgLabel.string = events.map((e) => e.message).join('\n');
    }

    this._root.active = true;
    this._root.setSiblingIndex(9999);
    this._visible = true;

    if (this._hideTimer) clearTimeout(this._hideTimer);
    this._hideTimer = setTimeout(() => this.hide(), 4500);
  }

  hide(): void {
    this._visible = false;
    this._root.active = false;
    if (this._hideTimer) {
      clearTimeout(this._hideTimer);
      this._hideTimer = null;
    }
  }

  get visible(): boolean {
    return this._visible;
  }
}
