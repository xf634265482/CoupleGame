import { callFunction } from './CloudService';
import type { ExpeditionStatus, FloorState, PveBalanceSnapshot, PveMeta, RunPlayer } from '../pve/core/PveTypes';

interface CloudOk {
  ok: boolean;
  code?: string;
  message?: string;
}

/** 与云端 PveSave.toSaveVO 对齐的存档视图（design ddl-sql.md §1）。 */
export interface PveSaveVO {
  runSeed: number;
  status: ExpeditionStatus;
  chapter: number;
  floor: number;
  player: RunPlayer;
  floorState: FloorState | null;
  balanceSnapshot?: PveBalanceSnapshot | null;
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

/** 读取活跃远征存档（无存档返回 save: null，客户端据此开启新远征 → AC-11）。 */
export async function loadPveSave(): Promise<LoadPveSaveResponse> {
  return ensureOk(
    await callFunction<LoadPveSaveResponse>('pve', { action: 'loadSave' }),
    'PVE_LOAD_SAVE_FAILED',
  );
}

export interface StartRunResponse extends CloudOk {
  runSeed: number;
  resume: boolean;
  charged?: number;
  stamina?: number;
  staminaNextRecoveryAt?: number | null;
}

/** 开始一次远征：runSeed 由服务端生成，客户端不可重试以套取有利地图（→ AC-503/504）。 */
export async function startRun(): Promise<StartRunResponse> {
  return ensureOk(
    await callFunction<StartRunResponse>('pve', { action: 'startRun' }),
    'PVE_START_RUN_FAILED',
  );
}

/** 每完成一层自动存档（→ AC-11）。 */
export async function savePveFloor(report: SaveFloorReport): Promise<SaveFloorResponse> {
  return ensureOk(
    await callFunction<SaveFloorResponse>('pve', { action: 'saveFloor', report }),
    'PVE_SAVE_FLOOR_FAILED',
  );
}

/** 远征结束（死亡或通关）结算：奖励由服务端按已通关层数计算后入账（→ AC-12, AC-14）。 */
export async function settlePveRun(report: SettleRunReport): Promise<SettleRunResponse> {
  return ensureOk(
    await callFunction<SettleRunResponse>('pve', { action: 'settleRun', report }),
    'PVE_SETTLE_RUN_FAILED',
  );
}

// ── AC-20：局外元进度 ──────────────────────────────────────

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
  /** 当前玩家全服排名（比自己层数高的人数 + 1）；0 层或未上榜时为 null */
  myRank?: number | null;
}

export interface UpdateMetaReport {
  /** 本次新解锁的成就 id 列表。 */
  newAchievements?: string[];
  /** 本次新发现的怪物类型列表（MonsterType）。 */
  codexMonsters?: string[];
  /** 本次新获得的装备槽位列表（EquipSlot）。 */
  codexEquipment?: string[];
  /** 钻石余额净变化（营地遗物宝箱消费/退款时使用，负值为扣减、正值为返还）。
   *  云端边界校验：扣减后不得 < 0，否则整次更新拒绝。 */
  diamond?: number;
  /** 本次新解锁的 Boss 遗物图鉴 id 列表（首次拾取时 emit）。 */
  codexRelics?: string[];
  tutorialCompleted?: boolean;
  resetTutorial?: boolean;
}

/** 读取局外元进度（命运碎片余额 + 成就 + 图鉴，→ AC-20）。 */
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

/** 追加元进度条目（幂等写入，→ AC-20）。失败不阻塞游玩流程（客户端下次启动补同步）。 */
export async function updatePveMeta(report: UpdateMetaReport): Promise<CloudOk> {
  return ensureOk(
    await callFunction<CloudOk>('pve', { action: 'updateMeta', report }),
    'PVE_UPDATE_META_FAILED',
  );
}

/**
 * 解锁命运树节点（服务端权威重新校验，→ specs/260610-destiny-tree-ui/design.md）。
 * 失败（碎片不足/顺序不满足/重复解锁）抛错，调用方应保持原状态不做乐观更新。
 */
export async function unlockTreeNode(nodeId: string): Promise<LoadMetaResponse> {
  return ensureOk(
    await callFunction<LoadMetaResponse>('pve', { action: 'unlockTreeNode', nodeId }),
    'PVE_UNLOCK_TREE_NODE_FAILED',
  );
}

/** 重置命运树（消耗 20 钻石，退还全部命运碎片，清空已解锁节点，→ specs/game-design/命运树设计V1.md §七）。 */
export async function resetTree(): Promise<LoadMetaResponse> {
  return ensureOk(
    await callFunction<LoadMetaResponse>('pve', { action: 'resetTreeNodes' }),
    'PVE_RESET_TREE_FAILED',
  );
}
