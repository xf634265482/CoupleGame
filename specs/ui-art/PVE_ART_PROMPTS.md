# PVE UI Art Prompt Sheet

> Created: 2026-06-17  
> Scope: PVE "Destiny Expedition" first-pass UI art generation  
> Style direction: Q-version dark toy UI + light-dark woodland goblin camp

This document turns the PVE art needs from `UI_ASSET_LIST.md`, `UI_NAMING_RULE.md`, and `UI_SIZE_SPEC.md` into generation-ready prompts. Use it for AI image generation, outsourcing, or internal art review.

## 1. Global Art Direction

### Locked P0 Style Baseline

This baseline was approved on 2026-06-17 and applies to all P0 PVE assets until explicitly revised.

- **Core style**: Q-version dark toy art, light-dark and playable rather than scary.
- **Chapter 1 read**: woodland goblin camp, not generic dungeon and not abstract monster lair.
- **Battlefield composition**: the Chapter 1 ground art is a full battlefield background, not a busy per-cell tile. The 8x8 playable area should stay mostly open grass plus one or two rounded yellow dirt clearings, with sparse edge decorations only.
- **Fog treatment**: unrevealed cells use dark black/blue-black cloud fog. Dense areas should fully hide the map, thin areas can show a little background, and the silhouette must have broken smoky edges rather than square corners.
- **Scene language**: mossy stone slabs, deep wood, rough fences, torn cloth flags, small campfire warmth.
- **UI material**: mixed wood and stone, with leather, copper rivets, and restrained blue-green rune glow.
- **Color axis**: moss green and deep wood as the base; warm firelight for camp flavor; blue-green magic only for interaction, anima, selection, and destiny highlights.
- **Readability target**: balanced readable and polished. Monster identity and item function must remain clear at 56px.
- **First monster rule**: Chapter 1 floor 1 normal enemies must read as Goblin Warriors: squat green skin, big ears, broken iron helmet, short sword or tiny wooden shield, mischievous foot-soldier attitude.
- **Hard ban**: no generic horned beast, demon, armored bug, horror monster, realistic creature, or abstract black monster for Chapter 1 normal enemies.

### Keywords

```text
Q-version dark toy art, light-dark woodland goblin camp, cute playable adventure,
chunky silhouette, semi-matte collectible toy material, thick outline, soft bevels,
mossy stone, deep wood, leather straps, copper rivets, torn cloth flags, campfire warmth,
blue-green magic highlight, compact readable shapes, high readability on mobile
```

### Color Rules

| Role | Palette |
| --- | --- |
| Base mood | moss green, deep wood brown, warm dark stone, muted charcoal |
| Chapter 1 warmth | campfire amber, dull copper, worn leather |
| Magic and anima | cyan, blue green, soft turquoise glow |
| Reward and treasure | muted gold, amber, warm highlight |
| Danger | softened crimson, warm orange warning glow |
| Exit and progress | blue white, pale moonlight |

Avoid overly bright fairy-tale colors and avoid cold generic dungeon dominance in Chapter 1. Keep the scene readable and adventure-like, with a mild dark mood and clear interactive glow.

### Consistency Rules

- Use transparent PNG for all icons, entities, map objects, tiles, buttons, cards, and panels.
- Use 2x output size unless the size spec says otherwise.
- Keep silhouettes simple enough to read at 56 to 70 design pixels.
- Use thick dark outlines on entities and icons.
- Use local glow only. Avoid large full-image bloom.
- For Chapter 1 monster icons, describe the exact creature role from `Chapter1Monsters.ts` and never use generic "monster" alone.
- Avoid realistic horror, gore, sharp realism, metal-photo texture, and thin-line illustration.
- Do not include text inside generated art unless the asset is explicitly a logo or tag.

### Global Negative Prompt

```text
photorealistic, realistic horror, gore, scary face, thin line art, flat vector only,
overly bright pastel, pure cute nursery style, complex tiny details, unreadable small icon,
generic monster, horned demon, armored beetle monster, black blob creature,
text, letters, watermark, signature, blurry, low resolution, noisy background
```

## 2. P0 First Batch

These assets are the best first batch because they appear during nearly every PVE turn: map exploration, entity recognition, HUD reading, and action feedback.

### 2.0 Approved Style Sample Group

Regenerate and review this small group before expanding to the rest of P0:

