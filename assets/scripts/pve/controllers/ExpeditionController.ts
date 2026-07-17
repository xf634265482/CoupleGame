// 命运远征场景主控（design §2）：输入 → core 纯函数 → 事件回放（toast/弹窗）→ 刷新 View。
// 三层结构落地：Controller 仅做编排与输入处理，规则全部委托 pve/core 纯函数，渲染委托 views/*。
// M1 垂直切片：第一章 1~5 层端到端打通；存档/云端校验留待 P3（见 specs/260608-pve-destiny-expedition）。

import { _decorator, Color, Component, EventKeyboard, Graphics, Input, input, KeyCode, Node, Sprite, sys, tween, UIOpacity, UITransform, Vec3 } from 'cc';
import { SceneLoader } from '../../core/SceneLoader';
import { lockPortrait } from '../../platform/wechat/WxLandscape';
import {
  applyUiLayerTree,
  refreshScreenAdapt,
  visibleDesignSize,
} from '../../platform/wechat/ViewAdapt';
import { resolveAttackHitPos } from '../core/AttackPresentation';
import {
  isCellRevealed,
  moveGhostRestoreMode,
  shouldHideOccupantForMoveGhost,
} from '../core/MoveGhostVisibility';
import {
  aimNodeToward,
  createArrowFxNode,
  createArrowTrailFxNode,
  createLightSaberFxNode,
  createRangedImpactFxNode,
  createSaberSwingGlowNode,
  createSwordArcFxNode,
  midPoint,
} from '../views/AttackFxNodes';
import { HEAVY_STRIKE_RANGE, isCellShadowedByRock } from '../core/bosses/GoblinChief';
import { chooseDestinyRewrite } from '../core/bosses/FateGuardian';
import { applySellBagEquip, applySellEquip, applyShopBuy, getCampShopItems } from '../core/CampSystem';
import type { CampItemId } from '../core/CampSystem';
import { GameSession } from '../../core/GameSession';
import { attackIceWall, playerAttack, playerAttackPower } from '../core/CombatSystem';
import { endTurn } from '../core/ExpeditionState';
import { activateGunpowderBarrel, detonateBlastTarget, interactPortal, openExit, pickKey, spawnPortal } from '../core/FloorRules';
import { isRevealed } from '../core/FogSystem';
import { checkLos } from '../core/LosSystem';
import { openChest } from '../core/LootSystem';
import { applyMove } from '../core/MovementSystem';
import { CAMP_BLACKSMITH_ID, upgradeEquip, useAltar, useHotSpring, useIdol } from '../core/NeutralEntities';
import { equipFromBag } from '../core/EquipHelper';
import { getBalancedActionCost } from '../core/PveBalance';
import { applyPersistentAttack } from '../core/PersistentCombatRules';
import {
  applyPersistentBattleResult,
  initialPersistentPresentationEvents,
  syncRuntimeFromExpedition,
  type PersistentExpeditionRuntime,
} from '../core/PersistentExpeditionRuntime';
import { PersistentFloorFlow } from '../core/PersistentFloorFlow';
import { activateSpiritBurst } from '../core/SpiritBurstSystem';
import { commitRangerFinisher } from '../core/professions/ProfessionActionSystem';
import { CLASS_DISPLAY_NAMES } from '../core/professions/ProfessionDisplayNames';
import { WARRIOR_MAX_CHARGE_AP } from '../core/professions/WarriorSystem';
import type { Direction } from '../core/MovementSystem';
import { AP_COST, FLOORS_PER_CHAPTER, isBossFloor, LAVA_LORD_BURN_BURST_THRESHOLD, LAVA_LORD_BURN_TICKS } from '../core/PveConstants';
import { MAX_READY_FLOOR } from '../core/chapterRouting';
import type { ClassId } from '../core/PveConstants';
import type { ApplyResult, Coord, ExpeditionState, FixedEntity, Monster, MonsterType, PveEvent, PveMeta } from '../core/PveTypes';
import { loadPveMeta, updatePveMeta } from '../../network/PveService';
import {
  loadActiveFloorChallenge,
  loadPveProfile,
  saveFloorChallengeRuntime,
  settleFloorChallenge,
  startFloorChallenge,
} from '../../network/PveProgressionService';
import { FogMapView } from '../views/FogMapView';
import { PveCharacterPanel } from '../views/PveCharacterPanel';
import { PVE_HUD_INFO_H, PveHudView } from '../views/PveHudView';
import type { LogKind } from '../views/PveMessageLog';
import { PveMessageLog } from '../views/PveMessageLog';
import { PveToastView } from '../views/PveToastView';
import { getCachedSprite, loadUiSprite, preloadPveUi } from '../../ui/UiAssets';
import { ensureChapterAssets, isChapterReady, preloadChapter } from '../ChapterResourceLoader';
import { LoadingOverlay } from '../../ui/LoadingOverlay';
import { Effects } from '../../fx/Effects';
import { playSfx, SFX_IDS } from '../../audio/AudioManager';
import { formatMinghenChoice } from '../core/minghen/MinghenDisplay';
import { getMinghenDefinition } from '../core/minghen/MinghenCatalog';
import { getFixedEquipmentDefinition } from '../core/equipment/EquipmentDefinition';
import type { SettleFloorChallengeRequest } from '../core/PveProgressionTypes';
import { TutorialGuideManager } from '../tutorial/TutorialGuideManager';
import type { TutorialAdvanceContext } from '../tutorial/TutorialTypes';

const { ccclass } = _decorator;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * 性能埋点（2026-06-11 加）：定位"游戏 5 分钟后按钮卡顿"。
 * 默认关闭：真机 console.log 本身会加重走路卡顿；需要取证时再改为 true。
 * 输出格式：[PVE perf] <label> <dtMs>ms [extra]
 *   apply.total      —— 按钮点击 → _busy 解除全过程
 *   apply.events     —— _playEvents 串行回放耗时（含 await delay）
 *   apply.afterApply —— _afterApply（自动拾取/传送门/死亡判定）耗时
 *   apply.refreshAll —— map+hud diff 刷新耗时
 *   tap.endTurn / tap.move / tap.attack / tap.interact —— 按钮回调入口
 */
const PERF_LOG = false;
function perfNow(): number {
  return performance.now?.() ?? Date.now();
}
function perfMark(label: string, startMs: number, extra?: string): void {
  if (!PERF_LOG) return;
  const dt = Math.round(perfNow() - startMs);
  console.log(`[PVE perf] ${label} ${dt}ms${extra ? ' ' + extra : ''}`);
}

/** 装备槽位中文名（用于事件描述，避免显示英文枚举值）。 */
const SLOT_CN: Record<string, string> = {
  WEAPON: '武器',
  HELMET: '头盔',
  ARMOR:  '护甲',
  SHOES:  '靴子',
  TRINKET:'饰品',
};

/** 铁匠强化对应提升的具体属性名（用于事件描述，让玩家清楚"+1"加在了哪里）。 */
const SLOT_ATTR_CN: Record<string, string> = {
  WEAPON: '攻击力',
  HELMET: '最大HP',
  ARMOR:  '减伤',
  SHOES:  '靴子等级',
  TRINKET:'灵气加成',
};

/** 职业中文名（用于事件描述，避免显示英文枚举值）。 */
const CLASS_CN: Record<string, string> = CLASS_DISPLAY_NAMES;

/** 怪物变体/Boss 中文名（用于战报「发现/击杀」描述，避免显示英文枚举值）。 */
const MONSTER_VARIANT_CN: Record<string, string> = {
  // 第 1 章
  GOBLIN_WARRIOR: '哥布林战士',
  GOBLIN_ARCHER: '哥布林弓箭手',
  FROST_GOBLIN: '冰霜哥布林',
  FIRE_GOBLIN: '赤炎哥布林',
  SPIRIT_RAT: '灵鼠',
  // 第 2 章
  DESERT_RAIDER: '沙漠劫匪',
  SANDWORM_LARVA: '沙虫幼体',
  POISON_SCORPION: '毒蝎',
  SPIRIT_BEETLE: '灵气甲虫',
  // 第 3 章
  SNOW_WOLF: '雪狼',
  ICE_SLIME: '冰史莱姆',
  FROST_SPRITE: '冰霜精灵',
  SPIRIT_ELF: '灵气精灵',
  // 第 4 章
  LAVA_GRUNT: '熔岩暴徒',
  LAVA_CRAB: '岩浆蟹',
  FIRE_ELEMENTAL: '火焰元素',
  SPIRIT_EMBER: '灵气炎魂',
  // 第 5 章
  SHADOW_ASSASSIN: '影子刺客',
  FATE_WATCHER: '命运守望者',
  VOID_WORM: '虚空虫',
  SPIRIT_MIRAGE: '灵气幻象',
  // Boss
  GOBLIN_CHIEF: '哥布林酋长',
  QUICKSAND_SCORPION: '流沙巨蝎',
  FROST_GIANT: '冰霜巨人',
  LAVA_LORD: '熔岩领主',
  FATE_GUARDIAN: '命运守卫',
  FATE_MIRROR: '命运镜像',
};

/** 按 MonsterType 兜底的中文名（变体/Boss id 未命中映射表时使用）。 */
const MONSTER_TYPE_CN: Record<string, string> = {
  NORMAL: '普通怪',
  ANIMA: '灵气怪',
  ELITE: '精英怪',
  BOSS: 'Boss',
};

/** 怪物显示名：优先用 bossId/variantId 的专属中文名，否则按 MonsterType 兜底。 */
function monsterName(m: { type: MonsterType; bossId?: string; variantId?: string }): string {
  const key = m.bossId ?? m.variantId;
  if (key && MONSTER_VARIANT_CN[key]) return MONSTER_VARIANT_CN[key];
  return MONSTER_TYPE_CN[m.type] ?? '敌人';
}

function manhattan(a: Coord, b: Coord): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** 熔岩潮汐推进方向 → 中文（FogMapView 坐标系：x 向右，y 向下；UP=从上边向下推）。 */
const TIDE_DIRECTION_CN: Record<'UP' | 'DOWN' | 'LEFT' | 'RIGHT', string> = {
  UP: '从上方',
  DOWN: '从下方',
  LEFT: '从左侧',
  RIGHT: '从右侧',
};

/**
 * 计算以 center 为中心、曼哈顿距离 ≤ radius 的所有格子（用于 AOE 范围预警/命中标识），
 * 并按「是否被石块遮挡」拆分为 danger（仍会受伤害）/ safe（石块挡住，不受伤害）两组。
 */
function splitAoeCells(
  center: Coord,
  size: number,
  radius: number,
  entities: FixedEntity[],
): { danger: Coord[]; safe: Coord[] } {
  const danger: Coord[] = [];
  const safe: Coord[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = { x, y };
      if (manhattan(center, cell) > radius) continue;
      if (isCellShadowedByRock(entities, center, cell, radius)) safe.push(cell);
      else danger.push(cell);
    }
  }
  return { danger, safe };
}

/** 命运守卫「改写命运」5 个事件的中文名（用于战报）。 */
function destinyEventName(id: number): string {
  switch (id) {
    case 1: return 'Boss 回血';
    case 2: return 'Boss 加伤害';
    case 3: return '玩家扣血';
    case 4: return '5×5 爆炸';
    case 5: return '命运封锁';
    default: return `事件${id}`;
  }
}

/** 改写命运事件效果描述（用于阻塞模态卡片：事件名 + 效果说明）。 */
function destinyEventCard(id: number): string {
  switch (id) {
    case 1: return 'Boss 回血：恢复最大生命 10%';
    case 2: return 'Boss 加伤害：攻击 +30%（持续 3 回合）';
    case 3: return '玩家扣血：真实伤害（无视防御）';
    case 4: return '5×5 爆炸：以 Boss 当前格为中心爆炸（伤害 ×1.2）';
    case 5: return '命运封锁：你下回合 AP 减半（最少 1）';
    default: return `事件${id}`;
  }
}

/** 事件 → 战报栏条目（覆盖更广：MOVE/TURN_END 也产生条目，让玩家看到怪物在动）。
 *  state 用于把"怪 (5,5)→(5,4)" 这类坐标改写成"怪 靠近你/远离你"等相对描述，
 *  普通玩家更易读。
 */
function describeForLog(
  ev: PveEvent,
  state: ExpeditionState | null,
): { kind: LogKind; text: string } | null {
  switch (ev.type) {
    case 'MOVE': {
      // 玩家移动方向信息冗余（地图已直观显示位置变化），不进战报，避免刷屏
      if (ev.entityId === 'PLAYER') return null;
      // 怪物：按曼哈顿距离变化告诉玩家这只怪是靠近/远离/横向游走
      const player = state?.floorState.player;
      if (!player) return { kind: 'ENEMY_ACT', text: '怪 移动' };
      const distBefore = Math.abs(player.x - ev.from.x) + Math.abs(player.y - ev.from.y);
      const distAfter = Math.abs(player.x - ev.to.x) + Math.abs(player.y - ev.to.y);
      let phrase: string;
      if (distAfter < distBefore) phrase = '靠近你';
      else if (distAfter > distBefore) phrase = '远离你';
      else phrase = '游走';
      return { kind: 'ENEMY_ACT', text: `怪 ${phrase}` };
    }
    case 'REVEAL': {
      // 揭示格中若含存活怪物，提示「发现 XXX！」，让玩家知道视野内出现了什么敌人。
      const monsters = state?.floorState.monsters;
      if (!monsters) return null;
      const revealedSet = new Set(ev.cells.map((c) => `${c.x},${c.y}`));
      const found = monsters.filter(
        (m) => m.aiState !== 'DEAD' && revealedSet.has(`${m.pos.x},${m.pos.y}`),
      );
      if (found.length === 0) return null;
      const names = found.map((m) => monsterName(m)).join('、');
      return { kind: 'ENEMY_ACT', text: `👀 发现 ${names}！` };
    }
    case 'ATTACK':
      // 玩家攻击 → 显示伤害与怪物剩余血量（让玩家知道还差多少能击杀）
      // 怪物攻击由 PLAYER_DAMAGED 表达（避免重复）
      if (ev.attackerId !== 'PLAYER') return null;
      return {
        kind: 'PLAYER_ACT',
        text: ev.cause === 'COLLISION'
          ? `撞碎 -${ev.damage}（敌剩 ${ev.targetHp} 血）`
          : `攻击 -${ev.damage}（敌剩 ${ev.targetHp} 血）`,
      };
    case 'PLAYER_DAMAGED': {
      const attacker = state?.floorState.monsters.find((m) => m.id === ev.sourceId);
      const name = attacker ? monsterName(attacker) : '敌人';
      const absorbed = (ev.rawDamage != null && ev.rawDamage > ev.damage) ? ev.rawDamage - ev.damage : 0;
      const absorbedText = absorbed > 0 ? `，护甲格挡 ${absorbed}` : '';
      return { kind: 'PLAYER_HURT', text: `${name} 发起攻击，受击 -${ev.damage}${absorbedText}（自己剩 ${ev.hp} 血）` };
    }
    case 'KILL': {
      const monster = state?.floorState.monsters.find((m) => m.id === ev.monsterId);
      const name = monster ? monsterName(monster) : (MONSTER_TYPE_CN[ev.monsterType] ?? '敌人');
      return { kind: 'PLAYER_ACT', text: `💀 击杀了 ${name}` };
    }
    case 'LOOT': {
      const parts: string[] = [];
      if (ev.gold) parts.push(`星尘+${ev.gold}`);
      if (ev.anima) parts.push(`灵气+${ev.anima}`);
      if (ev.equip) parts.push(ev.bagged ? `入包:${ev.equip.name}` : `装备:${ev.equip.name}`);
      return parts.length > 0 ? { kind: 'LOOT', text: parts.join(' ') } : null;
    }
    case 'SELL_EQUIP':
      return { kind: 'LOOT', text: `⚒️ 变卖 ${ev.itemName}（+${ev.gold} 星尘）` };
    case 'PICK_KEY':
      return { kind: 'LOOT', text: '🔑 拾取钥匙' };
    case 'OPEN_CHEST':
      return { kind: 'LOOT', text: '📦 打开宝箱' };
    case 'PORTAL_SPAWNED':
      return { kind: 'SYSTEM', text: '🌀 目标完成，传送门已出现（可继续探索，或点「互动」通关）' };
    case 'WAVE_INCOMING':
      return { kind: 'SYSTEM', text: `⚠ 第 ${ev.wave} 波夜袭来袭！` };
    case 'IDOL_BLESSING': {
      const idolDesc = ev.effect === 'MAX_HP' ? `HP 上限 +${ev.maxHpBonus}`
        : ev.effect === 'ATTACK' ? `攻击 +${ev.attackBonus}`
        : `护甲 +${ev.armorBonus}`;
      return { kind: 'LOOT', text: `🛐 神像祝福（${idolDesc}）` };
    }
    case 'HOT_SPRING_HEAL':
      return { kind: 'LOOT', text: `♨️ 温泉治疗（恢复 ${ev.healed} 血）` };
    case 'TURN_END':
      return { kind: 'SYSTEM', text: '─── 本回合结束 ───' };
    case 'AP_ROLLED':
      return {
        kind: 'AP',
        text: `开始新回合 · 掷骰 ${ev.dice} 点 → 本回合行动力 ${ev.ap}`,
      };
    case 'AP_CARRIED':
      return { kind: 'AP', text: `🔋 结转上回合剩余行动力 +${ev.amount}` };
    case 'SHOP_BUY':
      return { kind: 'LOOT', text: `🏕️ 营地购买：${ev.effect}（-${ev.cost} 金）` };
    case 'FLOOR_CLEARED':
      return { kind: 'SYSTEM', text: '✓ 楼层通关，准备进入下一层' };
    case 'PLAYER_DEAD':
      return { kind: 'SYSTEM', text: '💀 你倒下了，本次远征失败' };
    case 'BOSS_BURROWED':
      return { kind: 'ENEMY_ACT', text: '🕳️ 流沙巨蝎潜入地下！本回合免疫攻击' };
    case 'BOSS_EMERGED':
      return { kind: 'ENEMY_ACT', text: '🦂 流沙巨蝎破土而出！双倍攻击！' };
    case 'ICE_TIDE_SPAWNED':
      return { kind: 'ENEMY_ACT', text: `❄️ 冰霜巨人冻结地面！${ev.tiles.length} 格结冰，踩上去会打滑` };
    case 'CHILL_STACK_APPLIED':
      // stacks 归零代表本次叠加直接触发了冻结，由 PLAYER_FROZEN 展示，避免重复
      return ev.stacks > 0 ? { kind: 'PLAYER_HURT', text: `🥶 寒气叠加至 ${ev.stacks} 层` } : null;
    case 'PLAYER_FROZEN':
      return { kind: 'PLAYER_HURT', text: '🧊 寒气叠满！你被冻结了，周围生成冰墙，攻击可解除' };
    case 'PLAYER_UNFROZEN':
      return { kind: 'PLAYER_ACT', text: '🔥 冻结已解除！' };
    case 'FROST_HEAVY_STRIKE_RESOLVED':
      return { kind: 'ENEMY_ACT', text: '💥 冰霜巨人发动冰霜重击！周围范围被冰锤波及' };
    case 'ICE_WALL_SHATTERED':
      return { kind: 'ENEMY_ACT', text: `❄️ 冰墙被击碎！碎裂出 ${ev.shatteredCells.length} 格碎冰` };
    case 'KNOCKBACK':
      return ev.slid
        ? { kind: 'PLAYER_HURT', text: '💨 被冰霜重击击退，并沿冰面滑出！' }
        : { kind: 'PLAYER_HURT', text: '💨 被冰霜重击击退了一步！' };
    case 'CHARGE_TELEGRAPHED':
      return { kind: 'ENEMY_ACT', text: '⚠️ 冰霜巨人开始蓄力，下回合将沿直线狂暴冲锋！' };
    case 'CHARGE_EXECUTED':
      switch (ev.result) {
        case 'WALL_SHATTERED':
          return { kind: 'ENEMY_ACT', text: '💥 狂暴冲锋撞碎了冰墙！' };
        case 'PLAYER_HIT':
          return { kind: 'ENEMY_ACT', text: '💥 狂暴冲锋正面命中了你！' };
        case 'ICE_WALL_SPAWNED':
          return { kind: 'ENEMY_ACT', text: '💥 狂暴冲锋未命中，撞出一道新的冰墙！' };
        default:
          return { kind: 'ENEMY_ACT', text: '💨 狂暴冲锋落空' };
      }
    case 'ICE_WALL_SPAWNED':
      // 已通过 CHARGE_EXECUTED{result:'ICE_WALL_SPAWNED'} 展示，避免重复战报
      return null;
    case 'BURN_APPLIED': {
      const t = ev.totalRemaining;
      const T = LAVA_LORD_BURN_BURST_THRESHOLD;
      if (t >= T)
        return { kind: 'PLAYER_HURT', text: `🔥💥 灼烧叠至 ${t} 层！熔核爆裂触发！` };
      if (t + LAVA_LORD_BURN_TICKS >= T)
        return { kind: 'PLAYER_HURT', text: `🔥⚠️ 灼烧 ${t}/${T} 层！下次被击中将立即引爆！` };
      return { kind: 'ENEMY_ACT', text: `🔥 灼烧 ${t}/${T} 层（叠满 ${T} 层触发熔核爆裂）` };
    }
    case 'ERUPTION_TELEGRAPHED':
      return { kind: 'ENEMY_ACT', text: `⚠️ 熔岩领主标记 ${ev.cells.length} 格喷发区域！下回合该区域将被熔岩吞没` };
    case 'ERUPTION_RESOLVED':
      return { kind: 'ENEMY_ACT', text: `🌋 喷发结算！${ev.tiles.length} 格化为熔岩（持续 ${ev.duration} 回合，踩入扣血）` };
    case 'BURN_BURST':
      return {
        kind: 'PLAYER_HURT',
        text: `💥 灼烧爆裂！清空灼烧 → 真实伤害 -${ev.damage}（剩余 ${ev.hp} 血），周围 ${ev.tiles.length} 格生成熔岩`,
      };
    case 'LAVA_TIDE_ROW_SPAWNED':
      if (ev.rowIndex === 1) {
        return {
          kind: 'ENEMY_ACT',
          text: `🌋 熔岩领主进入「潮汐阶段」！${TIDE_DIRECTION_CN[ev.direction]}涌出整排永久熔岩（${ev.tiles.length} 格）`,
        };
      }
      return {
        kind: 'ENEMY_ACT',
        text: `🌊 熔岩潮汐推进第 ${ev.rowIndex}/3 排（${TIDE_DIRECTION_CN[ev.direction]}，新增 ${ev.tiles.length} 格永久熔岩）`,
      };
    case 'LAVA_CHAIN_PULL': {
      const moved = ev.from.x !== ev.to.x || ev.from.y !== ev.to.y;
      return {
        kind: 'PLAYER_HURT',
        text: moved
          ? `⛓️ 被熔岩锁链拉近 1 格！附加灼烧（当前积累 ${ev.burnTotal} 点）`
          : `⛓️ 熔岩锁链锁住！落点受阻无法拉近，仅附加灼烧（当前积累 ${ev.burnTotal} 点）`,
      };
    }
    case 'MOVE_PENALTY_APPLIED':
      return { kind: 'PLAYER_HURT', text: `🥶 被减速！移动消耗增加（持续${ev.rounds}回合）` };
    case 'FIRE_BURN_APPLIED':
      return { kind: 'PLAYER_HURT', text: `🔥 中了灼烧！每回合持续扣血（持续${ev.rounds}回合）` };
    case 'BURN_TICK':
      return { kind: 'PLAYER_HURT', text: `🔥 灼烧 -${ev.damage} HP（剩余 ${ev.hp} 血）` };
    case 'ALTAR_USED':
      return { kind: 'LOOT', text: ev.anima > 0 ? `🌿 祭坛感应（灵气 +${ev.anima}）` : '🌿 祭坛已关闭' };
    case 'BLACKSMITH_UPGRADE':
      return { kind: 'LOOT', text: `⚒️ 铁匠强化 ${SLOT_CN[ev.slot] ?? ev.slot} +${ev.newEnhanceLevel}：${SLOT_ATTR_CN[ev.slot] ?? '基础属性'} → ${ev.newStat}` };
    case 'BLACKSMITH_UPGRADE_FAIL':
      return { kind: 'PLAYER_HURT', text: `⚒️ 铁匠强化失败！（失败率 ${Math.round(ev.failChance * 100)}%）星尘已扣除` };
    case 'HEAVY_STRIKE_RESOLVED':
      return { kind: 'ENEMY_ACT', text: '💥 蓄力重击发动！橙圈为本次实际命中范围' };
    case 'HEAVY_STRIKE_WARNING':
      return { kind: 'ENEMY_ACT', text: '⚠️ 哥布林酋长开始蓄力！红圈为下回合重击范围，跑出红圈即安全' };
    case 'BOSS_ENRAGED':
      if (ev.bossId === 'QUICKSAND_SCORPION') {
        return { kind: 'ENEMY_ACT', text: '😡 流沙巨蝎进入狂暴！潜地更频繁、沙暴范围扩大' };
      }
      if (ev.bossId === 'FROST_GIANT') {
        return { kind: 'ENEMY_ACT', text: '😡 冰霜巨人进入狂暴！冰霜重击替换为冲锋' };
      }
      if (ev.bossId === 'FATE_GUARDIAN') {
        return { kind: 'ENEMY_ACT', text: '😡 命运守卫狂暴：开始改写命运！' };
      }
      return { kind: 'ENEMY_ACT', text: '😡 哥布林酋长进入狂暴！攻击提升、移动加快、增援更频繁' };
    case 'SAND_PIT_STEPPED':
      return { kind: 'PLAYER_HURT', text: '🏜️ 陷入流沙！AP -2' };
    case 'SAND_TIDE_SPAWNED':
      return { kind: 'ENEMY_ACT', text: `🏜️ 流沙巨蝎掀起流沙！身侧新增 ${ev.tiles.length} 个流沙坑` };
    case 'SANDSTORM_SPAWNED':
      return { kind: 'ENEMY_ACT', text: `🌪️ 流沙巨蝎掀起沙暴！${ev.tiles.length} 格被沙暴笼罩` };
    case 'SANDSTORM_HIT':
      return { kind: 'PLAYER_HURT', text: `🌪️ 被沙暴击中！真实伤害 -${ev.damage} HP（剩余 ${ev.hp}）` };
    case 'ICE_WALL_BROKEN':
      return { kind: 'PLAYER_ACT', text: `❄️ 击碎冰墙！获得 ${ev.anima} 灵气` };
    case 'LAVA_TILE_DAMAGED':
      return { kind: 'PLAYER_HURT', text: `🔥 被熔岩烫伤！-${ev.damage} HP` };
    case 'MIRROR_SPAWNED':
      return { kind: 'ENEMY_ACT', text: '🪞 行为镜像现身！它将复制你的动作' };
    case 'MIRROR_KILLED':
      return { kind: 'PLAYER_ACT', text: '✨ 击碎镜像！' };
    case 'MIRROR_BEHAVIOR_QUEUED':
      switch (ev.action) {
        case 'ATTACK': return { kind: 'ENEMY_ACT', text: '🪞 镜像记下了你的攻击' };
        case 'MOVE':   return { kind: 'ENEMY_ACT', text: '🪞 镜像记下了你的步伐' };
        case 'IDLE':   return { kind: 'ENEMY_ACT', text: '🪞 镜像记下了你的停顿' };
      }
      return null;
    case 'MIRROR_MOVED':
      return { kind: 'ENEMY_ACT', text: '🪞 镜像追了上来' };
    case 'MIRROR_ATTACKED':
      return ev.hit
        ? { kind: 'PLAYER_HURT', text: `🪞 镜像反打：-${ev.damage}（剩 ${ev.hp} 血）` }
        : { kind: 'ENEMY_ACT', text: '🪞 镜像空挥' };
    case 'MIRROR_SHIELDED':
      return { kind: 'ENEMY_ACT', text: '🪞 镜像凝出护盾' };
    case 'MIRROR_SHIELD_ABSORBED':
      return { kind: 'ENEMY_ACT', text: '🪞 镜像护盾化解一击' };
    case 'PROPHECY_MARKED':
      return { kind: 'ENEMY_ACT', text: '🔮 命运预言！标记区域将在下回合爆炸，速速离开' };
    case 'PROPHECY_RESOLVED':
      return { kind: 'ENEMY_ACT', text: '💥 命运预言爆发！标记区域已轰炸' };
    case 'DESTINY_REWRITE_OFFERED':
      return { kind: 'SYSTEM', text: `🌀 改写命运 · 5 抽 3，请舍弃一个未来（${ev.drawn.map(destinyEventName).join(' / ')}）` };
    case 'DESTINY_REWRITE_CHOSEN':
      return { kind: 'PLAYER_ACT', text: '🌀 已做出改写命运的选择' };
    case 'DESTINY_REWRITE_RESOLVED':
      return { kind: 'ENEMY_ACT', text: `🌀 改写命运结算：${ev.executed.map(destinyEventName).join('、')}` };
    case 'DESTINY_HEAL':
      return { kind: 'ENEMY_ACT', text: `💚 Boss 回血 +${ev.amount}（剩 ${ev.bossHp} 血）` };
    case 'DESTINY_ATK_BUFF':
      return { kind: 'ENEMY_ACT', text: `🗡️ Boss 攻击 +${ev.pct}%（至第 ${ev.expiresAtTurn} 回合）` };
    case 'DESTINY_DIRECT_DAMAGE':
      return { kind: 'PLAYER_HURT', text: `💢 命运一击：-${ev.damage}（剩 ${ev.hp} 血）` };
    case 'DESTINY_5X5_EXPLODED':
      return ev.damage > 0
        ? { kind: 'PLAYER_HURT', text: `💥 命运爆炸（5×5）：-${ev.damage}（剩 ${ev.hp} 血）` }
        : { kind: 'ENEMY_ACT', text: '💥 命运爆炸（5×5，已规避）' };
    case 'DESTINY_AP_LOCKED':
      return { kind: 'PLAYER_HURT', text: `🔒 命运封锁：下回合 AP → ${ev.nextTurnAp}` };
    case 'ELITE_REVIVE':
      return { kind: 'ENEMY_ACT', text: `✨ 虚空虫双生复活！HP 恢复至 ${ev.hp}` };
    case 'ELITE_EXPLODE':
      return { kind: 'PLAYER_HURT', text: `💥 火焰元素爆裂！真实伤害 -${ev.damage}（剩余 ${ev.hp} 血）` };
    case 'FROST_AURA_DRAINED':
      return { kind: 'PLAYER_HURT', text: `❄️ 寒冰光环！AP -1（剩余 ${ev.ap}）` };
    case 'ATTACK_BLOCKED_BY_COVER':
      return ev.attackerId === 'PLAYER'
        ? { kind: 'PLAYER_ACT', text: `🪨 攻击被掩体遮挡！` }
        : { kind: 'ENEMY_ACT', text: `🪨 敌方攻击被掩体遮挡` };
    default:
      return null;
  }
}

