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
import type { PveBalanceSnapshot } from './PveTypes';

export interface PendingSettlementStorage {
  load(): { request: SettleFloorChallengeRequest; savedAt: number } | null;
  save(request: SettleFloorChallengeRequest): void;
  clear(challengeId?: string): void;
}

export interface PersistentFloorFlowApi {
  loadProfile(): Promise<{ profile: PveProfile }>;
  loadActive(): Promise<{ challenge: FloorChallengeSnapshot | null }>;
  start(request: StartFloorChallengeRequest): Promise<{
    challenge: FloorChallengeSnapshot;
    profile?: PveProfile;
    resume: boolean;
    charged?: number;
  }>;
  save(request: SaveFloorChallengeRuntimeRequest): Promise<unknown>;
  settle(request: SettleFloorChallengeRequest): Promise<{ profile: PveProfile; rewards?: Record<string, unknown> }>;
}

export interface PersistentFloorFlowState {
  profile: PveProfile;
  challenge: FloorChallengeSnapshot;
  runtime: PersistentExpeditionRuntime;
  resumed: boolean;
}

export type SettleResult = { profile: PveProfile; rewards?: Record<string, unknown> };

function progressionRequest(
  profile: PveProfile,
  floor = profile.highestUnlockedFloor,
  abandonActive = false,
  forceRestart = false,
): StartFloorChallengeRequest {
  return {
    floor,
    mode: 'PROGRESSION',
    professionId: profile.selectedProfessionId,
    equipmentLoadout: { ...profile.equipmentLoadout },
    minghenLoadout: profile.minghenLoadout.map((entry) => ({ ...entry })),
    trackedMinghenId: null,
    ...(abandonActive ? { abandonActive: true } : {}),
    ...(forceRestart ? { forceRestart: true } : {}),
  };
}

function restartRequestFromChallenge(challenge: FloorChallengeSnapshot): StartFloorChallengeRequest {
  return {
    floor: challenge.floor,
    mode: challenge.mode,
    professionId: challenge.config.professionId,
    equipmentLoadout: { ...challenge.config.equipmentLoadout },
    minghenLoadout: challenge.config.minghenLoadout.map((entry) => ({ ...entry })),
    trackedMinghenId: challenge.config.trackedMinghenId ?? null,
    abandonActive: true,
    forceRestart: true,
  };
}

function isTransientSettleError(err: unknown, includeTimeouts: boolean): boolean {
  const message = err instanceof Error ? err.message : String(err);
  if (/TransactionConflict|TransactionBusy|DATABASE_TRANSACTION_FAIL|-501001|resourceunavailable|transaction\s+is\s+(conflict|busy)|modified by others/i.test(message)) {
    return true;
  }
  if (!includeTimeouts) return false;
  return /FUNCTIONS_TIME_LIMIT_EXCEEDED|timed out|time.?out|TIMEOUT|network/i.test(message);
}

function optimisticProfileAfterSettlement(
  profile: PveProfile,
  runtime: PersistentExpeditionRuntime,
): PveProfile {
  const floor = runtime.floor;
  const cleared = runtime.status === 'CLEAR';
  return {
    ...profile,
    activeChallengeId: profile.activeChallengeId === runtime.challengeId
      ? null
      : profile.activeChallengeId,
    highestClearedFloor: cleared
      ? Math.max(profile.highestClearedFloor, floor)
      : profile.highestClearedFloor,
    highestUnlockedFloor: cleared
      && profile.highestUnlockedFloor === floor
      ? Math.min(MAX_READY_FLOOR, Math.max(profile.highestUnlockedFloor, floor + 1))
      : profile.highestUnlockedFloor,
    updatedAt: Date.now(),
  };
}

export class PersistentFloorFlow {
  private _state: PersistentFloorFlowState | null = null;
  private _settlementInFlight: {
    challengeId: string;
    promise: Promise<SettleResult>;
  } | null = null;
  private _settledResult: {
    challengeId: string;
    value: SettleResult;
  } | null = null;
  private _balanceSnapshot: PveBalanceSnapshot | null = null;

  constructor(
    private readonly _api: PersistentFloorFlowApi,
    private readonly _pendingStore?: PendingSettlementStorage,
  ) {}

  get state(): PersistentFloorFlowState | null {
    return this._state;
  }

  get hasCloudSettlementPending(): boolean {
    if (!this._state) return false;
    const id = this._state.challenge.challengeId;
    if (this._settledResult?.challengeId === id) return false;
    if (this._settlementInFlight?.challengeId === id) return true;
    const pending = this._pendingStore?.load();
    return pending?.request.challengeId === id;
  }

