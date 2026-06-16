// 命运远征场景主控（design §2）：输入 → core 纯函数 → 事件回放（toast/弹窗）→ 刷新 View。
// 三层结构落地：Controller 仅做编排与输入处理，规则全部委托 pve/core 纯函数，渲染委托 views/*。
// M1 垂直切片：第一章 1~5 层端到端打通；存档/云端校验留待 P3（见 specs/260608-pve-destiny-expedition）。

import { _decorator, Component, EventKeyboard, Input, input, KeyCode, Node, sys } from 'cc';
import { SceneLoader } from '../../core/SceneLoader';
import { lockPortrait } from '../../platform/wechat/WxLandscape';
import { applyUiLayerTree, refreshScreenAdapt, visibleDesignSize } from '../../platform/wechat/ViewAdapt';
import { applyStrengthen } from '../core/AnimaSystem';
import { ACHIEVEMENT_DEFS, checkNewAchievements, collectCodexEntries } from '../core/AchievementSystem';
import type { AchievementDef, AchievementId } from '../core/AchievementSystem';
import { HEAVY_STRIKE_RANGE, isCellShadowedByRock } from '../core/bosses/GoblinChief';
import { chooseDestinyRewrite } from '../core/bosses/FateGuardian';
import { applySellEquip, applyShopBuy, CAMP_SHOP_ITEMS, openRelicChest } from '../core/CampSystem';
import type { CampItemId } from '../core/CampSystem';
import { CHAPTER_BOSS_RELIC, RELIC_CHEST } from '../core/PveConstants';
import { applyClassAdvance, applyClassAwaken, pickFragment } from '../core/ClassSystem';
import { attackIceWall, playerAttack, playerAttackPower } from '../core/CombatSystem';
import {
  advanceFloor,
  applyDeath,
  devSkipToFloor,
  endTurn,
  resumeExpedition,
  startExpedition,
} from '../core/ExpeditionState';
import { interactPortal, openExit, pickKey, spawnPortal } from '../core/FloorRules';
import { openChest } from '../core/LootSystem';
import { RELIC_DEFS } from '../core/RelicSystem';
import { claimScrollChoice, useScroll } from '../core/ScrollSystem';
import { applyMove } from '../core/MovementSystem';
import { resolveTreeChoice } from '../core/DestinyTreeSystem';
import { CAMP_BLACKSMITH_ID, rerollEquipTrait, upgradeEquip, useAltar, useHotSpring, useIdol } from '../core/NeutralEntities';
import type { Direction } from '../core/MovementSystem';
import { AP_COST, AWAKEN_FORMS, CLASS_FRAGMENTS_TO_ADVANCE, CLASS_FRAGMENTS_TO_AWAKEN, DEV_SKIP_TO_FLOOR, isBossFloor, LAVA_LORD_BURN_BURST_THRESHOLD, LAVA_LORD_BURN_TICKS, TOTAL_FLOORS } from '../core/PveConstants';
import type { ClassId } from '../core/PveConstants';
import type { ApplyResult, Coord, ExpeditionState, FixedEntity, Monster, MonsterType, PveEvent, PveMeta, RelicId } from '../core/PveTypes';
import { loadPveSave, loadPveMeta, startRun, savePveFloor, settlePveRun, updatePveMeta } from '../../network/PveService';
import type { PveSaveVO } from '../../network/PveService';
import { FogMapView } from '../views/FogMapView';
import { PveCharacterPanel } from '../views/PveCharacterPanel';
import { PveHudView } from '../views/PveHudView';
import type { LogKind } from '../views/PveMessageLog';
import { PveMessageLog } from '../views/PveMessageLog';
import { PveToastView, STRENGTHEN_LABEL } from '../views/PveToastView';

const { ccclass } = _decorator;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * 性能埋点（2026-06-11 加）：定位"游戏 5 分钟后按钮卡顿"。
 * 关闭方式：把 PERF_LOG 设 false 即可（不删，便于复发时一行打开）。
 * 输出格式：[PVE perf] <label> <dtMs>ms [extra]
 *   apply.total      —— 按钮点击 → _busy 解除全过程
 *   apply.events     —— _playEvents 串行回放耗时（含 await delay）
 *   apply.meta       —— _checkMeta（成就/图鉴扫描）耗时
 *   apply.afterApply —— _afterApply（自动拾取/传送门/死亡判定）耗时
 *   apply.refreshAll —— map+hud diff 刷新耗时
 *   tap.endTurn / tap.move / tap.attack / tap.interact —— 按钮回调入口
 */
const PERF_LOG = true;
function perfNow(): number {
  return performance.now?.() ?? Date.now();
}
function perfMark(label: string, startMs: number, extra?: string): void {
  if (!PERF_LOG) return;
  const dt = Math.round(perfNow() - startMs);
  console.log(`[PVE perf] ${label} ${dt}ms${extra ? ' ' + extra : ''}`);
}

/**
 * _checkMeta 调度预筛选：仅当事件序列含可能触发成就 / 图鉴更新的类型时返回 true。
 * 必须与 AchievementSystem.checkNewAchievements / collectCodexEntries 的 switch 分支保持一致——
 * 当前匹配的类型：AP_ROLLED(FIRST_EXPEDITION/REACH_FLOOR_10) / KILL(FIRST_KILL + 图鉴) /
 * OPEN_CHEST(FIRST_CHEST) / LOOT.equip(FIRST_EQUIPMENT + 图鉴) / CLASS_ADVANCED / FLOOR_CLEARED。
 * LOOT 必须带 equip 字段才算图鉴新条目（金币/灵气掉落不触发）。
 */
