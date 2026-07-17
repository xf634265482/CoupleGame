import { callFunction } from './CloudService';
import type { ExpeditionStatus, FloorState, PveBalanceSnapshot, PveMeta, RunPlayer } from '../pve/core/PveTypes';

interface CloudOk {
  ok: boolean;
  code?: string;
  message?: string;
}

/** 涓庝簯绔?PveSave.toSaveVO 瀵归綈鐨勫瓨妗ｈ鍥撅紙design ddl-sql.md 搂1锛夈€?*/
export interface PveSaveVO {
  runSeed: number;
  status: ExpeditionStatus;
  chapter: number;
  floor: number;
  player: RunPlayer;
  floorState: FloorState | null;
  balanceSnapshot?: PveBalanceSnapshot | null;
  difficultyTier?: string;
  updatedAt: number;
}

export interface LoadPveSaveResponse extends CloudOk {
  save?: PveSaveVO | null;
}

export interface SaveFloorReport {
  runSeed: number;
  chapter: number;
  floor: number;
  player: RunPlayer;
  floorState: FloorState;
  balanceSnapshot?: PveBalanceSnapshot | null;
  difficultyTier?: string;
}

export interface SaveFloorResponse extends CloudOk {
  save?: PveSaveVO;
}

export interface SettleRunReport {
  runSeed: number;
  floor: number;
  status: 'DEAD' | 'COMPLETED';
}

export interface PveSettleRewards {
  floorsCleared: number;
  diamond: number;
  destinyShards: number;
}

export interface SettleRunResponse extends CloudOk {
  rewards?: PveSettleRewards;
}

function ensureOk<T extends CloudOk>(res: T, fallback: string): T {
  if (!res.ok) {
    throw new Error(res.message || res.code || fallback);
  }
  return res;
}

/** 璇诲彇娲昏穬杩滃緛瀛樻。锛堟棤瀛樻。杩斿洖 save: null锛屽鎴风鎹寮€鍚柊杩滃緛 鈫?AC-11锛夈€?*/
export async function loadPveSave(): Promise<LoadPveSaveResponse> {
  return ensureOk(
    await callFunction<LoadPveSaveResponse>('pve', { action: 'loadSave' }),
    'PVE_LOAD_SAVE_FAILED',
  );
}

export interface StartRunResponse extends CloudOk {
  runSeed: number;
  resume: boolean;
  difficultyTier?: string;
  charged?: number;
  stamina?: number;
  staminaNextRecoveryAt?: number | null;
}

/** 寮€濮嬩竴娆¤繙寰侊細runSeed 鐢辨湇鍔＄鐢熸垚锛屽鎴风涓嶅彲閲嶈瘯浠ュ鍙栨湁鍒╁湴鍥撅紙鈫?AC-503/504锛夈€?*/
export async function startRun(): Promise<StartRunResponse> {
  return ensureOk(
    await callFunction<StartRunResponse>('pve', { action: 'startRun' }),
    'PVE_START_RUN_FAILED',
  );
}

/** 姣忓畬鎴愪竴灞傝嚜鍔ㄥ瓨妗ｏ紙鈫?AC-11锛夈€?*/
export async function savePveFloor(report: SaveFloorReport): Promise<SaveFloorResponse> {
  return ensureOk(
    await callFunction<SaveFloorResponse>('pve', { action: 'saveFloor', report }),
    'PVE_SAVE_FLOOR_FAILED',
  );
}

/** 杩滃緛缁撴潫锛堟浜℃垨閫氬叧锛夌粨绠楋細濂栧姳鐢辨湇鍔＄鎸夊凡閫氬叧灞傛暟璁＄畻鍚庡叆璐︼紙鈫?AC-12, AC-14锛夈€?*/
export async function settlePveRun(report: SettleRunReport): Promise<SettleRunResponse> {
  return ensureOk(
    await callFunction<SettleRunResponse>('pve', { action: 'settleRun', report }),
    'PVE_SETTLE_RUN_FAILED',
  );
}

// 鈹€鈹€ AC-20锛氬眬澶栧厓杩涘害 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

export interface LoadMetaResponse extends CloudOk {
  meta: PveMeta;
  balanceSnapshot?: PveBalanceSnapshot | null;
}

export interface PveLeaderboardEntry {
  rank: number;
  userId: string;
  nickname: string;
  avatarUrl: string;
  highestFloor: number;
  highestTier?: string;
  highestClassId?: string;
  highestAwakenForm?: string;
}

export interface LoadPveLeaderboardResponse extends CloudOk {
  entries: PveLeaderboardEntry[];
  /** 褰撳墠鐜╁鍏ㄦ湇鎺掑悕锛堟瘮鑷繁灞傛暟楂樼殑浜烘暟 + 1锛夛紱0 灞傛垨鏈笂姒滄椂涓?null */
  myRank?: number | null;
}

export interface UpdateMetaReport {
  /** @deprecated Achievements are not a live feature; client no longer uploads. */
  /** @deprecated Codex is not a live feature; client no longer uploads. */
  /** @deprecated Codex is not a live feature; client no longer uploads. */
  /** Diamond delta (camp relic chest spend / refund). Cloud rejects if balance would go < 0. */
  diamond?: number;
  tutorialCompleted?: boolean;
  resetTutorial?: boolean;
}

/** Load out-of-run meta snapshot. */
export async function loadPveMeta(): Promise<LoadMetaResponse> {
  return ensureOk(
    await callFunction<LoadMetaResponse>('pve', { action: 'loadMeta' }),
    'PVE_LOAD_META_FAILED',
  );
}

export async function loadPveLeaderboard(limit = 50): Promise<LoadPveLeaderboardResponse> {
  return ensureOk(
    await callFunction<LoadPveLeaderboardResponse>('pve', {
      action: 'loadLeaderboard',
      limit,
    }),
    'PVE_LOAD_LEADERBOARD_FAILED',
  );
}

/** Update out-of-run markers (tutorial / diamond). */
export async function updatePveMeta(report: UpdateMetaReport): Promise<CloudOk> {
  return ensureOk(
    await callFunction<CloudOk>('pve', { action: 'updateMeta', report }),
    'PVE_UPDATE_META_FAILED',
  );
}

/**
 * 瑙ｉ攣鍛借繍鏍戣妭鐐癸紙鏈嶅姟绔潈濞侀噸鏂版牎楠岋紝鈫?specs/260610-destiny-tree-ui/design.md锛夈€?
 * 澶辫触锛堢鐗囦笉瓒?椤哄簭涓嶆弧瓒?閲嶅瑙ｉ攣锛夋姏閿欙紝璋冪敤鏂瑰簲淇濇寔鍘熺姸鎬佷笉鍋氫箰瑙傛洿鏂般€?
 */

/** 閲嶇疆鍛借繍鏍戯紙娑堣€?20 閽荤煶锛岄€€杩樺叏閮ㄥ懡杩愮鐗囷紝娓呯┖宸茶В閿佽妭鐐癸紝鈫?specs/game-design/鍛借繍鏍戣璁1.md 搂涓冿級銆?*/