| Filename | Why it defines the style |
| --- | --- |
| `tile_floor_ch1.png` | establishes the full woodland camp battlefield background |
| `tile_fog.png` | establishes soft true-fog exploration masking |
| `icon_monster_ch1_normal.png` | fixes the Goblin Warrior identity problem |
| `icon_player.png` | anchors player scale and outline language |
| `icon_chest.png` | establishes reward object material |
| `icon_key.png` | establishes small-object readability |

Approval rule: review these at 56px, 70px, and 112px before generating the full P0 batch.

### 2.1 PVE Map Background and Overlays

Target directory: `assets/resources/art/ui/pve/map/`  
Recommended output: map backgrounds `560x560`, overlays `140x140` PNG transparent unless noted.

| Filename | Use | Prompt |
| --- | --- | --- |
| `tile_fog.png` | unrevealed fog overlay | A dark cloud fog overlay for unrevealed grid cells in a cute Q-version woodland goblin camp map, black and deep blue-black smoke, dense cloud areas nearly opaque so the map underneath cannot be read, thin smoky edges slightly translucent, broken organic silhouette, no square corners, no framed tile edge, no hard border, transparent PNG alpha |
| `tile_floor_ch1.png` | chapter 1 battlefield background | A full 8 by 8 battlefield background for a mobile roguelike map, top-down orthographic view, Chapter 1 cute woodland goblin camp, cute Q-version dark toy art, chunky rounded shapes, soft bevels, mostly open grass and one or two rounded yellow dirt clearings, generous empty readable space in the center, sparse edge decorations only, a few short wooden fence segments, small campfire near one corner, tiny flags, stones, camp clutter pushed outward, no winding road, no grid lines, no square tile borders, no large obstacles inside center cells |
| `tile_floor_ch2.png` | chapter 2 floor | A square desert tower floor tile, dark sand stone slab, muted ochre and deep teal shadows, chunky toy bevel, subtle grain, low brightness, transparent background |
| `tile_floor_ch3.png` | chapter 3 floor | A square frozen tower floor tile, dark blue ice stone, frosted bevel, pale cyan cracks, designer-toy cartoon style, transparent background |
| `tile_floor_ch4.png` | chapter 4 floor | A square lava tower floor tile, dark volcanic stone, faint red cracks, chunky toy bevel, controlled orange glow, transparent background |
| `tile_floor_ch5.png` | chapter 5 floor | A square fate tower floor tile, dark violet gray stone, pale rune constellation marks, blue white edge glow, transparent background |
| `tile_selected_frame.png` | selected or current target frame | A square selection frame overlay, transparent center, chunky cyan magical outline, tiny rune corners, high contrast on dark map, transparent background |
| `mark_move_range.png` | movable cell overlay | A transparent square overlay for valid movement, soft blue green glow, rounded corners, no filled center, mobile game readability |
| `mark_attack_range.png` | attackable cell overlay | A transparent square overlay for attack range, controlled crimson outline glow, rounded corners, no filled center, mobile game readability |
| `mark_aoe_danger.png` | boss danger marker | A square danger warning overlay, translucent crimson rune ring, sharp readable border, dark fantasy toy UI style, transparent background |

### 2.2 PVE Map Entities

Target directory: `assets/resources/art/ui/pve/map/`  
Recommended output: normal entity `106x106`, boss `224x224`, object `84x84`, PNG transparent.

