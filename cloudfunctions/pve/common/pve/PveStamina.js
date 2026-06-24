const STAMINA_MAX = 60;
const STAMINA_RUN_COST = 20;
const STAMINA_RECOVERY_MS = 5 * 60 * 1000;

function normalizeInt(value, fallback) {
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

function resolveStamina(current, updatedAt, now = Date.now()) {
  const safeNow = normalizeInt(now, Date.now());
  const base = Math.max(0, Math.min(STAMINA_MAX, normalizeInt(current, STAMINA_MAX)));
  const baseAt = Math.max(0, normalizeInt(updatedAt, safeNow));

  if (base >= STAMINA_MAX) {
    return {
      stamina: STAMINA_MAX,
      updatedAt: safeNow,
      nextRecoveryAt: null,
    };
  }

  const elapsed = Math.max(0, safeNow - baseAt);
  const recovered = Math.floor(elapsed / STAMINA_RECOVERY_MS);
  const stamina = Math.min(STAMINA_MAX, base + recovered);
  const normalizedAt = stamina >= STAMINA_MAX
    ? safeNow
    : baseAt + recovered * STAMINA_RECOVERY_MS;

  return {
    stamina,
    updatedAt: normalizedAt,
    nextRecoveryAt: stamina >= STAMINA_MAX
      ? null
      : normalizedAt + STAMINA_RECOVERY_MS,
  };
}

function consumeForNewRun(state, firstRunStarted) {
  if (!firstRunStarted) {
    return {
      ...state,
      charged: 0,
      firstRunStarted: true,
    };
  }
  if (state.stamina < STAMINA_RUN_COST) {
    const err = new Error('体力不足');
    err.code = 'PVE_STAMINA_INSUFFICIENT';
    throw err;
  }
  return {
    ...state,
    stamina: state.stamina - STAMINA_RUN_COST,
    charged: STAMINA_RUN_COST,
    firstRunStarted: true,
  };
}

module.exports = {
  STAMINA_MAX,
  STAMINA_RUN_COST,
  STAMINA_RECOVERY_MS,
  resolveStamina,
  consumeForNewRun,
};
