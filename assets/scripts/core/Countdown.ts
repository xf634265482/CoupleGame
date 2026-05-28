/**
 * 全项目读秒统一为整秒（30 → 29 → … → 0），使用 ceil 含当前秒。
 */
export function countdownSecRemaining(deadlineMs: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((deadlineMs - now) / 1000));
}
