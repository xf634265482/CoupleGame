// 灵气强化系统（design §9）：每累计 100 灵气自动触发一次 3 选 1 强化，所选词条计入 player.classTraits
// （存档字段含「职业词条」，与强化选择共用同一存储 —— 详见 design.md §2.1 自动存档字段）。
//
// 各职业强化词条池已扩到 15 条（AC-404~407，260613-m2-systems-depth 阶段2），
// 新增 10 条/职业的具体效果实现见 StrengthenEffects.ts + CombatSystem.ts。

import { createRng } from './rng';
import { ANIMA_PER_STRENGTHEN, ANIMA_THRESHOLD_MULTIPLIER, STRENGTHEN_CHOICES } from './PveConstants';
import type { ClassId } from './PveConstants';
import type { ApplyResult, ExpeditionState, PveEvent } from './PveTypes';
import {
  ADVENTURER_STRENGTHEN_DEFS,
  ARCHER_STRENGTHEN_DEFS,
  BERSERKER_STRENGTHEN_DEFS,
  ROGUE_STRENGTHEN_DEFS,
  STRENGTHEN_DEF_BY_ID,
} from './strengthen/StrengthenCatalog';
import { rollStrengthenOffers } from './strengthen/StrengthenOfferSystem';
import {
  generalAnimaGainPct,
  generalDynamicMaxHpBonus,
} from './strengthen/CommonStrengthenEffects';

/** ADVENTURER 通用强化池（无职业时使用，M1 兼容）。 */
export const ADVENTURER_STRENGTHEN_POOL = [
  'strengthen_hp_up',     // 最大 HP +40
  'strengthen_attack_up', // 攻击力 +5
  'strengthen_ap_up',     // 下回合起 AP 上限 +1
  'strengthen_gold_find', // 拾取金币 +20%
  'general_guard_training', 'general_anima_sense', 'general_chest_lore', 'general_recovery_rhythm',
  'general_first_strike', 'general_steady_finish', 'general_last_defense', 'general_reserve_setup',
  'general_setback_counter', 'general_polymath', 'general_accumulation', 'general_cover_guard',
  'general_terrain_power', 'general_stored_edge', 'general_overheal_anima', 'general_blood_price',
] as const;

/** BERSERKER 职业强化池（15 条，AC-16 + AC-404）。 */
export const BERSERKER_STRENGTHEN_POOL = [
  'life_steal',         // 吸血：每次攻击回复 10 HP
  'berserk',            // 狂暴：HP ≤ 50% 时攻击 +10
  'blood_rage',         // 血怒：击杀时回复 20 HP
  'undying',            // 不屈：本层首次将死时保留 1 HP
  'counter',            // 反击：被攻击时对攻击者造成 10 伤害
  'last_stand',         // 绝境一击：HP ≤ 25% 时攻击 ×2
  'vengeance',          // 复仇：受击后下次攻击 +5 伤害
  'cleave',             // 横扫：命中后对相邻敌人造成 50% 溅射伤害
  'pain_tolerance',     // 痛觉钝化：受到 ≥5 伤害时再 -2
  'executioner',        // 处刑者：对 HP ≤ 20% 目标 +3 伤害
  'iron_skin_stack',    // 铁骨（可叠加×5）：选中时 maxHp/HP +3
  'bloodlust_stack',    // 嗜血本能（可叠加×5）：击杀回复等同层数 HP
  'rage_strike_stack',  // 怒击连击（可叠加×5）：攻击力 + 层数×0.5
  'berserker_resolve',  // 进阶·背水一战：HP ≤ 30% 时攻击 ×1.5
  'final_charge',       // 进阶 oneShot：本层首次 HP ≤ 30% 时 AP +3
  'berserker_blood_shield', 'berserker_bloody_chain', 'berserker_rage_boiling',
  'berserker_death_feast', 'berserker_tooth_for_tooth',
] as const;

