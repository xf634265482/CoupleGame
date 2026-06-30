// 即时战斗系统（design §7 / AC-16 M2）：按曼哈顿距离判定攻击范围，结算伤害与淘汰。
// 纯函数：playerAttack 由玩家发起（消耗 AP）；monsterAttack 由 MonsterAI 驱动（怪物行动不耗玩家 AP）。
//
// M2 词条效果（AC-16）：
//   BERSERKER — 吸血(life_steal) 狂暴(berserk) 血怒(blood_rage) 不屈(undying) 反击(counter)
//   ARCHER    — 鹰眼(eagle_eye) 射手精通(marksman) 连射(multi_shot) 穿透(pierce) 暴击(crit)
//   ROGUE     — 背刺(backstab) 刺客之心(assassin_heart)
//             （疾步/潜行/残影在 MovementSystem/MonsterAI/monsterAttack 中分别处理）
//
// M2 装备效果（AC-17）：
//   WEAPON.baseStat → 攻击加成；ARMOR.baseStat + 神像护甲 → 受伤减伤（最低造成 1 伤害）

import { addAnima, traitCount } from './AnimaSystem';
import { canAfford, spend } from './ApSystem';
import { equipTraitAtkBonus, equipTraitDefBonus } from './EquipTraitEffects';
import { affixSharpBonus, affixSturdyBonus, collectAffixes, getAffixValue } from './AffixSystem';
import {
  bloodlustStackHeal,
  executionerBonus,
  hasCleave,
  hasFinalCharge,
  hasVengeanceTrait,
  lowHpAttackMultiplier,
  painToleranceReduction,
  rageStrikeStackBonus,
  vengeanceBonus,
} from './StrengthenEffects';
import {
  generalAttackBonusPct,
  generalFlatAttackBonus,
  reduceGeneralIncomingDamage,
} from './strengthen/CommonStrengthenEffects';
import { applyMonsterKillDrop } from './LootSystem';
import {
  applyFreezeToMonsters,
  relicComputeAttackBonus,
  relicOnHitTarget,
  relicOnKill,
  relicReflectDamage,
  relicTryRevive,
} from './RelicSystem';
import { getBalancedPermafrostFreezeRounds } from './PveBalance';
import {
  bossCritMult,
  bossDamageReducePct,
  bossKillHeal,
  bossLifesteal,
  bossOnHitDebuffPatch,
  bossStunOnHurt,
  bossTryRevive,
  STUN_ROUNDS,
} from './BossEquipTraitEffects';
import {
  CHAPTER3_ICE_WALL_DROP_ANIMA,
  BLOCKS_LOS_TYPES,
  CLASS_STATS,
  FATE_ENRAGE_HP_RATIO,
  FATE_MIRROR_BOSS_ID,
  FATE_MIRROR_SPAWN_HP_RATIO,
  FIRE_BURN_ROUNDS,
  FROST_GIANT_ENRAGE_HP_RATIO,
  FROST_MOVE_PENALTY_ROUNDS,
  LAVA_LORD_LAVA_STAND_DAMAGE_REDUCTION,
  POISON_ROUNDS,
  QUICKSAND_SCORPION_ENRAGE_HP_RATIO,
} from './PveConstants';
import { getBalancedActionCost, getBalancedPlayerAttackBase } from './PveBalance';
import { VARIANT_FIRE_GOBLIN, VARIANT_FROST_GOBLIN } from './Chapter1Monsters';
import { VARIANT_POISON_SCORPION } from './Chapter2Monsters';
import { VARIANT_FROST_SPRITE, VARIANT_ICE_SLIME } from './Chapter3Monsters';
import { VARIANT_FIRE_ELEMENTAL, VARIANT_LAVA_CRAB } from './Chapter4Monsters';
import { VARIANT_VOID_WORM } from './Chapter5Monsters';
import { applyAnimaDeathEffect } from './AnimaDeathEffects';
import { GOBLIN_CHIEF_ENRAGE_HP } from './bosses/GoblinChief';
import { isRevealed, reveal } from './FogSystem';
import { createRng } from './rng';
import { checkLos } from './LosSystem';
import type { ApplyResult, Coord, ExpeditionState, FloorState, PveEvent, RunPlayer } from './PveTypes';

function manhattan(a: Coord, b: Coord): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function noop(state: ExpeditionState): ApplyResult {
  return { state, events: [] };
}

/**
 * 冰霜巨人冻结解除（第3章）：玩家每次主动攻击（playerAttack/attackIceWall）消耗一次
 * playerFreezeAttacksRemaining；归零时解除冻结并移除 FREEZE_WALL，emit PLAYER_UNFROZEN。
 */
function consumeFreezeAttack(floor: FloorState, events: PveEvent[]): FloorState {
  if (!floor.playerFrozen) return floor;
  const remaining = (floor.playerFreezeAttacksRemaining ?? 0) - 1;
  if (remaining > 0) {
    return { ...floor, playerFreezeAttacksRemaining: remaining };
  }
  events.push({ type: 'PLAYER_UNFROZEN' });
  return {
    ...floor,
    playerFrozen: false,
    playerFreezeAttacksRemaining: undefined,
    entities: floor.entities.filter((e) => e.type !== 'FREEZE_WALL'),
  };
}

/**
 * 对单个怪物施加伤害并写回状态：追加 ATTACK 事件；若致死则追加 KILL 事件并结算掉落。
 * 供 playerAttack 主目标 / 觉醒·横扫溅射 / 连射 / 觉醒·连珠连锁 共用。
 */
