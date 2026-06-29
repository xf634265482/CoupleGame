const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const buildDir = path.join(root, 'build', 'wechatgame');
const stampPath = path.join(buildDir, '.patch-last-run.json');

if (!fs.existsSync(stampPath)) {
  throw new Error('Missing build/wechatgame/.patch-last-run.json; run npm run patch:wechat');
}

const stamp = JSON.parse(fs.readFileSync(stampPath, 'utf8'));
if (stamp.buildFlavor !== 'pve-only') {
  throw new Error(`Expected pve-only build, got ${stamp.buildFlavor || 'unknown'}`);
}
if (stamp.mainKb > 4096) {
  throw new Error(`Main package exceeds limit: ${stamp.mainKb} KB`);
}

const gameJson = JSON.parse(
  fs.readFileSync(path.join(buildDir, 'game.json'), 'utf8'),
);
const resources = gameJson.subpackages?.find((item) => item.name === 'resources');
if (!resources) {
  throw new Error('resources subpackage missing');
}

const forbidden = [
  'BoardController',
  'RoomController',
  'SettlementController',
  'LobbyService',
  'GameWatcher',
];
const mainIndex = path.join(buildDir, 'assets', 'main', 'index.js');
const source = fs.existsSync(mainIndex) ? fs.readFileSync(mainIndex, 'utf8') : '';
const hits = forbidden.filter((name) => source.includes(name));
if (hits.length) {
  console.warn('[verify-pve-only] compiled bundle still contains names:', hits.join(', '));
}

console.log(
  `[verify-pve-only] OK main=${stamp.mainKb}KB subpackages=${stamp.subpackagesKb}KB`,
);
