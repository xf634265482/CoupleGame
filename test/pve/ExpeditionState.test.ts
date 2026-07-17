import {
  advanceFloor,
  applyDeath,
  deserialize,
  endTurn,
  resumeExpedition,
  serialize,
  startExpedition,
} from '../../assets/scripts/pve/core/ExpeditionState';
import { applyMove } from '../../assets/scripts/pve/core/MovementSystem';
import {
  ANIMA_PER_STRENGTHEN,
  AP_BASE,
  AP_CARRY_CAP,
  AWAKEN_REQUIRED_CHAPTER,
  AWAKEN_SECONDARY_TOTAL,
  CLASS_FRAGMENTS_TO_AWAKEN,
  FLOORS_PER_CHAPTER,
  INITIAL_ANIMA,
  INITIAL_GOLD,
  INITIAL_HP,
  TOTAL_FLOORS,} from '../../assets/scripts/pve/core/PveConstants';
import type { PveMeta } from '../../assets/scripts/pve/core/PveTypes';
import { makeExpeditionState, makeMonster } from './helpers';
import type { Direction } from '../../assets/scripts/pve/core/MovementSystem';

function makeMeta(overrides: Partial<PveMeta> = {}): PveMeta {
  return {
    destinyShards: 1000,
    diamond: 0,
    ...overrides,
  };
}

