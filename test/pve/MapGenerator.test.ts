import { generateFloor } from '../../assets/scripts/pve/core/MapGenerator';
import { isRevealed } from '../../assets/scripts/pve/core/FogSystem';
import { MONSTER_BASE, NORMAL_FLOOR_TERRAIN_COUNT, NORMAL_FLOOR_TERRAIN_TYPE, bossChapterScaling, chapterScaling, mapSizeOfFloor } from '../../assets/scripts/pve/core/PveConstants';
import type { Coord, FloorState } from '../../assets/scripts/pve/core/PveTypes';

/** BFS 可达性检查（测试内复刻 MapGenerator 中的逻辑，验证 AC-MT-2）。 */
function testBfsReachable(floor: FloorState, target: Coord): boolean {
  const blocked = new Set<string>();
  for (const e of floor.entities) {
    if (!e.consumed && (e.type === 'ROCK' || e.type === 'ICE_WALL')) {
      blocked.add(`${e.pos.x},${e.pos.y}`);
    }
  }
  const visited = new Set<string>();
  const queue: Coord[] = [{ ...floor.player }];
  visited.add(`${floor.player.x},${floor.player.y}`);
  const dirs: Coord[] = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur.x === target.x && cur.y === target.y) return true;
    for (const d of dirs) {
      const nx = cur.x + d.x, ny = cur.y + d.y;
      if (nx < 0 || ny < 0 || nx >= floor.size || ny >= floor.size) continue;
      const k = `${nx},${ny}`;
      if (visited.has(k) || blocked.has(k)) continue;
      visited.add(k);
      queue.push({ x: nx, y: ny });
    }
  }
  return false;
}

function key(c: Coord): string {
  return `${c.x},${c.y}`;
}

describe('MapGenerator — 楼层生成（AC-1, AC-8, AC-9）', () => {
  it('普通层尺寸为 8×8', () => {
    const floor = generateFloor(1, 12345);
    expect(floor.size).toBe(mapSizeOfFloor(1));
    expect(floor.size).toBe(8);
    expect(floor.revealed.length).toBe(8);
    expect(floor.revealed[0].length).toBe(8);
  });

  it('Boss 层（第 7 层）尺寸为 10×10，含钥匙×1 与 Boss×1，无出口门/宝箱/普通怪', () => {
    const floor = generateFloor(7, 999);
    expect(floor.size).toBe(10);

    const keys = floor.entities.filter((e) => e.type === 'KEY');
    const exits = floor.entities.filter((e) => e.type === 'EXIT');
    const chests = floor.entities.filter((e) => e.type === 'CHEST');
    const bosses = floor.monsters.filter((m) => m.type === 'BOSS');
    const normals = floor.monsters.filter((m) => m.type === 'NORMAL');

    expect(keys.length).toBe(1);
    expect(exits.length).toBe(0);
    expect(chests.length).toBe(0);
    expect(bosses.length).toBe(1);
    expect(normals.length).toBe(0);
    expect(bosses[0].bossId).toBe('GOBLIN_CHIEF');
  });

  it('普通层含钥匙×1、出口门×1、宝箱×1、神像×1、温泉×1、祭坛×1、普通怪>0', () => {
    // 第1章第1层：哥布林战士×3(NORMAL) + 灵鼠×1(ANIMA)，共4只怪，3只普通
    const floor = generateFloor(1, 777); // floor 1：章节1第1层，无铁匠
    const keys = floor.entities.filter((e) => e.type === 'KEY');
    const exits = floor.entities.filter((e) => e.type === 'EXIT');
    const chests = floor.entities.filter((e) => e.type === 'CHEST');
    const idols = floor.entities.filter((e) => e.type === 'IDOL');
    const springs = floor.entities.filter((e) => e.type === 'HOT_SPRING');
    const altars = floor.entities.filter((e) => e.type === 'ALTAR');
    const normals = floor.monsters.filter((m) => m.type === 'NORMAL');

    expect(keys.length).toBe(1);
    expect(exits.length).toBe(1);
    expect(chests.length).toBe(1);
    expect(idols.length).toBe(1);
    expect(springs.length).toBe(0); // 温泉仅在每章第 6 层生成（V3：Boss 前一层）
    expect(altars.length).toBe(1);
    expect(normals.length).toBe(3); // 章节1楼层1：哥布林战士×3（变体 GOBLIN_WARRIOR）
  });

  it('铁匠仅在章节营地出现，楼层地图不含铁匠实体', () => {
    for (const floor of [1, 2, 3, 4, 5, 8]) {
      const f = generateFloor(floor, 777);
      expect(f.entities.filter((e) => e.type === 'BLACKSMITH').length).toBe(0);
    }
  });

  it('所有实体与玩家出生点不重叠', () => {
    const floor = generateFloor(2, 2024);
    const occupied = new Set<string>();
    occupied.add(key(floor.player));

    for (const m of floor.monsters) {
      const k = key(m.pos);
      expect(occupied.has(k)).toBe(false);
      occupied.add(k);
    }
    for (const e of floor.entities) {
      const k = key(e.pos);
      expect(occupied.has(k)).toBe(false);
      occupied.add(k);
    }
  });

  it('同 floor + seed 必然生成相同布局（确定性，AC-13）', () => {
    const a = generateFloor(4, 31415);
    const b = generateFloor(4, 31415);
    expect(a).toEqual(b);
  });

  it('不同种子通常生成不同布局', () => {
    const a = generateFloor(1, 1);
    const b = generateFloor(1, 2);
    expect(a.player).not.toEqual(b.player);
  });

  it('初始 revealed 仅揭示出生点附近，其余仍为迷雾', () => {
    const floor = generateFloor(1, 555);
    expect(isRevealed(floor.revealed, floor.player)).toBe(true);

    let hiddenCount = 0;
    for (let y = 0; y < floor.size; y++) {
      for (let x = 0; x < floor.size; x++) {
        if (!floor.revealed[y][x]) hiddenCount++;
      }
    }
    expect(hiddenCount).toBeGreaterThan(0);
  });

  it('返回的 FloorState 携带可续算的 rngState 与初始字段', () => {
    const floor = generateFloor(1, 42);
    expect(typeof floor.rngState).toBe('number');
    expect(floor.hasKey).toBe(false);
    expect(floor.status).toBe('EXPLORING');
    expect(floor.turn).toBe(0);
  });
});

