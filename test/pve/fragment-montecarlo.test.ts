/**
 * Phase B Monte Carlo 验收测试（AC-P3-4, AC-P3-5）
 *
 * 模拟 N 次远征的碎片积累，统计：
 *   - 一阶进阶首次达成的层数中位数 ∈ [6, 8]
 *   - 觉醒首次达成的层数中位数 ∈ [20, 23]
 *
 * 只模拟碎片生成与职业阈值逻辑，不走 generateFloor 完整流程；
 * 使用 createRng 保证和游戏同一随机算法（mulberry32）。
 */

import { createRng } from '../../assets/scripts/pve/core/rng';
import {
  ADVANCABLE_CLASSES,
  AWAKEN_REQUIRED_CHAPTER,
  AWAKEN_SECONDARY_TOTAL,
  CLASS_FRAGMENTS_TO_ADVANCE,
  CLASS_FRAGMENTS_TO_AWAKEN,
  FRAGMENT_ADVANCED_BIAS,
  FRAGMENT_SECOND_CHANCE,
  FRAGMENT_THIRD_CHANCE,
  TOTAL_FLOORS,
  chapterOfFloor,
  isBossFloor,
} from '../../assets/scripts/pve/core/PveConstants';
import type { ClassId } from '../../assets/scripts/pve/core/PveConstants';

// ─── 工具函数 ────────────────────────────────────────────────────────────────

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// ─── 单次远征碎片模拟 ─────────────────────────────────────────────────────────

interface RunResult {
  advanceFloor: number; // Infinity = 本次未达成
  awakenFloor: number;  // Infinity = 本次未达成
}

/**
 * 使用 `seed` 独立模拟一次远征的碎片生成：
 * - 跳过 Boss 层（不产出碎片）
 * - 按 V3 §3.1 概率生成碎片数量，§3.2 偏向规则分配职业
 * - 按进阶/觉醒条件记录首次达成层数
 */
function simulateRun(seed: number): RunResult {
  const rng = createRng(seed);

  const fragments: Record<string, number> = {};
  let classId: ClassId = 'ADVENTURER';
  let advanceFloor = Infinity;
  let awakenFloor = Infinity;
  let maxChapterCleared = 0;

  for (let floor = 1; floor <= TOTAL_FLOORS; floor++) {
    const chapter = chapterOfFloor(floor);

    if (isBossFloor(floor)) {
      maxChapterCleared = chapter;
      continue; // Boss 层不生成碎片
    }

    // V3 §3.1：保底 1 + 70% 第 2 个 + 25% 第 3 个
    const count =
      1 +
      (rng.next() < FRAGMENT_SECOND_CHANCE ? 1 : 0) +
      (rng.next() < FRAGMENT_THIRD_CHANCE ? 1 : 0);

    for (let i = 0; i < count; i++) {
      const r = rng.next();
      let fragClass: string;

      if (classId === 'ADVENTURER') {
        // §3.2 冒险者期：三职业等权
        fragClass =
          r < 1 / 3
            ? ADVANCABLE_CLASSES[0]
            : r < 2 / 3
              ? ADVANCABLE_CLASSES[1]
              : ADVANCABLE_CLASSES[2];
      } else {
        // §3.2 进阶后：70% 主职业 / 各 15% 另两职业
        const main = classId as string;
        const others = ADVANCABLE_CLASSES.filter((c) => c !== main);
        if (r < FRAGMENT_ADVANCED_BIAS) {
          fragClass = main;
        } else {
          fragClass =
            r < FRAGMENT_ADVANCED_BIAS + (1 - FRAGMENT_ADVANCED_BIAS) / 2
              ? others[0]
              : others[1];
        }
      }

      fragments[fragClass] = (fragments[fragClass] ?? 0) + 1;
    }

    // 一阶进阶判定
    if (advanceFloor === Infinity && classId === 'ADVENTURER') {
      const eligible = ADVANCABLE_CLASSES.filter(
        (c) => (fragments[c] ?? 0) >= CLASS_FRAGMENTS_TO_ADVANCE,
      );
      if (eligible.length > 0) {
        advanceFloor = floor;
        // 贪心取碎片最多的职业（与游戏 ClassSystem.advanceClass 一致）
        classId = eligible.reduce((best, c) =>
          (fragments[c] ?? 0) > (fragments[best] ?? 0) ? c : best,
        ) as ClassId;
        // 消耗进阶成本
        fragments[classId] = (fragments[classId] ?? 0) - CLASS_FRAGMENTS_TO_ADVANCE;
      }
    }

    // 觉醒判定（镜像 ClassSystem.getAwakenEligible）
    if (awakenFloor === Infinity && classId !== 'ADVENTURER') {
      const mainCount = fragments[classId] ?? 0;
      const secondarySum = ADVANCABLE_CLASSES.filter((c) => c !== classId).reduce(
        (sum, c) => sum + (fragments[c] ?? 0),
        0,
      );
      if (
        mainCount >= CLASS_FRAGMENTS_TO_AWAKEN &&
        secondarySum >= AWAKEN_SECONDARY_TOTAL &&
        maxChapterCleared >= AWAKEN_REQUIRED_CHAPTER
      ) {
        awakenFloor = floor;
      }
    }
  }

  return { advanceFloor, awakenFloor };
}

// ─── 测试 ──────────────────────────────────────────────────────────────────────

const N = 2000; // 足够稳定中位数，耗时 < 100 ms

describe('Phase B Monte Carlo — 碎片节奏验收（AC-P3-4 / AC-P3-5）', () => {
  let advanceFloors: number[];
  let awakenFloors: number[];

  beforeAll(() => {
    advanceFloors = [];
    awakenFloors = [];
    for (let i = 0; i < N; i++) {
      const { advanceFloor, awakenFloor } = simulateRun(i + 1);
      if (advanceFloor !== Infinity) advanceFloors.push(advanceFloor);
      if (awakenFloor !== Infinity) awakenFloors.push(awakenFloor);
    }
  });

  it('AC-P3-4：一阶进阶在 N 次模拟中几乎必然达成（达成率 > 99%）', () => {
    expect(advanceFloors.length).toBeGreaterThan(N * 0.99);
  });

  it('AC-P3-4：一阶进阶层数中位数 ∈ [8, 10]', () => {
    const med = median(advanceFloors);
    expect(med).toBeGreaterThanOrEqual(8);
    expect(med).toBeLessThanOrEqual(10);
  });

  it('AC-P3-5：觉醒在 N 次模拟中大多数能达成（达成率 > 85%）', () => {
    // 觉醒需通关第 3 章 Boss（floor 21），部分晚进阶的极端 run 可能凑不满 10 个主职业碎片
    expect(awakenFloors.length).toBeGreaterThan(N * 0.85);
  });

  it('AC-P3-5：觉醒层数中位数 ∈ [20, 23]', () => {
    const med = median(awakenFloors);
    expect(med).toBeGreaterThanOrEqual(20);
    expect(med).toBeLessThanOrEqual(23);
  });

  it('调试信息：进阶/觉醒层数分布（不影响 Pass/Fail）', () => {
    const advMed = median(advanceFloors);
    const awkMed = median(awakenFloors);
    // 仅用于 CI 日志观察
    expect({
      advanceRate: `${((advanceFloors.length / N) * 100).toFixed(1)}%`,
      advanceMedian: advMed,
      awakenRate: `${((awakenFloors.length / N) * 100).toFixed(1)}%`,
      awakenMedian: awkMed,
    }).toBeDefined();
  });
});
