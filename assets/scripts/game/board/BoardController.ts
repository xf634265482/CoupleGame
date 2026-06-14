import { _decorator, Color, Component, EventTouch, Graphics, Label, Mask, Node, UITransform, Vec3 } from 'cc';
import { BOARD_SIZE } from '../../core/Constants';
import { GameSession } from '../../core/GameSession';
import { SceneLoader } from '../../core/SceneLoader';
import {
  attackTarget,
  buyShopItem,
  endTurn,
  resolveEvent,
  extraRollDice,
  luckyEnd,
  luckyStart,
  quitGame,
  continueMove,
  rollDice,
  tick,
  useItem,
  sendChat,
} from '../../network/GameService';
import { bindWxHideQuit } from '../../platform/wechat/WxLifecycle';
import { GameStateMirror } from '../../network/GameStateMirror';
import { GameWatcher } from '../../network/GameWatcher';
import type {
  CellType,
  ConsumableItemType,
  GameDoc,
  GameMoveEvent,
  GamePlayer,
  GoldShopItemType,
  LegendaryShopItemType,
  RegionIndex,
} from '../../types/GameTypes';
import { playerDisplayName } from '../playerDisplayName';
import { BoardCombatUi } from './BoardCombatUi';
import { BoardView } from './BoardView';
import { CellEventToast, type CellEventItem } from './CellEventToast';
import { DiceResultToast } from './DiceResultToast';
import { HudController } from './HudController';
import { PawnView } from './PawnView';
import {
  boardContentSize,
  boardFocusZoom,
  boardLayoutMetrics,
  cellLocalPos,
  refreshBoardLayoutMetrics,
} from './boardLayout';
import { lockLandscape } from '../../platform/wechat/WxLandscape';
import {
  applyUiLayerTree,
  bindWindowResize,
  refreshScreenAdapt,
} from '../../platform/wechat/ViewAdapt';
import { boardUiLayout } from './BoardUiLayout';
import { BoardSidePanel } from './BoardSidePanel';
import { applyScreenBackground, preloadBoardUi } from '../../ui/UiAssets';

const { ccclass } = _decorator;

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const TOAST_SKIP_TYPES = new Set(['NORMAL', 'PENDING_INTERACTION']);

/** 关键战报类型：始终写入消息栏 */
const LOG_ALWAYS_TYPES = new Set([
  'SURVIVAL_PHASE',
  'ATTACK_PLAYER',
  'ATTACK_NEUTRAL',
  'BOT_ACTION',
  'ELIMINATED',
]);

/** 落点需交互的格子：不弹「移动完成」 */
const INTERACTION_CELL_TYPES = new Set([
  'GOLD_SHOP',
  'LEGENDARY_SHOP',
  'FINAL_SHOP',
  'LUCKY',
  'EVENT',
]);

const CELL_LABEL: Record<string, string> = {
  NORMAL: '普通',
  GOLD: '金币',
  DIAMOND: '钻石',
  SUPPLY: '补给',
  WASTE: '废',
  BURNING: '燃烧',
  EVENT: '事件',
  GOLD_SHOP: '金币商店',
  LEGENDARY_SHOP: '传说商店',
  FINAL_SHOP: '决战商店',
  LUCKY: '幸运',
};

/** 棋盘场景主控（血量淘汰多行动回合）→ AC-3, AC-4, AC-6～AC-18 */
@ccclass('BoardController')
export class BoardController extends Component {
  private static _active: BoardController | null = null;

  private _boardView: BoardView | null = null;
  private _pawnView: PawnView | null = null;
  private _hud: HudController | null = null;
  private _combatUi: BoardCombatUi | null = null;
  private _sidePanel: BoardSidePanel | null = null;
  private _boardViewport: Node | null = null;
  private _boardContent: Node | null = null;
  private _cellToast: CellEventToast | null = null;
  private _diceToast: DiceResultToast | null = null;
  private _busy = false;
  private _unbindHide: (() => void) | null = null;
  private _unbindResize: (() => void) | null = null;
  private _lastToastKey = '';
  private _lastBotToastKey = '';
  private _lastDiceToastKey = '';
  private _appendedLogKeys = new Set<string>();
  private _lastRemoteActionKey = '';
  private _lastLuckyResultKey = '';
  private _lastEventResultKey = '';
  private _moveContinueKey = '';
  private _skipWatchToastUntil = 0;
  private _handledPendingKey = '';
  private _boardPollTimer: ReturnType<typeof setInterval> | null = null;
  private _tickTimer: ReturnType<typeof setInterval> | null = null;
  private _tickBusy = false;
  private _lastTickAt = 0;
  private static readonly BOARD_TICK_MS = 5000;
  private static readonly BOARD_POLL_MS = 12000;
  private _luckySettleTimer: ReturnType<typeof setTimeout> | null = null;
  private _eventSettleTimer: ReturnType<typeof setTimeout> | null = null;
  private _luckySettleKey = '';
  private _destroyed = false;
  private _lastRefreshKey = '';
  /** 已写入右侧消息栏的 lastEvents 条数，避免每轮遍历全量事件 */
  private _loggedEventCount = 0;
  /** 棋盘视角跟随座位；null 表示跟随自己 */
  private _cameraFocusSeat: number | null = null;
  private _lastAnnouncedPhase = '';
  private _phaseAnnouncedReady = false;
  private _seenImportantEventKeys = new Set<string>();
  private _lastMovePromptKey = '';
  private _lastPositions: number[] = [];
  private _lastChatAt = 0;
  /** 棋盘内容缩放 */
  private _boardZoom = 1;
  private _boardBaseOffset = new Vec3(0, 0, 0);
  private _boardManualPan = new Vec3(0, 0, 0);
  private _boardDragging = false;
  private _boardUiReady = false;
  private _boardDataReady = false;
  private _boardRevealed = false;
  private _loadingCover: Node | null = null;

  private _onGameStart = (game: GameDoc) => {
    this._applyRemoteGame(game, false);
  };

  private _onGameUpdate = (game: GameDoc) => {
    this._applyRemoteGame(game, true);
  };

  private _applyRemoteGame(game: GameDoc, showToasts: boolean): void {
    if (!this._isLive()) return;
    if (game.phase === 'SETTLED' || game.settlement) {
      void this._goSettlementWithSnapshot();
      return;
    }

    if (this._busy) {
      this._refreshIfChanged(game);
      this._syncLogFromGame(game);
      return;
    }

    if (showToasts) {
      const visualKey = this._visualRefreshKey(game);
      if (visualKey !== this._lastRefreshKey) {
        this._lastRefreshKey = visualKey;
        // 远端行动者需要逐格动画：这里不要提前刷新 pawn/positions，
        // 否则 _maybeAnimateRemoteMove 无法检测到位移差异
        this._refresh(game, { skipPawn: true });
      }

      const actionKey = this._remoteActionKey(game);
      if (actionKey !== this._lastRemoteActionKey) {
        this._lastRemoteActionKey = actionKey;
        void (async () => {
          await this._showRemoteTurnToasts(game);
          void this._handlePendingInteraction(game);
        })();
      } else {
        void this._handlePendingInteraction(game);
      }
      return;
    }

    this._refreshIfChanged(game);
    void this._handlePendingInteraction(game);
  };

  private async _showRemoteTurnToasts(game: GameDoc): Promise<void> {
    await this._maybeAnimateRemoteMove(game);
    // 若没有触发动画，也要把棋子位置刷新到最新
    if (!this._pawnView?.animating) {
      this._pawnView?.refresh(game);
      this._syncPositions(game);
    }
    this._syncLogFromGame(game);
  };

  private _isLive(): boolean {
    return !this._destroyed && !!this.node?.isValid;
  }

  private _showBoardLoadingCover(canvas: Node): void {
    if (this._loadingCover?.isValid) return;
    const cover = new Node('BoardLoadingCover');
    cover.setParent(canvas);
    cover.setSiblingIndex(10000);
    cover.addComponent(UITransform).setContentSize(1600, 900);
    const g = cover.addComponent(Graphics);
    g.fillColor = new Color(4, 8, 16, 245);
    g.rect(-800, -450, 1600, 900);
    g.fill();

    const textN = new Node('Text');
    textN.setParent(cover);
    textN.addComponent(UITransform).setContentSize(360, 60);
    const lbl = textN.addComponent(Label);
    lbl.string = '棋盘加载中...';
    lbl.fontSize = 26;
    lbl.lineHeight = 34;
    lbl.color = new Color(235, 240, 255, 255);
    lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
    lbl.verticalAlign = Label.VerticalAlign.CENTER;
    this._loadingCover = cover;
  }

  private _hideBoardLoadingCover(): void {
    if (this._loadingCover?.isValid) {
      this._loadingCover.destroy();
    }
    this._loadingCover = null;
  }

  private _setBoardChromeVisible(visible: boolean): void {
    if (this._boardViewport?.isValid) this._boardViewport.active = visible;
    this._hud?.setVisible(visible);
    this._sidePanel?.setVisible(visible);
  }

