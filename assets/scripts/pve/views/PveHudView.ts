import {
  Button,
  Color,
  Graphics,
  Label,
  Layers,
  Node,
  Sprite,
  tween,
  Tween,
  UIOpacity,
  UITransform,
  Vec3,
} from 'cc';
import { topSafeBoundaryY } from '../../platform/wechat/ViewAdapt';
import { getCachedSprite, loadUiSprite } from '../../ui/UiAssets';
import { applySpriteInsideFixedBox } from '../../ui/UiSprite';
import { playSfx, SFX_IDS } from '../../audio/AudioManager';
import { playerArmorPower, playerAttackPower } from '../core/CombatSystem';
import { CHAPTER3_ICE_WALL_HP, isBossFloor, ROCK_HP } from '../core/PveConstants';
import type { Direction } from '../core/MovementSystem';
import type { ExpeditionState, FixedEntity, Monster } from '../core/PveTypes';
import { getChapter1Objective } from '../core/objectives/Chapter1Objectives';
import { getChapter2Objective } from '../core/chapter2/Chapter2Objectives';
import { CLASS_DISPLAY_NAMES } from '../core/professions/ProfessionDisplayNames';
import { makeLabel } from './pveUiKit';

export type PveHudCallbacks = {
  onMove: (dir: Direction) => void;
  onAttack: () => void;
  onInteract: () => void;
  onEndTurn: () => void;
  onQuit?: () => void;
  onShowCharacter?: () => void;
  /**
   * 右上角「目标」：弹出本层通关条件（仅主目标，不含可选目标）。
   * 永久逐层模式下不再展示灵气/职业强化词条；若传入本回调则覆盖默认弹窗。
   */
  onShowObjective?: () => void;
  onOpenBag?: () => void;
  /** 永久逐层：职业机制按钮（战士蓄力 / 游侠瞄准说明 / 潜行者连击·收招）。 */
  onProfessionMechanic?: () => void;
  /** @deprecated 使用 onProfessionMechanic */
  onCharge?: () => void;
  /** 永久逐层模式：沿用原操作面板增加灵气爆发。 */
  onSpiritBurst?: () => void;
};

const WHITE = new Color(246, 250, 255, 255);
const MUTED = new Color(190, 218, 236, 255);
const GOLD = new Color(255, 226, 138, 255);
const CYAN = new Color(103, 216, 255, 255);
const PANEL = new Color(7, 31, 70, 170);
const PANEL_LIGHT = new Color(16, 57, 98, 245);
const PANEL_BORDER = new Color(84, 200, 239, 240);
const HP_COLOR = new Color(230, 82, 100, 255);
const AP_COLOR = new Color(72, 174, 229, 255);
const TYPE_BADGE_BLUE_FILL = new Color(20, 72, 120, 228);
const TYPE_BADGE_BLUE_BORDER = new Color(126, 203, 242, 255);
const TYPE_BADGE_BLUE_TEXT = new Color(232, 246, 255, 255);
const TYPE_BADGE_RED_FILL = new Color(110, 28, 28, 230);
const TYPE_BADGE_RED_BORDER = new Color(255, 196, 92, 255);
const TYPE_BADGE_RED_TEXT = new Color(255, 236, 188, 255);
const CLASS_LABEL: Record<string, string> = CLASS_DISPLAY_NAMES;

const DPAD_SIZE = 84;
const DPAD_GAP = 6;
const ACTION_W = 126;
const ACTION_H = 52;
const ACTION_GAP = 8;
const INFO_H = 160;

/** 从胶囊安全线到地图顶部所需的 HUD 高度（含顶部资源/怪物卡）。 */
export const PVE_HUD_PANEL_H = 124;
/** 底部信息卡（最近战报/玩家状态）的几何信息，供 ExpeditionController 计算 mapBottom。 */
export const PVE_HUD_INFO_TOP_OFFSET = 274 + INFO_H / 2;
export { INFO_H as PVE_HUD_INFO_H };

const MONSTER_NAMES: Record<string, string> = {
  GOBLIN_WARRIOR: '哥布林战士',
  GOBLIN_ARCHER: '哥布林弓手',
  GOBLIN_SENTINEL: '哥布林哨兵',
  BANNER_CAPTAIN: '断旗哨长',
  /** 历史 id；第一章第四层统一称「哨兵」，勿再显示「传令兵」。 */
  MESSENGER: '哥布林哨兵',
  FROST_GOBLIN: '霜寒哥布林',
  FIRE_GOBLIN: '烈焰哥布林',
  SPIRIT_RAT: '灵气鼠',
  GOBLIN_CHIEF: '哥布林酋长',
  DESERT_RAIDER: '沙漠劫匪',
  SANDWORM_LARVA: '沙漠跃蜥',
  DESERT_HOPPER_LIZARD: '沙漠跃蜥',
  DUNE_SENTINEL: '沙暴警戒者',
  POISON_SCORPION: '毒蝎',
  SPIRIT_BEETLE: '灵甲虫',
  QUICKSAND_SCORPION: '流沙蝎王',
  SNOW_WOLF: '雪狼',
  ICE_SLIME: '冰刺豪猪',
  FROSTSPIKE_PORCUPINE: '冰刺豪猪',
  FROST_SPRITE: '冰霜精灵',
  GLACIER_SHAPER: '冰川塑形者',
  SPIRIT_ELF: '灵霜雪兔',
  FROST_GIANT: '冰霜巨人',
  LAVA_GRUNT: '灰烬猎犬',
  ASH_HOUND: '灰烬猎犬',
  LAVA_CRAB: '岩浆蟹',
  FIRE_ELEMENTAL: '火焰元素',
  SPIRIT_EMBER: '灵火',
  LAVA_LORD: '熔岩领主',
  SHADOW_ASSASSIN: '影子刺客',
  FATE_WATCHER: '命运守望者',
  VOID_WORM: '命运轮兽',
  FATE_WHEEL_BEAST: '命运轮兽',
  SPIRIT_MIRAGE: '灵气幻影',
  FATE_GUARDIAN: '命运守卫',
};

const MONSTER_TYPE_NAMES: Record<string, string> = {
  NORMAL: '普通',
  ELITE: '精英',
  ANIMA: '灵气',
  BOSS: '首领',
};

function monsterKey(monster: Monster): string {
  return monster.bossId ?? monster.variantId ?? monster.type;
}

function monsterName(monster: Monster): string {
  return MONSTER_NAMES[monsterKey(monster)] ?? MONSTER_TYPE_NAMES[monster.type] ?? '未知敌人';
}