/** 事件 → 文字战报（design §6/§7/§12）；返回 null 的事件类型不展示 toast（如 MOVE/REVEAL/TURN_END）。
 *  2026-06-25：高频战斗 / 拾取 / AP 类事件统一不 toast，只走战报栏，避免每回合周期性卡顿与刷屏。
 *  视觉反馈（lunge / flash / damageNumber / float）已经足够，玩家完整信息在战报栏滚动可查。 */
function describeEvent(ev: PveEvent, state: ExpeditionState | null): string | null {
  switch (ev.type) {
    // ── 高频战斗：不 toast（视觉 fx 已表达，详情进战报栏） ──
    case 'ATTACK':
    case 'KILL':
    case 'PLAYER_DAMAGED':
    case 'PICK_KEY':
    case 'OPEN_CHEST':
      return null;
    case 'LOOT':
      // 装备掉落必须 toast：自动穿戴时以前返回 null，Boss 必掉常被误认为「没爆」。
      if (ev.equip) {
        return ev.bagged
          ? `🎒 ${ev.equip.name} 已入包（槽位已占）`
          : `🎁 获得装备：${ev.equip.name}`;
      }
      return null;
    case 'PORTAL_SPAWNED':
      // 不 toast：浮层会被当成「互动结果」，玩家误以为还要再点一次。只写战报。
      return null;
    case 'WAVE_INCOMING':
      return `⚠ 第 ${ev.wave} 波夜袭来袭！`;
    case 'IDOL_BLESSING': {
      const idolToast = ev.effect === 'MAX_HP' ? `HP 上限 +${ev.maxHpBonus}`
        : ev.effect === 'ATTACK' ? `攻击 +${ev.attackBonus}`
        : `护甲 +${ev.armorBonus}`;
      return `🛐 神像赐予祝福 · ${idolToast}`;
    }
    case 'HOT_SPRING_HEAL':
      return `♨️ 温泉治疗 +${ev.healed} HP`;
    case 'SHOP_BUY':
      return `🏕️ 购买成功 · ${ev.effect}`;
    case 'FLOOR_CLEARED':
      return '楼层已通关！';
    case 'PLAYER_DEAD':
      return '你已倒下……';
    // ── 每回合必发的 AP 事件：不 toast，HUD 上的 AP 条与战报栏已经反映 ──
    case 'AP_ROLLED':
    case 'AP_CARRIED':
      return null;
    case 'BOSS_BURROWED':
      return '🕳️ 流沙巨蝎潜入地下！本回合免疫攻击';
    case 'BOSS_EMERGED':
      return '🦂 流沙巨蝎破土而出！双倍攻击！';
    case 'ICE_TIDE_SPAWNED':
      return `❄️ 冰霜巨人冻结地面！${ev.tiles.length} 格结冰（持续 ${ev.duration} 回合），踩上去会打滑`;
    case 'PLAYER_FROZEN':
      return '🧊 你被冻结了！攻击可解除';
    case 'PLAYER_UNFROZEN':
      return '🔥 冻结已解除';
    case 'CHARGE_TELEGRAPHED':
      return '⚠️ 冰霜巨人蓄力，下回合将狂暴冲锋！';
    case 'FROST_HEAVY_STRIKE_RESOLVED':
      return '💥 冰霜重击命中！';
    case 'BURN_APPLIED': {
      const t = ev.totalRemaining;
      const T = LAVA_LORD_BURN_BURST_THRESHOLD;
      if (t >= T) return `💥 灼烧叠满！熔核爆裂即将引爆！`;
      if (t + LAVA_LORD_BURN_TICKS >= T) return `⚠️ 灼烧 ${t}/${T} 层！下次被击中将引爆！`;
      return `🔥 灼烧 ${t}/${T} 层（叠满 ${T} 层引爆，注意保持距离）`;
    }
    case 'ERUPTION_TELEGRAPHED':
      return '⚠️ 熔岩领主标记喷发！红圈区域下回合将被熔岩吞没';
    case 'ERUPTION_RESOLVED':
      return `🌋 喷发结算！${ev.tiles.length} 格变为熔岩（持续 ${ev.duration} 回合）`;
    case 'BURN_BURST':
      return `💥 灼烧爆裂！受到 ${ev.damage} 点真实伤害（剩余 ${ev.hp}），四周生成熔岩`;
    case 'LAVA_TIDE_ROW_SPAWNED':
      return ev.rowIndex === 1
        ? `🌋 熔岩领主进入潮汐阶段！${TIDE_DIRECTION_CN[ev.direction]}涌出整排永久熔岩`
        : `🌊 熔岩潮汐推进第 ${ev.rowIndex}/3 排（${TIDE_DIRECTION_CN[ev.direction]}）`;
    case 'LAVA_CHAIN_PULL': {
      const moved = ev.from.x !== ev.to.x || ev.from.y !== ev.to.y;
      return moved
        ? `⛓️ 熔岩锁链！你被强行拉近一格，灼烧积累 ${ev.burnTotal} 点`
        : `⛓️ 熔岩锁链！落点受阻未能拉近，灼烧积累 ${ev.burnTotal} 点`;
    }
    case 'MOVE_PENALTY_APPLIED':
      return `🥶 被减速！接下来${ev.rounds}回合移动消耗增加`;
    case 'FIRE_BURN_APPLIED':
      return `🔥 中了灼烧！接下来${ev.rounds}回合每回合持续扣血`;
    case 'BURN_TICK':
      return `🔥 灼烧 -${ev.damage} HP（剩余 ${ev.hp} 血）`;
    case 'ALTAR_USED':
      return ev.anima > 0 ? `🌿 祭坛感应：灵气 +${ev.anima}` : '🌿 祭坛已关闭';
    case 'BLACKSMITH_UPGRADE':
      return `⚒️ ${SLOT_CN[ev.slot] ?? ev.slot} 强化 +${ev.newEnhanceLevel} 完成：${SLOT_ATTR_CN[ev.slot] ?? '基础属性'} → ${ev.newStat}`;
    case 'BLACKSMITH_UPGRADE_FAIL':
      return `⚒️ 强化失败（失败率 ${Math.round(ev.failChance * 100)}%），星尘已扣除`;
    case 'SAND_PIT_STEPPED':
      return '🏜️ 陷入流沙！AP -2';
    case 'SAND_TIDE_SPAWNED':
      return `🏜️ 流沙巨蝎掀起流沙！身侧新增 ${ev.tiles.length} 个流沙坑（持续 ${ev.duration} 回合）`;
    case 'SANDSTORM_SPAWNED':
      return `🌪️ 流沙巨蝎掀起沙暴！${ev.tiles.length} 格被沙暴笼罩`;
    case 'SANDSTORM_HIT':
      return `🌪️ 被沙暴击中！真实伤害 -${ev.damage} HP（剩余 ${ev.hp}）`;
    case 'ICE_WALL_BROKEN':
      return `❄️ 击碎冰墙！获得 ${ev.anima} 灵气`;
    case 'LAVA_TILE_DAMAGED':
      return `🔥 被熔岩烫伤！-${ev.damage} HP`;
    case 'MIRROR_SPAWNED':
      return '🪞 行为镜像现身！它将复制你的动作';
    case 'MIRROR_KILLED':
      return '✨ 击碎镜像！';
    case 'MIRROR_ATTACKED':
      return ev.hit ? `🪞 镜像反打：-${ev.damage}（剩 ${ev.hp} 血）` : '🪞 镜像空挥';
    case 'MIRROR_SHIELDED':
      return '🪞 镜像凝出护盾';
    case 'MIRROR_SHIELD_ABSORBED':
      return '🪞 护盾化解一击';
    case 'PROPHECY_MARKED':
      return '🔮 命运预言！标记区域将在下回合爆炸，速速离开';
    case 'PROPHECY_RESOLVED':
      return '💥 命运预言爆发！标记区域已被轰炸';
    case 'DESTINY_REWRITE_OFFERED':
      return '🌀 改写命运预告：3 选 1 弃';
    case 'DESTINY_REWRITE_RESOLVED':
      return `🌀 改写命运结算：${ev.executed.map(destinyEventName).join('、')}`;
    case 'DESTINY_HEAL':
      return `💚 Boss 回血 +${ev.amount}`;
    case 'DESTINY_ATK_BUFF':
      return `🗡️ Boss 攻击 +${ev.pct}%`;
    case 'DESTINY_DIRECT_DAMAGE':
      return `💢 命运一击：-${ev.damage}（剩 ${ev.hp} 血）`;
    case 'DESTINY_5X5_EXPLODED':
      return ev.damage > 0 ? `💥 命运爆炸：-${ev.damage}（剩 ${ev.hp} 血）` : '💥 命运爆炸（已规避）';
    case 'DESTINY_AP_LOCKED':
      return `🔒 命运封锁：下回合 AP → ${ev.nextTurnAp}`;
    case 'ELITE_REVIVE':
      return `✨ 虚空虫双生复活！HP 恢复至 ${ev.hp}`;
    case 'ELITE_EXPLODE':
      return `💥 火焰元素爆裂！真实伤害 -${ev.damage}（剩余 ${ev.hp} 血）`;
    case 'FROST_AURA_DRAINED':
      return `❄️ 寒冰光环！AP -1（剩余 ${ev.ap}）`;
    case 'ATTACK_BLOCKED_BY_COVER':
      return ev.attackerId === 'PLAYER' ? '🪨 攻击被掩体遮挡！' : null;
    default:
      return null;
  }
}

/** 命运远征场景主控 → P2 ExpeditionController */
@ccclass('ExpeditionController')
export class ExpeditionController extends Component {
  private _state: ExpeditionState | null = null;
  /** 局外快照；bootstrap 异步加载，失败时置空降级。 */
  private _meta: PveMeta | null = null;
  private _balanceSnapshot: ExpeditionState['balanceSnapshot'] | null = null;
  private _floorFlow: PersistentFloorFlow | null = null;
  private _runtime: PersistentExpeditionRuntime | null = null;
  private _map: FogMapView | null = null;
  private _mapRoot: Node | null = null;
  private _hud: PveHudView | null = null;
  private _toast: PveToastView | null = null;
  private _log: PveMessageLog | null = null;
  private _character: PveCharacterPanel | null = null;
  private _busy = false;
  /** 通关收尾进行中，防止 _afterApply / 排队互动重入。 */
  private _handlingFloorClear = false;
  /** busy 期间点了互动：结束后若仍在可探索态，自动补一次互动（传门双击竞态）。 */
  private _pendingInteract = false;
  /** wx.onKeyDown 兜底是否已绑定（用于 onDestroy 对称解绑，见 onLoad 注释）。 */
  private _wxKeyBound = false;
  /** 移动动画：key = "x,y"（from 坐标）→ { ghost 节点, to 目标格 }。
   *  _spawnKillFloaters 写入，_playFxFor(MOVE) 消费。
   *  _clearAllMoveGhosts 销毁幽灵时同步恢复目标格可见性，防止快速连点漏恢复。 */
  private _moveGhosts = new Map<string, {
    ghost: Node;
    current: Coord;
    finalTo: Coord;
    restoreBossIcon: boolean;
  }>();
  /** 攻击 lunge 动画：进行中的克隆体数量（按攻击者格 key），>0 时隐藏真身，归 0 时恢复显示。 */
  private _attackLungeCount = new Map<string, number>();
  private _attackLungeHidden = new Map<string, Coord>();
  /** 跟踪所有进行中的 lunge / 投射物 ghost 节点。
   *  新一轮 _apply 启动时强制销毁，防止前一轮 tween 被打断导致 ghost 残留 + 攻击者永久隐藏。 */
  private _attackLungeGhosts = new Set<Node>();
  private _persistentSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private _persistentSaveQueued = false;
  private _persistentSaveInFlight = false;
  /** 云端结算进行中：禁止再排队后台 runtime 存档。 */
  private _settlingCloud = false;
  private _cachedMoveTargets: Coord[] = [];
  private _cachedAttackTarget: Monster | undefined;
  private _cachedAttackEntityTarget: FixedEntity | undefined;
  private _tutorialGuide: TutorialGuideManager | null = null;
  private _tutorialExplainShown = new Set<string>();
  private _tutorialExplainPending: string | null = null;
  private _selectedChargeAp = 0;
  /** 当前 _playEvents 批次，供攻击 fx 解析受击前坐标。 */
  private _playbackEvents: readonly PveEvent[] = [];
  /** 本批已合并播过的撞碎 COLLISION ATTACK（避免二次远程弹道）。 */
  private _consumedCollisionAttacks = new Set<PveEvent>();

  /**
   * 移动幽灵结束：始终清掉 destination 的 occupant 隐藏标记。
   * 战士重击击退进迷雾时若只「不激活」却不 clear suppression，
   * `_hiddenOccupantCellKeys` 会永久残留 → 之后揭雾仍「数据在、图标不显示」（同锁链拉没角色 UI）。
   * 迷雾格只清标记、不 active OccupantArt，避免雾里露出错误 sprite。
   */
  private _restoreMoveGhostDestination(entry: {
    finalTo: Coord;
    restoreBossIcon: boolean;
  }): boolean {
    const toRevealed = this._state
      ? isCellRevealed(this._state.floorState.revealed, entry.finalTo)
      : false;
    if (moveGhostRestoreMode(toRevealed) === 'activate') {
      this._map?.setOccupantVisible(entry.finalTo, true);
    } else {
      this._map?.clearOccupantVisibilitySuppression(entry.finalTo);
    }
    if (entry.restoreBossIcon) this._map?.setBossIconVisible(true);
    return toRevealed;
  }

  private _clearMoveGhost(entityId: string): void {
    const entry = this._moveGhosts.get(entityId);
    if (!entry) return;
    if (entry.ghost?.isValid) entry.ghost.destroy();
    // 只恢复终点 occupant / boss 显隐。禁止在此 _refreshAll：
    // 每次走路幽灵收尾都会再全图刷一遍，后期回合会明显叠卡（真机 apply.events 常到 100~200ms+）。
    this._restoreMoveGhostDestination(entry);
    this._moveGhosts.delete(entityId);
  }

