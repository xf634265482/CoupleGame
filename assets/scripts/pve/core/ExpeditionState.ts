// 杩滃緛杩愯鎬佺敓鍛藉懆鏈燂紙design 搂2 / 搂14锛夛細寮€灞€銆佸洖鍚堟帹杩涖€佹ゼ灞傚垏鎹€佸瓨妗ｅ簭鍒楀寲銆佹浜＄粨绠椼€?// 杩欐槸 PVE core 鐨勭紪鎺掑眰 鈥斺€?缁勫悎 MapGenerator/ApSystem/MonsterAI 绛夌函閫昏緫妯″潡锛?// 浠嶄繚鎸侀浂妗嗘灦渚濊禆銆佺‘瀹氭€э紙鍚?runSeed + 鍚屾搷浣滃簭鍒?鈫?鍚岀粨鏋滐紝AC-13锛夛紝渚?Controller 涓庝簯绔绠楄皟鐢ㄣ€?
import { rollAp } from './ApSystem';
import { addAnima } from './AnimaSystem';
import { recordPlayerActionForMirror } from './bosses/FateGuardian';
import { warHornAssist } from './CombatSystem';
import { stepMonsters } from './MonsterAI';
import { tickInteractionExposure } from './AlertSystem';
import { generateFloor } from './MapGenerator';
import { isPlayerBurnImmune, tickMonsterDots } from './BossEquipTraitEffects';
import { VARIANT_FROST_SPRITE } from './Chapter3Monsters';
import {
  ANIMA_PROGRESS_CAP,
  AP_CARRY_CAP,
  INITIAL_ANIMA,
  INITIAL_CLASS,
  INITIAL_GOLD,
  INITIAL_HP,
  POISON_DAMAGE_PER_ROUND,
  STATIONARY_PRESSURE_MAX_STACKS,
  TOTAL_FLOORS,
  chapterOfFloor,
  isBossFloor,
  makeDifficultySnapshot,
} from './PveConstants';
import type { DifficultySnapshot } from './PveConstants';
import { createRng, hashSeed } from './rng';
import type { ApplyResult, Coord, ExpeditionState, FixedEntity, FloorState, PveEvent, PveMeta, RunPlayer } from './PveTypes';
import { buildFirstTutorialFloor } from '../tutorial/TutorialConfigs';
import {
  applyBalanceToFloor,
  createBalancedInitialPlayer,
  getBalancedApBase,
  getBalanceSnapshot,
  resolveProfessionBaseWithBalance,
} from './PveBalance';
import { legFateArmorHeal, legFortuneBlessingFloorHeal } from './LegendarySystem';
import { professionIdFromClassId } from './professions/ProfessionBaseStats';

function deriveFloorSeed(runSeed: number, floor: number): number {
  return hashSeed(`${runSeed}:floor:${floor}`);
}

function applyDifficultyToFloor(floorState: FloorState, diff: DifficultySnapshot): FloorState {
  if (diff.hpMult === 1 && diff.atkMult === 1) return floorState;
  return {
    ...floorState,
    monsters: floorState.monsters.map((m) => ({
      ...m,
      hp: Math.round(m.hp * diff.hpMult),
      maxHp: Math.round(m.maxHp * diff.hpMult),
      attack: Math.round(m.attack * diff.atkMult),
    })),
  };
}

function createInitialPlayerWithBalance(
  chapter: number,
  balanceSnapshot?: ExpeditionState['balanceSnapshot'],
): RunPlayer {
  const base = createBalancedInitialPlayer(balanceSnapshot, chapter);
  return {
    hp: base.hp,
    maxHp: base.maxHp,
    gold: base.gold,
    anima: base.anima,
    animaProgress: base.animaProgress,
    animaThreshold: ANIMA_PROGRESS_CAP,
    classId: INITIAL_CLASS,
    equipment: {},
  };
}

function startFloorTurn(
  generated: FloorState,
  chapter: number,
  balanceSnapshot?: ExpeditionState['balanceSnapshot'],
): FloorState {
  const rng = createRng(generated.rngState);
  const { dice, ap } = rollAp(rng, getBalancedApBase(balanceSnapshot, chapter));
  const finalAp = ap;
  return { ...generated, ap: finalAp, maxAp: finalAp, dice, turn: 1, rngState: rng.state() };
}

