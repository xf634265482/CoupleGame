import { stepMonsters } from '../../assets/scripts/pve/core/MonsterAI';
import { HEAVY_STRIKE_INTERVAL, HEAVY_STRIKE_MULTIPLIER, HEAVY_STRIKE_RANGE } from '../../assets/scripts/pve/core/bosses/GoblinChief';
import { makeEntity, makeExpeditionState, makeMonster } from './helpers';

describe('MonsterAI — 普通怪追击与攻击（AC-4）', () => {
  it('玩家在仇恨范围外时怪物保持 IDLE，不移动不攻击', () => {
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 0, y: 0 },
        monsters: [makeMonster('m1', { x: 7, y: 7 }, { aggroRadius: 3, range: 1 })],
      },
    });

    const result = stepMonsters(state);
    const monster = result.state.floorState.monsters.find((m) => m.id === 'm1');
    expect(monster?.aiState).toBe('IDLE');
    expect(monster?.pos).toEqual({ x: 7, y: 7 });
    expect(result.events).toEqual([]);
  });

  it('玩家进入仇恨范围但不在攻击距离内时转为 CHASE 并朝玩家移动一格', () => {
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 4, y: 4 },
        monsters: [makeMonster('m1', { x: 4, y: 1 }, { aggroRadius: 5, range: 1 })],
      },
    });

    const result = stepMonsters(state);
    const monster = result.state.floorState.monsters.find((m) => m.id === 'm1');
    expect(monster?.aiState).toBe('CHASE');
    // 朝玩家方向（y 增大）移动一格
    expect(monster?.pos).toEqual({ x: 4, y: 2 });
    expect(result.events).toEqual([
      { type: 'MOVE', entityId: 'm1', from: { x: 4, y: 1 }, to: { x: 4, y: 2 }, apLeft: result.state.floorState.ap },
    ]);
  });

  it('floor 4 objective sentinel emits escape event when reaching the marker', () => {
    const state = makeExpeditionState({
      floor: 4,
      floorOverrides: {
        player: { x: 0, y: 8 },
        entities: [makeEntity('escape', 'ESCAPE_MARKER', { x: 7, y: 0 })],
        monsters: [makeMonster('GOBLIN_SENTINEL', { x: 6, y: 0 }, {
          variantId: 'GOBLIN_SENTINEL',
          aiState: 'FLEE',
          hp: 40,
          maxHp: 120,
        })],
      },
    });

    const result = stepMonsters(state);

    expect(result.state.floorState.monsters.find((m) => m.id === 'GOBLIN_SENTINEL')?.pos).toEqual({ x: 7, y: 0 });
    expect(result.events).toContainEqual({ type: 'TARGET_ESCAPED', entityId: 'GOBLIN_SENTINEL', pos: { x: 7, y: 0 } });
  });

  it('玩家进入攻击距离内时怪物攻击并产生 PLAYER_DAMAGED 事件', () => {
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 4, y: 4 },
        monsters: [makeMonster('m1', { x: 4, y: 5 }, { aggroRadius: 5, range: 1, attack: 20 })],
      },
      playerOverrides: { hp: 200, maxHp: 200 },
    });

    const result = stepMonsters(state);
    const monster = result.state.floorState.monsters.find((m) => m.id === 'm1');
    expect(monster?.aiState).toBe('CHASE');
    expect(monster?.pos).toEqual({ x: 4, y: 5 }); // 原地攻击，不移动
    expect(result.state.player.hp).toBe(180);
    // 攻击者所在格此前未揭示，攻击时一并揭示该格
    expect(result.events).toEqual([
      { type: 'PLAYER_DAMAGED', damage: 20, hp: 180, sourceId: 'm1', rawDamage: 20 },
    ]);
  });

  it('玩家脱离仇恨范围后怪物放弃追击恢复 IDLE', () => {
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 7, y: 7 },
        monsters: [makeMonster('m1', { x: 0, y: 0 }, { aiState: 'CHASE', aggroRadius: 2, range: 1 })],
      },
    });

    const result = stepMonsters(state);
    const monster = result.state.floorState.monsters.find((m) => m.id === 'm1');
    expect(monster?.aiState).toBe('IDLE');
    expect(monster?.pos).toEqual({ x: 0, y: 0 });
  });

  it('目标格被其他怪物占据时尝试换轴，仍不可行则原地等待', () => {
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 6, y: 4 },
        monsters: [
          makeMonster('m1', { x: 4, y: 4 }, { aggroRadius: 5, range: 1 }),
          // 挡住 m1 朝玩家方向（x+1）的格子，迫使其换到 y 轴
          makeMonster('m2', { x: 5, y: 4 }, { aiState: 'IDLE', aggroRadius: 0 }),
        ],
      },
    });

    const result = stepMonsters(state);
    const m1 = result.state.floorState.monsters.find((m) => m.id === 'm1');
    expect(m1?.pos).not.toEqual({ x: 5, y: 4 });
    expect(m1?.aiState).toBe('CHASE');
  });

  describe('Boss 行动（AC-9/AC-10 修复 stepMonsters 漏过 BOSS 类型）', () => {
    const makeGoblinChief = (pos: { x: number; y: number }, extra: Partial<ReturnType<typeof makeMonster>> = {}) =>
      makeMonster('boss', pos, {
        type: 'BOSS',
        bossId: 'GOBLIN_CHIEF',
        hp: 300,
        maxHp: 300,
        attack: 30,
        range: 1,
        aggroRadius: 99,
        ...extra,
      });

    it('Boss 在攻击距离内：转 CHASE 并对玩家造成伤害（之前被 stepMonsters 静默跳过 → 不会攻击的 bug）', () => {
      const state = makeExpeditionState({
        floorOverrides: {
          player: { x: 4, y: 4 },
          turn: 1,
          monsters: [makeGoblinChief({ x: 4, y: 5 })],
        },
        playerOverrides: { hp: 200, maxHp: 200 },
      });

      const result = stepMonsters(state);
      const boss = result.state.floorState.monsters.find((m) => m.id === 'boss');
      expect(boss?.aiState).toBe('CHASE');
      expect(boss?.pos).toEqual({ x: 4, y: 5 });
      expect(result.state.player.hp).toBe(170); // 200 - 30
      expect(result.events.some((e) => e.type === 'PLAYER_DAMAGED')).toBe(true);
    });

    it('Boss 距离较远时朝玩家追击（与普通怪共享走位逻辑）', () => {
      const state = makeExpeditionState({
        floorOverrides: {
          player: { x: 4, y: 4 },
          turn: 1,
          monsters: [makeGoblinChief({ x: 4, y: 1 })],
        },
      });

      const result = stepMonsters(state);
      const boss = result.state.floorState.monsters.find((m) => m.id === 'boss');
      expect(boss?.aiState).toBe('CHASE');
      expect(boss?.pos).toEqual({ x: 4, y: 2 }); // 朝玩家方向移动一格
      expect(result.events[0]?.type).toBe('MOVE');
    });

    it('Boss 蓄力重击：每 HEAVY_STRIKE_INTERVAL 个怪物回合伤害 ×HEAVY_STRIKE_MULTIPLIER（AC-10）', () => {
      const baseState = makeExpeditionState({
        floorOverrides: {
          player: { x: 4, y: 4 },
          monsters: [makeGoblinChief({ x: 4, y: 5 })],
        },
        playerOverrides: { hp: 200, maxHp: 200 },
      });

      // 重击回合（turn = HEAVY_STRIKE_INTERVAL）：30 × HEAVY_STRIKE_MULTIPLIER 伤害
      const heavyTurn = { ...baseState, floorState: { ...baseState.floorState, turn: HEAVY_STRIKE_INTERVAL } };
      const heavyResult = stepMonsters(heavyTurn);
      expect(heavyResult.state.player.hp).toBe(200 - 30 * HEAVY_STRIKE_MULTIPLIER);

      // 普通回合（turn = HEAVY_STRIKE_INTERVAL + 1）：30 伤害
      const normalTurn = { ...baseState, floorState: { ...baseState.floorState, turn: HEAVY_STRIKE_INTERVAL + 1 } };
      const normalResult = stepMonsters(normalTurn);
      expect(normalResult.state.player.hp).toBe(170); // 200 - 30
    });

    it('Boss 蓄力重击预警（2026-06-15 站桩方案）：以 boss 当前位置为心、半径=HEAVY_STRIKE_RANGE（红圈=橙圈）', () => {
      // turn = HEAVY_STRIKE_INTERVAL - 1：本回合非重击，但下个怪物回合（turn+1）将触发重击
      const state = makeExpeditionState({
        floorOverrides: {
          player: { x: 4, y: 7 },
          turn: HEAVY_STRIKE_INTERVAL - 1,
          monsters: [makeGoblinChief({ x: 4, y: 0 })],
        },
      });

      const result = stepMonsters(state);
      // 本回合 boss 朝玩家移动一格 (4,0) → (4,1)；预警以移动后的 boss 位置 (4,1) 为心、半径
      // = HEAVY_STRIKE_RANGE（重击回合 boss 站桩不移动，无需预留移动空间，红圈即下回合实际命中区）
      expect(result.events).toContainEqual({
        type: 'HEAVY_STRIKE_WARNING', bossId: 'boss', center: { x: 4, y: 1 }, radius: HEAVY_STRIKE_RANGE,
      });

      // 重击回合本身（turn = HEAVY_STRIKE_INTERVAL）不再发出预警
      const heavyTurn = { ...state, floorState: { ...state.floorState, turn: HEAVY_STRIKE_INTERVAL } };
      const heavyResult = stepMonsters(heavyTurn);
      expect(heavyResult.events.some((e) => e.type === 'HEAVY_STRIKE_WARNING')).toBe(false);
    });

    it('Boss 重击回合「先原地释放、再追击移动」（2026-06-15）：以起手位置结算，释放后逼近一格', () => {
      // 重击回合 boss(4,1) 与玩家(4,4) 距离 3（≤ HEAVY_STRIKE_RANGE=4，命中）
      // entities:[] 清空地形实体，避免普通层 ROCK 地形吸收 AOE 干扰断言。
      const state = makeExpeditionState({
        floorOverrides: {
          player: { x: 4, y: 4 },
          turn: HEAVY_STRIKE_INTERVAL,
          monsters: [makeGoblinChief({ x: 4, y: 1 })],
          entities: [],
        },
        playerOverrides: { hp: 2000, maxHp: 2000 },
      });

      const result = stepMonsters(state);
      const boss = result.state.floorState.monsters.find((m) => m.id === 'boss');
      // 重击以【起手位置 (4,1)】为心结算（释放发生在移动之前 → 与上一回合红圈中心一致）
      expect(result.events).toContainEqual(
        expect.objectContaining({ type: 'HEAVY_STRIKE_RESOLVED', center: { x: 4, y: 1 } }),
      );
      expect(result.events.some((e) => e.type === 'PLAYER_DAMAGED')).toBe(true);
      // 释放后追击逼近一格 (4,1) → (4,2)
      expect(boss?.pos).toEqual({ x: 4, y: 2 });
      const idxResolved = result.events.findIndex((e) => e.type === 'HEAVY_STRIKE_RESOLVED');
      const idxMove = result.events.findIndex((e) => e.type === 'MOVE' && e.entityId === 'boss');
      expect(idxMove).toBeGreaterThan(idxResolved); // 先释放、后移动
    });

    it('Boss 重击回合：玩家在 HEAVY_STRIKE_RANGE 外则落空（以起手位置结算），释放后仍追击', () => {
      // boss(4,0)，玩家(4,5) 距离 5 > HEAVY_STRIKE_RANGE(4)：以起手位置释放打不到玩家
      const state = makeExpeditionState({
        floorOverrides: {
          player: { x: 4, y: 5 },
          turn: HEAVY_STRIKE_INTERVAL,
          monsters: [makeGoblinChief({ x: 4, y: 0 })],
        },
        playerOverrides: { hp: 2000, maxHp: 2000 },
      });

      const result = stepMonsters(state);
      const boss = result.state.floorState.monsters.find((m) => m.id === 'boss');
      expect(result.events).toContainEqual(
        expect.objectContaining({ type: 'HEAVY_STRIKE_RESOLVED', center: { x: 4, y: 0 } }),
      );
      expect(result.events.some((e) => e.type === 'PLAYER_DAMAGED')).toBe(false); // 落空
      expect(result.state.player.hp).toBe(2000);
      expect(boss?.pos).toEqual({ x: 4, y: 1 }); // 释放后仍追击逼近一格
    });
  });

  it('已死亡的怪物不会行动；玩家阵亡后停止后续怪物行动', () => {
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 4, y: 4 },
        monsters: [
          makeMonster('dead', { x: 4, y: 5 }, { aiState: 'DEAD', attack: 99 }),
          makeMonster('killer', { x: 4, y: 3 }, { aggroRadius: 5, range: 1, attack: 99 }),
          makeMonster('bystander', { x: 0, y: 0 }, { aggroRadius: 0 }),
        ],
      },
      playerOverrides: { hp: 5, maxHp: 20 },
    });

    const result = stepMonsters(state);
    expect(result.state.status).toBe('DEAD');
    const bystander = result.state.floorState.monsters.find((m) => m.id === 'bystander');
    // bystander 排在 killer 之后；玩家已阵亡应提前终止，bystander 保持原状
    expect(bystander?.pos).toEqual({ x: 0, y: 0 });
    expect(bystander?.aiState).toBe('IDLE');
  });
});

