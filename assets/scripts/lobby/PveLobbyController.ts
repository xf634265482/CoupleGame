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
import { playSfx, SFX_IDS } from '../audio/AudioManager';
import { login } from '../platform/wechat/WxAuth';
import {
  loadPveLeaderboard,
  loadPveMeta,
  updatePveMeta,
  listMails,
  claimMail,
  claimAllMails,
  deleteMail,
  markMailRead,
  getCheckInState,
  signCheckInToday,
  makeupCheckIn,
  claimCheckInMilestone,
  type PveLeaderboardEntry,
  type MailItem,
  type CheckInReward,
  type CheckInResponse,
} from '../network/PveService';
import {
  loadActiveFloorChallenge,
  loadPveProfile,
  type LoadActiveFloorChallengeResponse,
} from '../network/PveProgressionService';
import { flushPendingFloorSettlement } from '../pve/flushPendingFloorSettlement';
import { preloadChapter } from '../pve/ChapterResourceLoader';
import { ensureEquipmentAssetsForFloor } from '../pve/EquipmentResourceLoader';
import { playMainBgm, stopMainBgm } from '../audio/BgmController';
import {
  applyScreenBackground,
  ensureResourcesBundle,
  getCachedSprite,
  isResourcesBundleReady,
  preloadPveCampUi,
  preloadPveLobbyUi,
} from '../ui/UiAssets';
import { ensureArtChild, ensureArtStretch } from '../ui/UiSprite';
import { LoadingOverlay } from '../ui/LoadingOverlay';
import { CampController } from '../pve/controllers/CampController';
import { PartnerController } from '../pve/controllers/PartnerController';
import { MinghenShopController } from '../pve/controllers/MinghenShopController';
import { MailView } from '../pve/views/MailView';
import { CheckInView } from '../pve/views/CheckInView';
import { preloadPartnerIconBundle } from '../pve/PartnerIconResourceLoader';
import {
  applyUiLayerTree,
  bindWindowResize,
  refreshScreenAdapt,
  visibleDesignSize,
} from '../platform/wechat/ViewAdapt';
import { lockPortrait } from '../platform/wechat/WxLandscape';
import {
  PVE_STAMINA_CHALLENGE_COST,
  PVE_STAMINA_MAX,
  PVE_STAMINA_RECOVERY_MS,
} from '../pve/core/PveConstants';
import type { PveMeta } from '../pve/core/PveTypes';
import type { PveProfile } from '../pve/core/PveProgressionTypes';
import {
  CHAPTER_SIZE,
  chapterDisplayName,
  chapterEndFloor,
  chapterFloorOf,
  chapterIdForFloor,
  chapterStartFloor,
  MAX_READY_CHAPTER,
  MAX_READY_FLOOR,
  maxUnlockedChapter,
  type ChapterId,
} from '../pve/core/chapterRouting';

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
@ccclass('PveLobbyController')
export class PveLobbyController extends Component {
  private _logo: Node | null = null;
  private _stardustLabel: Label | null = null;
  private _staminaLabel: Label | null = null;
  private _staminaTimerLabel: Label | null = null;
  private _mailBadgeLabel: Label | null = null;
  private _mailBadgeHost: Node | null = null;
  private _mailView: MailView | null = null;
  private _mailBusy = false;
  private _mailActionBusy = false;
  private _mailCache: MailItem[] = [];
  private _checkInBadgeHost: Node | null = null;
  private _checkInView: CheckInView | null = null;
  private _checkInBusy = false;
  private _checkInActionBusy = false;
  private _metaFloorLabel: Label | null = null;
  private _metaRankLabel: Label | null = null;
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
  private _floorSelectModal: Node | null = null;
  private _leaderboardEntries: PveLeaderboardEntry[] | null = null;
  private _myRank: number | null = null;
  private _unbindResize: (() => void) | null = null;
  private _buttonSpriteKeys = new Map<Node, string>();
  private _navIconKeys = new Map<Node, string>();
  private _stamina = PVE_STAMINA_MAX;
  private _staminaMax = PVE_STAMINA_MAX;
  private _staminaNextRecoveryAt: number | null = null;
  private _hasActiveChallenge = false;
  private _busy = false;
  private _lobbyReady = false;
  private _warmPromise: Promise<void> | null = null;
  private _warmedProfile: PveProfile | null = null;
  private _warmedActive: LoadActiveFloorChallengeResponse | null = null;

  onLoad(): void {
    lockPortrait();
    this.node.getChildByName('RoomRoot')?.destroy();
    this.node.getChildByName('PveLobbyRoot')?.destroy();
    refreshScreenAdapt(this.node);
    this._lobbyReady = false;
    LoadingOverlay.show(this.node, '正在加载大厅资源…', {
      mode: 'startup',
      title: '塔塔远征团',
      subtitle: '正在进入大厅',
      hint: '正在加载大厅素材',
      progress: 0.55,
      hideOnTimeout: false,
      timeoutMs: 0,
    });
    this._buildUi();
    const lobbyRoot = this.node.getChildByName('PveLobbyRoot');
    if (lobbyRoot) lobbyRoot.active = false;
    applyUiLayerTree(this.node, this.node.layer);

    const relayout = () => {
      refreshScreenAdapt(this.node);
      LoadingOverlay.recompute();
      // 尺寸晚就绪时 ensureScreenBackground 会重铺已有 Art；仍主动再 apply 一次兜底。
      if (this._lobbyReady || getCachedSprite('backgrounds/bg_lobby')) {
        void applyScreenBackground(this.node, 'lobby');
      }
    };
    this.scheduleOnce(relayout, 0);
    this.scheduleOnce(relayout, 0.12);
    this.scheduleOnce(relayout, 0.35);
    this.scheduleOnce(relayout, 0.8);
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

    this._buildSideShopEntry(root);
    this._buildBottomNav(root, -h / 2 + NAV_Y_OFFSET);

    this._statusLabel = this._makeLabel(root, 'Status', -h / 2 + 210, 22, 500, 36);
    this._statusLabel.color = new Color(240, 248, 255, 230);
    this._statusLabel.string = '';
  }

