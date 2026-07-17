// PVE銆屽懡杩愯繙寰併€嶆暟鍊煎父閲忥紙瀹㈡埛绔潈濞佸崟涓€鏉ユ簮锛夈€?
// 淇敼鏈枃浠剁殑鐜╂硶鏁板€兼椂蹇呴』鍚屾 specs/260608-pve-destiny-expedition/design.md锛堣 .cursor/rules/pve-module.mdc锛夈€?
// 涓嶇敤 enum锛氱粺涓€ as const + 瀛楅潰閲忚仈鍚堢被鍨嬨€?

// 鈹€鈹€ AP 琛屽姩鐐癸紙design 搂4锛?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
export const AP_BASE = 8;
export const DICE_MIN = 1;
export const DICE_MAX = 6;

export const AP_COST = {
  MOVE: 2, // 绉诲姩 1 鏍?
  ATTACK: 3, // 鏅€氭敾鍑伙紙鍐嶈皟楂樹负 3 杩涗竴姝ラ檺鍒舵瘡鍥炲悎鏀诲嚮娆℃暟锛屽己鍖栬祫婧愬喅绛栵級
  OPEN_CHEST: 1, // 寮€鍚疂绠?
  OPEN_EXIT: 1, // 寮€鍚嚭鍙ｉ棬
  USE_IDOL: 1, // 浣跨敤绁炲儚
  USE_HOT_SPRING: 1, // 浣跨敤娓╂硥
  USE_ALTAR: 1, // 浣跨敤绁潧锛堥搧鍖犱笉鍦ㄦ琛細閾佸尃鍙敹閲戝竵锛屼笉娑堣€?AP锛?
} as const;

// AP 缁撹浆锛氬洖鍚堢粨鏉熸椂鏈敤瀹岀殑 AP锛屾寜 min(鍓╀綑, AP_CARRY_CAP) 缁撹浆鍒颁笅涓€鍥炲悎涓婇檺銆?
// 涓婇檺鍙?3锛堟伆濂藉鍑戜竴娆?ATTACK 鐨?闆跺ご"锛夛紝閬垮厤鏃犻檺鏀?AP 鎵撶牬"姣忓洖鍚堣鍔ㄦ鏁板彈闄?鐨勮祫婧愯璁°€?
export const AP_CARRY_CAP = 3;

// 鈹€鈹€ 涓珛浜や簰瀹炰綋鏁堟灉锛圡1 鍗犱綅鏁板€硷紝寰呬笌璁捐甯堝榻愬洖鍐?design.md锛?鈹€鈹€
export const IDOL_MAX_HP_BONUS = 10;    // 绁炲儚绁濈锛氭案涔?+10 maxHp
export const IDOL_ATTACK_BONUS = 2;     // 绁炲儚绁濈锛氭案涔?+2 鏀诲嚮
export const IDOL_ARMOR_BONUS = 2;      // 绁炲儚绁濈锛氭案涔?+2 鎶ょ敳锛堝噺灏戞€墿瀵圭帺瀹剁殑浼ゅ锛?
export const HOT_SPRING_HEAL_RATIO = 0.5; // 娓╂硥锛氭仮澶?maxHp 鐨?50%

// 鈹€鈹€ 鍦板浘灏哄锛坉esign 搂3 / 搂5锛?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
export const MAP_SIZE = {
  NORMAL: 8, // 8脳8 鏅€氬眰
  HIGH: 9, // 9脳9 楂樺眰
  BOSS: 10, // 10脳10 Boss 灞?
} as const;

// 鈹€鈹€ 绔犺妭缁撴瀯锛坉esign 搂3锛?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
export const FLOORS_PER_CHAPTER = 7;
export const TOTAL_CHAPTERS = 5;
export const TOTAL_FLOORS = FLOORS_PER_CHAPTER * TOTAL_CHAPTERS; // 35

export const CHAPTER_BOSS = {
  1: 'GOBLIN_CHIEF',
  2: 'QUICKSAND_SCORPION',
  3: 'FROST_GIANT',
  4: 'LAVA_LORD',
  5: 'FATE_GUARDIAN',
} as const;

// 鈹€鈹€ 鐜╁鍒濆鐘舵€?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
export const INITIAL_HP = 280; // V3 搂4b.2锛氫笂璋冨熀纭€ HP锛堝師 230锛夛紝鏂版墜缂撳啿
export const INITIAL_GOLD = 0;
export const INITIAL_ANIMA = 0;
export const INITIAL_CLASS = 'ADVENTURER';

// 鈹€鈹€ 杩烽浘鎻ず鍗婂緞锛堟浖鍝堥】璺濈锛宒esign 搂5锛?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
export const FOG_REVEAL_RADIUS = 1;

// 鈹€鈹€ 鑱屼笟锛坉esign 搂8锛?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
// attackBonus / attackRangeBonus / moveBonus / 杩涢樁鍗虫椂浠ｄ环
// 永久逐层：职业面板见 professions/ProfessionBaseStats.ts；此处 attackBonus/attackRangeBonus 一律为 0，
// 避免旧「进阶狂战士 +8」等叠进 HUD。moveBonus 仅遗留非永久路径可能读取。
export const CLASS_STATS = {
  ADVENTURER: { attackBonus: 0, attackRangeBonus: 0, moveBonus: 0, hpCost: 0 },
  BERSERKER: { attackBonus: 0, attackRangeBonus: 0, moveBonus: 0, hpCost: 0 },
  ARCHER: { attackBonus: 0, attackRangeBonus: 0, moveBonus: 0, hpCost: 0 },
  ROGUE: { attackBonus: 0, attackRangeBonus: 0, moveBonus: 1, hpCost: 0 },
} as const;

/** 绮捐嫳銆佺壒娈婃€笌 Boss 瀵瑰皠鎵嬪叏閮ㄧ帺瀹舵潵婧愪激瀹崇殑鏈€缁堝噺浼ゃ€?*/
/** 鐜╁鏀诲嚮鎬墿鏃讹紝鎬墿鎶ょ敳鏈€澶氬墛鍑忔湰娆″師浼ゅ鐨勬瘮渚嬨€?*/
export const MONSTER_ARMOR_MAX_REDUCTION_RATIO = 0.30;
/** 鎬墿鏀诲嚮鐜╁鏃讹紝鐜╁鎶ょ敳鏈€澶氬墛鍑忔湰娆″師浼ゅ鐨勬瘮渚嬨€?*/
export const PLAYER_ARMOR_MAX_REDUCTION_RATIO = 0.35;
/** 鐜╁杩炵画绔欐々鏃讹紝姣忓眰琚洿鏀诲鍔犵殑鎬墿鐩存帴鏀诲嚮浼ゅ銆?*/
export const STATIONARY_PRESSURE_DAMAGE_PER_STACK = 0.25;
/** 琚洿鏀绘渶澶у眰鏁般€?*/
export const STATIONARY_PRESSURE_MAX_STACKS = 3;
/** 姣忕珷鐗规畩鎬娆¤穼鐮磋鐢熷懡姣斾緥鏃惰Е鍙戜竴娆℃挙閫€銆?*/
export const SPECIAL_MONSTER_RETREAT_HP_RATIO = 0.5;
/** 鐗规畩鎬綆琛€鎾ら€€鐨勬渶澶хЩ鍔ㄦ牸鏁般€?*/
export const SPECIAL_MONSTER_RETREAT_STEPS = 3;

