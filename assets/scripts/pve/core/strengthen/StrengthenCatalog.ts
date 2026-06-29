import type { ClassId } from '../PveConstants';

export type StrengthenKind = 'stable' | 'condition' | 'stack' | 'core' | 'anomaly' | 'route';

export interface StrengthenDef {
  id: string;
  classId: ClassId;
  kind: StrengthenKind;
  name: string;
  desc: string;
  stack: number;
  weight: number;
  requiresAny?: readonly string[];
  requiresAll?: readonly string[];
}

const d = (
  id: string,
  classId: ClassId,
  kind: StrengthenKind,
  name: string,
  desc: string,
  stack = 1,
  requiresAny?: readonly string[],
  requiresAll?: readonly string[],
): StrengthenDef => ({
  id,
  classId,
  kind,
  name,
  desc,
  stack,
  weight: kind === 'anomaly' ? 0.45 : kind === 'core' || kind === 'route' ? 0.65 : 1,
  requiresAny,
  requiresAll,
});

export const ADVENTURER_STRENGTHEN_DEFS = [
  d('strengthen_hp_up', 'ADVENTURER', 'stable', '强健体魄', '最大生命和当前生命+20', 3),
  d('strengthen_attack_up', 'ADVENTURER', 'stable', '力量训练', '攻击力+3', 3),
  d('strengthen_ap_up', 'ADVENTURER', 'stable', '行动规划', '每回合AP上限+1', 2),
  d('strengthen_gold_find', 'ADVENTURER', 'stable', '淘金经验', '获得金币+15%', 3),
  d('general_guard_training', 'ADVENTURER', 'stable', '防护训练', '受到怪物伤害-2', 3),
  d('general_anima_sense', 'ADVENTURER', 'stable', '灵气感应', '获得灵气+10%', 3),
  d('general_chest_lore', 'ADVENTURER', 'stable', '宝箱学识', '宝箱金币+15%', 3),
  d('general_recovery_rhythm', 'ADVENTURER', 'stable', '恢复节奏', '进入新楼层回复5%最大生命', 2),
  d('general_first_strike', 'ADVENTURER', 'condition', '先发制人', '每层第一次主动攻击伤害+20%'),
  d('general_steady_finish', 'ADVENTURER', 'condition', '稳健收尾', '攻击生命不高于30%的敌人时伤害+10%'),
  d('general_last_defense', 'ADVENTURER', 'condition', '绝境防护', '生命不高于35%时受到伤害-10%'),
  d('general_reserve_setup', 'ADVENTURER', 'condition', '余力整备', '回合结束剩余至少3AP时，下回合AP上限临时+1'),
  d('general_setback_counter', 'ADVENTURER', 'condition', '受挫反击', '受到超过最大生命20%的单次伤害后，下一次主动攻击伤害+15%'),
  d('general_polymath', 'ADVENTURER', 'condition', '博采众长', '每拥有3种不同普通词条，最大生命+10'),
  d('general_accumulation', 'ADVENTURER', 'condition', '厚积薄发', '每有一种普通词条达到3层，攻击力+1'),
  d('general_cover_guard', 'ADVENTURER', 'anomaly', '据险而守', '相邻阻挡地形时受到伤害-15%'),
  d('general_terrain_power', 'ADVENTURER', 'anomaly', '地脉借力', '触发危险地形后，下一次主动攻击伤害+35%'),
  d('general_stored_edge', 'ADVENTURER', 'anomaly', '藏锋待发', '无攻击结束回合后，下一次主动攻击伤害+30%'),
  d('general_overheal_anima', 'ADVENTURER', 'anomaly', '溢能转化', '过量治疗的50%转为灵气，每层最多20'),
  d('general_blood_price', 'ADVENTURER', 'anomaly', '血价交易', '金币不足时可用2生命抵1金币，最多抵原价50%'),
] as const satisfies readonly StrengthenDef[];

