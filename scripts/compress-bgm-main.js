#!/usr/bin/env node
/**
 * 将 bgm_main.mp3 进一步压到 ~48kbps，为主包再腾一段安全余量。
 * 依赖 @ffmpeg-installer/ffmpeg（npm install 后自动可用）。
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'assets', 'resources', 'audio', 'bgm_main.mp3');
const backupRoot = path.join(root, '.asset-backups', 'compress-bgm');
const bak = path.join(backupRoot, 'assets', 'resources', 'audio', 'bgm_main.mp3.bak');
const tmp = path.join(backupRoot, 'tmp', 'bgm_main.tmp.mp3');

function resolveFfmpeg() {
  try {
    return require('@ffmpeg-installer/ffmpeg').path;
  } catch {
    return 'ffmpeg';
  }
}

function kb(p) {
  return Math.round(fs.statSync(p).size / 1024);
}

if (!fs.existsSync(src)) {
  console.error('[compress-bgm] missing', src);
  process.exit(1);
}

const before = kb(src);
if (!fs.existsSync(bak)) {
  fs.mkdirSync(path.dirname(bak), { recursive: true });
  fs.copyFileSync(src, bak);
  console.log('[compress-bgm] backup ->', path.relative(root, bak));
}

const ffmpeg = resolveFfmpeg();
fs.mkdirSync(path.dirname(tmp), { recursive: true });
try {
  execFileSync(
    ffmpeg,
    ['-y', '-i', src, '-b:a', '48k', '-ar', '44100', '-ac', '2', tmp],
    { stdio: 'pipe' },
  );
} catch (err) {
  console.error('[compress-bgm] ffmpeg failed — run: npm install --save-dev @ffmpeg-installer/ffmpeg');
  if (err.stderr) console.error(String(err.stderr));
  process.exit(1);
}

fs.copyFileSync(tmp, src);
fs.unlinkSync(tmp);
const after = kb(src);
console.log(`[compress-bgm] bgm_main.mp3: ${before} KB -> ${after} KB (saved ${before - after} KB)`);
