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
  /** @deprecated 局外钻石已废弃；勿再传。 */
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

/** Update out-of-run markers (tutorial). */
export async function updatePveMeta(report: UpdateMetaReport): Promise<CloudOk> {
  return ensureOk(
    await callFunction<CloudOk>('pve', { action: 'updateMeta', report }),
    'PVE_UPDATE_META_FAILED',
  );
}

export type MailAttachmentType =
  | 'stardust'
  | 'stamina'
  | 'quenchSand'
  | 'fusionCore'
  | 'voidHide'
  | 'makeupCards';

export interface MailAttachment {
  type: MailAttachmentType;
  amount: number;
}

export interface MailItem {
  id: string;
  title: string;
  body: string;
  attachments: MailAttachment[];
  claimed: boolean;
  read: boolean;
  deleted?: boolean;
  batchId?: string;
  createdAt: number;
  createdBy?: string;
  unread: boolean;
}

export interface ListMailsResponse extends CloudOk {
  mails: MailItem[];
  unreadCount: number;
}

export interface ClaimMailResponse extends CloudOk {
  mail: MailItem;
  profile?: { gold?: number; stamina?: number; staminaNextRecoveryAt?: number | null };
  stamina?: number;
}

export async function listMails(limit = 100): Promise<ListMailsResponse> {
  return ensureOk(
    await callFunction<ListMailsResponse>('pve', { action: 'listMails', limit }),
    'PVE_LIST_MAILS_FAILED',
  );
}

export async function claimMail(mailId: string): Promise<ClaimMailResponse> {
  return ensureOk(
    await callFunction<ClaimMailResponse>('pve', { action: 'claimMail', mailId }),
    'PVE_CLAIM_MAIL_FAILED',
  );
}

export async function claimAllMails(): Promise<ClaimMailResponse & { claimedCount?: number }> {
  return ensureOk(
    await callFunction<ClaimMailResponse & { claimedCount?: number }>('pve', { action: 'claimAllMails' }),
    'PVE_CLAIM_ALL_MAILS_FAILED',
  );
}

export async function deleteMail(mailId: string): Promise<CloudOk> {
  return ensureOk(
    await callFunction<CloudOk>('pve', { action: 'deleteMail', mailId }),
    'PVE_DELETE_MAIL_FAILED',
  );
}

export async function markMailRead(mailId: string): Promise<{ ok: boolean; mail?: MailItem; code?: string; message?: string }> {
  return ensureOk(
    await callFunction<{ ok: boolean; mail?: MailItem; code?: string; message?: string }>('pve', {
      action: 'markMailRead',
      mailId,
    }),
    'PVE_MARK_MAIL_READ_FAILED',
  );
}

export type CheckInReward = {
  gold?: number;
  quenchSand?: number;
  fusionCore?: number;
  voidHide?: number;
  makeupCards?: number;
};

export interface CheckInCalendarDay {
  day: number;
  reward: CheckInReward;
  signed: boolean;
  canMakeup: boolean;
}

export interface CheckInMilestoneRow {
  days: number;
  reward: CheckInReward;
  reached: boolean;
  claimed: boolean;
}

export interface CheckInState {
  monthKey: string;
  today: number;
  signedDays: number[];
  claimedMilestones: number[];
  makeupCards: number;
  canSignToday: boolean;
  claimableMilestones: number[];
  milestones: CheckInMilestoneRow[];
  calendar: CheckInCalendarDay[];
}

export interface CheckInResponse extends CloudOk {
  checkIn: CheckInState;
  gained?: CheckInReward | null;
  profile?: {
    gold?: number;
    materials?: { quenchSand: number; fusionCore: number; voidHide: number };
    checkIn?: {
      monthKey: string;
      signedDays: number[];
      claimedMilestones: number[];
      makeupCards: number;
    };
  };
  redDot?: boolean;
}

export async function getCheckInState(): Promise<CheckInResponse> {
  return ensureOk(
    await callFunction<CheckInResponse>('pve', {
      action: 'checkIn',
      request: { action: 'GET_STATE' },
    }),
    'PVE_CHECKIN_STATE_FAILED',
  );
}

export async function signCheckInToday(): Promise<CheckInResponse> {
  return ensureOk(
    await callFunction<CheckInResponse>('pve', {
      action: 'checkIn',
      request: { action: 'SIGN_TODAY' },
    }),
    'PVE_CHECKIN_SIGN_FAILED',
  );
}

export async function makeupCheckIn(day: number): Promise<CheckInResponse> {
  return ensureOk(
    await callFunction<CheckInResponse>('pve', {
      action: 'checkIn',
      request: { action: 'MAKEUP', day },
    }),
    'PVE_CHECKIN_MAKEUP_FAILED',
  );
}

export async function claimCheckInMilestone(days: number): Promise<CheckInResponse> {
  return ensureOk(
    await callFunction<CheckInResponse>('pve', {
      action: 'checkIn',
      request: { action: 'CLAIM_MILESTONE', days },
    }),
    'PVE_CHECKIN_MILESTONE_FAILED',
  );
}

