// PVE 核心确定性随机数（seeded PRNG）。
// 约束：pve/core 禁止直接 Math.random()，所有随机走本模块，保证同种子可复现、云端可复算。
// 算法：mulberry32（32 位、足够快、分布良好，适合游戏逻辑而非密码学）。

export type Rng = {
  /** 返回 [0, 1) 浮点。 */
  next(): number;
  /** 返回 [min, max] 闭区间整数。 */
  int(min: number, max: number): number;
  /** 概率命中：p 为 [0,1]，返回是否命中。 */
  chance(p: number): boolean;
  /** 从数组等概率取一个元素。 */
  pick<T>(arr: readonly T[]): T;
  /** Fisher-Yates 洗牌，返回新数组，不修改入参。 */
  shuffle<T>(arr: readonly T[]): T[];
  /** 当前内部状态（用于存档续算）。 */
  state(): number;
};

/** 将任意字符串/数字哈希为 32 位无符号种子。 */
export function hashSeed(input: string | number): number {
  const str = String(input);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 用一个 32 位整数种子创建 RNG。可传入上次存档的 state 续算。 */
export function createRng(seed: number): Rng {
  let s = seed >>> 0;

  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (min: number, max: number): number => {
    if (max < min) {
      const tmp = min;
      min = max;
      max = tmp;
    }
    return min + Math.floor(next() * (max - min + 1));
  };

  const chance = (p: number): boolean => next() < p;

  const pick = <T>(arr: readonly T[]): T => {
    if (arr.length === 0) {
      throw new Error('rng.pick: empty array');
    }
    return arr[int(0, arr.length - 1)]!;
  };

  const shuffle = <T>(arr: readonly T[]): T[] => {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = int(0, i);
      const tmp = out[i]!;
      out[i] = out[j]!;
      out[j] = tmp;
    }
    return out;
  };

  return { next, int, chance, pick, shuffle, state: () => s >>> 0 };
}
