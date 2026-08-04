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
      '[patch-wechatgame-config] fix Creator: 鍙戝竷璺緞=project://build, 杈撳嚭鍚嶇О=wechatgame',
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
 * 宸叉惉鍒?subpackages/ 鐨?chapter_* 璧勬簮鍒嗗寘锛圥VE 绔犺妭鑳屾櫙锛岃 assets/scripts/pve/ChapterResourceLoader.ts锛夈€?
 * 涓?resources 鍒嗗寘涓嶅悓锛屽畠浠?*涓?*濂楃敤 resources 涓撳睘鐨?native鈫掍富鍖呴噸鍐欙紙閭ｄ簺瑙勫垯 key 鍦ㄥ瓧绗︿覆 'resources' 涓婏級锛?
 * 鍥犳 bundle.load 鐩存帴璇诲悇鑷垎鍖?native鈥斺€旇繖姝ｆ槸鐪熸満鑳屾櫙鑳芥樉绀虹殑鍏抽敭銆?
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

const EQUIPMENT_SUBPACKAGE_NAMES = ['equipment_tier1', 'equipment_tier2', 'equipment_tier3'];

function equipmentSubpackageNames(buildDir) {
  const subRoot = path.join(buildDir, 'subpackages');
  if (!fs.existsSync(subRoot)) return [];
  return EQUIPMENT_SUBPACKAGE_NAMES.filter((name) => fs.existsSync(path.join(subRoot, name)));
}

function runtimeSubpackageNames(buildDir) {
  return [...new Set([...chapterSubpackageNames(buildDir), ...equipmentSubpackageNames(buildDir)])].sort();
}

function writePlainSubpackageEntries(subRoot) {
  const body = "'use strict';\n";
  fs.writeFileSync(path.join(subRoot, 'index.js'), body, 'utf8');
  fs.writeFileSync(path.join(subRoot, 'game.js'), body, 'utf8');
}

function copyEquipmentSubpackages(buildDir) {
  const srcRoot = path.join(root, 'build_artifacts', 'pve-equipment-icons');
  if (!fs.existsSync(srcRoot)) {
    console.warn('[patch-wechatgame-config] missing build_artifacts/pve-equipment-icons, skip equipment subpackages');
    return [];
  }

  const copied = [];
  fs.mkdirSync(path.join(buildDir, 'subpackages'), { recursive: true });
  for (const name of EQUIPMENT_SUBPACKAGE_NAMES) {
    const src = path.join(srcRoot, name);
    if (!fs.existsSync(src)) {
      throw new Error(`[patch-wechatgame-config] missing equipment subpackage source: ${src}`);
    }
    const dest = path.join(buildDir, 'subpackages', name);
    if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
    fs.cpSync(src, dest, { recursive: true });
    writePlainSubpackageEntries(dest);
    copied.push(name);
    console.log(`[patch-wechatgame-config] copied equipment subpackage -> subpackages/${name}`);
  }
  return copied;
}

function copySpecialIconArtifacts(buildDir) {
  const srcRoot = path.join(root, 'build_artifacts', 'pve-special-icons');
  if (!fs.existsSync(srcRoot)) {
    console.warn('[patch-wechatgame-config] missing build_artifacts/pve-special-icons, skip boss icons');
    return [];
  }

  const mainSpecialIconRoot = path.join(buildDir, 'pve_special_icons');
  if (fs.existsSync(mainSpecialIconRoot)) {
    fs.rmSync(mainSpecialIconRoot, { recursive: true, force: true });
    console.log('[patch-wechatgame-config] removed main pve_special_icons copy');
  }

  const copied = [];
  const mainSrc = path.join(srcRoot, 'chapter_1');
  if (fs.existsSync(mainSrc)) {
    const mainDest = path.join(buildDir, 'subpackages', 'equipment_tier1', 'pve_special_icons', 'chapter_1');
    if (fs.existsSync(mainDest)) fs.rmSync(mainDest, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(mainDest), { recursive: true });
    fs.cpSync(mainSrc, mainDest, { recursive: true });
    copied.push('chapter_1');
    console.log('[patch-wechatgame-config] copied special icons -> subpackages/equipment_tier1/pve_special_icons/chapter_1');
  }

  for (const chapter of [2, 3, 4, 5]) {
    const src = path.join(srcRoot, `chapter_${chapter}`);
    if (!fs.existsSync(src)) continue;
    const dest = path.join(buildDir, 'subpackages', `chapter_${chapter}`, 'pve_special_icons');
    if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.cpSync(src, dest, { recursive: true });
    copied.push(`chapter_${chapter}`);
    console.log(`[patch-wechatgame-config] copied special icons -> subpackages/chapter_${chapter}/pve_special_icons`);
  }

  return copied;
}

