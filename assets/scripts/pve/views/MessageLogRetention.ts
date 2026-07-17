/**
 * Dispose the oldest entries beyond a fixed retention limit.
 *
 * The overflow count is captured before disposal because Cocos `Node.destroy()`
 * removes a node at the end of the frame, not synchronously.
 */
export function disposeOldestOverflow<T>(
  entries: readonly T[],
  maxEntries: number,
  dispose: (entry: T) => void,
): number {
  const overflow = Math.max(0, entries.length - Math.max(0, maxEntries));
  for (let i = 0; i < overflow; i += 1) dispose(entries[i]);
  return overflow;
}
