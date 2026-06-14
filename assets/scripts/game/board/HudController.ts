import { Button, Color, Graphics, Label, Node, SpriteFrame, UITransform, Vec3 } from 'cc';
import {
  CONTEST_END_ROUND,
  DEVELOPMENT_END_ROUND,
  INITIAL_HP,
  WEAPON_STATS,
} from '../../core/Constants';
import { GameSession } from '../../core/GameSession';
import { playerDisplayName } from '../playerDisplayName';
import type { GameDoc, GamePlayer } from '../../types/GameTypes';
import {
  getCachedSprite,
  ITEM_ICON_KEY,
  loadUiSprite,
  playerStatusBadges,
  type StatusBadge,
} from '../../ui/UiAssets';
import {
  ensureArtChild,
  ensureArtSliced,
  ensureArtStretch,
  pickSpriteLayout,
} from '../../ui/UiSprite';
import { boardUiLayout } from './BoardUiLayout';

const HUD_SLOT_COUNT = 4;
const AVATAR_SIZE = 58;
const PAWN_SIZE = 44;
/** 头像圆框中心（对齐 card_board_player_9s 左侧圆框） */
function hudCardAvatarPos(w: number, h: number): Vec3 {
  return new Vec3(-w / 2 + w * 0.17, h / 2 - h * 0.34, 0);
}

/** 玩家名：圆框正下方 */
function hudCardNamePos(w: number, h: number): Vec3 {
  return new Vec3(-w / 2 + w * 0.17, h / 2 - h * 0.62, 0);
}

function hudCardPawnSize(w: number, h: number): number {
  return Math.round(Math.min(w, h) * 0.28);
}
const CARD_EQUIP_BOTTOM_INSET = 20;
const CARD_EQUIP_SLOT_H = 26;
const CARD_ART_ASPECT = 140 / 260;
const HUD_PANEL_SLICE = { top: 28, bottom: 16, left: 14, right: 14 };
const HUD_STATUS_ABOVE_PANEL = 18;
const HUD_STATUS_H = 30;
/** 与游戏说明状态图标同量级，约为旧版悬浮大图的一半 */
const HUD_STATUS_BADGE_SIZE = 22;

const SEAT_COLORS = [
  new Color(255, 100, 100, 255),
  new Color(100, 180, 255, 255),
  new Color(120, 220, 140, 255),
  new Color(255, 210, 90, 255),
];

function uiScale(): number {
  return 0.78;
}

const S = uiScale();

function hudFrame() {
  const ui = boardUiLayout();
  return {
    center: ui.playersCenter,
    w: ui.leftW,
    h: ui.bottomH,
  };
}

function hudCardSize(hudW: number): { cardW: number; cardH: number } {
  const gap = 10;
  const cardW = Math.round((hudW - (HUD_SLOT_COUNT - 1) * gap) / HUD_SLOT_COUNT);
  const cardH = Math.round(cardW * CARD_ART_ASPECT);
  return { cardW, cardH };
}

function hudCardsCenterY(frameH: number, cardH: number): number {
  const innerTop = frameH / 2 - HUD_PANEL_SLICE.top;
  const innerBottom = -frameH / 2 + HUD_PANEL_SLICE.bottom;
  return (innerTop + innerBottom) / 2 - Math.round(cardH * 0.02);
}

function hudStatusY(frameH: number): number {
  return frameH / 2 + HUD_STATUS_ABOVE_PANEL + HUD_STATUS_H / 2;
}

export type HudActionCallbacks = {
  onRoll: () => void;
  onItem: () => void;
  onAttack: () => void;
  onEndTurn: () => void;
  onQuit?: () => void;
  /** 点击玩家信息卡切换棋盘视角 */
  onFocusPlayer?: (seat: number) => void;
};

type EquipSlotUi = {
  root: Node;
  label: Label;
};

type PlayerCardUi = {
  root: Node;
  name: Label;
  avatar: Label;
  hpText: Label;
  hpFill: Node;
  gold: Label;
  diamond: Label;
  equip: EquipSlotUi[];
  statusRow: Node;
};

function attackValue(p: GamePlayer): number {
  if (!p.weapon || !WEAPON_STATS[p.weapon]) return p.weaponAttackBonus || 0;
  return WEAPON_STATS[p.weapon].damage + (p.weaponAttackBonus || 0);
}