function resolveHit(
  state: ExpeditionState,
  targetId: string,
  damage: number,
  events: PveEvent[],
  ignoreArmor = false,
): ExpeditionState {
  const monster = state.floorState.monsters.find((m) => m.id === targetId);
  if (!monster || monster.aiState === 'DEAD') return state;

  // 命运守卫行为镜像护盾消耗（260616 重做）：玩家上回合待机 → 镜像本回合获盾，吸收下一次伤害。
  // 在 hp 扣减前判定；仅当 shieldStacks=1 时吸收并归零，emit MIRROR_SHIELD_ABSORBED，本次伤害归 0。
  if (monster.bossId === FATE_MIRROR_BOSS_ID && monster.shieldStacks === 1) {
    events.push({ type: 'MIRROR_SHIELD_ABSORBED', mirrorId: targetId });
    return {
      ...state,
      floorState: {
        ...state.floorState,
        monsters: state.floorState.monsters.map((m) =>
          m.id === targetId ? { ...m, shieldStacks: 0 as const } : m,
        ),
      },
    };
  }

  // 通用护甲（Chapter 2+ 普通/精英/Boss）：先扣减，最低 1 伤害。
  if (monster.armor && monster.armor > 0 && !ignoreArmor && !state.player.classTraits.includes('pierce')) {
    damage = Math.max(1, damage - monster.armor);
  }
  // 硬甲（LAVA_CRAB）：受到物理攻击伤害减半（向下取整）。在通用护甲之后再叠加。
  if (monster.variantId === VARIANT_LAVA_CRAB && !ignoreArmor && !state.player.classTraits.includes('pierce')) {
    damage = Math.floor(damage / 2);
  }

  const rawTargetHp = Math.max(0, monster.hp - damage);
  // C4: VOID_WORM 双生复活 — 首次被击杀时以 50% maxHp 原地复活
  const voidWormReviving = rawTargetHp <= 0 && monster.variantId === VARIANT_VOID_WORM && !monster.revivedOnce;
  const targetHp = voidWormReviving ? Math.floor(monster.maxHp / 2) : rawTargetHp;
  const dead = targetHp <= 0;

  let next: ExpeditionState = {
    ...state,
    floorState: {
      ...state.floorState,
      monsters: state.floorState.monsters.map((m) =>
        m.id === targetId
          ? { ...m, hp: targetHp, aiState: dead ? ('DEAD' as const) : m.aiState, revivedOnce: voidWormReviving ? true : m.revivedOnce }
          : m,
      ),
    },
  };

  events.push({ type: 'ATTACK', attackerId: 'PLAYER', targetId, damage, targetHp });

  // 哥布林酋长首次进入狂暴：本次攻击使 HP 由 >阈值 跨到 ≤阈值且未死亡时，emit 一次供战报提示。
  // hp 跨越天然只触发一次（之后攻击前 hp 已 ≤ 阈值）。
  if (
    !dead &&
    monster.bossId === 'GOBLIN_CHIEF' &&
    monster.hp > GOBLIN_CHIEF_ENRAGE_HP &&
    targetHp <= GOBLIN_CHIEF_ENRAGE_HP
  ) {
    events.push({ type: 'BOSS_ENRAGED', bossId: 'GOBLIN_CHIEF' });
  }

  // 流沙巨蝎进入狂暴（HP 占比首次跌破阈值）：潜地间隔缩短、沙暴范围扩大。
  if (
    !dead &&
    monster.bossId === 'QUICKSAND_SCORPION' &&
    monster.hp / monster.maxHp > QUICKSAND_SCORPION_ENRAGE_HP_RATIO &&
    targetHp / monster.maxHp <= QUICKSAND_SCORPION_ENRAGE_HP_RATIO
  ) {
    events.push({ type: 'BOSS_ENRAGED', bossId: 'QUICKSAND_SCORPION' });
  }

  // 冰霜巨人进入狂暴（HP 占比首次跌破阈值）：冰霜重击替换为「预警→冲锋」循环。
  if (
    !dead &&
    monster.bossId === 'FROST_GIANT' &&
    monster.hp / monster.maxHp > FROST_GIANT_ENRAGE_HP_RATIO &&
    targetHp / monster.maxHp <= FROST_GIANT_ENRAGE_HP_RATIO
  ) {
    events.push({ type: 'BOSS_ENRAGED', bossId: 'FROST_GIANT' });
  }

  // 命运守卫跨过 50%：本处不 emit，由下一次怪物回合 tryCrossMirrorThreshold 实际生成镜像时 emit MIRROR_SPAWNED。

  // 命运守卫跨过 30% → emit BOSS_ENRAGED（boss.enraged 字段由下一次怪物回合 tryCrossEnrageThreshold 写入并清空预言）。
  if (
    !dead &&
    monster.bossId === 'FATE_GUARDIAN' &&
    !monster.enraged &&
    monster.hp / monster.maxHp > FATE_ENRAGE_HP_RATIO &&
    targetHp / monster.maxHp <= FATE_ENRAGE_HP_RATIO
  ) {
    events.push({ type: 'BOSS_ENRAGED', bossId: 'FATE_GUARDIAN' });
  }

  if (dead) {
    events.push({ type: 'KILL', monsterId: targetId, monsterType: monster.type });
    // 灵气怪死亡触发（CH4 SPIRIT_EMBER 爆熔岩 / CH5 SPIRIT_MIRAGE Buff/Debuff）。
    // 在 applyMonsterKillDrop（LOOT）之前结算，确保事件顺序为 KILL → 死亡效果 → LOOT。
    const deathEffect = applyAnimaDeathEffect(next, monster);
    next = deathEffect.state;
    events.push(...deathEffect.events);
    // C3: FIRE_ELEMENTAL 爆裂自爆 — 死亡时对 2 格曼哈顿距离内的玩家造成等攻击力真实伤害（无视护甲）。
    if (monster.variantId === VARIANT_FIRE_ELEMENTAL) {
      const explosionDamage = monster.attack;
      if (manhattan(monster.pos, next.floorState.player) <= 2) {
        const newPlayerHp = Math.max(0, next.player.hp - explosionDamage);
        next = { ...next, player: { ...next.player, hp: newPlayerHp } };
        events.push({ type: 'ELITE_EXPLODE', monsterId: targetId, pos: monster.pos, damage: explosionDamage, hp: newPlayerHp });
        if (newPlayerHp <= 0) events.push({ type: 'PLAYER_DEAD' });
      }
    }
    if (monster.bossId === 'FATE_MIRROR') {
      events.push({ type: 'MIRROR_KILLED', mirrorId: targetId });
    } else {
      const dropResult = applyMonsterKillDrop(next, targetId);
      next = dropResult.state;
      events.push(...dropResult.events);
    }
    // 遗物：酋长怒吼 — 击杀后下次普攻 +50%（已 pending 时不重复标记）
    const killBuff = relicOnKill(next.player);
    next = { ...next, player: killBuff.nextPlayer };
  } else if (voidWormReviving) {
    events.push({ type: 'ELITE_REVIVE', monsterId: targetId, hp: targetHp });
  }

  return next;
}

/**
 * 玩家当前攻击力与攻击范围：
 *   基础值 + 职业加成 + 武器基础属性 + 词条（鹰眼 / 射手精通）。
 */
export function playerAttackPower(
  player: RunPlayer,
  balanceSnapshot?: ExpeditionState['balanceSnapshot'],
  chapter = 1,
): { damage: number; range: number } {
  const stats = CLASS_STATS[player.classId];
  const weapon = player.equipment.WEAPON;
  const traits = player.classTraits;
  const base = getBalancedPlayerAttackBase(balanceSnapshot, chapter);

  let rawAttack = base.damage + stats.attackBonus + (weapon?.baseStat ?? 0);
  let range = base.range + stats.attackRangeBonus;

  // 基础款优缺点：矛/弓类武器攻击范围 +1（AC-EQ-3）
  if (weapon?.implicit === 'weapon_spear') range += 1;

  rawAttack += traitCount(traits, 'marksman') * 4;
  if (traits.includes('eagle_eye')) range += 1;             // ARCHER 鹰眼
  rawAttack += generalFlatAttackBonus(traits);
  rawAttack += traitCount(traits, 'bloodletter_stack') * 2;
  rawAttack += player.treeBonuses?.attackBonus ?? 0;        // 命运树 B1 武者直觉
  rawAttack += player.idolAttackBonus ?? 0;                 // 神像祝福累计攻击加成
  rawAttack += equipTraitAtkBonus(player);                  // 装备词条 equip_atk_up（AC-401，每件 +1，可叠加）
  rawAttack += affixSharpBonus(player.equipment);           // 词条：锋利（aff_sharp）静态攻击加成
  rawAttack += rageStrikeStackBonus(traits);                // 怒击连击/专注蓄力/连斩（可叠加×5，+层数×0.5）

  rawAttack *= lowHpAttackMultiplier(traits, player);       // 绝境一击系(HP≤25%→×2) × 进阶系(HP≤30%→×1.5)

  return {
    damage: Math.max(10, Math.round(rawAttack)),
    range,
  };
}

/**
 * 玩家攻击指定怪物：校验目标存活、AP 足够、距离在攻击范围内，否则 no-op。
 * 命中后扣 AP、结算伤害（含 M2 词条加成）；HP 归零则淘汰并触发掉落。
 *
 * 词条效果：
 *  - 狂暴(berserk): HP ≤ 50% 时伤害 +10
 *  - 背刺(backstab): 本回合有移动时首次攻击双倍伤害
 *  - 刺客之心(assassin_heart): 目标非 CHASE 状态时伤害 +20
 *  - 暴击(crit): 10% 概率双倍伤害（消耗 rngState）
 *  - 吸血(life_steal): 每次攻击回复 10 HP
 *  - 血怒(blood_rage): 击杀目标时回复 20 HP
 *  - 连射(multi_shot): 30% 概率再射一箭（基础伤害，不含词条加乘，消耗 rngState）
 */
