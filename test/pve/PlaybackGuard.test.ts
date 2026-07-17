import { settleValueWithin, settleWithin, type TimeoutHandle } from '../../assets/scripts/pve/controllers/PlaybackGuard';

describe('PlaybackGuard', () => {
  afterEach(() => jest.useRealTimers());

  test('正常完成时取消超时且不执行兜底', async () => {
    jest.useFakeTimers();
    const onTimeout = jest.fn();
    const result = settleWithin(Promise.resolve(), 400, onTimeout);

    await expect(result).resolves.toBe(true);
    expect(onTimeout).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  test('动画 Promise 不完成时按时清理并放行', async () => {
    jest.useFakeTimers();
    const onTimeout = jest.fn();
    const never = new Promise<void>(() => {});
    const result = settleWithin(never, 400, onTimeout);

    await jest.advanceTimersByTimeAsync(400);

    await expect(result).resolves.toBe(false);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  test('完成与超时竞争时只结算一次', async () => {
    let scheduled: (() => void) | undefined;
    let completeTask: (() => void) | undefined;
    const task = new Promise<void>((resolve) => { completeTask = resolve; });
    const onTimeout = jest.fn();
    const cancel = jest.fn();
    const schedule = (callback: () => void): TimeoutHandle => {
      scheduled = callback;
      return 1 as unknown as TimeoutHandle;
    };
    const result = settleWithin(task, 400, onTimeout, schedule, cancel);

    completeTask?.();
    await Promise.resolve();
    scheduled?.();

    await expect(result).resolves.toBe(true);
    expect(onTimeout).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  test('settleValueWithin returns fallback when task never resolves', async () => {
    jest.useFakeTimers();
    const onTimeout = jest.fn();
    const never = new Promise<string>(() => {});
    const result = settleValueWithin(never, 400, () => 'fallback', onTimeout);

    await jest.advanceTimersByTimeAsync(400);

    await expect(result).resolves.toEqual({ timedOut: true, value: 'fallback' });
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });
});