/** ARCHER 职业强化池（15 条，AC-16 + AC-404）。 */
export const ARCHER_STRENGTHEN_POOL = [
  'eagle_eye',     // 鹰眼：攻击范围 +1
  'marksman',      // 射手精通：攻击力 +5
  'multi_shot',    // 连射：30% 概率对同一目标再射一箭
  'pierce',        // 穿透：攻击无视护甲减伤
  'crit',          // 暴击：10% 概率造成双倍伤害
  'headshot',      // 致命狩猎：HP ≤ 25% 时攻击 ×2
  'retreat_shot',  // 回马枪：受击后下次攻击 +5 伤害
  'scatter_shot',  // 散射：命中后对相邻敌人造成 50% 溅射伤害
  'steady_aim',    // 稳健射姿：受到 ≥5 伤害时再 -2
  'finisher',      // 收割者：对 HP ≤ 20% 目标 +3 伤害
  'quiver_stack',  // 强化箭袋（可叠加×5）：选中时 maxHp/HP +3
  'vital_shot_stack', // 续命箭（可叠加×5）：击杀回复等同层数 HP
  'focus_stack',   // 专注蓄力（可叠加×5）：攻击力 + 层数×0.5
  'deadeye',       // 进阶·死神之眼：HP ≤ 30% 时攻击 ×1.5
  'last_arrow',    // 进阶 oneShot：本层首次 HP ≤ 30% 时 AP +3
  'archer_breath_focus', 'archer_line_pierce', 'archer_arrow_rhythm',
  'archer_critical_reload', 'archer_mark_transfer',
] as const;

/** ROGUE 职业强化池（15 条，AC-16 + AC-404）。 */
export const ROGUE_STRENGTHEN_POOL = [
  'swift',              // 疾步：移动消耗 AP -1
  'backstab',           // 背刺：移动后首次攻击双倍伤害
  'stealth',            // 潜行：怪物仇恨范围对你缩小 2
  'afterimage',         // 残影：本层闪避首次受到的攻击
  'assassin_heart',     // 刺客之心：对非追击状态敌人 +20 伤害
  'shadow_strike',      // 暗影突袭：HP ≤ 25% 时攻击 ×2
  'retribution',        // 夜枭反击：受击后下次攻击 +5 伤害
  'shockwave',          // 震荡波：命中后对相邻敌人造成 50% 溅射伤害
  'evasion_training',   // 闪避训练：受到 ≥5 伤害时再 -2
  'coup_de_grace',      // 致命一击：对 HP ≤ 20% 目标 +3 伤害
  'nimble_stack',       // 灵巧（可叠加×5）：选中时 maxHp/HP +3
  'bloodletter_stack',  // 放血（可叠加×5）：击杀回复等同层数 HP
  'flurry_stack',       // 连斩（可叠加×5）：攻击力 + 层数×0.5
  'survival_instinct',  // 进阶·求生本能：HP ≤ 30% 时攻击 ×1.5
  'desperate_gambit',   // 进阶 oneShot：本层首次 HP ≤ 30% 时 AP +3
  'rogue_poison_spread', 'rogue_venom_burst', 'rogue_blade_dance',
  'rogue_chain_backstab', 'rogue_vanish_shadow',
] as const;

/** M1 兼容别名（指向 ADVENTURER 池）。 */
export const M1_STRENGTHEN_POOL = ADVENTURER_STRENGTHEN_POOL;
export type StrengthenId = (typeof M1_STRENGTHEN_POOL)[number];

/** 强化词条 tier：basic/condition 计入「进阶解锁」判定；stack 为数值叠加型；advanced 需 ≥3 个 basic/condition。 */
export type StrengthenTier = 'basic' | 'condition' | 'stack' | 'advanced';

export interface StrengthenMeta {
  /** 允许叠加选取的次数上限（缺省 1 = 不可重复选取）。 */
  stack?: number;
  /** 一次性词条：效果只在选中时触发一次（语义标记，过滤行为与 stack=1 一致）。 */
  oneShot?: true;
  tier: StrengthenTier;
  classId: ClassId;
}

/** 选中时立即生效 +3 maxHp/HP 的可叠加词条（铁骨/强化箭袋/灵巧）。 */
export const IMMEDIATE_HP_STACK_TRAITS = new Set(['iron_skin_stack']);

