import {
  CHAPTER2_FLOORS,
  getChapter2FloorDefinition,
  type Chapter2Coord,
  type Chapter2FloorDefinition,
} from '../../assets/scripts/pve/core/chapter2/Chapter2FloorCatalog';

const key = (p: Chapter2Coord) => `${p.x},${p.y}`;

function isReachable(
  def: Pick<Chapter2FloorDefinition, 'size' | 'fixedWalls'>,
  from: Chapter2Coord,
  to: Chapter2Coord,
): boolean {
  const blocked = new Set(def.fixedWalls.map(key));
  const queue = [from];
  const seen = new Set([key(from)]);
  while (queue.length) {
    const p = queue.shift()!;
    if (p.x === to.x && p.y === to.y) return true;
    for (const n of [
      { x: p.x + 1, y: p.y },
      { x: p.x - 1, y: p.y },
      { x: p.x, y: p.y + 1 },
      { x: p.x, y: p.y - 1 },
    ]) {
      const k = key(n);
      if (n.x < 0 || n.y < 0 || n.x >= def.size || n.y >= def.size || blocked.has(k) || seen.has(k)) continue;
      seen.add(k);
      queue.push(n);
    }
  }
  return false;
}

describe('Chapter2FloorCatalog', () => {
  test('seven chapter-two floors use global keys 8-14', () => {
    expect(Object.keys(CHAPTER2_FLOORS).map(Number).sort((a, b) => a - b)).toEqual([8, 9, 10, 11, 12, 13, 14]);
    expect(getChapter2FloorDefinition(12).objectiveKind).toBe('TIMED_ESCAPE');
    expect(getChapter2FloorDefinition(12).special?.turnLimit).toBe(12);
    expect(getChapter2FloorDefinition(10).special?.sentinelIds).toEqual(['F10_SENTINEL_1', 'F10_SENTINEL_2']);
  });

  test('all floors bind locked metadata and empty optional objectives', () => {
    const locked = {
      8: { name: '沙丘哨站', size: 8, fogMode: 'FULL', objectiveKind: 'KEY_EXPLORE', minghenIds: ['M08', 'M22', 'M09'], equipmentIds: ['铁制长剑', '铁制锁甲', '沙地靴'] },
      9: { name: '毒蝎猎场', size: 8, fogMode: 'FULL', objectiveKind: 'ELITE_HUNT', minghenIds: ['M02', 'M17', 'M15', 'M10'], equipmentIds: ['铁制长矛', '木矛', '皮革头盔'] },
      10: { name: '沙暴警戒', size: 8, fogMode: 'NONE', objectiveKind: 'PURGE', minghenIds: ['M05', 'M03', 'M13'], equipmentIds: ['钝铁斧', '铁制板甲', '铁制战盔'] },
      11: { name: '沙暴追剿', size: 9, fogMode: 'NONE', objectiveKind: 'CHASE', minghenIds: ['M11', 'M12', 'M16', 'M14'], equipmentIds: ['铁战斧', '精制战靴', '聚灵碧玉', '财运挂件'] },
      12: { name: '沙暴走廊', size: 9, fogMode: 'NONE', objectiveKind: 'TIMED_ESCAPE', minghenIds: ['M19', 'M18', 'M20', 'M25'], equipmentIds: ['精钢剑', '精钢板甲', '精制战靴'] },
      13: { name: '流沙潮汐', size: 9, fogMode: 'NONE', objectiveKind: 'WAVE_SURVIVAL', minghenIds: ['M21', 'M23', 'M22', 'M26'], equipmentIds: ['精制轻盔', '灵力宝珠', '铁制长剑', '铁制锁甲', '沙地靴', '铁制长矛', '木矛', '皮革头盔', '钝铁斧', '铁制板甲', '铁制战盔', '铁战斧', '精制战靴', '聚灵碧玉', '财运挂件', '精钢剑', '精钢板甲', '精制战靴'] },
      14: { name: '流沙王座', size: 10, fogMode: 'BOSS_FOG', objectiveKind: 'BOSS', minghenIds: ['M24', 'M01', 'M04'], equipmentIds: ['精钢剑', '精钢板甲', '精制战靴', '精制轻盔', '灵力宝珠'] },
    } as const;
    for (const [floor, expected] of Object.entries(locked)) {
      const d = getChapter2FloorDefinition(Number(floor));
      expect(d.name).toBe(expected.name);
      expect(d.size).toBe(expected.size);
      expect(d.fogMode).toBe(expected.fogMode);
      expect(d.objectiveKind).toBe(expected.objectiveKind);
      expect(d.minghenIds).toEqual([...expected.minghenIds]);
      expect(d.equipmentIds).toEqual([...expected.equipmentIds]);
      expect(d.optionalObjectiveIds).toEqual([]);
    }
  });

  test('KEY_EXPLORE floors do not pre-place EXIT; only TIMED_ESCAPE starts with exit', () => {
    expect(getChapter2FloorDefinition(8).exitCells).toEqual([]);
    expect(getChapter2FloorDefinition(8).objectiveKind).toBe('KEY_EXPLORE');
    expect(getChapter2FloorDefinition(12).exitCells.length).toBeGreaterThan(0);
    expect(getChapter2FloorDefinition(12).objectiveKind).toBe('TIMED_ESCAPE');
  });

  test('special fields match locked chapter-two mechanics', () => {
    expect(getChapter2FloorDefinition(8).special).toMatchObject({ sandPitMovePenalty: 2 });
    expect(getChapter2FloorDefinition(12).special).toMatchObject({
      turnLimit: 12,
      sandstormDamage: 10,
      sandstormCells: 4,
      sandstormIntervalTurns: 2,
    });
    expect(getChapter2FloorDefinition(13).special).toMatchObject({
      waveCount: 4,
      waveRushSteps: 4,
      expandPitsPerWave: 2,
    });
    expect(getChapter2FloorDefinition(14).special?.bossHp).toBeUndefined();
  });

  test.each([8, 9, 10, 11, 12, 13, 14])('floor %i skeleton keeps player and critical cells BFS-reachable', (floor) => {
    const d = getChapter2FloorDefinition(floor);
    const targets = [...d.criticalTargets, ...d.exitCells];
    for (const target of targets) {
      expect(isReachable(d, d.player, target)).toBe(true);
    }
    const occupied = new Set(d.fixedWalls.map((wall) => key(wall)));
    expect(occupied.has(key(d.player))).toBe(false);
    for (const target of d.criticalTargets) {
      expect(occupied.has(key(target))).toBe(false);
    }
  });
});
