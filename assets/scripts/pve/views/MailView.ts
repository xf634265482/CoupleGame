import { Color, EventTouch, Graphics, Label, Node, UITransform } from 'cc';
import type { MailItem } from '../../network/PveService';
import { makeFlatButton, makeLabel } from './pveUiKit';

export interface MailViewCallbacks {
  onClose(): void;
  onClaim(mailId: string): void;
  onClaimAll(): void;
  onDelete(mailId: string): void;
  onOpen(mailId: string): void;
}

const TEXT = new Color(225, 238, 255);
const DIM = new Color(170, 205, 235);
const PANEL = new Color(7, 31, 70, 230);
const BORDER = new Color(255, 214, 110, 210);
const PANEL_W = 640;
const PANEL_H = 900;

const ATTACH_LABELS: Record<string, string> = {
  stardust: '星尘',
  stamina: '体力',
  quenchSand: '淬星砂',
  fusionCore: '聚星核',
  voidHide: '虚空革',
  makeupCards: '补签卡',
};

function attachmentSummary(mail: MailItem): string {
  if (!mail.attachments.length) return '通知';
  return mail.attachments
    .map((item) => `${ATTACH_LABELS[item.type] || item.type}×${item.amount}`)
    .join(' · ');
}

export class MailView {
  private readonly _overlay: Node;
  private readonly _panel: Node;
  private readonly _listRoot: Node;
  private readonly _detailRoot: Node;
  private _mails: MailItem[] = [];
  private _selectedId: string | null = null;

