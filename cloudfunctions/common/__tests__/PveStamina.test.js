const {
  STAMINA_MAX,
  STAMINA_RUN_COST,
  STAMINA_RECOVERY_MS,
  resolveStamina,
  consumeForNewRun,
} = require('../pve/PveStamina');

describe('PVE 体力', () => {
  it('每 5 分钟恢复 1 点且不超过 60', () => {
    const now = 1_000_000;
    expect(resolveStamina(10, now, now + STAMINA_RECOVERY_MS * 3 + 999).stamina).toBe(13);
    expect(resolveStamina(59, now, now + STAMINA_RECOVERY_MS * 3).stamina).toBe(STAMINA_MAX);
  });

  it('保留不足 5 分钟的恢复进度', () => {
    const now = 1_000_000;
    const result = resolveStamina(10, now, now + STAMINA_RECOVERY_MS + 60_000);
    expect(result.stamina).toBe(11);
    expect(result.updatedAt).toBe(now + STAMINA_RECOVERY_MS);
    expect(result.nextRecoveryAt).toBe(now + STAMINA_RECOVERY_MS * 2);
  });

  it('首次新远征免费，之后消耗 20 点', () => {
    const state = resolveStamina(60, 0, 1_000_000);
    const first = consumeForNewRun(state, false);
    expect(first.stamina).toBe(60);
    expect(first.charged).toBe(0);

    const next = consumeForNewRun(first, true);
    expect(next.stamina).toBe(60 - STAMINA_RUN_COST);
    expect(next.charged).toBe(STAMINA_RUN_COST);
  });

  it('体力不足时拒绝开启新远征', () => {
    expect(() => consumeForNewRun({ stamina: 19 }, true)).toThrow('体力不足');
    try {
      consumeForNewRun({ stamina: 19 }, true);
    } catch (err) {
      expect(err.code).toBe('PVE_STAMINA_INSUFFICIENT');
    }
  });
});