export const BERSERKER_STRENGTHEN_DEFS = [
  d('life_steal', 'BERSERKER', 'stable', '吸血', '主动攻击命中回复8生命'),
  d('berserk', 'BERSERKER', 'condition', '狂暴', '生命不高于50%时伤害+20%'),
  d('blood_rage', 'BERSERKER', 'stable', '血怒', '击杀回复15生命'),
  d('undying', 'BERSERKER', 'condition', '不屈', '每章首次致死伤害保留1生命'),
  d('counter', 'BERSERKER', 'stable', '反击', '被怪物命中时对攻击者造成10伤害'),
  d('vengeance', 'BERSERKER', 'condition', '复仇', '受伤后下一次主动攻击伤害+25%'),
  d('cleave', 'BERSERKER', 'stable', '横扫', '对主目标相邻敌人造成40%伤害'),
  d('pain_tolerance', 'BERSERKER', 'stable', '痛觉钝化', '大额单次伤害降低15%'),
  d('executioner', 'BERSERKER', 'stable', '处刑者', '攻击30%生命以下敌人伤害+15%'),
  d('last_stand', 'BERSERKER', 'condition', '贴身猛攻', '攻击相邻目标伤害+15%'),
  d('iron_skin_stack', 'BERSERKER', 'stack', '铁骨', '最大生命和当前生命+15', 3),
  d('bloodlust_stack', 'BERSERKER', 'stack', '嗜血本能', '击杀额外回复5生命', 3),
  d('rage_strike_stack', 'BERSERKER', 'stack', '怒击', '低于50%生命时攻击力+4', 3),
  d('berserker_resolve', 'BERSERKER', 'core', '浴血战意', '每损失10%生命，伤害+3%，最多+21%'),
  d('final_charge', 'BERSERKER', 'core', '最后冲锋', '每层首次降至30%生命时获得3AP且下一击+30%'),
  d('berserker_blood_shield', 'BERSERKER', 'route', '鲜血护盾', '攻击与击杀溢出治疗转为护盾', 1, ['life_steal', 'blood_rage', 'bloodlust_stack']),
  d('berserker_bloody_chain', 'BERSERKER', 'route', '血腥连锁', '击杀后下一击+25%，再次击杀则刷新', 1, ['blood_rage', 'bloodlust_stack']),
  d('berserker_rage_boiling', 'BERSERKER', 'route', '怒火沸腾', '低血攻击积累怒火，每层伤害+5%', 1, ['berserk', 'rage_strike_stack', 'berserker_resolve']),
  d('berserker_death_feast', 'BERSERKER', 'route', '濒死盛宴', '30%生命以下治疗+50%', 1, ['berserk', 'berserker_resolve', 'final_charge']),
  d('berserker_tooth_for_tooth', 'BERSERKER', 'route', '以牙还牙', '被攻击后反击该目标伤害+30%', 1, ['counter', 'vengeance', 'pain_tolerance']),
] as const satisfies readonly StrengthenDef[];

export const ARCHER_STRENGTHEN_DEFS = [
  d('eagle_eye', 'ARCHER', 'stable', '鹰眼', '攻击距离+1'), d('marksman', 'ARCHER', 'stable', '射手精通', '攻击力+4', 2),
  d('multi_shot', 'ARCHER', 'stable', '连射', '30%概率追加一箭'), d('pierce', 'ARCHER', 'stable', '穿透', '无视固定减伤与护甲'),
  d('crit', 'ARCHER', 'stable', '暴击', '10%概率造成双倍伤害'), d('headshot', 'ARCHER', 'condition', '远射', '距离至少3格时伤害+20%'),
  d('steady_aim', 'ARCHER', 'condition', '稳定瞄准', '本回合未移动时第一次攻击+20%'), d('retreat_shot', 'ARCHER', 'condition', '游击射击', '本回合移动后第一次攻击+10%'),
  d('scatter_shot', 'ARCHER', 'stable', '散射', '对相邻一名敌人造成35%伤害'), d('finisher', 'ARCHER', 'condition', '猎手节奏', '远距离击杀后下一击+15%'),
  d('quiver_stack', 'ARCHER', 'stack', '精准校准', '暴击概率+4个百分点', 3), d('vital_shot_stack', 'ARCHER', 'stack', '备用箭矢', '连射概率+7个百分点', 3),
  d('focus_stack', 'ARCHER', 'stack', '远射训练', '攻击距离至少2格时攻击力+2', 3), d('deadeye', 'ARCHER', 'core', '标记猎物', '持续攻击标记目标伤害+20%'),
  d('last_arrow', 'ARCHER', 'core', '穿云箭', '每第3次主动攻击伤害+50%'),
  d('archer_breath_focus', 'ARCHER', 'route', '屏息凝神', '远距离站定首击暴击概率+25个百分点', 1, ['eagle_eye', 'headshot', 'steady_aim']),
  d('archer_line_pierce', 'ARCHER', 'route', '一线穿心', '对目标后方第一名敌人造成50%伤害', 1, ['pierce', 'headshot', 'last_arrow']),
  d('archer_arrow_rhythm', 'ARCHER', 'route', '箭雨节奏', '连续两次未连射后，下次必定连射', 1, ['multi_shot', 'vital_shot_stack']),
  d('archer_critical_reload', 'ARCHER', 'route', '暴击装填', '暴击后下次连射概率+20个百分点', 1, ['crit', 'quiver_stack']),
  d('archer_mark_transfer', 'ARCHER', 'route', '猎杀转移', '标记目标死亡后自动转移标记', 1, undefined, ['deadeye']),
] as const satisfies readonly StrengthenDef[];