/** 怪物异常状态文案（左上角怪物卡展示）。 */
function formatMonsterStatuses(monster: Monster): string {
  const parts: string[] = [];
  if ((monster.bleedRounds ?? 0) > 0) parts.push(`流血 ${monster.bleedRounds}`);
  if ((monster.poisonRounds ?? 0) > 0) parts.push(`中毒 ${monster.poisonRounds}`);
  if ((monster.burnRounds ?? 0) > 0) parts.push(`灼烧 ${monster.burnRounds}`);
  if ((monster.frozenRounds ?? 0) > 0) parts.push(`冰寒 ${monster.frozenRounds}`);
  return parts.join(' · ');
}

const VARIANT_FALLBACK_ART: Record<string, string> = {
  GOBLIN_SENTINEL: 'pve/map/icon_monster_ch1_goblin_sentinel',
  BANNER_CAPTAIN: 'pve/map/icon_monster_ch1_elite',
  MESSENGER: 'pve/map/icon_monster_ch1_normal',
  DESERT_RAIDER: 'pve/map/icon_monster_ch2_normal',
  SANDWORM_LARVA: 'pve/map/icon_monster_ch2_hopper_lizard',
  DESERT_HOPPER_LIZARD: 'pve/map/icon_monster_ch2_hopper_lizard',
  DUNE_SENTINEL: 'pve/map/icon_monster_ch2_dune_sentinel',
  POISON_SCORPION: 'pve/map/icon_monster_ch2_elite',
  SPIRIT_BEETLE: 'pve/map/icon_monster_ch2_anima',
  QUICKSAND_SCORPION: 'pve/map/icon_monster_ch2_boss',
  SNOW_WOLF: 'pve/map/icon_monster_ch3_normal',
  ICE_SLIME: 'pve/map/icon_monster_ch3_frostspike_porcupine',
  FROSTSPIKE_PORCUPINE: 'pve/map/icon_monster_ch3_frostspike_porcupine',
  FROST_SPRITE: 'pve/map/icon_monster_ch3_elite',
  GLACIER_SHAPER: 'pve/map/icon_monster_ch3_glacier_shaper',
  SPIRIT_ELF: 'pve/map/icon_monster_ch3_anima',
  FROST_GIANT: 'pve/map/icon_monster_ch3_boss',
  LAVA_GRUNT: 'pve/map/icon_monster_ch4_ash_hound',
  ASH_HOUND: 'pve/map/icon_monster_ch4_ash_hound',
  LAVA_CRAB: 'pve/map/icon_monster_ch4_magma_crab',
  FIRE_ELEMENTAL: 'pve/map/icon_monster_ch4_fire_elemental',
  SPIRIT_EMBER: 'pve/map/icon_monster_ch4_anima',
  LAVA_LORD: 'pve/map/icon_monster_ch4_boss',
  SHADOW_ASSASSIN: 'pve/map/icon_monster_ch5_normal',
  FATE_WATCHER: 'pve/map/icon_monster_ch5_fate_watcher',
  VOID_WORM: 'pve/map/icon_monster_ch5_fatewheel_beast',
  FATE_WHEEL_BEAST: 'pve/map/icon_monster_ch5_fatewheel_beast',
  SPIRIT_MIRAGE: 'pve/map/icon_monster_ch5_anima',
  FATE_GUARDIAN: 'pve/map/icon_monster_ch5_boss',
};

function monsterArtKey(monster: Monster, chapter: number): string {
  const fallback = VARIANT_FALLBACK_ART[monsterKey(monster)];
  if (fallback) return fallback;
  const key = monsterKey(monster).toLowerCase();
  if (monster.bossId || monster.variantId) return `pve/map/icon_monster_${key}`;
  return `pve/map/icon_monster_ch${chapter}_${monster.type.toLowerCase()}`;
}

function entityName(entity: FixedEntity): string {
  const names: Record<FixedEntity['type'], string> = {
    CHEST: '宝箱',
    IDOL: '神像',
    HOT_SPRING: '温泉',
    ALTAR: '祭坛',
    BLACKSMITH: '铁匠铺',
    KEY: '钥匙',
    EXIT: '出口',
    PORTAL: '传送门',
    GUNPOWDER_BARREL: '火药桶',
    BLAST_TARGET: '爆破点',
    ESCAPE_MARKER: '逃离点',
    WAVE_SPAWN_MARKER: '刷怪点',
    ROCK: '石墙',
    SAND_PIT: '流沙坑',
    ICE_WALL: '冰墙',
    ICE_TILE: '冰面',
    FREEZE_WALL: '冻结冰墙',
    SHATTERED_ICE: '碎冰',
    LAVA_TILE: '熔岩地块',
  };
  return names[entity.type];
}

function entityArtKey(entity: FixedEntity): string {
  const keys: Partial<Record<FixedEntity['type'], string>> = {
    CHEST: 'pve/map/icon_chest',
    IDOL: 'pve/map/icon_idol',
    HOT_SPRING: 'pve/map/icon_hot_spring',
    ALTAR: 'pve/map/icon_altar',
    BLACKSMITH: 'pve/map/icon_blacksmith',
    KEY: 'pve/map/icon_key',
    EXIT: 'pve/map/icon_exit',
    PORTAL: 'pve/map/icon_portal',
    GUNPOWDER_BARREL: 'pve/map/icon_gunpowder_barrel',
    BLAST_TARGET: 'pve/map/icon_blast_target',
    ROCK: 'pve/map/terrain_rock',
    SAND_PIT: 'pve/map/icon_sand_pit_permanent',
    ICE_WALL: 'pve/map/terrain_ice_wall',
    ICE_TILE: 'pve/map/terrain_ice_tile',
    FREEZE_WALL: 'pve/map/terrain_freeze_wall',
    SHATTERED_ICE: 'pve/map/terrain_shattered_ice',
    LAVA_TILE: 'pve/map/terrain_lava',
  };
  return keys[entity.type] ?? '';
}

