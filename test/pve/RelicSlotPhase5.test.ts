// Phase 5 遗物 3 激活槽单测（AC-EQ-8、AC-EQ-9）
// 覆盖：自动激活上限/非激活不触发/激活切换/铁匠洗炼下放 RARE+

import { pickupRelic, playerHasRelic, activateRelic, deactivateRelic } from '../../assets/scripts/pve/core/RelicSystem';
import { campActivateRelic, campDeactivateRelic } from '../../assets/scripts/pve/core/CampSystem';
import { rerollEquipTrait } from '../../assets/scripts/pve/core/NeutralEntities';
import { RELIC_ACTIVE_SLOTS } from '../../assets/scripts/pve/core/PveConstants';
import { makeExpeditionState, makeRunPlayer } from './helpers';
import type { RelicId, RunPlayer } from '../../assets/scripts/pve/core/PveTypes';

// ── RELIC_ACTIVE_SLOTS 常量 ─────────────────────────────────────────────

describe('RELIC_ACTIVE_SLOTS', () => {
  it('常量 = 3', () => {
    expect(RELIC_ACTIVE_SLOTS).toBe(3);
  });
});

// ── pickupRelic：自动激活 + ownedRelics ──────────────────────────────────

describe('pickupRelic — 自动激活与 ownedRelics（Phase 5）', () => {
  it('拾取前 2 个遗物，自动放入激活槽（relics 增长）', () => {
    const p0 = makeRunPlayer();
    const r1 = pickupRelic(p0, 'CHIEF_ROAR', 'test');
    const r2 = pickupRelic(r1.player, 'QUICKSAND_HEART', 'test');
    expect(r2.player.relics).toContain('CHIEF_ROAR');
    expect(r2.player.relics).toContain('QUICKSAND_HEART');
    expect(r2.player.relics?.length).toBe(2);
    expect(r2.player.ownedRelics).toContain('CHIEF_ROAR');
    expect(r2.player.ownedRelics).toContain('QUICKSAND_HEART');
  });

  it('拾取 3 个遗物，激活槽满（relics.length = 3）', () => {
    let p = makeRunPlayer();
    for (const id of ['CHIEF_ROAR', 'QUICKSAND_HEART', 'PERMAFROST_CORE'] as RelicId[]) {
      const r = pickupRelic(p, id, 'test');
      p = r.player;
    }
    expect(p.relics?.length).toBe(3);
    expect(p.ownedRelics?.length).toBe(3);
  });

  it('第 4 个遗物：加入 ownedRelics 但不进激活槽', () => {
    let p = makeRunPlayer();
    for (const id of ['CHIEF_ROAR', 'QUICKSAND_HEART', 'PERMAFROST_CORE', 'MAGMA_HEART'] as RelicId[]) {
      const r = pickupRelic(p, id, 'test');
      p = r.player;
    }
    expect(p.relics?.length).toBe(3);          // 激活槽仍 3 个
    expect(p.ownedRelics?.length).toBe(4);     // 持有 4 个
    expect(p.relics).not.toContain('MAGMA_HEART');  // 第4个未激活
    expect(p.ownedRelics).toContain('MAGMA_HEART'); // 但已持有
  });

  it('playerHasRelic 只检查激活槽', () => {
    let p = makeRunPlayer();
    for (const id of ['CHIEF_ROAR', 'QUICKSAND_HEART', 'PERMAFROST_CORE', 'MAGMA_HEART'] as RelicId[]) {
      const r = pickupRelic(p, id, 'test');
      p = r.player;
    }
    expect(playerHasRelic(p, 'CHIEF_ROAR')).toBe(true);      // 激活
    expect(playerHasRelic(p, 'MAGMA_HEART')).toBe(false);    // 未激活
  });
});

// ── activateRelic / deactivateRelic ──────────────────────────────────────