function phaseLabel(game: GameDoc): string {
  if (game.survivalPhase === 'FINAL') return '决战';
  if (game.survivalPhase === 'CONTEST') return '争夺';
  const round = game.actionRoundCount ?? 0;
  if (round >= CONTEST_END_ROUND) return '决战';
  if (round >= DEVELOPMENT_END_ROUND) return '争夺';
  return '发育';
}

function hpRatio(p: GamePlayer): number {
  const hp = Math.max(0, p.hp ?? INITIAL_HP);
  const maxHp = Math.max(1, p.maxHp ?? INITIAL_HP);
  return Math.max(0, Math.min(1, hp / maxHp));
}

function hpText(p: GamePlayer): string {
  const hp = Math.max(0, p.hp ?? INITIAL_HP);
  const maxHp = Math.max(1, p.maxHp ?? INITIAL_HP);
  return `${hp}/${maxHp}`;
}

function formatTurnActionsHint(ta: GamePlayer['turnActions'] | undefined): string {
  if (!ta) return '';
  const dice = ta.rolled
    ? ta.extraRollAvailable && !ta.extraRolled
      ? '骰✓可再掷'
      : '骰✓'
    : '骰○';
  const item = ta.usedItem ? '道具✓' : '道具○';
  const atk = ta.attacked ? '攻✓' : '攻○';
  return `${dice} ${item} ${atk}`;
}

function equipSlotIconKeys(p: GamePlayer): (string | null)[] {
  const weaponKey = p.weapon ? ITEM_ICON_KEY[p.weapon] ?? null : null;
  const armorKey = p.armor ? ITEM_ICON_KEY[p.armor] ?? null : null;
  let shoesKey: string | null = null;
  if (p.shoes === 'RAPID_SHOES') shoesKey = ITEM_ICON_KEY.RAPID_SHOES;
  else if (p.shoes === 'MARCHING_SHOES') shoesKey = ITEM_ICON_KEY.MARCHING_SHOES;
  return [weaponKey, armorKey, shoesKey, null];
}

function pawnSpriteKey(p: GamePlayer): string {
  return `board/pawns/pawn_player_${(p.seat % 4) + 1}`;
}

/** 战斗 HUD：HP/装备/四行动按钮 → AC-3, AC-20 */
export class HudController {
  private _root: Node;
  private _statusLabel: Label | null = null;
  private _playerCards: PlayerCardUi[] = [];
  private _cardsRoot: Node | null = null;
  private _callbacks: HudActionCallbacks;
  private _busy = false;
  private _errorHint = '';
  private _cardStyle: string[] = [];
  private _cardSeats: number[] = [];
  private _cardDims: { w: number; h: number } | null = null;
  private _focusSeat: number | null = null;
  private _loadingAvatarKeys = new Set<string>();
  private _loadingEquipIconKeys = new Set<string>();
  private _countdownTimer: ReturnType<typeof setInterval> | null = null;
  private _lastCountdownKey = '';
  private _lastGame: GameDoc | null = null;
  private _useCardArt = false;

  constructor(parent: Node, callbacks: HudActionCallbacks) {
    const frame = hudFrame();
    this._root = new Node('Hud');
    this._root.setParent(parent);
    this._root.setPosition(frame.center);
    this._root.addComponent(UITransform).setContentSize(frame.w, frame.h);
    this._callbacks = callbacks;
    this._build();
  }

  setVisible(visible: boolean): void {
    if (this._root?.isValid) {
      this._root.active = visible;
    }
  }

  private _build(): void {
    const frame = hudFrame();
    const HUD_W = frame.w;
    const HUD_H = frame.h;
    const panel = new Node('Panel');
    panel.setParent(this._root);
    panel.addComponent(UITransform).setContentSize(HUD_W, HUD_H);
    const pg = panel.addComponent(Graphics);
    pg.fillColor = new Color(18, 20, 28, 235);
    pg.rect(-HUD_W / 2, -HUD_H / 2, HUD_W, HUD_H);
    pg.fill();

    const statusN = new Node('Status');
    statusN.setParent(this._root);
    statusN.setPosition(new Vec3(0, hudStatusY(HUD_H), 0));
    statusN.addComponent(UITransform).setContentSize(HUD_W - 72, HUD_STATUS_H);
    this._statusLabel = statusN.addComponent(Label);
    this._statusLabel.fontSize = 20;
    this._statusLabel.lineHeight = 26;
    this._statusLabel.color = new Color(255, 230, 150, 255);
    this._statusLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    this._statusLabel.string = '对局加载中…';

    this._cardsRoot = new Node('PlayerCards');
    this._cardsRoot.setParent(this._root);
    const { cardH } = hudCardSize(HUD_W);
    this._cardsRoot.setPosition(new Vec3(0, hudCardsCenterY(HUD_H, cardH), 0));
  }

