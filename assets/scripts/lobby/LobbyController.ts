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
import { MATCH_WAIT_MS } from '../core/Constants';
import { GameSession } from '../core/GameSession';
import { SceneLoader } from '../core/SceneLoader';
import { fetchProfile } from '../platform/wechat/WxAuth';
import {
  createRoom,
  joinRoom,
  matchCancel,
  matchEnqueue,
  matchPoll,
} from '../network/LobbyService';
import { WxRoomCodeInput } from '../platform/wechat/WxRoomCodeInput';
import { parseLaunchRoomCode, shareRoom } from '../platform/wechat/WxShare';
import type { RoomVO } from '../types/GameTypes';
import { RoomController } from './RoomController';

const { ccclass } = _decorator;

type LobbyMode = 'menu' | 'room' | 'matching';

/** 手机真机字号/按钮放大 */
function lobbyScale(): number {
  try {
    const w = wx.getSystemInfoSync?.().windowWidth ?? 750;
    if (w < 400) return 1.55;
    if (w < 500) return 1.45;
    return 1.35;
  } catch {
    return 1.4;
  }
}

const S = lobbyScale();
const UI = {
  btnW: Math.round(420 * S),
  btnH: Math.round(58 * S),
  inputW: Math.round(440 * S),
  gap: Math.round(16 * S),
  /** 画布半高约 640，顶部信息区固定在此之上 */
  infoTopY: 500,
  /** 输入框底边距画布底缘 */
  inputBottomMargin: 48,
  titleFont: Math.round(34 * S),
  infoFont: Math.round(30 * S),
  btnFont: Math.round(32 * S),
};

/**
 * 大厅：建房 / 加入 / 匹配 → AC-2、AC-3、AC-5
 */
@ccclass('LobbyController')
export class LobbyController extends Component {
  private _mode: LobbyMode = 'menu';
  private _statusLabel: Label | null = null;
  private _roomInfoLabel: Label | null = null;
  private _roomCodeInput: WxRoomCodeInput | null = null;
  private _roomCtrl: RoomController | null = null;
  private _currentRoom: RoomVO | null = null;
  private _matchPollTimer: ReturnType<typeof setInterval> | null = null;
  private _matchUiTimer: ReturnType<typeof setInterval> | null = null;
  private _matchEnqueueAt = 0;
  private _infoRoot: Node | null = null;
  private _actionRoot: Node | null = null;
  /** 「加入房间」及以下的按钮，展开数字键时暂时隐藏 */
  private _belowInputBtns: Node[] = [];

  onLoad() {
    this._roomCtrl = this.getComponent(RoomController) || this.addComponent(RoomController);
    this._buildUi();
    this._showMenu();

    void this._refreshUserBanner();

    const launchCode = parseLaunchRoomCode(
      typeof wx !== 'undefined'
        ? (wx.getLaunchOptionsSync?.() as { query?: Record<string, string> })
        : undefined,
    );
    if (launchCode) {
      if (this._roomCodeInput) this._roomCodeInput.string = launchCode;
      void this._autoJoin(launchCode);
    }
  }

  private _drawRect(node: Node, w: number, h: number, color: Color): void {
    const g = node.getComponent(Graphics) || node.addComponent(Graphics);
    g.clear();
    g.fillColor = color;
    g.rect(-w / 2, -h / 2, w, h);
    g.fill();
  }

  private _makeLabel(parent: Node, name: string, y: number, fontSize: number, h = 44): Label {
    const n = new Node(name);
    n.setParent(parent);
    n.setPosition(new Vec3(0, y, 0));
    n.addComponent(UITransform).setContentSize(UI.btnW, h);
    const lbl = n.addComponent(Label);
    lbl.fontSize = fontSize;
    lbl.lineHeight = Math.round(fontSize * 1.2);
    lbl.color = new Color(235, 235, 235, 255);
    lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
    lbl.overflow = Label.Overflow.SHRINK;
    return lbl;
  }

