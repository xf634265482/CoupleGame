// 角色信息弹窗（design §3 / §8 / §10/§11 概览）：点击 HUD「角色」按钮弹出，展示
// 职业 / HP / 攻击力 / 装备 / 词条 / 职业碎片 / 成就 / 图鉴。
// 半透明遮罩 + 居中面板；点击遮罩或关闭按钮收起，期间冻结主场景输入由 Controller 负责。

import { Color, EventTouch, Graphics, Label, Node, UITransform } from 'cc';
import { findAchievement } from '../core/AchievementSystem';
import { playerAttackPower } from '../core/CombatSystem';
import { AP_BASE, AWAKEN_FORMS, BASE_ATTACK, CLASS_FRAGMENTS_TO_ADVANCE, CLASS_FRAGMENTS_TO_AWAKEN, INITIAL_HP } from '../core/PveConstants';
import type { EquipSlot, ExpeditionState, PveMeta } from '../core/PveTypes';
import { EQUIP_TRAIT_LABEL, STRENGTHEN_LABEL } from './PveToastView';
import { makeFlatButton, makeLabel } from './pveUiKit';

const TITLE_COLOR = new Color(245, 220, 130, 255);
const TEXT_COLOR  = new Color(225, 230, 240, 255);
const DIM_COLOR   = new Color(160, 165, 180, 255);
const BG_COLOR    = new Color(28, 32, 44, 240);
const MASK_COLOR  = new Color(0, 0, 0, 170);
const BORDER_COLOR = new Color(120, 130, 160, 200);

const PANEL_W = 580;
const PANEL_H = 700; // 扩展高度（+80px）为成就区段留出足够空间（AC-20）

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
  private _equipLabel:        Label;
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

    // 装备（1 行标题 + 5 行槽位）
    this._equipLabel     = this._makeSection(panel, PANEL_H / 2 - 265, 120, TEXT_COLOR);

    // 词条
    this._traitsLabel    = this._makeSection(panel, PANEL_H / 2 - 395,  35, DIM_COLOR);

    // 职业碎片
    this._fragmentsLabel = this._makeSection(panel, PANEL_H / 2 - 440,  35, DIM_COLOR);

    // 成就（CLAMP 防溢出，120px 足够 5 行）
    this._achievementsLabel = this._makeSection(panel, PANEL_H / 2 - 485, 120, new Color(255, 215, 100, 255));
    this._achievementsLabel.overflow = Label.Overflow.CLAMP;

    // 图鉴
    this._codexLabel = this._makeSection(panel, PANEL_H / 2 - 625,  50, DIM_COLOR);

    // 关闭按钮
    makeFlatButton(
      panel, '关闭', 0, -PANEL_H / 2 + 30, 120, 40,
      () => { this.hide(); onClose?.(); },
      new Color(120, 130, 145, 255),
    );
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

    // ── 装备 ──────────────────────────────────────────────────
    const equipLines = SLOT_ORDER.map((slot) => {
      const item = player.equipment[slot];
      if (!item) return `  ${SLOT_LABEL[slot]}：(空)`;
      const qualityStr = QUALITY_LABEL[item.quality] ?? item.quality;
      const traitStr   = item.trait ? `  · ${EQUIP_TRAIT_LABEL[item.trait] ?? item.trait}` : '';
      return `  ${SLOT_LABEL[slot]}：${item.name}（${qualityStr}）+${item.baseStat}${traitStr}`;
    });
    this._equipLabel.string = '装备：\n' + equipLines.join('\n');

    // ── 词条 ──────────────────────────────────────────────────
    const traits = player.classTraits;
    const traitNames = traits.map((id) => STRENGTHEN_LABEL[id]?.title ?? id);
    this._traitsLabel.string = `词条：${traitNames.length === 0 ? '(无)' : traitNames.join('、')}`;

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
