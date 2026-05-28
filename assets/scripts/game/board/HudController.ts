import { Button, Color, Graphics, Label, Node, UITransform, Vec3 } from 'cc';
import { TARGET_ACTION_ROUNDS } from '../../core/Constants';
import { GameSession } from '../../core/GameSession';
import { playerDisplayName } from '../playerDisplayName';
import type { GameDoc, GamePlayer } from '../../types/GameTypes';

const SEAT_COLORS = [
  new Color(255, 100, 100, 255),
  new Color(100, 180, 255, 255),
  new Color(120, 220, 140, 255),
  new Color(255, 210, 90, 255),
];

function uiScale(): number {
  try {
    const w = wx.getSystemInfoSync?.().windowWidth ?? 750;
    if (w < 400) return 1.45;
    if (w < 500) return 1.35;
    return 1.2;
  } catch {
    return 1.25;
  }
}

const S = uiScale();
const HUD_CENTER_Y = -455;
const HUD_W = 720;
const HUD_H = Math.round(300 * S);

type PlayerCardUi = {
  root: Node;
  name: Label;
  gold: Label;
  diamond: Label;
  lap: Label;
};

/** 棋盘 HUD：玩家信息卡 + 大按钮 */
export class HudController {
  private _root: Node;
  private _statusLabel: Label | null = null;
  private _playerCards: PlayerCardUi[] = [];
  private _cardsRoot: Node | null = null;
  private _rollBtn: Node | null = null;
  private _onRoll: (() => void) | null = null;
  private _onQuit: (() => void) | null = null;
  private _rolling = false;
  private _errorHint = '';
  private _cardIsMe: boolean[] = [];

  constructor(parent: Node, onRoll: () => void, onQuit?: () => void) {
    this._root = new Node('Hud');
    this._root.setParent(parent);
    this._root.setPosition(new Vec3(0, HUD_CENTER_Y, 0));
    this._root.addComponent(UITransform).setContentSize(HUD_W, HUD_H);
    this._onRoll = onRoll;
    this._onQuit = onQuit ?? null;
    this._build();
  }

  private _build(): void {
    const panel = new Node('Panel');
    panel.setParent(this._root);
    panel.addComponent(UITransform).setContentSize(HUD_W, HUD_H);
    const pg = panel.addComponent(Graphics);
    pg.fillColor = new Color(18, 20, 28, 235);
    pg.rect(-HUD_W / 2, -HUD_H / 2, HUD_W, HUD_H);
    pg.fill();

    const statusN = new Node('Status');
    statusN.setParent(this._root);
    statusN.setPosition(new Vec3(0, HUD_H / 2 - 36 * S, 0));
    statusN.addComponent(UITransform).setContentSize(HUD_W - 20, Math.round(44 * S));
    this._statusLabel = statusN.addComponent(Label);
    this._statusLabel.fontSize = Math.round(30 * S);
    this._statusLabel.lineHeight = Math.round(38 * S);
    this._statusLabel.color = new Color(255, 230, 150, 255);
    this._statusLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    this._statusLabel.string = '对局加载中…';

    this._cardsRoot = new Node('PlayerCards');
    this._cardsRoot.setParent(this._root);
    this._cardsRoot.setPosition(new Vec3(0, 8, 0));

    const btnRowY = -HUD_H / 2 + 42 * S;
    const btnW = Math.round(260 * S);
    const btnH = Math.round(58 * S);

    const btn = new Node('RollBtn');
    btn.setParent(this._root);
    btn.setPosition(new Vec3(-155, btnRowY, 0));
    btn.addComponent(UITransform).setContentSize(btnW, btnH);
    const g = btn.addComponent(Graphics);
    g.fillColor = new Color(210, 130, 40, 255);
    g.rect(-btnW / 2, -btnH / 2, btnW, btnH);
    g.fill();
    const lblNode = new Node('L');
    lblNode.setParent(btn);
    lblNode.addComponent(UITransform).setContentSize(btnW, btnH);
    const lbl = lblNode.addComponent(Label);
    lbl.string = '掷骰子';
    lbl.fontSize = Math.round(34 * S);
    lbl.color = new Color(255, 255, 255, 255);
    lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
    lbl.verticalAlign = Label.VerticalAlign.CENTER;
    btn.addComponent(Button);
    btn.on(Button.EventType.CLICK, () => this._tryRoll(), this);
    this._rollBtn = btn;

    if (this._onQuit) {
      const quit = new Node('QuitBtn');
      quit.setParent(this._root);
      quit.setPosition(new Vec3(155, btnRowY, 0));
      quit.addComponent(UITransform).setContentSize(btnW, btnH);
      const qg = quit.addComponent(Graphics);
      qg.fillColor = new Color(140, 65, 65, 255);
      qg.rect(-btnW / 2, -btnH / 2, btnW, btnH);
      qg.fill();
      const ql = new Node('L');
      ql.setParent(quit);
      ql.addComponent(UITransform).setContentSize(btnW, btnH);
      const qlbl = ql.addComponent(Label);
      qlbl.string = '退出对局';
      qlbl.fontSize = Math.round(32 * S);
      qlbl.color = new Color(255, 255, 255, 255);
      qlbl.horizontalAlign = Label.HorizontalAlign.CENTER;
      qlbl.verticalAlign = Label.VerticalAlign.CENTER;
      quit.addComponent(Button);
      quit.on(Button.EventType.CLICK, () => this._onQuit?.(), this);
    }
  }

