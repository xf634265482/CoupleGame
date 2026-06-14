#!/usr/bin/env node
/**
 * 将 bgm_main.mp3 压到 ~96kbps，为主包腾出 ~200KB（含 icons 后主包须 <4096KB）。
 * 依赖 @ffmpeg-installer/ffmpeg（npm install 后自动可用）。
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'assets', 'resources', 'audio', 'bgm_main.mp3');
const bak = src + '.bak';
const tmp = src + '.tmp.mp3';

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
  fs.copyFileSync(src, bak);
  console.log('[compress-bgm] backup ->', path.relative(root, bak));
}

const ffmpeg = resolveFfmpeg();
try {
  execFileSync(
    ffmpeg,
    ['-y', '-i', src, '-b:a', '64k', '-ar', '44100', '-ac', '2', tmp],
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
