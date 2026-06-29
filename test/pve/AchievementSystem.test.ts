import {
  ACHIEVEMENT_DEFS,
  checkNewAchievements,
  collectCodexEntries,
  findAchievement,
} from '../../assets/scripts/pve/core/AchievementSystem';
import type { PveEvent } from '../../assets/scripts/pve/core/PveTypes';

// ── 成就配置 ──────────────────────────────────────────────

describe('AchievementSystem — 成就定义', () => {
  it('共定义 8 个成就', () => {
    expect(ACHIEVEMENT_DEFS).toHaveLength(8);
  });

  it('所有成就有非空 id / name / desc', () => {
    ACHIEVEMENT_DEFS.forEach((d) => {
      expect(d.id).toBeTruthy();
      expect(d.name).toBeTruthy();
      expect(d.desc).toBeTruthy();
    });
  });

  it('findAchievement 按 id 查找正确', () => {
    const def = findAchievement('FIRST_KILL');
    expect(def).toBeDefined();
    expect(def?.name).toBeTruthy();
  });

  it('findAchievement 未知 id 返回 undefined', () => {
    expect(findAchievement('DOES_NOT_EXIST')).toBeUndefined();
  });
});

// ── checkNewAchievements ──────────────────────────────────

/** 快捷构造事件 */
const ev = {
  apRolled: (turn = 1): PveEvent => ({ type: 'AP_ROLLED', turn, dice: 3, ap: 11 }),
  kill: (): PveEvent => ({ type: 'KILL', monsterId: 'm1', monsterType: 'NORMAL' }),
  openChest: (): PveEvent => ({ type: 'OPEN_CHEST', entityId: 'c1' }),
  lootEquip: (): PveEvent => ({
    type: 'LOOT',
    source: 'c1',
    equip: { id: 'e1', slot: 'WEAPON', quality: 'COMMON', name: '短剑', baseStat: 1 },
  }),
  classAdvanced: (): PveEvent => ({ type: 'CLASS_ADVANCED', classId: 'BERSERKER', hpCost: 2 }),
  floorCleared: (floor: number): PveEvent => ({ type: 'FLOOR_CLEARED', floor }),
};

describe('checkNewAchievements — 触发条件', () => {
  const NONE: string[] = [];

  it('FIRST_EXPEDITION：第1层第1回合 AP_ROLLED 触发', () => {
    const result = checkNewAchievements([ev.apRolled(1)], 1, NONE);
    expect(result).toContain('FIRST_EXPEDITION');
  });

  it('FIRST_EXPEDITION：非第1层不触发', () => {
    const result = checkNewAchievements([ev.apRolled(1)], 2, NONE);
    expect(result).not.toContain('FIRST_EXPEDITION');
  });

  it('FIRST_EXPEDITION：非第1回合不触发', () => {
    const result = checkNewAchievements([ev.apRolled(2)], 1, NONE);
    expect(result).not.toContain('FIRST_EXPEDITION');
  });

  it('FIRST_KILL：KILL 事件触发', () => {
    const result = checkNewAchievements([ev.kill()], 1, NONE);
    expect(result).toContain('FIRST_KILL');
  });

  it('FIRST_CHEST：OPEN_CHEST 事件触发', () => {
    const result = checkNewAchievements([ev.openChest()], 1, NONE);
    expect(result).toContain('FIRST_CHEST');
  });

  it('FIRST_EQUIPMENT：LOOT 含 equip 字段触发', () => {
    const result = checkNewAchievements([ev.lootEquip()], 1, NONE);
    expect(result).toContain('FIRST_EQUIPMENT');
  });

  it('FIRST_EQUIPMENT：LOOT 无 equip 字段不触发', () => {
    const noEquip: PveEvent = { type: 'LOOT', source: 'm1', gold: 5 };
    const result = checkNewAchievements([noEquip], 1, NONE);
    expect(result).not.toContain('FIRST_EQUIPMENT');
  });

  it('CLASS_ADVANCED：CLASS_ADVANCED 事件触发', () => {
    const result = checkNewAchievements([ev.classAdvanced()], 1, NONE);
    expect(result).toContain('CLASS_ADVANCED');
  });

  it('CHAPTER_1_CLEARED：FLOOR_CLEARED floor=7 触发', () => {
    const result = checkNewAchievements([ev.floorCleared(7)], 7, NONE);
    expect(result).toContain('CHAPTER_1_CLEARED');
  });

  it('CHAPTER_1_CLEARED：FLOOR_CLEARED floor=6 不触发', () => {
    const result = checkNewAchievements([ev.floorCleared(6)], 6, NONE);
    expect(result).not.toContain('CHAPTER_1_CLEARED');
  });

  it('REACH_FLOOR_10：floor ≥ 10 时 AP_ROLLED 触发', () => {
    const result = checkNewAchievements([ev.apRolled(1)], 10, NONE);
    expect(result).toContain('REACH_FLOOR_10');
  });

  it('REACH_FLOOR_10：floor = 9 不触发', () => {
    const result = checkNewAchievements([ev.apRolled(1)], 9, NONE);
    expect(result).not.toContain('REACH_FLOOR_10');
  });

  it('FULL_CLEAR：FLOOR_CLEARED floor=35 触发', () => {
    const result = checkNewAchievements([ev.floorCleared(35)], 35, NONE);
    expect(result).toContain('FULL_CLEAR');
  });
});