  private _revealBoardIfReady(): void {
    if (this._boardRevealed || !this._boardUiReady || !this._boardDataReady) return;
    this._boardRevealed = true;
    this._setBoardChromeVisible(true);
    this._hideBoardLoadingCover();
    const g = GameStateMirror.game as GameDoc | null;
    if (g) this._syncEntryCameraFocus(g);
  }

  /** 进入棋盘首屏：缩放就绪后对准当前回合玩家 */
  private _syncEntryCameraFocus(game: GameDoc): void {
    const me = this._me(game);
    if (!me) return;
    this._cameraFocusSeat = null;
    this._boardManualPan.set(0, 0, 0);
    const focusSeat = game.currentSeat ?? me.seat;
    this._focusCameraOnSeat(game, focusSeat);
    this._hud?.setFocusSeat(focusSeat === me.seat ? null : focusSeat);
  }

  private _bindBoardDrag(): void {
    if (!this._boardViewport) return;
    this._boardViewport.on(Node.EventType.TOUCH_START, this._onBoardDragStart, this);
    this._boardViewport.on(Node.EventType.TOUCH_MOVE, this._onBoardDragMove, this);
    this._boardViewport.on(Node.EventType.TOUCH_END, this._onBoardDragEnd, this);
    this._boardViewport.on(Node.EventType.TOUCH_CANCEL, this._onBoardDragEnd, this);
  }

  private _onBoardDragStart(): void {
    this._boardDragging = true;
  }

  private _onBoardDragMove(event: EventTouch): void {
    if (!this._boardDragging || !this._boardUiReady || !this._boardDataReady) return;
    const delta = event.getDelta();
    const zoom = Math.max(0.01, this._boardZoom);
    this._boardManualPan.x -= delta.x / zoom;
    this._boardManualPan.y -= delta.y / zoom;
    this._applyBoardFocusOffset(this._boardBaseOffset);
  }

  private _onBoardDragEnd(): void {
    this._boardDragging = false;
  }

  private _clampBoardFocusOffset(offset: Vec3): Vec3 {
    const ui = boardUiLayout();
    const { w: contentW, h: contentH } = boardContentSize();
    const zoom = Math.max(0.01, this._boardZoom);
    const halfVW = (ui.leftW / 2) / zoom;
    const halfVH = (ui.topH / 2) / zoom;
    const halfCW = contentW / 2;
    const halfCH = contentH / 2;
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    let x = offset.x;
    let y = offset.y;
    const minX = halfVW - halfCW;
    const maxX = halfCW - halfVW;
    if (minX <= maxX) x = clamp(x, minX, maxX);
    else x = 0;
    const minY = halfVH - halfCH;
    const maxY = halfCH - halfVH;
    if (minY <= maxY) y = clamp(y, minY, maxY);
    else y = 0;
    return new Vec3(x, y, 0);
  }

  private _applyBoardFocusOffset(base: Vec3): void {
    this._boardBaseOffset.set(base);
    const target = this._clampBoardFocusOffset(
      new Vec3(base.x + this._boardManualPan.x, base.y + this._boardManualPan.y, 0),
    );
    this._boardManualPan.set(target.x - base.x, target.y - base.y, 0);
    this._boardView?.setFocusLocalPos({ x: target.x, y: target.y });
    this._pawnView?.setFocusLocalPos({ x: target.x, y: target.y });
  }

  /** 将视口对准指定格子（进入棋盘默认对准起点格 0） */
  private _focusCameraOnCell(cellIndex: number): void {
    const p = cellLocalPos(cellIndex);
    const ui = boardUiLayout();
    const viewportW = ui.leftW;
    const viewportH = ui.topH;
    const { w: contentW0, h: contentH0 } = boardContentSize();
    const zoom = this._boardZoom;

    const halfVW0 = (viewportW / 2) / zoom;
    const halfVH0 = (viewportH / 2) / zoom;
    const halfCW0 = contentW0 / 2;
    const halfCH0 = contentH0 / 2;

    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    let tX0 = -p.x;
    let tY0 = -p.y;

    const minX0 = halfVW0 - halfCW0;
    const maxX0 = halfCW0 - halfVW0;
    if (minX0 <= maxX0) tX0 = clamp(tX0, minX0, maxX0);

    const minY0 = halfVH0 - halfCH0;
    const maxY0 = halfCH0 - halfVH0;
    if (minY0 <= maxY0) tY0 = clamp(tY0, minY0, maxY0);

    this._applyBoardFocusOffset(new Vec3(-tX0, -tY0, 0));
  }

  private _focusCameraOnSeat(game: GameDoc, seat: number): void {
    const focusPlayer = game.players?.[seat];
    if (!focusPlayer) return;
    this._focusCameraOnCell(focusPlayer.position);
  }

  onLoad(): void {
    BoardController._active?.teardown();
    BoardController._active = this;
    this._destroyed = false;

    lockLandscape();
    refreshScreenAdapt(this.node);
    refreshBoardLayoutMetrics();
    this.scheduleOnce(() => {
      refreshScreenAdapt(this.node);
      refreshBoardLayoutMetrics();
      if (this._boardUiReady) this._relayoutUi();
    }, 0);
    this._unbindResize?.();
    this._unbindResize = bindWindowResize(this.node, () => {
      refreshScreenAdapt(this.node);
      void applyScreenBackground(this.node, 'board');
      refreshBoardLayoutMetrics();
      this._relayoutUi();
      const g = GameStateMirror.game as GameDoc | null;
      if (g) this._refreshIfChanged(g);
    });

    const canvas = this.node;
    this._showBoardLoadingCover(canvas);
    const ui = boardUiLayout();
    this._boardViewport = new Node('BoardViewport');
    this._boardViewport.setParent(canvas);
    this._boardViewport.setPosition(ui.boardCenter);
    this._boardViewport.addComponent(UITransform).setContentSize(ui.leftW, ui.topH);
    this._boardViewport.active = false;
    const vpMask = this._boardViewport.addComponent(Mask);
    vpMask.type = Mask.Type.GRAPHICS_RECT;
    this._bindBoardDrag();

    const vpBg = new Node('ViewportBg');
    vpBg.setParent(this._boardViewport);
    vpBg.setSiblingIndex(0);
    vpBg.addComponent(UITransform).setContentSize(ui.leftW, ui.topH);
    const vpG = vpBg.addComponent(Graphics);
    vpG.fillColor = new Color(22, 28, 42, 200);
    vpG.rect(-ui.leftW / 2, -ui.topH / 2, ui.leftW, ui.topH);
    vpG.fill();

    this._boardContent = new Node('BoardContent');
    this._boardContent.setParent(this._boardViewport);
    this._boardContent.setPosition(new Vec3(0, 0, 0));

    this._boardView = new BoardView(this._boardContent);
    this._pawnView = new PawnView(this._boardContent);
    this._cellToast = new CellEventToast(canvas);
    this._diceToast = new DiceResultToast(canvas);
    this._combatUi = new BoardCombatUi(canvas);
    this._hud = new HudController(canvas, {
      onRoll: () => void this._onRoll(),
      onItem: () => void this._onItem(),
      onAttack: () => void this._onAttack(),
      onEndTurn: () => void this._onEndTurn(),
      onQuit: () => void this._onQuit(),
      onFocusPlayer: (seat) => this._setCameraFocus(seat),
    });

    this._sidePanel = new BoardSidePanel(canvas, {
      panelW: ui.rightW,
      buttonCenter: ui.sideButtonCenter,
      buttonZoneH: ui.sideButtonZoneH,
      logCenter: ui.sideLogCenter,
      logZoneH: ui.sideLogZoneH,
    }, {
      onRoll: () => void this._onRoll(),
      onBackpack: () => void this._onBackpack(),
      onAttack: () => void this._onAttack(),
      onHelp: () => this._onCellGuide(),
      onEndTurn: () => void this._onEndTurn(),
      onQuickChat: () => void this._onQuickChat(),
    });
    this._setBoardChromeVisible(false);

    applyUiLayerTree(this.node, this.node.layer);
    void this._initBoardUiArt();
    this._relayoutUi(false);

    this._registerWatchers();
    this._unbindHide = bindWxHideQuit(() => SceneLoader.loadSettlement());

    const gameId = GameSession.gameId;
    if (gameId) {
      GameWatcher.watchGame(gameId);
      void this._bootstrapGame(gameId);
      this._boardPollTimer = setInterval(
        () => void this._pullAndRefresh(),
        BoardController.BOARD_POLL_MS,
      );
      this._hud?.startCountdown();
      this._tickTimer = setInterval(() => void this._tick(), BoardController.BOARD_TICK_MS);
    } else {
      this._hud?.setError('未找到对局 ID');
      this._boardDataReady = true;
      this._revealBoardIfReady();
    }
  }

