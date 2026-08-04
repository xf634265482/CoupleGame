// 涓珛浜や簰瀹炰綋锛坉esign 搂3 涓€у尯鍩燂級锛氱鍍?/ 娓╂硥 / 绁潧 / 閾佸尃銆?

import { canAfford, spend } from './ApSystem';
import { addAnima } from './AnimaSystem';
import { applyInteractionExposure } from './AlertSystem';
import { equipItem } from './EquipHelper';
import {
  ALTAR_ANIMA_MAX,
  ALTAR_ANIMA_MIN,
  BLACKSMITH_ENHANCE_STEP,
  BLACKSMITH_FAIL_BASE,
  BLACKSMITH_FAIL_CAP,
  IDOL_ATTACK_BONUS,
  IDOL_ARMOR_BONUS,
  BLACKSMITH_FAIL_STEP,
  BLACKSMITH_FAIL_THRESHOLD,
  BLACKSMITH_UPGRADE_COST,
  HOT_SPRING_HEAL_RATIO,
  IDOL_MAX_HP_BONUS,
} from './PveConstants';
import { createRng } from './rng';
import type { ApplyResult, EquipSlot, ExpeditionState, PveEvent } from './PveTypes';
import { hasLivingChapter1Floor3Blocker } from './chapter1/Chapter1FloorCatalog';

function noop(state: ExpeditionState): ApplyResult {
  return { state, events: [] };
}

/**
 * 浣跨敤绁炲儚锛氱帺瀹剁珯鍦?IDOL 鏍?+ AP 鈮?1 + 鏈秷鑰?鈫?鎵?AP锛?
 * 鐢ㄦゼ灞?RNG 涓夐€変竴闅忔満锛?IDOL_MAX_HP_BONUS maxHp / +IDOL_ATTACK_BONUS 鏀诲嚮 / +IDOL_ARMOR_BONUS 鎶ょ敳銆?
 * 褰撳墠 HP 鍚屾涓婅皟锛堥€変腑 MAX_HP 鏃讹級锛岄伩鍏嶅嚭鐜?"HP 20/maxHp 21" 鐨勮瑙夋€姸鎬併€?
 */
export function useIdol(state: ExpeditionState, entityId: string): ApplyResult {
  const floor = state.floorState;
  const entity = floor.entities.find((e) => e.id === entityId);
  if (!entity || entity.type !== 'IDOL' || entity.consumed) return noop(state);
  if (entity.pos.x !== floor.player.x || entity.pos.y !== floor.player.y) return noop(state);
  if (!canAfford(floor.ap, 'USE_IDOL')) return noop(state);

  const rng = createRng(floor.rngState);
  const roll = rng.int(0, 2); // 0=MAX_HP, 1=ATTACK, 2=ARMOR

  let nextPlayer = { ...state.player };
  let event: PveEvent;
  if (roll === 0) {
    nextPlayer = { ...nextPlayer, maxHp: nextPlayer.maxHp + IDOL_MAX_HP_BONUS, hp: nextPlayer.hp + IDOL_MAX_HP_BONUS };
    event = { type: 'IDOL_BLESSING', entityId, effect: 'MAX_HP', maxHpBonus: IDOL_MAX_HP_BONUS };
  } else if (roll === 1) {
    nextPlayer = { ...nextPlayer, idolAttackBonus: (nextPlayer.idolAttackBonus ?? 0) + IDOL_ATTACK_BONUS };
    event = { type: 'IDOL_BLESSING', entityId, effect: 'ATTACK', attackBonus: IDOL_ATTACK_BONUS };
  } else {
    nextPlayer = { ...nextPlayer, idolArmorBonus: (nextPlayer.idolArmorBonus ?? 0) + IDOL_ARMOR_BONUS };
    event = { type: 'IDOL_BLESSING', entityId, effect: 'ARMOR', armorBonus: IDOL_ARMOR_BONUS };
  }

  const events: PveEvent[] = [event];
  const next = applyInteractionExposure({
    ...state,
    player: nextPlayer,
    floorState: {
      ...floor,
      ap: spend(floor.ap, 'USE_IDOL'),
      rngState: rng.state(),
      entities: floor.entities.map((e) => (e.id === entityId ? { ...e, consumed: true } : e)),
    },
  }, events);
  return { state: next, events };
}

