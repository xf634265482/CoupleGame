import { disposeOldestOverflow } from '../../assets/scripts/pve/views/MessageLogRetention';

describe('disposeOldestOverflow', () => {
  it('does nothing at the retention boundary', () => {
    const entries = Array.from({ length: 120 }, (_, i) => i);
    const disposed: number[] = [];

    expect(disposeOldestOverflow(entries, 120, (entry) => disposed.push(entry))).toBe(0);
    expect(disposed).toEqual([]);
  });

  it('disposes the oldest entry when the 121st entry is appended', () => {
    const entries = Array.from({ length: 121 }, (_, i) => i);
    const disposed: number[] = [];

    expect(disposeOldestOverflow(entries, 120, (entry) => disposed.push(entry))).toBe(1);
    expect(disposed).toEqual([0]);
  });

  it('disposes a fixed snapshot of all overflow entries', () => {
    const entries = Array.from({ length: 125 }, (_, i) => i);
    const disposed: number[] = [];

    expect(disposeOldestOverflow(entries, 120, (entry) => disposed.push(entry))).toBe(5);
    expect(disposed).toEqual([0, 1, 2, 3, 4]);
  });
});
