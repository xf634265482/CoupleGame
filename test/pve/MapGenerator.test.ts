import { generateFloor } from '../../assets/scripts/pve/core/MapGenerator';
import { isRevealed } from '../../assets/scripts/pve/core/FogSystem';
import { MONSTER_BASE, bossChapterScaling, chapterScaling, mapSizeOfFloor } from '../../assets/scripts/pve/core/PveConstants';
import type { Coord } from '../../assets/scripts/pve/core/PveTypes';

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