  /** 带底色的大按钮，避免纯文字难点 */
  private _makeBtn(
    parent: Node,
    text: string,
    y: number,
    onClick: () => void,
    color = new Color(52, 120, 200, 255),
  ): Node {
    const n = new Node(`Btn_${text}`);
    n.setParent(parent);
    n.setPosition(new Vec3(0, y, 0));
    n.addComponent(UITransform).setContentSize(UI.btnW, UI.btnH);
    this._drawRect(n, UI.btnW, UI.btnH, color);

    const labelNode = new Node('Label');
    labelNode.setParent(n);
    labelNode.addComponent(UITransform).setContentSize(UI.btnW, UI.btnH);
    const lbl = labelNode.addComponent(Label);
    lbl.string = text;
    lbl.fontSize = UI.btnFont;
    lbl.lineHeight = Math.round(UI.btnFont * 1.2);
    lbl.color = new Color(255, 255, 255, 255);
    lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
    lbl.verticalAlign = Label.VerticalAlign.CENTER;

    const btn = n.addComponent(Button);
    btn.transition = Button.Transition.SCALE;
    btn.zoomScale = 0.96;
    btn.target = n;
    n.on(Button.EventType.CLICK, onClick, this);
    return n;
  }

  /** 微信原生键盘输入房间号（整块可点） */
  private _makeRoomCodeInput(parent: Node, y: number): WxRoomCodeInput {
    const root = new Node('RoomCodeInput');
    root.setParent(parent);
    root.setPosition(new Vec3(0, y, 0));
    return root.addComponent(WxRoomCodeInput);
  }

  private _buildUi(): void {
    const canvas = this.node;

    this._infoRoot = new Node('InfoRoot');
    this._infoRoot.setParent(canvas);

    this._actionRoot = new Node('ActionRoot');
    this._actionRoot.setParent(canvas);

    this._statusLabel = this._makeLabel(
      this._infoRoot,
      'Status',
      UI.infoTopY,
      UI.titleFont,
      Math.round(52 * S),
    );
    this._roomInfoLabel = this._makeLabel(
      this._infoRoot,
      'RoomInfo',
      UI.infoTopY - Math.round(80 * S),
      UI.infoFont,
      Math.round(110 * S),
    );
    this._roomInfoLabel.string = '';

    let y = Math.round(240 * S);
    const step = UI.btnH + UI.gap;

    this._makeBtn(this._actionRoot, '创建 2 人房', y, () => void this._onCreate(2));
    y -= step;
    this._makeBtn(this._actionRoot, '创建 3 人房', y, () => void this._onCreate(3));
    y -= step;
    this._makeBtn(this._actionRoot, '创建 4 人房', y, () => void this._onCreate(4));
    y -= step;

    this._roomCodeInput = this._makeRoomCodeInput(this._actionRoot, y);
    this._roomCodeInput.node.on('layout-change', this._syncInputLayout, this);
    this._roomCodeInput.node.on('keyboard-height', this._onKeyboardHeight, this);
    y -= step;

    this._belowInputBtns = [];
    const pushBelow = (n: Node) => this._belowInputBtns.push(n);

    pushBelow(
      this._makeBtn(
        this._actionRoot,
        '加入房间',
        y,
        () => void this._onJoin(),
        new Color(60, 160, 110, 255),
      ),
    );
    y -= step;
    pushBelow(
      this._makeBtn(this._actionRoot, '快速匹配', y, () => void this._onMatch(), new Color(160, 90, 50, 255)),
    );
    y -= step;
    pushBelow(
      this._makeBtn(
        this._actionRoot,
        '取消匹配',
        y,
        () => void this._onCancelMatch(),
        new Color(90, 90, 100, 255),
      ),
    );
    y -= step;
    pushBelow(this._makeBtn(this._actionRoot, '分享房间', y, () => this._onShare()));
    y -= step;
    pushBelow(
      this._makeBtn(
        this._actionRoot,
        '开始游戏',
        y,
        () => void this._roomCtrl?.tryStart(),
        new Color(180, 60, 60, 255),
      ),
    );
    y -= step;
    pushBelow(
      this._makeBtn(
        this._actionRoot,
        '返回大厅',
        y,
        () => this._showMenu(),
        new Color(70, 70, 80, 255),
      ),
    );

    this._actionRoot.setSiblingIndex(10);
    this._infoRoot.setSiblingIndex(20);
    this._syncInputLayout();
  }

