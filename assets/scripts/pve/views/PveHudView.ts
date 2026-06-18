import { Color, Graphics, Label, Layers, Node, UITransform } from 'cc';
import { playerAttackPower } from '../core/CombatSystem';
import type { Direction } from '../core/MovementSystem';
import { AP_BASE } from '../core/PveConstants';
import type { ExpeditionState } from '../core/PveTypes';
import { loadUiSprite } from '../../ui/UiAssets';
import { ensureArtChild } from '../../ui/UiSprite';
import { makeFlatButton, makeLabel } from './pveUiKit';

export type PveHudCallbacks = {
  onMove: (dir: Direction) => void;
  onAttack: () => void;
  onInteract: () => void;
  onEndTurn: () => void;
  onQuit?: () => void;
  onShowCharacter?: () => void;
  onUseScroll?: () => void;
};

const INFO_COLOR   = new Color(225, 230, 240, 255);
const HP_COLOR     = new Color(235, 110, 100, 255);
const AP_COLOR     = new Color(120, 200, 255, 255);
const GOLD_COLOR   = new Color(245, 210, 110, 255);
const ANIMA_COLOR  = new Color(190, 150, 245, 255);
const ATTACK_COLOR = new Color(250, 165, 90,  255);
const KEY_COLOR    = new Color(245, 220, 110, 255);
const SHARDS_COLOR = new Color(130, 200, 250, 255);

const BAR_W = 110;
const BAR_H = 22;
const DPAD_BTN    = 84;
const ACTION_BTN_W = 120;
const ACTION_BTN_H = 60;

export class PveHudView {
  private _root: Node;
  private _floorLabel:  Label;
  private _goldLabel:   Label;
  private _animaLabel:  Label;
  private _keyLabel:    Label;
  private _shardsLabel: Label;
  private _attackLabel: Label;
  private _statusLabel: Label;

  // HP / AP 进度条
  private _hpBarG:     Graphics | null = null;
  private _hpBarLabel: Label    | null = null;
  private _apBarG:     Graphics | null = null;
  private _apBarLabel: Label    | null = null;

  private _scrollButton:      Node  | null = null;
  private _scrollButtonLabel: Label | null = null;
  private _row1Y = 0;
  private _row2Y = 0;
  /** 局外命运碎片余额：从 PveMeta 注入，不在 ExpeditionState 里 */
  private _destinyShards = 0;

  constructor(parent: Node, screenW: number, screenH: number, callbacks: PveHudCallbacks) {
    this._root = new Node('PveHudView');
    this._root.layer = Layers.Enum.UI_2D;
    this._root.setParent(parent);
    this._root.addComponent(UITransform).setContentSize(screenW, screenH);

    const row1Y   = -screenH / 2 + 571;
    const row2Y   = row1Y - 38;
    const statusY = row2Y - 36;
    this._row1Y = row1Y;
    this._row2Y = row2Y;

    const colX = [-270, -90, 90, 270];
    const colW = 170;
    const rowH = 34;

    // ── Row 1 ───────────────────────────────────────────────
    // Col 0：章节/楼层/回合（文字，无图标）
    this._floorLabel = makeLabel(this._root, colX[0], row1Y, colW, rowH, 18, INFO_COLOR);

    // Col 1：AP 进度条
    { const n = new Node('ApBar');
      n.setParent(this._root);
      n.setPosition(colX[1], row1Y, 0);
      n.layer = Layers.Enum.UI_2D;
      n.addComponent(UITransform).setContentSize(BAR_W, BAR_H);
      this._apBarG = n.addComponent(Graphics); }
    this._apBarLabel = makeLabel(this._root, colX[1], row1Y, BAR_W, BAR_H, 13, new Color(255, 255, 255, 255));
    this._apBarLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    this._apBarLabel.isBold = true;

    // Col 2：HP 进度条
    { const n = new Node('HpBar');
      n.setParent(this._root);
      n.setPosition(colX[2], row1Y, 0);
      n.layer = Layers.Enum.UI_2D;
      n.addComponent(UITransform).setContentSize(BAR_W, BAR_H);
      this._hpBarG = n.addComponent(Graphics); }
    this._hpBarLabel = makeLabel(this._root, colX[2], row1Y, BAR_W, BAR_H, 13, new Color(255, 255, 255, 255));
    this._hpBarLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    this._hpBarLabel.isBold = true;

    // Col 3：攻击力数字
    this._attackLabel = makeLabel(this._root, colX[3], row1Y, 100, rowH, 20, ATTACK_COLOR);

    // ── Row 2 ───────────────────────────────────────────────
    this._goldLabel   = makeLabel(this._root, colX[0], row2Y, colW, rowH, 20, GOLD_COLOR);
    this._animaLabel  = makeLabel(this._root, colX[1], row2Y, colW, rowH, 20, ANIMA_COLOR);
    this._keyLabel    = makeLabel(this._root, colX[2], row2Y, colW, rowH, 20, KEY_COLOR);
    this._shardsLabel = makeLabel(this._root, colX[3], row2Y, colW, rowH, 20, SHARDS_COLOR);

    this._statusLabel = makeLabel(this._root, 0, statusY, 600, 26, 18, new Color(255, 255, 190, 255));
    this._statusLabel.horizontalAlign = Label.HorizontalAlign.CENTER;

    this._buildHudBg(screenW, screenH);
    void this._loadHudArt();
    this._buildDpad(callbacks, screenW, screenH);
    this._buildActionButtons(callbacks, screenW, screenH);
    this._floorLabel.string = '加载中...';
  }

