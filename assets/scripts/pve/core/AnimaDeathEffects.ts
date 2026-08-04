// 灵气怪死亡触发效果（260616 灵气怪差异化升级）：
//
//   SPIRIT_EMBER  (CH4)：在 monster.pos 十字 4 格生成 LAVA_TILE（跳过越界/被占格，存续 3 回合）
//   SPIRIT_MIRAGE (CH5)：50/50 给玩家 Buff 或 Debuff，5 选 1 等概率
//
// 在 CombatSystem.resolveHit 检测到 KILL 后立即调用（在 applyMonsterKillDrop 之前），
// 消耗 floorState.rngState 保证 AC-13 确定性。

import {
  ANIMA_EMBER_LAVA_DURATION,
  ANIMA_MIRAGE_BUFF_IDS,
  ANIMA_MIRAGE_DEBUFF_IDS,
  FIRE_BURN_ROUNDS,
  FROST_MOVE_PENALTY_ROUNDS,
} from './PveConstants';
import {
  VARIANT_SPIRIT_EMBER,
  VARIANT_SPIRIT_MIRAGE,
} from './ChapterAnimaMonsters';
import { createRng } from './rng';
import type { ApplyResult, Coord, ExpeditionState, FixedEntity, Monster, PveEvent } from './PveTypes';

function inBounds(size: number, pos: Coord): boolean {
  return pos.x >= 0 && pos.y >= 0 && pos.x < size && pos.y < size;
}

/**
 * 入口：根据 monster.variantId 派发死亡效果。仅 SPIRIT_EMBER/SPIRIT_MIRAGE 有效；
 * 其它怪物 no-op（返回未修改 state + 空事件）。
 *
 * 调用契约：调用方已确认 monster 死亡（KILL 已 emit），本函数只追加事件，不影响 monsters 列表。
 */
export function applyAnimaDeathEffect(state: ExpeditionState, monster: Monster): ApplyResult {
  if (monster.type !== 'ANIMA') return { state, events: [] };
  if (monster.variantId === VARIANT_SPIRIT_EMBER) {
    return applyEmberDeath(state, monster);
  }
  if (monster.variantId === VARIANT_SPIRIT_MIRAGE) {
    return applyMirageDeath(state, monster);
  }
  return { state, events: [] };
}

/** SPIRIT_EMBER：十字 4 格生成 LAVA_TILE（跳过越界/已有未消耗 LAVA_TILE 格）。 */
function applyEmberDeath(state: ExpeditionState, monster: Monster): ApplyResult {
  const floor = state.floorState;
  const center = monster.pos;
  const candidates: Coord[] = [
    { x: center.x + 1, y: center.y },
    { x: center.x - 1, y: center.y },
    { x: center.x, y: center.y + 1 },
    { x: center.x, y: center.y - 1 },
  ];
  const occupied = new Set<string>();
  for (const e of floor.entities) {
    if (e.consumed) continue;
    if (e.type === 'LAVA_TILE') occupied.add(`${e.pos.x},${e.pos.y}`);
  }
  const targets = candidates.filter(
    (c) => inBounds(floor.size, c) && !occupied.has(`${c.x},${c.y}`),
  );
  if (targets.length === 0) return { state, events: [] };

  let seq = floor.entities.length;
  const newEntities: FixedEntity[] = targets.map((pos) => ({
    id: `anima_ember_lava_${floor.floor}_${seq++}`,
    type: 'LAVA_TILE',
    pos,
    consumed: false,
    remaining: ANIMA_EMBER_LAVA_DURATION,
  }));

  return {
    state: {
      ...state,
      floorState: {
        ...floor,
        entities: [...floor.entities, ...newEntities],
      },
    },
    events: [{ type: 'ANIMA_DEATH_LAVA', tiles: targets, duration: ANIMA_EMBER_LAVA_DURATION }],
  };
}

/** SPIRIT_MIRAGE：50/50 随机 Buff 或 Debuff，5 选 1 等概率（消耗 rngState 两次：一次定 Buff/Debuff，一次定 id）。 */
function applyMirageDeath(state: ExpeditionState, _monster: Monster): ApplyResult {
  const floor = state.floorState;
  const rng = createRng(floor.rngState);
  const isBuff = rng.chance(0.5);
  const events: PveEvent[] = [];
  let next = state;

  if (isBuff) {
    const buffId = ANIMA_MIRAGE_BUFF_IDS[rng.int(0, ANIMA_MIRAGE_BUFF_IDS.length - 1)];
    next = applyMirageBuff(next, buffId);
    events.push({ type: 'ANIMA_BUFF_GRANTED', buffId });
  } else {
    const debuffId = ANIMA_MIRAGE_DEBUFF_IDS[rng.int(0, ANIMA_MIRAGE_DEBUFF_IDS.length - 1)];
    next = applyMirageDebuff(next, debuffId);
    events.push({ type: 'ANIMA_DEBUFF_APPLIED', debuffId });
  }

  return {
    state: {
      ...next,
      floorState: { ...next.floorState, rngState: rng.state() },
    },
    events,
  };
}

function applyMirageBuff(state: ExpeditionState, buffId: string): ExpeditionState {
  const floor = state.floorState;
  const player = state.player;
  switch (buffId) {
    case 'HEAL_30':
      return { ...state, player: { ...player, hp: Math.min(player.maxHp, player.hp + 30) } };
    case 'AP_PLUS_3':
      return { ...state, floorState: { ...floor, ap: floor.ap + 3 } };
    case 'ANIMA_PLUS_60':
      // 直接走 anima 字段累加（不入 animaProgress，避免与击杀掉落 LOOT 流程混淆）。
      return { ...state, player: { ...player, anima: player.anima + 60 } };
    case 'GOLD_PLUS_60':
      return { ...state, player: { ...player, gold: player.gold + 60 } };
    case 'ATTACK_UP':
      return { ...state, player: { ...player, idolAttackBonus: (player.idolAttackBonus ?? 0) + 3 } };
    default:
      return state;
  }
}

function applyMirageDebuff(state: ExpeditionState, debuffId: string): ExpeditionState {
  const floor = state.floorState;
  const player = state.player;
  switch (debuffId) {
    case 'HURT_20':
      return { ...state, player: { ...player, hp: Math.max(1, player.hp - 20) } };
    case 'FIRE_BURN_2':
      return {
        ...state,
        floorState: { ...floor, playerFireBurnRounds: (floor.playerFireBurnRounds ?? 0) + FIRE_BURN_ROUNDS },
      };
    case 'SLOW_2':
      return {
        ...state,
        floorState: {
          ...floor,
          playerMoveApPenaltyRounds: (floor.playerMoveApPenaltyRounds ?? 0) + FROST_MOVE_PENALTY_ROUNDS,
        },
      };
    case 'AP_MINUS_3':
      return { ...state, floorState: { ...floor, ap: Math.max(0, floor.ap - 3) } };
    case 'ANIMA_PROGRESS_MINUS_30':
      return {
        ...state,
        player: { ...player, animaProgress: Math.max(0, player.animaProgress - 30) },
      };
    default:
      return state;
  }
}