describe('ExpeditionState 鈥?杩滃緛鐢熷懡鍛ㄦ湡锛圓C-3, AC-11, AC-12, AC-13锛?', () => {
  describe('startExpedition', () => {
    it('鐢熸垚绗?1 灞傘€佸垵濮嬬帺瀹朵笌棣栧洖鍚?AP', () => {
      const state = startExpedition(2026);
      expect(state.runSeed).toBe(2026);
      expect(state.chapter).toBe(1);
      expect(state.floor).toBe(1);
      expect(state.status).toBe('ACTIVE');
      expect(state.player.classId).toBe('ADVENTURER');
      expect(state.player.classTraits).toEqual([]);
      expect(state.floorState.floor).toBe(1);
      expect(state.floorState.turn).toBe(1);
      expect(state.floorState.ap).toBe(state.floorState.maxAp);
      expect(state.floorState.ap).toBeGreaterThanOrEqual(9);
      expect(state.floorState.ap).toBeLessThanOrEqual(14);
    });

    it('鍚?runSeed 鐨勮繙寰佸紑灞€纭畾鍙鐜帮紙AC-13锛?', () => {
      const a = startExpedition(13579);
      const b = startExpedition(13579);
      expect(a).toEqual(b);
    });

    it('涓嶅悓 runSeed 閫氬父浜х敓涓嶅悓甯冨眬/楠板瓙', () => {
      const a = startExpedition(1);
      const b = startExpedition(2);
      expect(a).not.toEqual(b);
    });



  });

  describe('endTurn', () => {
    it('鎬墿琛屽姩鍚庡紑鍚笅涓€鍥炲悎骞堕噸鏂版幏 AP锛屼骇鐢?TURN_END 浜嬩欢', () => {
      const state = makeExpeditionState({
        floorOverrides: { player: { x: 0, y: 0 }, turn: 1, monsters: [] },
      });

      const result = endTurn(state);
      expect(result.state.floorState.turn).toBe(2);
      expect(result.state.floorState.ap).toBe(result.state.floorState.maxAp);
      expect(result.events[0]).toEqual({ type: 'TURN_END', turn: 1 });
    });

    it('鎬墿鍦ㄧ粨鏉熷洖鍚堥樁娈佃拷鍑?鏀诲嚮鐜╁', () => {
      const state = makeExpeditionState({
        floorOverrides: {
          player: { x: 4, y: 4 },
          turn: 1,
          monsters: [makeMonster('m1', { x: 4, y: 5 }, { aggroRadius: 5, range: 1, attack: 20 })],
        },
        playerOverrides: { hp: 200, maxHp: 200 },
      });

      const result = endTurn(state);
      expect(result.state.player.hp).toBe(175);
      expect(result.events.some((e) => e.type === 'PLAYER_DAMAGED')).toBe(true);
      expect(result.events).toContainEqual({ type: 'STATIONARY_PRESSURE_CHANGED', stacks: 1 });
    });

    it('鎬墿琛屽姩瀵艰嚧鐜╁闃典骸鏃跺仠鍦?DEAD锛屼笉寮€鍚柊鍥炲悎', () => {
      const state = makeExpeditionState({
        floorOverrides: {
          player: { x: 4, y: 4 },
          turn: 1,
          monsters: [makeMonster('m1', { x: 4, y: 5 }, { aggroRadius: 5, range: 1, attack: 99 })],
        },
        playerOverrides: { hp: 5, maxHp: 20 },
      });

      const result = endTurn(state);
      expect(result.state.status).toBe('DEAD');
      expect(result.state.floorState.turn).toBe(1); // 鏈繘鍏ヤ笅涓€鍥炲悎
      expect(result.events.some((e) => e.type === 'PLAYER_DEAD')).toBe(true);
    });

    it('杩滃緛闈?ACTIVE 鎴栨ゼ灞傞潪 EXPLORING 鏃朵负 no-op', () => {
      const cleared = makeExpeditionState({ floorOverrides: { status: 'CLEARED' } });
      expect(endTurn(cleared)).toEqual({ state: cleared, events: [] });

      const dead = makeExpeditionState({ playerOverrides: {}, floorOverrides: {} });
      const deadState = { ...dead, status: 'DEAD' as const };
      expect(endTurn(deadState)).toEqual({ state: deadState, events: [] });
    });

    it('鍚岀姸鎬佽皟鐢?endTurn 缁撴灉纭畾鍙鐜帮紙AC-13锛?', () => {
      const state = makeExpeditionState({
        floorOverrides: {
          player: { x: 4, y: 4 },
          turn: 3,
          monsters: [makeMonster('m1', { x: 6, y: 6 }, { aggroRadius: 5, range: 1 })],
        },
      });
      expect(endTurn(state)).toEqual(endTurn(state));
    });

    it('鎴樻枟涓繛缁笉绉诲姩鍙犲姞琚洿鏀伙紝鏈€澶?3 灞?', () => {
      let state = makeExpeditionState({
        floorOverrides: {
          player: { x: 4, y: 4 }, turn: 1,
          monsters: [makeMonster('threat', { x: 4, y: 7 }, { attack: 0, aggroRadius: 5 })],
        },
        playerOverrides: { hp: 200, maxHp: 200 },
      });
      for (let i = 0; i < 4; i++) state = endTurn(state).state;
      expect(state.floorState.stationaryPressureStacks).toBe(3);
    });

    it('浜や簰瀵艰嚧鐨勪复鏃舵毚闇蹭細鍦ㄦ€墿鍥炲悎鍚庨€掑噺锛屽苟鍦ㄧ粨鏉熸椂鍙戝嚭瑙ｉ櫎浜嬩欢', () => {
      const state = makeExpeditionState({
        floorOverrides: {
          player: { x: 0, y: 0 },
          turn: 1,
          playerExposedTurns: 1,
          monsters: [],
        },
      });

      const result = endTurn(state);
      expect(result.state.floorState.playerExposedTurns).toBeUndefined();
      expect(result.events).toContainEqual({ type: 'PLAYER_EXPOSURE_ENDED', source: 'INTERACTION' });
    });
  });

  describe('advanceFloor', () => {
    it('妤煎眰宸?CLEARED 鏃惰繘鍏ヤ笅涓€灞傦細绉嶅瓙娲剧敓纭畾銆乼urn 閲嶇疆銆佷骇鐢?REVEAL 浜嬩欢', () => {
      const state = makeExpeditionState({
        floor: 1,
        floorOverrides: { floor: 1, status: 'CLEARED' },
      });

      const result = advanceFloor(state);
      expect(result.state.floor).toBe(2);
      expect(result.state.chapter).toBe(1);
      expect(result.state.status).toBe('ACTIVE');
      expect(result.state.floorState.floor).toBe(2);
      expect(result.state.floorState.status).toBe('EXPLORING');
      expect(result.state.floorState.turn).toBe(1);
      expect(result.state.floorState.hasKey).toBe(false);
      expect(result.events[0].type).toBe('REVEAL');
    });

    it('妤煎眰鏈€氬叧鏃朵负 no-op', () => {
      const state = makeExpeditionState({ floorOverrides: { status: 'EXPLORING' } });
      expect(advanceFloor(state)).toEqual({ state, events: [] });
    });

    it('鍚岀瀛愮画鐜╀粠涓嬩竴灞傚紑濮嬶紝涓庤繛缁墦閫氬埌璇ュ眰鐨勫竷灞€涓€鑷达紙AC-11 缁帺锛?', () => {
      const runSeed = 999;
      const cleared1 = makeExpeditionState({
        seed: runSeed,
        floor: 1,
        floorOverrides: { floor: 1, status: 'CLEARED' },
      });
      const directlyAdvanced = advanceFloor({ ...cleared1, runSeed });

      // 妯℃嫙"杩斿洖澶у巺鍚庨噸鏂拌繘鍏?锛氫粠宸茬煡 runSeed + 鐩爣灞傚彿鐙珛閲嶅缓锛堜簯绔寜 runSeed+floor 娲剧敓绉嶅瓙涓€鑷达級
      const independentlyRebuilt = advanceFloor({ ...cleared1, runSeed });

      expect(directlyAdvanced.state.floorState).toEqual(independentlyRebuilt.state.floorState);
    });

    it('鏈€鍚庝竴灞傞€氬叧鍚庤繙寰佺姸鎬佺疆涓?COMPLETED', () => {
      const state = makeExpeditionState({
        floor: TOTAL_FLOORS,
        floorOverrides: { floor: TOTAL_FLOORS, status: 'CLEARED' },
      });

      const result = advanceFloor(state);
      expect(result.state.status).toBe('COMPLETED');
      expect(result.state.floor).toBe(TOTAL_FLOORS);
      expect(result.events).toEqual([]);
    });

    it('绔犺妭 Boss 灞傞€氬叧鍚庢洿鏂?player.maxChapterCleared锛坉esign 搂涓?瑙夐啋鍓嶇疆鏉′欢锛?', () => {
      const bossFloor = FLOORS_PER_CHAPTER; // 绗?绔?Boss 灞傦紙5锛?
      const state = makeExpeditionState({
        floor: bossFloor,
        floorOverrides: { floor: bossFloor, status: 'CLEARED' },
      });

      const result = advanceFloor(state);
      expect(result.state.player.maxChapterCleared).toBe(1);
    });

    it('闈?Boss 灞傞€氬叧涓嶆洿鏂?maxChapterCleared', () => {
      const state = makeExpeditionState({
        floor: 1,
        floorOverrides: { floor: 1, status: 'CLEARED' },
      });

      const result = advanceFloor(state);
      expect(result.state.player.maxChapterCleared).toBeUndefined();
    });

    it('鍑昏触绗笁绔?Boss 鍚庤嫢宸叉弧瓒冲叾浣欒閱掓潯浠讹紝emit CLASS_CAN_AWAKEN', () => {
      const ch3BossFloor = FLOORS_PER_CHAPTER * AWAKEN_REQUIRED_CHAPTER; // 绗?绔?Boss 灞傦紙15锛?
      const state = makeExpeditionState({
        floor: ch3BossFloor,
        floorOverrides: { floor: ch3BossFloor, status: 'CLEARED' },
        playerOverrides: {
          classId: 'BERSERKER',
          classFragments: { BERSERKER: CLASS_FRAGMENTS_TO_AWAKEN, ARCHER: AWAKEN_SECONDARY_TOTAL },
          maxChapterCleared: AWAKEN_REQUIRED_CHAPTER - 1,
        },
      });

      const result = advanceFloor(state);
      expect(result.state.player.maxChapterCleared).toBe(AWAKEN_REQUIRED_CHAPTER);
      expect(result.events.find((e) => e.type === 'CLASS_CAN_AWAKEN')).toEqual({
        type: 'CLASS_CAN_AWAKEN',
        classId: 'BERSERKER',
      });
    });

    it('鍙犲姞 2 涓?strengthen_ap_up 鍚庯紝鏂版ゼ灞?maxAp 涓?dice + 2锛堜笌 endTurn 鐨?traitCount 閫昏緫涓€鑷达級', () => {
      const state = makeExpeditionState({
        floor: 1,
        floorOverrides: { floor: 1, status: 'CLEARED' },
        playerOverrides: { classTraits: ['strengthen_ap_up', 'strengthen_ap_up'] },
      });

      const result = advanceFloor(state);
      const expectedAp = result.state.floorState.dice + AP_BASE + 2;
      expect(result.state.floorState.maxAp).toBe(expectedAp);
      expect(result.state.floorState.ap).toBe(expectedAp);
    });
  });

  describe('resumeExpedition', () => {
    it('浠庡瓨妗ｇ殑"宸插畬鎴愬眰鍙?鎭㈠锛屽浐瀹氫粠涓嬩竴灞傚紑濮嬪苟浜х敓 REVEAL 浜嬩欢锛圓C-11锛?', () => {
      const runSeed = 555;
      const player = startExpedition(runSeed).player;

      const result = resumeExpedition(runSeed, 1, player);
      expect(result.state.floor).toBe(2);
      expect(result.state.chapter).toBe(1);
      expect(result.state.status).toBe('ACTIVE');
      expect(result.state.player).toEqual(player);
      expect(result.state.floorState.floor).toBe(2);
      expect(result.state.floorState.status).toBe('EXPLORING');
      expect(result.state.floorState.turn).toBe(1);
      expect(result.events[0].type).toBe('REVEAL');
    });

    it('涓?鎵撻€氬綋鍓嶅眰鍚?advanceFloor"浜х敓鐨勪笅涓€灞傚竷灞€瀹屽叏涓€鑷达紙鍚?runSeed+妤煎眰绉嶅瓙娲剧敓瑙勫垯锛屼簯绔彲澶嶇畻 AC-13锛?', () => {
      const runSeed = 2024;
      const cleared = makeExpeditionState({
        seed: runSeed,
        floor: 3,
        floorOverrides: { floor: 3, status: 'CLEARED' },
      });

      const advanced = advanceFloor({ ...cleared, runSeed });
      const resumed = resumeExpedition(runSeed, 3, cleared.player);

      expect(resumed.state.floorState).toEqual(advanced.state.floorState);
      expect(resumed.state.floor).toBe(advanced.state.floor);
      expect(resumed.state.chapter).toBe(advanced.state.chapter);
    });
  });

  describe('resumeExpedition with saved floor snapshot', () => {
    it('restores an exploring floor snapshot instead of jumping to the next floor', () => {
      const runSeed = 4096;
      const exploring = makeExpeditionState({
        seed: runSeed,
        floor: 6,
        floorOverrides: {
          floor: 6,
          turn: 5,
          ap: 7,
          maxAp: 16,
          dice: 4,
          status: 'EXPLORING',
          player: { x: 4, y: 4 },
          hasKey: true,
        },
      });

      const result = resumeExpedition(runSeed, 6, exploring.player, exploring.floorState);
      expect(result.state.floor).toBe(6);
      expect(result.state.chapter).toBe(1); // V3: floor 6 in chapter 1 (7 floors/chapter)
      expect(result.state.floorState).toEqual(exploring.floorState);
      expect(result.events).toEqual([]);
    });

    it('restores a cleared floor snapshot and leaves floor advance to the controller flow', () => {
      const runSeed = 8192;
      const cleared = makeExpeditionState({
        seed: runSeed,
        floor: 5,
        floorOverrides: {
          floor: 5,
          status: 'CLEARED',
          turn: 8,
        },
      });

      const result = resumeExpedition(runSeed, 5, cleared.player, cleared.floorState);
      expect(result.state.floor).toBe(5);
      expect(result.state.floorState.status).toBe('CLEARED');
      expect(result.state.floorState).toEqual(cleared.floorState);
      expect(result.events).toEqual([]);
    });
  });

  describe('applyDeath', () => {
    it('娓呯┖灞€鍐呰繘搴︼紙瑁呭/鑱屼笟/璇嶆潯/閲戝竵/鐏垫皵/鑱屼笟纰庣墖锛夛紝淇濈暀 HP 绛夊叾浣欏瓧娈?', () => {
      const state = makeExpeditionState({
        playerOverrides: {
          hp: 0,
          maxHp: 20,
          gold: 999,
          anima: 88,
          animaProgress: 40,
          classId: 'BERSERKER',
          classTraits: ['strengthen_hp_up'],
          equipment: { WEAPON: { id: 'w1', slot: 'WEAPON', quality: 'RARE', name: '鎴樻枾', baseStat: 3 } },
          classFragments: { BERSERKER: 2 },
        },
      });
      const dead = { ...state, status: 'DEAD' as const, floorState: { ...state.floorState, status: 'DEAD' as const } };

      const result = applyDeath(dead);
      expect(result.state.player.gold).toBe(0);
      expect(result.state.player.anima).toBe(0);
      expect(result.state.player.animaProgress).toBe(0);
      expect(result.state.player.classId).toBe('ADVENTURER');
      expect(result.state.player.classTraits).toEqual([]);
      expect(result.state.player.equipment).toEqual({});
      expect(result.state.player.classFragments).toEqual({});
      expect(result.state.player.hp).toBe(280);
      expect(result.state.player.maxHp).toBe(280);
    });

    it('闈?DEAD 鐘舵€佹椂涓?no-op', () => {
      const state = makeExpeditionState({ playerOverrides: { gold: 50 } });
      expect(applyDeath(state)).toEqual({ state, events: [] });
    });

    it('閲嶇疆宸茶閱掑舰鎬侊紙awakenForm锛?', () => {
      const state = makeExpeditionState({
        playerOverrides: {
          hp: 0,
          classId: 'BERSERKER',
          awakenForm: 'BERSERKER_1',
          classFragments: { BERSERKER: 5 },
        },
      });
      const dead = { ...state, status: 'DEAD' as const, floorState: { ...state.floorState, status: 'DEAD' as const } };

      const result = applyDeath(dead);
      expect(result.state.player.awakenForm).toBeUndefined();
    });
  });

  describe('serialize / deserialize', () => {
    it('瀛樻。寰€杩斾竴鑷达細deserialize(serialize(state)) 娣卞害鐩哥瓑浜庡師鐘舵€?', () => {
      const state = startExpedition(424242);
      const restored = deserialize(serialize(state));
      expect(restored).toEqual(state);
    });

    it('鏃ц閱掑瓨妗ｈ縼绉绘椂鍙Щ闄や竴灞傝嚜鍔ㄩ檮璧犺瘝鏉″苟鍐欏叆V2鏍囪', () => {
      const legacy = makeExpeditionState({
        playerOverrides: {
          classId: 'ARCHER',
          awakenForm: 'ARCHER_1',
          classTraits: ['strengthen_attack_up', 'strengthen_attack_up', 'awakened_power_shot'],
        },
      });
      const restored = deserialize(JSON.stringify(legacy));
      expect(restored.player.classTraits).toEqual(['strengthen_attack_up', 'awakened_power_shot']);
      expect(restored.player.awakenVersion).toBe(2);
      expect(restored.player.awakenFirstOfferPending).toBe(true);
      expect(deserialize(serialize(restored))).toEqual(restored);
    });

    it('浠庡瓨妗ｈ繕鍘熷悗鍙户缁帹杩涳紙鍥炲悎/妤煎眰锛変笖琛屼负涓庡師鐘舵€佷竴鑷?', () => {
      const original = makeExpeditionState({
        floorOverrides: {
          player: { x: 1, y: 1 },
          turn: 2,
          monsters: [makeMonster('m1', { x: 6, y: 6 }, { aggroRadius: 5, range: 1 })],
        },
      });
      const restored = deserialize(serialize(original));

      expect(endTurn(restored)).toEqual(endTurn(original));
    });
  });

  describe('AP_ROLLED 浜嬩欢锛圓C-2 琛ㄧ幇锛?', () => {
    it('endTurn 鍦ㄩ噸鏂版幏楠板悗 emit AP_ROLLED锛宼urn/dice/ap 涓?floorState 涓€鑷?', () => {
      const state = makeExpeditionState({
        floorOverrides: { player: { x: 0, y: 0 }, turn: 1, monsters: [] },
      });
      const result = endTurn(state);
      const ap = result.events.find((e) => e.type === 'AP_ROLLED');
      expect(ap).toBeTruthy();
      if (ap && ap.type === 'AP_ROLLED') {
        expect(ap.turn).toBe(result.state.floorState.turn);
        expect(ap.dice).toBe(result.state.floorState.dice);
        expect(ap.ap).toBe(result.state.floorState.ap);
        expect(ap.dice).toBeGreaterThanOrEqual(1);
        expect(ap.dice).toBeLessThanOrEqual(6);
        expect(ap.ap).toBe(8 + ap.dice);
      }
    });

    it('endTurn 鐜╁闃典骸鏃朵笉 emit AP_ROLLED锛堟湭杩涘叆鏂板洖鍚堬級', () => {
      const state = makeExpeditionState({
        floorOverrides: {
          player: { x: 4, y: 4 },
          turn: 1,
          monsters: [makeMonster('m1', { x: 4, y: 5 }, { aggroRadius: 5, range: 1, attack: 99 })],
        },
        playerOverrides: { hp: 5, maxHp: 20 },
      });
      const result = endTurn(state);
      expect(result.state.status).toBe('DEAD');
      expect(result.events.some((e) => e.type === 'AP_ROLLED')).toBe(false);
    });

    it('advanceFloor 杩涘叆鏂板眰 emit AP_ROLLED锛坱urn=1锛?', () => {
      const state = makeExpeditionState({
        floor: 1,
        floorOverrides: { floor: 1, status: 'CLEARED' },
      });
      const result = advanceFloor(state);
      const ap = result.events.find((e) => e.type === 'AP_ROLLED');
      expect(ap).toBeTruthy();
      if (ap && ap.type === 'AP_ROLLED') {
        expect(ap.turn).toBe(1);
        expect(ap.dice).toBeGreaterThanOrEqual(1);
        expect(ap.dice).toBeLessThanOrEqual(6);
        expect(ap.ap).toBe(8 + ap.dice);
        expect(ap.ap).toBe(result.state.floorState.maxAp);
      }
    });

    it('resumeExpedition emit AP_ROLLED 涓?advanceFloor 瀹屽叏涓€鑷达紙纭畾鎬?AC-13锛?', () => {
      const runSeed = 314159;
      const cleared = makeExpeditionState({
        seed: runSeed,
        floor: 2,
        floorOverrides: { floor: 2, status: 'CLEARED' },
      });
      const advanced = advanceFloor({ ...cleared, runSeed });
      const resumed = resumeExpedition(runSeed, 2, cleared.player);

      const advAp = advanced.events.find((e) => e.type === 'AP_ROLLED');
      const resAp = resumed.events.find((e) => e.type === 'AP_ROLLED');
      expect(advAp).toEqual(resAp);
    });

    it('鍚岀瀛?endTurn 涓ゆ浜х敓鐩稿悓 AP_ROLLED锛堢‘瀹氭€э級', () => {
      const state = makeExpeditionState({
        floorOverrides: { player: { x: 0, y: 0 }, turn: 1, monsters: [] },
      });
      const a = endTurn(state).events.find((e) => e.type === 'AP_ROLLED');
      const b = endTurn(state).events.find((e) => e.type === 'AP_ROLLED');
      expect(a).toEqual(b);
    });
  });

  describe('AP 缁撹浆锛圓P_CARRY_CAP锛?', () => {
    it('鍥炲悎缁撴潫鏃跺墿浣?AP 鈮?AP_CARRY_CAP 鍏ㄩ儴缁撹浆锛欰P_ROLLED.ap = 8+dice+鍓╀綑锛屽苟 emit AP_CARRIED', () => {
      const state = makeExpeditionState({
        floorOverrides: { player: { x: 0, y: 0 }, turn: 1, monsters: [], ap: 2, maxAp: 10 },
      });
      const result = endTurn(state);
      const apRolled = result.events.find((e) => e.type === 'AP_ROLLED');
      const carried = result.events.find((e) => e.type === 'AP_CARRIED');
      expect(apRolled?.type).toBe('AP_ROLLED');
      expect(carried).toEqual({ type: 'AP_CARRIED', amount: 2 });
      if (apRolled?.type === 'AP_ROLLED') {
        expect(apRolled.ap).toBe(8 + apRolled.dice + 2);
        expect(result.state.floorState.ap).toBe(apRolled.ap);
        expect(result.state.floorState.maxAp).toBe(apRolled.ap);
      }
    });

    it('鍥炲悎缁撴潫鏃跺墿浣?AP 瓒呰繃 AP_CARRY_CAP 浠呯粨杞笂闄愰儴鍒?', () => {
      const state = makeExpeditionState({
        floorOverrides: { player: { x: 0, y: 0 }, turn: 1, monsters: [], ap: 9, maxAp: 12 },
      });
      const result = endTurn(state);
      const apRolled = result.events.find((e) => e.type === 'AP_ROLLED');
      const carried = result.events.find((e) => e.type === 'AP_CARRIED');
      expect(carried).toEqual({ type: 'AP_CARRIED', amount: AP_CARRY_CAP });
      if (apRolled?.type === 'AP_ROLLED') {
        expect(apRolled.ap).toBe(8 + apRolled.dice + AP_CARRY_CAP);
      }
    });

    it('鍥炲悎缁撴潫鏃?AP 宸茶€楀敖锛?锛変笉 emit AP_CARRIED', () => {
      const state = makeExpeditionState({
        floorOverrides: { player: { x: 0, y: 0 }, turn: 1, monsters: [], ap: 0, maxAp: 10 },
      });
      const result = endTurn(state);
      expect(result.events.some((e) => e.type === 'AP_CARRIED')).toBe(false);
    });

  });

  describe('纭畾鎬э細鍚岀瀛?+ 鍚屾搷浣滃簭鍒?鈫?鍚岀粨鏋滐紙AC-13锛?', () => {
    it('涓ゆ潯鐙珛杩滃緛鎵ц鐩稿悓鎿嶄綔搴忓垪锛屾渶缁堢姸鎬佸畬鍏ㄤ竴鑷?', () => {
      const ops: Direction[] = ['RIGHT', 'DOWN', 'RIGHT', 'DOWN'];

      function run(seed: number) {
        let state = startExpedition(seed);
        for (const dir of ops) {
          state = applyMove(state, dir).state;
        }
        return endTurn(state).state;
      }

      const a = run(777888);
      const b = run(777888);
      expect(a).toEqual(b);
    });
  });
});