// 鈹€鈹€ 鐏垫皵锛坉esign 搂9锛?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
export const ANIMA_PROGRESS_CAP = 100;
export const ANIMA_THRESHOLD_MULTIPLIER = 1.35; // 姣忔瑙﹀彂鍚庨槇鍊?脳 姝ょ郴鏁帮紙V3 搂4b.1锛?.5鈫?.35锛屽欢缂撳悗鏈熸柇渚涳級
export const STRENGTHEN_CHOICES = 3; // 3 閫?1

// 鈹€鈹€ 鎴樻枟鍩虹鍊硷紙M1锛氬啋闄╄€呮棤姝﹀櫒鍩虹鏀诲嚮锛涜澶囧悗鍙犲姞锛?鈹€鈹€
export const BASE_ATTACK = 10; // M1 鍐掗櫓鑰呭熀纭€鏅敾锛埫?0 鍩哄噯锛屽師 1锛涘悗缁敱瑁呭/鑱屼笟璋冩暣锛?
export const BASE_ATTACK_RANGE = 1; // 鏇煎搱椤胯窛绂?1锛堢浉閭伙級

// 鈹€鈹€ 鎬墿锛坉esign 搂6锛?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
export const MONSTER_BASE = {
  NORMAL: { hp: 40, attack: 13, range: 1, aggroRadius: 3 },
  ANIMA: { hp: 30, attack: 0, range: 0, aggroRadius: 6 }, // 6 鏍兼劅鐭ワ細姣旀櫘閫氭€洿鏃╁療瑙夌帺瀹跺苟寮€濮嬮€冭窇
  ELITE: { hp: 80, attack: 20, range: 1, aggroRadius: 4 },
  BOSS: { hp: 300, attack: 30, range: 1, aggroRadius: 99 },
} as const;

// 鏅€氭€帀钀斤紙design 搂6锛夛細姒傜巼涓庡彂鏀鹃噺
export const NORMAL_MONSTER_DROP = {
  GOLD_ONLY: 0.5,
  ANIMA_ONLY: 0.25,
  GOLD_AND_ANIMA: 0.25,
  goldSmall: [5, 12] as const,
  animaSmall: [10, 25] as const,
} as const;

// 鈹€鈹€ 瑁呭鎺夎惤琛紙Phase 4锛屽崟娆℃幏楠?+ 绔犺妭灏侀《锛宒esign 搂5锛夆攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
// 姣忛」涓?[ch1, ch2, ch3, ch4, ch5] 姒傜巼锛涘垽瀹氶『搴?LEGENDARY鈫扙PIC鈫扲ARE鈫扚INE鈫扖OMMON锛涘叾浣?涓嶆帀瑁呭銆?
// 姗欙紙浼犲锛変粠绗?3 绔犺捣锛坈h3 寮€濮嬮潪闆讹級銆?

export const NORMAL_MONSTER_EQUIP_DROP_TABLE = {
  LEGENDARY: [0,          0,          0.000909091, 0.002170543, 0.003809524] as const,
  EPIC:      [0,          0,          0.004545455, 0.008139535, 0.012698413] as const,
  RARE:      [0,          0.008333333,0.013636364, 0.016279070, 0.019047619] as const,
  FINE:      [0.013333333,0.016666667,0.018181818, 0.021705426, 0.025396825] as const,
  COMMON:    [0.026666667,0.025,      0.022727272, 0.021705426, 0.019047619] as const,
} as const;

export const ELITE_MONSTER_EQUIP_DROP_TABLE = {
  LEGENDARY: [0,     0,          0.003448276, 0.006875,    0.010909091] as const,
  EPIC:      [0,     0,          0.020689655, 0.0275,      0.029090909] as const,
  RARE:      [0,     0.034615385,0.034482759, 0.034375,    0.036363636] as const,
  FINE:      [0.08,  0.055384615,0.041379310, 0.04125,     0.043636364] as const,
  COMMON:    [0,     0,     0,     0,     0    ] as const,
} as const;

export const CHEST_EQUIP_DROP_TABLE = {
  LEGENDARY: [0,     0,     0.002944785, 0.006506024, 0.007228916] as const,
  EPIC:      [0,     0,     0.019631902, 0.032530120, 0.036144578] as const,
  RARE:      [0,     0.03,  0.039263804, 0.043373494, 0.048192771] as const,
  FINE:      [0.04,  0.05,  0.049079755, 0.054216868, 0.060240964] as const,
  COMMON:    [0.08,  0.06,  0.049079754, 0.043373494, 0.048192771] as const,
} as const;

export const NORMAL_ARMOR_PENETRATION_BY_CHAPTER = [0, 0, 0.35, 0.40, 0.45, 0.50] as const;
export const ELITE_ARMOR_PENETRATION_BY_CHAPTER = [0, 0.25, 0.50, 0.55, 0.60, 0.65] as const;
export const BOSS_ARMOR_PENETRATION = 0.70;

// 鈹€鈹€ 姝讳骸缁撶畻淇濈暀/娓呯┖锛坉esign 搂2.1锛?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
/** 鍚屾椂鏈€澶氭縺娲荤殑閬楃墿妲芥暟锛圥hase 5锛孉C-EQ-8锛夈€?*/

// 鈹€鈹€ 绫诲瀷 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
export type ClassId = keyof typeof CLASS_STATS;
export type BossId = (typeof CHAPTER_BOSS)[keyof typeof CHAPTER_BOSS];

// 鈹€鈹€ M2 鎬墿鏁伴噺锛堟瘡鏅€氬眰锛宒esign 搂6 AC-18锛夆攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
export const ANIMA_MONSTER_COUNT = 1; // 鐏垫皵鎬細閫冭窇锛?00% 澶ч噺鐏垫皵
export const ELITE_MONSTER_COUNT = 1; // 绮捐嫳鎬細宸￠€烩啋杩藉嚮锛屾帀钀芥洿濂?

// 鈹€鈹€ M2 鐏垫皵鎬帀钀?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
export const ANIMA_MONSTER_DROP = {
  animaLarge: [40, 60] as const, // 100% 澶ч噺鐏垫皵
} as const;

