// PVE銆屽懡杩愯繙寰併€嶆牳蹇冩暟鎹ā鍨嬩笌浜嬩欢绫诲瀷銆?
// 绾被鍨?鏁版嵁锛岄浂妗嗘灦渚濊禆銆備笉鐢?enum锛岀粺涓€瀛楅潰閲忚仈鍚堢被鍨嬨€?

import type { ClassId } from './PveConstants';

// 鈹€鈹€ 鍑犱綍 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
export interface Coord {
  x: number;
  y: number;
}

// 鈹€鈹€ 瀹炰綋 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
export type MonsterType = 'NORMAL' | 'ANIMA' | 'ELITE' | 'BOSS';

export type FixedEntityType =
  | 'CHEST' // 瀹濈
  | 'BLACKSMITH' // 閾佸尃
  | 'IDOL' // 绁炲儚
  | 'HOT_SPRING' // 娓╂硥
  | 'ALTAR' // 绁潧
  | 'KEY' // 閽ュ寵
  | 'EXIT' // 鍑哄彛闂?
  | 'PORTAL' // 浼犻€侀棬锛圔oss 鍑昏触鍚庣敓鎴愶級
  | 'GUNPOWDER_BARREL'
  | 'BLAST_TARGET'
  | 'ESCAPE_MARKER'
  | 'WAVE_SPAWN_MARKER' // 第 6 层夜袭刷怪点（闪烁格，不可交互）
  | 'ROCK' // 鐭冲潡鍦板舰锛圔oss 鎴块殰纰嶏紝鍙尅涓€娆?AOE 鍚庢秷澶憋級
  | 'SAND_PIT' // 娌欏潙鍦板舰锛堢2绔?Boss 鎴匡細绉诲姩 AP+2锛孊oss 閽诲嚭浼樺厛娌欏潙锛涙綔鍦版椂鍔ㄦ€佹墿寮狅紝甯?remaining 鐨勪负鍔ㄦ€佸潙锛?
  | 'ICE_WALL' // 鍐板鍦板舰锛堢3绔?Boss 鎴匡細闃绘尅绉诲姩锛孒P=10 鍙鏀诲嚮鐮村潖锛?
  | 'ICE_TILE' // 鍐伴潰鍦板潡锛堢3绔?FrostGiant 鍐板喕鍥炲悎閾哄嚭锛岀帺瀹惰俯涓婃粦琛岋紝remaining 鍊掕鏃惰瀺鍖栵級
  | 'FREEZE_WALL' // 鍐板喕鐘舵€佸锛堢3绔?FrostGiant锛氱帺瀹惰鍐荤粨鏃跺湪鍛ㄥ洿鐢熸垚锛屾寜鏀诲嚮娆℃暟鑰岄潪HP绉婚櫎锛?
  | 'SHATTERED_ICE' // 纰庡啺鍦板潡锛堢3绔?FrostGiant锛氬啺澧?鍐荤粨澧欒鍑荤鍚庣敓鎴愶紝remaining 鍊掕鏃讹紱鐜╁韪╁叆鎵ｅ浐瀹氫激瀹冲苟绔嬪嵆娑堣€楋紝涓嶉樆鎸＄Щ鍔級
  | 'LAVA_TILE'; // 鐔斿博鍦板潡锛堢4绔?LavaLord phase2 鍛ㄦ湡鎬у埛鍑猴紝鐜╁韪╁叆鎵?HP锛?

export type FixedEntitySource = 'GLACIER_SHAPER';

export type MonsterAiState = 'IDLE' | 'PATROL' | 'CHASE' | 'FLEE' | 'DEAD';
export type MonsterSide = 'ENEMY' | 'ALLY';

export interface Monster {
  id: string;
  type: MonsterType;
  pos: Coord;
  hp: number;
  maxHp: number;
  attack: number;
  range: number;
  aggroRadius: number;
  aiState: MonsterAiState;
  /** Boss 涓撳睘鏈哄埗 id锛坱ype==='BOSS' 鏃舵湁鏁堬級銆?*/
  bossId?: string;
  /** 娴佹矙宸ㄨ潕娼滃湴鐘舵€侊細true 鏃跺厤鐤帺瀹舵敾鍑伙紝涓嬩竴鍥炲悎鍐掑嚭骞跺弻鍊嶄激瀹筹紙bossId=QUICKSAND_SCORPION锛夈€?*/
  isBurrowed?: boolean;
  /** 鎬墿鍙樹綋 id锛圢ORMAL/ANIMA/ELITE 涓撳睘琛屼负宸紓锛屽 'GOBLIN_ARCHER'/'FROST_GOBLIN'/'SPIRIT_RAT'锛夈€?*/
  variantId?: string;
  /** 每章特殊怪是否已触发过一次性的半血撤退。 */
  specialRetreatUsed?: boolean;
  /** 被射手在距离至少 2 格命中后，下一怪物回合额外追击 1 格。 */
  /** Chapter 1 floor 5 gunpowder alarm: +1 move step and doubled attack until clear. */
  frenzied?: boolean;
  /** Boss 澧炴彺鎶€鑳藉彫鍞ゅ嚭鐨勬€墿锛氬嚮鏉€鏃朵笉浜х敓浠讳綍鎺夎惤锛堥噾甯?鐏垫皵/瑁呭锛夛紝閬垮厤鍒峰鎻寸櫧瀚栨敹鐩娿€?*/
  summoned?: boolean;
  side?: MonsterSide;
  /** 鍐板喕鍓╀綑鍥炲悎鏁帮紙PERMAFROST_CORE 閬楃墿 / boss_slow_on_hit / boss_stun_on_hurt 瑙﹀彂锛夛細>0 鏃?stepOneMonsterCore 璺宠繃鏈€墿鍥炲悎骞?-1銆?*/
  frozenRounds?: number;
  /** 娴佽鍓╀綑鍥炲悎鏁帮紙boss_bleed_on_hit 瑁呭 trait 瑙﹀彂锛夛細姣忔€墿鍥炲悎寮€濮嬫墸 BLEED_DAMAGE HP锛岄€掑噺鑷?0銆?*/
  bleedRounds?: number;
  /** 鐏肩儳鍓╀綑 tick 鏁帮紙boss_burn_on_hit 瑁呭 trait 瑙﹀彂锛夛細姣忔€墿鍥炲悎寮€濮嬫墸 BURN_TICK_DAMAGE HP锛岄€掑噺鑷?0銆?*/
  burnRounds?: number;
  /** Rogue poison: damage is stored with the application for deterministic ticks. */
  poisonRounds?: number;
  poisonDamage?: number;
  /** 鍐伴湝宸ㄤ汉鐙傛毚鍐查攱棰勮鏂瑰悜锛坆ossId=FROST_GIANT锛夛細涓婁竴鍥炲悎棰勮鏃惰褰曪紝鏈洖鍚堟部姝ゆ柟鍚戞墽琛屽啿閿嬪悗娓呴櫎銆?*/
  frostChargeDir?: Coord;
  /** 冰霜巨人反远程冰墙最近触发回合；用于限制射手/远程命中时的生成频率。 */
  frostRangedWallTurn?: number;
  /** 鍛借繍瀹堝崼琛屼负闀滃儚锛坆ossId=FATE_MIRROR锛変笓灞烇細鐜╁涓婁竴鍥炲悎琛屼负锛屼笅涓€墿鍥炲悎鎵ц鍚庢竻绌恒€?*/
  pendingBehavior?: { action: 'ATTACK' | 'MOVE' | 'IDLE'; distance: number };
  /** 鍛借繍瀹堝崼琛屼负闀滃儚涓撳睘锛氭姢鐩惧眰鏁帮紙0/1锛屼笉鍙犲姞锛涘惛鏀朵竴娆′激瀹冲悗褰掗浂锛夈€?*/
  shieldStacks?: 0 | 1;
  /** 鍛借繍瀹堝崼鏈綋锛坆ossId=FATE_GUARDIAN锛変笓灞烇細鏀瑰啓鍛借繍 E2 鍔犱激鐧惧垎姣旓紝鏅敾 / 闀滃儚鏀诲嚮 / 5脳5 閮藉悆銆?*/
  attackBuffPct?: number;
  /** 鍛借繍瀹堝崼鏈綋涓撳睘锛歛ttackBuffPct 澶辨晥鐨勬€墿鍥炲悎锛坒loor.turn >= 姝ゅ€兼椂娓呴浂锛夈€?*/
  attackBuffExpiresAtTurn?: number;
  /** 鍛借繍瀹堝崼鏈綋涓撳睘锛欻P 鏄惁宸茶法杩?50% 闃堝€肩敓鎴愯繃琛屼负闀滃儚锛坱rue 鍚庝笉鍐嶇敓鎴愶紝鍗充娇闀滃儚姝讳骸锛夈€?*/
  mirrorSpawned?: boolean;
  /** 鍛借繍瀹堝崼鏈綋涓撳睘锛氭槸鍚﹀凡杩涘叆鐙傛毚鎬侊紙HP 璺?30% 鍚?true锛屼笉鍙€嗭級銆?*/
  enraged?: boolean;
  /** 鍛借繍瀹堝崼鏈綋涓撳睘锛氱媯鏆磋捣濮?floor.turn锛堣绠楁敼鍐欏懡杩愬懆鏈熺敤锛夈€?*/
  enrageTurn?: number;
  /** 鍛借疆鍏藉懡杞洖婧細棣栨琚嚮鏉€鏃朵互 50% maxHp 鍘熷湴澶嶆椿锛泃rue 鍚庝笉鍐嶈Е鍙戙€?*/
  revivedOnce?: boolean;
  /** 娌欐紶璺冭湧鏄惁宸茶Е鍙戣繃涓€娆℃€х殑鏂熬鐙傝穬銆?*/
  hopperFrenzyUsed?: boolean;
  /** 鏂熬鐙傝穬鍚庣殑涓嬩竴娆℃垚鍔熸敾鍑绘槸鍚﹀簲閫犳垚鍙屽€嶄激瀹炽€?*/
  hopperDoubleAttackReady?: boolean;
  /** 娌欐紶璺冭湧鏈洖鍚堟槸鍚﹀凡鍥犺繙绋嬪彈鍑绘墽琛屽弽搴旀帹杩涳紝闃叉杩藉姞鏀诲嚮閲嶅瑙﹀彂銆?*/
  hopperReactionTurn?: number;
  /** 鏈€杩戜竴娆＄敓鎴愪复鏃舵帶鍦哄浣撶殑鍥炲悎锛堝啺闇滅簿鐏?/ 绛戝鑰呭叡鐢級銆?*/
  frostWallTurn?: number;
  /** 鍐板窛绛戝鑰呭凡閿佸畾銆佸皢鍦ㄤ笅娆℃€墿鍥炲悎灏濊瘯灏佷綇鐨勬牸瀛愩€?*/
  glacierWallTarget?: Coord;
  /** 冰川塑形者已预告、下个怪物回合会尝试升起的多个冰墙格。 */
  glacierWallTargets?: Coord[];
  /** 鐏劙鍏冪礌宸查攣瀹氥€佸皢鍦ㄤ笅娆℃€墿鍥炲悎寮曠噧鐨勪腑蹇冩牸銆?*/
  lavaTelegraphTarget?: Coord;
  /** 鎶ょ敳鍊硷紙Chapter 2+ 鎬墿/Boss 涓撴湁锛夛細鐜╁鏅敾鍓嶅厛鎵ｅ噺姝ゅ€硷紝鏈€浣庨€犳垚 1 浼ゅ銆?*/
  armor?: number;
  tutorialDrop?: { gold?: number; anima?: number; equip?: EquipItem };
}