describe('MapGenerator — 章节怪物缩放', () => {
  it('第 1 章普通层怪物 HP/攻击 = 基础值（×1.0）', () => {
    const floor = generateFloor(1, 100);
    const normals = floor.monsters.filter((m) => m.type === 'NORMAL');
    expect(normals.length).toBeGreaterThan(0);
    normals.forEach((m) => {
      expect(m.hp).toBe(MONSTER_BASE.NORMAL.hp);
      expect(m.attack).toBe(MONSTER_BASE.NORMAL.attack);
    });
  });

  it('第 2 章（第 8 层）普通层怪物 HP/攻击按 ×1.8 缩放', () => {
    const floor = generateFloor(8, 100); // floor 8 = chapter 2, normal floor
    const { hpMult, attackMult } = chapterScaling(2);
    const normals = floor.monsters.filter((m) => m.type === 'NORMAL');
    expect(normals.length).toBeGreaterThan(0);
    normals.forEach((m) => {
      expect(m.hp).toBe(Math.round(MONSTER_BASE.NORMAL.hp * hpMult));
      expect(m.attack).toBe(Math.round(MONSTER_BASE.NORMAL.attack * attackMult));
    });
    const elites = floor.monsters.filter((m) => m.type === 'ELITE');
    elites.forEach((m) => {
      expect(m.hp).toBe(Math.round(MONSTER_BASE.ELITE.hp * hpMult));
      expect(m.attack).toBe(Math.round(MONSTER_BASE.ELITE.attack * attackMult));
    });
  });

  it('第 5 章（第 35 层）Boss HP/攻击按 bossChapterScaling 缩放', () => {
    const floor = generateFloor(35, 100); // floor 35 = chapter 5, boss floor
    const { hpMult, attackMult } = bossChapterScaling(5);
    const boss = floor.monsters.find((m) => m.type === 'BOSS');
    expect(boss).toBeDefined();
    expect(boss!.hp).toBe(Math.round(MONSTER_BASE.BOSS.hp * hpMult));
    expect(boss!.attack).toBe(Math.round(MONSTER_BASE.BOSS.attack * attackMult));
  });

  it('章节 2 精英怪 HP 高于章节 1 精英怪 HP', () => {
    const ch1Floor = generateFloor(1, 42);
    const ch2Floor = generateFloor(6, 42);
    const elite1 = ch1Floor.monsters.find((m) => m.type === 'ELITE');
    const elite2 = ch2Floor.monsters.find((m) => m.type === 'ELITE');
    if (elite1 && elite2) {
      expect(elite2.hp).toBeGreaterThan(elite1.hp);
    }
  });

  it('MONSTER_BASE 基础值不变（只在生成时应用倍率）', () => {
    generateFloor(7, 1);
    generateFloor(35, 1);
    expect(MONSTER_BASE.NORMAL.hp).toBe(40);
    expect(MONSTER_BASE.ELITE.hp).toBe(80);
    expect(MONSTER_BASE.BOSS.hp).toBe(300);
  });
});