/** 强化词条元数据表（AC-404~406）：覆盖 ADVENTURER + BERSERKER/ARCHER/ROGUE 全部 49 条词条。 */
export const STRENGTHEN_META: Record<string, StrengthenMeta> = {
  // ── ADVENTURER（M1 通用池，全部数值型可叠加）──
  strengthen_hp_up: { stack: 5, tier: 'basic', classId: 'ADVENTURER' },
  strengthen_attack_up: { stack: 5, tier: 'basic', classId: 'ADVENTURER' },
  strengthen_ap_up: { stack: 5, tier: 'basic', classId: 'ADVENTURER' },
  strengthen_gold_find: { stack: 5, tier: 'basic', classId: 'ADVENTURER' },

  // ── BERSERKER ──
  life_steal: { stack: 5, tier: 'basic', classId: 'BERSERKER' },
  berserk: { stack: 5, tier: 'condition', classId: 'BERSERKER' },
  blood_rage: { stack: 5, tier: 'basic', classId: 'BERSERKER' },
  undying: { oneShot: true, tier: 'condition', classId: 'BERSERKER' },
  counter: { stack: 5, tier: 'basic', classId: 'BERSERKER' },
  last_stand: { tier: 'condition', classId: 'BERSERKER' },
  vengeance: { tier: 'condition', classId: 'BERSERKER' },
  cleave: { tier: 'basic', classId: 'BERSERKER' },
  pain_tolerance: { tier: 'basic', classId: 'BERSERKER' },
  executioner: { tier: 'basic', classId: 'BERSERKER' },
  iron_skin_stack: { stack: 5, tier: 'stack', classId: 'BERSERKER' },
  bloodlust_stack: { stack: 5, tier: 'stack', classId: 'BERSERKER' },
  rage_strike_stack: { stack: 5, tier: 'stack', classId: 'BERSERKER' },
  berserker_resolve: { tier: 'advanced', classId: 'BERSERKER' },
  final_charge: { oneShot: true, tier: 'advanced', classId: 'BERSERKER' },

  // ── ARCHER ──
  eagle_eye: { tier: 'basic', classId: 'ARCHER' },
  marksman: { stack: 5, tier: 'basic', classId: 'ARCHER' },
  multi_shot: { tier: 'basic', classId: 'ARCHER' },
  pierce: { tier: 'basic', classId: 'ARCHER' },
  crit: { tier: 'basic', classId: 'ARCHER' },
  headshot: { tier: 'condition', classId: 'ARCHER' },
  retreat_shot: { tier: 'condition', classId: 'ARCHER' },
  scatter_shot: { tier: 'basic', classId: 'ARCHER' },
  steady_aim: { tier: 'basic', classId: 'ARCHER' },
  finisher: { tier: 'basic', classId: 'ARCHER' },
  quiver_stack: { stack: 5, tier: 'stack', classId: 'ARCHER' },
  vital_shot_stack: { stack: 5, tier: 'stack', classId: 'ARCHER' },
  focus_stack: { stack: 5, tier: 'stack', classId: 'ARCHER' },
  deadeye: { tier: 'advanced', classId: 'ARCHER' },
  last_arrow: { oneShot: true, tier: 'advanced', classId: 'ARCHER' },

  // ── ROGUE ──
  swift: { tier: 'basic', classId: 'ROGUE' },
  backstab: { tier: 'condition', classId: 'ROGUE' },
  stealth: { tier: 'basic', classId: 'ROGUE' },
  afterimage: { tier: 'condition', classId: 'ROGUE' },
  assassin_heart: { stack: 5, tier: 'condition', classId: 'ROGUE' },
  shadow_strike: { tier: 'condition', classId: 'ROGUE' },
  retribution: { tier: 'condition', classId: 'ROGUE' },
  shockwave: { tier: 'basic', classId: 'ROGUE' },
  evasion_training: { tier: 'basic', classId: 'ROGUE' },
  coup_de_grace: { tier: 'basic', classId: 'ROGUE' },
  nimble_stack: { stack: 5, tier: 'stack', classId: 'ROGUE' },
  bloodletter_stack: { stack: 5, tier: 'stack', classId: 'ROGUE' },
  flurry_stack: { stack: 5, tier: 'stack', classId: 'ROGUE' },
  survival_instinct: { tier: 'advanced', classId: 'ROGUE' },
  desperate_gambit: { oneShot: true, tier: 'advanced', classId: 'ROGUE' },
};

