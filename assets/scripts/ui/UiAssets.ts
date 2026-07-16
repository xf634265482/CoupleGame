import {
  assetManager,
  AssetManager,
  ImageAsset,
  Node,
  Rect,
  resources as editorResources,
  Size,
  SpriteFrame,
  Texture2D,
  UITransform,
} from 'cc';
import { EDITOR } from 'cc/env';
import { applyUiLayerTree, visibleDesignSize } from '../platform/wechat/ViewAdapt';
import {
  ensureArtCover,
  normalizeUiSpriteFrame,
  removePlaceholderGraphics,
} from './UiSprite';

/** art/ui 下首批资源的 SpriteFrame UUID（备用：resources / main 失败时） */
export const UI_SPRITE_UUID: Record<string, string> = {
  'backgrounds/bg_lobby': '61d7272b-0616-4fd0-b218-e6379344531e@f9941',
  'pve/backgrounds/bg_destiny_tree': 'b84fda9d-7263-47fc-a4f3-04c6050f6c72@f9941',
  'pve/backgrounds/bg_pve_camp': '93eabd9b-34de-480d-ba17-b8ce8f4690ad@f9941',
  'pve/backgrounds/bg_pve_ch1': '41cfbfa8-79b3-4c15-8e9b-24539c23cd1d@f9941',
  'pve/backgrounds/bg_pve_ch2': '94de010e-c1e9-437b-87db-57b460a2756b@f9941',
  'pve/backgrounds/bg_pve_ch3': 'dcb41494-9338-4cda-bb3d-e2a87df38184@f9941',
  'pve/backgrounds/bg_pve_ch4': '00c422be-4c5e-4d1e-91e4-a8437515a442@f9941',
  'pve/backgrounds/bg_pve_ch5': 'f8eb92ee-f6d2-461c-af0a-1dbfd97a45b8@f9941',
  'pve/backgrounds/bg_pve_loading_expedition': '7e917902-16e6-4f4b-a30b-bd248d3a478b@f9941',
  'pve/camp/panel_camp_main_9s': '750cb7e3-fb89-4042-8dfd-b6bfd61698cc@f9941',
  'pve/class/icon_class_adventurer': 'c3c96b12-3d37-4e95-ba49-b45b0d33df86@f9941',
  'pve/class/icon_class_archer': 'be5c49d3-acf7-46cb-a5a9-3b2cfe1e6498@f9941',
  'pve/class/icon_class_berserker': '3e25de32-0135-40fd-8051-35334f423b14@f9941',
  'pve/class/icon_class_rogue': '47f2a9f0-4bb1-4e9d-8639-6067c6454148@f9941',
  'pve/destiny/node_frame': 'db81866d-7d58-4103-aaf0-ceb0ecef0311@f9941',
  'pve/hud/bar_pve_info_9s': '2ad83a84-63f1-4ca1-a1ff-88322d24be6d@f9941',
  'pve/hud/bg_dpad': 'e9214c11-1db7-4dec-a06d-4d9290a63dae@f9941',
  'pve/hud/btn_pve_interact': '0affe775-4482-49b2-91ac-a591b7fa8606@f9941',
  'pve/lobby/logo_destiny_tower': '4f0fa81a-aed1-44c8-a308-868ccd52189b@f9941',
  'pve/lobby/icon_chip_diamond': '0291cd6d-d83a-404e-9c19-27e740a81156@f9941',
  'pve/lobby/icon_chip_stardust': '0e5dd488-3382-4590-9c91-78fcc7bc356a@f9941',
  'pve/lobby/icon_chip_stamina': 'ca8b3db2-9f83-4686-bf48-68c0ac4c2ea5@f9941',
  'pve/lobby/icon_nav_relic': '0e57749f-e803-4056-8671-6d85a1772da9@f9941',
  'pve/lobby/icon_nav_expedition': '22a5cfbd-2a04-47db-b57b-5bbc03ce767b@f9941',
  'pve/lobby/icon_nav_destiny_tree': 'cf43bc2d-5af3-4d04-9504-221e91fedb85@f9941',
  'pve/lobby/icon_nav_leaderboard': '2fbbe305-2f22-451b-9180-f50af9d94437@f9941',
  'pve/icons/icon_block': 'c3ba5bc7-6418-4c9f-9132-7a00cbe97d65@f9941',
  'pve/icons/icon_boss_warn': '47c4ca2c-3b72-443c-9a19-e42c7932467e@f9941',
  'pve/icons/icon_crit': '4d1fb0cb-c865-477d-9f9c-5d7216ada90f@f9941',
  'pve/icons/icon_hud_anima': '14f1c72e-fd33-436a-9eb3-7c0e041c5a9e@f9941',
  'pve/icons/icon_hud_ap': 'f853553b-2106-4934-949c-16e20e9da708@f9941',
  'pve/icons/icon_hud_attack': '7c5237b7-b939-4ff5-80e5-d399221a2a01@f9941',
  'pve/icons/icon_hud_dice': 'f4ec4196-8dcf-4c66-9bb2-c43f279cf609@f9941',
  'pve/icons/icon_hud_diamond': '7f3b6d21-8c42-4c0a-a136-8e57d13e7a91@f9941',
  'pve/icons/icon_hud_gold': '59a3bef4-2c1c-43e7-9872-351d4d0bb543@f9941',
  'pve/icons/icon_hud_hp': '3c1851c1-6cee-4b06-98b7-8ceca889a3e2@f9941',
  'pve/icons/icon_hud_key': '97f6c5d6-0fad-4fc5-8808-6e0425f1ec69@f9941',
  'pve/icons/icon_hud_scroll': '53e5e4a6-1b02-4217-a1b5-0f566dfbf7e4@f9941',
  'pve/icons/icon_hud_shards': 'ad25e353-6aeb-4af4-ad99-070f5d402c0a@f9941',
  'pve/icons/icon_relic_default': 'e211a403-54d2-4af1-b3d8-4ea3a8ae37d3@f9941',
  'pve/icons/icon_scroll': '555df907-227f-4941-a388-5720152b9a20@f9941',
  'pve/icons/icon_status_burn': '63a4e701-56be-49b7-a900-773b7079547b@f9941',
  'pve/icons/icon_status_chill': '3399414b-02c8-4cc3-9353-d35d963b0193@f9941',
  'pve/icons/icon_status_frozen': '1a726b6d-ff78-44be-94f1-bd574085111b@f9941',
  'pve/map/icon_altar': '97ccc8b3-3729-40d8-baa1-ff1e4a9b94f1@f9941',
  'pve/map/icon_blacksmith': '95e9d13e-4114-44cc-a9e6-57768caf9d5d@f9941',
  'pve/map/icon_chest': '2838f2aa-64de-454a-ae11-a2ceb06f06b5@f9941',
  'pve/map/icon_exit': '753d8095-d142-4f2b-8bf8-ec8f6bbbff7e@f9941',
  'pve/map/icon_hot_spring': 'b00d36f7-7a69-4e3c-9ca7-12295f8efec2@f9941',
  'pve/map/icon_idol': '04aa29b5-1fd1-4897-98a1-7b42e21f825e@f9941',
  'pve/map/icon_key': '87815865-6e1a-48fc-a7f1-a558c1f50f52@f9941',
  'pve/map/icon_fragment': 'c01a3727-e289-4555-a2b9-e7ecd03a5d74@f9941',
  'pve/map/icon_monster_fire_goblin': '12cff37f-cd70-4383-9110-dd4e3f842b38@f9941',
  'pve/map/icon_monster_frost_goblin': '72d722b2-6dee-4867-a7fe-f52050095b91@f9941',
  'pve/map/icon_monster_goblin_archer': 'be793e36-444e-464c-be97-0b8a2294c609@f9941',
  'pve/map/icon_monster_goblin_chief': 'f38df912-d0ef-417e-89b6-ae5cafeb31c5@f9941',
  'pve/map/icon_monster_goblin_warrior': 'd6b048c1-f591-45e4-9942-5132661d1ddb@f9941',
  'pve/map/icon_monster_spirit_rat': '0c8e40ff-837c-4310-841d-b5cc4b58714c@f9941',
  'pve/map/icon_monster_anima': '29b46c10-beb4-4598-977a-7e9e69ee378e@f9941',
  'pve/map/icon_monster_boss': 'cd9e9f82-2c80-4375-8f52-0f5bced1256c@f9941',
  'pve/map/icon_monster_ch1_normal': '83a5fda4-9dc8-4754-8d70-6ccb0ffe5c0b@f9941',
  'pve/map/icon_monster_ch1_elite': 'a5361819-031b-4b77-a572-646bfc3c9edc@f9941',
  'pve/map/icon_monster_ch1_anima': 'acb754d0-d795-43a7-b846-79e1bc8b70f4@f9941',
  // ch2 怪物图标已迁入 chapter_2 分包（assets/chapter_backgrounds/chapter_2/map/），不再走 UiAssets。
  // ch3 怪物图标已迁入 chapter_3 分包（assets/chapter_backgrounds/chapter_3/map/），不再走 UiAssets。
  // ch4 怪物图标已迁入 chapter_4 分包，不再走 UiAssets。
  // ch5 怪物图标已迁入 chapter_5 分包，不再走 UiAssets。
  'pve/map/icon_monster_elite': '4393b67e-6e9e-4414-a452-c9b50ff2475a@f9941',
  'pve/map/icon_monster_normal': '4acc5677-9e5e-42c2-910c-95a6550fa61f@f9941',
  'pve/map/icon_player': 'f621a780-95f7-4cab-bfd0-71de76b89e44@f9941',
  'pve/map/icon_player_berserker': '3eb74915-eb1a-4fe9-9269-6f1aaeaac54a@f9941',
  'pve/map/icon_player_archer': '60b71ffd-a93b-49a3-8aed-d05d11817b09@f9941',
  'pve/map/icon_player_rogue': '03e14bae-3952-4aab-a903-c42110a386fa@f9941',
  'pve/map/icon_portal': 'b6e018c4-5a3a-4384-ba92-394bd03c574d@f9941',
  'pve/map/mark_attack_range': '19c2ac62-f809-4b87-a26b-7b2a8f2b567b@f9941',
  'pve/map/mark_move_range': '7cd41b51-8d59-4da8-b245-b2d2c86c9ba2@f9941',
  'pve/map/tile_floor_ch1': '2e6ec7ed-fa51-4278-ad56-f0ddb03dfbe6@f9941',
  'pve/map/tile_floor_ch1L': '6b9be095-3a24-4603-83f0-e81dafd9c46b@f9941',
  // tile_floor_ch2 历史声明，源 PNG 从未存在；FogMapView 取不到自动 fallback 不显示地砖。
  // tile_floor_ch3 历史声明，源 PNG 从未存在；FogMapView 取不到自动 fallback 不显示地砖。
  // tile_floor_ch4 历史声明，源 PNG 从未存在。
  // tile_floor_ch5 历史声明，源 PNG 从未存在。
  'pve/map/tile_fog': 'cb221eaf-62c2-42df-b751-2d6d521e1652@f9941',
  // terrain_rock 跨章共享（ch1 GoblinChief 召唤 + ch3 FrostGiant 路径检测），留主包 critical。
  'pve/map/terrain_rock': '6de48a38-f929-42c3-9fdc-f02682a9013e@f9941',
  'pve/map/tile_selected_frame': 'd92094e5-211d-460b-88c0-919a9775b933@f9941',
  'pve/panel/panel_char_bg_9s': '1b6233d0-eb91-4fc5-b3ca-728573a47442@f9941',
  'pve/panel/slot_equip_empty': '813a20e5-014e-4d22-bad8-707344802b0e@f9941',
  'pve/popup/card_strengthen_choice_9s': 'aba6145e-4fdd-4393-8ad3-a6ef098828fd@f9941',
  'pve/popup/panel_death_9s': '2f8c1707-d1a4-4ef5-bf61-4465f0f59b39@f9941',
  'pve/popup/panel_floor_clear_9s': '2c33d542-f371-4218-a046-1c6476951872@f9941',
  'pve/popup/panel_interact_9s': '5c3eb0e2-e1e5-43de-9303-59aa2c451921@f9941',
  'pve/popup/panel_strengthen_9s': '15848f75-bfa3-4f32-aa0d-a7d2528fa09c@f9941',
};


