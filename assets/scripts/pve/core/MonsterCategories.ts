import { VARIANT_GOBLIN_SENTINEL } from './Chapter1Monsters';
import { VARIANT_DUNE_SENTINEL } from './Chapter2Monsters';
import { VARIANT_GLACIER_SHAPER } from './Chapter3Monsters';
import { VARIANT_FIRE_ELEMENTAL } from './Chapter4Monsters';
import { VARIANT_FATE_WATCHER } from './Chapter5Monsters';
import type { Monster } from './PveTypes';

const SPECIAL_MONSTER_VARIANTS = new Set<string>([
  VARIANT_GOBLIN_SENTINEL,
  VARIANT_DUNE_SENTINEL,
  VARIANT_GLACIER_SHAPER,
  VARIANT_FIRE_ELEMENTAL,
  VARIANT_FATE_WATCHER,
]);

export function isSpecialMonster(monster: Monster): boolean {
  return SPECIAL_MONSTER_VARIANTS.has(monster.variantId ?? '');
}
