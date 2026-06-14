const {
  LUCKY_FAST_INTERVAL_MS,
  LUCKY_SLOW_DURATION_MS,
  LUCKY_SLOW_INTERVAL_START_MS,
  LUCKY_SLOW_INTERVAL_STEP_MS,
} = require('./constants');

function fastIndexAt(lucky, atTime) {
  const n = Math.max(1, lucky.options?.length || 7);
  if (!lucky.startedAt) return 0;
  return Math.floor((atTime - lucky.startedAt) / LUCKY_FAST_INTERVAL_MS) % n;
}

function fastIndexAtSlow(lucky) {
  if (!lucky.slowAt) return 0;
  return fastIndexAt(lucky, lucky.slowAt);
}

/** 减速阶段：间隔 0.2s 起，每格 +0.1s，总时长 2s 内能走几步 */
function computeSlowFinalIndex(lucky) {
  const n = Math.max(1, lucky.options?.length || 7);
  const startIdx = fastIndexAtSlow(lucky);
  let total = 0;
  let idx = startIdx;
  let step = 0;
  while (total < LUCKY_SLOW_DURATION_MS) {
    const interval =
      LUCKY_SLOW_INTERVAL_START_MS + step * LUCKY_SLOW_INTERVAL_STEP_MS;
    if (total + interval > LUCKY_SLOW_DURATION_MS) break;
    total += interval;
    idx = (idx + 1) % n;
    step += 1;
  }
  return idx;
}

function slowIndexAt(lucky, now) {
  const n = Math.max(1, lucky.options?.length || 7);
  if (!lucky.slowAt) return 0;
  if (lucky.stopAt && now >= lucky.stopAt) {
    return lucky.finalIndex ?? fastIndexAtSlow(lucky);
  }
  let elapsed = now - lucky.slowAt;
  let idx = fastIndexAtSlow(lucky);
  let step = 0;
  while (elapsed > 0) {
    const interval =
      LUCKY_SLOW_INTERVAL_START_MS + step * LUCKY_SLOW_INTERVAL_STEP_MS;
    if (elapsed < interval) break;
    elapsed -= interval;
    idx = (idx + 1) % n;
    step += 1;
  }
  return idx;
}

function highlightIndexAt(lucky, now = Date.now()) {
  const n = Math.max(1, lucky.options?.length || 7);
  if (n <= 0) return 0;
  if (lucky.phase === 'READY') return 0;
  if (lucky.phase === 'DONE') return lucky.finalIndex ?? 0;
  if (lucky.phase === 'FAST' && lucky.startedAt) {
    return fastIndexAt(lucky, now);
  }
  if (lucky.phase === 'SLOW') {
    return slowIndexAt(lucky, now);
  }
  return 0;
}

module.exports = {
  fastIndexAt,
  fastIndexAtSlow,
  computeSlowFinalIndex,
  slowIndexAt,
  highlightIndexAt,
};
