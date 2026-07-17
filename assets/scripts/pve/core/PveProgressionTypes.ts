export const PVE_PROFILE_VERSION = 1 as const;

export const PVE_PROFESSION_IDS = ['WARRIOR', 'ARCHER', 'RANGER'] as const;
export type PveProfessionId = (typeof PVE_PROFESSION_IDS)[number];

export const FLOOR_CHALLENGE_MODES = ['PROGRESSION', 'HUNT', 'TRIAL', 'PRACTICE'] as const;
export type FloorChallengeMode = (typeof FLOOR_CHALLENGE_MODES)[number];

export const FLOOR_CHALLENGE_STATUSES = ['ACTIVE', 'CLEAR', 'DEAD', 'WITHDRAW'] as const;
export type FloorChallengeStatus = (typeof FLOOR_CHALLENGE_STATUSES)[number];

export type MinghenLevel = 1 | 2 | 3;
export const PVE_EQUIPMENT_SLOTS = ['WEAPON', 'HELMET', 'ARMOR', 'SHOES', 'TRINKET'] as const;
export type EquipSlot = (typeof PVE_EQUIPMENT_SLOTS)[number];

export interface MinghenCollectionEntry {
  id: string;
  level: MinghenLevel;
  copies: number;
  trialCompleted: boolean;
}

export interface MinghenLoadoutEntry {
  id: string;
  level: MinghenLevel;
}

export interface MinghenLoadoutPreset {
  id: string;
  name: string;
  entries: MinghenLoadoutEntry[];
}

export interface PveEquipmentInstance {
  instanceId: string;
  /** 旧装备库中文名称，如「皮革轻甲」。 */
  definitionId: string;
  quality: 'COMMON' | 'FINE' | 'RARE' | 'EPIC' | 'LEGENDARY';
  enhanceLevel: number;
  locked: boolean;
  /** 掉落时 roll 的主属性，品质/强化在此基础上缩放。 */
  baseStat?: number;
}

export interface PveEquipmentLoadout {
  WEAPON?: string;
  HELMET?: string;
  ARMOR?: string;
  SHOES?: string;
  TRINKET?: string;
}

export interface ProfessionMasteryProgress {
  unlocked: boolean;
  xp: number;
  level: number;
  unlockedTechniqueIds: string[];
}

export interface FloorProgressRecord {
  firstClearedAt?: number;
  clearCount: number;
  completedOptionalObjectiveIds: string[];
  graduatedMinghenIds: string[];
  bestClearTurns?: number;
}

export interface MinghenTrackingProgress {
  floor: number;
  minghenId: string;
  progress: number;
  state: 'HUNT' | 'TRIAL_READY';
}

export interface PveProfile {
  version: typeof PVE_PROFILE_VERSION;
  highestUnlockedFloor: number;
  highestClearedFloor: number;
  /** 云端新档案始终提供；旧本地测试/缓存快照允许缺失并按 null 处理。 */
  highestClearedAt?: number | null;
  floorRecords: Record<string, FloorProgressRecord>;
  minghenCollection: Record<string, MinghenCollectionEntry>;
  minghenLoadout: MinghenLoadoutEntry[];
  minghenPresets: MinghenLoadoutPreset[];
  equipmentInventory: PveEquipmentInstance[];
  equipmentLoadout: PveEquipmentLoadout;
  /**
   * 营地唯一货币「星尘」余额（存档字段名沿用 gold，UI 显示为星尘）。
   * 读档时会把旧 minghenDust 合并进来。
   */
  gold: number;
  /** @deprecated 已并入 gold（星尘）；归一化后恒为 0。 */
  minghenDust: number;
  professions: Record<PveProfessionId, ProfessionMasteryProgress>;
  selectedProfessionId: PveProfessionId;
  tracking: MinghenTrackingProgress | null;
  activeChallengeId: string | null;
  stamina?: number;
  staminaUpdatedAt?: number;
  staminaNextRecoveryAt?: number | null;
  tutorialFreeChallengeConsumed?: boolean;
  updatedAt: number;
}

export interface FloorChallengeConfigSnapshot {
  professionId: PveProfessionId;
  equipmentLoadout: PveEquipmentLoadout;
  minghenLoadout: MinghenLoadoutEntry[];
  trackedMinghenId: string | null;
}

export interface FloorChallengeSnapshot {
  challengeId: string;
  userId: string;
  floor: number;
  mode: FloorChallengeMode;
  seed: number;
  status: FloorChallengeStatus;
  config: FloorChallengeConfigSnapshot;
  startedAt: number;
  updatedAt: number;
  result?: FloorChallengeResultSnapshot;
  runtimeSave?: string;
  runtimeTurn?: number;
  runtimeSavedAt?: number;
}

export interface FloorChallengeResultSnapshot {
  status: Exclude<FloorChallengeStatus, 'ACTIVE'>;
  clearTurns?: number;
  completedOptionalObjectiveIds: string[];
}

export interface StartFloorChallengeRequest {
  floor: number;
  mode: FloorChallengeMode;
  professionId: PveProfessionId;
  equipmentLoadout: PveEquipmentLoadout;
  minghenLoadout: MinghenLoadoutEntry[];
  trackedMinghenId?: string | null;
  abandonActive?: boolean;
}

export interface SettleFloorChallengeRequest {
  challengeId: string;
  status: Exclude<FloorChallengeStatus, 'ACTIVE'>;
  clearTurns?: number;
  completedOptionalObjectiveIds?: string[];
  professionHighlightCount?: number;
  selectedMinghenId?: string;
  /** @deprecated 通关选装已退役；装备改由击杀掉落 lootedEquipment 入账。 */
  selectedEquipmentDefinitionId?: string;
  /** 本层击杀掉落的固定装备实例（结算入永久背包，非通关选装）。 */
  lootedEquipment?: PveEquipmentInstance[];
  /** 本层局内拾取的星尘（RunPlayer.gold），CLEAR/DEAD/WITHDRAW 均入账。 */
  lootedStardust?: number;
  /** 局内最终穿戴；结算后写回 profile.equipmentLoadout，供继续远征带装。 */
  equipmentLoadout?: PveEquipmentLoadout;
  huntBonusAchieved?: boolean;
  trialCompleted?: boolean;
  trialEvidence?: Record<string, number>;
}

export interface StartMinghenTrackingRequest { floor: number; minghenId: string; }
export interface UpdateCampConfigurationRequest { selectedProfessionId?: PveProfessionId; minghenLoadout?: MinghenLoadoutEntry[]; equipmentLoadout?: PveEquipmentLoadout; }

export interface SaveFloorChallengeRuntimeRequest {
  challengeId: string;
  serializedRuntime: string;
}
