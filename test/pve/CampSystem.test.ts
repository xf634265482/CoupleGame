import { applySellEquip, applyShopBuy, CAMP_SHOP_ITEMS, getCampShopItems, openRelicChest, SELL_PRICE } from '../../assets/scripts/pve/core/CampSystem';
import { EMPTY_TREE_BONUSES } from '../../assets/scripts/pve/core/DestinyTreeSystem';
import { RELIC_CHEST } from '../../assets/scripts/pve/core/PveConstants';
import { makeExpeditionState, makeRunPlayer } from './helpers';

// ── 夹具辅助 ─────────────────────────────────────────────

function makeState(overrides: Parameters<typeof makeRunPlayer>[0] = {}) {
  return makeExpeditionState({ playerOverrides: overrides });
}

// ── CAMP_SHOP_ITEMS 配置测试 ──────────────────────────────

describe('CampSystem — 商店配置', () => {
  it('CAMP_SHOP_ITEMS 包含 HEAL_FULL 和 BUFF_MAX_HP 两项', () => {
    const ids = CAMP_SHOP_ITEMS.map((i) => i.id);
    expect(ids).toContain('HEAL_FULL');
    expect(ids).toContain('BUFF_MAX_HP');
  });

  it('所有商品 cost > 0', () => {
    CAMP_SHOP_ITEMS.forEach((item) => {
      expect(item.cost).toBeGreaterThan(0);
    });
  });

  it('所有商品有 name 和 desc 字段', () => {
    CAMP_SHOP_ITEMS.forEach((item) => {
      expect(item.name).toBeTruthy();
      expect(item.desc).toBeTruthy();
    });
  });

  it('C4 商路嗅觉让展示价格与实际扣款同时降低 10%', () => {
    const treeBonuses = { ...EMPTY_TREE_BONUSES, campShopDiscountPct: 0.1 };
    const state = makeState({ hp: 10, maxHp: 20, gold: 27, treeBonuses });
    expect(getCampShopItems(state.player).find((item) => item.id === 'HEAL_FULL')?.cost).toBe(27);

    const result = applyShopBuy(state, 'HEAL_FULL');
    expect(result.state.player.gold).toBe(0);
    expect(result.events[0]).toEqual(expect.objectContaining({ type: 'SHOP_BUY', cost: 27 }));
  });
});

// ── HEAL_FULL 购买逻辑 ────────────────────────────────────

describe('CampSystem — HEAL_FULL（完全治疗）', () => {
  const COST = CAMP_SHOP_ITEMS.find((i) => i.id === 'HEAL_FULL')!.cost;

  it('HP 不满时购买成功：HP 回满，金币扣减，产生 SHOP_BUY 事件', () => {
    const state = makeState({ hp: 10, maxHp: 20, gold: COST + 10 });
    const result = applyShopBuy(state, 'HEAL_FULL');

    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('SHOP_BUY');
    if (result.events[0].type === 'SHOP_BUY') {
      expect(result.events[0].itemId).toBe('HEAL_FULL');
      expect(result.events[0].cost).toBe(COST);
      expect(result.events[0].effect).toBeTruthy();
    }
    expect(result.state.player.hp).toBe(20);
    expect(result.state.player.gold).toBe(COST + 10 - COST);
  });

  it('HP 已满时 no-op（events 为空）', () => {
    const state = makeState({ hp: 20, maxHp: 20, gold: 100 });
    const result = applyShopBuy(state, 'HEAL_FULL');
    expect(result.events).toHaveLength(0);
    expect(result.state).toBe(state);
  });

  it('金币不足时 no-op', () => {
    const state = makeState({ hp: 5, maxHp: 20, gold: COST - 1 });
    const result = applyShopBuy(state, 'HEAL_FULL');
    expect(result.events).toHaveLength(0);
    expect(result.state).toBe(state);
  });

  it('金币恰好够 COST 时可成功购买', () => {
    const state = makeState({ hp: 1, maxHp: 20, gold: COST });
    const result = applyShopBuy(state, 'HEAL_FULL');
    expect(result.events).toHaveLength(1);
    expect(result.state.player.gold).toBe(0);
  });

  it('不修改其他 player 字段（classTraits / equipment 等）', () => {
    const state = makeState({ hp: 10, maxHp: 20, gold: 100, classTraits: ['crit', 'backstab'] });
    const result = applyShopBuy(state, 'HEAL_FULL');
    expect(result.state.player.classTraits).toEqual(['crit', 'backstab']);
    expect(result.state.player.classId).toBe(state.player.classId);
  });
});

