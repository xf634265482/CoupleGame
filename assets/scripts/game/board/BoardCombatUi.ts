import {
  Button,
  Color,
  Graphics,
  Label,
  Mask,
  Node,
  ScrollView,
  SpriteFrame,
  UITransform,
  Vec3,
} from 'cc';
import {
  FINAL_DIVINE_STRIKE_DIAMOND,
  FINAL_WEAPON_UPGRADE_GOLD,
  GOLD_SHOP_PRICES,
  INITIAL_HP,
  LEGENDARY_SHOP_PRICES,
  LUCKY_FAST_INTERVAL_MS,
  LUCKY_SLOW_DURATION_MS,
  LUCKY_SLOW_INTERVAL_START_MS,
  LUCKY_SLOW_INTERVAL_STEP_MS,
  WEAPON_STATS,
} from '../../core/Constants';
import { GameSession } from '../../core/GameSession';
import { DESIGN_H, DESIGN_W } from '../../platform/wechat/ViewAdapt';
import type {
  ConsumableItemType,
  GameDoc,
  GamePlayer,
  GoldShopItemType,
  LegendaryShopItemType,
  LuckySpinState,
  RegionIndex,
  ShopType,
} from '../../types/GameTypes';
import { playerDisplayName } from '../playerDisplayName';
import {
  CELL_TYPE_SPRITE,
  getCachedSprite,
  loadUiSprite,
  resolveItemIconKey,
  STATUS_ICON_KEY,
} from '../../ui/UiAssets';
import { buildOptionRow, paintOptionRowHighlight } from '../../ui/OptionListUi';
import {
  ensureArtChild,
  ensureArtSliced,
  pickSpriteLayout,
} from '../../ui/UiSprite';
import { applyModalButtonArt, makeModalButton } from './UiModalButton';

const MODAL_SLICE = { top: 36, bottom: 36, left: 36, right: 36 };
/** 逻辑行高 + 行间距：须大于按钮美术外扩，否则视觉上仍会叠在一起 */
const MODAL_ROW_H = 50;
const MODAL_ROW_GAP = 16;
const MODAL_BTN_W = 440;
const MODAL_ICON_SIZE = 28;
const MODAL_ICON_EDGE = 8;
const MODAL_ICON_TEXT_GAP = 30;
const MODAL_TITLE_BODY_GAP = 14;
const MODAL_CLOSE_GAP = 16;
const GUIDE_ICON_SIZE = 26;
/** 格子贴图含石框，同盒内等比缩小以匹配状态图标视觉大小 */
const GUIDE_CELL_ART_RATIO = 0.55;
/** 事件弹窗（BOSS 等）选项按钮：改前为 440×50、间距 16 */
const EVENT_BTN_W = 300;
const EVENT_BTN_H = 44;
const EVENT_BTN_GAP = MODAL_ROW_GAP + 5;
const GUIDE_ICON_TEXT_GAP = 40;
const GUIDE_ICON_LEFT_PAD = 24;
const GUIDE_CONTENT_INSET = 22;
const GUIDE_SECTION_TITLE_GAP = 48;
/** 幸运格右栏三按钮统一尺寸（宽 × 高 × 间距） */
const LUCKY_BTN_W = 200;
const LUCKY_BTN_H = 72;
const LUCKY_BTN_GAP = 10;
import { ringDistance } from './boardLayout';

const SEAT_COLORS = [
  new Color(255, 100, 100, 255),
  new Color(100, 180, 255, 255),
  new Color(120, 220, 140, 255),
  new Color(255, 210, 90, 255),
];

const ITEM_LABELS: Record<ConsumableItemType, string> = {
  DOUBLE_DICE: '双骰子',
  TRAP: '陷阱',
  MEDKIT: '医疗包',
};

const STATUS_GUIDE_ROWS: { key: string; title: string; desc: string }[] = [
  {
    key: STATUS_ICON_KEY.INFECTED,
    title: '感染',
    desc: '每回合 -0.5 HP、伤害 +0.5、攻击范围 +2；造成伤害可传染，免疫药水可治愈。',
  },
  {
    key: STATUS_ICON_KEY.BOUNTY,
    title: '天选悬赏',
    desc: '每回合 +100 金币并成为悬赏目标；击杀者获得其全部资源且永久伤害 +1。',
  },
  {
    key: STATUS_ICON_KEY.AMULET,
    title: '神秘护符',
    desc: '拍卖会同款护符，提供额外增益效果。',
  },
  {
    key: STATUS_ICON_KEY.KILL,
    title: '击杀',
    desc: '本局击败其他玩家的次数，显示在玩家信息卡角标上。',
  },
];

const CELL_GUIDE_ROWS: { type: string; title: string; desc: string }[] = [
  { type: 'NORMAL', title: '普通格', desc: '无特殊效果，安全路过。' },
  { type: 'GOLD', title: '金币格', desc: '路过可获得金币。' },
  { type: 'DIAMOND', title: '钻石格', desc: '路过可获得钻石。' },
  { type: 'SUPPLY', title: '补给格', desc: '获得补给箱或恢复资源。' },
  { type: 'WASTE', title: '废格', desc: '通常无收益；决战阶段会变为燃烧格。' },
  { type: 'BURNING', title: '燃烧格', desc: '路过会受到伤害。' },
  { type: 'EVENT', title: '事件格', desc: '触发随机事件（BOSS、商人、宝箱、感染等）。' },
  { type: 'GOLD_SHOP', title: '金币商店', desc: '消耗金币购买普通道具。' },
  { type: 'LEGENDARY_SHOP', title: '传说商店', desc: '消耗钻石购买高级道具。' },
  { type: 'FINAL_SHOP', title: '决战商店', desc: '购买决战强化。' },
  { type: 'LUCKY', title: '幸运格', desc: '转盘抽取奖励或效果。' },
];

const SHOP_ITEM_LABELS: Record<string, string> = {
  SWORD: '剑',
  HELMET: '头盔',
  MARCHING_SHOES: '行军鞋',
  DOUBLE_DICE: '双骰子',
  TRAP: '陷阱',
  GUN: '枪',
  ARMOR: '护甲',
  MEDKIT: '医疗包',
  IMMUNITY_POTION: '免疫药水',
  ROCKET: '火箭筒',
};

function fastIndexAt(lucky: LuckySpinState, atTime: number): number {
  const n = lucky.options.length;
  if (!lucky.startedAt || n <= 0) return 0;
  return Math.floor((atTime - lucky.startedAt) / LUCKY_FAST_INTERVAL_MS) % n;
}

