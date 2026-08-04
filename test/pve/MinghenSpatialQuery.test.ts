import {
  countAdjacentEntities,
  countEntitiesInChebyshevRange,
  isAdjacentToAny,
} from '../../assets/scripts/pve/core/minghen/MinghenSpatialQuery';

describe('MinghenSpatialQuery', () => {
  test('counts orthogonal and diagonal neighbors once', () => {
    const origin = { x: 2, y: 2 };
    const foes = [{ x: 2, y: 3 }, { x: 3, y: 3 }, { x: 5, y: 5 }];
    expect(countAdjacentEntities(origin, foes)).toBe(2);
    expect(countEntitiesInChebyshevRange(origin, foes, 2)).toBe(2);
    expect(isAdjacentToAny(origin, [{ x: 1, y: 2 }])).toBe(true);
  });
});
