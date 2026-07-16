import { getChapter1Objective } from '../core/objectives/Chapter1Objectives';
import { equipmentMaxHpBonus, toFixedEquipItem } from '../core/equipment/EquipmentProgression';
import { professionBaseStats } from '../core/professions/ProfessionBaseStats';
import type { Equipment, ExpeditionState, RunPlayer } from '../core/PveTypes';
import type { FloorChallengeSnapshot, PveEquipmentInstance, PveProfile } from '../core/PveProgressionTypes';
import { buildFirstTutorialFloor } from './TutorialConfigs';

export { getChapter1Objective };

function loadedInstance(profile: PveProfile, instanceId: string | undefined): PveEquipmentInstance | null {
  return instanceId
    ? profile.equipmentInventory.find((instance) => instance.instanceId === instanceId) ?? null
    : null;
}

function toLegacyEquipment(profile: PveProfile): Equipment {
  const equipment: Equipment = {};
  for (const slot of ['WEAPON', 'HELMET', 'ARMOR', 'SHOES', 'TRINKET'] as const) {
    const instance = loadedInstance(profile, profile.equipmentLoadout[slot]);
    if (!instance) continue;
    equipment[slot] = toFixedEquipItem(instance);
  }
  return equipment;
}

function createTutorialPlayer(profile: PveProfile): RunPlayer {
  const equipment = toLegacyEquipment(profile);
  const base = professionBaseStats('WARRIOR');
  const maxHp = base.maxHp + equipmentMaxHpBonus(equipment);
  return {
    hp: maxHp,
    maxHp,
    gold: 0,
    anima: 0,
    animaProgress: 0,
    animaThreshold: 100,
    classId: 'BERSERKER',
    classTraits: [],
    equipment,
    classFragments: {},
    bag: [],
    relics: [],
    ownedRelics: [],
    campMaxHpBuys: 0,
  };
}

export function createTutorialExpeditionState(
  snapshot: FloorChallengeSnapshot,
  profile: PveProfile,
): ExpeditionState {
  const floorState = buildFirstTutorialFloor(snapshot.seed);
  const player = createTutorialPlayer(profile);
  return {
    runSeed: snapshot.seed,
    chapter: 1,
    floor: 1,
    status: 'ACTIVE',
    player,
    floorState,
    balanceSnapshot: null,
    persistentFloorMode: true,
    isTutorialRun: true,
    equipmentDropPool: [],
    lootSeq: 0,
  };
}

export function shouldUseTutorialFloor(floor: number, tutorialCompleted: boolean | undefined): boolean {
  return floor === 1 && tutorialCompleted !== true;
}