  constructor(parent: Node, private readonly _callbacks: MailViewCallbacks) {
    this._overlay = new Node('MailModal');
    this._overlay.setParent(parent);
    this._overlay.addComponent(UITransform).setContentSize(720, 1280);
    this._overlay.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
      if (event.target === this._overlay) this._callbacks.onClose();
      event.propagationStopped = true;
    });

    this._panel = new Node('MailPanel');
    this._panel.setParent(this._overlay);
    this._panel.setPosition(0, 10);
    this._panel.addComponent(UITransform).setContentSize(PANEL_W, PANEL_H);
    this._panel.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
      event.propagationStopped = true;
    });
    const bg = this._panel.addComponent(Graphics);
    bg.fillColor = PANEL;
    bg.roundRect(-PANEL_W / 2, -PANEL_H / 2, PANEL_W, PANEL_H, 24);
    bg.fill();
    bg.strokeColor = BORDER;
    bg.lineWidth = 2;
    bg.roundRect(-PANEL_W / 2, -PANEL_H / 2, PANEL_W, PANEL_H, 24);
    bg.stroke();

    const title = makeLabel(this._panel, 0, PANEL_H / 2 - 46, 520, 44, 32, new Color(255, 220, 100), Label.HorizontalAlign.CENTER);
    title.string = '邮箱';
    title.isBold = true;

    this._listRoot = new Node('MailList');
    this._listRoot.setParent(this._panel);
    this._listRoot.setPosition(0, 40);
    this._listRoot.addComponent(UITransform).setContentSize(560, 620);

    this._detailRoot = new Node('MailDetail');
    this._detailRoot.setParent(this._panel);
    this._detailRoot.setPosition(0, 40);
    this._detailRoot.addComponent(UITransform).setContentSize(560, 620);
    this._detailRoot.active = false;

    makeFlatButton(
      this._panel,
      '一键领取',
      -130,
      -PANEL_H / 2 + 52,
      200,
      56,
      () => this._callbacks.onClaimAll(),
      new Color(40, 110, 90, 200),
      { noArt: true, border: new Color(120, 220, 170) },
    );
    makeFlatButton(
      this._panel,
      '关闭',
      130,
      -PANEL_H / 2 + 52,
      200,
      56,
      () => this._callbacks.onClose(),
      new Color(105, 65, 45, 190),
      { noArt: true, border: new Color(255, 190, 120) },
    );
  }

  get node(): Node {
    return this._overlay;
  }

  setMails(mails: MailItem[]): void {
    this._mails = mails.slice();
    if (this._selectedId && !this._mails.some((mail) => mail.id === this._selectedId)) {
      this._selectedId = null;
    }
    this._render();
  }

  destroy(): void {
    this._overlay.destroy();
  }

  private _render(): void {
    if (this._selectedId) {
      this._renderDetail();
      return;
    }
    this._renderList();
  }

  private _clear(root: Node): void {
    const children = [...root.children];
    for (const child of children) child.destroy();
  }

  private _renderList(): void {
    this._listRoot.active = true;
    this._detailRoot.active = false;
    this._clear(this._listRoot);
    if (this._mails.length === 0) {
      const empty = makeLabel(this._listRoot, 0, 40, 500, 40, 24, DIM, Label.HorizontalAlign.CENTER);
      empty.string = '暂无邮件';
      return;
    }
    const top = 280;
    this._mails.slice(0, 8).forEach((mail, index) => {
      const y = top - index * 72;
      const row = new Node(`MailRow_${mail.id}`);
      row.setParent(this._listRoot);
      row.setPosition(0, y);
      row.addComponent(UITransform).setContentSize(540, 64);
      const g = row.addComponent(Graphics);
      g.fillColor = mail.unread
        ? new Color(24, 70, 120, 210)
        : new Color(14, 48, 88, 180);
      g.roundRect(-270, -30, 540, 60, 12);
      g.fill();
      const title = makeLabel(row, -20, 8, 420, 28, 22, TEXT, Label.HorizontalAlign.LEFT);
      title.node.setPosition(-250 + 210, 8, 0);
      title.string = `${mail.unread ? '● ' : ''}${mail.title}`;
      const sub = makeLabel(row, -20, -16, 420, 24, 18, DIM, Label.HorizontalAlign.LEFT);
      sub.node.setPosition(-250 + 210, -16, 0);
      sub.string = attachmentSummary(mail);
      makeFlatButton(
        row,
        '查看',
        210,
        0,
        90,
        44,
        () => {
          this._selectedId = mail.id;
          this._callbacks.onOpen(mail.id);
          this._render();
        },
        new Color(50, 90, 140, 200),
        { noArt: true, border: new Color(150, 200, 255) },
      );
    });
  }

  private _renderDetail(): void {
    this._listRoot.active = false;
    this._detailRoot.active = true;
    this._clear(this._detailRoot);
    const mail = this._mails.find((item) => item.id === this._selectedId);
    if (!mail) {
      this._selectedId = null;
      this._renderList();
      return;
    }
    const title = makeLabel(this._detailRoot, 0, 260, 520, 40, 28, new Color(255, 220, 100), Label.HorizontalAlign.CENTER);
    title.string = mail.title;
    title.isBold = true;
    const attach = makeLabel(this._detailRoot, 0, 210, 520, 30, 20, DIM, Label.HorizontalAlign.CENTER);
    attach.string = attachmentSummary(mail);
    const body = makeLabel(this._detailRoot, 0, 40, 520, 280, 22, TEXT, Label.HorizontalAlign.LEFT);
    body.overflow = Label.Overflow.RESIZE_HEIGHT;
    body.string = mail.body || '（无正文）';
    body.node.setPosition(0, 40, 0);

    makeFlatButton(
      this._detailRoot,
      '返回列表',
      -170,
      -260,
      160,
      52,
      () => {
        this._selectedId = null;
        this._render();
      },
      new Color(50, 90, 140, 200),
      { noArt: true, border: new Color(150, 200, 255) },
    );

    const canClaim = mail.attachments.length > 0 && !mail.claimed;
    if (canClaim) {
      makeFlatButton(
        this._detailRoot,
        '领取',
        0,
        -260,
        140,
        52,
        () => this._callbacks.onClaim(mail.id),
        new Color(40, 110, 90, 200),
        { noArt: true, border: new Color(120, 220, 170) },
      );
    }
    const canDelete = mail.attachments.length === 0 || mail.claimed;
    if (canDelete) {
      makeFlatButton(
        this._detailRoot,
        '删除',
        170,
        -260,
        140,
        52,
        () => this._callbacks.onDelete(mail.id),
        new Color(120, 50, 50, 200),
        { noArt: true, border: new Color(255, 150, 140) },
      );
    }
  }
}