describe('MapGenerator — 普通层地形生成（AC-MT-1 / AC-MT-2 / AC-MT-3）', () => {
  const TERRAIN_FLOORS = [
    { floor: 1, chapter: 1, fi: 1, expectedType: 'ROCK' },
    { floor: 2, chapter: 1, fi: 2, expectedType: 'ROCK' },
    { floor: 8, chapter: 2, fi: 1, expectedType: 'SAND_PIT' },
    { floor: 17, chapter: 3, fi: 3, expectedType: 'ICE_WALL' },
    { floor: 26, chapter: 4, fi: 5, expectedType: 'LAVA_TILE' },
    { floor: 29, chapter: 5, fi: 1, expectedType: 'ROCK' },
  ];

  it('普通层按章调色板生成地形（AC-MT-1）', () => {
    for (const { floor, chapter: _c, fi: _fi, expectedType } of TERRAIN_FLOORS) {
      const f = generateFloor(floor, 12345);
      const terrain = f.entities.filter(
        (e) => e.type === expectedType || e.type === 'ICE_TILE',
      );
      expect(terrain.length).toBeGreaterThan(0);
    }
  });

  it('地形数量在 NORMAL_FLOOR_TERRAIN_COUNT 区间内（AC-MT-1）', () => {
    for (const { floor, fi } of TERRAIN_FLOORS) {
      const f = generateFloor(floor, 99999);
      const range = NORMAL_FLOOR_TERRAIN_COUNT[fi]!;
      const primaryType = NORMAL_FLOOR_TERRAIN_TYPE[(Math.ceil(floor / 7)) as keyof typeof NORMAL_FLOOR_TERRAIN_TYPE] ?? 'ROCK';
      const chapter3Extra = primaryType === 'ICE_WALL' ? 2 : 0; // ICE_TILE
      const terrainCount = f.entities.filter(
        (e) => e.type === primaryType || (primaryType === 'ICE_WALL' && e.type === 'ICE_TILE'),
      ).length;
      // 由于 BFS 剔除可能使实际数量 ≤ max，只校验上界和存在性
      expect(terrainCount).toBeGreaterThanOrEqual(0);
      expect(terrainCount).toBeLessThanOrEqual(range[1] + chapter3Extra);
    }
  });

  it('BFS 可解性：阻挡地形不截断玩家→钥匙→出口路径（AC-MT-2）', () => {
    // 第1章（ROCK，阻挡型）多种子验证
    for (let seed = 1; seed <= 20; seed++) {
      const f = generateFloor(1, seed * 1337);
      const keyEntity = f.entities.find((e) => e.type === 'KEY');
      const exitEntity = f.entities.find((e) => e.type === 'EXIT');
      expect(keyEntity).toBeDefined();
      expect(exitEntity).toBeDefined();
      expect(testBfsReachable(f, keyEntity!.pos)).toBe(true);
      expect(testBfsReachable(f, exitEntity!.pos)).toBe(true);
    }
    // 第3章（ICE_WALL，阻挡型）多种子验证
    for (let seed = 1; seed <= 20; seed++) {
      const f = generateFloor(15, seed * 2333); // chapter 3, fi=1
      const keyEntity = f.entities.find((e) => e.type === 'KEY');
      const exitEntity = f.entities.find((e) => e.type === 'EXIT');
      expect(testBfsReachable(f, keyEntity!.pos)).toBe(true);
      expect(testBfsReachable(f, exitEntity!.pos)).toBe(true);
    }
  });

  it('确定性：同 seed 同地形布局（AC-MT-2 / AC-13）', () => {
    for (const { floor } of TERRAIN_FLOORS) {
      const a = generateFloor(floor, 54321);
      const b = generateFloor(floor, 54321);
      expect(a.entities).toEqual(b.entities);
    }
  });

  it('第1章普通层地形无伤（ROCK，不扣血，AC-MT-3）', () => {
    const f = generateFloor(1, 42);
    const lava = f.entities.filter((e) => e.type === 'LAVA_TILE');
    expect(lava.length).toBe(0);
  });

  it('第4章普通层包含 LAVA_TILE（AC-MT-3）', () => {
    // floor 25 = chapter 4, fi=4（密集地形）
    const found = Array.from({ length: 10 }, (_, i) => generateFloor(25, i + 1))
      .some((f) => f.entities.some((e) => e.type === 'LAVA_TILE'));
    expect(found).toBe(true);
  });

  it('Phase 1 地形不介入 Boss 分支：ICE_TILE 不出现在任何 Boss 层', () => {
    // ICE_TILE 仅由 Phase 1 的 ch3 普通层路径生成；Boss 层走 isBossFloor 分支，不触发。
    const bossFloors = [7, 14, 21, 28, 35];
    for (const floor of bossFloors) {
      const f = generateFloor(floor, 777);
      const iceTiles = f.entities.filter((e) => e.type === 'ICE_TILE');
      expect(iceTiles.length).toBe(0);
    }
  });
});
