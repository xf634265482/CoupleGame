import {
  _decorator,
  assetManager,
  Button,
  Color,
  Component,
  EventTouch,
  Graphics,
  ImageAsset,
  Label,
  Mask,
  Node,
  ScrollView,
  Sprite,
  SpriteFrame,
  Texture2D,
  UITransform,
  Vec3,
} from 'cc';
import { SceneLoader } from '../core/SceneLoader';
import { GameSession } from '../core/GameSession';
import { login } from '../platform/wechat/WxAuth';
import {
  loadPveLeaderboard,
  loadPveMeta,
  loadPveSave,
  type PveLeaderboardEntry,
} from '../network/PveService';
import { playMainBgm, stopMainBgm } from '../audio/BgmController';
import {
  applyScreenBackground,
  ensureResourcesBundle,
  getCachedSprite,
  preloadPveLobbyUi,
} from '../ui/UiAssets';
import { ensureArtChild, ensureArtSliced, ensureArtStretch } from '../ui/UiSprite';
import { LoadingOverlay } from '../ui/LoadingOverlay';
import {
  applyUiLayerTree,
  bindWindowResize,
  refreshScreenAdapt,
  visibleDesignSize,
} from '../platform/wechat/ViewAdapt';
import { lockPortrait } from '../platform/wechat/WxLandscape';
import {
  PVE_STAMINA_MAX,
  PVE_STAMINA_RECOVERY_MS,
  PVE_STAMINA_RUN_COST,
} from '../pve/core/PveConstants';

const { ccclass } = _decorator;

interface WxProfileApi {
  getUserProfile?: (opts: {
    desc: string;
    success?: (res: { userInfo?: { nickName?: string; avatarUrl?: string } }) => void;
    fail?: (err: unknown) => void;
  }) => void;
  showModal?: (opts: {
    title?: string;
    content?: string;
    editable?: boolean;
    placeholderText?: string;
    success?: (res: { confirm?: boolean; content?: string }) => void;
    fail?: () => void;
  }) => void;
}

const LOGO_W = 560;
const LOGO_H = 208;
const NAV_Y_OFFSET = 112;
type LobbyAssetIconKind = 'shards' | 'diamond' | 'stamina';

@ccclass('PveLobbyController')
export class PveLobbyController extends Component {
  private _logo: Node | null = null;
  private _shardsLabel: Label | null = null;
  private _diamondLabel: Label | null = null;
  private _staminaLabel: Label | null = null;
  private _staminaTimerLabel: Label | null = null;
  // 新版玩家卡：副标题行合并"最高 N 层 · 全服第 N 名"为一行 _metaLine
  private _metaLine: Label | null = null;
  private _metaFloor = 0;
  private _metaRank: number | null = null;
  private _avatarNode: Node | null = null;
  private _avatarTextLabel: Label | null = null;
  private _nicknameLabel: Label | null = null;
  private _profileModal: Node | null = null;
  private _profileBusy = false;
  private _expeditionCostLabel: Label | null = null;
  private _statusLabel: Label | null = null;
  private _leaderboardModal: Node | null = null;
  private _leaderboardEntries: PveLeaderboardEntry[] | null = null;
  private _myRank: number | null = null;
  private _unbindResize: (() => void) | null = null;
  private _buttonSpriteKeys = new Map<Node, string>();
  private _navIconKeys = new Map<Node, string>();
  private _stamina = PVE_STAMINA_MAX;
  private _staminaMax = PVE_STAMINA_MAX;
  private _staminaNextRecoveryAt: number | null = null;
  private _nextRunCost = PVE_STAMINA_RUN_COST;
  private _hasActiveSave = false;
  private _busy = false;

  onLoad(): void {
    lockPortrait();
    this.node.getChildByName('RoomRoot')?.destroy();
    this.node.getChildByName('PveLobbyRoot')?.destroy();
    refreshScreenAdapt(this.node);
    this._buildUi();
    applyUiLayerTree(this.node, this.node.layer);

    const relayout = () => {
      refreshScreenAdapt(this.node);
      void applyScreenBackground(this.node, 'lobby');
    };
    this.scheduleOnce(relayout, 0);
    this.scheduleOnce(relayout, 0.12);
    this.scheduleOnce(relayout, 0.35);
    this._unbindResize = bindWindowResize(this.node, relayout);
    this.schedule(this._tickStamina, 1);

    void this._loadArt();
    void this._refreshLobbyData();
    void this._refreshRank();
  }

  private _buildUi(): void {
    const { h } = visibleDesignSize();
    const root = new Node('PveLobbyRoot');
    root.setParent(this.node);

    this._buildTopBar(root, h / 2 - 185);

    this._logo = new Node('LobbyLogo');
    this._logo.setParent(root);
    this._logo.setPosition(0, 265, 0);
    this._logo.addComponent(UITransform).setContentSize(LOGO_W, LOGO_H);

    this._buildBottomNav(root, -h / 2 + NAV_Y_OFFSET);

    this._statusLabel = this._makeLabel(root, 'Status', -h / 2 + 210, 22, 500, 36);
    this._statusLabel.color = new Color(240, 248, 255, 230);
    this._statusLabel.string = '';
  }

