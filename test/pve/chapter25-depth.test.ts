// 批次1（260613 内容深化）测试套件骨架。
// 各 describe 下先用 it.todo 占位，随阶段推进逐步实现（阶段 1~3）。

import { equipItem } from '../../assets/scripts/pve/core/EquipHelper';
import type { EquipItem } from '../../assets/scripts/pve/core/PveTypes';
import { makeExpeditionState, makeRunPlayer } from './helpers';

function makeHelmet(baseStat: number, id = `helm_${baseStat}`): EquipItem {
  return { id, slot: 'HELMET', quality: 'COMMON', name: '测试头盔', baseStat };
}

describe('chapter25-depth: HELMET 接入战斗', () => {
  it('空槽位首次装备头盔（baseStat=2），maxHp +2，hp +2', () => {
    const base = makeRunPlayer({ hp: 30, maxHp: 30 });
    const next = equipItem(base, makeHelmet(2));
    expect(next.maxHp).toBe(32);
    expect(next.hp).toBe(32);
    expect(next.equipment.HELMET?.baseStat).toBe(2);
  });

  it('已有 COMMON 头盔，替换为 RARE（baseStat=6），maxHp +4（delta 6-2），hp 不变', () => {
    const base = makeRunPlayer({
      hp: 25,
      maxHp: 32,
      equipment: { HELMET: makeHelmet(2, 'old') },
    });
    const next = equipItem(base, makeHelmet(6, 'new'));
    expect(next.maxHp).toBe(36);
    expect(next.hp).toBe(29); // 升级时 hp 上抬等量 delta，封顶 maxHp
    expect(next.equipment.HELMET?.id).toBe('new');
  });

  it('装备 LEGENDARY 头盔（baseStat=14）从空槽，maxHp 增加 14', () => {
    const base = makeRunPlayer({ hp: 30, maxHp: 30 });
    const next = equipItem(base, makeHelmet(14));
    expect(next.maxHp).toBe(44);
    expect(next.hp).toBe(44);
  });

  it('降级头盔（baseStat 6→2）：maxHp -4，hp 不主动扣血，但封顶新 maxHp', () => {
    const base = makeRunPlayer({
      hp: 28,
      maxHp: 36,
      equipment: { HELMET: makeHelmet(6, 'old') },
    });
    const next = equipItem(base, makeHelmet(2, 'new'));
    expect(next.maxHp).toBe(32);
    expect(next.hp).toBe(28); // 28 ≤ 32，保持
  });

  it('降级时 hp 超过新 maxHp → 封顶到新 maxHp', () => {
    const base = makeRunPlayer({
      hp: 35,
      maxHp: 36,
      equipment: { HELMET: makeHelmet(6, 'old') },
    });
    const next = equipItem(base, makeHelmet(2, 'new'));
    expect(next.maxHp).toBe(32);
    expect(next.hp).toBe(32); // 35 > 32 → 封顶
  });

  it('非 HELMET 槽位（如 WEAPON）不影响 maxHp/hp', () => {
    const base = makeRunPlayer({ hp: 25, maxHp: 30 });
    const weapon: EquipItem = { id: 'w1', slot: 'WEAPON', quality: 'RARE', name: '剑', baseStat: 10 };
    const next = equipItem(base, weapon);
    expect(next.maxHp).toBe(30);
    expect(next.hp).toBe(25);
    expect(next.equipment.WEAPON?.id).toBe('w1');
  });
});