function entityInfo(entity: FixedEntity): { type: string; detail: string; action: string } {
  switch (entity.type) {
    case 'ICE_WALL':
      return { type: '地形', detail: '阻挡移动 · 可攻击破坏', action: '击碎后获得灵气' };
    case 'ROCK':
      return { type: '地形', detail: '阻挡移动 · 可攻击破坏', action: '击碎后可通过该格' };
    case 'CHEST':
      return { type: '交互物', detail: '', action: '可能获得星尘或装备' };
    case 'KEY':
      return { type: '关键物', detail: '', action: '用于开启出口' };
    case 'EXIT':
      return { type: '出口', detail: '', action: '进入下一层' };
    case 'PORTAL':
      return { type: '传送门', detail: '', action: '进入营地' };
    case 'IDOL':
      return { type: '交互物', detail: '站到同格后可祈福', action: '获得随机祝福' };
    case 'HOT_SPRING':
      return { type: '交互物', detail: '站到同格后可使用', action: '恢复生命' };
    case 'ALTAR':
      return { type: '交互物', detail: '站到同格后可使用', action: '获得祭坛效果' };
    case 'WAVE_SPAWN_MARKER':
      return { type: '刷怪点', detail: '夜袭敌人会在此出现', action: '不可交互，注意防守' };
    case 'ESCAPE_MARKER':
      return { type: '逃离点', detail: '目标到达此处即逃脱', action: '尽快拦截' };
    case 'BLACKSMITH':
      return { type: '交互物', detail: '站到同格后可互动', action: '强化装备' };
    case 'GUNPOWDER_BARREL':
      return { type: '交互物', detail: '站到同格后可激活', action: '激怒周围敌人' };
    case 'BLAST_TARGET':
      return { type: '交互物', detail: '激活火药桶后可引爆', action: '引爆完成目标' };
    case 'SAND_PIT':
      return { type: '危险地形', detail: '经过时额外消耗行动力', action: '注意绕行' };
    case 'ICE_TILE':
      return { type: '危险地形', detail: '踏入后会沿冰面滑行', action: '注意落点' };
    case 'FREEZE_WALL':
      return { type: '冻结障碍', detail: '阻挡移动 · 冻结状态生成', action: '攻击任意目标可解除冻结' };
    case 'SHATTERED_ICE':
      return { type: '危险地形', detail: '踏入会受到伤害', action: '注意绕行' };
    case 'LAVA_TILE':
      return { type: '危险地形', detail: '踏入会受到熔岩伤害', action: '注意绕行' };
  }
}

function addPanel(parent: Node, name: string, x: number, y: number, w: number, h: number): Node {
  const node = new Node(name);
  node.setParent(parent);
  node.layer = Layers.Enum.UI_2D;
  node.setPosition(x, y, 0);
  node.addComponent(UITransform).setContentSize(w, h);
  const g = node.addComponent(Graphics);
  g.fillColor = PANEL;
  g.roundRect(-w / 2, -h / 2, w, h, 16);
  g.fill();
  g.strokeColor = PANEL_BORDER;
  g.lineWidth = 2;
  g.roundRect(-w / 2 + 1, -h / 2 + 1, w - 2, h - 2, 15);
  g.stroke();
  return node;
}

function addText(
  parent: Node,
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  size: number,
  color = WHITE,
  align = Label.HorizontalAlign.CENTER,
  bold = true,
): Label {
  const label = makeLabel(parent, x, y, w, h, size, color, align);
  label.string = text;
  label.isBold = bold;
  label.overflow = Label.Overflow.SHRINK;
  return label;
}

function addButton(
  parent: Node,
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  color: Color,
  border: Color,
  onClick: () => void,
): Node {
  const node = new Node(`Btn_${text}`);
  node.setParent(parent);
  node.layer = Layers.Enum.UI_2D;
  node.setPosition(x, y, 0);
  node.addComponent(UITransform).setContentSize(w, h);
  const g = node.addComponent(Graphics);
  g.fillColor = color;
  g.roundRect(-w / 2, -h / 2, w, h, 12);
  g.fill();
  g.strokeColor = border;
  g.lineWidth = 2;
  g.roundRect(-w / 2 + 1, -h / 2 + 1, w - 2, h - 2, 11);
  g.stroke();
  addText(node, text, 0, 0, w - 10, h, h >= 48 ? 24 : 21, WHITE);
  const button = node.addComponent(Button);
  button.transition = Button.Transition.SCALE;
  button.zoomScale = 0.94;
  button.target = node;
  node.on(Button.EventType.CLICK, () => {
    playSfx(SFX_IDS.UI_CLICK);
    onClick();
  }, node);
  return node;
}

function addTriangleIcon(parent: Node, dir: Direction, size: number, color: Color): void {
  const node = new Node(`Triangle_${dir}`);
  node.setParent(parent);
  node.layer = Layers.Enum.UI_2D;
  node.setPosition(0, 0, 0);
  node.addComponent(UITransform).setContentSize(size, size);
  const g = node.addComponent(Graphics);
  g.fillColor = color;
  const half = size / 2;
  const tip = half - 6;
  const wing = half - 16;
  if (dir === 'UP') {
    g.moveTo(0, tip);
    g.lineTo(-wing, -wing);
    g.lineTo(wing, -wing);
  } else if (dir === 'DOWN') {
    g.moveTo(0, -tip);
    g.lineTo(-wing, wing);
    g.lineTo(wing, wing);
  } else if (dir === 'LEFT') {
    g.moveTo(-tip, 0);
    g.lineTo(wing, -wing);
    g.lineTo(wing, wing);
  } else {
    g.moveTo(tip, 0);
    g.lineTo(-wing, -wing);
    g.lineTo(-wing, wing);
  }
  g.close();
  g.fill();
}

export class PveHudView {
  private _root: Node;
  private _floorLabel: Label;
  private _bossBadge: Node;
  private _bossBadgeLabel: Label;
  private _goldLabel: Label;
  private _animaG: Graphics;
  private _animaLabel: Label;
  private _keyBadge: Node;
  private _classBox: Node | null = null;
  private _traitButton: Node | null = null;
  private _objectivePopup: Node | null = null;
  private _objectivePopupBody: Label | null = null;
  private _objectiveLines: string[] = [];

  private _targetPortrait: Node;
  private _targetName: Label;
  private _targetType: Label;
  private _targetTypeBadge: Node;
  private _targetTypeBadgeG: Graphics;
  private _targetTypeBadgeLabel: Label;
  private _targetAttack: Label;
  private _targetHpG: Graphics;
  private _targetHpLabel: Label;
  private _targetBarW = 190;
  private _targetArtKey = '';
  private _focusedMonsterId: string | null = null;
  private _focusedEntityId: string | null = null;

  private _hpG: Graphics;
  private _hpLabel: Label;
  private _apG: Graphics;
  private _apLabel: Label;
  private _attackLabel: Label;
  private _attackRangeLabel!: Label;
  private _armorLabel!: Label;
  private _classLabel!: Label;
  private _statusLabel: Label;

  private _chargeButton: Node | null = null;
  private _chargeButtonLabel: Label | null = null;
  private _spiritBurstButton: Node | null = null;
  private _spiritBurstButtonLabel: Label | null = null;
  private _spiritBurstBlinking = false;
  private _spiritFull = false;
  private _tutorialChargeHighlight = false;
  private _tutorialSpiritBurstHighlight = false;
  private _chargeHighlighting = false;

