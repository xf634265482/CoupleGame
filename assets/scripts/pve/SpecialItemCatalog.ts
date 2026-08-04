import { BOSS_SPOILS, type BossId } from './core/bosses/BossSpoils';
import type { EquipItem } from './core/PveTypes';

export type SpecialIconEntry = {
  chapter: number;
  fileName: string;
};

export type SpecialIconBundle =
  | 'equipment_tier1'
  | 'chapter_2'
  | 'chapter_3'
  | 'chapter_4'
  | 'chapter_5';

type BossIconSpec = {
  bossId: BossId;
  chapter: number;
  trait: string;
  fileName: string;
};

const BOSS_ICON_SPECS: readonly BossIconSpec[] = [
  { bossId: 'GOBLIN_CHIEF', chapter: 1, trait: 'on_hit_lifesteal_1', fileName: 'boss_goblin_chief_war_axe.jpg' },
  { bossId: 'GOBLIN_CHIEF', chapter: 1, trait: 'boss_summon_warrior', fileName: 'boss_goblin_war_horn.jpg' },
  { bossId: 'GOBLIN_CHIEF', chapter: 1, trait: 'boss_stun_on_hurt', fileName: 'boss_broken_king_crown.jpg' },
  { bossId: 'QUICKSAND_SCORPION', chapter: 2, trait: 'boss_bleed_on_hit', fileName: 'boss_scorpion_tail_stinger.jpg' },
  { bossId: 'QUICKSAND_SCORPION', chapter: 2, trait: 'boss_sand_immune', fileName: 'boss_quicksand_greaves.jpg' },
  { bossId: 'QUICKSAND_SCORPION', chapter: 2, trait: 'boss_phys_reduce_15', fileName: 'boss_carapace_talisman.jpg' },
  { bossId: 'FROST_GIANT', chapter: 3, trait: 'boss_slow_on_hit', fileName: 'boss_frost_giant_greatsword.jpg' },
  { bossId: 'FROST_GIANT', chapter: 3, trait: 'boss_ice_reduce_20', fileName: 'boss_frostplate_war_helm.jpg' },
  { bossId: 'FROST_GIANT', chapter: 3, trait: 'boss_active_ice', fileName: 'boss_everfrost_ring.jpg' },
  { bossId: 'LAVA_LORD', chapter: 4, trait: 'boss_burn_on_hit', fileName: 'boss_lava_warhammer.jpg' },
  { bossId: 'LAVA_LORD', chapter: 4, trait: 'boss_burn_immune', fileName: 'boss_emberheart_breastplate.jpg' },
  { bossId: 'LAVA_LORD', chapter: 4, trait: 'boss_kill_heal_8', fileName: 'boss_blazering.jpg' },
] as const;

const BOSS_ICON_BY_NAME = new Map<string, SpecialIconEntry>(
  BOSS_ICON_SPECS.map((spec) => {
    const template = BOSS_SPOILS[spec.bossId].find((entry) => entry.trait === spec.trait);
    if (!template) {
      throw new Error(`missing boss spoil template: ${spec.bossId}/${spec.trait}`);
    }
    return [template.name, { chapter: spec.chapter, fileName: spec.fileName }];
  }),
);
const BOSS_ICON_BY_TRAIT = new Map<string, SpecialIconEntry>(
  BOSS_ICON_SPECS.map((spec) => [spec.trait, { chapter: spec.chapter, fileName: spec.fileName }]),
);

export function getBossSpoilIconEntryByName(name: string | null | undefined): SpecialIconEntry | null {
  if (!name) return null;
  return BOSS_ICON_BY_NAME.get(name) ?? null;
}

export function getBossSpoilIconEntry(item: EquipItem | null | undefined): SpecialIconEntry | null {
  if (!item) return null;
  return getBossSpoilIconEntryByName(item.name) ?? (item.trait ? BOSS_ICON_BY_TRAIT.get(item.trait) ?? null : null);
}

export function getSpecialIconChaptersForChapter(chapter: number): number[] {
  if (chapter <= 1) return [1];
  const chapters: number[] = [1];
  for (let current = 2; current <= chapter && current <= 5; current += 1) {
    chapters.push(current);
  }
  return chapters;
}

export function getSpecialIconBundle(entry: SpecialIconEntry | null | undefined): SpecialIconBundle | null {
  if (!entry) return null;
  if (entry.chapter <= 1) return 'equipment_tier1';
  if (entry.chapter >= 2 && entry.chapter <= 5) return `chapter_${entry.chapter}` as SpecialIconBundle;
  return null;
}
