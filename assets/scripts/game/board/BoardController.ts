import { _decorator, Component } from 'cc';
import { GameSession } from '../../core/GameSession';
import { SceneLoader } from '../../core/SceneLoader';
import { rollDice, quitGame } from '../../network/GameService';
import { bindWxHideQuit } from '../../platform/wechat/WxLifecycle';
import { GameStateMirror } from '../../network/GameStateMirror';
import { GameWatcher } from '../../network/GameWatcher';
import type { CellType, GameDoc, GamePlayer } from '../../types/GameTypes';
import { MinigamePromptDialog } from '../MinigamePromptDialog';
import { playerDisplayName } from '../playerDisplayName';
import { BoardView } from './BoardView';
import { CellEventToast, type CellEventItem } from './CellEventToast';
import { DiceResultToast } from './DiceResultToast';
import { HudController } from './HudController';
import { PawnView } from './PawnView';

const { ccclass } = _decorator;

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 棋盘场景主控 → AC-6, AC-7, AC-14 */
@ccclass('BoardController')
export class BoardController extends Component {
  private static _active: BoardController | null = null;

  private _boardView: BoardView | null = null;
  private _pawnView: PawnView | null = null;
  private _hud: HudController | null = null;
  private _cellToast: CellEventToast | null = null;
  private _diceToast: DiceResultToast | null = null;
  private _rolling = false;
  private _unbindHide: (() => void) | null = null;
  private _lastToastKey = '';
  private _lastDiceToastKey = '';
  private _skipWatchToastUntil = 0;
  private _navigatingBluff = false;
  private _bluffNavPromise: Promise<void> | null = null;
  private _boardPollTimer: ReturnType<typeof setInterval> | null = null;
  private _lastRefreshKey = '';
  private _lastPositions: number[] = [];

  private _onGameStart = (game: GameDoc) => {
    this._applyRemoteGame(game, false);
  };

  private _onGameUpdate = (game: GameDoc) => {
    this._applyRemoteGame(game, true);
  };

  private _applyRemoteGame(game: GameDoc, showToasts: boolean): void {
    if (game.phase === 'SETTLED' || game.settlement) {
      void this._goSettlementWithSnapshot();
      return;
    }

    if (game.phase === 'MINIGAME_BLUFF') {
      this._navigatingBluff = false;
      this._diceToast?.hide();
      this._cellToast?.hide();
      this._ensureBluffScene();
      return;
    }

    if (game.phase === 'BOARD') {
      this._navigatingBluff = false;
    }

    if (this._rolling) {
      this._refreshIfChanged(game);
      return;
    }

    if (showToasts) {
      const key = this._gameRefreshKey(game);
      if (key === this._lastRefreshKey) return;
      this._lastRefreshKey = key;
      void (async () => {
        this._refresh(game, { skipPawn: true });
        await this._showRemoteTurnToasts(game);
        this._pawnView?.refresh(game);
        this._syncPositions(game);
      })();
      return;
    }

    this._refreshIfChanged(game);
  };

  /** 他人回合：骰子 → 逐格移动 → 落格提示 */
  private async _showRemoteTurnToasts(game: GameDoc): Promise<void> {
    await this._maybeShowOpponentDice(game);
    await this._maybeAnimateRemoteMove(game);
    this._maybeShowCellToast(game);
  };

  private _onMinigameEnd = (game: GameDoc) => {
    this._navigatingBluff = false;
    this._rolling = false;
    this._refresh(game);
    void this._pullAndRefresh();
  };

  onLoad(): void {
    BoardController._active?.teardown();
    BoardController._active = this;

    const canvas = this.node;
    this._boardView = new BoardView(canvas);
    this._pawnView = new PawnView(canvas);
    this._cellToast = new CellEventToast(canvas);
    this._diceToast = new DiceResultToast(canvas);
    this._hud = new HudController(canvas, () => void this._onRoll(), () => void this._onQuit());

    this._registerWatchers();

    this._unbindHide = bindWxHideQuit(() => SceneLoader.loadSettlement());

    const gameId = GameSession.gameId;
    if (gameId) {
      GameWatcher.watchGame(gameId);
      void this._bootstrapGame(gameId);
      this._boardPollTimer = setInterval(() => void this._pullAndRefresh(), 4000);
    } else {
      this._hud?.setError('未找到对局 ID');
    }
  }

