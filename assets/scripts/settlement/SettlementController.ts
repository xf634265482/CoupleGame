import {
  _decorator,
  Button,
  Color,
  Component,
  Graphics,
  Label,
  Node,
  UITransform,
  Vec3,
} from 'cc';
import { GameSession } from '../core/GameSession';
import { SceneLoader } from '../core/SceneLoader';
import { login } from '../platform/wechat/WxAuth';
import { lockLandscape } from '../platform/wechat/WxLandscape';
import { applyUiLayerTree, refreshScreenAdapt } from '../platform/wechat/ViewAdapt';
import { GameStateMirror } from '../network/GameStateMirror';
import { GameWatcher } from '../network/GameWatcher';
import type { SettlementPlayerRow, SettlementVO } from '../types/GameTypes';
import {
  applyScreenBackground,
  getCachedSprite,
  preloadSettlementUi,
} from '../ui/UiAssets';
import { ensureArtChild, ensureArtStretch } from '../ui/UiSprite';
import { SceneUiBackground } from '../ui/SceneUiBackground';

const { ccclass } = _decorator;

const REASON_LABEL: Record<string, string> = {
  LAST_STANDING: '最后一名存活玩家获胜',
  ELIMINATION: '全员淘汰',
  ACTION_ROUNDS: '行动回合已满（综合排名）',
  TIMEOUT: '对局到时（综合排名）',
  QUIT: '有玩家退出',
  LAP: '跑满圈数（旧规则）',
  NORMAL: '对局结束',
};

const UI = {
  panelW: 760,
  panelH: 480,
  titleY: 200,
  listTopY: 150,
  rowH: 56,
  rowGap: 8,
  rankSize: 56,
  tagW: 100,
  tagH: 40,
  btnW: 280,
  btnH: 72,
  btnGap: 24,
  btnY: -260,
  titleFont: 30,
  rowFont: 22,
  rowMetaFont: 18,
};

const COLOR_PANEL_FALLBACK = new Color(32, 38, 52, 198);
const COLOR_BTN_FALLBACK = new Color(52, 120, 200, 255);
const COLOR_ROW_FALLBACK = new Color(28, 34, 48, 140);
const BTN_ART_INSET_X = 0.14;
const BTN_ART_INSET_Y = 0.1;

type PlayerRowUi = {
  root: Node;
  textLabel: Label;
  rank?: number;
  tagKey?: string;
};

/** 结算页（血量淘汰）→ AC-18, AC-19 */
@ccclass('SettlementController')
export class SettlementController extends Component {
  private _titleLabel: Label | null = null;
  private _loadingLabel: Label | null = null;
  private _panelRoot: Node | null = null;
  private _listRoot: Node | null = null;
  private _playerRows: PlayerRowUi[] = [];
  private _artReady = false;

  onLoad(): void {
    lockLandscape();
    refreshScreenAdapt(this.node);
    this.scheduleOnce(() => refreshScreenAdapt(this.node), 0);
    applyUiLayerTree(this.node, this.node.layer);

    this._buildUi();
    void this._boot();
  }

  private async _boot(): Promise<void> {
    await preloadSettlementUi();
    // 若 Canvas 已挂 SceneUiBackground（mode=SETTLEMENT），由其负责 ScreenBg
    const hasSceneBg = this.node.getComponent(SceneUiBackground) != null;
    if (!hasSceneBg) {
      await applyScreenBackground(this.node, 'settlement');
    }
    this._artReady = true;
    this._applyArt();
    await this._loadSettlement();
  }

  private _buildUi(): void {
    const panel = new Node('Panel');
    panel.setParent(this.node);
    panel.setPosition(0, 20, 0);
    panel.addComponent(UITransform).setContentSize(UI.panelW, UI.panelH);
    this._drawRect(panel, UI.panelW, UI.panelH, COLOR_PANEL_FALLBACK);
    this._panelRoot = panel;

    const title = new Node('Title');
    title.setParent(panel);
    title.setPosition(0, UI.titleY, 0);
    title.addComponent(UITransform).setContentSize(UI.panelW - 80, 48);
    this._titleLabel = title.addComponent(Label);
    this._titleLabel.string = '对局结算';
    this._titleLabel.fontSize = UI.titleFont;
    this._titleLabel.lineHeight = Math.round(UI.titleFont * 1.25);
    this._titleLabel.color = new Color(255, 230, 150, 255);
    this._titleLabel.horizontalAlign = Label.HorizontalAlign.CENTER;

    const loading = new Node('Loading');
    loading.setParent(panel);
    loading.setPosition(0, 0, 0);
    loading.addComponent(UITransform).setContentSize(UI.panelW - 80, 40);
    this._loadingLabel = loading.addComponent(Label);
    this._loadingLabel.string = '加载结算…';
    this._loadingLabel.fontSize = UI.rowFont;
    this._loadingLabel.color = new Color(210, 210, 220, 255);
    this._loadingLabel.horizontalAlign = Label.HorizontalAlign.CENTER;

    const list = new Node('PlayerList');
    list.setParent(panel);
    list.setPosition(0, 0, 0);
    list.addComponent(UITransform).setContentSize(UI.panelW - 60, UI.panelH - 160);
    this._listRoot = list;

    this._makeBtn('返回大厅', -UI.btnW / 2 - UI.btnGap / 2, UI.btnY, () => void this._goLobby());
    this._makeBtn('再来一局', UI.btnW / 2 + UI.btnGap / 2, UI.btnY, () => void this._playAgain());
  }