export function playerAttack(state: ExpeditionState, monsterId: string): ApplyResult {
  const floor = state.floorState;
  const monster = floor.monsters.find((m) => m.id === monsterId);
  if (!monster || monster.aiState === 'DEAD') return noop(state);
  // 基础款优缺点：斧类武器攻击消耗额外 AP+1（AC-EQ-3）
  const axePenalty = state.player.equipment.WEAPON?.implicit === 'weapon_axe' ? 1 : 0;
  const attackCost = getBalancedActionCost(state.balanceSnapshot, state.chapter, 'ATTACK') + axePenalty;
  if (!canAfford(floor.ap, 'ATTACK', { ATTACK: attackCost })) return noop(state);
  // 潜地状态免疫玩家攻击（流沙巨蝎）
  if (monster.isBurrowed) return noop(state);

  const traits = state.player.classTraits;
  let { damage, range } = playerAttackPower(state.player, state.balanceSnapshot, state.chapter);
  const distance = manhattan(floor.player, monster.pos);
  if (distance > range) return noop(state);
  // 玩家只能攻击已揭示区域内的怪物，防止远程角色（range≥2）自动锁定未探索迷雾中的敌人。
  if (!isRevealed(floor.revealed, monster.pos)) return noop(state);
  // 远程攻击（range≥2）需视线（Phase 2 LOS，AC-MT-4）：中间格有 ROCK/ICE_WALL/FREEZE_WALL 则打不出。
  if (range >= 2 && distance >= 2) {
    const blockerPos = checkLos(floor, floor.player, monster.pos);
    if (blockerPos) {
      return {
        state,
        events: [{ type: 'ATTACK_BLOCKED_BY_COVER', attackerId: 'PLAYER', targetId: monsterId, blockerPos }],
      };
    }
  }

  // ── 概率 RNG（所有随机检定共用同一实例，保证 AC-13 确定性）──
  const rng = createRng(floor.rngState);
  const firstAttackThisTurn = (floor.rogueAttackCountThisTurn ?? 0) === 0;
  const isBoss = monster.type === 'BOSS' || !!monster.bossId;
  const adjacentTargets = floor.monsters.filter(
    (m) => m.id !== monsterId && m.aiState !== 'DEAD' && manhattan(m.pos, monster.pos) === 1,
  );
  const breakerActive = traits.includes('awakened_cleave');
  const slayerActive = traits.includes('awakened_frenzy');
  const sniperActive = traits.includes('awakened_power_shot')
    && (floor.playerStepsThisTurn ?? 0) === 0
    && firstAttackThisTurn
    && distance >= 3;
  const skirmisherActive = traits.includes('awakened_volley')
    && (floor.playerStepsThisTurn ?? 0) > 0
    && firstAttackThisTurn;
  const executionerActive = traits.includes('awakened_execute');
  const shadowChargeActive = traits.includes('awakened_shadow_strike')
    && (floor.awakenShadowCharges ?? 0) > 0;

  const commonPct = generalAttackBonusPct({
    player: state.player,
    target: monster,
    isFirstAttackThisFloor: !(floor.generalFirstAttackUsed ?? false),
    setbackReady: floor.generalSetbackReady ?? false,
  }) + (floor.generalTerrainPowerReady && traits.includes('general_terrain_power') ? 0.35 : 0)
    + (floor.generalStoredEdgeReady && traits.includes('general_stored_edge') ? 0.3 : 0);
  damage = Math.round(damage * (1 + commonPct));

  if (breakerActive && adjacentTargets.length === 0) damage = Math.round(damage * 1.15);
  if (sniperActive) damage = Math.round(damage * 1.5);
  if (sniperActive && traits.includes('awaken_sniper_decisive_shot')
    && monster.hp === monster.maxHp && !(floor.awakenSniperDecisiveUsed ?? false)) {
    damage = Math.round(damage * 1.25);
  }
  const exposedTriggered = traits.includes('awaken_sniper_exposed_wound')
    && floor.awakenSniperExposedTargetId === monsterId;
  if (exposedTriggered) damage = Math.round(damage * 1.2);
  if (traits.includes('awaken_executioner_death_sentence') && floor.awakenExecutionMarkId === monsterId) {
    damage = Math.round(damage * 1.2);
  }
  if (executionerActive && isBoss) damage = Math.round(damage * 1.3);

  const slayerTriggered = slayerActive && (floor.frenzyPending ?? false);
  if (slayerTriggered) {
    const basePct = traits.includes('awaken_slayer_blood_hunt') ? 0.55 : 0.4;
    const stackPct = traits.includes('awaken_slayer_endless_intent')
      ? Math.min(3, floor.awakenSlayerIntentStacks ?? 0) * 0.1
      : 0;
    damage = Math.round(damage * (1 + basePct + stackPct));
  }

  if (traits.includes('berserker_resolve')) {
    const lostTenths = Math.min(7, Math.floor((1 - state.player.hp / state.player.maxHp) * 10));
    damage = Math.round(damage * (1 + lostTenths * 0.03));
  }
  if (state.player.hp <= state.player.maxHp / 2) {
    damage += traitCount(traits, 'rage_strike_stack') * 4;
  }
  if (traits.includes('berserker_rage_boiling')) damage = Math.round(damage * (1 + (floor.berserkerRageStacks ?? 0) * 0.05));
  if (traits.includes('berserker_tooth_for_tooth') && floor.berserkerRetaliationTargetId === monsterId) damage = Math.round(damage * 1.3);
  if (traits.includes('last_stand') && distance === 1) damage = Math.round(damage * 1.15);
  if (traits.includes('executioner') && monster.hp / monster.maxHp <= 0.3) damage = Math.round(damage * 1.15);
  if (traits.includes('headshot') && distance >= 3) damage = Math.round(damage * 1.2);
  if (traits.includes('steady_aim') && (floor.playerStepsThisTurn ?? 0) === 0 && firstAttackThisTurn) damage = Math.round(damage * 1.2);
  if (traits.includes('retreat_shot') && (floor.playerStepsThisTurn ?? 0) > 0 && firstAttackThisTurn) damage = Math.round(damage * 1.1);
  if (distance >= 2) damage += traitCount(traits, 'focus_stack') * 2;
  if (traits.includes('deadeye') && floor.archerMarkedMonsterId === monsterId) damage = Math.round(damage * 1.2);
  if (floor.archerHunterRhythmReady) damage = Math.round(damage * 1.15);
  const archerAttackCount = (floor.archerAttackCount ?? 0) + 1;
  if (traits.includes('last_arrow') && archerAttackCount % 3 === 0) damage = Math.round(damage * 1.5);
  const rogueAttackCount = (floor.rogueAttackCountThisTurn ?? 0) + 1;
  if (traits.includes('shadow_strike') && rogueAttackCount === 2) damage = Math.round(damage * 1.25);
  if (traits.includes('survival_instinct')) damage = Math.round(damage * (1 + Math.min(5, floor.rogueKillCountThisFloor ?? 0) * 0.05));
  if (traits.includes('rogue_blade_dance')) damage = Math.round(damage * (1 + Math.min(5, floor.playerStepsThisTurn ?? 0) * 0.05));
  if (floor.rogueVanishStrikeReady) damage = Math.round(damage * 1.25);
  if (traits.includes('evasion_training') && ((monster.poisonRounds ?? 0) > 0 || (monster.bleedRounds ?? 0) > 0 || (monster.burnRounds ?? 0) > 0 || (monster.frozenRounds ?? 0) > 0)) {
    damage = Math.round(damage * 1.2);
  }

  // ── 伤害词条（确定性叠加，在 RNG 词条前计算）──
  if (state.player.hp <= state.player.maxHp / 2) {
    if (traits.includes('berserk')) damage = Math.round(damage * 1.2);
  }
  // 背刺 / 屠戮型强化背刺 / 影袭层数。
  const backstabActive = (traits.includes('backstab')
    && ((floor.backstabAvailable ?? false) || (floor.rogueChainBackstabReady ?? false)))
    || shadowChargeActive;
  if (backstabActive) {
    const backstabPct = executionerActive ? 1
      : shadowChargeActive && traits.includes('awaken_shadow_afterimages') ? 0.7
        : 0.5;
    damage = Math.round(damage * (1 + backstabPct));
  }
  if (monster.aiState !== 'CHASE') {
    if (traits.includes('assassin_heart')) damage = Math.round(damage * 1.2);
  }
  damage += executionerBonus(traits, monster);
  const vengeanceActive = vengeanceBonus(traits, floor) > 0;
  if (vengeanceActive) damage = Math.round(damage * 1.25);
  if (floor.berserkerBloodyChainReady) damage = Math.round(damage * 1.25);
  if (floor.berserkerFinalChargeReady) damage = Math.round(damage * 1.3);

  // ── 概率词条（消耗 rngState，始终推进以保证 AC-13 确定性；rng 在上方范围检查后创建）──
  const critChance = traits.includes('crit')
    ? 0.1 + traitCount(traits, 'quiver_stack') * 0.04
      + (traits.includes('archer_breath_focus') && distance >= 3 && (floor.playerStepsThisTurn ?? 0) === 0 && firstAttackThisTurn ? 0.25 : 0)
    : 0;
  const forcedSniperCrit = sniperActive
    && traits.includes('awaken_sniper_calibration')
    && (floor.awakenSniperGuaranteedCrit ?? false);
  const critTriggered = forcedSniperCrit || (critChance > 0 && rng.chance(Math.min(1, critChance)));
  if (critTriggered) {
    damage *= 2; // ARCHER 暴击：10% 双倍伤害
  }

  // Boss 装备 trait: boss_crit_15（命运之刃 15% 暴击 ×2，始终消耗 RNG 一次）
  damage *= bossCritMult(state.player.equipment, rng);

  // 屠戮型仅处决普通怪/精英怪；Boss 永远不会被直接处决。
  const executeThreshold = traits.includes('awaken_executioner_bloodline') ? 0.25 : 0.2;
  const executeTriggered = executionerActive && !isBoss && monster.hp / monster.maxHp <= executeThreshold;
  if (executeTriggered) {
    damage = Math.max(damage, monster.hp);
  }

  // ── 遗物伤害加成（CHIEF_ROAR / QUICKSAND_HEART）──
  const relicAtk = relicComputeAttackBonus(state, damage);
  damage += relicAtk.bonus;
  let relicPlayerPatch: RunPlayer = relicAtk.nextPlayer;

  // 熔岩领主：站在 LAVA_TILE 上时受到的伤害减免 LAVA_LORD_LAVA_STAND_DAMAGE_REDUCTION
  if (monster.bossId === 'LAVA_LORD') {
    const onLava = floor.entities.some(
      (e) => e.type === 'LAVA_TILE' && !e.consumed && e.pos.x === monster.pos.x && e.pos.y === monster.pos.y,
    );
    if (onLava) {
      damage = Math.max(1, Math.round(damage * (1 - LAVA_LORD_LAVA_STAND_DAMAGE_REDUCTION)));
    }
  }

  // ── 装备词条：条件触发（AC-EQ-4/5）──
  const _allAffixes = collectAffixes(state.player.equipment);
  // 狂热：HP<50% 时攻击 +value%
  const _affFrenzy = getAffixValue(_allAffixes, 'aff_frenzy');
  if (_affFrenzy !== undefined && state.player.hp < state.player.maxHp / 2) {
    damage = Math.round(damage * (1 + _affFrenzy / 100));
  }
  // 猎手：对精英/Boss 伤害 +value%
  const _affHunter = getAffixValue(_allAffixes, 'aff_hunter');
  if (_affHunter !== undefined && (monster.type === 'ELITE' || monster.type === 'BOSS' || isBoss)) {
    damage = Math.round(damage * (1 + _affHunter / 100));
  }
  // 章节克制：对本章普通怪伤害 +value%
  const _affBane = getAffixValue(_allAffixes, 'aff_chapter_bane');
  if (_affBane !== undefined && monster.type === 'NORMAL') {
    damage = Math.round(damage * (1 + _affBane / 100));
  }
  // 连杀：本层累计击杀 × value 攻击加成（封顶 5 叠）
  const _affKillChain = getAffixValue(_allAffixes, 'aff_kill_chain');
  if (_affKillChain !== undefined) {
    damage += Math.min(5, floor.affixKillChainStacks ?? 0) * _affKillChain;
  }
  // 疾袭：本回合移动后首击 +value%
  const _affSwift = getAffixValue(_allAffixes, 'aff_swift_strike');
  if (_affSwift !== undefined && (floor.affixSwiftStrikeReady ?? false) && firstAttackThisTurn) {
    damage = Math.round(damage * (1 + _affSwift / 100));
  }
  // 先发制人：每层首攻 +value%
  const _affPreemptive = getAffixValue(_allAffixes, 'aff_preemptive');
  if (_affPreemptive !== undefined && !(floor.affixPreemptiveUsed ?? false)) {
    damage = Math.round(damage * (1 + _affPreemptive / 100));
  }

  // ── 造伤 ──
  const targetHp = Math.max(0, monster.hp - damage);
  const dead = targetHp <= 0;
  const events: PveEvent[] = [...relicAtk.events];

  // ── 玩家 HP 更新（吸血 / 血怒 / 觉醒·狂热回血；静默更新，HUD 在下一帧刷新）──
  let playerHp = state.player.hp;
  let requestedHeal = 0;
  const lifeStealCount = traitCount(traits, 'life_steal');
  if (lifeStealCount > 0) {
    requestedHeal += 8;
  }
  // Boss 装备 trait: on_hit_lifesteal_1（哥布林酋长战斧吸血 +5）
  playerHp = bossLifesteal({ ...state.player, hp: playerHp });
  if (dead) {
    const bloodRageCount = traitCount(traits, 'blood_rage');
    if (bloodRageCount > 0) {
      requestedHeal += 15;
    }
    const bloodlustHeal = bloodlustStackHeal(traits);
    if (bloodlustHeal > 0) {
      requestedHeal += bloodlustHeal;
    }
    // Boss 装备 trait: boss_kill_heal_8（烈焰指环击杀回血）
    playerHp = bossKillHeal(state.player, playerHp);
  }
  if (dead && slayerActive) {
    requestedHeal += traits.includes('awaken_slayer_blood_feast') ? 18 : 10;
  }

  const venomBurst = traits.includes('rogue_venom_burst')
    && (monster.poisonRounds ?? 0) > 0
    && monster.hp / monster.maxHp > 0.3
    && (monster.hp - damage) / monster.maxHp <= 0.3;
  if (venomBurst) damage += (monster.poisonRounds ?? 0) * (monster.poisonDamage ?? 3);
  if (state.player.hp / state.player.maxHp <= 0.3 && traits.includes('berserker_death_feast')) requestedHeal = Math.round(requestedHeal * 1.5);
  const missingHp = Math.max(0, state.player.maxHp - playerHp);
  const effectiveHeal = Math.min(missingHp, requestedHeal);
  const overheal = Math.max(0, requestedHeal - effectiveHeal);
  playerHp += effectiveHeal;
  const bloodShieldGain = traits.includes('berserker_blood_shield')
    || (slayerActive && traits.includes('awaken_slayer_blood_feast'))
    ? overheal
    : 0;

  // ── floorState 状态位更新（背刺消耗 / 影袭计数 / 狂热标记 / 复仇消耗）──
  let nextFloorState = {
    ...floor,
    ap: spend(floor.ap, 'ATTACK', { ATTACK: attackCost }),
    rngState: rng.state(),
    ...(vengeanceActive ? { vengeanceReady: false } : {}),
    // 命运守卫行为镜像：玩家本回合至少一次发起攻击（endTurn 时供 recordPlayerActionForMirror 读取）
    playerAttackedThisTurn: true,
    generalFirstAttackUsed: true,
    generalSetbackReady: false,
    generalTerrainPowerReady: false,
    generalStoredEdgeReady: false,
    archerAttackCount,
    archerMarkedMonsterId: traits.includes('deadeye') ? (floor.archerMarkedMonsterId ?? monsterId) : floor.archerMarkedMonsterId,
    rogueAttackCountThisTurn: rogueAttackCount,
    rogueEscapeMoveReady: traits.includes('shockwave'),
    rogueHidden: false,
    rogueVanishStrikeReady: false,
    rogueChainBackstabReady: false,
    berserkerBloodyChainReady: dead && traits.includes('berserker_bloody_chain'),
    berserkerFinalChargeReady: false,
    berserkerRetaliationTargetId: undefined,
    berserkerRageStacks: state.player.hp <= state.player.maxHp / 2 && traits.includes('berserker_rage_boiling')
      ? Math.min(5, (floor.berserkerRageStacks ?? 0) + 1)
      : floor.berserkerRageStacks,
    berserkerShield: (floor.berserkerShield ?? 0) + bloodShieldGain,
    archerHunterRhythmReady: false,
    archerCriticalReloadReady: critTriggered && traits.includes('archer_critical_reload'),
    ...(dead && traits.includes('finisher') && distance >= 3 ? { archerHunterRhythmReady: true } : {}),
    ...(dead ? { rogueKillCountThisFloor: (floor.rogueKillCountThisFloor ?? 0) + 1 } : {}),
    ...(sniperActive && traits.includes('awaken_sniper_decisive_shot') && monster.hp === monster.maxHp
      ? { awakenSniperDecisiveUsed: true }
      : {}),
    awakenSniperExposedTargetId: exposedTriggered
      ? undefined
      : sniperActive && traits.includes('awaken_sniper_exposed_wound') ? monsterId : floor.awakenSniperExposedTargetId,
    awakenSniperGuaranteedCrit: sniperActive && traits.includes('awaken_sniper_calibration')
      ? (critTriggered ? false : true)
      : floor.awakenSniperGuaranteedCrit,
    awakenExecutionMarkId: backstabActive && traits.includes('awaken_executioner_death_sentence')
      ? monsterId
      : floor.awakenExecutionMarkId,
    awakenShadowCharges: shadowChargeActive
      ? Math.max(0, (floor.awakenShadowCharges ?? 0) - 1)
      : floor.awakenShadowCharges,
    // 词条状态更新（AC-EQ-4/5）
    ...(dead && _affKillChain !== undefined
      ? { affixKillChainStacks: Math.min(5, (floor.affixKillChainStacks ?? 0) + 1) }
      : {}),
    ...(_affSwift !== undefined && (floor.affixSwiftStrikeReady ?? false) && firstAttackThisTurn
      ? { affixSwiftStrikeReady: false }
      : {}),
    ...(_affPreemptive !== undefined && !(floor.affixPreemptiveUsed ?? false)
      ? { affixPreemptiveUsed: true }
      : {}),
  };
  if (backstabActive) {
    if (!shadowChargeActive) {
      nextFloorState = { ...nextFloorState, backstabAvailable: false };
    }
  }
  if (slayerActive) {
    const nextIntentStacks = slayerTriggered && traits.includes('awaken_slayer_endless_intent')
      ? dead ? Math.min(3, (floor.awakenSlayerIntentStacks ?? 0) + 1) : 0
      : floor.awakenSlayerIntentStacks;
    nextFloorState = {
      ...nextFloorState,
      frenzyPending: dead ? true : (slayerTriggered ? false : floor.frenzyPending),
      awakenSlayerIntentStacks: nextIntentStacks,
    };
  }

  let nextState: ExpeditionState = {
    ...state,
    player: { ...relicPlayerPatch, hp: playerHp },
    floorState: nextFloorState,
  };

  nextState = resolveHit(nextState, monsterId, damage, events, sniperActive);
  if (breakerActive) {
    events.push({
      type: 'AWAKEN_EFFECT_TRIGGERED',
      effectId: 'awakened_cleave',
      sourceId: 'PLAYER',
      targetIds: [monsterId, ...adjacentTargets.map((m) => m.id)],
    });
  }
  if (slayerTriggered) events.push({ type: 'AWAKEN_EFFECT_TRIGGERED', effectId: 'awakened_frenzy', sourceId: 'PLAYER', targetIds: [monsterId] });
  if (sniperActive) events.push({ type: 'AWAKEN_EFFECT_TRIGGERED', effectId: 'awakened_power_shot', sourceId: 'PLAYER', targetIds: [monsterId] });
  if (executeTriggered) events.push({ type: 'AWAKEN_EFFECT_TRIGGERED', effectId: 'awakened_execute', sourceId: 'PLAYER', targetIds: [monsterId] });
  if (shadowChargeActive) events.push({ type: 'AWAKEN_EFFECT_TRIGGERED', effectId: 'awakened_shadow_strike', sourceId: 'PLAYER', targetIds: [monsterId] });
  if (venomBurst) {
    nextState = {
      ...nextState,
      floorState: {
        ...nextState.floorState,
        monsters: nextState.floorState.monsters.map((m) => m.id === monsterId ? { ...m, poisonRounds: undefined, poisonDamage: undefined } : m),
      },
    };
  }

  if (dead) {
    let monsters = nextState.floorState.monsters;
    if (traits.includes('desperate_gambit') && !(floor.rogueSmokeUsed ?? false)) {
      monsters = monsters.map((m) => m.aiState !== 'DEAD' ? { ...m, aiState: 'IDLE' as const } : m);
    }
    if (traits.includes('rogue_poison_spread') && (monster.poisonRounds ?? 0) > 0) {
      monsters = monsters.map((m) => m.aiState !== 'DEAD' && manhattan(m.pos, monster.pos) === 1
        ? { ...m, poisonRounds: monster.poisonRounds, poisonDamage: monster.poisonDamage }
        : m);
    }
    const nextMark = traits.includes('archer_mark_transfer') && floor.archerMarkedMonsterId === monsterId
      ? monsters.find((m) => m.aiState !== 'DEAD')?.id
      : nextState.floorState.archerMarkedMonsterId;
    nextState = {
      ...nextState,
      floorState: {
        ...nextState.floorState,
        monsters,
        archerMarkedMonsterId: nextMark,
        rogueSmokeUsed: (floor.rogueSmokeUsed ?? false) || traits.includes('desperate_gambit'),
        rogueChainBackstabReady: backstabActive && traits.includes('rogue_chain_backstab'),
        rogueHidden: (monster.aiState !== 'CHASE' && traits.includes('coup_de_grace'))
          || ((backstabActive || executeTriggered) && traits.includes('awaken_executioner_silent_reap') && !(floor.awakenExecutionStealthUsed ?? false)),
        awakenExecutionStealthUsed: ((backstabActive || executeTriggered) && traits.includes('awaken_executioner_silent_reap'))
          || floor.awakenExecutionStealthUsed,
        awakenExecutionMarkId: floor.awakenExecutionMarkId === monsterId ? undefined : nextState.floorState.awakenExecutionMarkId,
      },
    };
  }

  // 遗物：永冻之核 — 命中后若 pending 则冰冻目标（消费 pending）。
  // 注意：若 resolveHit 已致死，则不冰冻（已无意义）。
  const targetStillAlive = nextState.floorState.monsters.find((m) => m.id === monsterId)?.aiState !== 'DEAD';
  if (targetStillAlive) {
    const freeze = relicOnHitTarget(nextState.player, monsterId);
    if (freeze.freezeTargetId) {
      const freezeRounds = getBalancedPermafrostFreezeRounds(nextState.balanceSnapshot, nextState.chapter);
      nextState = {
        ...nextState,
        player: freeze.nextPlayer,
        floorState: {
          ...nextState.floorState,
          monsters: applyFreezeToMonsters(nextState.floorState.monsters, freeze.freezeTargetId, freezeRounds),
        },
      };
      events.push(...freeze.events);
    }

    // Boss 装备 trait: 命中附加 debuff（boss_bleed_on_hit / boss_burn_on_hit / boss_slow_on_hit）
    const debuffPatch = bossOnHitDebuffPatch(state.player.equipment);
    if (Object.keys(debuffPatch).length > 0) {
      nextState = {
        ...nextState,
        floorState: {
          ...nextState.floorState,
          monsters: nextState.floorState.monsters.map((m) =>
            m.id === monsterId && m.aiState !== 'DEAD' ? { ...m, ...debuffPatch } : m,
          ),
        },
      };
    }

    if (traits.includes('retribution')) {
      const poisonBase = 3 + traitCount(traits, 'nimble_stack') * 3;
      const poisonDamage = nextState.floorState.awakenExecutionMarkId === monsterId
        ? Math.round(poisonBase * 1.2)
        : poisonBase;
      nextState = {
        ...nextState,
        floorState: {
          ...nextState.floorState,
          monsters: nextState.floorState.monsters.map((m) => m.id === monsterId && m.aiState !== 'DEAD'
            ? { ...m, poisonRounds: 2, poisonDamage }
            : m),
        },
      };
    }
  }

  // ── 横扫/散射/震荡波(cleave 系) + 觉醒·横扫(awakened_cleave)：对目标周围相邻怪物造成50%溅射伤害 ──
  if (breakerActive || hasCleave(traits)) {
    const splashPct = breakerActive
      ? traits.includes('awaken_breaker_rending_edge') ? 0.7 : 0.5
      : traits.includes('cleave') ? 0.4 : 0.35;
    const splashDamage = Math.max(1, Math.round(damage * splashPct));
    const adjacentIds = adjacentTargets.map((m) => m.id);
    for (const id of adjacentIds) {
      nextState = resolveHit(nextState, id, splashDamage, events);
    }
    if (breakerActive && traits.includes('awaken_breaker_shockwave') && adjacentIds.length > 0) {
      const weakened = new Set(nextState.floorState.awakenWeakenedMonsterIds ?? []);
      for (const id of adjacentIds) weakened.add(id);
      nextState = { ...nextState, floorState: { ...nextState.floorState, awakenWeakenedMonsterIds: [...weakened] } };
    }
    if (breakerActive && traits.includes('awaken_breaker_against_army')
      && adjacentIds.length >= 2 && !(floor.awakenBreakerShieldUsed ?? false)) {
      const shieldGain = Math.max(1, Math.round(state.player.maxHp * 0.08));
      nextState = {
        ...nextState,
        floorState: {
          ...nextState.floorState,
          berserkerShield: (nextState.floorState.berserkerShield ?? 0) + shieldGain,
          awakenBreakerShieldUsed: true,
        },
      };
      events.push({ type: 'AWAKEN_EFFECT_TRIGGERED', effectId: 'awaken_breaker_against_army', sourceId: 'PLAYER', amount: shieldGain });
    }
  }

  if (shadowChargeActive && traits.includes('awaken_shadow_clone')) {
    const echoDamage = Math.max(1, Math.round(damage * 0.3));
    nextState = resolveHit(nextState, monsterId, echoDamage, events);
  }

  if (traits.includes('archer_line_pierce')) {
    const dx = Math.sign(monster.pos.x - floor.player.x);
    const dy = Math.sign(monster.pos.y - floor.player.y);
    if (dx === 0 || dy === 0) {
      const behind = nextState.floorState.monsters.find((m) => m.id !== monsterId && m.aiState !== 'DEAD'
        && m.pos.x === monster.pos.x + dx && m.pos.y === monster.pos.y + dy);
      if (behind) nextState = resolveHit(nextState, behind.id, Math.max(1, Math.round(damage * 0.5)), events);
    }
  }

  // ── ARCHER 基础连射（觉醒追加箭在下方独立结算，不递归触发）──
  const forcedMulti = traits.includes('archer_arrow_rhythm') && (floor.archerNoMultiShotCount ?? 0) >= 2;
  const multiShotChance = traits.includes('multi_shot')
    ? Math.min(1, 0.30 + traitCount(traits, 'vital_shot_stack') * 0.07 + (floor.archerCriticalReloadReady ? 0.2 : 0))
    : 0;
  if (multiShotChance > 0) {
    const rng2 = createRng(nextState.floorState.rngState);
    const fires = forcedMulti || rng2.chance(multiShotChance);
    nextState = { ...nextState, floorState: { ...nextState.floorState, rngState: rng2.state(), archerNoMultiShotCount: fires ? 0 : (floor.archerNoMultiShotCount ?? 0) + 1, archerCriticalReloadReady: false } };

    if (fires) {
      const m2 = nextState.floorState.monsters.find((m) => m.id === monsterId);
      if (m2 && m2.aiState !== 'DEAD') {
        const { damage: dmg2 } = playerAttackPower(nextState.player, nextState.balanceSnapshot, nextState.chapter);
        nextState = resolveHit(nextState, monsterId, dmg2, events);

      }
    }
  }

  if (skirmisherActive) {
    const moveBonus = traits.includes('awaken_skirmisher_wind_reload')
      ? Math.min(4, floor.playerStepsThisTurn ?? 0) * 0.1
      : 0;
    const arrowDamage = Math.max(1, Math.round(damage * (0.5 + moveBonus)));
    const visibleTargets = nextState.floorState.monsters.filter(
      (m) => m.aiState !== 'DEAD' && isRevealed(nextState.floorState.revealed, m.pos),
    );
    const alternate = visibleTargets
      .filter((m) => m.id !== monsterId)
      .sort((a, b) => manhattan(a.pos, monster.pos) - manhattan(b.pos, monster.pos))[0];
    const primary = traits.includes('awaken_skirmisher_seeking_arrow') && alternate
      ? alternate
      : visibleTargets.find((m) => m.id === monsterId) ?? alternate;
    if (primary) {
      nextState = resolveHit(nextState, primary.id, arrowDamage, events);
      const targetIds = [primary.id];
      if (traits.includes('awaken_skirmisher_arrow_storm')) {
        const stormRng = createRng(nextState.floorState.rngState);
        const fires = stormRng.chance(0.3);
        nextState = { ...nextState, floorState: { ...nextState.floorState, rngState: stormRng.state() } };
        if (fires) {
          const follow = nextState.floorState.monsters.find((m) => m.aiState !== 'DEAD' && m.id !== primary.id)
            ?? nextState.floorState.monsters.find((m) => m.aiState !== 'DEAD' && m.id === primary.id);
          if (follow) {
            nextState = resolveHit(nextState, follow.id, arrowDamage, events);
            targetIds.push(follow.id);
          }
        }
      }
      events.push({ type: 'AWAKEN_EFFECT_TRIGGERED', effectId: 'awakened_volley', sourceId: 'PLAYER', targetIds });
    }
  }

  nextState = { ...nextState, floorState: consumeFreezeAttack(nextState.floorState, events) };

  if (overheal > 0 && traits.includes('general_overheal_anima')) {
    const used = nextState.floorState.generalOverhealAnimaThisFloor ?? 0;
    const anima = Math.max(0, Math.min(20 - used, Math.floor(overheal * 0.5)));
    if (anima > 0) {
      const animaResult = addAnima(nextState, anima);
      nextState = {
        ...animaResult.state,
        floorState: { ...animaResult.state.floorState, generalOverhealAnimaThisFloor: used + anima },
      };
      events.push(...animaResult.events);
    }
  }

  return { state: nextState, events };
}