  private async _pullAndRefresh(): Promise<void> {
    const gameId = GameSession.gameId;
    if (!gameId || this._rolling) return;

    const mirror = GameStateMirror.game as GameDoc | null;
    if (mirror?.phase === 'SETTLED' || mirror?.settlement) {
      void this._goSettlementWithSnapshot();
      return;
    }

    if (Date.now() - GameWatcher.lastGamePushAt < 4000) {
      return;
    }

    const game = await GameWatcher.pullGameSnapshot(gameId);
    if (!game) return;
    if (game.phase === 'SETTLED' || game.settlement) {
      void this._goSettlementWithSnapshot();
      return;
    }
    if (game.phase === 'MINIGAME_BLUFF') {
      this._diceToast?.hide();
      this._cellToast?.hide();
      this._ensureBluffScene();
      return;
    }
    if (game.phase === 'BOARD') {
      this._applyRemoteGame(game, true);
    }
  }

  private _gameRefreshKey(game: GameDoc): string {
    const p = game.players.map((x) => `${x.seat}:${x.position}:${x.gold}:${x.lap}`).join('|');
    return `${game.updatedAt}_${game.version ?? 0}_${game.currentSeat}_${game.phase}_${game.diamondCellIndex}_${p}`;
  }

  private _refreshIfChanged(game: GameDoc): void {
    const key = this._gameRefreshKey(game);
    if (key === this._lastRefreshKey) return;
    this._lastRefreshKey = key;
    this._refresh(game);
  }

  private _registerWatchers(): void {
    GameWatcher.on('game_start', this._onGameStart);
    GameWatcher.on('game_update', this._onGameUpdate);
    GameWatcher.on('minigame_start', this._onGameUpdate);
    GameWatcher.on('minigame_update', this._onGameUpdate);
    GameWatcher.on('minigame_end', this._onMinigameEnd);
    GameWatcher.on('game_over', this._onGameOver);
  }

  private _unregisterWatchers(): void {
    GameWatcher.off('game_start', this._onGameStart);
    GameWatcher.off('game_update', this._onGameUpdate);
    GameWatcher.off('minigame_start', this._onGameUpdate);
    GameWatcher.off('minigame_update', this._onGameUpdate);
    GameWatcher.off('minigame_end', this._onMinigameEnd);
    GameWatcher.off('game_over', this._onGameOver);
  }

  private _lastEventActor(game: GameDoc): GamePlayer | undefined {
    const seat = game.lastEvent?.actorSeat;
    if (seat !== undefined && game.players[seat]) {
      return game.players[seat];
    }
    const prevSeat =
      (game.currentSeat + game.players.length - 1) % game.players.length;
    return game.players[prevSeat];
  }

  private _displayName(p: GamePlayer): string {
    if (p.openId === GameSession.user?.openId) return '你';
    return playerDisplayName(p);
  }

  /** 按观看者身份改写落格文案（避免双方都显示「你」） */
  private _personalizeCellMessage(message: string, mover: GamePlayer): string {
    const isMe = mover.openId === GameSession.user?.openId;
    const who = isMe ? '你' : this._displayName(mover);

    if (message.includes('厄运降临')) {
      return `厄运降临！${who}接下来 2 回合内金币收益变损失`;
    }
    if (message.includes('小游戏') || message.includes('吹牛')) {
      return `${who}踩中小游戏格，进入吹牛！`;
    }
    if (message.includes('普通格')) {
      return isMe ? '普通格，本格无额外效果' : `${who}停留在普通格，无额外效果`;
    }
    return message;
  }

  private _diceToastKey(game: GameDoc): string {
    return `${game.updatedAt}_d${game.lastDice ?? 0}`;
  }