export interface FixedEntity {
  id: string;
  type: FixedEntityType;
  pos: Coord;
  /** 鏄惁宸茶娑堣€楋紙瀹濈宸插紑 / 閽ュ寵宸叉嬀 / 鍑哄彛宸插紑锛夈€?*/
  consumed: boolean;
  /** 鍐板鍓╀綑 HP锛坱ype==='ICE_WALL' 鏃舵湁鍊硷級锛? 鏃?consumed=true銆?*/
  hp?: number;
  /** 涓存椂瀹炰綋鍓╀綑瀛樺湪鍥炲悎鏁帮紙濡?LAVA_TILE / ICE_TILE / 涓存椂 ICE_WALL锛夛紝0 鏃剁Щ闄ゃ€?*/
  remaining?: number;
  /** 生成来源；用于区分同类型地形的专属奖励/副作用。 */
  source?: FixedEntitySource;
}

// 鈹€鈹€ 瑁呭锛圡1 浠呭崰浣嶏紝M2 灞曞紑 design 搂11锛?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
export type EquipSlot = 'WEAPON' | 'HELMET' | 'ARMOR' | 'SHOES' | 'TRINKET';
export type EquipQuality = 'COMMON' | 'FINE' | 'RARE' | 'EPIC' | 'LEGENDARY';

export interface EquipItem {
  id: string;
  slot: EquipSlot;
  quality: EquipQuality;
  name: string;
  baseStat: number;
  /** 该件装备的 baseStat 区间上限（掉落时 roll，UI 展示「当前/上限」，AC-EQ-2）。 */
  baseStatMax?: number;
  /** 基础款优缺点效果 id（'weapon_axe'/'weapon_spear'/'armor_plate'/'helmet_heavy' 等，AC-EQ-3）。 */
  implicit?: string;
  /** Boss 专属等效果 id（旧铁匠 equip_* 洗炼已删除；残留字段忽略）。 */
  trait?: string;
  /** 传奇独特效果 id。 */
  legendaryId?: string;
  /** 宸插己鍖栨鏁帮紙0 = 鏈己鍖栵紝鏄剧ず涓?+N 鍚庣紑锛夈€?*/
  enhanceLevel?: number;
  /** 永久逐层模式的固定装备定义；账随机装备不设置此字段。 */
  fixedDefinitionId?: string;
}

export type Equipment = Partial<Record<EquipSlot, EquipItem>>;

// 鈹€鈹€ 閬楃墿锛圔oss 閬楃墿 / 灞€鍐呰鍔?buff锛屾浜℃椂娓呯┖锛?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
/** Boss 閬楃墿 id锛堟瘡绔?1 浠讹紝鎺夎惤瑙勫垯瑙?BOSS_DROP_TABLE锛夈€?*/
// 鈹€鈹€ 杩滃緛鐜╁锛堣法灞傛寔涔呮€侊級 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
export interface RunPlayer {
  hp: number;
  maxHp: number;
  gold: number;
  anima: number;
  /** 鐏垫皵寮哄寲杩涘害锛堢疮璁″埌 animaThreshold 瑙﹀彂涓€娆″己鍖栧悗褰掗浂锛夈€?*/
  animaProgress: number;
  /** 鐏垫皵寮哄寲瑙﹀彂闃堝€硷紙鍒濆 100锛屾瘡娆″己鍖栧悗 脳 1.5 閫掑锛屽瓨妗ｅ瓧娈碉級銆?*/
  animaThreshold?: number;
  classId: ClassId;
  equipment: Equipment;
  equipmentEffectState?: {
    bossReviveUsed?: boolean;
  };
  /** 宸查€氬叧鐨勬渶澶х珷鑺傚彿锛堟瘡绔?Boss 鍑昏触鍚庢洿鏂帮紝鐢ㄤ簬瑙夐啋鏉′欢鍒ゅ畾锛夈€?*/
  maxChapterCleared?: number;
  /** Chapter number in which Berserker's Undying has already triggered. */
  undyingUsedChapter?: number;
  /** 鑳屽寘锛堟Ы浣嶅凡鍗犳椂瑁呭鍏ュ寘锛屽彲鎵嬪姩瑁呭 / 缃崲锛夈€?*/
  bag?: EquipItem[];
  /** 钀ュ湴銆屽己鍖栦綋榄勩€嶅凡璐拱娆℃暟锛涚敤浜庢湰娆¤繙寰佸唴閫掑浠锋牸锛岃繙寰佺粨鏉熷悗閲嶇疆銆?*/
  campMaxHpBuys?: number;
  /** 绁炲儚绁濈绱鏀诲嚮鍔犳垚锛堟案涔咃紝璺ㄥ眰淇濈暀锛夈€?*/
  idolAttackBonus?: number;
  /** 绁炲儚绁濈绱鎶ょ敳鍔犳垚锛堟案涔咃紝鍑忓皯鎬墿浼ゅ锛岃法灞備繚鐣欙級銆?*/
  idolArmorBonus?: number;
  /** 浼犲瑁呭璺ㄥ眰鐘舵€侊紙Phase 3锛夛細Boss 鍑绘潃鍙犲眰銆佺伒姘斿己鍖栧彔灞傜瓑璺ㄥ眰鎸佺画鏁堟灉銆?*/
  legendaryState?: {
    /** 鍛借繍鐜嬪啝锛氳繙寰佸唴 Boss 鍑绘潃鍙犲眰锛堟渶澶?3 鍙狅紝姣忓彔 +10 鏀诲嚮锛夈€?*/
    fateCrownStacks?: number;
    /** 鍛借繍鎶ょ锛氱伒姘斿己鍖栧彔灞傦紙鏈€澶?5 鍙狅紝姣忓彔 +5 鏀诲嚮锛夈€?*/
    fateAmuletStacks?: number;
  };
}

