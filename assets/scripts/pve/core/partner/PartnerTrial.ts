import type { PartnerId } from './PartnerTypes';

/** 正式试炼关卡测通后再接；首版恒通过以便验收三四阶段。 */
export function hasCompletedPartnerTrial(_partnerId: PartnerId, _toStage: 2 | 3 | 4): boolean {
  return true;
}