// 鈹€鈹€ M2 绮捐嫳鎬帀钀斤紙design 搂6锛?0/30/15/10/5%锛夆攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
export const ELITE_MONSTER_DROP = {
  GOLD_ONLY: 0.40,
  GOLD_AND_ANIMA: 0.30,
  GOLD_HIGH: 0.25,     // 澶ч噺閲戝竵锛?0+30+25=95%锛?
  GOLD_HIGH_EXTRA: 0.05,
  goldMid: [15, 30] as const,
  goldHigh: [35, 60] as const,
  animaMid: [20, 40] as const,
} as const;

// 鈹€鈹€ Boss 鎺夎惤琛紙design 搂6 / Boss璁捐V1锛夆攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
// 涓夊眰缁撴瀯锛氶€氱敤蹇呮帀锛堥噾甯?鐏垫皵锛? 涓撳睘闅忔満 1 浠?+ 绋€鏈夌嫭绔嬪垽瀹氾紙鍛借繍纰庣墖/鍗疯酱/閬楃墿锛夈€?
// 鏁板€兼寜绔犺妭缂╂斁锛氱 1~5 绔犲€嶇巼 = [1, 1.2, 1.5, 1.8, 2.2]锛堜笌 bossChapterScaling 涓嶅悓锛屾帀钀芥洿绾挎€т互閬垮厤楂樼珷鑺傝祫婧愯繃搴﹂€氳儉锛夈€?

/** Boss 鎺夎惤鍩虹鏁板€硷紙绗?1 绔犲熀鍑嗭紝鎸?BOSS_DROP_CHAPTER_MULT 缂╂斁锛夈€?*/
export const BOSS_DROP_BASE = {
  /** 閫氱敤蹇呮帀锛氶噾甯佸熀纭€鍊笺€?*/
  goldBase: 100,
  /** 閫氱敤蹇呮帀锛氱伒姘斿熀纭€鍊笺€?*/
  animaBase: 30,
} as const;

/** Boss 鎺夎惤鏁板€肩殑绔犺妭缂╂斁鍊嶇巼锛?~5 绔狅級銆?*/
export const BOSS_DROP_CHAPTER_MULT = [1.0, 1.2, 1.5, 1.8, 2.2] as const;

/** Boss 稀有掉落：独立判定的额外楼层池装备。 */
export const BOSS_RARE_DROP = {
  /** Boss 额外掉落一层楼层固定池装备的概率（非 100%）。 */
  EXTRA_FLOOR_EQUIP_CHANCE: 0.30,
} as const;

/** 鎸夌珷鑺傝繑鍥?Boss 閫氱敤鎺夎惤鏁板€硷紙閲戝竵/鐏垫皵/鍛借繍纰庣墖锛夈€俢hapter 1-5锛岃秺鐣屽す绱с€?*/
export function bossDropScaled(chapter: number): { gold: number; anima: number } {
  const idx = Math.max(0, Math.min(chapter - 1, BOSS_DROP_CHAPTER_MULT.length - 1));
  const mult = BOSS_DROP_CHAPTER_MULT[idx];
  return {
    gold: Math.round(BOSS_DROP_BASE.goldBase * mult),
    anima: Math.round(BOSS_DROP_BASE.animaBase * mult),
  };
}