  private async _initBoardUiArt(): Promise<void> {
    try {
      await preloadBoardUi();
      await applyScreenBackground(this.node, 'board');
      this._boardView?.applyArt();
      this._pawnView?.applyArt();
      this._sidePanel?.applyArt();
      this._hud?.applyArt();
      this._combatUi?.applyArt();
      this._cellToast?.applyArt();
      this._boardUiReady = true;
      this._relayoutUi(true);
      const g = GameStateMirror.game as GameDoc | null;
      if (g) this._refresh(g);
      this._revealBoardIfReady();
      this._scheduleBoardArtRetry();
    } catch (err) {
      console.warn('[BoardController] ui art', err);
      this._boardUiReady = true;
      this._relayoutUi(true);
      this._revealBoardIfReady();
      this._scheduleBoardArtRetry();
    }
  }

  /** 真机 fs 分批加载后，延迟再刷一遍贴图 */
  private _scheduleBoardArtRetry(): void {
    const reapply = (): void => {
      this._boardView?.applyArt();
      this._pawnView?.applyArt();
      this._hud?.applyArt();
      this._sidePanel?.applyArt();
      this._combatUi?.applyArt();
      this._cellToast?.applyArt();
    };
    this.scheduleOnce(reapply, 1.2);
    this.scheduleOnce(reapply, 3);
  }

  private _onBackpack(): void {
    const gameId = GameSession.gameId;
    const game = GameStateMirror.game as GameDoc | null;
    const me = game ? this._me(game) : undefined;
    if (!gameId || !game || !me || this._busy) return;
    this._combatUi?.showBackpack(me, {
      onUseItem: (item) => void this._doUseItem(gameId, item),
      onEquipWeapon: (weapon) => {
        // 先本地切换展示（服务端 equip 后会以 watch 为准）
        void this._doEquipWeapon(gameId, weapon);
      },
    });
  }

  private _onQuickChat(): void {
    const gameId = GameSession.gameId;
    if (!gameId) return;
    this._combatUi?.showQuickChatPicker((text) => {
      void (async () => {
        try {
          await sendChat(gameId, text);
        } catch (err) {
          this._sidePanel?.appendMessage(`发送失败：${err instanceof Error ? err.message : String(err)}`);
        }
      })();
    });
  }

  private _onCellGuide(): void {
    this._combatUi?.showCellGuide();
  }

  /** 仅 bot 回合、转盘待结算或回合即将超时时 tick，避免多人局刷爆云函数 */
  private _needsServerTick(game: GameDoc | null): boolean {
    if (!game || game.phase !== 'BOARD') return false;
    const now = Date.now();
    const cur = game.players[game.currentSeat];
    if (cur?.isBot) return true;
    if (game.luckySpin?.phase === 'SLOW' && (game.luckySpin.stopAt ?? 0) <= now + 400) {
      return true;
    }
    if (
      game.movePause &&
      game.pendingInteraction &&
      cur?.isBot &&
      game.movePause.seat === cur.seat
    ) {
      return true;
    }
    if (
      !game.movePause &&
      !game.luckySpin &&
      !game.pendingInteraction &&
      game.turnDeadlineAt != null &&
      now >= game.turnDeadlineAt - 1500
    ) {
      return true;
    }
    return false;
  }

  private _movePauseContinueKey(game: GameDoc): string {
    const mp = game.movePause;
    if (!mp) return '';
    const path = mp.remainingPath?.join(',') ?? '';
    return `${mp.seat}_${path}_${mp.segmentSteps ?? 0}`;
  }

  private async _tick(): Promise<void> {
    const gameId = GameSession.gameId;
    const mirror = GameStateMirror.game as GameDoc | null;
    if (!gameId || this._busy || this._tickBusy) return;
    if (!mirror || mirror.phase !== 'BOARD') return;
    const now = Date.now();
    if (now - this._lastTickAt < BoardController.BOARD_TICK_MS - 200) return;
    if (!this._needsServerTick(mirror) && now - GameWatcher.lastGamePushAt < 3000) {
      return;
    }
    this._tickBusy = true;
    this._lastTickAt = now;
    try {
      const res = await tick(gameId);
      if (res.game) this._applyRemoteGame(res.game as unknown as GameDoc, true);
    } catch {
      // ignore tick errors
    } finally {
      this._tickBusy = false;
    }
  }

  private async _pullAndRefresh(): Promise<void> {
    const gameId = GameSession.gameId;
    if (!gameId || this._busy) return;

    const mirror = GameStateMirror.game as GameDoc | null;
    if (mirror?.phase === 'SETTLED' || mirror?.settlement) {
      void this._goSettlementWithSnapshot();
      return;
    }

    if (Date.now() - GameWatcher.lastGamePushAt < 5000) return;

    const game = await GameWatcher.pullGameSnapshot(gameId);
    if (!game) return;
    if (game.phase === 'SETTLED' || game.settlement) {
      void this._goSettlementWithSnapshot();
      return;
    }
    if (game.phase === 'BOARD') {
      this._applyRemoteGame(game, true);
    }
  }

  /** 棋盘/HUD 刷新：不含 tick 会更新的 updatedAt/version */
  private _visualRefreshKey(game: GameDoc): string {
    const p = game.players
      .map(
        (x) =>
          `${x.seat}:${x.position}:${x.hp}:${x.gold}:${x.isDefeated}:${JSON.stringify(x.turnActions ?? {})}`,
      )
      .join('|');
    const pending = game.pendingInteraction
      ? `${game.pendingInteraction.type}_${game.pendingInteraction.seat}`
      : '';
    const lucky = game.luckySpin
      ? `${game.luckySpin.phase}_${game.luckySpin.finalIndex ?? ''}`
      : '';
    return `${game.currentSeat}_${game.phase}_${game.turnDeadlineAt ?? 0}_${pending}_${lucky}_${p}`;
  }

  /** 对手行动 toast：仅 lastDice/路径事件/落点变化时触发，不受 tick 影响 */
  private _remoteActionKey(game: GameDoc): string {
    const positions = game.players.map((x) => `${x.seat}:${x.position}`).join('|');
    const lastEv = game.lastEvent
      ? `${game.lastEvent.type}_${game.lastEvent.message}_${game.lastEvent.actorSeat ?? ''}`
      : '';
    const eventsSig = (game.lastEvents ?? [])
      .slice(-10)
      .map((e) => `${e.type}:${e.message}:${e.actorSeat ?? ''}`)
      .join(';');
    return `${game.lastDice ?? 0}_${lastEv}_${eventsSig}_${positions}`;
  }

  private _refreshIfChanged(game: GameDoc): void {
    const key = this._visualRefreshKey(game);
    if (key === this._lastRefreshKey) return;
    this._lastRefreshKey = key;
    this._refresh(game);
  }

  private _registerWatchers(): void {
    GameWatcher.on('game_start', this._onGameStart);
    GameWatcher.on('game_update', this._onGameUpdate);
    GameWatcher.on('game_over', this._onGameOver);
  }

  private _unregisterWatchers(): void {
    GameWatcher.off('game_start', this._onGameStart);
    GameWatcher.off('game_update', this._onGameUpdate);
    GameWatcher.off('game_over', this._onGameOver);
  }

  private _me(game: GameDoc): GamePlayer | undefined {
    return game.players.find((p) => p.openId === GameSession.user?.openId);
  }

  private _lastEventActor(game: GameDoc): GamePlayer | undefined {
    const seat = game.lastEvent?.actorSeat;
    if (seat !== undefined && game.players[seat]) return game.players[seat];
    return game.players[game.currentSeat];
  }

  private _displayName(p: GamePlayer): string {
    if (p.openId === GameSession.user?.openId) return '你';
    return playerDisplayName(p);
  }

  /** 右侧消息栏：`[昵称]内容` */
  private _formatLogLine(who: string | undefined, message: string): string {
    const text = (message ?? '').trim();
    if (!text) return '';
    if (!who) return text;
    const colonCn = `${who}：`;
    const colonEn = `${who}:`;
    const bracket = `[${who}]`;
    if (text.startsWith(bracket)) return text;
    if (text.startsWith(colonCn)) return `${bracket}${text.slice(colonCn.length)}`;
    if (text.startsWith(colonEn)) return `${bracket}${text.slice(colonEn.length)}`;
    return `${bracket}${text}`;
  }

  private _personalizeCellMessage(message: string, mover: GamePlayer): string {
    const isMe = mover.openId === GameSession.user?.openId;
    const who = isMe ? '你' : this._displayName(mover);
    return message;
  }

  private _diceToastKey(game: GameDoc): string {
    const actor = game.lastEvent?.actorSeat ?? game.currentSeat;
    const mover = game.players[actor];
    return `d${game.lastDice ?? 0}_s${actor}_p${mover?.position ?? 0}`;
  }

