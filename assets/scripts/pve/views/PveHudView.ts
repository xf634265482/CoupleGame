import {
  Button,
  Color,
  Graphics,
  Label,
  Layers,
  Node,
  Sprite,
  UITransform,
} from 'cc';
import { topSafeBoundaryY } from '../../platform/wechat/ViewAdapt';
import { getCachedSprite, loadUiSprite } from '../../ui/UiAssets';
import { applySpriteInsideFixedBox } from '../../ui/UiSprite';
import { playerAttackPower } from '../core/CombatSystem';
import type { Direction } from '../core/MovementSystem';
import type { ExpeditionState, Monster } from '../core/PveTypes';
import { makeLabel } from './pveUiKit';

export type PveHudCallbacks = {
  onMove: (dir: Direction) => void;
  onAttack: () => void;
  onInteract: () => void;
  onEndTurn: () => void;
  onQuit?: () => void;
  onShowCharacter?: () => void;
  onUseScroll?: () => void;
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

const DPAD_SIZE = 84;
const DPAD_GAP = 6;
const ACTION_W = 126;
const ACTION_H = 52;
const ACTION_GAP = 8;
const INFO_H = 148;

/** 从胶囊安全线到地图顶部所需的 HUD 高度（含顶部资源/怪物卡）。 */
export const PVE_HUD_PANEL_H = 124;
/** 底部信息卡（最近战报/玩家状态）的几何信息，供 ExpeditionController 计算 mapBottom。 */
export const PVE_HUD_INFO_TOP_OFFSET = 274 + INFO_H / 2;
export { INFO_H as PVE_HUD_INFO_H };

const MONSTER_NAMES: Record<string, string> = {
  GOBLIN_WARRIOR: '哥布林战士',
  GOBLIN_ARCHER: '哥布林弓手',
  FROST_GOBLIN: '霜寒哥布林',
  FIRE_GOBLIN: '烈焰哥布林',
  SPIRIT_RAT: '灵气鼠',
  GOBLIN_CHIEF: '哥布林酋长',
  DESERT_RAIDER: '沙漠劫匪',
  SANDWORM_LARVA: '沙虫幼体',
  POISON_SCORPION: '毒蝎',
  SPIRIT_BEETLE: '灵甲虫',
  QUICKSAND_SCORPION: '流沙蝎王',
  SNOW_WOLF: '雪狼',
  ICE_SLIME: '冰晶史莱姆',
  FROST_SPRITE: '冰霜精灵',
  SPIRIT_ELF: '灵气妖精',
  FROST_GIANT: '冰霜巨人',
  LAVA_GRUNT: '熔岩士兵',
  LAVA_CRAB: '熔岩蟹',
  FIRE_ELEMENTAL: '火元素',
  SPIRIT_EMBER: '灵火',
  LAVA_LORD: '熔岩领主',
  SHADOW_ASSASSIN: '暗影刺客',
  FATE_WATCHER: '命运守望者',
  VOID_WORM: '虚空虫',
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

const VARIANT_FALLBACK_ART: Record<string, string> = {
  DESERT_RAIDER: 'pve/map/icon_monster_ch2_normal',
  SANDWORM_LARVA: 'pve/map/icon_monster_ch2_normal',
  POISON_SCORPION: 'pve/map/icon_monster_ch2_elite',
  SPIRIT_BEETLE: 'pve/map/icon_monster_ch2_anima',
  QUICKSAND_SCORPION: 'pve/map/icon_monster_ch2_boss',
  SNOW_WOLF: 'pve/map/icon_monster_ch3_normal',
  ICE_SLIME: 'pve/map/icon_monster_ch3_normal',
  FROST_SPRITE: 'pve/map/icon_monster_ch3_elite',
  SPIRIT_ELF: 'pve/map/icon_monster_ch3_anima',
  FROST_GIANT: 'pve/map/icon_monster_ch3_boss',
  LAVA_GRUNT: 'pve/map/icon_monster_ch4_normal',
  LAVA_CRAB: 'pve/map/icon_monster_ch4_normal',
  FIRE_ELEMENTAL: 'pve/map/icon_monster_ch4_elite',
  SPIRIT_EMBER: 'pve/map/icon_monster_ch4_anima',
  LAVA_LORD: 'pve/map/icon_monster_ch4_boss',
  SHADOW_ASSASSIN: 'pve/map/icon_monster_ch5_normal',
  FATE_WATCHER: 'pve/map/icon_monster_ch5_elite',
  VOID_WORM: 'pve/map/icon_monster_ch5_normal',
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
  node.on(Button.EventType.CLICK, onClick, node);
  return node;
}

export class PveHudView {
  private _root: Node;
  private _floorLabel: Label;
  private _shardsLabel: Label;
  private _goldLabel: Label;
  private _animaLabel: Label;
  private _keyBadge: Node;
  private _keyLabel: Label;

  private _targetPortrait: Node;
  private _targetName: Label;
  private _targetType: Label;
  private _targetHpG: Graphics;
  private _targetHpLabel: Label;
  private _targetBarW = 190;
  private _targetArtKey = '';
  private _focusedMonsterId: string | null = null;

  private _hpG: Graphics;
  private _hpLabel: Label;
  private _apG: Graphics;
  private _apLabel: Label;
  private _attackLabel: Label;
  private _attackRangeLabel!: Label;
  private _statusLabel: Label;

  private _scrollButton: Node | null = null;
  private _scrollButtonLabel: Label | null = null;
  private _destinyShards = 0;

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

    const runW = 408;
    const chapterW = 278;
    const shardW = runW - chapterW - 10;
    const runLeft = left;
    const chapterPanel = addPanel(this._root, 'RunInfo', runLeft + chapterW / 2, runY, chapterW, 48);
    const shardPanel = addPanel(
      this._root,
      'ShardInfo',
      runLeft + chapterW + 10 + shardW / 2,
      runY,
      shardW,
      48,
    );
    this._floorLabel = addText(chapterPanel, '加载中…', 0, 0, chapterW - 18, 44, 22, WHITE);
    this._shardsLabel = addText(shardPanel, '碎片 0', 0, 0, shardW - 12, 44, 21, CYAN);

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
      40,
      28,
      targetW - 130,
      30,
      24,
      GOLD,
      Label.HorizontalAlign.LEFT,
    );
    this._targetType = addText(
      targetPanel,
      '继续探索迷雾',
      40,
      1,
      targetW - 130,
      24,
      19,
      MUTED,
      Label.HorizontalAlign.LEFT,
      false,
    );
    const targetBar = new Node('MonsterHpBar');
    targetBar.setParent(targetPanel);
    targetBar.layer = Layers.Enum.UI_2D;
    targetBar.setPosition(40, -31, 0);
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
    // 右侧预留 keyBadge 区，灵气/金币挤到左侧，避免徽章压住 "灵气 xx/100"。
    const keyBadgeW = 64;
    const keyBadgeH = 30;
    const keyReserve = keyBadgeW + 16;
    const labelW = resourceW - keyReserve - 16;
    const labelX = -(keyReserve) / 2;
    this._animaLabel = addText(resourcePanel, '灵气 0 / 100', labelX, 25, labelW, 38, 21, new Color(215, 190, 255, 255));
    this._goldLabel = addText(resourcePanel, '金币 0', labelX, -25, labelW, 38, 22, GOLD);
    this._keyBadge = addPanel(resourcePanel, 'KeyBadge', resourceW / 2 - keyBadgeW / 2 - 10, 0, keyBadgeW, keyBadgeH);
    this._keyLabel = addText(this._keyBadge, '钥匙', 0, 0, keyBadgeW - 8, keyBadgeH - 4, 17, GOLD);
    this._keyBadge.active = false;

    const infoW = screenW - 40;
    const infoGap = 12;
    const logW = Math.round((infoW - infoGap) * 0.6);
    const playerW = infoW - infoGap - logW;
    // 信息卡向下移到紧贴底部按钮顶（按钮顶约 -screenH/2 + 190；留 16px 余量）。
    // 与 PVE_HUD_INFO_TOP_OFFSET 保持联动：infoY 中心 = 274，panel top = 274 + INFO_H/2。
    const infoY = -screenH / 2 + 274;
    const playerX = -screenW / 2 + 20 + logW + infoGap + playerW / 2;
    const playerPanel = addPanel(this._root, 'PlayerStatusCard', playerX, infoY, playerW, INFO_H);
    addText(playerPanel, '玩家状态', 0, 43, playerW - 18, 28, 22, GOLD);

    const barW = playerW - 90;
    const hpBar = new Node('PlayerHpBar');
    hpBar.setParent(playerPanel);
    hpBar.setPosition(-20, 12, 0);
    hpBar.addComponent(UITransform).setContentSize(barW, 26);
    this._hpG = hpBar.addComponent(Graphics);
    this._hpLabel = addText(hpBar, 'HP', 0, 0, barW - 4, 26, 19, WHITE);

    const apBar = new Node('PlayerApBar');
    apBar.setParent(playerPanel);
    apBar.setPosition(-20, -22, 0);
    apBar.addComponent(UITransform).setContentSize(barW, 26);
    this._apG = apBar.addComponent(Graphics);
    this._apLabel = addText(apBar, 'AP', 0, 0, barW - 4, 26, 19, WHITE);

    // 攻击框：显示伤害值 + 射程（远程职业辨识，省得每次开角色面板看）
    const attackBox = addPanel(playerPanel, 'AttackBox', playerW / 2 - 35, -5, 58, 92);
    addText(attackBox, '攻击', 0, 28, 52, 22, 17, MUTED);
    this._attackLabel = addText(attackBox, '0', 0, 0, 52, 30, 24, GOLD);
    this._attackRangeLabel = addText(attackBox, '射程 1', 0, -28, 54, 22, 15, MUTED);
    this._statusLabel = addText(playerPanel, '', -12, -47, playerW - 74, 20, 17, GOLD);

    this._buildControls(callbacks, screenW, screenH);
  }

  private _buildControls(callbacks: PveHudCallbacks, screenW: number, screenH: number): void {
    const bottom = -screenH / 2;
    const controlY = bottom + 104;
    const leftX = -screenW / 2 + 72;
    // 统一与「玩家状态」卡同款半透明：填充 α≈170，配色保留色调以保持可辨识。
    if (callbacks.onQuit) {
      addButton(
        this._root,
        '返回',
        leftX,
        controlY + 35,
        104,
        54,
        new Color(39, 61, 88, 170),
        new Color(126, 183, 218, 240),
        () => callbacks.onQuit?.(),
      );
    }
    if (callbacks.onShowCharacter) {
      addButton(
        this._root,
        '角色',
        leftX,
        controlY - 35,
        104,
        54,
        new Color(29, 67, 102, 170),
        new Color(226, 197, 100, 240),
        () => callbacks.onShowCharacter?.(),
      );
    }

    const step = DPAD_SIZE + DPAD_GAP;
    // 方向键整体右移一格，避开左侧"返回/角色"按钮列。
    const dpadX = -56 + step;
    // 方向键放大约 27%（84px → A V4 底部三列，中间方向键区域内放大，不挤压左右列）。
    // 箭头改用实心三角 ▲▼◀▶ + 字号 44 + bold，明显比线条箭头粗壮醒目。
    const DPAD_FILL = new Color(16, 57, 98, 170);
    const makeDirBtn = (arrow: string, x: number, y: number, cb: () => void): void => {
      const btn = addButton(this._root, arrow, x, y, DPAD_SIZE, DPAD_SIZE, DPAD_FILL, CYAN, cb);
      const lbl = btn.getChildByName('Label')?.getComponent(Label);
      if (lbl) { lbl.fontSize = 44; lbl.isBold = true; lbl.lineHeight = 46; lbl.color = WHITE; }
    };
    makeDirBtn('▲', dpadX, controlY + step / 2, () => callbacks.onMove('UP'));
    makeDirBtn('◀', dpadX - step, controlY - step / 2, () => callbacks.onMove('LEFT'));
    makeDirBtn('▼', dpadX, controlY - step / 2, () => callbacks.onMove('DOWN'));
    makeDirBtn('▶', dpadX + step, controlY - step / 2, () => callbacks.onMove('RIGHT'));

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
    addButton(
      this._root,
      '结束回合',
      actionX,
      controlY - actionStep,
      ACTION_W,
      ACTION_H,
      new Color(52, 73, 95, 170),
      new Color(255, 214, 110, 240),
      callbacks.onEndTurn,
    );

    if (callbacks.onUseScroll) {
      // 放在「攻击」按钮的左侧（同一水平线），与 ACTION 列保留 10px 间距，避免压方向键。
      const scrollW = 110;
      const scrollH = 44;
      const scrollX = actionX - ACTION_W / 2 - 10 - scrollW / 2;
      const scrollY = controlY + actionStep;
      this._scrollButton = addButton(
        this._root,
        '卷轴 x0',
        scrollX,
        scrollY,
        scrollW,
        scrollH,
        new Color(64, 57, 111, 170),
        new Color(155, 132, 225, 240),
        () => callbacks.onUseScroll?.(),
      );
      this._scrollButtonLabel = this._scrollButton.getChildByName('Label')?.getComponent(Label) ?? null;
      this._scrollButton.active = false;
    }
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

  private _refreshTarget(state: ExpeditionState): void {
    const target = this._pickVisibleTarget(state);
    if (!target) {
      this._targetName.string = '附近暂无敌人';
      this._targetType.string = '继续探索迷雾';
      this._targetHpLabel.string = '';
      this._targetPortrait.active = false;
      this._drawBar(this._targetHpG, this._targetBarW, 22, 0, HP_COLOR);
      return;
    }

    this._targetName.string = monsterName(target);
    this._targetType.string = `${MONSTER_TYPE_NAMES[target.type] ?? target.type} · 当前目标`;
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

  refresh(state: ExpeditionState): void {
    const { player, floorState, chapter, floor } = state;
    this._floorLabel.string = `第${chapter}章 · 第${floor}层 · 回合${floorState.turn}`;
    this._shardsLabel.string = `碎片 ${this._destinyShards}`;
    this._goldLabel.string = `金币 ${player.gold}`;
    this._animaLabel.string = `灵气 ${player.animaProgress}/${player.animaThreshold ?? 100}`;
    this._keyBadge.active = floorState.hasKey;
    this._keyLabel.string = '钥匙';

    const hpBarW = this._hpG.node.getComponent(UITransform)?.width ?? 160;
    const apBarW = this._apG.node.getComponent(UITransform)?.width ?? 160;
    this._drawBar(this._hpG, hpBarW, 26, player.hp / Math.max(1, player.maxHp), HP_COLOR);
    this._drawBar(this._apG, apBarW, 26, floorState.ap / Math.max(1, floorState.maxAp), AP_COLOR);
    this._hpLabel.string = `HP ${player.hp} / ${player.maxHp}`;
    this._apLabel.string = `AP ${floorState.ap} / ${floorState.maxAp}`;
    const atk = playerAttackPower(player);
    this._attackLabel.string = `${atk.damage}`;
    this._attackRangeLabel.string = `射程 ${atk.range}`;

    const statuses: string[] = [];
    if ((floorState.playerBurnRemaining ?? 0) > 0) statuses.push(`燃烧 ${floorState.playerBurnRemaining}`);
    if ((floorState.playerMoveApPenaltyRounds ?? 0) > 0) statuses.push(`减速 ${floorState.playerMoveApPenaltyRounds}`);
    this._statusLabel.string = statuses.join(' · ');

    const scrolls = player.scrolls ?? 0;
    if (this._scrollButton) {
      this._scrollButton.active = scrolls > 0;
      if (this._scrollButtonLabel) this._scrollButtonLabel.string = `卷轴 x${scrolls}`;
    }
    this._refreshTarget(state);
  }

  refreshMeta(destinyShards: number): void {
    this._destinyShards = destinyShards;
    this._shardsLabel.string = `碎片 ${destinyShards}`;
  }

  focusMonster(monsterId: string | null): void {
    this._focusedMonsterId = monsterId;
  }

  setVisible(visible: boolean): void {
    this._root.active = visible;
  }

  destroy(): void {
    this._root.destroy();
  }
}
