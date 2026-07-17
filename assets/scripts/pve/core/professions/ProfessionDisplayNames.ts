import type { PveProfessionId } from '../PveProgressionTypes';

/** 永久逐层职业：玩家可见中文名（内部 ID 不变）。 */
export const PROFESSION_DISPLAY_NAMES: Record<PveProfessionId, string> = {
  WARRIOR: '战士',
  ARCHER: '游侠',
  RANGER: '潜行者',
};

/**
 * 远征内 classId → 可见名。
 * 永久逐层：BERSERKER/ARCHER/ROGUE 分别对应战士/游侠/潜行者。
 */
export const CLASS_DISPLAY_NAMES: Record<string, string> = {
  /** @deprecated 永久逐层已退役；残留存档若仍出现则按战士面板结算 */
  ADVENTURER: '战士',
  BERSERKER: '战士',
  ARCHER: '游侠',
  ROGUE: '潜行者',
};
