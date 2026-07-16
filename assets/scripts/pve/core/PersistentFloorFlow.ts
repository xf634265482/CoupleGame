import { buildFloorSettlementRequest, serializeFloorRuntime } from './FloorChallengeLifecycle';
import { extractCombatEquipmentSettlement } from './CombatEquipmentSettlement';
import {
  createPersistentFloorRuntime,
  resumeOrRebuildPersistentRuntime,
  type PersistentExpeditionRuntime,
} from './PersistentExpeditionRuntime';
import { MAX_READY_FLOOR } from './chapterRouting';
import type {
  FloorChallengeSnapshot,
  PveProfile,
  SaveFloorChallengeRuntimeRequest,
  SettleFloorChallengeRequest,
  StartFloorChallengeRequest,
} from './PveProgressionTypes';

export interface PersistentFloorFlowApi {
  loadProfile(): Promise<{ profile: PveProfile }>;
  loadActive(): Promise<{ challenge: FloorChallengeSnapshot | null }>;
  start(request: StartFloorChallengeRequest): Promise<{ challenge: FloorChallengeSnapshot; resume: boolean }>;
  save(request: SaveFloorChallengeRuntimeRequest): Promise<unknown>;
  settle(request: SettleFloorChallengeRequest): Promise<{ profile: PveProfile; rewards?: Record<string, unknown> }>;
}

export interface PersistentFloorFlowState {
  profile: PveProfile;
  challenge: FloorChallengeSnapshot;
  runtime: PersistentExpeditionRuntime;
  resumed: boolean;
}

function progressionRequest(
  profile: PveProfile,
  floor = profile.highestUnlockedFloor,
  abandonActive = false,
): StartFloorChallengeRequest {
  return {
    floor,
    mode: 'PROGRESSION',
    professionId: profile.selectedProfessionId,
    equipmentLoadout: { ...profile.equipmentLoadout },
    minghenLoadout: profile.minghenLoadout.map((entry) => ({ ...entry })),
    trackedMinghenId: null,
    ...(abandonActive ? { abandonActive: true } : {}),
  };
}

export class PersistentFloorFlow {
  private _state: PersistentFloorFlowState | null = null;
  private _settlementInFlight: {
    challengeId: string;
    promise: Promise<{ profile: PveProfile; rewards?: Record<string, unknown> }>;
  } | null = null;
  private _settledResult: {
    challengeId: string;
    value: { profile: PveProfile; rewards?: Record<string, unknown> };
  } | null = null;

  constructor(private readonly _api: PersistentFloorFlowApi) {}

  get state(): PersistentFloorFlowState | null {
    return this._state;
  }

  async bootstrap(
    selectedFloor?: number,
    options?: { tutorialCompleted?: boolean },
  ): Promise<PersistentFloorFlowState> {
    this._settlementInFlight = null;
    this._settledResult = null;
    const [{ profile }, { challenge: active }] = await Promise.all([
      this._api.loadProfile(),
      this._api.loadActive(),
    ]);
    const hasExplicitFloor = Number.isInteger(selectedFloor)
      && selectedFloor! >= 1
      && selectedFloor! <= profile.highestUnlockedFloor;
    const requestedFloor = hasExplicitFloor ? selectedFloor! : profile.highestUnlockedFloor;
    let challenge = active;
    let resumed = false;
    if (!challenge || (hasExplicitFloor && challenge.floor !== requestedFloor)) {
      const started = await this._api.start(progressionRequest(profile, requestedFloor, Boolean(challenge)));
      challenge = started.challenge;
      resumed = started.resume;
    } else {
      resumed = true;
    }
    const runtime = challenge.runtimeSave
      ? resumeOrRebuildPersistentRuntime(challenge, challenge.runtimeSave, profile)
      : createPersistentFloorRuntime(challenge, profile, {
        tutorialCompleted: options?.tutorialCompleted,
      });
    this._state = { profile, challenge, runtime, resumed };
    return this._state;
  }

