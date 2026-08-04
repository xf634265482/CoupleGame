// 远征提示视图（design §6/§9）：战斗、拾取、开箱、钥匙与通关事件提示。
// 图片仅作为底框；动态 Label、按钮与交互仍由代码构建，Graphics 保留为加载失败兜底。

import { Color, EventTouch, Graphics, Label, Mask, Node, ScrollView, UIOpacity, UITransform } from 'cc';
import { Effects } from '../../fx/Effects';
import {
  BLACKSMITH_ENHANCE_STEP,
  BLACKSMITH_FAIL_BASE,
  BLACKSMITH_FAIL_CAP,
  BLACKSMITH_FAIL_STEP,
  BLACKSMITH_FAIL_THRESHOLD,
  BLACKSMITH_UPGRADE_COST,
} from '../core/PveConstants';
import type { Equipment, EquipItem, EquipSlot } from '../core/PveTypes';
import { loadUiSprite } from '../../ui/UiAssets';
import { ensureArtChild, ensureArtCover, ensureArtSliced } from '../../ui/UiSprite';
import { loadPveEquipSprite } from '../SpecialItemResourceLoader';
import { makeFlatButton, makeLabel } from './pveUiKit';
import { formatEquipDetailBody } from './pveEquipDetail';
import { PveDebug } from '../debug/PveDebug';
import { equipStatSummaryForUi } from '../core/equipment/EquipmentProgression';

const TOAST_W = 520;
const TOAST_H = 76;
const PANEL_COLOR = new Color(26, 30, 42, 220);
const IMPORTANT_PANEL_COLOR = new Color(72, 24, 18, 238);
const IMPORTANT_STROKE_COLOR = new Color(255, 174, 72, 255);
const TEXT_COLOR = new Color(235, 238, 245, 255);
const IMPORTANT_TEXT_COLOR = new Color(255, 238, 188, 255);
const PANEL_INSETS = { top: 48, bottom: 48, left: 48, right: 48 };
const CONFIRM_PANEL_COLOR = new Color(7, 31, 70, 170);
const CONFIRM_PANEL_BORDER = new Color(84, 200, 239, 240);


/** 装备词条显示标签（Boss 掉落装备 + 背包列表展示用）。 */
export const EQUIP_TRAIT_LABEL: Record<string, string> = {
  // Boss 专属装备词条（见 BossEquipTraitEffects.ts / BossSpoils.ts）
  on_hit_lifesteal_1:   '命中吸血',
  boss_summon_warrior:  '召唤援军',
  boss_stun_on_hurt:    '受击眩晕',
  boss_bleed_on_hit:    '命中流血',
  boss_sand_immune:     '流沙免疫',
  boss_phys_reduce_15:  '物理减伤 15%',
  boss_slow_on_hit:     '命中减速',
  boss_ice_reduce_20:   '冰面减伤 20%',
  boss_active_ice:      '主动冰冻',
  boss_burn_on_hit:     '命中灼烧',
  boss_burn_immune:     '灼烧免疫',
  boss_kill_heal_8:     '击杀回血',
  boss_crit_15:         '暴击 +15%',
  boss_show_intent:     '预知意图',
  boss_revive_50:       '致死复活',
};

/** 远征提示视图（战斗战报 toast 与当前交互弹窗）。 */
export class PveToastView {
  private _root: Node;
  private _toastNode: Node | null = null;
  private _toastLabel: Label | null = null;
  private _toastTimer: ReturnType<typeof setTimeout> | null = null;
  private _choiceNode: Node | null = null;
  private _choiceCancel: (() => void) | null = null;
  private _guideNode: Node | null = null;
  private _guideLabel: Label | null = null;

  constructor(parent: Node, private _screenW: number, private _screenH: number) {
    this._root = new Node('PveToastView');
    this._root.setParent(parent);
    this._root.setPosition(0, 0, 0);
    this._root.setSiblingIndex(9999);
  }

  private _deferChoiceAction(action: () => void): void {
    setTimeout(() => {
      if (!this._root?.isValid) return;
      action();
    }, 0);
  }

  /** 顶部居中文字提示，自动定时消失；连续提示会顶替前一条。 */
  toast(message: string, durationMs = 1600, important = false): void {
    if (this._toastTimer) {
      clearTimeout(this._toastTimer);
      this._toastTimer = null;
    }
    if (!this._toastNode) {
      const n = new Node('Toast');
      n.setParent(this._root);
      // 放在战场底部居中：mapBottom = -screenH/2 + PVE_HUD_INFO_TOP_OFFSET + 10。
      // 这里直接复用同样的常量（348 = PVE_HUD_INFO_H/2 + 274），toast 中心比 mapBottom 再高 30px。
      const battlefieldBottomY = -this._screenH / 2 + 348 + 10;
      n.setPosition(0, battlefieldBottomY + TOAST_H / 2 + 12, 0);
      n.addComponent(UITransform).setContentSize(TOAST_W, TOAST_H);
      n.addComponent(Graphics);
      this._toastLabel = makeLabel(n, 0, 0, TOAST_W - 40, TOAST_H - 8, 24, TEXT_COLOR, Label.HorizontalAlign.CENTER);
      this._toastNode = n;
    }
    const g = this._toastNode.getComponent(Graphics);
    if (g) {
      g.clear();
      g.fillColor = important ? IMPORTANT_PANEL_COLOR : PANEL_COLOR;
      g.roundRect(-TOAST_W / 2, -TOAST_H / 2, TOAST_W, TOAST_H, 10);
      g.fill();
      if (important) {
        g.strokeColor = IMPORTANT_STROKE_COLOR;
        g.lineWidth = 3;
        g.roundRect(-TOAST_W / 2 + 2, -TOAST_H / 2 + 2, TOAST_W - 4, TOAST_H - 4, 9);
        g.stroke();
      }
    }
    this._toastNode.active = true;
    // 不做 pop 入场动画：连续 toast 会让 pop 从上一次半透明中间值起跳，opacity 累积衰减到看不见。
    // 强制 opacity/scale 复位（防御性，对抗任何残留 tween）；label 颜色 alpha 也兜底重置。
    const uiOp = this._toastNode.getComponent(UIOpacity) ?? this._toastNode.addComponent(UIOpacity);
    uiOp.opacity = 255;
    this._toastNode.setScale(1, 1, 1);
    if (this._toastLabel) {
      this._toastLabel.string = message;
      const baseColor = important ? IMPORTANT_TEXT_COLOR : TEXT_COLOR;
      this._toastLabel.color = new Color(baseColor.r, baseColor.g, baseColor.b, 255);
      this._toastLabel.isBold = important;
    }
    this._toastTimer = setTimeout(() => {
      if (this._toastNode) this._toastNode.active = false;
    }, durationMs);
  }

  toastImportant(message: string, durationMs = 2800): void {
    this.toast(`⚠ ${message}`, durationMs, true);
  }