  private _drawRect(node: Node, w: number, h: number, color: Color): void {
    const g = node.getComponent(Graphics) || node.addComponent(Graphics);
    g.clear();
    g.fillColor = color;
    g.rect(-w / 2, -h / 2, w, h);
    g.fill();
  }

  private _makeBtn(text: string, x: number, y: number, onClick: () => void): void {
    const n = new Node(`Btn_${text}`);
    n.setParent(this.node);
    n.setPosition(new Vec3(x, y, 0));
    n.addComponent(UITransform).setContentSize(UI.btnW, UI.btnH);
    this._drawRect(n, UI.btnW, UI.btnH, COLOR_BTN_FALLBACK);

    const labelNode = new Node('Label');
    labelNode.setParent(n);
    labelNode.addComponent(UITransform).setContentSize(UI.btnW, UI.btnH);
    const lbl = labelNode.addComponent(Label);
    lbl.string = text;
    lbl.fontSize = 26;
    lbl.lineHeight = 32;
    lbl.color = new Color(255, 255, 255, 255);
    lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
    lbl.verticalAlign = Label.VerticalAlign.CENTER;

    const btn = n.addComponent(Button);
    btn.transition = Button.Transition.SCALE;
    btn.zoomScale = 0.96;
    n.on(Button.EventType.CLICK, onClick, this);
  }

  private _applyButtonArt(node: Node, text: string): void {
    const key =
      text === '返回大厅'
        ? 'settlement/btn_settlement_back_9s'
        : text === '再来一局'
          ? 'settlement/btn_settlement_again_9s'
          : '';
    const sf = key ? getCachedSprite(key) : null;
    const ut = node.getComponent(UITransform);
    if (!sf || !ut) return;
    const artW = Math.round(ut.contentSize.width * (1 - BTN_ART_INSET_X * 2));
    const artH = Math.round(ut.contentSize.height * (1 - BTN_ART_INSET_Y * 2));
    ensureArtStretch(node, 'BtnArt', sf, artW, artH);
    node.getChildByName('BtnArt')?.setSiblingIndex(0);
    const g = node.getComponent(Graphics);
    if (g) g.enabled = false;
  }

  private _applyArt(): void {
    if (!this._artReady || !this._panelRoot?.isValid) return;

    const panelSf = getCachedSprite('settlement/panel_settlement_main_9s');
    if (panelSf) {
      ensureArtStretch(this._panelRoot, 'PanelArt', panelSf, UI.panelW, UI.panelH);
      this._panelRoot.getChildByName('PanelArt')?.setSiblingIndex(0);
      const g = this._panelRoot.getComponent(Graphics);
      if (g) g.enabled = false;
    }

    const visit = (node: Node): void => {
      if (node.name.startsWith('Btn_')) {
        const text = node.getChildByName('Label')?.getComponent(Label)?.string ?? '';
        this._applyButtonArt(node, text);
      }
      node.children.forEach(visit);
    };
    visit(this.node);

    for (const row of this._playerRows) {
      if (row.root?.isValid && row.root.active) this._applyRowArt(row);
    }
  }

  private _applyRowArt(rowUi: PlayerRowUi): void {
    const row = rowUi.root;
    const rowW = row.getComponent(UITransform)?.contentSize.width ?? UI.panelW - 100;
    const rankKey =
      rowUi.rank === 1
        ? 'settlement/rank_1'
        : rowUi.rank === 2
          ? 'settlement/rank_2'
          : rowUi.rank === 3
            ? 'settlement/rank_3'
            : '';
    const rankSf = rankKey ? getCachedSprite(rankKey) : null;
    if (rankSf) {
      ensureArtChild(row, 'RankArt', rankSf, UI.rankSize, UI.rankSize);
      row.getChildByName('RankArt')?.setPosition(-rowW / 2 + UI.rankSize / 2 + 8, 0, 0);
    }

    const tagSf = rowUi.tagKey ? getCachedSprite(rowUi.tagKey) : null;
    if (tagSf) {
      ensureArtChild(row, 'TagArt', tagSf, UI.tagW, UI.tagH);
      row.getChildByName('TagArt')?.setPosition(rowW / 2 - UI.tagW / 2 - 8, 0, 0);
    }
  }