for (const def of Object.values(STRENGTHEN_DEF_BY_ID)) {
  STRENGTHEN_META[def.id] = {
    stack: def.stack,
    tier: def.kind === 'core' || def.kind === 'route' ? 'advanced'
      : def.kind === 'stack' ? 'stack'
        : def.kind === 'condition' || def.kind === 'anomaly' ? 'condition' : 'basic',
    classId: def.classId,
  };
}

/** 统计 traits 数组中某词条 id 出现的次数（用于数值型可叠加词条）。 */
export function traitCount(traits: readonly string[], id: string): number {
  let count = 0;
  for (const t of traits) {
    if (t === id) count++;
  }
  return count;
}

/** 各职业对应的强化词条池（AC-16 M2）。 */
const CLASS_STRENGTHEN_POOL: Partial<Record<ClassId, readonly string[]>> = {
  ADVENTURER: ADVENTURER_STRENGTHEN_DEFS.map((def) => def.id),
  BERSERKER: BERSERKER_STRENGTHEN_DEFS.map((def) => def.id),
  ARCHER: ARCHER_STRENGTHEN_DEFS.map((def) => def.id),
  ROGUE: ROGUE_STRENGTHEN_DEFS.map((def) => def.id),
};

/** 取指定职业的强化词条池（无对应池时回退到 ADVENTURER 通用池），供命运树 E3「命运护佑」复用。 */
export function strengthenPoolForClass(classId: ClassId): readonly string[] {
  return CLASS_STRENGTHEN_POOL[classId] ?? ADVENTURER_STRENGTHEN_POOL;
}

/**
 * 按 classTraits 过滤候选池后随机抽取 3 个（AC-405/406）：
 * - oneShot 或 stack 已达上限的词条不再出现；
 * - tier='advanced' 的词条需玩家已拥有 ≥3 个同池 tier∈{basic,condition} 的词条才出现。
 */
export function rollChoices(
  rngState: number,
  pool: readonly string[],
  classTraits: readonly string[],
  recentOffers: readonly string[] = [],
): { choices: string[]; nextRngState: number } {
  const catalogPool = pool.map((id) => STRENGTHEN_DEF_BY_ID[id]).filter((def) => !!def);
  if (catalogPool.length > 0) {
    return rollStrengthenOffers({ rngState, pool: catalogPool, owned: classTraits, recentOffers, count: STRENGTHEN_CHOICES });
  }
  const baseOrConditionOwned = pool.filter((id) => {
    const meta = STRENGTHEN_META[id];
    return meta && (meta.tier === 'basic' || meta.tier === 'condition') && classTraits.includes(id);
  }).length;

  const filtered = pool.filter((id) => {
    const meta = STRENGTHEN_META[id];
    if (!meta) return true;
    const count = traitCount(classTraits, id);
    if (meta.oneShot && count >= 1) return false;
    const cap = meta.stack ?? 1;
    if (count >= cap) return false;
    if (meta.tier === 'advanced' && baseOrConditionOwned < 3) return false;
    return true;
  });

  const rng = createRng(rngState);
  const shuffled = rng.shuffle(filtered);
  const count = Math.min(STRENGTHEN_CHOICES, shuffled.length);
  return { choices: shuffled.slice(0, count), nextRngState: rng.state() };
}

/**
 * 为玩家增加灵气并累计强化进度；进度每达到 animaThreshold（初始 100，每次强化后 ×1.5）
 * 即消耗阈值并触发一次 3 选 1（产生 ANIMA_STRENGTHEN 事件，候选项等待玩家通过 applyStrengthen 选定）。
 * 单次大额获取可能连续触发多次（如一次性获得 250 点，阈值 100 → 触发两次，剩余 50 点累计）。
 */
