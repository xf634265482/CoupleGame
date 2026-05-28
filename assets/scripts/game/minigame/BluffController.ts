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
import { countdownSecRemaining } from '../../core/Countdown';
import { BLUFF_RESULT_PROMPT_SEC } from '../../core/Constants';
import { GameSession } from '../../core/GameSession';
import { SceneLoader } from '../../core/SceneLoader';
import {
  bluffBid,
  bluffMyDice,
  bluffOpen,
  bluffShake,
  bluffTick,
  quitGame,
} from '../../network/GameService';
import { GameStateMirror } from '../../network/GameStateMirror';
import { GameWatcher } from '../../network/GameWatcher';
import type { BluffState, GameDoc, GamePlayer } from '../../types/GameTypes';
import { bindWxHideQuit } from '../../platform/wechat/WxLifecycle';
import { MinigamePromptDialog } from '../MinigamePromptDialog';
import { playerDisplayName } from '../playerDisplayName';
import { OptionPicker } from './OptionPicker';

const { ccclass } = _decorator;

const COUNT_VALUES = Array.from({ length: 20 }, (_, i) => i + 1);
const FACE_VALUES = [1, 2, 3, 4, 5, 6];

@ccclass('BluffController')
export class BluffController extends Component {
  private static _active: BluffController | null = null;

  private _statusLabel: Label | null = null;
  private _diceLabel: Label | null = null;
  private _infoLabel: Label | null = null;
  private _shakeBtn: Node | null = null;
  private _bidPanel: Node | null = null;
  private _bidConfirmBtn: Node | null = null;
  private _openBtn: Node | null = null;
  private _countPicker: OptionPicker | null = null;
  private _facePicker: OptionPicker | null = null;
  private _myDice: number[] = [];
  private _actionBusy = false;
  private _tickBusy = false;
  private _unbindHide: (() => void) | null = null;
  private _pollTimer: ReturnType<typeof setInterval> | null = null;
  private _countdownTimer: ReturnType<typeof setInterval> | null = null;
  private _uiCountdownTimer: ReturnType<typeof setInterval> | null = null;
  private _infoLinesBase = '';
  private _turnCountdownSec = -1;
  private _pickerTurnKey = '';
  private _lastGame: GameDoc | null = null;
  private _loadingDice = false;
  private _prompt: MinigamePromptDialog | null = null;
  private _returningToBoard = false;
  private _destroyed = false;
  private _ready = false;
  private _lastBluffRefreshKey = '';

  private _onMinigame = (game: GameDoc) => {
    if (!this._ready) return;
    this._refreshIfChanged(game);
  };
  private _onPhaseChange = (game: GameDoc) => {
    if (this._actionBusy) return;
    void this._returnToBoard(game);
  };

  onLoad(): void {
    BluffController._active?.teardown();
    BluffController._active = this;
    this._destroyed = false;
    this._ready = false;

    MinigamePromptDialog.dismissAll();
    this._buildUi();
    this._hideBidControls();
    this._prompt = new MinigamePromptDialog(this.node);
    this._registerWatchers();

    this._unbindHide = bindWxHideQuit(() => void this._onQuit());

    const gameId = GameSession.gameId;
    if (gameId) {
      GameWatcher.watchGame(gameId);
      void this._bootstrap(gameId);
    }
  }

  private _registerWatchers(): void {
    GameWatcher.on('minigame_start', this._onMinigame);
    GameWatcher.on('minigame_update', this._onMinigame);
    GameWatcher.on('minigame_end', this._onPhaseChange);
    GameWatcher.on('game_update', this._onPhaseChange);
    GameWatcher.on('game_over', this._onGameOver);
  }

  private _unregisterWatchers(): void {
    GameWatcher.off('minigame_start', this._onMinigame);
    GameWatcher.off('minigame_update', this._onMinigame);
    GameWatcher.off('minigame_end', this._onPhaseChange);
    GameWatcher.off('game_update', this._onPhaseChange);
    GameWatcher.off('game_over', this._onGameOver);
  }