  showGuideBubble(message: string): void {
    const boxW = Math.min(720, this._screenW - 48);
    const fontSize = 24;
    const lineHeight = 30;
    const horizontalPadding = 28;
    const verticalPadding = 20;
    const contentW = boxW - horizontalPadding * 2;
    const charsPerLine = Math.max(12, Math.floor(contentW / fontSize));
    const visualLineCount = message.split('\n').reduce((total, line) => {
      const charWidth = [...line].reduce((width, char) => width + (char.charCodeAt(0) > 0xff ? 1 : 0.55), 0);
      return total + Math.max(1, Math.ceil(charWidth / charsPerLine));
    }, 0);
    // 目标框始终留在顶部 HUD 之下、底部操作区之上；超长文案交由 SHRINK 兜底。
    const topMargin = Math.min(260, Math.max(190, this._screenH * 0.14));
    const maxBoxH = Math.max(140, this._screenH - topMargin - 100);
    const boxH = Math.min(maxBoxH, Math.max(120, visualLineCount * lineHeight + verticalPadding * 2));

    if (!this._guideNode) {
      const node = new Node('GuideBubble');
      node.setParent(this._root);
      node.addComponent(UITransform);
      node.addComponent(Graphics);
      this._guideLabel = makeLabel(node, 0, 0, 1, 1, fontSize, IMPORTANT_TEXT_COLOR, Label.HorizontalAlign.CENTER);
      this._guideLabel.enableWrapText = true;
      this._guideLabel.overflow = Label.Overflow.SHRINK;
      this._guideLabel.verticalAlign = Label.VerticalAlign.CENTER;
      this._guideNode = node;
    }
    const node = this._guideNode;
    const transform = node.getComponent(UITransform);
    const graphics = node.getComponent(Graphics);
    transform?.setContentSize(boxW, boxH);
    node.setPosition(0, this._screenH / 2 - topMargin - boxH / 2, 0);
    if (graphics) {
      graphics.clear();
      graphics.fillColor = new Color(7, 31, 70, 205);
      graphics.roundRect(-boxW / 2, -boxH / 2, boxW, boxH, 18);
      graphics.fill();
      graphics.strokeColor = new Color(255, 214, 110, 240);
      graphics.lineWidth = 2;
      graphics.roundRect(-boxW / 2 + 1, -boxH / 2 + 1, boxW - 2, boxH - 2, 17);
      graphics.stroke();
    }
    if (this._guideLabel) {
      const labelTransform = this._guideLabel.node.getComponent(UITransform);
      labelTransform?.setContentSize(contentW, boxH - verticalPadding * 2);
      this._guideLabel.fontSize = fontSize;
      this._guideLabel.lineHeight = lineHeight;
      this._guideLabel.string = message;
    }
    node.active = true;
  }

  hideGuideBubble(): void {
    if (this._guideNode) this._guideNode.active = false;
  }

  /** 错误操作反馈：toast 节点横向抖动（AP 不足 / 方向阻塞等）。 */
  shakeToast(): void {
    if (this._toastNode?.active) void Effects.hit(this._toastNode, { strength: 0.8 });
  }