/**
 * 浣跨敤娓╂硥锛氱帺瀹剁珯鍦?HOT_SPRING 鏍?+ AP 鈮?1 + 鏈秷鑰?鈫?鎵?AP锛?
 * 褰撴鎭㈠ maxHp 脳 HOT_SPRING_HEAL_RATIO锛?.4 = 40% maxHp锛夛紝瓒呭嚭涓婇檺鎴柇锛汬P 宸叉弧鍒?no-op銆?
 */
export function useHotSpring(state: ExpeditionState, entityId: string): ApplyResult {
  const floor = state.floorState;
  const entity = floor.entities.find((e) => e.id === entityId);
  if (!entity || entity.type !== 'HOT_SPRING' || entity.consumed) return noop(state);
  if (entity.pos.x !== floor.player.x || entity.pos.y !== floor.player.y) return noop(state);
  if (!canAfford(floor.ap, 'USE_HOT_SPRING')) return noop(state);
  if (state.player.hp >= state.player.maxHp) return noop(state); // 宸叉弧琛€鍒欐棤鎰忎箟锛宯o-op 閬垮厤娴垂 AP

  const targetHp = Math.min(
    state.player.maxHp,
    state.player.hp + Math.ceil(state.player.maxHp * HOT_SPRING_HEAL_RATIO),
  );
  const healed = targetHp - state.player.hp;

  const events: PveEvent[] = [{ type: 'HOT_SPRING_HEAL', entityId, healed }];

  const next = applyInteractionExposure({
    ...state,
    player: { ...state.player, hp: targetHp },
    floorState: {
      ...floor,
      ap: spend(floor.ap, 'USE_HOT_SPRING'),
      entities: floor.entities.map((e) => (e.id === entityId ? { ...e, consumed: true } : e)),
    },
  }, events);
  return { state: next, events };
}

/**
 * 使用祭坛：玩家站在 ALTAR 格 + AP ≥ 1 + 未消耗 → 扣 AP、消耗祭坛。
 * - 永久逐层第 6 层刷怪点已改为 `WAVE_SPAWN_MARKER`（不可交互）；旧档若仍有 `WAVE_ALTAR_*` 也禁止消耗。
 * - 永久逐层不再发放旧灵气进度（灵气爆发走 spirit）。
 * - 非永久模式仍随机获得 [ALTAR_ANIMA_MIN, ALTAR_ANIMA_MAX] 灵气（可触发旧强化）。
 */
export function useAltar(state: ExpeditionState, entityId: string): ApplyResult {
  const floor = state.floorState;
  const entity = floor.entities.find((e) => e.id === entityId);
  if (!entity || entity.type !== 'ALTAR' || entity.consumed) return noop(state);
  if (entity.pos.x !== floor.player.x || entity.pos.y !== floor.player.y) return noop(state);
  if (!canAfford(floor.ap, 'USE_ALTAR')) return noop(state);
  // 第 6 层夜袭刷怪源（含旧 WAVE_ALTAR 存档）不可当祭坛消耗。
  if (entityId.startsWith('WAVE_ALTAR_') || entityId.startsWith('WAVE_SPAWN_')
    || (state.persistentFloorMode && state.floor === 6)) {
    return noop(state);
  }
  if (state.persistentFloorMode && state.floor === 3 && hasLivingChapter1Floor3Blocker(floor.monsters)) {
    return noop(state);
  }

  // 永久逐层：关闭祭坛不计旧灵气；非永久模式仍 RNG 发放灵气。
  let animaGain = 0;
  let rngState = floor.rngState;
  if (!state.persistentFloorMode) {
    const rng = createRng(floor.rngState);
    animaGain = rng.int(ALTAR_ANIMA_MIN, ALTAR_ANIMA_MAX);
    rngState = rng.state();
  }

  const midState: ExpeditionState = {
    ...state,
    floorState: {
      ...floor,
      ap: spend(floor.ap, 'USE_ALTAR'),
      rngState,
      entities: floor.entities.map((e) => (e.id === entityId ? { ...e, consumed: true } : e)),
    },
  };

  const animaResult = addAnima(midState, animaGain);
  const events: PveEvent[] = [{ type: 'ALTAR_USED', entityId, anima: animaGain }, ...animaResult.events];
  return {
    state: applyInteractionExposure(animaResult.state, events),
    events,
  };
}

