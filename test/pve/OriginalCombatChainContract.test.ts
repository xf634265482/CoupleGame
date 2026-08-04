import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(process.cwd());

describe('original PVE combat-chain contract', () => {
  test('ExpeditionController does not disable itself or mount a parallel controller', () => {
    const source = readFileSync(
      resolve(ROOT, 'assets/scripts/pve/controllers/ExpeditionController.ts'),
      'utf8',
    );

    expect(source).not.toContain('this.enabled = false');
  });

  test('movement playback has one coordinate-safe animation path', () => {
    const source = readFileSync(
      resolve(ROOT, 'assets/scripts/pve/controllers/ExpeditionController.ts'),
      'utf8',
    );

    expect(source).toContain('await this._playMoveBatch(batch)');
    expect(source).toContain('convertToNodeSpaceAR(world)');
  });

  test('the existing chest art remains the authoritative chest presentation', () => {
    const source = readFileSync(
      resolve(ROOT, 'assets/scripts/pve/views/FogMapView.ts'),
      'utf8',
    );

    expect(source).toContain("ENTITY_CHEST: 'pve/map/icon_chest'");
    expect(source).toContain("ENTITY_CHEST: '箱'");
  });
});