export const PVE_MAP_KEYS = [
  'pve/map/tile_fog',
  'pve/map/tile_floor_ch1',
  'pve/map/tile_selected_frame',
  'pve/map/mark_move_range',
  'pve/map/mark_attack_range',
  'pve/map/icon_player',
  'pve/map/icon_player_berserker',
  'pve/map/icon_player_archer',
  'pve/map/icon_player_rogue',
  'pve/map/icon_portal',
  'pve/map/icon_monster_normal',
  'pve/map/icon_monster_ch1_normal',
  'pve/map/icon_monster_ch1_elite',
  'pve/map/icon_monster_ch1_anima',
  'pve/map/icon_monster_goblin_warrior',
  'pve/map/icon_monster_goblin_archer',
  'pve/map/icon_monster_frost_goblin',
  'pve/map/icon_monster_fire_goblin',
  'pve/map/icon_monster_spirit_rat',
  'pve/map/icon_monster_goblin_chief',
  // ch2/ch3/ch4/ch5 怪物图标已迁入各自 chapter_N 分包，由 ChapterResourceLoader 进章时加载并回写 UiAssets 缓存。
  'pve/map/icon_monster_elite',
  'pve/map/icon_monster_anima',
  'pve/map/icon_monster_boss',
  'pve/map/icon_chest',
  'pve/map/icon_key',
  'pve/map/icon_exit',
  'pve/map/icon_altar',
  'pve/map/icon_blacksmith',
  'pve/map/icon_hot_spring',
  'pve/map/icon_idol',
  'pve/map/icon_fragment',
  'pve/map/terrain_rock',
  // icon_sand_pit_permanent → chapter_2 分包；
  // lava_chain（熔岩领主锁链 fx）→ chapter_4 分包，避免推主包过线（4096KB 限制）。
  // 第3章冰系地形（terrain_ice_wall / terrain_ice_tile / terrain_freeze_wall / terrain_shattered_ice）→ chapter_3 分包；
  // terrain_lava → chapter_4 分包。均由 ChapterResourceLoader 加载并回写 UiAssets 缓存。
] as const;

