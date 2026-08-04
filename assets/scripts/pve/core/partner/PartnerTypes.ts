export const PARTNER_IDS = [
  'MOBILITY',
  'GUARD',
  'BREAKER',
  'CONTROL',
  'ANIMA',
  'HEAL',
] as const;

export type PartnerId = (typeof PARTNER_IDS)[number];

export type PartnerEvolutionStage = 1 | 2 | 3 | 4;

export interface PlayerPartnerProgress {
  unlocked: boolean;
  level: number;
  exp: number;
  evolutionStage: PartnerEvolutionStage;
}

export type PartnersMap = Record<PartnerId, PlayerPartnerProgress>;

export interface PartnerBattleState {
  partnerId: PartnerId;
  evolutionStage: PartnerEvolutionStage;
  skillUsed: boolean;
  flags: string[];
  breakTargetId?: string | null;
  slowDomainMonsterIds?: string[];
}

/** 进化到目标阶段所需星尘：index = target stage（1 无意义）。 */
export const PARTNER_EVOLVE_STARDUST = [0, 0, 50, 200, 500] as const;

/** 进化到目标阶段所需等级：index = target stage。 */
export const PARTNER_EVOLVE_LEVEL = [0, 1, 5, 15, 30] as const;
