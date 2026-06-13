// 灵气强化系统（design §9）：每累计 100 灵气自动触发一次 3 选 1 强化，所选词条计入 player.classTraits
// （存档字段含「职业词条」，与强化选择共用同一存储 —— 详见 design.md §2.1 自动存档字段）。
//
// ⚠️ M1 占位强化池：完整 15 词条按职业分组的系统留待 M2+（design.md §10, AC-16），
// 此处先提供少量与职业无关的基础数值类强化以打通 M1 核心循环，后续需替换为按职业的词条池。

import { createRng } from './rng';
import { ANIMA_PER_STRENGTHEN, ANIMA_THRESHOLD_MULTIPLIER, STRENGTHEN_CHOICES } from './PveConstants';
import type { ClassId } from './PveConstants';
import type { ApplyResult, ExpeditionState, PveEvent } from './PveTypes';

/** ADVENTURER 通用强化池（无职业时使用，M1 兼容）。 */
export const ADVENTURER_STRENGTHEN_POOL = [
  'strengthen_hp_up',     // 最大 HP +40
  'strengthen_attack_up', // 攻击力 +5
  'strengthen_ap_up',     // 下回合起 AP 上限 +1
  'strengthen_gold_find', // 拾取金币 +20%
] as const;

/** BERSERKER 职业强化池（AC-16 M2）。 */
export const BERSERKER_STRENGTHEN_POOL = [
  'life_steal',  // 吸血：每次攻击回复 10 HP
  'berserk',     // 狂暴：HP ≤ 50% 时攻击 +10
  'blood_rage',  // 血怒：击杀时回复 20 HP
  'undying',     // 不屈：本层首次将死时保留 1 HP
  'counter',     // 反击：被攻击时对攻击者造成 10 伤害
] as const;

/** ARCHER 职业强化池（AC-16 M2）。 */
export const ARCHER_STRENGTHEN_POOL = [
  'eagle_eye',   // 鹰眼：攻击范围 +1
  'marksman',    // 射手精通：攻击力 +5
  'multi_shot',  // 连射：30% 概率对同一目标再射一箭
  'pierce',      // 穿透：攻击无视护甲减伤
  'crit',        // 暴击：20% 概率造成三倍伤害
] as const;

/** ROGUE 职业强化池（AC-16 M2）。 */
export const ROGUE_STRENGTHEN_POOL = [
  'swift',           // 疾步：移动消耗 AP -1
  'backstab',        // 背刺：移动后首次攻击双倍伤害
  'stealth',         // 潜行：怪物仇恨范围对你缩小 2
  'afterimage',      // 残影：本层闪避首次受到的攻击
  'assassin_heart',  // 刺客之心：对非追击状态敌人 +20 伤害
] as const;

/** M1 兼容别名（指向 ADVENTURER 池）。 */
export const M1_STRENGTHEN_POOL = ADVENTURER_STRENGTHEN_POOL;
export type StrengthenId = (typeof M1_STRENGTHEN_POOL)[number];

/**
 * 数值型强化词条：每次选中均叠加效果（重复选取「攻击力+5」两次 → 攻击力+10）。
 * 未列出的词条（鹰眼/暴击/连射等开关型）保持去重，重复选中视为 no-op。
 */
export const STACKABLE_TRAITS = new Set<string>([
  'strengthen_hp_up',
  'strengthen_attack_up',
  'strengthen_ap_up',
  'strengthen_gold_find',
  'life_steal',
  'berserk',
  'blood_rage',
  'counter',
  'marksman',
  'assassin_heart',
]);

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
  ADVENTURER: ADVENTURER_STRENGTHEN_POOL,
  BERSERKER: BERSERKER_STRENGTHEN_POOL,
  ARCHER: ARCHER_STRENGTHEN_POOL,
  ROGUE: ROGUE_STRENGTHEN_POOL,
};

/** 取指定职业的强化词条池（无对应池时回退到 ADVENTURER 通用池），供命运树 E3「命运护佑」复用。 */
export function strengthenPoolForClass(classId: ClassId): readonly string[] {
  return CLASS_STRENGTHEN_POOL[classId] ?? ADVENTURER_STRENGTHEN_POOL;
}

function rollChoices(rngState: number, pool: readonly string[]): { choices: string[]; nextRngState: number } {
  const rng = createRng(rngState);
  const shuffled = rng.shuffle(pool);
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
  const totalPct = trinketBonus / 100 + treeBonusPct;
  const actualAmount = totalPct > 0 ? Math.round(amount * (1 + totalPct)) : amount;

  const events: PveEvent[] = [];
  let rngState = state.floorState.rngState;
  let progress = state.player.animaProgress + actualAmount;
  // 使用玩家当前阈值（兼容旧存档：undefined → 100）
  const threshold = state.player.animaThreshold ?? ANIMA_PER_STRENGTHEN;

  const pool = CLASS_STRENGTHEN_POOL[state.player.classId] ?? ADVENTURER_STRENGTHEN_POOL;

  while (progress >= threshold) {
    progress -= threshold;
    const rolled = rollChoices(rngState, pool);
    rngState = rolled.nextRngState;
    events.push({ type: 'ANIMA_STRENGTHEN', choices: rolled.choices });
  }

  return {
    state: {
      ...state,
      player: {
        ...state.player,
        anima: state.player.anima + actualAmount,
        animaProgress: progress,
      },
      floorState: { ...state.floorState, rngState },
    },
    events,
  };
}

/**
 * 玩家从最近一次 ANIMA_STRENGTHEN 候选中选定一项并生效：计入 player.classTraits。
 * 数值型词条（见 STACKABLE_TRAITS）允许重复选取并叠加效果（如「攻击力+5」选两次 → +10）；
 * 其余开关型词条重复选择同一 id 时为 no-op（避免重复叠加无意义）。
 * 每次成功强化后将 animaThreshold × ANIMA_THRESHOLD_MULTIPLIER（100→150→225→337...）。
 */
export function applyStrengthen(state: ExpeditionState, choiceId: string): ApplyResult {
  if (!STACKABLE_TRAITS.has(choiceId) && state.player.classTraits.includes(choiceId)) {
    return { state, events: [] };
  }

  const prevThreshold = state.player.animaThreshold ?? ANIMA_PER_STRENGTHEN;
  const nextThreshold = Math.ceil(prevThreshold * ANIMA_THRESHOLD_MULTIPLIER);

  let newPlayer = {
    ...state.player,
    classTraits: [...state.player.classTraits, choiceId],
    animaThreshold: nextThreshold,
  };

  // 立即生效的属性词条
  if (choiceId === 'strengthen_hp_up') {
    // 最大 HP +40，同时回复等量当前 HP（选取时视为立即补血）
    const newMaxHp = newPlayer.maxHp + 40;
    const newHp = Math.min(newPlayer.hp + 40, newMaxHp);
    newPlayer = { ...newPlayer, maxHp: newMaxHp, hp: newHp };
  }

  return {
    state: { ...state, player: newPlayer },
    events: [],
  };
}