export const ROGUE_STRENGTHEN_DEFS = [
  d('swift', 'ROGUE', 'stable', '疾步', '移动消耗AP-1'), d('backstab', 'ROGUE', 'condition', '背刺', '移动后第一次主动攻击伤害+50%'),
  d('stealth', 'ROGUE', 'stable', '潜行', '普通怪和精英怪警戒范围-2'), d('afterimage', 'ROGUE', 'condition', '残影', '每层闪避第一次怪物主动攻击'),
  d('assassin_heart', 'ROGUE', 'condition', '刺客之心', '攻击未追击敌人伤害+20%'), d('shadow_strike', 'ROGUE', 'condition', '连环攻势', '同回合第二次主动攻击伤害+25%'),
  d('retribution', 'ROGUE', 'stable', '毒刃', '攻击附加2回合中毒'), d('shockwave', 'ROGUE', 'condition', '脱身', '攻击后本回合下一次移动消耗-1'),
  d('evasion_training', 'ROGUE', 'condition', '弱点利用', '攻击负面状态敌人伤害+20%'), d('coup_de_grace', 'ROGUE', 'condition', '无声猎杀', '击杀未追击敌人后进入隐匿'),
  d('nimble_stack', 'ROGUE', 'stack', '毒素精通', '中毒每回合伤害+3', 3), d('bloodletter_stack', 'ROGUE', 'stack', '短刃精通', '攻击力+2', 3),
  d('flurry_stack', 'ROGUE', 'stack', '闪避本能', '闪避概率+5个百分点', 3), d('survival_instinct', 'ROGUE', 'core', '暗影连杀', '本层每次击杀伤害+5%，最多+25%'),
  d('desperate_gambit', 'ROGUE', 'core', '烟幕遁形', '每层首次击杀后其他敌人退出追击'),
  d('rogue_poison_spread', 'ROGUE', 'route', '剧毒蔓延', '中毒目标死亡时向相邻敌人扩散中毒', 1, ['retribution', 'nimble_stack']),
  d('rogue_venom_burst', 'ROGUE', 'route', '猛毒爆发', '中毒目标首次降至30%时立即结算剩余毒伤', 1, ['retribution', 'nimble_stack', 'evasion_training']),
  d('rogue_blade_dance', 'ROGUE', 'route', '刀尖舞步', '每主动移动1格，下一击+5%，最多+25%', 1, ['swift', 'backstab', 'shockwave']),
  d('rogue_chain_backstab', 'ROGUE', 'route', '影袭连环', '背刺击杀后下一击无需移动也获得背刺', 1, ['backstab', 'shadow_strike']),
  d('rogue_vanish_shadow', 'ROGUE', 'route', '无影无踪', '闪避后下一击+25%并进入隐匿', 1, ['stealth', 'afterimage', 'flurry_stack', 'desperate_gambit']),
] as const satisfies readonly StrengthenDef[];

export const STRENGTHEN_DEFS = [
  ...ADVENTURER_STRENGTHEN_DEFS,
  ...BERSERKER_STRENGTHEN_DEFS,
  ...ARCHER_STRENGTHEN_DEFS,
  ...ROGUE_STRENGTHEN_DEFS,
] as const;

export const STRENGTHEN_DEF_BY_ID: Readonly<Record<string, StrengthenDef>> = Object.fromEntries(
  STRENGTHEN_DEFS.map((def) => [def.id, def]),
);

export const STRENGTHEN_POOL_BY_CLASS: Readonly<Record<ClassId, readonly StrengthenDef[]>> = {
  ADVENTURER: ADVENTURER_STRENGTHEN_DEFS,
  BERSERKER: BERSERKER_STRENGTHEN_DEFS,
  ARCHER: ARCHER_STRENGTHEN_DEFS,
  ROGUE: ROGUE_STRENGTHEN_DEFS,
};

export function strengthenDef(id: string): StrengthenDef | undefined {
  return STRENGTHEN_DEF_BY_ID[id];
}