  private _makeBtn(
    text: string,
    x: number,
    y: number,
    w: number,
    h: number,
    color: Color,
    onClick: () => void,
  ): Node {
    const btn = new Node(`Btn_${text}`);
    btn.setParent(this._root);
    btn.setPosition(new Vec3(x, y, 0));
    btn.addComponent(UITransform).setContentSize(w, h);
    const g = btn.addComponent(Graphics);
    g.fillColor = color;
    g.rect(-w / 2, -h / 2, w, h);
    g.fill();
    const lblNode = new Node('L');
    lblNode.setParent(btn);
    lblNode.addComponent(UITransform).setContentSize(w, h);
    const lbl = lblNode.addComponent(Label);
    lbl.string = text;
    lbl.fontSize = Math.round(28 * S);
    lbl.color = new Color(255, 255, 255, 255);
    lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
    lbl.verticalAlign = Label.VerticalAlign.CENTER;
    btn.addComponent(Button);
    btn.on(Button.EventType.CLICK, () => {
      if (this._busy) return;
      const b = btn.getComponent(Button);
      if (b && !b.interactable) return;
      onClick();
    }, this);
    return btn;
  }

  private _ensureCards(cardW: number, cardH: number): void {
    if (!this._cardsRoot?.isValid) return;
    this._playerCards = this._playerCards.filter((c) => c.root?.isValid);
    const dims = this._cardDims;
    const sizeChanged =
      dims == null ||
      Math.abs(dims.w - cardW) > 1 ||
      Math.abs(dims.h - cardH) > 1;
    if (sizeChanged && this._playerCards.length > 0) {
      for (const card of this._playerCards) card.root.destroy();
      this._playerCards = [];
      this._cardStyle = [];
    }
    this._cardDims = { w: cardW, h: cardH };
    while (this._playerCards.length < HUD_SLOT_COUNT) {
      const ui = this._makeCard(this._cardsRoot, cardW, cardH);
      this._playerCards.push(ui);
    }
    const gap = 10;
    const totalW = HUD_SLOT_COUNT * cardW + (HUD_SLOT_COUNT - 1) * gap;
    let x = -totalW / 2 + cardW / 2;
    this._playerCards.forEach((c, idx) => {
      if (!c.root?.isValid) return;
      c.root.active = true;
      c.root.setPosition(new Vec3(x, 0, 0));
      x += cardW + gap;
    });
  }

  destroy(): void {
    this.stopCountdown();
    this._lastGame = null;
  }

  relayout(): void {
    const frame = hudFrame();
    this._root.setPosition(frame.center);
    this._root.getComponent(UITransform)?.setContentSize(frame.w, frame.h);
    const panel = this._root.getChildByName('Panel');
    if (panel) {
      panel.getComponent(UITransform)?.setContentSize(frame.w, frame.h);
    }
    const { cardH } = hudCardSize(frame.w);
    if (this._cardsRoot?.isValid) {
      this._cardsRoot.setPosition(new Vec3(0, hudCardsCenterY(frame.h, cardH), 0));
    }
    const statusN = this._root.getChildByName('Status');
    if (statusN) {
      statusN.setPosition(new Vec3(0, hudStatusY(frame.h), 0));
    }
    if (this._useCardArt) {
      this.applyArt();
    }
  }

