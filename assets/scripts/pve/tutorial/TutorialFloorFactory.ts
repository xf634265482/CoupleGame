import { getChapter1Objective } from '../core/objectives/Chapter1Objectives';
import { equipmentMaxHpBonus } from '../core/equipment/EquipmentProgression';
import { professionBaseStats } from '../core/professions/ProfessionBaseStats';
import { loadoutToRunEquipment } from '../core/CampCombatPreview';
import type { ExpeditionState, RunPlayer } from '../core/PveTypes';
import type { FloorChallengeSnapshot, PveProfile } from '../core/PveProgressionTypes';
import { buildFirstTutorialFloor } from './TutorialConfigs';

export { getChapter1Objective };

function createTutorialPlayer(profile: PveProfile): RunPlayer {
  const equipment = loadoutToRunEquipment(profile);
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
    equipment,
    bag: [],
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
