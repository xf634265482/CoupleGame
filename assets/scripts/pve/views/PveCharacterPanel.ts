// 角色信息弹窗（design §3 / §8 / §10/§11 概览）：点击 HUD「角色」按钮弹出，展示
// 职业 / HP / 攻击力 / 装备 / 词条 / 职业碎片 / 成就 / 图鉴。
// 半透明遮罩 + 居中面板；点击遮罩或关闭按钮收起，期间冻结主场景输入由 Controller 负责。

import { Color, EventTouch, Graphics, Label, Node, UITransform } from 'cc';
import { findAchievement } from '../core/AchievementSystem';
import { playerAttackPower } from '../core/CombatSystem';
import { SHOES_FIRST_MOVE_THRESHOLD, SHOES_REVEAL_BONUS_THRESHOLD, SHOES_STEALTH_THRESHOLD, shoesStealthReduction } from '../core/EquipmentSystem';
import { AP_BASE, AWAKEN_FORMS, BASE_ATTACK, CLASS_FRAGMENTS_TO_ADVANCE, CLASS_FRAGMENTS_TO_AWAKEN, INITIAL_HP } from '../core/PveConstants';
import { RELIC_DEFS } from '../core/RelicSystem';
import type { EquipItem, EquipSlot, ExpeditionState, PveMeta } from '../core/PveTypes';
import { EQUIP_TRAIT_LABEL, STRENGTHEN_LABEL } from './PveToastView';
import { makeFlatButton, makeLabel } from './pveUiKit';

const TITLE_COLOR  = new Color(245, 220, 130, 255);
const TEXT_COLOR   = new Color(225, 230, 240, 255);
const DIM_COLOR    = new Color(160, 165, 180, 255);
const BG_COLOR     = new Color(28, 32, 44, 240);
const MASK_COLOR   = new Color(0, 0, 0, 170);
const BORDER_COLOR = new Color(120, 130, 160, 200);
const POPUP_BG     = new Color(18, 22, 36, 255);  // 完全不透明，防止底层内容透出

/** 装备品质的文字颜色（用于弹窗标题）。 */
const QUALITY_TEXT: Record<string, Color> = {
  COMMON:    new Color(180, 185, 200, 255),
  FINE:      new Color(100, 210, 100, 255),
  RARE:      new Color(100, 180, 255, 255),
  EPIC:      new Color(200, 120, 255, 255),
  LEGENDARY: new Color(255, 190,  60, 255),
};
/** 装备品质的边框颜色（用于弹窗边框）。 */
const QUALITY_BORDER: Record<string, Color> = {
  COMMON:    new Color(140, 145, 160, 255),
  FINE:      new Color( 80, 180,  80, 255),
  RARE:      new Color( 60, 140, 240, 255),
  EPIC:      new Color(160,  80, 240, 255),
  LEGENDARY: new Color(240, 150,  30, 255),
};

const PANEL_W = 580;
const PANEL_H = 760; // 760px：成就区段 + 遗物/卷轴展示区段（Task #10）

const CLASS_LABEL: Record<string, string> = {
  ADVENTURER: '冒险者',
  BERSERKER:  '狂战士',
  ARCHER:     '射手',
  ROGUE:      '隐匿者',
};

const QUALITY_LABEL: Record<string, string> = {
  COMMON:    '普通',
  FINE:      '精良',
  RARE:      '稀有',
  EPIC:      '史诗',
  LEGENDARY: '传奇',
};

const SLOT_LABEL: Record<EquipSlot, string> = {
  WEAPON:  '武器',
  HELMET:  '头盔',
  ARMOR:   '护甲',
  SHOES:   '靴子',
  TRINKET: '饰品',
};
const SLOT_ORDER: EquipSlot[] = ['WEAPON', 'HELMET', 'ARMOR', 'SHOES', 'TRINKET'];

/** 角色信息弹窗 → 由 ExpeditionController 在「角色」按钮回调中 show()/hide()。 */
export class PveCharacterPanel {
  private _root: Node;
  private _statsLabel:        Label;
  /** 装备槽位行（可点击，点击弹出 _detailPopup）。 */
  private _equipRowLabels:    Label[]  = [];
  /** 对应每个槽位当前装备的快照，供点击时读取。 */
  private _currentItems:      (EquipItem | undefined)[] = [];
  private _detailPopup:       Node  | null = null;
  private _detailTitleLabel:  Label | null = null;
  private _detailBodyLabel:   Label | null = null;
  private _detailGfx:         Graphics | null = null;
  private _traitsLabel:       Label;
  private _fragmentsLabel:    Label;
  private _achievementsLabel: Label;
  private _codexLabel:        Label;
  private _visible = false;