  applyArt(): void {
    this._useCardArt = !!getCachedSprite('board/panels/card_board_player_9s');
    const panel = this._root.getChildByName('Panel');
    const frame = hudFrame();
    const hudSf = getCachedSprite('board/panels/panel_board_hud_9s');
    const panelGraphics = panel?.getComponent(Graphics);
    if (panel && hudSf) {
      ensureArtSliced(panel, 'HudArt', hudSf, frame.w, frame.h, HUD_PANEL_SLICE);
      if (panelGraphics) panelGraphics.enabled = false;
    } else if (panelGraphics) {
      panelGraphics.enabled = true;
      if (!hudSf) {
        void loadUiSprite('board/panels/panel_board_hud_9s').then((sf) => {
          if (sf) this.applyArt();
        });
      }
    }

    if (!this._useCardArt) {
      void loadUiSprite('board/panels/card_board_player_9s').then((sf) => {
        if (sf) this.applyArt();
      });
    }

    this._root.getChildByName('Status')?.getChildByName('StatusArt')?.destroy();

    for (const card of this._playerCards) {
      const g = card.root?.getComponent(Graphics);
      const ut = card.root?.getComponent(UITransform);
      if (!ut) continue;
      const w = ut.contentSize.width;
      const h = ut.contentSize.height;
      if (this._useCardArt) {
        const sf = getCachedSprite('board/panels/card_board_player_9s');
        if (sf && card.root) {
          ensureArtStretch(card.root, 'CardArt', sf, w, h);
          card.root.getChildByName('CardArt')?.setSiblingIndex(0);
          if (g) g.enabled = false;
        }
      } else if (g) {
        g.enabled = true;
      }
      const avatarN = card.root?.getChildByName('Avatar');
      const nameN = card.root?.getChildByName('Name');
      if (avatarN) {
        avatarN.setPosition(hudCardAvatarPos(w, h));
        avatarN.setSiblingIndex(1);
      }
      if (nameN) {
        nameN.setPosition(hudCardNamePos(w, h));
      }
    }
    this._cardStyle = [];
    if (this._lastGame) this.refresh(this._lastGame);
  }

  private _makeInfoLine(
    parent: Node,
    nodeName: string,
    x: number,
    y: number,
    w: number,
    text: string,
  ): Label {
    const n = new Node(nodeName);
    n.setParent(parent);
    n.setPosition(new Vec3(x, y, 0));
    n.addComponent(UITransform).setContentSize(w, 26);
    const lbl = n.addComponent(Label);
    lbl.string = text;
    lbl.fontSize = 18;
    lbl.lineHeight = 23;
    lbl.color = new Color(245, 242, 232, 255);
    lbl.horizontalAlign = Label.HorizontalAlign.LEFT;
    lbl.verticalAlign = Label.VerticalAlign.CENTER;
    lbl.overflow = Label.Overflow.SHRINK;
    return lbl;
  }

  private _redrawHpFill(node: Node, ratio: number, defeated: boolean): void {
    const ut = node.getComponent(UITransform);
    const g = node.getComponent(Graphics);
    if (!ut || !g) return;
    const fullW = ut.contentSize.width;
    const h = ut.contentSize.height;
    const w = Math.max(2, Math.round(fullW * ratio));
    g.clear();
    g.fillColor = defeated
      ? new Color(75, 75, 82, 230)
      : new Color(220, 42, 48, 255);
    g.rect(0, -h / 2, w, h);
    g.fill();
    if (!defeated && ratio > 0.08) {
      g.fillColor = new Color(255, 120, 110, 130);
      g.rect(2, -h / 2 + 2, Math.max(1, w - 4), 4);
      g.fill();
    }
  }

  private _loadAvatarLater(key: string): void {
    if (this._loadingAvatarKeys.has(key)) return;
    this._loadingAvatarKeys.add(key);
    void loadUiSprite(key).then((sf) => {
      this._loadingAvatarKeys.delete(key);
      if (!sf || !this._lastGame) return;
      this.refresh(this._lastGame);
    });
  }

  private _loadEquipIconLater(key: string): void {
    if (this._loadingEquipIconKeys.has(key)) return;
    this._loadingEquipIconKeys.add(key);
    void loadUiSprite(key).then((sf) => {
      this._loadingEquipIconKeys.delete(key);
      if (!sf || !this._lastGame) return;
      this.refresh(this._lastGame);
    });
  }

  private _paintEquipSlot(slot: EquipSlotUi, iconKey: string | null, attackText: string): void {
    const slotNode = slot.root;
    const ut = slotNode.getComponent(UITransform);
    const slotW = ut?.contentSize.width ?? 48;
    const slotH = ut?.contentSize.height ?? 30;
    slot.label.string = attackText;
    slot.label.node.active = !!attackText;
    if (iconKey) {
      const sf = getCachedSprite(iconKey);
      if (sf) {
        ensureArtChild(slotNode, 'EquipArt', sf, slotW - 6, slotH - 4);
        return;
      }
      slotNode.getChildByName('EquipArt')?.destroy();
      this._loadEquipIconLater(iconKey);
      return;
    }
    slotNode.getChildByName('EquipArt')?.destroy();
  }

