export type TimeoutHandle = ReturnType<typeof setTimeout>;

/**
 * 等待表现层任务，但绝不允许动画回调永久阻塞输入链。
 * 返回 true 表示任务正常结束，false 表示由超时兜底放行。
 */
export function settleWithin(
  task: Promise<void>,
  timeoutMs: number,
  onTimeout: () => void,
  schedule: (callback: () => void, delayMs: number) => TimeoutHandle = setTimeout,
  cancel: (handle: TimeoutHandle) => void = clearTimeout,
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (completed: boolean) => {
      if (settled) return;
      settled = true;
      cancel(timer);
      resolve(completed);
    };
    const timer = schedule(() => {
      if (settled) return;
      try {
        onTimeout();
      } finally {
        finish(false);
      }
    }, timeoutMs);
    task.then(() => finish(true), () => finish(true));
  });
}

export function settleValueWithin<T>(
  task: Promise<T>,
  timeoutMs: number,
  fallback: () => T,
  onTimeout: () => void,
  schedule: (callback: () => void, delayMs: number) => TimeoutHandle = setTimeout,
  cancel: (handle: TimeoutHandle) => void = clearTimeout,
): Promise<{ timedOut: boolean; value: T }> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (timedOut: boolean, value: T) => {
      if (settled) return;
      settled = true;
      cancel(timer);
      resolve({ timedOut, value });
    };
    const timer = schedule(() => {
      if (settled) return;
      try { onTimeout(); } finally { finish(true, fallback()); }
    }, timeoutMs);
    task.then(
      (value) => finish(false, value),
      () => finish(true, fallback()),
    );
  });
}
