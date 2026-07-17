# CoupleGame 鈥?AI 鍗忎綔鎸囧崡

寰俊灏忔父鎴?路 Cocos Creator 3.8.8 + 寰俊浜戝紑鍙戙€傛牳蹇冪帺娉曪細

- **PVE**锛氬崟浜恒€屽懡杩愯繙寰併€嶈糠闆剧埇濉旓紙瀹㈡埛绔ā鎷?+ 浜戠鏍￠獙锛夈€傝璁′富鏂囨。 `specs/260608-pve-destiny-expedition/design.md`

> PVP 妫嬬洏瀵规垬宸蹭簬 2026-06-29 褰诲簳绉婚櫎锛堣 `specs/260629-pvp-removal/`锛夈€?

## 鐩綍蹇冩櫤妯″瀷

```
assets/scripts/        # 瀹㈡埛绔?TS锛屾寜妯″潡鍒?
  core/                # GameApp / SceneLoader / EventBus / Constants
  network/             # CloudService / PveService
  pve/                 # PVE 妯″潡锛坈ore 绾€昏緫 + controllers + views锛?
  ui/  audio/  platform/

cloudfunctions/        # 浜戝嚱鏁?
  common/              # 鈽?鍏变韩婧愮爜鐨勫敮涓€鏉冨▉婧?鈽?
  login/ pve/ initDb/ adminLogin/ adminTool/
    鈹斺攢 common/         # 鈿狅笍 鑷姩鍚屾鐨勫壇鏈紝绂佹鐩存帴缂栬緫锛堣涓嬶級

specs/                 # 鐪熸鐨勯渶姹?璁″垝/AC 鏂囨。锛堟寜杩唬鍒嗙洰褰曪級
test/pve/              # PVE 瀹㈡埛绔?ts-jest 鍗曟祴锛堜笉鍦?assets/锛岄伩鍏嶈鎵撹繘娓告垙鍖咃級
scripts/               # 鏋勫缓/鍚屾鑴氭湰
```

## 鈿狅笍 鏈€澶х殑鍧戯細cloudfunctions/common 鍚屾鍓湰

**`cloudfunctions/common/` 鏄敮涓€婧愬ご銆?* 瀹冭 `node scripts/sync-cloud-common.js` 澶嶅埗鍒?5 涓瓙鐩綍涓嬬殑 `cloudfunctions/{login,pve,initDb,adminLogin,adminTool}/common/`锛屽洜涓哄井淇￠儴缃插崟涓簯鍑芥暟鏃朵笉浼氬甫鍏勫紵鐩綍銆?

- 鉁?**鏀?`cloudfunctions/common/<file>.js`锛岀劧鍚庤窇 `node scripts/sync-cloud-common.js`**
- 鉂?鏀?`cloudfunctions/pve/common/<file>.js`锛堜細琚笅娆?sync 瑕嗙洊锛?
- 馃攳 **Grep 鏃舵帓闄ゅ壇鏈?*锛歚--glob '!cloudfunctions/*/common/**'` 鎴栬矾寰勫彧鎼?`cloudfunctions/common/`銆傚惁鍒欎細鍛戒腑 6 浠藉悓鍚嶆枃浠躲€?

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

- 鏀?PVE 鐜╂硶浠ｇ爜锛坄assets/scripts/pve/core/**` / `cloudfunctions/common/pve/**`锛夆啋 鍚屾 `specs/260608-pve-destiny-expedition/design.md`

璇︾粏绾︽潫瑙?`.cursor/rules/gameplay-design-doc.mdc` 涓?`.cursor/rules/pve-module.mdc`锛圕ursor 瑙勫垯锛孋laude Code 涓嶄細鑷姩璇伙紝闇€瑕佹椂鎵嬪姩 Read锛夈€?

## 宸ョ▼绾﹀畾