/**
 * 怪物攻击玩家：校验存活、距离在怪物攻击范围内，否则 no-op。
 * 不消耗玩家 AP（由 MonsterAI 在怪物回合驱动）；玩家 HP 归零则标记 DEAD。
 *
 * 词条效果（AC-16）：
 *  - 残影(afterimage): 本层首次受击时闪避（状态置 false，默认 true）
 *  - 不屈(undying): 本层首次将死时保留 1 HP（状态置 false，默认 true）
 *  - 反击(counter): 受击时对攻击者造成 10 伤害（不触发击杀，最低 1 HP）
 *
 * 装备效果（AC-17）：
 *  - ARMOR.baseStat → 减伤值（Math.max(10, rawDamage - reduction)，保证至少受 10 伤害）
 */
/**
 * 怪物攻击玩家（含可选伤害倍率，供 Boss 专属机制使用）。
 * damageMult 默认 1.0；Boss 双倍伤害机制传入 2。
 */
export function monsterAttack(state: ExpeditionState, monsterId: string, damageMult = 1): ApplyResult {
  const floor = state.floorState;
  const monster = floor.monsters.find((m) => m.id === monsterId);
  if (!monster || monster.aiState === 'DEAD') return noop(state);
  const monsterDist = manhattan(monster.pos, floor.player);
  if (monsterDist > monster.range) return noop(state);
  // 远程怪（range≥2）需视线（Phase 2 LOS，AC-MT-4，对称生效）：被掩体遮挡则放弃本次攻击。
  if (monster.range >= 2 && monsterDist >= 2) {
    const blockerPos = checkLos(floor, monster.pos, floor.player);
    if (blockerPos) {
      return {
        state,
        events: [{ type: 'ATTACK_BLOCKED_BY_COVER', attackerId: monsterId, targetId: 'PLAYER', blockerPos }],
      };
    }
  }

  const traits = state.player.classTraits;
  let incomingRngState = floor.rngState;

  // ── 揭示攻击者所在格：迷雾中的怪物主动攻击玩家时，暴露其位置（不暴露其余迷雾）──
  let revealed = floor.revealed;
  const revealEvents: PveEvent[] = [];
  if (!isRevealed(revealed, monster.pos)) {
    const result = reveal(revealed, monster.pos, 0);
    revealed = result.revealed;
    if (result.cells.length > 0) revealEvents.push({ type: 'REVEAL', cells: result.cells });
  }

  // ── ROGUE 残影：本层首次受击时闪避 ──
  if (traits.includes('afterimage') && (floor.hasAfterimage ?? true)) {
    const shadowTrade = traits.includes('awaken_shadow_trade') && !(floor.awakenShadowTradeUsed ?? false);
    return {
      state: {
        ...state,
        floorState: {
          ...floor,
          revealed,
          hasAfterimage: false,
          rogueHidden: true,
          rogueVanishStrikeReady: traits.includes('rogue_vanish_shadow'),
          ...(shadowTrade ? { awakenShadowCharges: 2, awakenShadowTradeUsed: true } : {}),
        },
      },
      events: shadowTrade
        ? [...revealEvents, { type: 'AWAKEN_EFFECT_TRIGGERED', effectId: 'awaken_shadow_trade', sourceId: 'PLAYER', targetIds: [monsterId] }]
        : revealEvents,
    };
  }

  const dodgeChance = traitCount(traits, 'flurry_stack') * 0.05;
  if (dodgeChance > 0) {
    const dodgeRng = createRng(floor.rngState);
    const dodged = dodgeRng.chance(dodgeChance);
    incomingRngState = dodgeRng.state();
    if (dodged) {
      const shadowTrade = traits.includes('awaken_shadow_trade') && !(floor.awakenShadowTradeUsed ?? false);
      return {
        state: {
          ...state,
          floorState: {
            ...floor,
            rngState: dodgeRng.state(),
            revealed,
            rogueHidden: true,
            rogueVanishStrikeReady: traits.includes('rogue_vanish_shadow'),
            ...(shadowTrade ? { awakenShadowCharges: 2, awakenShadowTradeUsed: true } : {}),
          },
        },
        events: shadowTrade
          ? [...revealEvents, { type: 'AWAKEN_EFFECT_TRIGGERED', effectId: 'awaken_shadow_trade', sourceId: 'PLAYER', targetIds: [monsterId] }]
          : revealEvents,
      };
    }
  }

  // ── 装备减伤（ARMOR 槽，AC-17 + equip_def_up 词条，AC-402）──
  // C1: POISON_SCORPION 穿甲攻击 — 完全无视玩家护甲与减伤词条
  const _mAffixes = collectAffixes(state.player.equipment);
  const _sturdyBonus = monster.variantId === VARIANT_POISON_SCORPION ? 0 : affixSturdyBonus(state.player.equipment);
  const armorReduction = monster.variantId === VARIANT_POISON_SCORPION
    ? 0
    : (state.player.equipment.ARMOR?.baseStat ?? 0) + equipTraitDefBonus(state.player) + (state.player.idolArmorBonus ?? 0) + _sturdyBonus;
  const rawDamage = monster.attack;
  // damageMult 在护甲减伤后生效（护甲先吸收，余量再倍率）；痛觉钝化系(≥5 时再-2)在最终取整前扣除。
  const weakened = (floor.awakenWeakenedMonsterIds ?? []).includes(monsterId);
  let reducedDamage = Math.max(0, rawDamage - armorReduction) * damageMult * (weakened ? 0.85 : 1);
  // Boss 装备 trait: 物理减伤 + 站冰面减伤（叠加，上限 90%）
  const bossReducePct = bossDamageReducePct(state.player, floor);
  if (bossReducePct > 0) reducedDamage *= (1 - bossReducePct);
  // 词条：磐石（aff_bulwark）HP>80% 时减伤
  const _affBulwark = getAffixValue(_mAffixes, 'aff_bulwark');
  if (_affBulwark !== undefined && state.player.hp > state.player.maxHp * 0.8) {
    reducedDamage = Math.max(0, reducedDamage - _affBulwark);
  }
  // 词条：掩体专家（aff_cover_expert）相邻掩体地形时减伤
  const _affCover = getAffixValue(_mAffixes, 'aff_cover_expert');
  if (_affCover !== undefined) {
    const _hasCover = floor.entities.some(
      (e) => !e.consumed && BLOCKS_LOS_TYPES.has(e.type) && manhattan(e.pos, floor.player) === 1,
    );
    if (_hasCover) reducedDamage = Math.max(0, reducedDamage - _affCover);
  }
  // 最低 1 点伤害（护甲可以大幅减伤，但任何攻击至少造成 1 点）
  let damage = Math.max(1, Math.round(reducedDamage - painToleranceReduction(traits, reducedDamage)));
  damage = reduceGeneralIncomingDamage(state.player, damage, floor);

  const shield = floor.berserkerShield ?? 0;
  const absorbed = Math.min(shield, damage);
  const hpDamage = damage - absorbed;
  let hp = Math.max(0, state.player.hp - hpDamage);
  let dead = hp <= 0;

  // ── BERSERKER 不屈：本层首次将死时保留 1 HP ──
  let undyingTriggered = false;
  if (dead && traits.includes('undying') && state.player.undyingUsedChapter !== state.chapter) {
    hp = 1;
    dead = false;
    undyingTriggered = true;
  }

  // ── 遗物：命运回响 — 不屈未触发但仍 dead 时兜底（每场远征一次），优先级低于不屈 ──
  let nextPlayerAfterRelic = state.player;
  let fateEchoEvent: PveEvent | null = null;
  if (dead) {
    const revive = relicTryRevive(state.player, state.balanceSnapshot, state.chapter);
    if (revive.revived) {
      hp = revive.restoredHp;
      dead = false;
      nextPlayerAfterRelic = revive.nextPlayer;
      fateEchoEvent = { type: 'RELIC_TRIGGERED', relicId: 'FATE_ECHO', detail: `兜底回 ${revive.restoredHp} HP` };
    }
  }
  // ── Boss 装备 trait: 守卫圣盾（boss_revive_50）— 命运回响也未触发时，装备级再兜底一次 ──
  if (dead) {
    const shieldRevive = bossTryRevive(nextPlayerAfterRelic);
    if (shieldRevive.revived) {
      hp = shieldRevive.restoredHp;
      dead = false;
      nextPlayerAfterRelic = shieldRevive.nextPlayer;
    }
  }

  // ── 遗物：熔火之心 — 受伤后反弹 30% 给攻击者（即便玩家被击杀也反弹一次）──
  const reflectDamage = relicReflectDamage(nextPlayerAfterRelic, damage, state.balanceSnapshot, state.chapter);
  let reflectEvent: PveEvent | null = null;

  // ── 复仇系(vengeance/retreat_shot/retribution)：受击后下次主动攻击 +5 伤害 ──
  const vengeanceTriggered = !dead && hasVengeanceTrait(traits);

  // ── 进阶 oneShot(final_charge/last_arrow/desperate_gambit)：本层首次 HP≤30% 时 AP+3 ──
  const finalChargeTriggered = !dead
    && hasFinalCharge(traits)
    && hp / state.player.maxHp <= 0.3
    && (floor.finalChargeAvailable ?? true);

  const events: PveEvent[] = [...revealEvents, { type: 'PLAYER_DAMAGED', damage, hp, sourceId: monsterId, rawDamage: rawDamage }];
  if (dead) events.push({ type: 'PLAYER_DEAD' });

  // ── BERSERKER 反击：对攻击者造成 10 伤害（可叠加，不触发击杀，min 1 HP）──
  let nextMonsters = floor.monsters;
  const counterCount = traitCount(traits, 'counter');
  if (!dead && counterCount > 0) {
    const counterDamage = counterCount * 10;
    nextMonsters = nextMonsters.map((m) =>
      m.id === monsterId && m.aiState !== 'DEAD'
        ? { ...m, hp: Math.max(1, m.hp - counterDamage) }
        : m,
    );
  }

  // ── 遗物：熔火之心反弹（不触发击杀，最低 1 HP；玩家死亡也反弹一次）──
  if (reflectDamage > 0) {
    nextMonsters = nextMonsters.map((m) =>
      m.id === monsterId && m.aiState !== 'DEAD'
        ? { ...m, hp: Math.max(1, m.hp - reflectDamage) }
        : m,
    );
    reflectEvent = { type: 'RELIC_TRIGGERED', relicId: 'MAGMA_HEART', detail: `反弹 ${reflectDamage}` };
  }
  // 词条：荆棘（aff_thorns）受击反弹（不触发击杀，最低 1 HP；仅玩家未死时触发）
  const _affThorns = getAffixValue(_mAffixes, 'aff_thorns');
  if (!dead && _affThorns !== undefined && _affThorns > 0) {
    nextMonsters = nextMonsters.map((m) =>
      m.id === monsterId && m.aiState !== 'DEAD'
        ? { ...m, hp: Math.max(1, m.hp - _affThorns) }
        : m,
    );
  }
  if (fateEchoEvent) events.push(fateEchoEvent);
  if (reflectEvent) events.push(reflectEvent);

  // ── Boss 装备 trait: boss_stun_on_hurt（破旧王冠 10% 受击眩晕攻击者）──
  // 消耗 RNG 一次保证 AC-13 确定性；仅在玩家未死且攻击者未死时生效。
  let stunRngState = incomingRngState;
  if (!dead) {
    const stunRng = createRng(stunRngState);
    if (bossStunOnHurt(state.player, stunRng)) {
      nextMonsters = nextMonsters.map((m) =>
        m.id === monsterId && m.aiState !== 'DEAD'
          ? { ...m, frozenRounds: STUN_ROUNDS }
          : m,
      );
    }
    stunRngState = stunRng.state();
  }

  // ── 变体怪物命中效果 ──────────────────────────────────
  // 冰霜哥布林/冰史莱姆/冰霜精灵：移动AP+1持续2回合（叠加）
  const isFrost = !dead && (
    monster.variantId === VARIANT_FROST_GOBLIN ||
    monster.variantId === VARIANT_ICE_SLIME ||
    monster.variantId === VARIANT_FROST_SPRITE
  );
  // 赤炎哥布林/火焰元素：灼烧5HP/回合持续2回合（叠加）
  const isFire = !dead && (
    monster.variantId === VARIANT_FIRE_GOBLIN ||
    monster.variantId === VARIANT_FIRE_ELEMENTAL
  );
  // 毒蝎：中毒8HP/回合持续3回合（不叠加，刷新计时）
  const isPoison = !dead && monster.variantId === VARIANT_POISON_SCORPION;

  if (isFrost) events.push({ type: 'MOVE_PENALTY_APPLIED', rounds: FROST_MOVE_PENALTY_ROUNDS });
  if (isFire) events.push({ type: 'FIRE_BURN_APPLIED', rounds: FIRE_BURN_ROUNDS });
  if (isPoison) events.push({ type: 'POISON_APPLIED', rounds: POISON_ROUNDS });

  return {
    state: {
      ...state,
      status: dead ? 'DEAD' : state.status,
      player: { ...nextPlayerAfterRelic, hp, ...(undyingTriggered ? { undyingUsedChapter: state.chapter } : {}) },
      floorState: {
        ...floor,
        rngState: stunRngState,
        status: dead ? ('DEAD' as const) : floor.status,
        revealed,
        monsters: nextMonsters,
        awakenWeakenedMonsterIds: weakened
          ? (floor.awakenWeakenedMonsterIds ?? []).filter((id) => id !== monsterId)
          : floor.awakenWeakenedMonsterIds,
        ap: finalChargeTriggered ? floor.ap + 3 : floor.ap, // 进阶 oneShot：本层首次 HP≤30% 时 AP+3
        ...(undyingTriggered ? { undyingAvailable: false } : {}),
        ...(vengeanceTriggered ? { vengeanceReady: true } : {}),
        berserkerShield: Math.max(0, shield - absorbed),
        ...(hpDamage > state.player.maxHp * 0.2 ? { generalSetbackReady: true } : {}),
        ...(traits.includes('berserker_tooth_for_tooth') ? { berserkerRetaliationTargetId: monsterId } : {}),
        ...(finalChargeTriggered ? { finalChargeAvailable: false } : {}),
        ...(finalChargeTriggered ? { berserkerFinalChargeReady: true } : {}),
        ...(isFrost
          ? { playerMoveApPenaltyRounds: (floor.playerMoveApPenaltyRounds ?? 0) + FROST_MOVE_PENALTY_ROUNDS }
          : {}),
        ...(isFire
          ? { playerFireBurnRounds: (floor.playerFireBurnRounds ?? 0) + FIRE_BURN_ROUNDS }
          : {}),
        ...(isPoison
          ? { playerPoisonRounds: POISON_ROUNDS }
          : {}),
      },
    },
    events,
  };
}