  private _paintStatusRow(statusRow: Node, badges: StatusBadge[], cardW: number, cardH: number): void {
    statusRow.removeAllChildren();
    if (!badges.length) return;
    const iconSize = HUD_STATUS_BADGE_SIZE;
    const gap = 4;
    const totalW = badges.length * iconSize + Math.max(0, badges.length - 1) * gap;
    const statX = -cardW / 2 + 96;
    const statRight = cardW / 2 - 14;
    const statW = Math.max(120, statRight - statX);
    const midUpperY = cardH * 0.04;
    const midLowerY = -cardH * 0.1;
    const statusX = statX + statW - iconSize / 2 - 10;
    const statusY = (midUpperY + midLowerY) / 2;
    statusRow.setPosition(new Vec3(statusX, statusY, 0));
    statusRow.getComponent(UITransform)?.setContentSize(totalW, iconSize);
    let x = -totalW / 2 + iconSize / 2;
    for (const badge of badges) {
      const slot = new Node('Badge');
      slot.setParent(statusRow);
      slot.setPosition(new Vec3(x, 0, 0));
      slot.addComponent(UITransform).setContentSize(iconSize, iconSize);
      const paintBadge = (sf: SpriteFrame) => {
        const lay = pickSpriteLayout(sf, iconSize, iconSize);
        ensureArtChild(slot, 'Art', sf, lay.w, lay.h);
      };
      const sf = getCachedSprite(badge.key);
      if (sf) {
        paintBadge(sf);
      } else {
        void loadUiSprite(badge.key).then((loaded) => {
          if (loaded && slot.isValid) paintBadge(loaded);
        });
      }
      if (badge.count != null && badge.count > 0) {
        const cntN = new Node('Count');
        cntN.setParent(slot);
        cntN.setPosition(new Vec3(8, -8, 0));
        cntN.addComponent(UITransform).setContentSize(16, 14);
        const cnt = cntN.addComponent(Label);
        cnt.string = String(badge.count);
        cnt.fontSize = 12;
        cnt.lineHeight = 14;
        cnt.color = new Color(255, 240, 200, 255);
        cnt.horizontalAlign = Label.HorizontalAlign.CENTER;
        cnt.verticalAlign = Label.VerticalAlign.CENTER;
      }
      x += iconSize + gap;
    }
  }