  private _rememberBalanceSnapshot(options?: {
    tutorialCompleted?: boolean;
    balanceSnapshot?: PveBalanceSnapshot | null;
  }): void {
    if (options && Object.prototype.hasOwnProperty.call(options, 'balanceSnapshot')) {
      this._balanceSnapshot = options.balanceSnapshot ?? null;
    }
  }

  async bootstrap(
    selectedFloor?: number,
    options?: { tutorialCompleted?: boolean; balanceSnapshot?: PveBalanceSnapshot | null },
  ): Promise<PersistentFloorFlowState> {
    this._settlementInFlight = null;
    this._settledResult = null;
    this._rememberBalanceSnapshot(options);
    await this._flushPendingFromStore();

    const [{ profile }, { challenge: active }] = await Promise.all([
      this._api.loadProfile(),
      this._api.loadActive(),
    ]);
    const hasExplicitFloor = Number.isInteger(selectedFloor)
      && selectedFloor! >= 1
      && selectedFloor! <= profile.highestUnlockedFloor;
    const requestedFloor = hasExplicitFloor ? selectedFloor! : profile.highestUnlockedFloor;
    let challenge = active;
    let authoritativeProfile = profile;
    let resumed = false;
    if (!challenge || (hasExplicitFloor && challenge.floor !== requestedFloor)) {
      const started = await this._api.start(progressionRequest(profile, requestedFloor, Boolean(challenge)));
      challenge = started.challenge;
      authoritativeProfile = started.profile ?? profile;
      resumed = started.resume;
    } else {
      resumed = true;
    }
    const runtimeOptions = {
      tutorialCompleted: options?.tutorialCompleted,
      balanceSnapshot: this._balanceSnapshot,
    };
    const runtime = challenge.runtimeSave
      ? resumeOrRebuildPersistentRuntime(
        challenge,
        challenge.runtimeSave,
        authoritativeProfile,
        Date.now(),
        runtimeOptions,
      )
      : createPersistentFloorRuntime(challenge, authoritativeProfile, runtimeOptions);
    this._state = { profile: authoritativeProfile, challenge, runtime, resumed };
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

  async restartCurrentFloor(options?: {
    tutorialCompleted?: boolean;
    balanceSnapshot?: PveBalanceSnapshot | null;
  }): Promise<PersistentFloorFlowState> {
    if (!this._state) throw new Error('FLOOR_FLOW_NOT_READY');
    if (this.hasCloudSettlementPending) throw new Error('FLOOR_SETTLEMENT_PENDING');
    this._rememberBalanceSnapshot(options);
    const { profile } = await this._api.loadProfile();
    const started = await this._api.start(restartRequestFromChallenge(this._state.challenge));
    const runtime = createPersistentFloorRuntime(started.challenge, started.profile ?? profile, {
      tutorialCompleted: options?.tutorialCompleted,
      balanceSnapshot: this._balanceSnapshot,
    });
    this._settlementInFlight = null;
    this._settledResult = null;
    this._pendingStore?.clear(this._state.challenge.challengeId);
    this._state = {
      profile: started.profile ?? profile,
      challenge: started.challenge,
      runtime,
      resumed: false,
    };
    return this._state;
  }

  /**
   * 通关/死亡：本地落单 + 乐观清 activeChallengeId，后台 settle。
   * 不阻塞 UI；点「继续远征」时用 ensureSettled() 等云端完成。
   */
  beginDeferredSettle(extra: Partial<SettleFloorChallengeRequest> = {}): void {
    if (!this._state) throw new Error('FLOOR_FLOW_NOT_READY');
    if (this._state.runtime.status === 'ACTIVE') throw new Error('FLOOR_NOT_READY_TO_SETTLE');
    const challengeId = this._state.challenge.challengeId;
    if (this._settledResult?.challengeId === challengeId) return;
    if (this._settlementInFlight?.challengeId === challengeId) return;

    const request = this._buildSettleRequest(extra);
    this._pendingStore?.save(request);
    this._state = {
      ...this._state,
      profile: optimisticProfileAfterSettlement(this._state.profile, this._state.runtime),
    };
    const promise = this._launchSettle(request);
    // 后台消化；失败保留本地 pending，ensureSettled / 下次进远征会再补。
    void promise.catch(() => undefined);
  }

  /** 阻塞直到当前层云端结算完成（幂等可安全重试）。 */
  async ensureSettled(
    extra: Partial<SettleFloorChallengeRequest> = {},
  ): Promise<SettleResult> {
    if (!this._state) throw new Error('FLOOR_FLOW_NOT_READY');
    const challengeId = this._state.challenge.challengeId;
    if (this._settledResult?.challengeId === challengeId) return this._settledResult.value;

    if (this._settlementInFlight?.challengeId === challengeId) {
      try {
        return await this._settlementInFlight.promise;
      } catch (err) {
        // 瞬时错误才从 pending 再开一轮；业务错误直接抛出。
        if (!isTransientSettleError(err, true)) throw err;
      }
    }

    const pending = this._pendingStore?.load();
    const request = pending?.request.challengeId === challengeId
      ? { ...pending.request, ...extra }
      : this._buildSettleRequest(extra);
    this._pendingStore?.save(request);
    return this._launchSettle(request);
  }

  /** @deprecated 兼容旧调用：等价于 beginDeferredSettle + ensureSettled */
  async settle(
    extra: Partial<SettleFloorChallengeRequest> = {},
  ): Promise<SettleResult> {
    this.beginDeferredSettle(extra);
    return this.ensureSettled(extra);
  }

  private _buildSettleRequest(
    extra: Partial<SettleFloorChallengeRequest>,
  ): SettleFloorChallengeRequest {
    if (!this._state) throw new Error('FLOOR_FLOW_NOT_READY');
    const challengeId = this._state.challenge.challengeId;
    return {
      ...buildFloorSettlementRequest(this._state.runtime),
      ...extractCombatEquipmentSettlement(this._state.runtime, this._state.profile),
      ...extra,
      challengeId,
      status: this._state.runtime.status as Exclude<typeof this._state.runtime.status, 'ACTIVE'>,
    };
  }

  private _launchSettle(request: SettleFloorChallengeRequest): Promise<SettleResult> {
    const challengeId = request.challengeId;
    if (this._settlementInFlight?.challengeId === challengeId) {
      return this._settlementInFlight.promise;
    }
    const promise = this._settleOnceWithConflictRecovery(request, {
      includeTimeouts: true,
      maxAttempts: 12,
    }).then((settled) => {
      if (this._state?.challenge.challengeId === challengeId) {
        this._state = { ...this._state, profile: settled.profile };
      }
      this._settledResult = { challengeId, value: settled };
      this._pendingStore?.clear(challengeId);
      return settled;
    }).finally(() => {
      if (this._settlementInFlight?.challengeId === challengeId) this._settlementInFlight = null;
    });
    this._settlementInFlight = { challengeId, promise };
    return promise;
  }

  private async _flushPendingFromStore(): Promise<void> {
    const pending = this._pendingStore?.load();
    if (!pending) return;
    try {
      const settled = await this._settleOnceWithConflictRecovery(pending.request, {
        includeTimeouts: true,
        maxAttempts: 12,
      });
      this._pendingStore?.clear(pending.request.challengeId);
      this._settledResult = {
        challengeId: pending.request.challengeId,
        value: settled,
      };
    } catch {
      /* 保留 pending；后续 ensureSettled / 大厅补结算再试 */
    }
  }

  private async _settleOnceWithConflictRecovery(
    request: SettleFloorChallengeRequest,
    options: { includeTimeouts?: boolean; maxAttempts?: number } = {},
  ): Promise<SettleResult> {
    const includeTimeouts = options.includeTimeouts === true;
    const maxAttempts = options.maxAttempts ?? (includeTimeouts ? 12 : 8);
    let lastError: unknown = null;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        return await this._api.settle(request);
      } catch (err) {
        lastError = err;
        if (!isTransientSettleError(err, includeTimeouts) || attempt === maxAttempts - 1) {
          throw err;
        }
        const waitMs = Math.min(2500, 180 * (2 ** attempt)) + Math.floor(Math.random() * 100);
        await new Promise<void>((resolve) => {
          setTimeout(resolve, waitMs);
        });
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  async continueNextFloor(): Promise<PersistentFloorFlowState> {
    if (!this._state || this._state.runtime.status !== 'CLEAR') throw new Error('FLOOR_NOT_CLEARED');
    await this.ensureSettled();
    if (this._state.profile.activeChallengeId) throw new Error('PREVIOUS_FLOOR_NOT_SETTLED');
    if (this._state.profile.highestUnlockedFloor > MAX_READY_FLOOR) {
      throw new Error('ALL_READY_FLOORS_COMPLETE');
    }
    const started = await this._api.start(progressionRequest(this._state.profile));
    const nextProfile = started.profile ?? this._state.profile;
    const runtime = createPersistentFloorRuntime(started.challenge, nextProfile, {
      tutorialCompleted: true,
      balanceSnapshot: this._balanceSnapshot,
    });
    this._state = {
      profile: nextProfile,
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
