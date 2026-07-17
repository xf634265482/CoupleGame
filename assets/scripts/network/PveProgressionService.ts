import { callFunction } from './CloudService';
import type {
  FloorChallengeSnapshot,
  PveProfile,
  SaveFloorChallengeRuntimeRequest,
  SettleFloorChallengeRequest,
  StartFloorChallengeRequest,
  StartMinghenTrackingRequest,
  UpdateCampConfigurationRequest,
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
  profile: PveProfile;
  resume: boolean;
  charged: number;
}

export interface LoadActiveFloorChallengeResponse extends CloudOk {
  challenge: FloorChallengeSnapshot | null;
}

export interface SaveFloorChallengeRuntimeResponse extends CloudOk {
  challenge: FloorChallengeSnapshot;
  idempotent: boolean;
}

export interface SettleFloorChallengeResponse extends CloudOk {
  challenge: FloorChallengeSnapshot;
  profile: PveProfile;
  rewards?: Record<string, unknown>;
  idempotent: boolean;
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

export async function startMinghenTracking(request: StartMinghenTrackingRequest): Promise<LoadPveProfileResponse> {
  return ensureOk(await callFunction<LoadPveProfileResponse>('pve', { action: 'startMinghenTracking', request }), 'PVE_START_MINGHEN_TRACKING_FAILED');
}

export async function updateCampConfiguration(request: UpdateCampConfigurationRequest): Promise<LoadPveProfileResponse> {
  return ensureOk(await callFunction<LoadPveProfileResponse>('pve', { action: 'updateCampConfiguration', request }), 'PVE_UPDATE_CAMP_CONFIGURATION_FAILED');
}

export type ManageCampRequest =
  | { type: 'EQUIPMENT'; action: 'TOGGLE_LOCK' | 'ENHANCE' | 'SELL'; instanceId: string }
  | { type: 'SAVE_MINGHEN_PRESET'; id?: string; name: string };

export async function manageCamp(request: ManageCampRequest): Promise<LoadPveProfileResponse> {
  return ensureOk(await callFunction<LoadPveProfileResponse>('pve', { action: 'manageCamp', request }), 'PVE_MANAGE_CAMP_FAILED');
}

export async function loadActiveFloorChallenge(): Promise<LoadActiveFloorChallengeResponse> {
  return ensureOk(
    await callFunction<LoadActiveFloorChallengeResponse>('pve', { action: 'loadActiveFloorChallenge' }),
    'PVE_LOAD_ACTIVE_FLOOR_CHALLENGE_FAILED',
  );
}

export async function saveFloorChallengeRuntime(
  request: SaveFloorChallengeRuntimeRequest,
): Promise<SaveFloorChallengeRuntimeResponse> {
  return ensureOk(
    await callFunction<SaveFloorChallengeRuntimeResponse>('pve', {
      action: 'saveFloorChallengeRuntime',
      request,
    }),
    'PVE_SAVE_FLOOR_RUNTIME_FAILED',
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
