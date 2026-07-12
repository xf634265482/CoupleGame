import type { MinghenHook } from './MinghenEventContext';
import type { MinghenLevel } from '../PveProgressionTypes';

export type MinghenCategory = 'STARTER' | 'CONNECTOR' | 'PAYOFF' | 'TRICK';
export type MinghenComplexity = 'SIMPLE' | 'ADVANCED' | 'TRICKY';
export interface MinghenDefinition {
  id: string; name: string; category: MinghenCategory; complexity: MinghenComplexity; sourceFloor: number;
  tags: string[]; hooks: MinghenHook[]; values: Record<MinghenLevel, readonly number[]>; trial: string;
}

function d(id: string, name: string, category: MinghenCategory, complexity: MinghenComplexity, sourceFloor: number, tags: string[], hooks: MinghenHook[], values: Record<MinghenLevel, readonly number[]>, trial: string): MinghenDefinition {
  return { id, name, category, complexity, sourceFloor, tags, hooks, values, trial };
}

export const MINGHEN_CATALOG: readonly MinghenDefinition[] = [
  d('M01','血行','STARTER','SIMPLE',2,['MOVE','BLEED'],['AFTER_MOVE','AFTER_HIT'],{1:[3,1],2:[2,1],3:[2,1,1]},'施加6层流血并以触发攻击击杀2名敌人'),
  d('M02','毒契','STARTER','SIMPLE',2,['MULTI_HIT','POISON'],['AFTER_HIT','TURN_END'],{1:[2,1],2:[2,1,3],3:[2,1,3,1]},'令精英达到5层中毒并由中毒击杀'),
  d('M03','余烬','STARTER','SIMPLE',3,['HIGH_AP','BURN'],['AFTER_HIT'],{1:[4,1],2:[3,1],3:[3,1,1]},'高AP攻击触发5次并消耗6层灼烧'),
  d('M04','寒息','STARTER','SIMPLE',3,['STATIONARY','CHILL'],['AFTER_HIT'],{1:[1],2:[2],3:[2,1]},'触发3次冻结或失衡'),
  d('M05','藏锋','STARTER','SIMPLE',1,['WAIT','BURST'],['TURN_END','BEFORE_HIT'],{1:[.25],2:[.35],3:[.35,.5]},'触发3次并造成50%剩余生命过量伤害'),
  d('M06','余力','STARTER','SIMPLE',1,['AP','NEXT_TURN'],['TURN_END','TURN_START','BEFORE_ATTACK'],{1:[3,1],2:[2,1],3:[2,1,.2]},'获得4临时AP并用3点参与攻击'),
  d('M07','逆鳞','STARTER','ADVANCED',1,['DAMAGED','RECOVER'],['DAMAGED','BEFORE_HIT','AFTER_HIT'],{1:[.2,.2],2:[.2,.3],3:[.2,.3,.1,.08]},'触发2次并在40%生命以下击杀精英'),
  d('M08','地脉','STARTER','TRICKY',4,['TERRAIN','CONVERT'],['AFTER_MOVE','BEFORE_HIT'],{1:[.25],2:[.25,1],3:[.25,1,.2]},'承受3次危险地形并反击不同敌人'),
  d('M09','追猎','CONNECTOR','SIMPLE',2,['STATUS','ATTACK'],['BEFORE_HIT','KILL'],{1:[.15],2:[.25],3:[.25,.05]},'对5个异常目标触发并击杀2个'),
  d('M10','催化','CONNECTOR','TRICKY',3,['MULTI_STATUS'],['STATUS_APPLIED'],{1:[1],2:[1,1],3:[1,1,.4]},'对3个目标触发并令目标持有3种异常'),
  d('M11','坚锋','CONNECTOR','ADVANCED',4,['SHIELD','ATTACK'],['SHIELD_BROKEN','BEFORE_HIT','AFTER_HIT'],{1:[.2],2:[.3],3:[.3,.1,.08]},'护盾击破3次并累计重建15%护盾'),
  d('M12','生息','CONNECTOR','SIMPLE',4,['HEAL','SHIELD'],['HEALED','BEFORE_HIT'],{1:[.5,.15],2:[.75,.25],3:[.75,.25,.2]},'转化30%最大生命过量治疗并击杀精英'),
  d('M13','震荡','CONNECTOR','ADVANCED',5,['COLLISION','SHIELD'],['COLLISION','BEFORE_ATTACK'],{1:[.05],2:[.08],3:[.08,1]},'制造4次碰撞并以减费攻击击杀'),
  d('M14','流转','CONNECTOR','ADVANCED',5,['ATTACK','MOVE','CHAIN'],['AFTER_ATTACK','BEFORE_MOVE','AFTER_MOVE','BEFORE_HIT'],{1:[1],2:[1,.15],3:[1,.15,1]},'完成4次攻击移动强化攻击序列'),
  d('M15','连环','CONNECTOR','SIMPLE',2,['KILL','RETARGET'],['KILL','BEFORE_HIT'],{1:[.2],2:[.3],3:[.3,1]},'连续3次换目标击杀'),
  d('M16','回流','CONNECTOR','ADVANCED',4,['AP','SPIRIT'],['TURN_END','SPIRIT_BURST'],{1:[10],2:[15],3:[15,1]},'通过回流获得45灵气并充满释放'),
  d('M17','疫爆','PAYOFF','ADVANCED',6,['STATUS','SPREAD'],['KILL','STATUS_KILL'],{1:[1,2],2:[1,2],3:[2,2]},'扩散影响6个敌人并由异常击杀2个'),
  d('M18','引爆','PAYOFF','ADVANCED',6,['STATUS','DETONATE'],['AFTER_HIT'],{1:[4,1],2:[3,1],3:[3,2,.3]},'触发5次并由引爆击杀高潮目标'),
  d('M19','溢伤','PAYOFF','ADVANCED',5,['OVERKILL','AREA'],['KILL'],{1:[.35,1],2:[.5,1],3:[.5,2,.3]},'累计100次生伤害并完成双传递'),
  d('M20','聚锋','PAYOFF','ADVANCED',6,['MULTI_TARGET','FINISH'],['AFTER_ATTACK','BEFORE_HIT','KILL'],{1:[.15,.3],2:[.2,.4],3:[.2,.4,1]},'多目标接单体终结累计2组'),
  d('M21','绝处','PAYOFF','SIMPLE',7,['LOW_HP'],['BEFORE_HIT','KILL'],{1:[.15,.35],2:[.25,.35],3:[.25,.35,.12,.5]},'低生命对Boss造成20%最大生命伤害并存活'),
  d('M22','行云','PAYOFF','ADVANCED',6,['ALTERNATE','DISCOUNT'],['AFTER_MOVE','AFTER_ATTACK','BEFORE_MOVE','BEFORE_ATTACK'],{1:[1,1],2:[1,2],3:[1,2,.04,.08]},'触发6次并单回合完成5次行动'),
  d('M23','血铸','TRICK','TRICKY',7,['HP_FOR_AP'],['TURN_START','KILL'],{1:[.08,2],2:[.06,2],3:[.06,2,.06]},'使用4次并依靠临时AP击杀2次'),
  d('M24','静界','TRICK','TRICKY',7,['STATIONARY','STANCE'],['TURN_START','BEFORE_MOVE','BEFORE_HIT','AFTER_HIT'],{1:[1,.25],2:[1,.35],3:[1,.35,.25,.06]},'强化攻击命中Boss4次并在预警区完成2次'),
] as const;

export const MINGHEN_BY_ID = new Map(MINGHEN_CATALOG.map((entry) => [entry.id, entry]));
export function getMinghenDefinition(id: string): MinghenDefinition { const found = MINGHEN_BY_ID.get(id); if (!found) throw new Error('UNKNOWN_MINGHEN'); return found; }
