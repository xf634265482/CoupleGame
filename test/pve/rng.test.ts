import { createRng, hashSeed } from '../../assets/scripts/pve/core/rng';

describe('rng — 确定性随机（AC-13 基础）', () => {
  it('同种子产生完全一致的序列', () => {
    const a = createRng(12345);
    const b = createRng(12345);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('不同种子序列不同', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(a.next()).not.toEqual(b.next());
  });

  it('next() 落在 [0,1)', () => {
    const r = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int(min,max) 闭区间且覆盖端点', () => {
    const r = createRng(99);
    let sawMin = false;
    let sawMax = false;
    for (let i = 0; i < 2000; i++) {
      const v = r.int(1, 6);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      expect(Number.isInteger(v)).toBe(true);
      if (v === 1) sawMin = true;
      if (v === 6) sawMax = true;
    }
    expect(sawMin && sawMax).toBe(true);
  });

  it('chance(p) 频率接近 p', () => {
    const r = createRng(2024);
    let hits = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) if (r.chance(0.3)) hits++;
    expect(hits / n).toBeGreaterThan(0.27);
    expect(hits / n).toBeLessThan(0.33);
  });

  it('shuffle 不修改入参且为排列', () => {
    const r = createRng(555);
    const src = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = r.shuffle(src);
    expect(src).toEqual([1, 2, 3, 4, 5, 6, 7, 8]); // 原数组不变
    expect(out.slice().sort((x, y) => x - y)).toEqual(src); // 同元素集合
  });

  it('pick 从空数组抛错', () => {
    const r = createRng(1);
    expect(() => r.pick([])).toThrow();
  });

  it('state() 可用于续算：续算序列与不间断序列一致', () => {
    const a = createRng(42);
    a.next();
    a.next();
    const resumed = createRng(a.state());
    const cont = createRng(42);
    cont.next();
    cont.next();
    expect(resumed.next()).toEqual(cont.next());
  });

  it('hashSeed 稳定且无符号', () => {
    expect(hashSeed('floor-1')).toEqual(hashSeed('floor-1'));
    expect(hashSeed('floor-1')).not.toEqual(hashSeed('floor-2'));
    expect(hashSeed('x')).toBeGreaterThanOrEqual(0);
  });
});