function collectRevealedCells(revealed: boolean[][]): Coord[] {
  const cells: Coord[] = [];
  for (let y = 0; y < revealed.length; y++) {
    for (let x = 0; x < revealed[y].length; x++) {
      if (revealed[y][x]) cells.push({ x, y });
    }
  }
  return cells;
}

/**
 * 开启一次新远征：生成第 1 层、初始化玩家与首回合 AP。
 * meta 仅用于教程等账户状态。
 */
export function startExpedition(
  runSeed: number,
  meta?: PveMeta,
  balanceSnapshot?: ExpeditionState['balanceSnapshot'],
  difficultyTier?: string,
): ExpeditionState {
  const floor = 1;
  const snapshot = getBalanceSnapshot(balanceSnapshot);
  const difficultySnapshot = makeDifficultySnapshot((difficultyTier as DifficultySnapshot['tier']) ?? 'NORMAL');
  const player = createInitialPlayerWithBalance(chapterOfFloor(floor), snapshot);

  // 鏂版父鎴忕帺瀹舵棤璇嶆潯锛屼紶绌烘暟缁勶紙淇濇寔鍑芥暟绛惧悕涓€鑷达級
  const useTutorialFloor = floor === 1 && meta?.tutorialCompleted !== true;
  const firstFloorBase = useTutorialFloor
    ? buildFirstTutorialFloor(deriveFloorSeed(runSeed, floor))
    : generateFloor(floor, deriveFloorSeed(runSeed, floor), player.classId);
  const firstFloor = applyDifficultyToFloor(
    applyBalanceToFloor(firstFloorBase, snapshot, chapterOfFloor(floor)),
    difficultySnapshot,
  );
  const floorState = startFloorTurn(firstFloor, chapterOfFloor(floor), snapshot);

  return {
    runSeed,
    chapter: chapterOfFloor(floor),
    floor,
    status: 'ACTIVE',
    player,
    floorState,
    balanceSnapshot: snapshot,
    difficultySnapshot,
    ...(useTutorialFloor ? { isTutorialRun: true } : {}),
  };
}

/**
 * 缁撴潫褰撳墠鍥炲悎锛氭€墿鎸?AI 琛屽姩涓€娆★紝闅忓悗寮€鍚笅涓€鍥炲悎骞堕噸鏂版幏 AP锛圓C-3锛夈€? * 杩滃緛闈?ACTIVE 鎴栨ゼ灞傚凡閫氬叧鏃朵负 no-op锛涙€墿琛屽姩瀵艰嚧鐜╁闃典骸鍒欏仠鍦?DEAD锛屼笉鍐嶅紑鍚柊鍥炲悎銆? */