describe('chapter25-depth: 2-5 章怪物表框架', () => {
  // 抽函数：跑 generateChapterMonsters 并返回 monsters 列表
  const { generateChapterMonsters, CHAPTER_MONSTER_RULES } =
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('../../assets/scripts/pve/core/ChapterMonsterRules') as typeof import('../../assets/scripts/pve/core/ChapterMonsterRules');
  type LocalMonster = import('../../assets/scripts/pve/core/PveTypes').Monster;

  function run(chapter: number, flInChapter: number) {
    const pool = Array.from({ length: 64 }, (_, i) => ({ x: i % 8, y: Math.floor(i / 8) }));
    const monsters: LocalMonster[] = [];
    let seq = 0;
    generateChapterMonsters(chapter, flInChapter, pool, () => `m${seq++}`, monsters);
    return monsters;
  }

  it('chapter=1 各层符合现行（重构前）规则：warrior/archer/fire/frost/rat 数量正确', () => {
    const fl1 = run(1, 1);
    expect(fl1.filter((m) => m.variantId === 'GOBLIN_WARRIOR').length).toBe(3);
    expect(fl1.filter((m) => m.variantId === 'SPIRIT_RAT').length).toBe(1);
    expect(fl1).toHaveLength(4);

    const fl2 = run(1, 2);
    expect(fl2.filter((m) => m.variantId === 'GOBLIN_WARRIOR').length).toBe(2);
    expect(fl2.filter((m) => m.variantId === 'GOBLIN_ARCHER').length).toBe(2);
    expect(fl2.filter((m) => m.variantId === 'SPIRIT_RAT').length).toBe(1);

    const fl3 = run(1, 3);
    expect(fl3.filter((m) => m.variantId === 'FIRE_GOBLIN').length).toBe(2); // V3精英关卡

    const fl4 = run(1, 4);
    expect(fl4.filter((m) => m.variantId === 'FROST_GOBLIN').length).toBe(1);
  });

  it('chapter=2~5 各层恰好有 1 只 ANIMA 怪（P1 配比）', () => {
    for (const chapter of [2, 3, 4, 5]) {
      for (let fl = 1; fl <= 4; fl++) {
        const ms = run(chapter, fl);
        expect(ms.filter((m) => m.type === 'ANIMA').length).toBe(1);
      }
    }
  });

  it('chapter=2~5 层 4（Boss 前夜）各有恰好 1 只 ELITE 怪（P1）', () => {
    for (const chapter of [2, 3, 4, 5]) {
      const ms = run(chapter, 4);
      expect(ms.filter((m) => m.type === 'ELITE').length).toBe(1);
    }
  });

  it('chapter=2~5 层 1/2 至少有 2 只 NORMAL 怪（P1）', () => {
    for (const chapter of [2, 3, 4, 5]) {
      for (const fl of [1, 2]) {
        const ms = run(chapter, fl);
        expect(ms.filter((m) => m.type === 'NORMAL').length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('查表缺省回退到 normal=4, elite=1, anima=1', () => {
    const ms = run(99, 99); // 不存在的章节/层
    expect(ms.filter((m) => m.type === 'NORMAL').length).toBe(4);
    expect(ms.filter((m) => m.type === 'ELITE').length).toBe(1);
    expect(ms.filter((m) => m.type === 'ANIMA').length).toBe(1);
  });

  it('CHAPTER_MONSTER_RULES 表覆盖 chapter 1-5 × fl 1-6（V3）', () => {
    for (const chapter of [1, 2, 3, 4, 5]) {
      for (let fl = 1; fl <= 6; fl++) {
        expect(CHAPTER_MONSTER_RULES[chapter][fl]).toBeDefined();
      }
    }
  });

  it('chapter=1~5 章内第 3 层为精英关卡（精英怪 ≥ 2）', () => {
    for (const chapter of [1, 2, 3, 4, 5]) {
      const ms = run(chapter, 3);
      expect(ms.filter((m) => m.type === 'ELITE').length).toBeGreaterThanOrEqual(2);
    }
  });

  it('chapter=2~5 层 5/6（机关主场）各有 1 只 ANIMA 怪', () => {
    for (const chapter of [2, 3, 4, 5]) {
      for (const fl of [5, 6]) {
        const ms = run(chapter, fl);
        expect(ms.filter((m) => m.type === 'ANIMA').length).toBe(1);
      }
    }
  });
});

describe('chapter25-depth: QuicksandScorpion 沙坑', () => {
  const { generateFloor } = require('../../assets/scripts/pve/core/MapGenerator') as typeof import('../../assets/scripts/pve/core/MapGenerator');
  const { quicksandScorpionAttack, quicksandScorpionBurrow } = require('../../assets/scripts/pve/core/bosses/QuicksandScorpion') as typeof import('../../assets/scripts/pve/core/bosses/QuicksandScorpion');
  const { applyMove } = require('../../assets/scripts/pve/core/MovementSystem') as typeof import('../../assets/scripts/pve/core/MovementSystem');
  const { CHAPTER2_SAND_PIT_COUNT, CHAPTER2_SAND_PIT_MOVE_PENALTY, AP_COST } = require('../../assets/scripts/pve/core/PveConstants') as typeof import('../../assets/scripts/pve/core/PveConstants');

  it('第 14 层（第 2 章 Boss 房）生成 CHAPTER2_SAND_PIT_COUNT 个沙坑', () => {
    const floor = generateFloor(14, 12345);
    const pits = floor.entities.filter((e) => e.type === 'SAND_PIT');
    expect(pits).toHaveLength(CHAPTER2_SAND_PIT_COUNT);
  });

  it('非 Boss 层 / 非第 2 章不生成沙坑', () => {
    const fl1 = generateFloor(1, 1);
    const fl7 = generateFloor(7, 1); // 第1章 Boss 层
    const fl21 = generateFloor(21, 1); // 第3章 Boss 层
    expect(fl1.entities.filter((e) => e.type === 'SAND_PIT')).toHaveLength(0);
    expect(fl7.entities.filter((e) => e.type === 'SAND_PIT')).toHaveLength(0);
    expect(fl21.entities.filter((e) => e.type === 'SAND_PIT')).toHaveLength(0);
  });

  it('踩入沙坑：移动 AP 消耗增加 CHAPTER2_SAND_PIT_MOVE_PENALTY', () => {
    // 用 makeExpeditionState 直接构造一个简化场景：玩家在 (5,5)，相邻 (6,5) 是沙坑
    const state = makeExpeditionState({
      floor: 10,
      chapter: 2,
      seed: 99,
      floorOverrides: {
        size: 10,
        player: { x: 5, y: 5 },
        ap: 10,
        monsters: [], // 清空怪物避免阻挡
        entities: [
          { id: 'pit1', type: 'SAND_PIT', pos: { x: 6, y: 5 }, consumed: false },
        ],
      },
    });
    const expectedCost = AP_COST.MOVE + CHAPTER2_SAND_PIT_MOVE_PENALTY;
    const result = applyMove(state, 'RIGHT');
    expect(result.state.floorState.player).toEqual({ x: 6, y: 5 });
    expect(result.state.floorState.ap).toBe(10 - expectedCost);
    expect(result.events.some((e) => e.type === 'SAND_PIT_STEPPED' && e.entityId === 'pit1')).toBe(true);
  });

  it('Boss 冒出：有空闲沙坑时必选距玩家最近的沙坑（不消耗 RNG）', () => {
    const state = makeExpeditionState({
      floor: 10,
      chapter: 2,
      seed: 7,
      floorOverrides: {
        size: 10,
        player: { x: 5, y: 5 },
        monsters: [
          {
            id: 'boss',
            type: 'BOSS',
            bossId: 'QUICKSAND_SCORPION',
            pos: { x: 0, y: 0 },
            hp: 100,
            maxHp: 100,
            attack: 10,
            range: 1,
            aggroRadius: 99,
            aiState: 'CHASE',
            isBurrowed: true,
          },
        ],
        entities: [
          // 多个沙坑，最近的是 (4,5)
          { id: 'near', type: 'SAND_PIT', pos: { x: 4, y: 5 }, consumed: false },
          { id: 'far',  type: 'SAND_PIT', pos: { x: 9, y: 9 }, consumed: false },
        ],
      },
    });
    const result = quicksandScorpionAttack(state, 'boss');
    const bossAfter = result.state.floorState.monsters.find((m) => m.id === 'boss')!;
    expect(bossAfter.pos).toEqual({ x: 4, y: 5 });
    expect(bossAfter.isBurrowed).toBe(false);
    expect(result.events.some((e) => e.type === 'BOSS_EMERGED')).toBe(true);
  });

  it('Boss 冒出：所有沙坑被怪物占据时回退到玩家相邻空格', () => {
    const state = makeExpeditionState({
      floor: 10,
      chapter: 2,
      seed: 1,
      floorOverrides: {
        size: 10,
        player: { x: 5, y: 5 },
        monsters: [
          {
            id: 'boss',
            type: 'BOSS',
            bossId: 'QUICKSAND_SCORPION',
            pos: { x: 0, y: 0 },
            hp: 100,
            maxHp: 100,
            attack: 10,
            range: 1,
            aggroRadius: 99,
            aiState: 'CHASE',
            isBurrowed: true,
          },
          // 别的怪物站在唯一沙坑上
          {
            id: 'other',
            type: 'NORMAL',
            pos: { x: 4, y: 5 },
            hp: 10, maxHp: 10, attack: 1, range: 1, aggroRadius: 3, aiState: 'IDLE',
          },
        ],
        entities: [
          { id: 'occupied_pit', type: 'SAND_PIT', pos: { x: 4, y: 5 }, consumed: false },
        ],
      },
    });
    const result = quicksandScorpionAttack(state, 'boss');
    const bossAfter = result.state.floorState.monsters.find((m) => m.id === 'boss')!;
    // 不落在被占据的沙坑
    expect(bossAfter.pos).not.toEqual({ x: 4, y: 5 });
    // 落在玩家相邻 8 格之一
    const dx = Math.abs(bossAfter.pos.x - 5);
    const dy = Math.abs(bossAfter.pos.y - 5);
    expect(Math.max(dx, dy)).toBeLessThanOrEqual(1);
  });

  it('quicksandScorpionBurrow 仍设 isBurrowed=true 并 emit BOSS_BURROWED', () => {
    const state = makeExpeditionState({
      floor: 10,
      chapter: 2,
      seed: 1,
      floorOverrides: {
        size: 10,
        player: { x: 5, y: 5 },
        monsters: [
          {
            id: 'boss',
            type: 'BOSS',
            bossId: 'QUICKSAND_SCORPION',
            pos: { x: 0, y: 0 },
            hp: 100, maxHp: 100, attack: 10, range: 1, aggroRadius: 99,
            aiState: 'CHASE',
          },
        ],
      },
    });
    const result = quicksandScorpionBurrow(state, 'boss');
    expect(result.state.floorState.monsters[0].isBurrowed).toBe(true);
    // 潜地同时翻起动态流沙坑（反风筝）：事件含 BOSS_BURROWED + 可能的 SAND_TIDE_SPAWNED
    expect(result.events.some((e) => e.type === 'BOSS_BURROWED')).toBe(true);
  });
});

describe('chapter25-depth: FrostGiant 冰墙', () => {
  const { generateFloor } = require('../../assets/scripts/pve/core/MapGenerator') as typeof import('../../assets/scripts/pve/core/MapGenerator');
  const { applyMove } = require('../../assets/scripts/pve/core/MovementSystem') as typeof import('../../assets/scripts/pve/core/MovementSystem');
  const { attackIceWall } = require('../../assets/scripts/pve/core/CombatSystem') as typeof import('../../assets/scripts/pve/core/CombatSystem');
  const { CHAPTER3_ICE_WALL_COUNT, CHAPTER3_ICE_WALL_HP, CHAPTER3_ICE_WALL_DROP_ANIMA } = require('../../assets/scripts/pve/core/PveConstants') as typeof import('../../assets/scripts/pve/core/PveConstants');

  it('第 21 层（第 3 章 Boss 房）生成 CHAPTER3_ICE_WALL_COUNT 个冰墙，初始 HP=CHAPTER3_ICE_WALL_HP', () => {
    const floor = generateFloor(21, 12345);
    const walls = floor.entities.filter((e) => e.type === 'ICE_WALL');
    expect(walls).toHaveLength(CHAPTER3_ICE_WALL_COUNT);
    walls.forEach((w) => expect(w.hp).toBe(CHAPTER3_ICE_WALL_HP));
  });

  it('非 Boss 层 / 非第 3 章不生成冰墙', () => {
    expect(generateFloor(1, 1).entities.filter((e) => e.type === 'ICE_WALL')).toHaveLength(0);
    expect(generateFloor(14, 1).entities.filter((e) => e.type === 'ICE_WALL')).toHaveLength(0); // 第2章 Boss 层
  });

  it('玩家移动到冰墙格 no-op（位置不变，AP 不扣）', () => {
    const state = makeExpeditionState({
      floor: 15, chapter: 3, seed: 1,
      floorOverrides: {
        size: 10, player: { x: 5, y: 5 }, ap: 10, monsters: [],
        entities: [{ id: 'w1', type: 'ICE_WALL', pos: { x: 6, y: 5 }, consumed: false, hp: 10 }],
      },
    });
    const result = applyMove(state, 'RIGHT');
    expect(result.state.floorState.player).toEqual({ x: 5, y: 5 });
    expect(result.state.floorState.ap).toBe(10);
    expect(result.events).toHaveLength(0);
  });

  it('玩家攻击冰墙 hp 扣减但未破坏时不掉灵气，不消耗 RNG', () => {
    const state = makeExpeditionState({
      floor: 15, chapter: 3, seed: 1,
      floorOverrides: {
        size: 10, player: { x: 5, y: 5 }, ap: 10, monsters: [],
        entities: [{ id: 'w1', type: 'ICE_WALL', pos: { x: 6, y: 5 }, consumed: false, hp: 50 }],
      },
    });
    const prevRng = state.floorState.rngState;
    const animaBefore = state.player.anima;
    const result = attackIceWall(state, 'w1');
    const wallAfter = result.state.floorState.entities.find((e) => e.id === 'w1')!;
    expect(wallAfter.hp).toBeLessThan(50);
    expect(wallAfter.consumed).toBe(false);
    expect(result.state.player.anima).toBe(animaBefore);
    expect(result.state.floorState.rngState).toBe(prevRng);
    expect(result.events.some((e) => e.type === 'ATTACK')).toBe(true);
    expect(result.events.some((e) => e.type === 'ICE_WALL_BROKEN')).toBe(false);
  });

  it('冰墙 HP=0 时 consumed=true，emit ICE_WALL_BROKEN，玩家 anima +CHAPTER3_ICE_WALL_DROP_ANIMA', () => {
    const state = makeExpeditionState({
      floor: 15, chapter: 3, seed: 1,
      floorOverrides: {
        size: 10, player: { x: 5, y: 5 }, ap: 10, monsters: [],
        entities: [{ id: 'w1', type: 'ICE_WALL', pos: { x: 6, y: 5 }, consumed: false, hp: 1 }],
      },
    });
    const animaBefore = state.player.anima;
    const result = attackIceWall(state, 'w1');
    const wallAfter = result.state.floorState.entities.find((e) => e.id === 'w1')!;
    expect(wallAfter.hp).toBe(0);
    expect(wallAfter.consumed).toBe(true);
    expect(result.state.player.anima).toBe(animaBefore + CHAPTER3_ICE_WALL_DROP_ANIMA);
    expect(result.events.some((e) => e.type === 'ICE_WALL_BROKEN')).toBe(true);
  });

  it('攻击范围外的冰墙：no-op（AP 不扣）', () => {
    const state = makeExpeditionState({
      floor: 15, chapter: 3, seed: 1,
      floorOverrides: {
        size: 10, player: { x: 0, y: 0 }, ap: 10, monsters: [],
        entities: [{ id: 'w1', type: 'ICE_WALL', pos: { x: 9, y: 9 }, consumed: false, hp: 10 }],
      },
    });
    const result = attackIceWall(state, 'w1');
    expect(result.state.floorState.ap).toBe(10);
    expect(result.events).toHaveLength(0);
  });
});

describe('chapter25-depth: FateGuardian 行为镜像（260616 重做）', () => {
  // 重做后镜像生成阈值 50%、HP/攻击 = 玩家快照 × 0.5；详细测试见 FateGuardian.test.ts
  // 本套件仅保留 spawnPortal 与镜像击杀的旧验收（与 260613 关卡深化耦合的部分）。
  const { spawnPortal } = require('../../assets/scripts/pve/core/FloorRules') as typeof import('../../assets/scripts/pve/core/FloorRules');
  const { FATE_MIRROR_BOSS_ID } = require('../../assets/scripts/pve/core/PveConstants') as typeof import('../../assets/scripts/pve/core/PveConstants');

  function makeBoss(hp: number, overrides: Partial<import('../../assets/scripts/pve/core/PveTypes').Monster> = {}) {
    return {
      id: 'boss', type: 'BOSS' as const, bossId: 'FATE_GUARDIAN', pos: { x: 5, y: 5 },
      hp, maxHp: 300, attack: 60, range: 1, aggroRadius: 99, aiState: 'CHASE' as const,
      ...overrides,
    };
  }

  it('杀死镜像不生成传送门（spawnPortal 只看真 Boss）', () => {
    const deadMirror = {
      id: 'mirror_5', type: 'BOSS' as const, bossId: FATE_MIRROR_BOSS_ID, pos: { x: 4, y: 5 },
      hp: 0, maxHp: 50, attack: 30, range: 1, aggroRadius: 99, aiState: 'DEAD' as const,
    };
    const state = makeExpeditionState({
      chapter: 5,
      floorOverrides: {
        size: 10, player: { x: 0, y: 0 }, hasKey: true,
        monsters: [makeBoss(99), deadMirror],
      },
    });
    const result = spawnPortal(state, 'mirror_5');
    expect(result.events).toHaveLength(0);
    expect(result.state.floorState.entities.some((e) => e.type === 'PORTAL')).toBe(false);
  });
});