export const PVE_HUD_KEYS = [
  'pve/icons/icon_hud_hp',
  'pve/icons/icon_hud_ap',
  'pve/icons/icon_hud_attack',
  'pve/icons/icon_hud_gold',
  'pve/icons/icon_hud_anima',
  'pve/icons/icon_hud_key',
  'pve/icons/icon_hud_dice',
  'pve/icons/icon_hud_diamond',
  'pve/icons/icon_hud_shards',
  'pve/icons/icon_hud_scroll',
  'pve/hud/btn_pve_interact',
] as const;

/** 战斗状态/战报/遗物图标 */
export const PVE_STATUS_KEYS = [
  'pve/icons/icon_block',
  'pve/icons/icon_boss_warn',
  'pve/icons/icon_crit',
  'pve/icons/icon_relic_default',
  'pve/icons/icon_scroll',
  'pve/icons/icon_status_burn',
  'pve/icons/icon_status_chill',
  'pve/icons/icon_status_frozen',
] as const;

/** 职业图标 */
export const PVE_CLASS_KEYS = [
  'pve/class/icon_class_adventurer',
  'pve/class/icon_class_archer',
  'pve/class/icon_class_berserker',
  'pve/class/icon_class_rogue',
] as const;

export const PVE_POPUP_KEYS = [
  'pve/popup/card_strengthen_choice_9s',
  'pve/popup/panel_strengthen_9s',
  'pve/popup/panel_interact_9s',
  'pve/popup/panel_death_9s',
  'pve/popup/panel_floor_clear_9s',
] as const;

