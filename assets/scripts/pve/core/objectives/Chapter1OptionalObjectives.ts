export interface FloorObjectiveMetrics {
  chestOpened?: boolean;
  clearHpRatio?: number;
  guardsAliveAtCaptainDeath?: number;
  rangedHitsTaken?: number;
  leftDefenseZone?: boolean;
  finalWaveClearTurns?: number;
  messengerDistanceAtKill?: number;
  guardsKilledBeforeSentinel?: number;
  fireGoblinKilledBeforeBlast?: boolean;
  turnsAfterBarrelActivation?: number;
  maxSummonsPerAltar?: number;
  warDrumWallBlocks?: number;
  bossWallsDestroyed?: number;
  hornSummonKills?: number;
}

export interface OptionalObjectiveDefinition {
  id: string;
  floor: number;
  title: string;
  rewardType: 'GOLD';
  rewardValue: number;
  complete(metrics: FloorObjectiveMetrics): boolean;
}

/**
 * 第一章可选目标已退役：玩家侧只展示本层通关条件（主目标）。
 * 保留空表与类型，避免旧存档/结算字段断裂；云端 OPTIONAL_BY_FLOOR 同步为空。
 */
export const CHAPTER1_OPTIONAL_OBJECTIVES: readonly OptionalObjectiveDefinition[] = [];

export function completedOptionalObjectiveIds(floor: number, metrics: FloorObjectiveMetrics): string[] {
  return CHAPTER1_OPTIONAL_OBJECTIVES
    .filter((objective) => objective.floor === floor && objective.complete(metrics))
    .map((objective) => objective.id);
}
