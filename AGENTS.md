# CoupleGame 鈥?AI 鍗忎綔鎸囧崡

寰俊灏忔父鎴?路 Cocos Creator 3.8.8 + 寰俊浜戝紑鍙戙€備袱濂楃嫭绔嬬帺娉曪細

- **PVP**锛氳仈鏈烘淳瀵规鐩樺鎴橈紙浜戠鏉冨▉锛夈€傝璁′富鏂囨。 `specs/260529-combat-board-game-rework/design.md`
- **PVE**锛氬崟浜恒€屽懡杩愯繙寰併€嶈糠闆剧埇濉旓紙瀹㈡埛绔ā鎷?+ 浜戠鏍￠獙锛夈€傝璁′富鏂囨。 `specs/260608-pve-destiny-expedition/design.md`

涓ゅ鐜╂硶浜掍笉瑕嗙洊锛屾敼鍔ㄥ彧褰卞搷涓€渚с€?

## 鐩綍蹇冩櫤妯″瀷

```
assets/scripts/        # 瀹㈡埛绔?TS锛垀81 鏂囦欢锛夛紝鎸夋ā鍧楀垎
  core/                # GameApp / SceneLoader / EventBus / Constants
  network/             # CloudService / GameService / LobbyService / PveService
  lobby/  board/  settlement/   # PVP 娴佺▼
  pve/                 # PVE 妯″潡锛坈ore 绾€昏緫 + controllers + views锛?
  ui/  audio/  platform/  game/  types/

cloudfunctions/        # 浜戝嚱鏁?
  common/              # 鈽?鍏变韩婧愮爜鐨勫敮涓€鏉冨▉婧?鈽?
  login/ room/ match/ game/ pve/ initDb/ scheduler/
    鈹斺攢 common/         # 鈿狅笍 鑷姩鍚屾鐨勫壇鏈紝绂佹鐩存帴缂栬緫锛堣涓嬶級

specs/                 # 鐪熸鐨勯渶姹?璁″垝/AC 鏂囨。锛堟寜杩唬鍒嗙洰褰曪級
test/pve/              # PVE 瀹㈡埛绔?ts-jest 鍗曟祴锛堜笉鍦?assets/锛岄伩鍏嶈鎵撹繘娓告垙鍖咃級
shared/                # 鍓嶅悗绔叡浜被鍨嬶紙protocol.ts锛?
scripts/               # 鏋勫缓/鍚屾鑴氭湰
```

## 鈿狅笍 鏈€澶х殑鍧戯細cloudfunctions/common 鍚屾鍓湰

**`cloudfunctions/common/` 鏄敮涓€婧愬ご銆?* 瀹冭 `node scripts/sync-cloud-common.js` 澶嶅埗鍒?7 涓瓙鐩綍涓嬬殑 `cloudfunctions/{login,room,match,game,pve,initDb,scheduler}/common/`锛屽洜涓哄井淇￠儴缃插崟涓簯鍑芥暟鏃朵笉浼氬甫鍏勫紵鐩綍銆?

- 鉁?**鏀?`cloudfunctions/common/<file>.js`锛岀劧鍚庤窇 `node scripts/sync-cloud-common.js`**
- 鉂?鏀?`cloudfunctions/game/common/<file>.js`锛堜細琚笅娆?sync 瑕嗙洊锛?
- 馃攳 **Grep 鏃舵帓闄ゅ壇鏈?*锛歚--glob '!cloudfunctions/*/common/**'` 鎴栬矾寰勫彧鎼?`cloudfunctions/common/`銆傚惁鍒欎細鍛戒腑 8 浠藉悓鍚嶆枃浠躲€?

鍓湰鏂囦欢娓呭崟瑙?`scripts/sync-cloud-common.js` 椤堕儴鏁扮粍銆?

## 甯哥敤鍛戒护

```bash
npm test                            # 鍏ㄩ儴 jest锛堝惈 cloudfunctions/common/__tests__锛?
npm run test:pve                    # PVE 瀹㈡埛绔崟娴嬶紙test/pve/锛?
node scripts/sync-cloud-common.js   # 鏀?cloudfunctions/common/ 鍚庡繀璺?
node scripts/patch-wechatgame-config.js  # Cocos 鏋勫缓鍚庤窇锛堢粏鑺傝 .cursor/rules/cocos-wechatgame-subpackage.mdc锛?
```

浜戝嚱鏁?jest 鍦?`cloudfunctions/common/`锛歚cd cloudfunctions/common && npm test`銆?

## 鐜╂硶鏀瑰姩 鈫?蹇呴』鍚屾璁捐鏂囨。

- 鏀?PVP 鐜╂硶浠ｇ爜锛坄Constants.ts` / `GameEngine.js` / `CellResolver.js` / `ShopResolver.js` / `CombatResolver.js` 绛夛級鈫?鍚屾 `specs/260529-combat-board-game-rework/design.md`
- 鏀?PVE 鐜╂硶浠ｇ爜锛坄assets/scripts/pve/core/**` / `cloudfunctions/common/pve/**`锛夆啋 鍚屾 `specs/260608-pve-destiny-expedition/design.md`

璇︾粏绾︽潫瑙?`.cursor/rules/gameplay-design-doc.mdc` 涓?`.cursor/rules/pve-module.mdc`锛圕ursor 瑙勫垯锛孋odex 涓嶄細鑷姩璇伙紝闇€瑕佹椂鎵嬪姩 Read锛夈€?

