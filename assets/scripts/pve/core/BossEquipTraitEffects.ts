// Boss 专属装备 trait 效果（Task #12）：
// 集中实现 15 件专属道具的 trait 效果。3 个复杂主动技能型 trait（boss_summon_warrior /
// boss_active_ice / boss_show_intent）标记为 TODO，不在本批次实现。
//
// 命名规范：trait id = `boss_<效果>_<数值>` 或既有的 `on_hit_lifesteal_1`。
// 数值常量内联在本文件，因仅本模块使用，避免 PveConstants 过度膨胀。
//
// 挂钩位置：
//   playerAttack         → 攻击加成（暴击 boss_crit_15）+ 击杀回血（boss_kill_heal_8）+ 吸血（on_hit_lifesteal_1）
//                        + 命中流血/灼烧/冰冻（boss_bleed_on_hit / boss_burn_on_hit / boss_slow_on_hit）
//   monsterAttack        → 物理减伤（boss_phys_reduce_15）+ 冰面减伤（boss_ice_reduce_20）
//                        + 受击眩晕（boss_stun_on_hurt）+ 致死复活（boss_revive_50）
//   endTurn              → 流血 tick（bleedRounds）+ 灼烧 tick（burnRounds）+ 玩家灼烧免疫（boss_burn_immune）
//   applyMove            → 沙坑免疫（boss_sand_immune）

import type { Equipment, ExpeditionState, FloorState, Monster, RunPlayer } from './PveTypes';
import type { Rng } from './rng';

// ── trait id 常量 ─────────────────────────────────────────
export const T_LIFESTEAL = 'on_hit_lifesteal_1'; // 命中回 HP
export const T_STUN_ON_HURT = 'boss_stun_on_hurt'; // 受击概率眩晕
export const T_BLEED_ON_HIT = 'boss_bleed_on_hit'; // 命中流血
export const T_SAND_IMMUNE = 'boss_sand_immune'; // 沙坑免疫
export const T_PHYS_REDUCE = 'boss_phys_reduce_15'; // 物理减伤 15%
export const T_SLOW_ON_HIT = 'boss_slow_on_hit'; // 命中减速（用冰冻 1 回合实现）
export const T_ICE_REDUCE = 'boss_ice_reduce_20'; // 站冰面减伤 20%
export const T_BURN_ON_HIT = 'boss_burn_on_hit'; // 命中灼烧
export const T_BURN_IMMUNE = 'boss_burn_immune'; // 灼烧免疫
export const T_KILL_HEAL = 'boss_kill_heal_8'; // 击杀回血
export const T_CRIT = 'boss_crit_15'; // 15% 暴击 ×2
export const T_REVIVE = 'boss_revive_50'; // 致死复活回 50%（每场 1 次）
export const T_SUMMON_WARRIOR = 'boss_summon_warrior'; // 战争号角：每 5 回合召唤友军

// TODO（主动技能型，标记保留以便后续补充）：
//   boss_active_ice      — 主动铺冰（永冻指环）
//   boss_show_intent     — UI 显示 Boss 下回合意图（纯视图）
// boss_summon_warrior → hasWarHornTrait + CombatSystem.warHornAssist

// ── 数值常量 ─────────────────────────────────────────────
export const LIFESTEAL_HEAL = 5;
export const STUN_CHANCE = 0.10;
export const STUN_ROUNDS = 1; // 复用 frozenRounds，跳过怪物 1 回合
export const BLEED_DAMAGE = 8;
export const BLEED_ROUNDS = 3;
export const BURN_TICK_DAMAGE = 10;
export const BURN_TICKS = 2;
export const PHYS_REDUCE_PCT = 0.15;
export const ICE_REDUCE_PCT = 0.20;
export const KILL_HEAL_AMOUNT = 8;
export const CRIT_CHANCE = 0.15;
export const CRIT_MULT = 2;
export const REVIVE_HP_PCT = 0.50;

/** 玩家是否装备了指定 trait（任意槽位）。 */
export function hasBossTrait(equipment: Equipment, trait: string): boolean {
  return (
    equipment.WEAPON?.trait === trait ||
    equipment.HELMET?.trait === trait ||
    equipment.ARMOR?.trait === trait ||
    equipment.SHOES?.trait === trait ||
    equipment.TRINKET?.trait === trait
  );
}

/** 战争号角（`boss_summon_warrior`）：ExpeditionState 每 5 回合调用 warHornAssist。 */
export function hasWarHornTrait(player: RunPlayer): boolean {
  return hasBossTrait(player.equipment, T_SUMMON_WARRIOR);
}

// ── 攻击侧 ────────────────────────────────────────────────

/** boss_crit_15：消耗 RNG 一次（即便不暴击也推进，保证 AC-13 确定性）。返回伤害倍率（暴击时 ×2）。 */
export function bossCritMult(equipment: Equipment, rng: Rng): number {
  if (!hasBossTrait(equipment, T_CRIT)) return 1;
  return rng.chance(CRIT_CHANCE) ? CRIT_MULT : 1;
}

/** on_hit_lifesteal_1：命中（非致死也算）时回复固定 HP。返回新 HP，上限 maxHp。 */
export function bossLifesteal(player: RunPlayer): number {
  if (!hasBossTrait(player.equipment, T_LIFESTEAL)) return player.hp;
  return Math.min(player.maxHp, player.hp + LIFESTEAL_HEAL);
}

/** boss_kill_heal_8：击杀后回复固定 HP（与吸血叠加）。返回新 HP。 */
export function bossKillHeal(player: RunPlayer, currentHp: number): number {
  if (!hasBossTrait(player.equipment, T_KILL_HEAL)) return currentHp;
  return Math.min(player.maxHp, currentHp + KILL_HEAL_AMOUNT);
}