  private _startTimers(): void {
    this._pollTimer = setInterval(() => void this._pollSnapshot(), 4000);
    this._countdownTimer = setInterval(() => void this._checkCountdown(), 1000);
    this._uiCountdownTimer = setInterval(() => this._tickTurnCountdownUi(), 1000);
  }

  private _hideBidControls(): void {
    if (this._bidPanel) this._bidPanel.active = false;
    if (this._bidConfirmBtn) this._bidConfirmBtn.active = false;
    if (this._openBtn) this._openBtn.active = false;
  }

  private async _pollSnapshot(): Promise<void> {
    if (this._destroyed || !this._ready) return;
    const gameId = GameSession.gameId;
    if (!gameId) return;
    if (Date.now() - GameWatcher.lastGamePushAt < 4000) return;

    const game = await GameWatcher.pullGameSnapshot(gameId);
    if (!game) return;
    if (game.phase === 'BOARD' || game.phase === 'SETTLED') {
      if (!this._actionBusy) {
        await this._returnToBoard(game);
      }
      return;
    }
    if (this._actionBusy || this._tickBusy) return;
    if (game.phase === 'MINIGAME_BLUFF') {
      this._refreshIfChanged(game);
    }
  }

  private _bluffRefreshKey(game: GameDoc): string {
    const bs = game.bluffState;
    if (!bs) return `${game.updatedAt}_none`;
    return [
      game.updatedAt,
      bs.phase,
      bs.currentSeat,
      bs.shakenSeats.join(','),
      bs.eliminatedSeats.join(','),
      bs.lastBid ? `${bs.lastBid.count}-${bs.lastBid.face}` : '',
      bs.turnDeadline ?? 0,
    ].join('_');
  }

  private _refreshIfChanged(game: GameDoc): void {
    const key = this._bluffRefreshKey(game);
    if (key === this._lastBluffRefreshKey) return;
    this._lastBluffRefreshKey = key;
    this._refresh(game);
  }

  private async _bootstrap(gameId: string): Promise<void> {
    const game = await GameWatcher.pullGameSnapshot(gameId);
    if (!game) {
      if (this._statusLabel) this._statusLabel.string = '加载吹牛状态失败';
      return;
    }
    if (game.phase === 'BOARD' || game.phase === 'SETTLED') {
      await this._returnToBoard(game);
      return;
    }
    this._hideBidControls();
    this._lastBluffRefreshKey = '';
    this._refresh(game);
    this._ready = true;
    this._startTimers();
  }

  teardown(): void {
    this._destroyed = true;
    this._ready = false;
    this._stopTimers();
    this._prompt?.destroy();
    this._prompt = null;
    this._unregisterWatchers();
    this._unbindHide?.();
    this._unbindHide = null;
  }

  private _buildOpenResultMessage(game: GameDoc, openResult?: BluffState['lastOpenResult']): string {
    const r = openResult || game.bluffState?.lastOpenResult;
    if (!r) return game.lastEvent?.message || '开牌完成';
    const bidder = game.players[r.bid.seat];
    const loser = game.players[r.loserSeat];
    const face = r.bid.face;
    let countLine = `全场合计：${r.actual} 个 ${face} 点`;
    if (face !== 1 && r.wildOnes !== undefined) {
      countLine =
        r.wildOnes > 0
          ? `全场合计：${r.actual} 个（${face} 点 ${r.faceOnly ?? 0} 个，1 作赖子 ${r.wildOnes} 个）`
          : `全场合计：${r.actual} 个（均为 ${face} 点，无赖子）`;
    }
    return [
      `叫点：${this._playerName(bidder)} 叫 ${r.bid.count} 个 ${face} 点`,
      countLine,
      r.actual >= r.bid.count ? '叫点成立' : '叫点不成立',
      `${this._playerName(loser)} 在本轮吹牛中出局`,
    ].join('\n');
  }