/** 大章节背景（720×1280 竖图）；微信真机走分包，不进主包 native */
// 首章背景是远征首屏关键图，需进入主包；其余大背景继续走资源分包。
// 章节背景的运行时加载已收口到 pve/ChapterResourceLoader.ts。此表仅保留尚未迁移到
// 独立分包的章节（第2章已迁出，走 chapter_2 bundle）；迁移完成后整表可删。
export const PVE_CHAPTER_BG_KEYS = {
  1: 'pve/backgrounds/bg_pve_ch1',
} as const;

export const PVE_BG_KEYS = [
  ...Object.values(PVE_CHAPTER_BG_KEYS),
  'pve/backgrounds/bg_pve_camp',
  'pve/backgrounds/bg_destiny_tree',
] as const;

/** 面板/弹窗/营地/命运树底框，与弹窗一起预加载 */
export const PVE_PANEL_KEYS = [
  'pve/panel/panel_char_bg_9s',
  'pve/panel/slot_equip_empty',
  'pve/camp/panel_camp_main_9s',
  'pve/destiny/node_frame',
] as const;

export const PVE_UI_KEYS = [
  ...PVE_MAP_KEYS,
  ...PVE_HUD_KEYS,
  ...PVE_STATUS_KEYS,
  ...PVE_CLASS_KEYS,
  ...PVE_POPUP_KEYS,
  ...PVE_PANEL_KEYS,
] as const;

/** PVE-only 大厅最小图集；不触发输入框、匹配按钮、房间或棋盘资源加载。 */
export const PVE_LOBBY_ESSENTIAL_KEYS = [
  'backgrounds/bg_lobby',
  'pve/lobby/logo_destiny_tower',
  'pve/lobby/icon_chip_stardust',
  'pve/lobby/icon_chip_stamina',
  'pve/lobby/icon_nav_relic',
  'pve/lobby/icon_nav_expedition',
  'pve/lobby/icon_nav_camp',
  'pve/lobby/icon_nav_leaderboard',
] as const;

export const PVE_CAMP_WARM_KEYS = [
  'pve/backgrounds/bg_pve_camp',
  'pve/camp/panel_camp_main_9s',
] as const;