  /** 数字键展开时隐藏下方按钮，避免与输入区重叠 */
  private _syncInputLayout(): void {
    const input = this._roomCodeInput;
    if (!input) return;
    const hideBelow = input.isPadVisible;
    this._belowInputBtns.forEach((n) => {
      n.active = !hideBelow;
    });
    if (this._actionRoot) {
      this._actionRoot.setPosition(0, 0, 0);
    }
  }

  /** 系统键盘弹出时上移操作区 */
  private _onKeyboardHeight(heightPx: number): void {
    if (!this._actionRoot) return;
    if (heightPx <= 0) {
      this._actionRoot.setPosition(0, 0, 0);
      this._syncInputLayout();
      return;
    }

    let shift = heightPx * 0.55;
    try {
      const sys = wx.getSystemInfoSync?.();
      if (sys?.windowWidth) {
        shift = (heightPx * 750) / sys.windowWidth;
      }
    } catch {
      /* use fallback */
    }

    this._actionRoot.setPosition(0, shift, 0);
    this._belowInputBtns.forEach((n) => {
      n.active = false;
    });
  }

  private _setStatus(text: string) {
    if (this._statusLabel) this._statusLabel.string = text;
    console.log('[Lobby]', text);
  }

  private _userBannerLine(): string {
    const u = GameSession.user;
    if (!u) return '未登录';
    return `${u.nickname} · 局外钻石 ${u.diamond ?? 0}`;
  }

  private async _refreshUserBanner(prefix?: string): Promise<void> {
    try {
      if (typeof wx !== 'undefined') {
        await fetchProfile();
      }
    } catch (err) {
      console.warn('[Lobby] profile', err);
    }
    const line = this._userBannerLine();
    this._setStatus(prefix ? `${prefix}\n${line}` : `欢迎，${line}`);
  }

  private _updateMatchCountdown(): void {
    if (this._mode !== 'matching' || !this._matchEnqueueAt) return;
    const elapsed = Date.now() - this._matchEnqueueAt;
    const remain = Math.max(0, MATCH_WAIT_MS - elapsed);
    const sec = Math.ceil(remain / 1000);
    this._setStatus(
      `匹配中… 已等待 ${Math.floor(elapsed / 1000)} 秒 · 最长 ${sec} 秒\n${this._userBannerLine()}\n满 2 人立即开局`,
    );
  }

  private _setRoomInfo(text: string) {
    if (this._roomInfoLabel) this._roomInfoLabel.string = text;
  }

  private _showMenu() {
    this._mode = 'menu';
    this._stopMatchPoll();
    this._stopMatchUiTimer();
    this._roomCtrl?.stop();
    this._currentRoom = null;
    this._setRoomInfo('');
    this._roomCodeInput?.collapsePad();
    this._syncInputLayout();
    void this._refreshUserBanner();
  }

  private _showRoom(room: RoomVO) {
    this._mode = 'room';
    this._currentRoom = room;
    this._renderRoom(room);
    this._roomCtrl?.bind({
      onStatus: (t) => this._setStatus(t),
      onRoomUpdate: (r) => this._renderRoom(r),
      onDisbanded: () => {
        this._setStatus('房间已过期或已解散');
        this._showMenu();
      },
    });
    this._roomCtrl?.enterRoom(room.roomId);
  }

  private _renderRoom(room: RoomVO) {
    const names = room.players.map((p) => p.nickname).join('、');
    const host = GameSession.user?.id === room.hostId ? '（房主）' : '';
    this._setRoomInfo(
      `房间 ${room.roomCode} · ${room.players.length}/${room.maxPlayers} 人${host}\n${names}`,
    );
    this._setStatus(`状态：${room.status}`);

    if (room.status === 'PLAYING' && room.gameId) {
      this._roomCtrl?.markEnteringGame();
      GameSession.gameId = String(room.gameId);
      this._setStatus('对局开始，进入棋盘…');
      SceneLoader.loadBoard();
    }
  }

