import {
  ADVENTURER_STRENGTHEN_DEFS,
  ARCHER_STRENGTHEN_DEFS,
  BERSERKER_STRENGTHEN_DEFS,
  strengthenDef,
} from '../../assets/scripts/pve/core/strengthen/StrengthenCatalog';
import { rollStrengthenOffers } from '../../assets/scripts/pve/core/strengthen/StrengthenOfferSystem';

describe('StrengthenOfferSystem V2', () => {
  it('同seed与状态产生相同候选和rng状态', () => {
    const input = { rngState: 12345, pool: ADVENTURER_STRENGTHEN_DEFS, owned: [] };
    expect(rollStrengthenOffers(input)).toEqual(rollStrengthenOffers(input));
  });

  it('同轮不重复，池充足时排除上一轮候选', () => {
    const first = rollStrengthenOffers({ rngState: 7, pool: ADVENTURER_STRENGTHEN_DEFS, owned: [] });
    const second = rollStrengthenOffers({
      rngState: first.nextRngState,
      pool: ADVENTURER_STRENGTHEN_DEFS,
      owned: [],
      recentOffers: first.choices,
    });
    expect(new Set(first.choices).size).toBe(first.choices.length);
    expect(second.choices.some((id) => first.choices.includes(id))).toBe(false);
  });

  it('每轮最多出现一条特殊词条', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const result = rollStrengthenOffers({ rngState: seed, pool: ADVENTURER_STRENGTHEN_DEFS, owned: [] });
      const specialCount = result.choices.filter((id) => strengthenDef(id)?.kind === 'anomaly').length;
      expect(specialCount).toBeLessThanOrEqual(1);
    }
  });

  it('有可用新词条时至少出现一条未拥有词条', () => {
    const owned = ['strengthen_hp_up', 'strengthen_attack_up'];
    const result = rollStrengthenOffers({ rngState: 88, pool: ADVENTURER_STRENGTHEN_DEFS, owned });
    expect(result.choices.some((id) => !owned.includes(id))).toBe(true);
  });

  it('满层词条从候选中移除', () => {
    const owned = ['strengthen_ap_up', 'strengthen_ap_up'];
    for (let seed = 1; seed <= 50; seed++) {
      const result = rollStrengthenOffers({ rngState: seed, pool: ADVENTURER_STRENGTHEN_DEFS, owned });
      expect(result.choices).not.toContain('strengthen_ap_up');
    }
  });

  it('职业核心需要至少三种基础或战术词条', () => {
    const coreIds = ['deadeye', 'last_arrow'];
    for (let seed = 1; seed <= 100; seed++) {
      const locked = rollStrengthenOffers({ rngState: seed, pool: ARCHER_STRENGTHEN_DEFS, owned: ['eagle_eye', 'crit'] });
      expect(locked.choices.some((id) => coreIds.includes(id))).toBe(false);
    }
    const eligiblePool = ARCHER_STRENGTHEN_DEFS.filter((def) => def.kind === 'core');
    const unlocked = rollStrengthenOffers({
      rngState: 9,
      pool: [...eligiblePool, ...ARCHER_STRENGTHEN_DEFS.filter((def) => ['eagle_eye', 'crit', 'headshot'].includes(def.id))],
      owned: ['eagle_eye', 'crit', 'headshot'],
    });
    expect(unlocked.choices.some((id) => coreIds.includes(id))).toBe(true);
  });

  it('流派词条满足指定前置后才可出现', () => {
    const route = BERSERKER_STRENGTHEN_DEFS.find((def) => def.id === 'berserker_blood_shield')!;
    const fillers = BERSERKER_STRENGTHEN_DEFS.filter((def) => def.kind !== 'route').slice(0, 5);
    const locked = rollStrengthenOffers({ rngState: 2, pool: [route, ...fillers], owned: [] });
    expect(locked.choices).not.toContain(route.id);

    let seen = false;
    for (let seed = 1; seed <= 200; seed++) {
      const result = rollStrengthenOffers({ rngState: seed, pool: [route, ...fillers], owned: ['life_steal'] });
      if (result.choices.includes(route.id)) seen = true;
    }
    expect(seen).toBe(true);
  });
});