// 鈹€鈹€ Boss 涓撳睘鏈哄埗甯搁噺锛坉esign 搂11b锛夆攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
/** 娴佹矙宸ㄨ潕锛氭瘡闅斿灏戝洖鍚堟綔鍦颁竴娆°€?*/
export const QUICKSAND_SCORPION_BURROW_INTERVAL = 4;
/** 娴佹矙宸ㄨ潕锛氭瘡娆℃綔鍦板湪鐜╁闄勮繎鍔ㄦ€佺敓鎴愮殑娌欏潙鏁帮紙娴佹矙鎵╁紶锛岃揩浣垮畨鍏ㄥ尯杩佺Щ锛夈€?*/
export const QUICKSAND_SCORPION_DYNAMIC_PIT_PER_BURROW = 4;
/** 娴佹矙宸ㄨ潕锛氱媯鏆村悗姣忔娼滃湴鍦ㄧ帺瀹堕檮杩戝姩鎬佺敓鎴愮殑娌欏潙鏁般€?*/
export const QUICKSAND_SCORPION_DYNAMIC_PIT_PER_BURROW_ENRAGED = 5;
/** 娴佹矙宸ㄨ潕锛氬姩鎬佹矙鍧戝瓨缁洖鍚堟暟锛坮emaining锛屽埌 0 鑷姩绉婚櫎锛涢潤鎬佹矙鍧戞棤姝ゅ€硷紝姘镐箙锛夈€?*/
export const QUICKSAND_SCORPION_DYNAMIC_PIT_DURATION = 9;
/** 娴佹矙宸ㄨ潕锛欻P 鍗犳瘮 鈮?姝ゅ€兼椂杩涘叆鐙傛毚锛堟綔鍦伴棿闅旂缉鐭€佹矙鏆磋寖鍥存墿澶э級銆?*/
export const QUICKSAND_SCORPION_ENRAGE_HP_RATIO = 0.4;
/** 娴佹矙宸ㄨ潕锛氱媯鏆村悗娼滃湴闂撮殧锛堥潪鐙傛毚瑙?QUICKSAND_SCORPION_BURROW_INTERVAL=4锛夈€?*/
export const QUICKSAND_SCORPION_BURROW_INTERVAL_ENRAGED = 3;
/** 娴佹矙宸ㄨ潕锛氭綔鍦版椂娌欐毚闅忔満瑕嗙洊鏍兼暟锛堥潪鐙傛毚锛夈€?*/
export const QUICKSAND_SCORPION_SANDSTORM_CELLS = 7;
/** 娴佹矙宸ㄨ潕锛氱媯鏆村悗娌欐毚闅忔満瑕嗙洊鏍兼暟銆?*/
export const QUICKSAND_SCORPION_SANDSTORM_CELLS_ENRAGED = 9;
/** 娴佹矙宸ㄨ潕锛氭矙鏆村懡涓帺瀹舵墍鍦ㄦ牸閫犳垚鐨勭湡瀹炰激瀹筹紙鏃犺鎶ょ敳锛屼笉鍙楀父瑙勬敾鍑?10 鐐逛笅闄愰檺鍒讹級銆?*/
export const QUICKSAND_SCORPION_SANDSTORM_DAMAGE = 20;
/** 鍐伴湝宸ㄤ汉锛氭瘡闅斿灏戝洖鍚堥摵涓€娆″啺闈紙澶嶇敤鍘熷啺鍐婚棿闅旓級銆?*/
export const FROST_GIANT_FREEZE_INTERVAL = 4;
/** 鍐伴湝宸ㄤ汉锛氬啺闈互鐜╁涓轰腑蹇冮摵寮€鐨勬浖鍝堥】鍗婂緞锛? 鈫?銆?銆嶅瓧 5 鏍硷級銆?*/
export const FROST_GIANT_ICE_RADIUS = 1;
/** 鍐伴湝宸ㄤ汉锛氬啺闈㈠瓨缁洖鍚堟暟锛坮emaining 鍊掕鏃惰瀺鍖栵級銆?*/
export const FROST_GIANT_ICE_DURATION = 2;
/** 鍐伴湝宸ㄤ汉锛氭櫘閫氭敾鍑诲懡涓帺瀹跺彔鍔?1 灞傚瘨姘旓紝杈惧埌姝ゅ眰鏁拌Е鍙戝喕缁撳苟褰掗浂銆?*/
export const FROST_GIANT_CHILL_STACKS_TO_FREEZE = 3;
/** 鍐伴湝宸ㄤ汉锛氬喕缁撶姸鎬佷笅鐜╁闇€涓诲姩鏀诲嚮锛坧layerAttack/attackIceWall锛夊灏戞鎵嶈兘瑙ｉ櫎鍐荤粨銆?*/
export const FROST_GIANT_FREEZE_ATTACKS_TO_BREAK = 3;
/** 鍐伴湝宸ㄤ汉锛氬喕缁撴椂鍦ㄧ帺瀹跺懆鍥寸敓鎴愮殑 FREEZE_WALL 鏁伴噺锛堣В闄ゆ椂涓€骞剁Щ闄わ級銆?*/
export const FROST_GIANT_FREEZE_WALL_COUNT = 2;
/** 鍐伴湝宸ㄤ汉锛氭瘡闅斿灏戜釜鎬墿鍥炲悎瑙﹀彂涓€娆″啺闇滈噸鍑伙紙AOE锛屼互 boss 鑷韩涓轰腑蹇冿級銆?*/
export const FROST_GIANT_HEAVY_STRIKE_INTERVAL = 3;
/** 鍐伴湝宸ㄤ汉锛氬啺闇滈噸鍑?AOE 鏇煎搱椤垮崐寰勶紙浠?boss 鑷韩涓轰腑蹇冿級銆?*/
export const FROST_GIANT_HEAVY_STRIKE_RADIUS = 2;
/** 鍐伴湝宸ㄤ汉锛氬啺闇滈噸鍑诲懡涓帺瀹跺悗娌?boss鈫掔帺瀹舵柟鍚戝嚮閫€鐨勮窛绂伙紙鏍硷級銆?*/
export const FROST_GIANT_KNOCKBACK_DISTANCE = 1;
/** 鍐伴湝宸ㄤ汉锛氬嚮閫€钀界偣涓哄啺闈㈡椂锛屾粦琛岀粨鏉熷悗棰濆閫犳垚鐨勫浐瀹氫激瀹炽€?*/
export const FROST_GIANT_ICE_SLIDE_DAMAGE = 30;
/** 鍐伴湝宸ㄤ汉锛欼CE_WALL/FREEZE_WALL 琚嚮纰庡悗锛屽洓鍛ㄧ敓鎴愮殑 SHATTERED_ICE 瀛樼画鍥炲悎鏁般€?*/
export const FROST_GIANT_SHATTERED_ICE_DURATION = 5;
/** 鍐伴湝宸ㄤ汉锛氱帺瀹惰俯鍏?SHATTERED_ICE 閫犳垚鐨勫浐瀹氫激瀹筹紙鍛戒腑鍚庤鏍肩珛鍗虫秷鑰楋級銆?*/
export const FROST_GIANT_SHATTERED_ICE_DAMAGE = 30;
/** 鍐伴湝宸ㄤ汉锛欻P 鍗犳瘮 鈮?姝ゅ€兼椂杩涘叆鐙傛毚锛屽紑鍚€岄璀︹啋鍐查攱銆嶅惊鐜紙鏇夸唬鍐伴湝閲嶅嚮锛夈€?*/
export const FROST_GIANT_ENRAGE_HP_RATIO = 0.4;
/** 鍐伴湝宸ㄤ汉锛氱媯鏆村啿閿嬪懡涓帺瀹舵椂鐨勪激瀹冲€嶇巼銆?*/
export const FROST_GIANT_CHARGE_DAMAGE_MULT = 2;
/** 鍐伴湝宸ㄤ汉锛氱媯鏆村啿閿嬭溅閬撳崐瀹斤紙2 => 鎬诲 5 鏍硷級銆?*/
export const FROST_GIANT_CHARGE_LANE_HALF_WIDTH = 2;
/** 鍐伴湝宸ㄤ汉锛氱媯鏆村啿閿嬫湭鍛戒腑鐜╁鏃讹紝鍦ㄧ帺瀹堕檮杩戠敓鎴愮殑鍐板鏁伴噺銆?*/
export const FROST_GIANT_CHARGE_MISS_ICE_WALLS = 2;
/** 鐔斿博棰嗕富锛氭瘡娆℃敾鍑婚檮鍔犵伡鐑?tick 鏁帮紙姣?tick = 10 HP锛屾瘡鍥炲悎娑堣€?1 tick锛夈€?*/
export const LAVA_LORD_BURN_TICKS = 3;
/** 鍛借繍瀹堝崼锛氱帺瀹?HP 鍗?maxHp 姣斾緥澶т簬姝ゅ€兼椂瀹堝崼浼ゅ 脳 2銆?*/
export const FATE_GUARDIAN_HP_THRESHOLD = 0.5;
/** 鍛借繍瀹堝崼锛氭瘡闅斿灏戝洖鍚堟爣璁颁竴娆″懡杩愰瑷€锛堜笅涓?Boss 鍥炲悎璇ュ尯鍩熺垎鐐革級銆?*/
export const FATE_PROPHECY_INTERVAL = 3;
/** 鍛借繍瀹堝崼锛氶瑷€鐖嗙偢鑼冨洿锛圕hebyshev 鍗婂緞锛? 鈫?3脳3锛夈€?*/
export const FATE_PROPHECY_RADIUS = 1;
/** 鍛借繍瀹堝崼锛氶瑷€鐖嗙偢浼ゅ = boss.attack 脳 璇ョ郴鏁帮紙鍙栨暣锛夈€?*/
export const FATE_PROPHECY_DAMAGE_MULT = 1.0;

// 鈹€鈹€ 绁潧鐏垫皵濂栧姳鑼冨洿锛坉esign 搂3 涓€у尯鍩燂級鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
/** 绁潧锛氭瘡娆′娇鐢ㄩ殢鏈鸿幏寰楃伒姘旂殑鏈€灏忓€笺€?*/
export const ALTAR_ANIMA_MIN = 20;
/** 绁潧锛氭瘡娆′娇鐢ㄩ殢鏈鸿幏寰楃伒姘旂殑鏈€澶у€笺€?*/
export const ALTAR_ANIMA_MAX = 35;