function fastIndexAtSlow(lucky: LuckySpinState): number {
  if (!lucky.slowAt) return 0;
  return fastIndexAt(lucky, lucky.slowAt);
}

function slowIndexAt(lucky: LuckySpinState, now: number): number {
  const n = lucky.options.length;
  if (!lucky.slowAt || n <= 0) return 0;
  if (lucky.stopAt && now >= lucky.stopAt) {
    return lucky.finalIndex ?? fastIndexAtSlow(lucky);
  }
  let elapsed = now - lucky.slowAt;
  let idx = fastIndexAtSlow(lucky);
  let step = 0;
  while (elapsed > 0) {
    const interval =
      LUCKY_SLOW_INTERVAL_START_MS + step * LUCKY_SLOW_INTERVAL_STEP_MS;
    if (elapsed < interval) break;
    elapsed -= interval;
    idx = (idx + 1) % n;
    step += 1;
  }
  return idx;
}

function computeLuckyHighlightIndex(lucky: LuckySpinState, now = Date.now()): number {
  const n = lucky.options.length;
  if (n <= 0) return 0;
  if (lucky.phase === 'READY') return 0;
  if (lucky.phase === 'DONE') return lucky.finalIndex ?? 0;
  if (lucky.phase === 'FAST' && lucky.startedAt) {
    return fastIndexAt(lucky, now);
  }
  if (lucky.phase === 'SLOW') {
    return slowIndexAt(lucky, now);
  }
  return 0;
}

const GOLD_ITEMS: GoldShopItemType[] = [
  'SWORD',
  'HELMET',
  'MARCHING_SHOES',
  'DOUBLE_DICE',
  'TRAP',
  'IMMUNITY_POTION',
];
const LEGENDARY_ITEMS: LegendaryShopItemType[] = ['GUN', 'ARMOR', 'MEDKIT'];

type ModalOption = { id: string; label: string; disabled?: boolean };

/** 商店/道具/攻击选择 + 战斗日志 */
export class BoardCombatUi {
  private _parent: Node;
  private _logRoot: Node;
  private _logLabel: Label | null = null;
  private _logLines: string[] = [];
  private _modal: Node | null = null;
  private _luckyTimer: ReturnType<typeof setInterval> | null = null;
  private _useModalArt = false;
  private _luckyUi: {
    root: Node;
    opts: Node[];
    lucky: LuckySpinState;
    highlight: (index: number) => void;
    title: Label;
    startBtn: Node;
    stopBtn: Node;
    isActor: boolean;
    resultTimer: ReturnType<typeof setTimeout> | null;
  } | null = null;

  applyArt(): void {
    this._useModalArt = !!getCachedSprite('board/panels/panel_board_modal_9s');
  }

  constructor(parent: Node) {
    this._parent = parent;
    this._logRoot = new Node('CombatLog');
    this._logRoot.setParent(parent);
    // 旧日志条已由右侧「消息」面板替代
    this._logRoot.active = false;
    // 棋盘放大后，日志略上移并加宽
    this._logRoot.setPosition(new Vec3(0, 580, 0));
    this._logRoot.addComponent(UITransform).setContentSize(760, 130);
    const bg = this._logRoot.addComponent(Graphics);
    bg.fillColor = new Color(0, 0, 0, 140);
    bg.rect(-380, -65, 760, 130);
    bg.fill();
    const ln = new Node('Text');
    ln.setParent(this._logRoot);
    ln.addComponent(UITransform).setContentSize(740, 120);
    this._logLabel = ln.addComponent(Label);
    this._logLabel.fontSize = 20;
    this._logLabel.lineHeight = 24;
    this._logLabel.color = new Color(230, 235, 245, 255);
    this._logLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
    this._logLabel.overflow = Label.Overflow.SHRINK;
    this._logLabel.string = '';
  }

  appendLog(line: string): void {
    this._logLines.push(line);
    if (this._logLines.length > 5) this._logLines.shift();
    if (this._logLabel) {
      this._logLabel.string = this._logLines.join('\n');
    }
  }

  clearLog(): void {
    this._logLines = [];
    if (this._logLabel) this._logLabel.string = '';
  }

  showEventModal(
    title: string,
    description: string,
    effect: string,
    options: ModalOption[],
    onPick: (id: string) => void,
    onCancel?: () => void,
  ): void {
    this.dismissModal();
    const root = new Node('EventModal');
    root.setParent(this._parent);
    root.setPosition(new Vec3(0, 0, 0));
    this._modal = root;

    const btnW = EVENT_BTN_W;
    const btnH = EVENT_BTN_H;
    const btnGap = EVENT_BTN_GAP;
    const textAreaH = 196;
    const optionBlockH = Math.max(0, options.length * (btnH + btnGap) - btnGap);
    const bottomPad = onCancel ? btnH + MODAL_CLOSE_GAP + 12 : 28;
    const boxH = Math.min(
      520,
      textAreaH + 28 + optionBlockH + bottomPad,
    );

    const box = new Node('Box');
    box.setParent(root);
    box.addComponent(UITransform).setContentSize(600, boxH);
    const modalSf = getCachedSprite('board/panels/panel_board_modal_9s');
    if (this._useModalArt && modalSf) {
      ensureArtSliced(box, 'ModalArt', modalSf, 600, boxH, MODAL_SLICE);
    }

    const titleN = new Node('Title');
    titleN.setParent(box);
    titleN.setPosition(new Vec3(0, boxH / 2 - 32, 0));
    titleN.addComponent(UITransform).setContentSize(560, 44);
    const tl = titleN.addComponent(Label);
    tl.string = title;
    tl.fontSize = 30;
    tl.color = new Color(255, 220, 100, 255);
    tl.horizontalAlign = Label.HorizontalAlign.CENTER;

    const descN = new Node('Desc');
    descN.setParent(box);
    descN.setPosition(new Vec3(0, boxH / 2 - 86, 0));
    descN.addComponent(UITransform).setContentSize(540, 64);
    const dl = descN.addComponent(Label);
    dl.string = description;
    dl.fontSize = 22;
    dl.lineHeight = 28;
    dl.color = new Color(235, 235, 240, 255);
    dl.horizontalAlign = Label.HorizontalAlign.LEFT;
    dl.overflow = Label.Overflow.SHRINK;
    dl.enableWrapText = true;

    const effN = new Node('Effect');
    effN.setParent(box);
    effN.setPosition(new Vec3(0, boxH / 2 - 148, 0));
    effN.addComponent(UITransform).setContentSize(540, 64);
    const el = effN.addComponent(Label);
    el.string = `效果：${effect}`;
    el.fontSize = 20;
    el.lineHeight = 26;
    el.color = new Color(200, 210, 230, 255);
    el.horizontalAlign = Label.HorizontalAlign.LEFT;
    el.overflow = Label.Overflow.SHRINK;
    el.enableWrapText = true;

    const optsBaseY = -boxH / 2 + bottomPad + btnH / 2;
    options.forEach((opt, i) => {
      const y = optsBaseY + i * (btnH + btnGap);
      this._luckyModalBtn(
        box,
        opt.label,
        0,
        y,
        btnW,
        btnH,
        () => {
          this.dismissModal();
          onPick(opt.id);
        },
        !!opt.disabled,
      );
    });

    if (onCancel) {
      this._luckyModalBtn(
        box,
        '关闭',
        0,
        -boxH / 2 + MODAL_CLOSE_GAP + btnH / 2,
        220,
        btnH,
        () => {
          this.dismissModal();
          onCancel();
        },
      );
    }
  }

