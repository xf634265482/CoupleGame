/**
 * 灏?cloudfunctions/common 鍚屾鍒板悇浜戝嚱鏁扮洰褰曞唴鐨?./common/
 * 寰俊閮ㄧ讲鍗曚釜浜戝嚱鏁版椂涓嶄細涓婁紶鍏勫紵鐩綍 ../common锛屽繀椤诲鍒惰繘鍑芥暟鍖呭唴銆?
 *
 * 鐢ㄦ硶锛歯ode scripts/sync-cloud-common.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'cloudfunctions', 'common');
const TARGET_FUNCTIONS = ['login', 'initDb', 'pve', 'adminLogin', 'adminTool'];

const COPY_FILES = [
  'constants.js',
  'id.js',
  'db.js',
  'index.js',
  'auth.js',
];

/** 子目录文件按相对路径复制。 */
const COPY_SUBDIR_FILES = [
  'pve/PveMeta.js',
  'pve/PveBalance.js',
  'pve/PveStamina.js',
  'pve/PvePartner.js',
  'pve/PveProfile.js',
  'pve/PveProgression.js',
  'pve/PveChallengeValidate.js',
  'pve/PveChallengeState.js',
  'pve/PveChallenge.js',
  'pve/PveRewardV2.js',
  'pve/PveMinghen.js',
  'pve/PveMinghenShop.js',
  'pve/PveCamp.js',
  'pve/PveMail.js',
  'pve/PveMailService.js',
  'pve/PveCheckIn.js',
  'admin/AdminAuth.js',
  'admin/AdminConstants.js',
  'admin/AdminSeed.js',
  'admin/AdminToolService.js',
];

const MANAGED_SUBDIRS = ['pve', 'admin'];

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
    const allowedFiles = new Set(COPY_SUBDIR_FILES);
    for (const subdir of MANAGED_SUBDIRS) {
      const managedDir = path.join(destDir, subdir);
      if (!fs.existsSync(managedDir)) continue;
      for (const name of fs.readdirSync(managedDir)) {
        const relative = `${subdir}/${name}`;
        const entry = path.join(managedDir, name);
        if (fs.statSync(entry).isFile() && !allowedFiles.has(relative)) fs.unlinkSync(entry);
      }
    }
    console.log(`synced -> cloudfunctions/${fn}/common/`);
  }
  console.log('done');
}

sync();
