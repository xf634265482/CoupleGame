// 楼层通关规则（design §12 / AC-9）：
//   普通层：找到钥匙 → 开启出口门 → 进入下一层
//   正式永久楼层：完成本层目标 → 生成传送门 → 踏入传送门交互 → 进入下一层
//
// 修复历史：M1 起初简化为「传送门生成即通关」（FLOOR_CLEARED），但玩家反馈无法继续探索遗漏的宝箱。
// 已拆分为：spawnPortal 只浮现传送门（emit PORTAL_SPAWNED），interactPortal 才结算（FLOOR_CLEARED）。

import { canAfford, spend } from './ApSystem';
import { applyInteractionExposure } from './AlertSystem';
import { reveal } from './FogSystem';
import { rushMonstersTowardPlayer } from './MonsterAI';
import type { ApplyResult, Coord, ExpeditionState, FixedEntity, FloorState, PveEvent } from './PveTypes';

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

  const events: PveEvent[] = [{ type: 'PICK_KEY', entityId }];
  const next = applyInteractionExposure({
    ...state,
    floorState: {
      ...floor,
      hasKey: true,
      entities: floor.entities.map((e) => (e.id === entityId ? { ...e, consumed: true } : e)),
    },
  }, events);
  return { state: next, events };
}

/**
 * 开启出口门：需玩家站在出口门格、已拾取钥匙、出口门尚未开启，否则 no-op。
 * 永久逐层（persistentFloorMode）：不耗 AP——开门只是「目标完成 → 刷通关门」的条件确认，
 * 方便踩上出口即自动开启；经典模式仍扣 OPEN_EXIT AP。
 * 命中后标记 consumed、楼层状态置为 CLEARED，产生 FLOOR_CLEARED 事件
 * （永久层由 PersistentExpeditionRuntime 改写为刷门，不立刻结算）。
 */
