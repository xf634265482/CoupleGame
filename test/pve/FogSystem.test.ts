import { createFogGrid, revealAround, reveal, isRevealed } from '../../assets/scripts/pve/core/FogSystem';

describe('FogSystem — 战争迷雾（AC-1）', () => {
  it('createFogGrid 创建全 false 的 size×size 矩阵', () => {
    const grid = createFogGrid(8);
    expect(grid.length).toBe(8);
    grid.forEach((row) => {
      expect(row.length).toBe(8);
      expect(row.every((c) => c === false)).toBe(true);
    });
  });

  it('revealAround 中心点半径 1 揭示曼哈顿菱形（5 格）', () => {
    const grid = createFogGrid(8);
    const cells = revealAround(grid, { x: 4, y: 4 }, 1);
    // 中心 + 上下左右 = 5
    expect(cells.length).toBe(5);
    expect(isRevealed(grid, { x: 4, y: 4 })).toBe(true);
    expect(isRevealed(grid, { x: 3, y: 4 })).toBe(true);
    expect(isRevealed(grid, { x: 5, y: 4 })).toBe(true);
    expect(isRevealed(grid, { x: 4, y: 3 })).toBe(true);
    expect(isRevealed(grid, { x: 4, y: 5 })).toBe(true);
    // 对角线距离 2，半径 1 不应揭示
    expect(isRevealed(grid, { x: 3, y: 3 })).toBe(false);
  });

  it('边角处越界裁剪，不抛错', () => {
    const grid = createFogGrid(8);
    const cells = revealAround(grid, { x: 0, y: 0 }, 1);
    // 仅 (0,0)、(1,0)、(0,1) 在界内
    expect(cells.length).toBe(3);
    expect(isRevealed(grid, { x: 0, y: 0 })).toBe(true);
    expect(isRevealed(grid, { x: 1, y: 0 })).toBe(true);
    expect(isRevealed(grid, { x: 0, y: 1 })).toBe(true);
  });

  it('幂等：重复揭示同一中心不会重复返回已揭示格子', () => {
    const grid = createFogGrid(8);
    revealAround(grid, { x: 4, y: 4 }, 2);
    const second = revealAround(grid, { x: 4, y: 4 }, 1);
    expect(second.length).toBe(0);
  });

  it('半径 2 揭示 13 格菱形', () => {
    const grid = createFogGrid(8);
    const cells = revealAround(grid, { x: 4, y: 4 }, 2);
    expect(cells.length).toBe(13);
  });

  it('reveal 不修改入参矩阵，返回新矩阵', () => {
    const original = createFogGrid(8);
    const { revealed, cells } = reveal(original, { x: 2, y: 2 }, 1);
    expect(cells.length).toBe(5);
    // 原矩阵未被修改
    expect(original.every((row) => row.every((c) => c === false))).toBe(true);
    // 新矩阵已揭示
    expect(isRevealed(revealed, { x: 2, y: 2 })).toBe(true);
  });

  it('isRevealed 越界返回 false', () => {
    const grid = createFogGrid(8);
    expect(isRevealed(grid, { x: -1, y: 0 })).toBe(false);
    expect(isRevealed(grid, { x: 8, y: 8 })).toBe(false);
  });
});