export function endTurn(state: ExpeditionState): ApplyResult {
  if (state.status !== 'ACTIVE' || state.floorState.status !== 'EXPLORING') {
    return { state, events: [] };
  }

  const events: PveEvent[] = [{ type: 'TURN_END', turn: state.floorState.turn }];

  // 鍛借繍瀹堝崼琛屼负闀滃儚锛氱帺瀹跺洖鍚堢粨鏉熴€佹€墿鍥炲悎寮€濮嬩箣鍓嶏紝璁板綍鐜╁鏈洖鍚堣涓哄埌娲婚暅鍍忕殑 pendingBehavior
  // 锛圓TTACK > MOVE > IDLE 浼樺厛绾т簰鏂ワ紱闀滃儚鍦ㄤ笅涓€墿鍥炲悎鎸夋鎵ц锛夈€?
  const attackedThisTurn = !!state.floorState.playerAttackedThisTurn;
  const stepsThisTurn = state.floorState.playerStepsThisTurn ?? 0;
  const mirrorRecord = recordPlayerActionForMirror(state, attackedThisTurn, stepsThisTurn);
  events.push(...mirrorRecord.events);

  const previousPressureStacks = mirrorRecord.state.floorState.stationaryPressureStacks ?? 0;
  const hasStationaryPressureThreat = mirrorRecord.state.floorState.monsters.some((monster) => {
    if (monster.aiState === 'DEAD' || monster.side === 'ALLY' || monster.type === 'ANIMA') return false;
    const distance = Math.abs(monster.pos.x - mirrorRecord.state.floorState.player.x)
      + Math.abs(monster.pos.y - mirrorRecord.state.floorState.player.y);
    return attackedThisTurn || monster.aiState === 'CHASE' || distance <= monster.aggroRadius;
  });
  const stationaryPressureStacks = stepsThisTurn === 0 && hasStationaryPressureThreat
    ? Math.min(STATIONARY_PRESSURE_MAX_STACKS, previousPressureStacks + 1)
    : 0;
  let beforeAi: ExpeditionState = {
    ...mirrorRecord.state,
    floorState: {
      ...mirrorRecord.state.floorState,
      stationaryPressureStacks: stationaryPressureStacks > 0 ? stationaryPressureStacks : undefined,
    },
  };
  if (stationaryPressureStacks !== previousPressureStacks) {
    events.push({ type: 'STATIONARY_PRESSURE_CHANGED', stacks: stationaryPressureStacks });
  }
  if (beforeAi.floorState.turn % 5 === 0) {
    const hornResult = warHornAssist(beforeAi);
    beforeAi = hornResult.state;
    events.push(...hornResult.events);
  }

  const aiResult = stepMonsters(beforeAi);
  events.push(...aiResult.events);
  if (aiResult.state.status === 'DEAD') {
    return { state: aiResult.state, events };
  }
  const postExposureState = tickInteractionExposure(aiResult.state, events);

  const rng = createRng(postExposureState.floorState.rngState);
  const professionApBase = postExposureState.persistentFloorMode
    ? resolveProfessionBaseWithBalance(
      professionIdFromClassId(postExposureState.player.classId),
      postExposureState.balanceSnapshot,
      postExposureState.chapter,
    ).apBase
    : getBalancedApBase(postExposureState.balanceSnapshot, postExposureState.chapter);
  const { dice, ap } = rollAp(rng, professionApBase);
  const nextTurn = postExposureState.floorState.turn + 1;

  // AP 缁撹浆锛氫笂鍥炲悎鍓╀綑 AP 鎸夊浐瀹氫笂闄愬姞鍏ユ湰鍥炲悎銆?
  const carryCap = AP_CARRY_CAP;
  const carryAp = Math.min(postExposureState.floorState.ap, carryCap);
  let finalAp = ap + carryAp;

  // 鍛借繍瀹堝崼 E5 鍛借繍灏侀攣锛氫笂涓€涓?Boss 鍥炲悎鍐欏叆 destinyLockNextTurn=true 鈫?鏈洖鍚?AP 鍑忓崐锛堟渶灏?1锛?
  const destinyLocked = !!postExposureState.floorState.destinyLockNextTurn;
  if (destinyLocked) {
    finalAp = Math.max(1, Math.floor(finalAp / 2));
  }

  // C2: FROST_SPRITE 瀵掑啺鍏夌幆 鈥?浠绘剰瀛樻椿鐨?FROST_SPRITE 鍦ㄧ帺瀹?3 鏍兼浖鍝堥】璺濈鍐咃紝鏈洖鍚?AP -1
  const frostSpriteAuraActive = postExposureState.floorState.monsters.some(
    (m) => m.variantId === VARIANT_FROST_SPRITE && m.aiState !== 'DEAD'
      && Math.abs(m.pos.x - postExposureState.floorState.player.x) + Math.abs(m.pos.y - postExposureState.floorState.player.y) <= 3,
  );
  if (frostSpriteAuraActive) {
    finalAp = Math.max(1, finalAp - 1);
    events.push({ type: 'FROST_AURA_DRAINED', ap: finalAp });
  }

  events.push({ type: 'AP_ROLLED', turn: nextTurn, dice, ap: finalAp });
  if (carryAp > 0) events.push({ type: 'AP_CARRIED', amount: carryAp });
  if (destinyLocked) events.push({ type: 'DESTINY_AP_LOCKED', nextTurnAp: finalAp });

  // Boss 瑁呭 trait: boss_burn_immune锛堢劙蹇冩姢鑳革級鈫?鐜╁瀹屽叏鍏嶇柅鐔斿博/璧ょ値鐏肩儳
  const burnImmune = isPlayerBurnImmune(postExposureState.player.equipment);

  // 鐔斿博棰嗕富鐏肩儳 tick锛氭瘡鍥炲悎寮€濮嬫椂 -10 HP锛埫?0 鍩哄噯锛屽師 -1锛?
  const burnRemaining = postExposureState.floorState.playerBurnRemaining ?? 0;
  let burnedHp = postExposureState.player.hp;
  let newBurnRemaining = burnRemaining;
  let burnDead = false;
  if (burnRemaining > 0 && !burnImmune) {
    burnedHp = Math.max(0, burnedHp - 10);
    newBurnRemaining = burnRemaining - 1;
    burnDead = burnedHp <= 0;
    events.push({ type: 'BURN_TICK', damage: 10, hp: burnedHp });
    if (burnDead) events.push({ type: 'PLAYER_DEAD' });
  } else if (burnImmune && burnRemaining > 0) {
    newBurnRemaining = 0;
  }

  // 璧ょ値鍝ュ竷鏋楃伡鐑?DoT锛氭瘡鍥炲悎绱 5HP锛埫?0 鍩哄噯锛屽師 0.5HP锛夛紝绱婊?10 鏃剁粨绠椾竴娆℃暣鏁颁激瀹?
  const fireBurnRounds = postExposureState.floorState.playerFireBurnRounds ?? 0;
  const fireBurnAccum = postExposureState.floorState.playerFireBurnAccum ?? 0;
  let newFireBurnRounds = fireBurnRounds;
  let newFireBurnAccum = fireBurnAccum;
  if (fireBurnRounds > 0 && !burnDead && !burnImmune) {
    const newAccum = fireBurnAccum + 5;
    const fireDmg = Math.floor(newAccum / 10) * 10;
    newFireBurnAccum = newAccum - fireDmg;
    newFireBurnRounds = fireBurnRounds - 1;
    if (fireDmg > 0) {
      burnedHp = Math.max(0, burnedHp - fireDmg);
      burnDead = burnedHp <= 0;
      events.push({ type: 'BURN_TICK', damage: fireDmg, hp: burnedHp });
      if (burnDead) events.push({ type: 'PLAYER_DEAD' });
    }
  } else if (burnImmune) {
    newFireBurnRounds = 0;
    newFireBurnAccum = 0;
  }

  // 涓瘨 DoT锛堟瘨铦?POISON_SCORPION锛夛細姣忓洖鍚?8 HP 浼ゅ锛屼笉鍙犲姞锛屽埛鏂拌鏃?
  const poisonRounds = postExposureState.floorState.playerPoisonRounds ?? 0;
  let newPoisonRounds = poisonRounds;
  if (poisonRounds > 0 && !burnDead) {
    burnedHp = Math.max(0, burnedHp - POISON_DAMAGE_PER_ROUND);
    newPoisonRounds = poisonRounds - 1;
    burnDead = burnedHp <= 0;
    events.push({ type: 'POISON_TICK', damage: POISON_DAMAGE_PER_ROUND, hp: burnedHp });
    if (burnDead) events.push({ type: 'PLAYER_DEAD' });
  }

  // 怪物 DoT tick（流血 / 灼烧 / 中毒 — 装备 trait 等）：
  // 在玩家结算后处理；怪物可能因此死亡。不触发击杀掉落（非玩家直接击杀），
  // 但必须 emit KILL，否则永久层目标（如第 10 层哨卫清剿）无法完成、传送门不刷。
  const prevDotMonsters = postExposureState.floorState.monsters;
  const dotResult = tickMonsterDots(prevDotMonsters);
  const dotMonsters = dotResult.monsters;
  for (const monster of dotMonsters) {
    const before = prevDotMonsters.find((entry) => entry.id === monster.id);
    if (before && before.aiState !== 'DEAD' && monster.aiState === 'DEAD') {
      events.push({ type: 'KILL', monsterId: monster.id, monsterType: monster.type });
    }
  }

  // 绉诲姩AP鎯╃綒鍊掕鏃?
  const moveApPenaltyRounds = postExposureState.floorState.playerMoveApPenaltyRounds ?? 0;
  const newMoveApPenaltyRounds = Math.max(0, moveApPenaltyRounds - 1);

  // 闄愭椂鍦板潡鍊掕鏃讹細鍑″甫 remaining 鐨勬湭娑堣€楀疄浣擄紙LAVA_TILE 鐔斿博 / ICE_TILE 鍐伴潰 / 鍔ㄦ€?SAND_PIT 娴佹矙锛?  // 姣忓洖鍚堢粨鏉?remaining-1锛屽綊闆剁Щ闄わ紱鏃?remaining 鐨勫疄浣擄紙闈欐€佹矙鍧?鐭冲潡/鍐板绛夛級姘镐箙淇濈暀銆?  // 娉ㄦ剰锛歀AVA_TILE 韪╁叆浼ゅ宸茬Щ鑷?MovementSystem.applyMove锛堟鍏ュ嵆鏃剁粨绠楋級锛岃繖閲屼粎鍋氬€掕鏃躲€?
  const lavaHp = burnedHp;
  const lavaDead = burnDead;
  const hpChanged = burnRemaining > 0 || (fireBurnRounds > 0 && Math.floor((fireBurnAccum + 5) / 10) > 0) || poisonRounds > 0;
  const entitiesAfterLava: FixedEntity[] = [];
  for (const entity of postExposureState.floorState.entities) {
    if (entity.consumed) {
      entitiesAfterLava.push(entity);
      continue;
    }
    if (entity.remaining === undefined) {
      entitiesAfterLava.push(entity);
      continue;
    }
    const remaining = entity.remaining - 1;
    if (remaining > 0) entitiesAfterLava.push({ ...entity, remaining });
  }

  const nextState: ExpeditionState = {
    ...postExposureState,
    status: lavaDead ? 'DEAD' : postExposureState.status,
    player: hpChanged
      ? { ...postExposureState.player, hp: lavaHp }
      : postExposureState.player,
    floorState: {
      ...postExposureState.floorState,
      ap: finalAp,
      maxAp: finalAp,
      dice,
      turn: nextTurn,
      rngState: rng.state(),
      entities: entitiesAfterLava,
      monsters: dotMonsters, // 搴旂敤鎬墿 DoT tick 缁撴灉锛堟祦琛€/鐏肩儳锛?
      playerBurnRemaining: newBurnRemaining > 0 ? newBurnRemaining : undefined,
      playerFireBurnRounds: newFireBurnRounds > 0 ? newFireBurnRounds : undefined,
      playerFireBurnAccum: newFireBurnRounds > 0 ? newFireBurnAccum : undefined,
      playerPoisonRounds: newPoisonRounds > 0 ? newPoisonRounds : undefined,
      playerMoveApPenaltyRounds: newMoveApPenaltyRounds > 0 ? newMoveApPenaltyRounds : undefined,
      status: lavaDead ? 'DEAD' : postExposureState.floorState.status,
      shoesFirstMoveDone: undefined, // 姣忓洖鍚堝紑濮嬫椂閲嶇疆闈村瓙棣栨鍏嶈垂鏍囪
      destinyLockNextTurn: undefined, // 鍛借繍灏侀攣鏈洖鍚堝凡缁撶畻锛坒inalAp 宸插噺鍗婏級锛屾竻绌?
      playerAttackedThisTurn: undefined,
      playerStepsThisTurn: undefined,
      killApRefundedThisTurn: undefined,
      rogueAttackCountThisTurn: 0,
      rogueHidden: undefined,
    },
  };

  return { state: nextState, events };
}