// ── M2 AC-18：灵气怪（FLEE）与精英怪（PATROL→CHASE）────────────────────────

describe('MonsterAI — 灵气怪 FLEE（AC-18 M2）', () => {
  it('玩家进入仇恨范围：灵气怪转 FLEE 并向远离玩家的方向移动', () => {
    // 灵气怪在 (4,4)，玩家在 (4,5)（正下方），期望灵气怪向上逃（y-1）
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 4, y: 5 },
        monsters: [makeMonster('a1', { x: 4, y: 4 }, { type: 'ANIMA', aggroRadius: 5 })],
      },
    });

    const result = stepMonsters(state);
    const anima = result.state.floorState.monsters.find((m) => m.id === 'a1');
    expect(anima?.aiState).toBe('FLEE');
    // 应移动至更远于玩家的位置（曼哈顿距离增大）
    const beforeDist = Math.abs(4 - 4) + Math.abs(4 - 5); // 1
    const afterPos = anima!.pos;
    const afterDist = Math.abs(afterPos.x - 4) + Math.abs(afterPos.y - 5);
    expect(afterDist).toBeGreaterThan(beforeDist);
  });

  it('玩家不在仇恨范围内：灵气怪保持 IDLE 不动', () => {
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 0, y: 0 },
        monsters: [makeMonster('a1', { x: 7, y: 7 }, { type: 'ANIMA', aggroRadius: 2 })],
      },
    });

    const result = stepMonsters(state);
    const anima = result.state.floorState.monsters.find((m) => m.id === 'a1');
    expect(anima?.pos).toEqual({ x: 7, y: 7 });
    expect(result.events).toEqual([]);
  });

  it('灵气怪无攻击：即使相邻也不会攻击玩家', () => {
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 4, y: 4 },
        monsters: [makeMonster('a1', { x: 4, y: 5 }, { type: 'ANIMA', attack: 0, range: 0, aggroRadius: 5 })],
      },
      playerOverrides: { hp: 20, maxHp: 20 },
    });

    const result = stepMonsters(state);
    // 无 PLAYER_DAMAGED 事件
    expect(result.events.some((e) => e.type === 'PLAYER_DAMAGED')).toBe(false);
    expect(result.state.player.hp).toBe(20);
  });
});

