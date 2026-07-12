import { callFunction } from './CloudService';
import type {
  FloorChallengeSnapshot,
  PveProfile,
  SettleFloorChallengeRequest,
  StartFloorChallengeRequest,
} from '../pve/core/PveProgressionTypes';

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

export interface LoadPveProfileResponse extends CloudOk {
  profile: PveProfile;
}

export interface StartFloorChallengeResponse extends CloudOk {
  challenge: FloorChallengeSnapshot;
}

export interface LoadActiveFloorChallengeResponse extends CloudOk {
  challenge: FloorChallengeSnapshot | null;
}

export interface SettleFloorChallengeResponse extends CloudOk {
  challenge: FloorChallengeSnapshot;
  profile: PveProfile;
  rewards?: Record<string, unknown>;
}

export async function loadPveProfile(): Promise<LoadPveProfileResponse> {
  return ensureOk(
    await callFunction<LoadPveProfileResponse>('pve', { action: 'loadProfile' }),
    'PVE_LOAD_PROFILE_FAILED',
  );
}

export async function startFloorChallenge(
  request: StartFloorChallengeRequest,
): Promise<StartFloorChallengeResponse> {
  return ensureOk(
    await callFunction<StartFloorChallengeResponse>('pve', {
      action: 'startFloorChallenge',
      request,
    }),
    'PVE_START_FLOOR_CHALLENGE_FAILED',
  );
}

export async function loadActiveFloorChallenge(): Promise<LoadActiveFloorChallengeResponse> {
  return ensureOk(
    await callFunction<LoadActiveFloorChallengeResponse>('pve', { action: 'loadActiveFloorChallenge' }),
    'PVE_LOAD_ACTIVE_FLOOR_CHALLENGE_FAILED',
  );
}

export async function settleFloorChallenge(
  request: SettleFloorChallengeRequest,
): Promise<SettleFloorChallengeResponse> {
  return ensureOk(
    await callFunction<SettleFloorChallengeResponse>('pve', {
      action: 'settleFloorChallenge',
      request,
    }),
    'PVE_SETTLE_FLOOR_CHALLENGE_FAILED',
  );
}