/**
 * 浠庡瓨妗ｆ仮澶嶈繙寰侊紙design ddl-sql.md 搂1 / AC-11锛夛細瀛樻。璁板綍"宸插畬鎴愮殑灞傚彿"锛? * 缁帺鍥哄畾浠庝笅涓€灞傚紑濮嬶紙涓嶅仛灞傚唴鏂偣缁帺锛夈€傛寜 runSeed + 灞傚彿娲剧敓鍦板浘绉嶅瓙锛? * 涓?advanceFloor 瑙勫垯涓€鑷达紝淇濊瘉浜戠鍙寜鐩稿悓瑙勫垯澶嶇畻锛圓C-13锛夈€? * 璋冪敤鏂归』淇濊瘉 `completedFloor < TOTAL_FLOORS`锛堝凡閫氬叧鍏ㄩ儴妤煎眰搴旇蛋缁撶畻娴佺▼锛屼笉浼氱暀鏈夊彲缁瓨妗ｏ級銆? */
export function resumeExpedition(
  runSeed: number,
  floor: number,
  player: RunPlayer,
  savedFloorState?: FloorState | null,
  balanceSnapshot?: ExpeditionState['balanceSnapshot'],
  difficultySnapshot?: DifficultySnapshot | null,
): ApplyResult {
  const snapshot = getBalanceSnapshot(balanceSnapshot);
  if (savedFloorState) {
    const allowTutorialState = floor === 1 && !!savedFloorState.tutorialScenarioId;
    const normalizedFloorState = (allowTutorialState
      ? savedFloorState
      : {
        ...savedFloorState,
        tutorialScenarioId: undefined,
        tutorialGuide: undefined,
      });
    return {
      state: {
        runSeed,
        chapter: chapterOfFloor(floor),
        floor,
        status: normalizedFloorState.status === 'DEAD' ? 'DEAD' : 'ACTIVE',
        player,
        floorState: normalizedFloorState,
        balanceSnapshot: snapshot,
        ...(allowTutorialState ? { isTutorialRun: true } : {}),
      },
      events: [],
    };
  }

  const nextFloor = floor + 1;
  const diff = difficultySnapshot ?? makeDifficultySnapshot('NORMAL');
  const floorState = startFloorTurn(
    applyDifficultyToFloor(
      applyBalanceToFloor(generateFloor(nextFloor, deriveFloorSeed(runSeed, nextFloor), player.classId), snapshot, chapterOfFloor(nextFloor)),
      diff,
    ),
    chapterOfFloor(nextFloor),
    snapshot,
  );
  const events: PveEvent[] = [
    { type: 'REVEAL', cells: collectRevealedCells(floorState.revealed) },
    { type: 'AP_ROLLED', turn: floorState.turn, dice: floorState.dice, ap: floorState.ap },
  ];

  return {
    state: {
      runSeed,
      chapter: chapterOfFloor(nextFloor),
      floor: nextFloor,
      status: 'ACTIVE',
      player,
      floorState,
      balanceSnapshot: snapshot,
      difficultySnapshot: diff,
    },
    events,
  };
}

