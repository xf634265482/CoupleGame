import {
  ADVENTURER_STRENGTHEN_DEFS,
  ARCHER_STRENGTHEN_DEFS,
  BERSERKER_STRENGTHEN_DEFS,
  ROGUE_STRENGTHEN_DEFS,
  STRENGTHEN_DEFS,
  strengthenDef,
} from '../../assets/scripts/pve/core/strengthen/StrengthenCatalog';

describe('StrengthenCatalog V2', () => {
  it('四个池各20条，总计80个唯一id', () => {
    expect(ADVENTURER_STRENGTHEN_DEFS).toHaveLength(20);
    expect(BERSERKER_STRENGTHEN_DEFS).toHaveLength(20);
    expect(ARCHER_STRENGTHEN_DEFS).toHaveLength(20);
    expect(ROGUE_STRENGTHEN_DEFS).toHaveLength(20);
    expect(STRENGTHEN_DEFS).toHaveLength(80);
    expect(new Set(STRENGTHEN_DEFS.map((def) => def.id)).size).toBe(80);
  });

  it('每条定义都有名称、描述、正权重和合法叠加上限', () => {
    for (const def of STRENGTHEN_DEFS) {
      expect(def.name).not.toBe('');
      expect(def.desc).not.toBe('');
      expect(def.weight).toBeGreaterThan(0);
      expect(def.stack).toBeGreaterThanOrEqual(1);
      expect(strengthenDef(def.id)).toBe(def);
    }
  });

  it('流派前置全部指向同职业池内的已定义词条', () => {
    for (const def of STRENGTHEN_DEFS) {
      for (const id of [...(def.requiresAny ?? []), ...(def.requiresAll ?? [])]) {
        expect(strengthenDef(id)?.classId).toBe(def.classId);
      }
    }
  });
});