  private _makeCard(parent: Node, w: number, h: number): PlayerCardUi {
    const root = new Node('Card');
    root.setParent(parent);
    root.addComponent(UITransform).setContentSize(w, h);

    const bg = root.addComponent(Graphics);
    bg.fillColor = new Color(45, 50, 68, 255);
    bg.rect(-w / 2, -h / 2, w, h);
    bg.fill();
    if (getCachedSprite('board/panels/card_board_player_9s')) {
      const sf = getCachedSprite('board/panels/card_board_player_9s');
      if (sf) {
        ensureArtStretch(root, 'CardArt', sf, w, h);
        root.getChildByName('CardArt')?.setSiblingIndex(0);
        bg.enabled = false;
      }
    } else {
      bg.enabled = true;
    }

    const topY = h / 2 - 26;
    const avatarPos = hudCardAvatarPos(w, h);
    const namePos = hudCardNamePos(w, h);
    const midUpperY = h * 0.04;
    const midLowerY = -h * 0.1;

    const avatarN = new Node('Avatar');
    avatarN.setParent(root);
    avatarN.setPosition(avatarPos);
    avatarN.setSiblingIndex(1);
    avatarN.addComponent(UITransform).setContentSize(AVATAR_SIZE, AVATAR_SIZE);
    const avatarLabelN = new Node('Initial');
    avatarLabelN.setParent(avatarN);
    avatarLabelN.addComponent(UITransform).setContentSize(AVATAR_SIZE - 4, AVATAR_SIZE - 4);
    const avatar = avatarLabelN.addComponent(Label);
    avatar.fontSize = 30;
    avatar.lineHeight = 36;
    avatar.color = new Color(255, 245, 220, 255);
    avatar.horizontalAlign = Label.HorizontalAlign.CENTER;
    avatar.verticalAlign = Label.VerticalAlign.CENTER;

    const nameN = new Node('Name');
    nameN.setParent(root);
    nameN.setPosition(namePos);
    nameN.addComponent(UITransform).setContentSize(88, 30);
    const name = nameN.addComponent(Label);
    name.fontSize = 18;
    name.lineHeight = 22;
    name.horizontalAlign = Label.HorizontalAlign.CENTER;
    name.overflow = Label.Overflow.SHRINK;

    const statX = -w / 2 + 96;
    const statRight = w / 2 - 14;
    const statW = Math.max(120, statRight - statX);
    const hpLabelN = new Node('HpLabel');
    hpLabelN.setParent(root);
    hpLabelN.setPosition(new Vec3(statX + 14, topY, 0));
    hpLabelN.addComponent(UITransform).setContentSize(34, 26);
    const hpLabel = hpLabelN.addComponent(Label);
    hpLabel.string = 'HP';
    hpLabel.fontSize = 22;
    hpLabel.lineHeight = 26;
    hpLabel.color = new Color(255, 245, 230, 255);
    hpLabel.horizontalAlign = Label.HorizontalAlign.LEFT;

    const hpBg = new Node('HpBg');
    hpBg.setParent(root);
    const hpBarX = statX + 52;
    const hpBarW = Math.max(76, statRight - hpBarX);
    hpBg.setPosition(new Vec3(hpBarX + hpBarW / 2, topY, 0));
    hpBg.addComponent(UITransform).setContentSize(hpBarW, 24);
    const hpBgG = hpBg.addComponent(Graphics);
    hpBgG.fillColor = new Color(4, 8, 14, 230);
    hpBgG.rect(-hpBarW / 2, -12, hpBarW, 24);
    hpBgG.fill();
    hpBgG.strokeColor = new Color(72, 24, 28, 230);
    hpBgG.lineWidth = 2;
    hpBgG.rect(-hpBarW / 2 + 1, -11, hpBarW - 2, 22);
    hpBgG.stroke();

    const hpFill = new Node('HpFill');
    hpFill.setParent(hpBg);
    hpFill.setPosition(new Vec3(-hpBarW / 2 + 2, 0, 0));
    hpFill.addComponent(UITransform).setContentSize(hpBarW - 4, 18);
    hpFill.addComponent(Graphics);

    const hpTextN = new Node('HpText');
    hpTextN.setParent(hpBg);
    hpTextN.addComponent(UITransform).setContentSize(hpBarW - 4, 24);
    const hpTextLabel = hpTextN.addComponent(Label);
    hpTextLabel.fontSize = 18;
    hpTextLabel.lineHeight = 22;
    hpTextLabel.color = new Color(255, 245, 235, 255);
    hpTextLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    hpTextLabel.verticalAlign = Label.VerticalAlign.CENTER;

    const goldN = this._makeInfoLine(root, 'GoldLine', statX + statW / 2, midUpperY, statW, '金币 0');
    const diamondN = this._makeInfoLine(root, 'DiamondLine', statX + statW / 2, midLowerY, statW, '钻石 0');

    const equip: Label[] = [];
    const slotGap = 6;
    const slotCount = 4;
    const slotW = Math.max(44, Math.floor((w - 36 - slotGap * (slotCount - 1)) / slotCount));
    const slotH = CARD_EQUIP_SLOT_H;
    const slotY = -h / 2 + CARD_EQUIP_BOTTOM_INSET + slotH / 2;
    for (let i = 0; i < slotCount; i += 1) {
      const slot = new Node(`Equip_${i}`);
      slot.setParent(root);
      slot.setPosition(new Vec3(-w / 2 + 18 + slotW / 2 + i * (slotW + slotGap), slotY, 0));
      slot.addComponent(UITransform).setContentSize(slotW, slotH);
      const sg = slot.addComponent(Graphics);
      sg.fillColor = new Color(8, 16, 28, 220);
      sg.rect(-slotW / 2, -slotH / 2, slotW, slotH);
      sg.fill();
      sg.strokeColor = new Color(70, 86, 110, 230);
      sg.lineWidth = 2;
      sg.rect(-slotW / 2 + 1, -slotH / 2 + 1, slotW - 2, slotH - 2);
      sg.stroke();
      const ln = new Node('L');
      ln.setParent(slot);
      ln.addComponent(UITransform).setContentSize(slotW - 6, slotH - 2);
      const lbl = ln.addComponent(Label);
      lbl.fontSize = 15;
      lbl.lineHeight = 19;
      lbl.color = new Color(245, 242, 230, 255);
      lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
      lbl.verticalAlign = Label.VerticalAlign.CENTER;
      lbl.overflow = Label.Overflow.SHRINK;
      equip.push({ root: slot, label: lbl });
    }

    const statusRow = new Node('StatusRow');
    statusRow.setParent(root);
    statusRow.addComponent(UITransform).setContentSize(w - 16, 24);

    root.addComponent(Button);
    return {
      root,
      name,
      avatar,
      hpText: hpTextLabel,
      hpFill,
      gold: goldN,
      diamond: diamondN,
      equip,
      statusRow,
    };
  }