/**
 * 閾佸尃寮哄寲锛氭彁鍗囨寚瀹氭Ы浣嶈澶囩殑 baseStat锛屾秷鑰楅噾甯侊紙闅忓己鍖栫瓑绾ч€掑锛夈€?
 * 寮哄寲澧為噺鎸夊搧璐ㄥ垎绾э紙COMMON+1 / FINE+2 / RARE+3 / EPIC+5 / LEGENDARY+8锛屆?0鍩哄噯锛夛紱
 * SHOES / TRINKET 鍥哄畾 +1锛堜笉鍦?脳10 鑼冨洿锛夈€?
 * +5 浠ヤ笂寮€濮嬫湁澶辫触姒傜巼锛?0%/15%/20%/鈥︼紝灏侀《 80%锛夛紱澶辫触鏃跺彧鎵ｈ垂銆佸睘鎬т笉鍙樸€?
 * 閾佸尃瀹炰綋涓嶆秷鑰椼€佷笉娑堣€?AP銆?
 */
/** 钀ュ湴閾佸尃涓婁笅鏂囩殑鍝ㄥ叺 entityId锛岀敤浜庤烦杩囨ゼ灞傚疄浣撲笌浣嶇疆鏍￠獙銆?*/
export const CAMP_BLACKSMITH_ID = 'CAMP_BLACKSMITH';

export function upgradeEquip(state: ExpeditionState, entityId: string, slot: EquipSlot): ApplyResult {
  const floor = state.floorState;
  if (entityId !== CAMP_BLACKSMITH_ID) {
    const entity = floor.entities.find((e) => e.id === entityId);
    if (!entity || entity.type !== 'BLACKSMITH') return noop(state);
    if (entity.pos.x !== floor.player.x || entity.pos.y !== floor.player.y) return noop(state);
  }
  const item = state.player.equipment[slot];
  if (!item) return noop(state);

  const currentLevel = item.enhanceLevel ?? 0;

  // 寮哄寲姝ヨ繘鎸夊搧璐ㄥ喅瀹氾紙SHOES/TRINKET 鍥哄畾+1锛沇EAPON/ARMOR/HELMET 鎸夊搧璐ㄥ垎绾э級
  const upgradeStep = (slot === 'SHOES' || slot === 'TRINKET')
    ? 1
    : (BLACKSMITH_ENHANCE_STEP[item.quality] ?? 1);

  // 璐圭敤 = BASE 脳 姝ヨ繘 脳 (level+1)锛屽搧璐ㄨ秺楂樻瘡娆″己鍖栧€艰秺澶с€佽垂鐢ㄤ篃瓒婇珮锛涘懡杩愭爲 C3 鎶樻墸鍚庢渶浣?1g
  const cost = Math.max(1, BLACKSMITH_UPGRADE_COST * upgradeStep * (currentLevel + 1));
  if (state.player.gold < cost) return noop(state);
  const afterGold = { ...state.player, gold: state.player.gold - cost };

  // 澶辫触姒傜巼妫€瀹氾紙+5 璧风敓鏁堬紝娑堣€?rngState 淇濊瘉 AC-13 纭畾鎬э級
  const failChance = currentLevel >= BLACKSMITH_FAIL_THRESHOLD
    ? Math.min(BLACKSMITH_FAIL_CAP, BLACKSMITH_FAIL_BASE + (currentLevel - BLACKSMITH_FAIL_THRESHOLD) * BLACKSMITH_FAIL_STEP)
    : 0;
  const rng = createRng(floor.rngState);
  const failed = failChance > 0 && rng.chance(failChance);
  const nextRngState = rng.state();

  if (failed) {
    const events: PveEvent[] = [{ type: 'BLACKSMITH_UPGRADE_FAIL', entityId, slot, failChance }];
    return {
      state: applyInteractionExposure({
        ...state,
        player: afterGold,
        floorState: { ...floor, rngState: nextRngState },
      }, events),
      events,
    };
  }

  // 寮哄寲鎴愬姛
  const newStat = item.baseStat + upgradeStep;
  const newEnhanceLevel = currentLevel + 1;
  const newItem = { ...item, baseStat: newStat, enhanceLevel: newEnhanceLevel };

  // equipItem 缁熶竴澶勭悊 HELMET 鐨?maxHp/hp 鑱斿姩
  const player = equipItem(afterGold, newItem);

  const upgradeEvents: PveEvent[] = [{ type: 'BLACKSMITH_UPGRADE', entityId, slot, newStat, newEnhanceLevel }];
  return {
    state: applyInteractionExposure({ ...state, player, floorState: { ...floor, rngState: nextRngState } }, upgradeEvents),
    events: upgradeEvents,
  };
}