  dismissModal(): void {
    if (this._modal) {
      this._modal.destroy();
      this._modal = null;
    }
  }

  destroy(): void {
    this._clearLucky();
    this.dismissModal();
    this._logLines = [];
    if (this._logLabel?.isValid) this._logLabel.string = '';
  }

  hasLuckySpin(): boolean {
    return this._luckyUi != null;
  }

  clearLuckyIfOpen(): void {
    this._clearLucky();
  }

  updateLuckySpin(lucky: LuckySpinState | null): void {
    if (!this._luckyUi || !lucky) return;
    this._luckyUi.lucky = lucky;
    this._luckyUi.highlight(computeLuckyHighlightIndex(lucky));
    this._syncLuckyButtons(lucky);
  }

  /** 减速结束后展示奖励并自动关闭 */
  finishLuckySpin(rewardMessage: string, onClosed?: () => void): void {
    if (!this._luckyUi) return;
    const ui = this._luckyUi;
    if (ui.resultTimer) {
      clearTimeout(ui.resultTimer);
      ui.resultTimer = null;
    }
    if (ui.lucky.finalIndex != null) {
      ui.highlight(ui.lucky.finalIndex);
    }
    const picked =
      ui.lucky.finalIndex != null
        ? ui.lucky.options[ui.lucky.finalIndex]
        : '';
    ui.title.string = picked
      ? `选中：${picked}\n${rewardMessage}`
      : rewardMessage;
    ui.title.fontSize = 28;
    ui.title.lineHeight = 34;
    this._setLuckyBtnEnabled(ui.startBtn, false);
    this._setLuckyBtnEnabled(ui.stopBtn, false);
    ui.resultTimer = setTimeout(() => {
      this._clearLucky();
      onClosed?.();
    }, 2200);
  }

  private _setLuckyBtnEnabled(btn: Node, enabled: boolean): void {
    const ut = btn.getComponent(UITransform);
    const w = ut?.contentSize.width ?? LUCKY_BTN_W;
    const h = ut?.contentSize.height ?? LUCKY_BTN_H;
    applyModalButtonArt(btn, w, h, !enabled);
    const g = btn.getComponent(Graphics);
    if (g) g.enabled = false;
    const lbl = btn.getChildByName('L')?.getComponent(Label);
    if (lbl) {
      lbl.color = enabled
        ? new Color(255, 255, 255, 255)
        : new Color(140, 140, 150, 255);
    }
    const button = btn.getComponent(Button);
    if (button) button.interactable = enabled;
  }

  private _syncLuckyButtons(lucky: LuckySpinState): void {
    if (!this._luckyUi) return;
    const { isActor, startBtn, stopBtn, title } = this._luckyUi;
    if (lucky.phase === 'READY') {
      this._setLuckyBtnEnabled(startBtn, isActor);
      this._setLuckyBtnEnabled(stopBtn, false);
      title.string = '幸运格';
    } else if (lucky.phase === 'FAST') {
      this._setLuckyBtnEnabled(startBtn, false);
      this._setLuckyBtnEnabled(stopBtn, isActor);
      title.string = '幸运格';
    } else if (lucky.phase === 'SLOW') {
      this._setLuckyBtnEnabled(startBtn, false);
      this._setLuckyBtnEnabled(stopBtn, false);
      title.string = '减速停止中…';
    }
  }

  private _clearLucky(): void {
    if (this._luckyTimer) {
      clearInterval(this._luckyTimer);
      this._luckyTimer = null;
    }
    if (this._luckyUi) {
      if (this._luckyUi.resultTimer) {
        clearTimeout(this._luckyUi.resultTimer);
      }
      this._luckyUi.root.destroy();
      this._luckyUi = null;
    }
  }

