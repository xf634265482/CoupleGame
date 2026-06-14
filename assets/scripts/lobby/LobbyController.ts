import {
  _decorator,
  Button,
  Color,
  Component,
  Graphics,
  Label,
  Node,
  Sprite,
  SpriteFrame,
  UIOpacity,
  UITransform,
  Vec3,
} from 'cc';
import {
  applyUiLayerTree,
  bindWindowResize,
  DESIGN_H,
  refreshScreenAdapt,
  visibleDesignSize,
} from '../platform/wechat/ViewAdapt';
import { loadPveMeta } from '../network/PveService';
import { GameSession } from '../core/GameSession';
import { SceneLoader } from '../core/SceneLoader';
import { fetchProfile, login } from '../platform/wechat/WxAuth';
import {
  createRoom,
  disbandRoom,
  joinRoom,
  leaveRoom,
  listRooms,
  setRoomMatchFill,
} from '../network/LobbyService';
import { WxGameNameInput } from '../platform/wechat/WxGameNameInput';
import { parseLaunchRoomCode, shareRoom } from '../platform/wechat/WxShare';
import type { PlayerSlotVO, RoomVO } from '../types/GameTypes';
import { RoomController } from './RoomController';
import { lockPortrait } from '../platform/wechat/WxLandscape';
import { playMainBgm } from '../audio/BgmController';
import {
  applyScreenBackground,
  ensureResourcesBundle,
  getCachedSprite,
  loadUiSprite,
  preloadLobbyUi,
} from '../ui/UiAssets';
import {
  ensureArtChild,
  ensureArtSliced,
  ensureArtStretch,
  pickSpriteLayout,
  spriteSourceSize,
} from '../ui/UiSprite';
import { LoadingOverlay } from '../ui/LoadingOverlay';
// 背景也可由 Canvas 上的 SceneUiBackground 负责（支持编辑模式预览）

const { ccclass } = _decorator;

type LobbyMode = 'menu' | 'room';

type PlayerSlotUi = {
  root: Node;
  nameLabel: Label;
  metaLabel: Label;
  pawnNode: Node;
  seat: number;
  /** 编辑器 Slot 下的 CardBg，运行时只换图不改位置 */
  cardBg: Sprite | null;
  /** 绑定时的 CardBg 尺寸，换 ready/empty 图后强制保持，避免真机出现缝隙 */
  cardBgSize: { w: number; h: number } | null;
};

const NICKNAME_STORAGE_KEY = 'lobby_nickname';
const GAME_NAME_STORAGE_KEY = 'lobby_game_name';
const ROOM_SLOT_COUNT = 4;
const RANDOM_NAME_PREFIXES = ['骰子', '幸运', '欢乐', '蹦蹦', '闪闪', '软糖', '彩虹', '星星'];
const RANDOM_NAME_SUFFIXES = ['勇者', '骑士', '队长', '玩家', '伙伴', '小怪', '冒险家', '赢家'];

/**
 * 竖屏改造后画布固定 720 宽（FIXED_WIDTH），设备窗口本身即为竖屏，
 * 不再需要"横屏画布在竖屏设备上放大"的补偿，恒定返回 1.0。
 */
function lobbyScale(): number {
  return 1.0;
}

/** 横屏房间内：左玩家、右按钮 */
type RoomLayout = {
  leftX: number;
  rightX: number;
  titleY: number;
  subY: number;
  slotsY: number;
  slotW: number;
  slotH: number;
  slotGap: number;
  slotPawn: number;
  panelPadX: number;
  panelPadY: number;
  panelW: number;
  panelH: number;
  btnW: number;
  btnH: number;
  btnGap: number;
  btnTopY: number;
  labelW: number;
  /** 座位网格与面板内边框的留白 */
  contentInset: number;
};

function designHalfWidth(): number {
  return Math.min(440, Math.round(1280 * 0.36));
}

function getRoomLayout(): RoomLayout {
  const s = Math.min(lobbyScale(), 1.2);
  const half = designHalfWidth();
  const leftSide = Math.round(half * 0.5);
  const rightSide = Math.round(half * 0.7);
  const slotsY = -10;
  const slotW = Math.round(280 * s);
  const slotH = Math.round(172 * s);
  const slotGap = Math.round(10 * s);
  const panelPadX = Math.round(48 * s);
  const panelPadY = Math.round(38 * s);
  const gridW = slotW * 2 + slotGap;
  const gridH = slotH * 2 + slotGap;
  const panelW = gridW + panelPadX * 2;
  const panelH = gridH + panelPadY * 2;
  const btnH = Math.round(54 * s);
  const btnW = Math.round(260 * s);
  const btnGap = Math.round(10 * s);
  const leftX = -leftSide;
  const rightX = leftX + panelW / 2 + btnW / 2 + Math.round(28 * s);
  const hostBtnCount = 4;
  const btnBlockH = hostBtnCount * btnH + (hostBtnCount - 1) * btnGap;
  return {
    leftX,
    rightX,
    titleY: 88,
    subY: 48,
    slotsY,
    slotW,
    slotH,
    slotGap,
    slotPawn: Math.round(88 * s),
    panelPadX,
    panelPadY,
    panelW,
    panelH,
    btnW,
    btnH,
    btnGap,
    btnTopY: Math.round(slotsY + btnBlockH / 2 - btnH / 2),
    labelW: Math.round(340 * s),
    contentInset: Math.round(18 * s),
  };
}

const S = lobbyScale();

/** 竖屏画布（720x1280）下，大厅顶部状态栏/货币栏的统一 Y 坐标 */
function getMenuUiMetrics(): { infoTopY: number } {
  const halfH = DESIGN_H / 2;
  return {
    infoTopY: Math.round(halfH - 60 * S),
  };
}

/** 大厅菜单（竖屏）：Logo / 主面板 / 入口按钮的尺寸与位置常量 */
const LOBBY_LOGO_W = Math.round(520 * S);
const LOBBY_LOGO_H = Math.round(180 * S);
const LOBBY_LOGO_Y = Math.round(360 * S);
const LOBBY_PANEL_W = Math.round(640 * S);
const LOBBY_PANEL_H = Math.round(460 * S);
const LOBBY_PANEL_Y = Math.round(-120 * S);
const LOBBY_MENU_BTN_W = Math.round(480 * S);
const LOBBY_MENU_BTN_H = Math.round(110 * S);
const LOBBY_MENU_BTN_GAP = Math.round(36 * S);
const LOBBY_MENU_STEP = LOBBY_MENU_BTN_H + LOBBY_MENU_BTN_GAP;

const UI = {
  // 大厅按钮稍微小一点点，页面不拥挤
  btnW: Math.round(400 * S),
  btnH: Math.round(48 * S),
  listBtnH: Math.round(46 * S),
  gap: Math.round(12 * S),
  // 注意：iPhone 全面屏横屏下 view 尺寸获取时机不稳定，这里不再在模块加载期计算位置
  infoTopY: 0,
  titleFont: Math.round(32 * S),
  roomTitleFont: Math.round(36 * S),
  roomSubFont: Math.round(36 * S),
  btnFont: Math.round(28 * S),
  listFont: Math.round(26 * S),
  slotW: Math.round(200 * S),
  slotH: Math.round(130 * S),
  slotGap: Math.round(14 * S),
  slotAvatar: Math.round(58 * S),
  slotNameFont: Math.round(26 * S),
  slotMetaFont: Math.round(20 * S),
};

const LIST_MAX_ROWS = 4;

const COLOR_SLOT_EMPTY = new Color(32, 38, 52, 168);
const COLOR_SLOT_FILL = new Color(42, 58, 82, 198);
const COLOR_SLOT_BORDER = new Color(88, 118, 158, 130);
const COLOR_SLOT_BORDER_FILL = new Color(100, 150, 210, 155);
const ROOM_BTN_ART_INSET_X = 0.16;
const ROOM_BTN_ART_INSET_Y = 0.12;
/** 与 panel_room_main_9s（920x560）边框厚度一致，用于九宫格 */
const ROOM_PANEL_SLICE = { top: 31, bottom: 31, left: 34, right: 34 };
const ROOM_PANEL_MASK_ALPHA = 140;
const COLOR_BTN_DISABLED = new Color(90, 90, 98, 255);

/**
 * 大厅：对局名称 + 创建房间 + 房间列表；房内四格玩家 + 角色按钮
 */