  private _buildBluffEndMessage(game: GameDoc): string {
    const rankings = game.bluffState?.rankings;
    if (rankings?.length) {
      return rankings
        .map((r) => {
          const p = game.players[r.seat];
          return `${this._playerName(p)} 第${r.rank}名 +${r.goldReward} 金`;
        })
        .join('\n');
    }
    if (game.lastEvent?.message) return game.lastEvent.message;
    return '吹牛小游戏结束，返回棋盘继续对局';
  }

  /** 双方统一：有开牌则「开牌结果」详情 + 排名 */
  private _buildBluffEndDialog(
    game: GameDoc,
    openResult?: BluffState['lastOpenResult'],
  ): { title: string; message: string } {
    const r = openResult ?? game.lastEvent?.lastOpenResult;
    const rankMsg = this._buildBluffEndMessage(game);
    if (r) {
      return {
        title: '开牌结果',
        message: [this._buildOpenResultMessage(game, r), rankMsg].filter(Boolean).join('\n\n'),
      };
    }
    return { title: '吹牛结束', message: rankMsg };
  }

  private _stopTimers(): void {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    if (this._countdownTimer) {
      clearInterval(this._countdownTimer);
      this._countdownTimer = null;
    }
    if (this._uiCountdownTimer) {
      clearInterval(this._uiCountdownTimer);
      this._uiCountdownTimer = null;
    }
  }

  private _tickTurnCountdownUi(): void {
    if (!this._infoLabel || !this._infoLinesBase) return;
    const bs = this._lastGame?.bluffState;
    if (!bs || bs.phase !== 'BIDDING' || !bs.turnDeadline) {
      this._turnCountdownSec = -1;
      if (this._infoLabel.string !== this._infoLinesBase) {
        this._infoLabel.string = this._infoLinesBase;
      }
      return;
    }
    const sec = countdownSecRemaining(bs.turnDeadline);
    if (sec === this._turnCountdownSec) return;
    this._turnCountdownSec = sec;
    this._infoLabel.string = `${this._infoLinesBase}\n叫点倒计时 ${sec}s`;
  }

  private async _returnToBoard(
    game: GameDoc,
    openResult?: BluffState['lastOpenResult'],
  ): Promise<void> {
    if (this._destroyed) return;
    if (game.phase === 'SETTLED') {
      this._stopTimers();
      this._prompt?.hide();
      SceneLoader.loadSettlement();
      return;
    }
    if (game.phase !== 'BOARD') return;
    if (this._returningToBoard) return;
    this._returningToBoard = true;

    this._stopTimers();
    this._actionBusy = false;
    this._tickBusy = false;

    if (this._prompt) {
      const dialog = this._buildBluffEndDialog(game, openResult);
      await this._prompt.show({
        title: dialog.title,
        message: dialog.message,
        countdownSec: BLUFF_RESULT_PROMPT_SEC,
        confirmText: '回到棋盘',
      });
    }

    if (this._destroyed) return;
    this._prompt?.hide();
    SceneLoader.loadBoard();
  }

  private _playerName(p: GamePlayer): string {
    if (p.openId === GameSession.user?.openId) return '你';
    return playerDisplayName(p);
  }