  private _showModal(
    title: string,
    options: ModalOption[],
    onPick: (id: string) => void,
    onCancel?: () => void,
    cancelText = '关闭',
    modalOpts?: {
      plainRows?: boolean;
      contentPadV?: number;
      closeBtnOffsetY?: number;
      scrollBody?: boolean;
    },
  ): void {
    this.dismissModal();
    const root = new Node('Modal');
    root.setParent(this._parent);
    root.setPosition(new Vec3(0, 0, 0));
    this._modal = root;

    const rowH = MODAL_ROW_H;
    const rowGap = MODAL_ROW_GAP;
    const titleH = 56;
    const contentPadV = modalOpts?.contentPadV ?? 0;
    const closeH = onCancel ? rowH + MODAL_CLOSE_GAP : 0;
    const maxBoxH = Math.min(560, DESIGN_H - 100);
    const maxBodyH =
      maxBoxH - titleH - MODAL_TITLE_BODY_GAP - closeH - contentPadV * 2;
    const step = rowH + rowGap;
    const fullBodyH = Math.max(0, options.length * step - rowGap);
    const scrollBody = modalOpts?.scrollBody ?? false;
    const bodyH = scrollBody ? maxBodyH : Math.min(fullBodyH, maxBodyH);
    const boxH =
      titleH + MODAL_TITLE_BODY_GAP + bodyH + closeH + contentPadV * 2;
    const plainRows = modalOpts?.plainRows ?? false;

    const box = new Node('Box');
    box.setParent(root);
    box.setPosition(new Vec3(0, 0, 0));
    box.addComponent(UITransform).setContentSize(580, boxH);
    const modalSf = getCachedSprite('board/panels/panel_board_modal_9s');
    if (this._useModalArt && modalSf) {
      ensureArtSliced(box, 'ModalArt', modalSf, 580, boxH, MODAL_SLICE);
    }

    const titleN = new Node('Title');
    titleN.setParent(box);
    titleN.setPosition(new Vec3(0, boxH / 2 - titleH / 2 - 4 - contentPadV, 0));
    titleN.addComponent(UITransform).setContentSize(520, titleH);
    const tl = titleN.addComponent(Label);
    tl.string = title;
    tl.fontSize = 32;
    tl.color = new Color(255, 220, 100, 255);
    tl.horizontalAlign = Label.HorizontalAlign.CENTER;

    const mountOptionRow = (
      parent: Node,
      opt: ModalOption,
      y: number,
    ): void => {
      const btn = this._modalBtn(
        parent,
        opt.label,
        y,
        opt.disabled,
        plainRows ? null : resolveItemIconKey(opt.id),
        plainRows,
      );
      if (!opt.disabled) {
        btn.on(Button.EventType.CLICK, () => {
          this.dismissModal();
          onPick(opt.id);
        }, this);
      }
    };

    if (scrollBody) {
      const scrollW = 560;
      const scrollH = bodyH;
      const scrollTop =
        boxH / 2 - titleH - MODAL_TITLE_BODY_GAP - scrollH / 2 - contentPadV;
      const scrollRoot = new Node('ScrollView');
      scrollRoot.setParent(box);
      scrollRoot.setPosition(new Vec3(0, scrollTop, 0));
      scrollRoot.addComponent(UITransform).setContentSize(scrollW, scrollH);
      const scrollG = scrollRoot.addComponent(Graphics);
      scrollG.fillColor = new Color(18, 22, 34, 120);
      scrollG.rect(-scrollW / 2, -scrollH / 2, scrollW, scrollH);
      scrollG.fill();
      const scrollMask = scrollRoot.addComponent(Mask);
      scrollMask.type = Mask.Type.GRAPHICS_STENCIL;
      const scroll = scrollRoot.addComponent(ScrollView);
      scroll.vertical = true;
      scroll.horizontal = false;
      scroll.brake = 0.75;
      scroll.elastic = true;
      scroll.inertia = true;

      const content = new Node('Content');
      content.setParent(scrollRoot);
      const contentUt = content.addComponent(UITransform);
      contentUt.setContentSize(scrollW - 8, fullBodyH);
      contentUt.setAnchorPoint(0.5, 1);
      content.setPosition(0, scrollH / 2, 0);
      scroll.content = content;

      const listTop = -rowH / 2;
      options.forEach((opt, i) => {
        mountOptionRow(content, opt, listTop - i * step);
      });
    } else {
      const bodyTop =
        boxH / 2 - titleH - MODAL_TITLE_BODY_GAP - rowH / 2 - contentPadV;
      options.forEach((opt, i) => {
        mountOptionRow(box, opt, bodyTop - i * step);
      });
    }

    if (onCancel) {
      const closeY =
        -boxH / 2 +
        MODAL_CLOSE_GAP +
        rowH / 2 +
        contentPadV +
        (modalOpts?.closeBtnOffsetY ?? 0);
      makeModalButton(
        box,
        cancelText,
        0,
        closeY,
        220,
        rowH,
        () => {
          this.dismissModal();
          onCancel();
        },
      );
    }
  }

  private _modalBtn(
    parent: Node,
    text: string,
    y: number,
    disabled?: boolean,
    iconKey?: string | null,
    plain = false,
  ): Node {
    const iconSize = MODAL_ICON_SIZE;
    const iconGap = MODAL_ICON_TEXT_GAP;
    const btnW = MODAL_BTN_W;
    const btnH = MODAL_ROW_H;

    const n = new Node(`Opt_${text}`);
    n.setParent(parent);
    n.setPosition(new Vec3(0, y, 0));
    n.addComponent(UITransform).setContentSize(btnW, btnH);

    const bg = new Node('Bg');
    bg.setParent(n);
    bg.addComponent(UITransform).setContentSize(btnW, btnH);
    const g = bg.addComponent(Graphics);
    g.fillColor = disabled
      ? new Color(60, 65, 75, 255)
      : new Color(70, 100, 160, 255);
    g.rect(-btnW / 2, -btnH / 2, btnW, btnH);
    g.fill();
    if (!plain) {
      applyModalButtonArt(bg, btnW, btnH, !!disabled);
    }

    if (iconKey) {
      const iconLeft = -btnW / 2 + MODAL_ICON_EDGE + iconSize / 2;
      const iconBox = new Node('Icon');
      iconBox.setParent(n);
      iconBox.setPosition(new Vec3(iconLeft, 0, 0));
      const iconUt = iconBox.addComponent(UITransform);
      iconUt.setContentSize(iconSize, iconSize);
      const sf = getCachedSprite(iconKey);
      if (sf) {
        ensureArtChild(iconBox, 'Art', sf, iconSize, iconSize);
      } else {
        void loadUiSprite(iconKey).then((loaded) => {
          if (loaded && iconBox.isValid) {
            ensureArtChild(iconBox, 'Art', loaded, iconSize, iconSize);
          }
        });
      }
    }

    const ln = new Node('L');
    ln.setParent(n);
    const lnUt = ln.addComponent(UITransform);
    lnUt.setAnchorPoint(iconKey ? 0 : 0.5, 0.5);
    if (iconKey) {
      const textLeft = -btnW / 2 + MODAL_ICON_EDGE + iconSize + iconGap;
      const textW = btnW / 2 - textLeft - MODAL_ICON_EDGE;
      ln.setPosition(new Vec3(textLeft, 0, 0));
      lnUt.setContentSize(Math.max(80, textW), btnH);
    } else {
      ln.setPosition(new Vec3(0, 0, 0));
      lnUt.setContentSize(btnW, btnH);
    }
    const lbl = ln.addComponent(Label);
    lbl.string = text;
    lbl.fontSize = 20;
    lbl.lineHeight = 24;
    lbl.color = disabled
      ? new Color(140, 140, 150, 255)
      : new Color(255, 255, 255, 255);
    lbl.horizontalAlign = iconKey ? Label.HorizontalAlign.LEFT : Label.HorizontalAlign.CENTER;
    lbl.verticalAlign = Label.VerticalAlign.CENTER;
    lbl.overflow = Label.Overflow.SHRINK;
    lbl.enableWrapText = false;

    if (!disabled) {
      const btn = n.addComponent(Button);
      btn.transition = Button.Transition.SCALE;
      btn.zoomScale = 0.98;
      btn.target = n;
    }
    return n;
  }