  constructor(parent: Node, screenW: number, screenH: number, callbacks: PveHudCallbacks) {
    this._root = new Node('PveHudView');
    this._root.layer = Layers.Enum.UI_2D;
    this._root.setParent(parent);
    this._root.addComponent(UITransform).setContentSize(screenW, screenH);

    const safeY = topSafeBoundaryY(12);
    const runY = safeY + 47;
    const topCardY = safeY - 58;
    const outerW = screenW - 40;
    const gap = 12;
    const targetW = Math.round((outerW - gap) * 0.6);
    const resourceW = outerW - gap - targetW;
    const left = -screenW / 2 + 20;

    const runW = 470;
    const chapterW = 278;
    const bossBadgeW = 92;
    const runLeft = left;
    const chapterPanel = addPanel(this._root, 'RunInfo', runLeft + chapterW / 2, runY, chapterW, 48);
    const bossPanelX = runLeft + chapterW + 10 + bossBadgeW / 2;
    const bossPanel = new Node('BossBadgePanel');
    bossPanel.setParent(this._root);
    bossPanel.layer = Layers.Enum.UI_2D;
    bossPanel.setPosition(bossPanelX, runY, 0);
    bossPanel.addComponent(UITransform).setContentSize(bossBadgeW, 48);
    const bossPanelG = bossPanel.addComponent(Graphics);
    bossPanelG.fillColor = new Color(110, 28, 28, 230);
    bossPanelG.roundRect(-bossBadgeW / 2, -24, bossBadgeW, 48, 14);
    bossPanelG.fill();
    bossPanelG.strokeColor = new Color(255, 196, 92, 255);
    bossPanelG.lineWidth = 2;
    bossPanelG.roundRect(-bossBadgeW / 2 + 1, -23, bossBadgeW - 2, 46, 13);
    bossPanelG.stroke();
    this._floorLabel = addText(chapterPanel, '加载中…', 0, 0, chapterW - 18, 44, 22, WHITE);
    this._bossBadge = bossPanel;
    this._bossBadgeLabel = addText(this._bossBadge, '首领回合', 0, 0, bossBadgeW - 10, 36, 18, new Color(255, 236, 188, 255));
    this._bossBadge.active = false;

    const targetPanel = addPanel(
      this._root,
      'MonsterCard',
      left + targetW / 2,
      topCardY,
      targetW,
      112,
    );
    this._targetPortrait = new Node('MonsterPortrait');
    this._targetPortrait.setParent(targetPanel);
    this._targetPortrait.layer = Layers.Enum.UI_2D;
    this._targetPortrait.setPosition(-targetW / 2 + 57, 0, 0);
    this._targetPortrait.addComponent(UITransform).setContentSize(82, 82);
    this._targetPortrait.addComponent(Sprite);
    this._targetName = addText(
      targetPanel,
      '附近暂无敌人',
      32,
      28,
      targetW - 220,
      30,
      24,
      GOLD,
      Label.HorizontalAlign.LEFT,
    );
    this._targetTypeBadge = new Node('MonsterTypeBadge');
    this._targetTypeBadge.setParent(targetPanel);
    this._targetTypeBadge.layer = Layers.Enum.UI_2D;
    this._targetTypeBadge.setPosition(targetW / 2 - 64, 29, 0);
    this._targetTypeBadge.addComponent(UITransform).setContentSize(92, 34);
    this._targetTypeBadgeG = this._targetTypeBadge.addComponent(Graphics);
    this._targetTypeBadgeLabel = addText(
      this._targetTypeBadge,
      '',
      0,
      0,
      76,
      28,
      18,
      TYPE_BADGE_BLUE_TEXT,
      Label.HorizontalAlign.CENTER,
      true,
    );
    this._targetTypeBadge.active = false;
    this._targetType = addText(
      targetPanel,
      '继续探索迷雾',
      32,
      -8,
      targetW - 220,
      44,
      18,
      MUTED,
      Label.HorizontalAlign.LEFT,
      true,
    );
    this._targetType.lineHeight = 20;
    this._targetType.enableWrapText = true;
    this._targetType.verticalAlign = Label.VerticalAlign.CENTER;
    this._targetAttack = addText(
      targetPanel,
      '',
      32,
      -8,
      targetW - 220,
      24,
      18,
      GOLD,
      Label.HorizontalAlign.LEFT,
      true,
    );
    const targetBar = new Node('MonsterHpBar');
    targetBar.setParent(targetPanel);
    targetBar.layer = Layers.Enum.UI_2D;
    targetBar.setPosition(40, -38, 0);
    this._targetBarW = targetW - 150;
    targetBar.addComponent(UITransform).setContentSize(this._targetBarW, 22);
    this._targetHpG = targetBar.addComponent(Graphics);
    this._targetHpLabel = addText(targetBar, '', 0, 0, targetW - 155, 22, 18, WHITE);

    const resourcePanel = addPanel(
      this._root,
      'ResourceCard',
      left + targetW + gap + resourceW / 2,
      topCardY,
      resourceW,
      112,
    );
    const keyBadgeSize = 42;
    const actionColumnX = resourceW / 2 - 28;
    const topContentShiftX = -3;
    const classBoxW = 120;
    const animaBarW = resourceW - 108;
    const animaBar = new Node('AnimaBar');
    animaBar.setParent(resourcePanel);
    animaBar.layer = Layers.Enum.UI_2D;
    animaBar.setPosition(-46, 24, 0);
    animaBar.addComponent(UITransform).setContentSize(animaBarW, 28);
    this._animaG = animaBar.addComponent(Graphics);
    this._animaLabel = addText(animaBar, '灵气 0 / 100', 0, 0, animaBarW - 8, 28, 20, new Color(235, 220, 255, 255));
    this._goldLabel = addText(resourcePanel, '星尘 0', -84, -18, resourceW - 188, 34, 22, GOLD);
    this._goldLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
    const classBox = new Node('ClassBox');
    classBox.setParent(resourcePanel);
    classBox.layer = Layers.Enum.UI_2D;
    classBox.setPosition(15, -18, 0);
    classBox.addComponent(UITransform).setContentSize(classBoxW, 32);
    const classBoxG = classBox.addComponent(Graphics);
    classBoxG.fillColor = new Color(64, 57, 111, 170);
    classBoxG.roundRect(-classBoxW / 2, -16, classBoxW, 32, 12);
    classBoxG.fill();
    classBoxG.strokeColor = new Color(255, 214, 110, 240);
    classBoxG.lineWidth = 2;
    classBoxG.roundRect(-classBoxW / 2 + 1, -15, classBoxW - 2, 30, 11);
    classBoxG.stroke();
    this._classLabel = addText(classBox, '\u5192\u9669\u8005', 0, 0, classBoxW - 10, 28, 16, WHITE);
    this._classLabel.overflow = Label.Overflow.SHRINK;
    this._classLabel.lineHeight = 28;
    this._classLabel.isBold = true;
    this._classBox = classBox;
    this._traitButton = addButton(
      resourcePanel,
      '目标',
      actionColumnX,
      -20,
      49,
      49,
      new Color(64, 57, 111, 170),
      new Color(255, 214, 110, 240),
      () => callbacks.onShowObjective ? callbacks.onShowObjective() : this._toggleObjectivePopup(),
    );
    animaBar.setPosition(animaBar.position.x + topContentShiftX, animaBar.position.y, 0);
    this._goldLabel.node.setPosition(this._goldLabel.node.position.x + topContentShiftX, this._goldLabel.node.position.y, 0);

    // 钥匙图标节点：用 pve/map/icon_key（地图同款），异步加载后填入 Sprite
    this._keyBadge = new Node('KeyBadge');
    this._keyBadge.setParent(resourcePanel);
    this._keyBadge.layer = Layers.Enum.UI_2D;
    this._keyBadge.setPosition(actionColumnX, 22, 0);
    this._keyBadge.addComponent(UITransform).setContentSize(keyBadgeSize, keyBadgeSize);
    this._keyBadge.addComponent(Sprite);
    this._keyBadge.active = false;
    const cachedKey = getCachedSprite('pve/map/icon_key');
    if (cachedKey) {
      applySpriteInsideFixedBox(this._keyBadge, cachedKey, keyBadgeSize, keyBadgeSize);
    } else {
      void loadUiSprite('pve/map/icon_key').then((frame) => {
        if (!frame || !this._keyBadge.isValid) return;
        applySpriteInsideFixedBox(this._keyBadge, frame, keyBadgeSize, keyBadgeSize);
      });
    }

    const infoW = screenW - 40;
    const infoGap = 12;
    const logW = Math.round((infoW - infoGap) * 0.6);
    const playerW = infoW - infoGap - logW;
    // 信息卡向下移到紧贴底部按钮顶（按钮顶约 -screenH/2 + 190；留 16px 余量）。
    // 与 PVE_HUD_INFO_TOP_OFFSET 保持联动：infoY 中心 = 274，panel top = 274 + INFO_H/2。
    const infoY = -screenH / 2 + 274;
    const playerX = -screenW / 2 + 20 + logW + infoGap + playerW / 2;
    const playerPanel = addPanel(this._root, 'PlayerStatusCard', playerX, infoY, playerW, INFO_H);
    const statBoxW = 84;
    const barW = playerW - statBoxW - 36;
    const barCenterX = -37;
    addText(playerPanel, '玩家状态', barCenterX, 43, barW, 28, 22, GOLD);
    const hpBar = new Node('PlayerHpBar');
    hpBar.setParent(playerPanel);
    hpBar.setPosition(barCenterX, 12, 0);
    hpBar.addComponent(UITransform).setContentSize(barW, 26);
    this._hpG = hpBar.addComponent(Graphics);
    this._hpLabel = addText(hpBar, 'HP', 0, 0, barW - 4, 26, 19, WHITE);

    const apBar = new Node('PlayerApBar');
    apBar.setParent(playerPanel);
    apBar.setPosition(barCenterX, -22, 0);
    apBar.addComponent(UITransform).setContentSize(barW, 26);
    this._apG = apBar.addComponent(Graphics);
    this._apLabel = addText(apBar, 'AP', 0, 0, barW - 4, 26, 19, WHITE);

    const statBox = addPanel(playerPanel, 'StatColumn', playerW / 2 - statBoxW / 2 - 8, -2, statBoxW, 138);
    addText(statBox, '攻击', 0, 50, statBoxW - 10, 20, 16, WHITE);
    this._attackLabel = addText(statBox, '0', 0, 30, statBoxW - 10, 22, 20, GOLD);
    addText(statBox, '护甲', 0, 8, statBoxW - 10, 20, 16, WHITE);
    this._armorLabel = addText(statBox, '0', 0, -12, statBoxW - 10, 22, 20, GOLD);
    addText(statBox, '范围', 0, -34, statBoxW - 10, 20, 16, WHITE);
    this._attackRangeLabel = addText(statBox, '1', 0, -56, statBoxW - 10, 22, 20, GOLD);
    this._statusLabel = addText(playerPanel, '', barCenterX, -64, barW, 34, 14, GOLD, Label.HorizontalAlign.LEFT, true);
    this._statusLabel.lineHeight = 16;
    this._statusLabel.overflow = Label.Overflow.SHRINK;
    this._statusLabel.verticalAlign = Label.VerticalAlign.CENTER;

    this._buildControls(callbacks, screenW, screenH);
  }