  /**
   * 通用三选一弹窗（第 5 章 Boss 改写命运等阻塞式选择）：
   * 展示 title + 候选项文案列表，玩家选定后 resolve 所选下标。
   */
  showChoiceDialog(title: string, options: string[]): Promise<number> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value: number) => {
        if (settled) return;
        settled = true;
        if (this._choiceCancel === cancel) this._choiceCancel = null;
        resolve(value);
      };
      const cancel = () => finish(0);
      this._closeChoice();
      this._choiceCancel = cancel;

      const boxW = 620;
      const titlePadTop = 24;
      const titleH = 36;
      const titleToBtnGap = 18;
      const btnGap = 14;
      const bottomPad = 24;
      const optionHeights = options.map((label) => {
        const lineCount = Math.max(1, label.split('\n').length);
        return Math.max(64, 28 + lineCount * 24);
      });
      const boxH = titlePadTop + titleH + titleToBtnGap
        + optionHeights.reduce((sum, height) => sum + height, 0)
        + Math.max(0, options.length - 1) * btnGap + bottomPad;

      const box = new Node('TreeChoice');
      box.setParent(this._root);
      box.setPosition(0, 0, 0);
      box.addComponent(UITransform).setContentSize(boxW, boxH);
      const g = box.addComponent(Graphics);
      g.fillColor = CONFIRM_PANEL_COLOR;
      g.roundRect(-boxW / 2, -boxH / 2, boxW, boxH, 18);
      g.fill();
      g.strokeColor = CONFIRM_PANEL_BORDER;
      g.lineWidth = 2;
      g.roundRect(-boxW / 2 + 1, -boxH / 2 + 1, boxW - 2, boxH - 2, 17);
      g.stroke();

      const titleLabel = makeLabel(
        box, 0, boxH / 2 - titlePadTop - titleH / 2, boxW - 60, titleH, 26,
        new Color(255, 220, 120, 255), Label.HorizontalAlign.CENTER,
      );
      titleLabel.string = title;
      titleLabel.isBold = true;

      let y = boxH / 2 - titlePadTop - titleH - titleToBtnGap - optionHeights[0] / 2;
      options.forEach((label, index) => {
        const btnH = optionHeights[index] ?? 64;
        const lineCount = Math.max(1, label.split('\n').length);
        const btn = makeFlatButton(
          box, label, 0, y, boxW - 80, btnH,
          () => this._deferChoiceAction(() => {
            this._closeChoice(false);
            finish(index);
          }),
          new Color(52, 73, 95, 170),
          { noArt: true, border: new Color(255, 214, 110, 240) },
        );
        const btnLabel = btn.getChildByName('Label')?.getComponent(Label);
        if (btnLabel) {
          btnLabel.isBold = true;
          btnLabel.fontSize = lineCount >= 3 ? 18 : 20;
          btnLabel.lineHeight = lineCount >= 3 ? 22 : 24;
        }
        y -= (btnH + btnGap);
      });

      this._setChoiceNode(box);
    });
  }

  /**
   * 通用确认弹窗（阻塞式）：玩家必须选其中一项后才会 resolve。
   * 用于通关后「继续远征 / 返回大厅」等二选场景。
   */
  showConfirm(
    title: string,
    options: { label: string; value: string }[],
    style: 'default' | 'danger' = 'default',
  ): Promise<string> {
    return new Promise((resolve) => {
      let settled = false;
      const fallbackValue = options[0]?.value ?? '';
      const finish = (value: string) => {
        if (settled) return;
        settled = true;
        if (this._choiceCancel === cancel) this._choiceCancel = null;
        resolve(value);
      };
      const cancel = () => finish(fallbackValue);
      this._closeChoice();
      this._choiceCancel = cancel;
      const isDanger = style === 'danger';
      const titleParts = title.split('\n');
      const badgeTitle = isDanger ? titleParts[0] ?? '' : '';
      const bodyTitle = isDanger ? titleParts.slice(1).join('\n') : title;

      // 标题按显式 \n 计行；每行字号 24/行高 32。预留上下 padding 各 24，
      // 与按钮区之间 16 间距，避免多行标题被按钮遮挡（图1/图2 问题）。
      const titleLines = Math.max(1, bodyTitle.split('\n').length);
      const lineH = 32;
      const titleH = titleLines * lineH;
      const titlePadTop = 24;
      const badgeH = isDanger ? 38 : 0;
      const badgeGap = isDanger ? 14 : 0;
      const titleToBtnGap = 16;
      const btnH = 60;
      const btnGap = 14;
      const btnAreaH = options.length * btnH + (options.length - 1) * btnGap;
      const bottomPad = 24;

      const boxW = 540;
      const boxH = titlePadTop + badgeH + badgeGap + titleH + titleToBtnGap + btnAreaH + bottomPad;

      const box = new Node('ConfirmChoice');
      box.setParent(this._root);
      box.setPosition(0, 0, 0);
      box.addComponent(UITransform).setContentSize(boxW, boxH);
      // 统一返回 / 通关 / 远征结束等所有确认弹窗：与玩家状态卡同款半透明圆角底（α≈170）。
      const g = box.addComponent(Graphics);
      g.fillColor = CONFIRM_PANEL_COLOR;
      g.roundRect(-boxW / 2, -boxH / 2, boxW, boxH, 18);
      g.fill();
      g.strokeColor = CONFIRM_PANEL_BORDER;
      g.lineWidth = 2;
      g.roundRect(-boxW / 2 + 1, -boxH / 2 + 1, boxW - 2, boxH - 2, 17);
      g.stroke();

      if (isDanger) {
        const badgeW = Math.min(boxW - 120, Math.max(168, badgeTitle.length * 28 + 40));
        const badge = new Node('ConfirmDangerBadge');
        badge.setParent(box);
        badge.setPosition(0, boxH / 2 - titlePadTop - badgeH / 2, 0);
        badge.addComponent(UITransform).setContentSize(badgeW, badgeH);
        const badgeG = badge.addComponent(Graphics);
        badgeG.fillColor = IMPORTANT_PANEL_COLOR;
        badgeG.roundRect(-badgeW / 2, -badgeH / 2, badgeW, badgeH, 12);
        badgeG.fill();
        badgeG.strokeColor = IMPORTANT_STROKE_COLOR;
        badgeG.lineWidth = 2;
        badgeG.roundRect(-badgeW / 2 + 1, -badgeH / 2 + 1, badgeW - 2, badgeH - 2, 11);
        badgeG.stroke();
        const badgeLbl = makeLabel(
          badge, 0, 0, badgeW - 24, badgeH, 24, IMPORTANT_TEXT_COLOR, Label.HorizontalAlign.CENTER,
        );
        badgeLbl.isBold = true;
        badgeLbl.string = badgeTitle;
      }

      const titleLbl = makeLabel(
        box,
        0,
        boxH / 2 - titlePadTop - badgeH - badgeGap - titleH / 2,
        boxW - 40,
        titleH,
        24,
        TEXT_COLOR,
        Label.HorizontalAlign.CENTER,
      );
      titleLbl.lineHeight = lineH;
      titleLbl.verticalAlign = Label.VerticalAlign.CENTER;
      titleLbl.isBold = true;
      titleLbl.string = bodyTitle;

      let y = boxH / 2 - titlePadTop - badgeH - badgeGap - titleH - titleToBtnGap - btnH / 2;
      for (const opt of options) {
        const btn = makeFlatButton(
          box, opt.label, 0, y, boxW - 80, btnH,
          () => this._deferChoiceAction(() => { this._closeChoice(false); finish(opt.value); }),
          new Color(52, 73, 95, 170),
          { noArt: true, border: new Color(255, 214, 110, 240) },
        );
        const lbl = btn.getChildByName('Label')?.getComponent(Label);
        if (lbl) lbl.isBold = true;
        y -= (btnH + btnGap);
      }

      this._setChoiceNode(box);
    });
  }

  /** 远征结算弹窗：展示星尘 / 命痕 / 装备等本层奖励。 */
  showSettleResult(params: {
    status: 'DEAD' | 'COMPLETED';
    floor: number;
    diamond?: number;
    gold?: number;
    minghenName?: string | null;
    equipmentName?: string | null;
  }): Promise<void> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (this._choiceCancel === cancel) this._choiceCancel = null;
        resolve();
      };
      const cancel = () => finish();
      this._closeChoice();
      this._choiceCancel = cancel;
      const { status, floor, diamond, gold, minghenName, equipmentName } = params;

      const rewardLines: string[] = [];
      if ((gold ?? 0) > 0) rewardLines.push(`星尘 +${gold}`);
      if (minghenName) rewardLines.push(`命痕：${minghenName}`);
      if (equipmentName) rewardLines.push(`装备：${equipmentName}`);
      // diamond 字段已废弃（星尘走 gold）；若旧客户端仍回传则合并展示，避免重复两行
      if ((diamond ?? 0) > 0 && (gold ?? 0) <= 0) rewardLines.push(`星尘 +${diamond}`);
      const hasReward = rewardLines.length > 0;

      const lineH        = 32;
      const badgeH       = 38;
      const badgeGap     = 14;
      const titlePadTop  = 24;
      const floorH       = lineH;
      const rewardGap    = 10;
      const rewardRowH   = 36;
      const rewardCount  = hasReward ? rewardLines.length : 1;
      const titleToBtnGap = 16;
      const btnH         = 60;
      const bottomPad    = 24;
      const boxW         = 540;
      const boxH = titlePadTop + badgeH + badgeGap + floorH + rewardGap
        + rewardCount * rewardRowH + titleToBtnGap + btnH + bottomPad;

      const box = new Node('SettleResult');
      box.setParent(this._root);
      box.setPosition(0, 0, 0);
      box.addComponent(UITransform).setContentSize(boxW, boxH);
      const g = box.addComponent(Graphics);
      g.fillColor = CONFIRM_PANEL_COLOR;
      g.roundRect(-boxW / 2, -boxH / 2, boxW, boxH, 18);
      g.fill();
      g.strokeColor = CONFIRM_PANEL_BORDER;
      g.lineWidth = 2;
      g.roundRect(-boxW / 2 + 1, -boxH / 2 + 1, boxW - 2, boxH - 2, 17);
      g.stroke();

      // 标题 badge
      const badgeTitle = status === 'DEAD' ? '远征结束' : '通关完成！';
      const badgeW = Math.min(boxW - 120, Math.max(168, badgeTitle.length * 28 + 40));
      const badge = new Node('SettleBadge');
      badge.setParent(box);
      badge.setPosition(0, boxH / 2 - titlePadTop - badgeH / 2, 0);
      badge.addComponent(UITransform).setContentSize(badgeW, badgeH);
      const bg = badge.addComponent(Graphics);
      bg.fillColor = IMPORTANT_PANEL_COLOR;
      bg.roundRect(-badgeW / 2, -badgeH / 2, badgeW, badgeH, 12);
      bg.fill();
      bg.strokeColor = IMPORTANT_STROKE_COLOR;
      bg.lineWidth = 2;
      bg.roundRect(-badgeW / 2 + 1, -badgeH / 2 + 1, badgeW - 2, badgeH - 2, 11);
      bg.stroke();
      const badgeLbl = makeLabel(badge, 0, 0, badgeW - 24, badgeH, 24, IMPORTANT_TEXT_COLOR, Label.HorizontalAlign.CENTER);
      badgeLbl.isBold = true;
      badgeLbl.string = badgeTitle;

      // 已探索 N 层
      const floorY = boxH / 2 - titlePadTop - badgeH - badgeGap - floorH / 2;
      const floorLbl = makeLabel(box, 0, floorY, boxW - 40, floorH, 24, TEXT_COLOR, Label.HorizontalAlign.CENTER);
      floorLbl.isBold = true;
      floorLbl.string = `第 ${floor} 层结算`;

      // 奖励行
      let rowY = floorY - floorH / 2 - rewardGap - rewardRowH / 2;
      const REWARD_COLOR = new Color(255, 220, 100, 255);
      if (!hasReward) {
        makeLabel(box, 0, rowY, boxW - 40, rewardRowH, 22, TEXT_COLOR, Label.HorizontalAlign.CENTER).string = '（本次无奖励）';
      } else {
        for (const line of rewardLines) {
          const lbl = makeLabel(box, 0, rowY, boxW - 40, rewardRowH, 22, REWARD_COLOR, Label.HorizontalAlign.CENTER);
          lbl.isBold = true;
          lbl.string = line;
          rowY -= rewardRowH;
        }
      }

      // 确认按钮
      const btnY = -boxH / 2 + bottomPad + btnH / 2;
      const btn = makeFlatButton(
        box, '确认', 0, btnY, boxW - 80, btnH,
        () => this._deferChoiceAction(() => { this._closeChoice(false); finish(); }),
        new Color(52, 73, 95, 170),
        { noArt: true, border: new Color(255, 214, 110, 240) },
      );
      const btnLbl = btn.getChildByName('Label')?.getComponent(Label);
      if (btnLbl) btnLbl.isBold = true;

      this._setChoiceNode(box);
    });
  }

  /**
   * 营地全屏弹窗（阻塞式，AC-19）：章节 Boss 击败后触发。
   * - 显示当前玩家 HP / 金币
   * - 商店：每个商品可多次购买（购买成功后重建弹窗刷新状态）
   * - 装备整理：查看装备 + 变卖换金币（design §3.1）
   * - 「继续远征」或「返回大厅」才会 resolve
   *
   * @param chapter       - 刚通关的章节（用于标题）
   * @param initialPlayer - 进营地时的玩家状态（hp/maxHp/gold/equipment）
   * @param getShopItems  - 读取当前商品列表；用于营地内购买后动态刷新价格
   * @param onBuy         - 购买回调：成功时返回更新后的 player，失败返回 null
   * @param onSellEquip   - 变卖装备回调：成功时返回更新后的 player，失败返回 null
   */
  showCamp(
    chapter: number,
    initialPlayer: { hp: number; maxHp: number; gold: number; equipment: Equipment; bag?: EquipItem[] },
    getShopItems: () => ReadonlyArray<{ id: string; name: string; desc: string; cost: number }>,
    onBuy: (itemId: string) => { hp: number; maxHp: number; gold: number; equipment: Equipment; bag?: EquipItem[] } | null,
    onSellEquip: (
      target: { source: 'equipment'; slot: EquipSlot } | { source: 'bag'; itemId: string },
    ) => { hp: number; maxHp: number; gold: number; equipment: Equipment; bag?: EquipItem[] } | null,
    blacksmithCbs?: {
      onUpgrade: (slot: EquipSlot) => { gold: number; equipment: Equipment } | null;
    },
  ): Promise<'continue' | 'quit'> {
    // 装备槽信息（供装备整理面板使用）
    const SLOT_ORDER: EquipSlot[] = ['WEAPON', 'HELMET', 'ARMOR', 'SHOES', 'TRINKET'];
    const SLOT_LABEL: Record<EquipSlot, string> = {
      WEAPON: '武器', HELMET: '头盔', ARMOR: '护甲', SHOES: '靴子', TRINKET: '饰品',
    };
    // 变卖价格（与 CampSystem.SELL_PRICE 同步，View 层仅用于显示）
    const EQUIP_SELL_PRICE: Record<string, number> = {
      COMMON: 10, FINE: 20, RARE: 40, EPIC: 80, LEGENDARY: 200,
    };
    // 品质中文标签
    const EQUIP_QUALITY_LABEL: Record<string, string> = {
      COMMON: '普通', FINE: '精良', RARE: '稀有', EPIC: '史诗', LEGENDARY: '传奇',
    };

    return new Promise((resolve) => {
      let settled = false;
      const finish = (value: 'continue' | 'quit') => {
        if (settled) return;
        settled = true;
        if (this._choiceCancel === cancel) this._choiceCancel = null;
        resolve(value);
      };
      const cancel = () => finish('quit');
      this._closeChoice();
      this._choiceCancel = cancel;
      let currentPlayer = { ...initialPlayer };
      const transparentBtn = { noArt: true, border: new Color(255, 214, 110, 210) } as const;
      const initialShopItems = getShopItems();

      const BOX_W = 640;
      // 默认 2 项 → 520（含装备整理按钮行 +80），每多一项 +80；
      // 可选按钮按实际存在数量扩展高度。
      const BOX_H = 520 + (initialShopItems.length - 2) * 80 + (blacksmithCbs ? 80 : 0);

      // ── 装备整理面板（先声明以便 buildModal 引用）────────────
      let buildEquipPanel!: () => void;

      const buildModal = () => {
        this._closeChoice(false);
        const p = currentPlayer;

        const box = new Node('CampModal');
        box.setParent(this._root);
        box.setPosition(0, 0, 0);
        box.addComponent(UITransform).setContentSize(BOX_W, BOX_H);
        const bg = box.addComponent(Graphics);
        bg.fillColor = new Color(7, 31, 70, 170);
        bg.roundRect(-BOX_W / 2, -BOX_H / 2, BOX_W, BOX_H, 18);
        bg.fill();
        bg.strokeColor = new Color(84, 200, 239, 210);
        bg.lineWidth = 2;
        bg.roundRect(-BOX_W / 2 + 1, -BOX_H / 2 + 1, BOX_W - 2, BOX_H - 2, 17);
        bg.stroke();

        // ── 从顶部依次摆放 ──
        let curY = BOX_H / 2 - 20;

        // 标题
        curY -= 25;
        makeLabel(
          box, 0, curY, BOX_W - 40, 50, 28,
          new Color(255, 216, 80, 255), Label.HorizontalAlign.CENTER,
        ).string = `🏕️ 第${chapter}章通关 · 进入营地`;
        curY -= 25 + 12;

        // 玩家状态
        curY -= 18;
        makeLabel(
          box, 0, curY, BOX_W - 40, 36, 22,
          new Color(190, 230, 190, 255), Label.HorizontalAlign.CENTER,
        ).string = `❤️  HP ${p.hp} / ${p.maxHp}       ✨  星尘 ${p.gold}`;
        curY -= 18 + 14;

        // 商店标题
        curY -= 12;
        makeLabel(
          box, 0, curY, BOX_W - 60, 24, 18,
          new Color(140, 150, 170, 255), Label.HorizontalAlign.CENTER,
        ).string = '── 营地商店 ──';
        curY -= 12 + 16;

        // 商品按钮
        const shopItems = getShopItems();
        for (const item of shopItems) {
          const alreadyFull = item.id === 'HEAL_FULL' && p.hp >= p.maxHp;
          const canAfford = p.gold >= item.cost;
          const enabled = canAfford && !alreadyFull;

          curY -= 34;
          const label = `${item.name}  ${item.desc}   （${item.cost} ✨）`;
          if (enabled) {
            makeFlatButton(
              box, label, 0, curY, BOX_W - 80, 68,
              () => {
                const updated = onBuy(item.id);
                if (updated) {
                  currentPlayer = { ...updated };
                  this._deferChoiceAction(() => buildModal());
                }
              },
              new Color(55, 110, 75, 180),
              transparentBtn,
            );
          } else {
            const disabledLabel = alreadyFull
              ? `${item.name}  ${item.desc}   （已满血）`
              : `${item.name}  ${item.desc}   （${item.cost} ✨ · 星尘不足）`;
            makeFlatButton(box, disabledLabel, 0, curY, BOX_W - 80, 68,
              () => { /* disabled */ }, new Color(55, 58, 68, 150), transparentBtn);
          }
          curY -= 34 + 12;
        }

        // 装备整理按钮
        curY -= 16;
        curY -= 32;
        makeFlatButton(
          box, '⚒️ 装备整理（变卖装备换星尘）', 0, curY, BOX_W - 80, 64,
          () => this._deferChoiceAction(() => buildEquipPanel()),
          new Color(100, 80, 50, 178),
          transparentBtn,
        );
        curY -= 32 + 12;

        // 铁匠铺按钮（仅当 blacksmithCbs 提供时显示）
        if (blacksmithCbs) {
          curY -= 16;
          curY -= 32;
          makeFlatButton(
            box, '🔨 铁匠铺（强化装备）', 0, curY, BOX_W - 80, 64,
            () => {
              this._closeChoice(false);
              this._deferChoiceAction(() => {
                void this.showBlacksmith(
                  currentPlayer,
                  (slot) => {
                    const updated = blacksmithCbs.onUpgrade(slot);
                    if (updated) currentPlayer = { ...currentPlayer, ...updated };
                    return updated;
                  },
                ).then(() => this._deferChoiceAction(() => buildModal()));
              });
            },
            new Color(90, 65, 30, 178),
            transparentBtn,
          );
          curY -= 32 + 12;
        }

        // 底部：继续远征 + 返回大厅
        curY -= 16;
        curY -= 32;
        const btnW = Math.floor((BOX_W - 120) / 2);
        const leftX = -(btnW / 2 + 10);
        const rightX = btnW / 2 + 10;
        makeFlatButton(box, '继续远征 →', leftX, curY, btnW, 64,
          () => this._deferChoiceAction(() => { this._closeChoice(false); finish('continue'); }), new Color(50, 90, 160, 178), transparentBtn);
        makeFlatButton(box, '返回大厅', rightX, curY, btnW, 64,
          () => this._deferChoiceAction(() => { this._closeChoice(false); finish('quit'); }), new Color(90, 55, 55, 178), transparentBtn);

        this._setChoiceNode(box);
      };

      buildEquipPanel = () => {
        this._closeChoice(false);
        const p = currentPlayer;
        const EQ_W = 620;
        const bagItems = p.bag ?? [];
        const EQ_H = 150 + SLOT_ORDER.length * 76 + Math.max(1, bagItems.length) * 76 + 76; // title + equipped + bag + back btn
        const equip = new Node('EquipPanel');
        equip.setParent(this._root);
        equip.setPosition(0, 0, 0);
        equip.addComponent(UITransform).setContentSize(EQ_W, EQ_H);
        const ebg = equip.addComponent(Graphics);
        ebg.fillColor = new Color(7, 31, 70, 170);
        ebg.roundRect(-EQ_W / 2, -EQ_H / 2, EQ_W, EQ_H, 18);
        ebg.fill();
        ebg.strokeColor = new Color(84, 200, 239, 210);
        ebg.lineWidth = 2;
        ebg.roundRect(-EQ_W / 2 + 1, -EQ_H / 2 + 1, EQ_W - 2, EQ_H - 2, 17);
        ebg.stroke();

        let curY = EQ_H / 2 - 40;
        makeLabel(equip, 0, curY, EQ_W - 40, 50, 24,
          new Color(255, 216, 80, 255), Label.HorizontalAlign.CENTER,
        ).string = '⚒️ 装备整理（变卖装备获得星尘）';
        curY -= 70;

        makeLabel(equip, 0, curY, EQ_W - 80, 32, 19,
          new Color(140, 200, 180, 255), Label.HorizontalAlign.CENTER,
        ).string = '— 已装备 —';
        curY -= 42;

        for (const slot of SLOT_ORDER) {
          const item = p.equipment[slot];
          curY -= 28;
          if (item) {
            const sellGold = EQUIP_SELL_PRICE[item.quality] ?? 10;
            makeFlatButton(
              equip,
              `${SLOT_LABEL[slot]}：${item.name}（${EQUIP_QUALITY_LABEL[item.quality] ?? item.quality}）  ✨ 变卖 +${sellGold}`,
              0, curY, EQ_W - 80, 56,
              () => {
                const updated = onSellEquip({ source: 'equipment', slot });
                if (updated) {
                  currentPlayer = { ...updated };
                  this._deferChoiceAction(() => buildEquipPanel());
                }
              },
              new Color(100, 75, 45, 178),
              transparentBtn,
            );
          } else {
            makeFlatButton(equip, `${SLOT_LABEL[slot]}：（空）`, 0, curY, EQ_W - 80, 56,
              () => {}, new Color(40, 45, 55, 150), transparentBtn);
          }
          curY -= 28 + 12;
        }

        makeLabel(equip, 0, curY, EQ_W - 80, 32, 19,
          new Color(140, 200, 180, 255), Label.HorizontalAlign.CENTER,
        ).string = '— 背包 —';
        curY -= 42;

        if (bagItems.length === 0) {
          curY -= 28;
          makeFlatButton(equip, '背包：（空）', 0, curY, EQ_W - 80, 56,
            () => {}, new Color(40, 45, 55, 150), transparentBtn);
          curY -= 28 + 12;
        } else {
          for (const item of bagItems) {
            const sellGold = EQUIP_SELL_PRICE[item.quality] ?? 10;
            curY -= 28;
            makeFlatButton(
              equip,
              `${SLOT_LABEL[item.slot]}：${item.name}（${EQUIP_QUALITY_LABEL[item.quality] ?? item.quality}）  ✨ 变卖 +${sellGold}`,
              0, curY, EQ_W - 80, 56,
              () => {
                const updated = onSellEquip({ source: 'bag', itemId: item.id });
                if (updated) {
                  currentPlayer = { ...updated };
                  this._deferChoiceAction(() => buildEquipPanel());
                }
              },
              new Color(78, 82, 112, 178),
              transparentBtn,
            );
            curY -= 28 + 12;
          }
        }

        // 返回营地
        curY -= 12;
        curY -= 28;
        makeFlatButton(equip, '← 返回营地', 0, curY, EQ_W - 80, 56,
          () => this._deferChoiceAction(() => buildModal()), new Color(55, 90, 140, 178), transparentBtn);

        this._setChoiceNode(equip);
      };

      buildModal();
    });
  }

  /**
   * 铁匠弹窗（阻塞式）：显示当前装备，提供强化（+1 基础属性）按钮。
   * 点「离开铁匠」后 resolve。回调返回 null 表示操作失败（金币不足等）。
   *
   * @param initialPlayer - 玩家当前状态（gold + equipment）
   * @param onUpgrade     - 强化回调：成功返回更新后的 player，失败返回 null
   */
  showBlacksmith(
    initialPlayer: { gold: number; equipment: Equipment },
    onUpgrade: (slot: EquipSlot) => { gold: number; equipment: Equipment } | null,
  ): Promise<void> {
    const SLOT_ORDER: EquipSlot[] = ['WEAPON', 'HELMET', 'ARMOR', 'SHOES', 'TRINKET'];
    const SLOT_LABEL: Record<EquipSlot, string> = {
      WEAPON: '武器', HELMET: '头盔', ARMOR: '护甲', SHOES: '靴子', TRINKET: '饰品',
    };
    // 强化按钮文案：明确标出本次强化提升的具体属性与数值变化，避免玩家不知道"+1"加在哪里
    const SLOT_ATTR_LABEL: Record<EquipSlot, string> = {
      WEAPON: '攻击力', HELMET: '最大HP', ARMOR: '减伤', SHOES: '靴子等级', TRINKET: '灵气加成',
    };
    const upgradeStepFor = (slot: EquipSlot, item: EquipItem): number =>
      (slot === 'SHOES' || slot === 'TRINKET') ? 1 : (BLACKSMITH_ENHANCE_STEP[item.quality] ?? 1);
    const upgradeCostFor = (item: EquipItem, slot: EquipSlot): number => {
      const step = upgradeStepFor(slot, item);
      return BLACKSMITH_UPGRADE_COST * step * ((item.enhanceLevel ?? 0) + 1);
    };
    const upgradeFailChanceFor = (item: EquipItem): number => {
      const lv = item.enhanceLevel ?? 0;
      if (lv < BLACKSMITH_FAIL_THRESHOLD) return 0;
      return Math.min(BLACKSMITH_FAIL_CAP, BLACKSMITH_FAIL_BASE + (lv - BLACKSMITH_FAIL_THRESHOLD) * BLACKSMITH_FAIL_STEP);
    };

    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (this._choiceCancel === cancel) this._choiceCancel = null;
        resolve();
      };
      const cancel = () => finish();
      // 不能用默认 _closeChoice()：若外层（如营地）已设置了 _choiceCancel，
      // 默认 true 会触发外层 cancel，导致营地被意外 resolve 成 'quit' 而回大厅。
      // 用 false 只关闭旧 UI 节点，外层 cancel 引用接下来由本面板替换。
      this._closeChoice(false);
      this._choiceCancel = cancel;
      let currentPlayer = { ...initialPlayer };
      const transparentBtn = { noArt: true, border: new Color(255, 214, 110, 210) } as const;

      const buildPanel = () => {
        const tBuild = performance.now();
        this._closeChoice(false);
        const tAfterClose = performance.now();
        const p = currentPlayer;

        const equippedSlots = SLOT_ORDER.filter((s) => !!p.equipment[s]);
        const BOX_W = 660;
        const BOX_H = 140 + equippedSlots.length * 96 + 70 + (equippedSlots.length === 0 ? 40 : 0);
        console.log('[BS] buildPanel start equipped=', equippedSlots.length,
          'close=', (tAfterClose - tBuild).toFixed(1) + 'ms');
        // 标记结束在 _setChoiceNode 之前打印总耗时
        const __bsBuildStart = tBuild;
        (this as any).__bsBuildStart = __bsBuildStart;

        const box = new Node('BlacksmithPanel');
        box.setParent(this._root);
        box.setPosition(0, 0, 0);
        box.addComponent(UITransform).setContentSize(BOX_W, BOX_H);
        const bg = box.addComponent(Graphics);
        bg.fillColor = new Color(7, 31, 70, 170);
        bg.roundRect(-BOX_W / 2, -BOX_H / 2, BOX_W, BOX_H, 18);
        bg.fill();
        bg.strokeColor = new Color(84, 200, 239, 210);
        bg.lineWidth = 2;
        bg.roundRect(-BOX_W / 2 + 1, -BOX_H / 2 + 1, BOX_W - 2, BOX_H - 2, 17);
        bg.stroke();

        let curY = BOX_H / 2 - 20;

        // 标题
        curY -= 26;
        makeLabel(
          box, 0, curY, BOX_W - 40, 52, 28,
          new Color(255, 195, 90, 255), Label.HorizontalAlign.CENTER,
        ).string = '⚒️ 铁匠铺';
        curY -= 26 + 12;

        // 金币
        curY -= 14;
        makeLabel(
          box, 0, curY, BOX_W - 60, 28, 20,
          new Color(245, 215, 110, 255), Label.HorizontalAlign.CENTER,
        ).string = `✨ 当前星尘：${p.gold}`;
        curY -= 14 + 16;

        // 每个已装备槽位
        if (equippedSlots.length === 0) {
          makeLabel(
            box, 0, curY - 20, BOX_W - 60, 36, 20,
            new Color(140, 150, 170, 255), Label.HorizontalAlign.CENTER,
          ).string = '（无已装备物品）';
          makeLabel(
            box, 0, curY - 56, BOX_W - 60, 36, 18,
            new Color(150, 160, 180, 255), Label.HorizontalAlign.CENTER,
          ).string = '先去打怪 / 开宝箱获取装备后，再来强化吧';
        }

        for (const slot of equippedSlots) {
          const item = p.equipment[slot] as EquipItem;
          const traitText = item.trait ? `[${EQUIP_TRAIT_LABEL[item.trait] ?? item.trait}]` : '';

          // 装备名称行（含强化等级 +N 后缀）
          const enhanceSuffix = (item.enhanceLevel ?? 0) > 0 ? `+${item.enhanceLevel}` : '';
          const failChance = upgradeFailChanceFor(item);
          const failText = failChance > 0 ? `  ⚠️失败率${Math.round(failChance * 100)}%` : '';
          curY -= 12;
          makeLabel(
            box, 0, curY, BOX_W - 60, 24, 18,
            new Color(210, 220, 240, 255), Label.HorizontalAlign.CENTER,
          ).string = `${SLOT_LABEL[slot]}：${item.name}${enhanceSuffix}（基础 ${item.baseStat}）${traitText}${failText}`;
          curY -= 12 + 8;

          // 强化按钮
          curY -= 30;
          const btnW = BOX_W - 120;
          const upgradeCost = upgradeCostFor(item, slot);
          const canUpgrade = p.gold >= upgradeCost;

          const step = upgradeStepFor(slot, item);
          const upgradeLabel = `强化${SLOT_ATTR_LABEL[slot]} ${item.baseStat}→${item.baseStat + step}`;
          if (canUpgrade) {
            makeFlatButton(
              box, `${upgradeLabel}（${upgradeCost}✨）`, 0, curY, btnW, 60,
              () => {
                const updated = onUpgrade(slot);
                if (updated) {
                  currentPlayer = { ...updated };
                  this._deferChoiceAction(() => buildPanel());
                }
              },
              new Color(50, 100, 60, 178),
              transparentBtn,
            );
          } else {
            makeFlatButton(box, `${upgradeLabel}（${upgradeCost}✨ 不足）`, 0, curY, btnW, 60,
              () => {}, new Color(40, 50, 40, 150), transparentBtn);
          }

          curY -= 30 + 8;
        }

        // 离开按钮
        curY -= 16;
        curY -= 26;
        makeFlatButton(
          box, '← 离开铁匠', 0, curY, BOX_W - 80, 52,
          () => this._deferChoiceAction(() => { console.log('[BS] leave button clicked'); this._closeChoice(false); finish(); }),
          new Color(55, 90, 140, 178),
          transparentBtn,
        );

        const tBeforeSet = performance.now();
        this._setChoiceNode(box);
        const tAfterSet = performance.now();
        console.log('[BS] buildPanel done body=',
          (tBeforeSet - ((this as any).__bsBuildStart ?? tBeforeSet)).toFixed(1) + 'ms',
          'setChoice=', (tAfterSet - tBeforeSet).toFixed(1) + 'ms');
      };

      buildPanel();
    });
  }

  private _createChoiceOverlay(name: string): Node {
    const overlay = new Node(name);
    overlay.setParent(this._root);
    overlay.setPosition(0, 0, 0);
    overlay.addComponent(UITransform).setContentSize(this._screenW, this._screenH);
    const mask = new Node('Mask');
    mask.setParent(overlay);
    mask.addComponent(UITransform).setContentSize(this._screenW, this._screenH);
    const g = mask.addComponent(Graphics);
    g.fillColor = new Color(0, 8, 24, 170);
    g.rect(-this._screenW / 2, -this._screenH / 2, this._screenW, this._screenH);
    g.fill();
    mask.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
    });
    return overlay;
  }

  private _destroyChoiceNode(): void {
    PveDebug.mark('Toast._destroyChoiceNode', `has=${!!this._choiceNode} valid=${!!(this._choiceNode && this._choiceNode.isValid)}`);
    if (this._choiceNode) {
      const node = this._choiceNode;
      this._choiceNode = null;
      try {
        const stack: Node[] = [node];
        while (stack.length > 0) {
          const current = stack.pop();
          if (!current || !current.isValid) continue;
          Effects.stop(current);
          stack.push(...current.children);
        }
        if (node.isValid) {
          node.removeFromParent();
          node.active = false;
          void Promise.resolve().then(() => {
            if (node.isValid) node.destroy();
          });
        }
      } catch (err) {
        PveDebug.dump('Toast._destroyChoiceNode throw');
        console.error('[PVE] choice cleanup failed:', err instanceof Error ? err.message : String(err));
        if (node.isValid) {
          node.removeFromParent();
          node.active = false;
          node.destroy();
        }
      }
    }
  }

  private _closeChoice(resolvePending = true): void {
    this._destroyChoiceNode();
    if (resolvePending && this._choiceCancel) {
      const cancel = this._choiceCancel;
      this._choiceCancel = null;
      cancel();
    }
  }

  /** 弹窗节点登记 helper：所有 `_choiceNode = box;` 都改走这里，统一获得 pop 进场动画。 */
  private _setChoiceNode(node: Node, strength = 1.2): void {
    if (!node?.isValid || !node.parent?.isValid) return;
    this._choiceNode = node;
    try {
      void Effects.pop(node, { strength });
    } catch (err) {
      console.error('[PVE] choice enter animation failed:', err instanceof Error ? err.message : String(err));
    }
  }

  private _decoratePanel(
    node: Node,
    key: string,
    width: number,
    height: number,
    insets = PANEL_INSETS,
  ): void {
    void loadUiSprite(key).then((frame) => {
      if (!frame || !node.isValid) return;
      ensureArtSliced(node, 'PanelArt', frame, width, height, insets).node.setSiblingIndex(0);
    }).catch(() => null);
  }

  /**
   * 背包弹窗：上半部分展示已装备槽位，下半部分展示背包道具。
   * 点击背包中的装备"装备"按钮后调用 onEquipFromBag，返回更新后的 player 状态（null=无效）。
   * 点击"关闭"后 resolve。
   */
  showBackpack(
    initialPlayer: {
      equipment: Equipment;
      bag?: EquipItem[];
    },
    onEquipFromBag: (itemId: string) => { equipment: Equipment; bag?: EquipItem[] } | null,
  ): Promise<'close'> {
    const SLOT_ORDER: EquipSlot[] = ['WEAPON', 'HELMET', 'ARMOR', 'SHOES', 'TRINKET'];
    const SLOT_LABEL: Record<EquipSlot, string> = {
      WEAPON: '武器', HELMET: '头盔', ARMOR: '护甲', SHOES: '靴子', TRINKET: '饰品',
    };
    const QUALITY_COLOR: Record<string, Color> = {
      COMMON: new Color(185, 190, 200, 255), FINE: new Color(100, 210, 100, 255),
      RARE: new Color(100, 180, 255, 255), EPIC: new Color(200, 120, 255, 255),
      LEGENDARY: new Color(255, 190, 60, 255),
    };

    return new Promise((resolve) => {
      let current = { ...initialPlayer };
      const transparentBtn = { noArt: true, border: new Color(255, 214, 110, 210) } as const;
      let detailPopup: Node | null = null;

      const closeDetail = () => {
        if (!detailPopup?.isValid) return;
        detailPopup.active = false;
      };


      const showDetail = (box: Node, item: EquipItem) => {
        if (!detailPopup?.isValid) {
          detailPopup = new Node('BackpackEquipDetail');
          detailPopup.setParent(box);
          detailPopup.setSiblingIndex(9999);
          detailPopup.setPosition(0, 0, 0);
          detailPopup.addComponent(UITransform).setContentSize(520, 280);
          const popupG = detailPopup.addComponent(Graphics);
          popupG.fillColor = new Color(7, 31, 70, 230);
          popupG.roundRect(-260, -140, 520, 280, 16);
          popupG.fill();
          popupG.strokeColor = new Color(255, 214, 110, 240);
          popupG.lineWidth = 2;
          popupG.roundRect(-259, -139, 518, 278, 15);
          popupG.stroke();

          const title = makeLabel(detailPopup, 0, 92, 470, 34, 24, new Color(255, 220, 120, 255), Label.HorizontalAlign.CENTER);
          title.node.name = 'Title';
          title.isBold = true;

          const body = makeLabel(detailPopup, 0, 12, 450, 120, 20, new Color(235, 238, 245, 255), Label.HorizontalAlign.LEFT);
          body.node.name = 'Body';
          body.verticalAlign = Label.VerticalAlign.TOP;
          body.lineHeight = 28;
          body.isBold = true;

          makeFlatButton(
            detailPopup,
            '关闭',
            0,
            -96,
            180,
            50,
            closeDetail,
            new Color(55, 90, 140, 178),
            transparentBtn,
          );

          detailPopup.on(Node.EventType.TOUCH_END, (e) => {
            e.propagationStopped = true;
          });
        }

        const title = detailPopup.getChildByName('Title')?.getComponent(Label);
        const body = detailPopup.getChildByName('Body')?.getComponent(Label);
        if (title) title.string = item.name;
        if (body) body.string = formatEquipDetailBody(item);
        detailPopup.active = true;
      };

      const buildPanel = () => {
        this._closeChoice();
        const bag = current.bag ?? [];

        const BOX_W = 680;
        const BOX_H = 760;
        const SCROLL_W = BOX_W - 30;
        const SCROLL_H = BOX_H - 160;
        const SLOT_SIZE = 108;
        const SLOT_GAP = 14;
        const slotRowW = SLOT_ORDER.length * SLOT_SIZE + (SLOT_ORDER.length - 1) * SLOT_GAP;
        const contentH = Math.max(
          SCROLL_H + 20,
          420 + SLOT_SIZE + Math.max(0, bag.length - 1) * 68 + 120,
        );

        const box = new Node('BackpackPanel');
        box.setParent(this._root);
        box.setPosition(0, 72, 0);
        box.addComponent(UITransform).setContentSize(BOX_W, BOX_H);
        const bg = box.addComponent(Graphics);
        bg.fillColor = new Color(7, 31, 70, 170);
        bg.roundRect(-BOX_W / 2, -BOX_H / 2, BOX_W, BOX_H, 20);
        bg.fill();
        bg.strokeColor = new Color(84, 200, 239, 210);
        bg.lineWidth = 2;
        bg.roundRect(-BOX_W / 2 + 1, -BOX_H / 2 + 1, BOX_W - 2, BOX_H - 2, 19);
        bg.stroke();

        // 标题（加粗加大）
        const titleLbl = makeLabel(box, 0, BOX_H / 2 - 36, BOX_W - 40, 48, 32, new Color(255, 195, 90, 255), Label.HorizontalAlign.CENTER);
        titleLbl.string = '🎒 背包';
        titleLbl.isBold = true;

        const svNode = new Node('BackpackScrollArea');
        svNode.setParent(box);
        svNode.setPosition(0, 20, 0);
        svNode.addComponent(UITransform).setContentSize(SCROLL_W, SCROLL_H);
        const sv = svNode.addComponent(ScrollView);
        sv.horizontal = false;
        sv.vertical = true;
        sv.inertia = true;
        sv.brake = 0.75;
        (sv as ScrollView & { elasticScale?: number }).elasticScale = 0.1;

        const viewNode = new Node('View');
        viewNode.setParent(svNode);
        viewNode.addComponent(UITransform).setContentSize(SCROLL_W, SCROLL_H);
        viewNode.addComponent(Mask);

        const contentNode = new Node('Content');
        contentNode.setParent(viewNode);
        contentNode.addComponent(UITransform).setContentSize(SCROLL_W - 10, contentH);
        contentNode.setPosition(0, (contentH - SCROLL_H) / 2, 0);
        sv.content = contentNode;

        let curY = contentH / 2 - 22;

        // ── 上半区：已装备 5 格 ──
        const sectionLbl = makeLabel(contentNode, 0, curY, SCROLL_W - 40, 30, 22, new Color(140, 200, 240, 255), Label.HorizontalAlign.CENTER);
        sectionLbl.string = '— 已装备 —';
        sectionLbl.isBold = true;
        curY -= 40;

        // 5 格水平排列
        const slotStartX = -slotRowW / 2 + SLOT_SIZE / 2;
        const slotCenterY = curY - SLOT_SIZE / 2;

        SLOT_ORDER.forEach((slot, idx) => {
          const item = current.equipment[slot];
          const x = slotStartX + idx * (SLOT_SIZE + SLOT_GAP);

          // 槽位底框
          const slotNode = new Node(`Slot_${slot}`);
          slotNode.setParent(contentNode);
          slotNode.setPosition(x, slotCenterY, 0);
          slotNode.addComponent(UITransform).setContentSize(SLOT_SIZE, SLOT_SIZE);
          const sg = slotNode.addComponent(Graphics);
          const borderColor = item
            ? (QUALITY_COLOR[item.quality] ?? new Color(220, 230, 245, 240))
            : new Color(90, 120, 160, 200);
          sg.fillColor = new Color(15, 32, 60, 200);
          sg.roundRect(-SLOT_SIZE / 2, -SLOT_SIZE / 2, SLOT_SIZE, SLOT_SIZE, 12);
          sg.fill();
          sg.strokeColor = borderColor;
          sg.lineWidth = 2;
          sg.roundRect(-SLOT_SIZE / 2 + 1, -SLOT_SIZE / 2 + 1, SLOT_SIZE - 2, SLOT_SIZE - 2, 11);
          sg.stroke();

          if (item) {
            const initial = (item.name ?? SLOT_LABEL[slot]).slice(0, 1);
            const charLbl = makeLabel(slotNode, 0, 8, SLOT_SIZE - 8, SLOT_SIZE - 24, 56, borderColor, Label.HorizontalAlign.CENTER);
            charLbl.string = initial;
            charLbl.isBold = true;
            void loadPveEquipSprite(item).then((frame) => {
              if (!frame || !slotNode.isValid || !charLbl.node.isValid) return;
              charLbl.node.active = false;
              const art = ensureArtCover(slotNode, 'EquipArt', frame, SLOT_SIZE - 4, SLOT_SIZE - 4);
              art.node.setPosition(0, 0, 0);
              art.node.setSiblingIndex(1);
            }).catch(() => null);
            // 强化等级角标
            if ((item.enhanceLevel ?? 0) > 0) {
              const ehLbl = makeLabel(slotNode, SLOT_SIZE / 2 - 14, SLOT_SIZE / 2 - 10, 28, 22, 18, new Color(255, 220, 110, 255), Label.HorizontalAlign.RIGHT);
              ehLbl.string = `+${item.enhanceLevel}`;
              ehLbl.isBold = true;
              ehLbl.node.setSiblingIndex(3);
            }
            slotNode.on(Node.EventType.TOUCH_END, (e) => {
              e.propagationStopped = true;
              showDetail(box, item);
            });
          } else {
            // 空槽：浅色"空"占位
            const emptyLbl = makeLabel(slotNode, 0, 4, SLOT_SIZE - 8, SLOT_SIZE - 24, 28, new Color(90, 110, 140, 200), Label.HorizontalAlign.CENTER);
            emptyLbl.string = '空';
            emptyLbl.isBold = true;
          }
          // 部位标签
          const slotLbl = makeLabel(slotNode, 0, -SLOT_SIZE / 2 + 14, SLOT_SIZE - 6, 22, 16, new Color(170, 200, 230, 240), Label.HorizontalAlign.CENTER);
          slotLbl.string = SLOT_LABEL[slot];
          slotLbl.isBold = true;
          slotLbl.node.setSiblingIndex(4);
        });

        curY -= SLOT_SIZE + 28;

        // ── 下半区：背包道具列表 + 卷轴 + 关闭按钮 ──
        const bagSectionLbl = makeLabel(contentNode, 0, curY, SCROLL_W - 40, 30, 22, new Color(140, 200, 180, 255), Label.HorizontalAlign.CENTER);
        bagSectionLbl.string = '— 背包道具 —';
        bagSectionLbl.isBold = true;
        curY -= 36;

        if (bag.length === 0) {
          const emptyLbl = makeLabel(contentNode, 0, curY - 20, SCROLL_W - 60, 36, 20, new Color(120, 140, 160, 255), Label.HorizontalAlign.CENTER);
          emptyLbl.string = '（背包为空）';
          emptyLbl.isBold = true;
          curY -= 56;
        } else {
          for (const item of bag) {
            curY -= 32;
            const enhanceLabel = (item.enhanceLevel ?? 0) > 0 ? ` · 强化+${item.enhanceLevel}` : '';
            const statLabel = equipStatSummaryForUi(item);
            const traitMark = item.trait ? ` [${EQUIP_TRAIT_LABEL[item.trait] ?? '特殊词条'}]` : '';
            const itemText = `${SLOT_LABEL[item.slot]}：${item.name}${enhanceLabel}${statLabel ? ` · ${statLabel}` : ''}${traitMark}`;
            const iconNode = new Node(`BagIcon_${item.id}`);
            iconNode.setParent(contentNode);
            iconNode.setPosition(-SCROLL_W / 2 + 42, curY, 0);
            iconNode.addComponent(UITransform).setContentSize(40, 40);
            const itemLbl = makeLabel(
              contentNode,
              8,
              curY,
              SCROLL_W - 276,
              36,
              20,
              QUALITY_COLOR[item.quality] ?? new Color(220, 230, 245, 255),
              Label.HorizontalAlign.LEFT,
            );
            itemLbl.string = itemText;
            itemLbl.isBold = true;
            itemLbl.overflow = Label.Overflow.SHRINK;
            void loadPveEquipSprite(item).then((frame) => {
              if (!frame || !iconNode.isValid) return;
              const art = ensureArtChild(iconNode, 'EquipArt', frame, 36, 36);
              art.node.setPosition(0, 0, 0);
            }).catch(() => null);
            itemLbl.node.on(Node.EventType.TOUCH_END, (e) => {
              e.propagationStopped = true;
              showDetail(box, item);
            });
            // 装备按钮
            const equipBtn = makeFlatButton(
              contentNode, '装备', SCROLL_W / 2 - 70, curY, 100, 48,
              () => {
                const updated = onEquipFromBag(item.id);
                if (updated) { current = { ...current, ...updated }; buildPanel(); }
              },
              new Color(30, 80, 50, 200),
              { noArt: true, border: new Color(100, 210, 130, 220) },
            );
            const equipBtnLbl = equipBtn.getChildByName('Label')?.getComponent(Label);
            if (equipBtnLbl) equipBtnLbl.isBold = true;
            curY -= 32;
          }
        }

        // 关闭按钮固定在弹窗底部（不跟随上方内容流动）
        const closeBtn = makeFlatButton(
          box, '关闭', 0, -BOX_H / 2 + 50, BOX_W - 100, 60,
          () => { closeDetail(); this._closeChoice(); resolve('close'); },
          new Color(55, 90, 140, 178),
          transparentBtn,
        );
        const closeBtnLbl = closeBtn.getChildByName('Label')?.getComponent(Label);
        if (closeBtnLbl) closeBtnLbl.isBold = true;

        this._setChoiceNode(box);
      };

      buildPanel();
    });
  }

  destroy(): void {
    PveDebug.mark('Toast.destroy.begin');
    try {
      this._closeChoice();
      if (this._toastTimer) clearTimeout(this._toastTimer);
      if (this._root && this._root.isValid) this._root.destroy();
      else PveDebug.mark('Toast.destroy.rootInvalid');
      PveDebug.mark('Toast.destroy.end');
    } catch (err) {
      PveDebug.dump('Toast.destroy throw');
      throw err;
    }
  }
}
