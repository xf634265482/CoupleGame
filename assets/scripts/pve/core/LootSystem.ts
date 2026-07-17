// 掉落系统（design §6）：普通怪掉落 50% 星尘 / 25% 灵气 / 25% 星尘+灵气；宝箱开启获得同张表掉落。
//
// Boss 击杀三层结构（永久逐层 + 旧远征统一）：
//   1. 通用必掉：星尘 + 灵气（章节缩放，bossDropScaled）
//   2. 专属战利品：BOSS_SPOILS 中等概率 1 件（100%，rollBossSpoil）
//   3. 稀有独立判定：~30% 额外楼层固定池装备 + Boss 遗物 pity（无命运碎片）
//
// rollNormalMonsterDrop 是纯随机抽取函数：调用方传入 rng，便于复用同一份楼层 RNG 续算（AC-13 确定性）。
// openChest 是 ApplyResult 纯函数：星尘直接入账；灵气经 AnimaSystem.addAnima 累加（不再触发强化三选一）。

import { addAnima } from './AnimaSystem';
import { applyInteractionExposure } from './AlertSystem';
import { generalChestGoldPct, generalGoldGainPct } from './strengthen/CommonStrengthenEffects';
import { canAfford, spend } from './ApSystem';
import { equipItem, putInBag } from './EquipHelper';
import { rollEquipment, rollRandomSlot } from './EquipmentSystem';
import {
  rollBossExtraFloorEquip,
  rollPersistentEliteEquip,
  rollPersistentNormalEquip,
} from './equipment/FixedEquipmentLoot';
import { BOSS_SPOILS, rollBossSpoil } from './bosses/BossSpoils';
import type { BossId } from './bosses/BossSpoils';
import {
  ANIMA_MONSTER_DROP,
  CHEST_EQUIP_DROP_TABLE,
  ELITE_MONSTER_DROP,
  ELITE_MONSTER_EQUIP_DROP_TABLE,
  NORMAL_MONSTER_DROP,
  NORMAL_MONSTER_EQUIP_DROP_TABLE,
  bossDropScaled,
} from './PveConstants';
import type { EquipQuality } from './PveTypes';
import { createRng } from './rng';
import type { Rng } from './rng';
import type { ApplyResult, EquipItem, ExpeditionState, PveEvent } from './PveTypes';

/** 永久层：击杀/宝箱星尘为原金币量的 50%（至少 1，若原额>0）。 */
function thinPersistentStardust(amount: number, state: ExpeditionState): number {
  if (!state.persistentFloorMode || amount <= 0) return amount;
  return Math.max(1, Math.floor(amount * 0.5));
}

export interface DropResult {
  gold?: number;
  anima?: number;
  equip?: EquipItem;
}

const [GOLD_MIN, GOLD_MAX] = NORMAL_MONSTER_DROP.goldSmall;
const [ANIMA_MIN, ANIMA_MAX] = NORMAL_MONSTER_DROP.animaSmall;

/** 鎺夎惤琛ㄧ殑瀹芥澗缁撴瀯绫诲瀷锛堝吋瀹逛笁寮犱笉鍚屾暟鍊煎瓧闈㈤噺鐨勮〃锛夈€?*/
export interface EquipDropTable {
  LEGENDARY: readonly number[];
  EPIC:      readonly number[];
  RARE:      readonly number[];
  FINE:      readonly number[];
  COMMON:    readonly number[];
}

/**
 * 鍗曟鎺烽纭畾瑁呭鍝佽川锛堟垨涓嶆帀瑁呭锛夈€?
 * 鍒ゅ畾椤哄簭 LEGENDARY鈫扙PIC鈫扲ARE鈫扚INE鈫扖OMMON锛屽叾浣?null銆?
 * 姗欎粠绗?绔犺捣锛堣〃涓?ch1/ch2 = 0锛屽ぉ鐒舵弧瓒筹級銆?
 */
export function rollEquipQuality(
  rng: Rng,
  table: EquipDropTable,
  chapter: number,
): import('./PveTypes').EquipQuality | null {
  const ci = Math.min(5, Math.max(1, chapter)) - 1; // 0-indexed
  const roll = rng.next();
  let cumulative = 0;
  for (const quality of ['LEGENDARY', 'EPIC', 'RARE', 'FINE', 'COMMON'] as const) {
    const prob = table[quality][ci] ?? 0;
    cumulative += prob;
    if (roll < cumulative) return quality;
  }
  return null;
}