  private _buildTopBar(root: Node, y: number): void {
    // 玩家卡布局（v3，两行式）：
    //   Row1：[头像] 昵称（大号粗体）
    //   Row2：最高 N 层 · 全服第 N 名（副标题，等宽点分割）
    // 卡高对齐右侧资源 chip 行视觉，不再"挤压得很高"。
    const CARD_W = 290;
    const CARD_H = 84;
    const AVATAR_SIZE = 52;
    const playerCard = new Node('PlayerCard');
    playerCard.setParent(root);
    playerCard.setPosition(-216, y, 0);
    playerCard.addComponent(UITransform).setContentSize(CARD_W, CARD_H);
    this._drawRoundedRect(
      playerCard,
      CARD_W,
      CARD_H,
      14,
      new Color(10, 38, 78, 170),
      new Color(120, 205, 255, 210),
    );

    // ── Row1 头像（左上区域）──
    const AVATAR_X = -CARD_W / 2 + 12 + AVATAR_SIZE / 2;
    const AVATAR_Y = CARD_H / 2 - 12 - AVATAR_SIZE / 2; // 紧贴顶部
    const avatar = new Node('Avatar');
    avatar.setParent(playerCard);
    avatar.setPosition(AVATAR_X, AVATAR_Y, 0);
    avatar.addComponent(UITransform).setContentSize(AVATAR_SIZE, AVATAR_SIZE);
    const avatarG = avatar.addComponent(Graphics);
    avatarG.fillColor = new Color(50, 160, 230, 255);
    avatarG.roundRect(-AVATAR_SIZE / 2, -AVATAR_SIZE / 2, AVATAR_SIZE, AVATAR_SIZE, 8);
    avatarG.fill();
    avatarG.strokeColor = new Color(255, 220, 110, 255);
    avatarG.lineWidth = 2;
    avatarG.roundRect(-AVATAR_SIZE / 2 + 1, -AVATAR_SIZE / 2 + 1, AVATAR_SIZE - 2, AVATAR_SIZE - 2, 7);
    avatarG.stroke();
    const avatarText = this._makeLabel(avatar, 'AvatarText', 0, 26, AVATAR_SIZE, AVATAR_SIZE);
    avatarText.string = (GameSession.user?.nickname || '玩').slice(0, 1);
    avatarText.isBold = true;
    this._avatarNode = avatar;
    this._avatarTextLabel = avatarText;

    // ── Row1 昵称（头像右侧，与头像同一水平线垂直居中）──
    const NAME_LEFT = AVATAR_X + AVATAR_SIZE / 2 + 10;
    const NAME_W = CARD_W / 2 - NAME_LEFT - 12;
    const nickname = this._makeLabel(playerCard, 'Nickname', 0, 24, NAME_W, 30);
    nickname.node.setPosition(NAME_LEFT + NAME_W / 2, AVATAR_Y, 0);
    nickname.horizontalAlign = Label.HorizontalAlign.LEFT;
    nickname.string = GameSession.user?.nickname ?? '玩家';
    nickname.color = new Color(245, 250, 255, 255);
    nickname.isBold = true;
    this._nicknameLabel = nickname;

    // ── Row2 副标题：最高 N 层 · 全服第 N 名（整行横跨卡片，居中） ──
    const META_Y = -CARD_H / 2 + 16;
    this._metaLine = this._makeLabel(playerCard, 'MetaLine', 0, 18, CARD_W - 24, 22);
    this._metaLine.node.setPosition(0, META_Y, 0);
    this._metaLine.horizontalAlign = Label.HorizontalAlign.CENTER;
    this._metaLine.color = new Color(255, 226, 130, 255);
    this._metaLine.isBold = true;
    this._updateMetaLine();

    // 点击 PlayerCard 任意位置触发改名 / 同步微信账号菜单（→ 用户需求 2026-06-23）。
    this._bindButton(playerCard, () => this._showProfileMenu());

    // 若已存在远程头像 URL，尝试加载
    if (GameSession.user?.avatarUrl) {
      void this._applyRemoteAvatar(GameSession.user.avatarUrl);
    }

    const assetStrip = new Node('TopAssetStrip');
    assetStrip.setParent(root);
    assetStrip.setPosition(98, y, 0);
    assetStrip.addComponent(UITransform).setContentSize(458, 72);

    this._shardsLabel = this._makeResourceChip(assetStrip, 'Shards', -150, 0, 'shards');
    this._diamondLabel = this._makeResourceChip(assetStrip, 'Diamond', 0, 0, 'diamond');
    this._staminaLabel = this._makeResourceChip(assetStrip, 'StaminaChip', 150, 0, 'stamina');
    const staminaChip = assetStrip.getChildByName('StaminaChip');
    if (staminaChip) {
      const timerBg = new Node('TimerBg');
      timerBg.setParent(staminaChip);
      timerBg.setPosition(24, -24, 0);
      timerBg.addComponent(UITransform).setContentSize(86, 18);
      this._drawRoundedRect(
        timerBg,
        86,
        18,
        9,
        new Color(6, 25, 53, 150),
      );
      this._staminaTimerLabel = this._makeLabel(timerBg, 'StaminaTimer', 0, 12, 80, 16);
      this._staminaTimerLabel.color = new Color(206, 236, 255, 210);
    }
  }

  private _buildBottomNav(root: Node, y: number): void {
    const dock = new Node('BottomDock');
    dock.setParent(root);
    dock.setPosition(0, y, 0);
    dock.addComponent(UITransform).setContentSize(700, 180);
    this._drawRoundedRect(
      dock,
      700,
      180,
      28,
      new Color(8, 28, 62, 218),
      new Color(105, 180, 235, 220),
    );

    const navButtonW = 188;
    const navButtonH = 142;
    const navGap = 34;
    const navStep = navButtonW + navGap;
    this._makeNavButton(
      dock,
      '排行榜',
      'pve/lobby/icon_nav_leaderboard',
      -navStep,
      -4,
      navButtonW,
      navButtonH,
      () => void this._showLeaderboard(),
    );
    this._makeNavButton(
      dock,
      '远征',
      'pve/lobby/icon_nav_expedition',
      0,
      -4,
      navButtonW,
      navButtonH,
      () => void this._enterExpedition(),
    );
    this._makeNavButton(
      dock,
      '命运树',
      'pve/lobby/icon_nav_destiny_tree',
      navStep,
      -4,
      navButtonW,
      navButtonH,
      () => this._gotoScene('加载命运树…', () => SceneLoader.loadDestinyTree()),
    );
    this._expeditionCostLabel = this._makeLabel(dock, 'ExpeditionCost', -76, 15, 320, 22);
    this._expeditionCostLabel.color = new Color(255, 226, 130, 255);
    this._expeditionCostLabel.string = `新远征 · 消耗 ${PVE_STAMINA_RUN_COST} 体力`;
  }