/**
 * 鎺ㄨ繘鍒颁笅涓€灞傦細褰撳墠灞傞』宸?CLEARED锛屽惁鍒?no-op銆傛渶鍚庝竴灞傞€氬叧鍚庤繙寰佺姸鎬佺疆涓?COMPLETED銆? * 鏂版ゼ灞傜敱 `runSeed + 灞傚彿` 娲剧敓绉嶅瓙鐢熸垚锛屼繚璇佸彲澶嶇幇锛圓C-13锛夛紱浜х敓 REVEAL 浜嬩欢鎻ず鍑虹敓鐐硅閲庛€? */
export function advanceFloor(state: ExpeditionState): ApplyResult {
  if (state.floorState.status !== 'CLEARED') {
    return { state, events: [] };
  }

  // 绔犺妭 Boss 灞傞€氬叧鏃惰褰?宸查€氬叧鏈€澶х珷鑺?锛屼緵浜岄樁瑙夐啋鏉′欢鍒ゅ畾浣跨敤銆?
  const clearedChapter = chapterOfFloor(state.floor);
  let player: RunPlayer = isBossFloor(state.floor) && (state.player.maxChapterCleared ?? 0) < clearedChapter
    ? { ...state.player, maxChapterCleared: clearedChapter }
    : state.player;

  const fateArmorHeal = legFateArmorHeal(player.equipment, player.maxHp);
  if (fateArmorHeal > 0) {
    player = { ...player, hp: Math.min(player.maxHp, player.hp + fateArmorHeal) };
  }
  // 浼犲锛氳储绁炶祼绂?鈥?姣忓眰鍏ュ満鎸夋寔鏈夐噾甯佸洖琛€锛堟瘡20閲?1HP锛屾渶澶?5HP锛?
  const fortuneBlessingHeal = legFortuneBlessingFloorHeal(player.equipment, player.gold);
  if (fortuneBlessingHeal > 0) {
    player = { ...player, hp: Math.min(player.maxHp, player.hp + fortuneBlessingHeal) };
  }

  const nextFloor = state.floor + 1;
  if (nextFloor > TOTAL_FLOORS) {
    return { state: { ...state, player, status: 'COMPLETED' }, events: [] };
  }

  const advDiff = state.difficultySnapshot ?? makeDifficultySnapshot('NORMAL');
  const floorState = startFloorTurn(
    applyDifficultyToFloor(
      applyBalanceToFloor(
        generateFloor(nextFloor, deriveFloorSeed(state.runSeed, nextFloor), player.classId),
        state.balanceSnapshot,
        chapterOfFloor(nextFloor),
      ),
      advDiff,
    ),
    chapterOfFloor(nextFloor),
    state.balanceSnapshot,
  );
  const events: PveEvent[] = [
    { type: 'REVEAL', cells: collectRevealedCells(floorState.revealed) },
    { type: 'AP_ROLLED', turn: floorState.turn, dice: floorState.dice, ap: floorState.ap },
  ];

  let next: ExpeditionState = {
    ...state,
    chapter: chapterOfFloor(nextFloor),
    floor: nextFloor,
    status: 'ACTIVE',
    player,
    floorState,
    isTutorialRun: false,
  };

  // 閬楃墿锛氭祦娌欎箣蹇?鈥?杩涘叆鏂版埧闂撮殢鏈虹敓鎴?2 鏍兼矙鍧戯紙娑堣€楁湰灞?rngState 鎺ㄨ繘锛岀‘瀹氭€э級
  return { state: next, events };
}

