const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'config', 'wechatgame.game.json');
const buildRoot = path.join(root, 'build');
const buildFlavorPath = path.join(root, 'config', 'build-flavor.json');

function readBuildFlavor() {
  if (!fs.existsSync(buildFlavorPath)) return 'full';
  try {
    return JSON.parse(fs.readFileSync(buildFlavorPath, 'utf8')).flavor || 'full';
  } catch {
    return 'full';
  }
}

const BUILD_FLAVOR = readBuildFlavor();
const IS_PVE_ONLY = BUILD_FLAVOR === 'pve-only';

function findGameJsonDirs(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  const gameJs = path.join(dir, 'game.js');
  if (fs.existsSync(path.join(dir, 'game.json')) && fs.existsSync(gameJs)) {
    results.push({ dir, mtime: fs.statSync(gameJs).mtimeMs });
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    findGameJsonDirs(path.join(dir, entry.name), results);
  }
  return results;
}

function resolveBuildDir(hint) {
  if (hint) {
    const dir = path.resolve(hint);
    const gameJs = path.join(dir, 'game.js');
    const gameJson = path.join(dir, 'game.json');
    if (fs.existsSync(gameJs) && fs.existsSync(gameJson)) {
      return dir;
    }
    console.warn('[patch-wechatgame-config] build hint invalid, scanning build/:', hint);
  }
  const standard = path.join(buildRoot, 'wechatgame');
  const candidates = findGameJsonDirs(buildRoot);
  if (!candidates.length) {
    throw new Error('No wechatgame build found under build/ (need game.js + game.json)');
  }
  candidates.sort((a, b) => b.mtime - a.mtime);
  const chosen = candidates[0].dir;
  if (chosen !== standard) {
    console.warn(
      `[patch-wechatgame-config] latest build is NOT ${standard}`,
    );
    console.warn(`[patch-wechatgame-config] using: ${chosen}`);
    console.warn(
      '[patch-wechatgame-config] fix Creator: 发布路径=project://build, 输出名称=wechatgame',
    );
  }
  return chosen;
}

function dirSizeBytes(dir, skipSymlinks = false) {
  if (!fs.existsSync(dir)) return 0;
  let sum = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    const lst = fs.lstatSync(p);
    if (skipSymlinks && lst.isSymbolicLink()) continue;
    const st = fs.statSync(p);
    sum += st.isDirectory() ? dirSizeBytes(p, skipSymlinks) : st.size;
  }
  return sum;
}

function dirSizeKb(dir, skipSymlinks = false) {
  return Math.round(dirSizeBytes(dir, skipSymlinks) / 1024);
}

function findStrayResourceSidecars() {
  const assetsRoot = path.join(root, 'assets', 'resources');
  if (!fs.existsSync(assetsRoot)) return [];
  const hits = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(full);
        continue;
      }
      if (!/\.(pngbak|tmp)$/i.test(entry.name) && !/\.mp3\.bak$/i.test(entry.name)) {
        continue;
      }
      hits.push(path.relative(root, full).replace(/\\/g, '/'));
    }
  };
  visit(assetsRoot);
  return hits;
}

function assertNoStrayResourceSidecars() {
  const hits = findStrayResourceSidecars();
  if (!hits.length) return;
  const preview = hits.slice(0, 12).join(', ');
  throw new Error(
    `[patch-wechatgame-config] found backup/tmp assets under assets/resources: ${preview}${hits.length > 12 ? ' ...' : ''}. ` +
      'Move them outside assets/ before rebuilding, otherwise Cocos will import them and inflate the WeChat package.',
  );
}

function findBuildImportedSidecars(buildDir) {
  const importRoots = [
    path.join(buildDir, 'assets', 'resources', 'import'),
    path.join(buildDir, 'subpackages', 'resources', 'import'),
  ];
  const hits = [];
  for (const importRoot of importRoots) {
    if (!fs.existsSync(importRoot)) continue;
    for (const name of fs.readdirSync(importRoot, { recursive: true })) {
      if (typeof name !== 'string' || !name.endsWith('.json')) continue;
      const full = path.join(importRoot, name);
      const text = fs.readFileSync(full, 'utf8');
      if (!text.includes('.pngbak') && !text.includes('.tmp') && !text.includes('.mp3.bak')) {
        continue;
      }
      hits.push(path.relative(buildDir, full).replace(/\\/g, '/'));
    }
  }
  return hits;
}

function assertBuildHasNoImportedSidecars(buildDir) {
  const hits = findBuildImportedSidecars(buildDir);
  if (!hits.length) return;
  const preview = hits.slice(0, 12).join(', ');
  throw new Error(
    `[patch-wechatgame-config] build still contains imported backup/tmp assets: ${preview}${hits.length > 12 ? ' ...' : ''}. ` +
      'Rebuild wechatgame in Cocos Creator after cleaning assets/resources sidecars, then rerun this patch.',
  );
}

/**
 * 已搬到 subpackages/ 的 chapter_* 资源分包（PVE 章节背景，见 assets/scripts/pve/ChapterResourceLoader.ts）。
 * 与 resources 分包不同，它们**不**套用 resources 专属的 native→主包重写（那些规则 key 在字符串 'resources' 上），
 * 因此 bundle.load 直接读各自分包 native——这正是真机背景能显示的关键。
 */
function chapterSubpackageNames(buildDir) {
  const subRoot = path.join(buildDir, 'subpackages');
  if (!fs.existsSync(subRoot)) return [];
  const names = [];
  for (const entry of fs.readdirSync(subRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!/^chapter_\d+$/.test(entry.name)) continue;
    names.push(entry.name);
  }
  names.sort();
  return names;
}

/**
 * Cocos 把所有 bundle（含配成 subpackage 的）都输出到 build/assets/<name>/；
 * 与 resources 一样，须由本脚本把 assets/chapter_* 搬到 subpackages/chapter_*，
 * 否则章节背景留在主包、撑爆 4MB 且不成其为分包。搬完补 game.js stub。
 */
function relocateChapterSubpackagesToSub(buildDir) {
  const assetsRoot = path.join(buildDir, 'assets');
  if (!fs.existsSync(assetsRoot)) return [];
  const moved = [];
  for (const entry of fs.readdirSync(assetsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^chapter_\d+$/.test(entry.name)) continue;
    const from = path.join(assetsRoot, entry.name);
    const to = path.join(buildDir, 'subpackages', entry.name);
    fs.mkdirSync(path.join(buildDir, 'subpackages'), { recursive: true });
    if (fs.existsSync(to)) fs.rmSync(to, { recursive: true, force: true });
    fs.renameSync(from, to);
    if (fs.existsSync(path.join(to, 'index.js'))) {
      writeSubpackageGameJs(to);
    }
    moved.push(entry.name);
    console.log(`[patch-wechatgame-config] moved assets/${entry.name} -> subpackages/${entry.name}`);
  }
  const all = chapterSubpackageNames(buildDir);
  if (all.length) {
    console.log('[patch-wechatgame-config] chapter subpackages found:', all.join(', '));
  } else {
    console.log('[patch-wechatgame-config] no chapter_* bundle in build (check 检查器 压缩类型=分包 + 重新构建)');
  }
  return all;
}

/** 微信编译要求每个分包根目录有 game.js；内容须与 index.js 一致（不能 require，分包上下文无法解析） */
function writeSubpackageGameJs(subRoot) {
  const indexPath = path.join(subRoot, 'index.js');
  const entry = path.join(subRoot, 'game.js');
  if (!fs.existsSync(indexPath)) {
    console.warn('[patch-wechatgame-config] missing index.js in', subRoot);
    return;
  }
  const body = fs.readFileSync(indexPath, 'utf8');
  fs.writeFileSync(entry, body, 'utf8');
  console.log(
    '[patch-wechatgame-config] copied index.js ->',
    path.relative(buildRoot, entry).replace(/\\/g, '/'),
  );
}