  private _buildTopBar(root: Node, y: number): void {
    const CARD_W = 261;
    const CARD_H = 94;
    const AVATAR_SIZE = 78;
    const playerCard = new Node('PlayerCard');
    playerCard.setParent(root);
    playerCard.setPosition(-226, y, 0);
    playerCard.addComponent(UITransform).setContentSize(CARD_W, CARD_H);
    this._drawRoundedRect(
      playerCard,
      CARD_W,
      CARD_H,
      14,
      new Color(10, 38, 78, 170),
      new Color(120, 205, 255, 210),
    );

    const AVATAR_X = -CARD_W / 2 + 8 + AVATAR_SIZE / 2;
    const avatar = new Node('Avatar');
    avatar.setParent(playerCard);
    avatar.setPosition(AVATAR_X, 0, 0);
    avatar.addComponent(UITransform).setContentSize(AVATAR_SIZE, AVATAR_SIZE);
    const avatarG = avatar.addComponent(Graphics);
    avatarG.fillColor = new Color(50, 160, 230, 255);
    avatarG.roundRect(-AVATAR_SIZE / 2, -AVATAR_SIZE / 2, AVATAR_SIZE, AVATAR_SIZE, 10);
    avatarG.fill();
    avatarG.strokeColor = new Color(255, 220, 110, 255);
    avatarG.lineWidth = 2;
    avatarG.roundRect(-AVATAR_SIZE / 2 + 1, -AVATAR_SIZE / 2 + 1, AVATAR_SIZE - 2, AVATAR_SIZE - 2, 9);
    avatarG.stroke();
    const avatarText = this._makeLabel(avatar, 'AvatarText', 0, 28, AVATAR_SIZE, AVATAR_SIZE);
    avatarText.string = (GameSession.user?.nickname || '玩').slice(0, 1);
    avatarText.isBold = true;
    this._avatarNode = avatar;
    this._avatarTextLabel = avatarText;

    const NAME_LEFT = AVATAR_X + AVATAR_SIZE / 2 + 14;
    const NAME_W = CARD_W / 2 - NAME_LEFT - 12;
    const nickname = this._makeLabel(playerCard, 'Nickname', 0, 24, NAME_W, 30);
    nickname.node.setPosition(NAME_LEFT + NAME_W / 2, 16, 0);
    nickname.horizontalAlign = Label.HorizontalAlign.LEFT;
    nickname.string = GameSession.user?.nickname ?? '玩家';
    nickname.color = new Color(245, 250, 255, 255);
    nickname.isBold = true;
    this._nicknameLabel = nickname;

    const metaY = -20;
    this._metaFloorLabel = this._makeLabel(playerCard, 'MetaFloor', 0, 18, 66, 28);
    this._metaFloorLabel.node.setPosition(NAME_LEFT + 34, metaY, 0);
    this._metaFloorLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
    this._metaFloorLabel.color = new Color(255, 226, 130, 255);
    this._metaFloorLabel.isBold = true;
    const metaDot = this._makeLabel(playerCard, 'MetaDot', 0, 18, 20, 28);
    metaDot.node.setPosition(NAME_LEFT + 81, metaY, 0);
    metaDot.string = '·';
    metaDot.color = new Color(255, 226, 130, 255);
    metaDot.isBold = true;
    this._metaRankLabel = this._makeLabel(playerCard, 'MetaRank', 0, 18, 66, 28);
    this._metaRankLabel.node.setPosition(NAME_LEFT + 121, metaY, 0);
    this._metaRankLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
    this._metaRankLabel.color = new Color(255, 226, 130, 255);
    this._metaRankLabel.isBold = true;
    this._updateMetaLine();

    this._bindButton(playerCard, () => this._showProfileMenu());
    if (GameSession.user?.avatarUrl) {
      void this._applyRemoteAvatar(GameSession.user.avatarUrl);
    }

    this._buildMailEntry(root, y - CARD_H / 2 - 48, -226, CARD_W);
    this._buildCheckInEntry(root, y - CARD_H / 2 - 48, -226, CARD_W);

    const assetStrip = new Node('TopAssetStrip');
    assetStrip.setParent(root);
    assetStrip.setPosition(214, y + 2, 0);
    assetStrip.addComponent(UITransform).setContentSize(270, 82);

    this._stardustLabel = this._makeTopAssetBadge(assetStrip, 'StardustChip', -66, 0, 'pve/lobby/icon_chip_stardust', 114, 50, 44, 23);
    this._staminaLabel = this._makeTopAssetBadge(assetStrip, 'StaminaChip', 66, 0, 'pve/lobby/icon_chip_stamina', 118, 50, 42, 23);
    if (this._stardustLabel) this._stardustLabel.string = '0';
    if (this._staminaLabel) this._staminaLabel.string = `${this._stamina}/${this._staminaMax}`;
    const staminaChip = assetStrip.getChildByName('StaminaChip');
    if (staminaChip) {
      this._staminaTimerLabel = this._makeLabel(staminaChip, 'StaminaTimer', -16, 17, 96, 22);
      this._staminaTimerLabel.node.setPosition(7, -30, 0);
      this._staminaTimerLabel.color = new Color(212, 238, 255, 220);
      this._staminaTimerLabel.enableOutline = true;
      this._staminaTimerLabel.outlineColor = new Color(8, 24, 48, 200);
      this._staminaTimerLabel.outlineWidth = 2;
    }
  }

  private _buildMailEntry(root: Node, y: number, playerCardX: number, playerCardW: number): void {
    const MAIL_W = 120;
    const MAIL_H = 68;
    const playerLeft = playerCardX - playerCardW / 2;
    const entryX = playerLeft + MAIL_W / 2;
    const entry = new Node('MailEntry');
    entry.setParent(root);
    entry.setPosition(entryX, y, 0);
    entry.addComponent(UITransform).setContentSize(MAIL_W, MAIL_H);
    this._drawRoundedRect(
      entry,
      MAIL_W,
      MAIL_H,
      16,
      new Color(10, 38, 78, 170),
      new Color(120, 205, 255, 210),
    );
    const icon = new Node('MailIcon');
    icon.setParent(entry);
    icon.setPosition(-MAIL_W / 2 + 24, 1, 0);
    icon.addComponent(UITransform).setContentSize(40, 40);
    this._navIconKeys.set(icon, 'pve/lobby/icon_mail');
    const label = this._makeLabel(entry, 'MailLabel', 0, 26, 64, 36);
    label.node.setPosition(14, 0, 0);
    label.string = '邮箱';
    label.isBold = true;
    const badgeHost = new Node('MailBadgeHost');
    badgeHost.setParent(entry);
    badgeHost.setPosition(MAIL_W / 2 - 4, MAIL_H / 2 - 6, 0);
    badgeHost.addComponent(UITransform).setContentSize(36, 36);
    badgeHost.active = false;
    this._mailBadgeHost = badgeHost;
    const badgeBg = badgeHost.addComponent(Graphics);
    badgeBg.fillColor = new Color(230, 48, 48, 255);
    badgeBg.circle(0, 0, 16);
    badgeBg.fill();
    badgeBg.strokeColor = new Color(255, 255, 255, 230);
    badgeBg.lineWidth = 2;
    badgeBg.circle(0, 0, 16);
    badgeBg.stroke();
    this._mailBadgeLabel = this._makeLabel(badgeHost, 'MailBadge', 0, 22, 36, 36);
    this._mailBadgeLabel.node.setPosition(0, 0, 0);
    this._mailBadgeLabel.string = '';
    this._mailBadgeLabel.color = new Color(255, 255, 255, 255);
    this._mailBadgeLabel.isBold = true;
    this._mailBadgeLabel.enableOutline = true;
    this._mailBadgeLabel.outlineColor = new Color(120, 16, 16, 255);
    this._mailBadgeLabel.outlineWidth = 2;
    this._bindButton(entry, () => void this._showMailBox());
  }

