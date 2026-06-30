// 装备词条系统（Phase 2，AC-EQ-4/5）：词条池定义、按品质随机掷词条、战斗辅助函数。
// 零框架依赖，零 Math.random()（全部走 rng 参数）；供 CombatSystem / MovementSystem / ExpeditionState 接入。

import type { AffixTier, EquipAffix, EquipQuality, Equipment } from './PveTypes';
import type { Rng } from './rng';

export interface AffixDef {
  readonly id: string;
  readonly name: string;
  readonly minorValue: number;
  readonly majorValue: number;
}

/**
 * 词条池（首发 12 条，design §3）。
 * 避开强化词条/职业词条领地（吸血/暴击%/AP+/淘金）；主打条件触发：
 *   核心数值 3 条（锋利/坚固/强健）+ 条件触发 9 条。
 */
export const AFFIX_POOL: readonly AffixDef[] = [
  // ── 核心数值（3条）──────────────────────────────────
  { id: 'aff_sharp',        name: '锋利',    minorValue:  6, majorValue: 12 },
  { id: 'aff_sturdy',       name: '坚固',    minorValue:  4, majorValue:  8 },
  { id: 'aff_fortify',      name: '强健',    minorValue: 20, majorValue: 40 },
  // ── 条件触发（9条）──────────────────────────────────
  { id: 'aff_frenzy',       name: '狂热',    minorValue: 15, majorValue: 25 },
  { id: 'aff_bulwark',      name: '磐石',    minorValue:  5, majorValue: 10 },
  { id: 'aff_hunter',       name: '猎手',    minorValue: 15, majorValue: 25 },
  { id: 'aff_chapter_bane', name: '章节克制', minorValue: 20, majorValue: 35 },
  { id: 'aff_kill_chain',   name: '连杀',    minorValue:  1, majorValue:  2 },
  { id: 'aff_cover_expert', name: '掩体专家', minorValue:  5, majorValue: 10 },
  { id: 'aff_swift_strike', name: '疾袭',    minorValue: 20, majorValue: 35 },
  { id: 'aff_thorns',       name: '荆棘',    minorValue:  5, majorValue: 10 },
  { id: 'aff_preemptive',   name: '先发制人', minorValue: 25, majorValue: 40 },
];

/** 按品质确定词条数量（白/绿=0，蓝=1，紫/橙=2）。 */
export function affixCountByQuality(quality: EquipQuality): number {
  if (quality === 'RARE') return 1;
  if (quality === 'EPIC' || quality === 'LEGENDARY') return 2;
  return 0;
}

/**
 * 按品质随机掷词条（AC-EQ-4 / AC-13 可复算）。
 *
 * RNG 消耗固定（保证确定性）：
 *   RARE → 2次（idx1 + chance1）
 *   EPIC/LEGENDARY → 4次（idx1 + chance1 + idx2 + chance2）
 *   白/绿 → 0次
 *
 * 同一件装备不会出现两条相同词条（第 2 条从剩余 N-1 中选）。
 * 两档强度：minor（60%概率） / major（40%概率）。
 */
export function rollAffixes(rng: Rng, quality: EquipQuality): EquipAffix[] {
  const count = affixCountByQuality(quality);
  if (count === 0) return [];

  const n = AFFIX_POOL.length;
  const idx1 = rng.int(0, n - 1);
  const def1 = AFFIX_POOL[idx1];
  const isMajor1 = rng.chance(0.4);
  const tier1: AffixTier = isMajor1 ? 'major' : 'minor';
  const affixes: EquipAffix[] = [
    { id: def1.id, tier: tier1, value: isMajor1 ? def1.majorValue : def1.minorValue },
  ];

  if (count >= 2) {
    // 从 pool[0..n-1] 中排除 idx1：先取 [0, n-2]，若 >= idx1 则 +1
    const idx2raw = rng.int(0, n - 2);
    const idx2 = idx2raw < idx1 ? idx2raw : idx2raw + 1;
    const def2 = AFFIX_POOL[idx2];
    const isMajor2 = rng.chance(0.4);
    const tier2: AffixTier = isMajor2 ? 'major' : 'minor';
    affixes.push({ id: def2.id, tier: tier2, value: isMajor2 ? def2.majorValue : def2.minorValue });
  }

  return affixes;
}

/** 从装备栏整合全部词条（供战斗系统快速遍历）。 */
export function collectAffixes(equipment: Equipment): EquipAffix[] {
  return Object.values(equipment).flatMap((e) => e?.affixes ?? []);
}

/** 查询特定 id 的词条合计值；未持有则返回 undefined（区分"无此词条"与"值为0"）。 */
export function getAffixValue(affixes: readonly EquipAffix[], id: string): number | undefined {
  const matching = affixes.filter((a) => a.id === id);
  if (matching.length === 0) return undefined;
  return matching.reduce((sum, a) => sum + a.value, 0);
}

/** aff_fortify 词条提供的进层回血量（aff_fortify 强健：进入新层时回复 value HP）。 */
export function affixFortifyBonus(equipment: Equipment): number {
  return collectAffixes(equipment)
    .filter((a) => a.id === 'aff_fortify')
    .reduce((sum, a) => sum + a.value, 0);
}

/** aff_sharp 词条提供的额外平A攻击加成（playerAttackPower 静态叠加）。 */
export function affixSharpBonus(equipment: Equipment): number {
  return collectAffixes(equipment)
    .filter((a) => a.id === 'aff_sharp')
    .reduce((sum, a) => sum + a.value, 0);
}

/** aff_sturdy 词条提供的额外护甲减伤（monsterAttack armorReduction 叠加）。 */
export function affixSturdyBonus(equipment: Equipment): number {
  return collectAffixes(equipment)
    .filter((a) => a.id === 'aff_sturdy')
    .reduce((sum, a) => sum + a.value, 0);
}

/** 词条人类可读描述（详情 UI 展示）。 */
export function affixDescription(affix: EquipAffix): string {
  const v = affix.value;
  const tierStr = affix.tier === 'major' ? '(强)' : '(副)';
  switch (affix.id) {
    case 'aff_sharp':        return `锋利${tierStr}：攻击 +${v}`;
    case 'aff_sturdy':       return `坚固${tierStr}：减伤 +${v}`;
    case 'aff_fortify':      return `强健${tierStr}：进层回复 +${v} HP`;
    case 'aff_frenzy':       return `狂热${tierStr}：HP<50% 时攻击 +${v}%`;
    case 'aff_bulwark':      return `磐石${tierStr}：HP>80% 时减伤 +${v}`;
    case 'aff_hunter':       return `猎手${tierStr}：对精英/Boss 伤害 +${v}%`;
    case 'aff_chapter_bane': return `章节克制${tierStr}：对本章普通怪 +${v}%`;
    case 'aff_kill_chain':   return `连杀${tierStr}：每击杀 攻击 +${v}（上限×5层）`;
    case 'aff_cover_expert': return `掩体专家${tierStr}：相邻掩体时减伤 +${v}`;
    case 'aff_swift_strike': return `疾袭${tierStr}：移动后首击 +${v}%`;
    case 'aff_thorns':       return `荆棘${tierStr}：受击反弹 ${v} 伤害`;
    case 'aff_preemptive':   return `先发制人${tierStr}：每层首攻 +${v}%`;
    default:                 return `词条 ${affix.id}(${affix.tier}) +${v}`;
  }
}
