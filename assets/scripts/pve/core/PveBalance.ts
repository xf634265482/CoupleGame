import { AP_BASE, AP_COST, BASE_ATTACK, BASE_ATTACK_RANGE, INITIAL_ANIMA, INITIAL_GOLD, INITIAL_HP } from './PveConstants';
import type {
  EquipSlot,
  ExpeditionState,
  FloorState,
  Monster,
  PveBalanceConfig,
  PveBalanceSnapshot,
  RunPlayer,
} from './PveTypes';

type UnitType = 'player' | 'monster' | 'boss';

function getEmptyConfig(): PveBalanceConfig {
  return {};
}

function mergeSection<T extends object>(base: T | undefined, patch: T | undefined): T | undefined {
  if (!base && !patch) return undefined;
  return {
    ...(base || {}),
    ...(patch || {}),
  } as T;
}

function mergeConfig(base: PveBalanceConfig | undefined, patch: PveBalanceConfig | undefined): PveBalanceConfig {
  return {
    player: mergeSection(base?.player, patch?.player),
    monster: mergeSection(base?.monster, patch?.monster),
    boss: mergeSection(base?.boss, patch?.boss),
    equipment: mergeSection(base?.equipment, patch?.equipment),
  };
}

function buildChapterKey(chapter: number): string {
  return `chapter_${chapter}`;
}

function buildUnitKey(unitType: UnitType, unitId: string): string {
  return `${unitType}:${unitId}`;
}

export function getBalanceSnapshot(snapshot?: PveBalanceSnapshot | null): PveBalanceSnapshot {
  return snapshot || {
    globalConfig: {},
    chapterConfigs: {},
    unitConfigs: {},
  };
}

export function getPlayerBalanceConfig(snapshot: PveBalanceSnapshot | null | undefined, chapter: number): NonNullable<PveBalanceConfig['player']> {
  const safe = getBalanceSnapshot(snapshot);
  const chapterConfig = safe.chapterConfigs[buildChapterKey(chapter)] || getEmptyConfig();
  const unitConfig = safe.unitConfigs[buildUnitKey('player', 'ADVENTURER')] || getEmptyConfig();
  return mergeConfig(mergeConfig(safe.globalConfig, chapterConfig), unitConfig).player || {};
}

export function getUnitBalanceConfig(
  snapshot: PveBalanceSnapshot | null | undefined,
  chapter: number,
  unitType: 'monster' | 'boss',
  unitId?: string,
): NonNullable<PveBalanceConfig['monster'] | PveBalanceConfig['boss']> {
  const safe = getBalanceSnapshot(snapshot);
  const chapterConfig = safe.chapterConfigs[buildChapterKey(chapter)] || getEmptyConfig();
  const unitConfig = unitId ? (safe.unitConfigs[buildUnitKey(unitType, unitId)] || getEmptyConfig()) : getEmptyConfig();
  const merged = mergeConfig(mergeConfig(safe.globalConfig, chapterConfig), unitConfig);
  return unitType === 'boss' ? (merged.boss || {}) : (merged.monster || {});
}

export function getEquipmentBalanceConfig(
  snapshot: PveBalanceSnapshot | null | undefined,
  chapter: number,
): NonNullable<PveBalanceConfig['equipment']> {
  const safe = getBalanceSnapshot(snapshot);
  const chapterConfig = safe.chapterConfigs[buildChapterKey(chapter)] || getEmptyConfig();
  return mergeConfig(safe.globalConfig, chapterConfig).equipment || {};
}

export function createBalancedInitialPlayer(
  snapshot: PveBalanceSnapshot | null | undefined,
  chapter: number,
): Pick<RunPlayer, 'hp' | 'maxHp' | 'gold' | 'anima' | 'animaProgress'> {
  const config = getPlayerBalanceConfig(snapshot, chapter);
  const maxHp = config.initialHp ?? INITIAL_HP;
  const startGold = config.initialGold ?? INITIAL_GOLD;
  const startAnima = config.initialAnima ?? INITIAL_ANIMA;
  return {
    hp: maxHp,
    maxHp,
    gold: startGold,
    anima: startAnima,
    animaProgress: startAnima,
  };
}

export function getBalancedApBase(snapshot: PveBalanceSnapshot | null | undefined, chapter: number): number {
  return getPlayerBalanceConfig(snapshot, chapter).apBase ?? AP_BASE;
}

