// 远征提示视图（design §6/§9）：战斗/拾取/开箱/钥匙/通关等事件文字提示，以及满 100 灵气触发的 3 选 1 强化弹窗。
// 图片仅作为底框；动态 Label、按钮与交互仍由代码构建，Graphics 保留为加载失败兜底。

import { Color, Graphics, Label, Node, UIOpacity, UITransform } from 'cc';
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
import { ensureArtChild, ensureArtCover, ensureArtSliced, ensureArtStretch } from '../../ui/UiSprite';
import { makeFlatButton, makeLabel } from './pveUiKit';
import { formatEquipDetailBody } from './pveEquipDetail';
import { STRENGTHEN_DEFS } from '../core/strengthen/StrengthenCatalog';

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

/** 所有灵气强化词条的显示标签（ADVENTURER 通用 + 三职业 15 词条，AC-16 M2）。供角色面板等外部读取。 */
export const STRENGTHEN_LABEL: Record<string, { title: string; desc: string }> = {
  // ── ADVENTURER 通用（M1）──
  strengthen_hp_up:     { title: '生命强化',  desc: '最大 HP +40' },
  strengthen_attack_up: { title: '力量强化',  desc: '攻击力 +5' },
  strengthen_ap_up:     { title: '敏捷强化',  desc: '下回合起 AP 上限 +1' },
  strengthen_gold_find: { title: '财富强化',  desc: '拾取金币 +20%' },
  // ── 狂战士（AC-16 M2 基础 + AC-404 扩展）──
  life_steal:           { title: '吸血',        desc: '每次攻击回复 10 HP' },
  berserk:              { title: '狂暴',        desc: 'HP ≤ 50% 时攻击 +10' },
  blood_rage:           { title: '血怒',        desc: '击杀时回复 20 HP' },
  undying:              { title: '不屈',        desc: '每层首次将死时保留 1 HP' },
  counter:              { title: '反击',        desc: '被攻击时对攻击者造成 10 伤害' },
  last_stand:           { title: '绝境一击',    desc: 'HP ≤ 25% 时攻击翻倍' },
  vengeance:            { title: '复仇',        desc: '受击后下次攻击 +5 伤害' },
  cleave:               { title: '横扫',        desc: '命中后对相邻敌人造成 50% 溅射伤害' },
  pain_tolerance:       { title: '痛觉钝化',    desc: '受到 ≥5 伤害时额外减免 2' },
  executioner:          { title: '处刑者',      desc: '对 HP ≤ 20% 目标 +3 伤害' },
  iron_skin_stack:      { title: '铁骨',        desc: '选中时最大 HP 及当前 HP +3（可叠加）' },
  bloodlust_stack:      { title: '嗜血本能',    desc: '击杀时回复等同层数的 HP（可叠加）' },
  rage_strike_stack:    { title: '怒击连击',    desc: '攻击力 + 当前层数×0.5（可叠加）' },
  berserker_resolve:    { title: '背水一战',    desc: 'HP ≤ 30% 时攻击 ×1.5' },
  final_charge:         { title: '最后冲锋',    desc: '本层首次 HP ≤ 30% 时 AP +3（一次性）' },
  // ── 射手（AC-16 M2 基础 + AC-404 扩展）──
  eagle_eye:            { title: '鹰眼',        desc: '攻击范围 +1' },
  marksman:             { title: '射手精通',    desc: '攻击力 +5' },
  multi_shot:           { title: '连射',        desc: '30% 概率对同一目标再射一箭' },
  pierce:               { title: '穿透',        desc: '攻击无视护甲减伤' },
  crit:                 { title: '暴击',        desc: '10% 概率造成双倍伤害' },
  headshot:             { title: '致命狩猎',    desc: 'HP ≤ 25% 时攻击翻倍' },
  retreat_shot:         { title: '回马枪',      desc: '受击后下次攻击 +5 伤害' },
  scatter_shot:         { title: '散射',        desc: '命中后对相邻敌人造成 50% 溅射伤害' },
  steady_aim:           { title: '稳健射姿',    desc: '受到 ≥5 伤害时额外减免 2' },
  finisher:             { title: '收割者',      desc: '对 HP ≤ 20% 目标 +3 伤害' },
  quiver_stack:         { title: '强化箭袋',    desc: '选中时最大 HP 及当前 HP +3（可叠加）' },
  vital_shot_stack:     { title: '续命箭',      desc: '击杀时回复等同层数的 HP（可叠加）' },
  focus_stack:          { title: '专注蓄力',    desc: '攻击力 + 当前层数×0.5（可叠加）' },
  deadeye:              { title: '死神之眼',    desc: 'HP ≤ 30% 时攻击 ×1.5' },
  last_arrow:           { title: '最后一箭',    desc: '本层首次 HP ≤ 30% 时 AP +3（一次性）' },
  // ── 隐匿者（AC-16 M2 基础 + AC-404 扩展）──
  swift:                { title: '疾步',        desc: '移动消耗 AP -1' },
  backstab:             { title: '背刺',        desc: '移动后首次攻击双倍伤害' },
  stealth:              { title: '潜行',        desc: '怪物仇恨范围对你缩小 2' },
  afterimage:           { title: '残影',        desc: '每层闪避首次受到的攻击' },
  assassin_heart:       { title: '刺客之心',    desc: '对非追击状态敌人 +20 伤害' },
  shadow_strike:        { title: '暗影突袭',    desc: 'HP ≤ 25% 时攻击翻倍' },
  retribution:          { title: '夜枭反击',    desc: '受击后下次攻击 +5 伤害' },
  shockwave:            { title: '震荡波',      desc: '命中后对相邻敌人造成 50% 溅射伤害' },
  evasion_training:     { title: '闪避训练',    desc: '受到 ≥5 伤害时额外减免 2' },
  coup_de_grace:        { title: '致命一击',    desc: '对 HP ≤ 20% 目标 +3 伤害' },
  nimble_stack:         { title: '灵巧',        desc: '选中时最大 HP 及当前 HP +3（可叠加）' },
  bloodletter_stack:    { title: '放血',        desc: '击杀时回复等同层数的 HP（可叠加）' },
  flurry_stack:         { title: '连斩',        desc: '攻击力 + 当前层数×0.5（可叠加）' },
  survival_instinct:    { title: '求生本能',    desc: 'HP ≤ 30% 时攻击 ×1.5' },
  desperate_gambit:     { title: '背水孤注',    desc: '本层首次 HP ≤ 30% 时 AP +3（一次性）' },
  // ── 二阶觉醒专属词条（design §七）──
  awakened_cleave:      { title: '横扫',      desc: '攻击命中后，对相邻怪物造成50%溅射伤害' },
  awakened_frenzy:      { title: '狂热',      desc: '击杀后下一次攻击必定暴击并回复20点HP' },
  awakened_power_shot:  { title: '强弓',      desc: '基础伤害额外+15' },
  awakened_volley:      { title: '连珠',      desc: '连射概率提升至60%，并有30%概率连锁' },
  awakened_execute:     { title: '处决',      desc: '目标HP低于30%时直接处决，背刺伤害提升至3倍' },
  awakened_shadow_strike: { title: '影袭',    desc: '每回合可触发2次背刺伤害' },
};

