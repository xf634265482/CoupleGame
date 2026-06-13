// 楼层通关规则（design §12 / AC-9）：
//   普通层：找到钥匙 → 开启出口门 → 进入下一层
//   Boss 层：找到钥匙 → 击败 Boss → Boss 位置生成传送门 → 踏入传送门交互 → 进入下一层
//
// 修复历史：M1 起初简化为「传送门生成即通关」（FLOOR_CLEARED），但玩家反馈无法继续探索遗漏的宝箱。
// 已拆分为：spawnPortal 只浮现传送门（emit PORTAL_SPAWNED），interactPortal 才结算（FLOOR_CLEARED）。

import { canAfford, spend } from './ApSystem';
import type { ApplyResult, ExpeditionState, FixedEntity, FloorState, PveEvent } from './PveTypes';

function noop(state: ExpeditionState): ApplyResult {
  return { state, events: [] };
}

/**
 * 拾取钥匙：玩家走到钥匙所在格时被动触发（不消耗 AP，无需主动交互）。
 * 标记该实体已消耗、设置 floorState.hasKey=true，产生 PICK_KEY 事件。
 */
export function pickKey(state: ExpeditionState, entityId: string): ApplyResult {
  const floor = state.floorState;
  const entity = floor.entities.find((e) => e.id === entityId);
  if (!entity || entity.type !== 'KEY' || entity.consumed) return noop(state);
  if (entity.pos.x !== floor.player.x || entity.pos.y !== floor.player.y) return noop(state);

  return {
    state: {
      ...state,
      floorState: {
        ...floor,
        hasKey: true,
        entities: floor.entities.map((e) => (e.id === entityId ? { ...e, consumed: true } : e)),
      },
    },
    events: [{ type: 'PICK_KEY', entityId }],
  };
}

/**
 * 开启出口门：需玩家站在出口门格、已拾取钥匙、AP ≥ 1、出口门尚未开启，否则 no-op。
 * 命中后扣 AP、标记 consumed、楼层状态置为 CLEARED，产生 FLOOR_CLEARED 事件。
 */
export function openExit(state: ExpeditionState, entityId: string): ApplyResult {
  const floor = state.floorState;
  const entity = floor.entities.find((e) => e.id === entityId);
  if (!entity || entity.type !== 'EXIT' || entity.consumed) return noop(state);
  if (entity.pos.x !== floor.player.x || entity.pos.y !== floor.player.y) return noop(state);
  if (!floor.hasKey) return noop(state);
  if (!canAfford(floor.ap, 'OPEN_EXIT')) return noop(state);

  return {
    state: {
      ...state,
      floorState: {
        ...floor,
        ap: spend(floor.ap, 'OPEN_EXIT'),
        status: 'CLEARED',
        entities: floor.entities.map((e) => (e.id === entityId ? { ...e, consumed: true } : e)),
      },
    },
    events: [{ type: 'FLOOR_CLEARED', floor: floor.floor }],
  };
}

/**
 * Boss 层：Boss 已死亡且持有钥匙时，在 Boss 所在位置浮现传送门。
 * **不再立即 CLEARED** —— 玩家可继续探索遗漏的宝箱/神像/温泉，
 * 走到传送门格再点交互（interactPortal）才结算楼层。
 * 否则 no-op（含重复调用幂等）。
 */
export function spawnPortal(state: ExpeditionState, bossMonsterId: string): ApplyResult {
  const floor = state.floorState;
  const boss = floor.monsters.find((m) => m.id === bossMonsterId);
  if (!boss || boss.type !== 'BOSS' || boss.aiState !== 'DEAD') return noop(state);
  if (boss.bossId === 'FATE_MIRROR') return noop(state);
  if (!floor.hasKey) return noop(state);
  if (floor.entities.some((e) => e.type === 'PORTAL')) return noop(state);

  const portal: FixedEntity = {
    id: `portal_${floor.floor}`,
    type: 'PORTAL',
    pos: boss.pos,
    consumed: false,
  };

  return {
    state: {
      ...state,
      floorState: {
        ...floor,
        entities: [...floor.entities, portal],
      },
    },
    events: [{ type: 'PORTAL_SPAWNED', entityId: portal.id, pos: portal.pos }],
  };
}

/**
 * 踏入传送门：玩家在传送门格 + AP ≥ 1 + 传送门未使用 → 消耗 AP，
 * 楼层置 CLEARED，产生 FLOOR_CLEARED 事件。AP 代价复用出口门 (OPEN_EXIT)。
 */
export function interactPortal(state: ExpeditionState, entityId: string): ApplyResult {
  const floor = state.floorState;
  const entity = floor.entities.find((e) => e.id === entityId);
  if (!entity || entity.type !== 'PORTAL' || entity.consumed) return noop(state);
  if (entity.pos.x !== floor.player.x || entity.pos.y !== floor.player.y) return noop(state);
  if (!canAfford(floor.ap, 'OPEN_EXIT')) return noop(state);

  return {
    state: {
      ...state,
      floorState: {
        ...floor,
        ap: spend(floor.ap, 'OPEN_EXIT'),
        status: 'CLEARED',
        entities: floor.entities.map((e) => (e.id === entityId ? { ...e, consumed: true } : e)),
      },
    },
    events: [{ type: 'FLOOR_CLEARED', floor: floor.floor }],
  };
}

/** 楼层是否已通关（出口门已开启 / Boss 层传送门已生成）。 */
export function isFloorCleared(floorState: FloorState): boolean {
  return floorState.status === 'CLEARED';
}
