import type { MinghenCollectionEntry, MinghenLevel } from '../PveProgressionTypes';
import { getMinghenDefinition } from './MinghenCatalog';

export function minghenLevelAfterGrant(entry?: MinghenCollectionEntry): MinghenLevel {
  if (!entry) return 1;
  if (entry.level === 3 || entry.trialCompleted) return 3;
  const copiesAfterGrant = entry.copies + 1;
  return copiesAfterGrant >= 2 ? 2 : entry.level;
}

export function formatMinghenChoice(id: string, entry?: MinghenCollectionEntry): string {
  const definition = getMinghenDefinition(id);
  const level = minghenLevelAfterGrant(entry);
  return `${definition.name} · ${romanLevel(level)}\n${getMinghenEffectText(id, level)}`;
}

export function formatMinghenDetail(id: string, level: MinghenLevel): string {
  const definition = getMinghenDefinition(id);
  return `${definition.name} · ${romanLevel(level)}\n${getMinghenEffectText(id, level)}`;
}

export function formatMinghenFullDetail(id: string, level: MinghenLevel): string {
  const definition = getMinghenDefinition(id);
  return `${formatMinghenDetail(id, level)}\n升格试炼：${definition.trial}`;
}

/** 营地详情只展示玩家可见信息，不泄露命痕内部编号。 */
export function formatMinghenCampDetail(id: string, level: MinghenLevel): string {
  const definition = getMinghenDefinition(id);
  return `${definition.name}\nLV.${level}\n${getMinghenEffectText(id, level)}\n试炼：${definition.trial}`;
}

export function getMinghenEffectText(id: string, level: MinghenLevel): string {
  const effects = getMinghenDefinition(id).effects;
  if (level === 1) return effects[1];
  if (level === 2) return expandInheritedEffect(effects[1], effects[2], '继承I级；');
  const level2 = expandInheritedEffect(effects[1], effects[2], '继承I级；');
  return expandInheritedEffect(level2, effects[3], '继承II级；');
}

function expandInheritedEffect(previous: string, current: string, prefix: string): string {
  if (!current.startsWith(prefix)) return current;
  const normalizedPrevious = previous.replace(/[。；]+$/u, '');
  return `${normalizedPrevious}；${current.slice(prefix.length)}`;
}

function romanLevel(level: MinghenLevel): string {
  return level === 1 ? 'I级' : level === 2 ? 'II级' : 'III级';
}
