// 沙虫女王专属机制（design §11b / 第 2 章 Boss，第 10 层）：
// - 每 SANDWORM_BURROW_INTERVAL 回合：潜入地下（免疫玩家攻击，emit BOSS_BURROWED）
// - 下一回合：在玩家曼哈顿距离 ≤ 1 的随机空格冒出，立即发动 × 2 倍伤害（emit BOSS_EMERGED）
// - 其余回合：普通近战攻击（monsterAttack）

import { monsterAttack } from '../CombatSystem';
import { SANDWORM_BURROW_INTERVAL } from '../PveConstants';
import { createRng } from '../rng';
import type { ApplyResult, Coord, ExpeditionState, FloorState, PveEvent } from '../PveTypes';

function manhattan(a: Coord, b: Coord): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function noop(state: ExpeditionState): ApplyResult {
  return { state, events: [] };
}

/** 玩家周围（8 方向，距离 ≤ 1）且未被其他存活怪占据的空格。 */
function adjacentEmptyCells(floor: FloorState, excludeId: string): Coord[] {
  const { player, monsters, size } = floor;
  const occupied = new Set(
    monsters
      .filter((m) => m.id !== excludeId && m.aiState !== 'DEAD')
      .map((m) => `${m.pos.x},${m.pos.y}`),
  );
  const results: Coord[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = player.x + dx;
      const ny = player.y + dy;
      if (nx >= 0 && ny >= 0 && nx < size && ny < size) {
        if (!occupied.has(`${nx},${ny}`)) {
          results.push({ x: nx, y: ny });
        }
      }
    }
  }
  return results;
}

/**
 * 沙虫女王行动：
 * - 已潜地 → 冒出（teleport + 2× 伤害）
 * - 普通回合 → monsterAttack
 * Boss 的「潜地」触发由 MonsterAI.stepBoss 在进入攻击前判断并调用 sandwormBurrow()。
 */
export function sandwormQueenAttack(state: ExpeditionState, bossId: string): ApplyResult {
  const floor = state.floorState;
  const boss = floor.monsters.find(
    (m) => m.id === bossId && m.type === 'BOSS' && m.bossId === 'SANDWORM_QUEEN',
  );
  if (!boss || boss.aiState === 'DEAD') return noop(state);

  // ── 冒出：优先用距玩家最近的空闲沙坑位置；无可用沙坑则回退到玩家相邻空格随机 ──
  if (boss.isBurrowed) {
    const rng = createRng(floor.rngState);
    const monsterOccupied = new Set(
      floor.monsters
        .filter((m) => m.id !== bossId && m.aiState !== 'DEAD')
        .map((m) => `${m.pos.x},${m.pos.y}`),
    );
    // 沙坑可用条件：未被其他怪占据（玩家踩着不影响 Boss 冒出 —— 玩家自己就是攻击目标）
    const sandPits = floor.entities.filter(
      (e) => e.type === 'SAND_PIT' && !monsterOccupied.has(`${e.pos.x},${e.pos.y}`),
    );
    let emergePos: Coord;
    if (sandPits.length > 0) {
      let bestPit = sandPits[0];
      let bestDist = manhattan(bestPit.pos, floor.player);
      for (let i = 1; i < sandPits.length; i++) {
        const d = manhattan(sandPits[i].pos, floor.player);
        if (d < bestDist) {
          bestDist = d;
          bestPit = sandPits[i];
        }
      }
      emergePos = bestPit.pos;
    } else {
      const candidates = adjacentEmptyCells(floor, bossId);
      const emergeIdx = candidates.length > 0 ? rng.int(0, candidates.length - 1) : -1;
      emergePos = emergeIdx >= 0 ? candidates[emergeIdx] : boss.pos;
    }

    // 更新怪物位置 + 解除潜地状态
    const emerged: ExpeditionState = {
      ...state,
      floorState: {
        ...floor,
        rngState: rng.state(),
        monsters: floor.monsters.map((m) =>
          m.id === bossId ? { ...m, pos: emergePos, isBurrowed: false } : m,
        ),
      },
    };

    const events: PveEvent[] = [{ type: 'BOSS_EMERGED', bossId, pos: emergePos }];

    // 冒出后若在攻击范围内立即双倍攻击
    if (manhattan(emergePos, floor.player) <= boss.range) {
      const attackResult = monsterAttack(emerged, bossId, 2);
      return { state: attackResult.state, events: [...events, ...attackResult.events] };
    }
    return { state: emerged, events };
  }

  // ── 普通攻击 ──────────────────────────────────────────────
  return monsterAttack(state, bossId);
}

/**
 * 触发潜地：由 MonsterAI.stepBoss 在每 SANDWORM_BURROW_INTERVAL 回合调用。
 * 设置 isBurrowed=true，发送 BOSS_BURROWED 事件；本回合无攻击。
 */
export function sandwormBurrow(state: ExpeditionState, bossId: string): ApplyResult {
  const floor = state.floorState;
  return {
    state: {
      ...state,
      floorState: {
        ...floor,
        monsters: floor.monsters.map((m) =>
          m.id === bossId ? { ...m, isBurrowed: true } : m,
        ),
      },
    },
    events: [{ type: 'BOSS_BURROWED', bossId }],
  };
}

/** 是否是潜地回合（每 SANDWORM_BURROW_INTERVAL 个回合触发一次）。 */
export function isBurrowTurn(turn: number): boolean {
  return turn > 0 && turn % SANDWORM_BURROW_INTERVAL === 0;
}