  private _ensureCards(count: number, cardW: number): void {
    if (!this._cardsRoot) return;
    while (this._playerCards.length < count) {
      const i = this._playerCards.length;
      const ui = this._makeCard(this._cardsRoot, cardW);
      this._playerCards.push(ui);
    }
    const gap = 12;
    const totalW = count * cardW + (count - 1) * gap;
    let x = -totalW / 2 + cardW / 2;
    this._playerCards.forEach((c, idx) => {
      c.root.active = idx < count;
      if (idx < count) {
        c.root.setPosition(new Vec3(x, 0, 0));
        x += cardW + gap;
      }
    });
  }

  private _makeCard(parent: Node, w: number): PlayerCardUi {
    const h = Math.round(118 * S);
    const root = new Node('Card');
    root.setParent(parent);
    root.addComponent(UITransform).setContentSize(w, h);

    const bg = root.addComponent(Graphics);
    bg.fillColor = new Color(45, 50, 68, 255);
    bg.rect(-w / 2, -h / 2, w, h);
    bg.fill();

    const nameN = new Node('Name');
    nameN.setParent(root);
    nameN.setPosition(new Vec3(0, h / 2 - 28 * S, 0));
    nameN.addComponent(UITransform).setContentSize(w - 12, Math.round(36 * S));
    const name = nameN.addComponent(Label);
    name.fontSize = Math.round(28 * S);
    name.lineHeight = Math.round(34 * S);
    name.color = new Color(255, 255, 255, 255);
    name.horizontalAlign = Label.HorizontalAlign.CENTER;
    name.overflow = Label.Overflow.SHRINK;

    const goldN = new Node('Gold');
    goldN.setParent(root);
    goldN.setPosition(new Vec3(0, 4, 0));
    goldN.addComponent(UITransform).setContentSize(w - 12, Math.round(32 * S));
    const gold = goldN.addComponent(Label);
    gold.fontSize = Math.round(26 * S);
    gold.color = new Color(255, 210, 90, 255);
    gold.horizontalAlign = Label.HorizontalAlign.CENTER;

    const diaN = new Node('Dia');
    diaN.setParent(root);
    diaN.setPosition(new Vec3(0, -28 * S, 0));
    diaN.addComponent(UITransform).setContentSize(w - 12, Math.round(32 * S));
    const diamond = diaN.addComponent(Label);
    diamond.fontSize = Math.round(26 * S);
    diamond.color = new Color(120, 210, 255, 255);
    diamond.horizontalAlign = Label.HorizontalAlign.CENTER;

    const lapN = new Node('Lap');
    lapN.setParent(root);
    lapN.setPosition(new Vec3(0, -52 * S, 0));
    lapN.addComponent(UITransform).setContentSize(w - 12, Math.round(26 * S));
    const lap = lapN.addComponent(Label);
    lap.fontSize = Math.round(22 * S);
    lap.color = new Color(180, 185, 200, 255);
    lap.horizontalAlign = Label.HorizontalAlign.CENTER;

    return { root, name, gold, diamond, lap };
  }

  setRolling(v: boolean): void {
    this._rolling = v;
  }

  setLoading(): void {
    this._errorHint = '';
    if (this._statusLabel) this._statusLabel.string = '对局加载中…';
  }

  setError(msg: string): void {
    this._errorHint = msg;
    if (this._statusLabel) this._statusLabel.string = `⚠ ${msg}`;
    if (this._rollBtn) this._rollBtn.active = false;
  }

  clearError(): void {
    this._errorHint = '';
  }

  private _tryRoll(): void {
    if (this._rolling) return;
    this._onRoll?.();
  }

  refresh(game: GameDoc | null): void {
    if (!this._statusLabel) return;
    if (!game) {
      this._statusLabel.string = this._errorHint
        ? `⚠ ${this._errorHint}`
        : '对局加载中…';
      return;
    }

    const me = GameSession.user;
    const mySeat = game.players.find((p) => p.openId === me?.openId)?.seat;
    const actionRound = game.actionRoundCount ?? 0;
    const turnPlayer = game.players[game.currentSeat];
    const turnName = turnPlayer
      ? playerDisplayName(turnPlayer)
      : `玩家${game.currentSeat + 1}`;

    this._statusLabel.string = `回合：${turnName}  行动 ${actionRound}/${TARGET_ACTION_ROUNDS}${this._errorHint ? `  ⚠${this._errorHint}` : ''}`;

    const n = game.players.length;
    const cardW = n <= 2 ? Math.round(320 * S) : n === 3 ? Math.round(210 * S) : Math.round(165 * S);
    this._ensureCards(n, cardW);

    const sorted = game.players.slice().sort((a, b) => a.seat - b.seat);
    sorted.forEach((p, idx) => {
      const card = this._playerCards[idx];
      if (!card) return;
      const isMe = p.seat === mySeat;

      card.name.string = playerDisplayName(p);
      card.gold.string = `金币 ${p.gold}`;
      card.diamond.string = `钻石 ${p.diamond}`;
      card.lap.string = `圈数 ${p.lap}`;

      const g = card.root.getComponent(Graphics);
      const h = card.root.getComponent(UITransform)!.contentSize.height;
      if (g && this._cardIsMe[idx] !== isMe) {
        this._cardIsMe[idx] = isMe;
        g.clear();
        g.fillColor = isMe
          ? new Color(50, 72, 115, 255)
          : new Color(45, 50, 68, 255);
        g.rect(-cardW / 2, -h / 2, cardW, h);
        g.fill();
      }
      card.name.color = isMe ? SEAT_COLORS[p.seat % 4] : new Color(245, 245, 245, 255);
    });

    const mePlayer = game.players.find((p) => p.openId === me?.openId);
    const canRoll =
      game.phase === 'BOARD' &&
      mySeat === game.currentSeat &&
      !this._rolling &&
      !!mePlayer &&
      !mePlayer.isDefeated;
    if (this._rollBtn) {
      this._rollBtn.active = canRoll;
    }
  }
}