describe('checkNewAchievements — 去重与过滤', () => {
  it('已解锁的成就不重复返回', () => {
    const alreadyUnlocked = ['FIRST_KILL', 'FIRST_CHEST'];
    const result = checkNewAchievements([ev.kill(), ev.openChest()], 1, alreadyUnlocked);
    expect(result).not.toContain('FIRST_KILL');
    expect(result).not.toContain('FIRST_CHEST');
  });

  it('同一批事件中的多个新成就都返回', () => {
    const result = checkNewAchievements(
      [ev.kill(), ev.openChest(), ev.lootEquip()],
      1,
      [],
    );
    expect(result).toContain('FIRST_KILL');
    expect(result).toContain('FIRST_CHEST');
    expect(result).toContain('FIRST_EQUIPMENT');
  });

  it('空事件列表返回空数组', () => {
    expect(checkNewAchievements([], 1, [])).toEqual([]);
  });

  it('无新成就返回空数组', () => {
    const alreadyAll = ACHIEVEMENT_DEFS.map((d) => d.id);
    const result = checkNewAchievements(
      [ev.kill(), ev.openChest(), ev.floorCleared(35)],
      35,
      alreadyAll,
    );
    expect(result).toEqual([]);
  });
});

// ── collectCodexEntries ───────────────────────────────────

describe('collectCodexEntries — 图鉴条目提取', () => {
  it('从 KILL 事件提取怪物类型', () => {
    const events: PveEvent[] = [
      { type: 'KILL', monsterId: 'm1', monsterType: 'NORMAL' },
      { type: 'KILL', monsterId: 'm2', monsterType: 'ELITE' },
    ];
    const { monsters } = collectCodexEntries(events);
    expect(monsters).toContain('NORMAL');
    expect(monsters).toContain('ELITE');
    expect(monsters).toHaveLength(2);
  });

  it('从含 equip 的 LOOT 事件提取装备槽位', () => {
    const events: PveEvent[] = [
      {
        type: 'LOOT',
        source: 'e1',
        equip: { id: 'eq1', slot: 'ARMOR', quality: 'FINE', name: '铁甲', baseStat: 2 },
      },
    ];
    const { equipment } = collectCodexEntries(events);
    expect(equipment).toContain('ARMOR');
  });

  it('LOOT 无 equip 字段不产生装备条目', () => {
    const events: PveEvent[] = [{ type: 'LOOT', source: 'm1', gold: 10 }];
    const { equipment } = collectCodexEntries(events);
    expect(equipment).toHaveLength(0);
  });

  it('空事件列表返回空数组', () => {
    const { monsters, equipment } = collectCodexEntries([]);
    expect(monsters).toHaveLength(0);
    expect(equipment).toHaveLength(0);
  });

  it('混合事件：只提取 KILL 和含 equip 的 LOOT', () => {
    const events: PveEvent[] = [
      { type: 'MOVE', entityId: 'PLAYER', from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, apLeft: 8 },
      { type: 'KILL', monsterId: 'm1', monsterType: 'BOSS' },
      { type: 'LOOT', source: 'm1', gold: 50 },
      {
        type: 'LOOT',
        source: 'chest1',
        equip: { id: 'eq1', slot: 'WEAPON', quality: 'RARE', name: '精良剑', baseStat: 3 },
      },
    ];
    const { monsters, equipment } = collectCodexEntries(events);
    expect(monsters).toEqual(['BOSS']);
    expect(equipment).toEqual(['WEAPON']);
  });
});
