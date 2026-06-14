import { Color, Label, Node, UITransform, Vec3 } from 'cc';
import type { CellType } from '../../types/GameTypes';
import { getCachedSprite } from '../../ui/UiAssets';
import { ensureArtSliced } from '../../ui/UiSprite';
import { makeModalButton } from './UiModalButton';

export type CellEventItem = {
  type: string;
  message: string;
};

const TYPE_TITLE: Record<string, string> = {
  GOLD: '金币格',
  DIAMOND: '钻石格',
  SUPPLY: '补给格',
  SUPPLY_CRATE: '补给箱',
  SUPPLY_REFRESH: '补给刷新',
  AIRDROP: '空投',
  WASTE: '废格',
  BURNING: '燃烧格',
  WEAPON_MERGE: '武器合成',
  EVENT: '事件格',
  GOLD_SHOP: '金币商店',
  LEGENDARY_SHOP: '传说商店',
  LUCKY: '幸运格',
  TRAP: '陷阱',
  BOT_ACTION: 'AI 行动',
};

const TYPE_COLOR: Record<string, Color> = {
  GOLD: new Color(220, 180, 60, 255),
  DIAMOND: new Color(80, 200, 240, 255),
  SUPPLY: new Color(90, 220, 200, 255),
  SUPPLY_CRATE: new Color(90, 220, 200, 255),
  SUPPLY_REFRESH: new Color(90, 220, 200, 255),
  AIRDROP: new Color(90, 220, 200, 255),
  WASTE: new Color(120, 120, 125, 255),
  BURNING: new Color(240, 90, 45, 255),
  WEAPON_MERGE: new Color(255, 190, 80, 255),
  EVENT: new Color(200, 90, 200, 255),
  GOLD_SHOP: new Color(100, 180, 80, 255),
  LEGENDARY_SHOP: new Color(150, 100, 220, 255),
  LUCKY: new Color(240, 200, 70, 255),
  TRAP: new Color(180, 80, 80, 255),
  BOT_ACTION: new Color(140, 200, 255, 255),
};

const TOAST_SLICE = { top: 36, bottom: 36, left: 36, right: 36 };

/** 落格醒目弹窗 */
export class CellEventToast {
  private _root: Node;
  private _box: Node | null = null;
  private _titleLabel: Label | null = null;
  private _msgLabel: Label | null = null;
  private _hideTimer: ReturnType<typeof setTimeout> | null = null;
  private _onDismiss: (() => void) | null = null;
  private _visible = false;

  constructor(parent: Node) {
    this._root = new Node('CellEventToast');
    this._root.setParent(parent);
    this._root.active = false;

    const box = new Node('Box');
    box.setParent(this._root);
    box.setPosition(new Vec3(0, 80, 0));
    box.addComponent(UITransform).setContentSize(620, 320);
    this._box = box;
    const toastSf = getCachedSprite('board/panels/panel_board_toast_9s');
    const modalSf = getCachedSprite('board/panels/panel_board_modal_9s');
    if (toastSf) {
      ensureArtSliced(box, 'ToastArt', toastSf, 620, 320, TOAST_SLICE);
    } else if (modalSf) {
      ensureArtSliced(box, 'ModalArt', modalSf, 620, 320, TOAST_SLICE);
    }

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

    makeModalButton(box, '知道了', 0, -105, 280, 52, () => this.hide());
  }

  applyArt(): void {
    if (!this._box?.isValid) return;
    const ut = this._box.getComponent(UITransform);
    if (!ut) return;
    const w = ut.contentSize.width;
    const h = ut.contentSize.height;
    const toastSf = getCachedSprite('board/panels/panel_board_toast_9s');
    const modalSf = getCachedSprite('board/panels/panel_board_modal_9s');
    if (toastSf) {
      ensureArtSliced(this._box, 'ToastArt', toastSf, w, h, TOAST_SLICE);
    } else if (modalSf) {
      ensureArtSliced(this._box, 'ModalArt', modalSf, w, h, TOAST_SLICE);
    }
  }

  /** @param actorName 如「你」或对方昵称，会显示在标题前 */
  show(
    events: CellEventItem[],
    cellType?: CellType,
    actorName?: string,
    onDismiss?: () => void,
  ): void {
    if (!events.length) return;
    this._onDismiss = onDismiss ?? null;
    const main = events[0];
    const type = cellType || main.type || 'GOLD';
    const title = TYPE_TITLE[type] || TYPE_TITLE[main.type] || '格子';
    const color = TYPE_COLOR[type] || TYPE_COLOR[main.type] || TYPE_COLOR.GOLD;
    const who = actorName ? `${actorName} · ` : '';
    const isBotAction = type === 'BOT_ACTION' || main.type === 'BOT_ACTION';

    if (this._titleLabel) {
      this._titleLabel.string = isBotAction
        ? actorName
          ? `【${actorName}】正在行动`
          : '【AI】正在行动'
        : `${who}停留在【${title}】`;
      this._titleLabel.color = color;
    }
    if (this._msgLabel) {
      this._msgLabel.string = events.map((e) => e.message).join('\n');
    }

    this._root.active = true;
    this._root.setSiblingIndex(9999);
    this._visible = true;

    if (this._hideTimer) clearTimeout(this._hideTimer);
    const durationMs = isBotAction ? 3200 : 4500;
    this._hideTimer = setTimeout(() => this.hide(), durationMs);
  }

  showAwait(
    events: CellEventItem[],
    cellType?: CellType,
    actorName?: string,
  ): Promise<void> {
    return new Promise((resolve) => {
      this.show(events, cellType, actorName, resolve);
    });
  }

  /** 本回合移动结束提示（仅当前行动玩家） */
  showMoveComplete(message: string, onDismiss?: () => void): void {
    if (!message) return;
    this._onDismiss = onDismiss ?? null;
    if (this._titleLabel) {
      this._titleLabel.string = '移动完成';
      this._titleLabel.color = new Color(120, 200, 255, 255);
    }
    if (this._msgLabel) {
      this._msgLabel.string = message;
    }
    this._root.active = true;
    this._root.setSiblingIndex(9999);
    this._visible = true;
    if (this._hideTimer) clearTimeout(this._hideTimer);
    this._hideTimer = setTimeout(() => this.hide(), 4800);
  }

  showMoveCompleteAwait(message: string): Promise<void> {
    return new Promise((resolve) => {
      this.showMoveComplete(message, resolve);
    });
  }

  hide(): void {
    this._visible = false;
    this._root.active = false;
    if (this._hideTimer) {
      clearTimeout(this._hideTimer);
      this._hideTimer = null;
    }
    const done = this._onDismiss;
    this._onDismiss = null;
    done?.();
  }

  get visible(): boolean {
    return this._visible;
  }
}