// 鈹€鈹€ 閾佸尃鏈嶅姟璐圭敤锛坉esign 搂3 涓€у尯鍩燂級鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
/** 閾佸尃寮哄寲鍩虹璐圭敤锛堟瘡娆″疄闄呰垂鐢?= BASE 脳 upgradeStep 脳 (enhanceLevel + 1)锛屾寜鍝佽川鍒嗙骇閫掑锛夈€?*/
export const BLACKSMITH_UPGRADE_COST = 20;
/** 寮哄寲浠庣鍑犵骇璧峰紑濮嬫湁澶辫触姒傜巼锛?5 = 10%锛?6 = 15%锛屾瘡绾?+5%锛屼笂闄?80%锛夈€?*/
export const BLACKSMITH_FAIL_THRESHOLD = 5;
export const BLACKSMITH_FAIL_BASE = 0.10;
export const BLACKSMITH_FAIL_STEP = 0.05;
export const BLACKSMITH_FAIL_CAP = 0.80;
/**
 * 閾佸尃寮哄寲姣忔鎻愬崌 baseStat 鐨勫閲忥紝鎸夎澶囧搧璐ㄥ垎绾э紙脳10 鍩哄噯锛夈€?
 * WEAPON / ARMOR / HELMET 浣跨敤姝よ〃锛汼HOES / TRINKET 鍥哄畾 +1銆?
 * 绀轰緥锛欳OMMON 姝﹀櫒锛堝熀纭€10锛夋瘡娆?1锛汧INE锛堝熀纭€20锛夋瘡娆?2锛汱EGENDARY锛堝熀纭€80锛夋瘡娆?8銆?
 */
export const BLACKSMITH_ENHANCE_STEP: Record<string, number> = {
  COMMON:    1,
  FINE:      2,
  RARE:      3,
  EPIC:      5,
  LEGENDARY: 8,
};