for (const def of STRENGTHEN_DEFS) {
  STRENGTHEN_LABEL[def.id] = { title: def.name, desc: def.desc };
}

export function strengthenInfo(id: string): { title: string; desc: string } {
  return STRENGTHEN_LABEL[id] ?? { title: id, desc: '' };
}

/** 装备词条显示标签（铁匠洗炼结果 + 背包列表展示用，必须覆盖所有 trait id）。 */
export const EQUIP_TRAIT_LABEL: Record<string, string> = {
  // 铁匠普通词条
  equip_atk_up:  '攻击 +10',
  equip_def_up:  '防御 +10',
  equip_hp_up:   '最大 HP +20',
  equip_crit_up: '暴击率 +5%',
  equip_gold_up: '拾取金币 +10%',
  equip_swift:   '移动 AP -1',
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

/** 远征提示视图（战斗战报 toast + 灵气强化 3 选 1 弹窗） → P2 PveToastView */
export class PveToastView {
  private _root: Node;
  private _toastNode: Node | null = null;
  private _toastLabel: Label | null = null;
  private _toastTimer: ReturnType<typeof setTimeout> | null = null;
  private _choiceNode: Node | null = null;
  private _guideNode: Node | null = null;
  private _guideLabel: Label | null = null;

  constructor(parent: Node, private _screenW: number, private _screenH: number) {
    this._root = new Node('PveToastView');
    this._root.setParent(parent);
    this._root.setPosition(0, 0, 0);
    this._root.setSiblingIndex(9999);
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
    if (!this._guideNode) {
      const boxW = 520;
      const boxH = 110;
      const node = new Node('GuideBubble');
      node.setParent(this._root);
      node.setPosition(0, this._screenH / 2 - 210, 0);
      node.addComponent(UITransform).setContentSize(boxW, boxH);
      const g = node.addComponent(Graphics);
      g.fillColor = new Color(7, 31, 70, 205);
      g.roundRect(-boxW / 2, -boxH / 2, boxW, boxH, 18);
      g.fill();
      g.strokeColor = new Color(255, 214, 110, 240);
      g.lineWidth = 2;
      g.roundRect(-boxW / 2 + 1, -boxH / 2 + 1, boxW - 2, boxH - 2, 17);
      g.stroke();
      this._guideLabel = makeLabel(node, 0, 0, boxW - 48, boxH - 24, 24, IMPORTANT_TEXT_COLOR, Label.HorizontalAlign.CENTER);
      this._guideLabel.lineHeight = 30;
      this._guideNode = node;
    }
    if (this._guideLabel) this._guideLabel.string = message;
    if (this._guideNode) this._guideNode.active = true;
  }

  hideGuideBubble(): void {
    if (this._guideNode) this._guideNode.active = false;
  }

  /** 错误操作反馈：toast 节点横向抖动（AP 不足 / 方向阻塞等）。 */
  shakeToast(): void {
    if (this._toastNode?.active) void Effects.hit(this._toastNode, { strength: 0.8 });
  }

  /**
   * 灵气满 100 触发的 3 选 1 强化弹窗：阻塞式 —— 玩家必须选定一项后才会 resolve。
   * M1 强化池为占位数值词条（见 acceptance-checklist 已知问题表）。
   */
  showStrengthenChoice(choices: string[]): Promise<string> {
    return new Promise((resolve) => {
      this._closeChoice();

      // 统一与玩家状态卡同款半透明圆角风格；移除红底 panel_strengthen_9s 与
      // card_strengthen_choice_9s 不透明叠层，按钮全部走 noArt。
      const boxW = 620;
      const titlePadTop = 24;
      const titleH = 36;
      const titleToBtnGap = 18;
      const btnH = 64;
      const btnGap = 14;
      const bottomPad = 24;
      const boxH = titlePadTop + titleH + titleToBtnGap + choices.length * btnH
        + (choices.length - 1) * btnGap + bottomPad;

      const box = new Node('StrengthenChoice');
      box.setParent(this._root);
      box.setPosition(0, 0, 0);
      box.addComponent(UITransform).setContentSize(boxW, boxH);
      const g = box.addComponent(Graphics);
      g.fillColor = new Color(7, 31, 70, 170);
      g.roundRect(-boxW / 2, -boxH / 2, boxW, boxH, 18);
      g.fill();
      g.strokeColor = new Color(84, 200, 239, 240);
      g.lineWidth = 2;
      g.roundRect(-boxW / 2 + 1, -boxH / 2 + 1, boxW - 2, boxH - 2, 17);
      g.stroke();

      const titleLbl = makeLabel(
        box, 0, boxH / 2 - titlePadTop - titleH / 2, boxW - 60, titleH, 26,
        new Color(255, 220, 120, 255), Label.HorizontalAlign.CENTER,
      );
      titleLbl.string = '灵气满溢 · 选择一项强化';
      titleLbl.isBold = true;

      let y = boxH / 2 - titlePadTop - titleH - titleToBtnGap - btnH / 2;
      for (const choiceId of choices) {
        const info = strengthenInfo(choiceId);
        const btn = makeFlatButton(
          box, `${info.title}：${info.desc}`, 0, y, boxW - 80, btnH,
          () => {
            this._closeChoice();
            resolve(choiceId);
          },
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

  /**
   * 命运树「三选一」弹窗（E2 命运馈赠 / E3 命运护佑，阻塞式）：
   * 展示 title + 候选项文案列表，玩家选定后 resolve 所选下标。
   */
  showTreeChoice(title: string, options: string[]): Promise<number> {
    return new Promise((resolve) => {
      this._closeChoice();

      const box = new Node('TreeChoice');
      box.setParent(this._root);
      box.setPosition(0, 0, 0);
      const boxW = 620;
      const boxH = 120 + options.length * 84;
      box.addComponent(UITransform).setContentSize(boxW, boxH);
      const g = box.addComponent(Graphics);
      g.fillColor = PANEL_COLOR;
      g.rect(-boxW / 2, -boxH / 2, boxW, boxH);
      g.fill();
      this._decoratePanel(box, 'pve/popup/panel_interact_9s', boxW, boxH);

      makeLabel(
        box, 0, boxH / 2 - 44, boxW - 60, 40, 28,
        new Color(255, 220, 120, 255), Label.HorizontalAlign.CENTER,
      ).string = title;

      let y = boxH / 2 - 110;
      options.forEach((label, index) => {
        makeFlatButton(
          box, label, 0, y, boxW - 80, 64,
          () => {
            this._closeChoice();
            resolve(index);
          },
          new Color(70, 110, 160, 255),
        );
        y -= 84;
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
      this._closeChoice();
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
          () => { this._closeChoice(); resolve(opt.value); },
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

  /** 远征结算弹窗：星尘行显示瓶子图标，其余与 showConfirm 同款底板。 */
  showSettleResult(params: {
    status: 'DEAD' | 'COMPLETED';
    floor: number;
    diamond?: number;
    destinyShards?: number;
  }): Promise<void> {
    return new Promise((resolve) => {
      this._closeChoice();
      const { status, floor, diamond, destinyShards } = params;

      const hasDiamond = (diamond ?? 0) > 0;
      const hasShards  = (destinyShards ?? 0) > 0;
      const hasReward  = hasDiamond || hasShards;

      const lineH        = 32;
      const badgeH       = 38;
      const badgeGap     = 14;
      const titlePadTop  = 24;
      const floorH       = lineH;
      const rewardGap    = 10;
      const rewardRowH   = 36;
      const rewardCount  = hasReward ? (hasDiamond ? 1 : 0) + (hasShards ? 1 : 0) : 1;
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
      floorLbl.string = `已探索 ${floor} 层`;

      // 奖励行
      let rowY = floorY - floorH / 2 - rewardGap - rewardRowH / 2;

      if (!hasReward) {
        makeLabel(box, 0, rowY, boxW - 40, rewardRowH, 22, TEXT_COLOR, Label.HorizontalAlign.CENTER).string = '（本次无奖励）';
      } else {
        const REWARD_COLOR = new Color(255, 220, 100, 255);
        if (hasDiamond) {
          // [图标(22) + 间距(6) + 文字≈74] 整体居中：
          //   整体宽102，块左=-51，图标中心=-40，图标右=-29，文字中心=+14
          //   间隙 = 6px，与 🔮+space 一致
          const iconSize = 22;
          const iconNode = new Node('StardustIcon');
          iconNode.setParent(box);
          iconNode.setPosition(-40, rowY, 0);
          iconNode.addComponent(UITransform).setContentSize(iconSize, iconSize);
          void loadUiSprite('pve/lobby/icon_chip_stardust').then((frame) => {
            if (!frame || !iconNode.isValid) return;
            ensureArtChild(iconNode, 'Art', frame, iconSize, iconSize);
          }).catch(() => null);

          const lbl = makeLabel(box, 14, rowY, boxW - 40, rewardRowH, 22, REWARD_COLOR, Label.HorizontalAlign.CENTER);
          lbl.isBold = true;
          lbl.string = `星尘 +${diamond}`;
          rowY -= rewardRowH;
        }
        if (hasShards) {
          const shardsLbl = makeLabel(box, 0, rowY, boxW - 40, rewardRowH, 22, REWARD_COLOR, Label.HorizontalAlign.CENTER);
          shardsLbl.isBold = true;
          shardsLbl.string = `🔮 命运碎片 +${destinyShards}`;
        }
      }

      // 确认按钮
      const btnY = -boxH / 2 + bottomPad + btnH / 2;
      const btn = makeFlatButton(
        box, '确认', 0, btnY, boxW - 80, btnH,
        () => { this._closeChoice(); resolve(); },
        new Color(52, 73, 95, 170),
        { noArt: true, border: new Color(255, 214, 110, 240) },
      );
      const btnLbl = btn.getChildByName('Label')?.getComponent(Label);
      if (btnLbl) btnLbl.isBold = true;

      this._setChoiceNode(box);
    });
  }

  /**
   * 职业进阶选择弹窗（阻塞式，AC-15 M2）。
   * available: 可进阶的职业 id 列表；玩家选定后 resolve 职业 id，点「稍后决定」resolve null。
   */
  showClassAdvanceChoice(available: string[]): Promise<string | null> {
    const CLASS_NAME: Record<string, string> = {
      BERSERKER: '⚔️ 狂战士（攻击 +15，即时损失约一成HP）',
      ARCHER: '🏹 射手（攻击 +5，射程 +2）',
      ROGUE: '🗡️ 隐匿者（攻击 +10，移动 +1）',
    };

    return new Promise((resolve) => {
      this._closeChoice();
      const transparentBtn = { noArt: true, border: new Color(255, 214, 110, 210) } as const;

      const box = new Node('ClassAdvanceChoice');
      box.setParent(this._root);
      box.setPosition(0, 0, 0);
      const boxW = 596;
      const boxH = 162 + available.length * 80;
      box.addComponent(UITransform).setContentSize(boxW, boxH);
      const g = box.addComponent(Graphics);
      g.fillColor = new Color(7, 31, 70, 170);
      g.roundRect(-boxW / 2, -boxH / 2, boxW, boxH, 18);
      g.fill();
      g.strokeColor = new Color(84, 200, 239, 210);
      g.lineWidth = 2;
      g.roundRect(-boxW / 2 + 1, -boxH / 2 + 1, boxW - 2, boxH - 2, 17);
      g.stroke();

      makeLabel(
        box, 0, boxH / 2 - 38, boxW - 56, 40, 28,
        new Color(255, 220, 100, 255), Label.HorizontalAlign.CENTER,
      ).string = '职业碎片集齐！选择进阶职业';

      let y = boxH / 2 - 108;
      for (const classId of available) {
        const label = CLASS_NAME[classId] ?? classId;
        makeFlatButton(
          box, label, 0, y, boxW - 92, 66,
          () => { this._closeChoice(); resolve(classId); },
          new Color(84, 100, 132, 180),
          transparentBtn,
        );
        y -= 80;
      }
      makeFlatButton(
        box, '稍后决定', 0, y - 2, boxW - 92, 54,
        () => { this._closeChoice(); resolve(null); },
        new Color(84, 100, 132, 170),
        transparentBtn,
      );

      this._setChoiceNode(box);
    });
  }

  /**
   * 二阶觉醒确认弹窗（阻塞式，design §七）。
   * className: 当前职业中文名（如"狂战士"）；玩家确认后 resolve true，点「稍后决定」resolve false。
   * 觉醒形态由 ClassSystem.applyClassAwaken 内部根据副职业碎片数判定，此处不剧透具体形态。
   */
  showClassAwakenChoice(className: string): Promise<boolean> {
    return new Promise((resolve) => {
      this._closeChoice();
      const transparentBtn = { noArt: true, border: new Color(255, 214, 110, 210) } as const;

      const box = new Node('ClassAwakenChoice');
      box.setParent(this._root);
      box.setPosition(0, 0, 0);
      const boxW = 596;
      const boxH = 236;
      box.addComponent(UITransform).setContentSize(boxW, boxH);
      const g = box.addComponent(Graphics);
      g.fillColor = new Color(7, 31, 70, 170);
      g.roundRect(-boxW / 2, -boxH / 2, boxW, boxH, 18);
      g.fill();
      g.strokeColor = new Color(84, 200, 239, 210);
      g.lineWidth = 2;
      g.roundRect(-boxW / 2 + 1, -boxH / 2 + 1, boxW - 2, boxH - 2, 17);
      g.stroke();

      makeLabel(
        box, 0, boxH / 2 - 40, boxW - 56, 40, 28,
        new Color(255, 220, 100, 255), Label.HorizontalAlign.CENTER,
      ).string = '🌟 二阶觉醒条件已满足！';

      makeLabel(
        box, 0, boxH / 2 - 88, boxW - 56, 60, 22,
        TEXT_COLOR, Label.HorizontalAlign.CENTER,
      ).string = `是否唤醒 [${className}] 体内蕴藏的更强力量？`;

      makeFlatButton(
        box, '立即觉醒', 0, -boxH / 2 + 74, boxW - 92, 64,
        () => { this._closeChoice(); resolve(true); },
        new Color(84, 100, 132, 180),
        transparentBtn,
      );
      makeFlatButton(
        box, '稍后决定', 0, -boxH / 2 + 22, boxW - 92, 48,
        () => { this._closeChoice(); resolve(false); },
        new Color(84, 100, 132, 170),
        transparentBtn,
      );

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
   * @param shopItems     - 商品列表，每项含 id/name/desc/cost
   * @param onBuy         - 购买回调：成功时返回更新后的 player，失败返回 null
   * @param onSellEquip   - 变卖装备回调：成功时返回更新后的 player，失败返回 null
   */
  showCamp(
    chapter: number,
    initialPlayer: { hp: number; maxHp: number; gold: number; equipment: Equipment; bag?: EquipItem[] },
    shopItems: ReadonlyArray<{ id: string; name: string; desc: string; cost: number }>,
    onBuy: (itemId: string) => { hp: number; maxHp: number; gold: number; equipment: Equipment; bag?: EquipItem[] } | null,
    onSellEquip: (
      target: { source: 'equipment'; slot: EquipSlot } | { source: 'bag'; itemId: string },
    ) => { hp: number; maxHp: number; gold: number; equipment: Equipment; bag?: EquipItem[] } | null,
    onRelicChest?: () => {
      hp: number; maxHp: number; gold: number; equipment: Equipment; bag?: EquipItem[];
      message: string;
    } | null,
    relicChestMeta?: { costGold: number; costDiamond: number; currentDiamond: number; relicName: string; alreadyOwned: boolean },
    blacksmithCbs?: {
      onUpgrade: (slot: EquipSlot) => { gold: number; equipment: Equipment } | null;
      onReroll: (slot: EquipSlot) => { gold: number; equipment: Equipment } | null;
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
      let currentPlayer = { ...initialPlayer };
      const transparentBtn = { noArt: true, border: new Color(255, 214, 110, 210) } as const;

      const BOX_W = 640;
      // 默认 2 项 → 520（含装备整理按钮行 +80），每多一项 +80；
      // 遗物宝箱按钮存在时再 +80；铁匠按钮存在时再 +80
      const BOX_H = 520 + (shopItems.length - 2) * 80 + (onRelicChest ? 80 : 0) + (blacksmithCbs ? 80 : 0);

      // ── 装备整理面板（先声明以便 buildModal 引用）────────────
      let buildEquipPanel!: () => void;

      const buildModal = () => {
        this._closeChoice();
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
        ).string = `❤️  HP ${p.hp} / ${p.maxHp}       💰  金币 ${p.gold}`;
        curY -= 18 + 14;

        // 商店标题
        curY -= 12;
        makeLabel(
          box, 0, curY, BOX_W - 60, 24, 18,
          new Color(140, 150, 170, 255), Label.HorizontalAlign.CENTER,
        ).string = '── 营地商店 ──';
        curY -= 12 + 16;

        // 商品按钮
        for (const item of shopItems) {
          const alreadyFull = item.id === 'HEAL_FULL' && p.hp >= p.maxHp;
          const canAfford = p.gold >= item.cost;
          const enabled = canAfford && !alreadyFull;

          curY -= 34;
          const label = `${item.name}  ${item.desc}   （${item.cost} 💰）`;
          if (enabled) {
            makeFlatButton(
              box, label, 0, curY, BOX_W - 80, 68,
              () => {
                const updated = onBuy(item.id);
                if (updated) { currentPlayer = { ...updated }; buildModal(); }
              },
              new Color(55, 110, 75, 180),
              transparentBtn,
            );
          } else {
            const disabledLabel = alreadyFull
              ? `${item.name}  ${item.desc}   （已满血）`
              : `${item.name}  ${item.desc}   （${item.cost} 💰 · 金币不足）`;
            makeFlatButton(box, disabledLabel, 0, curY, BOX_W - 80, 68,
              () => { /* disabled */ }, new Color(55, 58, 68, 150), transparentBtn);
          }
          curY -= 34 + 12;
        }

        // 装备整理按钮
        curY -= 16;
        curY -= 32;
        makeFlatButton(
          box, '⚒️ 装备整理（变卖装备换金币）', 0, curY, BOX_W - 80, 64,
          () => buildEquipPanel(),
          new Color(100, 80, 50, 178),
          transparentBtn,
        );
        curY -= 32 + 12;

        // 铁匠铺按钮（仅当 blacksmithCbs 提供时显示）
        if (blacksmithCbs) {
          curY -= 16;
          curY -= 32;
          makeFlatButton(
            box, '🔨 铁匠铺（强化 / 洗炼装备）', 0, curY, BOX_W - 80, 64,
            () => {
              this._closeChoice();
              void this.showBlacksmith(
                currentPlayer,
                (slot) => {
                  const updated = blacksmithCbs.onUpgrade(slot);
                  if (updated) currentPlayer = { ...currentPlayer, ...updated };
                  return updated;
                },
                (slot) => {
                  const updated = blacksmithCbs.onReroll(slot);
                  if (updated) currentPlayer = { ...currentPlayer, ...updated };
                  return updated;
                },
              ).then(() => buildModal());
            },
            new Color(90, 65, 30, 178),
            transparentBtn,
          );
          curY -= 32 + 12;
        }

        // 遗物宝箱（仅当 onRelicChest 提供时显示）
        if (onRelicChest && relicChestMeta) {
          const meta = relicChestMeta;
          const canOpen = p.gold >= meta.costGold && meta.currentDiamond >= meta.costDiamond;
          curY -= 32;
          const tag = meta.alreadyOwned ? '已持有 · 中奖时返还 30%' : '10% 概率开出';
          const label = canOpen
            ? `🎁 ${meta.relicName} 宝箱（${meta.costGold}💰 + ${meta.costDiamond}星尘）${tag}`
            : `🎁 ${meta.relicName} 宝箱（${meta.costGold}💰 + ${meta.costDiamond}星尘）资源不足`;
          makeFlatButton(
            box, label, 0, curY, BOX_W - 80, 64,
            () => {
              if (!canOpen) return;
              const updated = onRelicChest();
              if (updated) {
                currentPlayer = { hp: updated.hp, maxHp: updated.maxHp, gold: updated.gold, equipment: updated.equipment };
                buildModal();
              }
            },
            canOpen ? new Color(120, 70, 130, 178) : new Color(55, 58, 68, 150),
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
          () => { this._closeChoice(); resolve('continue'); }, new Color(50, 90, 160, 178), transparentBtn);
        makeFlatButton(box, '返回大厅', rightX, curY, btnW, 64,
          () => { this._closeChoice(); resolve('quit'); }, new Color(90, 55, 55, 178), transparentBtn);

        this._setChoiceNode(box);
      };

      buildEquipPanel = () => {
        this._closeChoice();
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
        ).string = '⚒️ 装备整理（变卖装备获得金币）';
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
              `${SLOT_LABEL[slot]}：${item.name}（${EQUIP_QUALITY_LABEL[item.quality] ?? item.quality}）  💰 变卖 +${sellGold}`,
              0, curY, EQ_W - 80, 56,
              () => {
                const updated = onSellEquip({ source: 'equipment', slot });
                if (updated) { currentPlayer = { ...updated }; buildEquipPanel(); }
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
              `${SLOT_LABEL[item.slot]}：${item.name}（${EQUIP_QUALITY_LABEL[item.quality] ?? item.quality}）  💰 变卖 +${sellGold}`,
              0, curY, EQ_W - 80, 56,
              () => {
                const updated = onSellEquip({ source: 'bag', itemId: item.id });
                if (updated) { currentPlayer = { ...updated }; buildEquipPanel(); }
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
          () => buildModal(), new Color(55, 90, 140, 178), transparentBtn);

        this._setChoiceNode(equip);
      };

      buildModal();
    });
  }

  /**
   * 铁匠弹窗（阻塞式）：显示当前装备，提供强化（+1 基础属性）与洗炼（重置词条）按钮。
   * 点「离开铁匠」后 resolve。回调返回 null 表示操作失败（金币不足等）。
   *
   * @param initialPlayer - 玩家当前状态（gold + equipment）
   * @param onUpgrade     - 强化回调：成功返回更新后的 player，失败返回 null
   * @param onReroll      - 洗炼回调：成功返回更新后的 player，失败返回 null
   */
  showBlacksmith(
    initialPlayer: { gold: number; equipment: Equipment },
    onUpgrade: (slot: EquipSlot) => { gold: number; equipment: Equipment } | null,
    onReroll: (slot: EquipSlot) => { gold: number; equipment: Equipment } | null,
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
      let currentPlayer = { ...initialPlayer };
      const transparentBtn = { noArt: true, border: new Color(255, 214, 110, 210) } as const;

      const buildPanel = () => {
        const tBuild = performance.now();
        this._closeChoice();
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
        ).string = `💰 当前金币：${p.gold}`;
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
          // 词条：仅紫色(EPIC)/传说(LEGENDARY)品质有词条槽，低品质不显示词条
          const hasTraitSlot = item.quality === 'EPIC' || item.quality === 'LEGENDARY';
          const traitText = hasTraitSlot
            ? (item.trait ? `[${EQUIP_TRAIT_LABEL[item.trait] ?? '特殊词条'}]` : '[未洗炼]')
            : '[低品质无词条]';

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

          // 强化 / 洗炼按钮（并排）
          curY -= 30;
          const btnW = Math.floor((BOX_W - 120) / 2);
          const upgradeCost = upgradeCostFor(item, slot);
          const canUpgrade = p.gold >= upgradeCost;
          const canReroll = hasTraitSlot && p.gold >= 30;

          const step = upgradeStepFor(slot, item);
          const upgradeLabel = `强化${SLOT_ATTR_LABEL[slot]} ${item.baseStat}→${item.baseStat + step}`;
          if (canUpgrade) {
            makeFlatButton(
              box, `${upgradeLabel}（${upgradeCost}💰）`, -(btnW / 2 + 8), curY, btnW, 60,
              () => {
                const updated = onUpgrade(slot);
                if (updated) { currentPlayer = { ...updated }; buildPanel(); }
              },
              new Color(50, 100, 60, 178),
              transparentBtn,
            );
          } else {
            makeFlatButton(box, `${upgradeLabel}（${upgradeCost}💰 不足）`, -(btnW / 2 + 8), curY, btnW, 60,
              () => {}, new Color(40, 50, 40, 150), transparentBtn);
          }

          if (!hasTraitSlot) {
            // 低品质：灰色禁用按钮，提示无词条槽
            makeFlatButton(box, `品质过低·无词条`, btnW / 2 + 8, curY, btnW, 60,
              () => {}, new Color(45, 45, 45, 150), transparentBtn);
          } else if (canReroll) {
            makeFlatButton(
              box, `洗炼词条（30💰）`, btnW / 2 + 8, curY, btnW, 60,
              () => {
                const updated = onReroll(slot);
                if (updated) { currentPlayer = { ...updated }; buildPanel(); }
              },
              new Color(80, 50, 120, 178),
              transparentBtn,
            );
          } else {
            makeFlatButton(box, `洗炼词条（30💰 不足）`, btnW / 2 + 8, curY, btnW, 60,
              () => {}, new Color(40, 40, 55, 150), transparentBtn);
          }

          curY -= 30 + 8;
        }

        // 离开按钮
        curY -= 16;
        curY -= 26;
        makeFlatButton(
          box, '← 离开铁匠', 0, curY, BOX_W - 80, 52,
          () => { console.log('[BS] leave button clicked'); this._closeChoice(); resolve(); },
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

  private _closeChoice(): void {
    if (this._choiceNode) {
      Effects.stop(this._choiceNode);
      this._choiceNode.destroy();
      this._choiceNode = null;
    }
  }

  /** 弹窗节点登记 helper：所有 `_choiceNode = box;` 都改走这里，统一获得 pop 进场动画。 */
  private _setChoiceNode(node: Node, strength = 1.2): void {
    this._choiceNode = node;
    void Effects.pop(node, { strength });
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

  private _decorateCamp(node: Node, panelW: number, panelH: number): void {
    void Promise.all([
      loadUiSprite('pve/backgrounds/bg_pve_camp'),
      loadUiSprite('pve/camp/panel_camp_main_9s'),
    ]).then(([background, panel]) => {
      if (!node.isValid) return;
      if (background) {
        ensureArtCover(node, 'CampBackground', background, this._screenW, this._screenH).node.setSiblingIndex(0);
      }
      if (panel) {
        const art = ensureArtStretch(node, 'CampPanel', panel, panelW, panelH);
        art.node.setSiblingIndex(background ? 1 : 0);
      }
    }).catch(() => null);
  }

  /**
   * 背包弹窗：上半部分展示已装备槽位，下半部分展示背包道具。
   * 点击背包中的装备"装备"按钮后调用 onEquipFromBag，返回更新后的 player 状态（null=无效）。
   * 点击"关闭"后 resolve。
   */
  showBackpack(
    initialPlayer: { equipment: Equipment; bag?: EquipItem[]; scrolls?: number },
    onEquipFromBag: (itemId: string) => { equipment: Equipment; bag?: EquipItem[] } | null,
  ): Promise<void> {
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
        const scrolls = current.scrolls ?? 0;

        // 体积放大约 2.5×：从老版本 ~360 → 900；宽度同步加大，给格子和文字呼吸空间
        const BOX_W = 680;
        const BOX_H = 900;

        const box = new Node('BackpackPanel');
        box.setParent(this._root);
        box.setPosition(0, 0, 0);
        box.addComponent(UITransform).setContentSize(BOX_W, BOX_H);
        const bg = box.addComponent(Graphics);
        bg.fillColor = new Color(7, 31, 70, 170);
        bg.roundRect(-BOX_W / 2, -BOX_H / 2, BOX_W, BOX_H, 20);
        bg.fill();
        bg.strokeColor = new Color(84, 200, 239, 210);
        bg.lineWidth = 2;
        bg.roundRect(-BOX_W / 2 + 1, -BOX_H / 2 + 1, BOX_W - 2, BOX_H - 2, 19);
        bg.stroke();

        let curY = BOX_H / 2 - 36;

        // 标题（加粗加大）
        const titleLbl = makeLabel(box, 0, curY, BOX_W - 40, 48, 32, new Color(255, 195, 90, 255), Label.HorizontalAlign.CENTER);
        titleLbl.string = '🎒 背包';
        titleLbl.isBold = true;
        curY -= 60;

        // ── 上半区：已装备 5 格 ──
        const sectionLbl = makeLabel(box, 0, curY, BOX_W - 40, 30, 22, new Color(140, 200, 240, 255), Label.HorizontalAlign.CENTER);
        sectionLbl.string = '— 已装备 —';
        sectionLbl.isBold = true;
        curY -= 40;

        // 5 格水平排列
        const SLOT_SIZE = 108;
        const SLOT_GAP = 14;
        const slotRowW = SLOT_ORDER.length * SLOT_SIZE + (SLOT_ORDER.length - 1) * SLOT_GAP;
        const slotStartX = -slotRowW / 2 + SLOT_SIZE / 2;
        const slotCenterY = curY - SLOT_SIZE / 2;

        SLOT_ORDER.forEach((slot, idx) => {
          const item = current.equipment[slot];
          const x = slotStartX + idx * (SLOT_SIZE + SLOT_GAP);

          // 槽位底框
          const slotNode = new Node(`Slot_${slot}`);
          slotNode.setParent(box);
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
            // 已装备：显示装备名字首字（占位，后续替换为装备图标）
            const initial = (item.name ?? SLOT_LABEL[slot]).slice(0, 1);
            const charLbl = makeLabel(slotNode, 0, 8, SLOT_SIZE - 8, SLOT_SIZE - 24, 56, borderColor, Label.HorizontalAlign.CENTER);
            charLbl.string = initial;
            charLbl.isBold = true;
            // 强化等级角标
            if ((item.enhanceLevel ?? 0) > 0) {
              const ehLbl = makeLabel(slotNode, SLOT_SIZE / 2 - 14, SLOT_SIZE / 2 - 10, 28, 22, 18, new Color(255, 220, 110, 255), Label.HorizontalAlign.RIGHT);
              ehLbl.string = `+${item.enhanceLevel}`;
              ehLbl.isBold = true;
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
        });

        curY -= SLOT_SIZE + 28;

        // ── 下半区：背包道具列表 + 卷轴 + 关闭按钮 ──
        const bagSectionLbl = makeLabel(box, 0, curY, BOX_W - 40, 30, 22, new Color(140, 200, 180, 255), Label.HorizontalAlign.CENTER);
        bagSectionLbl.string = '— 背包道具 —';
        bagSectionLbl.isBold = true;
        curY -= 36;

        if (bag.length === 0) {
          const emptyLbl = makeLabel(box, 0, curY - 20, BOX_W - 60, 36, 20, new Color(120, 140, 160, 255), Label.HorizontalAlign.CENTER);
          emptyLbl.string = '（背包为空）';
          emptyLbl.isBold = true;
          curY -= 56;
        } else {
          for (const item of bag) {
            curY -= 32;
            const enhanceSuffix = (item.enhanceLevel ?? 0) > 0 ? `+${item.enhanceLevel}` : '';
            const traitMark = item.trait ? ` [${EQUIP_TRAIT_LABEL[item.trait] ?? '特殊词条'}]` : '';
            const itemText = `${SLOT_LABEL[item.slot]}：${item.name}${enhanceSuffix}（+${item.baseStat}）${traitMark}`;
            const itemLbl = makeLabel(box, -40, curY, BOX_W - 180, 36, 20, QUALITY_COLOR[item.quality] ?? new Color(220, 230, 245, 255), Label.HorizontalAlign.LEFT);
            itemLbl.string = itemText;
            itemLbl.isBold = true;
            // 装备按钮
            const equipBtn = makeFlatButton(
              box, '装备', BOX_W / 2 - 70, curY, 100, 48,
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

        // 卷轴提示
        if (scrolls > 0) {
          curY -= 18;
          const scrollLbl = makeLabel(box, 0, curY, BOX_W - 60, 36, 20, new Color(155, 132, 225, 255), Label.HorizontalAlign.CENTER);
          scrollLbl.string = `📜 命运卷轴 ×${scrolls}（使用请点左上角卷轴按钮）`;
          scrollLbl.isBold = true;
          curY -= 32;
        }

        // 关闭按钮固定在弹窗底部（不跟随上方内容流动）
        const closeBtn = makeFlatButton(
          box, '关闭', 0, -BOX_H / 2 + 50, BOX_W - 100, 60,
          () => { closeDetail(); this._closeChoice(); resolve(); },
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
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._root.destroy();
  }
}