function isPathSymlink(p) {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

/** 主包 stub：入口脚本 + config（真机无法 fs.access 分包内 config，须放主包） */
const RESOURCES_STUB_FILES = new Set(['index.js', 'game.js', 'config.json']);
const LEGACY_RESOURCES_STUB_FILES = new Set(['index.js', 'game.js', 'config.json']);

function isResourcesStubDir(dir) {
  if (!fs.existsSync(dir) || isPathSymlink(dir)) return false;
  const entries = fs.readdirSync(dir);
  if (!entries.length) return false;
  return entries.every((name) => LEGACY_RESOURCES_STUB_FILES.has(name));
}

/** 分包须含 import 目录（仅有 config/index 说明曾被 stub 误覆盖，需重新构建） */
function countSubpackageNativeFiles(buildDir) {
  const nativeDir = path.join(buildDir, 'subpackages', 'resources', 'native');
  if (!fs.existsSync(nativeDir)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(nativeDir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && String(entry.name).endsWith('.png')) count += 1;
  }
  return count;
}

function verifyResourcesSubpackageContent(buildDir) {
  const importDir = path.join(buildDir, 'subpackages', 'resources', 'import');
  if (!fs.existsSync(importDir)) {
    throw new Error(
      '[patch-wechatgame-config] subpackages/resources/import missing — stub overwrote subpackage. Rebuild wechatgame in Cocos, then run patch again.',
    );
  }
  const hasJson = fs.readdirSync(importDir, { recursive: true }).some((name) => {
    if (typeof name !== 'string') return false;
    return name.endsWith('.json');
  });
  if (!hasJson) {
    throw new Error(
      '[patch-wechatgame-config] subpackages/resources/import is empty — rebuild wechatgame in Cocos Creator first.',
    );
  }
  const nativeCount = countSubpackageNativeFiles(buildDir);
  if (nativeCount < 1) {
    throw new Error(
      '[patch-wechatgame-config] subpackages/resources/native has no textures — rebuild wechatgame in Cocos Creator first.',
    );
  }
  console.log(
    `[patch-wechatgame-config] subpackages/resources native textures: ${nativeCount}`,
  );
}

/** Creator 未输出分包时，把 resources 挪到 subpackages/ 并改配置 */
function ensureResourcesSubpackage(buildDir) {
  const inMain = path.join(buildDir, 'assets', 'resources');
  const inSub = path.join(buildDir, 'subpackages', 'resources');
  const hasValidSubpackage =
    fs.existsSync(path.join(inSub, 'import')) && countSubpackageNativeFiles(buildDir) > 0;

  if (isPathSymlink(inMain)) {
    fs.rmSync(inMain, { force: true });
    console.log('[patch-wechatgame-config] removed stale assets/resources junction');
  } else if (hasValidSubpackage) {
    // 已经 patch 过的构建目录会同时存在主包 stub 与真实分包；不要把 stub 再移动覆盖分包。
    console.log('[patch-wechatgame-config] resources subpackage already present');
  } else if (fs.existsSync(inMain) && !isResourcesStubDir(inMain)) {
    fs.mkdirSync(path.join(buildDir, 'subpackages'), { recursive: true });
    if (fs.existsSync(inSub)) {
      fs.rmSync(inSub, { recursive: true, force: true });
    }
    fs.renameSync(inMain, inSub);
    console.log('[patch-wechatgame-config] moved assets/resources -> subpackages/resources');
  } else if (!fs.existsSync(inSub)) {
    console.warn('[patch-wechatgame-config] no resources bundle in build output');
    return false;
  }

  writeSubpackageGameJs(inSub);
  verifyResourcesSubpackageContent(buildDir);

  const settingsPath = path.join(buildDir, 'src', 'settings.json');
  if (fs.existsSync(settingsPath)) {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    settings.assets = settings.assets || {};
    const subs = new Set(settings.assets.subpackages || []);
    subs.add('resources');
    // 注册 chapter_* 章节分包（Cocos 一般已加入，这里兜底确保不被漏掉）。
    for (const name of chapterSubpackageNames(buildDir)) subs.add(name);
    settings.assets.subpackages = [...subs];
    // 真机启动勿预加载 resources：须先 wx.loadSubpackage，否则 readFile config.json 失败卡 splash
    settings.assets.preloadBundles = [{ bundle: 'main' }];
    patchRenderingSettings(settings, buildDir);
    patchSplashSettings(settings);
    settings.screen = settings.screen || {};
    settings.screen.exactFitScreen = false;
    fs.writeFileSync(settingsPath, `${JSON.stringify(settings)}\n`, 'utf8');
    console.log(
      '[patch-wechatgame-config] settings: subpackages',
      settings.assets.subpackages,
      'preloadBundles',
      settings.assets.preloadBundles,
      'customPipeline',
      settings.rendering.customPipeline,
      'splashLogo',
      settings.splashScreen?.logo?.type,
    );
  }

  return true;
}

/** 关闭引擎内置 splash，避免与 first-screen.js 双重销毁（Error 5000） */
function patchSplashSettings(settings) {
  settings.splashScreen = settings.splashScreen || {};
  settings.splashScreen.totalTime = 0;
  settings.splashScreen.displayRatio = 0;
  settings.splashScreen.logo = { type: 'none', base64: '', image: '' };
  settings.splashScreen.background = {
    type: 'color',
    color: { x: 0, y: 0, z: 0, w: 1 },
  };
}

/** 保留 Creator 生成的渲染管线配置；关闭 customPipeline 会导致 pipelineSceneData 为空
 *  （2026-06-11 误关此项导致模拟器 batcher2D 报 `switchBufferAccessor of null`，已回滚） */
function patchRenderingSettings(settings, buildDir) {
  settings.rendering = settings.rendering || {};
  const effectBin = path.join(buildDir, 'src', 'effect.bin');
  if (fs.existsSync(effectBin)) {
    settings.rendering.customPipeline = true;
    settings.rendering.renderPipeline = '';
    settings.rendering.effectSettingsPath = 'src/effect.bin';
  } else {
    console.warn('[patch-wechatgame-config] missing src/effect.bin; keep rendering settings unchanged');
  }
}

/** 移除 assets/resources 联接（微信会把联接目标算进主包，导致 4MB 超限） */
function removeResourcesCompatLink(buildDir) {
  const stub = path.join(buildDir, 'assets', 'resources');
  if (!fs.existsSync(stub)) return;
  try {
    if (fs.lstatSync(stub).isSymbolicLink()) {
      fs.rmSync(stub, { force: true });
      console.log('[patch-wechatgame-config] removed assets/resources junction (main pack size)');
    }
  } catch {
    /* ignore */
  }
}

/**
 * 微信 IDE 预编译需要 assets/resources/game.js 与 index.js。
 * 主包再放 config.json（~6KB）与 import/（~15KB）；critical native 由 copyCriticalNativeToMain 写入。
 */
function ensureResourcesEntryScripts(buildDir) {
  const subRoot = path.join(buildDir, 'subpackages', 'resources');
  const stubRoot = path.join(buildDir, 'assets', 'resources');
  if (!fs.existsSync(subRoot)) return;

  removeResourcesCompatLink(buildDir);

  if (fs.existsSync(stubRoot)) {
    for (const entry of fs.readdirSync(stubRoot)) {
      if (RESOURCES_STUB_FILES.has(entry) || entry === 'import') continue;
      fs.rmSync(path.join(stubRoot, entry), { recursive: true, force: true });
      console.log('[patch-wechatgame-config] stripped assets/resources/', entry);
    }
  } else {
    fs.mkdirSync(path.join(buildDir, 'assets'), { recursive: true });
    fs.mkdirSync(stubRoot, { recursive: true });
  }

  for (const name of ['index.js', 'game.js', 'config.json']) {
    const src = path.join(subRoot, name);
    const dst = path.join(stubRoot, name);
    if (!fs.existsSync(src)) {
      console.warn('[patch-wechatgame-config] missing subpackage', name);
      continue;
    }
    fs.copyFileSync(src, dst);
    console.log('[patch-wechatgame-config] wrote assets/resources/', name);
  }

  copyResourcesImportToMain(buildDir);
}

/** 真机分包内 import 索引常读失败；复制到主包（约 15KB）并由 transform 重定向 URL */
function copyResourcesImportToMain(buildDir) {
  const src = path.join(buildDir, 'subpackages', 'resources', 'import');
  const dst = path.join(buildDir, 'assets', 'resources', 'import');
  if (!fs.existsSync(src)) {
    console.warn('[patch-wechatgame-config] missing subpackages/resources/import');
    return;
  }
  if (fs.existsSync(dst)) {
    fs.rmSync(dst, { recursive: true, force: true });
  }
  fs.cpSync(src, dst, { recursive: true });
  const jsonCount = fs.readdirSync(dst, { recursive: true }).filter((name) => {
    return typeof name === 'string' && name.endsWith('.json');
  }).length;
  console.log('[patch-wechatgame-config] copied import -> assets/resources/import', jsonCount, 'json');
}

/**
 * 主包读取 config/import，资源分包保留同一份兜底。
 * 两边任一份配置或合并包不一致，真机会出现“旧 config 请求已不存在 pack”的黑屏。
 */
function verifyResourcesPackConsistency(buildDir) {
  const mainConfigPath = path.join(buildDir, 'assets', 'resources', 'config.json');
  const subConfigPath = path.join(buildDir, 'subpackages', 'resources', 'config.json');
  if (!fs.existsSync(mainConfigPath) || !fs.existsSync(subConfigPath)) {
    throw new Error('[patch-wechatgame-config] resources config missing before pack verification');
  }

  const mainConfigBytes = fs.readFileSync(mainConfigPath);
  const subConfigBytes = fs.readFileSync(subConfigPath);
  if (!mainConfigBytes.equals(subConfigBytes)) {
    throw new Error(
      '[patch-wechatgame-config] assets/subpackages resources config mismatch; rebuild Cocos and patch again',
    );
  }

  let config;
  try {
    config = JSON.parse(mainConfigBytes.toString('utf8'));
  } catch (err) {
    throw new Error(
      `[patch-wechatgame-config] invalid resources config: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  const packIds = Object.keys(config.packs || {});
  for (const packId of packIds) {
    const rel = path.join(packId.slice(0, 2), `${packId}.json`);
    const mainPack = path.join(buildDir, 'assets', 'resources', 'import', rel);
    const subPack = path.join(buildDir, 'subpackages', 'resources', 'import', rel);
    if (!fs.existsSync(mainPack) || !fs.existsSync(subPack)) {
      throw new Error(
        `[patch-wechatgame-config] resources pack ${packId} missing; rebuild Cocos and patch again`,
      );
    }
    if (!fs.readFileSync(mainPack).equals(fs.readFileSync(subPack))) {
      throw new Error(
        `[patch-wechatgame-config] resources pack ${packId} differs between main and subpackage`,
      );
    }
  }

  console.log(
    `[patch-wechatgame-config] resources config/packs consistent (${packIds.length} packs)`,
  );
}

/** 运行时 override，确保 assetManager.init 能注册 resources 分包映射 */
function patchApplicationOverride(buildDir) {
  const appPath = path.join(buildDir, 'application.js');
  if (!fs.existsSync(appPath)) return;

  let src = fs.readFileSync(appPath, 'utf8');
  let changed = false;
  // 章节分包必须一并出现在 override 的 subpackages 列表里，否则运行时 override 会覆盖
  // settings.json 只保留 ['resources']，导致 wx.loadSubpackage('chapter_N') 未注册而失败。
  const chapterNames = chapterSubpackageNames(buildDir);
  const subsLiteral = ['resources', ...chapterNames].map((n) => `'${n}'`).join(', ');
  const beforeStrip = src;
  src = src.replace(
    /\n\s*rendering:\s*\{\s*\n\s*customPipeline:\s*false,\s*\n\s*renderPipeline:\s*'',\s*\n\s*\},/g,
    '',
  );
  if (src !== beforeStrip) {
    changed = true;
  }

  const assetsBlock =
    `assets: {\n                  subpackages: [${subsLiteral}],\n                  preloadBundles: [{ bundle: 'main' }],\n                },`;
  const splashBlock =
    "splashScreen: {\n                  totalTime: 0,\n                  displayRatio: 0,\n                  logo: { type: 'none' },\n                },";
  const screenBlock =
    "screen: {\n                  exactFitScreen: false,\n                },";

  if (!src.includes("preloadBundles: [{ bundle: 'main' }]")) {
    if (src.includes('overrideSettings: {')) {
      src = src.replace(
        /overrideSettings:\s*\{\s*\n\s*\/\/\s*assets:\s*\{[\s\S]*?\/\/\s*\}\s*\n\s*profiling:/,
        `overrideSettings: {\n                ${assetsBlock}\n                profiling:`,
      );
      if (!src.includes("preloadBundles: [{ bundle: 'main' }]")) {
        src = src.replace(
          'overrideSettings: {',
          `overrideSettings: {\n                ${assetsBlock}`,
        );
      }
    }
    changed = true;
  }

  if (!src.includes("logo: { type: 'none' }")) {
    src = src.replace(
      'overrideSettings: {',
      `overrideSettings: {\n                ${splashBlock}`,
    );
    changed = true;
  }

  if (!src.includes('exactFitScreen: false')) {
    if (src.includes("logo: { type: 'none' }")) {
      src = src.replace(
        /splashScreen:\s*\{\s*\n\s*totalTime:\s*0,\s*\n\s*displayRatio:\s*0,\s*\n\s*logo:\s*\{\s*type:\s*'none'\s*\},\s*\n\s*\},/,
        `$&\n                ${screenBlock}`,
      );
    } else {
      src = src.replace(
        'overrideSettings: {',
        `overrideSettings: {\n                ${screenBlock}`,
      );
    }
    changed = true;
  }

  // 幂等收口：无论 assetsBlock 是否本次新插入，确保 override 的 subpackages 数组与全部 chapter 分包一致。
  if (chapterNames.length) {
    const desired = `subpackages: [${subsLiteral}]`;
    const updated = src.replace(
      /subpackages:\s*\[[^\]]*\](?=\s*,\s*\n\s*preloadBundles:\s*\[\{ bundle: 'main' \}\])/,
      desired,
    );
    if (updated !== src) {
      src = updated;
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(appPath, src, 'utf8');
    console.log(
      '[patch-wechatgame-config] application.js overrideSettings patched, subpackages:',
      `[${subsLiteral}]`,
    );
  }
}

/** 避免 Canvas 销毁时 director.root 未就绪导致 removeScreen 崩溃 */
function patchEngineCanvasGuard(buildDir) {
  const ccPath = path.join(buildDir, 'cocos-js', 'cc.js');
  if (!fs.existsSync(ccPath)) return;

  let src = fs.readFileSync(ccPath, 'utf8');
  const addOld = 'w.director.root.batcher2D.addScreen(this)';
  const addNew =
    '(w.director.root&&w.director.root.batcher2D&&w.director.root.batcher2D.addScreen(this))';
  const rmOld = 'w.director.root.batcher2D.removeScreen(this)';
  const rmNew =
    '(w.director.root&&w.director.root.batcher2D&&w.director.root.batcher2D.removeScreen(this))';

  if (src.includes(addOld) && !src.includes('[CoupleGame] canvas-guard')) {
    src = src.replaceAll(addOld, addNew);
    src = src.replaceAll(rmOld, rmNew);
    fs.writeFileSync(ccPath, `/* [CoupleGame] canvas-guard */\n${src}`, 'utf8');
    console.log('[patch-wechatgame-config] cc.js Canvas batcher2D guard patched');
  }
}

/** 强制 resources 走微信分包路径，避免真机按 assets/resources/import 读取 */
function patchEngineResourcesSubpackage(buildDir) {
  const adapterPath = path.join(buildDir, 'engine-adapter.js');
  if (!fs.existsSync(adapterPath)) return;

  let src = fs.readFileSync(adapterPath, 'utf8');
  if (src.includes('o==="resources"||_[o]')) return;

  const oldBranch = '_[o]?(';
  if (!src.includes(oldBranch)) {
    console.warn('[patch-wechatgame-config] engine-adapter resources branch not found');
    return;
  }

  src = src.replace(oldBranch, '(o==="resources"||_[o])?(');
  fs.writeFileSync(adapterPath, `/* [CoupleGame] resources-subpackage */\n${src}`, 'utf8');
  console.log('[patch-wechatgame-config] engine-adapter resources subpackage patched');
}

/**
 * 真机 loadSubpackage 后往往无法 readFile 分包根下 config.json；
 * resources 的 bundle 配置改从主包 assets/resources/config.json 读取，资源仍走 subpackages/resources/。
 * ⚠️ 只能对 resources 生效：原代码是「所有分包」通用的 config 路径构造器，
 * 若无条件写死成 resources，会让 chapter_* 等其它分包也去读 resources 的 config 而加载失败。
 */
function patchEngineResourcesConfigInMain(buildDir) {
  const adapterPath = path.join(buildDir, 'engine-adapter.js');
  if (!fs.existsSync(adapterPath)) return;

  let src = fs.readFileSync(adapterPath, 'utf8');

  const subConfigPath =
    'n=(y.platform===y.Platform.TAOBAO_MINI_GAME?"":"subpackages/").concat(o,"/config.").concat(a,"json"),h(o,t.onFileProgress';
  // 旧版（bug）：无条件写死 resources，会让 chapter_* 也去读 resources config。
  const legacyHardcoded =
    'n="assets/resources/config.".concat(a,"json"),h(o,t.onFileProgress';
  // 新版：resources → 主包 config（真机已验证）；其它分包 → 维持原「subpackages/<o>/config」逻辑。
  const mainConfigPath =
    'n=(o==="resources"?"assets/resources/config.".concat(a,"json"):(y.platform===y.Platform.TAOBAO_MINI_GAME?"":"subpackages/").concat(o,"/config.").concat(a,"json")),h(o,t.onFileProgress';

  if (src.includes(mainConfigPath)) return; // 已是新版
  if (src.includes(legacyHardcoded)) {
    // 修复已 patch 过的旧构建（无需重建即可纠正 chapter_* 读错 config 的 bug）。
    src = src.replace(legacyHardcoded, mainConfigPath);
  } else if (src.includes(subConfigPath)) {
    src = src.replace(subConfigPath, mainConfigPath);
  } else {
    console.warn('[patch-wechatgame-config] engine-adapter config path pattern not found');
    return;
  }
  fs.writeFileSync(
    adapterPath,
    src.startsWith('/* [CoupleGame] resources-config-main */')
      ? src
      : `/* [CoupleGame] resources-config-main */\n${src}`,
    'utf8',
  );
  console.log('[patch-wechatgame-config] engine-adapter resources config -> assets/resources');
}

/**
 * 真机 wx.access 对 subpackages/ 下路径常误报不存在，导致 bundle 内 import/native 加载失败。
 * 对 subpackages/ 跳过 exists 预检，交给 readFile/download 处理。
 */
function patchEngineSubpackageFileExists(buildDir) {
  const adapterPath = path.join(buildDir, 'engine-adapter.js');
  if (!fs.existsSync(adapterPath)) return;

  let src = fs.readFileSync(adapterPath, 'utf8');
  const oldExists =
    'function x(t,e,n){r(t,function(e){e?n(null,t):n(new Error("file ".concat(t," does not exist!")))})}';
  const newExists =
    'function x(t,e,n){0<=String(t).indexOf("subpackages/")?n(null,t):r(t,function(e){e?n(null,t):n(new Error("file ".concat(t," does not exist!")))})}';
  const brokenExists =
    'function x(t,e,n){0<=String(t).indexOf("subpackages/")?n(null,t):r(t,function(e){e?n(null,t):n(new Error("file ".concat(t," does not exist!"))})}';

  if (src.includes(newExists)) {
    return;
  }

  let changed = false;
  if (src.includes(brokenExists)) {
    src = src.replace(brokenExists, newExists);
    changed = true;
  } else if (src.includes(oldExists)) {
    src = src.replace(oldExists, newExists);
    changed = true;
  } else {
    console.warn('[patch-wechatgame-config] engine-adapter exists-check pattern not found');
    return;
  }

  if (!changed) return;
  fs.writeFileSync(
    adapterPath,
    src.startsWith('/* [CoupleGame] subpackage-exists-bypass */')
      ? src
      : `/* [CoupleGame] subpackage-exists-bypass */\n${src}`,
    'utf8',
  );
  console.log('[patch-wechatgame-config] engine-adapter subpackage exists bypass patched');
}

function patchWebAdapterSubpackageExists(buildDir) {
  const adapterPath = path.join(buildDir, 'web-adapter.js');
  if (!fs.existsSync(adapterPath)) return;

  let src = fs.readFileSync(adapterPath, 'utf8');
  if (src.includes('[CoupleGame] subpackage-exists-bypass')) return;

  const oldExists =
    'exists:function(e,t){o.access({path:e,success:function(){t&&t(!0)},fail:function(){t&&t(!1)}})}';
  const newExists =
    'exists:function(e,t){e&&0<=String(e).indexOf("subpackages/")?t&&t(!0):o.access({path:e,success:function(){t&&t(!0)},fail:function(){t&&t(!1)}})}';

  if (!src.includes(oldExists)) {
    console.warn('[patch-wechatgame-config] web-adapter exists pattern not found');
    return;
  }

  src = src.replace(oldExists, newExists);
  fs.writeFileSync(
    adapterPath,
    src.startsWith('/* [CoupleGame] subpackage-exists-bypass */')
      ? src
      : `/* [CoupleGame] subpackage-exists-bypass */\n${src}`,
    'utf8',
  );
  console.log('[patch-wechatgame-config] web-adapter subpackage exists bypass patched');
}

/** 将 import 请求从分包路径改到主包 assets/resources/import（真机可读） */
function patchEngineTransformImportRewrite(buildDir) {
  const adapterPath = path.join(buildDir, 'engine-adapter.js');
  if (!fs.existsSync(adapterPath)) return;

  let src = fs.readFileSync(adapterPath, 'utf8');
  const importRewrite =
    'o.url&&0<=o.url.indexOf("subpackages/resources/import/")&&(o.url=o.url.replace("subpackages/resources/import/","assets/resources/import/"))';
  const nativeRewrite =
    ',o.url&&0<=o.url.indexOf("subpackages/resources/native/")&&("/"!==o.url.charAt(0))&&(o.url="/".concat(o.url))';

  // 真机历史回归：native 加 / 前缀会触发 Error 4930，须移除
  if (src.includes(nativeRewrite)) {
    src = src.replaceAll(nativeRewrite, '');
  }

  if (src.includes(importRewrite) && !src.includes(nativeRewrite)) {
    return;
  }

  const brokenNeedle =
    'a.cacheEnabled}"o.url&&0<=o.url.indexOf("subpackages/resources/import/")&&(o.url=o.url.replace("subpackages/resources/import/","assets/resources/import/")),".cconb"===o.ext';
  const brokenFix = `a.cacheEnabled};${importRewrite},".cconb"===o.ext`;
  const freshNeedle = '&&a.cacheEnabled}".cconb"===o.ext';
  const freshInsert = `&&a.cacheEnabled};${importRewrite},".cconb"===o.ext`;

  if (src.includes(brokenNeedle)) {
    src = src.replace(brokenNeedle, brokenFix);
  } else if (src.includes(freshNeedle)) {
    src = src.replace(freshNeedle, freshInsert);
  } else {
    console.warn('[patch-wechatgame-config] engine-adapter import rewrite anchor not found');
    return;
  }

  if (!src.startsWith('/* [CoupleGame] import-main-rewrite */')) {
    src = `/* [CoupleGame] import-main-rewrite */\n${src}`;
  }
  fs.writeFileSync(adapterPath, src, 'utf8');
  console.log('[patch-wechatgame-config] engine-adapter import URL -> assets/resources/import');
}

/** 真机 Error 4930：引擎加载分包 native 失败，改读主包 copyCriticalNativeToMain 写入的路径 */
function patchEngineTransformNativeRewrite(buildDir) {
  const adapterPath = path.join(buildDir, 'engine-adapter.js');
  if (!fs.existsSync(adapterPath)) return;

  let src = fs.readFileSync(adapterPath, 'utf8');
  const nativeMainRewrite =
    'o.url&&0<=o.url.indexOf("subpackages/resources/native/")&&(o.url=o.url.replace("subpackages/resources/native/","assets/resources/native/"))';
  if (src.includes(nativeMainRewrite)) {
    return;
  }

  const importRewrite =
    'o.url&&0<=o.url.indexOf("subpackages/resources/import/")&&(o.url=o.url.replace("subpackages/resources/import/","assets/resources/import/"))';
  if (!src.includes(importRewrite)) {
    console.warn('[patch-wechatgame-config] engine-adapter native rewrite skipped — import rewrite missing');
    return;
  }

  src = src.replace(importRewrite, `${importRewrite},${nativeMainRewrite}`);
  if (!src.includes('[CoupleGame] native-main-rewrite')) {
    src = src.replace(
      '/* [CoupleGame] import-main-rewrite */',
      '/* [CoupleGame] import-main-rewrite native-main-rewrite */',
    );
  }
  fs.writeFileSync(adapterPath, src, 'utf8');
  console.log('[patch-wechatgame-config] engine-adapter native URL -> assets/resources/native');
}

/** 修正编译后 UiAssets：勿 loadBundle("subpackages/resources")，须用 bundle 名 resources */
function patchCompiledUiAssets(buildDir) {
  const mainIndex = path.join(buildDir, 'assets', 'main', 'index.js');
  if (!fs.existsSync(mainIndex)) return;

  let src = fs.readFileSync(mainIndex, 'utf8');
  const alreadyPatched = src.includes('[CoupleGame] uiassets-bundle-name');

  let changed = false;
  let marker = '[CoupleGame] uiassets-bundle-name';

  if (src.includes('[CoupleGame] uiassets-subpackage-load')) {
    src = src.replace('/* [CoupleGame] uiassets-subpackage-load */\n', '');
    marker = '[CoupleGame] uiassets-bundle-name';
    changed = true;
  }

  if (src.includes('loadBundle("subpackages/resources"')) {
    src = src.replaceAll('loadBundle("subpackages/resources"', 'loadBundle("resources"');
    changed = true;
  }

  if (src.includes('subpackages/resources/config.json')) {
    src = src.replaceAll('subpackages/resources/config.json', 'assets/resources/config.json');
    changed = true;
  }

  const brokenTail = '}))}))()),h)}function A(e){return"art/ui/"+e+"/spriteFrame"}';
  const fixedTail = '}))}))())),h)}function A(e){return"art/ui/"+e+"/spriteFrame"}';
  if (src.includes(brokenTail)) {
    src = src.replace(brokenTail, fixedTail);
    changed = true;
  }

  const legacyReady = 'console.log("[UiAssets] resources bundle ready",r.base),e(r)';
  const legacyFixed =
    'v()&&(r.base="subpackages/resources/",r.config&&(r.config.base="subpackages/resources/"),console.log("[CoupleGame] resources bundle base fixed",r.base)),console.log("[UiAssets] resources bundle ready",r.base),e(r)';
  const readySnippet =
    'v()&&!r.base.includes("subpackages/resources")?(console.error("[UiAssets] resources bundle base wrong",r.base),void e(null)):(console.log("[UiAssets] resources bundle ready",r.name,r.base),e(r))';

  if (src.includes(legacyFixed)) {
    src = src.replace(legacyFixed, readySnippet);
    changed = true;
  } else if (src.includes(legacyReady) && !src.includes('resources bundle base wrong')) {
    src = src.replace(legacyReady, readySnippet);
    changed = true;
  }

  if (!changed) {
    // 兼容新版构建产物：可能已不存在旧锚点，但内容已是正确形态。
    const hasWrongBundle = src.includes('loadBundle("subpackages/resources"') || src.includes("loadBundle('subpackages/resources'");
    const hasWrongConfig = src.includes('subpackages/resources/config.json');
    const hasCorrectBundle = src.includes('loadBundle("resources"') || src.includes("loadBundle('resources'");
    const hasCorrectConfig = src.includes('assets/resources/config.json');
    const alreadyCorrect = !hasWrongBundle && !hasWrongConfig && hasCorrectBundle && hasCorrectConfig;

    if (alreadyPatched) return;
    if (alreadyCorrect) {
      src = `/* ${marker} */\n${src}`;
      fs.writeFileSync(mainIndex, src, 'utf8');
      console.log('[patch-wechatgame-config] compiled UiAssets already correct (bundle=resources)');
      return;
    }
    console.warn('[patch-wechatgame-config] compiled UiAssets patch skipped (rebuild main or check minify)');
    return;
  }

  if (!alreadyPatched) {
    src = `/* ${marker} */\n${src}`;
  }
  src = src.replace(`/* ${marker} */\n/* ${marker} */\n`, `/* ${marker} */\n`);
  fs.writeFileSync(mainIndex, src, 'utf8');
  console.log('[patch-wechatgame-config] compiled UiAssets loadBundle(resources) patched');
}

/**
 * 主包 native 清单：从 UiAssets.ts 的 UI_SPRITE_UUID 自动生成。
 * 真机 HTMLImageElement / bundle.load 读分包 native 会 Error 4930，须复制到主包。
 * 排除大背景（含 PVE 章节/营地/命运树，留分包）、结算页；
 * icons 与 PVE 首屏地图/HUD 须进主包（分包 copyFile 真机常失败且极慢）。
 * 含 icons 后主包须 <4096KB：跑 compress-ui-large-assets.py（含 BGM 压缩）后再 patch。
 */
const MAIN_NATIVE_EXCLUDE_KEYS = new Set([
  'backgrounds/bg_settlement',
  'pve/hud/bar_pve_info_9s',
  'pve/hud/bg_dpad',
  'pve/map/tile_floor_ch1',
  'pve/map/tile_floor_ch1L',
]);
const MAIN_NATIVE_EXCLUDE_PREFIXES = ['settlement/'];
/**
 * pve/map/ 中允许进入主包 critical native 的精确键集合（首屏必须）。
 * ch2-ch5 章节专属图标留分包，FogMapView._loadBaseArt() 异步预热，过渡期显示通用兜底。
 * ch1 专属图标必须进主包：artMap 的 GOBLIN_WARRIOR/GOBLIN_ARCHER 等 fallback 直接引用
 * icon_monster_ch1_normal 等；若排除会写入 1×1 占位 PNG，真机 loadWechatNativeSprite
 * 命中占位图"成功"加载，getCachedSprite 返回非空，glyph 兜底不触发，怪物全部消失。
 */
const PVE_MAP_CRITICAL_KEYS = new Set([
  'pve/map/tile_fog',
  // terrain_rock 跨章共享（ch1 GoblinChief 召唤 + ch3 FrostGiant 路径检测），必须进主包。
  'pve/map/terrain_rock',
  // tile_floor_ch2/ch3/ch4/ch5 源 PNG 从未存在，历史声明已清除。
  'pve/map/icon_player',
  'pve/map/icon_player_berserker',
  'pve/map/icon_player_archer',
  'pve/map/icon_player_rogue',
  'pve/map/icon_monster_goblin_warrior',
  'pve/map/icon_monster_goblin_archer',
  'pve/map/icon_monster_frost_goblin',
  'pve/map/icon_monster_fire_goblin',
  'pve/map/icon_monster_spirit_rat',
  'pve/map/icon_monster_goblin_chief',
  // ch2 怪物图标已迁入 chapter_2 分包，由 ChapterResourceLoader 进章时加载，不再列入主包 critical。

  'pve/map/icon_chest',
  'pve/map/icon_key',
  'pve/map/icon_exit',
  'pve/map/icon_portal',
  'pve/map/icon_idol',
  'pve/map/icon_hot_spring',
  'pve/map/icon_altar',
  'pve/map/icon_blacksmith',
  'pve/map/icon_fragment',
]);
const PVE_NON_MAP_CRITICAL_PREFIXES = [
  'pve/hud/',
  'pve/lobby/',
  'pve/icons/icon_hud_',
];
const WECHAT_BGM_UUID = 'f1a2b3c4-5678-4901-a234-567890abcdef';
/**
 * SFX 主包白名单（AudioManager 接入的最小集）：与 BGM 一样，分包内 native 真机
 * 路径会被 engine-adapter 重写到 assets/resources/native/，必须复制到主包。
 * UUID 来源：assets/resources/audio/sfx/<cat>/<id>.mp3 的 .meta（查 Cocos 资源管理器）。
 * 新增/删除 SFX 时同步本表，并重跑 npm run build:wechat。
 */
const WECHAT_SFX_NATIVES = [
  { uuid: '85ca5d01-2cbb-4840-bb92-4f12488366e9', label: 'sfx/ui/sfx_ui_click' },
  { uuid: '9677f90b-2918-4d56-a468-4663e697e971', label: 'sfx/ui/sfx_run_failed' },
  { uuid: '41ed47b3-e63e-4662-b97e-eb4ea28d8f07', label: 'sfx/battle/sfx_attack_hit' },
  { uuid: 'e2d73f5b-0efa-42ac-a896-7e39ea1ab389', label: 'sfx/battle/sfx_boss_appear' },
  { uuid: '806d541a-108d-4e47-801c-bdd2b98b04f2', label: 'sfx/explore/sfx_player_move' },
  { uuid: 'd3c51eca-4438-4efa-a127-840ea393414a', label: 'sfx/explore/sfx_reward_get' },
  // 注：sfx_damage_pop（暂无文件，路径复用 attack_hit）与 sfx_door_open（路径复用 reward_get）
  // 在 AudioManager 里被映射到现有 mp3，无需独立入主包。
];
/** 1×1 PNG，仅供 IDE 编译过 ENOENT；运行时 UiAssets 跳过主包路径读 excluded 资源 */
const COMPILE_PLACEHOLDER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function isMainNativeExcluded(label) {
  if (MAIN_NATIVE_EXCLUDE_KEYS.has(label)) return true;
  if (MAIN_NATIVE_EXCLUDE_PREFIXES.some((p) => label.startsWith(p))) return true;
  if (label === 'pve/backgrounds/bg_pve_ch1') return false;
  if (label === 'pve/backgrounds/bg_pve_loading_expedition') return false;
  if (/^pve\/backgrounds\/bg_pve_ch[2-5]_runtime$/.test(label)) return true;
  if (label.startsWith('pve/map/')) return !PVE_MAP_CRITICAL_KEYS.has(label);
  if (label.startsWith('pve/')) return !PVE_NON_MAP_CRITICAL_PREFIXES.some((p) => label.startsWith(p));
  return false;
}

const PVE_ONLY_LOBBY_KEYS = new Set([
  'backgrounds/bg_lobby',
]);

function isPackagedForCurrentFlavor(label) {
  if (!IS_PVE_ONLY) return true;
  return label.startsWith('pve/') || PVE_ONLY_LOBBY_KEYS.has(label);
}

function sourceAssetPathForLabel(label, ext) {
  if (label === 'bgm_main') {
    return path.join(root, 'assets', 'resources', 'audio', 'bgm_main.mp3');
  }
  if (ext === '.jpg') {
    return path.join(root, 'assets', 'resources', 'art', 'ui', `${label}.jpg`);
  }
  return path.join(root, 'assets', 'resources', 'art', 'ui', `${label}.png`);
}

function buildCriticalNativeManifest() {
  const uiAssetsPath = path.join(root, 'assets', 'scripts', 'ui', 'UiAssets.ts');
  if (!fs.existsSync(uiAssetsPath)) {
    console.warn('[patch-wechatgame-config] UiAssets.ts missing — using empty critical manifest');
    return [];
  }
  const src = fs.readFileSync(uiAssetsPath, 'utf8');
  const re = /'([^']+)': '([0-9a-f-]+)@f9941'/g;
  const files = [];
  const seen = new Set();
  let match;
  while ((match = re.exec(src))) {
    const label = match[1];
    const uuid = match[2];
    if (!isPackagedForCurrentFlavor(label)) continue;
    if (isMainNativeExcluded(label)) continue;
    const ext =
      label === 'pve/backgrounds/bg_pve_loading_expedition'
      || /^pve\/backgrounds\/bg_pve_ch[2-5]_runtime$/.test(label)
        ? '.jpg'
        : '.png';
    if (seen.has(uuid)) continue;
    if (!fs.existsSync(sourceAssetPathForLabel(label, ext))) continue;
    seen.add(uuid);
    files.push({ uuid, ext, label });
  }
  files.push({ uuid: WECHAT_BGM_UUID, ext: '.mp3', label: 'bgm_main' });
  for (const sfx of WECHAT_SFX_NATIVES) {
    if (seen.has(sfx.uuid)) continue;
    seen.add(sfx.uuid);
    files.push({ uuid: sfx.uuid, ext: '.mp3', label: sfx.label });
  }
  return files;
}

function buildExcludedNativeManifest() {
  const uiAssetsPath = path.join(root, 'assets', 'scripts', 'ui', 'UiAssets.ts');
  if (!fs.existsSync(uiAssetsPath)) return [];
  const src = fs.readFileSync(uiAssetsPath, 'utf8');
  const re = /'([^']+)': '([0-9a-f-]+)@f9941'/g;
  const files = [];
  const seen = new Set();
  let match;
  while ((match = re.exec(src))) {
    const label = match[1];
    const uuid = match[2];
    if (!isPackagedForCurrentFlavor(label)) continue;
    const excluded = isMainNativeExcluded(label);
    if (!excluded || seen.has(uuid)) continue;
    const ext =
      label === 'pve/backgrounds/bg_pve_loading_expedition'
      || /^pve\/backgrounds\/bg_pve_ch[2-5]_runtime$/.test(label)
        ? '.jpg'
        : '.png';
    if (!fs.existsSync(sourceAssetPathForLabel(label, ext))) continue;
    seen.add(uuid);
    files.push({ uuid, ext, label });
  }
  return files;
}

/**
 * 禁止只删除 resources/native 中的 PVP 文件：Cocos 生成的 config/import
 * 仍会引用它们，会导致同 bundle 的 PVE 图片加载被连续 ENOENT 干扰。
 * 彻底剥离必须通过独立 asset bundle 让 Creator 重建索引。
 */
function purgePvpNativeForPveOnly(_buildDir) {
  return { removed: 0, totalKb: 0 };
}

/** 恢复曾被旧版 PVE-only patch 错删的 UI native 文件。 */
function restoreUiNativeToSubpackage(buildDir) {
  const uiAssetsPath = path.join(root, 'assets', 'scripts', 'ui', 'UiAssets.ts');
  const subNative = path.join(buildDir, 'subpackages', 'resources', 'native');
  if (!fs.existsSync(uiAssetsPath) || !fs.existsSync(subNative)) {
    return { restored: 0, totalKb: 0 };
  }

  const src = fs.readFileSync(uiAssetsPath, 'utf8');
  const re = /'([^']+)': '([0-9a-f-]+)@f9941'/g;
  let restored = 0;
  let totalBytes = 0;
  let match;
  while ((match = re.exec(src))) {
    const label = match[1];
    const uuid = match[2];
    const sourcePng = path.join(
      root,
      'assets',
      'resources',
      'art',
      'ui',
      `${label}.png`,
    );
    if (!fs.existsSync(sourcePng)) continue;
    const dest = path.join(subNative, uuid.slice(0, 2), `${uuid}.png`);
    if (fs.existsSync(dest)) continue;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(sourcePng, dest);
    const size = fs.statSync(dest).size;
    totalBytes += size;
    restored += 1;
  }
  if (restored > 0) {
    console.log(
      `[patch-wechatgame-config] restored resources native ${restored} files, ${Math.round(totalBytes / 1024)} KB`,
    );
  }
  return { restored, totalKb: Math.round(totalBytes / 1024) };
}

function purgeStrayNativeBackups(buildDir) {
  const visit = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const filePath = path.join(dir, name);
      const st = fs.statSync(filePath);
      if (st.isDirectory()) {
        visit(filePath);
        continue;
      }
      if (!/\.(pngbak|bak|mp3bak)$/i.test(name)) continue;
      fs.rmSync(filePath, { force: true });
      console.log('[patch-wechatgame-config] removed stray native backup', filePath.replace(buildDir, ''));
    }
  };
  for (const rel of ['assets/resources/native', 'subpackages/resources/native']) {
    const nativeDir = path.join(buildDir, rel);
    if (!fs.existsSync(nativeDir)) continue;
    visit(nativeDir);
  }
}

/** 压缩脚本更新源文件后，无需整包重建即可让 patch 复制更小体积（BGM、背景） */
function syncCompressedSourceNative(buildDir) {
  const subNative = path.join(buildDir, 'subpackages', 'resources', 'native');
  if (!fs.existsSync(subNative)) return;

  const items = [
    {
      label: 'backgrounds/bg_lobby',
      uuid: '61d7272b-0616-4fd0-b218-e6379344531e',
      ext: '.png',
      src: path.join(root, 'assets', 'resources', 'art', 'ui', 'backgrounds', 'bg_lobby.png'),
    },
    {
      label: 'backgrounds/bg_room',
      uuid: '1201f551-924a-4b0f-b9b7-fc2c8adf1808',
      ext: '.png',
      src: path.join(root, 'assets', 'resources', 'art', 'ui', 'backgrounds', 'bg_room.png'),
    },
    {
      label: 'backgrounds/bg_board',
      uuid: '9dab1592-e610-4b0e-8557-9b0ad3ed894c',
      ext: '.png',
      src: path.join(root, 'assets', 'resources', 'art', 'ui', 'backgrounds', 'bg_board.png'),
    },
    {
      label: 'backgrounds/bg_settlement',
      uuid: '3af7d3db-39e6-4c45-bb10-ae01b6694821',
      ext: '.png',
      src: path.join(root, 'assets', 'resources', 'art', 'ui', 'backgrounds', 'bg_settlement.png'),
    },
    {
      label: 'pve/backgrounds/bg_pve_ch1',
      uuid: '41cfbfa8-79b3-4c15-8e9b-24539c23cd1d',
      ext: '.png',
      src: path.join(root, 'assets', 'resources', 'art', 'ui', 'pve', 'backgrounds', 'bg_pve_ch1.png'),
    },
    {
      label: 'pve/map/tile_floor_ch1',
      uuid: '2e6ec7ed-fa51-4278-ad56-f0ddb03dfbe6',
      ext: '.png',
      src: path.join(root, 'assets', 'resources', 'art', 'ui', 'pve', 'map', 'tile_floor_ch1.png'),
    },
    {
      label: 'pve/map/tile_fog',
      uuid: 'cb221eaf-62c2-42df-b751-2d6d521e1652',
      ext: '.png',
      src: path.join(root, 'assets', 'resources', 'art', 'ui', 'pve', 'map', 'tile_fog.png'),
    },
    {
      label: 'bgm_main',
      uuid: WECHAT_BGM_UUID,
      ext: '.mp3',
      src: path.join(root, 'assets', 'resources', 'audio', 'bgm_main.mp3'),
    },
  ];

  for (const item of items) {
    if (!fs.existsSync(item.src)) continue;
    const prefix = item.uuid.slice(0, 2);
    const name = `${item.uuid}${item.ext}`;
    const dest = path.join(subNative, prefix, name);
    if (!fs.existsSync(path.dirname(dest))) continue;
    const before = fs.existsSync(dest) ? fs.statSync(dest).size : 0;
    fs.copyFileSync(item.src, dest);
    const after = fs.statSync(dest).size;
    if (before !== after) {
      console.log(
        `[patch-wechatgame-config] synced compressed ${item.label} ${Math.round(before / 1024)} KB -> ${Math.round(after / 1024)} KB`,
      );
    }
  }

  // 美术源图压缩后允许直接重跑 patch，无需仅为 PNG 体积变化重新构建整个 Cocos 包。
  // UI_SPRITE_UUID 的 key 与 assets/resources/art/ui 下的相对路径保持一致。
  for (const item of buildCriticalNativeManifest()) {
    const src = path.join(root, 'assets', 'resources', 'art', 'ui', `${item.label}${item.ext}`);
    if (!fs.existsSync(src)) continue;
    const prefix = item.uuid.slice(0, 2);
    const dest = path.join(subNative, prefix, `${item.uuid}${item.ext}`);
    if (!fs.existsSync(path.dirname(dest))) continue;
    const before = fs.existsSync(dest) ? fs.statSync(dest).size : 0;
    const sourceSize = fs.statSync(src).size;
    if (before === sourceSize) continue;
    fs.copyFileSync(src, dest);
    console.log(
      `[patch-wechatgame-config] synced critical source ${item.label} ${Math.round(before / 1024)} KB -> ${Math.round(sourceSize / 1024)} KB`,
    );
  }
}

function copyCriticalNativeToMain(buildDir) {
  const subNative = path.join(buildDir, 'subpackages', 'resources', 'native');
  const mainNative = path.join(buildDir, 'assets', 'resources', 'native');
  if (!fs.existsSync(subNative)) {
    console.warn('[patch-wechatgame-config] copyCriticalNative skipped — subpackage native missing');
    return { copied: 0, totalKb: 0 };
  }

  let copied = 0;
  let totalBytes = 0;
  const manifest = buildCriticalNativeManifest();
  for (const item of manifest) {
    const prefix = item.uuid.slice(0, 2);
    const name = `${item.uuid}${item.ext}`;
    const src = path.join(subNative, prefix, name);
    if (!fs.existsSync(src)) {
      console.warn('[patch-wechatgame-config] critical native missing in subpackage', item.label, name);
      continue;
    }
    const destDir = path.join(mainNative, prefix);
    fs.mkdirSync(destDir, { recursive: true });
    const dest = path.join(destDir, name);
    fs.copyFileSync(src, dest);
    const size = fs.statSync(dest).size;
    totalBytes += size;
    copied += 1;
    console.log(
      `[patch-wechatgame-config] critical native -> main ${item.label} ${Math.round(size / 1024)} KB`,
    );
  }
  console.log(
    `[patch-wechatgame-config] critical native manifest ${manifest.length} files, ${Math.round(totalBytes / 1024)} KB`,
  );
  return { copied, totalKb: Math.round(totalBytes / 1024), count: manifest.length };
}

/**
 * 主包 config+import 引用 excluded native，IDE 编译须文件存在；写 1×1 占位 PNG（~70B），不计入主包体积。
 * packOptions.ignore 对上传体积无效，禁止复制完整大背景/结算图到主包。
 */
function writeCompileNativePlaceholders(buildDir) {
  const mainNative = path.join(buildDir, 'assets', 'resources', 'native');
  const manifest = buildExcludedNativeManifest();
  let written = 0;
  let replacedKb = 0;

  for (const item of manifest) {
    const prefix = item.uuid.slice(0, 2);
    const name = `${item.uuid}${item.ext}`;
    const dest = path.join(mainNative, prefix, name);
    const before = fs.existsSync(dest) ? fs.statSync(dest).size : 0;
    if (before > 0 && before <= 512) continue;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, COMPILE_PLACEHOLDER_PNG);
    written += 1;
    if (before > 512) {
      replacedKb += before / 1024;
    }
    console.log(
      `[patch-wechatgame-config] compile placeholder ${item.label} ${Math.round(before / 1024)} KB -> ${COMPILE_PLACEHOLDER_PNG.length} B`,
    );
  }

  if (written > 0) {
    console.log(
      `[patch-wechatgame-config] compile placeholders ${written} files (replaced ~${Math.round(replacedKb)} KB)`,
    );
  }
  return { written, replacedKb: Math.round(replacedKb) };
}

/** 保留占位：不再把 assets/resources/native 重写到分包（与 copyCriticalNativeToMain 冲突） */
function patchCompiledCriticalNativePaths(_buildDir) {
  /* no-op */
}

/** 跳过 first-screen.js WebGL 启动页（与 Cocos 共用 canvas 会触发 Error 5000 循环） */
function patchGameBoot(buildDir) {
  const gamePath = path.join(buildDir, 'game.js');
  if (!fs.existsSync(gamePath)) return;

  let src = fs.readFileSync(gamePath, 'utf8');
  if (src.includes('[CoupleGame] boot-skip-first-screen')) {
    return;
  }

  src = src.replace("const firstScreen = require('./first-screen');\r\n\r\n", '');
  src = src.replace("const firstScreen = require('./first-screen');\n\n", '');

  const bootBlock = `// [CoupleGame] boot-skip-first-screen
System.import('./application.js')
    .then(function (module) { return new module.Application(); })
    .then(function (application) { return onApplicationCreated(application); })
    .catch(function (err) {
    console.error('[CoupleGame] boot failed', err);
});

function onApplicationCreated(application) {
    return System.import('cc').then(function (cc) {
        require('./engine-adapter');
        return application.init(cc);
    }).then(function () {
        console.log('[CoupleGame] starting cc.game');
        return application.start().catch(function (err) {
            console.error('[CoupleGame] cc.game.start failed', err);
            throw err;
        });
    });
}`;

  const startIdx = src.indexOf('firstScreen.start');
  const endMarker = '}  // init app';
  const endIdx = src.lastIndexOf(endMarker);
  if (startIdx === -1 || endIdx === -1 || startIdx >= endIdx) {
    console.warn('[patch-wechatgame-config] game.js skip-first-screen skipped (format changed)');
    return;
  }

  src = `${src.slice(0, startIdx)}${bootBlock}\n\n${src.slice(endIdx)}`;
  fs.writeFileSync(gamePath, src, 'utf8');
  console.log('[patch-wechatgame-config] game.js skip first-screen boot');
}

function patchGameJson(buildDir) {
  const target = path.join(buildDir, 'game.json');
  if (!fs.existsSync(source)) {
    throw new Error(`Missing source config: ${source}`);
  }

  const patch = JSON.parse(fs.readFileSync(source, 'utf8'));
  const useEnginePlugin = patch.useEnginePlugin === true;
  const { useEnginePlugin: _drop, ...patchFields } = patch;

  let game = {};
  if (fs.existsSync(target)) {
    try {
      game = JSON.parse(fs.readFileSync(target, 'utf8'));
    } catch (e) {
      console.warn('[patch-wechatgame-config] parse existing game.json failed');
    }
  }

  const merged = { ...game, ...patchFields };
  if (game.subpackages?.length && !patchFields.subpackages) {
    merged.subpackages = game.subpackages;
  }

  if (useEnginePlugin) {
    if (game.plugins && !patchFields.plugins) {
      merged.plugins = game.plugins;
    }
  } else {
    delete merged.plugins;
  }

  const hasSubResources = fs.existsSync(path.join(buildDir, 'subpackages', 'resources'));
  if (hasSubResources) {
    const entry = { name: 'resources', root: 'subpackages/resources/' };
    const list = (Array.isArray(merged.subpackages) ? merged.subpackages : []).filter(
      (s) => s && s.name !== 'resources',
    );
    list.push(entry);
    merged.subpackages = list;
  }

  // PVE 章节背景分包 chapter_*（Cocos 已生成的就注册到 game.json，幂等去重）。
  const chapterNames = chapterSubpackageNames(buildDir);
  if (chapterNames.length) {
    const existing = Array.isArray(merged.subpackages) ? merged.subpackages : [];
    const filtered = existing.filter((s) => s && !chapterNames.includes(s.name));
    for (const name of chapterNames) {
      filtered.push({ name, root: `subpackages/${name}/` });
    }
    merged.subpackages = filtered;
  }

  fs.writeFileSync(target, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  return { target, merged, useEnginePlugin, hasSubResources };
}

/** 补全 build 内 project.config（缺 libVersion 时微信工具可能无响应） */
function syncProjectConfig(buildDir) {
  const target = path.join(buildDir, 'project.config.json');
  const rootCfgPath = path.join(root, 'project.config.json');
  if (!fs.existsSync(target)) return;

  let cfg = {};
  try {
    cfg = JSON.parse(fs.readFileSync(target, 'utf8'));
  } catch {
    return;
  }

  cfg.miniprogramRoot = './';
  cfg.compileType = 'game';
  cfg.appid = cfg.appid || 'wxfb28c2b166baf0e2';
  cfg.packOptions = cfg.packOptions || { ignore: [], include: [] };
  cfg.packOptions.ignore = Array.isArray(cfg.packOptions.ignore) ? cfg.packOptions.ignore : [];
  cfg.packOptions.include = Array.isArray(cfg.packOptions.include) ? cfg.packOptions.include : [];

  if (fs.existsSync(rootCfgPath)) {
    const rootCfg = JSON.parse(fs.readFileSync(rootCfgPath, 'utf8'));
    cfg.libVersion = rootCfg.libVersion || cfg.libVersion || '3.16.1';
    cfg.setting = { ...rootCfg.setting, ...cfg.setting, es6: true, enhance: true };
  } else {
    cfg.libVersion = cfg.libVersion || '3.16.1';
    cfg.setting = { es6: true, enhance: true, minified: true, ...(cfg.setting || {}) };
  }

  cfg.packOptions.ignore = cfg.packOptions.ignore.filter((item) => {
    if (!item) return false;
    if (item.type === 'file' && item.value === 'assets/resources/config.json') return false;
    if (item.type === 'folder' && item.value === 'assets/resources/import') return false;
    if (item.type === 'folder' && item.value === 'assets/resources/native') return false;
    return true;
  });

  fs.writeFileSync(target, `${JSON.stringify(cfg, null, 2)}\n`, 'utf8');
  console.log('[patch-wechatgame-config] project.config.json libVersion:', cfg.libVersion);
}

function verifyJsSyntax(buildDir, relPath) {
  const filePath = path.join(buildDir, relPath);
  if (!fs.existsSync(filePath)) return;
  const { status, stderr } = require('child_process').spawnSync(
    process.execPath,
    ['--check', filePath],
    { encoding: 'utf8' },
  );
  if (status !== 0) {
    throw new Error(
      `[patch-wechatgame-config] syntax error in ${relPath}: ${stderr || 'node --check failed'}`,
    );
  }
}

function verifyBuildDir(buildDir) {
  const checks = [
    ['game.js', path.join(buildDir, 'game.js')],
    ['game.json', path.join(buildDir, 'game.json')],
    ['src/settings.json', path.join(buildDir, 'src', 'settings.json')],
    ['subpackages/resources', path.join(buildDir, 'subpackages', 'resources', 'config.json')],
    ['subpackages/resources/game.js', path.join(buildDir, 'subpackages', 'resources', 'game.js')],
    ['assets/resources/config.json', path.join(buildDir, 'assets', 'resources', 'config.json')],
    ['assets/resources/game.js', path.join(buildDir, 'assets', 'resources', 'game.js')],
    ['assets/resources/index.js', path.join(buildDir, 'assets', 'resources', 'index.js')],
    ['cocos-js/cc.js', path.join(buildDir, 'cocos-js', 'cc.js')],
  ];
  const missing = checks.filter(([, p]) => !fs.existsSync(p)).map(([name]) => name);
  if (missing.length) {
    throw new Error(`[patch-wechatgame-config] missing: ${missing.join(', ')}`);
  }

  const stubImport = path.join(buildDir, 'assets', 'resources', 'import');
  if (!fs.existsSync(stubImport)) {
    throw new Error('[patch-wechatgame-config] assets/resources/import missing after copy');
  }

  verifyResourcesPackConsistency(buildDir);
  console.log('[patch-wechatgame-config] build structure OK');
  const nested = path.join(buildDir, 'wechatgame-001');
  if (fs.existsSync(nested)) {
    console.warn('[patch-wechatgame-config] remove stale nested folder:', nested);
  }
}

function writePatchStamp(buildDir, info) {
  const target = path.join(buildDir, '.patch-last-run.json');
  fs.writeFileSync(
    target,
    `${JSON.stringify(
      {
        patchedAt: new Date().toISOString(),
        ...info,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
}

function runPatch(buildDirHint) {
  assertNoStrayResourceSidecars();
  const buildDir = resolveBuildDir(buildDirHint);
  // 章节分包须在 resources 处理前搬到 subpackages/，让后续 settings/game.json/override 注册时能扫到。
  relocateChapterSubpackagesToSub(buildDir);
  const hadSub = ensureResourcesSubpackage(buildDir);
  assertBuildHasNoImportedSidecars(buildDir);
  const { target, merged, useEnginePlugin, hasSubResources } = patchGameJson(buildDir);
  patchApplicationOverride(buildDir);
  patchGameBoot(buildDir);
  patchEngineCanvasGuard(buildDir);
  patchEngineResourcesSubpackage(buildDir);
  patchEngineResourcesConfigInMain(buildDir);
  patchEngineSubpackageFileExists(buildDir);
  patchWebAdapterSubpackageExists(buildDir);
  patchEngineTransformImportRewrite(buildDir);
  patchEngineTransformNativeRewrite(buildDir);
  verifyJsSyntax(buildDir, 'engine-adapter.js');
  verifyJsSyntax(buildDir, 'web-adapter.js');
  patchCompiledUiAssets(buildDir);
  patchCompiledCriticalNativePaths(buildDir);
  syncProjectConfig(buildDir);
  if (hadSub) {
    ensureResourcesEntryScripts(buildDir);
  }
  syncCompressedSourceNative(buildDir);
  purgeStrayNativeBackups(buildDir);
  const restoredNative = restoreUiNativeToSubpackage(buildDir);
  const pvpNative = purgePvpNativeForPveOnly(buildDir);
  const criticalNative = copyCriticalNativeToMain(buildDir);
  writeCompileNativePlaceholders(buildDir);
  verifyBuildDir(buildDir);

  const subDir = path.join(buildDir, 'subpackages');
  const subKb = fs.existsSync(subDir) ? dirSizeKb(subDir) : 0;
  const assetsKb = dirSizeKb(path.join(buildDir, 'assets'), true);
  const rootKb = dirSizeKb(buildDir, true) - assetsKb - subKb;
  const mainKb = assetsKb + rootKb;

  console.log(`[patch-wechatgame-config] build dir: ${buildDir}`);
  console.log(`[patch-wechatgame-config] build flavor: ${BUILD_FLAVOR}`);
  console.log(`[patch-wechatgame-config] merged ${source} -> ${target}`);
  console.log(`[patch-wechatgame-config] useEnginePlugin=${useEnginePlugin}`);
  console.log(
    `[patch-wechatgame-config] est. main ~${mainKb} KB (limit 4096 KB), subpackages ~${subKb} KB`,
  );
  if (mainKb > 4096) {
    console.warn('[patch-wechatgame-config] WARNING: main package may exceed WeChat 4MB limit');
    console.warn(
      '[patch-wechatgame-config] shrink: python scripts/compress-ui-large-assets.py, or trim MAIN_NATIVE_EXCLUDE_* in patch script',
    );
  } else if (criticalNative.totalKb > 0) {
    console.log(
      `[patch-wechatgame-config] critical native in main: ${criticalNative.count} files, ~${criticalNative.totalKb} KB`,
    );
  }
  const resourcesCfg = path.join(buildDir, 'subpackages', 'resources', 'config.json');
  if (fs.existsSync(resourcesCfg)) {
    const cfgKb = Math.round(fs.statSync(resourcesCfg).size / 1024);
    console.log(`[patch-wechatgame-config] subpackages/resources/config.json ${cfgKb} KB`);
    if (cfgKb < 1) {
      throw new Error('[patch-wechatgame-config] subpackages/resources/config.json is empty');
    }
  }
  if (subKb > 0 && subKb < 100) {
    console.warn(
      '[patch-wechatgame-config] WARNING: subpackages look too small — 真机可能缺 config.json，请确认已执行 Cocos 构建并重新 patch',
    );
  }
  if (merged.subpackages?.length) {
    console.log(
      `[patch-wechatgame-config] subpackages: ${merged.subpackages.map((s) => s.name || s.root).join(', ')}`,
    );
  } else if (!hadSub) {
    console.warn('[patch-wechatgame-config] resources subpackage not applied');
  }

  writePatchStamp(buildDir, {
    mainKb,
    subpackagesKb: subKb,
    subpackages: merged.subpackages ?? [],
    criticalNativeCopied: criticalNative.copied,
    criticalNativeKb: criticalNative.totalKb,
    buildFlavor: BUILD_FLAVOR,
    pvpNativeRemoved: pvpNative.removed,
    pvpNativeRemovedKb: pvpNative.totalKb,
    nativeRestored: restoredNative.restored,
    nativeRestoredKb: restoredNative.totalKb,
  });

  return { buildDir, merged, useEnginePlugin, hasSubResources, hadSub };
}

if (require.main === module) {
  runPatch();
}

module.exports = {
  resolveBuildDir,
  ensureResourcesSubpackage,
  removeResourcesCompatLink,
  ensureResourcesEntryScripts,
  patchApplicationOverride,
  patchGameBoot,
  patchEngineCanvasGuard,
  patchEngineResourcesSubpackage,
  patchEngineResourcesConfigInMain,
  patchEngineSubpackageFileExists,
  patchWebAdapterSubpackageExists,
  patchEngineTransformImportRewrite,
  copyResourcesImportToMain,
  verifyResourcesPackConsistency,
  patchCompiledUiAssets,
  patchCompiledCriticalNativePaths,
  buildCriticalNativeManifest,
  copyCriticalNativeToMain,
  purgePvpNativeForPveOnly,
  restoreUiNativeToSubpackage,
  patchGameJson,
  runPatch,
};