function META_RELEVANT_EVENTS_PRESENT(events: PveEvent[]): boolean {
  for (const ev of events) {
    switch (ev.type) {
      case 'AP_ROLLED':
      case 'KILL':
      case 'OPEN_CHEST':
      case 'CLASS_ADVANCED':
      case 'FLOOR_CLEARED':
        return true;
      case 'LOOT':
        if (ev.equip) return true;
        break;
    }
  }
  return false;
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
const CLASS_CN: Record<string, string> = {
  BERSERKER: '狂战士',
  ARCHER: '射手',
  ROGUE: '隐匿者',
};

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
      return ev.attackerId === 'PLAYER'
        ? {
            kind: 'PLAYER_ACT',
            text: `攻击 -${ev.damage}（敌剩 ${ev.targetHp} 血）`,
          }
        : null;
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
      if (ev.gold) parts.push(`金币+${ev.gold}`);
      if (ev.anima) parts.push(`灵气+${ev.anima}`);
      if (ev.equip) parts.push(`装备:${ev.equip.name}`);
      if (ev.fragmentPair) parts.push(`🧩碎片对+${ev.fragmentPair.map((c) => CLASS_CN[c] ?? c).join('/')}`);
      return parts.length > 0 ? { kind: 'LOOT', text: parts.join(' ') } : null;
    }
    case 'SELL_EQUIP':
      return { kind: 'LOOT', text: `⚒️ 变卖 ${ev.itemName}（+${ev.gold} 金）` };
    case 'PICK_KEY':
      return { kind: 'LOOT', text: '🔑 拾取钥匙' };
    case 'OPEN_CHEST':
      return { kind: 'LOOT', text: '📦 打开宝箱' };
    case 'PORTAL_SPAWNED':
      return { kind: 'SYSTEM', text: '🌀 传送门浮现，可继续探索或踏入通关' };
    case 'IDOL_BLESSING':
      return { kind: 'LOOT', text: `🛐 神像祝福（HP 上限 +${ev.maxHpBonus}）` };
    case 'HOT_SPRING_HEAL':
      return { kind: 'LOOT', text: `♨️ 温泉治疗（恢复 ${ev.healed} 血）` };
    case 'FRAGMENT_PICKED': {
      // 已进阶到该职业 → 显示觉醒进度（/10），否则显示进阶进度（/5）
      const fragTarget = state?.player.classId === ev.classId
        ? CLASS_FRAGMENTS_TO_AWAKEN
        : CLASS_FRAGMENTS_TO_ADVANCE;
      return { kind: 'LOOT', text: `🧩 [${CLASS_CN[ev.classId] ?? ev.classId}] 碎片（${ev.totalFragments}/${fragTarget}）` };
    }
    case 'CLASS_CAN_ADVANCE':
      return { kind: 'SYSTEM', text: '⭐ 职业碎片集齐！可选择进阶职业' };
    case 'CLASS_ADVANCED': {
      const suffix = ev.hpCost > 0 ? `（消耗 ${ev.hpCost} HP）` : '';
      return { kind: 'SYSTEM', text: `⭐ 职业进阶 → ${CLASS_CN[ev.classId] ?? ev.classId}${suffix}` };
    }
    case 'CLASS_CAN_AWAKEN':
      return { kind: 'SYSTEM', text: '🌟 二阶觉醒条件已满足！可进行觉醒' };
    case 'CLASS_AWAKENED': {
      const form = AWAKEN_FORMS[ev.form];
      return { kind: 'SYSTEM', text: `🌟 觉醒成功 → ${form.name}（获得「${form.traitName}」）` };
    }
    case 'ANIMA_STRENGTHEN':
      return { kind: 'SYSTEM', text: '✨ 灵气满了，可强化属性' };
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
    case 'ACHIEVEMENT_UNLOCKED':
      return { kind: 'SYSTEM', text: `🏆 成就解锁：${ev.name}` };
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
      return { kind: 'LOOT', text: `🌿 祭坛感应（灵气 +${ev.anima}）` };
    case 'BLACKSMITH_UPGRADE':
      return { kind: 'LOOT', text: `⚒️ 铁匠强化 ${SLOT_CN[ev.slot] ?? ev.slot} +${ev.newEnhanceLevel}：${SLOT_ATTR_CN[ev.slot] ?? '基础属性'} → ${ev.newStat}` };
    case 'BLACKSMITH_UPGRADE_FAIL':
      return { kind: 'PLAYER_HURT', text: `⚒️ 铁匠强化失败！（失败率 ${Math.round(ev.failChance * 100)}%）金币已扣除` };
    case 'BLACKSMITH_REROLL':
      return { kind: 'LOOT', text: `⚒️ 铁匠洗炼 ${SLOT_CN[ev.slot] ?? ev.slot}（词条 → ${ev.newTrait}）` };
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
    case 'RELIC_PICKUP': {
      const def = RELIC_DEFS[ev.relicId];
      return { kind: 'LOOT', text: `🏺 拾取遗物：${def?.name ?? ev.relicId}（${def?.description ?? ''}）` };
    }
    case 'SCROLL_PICKUP':
      return { kind: 'LOOT', text: '📜 拾取命运词条卷轴（HUD 可主动使用）' };
    case 'SHARDS_PICKUP':
      return { kind: 'LOOT', text: `💎 命运碎片 +${ev.amount}` };
    case 'CODEX_RELIC_UNLOCKED': {
      const def = RELIC_DEFS[ev.relicId];
      return { kind: 'SYSTEM', text: `📖 首次解锁遗物图鉴：${def?.name ?? ev.relicId}（后续掉落率 +10%）` };
    }
    case 'SCROLL_OFFER':
      return { kind: 'SYSTEM', text: '📜 命运卷轴展开：请从 3 个词条中选择 1 个' };
    case 'SCROLL_RESOLVED':
      return { kind: 'SYSTEM', text: `📜 已选定词条：${ev.selected}` };
    case 'RELIC_CHEST_OPENED': {
      if (!ev.success) return { kind: 'SYSTEM', text: '🎁 遗物宝箱：未开出（金币与钻石已扣）' };
      const def = ev.relicId ? RELIC_DEFS[ev.relicId] : undefined;
      if (ev.refunded) {
        return {
          kind: 'LOOT',
          text: `🎁 遗物宝箱：已持有 ${def?.name ?? ev.relicId}，返还 +${ev.refundGold ?? 0} 金 / +${ev.refundDiamond ?? 0} 钻`,
        };
      }
      return { kind: 'LOOT', text: `🎁 遗物宝箱开出：${def?.name ?? ev.relicId}！` };
    }
    case 'RELIC_TRIGGERED': {
      const def = RELIC_DEFS[ev.relicId];
      return { kind: 'PLAYER_ACT', text: `✨ ${def?.name ?? ev.relicId} 触发${ev.detail ? `：${ev.detail}` : ''}` };
    }
    case 'ELITE_REVIVE':
      return { kind: 'ENEMY_ACT', text: `✨ 虚空虫双生复活！HP 恢复至 ${ev.hp}` };
    case 'ELITE_EXPLODE':
      return { kind: 'PLAYER_HURT', text: `💥 火焰元素爆裂！真实伤害 -${ev.damage}（剩余 ${ev.hp} 血）` };
    case 'FROST_AURA_DRAINED':
      return { kind: 'PLAYER_HURT', text: `❄️ 寒冰光环！AP -1（剩余 ${ev.ap}）` };
    default:
      return null;
  }
}

