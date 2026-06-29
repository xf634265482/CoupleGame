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
const TARGET_FUNCTIONS = ['login', 'room', 'match', 'game', 'scheduler', 'initDb', 'pve', 'adminLogin', 'adminTool'];

const COPY_FILES = [
  'constants.js',
  'id.js',
  'db.js',
  'index.js',
  'auth.js',
  'BoardGenerator.js',
  'CellResolver.js',
  'EventResolver.js',
  'GameEngine.js',
  'turnDeadline.js',
  'luckySpin.js',
  'luckyRewards.js',
  'finalShop.js',
  'ShopResolver.js',
  'CombatResolver.js',
  'boardRegions.js',
  'Settlement.js',
  'roomService.js',
  'matchService.js',
  'botNames.js',
  'BotPlayer.js',
];

/** 子目录下的文件需保留相对路径复制（如 pve/PveSave.js）。 */
const COPY_SUBDIR_FILES = [
  'pve/PveSave.js',
  'pve/PveValidate.js',
  'pve/PveReward.js',
  'pve/PveDestinyTree.js',
  'pve/PveMeta.js',
  'pve/PveBalance.js',
  'pve/PveStamina.js',
  'admin/AdminAuth.js',
  'admin/AdminConstants.js',
  'admin/AdminSeed.js',
  'admin/AdminToolService.js',
];

function sync() {
  for (const fn of TARGET_FUNCTIONS) {
    const destDir = path.join(ROOT, 'cloudfunctions', fn, 'common');
    fs.mkdirSync(destDir, { recursive: true });
    for (const file of COPY_FILES) {
      fs.copyFileSync(path.join(SRC, file), path.join(destDir, file));
    }
    for (const file of COPY_SUBDIR_FILES) {
      const destFile = path.join(destDir, file);
      fs.mkdirSync(path.dirname(destFile), { recursive: true });
      fs.copyFileSync(path.join(SRC, file), destFile);
    }
    console.log(`synced -> cloudfunctions/${fn}/common/`);
  }
  console.log('done');
}

sync();