  private async _loadArt(): Promise<void> {
    const bundle = await ensureResourcesBundle();
    if (!bundle) {
      this._setStatus('资源包加载失败，请清缓存后重试');
      return;
    }
    void playMainBgm(bundle);
    await preloadPveLobbyUi();
    await applyScreenBackground(this.node, 'lobby');

    const logo = getCachedSprite('pve/lobby/logo_destiny_tower');
    if (logo && this._logo?.isValid) {
      ensureArtChild(this._logo, 'LogoArt', logo, LOGO_W, LOGO_H);
    }
    for (const [iconNode, key] of this._navIconKeys) {
      const frame = getCachedSprite(key);
      if (!frame || !iconNode.isValid) continue;
      const size = key === 'pve/lobby/icon_nav_expedition' ? 82 : 76;
      ensureArtChild(iconNode, 'IconArt', frame, size, size);
    }
    this._applyTopAssetStripArt();
    this._applyButtonArt(this.node);
  }

  private async _refreshLobbyData(): Promise<void> {
    try {
      const [metaRes, saveRes] = await Promise.all([loadPveMeta(), loadPveSave()]);
      const { meta } = metaRes;
      this._hasActiveSave = Boolean(saveRes.save) || meta.hasPendingRun === true;
      this._stamina = meta.stamina ?? PVE_STAMINA_MAX;
      this._staminaMax = meta.staminaMax ?? PVE_STAMINA_MAX;
      this._staminaNextRecoveryAt = meta.staminaNextRecoveryAt ?? null;
      this._nextRunCost = this._hasActiveSave ? 0 : (meta.nextRunCost ?? PVE_STAMINA_RUN_COST);

      if (this._shardsLabel) this._shardsLabel.string = String(meta.destinyShards);
      if (this._diamondLabel) this._diamondLabel.string = String(meta.diamond);
      this._metaFloor = meta.highestFloor ?? 0;
      this._updateMetaLine();
      if (this._expeditionCostLabel) {
        this._expeditionCostLabel.string = this._hasActiveSave
          ? '继续远征 · 不消耗体力'
          : this._nextRunCost === 0
            ? '首次远征免费'
            : `新远征 · 消耗 ${this._nextRunCost} 体力`;
      }
      this._updateStaminaLabels();
    } catch (err: unknown) {
      this._setStatus(`大厅数据加载失败：${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async _enterExpedition(): Promise<void> {
    if (this._busy) return;
    if (!this._hasActiveSave && this._stamina < this._nextRunCost) {
      this._setStatus(`体力不足，新远征需要 ${this._nextRunCost} 点体力`);
      return;
    }
    this._gotoScene(
      this._hasActiveSave ? '继续远征…' : '开启新远征…',
      () => SceneLoader.loadPveExpedition(),
    );
  }

  private async _refreshRank(): Promise<void> {
    try {
      const res = await loadPveLeaderboard(20);
      this._leaderboardEntries = res.entries;
      this._myRank = res.myRank ?? null;
      this._metaRank = this._myRank;
      this._updateMetaLine();
    } catch {
      // 排名加载失败不影响大厅其他功能
    }
  }

  /** 合并最高层 + 全服排名为一行副标题；任一字段更新都走这里。 */
  private _updateMetaLine(): void {
    if (!this._metaLine) return;
    const floor = `最高 ${this._metaFloor} 层`;
    const rank = this._metaRank != null ? `全服第 ${this._metaRank} 名` : '未上榜';
    this._metaLine.string = `${floor} · ${rank}`;
  }

  private async _showLeaderboard(): Promise<void> {
    if (this._leaderboardModal?.isValid) return;
    if (this._leaderboardEntries) {
      this._buildLeaderboardModal(this._leaderboardEntries, this._myRank);
      return;
    }
    if (this._busy) return;
    this._busy = true;
    try {
      const res = await loadPveLeaderboard(20);
      this._leaderboardEntries = res.entries;
      this._myRank = res.myRank ?? null;
      this._metaRank = this._myRank;
      this._updateMetaLine();
      this._buildLeaderboardModal(this._leaderboardEntries, this._myRank);
    } catch (err: unknown) {
      this._setStatus(`排行榜加载失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this._busy = false;
    }
  }

  private _buildLeaderboardModal(entries: PveLeaderboardEntry[], myRank: number | null): void {
    const { h } = visibleDesignSize();
    const overlay = new Node('LeaderboardModal');
    overlay.setParent(this.node);
    overlay.addComponent(UITransform).setContentSize(720, h);
    this._drawRect(overlay, 720, h, new Color(0, 8, 24, 185));
    this._leaderboardModal = overlay;

    const PANEL_W = 600;
    const PANEL_H = 780;
    const panel = new Node('Panel');
    panel.setParent(overlay);
    panel.addComponent(UITransform).setContentSize(PANEL_W, PANEL_H);
    // 全透明风格（与游戏内玩家状态卡同款 α≈170）
    this._drawRoundedRect(
      panel,
      PANEL_W,
      PANEL_H,
      28,
      new Color(12, 42, 86, 170),
      new Color(255, 205, 85, 240),
    );

    const title = this._makeLabel(panel, 'Title', 0, 38, 520, 54);
    title.node.setPosition(0, 348, 0);
    title.string = '命运之塔排行榜';
    title.color = new Color(255, 220, 105, 255);
    title.isBold = true;

    const rankText = myRank != null ? `我的排名：全服第 ${myRank} 名` : '我尚未上榜';
    const subtitle = this._makeLabel(panel, 'Subtitle', 0, 20, 500, 32);
    subtitle.node.setPosition(0, 304, 0);
    subtitle.string = rankText;
    subtitle.color = new Color(170, 215, 255, 220);
    subtitle.isBold = true;

    // 可滚动列表区域：行高 + 行距加大，避免名字贴在一起
    const ROW_H = 60;
    const ROW_GAP = 14;
    const ROW_STEP = ROW_H + ROW_GAP;
    const SV_W = 548;
    const SV_H = 560;
    const CONTENT_H = Math.max(SV_H, entries.length * ROW_STEP);

    const svNode = new Node('ScrollArea');
    svNode.setParent(panel);
    svNode.setPosition(0, 12, 0);
    svNode.addComponent(UITransform).setContentSize(SV_W, SV_H);

    const sv = svNode.addComponent(ScrollView);
    sv.horizontal = false;
    sv.vertical = true;
    sv.inertia = true;
    sv.brake = 0.75;
    (sv as ScrollView & { elasticScale?: number }).elasticScale = 0.1;

    const viewNode = new Node('View');
    viewNode.setParent(svNode);
    viewNode.addComponent(UITransform).setContentSize(SV_W, SV_H);
    viewNode.addComponent(Mask);

    const contentNode = new Node('Content');
    contentNode.setParent(viewNode);
    contentNode.addComponent(UITransform).setContentSize(SV_W, CONTENT_H);
    // top-anchor：第一行从 content 顶部开始
    contentNode.setPosition(0, (CONTENT_H - SV_H) / 2, 0);

    // 注意：Cocos 3.x ScrollView.view 是只读 getter（自动取 content.parent），不可赋值；
    // 只设 content 即可，view 会自动绑定为 viewNode。
    sv.content = contentNode;

    if (entries.length === 0) {
      const empty = this._makeLabel(contentNode, 'Empty', 0, 24, 500, 50);
      empty.node.setPosition(0, 0, 0);
      empty.string = '暂无排行数据';
    }

    entries.forEach((entry, index) => {
      const isSelf = myRank != null && entry.rank === myRank;
      const rowY = CONTENT_H / 2 - ROW_H / 2 - index * ROW_STEP;
      const row = new Node(`Row_${entry.rank}`);
      row.setParent(contentNode);
      row.setPosition(0, rowY, 0);
      row.addComponent(UITransform).setContentSize(SV_W - 16, ROW_H);

      // 排行榜行底色配合面板全透明，仅保留 α≈110 用于行间分隔
      const rowBg = isSelf
        ? new Color(30, 100, 200, 150)
        : index % 2 === 0
          ? new Color(28, 72, 128, 110)
          : new Color(18, 56, 106, 110);
      const rowStroke = isSelf ? new Color(130, 210, 255, 240) : undefined;
      this._drawRoundedRect(row, SV_W - 16, ROW_H, 10, rowBg, rowStroke);

      // 名次徽章（只画奖牌色圈 + 数字；不再放头像）
      const badgeNode = new Node('Badge');
      badgeNode.setParent(row);
      badgeNode.setPosition(-225, 0, 0);
      badgeNode.addComponent(UITransform).setContentSize(48, 48);
      const badgeG = badgeNode.addComponent(Graphics);
      const medalColor = entry.rank === 1
        ? new Color(255, 215, 60, 255)
        : entry.rank === 2
          ? new Color(192, 205, 220, 255)
          : entry.rank === 3
            ? new Color(205, 130, 60, 255)
            : new Color(50, 90, 140, 0);
      if (entry.rank <= 3) {
        badgeG.fillColor = medalColor;
        badgeG.circle(0, 0, 20);
        badgeG.fill();
      }
      const rankLabel = this._makeLabel(badgeNode, 'RankNum', 0, entry.rank <= 3 ? 20 : 22, 48, 48);
      rankLabel.string = entry.rank <= 3 ? String(entry.rank) : `#${entry.rank}`;
      rankLabel.color = entry.rank <= 3 ? new Color(12, 30, 60, 255) : new Color(180, 210, 245, 255);
      rankLabel.isBold = true;

      // 昵称（占据原头像位置，左对齐，加粗）
      const nameLabel = this._makeLabel(row, 'Name', 0, 24, 320, ROW_H - 12);
      nameLabel.node.setPosition(-30, 0, 0);
      nameLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
      nameLabel.string = entry.nickname;
      nameLabel.color = isSelf ? new Color(200, 235, 255, 255) : new Color(228, 240, 255, 255);
      nameLabel.isBold = true;

      // 层数
      const floorLabel = this._makeLabel(row, 'Floor', 0, 24, 110, ROW_H - 12);
      floorLabel.node.setPosition(208, 0, 0);
      floorLabel.string = `${entry.highestFloor} 层`;
      floorLabel.color = entry.rank <= 3
        ? new Color(255, 220, 105, 255)
        : new Color(200, 230, 255, 220);
      floorLabel.isBold = true;
    });

    // 关闭按钮：与玩家状态卡同款半透明（α≈170 + 金色描边），避免遮挡面板的全透明视觉
    const closeNode = new Node('Btn_Close');
    closeNode.setParent(panel);
    closeNode.setPosition(0, -350, 0);
    closeNode.addComponent(UITransform).setContentSize(180, 60);
    this._drawRoundedRect(
      closeNode,
      180,
      60,
      14,
      new Color(52, 73, 95, 170),
      new Color(255, 214, 110, 240),
    );
    const closeLabel = this._makeLabel(closeNode, 'Label', 0, 28, 168, 52);
    closeLabel.string = '关闭';
    closeLabel.isBold = true;
    this._bindButton(closeNode, () => this._closeLeaderboard());

    applyUiLayerTree(overlay, this.node.layer);
  }

  private _closeLeaderboard(): void {
    this._leaderboardModal?.destroy();
    this._leaderboardModal = null;
  }

  // ── 资料卡（昵称 + 头像）─────────────────────────────────
  // 点击 PlayerCard 弹出菜单：手动改名 / 同步微信账号。改完后排行榜读 users.nickname/avatarUrl
  // 即刻生效（云端 listPveLeaderboard 是实时查询）。
  private _showProfileMenu(): void {
    if (this._profileBusy || this._profileModal) return;
    const { h } = visibleDesignSize();
    const overlay = new Node('ProfileModal');
    overlay.setParent(this.node);
    overlay.addComponent(UITransform).setContentSize(720, h);
    this._drawRect(overlay, 720, h, new Color(0, 8, 24, 185));
    this._profileModal = overlay;
    // 点空白处关闭：用 TOUCH_END 监听 + 校验 target 必须是 overlay 本身，
    // 避免内层按钮的触摸事件冒泡到这里把弹窗一起关掉（之前同步按钮"没效果"就是这个）。
    overlay.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      if (e.target === overlay) this._closeProfileMenu();
    });

