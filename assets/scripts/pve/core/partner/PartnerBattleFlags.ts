/** 伙伴战斗临时标记（禁止每帧扫盘；仅在事件点读写）。 */
export const PARTNER_FLAG = {
  MOVE_COST_REDUCE_ONCE: 'PARTNER_MOVE_COST_REDUCE_ONCE',
  GUARD_DISPLACE_REDUCE: 'PARTNER_GUARD_DISPLACE_REDUCE',
  GUARD_SHIELD_WATCH: 'PARTNER_GUARD_SHIELD_WATCH',
  ANIMA_ECHO: 'PARTNER_ANIMA_ECHO',
  ANIMA_FULL_BURST_SHIELD: 'PARTNER_ANIMA_FULL_BURST_SHIELD',
  CONTROL_EXTRA_DISPLACE: 'PARTNER_CONTROL_EXTRA_DISPLACE',
} as const;

export function hasPartnerFlag(flags: readonly string[], flag: string): boolean {
  return flags.includes(flag);
}

export function addPartnerFlag(flags: readonly string[], flag: string): string[] {
  return flags.includes(flag) ? [...flags] : [...flags, flag];
}

export function removePartnerFlag(flags: readonly string[], flag: string): string[] {
  return flags.filter((f) => f !== flag);
}

export function breakMarkFlag(monsterId: string): string {
  return `PARTNER_BREAK_MARK:${monsterId}`;
}

export function breakWoundFlag(monsterId: string): string {
  return `PARTNER_BREAK_WOUND:${monsterId}`;
}

export function slowDomainFlag(monsterId: string): string {
  return `PARTNER_SLOW_DOMAIN:${monsterId}`;
}