  /** 幸运格按钮：与通用弹窗按钮同套 inset 素材，避免第三颗铺满溢出 */
  private _luckyModalBtn(
    parent: Node,
    text: string,
    x: number,
    y: number,
    w: number,
    h: number,
    onClick: () => void,
    disabled = false,
  ): Node {
    const n = new Node(`Btn_${text}`);
    n.setParent(parent);
    n.setPosition(x, y, 0);
    n.addComponent(UITransform).setContentSize(w, h);
    const g = n.addComponent(Graphics);
    g.fillColor = new Color(52, 120, 200, 255);
    g.rect(-w / 2, -h / 2, w, h);
    g.fill();
    applyModalButtonArt(n, w, h, disabled);

    const ln = new Node('L');
    ln.setParent(n);
    ln.addComponent(UITransform).setContentSize(w, h);
    const lbl = ln.addComponent(Label);
    lbl.string = text;
    lbl.fontSize = Math.max(22, Math.round(h * 0.38));
    lbl.color = disabled ? new Color(150, 155, 170, 255) : new Color(255, 255, 255, 255);
    lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
    lbl.verticalAlign = Label.VerticalAlign.CENTER;
    lbl.overflow = Label.Overflow.SHRINK;

    const btn = n.addComponent(Button);
    btn.transition = Button.Transition.SCALE;
    btn.zoomScale = 0.96;
    btn.target = n;
    btn.interactable = !disabled;
    n.on(Button.EventType.CLICK, onClick, n);
    return n;
  }

  /** 幸运格右栏：宽高与 Graphics 一致，避免固定 480px 盖住左侧选项 */
  private _sizedPanelBtn(
    parent: Node,
    text: string,
    y: number,
    w: number,
    h: number,
    opts?: { disabled?: boolean; fill?: Color },
  ): Node {
    const disabled = opts?.disabled ?? false;
    const fill =
      opts?.fill ??
      (disabled ? new Color(60, 65, 75, 255) : new Color(70, 100, 160, 255));
    const n = new Node(`Opt_${text}`);
    n.setParent(parent);
    n.setPosition(new Vec3(0, y, 0));
    n.addComponent(UITransform).setContentSize(w, h);
    const g = n.addComponent(Graphics);
    g.fillColor = fill;
    g.rect(-w / 2, -h / 2, w, h);
    g.fill();
    const ln = new Node('L');
    ln.setParent(n);
    ln.addComponent(UITransform).setContentSize(w, h);
    const lbl = ln.addComponent(Label);
    lbl.string = text;
    lbl.fontSize = Math.min(28, Math.round(h * 0.42));
    lbl.color = disabled
      ? new Color(140, 140, 150, 255)
      : new Color(255, 255, 255, 255);
    lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
    lbl.verticalAlign = Label.VerticalAlign.CENTER;
    lbl.overflow = Label.Overflow.SHRINK;
    if (!disabled) n.addComponent(Button);
    applyModalButtonArt(n, w, h, disabled);
    return n;
  }

  showShop(
    game: GameDoc,
    shopType: ShopType,
    onBuy: (itemType: string) => void,
    onCancel: () => void,
  ): void {
    const me = game.players.find((p) => p.openId === GameSession.user?.openId);
    if (!me?.shopStock) return;

    const isGold = shopType === 'GOLD';
    const items = isGold ? GOLD_ITEMS : LEGENDARY_ITEMS;
    const prices = isGold ? GOLD_SHOP_PRICES : LEGENDARY_SHOP_PRICES;
    const stock = isGold ? me.shopStock.goldShop : me.shopStock.legendaryShop;

    const options: ModalOption[] = items.map((id) => {
      const price = prices[id as keyof typeof prices];
      const inStock = stock[id as keyof typeof stock];
      const afford = isGold
        ? me.gold >= price
        : me.diamond >= price;
      const name = SHOP_ITEM_LABELS[id] ?? id;
      const label = `${name}  ${price}${isGold ? '金' : '钻'}${!inStock ? '（售罄）' : !afford ? '（不足）' : ''}`;
      return {
        id,
        label,
        disabled: !inStock || !afford,
      };
    });

    this._showModal(
      isGold ? '金币商店' : '传说商店',
      options,
      onBuy,
      onCancel,
      '退出商店',
      { contentPadV: 5, closeBtnOffsetY: -10, scrollBody: true },
    );
  }

  showFinalShop(
    game: GameDoc,
    onBuy: (itemType: string) => void,
    onCancel: () => void,
  ): void {
    const me = game.players.find((p) => p.openId === GameSession.user?.openId);
    if (!me) return;
    const stock = me.shopStock?.finalShop ?? {
      WEAPON_UPGRADE: true,
      DIVINE_STRIKE: true,
    };

    const options: ModalOption[] = [
      {
        id: 'WEAPON_UPGRADE',
        label: `武器升级 +1攻  ${FINAL_WEAPON_UPGRADE_GOLD}金${
          !me.weapon ? '（需装备武器）' : !stock.WEAPON_UPGRADE ? '（售罄）' : me.gold < FINAL_WEAPON_UPGRADE_GOLD ? '（不足）' : ''
        }`,
        disabled:
          !stock.WEAPON_UPGRADE ||
          !me.weapon ||
          me.gold < FINAL_WEAPON_UPGRADE_GOLD,
      },
      {
        id: 'DIVINE_STRIKE',
        label: `天罚攻击 随机玩家2伤  ${FINAL_DIVINE_STRIKE_DIAMOND}钻${
          !stock.DIVINE_STRIKE ? '（售罄）' : me.diamond < FINAL_DIVINE_STRIKE_DIAMOND ? '（不足）' : ''
        }`,
        disabled:
          !stock.DIVINE_STRIKE ||
          me.diamond < FINAL_DIVINE_STRIKE_DIAMOND,
      },
    ];

    this._showModal('决战商店', options, onBuy, onCancel, '退出商店');
  }