/**
 * 姝讳骸缁撶畻锛坉esign 搂2.1 / AC-12锛夛細娓呯┖灞€鍐呰繘搴?鈥斺€?瑁呭銆佽亴涓氥€佽亴涓氳瘝鏉°€佸綋鍓嶉噾甯?鐏垫皵
 * 锛堝惈鏈杩滃緛鏀堕泦鐨勮亴涓氱鐗囪繘搴︼級锛屼繚鐣欏眬澶栧厓杩涘害锛堣处鎴烽捇鐭?鍛借繍纰庣墖/鎴愬氨/鍥鹃壌锛屽瓨浜?users 闆嗗悎锛? * 涓嶅湪 ExpeditionState 鑼冨洿鍐咃紝鐢变簯绔?settleRun 澶勭悊锛夈€傞潪 DEAD 鐘舵€佹椂涓?no-op銆? *
 * 鍛借繍鏍?A3銆岄仐浜ф剰蹇椼€嶏細淇濈暀 deathGoldRetentionPct 姣斾緥鐨勯噾甯侊紙鍚戜笅鍙栨暣锛夎€岄潪娓呴浂銆? */
export function applyDeath(state: ExpeditionState): ApplyResult {
  if (state.status !== 'DEAD') {
    return { state, events: [] };
  }

  const basePlayer = createInitialPlayerWithBalance(
    1,
    state.balanceSnapshot,
  );

  const player: RunPlayer = {
    ...basePlayer,
    bag: [],
    maxChapterCleared: undefined,
  };

  return {
    state: { ...state, player },
    events: [],
  };
}

