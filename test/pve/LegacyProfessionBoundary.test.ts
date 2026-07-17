import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const root = resolve(__dirname, '../..');
const source = (path: string): string => readFileSync(resolve(root, path), 'utf8');

describe('legacy profession boundary', () => {
  test('old advancement implementation and event hooks are absent', () => {
    expect(existsSync(resolve(root, 'assets/scripts/pve/core/ClassSystem.ts'))).toBe(false);
    const joined = [
      'assets/scripts/pve/controllers/ExpeditionController.ts',
      'assets/scripts/pve/core/PveTypes.ts',
      'assets/scripts/pve/core/ExpeditionState.ts',
      'assets/scripts/pve/core/LootSystem.ts',
      'assets/scripts/pve/core/MapGenerator.ts',
    ].map(source).join('\n');
    expect(joined).not.toMatch(/CLASS_CAN_ADVANCE|CLASS_CAN_AWAKEN|CLASS_ADVANCED|CLASS_AWAKENED/);
    expect(joined).not.toMatch(/FRAGMENT_PICKED|AWAKEN_EFFECT_TRIGGERED|type:\s*'FRAGMENT'/);
  });
});
