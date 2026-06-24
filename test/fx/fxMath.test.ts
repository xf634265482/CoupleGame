// test/fx/fxMath.test.ts —— fx 框架纯函数层单测（不在 assets/ 内，避免被 Cocos 打进游戏包）。
import {
  magnitude,
  scaledDuration,
  lerp,
  parabola,
  dampedSine,
  clampStrength,
  resolveDuration,
} from '../../assets/scripts/fx/fxMath';

describe('fxMath.magnitude', () => {
  it('力度与全局系数相乘', () => {
    expect(magnitude(8, 1, 1)).toBe(8);
    expect(magnitude(8, 2, 1)).toBe(16);
    expect(magnitude(8, 1, 0.5)).toBe(4);
    expect(magnitude(8, 0, 1)).toBe(0);
  });
});

describe('fxMath.scaledDuration', () => {
  it('timeScale<1 时长变长（慢动作）', () => {
    expect(scaledDuration(0.3, 1)).toBeCloseTo(0.3);
    expect(scaledDuration(0.3, 0.5)).toBeCloseTo(0.6);
    expect(scaledDuration(0.3, 0.3)).toBeCloseTo(1.0);
  });
  it('timeScale<=0 回落到 1', () => {
    expect(scaledDuration(0.3, 0)).toBeCloseTo(0.3);
    expect(scaledDuration(0.3, -2)).toBeCloseTo(0.3);
  });
});

describe('fxMath.lerp', () => {
  it('端点与中点', () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(4, 8, 0.25)).toBe(5);
  });
});

describe('fxMath.parabola', () => {
  it('两端为 0，峰值在中点为 1', () => {
    expect(parabola(0)).toBe(0);
    expect(parabola(1)).toBe(0);
    expect(parabola(0.5)).toBeCloseTo(1);
  });
});

describe('fxMath.dampedSine', () => {
  it('t=1 时恰好归零（瞬态效果可干净落回基准）', () => {
    expect(dampedSine(1, 3)).toBeCloseTo(0);
  });
  it('t=0 时为 0', () => {
    expect(dampedSine(0, 3)).toBeCloseTo(0);
  });
});

describe('fxMath.clampStrength', () => {
  it('缺省/非法回落到 1，合法原样', () => {
    expect(clampStrength(undefined)).toBe(1);
    expect(clampStrength(-1)).toBe(1);
    expect(clampStrength(NaN)).toBe(1);
    expect(clampStrength(2)).toBe(2);
    expect(clampStrength(0)).toBe(0);
  });
});

describe('fxMath.resolveDuration', () => {
  it('缺省/非正回落到 fallback，合法原样', () => {
    expect(resolveDuration(undefined, 0.3)).toBe(0.3);
    expect(resolveDuration(0, 0.3)).toBe(0.3);
    expect(resolveDuration(-1, 0.3)).toBe(0.3);
    expect(resolveDuration(0.5, 0.3)).toBe(0.5);
  });
});