/** 鐏垫皵鎬帀钀斤細100% 澶ч噺鐏垫皵锛圓C-18锛夈€?*/
export function rollAnimaMonsterDrop(rng: Rng): DropResult {
  const [min, max] = ANIMA_MONSTER_DROP.animaLarge;
  return { anima: rng.int(min, max) };
}

/**
 * 绮捐嫳鎬熀纭€鎺夎惤锛?0% 閲戝竵 / 30% 閲戝竵+鐏垫皵 / 25% 楂橀閲戝竵 / 5% 杩涢樁纰庣墖瀵癸紙design 搂6锛夈€?
 * 瑁呭鍗曟鎺烽鐢辩珷鑺傚皝椤惰〃鍐冲畾鍝佽川锛圥hase 4锛夈€?
 */
export function rollEliteMonsterDrop(
  rng: Rng,
  chapter = 1,
  balanceSnapshot?: ExpeditionState['balanceSnapshot'],
  classId?: string,
): DropResult {
  const roll = rng.next();
  let result: DropResult;
  if (roll < ELITE_MONSTER_DROP.GOLD_ONLY) {
    result = { gold: rng.int(ELITE_MONSTER_DROP.goldMid[0], ELITE_MONSTER_DROP.goldMid[1]) };
  } else if (roll < ELITE_MONSTER_DROP.GOLD_ONLY + ELITE_MONSTER_DROP.GOLD_AND_ANIMA) {
    result = {
      gold: rng.int(ELITE_MONSTER_DROP.goldMid[0], ELITE_MONSTER_DROP.goldMid[1]),
      anima: rng.int(ELITE_MONSTER_DROP.animaMid[0], ELITE_MONSTER_DROP.animaMid[1]),
    };
  } else if (roll < ELITE_MONSTER_DROP.GOLD_ONLY + ELITE_MONSTER_DROP.GOLD_AND_ANIMA + ELITE_MONSTER_DROP.GOLD_HIGH) {
    result = { gold: rng.int(ELITE_MONSTER_DROP.goldHigh[0], ELITE_MONSTER_DROP.goldHigh[1]) };
  } else {
    result = { gold: rng.int(ELITE_MONSTER_DROP.goldHigh[0], ELITE_MONSTER_DROP.goldHigh[1]) };
  }
  // 鍗曟鎺烽瑁呭鍝佽川锛堜簰鏂ワ紝鐢辩珷鑺傚皝椤惰〃鍐冲畾锛?
  const equipQuality = rollEquipQuality(rng, ELITE_MONSTER_EQUIP_DROP_TABLE, chapter);
  if (equipQuality !== null) {
    result = {
      ...result,
      equip: rollEquipment(rng, rollRandomSlot(rng), equipQuality, chapter, balanceSnapshot, classId),
    };
  }
  return result;
}

/**
 * 鎸?50%(閲戝竵) / 25%(鐏垫皵) / 25%(閲戝竵+鐏垫皵) 姒傜巼鎺峰彇涓€浠藉熀纭€鎺夎惤锛?
 * 鍐嶅崟娆℃幏楠板垽瀹氳澶囧搧璐紙design 搂5 Phase 4锛夈€?
 */
export function rollNormalMonsterDrop(
  rng: Rng,
  chapter = 1,
  balanceSnapshot?: ExpeditionState['balanceSnapshot'],
  classId?: string,
): DropResult {
  const roll = rng.next();
  let result: DropResult;
  if (roll < NORMAL_MONSTER_DROP.GOLD_ONLY) {
    result = { gold: rng.int(GOLD_MIN, GOLD_MAX) };
  } else if (roll < NORMAL_MONSTER_DROP.GOLD_ONLY + NORMAL_MONSTER_DROP.ANIMA_ONLY) {
    result = { anima: rng.int(ANIMA_MIN, ANIMA_MAX) };
  } else {
    result = { gold: rng.int(GOLD_MIN, GOLD_MAX), anima: rng.int(ANIMA_MIN, ANIMA_MAX) };
  }
  // 鍗曟鎺烽瑁呭鍝佽川锛堜簰鏂ワ紝鐢辩珷鑺傚皝椤惰〃鍐冲畾锛?
  const equipQuality = rollEquipQuality(rng, NORMAL_MONSTER_EQUIP_DROP_TABLE, chapter);
  if (equipQuality !== null) {
    result = {
      ...result,
      equip: rollEquipment(rng, rollRandomSlot(rng), equipQuality, chapter, balanceSnapshot, classId),
    };
  }
  return result;
}