    const PANEL_W = 520;
    const PANEL_H = 360;
    const panel = new Node('Panel');
    panel.setParent(overlay);
    panel.addComponent(UITransform).setContentSize(PANEL_W, PANEL_H);
    this._drawRoundedRect(
      panel,
      PANEL_W,
      PANEL_H,
      24,
      new Color(12, 42, 86, 170),
      new Color(255, 205, 85, 240),
    );
    // 拦住点在 panel 空白处的事件，不让冒到 overlay 触发关闭
    panel.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
    });

    const title = this._makeLabel(panel, 'Title', 0, 32, 460, 44);
    title.node.setPosition(0, 130, 0);
    title.string = '修改头像和昵称';
    title.color = new Color(255, 220, 105, 255);

    const tip = this._makeLabel(panel, 'Tip', 0, 22, 460, 28);
    tip.node.setPosition(0, 85, 0);
    tip.string = '当前：' + (GameSession.user?.nickname ?? '玩家');
    tip.color = new Color(170, 215, 255, 220);

    this._makeTransparentButton(panel, '同步微信账号（昵称 + 头像）', 0, 20, 420, 64, () => {
      void this._syncWxProfile();
    });
    this._makeTransparentButton(panel, '手动改名', 0, -60, 420, 64, () => {
      void this._editNicknameManually();
    });
    this._makeTransparentButton(panel, '取消', 0, -140, 200, 56, () => this._closeProfileMenu());

    applyUiLayerTree(overlay, this.node.layer);
  }

  /** 与玩家状态卡同款的半透明圆角按钮（α≈170 + 金色描边），点击后阻止事件冒泡。 */
  private _makeTransparentButton(
    parent: Node,
    text: string,
    x: number,
    y: number,
    width: number,
    height: number,
    onClick: () => void,
  ): void {
    const node = new Node(`Btn_${text}`);
    node.setParent(parent);
    node.setPosition(x, y, 0);
    node.addComponent(UITransform).setContentSize(width, height);
    this._drawRoundedRect(
      node,
      width,
      height,
      14,
      new Color(52, 73, 95, 170),
      new Color(255, 214, 110, 240),
    );
    const label = this._makeLabel(node, 'Label', 0, Math.min(28, height - 8), width - 12, height - 8);
    label.string = text;
    label.isBold = true;
    // 阻止冒泡：避免冒到 overlay 触发关闭
    node.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
    });
    this._bindButton(node, onClick);
  }

  private _closeProfileMenu(): void {
    this._profileModal?.destroy();
    this._profileModal = null;
  }

  private async _editNicknameManually(): Promise<void> {
    if (this._profileBusy) return;
    const current = GameSession.user?.nickname ?? '';
    const nick = await this._promptText('输入新的昵称（最多 12 个字符）', current);
    if (!nick) return;
    const trimmed = nick.trim().slice(0, 12);
    if (!trimmed) {
      this._setStatus('昵称不能为空');
      return;
    }
    await this._applyProfileUpdate(trimmed, undefined);
  }

  private async _syncWxProfile(): Promise<void> {
    if (this._profileBusy) return;
    const wxApi = this._wxApi();
    if (!wxApi?.getUserProfile) {
      this._setStatus('当前环境不支持微信登录（请在微信内打开）');
      return;
    }
    this._profileBusy = true;
    try {
      const res = await new Promise<{ userInfo?: { nickName?: string; avatarUrl?: string } }>(
        (resolve, reject) => {
          wxApi.getUserProfile!({
            desc: '用于显示昵称和头像',
            success: resolve,
            // 微信 fail 回调传入 { errMsg, errno }；带上 errno 一起包到 message 里供后面区分。
            fail: (err: { errMsg?: string; errno?: number }) => {
              const e = new Error(err?.errMsg ?? '微信授权失败') as Error & { errno?: number };
              e.errno = err?.errno;
              reject(e);
            },
          });
        },
      );
      const nick = res.userInfo?.nickName?.trim().slice(0, 12);
      const url = res.userInfo?.avatarUrl ?? '';
      if (!nick) {
        this._setStatus('未获取到微信昵称');
        return;
      }
      await this._applyProfileUpdate(nick, url);
    } catch (err) {
      const msg = this._formatErr(err);
      const errno = (err as { errno?: number })?.errno;
      // 1026 = 隐私协议未在 mp 后台声明；按指引提示开发者
      if (errno === 1026 || /privacy/i.test(msg)) {
        this._setStatus('需在 mp.weixin.qq.com → 设置 → 用户隐私保护指引中声明 wx.getUserProfile');
        return;
      }
      // 真正的用户取消授权（不含其它 fail）才静默
      if (/auth ?deny|auth ?canceled|fail cancel|user (denied|cancelled)/i.test(msg)) {
        this._setStatus('已取消同步');
        return;
      }
      this._setStatus(`同步失败：${msg}`);
    } finally {
      this._profileBusy = false;
    }
  }

  /** 统一格式化任意 throw 出来的值（Error / wx 错误对象 / string / 其他）。 */
  private _formatErr(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    if (err && typeof err === 'object') {
      const obj = err as { errMsg?: string; message?: string; errno?: number };
      return obj.errMsg ?? obj.message ?? JSON.stringify(err);
    }
    return String(err);
  }

  private async _applyProfileUpdate(nickname: string, avatarUrl?: string): Promise<void> {
    this._profileBusy = true;
    this._setStatus('正在更新资料…');
    try {
      const user = await login(nickname, avatarUrl);
      this._closeProfileMenu();
      // 刷新 UI
      if (this._nicknameLabel) this._nicknameLabel.string = user.nickname;
      if (this._avatarTextLabel) {
        this._avatarTextLabel.string = (user.nickname || '玩').slice(0, 1);
      }
      if (user.avatarUrl) {
        void this._applyRemoteAvatar(user.avatarUrl);
      }
      // 排行榜缓存失效，下次打开会重拉
      this._leaderboardEntries = null;
      this._myRank = null;
      this._setStatus(`已更新：${user.nickname}`);
      // 立刻刷新一次排名显示
      void this._refreshRank();
    } catch (err) {
      this._setStatus(`更新失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this._profileBusy = false;
    }
  }

  /** 微信 wx.showModal({editable:true}) 取昵称；非微信环境降级为 globalThis.prompt */
  private _promptText(message: string, defaultValue: string): Promise<string | null> {
    const wxApi = this._wxApi();
    if (wxApi?.showModal) {
      return new Promise((resolve) => {
        wxApi.showModal!({
          title: '修改昵称',
          content: message,
          editable: true,
          placeholderText: '请输入昵称',
          // 部分基础库版本不支持初始值，留空即可
          success: (r: { confirm?: boolean; content?: string }) => {
            resolve(r.confirm ? (r.content ?? '') : null);
          },
          fail: () => resolve(null),
        });
      });
    }
    const promptFn = (globalThis as { prompt?: (msg: string, def?: string) => string | null }).prompt;
    if (typeof promptFn === 'function') {
      return Promise.resolve(promptFn(message, defaultValue));
    }
    return Promise.resolve(null);
  }

  /** 把远程头像 URL 渲染到 Avatar 节点上：覆盖 Graphics 占位的首字母 */
  private async _applyRemoteAvatar(url: string): Promise<void> {
    if (!url || !this._avatarNode?.isValid) return;
    try {
      const frame = await this._loadRemoteSpriteFrame(url);
      if (!frame || !this._avatarNode?.isValid) return;
      let art = this._avatarNode.getChildByName('AvatarArt');
      // 头像现为 76x76 正方形（保留 4px 内边距以露出金色描边）
      const AV_INNER = 68;
      if (!art) {
        art = new Node('AvatarArt');
        art.setParent(this._avatarNode);
        art.addComponent(UITransform).setContentSize(AV_INNER, AV_INNER);
        art.addComponent(Sprite);
      } else {
        art.getComponent(UITransform)?.setContentSize(AV_INNER, AV_INNER);
      }
      const sp = art.getComponent(Sprite);
      if (sp) {
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.spriteFrame = frame;
      }
      if (this._avatarTextLabel) this._avatarTextLabel.string = '';
    } catch {
      // 远程加载失败：保留首字母占位
    }
  }

  // 仅声明本控制器用到的 wx API 子集，避免污染全局 d.ts
  private _wxApi(): WxProfileApi | undefined {
    if (typeof wx === 'undefined') return undefined;
    return wx as unknown as WxProfileApi;
  }

  private _loadRemoteSpriteFrame(url: string): Promise<SpriteFrame | null> {
    return new Promise((resolve) => {
      assetManager.loadRemote<ImageAsset>(url, { ext: '.png' }, (err, asset) => {
        if (err || !asset) {
          resolve(null);
          return;
        }
        const tex = new Texture2D();
        tex.image = asset;
        const sf = new SpriteFrame();
        sf.texture = tex;
        resolve(sf);
      });
    });
  }

  private _makeResourceChip(
    parent: Node,
    name: string,
    x: number,
    y: number,
    iconKind: LobbyAssetIconKind,
  ): Label {
    const width = 138;
    const chip = new Node(name);
    chip.setParent(parent);
    chip.setPosition(x, y, 0);
    chip.addComponent(UITransform).setContentSize(width, 68);

    const halo = new Node('Halo');
    halo.setParent(chip);
    halo.setPosition(-27, 6, 0);
    halo.addComponent(UITransform).setContentSize(58, 58);
    this._drawCircle(halo, 22, new Color(110, 170, 255, 42));

    const valueBg = new Node('ValueBg');
    valueBg.setParent(chip);
    valueBg.setPosition(24, 4, 0);
    valueBg.addComponent(UITransform).setContentSize(96, 40);
    this._drawRoundedRect(
      valueBg,
      96,
      40,
      19,
      new Color(9, 34, 72, 194),
      new Color(134, 208, 255, 120),
    );
    const valueGlow = new Node('ValueGlow');
    valueGlow.setParent(valueBg);
    valueGlow.setPosition(0, 10, 0);
    valueGlow.addComponent(UITransform).setContentSize(76, 10);
    this._drawRoundedRect(
      valueGlow,
      76,
      10,
      5,
      new Color(225, 244, 255, 28),
    );
    const icon = new Node('ResourceIcon');
    icon.setParent(chip);
    icon.setPosition(-41, 4, 0);
    icon.addComponent(UITransform).setContentSize(58, 58);
    this._drawLobbyAssetIcon(icon, iconKind);
    const value = this._makeLabel(valueBg, 'Value', 0, 23, 88, 34);
    value.enableOutline = true;
    value.outlineColor = new Color(5, 20, 46, 220);
    value.outlineWidth = 2;
    return value;
  }

  private _applyTopAssetStripArt(): void {
    const chipFrame = getCachedSprite('pve/lobby/asset_top_chip_blue_9s');
    if (!chipFrame) return;
    const iconMap: Record<LobbyAssetIconKind, string> = {
      shards: 'pve/lobby/icon_chip_destiny_shards',
      diamond: 'pve/lobby/icon_chip_diamond',
      stamina: 'pve/lobby/icon_chip_stamina',
    };
    const strip = this.node.getChildByName('PveLobbyRoot')?.getChildByName('TopAssetStrip');
    if (!strip) return;
    const chipOrder: Array<{ name: string; kind: LobbyAssetIconKind }> = [
      { name: 'Shards', kind: 'shards' },
      { name: 'Diamond', kind: 'diamond' },
      { name: 'StaminaChip', kind: 'stamina' },
    ];
    for (const item of chipOrder) {
      const chip = strip.getChildByName(item.name);
      if (!chip) continue;
      const size = chip.getComponent(UITransform)?.contentSize;
      if (!size) continue;
      ensureArtSliced(
        chip,
        'ChipArt',
        chipFrame,
        size.width,
        size.height,
        { top: 90, bottom: 90, left: 180, right: 180 },
      );
      chip.getChildByName('ChipArt')?.setSiblingIndex(0);
      const iconNode = chip.getChildByName('ResourceIcon');
      const iconFrame = getCachedSprite(iconMap[item.kind]);
      if (iconNode && iconFrame) {
        iconNode.removeAllChildren();
        const iconSize = item.kind === 'diamond' ? 52 : item.kind === 'stamina' ? 48 : 50;
        ensureArtChild(iconNode, 'IconArt', iconFrame, iconSize, iconSize);
        iconNode.setPosition(-46, 3, 0);
      }
      this._disableGraphicsRecursive(chip);
      const valueBg = chip.getChildByName('ValueBg');
      if (valueBg) {
        valueBg.setPosition(34, 2, 0);
        const label = valueBg.getChildByName('Value')?.getComponent(Label);
        if (label) {
          label.node.setPosition(0, 1, 0);
          label.fontSize = 24;
          label.lineHeight = 28;
          label.color = new Color(245, 248, 255, 255);
        }
      }
    }
  }

  private _disableGraphicsRecursive(node: Node): void {
    const graphics = node.getComponent(Graphics);
    if (graphics) graphics.enabled = false;
    node.children.forEach((child) => this._disableGraphicsRecursive(child));
  }

  private _drawLobbyAssetIcon(node: Node, kind: LobbyAssetIconKind): void {
    switch (kind) {
      case 'shards':
        this._drawCrystalIcon(node, {
          core: new Color(126, 88, 255, 255),
          edge: new Color(239, 221, 255, 255),
          accent: new Color(84, 53, 188, 255),
          glow: new Color(185, 132, 255, 58),
          mirrored: true,
        });
        return;
      case 'diamond':
        this._drawCrystalIcon(node, {
          core: new Color(70, 204, 255, 255),
          edge: new Color(220, 248, 255, 255),
          accent: new Color(25, 113, 224, 255),
          glow: new Color(102, 220, 255, 50),
          mirrored: false,
        });
        return;
      case 'stamina':
        this._drawStaminaIcon(node);
        return;
    }
  }

  private _drawCrystalIcon(
    node: Node,
    palette: {
      core: Color;
      edge: Color;
      accent: Color;
      glow: Color;
      mirrored: boolean;
    },
  ): void {
    const glow = new Node('Glow');
    glow.setParent(node);
    glow.setPosition(0, 0, 0);
    glow.addComponent(UITransform).setContentSize(54, 54);
    this._drawCircle(glow, 20, palette.glow);

    const shardOffsets = palette.mirrored
      ? [{ x: -11, y: -1, scale: 0.88 }, { x: 9, y: 3, scale: 0.74 }]
      : [{ x: -9, y: -2, scale: 0.72 }, { x: 10, y: 2, scale: 0.9 }];
    shardOffsets.forEach((offset, index) => {
      const shard = new Node(`Shard_${index}`);
      shard.setParent(node);
      shard.setPosition(offset.x, offset.y, 0);
      shard.addComponent(UITransform).setContentSize(26, 30);
      const graphics = shard.addComponent(Graphics);
      const scale = offset.scale;
      const halfW = 10 * scale;
      const tipY = 12 * scale;
      const shoulderY = 2 * scale;
      const bottomY = -12 * scale;
      graphics.fillColor = palette.core;
      graphics.moveTo(0, tipY);
      graphics.lineTo(halfW, shoulderY);
      graphics.lineTo(6 * scale, bottomY);
      graphics.lineTo(0, -15 * scale);
      graphics.lineTo(-6 * scale, bottomY);
      graphics.lineTo(-halfW, shoulderY);
      graphics.close();
      graphics.fill();
      graphics.strokeColor = palette.edge;
      graphics.lineWidth = 1.6;
      graphics.stroke();

      const facet = new Node('Facet');
      facet.setParent(shard);
      facet.setPosition(-2 * scale, -1 * scale, 0);
      facet.addComponent(UITransform).setContentSize(12, 18);
      const facetG = facet.addComponent(Graphics);
      facetG.fillColor = palette.accent;
      facetG.moveTo(0, 7 * scale);
      facetG.lineTo(4 * scale, 1 * scale);
      facetG.lineTo(1 * scale, -8 * scale);
      facetG.lineTo(-4 * scale, 1 * scale);
      facetG.close();
      facetG.fill();
    });

    const sparkle = new Node('Sparkle');
    sparkle.setParent(node);
    sparkle.setPosition(9, 15, 0);
    sparkle.addComponent(UITransform).setContentSize(14, 14);
    const sparkleG = sparkle.addComponent(Graphics);
    sparkleG.fillColor = new Color(255, 255, 255, 200);
    sparkleG.circle(0, 0, 2.2);
    sparkleG.fill();
  }

  private _drawStaminaIcon(node: Node): void {
    const glow = new Node('Glow');
    glow.setParent(node);
    glow.setPosition(0, 0, 0);
    glow.addComponent(UITransform).setContentSize(54, 54);
    this._drawCircle(glow, 20, new Color(255, 213, 93, 54));

    const badge = new Node('Badge');
    badge.setParent(node);
    badge.setPosition(0, 0, 0);
    badge.addComponent(UITransform).setContentSize(40, 40);
    this._drawCircle(badge, 16, new Color(255, 232, 122, 255), new Color(255, 248, 220, 235), 1.6);

    const bolt = new Node('Bolt');
    bolt.setParent(node);
    bolt.setPosition(0, 1, 0);
    bolt.addComponent(UITransform).setContentSize(26, 30);
    const graphics = bolt.addComponent(Graphics);
    graphics.fillColor = new Color(255, 177, 34, 255);
    graphics.moveTo(-1, 12);
    graphics.lineTo(8, 12);
    graphics.lineTo(2, 2);
    graphics.lineTo(9, 2);
    graphics.lineTo(-6, -13);
    graphics.lineTo(-1, -3);
    graphics.lineTo(-8, -3);
    graphics.close();
    graphics.fill();
    graphics.strokeColor = new Color(255, 248, 220, 215);
    graphics.lineWidth = 1.4;
    graphics.stroke();
  }

  private _makeNavButton(
    parent: Node,
    text: string,
    iconKey: string,
    x: number,
    y: number,
    width: number,
    height: number,
    onClick: () => void,
  ): void {
    const node = new Node(`Btn_${text}`);
    node.setParent(parent);
    node.setPosition(x, y, 0);
    node.addComponent(UITransform).setContentSize(width, height);
    const icon = new Node('NavIcon');
    icon.setParent(node);
    icon.setPosition(0, 25, 0);
    icon.addComponent(UITransform).setContentSize(82, 82);
    this._navIconKeys.set(icon, iconKey);
    const label = this._makeLabel(node, 'Label', -43, 22, width - 20, 32);
    label.string = text;
    label.color = new Color(238, 248, 255, 255);
    label.enableOutline = true;
    label.outlineColor = new Color(7, 28, 58, 230);
    label.outlineWidth = 2;
    this._bindButton(node, onClick);
  }

  private _makeArtButton(
    parent: Node,
    name: string,
    x: number,
    y: number,
    width: number,
    height: number,
    spriteKey: string,
    onClick: () => void,
  ): void {
    const node = new Node(`Btn_${name}`);
    node.setParent(parent);
    node.setPosition(new Vec3(x, y, 0));
    node.addComponent(UITransform).setContentSize(width, height);
    this._drawRoundedRect(
      node,
      width,
      height,
      20,
      new Color(25, 100, 190, 255),
      new Color(255, 215, 90, 255),
    );
    this._buttonSpriteKeys.set(node, spriteKey);
    this._bindButton(node, onClick);
  }

  private _makeTextButton(
    parent: Node,
    text: string,
    x: number,
    y: number,
    width: number,
    height: number,
    onClick: () => void,
  ): void {
    const node = new Node(`Btn_${text}`);
    node.setParent(parent);
    node.setPosition(x, y, 0);
    node.addComponent(UITransform).setContentSize(width, height);
    this._drawRoundedRect(
      node,
      width,
      height,
      20,
      new Color(20, 82, 150, 245),
      new Color(255, 210, 90, 255),
    );
    const label = this._makeLabel(node, 'Label', 0, 28, width - 12, height - 8);
    label.string = text;
    this._bindButton(node, onClick);
  }

  private _bindButton(node: Node, onClick: () => void): void {
    const button = node.addComponent(Button);
    button.transition = Button.Transition.SCALE;
    button.zoomScale = 0.96;
    button.target = node;
    node.on(Button.EventType.CLICK, onClick, this);
  }

  private _applyButtonArt(root: Node): void {
    const visit = (node: Node): void => {
      const key = this._buttonSpriteKeys.get(node);
      const frame = key ? getCachedSprite(key) : null;
      const size = node.getComponent(UITransform)?.contentSize;
      if (frame && size) {
        ensureArtStretch(node, 'BtnArt', frame, size.width, size.height);
        node.getChildByName('BtnArt')?.setSiblingIndex(0);
        const graphics = node.getComponent(Graphics);
        if (graphics) graphics.enabled = false;
      }
      node.children.forEach(visit);
    };
    visit(root);
  }

  private _makeLabel(
    parent: Node,
    name: string,
    y: number,
    fontSize: number,
    width: number,
    height: number,
  ): Label {
    const node = new Node(name);
    node.setParent(parent);
    node.setPosition(0, y, 0);
    node.addComponent(UITransform).setContentSize(width, height);
    const label = node.addComponent(Label);
    label.fontSize = fontSize;
    label.lineHeight = fontSize + 6;
    label.color = new Color(245, 248, 255, 255);
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = Label.Overflow.SHRINK;
    return label;
  }

  private _drawRect(
    node: Node,
    width: number,
    height: number,
    fill: Color,
    stroke?: Color,
  ): void {
    const graphics = node.getComponent(Graphics) || node.addComponent(Graphics);
    graphics.clear();
    graphics.fillColor = fill;
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill();
    if (stroke) {
      graphics.strokeColor = stroke;
      graphics.lineWidth = 2;
      graphics.rect(-width / 2, -height / 2, width, height);
      graphics.stroke();
    }
  }

  private _drawCircle(
    node: Node,
    radius: number,
    fill: Color,
    stroke?: Color,
    lineWidth = 2,
  ): void {
    const graphics = node.getComponent(Graphics) || node.addComponent(Graphics);
    graphics.clear();
    graphics.fillColor = fill;
    graphics.circle(0, 0, radius);
    graphics.fill();
    if (stroke) {
      graphics.strokeColor = stroke;
      graphics.lineWidth = lineWidth;
      graphics.circle(0, 0, radius);
      graphics.stroke();
    }
  }

  private _drawRoundedRect(
    node: Node,
    width: number,
    height: number,
    radius: number,
    fill: Color,
    stroke?: Color,
  ): void {
    const graphics = node.getComponent(Graphics) || node.addComponent(Graphics);
    graphics.clear();
    graphics.fillColor = fill;
    graphics.roundRect(-width / 2, -height / 2, width, height, radius);
    graphics.fill();
    if (stroke) {
      graphics.strokeColor = stroke;
      graphics.lineWidth = 2;
      graphics.roundRect(-width / 2, -height / 2, width, height, radius);
      graphics.stroke();
    }
  }

  private _tickStamina = (): void => {
    if (
      this._staminaNextRecoveryAt
      && this._stamina < this._staminaMax
      && Date.now() >= this._staminaNextRecoveryAt
    ) {
      const recovered = Math.floor(
        (Date.now() - this._staminaNextRecoveryAt) / PVE_STAMINA_RECOVERY_MS,
      ) + 1;
      this._stamina = Math.min(this._staminaMax, this._stamina + recovered);
      this._staminaNextRecoveryAt = this._stamina >= this._staminaMax
        ? null
        : this._staminaNextRecoveryAt + recovered * PVE_STAMINA_RECOVERY_MS;
    }
    this._updateStaminaLabels();
  };

  private _updateStaminaLabels(): void {
    if (this._staminaLabel) {
      this._staminaLabel.string = `${this._stamina}/${this._staminaMax}`;
    }
    if (!this._staminaTimerLabel) return;
    if (!this._staminaNextRecoveryAt || this._stamina >= this._staminaMax) {
      this._staminaTimerLabel.string = '已满';
      return;
    }
    const remain = Math.max(0, this._staminaNextRecoveryAt - Date.now());
    const totalSeconds = Math.ceil(remain / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const secondsText = seconds < 10 ? `0${seconds}` : String(seconds);
    this._staminaTimerLabel.string = `+1  ${minutes}:${secondsText}`;
  }

  private _gotoScene(text: string, load: () => void): void {
    stopMainBgm();
    LoadingOverlay.show(this.node, text, () => this._setStatus('加载较慢，请检查网络'));
    this.scheduleOnce(load, 0);
  }

  private _setStatus(text: string): void {
    if (this._statusLabel) this._statusLabel.string = text;
    console.log('[PveLobby]', text);
  }

  onDestroy(): void {
    stopMainBgm();
    this.unschedule(this._tickStamina);
    this._unbindResize?.();
    this._unbindResize = null;
  }
}