  private async _loadSettlement(): Promise<void> {
    if (GameStateMirror.game?.settlement) {
      this._refresh();
      return;
    }
    const gameId = GameSession.gameId;
    if (!gameId) {
      this._refresh();
      return;
    }
    const game = await GameWatcher.pullGameSnapshot(gameId);
    if (game) {
      GameStateMirror.setGame(game as unknown as Record<string, unknown>);
    }
    this._refresh();
  }

  private _ensurePlayerRows(count: number): void {
    if (!this._listRoot) return;
    while (this._playerRows.length < count) {
      const idx = this._playerRows.length;
      const y = UI.listTopY - idx * (UI.rowH + UI.rowGap);
      const root = new Node(`Row_${idx}`);
      root.setParent(this._listRoot);
      root.setPosition(0, y, 0);
      root.addComponent(UITransform).setContentSize(UI.panelW - 100, UI.rowH);
      this._drawRect(root, UI.panelW - 100, UI.rowH, COLOR_ROW_FALLBACK);

      const textNode = new Node('Text');
      textNode.setParent(root);
      textNode.setPosition(20, 0, 0);
      textNode.addComponent(UITransform).setContentSize(UI.panelW - 260, UI.rowH);
      const textLabel = textNode.addComponent(Label);
      textLabel.fontSize = UI.rowFont;
      textLabel.lineHeight = Math.round(UI.rowFont * 1.3);
      textLabel.color = new Color(235, 235, 245, 255);
      textLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
      textLabel.verticalAlign = Label.VerticalAlign.CENTER;
      textLabel.overflow = Label.Overflow.SHRINK;

      this._playerRows.push({ root, textLabel });
    }
    for (let i = 0; i < this._playerRows.length; i++) {
      const row = this._playerRows[i];
      row.root.active = i < count;
    }
  }

  private _formatPlayerLine(p: SettlementPlayerRow, meOpenId?: string): string {
    const rankLabel = p.isTie ? '并列第1' : `#${p.rank}`;
    const meTag = p.openId === meOpenId ? ' · 你' : '';
    const hp = p.hp != null ? ` HP${p.hp}` : '';
    const kills = p.kills != null ? ` 击败${p.kills}` : '';
    const rv = p.resourceValue != null ? ` 资源${p.resourceValue}` : '';
    return `${rankLabel}  座位${p.seat + 1}${hp}${kills}  金${p.gold}  钻${p.diamond}${rv}${meTag}`;
  }

  private _refresh(): void {
    const game = GameStateMirror.game;
    const settlement = game?.settlement as SettlementVO | undefined;
    const me = GameSession.user;

    if (!settlement) {
      if (this._loadingLabel) {
        this._loadingLabel.node.active = true;
        this._loadingLabel.string = '加载结算…';
      }
      if (this._listRoot) this._listRoot.active = false;
      return;
    }

    if (this._loadingLabel) this._loadingLabel.node.active = false;
    if (this._listRoot) this._listRoot.active = true;

    const reason = REASON_LABEL[settlement.reason] || settlement.reason;
    if (this._titleLabel) this._titleLabel.string = `对局结算 · ${reason}`;

    const players = settlement.players.slice().sort((a, b) => a.rank - b.rank);
    this._ensurePlayerRows(players.length);

    players.forEach((p, i) => {
      const rowUi = this._playerRows[i];
      if (!rowUi) return;
      rowUi.textLabel.string = this._formatPlayerLine(p, me?.openId);
      rowUi.rank = p.rank <= 3 ? p.rank : undefined;
      rowUi.tagKey = p.isWinner
        ? 'settlement/tag_winner'
        : p.isDefeated
          ? 'settlement/tag_defeated'
          : undefined;
      rowUi.root.getChildByName('RankArt')?.destroy();
      rowUi.root.getChildByName('TagArt')?.destroy();
      const g = rowUi.root.getComponent(Graphics);
      if (g) g.enabled = !getCachedSprite('settlement/panel_settlement_main_9s');
      this._applyRowArt(rowUi);
    });

    this._applyArt();
    console.log('[Settlement]', reason, players.length, 'players');
  }

  private async _goLobby(): Promise<void> {
    GameWatcher.stopGame();
    GameSession.clearGame();
    GameSession.clearRoom();
    try {
      if (typeof wx !== 'undefined') {
        await login();
      }
    } catch (err) {
      console.warn('[Settlement] refresh user', err);
    }
    SceneLoader.loadLobby();
  }

  private async _playAgain(): Promise<void> {
    await this._goLobby();
  }
}