function noop(state: ExpeditionState): ApplyResult {
  return { state, events: [] };
}

const BOSS_DROP_QUALITY: Record<number, EquipQuality> = {
  2: 'FINE',
  3: 'RARE',
  4: 'EPIC',
  5: 'LEGENDARY',
};

/** Boss id 鏄惁鍦?BOSS_SPOILS 琛ㄤ腑锛堝嵆鏀寔涓夊眰鎺夎惤缁撴瀯锛夈€?*/
function isKnownBossId(bossId: string | undefined): bossId is BossId {
  return !!bossId && bossId in BOSS_SPOILS;
}

/**
 * 寮€鍚疂绠憋細鐜╁椤荤珯鍦ㄧ瀛愭牸銆丄P 鈮?1銆佺瀛愬皻鏈紑鍚紝鍚﹀垯 no-op锛堜笉娑堣€?AP/涓嶄骇鐢熶簨浠讹級銆?
 * 鍛戒腑鍚庯細鎵?AP銆佹爣璁?consumed銆佹帹杩涙ゼ灞?RNG 鐘舵€併€佺粨绠楁帀钀?鈥斺€?浜х敓
 * OPEN_CHEST → LOOT 事件序列。
 */
export function openChest(state: ExpeditionState, entityId: string): ApplyResult {
  const floor = state.floorState;
  const entity = floor.entities.find((e) => e.id === entityId);
  if (!entity || entity.type !== 'CHEST' || entity.consumed) return noop(state);
  if (entity.pos.x !== floor.player.x || entity.pos.y !== floor.player.y) return noop(state);
  if (!canAfford(floor.ap, 'OPEN_CHEST')) return noop(state);

  const rng = createRng(floor.rngState);
  const drop = rollNormalMonsterDrop(rng, state.chapter, state.balanceSnapshot, state.player.classId);
  // 宝箱独立装备单抽；永久逐层禁止宝箱掉可穿戴装备（equipment-catalog §8.3）。
  let equip: EquipItem | undefined;
  if (!state.persistentFloorMode) {
    const chestEquipQuality = rollEquipQuality(rng, CHEST_EQUIP_DROP_TABLE, state.chapter);
    equip = chestEquipQuality !== null
      ? rollEquipment(rng, rollRandomSlot(rng), chestEquipQuality, state.chapter, state.balanceSnapshot, state.player.classId)
      : undefined;
  }

  let next: ExpeditionState = {
    ...state,
    floorState: {
      ...floor,
      ap: spend(floor.ap, 'OPEN_CHEST'),
      rngState: rng.state(),
      entities: floor.entities.map((e) => (e.id === entityId ? { ...e, consumed: true } : e)),
    },
  };

  // 鍛借繍鏍?C2 瀹濈鑰佹墜锛氬疂绠遍噾甯?+chestGoldBonusPct锛堝彇鏁达級
  const chestGoldBonusPct = generalChestGoldPct(state.player.classTraits)
    + generalGoldGainPct(state.player.classTraits);
  const actualGoldRaw = drop.gold ? Math.round(drop.gold * (1 + chestGoldBonusPct)) : undefined;
  const actualGold = actualGoldRaw != null ? thinPersistentStardust(actualGoldRaw, state) : undefined;

  const slotOccupied = equip ? !!next.player.equipment[equip.slot] : false;
  const lootEvent: PveEvent = {
    type: 'LOOT',
    gold: actualGold,
    anima: drop.anima,
    source: entityId,
    ...(equip ? { equip, bagged: slotOccupied } : {}),
  };
  const events: PveEvent[] = [
    { type: 'OPEN_CHEST', entityId },
    lootEvent,
  ];

  if (actualGold) {
    next = { ...next, player: { ...next.player, gold: next.player.gold + actualGold } };
  }
  if (drop.anima) {
    const animaResult = addAnima(next, drop.anima);
    next = animaResult.state;
    events.push(...animaResult.events);
  }
  if (equip) {
    next = { ...next, player: slotOccupied ? putInBag(next.player, equip) : equipItem(next.player, equip) };
  }

  next = applyInteractionExposure(next, events);
  return { state: next, events };
}