// ── BUFF_MAX_HP 购买逻辑 ──────────────────────────────────

describe('CampSystem — BUFF_MAX_HP（强化体魄）', () => {
  const COST = CAMP_SHOP_ITEMS.find((i) => i.id === 'BUFF_MAX_HP')!.cost;

  it('购买成功：maxHp +40，HP 也 +40（不超过新 maxHp）', () => {
    const state = makeState({ hp: 150, maxHp: 200, gold: COST + 5 });
    const result = applyShopBuy(state, 'BUFF_MAX_HP');

    expect(result.events).toHaveLength(1);
    expect(result.state.player.maxHp).toBe(240);
    expect(result.state.player.hp).toBe(190); // 150 + 40 = 190 ≤ 240
    expect(result.state.player.gold).toBe(5);
  });

  it('HP + 40 不超过新 maxHp（HP 接近满时）', () => {
    // hp=180, maxHp=200 → 购买后 maxHp=240, hp=min(180+40,240)=220
    const state = makeState({ hp: 180, maxHp: 200, gold: COST });
    const result = applyShopBuy(state, 'BUFF_MAX_HP');
    expect(result.state.player.maxHp).toBe(240);
    expect(result.state.player.hp).toBe(220);
  });

  it('HP 满时购买：maxHp +40，HP 也增加 40', () => {
    // hp=maxHp=200 → 购买后 maxHp=240, hp=min(200+40,240)=240
    const state = makeState({ hp: 200, maxHp: 200, gold: COST });
    const result = applyShopBuy(state, 'BUFF_MAX_HP');
    expect(result.state.player.maxHp).toBe(240);
    expect(result.state.player.hp).toBe(240);
  });

  it('金币不足时 no-op', () => {
    const state = makeState({ hp: 10, maxHp: 20, gold: COST - 1 });
    const result = applyShopBuy(state, 'BUFF_MAX_HP');
    expect(result.events).toHaveLength(0);
    expect(result.state).toBe(state);
  });

  it('SHOP_BUY 事件携带正确的 cost 和 effect', () => {
    const state = makeState({ hp: 10, maxHp: 20, gold: COST });
    const result = applyShopBuy(state, 'BUFF_MAX_HP');
    const ev = result.events[0];
    expect(ev.type).toBe('SHOP_BUY');
    if (ev.type === 'SHOP_BUY') {
      expect(ev.cost).toBe(COST);
      expect(ev.effect).toMatch(/HP/i);
    }
  });
});

// ── 多次购买（连续消费）────────────────────────────────────

describe('CampSystem — 连续购买', () => {
  it('先买 BUFF_MAX_HP 再买 HEAL_FULL：两次均成功', () => {
    const healCost = CAMP_SHOP_ITEMS.find((i) => i.id === 'HEAL_FULL')!.cost;
    const buffCost = CAMP_SHOP_ITEMS.find((i) => i.id === 'BUFF_MAX_HP')!.cost;
    const totalCost = healCost + buffCost;

    const state = makeState({ hp: 10, maxHp: 20, gold: totalCost });
    const r1 = applyShopBuy(state, 'BUFF_MAX_HP');
    // r1: maxHp=24, hp=14, gold=totalCost-buffCost=healCost
    expect(r1.events).toHaveLength(1);

    // HP 不满（14<24），可以购买治疗
    const r2 = applyShopBuy(r1.state, 'HEAL_FULL');
    expect(r2.events).toHaveLength(1);
    expect(r2.state.player.hp).toBe(r2.state.player.maxHp); // HP 回满
    expect(r2.state.player.gold).toBe(0);
  });

  it('购买后不影响 floorState（只改 player）', () => {
    const cost = CAMP_SHOP_ITEMS.find((i) => i.id === 'BUFF_MAX_HP')!.cost;
    const state = makeState({ gold: cost });
    const result = applyShopBuy(state, 'BUFF_MAX_HP');
    expect(result.state.floorState).toBe(state.floorState); // 同一引用
  });
});

// ── 无效 itemId 防御性处理（通过类型断言测试边界）────────

describe('CampSystem — 防御性校验', () => {
  it('无效 itemId 返回 no-op', () => {
    const state = makeState({ gold: 999 });
    // @ts-expect-error 故意传无效 id 测试防御逻辑
    const result = applyShopBuy(state, 'UNKNOWN_ITEM');
    expect(result.events).toHaveLength(0);
    expect(result.state).toBe(state);
  });
});