/**
 * 玩家攻击冰墙（第 3 章 Boss 房 FrostGiant 专属机制）：
 * - 校验：实体存在且未消耗、在攻击范围内、AP 足够，否则 no-op。
 * - 扣 AP（ATTACK 消耗，与攻击怪物相同）。
 * - 用 playerAttackPower 算伤害扣冰墙 hp；HP ≤ 0 时 consumed=true，emit ICE_WALL_BROKEN
 *   + 通过 addAnima 给玩家 CHAPTER3_ICE_WALL_DROP_ANIMA 灵气（可能连锁触发 ANIMA_STRENGTHEN）。
 * - 不消耗 RNG（伤害值由武器与词条决定，全确定性）。
 */
export function attackIceWall(state: ExpeditionState, entityId: string): ApplyResult {
  const floor = state.floorState;
  const wall = floor.entities.find((e) => e.id === entityId);
  if (!wall || wall.type !== 'ICE_WALL' || wall.consumed) return noop(state);
  const attackCost = getBalancedActionCost(state.balanceSnapshot, state.chapter, 'ATTACK');
  if (!canAfford(floor.ap, 'ATTACK', { ATTACK: attackCost })) return noop(state);

  const { damage, range } = playerAttackPower(state.player, state.balanceSnapshot, state.chapter);
  if (manhattan(floor.player, wall.pos) > range) return noop(state);
  if (!isRevealed(floor.revealed, wall.pos)) return noop(state);

  const newHp = Math.max(0, (wall.hp ?? 0) - damage);
  const destroyed = newHp <= 0;

  const events: PveEvent[] = [
    { type: 'ATTACK', attackerId: 'PLAYER', targetId: entityId, damage, targetHp: newHp },
  ];

  let nextFloor: FloorState = {
    ...floor,
    ap: spend(floor.ap, 'ATTACK', { ATTACK: attackCost }),
    entities: floor.entities.map((e) =>
      e.id === entityId
        ? { ...e, hp: newHp, consumed: destroyed }
        : e,
    ),
  };
  nextFloor = consumeFreezeAttack(nextFloor, events);

  let next: ExpeditionState = { ...state, floorState: nextFloor };

  if (destroyed) {
    events.push({ type: 'ICE_WALL_BROKEN', entityId, anima: CHAPTER3_ICE_WALL_DROP_ANIMA });
    const animaResult = addAnima(next, CHAPTER3_ICE_WALL_DROP_ANIMA);
    next = animaResult.state;
    events.push(...animaResult.events);
  }

  return { state: next, events };
}

