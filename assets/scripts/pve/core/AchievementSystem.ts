// 成就系统（AC-20）：8 个成就的定义与解锁条件检测，图鉴条目提取。
// 纯函数，依赖事件序列 + 当前层号，零框架依赖。
// 成就/图鉴在远征间持久化（局外保留），由 Controller 触发、云端存储（design §2.1）。

import type { PveEvent } from './PveTypes';

// ── 成就 ID ───────────────────────────────────────────────

export type AchievementId =
  | 'FIRST_EXPEDITION'     // 首次开始远征
  | 'FIRST_KILL'           // 首次击杀怪物
  | 'FIRST_CHEST'          // 首次开启宝箱
  | 'FIRST_EQUIPMENT'      // 首次获得装备
  | 'CLASS_ADVANCED'       // 首次完成职业进阶
  | 'CHAPTER_1_CLEARED'    // 通过第一章（第5层通关）
  | 'REACH_FLOOR_10'       // 到达第10层
  | 'FULL_CLEAR';          // 通关全部25层

export interface AchievementDef {
  id: AchievementId;
  name: string;
  desc: string;
}

/** 全部成就定义（顺序决定展示顺序）。 */
export const ACHIEVEMENT_DEFS: readonly AchievementDef[] = [
  { id: 'FIRST_EXPEDITION',  name: '踏上命运之旅', desc: '首次开始命运远征' },
  { id: 'FIRST_KILL',        name: '初战告捷',     desc: '首次击杀怪物' },
  { id: 'FIRST_CHEST',       name: '寻宝者',       desc: '首次开启宝箱' },
  { id: 'FIRST_EQUIPMENT',   name: '初露锋芒',     desc: '首次获得装备' },
  { id: 'CLASS_ADVANCED',    name: '职业觉醒',     desc: '首次完成职业进阶' },
  { id: 'CHAPTER_1_CLEARED', name: '第一章英雄',   desc: '通过第一章（击败哥布林酋长）' },
  { id: 'REACH_FLOOR_10',    name: '深入探索',     desc: '到达第10层' },
  { id: 'FULL_CLEAR',        name: '命运征服者',   desc: '通关全部25层' },
] as const;

// ── 成就解锁检测 ──────────────────────────────────────────

/**
 * 扫描本轮产生的事件序列，返回应在本轮解锁的新成就列表（已解锁的过滤掉）。
 * 纯函数，AC-13 确定性安全。
 *
 * @param events   本次 apply / _playEvents 产生的事件
 * @param floor    当前远征层号（1-based）
 * @param unlocked 已解锁的成就 id 集合（用于去重）
 */
export function checkNewAchievements(
  events: PveEvent[],
  floor: number,
  unlocked: readonly string[],
): AchievementId[] {
  const alreadySet = new Set(unlocked);
  const toUnlock = new Set<AchievementId>();

  for (const ev of events) {
    switch (ev.type) {
      case 'AP_ROLLED':
        // 首次开始远征：第1层第1回合
        if (floor === 1 && ev.turn === 1) toUnlock.add('FIRST_EXPEDITION');
        // 到达第10层：楼层开始掷骰时触发
        if (floor >= 10) toUnlock.add('REACH_FLOOR_10');
        break;
      case 'KILL':
        toUnlock.add('FIRST_KILL');
        break;
      case 'OPEN_CHEST':
        toUnlock.add('FIRST_CHEST');
        break;
      case 'LOOT':
        if (ev.equip) toUnlock.add('FIRST_EQUIPMENT');
        break;
      case 'CLASS_ADVANCED':
        toUnlock.add('CLASS_ADVANCED');
        break;
      case 'FLOOR_CLEARED':
        if (ev.floor === 5)  toUnlock.add('CHAPTER_1_CLEARED');
        if (ev.floor === 25) toUnlock.add('FULL_CLEAR');
        break;
    }
  }

  // 只返回本次尚未解锁的成就
  return [...toUnlock].filter((id) => !alreadySet.has(id));
}

// ── 图鉴条目提取 ──────────────────────────────────────────

/**
 * 从事件序列中提取图鉴新条目。
 * - monsters：本次击杀的怪物类型（MonsterType）
 * - equipment：本次获得装备的槽位（EquipSlot）
 *
 * 返回原始列表（可能含重复）；调用方负责与已有条目合并去重。
 */
export function collectCodexEntries(
  events: PveEvent[],
): { monsters: string[]; equipment: string[] } {
  const monsters: string[] = [];
  const equipment: string[] = [];

  for (const ev of events) {
    if (ev.type === 'KILL') {
      monsters.push(ev.monsterType);
    }
    if (ev.type === 'LOOT' && ev.equip) {
      equipment.push(ev.equip.slot);
    }
  }

  return { monsters, equipment };
}

// ── 快捷工具 ──────────────────────────────────────────────

/** 按 id 查找成就定义；找不到返回 undefined。 */
export function findAchievement(id: string): AchievementDef | undefined {
  return ACHIEVEMENT_DEFS.find((d) => d.id === id);
}