  private _ensureBluffScene(): void {
    if (this._bluffNavPromise) return;
    this._navigatingBluff = true;
    this._bluffNavPromise = Promise.resolve(this._goBluffScene()).finally(() => {
      this._bluffNavPromise = null;
    });
  }

  private _goBluffScene(): void {
    this._stopBoardPoll();
    this._cellToast?.hide();
    this._diceToast?.hide();
    MinigamePromptDialog.dismissAll();
    SceneLoader.loadMinigameBluff();
  }

  private async _bootstrapGame(gameId: string): Promise<void> {
    this._hud?.setLoading();
    const game = await GameWatcher.pullGameSnapshot(gameId);
    if (!game) {
      this._hud?.setError('对局加载失败，请稍后重试');
      return;
    }
    if (game.phase === 'MINIGAME_BLUFF') {
      this._goBluffScene();
      return;
    }
    this._navigatingBluff = false;
    this._refresh(game);
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

  private _cellTypeAt(game: GameDoc, position: number): CellType {
    const cell = game.boardCells.find((c) => c.index === position);
    return (cell?.type as CellType) || 'NORMAL';
  }

  private _toastKey(game: GameDoc, events: CellEventItem[]): string {
    const msg = events.map((e) => e.message).join('|');
    const actor = game.lastEvent?.actorSeat ?? '';
    return `${game.updatedAt}_${actor}_${msg}`;
  }

  private _showCellToast(
    game: GameDoc,
    events: CellEventItem[],
    landPosition?: number,
    actorName?: string,
  ): void {
    if (!events.length || !this._cellToast) return;
    const key = this._toastKey(game, events);
    if (key === this._lastToastKey) return;
    this._lastToastKey = key;
    const cellPos = landPosition ?? 0;
    this._cellToast.show(events, this._cellTypeAt(game, cellPos), actorName);
  }

  private _maybeShowCellToast(game: GameDoc): void {
    if (Date.now() < this._skipWatchToastUntil) return;
    if (!game.lastEvent?.message) return;

    const mover = this._lastEventActor(game);
    if (!mover) return;
    if (mover.openId === GameSession.user?.openId) return;
    const events: CellEventItem[] = [
      {
        type: game.lastEvent.type || 'NORMAL',
        message: this._personalizeCellMessage(game.lastEvent.message, mover),
      },
    ];
    this._showCellToast(game, events, mover.position, this._displayName(mover));
  }

  private async _maybeAnimateRemoteMove(game: GameDoc): Promise<void> {
    if (!game.lastDice || this._pawnView?.animating) return;

    const n = game.players.length;
    const rollerSeat = (game.currentSeat + n - 1) % n;
    const roller = game.players[rollerSeat];
    if (!roller || roller.openId === GameSession.user?.openId) return;

    const fromPos = this._lastPositions[rollerSeat];
    const toPos = roller.position;
    if (fromPos === undefined || fromPos === toPos) return;

    const steps = game.lastDice;
    await this._pawnView?.animateAlongPath(game, rollerSeat, fromPos, steps, rollerSeat);
    this._syncPositions(game);
  }

  private _syncPositions(game: GameDoc): void {
    this._lastPositions = game.players.map((p) => p.position);
  }

  private async _maybeShowOpponentDice(game: GameDoc): Promise<void> {
    if (!game.lastDice || Date.now() < this._skipWatchToastUntil) return;
    const key = this._diceToastKey(game);
    if (key === this._lastDiceToastKey) return;

    const prevSeat =
      (game.currentSeat + game.players.length - 1) % game.players.length;
    const roller = game.players[prevSeat];
    if (!roller || roller.openId === GameSession.user?.openId) return;

    this._lastDiceToastKey = key;
    const extra = game.lastDice === 7 ? ' 7（可再掷一次）' : '';
    const line = `${this._displayName(roller)} 掷出了${extra}`;
    await this._diceToast?.show(game.lastDice, line);
  }

  private _refresh(game: GameDoc | null, opts?: { skipPawn?: boolean }): void {
    if (!game) return;
    GameStateMirror.setGame(game as unknown as Record<string, unknown>);
    this._boardView?.refresh(game);
    if (!opts?.skipPawn && !this._pawnView?.animating) {
      this._pawnView?.refresh(game);
      this._syncPositions(game);
    }
    this._hud?.clearError();
    this._hud?.setRolling(false);
    this._hud?.refresh(game);
  }

  private async _onRoll(): Promise<void> {
    const gameId = GameSession.gameId;
    if (!gameId || this._rolling) return;

    const before =
      this._lastPositions.length > 0
        ? [...this._lastPositions]
        : (GameStateMirror.game as GameDoc | null)?.players.map((p) => p.position) ?? [];

    this._rolling = true;
    this._hud?.setRolling(true);
    try {
      const res = await rollDice(gameId);

      if (res.dice !== undefined && this._diceToast) {
        const actorLine =
          res.extraRoll || res.dice === 7
            ? '你掷出了 7（可再掷一次）'
            : '你掷出了';
        await this._diceToast.show(res.dice, actorLine);
      }
      if (res.game) {
        this._lastDiceToastKey = this._diceToastKey(res.game);
      }

      if (res.game) {
        const me = res.game.players.find((p) => p.openId === GameSession.user?.openId);
        const landPos = me?.position;
        const mySeat = me?.seat;

        this._refresh(res.game, { skipPawn: true });

        if (mySeat !== undefined && res.dice && before[mySeat] !== undefined) {
          await this._pawnView?.animateAlongPath(
            res.game,
            mySeat,
            before[mySeat],
            res.dice,
            mySeat,
          );
        } else {
          this._pawnView?.refresh(res.game);
        }
        this._syncPositions(res.game);

        const rawEvents =
          res.events?.map((e) => ({ type: e.type, message: e.message })) ??
          (res.game.lastEvent
            ? [{ type: res.game.lastEvent.type, message: res.game.lastEvent.message }]
            : []);
        const events =
          me && rawEvents.length
            ? rawEvents.map((e) => ({
                ...e,
                message: this._personalizeCellMessage(e.message, me),
              }))
            : rawEvents;
        if (events.length) {
          await delay(100);
          this._showCellToast(res.game, events, landPos, '你');
          await delay(400);
        }
        this._skipWatchToastUntil = Date.now() + 5000;

        if (res.game.phase === 'MINIGAME_BLUFF') {
          this._goBluffScene();
          return;
        }
      }

      if (res.settled) {
        await this._goSettlementWithSnapshot();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const hint =
        msg.includes('NOT_YOUR_TURN') || msg.includes('不是你的回合')
          ? '还没轮到你掷骰'
          : msg;
      this._hud?.setError(hint);
      console.warn('[Board] rollDice failed', err);
    } finally {
      this._rolling = false;
      this._hud?.setRolling(false);
      const g = GameStateMirror.game as GameDoc | null;
      if (g) {
        this._refresh(g);
      }
    }
  }

  private _onGameOver = (game: GameDoc) => {
    GameStateMirror.setGame(game as unknown as Record<string, unknown>);
    this._refresh(game);
    void this._goSettlementWithSnapshot();
  };

  private async _goSettlementWithSnapshot(): Promise<void> {
    const gameId = GameSession.gameId;
    if (gameId) {
      const fresh = await GameWatcher.pullGameSnapshot(gameId);
      if (fresh?.settlement) {
        GameStateMirror.setGame(fresh as unknown as Record<string, unknown>);
      }
    }
    SceneLoader.loadSettlement();
  };

  private _stopBoardPoll(): void {
    if (this._boardPollTimer) {
      clearInterval(this._boardPollTimer);
      this._boardPollTimer = null;
    }
  }

  teardown(): void {
    this._stopBoardPoll();
    this._unregisterWatchers();
    MinigamePromptDialog.dismissAll();
    this._cellToast?.hide();
    this._diceToast?.hide();
    this._unbindHide?.();
    this._unbindHide = null;
  }

  onDestroy(): void {
    if (BoardController._active === this) {
      BoardController._active = null;
    }
    this.teardown();
  }
}