  private _buildHudBg(screenW: number, screenH: number): void {
    const bg = new Node('HudBg');
    bg.setParent(this._root);
    bg.setPosition(0, this._row1Y - 19, 0);
    const g = bg.addComponent(Graphics);
    g.fillColor = new Color(15, 15, 25, 200);
    g.roundRect(-screenW / 2, -48, screenW, 100, 0);
    g.fill();
  }

  private async _loadHudArt(): Promise<void> {
    const [hp, ap, atk, gold, anima, key] = await Promise.all([
      loadUiSprite('pve/icons/icon_hud_hp'),
      loadUiSprite('pve/icons/icon_hud_ap'),
      loadUiSprite('pve/icons/icon_hud_attack'),
      loadUiSprite('pve/icons/icon_hud_gold'),
      loadUiSprite('pve/icons/icon_hud_anima'),
      loadUiSprite('pve/icons/icon_hud_key'),
    ]);

    const colX = [-270, -90, 90, 270];
    // 图标放在进度条/标签左侧：colCenter - barHalfW - gap - iconHalfW
    const barIconX = (cx: number) => cx - BAR_W / 2 - 8 - 14;
    const lblIconX = (cx: number) => cx - 56;

    // Row 1
    if (ap)  this._addIcon('AP',  ap,  barIconX(colX[1]), this._row1Y);
    if (hp)  this._addIcon('HP',  hp,  barIconX(colX[2]), this._row1Y);
    if (atk) this._addIcon('ATK', atk, lblIconX(colX[3]), this._row1Y);

    // Row 2
    if (gold)  this._addIcon('GOLD',  gold,  lblIconX(colX[0]), this._row2Y);
    if (anima) this._addIcon('ANIMA', anima, lblIconX(colX[1]), this._row2Y);
    if (key)   this._addIcon('KEY',   key,   lblIconX(colX[2]), this._row2Y);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _addIcon(name: string, frame: any, x: number, y: number): void {
    let holder = this._root.getChildByName(`IconHolder_${name}`);
    if (!holder) {
      holder = new Node(`IconHolder_${name}`);
      holder.setParent(this._root);
      holder.layer = Layers.Enum.UI_2D;
      holder.addComponent(UITransform).setContentSize(28, 28);
    }
    holder.setPosition(x, y, 0);
    ensureArtChild(holder, 'Art', frame, 28, 28);
    const art = holder.getChildByName('Art');
    if (art) art.layer = Layers.Enum.UI_2D;
  }

  /** 绘制进度条（背景 + 填充），每帧刷新时调用 */
  private _drawBar(g: Graphics, pct: number, color: Color): void {
    const w = BAR_W;
    const h = BAR_H;
    g.clear();
    g.fillColor = new Color(25, 25, 35, 190);
    g.roundRect(-w / 2, -h / 2, w, h, 3);
    g.fill();
    const clamped = Math.max(0, Math.min(1, pct));
    if (clamped > 0) {
      const fillW = Math.max(4, (w - 4) * clamped);
      g.fillColor = color;
      g.roundRect(-w / 2 + 2, -h / 2 + 2, fillW, h - 4, 2);
      g.fill();
    }
  }

  private _buildDpad(callbacks: PveHudCallbacks, screenW: number, screenH: number): void {
    const cx  = screenW / 2 - 305;
    const cy  = -screenH / 2 + 105;
    const gap = DPAD_BTN + 10;
    makeFlatButton(this._root, '上', cx,       cy + gap, DPAD_BTN, DPAD_BTN, () => callbacks.onMove('UP'));
    makeFlatButton(this._root, '左', cx - gap, cy,       DPAD_BTN, DPAD_BTN, () => callbacks.onMove('LEFT'));
    makeFlatButton(this._root, '下', cx,       cy,       DPAD_BTN, DPAD_BTN, () => callbacks.onMove('DOWN'));
    makeFlatButton(this._root, '右', cx + gap, cy,       DPAD_BTN, DPAD_BTN, () => callbacks.onMove('RIGHT'));
  }

  private _buildActionButtons(callbacks: PveHudCallbacks, screenW: number, screenH: number): void {
    const x   = screenW / 2 - ACTION_BTN_W / 2 - 24;
    const cy  = -screenH / 2 + 105;
    const gap = ACTION_BTN_H + 14;

    makeFlatButton(this._root, '攻击',   x, cy + gap,   ACTION_BTN_W, ACTION_BTN_H, () => callbacks.onAttack(),   new Color(200, 90,  90,  255));
    makeFlatButton(this._root, '互动',   x, cy,         ACTION_BTN_W, ACTION_BTN_H, () => callbacks.onInteract(), new Color(90,  160, 200, 255));
    makeFlatButton(this._root, '结束回合', x, cy - gap, ACTION_BTN_W, ACTION_BTN_H, () => callbacks.onEndTurn(),  new Color(120, 130, 145, 255));

    const subBtnY = -screenH / 2 + 274;
    if (callbacks.onQuit) {
      makeFlatButton(this._root, '返回', -200, subBtnY, 120, 44, () => callbacks.onQuit?.(), new Color(90, 95, 105, 255));
    }
    if (callbacks.onUseScroll) {
      this._scrollButton = makeFlatButton(this._root, '卷轴 x0', 0, subBtnY, 140, 44, () => callbacks.onUseScroll?.(), new Color(120, 90, 170, 255));
      const labelNode = this._scrollButton.getChildByName('Label');
      this._scrollButtonLabel = labelNode?.getComponent(Label) ?? null;
      this._scrollButton.active = false;
    }
    if (callbacks.onShowCharacter) {
      makeFlatButton(this._root, '角色', 200, subBtnY, 120, 44, () => callbacks.onShowCharacter?.(), new Color(140, 100, 200, 255));
    }
  }

  refresh(state: ExpeditionState): void {
    const { player, floorState, chapter, floor } = state;

    this._floorLabel.string = `第${chapter}章·第${floor}层 回合${floorState.turn}`;

    // HP 进度条
    if (this._hpBarG) this._drawBar(this._hpBarG, player.hp / player.maxHp, HP_COLOR);
    if (this._hpBarLabel) this._hpBarLabel.string = `${player.hp}/${player.maxHp}`;

    // AP 进度条（含骰值）
    if (this._apBarG) this._drawBar(this._apBarG, floorState.ap / floorState.maxAp, AP_COLOR);
    if (this._apBarLabel) {
      const apBonus = floorState.maxAp - AP_BASE - floorState.dice;
      const diceStr = apBonus !== 0
        ? `骰${floorState.dice}${apBonus > 0 ? '+' : ''}${apBonus}`
        : `骰${floorState.dice}`;
      this._apBarLabel.string = `${floorState.ap}/${floorState.maxAp} ${diceStr}`;
    }

    // 攻击力（纯数字，图标传意）
    const { damage } = playerAttackPower(player);
    this._attackLabel.string = `${damage}`;

    // Row 2（纯数字，图标传意）
    this._goldLabel.string   = `${player.gold}`;
    this._animaLabel.string  = `${player.anima}(${player.animaProgress}/${player.animaThreshold ?? 100})`;
    this._keyLabel.string    = floorState.hasKey ? '已持有' : '未持有';
    this._shardsLabel.string = `${this._destinyShards}`;

    // 状态行：燃烧 / 减速 Debuff
    const burn = floorState.playerBurnRemaining ?? 0;
    const slow = floorState.playerMoveApPenaltyRounds ?? 0;
    const statusParts: string[] = [];
    if (burn > 0) statusParts.push(`燃烧 ${burn} 回合`);
    if (slow > 0) statusParts.push(`减速 ${slow} 回合`);
    this._statusLabel.string = statusParts.join('   ');

    // 卷轴按钮
    const scrolls = player.scrolls ?? 0;
    if (this._scrollButton) {
      this._scrollButton.active = scrolls > 0;
      if (this._scrollButtonLabel) this._scrollButtonLabel.string = `卷轴 x${scrolls}`;
    }
  }

  /** 命运碎片来自局外 PveMeta，单独注入（不在 ExpeditionState 里） */
  refreshMeta(destinyShards: number): void {
    this._destinyShards = destinyShards;
    this._shardsLabel.string = `${destinyShards}`;
  }

  setVisible(visible: boolean): void {
    this._root.active = visible;
  }

  destroy(): void {
    this._root.destroy();
  }
}