// ── 第2-5章 Boss 专属机制常量（260613 内容深化）────────────────
/** 绗?绔?QuicksandScorpion Boss 鎴块潤鎬佹矙鍧戞暟閲忥紙寮€鎴挎椂鍒凤紝姘镐箙锛涢捇鍦颁紭鍏堝嚭鐩搁偦娌欏潙浣嶏級銆?*/
export const CHAPTER2_SAND_PIT_COUNT = 8;
/** 娌欏潙绉诲姩 AP 棰濆娑堣€楋紙鍙犲姞鍦ㄥ熀纭€ MOVE 涓婏紱闈欐€?鍔ㄦ€佹矙鍧戝叡鐢級銆?*/
export const CHAPTER2_SAND_PIT_MOVE_PENALTY = 2;
/** 绗?绔?FrostGiant Boss 鎴垮啺澧欐暟閲忋€?*/
export const CHAPTER3_ICE_WALL_COUNT = 3;
/** 鍐板 HP锛堢帺瀹跺彲鏀诲嚮鐮村潖锛孒P=0 鏃舵秷澶卞苟鎺夌伒姘旓級銆?*/
export const CHAPTER3_ICE_WALL_HP = 100;
/** 鍐板鐮村潖鏃舵帀钀界伒姘斻€?*/
export const CHAPTER3_ICE_WALL_DROP_ANIMA = 2;
/** 鍐板窛濉戝舰鑰呭吋瀹瑰埆鍚嶏細褰撳墠鎵€鏈夌涓夌珷 ICE_WALL 缁熶竴浣跨敤 CHAPTER3_ICE_WALL_HP銆?*/
export const GLACIER_SHAPER_ICE_WALL_HP = CHAPTER3_ICE_WALL_HP;
/** 鍐板窛濉戝舰鑰咃細姣忔鎶€鑳芥渶澶氬崌璧风殑姘镐箙鍐板鏁伴噺銆?*/
export const GLACIER_SHAPER_WALLS_PER_CAST = 3;
/** 鍐板窛濉戝舰鑰呭吋瀹瑰埆鍚嶏細褰撳墠鎵€鏈夌涓夌珷 ICE_WALL 缁熶竴浣跨敤 CHAPTER3_ICE_WALL_DROP_ANIMA銆?*/
export const GLACIER_SHAPER_ICE_WALL_DROP_ANIMA = CHAPTER3_ICE_WALL_DROP_ANIMA;
/** 姣忓眰閫氳繃鍑荤鍐板鏈€澶氳幏寰楃殑鐏垫皵锛岄槻姝㈠埛澧欏吇鎴愩€?*/
export const GLACIER_SHAPER_ICE_WALL_FLOOR_ANIMA_CAP = 12;
/** 绗?绔?LavaLord 闃舵浜岋細瀹氬悜鐔斿博娼睈姣忛殧澶氬皯 Boss 鍥炲悎鎺ㄨ繘涓€鎺掞紙2026-06-15 鐢?闅忔満鎾掔偣"閲嶅仛涓?瀹氬悜鏁存帓"锛夈€?*/
export const CHAPTER4_LAVA_TIDE_INTERVAL = 3;
/** 瀹氬悜鐔斿博娼睈鏈€澶氭帹杩涚殑鎺掓暟锛堣揪鍒板悗鍋滄鎺ㄨ繘锛屽凡鐢熸垚鏍煎瓙姘镐箙淇濈暀锛夈€?*/
export const CHAPTER4_LAVA_TIDE_ROW_MAX = 3;
/** 鐜╁韪╁叆鐔斿博鍦板潡鐨勪激瀹筹紙姣忓洖鍚堝紑濮嬬粨绠楋紝鍚案涔呯啍宀╂牸锛夈€?*/
export const CHAPTER4_LAVA_TILE_DAMAGE = 5;
/** LavaLord phase2 瑙﹀彂鐨?HP 姣斾緥闃堝€笺€?*/
export const CHAPTER4_LAVA_LORD_PHASE2_HP_RATIO = 0.5;
/** 闃舵涓€銆屽柗鍙戦璀︺€嶏細姣忛殧澶氬皯鍥炲悎鏍囪涓€娆″柗鍙戝尯鍩熴€?*/
export const LAVA_LORD_ERUPTION_INTERVAL = 3;
/** 鍠峰彂缁撶畻鐢熸垚鐨勭啍宀╁湴鍧楀瓨缁洖鍚堟暟銆?*/
export const LAVA_LORD_ERUPTION_DURATION = 3;
/** 鐔旀牳鐖嗚锛氱帺瀹剁伡鐑у眰鏁拌揪鍒拌闃堝€兼椂寮哄埗瑙﹀彂銆?*/
export const LAVA_LORD_BURN_BURST_THRESHOLD = 6;
/** 鐔旀牳鐖嗚锛氭瘡灞傜伡鐑ч€犳垚鐨勭湡瀹炰激瀹炽€?*/
export const LAVA_LORD_BURN_BURST_DAMAGE_PER_STACK = 5;
/** 鐔旀牳鐖嗚锛氱帺瀹跺懆鍥寸敓鎴愮殑鐔斿博鍦板潡瀛樼画鍥炲悎鏁般€?*/
export const LAVA_LORD_BURN_BURST_TILE_DURATION = 3;
/** 鐔斿博閿侀摼锛氱帺瀹朵笌 Boss 璺濈杈惧埌璇ュ€兼椂鐩存帴瑙﹀彂锛堟棤闇€绱鍥炲悎锛夈€?*/
export const LAVA_LORD_CHAIN_DISTANCE_THRESHOLD = 4;
/** 鐔斿博閿侀摼锛氱帺瀹惰繛缁灏戝洖鍚堟湭涓?Boss 鐩搁偦鏃惰Е鍙戙€?*/
export const LAVA_LORD_CHAIN_TURN_THRESHOLD = 3;
/** 鐔斿博閿侀摼鍛戒腑鏃堕檮鍔犵殑鐏肩儳灞傛暟銆?*/
export const LAVA_LORD_CHAIN_BURN_TICKS = 2;
/** Boss 绔欏湪鐔斿博鍦板潡涓婃椂锛屾櫘閫氭敾鍑诲姏鍔犳垚銆?*/
export const LAVA_LORD_LAVA_STAND_ATTACK_BONUS = 1;
/** Boss 绔欏湪鐔斿博鍦板潡涓婃椂锛屽彈鍒扮帺瀹朵激瀹崇殑鍑忓厤姣斾緥銆?*/
export const LAVA_LORD_LAVA_STAND_DAMAGE_REDUCTION = 0.2;
/** 鍛借繍瀹堝崼锛氳涓洪暅鍍忕敓鎴?HP 姣斾緥闃堝€硷紙Boss HP 璺ㄨ繃 50% 鏃剁敓鎴?1 娆★級銆?*/
export const FATE_MIRROR_SPAWN_HP_RATIO = 0.5;
/** 鍛借繍瀹堝崼锛氶暅鍍?HP = 鐜╁褰撳墠 HP 脳 璇ョ郴鏁帮紙璇炵敓鐬棿蹇収锛夈€?*/
export const FATE_MIRROR_HP_FROM_PLAYER = 0.5;
/** 鍛借繍瀹堝崼锛氶暅鍍忔敾鍑?= 鐜╁褰撳墠 attack 脳 璇ョ郴鏁帮紙璇炵敓鐬棿蹇収锛夈€?*/
export const FATE_MIRROR_ATK_FROM_PLAYER = 0.5;
/** 鍛借繍瀹堝崼锛氶暅鍍忓弽鎵撴敾鍑绘浖鍝堥】璺濈涓婇檺锛? 姝ゅ€肩┖鎸ワ級銆?*/
export const FATE_MIRROR_ATTACK_RANGE = 2;
/** 鍛借繍闀滃儚 bossId锛堢敤浜?stepBoss / mirrorBehaviorStep 鍖哄垎闀滃儚涓庢湰浣擄級銆?*/
export const FATE_MIRROR_BOSS_ID = 'FATE_MIRROR';
/** 鍛借繍瀹堝崼锛欻P 璺ㄨ繃姝ゆ瘮渚?鈫?杩涘叆鐙傛毚鎬侊紙娓呯┖棰勮█銆佸紑鍚敼鍐欏懡杩愬懆鏈燂級銆?*/
export const FATE_ENRAGE_HP_RATIO = 0.3;
/** 鍛借繍瀹堝崼锛氱媯鏆存€佹瘡澶氬皯涓€墿鍥炲悎瑙﹀彂涓€娆°€屾敼鍐欏懡杩愩€嶉鍛娿€?*/
export const DESTINY_REWRITE_INTERVAL = 4;
/** 鍛借繍瀹堝崼锛氭敼鍐欏懡杩愪簨浠舵睜澶у皬锛圗1-E5锛夈€?*/
export const DESTINY_REWRITE_POOL_SIZE = 5;
/** 鍛借繍瀹堝崼锛氭敼鍐欏懡杩愭瘡娆℃娊鍙栫殑浜嬩欢鏁帮紙鐜╁浼氫粠涓純 1锛屽墿浣?2 鐢熸晥锛夈€?*/
export const DESTINY_REWRITE_DRAW_SIZE = 3;
/** 鍛借繍瀹堝崼锛欵1 Boss 鍥炶閲?= maxHp 脳 璇ョ郴鏁般€?*/
export const DESTINY_HEAL_RATIO = 0.05;
/** 鍛借繍瀹堝崼锛欵2 Boss 鍔犱激瀹崇櫨鍒嗘瘮锛堟櫘鏀?/ 闀滃儚鏀诲嚮 / 5脳5 閮藉悆锛夈€?*/
export const DESTINY_ATK_BUFF_PCT = 30;
/** 鍛借繍瀹堝崼锛欵2 Boss 鍔犱激瀹虫寔缁€墿鍥炲悎鏁般€?*/
export const DESTINY_ATK_BUFF_DURATION_TURNS = 3;
/** 鍛借繍瀹堝崼锛欵3 鐜╁鎵ｈ浼ゅ = boss.attack 脳 璇ョ郴鏁帮紙鏃犺闃插尽锛夈€?*/
export const DESTINY_DIRECT_DMG_MULT = 1.0;
/** 鍛借繍瀹堝崼锛欵4 5脳5 鐖嗙偢鍒囨瘮闆か鍗婂緞锛? 鈫?5脳5锛夈€?*/
export const DESTINY_5X5_RADIUS = 2;
/** 鍛借繍瀹堝崼锛欵4 5脳5 鐖嗙偢浼ゅ = boss.attack 脳 璇ョ郴鏁帮紙涓績 = Boss 褰撳墠鏍硷級銆?*/
export const DESTINY_5X5_DMG_MULT = 1.2;

// 鈹€鈹€ 绗竴绔犱笓灞炴満鍒跺父閲?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
/** 绗竴绔?Boss 鎴块殢鏈虹煶鍧楁暟閲忋€?*/
export const CHAPTER1_BOSS_ROCK_COUNT = 5;
/** 鐭冲潡 HP锛堝彲鐮村潖锛岀帺瀹舵櫘鏀诲彲鍑荤锛夈€?*/
export const ROCK_HP = 350;
/** 澧炴彺鍙疯姣忔鍙敜鍝ュ竷鏋楁垬澹暟锛堥潪鐙傛毚锛夈€?*/
export const HORN_WARRIOR_COUNT = 1;
/** 澧炴彺鍙疯姣忔鍙敜鍝ュ竷鏋楁垬澹暟锛堢媯鏆村悗锛夈€?*/
export const HORN_WARRIOR_ENRAGE_COUNT = 2;
/** 鍝ュ竷鏋楅厠闀垮満涓婂悓鏃跺厑璁稿瓨鍦ㄧ殑鍙疯鍙敜鍏典笂闄愶紝鐢ㄤ簬闃叉涔呮垬鏃舵€墿鏁伴噺澶辨帶銆?*/
export const GOBLIN_CHIEF_SUMMON_CAP = 8;
/** 鍐伴湝鍝ュ竷鏋楀啺闇滐細绉诲姩AP+1鐨勬寔缁洖鍚堟暟锛堝彲鍙犲姞锛夈€?*/
export const FROST_MOVE_PENALTY_ROUNDS = 2;
/** 璧ょ値鍝ュ竷鏋楃伡鐑э細5HP/鍥炲悎鐨勬寔缁洖鍚堟暟锛堝彲鍙犲姞锛夈€?*/
export const FIRE_BURN_ROUNDS = 2;