/**
 * 浠呭紑鍙戣皟璇曪細灏嗚繙寰佺姸鎬佸揩閫熻烦鑷崇洰鏍囧眰锛堜笉浜х敓浠讳綍浜嬩欢锛孶I 涓嶄細鎾姩鐢伙級銆? * 閫氳繃杩炵画浼€?褰撳墠灞傚凡閫氬叧"鍐嶈皟鐢?advanceFloor 瀹炵幇锛屽鐢ㄧ幇鏈夋ゼ灞傛帹杩涢€昏緫锛? * 淇濊瘉鍚勫眰闅忔満绉嶅瓙涓庢寮忔父鎴忓畬鍏ㄤ竴鑷达紙鍙鐜?Boss 灞傚竷灞€锛夈€? * 閰嶅悎 PveConstants.DEV_SKIP_TO_FLOOR 浣跨敤锛涙寮忔瀯寤烘椂璇ュ父閲忓簲涓?0锛屾鍑芥暟涓嶄細琚皟鐢ㄣ€? */
export function devSkipToFloor(state: ExpeditionState, target: number): ExpeditionState {
  let s = state;
  while (s.floor < target && s.status === 'ACTIVE') {
    const cleared: ExpeditionState = {
      ...s,
      floorState: { ...s.floorState, status: 'CLEARED' },
    };
    const result = advanceFloor(cleared);
    if (result.state === cleared) break; // safety: advanceFloor 杩斿洖 no-op锛岄槻姝诲惊鐜?
    s = result.state;
  }
  return s;
}

/** 搴忓垪鍖栦负鍙啓鍏?pve_saves 鐨?JSON 瀛楃涓诧紙ExpeditionState 涓虹函鏁版嵁锛屽惈 RNG 绉嶅瓙鍙畬鏁村鍘燂級銆?*/
export function serialize(state: ExpeditionState): string {
  return JSON.stringify(state);
}

/** 浠庡瓨妗?JSON 杩樺師 ExpeditionState锛堜笌 serialize 浜掍负閫嗘搷浣滐級銆?*/
export function deserialize(json: string): ExpeditionState {
  return JSON.parse(json) as ExpeditionState;
}