  updateRuntime(runtime: PersistentExpeditionRuntime): void {
    if (!this._state || runtime.challengeId !== this._state.challenge.challengeId) {
      throw new Error('FLOOR_FLOW_RUNTIME_MISMATCH');
    }
    this._state = { ...this._state, runtime };
  }

  async save(): Promise<void> {
    if (!this._state || this._state.runtime.status !== 'ACTIVE') return;
    await this._api.save({
      challengeId: this._state.challenge.challengeId,
      serializedRuntime: serializeFloorRuntime(this._state.runtime),
    });
  }

  async settle(
    extra: Partial<SettleFloorChallengeRequest> = {},
  ): Promise<{ profile: PveProfile; rewards?: Record<string, unknown> }> {
    if (!this._state) throw new Error('FLOOR_FLOW_NOT_READY');
    const challengeId = this._state.challenge.challengeId;
    if (this._settledResult?.challengeId === challengeId) return this._settledResult.value;
    if (this._settlementInFlight?.challengeId === challengeId) return this._settlementInFlight.promise;
    const request: SettleFloorChallengeRequest = {
      ...buildFloorSettlementRequest(this._state.runtime),
      ...extractCombatEquipmentSettlement(this._state.runtime, this._state.profile),
      ...extra,
      challengeId,
      status: this._state.runtime.status as Exclude<typeof this._state.runtime.status, 'ACTIVE'>,
    };
    const promise = this._settleOnceWithConflictRecovery(request).then((settled) => {
      if (this._state?.challenge.challengeId === challengeId) {
        this._state = { ...this._state, profile: settled.profile };
      }
      this._settledResult = { challengeId, value: settled };
      return settled;
    }).finally(() => {
      if (this._settlementInFlight?.challengeId === challengeId) this._settlementInFlight = null;
    });
    this._settlementInFlight = { challengeId, promise };
    return promise;
  }

  private async _settleOnceWithConflictRecovery(
    request: SettleFloorChallengeRequest,
  ): Promise<{ profile: PveProfile; rewards?: Record<string, unknown> }> {
    const isTransientConflict = (err: unknown): boolean => {
      const message = err instanceof Error ? err.message : String(err);
      return /TransactionConflict|TransactionBusy|DATABASE_TRANSACTION_FAIL|-501001|resourceunavailable|transaction\s+is\s+(conflict|busy)|modified by others/i.test(
        message,
      );
    };
    // 真机高 RTT 下后台 runtime 存档常与 settle 抢写同一 challenge 文档；同请求最多再试 3 次（总 4 次），
    // challengeId + 终态幂等保证不会重复发奖。
    const maxAttempts = 4;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        return await this._api.settle(request);
      } catch (err) {
        lastError = err;
        if (!isTransientConflict(err) || attempt === maxAttempts - 1) throw err;
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 250 * (attempt + 1));
        });
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  async continueNextFloor(): Promise<PersistentFloorFlowState> {
    if (!this._state || this._state.runtime.status !== 'CLEAR') throw new Error('FLOOR_NOT_CLEARED');
    if (this._state.profile.activeChallengeId) throw new Error('PREVIOUS_FLOOR_NOT_SETTLED');
    // 结算后 highestUnlockedFloor = 已通关层 + 1；超过当前已开放内容则只能回大厅。
    if (this._state.profile.highestUnlockedFloor > MAX_READY_FLOOR) {
      throw new Error('ALL_READY_FLOORS_COMPLETE');
    }
    const started = await this._api.start(progressionRequest(this._state.profile));
    // 次层永不重放教学：即便结算跳回第一层（异常路径），也不重新注入引导脚本。
    const runtime = createPersistentFloorRuntime(started.challenge, this._state.profile, {
      tutorialCompleted: true,
    });
    this._state = {
      profile: this._state.profile,
      challenge: started.challenge,
      runtime,
      resumed: false,
    };
    this._settledResult = null;
    this._settlementInFlight = null;
    return this._state;
  }

  returnToCamp(): void {
    if (this._state?.profile.activeChallengeId) throw new Error('ACTIVE_FLOOR_MUST_SETTLE_FIRST');
    this._state = null;
  }
}
