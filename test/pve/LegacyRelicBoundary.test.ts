import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const root = resolve(__dirname, '../..');
const source = (path: string): string => readFileSync(resolve(root, path), 'utf8');

test('relic implementation and live hooks are absent', () => {
  expect(existsSync(resolve(root, 'assets/scripts/pve/core/RelicSystem.ts'))).toBe(false);
  const joined = [
    'assets/scripts/pve/core/CombatSystem.ts',
    'assets/scripts/pve/core/MovementSystem.ts',
    'assets/scripts/pve/core/ExpeditionState.ts',
    'assets/scripts/pve/core/LootSystem.ts',
    'assets/scripts/pve/controllers/ExpeditionController.ts',
    'assets/scripts/lobby/PveLobbyController.ts',
  ].map(source).join('\n');
  expect(joined).not.toMatch(/RelicSystem|RELIC_PICKUP|RELIC_TRIGGERED|CODEX_RELIC|relicPity|relicCatalog/i);
});
