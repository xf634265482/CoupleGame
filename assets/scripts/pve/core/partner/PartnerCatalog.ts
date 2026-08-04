import type { PartnerEvolutionStage, PartnerId } from './PartnerTypes';

export interface PartnerStageSkillConfig {
  /** 位移/控场范围（格）。 */
  range?: number;
  shieldMaxHpRatio?: number;
  healMaxHpRatio?: number;
  lowHpBonusHealRatio?: number;
  overhealToShieldRatio?: number;
  overhealShieldCapRatio?: number;
  armorPenetration?: number;
  movePenalty?: number;
  spiritGainRatio?: number;
  /** 觉醒危险落点护盾。 */
  dangerousLandingShieldRatio?: number;
  /** 破阵：命中后目标下击伤害减免。 */
  targetNextHitDamageTakenMul?: number;
  /** 破阵觉醒：破绽额外破甲。 */
  woundExtraArmorPen?: number;
  /** 控场觉醒：移速压 0 时普精/Boss 下击减伤。 */
  zeroMoveHitReduceNormal?: number;
  zeroMoveHitReduceBoss?: number;
  /** 进化：跃迁后下次移动 AP-1。 */
  nextMoveCostReduce?: number;
  /** 守护进化：强制位移减免。 */
  forcedDisplaceReduce?: number;
  /** 守护觉醒：护盾留到下回合 → 临时 AP。 */
  shieldRetainTempAp?: number;
  /** 灵气进化：爆发后临时 AP。 */
  burstTempAp?: number;
  /** 灵气觉醒：满槽爆发后护盾。 */
  fullBurstShieldRatio?: number;
  description: string;
  nextStageHint?: string;
}

export interface PartnerDefinition {
  id: PartnerId;
  displayName: string;
  typeLabel: string;
  stages: Record<PartnerEvolutionStage, PartnerStageSkillConfig>;
}

const MOBILITY: PartnerDefinition = {
  id: 'MOBILITY',
  displayName: '位移伙伴',
  typeLabel: '位移',
  stages: {
    1: { range: 2, description: '跃迁：选择 2 格内合法格瞬移，不耗 AP。', nextStageHint: '成长：范围 3 格' },
    2: { range: 3, description: '远跃：选择 3 格内合法格瞬移。', nextStageHint: '进化：跃迁后下次移动 AP-1' },
    3: {
      range: 3,
      nextMoveCostReduce: 1,
      description: '轻落：瞬移后本回合下一次主动移动 AP-1（最低 1）。',
      nextStageHint: '觉醒：范围 4 格，危险落点获盾',
    },
    4: {
      range: 4,
      nextMoveCostReduce: 1,
      dangerousLandingShieldRatio: 0.06,
      description: '破界：范围 4 格；危险落点获得最大生命 6% 护盾。',
    },
  },
};

const GUARD: PartnerDefinition = {
  id: 'GUARD',
  displayName: '守护伙伴',
  typeLabel: '守护',
  stages: {
    1: { shieldMaxHpRatio: 0.15, description: '庇护：获得最大生命 15% 护盾。', nextStageHint: '成长：护盾 20%' },
    2: { shieldMaxHpRatio: 0.2, description: '厚护：获得最大生命 20% 护盾。', nextStageHint: '进化：抵抗一次强制位移' },
    3: {
      shieldMaxHpRatio: 0.2,
      forcedDisplaceReduce: 1,
      description: '稳固：庇护后至下回合开始前，首次强制位移 -1 格。',
      nextStageHint: '觉醒：护盾留到下回合获得 1 临时 AP',
    },
    4: {
      shieldMaxHpRatio: 0.2,
      forcedDisplaceReduce: 1,
      shieldRetainTempAp: 1,
      description: '守成：护盾若留到下回合开始，额外获得 1 临时 AP。',
    },
  },
};