  private async _onCreate(maxPlayers: 2 | 3 | 4) {
    try {
      this._setStatus('创建房间…');
      const res = await createRoom(maxPlayers);
      if (res.room) {
        this._showRoom(res.room);
      }
    } catch (err: unknown) {
      this._setStatus(err instanceof Error ? err.message : String(err));
    }
  }

  private async _onJoin() {
    const code = this._roomCodeInput?.string?.trim();
    if (!code || code.length !== 6) {
      this._setStatus('请先点灰色输入框，输入 6 位房间号');
      return;
    }
    await this._autoJoin(code);
  }

  private async _autoJoin(roomCode: string) {
    try {
      this._setStatus(`加入房间 ${roomCode}…`);
      const res = await joinRoom(roomCode);
      if (res.room) {
        this._roomCodeInput?.collapsePad();
        this._syncInputLayout();
        this._showRoom(res.room);
      }
    } catch (err: unknown) {
      this._setStatus(err instanceof Error ? err.message : String(err));
    }
  }

  private async _onMatch() {
    try {
      this._mode = 'matching';
      const res = await matchEnqueue(4);
      this._matchEnqueueAt = res.enqueueAt ?? Date.now();
      this._startMatchPoll();
      this._startMatchUiTimer();
      this._updateMatchCountdown();
    } catch (err: unknown) {
      this._mode = 'menu';
      this._setStatus(err instanceof Error ? err.message : String(err));
    }
  }

  private async _onCancelMatch() {
    try {
      await matchCancel();
      this._stopMatchPoll();
      this._stopMatchUiTimer();
      await this._refreshUserBanner('已取消匹配');
      this._showMenu();
    } catch (err: unknown) {
      this._setStatus(err instanceof Error ? err.message : String(err));
    }
  }

  private _onShare() {
    const code = this._currentRoom?.roomCode;
    if (!code) {
      this._setStatus('请先创建或加入房间');
      return;
    }
    shareRoom(code);
    this._setStatus(`已调起分享，房间号 ${code}`);
  }

  private _startMatchPoll() {
    this._stopMatchPoll();
    this._matchPollTimer = setInterval(() => void this._pollMatch(), 2000);
    void this._pollMatch();
  }

  private _stopMatchPoll() {
    if (this._matchPollTimer) {
      clearInterval(this._matchPollTimer);
      this._matchPollTimer = null;
    }
  }

  private _startMatchUiTimer() {
    this._stopMatchUiTimer();
    this._matchUiTimer = setInterval(() => this._updateMatchCountdown(), 1000);
  }

  private _stopMatchUiTimer() {
    if (this._matchUiTimer) {
      clearInterval(this._matchUiTimer);
      this._matchUiTimer = null;
    }
  }

  private async _pollMatch() {
    try {
      const res = await matchPoll();
      if (res.enqueueAt) {
        this._matchEnqueueAt = res.enqueueAt;
      }
      if (res.status === 'QUEUED') {
        this._updateMatchCountdown();
        return;
      }
      if (res.status === 'PLAYING' && res.gameId) {
        this._stopMatchPoll();
        this._stopMatchUiTimer();
        this._roomCtrl?.markEnteringGame();
        GameSession.gameId = res.gameId;
        if (res.roomId) GameSession.roomId = res.roomId;
        this._setStatus('匹配成功，进入对局…');
        SceneLoader.loadBoard();
        return;
      }
      if (res.status === 'IN_ROOM' && res.room) {
        this._stopMatchPoll();
        this._stopMatchUiTimer();
        this._showRoom(res.room);
      }
    } catch (err) {
      console.warn('[Lobby] match poll', err);
    }
  }

  onDestroy() {
    this._stopMatchPoll();
    this._stopMatchUiTimer();
    // 勿在此 stop()：进入棋盘时 Lobby 销毁会误调 quitGame；退房由 RoomController.onDestroy 或「返回大厅」处理
  }
}