/** 通用"结算一份掉落并 emit LOOT"内部函数，避免三份重复逻辑。 */
function applySimpleDrop(
  state: ExpeditionState,
  monsterId: string,
  roller: (rng: Rng, chapter: number, balanceSnapshot?: ExpeditionState['balanceSnapshot'], classId?: string) => DropResult,
  persistentEquipRoller?: (rng: Rng, state: ExpeditionState) => { equip: EquipItem; nextLootSeq: number } | null,
): ApplyResult {
  const floor = state.floorState;
  const rng = createRng(floor.rngState);
  const drop = roller(rng, state.chapter, state.balanceSnapshot, state.player.classId);

  // 永久逐层：星尘（字段 gold）/灵气仍走旧表再折薄；装备固定图鉴池且无随机词条。
  let lootSeq = state.lootSeq;
  if (state.persistentFloorMode) {
    delete drop.equip;
    if (persistentEquipRoller) {
      const rolled = persistentEquipRoller(rng, { ...state, lootSeq });
      if (rolled) {
        drop.equip = rolled.equip;
        lootSeq = rolled.nextLootSeq;
      }
    }
  }

  let next: ExpeditionState = {
    ...state,
    floorState: { ...floor, rngState: rng.state() },
    ...(lootSeq !== undefined ? { lootSeq } : {}),
  };

  // strengthen_gold_find：拾取星尘加成（可叠加，取整）
  const goldBonusPct = generalGoldGainPct(state.player.classTraits);
  const actualGoldRaw = drop.gold
    ? (goldBonusPct > 0 ? Math.round(drop.gold * (1 + goldBonusPct)) : drop.gold)
    : undefined;
  const actualGold = actualGoldRaw != null ? thinPersistentStardust(actualGoldRaw, state) : undefined;

  const slotOccupiedForDrop = drop.equip ? !!next.player.equipment[drop.equip.slot] : false;
  const lootEvent: PveEvent = {
    type: 'LOOT',
    gold: actualGold,
    anima: drop.anima,
    source: monsterId,
    ...(drop.equip ? { equip: drop.equip, bagged: slotOccupiedForDrop } : {}),
  };
  const events: PveEvent[] = [lootEvent];

  if (actualGold) {
    next = { ...next, player: { ...next.player, gold: next.player.gold + actualGold } };
  }
  if (drop.anima) {
    const animaResult = addAnima(next, drop.anima);
    next = animaResult.state;
    events.push(...animaResult.events);
  }
  if (drop.equip) {
    next = {
      ...next,
      player: slotOccupiedForDrop ? putInBag(next.player, drop.equip) : equipItem(next.player, drop.equip),
    };
  }
  return { state: next, events };
}

/**
 * 鍑绘潃鎺夎惤缁熶竴鍏ュ彛锛氭寜鎬墿 type 娲惧彂锛圓C-6/AC-10/AC-18锛夈€?
 * - NORMAL 鈫?50/25/25 閲戝竵/鐏垫皵/涓よ€?
 * - ANIMA  鈫?100% 澶ч噺鐏垫皵
 * - ELITE  鈫?40/30/30 閲戝竵/閲戝竵+鐏垫皵/楂橀閲戝竵锛堣澶囧緟 AC-17锛?
 * - BOSS   鈫?涓撳睘蹇呮帀瑁呭 + 涓€浠芥櫘閫氭帀钀?
 *
 * 璋冪敤鏂瑰簲纭繚姝ゅ嚱鏁板湪 KILL 浜嬩欢 emit 涔嬪悗璋冪敤锛堥『搴忥細ATTACK 鈫?KILL 鈫?鏈嚱鏁帮級銆?
 */
export function applyMonsterKillDrop(state: ExpeditionState, monsterId: string): ApplyResult {
  const floor = state.floorState;
  const monster = floor.monsters.find((m) => m.id === monsterId);
  if (!monster) return noop(state);
  // 增益召唤的怪物（Boss 门卫等）击杀后不产生任何掉落，避免刷增益白嫖收益
  if (monster.summoned) return noop(state);
  if (monster.tutorialDrop) return applySimpleDrop(state, monsterId, () => ({ ...monster.tutorialDrop }));
  if (monster.type === 'BOSS' && isKnownBossId(monster.bossId)) {
    return applyBossKillDrop(state, monsterId, monster.bossId);
  }
  if (monster.type === 'ANIMA') return applySimpleDrop(state, monsterId, rollAnimaMonsterDrop);
  if (monster.type === 'ELITE') {
    return applySimpleDrop(
      state,
      monsterId,
      rollEliteMonsterDrop,
      state.persistentFloorMode ? rollPersistentEliteEquip : undefined,
    );
  }
  if (monster.type !== 'NORMAL') return noop(state);
  return applySimpleDrop(
    state,
    monsterId,
    rollNormalMonsterDrop,
    state.persistentFloorMode ? rollPersistentNormalEquip : undefined,
  );
}