/**
 * Cocos 鎶婃墍鏈?bundle锛堝惈閰嶆垚 subpackage 鐨勶級閮借緭鍑哄埌 build/assets/<name>/锛?
 * 涓?resources 涓€鏍凤紝椤荤敱鏈剼鏈妸 assets/chapter_* 鎼埌 subpackages/chapter_*锛?
 * 鍚﹀垯绔犺妭鑳屾櫙鐣欏湪涓诲寘銆佹拺鐖?4MB 涓斾笉鎴愬叾涓哄垎鍖呫€傛惉瀹岃ˉ game.js stub銆?
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
    console.log('[patch-wechatgame-config] no chapter_* bundle in build (check 妫€鏌ュ櫒 鍘嬬缉绫诲瀷=鍒嗗寘 + 閲嶆柊鏋勫缓)');
  }
  return all;
}

/** 寰俊缂栬瘧瑕佹眰姣忎釜鍒嗗寘鏍圭洰褰曟湁 game.js锛涘唴瀹归』涓?index.js 涓€鑷达紙涓嶈兘 require锛屽垎鍖呬笂涓嬫枃鏃犳硶瑙ｆ瀽锛?*/
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

/** 涓诲寘 stub锛氬叆鍙ｈ剼鏈?+ config锛堢湡鏈烘棤娉?fs.access 鍒嗗寘鍐?config锛岄』鏀句富鍖咃級 */
const RESOURCES_STUB_FILES = new Set(['index.js', 'game.js', 'config.json']);
const LEGACY_RESOURCES_STUB_FILES = new Set(['index.js', 'game.js', 'config.json']);

function isResourcesStubDir(dir) {
  if (!fs.existsSync(dir) || isPathSymlink(dir)) return false;
  const entries = fs.readdirSync(dir);
  if (!entries.length) return false;
  return entries.every((name) => LEGACY_RESOURCES_STUB_FILES.has(name));
}

/** 鍒嗗寘椤诲惈 import 鐩綍锛堜粎鏈?config/index 璇存槑鏇捐 stub 璇鐩栵紝闇€閲嶆柊鏋勫缓锛?*/
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
      '[patch-wechatgame-config] subpackages/resources/import missing 鈥?stub overwrote subpackage. Rebuild wechatgame in Cocos, then run patch again.',
    );
  }
  const hasJson = fs.readdirSync(importDir, { recursive: true }).some((name) => {
    if (typeof name !== 'string') return false;
    return name.endsWith('.json');
  });
  if (!hasJson) {
    throw new Error(
      '[patch-wechatgame-config] subpackages/resources/import is empty 鈥?rebuild wechatgame in Cocos Creator first.',
    );
  }
  const nativeCount = countSubpackageNativeFiles(buildDir);
  if (nativeCount < 1) {
    throw new Error(
      '[patch-wechatgame-config] subpackages/resources/native has no textures 鈥?rebuild wechatgame in Cocos Creator first.',
    );
  }
  console.log(
    `[patch-wechatgame-config] subpackages/resources native textures: ${nativeCount}`,
  );
}