| Filename | Use | Prompt |
| --- | --- | --- |
| `icon_player.png` | player on map | A small Q-version dark toy adventurer, big head small body, dark travel cloak, short sword, tiny backpack, semi-matte collectible toy material, thick outline, moss green and deep wood palette, subtle cyan rim light, readable at 56px, transparent background |
| `icon_monster_normal.png` | fallback normal monster only | A fallback small enemy icon for missing chapter-specific art, Q-version dark toy style, simple chunky silhouette, mild threat, thick outline, readable at 56px, transparent background. Do not use this prompt for Chapter 1 accepted art. |
| `icon_monster_elite.png` | fallback elite monster only | A fallback elite enemy icon for missing chapter-specific art, Q-version dark toy style, larger chunky silhouette, warning glow accents, thick outline, readable at 56px, transparent background. Do not use this prompt for Chapter 1 accepted art. |
| `icon_monster_anima.png` | fallback anima monster only | A small floating anima energy creature, Q-version dark toy style, semi-transparent cyan blue glow, soft toy-like shape, readable silhouette, transparent background |
| `icon_monster_boss.png` | fallback boss marker only | A fallback boss map icon for missing chapter-specific art, Q-version dark toy style, oversized chunky silhouette, strong outline, readable at boss icon size, transparent background. Do not use this prompt for Chapter 1 accepted art. |
| `icon_fate_mirror.png` | fate mirror entity | A small floating mirror copy icon, dark violet glass body, pale blue reflection glow, toy-like bevel, mysterious but readable, transparent background |
| `icon_chest.png` | treasure chest | A Q-version dark toy woodland camp treasure chest, deep worn wood, dull copper corners, leather strap, warm amber light leaking from seams, thick outline, readable at 48px, transparent background |
| `icon_key.png` | key | A Q-version dark toy magic key, muted gold and dull copper, small leaf-rune head, blue-green glow edge, thick outline, readable at 48px, transparent background |
| `icon_exit.png` | exit door | A small stone exit door, designer-toy cartoon, dark tower stone arch, blue white light through the door crack, rune border, transparent background |
| `icon_portal.png` | portal after boss | A small magical portal, circular blue white vortex, dark stone base, toy-like chunky frame, transparent background |
| `icon_idol.png` | idol | A small dark fantasy idol statue, cute chunky stone figure, cyan rune glow, ancient tower feeling, transparent background |
| `icon_hot_spring.png` | hot spring | A small magical hot spring object, dark stone basin, soft blue steam, toy-like shape, transparent background |
| `icon_altar.png` | altar | A small rune altar, dark stone slab, cyan purple glow, chunky toy bevel, transparent background |
| `icon_blacksmith.png` | blacksmith | A small anvil and hammer icon, dark metal, warm forge glow, designer-toy cartoon style, transparent background |

### 2.3 PVE HUD Icons

Target directory: `assets/resources/art/ui/pve/icons/`  
Recommended output: `56x56` for stat icons, `48x48` for resource icons, PNG transparent.

| Filename | Use | Prompt |
| --- | --- | --- |
| `icon_hud_hp.png` | HP | A compact heart icon for dark fantasy mobile HUD, designer-toy cartoon, ruby red core, dark outline, subtle highlight, transparent background |
| `icon_hud_ap.png` | AP | A compact action point lightning icon, cyan blue energy, chunky toy bevel, dark outline, transparent background |
| `icon_hud_attack.png` | attack | A compact sword slash icon, muted silver blade, cyan edge glow, thick dark outline, transparent background |
| `icon_hud_gold.png` | gold | A compact gold coin stack icon, muted warm gold, thick outline, toy-like bevel, transparent background |
| `icon_hud_anima.png` | anima | A compact soul energy orb icon, blue green flame, semi-transparent glow, thick outline, transparent background |
| `icon_hud_key.png` | key count | A compact tiny magic key icon, muted gold with blue white rune glow, thick outline, transparent background |
| `icon_hud_floor.png` | floor | A compact tower floor icon, dark stone stair symbol, pale moonlight glow, thick outline, transparent background |
| `icon_hud_shards.png` | destiny shard | A compact destiny shard crystal icon, dark violet crystal with cyan inner glow, thick outline, transparent background |
| `icon_status_burn.png` | burn status | A compact burn status icon, orange red flame on dark stone, thick outline, readable at tiny size, transparent background |
| `icon_status_frozen.png` | frozen status | A compact frozen status icon, cyan ice crystal, dark outline, readable at tiny size, transparent background |
| `icon_status_chill.png` | chill stack | A compact chill status icon, pale blue snow rune, thick outline, readable at tiny size, transparent background |

### 2.4 PVE HUD and Modal Panels

Target directory: `assets/resources/art/ui/pve/hud/`, `assets/resources/art/ui/pve/panel/`, `assets/resources/art/ui/pve/popup/`  
Use 9-slice for `_9s` assets.