function assignPersistentLootInstanceId(
  equip: EquipItem,
  state: ExpeditionState,
  lootSeq: number,
): { equip: EquipItem; nextLootSeq: number } {
  const nextLootSeq = lootSeq + 1;
  return {
    equip: { ...equip, id: `loot_${state.runSeed}_${state.floor}_${nextLootSeq}` },
    nextLootSeq,
  };
}

function applyBossEquipDrop(
  state: ExpeditionState,
  equip: EquipItem,
): { state: ExpeditionState; bagged: boolean } {
  const bagged = !!state.player.equipment[equip.slot];
  return {
    state: {
      ...state,
      player: bagged ? putInBag(state.player, equip) : equipItem(state.player, equip),
    },
    bagged,
  };
}

/**
 * Boss 击杀掉落（三层结构，design Boss设计V1 / 掉落系统）：
 *   1. 通用必掉：星尘 + 灵气（按章节缩放，bossDropScaled）
 *   2. 专属战利品：从 BOSS_SPOILS[bossId] 等概率随机 1 件（100%，rollBossSpoil）
 *   3. 稀有独立判定（互不影响）：
 *      - ~30% → 额外一层楼层固定池装备（FLOOR_EQUIP_QUALITY_WEIGHTS，非 100%）
 *      - 15%+10% → Boss 遗物（图鉴已解锁 +10%，含 pity）
 *
 * emit 序列：LOOT(星尘/灵气/专属) → 可能的 LOOT(额外楼层装备) →
 *
 * 注意：随机判定顺序固定（额外装备 → 遗物）以保证 AC-13 确定性。
 */
function applyBossKillDrop(state: ExpeditionState, monsterId: string, bossId: BossId): ApplyResult {
  const floor = state.floorState;
  const rng = createRng(floor.rngState);
  const scaled = bossDropScaled(state.chapter);

  // 第 2 层：专属战利品（等概率 3 件中 1 件，100%）
  let spoilEquip = rollBossSpoil(rng, bossId, state.chapter, state.balanceSnapshot);
  let lootSeq = state.lootSeq ?? 0;
  if (state.persistentFloorMode) {
    const wrapped = assignPersistentLootInstanceId(spoilEquip, state, lootSeq);
    spoilEquip = wrapped.equip;
    lootSeq = wrapped.nextLootSeq;
  }

  // 第 3 层：额外楼层池装备（独立判定，~30%）
  const extraRoll = rollBossExtraFloorEquip(rng, { ...state, lootSeq });
  if (extraRoll) lootSeq = extraRoll.nextLootSeq;

  const scaledGold = thinPersistentStardust(scaled.gold, state);
  let next: ExpeditionState = {
    ...state,
    floorState: { ...floor, rngState: rng.state() },
    ...(lootSeq !== state.lootSeq ? { lootSeq } : {}),
  };

  const spoilApplied = applyBossEquipDrop(next, spoilEquip);
  next = spoilApplied.state;

  const events: PveEvent[] = [
    {
      type: 'LOOT',
      gold: scaledGold,
      anima: scaled.anima,
      equip: spoilEquip,
      source: monsterId,
      bagged: spoilApplied.bagged,
    },
  ];

  next = { ...next, player: { ...next.player, gold: next.player.gold + scaledGold } };

  if (scaled.anima > 0) {
    const animaResult = addAnima(next, scaled.anima);
    next = animaResult.state;
    events.push(...animaResult.events);
  }

  if (extraRoll) {
    const extraApplied = applyBossEquipDrop(next, extraRoll.equip);
    next = extraApplied.state;
    events.push({
      type: 'LOOT',
      equip: extraRoll.equip,
      source: monsterId,
      bagged: extraApplied.bagged,
    });
  }

  return { state: next, events };
}