  private _objectiveAutoHideTimer: ReturnType<typeof setTimeout> | null = null;

  private _clearObjectiveAutoHide(): void {
    if (this._objectiveAutoHideTimer != null) {
      clearTimeout(this._objectiveAutoHideTimer);
      this._objectiveAutoHideTimer = null;
    }
  }

  private _toggleObjectivePopup(): void {
    if (this._objectivePopup?.isValid) {
      this._objectivePopup.active = !this._objectivePopup.active;
      this._refreshObjectivePopup();
      if (!this._objectivePopup.active) this._clearObjectiveAutoHide();
      return;
    }
    const panel = addPanel(this._root, 'ObjectivePopup', 0, 10, 560, 400);
    panel.setSiblingIndex(9999);
    addText(panel, '本层通关条件', 0, 162, 280, 30, 24, GOLD);
    const body = addText(panel, '加载中…', 0, 10, 520, 260, 18, WHITE, Label.HorizontalAlign.LEFT, false);
    body.verticalAlign = Label.VerticalAlign.TOP;
    body.lineHeight = 26;
    addButton(
      panel,
      '关闭',
      0,
      -158,
      180,
      52,
      new Color(52, 73, 95, 170),
      new Color(255, 214, 110, 240),
      () => {
        this._clearObjectiveAutoHide();
        if (this._objectivePopup?.isValid) this._objectivePopup.active = false;
      },
    );
    panel.on(Node.EventType.TOUCH_END, (e) => {
      e.propagationStopped = true;
    });
    this._objectivePopup = panel;
    this._objectivePopupBody = body;
    this._refreshObjectivePopup();
  }

  /** 进层时自动弹出通关条件，片刻后自动关闭（各章统一）。 */
  showObjectiveBrief(durationMs = 4200): void {
    this._clearObjectiveAutoHide();
    if (!this._objectivePopup?.isValid) this._toggleObjectivePopup();
    if (this._objectivePopup?.isValid) {
      this._objectivePopup.active = true;
      this._refreshObjectivePopup();
    }
    this._objectiveAutoHideTimer = setTimeout(() => {
      this._objectiveAutoHideTimer = null;
      if (this._objectivePopup?.isValid) this._objectivePopup.active = false;
    }, durationMs);
  }

  private _refreshObjectivePopup(): void {
    if (!this._objectivePopupBody) return;
    this._objectivePopupBody.string = this._objectiveLines.length > 0
      ? this._objectiveLines.join('\n')
      : '本层通关条件暂无说明';
  }

