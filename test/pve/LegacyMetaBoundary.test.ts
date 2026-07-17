import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const root = resolve(__dirname, '../..');

test('achievement and codex business hooks are absent', () => {
  expect(existsSync(resolve(root, 'assets/scripts/pve/core/AchievementSystem.ts'))).toBe(false);
  const controller = readFileSync(resolve(root, 'assets/scripts/pve/controllers/ExpeditionController.ts'), 'utf8');
  const service = readFileSync(resolve(root, 'assets/scripts/network/PveService.ts'), 'utf8');
  expect(`${controller}\n${service}`).not.toMatch(/ACHIEVEMENT_UNLOCKED|codexMonsters|codexEquipment|codexRelics/);
});
