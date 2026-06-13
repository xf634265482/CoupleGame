// 冰霜巨人专属机制（design §11b / 第 3 章 Boss，第 15 层）：
// - 每 FROST_GIANT_FREEZE_INTERVAL 回合：普通攻击 + 施加冰冻（玩家下一回合 AP -4）
// - 其余回合：普通近战攻击（monsterAttack）

import { monsterAttack } from '../CombatSystem';
import {
  FROST_GIANT_FREEZE_INTERVAL,
  FROST_GIANT_FREEZE_ROUNDS,
} from '../PveConstants';
import type { ApplyResult, ExpeditionState, PveEvent } from '../PveTypes';

function noop(state: ExpeditionState): ApplyResult {
  return { state, events: [] };
}

/** 是否是冰冻攻击回合（每 FROST_GIANT_FREEZE_INTERVAL 个回合）。 */
export function isFreezeAttackTurn(turn: number): boolean {
  return turn > 0 && turn % FROST_GIANT_FREEZE_INTERVAL === 0;
}

/**
 * 冰霜巨人行动：
 * - 每 FROST_GIANT_FREEZE_INTERVAL 回合：普通攻击后附加冰冻（emit FREEZE_APPLIED）
 * - 其余回合：普通近战攻击
 */
export function frostGiantAttack(state: ExpeditionState, bossId: string): ApplyResult {
  const floor = state.floorState;
  const boss = floor.monsters.find(
    (m) => m.id === bossId && m.type === 'BOSS' && m.bossId === 'FROST_GIANT',
  );
  if (!boss || boss.aiState === 'DEAD') return noop(state);

  // 普通攻击
  const attackResult = monsterAttack(state, bossId);
  if (attackResult.state.status === 'DEAD') return attackResult;

  // 冰冻回合：附加冻结效果
  if (isFreezeAttackTurn(floor.turn)) {
    const freezeEvent: PveEvent = {
      type: 'FREEZE_APPLIED',
      bossId,
      rounds: FROST_GIANT_FREEZE_ROUNDS,
    };
    return {
      state: {
        ...attackResult.state,
        floorState: {
          ...attackResult.state.floorState,
          playerFreezeRounds: FROST_GIANT_FREEZE_ROUNDS,
        },
      },
      events: [...attackResult.events, freezeEvent],
    };
  }

  return attackResult;
}
