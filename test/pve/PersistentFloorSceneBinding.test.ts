import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(process.cwd());

function compressUuid(uuid: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const hex = uuid.replace(/-/g, '');
  let compressed = hex.slice(0, 5);
  for (let index = 5; index < hex.length; index += 3) {
    const a = Number.parseInt(hex[index]!, 16);
    const b = Number.parseInt(hex[index + 1]!, 16);
    const c = Number.parseInt(hex[index + 2]!, 16);
    compressed += alphabet[(a << 2) | (b >> 2)]!;
    compressed += alphabet[((b & 3) << 4) | c]!;
  }
  return compressed;
}

describe('persistent floor scene binding', () => {
  it('mounts ExpeditionController as the only PVE battle controller', () => {
    const scene = readFileSync(resolve(ROOT, 'assets/scenes/pve_expedition.scene'), 'utf8');
    const retiredMeta = JSON.parse(readFileSync(
      resolve(ROOT, 'assets/scripts/pve/controllers/ExpeditionController.ts.meta'),
      'utf8',
    )) as { uuid: string };

    expect(scene).toContain(`\"__type__\": \"${compressUuid(retiredMeta.uuid)}\"`);
    expect(scene).not.toContain(`\"__type__\": \"876721ukYxCkbzshmMJ5veW\"`);
  });
});
