import { getChapter1Objective } from '../core/objectives/Chapter1Objectives';
import { equipmentMaxHpBonus } from '../core/equipment/EquipmentProgression';
import {
  getBalanceSnapshot,
  getPlayerBalanceConfig,
  resolveProfessionBaseWithBalance,
} from '../core/PveBalance';
import { loadoutToRunEquipment } from '../core/CampCombatPreview';
import type { ExpeditionState, PveBalanceSnapshot, RunPlayer } from '../core/PveTypes';
import type { FloorChallengeSnapshot, PveProfile } from '../core/PveProgressionTypes';
import { buildFirstTutorialFloor } from './TutorialConfigs';

export { getChapter1Objective };

function createTutorialPlayer(
  profile: PveProfile,
  balanceSnapshot?: PveBalanceSnapshot | null,
): RunPlayer {
  const equipment = loadoutToRunEquipment(profile);
  const base = resolveProfessionBaseWithBalance('WARRIOR', balanceSnapshot, 1);
  const playerConfig = getPlayerBalanceConfig(balanceSnapshot, 1);
  const maxHp = base.maxHp + equipmentMaxHpBonus(equipment);
  return {
    hp: maxHp,
    maxHp,
    gold: playerConfig.initialGold ?? 0,
    anima: playerConfig.initialAnima ?? 0,
    animaProgress: playerConfig.initialAnima ?? 0,
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
  balanceSnapshot?: PveBalanceSnapshot | null,
): ExpeditionState {
  const floorState = buildFirstTutorialFloor(snapshot.seed);
  const player = createTutorialPlayer(profile, balanceSnapshot);
  return {
    runSeed: snapshot.seed,
    chapter: 1,
    floor: 1,
    status: 'ACTIVE',
    player,
    floorState,
    balanceSnapshot: getBalanceSnapshot(balanceSnapshot),
    persistentFloorMode: true,
    isTutorialRun: true,
    equipmentDropPool: [],
    lootSeq: 0,
  };
}

export function shouldUseTutorialFloor(floor: number, tutorialCompleted: boolean | undefined): boolean {
  return floor === 1 && tutorialCompleted !== true;
}
