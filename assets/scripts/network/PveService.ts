import { callFunction } from './CloudService';
import type { PveBalanceSnapshot, PveMeta } from '../pve/core/PveTypes';

interface CloudOk {
  ok: boolean;
  code?: string;
  message?: string;
}

function ensureOk<T extends CloudOk>(res: T, fallback: string): T {
  if (!res.ok) {
    throw new Error(res.message || res.code || fallback);
  }
  return res;
}

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
}

export interface LoadPveLeaderboardResponse extends CloudOk {
  entries: PveLeaderboardEntry[];
  /** 褰撳墠鐜╁鍏ㄦ湇鎺掑悕锛堟瘮鑷繁灞傛暟楂樼殑浜烘暟 + 1锛夛紱0 灞傛垨鏈笂姒滄椂涓?null */
  myRank?: number | null;
}

export interface UpdateMetaReport {
  /** Diamond delta. Cloud rejects if balance would go below zero. */
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