// 鈹€鈹€ 绗?2-5 绔犳櫘閫?绮捐嫳鎬柊琛屼负甯搁噺锛圥1锛夆攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
/** 姣掕潕涓瘨锛氭瘡鍥炲悎浼ゅ鍊笺€?*/
export const POISON_DAMAGE_PER_ROUND = 8;
/** 娌欐紶璺冭湧棣栨瑙﹀彂鏂熬鐙傝穬鐨勭敓鍛芥瘮渚嬨€?*/
export const DESERT_HOPPER_FRENZY_HP_RATIO = 0.5;
/** 娌欐紶璺冭湧鏂熬鐙傝穬鍚庝笅涓€娆℃垚鍔熸敾鍑诲€嶇巼銆?*/
export const DESERT_HOPPER_FRENZY_ATTACK_MULT = 2;
/** 鍐板埡璞尓鍙嶅脊鐜╁鐩存帴鏀诲嚮鏈€缁堜激瀹崇殑姣斾緥銆?*/
export const FROSTSPIKE_PORCUPINE_REFLECT_RATIO = 0.2;
/** 鐏扮儸鐚庣姮绔欏湪鐔斿博鍦板潡涓婃椂鐨勬敾鍑诲€嶇巼銆?*/
export const ASH_HOUND_LAVA_ATTACK_MULT = 1.2;
/** 姣掕潕涓瘨锛氬懡涓帺瀹跺悗鐨勬寔缁洖鍚堟暟锛堜笉鍙犲姞锛屽埛鏂拌鏃讹級銆?*/
export const POISON_ROUNDS = 3;

// 鈹€鈹€ 绗?2-5 绔犵伒姘旀€笓灞炴満鍒跺父閲忥紙260616 鐏垫皵鎬樊寮傚寲鍗囩骇锛夆攢鈹€鈹€鈹€鈹€
/** 鐏垫皵鐢茶櫕锛圕H2锛夛細閫冭窇绂诲紑鏍肩暀涓嬫矙鍧戯紝瀛樼画鍥炲悎鏁般€?*/
export const ANIMA_BEETLE_TRAP_DURATION = 8;
/** 鐏甸湝闆厰锛圕H3锛夛細閫冭窇绂诲紑鏍肩暀涓嬪啺闈紝瀛樼画鍥炲悎鏁般€?*/
export const ANIMA_ELF_TRAP_DURATION = 6;
/** 鐏垫皵鐐庨瓊锛圕H4锛夛細鐜╁鍑绘潃鏃跺湪鍗佸瓧 4 鏍肩敓鎴愮殑鐔斿博瀛樼画鍥炲悎鏁般€?*/
export const ANIMA_EMBER_LAVA_DURATION = 3;
/** 鐏垫皵骞昏薄锛圕H5锛塀uff/Debuff 姹?id锛氶殢鏈轰竴椤圭珛鍗崇敓鏁堛€?*/
export const ANIMA_MIRAGE_BUFF_IDS = ['HEAL_30', 'AP_PLUS_3', 'ANIMA_PLUS_60', 'GOLD_PLUS_60', 'ATTACK_UP'] as const;
export const ANIMA_MIRAGE_DEBUFF_IDS = ['HURT_20', 'FIRE_BURN_2', 'SLOW_2', 'AP_MINUS_3', 'ANIMA_PROGRESS_MINUS_30'] as const;
export type AnimaMirageBuffId = (typeof ANIMA_MIRAGE_BUFF_IDS)[number];
export type AnimaMirageDebuffId = (typeof ANIMA_MIRAGE_DEBUFF_IDS)[number];

/** 鎸¤绾跨殑鍦板舰绫诲瀷锛堝浣撳瀷锛涘湴闈㈠瀷 SAND_PIT / ICE_TILE / LAVA_TILE 涓嶆尅锛孉C-MT-5锛夈€?*/
export const BLOCKS_LOS_TYPES = new Set(['ROCK', 'ICE_WALL', 'FREEZE_WALL']);

// 鈹€鈹€ 鏅€氬眰鍦板舰鐢熸垚锛坰pecs/260629-map-terrain Phase 1锛夆攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
/** 姣忕珷鏅€氬眰涓诲湴褰㈢被鍨嬶紙绗?绔犳部鐢ㄧ煶鍧椾綔璧颁綅闅滅锛夈€?*/
export const NORMAL_FLOOR_TERRAIN_TYPE = {
  1: 'ROCK',
  2: 'SAND_PIT',
  3: 'ICE_WALL',
  4: 'LAVA_TILE',
  5: 'ROCK',
} as const;

/** 绗?绔犳櫘閫氬眰棰濆閾鸿鍐伴潰鏁伴噺锛圛CE_TILE锛岄潪闃绘尅锛屽紩鍙戞粦琛岃蛋浣嶏級銆?*/
export const CHAPTER3_NORMAL_ICE_TILE_COUNT = 2;

/**
 * 鏅€氬眰鍦板舰鏁伴噺鍖洪棿 [min, max]锛屾寜绔犲唴灞傚彿锛?-6锛涚7灞傛槸 Boss锛屼笉璧版琛級銆?
 * 鑺傛媿锛?-2 鎺㈢储閾哄灚锛堢█鐤忥級鈫?3 绮捐嫳鍏筹紙涓瓑锛夆啋 4-6 鏈哄叧涓诲満锛堝瘑闆嗭級銆?
 */
export const NORMAL_FLOOR_TERRAIN_COUNT: Readonly<Record<number, readonly [number, number]>> = {
  1: [3, 5],
  2: [3, 5],
  3: [5, 7],
  4: [8, 12],
  5: [8, 12],
  6: [8, 12],
};

// 鈹€鈹€ 浠呭紑鍙戣皟璇曪紙姝ｅ紡鏋勫缓鍓嶅繀椤荤疆 0锛夆攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
/**
 * 鑷姩璺宠嚦鐩爣灞傦紙0 = 鍏抽棴锛夈€?
 * 灏嗘鍊兼敼涓洪潪闆舵暣鏁帮紙渚嬪 5锛夊悗閲嶆柊鏋勫缓锛屽紑灞€灏嗙洿鎺ヨ烦鍒拌灞傘€?
 * 鈿狅笍 姝ｅ紡鏋勫缓 / 鎻愭祴鍓嶅繀椤绘敼鍥?0锛佸悓鏃剁‘璁や笂闈㈢殑 INITIAL_HP 涓烘寮忕洰鏍囧€笺€?
 */