  private _buildCheckInEntry(root: Node, y: number, playerCardX: number, playerCardW: number): void {
    const MAIL_W = 120;
    const MAIL_H = 68;
    const GAP = 12;
    const playerLeft = playerCardX - playerCardW / 2;
    const entryX = playerLeft + MAIL_W / 2 + MAIL_W + GAP;
    const entry = new Node('CheckInEntry');
    entry.setParent(root);
    entry.setPosition(entryX, y, 0);
    entry.addComponent(UITransform).setContentSize(MAIL_W, MAIL_H);
    this._drawRoundedRect(
      entry,
      MAIL_W,
      MAIL_H,
      16,
      new Color(10, 38, 78, 170),
      new Color(255, 200, 120, 210),
    );
    const icon = new Node('CheckInIcon');
    icon.setParent(entry);
    icon.setPosition(-MAIL_W / 2 + 24, 1, 0);
    icon.addComponent(UITransform).setContentSize(40, 40);
    this._navIconKeys.set(icon, 'pve/lobby/icon_checkin');
    const label = this._makeLabel(entry, 'CheckInLabel', 0, 26, 64, 36);
    label.node.setPosition(14, 0, 0);
    label.string = '签到';
    label.isBold = true;
    const badgeHost = new Node('CheckInBadgeHost');
    badgeHost.setParent(entry);
    badgeHost.setPosition(MAIL_W / 2 - 4, MAIL_H / 2 - 6, 0);
    badgeHost.addComponent(UITransform).setContentSize(28, 28);
    badgeHost.active = false;
    this._checkInBadgeHost = badgeHost;
    const badgeBg = badgeHost.addComponent(Graphics);
    badgeBg.fillColor = new Color(230, 48, 48, 255);
    badgeBg.circle(0, 0, 10);
    badgeBg.fill();
    badgeBg.strokeColor = new Color(255, 255, 255, 230);
    badgeBg.lineWidth = 2;
    badgeBg.circle(0, 0, 10);
    badgeBg.stroke();
    this._bindButton(entry, () => void this._showCheckIn());
  }

  private _setCheckInBadge(show: boolean): void {
    if (this._checkInBadgeHost) this._checkInBadgeHost.active = show;
  }

  private async _refreshCheckInBadge(): Promise<void> {
    try {
      const res = await getCheckInState();
      this._setCheckInBadge(Boolean(res.redDot));
    } catch {
      // 签到红点失败不阻断大厅
    }
  }

  private _formatCheckInGain(gained?: CheckInReward | null): string {
    if (!gained) return '';
    const parts: string[] = [];
    if (gained.gold) parts.push(`星尘×${gained.gold}`);
    if (gained.quenchSand) parts.push(`淬星砂×${gained.quenchSand}`);
    if (gained.fusionCore) parts.push(`聚星核×${gained.fusionCore}`);
    if (gained.voidHide) parts.push(`虚空革×${gained.voidHide}`);
    if (gained.makeupCards) parts.push(`补签卡×${gained.makeupCards}`);
    return parts.join(' · ');
  }

  private _applyCheckInResponse(res: CheckInResponse): void {
    this._checkInView?.setState(res.checkIn);
    this._setCheckInBadge(Boolean(res.redDot));
    if (typeof res.profile?.gold === 'number') this._applyStardust(res.profile.gold);
    const tip = this._formatCheckInGain(res.gained);
    if (tip) this._setStatus(`签到获得：${tip}`);
  }