| Filename | Size | Use | Prompt |
| --- | --- | --- | --- |
| `panel_pve_hud_9s.png` | 1440x240 | main HUD panel | A Q-version dark toy mobile HUD panel, mixed deep wood and warm stone frame, leather insets, dull copper rivets, restrained blue-green rune accents, clean empty center for text and icons, 9-slice friendly, transparent background |
| `panel_pve_message_9s.png` | 1360x160 | battle log | A compact dark message log panel, smoky glass and stone border, muted blue gray, tiny rune corners, readable on mobile, 9-slice friendly, transparent background |
| `panel_pve_modal_9s.png` | 1120x800 | general modal | A dark fantasy modal panel, chunky rounded stone frame, semi-matte toy UI material, deep violet gray interior, cyan rune trim, empty center, 9-slice friendly, transparent background |
| `panel_pve_toast_9s.png` | 1040x128 | toast | A slim toast notification panel, dark translucent stone glass, cyan edge glow, small gold accent, 9-slice friendly, transparent background |
| `card_strengthen_choice_9s.png` | 360x480 | strengthen option card | A vertical magic card frame for upgrade choices, dark violet stone and toy-like bevel, cyan rune border, empty center for icon and text, 9-slice friendly, transparent background |
| `card_strengthen_selected_9s.png` | 360x480 | selected strengthen card | A selected vertical magic card frame, bright cyan and muted gold edge glow, dark interior, chunky toy bevel, empty center, 9-slice friendly, transparent background |

### 2.5 PVE Action Buttons

Target directory: `assets/resources/art/ui/pve/hud/`  
Recommended output: action buttons `220x120`, d-pad buttons `200x200`, PNG transparent.

| Filename | Use | Prompt |
| --- | --- | --- |
| `btn_dpad_up.png` | d-pad up | A square upward movement button, dark stone toy UI, cyan arrow symbol, chunky bevel, high touch readability, transparent background |
| `btn_dpad_down.png` | d-pad down | A square downward movement button, dark stone toy UI, cyan arrow symbol, chunky bevel, high touch readability, transparent background |
| `btn_dpad_left.png` | d-pad left | A square left movement button, dark stone toy UI, cyan arrow symbol, chunky bevel, high touch readability, transparent background |
| `btn_dpad_right.png` | d-pad right | A square right movement button, dark stone toy UI, cyan arrow symbol, chunky bevel, high touch readability, transparent background |
| `btn_pve_attack.png` | attack | A compact attack button, dark red stone toy UI, sword slash icon, controlled crimson glow, transparent background |
| `btn_pve_interact.png` | interact | A compact interact button, deep teal stone toy UI, hand or sparkle icon, cyan glow, transparent background |
| `btn_pve_end_turn.png` | end turn | A compact end turn button, dark gray stone toy UI, hourglass or crescent icon, muted blue glow, transparent background |

## 3. P1 Growth and Build Assets

These assets make the PVE growth loop feel rewarding. Generate after the first map/HUD batch.

### 3.1 Equipment Slots and Quality Frames

Target directory: `assets/resources/art/ui/pve/equip/`  
Recommended output: slot and frame `192x192`, PNG transparent.

| Filename | Use | Prompt |
| --- | --- | --- |
| `slot_weapon_empty.png` | weapon slot | An empty weapon equipment slot, dark stone and smoky glass, tiny sword silhouette, chunky toy UI frame, transparent background |
| `slot_helmet_empty.png` | helmet slot | An empty helmet equipment slot, dark stone and smoky glass, tiny helmet silhouette, chunky toy UI frame, transparent background |
| `slot_armor_empty.png` | armor slot | An empty armor equipment slot, dark stone and smoky glass, tiny chestplate silhouette, chunky toy UI frame, transparent background |
| `slot_shoes_empty.png` | shoes slot | An empty boots equipment slot, dark stone and smoky glass, tiny boot silhouette, chunky toy UI frame, transparent background |
| `slot_accessory_empty.png` | accessory slot | An empty accessory equipment slot, dark stone and smoky glass, tiny amulet silhouette, chunky toy UI frame, transparent background |
| `border_quality_common.png` | common quality | A square equipment quality frame, pale gray white, chunky dark outline, transparent center |
| `border_quality_fine.png` | fine quality | A square equipment quality frame, muted green glow, chunky dark outline, transparent center |
| `border_quality_rare.png` | rare quality | A square equipment quality frame, blue glow, chunky dark outline, transparent center |
| `border_quality_epic.png` | epic quality | A square equipment quality frame, violet glow, chunky dark outline, transparent center |
| `border_quality_legendary.png` | legendary quality | A square equipment quality frame, muted orange gold glow, chunky dark outline, transparent center |

### 3.2 Class Icons

Target directory: `assets/resources/art/ui/pve/class/`  
Recommended output: `128x128`, PNG transparent.