  private _buildObjectiveLines(floor: number, hasKey: boolean): string[] {
    try {
      const def = floor <= 7 ? getChapter1Objective(floor) : getChapter2Objective(floor);
      const lines = [
        `目标：${def.title}`,
        `完成条件：${def.description}`,
        '失败条件：角色生命降为零或中途撤离。',
      ];
      if (def.kind === 'KEY_EXPLORE') {
        lines.push(hasKey ? '进度：已取得钥匙，传送门已出现。' : '进度：尚未取得钥匙。');
      }
      if (def.kind === 'TIMED_ESCAPE') {
        lines.push('说明：本层开局即有出口，需在时限内抵达并互动；勿与通关传送门混淆。');
      }
      return lines;
    } catch {
      return ['本层通关条件暂无说明'];
    }
  }

  private _buildControls(callbacks: PveHudCallbacks, screenW: number, screenH: number): void {
    const bottom = -screenH / 2;
    const controlY = bottom + 104;
    const leftX = -screenW / 2 + 72;
    // 统一与「玩家状态」卡同款半透明：填充 α≈170，配色保留色调以保持可辨识。
    if (callbacks.onEndTurn) {
      addButton(
        this._root,
        '结束回合',
        leftX,
        controlY + 35,
        104,
        54,
        new Color(52, 73, 95, 170),
        new Color(255, 214, 110, 240),
        callbacks.onEndTurn,
      );
    }
    if (callbacks.onShowCharacter) {
      addButton(
        this._root,
        '角色',
        leftX + 116,
        controlY - 35,
        104,
        54,
        new Color(29, 67, 102, 170),
        new Color(226, 197, 100, 240),
        () => callbacks.onShowCharacter?.(),
      );
    }
    if (callbacks.onProfessionMechanic || callbacks.onCharge) {
      this._chargeButton = addButton(
        this._root,
        '蓄力 0 AP',
        leftX + 116,
        controlY + 35,
        104,
        54,
        new Color(92, 62, 35, 170),
        new Color(255, 214, 110, 240),
        () => (callbacks.onProfessionMechanic ?? callbacks.onCharge)?.(),
      );
      this._chargeButtonLabel = this._chargeButton.getChildByName('Label')?.getComponent(Label) ?? null;
    }
    if (callbacks.onQuit) {
      addButton(
        this._root,
        '返回',
        leftX,
        controlY - 35,
        104,
        54,
        new Color(39, 61, 88, 170),
        new Color(126, 183, 218, 240),
        () => callbacks.onQuit?.(),
      );
    }

    const step = DPAD_SIZE + DPAD_GAP;
    // 方向键整体右移一格，避开左侧"返回/角色"按钮列。
    const dpadX = -56 + step;
    // 方向键统一改为程序绘制三角形，避免 iPhone 使用系统字体时渲染成 emoji 风格箭头。
    const DPAD_FILL = new Color(16, 57, 98, 170);
    const makeDirBtn = (dir: Direction, x: number, y: number, cb: () => void): void => {
      const btn = addButton(this._root, '', x, y, DPAD_SIZE, DPAD_SIZE, DPAD_FILL, CYAN, cb);
      const lbl = btn.getChildByName('Label')?.getComponent(Label);
      if (lbl) lbl.string = '';
      addTriangleIcon(btn, dir, DPAD_SIZE * 0.62, WHITE);
    };
    makeDirBtn('UP', dpadX, controlY + step / 2, () => callbacks.onMove('UP'));
    makeDirBtn('LEFT', dpadX - step, controlY - step / 2, () => callbacks.onMove('LEFT'));
    makeDirBtn('DOWN', dpadX, controlY - step / 2, () => callbacks.onMove('DOWN'));
    makeDirBtn('RIGHT', dpadX + step, controlY - step / 2, () => callbacks.onMove('RIGHT'));

    const actionX = screenW / 2 - ACTION_W / 2 - 20;
    const actionStep = ACTION_H + ACTION_GAP;
    addButton(
      this._root,
      '攻击',
      actionX,
      controlY + actionStep,
      ACTION_W,
      ACTION_H,
      new Color(121, 55, 69, 170),
      new Color(255, 214, 110, 240),
      callbacks.onAttack,
    );
    addButton(
      this._root,
      '互动',
      actionX,
      controlY,
      ACTION_W,
      ACTION_H,
      new Color(23, 77, 124, 170),
      new Color(255, 214, 110, 240),
      callbacks.onInteract,
    );
    // 逐层远征战斗 HUD 的右侧第三格优先给核心战斗按钮「灵气爆发」。
    // 背包仍可从「角色」面板进入；不要和灵气爆发同坐标叠在一起。
    if (callbacks.onOpenBag && !callbacks.onSpiritBurst) {
      addButton(
        this._root,
        '背包',
        actionX,
        controlY - actionStep,
        ACTION_W,
        ACTION_H,
        new Color(40, 70, 45, 170),
        new Color(120, 210, 130, 240),
        () => callbacks.onOpenBag?.(),
      );
    }
    if (callbacks.onSpiritBurst) {
      this._spiritBurstButton = addButton(
        this._root,
        '灵气爆发',
        actionX,
        controlY - actionStep,
        ACTION_W,
        ACTION_H,
        new Color(72, 43, 105, 170),
        new Color(202, 156, 255, 240),
        callbacks.onSpiritBurst,
      );
      this._spiritBurstButtonLabel = this._spiritBurstButton.getChildByName('Label')?.getComponent(Label) ?? null;
    }
  }

  /** 新逐层模式只补充控件状态，不改变原 HUD 的结构与美术。 */
  refreshPersistentControls(
    professionId: 'WARRIOR' | 'ARCHER' | 'RANGER',
    chargeAp: number,
    spirit: number,
    opts?: { aimLevel?: number; combo?: number; canFinisher?: boolean },
  ): void {
    if (this._chargeButton) this._chargeButton.active = true;
    if (this._chargeButtonLabel) {
      if (professionId === 'WARRIOR') {
        this._chargeButtonLabel.string = `蓄力 ${chargeAp} AP`;
      } else if (professionId === 'ARCHER') {
        this._chargeButtonLabel.string = `瞄准 ${opts?.aimLevel ?? 0}`;
      } else {
        this._chargeButtonLabel.string = opts?.canFinisher ? '收招' : `连击 ${opts?.combo ?? 0}`;
      }
    }
    const full = spirit >= 100;
    this._spiritFull = full;
    if (this._spiritBurstButtonLabel) this._spiritBurstButtonLabel.string = full ? '灵气爆发！' : '灵气爆发';
    if (this._spiritBurstButton) {
      this._spiritBurstButton.getComponent(Button)!.interactable = full;
      this._setSpiritBurstBlink(full || this._tutorialSpiritBurstHighlight);
    }
    this._animaLabel.string = `灵气 ${spirit}/100`;
    const width = this._animaG.node.getComponent(UITransform)?.width ?? 120;
    this._drawBar(this._animaG, width, 28, spirit / 100, new Color(170, 120, 255, 255));
  }