@ccclass('LobbyController')
export class LobbyController extends Component {
  private _mode: LobbyMode = 'menu';
  private _statusLabel: Label | null = null;
  private _gameNameInput: WxGameNameInput | null = null;
  private _roomCtrl: RoomController | null = null;
  private _currentRoom: RoomVO | null = null;
  private _infoRoot: Node | null = null;
  /** 顶部货币栏（命运碎片 + 钻石），仅大厅菜单页展示。 */
  private _currencyBar: Node | null = null;
  private _shardsLabel: Label | null = null;
  private _diamondLabel: Label | null = null;
  private _menuRoot: Node | null = null;
  private _menuBlock: Node | null = null;
  private _lobbyLogo: Node | null = null;
  private _lobbyPanel: Node | null = null;
  private _roomRoot: Node | null = null;
  private _roomSlotsPanel: Node | null = null;
  private _roomTitleLabel: Label | null = null;
  private _roomSubLabel: Label | null = null;
  private _playerSlots: PlayerSlotUi[] = [];
  private _roomSlotsRoot: Node | null = null;
  private _hostBtnRoot: Node | null = null;
  private _guestBtnRoot: Node | null = null;
  private _listRoot: Node | null = null;
  private _listEmptyLabel: Label | null = null;
  private _listRowNodes: Node[] = [];
  private _listPage = 0;
  private _listRoomsCache: RoomVO[] = [];
  private _listPrevBtn: Node | null = null;
  private _listNextBtn: Node | null = null;
  private _listPollTimer: ReturnType<typeof setInterval> | null = null;
  private _unbindWindowResize: (() => void) | null = null;
  private _startBtn: Node | null = null;
  private _matchBtn: Node | null = null;
  /** 最近一次创建/确认的对局名（云函数未返回 gameName 时兜底） */
  private _pendingGameName = '';
  /** 使用 lobby.scene 里 Canvas/RoomRoot 编辑器布局（不再代码生成房间 UI） */
  private _editorRoomUi = false;
  private _roomStatusLabel: Label | null = null;
  /** Slot_0/HostTag：位置在编辑器调整，TS 只控制显隐（图里已含「房主」字） */
  private _slot0HostTag: Node | null = null;
  private _loadingRoomPawns = new Set<string>();

  private _setListPage(page: number): void {
    const totalPages = Math.max(1, Math.ceil(this._listRoomsCache.length / LIST_MAX_ROWS));
    this._listPage = Math.max(0, Math.min(totalPages - 1, page));
    this._applyRoomListUi(this._listRoomsCache);
  }

