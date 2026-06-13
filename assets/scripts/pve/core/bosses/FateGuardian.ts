// 命运守卫专属机制（design §11b / 第 5 章 Boss，第 25 层）：
// - 玩家 HP > 50% maxHp：守卫伤害 × 2（双倍压制，惩罚高血量玩家轻敌）
// - 玩家 HP ≤ 50% maxHp：守卫 40% 概率完全闪避玩家攻击（no-op，保护弱血时 Boss 存活）
//   闪避在玩家执行攻击阶段触发（由 CombatSystem.playerAttack 检测 FateGuardian 特殊逻辑）
//   注：Boss 自身闪避玩家攻击暂不实现为 CombatSystem 扩展，交由 fateGuardianEvade 纯函数
//       在 Controller 层处理（M1 占位：仅守卫攻击时的双倍/普通分派）

import { monsterAttack } from '../CombatSystem';
import { FATE_GUARDIAN_DODGE_CHANCE, FATE_GUARDIAN_HP_THRESHOLD } from '../PveConstants';
import { createRng } from '../rng';
import type { ApplyResult, ExpeditionState } from '../PveTypes';

function noop(state: ExpeditionState): ApplyResult {
  return { state, events: [] };
}

/**
 * 命运守卫行动：
 * - 玩家 HP > 50% → 双倍伤害攻击
 * - 玩家 HP ≤ 50% → 普通攻击（守卫弱化，形势逆转）
 */
export function fateGuardianAttack(state: ExpeditionState, bossId: string): ApplyResult {
  const floor = state.floorState;
  const boss = floor.monsters.find(
    (m) => m.id === bossId && m.type === 'BOSS' && m.bossId === 'FATE_GUARDIAN',
  );
  if (!boss || boss.aiState === 'DEAD') return noop(state);

  const hpRatio = state.player.hp / state.player.maxHp;

  if (hpRatio > FATE_GUARDIAN_HP_THRESHOLD) {
    // 玩家 HP 充足 → 双倍伤害
    return monsterAttack(state, bossId, 2);
  }

  // 玩家 HP 低 → 普通攻击（守卫弱化）
  return monsterAttack(state, bossId);
}

/**
 * 命运守卫闪避检定（玩家攻击时调用）：
 * 玩家 HP ≤ 50% maxHp 时，守卫有 FATE_GUARDIAN_DODGE_CHANCE 概率闪避。
 * 返回 true = 本次攻击被闪避（no-op）；false = 攻击正常结算。
 * 消耗并返回新 rngState 保持确定性（AC-13）。
 */
export function fateGuardianEvade(
  state: ExpeditionState,
  bossId: string,
): { dodged: boolean; nextRngState: number } {
  const boss = state.floorState.monsters.find(
    (m) => m.id === bossId && m.bossId === 'FATE_GUARDIAN' && m.aiState !== 'DEAD',
  );
  if (!boss) return { dodged: false, nextRngState: state.floorState.rngState };

  const hpRatio = state.player.hp / state.player.maxHp;
  if (hpRatio > FATE_GUARDIAN_HP_THRESHOLD) {
    return { dodged: false, nextRngState: state.floorState.rngState };
  }

  const rng = createRng(state.floorState.rngState);
  const dodged = rng.chance(FATE_GUARDIAN_DODGE_CHANCE);
  return { dodged, nextRngState: rng.state() };
}