export interface PveBalancePlayerConfig {
  initialHp?: number;
  initialGold?: number;
  initialAnima?: number;
  baseAttack?: number;
  baseAttackRange?: number;
  apBase?: number;
  moveCost?: number;
  attackCost?: number;
  openChestCost?: number;
  openExitCost?: number;
  useIdolCost?: number;
  useHotSpringCost?: number;
  useAltarCost?: number;
}

export interface PveBalanceUnitConfig {
  hpMultiplier?: number;
  attackMultiplier?: number;
  rangeDelta?: number;
  aggroRadiusDelta?: number;
  armorDelta?: number;
}

export interface PveBalanceEquipmentConfig {
  weaponBaseMultiplier?: number;
  armorBaseMultiplier?: number;
  helmetBaseMultiplier?: number;
  shoesBaseMultiplier?: number;
  trinketBaseMultiplier?: number;
}

export interface PveBalanceConfig {
  player?: PveBalancePlayerConfig;
  monster?: PveBalanceUnitConfig;
  boss?: PveBalanceUnitConfig;
  equipment?: PveBalanceEquipmentConfig;
}

export interface PveBalanceSnapshot {
  globalConfig: PveBalanceConfig;
  chapterConfigs: Record<string, PveBalanceConfig>;
  unitConfigs: Record<string, PveBalanceConfig>;
}

// 鈹€鈹€ 妤煎眰杩愯鎬侊紙姣忓眰涓€浠斤紝鍙簭鍒楀寲瀛樻。锛?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
export type FloorStatus = 'EXPLORING' | 'CLEARED' | 'DEAD';