  showLuckySpin(
    _game: GameDoc,
    lucky: LuckySpinState | null,
    isActor: boolean,
    onStart: () => void,
    onEnd: () => void,
    onClose: () => void,
  ): void {
    this.dismissModal();
    this._clearLucky();
    if (!lucky || !Array.isArray(lucky.options) || lucky.options.length !== 7) return;

    const root = new Node('LuckySpin');
    root.setParent(this._parent);
    root.setPosition(new Vec3(0, 20, 0));

    const box = new Node('Box');
    box.setParent(root);
    box.setPosition(new Vec3(0, 20, 0));
    const boxH = 560;
    box.addComponent(UITransform).setContentSize(620, boxH);
    const modalSf = getCachedSprite('board/panels/panel_board_modal_9s');
    if (this._useModalArt && modalSf) {
      ensureArtSliced(box, 'ModalArt', modalSf, 620, boxH, MODAL_SLICE);
    }

    const titleN = new Node('Title');
    titleN.setParent(box);
    titleN.setPosition(new Vec3(0, boxH / 2 - 52, 0));
    titleN.addComponent(UITransform).setContentSize(560, 88);
    const tl = titleN.addComponent(Label);
    tl.string = '幸运格';
    tl.fontSize = 34;
    tl.lineHeight = 36;
    tl.overflow = Label.Overflow.SHRINK;
    tl.color = new Color(255, 220, 100, 255);
    tl.horizontalAlign = Label.HorizontalAlign.CENTER;

    // 左选项区 + 右按钮区（硬分隔，避免 9s 按钮视觉外扩压住列表）
    const innerW = 620;
    const pad = 14;
    const colGap = 14;
    const sidePad = 16;
    const btnColW = LUCKY_BTN_W + 16;
    const optW = innerW - btnColW - colGap - sidePad * 2;
    const optX = -innerW / 2 + sidePad + optW / 2;
    const btnCenterX = innerW / 2 - sidePad - btnColW / 2;
    const optItemW = optW - pad * 2;
    const btnItemW = LUCKY_BTN_W;
    const optRowH = 42;
    const optRowGap = 10;
    const optStyle = { w: optItemW, h: optRowH, fontSize: 19 };

    const opts: Node[] = [];
    const optTopY = boxH / 2 - 118;
    lucky.options.forEach((text: string, idx: number) => {
      const n = buildOptionRow(box, text, optTopY - idx * (optRowH + optRowGap), optStyle);
      n.setPosition(new Vec3(optX, optTopY - idx * (optRowH + optRowGap), 0));
      opts.push(n);
    });

    const luckyBtnH = LUCKY_BTN_H;
    const luckyBtnGap = LUCKY_BTN_GAP;
    // 右栏按钮独立纵排，避免与左侧选项行 Y 重合
    const btnStackTopY = 88;
    const luckyBtnDefs: { text: string; onClick: () => void; disabled: boolean }[] = [
      { text: '开始', onClick: onStart, disabled: !isActor },
      { text: '停止', onClick: onEnd, disabled: !isActor },
      {
        text: '关闭',
        onClick: () => {
          this._clearLucky();
          onClose();
        },
        disabled: false,
      },
    ];
    const luckyBtns: Node[] = [];
    luckyBtnDefs.forEach((def, i) => {
      const y = btnStackTopY - i * (luckyBtnH + luckyBtnGap);
      luckyBtns.push(
        this._luckyModalBtn(box, def.text, btnCenterX, y, btnItemW, luckyBtnH, def.onClick, def.disabled),
      );
    });
    luckyBtns.forEach((btn, i) => {
      this._setLuckyBtnEnabled(btn, !luckyBtnDefs[i].disabled);
    });
    const startBtn = luckyBtns[0];
    const stopBtn = luckyBtns[1];

    const highlight = (index: number) => {
      opts.forEach((n, i) => {
        paintOptionRowHighlight(n, i === index, optStyle);
      });
    };

    this._luckyUi = {
      root,
      opts,
      lucky,
      highlight,
      title: tl,
      startBtn,
      stopBtn,
      isActor,
      resultTimer: null,
    };
    this._syncLuckyButtons(lucky);
    let lastHighlight = computeLuckyHighlightIndex(lucky);
    highlight(lastHighlight);

    // 按服务端时间戳推导高亮格；仅 index 变化时重绘，减轻真机 Graphics 压力
    this._luckyTimer = setInterval(() => {
      const cur = this._luckyUi?.lucky;
      if (!cur) return;
      const idx = computeLuckyHighlightIndex(cur);
      if (idx === lastHighlight) return;
      lastHighlight = idx;
      highlight(idx);
    }, 400);
  }

  showItemPicker(
    player: GamePlayer,
    onPick: (item: ConsumableItemType) => void,
    onCancel: () => void,
  ): void {
    const items = player.items;
    if (!items) return;
    const options: ModalOption[] = [];
    if (items.doubleDice > 0) {
      options.push({ id: 'DOUBLE_DICE', label: `双骰子 ×${items.doubleDice}` });
    }
    if (items.trap > 0) {
      options.push({ id: 'TRAP', label: `陷阱 ×${items.trap}` });
    }
    if (items.medkit > 0) {
      const full = (player.hp ?? INITIAL_HP) >= (player.maxHp ?? INITIAL_HP);
      options.push({
        id: 'MEDKIT',
        label: `医疗包 ×${items.medkit}${full ? '（满血）' : ''}`,
        disabled: full,
      });
    }
    if (!options.length) return;
    this._showModal('使用道具', options, (id) => onPick(id as ConsumableItemType), onCancel);
  }

  showQuickChatPicker(onPick: (text: string) => void): void {
    const phrases = ['加油！', '666', '别打我', '来战', '稳住', '走位了', '谢谢', '抱歉'];
    const options: ModalOption[] = phrases.map((p) => ({ id: p, label: p }));
    this._showModal('快捷消息', options, (id) => onPick(String(id)), undefined, '关闭', {
      plainRows: true,
    });
  }

  private _guideIconArtSize(iconKey: string, iconSize: number): number {
    const isCellArt =
      iconKey.includes('/cells/') || iconKey.includes('board/cells');
    return isCellArt
      ? Math.max(12, Math.round(iconSize * GUIDE_CELL_ART_RATIO))
      : iconSize;
  }

  private _paintGuideIcon(iconBox: Node, iconKey: string, iconSize: number): void {
    const artSize = this._guideIconArtSize(iconKey, iconSize);
    const paint = (sf: SpriteFrame) => {
      const lay = pickSpriteLayout(sf, artSize, artSize);
      ensureArtChild(iconBox, 'Art', sf, lay.w, lay.h);
    };
    const sf = getCachedSprite(iconKey);
    if (sf) {
      paint(sf);
      return;
    }
    const ig = iconBox.getComponent(Graphics) || iconBox.addComponent(Graphics);
    ig.clear();
    ig.fillColor = new Color(70, 78, 98, 255);
    const ph = this._guideIconArtSize(iconKey, iconSize);
    ig.rect(-ph / 2, -ph / 2, ph, ph);
    ig.fill();
    void loadUiSprite(iconKey).then((loaded) => {
      if (!loaded || !iconBox.isValid) return;
      iconBox.getComponent(Graphics)?.destroy();
      paint(loaded);
    });
  }