/**
 * 命中时为目标怪物附加 debuff（流血/灼烧/减速）。
 * 返回 patch；调用方将其合并到 monster 对象。
 *
 * 减速复用 frozenRounds（跳过怪物 1 回合），简化实现避免新增 slowRounds 状态机。
 */
export function bossOnHitDebuffPatch(equipment: Equipment): Partial<Monster> {
  const patch: Partial<Monster> = {};
  if (hasBossTrait(equipment, T_BLEED_ON_HIT)) patch.bleedRounds = BLEED_ROUNDS;
  if (hasBossTrait(equipment, T_BURN_ON_HIT)) patch.burnRounds = BURN_TICKS;
  if (hasBossTrait(equipment, T_SLOW_ON_HIT)) patch.frozenRounds = STUN_ROUNDS;
  return patch;
}

// ── 受击侧 ────────────────────────────────────────────────

/** 玩家是否站在冰面上（用于 boss_ice_reduce_20）。 */
export function isPlayerOnIce(floor: FloorState): boolean {
  return floor.entities.some(
    (e) => e.type === 'ICE_TILE' && !e.consumed && e.pos.x === floor.player.x && e.pos.y === floor.player.y,
  );
}

/**
 * 受击伤害减免比例（boss_phys_reduce_15 + boss_ice_reduce_20 叠加）。
 * 返回 [0, 1] 之间的减免比例，调用方乘 (1 - returned)。
 */
export function bossDamageReducePct(player: RunPlayer, floor: FloorState): number {
  let pct = 0;
  if (hasBossTrait(player.equipment, T_PHYS_REDUCE)) pct += PHYS_REDUCE_PCT;
  if (hasBossTrait(player.equipment, T_ICE_REDUCE) && isPlayerOnIce(floor)) pct += ICE_REDUCE_PCT;
  return Math.min(0.9, pct); // 保险上限 90%，避免完全免疫
}

/** boss_stun_on_hurt：被攻击时 10% 概率眩晕攻击者（复用 frozenRounds）。消耗 RNG 一次保证 AC-13。 */
export function bossStunOnHurt(player: RunPlayer, rng: Rng): boolean {
  if (!hasBossTrait(player.equipment, T_STUN_ON_HURT)) return false;
  return rng.chance(STUN_CHANCE);
}

/**
 * boss_revive_50：致死兜底（每场远征一次，状态存独立装备效果字段）。
 */
export function bossTryRevive(player: RunPlayer): {
  revived: boolean;
  restoredHp: number;
  nextPlayer: RunPlayer;
} {
  if (!hasBossTrait(player.equipment, T_REVIVE)) {
    return { revived: false, restoredHp: 0, nextPlayer: player };
  }
  const used = player.equipmentEffectState?.bossReviveUsed === true;
  if (used) return { revived: false, restoredHp: 0, nextPlayer: player };
  const restoredHp = Math.max(1, Math.round(player.maxHp * REVIVE_HP_PCT));
  return {
    revived: true,
    restoredHp,
    nextPlayer: {
      ...player,
      equipmentEffectState: {
        ...player.equipmentEffectState,
        bossReviveUsed: true,
      },
    },
  };
}

// ── 状态 tick（流血/灼烧）────────────────────────────────

/** 玩家是否灼烧免疫（boss_burn_immune，焰心护胸）。 */
export function isPlayerBurnImmune(equipment: Equipment): boolean {
  return hasBossTrait(equipment, T_BURN_IMMUNE);
}

/**
 * 怪物回合开始 tick：处理 bleedRounds / burnRounds，扣血并递减回合数。
 * 返回 patched 怪物列表 + 累计造成的伤害事件信息（供战报展示，简化为汇总）。
 */
export function tickMonsterDots(monsters: readonly Monster[]): { monsters: Monster[]; totalDamage: number } {
  let totalDamage = 0;
  const next = monsters.map((m) => {
    if (m.aiState === 'DEAD') return m;
    let hp = m.hp;
    let bleed = m.bleedRounds ?? 0;
    let burn = m.burnRounds ?? 0;
    let poison = m.poisonRounds ?? 0;
    if (bleed > 0) {
      hp = Math.max(0, hp - BLEED_DAMAGE);
      totalDamage += BLEED_DAMAGE;
      bleed -= 1;
    }
    if (burn > 0) {
      hp = Math.max(0, hp - BURN_TICK_DAMAGE);
      totalDamage += BURN_TICK_DAMAGE;
      burn -= 1;
    }
    if (poison > 0) {
      hp = Math.max(0, hp - (m.poisonDamage ?? 3));
      poison -= 1;
    }
    if (hp === m.hp && bleed === (m.bleedRounds ?? 0) && burn === (m.burnRounds ?? 0) && poison === (m.poisonRounds ?? 0)) return m;
    const dead = hp <= 0;
    return {
      ...m,
      hp,
      aiState: dead ? ('DEAD' as const) : m.aiState,
      bleedRounds: bleed > 0 ? bleed : undefined,
      burnRounds: burn > 0 ? burn : undefined,
      poisonRounds: poison > 0 ? poison : undefined,
      poisonDamage: poison > 0 ? m.poisonDamage : undefined,
    };
  });
  return { monsters: next, totalDamage };
}

// ── 移动侧 ────────────────────────────────────────────────

/** boss_sand_immune：踩沙坑时 AP 惩罚归零。 */
export function bossSandImmune(equipment: Equipment): boolean {
  return hasBossTrait(equipment, T_SAND_IMMUNE);
}