export function addAnima(state: ExpeditionState, amount: number): ApplyResult {
  if (amount <= 0) return { state, events: [] };

  // 饰品灵气加成：baseStat 直接作为百分比（5/10/15/20/30%）
  const trinketBonus = state.player.equipment.TRINKET?.baseStat ?? 0;
  // 命运树 D3 灵气亲和：灵气获取额外 +animaGainBonusPct
  const treeBonusPct = state.player.treeBonuses?.animaGainBonusPct ?? 0;
  const totalPct = trinketBonus / 100 + treeBonusPct + generalAnimaGainPct(state.player.classTraits);
  const actualAmount = totalPct > 0 ? Math.round(amount * (1 + totalPct)) : amount;

  const events: PveEvent[] = [];
  let recentStrengthenOffers = state.player.recentStrengthenOffers;
  let rngState = state.floorState.rngState;
  let progress = state.player.animaProgress + actualAmount;
  // 使用玩家当前阈值（兼容旧存档：undefined → 100）
  const threshold = state.player.animaThreshold ?? ANIMA_PER_STRENGTHEN;

  const pool = CLASS_STRENGTHEN_POOL[state.player.classId] ?? ADVENTURER_STRENGTHEN_POOL;

  while (progress >= threshold) {
    progress -= threshold;
    const rolled = rollChoices(rngState, pool, state.player.classTraits, recentStrengthenOffers);
    rngState = rolled.nextRngState;
    recentStrengthenOffers = rolled.choices;
    events.push({ type: 'ANIMA_STRENGTHEN', choices: rolled.choices });
  }

  return {
    state: {
      ...state,
      player: {
        ...state.player,
        anima: state.player.anima + actualAmount,
        animaProgress: progress,
        ...(events.length > 0 ? { recentStrengthenOffers } : {}),
      },
      floorState: { ...state.floorState, rngState },
    },
    events,
  };
}

/**
 * 玩家从最近一次 ANIMA_STRENGTHEN 候选中选定一项并生效：计入 player.classTraits。
 * 按 STRENGTHEN_META[choiceId] 的 stack 上限判定是否允许再次选取（AC-405）；
 * 数值型词条（strengthen_hp_up / iron_skin_stack 系）选中时立即调整 maxHp/hp。
 * 每次成功强化后将 animaThreshold × ANIMA_THRESHOLD_MULTIPLIER（100→150→225→337...）。
 */
export function applyStrengthen(state: ExpeditionState, choiceId: string): ApplyResult {
  const meta = STRENGTHEN_META[choiceId];
  const def = STRENGTHEN_DEF_BY_ID[choiceId];
  if (!meta || !def || def.classId !== state.player.classId) return { state, events: [] };
  const count = traitCount(state.player.classTraits, choiceId);
  const cap = meta?.stack ?? 1;
  if ((meta?.oneShot && count >= 1) || count >= cap) {
    return { state, events: [] };
  }

  const prevThreshold = state.player.animaThreshold ?? ANIMA_PER_STRENGTHEN;
  const nextThreshold = Math.ceil(prevThreshold * ANIMA_THRESHOLD_MULTIPLIER);

  const beforeDynamicHp = generalDynamicMaxHpBonus(state.player.classTraits);
  let newPlayer = {
    ...state.player,
    classTraits: [...state.player.classTraits, choiceId],
    animaThreshold: nextThreshold,
  };

  // 立即生效的属性词条
  if (choiceId === 'strengthen_hp_up') {
    const newMaxHp = newPlayer.maxHp + 20;
    const newHp = Math.min(newPlayer.hp + 20, newMaxHp);
    newPlayer = { ...newPlayer, maxHp: newMaxHp, hp: newHp };
  } else if (IMMEDIATE_HP_STACK_TRAITS.has(choiceId)) {
    const hpGain = choiceId === 'iron_skin_stack' ? 15 : 0;
    const newMaxHp = newPlayer.maxHp + hpGain;
    const newHp = Math.min(newPlayer.hp + hpGain, newMaxHp);
    newPlayer = { ...newPlayer, maxHp: newMaxHp, hp: newHp };
  }

  const dynamicHpGain = generalDynamicMaxHpBonus(newPlayer.classTraits) - beforeDynamicHp;
  if (dynamicHpGain > 0) {
    newPlayer = { ...newPlayer, maxHp: newPlayer.maxHp + dynamicHpGain, hp: newPlayer.hp + dynamicHpGain };
  }

  return {
    state: { ...state, player: newPlayer },
    events: [],
  };
}
