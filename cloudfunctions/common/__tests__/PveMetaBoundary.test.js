const { readFileSync } = require('fs');
const { resolve } = require('path');

test('cloud meta no longer reads or writes achievement and codex fields', () => {
  const joined = [
    resolve(__dirname, '../db.js'),
    resolve(__dirname, '../pve/PveMeta.js'),
  ].map((path) => readFileSync(path, 'utf8')).join('\n');
  expect(joined).not.toMatch(/achievements|pveCodex|codexMonsters|codexEquipment|codexRelics/);
});