  constructor(parent: Node, screenW: number, screenH: number, onClose?: () => void) {
    this._root = new Node('PveCharacterPanel');
    this._root.setParent(parent);
    this._root.setSiblingIndex(9999); // 顶层
    this._root.active = false;

    // 全屏遮罩（吃掉点击 → 自动关闭）
    const mask = new Node('Mask');
    mask.setParent(this._root);
    mask.addComponent(UITransform).setContentSize(screenW, screenH);
    const mg = mask.addComponent(Graphics);
    mg.fillColor = MASK_COLOR;
    mg.rect(-screenW / 2, -screenH / 2, screenW, screenH);
    mg.fill();
    mask.on(Node.EventType.TOUCH_END, (_e: EventTouch) => {
      this.hide();
      onClose?.();
    });

    // 面板背景
    const panel = new Node('Panel');
    panel.setParent(this._root);
    panel.setPosition(0, 0, 0);
    panel.addComponent(UITransform).setContentSize(PANEL_W, PANEL_H);
    // 阻止点击穿透：面板内的点击不应触发遮罩关闭
    panel.on(Node.EventType.TOUCH_END, (e: EventTouch) => e.propagationStopped = true);
    const pg = panel.addComponent(Graphics);
    pg.fillColor = BG_COLOR;
    pg.rect(-PANEL_W / 2, -PANEL_H / 2, PANEL_W, PANEL_H);
    pg.fill();
    pg.strokeColor = BORDER_COLOR;
    pg.lineWidth = 2;
    pg.rect(-PANEL_W / 2 + 1, -PANEL_H / 2 + 1, PANEL_W - 2, PANEL_H - 2);
    pg.stroke();

    // 标题
    makeLabel(
      panel, 0, PANEL_H / 2 - 30,
      PANEL_W - 40, 32, 24, TITLE_COLOR, Label.HorizontalAlign.CENTER,
    ).string = '👤 角色信息';

    // 基础属性（7 行：职业/HP/攻击/金币&灵气/AP/骰子/钥匙）
    this._statsLabel     = this._makeSection(panel, PANEL_H / 2 - 80,  170, TEXT_COLOR);

    // 装备（1 行标题 + 5 行可点击槽位行）
    this._buildEquipRows(panel);
    this._buildDetailPopup(panel);

    // 词条 + 遗物 + 卷轴（3 行：词条 / 遗物 / 卷轴）
    this._traitsLabel    = this._makeSection(panel, PANEL_H / 2 - 395,  95, DIM_COLOR);

    // 职业碎片（下移 60px 以适应 traits 区段扩展）
    this._fragmentsLabel = this._makeSection(panel, PANEL_H / 2 - 500,  35, DIM_COLOR);

    // 成就（CLAMP 防溢出，120px 足够 5 行）
    this._achievementsLabel = this._makeSection(panel, PANEL_H / 2 - 545, 120, new Color(255, 215, 100, 255));
    this._achievementsLabel.overflow = Label.Overflow.CLAMP;

    // 图鉴
    this._codexLabel = this._makeSection(panel, PANEL_H / 2 - 685,  50, DIM_COLOR);

    // 关闭按钮
    makeFlatButton(
      panel, '关闭', 0, -PANEL_H / 2 + 30, 120, 40,
      () => { this.hide(); onClose?.(); },
      new Color(120, 130, 145, 255),
    );
  }