export const DEV_SKIP_TO_FLOOR = 0;

/** 绗?floor 灞傦紙1-based锛夋墍灞炵珷鑺傦紙1-based锛夈€?*/
export function chapterOfFloor(floor: number): number {
  return Math.floor((floor - 1) / FLOORS_PER_CHAPTER) + 1;
}

/** 绗?floor 灞傛槸鍚︿负绔犺妭 Boss 灞傦紙姣忕珷绗?FLOORS_PER_CHAPTER 灞傦紝褰撳墠=7锛夈€?*/
export function isBossFloor(floor: number): boolean {
  return floor % FLOORS_PER_CHAPTER === 0;
}

/** 绗?floor 灞傚湴鍥捐竟闀裤€?*/
export function mapSizeOfFloor(floor: number): number {
  if (isBossFloor(floor)) return MAP_SIZE.BOSS;
  return chapterOfFloor(floor) >= 3 ? MAP_SIZE.HIGH : MAP_SIZE.NORMAL;
}

/** 鎸夌珷鑺傝繑鍥炴櫘閫?绮捐嫳/鐏垫皵鎬睘鎬у€嶇巼锛圚P / 鏀诲嚮锛夛紝chapter 1-5锛岀珷鑺傚澶圭揣鍒拌竟鐣屻€?
 *  鏃у€硷細1.0鈫?.4鈫?.0鈫?.8鈫?.8锛涙柊鍊煎ぇ骞呮媺闄′娇鍚庢湡鎬墿鐪熸鏋勬垚濞佽儊銆?
 */
export function chapterScaling(chapter: number): { hpMult: number; attackMult: number } {
  const SCALING = [
    { hpMult: 1.0, attackMult: 1.0 },
    { hpMult: 1.8, attackMult: 1.8 },
    { hpMult: 3.0, attackMult: 3.0 },
    { hpMult: 5.0, attackMult: 5.0 },
    { hpMult: 8.0, attackMult: 8.0 },
  ] as const;
  const idx = Math.max(0, Math.min(chapter - 1, SCALING.length - 1));
  return SCALING[idx];
}

/** 鎸夌珷鑺傝繑鍥?Boss 涓撳睘灞炴€у€嶇巼锛圚P / 鏀诲嚮锛夛紝chapter 1-5锛岀珷鑺傚澶圭揣鍒拌竟鐣屻€?
 *  HP 澶у箙涓婅皟淇濊瘉 Boss 鎴樻湁瓒冲鍥炲悎鏁帮紱鏀诲嚮涓婅皟骞呭害杈冪紦锛屼繚鐣欏彲鐜╀綑鍦般€?
 */
export function bossChapterScaling(chapter: number): { hpMult: number; attackMult: number } {
  const SCALING = [
    { hpMult: 2.2,  attackMult: 1.5 },
    { hpMult: 5.6,  attackMult: 2.5 },
    { hpMult: 12.0, attackMult: 3.5 },
    { hpMult: 17.0, attackMult: 5.0 },
    { hpMult: 23.0, attackMult: 7.0 },
  ] as const;
  const idx = Math.max(0, Math.min(chapter - 1, SCALING.length - 1));
  return SCALING[idx];
}
export const PVE_STAMINA_MAX = 60;
export const PVE_STAMINA_CHALLENGE_COST = 5;
export const PVE_STAMINA_RECOVERY_MS = 5 * 60 * 1000;

// 鈹€鈹€ 闅惧害妗ｏ紙design 260628-progression-pacing-v3 搂5锛屸啋 AC-P3-6/7/9锛?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
/** 闅惧害妗ｆ灇涓撅紙涓庝簯绔?PVE_DIFFICULTY 闀滃儚涓€鑷达級銆?*/
export const DIFFICULTY_TIER = {
  NORMAL:    'NORMAL',
  HARD:      'HARD',
  NIGHTMARE: 'NIGHTMARE',
  ABYSS:     'ABYSS',
  INFERNO:   'INFERNO',
} as const;
export type DifficultyTier = typeof DIFFICULTY_TIER[keyof typeof DIFFICULTY_TIER];

/** 闅惧害妗ｈВ閿侀『搴忥紙绱㈠紩 = 鏁板€肩骇鍒紝涓庝簯绔?PVE_DIFFICULTY_ORDER 淇濇寔涓€鑷达級銆?*/
export const DIFFICULTY_ORDER: readonly DifficultyTier[] = [
  'NORMAL', 'HARD', 'NIGHTMARE', 'ABYSS', 'INFERNO',
];

/**
 * 鍚勯毦搴︽。鎬墿 HP/鏀诲嚮鍊嶇巼涓庡懡杩愮鐗囩粨绠楀€嶇巼锛堜笌浜戠 PVE_DIFFICULTY_MULTIPLIERS 闀滃儚涓€鑷达級銆?
 * - hpMult / atkMult锛氫綔鐢ㄤ簬鐢熸垚鎬墿鐨勭珷鑺傜缉鏀剧粨鏋滐紙鍐荤粨杩涘瓨妗ｏ紝鈫?AC-P3-9锛?
 * - shardMult锛氫綔鐢ㄤ簬缁撶畻浜у嚭鍛借繍纰庣墖锛堜簯绔潈濞佽绠楋紝鈫?AC-P3-9锛?
 */
export const DIFFICULTY_MULTIPLIERS: Record<DifficultyTier, { hpMult: number; atkMult: number; shardMult: number }> = {
  NORMAL:    { hpMult: 1.00, atkMult: 1.00, shardMult: 1.00 },
  HARD:      { hpMult: 1.10, atkMult: 1.05, shardMult: 1.15 },
  NIGHTMARE: { hpMult: 1.20, atkMult: 1.10, shardMult: 1.30 },
  ABYSS:     { hpMult: 1.35, atkMult: 1.18, shardMult: 1.50 },
  INFERNO:   { hpMult: 1.50, atkMult: 1.25, shardMult: 1.75 },
};

/** 闅惧害蹇収锛堝喕缁撹繘瀛樻。锛涚画妗ｆ椂浠庡瓨妗ｈ鍙栵紝涓嶅彲琚悗缁厤缃彉鍖栧奖鍝嶏紝鈫?AC-P3-9锛夈€?*/
export interface DifficultySnapshot {
  tier: DifficultyTier;
  hpMult: number;
  atkMult: number;
  shardMult: number;
}

/** 浠庨毦搴︽。鏋氫妇鍒涘缓蹇収瀵硅薄锛坰tartExpedition 鏃惰皟鐢ㄥ苟鍐欏叆 ExpeditionState锛夈€?*/
export function makeDifficultySnapshot(tier: DifficultyTier = 'NORMAL'): DifficultySnapshot {
  const m = DIFFICULTY_MULTIPLIERS[tier] ?? DIFFICULTY_MULTIPLIERS.NORMAL;
  return { tier, ...m };
}