  setBusy(v: boolean): void {
    this._busy = v;
  }

  /** @deprecated 使用 setBusy */
  setRolling(v: boolean): void {
    this.setBusy(v);
  }

  setLoading(): void {
    this._errorHint = '';
    if (this._statusLabel) this._statusLabel.string = '对局加载中…';
  }

  setError(msg: string): void {
    this._errorHint = msg;
    if (this._statusLabel) this._statusLabel.string = `⚠ ${msg}`;
  }

  clearError(): void {
    this._errorHint = '';
  }

  startCountdown(): void {
    if (this._countdownTimer) return;
    this._countdownTimer = setInterval(() => {
      if (!this._lastGame) return;
      const key = `${this._lastGame.updatedAt}_${this._lastGame.currentSeat}_${this._lastGame.turnDeadlineAt ?? 0}_${this._lastGame.turnDeadlinePausedMs ?? ''}`;
      // 每秒强制刷新一次状态栏倒计时（即使 watch 没推送）
      if (key !== this._lastCountdownKey) {
        this._lastCountdownKey = key;
      }
      this.refresh(this._lastGame);
    }, 1000);
  }

  stopCountdown(): void {
    if (this._countdownTimer) {
      clearInterval(this._countdownTimer);
      this._countdownTimer = null;
    }
  }

