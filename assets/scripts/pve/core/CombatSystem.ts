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
//   WEAPON.baseStat → 攻击加成；ARMOR.baseStat → 受伤减伤（最低造成 10 伤害）

import { addAnima, traitCount } from './AnimaSystem';
import { canAfford, spend } from './ApSystem';
import { equipTraitAtkBonus, equipTraitDefBonus } from './EquipTraitEffects';
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
import { applyMonsterKillDrop } from './LootSystem';
import {
  applyFreezeToMonsters,
  relicComputeAttackBonus,
  relicOnHitTarget,
  relicOnKill,
  relicReflectDamage,
  relicTryRevive,
} from './RelicSystem';
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
  BASE_ATTACK,
  BASE_ATTACK_RANGE,
  CHAPTER3_ICE_WALL_DROP_ANIMA,
  CLASS_STATS,
  FATE_ENRAGE_HP_RATIO,
  FATE_MIRROR_BOSS_ID,
  FATE_MIRROR_SPAWN_HP_RATIO,
  FIRE_BURN_ROUNDS,
  FROST_GIANT_ENRAGE_HP_RATIO,
  FROST_MOVE_PENALTY_ROUNDS,
  LAVA_LORD_LAVA_STAND_DAMAGE_REDUCTION,
  QUICKSAND_SCORPION_ENRAGE_HP_RATIO,
} from './PveConstants';
import { VARIANT_FIRE_GOBLIN, VARIANT_FROST_GOBLIN } from './Chapter1Monsters';
import { GOBLIN_CHIEF_ENRAGE_HP } from './bosses/GoblinChief';
import { isRevealed, reveal } from './FogSystem';
import { createRng } from './rng';
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
function resolveHit(state: ExpeditionState, targetId: string, damage: number, events: PveEvent[]): ExpeditionState {
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

  const targetHp = Math.max(0, monster.hp - damage);
  const dead = targetHp <= 0;

  let next: ExpeditionState = {
    ...state,
    floorState: {
      ...state.floorState,
      monsters: state.floorState.monsters.map((m) =>
        m.id === targetId ? { ...m, hp: targetHp, aiState: dead ? ('DEAD' as const) : m.aiState } : m,
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
  }

  return next;
}

/**
 * 玩家当前攻击力与攻击范围：
 *   基础值 + 职业加成 + 武器基础属性 + 词条（鹰眼 / 射手精通）。
 */
export function playerAttackPower(player: RunPlayer): { damage: number; range: number } {
  const stats = CLASS_STATS[player.classId];
  const weapon = player.equipment.WEAPON;
  const traits = player.classTraits;

  let rawAttack = BASE_ATTACK + stats.attackBonus + (weapon?.baseStat ?? 0);
  let range = BASE_ATTACK_RANGE + stats.attackRangeBonus;

  rawAttack += traitCount(traits, 'marksman') * 5;          // ARCHER 射手精通（可叠加）
  if (traits.includes('eagle_eye')) range += 1;             // ARCHER 鹰眼
  rawAttack += traitCount(traits, 'strengthen_attack_up') * 5; // ADVENTURER 强化攻击（可叠加）
  if (traits.includes('awakened_power_shot')) rawAttack += 15; // 觉醒·强弓（射手·强击型）
  rawAttack += player.treeBonuses?.attackBonus ?? 0;        // 命运树 B1 武者直觉
  rawAttack += equipTraitAtkBonus(player);                  // 装备词条 equip_atk_up（AC-401，每件 +1，可叠加）
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
 *  - 暴击(crit): 20% 概率三倍伤害（消耗 rngState）
 *  - 吸血(life_steal): 每次攻击回复 10 HP
 *  - 血怒(blood_rage): 击杀目标时回复 20 HP
 *  - 连射(multi_shot): 30% 概率再射一箭（基础伤害，不含词条加乘，消耗 rngState）
 */
export function playerAttack(state: ExpeditionState, monsterId: string): ApplyResult {
  const floor = state.floorState;
  const monster = floor.monsters.find((m) => m.id === monsterId);
  if (!monster || monster.aiState === 'DEAD') return noop(state);
  if (!canAfford(floor.ap, 'ATTACK')) return noop(state);
  // 潜地状态免疫玩家攻击（流沙巨蝎）
  if (monster.isBurrowed) return noop(state);

  const traits = state.player.classTraits;
  let { damage, range } = playerAttackPower(state.player);
  if (manhattan(floor.player, monster.pos) > range) return noop(state);

  // ── 概率 RNG（所有随机检定共用同一实例，保证 AC-13 确定性）──
  const rng = createRng(floor.rngState);

  // ── 伤害词条（确定性叠加，在 RNG 词条前计算）──
  if (state.player.hp <= state.player.maxHp / 2) {
    damage += traitCount(traits, 'berserk') * 10; // BERSERKER 狂暴（可叠加）
  }
  // 背刺(backstab) / 觉醒·影袭(awakened_shadow_strike，每回合可触发2次)
  const hasShadowStrike = traits.includes('awakened_shadow_strike');
  const shadowStrikeCount = floor.shadowStrikeCount ?? 0;
  const backstabActive = (traits.includes('backstab') || hasShadowStrike)
    && (floor.backstabAvailable ?? false)
    && (!hasShadowStrike || shadowStrikeCount < 2);
  if (backstabActive) {
    // 觉醒·处决(awakened_execute)：背刺伤害提升至 3 倍
    damage *= traits.includes('awakened_execute') ? 3 : 2;
  }
  if (monster.aiState !== 'CHASE') {
    damage += traitCount(traits, 'assassin_heart') * 20; // ROGUE 刺客之心（可叠加）
  }
  damage += executionerBonus(traits, monster); // 处刑者/收割者/致命一击：目标 HP≤20% 时 +3
  const vengeanceActive = vengeanceBonus(traits, floor) > 0;
  damage += vengeanceBonus(traits, floor); // 复仇/回马枪/夜枭反击：受击后下次攻击 +5（一次性消耗）

  // 觉醒·狂热(awakened_frenzy)：上次击杀后下一击必定暴击（×3）
  const frenzyTriggered = traits.includes('awakened_frenzy') && (floor.frenzyPending ?? false);
  if (frenzyTriggered) {
    damage *= 3;
  }

  // ── 概率词条（消耗 rngState，始终推进以保证 AC-13 确定性；rng 在上方范围检查后创建）──
  if (traits.includes('crit') && rng.chance(0.20)) {
    damage *= 3; // ARCHER 暴击：20% 三倍伤害
  }

  // Boss 装备 trait: boss_crit_15（命运之刃 15% 暴击 ×2，始终消耗 RNG 一次）
  damage *= bossCritMult(state.player.equipment, rng);

  // 觉醒·处决(awakened_execute)：目标 HP ≤ 30% 时直接处决
  if (traits.includes('awakened_execute') && monster.hp / monster.maxHp <= 0.3) {
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

  // ── 造伤 ──
  const targetHp = Math.max(0, monster.hp - damage);
  const dead = targetHp <= 0;
  const events: PveEvent[] = [...relicAtk.events];

  // ── 玩家 HP 更新（吸血 / 血怒 / 觉醒·狂热回血；静默更新，HUD 在下一帧刷新）──
  let playerHp = state.player.hp;
  const lifeStealCount = traitCount(traits, 'life_steal');
  if (lifeStealCount > 0) {
    playerHp = Math.min(state.player.maxHp, playerHp + lifeStealCount * 10); // BERSERKER 吸血（可叠加）
  }
  // Boss 装备 trait: on_hit_lifesteal_1（哥布林酋长战斧吸血 +5）
  playerHp = bossLifesteal({ ...state.player, hp: playerHp });
  if (dead) {
    const bloodRageCount = traitCount(traits, 'blood_rage');
    if (bloodRageCount > 0) {
      playerHp = Math.min(state.player.maxHp, playerHp + bloodRageCount * 20); // BERSERKER 血怒（可叠加）
    }
    const bloodlustHeal = bloodlustStackHeal(traits);
    if (bloodlustHeal > 0) {
      playerHp = Math.min(state.player.maxHp, playerHp + bloodlustHeal); // 嗜血本能/续命箭/放血（可叠加×5，+层数 HP）
    }
    // Boss 装备 trait: boss_kill_heal_8（烈焰指环击杀回血）
    playerHp = bossKillHeal(state.player, playerHp);
  }
  if (frenzyTriggered) {
    playerHp = Math.min(state.player.maxHp, playerHp + 20); // 觉醒·狂热回血
  }

  // ── floorState 状态位更新（背刺消耗 / 影袭计数 / 狂热标记 / 复仇消耗）──
  let nextFloorState = {
    ...floor,
    ap: spend(floor.ap, 'ATTACK'),
    rngState: rng.state(),
    ...(vengeanceActive ? { vengeanceReady: false } : {}),
    // 命运守卫行为镜像：玩家本回合至少一次发起攻击（endTurn 时供 recordPlayerActionForMirror 读取）
    playerAttackedThisTurn: true,
  };
  if (backstabActive) {
    if (hasShadowStrike) {
      const newCount = shadowStrikeCount + 1;
      nextFloorState = {
        ...nextFloorState,
        shadowStrikeCount: newCount,
        ...(newCount >= 2 ? { backstabAvailable: false } : {}),
      };
    } else {
      nextFloorState = { ...nextFloorState, backstabAvailable: false };
    }
  }
  if (traits.includes('awakened_frenzy')) {
    nextFloorState = {
      ...nextFloorState,
      frenzyPending: dead ? true : (frenzyTriggered ? false : floor.frenzyPending),
    };
  }

  let nextState: ExpeditionState = {
    ...state,
    player: { ...relicPlayerPatch, hp: playerHp },
    floorState: nextFloorState,
  };

  nextState = resolveHit(nextState, monsterId, damage, events);

  // 遗物：永冻之核 — 命中后若 pending 则冰冻目标（消费 pending）。
  // 注意：若 resolveHit 已致死，则不冰冻（已无意义）。
  const targetStillAlive = nextState.floorState.monsters.find((m) => m.id === monsterId)?.aiState !== 'DEAD';
  if (targetStillAlive) {
    const freeze = relicOnHitTarget(nextState.player, monsterId);
    if (freeze.freezeTargetId) {
      nextState = {
        ...nextState,
        player: freeze.nextPlayer,
        floorState: {
          ...nextState.floorState,
          monsters: applyFreezeToMonsters(nextState.floorState.monsters, freeze.freezeTargetId),
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
  }

  // ── 横扫/散射/震荡波(cleave 系) + 觉醒·横扫(awakened_cleave)：对目标周围相邻怪物造成50%溅射伤害 ──
  if (traits.includes('awakened_cleave') || hasCleave(traits)) {
    const splashDamage = Math.max(10, Math.round(damage * 0.5));
    const adjacentIds = floor.monsters
      .filter((m) => m.id !== monsterId && m.aiState !== 'DEAD' && manhattan(m.pos, monster.pos) === 1)
      .map((m) => m.id);
    for (const id of adjacentIds) {
      nextState = resolveHit(nextState, id, splashDamage, events);
    }
  }

  // ── ARCHER 连射(multi_shot, 30%) / 觉醒·连珠(awakened_volley, 60%+30%连锁) ──
  const volley = traits.includes('awakened_volley');
  const multiShotChance = volley ? 0.60 : (traits.includes('multi_shot') ? 0.30 : 0);
  if (multiShotChance > 0) {
    const rng2 = createRng(nextState.floorState.rngState);
    const fires = rng2.chance(multiShotChance);
    nextState = { ...nextState, floorState: { ...nextState.floorState, rngState: rng2.state() } };

    if (fires) {
      const m2 = nextState.floorState.monsters.find((m) => m.id === monsterId);
      if (m2 && m2.aiState !== 'DEAD') {
        const { damage: dmg2 } = playerAttackPower(nextState.player); // 基础伤害，无词条加乘
        nextState = resolveHit(nextState, monsterId, dmg2, events);

        // 觉醒·连珠：30% 概率连锁射击范围内另一存活目标
        if (volley) {
          const rng3 = createRng(nextState.floorState.rngState);
          const chains = rng3.chance(0.30);
          nextState = { ...nextState, floorState: { ...nextState.floorState, rngState: rng3.state() } };
          if (chains) {
            const { range: chainRange } = playerAttackPower(nextState.player);
            const chainTarget = nextState.floorState.monsters.find(
              (m) => m.id !== monsterId && m.aiState !== 'DEAD'
                && manhattan(m.pos, nextState.floorState.player) <= chainRange,
            );
            if (chainTarget) {
              nextState = resolveHit(nextState, chainTarget.id, dmg2, events);
            }
          }
        }
      }
    }
  }

  nextState = { ...nextState, floorState: consumeFreezeAttack(nextState.floorState, events) };

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
  if (manhattan(monster.pos, floor.player) > monster.range) return noop(state);

  const traits = state.player.classTraits;

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
    return {
      state: { ...state, floorState: { ...floor, revealed, hasAfterimage: false } },
      events: revealEvents,
    };
  }

  // ── 装备减伤（ARMOR 槽，AC-17 + equip_def_up 词条，AC-402）──
  const armorReduction = (state.player.equipment.ARMOR?.baseStat ?? 0) + equipTraitDefBonus(state.player);
  const rawDamage = monster.attack;
  // damageMult 在护甲减伤后生效（护甲先吸收，余量再倍率）；痛觉钝化系(≥5 时再-2)在最终取整前扣除。
  let reducedDamage = Math.max(0, rawDamage - armorReduction) * damageMult;
  // Boss 装备 trait: 物理减伤 + 站冰面减伤（叠加，上限 90%）
  const bossReducePct = bossDamageReducePct(state.player, floor);
  if (bossReducePct > 0) reducedDamage *= (1 - bossReducePct);
  const damage = Math.max(10, Math.round(reducedDamage - painToleranceReduction(traits, reducedDamage)));

  let hp = Math.max(0, state.player.hp - damage);
  let dead = hp <= 0;

  // ── BERSERKER 不屈：本层首次将死时保留 1 HP ──
  let undyingTriggered = false;
  if (dead && traits.includes('undying') && (floor.undyingAvailable ?? true)) {
    hp = 1;
    dead = false;
    undyingTriggered = true;
  }

  // ── 遗物：命运回响 — 不屈未触发但仍 dead 时兜底（每场远征一次），优先级低于不屈 ──
  let nextPlayerAfterRelic = state.player;
  let fateEchoEvent: PveEvent | null = null;
  if (dead) {
    const revive = relicTryRevive(state.player);
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
  const reflectDamage = relicReflectDamage(nextPlayerAfterRelic, damage);
  let reflectEvent: PveEvent | null = null;

  // ── 复仇系(vengeance/retreat_shot/retribution)：受击后下次主动攻击 +5 伤害 ──
  const vengeanceTriggered = !dead && hasVengeanceTrait(traits);

  // ── 进阶 oneShot(final_charge/last_arrow/desperate_gambit)：本层首次 HP≤30% 时 AP+3 ──
  const finalChargeTriggered = !dead
    && hasFinalCharge(traits)
    && hp / state.player.maxHp <= 0.3
    && (floor.finalChargeAvailable ?? true);

  const events: PveEvent[] = [...revealEvents, { type: 'PLAYER_DAMAGED', damage, hp, sourceId: monsterId }];
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
  if (fateEchoEvent) events.push(fateEchoEvent);
  if (reflectEvent) events.push(reflectEvent);

  // ── Boss 装备 trait: boss_stun_on_hurt（破旧王冠 10% 受击眩晕攻击者）──
  // 消耗 RNG 一次保证 AC-13 确定性；仅在玩家未死且攻击者未死时生效。
  let stunRngState = floor.rngState;
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

  // ── 第一章变体怪物击中效果 ──────────────────────────────
  // 冰霜哥布林：移动AP+1持续2回合（叠加）
  const isFrost = !dead && monster.variantId === VARIANT_FROST_GOBLIN;
  // 赤炎哥布林：灼烧5HP/回合持续2回合（叠加）
  const isFire = !dead && monster.variantId === VARIANT_FIRE_GOBLIN;

  if (isFrost) events.push({ type: 'MOVE_PENALTY_APPLIED', rounds: FROST_MOVE_PENALTY_ROUNDS });
  if (isFire) events.push({ type: 'FIRE_BURN_APPLIED', rounds: FIRE_BURN_ROUNDS });

  return {
    state: {
      ...state,
      status: dead ? 'DEAD' : state.status,
      player: { ...nextPlayerAfterRelic, hp },
      floorState: {
        ...floor,
        rngState: stunRngState,
        status: dead ? ('DEAD' as const) : floor.status,
        revealed,
        monsters: nextMonsters,
        ap: finalChargeTriggered ? floor.ap + 3 : floor.ap, // 进阶 oneShot：本层首次 HP≤30% 时 AP+3
        ...(undyingTriggered ? { undyingAvailable: false } : {}),
        ...(vengeanceTriggered ? { vengeanceReady: true } : {}),
        ...(finalChargeTriggered ? { finalChargeAvailable: false } : {}),
        ...(isFrost
          ? { playerMoveApPenaltyRounds: (floor.playerMoveApPenaltyRounds ?? 0) + FROST_MOVE_PENALTY_ROUNDS }
          : {}),
        ...(isFire
          ? { playerFireBurnRounds: (floor.playerFireBurnRounds ?? 0) + FIRE_BURN_ROUNDS }
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
  if (!canAfford(floor.ap, 'ATTACK')) return noop(state);

  const { damage, range } = playerAttackPower(state.player);
  if (manhattan(floor.player, wall.pos) > range) return noop(state);

  const newHp = Math.max(0, (wall.hp ?? 0) - damage);
  const destroyed = newHp <= 0;

  const events: PveEvent[] = [
    { type: 'ATTACK', attackerId: 'PLAYER', targetId: entityId, damage, targetHp: newHp },
  ];

  let nextFloor: FloorState = {
    ...floor,
    ap: spend(floor.ap, 'ATTACK'),
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