export function getBalancedActionCost(
  snapshot: PveBalanceSnapshot | null | undefined,
  chapter: number,
  action: keyof typeof AP_COST,
): number {
  const config = getPlayerBalanceConfig(snapshot, chapter);
  switch (action) {
  case 'MOVE':
    return config.moveCost ?? AP_COST.MOVE;
  case 'ATTACK':
    return config.attackCost ?? AP_COST.ATTACK;
  case 'OPEN_CHEST':
    return config.openChestCost ?? AP_COST.OPEN_CHEST;
  case 'OPEN_EXIT':
    return config.openExitCost ?? AP_COST.OPEN_EXIT;
  case 'USE_IDOL':
    return config.useIdolCost ?? AP_COST.USE_IDOL;
  case 'USE_HOT_SPRING':
    return config.useHotSpringCost ?? AP_COST.USE_HOT_SPRING;
  case 'USE_ALTAR':
    return config.useAltarCost ?? AP_COST.USE_ALTAR;
  default:
    return AP_COST[action];
  }
}

export function getBalancedPlayerAttackBase(snapshot: PveBalanceSnapshot | null | undefined, chapter: number): { damage: number; range: number } {
  const config = getPlayerBalanceConfig(snapshot, chapter);
  return {
    damage: config.baseAttack ?? BASE_ATTACK,
    range: config.baseAttackRange ?? BASE_ATTACK_RANGE,
  };
}

const EQUIPMENT_FIELD_BY_SLOT: Record<EquipSlot, keyof NonNullable<PveBalanceConfig['equipment']>> = {
  WEAPON: 'weaponBaseMultiplier',
  ARMOR: 'armorBaseMultiplier',
  HELMET: 'helmetBaseMultiplier',
  SHOES: 'shoesBaseMultiplier',
  TRINKET: 'trinketBaseMultiplier',
};

export function getBalancedEquipmentBaseStat(
  snapshot: PveBalanceSnapshot | null | undefined,
  chapter: number,
  slot: EquipSlot,
  baseStat: number,
): number {
  const config = getEquipmentBalanceConfig(snapshot, chapter);
  const multiplier = config[EQUIPMENT_FIELD_BY_SLOT[slot]] ?? 1;
  return Math.max(0, Math.round(baseStat * multiplier));
}

function applyMonsterConfig(monster: Monster, config: NonNullable<PveBalanceConfig['monster'] | PveBalanceConfig['boss']>): Monster {
  const hpMultiplier = config.hpMultiplier ?? 1;
  const attackMultiplier = config.attackMultiplier ?? 1;
  const rangeDelta = config.rangeDelta ?? 0;
  const aggroRadiusDelta = config.aggroRadiusDelta ?? 0;
  const armorDelta = config.armorDelta ?? 0;
  const nextMaxHp = Math.max(1, Math.round(monster.maxHp * hpMultiplier));
  const hpRatio = monster.maxHp > 0 ? monster.hp / monster.maxHp : 1;
  const nextHp = Math.max(1, Math.min(nextMaxHp, Math.round(nextMaxHp * hpRatio)));
  const nextArmor = Math.max(0, Number(monster.armor || 0) + armorDelta);

  return {
    ...monster,
    hp: nextHp,
    maxHp: nextMaxHp,
    attack: Math.max(0, Math.round(monster.attack * attackMultiplier)),
    range: Math.max(0, monster.range + rangeDelta),
    aggroRadius: Math.max(0, monster.aggroRadius + aggroRadiusDelta),
    ...(nextArmor > 0 ? { armor: nextArmor } : { armor: undefined }),
  };
}

export function applyBalanceToFloor(
  floorState: FloorState,
  snapshot: PveBalanceSnapshot | null | undefined,
  chapter: number,
): FloorState {
  const monsters = floorState.monsters.map((monster) => {
    if (monster.type === 'BOSS') {
      return applyMonsterConfig(monster, getUnitBalanceConfig(snapshot, chapter, 'boss', monster.bossId));
    }
    return applyMonsterConfig(monster, getUnitBalanceConfig(snapshot, chapter, 'monster', monster.variantId));
  });
  return {
    ...floorState,
    monsters,
  };
}

export function getStateChapter(state: ExpeditionState): number {
  return state.chapter || state.floorState.floor || 1;
}