export function openExit(state: ExpeditionState, entityId: string): ApplyResult {
  const floor = state.floorState;
  const entity = floor.entities.find((e) => e.id === entityId);
  if (!entity || entity.type !== 'EXIT' || entity.consumed) return noop(state);
  if (entity.pos.x !== floor.player.x || entity.pos.y !== floor.player.y) return noop(state);
  const keylessTimedEscape = Boolean(state.persistentFloorMode) && floor.floor === 12;
  if (!floor.hasKey && !keylessTimedEscape) return noop(state);
  const freeOpen = Boolean(state.persistentFloorMode);
  if (!freeOpen && !canAfford(floor.ap, 'OPEN_EXIT')) return noop(state);

  return {
    state: {
      ...state,
      floorState: {
        ...floor,
        ap: freeOpen ? floor.ap : spend(floor.ap, 'OPEN_EXIT'),
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

/** 永久楼层：任意目标完成后在指定格生成通关传送门，不立即结算。 */
export function spawnObjectivePortal(state: ExpeditionState, pos: Coord, id = `portal_${state.floorState.floor}`): ApplyResult {
  const floor = state.floorState;
  const existingPortal = floor.entities.find((e) => e.type === 'PORTAL' && !e.consumed);
  if (existingPortal) {
    const revealedExisting = reveal(floor.revealed, existingPortal.pos, 0);
    if (revealedExisting.cells.length === 0) return noop(state);
    return {
      state: {
        ...state,
        floorState: {
          ...floor,
          revealed: revealedExisting.revealed,
        },
      },
      events: [{ type: 'REVEAL', cells: revealedExisting.cells }],
    };
  }
  const revealedPortal = reveal(floor.revealed, pos, 0);
  const portal: FixedEntity = {
    id,
    type: 'PORTAL',
    pos: { ...pos },
    consumed: false,
  };
  const events: PveEvent[] = [];
  if (revealedPortal.cells.length > 0) events.push({ type: 'REVEAL', cells: revealedPortal.cells });
  events.push({ type: 'PORTAL_SPAWNED', entityId: portal.id, pos: portal.pos });
  return {
    state: {
      ...state,
      floorState: {
        ...floor,
        revealed: revealedPortal.revealed,
        status: floor.status === 'CLEARED' ? 'EXPLORING' : floor.status,
        entities: [...floor.entities, portal],
      },
    },
    events,
  };
}

/**
 * 踏入传送门：玩家在传送门格 + 传送门未使用 → 楼层置 CLEARED，产生 FLOOR_CLEARED。
 * 不消耗 AP：通关确认为结算动作，不是战斗消耗。否则开出口/最后一步走入门后 AP=0
 * 会触发自动结束回合，首次点「互动」落在 _busy 窗口被静默吞掉，需再点一次才出弹窗。
 */
export function interactPortal(state: ExpeditionState, entityId: string): ApplyResult {
  const floor = state.floorState;
  const entity = floor.entities.find((e) => e.id === entityId);
  if (!entity || entity.type !== 'PORTAL' || entity.consumed) return noop(state);
  if (entity.pos.x !== floor.player.x || entity.pos.y !== floor.player.y) return noop(state);

  return {
    state: {
      ...state,
      floorState: {
        ...floor,
        status: 'CLEARED',
        entities: floor.entities.map((e) => (e.id === entityId ? { ...e, consumed: true } : e)),
      },
    },
    events: [{ type: 'FLOOR_CLEARED', floor: floor.floor }],
  };
}

export function activateGunpowderBarrel(state: ExpeditionState, entityId: string): ApplyResult {
  const floor = state.floorState;
  const entity = floor.entities.find((e) => e.id === entityId);
  if (!entity || entity.type !== 'GUNPOWDER_BARREL' || entity.consumed) return noop(state);
  if (entity.pos.x !== floor.player.x || entity.pos.y !== floor.player.y) return noop(state);
  if (!canAfford(floor.ap, 'USE_INTERACT')) return noop(state);

  const alarmed: ExpeditionState = {
    ...state,
    floorState: {
      ...floor,
      ap: spend(floor.ap, 'USE_INTERACT'),
      entities: floor.entities.map((e) => (e.id === entityId ? { ...e, consumed: true } : e)),
      monsters: floor.monsters.map((monster) => {
        if (monster.aiState === 'DEAD' || monster.hp <= 0 || monster.frenzied) return monster;
        return {
          ...monster,
          attack: monster.attack * 2,
          aggroRadius: Math.max(monster.aggroRadius, floor.size * 2),
          aiState: 'CHASE',
          frenzied: true,
        };
      }),
    },
  };
  // 警报瞬间：全体存活怪向玩家冲锋最多 3 格，进入射程则立刻攻击一次。
  const rush = rushMonstersTowardPlayer(alarmed, 3);
  return {
    state: rush.state,
    events: [
      { type: 'GUNPOWDER_BARREL_ACTIVATED', entityId, pos: { ...entity.pos } },
      ...rush.events,
    ],
  };
}

export function detonateBlastTarget(state: ExpeditionState, entityId: string): ApplyResult {
  const floor = state.floorState;
  const entity = floor.entities.find((e) => e.id === entityId);
  if (!entity || entity.type !== 'BLAST_TARGET' || entity.consumed) return noop(state);
  if (entity.pos.x !== floor.player.x || entity.pos.y !== floor.player.y) return noop(state);
  if (!floor.entities.some((e) => e.type === 'GUNPOWDER_BARREL' && e.consumed)) return noop(state);
  if (!canAfford(floor.ap, 'USE_INTERACT')) return noop(state);

  return {
    state: {
      ...state,
      floorState: {
        ...floor,
        ap: spend(floor.ap, 'USE_INTERACT'),
        entities: floor.entities.map((e) => (e.id === entityId ? { ...e, consumed: true } : e)),
      },
    },
    events: [{ type: 'BLAST_TARGET_DETONATED', entityId, pos: { ...entity.pos } }],
  };
}

function manhattanAdjacent(a: Coord, b: Coord): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) <= 1;
}

/** 第 23 层：相邻格互动封印熔岩 vent。 */
export function sealLavaVent(state: ExpeditionState, entityId: string): ApplyResult {
  const floor = state.floorState;
  const entity = floor.entities.find((e) => e.id === entityId);
  if (!entity || entity.type !== 'LAVA_VENT' || entity.consumed) return noop(state);
  if (!manhattanAdjacent(floor.player, entity.pos)) return noop(state);
  if (!canAfford(floor.ap, 'USE_INTERACT')) return noop(state);

  return {
    state: {
      ...state,
      floorState: {
        ...floor,
        ap: spend(floor.ap, 'USE_INTERACT'),
        entities: floor.entities.map((e) => (
          e.id === entityId || e.id === `${entityId}_WARN`
            ? { ...e, consumed: true }
            : e
        )),
      },
    },
    events: [{ type: 'VENT_SEALED', entityId, pos: { ...entity.pos } }],
  };
}

/** 查找玩家相邻（含同格）可封印的 vent。 */
export function findAdjacentLavaVent(floor: FloorState): FixedEntity | undefined {
  return floor.entities.find((entity) => (
    !entity.consumed
    && entity.type === 'LAVA_VENT'
    && manhattanAdjacent(floor.player, entity.pos)
  ));
}

/** 第 31 层：相邻互动命运封印，选择试炼分支。 */
export function interactFateSeal(state: ExpeditionState, entityId: string): ApplyResult {
  const floor = state.floorState;
  const entity = floor.entities.find((e) => e.id === entityId);
  if (!entity || entity.type !== 'FATE_SEAL' || entity.consumed) return noop(state);
  if (!manhattanAdjacent(floor.player, entity.pos)) return noop(state);
  if (!canAfford(floor.ap, 'USE_INTERACT')) return noop(state);
  const choiceBySeal: Record<string, 'HUNT' | 'ESCAPE' | 'HOLD'> = {
    F31_SEAL_1: 'HUNT',
    F31_SEAL_2: 'ESCAPE',
    F31_SEAL_3: 'HOLD',
  };
  const choice = choiceBySeal[entityId];
  if (!choice) return noop(state);
  return {
    state: {
      ...state,
      floorState: {
        ...floor,
        ap: spend(floor.ap, 'USE_INTERACT'),
        entities: floor.entities.map((e) => (
          e.type === 'FATE_SEAL' ? { ...e, consumed: true } : e
        )),
      },
    },
    events: [{ type: 'FATE_CHOICE_SELECTED', sealId: entityId, choice, pos: { ...entity.pos } }],
  };
}

export function findAdjacentFateSeal(floor: FloorState): FixedEntity | undefined {
  return floor.entities.find((entity) => (
    !entity.consumed
    && entity.type === 'FATE_SEAL'
    && manhattanAdjacent(floor.player, entity.pos)
  ));
}

/** 楼层是否已通关（出口门已开启 / Boss 层传送门已生成）。 */
export function isFloorCleared(floorState: FloorState): boolean {
  return floorState.status === 'CLEARED';
}
