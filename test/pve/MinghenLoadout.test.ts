import { addMinghenCopy, completeMinghenTrial, validateMinghenLoadout } from '../../assets/scripts/pve/core/minghen/MinghenLoadout';
import type { MinghenCollectionEntry } from '../../assets/scripts/pve/core/PveProgressionTypes';

describe('Minghen loadout', () => {
  test('rejects duplicate ids and more than eight slots', () => {
    const owned = { M01: { id: 'M01', level: 3, copies: 4, trialCompleted: true } as MinghenCollectionEntry };
    expect(() => validateMinghenLoadout([{ id: 'M01', level: 1 }, { id: 'M01', level: 1 }], owned)).toThrow('DUPLICATE_MINGHEN_SLOT');
    expect(() => validateMinghenLoadout(Array.from({ length: 9 }, (_, i) => ({ id: `M${String(i + 1).padStart(2, '0')}`, level: 1 as const })), owned)).toThrow('MINGHEN_SLOT_LIMIT_EXCEEDED');
  });

  test('two copies stay level one until explicit synthesize; trial still gates three', () => {
    let entry: MinghenCollectionEntry | undefined;
    entry = addMinghenCopy(entry, 'M01');
    entry = addMinghenCopy(entry, 'M01');
    expect(entry).toMatchObject({ copies: 2, level: 1, trialCompleted: false });
    entry = addMinghenCopy(addMinghenCopy(entry, 'M01'), 'M01');
    expect(entry).toMatchObject({ copies: 4, level: 1, trialCompleted: false });
    expect(completeMinghenTrial({ ...entry, level: 2 })).toMatchObject({ level: 3, trialCompleted: true });
  });
});
