const { createDefaultProfile } = require('../pve/PveProfile');
const {
  manageEquipment,
  saveMinghenPreset,
  synthesizeMinghen,
  settlementMaterialGrants,
  upgradeBag,
} = require('../pve/PveCamp');

function profile(extra = {}) {
  return {
    ...createDefaultProfile(1),
    gold: 100,
    materials: { quenchSand: 20, fusionCore: 5, voidHide: 0 },
    bagCapacity: 25,
    equipmentInventory: [
      { instanceId: 'i1', definitionId: '生锈短刃', quality: 'COMMON', enhanceLevel: 0, locked: false },
    ],
    equipmentLoadout: {},
    ...extra,
  };
}

describe('PveCamp', () => {
  test('locks and enhances equipment with stardust + quench sand', () => {
    let p = manageEquipment(profile(), { action: 'TOGGLE_LOCK', instanceId: 'i1' });
    expect(p.equipmentInventory[0].locked).toBe(true);
    p = manageEquipment(
      { ...p, equipmentInventory: [{ ...p.equipmentInventory[0], locked: false }] },
      { action: 'ENHANCE', instanceId: 'i1' },
    );
    expect(p).toMatchObject({
      gold: 80,
      materials: { quenchSand: 18, fusionCore: 5 },
      equipmentInventory: [{ enhanceLevel: 1 }],
    });
  });

  test('enhance fails when quench sand short', () => {
    expect(() => manageEquipment(
      profile({ materials: { quenchSand: 1, fusionCore: 0 } }),
      { action: 'ENHANCE', instanceId: 'i1' },
    )).toThrow('淬星砂不足');
  });

  test('protects locked and equipped items from sale', () => {
    expect(() => manageEquipment(
      { ...profile(), equipmentInventory: [{ ...profile().equipmentInventory[0], locked: true }] },
      { action: 'SELL', instanceId: 'i1' },
    )).toThrow('锁定装备不能出售');
    expect(() => manageEquipment(
      { ...profile(), equipmentLoadout: { WEAPON: 'i1' } },
      { action: 'SELL', instanceId: 'i1' },
    )).toThrow('已装备物品不能出售');
  });

  test('sale returns stardust plus materials', () => {
    const p = {
      ...profile(),
      equipmentInventory: [{ ...profile().equipmentInventory[0], enhanceLevel: 2, quality: 'RARE' }],
    };
    // invested 20+40=60 → half 30 + RARE base 20 = 50; quench 1+2=3; fusion RARE=1
    expect(manageEquipment(p, { action: 'SELL', instanceId: 'i1' })).toMatchObject({
      gold: 150,
      materials: { quenchSand: 23, fusionCore: 6 },
      equipmentInventory: [],
    });
  });

  test('saves at most five immutable Minghen presets', () => {
    let p = { ...profile(), minghenLoadout: [{ id: 'M01', level: 2 }] };
    p = saveMinghenPreset(p, { id: 'a', name: '流血' });
    expect(p.minghenPresets[0]).toEqual({ id: 'a', name: '流血', entries: [{ id: 'M01', level: 2 }] });
    for (let i = 1; i < 5; i += 1) p = saveMinghenPreset(p, { id: String(i), name: String(i) });
    expect(() => saveMinghenPreset(p, { id: 'overflow', name: 'x' })).toThrow('最多保存5套');
  });

  test('synthesizes three same common gear into one fine spending fusion core', () => {
    const p = {
      ...profile(),
      gold: 100,
      materials: { quenchSand: 0, fusionCore: 2 },
      equipmentInventory: [
        { instanceId: 'a', definitionId: '生锈短刃', quality: 'COMMON', enhanceLevel: 2, locked: false, baseStat: 8 },
        { instanceId: 'b', definitionId: '生锈短刃', quality: 'COMMON', enhanceLevel: 0, locked: false, baseStat: 10 },
        { instanceId: 'c', definitionId: '生锈短刃', quality: 'COMMON', enhanceLevel: 1, locked: false, baseStat: 12 },
      ],
    };
    const next = manageEquipment(p, { action: 'SYNTHESIZE', instanceIds: ['a', 'b', 'c'] });
    expect(next.gold).toBe(90);
    expect(next.materials).toEqual({ quenchSand: 0, fusionCore: 1, voidHide: 0 });
    expect(next.equipmentInventory).toHaveLength(1);
    expect(next.equipmentInventory[0]).toMatchObject({
      definitionId: '生锈短刃', quality: 'FINE', enhanceLevel: 0, locked: false, baseStat: 10,
    });
    expect(next.equipmentInventory[0].instanceId).toMatch(/^synth_/);
  });

  test('synthesize rejects equipped locked legendary and missing core', () => {
    const base = [
      { instanceId: 'a', definitionId: '生锈短刃', quality: 'COMMON', enhanceLevel: 0, locked: false, baseStat: 10 },
      { instanceId: 'b', definitionId: '生锈短刃', quality: 'COMMON', enhanceLevel: 0, locked: false, baseStat: 10 },
      { instanceId: 'c', definitionId: '生锈短刃', quality: 'COMMON', enhanceLevel: 0, locked: false, baseStat: 10 },
    ];
    expect(() => manageEquipment(
      { ...profile(), equipmentInventory: base, equipmentLoadout: { WEAPON: 'a' } },
      { action: 'SYNTHESIZE', instanceIds: ['a', 'b', 'c'] },
    )).toThrow('已装备');
    expect(() => manageEquipment(
      { ...profile(), equipmentInventory: base.map((x, i) => (i === 2 ? { ...x, locked: true } : x)) },
      { action: 'SYNTHESIZE', instanceIds: ['a', 'b', 'c'] },
    )).toThrow('锁定');
    const legend = base.map((x) => ({ ...x, quality: 'LEGENDARY' }));
    expect(() => manageEquipment(
      { ...profile(), equipmentInventory: legend },
      { action: 'SYNTHESIZE', instanceIds: ['a', 'b', 'c'] },
    )).toThrow('传奇');
    expect(() => manageEquipment(
      { ...profile(), materials: { quenchSand: 0, fusionCore: 0 }, equipmentInventory: base },
      { action: 'SYNTHESIZE', instanceIds: ['a', 'b', 'c'] },
    )).toThrow('聚星核不足');
  });

  test('settlementMaterialGrants covers normal elite boss and skips trial', () => {
    expect(settlementMaterialGrants(8, 'PROGRESSION')).toEqual({ quenchSand: 3, fusionCore: 0, voidHide: 0 });
    expect(settlementMaterialGrants(9, 'PROGRESSION')).toEqual({ quenchSand: 4, fusionCore: 1, voidHide: 1 });
    expect(settlementMaterialGrants(14, 'PROGRESSION')).toEqual({ quenchSand: 8, fusionCore: 2, voidHide: 2 });
    expect(settlementMaterialGrants(14, 'TRIAL')).toEqual({ quenchSand: 0, fusionCore: 0, voidHide: 0 });
  });

  test('upgradeBag spends stardust and voidHide', () => {
    const next = upgradeBag({
      ...profile(),
      gold: 200,
      materials: { quenchSand: 0, fusionCore: 0, voidHide: 5 },
      bagCapacity: 25,
    });
    expect(next.bagCapacity).toBe(35);
    expect(next.gold).toBe(80);
    expect(next.materials.voidHide).toBe(2);
  });

  test('upgradeBag rejects max and shortages', () => {
    expect(() => upgradeBag({
      ...profile(),
      bagCapacity: 60,
      gold: 999,
      materials: { quenchSand: 0, fusionCore: 0, voidHide: 99 },
    })).toThrow(/上限|满/);
    expect(() => upgradeBag({
      ...profile(),
      bagCapacity: 25,
      gold: 10,
      materials: { quenchSand: 0, fusionCore: 0, voidHide: 99 },
    })).toThrow(/星尘/);
    expect(() => upgradeBag({
      ...profile(),
      bagCapacity: 25,
      gold: 999,
      materials: { quenchSand: 0, fusionCore: 0, voidHide: 1 },
    })).toThrow(/虚空革/);
  });

  test('synthesizes minghen I to II without spending copies', () => {
    const p = {
      ...profile(),
      minghenCollection: { M01: { id: 'M01', level: 1, copies: 2, trialCompleted: false } },
      minghenLoadout: [],
    };
    const next = synthesizeMinghen(p, { id: 'M01' });
    expect(next.minghenCollection.M01).toMatchObject({ level: 2, copies: 2 });
  });

  test('minghen synthesize rejects equipped short and already II', () => {
    const base = {
      ...profile(),
      minghenCollection: { M01: { id: 'M01', level: 1, copies: 2, trialCompleted: false } },
    };
    expect(() => synthesizeMinghen(
      { ...base, minghenLoadout: [{ id: 'M01', level: 1 }] },
      { id: 'M01' },
    )).toThrow('已装配');
    expect(() => synthesizeMinghen(
      { ...base, minghenCollection: { M01: { id: 'M01', level: 1, copies: 1, trialCompleted: false } } },
      { id: 'M01' },
    )).toThrow('副本不足');
    expect(() => synthesizeMinghen(
      { ...base, minghenCollection: { M01: { id: 'M01', level: 2, copies: 2, trialCompleted: false } } },
      { id: 'M01' },
    )).toThrow('已是II');
  });
});