// ── applySellEquip（装备整理）────────────────────────────────

const WEAPON_ITEM = { id: 'w1', slot: 'WEAPON' as const, quality: 'FINE' as const, name: '精良剑', baseStat: 2 };
const ARMOR_ITEM  = { id: 'a1', slot: 'ARMOR'  as const, quality: 'RARE' as const, name: '稀有甲', baseStat: 3 };

describe('CampSystem — applySellEquip（变卖装备）', () => {
  it('SELL_PRICE 表覆盖全部 5 种品质', () => {
    const qualities = ['COMMON', 'FINE', 'RARE', 'EPIC', 'LEGENDARY'] as const;
    qualities.forEach((q) => {
      expect(SELL_PRICE[q]).toBeGreaterThan(0);
    });
    // 品质越高价格越贵
    expect(SELL_PRICE.COMMON).toBeLessThan(SELL_PRICE.FINE);
    expect(SELL_PRICE.FINE).toBeLessThan(SELL_PRICE.RARE);
    expect(SELL_PRICE.RARE).toBeLessThan(SELL_PRICE.EPIC);
    expect(SELL_PRICE.EPIC).toBeLessThan(SELL_PRICE.LEGENDARY);
  });

  it('变卖有装备的槽位：移除装备，增加金币，产生 SELL_EQUIP 事件', () => {
    const state = makeExpeditionState({
      playerOverrides: { gold: 10, equipment: { WEAPON: WEAPON_ITEM } },
    });
    const result = applySellEquip(state, 'WEAPON');

    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('SELL_EQUIP');
    if (result.events[0].type === 'SELL_EQUIP') {
      expect(result.events[0].slot).toBe('WEAPON');
      expect(result.events[0].itemName).toBe('精良剑');
      expect(result.events[0].gold).toBe(SELL_PRICE.FINE);
    }
    expect(result.state.player.equipment.WEAPON).toBeUndefined();
    expect(result.state.player.gold).toBe(10 + SELL_PRICE.FINE);
  });

  it('变卖空槽位：no-op', () => {
    const state = makeExpeditionState({ playerOverrides: { gold: 10, equipment: {} } });
    const result = applySellEquip(state, 'HELMET');
    expect(result.events).toHaveLength(0);
    expect(result.state).toBe(state);
  });

  it('变卖后只移除目标槽位，其他槽位装备不变', () => {
    const state = makeExpeditionState({
      playerOverrides: { equipment: { WEAPON: WEAPON_ITEM, ARMOR: ARMOR_ITEM } },
    });
    const result = applySellEquip(state, 'WEAPON');
    expect(result.state.player.equipment.WEAPON).toBeUndefined();
    expect(result.state.player.equipment.ARMOR).toEqual(ARMOR_ITEM);
  });

  it('RARE 品质装备变卖价格正确', () => {
    const state = makeExpeditionState({
      playerOverrides: { gold: 0, equipment: { ARMOR: ARMOR_ITEM } },
    });
    const result = applySellEquip(state, 'ARMOR');
    expect(result.state.player.gold).toBe(SELL_PRICE.RARE);
  });

  it('变卖不影响 floorState', () => {
    const state = makeExpeditionState({ playerOverrides: { equipment: { WEAPON: WEAPON_ITEM } } });
    const result = applySellEquip(state, 'WEAPON');
    expect(result.state.floorState).toBe(state.floorState);
  });
});

// ── 营地遗物宝箱（design Boss设计V1）─────────────────────────