  private _clearAllMoveGhosts(): void {
    for (const entry of this._moveGhosts.values()) {
      if (entry.ghost?.isValid) entry.ghost.destroy();
      // _clearAllMoveGhosts 可能在 tween 完成前被调用（快速连点），必须清 suppression。
      this._restoreMoveGhostDestination(entry);
    }
    this._moveGhosts.clear();
  }

  private _registerMoveGhosts(oldState: ExpeditionState, events: PveEvent[]): void {
    if (!this._map) return;
    this._clearAllMoveGhosts();

    const grouped = new Map<string, { from: Coord; finalTo: Coord }>();
    for (const ev of events) {
      if (ev.type !== 'MOVE') continue;
      const existing = grouped.get(ev.entityId);
      if (existing) existing.finalTo = ev.to;
      else grouped.set(ev.entityId, { from: ev.from, finalTo: ev.to });
    }

    for (const [entityId, path] of grouped) {
      // 玩家始终可见；怪物若起点在迷雾中则跳过——雾中运动对玩家不可见，不应产生幽灵动画。
      if (entityId !== 'PLAYER') {
        const fromRevealed = oldState.floorState.revealed[path.from.y]?.[path.from.x] ?? false;
        if (!fromRevealed) continue;
      }
      const oldMonster = oldState.floorState.monsters.find((monster) => monster.id === entityId);
      const restoreBossIcon = Boolean(oldMonster?.bossId);
      const ghost = oldMonster
        ? (
          restoreBossIcon
            ? this._map.cloneBossIconForFx() ?? this._map.cloneMonsterForFx(oldMonster)
            : this._map.cloneMonsterForFx(oldMonster)
        )
        : this._map.cloneOccupantForFx(path.from);
      if (!ghost) continue;
      ghost.setParent(this.node);
      // 受击反应位移：ghost 先停在 from，等 ATTACK 近战动画打完再由 _playMoveFx 滑走。
      const fromWp = this._map.getCellWorldPosition(path.from);
      ghost.setPosition(this._worldToFxLocal(fromWp));
      this._moveGhosts.set(entityId, {
        ghost,
        current: path.from,
        finalTo: path.finalTo,
        restoreBossIcon,
      });
    }
  }

  private _playMoveFx(ev: Extract<PveEvent, { type: 'MOVE' }>): Promise<void> {
    return new Promise((resolve) => {
      if (!this._map) {
        resolve();
        return;
      }
      const entry = this._moveGhosts.get(ev.entityId);
      if (!entry?.ghost?.isValid) {
        // ghost 丢失时仍要清 destination suppression，否则终点 OccupantArt 会永久不显示。
        if (entry) this._clearMoveGhost(ev.entityId);
        resolve();
        return;
      }
      if (ev.entityId === 'PLAYER') playSfx(SFX_IDS.PLAYER_MOVE);
      const fromWp = this._map.getCellWorldPosition(entry.current);
      const toWp = this._map.getCellWorldPosition(ev.to);
      const fromLocal = this._worldToFxLocal(fromWp);
      const toLocal = this._worldToFxLocal(toWp);
      entry.ghost.setPosition(fromLocal);
      entry.current = ev.to;
      tween(entry.ghost)
        .to(0.08, { position: toLocal }, { easing: 'quadOut' })
        .call(() => {
          if (entry.current.x === entry.finalTo.x && entry.current.y === entry.finalTo.y) {
            this._clearMoveGhost(ev.entityId);
          }
          resolve();
        })
        .start();
    });
  }

  /**
   * 连续 MOVE 回放：同实体多步仍串行，不同实体并行。
   * 第 10 层等「无迷雾 + 多怪」场景下，串行 await 每步 80ms 会把 _busy 拉到数秒，
   * 表现为移动/蓄力/交互全部延迟；并行后总时长≈最慢那条路径。
   */
  private async _playMoveBatch(moves: Extract<PveEvent, { type: 'MOVE' }>[]): Promise<void> {
    if (moves.length === 0) return;
    if (moves.length === 1) {
      await this._playMoveFx(moves[0]!);
      return;
    }
    const byEntity = new Map<string, Extract<PveEvent, { type: 'MOVE' }>[]>();
    for (const move of moves) {
      const list = byEntity.get(move.entityId);
      if (list) list.push(move);
      else byEntity.set(move.entityId, [move]);
    }
    await Promise.all(
      [...byEntity.values()].map(async (steps) => {
        for (const step of steps) await this._playMoveFx(step);
      }),
    );
  }

  private _worldToFxLocal(world: Vec3): Vec3 {
    const transform = this.node.getComponent(UITransform);
    if (!transform) return new Vec3(world.x, world.y, world.z);
    return transform.convertToNodeSpaceAR(world);
  }

  /**
   * 近战 lunge 通用动画（玩家/怪物均可）：克隆攻击者真身，0.08s 冲到目标 70% 位置 → 0.08s 回防 → 销毁克隆。
   * 期间攻击者真身 setOccupantVisible(false) 隐藏；onContact 在冲到位时触发（目标 flash+伤害数字）。
   * 每个攻击者格独立计数：多发/溅射或多怪夹击不会互相干扰真身显隐。
   *
   * 全程 0.16s 纯 tween。所有 ghost 注册到 _attackLungeGhosts，下一轮 _apply 启动会强制清理，
   * 防止 tween 被中断（如玩家快速连点）导致 ghost 残留 + 攻击者永久隐藏。
   */
  private _playMeleeLunge(attackerPos: Coord, targetPos: Coord, onContact: () => void): Promise<void> {
    return new Promise((resolve) => {
      if (!this._map) { onContact(); resolve(); return; }
      const ghost = this._map.cloneOccupantForFx(attackerPos);
      if (!ghost) { onContact(); resolve(); return; }
      const fromWp = this._map.getCellWorldPosition(attackerPos);
      const toWp = this._map.getCellWorldPosition(targetPos);
      const peakX = fromWp.x + (toWp.x - fromWp.x) * 0.7;
      const peakY = fromWp.y + (toWp.y - fromWp.y) * 0.7;
      ghost.setParent(this.node);
      ghost.setPosition(fromWp.x, fromWp.y, 0);
      this._attackLungeGhosts.add(ghost);
      const key = `${attackerPos.x},${attackerPos.y}`;
      const prevCount = this._attackLungeCount.get(key) ?? 0;
      if (prevCount === 0) {
        this._map.setOccupantVisible(attackerPos, false);
        this._attackLungeHidden.set(key, attackerPos);
      }
      this._attackLungeCount.set(key, prevCount + 1);
      const cleanup = () => {
        this._attackLungeGhosts.delete(ghost);
        if (ghost.isValid) ghost.destroy();
        const cur = (this._attackLungeCount.get(key) ?? 1) - 1;
        if (cur <= 0) {
          this._attackLungeCount.delete(key);
          const hidden = this._attackLungeHidden.get(key);
          this._attackLungeHidden.delete(key);
          if (hidden && this._map) {
            this._map.setOccupantVisible(hidden, true);
            // 受击后同一批还有 MOVE ghost（哨兵逃跑）时禁止全图 refresh，
            // 否则会把反应位移直接刷到最终格，打断「先近战、再逃跑」表现。
            if (this._moveGhosts.size === 0 && this._playbackEvents.length === 0) {
              this._refreshAll();
            }
          }
        } else {
          this._attackLungeCount.set(key, cur);
        }
        resolve();
      };
      tween(ghost)
        .to(0.08, { position: new Vec3(peakX, peakY, 0) }, { easing: 'quadOut' })
        .call(() => onContact())
        .to(0.08, { position: new Vec3(fromWp.x, fromWp.y, 0) }, { easing: 'quadIn' })
        .call(cleanup)
        .start();
    });
  }

  /**
   * 远程箭矢：粗亮箭体飞向目标 + 拖尾残影 + 命中爆点。
   * 攻击者本体不动；全部临时节点登记到 _attackLungeGhosts 供打断清理。
   */
  private _playRangedShot(attackerPos: Coord, targetPos: Coord, onContact: () => void): Promise<void> {
    return new Promise((resolve) => {
      if (!this._map) { onContact(); resolve(); return; }
      const fromWp = this._map.getCellWorldPosition(attackerPos);
      const toWp = this._map.getCellWorldPosition(targetPos);
      const flightSec = 0.18;
      const trailEvery = 0.04;
      const arrow = createArrowFxNode(this.node);
      arrow.setPosition(fromWp.x, fromWp.y, 0);
      arrow.setScale(0.7, 0.7, 1);
      aimNodeToward(arrow, fromWp, toWp);
      this._attackLungeGhosts.add(arrow);

      const destroyFx = (node: Node) => {
        this._attackLungeGhosts.delete(node);
        if (node.isValid) node.destroy();
      };

      const spawnTrail = (x: number, y: number) => {
        if (!this.node?.isValid) return;
        const trail = createArrowTrailFxNode(this.node);
        trail.setPosition(x, y, 0);
        aimNodeToward(trail, fromWp, toWp);
        trail.setScale(0.9, 0.9, 1);
        this._attackLungeGhosts.add(trail);
        const trailOp = trail.getComponent(UIOpacity);
        tween(trail)
          .to(0.18, { scale: new Vec3(1.2, 0.5, 1) }, { easing: 'quadOut' })
          .start();
        if (trailOp) {
          tween(trailOp)
            .to(0.18, { opacity: 0 }, { easing: 'quadIn' })
            .call(() => destroyFx(trail))
            .start();
        } else {
          this.scheduleOnce(() => destroyFx(trail), 0.18);
        }
      };

      let trailSteps = 0;
      const maxTrails = Math.max(1, Math.floor((flightSec - 0.02) / trailEvery));
      const trailTick = () => {
        if (!arrow.isValid) return;
        const p = arrow.position;
        spawnTrail(p.x, p.y);
        trailSteps += 1;
        if (trailSteps < maxTrails) this.scheduleOnce(trailTick, trailEvery);
      };
      this.scheduleOnce(trailTick, trailEvery);

      const opacity = arrow.getComponent(UIOpacity);
      tween(arrow)
        .to(
          flightSec,
          { position: new Vec3(toWp.x, toWp.y, 0), scale: new Vec3(1.2, 1.2, 1) },
          { easing: 'quadIn' },
        )
        .call(() => {
          onContact();

          const impact = createRangedImpactFxNode(this.node, 40);
          impact.setPosition(toWp.x, toWp.y, 0);
          impact.setScale(0.4, 0.4, 1);
          this._attackLungeGhosts.add(impact);
          const impactOp = impact.getComponent(UIOpacity);
          tween(impact)
            .to(0.22, { scale: new Vec3(1.4, 1.4, 1) }, { easing: 'quadOut' })
            .start();
          if (impactOp) {
            tween(impactOp)
              .delay(0.05)
              .to(0.17, { opacity: 0 }, { easing: 'quadIn' })
              .call(() => destroyFx(impact))
              .start();
          } else {
            this.scheduleOnce(() => destroyFx(impact), 0.22);
          }

          tween(arrow)
            .to(0.1, { scale: new Vec3(1.5, 1.5, 1) }, { easing: 'quadOut' })
            .start();
          if (opacity) {
            tween(opacity)
              .to(0.12, { opacity: 0 }, { easing: 'quadIn' })
              .call(() => {
                destroyFx(arrow);
                resolve();
              })
              .start();
          } else {
            this.scheduleOnce(() => {
              destroyFx(arrow);
              resolve();
            }, 0.12);
          }
        })
        .start();
    });
  }