  private _normalizeLogMessage(message: string): string {
    return (message ?? '').replace(/^\[[^\]]+\]/, '').trim();
  }

  private _eventLogKey(
    e: GameMoveEvent,
    _game: GameDoc,
    _index: number,
  ): string {
    const msg = this._normalizeLogMessage(e.message ?? '');
    if (e.type === 'ATTACK_PLAYER' || e.type === 'ATTACK_NEUTRAL') {
      return `${e.type}|${msg}`;
    }
    return `${e.type}|${e.actorSeat ?? ''}|${e.cellIndex ?? ''}|${msg}`;
  }

  private _syncLogFromGame(game: GameDoc): void {
    const all = this._filterToastEvents(
      (game.lastEvents ?? []) as unknown as CellEventItem[],
    );
    if (all.length < this._loggedEventCount) {
      this._loggedEventCount = 0;
    }
    if (all.length > this._loggedEventCount) {
      this._appendEventsToLog(
        all.slice(this._loggedEventCount) as unknown as GameMoveEvent[],
        game,
      );
      this._loggedEventCount = all.length;
    }
    this._appendImportantLastEvent(game);
    this._announcePhaseIfNeeded(game);
  }

  private _appendImportantLastEvent(game: GameDoc): void {
    const ev = game.lastEvent;
    if (!ev?.message || !LOG_ALWAYS_TYPES.has(ev.type)) return;
    const moveEv = {
      type: ev.type,
      message: ev.message,
      actorSeat: ev.actorSeat,
    } as GameMoveEvent;
    if (this._appendedLogKeys.has(this._eventLogKey(moveEv, game, 0))) return;
    const key = `imp_${game.updatedAt ?? 0}_${ev.type}_${ev.actorSeat ?? ''}_${ev.message}`;
    if (this._seenImportantEventKeys.has(key)) return;
    this._seenImportantEventKeys.add(key);
    if (this._seenImportantEventKeys.size > 120) {
      const first = this._seenImportantEventKeys.values().next().value;
      if (first) this._seenImportantEventKeys.delete(first);
    }
    this._appendEventsToLog(
      [
        {
          type: ev.type,
          message: ev.message,
          actorSeat: ev.actorSeat,
        } as GameMoveEvent,
      ],
      game,
    );
  }

  private _announcePhaseIfNeeded(game: GameDoc): void {
    const phase = game.survivalPhase ?? 'DEVELOPMENT';
    if (!this._phaseAnnouncedReady) {
      this._lastAnnouncedPhase = phase;
      this._phaseAnnouncedReady = true;
      return;
    }
    if (phase === this._lastAnnouncedPhase) return;
    this._lastAnnouncedPhase = phase;
    let msg = '';
    if (phase === 'CONTEST') {
      msg = '【阶段公告】进入争夺阶段！补给争夺开始，局势升温。';
    } else if (phase === 'FINAL') {
      msg = '【阶段公告】进入决战阶段！废格燃烧，决战商店已刷新。';
    } else {
      msg = '【阶段公告】进入发育阶段。';
    }
    this._sidePanel?.appendMessage(msg);
  }

  private _appendEventsToLog(
    events: GameMoveEvent[] | undefined,
    game: GameDoc,
  ): void {
    if (!events?.length) return;

    const me = this._me(game);
    events.forEach((e, index) => {
      const dedupeKey = this._eventLogKey(e, game, index);
      if (this._appendedLogKeys.has(dedupeKey)) return;
      this._appendedLogKeys.add(dedupeKey);
      if (this._appendedLogKeys.size > 80) {
        const first = this._appendedLogKeys.values().next().value;
        if (first) this._appendedLogKeys.delete(first);
      }
      if (!e.message) return;
      const actor =
        e.actorSeat != null && game.players?.[e.actorSeat]
          ? game.players[e.actorSeat]
          : undefined;
      const base = actor
        ? this._personalizeCellMessage(e.message, actor)
        : e.message;
      const who = actor ? playerDisplayName(actor) : '';
      const line = this._formatLogLine(who || undefined, base);
      if (line) this._sidePanel?.appendMessage(line);
    });
  }

  private async _bootstrapGame(gameId: string): Promise<void> {
    this._hud?.setLoading();
    const game = await GameWatcher.pullGameSnapshot(gameId);
    if (!game) {
      this._hud?.setError('对局加载失败，请稍后重试');
      this._boardDataReady = true;
      this._revealBoardIfReady();
      return;
    }
    const me = this._me(game);
    this._cameraFocusSeat = null;
    this._boardManualPan.set(0, 0, 0);
    this._refresh(game);
    // 刚进入棋盘时也要把最近事件补到右侧消息列表（例如吹牛结束奖励）
    const bootEvents = this._filterToastEvents(
      (game.lastEvents ?? []) as unknown as CellEventItem[],
    );
    this._appendEventsToLog(bootEvents as unknown as GameMoveEvent[], game);
    this._loggedEventCount = bootEvents.length;
    this._boardDataReady = true;
    this._revealBoardIfReady();
    if (this._boardRevealed) {
      this._syncEntryCameraFocus(game);
    }
    void this._handlePendingInteraction(game);
  }

  private async _onQuit(): Promise<void> {
    const gameId = GameSession.gameId;
    if (!gameId) return;
    try {
      await quitGame(gameId);
      await this._goSettlementWithSnapshot();
    } catch (err: unknown) {
      console.warn('[Board] quit', err);
    }
  }

  private _filterToastEvents(events: CellEventItem[]): CellEventItem[] {
    return events.filter(
      (e) =>
        e.message &&
        (!TOAST_SKIP_TYPES.has(e.type) || LOG_ALWAYS_TYPES.has(e.type)),
    );
  }

  private _landCellLabel(game: GameDoc, position: number): string {
    const cell = game.boardCells?.find((c) => c.index === position);
    const t = cell?.type || 'NORMAL';
    return CELL_LABEL[t] || t;
  }

  private _shouldSkipMoveCompletePrompt(game: GameDoc, me: GamePlayer): boolean {
    if (game.movePause?.seat === me.seat) return true;
    if (game.pendingInteraction?.seat === me.seat) return true;
    if (game.luckySpin?.seat === me.seat) {
      return true;
    }
    if (
      game.eventState?.id === 'BOSS_SUPPRESSION' &&
      game.eventState.phase === 'CHOICE' &&
      !game.eventState.data?.choices?.[me.seat]
    ) {
      return true;
    }
    const cell = game.boardCells?.find((c) => c.index === me.position);
    if (cell && INTERACTION_CELL_TYPES.has(cell.type)) return true;
    return false;
  }

  private async _showMoveCompleteIfReady(
    game: GameDoc,
    steps: number,
  ): Promise<void> {
    const me = this._me(game);
    if (!me || me.seat !== game.currentSeat || me.isDefeated) return;
    if (this._shouldSkipMoveCompletePrompt(game, me)) return;
    if (!steps || steps <= 0) return;

    const promptKey = `mv_${game.updatedAt ?? 0}_${me.seat}_${me.position}_${steps}`;
    if (promptKey === this._lastMovePromptKey) return;
    this._lastMovePromptKey = promptKey;

    const pos = me.position;
    const cellName = this._landCellLabel(game, pos);
    const hint =
      '可继续投骰/攻击/用道具，或用「结束」结束回合。';
    const msg = `本回合移动 ${steps} 步，落在【${cellName}】（第 ${pos + 1} 格）。\n${hint}`;
    if (this._cellToast) {
      await this._cellToast.showMoveCompleteAwait(msg);
    } else {
      this._sidePanel?.appendMessage(`[你]${msg.replace('\n', ' ')}`);
    }
  }

  /** 落点为普通格时，用路径上最后一个有效事件类型作为弹窗标题 */
  private _resolveToastCellType(
    game: GameDoc,
    events: CellEventItem[],
    landPosition?: number,
  ): CellType | null {
    if (!events.length) return null;
    for (let i = events.length - 1; i >= 0; i--) {
      const t = events[i].type;
      if (t && t !== 'NORMAL' && !TOAST_SKIP_TYPES.has(t)) {
        return t as CellType;
      }
    }
    if (landPosition != null) {
      const land = this._cellTypeAt(game, landPosition);
      if (land !== 'NORMAL') return land;
    }
    return null;
  }

  private _cellTypeAt(game: GameDoc, position: number): CellType {
    const cell = game.boardCells.find((c) => c.index === position);
    return (cell?.type as CellType) || 'NORMAL';
  }

  private _toastKey(game: GameDoc, events: CellEventItem[]): string {
    const msg = events.map((e) => e.message).join('|');
    const actor = game.lastEvent?.actorSeat ?? '';
    return `${actor}_${msg}`;
  }

  private _showCellToast(
    game: GameDoc,
    events: CellEventItem[],
    landPosition?: number,
    actorName?: string,
  ): void {
    const filtered = this._filterToastEvents(events);
    if (!filtered.length || !this._cellToast) return;
    const cellType = this._resolveToastCellType(game, filtered, landPosition);
    if (!cellType || cellType === 'NORMAL') return;

    const key = this._toastKey(game, filtered);
    if (key === this._lastToastKey) return;
    this._lastToastKey = key;
    this._cellToast.show(filtered, cellType, actorName);
  }

  private async _maybeShowBotActionToast(game: GameDoc): Promise<void> {
    if (Date.now() < this._skipWatchToastUntil) return;
    const ev = game.lastEvent;
    if (!ev || ev.type !== 'BOT_ACTION' || !ev.message) return;
    const actor = this._lastEventActor(game);
    if (!actor) return;
    const key = `${actor.seat}_${ev.message}_${game.updatedAt ?? 0}`;
    if (key === this._lastBotToastKey) return;
    this._lastBotToastKey = key;
    this._appendEventsToLog(
      [{ type: 'BOT_ACTION', message: ev.message, actorSeat: actor.seat }],
      game,
    );
  }

  private _maybeShowCellToast(game: GameDoc): void {
    // 已改为右侧消息列表实时展示，不再弹窗打断视角
    return;
  }

  private async _maybeAnimateRemoteMove(game: GameDoc): Promise<void> {
    if (!game.lastDice || this._pawnView?.animating) return;

    let moverSeat = -1;
    let fromPos: number | undefined;
    game.players.forEach((p, seat) => {
      const prev = this._lastPositions[seat];
      if (prev !== undefined && prev !== p.position) {
        moverSeat = seat;
        fromPos = prev;
      }
    });
    if (moverSeat < 0 || fromPos === undefined) return;
    const mover = game.players[moverSeat];
    if (!mover || mover.openId === GameSession.user?.openId) return;

    let steps = game.lastDice ?? 0;
    const pause = game.movePause;
    if (pause && pause.seat === moverSeat && pause.segmentSteps) {
      steps = pause.segmentSteps;
    } else if (fromPos !== undefined && mover.position !== fromPos) {
      const diff = (mover.position - fromPos + BOARD_SIZE) % BOARD_SIZE;
      if (diff > 0 && diff <= (game.lastDice ?? 6)) steps = diff;
    }

    await this._pawnView?.animateAlongPath(
      game,
      moverSeat,
      fromPos,
      steps,
      moverSeat,
    );
    this._syncPositions(game);
  }

  private _syncPositions(game: GameDoc): void {
    this._lastPositions = game.players.map((p) => p.position);
  }

  private async _maybeShowOpponentDice(game: GameDoc): Promise<void> {
    // 已改为右侧消息列表实时展示，不再弹窗
    return;
    if (!game.lastDice || Date.now() < this._skipWatchToastUntil) return;

    const me = this._me(game);
    if (me && game.currentSeat === me.seat) {
      this._diceToast?.hide();
      return;
    }

    const key = this._diceToastKey(game);
    if (key === this._lastDiceToastKey) return;

    const mover = this._lastEventActor(game);
    if (!mover || mover.openId === GameSession.user?.openId) return;

    this._lastDiceToastKey = key;
    await this._diceToast?.show(
      game.lastDice,
      `${this._displayName(mover)} 掷出了`,
    );
  }

  private _refresh(game: GameDoc | null, opts?: { skipPawn?: boolean }): void {
    if (!this._isLive() || !game) return;
    GameStateMirror.setGame(game as unknown as Record<string, unknown>);
    this._boardView?.refresh(game);
    if (!opts?.skipPawn && !this._pawnView?.animating) {
      this._pawnView?.refresh(game);
      this._syncPositions(game);
    }
    const me = this._me(game);
    const focusSeat =
      this._cameraFocusSeat ?? me?.seat ?? game.currentSeat;
    this._focusCameraOnSeat(game, focusSeat);
    this._hud?.clearError();
    this._hud?.setBusy(false);
    this._hud?.refresh(game);
    if (me && game.currentSeat === me.seat) {
      this._diceToast?.hide();
    }
    this._syncSidePanelButtons(game);
    this._syncChatFromGame(game);
    this._syncLogFromGame(game);
    if (game.pendingInteraction?.type !== 'LUCKY' && !game.luckySpin) {
      this._cancelLuckySettleTimer();
      if (game.lastEvent?.type === 'LUCKY') {
        this._tryNotifyLuckySettled(game);
      } else if (
        game.lastEvent?.type === 'EVENT' &&
        !game.pendingInteraction &&
        !game.eventState
      ) {
        void this._tryNotifyEventSettled(game);
      } else if (this._combatUi?.hasLuckySpin()) {
        this._combatUi.clearLuckyIfOpen();
        this._handledPendingKey = '';
      }
    } else if (this._combatUi?.hasLuckySpin() && game.luckySpin) {
      this._combatUi.updateLuckySpin(game.luckySpin);
      if (game.luckySpin.phase === 'SLOW') {
        this._scheduleLuckySettle(game.luckySpin);
      }
    }
    this._boardDataReady = true;
    this._revealBoardIfReady();
  }

  private _syncSidePanelButtons(game: GameDoc): void {
    const me = this._me(game);
    if (!me || !this._sidePanel) return;
    const isMyTurn = me.seat === game.currentSeat;
    const onBoard = game.phase === 'BOARD';
    const canAct = onBoard && isMyTurn && !this._busy && !me.isDefeated;
    const ta = me.turnActions;
    const rollEnabled =
      canAct &&
      (!ta?.rolled || (!!ta.rolled && !!ta.extraRollAvailable && !ta.extraRolled));
    const attackEnabled = canAct && !ta?.attacked && !!me.weapon;
    const endEnabled = canAct;

    this._sidePanel.setButtonEnabled('roll', rollEnabled);
    this._sidePanel.setButtonEnabled('bag', true);
    this._sidePanel.setButtonEnabled('atk', attackEnabled);
    this._sidePanel.setButtonEnabled('end', endEnabled);
  }

  private _syncChatFromGame(game: GameDoc): void {
    const rows = (game as unknown as { chatLog?: { ts: number; text: string; seat?: number; nickname?: string }[] }).chatLog;
    if (!rows || !rows.length || !this._sidePanel) return;
    const last = rows[rows.length - 1];
    const lastTs = last?.ts ?? 0;
    if (lastTs <= this._lastChatAt) return;
    rows.forEach((r) => {
      if (!r || (r.ts ?? 0) <= this._lastChatAt) return;
      const who = r.nickname || (r.seat != null ? `座位${r.seat + 1}` : '玩家');
      this._sidePanel!.appendMessage(this._formatLogLine(who, r.text));
    });
    this._lastChatAt = lastTs;
  }

  private _cancelLuckySettleTimer(): void {
    if (this._luckySettleTimer) {
      clearTimeout(this._luckySettleTimer);
      this._luckySettleTimer = null;
    }
    this._luckySettleKey = '';
  }

  private _cancelEventSettleTimer(): void {
    if (this._eventSettleTimer) {
      clearTimeout(this._eventSettleTimer);
      this._eventSettleTimer = null;
    }
  }

  private _scheduleLuckySettle(lucky: NonNullable<GameDoc['luckySpin']>): void {
    if (lucky.phase !== 'SLOW' || !lucky.stopAt) return;
    const settleKey = `${lucky.stopAt}_${lucky.finalIndex ?? ''}`;
    if (settleKey === this._luckySettleKey && this._luckySettleTimer) return;
    this._cancelLuckySettleTimer();
    this._luckySettleKey = settleKey;
    const delay = Math.max(80, lucky.stopAt - Date.now() + 80);
    this._luckySettleTimer = setTimeout(() => void this._flushLuckySettle(), delay);
  }

  private async _flushLuckySettle(attempt = 0): Promise<void> {
    this._luckySettleTimer = null;
    if (!this._isLive()) return;
    const gameId = GameSession.gameId;
    if (!gameId) return;
    try {
      const res = await tick(gameId);
      if (!res.game) return;
      const game = res.game as unknown as GameDoc;
      const stillPending =
        game.pendingInteraction?.type === 'LUCKY' || !!game.luckySpin;
      if (stillPending && attempt < 15) {
        if (game.luckySpin) {
          this._combatUi?.updateLuckySpin(game.luckySpin);
        }
        this._luckySettleTimer = setTimeout(
          () => void this._flushLuckySettle(attempt + 1),
          120,
        );
        return;
      }
      this._lastRemoteActionKey = this._remoteActionKey(game);
      this._refresh(game);
      this._tryNotifyLuckySettled(game);
    } catch (err: unknown) {
      console.warn('[Board] lucky settle', err);
    }
  }

  /** 幸运格结算：触发者与旁观者均展示选中项与奖励 */
  private _tryNotifyLuckySettled(game: GameDoc): void {
    const evt = game.lastEvent;
    if (evt?.type !== 'LUCKY' || !evt.message) return;
    if (game.pendingInteraction?.type === 'LUCKY' || game.luckySpin) return;

    const key = `lucky_${evt.actorSeat ?? ''}_${evt.message}`;
    if (key === this._lastLuckyResultKey) return;
    this._lastLuckyResultKey = key;
    this._handledPendingKey = '';

    const me = this._me(game);
    const actorSeat = evt.actorSeat;
    const isActor = me != null && actorSeat === me.seat;
    const actor = actorSeat != null ? game.players[actorSeat] : undefined;
    const who = actor ? this._displayName(actor) : '玩家';

    const logMsg = this._formatLogLine(who, evt.message);
    this._appendEventsToLog(
      [{ type: 'LUCKY', message: logMsg, actorSeat }],
      game,
    );

    if (
      isActor &&
      game.movePause?.seat === me.seat &&
      game.currentSeat === me.seat
    ) {
      this._moveContinueKey = '';
      void this._maybeContinueMove(game);
    }

    if (this._combatUi?.hasLuckySpin()) {
      this._combatUi.finishLuckySpin(evt.message);
      return;
    }

    const toastMsg = isActor ? evt.message : `${who} ${evt.message}`;
    this._showLuckyResultToast(toastMsg);
  }

  private async _tryNotifyEventSettled(game: GameDoc): Promise<void> {
    if (game.pendingInteraction?.type === 'EVENT' || game.eventState) return;
    const evt = game.lastEvent;
    if (evt?.type !== 'EVENT' || !evt.message) return;

    const key = `event_${evt.actorSeat ?? ''}_${evt.message}`;
    const me = this._me(game);
    const actorSeat = evt.actorSeat;
    const isActor = me != null && actorSeat === me.seat;
    const shouldContinue =
      !!me &&
      !!game.movePause &&
      game.movePause.seat === me.seat &&
      isActor &&
      game.currentSeat === me.seat;

    if (key === this._lastEventResultKey) {
      if (shouldContinue) {
        this._moveContinueKey = '';
        void this._maybeContinueMove(game);
      }
      return;
    }
    this._lastEventResultKey = key;
    this._handledPendingKey = '';

    const actor = actorSeat != null ? game.players[actorSeat] : undefined;
    const who = actor ? this._displayName(actor) : '玩家';
    const logMsg = this._formatLogLine(who, evt.message);
    this._appendEventsToLog(
      [{ type: 'EVENT', message: logMsg, actorSeat }],
      game,
    );

    if (shouldContinue) {
      this._moveContinueKey = '';
      void this._maybeContinueMove(game);
    }

  }

  private _showLuckyResultToast(message: string): void {
    if (!this._cellToast) return;
    const key = `lucky_toast_${message}`;
    if (key === this._lastToastKey) return;
    this._lastToastKey = key;
    this._cellToast.show(
      [{ type: 'LUCKY', message }],
      'LUCKY',
      '幸运格',
    );
  }

  private async _doLuckyStart(gameId: string): Promise<void> {
    if (this._busy) return;
    this._busy = true;
    try {
      const res = await luckyStart(gameId);
      if (res.game) {
        this._refresh(res.game as unknown as GameDoc);
      }
    } catch (err: unknown) {
      this._hud?.setError(err instanceof Error ? err.message : String(err));
    } finally {
      this._busy = false;
    }
  }

  private async _doLuckyEnd(gameId: string): Promise<void> {
    if (this._busy) return;
    this._busy = true;
    try {
      const res = await luckyEnd(gameId);
      const game = res.game as unknown as GameDoc | undefined;
      if (game) {
        this._refresh(game);
        if (game.luckySpin?.phase === 'SLOW') {
          this._scheduleLuckySettle(game.luckySpin);
        }
      }
    } catch (err: unknown) {
      this._hud?.setError(err instanceof Error ? err.message : String(err));
    } finally {
      this._busy = false;
    }
  }

  private _canContinueDespitePending(
    game: GameDoc,
    me: GamePlayer,
  ): boolean {
    const pending = game.pendingInteraction;
    if (!pending) return true;
    if (pending.seat !== me.seat || game.currentSeat !== me.seat) return false;
    if (
      pending.type === 'GOLD_SHOP' ||
      pending.type === 'LEGENDARY_SHOP' ||
      pending.type === 'FINAL_SHOP'
    ) {
      return true;
    }
    if (pending.type === 'LUCKY') {
      return !game.luckySpin;
    }
    if (pending.type === 'EVENT' || pending.type === 'CHARITY_SHOP') {
      return !game.eventState;
    }
    return false;
  }

  private async _maybeContinueMove(latest?: GameDoc | null): Promise<void> {
    const gameId = GameSession.gameId;
    const mirror = (latest ?? GameStateMirror.game) as GameDoc | null;
    const me = mirror ? this._me(mirror) : undefined;
    if (!gameId || !mirror || !me || this._busy) return;
    if (!mirror.movePause || mirror.movePause.seat !== me.seat) return;

    const continueKey = this._movePauseContinueKey(mirror);
    if (!continueKey || continueKey === this._moveContinueKey) return;

    if (!this._canContinueDespitePending(mirror, me)) {
      return;
    }

    const fromPos = me.position;
    this._moveContinueKey = continueKey;
    this._busy = true;
    this._hud?.setBusy(true);
    try {
      const res = await continueMove(gameId);
      const game = res.game as unknown as GameDoc | undefined;
      if (!game) return;
      GameStateMirror.setGame(game as unknown as Record<string, unknown>);
      const steps = res.segmentSteps ?? 0;
      if (steps > 0) {
        await this._applyGameResponse(game, {
          animateSeat: me.seat,
          fromPos,
          steps,
          events: res.events,
        });
      } else {
        this._refresh(game);
        await this._handlePendingInteraction(game);
      }
      if (res.settled) await this._goSettlementWithSnapshot();
    } catch (err: unknown) {
      this._moveContinueKey = '';
      this._hud?.setError(err instanceof Error ? err.message : String(err));
    } finally {
      this._busy = false;
      this._hud?.setBusy(false);
      const g = GameStateMirror.game as GameDoc | null;
      if (g) {
        if (!g.movePause || g.movePause.seat !== me.seat) {
          this._moveContinueKey = '';
        } else {
          this._moveContinueKey = this._movePauseContinueKey(g);
        }
        this._hud?.refresh(g);
        this._syncSidePanelButtons(g);
      }
    }
  }

  private async _onShopDismiss(gameId: string): Promise<void> {
    this._combatUi?.dismissModal();
    this._moveContinueKey = '';
    await this._maybeContinueMove();
  }

  private _pendingInteractionKey(game: GameDoc): string {
    const pending = game.pendingInteraction;
    if (!pending) return '';
    return `${pending.type}_${pending.seat}`;
  }

  private async _applyGameResponse(
    game: GameDoc | undefined,
    opts?: {
      animateSeat?: number;
      fromPos?: number;
      steps?: number;
      events?: GameMoveEvent[];
    },
  ): Promise<void> {
    if (!game) return;
    this._refresh(game, { skipPawn: !!opts?.animateSeat });

    if (
      opts?.animateSeat !== undefined &&
      opts.fromPos !== undefined &&
      opts.steps &&
      opts.steps > 0
    ) {
      await this._pawnView?.animateAlongPath(
        game,
        opts.animateSeat,
        opts.fromPos,
        opts.steps,
        opts.animateSeat,
      );
      this._syncPositions(game);
    }

    const me = this._me(game);
    const stepsDone = opts?.steps ?? 0;
    const rawEvents0 =
      opts?.events ??
      game.lastEvents ??
      (game.lastEvent
        ? [{ type: game.lastEvent.type, message: game.lastEvent.message }]
        : []);
    // 本地 action 的 res.events 可能缺 actorSeat，导致与 watch 推送的 lastEvents 去重 key 不一致而重复显示
    const fromLocal = !!opts?.events;
    const rawEvents = Array.isArray(rawEvents0)
      ? rawEvents0.map((e) => ({
          ...e,
          actorSeat:
            (e as unknown as { actorSeat?: number }).actorSeat ??
            (fromLocal ? me?.seat : undefined),
        }))
      : rawEvents0;
    // 注意：不要在这里“个人化”事件文本，否则会丢 actorSeat 并造成消息去重 key 不一致（出现重复）
    const toastEvents = this._filterToastEvents(rawEvents as unknown as GameMoveEvent[]);
    if (toastEvents.length) {
      this._appendEventsToLog(toastEvents, game);
    }

    this._skipWatchToastUntil = Date.now() + 400;
    await this._handlePendingInteraction(game, { allowWhileBusy: true });
    const latest = (GameStateMirror.game ?? game) as GameDoc;
    this._syncSidePanelButtons(latest);
    const meNow = this._me(latest);
    if (
      stepsDone > 0 &&
      meNow &&
      opts?.animateSeat === meNow.seat &&
      !this._shouldSkipMoveCompletePrompt(latest, meNow)
    ) {
      await this._showMoveCompleteIfReady(latest, stepsDone);
    }

  }

  private async _handlePendingInteraction(
    game: GameDoc,
    opts?: { allowWhileBusy?: boolean },
  ): Promise<void> {
    const pending = game.pendingInteraction;
    if (!pending) {
      this._handledPendingKey = '';
      return;
    }
    if (this._busy && !opts?.allowWhileBusy) return;

    const me = this._me(game);
    if (!me) return;

    const gameId = GameSession.gameId;
    if (!gameId) return;

    if (pending.type === 'CELL_ACK') {
      if (pending.seat !== me.seat || game.currentSeat !== me.seat) return;
      const key = `CELL_ACK_${game.lastEvent?.message ?? ''}`;
      if (key === this._handledPendingKey) return;
      this._handledPendingKey = key;
      const msg = game.lastEvent?.message ?? '事件格效果已生效';
      this._appendEventsToLog(
        [{ type: 'EVENT', message: msg, actorSeat: me.seat }],
        game,
      );
      await this._maybeContinueMove();
      return;
    }

    if (pending.type === 'LUCKY') {
      if (this._combatUi?.hasLuckySpin()) {
        this._combatUi.updateLuckySpin(game.luckySpin ?? null);
        return;
      }
      const key = this._pendingInteractionKey(game);
      if (key === this._handledPendingKey) return;
      this._handledPendingKey = key;

      const isActor =
        pending.seat === me.seat && game.currentSeat === me.seat;
      this._combatUi?.showLuckySpin(
        game,
        game.luckySpin ?? null,
        isActor,
        () => void this._doLuckyStart(gameId),
        () => void this._doLuckyEnd(gameId),
        () => {
          this._combatUi?.clearLuckyIfOpen();
        },
      );
      return;
    }

    if (pending.type === 'EVENT' || pending.type === 'CHARITY_SHOP') {
      const es = game.eventState;
      if (!es) return;
      const isBossChoice = es.id === 'BOSS_SUPPRESSION' && es.phase === 'CHOICE';
      const keySeat = isBossChoice ? me.seat : pending.seat;
      const key = `${pending.type}_${es.id}_${es.phase}_${keySeat}`;
      if (key === this._handledPendingKey) return;

      const isActor = pending.seat === me.seat && game.currentSeat === me.seat;
      if (isBossChoice) {
        const choices = (es.data?.choices ?? {}) as Record<number, string>;
        if (choices[me.seat]) return;
      } else if (!isActor) {
        return;
      }
      this._handledPendingKey = key;

      if (pending.type === 'CHARITY_SHOP') {
        const charityOptions = [
          { id: 'ROCKET', label: '火箭筒 2000金' },
          { id: 'MEDKIT', label: '医疗包 100金' },
          { id: 'DOUBLE_DICE', label: '双骰子 300金' },
          { id: 'SWORD', label: '剑 800金' },
        ];
        this._combatUi?.showEventModal(
          es.title,
          es.description,
          es.effect,
          charityOptions,
          (id) => void this._doBuyShop(gameId, 'CHARITY', id),
          () => void this._doResolveEvent(gameId, { action: 'leave' }),
        );
        return;
      }

      if (es.phase === 'INTRO') {
        this._combatUi?.showEventModal(
          es.title,
          es.description,
          es.effect,
          [{ id: 'ack', label: '触发事件' }],
          () => void this._doResolveEvent(gameId, { action: 'ack' }),
        );
        return;
      }
      if (es.id === 'BOSS_SUPPRESSION' && es.phase === 'CHOICE') {
        this._combatUi?.showEventModal(
          es.title,
          es.description,
          es.effect,
          [
            { id: 'LEFT', label: '躲向左侧' },
            { id: 'RIGHT', label: '躲向右侧' },
          ],
          (id) => void this._doResolveEvent(gameId, { action: 'choice', value: id }),
        );
        return;
      }
      if (es.id === 'LUCKY_GAMBLER' && es.phase === 'BET') {
        this._combatUi?.showEventModal(
          es.title,
          es.description,
          es.effect,
          [
            { id: '100', label: '投入 100 金币' },
            { id: '300', label: '投入 300 金币' },
            { id: 'all', label: '投入全部金币' },
          ],
          (id) =>
            void this._doResolveEvent(gameId, {
              action: 'bet',
              value: id === 'all' ? me.gold : Number(id),
            }),
        );
        return;
      }
      if (es.id === 'RESOURCE_AUCTION' && es.phase === 'AUCTION' && es.data?.currentBidder === me.seat) {
        this._combatUi?.showEventModal(
          es.title,
          es.description,
          es.effect,
          [
            { id: 'bid100', label: '出价 +100' },
            { id: 'bid200', label: '出价 +200' },
            { id: 'pass', label: '放弃出价' },
          ],
          (id) => {
            if (id === 'pass') {
              void this._doResolveEvent(gameId, { action: 'pass' });
              return;
            }
            const add = id === 'bid200' ? 200 : 100;
            const cur = Number(es.data?.highestBid ?? 0);
            void this._doResolveEvent(gameId, { action: 'bid', value: Math.max(100, cur + add) });
          },
        );
      }
      return;
    }

    if (pending.seat !== me.seat || game.currentSeat !== me.seat) {
      return;
    }

    const key = this._pendingInteractionKey(game);
    if (key === this._handledPendingKey) return;
    this._handledPendingKey = key;

    if (pending.type === 'GOLD_SHOP') {
      this._combatUi?.showShop(
        game,
        'GOLD',
        (itemType) => void this._doBuyShop(gameId, 'GOLD', itemType as GoldShopItemType),
        () => void this._onShopDismiss(gameId),
      );
      return;
    }

    if (pending.type === 'LEGENDARY_SHOP') {
      this._combatUi?.showShop(
        game,
        'LEGENDARY',
        (itemType) =>
          void this._doBuyShop(
            gameId,
            'LEGENDARY',
            itemType as LegendaryShopItemType,
          ),
        () => void this._onShopDismiss(gameId),
      );
      return;
    }

    if (pending.type === 'FINAL_SHOP') {
      this._combatUi?.showFinalShop(
        game,
        (itemType) => void this._doBuyShop(gameId, 'FINAL', itemType),
        () => void this._onShopDismiss(gameId),
      );
      return;
    }

  }

  private async _doResolveEvent(
    gameId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    this._combatUi?.dismissModal();
    this._busy = true;
    this._hud?.setBusy(true);
    try {
      const res = await resolveEvent(gameId, payload);
      const game = res.game as unknown as GameDoc | undefined;
      if (game) {
        this._handledPendingKey = '';
        this._refresh(game);
        await this._handlePendingInteraction(game);
        await this._maybeContinueMove(game);
      }
    } catch (err: unknown) {
      this._hud?.setError(err instanceof Error ? err.message : String(err));
      this._handledPendingKey = '';
    } finally {
      this._busy = false;
      this._hud?.setBusy(false);
    }
  }

  private async _doBuyShop(
    gameId: string,
    shopType: 'GOLD' | 'LEGENDARY' | 'FINAL' | 'CHARITY',
    itemType: string,
  ): Promise<void> {
    this._combatUi?.dismissModal();
    this._busy = true;
    this._hud?.setBusy(true);
    try {
      const res = await buyShopItem(gameId, shopType, itemType);
      if (res.event?.message) this._combatUi?.appendLog(res.event.message);
      if (res.game) {
        this._handledPendingKey = '';
        this._refresh(res.game);
        await this._maybeContinueMove();
      }
    } catch (err: unknown) {
      this._hud?.setError(err instanceof Error ? err.message : String(err));
    } finally {
      this._busy = false;
      this._hud?.setBusy(false);
      const g = GameStateMirror.game as GameDoc | null;
      if (g) {
        this._hud?.refresh(g);
        this._syncSidePanelButtons(g);
      }
    }
  }

  private _setCameraFocus(seat: number): void {
    const game = GameStateMirror.game as GameDoc | null;
    const me = game ? this._me(game) : undefined;
    if (me && seat === me.seat) {
      this._cameraFocusSeat = null;
    } else {
      this._cameraFocusSeat = seat;
    }
    this._boardManualPan.set(0, 0, 0);
    this._hud?.setFocusSeat(this._cameraFocusSeat ?? me?.seat ?? seat);
    if (game) this._refresh(game);
  }

  private async _onRoll(): Promise<void> {
    const gameId = GameSession.gameId;
    if (!gameId || this._busy) return;

    const mirror = GameStateMirror.game as GameDoc | null;
    const me = mirror ? this._me(mirror) : undefined;
    const before =
      this._lastPositions.length > 0
        ? [...this._lastPositions]
        : mirror?.players.map((p) => p.position) ?? [];

    const isExtra =
      !!me?.turnActions?.rolled &&
      !!me.turnActions.extraRollAvailable &&
      !me.turnActions.extraRolled;

    this._moveContinueKey = '';
    this._busy = true;
    this._hud?.setBusy(true);
    try {
      const res = isExtra
        ? await extraRollDice(gameId)
        : await rollDice(gameId);

      if (res.dice !== undefined && this._diceToast) {
        void this._diceToast.show(
          res.dice,
          isExtra ? '你额外掷出了' : '你掷出了',
        );
        await delay(400);
      }
      if (res.game) this._lastDiceToastKey = this._diceToastKey(res.game);

      if (res.game && me) {
        const steps =
          res.segmentSteps ?? res.totalSteps ?? res.dice ?? 0;
        await this._applyGameResponse(res.game, {
          animateSeat: me.seat,
          fromPos: before[me.seat],
          steps,
          events: res.events,
        });
      }

      if (res.settled) await this._goSettlementWithSnapshot();
    } catch (err: unknown) {
      this._hud?.setError(this._friendlyError(err, '掷骰失败'));
      console.warn('[Board] roll failed', err);
    } finally {
      this._busy = false;
      this._hud?.setBusy(false);
      const g = GameStateMirror.game as GameDoc | null;
      if (g) {
        this._refresh(g);
        this._syncSidePanelButtons(g);
        void this._handlePendingInteraction(g);
      }
    }
  }

  private async _onItem(): Promise<void> {
    // 道具入口已迁移到背包
    this._onBackpack();
  }

  private async _doEquipWeapon(
    _gameId: string,
    weapon: 'SWORD' | 'GUN' | 'ROCKET',
  ): Promise<void> {
    // TODO: 接入服务端 equipWeapon（本轮先做 UI 与本地体验）
    const g = GameStateMirror.game as GameDoc | null;
    if (!g) return;
    const me = this._me(g);
    if (!me) return;
    me.weapon = weapon;
    this._sidePanel?.appendMessage(`你装备了 ${weapon}`);
    this._refresh(g);
  }

  private async _doUseItem(
    gameId: string,
    itemType: ConsumableItemType,
  ): Promise<void> {
    this._combatUi?.dismissModal();
    this._busy = true;
    this._hud?.setBusy(true);
    try {
      const res = await useItem(gameId, itemType);
      if (res.event?.message) this._combatUi?.appendLog(res.event.message);
      if (res.game) this._refresh(res.game);
    } catch (err: unknown) {
      this._hud?.setError(this._friendlyError(err, '使用道具失败'));
    } finally {
      this._busy = false;
      this._hud?.setBusy(false);
      const g = GameStateMirror.game as GameDoc | null;
      if (g) {
        this._hud?.refresh(g);
        this._syncSidePanelButtons(g);
      }
    }
  }

  private async _onAttack(): Promise<void> {
    const game = GameStateMirror.game as GameDoc | null;
    const me = game ? this._me(game) : undefined;
    if (!game || !me || this._busy) return;

    this._combatUi?.showAttackPicker(
      game,
      me,
      (target) => void this._doAttack(target),
      () => {},
    );
  }

  private async _doAttack(
    target:
      | { type: 'PLAYER'; seat: number }
      | { type: 'NEUTRAL'; region: RegionIndex },
  ): Promise<void> {
    const gameId = GameSession.gameId;
    if (!gameId) return;
    this._combatUi?.dismissModal();
    this._busy = true;
    this._hud?.setBusy(true);
    try {
      const res =
        target.type === 'PLAYER'
          ? await attackTarget(gameId, 'PLAYER', { targetSeat: target.seat })
          : await attackTarget(gameId, 'NEUTRAL_CREATURE', {
              regionIndex: target.region,
            });
      if (res.event?.message) this._combatUi?.appendLog(res.event.message);
      else if (res.damage != null) {
        const who =
          target.type === 'PLAYER'
            ? `座位${target.seat + 1}`
            : `中立生物区${target.region + 1}`;
        this._combatUi?.appendLog(
          `攻击${who} 造成${res.damage}伤害${res.killed ? '，已淘汰' : ''}`,
        );
      }
      if (res.game) this._refresh(res.game);
      if (res.settled) await this._goSettlementWithSnapshot();
    } catch (err: unknown) {
      this._hud?.setError(this._friendlyError(err, '攻击失败'));
    } finally {
      this._busy = false;
      this._hud?.setBusy(false);
      const g = GameStateMirror.game as GameDoc | null;
      if (g) {
        this._hud?.refresh(g);
        this._syncSidePanelButtons(g);
      }
    }
  }

  private async _onEndTurn(): Promise<void> {
    const gameId = GameSession.gameId;
    if (!gameId || this._busy) return;
    this._busy = true;
    this._hud?.setBusy(true);
    try {
      const res = await endTurn(gameId);
      this._handledPendingKey = '';
      this._combatUi?.dismissModal();
      if (res.game) this._refresh(res.game);
      if (res.settled) await this._goSettlementWithSnapshot();
    } catch (err: unknown) {
      this._hud?.setError(this._friendlyError(err, '结束回合失败'));
    } finally {
      this._busy = false;
      this._hud?.setBusy(false);
      const g = GameStateMirror.game as GameDoc | null;
      if (g) this._hud?.refresh(g);
    }
  }

  private _friendlyError(err: unknown, fallback: string): string {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('NOT_YOUR_TURN')) return '还没轮到你';
    if (msg.includes('ALREADY_ROLLED')) return '本回合已投骰';
    if (msg.includes('ALREADY_ATTACKED')) return '本回合已攻击';
    if (msg.includes('ALREADY_USED_ITEM')) return '本回合已用道具';
    if (msg.includes('NO_WEAPON')) return '需要装备武器才能攻击';
    if (msg.includes('OUT_OF_RANGE')) return '目标超出攻击距离';
    return msg || fallback;
  }

  private _onGameOver = (game: GameDoc) => {
    GameStateMirror.setGame(game as unknown as Record<string, unknown>);
    this._refresh(game);
    void this._goSettlementWithSnapshot();
  };

  private async _goSettlementWithSnapshot(): Promise<void> {
    this._hud?.stopCountdown();
    const gameId = GameSession.gameId;
    if (gameId) {
      const fresh = await GameWatcher.pullGameSnapshot(gameId);
      if (fresh?.settlement) {
        GameStateMirror.setGame(fresh as unknown as Record<string, unknown>);
      }
    }
    SceneLoader.loadSettlement();
  }

  /** 格子特写缩放（非鸟瞰整盘） */
  private _applyBoardFit(): void {
    if (!this._boardContent?.isValid) return;
    const ui = boardUiLayout();
    const scale = boardFocusZoom(ui.leftW, ui.topH);
    this._boardZoom = scale;
    this._boardContent.setScale(new Vec3(scale, scale, 1));
    this._pawnView?.applyArt();
    console.log(
      '[Board] focus zoom',
      scale.toFixed(2),
      'viewport',
      ui.leftW,
      ui.topH,
      'build',
      '20260604-board-focus-v6-zoom2x',
    );
    const g = GameStateMirror.game as GameDoc | null;
    if (g) this._refresh(g, { skipPawn: true });
    else this._applyBoardFocusOffset(this._boardBaseOffset);
  }

  private _relayoutUi(applyFit = true): void {
    const ui = boardUiLayout();
    if (this._boardViewport?.isValid) {
      this._boardViewport.setPosition(ui.boardCenter);
      const ut = this._boardViewport.getComponent(UITransform);
      if (ut) ut.setContentSize(ui.leftW, ui.topH);
      const vpBg = this._boardViewport.getChildByName('ViewportBg');
      const vpUt = vpBg?.getComponent(UITransform);
      if (vpUt) vpUt.setContentSize(ui.leftW, ui.topH);
      const vpG = vpBg?.getComponent(Graphics);
      if (vpG) {
        vpG.clear();
        vpG.fillColor = new Color(22, 28, 42, 200);
        vpG.rect(-ui.leftW / 2, -ui.topH / 2, ui.leftW, ui.topH);
        vpG.fill();
      }
      if (applyFit && this._boardUiReady) {
        this._applyBoardFit();
      }
    }
    this._hud?.relayout();
    this._sidePanel?.relayout({
      panelW: ui.rightW,
      buttonCenter: ui.sideButtonCenter,
      buttonZoneH: ui.sideButtonZoneH,
      logCenter: ui.sideLogCenter,
      logZoneH: ui.sideLogZoneH,
    });
  }

  private _stopBoardPoll(): void {
    if (this._boardPollTimer) {
      clearInterval(this._boardPollTimer);
      this._boardPollTimer = null;
    }
    if (this._tickTimer) {
      clearInterval(this._tickTimer);
      this._tickTimer = null;
    }
  }

  teardown(): void {
    this._destroyed = true;
    if (this._boardViewport?.isValid) {
      this._boardViewport.off(Node.EventType.TOUCH_START, this._onBoardDragStart, this);
      this._boardViewport.off(Node.EventType.TOUCH_MOVE, this._onBoardDragMove, this);
      this._boardViewport.off(Node.EventType.TOUCH_END, this._onBoardDragEnd, this);
      this._boardViewport.off(Node.EventType.TOUCH_CANCEL, this._onBoardDragEnd, this);
    }
    this._stopBoardPoll();
    this._hud?.stopCountdown();
    this._hud?.destroy();
    this._cancelLuckySettleTimer();
    this._cancelEventSettleTimer();
    this._unregisterWatchers();
    this._combatUi?.destroy();
    this._cellToast?.hide();
    this._diceToast?.hide();
    this._unbindHide?.();
    this._unbindHide = null;
    this._unbindResize?.();
    this._unbindResize = null;
    this._moveContinueKey = '';
  }

  onDestroy(): void {
    if (BoardController._active === this) {
      BoardController._active = null;
    }
    this.teardown();
  }
}