export interface FloorState {
  floor: number; // 1-based
  size: number; // 杈归暱锛?/9/10锛?
  seed: number; // 鏈眰鍦板浘鐢熸垚绉嶅瓙
  rngState: number; // 褰撳墠 RNG 鍐呴儴鐘舵€侊紙缁畻鐢級
  player: Coord; // 鐜╁鍦ㄧ綉鏍间腑鐨勪綅缃?
  ap: number; // 褰撳墠琛屽姩鐐?
  maxAp: number; // 鏈洖鍚堜笂闄愶紙8 + 楠板瓙锛?
  dice: number; // 鏈洖鍚堥瀛愮偣鏁?
  turn: number; // 鍥炲悎鏁帮紙1-based锛?
  hasKey: boolean; // 鏄惁宸叉嬀鍙栭挜鍖?
  /** 宸叉彮绀烘牸瀛愶細revealed[y][x]銆?*/
  revealed: boolean[][];
  monsters: Monster[];
  entities: FixedEntity[];
  status: FloorStatus;
  /** ROGUE 鑳屽埡锛氭湰鍥炲悎绉诲姩鍚庝笅娆℃敾鍑诲弻鍊嶏紙绉诲姩鏃剁疆 true锛岄娆″懡涓悗缃?false锛岄粯璁?false锛夈€?*/
  backstabAvailable?: boolean;
  /** BERSERKER 涓嶅眻锛氭湰灞傞娆″皢姝绘椂淇濈暀 1 HP锛堣Е鍙戝悗缃?false锛岄粯璁?true锛夈€?*/
  undyingAvailable?: boolean;
  /** ROGUE 娈嬪奖锛氭湰灞傞娆¤鏀诲嚮鏃堕棯閬匡紙瑙﹀彂鍚庣疆 false锛岄粯璁?true锛夈€?*/
  hasAfterimage?: boolean;
  /** 鐔斿博棰嗕富鐏肩儳鍓╀綑浼ゅ锛堟瘡鍥炲悎寮€濮?-10 HP锛岀洿鑷冲綊闆讹級銆?*/
  playerBurnRemaining?: number;
  /** 闈村瓙棣栨鍏嶈垂鏍囪锛歊ARE+ 闈村瓙姣忓洖鍚堥娆＄Щ鍔ㄥ厤璐癸紱鏈洖鍚堝凡鐢ㄨ繃鍒欎负 true锛屽洖鍚堢粨鏉熸椂閲嶇疆銆?*/
  shoesFirstMoveDone?: boolean;
  /** 绉诲姩AP鎯╃綒鍓╀綑鍥炲悎鏁帮紙鍐伴湝鍝ュ竷鏋?閲嶅嚮浣欐尝锛?0 鏃舵瘡娆＄Щ鍔ㄩ澶栨秷鑰?1AP锛夈€?*/
  playerMoveApPenaltyRounds?: number;
  /** 璧ょ値鍝ュ竷鏋楃伡鐑у墿浣欏洖鍚堟暟锛堟瘡鍥炲悎绱 5HP 浼ゅ锛夈€?*/
  playerFireBurnRounds?: number;
  /** 璧ょ値鍝ュ竷鏋楃伡鐑т激瀹崇疮璁★紙姣忓洖鍚?+5锛屸墺10 鏃舵墸 10HP 骞?-10锛夈€?*/
  playerFireBurnAccum?: number;
  /** 姣掕潕涓瘨鍓╀綑鍥炲悎鏁帮紙姣忓洖鍚?8HP锛屼笉鍙犲姞锛屽埛鏂拌鏃讹級銆?*/
  playerPoisonRounds?: number;
  /** 鐔斿博棰嗕富绗簩闃舵鏍囪锛圔oss HP/maxHp 鈮?CHAPTER4_LAVA_LORD_PHASE2_HP_RATIO 鍚庣疆 true锛屼笉鍙€嗭級銆?*/
  lavaLordPhase2?: boolean;
  /** 鐔斿博娼睈鍥炲悎璁℃暟鍣細phase2 鏈熼棿姣忓洖鍚?+1锛岃揪鍒?CHAPTER4_LAVA_TIDE_INTERVAL 鏃舵帹杩涗笅涓€鎺掑苟褰掗浂銆?*/
  lavaTideCounter?: number;
  /** 鐔斿博棰嗕富闃舵涓€銆屽柗鍙戦璀︺€嶅緟缁撶畻鏍囪锛氫笅涓?Boss 鍥炲悎鍦?cells 涓婄敓鎴愪复鏃?LAVA_TILE銆?*/
  lavaEruptionMark?: { cells: Coord[] };
  /** 鐔斿博棰嗕富銆岀啍宀╅攣閾俱€嶈繙绂昏鏁板櫒锛氭瘡 Boss 鍥炲悎鏇煎搱椤胯窛绂?>1 鏃?+1锛?=1 鏃跺綊闆躲€?*/
  lavaLordChainCounter?: number;
  /** 鐔斿博棰嗕富闃舵浜屽畾鍚戠啍宀╂疆姹愭帹杩涙柟鍚戯紙杩涘叆闃舵浜屾椂鐢?Boss 鎵€鍦ㄨ竟纭畾锛屼笉鍙彉锛夈€?*/
  lavaTideDirection?: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
  /** 鐔斿博棰嗕富闃舵浜屽畾鍚戠啍宀╂疆姹愬凡鎺ㄨ繘鐨勬帓鏁帮紙涓婇檺 CHAPTER4_LAVA_TIDE_ROW_MAX锛夈€?*/
  lavaTideRowsAdvanced?: number;
  /** 澶嶄粐绫昏瘝鏉★紙vengeance/retreat_shot/retribution锛夛細鍙楀埌鎬墿鏀诲嚮鍚庣疆 true锛屼笅娆′富鍔ㄦ敾鍑绘秷鑰楀苟 +5 浼ゅ銆?*/
  vengeanceReady?: boolean;
  /** 杩涢樁 oneShot锛坒inal_charge/last_arrow/desperate_gambit锛夛細鏈眰棣栨 HP鈮?0% 鏃惰Е鍙?AP+3锛岃Е鍙戝悗缃?false锛堥粯璁?true锛夈€?*/
  finalChargeAvailable?: boolean;
  /** 鍛借繍瀹堝崼寰呯粨绠楅瑷€锛氭爣璁板洖鍚堣褰曚腑蹇冩牸锛屼笅涓?Boss 鍥炲悎璇?3脳3 鍖哄煙鐖嗙偢鍚庢竻绌恒€?*/
  fateProphecy?: { center: Coord };
  /** 鍐伴湝宸ㄤ汉瀵掓皵灞傛暟锛氭櫘閫氭敾鍑诲懡涓帺瀹舵椂 +1锛岃揪鍒?FROST_GIANT_CHILL_STACKS_TO_FREEZE 鏃惰Е鍙戝喕缁撳苟褰掗浂銆?*/
  playerChillStacks?: number;
  /** 鐜╁鏄惁澶勪簬鍐伴湝宸ㄤ汉鍐荤粨鐘舵€侊細MOVE 琛屼负琚畬鍏ㄩ樆鏂紙no-op锛夛紝ATTACK 绛夊叾浣欒鍔ㄦ甯搞€?*/
  playerFrozen?: boolean;
  /** 鍐荤粨鐘舵€佷笅鐜╁杩橀渶涓诲姩鏀诲嚮锛坧layerAttack/attackIceWall锛夊灏戞鎵嶈兘瑙ｉ櫎锛氬綊闆舵椂瑙ｉ櫎鍐荤粨骞剁Щ闄?FREEZE_WALL銆?*/
  playerFreezeAttacksRemaining?: number;
  /** 鍛借繍瀹堝崼鐙傛毚鎬併€屾敼鍐欏懡杩愩€嶅緟缁撶畻锛? 鎶?3 + 鐜╁寮?1 鐨勪腑闂寸姸鎬併€?*/
  pendingDestinyRewrite?: {
    /** 鎶藉埌鐨?3 涓簨浠剁紪鍙凤紙1-5锛屼笉閲嶅锛屾寜鎶藉彇椤哄簭锛夈€?*/
    drawn: [number, number, number];
    /** 鐜╁寮冩帀鐨勭储寮曪紙0/1/2锛夛紝null 琛ㄧず灏氭湭閫夋嫨銆?*/
    removed: 0 | 1 | 2 | null;
    /** 棰勫憡鎵€鍦ㄧ殑鎬墿鍥炲悎锛堢敤浜庡懆鏈熷垽瀹氾級銆?*/
    offeredAtTurn: number;
  };
  /** 鍛借繍瀹堝崼 E5 鍛借繍灏侀攣锛氫笅涓帺瀹跺洖鍚?AP 鍑忓崐锛坒loor(ap/2)锛屾渶灏?1锛夈€侫P 绯荤粺缁撶畻鍚庢竻绌恒€?*/
  destinyLockNextTurn?: boolean;
  /** 鍛借繍瀹堝崼琛屼负闀滃儚锛氱帺瀹舵湰鍥炲悎鏄惁鑷冲皯涓€娆″懡涓紙CombatSystem.playerAttack 璁剧疆锛宔ndTurn 閲嶇疆锛夈€?*/
  playerAttackedThisTurn?: boolean;
  /** 鍛借繍瀹堝崼琛屼负闀滃儚锛氱帺瀹舵湰鍥炲悎鐨勭疮璁＄Щ鍔ㄦ牸鏁帮紙MovementSystem.applyMove 鑷锛宔ndTurn 閲嶇疆锛夈€?*/
  playerStepsThisTurn?: number;
  /** 连续完整玩家回合未移动形成的被围攻层数；移动一步立即清零，最多 3 层。 */
  stationaryPressureStacks?: number;
  /** 本层通过击碎冰墙已获得的灵气。 */
  iceWallAnimaGained?: number;
  /** 本层通过击碎冰川塑形者冰墙已获得的灵气。 */
  glacierShaperWallAnimaGained?: number;
  playerExposedTurns?: number;
  goblinSentinelAlertIds?: string[];
  duneSentinelAlertIds?: string[];
  /** 鏈洖鍚堝凡閫氳繃鍑绘潃杩旇繕鐨?AP锛屾€婚鍙楀崟鍥炲悎涓婇檺绾︽潫锛宔ndTurn 閲嶇疆銆?*/
  killApRefundedThisTurn?: number;
  /** V2 general traits: floor/turn-scoped combat state. */
  generalFirstAttackUsed?: boolean;
  generalSetbackReady?: boolean;
  generalTerrainPowerReady?: boolean;
  generalStoredEdgeReady?: boolean;
  generalOverhealAnimaThisFloor?: number;
  generalReserveApReady?: boolean;
  /** V2 class traits: shared deterministic runtime state. */
  berserkerShield?: number;
  berserkerBloodyChainReady?: boolean;
  berserkerRageStacks?: number;
  berserkerFinalChargeReady?: boolean;
  berserkerRetaliationTargetId?: string;
  archerMarkedMonsterId?: string;
  archerAttackCount?: number;
  archerNoMultiShotCount?: number;
  archerCriticalReloadReady?: boolean;
  archerHunterRhythmReady?: boolean;
  rogueAttackCountThisTurn?: number;
  rogueKillCountThisFloor?: number;
  rogueEscapeMoveReady?: boolean;
  rogueHidden?: boolean;
  rogueChainBackstabReady?: boolean;
  rogueVanishStrikeReady?: boolean;
  rogueSmokeUsed?: boolean;
  /** 浼犲锛氬懡杩愪箣鍒冩湰灞傚嚮鏉€鍙犲眰璁℃暟锛坙eg_fate_blade锛涙柊灞傝嚜鍔ㄥ綊闆讹級銆?*/
  legFateBladeStacks?: number;
  /** 浼犲锛氬櫖榄傛垬鏂т笅娆℃敾鍑诲繀鏆村嚮鏍囪锛坙eg_soul_axe锛涘嚮鏉€鍚庣疆 true锛岄娆℃敾鍑绘秷鑰楋級銆?*/
  legSoulAxePending?: boolean;
  /** 浼犲锛氭案鎭掓澘鐢叉湰灞傞娆¤嚧姝诲厹搴曞凡鐢紙leg_eternal_plate锛涙柊灞傞噸缃級銆?*/
  legEternalPlateUsed?: boolean;
  /** 浼犲锛氱柧椋庡够褰辩敳涓嬫鍙楀嚮浼ゅ鍑忓崐锛坙eg_phantom_armor锛涘彈鍑?30% 姒傜巼缃?true锛岃Е鍙戝悗娑堣€楋級銆?*/
  legPhantomDodgeReady?: boolean;
  /** 浼犲锛氱柧椋庝箣闈撮姝ュ悗棣栧嚮+25%寰呰Е鍙戯紙leg_gale_boots锛涢姝ユ垚鍔熷悗缃?true锛岄娆℃敾鍑绘秷鑰楋級銆?*/
  legGaleBootsAttackReady?: boolean;
  tutorialScenarioId?: string;
  tutorialGuide?: {
    currentStepId: string;
    completedStepIds: string[];
    dismissedStepIds?: string[];
  };
}

// 鈹€鈹€ 杩滃緛鎬荤姸鎬侊紙瀛樻。鏍瑰璞★級 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
export type ExpeditionStatus = 'ACTIVE' | 'DEAD' | 'COMPLETED';

export interface ExpeditionState {
  runSeed: number; // 鏁存杩滃緛绉嶅瓙锛堟淳鐢熸瘡灞傜瀛愶級
  chapter: number; // 1-based
  floor: number; // 1-based 褰撳墠灞?
  status: ExpeditionStatus;
  player: RunPlayer;
  floorState: FloorState;
  balanceSnapshot?: PveBalanceSnapshot | null;
  /** 闅惧害蹇収锛堝紑灞€鍐荤粨锛岀画妗ｄ笉鍙橈紝鈫?AC-P3-9锛夈€傜己鐪佽涓?NORMAL銆?*/
  difficultySnapshot?: import('./PveConstants').DifficultySnapshot | null;
  isTutorialRun?: boolean;
  /** 仅关闭已退役的随机掉落/强化；原移动、攻击、AI 与事件链仍保持不变。 */
  persistentFloorMode?: true;
  /** 本层固定装备掉落池（来自楼层目录 equipmentIds）。 */
  equipmentDropPool?: readonly string[];
  /** 本层掉落实例序号，保证 loot_* instanceId 确定性。 */
  lootSeq?: number;
}