/** 事件 → 文字战报（design §6/§7/§12）；返回 null 的事件类型不展示 toast（如 MOVE/REVEAL/TURN_END）。 */
function describeEvent(ev: PveEvent, state: ExpeditionState | null): string | null {
  switch (ev.type) {
    case 'ATTACK':
      return ev.attackerId === 'PLAYER'
        ? `命中！造成 ${ev.damage} 点伤害（敌人剩 ${ev.targetHp} 血）`
        : null;
    case 'KILL': {
      const monster = state?.floorState.monsters.find((m) => m.id === ev.monsterId);
      const name = monster ? monsterName(monster) : (MONSTER_TYPE_CN[ev.monsterType] ?? '敌人');
      return `击败了 ${name}！`;
    }
    case 'PLAYER_DAMAGED': {
      const attacker = state?.floorState.monsters.find((m) => m.id === ev.sourceId);
      const name = attacker ? monsterName(attacker) : '敌人';
      const absorbed = (ev.rawDamage != null && ev.rawDamage > ev.damage) ? ev.rawDamage - ev.damage : 0;
      const absorbedText = absorbed > 0 ? `（护甲格挡 ${absorbed}）` : '';
      return `${name} 发起攻击，受到 ${ev.damage} 点伤害${absorbedText}（自己剩 ${ev.hp} 血）`;
    }
    case 'LOOT': {
      const parts: string[] = [];
      if (ev.gold) parts.push(`金币 +${ev.gold}`);
      if (ev.anima) parts.push(`灵气 +${ev.anima}`);
      if (ev.fragmentPair) parts.push(`🧩 职业碎片对：${ev.fragmentPair.map((c) => CLASS_CN[c] ?? c).join('、')} 各 +1`);
      return parts.length > 0 ? `获得 ${parts.join(' ')}` : null;
    }
    case 'SELL_EQUIP':
      return `⚒️ 变卖 ${ev.itemName}（获得 ${ev.gold} 金）`;
    case 'PICK_KEY':
      return '拾取了钥匙';
    case 'OPEN_CHEST':
      return '打开了宝箱';
    case 'PORTAL_SPAWNED':
      return '🌀 传送门浮现，踏入即可通关（可先继续探索）';
    case 'IDOL_BLESSING':
      return `🛐 神像赐予祝福 · HP 上限 +${ev.maxHpBonus}`;
    case 'HOT_SPRING_HEAL':
      return `♨️ 温泉治疗 +${ev.healed} HP`;
    case 'FRAGMENT_PICKED': {
      const fragTarget = state?.player.classId === ev.classId
        ? CLASS_FRAGMENTS_TO_AWAKEN
        : CLASS_FRAGMENTS_TO_ADVANCE;
      return `🧩 拾取 [${CLASS_CN[ev.classId] ?? ev.classId}] 碎片（已有 ${ev.totalFragments}/${fragTarget}）`;
    }
    case 'CLASS_CAN_ADVANCE':
      return `⭐ 职业碎片已集齐，可选择进阶职业！`;
    case 'CLASS_ADVANCED': {
      return ev.hpCost > 0
        ? `⭐ 职业进阶为 [${CLASS_CN[ev.classId] ?? ev.classId}]（损失 ${ev.hpCost} HP）`
        : `⭐ 职业进阶为 [${CLASS_CN[ev.classId] ?? ev.classId}]`;
    }
    case 'CLASS_CAN_AWAKEN':
      return `🌟 二阶觉醒条件已满足，可进行觉醒！`;
    case 'CLASS_AWAKENED': {
      const form = AWAKEN_FORMS[ev.form];
      return `🌟 [${CLASS_CN[ev.classId] ?? ev.classId}] 觉醒为「${form.name}」，获得「${form.traitName}」：${form.traitDesc}`;
    }
    case 'SHOP_BUY':
      return `🏕️ 购买成功 · ${ev.effect}`;
    case 'ACHIEVEMENT_UNLOCKED':
      return `🏆 成就解锁：${ev.name}`;
    case 'FLOOR_CLEARED':
      return '楼层已通关！';
    case 'PLAYER_DEAD':
      return '你已倒下……';
    case 'AP_ROLLED':
      return `第${ev.turn}回合开始 · 掷出 ${ev.dice} 点 · 本回合行动力 ${ev.ap}`;
    case 'AP_CARRIED':
      return `🔋 结转上回合剩余行动力 +${ev.amount}`;
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
      return `🌿 祭坛感应：灵气 +${ev.anima}`;
    case 'BLACKSMITH_UPGRADE':
      return `⚒️ ${SLOT_CN[ev.slot] ?? ev.slot} 强化 +${ev.newEnhanceLevel} 完成：${SLOT_ATTR_CN[ev.slot] ?? '基础属性'} → ${ev.newStat}`;
    case 'BLACKSMITH_UPGRADE_FAIL':
      return `⚒️ 强化失败（失败率 ${Math.round(ev.failChance * 100)}%），金币已扣除`;
    case 'BLACKSMITH_REROLL':
      return `⚒️ ${SLOT_CN[ev.slot] ?? ev.slot} 词条洗炼完成`;
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
    case 'RELIC_PICKUP': {
      const def = RELIC_DEFS[ev.relicId];
      return `🏺 获得遗物：${def?.name ?? ev.relicId}`;
    }
    case 'CODEX_RELIC_UNLOCKED': {
      const def = RELIC_DEFS[ev.relicId];
      return `📖 首次解锁遗物图鉴：${def?.name ?? ev.relicId}`;
    }
    case 'SCROLL_PICKUP':
      return '📜 拾取命运词条卷轴';
    case 'SHARDS_PICKUP':
      return `💎 命运碎片 +${ev.amount}`;
    case 'RELIC_CHEST_OPENED': {
      if (!ev.success) return '🎁 遗物宝箱未开出';
      const def = ev.relicId ? RELIC_DEFS[ev.relicId] : undefined;
      if (ev.refunded) return `🎁 已持有，返还 ${ev.refundGold ?? 0} 金 / ${ev.refundDiamond ?? 0} 钻`;
      return `🎁 开出遗物：${def?.name ?? ev.relicId}！`;
    }
    case 'ELITE_REVIVE':
      return `✨ 虚空虫双生复活！HP 恢复至 ${ev.hp}`;
    case 'ELITE_EXPLODE':
      return `💥 火焰元素爆裂！真实伤害 -${ev.damage}（剩余 ${ev.hp} 血）`;
    case 'FROST_AURA_DRAINED':
      return `❄️ 寒冰光环！AP -1（剩余 ${ev.ap}）`;
    default:
      return null;
  }
}

/** 命运远征场景主控 → P2 ExpeditionController */
@ccclass('ExpeditionController')
export class ExpeditionController extends Component {
  private _state: ExpeditionState | null = null;
  /** 局外元进度快照（成就/图鉴/命运碎片）；bootstrap 异步加载，失败时置空降级。 */
  private _meta: PveMeta | null = null;
  private _map: FogMapView | null = null;
  private _hud: PveHudView | null = null;
  private _toast: PveToastView | null = null;
  private _log: PveMessageLog | null = null;
  private _character: PveCharacterPanel | null = null;
  private _busy = false;
  /** wx.onKeyDown 兜底是否已绑定（用于 onDestroy 对称解绑，见 onLoad 注释）。 */
  private _wxKeyBound = false;

  onLoad(): void {
    lockPortrait();
    refreshScreenAdapt(this.node);
    this.scheduleOnce(() => refreshScreenAdapt(this.node), 0);
    applyUiLayerTree(this.node, this.node.layer);

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
    // 竖屏：地图占据屏幕上半部分（原顶部状态条已下移至地图与战报栏之间），
    // mapRoot.y=293 与可用高度 610 是与 PveHudView 状态条 Y 坐标
    // （ROW1_Y=-screenH/2+571 等）联动推导出的常量，详见 design 文档。
    // cellSize 按楼层尺寸（8x8/9x9/10x10）动态计算，尽量填满可用宽度，避免左右黑边。
    mapRoot.setPosition(0, 293, 0);
    this._map = new FogMapView(mapRoot, screenW - 16, screenH - 610, {
      onCellTap: (coord) => this._onTapCell(coord),
    });

    this._hud = new PveHudView(this.node, screenW, screenH, {
      onMove: (dir) => this._onMove(dir),
      onAttack: () => this._onAttack(),
      onInteract: () => this._onInteract(),
      onEndTurn: () => this._onEndTurn(),
      onQuit: () => SceneLoader.loadLobby(),
      onShowCharacter: () => this._onShowCharacter(),
      onUseScroll: () => this._onUseScroll(),
    });

    this._toast = new PveToastView(this.node, screenW, screenH);

    // 战报栏：移至地图下方的横向宽条，水平居中
    this._log = new PveMessageLog(this.node, 0, -screenH / 2 + 390, 640, 180);

    // 角色信息弹窗：默认 hidden；点击 HUD「角色」按钮唤起
    this._character = new PveCharacterPanel(this.node, screenW, screenH);
  }

  /** HUD「角色」按钮回调：弹出角色详情面板（基础属性 / 装备 / 词条 / 职业碎片 / 成就）。 */
  private _onShowCharacter(): void {
    if (!this._state || !this._character) return;
    this._character.show(this._state, this._meta ?? undefined);
  }