/** Cocos 编译后 [...new Set(...)] 可能变成 Set 对象本身，禁止用于预加载列表 */
function uniqueUiKeys(values: readonly string[]): string[] {
  const out: string[] = [];
  for (const v of values) {
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

const cache = new Map<string, SpriteFrame>();

let resourcesReady: Promise<AssetManager.Bundle | null> | null = null;

export function isWechatRuntime(): boolean {
  return typeof wx !== 'undefined' && typeof wx.loadSubpackage === 'function';
}

/** 微信开发者工具：分包 native 无法 fs.readFile，须走 bundle.load */
function isWechatDevtools(): boolean {
  if (!isWechatRuntime()) {
    return false;
  }
  try {
    const sys = wx.getSystemInfoSync?.();
    return sys?.platform === 'devtools';
  } catch {
    return false;
  }
}

/** 微信真机（非开发者工具） */
function usesWechatNativeFs(): boolean {
  return isWechatRuntime() && !isWechatDevtools();
}

/** 真机分包下载完成后额外等待（success 常早于 native 落盘；bytesExpected=0 时更久） */
const WECHAT_REAL_DEVICE_SUBPACKAGE_SETTLE_MS = 1000;
const WECHAT_SUBPACKAGE_ZERO_BYTES_EXTRA_MS = 1000;
/** 分包-only 资源 copyFile 重试（大背景） */
const SUB_NATIVE_RETRY_ATTEMPTS = 12;
const SUB_NATIVE_RETRY_INTERVAL_MS = 200;
/** 并行 preload 过大会压垮微信 fs，真机分批加载 */
const PRELOAD_BATCH_SIZE = 6;
/** 仅分包的大背景/结算，不进主包；preload 跳过；主包仅有编译占位 PNG */
const WECHAT_SUBPACKAGE_ONLY_KEYS = new Set([
  'backgrounds/bg_settlement',
  'pve/backgrounds/bg_pve_ch2',
  'pve/backgrounds/bg_pve_ch3',
  'pve/backgrounds/bg_pve_ch4',
  'pve/backgrounds/bg_pve_ch5',
  'pve/backgrounds/bg_pve_camp',
  'pve/backgrounds/bg_destiny_tree',
]);

function isPveCriticalNative(key: string): boolean {
  if (
    key === 'pve/map/tile_floor_ch1L'
    || key === 'pve/map/tile_floor_ch1'
    || /^pve\/backgrounds\/bg_pve_ch[2-5]_runtime$/.test(key)
  ) {
    return false;
  }
  return key === 'pve/backgrounds/bg_pve_ch1'
    || key === 'pve/backgrounds/bg_pve_loading_expedition'
    || key.startsWith('pve/map/')
    || key.startsWith('pve/hud/')
    || key.startsWith('pve/lobby/')
    || key.startsWith('pve/icons/icon_hud_');
}

function usesSubpackageOnlyNative(key: string): boolean {
  return WECHAT_SUBPACKAGE_ONLY_KEYS.has(key)
    || key.startsWith('settlement/')
    || (key.startsWith('pve/') && !isPveCriticalNative(key));
}
const WECHAT_SUBPACKAGE_DOWNLOAD_WAIT_MS = 30000;

/**
 * 微信 readFile 候选路径（含 / 前缀变体）。
 * 禁止用 [...new Set(flatMap(...))]：Cocos 编译后会变成 [].concat(new Set(...))，
 * 把整个 Set 对象传给 readFile，真机报 parameter.filePath should be String instead of Object。
 * 与 BgmController.wechatBgmSourcePaths 相同写法。
 */
function wechatNativeReadCandidates(paths: readonly string[]): string[] {
  const candidates: string[] = [];
  for (const path of paths) {
    const normalized = path.replace(/^\/+/, '');
    const variants = normalized === path ? [path, `/${path}`] : [path, normalized];
    for (const candidate of variants) {
      if (!candidates.includes(candidate)) {
        candidates.push(candidate);
      }
    }
  }
  return candidates;
}

/**
 * 真机 Error 4930：分包 native 不能以 / 开头（引擎或补丁曾加过此前缀）。
 * 仅规范化 URL 后交回引擎 downloadDomImage；禁止 readFile 拦截（真机 fs 读不到分包 native）。
 */
function patchWechatSubpackageImageDownloader(): void {
  if (!usesWechatNativeFs()) {
    return;
  }
  type Downloader = typeof assetManager.downloader & {
    downloadDomImage?: (
      url: string,
      options: Record<string, unknown>,
      onComplete: (err?: Error | null, img?: HTMLImageElement) => void,
    ) => void;
    __coupleSubNativePatched?: boolean;
  };
  const dl = assetManager.downloader as Downloader;
  if (dl.__coupleSubNativePatched || typeof dl.downloadDomImage !== 'function') {
    return;
  }
  const original = dl.downloadDomImage.bind(dl) as Downloader['downloadDomImage'];
  dl.downloadDomImage = ((url, options, onComplete) => {
    let bare = url.replace(/^\/+/, '');
    if (bare.includes('subpackages/resources/native/')) {
      bare = bare.replace('subpackages/resources/native/', `${MAIN_NATIVE_ROOT}/`);
    }
    original?.(bare, options, onComplete);
  }) as Downloader['downloadDomImage'];
  dl.__coupleSubNativePatched = true;
  console.log('[UiAssets] patched downloadDomImage strip-leading-slash');
}

function waitForWechatSubpackageBytes(
  isComplete: () => boolean,
  maxWaitMs = WECHAT_SUBPACKAGE_DOWNLOAD_WAIT_MS,
  intervalMs = 200,
): Promise<void> {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (isComplete() || Date.now() - started >= maxWaitMs) {
        resolve();
        return;
      }
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

/** 微信：须先 loadSubpackage，再 loadBundle('resources')（由 engine-adapter 映射到分包目录）。
 *  导出供 ChapterResourceLoader 复用：复用真机落盘等待 / devtools 跳过探针逻辑，勿重复实现。 */
export function loadWechatSubpackage(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!isWechatRuntime()) {
      resolve();
      return;
    }

    const devtools = isWechatDevtools();
    let settled = false;
    let downloadComplete = devtools;
    let bytesExpected = 0;
    let bytesWritten = 0;

    const settleOk = (label: string) => {
      if (settled) return;
      settled = true;
      console.log('[UiAssets] wx.loadSubpackage', name, 'ok,', label);
      resolve();
    };

    const settleFail = (err: unknown) => {
      if (settled) return;
      settled = true;
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    const isDownloadComplete = () => {
      if (downloadComplete) return true;
      if (bytesExpected > 0 && bytesWritten >= Math.floor(bytesExpected * 0.98)) {
        return true;
      }
      return false;
    };

    const runAfterDownload = () => {
      if (settled) return;
      if (devtools) {
        settleOk('devtools skip fs probe');
        return;
      }
      void waitForWechatSubpackageBytes(isDownloadComplete).then(() => {
        if (settled) return;
        const extraMs =
          bytesExpected > 0 ? WECHAT_REAL_DEVICE_SUBPACKAGE_SETTLE_MS : WECHAT_SUBPACKAGE_ZERO_BYTES_EXTRA_MS;
        setTimeout(
          () => settleOk(`real-device after download ${bytesWritten}/${bytesExpected || '?'}`),
          extraMs,
        );
      });
    };

    const task = wx.loadSubpackage({
      name,
      success: () => runAfterDownload(),
      fail: (err) => settleFail(err ?? new Error(`loadSubpackage ${name} failed`)),
    });

    if (task && typeof task.onProgressUpdate === 'function') {
      task.onProgressUpdate((res) => {
        bytesExpected = res.totalBytesExpectedToWrite || bytesExpected;
        bytesWritten = res.totalBytesWritten || bytesWritten;
        if (res.progress >= 100 || isDownloadComplete()) {
          downloadComplete = true;
        }
        if (res.progress === 100 || res.progress % 25 === 0) {
          console.log(
            '[UiAssets] subpackage download',
            name,
            res.progress,
            `${res.totalBytesWritten}/${res.totalBytesExpectedToWrite}`,
          );
        }
      });
    }
  });
}

function isWechatResourcesBundleReady(bundle: AssetManager.Bundle): boolean {
  const base = bundle.base ?? '';
  return base.includes('subpackages/resources');
}

/** 确保 resources 分包已下载并注册到 assetManager（大厅/棋盘 UI 依赖） */
export function ensureResourcesBundle(): Promise<AssetManager.Bundle | null> {
  if (EDITOR) {
    return Promise.resolve(assetManager.getBundle('resources'));
  }

  const existing = assetManager.bundles.get('resources');
  if (existing) {
    if (!isWechatRuntime() || isWechatResourcesBundleReady(existing)) {
      return Promise.resolve(existing);
    }
    assetManager.removeBundle(existing);
    resourcesReady = null;
  }

  if (!resourcesReady) {
    resourcesReady = loadResourcesBundleOnce();
  }

  return resourcesReady;
}

function clearResourcesReadyOnFailure(bundle: AssetManager.Bundle | null): AssetManager.Bundle | null {
  if (!bundle) resourcesReady = null;
  return bundle;
}

function loadResourcesBundleOnce(): Promise<AssetManager.Bundle | null> {
  patchWechatSubpackageImageDownloader();

  const loadByName = (): Promise<AssetManager.Bundle | null> =>
    new Promise((resolve) => {
      try {
        assetManager.loadBundle('resources', (err, bundle) => {
          if (err || !bundle) {
            console.error('[UiAssets] loadBundle(resources) failed', err);
            resolve(null);
            return;
          }
          if (isWechatRuntime() && !isWechatResourcesBundleReady(bundle)) {
            console.error('[UiAssets] resources bundle base wrong', bundle.base);
            resolve(null);
            return;
          }
          console.log('[UiAssets] resources bundle ready', bundle.name, bundle.base);
          resolve(bundle);
        });
      } catch (syncErr) {
        console.error('[UiAssets] loadBundle(resources) threw', syncErr);
        resolve(null);
      }
    });

  if (!isWechatRuntime()) {
    return loadByName().then(clearResourcesReadyOnFailure);
  }

  console.log('[UiAssets] loading resources subpackage…', usesWechatNativeFs() ? 'real-device' : 'devtools');
  return loadWechatSubpackage('resources')
    .then(() => loadByName())
    .then((bundle) => {
      if (!bundle || !isWechatRuntime()) {
        return bundle;
      }
      return probeWechatResourcesAssets(bundle).then(() => bundle);
    })
    .then(clearResourcesReadyOnFailure)
    .catch((err) => {
      resourcesReady = null;
      console.error('[UiAssets] wx.loadSubpackage resources failed', err);
      return null;
    });
}

/** 抽样 bg_lobby：真机仅主包 native（禁止 bundle.load → Error 4930）；devtools 走 bundle.load */
async function probeWechatResourcesAssets(bundle: AssetManager.Bundle): Promise<boolean> {
  const key = 'backgrounds/bg_lobby';
  const sf = usesWechatNativeFs()
    ? await loadWechatNativeSprite(key)
    : await new Promise<SpriteFrame | null>((resolve) => {
        bundle.load(resourcesPath(key), SpriteFrame, (err, asset) => {
          if (!err && asset) {
            resolve(cacheSprite(key, asset));
            return;
          }
          if (err) {
            console.error('[UiAssets] probe resources.load failed', key, err);
          }
          resolve(null);
        });
      });
  if (sf) {
    console.log('[UiAssets] probe ok bg_lobby');
    return true;
  }
  console.warn('[UiAssets] probe warn bg_lobby (non-blocking, sprites retry on demand)');
  return false;
}

/** resources 包路径：assets/resources/art/ui/ */
function resourcesPath(key: string): string {
  return `art/ui/${key}/spriteFrame`;
}

/** main 包路径（构建后 assets 根目录相对路径） */
function mainBundlePath(key: string): string {
  return `art/ui/${key}/spriteFrame`;
}

function cacheSprite(key: string, sf: SpriteFrame | null): SpriteFrame | null {
  if (sf) {
    normalizeUiSpriteFrame(sf);
    cache.set(key, sf);
  }
  return sf;
}

/** 主包 native（patch 复制首屏关键贴图）；分包 native 为兜底 */
const MAIN_NATIVE_ROOT = ['assets', 'resources', 'native'].join('/');
const SUB_NATIVE_ROOT = ['subpackages', 'resources', 'native'].join('/');

function nativeTexturePathsFromUuid(key: string, uuidWithSuffix: string): string[] {
  const uuid = uuidWithSuffix.split('@')[0];
  const ext = key === 'pve/backgrounds/bg_pve_loading_expedition'
    || /^pve\/backgrounds\/bg_pve_ch[2-5]_runtime$/.test(key)
    ? '.jpg'
    : '.png';
  const rel = `${uuid.slice(0, 2)}/${uuid}${ext}`;
  const paths = [`${MAIN_NATIVE_ROOT}/${rel}`, `${SUB_NATIVE_ROOT}/${rel}`];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of paths) {
    if (!seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}

function readWechatNativeToTempOnce(path: string, tempPath: string): Promise<string | null> {
  if (!isWechatRuntime() || !wx.getFileSystemManager) {
    return Promise.resolve(null);
  }

  const fs = wx.getFileSystemManager();
  return new Promise((resolve) => {
    const readThenWrite = () => {
      fs.readFile({
        filePath: path,
        success: (res) => {
          fs.writeFile({
            filePath: tempPath,
            data: res.data,
            success: () => resolve(tempPath),
            fail: (err) => {
              console.warn('[UiAssets] wx.writeFile native temp failed', tempPath, err);
              resolve(null);
            },
          });
        },
        fail: () => {
          resolve(null);
        },
      });
    };

    if (typeof fs.copyFile === 'function') {
      fs.copyFile({
        srcPath: path,
        destPath: tempPath,
        success: () => resolve(tempPath),
        fail: () => readThenWrite(),
      });
      return;
    }
    readThenWrite();
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readWechatNativeToTempAny(
  paths: readonly string[],
  tempPath: string,
  maxAttempts = 20,
  intervalMs = 300,
): Promise<string | null> {
  const candidates = wechatNativeReadCandidates(paths);
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    for (let i = 0; i < candidates.length; i += 1) {
      const filePath = await readWechatNativeToTempOnce(candidates[i], tempPath);
      if (filePath) return filePath;
    }
    if (attempt + 1 < maxAttempts) {
      await delay(intervalMs);
    }
  }
  return null;
}

function imageToSpriteFrame(key: string, imagePath: string): Promise<SpriteFrame | null> {
  return new Promise((resolve) => {
    const image =
      typeof wx !== 'undefined' && typeof wx.createImage === 'function'
        ? wx.createImage()
        : new Image();
    image.onload = () => {
      const imageAsset = new ImageAsset(image);
      const texture = new Texture2D();
      texture.image = imageAsset;
      const sf = new SpriteFrame();
      sf.texture = texture;
      const w = image.width || imageAsset.width || 1;
      const h = image.height || imageAsset.height || 1;
      sf.rect = new Rect(0, 0, w, h);
      sf.originalSize = new Size(w, h);
      resolve(cacheSprite(key, sf));
    };
    image.onerror = (err) => {
      console.warn('[UiAssets] native image decode failed', key, err);
      resolve(null);
    };
    image.src = imagePath;
  });
}

async function imageToSpriteFrameAny(
  key: string,
  imagePaths: readonly string[],
): Promise<SpriteFrame | null> {
  for (const imagePath of imagePaths) {
    const sf = await imageToSpriteFrame(key, imagePath);
    if (sf) return sf;
  }
  return null;
}

/** 微信真机：主包 native（patch 复制）优先；禁止直载分包路径（4930） */
async function loadWechatNativeSprite(key: string): Promise<SpriteFrame | null> {
  const uuid = UI_SPRITE_UUID[key];
  if (!uuid || !isWechatRuntime()) {
    return null;
  }
  const paths = nativeTexturePathsFromUuid(key, uuid);
  const skipMain = usesWechatNativeFs() && usesSubpackageOnlyNative(key);
  const mainPaths = skipMain ? [] : paths.filter((p) => p.startsWith(`${MAIN_NATIVE_ROOT}/`));
  const subPaths = paths.filter((p) => p.startsWith(`${SUB_NATIVE_ROOT}/`));
  const rawUuid = uuid.split('@')[0];
  const tempPath = `${wx.env.USER_DATA_PATH}/couple-ui-${rawUuid}.png`;

  if (!skipMain) {
    if (usesWechatNativeFs()) {
      // 真机 createImage 直读包内路径不稳定，优先 readFile/copyFile 到 USER_DATA_PATH
      const mainFile = await readWechatNativeToTempAny(mainPaths, tempPath, 6, 150);
      if (mainFile) {
        const sf = await imageToSpriteFrame(key, mainFile);
        if (sf) return sf;
      }
    } else {
      const directMain = await imageToSpriteFrameAny(key, mainPaths);
      if (directMain) return directMain;
      const mainFile = await readWechatNativeToTempAny(mainPaths, tempPath, 4, 150);
      if (mainFile) {
        const sf = await imageToSpriteFrame(key, mainFile);
        if (sf) return sf;
      }
    }
  }

  // 真机禁止读分包 native（HTMLImageElement → Error 4930）；分包-only 大图走 bundle.load（devtools）
  if (usesWechatNativeFs()) {
    console.warn('[UiAssets] native sprite main miss on wx device', key, mainPaths[0] ?? paths[0]);
    return null;
  }

  const subFile = await readWechatNativeToTempAny(
    subPaths,
    tempPath,
    SUB_NATIVE_RETRY_ATTEMPTS,
    SUB_NATIVE_RETRY_INTERVAL_MS,
  );
  if (subFile) {
    return imageToSpriteFrame(key, subFile);
  }

  console.warn('[UiAssets] native sprite unavailable on wx', key, mainPaths[0] ?? paths[0]);
  return null;
}

function loadFromResources(key: string): Promise<SpriteFrame | null> {
  const path = resourcesPath(key);

  if (EDITOR) {
    return new Promise((resolve) => {
      editorResources.load(path, SpriteFrame, (err, sf) => {
        if (!err && sf) {
          resolve(cacheSprite(key, sf));
          return;
        }
        if (err) {
          console.warn('[UiAssets] editor resources.load failed', key, path, err);
        }
        resolve(null);
      });
    });
  }

  return ensureResourcesBundle().then((bundle) => {
    if (!bundle) return null;
    return new Promise<SpriteFrame | null>((resolve) => {
      bundle.load(path, SpriteFrame, (err, sf) => {
        if (!err && sf) {
          resolve(cacheSprite(key, sf));
          return;
        }
        if (err) {
          console.error('[UiAssets] resources.load failed', key, path, err);
        }
        resolve(null);
      });
    });
  });
}

function loadFromBundle(
  bundle: AssetManager.Bundle,
  key: string,
): Promise<SpriteFrame | null> {
  const path = mainBundlePath(key);
  return new Promise((resolve) => {
    bundle.load(path, SpriteFrame, (err, sf) => {
      if (!err && sf) {
        resolve(cacheSprite(key, sf));
        return;
      }
      resolve(null);
    });
  });
}

function loadFromMainBundle(key: string): Promise<SpriteFrame | null> {
  const existing = assetManager.bundles.get('main');
  if (existing) return loadFromBundle(existing, key);

  return new Promise((resolve) => {
    assetManager.loadBundle('main', (err, bundle) => {
      if (err || !bundle) {
        resolve(null);
        return;
      }
      void loadFromBundle(bundle, key).then(resolve);
    });
  });
}

function loadByUuid(key: string): Promise<SpriteFrame | null> {
  const uuid = UI_SPRITE_UUID[key];
  if (!uuid) return Promise.resolve(null);

  return new Promise((resolve) => {
    assetManager.loadAny([{ uuid, type: SpriteFrame }], (err, asset) => {
      if (err || !asset) {
        console.warn('[UiAssets] uuid load failed', key, uuid, err);
        resolve(null);
        return;
      }
      const sf = asset as SpriteFrame;
      resolve(cacheSprite(key, sf));
    });
  });
}

export function loadUiSprite(key: string): Promise<SpriteFrame | null> {
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);

  // 微信真机：主包 native 优先；非 critical 禁止 bundle.load 直读分包（4930）
  const chain = EDITOR
    ? [() => loadByUuid(key), () => loadFromResources(key), () => loadFromMainBundle(key)]
    : usesWechatNativeFs()
      ? [() => loadWechatNativeSprite(key), () => loadFromMainBundle(key)]
    : isWechatRuntime()
      ? [() => loadFromResources(key), () => loadFromMainBundle(key)]
      : [() => loadFromResources(key), () => loadFromMainBundle(key), () => loadByUuid(key)];

  return chain
    .reduce<Promise<SpriteFrame | null>>(
      (p, loader) => p.then((sf) => sf ?? loader()),
      Promise.resolve(null),
    )
    .then((sf) => {
      if (!sf) {
        console.warn('[UiAssets] load failed:', key, '(path:', resourcesPath(key), ')');
      }
      return sf;
    });
}

export async function preloadKeys(
  keys: readonly string[],
  opts: { parallel?: boolean } = {},
): Promise<void> {
  const safeKeys = keys.filter(
    (k): k is string => typeof k === 'string' && k.length > 0,
  );
  // parallel=true：忽略分批限制，全部并行（用于大厅首屏关键小图集合 ≤ 10 张）。
  // 默认仍走 PRELOAD_BATCH_SIZE 分批，避免微信 fs 在重资源批次中被压垮。
  const batchSize =
    opts.parallel || !usesWechatNativeFs() ? safeKeys.length : PRELOAD_BATCH_SIZE;
  for (let i = 0; i < safeKeys.length; i += batchSize) {
    const batch = safeKeys.slice(i, i + batchSize);
    await Promise.all(batch.map((k) => loadUiSprite(k)));
  }
}

export function getCachedSprite(key: string): SpriteFrame | null {
  return cache.get(key) ?? null;
}

/**
 * 把外部加载到的 SpriteFrame 注入主缓存，使后续 getCachedSprite(key) 同步命中。
 * 用途：ChapterResourceLoader 从 chapter_N 分包 bundle.load 出图后回写，
 * 让 FogMapView 等同步取图层无须感知分包细节。
 */
export function cacheUiSprite(key: string, sf: SpriteFrame): SpriteFrame {
  normalizeUiSpriteFrame(sf);
  cache.set(key, sf);
  return sf;
}

/** First-paint lobby keys are main-package critical native; do not gate on resources subpackage. */
export async function preloadPveLobbyUi(): Promise<void> {
  await preloadKeys([...PVE_LOBBY_ESSENTIAL_KEYS], { parallel: true });
}

export async function preloadPveCampUi(): Promise<void> {
  await preloadKeys([...PVE_CAMP_WARM_KEYS], { parallel: true });
}

export function isResourcesBundleReady(): boolean {
  const existing = assetManager.bundles.get('resources');
  if (!existing) return false;
  if (!isWechatRuntime()) return true;
  return isWechatResourcesBundleReady(existing);
}

export async function preloadPveUi(): Promise<void> {
  if (!(await ensureResourcesBundle())) return;
  // 大章节背景（720×1280）在微信真机走分包延迟加载，不进主包 preload
  const keys = usesWechatNativeFs()
    ? ([...PVE_UI_KEYS] as string[]).filter((k) => !usesSubpackageOnlyNative(k))
    : [...PVE_UI_KEYS];
  await preloadKeys(keys);
}

export type ScreenBgKey = 'lobby';

const BG_KEY: Record<ScreenBgKey, string> = {
  lobby: 'backgrounds/bg_lobby',
};

/** 将 Canvas 下 ScreenBg 换为图片背景 */
export async function applyScreenBackground(
  canvas: Node,
  which: ScreenBgKey,
): Promise<void> {
  const sf = await loadUiSprite(BG_KEY[which]);
  if (!sf) {
    console.warn('[UiAssets] screen bg missing', which);
    return;
  }

  let bg = canvas.getChildByName('ScreenBg');
  if (!bg) {
    bg = new Node('ScreenBg');
    bg.setParent(canvas);
    bg.setPosition(0, 0, 0);
    bg.addComponent(UITransform);
  }
  const { w, h } = visibleDesignSize();
  bg.getComponent(UITransform)?.setContentSize(w, h);
  removePlaceholderGraphics(bg);
  ensureArtCover(bg, 'Art', sf, w, h);
  bg.setSiblingIndex(0);
  applyUiLayerTree(bg, canvas.layer);
  const tex = sf.texture;
  console.log(
    '[UiAssets] screen bg applied',
    which,
    tex ? `${tex.width}x${tex.height}` : 'no-texture',
  );
}