  /** 教学引导用的轻量按钮高亮；不改变按钮的正常可交互状态判断。 */
  setTutorialButtonHighlight(opts: { charge?: boolean; spiritBurst?: boolean }): void {
    if (opts.charge !== undefined && opts.charge !== this._tutorialChargeHighlight) {
      this._tutorialChargeHighlight = opts.charge;
      this._setChargeHighlight(this._tutorialChargeHighlight);
    }
    if (opts.spiritBurst !== undefined && opts.spiritBurst !== this._tutorialSpiritBurstHighlight) {
      this._tutorialSpiritBurstHighlight = opts.spiritBurst;
      this._setSpiritBurstBlink(this._spiritFull || this._tutorialSpiritBurstHighlight);
    }
  }

  private _setChargeHighlight(active: boolean): void {
    const button = this._chargeButton;
    if (!button) return;
    const opacity = button.getComponent(UIOpacity) || button.addComponent(UIOpacity);
    if (active) {
      if (this._chargeHighlighting) return;
      this._chargeHighlighting = true;
      Tween.stopAllByTarget(button);
      Tween.stopAllByTarget(opacity);
      button.setScale(1, 1, 1);
      opacity.opacity = 255;
      tween(button)
        .repeatForever(
          tween()
            .to(0.34, { scale: new Vec3(1.08, 1.08, 1) }, { easing: 'sineOut' })
            .to(0.34, { scale: new Vec3(1, 1, 1) }, { easing: 'sineIn' }),
        )
        .start();
      return;
    }
    if (!this._chargeHighlighting) {
      opacity.opacity = 255;
      button.setScale(1, 1, 1);
      return;
    }
    this._chargeHighlighting = false;
    Tween.stopAllByTarget(button);
    Tween.stopAllByTarget(opacity);
    button.setScale(1, 1, 1);
    opacity.opacity = 255;
  }

  private _setSpiritBurstBlink(active: boolean): void {
    const button = this._spiritBurstButton;
    if (!button) return;
    const opacity = button.getComponent(UIOpacity) || button.addComponent(UIOpacity);
    if (active) {
      if (this._spiritBurstBlinking) return;
      this._spiritBurstBlinking = true;
      Tween.stopAllByTarget(button);
      Tween.stopAllByTarget(opacity);
      button.setScale(1, 1, 1);
      opacity.opacity = 255;
      tween(button)
        .repeatForever(
          tween()
            .to(0.34, { scale: new Vec3(1.08, 1.08, 1) }, { easing: 'sineOut' })
            .to(0.34, { scale: new Vec3(1, 1, 1) }, { easing: 'sineIn' }),
        )
        .start();
      tween(opacity)
        .repeatForever(
          tween()
            .to(0.34, { opacity: 145 }, { easing: 'sineOut' })
            .to(0.34, { opacity: 255 }, { easing: 'sineIn' }),
        )
        .start();
      return;
    }
    if (!this._spiritBurstBlinking) {
      opacity.opacity = 255;
      button.setScale(1, 1, 1);
      return;
    }
    this._spiritBurstBlinking = false;
    Tween.stopAllByTarget(button);
    Tween.stopAllByTarget(opacity);
    button.setScale(1, 1, 1);
    opacity.opacity = 255;
  }

  private _drawBar(g: Graphics, width: number, height: number, pct: number, color: Color): void {
    g.clear();
    g.fillColor = new Color(8, 30, 61, 255);
    g.roundRect(-width / 2, -height / 2, width, height, 7);
    g.fill();
    g.strokeColor = new Color(105, 168, 201, 255);
    g.lineWidth = 1.5;
    g.roundRect(-width / 2 + 1, -height / 2 + 1, width - 2, height - 2, 6);
    g.stroke();
    const fillW = Math.max(0, (width - 4) * Math.max(0, Math.min(1, pct)));
    if (fillW > 0) {
      g.fillColor = color;
      g.roundRect(-width / 2 + 2, -height / 2 + 2, fillW, height - 4, 5);
      g.fill();
    }
  }

  private _pickVisibleTarget(state: ExpeditionState): Monster | undefined {
    const floor = state.floorState;
    const visible = floor.monsters
      .filter((monster) =>
        monster.aiState !== 'DEAD'
        && Boolean(floor.revealed[monster.pos.y]?.[monster.pos.x]),
      );
    const focused = this._focusedMonsterId
      ? visible.find((monster) => monster.id === this._focusedMonsterId)
      : undefined;
    if (focused) return focused;
    return visible.sort((a, b) => {
        const da = Math.abs(a.pos.x - floor.player.x) + Math.abs(a.pos.y - floor.player.y);
        const db = Math.abs(b.pos.x - floor.player.x) + Math.abs(b.pos.y - floor.player.y);
        return da - db;
      })[0];
  }

  private _pickVisibleEntity(state: ExpeditionState): FixedEntity | undefined {
    if (!this._focusedEntityId) return undefined;
    const floor = state.floorState;
    return floor.entities.find((entity) =>
      entity.id === this._focusedEntityId
      && !entity.consumed
      && Boolean(floor.revealed[entity.pos.y]?.[entity.pos.x]),
    );
  }

