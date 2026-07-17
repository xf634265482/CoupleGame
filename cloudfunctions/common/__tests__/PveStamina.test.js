const {
  STAMINA_MAX,
  STAMINA_CHALLENGE_COST,
  STAMINA_RECOVERY_MS,
  resolveStamina,
  consumeForFloorChallenge,
} = require('../pve/PveStamina');

describe('PVE 体力', () => {
  test('每 5 分钟恢复 1 点且不超过 60', () => {
    const now = 1_000_000;
    expect(resolveStamina(10, now, now + STAMINA_RECOVERY_MS * 3 + 999).stamina).toBe(13);
    expect(resolveStamina(59, now, now + STAMINA_RECOVERY_MS * 3).stamina).toBe(STAMINA_MAX);
  });

  test('保留不足 5 分钟的恢复进度', () => {
    const now = 1_000_000;
    const result = resolveStamina(10, now, now + STAMINA_RECOVERY_MS + 60_000);
    expect(result.stamina).toBe(11);
    expect(result.updatedAt).toBe(now + STAMINA_RECOVERY_MS);
    expect(result.nextRecoveryAt).toBe(now + STAMINA_RECOVERY_MS * 2);
  });

  test('charges five for every paid floor challenge', () => {
    const result = consumeForFloorChallenge({
      stamina: 12,
      updatedAt: 100,
      nextRecoveryAt: 100 + STAMINA_RECOVERY_MS,
      tutorialFreeChallengeConsumed: true,
    }, false);
    expect(result).toMatchObject({
      stamina: 7,
      charged: STAMINA_CHALLENGE_COST,
      tutorialFreeChallengeConsumed: true,
    });
  });

  test('consumes the tutorial-free marker without charging', () => {
    const result = consumeForFloorChallenge({
      stamina: STAMINA_MAX,
      updatedAt: 100,
      nextRecoveryAt: null,
      tutorialFreeChallengeConsumed: false,
    }, true);
    expect(result).toMatchObject({
      stamina: STAMINA_MAX,
      charged: 0,
      tutorialFreeChallengeConsumed: true,
    });
  });

  test('rejects a paid challenge below five stamina', () => {
    expect(() => consumeForFloorChallenge({
      stamina: 4,
      updatedAt: 100,
      nextRecoveryAt: 200,
      tutorialFreeChallengeConsumed: true,
    }, false)).toThrow('体力不足');
  });
});