  private _appendGuideSection(
    content: Node,
    guideViewW: number,
    title: string,
    y: number,
    rowH: number,
    rowGap: number,
    rows: { iconKey: string; title: string; desc: string }[],
    iconSize = GUIDE_ICON_SIZE,
  ): number {
    const rowW = guideViewW - GUIDE_ICON_LEFT_PAD - 8;
    const iconGap = GUIDE_ICON_TEXT_GAP;
    const sectionTitleN = new Node(`Section_${title}`);
    sectionTitleN.setParent(content);
    sectionTitleN.setPosition(new Vec3(0, y, 0));
    sectionTitleN.addComponent(UITransform).setContentSize(rowW, 30);
    const stl = sectionTitleN.addComponent(Label);
    stl.string = title;
    stl.fontSize = 20;
    stl.lineHeight = 26;
    stl.color = new Color(255, 210, 90, 255);
    stl.horizontalAlign = Label.HorizontalAlign.LEFT;
    y -= GUIDE_SECTION_TITLE_GAP;

    rows.forEach((row) => {
      const rowNode = new Node(`Row_${row.title}`);
      rowNode.setParent(content);
      rowNode.setPosition(new Vec3(0, y, 0));
      rowNode.addComponent(UITransform).setContentSize(rowW, rowH);

      const rowBg = rowNode.addComponent(Graphics);
      rowBg.fillColor = new Color(48, 54, 72, 255);
      rowBg.rect(-rowW / 2, -rowH / 2, rowW, rowH);
      rowBg.fill();

      const iconX = -rowW / 2 + GUIDE_ICON_LEFT_PAD + iconSize / 2;
      const iconBox = new Node('Icon');
      iconBox.setParent(rowNode);
      iconBox.setPosition(new Vec3(iconX, 0, 0));
      iconBox.addComponent(UITransform).setContentSize(iconSize, iconSize);
      this._paintGuideIcon(iconBox, row.iconKey, iconSize);

      const textLeft = iconX + iconSize / 2 + iconGap;
      const textW = rowW / 2 - textLeft - GUIDE_ICON_LEFT_PAD;
      const textN = new Node('Text');
      textN.setParent(rowNode);
      textN.setPosition(new Vec3(textLeft, 0, 0));
      const textUt = textN.addComponent(UITransform);
      textUt.setAnchorPoint(0, 0.5);
      textUt.setContentSize(Math.max(120, textW), rowH - 10);
      const lbl = textN.addComponent(Label);
      lbl.string = `${row.title}\n${row.desc}`;
      lbl.fontSize = 20;
      lbl.lineHeight = 26;
      lbl.overflow = Label.Overflow.SHRINK;
      lbl.horizontalAlign = Label.HorizontalAlign.LEFT;
      lbl.verticalAlign = Label.VerticalAlign.CENTER;
      lbl.color = new Color(230, 235, 245, 255);

      y -= rowH + rowGap;
    });
    return y - 8;
  }

  showCellGuide(): void {
    this.dismissModal();
    const root = new Node('CellGuideModal');
    root.setParent(this._parent);
    root.setPosition(new Vec3(0, 0, 0));
    this._modal = root;

    const rowH = 72;
    const rowGap = 12;
    const titleH = 52;
    const closeH = 40;
    const pad = 23;
    const sectionCount = 2;
    const sectionHeaderH = sectionCount * GUIDE_SECTION_TITLE_GAP;
    const totalRows = CELL_GUIDE_ROWS.length + STATUS_GUIDE_ROWS.length;
    const contentH =
      pad * 2 +
      sectionHeaderH +
      totalRows * (rowH + rowGap) +
      (sectionCount - 1) * 8;
    const viewH = Math.min(360, contentH);
    const boxH = titleH + viewH + closeH + pad * 3;
    const boxW = 600;
    const guideViewW = boxW - 48 - GUIDE_CONTENT_INSET * 2;

    const box = new Node('Box');
    box.setParent(root);
    box.addComponent(UITransform).setContentSize(boxW, boxH);
    const guideSf = getCachedSprite('board/panels/panel_board_guide_9s');
    const modalSf = getCachedSprite('board/panels/panel_board_modal_9s');
    if (guideSf) {
      ensureArtSliced(box, 'GuideArt', guideSf, boxW, boxH, MODAL_SLICE);
    } else if (this._useModalArt && modalSf) {
      ensureArtSliced(box, 'ModalArt', modalSf, boxW, boxH, MODAL_SLICE);
    }

    const titleN = new Node('Title');
    titleN.setParent(box);
    titleN.setPosition(new Vec3(0, boxH / 2 - pad - titleH / 2, 0));
    titleN.addComponent(UITransform).setContentSize(boxW - 40, titleH);
    const tl = titleN.addComponent(Label);
    tl.string = '游戏说明';
    tl.fontSize = 30;
    tl.color = new Color(255, 220, 100, 255);
    tl.horizontalAlign = Label.HorizontalAlign.CENTER;

    const scrollRoot = new Node('ScrollView');
    scrollRoot.setParent(box);
    scrollRoot.setPosition(new Vec3(0, 6 - GUIDE_CONTENT_INSET, 0));
    scrollRoot.addComponent(UITransform).setContentSize(guideViewW, viewH);
    const scrollG = scrollRoot.addComponent(Graphics);
    scrollG.fillColor = new Color(22, 26, 38, 200);
    scrollG.rect(-guideViewW / 2, -viewH / 2, guideViewW, viewH);
    scrollG.fill();
    const scrollMask = scrollRoot.addComponent(Mask);
    scrollMask.type = Mask.Type.GRAPHICS_STENCIL;

    const scroll = scrollRoot.addComponent(ScrollView);
    scroll.vertical = true;
    scroll.horizontal = false;
    scroll.brake = 0.75;
    scroll.elastic = true;
    scroll.inertia = true;

    const content = new Node('Content');
    content.setParent(scrollRoot);
    const contentUt = content.addComponent(UITransform);
    contentUt.setContentSize(guideViewW - 8, contentH);
    contentUt.setAnchorPoint(0.5, 1);
    content.setPosition(0, viewH / 2, 0);
    scroll.content = content;

    let y = -pad - 15;
    y = this._appendGuideSection(
      content,
      guideViewW,
      '格子类型',
      y,
      rowH,
      rowGap,
      CELL_GUIDE_ROWS.map((row) => ({
        iconKey: CELL_TYPE_SPRITE[row.type] ?? CELL_TYPE_SPRITE.NORMAL,
        title: row.title,
        desc: row.desc,
      })),
      GUIDE_ICON_SIZE,
    );
    this._appendGuideSection(
      content,
      guideViewW,
      '状态效果',
      y,
      rowH,
      rowGap,
      STATUS_GUIDE_ROWS.map((row) => ({
        iconKey: row.key,
        title: row.title,
        desc: row.desc,
      })),
      GUIDE_ICON_SIZE,
    );

    makeModalButton(
      box,
      '关闭',
      0,
      -boxH / 2 + pad + closeH / 2,
      180,
      closeH,
      () => this.dismissModal(),
    );
  }

