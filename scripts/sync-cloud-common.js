/**
 * 将 cloudfunctions/common 同步到各云函数目录内的 ./common/
 * 微信部署单个云函数时不会上传兄弟目录 ../common，必须复制进函数包内。
 *
 * 用法：node scripts/sync-cloud-common.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'cloudfunctions', 'common');
const TARGET_FUNCTIONS = ['login', 'room', 'match', 'game', 'scheduler', 'initDb'];

const COPY_FILES = [
  'constants.js',
  'id.js',
  'db.js',
  'index.js',
  'auth.js',
  'BoardGenerator.js',
  'CellResolver.js',
  'GameEngine.js',
  'Settlement.js',
  'BluffEngine.js',
  'roomService.js',
  'matchService.js',
];

function sync() {
  for (const fn of TARGET_FUNCTIONS) {
    const destDir = path.join(ROOT, 'cloudfunctions', fn, 'common');
    fs.mkdirSync(destDir, { recursive: true });
    for (const file of COPY_FILES) {
      fs.copyFileSync(path.join(SRC, file), path.join(destDir, file));
    }
    console.log(`synced -> cloudfunctions/${fn}/common/`);
  }
  console.log('done');
}

sync();
