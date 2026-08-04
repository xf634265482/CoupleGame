import {
  resolveMinghenFloorTags,
  seedObjectiveZonesFromCells,
  withMinghenFloorTags,
} from '../../assets/scripts/pve/core/minghen/MinghenFloorTags';
import { buildMinghenSpatialContext } from '../../assets/scripts/pve/core/minghen/MinghenCombatBridge';
import { makeExpeditionState, makeMonster } from './helpers';

describe('MinghenFloorTags', () => {
  test('objective zone tags from explicit cells and objective entities', () => {
    const expedition = makeExpeditionState({
      floorOverrides: {
        player: { x: 2, y: 2 },
        entities: [
          { id: 'KEY', type: 'KEY', pos: { x: 2, y: 2 }, consumed: false },
        ],
        minghenFloorTags: seedObjectiveZonesFromCells([{ x: 5, y: 5 }]),
      },
    });
    const atKey = resolveMinghenFloorTags(expedition.floorState, { x: 2, y: 2 });
    expect(atKey.inTaskObjectiveZone).toBe(true);
    const atSeed = resolveMinghenFloorTags(expedition.floorState, { x: 5, y: 5 });
    expect(atSeed.inTaskObjectiveZone).toBe(true);
    const elsewhere = resolveMinghenFloorTags(expedition.floorState, { x: 0, y: 0 });
    expect(elsewhere.inTaskObjectiveZone).toBe(false);
  });

  test('attack warning derives from fateProphecy and explicit cells', () => {
    const expedition = makeExpeditionState({
      floorOverrides: {
        player: { x: 3, y: 3 },
        fateProphecy: { center: { x: 3, y: 3 } },
      },
    });
    expect(resolveMinghenFloorTags(expedition.floorState).inAttackWarningZone).toBe(true);

    const patched = withMinghenFloorTags(expedition.floorState, {
      attackWarningCells: [{ x: 1, y: 1 }],
    });
    expect(resolveMinghenFloorTags({ ...patched, fateProphecy: undefined }, { x: 1, y: 1 }).inAttackWarningZone).toBe(true);
  });

  test('escort tags from ALLY side and spatial context surfaces them', () => {
    const expedition = makeExpeditionState({
      floorOverrides: {
        player: { x: 4, y: 4 },
        monsters: [
          makeMonster('ally', { x: 5, y: 4 }, { side: 'ALLY' }),
          makeMonster('foe', { x: 0, y: 0 }),
        ],
      },
    });
    const tags = resolveMinghenFloorTags(expedition.floorState);
    expect(tags.escortUnitInRange2).toBe(true);
    expect(buildMinghenSpatialContext(expedition).escortUnitInRange2).toBe(true);
    expect(buildMinghenSpatialContext(expedition).inTaskObjectiveZone).toBe(false);
  });
});