  /** 构建装备标题行 + 5 个可点击槽位行（占据原 _makeSection y=PANEL_H/2-265 h=120 区域）。 */
  private _buildEquipRows(panel: Node): void {
    const TOP_Y = PANEL_H / 2 - 265;   // 同原 _makeSection 第一参数
    const ROW_H = 20;

    // 标题行
    makeLabel(panel, 0, TOP_Y - ROW_H / 2, PANEL_W - 60, ROW_H, 16, TEXT_COLOR, Label.HorizontalAlign.LEFT)
      .string = '装备：（点击查看详情）';

    // 5 个槽位行
    this._equipRowLabels = [];
    this._currentItems   = new Array(SLOT_ORDER.length).fill(undefined);
    SLOT_ORDER.forEach((slot, i) => {
      const rowY = TOP_Y - ROW_H - i * ROW_H;   // 每行中心 y
      const rowNode = new Node(`EquipRow_${slot}`);
      rowNode.setParent(panel);
      rowNode.setPosition(0, rowY - ROW_H / 2, 0);
      rowNode.addComponent(UITransform).setContentSize(PANEL_W - 60, ROW_H);

      const lbl = rowNode.addComponent(Label);
      lbl.fontSize = 15;
      lbl.color    = DIM_COLOR;
      lbl.string   = `  ${SLOT_LABEL[slot]}：(空)`;
      lbl.horizontalAlign = Label.HorizontalAlign.LEFT;
      lbl.verticalAlign   = Label.VerticalAlign.CENTER;
      this._equipRowLabels.push(lbl);

      rowNode.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
        e.propagationStopped = true;
        const item = this._currentItems[i];
        if (item) this._showEquipDetail(item);
      });
    });
  }

  /** 构建装备详情浮层（默认隐藏，_showEquipDetail 时显示）。 */
  private _buildDetailPopup(panel: Node): void {
    const POP_W = 440;
    const POP_H = 210;

    const popup = new Node('EquipDetailPopup');
    popup.setParent(panel);
    popup.setPosition(0, -80, 0);  // 面板中下区域
    popup.setSiblingIndex(9999);   // 确保渲染在面板所有子节点之上
    popup.addComponent(UITransform).setContentSize(POP_W, POP_H);
    popup.active = false;

    // 背景 + 边框（边框颜色在 _showEquipDetail 中动态更新）
    const gfx = popup.addComponent(Graphics);
    gfx.fillColor = POPUP_BG;
    gfx.rect(-POP_W / 2, -POP_H / 2, POP_W, POP_H);
    gfx.fill();
    gfx.strokeColor = BORDER_COLOR;
    gfx.lineWidth = 2;
    gfx.rect(-POP_W / 2 + 1, -POP_H / 2 + 1, POP_W - 2, POP_H - 2);
    gfx.stroke();

    // 装备名标题（颜色由品质决定，动态设置）
    const titleLbl = makeLabel(popup, 0, POP_H / 2 - 22, POP_W - 24, 28, 19, TEXT_COLOR, Label.HorizontalAlign.CENTER);

    // 属性正文（多行）
    const bodyLbl = makeLabel(popup, 0, POP_H / 2 - 70, POP_W - 32, 110, 15, TEXT_COLOR, Label.HorizontalAlign.LEFT);
    bodyLbl.verticalAlign = Label.VerticalAlign.TOP;

    // 关闭按钮
    makeFlatButton(popup, '关闭', 0, -POP_H / 2 + 22, 100, 36,
      () => { popup.active = false; },
      new Color(80, 90, 110, 255),
    );

    // 点击弹窗背景本身也关闭
    popup.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
      popup.active = false;
    });

    this._detailPopup      = popup;
    this._detailTitleLabel = titleLbl;
    this._detailBodyLabel  = bodyLbl;
    this._detailGfx        = gfx;
  }

  /** 显示指定装备的详情浮层。 */
  private _showEquipDetail(item: EquipItem): void {
    if (!this._detailPopup || !this._detailTitleLabel || !this._detailBodyLabel || !this._detailGfx) return;

    const qualityStr  = QUALITY_LABEL[item.quality] ?? item.quality;
    const slotStr     = SLOT_LABEL[item.slot];
    const titleColor  = QUALITY_TEXT[item.quality] ?? TEXT_COLOR;
    const borderColor = QUALITY_BORDER[item.quality] ?? BORDER_COLOR;

    // 更新标题颜色与文字
    this._detailTitleLabel.color  = titleColor;
    this._detailTitleLabel.string = item.name;

    // 动态更新边框颜色（重绘）
    const POP_W = 440, POP_H = 210;
    const gfx = this._detailGfx;
    gfx.clear();
    gfx.fillColor = POPUP_BG;
    gfx.rect(-POP_W / 2, -POP_H / 2, POP_W, POP_H);
    gfx.fill();
    gfx.strokeColor = borderColor;
    gfx.lineWidth = 2;
    gfx.rect(-POP_W / 2 + 1, -POP_H / 2 + 1, POP_W - 2, POP_H - 2);
    gfx.stroke();

    // 正文内容
    const effectLine = this._slotEffectDesc(item.slot, item.baseStat);
    const traitLine  = item.trait
      ? `词条：${PveCharacterPanel._TRAIT_CN[item.trait] ?? item.trait}`
      : '词条：(未洗炼)';

    this._detailBodyLabel.string = [
      `${slotStr} · ${qualityStr}`,
      `主属性：${effectLine}`,
      traitLine,
    ].join('\n');

    this._detailPopup.active = true;
  }

  /**
   * 装备词条完整中文映射（通用词条 + Boss 专属词条）。
   * 补充 BossEquipTraitEffects 里的 trait id，避免详情弹窗显示英文 id。
   */
  private static readonly _TRAIT_CN: Record<string, string> = {
    // 通用词条（与 EQUIP_TRAIT_LABEL 一致）
    equip_atk_up:  '攻击 +10',
    equip_def_up:  '防御 +10',
    equip_hp_up:   '最大HP +20',
    equip_crit_up: '暴击率 +5%',
    equip_gold_up: '拾取金币 +10%',
    equip_swift:   '移动AP -1',
    // Boss 专属词条（BossEquipTraitEffects.ts 命名规范）
    'on_hit_lifesteal_1': '命中吸血（回复HP）',
    'boss_stun_on_hurt':  '受击有概率眩晕攻击者',
    'boss_bleed_on_hit':  '命中附加流血',
    'boss_sand_immune':   '沙坑地形免疫',
    'boss_phys_reduce_15':'物理减伤 15%',
    'boss_slow_on_hit':   '命中减速（冰冻1回合）',
    'boss_ice_reduce_20': '站冰面时减伤 20%',
    'boss_burn_on_hit':   '命中附加灼烧',
    'boss_burn_immune':   '灼烧免疫',
    'boss_kill_heal_8':   '击杀回复 8 HP',
    'boss_crit_15':       '15% 概率暴击×2',
    'boss_revive_50':     '致死时复活（回50%HP，每场1次）',
  };

  /** 按槽位 + baseStat 生成主属性效果描述。 */
  private _slotEffectDesc(slot: EquipSlot, baseStat: number): string {
    switch (slot) {
      case 'WEAPON':  return `攻击力 +${baseStat}`;
      case 'HELMET':  return `最大HP +${baseStat}`;
      case 'ARMOR':   return `每次受伤减伤 ${baseStat} 点`;
      case 'TRINKET': return `灵气获取量 +${baseStat}%`;
      case 'SHOES': {
        const parts: string[] = [`靴子等级 ${baseStat}`];
        if (baseStat >= SHOES_REVEAL_BONUS_THRESHOLD) parts.push('移动后视野 +1');
        if (baseStat >= SHOES_FIRST_MOVE_THRESHOLD)   parts.push('每回合首次移动免费');
        if (baseStat >= SHOES_STEALTH_THRESHOLD)      parts.push(`怪物仇恨半径 -${shoesStealthReduction(baseStat)}`);
        return parts.join(' · ');
      }
    }
  }

  private _makeSection(parent: Node, y: number, h: number, color: Color): Label {
    const lbl = makeLabel(
      parent, 0, y - h / 2,
      PANEL_W - 60, h, 16, color, Label.HorizontalAlign.LEFT,
    );
    lbl.verticalAlign = Label.VerticalAlign.TOP;
    return lbl;
  }

  /** 用当前 ExpeditionState（+ 可选局外元进度）刷新所有字段（show 时调用）。 */
  update(state: ExpeditionState, meta?: PveMeta): void {
    const { player, floorState } = state;
    const cls = CLASS_LABEL[player.classId] ?? player.classId;
    const { damage, range } = playerAttackPower(player);
    const threshold = player.animaThreshold ?? 100;

    // ── 基础属性 ──────────────────────────────────────────────
    const awakenLine = player.awakenForm
      ? `🌟 觉醒形态：${AWAKEN_FORMS[player.awakenForm].name}`
      : null;

    // HP/攻击力/AP 数值组成：基础值 + 装备/词条/命运树等加成，方便玩家核对来源
    const hpBonus = player.maxHp - INITIAL_HP;
    const hpLine = hpBonus !== 0
      ? `HP：${player.hp} / ${player.maxHp}（${INITIAL_HP}+${hpBonus}）`
      : `HP：${player.hp} / ${player.maxHp}`;

    const attackBonus = damage - BASE_ATTACK;
    const attackLine = attackBonus !== 0
      ? `攻击力：⚔️ ${damage}（${BASE_ATTACK}+${attackBonus}，攻击范围 ${range}）`
      : `攻击力：⚔️ ${damage}（攻击范围 ${range}）`;

    // maxAp = AP_BASE + 骰子 + 加成（强化/命运树/冰冻惩罚等），骰子之外的加成按差值反推
    const apBonus = floorState.maxAp - AP_BASE - floorState.dice;
    const apLine = apBonus !== 0
      ? `当前回合 AP：${floorState.ap}/${floorState.maxAp}（${AP_BASE}+🎲${floorState.dice}${apBonus > 0 ? '+' : ''}${apBonus}）`
      : `当前回合 AP：${floorState.ap}/${floorState.maxAp}（${AP_BASE}+🎲${floorState.dice}）`;

    this._statsLabel.string = [
      `职业：${cls}`,
      ...(awakenLine ? [awakenLine] : []),
      hpLine,
      attackLine,
      `金币：${player.gold}    灵气：${player.anima}（进度 ${player.animaProgress}/${threshold}）`,
      apLine,
      `钥匙：${floorState.hasKey ? '✅ 已持有' : '⬜ 未拾取'}`,
    ].join('\n');

    // ── 装备行刷新 ────────────────────────────────────────────
    SLOT_ORDER.forEach((slot, i) => {
      const item = player.equipment[slot];
      this._currentItems[i] = item;
      const lbl = this._equipRowLabels[i];
      if (!lbl) return;
      if (!item) {
        lbl.color = DIM_COLOR;
        lbl.string = `  ${SLOT_LABEL[slot]}：(空)`;
      } else {
        lbl.color = QUALITY_TEXT[item.quality] ?? TEXT_COLOR;
        const traitMark = item.trait ? ' ★' : '';
        const enhanceSuffix = (item.enhanceLevel ?? 0) > 0 ? `+${item.enhanceLevel}` : '';
        lbl.string = `  ${SLOT_LABEL[slot]}：${item.name}${enhanceSuffix} +${item.baseStat}${traitMark}  ▸`;
      }
    });

    // ── 词条 + 遗物 + 卷轴 ────────────────────────────────────
    const traits = player.classTraits;
    const traitNames = traits.map((id) => STRENGTHEN_LABEL[id]?.title ?? id);
    const traitLine = `词条：${traitNames.length === 0 ? '(无)' : traitNames.join('、')}`;
    const relics = player.relics ?? [];
    const relicLine = relics.length > 0
      ? `🏺 遗物：${relics.map((r) => RELIC_DEFS[r]?.name ?? r).join('、')}`
      : '🏺 遗物：(无)';
    const scrolls = player.scrolls ?? 0;
    const scrollLine = scrolls > 0 ? `📜 命运卷轴：×${scrolls}` : '';
    this._traitsLabel.string = [traitLine, relicLine, ...(scrollLine ? [scrollLine] : [])].join('\n');

    // ── 职业碎片 ──────────────────────────────────────────────
    const fragEntries = Object.entries(player.classFragments)
      .filter(([, n]) => (n ?? 0) > 0)
      .map(([k, n]) => {
        if (k === player.classId) {
          return player.awakenForm
            ? `${CLASS_LABEL[k] ?? k} ${n}（已觉醒）`
            : `${CLASS_LABEL[k] ?? k} ${n}/${CLASS_FRAGMENTS_TO_AWAKEN}（觉醒）`;
        }
        return `${CLASS_LABEL[k] ?? k} ${n}/${CLASS_FRAGMENTS_TO_ADVANCE}`;
      });
    this._fragmentsLabel.string = `职业碎片：${fragEntries.length === 0 ? '(无)' : fragEntries.join('  ')}`;

    // ── 成就（AC-20）─────────────────────────────────────────
    if (meta) {
      // 防御性过滤：确保是纯字符串数组（兼容云端脏数据或序列化异常）
      const rawUnlocked = meta.achievements;
      const unlocked: string[] = Array.isArray(rawUnlocked)
        ? rawUnlocked.filter((a): a is string => typeof a === 'string')
        : [];

      if (unlocked.length === 0) {
        this._achievementsLabel.string = '🏆 成就：(暂无)';
      } else {
        const lines = [`🏆 成就（${unlocked.length}/8）：`];
        for (const id of unlocked) {
          const def = findAchievement(id);
          lines.push(`  ✅ ${def ? def.name : id}`);
        }
        this._achievementsLabel.string = lines.join('\n');
      }

      // ── 图鉴（AC-20）──────────────────────────────────────
      const monCount = meta.codex.monsters.length;
      const eqCount  = meta.codex.equipment.length;
      this._codexLabel.string =
        `📖 图鉴：` +
        `怪物 ${monCount} 种  装备 ${eqCount} 种  ` +
        `💎 命运碎片 ${meta.destinyShards}`;
    } else {
      this._achievementsLabel.string = '🏆 成就：(加载中…)';
      this._codexLabel.string        = '📖 图鉴：(加载中…)';
    }
  }

  show(state: ExpeditionState, meta?: PveMeta): void {
    this.update(state, meta);
    this._root.active = true;
    this._visible = true;
  }

  hide(): void {
    this._root.active = false;
    this._visible = false;
  }

  get visible(): boolean {
    return this._visible;
  }

  destroy(): void {
    this._root.destroy();
  }
}