| Filename | Use | Prompt |
| --- | --- | --- |
| `icon_class_adventurer.png` | starting class | A designer-toy cartoon adventurer class icon, small cloak, backpack, compass charm, dark fantasy toy style, thick outline, transparent background |
| `icon_class_berserker.png` | berserker | A designer-toy cartoon berserker class icon, oversized axe silhouette, dark red glow, chunky collectible toy style, transparent background |
| `icon_class_archer.png` | archer | A designer-toy cartoon archer class icon, short bow and feather hood, cyan green edge glow, chunky toy style, transparent background |
| `icon_class_rogue.png` | rogue | A designer-toy cartoon rogue class icon, hood and dagger, dark violet shadows, blue rim light, chunky toy style, transparent background |
| `icon_fragment_berserker.png` | berserker fragment | A small class fragment token, dark red axe rune shard, thick outline, transparent background |
| `icon_fragment_archer.png` | archer fragment | A small class fragment token, teal bow rune shard, thick outline, transparent background |
| `icon_fragment_rogue.png` | rogue fragment | A small class fragment token, violet dagger rune shard, thick outline, transparent background |

### 3.3 Chapter-Specific Monster Icons

> **Why**: Generic `icon_monster_normal/elite/anima/boss.png` lack lore identity. Chapter 1 is a goblin camp, so all monsters should visually read as goblins, not generic dark dungeon creatures. `FogMapView` now tries `icon_monster_ch{N}_{type}.png` first and falls back to the generic icon when the chapter-specific file is missing.

Target directory: `assets/resources/art/ui/pve/map/`  
Recommended output: normal/elite/anima `106x106`, boss `224x224`, PNG transparent.  
Naming rule: `icon_monster_ch{chapter}_{normal|elite|anima|boss}.png`

**Chapter 1 — Goblin Camp (哥布林营地)**

| Filename | Monster | Prompt |
| --- | --- | --- |
| `icon_monster_ch1_normal.png` | Goblin Warrior (哥布林战士) | A small Q-version dark toy goblin warrior for a woodland camp, squat chunky body, green skin, big ears, broken dull iron helmet, short rusty sword and tiny wooden shield, mischievous foot-soldier expression, thick outline, moss green and deep wood palette, warm campfire rim light, readable at 56px, transparent background. Must look like a goblin, not a generic monster. |
| `icon_monster_ch1_elite.png` | Goblin Archer (哥布林弓箭手) | A small designer-toy cartoon goblin archer, crude short bow, tattered leather hood, alert eyes, compact chunky silhouette, dark green skin, faint purple rune arrow, thick outline, transparent background |
| `icon_monster_ch1_anima.png` | Spirit Rat (灵鼠) | A small designer-toy cartoon spirit rat, pale glowing body, cyan anima glow outline, oversized ears, toy-like round form, transparent background |
| `icon_monster_ch1_boss.png` | Goblin Chief (哥布林酋长) | A large designer-toy cartoon goblin warchief, oversized spiked crown, bone armor, dual crude axes, dominant chunky silhouette, deep green skin, angry glowing eyes, red rune aura, transparent background |

**Chapter 2 — Desert Ruins (沙漠废墟)**

| Filename | Monster | Prompt |
| --- | --- | --- |
| `icon_monster_ch2_normal.png` | Desert Raider (沙漠劫匪) | A small designer-toy cartoon desert bandit, tattered sand cloak, curved blade, chunky silhouette, muted ochre and brown tones, thick outline, transparent background |
| `icon_monster_ch2_elite.png` | Poison Scorpion (毒蝎) | A small designer-toy cartoon scorpion, oversized claws, glowing green tail stinger, dark brown carapace, chunky toy silhouette, thick outline, transparent background |
| `icon_monster_ch2_anima.png` | Spirit Beetle (灵气甲虫) | A small designer-toy cartoon spirit beetle, iridescent cyan glow wings, dark shell, compact round body, glowing antenna, transparent background |
| `icon_monster_ch2_boss.png` | Quicksand Scorpion (流沙巨蝎) | A large designer-toy cartoon giant scorpion boss, armored ochre carapace, two oversized crushing claws, glowing blue poison tail, dramatic silhouette, transparent background |

**Chapter 3 — Frozen Tower (冰冻塔)**