describe('activateRelic / deactivateRelic', () => {
  function buildPlayerWith4Relics(): RunPlayer {
    let p = makeRunPlayer();
    for (const id of ['CHIEF_ROAR', 'QUICKSAND_HEART', 'PERMAFROST_CORE', 'MAGMA_HEART'] as RelicId[]) {
      p = pickupRelic(p, id, 'test').player;
    }
    return p;
  }

  it('槽满时可替换激活遗物', () => {
    const p = buildPlayerWith4Relics();
    const next = activateRelic(p, 'MAGMA_HEART', 'CHIEF_ROAR');
    expect(next.relics).toContain('MAGMA_HEART');
    expect(next.relics).not.toContain('CHIEF_ROAR');
    expect(next.relics?.length).toBe(3);
  });

  it('槽满但不提供 replaceId → no-op', () => {
    const p = buildPlayerWith4Relics();
    const next = activateRelic(p, 'MAGMA_HEART');
    expect(next).toBe(p); // 引用相同，未修改
  });

  it('activateRelic 已激活的遗物 → no-op', () => {
    const p = buildPlayerWith4Relics();
    const next = activateRelic(p, 'CHIEF_ROAR');
    expect(next).toBe(p);
  });

  it('activateRelic 未持有的遗物 → no-op', () => {
    const p = buildPlayerWith4Relics();
    const next = activateRelic(p, 'FATE_ECHO'); // 未收集
    expect(next).toBe(p);
  });

  it('deactivateRelic 移出激活槽，ownedRelics 不变', () => {
    const p = buildPlayerWith4Relics();
    const next = deactivateRelic(p, 'CHIEF_ROAR');
    expect(next.relics).not.toContain('CHIEF_ROAR');
    expect(next.relics?.length).toBe(2);
    expect(next.ownedRelics).toContain('CHIEF_ROAR'); // 仍然持有
  });
});

// ── campActivateRelic / campDeactivateRelic ──────────────────────────────

describe('campActivateRelic / campDeactivateRelic', () => {
  it('激活后 state 包含更新的 player', () => {
    let state = makeExpeditionState({
      playerOverrides: {
        relics: ['CHIEF_ROAR', 'QUICKSAND_HEART'] as RelicId[],
        ownedRelics: ['CHIEF_ROAR', 'QUICKSAND_HEART', 'PERMAFROST_CORE'] as RelicId[],
      },
    });
    state = campActivateRelic(state, 'PERMAFROST_CORE');
    expect(state.player.relics).toContain('PERMAFROST_CORE');
    expect(state.player.relics?.length).toBe(3);
  });

  it('停用后激活槽减少', () => {
    let state = makeExpeditionState({
      playerOverrides: {
        relics: ['CHIEF_ROAR', 'QUICKSAND_HEART', 'PERMAFROST_CORE'] as RelicId[],
        ownedRelics: ['CHIEF_ROAR', 'QUICKSAND_HEART', 'PERMAFROST_CORE'] as RelicId[],
      },
    });
    state = campDeactivateRelic(state, 'QUICKSAND_HEART');
    expect(state.player.relics).not.toContain('QUICKSAND_HEART');
    expect(state.player.relics?.length).toBe(2);
  });
});

// ── 铁匠洗炼下放 RARE+（AC-EQ-9）────────────────────────────────────────

describe('rerollEquipTrait — RARE+ 洗炼（AC-EQ-9）', () => {
  it('RARE 品质装备可以洗炼（REROLL_QUALITY_MIN 含 RARE）', () => {
    const state = makeExpeditionState({
      playerOverrides: {
        gold: 100,
        equipment: {
          WEAPON: {
            id: 'test_rare_weapon',
            name: '测试蓝武器',
            slot: 'WEAPON',
            quality: 'RARE',
            baseStat: 15,
          },
        },
      },
      floorOverrides: {
        entities: [{
          id: 'blacksmith_1',
          type: 'BLACKSMITH',
          pos: { x: 0, y: 0 },
          consumed: false,
        }],
        player: { x: 0, y: 0 },
      },
    });
    const result = rerollEquipTrait(state, 'blacksmith_1', 'WEAPON');
    // 只要不是 no-op（events 非空），就说明洗炼生效
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.events[0].type).toBe('BLACKSMITH_REROLL');
  });

  it('FINE 品质装备不可洗炼（no-op）', () => {
    const state = makeExpeditionState({
      playerOverrides: {
        gold: 100,
        equipment: {
          WEAPON: {
            id: 'test_fine_weapon',
            name: '测试绿武器',
            slot: 'WEAPON',
            quality: 'FINE',
            baseStat: 10,
          },
        },
      },
      floorOverrides: {
        entities: [{
          id: 'blacksmith_1',
          type: 'BLACKSMITH',
          pos: { x: 0, y: 0 },
          consumed: false,
        }],
        player: { x: 0, y: 0 },
      },
    });
    const result = rerollEquipTrait(state, 'blacksmith_1', 'WEAPON');
    expect(result.events.length).toBe(0); // no-op
    expect(result.state).toBe(state);
  });
});