describe('MonsterAI — 精英怪 PATROL→CHASE（AC-18 M2）', () => {
  it('玩家不在仇恨范围内：精英怪 PATROL，产生 MOVE 事件（随机游走）', () => {
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 0, y: 0 },
        turn: 1,
        monsters: [makeMonster('e1', { x: 4, y: 4 }, { type: 'ELITE', aggroRadius: 3 })],
      },
    });

    const result = stepMonsters(state);
    const elite = result.state.floorState.monsters.find((m) => m.id === 'e1');
    expect(elite?.aiState).toBe('PATROL');
    // 精英怪应该走了一格（产生 MOVE 事件）
    expect(result.events.some((e) => e.type === 'MOVE' && e.entityId === 'e1')).toBe(true);
  });

  it('玩家进入仇恨范围：精英怪转 CHASE 并追击（不返回 PATROL）', () => {
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 4, y: 4 },
        monsters: [makeMonster('e1', { x: 4, y: 6 }, { type: 'ELITE', aggroRadius: 3 })],
      },
    });

    const result = stepMonsters(state);
    const elite = result.state.floorState.monsters.find((m) => m.id === 'e1');
    expect(elite?.aiState).toBe('CHASE');
    // 精英怪向玩家移动（y 减少）
    expect(elite?.pos.y).toBeLessThan(6);
  });

  it('精英怪 PATROL 确定性：相同 monsterId + 相同 turn → 相同方向（AC-13）', () => {
    const make = (turn: number) =>
      makeExpeditionState({
        floorOverrides: {
          player: { x: 0, y: 0 },
          turn,
          monsters: [makeMonster('elite_det', { x: 4, y: 4 }, { type: 'ELITE', aggroRadius: 1 })],
        },
      });

    const r1 = stepMonsters(make(5));
    const r2 = stepMonsters(make(5));
    expect(r1.state.floorState.monsters[0].pos).toEqual(r2.state.floorState.monsters[0].pos);
  });
});