| Filename | Monster | Prompt |
| --- | --- | --- |
| `icon_monster_ch3_normal.png` | Snow Wolf (雪狼) | A small designer-toy cartoon snow wolf, white fur with dark tips, compact chunky body, pale blue eyes, breath mist, thick outline, transparent background |
| `icon_monster_ch3_elite.png` | Frost Sprite (冰霜精灵) | A small designer-toy cartoon frost sprite, feminine winged figure, ice crystal dress, pale cyan glow, compact toy silhouette, transparent background |
| `icon_monster_ch3_anima.png` | Spirit Elf (灵气精灵) | A small designer-toy cartoon anima spirit elf, glowing blue white wisps, soft round form, ancient forest spirit vibe, transparent background |
| `icon_monster_ch3_boss.png` | Frost Giant (冰霜巨人) | A large designer-toy cartoon frost giant boss, massive chunky ice armor, frozen club, glowing blue cracks, imposing silhouette, pale ice and dark stone tones, transparent background |

**Chapter 4 — Lava Abyss (熔岩深渊)**

| Filename | Monster | Prompt |
| --- | --- | --- |
| `icon_monster_ch4_normal.png` | Lava Grunt (熔岩暴徒) | A small designer-toy cartoon lava grunt, obsidian armor with glowing orange cracks, compact chunky form, smoldering eyes, thick outline, transparent background |
| `icon_monster_ch4_elite.png` | Lava Crab (岩浆蟹) | A small designer-toy cartoon lava crab, dark volcanic shell, glowing orange claws, compact toy silhouette, lava drip accents, thick outline, transparent background |
| `icon_monster_ch4_anima.png` | Spirit Ember (灵气炎魂) | A small designer-toy cartoon fire spirit, orange red flame body, semi-transparent glow, round toy form, glowing ember eyes, transparent background |
| `icon_monster_ch4_boss.png` | Lava Lord (熔岩领主) | A large designer-toy cartoon lava lord boss, imposing volcanic stone body, orange magma rivers in chest cracks, crown of flame, dramatic chunky silhouette, transparent background |

**Chapter 5 — Fate Sanctum (命运圣殿)**

| Filename | Monster | Prompt |
| --- | --- | --- |
| `icon_monster_ch5_normal.png` | Shadow Assassin (影子刺客) | A small designer-toy cartoon shadow assassin, dark cloak, twin daggers, violet edge glow, compact chunky form, faceless hooded head, transparent background |
| `icon_monster_ch5_elite.png` | Fate Watcher (命运守望者) | A small designer-toy cartoon fate watcher, floating eye creature, violet rune orbit, robe-like dark body, eerie pale glow, transparent background |
| `icon_monster_ch5_anima.png` | Spirit Mirage (灵气幻象) | A small designer-toy cartoon spirit mirage, translucent pale blue figure, wavering silhouette, anima glow halo, transparent background |
| `icon_monster_ch5_boss.png` | Fate Guardian (命运守卫) | A large designer-toy cartoon fate guardian boss, twin-faced celestial armor, violet and gold rune aura, imposing symmetrical silhouette, fate wheel motif, transparent background |

## 4. P2 Boss and Chapter Theme Assets

Generate these when chapter-specific mechanics need better visual clarity.

Target directory: `assets/resources/art/ui/pve/map/` and `assets/resources/art/ui/pve/icons/`

| Filename | Use | Prompt |
| --- | --- | --- |
| `tile_sand_pit.png` | chapter 2 sand pit | A square quicksand pit tile, dark sand vortex, muted ochre rim, chunky toy bevel, readable hazard, transparent background |
| `tile_ice_tile.png` | chapter 3 ice slide | A square slick ice tile, dark blue glossy ice, pale cyan highlight, chunky beveled edge, transparent background |
| `tile_ice_wall_full.png` | ice wall | A chunky ice wall object for grid cell, cyan crystal block, dark outline, toy-like material, transparent background |
| `tile_ice_wall_dmg.png` | damaged ice wall | A damaged chunky ice wall object, cracks and missing corner, cyan crystal, dark outline, transparent background |
| `tile_shattered_ice.png` | shattered ice hazard | A square shattered ice hazard tile, sharp cyan shards but cartoon safe, dark outline, transparent background |
| `tile_lava.png` | lava tile | A square lava hazard tile, dark volcanic rock edge, controlled orange red molten center, chunky toy bevel, transparent background |
| `tile_lava_warn.png` | lava warning | A transparent square lava warning overlay, red orange rune glow, readable hazard marker, transparent background |
| `icon_boss_warn.png` | boss warning | A compact boss warning icon, dark stone triangle rune, crimson glow, thick outline, transparent background |
| `panel_boss_phase_9s.png` | boss phase banner | A dramatic boss phase banner panel, dark red stone and smoky glass, muted gold rune edge, empty center, 9-slice friendly, transparent background |

