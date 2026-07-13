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
  definitionId: string;
  quality: 'COMMON' | 'FINE' | 'RARE' | 'EPIC' | 'LEGENDARY';
  enhanceLevel: number;
  locked: boolean;
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
  floorRecords: Record<string, FloorProgressRecord>;
  minghenCollection: Record<string, MinghenCollectionEntry>;
  minghenLoadout: MinghenLoadoutEntry[];
  minghenPresets: MinghenLoadoutPreset[];
  equipmentInventory: PveEquipmentInstance[];
  equipmentLoadout: PveEquipmentLoadout;
  gold: number;
  minghenDust: number;
  professions: Record<PveProfessionId, ProfessionMasteryProgress>;
  selectedProfessionId: PveProfessionId;
  tracking: MinghenTrackingProgress | null;
  activeChallengeId: string | null;
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
}

export interface SettleFloorChallengeRequest {
  challengeId: string;
  status: Exclude<FloorChallengeStatus, 'ACTIVE'>;
  clearTurns?: number;
  completedOptionalObjectiveIds?: string[];
  professionHighlightCount?: number;
  selectedMinghenId?: string;
  selectedEquipmentDefinitionId?: string;
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