  private async _showCheckIn(): Promise<void> {
    if (this._checkInBusy) return;
    this._checkInBusy = true;
    try {
      if (this._checkInView) {
        this._checkInView.destroy();
        this._checkInView = null;
      }
      this._checkInView = new CheckInView(this.node, {
        onClose: () => {
          this._checkInView?.destroy();
          this._checkInView = null;
          void this._refreshCheckInBadge();
        },
        onSign: () => {
          void this._runCheckInAction(() => signCheckInToday());
        },
        onMakeup: (day) => {
          void this._runCheckInAction(() => makeupCheckIn(day));
        },
        onClaimMilestone: (days) => {
          void this._runCheckInAction(() => claimCheckInMilestone(days));
        },
      });
      const res = await getCheckInState();
      this._applyCheckInResponse(res);
    } catch (err) {
      this._setStatus(`签到打开失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this._checkInBusy = false;
    }
  }

  private async _runCheckInAction(fn: () => Promise<CheckInResponse>): Promise<void> {
    if (this._checkInActionBusy) return;
    this._checkInActionBusy = true;
    try {
      const res = await fn();
      this._applyCheckInResponse(res);
    } catch (err) {
      this._setStatus(`签到失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this._checkInActionBusy = false;
    }
  }

  private _setMailBadge(count: number): void {
    if (!this._mailBadgeLabel) return;
    const show = count > 0;
    if (this._mailBadgeHost) this._mailBadgeHost.active = show;
    this._mailBadgeLabel.string = show ? (count > 99 ? '99+' : String(count)) : '';
  }

  private async _refreshMailBadge(): Promise<void> {
    try {
      const res = await listMails(50);
      this._setMailBadge(res.unreadCount || 0);
    } catch {
      // 邮箱红点失败不阻断大厅
    }
  }

  private async _showMailBox(): Promise<void> {
    if (this._mailBusy) return;
    this._mailBusy = true;
    try {
      if (this._mailView) {
        this._mailView.destroy();
        this._mailView = null;
      }
      this._mailView = new MailView(this.node, {
        onClose: () => {
          this._mailView?.destroy();
          this._mailView = null;
          void this._refreshMailBadge();
        },
        onOpen: (mailId) => {
          void this._markOneMailRead(mailId);
        },
        onClaim: (mailId) => {
          void this._claimOneMail(mailId);
        },
        onClaimAll: () => {
          void this._claimAllMail();
        },
        onDelete: (mailId) => {
          void this._deleteOneMail(mailId);
        },
      });
      // 有缓存时先立刻展示，再后台拉最新列表
      if (this._mailCache.length > 0) {
        this._syncMailViewFromCache();
      }
      const res = await listMails();
      this._mailCache = res.mails || [];
      this._syncMailViewFromCache();
    } catch (err) {
      this._setStatus(`邮箱打开失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this._mailBusy = false;
    }
  }

  private _cloneMailCache(): MailItem[] {
    return this._mailCache.map((mail) => ({
      ...mail,
      attachments: mail.attachments.map((item) => ({ ...item })),
    }));
  }

  private _syncMailViewFromCache(): void {
    const unread = this._mailCache.reduce((n, mail) => n + (mail.unread ? 1 : 0), 0);
    this._mailView?.setMails(this._mailCache);
    this._setMailBadge(unread);
  }

  private _patchMailInCache(mailId: string, patch: Partial<MailItem>): void {
    this._mailCache = this._mailCache.map((mail) => (
      mail.id === mailId ? { ...mail, ...patch } : mail
    ));
  }

  private async _markOneMailRead(mailId: string): Promise<void> {
    const target = this._mailCache.find((mail) => mail.id === mailId);
    if (!target || !target.unread) return;
    this._patchMailInCache(mailId, { read: true, unread: false });
    this._syncMailViewFromCache();
    try {
      await markMailRead(mailId);
    } catch {
      this._patchMailInCache(mailId, { read: false, unread: true });
      this._syncMailViewFromCache();
    }
  }

  private _applyMailReward(res: { profile?: { gold?: number; stamina?: number; staminaNextRecoveryAt?: number | null }; stamina?: number }): void {
    if (typeof res.profile?.gold === 'number') this._applyStardust(res.profile.gold);
    if (typeof res.profile?.stamina === 'number') {
      this._stamina = Math.max(0, Math.min(PVE_STAMINA_MAX, Math.floor(res.profile.stamina)));
      this._staminaNextRecoveryAt = res.profile.staminaNextRecoveryAt ?? this._staminaNextRecoveryAt;
      this._updateStaminaLabels();
    } else if (typeof res.stamina === 'number') {
      this._stamina = Math.max(0, Math.min(PVE_STAMINA_MAX, Math.floor(res.stamina)));
      this._updateStaminaLabels();
    }
  }

  private async _claimOneMail(mailId: string): Promise<void> {
    if (this._mailActionBusy) return;
    const target = this._mailCache.find((mail) => mail.id === mailId);
    if (!target || target.claimed) return;
    this._mailActionBusy = true;
    const prev = this._cloneMailCache();
    this._patchMailInCache(mailId, { claimed: true, read: true, unread: false });
    this._syncMailViewFromCache();
    try {
      const res = await claimMail(mailId);
      this._applyMailReward(res);
      if (res.mail) {
        this._patchMailInCache(mailId, { ...res.mail, unread: false });
        this._syncMailViewFromCache();
      }
      this._setStatus('已领取邮件奖励');
    } catch (err) {
      this._mailCache = prev;
      this._syncMailViewFromCache();
      this._setStatus(`领取失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this._mailActionBusy = false;
    }
  }

  private async _claimAllMail(): Promise<void> {
    if (this._mailActionBusy) return;
    const pending = this._mailCache.filter((mail) => !mail.claimed && mail.attachments.length > 0);
    if (pending.length <= 0) {
      this._setStatus('没有可领取的邮件');
      return;
    }
    this._mailActionBusy = true;
    const prev = this._cloneMailCache();
    this._mailCache = this._mailCache.map((mail) => (
      !mail.claimed && mail.attachments.length > 0
        ? { ...mail, claimed: true, read: true, unread: false }
        : mail
    ));
    this._syncMailViewFromCache();
    try {
      const res = await claimAllMails();
      this._applyMailReward(res);
      this._setStatus(res.claimedCount ? `已领取 ${res.claimedCount} 封` : '没有可领取的邮件');
      void this._refreshMailCacheSilent();
    } catch (err) {
      this._mailCache = prev;
      this._syncMailViewFromCache();
      this._setStatus(`一键领取失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this._mailActionBusy = false;
    }
  }

  private async _deleteOneMail(mailId: string): Promise<void> {
    if (this._mailActionBusy) return;
    if (!this._mailCache.some((mail) => mail.id === mailId)) return;
    this._mailActionBusy = true;
    const prev = this._cloneMailCache();
    this._mailCache = this._mailCache.filter((mail) => mail.id !== mailId);
    this._syncMailViewFromCache();
    try {
      await deleteMail(mailId);
      this._setStatus('邮件已删除');
    } catch (err) {
      this._mailCache = prev;
      this._syncMailViewFromCache();
      this._setStatus(`删除失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this._mailActionBusy = false;
    }
  }

  private async _refreshMailCacheSilent(): Promise<void> {
    try {
      const res = await listMails();
      this._mailCache = res.mails || [];
      this._syncMailViewFromCache();
    } catch {
      // 静默对齐失败不影响已完成的乐观 UI
    }
  }
  private _buildSideShopEntry(root: Node): void {
    const entry = new Node('MinghenShopEntry');
    entry.setParent(root);
    entry.setPosition(312, 40, 0);
    entry.addComponent(UITransform).setContentSize(88, 110);
    this._drawRoundedRect(
      entry,
      88,
      110,
      18,
      new Color(10, 38, 78, 200),
      new Color(255, 214, 110, 230),
    );
    const icon = new Node('ShopIcon');
    icon.setParent(entry);
    icon.setPosition(0, 18, 0);
    icon.addComponent(UITransform).setContentSize(56, 56);
    this._navIconKeys.set(icon, 'pve/lobby/icon_chip_stardust');
    const label = this._makeLabel(entry, 'ShopLabel', -36, 18, 80, 28);
    label.string = '商会';
    label.color = new Color(238, 248, 255, 255);
    label.enableOutline = true;
    label.outlineColor = new Color(7, 28, 58, 230);
    label.outlineWidth = 2;
    this._bindButton(entry, () => void this._showMinghenShop());
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

    const navButtonW = 140;
    const navButtonH = 142;
    const navGap = 12;
    const navStep = navButtonW + navGap;
    // 排行榜 | 伙伴 | 远征 | 营地
    this._makeNavButton(
      dock,
      '排行榜',
      'pve/lobby/icon_nav_leaderboard',
      -navStep * 1.5,
      -4,
      navButtonW,
      navButtonH,
      () => void this._showLeaderboard(),
    );
    this._makeNavButton(
      dock,
      '伙伴',
      'pve/lobby/icon_nav_partner',
      -navStep * 0.5,
      -4,
      navButtonW,
      navButtonH,
      () => void this._showPartnerModal(),
    );
    this._makeNavButton(
      dock,
      '远征',
      'pve/lobby/icon_nav_expedition',
      navStep * 0.5,
      -4,
      navButtonW,
      navButtonH,
      () => void this._enterExpedition(),
    );
    this._makeNavButton(
      dock,
      '营地',
      'pve/lobby/icon_nav_camp',
      navStep * 1.5,
      -4,
      navButtonW,
      navButtonH,
      () => void this._showCampModal(),
    );
    this._expeditionCostLabel = this._makeLabel(dock, 'ExpeditionCost', -76, 15, 320, 22);
    this._expeditionCostLabel.color = new Color(255, 226, 130, 255);
    this._expeditionCostLabel.string = '选择楼层';
  }

  private async _loadArt(): Promise<void> {
    try {
      LoadingOverlay.update({
        text: '正在加载大厅资源…',
        hint: '正在加载大厅背景与图标',
        progress: 0.62,
      });
      await this._preloadLobbyArtUntilReady();

      LoadingOverlay.update({
        text: '正在绘制大厅…',
        hint: '正在应用大厅背景与导航图标',
        progress: 0.85,
      });
      await applyScreenBackground(this.node, 'lobby');

      const logo = getCachedSprite('pve/lobby/logo_destiny_tower');
      if (logo && this._logo?.isValid) {
        ensureArtChild(this._logo, 'LogoArt', logo, LOGO_W, LOGO_H);
      }
      for (const [iconNode, key] of this._navIconKeys) {
        const frame = getCachedSprite(key);
        if (!frame || !iconNode.isValid) continue;
        const size =
          key === 'pve/lobby/icon_nav_expedition' ? 82
            : key === 'pve/lobby/icon_mail' || key === 'pve/lobby/icon_checkin' ? 40
              : 76;
        ensureArtChild(iconNode, 'IconArt', frame, size, size);
      }
      this._applyTopAssetBadgeIcons();
      this._applyButtonArt(this.node);
      const missing = this._getMissingLobbyArtKeys();
      if (missing.length > 0) {
        const message = `大厅资源缺失：${missing.join('、')}`;
        console.error('[PveLobby] lobby art missing after preload', missing);
        this._setStatus(message);
        LoadingOverlay.update({
          text: message,
          hint: '请重新构建并确认大厅关键资源已进入主包或 resources 分包',
          progress: 1,
        });
        return;
      }
      const lobbyRoot = this.node.getChildByName('PveLobbyRoot');
      this._lobbyReady = true;
      if (lobbyRoot) lobbyRoot.active = true;
      applyUiLayerTree(this.node, this.node.layer);
      // 揭开 UI 后再按最终可视高度重铺一次，消掉偶发底部黑边。
      refreshScreenAdapt(this.node);
      void applyScreenBackground(this.node, 'lobby');
      LoadingOverlay.update({
        text: '大厅准备完成',
        hint: '即将进入大厅',
        progress: 1,
      });
      LoadingOverlay.hide();
      void this._warmLobbyBackground();
    } catch (err: unknown) {
      const message = `大厅资源加载失败：${err instanceof Error ? err.message : String(err)}`;
      console.error('[PveLobby] lobby art load failed', err);
      this._setStatus(message);
      LoadingOverlay.update({
        text: message,
        hint: '请检查构建资源与 resources 分包配置',
        progress: 1,
      });
    }
  }

  private async _preloadLobbyArtUntilReady(): Promise<void> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      await preloadPveLobbyUi();
      if (this._getMissingLobbyArtKeys().length === 0) return;
      await new Promise<void>((resolve) => setTimeout(resolve, 120 * attempt));
    }
  }

  private _getMissingLobbyArtKeys(): string[] {
    const keys = [
      'backgrounds/bg_lobby',
      'pve/lobby/logo_destiny_tower',
      'pve/lobby/icon_chip_stardust',
      'pve/lobby/icon_chip_stamina',
      ...Array.from(this._navIconKeys.values()),
    ];
    const missing: string[] = [];
    for (const key of keys) {
      if (!getCachedSprite(key) && !missing.includes(key)) missing.push(key);
    }
    return missing;
  }

  private _warmLobbyBackground(): void {
    if (this._warmPromise) return;
    void preloadPartnerIconBundle().catch((err: unknown) => {
      console.warn('[PveLobby] partner icon bundle warm failed', err);
    });
    this._warmPromise = (async () => {
      // 待结算补推放后台，不阻塞大厅预热（最多 3 次短重试，避免进远征前空等十秒）。
      void flushPendingFloorSettlement().catch((err: unknown) => {
        console.warn('[PveLobby] pending settlement flush failed', err);
      });
      // 档案/进行中挑战不依赖 resources 分包，尽早拉：营地/商会/远征选层可瞬时打开。
      const dataP = Promise.all([
        loadPveProfile()
          .then((res) => {
            this._warmedProfile = res.profile;
            this._applyStardust(res.profile.gold);
            this._applyProfileStamina(res.profile);
            this._hasActiveChallenge = Boolean(
              this._warmedActive?.challenge ?? res.profile.activeChallengeId,
            );
            // 装备图与远征场景同阶段后台预热，不挡进厅。
            void ensureEquipmentAssetsForFloor(res.profile.highestUnlockedFloor).catch((err: unknown) => {
              console.warn('[PveLobby] equipment icon warm failed', err);
            });
          })
          .catch((err: unknown) => {
            console.warn('[PveLobby] camp profile warm failed', err);
          }),
        loadActiveFloorChallenge()
          .then((res) => {
            this._warmedActive = res;
            this._hasActiveChallenge = Boolean(
              res.challenge ?? this._warmedProfile?.activeChallengeId,
            );
          })
          .catch((err: unknown) => {
            console.warn('[PveLobby] active challenge warm failed', err);
          }),
      ]);
      const bundleP = ensureResourcesBundle().then((bundle) => {
        if (!bundle) throw new Error('resources bundle not ready');
        void playMainBgm(bundle);
        return bundle;
      });
      await Promise.all([preloadPveCampUi(), dataP, bundleP]);
      void SceneLoader.preloadPveExpedition().catch((err: unknown) => {
        console.warn('[PveLobby] expedition scene preload failed', err);
      });
    })().catch((err: unknown) => {
      this._warmPromise = null;
      console.warn('[PveLobby] background warm failed', err);
    });
  }

  /** 营地/商会/伙伴：只等档案，不挡 resources 分包。 */
  private async _ensureWarmedProfile(statusText: string): Promise<PveProfile | null> {
    if (this._warmedProfile) return this._warmedProfile;
    this._setStatus(statusText);
    try {
      await this._refreshExpeditionEntryCache();
    } catch (err: unknown) {
      console.warn('[PveLobby]', statusText, err instanceof Error ? err.message : String(err));
      this._setStatus(`${statusText.replace(/…$/, '')}失败，请稍后重试`);
      return null;
    }
    if (!this._warmedProfile) {
      this._setStatus(`${statusText.replace(/…$/, '')}失败，请稍后重试`);
      return null;
    }
    this._setStatus('');
    return this._warmedProfile;
  }

  private async _ensureWarmReady(text: string): Promise<boolean> {
    if (!this._warmPromise) {
      this._warmLobbyBackground();
    }
    if (this._warmPromise) {
      LoadingOverlay.show(this.node, text, {
        mode: 'default',
        hint: '请稍候',
        progress: 0.35,
        hideOnTimeout: false,
        timeoutMs: 30000,
        onTimeout: () => LoadingOverlay.update({ text: '加载较慢，仍在继续…' }),
      });
      await this._warmPromise;
      if (!isResourcesBundleReady()) {
        LoadingOverlay.hide();
        this._setStatus('资源加载失败，请检查网络后重试');
        this._warmPromise = null;
        return false;
      }
      LoadingOverlay.hide();
    } else if (!isResourcesBundleReady()) {
      LoadingOverlay.show(this.node, text, {
        hideOnTimeout: false,
        timeoutMs: 30000,
        onTimeout: () => LoadingOverlay.update({ text: '加载较慢，仍在继续…' }),
      });
      const bundle = await ensureResourcesBundle();
      if (!bundle) {
        LoadingOverlay.hide();
        this._setStatus('资源加载失败，请检查网络后重试');
        return false;
      }
      await preloadPveCampUi();
      LoadingOverlay.hide();
    }
    return true;
  }

  private async _refreshLobbyData(): Promise<void> {
    try {
      const [metaRes, profileRes, activeRes] = await Promise.all([
        loadPveMeta(),
        loadPveProfile(),
        loadActiveFloorChallenge(),
      ]);
      const { meta } = metaRes;
      this._hasActiveChallenge = Boolean(activeRes.challenge ?? profileRes.profile.activeChallengeId);
      this._warmedProfile = profileRes.profile;
      this._warmedActive = activeRes;
      this._applyMetaSnapshot(meta);
      this._applyStardust(profileRes.profile.gold);
      this._applyProfileStamina(profileRes.profile);
      this._metaFloor = Math.max(this._metaFloor, profileRes.profile.highestClearedFloor ?? 0);
      this._updateMetaLine();
      if (this._expeditionCostLabel) {
        this._expeditionCostLabel.string = this._hasActiveChallenge
          ? `继续挑战 · 第 ${activeRes.challenge?.floor ?? profileRes.profile.highestUnlockedFloor} 层`
          : `挑战第 ${profileRes.profile.highestUnlockedFloor} 层`;
      }
      void this._refreshMailBadge();
      void this._refreshCheckInBadge();
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : String(err);
      const friendly = /DATABASE_REQUEST_FAILED|Cannot create field|document\.update:fail/i.test(raw)
        ? '大厅数据同步失败，请稍后重试'
        : raw;
      this._setStatus(`大厅数据加载失败：${friendly}`);
    }
  }

  private async _refreshExpeditionEntryCache(): Promise<void> {
    const [profileRes, activeRes] = await Promise.all([
      loadPveProfile(),
      loadActiveFloorChallenge(),
    ]);
    this._warmedProfile = profileRes.profile;
    this._warmedActive = activeRes;
    this._hasActiveChallenge = Boolean(activeRes.challenge ?? profileRes.profile.activeChallengeId);
    this._applyProfileStamina(profileRes.profile);
    if (this._expeditionCostLabel) {
      this._expeditionCostLabel.string = this._hasActiveChallenge
        ? `继续挑战 · 第 ${activeRes.challenge?.floor ?? profileRes.profile.highestUnlockedFloor} 层`
        : `挑战第 ${profileRes.profile.highestUnlockedFloor} 层`;
    }
  }

  private async _enterExpedition(): Promise<void> {
    if (this._busy) return;
    this._busy = true;
    try {
      // 大厅 onLoad / 后台预热已拉过档：直接出选层，不再每次点远征空等云 RTT。
      if (this._warmedProfile) {
        this._buildFloorSelectModal(
          this._warmedProfile,
          this._warmedActive ?? { ok: true, challenge: null },
        );
        this._setStatus('');
        void this._refreshExpeditionEntryCache().catch((err: unknown) => {
          console.warn('[PveLobby] expedition cache refresh failed', err);
        });
        return;
      }

      this._setStatus('正在读取可挑战楼层…');
      await this._refreshExpeditionEntryCache();
      if (!this._warmedProfile) {
        this._setStatus('远征入口加载失败：未获取到档案');
        return;
      }
      this._buildFloorSelectModal(
        this._warmedProfile,
        this._warmedActive ?? { ok: true, challenge: null },
      );
      this._setStatus('');
    } catch (err: unknown) {
      this._setStatus(`远征入口加载失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this._busy = false;
    }
  }

  private _buildFloorSelectModal(
    profile: PveProfile,
    activeRes: LoadActiveFloorChallengeResponse,
  ): void {
    if (this._floorSelectModal?.isValid) this._closeFloorSelectModal();
    const { h } = visibleDesignSize();
    const overlay = new Node('FloorSelectModal');
    overlay.setParent(this.node);
    overlay.addComponent(UITransform).setContentSize(720, h);
    this._drawRect(overlay, 720, h, new Color(0, 8, 24, 132));
    this._floorSelectModal = overlay;
    overlay.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
      if (event.target === overlay) this._closeFloorSelectModal();
    });

    const panel = new Node('Panel');
    panel.setParent(overlay);
    panel.setPosition(0, 8, 0);
    panel.addComponent(UITransform).setContentSize(620, 780);
    this._drawRoundedRect(
      panel,
      620,
      780,
      28,
      new Color(12, 42, 86, 214),
      new Color(255, 205, 85, 240),
    );
    panel.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
      event.propagationStopped = true;
    });

    const title = this._makeLabel(panel, 'Title', 325, 34, 520, 52);
    title.string = '选择远征楼层';
    title.color = new Color(255, 226, 130, 255);
    title.isBold = true;

    const activeFloor = activeRes.challenge?.floor ?? null;
    const subtitle = this._makeLabel(panel, 'Subtitle', 268, 22, 540, 42);
    subtitle.color = new Color(190, 225, 255, 226);

    const chapterRowY = 195;
    const chapterTitle = this._makeLabel(panel, 'ChapterTitle', chapterRowY, 30, 220, 42);
    chapterTitle.color = new Color(255, 226, 130, 255);
    chapterTitle.isBold = true;

    const prevChapterBtn = new Node('PrevChapter');
    prevChapterBtn.setParent(panel);
    prevChapterBtn.setPosition(-210, chapterRowY, 0);
    prevChapterBtn.addComponent(UITransform).setContentSize(74, 54);
    const prevChapterLabel = this._makeLabel(prevChapterBtn, 'Label', 0, 24, 62, 46);
    prevChapterLabel.string = '◀';
    prevChapterLabel.isBold = true;

    const nextChapterBtn = new Node('NextChapter');
    nextChapterBtn.setParent(panel);
    nextChapterBtn.setPosition(210, chapterRowY, 0);
    nextChapterBtn.addComponent(UITransform).setContentSize(74, 54);
    const nextChapterLabel = this._makeLabel(nextChapterBtn, 'Label', 0, 24, 62, 46);
    nextChapterLabel.string = '▶';
    nextChapterLabel.isBold = true;

    const floorGrid = new Node('FloorGrid');
    floorGrid.setParent(panel);

    const tip = this._makeLabel(panel, 'Tip', -120, 20, 540, 72);
    tip.color = new Color(210, 235, 255, 218);

    const maxUnlockedFloor = Math.max(1, Math.min(MAX_READY_FLOOR, profile.highestUnlockedFloor || 1));
    const latestChapter = maxUnlockedChapter(maxUnlockedFloor);
    // 无进行中挑战时默认打开「最新解锁章节」；有续玩进度则落在该层所在章。
    let currentChapter: ChapterId = activeFloor
      ? chapterIdForFloor(activeFloor)
      : latestChapter;
    if (currentChapter > latestChapter) currentChapter = latestChapter;
    // 打开选层时就开始预热当前章分包，缩短切场景后的等待。
    preloadChapter(currentChapter);

    const paintChapterArrow = (node: Node, label: Label, enabled: boolean): void => {
      this._drawRoundedRect(
        node,
        74,
        54,
        16,
        enabled ? new Color(20, 82, 150, 220) : new Color(42, 52, 70, 148),
        enabled ? new Color(255, 218, 110, 240) : new Color(120, 140, 160, 150),
      );
      label.color = enabled ? new Color(245, 250, 255, 255) : new Color(170, 180, 190, 190);
      const button = node.getComponent(Button);
      if (button) button.interactable = enabled;
    };

    // 箭头只绑一次：反复 off(TOUCH_END) 会清掉 Button 内部触摸，导致「看起来可点但点了没反应」
    prevChapterBtn.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
      event.propagationStopped = true;
    });
    nextChapterBtn.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
      event.propagationStopped = true;
    });
    this._bindButton(prevChapterBtn, () => {
      if (currentChapter <= 1) return;
      currentChapter = (currentChapter - 1) as ChapterId;
      renderChapter();
    });
    this._bindButton(nextChapterBtn, () => {
      if (currentChapter >= latestChapter || currentChapter >= MAX_READY_CHAPTER) return;
      currentChapter = (currentChapter + 1) as ChapterId;
      renderChapter();
    });

    const renderChapter = (): void => {
      floorGrid.destroyAllChildren();
      preloadChapter(currentChapter);

      const chapterStart = chapterStartFloor(currentChapter);
      const chapterEnd = chapterEndFloor(currentChapter);
      const unlockedInView = maxUnlockedFloor < chapterStart
        ? 0
        : maxUnlockedFloor >= chapterEnd
          ? CHAPTER_SIZE
          : chapterFloorOf(maxUnlockedFloor);
      const latestChapterFloor = chapterFloorOf(maxUnlockedFloor);

      chapterTitle.string = chapterDisplayName(currentChapter);
      subtitle.string = activeFloor
        ? `当前有第 ${activeFloor} 层挑战进度；选择其他楼层会放弃该进度`
        : `已解锁到${chapterDisplayName(latestChapter)}第 ${latestChapterFloor} 层`;
      if (currentChapter >= MAX_READY_CHAPTER) {
        tip.string = `${chapterDisplayName(currentChapter)}共 ${CHAPTER_SIZE} 层；已是当前全部远征内容。`;
      } else if (currentChapter < latestChapter) {
        tip.string = `${chapterDisplayName(currentChapter)}共 ${CHAPTER_SIZE} 层；可翻页查看更新章节。`;
      } else if (unlockedInView >= CHAPTER_SIZE && latestChapter < MAX_READY_CHAPTER) {
        tip.string = `${chapterDisplayName(currentChapter)}共 ${CHAPTER_SIZE} 层；通关本章后解锁下一章。`;
      } else {
        tip.string = `${chapterDisplayName(currentChapter)}共 ${CHAPTER_SIZE} 层；未解锁楼层暂不可进入。`;
      }
      paintChapterArrow(prevChapterBtn, prevChapterLabel, currentChapter > 1);
      paintChapterArrow(
        nextChapterBtn,
        nextChapterLabel,
        currentChapter < latestChapter && currentChapter < MAX_READY_CHAPTER,
      );

      const cols = 4;
      const btnW = 126;
      const btnH = 78;
      const gapX = 22;
      const gapY = 22;
      const startX = -((cols - 1) * (btnW + gapX)) / 2;
      const startY = 90;
      for (let floor = chapterStart; floor <= chapterEnd; floor += 1) {
        const chapterFloor = chapterFloorOf(floor);
        const index = floor - chapterStart;
        const col = index % cols;
        const row = Math.floor(index / cols);
        const x = startX + col * (btnW + gapX);
        const y = startY - row * (btnH + gapY);
        const unlocked = floor <= maxUnlockedFloor;
        const resume = activeFloor === floor;
        const tutorialFree = floor === 1 && profile.tutorialFreeChallengeConsumed !== true;
        const label = resume
          ? `继续\n第${chapterFloor}层`
          : unlocked
            ? `挑战\n第${chapterFloor}层\n${tutorialFree ? '首次免费' : `${PVE_STAMINA_CHALLENGE_COST}体力`}`
            : `未解锁\n第${chapterFloor}层`;
        this._makeFloorButton(floorGrid, label, x, y, btnW, btnH, unlocked, () => {
          void this._confirmFloorAndEnter(floor, resume, tutorialFree);
        });
      }
    };

    renderChapter();

    this._makeTransparentButton(panel, '取消', 0, -310, 180, 58, () => this._closeFloorSelectModal());
    applyUiLayerTree(overlay, this.node.layer);
  }

  private _makeFloorButton(
    parent: Node,
    text: string,
    x: number,
    y: number,
    width: number,
    height: number,
    enabled: boolean,
    onClick: () => void,
  ): void {
    const node = new Node(`Floor_${text.replace(/\s+/g, '_')}`);
    node.setParent(parent);
    node.setPosition(x, y, 0);
    node.addComponent(UITransform).setContentSize(width, height);
    this._drawRoundedRect(
      node,
      width,
      height,
      16,
      enabled ? new Color(20, 82, 150, 220) : new Color(42, 52, 70, 148),
      enabled ? new Color(255, 218, 110, 240) : new Color(120, 140, 160, 150),
    );
    const label = this._makeLabel(node, 'Label', 0, 24, width - 12, height - 8);
    label.string = text;
    label.isBold = true;
    label.color = enabled ? new Color(245, 250, 255, 255) : new Color(170, 180, 190, 190);
    if (enabled) {
      node.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
        event.propagationStopped = true;
      });
      this._bindButton(node, onClick);
    }
  }

  private async _confirmFloorAndEnter(
    floor: number,
    resume: boolean,
    tutorialFree: boolean,
  ): Promise<void> {
    if (this._busy) return;
    if (!resume && !tutorialFree && this._stamina < PVE_STAMINA_CHALLENGE_COST) {
      this._setStatus(`体力不足：挑战需要 ${PVE_STAMINA_CHALLENGE_COST} 点体力`);
      return;
    }
    this._busy = true;
    try {
      const ok = await this._ensureWarmReady('正在进入远征…');
      if (!ok) return;
      // 切场景前就开始下章节包，避免进战后再弹一次「进入第N章」。
      preloadChapter(chapterIdForFloor(floor));
      GameSession.pendingPveFloor = floor;
      this._closeFloorSelectModal();
      this._gotoScene(
        resume ? `继续第 ${floor} 层…` : `进入第 ${floor} 层…`,
        () => SceneLoader.loadPveExpedition(),
      );
    } finally {
      this._busy = false;
    }
  }

  private _closeFloorSelectModal(): void {
    this._floorSelectModal?.destroy();
    this._floorSelectModal = null;
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

  /** 更新玩家卡内的“最高/全服”两枚短标签，保证文字不挤出底板。 */
  private _updateMetaLine(): void {
    if (this._metaFloorLabel) {
      this._metaFloorLabel.string = `最高 ${this._metaFloor}`;
      this._metaFloorLabel.fontSize = 18;
      this._metaFloorLabel.lineHeight = 22;
    }
    if (this._metaRankLabel) {
      this._metaRankLabel.string = this._metaRank != null ? `全服 ${this._metaRank}` : '全服 -';
      this._metaRankLabel.fontSize = 18;
      this._metaRankLabel.lineHeight = 22;
    }
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

  private async _showCampModal(): Promise<void> {
    if (this._busy) return;
    this._busy = true;
    try {
      const profile = await this._ensureWarmedProfile('正在读取营地…');
      if (!profile) return;
      void this._warmLobbyBackground();
      const controller = this.node.getComponent(CampController) ?? this.node.addComponent(CampController);
      controller.open(this.node, () => { void this._refreshLobbyData(); }, profile);
    } finally {
      this._busy = false;
    }
  }

  private async _showPartnerModal(): Promise<void> {
    if (this._busy) return;
    this._busy = true;
    try {
      const profile = await this._ensureWarmedProfile('正在读取伙伴…');
      if (!profile) return;
      void this._warmLobbyBackground();
      const controller = this.node.getComponent(PartnerController) ?? this.node.addComponent(PartnerController);
      controller.open(this.node, () => { void this._refreshLobbyData(); }, profile);
    } finally {
      this._busy = false;
    }
  }

  private async _showMinghenShop(): Promise<void> {
    if (this._busy) return;
    this._busy = true;
    try {
      const profile = await this._ensureWarmedProfile('正在打开今日商会…');
      if (!profile) return;
      void this._warmLobbyBackground();
      const controller = this.node.getComponent(MinghenShopController)
        ?? this.node.addComponent(MinghenShopController);
      controller.open(this.node, () => { void this._refreshLobbyData(); }, profile);
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
    title.string = '排行榜';
    title.color = new Color(255, 220, 105, 255);
    title.isBold = true;

    const rankText = myRank != null ? `我的排名：全服第 ${myRank} 名` : '我尚未上榜';
    const subtitle = this._makeLabel(panel, 'Subtitle', 0, 20, 500, 32);
    subtitle.node.setPosition(0, 286, 0);
    subtitle.string = rankText;
    subtitle.color = new Color(170, 215, 255, 220);
    subtitle.isBold = true;

    const ROW_H = 60;
    const ROW_GAP = 14;
    const ROW_STEP = ROW_H + ROW_GAP;
    const SV_W = 548;
    const SV_H = 560;
    const CONTENT_H = Math.max(SV_H, entries.length * ROW_STEP);

    const svNode = new Node('ScrollArea');
    svNode.setParent(panel);
    svNode.setPosition(0, -14, 0);
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
    contentNode.setPosition(0, (CONTENT_H - SV_H) / 2, 0);
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

      const rowBg = isSelf
        ? new Color(30, 100, 200, 150)
        : index % 2 === 0
          ? new Color(28, 72, 128, 110)
          : new Color(18, 56, 106, 110);
      const rowStroke = isSelf ? new Color(130, 210, 255, 240) : undefined;
      this._drawRoundedRect(row, SV_W - 16, ROW_H, 10, rowBg, rowStroke);

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

      const nameLabel = this._makeLabel(row, 'Name', 0, 24, 320, ROW_H - 12);
      nameLabel.node.setPosition(-30, 0, 0);
      nameLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
      nameLabel.string = entry.nickname;
      nameLabel.color = isSelf ? new Color(200, 235, 255, 255) : new Color(228, 240, 255, 255);
      nameLabel.isBold = true;

      const floorLabel = this._makeLabel(row, 'Floor', 0, 24, 110, ROW_H - 12);
      floorLabel.node.setPosition(208, 0, 0);
      floorLabel.string = `${entry.highestFloor} 层`;
      floorLabel.color = entry.rank <= 3
        ? new Color(255, 220, 105, 255)
        : new Color(200, 230, 255, 220);
      floorLabel.isBold = true;
    });

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
    const PANEL_H = 560;
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
    title.node.setPosition(0, 210, 0);
    title.string = '修改头像和昵称';
    title.color = new Color(255, 220, 105, 255);

    const tip = this._makeLabel(panel, 'Tip', 0, 22, 460, 28);
    tip.node.setPosition(0, 160, 0);
    tip.string = '当前：' + (GameSession.user?.nickname ?? '玩家');
    tip.color = new Color(170, 215, 255, 220);

    this._makeTransparentButton(panel, '同步微信账号（昵称 + 头像）', 0, 85, 420, 64, () => {
      void this._syncWxProfile();
    });
    this._makeTransparentButton(panel, '手动改名', 0, 5, 420, 64, () => {
      void this._editNicknameManually();
    });
    this._makeTransparentButton(panel, '重新进行新手教学', 0, -75, 420, 64, () => {
      void updatePveMeta({ resetTutorial: true }).then(() => {
        this._setStatus('已重置教学。下次开启新远征时会进入教学层');
        this._closeProfileMenu();
      }).catch((err) => {
        this._setStatus(`重置失败：${this._formatErr(err)}`);
      });
    });
    this._makeTransparentButton(panel, '取消', 0, -170, 200, 56, () => this._closeProfileMenu());

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

  private _makeTopAssetBadge(
    parent: Node,
    name: string,
    x: number,
    y: number,
    iconKey: string,
    width: number,
    height: number,
    iconSize: number,
    valueFontSize = 25,
  ): Label {
    const chip = new Node(name);
    chip.setParent(parent);
    chip.setPosition(x, y, 0);
    chip.addComponent(UITransform).setContentSize(width, height);
    this._drawRoundedRect(
      chip,
      width,
      height,
      22,
      new Color(8, 28, 62, 214),
      new Color(110, 182, 236, 185),
    );

    const topHighlight = new Node('TopHighlight');
    topHighlight.setParent(chip);
    topHighlight.setPosition(12, height / 2 - 10, 0);
    topHighlight.addComponent(UITransform).setContentSize(width - 42, 8);
    this._drawRoundedRect(
      topHighlight,
      width - 42,
      8,
      4,
      new Color(230, 245, 255, 34),
    );

    const iconPlate = new Node('IconPlate');
    iconPlate.setParent(chip);
    iconPlate.setPosition(-width / 2 + 12, 0, 0);
    iconPlate.addComponent(UITransform).setContentSize(50, 50);
    this._drawCircle(
      iconPlate,
      23,
      new Color(10, 36, 78, 238),
      new Color(126, 196, 236, 224),
      2,
    );

    const icon = new Node('ResourceIcon');
    icon.setParent(iconPlate);
    icon.setPosition(-1, 0, 0);
    icon.addComponent(UITransform).setContentSize(iconSize, iconSize);
    const frame = getCachedSprite(iconKey);
    if (frame) {
      ensureArtChild(icon, 'IconArt', frame, iconSize, iconSize);
    }

    const value = this._makeLabel(chip, 'Value', 0, valueFontSize, width - 52, 30);
    value.node.setPosition(16, 2, 0);
    value.horizontalAlign = Label.HorizontalAlign.CENTER;
    value.overflow = Label.Overflow.SHRINK;
    value.fontSize = valueFontSize;
    value.lineHeight = valueFontSize + 4;
    value.enableOutline = true;
    value.outlineColor = new Color(7, 22, 48, 230);
    value.outlineWidth = 2;
    value.color = new Color(244, 248, 255, 255);
    return value;
  }

  private _applyTopAssetBadgeIcons(): void {
    const root = this.node.getChildByName('PveLobbyRoot');
    if (!root) return;
    const strip = root.getChildByName('TopAssetStrip');
    if (!strip) return;
    const iconMap: Record<string, { key: string; size: number }> = {
      StardustChip: { key: 'pve/lobby/icon_chip_stardust', size: 44 },
      StaminaChip: { key: 'pve/lobby/icon_chip_stamina', size: 42 },
    };
    for (const [name, config] of Object.entries(iconMap)) {
      const chip = strip.getChildByName(name);
      if (!chip) continue;
      const iconPlate = chip.getChildByName('IconPlate');
      if (!iconPlate) continue;
      const iconNode = iconPlate.getChildByName('ResourceIcon');
      const frame = getCachedSprite(config.key);
      if (!iconNode || !frame) continue;
      iconNode.removeAllChildren();
      ensureArtChild(iconNode, 'IconArt', frame, config.size, config.size);
    }
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
    node.on(Button.EventType.CLICK, () => {
      playSfx(SFX_IDS.UI_CLICK);
      onClick();
    }, this);
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

  private _applyMetaSnapshot(meta: PveMeta): void {
    // 顶部货币芯片展示档案星尘（profile.gold），不再用 meta.diamond
    this._metaFloor = meta.highestFloor ?? 0;
    this._updateMetaLine();
    this._updateStaminaLabels();
  }

  private _applyProfileStamina(profile: PveProfile): void {
    this._stamina = Math.max(0, Math.min(
      PVE_STAMINA_MAX,
      Math.floor(profile.stamina ?? PVE_STAMINA_MAX),
    ));
    this._staminaMax = PVE_STAMINA_MAX;
    this._staminaNextRecoveryAt = profile.staminaNextRecoveryAt ?? null;
    this._updateStaminaLabels();
  }

  private _applyStardust(amount: number): void {
    if (this._stardustLabel) this._stardustLabel.string = String(Math.max(0, Math.floor(amount)));
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
    this._staminaTimerLabel.string = `${minutes}:${secondsText}`;
  }

  private _gotoScene(text: string, load: () => void): void {
    stopMainBgm();
    LoadingOverlay.show(this.node, text, () => this._setStatus('加载较慢，请检查网络'));
    this.scheduleOnce(load, 0);
  }

  private _setStatus(text: string): void {
    const displayText = this._formatDisplayText(text);
    if (this._statusLabel) this._statusLabel.string = displayText;
    console.log('[PveLobby]', displayText);
  }

  private _formatDisplayText(text: string): string {
    return text.replace(/钻石/g, '星尘');
  }

  onDestroy(): void {
    stopMainBgm();
    this.unschedule(this._tickStamina);
    this._unbindResize?.();
    this._unbindResize = null;
  }
}