  private _buildUi(): void {
    const canvas = this.node;
    this._statusLabel = this._makeLabel(canvas, 'Status', 460, 38, 56);
    this._infoLabel = this._makeLabel(canvas, 'Info', 360, 30, 160);
    this._diceLabel = this._makeLabel(canvas, 'Dice', 250, 34, 60);
    this._diceLabel!.string = '你的骰子：—';

    this._shakeBtn = this._makeBtnNode(
      canvas,
      150,
      '摇骰子',
      () => void this._onShake(),
      new Color(80, 140, 220, 255),
    );

    this._bidPanel = new Node('BidPanel');
    this._bidPanel.setParent(canvas);
    this._bidPanel.setPosition(new Vec3(0, 100, 0));

    this._countPicker = new OptionPicker(
      this._bidPanel,
      -165,
      0,
      '叫几个',
      COUNT_VALUES,
      2,
    );
    this._facePicker = new OptionPicker(
      this._bidPanel,
      165,
      0,
      '几点',
      FACE_VALUES,
      2,
    );

    this._bidConfirmBtn = this._makeBtnNode(
      canvas,
      -20,
      '确认叫点',
      () => void this._onBidConfirm(),
      new Color(55, 130, 90, 255),
    );

    this._openBtn = this._makeBtnNode(
      canvas,
      -110,
      '开',
      () => void this._onOpen(),
      new Color(200, 70, 70, 255),
    );

    this._makeBtnNode(
      canvas,
      -200,
      '退出对局',
      () => void this._onQuit(),
      new Color(90, 90, 100, 255),
    );

    this._bidConfirmBtn.setSiblingIndex(100);
    this._openBtn.setSiblingIndex(99);
  }

  private _makeLabel(
    parent: Node,
    name: string,
    y: number,
    fontSize: number,
    h: number,
  ): Label {
    const n = new Node(name);
    n.setParent(parent);
    n.setPosition(new Vec3(0, y, 0));
    n.addComponent(UITransform).setContentSize(660, h);
    const lbl = n.addComponent(Label);
    lbl.fontSize = fontSize;
    lbl.lineHeight = fontSize + 8;
    lbl.color = new Color(240, 240, 240, 255);
    lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
    lbl.overflow = Label.Overflow.SHRINK;
    return lbl;
  }

  private _makeBtnNode(
    parent: Node,
    y: number,
    text: string,
    onClick: () => void,
    color: Color,
  ): Node {
    const n = new Node(`Btn_${text}`);
    n.setParent(parent);
    n.setPosition(new Vec3(0, y, 0));
    n.addComponent(UITransform).setContentSize(480, 64);
    const g = n.addComponent(Graphics);
    g.fillColor = color;
    g.rect(-240, -32, 480, 64);
    g.fill();
    const ln = new Node('L');
    ln.setParent(n);
    ln.addComponent(UITransform).setContentSize(480, 64);
    const lbl = ln.addComponent(Label);
    lbl.string = text;
    lbl.fontSize = 34;
    lbl.color = new Color(255, 255, 255, 255);
    lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
    lbl.verticalAlign = Label.VerticalAlign.CENTER;
    n.addComponent(Button);
    n.on(Button.EventType.CLICK, onClick, this);
    return n;
  }

  private _syncPickersForTurn(bs: BluffState): void {
    const key = `${bs.currentSeat}_${bs.turnDeadline ?? 0}_${bs.lastBid?.count ?? 'x'}_${bs.lastBid?.face ?? 'x'}`;
    if (key === this._pickerTurnKey) return;
    this._pickerTurnKey = key;
    if (bs.lastBid) {
      this._countPicker?.setValue(Math.min(bs.lastBid.count + 1, 20));
      this._facePicker?.setValue(bs.lastBid.face);
    } else {
      this._countPicker?.setValue(2);
      this._facePicker?.setValue(2);
    }
  }

  private _updateDiceLabel(shaken: boolean): void {
    if (!this._diceLabel) return;
    if (this._myDice.length) {
      this._diceLabel.string = `你的骰子：${this._myDice.join('  ')}`;
    } else if (shaken) {
      this._diceLabel.string = '正在加载你的骰子…';
    } else {
      this._diceLabel.string = '点「摇骰子」开始';
    }
  }

  private async _ensureMyDice(shaken: boolean): Promise<void> {
    if (!shaken || this._myDice.length > 0 || this._loadingDice) return;
    const gameId = GameSession.gameId;
    if (!gameId) return;
    this._loadingDice = true;
    try {
      const res = await bluffMyDice(gameId);
      if (res.myDice?.length) {
        this._myDice = res.myDice;
        this._updateDiceLabel(true);
      }
    } catch (err) {
      console.warn('[Bluff] load myDice', err);
    } finally {
      this._loadingDice = false;
    }
  }

