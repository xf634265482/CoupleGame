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
import { applyStrengthen } from '../core/AnimaSystem';
import { ACHIEVEMENT_DEFS, checkNewAchievements, collectCodexEntries } from '../core/AchievementSystem';
import type { AchievementDef, AchievementId } from '../core/AchievementSystem';
import { HEAVY_STRIKE_RANGE, isCellShadowedByRock } from '../core/bosses/GoblinChief';
import { chooseDestinyRewrite } from '../core/bosses/FateGuardian';
import { applySellBagEquip, applySellEquip, applyShopBuy, getCampShopItems, openRelicChest } from '../core/CampSystem';
import type { CampItemId } from '../core/CampSystem';
import { CHAPTER_BOSS_RELIC, RELIC_CHEST } from '../core/PveConstants';
import { applyClassAdvance, applyClassAwaken, pickFragment } from '../core/ClassSystem';
import { attackIceWall, playerAttack, playerAttackPower } from '../core/CombatSystem';
import {
  advanceFloor,
  devSkipToFloor,
  endTurn,
  resumeExpedition,
  startExpedition,
} from '../core/ExpeditionState';
import { interactPortal, openExit, pickKey, spawnPortal } from '../core/FloorRules';
import { isRevealed } from '../core/FogSystem';
import { checkLos } from '../core/LosSystem';
import { openChest } from '../core/LootSystem';
import { RELIC_DEFS } from '../core/RelicSystem';
import { claimScrollChoice, useScroll } from '../core/ScrollSystem';
import { applyMove } from '../core/MovementSystem';
import { resolveTreeChoice } from '../core/DestinyTreeSystem';
import { CAMP_BLACKSMITH_ID, rerollEquipTrait, upgradeEquip, useAltar, useHotSpring, useIdol } from '../core/NeutralEntities';
import { equipFromBag } from '../core/EquipHelper';
import { getBalancedActionCost } from '../core/PveBalance';
import type { Direction } from '../core/MovementSystem';
import { AP_COST, AWAKEN_FORMS, CLASS_FRAGMENTS_TO_ADVANCE, CLASS_FRAGMENTS_TO_AWAKEN, DEV_SKIP_TO_FLOOR, FLOORS_PER_CHAPTER, isBossFloor, LAVA_LORD_BURN_BURST_THRESHOLD, LAVA_LORD_BURN_TICKS, TOTAL_FLOORS } from '../core/PveConstants';
import type { ClassId } from '../core/PveConstants';
import type { ApplyResult, Coord, ExpeditionState, FixedEntity, Monster, MonsterType, PveEvent, PveMeta, RelicId } from '../core/PveTypes';
import { loadPveSave, loadPveMeta, startRun, savePveFloor, settlePveRun, updatePveMeta } from '../../network/PveService';
import type { PveSaveVO } from '../../network/PveService';
import { FogMapView } from '../views/FogMapView';
import { PveCharacterPanel } from '../views/PveCharacterPanel';
import { PVE_HUD_INFO_H, PveHudView } from '../views/PveHudView';
import type { LogKind } from '../views/PveMessageLog';
import { PveMessageLog } from '../views/PveMessageLog';
import { EQUIP_TRAIT_LABEL, PveToastView, STRENGTHEN_LABEL, strengthenInfo } from '../views/PveToastView';
import { getCachedSprite, loadUiSprite, preloadPveUi } from '../../ui/UiAssets';
import { ensureChapterAssets, isChapterReady, preloadChapter } from '../ChapterResourceLoader';
import { LoadingOverlay } from '../../ui/LoadingOverlay';
import { Effects } from '../../fx/Effects';
import { playSfx, SFX_IDS } from '../../audio/AudioManager';
import { TutorialGuideManager } from '../tutorial/TutorialGuideManager';

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
      if (ev.equip) parts.push(ev.bagged ? `入包:${ev.equip.name}` : `装备:${ev.equip.name}`);
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
    case 'IDOL_BLESSING': {
      const idolDesc = ev.effect === 'MAX_HP' ? `HP 上限 +${ev.maxHpBonus}`
        : ev.effect === 'ATTACK' ? `攻击 +${ev.attackBonus}`
        : `护甲 +${ev.armorBonus}`;
      return { kind: 'LOOT', text: `🛐 神像祝福（${idolDesc}）` };
    }
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
      return { kind: 'SYSTEM', text: `🌟 觉醒成功 → ${form.name}（核心天赋「${form.coreName}」）` };
    }
    case 'AWAKEN_EFFECT_TRIGGERED':
      return { kind: 'SYSTEM', text: `觉醒效果触发 · ${STRENGTHEN_LABEL[ev.effectId]?.title ?? ev.effectId}` };
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
      return { kind: 'LOOT', text: `⚒️ 铁匠洗炼 ${SLOT_CN[ev.slot] ?? ev.slot}（词条 → ${EQUIP_TRAIT_LABEL[ev.newTrait] ?? '特殊词条'}）` };
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
      if (!ev.success) return { kind: 'SYSTEM', text: '🎁 遗物宝箱：未开出（金币与星尘已扣）' };
      const def = ev.relicId ? RELIC_DEFS[ev.relicId] : undefined;
      if (ev.refunded) {
        return {
          kind: 'LOOT',
          text: `🎁 遗物宝箱：已持有 ${def?.name ?? ev.relicId}，返还 +${ev.refundGold ?? 0} 金 / +${ev.refundDiamond ?? 0} 星尘`,
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
      if (ev.equip && ev.bagged) return `🎒 ${ev.equip.name} 已入包（槽位已占）`;
      return null;
    case 'PORTAL_SPAWNED':
      return '🌀 传送门浮现，踏入即可通关（可先继续探索）';
    case 'IDOL_BLESSING': {
      const idolToast = ev.effect === 'MAX_HP' ? `HP 上限 +${ev.maxHpBonus}`
        : ev.effect === 'ATTACK' ? `攻击 +${ev.attackBonus}`
        : `护甲 +${ev.armorBonus}`;
      return `🛐 神像赐予祝福 · ${idolToast}`;
    }
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
      return `🌟 [${CLASS_CN[ev.classId] ?? ev.classId}] 觉醒为「${form.name}」，获得「${form.coreName}」：${form.coreDesc}`;
    }
    case 'AWAKEN_EFFECT_TRIGGERED':
      return null;
    case 'SHOP_BUY':
      return `🏕️ 购买成功 · ${ev.effect}`;
    case 'ACHIEVEMENT_UNLOCKED':
      return `🏆 成就解锁：${ev.name}`;
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
      if (ev.refunded) return `🎁 已持有，返还 ${ev.refundGold ?? 0} 金 / ${ev.refundDiamond ?? 0} 星尘`;
      return `🎁 开出遗物：${def?.name ?? ev.relicId}！`;
    }
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
  /** 局外元进度快照（成就/图鉴/命运碎片）；bootstrap 异步加载，失败时置空降级。 */
  private _meta: PveMeta | null = null;
  private _balanceSnapshot: PveSaveVO['balanceSnapshot'] | null = null;
  private _map: FogMapView | null = null;
  private _mapRoot: Node | null = null;
  private _hud: PveHudView | null = null;
  private _toast: PveToastView | null = null;
  private _log: PveMessageLog | null = null;
  private _character: PveCharacterPanel | null = null;
  private _busy = false;
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
  /** 元进度云端上传防抖：累积所有新成就/图鉴，闲置 2 秒后一次性发出。
   *  wx.cloud.callFunction 的 JSBridge marshaling 是同步阻塞主线程的（真机实测 500ms+），
   *  每个事件单独触发会让玩家感受到周期性卡顿。改为批量上传，移动/攻击期间完全不接触云函数。 */
  private _pendingMetaUpload: {
    newAchievements: AchievementId[];
    codexMonsters: string[];
    codexEquipment: string[];
  } = { newAchievements: [], codexMonsters: [], codexEquipment: [] };
  private _metaUploadTimer: ReturnType<typeof setTimeout> | null = null;
  private _cachedMoveTargets: Coord[] = [];
  private _cachedAttackTarget: Monster | undefined;
  private _cachedAttackEntityTarget: FixedEntity | undefined;
  private _tutorialGuide: TutorialGuideManager | null = null;

  private _clearMoveGhost(entityId: string): void {
    const entry = this._moveGhosts.get(entityId);
    if (!entry) return;
    if (entry.ghost?.isValid) entry.ghost.destroy();
    // 仅在目标格已揭露时恢复可见性：迷雾格的 OccupantArt 不应被激活，
    // 否则会导致迷雾内出现残留 sprite（表现为怪物在雾中显示为玩家图标）。
    const toRevealed = this._state?.floorState.revealed[entry.finalTo.y]?.[entry.finalTo.x] ?? false;
    if (toRevealed) this._map?.setOccupantVisible(entry.finalTo, true);
    if (entry.restoreBossIcon) this._map?.setBossIconVisible(true);
    this._moveGhosts.delete(entityId);
  }

  private _clearAllMoveGhosts(): void {
    for (const entry of this._moveGhosts.values()) {
      if (entry.ghost?.isValid) entry.ghost.destroy();
      // 必须恢复目标格可见性：_clearAllMoveGhosts 可能在 tween 完成前被调用（快速连点），
      // tween 的 .call() 回调此时不会再执行，若不在这里恢复会永久隐藏目标格。
      // 同 _clearMoveGhost：仅揭露格才恢复，避免迷雾格 OccupantArt 被错误激活。
      const toRevealed = this._state?.floorState.revealed[entry.finalTo.y]?.[entry.finalTo.x] ?? false;
      if (toRevealed) this._map?.setOccupantVisible(entry.finalTo, true);
      if (entry.restoreBossIcon) this._map?.setBossIconVisible(true);
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
        resolve();
        return;
      }
      if (ev.entityId === 'PLAYER') playSfx(SFX_IDS.PLAYER_MOVE);
      const fromWp = this._map.getCellWorldPosition(entry.current);
      const toWp = this._map.getCellWorldPosition(ev.to);
      entry.ghost.setPosition(fromWp.x, fromWp.y, 0);
      entry.current = ev.to;
      tween(entry.ghost)
        .to(0.08, { position: new Vec3(toWp.x, toWp.y, 0) }, { easing: 'quadOut' })
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
   * 近战 lunge 通用动画（玩家/怪物均可）：克隆攻击者真身，0.08s 冲到目标 70% 位置 → 0.08s 回防 → 销毁克隆。
   * 期间攻击者真身 setOccupantVisible(false) 隐藏；onContact 在冲到位时触发（目标 flash+伤害数字）。
   * 每个攻击者格独立计数：多发/溅射或多怪夹击不会互相干扰真身显隐。
   *
   * 全程 0.16s 纯 tween。所有 ghost 注册到 _attackLungeGhosts，下一轮 _apply 启动会强制清理，
   * 防止 tween 被中断（如玩家快速连点）导致 ghost 残留 + 攻击者永久隐藏。
   */
  private _playMeleeLunge(attackerPos: Coord, targetPos: Coord, onContact: () => void): void {
    if (!this._map) { onContact(); return; }
    const ghost = this._map.cloneOccupantForFx(attackerPos);
    if (!ghost) { onContact(); return; }
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
        if (hidden && this._map) this._map.setOccupantVisible(hidden, true);
        this._attackLungeHidden.delete(key);
      } else {
        this._attackLungeCount.set(key, cur);
      }
    };
    tween(ghost)
      .to(0.08, { position: new Vec3(peakX, peakY, 0) }, { easing: 'quadOut' })
      .call(() => onContact())
      .to(0.08, { position: new Vec3(fromWp.x, fromWp.y, 0) }, { easing: 'quadIn' })
      .call(cleanup)
      .start();
  }

  /**
   * 远程攻击投射物：克隆攻击者缩到 30% 作为"发射物"占位，从 attacker 飞到 target，
   * 0.18s quadIn（加速感模拟飞行），命中瞬间触发 onContact（目标 flash + 伤害数字）后销毁。
   * 攻击者本体不动、不隐藏；不动相机、不重建 Graphics，对主循环零影响。
   * ghost 注册到 _attackLungeGhosts，下一轮 _apply 启动会强制清理。
   */
  private _playRangedShot(attackerPos: Coord, targetPos: Coord, onContact: () => void): void {
    if (!this._map) { onContact(); return; }
    const projectile = this._map.cloneOccupantForFx(attackerPos);
    if (!projectile) { onContact(); return; }
    const fromWp = this._map.getCellWorldPosition(attackerPos);
    const toWp = this._map.getCellWorldPosition(targetPos);
    projectile.setParent(this.node);
    projectile.setPosition(fromWp.x, fromWp.y, 0);
    projectile.setScale(0.3, 0.3, 1);
    this._attackLungeGhosts.add(projectile);
    tween(projectile)
      .to(0.18, { position: new Vec3(toWp.x, toWp.y, 0) }, { easing: 'quadIn' })
      .call(() => {
        onContact();
        this._attackLungeGhosts.delete(projectile);
        if (projectile.isValid) projectile.destroy();
      })
      .start();
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

  /**
   * 元进度云上传：累积新成就/图鉴变更，闲置 4 秒后一次性发请求。
   * 玩家连续操作期间不接触云函数，避免 JSBridge 同步阻塞主线程造成卡顿。
   * 4s 防抖（原 2s）：延长窗口让上传更倾向于发生在层间/营地等自然停顿处，
   * 避免云回调在玩家移动 tween（80ms）窗口内到达阻塞 Cocos 调度器。
   */
  private _schedulePendingMetaUpload(): void {
    if (this._metaUploadTimer) clearTimeout(this._metaUploadTimer);
    this._metaUploadTimer = setTimeout(() => {
      this._metaUploadTimer = null;
      const pending = this._pendingMetaUpload;
      if (pending.newAchievements.length === 0
        && pending.codexMonsters.length === 0
        && pending.codexEquipment.length === 0) return;
      this._pendingMetaUpload = { newAchievements: [], codexMonsters: [], codexEquipment: [] };
      // 二次 setTimeout(0)：让 wx.cloud.callFunction 的同步 marshaling 在下一 macrotask 启动，
      // 此刻玩家通常已停下操作，主线程被阻塞 500ms 用户也感知不到。
      setTimeout(() => {
        void updatePveMeta(pending).catch(() => {});
      }, 0);
    }, 4000);
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
      onUseScroll: () => this._onUseScroll(),
      onOpenBag: () => void this._onOpenBag(),
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

  /** HUD「角色」按钮回调：弹出角色详情面板（基础属性 / 装备 / 词条 / 职业碎片 / 成就）。 */
  private _onShowCharacter(): void {
    if (!this._state || !this._character) return;
    this._character.show(this._state, this._meta ?? undefined);
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
          scrolls: this._state.player.scrolls ?? 0,
          classFragments: this._state.player.classFragments,
          classId: this._state.player.classId,
          awakenForm: this._state.player.awakenForm,
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
      await this._autoSaveCurrentFloor();
      SceneLoader.loadLobby();
    } finally {
      this._busy = false;
    }
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
        this._balanceSnapshot = metaRes.value.balanceSnapshot ?? null;
        this._hud?.refreshMeta(this._meta.destinyShards);
      }

      if (saveRes.status === 'rejected') {
        await this._handleBootstrapLoadFailure(saveRes.reason);
        return;
      }
      const { save } = saveRes.value;

      if (!save) {
        await this._beginNewRun();
      } else if (save.floor >= TOTAL_FLOORS) {
        this._toast?.toast('正在补发上次远征的通关结算…');
        const settled = await this._settle(save.runSeed, save.floor, 'COMPLETED');
        if (settled) SceneLoader.loadLobby();
        return;
      } else {
        await this._resumeRun(save);
      }
    } finally {
      this._busy = false;
    }
  }

  /** 开启新远征：runSeed 由服务端 startRun 生成（→ AC-503/504，客户端不可重试套取有利地图）。 */
  private async _beginNewRun(): Promise<void> {
    let res: Awaited<ReturnType<typeof startRun>>;
    try {
      res = await startRun();
    } catch (err) {
      this._toast?.toast(`开始远征失败，请检查网络：${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    if (res.resume) {
      const resumed = await this._reloadAndResumeActiveSave('检测到已有进行中的远征，正在恢复云端存档…');
      if (!resumed) {
        this._toast?.toast('远征状态恢复失败：云端存在活动存档，但未能重新载入');
      }
      return;
    }
    const seed = res.runSeed;
    this._state = startExpedition(seed, this._meta ?? undefined, this._balanceSnapshot ?? undefined);
    // ── 开发调试：跳层 ────────────────────────────────────
    if (DEV_SKIP_TO_FLOOR > 1) {
      this._state = devSkipToFloor(this._state, DEV_SKIP_TO_FLOOR);
      console.warn(
        `[DEV] 已跳至第 ${DEV_SKIP_TO_FLOOR} 层。` +
          `上线前将 PveConstants.DEV_SKIP_TO_FLOOR 改回 0！`,
      );
    }
    // ─────────────────────────────────────────────────────
    // 常规新远征从第1章开始（主包背景，isChapterReady=true）；仅 DEV_SKIP 跳到第2-5章时阻塞加载。
    if (!(await this._ensureChapterReady(this._state.chapter))) return;
    this._rebuildInputHints();
    this._log?.clear();
    this._refreshAll();
    this._toast?.toast(`远征开始 · 第${this._state.chapter}章 第${this._state.floor}层`);
    this._log?.push(this._state.floorState.turn, 'SYSTEM', `远征开始 · 第${this._state.floor}层`);
    // startExpedition 不返回 events，手动 toast 首回合掷骰（AC-2 表现）。
    this._showFloorEntryAlerts();
    void this._toastInitialApRoll();
    // 命运树 E2/E3「三选一」待选项（startExpedition 时已固化到 pendingTreeChoices）。
    void this._processPendingTreeChoices();
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

  private async _reloadAndResumeActiveSave(loadingText?: string): Promise<boolean> {
    if (loadingText) this._toast?.toast(loadingText);
    try {
      const saveRes = await loadPveSave();
      if (!saveRes.save) return false;
      await this._resumeRun(saveRes.save);
      return true;
    } catch (err) {
      this._toast?.toast(`恢复远征存档失败：${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
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
      this._rebuildInputHints();
      this._hud?.refresh(this._state);
      this._toast.toast('命运馈赠已生效');
      await delay(420);
    }
  }

  private async _resumeRun(save: PveSaveVO): Promise<void> {
    this._balanceSnapshot = save.balanceSnapshot ?? this._balanceSnapshot ?? null;
    const result = resumeExpedition(
      save.runSeed,
      save.floor,
      save.player,
      save.floorState,
      this._balanceSnapshot ?? undefined,
    );
    this._state = result.state;
    // 续档可能直接落在第2-5章：先确保该章资源就绪，再渲染（需求#2）。
    if (!(await this._ensureChapterReady(this._state.chapter))) return;
    this._rebuildInputHints();
    this._log?.clear();
    this._refreshAll();
    this._toast?.toast(`继续远征 · 第${this._state.chapter}章 第${this._state.floor}层`);
    this._log?.push(this._state.floorState.turn, 'SYSTEM', `继续远征 · 第${this._state.floor}层`);
    // resumeExpedition 已 emit AP_ROLLED，但 _resumeRun 未走 _apply→_playEvents 路径，需手动回放。
    this._showFloorEntryAlerts();
    if (this._state.floorState.status === 'CLEARED') {
      await this._handleFloorCleared();
      return;
    }
    if (result.events.length > 0) {
      await this._playEvents(result.events);
    }
  }

  /** 进新远征时手动 toast 首回合的 AP_ROLLED（startExpedition 不返回 events）。 */
  private async _toastInitialApRoll(): Promise<void> {
    if (!this._state) return;
    const { turn, dice, ap } = this._state.floorState;
    await this._playEvents([{ type: 'AP_ROLLED', turn, dice, ap }]);
  }

  private _floorInChapter(floor: number): number {
    return ((floor - 1) % FLOORS_PER_CHAPTER) + 1;
  }

  private _showFloorEntryAlerts(): void {
    if (!this._state || !this._toast) return;
    const { chapter, floor, floorState } = this._state;
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
    LoadingOverlay.update({
      text: `正在进入第${chapter}章…`,
      progress: 1,
      subtitle: '新的命运篇章已经展开',
    });
    await delay(260);
    LoadingOverlay.hide();
    return true;
    LoadingOverlay.show(this.node, `正在加载第${chapter}章…`, {
      timeoutMs: 15000,
      hideOnTimeout: false,
      onTimeout: () => LoadingOverlay.update(`第${chapter}章加载较慢，仍在继续准备…`),
    });
    LoadingOverlay.show(this.node, `正在加载第${chapter}章…`);
    // 加载本章全部资产（背景 + 怪物图标 + 章节地形），全部注入 UiAssets 缓存后
    // FogMapView 同步取图才能命中；任一失败回大厅。
    LoadingOverlay.show(this.node, `正在加载第${chapter}章…`, {
      timeoutMs: 15000,
      hideOnTimeout: false,
      onTimeout: () => LoadingOverlay.update(`第${chapter}章加载较慢，仍在继续准备…`),
    });
    const ok = await ensureChapterAssets(chapter, (text) => LoadingOverlay.update(text)).catch(() => false);
    LoadingOverlay.hide();
    if (!ok) {
      this._toast?.toast(`第${chapter}章资源加载失败，请返回大厅重新远征`);
      await delay(1200);
      SceneLoader.loadLobby();
      return false;
    }
    return true;
  }

  private _refreshAll(): void {
    if (!this._state) return;
    this._map?.refresh(this._state.floorState, this._state.player.classId, this._state.player.awakenForm);
    this._hud?.refresh(this._state);
    this._map?.showMoveRange(this._cachedMoveTargets);
    this._map?.showAttackTarget(this._cachedAttackTarget?.pos ?? this._cachedAttackEntityTarget?.pos ?? null);
    this._syncTutorialGuide([]);
  }

  private _syncTutorialGuide(events: PveEvent[]): void {
    if (!this._state) return;
    this._tutorialGuide ??= new TutorialGuideManager();
    this._tutorialGuide.bind(this._state);
    if (!this._tutorialGuide.isActive(this._state)) {
      this._toast?.hideGuideBubble();
      this._map?.clearTutorialFocus();
      return;
    }
    if (events.length > 0 && this._tutorialGuide.advanceIfNeeded(this._state, events)) {
      this._tutorialGuide.bind(this._state);
    }
    const message = this._tutorialGuide.getMessage();
    if (message) this._toast?.showGuideBubble(message);
    else this._toast?.hideGuideBubble();
    const allowedCells = this._tutorialGuide.getAllowedCells();
    if (allowedCells.length > 0) this._map?.showTutorialFocus(allowedCells);
    else this._map?.clearTutorialFocus();
  }

  private _isTutorialBlocked(action: 'MOVE' | 'ATTACK' | 'INTERACT' | 'TAP_CELL', coord?: Coord): boolean {
    if (!this._state || !this._tutorialGuide || !this._tutorialGuide.isActive(this._state)) return false;
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
    const dirs: Direction[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
    const targets = new Map<string, Coord>();
    for (const dir of dirs) {
      const result = applyMove(this._state, dir);
      if (result.events.length === 0) continue;
      const pos = result.state.floorState.player;
      targets.set(`${pos.x},${pos.y}`, pos);
    }
    return [...targets.values()];
  }

  /**
   * "攻击"按钮当前会命中的目标（与 _onAttack 选怪规则一致：曼哈顿距离最近，平局取数组靠前者）。
   * 仅返回攻击范围内的目标——超出范围的怪物即使是"最近"，攻击也是 no-op，
   * 高亮其所在格还可能暴露未揭示迷雾中的怪物位置（信息泄露 + 视觉上像 bug 的空框）。
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
   * 与 _currentAttackTarget 同规则：范围内最近者优先。
   */
  private _computeAttackTargetEntity(): FixedEntity | undefined {
    if (!this._state) return undefined;
    const floor = this._state.floorState;
    const { range } = playerAttackPower(this._state.player, this._state.balanceSnapshot, this._state.chapter);
    return floor.entities
      .filter((e) =>
        e.type === 'ICE_WALL' &&
        !e.consumed &&
        manhattan(floor.player, e.pos) <= range &&
        isRevealed(floor.revealed, e.pos),
      )
      .sort((a, b) => manhattan(floor.player, a.pos) - manhattan(floor.player, b.pos))[0];
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
    const result = applyMove(this._state, dir);
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
      const effectiveCost = moveCost + slowPenalty;
      if (noViableDir) {
        // 4 方向全 noop：可能是 AP 不够（含 debuff 推高成本）、全被怪/石头/边界堵死。
        this._toast?.toast(apNow < effectiveCost ? `行动力不足（剩余 ${apNow}，移动需要 ${effectiveCost}）` : '无路可走');
      } else if (apNow < effectiveCost) {
        // 某些方向靠靴子首次免费通过了 dryRun，但此方向有实体阻挡且 AP 实际不足。
        this._toast?.toast(`行动力不足（剩余 ${apNow}，移动需要 ${effectiveCost}）`);
      } else {
        this._toast?.toast('该方向无法移动');
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
    if (this._busy || !this._state) return;
    if (this._isTutorialBlocked('TAP_CELL', coord)) return;
    const monster = this._state.floorState.monsters.find(
      (m) => m.aiState !== 'DEAD' && m.pos.x === coord.x && m.pos.y === coord.y,
    );
    if (monster) {
      this._hud?.focusMonster(monster.id);
      this._attack(monster.id, true);
      return;
    }
    const wall = this._state.floorState.entities.find(
      (e) => e.type === 'ICE_WALL' && !e.consumed && e.pos.x === coord.x && e.pos.y === coord.y,
    );
    if (wall) {
      this._attackIceWall(wall.id, true);
      return;
    }
    // 点玩家所在格 + 该格有可交互实体（宝箱/钥匙/出口/传送门/神像/温泉/祭坛/铁匠）→ 触发互动
    const playerPos = this._state.floorState.player;
    if (coord.x === playerPos.x && coord.y === playerPos.y) {
      const INTERACTABLE_TYPES = new Set([
        'CHEST', 'KEY', 'EXIT', 'PORTAL', 'IDOL', 'HOT_SPRING', 'ALTAR', 'BLACKSMITH',
      ]);
      const hasInteractable = this._state.floorState.entities.some(
        (e) => !e.consumed
          && e.pos.x === coord.x
          && e.pos.y === coord.y
          && INTERACTABLE_TYPES.has(e.type),
      );
      if (hasInteractable) {
        this._onInteract(true);
        return;
      }
    }
    // 点空地/远处：朝玩家→目标的主轴方向走一步（Y 轴反向：UP={x:0,y:-1}）。
    // 远距离格也支持，玩家每点一下走一格，方向选择主导轴；同距优先水平。
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
    if (this._busy || !this._state) return;
    if (!tutorialBypass && this._isTutorialBlocked('INTERACT')) return;
    const floor = this._state.floorState;
    // 多实体共格时按"可交互优先"挑选：流沙巨蝎冒出会在落点留永久 SAND_PIT，
    // Boss 死后 spawnPortal 把 PORTAL 加到同一格，SAND_PIT 先入数组导致 find 命中
    // SAND_PIT → 落到 else 分支死锁玩家。LAVA_TILE/SHATTERED_ICE 等覆盖物同理。
    const INTERACTABLE = new Set(['BLACKSMITH', 'PORTAL', 'EXIT', 'CHEST', 'IDOL', 'HOT_SPRING', 'ALTAR']);
    const here = floor.entities.filter(
      (e) => !e.consumed && e.pos.x === floor.player.x && e.pos.y === floor.player.y,
    );
    const entity = here.find((e) => INTERACTABLE.has(e.type)) ?? here[0];
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
      (slot) => {
        if (!this._state) return null;
        const r = rerollEquipTrait(this._state, entityId, slot);
        if (r.events.length === 0) return null;
        this._state = r.state;
        this._rebuildInputHints();
        this._refreshAll();
        void this._playEvents(r.events);
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

    try {

    // fx 死亡退场：必须在 state 切换 + _refreshAll 之前，用旧 state 找怪物坐标，
    // 复制当前 OccupantArt 画面成临时节点；refresh 把原节点隐藏后，临时节点继续飘走。
    this._spawnKillFloaters(this._state, result.events);

    this._state = result.state;
    this._rebuildInputHints();
    const tRefresh = perfNow();
    this._refreshAll();
    perfMark('apply.refreshAll', tRefresh, `events=${result.events.length}`);

    // 移动动画：_refreshAll 已把玩家渲染到新格，先隐藏新格图像，待幽灵滑到位后还原（bug1）
    const finalMoveTargets = new Map<string, Coord>();
    for (const ev of result.events) {
      if (ev.type === 'MOVE') finalMoveTargets.set(ev.entityId, ev.to);
    }
    for (const [entityId, to] of finalMoveTargets) {
      if (!this._moveGhosts.has(entityId)) continue;
      this._map?.setOccupantVisible(to, false);
      const movedBoss = this._state.floorState.monsters.find((monster) => monster.id === entityId && Boolean(monster.bossId));
      if (movedBoss) this._map?.setBossIconVisible(false);
    }

    const tEvents = perfNow();
    await this._playEvents(result.events);
    perfMark('apply.events', tEvents);
    this._syncTutorialGuide(result.events);

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

    } catch (err) {
      // 任何 _apply 内部抛错都必须保证 _busy 被释放，否则后续所有输入会被永久拦截
      // （表现为玩家"卡住"）。把错误丢给 console，UI 由调用方下次 refresh 修正。
      console.error('[PVE] _apply error:', err);
    } finally {
      this._busy = false;
      perfMark('apply.total', t0, `events=${result.events.length}`);
    }
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
        tutorialCompleted: this._meta?.tutorialCompleted ?? false,
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
      // 2026-06-25：累积到 _pendingMetaUpload，统一防抖上传。
      // wx.cloud.callFunction 的 JSBridge marshaling 在主线程是同步阻塞的，
      // 每个事件单独发会让玩家感受到周期性卡顿（真机实测 apply.meta 587ms）。
      this._pendingMetaUpload.newAchievements.push(...newAch);
      this._schedulePendingMetaUpload();
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
        tutorialCompleted: this._meta?.tutorialCompleted ?? false,
      };
      this._pendingMetaUpload.codexMonsters.push(...newMon);
      this._pendingMetaUpload.codexEquipment.push(...newEq);
      this._schedulePendingMetaUpload();
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
        (e.type === 'CHEST' ||
          e.type === 'EXIT' ||
          e.type === 'PORTAL' ||
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
   * - ATTACK：怪物受击 → flash 红 + damageNumber（不动节点位置，避免重影/偏移）
   * - PLAYER_DAMAGED：玩家受击 → flash 红 + damageNumber（去掉 hit shake 与 cameraShake，根除偏移与卡顿）
   * - KILL：怪物死亡 → float + fade（轻量退场提示，避免被回放主循环阻塞）
   *
   * 节点丢失（grid 未初始化 / EntityArt 缺失）时静默跳过，确保 fx 失败不影响主流程。
   */
  private _playFxFor(ev: PveEvent): void {
    if (!this._state || !this._map) return;
    switch (ev.type) {
      case 'ATTACK': {
        // 玩家攻击：距离 1 走近战 lunge；距离 ≥2 走远程投射物。
        const target = this._state.floorState.monsters.find((m) => m.id === ev.targetId);
        if (!target) break;
        const targetNode = this._map.getOccupantArtAt(target.pos);
        const playerPos = this._state.floorState.player;
        const dist = Math.abs(playerPos.x - target.pos.x) + Math.abs(playerPos.y - target.pos.y);
        const onContact = () => {
          if (targetNode) {
            void Effects.flash(targetNode, { color: new Color(255, 80, 80, 255) });
            if (ev.damage > 0) {
              playSfx(SFX_IDS.ATTACK_HIT);
              void Effects.damageNumber(targetNode, ev.damage);
            }
          }
        };
        if (dist <= 1) this._playMeleeLunge(playerPos, target.pos, onContact);
        else this._playRangedShot(playerPos, target.pos, onContact);
        break;
      }
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
          if (dist === 1) this._playMeleeLunge(src.pos, playerPos, onContact);
          else this._playRangedShot(src.pos, playerPos, onContact);
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
      case 'FRAGMENT_PICKED': {
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
        const node = this._map.getOccupantArtAt(this._state.floorState.player);
        if (!node) break;
        if (ev.equip) {
          playSfx(SFX_IDS.REWARD_GET);
          // 装备掉落屏幕级强反馈：全屏金光闪烁 + 玩家位置脉冲 + 弹窗
          this._playScreenFlash(new Color(255, 215, 90, 255), 130);
          void Effects.flash(node, { color: new Color(255, 215, 90, 255), times: 4, duration: 0.5 });
          void Effects.buffGain(node, { strength: 1.6 });
          void Effects.pop(node, { strength: 1.4 });
          this._toast?.toastImportant(`🎁 获得装备：${ev.equip.name}`);
        } else if (ev.anima && ev.anima > 0) {
          playSfx(SFX_IDS.REWARD_GET);
          void Effects.flash(node, { color: new Color(200, 130, 240, 255) });
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
      // ── 职业进阶/觉醒：玩家位置强力 buffGain（金色 pop+flash） ──
      case 'CLASS_ADVANCED':
      case 'CLASS_AWAKENED': {
        const node = this._map.getOccupantArtAt(this._state.floorState.player);
        if (node) void Effects.buffGain(node, { strength: 1.6 });
        void Effects.cameraPunch({ strength: 0.8 });
        break;
      }
      case 'AWAKEN_EFFECT_TRIGGERED': {
        const playerNode = this._map.getOccupantArtAt(this._state.floorState.player);
        const isExecute = ev.effectId === 'awakened_execute';
        const isSniper = ev.effectId === 'awakened_power_shot';
        const isShadow = ev.effectId === 'awakened_shadow_strike' || ev.effectId === 'awaken_shadow_trade';
        if (playerNode) {
          const color = isShadow
            ? new Color(180, 100, 255, 255)
            : isExecute ? new Color(255, 80, 80, 255)
              : new Color(255, 196, 90, 255);
          void Effects.flash(playerNode, { color, times: isExecute ? 2 : 1 });
        }
        if (isSniper || isExecute) void Effects.cameraPunch({ strength: isExecute ? 1.2 : 0.7 });
        break;
      }
      // ── 命运树 buff 生效（开局应用）：玩家 buffGain ──
      case 'TREE_BONUSES_APPLIED': {
        const node = this._map.getOccupantArtAt(this._state.floorState.player);
        if (node) void Effects.buffGain(node);
        break;
      }
      // ── 传送门生成：在 pos 处 pop 浮现 ──
      case 'PORTAL_SPAWNED': {
        const node = this._map.getEntityArtAt(ev.pos);
        if (node) void Effects.pop(node, { strength: 1.4 });
        playSfx(SFX_IDS.DOOR_OPEN);
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
      // ── 成就解锁：去掉相机效果，弹窗已足够 ──
      case 'ACHIEVEMENT_UNLOCKED':
        break;
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

    for (const ev of events) {
      if (ev.type === 'TURN_END') logTurn = ev.turn;
      else if (ev.type === 'AP_ROLLED') logTurn = ev.turn;

      // 0) fx 程序动画：受击三件套（hit + damageNumber + cameraShake）。
      // 节点查找走 _state 的"最终态"：怪物 KILL 后仍保留在 monsters 列表（aiState=DEAD），
      // 玩家位置即 floorState.player —— 都能稳定拿到 EntityArt 节点。
      if (ev.type === 'MOVE') await this._playMoveFx(ev);
      else this._playFxFor(ev);

      // 1) 战报栏（覆盖更广，包含 MOVE/TURN_END）
      const logEntry = describeForLog(ev, this._state);
      if (logEntry && this._log) {
        this._log.push(logTurn, logEntry.kind, logEntry.text);
      }

      // 2) Toast（仅展示关键反馈）
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
        ]);
        if (bossImportant.has(ev.type)) this._toast?.toastImportant(text);
        else this._toast?.toast(text);
        // 不再 await delay：避免 toast 阻塞事件回放主循环导致 fx 动画"卡一下"。
      }

      // 3) 灵气强化 3 选 1 交互
      if (ev.type === 'ANIMA_STRENGTHEN' && this._toast) {
        const tChoice = perfNow();
        const choiceId = await this._toast.showStrengthenChoice(ev.choices);
        perfMark('blockingChoice.strengthen', tChoice);
        if (this._state) {
          this._state = applyStrengthen(this._state, choiceId).state;
          this._rebuildInputHints();
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
          this._rebuildInputHints();
          this._hud?.refresh(this._state);
          this._toast.toast('卷轴词条已生效');
          {
            const info = strengthenInfo(choiceId);
            this._log?.push(this._state.floorState.turn, 'PLAYER_ACT', `📜 卷轴生效：${info.title}（${info.desc}）`);
          }
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
        const removedIndex = await this._toast.showTreeChoice('改写命运 · 舍弃一个未来（剩两个生效）', cards);
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

      // 4) 职业进阶选择（AC-15 M2）
      if (ev.type === 'CLASS_CAN_ADVANCE' && this._toast && this._state) {
        const tChoice = perfNow();
        const chosen = await this._toast.showClassAdvanceChoice(ev.available);
        perfMark('blockingChoice.classAdvance', tChoice);
        if (chosen && this._state) {
          const r = applyClassAdvance(this._state, chosen as ClassId);
          if (r.events.length > 0) {
            this._state = r.state;
            this._rebuildInputHints();
            this._refreshAll();
            await this._playEvents(r.events);
          }
        }
      }

      // 5) 二阶觉醒确认（design §七）
      if (ev.type === 'CLASS_CAN_AWAKEN' && this._toast && this._state) {
        const tChoice = perfNow();
        const formId = await this._toast.showClassAwakenChoice(ev.classId);
        perfMark('blockingChoice.classAwaken', tChoice);
        if (formId && this._state) {
          const r = applyClassAwaken(this._state, formId);
          if (r.events.length > 0) {
            this._state = r.state;
            this._rebuildInputHints();
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
        this._rebuildInputHints();
        this._refreshAll();
        await this._playEvents(r.events);
        this._syncTutorialGuide(r.events);
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
          this._rebuildInputHints();
          this._refreshAll();
          await this._playEvents(r.events);
          this._syncTutorialGuide(r.events);
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
    if (!this._state) return;
    const { runSeed, floor } = this._state;
    this._toast?.toast('远征失败，正在结算本次远征…');
    await delay(1200);
    const settled = await this._settle(runSeed, floor, 'DEAD');
    if (settled) {
      SceneLoader.loadLobby();
    }
  }

  private async _handleFloorCleared(): Promise<void> {
    if (!this._state) return;
    const clearedFloor = this._state.floor;
    const oldChapter = this._state.chapter;

    // 先存档（确保无论玩家选继续还是返回，进度都不会丢失）
    await this._autoSaveCurrentFloor();

    // 需求#5：Boss 层即章节边界，玩家在营地停留期间后台预加载下一章 bundle + 背景。
    if (isBossFloor(clearedFloor)) {
      preloadChapter(oldChapter + 1);
    }

    if (isBossFloor(clearedFloor) && this._toast) {
      // ── AC-19：章节 Boss 击败 → 进入营地 ──────────────────
      const campChoice = await this._toast.showCamp(
        oldChapter,
        this._state.player,
        getCampShopItems(this._state.player),
        (itemId) => {
          if (!this._state) return null;
          const result = applyShopBuy(this._state, itemId as CampItemId);
          if (result.events.length === 0) return null;
          this._state = result.state;
          this._rebuildInputHints();
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
        (target) => {
          if (!this._state) return null;
          const result = target.source === 'equipment'
            ? applySellEquip(this._state, target.slot)
            : applySellBagEquip(this._state, target.itemId);
          if (result.events.length === 0) return null;
          this._state = result.state;
          this._rebuildInputHints();
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
          this._rebuildInputHints();
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
            this._rebuildInputHints();
            this._hud?.refresh(this._state);
            void this._playEvents(r.events);
            return this._state.player;
          },
          onReroll: (slot) => {
            if (!this._state) return null;
            const r = rerollEquipTrait(this._state, CAMP_BLACKSMITH_ID, slot);
            if (r.events.length === 0) return null;
            this._state = r.state;
            this._rebuildInputHints();
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

    const completedTutorialFloor = this._state.isTutorialRun && this._state.floor === 1;
    if (completedTutorialFloor) {
      this._meta = {
        ...(this._meta ?? {
          destinyShards: 0,
          diamond: 0,
          achievements: [],
          codex: { monsters: [], equipment: [] },
          unlockedTreeNodes: [],
        }),
        tutorialCompleted: true,
      };
      try {
        await updatePveMeta({ tutorialCompleted: true });
      } catch (err) {
        this._toast?.toast(`教学完成标记保存失败：${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const r = advanceFloor(this._state);
    this._state = r.state;
    // 需求#2/#3/#6：跨章时先 gating 确保新章资源就绪（loading 遮罩），失败回大厅（需求#4）。
    // 预加载命中时 isChapterReady=true，瞬时通过不显遮罩。
    if (r.state.chapter > oldChapter) {
      if (!(await this._ensureChapterReady(r.state.chapter))) return;
    }
    this._rebuildInputHints();
    // 每层独立战报：进入新层时清空，避免历史堆积
    this._log?.clear();
    this._map?.clearAoeHit();
    this._map?.clearAoeWarning();
    this._refreshAll();

    if (r.state.status === 'COMPLETED') {
      this._toast?.toast('恭喜通关全部楼层！');
      await delay(1500);
      const settled = await this._settle(r.state.runSeed, r.state.floor, 'COMPLETED');
      if (settled) {
        SceneLoader.loadLobby();
      }
      return;
    }

    await this._playEvents(r.events);
    this._showFloorEntryAlerts();

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
        balanceSnapshot: this._state.balanceSnapshot ?? this._balanceSnapshot ?? null,
      });
    } catch (err) {
      this._toast?.toast(`存档失败：${err instanceof Error ? err.message : String(err)}`);
      await delay(600);
    }
  }

  /** 远征结束（死亡或通关）上报结算：奖励由服务端按已通关层数纯计算后入账（→ AC-12, AC-14）。
   *  改为阻塞式结算弹窗（让玩家主动确认后才返回大厅，以便看清命运碎片入账）。 */
  private async _settle(runSeed: number, floor: number, status: 'DEAD' | 'COMPLETED'): Promise<boolean> {
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

      // 阻塞式弹窗：玩家按「确认」后才会继续（返回大厅）
      if (this._toast) {
        await this._toast.showSettleResult({
          status,
          floor,
          diamond: rewards?.diamond,
          destinyShards: rewards?.destinyShards,
        });
      } else {
        await delay(2000);
      }
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (this._toast) {
        await this._toast.showConfirm(
          `结算失败\n${message}\n云端存档可能尚未清除，请重试或返回大厅后重新进入远征`,
          [{ label: '知道了', value: 'ok' }],
        );
      } else {
        await delay(800);
      }
      return false;
    }
  }
}