  onLoad() {
    lockPortrait();
    this.node.getChildByName('UiRoot')?.destroy();
    refreshScreenAdapt(this.node);
    void ensureResourcesBundle()
      .then(async (bundle) => {
        if (!bundle) {
          console.error('[Lobby] resources bundle not ready — 跳过背景加载');
          return false;
        }
        void playMainBgm(bundle);
        await preloadLobbyUi();
        return true;
      })
      .then((ready) => {
        if (!ready) return;
        this._applyLobbyArt();
        if (this._editorRoomUi && this._currentRoom) {
          this._renderRoom(this._currentRoom);
        }
        return void applyScreenBackground(this.node, this._mode === 'room' ? 'room' : 'lobby');
      });
    this._roomCtrl = this.getComponent(RoomController) || this.addComponent(RoomController);
    this._buildUi(this.node);
    applyUiLayerTree(this.node, this.node.layer);
    this._restoreGameName();
    this._showMenu();

    const relayout = () => {
      refreshScreenAdapt(this.node);
      void applyScreenBackground(this.node, this._mode === 'room' ? 'room' : 'lobby');
      this._applyMenuLayout();
      if (this._mode === 'room') this._applyRoomLayout();
    };
    this.scheduleOnce(relayout, 0);
    this.scheduleOnce(relayout, 0.12);
    this.scheduleOnce(relayout, 0.35);
    this._unbindWindowResize?.();
    this._unbindWindowResize = bindWindowResize(this.node, relayout);

    void this._refreshUserBanner();

    const launchCode = parseLaunchRoomCode(
      typeof wx !== 'undefined'
        ? (wx.getLaunchOptionsSync?.() as { query?: Record<string, string> })
        : undefined,
    );
    if (launchCode) {
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

  private _drawRectStroke(node: Node, w: number, h: number, fill: Color, stroke: Color): void {
    const g = node.getComponent(Graphics) || node.addComponent(Graphics);
    g.clear();
    g.fillColor = fill;
    g.rect(-w / 2, -h / 2, w, h);
    g.fill();
    g.strokeColor = stroke;
    g.lineWidth = 2;
    g.rect(-w / 2, -h / 2, w, h);
    g.stroke();
  }

  private _makeLabel(
    parent: Node,
    name: string,
    y: number,
    fontSize: number,
    h = 44,
    color = new Color(235, 235, 235, 255),
  ): Label {
    const n = new Node(name);
    n.setParent(parent);
    n.setPosition(new Vec3(0, y, 0));
    n.addComponent(UITransform).setContentSize(UI.btnW, h);
    const lbl = n.addComponent(Label);
    lbl.fontSize = fontSize;
    lbl.lineHeight = Math.round(fontSize * 1.25);
    lbl.color = color;
    lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
    lbl.overflow = Label.Overflow.SHRINK;
    return lbl;
  }

  private _makeBtn(
    parent: Node,
    text: string,
    y: number,
    onClick: () => void,
    color = new Color(52, 120, 200, 255),
    h = UI.btnH,
    w = UI.btnW,
    x = 0,
    artInsetX = 0,
    artInsetY = artInsetX,
  ): Node {
    const n = new Node(`Btn_${text}`);
    n.setParent(parent);
    n.setPosition(new Vec3(x, y, 0));
    n.addComponent(UITransform).setContentSize(w, h);
    this._drawRect(n, w, h, color);
    this._applyButtonArt(n, text, w, h, artInsetX, artInsetY);

    const labelNode = new Node('Label');
    labelNode.setParent(n);
    labelNode.addComponent(UITransform).setContentSize(w, h);
    const lbl = labelNode.addComponent(Label);
    lbl.string = text;
    lbl.fontSize = h < UI.btnH ? UI.listFont : UI.btnFont;
    lbl.lineHeight = Math.round(lbl.fontSize * 1.2);
    lbl.color = new Color(255, 255, 255, 255);
    lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
    lbl.verticalAlign = Label.VerticalAlign.CENTER;
    lbl.overflow = Label.Overflow.SHRINK;

    const btn = n.addComponent(Button);
    btn.transition = Button.Transition.SCALE;
    btn.zoomScale = 0.96;
    btn.target = n;
    n.on(Button.EventType.CLICK, onClick, this);
    return n;
  }

  private _lobbyButtonSpriteKey(text: string): string {
    if (text.includes('创建')) return 'lobby/btn_lobby_create_9s';
    if (text.includes('匹配')) return 'lobby/btn_lobby_match_9s';
    return 'lobby/btn_lobby_join_9s';
  }

  /** 房间内按钮复用大厅 batch1 按钮美术（不再使用 room/btn_room_*） */
  private _roomButtonSpriteKey(text: string): string | null {
    if (text.includes('开始')) return 'lobby/btn_lobby_create_9s';
    if (text.includes('匹配')) return 'lobby/btn_lobby_match_9s';
    if (text.includes('分享') || text.includes('退出') || text.includes('解散')) {
      return 'lobby/btn_lobby_join_9s';
    }
    return null;
  }

  private _buttonSpriteKey(text: string, isRoomBtn: boolean): string | null {
    if (isRoomBtn) {
      const roomKey = this._roomButtonSpriteKey(text);
      if (roomKey && getCachedSprite(roomKey)) return roomKey;
    }
    const lobbyKey = this._lobbyButtonSpriteKey(text);
    return getCachedSprite(lobbyKey) ? lobbyKey : null;
  }

  private _applyButtonArt(
    node: Node,
    text: string,
    w: number,
    h: number,
    insetX = 0,
    insetY = insetX,
    isRoomBtn = false,
  ): void {
    const key = this._buttonSpriteKey(text, isRoomBtn);
    const sf = key ? getCachedSprite(key) : null;
    const g = node.getComponent(Graphics);
    if (!sf) {
      if (g) g.enabled = true;
      return;
    }
    const artW = Math.round(w * (1 - insetX * 2));
    const artH = Math.round(h * (1 - insetY * 2));
    ensureArtStretch(node, 'BtnArt', sf, artW, artH);
    const art = node.getChildByName('BtnArt');
    art?.setSiblingIndex(0);
    art?.setPosition(0, 0, 0);
    if (g) g.enabled = false;
  }

  private _useRoomSlotArt(): boolean {
    return !!getCachedSprite('room/card_room_player_ready');
  }

  private _applyRoomSlotCard(root: Node, filled: boolean, w: number, h: number): void {
    const g = root.getComponent(Graphics);
    if (!filled) {
      root.getChildByName('CardArt')?.destroy();
      if (g) g.enabled = false;
      return;
    }
    const key = 'room/card_room_player_ready';
    const sf = getCachedSprite(key);
    if (!sf) {
      if (g) g.enabled = true;
      root.getChildByName('CardArt')?.destroy();
      return;
    }
    ensureArtStretch(root, 'CardArt', sf, w, h);
    root.getChildByName('CardArt')?.setSiblingIndex(0);
    if (g) g.enabled = false;
  }

  /** 编辑器 CardBg：只换 empty/ready 图，保持编辑器里调好的尺寸 */
  private _applyEditorSlotCard(cardBg: Sprite | null, cardSize: { w: number; h: number } | null, filled: boolean): void {
    if (!cardBg?.isValid) return;
    const key = filled ? 'room/card_room_player_ready' : 'room/card_room_player_empty';
    const sf = getCachedSprite(key);
    if (!sf) return;
    const ut = cardBg.node.getComponent(UITransform);
    const keepW = cardSize?.w ?? ut?.contentSize.width;
    const keepH = cardSize?.h ?? ut?.contentSize.height;
    cardBg.spriteFrame = sf;
    cardBg.type = Sprite.Type.SIMPLE;
    cardBg.sizeMode = Sprite.SizeMode.CUSTOM;
    cardBg.trim = false;
    if (ut && keepW && keepH) ut.setContentSize(keepW, keepH);
  }

  /** 编辑器 Slot_0/HostTag：仅控制显隐，不追加文字（tag_room_host 图内已有「房主」） */
  private _updateSlot0HostTag(room: RoomVO): void {
    if (this._slot0HostTag?.isValid) {
      const host = this._playerBySeat(room, 0);
      this._slot0HostTag.active = !!host && host.userId === room.hostId;
      return;
    }
    const ui = this._playerSlots[0];
    if (ui) {
      this._applyRoomSlotTagLegacy(ui.root, this._playerBySeat(room, 0), room, getRoomLayout());
    }
  }

  /** 无编辑器 HostTag 时的旧逻辑（仅 Slot_0 左上角动态生成） */
  private _applyRoomSlotTagLegacy(
    root: Node,
    player: PlayerSlotVO | null,
    room: RoomVO,
    layout: RoomLayout,
  ): void {
    if (root.name !== 'Slot_0') {
      root.getChildByName('Tag')?.destroy();
      return;
    }
    const hostSf = getCachedSprite('room/tag_room_host');
    if (!player || player.userId !== room.hostId || !hostSf) {
      root.getChildByName('Tag')?.destroy();
      return;
    }
    const scale = Math.min(lobbyScale(), 1.2);
    const margin = Math.round(10 * scale);
    const maxTagW = Math.round(layout.slotW * 0.34);
    const maxTagH = Math.round(24 * scale);
    const { w: sw, h: sh } = spriteSourceSize(hostSf);
    const fitScale = Math.min(maxTagW / sw, maxTagH / sh, 1);
    const layW = Math.max(1, Math.round(sw * fitScale));
    const layH = Math.max(1, Math.round(sh * fitScale));
    let tag = root.getChildByName('Tag');
    if (!tag) {
      tag = new Node('Tag');
      tag.setParent(root);
    }
    tag.setPosition(-layout.slotW / 2 + margin + layW / 2, layout.slotH / 2 - margin - layH / 2, 0);
    tag.removeAllChildren();
    ensureArtChild(tag, 'TagArt', hostSf, layW, layH);
    let hostLbl = tag.getChildByName('HostText')?.getComponent(Label);
    if (!hostLbl) {
      const ln = new Node('HostText');
      ln.setParent(tag);
      ln.addComponent(UITransform).setContentSize(layW, layH);
      hostLbl = ln.addComponent(Label);
      hostLbl.fontSize = Math.round(16 * scale);
      hostLbl.lineHeight = Math.round(20 * scale);
      hostLbl.color = new Color(255, 245, 220, 255);
      hostLbl.horizontalAlign = Label.HorizontalAlign.CENTER;
      hostLbl.verticalAlign = Label.VerticalAlign.CENTER;
    }
    hostLbl.string = '房主';
  }

  private _bindEditorPlayerSlot(slotRoot: Node, seat: number): PlayerSlotUi | null {
    const nameLabel = slotRoot.getChildByName('Name')?.getComponent(Label);
    const metaLabel = slotRoot.getChildByName('Meta')?.getComponent(Label);
    const pawnNode = slotRoot.getChildByName('Pawn');
    if (!nameLabel || !metaLabel || !pawnNode) return null;
    const cardBg = slotRoot.getChildByName('CardBg')?.getComponent(Sprite) ?? null;
    let cardBgSize: { w: number; h: number } | null = null;
    if (cardBg) {
      const ut = cardBg.node.getComponent(UITransform);
      if (ut) {
        cardBgSize = { w: ut.contentSize.width, h: ut.contentSize.height };
        cardBg.sizeMode = Sprite.SizeMode.CUSTOM;
        cardBg.trim = false;
      }
    }
    return { root: slotRoot, nameLabel, metaLabel, pawnNode, seat, cardBg, cardBgSize };
  }

  private _wireEditorBtn(btn: Node | null, onClick: () => void): void {
    if (!btn?.isValid) return;
    const button = btn.getComponent(Button) || btn.addComponent(Button);
    button.transition = Button.Transition.NONE;
    button.interactable = true;
    btn.getComponent(Graphics)?.destroy();
    btn.off(Button.EventType.CLICK);
    btn.on(Button.EventType.CLICK, onClick, this);
  }

  private _wireEditorRoomButtons(): void {
    const shareHost = this._hostBtnRoot?.getChildByName('BtnShare') ?? null;
    const disband = this._hostBtnRoot?.getChildByName('BtnDisband') ?? null;
    const shareGuest = this._guestBtnRoot?.getChildByName('BtnShare') ?? null;
    const exit = this._guestBtnRoot?.getChildByName('BtnExit') ?? null;
    this._wireEditorBtn(this._startBtn, () => void this._onTryStart());
    this._wireEditorBtn(this._matchBtn, () => void this._onToggleMatchFill());
    this._wireEditorBtn(shareHost, () => this._onShare());
    this._wireEditorBtn(disband, () => void this._onDisband());
    this._wireEditorBtn(shareGuest, () => this._onShare());
    this._wireEditorBtn(exit, () => void this._onExitRoom());
  }

  /** 绑定 lobby.scene 内 Canvas/RoomRoot（用户已在编辑器摆好布局） */
  private _bindEditorRoomUi(editorRoot: Node): boolean {
    const panelMain = editorRoot.getChildByName('PanelMain');
    const playerSlots = panelMain?.getChildByName('PlayerSlots');
    const hostBtns = editorRoot.getChildByName('HostButtons');
    const guestBtns = editorRoot.getChildByName('GuestButtons');
    if (!panelMain || !playerSlots || !hostBtns || !guestBtns) return false;

    this._roomRoot = editorRoot;
    this._editorRoomUi = true;
    this._roomSlotsPanel = panelMain;
    this._roomSlotsRoot = playerSlots;

    const roomCode = editorRoot.getChildByName('RoomCodeLabel')?.getComponent(Label);
    if (roomCode) this._roomSubLabel = roomCode;
    const roomStatus = editorRoot.getChildByName('StatusLabel')?.getComponent(Label);
    if (roomStatus) this._roomStatusLabel = roomStatus;

    this._playerSlots = [];
    for (let seat = 0; seat < ROOM_SLOT_COUNT; seat++) {
      const slotRoot = playerSlots.getChildByName(`Slot_${seat}`);
      const ui = slotRoot ? this._bindEditorPlayerSlot(slotRoot, seat) : null;
      if (ui) this._playerSlots.push(ui);
    }
    if (this._playerSlots.length !== ROOM_SLOT_COUNT) {
      this._editorRoomUi = false;
      this._roomRoot = null;
      this._playerSlots = [];
      return false;
    }

    this._slot0HostTag = playerSlots.getChildByName('Slot_0')?.getChildByName('HostTag') ?? null;
    if (this._slot0HostTag) {
      // 旧版 TS 可能留下 HostText/Tag，与 tag_room_host 图内文字重复
      this._slot0HostTag.getChildByName('HostText')?.destroy();
      playerSlots.getChildByName('Slot_0')?.getChildByName('Tag')?.destroy();
      this._slot0HostTag.active = false;
    }

    this._hostBtnRoot = hostBtns;
    this._guestBtnRoot = guestBtns;
    this._startBtn = hostBtns.getChildByName('BtnStart');
    this._matchBtn = hostBtns.getChildByName('BtnMatch');
    this._wireEditorRoomButtons();

    editorRoot.active = false;
    console.log('[Lobby] 已绑定编辑器 RoomRoot 布局');
    return true;
  }

  private _ensureRoomPanelMask(panel: Node, layout: RoomLayout): void {
    const innerW = layout.panelW - ROOM_PANEL_SLICE.left - ROOM_PANEL_SLICE.right;
    const innerH = layout.panelH - ROOM_PANEL_SLICE.top - ROOM_PANEL_SLICE.bottom;
    let mask = panel.getChildByName('PanelMask');
    if (!mask) {
      mask = new Node('PanelMask');
      mask.setParent(panel);
    }
    mask.setPosition(0, 0, 0);
    const maskUt = mask.getComponent(UITransform) || mask.addComponent(UITransform);
    maskUt.setContentSize(innerW, innerH);
    const mg = mask.getComponent(Graphics) || mask.addComponent(Graphics);
    mg.clear();
    mg.fillColor = new Color(10, 16, 30, ROOM_PANEL_MASK_ALPHA);
    mg.rect(-innerW / 2, -innerH / 2, innerW, innerH);
    mg.fill();
    mask.setSiblingIndex(0);
  }

  private _applyRoomArt(layout = getRoomLayout()): void {
    if (this._editorRoomUi) {
      if (this._currentRoom) this._updatePlayerSlots(this._currentRoom);
      return;
    }
    const panelSf = getCachedSprite('room/panel_room_main_9s');
    if (this._roomSlotsPanel?.isValid) {
      this._ensureRoomPanelMask(this._roomSlotsPanel, layout);
      if (panelSf) {
        ensureArtSliced(
          this._roomSlotsPanel,
          'PanelArt',
          panelSf,
          layout.panelW,
          layout.panelH,
          ROOM_PANEL_SLICE,
        );
        const panelArt = this._roomSlotsPanel.getChildByName('PanelArt');
        panelArt?.setSiblingIndex(this._roomSlotsPanel.children.length - 1);
      }
      const panelG = this._roomSlotsPanel.getComponent(Graphics);
      if (panelG) panelG.enabled = false;
      this._roomSlotsPanel.getComponent(UITransform)?.setContentSize(layout.panelW, layout.panelH);
      this._roomSlotsRoot?.setSiblingIndex(1);
      this._roomSubLabel?.node.setSiblingIndex(2);
    }

    if (this._roomRoot?.isValid) {
      const editorBtnText: Record<string, string> = {
        BtnStart: '开始游戏',
        BtnMatch: '在线匹配',
        BtnShare: '分享房间',
        BtnDisband: '解散房间',
        BtnExit: '退出房间',
      };
      const visit = (node: Node): void => {
        const ut = node.getComponent(UITransform);
        if (!ut) {
          node.children.forEach(visit);
          return;
        }
        let text: string | undefined;
        if (node.name.startsWith('Btn_')) {
          text = node.getChildByName('Label')?.getComponent(Label)?.string ?? node.name;
        } else if (editorBtnText[node.name]) {
          text = editorBtnText[node.name];
        }
        if (text) {
          const inRoomBtnTree =
            node.parent === this._hostBtnRoot
            || node.parent === this._guestBtnRoot
            || node.parent?.parent === this._roomRoot;
          if (inRoomBtnTree) {
            this._applyButtonArt(
              node,
              text,
              ut.contentSize.width,
              ut.contentSize.height,
              ROOM_BTN_ART_INSET_X,
              ROOM_BTN_ART_INSET_Y,
              true,
            );
          }
        }
        node.children.forEach(visit);
      };
      visit(this._roomRoot);
    }

    if (this._currentRoom) {
      this._updatePlayerSlots(this._currentRoom);
    }
  }

  private _applyLobbyArt(): void {
    const logoSf = getCachedSprite('lobby/logo_game');
    if (this._lobbyLogo?.isValid && logoSf) {
      ensureArtChild(this._lobbyLogo, 'LogoArt', logoSf, LOBBY_LOGO_W, LOBBY_LOGO_H);
    }

    const panelSf = getCachedSprite('lobby/panel_lobby_main_9s');
    if (this._lobbyPanel?.isValid && panelSf) {
      ensureArtStretch(this._lobbyPanel, 'PanelArt', panelSf, LOBBY_PANEL_W, LOBBY_PANEL_H);
      this._lobbyPanel.getChildByName('PanelArt')?.setSiblingIndex(0);
    }

    this._gameNameInput?.applyArt();

    const applyBtn = (node: Node): void => {
      if (!node.name.startsWith('Btn_')) return;
      const ut = node.getComponent(UITransform);
      if (!ut) return;
      const text = node.getChildByName('Label')?.getComponent(Label)?.string ?? node.name;
      const isRoomBtn = this._mode === 'room' && this._roomRoot?.isValid && node.parent?.parent === this._roomRoot;
      this._applyButtonArt(
        node,
        text,
        ut.contentSize.width,
        ut.contentSize.height,
        isRoomBtn ? ROOM_BTN_ART_INSET_X : 0,
        isRoomBtn ? ROOM_BTN_ART_INSET_Y : 0,
        isRoomBtn,
      );
    };
    const visit = (node: Node): void => {
      applyBtn(node);
      node.children.forEach(visit);
    };
    if (this._menuRoot?.isValid) visit(this._menuRoot);
    if (this._roomRoot?.isValid && !this._editorRoomUi) visit(this._roomRoot);
    if (this._mode === 'room') this._applyRoomArt(getRoomLayout());
  }

  private _setBtnEnabled(btnNode: Node | null, enabled: boolean, enabledColor: Color): void {
    if (!btnNode) return;
    const btn = btnNode.getComponent(Button);
    if (btn) btn.interactable = enabled;
    if (this._editorRoomUi) {
      btnNode.getComponent(Graphics)?.destroy();
      const sp = btnNode.getComponent(Sprite);
      if (sp) {
        const opacity = btnNode.getComponent(UIOpacity) || btnNode.addComponent(UIOpacity);
        opacity.opacity = enabled ? 255 : 150;
      }
      return;
    }
    const ut = btnNode.getComponent(UITransform);
    const w = ut?.contentSize.width ?? UI.btnW;
    const h = ut?.contentSize.height ?? UI.btnH;
    if (!btnNode.getChildByName('BtnArt')) {
      this._drawRect(btnNode, w, h, enabled ? enabledColor : COLOR_BTN_DISABLED);
    } else {
      const g = btnNode.getComponent(Graphics);
      if (g) g.enabled = false;
    }
    const lbl = btnNode.getChildByName('Label')?.getComponent(Label);
    if (lbl) {
      lbl.color = enabled
        ? new Color(255, 255, 255, 255)
        : new Color(180, 180, 185, 255);
    }
  }

  private _makeGameNameInput(parent: Node, y: number): WxGameNameInput {
    const root = new Node('GameNameInput');
    root.setParent(parent);
    root.setPosition(new Vec3(0, y, 0));
    const comp = root.addComponent(WxGameNameInput);
    root.on('keyboard-height', (heightPx: number) => this._onKeyboardHeight(heightPx), this);
    return comp;
  }

  private _layoutPlayerSlot(root: Node, seat: number, layout: RoomLayout): void {
    const col = seat % 2;
    const row = Math.floor(seat / 2);
    const inset = layout.contentInset;
    const x = (col - 0.5) * (layout.slotW + layout.slotGap - inset);
    const y = (0.5 - row) * (layout.slotH + layout.slotGap - inset);
    root.setPosition(new Vec3(x, y, 0));
    root.getComponent(UITransform)?.setContentSize(layout.slotW, layout.slotH);

    const pawnY = Math.round(layout.slotH * 0.1);
    const nameBandH = Math.round(32 * Math.min(lobbyScale(), 1.2));
    const metaBandH = Math.round(22 * Math.min(lobbyScale(), 1.2));
    const nameY = -layout.slotH / 2 + 28;
    const metaY = -layout.slotH / 2 + metaBandH / 2 + 8;

    const pawnNode = root.getChildByName('Pawn');
    pawnNode?.setPosition(new Vec3(0, pawnY, 0));
    pawnNode?.getComponent(UITransform)?.setContentSize(layout.slotPawn, layout.slotPawn);

    const nameNode = root.getChildByName('Name');
    nameNode?.setPosition(new Vec3(0, nameY, 0));
    nameNode?.getComponent(UITransform)?.setContentSize(layout.slotW - 32, nameBandH);

    const metaNode = root.getChildByName('Meta');
    metaNode?.setPosition(new Vec3(0, metaY, 0));
    metaNode?.getComponent(UITransform)?.setContentSize(layout.slotW - 24, metaBandH);
  }

  private _applyRoomSlotPawn(
    pawnNode: Node,
    seat: number,
    boxW: number,
    boxH: number,
  ): void {
    const key = `board/pawns/pawn_player_${seat + 1}`;
    const pawnOpacity = pawnNode.getComponent(UIOpacity) || pawnNode.addComponent(UIOpacity);
    const reveal = () => {
      pawnOpacity.opacity = 255;
    };
    const paint = (sf: SpriteFrame) => {
      ensureArtChild(pawnNode, 'PawnArt', sf, boxW, boxH);
      reveal();
    };
    const sf = getCachedSprite(key);
    if (sf) {
      paint(sf);
      return;
    }
    pawnOpacity.opacity = 0;
    if (this._loadingRoomPawns.has(key)) return;
    this._loadingRoomPawns.add(key);
    void loadUiSprite(key).then((loaded) => {
      this._loadingRoomPawns.delete(key);
      if (!loaded || !pawnNode.isValid || !pawnNode.active) return;
      const ut = pawnNode.getComponent(UITransform);
      const w = ut?.contentSize.width ?? boxW;
      const h = ut?.contentSize.height ?? boxH;
      ensureArtChild(pawnNode, 'PawnArt', loaded, w, h);
      reveal();
    });
  }

  private _makePlayerSlot(parent: Node, seat: number, layout: RoomLayout): PlayerSlotUi {
    const root = new Node(`Slot_${seat}`);
    root.setParent(parent);
    root.addComponent(UITransform).setContentSize(layout.slotW, layout.slotH);
    this._drawRectStroke(root, layout.slotW, layout.slotH, COLOR_SLOT_EMPTY, COLOR_SLOT_BORDER);

    const pawnNode = new Node('Pawn');
    pawnNode.setParent(root);
    pawnNode.addComponent(UITransform).setContentSize(layout.slotPawn, layout.slotPawn);
    pawnNode.addComponent(UIOpacity);

    const nameNode = new Node('Name');
    nameNode.setParent(root);
    const nameLabel = nameNode.addComponent(Label);
    nameLabel.fontSize = UI.slotNameFont;
    nameLabel.lineHeight = UI.slotNameFont + 2;
    nameLabel.color = new Color(220, 220, 225, 255);
    nameLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    nameLabel.verticalAlign = Label.VerticalAlign.CENTER;
    nameLabel.overflow = Label.Overflow.CLAMP;
    nameLabel.enableWrapText = true;

    const metaNode = new Node('Meta');
    metaNode.setParent(root);
    const metaLabel = metaNode.addComponent(Label);
    metaLabel.fontSize = UI.slotMetaFont;
    metaLabel.lineHeight = UI.slotMetaFont + 2;
    metaLabel.color = new Color(130, 135, 150, 255);
    metaLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    metaLabel.verticalAlign = Label.VerticalAlign.CENTER;
    metaLabel.overflow = Label.Overflow.CLAMP;
    metaLabel.string = '';

    this._layoutPlayerSlot(root, seat, layout);
    this._applyRoomSlotPawn(pawnNode, seat, layout.slotPawn, layout.slotPawn);

    return { root, nameLabel, metaLabel, pawnNode, seat, cardBg: null, cardBgSize: null };
  }

  private _buildUi(uiRoot: Node): void {
    const { infoTopY } = getMenuUiMetrics();

    this._infoRoot = new Node('InfoRoot');
    this._infoRoot.setParent(uiRoot);

    this._menuRoot = new Node('MenuRoot');
    this._menuRoot.setParent(uiRoot);

    this._lobbyPanel = new Node('LobbyMainPanel');
    this._lobbyPanel.setParent(this._menuRoot);
    this._lobbyPanel.setSiblingIndex(0);
    this._lobbyPanel.addComponent(UITransform).setContentSize(LOBBY_PANEL_W, LOBBY_PANEL_H);
    this._drawRectStroke(
      this._lobbyPanel,
      LOBBY_PANEL_W,
      LOBBY_PANEL_H,
      new Color(18, 24, 40, 210),
      new Color(96, 140, 180, 180),
    );

    this._lobbyLogo = new Node('LobbyLogo');
    this._lobbyLogo.setParent(this._menuRoot);
    this._lobbyLogo.setSiblingIndex(1);
    this._lobbyLogo.addComponent(UITransform).setContentSize(LOBBY_LOGO_W, LOBBY_LOGO_H);

    const editorRoom = uiRoot.children.find(
      (c) => c.name === 'RoomRoot' && c.getChildByName('PanelMain'),
    );
    if (!editorRoom || !this._bindEditorRoomUi(editorRoom)) {
      this._roomRoot = new Node('RoomRoot');
      this._roomRoot.setParent(uiRoot);
      this._roomRoot.active = false;

      const rl = getRoomLayout();
      this._roomTitleLabel = this._makeLabel(
        this._roomRoot,
        'RoomTitle',
        rl.titleY,
        UI.roomTitleFont,
        Math.round(40 * S),
        new Color(255, 220, 120, 255),
      );
      this._roomTitleLabel.node.active = false;

      this._roomSlotsPanel = new Node('RoomSlotsPanel');
      this._roomSlotsPanel.setParent(this._roomRoot);
      this._roomSlotsPanel.addComponent(UITransform).setContentSize(rl.panelW, rl.panelH);
      const panelBg = this._roomSlotsPanel.addComponent(Graphics);
      panelBg.fillColor = new Color(0, 0, 0, 0);
      panelBg.rect(-rl.panelW / 2, -rl.panelH / 2, rl.panelW, rl.panelH);
      panelBg.fill();

      this._roomSubLabel = this._makeLabel(
        this._roomSlotsPanel,
        'RoomSub',
        0,
        UI.roomSubFont,
        Math.round(360 * S),
        new Color(255, 255, 255, 255),
      );
      this._roomSubLabel.isBold = false;
      this._roomSubLabel.horizontalAlign = Label.HorizontalAlign.LEFT;

      this._roomSlotsRoot = new Node('PlayerSlots');
      this._roomSlotsRoot.setParent(this._roomSlotsPanel);
      this._roomSlotsRoot.setPosition(0, 0, 0);
      for (let seat = 0; seat < ROOM_SLOT_COUNT; seat++) {
        this._playerSlots.push(this._makePlayerSlot(this._roomSlotsRoot, seat, rl));
      }

      this._hostBtnRoot = new Node('HostBtns');
      this._hostBtnRoot.setParent(this._roomRoot);
      this._guestBtnRoot = new Node('GuestBtns');
      this._guestBtnRoot.setParent(this._roomRoot);

      const hostColorStart = new Color(180, 60, 60, 255);
      const hostBtnStep = this._hostRoomBtnSize(rl).h + rl.btnGap;
      const guestBtnStep = rl.btnH + rl.btnGap;
      this._startBtn = this._makeRoomBtn(
        this._hostBtnRoot,
        '开始游戏',
        rl.btnTopY,
        () => void this._onTryStart(),
        hostColorStart,
        rl,
      );
      this._matchBtn = this._makeRoomBtn(
        this._hostBtnRoot,
        '在线匹配',
        rl.btnTopY - hostBtnStep,
        () => void this._onToggleMatchFill(),
        new Color(160, 90, 50, 255),
        rl,
      );
      this._makeRoomBtn(
        this._hostBtnRoot,
        '分享房间',
        rl.btnTopY - hostBtnStep * 2,
        () => this._onShare(),
        undefined,
        rl,
      );
      this._makeRoomBtn(
        this._hostBtnRoot,
        '解散房间',
        rl.btnTopY - hostBtnStep * 3,
        () => void this._onDisband(),
        new Color(70, 70, 80, 255),
        rl,
      );

      this._makeRoomBtn(
        this._guestBtnRoot,
        '分享房间',
        rl.btnTopY,
        () => this._onShare(),
        undefined,
        rl,
      );
      this._makeRoomBtn(
        this._guestBtnRoot,
        '退出房间',
        rl.btnTopY - guestBtnStep,
        () => void this._onExitRoom(),
        new Color(70, 70, 80, 255),
        rl,
      );

      this._applyRoomLayout();
    }

    this._statusLabel = this._makeLabel(
      this._infoRoot,
      'Status',
      infoTopY,
      UI.titleFont,
      Math.round(48 * S),
    );

    // 顶部货币栏（命运碎片 + 钻石），右上角显示，仅大厅菜单页可见。
    this._currencyBar = new Node('CurrencyBar');
    this._currencyBar.setParent(this._infoRoot);
    const currencyFont = Math.round(28 * S);
    const currencyW = Math.round(220 * S);
    const currencyH = Math.round(40 * S);
    this._shardsLabel = this._makeLabel(
      this._currencyBar,
      'ShardsLabel',
      0,
      currencyFont,
      currencyH,
      new Color(190, 230, 255, 255),
    );
    this._shardsLabel.node.setPosition(0, 0, 0);
    this._shardsLabel.node.getComponent(UITransform)?.setContentSize(currencyW, currencyH);
    this._shardsLabel.horizontalAlign = Label.HorizontalAlign.RIGHT;
    this._shardsLabel.string = '';
    this._diamondLabel = this._makeLabel(
      this._currencyBar,
      'DiamondLabel',
      -currencyH - Math.round(4 * S),
      currencyFont,
      currencyH,
      new Color(255, 220, 120, 255),
    );
    this._diamondLabel.node.setPosition(0, -currencyH - Math.round(4 * S), 0);
    this._diamondLabel.node.getComponent(UITransform)?.setContentSize(currencyW, currencyH);
    this._diamondLabel.horizontalAlign = Label.HorizontalAlign.RIGHT;
    this._diamondLabel.string = '';

    this._menuBlock = new Node('MenuBlock');
    this._menuBlock.setParent(this._menuRoot);
    this._menuBlock.setSiblingIndex(2);

    const menu = this._menuBlock;

    // PVP（创建房间 / 房间列表）暂时关闭，大厅仅保留 PVE 入口（命运远征 / 命运树）。
    // 相关代码（_onCreate / _refreshRoomList / _gameNameInput 等）保留不变，便于后续恢复。
    // 两个入口按钮在 LOBBY_PANEL 内垂直居中排列（竖屏改为更大触控区域）。
    this._makeBtn(
      menu,
      '命运远征',
      LOBBY_MENU_STEP / 2,
      () => this._gotoScene('加载远征…', () => SceneLoader.loadPveExpedition()),
      new Color(150, 100, 220, 255),
      LOBBY_MENU_BTN_H,
      LOBBY_MENU_BTN_W,
    );

    this._makeBtn(
      menu,
      '命运树',
      -LOBBY_MENU_STEP / 2,
      () => this._gotoScene('加载命运树…', () => SceneLoader.loadDestinyTree()),
      new Color(200, 160, 60, 255),
      LOBBY_MENU_BTN_H,
      LOBBY_MENU_BTN_W,
    );

    this._infoRoot.setSiblingIndex(20);
  }

  private _makeRoomBtn(
    parent: Node,
    text: string,
    y: number,
    onClick: () => void,
    color: Color | undefined,
    layout: RoomLayout,
  ): Node {
    return this._makeBtn(
      parent,
      text,
      y,
      onClick,
      color ?? new Color(52, 120, 200, 255),
      layout.btnH,
      layout.btnW,
      0,
      ROOM_BTN_ART_INSET_X,
      ROOM_BTN_ART_INSET_Y,
    );
  }

  /** 横屏：左栏玩家 + 右栏按钮；状态条置顶 */
  private _applyRoomLayout(): void {
    if (this._currencyBar) this._currencyBar.active = false;
    if (this._editorRoomUi) {
      if (this._infoRoot) this._infoRoot.active = false;
      return;
    }
    if (this._infoRoot) this._infoRoot.active = true;
    const rl = getRoomLayout();
    if (this._infoRoot) this._infoRoot.setPosition(0, 0, 0);
    if (this._roomTitleLabel?.node) {
      this._roomTitleLabel.node.active = false;
    }
    if (this._roomSubLabel?.node) {
      const panelTop = rl.panelH / 2;
      const panelLeft = -rl.panelW / 2;
      const subUt =
        this._roomSubLabel.node.getComponent(UITransform)
        || this._roomSubLabel.node.addComponent(UITransform);
      subUt.setAnchorPoint(0, 1);
      this._roomSubLabel.node.setPosition(panelLeft + 52, panelTop - 2, 0);
      subUt.setContentSize(rl.panelW - 24, 40);
      this._roomSubLabel.fontSize = UI.roomSubFont;
      this._roomSubLabel.isBold = false;
      this._roomSubLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
      this._roomSubLabel.verticalAlign = Label.VerticalAlign.TOP;
      this._roomSubLabel.color = new Color(255, 255, 255, 255);
    }
    if (this._roomSlotsPanel) {
      this._roomSlotsPanel.setPosition(rl.leftX, rl.slotsY, 0);
      this._roomSlotsPanel.getComponent(UITransform)?.setContentSize(rl.panelW, rl.panelH);
    }
    if (this._roomSlotsRoot) {
      for (const ui of this._playerSlots) {
        this._layoutPlayerSlot(ui.root, ui.seat, rl);
        this._applyRoomSlotPawn(ui.pawnNode, ui.seat, rl.slotPawn, rl.slotPawn);
      }
    }
    const hostBtnSize = this._hostRoomBtnSize(rl);
    const hostBtnStep = hostBtnSize.h + rl.btnGap;
    const guestBtnStep = rl.btnH + rl.btnGap;
    const repositionRoomBtns = (
      root: Node | null,
      texts: string[],
      step: number,
    ): void => {
      if (!root) return;
      texts.forEach((text, i) => {
        const btn = root.getChildByName(`Btn_${text}`);
        if (btn) {
          btn.setPosition(0, rl.btnTopY - step * i, 0);
          const ut = btn.getComponent(UITransform);
          if (ut) {
            this._applyButtonArt(
              btn,
              text,
              ut.contentSize.width,
              ut.contentSize.height,
              ROOM_BTN_ART_INSET_X,
              ROOM_BTN_ART_INSET_Y,
              true,
            );
          }
        }
      });
    };
    if (this._hostBtnRoot) {
      this._hostBtnRoot.setPosition(rl.rightX, 0, 0);
      repositionRoomBtns(
        this._hostBtnRoot,
        ['开始游戏', '在线匹配', '分享房间', '解散房间'],
        hostBtnStep,
      );
    }
    if (this._guestBtnRoot) {
      this._guestBtnRoot.setPosition(rl.rightX, 0, 0);
      repositionRoomBtns(this._guestBtnRoot, ['分享房间', '退出房间'], guestBtnStep);
    }
    if (this._statusLabel?.node && this._mode === 'room') {
      const panelTopY = rl.slotsY + rl.panelH / 2;
      const infoCenterX = (rl.leftX + rl.rightX) / 2;
      this._statusLabel.node.setPosition(infoCenterX, panelTopY + 26, 0);
      this._statusLabel.node.getComponent(UITransform)?.setContentSize(rl.rightX - rl.leftX - 32, 32);
      this._statusLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
      this._statusLabel.fontSize = Math.round(26 * S);
    }
    this._applyHostRoomBtnSizes(rl);
    this._applyRoomArt(rl);
  }

  /** 房主侧四个按钮始终与「关闭在线匹配」六字按钮同宽同高 */
  private _hostRoomBtnSize(rl: RoomLayout): { w: number; h: number } {
    return {
      w: rl.btnW + Math.round(56 * S),
      h: rl.btnH + Math.round(12 * S),
    };
  }

  /** 房主侧四个按钮统一尺寸 */
  private _applyHostRoomBtnSizes(rl: RoomLayout): void {
    if (!this._hostBtnRoot?.isValid) return;
    const { w, h } = this._hostRoomBtnSize(rl);
    const texts = ['开始游戏', '在线匹配', '分享房间', '解散房间'];
    for (const nodeName of texts) {
      const btn = this._hostBtnRoot.getChildByName(`Btn_${nodeName}`);
      if (!btn) continue;
      const ut = btn.getComponent(UITransform);
      if (ut) ut.setContentSize(w, h);
      const lbl = btn.getChildByName('Label')?.getComponent(Label);
      const labelUt = lbl?.node.getComponent(UITransform);
      if (labelUt) labelUt.setContentSize(w, h);
      const text = lbl?.string ?? nodeName;
      this._applyButtonArt(
        btn,
        text,
        w,
        h,
        ROOM_BTN_ART_INSET_X,
        ROOM_BTN_ART_INSET_Y,
        true,
      );
    }
    if (this._hostBtnRoot.parent === this._roomRoot) {
      const { w: hostW } = this._hostRoomBtnSize(rl);
      this._hostBtnRoot.setPosition(rl.leftX + rl.panelW / 2 + hostW / 2 + Math.round(28 * S), 0, 0);
    }
  }

  private _applyMenuLayout(): void {
    if (this._infoRoot) this._infoRoot.active = false;
    if (this._infoRoot) this._infoRoot.setPosition(0, 0, 0);
    const { infoTopY } = getMenuUiMetrics();
    if (this._statusLabel?.node) {
      this._statusLabel.node.setPosition(0, infoTopY, 0);
      this._statusLabel.node.getComponent(UITransform)?.setContentSize(UI.btnW, Math.round(48 * S));
      this._statusLabel.fontSize = UI.titleFont;
      this._statusLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    }
    if (this._currencyBar) {
      this._currencyBar.active = true;
      const { w: screenW } = visibleDesignSize();
      this._currencyBar.setPosition(screenW / 2 - Math.round(130 * S), infoTopY, 0);
    }
    if (this._menuRoot) {
      this._menuRoot.setPosition(0, 0, 0);
    }
    if (this._lobbyLogo) {
      this._lobbyLogo.setPosition(0, LOBBY_LOGO_Y, 0);
    }
    if (this._lobbyPanel) {
      this._lobbyPanel.setPosition(0, LOBBY_PANEL_Y, 0);
    }
    if (this._menuBlock) {
      this._menuBlock.setPosition(0, LOBBY_PANEL_Y, 0);
    }
    this._applyLobbyArt();
  }

  private _defaultGameName(): string {
    const prefix = RANDOM_NAME_PREFIXES[Math.floor(Math.random() * RANDOM_NAME_PREFIXES.length)];
    const suffix = RANDOM_NAME_SUFFIXES[Math.floor(Math.random() * RANDOM_NAME_SUFFIXES.length)];
    const num = Math.floor(10 + Math.random() * 90);
    return `${prefix}${suffix}${num}`;
  }

  private _formatRoomTitle(room: RoomVO): string {
    // 房间列表/房间标题统一用房主名字
    return room.hostNickname?.trim() || '玩家';
  }

  private _withGameName(room: RoomVO, gameName: string): RoomVO {
    const name = gameName.trim() || room.gameName?.trim() || '';
    if (!name) return room;
    return { ...room, gameName: name };
  }

  private _applyDefaultGameNameIfEmpty(): void {
    if (!this._gameNameInput || this._mode === 'room') return;
    const cur = this._gameNameInput.string?.trim();
    if (cur) return;
    this._gameNameInput.string = this._defaultGameName();
  }

  private _restoreGameName(): void {
    try {
      if (typeof wx !== 'undefined') {
        const nick = wx.getStorageSync?.(NICKNAME_STORAGE_KEY) as string;
        if (nick && this._gameNameInput) {
          this._gameNameInput.string = nick;
          return;
        }
        const legacy = wx.getStorageSync?.(GAME_NAME_STORAGE_KEY) as string;
        if (legacy && legacy !== '趣味对战' && this._gameNameInput) {
          this._gameNameInput.string = legacy;
          return;
        }
      }
    } catch {
      /* ignore */
    }
    this._applyDefaultGameNameIfEmpty();
  }

  private _persistNickname(): void {
    const name = this._nicknameOrDefault();
    try {
      if (typeof wx !== 'undefined') {
        wx.setStorageSync?.(NICKNAME_STORAGE_KEY, name);
      }
    } catch {
      /* ignore */
    }
  }

  private _nicknameOrDefault(): string {
    const name = this._gameNameInput?.string?.trim();
    return name || this._defaultGameName();
  }

  /** 将大厅昵称同步到用户表与房间内玩家槽位 */
  private async _commitNickname(): Promise<string> {
    const typed = (await this._gameNameInput?.commitValue())?.trim() || '';
    const nickname = typed || this._defaultGameName();
    if (this._gameNameInput) {
      this._gameNameInput.string = nickname;
    }
    this._persistNickname();
    try {
      await login(nickname);
    } catch (err) {
      console.warn('[Lobby] sync nickname', err);
    }
    return nickname;
  }

  private _onKeyboardHeight(heightPx: number): void {
    if (!this._menuRoot || this._mode !== 'menu') return;
    if (heightPx <= 0) {
      this._menuRoot.setPosition(0, 0, 0);
      return;
    }
    let shift = heightPx * 0.5;
    try {
      const sys = wx.getSystemInfoSync?.();
      if (sys?.windowWidth) {
        shift = (heightPx * 750) / sys.windowWidth;
      }
    } catch {
      /* use fallback */
    }
    this._menuRoot.setPosition(0, shift * 0.6, 0);
  }

  /**
   * 大厅 → 其他场景切换：立即显示 spinner，10s 未完成则提示网络较慢（AC-501）。
   * loadScene 延后一帧执行——若目标场景已在包内缓存，loadScene 几乎同步销毁当前
   * 场景（包括刚挂载的遮罩节点），spinner 会一帧都未渡染就被销毁；延后一帧让
   * spinner 先完成一次渲染。
   */
  private _gotoScene(text: string, load: () => void): void {
    LoadingOverlay.show(this.node, text, () => this._setStatus('加载较慢，请检查网络'));
    this.scheduleOnce(load, 0);
  }

  private _setStatus(text: string) {
    if (this._editorRoomUi && this._roomStatusLabel) {
      this._roomStatusLabel.string = text;
    } else if (this._statusLabel) {
      this._statusLabel.string = text;
    }
    if (this._mode === 'room' && !this._editorRoomUi) this._applyRoomLayout();
    console.log('[Lobby]', text);
  }

  private async _refreshUserBanner(prefix?: string): Promise<void> {
    try {
      if (typeof wx !== 'undefined') {
        await fetchProfile();
      }
    } catch (err) {
      console.warn('[Lobby] profile', err);
    }
    const u = GameSession.user;
    this._applyDefaultGameNameIfEmpty();
    if (this._mode === 'room' && prefix) {
      const line = u?.nickname || '未登录';
      this._setStatus(`${prefix}\n${line}`);
    } else if (this._mode === 'room') {
      this._setStatus(u?.nickname || '');
    } else if (this._statusLabel) {
      this._statusLabel.string = '';
    }
  }

  private _showMenu() {
    this._mode = 'menu';
    void applyScreenBackground(this.node, 'lobby');
    this._roomCtrl?.detachOnly();
    this._currentRoom = null;
    this._pendingGameName = '';
    this._applyMenuLayout();
    if (this._infoRoot) this._infoRoot.active = true;
    if (this._menuRoot) {
      this._menuRoot.active = true;
      this._menuRoot.setPosition(0, 0, 0);
    }
    if (this._roomRoot) this._roomRoot.active = false;
    // PVP（创建房间 / 房间列表）暂时关闭：不再展示输入框、也不轮询房间列表。
    void this._refreshUserBanner();
    void this._refreshCurrency();
  }

  /** 拉取并展示账户级货币（命运碎片 + 钻石），仅大厅菜单页可见（→ AC-20）。 */
  private async _refreshCurrency(): Promise<void> {
    try {
      const { meta } = await loadPveMeta();
      if (this._shardsLabel) this._shardsLabel.string = `💎${meta.destinyShards}`;
      if (this._diamondLabel) this._diamondLabel.string = `💰${meta.diamond}`;
    } catch (err) {
      console.warn('[Lobby] loadPveMeta', err);
    }
  }

  private _hideLobbyMenu(): void {
    void this._gameNameInput?.commitValue();
    this._gameNameInput?.dismiss();
    if (this._menuRoot) {
      this._menuRoot.active = false;
      this._menuRoot.setPosition(0, 0, 0);
    }
  }

  private _showRoom(room: RoomVO) {
    this._mode = 'room';
    void applyScreenBackground(this.node, 'room');
    this._currentRoom = room;
    this._stopListPoll();
    this._hideLobbyMenu();
    if (this._roomRoot) this._roomRoot.active = true;
    refreshScreenAdapt(this.node);
    this._applyRoomLayout();
    this._renderRoom(room);
    this._roomCtrl?.bind({
      onStatus: (t) => this._setStatus(t),
      onRoomUpdate: (r) =>
        this._renderRoom(this._withGameName(r, this._pendingGameName)),
      onDisbanded: () => {
        this._setStatus('房间已解散');
        this._showMenu();
      },
    });
    this._roomCtrl?.enterRoom(room.roomId);
  }

  private _isHost(room: RoomVO): boolean {
    return GameSession.user?.id === room.hostId;
  }

  private _playerBySeat(room: RoomVO, seat: number): PlayerSlotVO | null {
    return room.players.find((p) => p.seat === seat) ?? room.players[seat] ?? null;
  }

  private _playerSlotDisplayName(player: PlayerSlotVO, room: RoomVO): string {
    const isHost = player.userId === room.hostId;
    const name = player.nickname?.trim() || '玩家';
    return isHost ? `${name}（房主）` : name;
  }

  private _updatePlayerSlots(room: RoomVO): void {
    const rl = getRoomLayout();
    const useCardArt = !this._editorRoomUi && this._useRoomSlotArt();
    const useTags = !this._editorRoomUi && !!getCachedSprite('room/tag_room_host');
    const editorSlot = this._editorRoomUi;
    for (let seat = 0; seat < ROOM_SLOT_COUNT; seat++) {
      const ui = this._playerSlots[seat];
      if (!ui) continue;
      const player = this._playerBySeat(room, seat);
      const filled = !!player;
      if (editorSlot) {
        this._applyEditorSlotCard(ui.cardBg, ui.cardBgSize, filled);
      } else if (useCardArt) {
        this._applyRoomSlotCard(ui.root, filled, rl.slotW, rl.slotH);
      } else {
        this._drawRectStroke(
          ui.root,
          rl.slotW,
          rl.slotH,
          filled ? COLOR_SLOT_FILL : COLOR_SLOT_EMPTY,
          filled ? COLOR_SLOT_BORDER_FILL : COLOR_SLOT_BORDER,
        );
      }

      ui.pawnNode.active = filled;
      if (filled) {
        if (editorSlot) {
          const pawnUt = ui.pawnNode.getComponent(UITransform);
          const pawnW = pawnUt?.contentSize.width ?? rl.slotPawn;
          const pawnH = pawnUt?.contentSize.height ?? rl.slotPawn;
          this._applyRoomSlotPawn(ui.pawnNode, ui.seat, pawnW, pawnH);
          // 保证棋子画在 CardBg 之上；位置/尺寸仅认编辑器里 Pawn 节点
          const cardIdx = ui.root.getChildByName('CardBg')?.getSiblingIndex() ?? 0;
          ui.pawnNode.setSiblingIndex(cardIdx + 1);
        } else {
          this._applyRoomSlotPawn(ui.pawnNode, ui.seat, rl.slotPawn, rl.slotPawn);
          ui.pawnNode.setPosition(0, Math.round(rl.slotH * 0.1), 0);
        }
      }

      if (filled && player) {
        const name = player.nickname?.trim() || '玩家';
        if (editorSlot) {
          ui.nameLabel.node.active = false;
          ui.nameLabel.string = '';
          ui.metaLabel.node.active = true;
          ui.metaLabel.string = name;
          ui.metaLabel.color = new Color(255, 255, 255, 255);
        } else {
          ui.nameLabel.node.active = true;
          ui.metaLabel.node.active = false;
          ui.nameLabel.fontSize = Math.round(20 * Math.min(lobbyScale(), 1.2));
          ui.nameLabel.node.setPosition(0, -rl.slotH / 2 + 28, 0);
          ui.nameLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
          ui.pawnNode.setPosition(0, Math.round(rl.slotH * 0.1), 0);
          ui.nameLabel.string = useTags ? name : this._playerSlotDisplayName(player, room);
          ui.nameLabel.color = new Color(255, 255, 255, 255);
          ui.metaLabel.string = '';
        }
      } else if (useCardArt || editorSlot) {
        ui.nameLabel.node.active = true;
        ui.metaLabel.node.active = true;
        if (!editorSlot) {
          ui.nameLabel.fontSize = Math.round(24 * Math.min(lobbyScale(), 1.2));
          ui.metaLabel.fontSize = Math.round(18 * Math.min(lobbyScale(), 1.2));
          ui.nameLabel.node.setPosition(0, Math.round(rl.slotH * 0.06), 0);
          ui.metaLabel.node.setPosition(0, -rl.slotH / 2 + 34, 0);
        }
        ui.nameLabel.string = '空位';
        ui.nameLabel.color = new Color(255, 255, 255, 255);
        ui.metaLabel.string = '等待加入';
        ui.metaLabel.color = new Color(210, 215, 228, 255);
      } else {
        ui.nameLabel.node.active = true;
        ui.metaLabel.node.active = true;
        ui.nameLabel.fontSize = UI.slotNameFont;
        ui.metaLabel.fontSize = UI.slotMetaFont;
        ui.nameLabel.node.setPosition(-rl.slotW / 2 + 58, -rl.slotH * 0.12, 0);
        ui.metaLabel.node.setPosition(0, -rl.slotH / 2 + 14, 0);
        ui.nameLabel.string = '空位';
        ui.nameLabel.color = new Color(120, 125, 140, 255);
        ui.metaLabel.string = '等待加入';
        ui.metaLabel.color = new Color(130, 135, 150, 255);
      }
    }
    this._updateSlot0HostTag(room);
  }

  private _renderRoom(room: RoomVO) {
    this._currentRoom = room;
    const isHost = this._isHost(room);
    if (this._roomSubLabel) {
      this._roomSubLabel.string = `房间号 ${room.roomCode} · ${room.players.length}/${room.maxPlayers} 人`;
    }

    this._updatePlayerSlots(room);

    if (this._hostBtnRoot) this._hostBtnRoot.active = isHost;
    if (this._guestBtnRoot) this._guestBtnRoot.active = !isHost;

    const canStart = room.players.length >= 2;
    this._setBtnEnabled(this._startBtn, canStart, new Color(180, 60, 60, 255));

    if (this._matchBtn && isHost) {
      const lbl = this._matchBtn.getChildByName('Label')?.getComponent(Label);
      if (lbl) {
        lbl.string = room.matchFill ? '关闭在线匹配' : '在线匹配';
        if (this._editorRoomUi) {
          lbl.overflow = Label.Overflow.SHRINK;
          lbl.enableWrapText = false;
        }
      }
      if (!this._editorRoomUi) {
        this._applyHostRoomBtnSizes(getRoomLayout());
      }
    }

    if (room.status === 'PLAYING' && room.gameId) {
      this._roomCtrl?.markEnteringGame();
      GameSession.gameId = String(room.gameId);
      this._gotoScene('对局开始，进入棋盘…', () => SceneLoader.loadBoard());
      return;
    }

    const need = Math.max(0, 2 - room.players.length);
    if (isHost) {
      this._setStatus(
        room.matchFill
          ? `在线匹配中 · 还差 ${need} 人可开局`
          : need > 0
            ? `等待玩家加入（至少还需 ${need} 人）`
            : '可以开始游戏',
      );
    } else {
      this._setStatus('等待房主开始游戏…');
    }
  }

  private _onTryStart(): void {
    const room = this._currentRoom;
    if (!room || room.players.length < 2) {
      this._setStatus('至少 2 人才能开始');
      return;
    }
    void this._roomCtrl?.tryStart();
  }

  private async _onCreate() {
    try {
      this._gameNameInput?.blurForAction();
      const nickname = await this._commitNickname();
      this._pendingGameName = nickname;

      this._setStatus(`创建房间「${nickname}」…`);
      const res = await createRoom(nickname, nickname);
      if (res.room) {
        this._hideLobbyMenu();
        this._showRoom(this._withGameName(res.room, nickname));
      }
    } catch (err: unknown) {
      this._setStatus(err instanceof Error ? err.message : String(err));
      this._gameNameInput?.show();
      if (this._menuRoot) this._menuRoot.active = true;
    }
  }

  private async _autoJoin(roomCode: string) {
    try {
      this._gameNameInput?.blurForAction();
      const nickname = await this._commitNickname();
      this._setStatus(`加入房间 ${roomCode}…`);
      const res = await joinRoom(roomCode, nickname);
      if (res.room) {
        this._showRoom(res.room);
      }
    } catch (err: unknown) {
      this._setStatus(err instanceof Error ? err.message : String(err));
    }
  }

  private async _onJoinFromList(room: RoomVO) {
    try {
      this._gameNameInput?.blurForAction();
      const nickname = await this._commitNickname();
      this._setStatus(`加入 ${this._formatRoomTitle(room)}…`);
      const res = await joinRoom(room.roomCode, nickname);
      if (res.room) {
        this._showRoom(res.room);
      }
    } catch (err: unknown) {
      this._setStatus(err instanceof Error ? err.message : String(err));
    }
  }

  private async _onToggleMatchFill() {
    const room = this._currentRoom;
    if (!room || !this._isHost(room)) return;
    try {
      const enabled = !room.matchFill;
      const res = await setRoomMatchFill(room.roomId, enabled);
      if (res.room) {
        this._currentRoom = res.room;
        this._renderRoom(res.room);
      }
      if (enabled) {
        this._setStatus('已开启在线匹配，等待玩家加入');
      }
    } catch (err: unknown) {
      this._setStatus(err instanceof Error ? err.message : String(err));
    }
  }

  private async _onDisband() {
    const room = this._currentRoom;
    if (!room || !this._isHost(room)) return;
    try {
      await disbandRoom(room.roomId);
      this._roomCtrl?.detachOnly();
      this._setStatus('房间已解散');
      this._showMenu();
    } catch (err: unknown) {
      this._setStatus(err instanceof Error ? err.message : String(err));
    }
  }

  private async _onExitRoom() {
    const roomId = this._currentRoom?.roomId;
    try {
      if (roomId) {
        await leaveRoom(roomId);
      }
    } catch (err: unknown) {
      this._setStatus(err instanceof Error ? err.message : String(err));
      return;
    }
    this._roomCtrl?.detachOnly();
    this._showMenu();
  }

  private _onShare() {
    const code = this._currentRoom?.roomCode;
    if (!code) {
      this._setStatus('请先进入房间');
      return;
    }
    shareRoom(code);
    this._setStatus(`已调起分享，房间号 ${code}`);
  }

  private _startListPoll() {
    this._stopListPoll();
    this._listPollTimer = setInterval(() => void this._refreshRoomList(), 4000);
    // 进入大厅先清空列表，避免显示上一次缓存
    this._applyRoomListUi([]);
    void this._refreshRoomList();
  }

  private _stopListPoll() {
    if (this._listPollTimer) {
      clearInterval(this._listPollTimer);
      this._listPollTimer = null;
    }
  }

  private _dedupeRooms(rooms: RoomVO[]): RoomVO[] {
    const seen = new Set<string>();
    return rooms.filter((r) => {
      if (seen.has(r.roomId)) return false;
      seen.add(r.roomId);
      return true;
    });
  }

  private _applyRoomListUi(rooms: RoomVO[]): void {
    const listStep = UI.listBtnH + Math.round(8 * S);
    this._listRoomsCache = rooms;
    this._listRowNodes.forEach((row) => {
      row.active = false;
      row.off(Button.EventType.CLICK);
    });

    if (this._listEmptyLabel) {
      this._listEmptyLabel.node.active = rooms.length === 0;
    }

    const totalPages = Math.max(1, Math.ceil(rooms.length / LIST_MAX_ROWS));
    if (this._listPage >= totalPages) this._listPage = totalPages - 1;
    const start = this._listPage * LIST_MAX_ROWS;
    const pageRooms = rooms.slice(start, start + LIST_MAX_ROWS);

    const canPage = rooms.length > LIST_MAX_ROWS;
    if (this._listPrevBtn) this._listPrevBtn.active = canPage;
    if (this._listNextBtn) this._listNextBtn.active = canPage;
    if (this._listPrevBtn) this._setBtnEnabled(this._listPrevBtn, this._listPage > 0, new Color(55, 95, 140, 255));
    if (this._listNextBtn) this._setBtnEnabled(this._listNextBtn, this._listPage < totalPages - 1, new Color(55, 95, 140, 255));

    const showCount = Math.min(pageRooms.length, LIST_MAX_ROWS);
    for (let i = 0; i < showCount; i++) {
      const room = pageRooms[i];
      const row = this._listRowNodes[i];
      if (!room || !row) continue;

      row.active = true;
      row.setPosition(new Vec3(0, -i * listStep, 0));

      const lbl = row.getChildByName('Label')?.getComponent(Label);
      if (lbl) {
        const title = this._formatRoomTitle(room);
        const tag = room.matchFill ? '[匹配中] ' : '';
        lbl.string = `${tag}${title} · ${room.players.length}/${room.maxPlayers}人`;
      }
      row.on(Button.EventType.CLICK, () => void this._onJoinFromList(room), this);
    }
  }

  private async _refreshRoomList(manual = false) {
    if (this._mode !== 'menu') return;
    if (manual) {
      this._setStatus('刷新房间列表…');
    }
    try {
      const res = await listRooms();
      const rooms = this._dedupeRooms(res.rooms || []);
      this._applyRoomListUi(rooms);
      if (manual) {
        const u = GameSession.user?.nickname || '玩家';
        this._setStatus(rooms.length ? `共 ${rooms.length} 个房间\n${u}` : `暂无房间\n${u}`);
      }
    } catch (err) {
      console.warn('[Lobby] list rooms', err);
      if (manual) {
        this._setStatus(err instanceof Error ? err.message : String(err));
      }
    }
  }

  onDestroy() {
    this._stopListPoll();
    this._unbindWindowResize?.();
    this._unbindWindowResize = null;
  }
}