describe('CampSystem — openRelicChest（遗物宝箱）', () => {
  function richState(chapter: number, relics: string[] = []) {
    return makeExpeditionState({
      chapter,
      playerOverrides: { gold: RELIC_CHEST.COST_GOLD + 100, relics: relics as never },
    });
  }

  it('金币不足时 no-op（不扣资源，不 emit）', () => {
    const state = makeExpeditionState({ chapter: 1, playerOverrides: { gold: 100 } });
    const result = openRelicChest(state, RELIC_CHEST.COST_DIAMOND);
    expect(result.state).toBe(state);
    expect(result.events).toEqual([]);
    expect(result.diamondDelta).toBe(0);
  });

  it('钻石不足时 no-op', () => {
    const state = richState(1);
    const result = openRelicChest(state, 10);
    expect(result.state).toBe(state);
    expect(result.events).toEqual([]);
    expect(result.diamondDelta).toBe(0);
  });

  it('扣金币 + diamondDelta 携带钻石扣减', () => {
    const state = richState(1);
    const result = openRelicChest(state, RELIC_CHEST.COST_DIAMOND);
    expect(result.state.player.gold).toBeLessThan(state.player.gold);
    // 命中（10%）时金币可能因「已持有补偿」回流，但本次未持有的话只扣不退
    // 至少：扣了 COST_GOLD，最多回流 0（未中或拾取新遗物）
    const goldSpentNet = state.player.gold - result.state.player.gold;
    expect(goldSpentNet).toBeGreaterThanOrEqual(0);
    expect(goldSpentNet).toBeLessThanOrEqual(RELIC_CHEST.COST_GOLD);
    // 钻石至少扣了 COST_DIAMOND（可能因「已持有补偿」部分退还）
    expect(result.diamondDelta).toBeLessThanOrEqual(-Math.ceil(RELIC_CHEST.COST_DIAMOND * (1 - RELIC_CHEST.REFUND_PCT)));
    expect(result.diamondDelta).toBeGreaterThanOrEqual(-RELIC_CHEST.COST_DIAMOND);
  });

  it('emit RELIC_CHEST_OPENED 事件', () => {
    const state = richState(1);
    const result = openRelicChest(state, RELIC_CHEST.COST_DIAMOND);
    const ev = result.events.find((e) => e.type === 'RELIC_CHEST_OPENED');
    expect(ev).toBeDefined();
  });

  it('章节绑定：第 2 章营地宝箱只能开 QUICKSAND_HEART', () => {
    // 取多次样本，所有"中奖"的 relicId 都应是 QUICKSAND_HEART
    let opened: string | undefined;
    for (let seed = 1; seed <= 50; seed++) {
      const state = makeExpeditionState({
        seed,
        chapter: 2,
        playerOverrides: { gold: RELIC_CHEST.COST_GOLD + 100 },
      });
      const result = openRelicChest(state, RELIC_CHEST.COST_DIAMOND);
      const ev = result.events.find((e) => e.type === 'RELIC_CHEST_OPENED');
      if (ev?.type === 'RELIC_CHEST_OPENED' && ev.success && ev.relicId) {
        opened = ev.relicId;
        break;
      }
    }
    expect(opened).toBe('QUICKSAND_HEART');
  });

  it('已持有该遗物时，命中开出 → 30% 资源返还（refunded=true）', () => {
    // 找一个会命中的种子（10% 概率，多取几个种子保证）
    let refundedEv: { refundGold?: number; refundDiamond?: number } | undefined;
    for (let seed = 1; seed <= 200; seed++) {
      const state = makeExpeditionState({
        seed,
        chapter: 1,
        playerOverrides: {
          gold: RELIC_CHEST.COST_GOLD + 100,
          relics: ['CHIEF_ROAR' as never],
        },
      });
      const result = openRelicChest(state, RELIC_CHEST.COST_DIAMOND);
      const ev = result.events.find((e) => e.type === 'RELIC_CHEST_OPENED');
      if (ev?.type === 'RELIC_CHEST_OPENED' && ev.refunded) {
        refundedEv = { refundGold: ev.refundGold, refundDiamond: ev.refundDiamond };
        break;
      }
    }
    expect(refundedEv).toBeDefined();
    expect(refundedEv?.refundGold).toBe(Math.round(RELIC_CHEST.COST_GOLD * RELIC_CHEST.REFUND_PCT));
    expect(refundedEv?.refundDiamond).toBe(Math.round(RELIC_CHEST.COST_DIAMOND * RELIC_CHEST.REFUND_PCT));
  });

  it('命中且未持有时，emit RELIC_PICKUP，relics 中加入', () => {
    // 取多个种子直到命中
    let pickupResult: ReturnType<typeof openRelicChest> | undefined;
    for (let seed = 1; seed <= 200; seed++) {
      const state = makeExpeditionState({
        seed,
        chapter: 1,
        playerOverrides: { gold: RELIC_CHEST.COST_GOLD + 100 },
      });
      const result = openRelicChest(state, RELIC_CHEST.COST_DIAMOND);
      if (result.events.some((e) => e.type === 'RELIC_PICKUP')) {
        pickupResult = result;
        break;
      }
    }
    expect(pickupResult).toBeDefined();
    expect(pickupResult!.state.player.relics).toContain('CHIEF_ROAR');
  });
});