## 5. P2 Destiny Tree Assets

Target directory: `assets/resources/art/ui/pve/destiny/`  
Generate after expedition map and HUD are readable.

| Filename | Use | Prompt |
| --- | --- | --- |
| `node_locked.png` | locked node | A circular destiny tree node, dark stone, dim locked center, thick outline, no text, transparent background |
| `node_available.png` | unlockable node | A circular destiny tree node, dark stone with cyan magical glow, collectible toy bevel, no text, transparent background |
| `node_unlocked.png` | unlocked node | A circular destiny tree node, muted gold and cyan glow, bright inner rune, collectible toy bevel, no text, transparent background |
| `line_node_h.png` | horizontal connector | A short horizontal magical connector line, cyan rune energy, transparent background |
| `line_node_v.png` | vertical connector | A short vertical magical connector line, cyan rune energy, transparent background |
| `bar_shards_9s.png` | shard display bar | A small dark shard counter bar, smoky stone glass, cyan crystal accent, 9-slice friendly, transparent background |
| `btn_unlock_9s.png` | unlock button | A compact unlock button, dark teal stone, cyan rune glow, 9-slice friendly, transparent background |

## 6. Generation Workflow

1. Generate P0 map tiles and entities first.
2. Check readability at `56x56`, `70x70`, and `112x112` display sizes.
3. Regenerate any asset whose silhouette is unclear at small size.
4. Generate HUD icons and panels next.
5. Import into `assets/resources/art/ui/pve/...`.
6. Open Cocos Creator and let `.meta` files generate.
7. For `_9s` assets, configure sliced borders in Cocos.
8. Run the UUID sync flow only after assets are accepted.

## 7. First Delivery Checklist

### P0 style sample gate

Generate and approve these six assets before the full P0 run:

- [ ] `pve/map/tile_floor_ch1.png`
- [ ] `pve/map/tile_fog.png`
- [ ] `pve/map/icon_monster_ch1_normal.png`
- [ ] `pve/map/icon_player.png`
- [ ] `pve/map/icon_chest.png`
- [ ] `pve/map/icon_key.png`

`icon_monster_normal.png` is only a fallback. It is not accepted as the Chapter 1 floor 1 Goblin Warrior.

### Full P0 batch after style approval

- [ ] `pve/map/tile_fog.png`
- [ ] `pve/map/tile_floor_ch1.png`
- [ ] `pve/map/tile_selected_frame.png`
- [ ] `pve/map/mark_move_range.png`
- [ ] `pve/map/mark_attack_range.png`
- [ ] `pve/map/icon_player.png`
- [ ] `pve/map/icon_monster_normal.png`
- [ ] `pve/map/icon_monster_elite.png`
- [ ] `pve/map/icon_monster_anima.png`
- [ ] `pve/map/icon_monster_boss.png`
- [ ] `pve/map/icon_chest.png`
- [ ] `pve/map/icon_key.png`
- [ ] `pve/map/icon_exit.png`
- [ ] `pve/icons/icon_hud_hp.png`
- [ ] `pve/icons/icon_hud_ap.png`
- [ ] `pve/icons/icon_hud_attack.png`
- [ ] `pve/icons/icon_hud_gold.png`
- [ ] `pve/icons/icon_hud_anima.png`
- [ ] `pve/icons/icon_hud_key.png`
- [ ] `pve/hud/btn_pve_attack.png`
- [ ] `pve/hud/btn_pve_interact.png`
- [ ] `pve/hud/btn_pve_end_turn.png`
- [ ] `pve/popup/card_strengthen_choice_9s.png`
- [ ] `pve/popup/panel_strengthen_9s.png`

### Chapter-specific monster icons

Chapter 1 (P0 follow-up after the style sample; visible on launch):
- [ ] `pve/map/icon_monster_ch1_normal.png`
- [ ] `pve/map/icon_monster_ch1_elite.png`
- [ ] `pve/map/icon_monster_ch1_anima.png`
- [ ] `pve/map/icon_monster_ch1_boss.png`

Chapter 2–5 (generate per chapter as content unlocks):
- [ ] `pve/map/icon_monster_ch2_normal.png` … `ch5_boss.png` (16 files total)