- UI 鐢ㄤ唬鐮佹瀯寤猴紝涓嶄緷璧?prefab锛涘懡鍚?`XxxController.ts`锛坄@ccclass`锛? `XxxView.ts`锛堟櫘閫氱被锛? `xxxLayout.ts`锛堝伐鍏凤級
- 涓嶇敤 enum锛岀敤 `as const` 瀵硅薄鎴栧瓧闈㈤噺鑱斿悎锛涚鏈夊瓧娈?`_` 鍓嶇紑锛沗import type` 寮曠被鍨?
- 閿欒澶勭悊锛歚err instanceof Error ? err.message : String(err)`锛涘苟鍙戣緭鍏ョ敤 `_busy` 瀹堝崼
- 澶嶇敤 `SceneLoader` / `GameSession` / `EventBus` / `CloudService.callFunction` / `UiAssets`
- PVE `core/` **闆舵鏋朵緷璧?*锛氱姝?`import 'cc'`銆佺姝㈢洿鎺?`Math.random()`锛堢敤 `core/rng.ts`锛?
- **AI 鐢熸垚浜х墿涓嶈繘 `assets/`**锛氱敓鎴愭€佺編鏈?闊抽鏆傚瓨鏀句粨搴撴牴 `_ai_staging/`锛堝凡 gitignore锛夛紝鍙妸"鎻愬崌涓烘寮忚祫婧?鐨勯偅涓€浠芥斁杩?`assets/resources` 绛夋寮忕洰褰曘€傜姝㈡暣鎵圭敓鎴愮粨鏋滀涪杩?`assets/generated`鈥斺€斾細琚?Cocos 瀵煎叆銆佷骇瀛ゅ効 .meta銆佹拺澶?.git锛堝巻鍙叉暀璁笌娓呯悊瑙?`specs/260629-repo-cleanup/`锛夈€?

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
| PVE 鐜╂硶瑙勫垯 / AC / 鏁板€?| `specs/260608-pve-destiny-expedition/` |
| 澶у巺 UI / 鐪熸満鍒嗗寘 | `specs/260603-ui-entry/` |
| PVE 永久逐层细化资料 | `specs/260712-pve-persistent-floor-progression/` |
| 浜戞暟鎹簱 / 绱㈠紩 | `cloud/database/`銆佸悇 spec 鐨?`ddl-sql.md` |
| 鍚?specs 绱㈠紩锛堟寜涓婚锛?| `README.md` 搴曢儴"鏂囨。绱㈠紩"琛?|

## 缁欒嚜宸辩殑鎻愰啋

- 鐪嬪埌 6 浠藉悓鍚嶄簯鍑芥暟鏂囦欢 鈫?鍙俊 `cloudfunctions/common/`
- 鏀逛簡 `cloudfunctions/common/**` 鈫?鎻愰啋鐢ㄦ埛璺?sync 鑴氭湰
- 鏀?PVE 鐜╂硶 鈫?涓诲姩璇㈤棶鏄惁鍚屾瀵瑰簲 design.md
- specs/ 宸叉湁鐨?design.md 灏辨槸褰撳墠鐨?浠ｇ爜鍦板浘"锛屼笉瑕佸啀閫?PROJECT_MAP.md 绫绘枃妗?

## 鎺掓煡瑙勫垯锛堢敤鎴峰己鍒跺弽棣堬紝蹇呴』閬靛畧锛?

**娓叉煋 / 璧勬簮 / 鏋勫缓 / 骞冲彴閫傞厤绫?bug**锛氭瘡娆℃瀯寤?閮ㄧ讲+鍒锋柊鎴愭湰楂橈紙3-5 鍒嗛挓锛夛紝鐚滈敊浠ｄ环澶с€?

- **绗竴娆＄寽娴嬩慨澶嶅け璐ュ悗锛岀珛鍒诲垏鎹㈢郴缁熷寲鎺掓煡妯″紡**銆傜姝㈣繛缁洸鏀逛唬鐮併€?
- 绯荤粺鍖栨帓鏌?= 姣忔鍙獙璇佷竴涓亣璁?+ 蹇呴』杈撳嚭鏃ュ織/鎴浘璇佹嵁 + 缁?濡傛灉 A 鍒欒繘 X锛屽鏋?B 鍒欒繘 Y"鍐崇瓥鐭╅樀銆?
- 鎺掓煡浠庢渶渚垮疁鐨勬楠ゅ紑濮嬶細娴忚鍣ㄩ瑙?> 缂栬緫鍣ㄩ瑙?> devtools > 鐪熸満锛涚函浠ｇ爜鏋勯€?> 璧板姞杞介摼璺紱瀵圭収宸茬煡鑳界敤鐨?case > 鐩存帴璋冭瘯鐩爣銆?
- 瀹屾暣妯℃澘鍜屽弽渚嬭 `memory/feedback-systematic-debugging.md`銆?

**寰俊灏忔父鎴?Sprite 涓嶆樉绀?*锛?
- 绗竴鍙嶅簲鏌?**DynamicAtlas**锛屼笉瑕佸幓鏌?layer / UITransform / normalize / ensureArtChild 閭ｄ簺琛ㄥ眰缁嗚妭銆?
- 鏂伴」鐩?GameApp.onLoad 椤堕儴蹇呴』 `dynamicAtlasManager.enabled = false`銆?
- 璇﹁ `memory/feedback-wechat-dynamic-atlas.md`銆?

**Cocos 璧勬簮 SpriteFrame UUID 寮曠敤**锛氬満鏅噷鐨?SpriteFrame 寮曠敤鐢?`<uuid>@f9941` 鏍煎紡锛孶UID 鍦ㄥ搴?`.png.meta` 鏂囦欢鐨?`f9941` subMeta 閲屻€侻CP `cocos_component.set_property` 璁?spriteFrame 鏃讹紝**鍙傛暟鍚嶆槸 `node` 涓嶆槸 `nodeUuid`**锛沗contentSize` 鍐欏叆鍥炶 `actualValue` 甯镐负 100脳100锛堥獙璇佸け璐ワ級锛屼絾瀹為檯鍙兘宸茬敓鏁堬紝瀹佸彲鐢?`scale` 璋冩暣灏哄鎴栧湪缂栬緫鍣ㄩ噷鎵嬪姩鏀广€?