## 宸ョ▼绾﹀畾

- UI 鐢ㄤ唬鐮佹瀯寤猴紝涓嶄緷璧?prefab锛涘懡鍚?`XxxController.ts`锛坄@ccclass`锛? `XxxView.ts`锛堟櫘閫氱被锛? `xxxLayout.ts`锛堝伐鍏凤級
- 涓嶇敤 enum锛岀敤 `as const` 瀵硅薄鎴栧瓧闈㈤噺鑱斿悎锛涚鏈夊瓧娈?`_` 鍓嶇紑锛沗import type` 寮曠被鍨?
- 閿欒澶勭悊锛歚err instanceof Error ? err.message : String(err)`锛涘苟鍙戣緭鍏ョ敤 `_busy` 瀹堝崼
- 澶嶇敤 `SceneLoader` / `GameSession` / `EventBus` / `CloudService.callFunction` / `UiAssets`
- PVE `core/` **闆舵鏋朵緷璧?*锛氱姝?`import 'cc'`銆佺姝㈢洿鎺?`Math.random()`锛堢敤 `core/rng.ts`锛?

## 寰俊鐪熸満/鏋勫缓鐩稿叧

姣忔閲嶅ぇ鏀瑰姩鍚庣殑鐪熸満鍙戝竷娴佺▼銆佷富鍖?4MB 绾㈢嚎銆乣UiAssets` critical native 娓呭崟瑙勫垯 鈥斺€?鍏ㄩ儴瑙?`.cursor/rules/cocos-wechatgame-subpackage.mdc`锛?2026-06 鐪熸満 UI/BGM 浜嬫晠澶嶇洏"閭ｈ妭鏄繀璇伙級銆?

## 浠ｇ爜瀵艰埅瑙勫垯锛堝繀椤婚伒瀹堬級

1. **瀹氫綅鍔熻兘鏃讹紝浼樺厛闃呰 `PROJECT_NAVIGATION.md`**锛岄€氳繃绯荤粺鍒楄〃鎵惧埌鍏ュ彛鏂囦欢锛屽啀鎵撳紑浠ｇ爜銆?
2. **鐞嗚В璋冪敤閾炬椂锛屼紭鍏堟煡 `CALL_FLOW.md`**锛屾壘鍒板搴旀搷浣滅殑瀹屾暣鎵ц璺緞銆?
3. **淇敼浠ｇ爜鏃讹紝浠庡鑸寚瀹氱殑鍏ュ彛鏂囦欢寮€濮嬶紝閫愬眰鍚戜笅杩借釜**锛屼笉瑕佷粠涓棿灞傚垏鍏ャ€?
4. **闄ら潪瀵艰埅鏃犳硶瀹氫綅锛屽惁鍒欑姝㈠叏椤圭洰鍏ㄦ枃鎼滅储**锛坄grep -r` 鏁翠釜 `assets/` 鎴?`cloudfunctions/`锛夈€?
5. **濡傛灉鍙戠幇瀵艰埅鏂囨。鎸囧悜鐨勫叆鍙ｄ笉鍑嗙‘鎴栫己澶?*锛屽厛鏇存柊 `PROJECT_NAVIGATION.md` / `CALL_FLOW.md`锛屽啀缁х画寮€鍙戙€?

## 鏂囨。鍏ュ彛锛堟寜闂鏌ワ級

| 鎯虫煡浠€涔?| 鍘诲摢閲?|
|----------|--------|
| **绯荤粺鍏ュ彛 / 鏂囦欢鑱岃矗** | `PROJECT_NAVIGATION.md` |
| **鎿嶄綔鐨勫畬鏁磋皟鐢ㄩ摼** | `CALL_FLOW.md` |
| **寮€鍙戣鍒?/ 甯歌闄烽槺** | `DEVELOPMENT_GUIDE.md` |
| 椤圭洰鍏ラ棬 / 鏋勫缓 / 浜戝嚱鏁伴儴缃?| `README.md` |
| PVP 鐜╂硶瑙勫垯 / AC / 鍙岀鑱旇皟 | `specs/260529-combat-board-game-rework/` |
| PVE 鐜╂硶瑙勫垯 / AC / 鏁板€?| `specs/260608-pve-destiny-expedition/` |
| 澶у巺 UI / 鐪熸満鍒嗗寘 | `specs/260603-ui-entry/` |
| PVE 永久逐层细化资料 | `specs/260712-pve-persistent-floor-progression/` |
| 浜戞暟鎹簱 / 绱㈠紩 | `cloud/database/`銆佸悇 spec 鐨?`ddl-sql.md` |
| 鍚?specs 绱㈠紩锛堟寜涓婚锛?| `README.md` 搴曢儴"鏂囨。绱㈠紩"琛?|

## 缁欒嚜宸辩殑鎻愰啋

- 鐪嬪埌 8 浠藉悓鍚嶄簯鍑芥暟鏂囦欢 鈫?鍙俊 `cloudfunctions/common/`
- 鏀逛簡 `cloudfunctions/common/**` 鈫?鎻愰啋鐢ㄦ埛璺?sync 鑴氭湰
- 鏀?PVE/PVP 鐜╂硶 鈫?涓诲姩璇㈤棶鏄惁鍚屾瀵瑰簲 design.md
- specs/ 宸叉湁鐨?design.md 灏辨槸褰撳墠鐨?浠ｇ爜鍦板浘"锛屼笉瑕佸啀閫?PROJECT_MAP.md 绫绘枃妗?