/** Creator 鏈緭鍑哄垎鍖呮椂锛屾妸 resources 鎸埌 subpackages/ 骞舵敼閰嶇疆 */
function ensureResourcesSubpackage(buildDir) {
  const inMain = path.join(buildDir, 'assets', 'resources');
  const inSub = path.join(buildDir, 'subpackages', 'resources');
  const hasValidSubpackage =
    fs.existsSync(path.join(inSub, 'import')) && countSubpackageNativeFiles(buildDir) > 0;

  if (isPathSymlink(inMain)) {
    fs.rmSync(inMain, { force: true });
    console.log('[patch-wechatgame-config] removed stale assets/resources junction');
  } else if (hasValidSubpackage) {
    // 宸茬粡 patch 杩囩殑鏋勫缓鐩綍浼氬悓鏃跺瓨鍦ㄤ富鍖?stub 涓庣湡瀹炲垎鍖咃紱涓嶈鎶?stub 鍐嶇Щ鍔ㄨ鐩栧垎鍖呫€?
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
    // 娉ㄥ唽 chapter_* 绔犺妭鍒嗗寘锛圕ocos 涓€鑸凡鍔犲叆锛岃繖閲屽厹搴曠‘淇濅笉琚紡鎺夛級銆?
    for (const name of runtimeSubpackageNames(buildDir)) subs.add(name);
    settings.assets.subpackages = [...subs];
    // 鐪熸満鍚姩鍕块鍔犺浇 resources锛氶』鍏?wx.loadSubpackage锛屽惁鍒?readFile config.json 澶辫触鍗?splash
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

/** 鍏抽棴寮曟搸鍐呯疆 splash锛岄伩鍏嶄笌 first-screen.js 鍙岄噸閿€姣侊紙Error 5000锛?*/
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

/** 淇濈暀 Creator 鐢熸垚鐨勬覆鏌撶绾块厤缃紱鍏抽棴 customPipeline 浼氬鑷?pipelineSceneData 涓虹┖
 *  锛?026-06-11 璇叧姝ら」瀵艰嚧妯℃嫙鍣?batcher2D 鎶?`switchBufferAccessor of null`锛屽凡鍥炴粴锛?*/
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

/** 绉婚櫎 assets/resources 鑱旀帴锛堝井淇′細鎶婅仈鎺ョ洰鏍囩畻杩涗富鍖咃紝瀵艰嚧 4MB 瓒呴檺锛?*/
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
 * 寰俊 IDE 棰勭紪璇戦渶瑕?assets/resources/game.js 涓?index.js銆?
 * 涓诲寘鍐嶆斁 config.json锛垀6KB锛変笌 import/锛垀15KB锛夛紱critical native 鐢?copyCriticalNativeToMain 鍐欏叆銆?
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

/** 鐪熸満鍒嗗寘鍐?import 绱㈠紩甯歌澶辫触锛涘鍒跺埌涓诲寘锛堢害 15KB锛夊苟鐢?transform 閲嶅畾鍚?URL */
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
 * 涓诲寘璇诲彇 config/import锛岃祫婧愬垎鍖呬繚鐣欏悓涓€浠藉厹搴曘€?
 * 涓よ竟浠讳竴浠介厤缃垨鍚堝苟鍖呬笉涓€鑷达紝鐪熸満浼氬嚭鐜扳€滄棫 config 璇锋眰宸蹭笉瀛樺湪 pack鈥濈殑榛戝睆銆?
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

/** 杩愯鏃?override锛岀‘淇?assetManager.init 鑳芥敞鍐?resources 鍒嗗寘鏄犲皠 */
function patchApplicationOverride(buildDir) {
  const appPath = path.join(buildDir, 'application.js');
  if (!fs.existsSync(appPath)) return;

  let src = fs.readFileSync(appPath, 'utf8');
  let changed = false;
  // 绔犺妭鍒嗗寘蹇呴』涓€骞跺嚭鐜板湪 override 鐨?subpackages 鍒楄〃閲岋紝鍚﹀垯杩愯鏃?override 浼氳鐩?
  // settings.json 鍙繚鐣?['resources']锛屽鑷?wx.loadSubpackage('chapter_N') 鏈敞鍐岃€屽け璐ャ€?
  const extraSubpackageNames = runtimeSubpackageNames(buildDir);
  const subsLiteral = ['resources', ...extraSubpackageNames].map((n) => `'${n}'`).join(', ');
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

  // 骞傜瓑鏀跺彛锛氭棤璁?assetsBlock 鏄惁鏈鏂版彃鍏ワ紝纭繚 override 鐨?subpackages 鏁扮粍涓庡叏閮?chapter 鍒嗗寘涓€鑷淬€?
  if (extraSubpackageNames.length) {
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

/** 閬垮厤 Canvas 閿€姣佹椂 director.root 鏈氨缁鑷?removeScreen 宕╂簝 */
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

/** 寮哄埗 resources 璧板井淇″垎鍖呰矾寰勶紝閬垮厤鐪熸満鎸?assets/resources/import 璇诲彇 */
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
 * 鐪熸満 loadSubpackage 鍚庡線寰€鏃犳硶 readFile 鍒嗗寘鏍逛笅 config.json锛?
 * resources 鐨?bundle 閰嶇疆鏀逛粠涓诲寘 assets/resources/config.json 璇诲彇锛岃祫婧愪粛璧?subpackages/resources/銆?
 * 鈿狅笍 鍙兘瀵?resources 鐢熸晥锛氬師浠ｇ爜鏄€屾墍鏈夊垎鍖呫€嶉€氱敤鐨?config 璺緞鏋勯€犲櫒锛?
 * 鑻ユ棤鏉′欢鍐欐鎴?resources锛屼細璁?chapter_* 绛夊叾瀹冨垎鍖呬篃鍘昏 resources 鐨?config 鑰屽姞杞藉け璐ャ€?
 */
function patchEngineResourcesConfigInMain(buildDir) {
  const adapterPath = path.join(buildDir, 'engine-adapter.js');
  if (!fs.existsSync(adapterPath)) return;

  let src = fs.readFileSync(adapterPath, 'utf8');

  const subConfigPath =
    'n=(y.platform===y.Platform.TAOBAO_MINI_GAME?"":"subpackages/").concat(o,"/config.").concat(a,"json"),h(o,t.onFileProgress';
  // 鏃х増锛坆ug锛夛細鏃犳潯浠跺啓姝?resources锛屼細璁?chapter_* 涔熷幓璇?resources config銆?
  const legacyHardcoded =
    'n="assets/resources/config.".concat(a,"json"),h(o,t.onFileProgress';
  // 鏂扮増锛歳esources 鈫?涓诲寘 config锛堢湡鏈哄凡楠岃瘉锛夛紱鍏跺畠鍒嗗寘 鈫?缁存寔鍘熴€宻ubpackages/<o>/config銆嶉€昏緫銆?
  const mainConfigPath =
    'n=(o==="resources"?"assets/resources/config.".concat(a,"json"):(y.platform===y.Platform.TAOBAO_MINI_GAME?"":"subpackages/").concat(o,"/config.").concat(a,"json")),h(o,t.onFileProgress';

  if (src.includes(mainConfigPath)) return; // 宸叉槸鏂扮増
  if (src.includes(legacyHardcoded)) {
    // 淇宸?patch 杩囩殑鏃ф瀯寤猴紙鏃犻渶閲嶅缓鍗冲彲绾犳 chapter_* 璇婚敊 config 鐨?bug锛夈€?
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
 * 鐪熸満 wx.access 瀵?subpackages/ 涓嬭矾寰勫父璇姤涓嶅瓨鍦紝瀵艰嚧 bundle 鍐?import/native 鍔犺浇澶辫触銆?
 * 瀵?subpackages/ 璺宠繃 exists 棰勬锛屼氦缁?readFile/download 澶勭悊銆?
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

/** 灏?import 璇锋眰浠庡垎鍖呰矾寰勬敼鍒颁富鍖?assets/resources/import锛堢湡鏈哄彲璇伙級 */
function patchEngineTransformImportRewrite(buildDir) {
  const adapterPath = path.join(buildDir, 'engine-adapter.js');
  if (!fs.existsSync(adapterPath)) return;

  let src = fs.readFileSync(adapterPath, 'utf8');
  const importRewrite =
    'o.url&&0<=o.url.indexOf("subpackages/resources/import/")&&(o.url=o.url.replace("subpackages/resources/import/","assets/resources/import/"))';
  const nativeRewrite =
    ',o.url&&0<=o.url.indexOf("subpackages/resources/native/")&&("/"!==o.url.charAt(0))&&(o.url="/".concat(o.url))';

  // 鐪熸満鍘嗗彶鍥炲綊锛歯ative 鍔?/ 鍓嶇紑浼氳Е鍙?Error 4930锛岄』绉婚櫎
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

/** 鐪熸満 Error 4930锛氬紩鎿庡姞杞藉垎鍖?native 澶辫触锛屾敼璇讳富鍖?copyCriticalNativeToMain 鍐欏叆鐨勮矾寰?*/
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
    console.warn('[patch-wechatgame-config] engine-adapter native rewrite skipped 鈥?import rewrite missing');
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

/** 淇缂栬瘧鍚?UiAssets锛氬嬁 loadBundle("subpackages/resources")锛岄』鐢?bundle 鍚?resources */
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
    // 鍏煎鏂扮増鏋勫缓浜х墿锛氬彲鑳藉凡涓嶅瓨鍦ㄦ棫閿氱偣锛屼絾鍐呭宸叉槸姝ｇ‘褰㈡€併€?
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
 * 涓诲寘 native 娓呭崟锛氫粠 UiAssets.ts 鐨?UI_SPRITE_UUID 鑷姩鐢熸垚銆?
 * 鐪熸満 HTMLImageElement / bundle.load 璇诲垎鍖?native 浼?Error 4930锛岄』澶嶅埗鍒颁富鍖呫€?
 * 鎺掗櫎澶ц儗鏅紙鍚?PVE 绔犺妭/钀ュ湴/鍛借繍鏍戯紝鐣欏垎鍖咃級銆佺粨绠楅〉锛?
 * icons 涓?PVE 棣栧睆鍦板浘/HUD 椤昏繘涓诲寘锛堝垎鍖?copyFile 鐪熸満甯稿け璐ヤ笖鏋佹參锛夈€?
 * 鍚?icons 鍚庝富鍖呴』 <4096KB锛氳窇 compress-ui-large-assets.py锛堝惈 BGM 鍘嬬缉锛夊悗鍐?patch銆?
 */
const MAIN_NATIVE_EXCLUDE_KEYS = new Set([
  'backgrounds/bg_settlement',
  'pve/map/tile_floor_ch1',
  'pve/map/tile_floor_ch1L',
]);
const MAIN_NATIVE_EXCLUDE_PREFIXES = ['settlement/'];
/**
 * PVE FogMapView uses these Chapter 1 sprites during battle startup.
 * Keep only the real, current runtime assets in main native; stale HUD art is not listed here.
 */
const PVE_MAP_CRITICAL_KEYS = new Set([
  'pve/map/tile_fog',
  'pve/map/icon_player_berserker',
  'pve/map/icon_player_archer',
  'pve/map/icon_player_rogue',
  'pve/map/icon_monster_ch1_normal',
  'pve/map/icon_monster_ch1_elite',
  'pve/map/icon_monster_goblin_warrior',
  'pve/map/icon_monster_goblin_archer',
  'pve/map/icon_monster_ch1_goblin_sentinel',
  'pve/map/icon_monster_frost_goblin',
  'pve/map/icon_monster_fire_goblin',
  'pve/map/icon_monster_goblin_chief',
  'pve/map/icon_chest',
  'pve/map/icon_key',
  'pve/map/icon_exit',
  'pve/map/icon_portal',
  'pve/map/icon_gunpowder_barrel',
  'pve/map/icon_blast_target',
  'pve/map/icon_altar',
  'pve/map/icon_idol',
  'pve/map/icon_hot_spring',
  'pve/map/icon_blacksmith',
  'pve/map/terrain_rock',
]);
const PVE_NON_MAP_CRITICAL_PREFIXES = [
  'pve/hud/',
];
const PVE_LOBBY_CRITICAL_KEYS = new Set([
  'pve/lobby/logo_destiny_tower',
  'pve/lobby/icon_chip_stardust',
  'pve/lobby/icon_chip_stamina',
  'pve/lobby/icon_nav_expedition',
  'pve/lobby/icon_nav_camp',
  'pve/lobby/icon_nav_leaderboard',
]);
const WECHAT_BGM_UUID = 'f1a2b3c4-5678-4901-a234-567890abcdef';
/**
 * SFX 涓诲寘鐧藉悕鍗曪紙AudioManager 鎺ュ叆鐨勬渶灏忛泦锛夛細涓?BGM 涓€鏍凤紝鍒嗗寘鍐?native 鐪熸満
 * 璺緞浼氳 engine-adapter 閲嶅啓鍒?assets/resources/native/锛屽繀椤诲鍒跺埌涓诲寘銆?
 * UUID 鏉ユ簮锛歛ssets/resources/audio/sfx/<cat>/<id>.mp3 鐨?.meta锛堟煡 Cocos 璧勬簮绠＄悊鍣級銆?
 * 鏂板/鍒犻櫎 SFX 鏃跺悓姝ユ湰琛紝骞堕噸璺?npm run build:wechat銆?
 */
const WECHAT_SFX_NATIVES = [
  { uuid: '85ca5d01-2cbb-4840-bb92-4f12488366e9', label: 'sfx/ui/sfx_ui_click' },
  { uuid: '9677f90b-2918-4d56-a468-4663e697e971', label: 'sfx/ui/sfx_run_failed' },
  { uuid: '41ed47b3-e63e-4662-b97e-eb4ea28d8f07', label: 'sfx/battle/sfx_attack_hit' },
  { uuid: 'e2d73f5b-0efa-42ac-a896-7e39ea1ab389', label: 'sfx/battle/sfx_boss_appear' },
  { uuid: '806d541a-108d-4e47-801c-bdd2b98b04f2', label: 'sfx/explore/sfx_player_move' },
  { uuid: 'd3c51eca-4438-4efa-a127-840ea393414a', label: 'sfx/explore/sfx_reward_get' },
  // 娉細sfx_damage_pop锛堟殏鏃犳枃浠讹紝璺緞澶嶇敤 attack_hit锛変笌 sfx_door_open锛堣矾寰勫鐢?reward_get锛?
  // 鍦?AudioManager 閲岃鏄犲皠鍒扮幇鏈?mp3锛屾棤闇€鐙珛鍏ヤ富鍖呫€?
];
/** 1脳1 PNG锛屼粎渚?IDE 缂栬瘧杩?ENOENT锛涜繍琛屾椂 UiAssets 璺宠繃涓诲寘璺緞璇?excluded 璧勬簮 */
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
  if (label.startsWith('pve/lobby/')) return !PVE_LOBBY_CRITICAL_KEYS.has(label);
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
    console.warn('[patch-wechatgame-config] UiAssets.ts missing 鈥?using empty critical manifest');
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
 * 绂佹鍙垹闄?resources/native 涓殑 PVP 鏂囦欢锛欳ocos 鐢熸垚鐨?config/import
 * 浠嶄細寮曠敤瀹冧滑锛屼細瀵艰嚧鍚?bundle 鐨?PVE 鍥剧墖鍔犺浇琚繛缁?ENOENT 骞叉壈銆?
 * 褰诲簳鍓ョ蹇呴』閫氳繃鐙珛 asset bundle 璁?Creator 閲嶅缓绱㈠紩銆?
 */
function purgePvpNativeForPveOnly(_buildDir) {
  return { removed: 0, totalKb: 0 };
}

/** 鎭㈠鏇捐鏃х増 PVE-only patch 閿欏垹鐨?UI native 鏂囦欢銆?*/
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

/** 鍘嬬缉鑴氭湰鏇存柊婧愭枃浠跺悗锛屾棤闇€鏁村寘閲嶅缓鍗冲彲璁?patch 澶嶅埗鏇村皬浣撶Н锛圔GM銆佽儗鏅級 */
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

  // 缇庢湳婧愬浘鍘嬬缉鍚庡厑璁哥洿鎺ラ噸璺?patch锛屾棤闇€浠呬负 PNG 浣撶Н鍙樺寲閲嶆柊鏋勫缓鏁翠釜 Cocos 鍖呫€?
  // UI_SPRITE_UUID 鐨?key 涓?assets/resources/art/ui 涓嬬殑鐩稿璺緞淇濇寔涓€鑷淬€?
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
    console.warn('[patch-wechatgame-config] copyCriticalNative skipped 鈥?subpackage native missing');
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
 * 涓诲寘 config+import 寮曠敤 excluded native锛孖DE 缂栬瘧椤绘枃浠跺瓨鍦紱鍐?1脳1 鍗犱綅 PNG锛垀70B锛夛紝涓嶈鍏ヤ富鍖呬綋绉€?
 * packOptions.ignore 瀵逛笂浼犱綋绉棤鏁堬紝绂佹澶嶅埗瀹屾暣澶ц儗鏅?缁撶畻鍥惧埌涓诲寘銆?
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

/** 淇濈暀鍗犱綅锛氫笉鍐嶆妸 assets/resources/native 閲嶅啓鍒板垎鍖咃紙涓?copyCriticalNativeToMain 鍐茬獊锛?*/
function patchCompiledCriticalNativePaths(_buildDir) {
  /* no-op */
}

/** 璺宠繃 first-screen.js WebGL 鍚姩椤碉紙涓?Cocos 鍏辩敤 canvas 浼氳Е鍙?Error 5000 寰幆锛?*/
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

function patchCompiledSpecialItemLoader(buildDir) {
  const mainIndexPath = path.join(buildDir, 'assets', 'main', 'index.js');
  if (!fs.existsSync(mainIndexPath)) return;

  let src = fs.readFileSync(mainIndexPath, 'utf8');
  const oldPathExpr = 'return e.chapter<=1?y+"/chapter_1/"+"icons/"+e.fileName:"subpackages/"+I(e.chapter)+"/"+y+"/"+"icons/"+e.fileName';
  const newPathExpr = 'return e.chapter<=1?"subpackages/equipment_tier1/"+y+"/chapter_1/icons/"+e.fileName:"subpackages/"+I(e.chapter)+"/"+y+"/icons/"+e.fileName';
  if (!src.includes(oldPathExpr) || src.includes(newPathExpr)) {
    return;
  }

  src = src.replace(oldPathExpr, newPathExpr);
  fs.writeFileSync(mainIndexPath, src, 'utf8');
  console.log('[patch-wechatgame-config] patched compiled SpecialItemResourceLoader chapter_1 path');
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

  // PVE 绔犺妭鑳屾櫙鍒嗗寘 chapter_*锛圕ocos 宸茬敓鎴愮殑灏辨敞鍐屽埌 game.json锛屽箓绛夊幓閲嶏級銆?
  const chapterNames = runtimeSubpackageNames(buildDir);
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

/** 琛ュ叏 build 鍐?project.config锛堢己 libVersion 鏃跺井淇″伐鍏峰彲鑳芥棤鍝嶅簲锛?*/
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
  // 绔犺妭鍒嗗寘椤诲湪 resources 澶勭悊鍓嶆惉鍒?subpackages/锛岃鍚庣画 settings/game.json/override 娉ㄥ唽鏃惰兘鎵埌銆?
  relocateChapterSubpackagesToSub(buildDir);
  copyEquipmentSubpackages(buildDir);
  copySpecialIconArtifacts(buildDir);
  const hadSub = ensureResourcesSubpackage(buildDir);
  assertBuildHasNoImportedSidecars(buildDir);
  const { target, merged, useEnginePlugin, hasSubResources } = patchGameJson(buildDir);
  patchApplicationOverride(buildDir);
  patchGameBoot(buildDir);
  patchCompiledSpecialItemLoader(buildDir);
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
      '[patch-wechatgame-config] WARNING: subpackages look too small 鈥?鐪熸満鍙兘缂?config.json锛岃纭宸叉墽琛?Cocos 鏋勫缓骞堕噸鏂?patch',
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