  /**
   * 近战光剑：冲到目标面前 → 朝向目标拔剑 → 相对目标方向从左到右快挥（扇形光晕拖尾）→ 渐隐回位。
   * 战士/潜行者即便射程>1 也走此表现；空装仍走 `_playMeleeLunge`。
   */
  private _playMeleeSlash(attackerPos: Coord, targetPos: Coord, onContact: () => void): Promise<void> {
    return new Promise((resolve) => {
      if (!this._map) { onContact(); resolve(); return; }
      const ghost = this._map.cloneOccupantForFx(attackerPos);
      if (!ghost) {
        void this._playSwordArc(attackerPos, targetPos, onContact).then(resolve);
        return;
      }
      const fromWp = this._map.getCellWorldPosition(attackerPos);
      const toWp = this._map.getCellWorldPosition(targetPos);
      const peakX = fromWp.x + (toWp.x - fromWp.x) * 0.72;
      const peakY = fromWp.y + (toWp.y - fromWp.y) * 0.72;
      const faceAngle = Math.atan2(toWp.y - fromWp.y, toWp.x - fromWp.x) * (180 / Math.PI);
      const distPx = Math.hypot(toWp.x - fromWp.x, toWp.y - fromWp.y);
      const saberLen = Math.max(40, Math.min(58, distPx * 0.45));

      ghost.setParent(this.node);
      ghost.setPosition(fromWp.x, fromWp.y, 0);
      this._attackLungeGhosts.add(ghost);

      const key = `${attackerPos.x},${attackerPos.y}`;
      const prevCount = this._attackLungeCount.get(key) ?? 0;
      if (prevCount === 0) {
        this._map.setOccupantVisible(attackerPos, false);
        this._attackLungeHidden.set(key, attackerPos);
      }
      this._attackLungeCount.set(key, prevCount + 1);

      const finish = () => {
        this._attackLungeGhosts.delete(ghost);
        if (ghost.isValid) ghost.destroy();
        const cur = (this._attackLungeCount.get(key) ?? 1) - 1;
        if (cur <= 0) {
          this._attackLungeCount.delete(key);
          const hidden = this._attackLungeHidden.get(key);
          this._attackLungeHidden.delete(key);
          if (hidden && this._map) {
            this._map.setOccupantVisible(hidden, true);
            if (this._moveGhosts.size === 0 && this._playbackEvents.length === 0) {
              this._refreshAll();
            }
          }
        } else {
          this._attackLungeCount.set(key, cur);
        }
        resolve();
      };

      // 枢轴朝向目标：挥砍角相对「面对怪物」的左→右扫过。
      const pivot = new Node('SaberPivot');
      pivot.setParent(ghost);
      pivot.setPosition(10, 4, 0);
      pivot.angle = faceAngle;

      const saber = createLightSaberFxNode(pivot, saberLen);
      saber.setPosition(0, 0, 0);
      saber.setScale(0.15, 0.15, 1);
      // 相对面朝方向：左侧起手 → 右侧收刀（本地 -X 角到 +X 角）。
      const swingStart = -70;
      const swingEnd = 75;
      saber.angle = swingStart;
      const saberOp = saber.getComponent(UIOpacity) ?? saber.addComponent(UIOpacity);
      saberOp.opacity = 0;

      // 单层扇形光晕（连续重绘），避免多道影子残影。
      const glow = createSaberSwingGlowNode(pivot, saberLen + 8);
      glow.node.setSiblingIndex(0);
      const glowOp = glow.node.getComponent(UIOpacity) ?? glow.node.addComponent(UIOpacity);
      glowOp.opacity = 0;

      let contacted = false;
      const swing = { a: swingStart };
      const applySwing = () => {
        if (!saber.isValid) return;
        saber.angle = swing.a;
        glow.paint(swingStart, swing.a);
      };

      // 更快：冲刺 0.08 → 拔剑 0.04 → 快挥 0.10 → 渐隐 0.07 → 回位 0.08
      tween(ghost)
        .to(0.08, { position: new Vec3(peakX, peakY, 0) }, { easing: 'quadOut' })
        .call(() => {
          tween(saberOp).to(0.03, { opacity: 255 }, { easing: 'quadOut' }).start();
          tween(glowOp).to(0.03, { opacity: 255 }, { easing: 'quadOut' }).start();
          tween(saber).to(0.04, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' }).start();
        })
        .delay(0.04)
        .call(() => {
          glow.paint(swingStart, swingStart);
          tween(swing)
            .to(0.05, { a: (swingStart + swingEnd) * 0.5 }, {
              easing: 'quadIn',
              onUpdate: applySwing,
            })
            .call(() => {
              if (!contacted) {
                contacted = true;
                onContact();
              }
            })
            .to(0.05, { a: swingEnd }, {
              easing: 'quadOut',
              onUpdate: applySwing,
            })
            .call(() => {
              tween(saberOp).to(0.07, { opacity: 0 }, { easing: 'quadIn' }).start();
              tween(glowOp).to(0.07, { opacity: 0 }, { easing: 'quadIn' }).start();
              tween(saber).to(0.07, { scale: new Vec3(0.5, 0.28, 1) }, { easing: 'quadIn' }).start();
            })
            .start();
        })
        .delay(0.16)
        .to(0.08, { position: new Vec3(fromWp.x, fromWp.y, 0) }, { easing: 'quadIn' })
        .call(finish)
        .start();
    });
  }

  /** 旧剑弧兜底（克隆失败时）。 */
  private _playSwordArc(attackerPos: Coord, targetPos: Coord, onContact: () => void): Promise<void> {
    return new Promise((resolve) => {
      if (!this._map) { onContact(); resolve(); return; }
      const fromWp = this._map.getCellWorldPosition(attackerPos);
      const toWp = this._map.getCellWorldPosition(targetPos);
      const cell = Math.max(24, Math.hypot(toWp.x - fromWp.x, toWp.y - fromWp.y) * 0.85);
      const slash = createSwordArcFxNode(this.node, cell * 0.55);
      const peak = midPoint(fromWp, toWp, 0.4);
      slash.setPosition(peak.x, peak.y, 0);
      aimNodeToward(slash, fromWp, toWp);
      slash.setScale(0.35, 0.35, 1);
      this._attackLungeGhosts.add(slash);
      const opacity = slash.getComponent(UIOpacity);
      let contacted = false;
      tween(slash)
        .to(0.07, { scale: new Vec3(1.05, 1.05, 1) }, { easing: 'quadOut' })
        .call(() => {
          if (!contacted) {
            contacted = true;
            onContact();
          }
        })
        .to(0.1, { scale: new Vec3(1.2, 1.2, 1) }, { easing: 'quadIn' })
        .call(() => {
          if (opacity) {
            tween(opacity)
              .to(0.08, { opacity: 0 })
              .call(() => {
                this._attackLungeGhosts.delete(slash);
                if (slash.isValid) slash.destroy();
                resolve();
              })
              .start();
          } else {
            this._attackLungeGhosts.delete(slash);
            if (slash.isValid) slash.destroy();
            resolve();
          }
        })
        .start();
    });
  }

  /**
   * 强制清理所有进行中的 lunge / 投射物 ghost + 恢复所有被隐藏的攻击者格。
   * 在 _spawnKillFloaters 头部调用：每个新 _apply 启动时清空上一轮残留，
   * 防止 tween 被中断（场景切换/快速连点/状态突变）导致永久隐藏。
   */
  private _clearAllAttackLunges(): void {
    for (const ghost of this._attackLungeGhosts) {
      if (ghost.isValid) ghost.destroy();
    }
    this._attackLungeGhosts.clear();
    for (const hidden of this._attackLungeHidden.values()) {
      this._map?.setOccupantVisible(hidden, true);
    }
    this._attackLungeHidden.clear();
    this._attackLungeCount.clear();
    // 不在这里 _refreshAll：_spawnKillFloaters 调用时仍是旧 state，
    // 紧随其后的 _apply._refreshAll 会用新 state 正确重绘。
  }

  /**
   * 全屏色闪：覆盖整屏的 Graphics 矩形从指定 alpha 0.45s 淡到 0。
   * 用于装备掉落等需要"屏幕级情绪反馈"的强提示，超越单格 flash 的存在感。
   * Node 注册到 _attackLungeGhosts，下一轮 _apply 启动若仍在淡出会被强制清理。
   */
  private _playScreenFlash(color: Color, peakAlpha = 110): void {
    const { w: screenW, h: screenH } = visibleDesignSize();
    const flash = new Node('ScreenFlash');
    flash.setParent(this.node);
    flash.setPosition(0, 0, 0);
    const ui = flash.addComponent(UITransform);
    ui.setContentSize(screenW * 1.2, screenH * 1.2);
    ui.setAnchorPoint(0.5, 0.5);
    const g = flash.addComponent(Graphics);
    g.fillColor = new Color(color.r, color.g, color.b, peakAlpha);
    g.rect(-screenW * 0.6, -screenH * 0.6, screenW * 1.2, screenH * 1.2);
    g.fill();
    const op = flash.addComponent(UIOpacity);
    op.opacity = 255;
    this._attackLungeGhosts.add(flash);
    tween(op)
      .to(0.45, { opacity: 0 }, { easing: 'quadOut' })
      .call(() => {
        this._attackLungeGhosts.delete(flash);
        if (flash.isValid) flash.destroy();
      })
      .start();
  }

  onLoad(): void {
    lockPortrait();
    refreshScreenAdapt(this.node);
    this.scheduleOnce(() => refreshScreenAdapt(this.node), 0);
    applyUiLayerTree(this.node, this.node.layer);

    void preloadPveUi();
    this._buildUi();
    void this._bootstrap();

    // 键盘控制（电脑端玩家）。两条互补路径，覆盖不同 PC 客户端：
    //  1) cc.input KEY_DOWN —— 引擎仅在 EVENT_KEYBOARD=true（实测为 os===WINDOWS && !isDevTool）
    //     时才注册底层 wx.onKeyDown，故只在【Windows 微信客户端】生效；
    //  2) wx.onKeyDown 兜底 —— 当 EVENT_KEYBOARD=false（如【Mac 微信客户端】，os!==WINDOWS）时
    //     引擎不接管，但 wx.onKeyDown 在 Mac 客户端仍受支持，故手动绑定补齐。两者互斥不会重复触发。
    // ⚠️ 微信开发者工具模拟器：EVENT_KEYBOARD=false 且既不转发 cc.input 也不触发 wx.onKeyDown/
    //    document.keydown（实测三者皆静默），即【模拟器无法测试键盘】，需用 PC 微信客户端或浏览器预览验证。
    input.on(Input.EventType.KEY_DOWN, this._onKeyDown, this);
    if (!sys.hasFeature(sys.Feature.EVENT_KEYBOARD) && typeof wx !== 'undefined') {
      const wxApi = wx as unknown as { onKeyDown?: (cb: (e: { code: string }) => void) => void };
      if (typeof wxApi.onKeyDown === 'function') {
        wxApi.onKeyDown(this._onWxKeyDown);
        this._wxKeyBound = true;
      }
    }
  }

  onDestroy(): void {
    input.off(Input.EventType.KEY_DOWN, this._onKeyDown, this);
    if (this._wxKeyBound && typeof wx !== 'undefined') {
      const wxApi = wx as unknown as { offKeyDown?: (cb: (e: { code: string }) => void) => void };
      wxApi.offKeyDown?.(this._onWxKeyDown);
    }
    if (this._persistentSaveTimer) clearTimeout(this._persistentSaveTimer);
    this._persistentSaveTimer = null;
    this._map?.destroy();
    this._hud?.destroy();
    this._toast?.destroy();
    this._log?.destroy();
    this._character?.destroy();
  }

  /**
   * 键盘操作（cc.input 路径，Windows 微信客户端）：方向键/WASD 移动，J/空格攻击，K/E 交互，回车结束回合。
   * EVENT_KEYBOARD=false 的环境（Mac 客户端/模拟器）走 `_onWxKeyDown`，见 onLoad 注释。
   */
  private _onKeyDown(event: EventKeyboard): void {
    switch (event.keyCode) {
      case KeyCode.ARROW_UP:
      case KeyCode.KEY_W:
        this._onMove('UP');
        break;
      case KeyCode.ARROW_DOWN:
      case KeyCode.KEY_S:
        this._onMove('DOWN');
        break;
      case KeyCode.ARROW_LEFT:
      case KeyCode.KEY_A:
        this._onMove('LEFT');
        break;
      case KeyCode.ARROW_RIGHT:
      case KeyCode.KEY_D:
        this._onMove('RIGHT');
        break;
      case KeyCode.SPACE:
      case KeyCode.KEY_J:
        this._onAttack();
        break;
      case KeyCode.KEY_E:
      case KeyCode.KEY_K:
        this._onInteract();
        break;
      case KeyCode.ENTER:
        this._onEndTurn();
        break;
    }
  }

  /** 键盘操作（wx.onKeyDown 兜底，Mac 微信客户端）。箭头函数以稳定 this 与解绑引用。 */
  private _onWxKeyDown = (event: { code: string }): void => {
    this._handleKeyByCode(event?.code);
  };

  /** 按微信原生 `KeyboardEvent.code` 字符串派发，与 `_onKeyDown` 映射一致。 */
  private _handleKeyByCode(code: string | undefined): void {
    switch (code) {
      case 'ArrowUp':
      case 'KeyW':
        this._onMove('UP');
        break;
      case 'ArrowDown':
      case 'KeyS':
        this._onMove('DOWN');
        break;
      case 'ArrowLeft':
      case 'KeyA':
        this._onMove('LEFT');
        break;
      case 'ArrowRight':
      case 'KeyD':
        this._onMove('RIGHT');
        break;
      case 'Space':
      case 'KeyJ':
        this._onAttack();
        break;
      case 'KeyE':
      case 'KeyK':
        this._onInteract();
        break;
      case 'Enter':
        this._onEndTurn();
        break;
    }
  }

  private _buildUi(): void {
    const { w: screenW, h: screenH } = visibleDesignSize();

    const mapRoot = new Node('MapRoot');
    mapRoot.setParent(this.node);
    // 按 2026-06-23 最新真机红框像素实测：窗口顶/底分别位于屏幕自上而下约 16.8% / 77.5%。
    // 直接使用截图对照物，不再由背景生成稿的石板比例反推。
    const mapTop = screenH * 0.332;
    const mapBottom = -screenH * 0.275;
    const mapHeight = Math.max(520, mapTop - mapBottom);
    mapRoot.setPosition(0, (mapTop + mapBottom) / 2, 0);
    // UITransform 确保 mapRoot 的坐标系基准稳定；缺失时 Cocos 布局组件在内容尺寸变化时
    // 可能推动父节点坐标，导致主战场窗口随玩家位置漂移（见 handoff §3.2）。
    mapRoot.addComponent(UITransform).setContentSize(screenW, mapHeight);
    // 横向完全铺满屏幕，避免章节背景从两侧露出竖向缝隙。
    this._mapRoot = mapRoot;
    this._map = new FogMapView(mapRoot, screenW, mapHeight, {
      onCellTap: (coord) => this._onTapCell(coord),
    }, { parent: this.node, width: screenW, height: screenH });

    this._hud = new PveHudView(this.node, screenW, screenH, {
      onMove: (dir) => this._onMove(dir),
      onAttack: () => this._onAttack(),
      onInteract: () => this._onInteract(),
      onEndTurn: () => this._onEndTurn(),
      onQuit: () => void this._onQuitRequested(),
      onShowCharacter: () => this._onShowCharacter(),
      onOpenBag: () => void this._onOpenBag(),
      onProfessionMechanic: () => void this._onProfessionMechanic(),
      onSpiritBurst: () => this._onSpiritBurst(),
    });

    this._toast = new PveToastView(this.node, screenW, screenH);

    // 地图与操作区之间仅保留最近 3～4 条，完整历史仍可滚动查看。
    // Y/H 与 PveHudView 的 playerPanel 完全对齐（同 infoY = -screenH/2+274，同 INFO_H）。
    const infoW = screenW - 40;
    const infoGap = 12;
    const logW = Math.round((infoW - infoGap) * 0.6);
    const logX = -screenW / 2 + 20 + logW / 2;
    this._log = new PveMessageLog(this.node, logX, -screenH / 2 + 274, logW, PVE_HUD_INFO_H);

    // 角色信息弹窗：默认 hidden；点击 HUD「角色」按钮唤起
    this._character = new PveCharacterPanel(this.node, screenW, screenH);

    // fx 程序动画框架 screenRoot：用 mapRoot（FogMapView 外层容器）而非 this.node。
    // 因为 this.node 是场景 Canvas 根，Cocos Canvas 组件每帧把位置重置回原点，
    // cameraShake 的 position 偏移会被覆盖，玩家看不到震屏（2026-06-26 真机复现）。
    // mapRoot 是普通子节点，position 变化能稳定生效；并且只震战场区域、UI 保持静止，
    // 也是格斗 / 动作类游戏的标准做法（Street Fighter 系列同款）。
    Effects.setScreenRoot(mapRoot);
  }

  /** HUD「角色」按钮回调：弹出属性、职业与装备详情。 */
  private _onShowCharacter(): void {
    if (!this._state || !this._character) return;
    this._character.show(this._state);
  }

  /** HUD「背包」按钮：打开背包弹窗，允许将包内装备装备到对应槽位。 */
  private async _onOpenBag(): Promise<void> {
    if (this._busy || !this._state || !this._toast) return;
    this._busy = true;
    try {
      await this._toast.showBackpack(
        {
          equipment: this._state.player.equipment,
          bag: this._state.player.bag ?? [],
        },
        (itemId) => {
          if (!this._state) return null;
          const updated = equipFromBag(this._state.player, itemId);
          if (!updated) return null;
          this._state = { ...this._state, player: updated };
          this._rebuildInputHints();
          this._hud?.refresh(this._state);
          return { equipment: updated.equipment, bag: updated.bag ?? [] };
        },
      );
    } catch (err) {
      console.error('[PVE] _onOpenBag error:', err);
    } finally {
      this._busy = false;
    }
  }

  /** 返回大厅前二次确认，并先保存当前楼层，避免移动时误触导致进度丢失。 */
  private async _onQuitRequested(): Promise<void> {
    if (this._busy || !this._state || !this._toast) return;
    this._busy = true;
    try {
      const choice = await this._toast.showConfirm(
        '返回大厅？\n当前楼层进度会自动保存，可稍后继续远征。',
        [
          { label: '继续冒险', value: 'cancel' },
          { label: '返回大厅', value: 'quit' },
        ],
      );
      if (choice !== 'quit') return;
      await this._flushPersistentSave();
      SceneLoader.loadLobby();
    } finally {
      this._busy = false;
    }
  }

  /** 进入场景：读取大厅选择的楼层，交给 PersistentFloorFlow 统一处理开始/续玩。 */
  private async _bootstrap(): Promise<void> {
    this._busy = true;
    let enteredFloor = false;
    LoadingOverlay.show(this.node, '正在进入远征…', {
      mode: 'chapter',
      title: '命运远征',
      subtitle: '正在展开本层战场',
      hint: '正在读取档案与楼层资源',
      progress: 0.12,
      hideOnTimeout: false,
      timeoutMs: 30000,
      onTimeout: () => LoadingOverlay.update({
        text: '远征加载较慢，仍在继续准备…',
        subtitle: '迷雾仍在散去',
      }),
    });
    try {
      LoadingOverlay.update({
        text: '正在读取远征档案…',
        hint: '正在同步楼层进度',
        progress: 0.28,
      });
      const selectedFloor = GameSession.pendingPveFloor ?? undefined;
      GameSession.pendingPveFloor = null;

      const [metaRes] = await Promise.allSettled([loadPveMeta()]);

      if (metaRes.status === 'fulfilled') {
        this._meta = metaRes.value.meta;
        this._balanceSnapshot = metaRes.value.balanceSnapshot ?? null;
      }

      this._floorFlow = new PersistentFloorFlow({
        loadProfile: loadPveProfile,
        loadActive: loadActiveFloorChallenge,
        start: startFloorChallenge,
        save: saveFloorChallengeRuntime,
        settle: settleFloorChallenge,
      });
      LoadingOverlay.update({
        text: '正在准备本层战场…',
        hint: '正在生成或恢复楼层',
        progress: 0.48,
      });
      const flowState = await this._floorFlow.bootstrap(selectedFloor, {
        tutorialCompleted: this._meta?.tutorialCompleted === true,
      });
      this._runtime = flowState.runtime;
      this._state = flowState.runtime.battleState.expedition;
      this._balanceSnapshot = this._state.balanceSnapshot ?? this._balanceSnapshot;
      if (!(await this._ensureChapterReady(this._state.chapter))) return;
      this._rebuildInputHints();
      this._log?.clear();
      this._refreshAll();
      enteredFloor = true;
      LoadingOverlay.update({
        text: '战场准备完成',
        hint: '即将进入本层',
        progress: 1,
      });
      LoadingOverlay.hide();
      this._toast?.toast(`${flowState.resumed ? '继续挑战' : '开始挑战'} · 第${this._state.floor}层`);
      this._log?.push(this._state.floorState.turn, 'SYSTEM', `${flowState.resumed ? '继续挑战' : '开始挑战'} · 第${this._state.floor}层`);
      this._showFloorEntryAlerts();
      const presentationEvents = initialPersistentPresentationEvents(this._runtime);
      if (presentationEvents.length > 0) await this._playEvents(presentationEvents);
      if (this._state.floorState.status === 'CLEARED' || this._runtime.status === 'CLEAR') {
        await this._handleFloorCleared();
      }
    } catch (err) {
      LoadingOverlay.hide();
      await this._handleBootstrapLoadFailure(err);
    } finally {
      if (!enteredFloor) LoadingOverlay.hide();
      this._busy = false;
    }
  }

  private async _handleBootstrapLoadFailure(err: unknown): Promise<void> {
    const message = err instanceof Error ? err.message : String(err);
    const choice = this._toast
      ? await this._toast.showConfirm(
          `加载远征存档失败\n${message}\n云端状态未确认，未自动开启新远征`,
          [
            { label: '重试加载', value: 'retry' },
            { label: '返回大厅', value: 'lobby' },
          ],
        )
      : 'lobby';
    if (choice === 'retry') {
      setTimeout(() => {
        void this._bootstrap();
      }, 0);
      return;
    }
    SceneLoader.loadLobby();
  }

  private _floorInChapter(floor: number): number {
    return ((floor - 1) % FLOORS_PER_CHAPTER) + 1;
  }

  private _showFloorEntryAlerts(): void {
    if (!this._state) return;
    const { chapter, floor, floorState } = this._state;
    // 各章统一：进层先展示通关条件，片刻后自动消失。
    this._hud?.showObjectiveBrief(4200);
    // Boss 层 / Boss 前一层即预热下一章分包，通关后不必再等云端结算才开始下载。
    if (isBossFloor(floor) || this._floorInChapter(floor) === FLOORS_PER_CHAPTER - 1) {
      preloadChapter(chapter + 1);
    }
    if (!this._toast) return;
    if (isBossFloor(floor)) {
      this._toast.toastImportant(`第${chapter}章 Boss 层 · 首领来袭`, 2400);
      this._log?.push(floorState.turn, 'SYSTEM', `⚠ 第${chapter}章 Boss 层 · 首领来袭`);
      return;
    }
    if (this._floorInChapter(floor) === FLOORS_PER_CHAPTER - 1) {
      this._toast.toast(`⚠ 下一层将进入 Boss 战，建议先整理状态`, 2200);
      this._log?.push(floorState.turn, 'SYSTEM', '⚠ 下一层将进入 Boss 战');
    }
  }

  /**
   * 进入/恢复到指定章节前，确保该章资源 bundle + 背景已就绪（需求#2/#3/#6）。
   * 已就绪直接返回；否则显示 loading 遮罩并加载。失败时提示 + 回大厅（需求#4），
   * 返回 false 表示调用方应立即中止（已触发场景切换）。进度已存档，回大厅可续档重载。
   */
  private async _ensureChapterReady(chapter: number): Promise<boolean> {
    if (isChapterReady(chapter)) return true;
    LoadingOverlay.show(this.node, `正在进入第${chapter}章…`, {
      mode: 'chapter',
      title: `进入第${chapter}章`,
      subtitle: '迷雾正在向更深处散去',
      hint: '远征之路正在向前延伸',
      progress: 0.1,
      timeoutMs: 15000,
      hideOnTimeout: false,
      onTimeout: () => LoadingOverlay.update({
        text: `第${chapter}章加载较慢，仍在继续准备…`,
        subtitle: '更深处的道路仍在显现',
      }),
    });
    const ready = await ensureChapterAssets(chapter, (stage) => LoadingOverlay.update(stage)).catch(() => false);
    if (!ready) {
      LoadingOverlay.hide();
      this._toast?.toast(`第${chapter}章资源加载失败，请返回大厅重新进入远征`);
      await delay(1200);
      SceneLoader.loadLobby();
      return false;
    }
    // 成功时不关 overlay：交给 _bootstrap 在首帧 _refreshAll 后再关，避免黑屏空壳 HUD。
    LoadingOverlay.update({
      text: `正在绘制第${chapter}章战场…`,
      progress: 0.88,
      subtitle: '新的命运篇章已经展开',
    });
    return true;
  }

  private _refreshAll(): void {
    if (!this._state) return;
    this._map?.refresh(this._state.floorState, this._state.player.classId);
    this._hud?.refresh(this._state);
    this._refreshPersistentHud();
    this._map?.showMoveRange(this._cachedMoveTargets);
    this._map?.showAttackTarget(this._cachedAttackTarget?.pos ?? this._cachedAttackEntityTarget?.pos ?? null);
    this._syncTutorialGuide([]);
  }

  private _refreshPersistentHud(): void {
    if (!this._runtime) return;
    this._selectedChargeAp = Math.min(this._selectedChargeAp, this._maxSelectableChargeAp());
    const profession = this._runtime.profession;
    this._hud?.refreshPersistentControls(
      this._runtime.config.professionId,
      this._selectedChargeAp,
      this._runtime.resources.spirit,
      {
        aimLevel: profession.archerAimLevel,
        combo: profession.rangerCombo,
        canFinisher: this._runtime.config.professionId === 'RANGER' && profession.rangerCombo >= 3,
      },
    );
  }

  private _maxSelectableChargeAp(): number {
    if (!this._state || !this._runtime || this._runtime.config.professionId !== 'WARRIOR') return 0;
    // 至少保留 1 点 AP 给武器基础攻击消耗；额外蓄力最多 3 点。
    return Math.min(WARRIOR_MAX_CHARGE_AP, Math.max(0, this._state.floorState.ap - 1));
  }

  private _syncTutorialGuide(events: PveEvent[], ctx?: TutorialAdvanceContext): void {
    if (!this._state) return;
    this._tutorialGuide ??= new TutorialGuideManager();
    this._tutorialGuide.bind(this._state);
    if (!this._tutorialGuide.isActive(this._state)) {
      this._toast?.hideGuideBubble();
      this._map?.clearTutorialFocus();
      this._tutorialExplainPending = null;
      return;
    }
    if ((events.length > 0 || ctx) && this._tutorialGuide.advanceIfNeeded(this._state, events, {
      selectedChargeAp: this._selectedChargeAp,
      spiritBurstActive: !!this._runtime?.profession.spiritBurstActive,
      ...ctx,
    })) {
      this._tutorialGuide.bind(this._state);
    }
    const step = this._tutorialGuide.currentStep();
    if (step?.onEnterFillSpirit && this._runtime && this._runtime.resources.spirit < 100) {
      this._runtime = {
        ...this._runtime,
        resources: { ...this._runtime.resources, spirit: 100 },
      };
      this._floorFlow?.updateRuntime(this._runtime);
      this._refreshPersistentHud();
    }
    const message = this._tutorialGuide.getMessage();
    if (message) this._toast?.showGuideBubble(message);
    else this._toast?.hideGuideBubble();
    const allowedCells = this._tutorialGuide.getAllowedCells();
    if (allowedCells.length > 0) this._map?.showTutorialFocus(allowedCells);
    else this._map?.clearTutorialFocus();
    this._refreshTutorialHudHighlights();
    void this._maybeShowTutorialExplain(step);
  }

  private async _maybeShowTutorialExplain(
    step: { id: string; onEnterExplain?: string } | null,
  ): Promise<void> {
    if (!step?.onEnterExplain || !this._toast) return;
    if (this._tutorialExplainShown.has(step.id)) return;
    if (this._tutorialExplainPending === step.id) return;
    this._tutorialExplainPending = step.id;
    const prevBusy = this._busy;
    this._busy = true;
    try {
      await this._toast.showConfirm(step.onEnterExplain, [{ label: '知道了', value: 'ok' }]);
      this._tutorialExplainShown.add(step.id);
    } finally {
      if (this._tutorialExplainPending === step.id) this._tutorialExplainPending = null;
      this._busy = prevBusy;
    }
  }

  private _refreshTutorialHudHighlights(): void {
    this._hud?.setTutorialButtonHighlight({
      charge: !!this._tutorialGuide?.shouldHighlightCharge(),
      spiritBurst: !!this._tutorialGuide?.shouldHighlightSpiritBurst(),
    });
  }

  private _isTutorialBlocked(
    action: 'MOVE' | 'ATTACK' | 'INTERACT' | 'TAP_CELL' | 'CHARGE' | 'SPIRIT_BURST',
    coord?: Coord,
  ): boolean {
    if (!this._state || !this._tutorialGuide || !this._tutorialGuide.isActive(this._state)) return false;
    if (this._tutorialExplainPending && (action === 'CHARGE' || action === 'SPIRIT_BURST')) {
      this._toast?.toast('先阅读机制说明');
      return true;
    }
    if (coord && this._tutorialGuide.shouldBlockCell(coord)) {
      this._toast?.toast('先按引导操作');
      return true;
    }
    if (this._tutorialGuide.shouldBlockAction(action)) {
      this._toast?.toast('先完成当前教学步骤');
      return true;
    }
    return false;
  }

  /** 当前四方向中真正可执行的移动落点；复用纯函数 dry-run，包含冰面滑行与装备/AP 修正。 */
  private _computeMoveTargets(): Coord[] {
    if (!this._state || this._state.status !== 'ACTIVE' || this._state.floorState.status !== 'EXPLORING') {
      return [];
    }
    const freeMove = (this._runtime?.profession.rangerFreeMoveSteps ?? 0) > 0;
    const dirs: Direction[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
    const targets = new Map<string, Coord>();
    for (const dir of dirs) {
      const result = applyMove(this._state, dir, freeMove ? { freeMove: true } : undefined);
      if (result.events.length === 0) continue;
      const pos = result.state.floorState.player;
      targets.set(`${pos.x},${pos.y}`, pos);
    }
    return [...targets.values()];
  }

  /**
   * "攻击"按钮当前会命中的目标（与 _onAttack 选怪规则一致）。
   * 若玩家已点选范围内怪物，优先攻击该选中目标；否则取最近可攻击者。
   */
  private _computeAttackTarget(): Monster | undefined {
    if (!this._state) return undefined;
    const floor = this._state.floorState;
    const { range } = playerAttackPower(this._state.player, this._state.balanceSnapshot, this._state.chapter);
    const inRange = floor.monsters
      .filter((m) =>
        m.aiState !== 'DEAD' &&
        manhattan(floor.player, m.pos) <= range &&
        isRevealed(floor.revealed, m.pos),
      )
      .sort((a, b) => manhattan(floor.player, a.pos) - manhattan(floor.player, b.pos));
    const focusedId = this._hud?.getFocusedMonsterId();
    if (focusedId) {
      const focused = inRange.find((m) => m.id === focusedId);
      if (focused) return focused;
    }
    // 远程（range≥2）优先选 LOS 通畅的目标；若全被遮挡则退化选最近者（让玩家感受遮挡反馈）。
    if (range >= 2) {
      const visible = inRange.filter(
        (m) => manhattan(floor.player, m.pos) < 2 || !checkLos(floor, floor.player, m.pos),
      );
      return visible.length > 0 ? visible[0] : inRange[0];
    }
    return inRange[0];
  }

  /**
   * "攻击"按钮在没有怪物目标时会命中的冰墙（FrostGiant 专属机制，→ attackIceWall）。
   * 已点选范围内冰墙时优先该目标。
   */
  private _computeAttackTargetEntity(): FixedEntity | undefined {
    if (!this._state) return undefined;
    const floor = this._state.floorState;
    const { range } = playerAttackPower(this._state.player, this._state.balanceSnapshot, this._state.chapter);
    const walls = floor.entities
      .filter((e) =>
        e.type === 'ICE_WALL' &&
        !e.consumed &&
        manhattan(floor.player, e.pos) <= range &&
        isRevealed(floor.revealed, e.pos),
      )
      .sort((a, b) => manhattan(floor.player, a.pos) - manhattan(floor.player, b.pos));
    const focusedId = this._hud?.getFocusedEntityId();
    if (focusedId) {
      const focused = walls.find((e) => e.id === focusedId);
      if (focused) return focused;
    }
    return walls[0];
  }

  private _rebuildInputHints(): void {
    this._cachedMoveTargets = this._computeMoveTargets();
    this._cachedAttackTarget = this._computeAttackTarget();
    this._cachedAttackEntityTarget = this._computeAttackTargetEntity();
  }

  // ── 输入处理 ──────────────────────────────────────────

  private _onMove(dir: Direction, tutorialBypass = false): void {
    const ap = this._state?.floorState.ap ?? -1;
    const turn = this._state?.floorState.turn ?? -1;
    const status = this._state?.status ?? 'null';
    const fsStatus = this._state?.floorState.status ?? 'null';
    perfMark('tap.move', perfNow(), `dir=${dir} busy=${this._busy} ap=${ap} turn=${turn} st=${status}/${fsStatus}`);
    if (this._busy || !this._state) return;
    if (!tutorialBypass && this._isTutorialBlocked('MOVE')) return;
    const freeMove = (this._runtime?.profession.rangerFreeMoveSteps ?? 0) > 0;
    const result = applyMove(this._state, dir, freeMove ? { freeMove: true } : undefined);
    if (result.events.length === 0) {
      // 移动失败：给玩家明确反馈，并触发"是否卡死"检查。
      // 注意：实际 MOVE 成本会被减速 debuff/沙坑/靴子调整，仅靠 `apNow < AP_COST.MOVE`
      // 判 AP 不足会误报。改用 4 方向 dryRun 结果区分"全无路可走"和"单方向阻塞"。
      const apNow = this._state.floorState.ap;
      const noViableDir = this._cachedMoveTargets.length === 0;
      const reason = noViableDir ? `无路可走(ap=${apNow})` : '方向阻塞';
      perfMark('tap.move.blocked', perfNow(), reason);
      // 计算当前实际移动消耗（含减速惩罚，不含靴子首次免费特例）
      const moveCost = getBalancedActionCost(this._state.balanceSnapshot, this._state.chapter, 'MOVE');
      const slowPenalty = (this._state.floorState.playerMoveApPenaltyRounds ?? 0) > 0 ? 1 : 0;
      const effectiveCost = freeMove ? 0 : moveCost + slowPenalty;
      if (noViableDir) {
        // 4 方向全 noop：可能是 AP 不够（含 debuff 推高成本）、全被怪/石头/边界堵死。
        this._toast?.toast(apNow < effectiveCost ? `行动力不足（剩余 ${apNow}，移动需要 ${effectiveCost}）` : '无路可走');
      } else if (!freeMove && apNow < effectiveCost) {
        // 某些方向靠靴子首次免费通过了 dryRun，但此方向有实体阻挡且 AP 实际不足。
        this._toast?.toast(`行动力不足（剩余 ${apNow}，移动需要 ${effectiveCost}）`);
      } else {
        this._toast?.toast(freeMove ? '该方向无法移动（收招步）' : '该方向无法移动');
      }
      void this._maybeAutoEndTurn();
      return;
    }
    void this._apply(result);
  }

  private _onAttack(tutorialBypass = false): void {
    perfMark('tap.attack', perfNow(), `busy=${this._busy}`);
    if (this._busy || !this._state) return;
    if (!tutorialBypass && this._isTutorialBlocked('ATTACK')) return;
    const target = this._cachedAttackTarget;
    if (target) {
      this._hud?.focusMonster(target.id);
      this._attack(target.id);
      return;
    }
    const wall = this._cachedAttackEntityTarget;
    if (wall) {
      this._attackIceWall(wall.id);
      return;
    }
    this._toast?.toast('附近没有目标');
    void this._maybeAutoEndTurn();
  }

  private _onTapCell(coord: Coord): void {
    if (!this._state) return;
    if (this._busy) {
      const playerPos = this._state.floorState.player;
      if (coord.x === playerPos.x && coord.y === playerPos.y) {
        this._pendingInteract = true;
      }
      return;
    }
    if (this._isTutorialBlocked('TAP_CELL', coord)) return;

    const floor = this._state.floorState;
    const cellRevealed = isRevealed(floor.revealed, coord);

    // 点已揭示格上的物体：进入选中态，刷新左上角目标卡；不直接攻击/互动。
    // 教学步骤若要求「点击怪物普攻」，仍保持点怪即攻击，避免卡引导。
    if (cellRevealed) {
      const monster = floor.monsters.find(
        (m) => m.aiState !== 'DEAD' && m.pos.x === coord.x && m.pos.y === coord.y,
      );
      if (monster) {
        this._hud?.focusMonster(monster.id);
        const step = this._tutorialGuide?.isActive(this._state)
          ? this._tutorialGuide.currentStep()
          : null;
        const tutorialTapAttacks = !!(step?.completeOnAttackTargetId || step?.completeOnKillMonsterId);
        if (tutorialTapAttacks) {
          this._attack(monster.id, true);
          return;
        }
        this._hud?.refresh(this._state);
        this._rebuildInputHints();
        this._map?.showAttackTarget(this._cachedAttackTarget?.pos ?? this._cachedAttackEntityTarget?.pos ?? null);
        return;
      }

      const entity = floor.entities.find(
        (e) => !e.consumed && e.pos.x === coord.x && e.pos.y === coord.y,
      );
      if (entity) {
        this._hud?.focusEntity(entity.id);
        this._hud?.refresh(this._state);
        this._rebuildInputHints();
        this._map?.showAttackTarget(this._cachedAttackTarget?.pos ?? this._cachedAttackEntityTarget?.pos ?? null);
        return;
      }
    }

    // 点空地 / 迷雾：朝目标方向走一步，不打断已有选中信息。
    const playerPos = floor.player;
    const dx = coord.x - playerPos.x;
    const dy = coord.y - playerPos.y;
    if (dx === 0 && dy === 0) return;
    let dir: Direction;
    if (Math.abs(dx) >= Math.abs(dy)) {
      dir = dx > 0 ? 'RIGHT' : 'LEFT';
    } else {
      dir = dy > 0 ? 'DOWN' : 'UP';
    }
    this._onMove(dir, true);
  }

  private _attack(monsterId: string, tutorialBypass = false): void {
    if (!this._state) return;
    if (!tutorialBypass && this._isTutorialBlocked('ATTACK')) return;
    this._hud?.focusMonster(monsterId);
    const beforeTarget = this._state.floorState.monsters.find((entry) => entry.id === monsterId);
    const persistent = this._runtime && this._floorFlow?.state
      ? applyPersistentAttack(this._runtime, monsterId, this._floorFlow.state.profile, this._selectedChargeAp)
      : null;
    if (persistent) {
      this._runtime = persistent.runtime;
      this._floorFlow?.updateRuntime(this._runtime);
    }
    const result = persistent?.result ?? playerAttack(this._state, monsterId);
    if (result.events.length === 0) {
      this._toast?.toast('目标不在攻击范围内或 AP 不足');
      void this._maybeAutoEndTurn();
      return;
    }
    this._selectedChargeAp = 0;
    const afterTarget = result.state.floorState.monsters.find((entry) => entry.id === monsterId);
    if (beforeTarget && afterTarget) {
      const gained = describeNewMonsterStatuses(beforeTarget, afterTarget);
      if (gained) {
        this._log?.push(result.state.floorState.turn, 'PLAYER_ACT', `命痕：${gained}`);
      }
    }
    void this._apply(result);
  }

  private _onCharge(tutorialBypass = false): void {
    // 蓄力只改本地选档 UI，不走 _apply；怪物回合动画占 _busy 时仍应可调，
    // 否则第 10 层等多怪回放期间会表现为「蓄力也延迟」。
    if (!this._state || !this._runtime || this._runtime.config.professionId !== 'WARRIOR') return;
    if (!tutorialBypass && this._isTutorialBlocked('CHARGE')) return;
    const max = this._maxSelectableChargeAp();
    if (max <= 0) {
      this._selectedChargeAp = 0;
      this._refreshPersistentHud();
      this._toast?.toast('AP不足，无法蓄力');
      return;
    }
    this._selectedChargeAp = (this._selectedChargeAp + 1) % (max + 1);
    this._refreshPersistentHud();
    this._syncTutorialGuide([], {
      selectedChargeAp: this._selectedChargeAp,
      spiritBurstActive: !!this._runtime?.profession.spiritBurstActive,
    });
  }

  private async _onProfessionMechanic(): Promise<void> {
    if (!this._runtime || !this._toast) return;
    const professionId = this._runtime.config.professionId;
    if (professionId === 'WARRIOR') {
      this._onCharge();
      return;
    }
    if (this._busy) return;
    if (professionId === 'ARCHER') {
      const aim = this._runtime.profession.archerAimLevel;
      await this._toast.showConfirm(
        `瞄准 ${aim}/3\n回合结束未移动 +1；主动移动 -1\n攻击不消耗瞄准\n满层：最终伤害+30%、护甲穿透+20%、射程+1`,
        [{ label: '知道了', value: 'ok' }],
      );
      return;
    }
    if (professionId === 'RANGER') {
      const combo = this._runtime.profession.rangerCombo;
      if (combo < 3) {
        await this._toast.showConfirm(
          `连击 ${combo}\n移动与攻击交替叠加连击\n达到 3 连击可主动收招\n疾收·伤：下次攻击+25%\n疾收·步：免费移动 1 格`,
          [{ label: '知道了', value: 'ok' }],
        );
        return;
      }
      const choice = await this._toast.showConfirm(
        `连击 ${combo} · 选择基础收招`,
        [
          { label: '疾收·伤（下次攻击+25%）', value: 'QUICK_DAMAGE' },
          { label: '疾收·步（免费移动1格）', value: 'QUICK_MOVE' },
          { label: '取消', value: 'cancel' },
        ],
      );
      if (choice !== 'QUICK_DAMAGE' && choice !== 'QUICK_MOVE') return;
      const mastery = this._floorFlow?.state.profile.professions.RANGER.level ?? 1;
      try {
        const finish = commitRangerFinisher(this._runtime, choice, mastery);
        if (!finish.valid) {
          this._toast.toast(finish.reason === 'COMBO_NOT_ENOUGH' ? '连击不足' : '收招不可用');
          return;
        }
        this._runtime = finish.state as PersistentExpeditionRuntime;
        this._floorFlow?.updateRuntime(this._runtime);
        this._refreshPersistentHud();
        this._toast.toastImportant(
          choice === 'QUICK_DAMAGE' ? '疾收·伤已就绪' : '疾收·步：请移动 1 格',
          1400,
        );
        this._queuePersistentSave(300);
      } catch (err) {
        this._toast.toast(`收招失败：${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  private _onSpiritBurst(tutorialBypass = false): void {
    if (this._busy || !this._runtime || !this._floorFlow) return;
    if (!tutorialBypass && this._isTutorialBlocked('SPIRIT_BURST')) return;
    try {
      this._runtime = activateSpiritBurst(this._runtime);
      this._state = this._runtime.battleState.expedition;
      this._floorFlow.updateRuntime(this._runtime);
      this._rebuildInputHints();
      this._refreshAll();
      this._toast?.toastImportant('灵气爆发！本次强化已生效', 1600);
      this._queuePersistentSave(300);
      this._syncTutorialGuide([], {
        selectedChargeAp: this._selectedChargeAp,
        spiritBurstActive: !!this._runtime?.profession.spiritBurstActive,
      });
    } catch (err) {
      this._toast?.toast(err instanceof Error && err.message === 'SPIRIT_NOT_FULL' ? '灵气未满' : `灵气爆发失败：${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** 攻击冰墙（FrostGiant 专属机制，→ attackIceWall）。 */
  private _attackIceWall(entityId: string, tutorialBypass = false): void {
    if (!this._state) return;
    if (!tutorialBypass && this._isTutorialBlocked('ATTACK')) return;
    const result = attackIceWall(this._state, entityId);
    if (result.events.length === 0) {
      this._toast?.toast('目标不在攻击范围内或 AP 不足');
      void this._maybeAutoEndTurn();
      return;
    }
    void this._apply(result);
  }

  private _onInteract(tutorialBypass = false): void {
    perfMark('tap.interact', perfNow(), `busy=${this._busy}`);
    if (!this._state) return;
    // 开出口/动画期间连点传门：排队到 _apply 结束再执行，避免第一次被 _busy 静默吞掉。
    if (this._busy) {
      this._pendingInteract = true;
      return;
    }
    if (!tutorialBypass && this._isTutorialBlocked('INTERACT')) return;
    const floor = this._state.floorState;
    // 多实体共格时按"可交互优先"挑选：流沙巨蝎冒出会在落点留永久 SAND_PIT，
    // Boss 死后 spawnPortal 把 PORTAL 加到同一格，SAND_PIT 先入数组导致 find 命中
    // SAND_PIT → 落到 else 分支死锁玩家。LAVA_TILE/SHATTERED_ICE 等覆盖物同理。
    const INTERACTABLE = new Set(['BLACKSMITH', 'PORTAL', 'EXIT', 'CHEST', 'GUNPOWDER_BARREL', 'BLAST_TARGET', 'IDOL', 'HOT_SPRING', 'ALTAR']);
    const here = floor.entities.filter(
      (e) => !e.consumed && e.pos.x === floor.player.x && e.pos.y === floor.player.y,
    );
    // 通关门优先于同格 EXIT/祭坛残留，避免先点到出口只刷「传送门浮现」。
    const entity = here.find((e) => e.type === 'PORTAL')
      ?? here.find((e) => INTERACTABLE.has(e.type))
      ?? here[0];
    if (!entity) {
      this._toast?.toast('这里没有可交互的物品');
      void this._maybeAutoEndTurn();
      return;
    }
    if (entity.type === 'WAVE_SPAWN_MARKER'
      || entity.id.startsWith('WAVE_SPAWN_')
      || entity.id.startsWith('WAVE_ALTAR_')) {
      this._toast?.toast('这是夜袭刷怪点，怪物会在此出现');
      void this._maybeAutoEndTurn();
      return;
    }

    // 铁匠：需要 UI 弹窗，走独立异步路径（不走 _apply）
    if (entity.type === 'BLACKSMITH') {
      void this._applyBlacksmith(entity.id);
      return;
    }

    let result: ApplyResult | null = null;
    if (entity.type === 'CHEST') result = openChest(this._state, entity.id);
    else if (entity.type === 'EXIT') result = openExit(this._state, entity.id);
    else if (entity.type === 'PORTAL') result = interactPortal(this._state, entity.id);
    else if (entity.type === 'GUNPOWDER_BARREL') result = activateGunpowderBarrel(this._state, entity.id);
    else if (entity.type === 'BLAST_TARGET') result = detonateBlastTarget(this._state, entity.id);
    else if (entity.type === 'IDOL') result = useIdol(this._state, entity.id);
    else if (entity.type === 'HOT_SPRING') result = useHotSpring(this._state, entity.id);
    else if (entity.type === 'ALTAR') result = useAltar(this._state, entity.id);
    else {
      this._toast?.toast('暂无法与此交互');
      void this._maybeAutoEndTurn();
      return;
    }

    if (result.events.length === 0) {
      if (entity.type === 'ALTAR' && this._state.persistentFloorMode && this._state.floor === 3) {
        this._toast?.toast('需先击败祭坛守卫');
      } else {
        this._toast?.toast('暂时无法交互（缺少钥匙、AP 不足或星尘不足）');
      }
      void this._maybeAutoEndTurn();
      return;
    }
    void this._apply(result);
  }

  private _onEndTurn(): void {
    perfMark('tap.endTurn', perfNow(), `busy=${this._busy}`);
    if (this._busy || !this._state) return;
    // 进入下一个怪物回合前清除上一轮的蓄力重击命中高亮（重击若触发，本回合内会重新标识）
    this._map?.clearAoeHit();
    // 清除上一轮的蓄力重击预警（红圈）：若本回合是重击回合，预警会被「实际命中」（橙圈）取代；
    // 若仍是非重击回合，预警会在本回合事件中重新计算并绘制。
    this._map?.clearAoeWarning();
    void this._apply(endTurn(this._state));
  }

  /**
   * 铁匠弹窗流程（独立于 _apply，无需 _afterApply）：
   * 显示铁匠 UI → 玩家在弹窗内完成强化操作（回调直接更新 _state）→ 关闭后刷新 HUD。
   */
  private async _applyBlacksmith(entityId: string): Promise<void> {
    if (!this._state || !this._toast) return;
    console.log('[BS] enter blacksmith');
    this._busy = true;
    await this._toast.showBlacksmith(
      this._state.player,
      (slot) => {
        if (!this._state) return null;
        const tUp = perfNow();
        const r = upgradeEquip(this._state, entityId, slot);
        if (r.events.length === 0) {
          console.log('[BS] upgrade noop slot=', slot);
          return null;
        }
        this._state = r.state;
        const t1 = perfNow();
        this._rebuildInputHints();
        const t2 = perfNow();
        this._refreshAll();
        const t3 = perfNow();
        void this._playEvents(r.events);
        const t4 = perfNow();
        console.log('[BS] upgrade ok slot=', slot,
          'hints=', (t2 - t1).toFixed(1) + 'ms',
          'refreshAll=', (t3 - t2).toFixed(1) + 'ms',
          'playEvents(fire)=', (t4 - t3).toFixed(1) + 'ms',
          'total=', (t4 - tUp).toFixed(1) + 'ms');
        return this._state.player;
      },
    );
    console.log('[BS] popup closed, releasing busy');
    this._rebuildInputHints();
    this._refreshAll();
    this._busy = false;
  }

  // ── 应用结果 / 事件回放 / 被动触发 ────────────────────

  private async _apply(result: ApplyResult): Promise<void> {
    if (!this._state) return;
    const t0 = perfNow();
    this._busy = true;
    let spawnedPortalThisApply = false;

    try {
    // 传门通关会把 runtime 标 CLEAR，此后 save() 会 no-op。必须在 applyPersistent 前
    // 排空 ACTIVE 存档，否则真机高 RTT 下 settle 与后台 save 抢写。
    if (
      this._runtime?.status === 'ACTIVE'
      && this._floorFlow
      && this._isPortalClearResult(result)
    ) {
      this._runtime = syncRuntimeFromExpedition(this._runtime, this._state);
      this._floorFlow.updateRuntime(this._runtime);
      await this._prepareCloudSettlement();
    }

    if (this._runtime && this._floorFlow) {
      const persistent = applyPersistentBattleResult(this._runtime, result);
      this._runtime = persistent.runtime;
      this._floorFlow.updateRuntime(this._runtime);
      result = persistent.result;
    }
    spawnedPortalThisApply = result.events.some((event) => event.type === 'PORTAL_SPAWNED');

    // fx 死亡退场：必须在 state 切换 + _refreshAll 之前，用旧 state 找怪物坐标，
    // 复制当前 OccupantArt 画面成临时节点；refresh 把原节点隐藏后，临时节点继续飘走。
    this._spawnKillFloaters(this._state, result.events);

    this._state = result.state;
    this._rebuildInputHints();
    const tRefresh = perfNow();
    this._refreshAll();
    perfMark('apply.refreshAll', tRefresh, `events=${result.events.length}`);

    // 移动动画：_refreshAll 已把单位刷到终点，先藏终点真身，待幽灵滑到位后还原。
    // 仅隐藏已揭露格：迷雾终点本就不画 OccupantArt，若仍写入 _hiddenOccupantCellKeys，
    // 幽灵清理时又因「未揭露」跳过恢复，会永久泄漏（战士重击击退进雾 → 怪物图标消失）。
    const finalMoveTargets = new Map<string, Coord>();
    for (const ev of result.events) {
      if (ev.type === 'MOVE') finalMoveTargets.set(ev.entityId, ev.to);
    }
    for (const [entityId, to] of finalMoveTargets) {
      if (!this._moveGhosts.has(entityId)) continue;
      const toRevealed = this._state.floorState.revealed[to.y]?.[to.x] ?? false;
      if (toRevealed) this._map?.setOccupantVisible(to, false);
      const movedBoss = this._state.floorState.monsters.find((monster) => monster.id === entityId && Boolean(monster.bossId));
      if (movedBoss) this._map?.setBossIconVisible(false);
    }

    const tEvents = perfNow();
    await this._playEvents(result.events);
    perfMark('apply.events', tEvents);
    this._syncTutorialGuide(result.events);

    const tAfter = perfNow();
    const hadPortalBeforeAfter = Boolean(
      this._state?.floorState.entities.some((entity) => entity.type === 'PORTAL'),
    );
    await this._afterApply();
    if (
      !hadPortalBeforeAfter
      && this._state?.floorState.entities.some((entity) => entity.type === 'PORTAL' && !entity.consumed)
    ) {
      spawnedPortalThisApply = true;
    }
    perfMark('apply.afterApply', tAfter);
    if (this._runtime?.status === 'ACTIVE') {
      this._queuePersistentSave();
    }

    } catch (err) {
      // 任何 _apply 内部抛错都必须保证 _busy 被释放，否则后续所有输入会被永久拦截
      // （表现为玩家"卡住"）。把错误丢给 console，UI 由调用方下次 refresh 修正。
      console.error('[PVE] _apply error:', err);
    } finally {
      this._busy = false;
      perfMark('apply.total', t0, `events=${result.events.length}`);
    }

    // 刚刷出通关门时丢弃排队互动：否则「开门/目标完成」动画期间的连点会立刻踏门通关，
    // 剥夺继续探索的选择；通关门必须由玩家再点一次「互动」确认。
    if (
      this._pendingInteract
      && !spawnedPortalThisApply
      && !this._handlingFloorClear
      && this._runtime?.status === 'ACTIVE'
      && this._state?.floorState.status === 'EXPLORING'
    ) {
      this._pendingInteract = false;
      this._onInteract(true);
      return;
    }
    this._pendingInteract = false;
    void this._maybeAutoEndTurn();
  }

  /** 原始交互结果是否为「踏入传送门通关」（尚未经 persistent 桥接改写）。 */
  private _isPortalClearResult(result: ApplyResult): boolean {
    return result.events.some((event) => event.type === 'FLOOR_CLEARED')
      && result.state.floorState.entities.some((entity) => entity.type === 'PORTAL' && entity.consumed);
  }

  /**
   * 智能自动结束回合（AC-3 UX）：
   * - AP 不跨回合累加，"主动结束"对玩家无收益
   * - AP=0 / AP=1 但无可用 1-AP 动作（无邻近怪 + 不在交互格上）都视为"卡死"
   * - 卡死时延迟 700ms 让玩家看完反馈，再衔接怪物回合
   *
   * 保留"结束回合"按钮：玩家仍可主动提前结束（如 Boss 战决策需求）。
   */
  private _maybeAutoEndTurn(): void {
    if (this._busy) { perfMark('autoEndTurn.skip', perfNow(), 'busy'); return; }
    if (!this._state) { perfMark('autoEndTurn.skip', perfNow(), 'no-state'); return; }
    if (this._state.status !== 'ACTIVE') { perfMark('autoEndTurn.skip', perfNow(), `st=${this._state.status}`); return; }
    if (this._state.floorState.status !== 'EXPLORING') { perfMark('autoEndTurn.skip', perfNow(), `fs=${this._state.floorState.status}`); return; }
    if (this._hasViableActionWithCurrentAp()) { perfMark('autoEndTurn.skip', perfNow(), `ap=${this._state.floorState.ap} viable`); return; }
    perfMark('autoEndTurn.trigger', perfNow(), `ap=${this._state.floorState.ap}`);
    // AP 已无可行动作：直接结束回合（不加延迟，toast 已由调用方显示）
    this._onEndTurn();
  }

  /**
   * 判断玩家当前 AP 是否还能做有意义的动作（保留玩家选择权，避免强制结束回合）：
   * - AP ≥ MOVE_COST：dryRun 4 方向，至少一个方向 applyMove 产生 events → 有路可走
   *   （2026-06-11 修复：原来直接 `ap >= MOVE_COST → true`，玩家被怪/石块/边界包围时
   *   仍认为可走，导致 _maybeAutoEndTurn 永不触发，玩家陷入死循环点击。`applyMove`
   *   为纯函数无副作用，4 次试探成本极低）
   * - AP ≥ 1：邻近有活怪可攻击 / 或站在未消耗的实体格上可交互
   * 全否 → 视作"卡死"，触发自动结束。
   */
  private _hasViableActionWithCurrentAp(): boolean {
    if (!this._state) return false;
    const fs = this._state.floorState;
    const ap = fs.ap;

    // 移动可行：AP 够 + 至少一个方向有合法落点（dryRun 已过滤怪/石/边界）。
    if (ap >= getBalancedActionCost(this._state.balanceSnapshot, this._state.chapter, 'MOVE') && this._cachedMoveTargets.length > 0) return true;

    // 攻击可行：AP 够 + 范围内、已揭示区域有目标（_computeAttackTarget 已限定）。
    if (ap >= getBalancedActionCost(this._state.balanceSnapshot, this._state.chapter, 'ATTACK') && (this._cachedAttackTarget || this._cachedAttackEntityTarget)) {
      return true;
    }

    // 交互可行：对脚下的可交互实体真正 dry-run 一遍对应 core 函数，events 非空才算可行。
    // 不能只判"站在未消耗格"——会把"站在 EXIT 但没钥匙 / 站在 CHEST 但金币不足"也算成可交互，
    // 让 _maybeAutoEndTurn 永不触发，玩家陷入「点交互→缺钥匙→点交互」死循环。
    // 铁匠不消耗 AP（弹窗式），只要站上就一定有 UI 可用，单独允许。
    const interactable = fs.entities.find(
      (e) =>
        !e.consumed &&
        e.pos.x === fs.player.x &&
        e.pos.y === fs.player.y &&
        e.type === 'PORTAL',
    ) ?? fs.entities.find(
      (e) =>
        !e.consumed &&
        e.pos.x === fs.player.x &&
        e.pos.y === fs.player.y &&
        (e.type === 'CHEST' ||
          e.type === 'EXIT' ||
          e.type === 'GUNPOWDER_BARREL' ||
          e.type === 'BLAST_TARGET' ||
          e.type === 'IDOL' ||
          e.type === 'HOT_SPRING' ||
          e.type === 'ALTAR' ||
          e.type === 'BLACKSMITH'),
    );
    if (interactable) {
      if (interactable.type === 'BLACKSMITH') return true;
      let probe: ApplyResult | null = null;
      if (interactable.type === 'CHEST') probe = openChest(this._state, interactable.id);
      else if (interactable.type === 'EXIT') probe = openExit(this._state, interactable.id);
      else if (interactable.type === 'PORTAL') probe = interactPortal(this._state, interactable.id);
      else if (interactable.type === 'GUNPOWDER_BARREL') probe = activateGunpowderBarrel(this._state, interactable.id);
      else if (interactable.type === 'BLAST_TARGET') probe = detonateBlastTarget(this._state, interactable.id);
      else if (interactable.type === 'IDOL') probe = useIdol(this._state, interactable.id);
      else if (interactable.type === 'HOT_SPRING') probe = useHotSpring(this._state, interactable.id);
      else if (interactable.type === 'ALTAR') probe = useAltar(this._state, interactable.id);
      if (probe && probe.events.length > 0) return true;
    }

    return false;
  }

  /**
   * 退场 fx：扫所有"对象消失"事件，refresh 之前克隆当前画面 → fire-and-forget 退场动画 → destroy。
   * 必须在 _refreshAll 之前调用（refresh 会把消失的目标节点 active=false / spriteFrame=null）。
   *
   * - KILL：怪物 OccupantArt → float（上飘 + 淡出）
   * - OPEN_CHEST：宝箱 EntityArt → shake + pop（开箱仪式感）
   * - ROCK_DESTROYED：石块 EntityArt → float（碎裂上飘）
   */
  private _spawnKillFloaters(oldState: ExpeditionState, events: PveEvent[]): void {
    if (!this._map) return;
    // 强制清理上一轮残留的 lunge / 投射物 ghost：tween 被打断时（快速连点 / 状态突变）
    // 自带的 .call(cleanup) 不会执行，会留下 ghost 节点 + 永久隐藏的攻击者格（真机实测玩家"消失"）。
    this._clearAllAttackLunges();
    const map = this._map;
    // 冰霜巨人冲锋：_refreshAll 前藏掉终点格 OccupantArt + 锁定 boss 大图标位置。
    // 否则 refresh 会把 boss 真身和大图标都跳到终点，玩家先看到鬼影再看到滑动。
    // 后续在 _playFxFor(CHARGE_EXECUTED) 用 tween 平滑滑动并震屏。
    for (const ev of events) {
      if (ev.type === 'CHARGE_EXECUTED' && (ev.from.x !== ev.to.x || ev.from.y !== ev.to.y)) {
        map.setOccupantVisible(ev.to, false);
        this._attackLungeHidden.set(`charge:${ev.to.x},${ev.to.y}`, ev.to);
        map.setBossIconLocked(true);
      }
    }
    for (const ev of events) {
      if (ev.type === 'MOVE') continue;
      if (ev.type === 'KILL') {
        const target = oldState.floorState.monsters.find((m) => m.id === ev.monsterId);
        if (!target) continue;
        const floater = map.cloneOccupantForFx(target.pos);
        if (floater) {
          // 挂到场景根而非 unit cell：unit cell 会随摄像机平移，导致浮动节点跟着漂移
          const wp = map.getCellWorldPosition(target.pos);
          floater.setParent(this.node);
          floater.setPosition(wp.x, wp.y, 0);
          void Effects.float(floater, { duration: 0.4 }).then(() => floater.destroy());
        }
      } else if (ev.type === 'OPEN_CHEST') {
        const entity = oldState.floorState.entities.find((e) => e.id === ev.entityId);
        if (!entity) continue;
        const floater = map.cloneEntityForFx(entity.pos);
        if (!floater) continue;
        const wp = map.getCellWorldPosition(entity.pos);
        floater.setParent(this.node);
        floater.setPosition(wp.x, wp.y, 0);
        // 宝箱：轻抖后淡出，去掉 pop 减少动画链耗时
        void (async () => {
          await Effects.shake(floater, { duration: 0.2, strength: 0.8 });
          await Effects.fade(floater, 0, { duration: 0.25 });
          floater.destroy();
        })();
      } else if (ev.type === 'GUNPOWDER_BARREL_ACTIVATED' || ev.type === 'BLAST_TARGET_DETONATED') {
        const entity = oldState.floorState.entities.find((e) => e.id === ev.entityId);
        if (!entity) continue;
        const floater = map.cloneEntityForFx(entity.pos);
        if (!floater) continue;
        const wp = map.getCellWorldPosition(entity.pos);
        floater.setParent(this.node);
        floater.setPosition(wp.x, wp.y, 0);
        void Effects.fade(floater, 0, { duration: ev.type === 'BLAST_TARGET_DETONATED' ? 0.45 : 0.25 })
          .then(() => floater.destroy());
      } else if (ev.type === 'ROCK_DESTROYED') {
        const entity = oldState.floorState.entities.find((e) => e.id === ev.entityId);
        if (!entity) continue;
        const floater = map.cloneEntityForFx(entity.pos);
        if (floater) {
          const wp = map.getCellWorldPosition(entity.pos);
          floater.setParent(this.node);
          floater.setPosition(wp.x, wp.y, 0);
          void Effects.float(floater, { duration: 0.35 }).then(() => floater.destroy());
        }
      }
    }
    this._registerMoveGhosts(oldState, events);
  }

  /**
   * 为单个事件触发 fx 程序动画（fire-and-forget，不 await，不阻塞 _playEvents 主循环）。
   *
   * - ATTACK：走 `_playAttackFx`（可 await）；游侠远程射箭，其余职业冲脸光剑；怪物远程仍射箭
   * - PLAYER_DAMAGED：玩家受击 → flash 红 + damageNumber（去掉 hit shake 与 cameraShake，根除偏移与卡顿）
   * - KILL：怪物死亡 → float + fade（轻量退场提示，避免被回放主循环阻塞）
   *
   * 节点丢失（grid 未初始化 / EntityArt 缺失）时静默跳过，确保 fx 失败不影响主流程。
   */
  private async _playAttackFx(ev: Extract<PveEvent, { type: 'ATTACK' }>): Promise<void> {
    if (!this._state || !this._map) return;
    // 同批撞碎碰撞已合并播放过，跳过后续 COLLISION ATTACK，避免再播远程弹道。
    if (ev.cause === 'COLLISION' && this._consumedCollisionAttacks.has(ev)) return;
    if (ev.cause === 'COLLISION') {
      await this._playCollisionImpactFx(ev);
      return;
    }
    const target = this._state.floorState.monsters.find((m) => m.id === ev.targetId);
    if (!target) return;
    const playerPos = this._state.floorState.player;
    // 受击反应位移后最终距离常 ≥2：必须用受击格，否则近战会误播远程弹道。
    const hitPos = resolveAttackHitPos(this._playbackEvents, ev.targetId, target.pos) ?? target.pos;
    const dist = manhattan(playerPos, hitPos);
    // 同批有击退/逃跑 MOVE 时，受击格 OccupantArt 已空（真身在终点且被藏），优先打在 MOVE ghost 上。
    const targetNode = this._moveGhosts.get(ev.targetId)?.ghost
      ?? this._map.getOccupantArtAt(hitPos)
      ?? this._map.getOccupantArtAt(target.pos);
    const onContact = () => {
      if (targetNode?.isValid) {
        void Effects.flash(targetNode, { color: new Color(255, 80, 80, 255) });
        if (ev.damage > 0) {
          playSfx(SFX_IDS.ATTACK_HIT);
          void Effects.damageNumber(targetNode, ev.damage);
        }
      }
    };
    // 只有游侠（ARCHER）用射箭；战士/潜行者即使射程>1 也走冲脸光剑。
    const useRangedArrow = this._runtime?.config.professionId === 'ARCHER' && dist > 1;
    if (useRangedArrow) {
      await this._playRangedShot(playerPos, hitPos, onContact);
      return;
    }
    const armed = !!this._state.player.equipment.WEAPON;
    if (armed) await this._playMeleeSlash(playerPos, hitPos, onContact);
    else await this._playMeleeLunge(playerPos, hitPos, onContact);
  }

  /**
   * 战士蓄力撞碎：主目标与被撞目标同时抖动掉血，不从玩家位置发射弹道。
   */
  private async _playCollisionImpactFx(
    first: Extract<PveEvent, { type: 'ATTACK' }>,
  ): Promise<void> {
    if (!this._state || !this._map) return;
    const batch: Array<Extract<PveEvent, { type: 'ATTACK' }>> = [first];
    const idx = this._playbackEvents.indexOf(first);
    if (idx >= 0) {
      for (let i = idx + 1; i < this._playbackEvents.length; i += 1) {
        const next = this._playbackEvents[i];
        if (!next || next.type !== 'ATTACK' || next.cause !== 'COLLISION') break;
        batch.push(next);
        this._consumedCollisionAttacks.add(next);
      }
    }
    this._consumedCollisionAttacks.add(first);

    playSfx(SFX_IDS.ATTACK_HIT);
    void Effects.cameraPunch({ strength: 0.55 });
    const tasks: Array<Promise<unknown>> = [];
    for (const hit of batch) {
      const monster = this._state.floorState.monsters.find((m) => m.id === hit.targetId);
      if (!monster) continue;
      const pos = resolveAttackHitPos(this._playbackEvents, hit.targetId, monster.pos) ?? monster.pos;
      const node = this._moveGhosts.get(hit.targetId)?.ghost
        ?? this._map.getOccupantArtAt(pos)
        ?? this._map.getOccupantArtAt(monster.pos);
      if (!node?.isValid) continue;
      tasks.push(Effects.hit(node, { strength: 1.15, duration: 0.28 }));
      if (hit.damage > 0) void Effects.damageNumber(node, hit.damage);
    }
    if (tasks.length > 0) await Promise.all(tasks);
  }

  private _playFxFor(ev: PveEvent): void {
    if (!this._state || !this._map) return;
    switch (ev.type) {
      case 'ATTACK':
        // 由 _playEvents 显式 await _playAttackFx，避免与受击后 MOVE 抢序。
        break;
      case 'PLAYER_DAMAGED': {
        const playerPos = this._state.floorState.player;
        const playerNode = this._map.getOccupantArtAt(playerPos);
        const onContact = () => {
          if (playerNode) {
            void Effects.flash(playerNode, { color: new Color(255, 80, 80, 255) });
            if (ev.damage > 0) {
              playSfx(SFX_IDS.DAMAGE_POP);
              void Effects.damageNumber(playerNode, ev.damage);
            }
          }
        };
        // 怪物来源：距离 1 走近战 lunge，距离 ≥2 走远程投射物；非怪物来源（沙暴/灼烧/陷阱）只 flash。
        const src = ev.sourceId
          ? this._state.floorState.monsters.find((m) => m.id === ev.sourceId)
          : undefined;
        if (src) {
          const dist = Math.abs(src.pos.x - playerPos.x) + Math.abs(src.pos.y - playerPos.y);
          if (dist === 1) void this._playMeleeLunge(src.pos, playerPos, onContact);
          else void this._playRangedShot(src.pos, playerPos, onContact);
        } else {
          onContact();
        }
        break;
      }
      case 'HOT_SPRING_HEAL': {
        playSfx(SFX_IDS.REWARD_GET);
        const node = this._map.getOccupantArtAt(this._state.floorState.player);
        if (node) {
          if (ev.healed > 0) void Effects.healNumber(node, ev.healed);
          void Effects.pop(node);
        }
        break;
      }
      case 'IDOL_BLESSING': {
        playSfx(SFX_IDS.REWARD_GET);
        const node = this._map.getOccupantArtAt(this._state.floorState.player);
        if (node) void Effects.buffGain(node);
        break;
      }
      case 'BOSS_ENRAGED': {
        void Effects.cameraPunch({ strength: 1.4 });
        break;
      }
      // 哥布林酋长 / 冰霜巨人 重击实际命中：橙圈出现的瞬间叠加短促全屏震屏（强反馈）。
      // strength 1.5 / duration 0.25 比原始 2.0/0.45 + cameraPunch 双效叠加显著更短，
      // 配合已优化的事件主循环（toast 不阻塞 / 战报 layout 合批 / 元进度防抖），不会卡顿。
      case 'HEAVY_STRIKE_RESOLVED':
      case 'FROST_HEAVY_STRIKE_RESOLVED':
        void Effects.cameraShake({ strength: 3.0, duration: 0.45 });
        break;
      // 持续伤害 tick：改 flash 替代 hit，避免每回合连续位置抖动累积偏移
      case 'BURN_TICK':
      case 'POISON_TICK': {
        const node = this._map.getOccupantArtAt(this._state.floorState.player);
        if (node) {
          void Effects.flash(node, { color: new Color(255, 100, 80, 255) });
          if (ev.damage > 0) void Effects.damageNumber(node, ev.damage);
        }
        break;
      }
      // 灼烧爆裂：去掉震屏，只靠 toast + 伤害数字反馈
      case 'BURN_BURST':
        break;
      // 命运守卫 5×5 命运爆炸：终极 AOE，最强级别震屏
      case 'DESTINY_5X5_EXPLODED':
        void Effects.cameraShake({ strength: 3.5, duration: 0.55 });
        break;
      // ── Debuff 上身：玩家位置 flash 提示（duration+times 拉长，让颜色停留更久） ──
      case 'POISON_APPLIED':
      case 'FIRE_BURN_APPLIED':
      case 'MOVE_PENALTY_APPLIED': {
        const node = this._map.getOccupantArtAt(this._state.floorState.player);
        if (node) {
          const color = ev.type === 'POISON_APPLIED'
            ? new Color(140, 220, 100, 255)   // 中毒：黄绿色
            : ev.type === 'FIRE_BURN_APPLIED'
              ? new Color(255, 110, 60, 255)  // 灼烧：橙红
              : new Color(120, 180, 240, 255); // 减速：冰蓝
          void Effects.flash(node, { color, duration: 0.35 });
        }
        break;
      }
      // ── 沙暴命中玩家：flash + 飘字，不晃屏 ──
      case 'SANDSTORM_HIT': {
        const node = this._map.getOccupantArtAt(this._state.floorState.player);
        if (node) {
          void Effects.flash(node, { color: new Color(255, 180, 80, 255) });
          if (ev.damage > 0) void Effects.damageNumber(node, ev.damage);
        }
        break;
      }
      // ── 流沙巨蝎钻出：3×3 橙色预警圈展示 1.5s 后清除 + 全屏震屏 + 出土 pop ──
      case 'BOSS_EMERGED': {
        const node = this._map.getOccupantArtAt(ev.pos);
        if (node) void Effects.pop(node);
        // 沙坑 + 周边 8 格 = 9 格 AOE 预警（设计指定的实际伤害范围）
        const damageCells: Coord[] = [];
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            damageCells.push({ x: ev.pos.x + dx, y: ev.pos.y + dy });
          }
        }
        this._map.showAoeHit(damageCells);
        void Effects.cameraShake({ strength: 3.0, duration: 0.45 });
        setTimeout(() => this._map?.clearAoeHit(), 1500);
        break;
      }
      // ── 冲锋实际命中：AOE overlay 已足够，不晃屏 ──
      case 'CHARGE_EXECUTED':
        break;
      // ── 熔核爆裂（熔岩领主大招）：强力全屏震屏 ──
      case 'ERUPTION_RESOLVED':
        void Effects.cameraShake({ strength: 3.0, duration: 0.45 });
        break;
      // ── 增援召唤新怪：在新怪位置 pop 弹出 ──
      case 'MONSTER_SPAWNED': {
        // MONSTER_SPAWNED 事件在 state 更新后立即触发，新怪应该已在 state.monsters 里
        const target = this._state.floorState.monsters.find((m) => m.id === ev.monsterId);
        const node = target ? this._map.getOccupantArtAt(target.pos) : null;
        if (node) void Effects.pop(node);
        if (target?.bossId) playSfx(SFX_IDS.BOSS_APPEAR);
        break;
      }
      // ── 宝箱开启：无论后续 LOOT 掉落什么（金币/装备/灵气），都先响一声开启音 ──
      case 'OPEN_CHEST':
        playSfx(SFX_IDS.REWARD_GET);
        break;
      // ── 拾取奖励：装备金光、灵气紫光（金币太频繁不接） ──
      case 'LOOT': {
        if (ev.equip) {
          playSfx(SFX_IDS.REWARD_GET);
          // 装备掉落屏幕级强反馈：全屏金光；玩家 OccupantArt 缺失时仍 toast（不依赖节点）。
          this._playScreenFlash(new Color(255, 215, 90, 255), 130);
          const node = this._map.getOccupantArtAt(this._state.floorState.player);
          if (node) {
            void Effects.flash(node, { color: new Color(255, 215, 90, 255), times: 4, duration: 0.5 });
            void Effects.buffGain(node, { strength: 1.6 });
            void Effects.pop(node, { strength: 1.4 });
          }
          // toast 由 describeEvent + toastImportant 统一弹出，此处只做特效，避免双弹。
        } else if (ev.anima && ev.anima > 0) {
          playSfx(SFX_IDS.REWARD_GET);
          const node = this._map.getOccupantArtAt(this._state.floorState.player);
          if (node) void Effects.flash(node, { color: new Color(200, 130, 240, 255) });
        }
        break;
      }
      // ── 拾取钥匙：不做额外动画，钥匙图标更新已提供足够反馈 ──
      case 'PICK_KEY':
        playSfx(SFX_IDS.REWARD_GET);
        break;
      // ── 命运重写完成 ──
      case 'DESTINY_REWRITE_RESOLVED': {
        const node = this._map.getOccupantArtAt(this._state.floorState.player);
        if (node) void Effects.flash(node, { color: new Color(200, 130, 240, 255), times: 2 });
        break;
      }
      // ── 传送门生成：在 pos 处 pop 浮现 ──
      case 'PORTAL_SPAWNED': {
        // 击杀退场/异步贴图可能让 EntityArt 停在 opacity=0；先拉回可见再 pop。
        const node = this._map.getEntityArtAt(ev.pos);
        if (node?.isValid) {
          node.active = true;
          const opacity = node.getComponent(UIOpacity) || node.addComponent(UIOpacity);
          opacity.opacity = 255;
          void Effects.pop(node, { strength: 1.4 });
        }
        playSfx(SFX_IDS.DOOR_OPEN);
        break;
      }
      case 'WAVE_INCOMING': {
        playSfx(SFX_IDS.BOSS_APPEAR);
        break;
      }
      case 'GUNPOWDER_BARREL_ACTIVATED': {
        this._toast?.toast('火药桶已激活，敌人开始狂暴追击');
        playSfx(SFX_IDS.REWARD_GET);
        void Effects.cameraPunch({ strength: 0.7 });
        break;
      }
      case 'BLAST_TARGET_DETONATED': {
        this._toast?.toast('爆破完成，传送门即将出现');
        playSfx(SFX_IDS.ATTACK_HIT);
        void Effects.cameraShake({ strength: 2.2, duration: 0.55 });
        break;
      }
      // ── 通关本层：弹窗本身已提供足够反馈，不额外做全屏效果 ──
      case 'FLOOR_CLEARED':
        break;
      // ── 玩家死亡：整屏最强震 + slowMotion 收尾 ──
      case 'PLAYER_DEAD': {
        playSfx(SFX_IDS.RUN_FAILED);
        void Effects.cameraShake({ strength: 2.5, duration: 0.6 });
        Effects.slowMotion(0.3, 1.2);
        break;
      }
      // ── 玩家移动：pre-clone 幽灵滑到新格（0.15s quadOut） ──
      case 'MOVE': {
        if (ev.entityId !== 'PLAYER') break;
        playSfx(SFX_IDS.PLAYER_MOVE);
        const key = `${ev.from.x},${ev.from.y}`;
        const entry = this._moveGhosts.get(key);
        if (!entry?.ghost?.isValid) break;
        // _refreshAll 已在 _playEvents 之前完成，此处拿到的是滚动后世界坐标，
        // ghost 父节点是 Canvas 根（世界原点），local == world，方向与格子严格一致。
        const fromWp = this._map.getCellWorldPosition(ev.from);
        const toWp = this._map.getCellWorldPosition(ev.to);
        entry.ghost.setPosition(fromWp.x, fromWp.y, 0);
        tween(entry.ghost)
          .to(0.15, { position: new Vec3(toWp.x, toWp.y, 0) }, { easing: 'quadOut' })
          .call(() => this._clearMoveGhost(key))
          .start();
        break;
      }
      // ── 灼烧上身（熔岩领主专属）：橙红 flash ──
      case 'BURN_APPLIED': {
        const node = this._map.getOccupantArtAt(this._state.floorState.player);
        if (node) void Effects.flash(node, { color: new Color(255, 110, 60, 255) });
        break;
      }
      // ── 流沙巨蝎潜入地下：buildMonsterIndex 已根据 isBurrowed 过滤渲染，此处无需额外动画 ──
      case 'BOSS_BURROWED':
        break;
      // ── 祭坛使用：玩家紫色 flash（神圣仪式感） ──
      case 'ALTAR_USED': {
        playSfx(SFX_IDS.REWARD_GET);
        const node = this._map.getOccupantArtAt(this._state.floorState.player);
        if (node) void Effects.flash(node, { color: new Color(180, 100, 255, 255) });
        break;
      }
      // ── 铁匠强化成功：金色双 flash + pop（装备升级感） ──
      case 'BLACKSMITH_UPGRADE': {
        playSfx(SFX_IDS.REWARD_GET);
        const node = this._map.getOccupantArtAt(this._state.floorState.player);
        if (node) {
          void Effects.flash(node, { color: new Color(255, 215, 0, 255), times: 2 });
          void Effects.pop(node);
        }
        break;
      }
      // ── 铁匠强化失败：灰色 flash（挫败感） ──
      case 'BLACKSMITH_UPGRADE_FAIL': {
        const node = this._map.getOccupantArtAt(this._state.floorState.player);
        if (node) void Effects.flash(node, { color: new Color(130, 130, 130, 255) });
        break;
      }
      // ── 营地购买：玩家 buffGain ──
      case 'SHOP_BUY': {
        const node = this._map.getOccupantArtAt(this._state.floorState.player);
        if (node) void Effects.buffGain(node);
        break;
      }
      // ── 踩熔岩地块每回合扣血：flash 替代 hit ──
      case 'LAVA_TILE_DAMAGED': {
        const node = this._map.getOccupantArtAt(this._state.floorState.player);
        if (node) {
          void Effects.flash(node, { color: new Color(255, 110, 60, 255) });
          if (ev.damage > 0) void Effects.damageNumber(node, ev.damage);
        }
        break;
      }
      // ── 熔岩领主锁链拉近：红色锁链线（lord→玩家）展示 200ms → 玩家克隆从 from 滑到 to，链条同步淡出 ──
      case 'LAVA_CHAIN_PULL': {
        const lord = this._state.floorState.monsters.find((m) => m.bossId === 'LAVA_LORD');
        const map = this._map;
        if (!lord) {
          const node = map.getOccupantArtAt(this._state.floorState.player);
          if (node) void Effects.flash(node, { color: new Color(255, 110, 60, 255) });
          break;
        }
        const lordWp = map.getCellWorldPosition(lord.pos);
        const fromWp = map.getCellWorldPosition(ev.from);
        const toWp = map.getCellWorldPosition(ev.to);

        // 1) 克隆玩家在 ev.to 当前外观（_refreshAll 已绘制），定位到 from
        const ghost = map.cloneOccupantForFx(ev.to);
        const hideKey = `chain:${ev.to.x},${ev.to.y}`;
        map.setOccupantVisible(ev.from, false);
        if (ghost) {
          ghost.setParent(this.node);
          ghost.setPosition(fromWp.x, fromWp.y, 0);
          this._attackLungeGhosts.add(ghost);
          map.setOccupantVisible(ev.to, false);
          // 注册到 _attackLungeHidden：tween 被打断时 _clearAllAttackLunges 兜底恢复显示，
          // 防止真身永久消失（用户报告"锁链把角色UI拉没了"的根因）
          this._attackLungeHidden.set(hideKey, ev.to);
        }

        // 2) 锁链 Sprite：在 lord 和当前玩家位置之间动态拉伸。
        //    chainHeight 较小（24px ~ 1/4 格），避免被放大后链节看起来劣质；
        //    端点随玩家移动收缩，不会越过玩家身后（钩子永远落在玩家所在格中心）。
        const chainHeight = 24;
        const chainAngleDeg = Math.atan2(fromWp.y - lordWp.y, fromWp.x - lordWp.x) * 180 / Math.PI;
        const initLen = Math.hypot(fromWp.x - lordWp.x, fromWp.y - lordWp.y);

        const chain = new Node('LavaChain');
        chain.setParent(this.node);
        const chainUi = chain.addComponent(UITransform);
        chainUi.setContentSize(initLen, chainHeight);
        chainUi.setAnchorPoint(0.5, 0.5);
        chain.setPosition((lordWp.x + fromWp.x) / 2, (lordWp.y + fromWp.y) / 2, 0);
        chain.setRotationFromEuler(0, 0, chainAngleDeg);
        const chainSprite = chain.addComponent(Sprite);
        chainSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        chainSprite.type = Sprite.Type.SIMPLE;
        const cachedChain = getCachedSprite('pve/fx/lava_chain');
        if (cachedChain) {
          chainSprite.spriteFrame = cachedChain;
        } else {
          void loadUiSprite('pve/fx/lava_chain').then((sf) => {
            if (sf && chain.isValid) chainSprite.spriteFrame = sf;
          });
        }
        const chainOp = chain.addComponent(UIOpacity);
        chainOp.opacity = 255;
        this._attackLungeGhosts.add(chain);

        // 把链子终点更新到当前玩家世界坐标：实时收缩长度 + 移动中点（角度不变，玩家沿链方向被拉回）。
        const updateChainEndpoint = (curX: number, curY: number) => {
          if (!chain.isValid) return;
          const len = Math.hypot(curX - lordWp.x, curY - lordWp.y);
          chainUi.setContentSize(len, chainHeight);
          chain.setPosition((lordWp.x + curX) / 2, (lordWp.y + curY) / 2, 0);
        };

        // 3) 200ms 辨识链条 → 0.25s 拉扯滑动（链条端点同步跟随玩家） + 0.45s 淡出
        const pullMs = 250;
        setTimeout(() => {
          if (ghost?.isValid) {
            const startMs = Date.now();
            // 每帧更新链条端点跟玩家走（quadIn 缓动与 ghost tween 同步，视觉一致）
            const tickChain = () => {
              if (!chain.isValid) return;
              const elapsed = Date.now() - startMs;
              const rawT = Math.min(1, elapsed / pullMs);
              const eased = rawT * rawT; // quadIn
              const curX = fromWp.x + (toWp.x - fromWp.x) * eased;
              const curY = fromWp.y + (toWp.y - fromWp.y) * eased;
              updateChainEndpoint(curX, curY);
              if (rawT < 1) setTimeout(tickChain, 16);
            };
            tickChain();

            tween(ghost)
              .to(pullMs / 1000, { position: new Vec3(toWp.x, toWp.y, 0) }, { easing: 'quadIn' })
              .call(() => {
                this._attackLungeGhosts.delete(ghost);
                if (ghost.isValid) ghost.destroy();
                map.setOccupantVisible(ev.to, true);
                this._attackLungeHidden.delete(hideKey);
                this._refreshAll();
                const node = map.getOccupantArtAt(ev.to);
                if (node) void Effects.flash(node, { color: new Color(255, 110, 60, 255) });
              })
              .start();
          }
          if (chain.isValid) {
            tween(chainOp)
              .to(0.45, { opacity: 0 })
              .call(() => {
                this._attackLungeGhosts.delete(chain);
                if (chain.isValid) chain.destroy();
              })
              .start();
          }
        }, 200);
        // 兜底清理：Cocos tween 在 target 被外部 destroy 时会停止后续 action（包括 .call(cleanup)），
        // 真机上可能出现 ghost 残留 + 真身永久隐藏的"分身"现象。
        // 800ms 后无条件强制清理（覆盖 200ms 等待 + 250ms 位移 + 350ms 安全余量）；
        // 若 .call 已正常执行，items 已不在 set/map 里，下面全部 no-op。
        setTimeout(() => {
          if (ghost && this._attackLungeGhosts.has(ghost)) {
            this._attackLungeGhosts.delete(ghost);
            if (ghost.isValid) ghost.destroy();
          }
          if (this._attackLungeHidden.has(hideKey)) {
            this._attackLungeHidden.delete(hideKey);
            if (this._map) this._map.setOccupantVisible(ev.to, true);
            this._refreshAll();
          }
        }, 800);
        // 链条兜底（淡出 0.45s 后理论上已销毁，900ms 安全余量）
        setTimeout(() => {
          if (chain && this._attackLungeGhosts.has(chain)) {
            this._attackLungeGhosts.delete(chain);
            if (chain.isValid) chain.destroy();
          }
        }, 900);
        break;
      }
      // ── 冰霜巨人寒气叠加：玩家冰蓝 flash（2 次脉冲，让冻感持续更久） ──
      case 'CHILL_STACK_APPLIED': {
        const node = this._map.getOccupantArtAt(this._state.floorState.player);
        if (node) void Effects.flash(node, { color: new Color(120, 180, 240, 255), duration: 0.35 });
        break;
      }
      // ── 被冻结（寒气满）：双 flash 反馈，不晃屏 ──
      case 'PLAYER_FROZEN': {
        const node = this._map.getOccupantArtAt(this._state.floorState.player);
        if (node) void Effects.flash(node, { color: new Color(100, 200, 255, 255), times: 2 });
        break;
      }
      // ── 解除冻结：玩家 pop（轻松弹出感） ──
      case 'PLAYER_UNFROZEN': {
        const node = this._map.getOccupantArtAt(this._state.floorState.player);
        if (node) void Effects.pop(node);
        break;
      }
      // ── 被冰霜重击击退：flash 替代 hit，去掉震屏 ──
      case 'KNOCKBACK': {
        const node = this._map.getOccupantArtAt(this._state.floorState.player);
        if (node) void Effects.flash(node, { color: new Color(180, 220, 255, 255) });
        break;
      }
      // ── 命运守卫预言结算：去掉震屏，玩家受伤由 PLAYER_DAMAGED 的 flash 反馈 ──
      case 'PROPHECY_RESOLVED':
        break;
      // ── 命运镜像攻击玩家 ──
      case 'MIRROR_ATTACKED': {
        if (!ev.hit) break;
        const node = this._map.getOccupantArtAt(this._state.floorState.player);
        if (node) {
          void Effects.flash(node, { color: new Color(255, 80, 80, 255) });
          if (ev.damage > 0) void Effects.damageNumber(node, ev.damage);
        }
        break;
      }
      // ── 命运守卫生成镜像：在镜像格 pop ──
      case 'MIRROR_SPAWNED': {
        const node = this._map.getOccupantArtAt(ev.pos);
        if (node) void Effects.pop(node);
        break;
      }
      // ── 精英自爆：去掉震屏，伤害飘字保留 ──
      case 'ELITE_EXPLODE': {
        if (ev.damage > 0) {
          const node = this._map.getOccupantArtAt(this._state.floorState.player);
          if (node) void Effects.damageNumber(node, ev.damage);
        }
        break;
      }
      // ── 精英复活（虚空虫双生）：在原位 pop 弹出 ──
      case 'ELITE_REVIVE': {
        const target = this._state.floorState.monsters.find((m) => m.id === ev.monsterId);
        const node = target ? this._map.getOccupantArtAt(target.pos) : null;
        if (node) void Effects.pop(node, { strength: 1.2 });
        break;
      }
      // KILL：死亡退场 fx 在 _apply 中（_refreshAll 之前）已用克隆节点触发，这里不重复
      default:
        break;
    }
  }

  private async _playEvents(events: PveEvent[]): Promise<void> {
    // 跟踪"当前事件归属哪个回合"：TURN_END / AP_ROLLED 自带 turn，期间所有怪物 MOVE
    // 都视为 TURN_END 那个旧回合的尾声，让战报栏分组直观（玩家操作 T2 → 回合结束 T2
    // → 怪物追击 T2 → 新回合 T3 掷骰）。
    let logTurn = this._state?.floorState.turn ?? 1;
    // 2026-06-25：彻底去掉 toast 之间的 await delay。
    // 用户反馈"宝箱开启卡顿、怪物死亡飘字卡顿"根因：每个事件 toast 后 await delay 阻塞事件主循环，
    // 同帧并发的 fx 动画（chest fade、kill float）表现为"延后"和"卡一下"。
    // toast 本身仍保留 1.6s 自动消失 + 后到顶替前条，多条信息靠战报栏滚动阅读，不靠主循环节流。
    // 蓄力重击「实际命中」橙圈：2026-06-15 改为仅在本回合事件回放中短暂展示，
    // 回放结束即清除，不再延续到玩家下一回合（避免被误读为"还会再炸一次"的预警）。
    let heavyStrikeResolvedThisBatch = false;
    this._playbackEvents = events;
    this._consumedCollisionAttacks.clear();
    const pendingMoves: Extract<PveEvent, { type: 'MOVE' }>[] = [];
    const pendingAttacks: Extract<PveEvent, { type: 'ATTACK' }>[] = [];
    const flushPendingMoves = async () => {
      if (pendingMoves.length === 0) return;
      const batch = pendingMoves.splice(0, pendingMoves.length);
      await this._playMoveBatch(batch);
    };
    const flushPendingAttacks = async () => {
      if (pendingAttacks.length === 0) return;
      const batch = pendingAttacks.splice(0, pendingAttacks.length);
      if (batch.length === 1) {
        await this._playAttackFx(batch[0]!);
        return;
      }
      await Promise.all(batch.map((attack) => this._playAttackFx(attack)));
    };

    try {
    for (const ev of events) {
      if (ev.type === 'TURN_END') logTurn = ev.turn;
      else if (ev.type === 'AP_ROLLED') logTurn = ev.turn;

      // 0) fx：连续 MOVE / ATTACK 合批并行。
      // PLAYER_DAMAGED 等轻量事件夹在多次攻击之间时不 flush，才能真正并行多怪出手。
      // 其它事件（含会 await 的 Boss 演出）前先 flush，保证顺序。
      if (ev.type === 'MOVE') {
        await flushPendingAttacks();
        pendingMoves.push(ev);
      } else if (ev.type === 'ATTACK') {
        await flushPendingMoves();
        pendingAttacks.push(ev);
      } else if (
        ev.type === 'PLAYER_DAMAGED'
        || ev.type === 'TURN_END'
        || ev.type === 'AP_ROLLED'
        || ev.type === 'LOOT'
        || ev.type === 'PLAYER_EXPOSED'
        || ev.type === 'PLAYER_EXPOSURE_ENDED'
        || ev.type === 'STATIONARY_PRESSURE_CHANGED'
        || ev.type === 'HOPPER_REACTION_ADVANCED'
        || ev.type === 'HOPPER_FRENZY_TRIGGERED'
      ) {
        this._playFxFor(ev);
      } else {
        await flushPendingMoves();
        await flushPendingAttacks();
        this._playFxFor(ev);
      }

      // 1) 战报栏（覆盖更广，包含 MOVE/TURN_END）
      const logEntry = describeForLog(ev, this._state);
      if (logEntry && this._log) {
        this._log.push(logTurn, logEntry.kind, logEntry.text);
      }

      // PORTAL_SPAWNED：describeEvent 已返回 null，不弹 toast；战报栏仍由 describeForLog 写入。
      const text = describeEvent(ev, this._state);
      if (text) {
        const bossImportant = new Set<PveEvent['type']>([
          'HEAVY_STRIKE_WARNING',
          'HEAVY_STRIKE_RESOLVED',
          'BOSS_ENRAGED',
          'CHARGE_TELEGRAPHED',
          'CHARGE_EXECUTED',
          'ERUPTION_TELEGRAPHED',
          'ERUPTION_RESOLVED',
          'BURN_BURST',
          'SANDSTORM_SPAWNED',
          'SANDSTORM_HIT',
          'PROPHECY_MARKED',
          'PROPHECY_RESOLVED',
          'DESTINY_REWRITE_OFFERED',
          'DESTINY_REWRITE_RESOLVED',
          'DESTINY_5X5_EXPLODED',
          'WAVE_INCOMING',
          'LOOT',
        ]);
        if (bossImportant.has(ev.type)) this._toast?.toastImportant(text);
        else this._toast?.toast(text);
        // 不再 await delay：避免 toast 阻塞事件回放主循环导致 fx 动画"卡一下"。
      }

      // 3.5) 蓄力重击实际结算：以重击瞬间 boss 的位置为中心，标识真正命中的范围（橙圈），石块遮挡格标识为安全（绿）
      if (ev.type === 'HEAVY_STRIKE_RESOLVED' && this._state) {
        const { danger, safe } = splitAoeCells(ev.center, this._state.floorState.size, HEAVY_STRIKE_RANGE, this._state.floorState.entities);
        this._map?.showAoeHit(danger, safe);
        heavyStrikeResolvedThisBatch = true;
      }

      // 3.55) 蓄力重击预警（2026-06-15 站桩方案）：以 boss 当前位置为心、ev.radius(=HEAVY_STRIKE_RANGE)
      //       为半径画红圈。重击回合 boss 站桩不移动，故红圈即下回合实际命中区域（与橙圈完全重合），
      //       玩家跑出红圈即绝对安全、不会多走位浪费 AP。红圈全部标红（含石块遮挡格），与橙圈一致。
      if (ev.type === 'HEAVY_STRIKE_WARNING' && this._state) {
        const { danger, safe } = splitAoeCells(ev.center, this._state.floorState.size, ev.radius, this._state.floorState.entities);
        this._map?.showAoeWarning([...danger, ...safe]);
      }

      // 3.56) 冰霜巨人「冰霜重击」结算：以 boss 自身为中心，半径 ev.radius 画橙圈标识本次实际波及范围。
      if (ev.type === 'FROST_HEAVY_STRIKE_RESOLVED' && this._state) {
        const { danger, safe } = splitAoeCells(ev.center, this._state.floorState.size, ev.radius, this._state.floorState.entities);
        this._map?.showAoeHit(danger, safe);
        heavyStrikeResolvedThisBatch = true;
      }

      // 3.57) 冰霜巨人狂暴冲锋预警：dir 为冲锋方向，path 为中心线；车道为 path 格 ± 垂直方向 1 格（三格宽），
      //       用红圈标识下回合冲锋将经过的整条车道。CHARGE_EXECUTED 结算后清除。
      if (ev.type === 'CHARGE_TELEGRAPHED' && this._state) {
        const size = this._state.floorState.size;
        const perp: Coord = ev.dir.x !== 0 ? { x: 0, y: 1 } : { x: 1, y: 0 };
        const cells: Coord[] = [];
        for (const c of ev.path) {
          for (const off of [-1, 0, 1]) {
            const x = c.x + perp.x * off;
            const y = c.y + perp.y * off;
            if (x >= 0 && y >= 0 && x < size && y < size) cells.push({ x, y });
          }
        }
        this._map?.showAoeWarning(cells);
        // 预警红圈极易被「AP 耗尽自动结束回合」（80ms 后触发）一闪而过，
        // 这里固定停留 1s，确保玩家有时间看到下回合的冲锋路线。
        await delay(1000);
      }

      // 3.58) 冰霜巨人狂暴冲锋执行：清除冲锋车道预警红圈；
      //       终点格 OccupantArt 和 boss 大图标位置都已在 _spawnKillFloaters 锁定。
      //       这里用单条 quadInOut tween 把大图标从 from 直接平滑滑到 to（消除原本分步 await 的 PPT 卡顿感），
      //       滑动结束后解锁 + 恢复 OccupantArt + 全屏震屏。
      //       try/finally 确保任何异常或超时都能解锁，防止游戏卡死。
      if (ev.type === 'CHARGE_EXECUTED' && this._map) {
        this._map.clearAoeWarning();
        const isMoving = ev.from.x !== ev.to.x || ev.from.y !== ev.to.y;
        const chargeMap = this._map;
        try {
          if (isMoving) {
            const bossIcon = chargeMap.getBossIconNode();
            // 强制 active=true：冲锋路径上可能有未揭雾格，refresh 已被 lock 跳过不会改 active，
            // 但前一帧若 overlay 处于 inactive，tween 在 inactive 节点上 .call 不会触发，必须显式打开。
            bossIcon.active = true;
            const fromLp = chargeMap.computeBossIconLocalPos(ev.from);
            const toLp = chargeMap.computeBossIconLocalPos(ev.to);
            bossIcon.setPosition(fromLp.x, fromLp.y, 0);
            const cellDist = Math.max(Math.abs(ev.to.x - ev.from.x), Math.abs(ev.to.y - ev.from.y));
            const dur = Math.min(1.0, Math.max(0.4, cellDist * 0.12));
            // Promise.race + setTimeout 兜底：即使 tween 因任何原因不触发 .call(resolve)，
            // (dur+0.5)s 后超时 promise 也会 resolve，绝不让 await 永久挂起导致游戏卡死。
            await Promise.race([
              new Promise<void>((resolve) => {
                tween(bossIcon)
                  .to(dur, { position: new Vec3(toLp.x, toLp.y, 0) }, { easing: 'quadInOut' })
                  .call(() => resolve())
                  .start();
              }),
              new Promise<void>((resolve) => setTimeout(resolve, dur * 1000 + 500)),
            ]);
            // 强制最终位置（防 tween 提前停止留下半路状态）
            bossIcon.setPosition(toLp.x, toLp.y, 0);
            void Effects.cameraShake({ strength: 3.0, duration: 0.45 });
          }
        } finally {
          // 无论如何都要解锁 + 还原 OccupantArt + 清掉隐藏记录，否则下一回合 refresh 不动 overlay
          // 且玩家可能看不见 boss / 终点格永远隐藏。
          chargeMap.setBossIconLocked(false);
          chargeMap.setOccupantVisible(ev.to, true);
          this._attackLungeHidden.delete(`charge:${ev.to.x},${ev.to.y}`);
        }
      }

      // 3.55a) 命运守卫「改写命运」预告：阻塞模态 3 选 1 弃。
      //        玩家点选后 chooseDestinyRewrite 写 removed，下个 Boss 回合 resolveDestinyRewrite 结算。
      if (ev.type === 'DESTINY_REWRITE_OFFERED' && this._toast && this._state) {
        // 若抽到 E4（5×5 爆炸），先在地图上用红圈高亮 Boss 周围 5×5 范围，让玩家在模态中看清危险区域
        if (ev.drawn.includes(4) && this._state) {
          const bossPos = this._state.floorState.monsters.find(
            (m) => m.bossId === 'FATE_GUARDIAN' && m.aiState !== 'DEAD',
          )?.pos;
          if (bossPos) {
            const size = this._state.floorState.size;
            const e4Cells: Coord[] = [];
            for (let dy = -2; dy <= 2; dy++) {
              for (let dx = -2; dx <= 2; dx++) {
                const x = bossPos.x + dx;
                const y = bossPos.y + dy;
                if (x >= 0 && y >= 0 && x < size && y < size) e4Cells.push({ x, y });
              }
            }
            this._map?.showAoeWarning(e4Cells);
          }
        }
        const cards = ev.drawn.map((id) => destinyEventCard(id));
        const tChoice = perfNow();
        const removedIndex = await this._toast.showChoiceDialog('改写命运 · 舍弃一个未来（剩两个生效）', cards);
        perfMark('blockingChoice.destinyRewrite', tChoice);
        this._map?.clearAoeWarning(); // 模态关闭后清除 E4 预警圈
        if (this._state) {
          const safe = (removedIndex === 0 || removedIndex === 1 || removedIndex === 2) ? removedIndex : 0;
          const r = chooseDestinyRewrite(this._state, safe);
          this._state = r.state;
          this._rebuildInputHints();
          this._hud?.refresh(this._state);
          const droppedName = destinyEventName(ev.drawn[safe]);
          this._toast.toast(`已舍弃：${droppedName}`);
          this._log?.push(this._state.floorState.turn, 'PLAYER_ACT', `🌀 改写命运：舍弃 ${droppedName}`);
          await delay(420);
        }
      }

      // 3.55b) 命运 5×5 爆炸：以 Boss 当前格为中心切比雪夫≤2 的 5×5 区域画橙圈预警。
      if (ev.type === 'DESTINY_5X5_EXPLODED' && this._state) {
        const size = this._state.floorState.size;
        const cells: Coord[] = [];
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const x = ev.center.x + dx;
            const y = ev.center.y + dy;
            if (x >= 0 && y >= 0 && x < size && y < size) cells.push({ x, y });
          }
        }
        this._map?.showAoeHit(cells, []);
      }

      // 3.6) 命运预言：标记回合（预警）/ 结算回合（爆炸）均以 3×3 橙圈标识中心区域；
      //      展示 1s 后自动消失（不阻塞 _busy，不等待；若 1s 内进入下一回合 clearAoeHit 会先清掉）。
      if ((ev.type === 'PROPHECY_MARKED' || ev.type === 'PROPHECY_RESOLVED') && this._state) {
        const size = this._state.floorState.size;
        const cells: Coord[] = [];
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const x = ev.center.x + dx;
            const y = ev.center.y + dy;
            if (x >= 0 && y >= 0 && x < size && y < size) cells.push({ x, y });
          }
        }
        this._map?.showAoeHit(cells, []);
        void delay(1000).then(() => this._map?.clearAoeHit());
      }

      // 3.7) 流沙巨蝎沙暴：直接用橙圈标识本次随机覆盖的格子（命中提示见 SANDSTORM_HIT 战报）。
      if (ev.type === 'SANDSTORM_SPAWNED' && this._state) {
        this._map?.showAoeHit(ev.tiles, []);
      }

      // 3.8) 熔岩领主「喷发预警」：红圈标识下回合将生成熔岩的 4×4 区域。
      if (ev.type === 'ERUPTION_TELEGRAPHED' && this._state) {
        this._map?.showAoeWarning(ev.cells);
      }

      // 3.9) 熔岩领主「喷发结算」：新熔岩格已在 _refreshAll 中随 floorState 渲染，
      //      这里仅清除上一回合的喷发预警红圈。
      if (ev.type === 'ERUPTION_RESOLVED') {
        this._map?.clearAoeWarning();
      }

      // 3.10) 熔岩领主「熔核爆裂」：以橙圈短闪标识灼烧爆裂波及的十字区域。
      if (ev.type === 'BURN_BURST' && this._state) {
        this._map?.showAoeHit(ev.tiles, []);
        heavyStrikeResolvedThisBatch = true;
      }

    }

    // 批次以 MOVE/ATTACK 收尾时也要播完（例如结束回合后全是追击位移）。
    await flushPendingMoves();
    await flushPendingAttacks();

    // 本回合事件回放结束：蓄力重击「实际命中」橙圈已展示完毕，延迟 1s 后清除（不延续到玩家
    // 下一回合）——回放刚结束就立即清除会一闪而过，玩家来不及看清范围；1s 后清除既能让
    // 玩家看清，又不会阻塞 _busy（不 await，提前返回）。若 1s 内已进入下一怪物回合，
    // _onEndTurn 的 clearAoeHit 会先清掉，这里的延迟清除即为空操作。
    if (heavyStrikeResolvedThisBatch) {
      void delay(1000).then(() => this._map?.clearAoeHit());
    }
    } finally {
      this._playbackEvents = [];
      this._consumedCollisionAttacks.clear();
    }
  }

  /** 移动后被动拾取钥匙 / Boss 阵亡后生成传送门 / 阵亡与通关收尾（design §12, AC-8~AC-12）。 */
  private async _afterApply(): Promise<void> {
    if (!this._state) return;

    const floor = this._state.floorState;

    // 自动拾取钥匙（AC-8）
    // 必须走 applyPersistentBattleResult：永久层拾钥即完成目标并刷通关门（PORTAL_SPAWNED）。
    const keyHere = floor.entities.find(
      (e) => e.type === 'KEY' && !e.consumed && e.pos.x === floor.player.x && e.pos.y === floor.player.y,
    );
    if (keyHere) {
      const tKey = perfNow();
      let r = pickKey(this._state, keyHere.id);
      if (r.events.length > 0) {
        if (this._runtime && this._floorFlow) {
          const persistent = applyPersistentBattleResult(this._runtime, r);
          this._runtime = persistent.runtime;
          this._floorFlow.updateRuntime(this._runtime);
          r = persistent.result;
        }
        this._state = r.state;
        this._rebuildInputHints();
        this._refreshAll();
        await this._playEvents(r.events);
        this._syncTutorialGuide(r.events);
      }
      perfMark('afterApply.pickKey', tKey);
    }

    const deadBoss = this._state.floorState.monsters.find((m) => m.type === 'BOSS' && m.aiState === 'DEAD');
    const hasPortal = this._state.floorState.entities.some((e) => e.type === 'PORTAL');
    if (deadBoss && this._state.floorState.hasKey && !hasPortal) {
      const tPortal = perfNow();
      let r = spawnPortal(this._state, deadBoss.id);
      if (r.events.length > 0) {
        if (this._runtime && this._floorFlow) {
          const persistent = applyPersistentBattleResult(this._runtime, r);
          this._runtime = persistent.runtime;
          this._floorFlow.updateRuntime(this._runtime);
          r = persistent.result;
        }
        this._state = r.state;
        this._rebuildInputHints();
        this._refreshAll();
        await this._playEvents(r.events);
      }
      perfMark('afterApply.spawnPortal', tPortal);
    }

    if (this._state.status === 'DEAD') {
      const tDeath = perfNow();
      await this._handleDeath();
      perfMark('afterApply.handleDeath', tDeath);
      return;
    }

    if (this._state.floorState.status === 'CLEARED') {
      const tCleared = perfNow();
      await this._handleFloorCleared();
      perfMark('afterApply.handleFloorCleared', tCleared);
    }
  }

  private async _handleDeath(): Promise<void> {
    if (!this._state || !this._runtime) return;
    this._toast?.toast('远征失败，正在结算本次远征…');
    await delay(1200);
    // save() 在非 ACTIVE 时直接跳过：必须先 flush 最后一次 ACTIVE 存档，再标 DEAD。
    await this._prepareCloudSettlement();
    this._runtime = { ...this._runtime, status: 'DEAD' };
    this._floorFlow?.updateRuntime(this._runtime);
    const settled = await this._settle();
    if (settled) {
      SceneLoader.loadLobby();
    }
  }

  private async _handleFloorCleared(): Promise<void> {
    if (!this._state || !this._floorFlow || !this._runtime) return;
    if (this._handlingFloorClear) return;
    this._handlingFloorClear = true;
    const clearedFloor = this._state.floor;
    const oldChapter = this._state.chapter;
    try {
    // 跨章预热尽量早：不要等云端 flush/settle 才开始下 chapter_N（高 RTT 会空等数秒）。
    if (isBossFloor(clearedFloor)) {
      preloadChapter(oldChapter + 1);
    }

    // ACTIVE flush 优先在 _apply 传门通关前完成；此处兜底（例如断线重连已是 CLEAR）。
    if (this._runtime.status === 'ACTIVE') {
      await this._prepareCloudSettlement();
    } else {
      this._settlingCloud = true;
    }
    this._runtime = { ...this._runtime, status: 'CLEAR' };
    this._floorFlow.updateRuntime(this._runtime);

    // 先弹命痕/通关反馈，再等云端 settle。否则高 RTT flush/settle 会让玩家以为
    // 「第一次点传门没反应」，连点第二次才看到选择命痕。
    this._toast?.toastImportant('本层通关！', 1200);
    const selection = await this._promptClearRewardSelection();
    const settled = await this._settle(selection);
    if (!settled) return;

    const canContinue = clearedFloor < MAX_READY_FLOOR;
    const choice = this._toast
      ? await this._toast.showConfirm(
          `第${oldChapter}章 · 第${clearedFloor}层通关！`,
          canContinue
            ? [
                { label: '继续远征 →', value: 'continue' },
                { label: '返回大厅', value: 'quit' },
              ]
            : [{ label: '返回大厅', value: 'quit' }],
        )
      : (canContinue ? 'continue' : 'quit');

    const completedTutorialFloor = this._state.isTutorialRun && this._state.floor === 1;
    if (completedTutorialFloor) {
      this._meta = {
        ...(this._meta ?? { diamond: 0 }),
        tutorialCompleted: true,
      };
      try {
        await updatePveMeta({ tutorialCompleted: true });
      } catch (err) {
        this._toast?.toast(`教学完成标记保存失败：${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (choice === 'quit') {
      SceneLoader.loadLobby();
      return;
    }

    const nextChapter = oldChapter + (isBossFloor(clearedFloor) ? 1 : 0);
    const crossingChapter = nextChapter > oldChapter;
    if (crossingChapter) {
      LoadingOverlay.show(this.node, `正在进入第${nextChapter}章…`, {
        mode: 'chapter',
        title: `进入第${nextChapter}章`,
        subtitle: '迷雾正在向更深处散去',
        hint: '正在同步进度并下载章节资源',
        progress: 0.15,
        hideOnTimeout: false,
        timeoutMs: 30000,
        onTimeout: () => LoadingOverlay.update({
          text: `第${nextChapter}章加载较慢，仍在继续准备…`,
          subtitle: '更深处的道路仍在显现',
        }),
      });
    }

    let next;
    try {
      // 云端开下一层 与 章节分包下载并行，避免「先等云再下包」串行拉长总时长。
      const assetsP = crossingChapter
        ? ensureChapterAssets(nextChapter, (stage) => LoadingOverlay.update(stage))
        : Promise.resolve(true);
      const [assetsOk, flowNext] = await Promise.all([
        assetsP.catch(() => false),
        this._floorFlow.continueNextFloor(),
      ]);
      if (crossingChapter && !assetsOk) {
        LoadingOverlay.hide();
        this._toast?.toast(`第${nextChapter}章资源加载失败，请返回大厅重新进入远征`);
        await delay(1200);
        SceneLoader.loadLobby();
        return;
      }
      next = flowNext;
    } catch (err) {
      if (crossingChapter) LoadingOverlay.hide();
      const message = err instanceof Error ? err.message : String(err);
      this._toast?.toast(
        message === 'ALL_READY_FLOORS_COMPLETE'
          ? '当前已开放楼层已全部通关，返回大厅'
          : `无法进入下一层：${message}`,
      );
      await delay(1200);
      SceneLoader.loadLobby();
      return;
    }
    this._runtime = next.runtime;
    this._state = next.runtime.battleState.expedition;
    // 并行加载已覆盖跨章资源；此处仅兜底（例如非 Boss 边界进章）。
    if (this._state.chapter > oldChapter) {
      if (!(await this._ensureChapterReady(this._state.chapter))) return;
    }
    if (crossingChapter) {
      LoadingOverlay.update({
        text: '战场准备完成',
        hint: '即将进入新章节',
        progress: 1,
      });
      LoadingOverlay.hide();
    }
    this._rebuildInputHints();
    // 每层独立战报：进入新层时清空，避免历史堆积
    this._log?.clear();
    this._map?.clearAoeHit();
    this._map?.clearAoeWarning();
    this._refreshAll();

    await this._playEvents(initialPersistentPresentationEvents(this._runtime));
    this._showFloorEntryAlerts();

    // 章节边界提示（从营地出来后进入新章节）
    if (this._state.chapter > oldChapter) {
      this._toast?.toast(`⚔️ 开始探索第${this._state.chapter}章！`);
      this._log?.push(this._state.floorState.turn, 'SYSTEM', `⚔️ 第${this._state.chapter}章开始`);
      await delay(1600);
    }

    this._toast?.toast(`进入第${this._state.chapter}章 · 第${this._state.floor}层`);
    } finally {
      this._handlingFloorClear = false;
      this._pendingInteract = false;
    }
  }

  // ── 存档与结算（design ddl-sql.md / AC-11, AC-12, AC-14） ─────

  private _queuePersistentSave(delayMs = 1400): void {
    if (!this._state || !this._runtime || !this._floorFlow || this._settlingCloud) return;
    this._persistentSaveQueued = true;
    if (this._persistentSaveTimer) clearTimeout(this._persistentSaveTimer);
    this._persistentSaveTimer = setTimeout(() => {
      this._persistentSaveTimer = null;
      void this._drainPersistentSave();
    }, delayMs);
  }

  private async _drainPersistentSave(): Promise<void> {
    if (this._persistentSaveInFlight || !this._persistentSaveQueued) return;
    // 动画/_busy 期间不要 JSON.stringify 大 runtime：真机高 RTT 下云存档触发的主线程序列化
    // 会跟 MOVE/ATTACK tween 抢帧，表现为「动画卡一下」（第 7 层 Boss 增援后更明显）。
    if (this._busy) {
      this._queuePersistentSave(400);
      return;
    }
    this._persistentSaveQueued = false;
    this._persistentSaveInFlight = true;
    try {
      await delay(0);
      if (this._busy) {
        this._persistentSaveQueued = true;
        return;
      }
      await this._autoSaveCurrentFloor();
    } finally {
      this._persistentSaveInFlight = false;
      if (this._persistentSaveQueued) this._queuePersistentSave(1400);
    }
  }

  private async _flushPersistentSave(): Promise<void> {
    if (this._persistentSaveTimer) {
      clearTimeout(this._persistentSaveTimer);
      this._persistentSaveTimer = null;
    }
    while (this._persistentSaveInFlight) await delay(120);
    if (this._persistentSaveQueued) {
      await this._drainPersistentSave();
    } else {
      await this._autoSaveCurrentFloor();
    }
  }

  /**
   * 结算前串行化：排空 ACTIVE runtime 存档，避免与 settle 抢写 challenge 文档。
   * 调用方随后再把 runtime 标为 CLEAR/DEAD（此后 save 会 no-op）。
   */
  private async _prepareCloudSettlement(): Promise<void> {
    this._settlingCloud = true;
    await this._flushPersistentSave();
    this._persistentSaveQueued = false;
    if (this._persistentSaveTimer) {
      clearTimeout(this._persistentSaveTimer);
      this._persistentSaveTimer = null;
    }
  }

  /** 每完成一层自动存档；失败不阻塞继续游玩，仅提示（→ AC-11）。 */
  private async _autoSaveCurrentFloor(): Promise<void> {
    if (!this._state || !this._runtime || !this._floorFlow) return;
    if (this._settlingCloud && this._runtime.status !== 'ACTIVE') return;
    try {
      this._runtime = syncRuntimeFromExpedition(this._runtime, this._state);
      this._floorFlow.updateRuntime(this._runtime);
      await this._floorFlow.save();
    } catch (err) {
      this._toast?.toast(`存档失败：${this._formatUserFacingError(err)}`);
      await delay(600);
    }
  }

  private _formatUserFacingError(err: unknown): string {
    const raw = err instanceof Error ? err.message : String(err);
    if (/TransactionBusy|DATABASE_TRANSACTION_FAIL|transaction is busy|modified by others/i.test(raw)) {
      return '云端存档繁忙，已保留本地进度并会继续重试';
    }
    if (/FUNCTIONS_TIME_LIMIT_EXCEEDED|timed out|time.?out/i.test(raw)) {
      return '云端响应超时，请稍后重试';
    }
    if (/FUNCTIONS_EXECUTE_FAIL|code exit|execute fail/i.test(raw)) {
      return '云函数执行失败，请稍后重试';
    }
    return raw.length > 80 ? `${raw.slice(0, 80)}…` : raw;
  }

  /** 远征结束（死亡或通关）上报结算。通关时命痕选择可预先完成再传入。 */
  private async _settle(
    preselected?: Partial<SettleFloorChallengeRequest>,
  ): Promise<boolean> {
    if (!this._floorFlow || !this._runtime) return false;
    this._settlingCloud = true;
    try {
      if (this._state) this._runtime = syncRuntimeFromExpedition(this._runtime, this._state);
      this._floorFlow.updateRuntime(this._runtime);
      const selection = preselected ?? (this._runtime.status === 'CLEAR'
        ? await this._promptClearRewardSelection()
        : {});
      const { rewards } = await this._floorFlow.settle(selection);

      // 结算后更新本地钻石余额快照。
      if (rewards && this._meta) {
        const rewardRecord = rewards as Record<string, unknown>;
        this._meta = {
          ...this._meta,
          diamond: this._meta.diamond + (Number(rewardRecord.diamond ?? 0)),
        };
      }

      const rewardRecord = (rewards ?? {}) as Record<string, unknown>;
      const minghenId = typeof rewardRecord.minghenId === 'string' ? rewardRecord.minghenId : null;
      const equipment = rewardRecord.equipment as { definitionId?: string } | null | undefined;
      const lootedList = Array.isArray(rewardRecord.lootedEquipment)
        ? rewardRecord.lootedEquipment as Array<{ definitionId?: string }>
        : [];
      let minghenName: string | null = null;
      let equipmentName: string | null = null;
      try {
        if (minghenId) minghenName = getMinghenDefinition(minghenId).name;
      } catch { /* ignore unknown */ }
      try {
        const firstLootDef = lootedList[0]?.definitionId ?? equipment?.definitionId;
        if (firstLootDef) equipmentName = getFixedEquipmentDefinition(firstLootDef).name;
        if (lootedList.length > 1) equipmentName = `${equipmentName} 等${lootedList.length}件`;
      } catch { /* ignore unknown */ }

      if (this._toast) {
        await this._toast.showSettleResult({
          status: this._runtime.status === 'DEAD' ? 'DEAD' : 'COMPLETED',
          floor: this._runtime.floor,
          gold: Number(rewardRecord.stardust ?? 0)
            || (Number(rewardRecord.gold ?? 0) + Number(rewardRecord.lootedStardust ?? 0) + Number(rewardRecord.minghenDust ?? 0)),
          minghenName,
          equipmentName,
          diamond: 0,
        });
      } else {
        await delay(2000);
      }
      return true;
    } catch (err) {
      const message = this._formatUserFacingError(err);
      if (this._toast) {
        await this._toast.showConfirm(
          `结算失败\n${message}\n云端存档可能尚未清除，请重试或返回大厅后重新进入远征`,
          [{ label: '知道了', value: 'ok' }],
        );
      } else {
        await delay(800);
      }
      return false;
    } finally {
      this._settlingCloud = false;
    }
  }

  /**
   * 首通通关：命痕主题池三选一。
   * 装备不走通关结算，只在怪物身上掉落；重复通关不弹命痕（云端也不再发首通命痕）。
   */
  private async _promptClearRewardSelection(): Promise<Partial<SettleFloorChallengeRequest>> {
    if (!this._runtime || this._runtime.status !== 'CLEAR') return {};
    const profile = this._floorFlow?.state?.profile;
    const floor = this._runtime.floor;
    const firstClear = !profile?.floorRecords?.[String(floor)]?.firstClearedAt;
    if (!firstClear) return {};

    const catalog = this._runtime.battleState.rewardCatalog;
    if (!this._toast || catalog.minghenIds.length === 0) return {};

    const options = catalog.minghenIds.map((id) => {
      try {
        return formatMinghenChoice(id, profile?.minghenCollection?.[id]);
      } catch {
        return '未知命痕';
      }
    });
    const idx = await this._toast.showChoiceDialog(`第${floor}层通关 · 选择命痕`, options);
    return {
      selectedMinghenId: catalog.minghenIds[idx] ?? catalog.minghenIds[0],
    };
  }
}

/** 对比攻击前后怪物异常，生成命痕施加战报文案。 */
function describeNewMonsterStatuses(before: Monster, after: Monster): string {
  const parts: string[] = [];
  const burnDelta = (after.burnRounds ?? 0) - (before.burnRounds ?? 0);
  const bleedDelta = (after.bleedRounds ?? 0) - (before.bleedRounds ?? 0);
  const poisonDelta = (after.poisonRounds ?? 0) - (before.poisonRounds ?? 0);
  const chillDelta = (after.frozenRounds ?? 0) - (before.frozenRounds ?? 0);
  if (burnDelta > 0) parts.push(`灼烧 +${burnDelta}（现 ${after.burnRounds}）`);
  if (bleedDelta > 0) parts.push(`流血 +${bleedDelta}（现 ${after.bleedRounds}）`);
  if (poisonDelta > 0) parts.push(`中毒 +${poisonDelta}（现 ${after.poisonRounds}）`);
  if (chillDelta > 0) parts.push(`冰寒 +${chillDelta}（现 ${after.frozenRounds}）`);
  return parts.join(' · ');
}