  private _refreshTarget(state: ExpeditionState): void {
    const entity = this._pickVisibleEntity(state);
    if (entity) {
      const info = entityInfo(entity);
      this._targetName.string = entityName(entity);
      this._targetTypeBadge.active = true;
      this._targetTypeBadgeLabel.string = info.type;
      this._drawTypeBadge('NORMAL');
      this._targetType.color = MUTED;
      this._targetType.string = '';
      this._targetAttack.string = info.action;
      const maxHp = entity.type === 'ICE_WALL'
        ? CHAPTER3_ICE_WALL_HP
        : entity.type === 'ROCK'
          ? ROCK_HP
          : 0;
      if (maxHp > 0) {
        const hp = Math.max(0, entity.hp ?? maxHp);
        this._targetHpLabel.string = `${hp} / ${maxHp}`;
        this._drawBar(this._targetHpG, this._targetBarW, 22, hp / maxHp, HP_COLOR);
      } else {
        this._targetHpLabel.string = '';
        this._drawBar(this._targetHpG, this._targetBarW, 22, 0, HP_COLOR);
      }
      this._targetPortrait.active = true;

      const key = entityArtKey(entity);
      if (!key) {
        this._targetArtKey = '';
        this._targetPortrait.active = false;
        return;
      }
      if (key === this._targetArtKey) return;
      this._targetArtKey = key;
      const frame = getCachedSprite(key);
      if (frame) {
        applySpriteInsideFixedBox(this._targetPortrait, frame, 82, 82);
        return;
      }
      void loadUiSprite(key).then((loaded) => {
        if (!loaded || !this._targetPortrait.isValid || this._targetArtKey !== key) return;
        applySpriteInsideFixedBox(this._targetPortrait, loaded, 82, 82);
      });
      return;
    }

    const target = this._pickVisibleTarget(state);
    if (!target) {
      this._targetTypeBadge.active = false;
      this._targetName.string = '附近暂无敌人';
      this._targetType.color = MUTED;
      this._targetType.string = '继续探索迷雾';
      this._targetAttack.string = '';
      this._targetHpLabel.string = '';
      this._targetPortrait.active = false;
      this._targetArtKey = '';
      this._drawBar(this._targetHpG, this._targetBarW, 22, 0, HP_COLOR);
      return;
    }

    this._targetName.string = monsterName(target);
    this._targetTypeBadge.active = true;
    this._targetTypeBadgeLabel.string = `${MONSTER_TYPE_NAMES[target.type] ?? target.type}`;
    this._drawTypeBadge(target.type);
    const statuses = formatMonsterStatuses(target);
    this._targetType.color = statuses ? GOLD : MUTED;
    this._targetType.string = statuses
      ? `攻击 ${target.attack} · 范围 ${target.range}\n${statuses}`
      : `攻击 ${target.attack} · 范围 ${target.range} · 当前目标`;
    this._targetAttack.string = '';
    this._targetHpLabel.string = `${target.hp} / ${target.maxHp}`;
    this._drawBar(
      this._targetHpG,
      this._targetBarW,
      22,
      target.hp / Math.max(1, target.maxHp),
      HP_COLOR,
    );
    this._targetPortrait.active = true;

    const key = monsterArtKey(target, state.chapter);
    if (key === this._targetArtKey) return;
    this._targetArtKey = key;
    const frame = getCachedSprite(key);
    if (frame) {
      applySpriteInsideFixedBox(this._targetPortrait, frame, 82, 82);
      return;
    }
    void loadUiSprite(key).then((loaded) => {
      if (!loaded || !this._targetPortrait.isValid || this._targetArtKey !== key) return;
      applySpriteInsideFixedBox(this._targetPortrait, loaded, 82, 82);
    });
  }

  private _drawTypeBadge(type: Monster['type']): void {
    const fill = type === 'BOSS' ? TYPE_BADGE_RED_FILL : TYPE_BADGE_BLUE_FILL;
    const border = type === 'BOSS' ? TYPE_BADGE_RED_BORDER : TYPE_BADGE_BLUE_BORDER;
    const text = type === 'BOSS' ? TYPE_BADGE_RED_TEXT : TYPE_BADGE_BLUE_TEXT;
    const width = Math.max(74, this._targetTypeBadgeLabel.string.length * 18 + 28);
    const height = 34;
    this._targetTypeBadge.getComponent(UITransform)?.setContentSize(width, height);
    this._targetTypeBadgeG.clear();
    this._targetTypeBadgeG.fillColor = fill;
    this._targetTypeBadgeG.roundRect(-width / 2, -height / 2, width, height, 12);
    this._targetTypeBadgeG.fill();
    this._targetTypeBadgeG.strokeColor = border;
    this._targetTypeBadgeG.lineWidth = 2;
    this._targetTypeBadgeG.roundRect(-width / 2 + 1, -height / 2 + 1, width - 2, height - 2, 11);
    this._targetTypeBadgeG.stroke();
    this._targetTypeBadgeLabel.color = text;
    this._targetTypeBadgeLabel.isBold = true;
  }

  refresh(state: ExpeditionState): void {
    const { player, floorState, chapter, floor } = state;
    const bossFloor = isBossFloor(floor);
    this._floorLabel.string = `第${chapter}章 · 第${floor}层 · 回合${floorState.turn}`;
    this._floorLabel.color = bossFloor ? GOLD : WHITE;
    this._bossBadge.active = bossFloor;
    this._bossBadgeLabel.string = bossFloor ? '首领回合' : '';
    this._goldLabel.string = `星尘 ${player.gold}`;
    this._animaLabel.string = `灵气 ${player.animaProgress}/${player.animaThreshold ?? 100}`;
    const animaBarW = this._animaG.node.getComponent(UITransform)?.width ?? 120;
    this._drawBar(
      this._animaG,
      animaBarW,
      28,
      player.animaProgress / Math.max(1, player.animaThreshold ?? 100),
      new Color(170, 120, 255, 255),
    );
    this._keyBadge.active = floorState.hasKey;
    this._classLabel.string = CLASS_LABEL[player.classId] ?? player.classId;
    this._objectiveLines = this._buildObjectiveLines(floor, floorState.hasKey);
    this._refreshObjectivePopup();

    const hpBarW = this._hpG.node.getComponent(UITransform)?.width ?? 160;
    const apBarW = this._apG.node.getComponent(UITransform)?.width ?? 160;
    this._drawBar(this._hpG, hpBarW, 26, player.hp / Math.max(1, player.maxHp), HP_COLOR);
    this._drawBar(this._apG, apBarW, 26, floorState.ap / Math.max(1, floorState.maxAp), AP_COLOR);
    this._hpLabel.string = `HP ${player.hp} / ${player.maxHp}`;
    this._apLabel.string = `AP ${floorState.ap} / ${floorState.maxAp}`;
    const atk = playerAttackPower(player, state.balanceSnapshot, state.chapter);
    const armor = playerArmorPower(player);
    this._attackLabel.string = `${atk.damage}`;
    this._attackRangeLabel.string = `${atk.range}`;
    this._armorLabel.string = `${armor.armor}`;

    const statuses: string[] = [];
    if ((floorState.playerFireBurnRounds ?? 0) > 0) statuses.push(`灼烧 ${floorState.playerFireBurnRounds}回`);
    if ((floorState.playerBurnRemaining ?? 0) > 0) statuses.push(`灼烧余焰 ${floorState.playerBurnRemaining}`);
    if ((floorState.playerMoveApPenaltyRounds ?? 0) > 0) statuses.push(`减速 ${floorState.playerMoveApPenaltyRounds}`);
    if ((floorState.playerPoisonRounds ?? 0) > 0) statuses.push(`中毒 ${floorState.playerPoisonRounds}`);
    if ((floorState.stationaryPressureStacks ?? 0) > 0) statuses.push(`被围攻 ×${floorState.stationaryPressureStacks}`);
    this._statusLabel.string = statuses.join('  ·  ');

    this._refreshTarget(state);
  }

  focusMonster(monsterId: string | null): void {
    this._focusedMonsterId = monsterId;
    if (monsterId) this._focusedEntityId = null;
  }

  focusEntity(entityId: string | null): void {
    this._focusedEntityId = entityId;
    if (entityId) this._focusedMonsterId = null;
  }

  getFocusedMonsterId(): string | null {
    return this._focusedMonsterId;
  }

  getFocusedEntityId(): string | null {
    return this._focusedEntityId;
  }

  setVisible(visible: boolean): void {
    this._root.active = visible;
  }

  destroy(): void {
    this._clearObjectiveAutoHide();
    this._root.destroy();
  }
}