  refresh(game: GameDoc | null): void {
    if (!this._statusLabel?.isValid) return;
    this._lastGame = game;
    if (!game) {
      this._statusLabel.string = this._errorHint
        ? `⚠ ${this._errorHint}`
        : '对局加载中…';
      return;
    }

    const me = GameSession.user;
    const mySeat = game.players.find((p) => p.openId === me?.openId)?.seat;
    const mePlayer = game.players.find((p) => p.openId === me?.openId);
    const actionRound = (game.actionRoundCount ?? 0) + 1;
    const turnPlayer = game.players[game.currentSeat];
    const turnName = turnPlayer
      ? playerDisplayName(turnPlayer)
      : `玩家${game.currentSeat + 1}`;
    const isMyTurn = mySeat === game.currentSeat;
    const ta = mePlayer?.turnActions;

    let extra = '';
    if (isMyTurn && mePlayer && !mePlayer.isDefeated) {
      extra = `  [${formatTurnActionsHint(ta)}]`;
    }
    const remainSec =
      game.turnDeadlineAt != null
        ? Math.max(0, Math.ceil((game.turnDeadlineAt - Date.now()) / 1000))
        : game.turnDeadlinePausedMs != null
          ? Math.max(0, Math.ceil(game.turnDeadlinePausedMs / 1000))
          : 0;
    const countdown = game.phase === 'BOARD' ? `  ${remainSec}s` : '';
    const botHint =
      turnPlayer?.isBot &&
      !isMyTurn &&
      game.lastEvent?.type === 'BOT_ACTION' &&
      game.lastEvent.message
        ? `  · ${game.lastEvent.message}`
        : '';
    const phase = phaseLabel(game);
    this._statusLabel.string = `第${actionRound}回合 · ${phase} · 当前：${turnName}${isMyTurn ? '（你）' : ''}${countdown}${botHint}${extra}${this._errorHint ? `  ⚠${this._errorHint}` : ''}`;

    const gap = 10;
    const hudW = hudFrame().w;
    const { cardW, cardH } = hudCardSize(hudW);
    this._ensureCards(cardW, cardH);

    for (let seat = 0; seat < HUD_SLOT_COUNT; seat += 1) {
      const card = this._playerCards[seat];
      if (!card) continue;
      const p = game.players.find((pl) => pl.seat === seat) ?? null;
      this._cardSeats[seat] = seat;
      const isEmpty = !p;
      const isMe = !isEmpty && p.seat === mySeat;
      const isFocus = !isEmpty && this._focusSeat === p.seat;

      if (isEmpty) {
        card.name.string = '空位';
        card.name.color = new Color(130, 135, 150, 255);
        card.avatar.string = '';
        card.avatar.node.active = false;
        card.avatar.node.parent?.getChildByName('AvatarArt')?.destroy();
        card.hpText.string = '--';
        card.gold.string = '金币 --';
        card.diamond.string = '钻石 --';
        card.equip.forEach((slot) => {
          this._paintEquipSlot(slot, null, '');
        });
        this._paintStatusRow(card.statusRow, [], cardW, cardH);
        this._redrawHpFill(card.hpFill, 0, true);
        card.hpText.color = new Color(120, 125, 140, 255);
      } else {
        card.name.string = p.isDefeated
          ? `${playerDisplayName(p)}（淘汰）`
          : playerDisplayName(p);
        card.avatar.string = playerDisplayName(p).slice(0, 1) || `${p.seat + 1}`;
        const avatarNode = card.avatar.node.parent;
        const avatarKey = pawnSpriteKey(p);
        const pawnSize = hudCardPawnSize(cardW, cardH);
        const avatarSf = getCachedSprite(avatarKey);
        if (avatarNode && avatarSf) {
          ensureArtChild(avatarNode, 'AvatarArt', avatarSf, pawnSize, pawnSize);
          const art = avatarNode.getChildByName('AvatarArt');
          art?.setSiblingIndex(avatarNode.children.length - 1);
          card.avatar.node.active = false;
        } else {
          avatarNode?.getChildByName('AvatarArt')?.destroy();
          card.avatar.node.active = true;
          this._loadAvatarLater(avatarKey);
        }
        card.hpText.string = hpText(p);
        card.gold.string = `金币 ${p.gold}`;
        card.diamond.string = `钻石 ${p.diamond}`;
        const iconKeys = equipSlotIconKeys(p);
        card.equip.forEach((slot, slotIdx) => {
          this._paintEquipSlot(
            slot,
            iconKeys[slotIdx] ?? null,
            slotIdx === 3 ? `攻${attackValue(p)}` : '',
          );
        });
        this._paintStatusRow(card.statusRow, playerStatusBadges(p, game), cardW, cardH);
        card.hpText.color = p.isDefeated
          ? new Color(150, 150, 160, 255)
          : new Color(255, 245, 235, 255);
        this._redrawHpFill(card.hpFill, hpRatio(p), p.isDefeated);
        card.name.color = isMe ? SEAT_COLORS[p.seat % 4] : new Color(245, 245, 245, 255);
      }

      const g = card.root.getComponent(Graphics);
      const h = card.root.getComponent(UITransform)!.contentSize.height;
      const cardStyle = isEmpty ? 'empty' : isFocus ? 'focus' : isMe ? 'me' : 'other';
      if (!this._useCardArt && g && this._cardStyle[seat] !== cardStyle) {
        this._cardStyle[seat] = cardStyle;
        g.clear();
        g.fillColor = isEmpty
          ? new Color(34, 38, 50, 210)
          : isFocus
            ? new Color(70, 95, 140, 255)
            : isMe
              ? new Color(50, 72, 115, 255)
              : new Color(45, 50, 68, 255);
        g.rect(-cardW / 2, -h / 2, cardW, h);
        g.fill();
        if (isFocus) {
          g.strokeColor = new Color(255, 220, 120, 255);
          g.lineWidth = 2;
          g.rect(-cardW / 2 + 1, -h / 2 + 1, cardW - 2, h - 2);
          g.stroke();
        }
      } else if (this._useCardArt && this._cardStyle[seat] !== cardStyle) {
        this._cardStyle[seat] = cardStyle;
        const sf = getCachedSprite(
          isFocus
            ? 'board/panels/card_board_player_selected_9s'
            : 'board/panels/card_board_player_9s',
        );
        if (sf) {
          ensureArtStretch(card.root, 'CardArt', sf, cardW, h);
        }
      }

      const btn = card.root.getComponent(Button);
      if (btn) {
        btn.interactable = !isEmpty && !p!.isDefeated;
        card.root.off(Button.EventType.CLICK);
        if (!isEmpty) {
          card.root.on(
            Button.EventType.CLICK,
            () => this._callbacks.onFocusPlayer?.(p!.seat),
            this,
          );
        }
      }
    }
  }

  setFocusSeat(seat: number | null): void {
    this._focusSeat = seat;
    if (this._lastGame) this.refresh(this._lastGame);
  }
}