// 鈹€鈹€ 浜嬩欢锛坈ore 绾嚱鏁拌繑鍥烇紝渚?Controller 鍥炴斁鍔ㄧ敾锛?鈹€鈹€鈹€鈹€
export type PveEvent =
  | { type: 'MOVE'; entityId: 'PLAYER' | string; from: Coord; to: Coord; apLeft: number }
  | { type: 'REVEAL'; cells: Coord[] }
  | { type: 'ATTACK'; attackerId: string; targetId: string; damage: number; targetHp: number; cause?: 'DIRECT' | 'COLLISION' }
  | { type: 'WAR_HORN_SUMMONED'; pos: Coord; allyId: string }
  | { type: 'ALLY_KILLED'; allyId: string; pos: Coord }
  | { type: 'KILL'; monsterId: string; monsterType: MonsterType }
  | { type: 'LOOT'; gold?: number; anima?: number; equip?: EquipItem; source: string; bagged?: boolean }
  /** 钀ュ湴鍙樺崠瑁呭锛圓C-19 瑁呭鏁寸悊锛夈€?*/
  | { type: 'SELL_EQUIP'; slot: EquipSlot; itemName: string; gold: number }
  | { type: 'PICK_KEY'; entityId: string }
  | { type: 'OPEN_CHEST'; entityId: string }
  | { type: 'PLAYER_DAMAGED'; damage: number; hp: number; sourceId: string; rawDamage?: number }
  | { type: 'STATIONARY_PRESSURE_CHANGED'; stacks: number }
  | { type: 'TURN_END'; turn: number }
  /** 鏂板洖鍚堝紑濮嬫幏楠?鈫?AP锛圓C-2锛夛細dice 鈭?[1,6]锛宎p = 8 + dice 鈭?[9,14]锛堝凡鍖呭惈缁撹浆锛岃 AP_CARRIED锛夈€?*/
  | { type: 'AP_ROLLED'; turn: number; dice: number; ap: number }
  /** 涓婂洖鍚堝墿浣?AP 鎸?AP_CARRY_CAP 缁撹浆鍒版湰鍥炲悎锛歛mount 涓烘湰娆＄粨杞€硷紙宸茶鍏?AP_ROLLED.ap锛夈€?*/
  | { type: 'AP_CARRIED'; amount: number }
  /** 鐜╁鍑绘潃鍚庤繑杩?AP锛沘mount 涓烘湰娆¤繑杩樺€硷紝ap 涓鸿繑杩樺悗鐨勫綋鍓?AP銆?*/
  | { type: 'KILL_AP_GAINED'; amount: number; ap: number; monsterId: string }
  | { type: 'PLAYER_EXPOSED'; source: 'INTERACTION' | 'GOBLIN_SENTINEL' | 'DUNE_SENTINEL'; turns?: number; permanent?: boolean; monsterId?: string }
  | { type: 'PLAYER_EXPOSURE_ENDED'; source: 'INTERACTION' | 'GOBLIN_SENTINEL' | 'DUNE_SENTINEL' }
  /** Boss 闃典骸 + 鎸佹湁閽ュ寵鏃跺湪 Boss 浣嶇疆娴幇浼犻€侀棬锛堢帺瀹堕渶韪忓叆骞朵氦浜掓墠閫氬叧锛宒esign AC-9锛夈€?*/
  | { type: 'PORTAL_SPAWNED'; entityId: string; pos: Coord }
  /** 第 6 层夜袭：下一波即将出现（先提示再刷怪）。 */
  | { type: 'WAVE_INCOMING'; wave: number }
  | { type: 'GUNPOWDER_BARREL_ACTIVATED'; entityId: string; pos: Coord }
  | { type: 'BLAST_TARGET_DETONATED'; entityId: string; pos: Coord }
  | { type: 'TARGET_ESCAPED'; entityId: string; pos: Coord }
  /** 绁炲儚绁濈锛氫笁閫変竴闅忔満锛屼粎鎼哄甫鏈鍛戒腑鐨勯偅椤瑰姞鎴愩€?*/
  | { type: 'IDOL_BLESSING'; entityId: string; effect: 'MAX_HP'; maxHpBonus: number }
  | { type: 'IDOL_BLESSING'; entityId: string; effect: 'ATTACK'; attackBonus: number }
  | { type: 'IDOL_BLESSING'; entityId: string; effect: 'ARMOR'; armorBonus: number }
  /** 娓╂硥娌荤枟锛氬綋娆″洖婊?HP锛圡1 鍗犱綅瑙勫垯锛宒esign.md 鏈杩帮級銆?*/
  | { type: 'HOT_SPRING_HEAL'; entityId: string; healed: number }
  | { type: 'SHOP_BUY'; itemId: string; cost: number; effect: string }
  /** 鎴愬氨瑙ｉ攣锛圕ontroller 鍚堟垚锛屼笉鐢?core 绾嚱鏁颁骇鐢燂紱渚?_playEvents 灞曠ず toast锛夈€?*/
  | { type: 'FLOOR_CLEARED'; floor: number }
  | { type: 'PLAYER_DEAD' }
  /** 娴佹矙宸ㄨ潕娼滃叆鍦颁笅锛堝厤鐤敾鍑伙紝涓嬪洖鍚堝啋鍑猴級銆?*/
  | { type: 'BOSS_BURROWED'; bossId: string }
  /** 娴佹矙宸ㄨ潕浠庡湴涓嬪啋鍑猴紙pos 涓鸿惤鐐癸紝钀界偣澶勪細鐣欎笅涓€涓案涔呮矙鍧戯紱attackRadius 涓烘湰娆＄牬鍦熺獊琚疄闄呬激瀹宠寖鍥达級銆?*/
  | { type: 'BOSS_EMERGED'; bossId: string; pos: Coord; attackRadius: number }
  /** 鐔斿博棰嗕富鏂藉姞鐏肩儳锛歵otalRemaining 涓哄墿浣欐€荤伡鐑т激瀹崇偣鏁般€?*/
  | { type: 'BURN_APPLIED'; bossId: string; totalRemaining: number }
  /** 绉诲姩AP鎯╃綒鏂藉姞锛堝啺闇滃摜甯冩灄鍛戒腑 / 鍝ュ竷鏋楅厠闀块噸鍑籄OE锛夛細rounds 涓烘湰娆″彔鍔犵殑鎸佺画鍥炲悎鏁般€?*/
  | { type: 'MOVE_PENALTY_APPLIED'; rounds: number }
  /** 鐏肩儳鐘舵€佹柦鍔狅紙璧ょ値鍝ュ竷鏋楀懡涓級锛歳ounds 涓烘湰娆″彔鍔犵殑鎸佺画鍥炲悎鏁般€?*/
  | { type: 'FIRE_BURN_APPLIED'; rounds: number }
  /** 涓瘨鐘舵€佹柦鍔狅紙姣掕潕鍛戒腑锛夛細rounds 涓烘寔缁洖鍚堟暟锛堜笉鍙犲姞锛屽埛鏂拌鏃讹級銆?*/
  | { type: 'POISON_APPLIED'; rounds: number }
  /** 涓瘨 tick锛氭瘡鍥炲悎寮€濮嬫椂 -8 HP銆?*/
  | { type: 'POISON_TICK'; damage: number; hp: number }
  /** 鐏肩儳 tick锛氭瘡鍥炲悎寮€濮嬫椂 -1 HP銆?*/
  | { type: 'BURN_TICK'; damage: number; hp: number }
  /** 绁潧浣跨敤锛氭秷鑰楀悗闅忔満鑾峰緱鐏垫皵銆?*/
  | { type: 'ALTAR_USED'; entityId: string; anima: number }
  /** 閾佸尃寮哄寲鎴愬姛锛歜aseStat 鎻愬崌锛宔nhanceLevel +1锛屾樉绀烘柊鐨勫己鍖栫瓑绾т笌灞炴€у€笺€?*/
  | { type: 'BLACKSMITH_UPGRADE'; entityId: string; slot: EquipSlot; newStat: number; newEnhanceLevel: number }
  /** 閾佸尃寮哄寲澶辫触锛氭墸璐逛絾灞炴€т笉鍙橈紙姒傜巼澶辫触锛夈€?*/
  | { type: 'BLACKSMITH_UPGRADE_FAIL'; entityId: string; slot: EquipSlot; failChance: number }
  /** 哥布林酋长蓄力重击实际结算：center 为本次重击结算时 boss 所在格（用于 UI 标识实际命中区域）。 */
  | { type: 'HEAVY_STRIKE_RESOLVED'; bossId: string; center: Coord }
  /** 鍝ュ竷鏋楅厠闀胯搫鍔涢噸鍑婚璀︼紙2026-06-15 鎭㈠ 鈫?鏈€缁堛€屽厛閲婃斁鍚庤拷鍑汇€嶆柟妗堬級锛氭湰鍥炲悎闈為噸鍑诲洖鍚堬紝
   *  浣嗕笅涓€墿鍥炲悎灏嗚Е鍙戦噸鍑伙紱center 涓?boss **褰撳墠瀹為檯浣嶇疆**锛宺adius = HEAVY_STRIKE_RANGE銆?
   *  閲嶅嚮鍥炲悎 boss 鍏堝湪鍘熷湴閲婃斁锛堜腑蹇?= center锛夈€佸啀杩藉嚮绉诲姩锛屾晠绾㈠湀锛堜互 center 涓哄績鍗婂緞 radius锛?
   *  涓庝笅鍥炲悎瀹為檯鍛戒腑姗欏湀瀹屽叏閲嶅悎锛岀帺瀹惰窇鍑虹孩鍦堝嵆缁濆瀹夊叏銆佷笉浼氬璧颁綅娴垂 AP銆?*/
  | { type: 'HEAVY_STRIKE_WARNING'; bossId: string; center: Coord; radius: number }
  /** Boss 棣栨杩涘叆鐙傛毚鐘舵€侊紙HP 璺ㄨ繃鐙傛毚闃堝€硷紝褰撳墠浠呭摜甯冩灄閰嬮暱锛夛細鐢ㄤ簬鎴樻姤鎻愮ず鐜╁ Boss 寮哄寲銆?*/
  | { type: 'BOSS_ENRAGED'; bossId: string }
  /** 鐭冲潡琚?Boss AOE 鎽ф瘉銆?*/
  | { type: 'ROCK_DESTROYED'; entityId: string }
  /** 鎬墿琚?Boss 澧炴彺鍙疯鍙敜銆?*/
  | { type: 'MONSTER_SPAWNED'; monsterId: string; pos: Coord }
  /** 瑁呭鍙樺寲锛氳澶?鏇挎崲/寮哄寲鏃剁粺涓€瑙﹀彂锛屼緵 HUD 鍒锋柊瑁呭闈㈡澘銆?*/
  | { type: 'EQUIP_CHANGED'; slot: EquipSlot; item: EquipItem; prevBaseStat?: number }
  /** 鐜╁韪╁叆娌欏潙锛堢2绔?Boss 鎴匡級锛氬綋鍓嶆牸 entityId锛岀Щ鍔?AP 宸插姞 1銆?*/
  | { type: 'SAND_PIT_STEPPED'; entityId: string }
  /** 鐏垫皵鎬€冭窇鍚庡湪绂诲紑鐨勫師鏍肩暀涓嬮櫡闃憋紙CH2 娌欏潙 / CH3 鍐伴潰锛夛細variantId 鐢ㄤ簬鎴樻姤灞曠ず銆?*/
  | { type: 'ANIMA_TRAP_SPAWNED'; entityId: string; entityType: 'SAND_PIT' | 'ICE_TILE'; pos: Coord; variantId: string; duration: number }
  /** 鐏垫皵鐐庨瓊锛圕H4锛夎鍑绘潃鏃跺湪鍗佸瓧 4 鏍肩敓鎴愮啍宀╋紙璺宠繃琚崰鏍硷級銆?*/
  | { type: 'ANIMA_DEATH_LAVA'; tiles: Coord[]; duration: number }
  /** 鐏垫皵骞昏薄锛圕H5锛夎鍑绘潃鏃剁粰鐜╁闅忔満 Buff銆?*/
  | { type: 'ANIMA_BUFF_GRANTED'; buffId: string }
  /** 鐏垫皵骞昏薄锛圕H5锛夎鍑绘潃鏃剁粰鐜╁闅忔満 Debuff銆?*/
  | { type: 'ANIMA_DEBUFF_APPLIED'; debuffId: string }
  /** 鍐板琚帺瀹舵敾鍑荤牬鍧忥紙绗?绔?Boss 鎴匡級锛歟mit 鍚庣帺瀹?+anima銆?*/
  | { type: 'ICE_WALL_BROKEN'; entityId: string; anima: number }
  /** 鐜╁韪╁叆鐔斿博鍦板潡鍙椾激锛堟瘡鍥炲悎寮€濮嬬粨绠楋級銆?*/
  | { type: 'LAVA_TILE_DAMAGED'; entityId: string; damage: number }
  /** 鐔斿博棰嗕富闃舵涓€鍠峰彂棰勮锛氫互鐜╁褰撳墠鏍间负涓績鐨?4脳4 鍖哄煙锛屼笅涓?Boss 鍥炲悎灏嗙敓鎴愮啍宀┿€?*/
  | { type: 'ERUPTION_TELEGRAPHED'; cells: Coord[] }
  /** 鐔斿博棰嗕富闃舵涓€鍠峰彂缁撶畻锛氬湪涓婂洖鍚堟爣璁扮殑 cells 涓婄敓鎴?LAVA_TILE锛堝瓨缁?duration 鍥炲悎锛夈€?*/
  | { type: 'ERUPTION_RESOLVED'; tiles: Coord[]; duration: number }
  /** 鐔斿博棰嗕富鐔旀牳鐖嗚锛氱伡鐑у眰鏁拌揪闃堝€兼椂娓呯┖鐏肩儳骞堕€犳垚鐪熷疄浼ゅ锛屽懆鍥寸敓鎴?LAVA_TILE銆?*/
  | { type: 'BURN_BURST'; damage: number; hp: number; tiles: Coord[] }
  /** 鐔斿博棰嗕富闃舵浜屽畾鍚戠啍宀╂疆姹愶細娌?direction 鎺ㄨ繘绗?rowIndex 鎺掓案涔?LAVA_TILE銆?*/
  | { type: 'LAVA_TIDE_ROW_SPAWNED'; tiles: Coord[]; direction: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'; rowIndex: number }
  /** 鐔斿博棰嗕富鐔斿博閿侀摼锛氱帺瀹惰鎷夎繎涓€鏍煎苟闄勫姞鐏肩儳锛坆urnTotal 涓哄彔鍔犲悗鐨勬€荤伡鐑у眰鏁帮級銆?*/
  | { type: 'LAVA_CHAIN_PULL'; from: Coord; to: Coord; burnTotal: number }
  /** 鍛借繍瀹堝崼琛屼负闀滃儚鐢熸垚锛堢5绔?FateGuardian HP鈮?0%锛宧p=鐜╁HP脳0.5銆乤ttack=鐜╁attack脳0.5锛夈€?*/
  | { type: 'MIRROR_SPAWNED'; mirrorId: string; pos: Coord }
  /** 鍛借繍闀滃儚琚嚮鏉€锛堜笉鎺夎惤锛屼笉褰卞搷浼犻€侀棬鐢熸垚鍒ゅ畾锛夈€?*/
  | { type: 'MIRROR_KILLED'; mirrorId: string }
  /** 琛屼负闀滃儚锛氳褰曠帺瀹舵湰鍥炲悎琛屼负锛屼笅涓€墿鍥炲悎鎵ц銆?*/
  | { type: 'MIRROR_BEHAVIOR_QUEUED'; mirrorId: string; action: 'ATTACK' | 'MOVE' | 'IDLE'; distance: number }
  /** 琛屼负闀滃儚锛氬鍒剁帺瀹剁Щ鍔紙鏈濈帺瀹舵柟鍚戞渶鐭矾寰勬帹杩?distance 鏍硷級銆?*/
  | { type: 'MIRROR_MOVED'; mirrorId: string; from: Coord; to: Coord }
  /** 琛屼负闀滃儚锛氬鍒剁帺瀹舵敾鍑伙紙hit=false 鏃朵负鏇煎搱椤?> 2 鐨勭┖鎸ワ級銆?*/
  | { type: 'MIRROR_ATTACKED'; mirrorId: string; hit: boolean; damage: number; hp: number }
  /** 琛屼负闀滃儚锛氱帺瀹朵笂鍥炲悎寰呮満 鈫?闀滃儚鏈洖鍚堣幏寰?1 灞傛姢鐩俱€?*/
  | { type: 'MIRROR_SHIELDED'; mirrorId: string }
  /** 琛屼负闀滃儚锛氭姢鐩惧惛鏀朵竴娆′激瀹筹紙damage=0 涓嶆墸 HP锛夈€?*/
  | { type: 'MIRROR_SHIELD_ABSORBED'; mirrorId: string }
  /** 鍛借繍瀹堝崼鐙傛毚鎬併€屾敼鍐欏懡杩愩€嶉鍛婏細浠?5 姹犳娊 3 涓簨浠朵緵鐜╁寮?1銆?*/
  | { type: 'DESTINY_REWRITE_OFFERED'; drawn: [number, number, number] }
  /** 鏀瑰啓鍛借繍锛氱帺瀹堕€夊畾寮冩帀鐨勭储寮曪紙0/1/2锛夈€?*/
  | { type: 'DESTINY_REWRITE_CHOSEN'; removedIndex: 0 | 1 | 2 }
  /** 鏀瑰啓鍛借繍缁撶畻姹囨€伙細鏈瀹為檯鎵ц鐨勪簨浠剁紪鍙凤紙鎸?E5鈫扙4鈫扙3鈫扙1鈫扙2 椤哄簭锛夈€?*/
  | { type: 'DESTINY_REWRITE_RESOLVED'; executed: number[] }
  /** 鏀瑰啓鍛借繍 E1锛欱oss 鍥炶 amount锛岀粨绠楀悗 boss.hp銆?*/
  | { type: 'DESTINY_HEAL'; amount: number; bossHp: number }
  /** 鏀瑰啓鍛借繍 E2锛欱oss 鍔犱激瀹?pct%锛宐uff 澶辨晥鐨勬€墿鍥炲悎銆?*/
  | { type: 'DESTINY_ATK_BUFF'; pct: number; expiresAtTurn: number }
  /** 鏀瑰啓鍛借繍 E3锛氱洿鎺ュ鐜╁閫犳垚 damage 鐪熷疄浼ゅ锛宧p 涓虹粨绠楀悗鐜╁ HP銆?*/
  | { type: 'DESTINY_DIRECT_DAMAGE'; damage: number; hp: number }
  /** 鏀瑰啓鍛借繍 E4锛氫互 Boss 褰撳墠鏍间负涓績 5脳5 鐖嗙偢锛沝amage>0 鏃跺懡涓帺瀹躲€?0 鏃剁帺瀹跺湪鑼冨洿澶栵紙浠呬緵娓叉煋锛夈€?*/
  | { type: 'DESTINY_5X5_EXPLODED'; center: Coord; damage: number; hp: number }
  /** 鏀瑰啓鍛借繍 E5锛氫笅涓帺瀹跺洖鍚?AP 鍑忓崐锛宯extTurnAp 涓哄疄闄呯敓鏁堝悗鐨?AP銆?*/
  | { type: 'DESTINY_AP_LOCKED'; nextTurnAp: number }
  /** 鍛借繍瀹堝崼棰勮█鏍囪锛堢5绔狅級锛歝enter 涓烘爣璁扮殑鐜╁褰撳墠鏍硷紝涓嬩釜 Boss 鍥炲悎璇?3脳3 鐖嗙偢銆?*/
  | { type: 'PROPHECY_MARKED'; center: Coord }
  /** 鍛借繍瀹堝崼棰勮█缁撶畻锛堢5绔狅級锛歝enter 涓虹垎鐐镐腑蹇冿紙3脳3锛夛紝鏃犺鏄惁鍛戒腑鍧?emit 渚涙覆鏌撱€?*/
  | { type: 'PROPHECY_RESOLVED'; center: Coord }
  /** 鍐伴湝宸ㄤ汉鍐伴潰鐢熸垚锛堢3绔狅級锛氭湰娆￠摵鍑虹殑鍐伴潰鏍煎瓙 + 瀛樺湪鍥炲悎鏁般€?*/
  | { type: 'ICE_TIDE_SPAWNED'; tiles: Coord[]; duration: number }
  /** 鍐伴湝宸ㄤ汉瀵掓皵灞傛暟鍙樺寲锛堢3绔狅級锛氭櫘閫氭敾鍑诲懡涓帺瀹跺悗 emit锛泂tacks 涓烘湰娆″彔鍔犲悗鐨勫眰鏁帮紙瑙﹀彂鍐荤粨鏃跺綊闆朵负 0锛夈€?*/
  | { type: 'CHILL_STACK_APPLIED'; stacks: number }
  /** 鍐伴湝宸ㄤ汉鍐荤粨鐜╁锛堢3绔狅紝瀵掓皵鍙犳弧锛夛細wallEntityIds 涓哄悓鏃剁敓鎴愮殑 FREEZE_WALL 瀹炰綋 id銆侻OVE 琚樆鏂洿鑷宠В闄ゃ€?*/
  | { type: 'PLAYER_FROZEN'; wallEntityIds: string[] }
  /** 鍐伴湝宸ㄤ汉瑙ｉ櫎鍐荤粨锛堢3绔狅紝鐜╁涓诲姩鏀诲嚮 FROST_GIANT_FREEZE_ATTACKS_TO_BREAK 娆″悗锛夛細FREEZE_WALL 鍚屾绉婚櫎銆?*/
  | { type: 'PLAYER_UNFROZEN' }
  /** 鍐伴湝宸ㄤ汉銆屽啺闇滈噸鍑汇€嶇粨绠楋紙绗?绔狅紝姣?FROST_GIANT_HEAVY_STRIKE_INTERVAL 鍥炲悎锛夛細浠?boss 鑷韩涓轰腑蹇冪殑 AOE锛屽崐寰?radius銆?*/
  | { type: 'FROST_HEAVY_STRIKE_RESOLVED'; bossId: string; center: Coord; radius: number }
  /** 鐜╁琚嚮閫€锛堝啺闇滈噸鍑诲懡涓悗锛夛細to 涓烘渶缁堣惤鐐癸紙鑻ヨ惤鍦ㄥ啺闈笂鍒欏凡缁撶畻婊戣锛夛紝slid 鏍囪鏄惁鍙戠敓浜嗘粦琛屻€?*/
  | { type: 'KNOCKBACK'; entityId: 'PLAYER'; from: Coord; to: Coord; slid: boolean }
  /** ICE_WALL/FREEZE_WALL 琚嚮纰庯紙鍐伴湝閲嶅嚮鎴栫媯鏆村啿閿嬪懡涓級锛歴hatteredCells 涓烘柊鐢熸垚鐨?SHATTERED_ICE 鏍煎瓙鍒楄〃銆?*/
  | { type: 'ICE_WALL_SHATTERED'; entityId: string; shatteredCells: Coord[] }
  /** 冰霜巨人狂暴冲锋预警：dir 为冲锋方向，path 为中心线；执行时车道总宽 5 格。 */
  | { type: 'CHARGE_TELEGRAPHED'; bossId: string; dir: Coord; path: Coord[] }
  /** 鍐伴湝宸ㄤ汉鐙傛毚鍐查攱鎵ц缁撶畻锛堢3绔狅級锛歳esult 鏍囪鏈鍐查攱鐨勭粨鏋滅被鍨嬨€?*/
  | { type: 'CHARGE_EXECUTED'; bossId: string; from: Coord; to: Coord; result: 'WALL_SHATTERED' | 'PLAYER_HIT' | 'ICE_WALL_SPAWNED' | 'NONE' }
  /** 鍐伴湝宸ㄤ汉鐙傛毚鍐查攱鏈懡涓椂锛屽湪闅忔満绌烘牸鏂扮敓鎴愪竴涓?ICE_WALL锛堢3绔狅級銆?*/
  | { type: 'ICE_WALL_SPAWNED'; entityId: string; pos: Coord }
  /** 娴佹矙宸ㄨ潕娴佹矙鎵╁紶锛堢2绔狅級锛氭湰娆″埛鍑虹殑鍔ㄦ€佹矙鍧戞牸瀛?+ 瀛樺湪鍥炲悎鏁般€?*/
  | { type: 'SAND_TIDE_SPAWNED'; tiles: Coord[]; duration: number }
  /** 娴佹矙宸ㄨ潕娌欐毚锛堢2绔狅紝娼滃湴鏃惰Е鍙戯級锛氭湰娆￠殢鏈鸿鐩栫殑鏍煎瓙锛涘懡涓帺瀹舵墍鍦ㄦ牸鏃堕澶?emit SANDSTORM_HIT銆?*/
  | { type: 'SANDSTORM_SPAWNED'; tiles: Coord[] }
  /** 娴佹矙宸ㄨ潕娌欐毚鍛戒腑鐜╁锛氱湡瀹炰激瀹筹紙鏃犺鎶ょ敳锛夈€?*/
  | { type: 'SANDSTORM_HIT'; damage: number; hp: number }
  /** 浼犲瑁呭鏁堟灉瑙﹀彂鎻愮ず锛圥hase 3锛夛紝渚涙垬鎶ュ睍绀恒€?*/
  | { type: 'LEGENDARY_TRIGGERED'; legendaryId: string; detail?: string }
  /** 鍛借疆鍏藉懡杞洖婧細棣栨琚嚮鏉€鏃跺師鍦板娲诲埌 50% 鐢熷懡銆?*/
  | { type: 'ELITE_REVIVE'; monsterId: string; hp: number }
  /** C3 FIRE_ELEMENTAL 鐖嗚鑷垎锛氭浜℃椂瀵?2 鏍煎唴鐜╁閫犳垚绛夋敾鍑诲姏鐪熷疄浼ゅ锛堟棤瑙嗘姢鐢诧級銆?*/
  | { type: 'ELITE_EXPLODE'; monsterId: string; pos: Coord; damage: number; hp: number }
  /** C2 FROST_SPRITE 瀵掑啺鍏夌幆锛氬瓨娲讳笖鍦ㄧ帺瀹?3 鏍煎唴鏃舵瘡鍥炲悎寮€濮?AP -1銆?*/
  | { type: 'FROST_AURA_DRAINED'; ap: number }
  /** 娌欐紶璺冭湧棣栨璺岃嚦鍗婅锛氱珛鍗宠繙绂荤帺瀹惰烦璺冿紝骞跺噯澶囦笅娆″弻鍊嶆敾鍑汇€?*/
  | { type: 'HOPPER_FRENZY_TRIGGERED'; monsterId: string; from: Coord; to: Coord }
  /** 娌欐紶璺冭湧鍙楀埌璺濈鈮?鐨勭帺瀹舵敾鍑诲悗鍚戠帺瀹跺弽搴旀帹杩?1 鏍笺€?*/
  | { type: 'HOPPER_REACTION_ADVANCED'; monsterId: string; from: Coord; to: Coord }
  /** 娌欐紶璺冭湧娑堣€楃媯韬佺姸鎬佸畬鎴愬弻鍊嶆敾鍑汇€?*/
  | { type: 'HOPPER_FRENZY_ATTACKED'; monsterId: string; damage: number }
  /** 姣掕潕鍛戒腑宸蹭腑姣掔帺瀹讹紝绔嬪嵆缁撶畻骞舵竻闄ゅ墿浣欐瘨浼ゃ€?*/
  | { type: 'POISON_DETONATED'; monsterId: string; damage: number; hp: number }
  /** 鍐板埡璞尓鍙嶅脊鐜╁鏈鐩存帴鏀诲嚮鐨勯儴鍒嗘渶缁堜激瀹炽€?*/
  | { type: 'FROSTSPIKE_REFLECTED'; monsterId: string; damage: number; hp: number }
  /** 鍐伴湝绮剧伒鐗虹壊鏈洖鍚堟敾鍑伙紝鍦ㄧ帺瀹跺皠绾夸笂鐢熸垚鐭椂鍐板銆?*/
  | { type: 'FROST_SPRITE_WALL_RAISED'; monsterId: string; entityId: string; pos: Coord }
  /** 鍐板窛绛戝鑰呴鍛婁笅涓€墿鍥炲悎灏嗗皝浣忕殑鏍煎瓙銆?*/
  | { type: 'GLACIER_SHAPER_WALL_TELEGRAPHED'; monsterId: string; pos: Coord }
  /** 鍐板窛绛戝鑰呬紭鍏堝皝浣忕帺瀹堕€€璺垨渚х考锛岀敓鎴愮煭鏃跺啺澧欍€?*/
  | { type: 'GLACIER_SHAPER_WALL_RAISED'; monsterId: string; entityId: string; pos: Coord }
  /** 鍐板窛绛戝鑰呯殑棰勫憡琚帺瀹剁牬鍧忔垨鑷劧钀界┖銆?*/
  | { type: 'GLACIER_SHAPER_WALL_FIZZLED'; monsterId: string; pos: Coord }
  /** 鐜╁鍦ㄩ鍛婄敓鏁堝墠鍑绘潃鍐板窛绛戝鑰咃紝鑾峰緱鍙嶅埗濂栧姳銆?*/
  | { type: 'GLACIER_SHAPER_COUNTERED'; monsterId: string; amount: number; ap: number }
  /** 鐏劙鍏冪礌棰勫憡涓嬩釜鎬墿鍥炲悎灏嗙偣鐕冪殑鍖哄煙銆?*/
  | { type: 'FIRE_ELEMENTAL_LAVA_TELEGRAPHED'; monsterId: string; cells: Coord[] }
  /** 鐏劙鍏冪礌灏嗛鍛婂尯鍩熺湡姝ｇ偣鐕冧负涓存椂鐔斿博銆?*/
  | { type: 'FIRE_ELEMENTAL_LAVA_SPREAD'; monsterId: string; tiles: Coord[]; duration: number }
  /** 鐏扮儸鐚庣姮绔欏湪鐔斿博鍦板潡涓婃椂鏀诲嚮鑾峰緱澧炰激銆?*/
  | { type: 'ASH_HOUND_LAVA_EMPOWERED'; monsterId: string; damage: number }
  /** 宀╂祮锜逛负鐩搁偦鍙嬪啗鍒嗘媴浼ゅ锛涜煿涓嶄細鍥犲垎鎷呯洿鎺ユ浜°€?*/
  | { type: 'LAVA_CRAB_GUARDED'; crabId: string; targetId: string; damage: number; crabHp: number }
  /** 鍛借繍瀹堟湜鑰呰鍙栫帺瀹舵湰鍥炲悎涓昏琛屼负骞跺姞閫熼€艰繎銆?*/
  | { type: 'FATE_WATCHER_ADAPTED'; monsterId: string; action: 'ATTACK' | 'MOVE' }
  /** 杩滅▼鏀诲嚮锛坮ange鈮?锛夎鎺╀綋鍦板舰閬尅銆佹墦涓嶅嚭锛圥hase 2 LOS锛孉C-MT-4锛夈€?*/
  | { type: 'ATTACK_BLOCKED_BY_COVER'; attackerId: string; targetId: string; blockerPos: Coord };

/** core 绾嚱鏁扮粺涓€杩斿洖锛氬彉鏇村悗鐨勭姸鎬?+ 鏈浜х敓鐨勪簨浠跺簭鍒椼€?*/
export interface ApplyResult {
  state: ExpeditionState;
  events: PveEvent[];
}

// 鈹€鈹€ 灞€澶栧厓杩涘害锛圓C-20锛岃繙寰侀棿鎸佷箙鍖栵級 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

/**
 * PVE 灞€澶栧厓杩涘害锛坉esign 搂2.1锛氭浜″悗淇濈暀鐨勫眬澶栬祫浜э級銆?
 * 瀛樺偍浜?`users` 浜戞枃妗ｏ紝涓嶅睘浜?`ExpeditionState`銆?
 */
export interface PveMeta {
  /** 褰撳墠閽荤煶浣欓锛堢敤鎴风骇绱璐у竵锛岀敱缁撶畻浜戝嚱鏁扮疮鍔狅紝姝ゅ涓哄彧璇诲揩鐓э級銆?*/
  diamond: number;
  /** 褰撳墠杩滃緛浣撳姏锛涙柊杩滃緛娑堣€?20锛岀户缁瓨妗ｄ笉娑堣€椼€?*/
  stamina?: number;
  /** 体力上限。 */
  staminaMax?: number;
  /** 鏈弧浣撳姏鏃朵笅涓€鐐规仮澶嶇殑鏈嶅姟绔椂闂存埑锛涙弧浣撳姏鏃朵负 null銆?*/
  staminaNextRecoveryAt?: number | null;
  /** 鍘嗗彶鍒拌揪鐨勬渶楂樻ゼ灞傦紝鐢ㄤ簬澶у巺韬唤鍗′笌鎺掕姒溿€?*/
  highestFloor?: number;
  /** 宸茶В閿佺殑鎴愬氨 id 鍒楄〃锛圓chievementId[]锛夈€?*/
  /** 鍥鹃壌锛氬凡瑙佽繃鐨勬€墿/瑁呭绫诲瀷銆?*/
  /** 旧账号兼容字段：已退役账号成长系统残留，仅保留给 GM/云端清理历史数据。 */
  tutorialCompleted?: boolean;
}