/**
 * 攻击石块（普通层地形 / 第1章 Boss 房 ROCK，HP=350 可被玩家击碎）：
 * - 校验：实体存在且未消耗、在攻击范围内、AP 足够，否则 no-op。
 * - 扣 AP（ATTACK 消耗）；用 playerAttackPower 扣减石块 HP；HP ≤ 0 时 consumed=true，emit ROCK_DESTROYED。
 */
export function attackRock(state: ExpeditionState, entityId: string): ApplyResult {
  const floor = state.floorState;
  const rock = floor.entities.find((e) => e.id === entityId);
  if (!rock || rock.type !== 'ROCK' || rock.consumed) return noop(state);
  const attackCost = getBalancedActionCost(state.balanceSnapshot, state.chapter, 'ATTACK');
  if (!canAfford(floor.ap, 'ATTACK', { ATTACK: attackCost })) return noop(state);

  const { damage, range } = playerAttackPower(state.player, state.balanceSnapshot, state.chapter);
  if (manhattan(floor.player, rock.pos) > range) return noop(state);
  if (!isRevealed(floor.revealed, rock.pos)) return noop(state);

  const newHp = Math.max(0, (rock.hp ?? 0) - damage);
  const destroyed = newHp <= 0;

  const events: PveEvent[] = [
    { type: 'ATTACK', attackerId: 'PLAYER', targetId: entityId, damage, targetHp: newHp },
  ];

  const nextFloor: FloorState = {
    ...floor,
    ap: spend(floor.ap, 'ATTACK', { ATTACK: attackCost }),
    entities: floor.entities.map((e) =>
      e.id === entityId
        ? { ...e, hp: newHp, consumed: destroyed }
        : e,
    ),
  };

  if (destroyed) {
    events.push({ type: 'ROCK_DESTROYED', entityId });
  }

  return { state: { ...state, floorState: nextFloor }, events };
}