const BREAKER: PartnerDefinition = {
  id: 'BREAKER',
  displayName: '破阵伙伴',
  typeLabel: '破阵',
  stages: {
    1: { armorPenetration: 0.3, description: '破界标记：下次主动攻击该目标获 30% 护甲穿透。', nextStageHint: '成长：45% 破甲' },
    2: { armorPenetration: 0.45, description: '裂甲：下次主动攻击该目标获 45% 护甲穿透。', nextStageHint: '进化：命中后降低目标下一击伤害' },
    3: {
      armorPenetration: 0.45,
      targetNextHitDamageTakenMul: 0.8,
      description: '破势：标记命中后，目标下一次主动攻击最终伤害 -20%。',
      nextStageHint: '觉醒：再制造短暂破甲窗口',
    },
    4: {
      armorPenetration: 0.45,
      targetNextHitDamageTakenMul: 0.8,
      woundExtraArmorPen: 0.15,
      description: '开隙：命中后获得破绽，本回合对该目标下次主动攻击再 +15% 破甲。',
    },
  },
};

const CONTROL: PartnerDefinition = {
  id: 'CONTROL',
  displayName: '控场伙伴',
  typeLabel: '控场',
  stages: {
    1: { range: 2, movePenalty: 1, description: '缓域：周围 2 格敌人移动 -1（至其下次行动结束）。', nextStageHint: '成长：范围 3 格' },
    2: { range: 3, movePenalty: 1, description: '扩域：周围 3 格敌人移动 -1。', nextStageHint: '进化：强制位移额外 +1' },
    3: {
      range: 3,
      movePenalty: 1,
      description: '定势：受影响普精下次强制位移 +1（Boss 不受）。',
      nextStageHint: '觉醒：移速压 0 时降低下一击伤害',
    },
    4: {
      range: 3,
      movePenalty: 1,
      zeroMoveHitReduceNormal: 0.2,
      zeroMoveHitReduceBoss: 0.1,
      description: '霜止：移速被压至 0 时，普精下击 -20% / Boss -10%。',
    },
  },
};

const ANIMA: PartnerDefinition = {
  id: 'ANIMA',
  displayName: '灵气伙伴',
  typeLabel: '灵气',
  stages: {
    1: { spiritGainRatio: 0.25, description: '灵潮：立即获得 25% 灵气。', nextStageHint: '成长：35% 灵气' },
    2: { spiritGainRatio: 0.35, description: '灵涌：立即获得 35% 灵气。', nextStageHint: '进化：本回合爆发后 +1 临时 AP' },
    3: {
      spiritGainRatio: 0.35,
      burstTempAp: 1,
      description: '余响：本回合内释放职业爆发后获得 1 临时 AP。',
      nextStageHint: '觉醒：满槽爆发后获盾',
    },
    4: {
      spiritGainRatio: 0.35,
      burstTempAp: 1,
      fullBurstShieldRatio: 0.06,
      description: '回声：若因此满槽，爆发结束后获得最大生命 6% 护盾。',
    },
  },
};

const HEAL: PartnerDefinition = {
  id: 'HEAL',
  displayName: '治疗伙伴',
  typeLabel: '治疗',
  stages: {
    1: { healMaxHpRatio: 0.15, description: '愈息：恢复最大生命 15%。', nextStageHint: '成长：治疗 20%' },
    2: { healMaxHpRatio: 0.2, description: '丰息：恢复最大生命 20%。', nextStageHint: '进化：低血额外恢复' },
    3: {
      healMaxHpRatio: 0.2,
      lowHpBonusHealRatio: 0.05,
      description: '回春：生命不高于 40% 时额外恢复最大生命 5%。',
      nextStageHint: '觉醒：过量治疗转护盾',
    },
    4: {
      healMaxHpRatio: 0.2,
      lowHpBonusHealRatio: 0.05,
      overhealToShieldRatio: 0.5,
      overhealShieldCapRatio: 0.1,
      description: '余泽：过量治疗 50% 转护盾（上限最大生命 10%）。',
    },
  },
};

const CATALOG: Record<PartnerId, PartnerDefinition> = {
  MOBILITY,
  GUARD,
  BREAKER,
  CONTROL,
  ANIMA,
  HEAL,
};

export function getPartnerDefinition(id: PartnerId): PartnerDefinition {
  return CATALOG[id];
}

export function getStageSkillConfig(id: PartnerId, stage: PartnerEvolutionStage): PartnerStageSkillConfig {
  return CATALOG[id].stages[stage];
}

export function listPartnerDefinitions(): PartnerDefinition[] {
  return (Object.keys(CATALOG) as PartnerId[]).map((id) => CATALOG[id]);
}