  private _refresh(game: GameDoc | null): void {
    if (!game) return;

    if (game.phase === 'BOARD' || game.phase === 'SETTLED') {
      void this._returnToBoard(game);
      return;
    }
    if (game.phase !== 'MINIGAME_BLUFF' || !game.bluffState) {
      if (this._statusLabel) this._statusLabel.string = '等待吹牛状态…';
      return;
    }

    this._lastGame = game;
    GameStateMirror.setGame(game as unknown as Record<string, unknown>);

    const bs = game.bluffState as BluffState;
    const me = GameSession.user;
    const mySeat = game.players.find((p) => p.openId === me?.openId)?.seat;
    const isMyTurn = mySeat === bs.currentSeat;
    const eliminated =
      mySeat !== undefined && bs.eliminatedSeats.includes(mySeat);
    const shaken = mySeat !== undefined && bs.shakenSeats.includes(mySeat);
    const inBidding = bs.phase === 'BIDDING';
    const inShaking = bs.phase === 'SHAKING';
    if (!inBidding) {
      this._hideBidControls();
    }
    const activeSeats = game.players
      .map((p) => p.seat)
      .filter((s) => !bs.eliminatedSeats.includes(s));
    const allShaken =
      activeSeats.length > 0 &&
      activeSeats.every((s) => bs.shakenSeats.includes(s));

    void this._ensureMyDice(shaken);

    if (inBidding && isMyTurn && !eliminated) {
      this._syncPickersForTurn(bs);
    }

    const lines = [
      `阶段：${inShaking ? '摇骰' : '叫点'}`,
      inShaking
        ? `摇骰进度：${bs.shakenSeats.length}/${activeSeats.length}`
        : `当前：${this._playerName(game.players[bs.currentSeat])}${isMyTurn ? ' · 你的回合' : ''}`,
      `出局：${bs.eliminatedSeats.map((s) => this._playerName(game.players[s])).join('、') || '无'}`,
    ];
    if (bs.lastBid) {
      const bidder = game.players[bs.lastBid.seat];
      lines.push(
        `上家叫：${this._playerName(bidder)} 叫 ${bs.lastBid.count} 个 ${bs.lastBid.face} 点`,
      );
    }
    if (bs.lastOpenResult) {
      const r = bs.lastOpenResult;
      const loser = game.players[r.loserSeat];
      lines.push(
        `上轮开牌：实际 ${r.actual} 个 · ${this._playerName(loser)} 出局`,
      );
    }
    this._infoLinesBase = lines.join('\n');
    this._turnCountdownSec = -1;
    if (this._infoLabel) {
      this._infoLabel.string = this._infoLinesBase;
      this._tickTurnCountdownUi();
    }

    this._updateDiceLabel(shaken);

    if (this._statusLabel) {
      if (eliminated) {
        this._statusLabel.string = '你已在吹牛中出局，等待本局结束';
      } else if (inShaking) {
        if (!shaken) {
          this._statusLabel.string = '请摇骰（所有玩家都需摇骰）';
        } else if (!allShaken) {
          this._statusLabel.string = '已摇骰，等待其他玩家';
        } else {
          this._statusLabel.string = '全员已摇骰，即将叫点';
        }
      } else if (isMyTurn) {
        this._statusLabel.string = '请选择叫点或开';
      } else {
        this._statusLabel.string = `等待 ${this._playerName(game.players[bs.currentSeat])}`;
      }
    }

    const canShake =
      inShaking && !eliminated && !shaken && mySeat !== undefined;
    if (this._shakeBtn) this._shakeBtn.active = canShake;
    if (this._bidPanel) {
      this._bidPanel.active = inBidding && isMyTurn && !eliminated;
    }
    if (this._bidConfirmBtn) {
      this._bidConfirmBtn.active = inBidding && isMyTurn && !eliminated;
    }
    if (this._openBtn) {
      this._openBtn.active =
        inBidding && isMyTurn && !eliminated && !!bs.lastBid;
    }
  }