  /** 进入场景：优先从云端存档续玩（固定从下一层开始 → AC-11），否则开启新远征。 */
  private async _bootstrap(): Promise<void> {
    this._busy = true;
    try {
      // 并行加载存档和元进度（AC-11/AC-20）
      const [saveRes, metaRes] = await Promise.allSettled([loadPveSave(), loadPveMeta()]);

      // 元进度（非关键，失败降级为空）
      if (metaRes.status === 'fulfilled') {
        this._meta = metaRes.value.meta;
        this._hud?.refreshMeta(this._meta.destinyShards);
      }

      if (saveRes.status === 'rejected') {
        throw saveRes.reason;
      }
      const { save } = saveRes.value;

      if (!save) {
        await this._beginNewRun();
      } else if (save.floor >= TOTAL_FLOORS) {
        this._toast?.toast('正在补发上次远征的通关结算…');
        await this._settle(save.runSeed, save.floor, 'COMPLETED');
        SceneLoader.loadLobby();
        return;
      } else {
        this._resumeRun(save);
      }
    } catch (err) {
      this._toast?.toast(`加载存档失败，已开启新远征：${err instanceof Error ? err.message : String(err)}`);
      await this._beginNewRun();
    }
    this._busy = false;
  }

  /** 开启新远征：runSeed 由服务端 startRun 生成（→ AC-503/504，客户端不可重试套取有利地图）。 */
  private async _beginNewRun(): Promise<void> {
    let seed: number;
    try {
      const res = await startRun();
      seed = res.runSeed;
    } catch (err) {
      this._toast?.toast(`开始远征失败，请检查网络：${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    this._state = startExpedition(seed, this._meta ?? undefined);
    // ── 开发调试：跳层 ────────────────────────────────────
    if (DEV_SKIP_TO_FLOOR > 1) {
      this._state = devSkipToFloor(this._state, DEV_SKIP_TO_FLOOR);
      console.warn(
        `[DEV] 已跳至第 ${DEV_SKIP_TO_FLOOR} 层。` +
          `上线前将 PveConstants.DEV_SKIP_TO_FLOOR 改回 0！`,
      );
    }
    // ─────────────────────────────────────────────────────
    this._log?.clear();
    this._refreshAll();
    this._toast?.toast(`远征开始 · 第${this._state.chapter}章 第${this._state.floor}层`);
    this._log?.push(this._state.floorState.turn, 'SYSTEM', `远征开始 · 第${this._state.floor}层`);
    // startExpedition 不返回 events，手动 toast 首回合掷骰（AC-2 表现）。
    void this._toastInitialApRoll();
    // 命运树 E2/E3「三选一」待选项（startExpedition 时已固化到 pendingTreeChoices）。
    void this._processPendingTreeChoices();
  }

  /**
   * 处理命运树 E2（命运馈赠：装备三选一）/ E3（命运护佑：词条三选一）的待选队列。
   * 阻塞式弹窗逐个处理，选定后通过 resolveTreeChoice 写回状态。
   */
  private async _processPendingTreeChoices(): Promise<void> {
    while (this._state && this._toast && (this._state.pendingTreeChoices?.length ?? 0) > 0) {
      const choice = this._state.pendingTreeChoices![0];
      let index = 0;
      if (choice.kind === 'EQUIP') {
        const options = choice.equipOptions ?? [];
        const labels = options.map((item) => `${item.name}（${item.slot}）`);
        index = await this._toast.showTreeChoice('命运馈赠 · 选择一件装备', labels);
      } else {
        const options = choice.traitOptions ?? [];
        const labels = options.map((id) => {
          const info = STRENGTHEN_LABEL[id] ?? { title: id, desc: '' };
          return `${info.title}：${info.desc}`;
        });
        index = await this._toast.showTreeChoice('命运护佑 · 选择一个强化词条', labels);
      }
      const result = resolveTreeChoice(this._state, index);
      this._state = result.state;
      this._hud?.refresh(this._state);
      this._toast.toast('命运馈赠已生效');
      await delay(420);
    }
  }

  private _resumeRun(save: PveSaveVO): void {
    const result = resumeExpedition(save.runSeed, save.floor, save.player);
    this._state = result.state;
    this._log?.clear();
    this._refreshAll();
    this._toast?.toast(`继续远征 · 第${this._state.chapter}章 第${this._state.floor}层`);
    this._log?.push(this._state.floorState.turn, 'SYSTEM', `继续远征 · 第${this._state.floor}层`);
    // resumeExpedition 已 emit AP_ROLLED，但 _resumeRun 未走 _apply→_playEvents 路径，需手动回放。
    void this._playEvents(result.events);
  }

  /** 进新远征时手动 toast 首回合的 AP_ROLLED（startExpedition 不返回 events）。 */
  private async _toastInitialApRoll(): Promise<void> {
    if (!this._state) return;
    const { turn, dice, ap } = this._state.floorState;
    await this._playEvents([{ type: 'AP_ROLLED', turn, dice, ap }]);
  }

  private _refreshAll(): void {
    if (!this._state) return;
    this._map?.refresh(this._state.floorState);
    this._hud?.refresh(this._state);
    this._map?.showAttackTarget(this._currentAttackTarget()?.pos ?? this._currentAttackTargetEntity()?.pos ?? null);
  }

  /**
   * "攻击"按钮当前会命中的目标（与 _onAttack 选怪规则一致：曼哈顿距离最近，平局取数组靠前者）。
   * 仅返回攻击范围内的目标——超出范围的怪物即使是"最近"，攻击也是 no-op，
   * 高亮其所在格还可能暴露未揭示迷雾中的怪物位置（信息泄露 + 视觉上像 bug 的空框）。
   */
  private _currentAttackTarget(): Monster | undefined {
    if (!this._state) return undefined;
    const floor = this._state.floorState;
    const { range } = playerAttackPower(this._state.player);
    return floor.monsters
      .filter((m) => m.aiState !== 'DEAD' && manhattan(floor.player, m.pos) <= range)
      .sort((a, b) => manhattan(floor.player, a.pos) - manhattan(floor.player, b.pos))[0];
  }

  /**
   * "攻击"按钮在没有怪物目标时会命中的冰墙（FrostGiant 专属机制，→ attackIceWall）。
   * 与 _currentAttackTarget 同规则：范围内最近者优先。
   */
  private _currentAttackTargetEntity(): FixedEntity | undefined {
    if (!this._state) return undefined;
    const floor = this._state.floorState;
    const { range } = playerAttackPower(this._state.player);
    return floor.entities
      .filter((e) => e.type === 'ICE_WALL' && !e.consumed && manhattan(floor.player, e.pos) <= range)
      .sort((a, b) => manhattan(floor.player, a.pos) - manhattan(floor.player, b.pos))[0];
  }

  // ── 输入处理 ──────────────────────────────────────────

  private _onMove(dir: Direction): void {
    const ap = this._state?.floorState.ap ?? -1;
    const turn = this._state?.floorState.turn ?? -1;
    const status = this._state?.status ?? 'null';
    const fsStatus = this._state?.floorState.status ?? 'null';
    perfMark('tap.move', perfNow(), `dir=${dir} busy=${this._busy} ap=${ap} turn=${turn} st=${status}/${fsStatus}`);
    if (this._busy || !this._state) return;
    const result = applyMove(this._state, dir);
    if (result.events.length === 0) {
      // 移动失败：给玩家明确反馈（AP 不足 vs 方向阻塞），并触发"是否卡死"检查
      const apNow = this._state.floorState.ap;
      const reason = apNow < AP_COST.MOVE ? `AP不足(${apNow}<${AP_COST.MOVE})` : '方向阻塞';
      perfMark('tap.move.blocked', perfNow(), reason);
      if (apNow < AP_COST.MOVE) {
        this._toast?.toast(`AP 不足（移动需 ${AP_COST.MOVE}，剩余 ${apNow}）`);
      } else {
        this._toast?.toast('该方向无法移动');
      }
      void this._maybeAutoEndTurn();
      return;
    }
    void this._apply(result);
  }

  private _onAttack(): void {
    perfMark('tap.attack', perfNow(), `busy=${this._busy}`);
    if (this._busy || !this._state) return;
    const target = this._currentAttackTarget();
    if (target) {
      this._attack(target.id);
      return;
    }
    const wall = this._currentAttackTargetEntity();
    if (wall) {
      this._attackIceWall(wall.id);
      return;
    }
    this._toast?.toast('附近没有目标');
    void this._maybeAutoEndTurn();
  }

  private _onTapCell(coord: Coord): void {
    if (this._busy || !this._state) return;
    const monster = this._state.floorState.monsters.find(
      (m) => m.aiState !== 'DEAD' && m.pos.x === coord.x && m.pos.y === coord.y,
    );
    if (monster) {
      this._attack(monster.id);
      return;
    }
    const wall = this._state.floorState.entities.find(
      (e) => e.type === 'ICE_WALL' && !e.consumed && e.pos.x === coord.x && e.pos.y === coord.y,
    );
    if (wall) {
      this._attackIceWall(wall.id);
    }
  }

  private _attack(monsterId: string): void {
    if (!this._state) return;
    const result = playerAttack(this._state, monsterId);
    if (result.events.length === 0) {
      this._toast?.toast('目标不在攻击范围内或 AP 不足');
      void this._maybeAutoEndTurn();
      return;
    }
    void this._apply(result);
  }

  /** 使用 1 张命运词条卷轴（HUD 按钮触发）：弹三选一弹窗，玩家选定后 append 词条。 */
  private _onUseScroll(): void {
    if (this._busy || !this._state) return;
    if ((this._state.player.scrolls ?? 0) <= 0) {
      this._toast?.toast('没有命运词条卷轴');
      return;
    }
    const result = useScroll(this._state);
    if (result.events.length === 0) {
      this._toast?.toast('词条池已穷尽');
      return;
    }
    void this._apply(result);
  }

  /** 攻击冰墙（FrostGiant 专属机制，→ attackIceWall）。 */
  private _attackIceWall(entityId: string): void {
    if (!this._state) return;
    const result = attackIceWall(this._state, entityId);
    if (result.events.length === 0) {
      this._toast?.toast('目标不在攻击范围内或 AP 不足');
      void this._maybeAutoEndTurn();
      return;
    }
    void this._apply(result);
  }

  private _onInteract(): void {
    perfMark('tap.interact', perfNow(), `busy=${this._busy}`);
    if (this._busy || !this._state) return;
    const floor = this._state.floorState;
    const entity = floor.entities.find(
      (e) => !e.consumed && e.pos.x === floor.player.x && e.pos.y === floor.player.y,
    );
    if (!entity) {
      this._toast?.toast('这里没有可交互的物品');
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
    else if (entity.type === 'IDOL') result = useIdol(this._state, entity.id);
    else if (entity.type === 'HOT_SPRING') result = useHotSpring(this._state, entity.id);
    else if (entity.type === 'ALTAR') result = useAltar(this._state, entity.id);
    else {
      this._toast?.toast('暂无法与此交互');
      void this._maybeAutoEndTurn();
      return;
    }

    if (result.events.length === 0) {
      this._toast?.toast('暂时无法交互（缺少钥匙、AP 不足或金币不足）');
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
   * 显示铁匠 UI → 玩家在弹窗内完成强化 / 洗炼操作（回调直接更新 _state）→ 关闭后刷新 HUD。
   */
  private async _applyBlacksmith(entityId: string): Promise<void> {
    if (!this._state || !this._toast) return;
    this._busy = true;
    await this._toast.showBlacksmith(
      this._state.player,
      (slot) => {
        if (!this._state) return null;
        const r = upgradeEquip(this._state, entityId, slot);
        if (r.events.length === 0) return null;
        this._state = r.state;
        this._refreshAll();
        void this._playEvents(r.events);
        return this._state.player;
      },
      (slot) => {
        if (!this._state) return null;
        const r = rerollEquipTrait(this._state, entityId, slot);
        if (r.events.length === 0) return null;
        this._state = r.state;
        this._refreshAll();
        void this._playEvents(r.events);
        return this._state.player;
      },
    );
    this._refreshAll();
    this._busy = false;
  }

  // ── 应用结果 / 事件回放 / 被动触发 ────────────────────

  private async _apply(result: ApplyResult): Promise<void> {
    if (!this._state) return;
    const t0 = perfNow();
    this._busy = true;
    this._state = result.state;
    const tRefresh = perfNow();
    this._refreshAll();
    perfMark('apply.refreshAll', tRefresh, `events=${result.events.length}`);

    const tEvents = perfNow();
    await this._playEvents(result.events);
    perfMark('apply.events', tEvents);

    // AC-20：检查本次事件产生的新成就 + 图鉴更新。
    // 2026-06-11 改为 setTimeout(0) 完全脱离 _apply 主链：原本 void _checkMeta() 仍会让 _checkMeta
    // 的同步部分和后续 await microtask 抢占主线程，导致 _apply 末尾的 microtask（busy=false / perfMark total）
    // 被推迟到 _checkMeta 全部 toast 串行完成后才执行（真机实测 1157ms）。
    // setTimeout(0) 把 _checkMeta 整体调度到下一 macrotask，_apply 末尾 microtask 优先处理。
    //
    // 2026-06-11 二次优化：预筛选事件类型。只有 checkNewAchievements/collectCodexEntries 实际查询
    // 的事件才需要调度 _checkMeta（见 AchievementSystem.ts switch 分支）。MOVE/REVEAL/ATTACK/
    // TURN_END/PLAYER_DAMAGED 等高频事件完全不触发成就 / 图鉴，跳过可减少 90%+ 后台调度。
    // 真机实测：玩家连续移动几十步时 apply.meta 累积 900ms+ 抢占主线程，导致点击响应慢；筛选后消除。
    if (META_RELEVANT_EVENTS_PRESENT(result.events)) {
      const tMeta = perfNow();
      setTimeout(() => {
        void this._checkMeta(result.events).then(() => perfMark('apply.meta', tMeta));
      }, 0);
    }

    const tAfter = perfNow();
    await this._afterApply();
    perfMark('apply.afterApply', tAfter);

    this._busy = false;
    perfMark('apply.total', t0, `events=${result.events.length}`);
    void this._maybeAutoEndTurn();
  }

  /**
   * AC-20 元进度检查：扫描本轮事件，解锁新成就 + 更新图鉴（fire-and-forget 写云端）。
   * 任何云端写入失败均静默忽略（下次启动时 loadMeta 会重新同步）。
   */
  private async _checkMeta(events: PveEvent[]): Promise<void> {
    if (!this._state) return;
    const tCheck = perfNow();

    // 使用安全默认（meta 尚未加载时也能正常检查）
    const unlocked = this._meta?.achievements ?? [];
    const newAch = checkNewAchievements(events, this._state.floor, unlocked);
    perfMark('meta.checkAch', tCheck, `new=${newAch.length}`);

    if (newAch.length > 0) {
      // 更新本地 meta
      this._meta = {
        destinyShards: this._meta?.destinyShards ?? 0,
        diamond: this._meta?.diamond ?? 0,
        achievements: [...unlocked, ...newAch],
        codex: this._meta?.codex ?? { monsters: [], equipment: [] },
        unlockedTreeNodes: this._meta?.unlockedTreeNodes ?? [],
      };
      // 2026-06-11：原本串行 await _playEvents 每个成就一次，多个成就同时解锁时后台
      // toast 风暴持续 N×120ms（真机实测 meta 累计 3552ms）。改为：战报栏仍逐条 push（玩家
      // 滚动可见），toast 合并为一条 "🏆 成就解锁：A、B、C"（一次性展示，零等待）。
      const defs = newAch
        .map((achId) => ACHIEVEMENT_DEFS.find((d) => d.id === achId))
        .filter((d): d is AchievementDef => !!d);
      for (const def of defs) {
        this._log?.push(this._state.floorState.turn, 'SYSTEM', `🏆 成就解锁：${def.name}`);
      }
      if (defs.length > 0) {
        const names = defs.map((d) => d.name).join('、');
        this._toast?.toast(`🏆 成就解锁：${names}`);
      }
      // fire-and-forget 写云端 — 2026-06-11 改用 setTimeout(0) 二次推迟：原本 void updatePveMeta()
      // 虽是 fire-and-forget，但 updatePveMeta 同步执行到 await wx.cloud.callFunction 期间，
      // 序列化 + JSBridge 调用可能占主线程几百 ms~1s（真机实测 1117ms）。包 setTimeout(0)
      // 让云调用本身的同步部分也脱离当前 task。
      const tCloud = perfNow();
      setTimeout(() => {
        perfMark('meta.cloudAchStart', tCloud);
        void updatePveMeta({ newAchievements: newAch }).catch(() => {});
      }, 0);
    }

    // 图鉴：从击杀/掉落事件提取新条目
    const tCodex = perfNow();
    const { monsters, equipment } = collectCodexEntries(events);
    const existMon = new Set(this._meta?.codex.monsters ?? []);
    const existEq  = new Set(this._meta?.codex.equipment ?? []);
    const newMon = monsters.filter((m) => !existMon.has(m));
    const newEq  = equipment.filter((e) => !existEq.has(e));
    perfMark('meta.checkCodex', tCodex, `newMon=${newMon.length} newEq=${newEq.length}`);

    if (newMon.length > 0 || newEq.length > 0) {
      this._meta = {
        destinyShards: this._meta?.destinyShards ?? 0,
        diamond: this._meta?.diamond ?? 0,
        achievements: this._meta?.achievements ?? [],
        codex: {
          monsters: [...existMon, ...newMon],
          equipment: [...existEq, ...newEq],
        },
        unlockedTreeNodes: this._meta?.unlockedTreeNodes ?? [],
      };
      const tCloud = perfNow();
      setTimeout(() => {
        perfMark('meta.cloudCodexStart', tCloud);
        void updatePveMeta({ codexMonsters: newMon, codexEquipment: newEq }).catch(() => {});
      }, 0);
    }
  }

  /**
   * 智能自动结束回合（AC-3 UX）：
   * - AP 不跨回合累加，"主动结束"对玩家无收益
   * - AP=0 / AP=1 但无可用 1-AP 动作（无邻近怪 + 不在交互格上）都视为"卡死"
   * - 卡死时延迟 700ms 让玩家看完反馈，再衔接怪物回合
   *
   * 保留"结束回合"按钮：玩家仍可主动提前结束（如 Boss 战决策需求）。
   */
  private async _maybeAutoEndTurn(): Promise<void> {
    if (this._busy) { perfMark('autoEndTurn.skip', perfNow(), 'busy'); return; }
    if (!this._state) { perfMark('autoEndTurn.skip', perfNow(), 'no-state'); return; }
    if (this._state.status !== 'ACTIVE') { perfMark('autoEndTurn.skip', perfNow(), `st=${this._state.status}`); return; }
    if (this._state.floorState.status !== 'EXPLORING') { perfMark('autoEndTurn.skip', perfNow(), `fs=${this._state.floorState.status}`); return; }
    if (this._hasViableActionWithCurrentAp()) { perfMark('autoEndTurn.skip', perfNow(), `ap=${this._state.floorState.ap} viable`); return; }
    perfMark('autoEndTurn.trigger', perfNow(), `ap=${this._state.floorState.ap}`);

    const ap = this._state.floorState.ap;
    const msg =
      ap === 0
        ? 'AP 耗尽，自动结束回合…'
        : `AP ${ap} 已无可行动作，自动结束回合…`;
    this._toast?.toast(msg);
    await delay(80); // 80ms：让玩家看到提示即可，不阻塞操作节奏

    // 重检：延迟期间可能已触发别的状态变化（如玩家手动点了结束回合按钮）
    if (this._busy || !this._state) return;
    if (this._state.status !== 'ACTIVE') return;
    if (this._state.floorState.status !== 'EXPLORING') return;
    if (this._hasViableActionWithCurrentAp()) return;

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

    if (ap >= AP_COST.MOVE) {
      const dirs: Direction[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
      for (const dir of dirs) {
        if (applyMove(this._state, dir).events.length > 0) return true;
      }
      // 4 方向全阻塞，落到 1AP 攻击/交互判断
    }

    if (ap < AP_COST.ATTACK) return false;

    const { range } = playerAttackPower(this._state.player);
    const hasTarget = fs.monsters.some(
      (m) =>
        m.aiState !== 'DEAD' && manhattan(m.pos, fs.player) <= range,
    );
    if (hasTarget) return true;

    const hasIceWallTarget = fs.entities.some(
      (e) => e.type === 'ICE_WALL' && !e.consumed && manhattan(e.pos, fs.player) <= range,
    );
    if (hasIceWallTarget) return true;

    const standingOnEntity = fs.entities.some(
      (e) => !e.consumed && e.pos.x === fs.player.x && e.pos.y === fs.player.y,
    );
    if (standingOnEntity) return true;

    return false;
  }

  private async _playEvents(events: PveEvent[]): Promise<void> {
    // 跟踪"当前事件归属哪个回合"：TURN_END / AP_ROLLED 自带 turn，期间所有怪物 MOVE
    // 都视为 TURN_END 那个旧回合的尾声，让战报栏分组直观（玩家操作 T2 → 回合结束 T2
    // → 怪物追击 T2 → 新回合 T3 掷骰）。
    let logTurn = this._state?.floorState.turn ?? 1;
    // 单次回放的 toast 等待次数上限：随楼层推进，怪物变多 → endTurn 一次产出的事件
    // （尤其多只怪物同时命中玩家的 PLAYER_DAMAGED）线性增多，若每条都 await delay，
    // _busy 解除前的总耗时会随楼层线性增长，表现为"游戏越久按钮越迟钝"。
    // 2026-06-11 真机测得 `apply.events 121ms` 是 _busy 唯一阻塞源；
    // 改 120→60ms + MAX 3→2，最坏 _busy 占用 360ms → 120ms，单次响应翻倍提速。
    // toast 节点本身仍保留 1.6s 自动消失，玩家阅读时间没真损失。
    const MAX_TOAST_DELAYS = 2;
    const TOAST_DELAY_MS = 60;
    let toastDelays = 0;
    // 蓄力重击「实际命中」橙圈：2026-06-15 改为仅在本回合事件回放中短暂展示，
    // 回放结束即清除，不再延续到玩家下一回合（避免被误读为"还会再炸一次"的预警）。
    let heavyStrikeResolvedThisBatch = false;

    for (const ev of events) {
      if (ev.type === 'TURN_END') logTurn = ev.turn;
      else if (ev.type === 'AP_ROLLED') logTurn = ev.turn;

      // 1) 战报栏（覆盖更广，包含 MOVE/TURN_END）
      const logEntry = describeForLog(ev, this._state);
      if (logEntry && this._log) {
        this._log.push(logTurn, logEntry.kind, logEntry.text);
      }

      // 2) Toast（仅展示关键反馈）
      const text = describeEvent(ev, this._state);
      if (text) {
        this._toast?.toast(text);
        if (toastDelays < MAX_TOAST_DELAYS) {
          await delay(TOAST_DELAY_MS);
          toastDelays++;
        }
      }

      // 3) 灵气强化 3 选 1 交互
      if (ev.type === 'ANIMA_STRENGTHEN' && this._toast) {
        const tChoice = perfNow();
        const choiceId = await this._toast.showStrengthenChoice(ev.choices);
        perfMark('blockingChoice.strengthen', tChoice);
        if (this._state) {
          this._state = applyStrengthen(this._state, choiceId).state;
          this._hud?.refresh(this._state);
          this._toast.toast('强化已生效');
          const info = STRENGTHEN_LABEL[choiceId] ?? { title: choiceId, desc: '' };
          const label = info.desc ? `${info.title}（${info.desc}）` : info.title;
          this._log?.push(this._state.floorState.turn, 'PLAYER_ACT', `✨ 强化生效：${label}`);
          await delay(420);
        }
      }

      // 3.1) 命运词条卷轴 3 选 1 交互（复用强化弹窗）
      if (ev.type === 'SCROLL_OFFER' && this._toast) {
        const choiceId = await this._toast.showStrengthenChoice(ev.options);
        if (this._state) {
          const result = claimScrollChoice(this._state, choiceId);
          this._state = result.state;
          this._hud?.refresh(this._state);
          this._toast.toast('卷轴词条已生效');
          this._log?.push(this._state.floorState.turn, 'PLAYER_ACT', `📜 卷轴生效:${choiceId}`);
          await delay(420);
        }
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

      // 3.58) 冰霜巨人狂暴冲锋执行：结算完毕，清除冲锋车道预警红圈；
      //       并让 Boss 大图标沿 from→to 逐格滑动（~1s），避免瞬移横跨多格。
      if (ev.type === 'CHARGE_EXECUTED') {
        this._map?.clearAoeWarning();
        const dx = Math.sign(ev.to.x - ev.from.x);
        const dy = Math.sign(ev.to.y - ev.from.y);
        if (dx !== 0 || dy !== 0) {
          const steps: Coord[] = [];
          let cur: Coord = { ...ev.from };
          while (cur.x !== ev.to.x || cur.y !== ev.to.y) {
            cur = { x: cur.x + dx, y: cur.y + dy };
            steps.push(cur);
          }
          const stepMs = Math.max(60, Math.min(200, 1000 / (steps.length + 1)));
          this._map?.moveBossIconTo(ev.from);
          await delay(stepMs);
          for (const cell of steps) {
            this._map?.moveBossIconTo(cell);
            await delay(stepMs);
          }
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
        const removedIndex = await this._toast.showTreeChoice('改写命运 · 舍弃一个未来（剩两个生效）', cards);
        perfMark('blockingChoice.destinyRewrite', tChoice);
        this._map?.clearAoeWarning(); // 模态关闭后清除 E4 预警圈
        if (this._state) {
          const safe = (removedIndex === 0 || removedIndex === 1 || removedIndex === 2) ? removedIndex : 0;
          const r = chooseDestinyRewrite(this._state, safe);
          this._state = r.state;
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

      // 4) 职业进阶选择（AC-15 M2）
      if (ev.type === 'CLASS_CAN_ADVANCE' && this._toast && this._state) {
        const tChoice = perfNow();
        const chosen = await this._toast.showClassAdvanceChoice(ev.available);
        perfMark('blockingChoice.classAdvance', tChoice);
        if (chosen && this._state) {
          const r = applyClassAdvance(this._state, chosen as ClassId);
          if (r.events.length > 0) {
            this._state = r.state;
            this._refreshAll();
            await this._playEvents(r.events);
          }
        }
      }

      // 5) 二阶觉醒确认（design §七）
      if (ev.type === 'CLASS_CAN_AWAKEN' && this._toast && this._state) {
        const tChoice = perfNow();
        const confirmed = await this._toast.showClassAwakenChoice(CLASS_CN[ev.classId] ?? ev.classId);
        perfMark('blockingChoice.classAwaken', tChoice);
        if (confirmed && this._state) {
          const r = applyClassAwaken(this._state);
          if (r.events.length > 0) {
            this._state = r.state;
            this._refreshAll();
            await this._playEvents(r.events);
          }
        }
      }
    }

    // 本回合事件回放结束：蓄力重击「实际命中」橙圈已展示完毕，延迟 1s 后清除（不延续到玩家
    // 下一回合）——回放刚结束就立即清除会一闪而过，玩家来不及看清范围；1s 后清除既能让
    // 玩家看清，又不会阻塞 _busy（不 await，提前返回）。若 1s 内已进入下一怪物回合，
    // _onEndTurn 的 clearAoeHit 会先清掉，这里的延迟清除即为空操作。
    if (heavyStrikeResolvedThisBatch) {
      void delay(1000).then(() => this._map?.clearAoeHit());
    }
  }

  /** 移动后被动拾取钥匙 / Boss 阵亡后生成传送门 / 阵亡与通关收尾（design §12, AC-8~AC-12）。 */
  private async _afterApply(): Promise<void> {
    if (!this._state) return;

    const floor = this._state.floorState;

    // 自动拾取钥匙（AC-8）
    const keyHere = floor.entities.find(
      (e) => e.type === 'KEY' && !e.consumed && e.pos.x === floor.player.x && e.pos.y === floor.player.y,
    );
    if (keyHere) {
      const tKey = perfNow();
      const r = pickKey(this._state, keyHere.id);
      if (r.events.length > 0) {
        this._state = r.state;
        this._refreshAll();
        await this._playEvents(r.events);
      }
      perfMark('afterApply.pickKey', tKey);
    }

    // 自动拾取职业碎片（AC-15）：踩到即获得，同步检测进阶触发条件
    if (this._state) {
      const fragHere = this._state.floorState.entities.find(
        (e) =>
          e.type === 'FRAGMENT' &&
          !e.consumed &&
          e.pos.x === this._state!.floorState.player.x &&
          e.pos.y === this._state!.floorState.player.y,
      );
      if (fragHere) {
        const tFrag = perfNow();
        const r = pickFragment(this._state, fragHere.id);
        if (r.events.length > 0) {
          this._state = r.state;
          this._refreshAll();
          await this._playEvents(r.events);
        }
        perfMark('afterApply.pickFragment', tFrag);
      }
    }

    const deadBoss = this._state.floorState.monsters.find((m) => m.type === 'BOSS' && m.aiState === 'DEAD');
    const hasPortal = this._state.floorState.entities.some((e) => e.type === 'PORTAL');
    if (deadBoss && this._state.floorState.hasKey && !hasPortal) {
      const tPortal = perfNow();
      const r = spawnPortal(this._state, deadBoss.id);
      if (r.events.length > 0) {
        this._state = r.state;
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
    if (!this._state) return;
    const { runSeed, floor } = this._state;
    this._toast?.toast('远征失败，局内进度已清空');
    await delay(1200);
    this._state = applyDeath(this._state).state;
    await this._settle(runSeed, floor, 'DEAD');
    SceneLoader.loadLobby();
  }

  private async _handleFloorCleared(): Promise<void> {
    if (!this._state) return;
    const clearedFloor = this._state.floor;
    const oldChapter = this._state.chapter;

    // 先存档（确保无论玩家选继续还是返回，进度都不会丢失）
    await this._autoSaveCurrentFloor();

    if (isBossFloor(clearedFloor) && this._toast) {
      // ── AC-19：章节 Boss 击败 → 进入营地 ──────────────────
      const campChoice = await this._toast.showCamp(
        oldChapter,
        this._state.player,
        CAMP_SHOP_ITEMS,
        (itemId) => {
          if (!this._state) return null;
          const result = applyShopBuy(this._state, itemId as CampItemId);
          if (result.events.length === 0) return null;
          this._state = result.state;
          this._hud?.refresh(this._state);
          const ev = result.events[0];
          if (ev && ev.type === 'SHOP_BUY') {
            this._log?.push(
              this._state.floorState.turn, 'LOOT',
              `🏕️ 营地购买：${ev.effect}（-${ev.cost} 金）`,
            );
          }
          return this._state.player;
        },
        (slot) => {
          if (!this._state) return null;
          const result = applySellEquip(this._state, slot);
          if (result.events.length === 0) return null;
          this._state = result.state;
          this._hud?.refresh(this._state);
          const ev = result.events[0];
          if (ev && ev.type === 'SELL_EQUIP') {
            this._log?.push(
              this._state.floorState.turn, 'LOOT',
              `⚒️ 变卖 ${ev.itemName}（+${ev.gold} 金）`,
            );
          }
          return this._state.player;
        },
        // 遗物宝箱回调：调 openRelicChest → 同步钻石（meta）+ 战报 + 返回新 player
        () => {
          if (!this._state || !this._meta) return null;
          const result = openRelicChest(this._state, this._meta.diamond ?? 0);
          if (result.events.length === 0) return null;
          this._state = result.state;
          this._meta = { ...this._meta, diamond: (this._meta.diamond ?? 0) + result.diamondDelta };
          this._hud?.refresh(this._state);
          // 战报 & toast 处理
          for (const ev of result.events) {
            const entry = describeForLog(ev, this._state);
            if (entry && this._state) this._log?.push(this._state.floorState.turn, entry.kind, entry.text);
            const toast = describeEvent(ev, this._state);
            if (toast) this._toast?.toast(toast);
          }
          // 云端钻石同步（异步触发，不阻塞 UI）
          if (result.diamondDelta !== 0) {
            void updatePveMeta({ diamond: result.diamondDelta }).catch(() => {});
          }
          let message = '';
          for (const ev of result.events) {
            if (ev.type === 'RELIC_CHEST_OPENED') {
              if (!ev.success) message = '未开出';
              else if (ev.refunded) message = '已持有，资源部分返还';
              else message = '开出新遗物！';
              break;
            }
          }
          return { ...this._state.player, message };
        },
        (() => {
          const relicId = CHAPTER_BOSS_RELIC[this._state.chapter] as RelicId | undefined;
          if (!relicId) return undefined;
          const def = RELIC_DEFS[relicId];
          return {
            costGold: RELIC_CHEST.COST_GOLD,
            costDiamond: RELIC_CHEST.COST_DIAMOND,
            currentDiamond: this._meta?.diamond ?? 0,
            relicName: def?.name ?? relicId,
            alreadyOwned: (this._state.player.relics ?? []).includes(relicId),
          };
        })(),
        {
          onUpgrade: (slot) => {
            if (!this._state) return null;
            const r = upgradeEquip(this._state, CAMP_BLACKSMITH_ID, slot);
            if (r.events.length === 0) return null;
            this._state = r.state;
            this._hud?.refresh(this._state);
            void this._playEvents(r.events);
            return this._state.player;
          },
          onReroll: (slot) => {
            if (!this._state) return null;
            const r = rerollEquipTrait(this._state, CAMP_BLACKSMITH_ID, slot);
            if (r.events.length === 0) return null;
            this._state = r.state;
            this._hud?.refresh(this._state);
            void this._playEvents(r.events);
            return this._state.player;
          },
        },
      );
      if (campChoice === 'quit') {
        SceneLoader.loadLobby();
        return;
      }
    } else {
      // ── 普通层通关：二选一确认弹窗 ─────────────────────────
      const choice = this._toast
        ? await this._toast.showConfirm(`第${oldChapter}章 · 第${clearedFloor}层通关！`, [
            { label: '继续远征 →', value: 'continue' },
            { label: '返回大厅', value: 'quit' },
          ])
        : 'continue';

      if (choice === 'quit') {
        SceneLoader.loadLobby();
        return;
      }
    }

    const r = advanceFloor(this._state);
    this._state = r.state;
    // 每层独立战报：进入新层时清空，避免历史堆积
    this._log?.clear();
    this._map?.clearAoeHit();
    this._map?.clearAoeWarning();
    this._refreshAll();

    if (r.state.status === 'COMPLETED') {
      this._toast?.toast('恭喜通关全部楼层！');
      await delay(1500);
      await this._settle(r.state.runSeed, r.state.floor, 'COMPLETED');
      SceneLoader.loadLobby();
      return;
    }

    await this._playEvents(r.events);

    // 章节边界提示（从营地出来后进入新章节）
    if (r.state.chapter > oldChapter) {
      this._toast?.toast(`⚔️ 开始探索第${r.state.chapter}章！`);
      this._log?.push(r.state.floorState.turn, 'SYSTEM', `⚔️ 第${r.state.chapter}章开始`);
      await delay(1600);
    }

    this._toast?.toast(`进入第${r.state.chapter}章 · 第${r.state.floor}层`);
  }

  // ── 存档与结算（design ddl-sql.md / AC-11, AC-12, AC-14） ─────

  /** 每完成一层自动存档；失败不阻塞继续游玩，仅提示（→ AC-11）。 */
  private async _autoSaveCurrentFloor(): Promise<void> {
    if (!this._state) return;
    try {
      await savePveFloor({
        runSeed: this._state.runSeed,
        chapter: this._state.chapter,
        floor: this._state.floor,
        player: this._state.player,
        floorState: this._state.floorState,
      });
    } catch (err) {
      this._toast?.toast(`存档失败：${err instanceof Error ? err.message : String(err)}`);
      await delay(600);
    }
  }

  /** 远征结束（死亡或通关）上报结算：奖励由服务端按已通关层数纯计算后入账（→ AC-12, AC-14）。
   *  改为阻塞式结算弹窗（让玩家主动确认后才返回大厅，以便看清命运碎片入账）。 */
  private async _settle(runSeed: number, floor: number, status: 'DEAD' | 'COMPLETED'): Promise<void> {
    try {
      const { rewards } = await settlePveRun({ runSeed, floor, status });

      // AC-20：结算后更新本地碎片/钻石余额快照，刷新 HUD
      if (rewards && this._meta) {
        this._meta = {
          ...this._meta,
          destinyShards: this._meta.destinyShards + (rewards.destinyShards ?? 0),
          diamond: this._meta.diamond + (rewards.diamond ?? 0),
        };
        this._hud?.refreshMeta(this._meta.destinyShards);
      }

      // 组装结算结果弹窗文字
      const emoji      = status === 'COMPLETED' ? '🎉' : '☠️';
      const statusText = status === 'COMPLETED' ? '通关完成！' : '远征结束';
      const lines      = [`${emoji} ${statusText}`, `已探索 ${floor} 层`];
      if (rewards?.diamond)       lines.push(`💎 钻石 +${rewards.diamond}`);
      if (rewards?.destinyShards) lines.push(`🔮 命运碎片 +${rewards.destinyShards}`);
      if (!rewards?.diamond && !rewards?.destinyShards) lines.push('（本次无奖励）');

      // 阻塞式弹窗：玩家按「确认」后才会继续（返回大厅）
      if (this._toast) {
        await this._toast.showConfirm(lines.join('\n'), [{ label: '确认', value: 'ok' }]);
      } else {
        await delay(2000);
      }
    } catch (err) {
      this._toast?.toast(`结算失败：${err instanceof Error ? err.message : String(err)}`);
      await delay(800);
    }
  }
}