  private _showEmptyBackpack(): void {
    this.dismissModal();
    const root = new Node('EmptyBackpackModal');
    root.setParent(this._parent);
    this._modal = root;

    const boxW = 480;
    const boxH = 280;
    const pad = 24;
    const titleH = 48;
    const msgH = 44;
    const btnH = 40;
    const btnGap = 20;

    const box = new Node('Box');
    box.setParent(root);
    box.addComponent(UITransform).setContentSize(boxW, boxH);
    const modalSf = getCachedSprite('board/panels/panel_board_modal_9s');
    if (this._useModalArt && modalSf) {
      ensureArtSliced(box, 'ModalArt', modalSf, boxW, boxH, MODAL_SLICE);
    }

    const titleN = new Node('Title');
    titleN.setParent(box);
    titleN.setPosition(new Vec3(0, boxH / 2 - pad - titleH / 2, 0));
    titleN.addComponent(UITransform).setContentSize(boxW - 40, titleH);
    const tl = titleN.addComponent(Label);
    tl.string = '背包';
    tl.fontSize = 30;
    tl.color = new Color(255, 220, 100, 255);
    tl.horizontalAlign = Label.HorizontalAlign.CENTER;

    const msgY = btnGap / 2;
    const msgN = new Node('EmptyMsg');
    msgN.setParent(box);
    msgN.setPosition(new Vec3(0, msgY, 0));
    msgN.addComponent(UITransform).setContentSize(boxW - 56, msgH);
    const ml = msgN.addComponent(Label);
    ml.string = '背包空空如也';
    ml.fontSize = 24;
    ml.lineHeight = 30;
    ml.color = new Color(230, 235, 245, 255);
    ml.horizontalAlign = Label.HorizontalAlign.CENTER;
    ml.verticalAlign = Label.VerticalAlign.CENTER;

    makeModalButton(
      box,
      '关闭',
      0,
      -boxH / 2 + pad + btnH / 2,
      180,
      btnH,
      () => this.dismissModal(),
    );
  }

  showBackpack(
    me: GamePlayer,
    opts: {
      onUseItem: (item: ConsumableItemType) => void;
      onEquipWeapon: (weapon: 'SWORD' | 'GUN' | 'ROCKET') => void;
    },
  ): void {
    const options: ModalOption[] = [];

    const inv = me.weaponInventory || {};
    (['SWORD', 'GUN', 'ROCKET'] as const).forEach((w) => {
      const c = inv[w] || 0;
      if (c > 0) {
        const cur = me.weapon === w ? '（已装备）' : '';
        options.push({ id: `EW_${w}`, label: `装备武器：${SHOP_ITEM_LABELS[w] ?? w} ×${c}${cur}`, disabled: me.weapon === w });
      }
    });

    const items = me.items;
    if (items) {
      if (items.doubleDice > 0) options.push({ id: 'U_DOUBLE_DICE', label: `使用：双骰子 ×${items.doubleDice}` });
      if (items.trap > 0) options.push({ id: 'U_TRAP', label: `使用：陷阱 ×${items.trap}` });
      if (items.medkit > 0) {
        const full = (me.hp ?? INITIAL_HP) >= (me.maxHp ?? INITIAL_HP);
        options.push({ id: 'U_MEDKIT', label: `使用：医疗包 ×${items.medkit}${full ? '（满血）' : ''}`, disabled: full });
      }
    }

    if (!options.length) {
      this._showEmptyBackpack();
      return;
    }

    this._showModal('背包', options, (id) => {
      const sid = String(id);
      if (sid.startsWith('EW_')) {
        const w = sid.slice(3) as 'SWORD' | 'GUN' | 'ROCKET';
        opts.onEquipWeapon(w);
        return;
      }
      if (sid === 'U_DOUBLE_DICE') return opts.onUseItem('DOUBLE_DICE');
      if (sid === 'U_TRAP') return opts.onUseItem('TRAP');
      if (sid === 'U_MEDKIT') return opts.onUseItem('MEDKIT');
    }, () => this.dismissModal(), '关闭');
  }

  showAttackPicker(
    game: GameDoc,
    me: GamePlayer,
    onPick: (target: { type: 'PLAYER'; seat: number } | { type: 'NEUTRAL'; region: RegionIndex }) => void,
    onCancel: () => void,
  ): void {
    const weapon = me.weapon;
    if (!weapon || !WEAPON_STATS[weapon]) return;
    const range = WEAPON_STATS[weapon].range;
    const options: ModalOption[] = [];

    game.players.forEach((p) => {
      if (p.seat === me.seat || p.isDefeated) return;
      const dist = ringDistance(me.position, p.position);
      const ok = dist <= range;
      options.push({
        id: `P_${p.seat}`,
        label: `${playerDisplayName(p)} HP${p.hp ?? '?'} 距${dist}${ok ? '' : '（太远）'}`,
        disabled: !ok,
      });
    });

    const visited = new Set(me.visitedRegionsThisTurn ?? []);
    for (let r = 0; r < 3; r++) {
      if (!visited.has(r)) continue;
      const creature = game.neutralCreatures?.[r];
      if (!creature || creature.defeated || creature.hp <= 0) continue;
      options.push({
        id: `N_${r}`,
        label: `中立生物 区${r + 1} HP${creature.hp}/${creature.maxHp}`,
      });
    }

    if (!options.length) return;
    this._showModal('选择攻击目标', options, (id) => {
      if (id.startsWith('P_')) {
        onPick({ type: 'PLAYER', seat: Number(id.slice(2)) });
      } else if (id.startsWith('N_')) {
        onPick({ type: 'NEUTRAL', region: Number(id.slice(2)) as RegionIndex });
      }
    }, onCancel);
  }
}