  private async _checkCountdown(): Promise<void> {
    const game = this._lastGame;
    const bs = game?.bluffState;
    if (!game || !bs || bs.phase !== 'BIDDING' || !bs.turnDeadline) return;
    if (Date.now() < bs.turnDeadline) return;
    if (this._tickBusy || this._actionBusy) return;
    await this._runServerTick();
  }

  private async _runServerTick(): Promise<void> {
    const gameId = GameSession.gameId;
    if (!gameId || this._tickBusy) return;
    this._tickBusy = true;
    try {
      const res = await bluffTick(gameId);
      if (res.game?.phase === 'BOARD') {
        await this._returnToBoard(res.game);
        return;
      }
      if (res.game) this._refresh(res.game);
    } catch (err: unknown) {
      console.warn('[Bluff] tick', err);
    } finally {
      this._tickBusy = false;
    }
  }

  private async _onShake(): Promise<void> {
    const gameId = GameSession.gameId;
    if (!gameId || this._actionBusy) return;
    this._actionBusy = true;
    try {
      const res = await bluffShake(gameId);
      if (res.myDice) this._myDice = res.myDice;
      if (res.game) this._refresh(res.game);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (this._statusLabel) this._statusLabel.string = `摇骰失败：${msg}`;
    } finally {
      this._actionBusy = false;
    }
  }

  private async _onBidConfirm(): Promise<void> {
    if (this._actionBusy) {
      if (this._statusLabel) this._statusLabel.string = '正在提交，请稍候…';
      return;
    }
    const count = this._countPicker?.getValue() ?? 2;
    const face = this._facePicker?.getValue() ?? 2;
    const gameId = GameSession.gameId;
    if (!gameId) return;

    this._actionBusy = true;
    if (this._statusLabel) this._statusLabel.string = `叫点中：${count} 个 ${face} 点…`;
    try {
      const res = await bluffBid(gameId, count, face);
      if (res.game) this._refresh(res.game);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (this._statusLabel) this._statusLabel.string = `叫点失败：${msg}`;
      void this._pollSnapshot();
    } finally {
      this._actionBusy = false;
    }
  }

  private async _onOpen(): Promise<void> {
    const gameId = GameSession.gameId;
    if (!gameId || this._actionBusy) return;
    this._actionBusy = true;
    if (this._statusLabel) this._statusLabel.string = '开牌中…';
    try {
      const res = await bluffOpen(gameId);
      if (res.game?.phase === 'BOARD') {
        await this._returnToBoard(res.game, res.openResult);
        return;
      }
      if (res.openResult && this._prompt && res.game) {
        await this._prompt.show({
          title: '开牌结果',
          message: this._buildOpenResultMessage(res.game, res.openResult),
          countdownSec: BLUFF_RESULT_PROMPT_SEC,
          confirmText: '继续',
        });
      }
      if (res.game) this._refresh(res.game);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (this._statusLabel) this._statusLabel.string = `开牌失败：${msg}`;
      void this._pollSnapshot();
    } finally {
      this._actionBusy = false;
    }
  }

  private async _onQuit(): Promise<void> {
    const gameId = GameSession.gameId;
    if (!gameId || this._actionBusy) return;
    this._actionBusy = true;
    try {
      await quitGame(gameId);
      SceneLoader.loadSettlement();
    } catch (err: unknown) {
      console.warn('[Bluff] quit', err);
    } finally {
      this._actionBusy = false;
    }
  }

  private _onGameOver = (game: GameDoc) => {
    if (game.phase === 'SETTLED' || game.settlement) {
      this._stopTimers();
      this._prompt?.hide();
      SceneLoader.loadSettlement();
      return;
    }
    this._refresh(game);
  };

  onDestroy(): void {
    if (BluffController._active === this) {
      BluffController._active = null;
    }
    this.teardown();
  }
}
