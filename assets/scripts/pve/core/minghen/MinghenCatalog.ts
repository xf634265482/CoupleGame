import type { MinghenHook } from './MinghenEventContext';
import type { MinghenLevel } from '../PveProgressionTypes';

export type MinghenCategory = 'STARTER' | 'CONNECTOR' | 'PAYOFF' | 'TRICK';
export type MinghenComplexity = 'SIMPLE' | 'ADVANCED' | 'TRICKY';
export interface MinghenDefinition {
  id: string; name: string; category: MinghenCategory; complexity: MinghenComplexity; sourceFloor: number;
  tags: string[]; hooks: MinghenHook[]; values: Record<MinghenLevel, readonly number[]>; effects: Record<MinghenLevel,string>; trial: string;
}

const MINGHEN_EFFECTS:Record<string,Record<MinghenLevel,string>>={
M01:{1:'每回合累计主动移动3格后，下一次主动攻击施加1层流血。',2:'每回合累计主动移动2格后，下一次主动攻击施加1层流血。',3:'每回合累计主动移动2格后，下一次主动攻击施加1层流血；该攻击击杀流血目标时返还1 AP，每回合一次。'},
M02:{1:'同一回合第二次主动命中同一目标时施加1层中毒。',2:'同一回合第二次及之后每次主动命中同一目标时施加1层中毒，每个目标每回合最多3层。',3:'继承II级；回合结束时，本回合命中过且至少有3层中毒的目标，中毒持续时间增加1回合。'},
M03:{1:'最终消耗至少4 AP的主动攻击施加1层灼烧。',2:'最终消耗至少3 AP的主动攻击施加1层灼烧。',3:'继承II级；对已有灼烧的目标再次施加时，立即额外结算1层灼烧，每个目标每回合一次。'},
M04:{1:'本回合未主动移动时，第一次主动攻击施加1层冰寒。',2:'本回合未主动移动时，第一次主动攻击施加2层冰寒。',3:'继承II级；本回合首次触发冻结或Boss失衡时恢复1 AP。'},
M05:{1:'回合结束时若未主动攻击，下一次主动攻击最终伤害提高25%。',2:'回合结束时若未主动攻击，下一次主动攻击最终伤害提高35%。',3:'继承II级；强化攻击50%的过量伤害会传递给主目标相邻且最近的一名敌人。'},
M06:{1:'回合结束剩余至少3 AP，下回合获得1临时AP。',2:'回合结束剩余至少2 AP，下回合获得1临时AP。',3:'继承II级；消耗该临时AP后，本回合下一次主动攻击获得20%护甲穿透。'},
M07:{1:'单次承受至少最大生命20%的实际伤害后，下一次主动攻击最终伤害提高20%。',2:'触发条件不变，下一次主动攻击最终伤害提高30%。',3:'继承II级；强化攻击命中后恢复实际伤害的10%，最多恢复最大生命8%。'},
M08:{1:'主动进入危险地形并承受效果后，下一次主动攻击最终伤害提高25%。',2:'继承I级；获得充能时，本回合下一次主动移动消耗降低1 AP，最低1。',3:'继承II级；强化攻击会复制当前地形异常1层，纯伤害地形则追加20%攻击的地形伤害。'},
M09:{1:'每回合第一次主动攻击异常目标时，最终伤害提高15%。',2:'每回合第一次主动攻击异常目标时，最终伤害提高25%。',3:'继承II级；强化攻击击杀异常目标时恢复最大生命5%。'},
M10:{1:'给已有异常的目标施加不同异常时，原异常持续时间增加1回合，每个目标每回合一次。',2:'继承I级；新施加的异常额外增加1层。',3:'继承II级；首次触发时追加40%攻击的共振伤害，每个目标每回合一次。'},
M11:{1:'护盾从有到无时，下一次主动攻击最终伤害提高20%。',2:'护盾从有到无时，下一次主动攻击最终伤害提高30%。',3:'继承II级；强化攻击命中后获得实际伤害10%的护盾，最多为最大生命8%。'},
M12:{1:'过量治疗的50%转为护盾，累计上限为最大生命15%。',2:'过量治疗的75%转为护盾，累计上限为最大生命25%。',3:'继承II级；生息护盾存在时，每回合第一次主动攻击获得20%护甲穿透。'},
M13:{1:'主动攻击强制位移使敌人发生碰撞时，获得最大生命5%的护盾，每回合一次。',2:'触发碰撞时获得最大生命8%的护盾，每回合一次。',3:'继承II级；触发后本回合下一次主动攻击消耗降低1 AP，最低1。'},
M14:{1:'每回合第一次主动攻击后，下一次主动移动消耗降低1 AP，最低1。',2:'继承I级；完成减费移动后，下一次主动攻击最终伤害提高15%。',3:'继承II级；同回合完成攻击、减费移动、强化攻击后恢复1 AP。'},
M15:{1:'主动攻击击杀后，本回合下一次对不同目标的主动攻击最终伤害提高20%。',2:'增伤提高至30%，且可保留到下一玩家回合。',3:'继承II级；强化攻击再次击杀时恢复1 AP并重新获得连环，每回合一次。'},
M16:{1:'回合结束时恰好剩余0 AP，获得10点灵气。',2:'回合结束时恰好剩余0 AP，获得15点灵气。',3:'继承II级；回流令灵气满槽后，下一次灵气爆发获得1临时AP，每层一次。'},
M17:{1:'异常目标死亡时，将层数最高的一种异常扩散1层给相邻最多2名敌人。',2:'异常目标死亡时，将其每种异常各扩散1层给相邻最多2名敌人。',3:'层数最高的异常扩散2层，且异常伤害击杀也能触发；疫爆不会递归。'},
M18:{1:'消耗至少4 AP的主动攻击命中流血或中毒目标时，额外结算各1层伤害，每个目标每回合一次。',2:'触发消耗降低为至少3 AP。',3:'继承II级；目标生命不高于30%时额外结算各2层。'},
M19:{1:'主动攻击击杀时，将35%过量伤害传递给相邻生命最低的敌人。',2:'主动攻击击杀时，将50%过量伤害传递给相邻生命最低的敌人。',3:'继承II级；过量伤害达到死者最大生命30%时，可传递给相邻最多2名敌人。'},
M20:{1:'一次主动攻击命中至少2个目标后，下一次单体攻击每个额外目标提供15%增伤，最多30%。',2:'每个额外目标提供20%增伤，最多40%。',3:'继承II级；聚锋强化攻击击杀时恢复1 AP，每回合一次。'},
M21:{1:'生命不高于35%时，主动攻击最终伤害提高15%。',2:'生命不高于35%时，主动攻击最终伤害提高25%。',3:'继承II级；每层首次低生命主动击杀恢复最大生命12%，最多恢复到50%。'},
M22:{1:'每回合首次交替完成移动与攻击时，下一次主动行动消耗降低1 AP，最低1。',2:'每回合可触发2次行云减费。',3:'继承II级；每次消耗行云减费后获得最大生命4%的护盾，每回合最多8%。'},
M23:{1:'回合开始可选择消耗最大生命8%，获得2临时AP；每回合一次。',2:'回合开始可选择消耗最大生命6%，获得2临时AP；每回合一次。',3:'继承II级；使用后本回合主动击杀恢复最大生命6%，不超过使用前生命。'},
M24:{1:'回合开始可进入静界：本回合不能移动，第一次主动攻击距离+1、最终伤害提高25%。',2:'回合开始可进入静界：本回合不能移动，第一次主动攻击距离+1、最终伤害提高35%。',3:'回合开始可进入静界：本回合不能移动，第一次主动攻击距离+1、最终伤害提高35%、获得25%护甲穿透；攻击前至少3 AP时，命中后获得最大生命6%的护盾。'},
M25:{1:'踩入沙坑时移动额外 AP 惩罚 −1（最低 0）。',2:'继承 I 级；本回合首次踩沙坑不支付额外 AP。',3:'继承 II 级；站在沙坑上主动攻击最终伤害 +15%。'},
M26:{1:'沙暴真实伤害 −30%。',2:'沙暴真实伤害 −50%。',3:'继承 II 级；本回合被沙暴命中后下一次主动攻击 +20%。'},
};

function d(id: string, name: string, category: MinghenCategory, complexity: MinghenComplexity, sourceFloor: number, tags: string[], hooks: MinghenHook[], values: Record<MinghenLevel, readonly number[]>, trial: string): MinghenDefinition {
  return { id, name, category, complexity, sourceFloor, tags, hooks, values, effects:MINGHEN_EFFECTS[id]!, trial };
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
  d('M25','沙行','TRICK','SIMPLE',12,['TERRAIN','MOVE'],['BEFORE_MOVE','BEFORE_HIT'],{1:[1],2:[1,1],3:[1,1,.15]},'踩沙坑3次并在沙坑上完成1次强化攻击'),
  d('M26','抗暴','TRICK','SIMPLE',14,['TERRAIN','DAMAGED'],['DAMAGED','BEFORE_HIT'],{1:[.3],2:[.5],3:[.5,.2]},'承受3次沙暴并在减伤状态下完成1次强化攻击'),
] as const;

export const MINGHEN_BY_ID = new Map(MINGHEN_CATALOG.map((entry) => [entry.id, entry]));
export function getMinghenDefinition(id: string): MinghenDefinition { const found = MINGHEN_BY_ID.get(id); if (!found) throw new Error('UNKNOWN_MINGHEN'); return found; }
