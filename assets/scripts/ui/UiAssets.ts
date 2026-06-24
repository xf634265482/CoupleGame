import {
  assetManager,
  AssetManager,
  ImageAsset,
  Node,
  Rect,
  resources as editorResources,
  Size,
  SpriteFrame,
  Texture2D,
  UITransform,
} from 'cc';
import { EDITOR } from 'cc/env';
import { applyUiLayerTree, visibleDesignSize } from '../platform/wechat/ViewAdapt';
import type { GameDoc, GamePlayer } from '../types/GameTypes';
import {
  ensureArtCover,
  normalizeUiSpriteFrame,
  removePlaceholderGraphics,
} from './UiSprite';

/** art/ui 下首批资源的 SpriteFrame UUID（备用：resources / main 失败时） */
export const UI_SPRITE_UUID: Record<string, string> = {
  'backgrounds/bg_board': '9dab1592-e610-4b0e-8557-9b0ad3ed894c@f9941',
  'backgrounds/bg_lobby': '61d7272b-0616-4fd0-b218-e6379344531e@f9941',
  'backgrounds/bg_room': '1201f551-924a-4b0f-b9b7-fc2c8adf1808@f9941',
  'backgrounds/bg_settlement': '3af7d3db-39e6-4c45-bb10-ae01b6694821@f9941',
  'board/buttons/btn_board_attack_9s': 'e4cf0cd5-ea60-44b0-917f-c056e787b35f@f9941',
  'board/buttons/btn_board_bag_9s': 'c7128bb5-74f0-4f6a-9ce1-d697cf763a31@f9941',
  'board/buttons/btn_board_disabled_9s': '1238f061-38f2-4b93-838b-ffae130fab11@f9941',
  'board/buttons/btn_board_end_9s': '5162564d-0148-42fd-9639-c2293c4d33d0@f9941',
  'board/buttons/btn_board_help_9s': 'cacef5c3-2efc-4f5a-a711-3c4b51e501de@f9941',
  'board/buttons/btn_board_quick_chat': 'a05c41a2-4065-4687-bb98-83842c2789cd@f9941',
  'board/buttons/btn_board_roll_9s': '0e03e5ae-e684-44cf-ae53-d7af0d2ea2ea@f9941',
  'board/cells/cell_burning': '86cc73ab-a343-4056-a7a4-e9e80a173fe4@f9941',
  'board/cells/cell_diamond': 'eb3cb51e-0637-4567-aff5-140ed2a70a41@f9941',
  'board/cells/cell_event': 'c4f2fff8-076a-42da-b8d6-102e82c4f11e@f9941',
  'board/cells/cell_final_shop': 'ef99f250-1697-4cf2-811f-1e43816a011a@f9941',
  'board/cells/cell_gold': 'a2d560e3-950f-4b15-9fd0-d096ab16e348@f9941',
  'board/cells/cell_gold_shop': '3fb8241a-0bb3-4f89-91dc-84d8055ebe4c@f9941',
  'board/cells/cell_legendary_shop': '47d93f97-71b0-4e10-8faf-c0f51076b7b1@f9941',
  'board/cells/cell_lucky': '2416831f-c507-4016-8a08-df8fb563e573@f9941',
  'board/cells/cell_minigame': 'e5a36cdc-04a7-4ddc-9d96-e1a9a56b6916@f9941',
  'board/cells/cell_normal': 'd59b1125-d459-4004-828a-db866b5d6bc5@f9941',
  'board/cells/cell_region_frame_1': 'c856c96b-a1a9-4496-8910-f0eda9fc31f3@f9941',
  'board/cells/cell_region_frame_2': 'fc79ff81-a47c-485a-ac8a-7fe6c6d9ffed@f9941',
  'board/cells/cell_region_frame_3': 'd5c82cbe-eede-42b7-9acf-569fdca9d2c8@f9941',
  'board/cells/cell_supply': 'df60c5a3-d5f0-4084-81e5-6a018ac75e82@f9941',
  'board/cells/cell_waste': '60db7c6f-7eca-4dd0-acdd-9e4820ec0747@f9941',
  'board/panels/bar_turn_status_9s': '096c39a0-275a-4542-bf35-68feb3e9626b@f9941',
  'board/panels/card_board_player_9s': 'c9bddfd4-50d4-4026-afc0-6fb0b23c291a@f9941',
  'board/panels/card_board_player_selected_9s': 'bb019742-a4ae-4d6e-92c8-1dcfdb6f3adc@f9941',
  'board/panels/panel_board_guide_9s': '51cdfedf-6a79-464d-bfd9-e2c23a8f73a4@f9941',
  'board/panels/panel_board_hud_9s': '841a0210-8e90-4b8d-b1d0-13b187a8bff2@f9941',
  'board/panels/panel_board_message_9s': '6a91b91e-aace-4236-8f62-8dd390f12af3@f9941',
  'board/panels/panel_board_modal_9s': '79a605c1-397c-4734-ba93-79233c6def70@f9941',
  'board/panels/panel_board_toast_9s': 'ee42c1b7-96da-42d5-9490-930f43be3376@f9941',
  'board/pawns/neutral_region_1': 'f909efc3-4c18-47e3-86e9-91face90d8b8@f9941',
  'board/pawns/neutral_region_2': '889366c9-c4cd-414a-8ae2-400c6f939284@f9941',
  'board/pawns/neutral_region_3': 'ffa40252-7770-45a2-834e-89c878fc6314@f9941',
  'board/pawns/pawn_player_1': '269cfaaf-86ed-4a1b-8141-666f8a6b874d@f9941',
  'board/pawns/pawn_player_2': '63300801-224e-4fc6-8b83-607a7fcd2ac5@f9941',
  'board/pawns/pawn_player_3': 'e437c523-c68c-444f-ac6a-5dd54cd55e82@f9941',
  'board/pawns/pawn_player_4': 'ee086de7-9705-45e2-ba5c-9753d8ce519a@f9941',
  'icons/icon_armor_armor': '7b036436-2b39-4328-8797-28c0c8960ea4@f9941',
  'icons/icon_armor_helmet': 'f26b39da-5f5b-49cb-aa90-2a7ab1515c82@f9941',
  'icons/icon_connected': '6523c396-ffba-4578-9784-b484ffd45b11@f9941',
  'icons/icon_item_dice': 'cb41b591-2030-4679-af0d-14bf3255ef90@f9941',
  'icons/icon_item_immunity': 'd50ae392-7418-4795-b806-2f7affdca589@f9941',
  'icons/icon_item_medkit': '6afb5301-2fe8-4fda-b8f4-01c185e13d68@f9941',
  'icons/icon_item_trap': '0fbf1016-eb1a-452f-b5ff-86fa8112ce4d@f9941',
  'icons/icon_item_vampire': '661af1f2-0dff-4d3a-8349-19deff5cd93b@f9941',
  'icons/icon_kill': 'a2588237-5962-4b6e-9835-4bd98f5faea3@f9941',
  'icons/icon_shoes_marching': 'b5056cb2-1c8a-4422-b3a8-ff8c88a2cb28@f9941',
  'icons/icon_shoes_rapid': 'e56f790e-21cb-45bf-9875-8c3ca388556f@f9941',
  'icons/icon_status_amulet': '5c68efed-fb09-4110-b522-9a438513dfa7@f9941',
  'icons/icon_status_bounty': '89633cd5-921e-4709-b027-b7a3a38b9551@f9941',
  'icons/icon_status_infected': '9931b0c8-352b-4df8-9926-40a869b5d04e@f9941',
  'icons/icon_warning': '0632447c-1e7c-42c8-a67d-9877f03a5253@f9941',
  'icons/icon_weapon_gun': '1635d088-18bd-4a2c-871c-aa5d2192498f@f9941',
  'icons/icon_weapon_rocket': '017a9adb-8614-442b-a6db-cd6323a93784@f9941',
  'icons/icon_weapon_sword': 'ab059d3c-267e-4438-9c9c-e947d750b60c@f9941',
  'lobby/btn_lobby_create_9s': '675daa6a-6531-4745-9b59-0382aede67d9@f9941',
  'lobby/btn_lobby_join_9s': '51406360-308d-4024-9aa1-74d31f28135f@f9941',
  'lobby/btn_lobby_match_9s': 'bb37a4d7-222e-4178-9492-5c02534b599a@f9941',
  'lobby/input_lobby_name_9s': 'be3ed857-affc-4056-a18c-330277e66f09@f9941',
  'lobby/logo_game': '32c676f7-3434-49a5-b02b-f96ba623c038@f9941',
  'lobby/panel_lobby_main_9s': 'edc5c209-6f75-4d1b-8079-9a01f2cd0695@f9941',
  'pve/backgrounds/bg_destiny_tree': 'b84fda9d-7263-47fc-a4f3-04c6050f6c72@f9941',
  'pve/backgrounds/bg_pve_camp': '93eabd9b-34de-480d-ba17-b8ce8f4690ad@f9941',
  'pve/backgrounds/bg_pve_ch1': '41cfbfa8-79b3-4c15-8e9b-24539c23cd1d@f9941',
  'pve/backgrounds/bg_pve_ch2': '94de010e-c1e9-437b-87db-57b460a2756b@f9941',
  'pve/backgrounds/bg_pve_ch3': 'dcb41494-9338-4cda-bb3d-e2a87df38184@f9941',
  'pve/backgrounds/bg_pve_ch4': '00c422be-4c5e-4d1e-91e4-a8437515a442@f9941',
  'pve/backgrounds/bg_pve_ch5': 'f8eb92ee-f6d2-461c-af0a-1dbfd97a45b8@f9941',
  'pve/backgrounds/bg_pve_ch2_runtime': '0571d640-33d1-4cdb-8db1-5783a54812d3@f9941',
  'pve/backgrounds/bg_pve_ch3_runtime': 'f5c61bff-8c24-4617-829c-cb5839e0691b@f9941',
  'pve/backgrounds/bg_pve_ch4_runtime': '3b53fb41-695d-4bcc-a99d-66e23fbb4716@f9941',
  'pve/backgrounds/bg_pve_ch5_runtime': '56c21963-e9aa-4414-82c5-7dd6655afe1b@f9941',
  'pve/camp/panel_camp_main_9s': '750cb7e3-fb89-4042-8dfd-b6bfd61698cc@f9941',
  'pve/class/icon_class_adventurer': 'c3c96b12-3d37-4e95-ba49-b45b0d33df86@f9941',
  'pve/class/icon_class_archer': 'be5c49d3-acf7-46cb-a5a9-3b2cfe1e6498@f9941',
  'pve/class/icon_class_berserker': '3e25de32-0135-40fd-8051-35334f423b14@f9941',
  'pve/class/icon_class_rogue': '47f2a9f0-4bb1-4e9d-8639-6067c6454148@f9941',
  'pve/destiny/node_frame': 'db81866d-7d58-4103-aaf0-ceb0ecef0311@f9941',
  'pve/hud/bar_pve_info_9s': '2ad83a84-63f1-4ca1-a1ff-88322d24be6d@f9941',
  'pve/hud/bg_dpad': 'e9214c11-1db7-4dec-a06d-4d9290a63dae@f9941',
  'pve/hud/btn_pve_interact': '0affe775-4482-49b2-91ac-a591b7fa8606@f9941',
  'pve/lobby/logo_destiny_tower': '4f0fa81a-aed1-44c8-a308-868ccd52189b@f9941',
  'pve/lobby/asset_top_chip_blue_9s': 'cb390222-af68-4338-b233-fb68249a3a76@f9941',
  'pve/lobby/icon_chip_destiny_shards': 'e4e41762-5cb6-4f3c-9e16-e33fb6287283@f9941',
  'pve/lobby/icon_chip_diamond': '0291cd6d-d83a-404e-9c19-27e740a81156@f9941',
  'pve/lobby/icon_chip_stamina': 'ca8b3db2-9f83-4686-bf48-68c0ac4c2ea5@f9941',
  'pve/lobby/icon_nav_expedition': '22a5cfbd-2a04-47db-b57b-5bbc03ce767b@f9941',
  'pve/lobby/icon_nav_destiny_tree': 'cf43bc2d-5af3-4d04-9504-221e91fedb85@f9941',
  'pve/lobby/icon_nav_leaderboard': '2fbbe305-2f22-451b-9180-f50af9d94437@f9941',
  'pve/icons/icon_block': 'c3ba5bc7-6418-4c9f-9132-7a00cbe97d65@f9941',
  'pve/icons/icon_boss_warn': '47c4ca2c-3b72-443c-9a19-e42c7932467e@f9941',
  'pve/icons/icon_crit': '4d1fb0cb-c865-477d-9f9c-5d7216ada90f@f9941',
  'pve/icons/icon_hud_anima': '14f1c72e-fd33-436a-9eb3-7c0e041c5a9e@f9941',
  'pve/icons/icon_hud_ap': 'f853553b-2106-4934-949c-16e20e9da708@f9941',
  'pve/icons/icon_hud_attack': '7c5237b7-b939-4ff5-80e5-d399221a2a01@f9941',
  'pve/icons/icon_hud_dice': 'f4ec4196-8dcf-4c66-9bb2-c43f279cf609@f9941',
  'pve/icons/icon_hud_diamond': '7f3b6d21-8c42-4c0a-a136-8e57d13e7a91@f9941',
  'pve/icons/icon_hud_gold': '59a3bef4-2c1c-43e7-9872-351d4d0bb543@f9941',
  'pve/icons/icon_hud_hp': '3c1851c1-6cee-4b06-98b7-8ceca889a3e2@f9941',
  'pve/icons/icon_hud_key': '97f6c5d6-0fad-4fc5-8808-6e0425f1ec69@f9941',
  'pve/icons/icon_hud_scroll': '53e5e4a6-1b02-4217-a1b5-0f566dfbf7e4@f9941',
  'pve/icons/icon_hud_shards': 'ad25e353-6aeb-4af4-ad99-070f5d402c0a@f9941',
  'pve/icons/icon_relic_default': 'e211a403-54d2-4af1-b3d8-4ea3a8ae37d3@f9941',
  'pve/icons/icon_scroll': '555df907-227f-4941-a388-5720152b9a20@f9941',
  'pve/icons/icon_status_burn': '63a4e701-56be-49b7-a900-773b7079547b@f9941',
  'pve/icons/icon_status_chill': '3399414b-02c8-4cc3-9353-d35d963b0193@f9941',
  'pve/icons/icon_status_frozen': '1a726b6d-ff78-44be-94f1-bd574085111b@f9941',
  'pve/map/icon_altar': '97ccc8b3-3729-40d8-baa1-ff1e4a9b94f1@f9941',
  'pve/map/icon_blacksmith': '95e9d13e-4114-44cc-a9e6-57768caf9d5d@f9941',
  'pve/map/icon_chest': '2838f2aa-64de-454a-ae11-a2ceb06f06b5@f9941',
  'pve/map/icon_exit': '753d8095-d142-4f2b-8bf8-ec8f6bbbff7e@f9941',
  'pve/map/icon_hot_spring': 'b00d36f7-7a69-4e3c-9ca7-12295f8efec2@f9941',
  'pve/map/icon_idol': '04aa29b5-1fd1-4897-98a1-7b42e21f825e@f9941',
  'pve/map/icon_key': '87815865-6e1a-48fc-a7f1-a558c1f50f52@f9941',
  'pve/map/icon_fragment': 'c01a3727-e289-4555-a2b9-e7ecd03a5d74@f9941',
  'pve/map/icon_monster_fire_goblin': '12cff37f-cd70-4383-9110-dd4e3f842b38@f9941',
  'pve/map/icon_monster_frost_goblin': '72d722b2-6dee-4867-a7fe-f52050095b91@f9941',
  'pve/map/icon_monster_goblin_archer': 'be793e36-444e-464c-be97-0b8a2294c609@f9941',
  'pve/map/icon_monster_goblin_chief': 'f38df912-d0ef-417e-89b6-ae5cafeb31c5@f9941',
  'pve/map/icon_monster_goblin_warrior': 'd6b048c1-f591-45e4-9942-5132661d1ddb@f9941',
  'pve/map/icon_monster_spirit_rat': '0c8e40ff-837c-4310-841d-b5cc4b58714c@f9941',
  'pve/map/icon_monster_anima': '29b46c10-beb4-4598-977a-7e9e69ee378e@f9941',
  'pve/map/icon_monster_boss': 'cd9e9f82-2c80-4375-8f52-0f5bced1256c@f9941',
  'pve/map/icon_monster_ch1_normal': '83a5fda4-9dc8-4754-8d70-6ccb0ffe5c0b@f9941',
  'pve/map/icon_monster_ch1_elite': 'a5361819-031b-4b77-a572-646bfc3c9edc@f9941',
  'pve/map/icon_monster_ch1_anima': 'acb754d0-d795-43a7-b846-79e1bc8b70f4@f9941',
  'pve/map/icon_monster_ch1_boss': '4051ffdd-2918-48b6-b827-230dc0353f47@f9941',
  'pve/map/icon_monster_ch2_normal': 'a40a74d6-5716-4cad-87d1-6b23ba4b490a@f9941',
  'pve/map/icon_monster_ch2_elite': '86482252-26dc-404b-99ee-818c202ef2a0@f9941',
  'pve/map/icon_monster_ch2_anima': '3a2ba686-59e3-4acc-9583-3579427edaa9@f9941',
  'pve/map/icon_monster_ch2_boss': '588f96bd-4552-4463-ae7b-468832854c6f@f9941',
  'pve/map/icon_monster_ch3_normal': 'ea6bbcb6-0391-40c2-af0d-2106046ebcd0@f9941',
  'pve/map/icon_monster_ch3_elite': 'ab8045bb-6422-4a22-8b2a-bede2b877f84@f9941',
  'pve/map/icon_monster_ch3_anima': '7d4ad8be-5d66-4613-aa20-733d2ab82139@f9941',
  'pve/map/icon_monster_ch3_boss': '29a377eb-11f6-4b26-8d84-03b02c5693b5@f9941',
  'pve/map/icon_monster_ch4_normal': '7ebc8e60-92ff-4541-883a-2dd6e1b3d08d@f9941',
  'pve/map/icon_monster_ch4_elite': 'd7fca926-2100-43fb-accb-c90c9485af53@f9941',
  'pve/map/icon_monster_ch4_anima': '5e78b744-b067-4190-940e-792f988604da@f9941',
  'pve/map/icon_monster_ch4_boss': '8d666502-18b8-4927-8752-1429a2440310@f9941',
  'pve/map/icon_monster_ch5_normal': '69217ae5-1071-4684-9639-9ce6d1119e49@f9941',
  'pve/map/icon_monster_ch5_elite': 'a9234413-234c-48ab-92ec-1fb4ea936ad1@f9941',
  'pve/map/icon_monster_ch5_anima': '75e7d718-5de4-40de-a074-6c9077809904@f9941',
  'pve/map/icon_monster_ch5_boss': '571800a6-1f4c-4ec0-89ab-92a2c886671e@f9941',
  'pve/map/icon_monster_elite': '4393b67e-6e9e-4414-a452-c9b50ff2475a@f9941',
  'pve/map/icon_monster_normal': '4acc5677-9e5e-42c2-910c-95a6550fa61f@f9941',
  'pve/map/icon_player': 'f621a780-95f7-4cab-bfd0-71de76b89e44@f9941',
  'pve/map/icon_player_berserker': '3eb74915-eb1a-4fe9-9269-6f1aaeaac54a@f9941',
  'pve/map/icon_player_archer': '60b71ffd-a93b-49a3-8aed-d05d11817b09@f9941',
  'pve/map/icon_player_rogue': '03e14bae-3952-4aab-a903-c42110a386fa@f9941',
  'pve/map/icon_portal': 'b6e018c4-5a3a-4384-ba92-394bd03c574d@f9941',
  'pve/map/mark_attack_range': '19c2ac62-f809-4b87-a26b-7b2a8f2b567b@f9941',
  'pve/map/mark_move_range': '7cd41b51-8d59-4da8-b245-b2d2c86c9ba2@f9941',
  'pve/map/tile_floor_ch1': '2e6ec7ed-fa51-4278-ad56-f0ddb03dfbe6@f9941',
  'pve/map/tile_floor_ch1L': '6b9be095-3a24-4603-83f0-e81dafd9c46b@f9941',
  'pve/map/tile_floor_ch2': '76b4a3db-b2b9-472e-bf86-a61d0de2419c@f9941',
  'pve/map/tile_floor_ch3': '1f4d79be-7014-4707-9079-b4b83c14df36@f9941',
  'pve/map/tile_floor_ch4': '8a57498e-8f89-4244-9818-f3cd8f7fd230@f9941',
  'pve/map/tile_floor_ch5': '0613b374-6008-4582-b4dc-993457f49a30@f9941',
  'pve/map/tile_fog': 'cb221eaf-62c2-42df-b751-2d6d521e1652@f9941',
  'pve/map/tile_selected_frame': 'd92094e5-211d-460b-88c0-919a9775b933@f9941',
  'pve/panel/panel_char_bg_9s': '1b6233d0-eb91-4fc5-b3ca-728573a47442@f9941',
  'pve/panel/slot_equip_empty': '813a20e5-014e-4d22-bad8-707344802b0e@f9941',
  'pve/popup/card_strengthen_choice_9s': 'aba6145e-4fdd-4393-8ad3-a6ef098828fd@f9941',
  'pve/popup/panel_death_9s': '2f8c1707-d1a4-4ef5-bf61-4465f0f59b39@f9941',
  'pve/popup/panel_floor_clear_9s': '2c33d542-f371-4218-a046-1c6476951872@f9941',
  'pve/popup/panel_interact_9s': '5c3eb0e2-e1e5-43de-9303-59aa2c451921@f9941',
  'pve/popup/panel_strengthen_9s': '15848f75-bfa3-4f32-aa0d-a7d2528fa09c@f9941',
  'room/card_room_player_empty': 'ebc95ea1-0db2-4cf5-b848-a5780cd90d8d@f9941',
  'room/card_room_player_ready': '31cc810e-f907-46ab-8dd8-d8864ae357bb@f9941',
  'room/panel_room_main_9s': '3a884848-ff37-4199-b774-d15280308671@f9941',
  'room/tag_room_host': 'ee53ec4e-11c8-48f4-bc24-3d7bce7ce2f7@f9941',
  'settlement/btn_settlement_again_9s': 'cb6c0235-9149-4dbe-887e-79df0513cfd9@f9941',
  'settlement/btn_settlement_back_9s': 'c94477aa-845d-4c6f-b8ee-3cbe189af70e@f9941',
  'settlement/panel_settlement_main_9s': '30483805-adb1-4426-858a-22bbbb0e9ac0@f9941',
  'settlement/rank_1': '3ac8ca77-2d06-421f-8a11-752f273a0be8@f9941',
  'settlement/rank_2': '7a06375f-0d82-43bd-aeda-87c36f46dea9@f9941',
  'settlement/rank_3': '32ad20eb-2a34-4a72-b672-221754991c3d@f9941',
  'settlement/tag_defeated': '94066614-f4e1-4821-bd74-eb1920fbe18c@f9941',
  'settlement/tag_winner': 'f2285c82-366e-4e00-bbd2-15967179486c@f9941',
};

export const CELL_TYPE_SPRITE: Record<string, string> = {
  NORMAL: 'board/cells/cell_normal',
  GOLD: 'board/cells/cell_gold',
  DIAMOND: 'board/cells/cell_diamond',
  SUPPLY: 'board/cells/cell_supply',
  WASTE: 'board/cells/cell_waste',
  BURNING: 'board/cells/cell_burning',
  EVENT: 'board/cells/cell_event',
  GOLD_SHOP: 'board/cells/cell_gold_shop',
  LEGENDARY_SHOP: 'board/cells/cell_legendary_shop',
  FINAL_SHOP: 'board/cells/cell_final_shop',
  LUCKY: 'board/cells/cell_lucky',
};

const BOARD_BTN_KEYS: Record<string, string> = {
  roll: 'board/buttons/btn_board_roll_9s',
  bag: 'board/buttons/btn_board_bag_9s',
  atk: 'board/buttons/btn_board_attack_9s',
  help: 'board/buttons/btn_board_help_9s',
  end: 'board/buttons/btn_board_end_9s',
  quickChat: 'board/buttons/btn_board_quick_chat',
  disabled: 'board/buttons/btn_board_disabled_9s',
};

export const BOARD_PAWN_KEYS = [
  'board/pawns/pawn_player_1',
  'board/pawns/pawn_player_2',
  'board/pawns/pawn_player_3',
  'board/pawns/pawn_player_4',
  'board/pawns/neutral_region_1',
  'board/pawns/neutral_region_2',
  'board/pawns/neutral_region_3',
] as const;

const LOBBY_UI_KEYS = [
  'lobby/logo_game',
  'lobby/panel_lobby_main_9s',
  'lobby/btn_lobby_create_9s',
  'lobby/btn_lobby_join_9s',
  'lobby/btn_lobby_match_9s',
  'lobby/input_lobby_name_9s',
] as const;

export const ROOM_UI_KEYS = [
  'room/panel_room_main_9s',
  'room/card_room_player_empty',
  'room/card_room_player_ready',
  'room/tag_room_host',
] as const;

export const SETTLEMENT_UI_KEYS = [
  'settlement/panel_settlement_main_9s',
  'settlement/rank_1',
  'settlement/rank_2',
  'settlement/rank_3',
  'settlement/tag_winner',
  'settlement/tag_defeated',
  'settlement/btn_settlement_back_9s',
  'settlement/btn_settlement_again_9s',
] as const;

export const PVE_MAP_KEYS = [
  'pve/map/tile_fog',
  'pve/map/tile_floor_ch1',
  'pve/map/tile_floor_ch2',
  'pve/map/tile_floor_ch3',
  'pve/map/tile_floor_ch4',
  'pve/map/tile_floor_ch5',
  'pve/map/tile_selected_frame',
  'pve/map/mark_move_range',
  'pve/map/mark_attack_range',
  'pve/map/icon_player',
  'pve/map/icon_player_berserker',
  'pve/map/icon_player_archer',
  'pve/map/icon_player_rogue',
  'pve/map/icon_portal',
  'pve/map/icon_monster_normal',
  'pve/map/icon_monster_ch1_normal',
  'pve/map/icon_monster_ch1_elite',
  'pve/map/icon_monster_ch1_anima',
  'pve/map/icon_monster_ch1_boss',
  'pve/map/icon_monster_goblin_warrior',
  'pve/map/icon_monster_goblin_archer',
  'pve/map/icon_monster_frost_goblin',
  'pve/map/icon_monster_fire_goblin',
  'pve/map/icon_monster_spirit_rat',
  'pve/map/icon_monster_goblin_chief',
  'pve/map/icon_monster_ch2_normal',
  'pve/map/icon_monster_ch2_elite',
  'pve/map/icon_monster_ch2_anima',
  'pve/map/icon_monster_ch2_boss',
  'pve/map/icon_monster_ch3_normal',
  'pve/map/icon_monster_ch3_elite',
  'pve/map/icon_monster_ch3_anima',
  'pve/map/icon_monster_ch3_boss',
  'pve/map/icon_monster_ch4_normal',
  'pve/map/icon_monster_ch4_elite',
  'pve/map/icon_monster_ch4_anima',
  'pve/map/icon_monster_ch4_boss',
  'pve/map/icon_monster_ch5_normal',
  'pve/map/icon_monster_ch5_elite',
  'pve/map/icon_monster_ch5_anima',
  'pve/map/icon_monster_ch5_boss',
  'pve/map/icon_monster_elite',
  'pve/map/icon_monster_anima',
  'pve/map/icon_monster_boss',
  'pve/map/icon_chest',
  'pve/map/icon_key',
  'pve/map/icon_exit',
  'pve/map/icon_altar',
  'pve/map/icon_blacksmith',
  'pve/map/icon_hot_spring',
  'pve/map/icon_idol',
  'pve/map/icon_fragment',
  'pve/map/terrain_rock',
  'pve/map/icon_sand_pit_permanent',
  'pve/map/terrain_ice_wall',
  'pve/map/terrain_ice_tile',
  'pve/map/terrain_freeze_wall',
  'pve/map/terrain_shattered_ice',
  'pve/map/terrain_lava',
] as const;

export const PVE_HUD_KEYS = [
  'pve/icons/icon_hud_hp',
  'pve/icons/icon_hud_ap',
  'pve/icons/icon_hud_attack',
  'pve/icons/icon_hud_gold',
  'pve/icons/icon_hud_anima',
  'pve/icons/icon_hud_key',
  'pve/icons/icon_hud_dice',
  'pve/icons/icon_hud_diamond',
  'pve/icons/icon_hud_shards',
  'pve/icons/icon_hud_scroll',
  'pve/hud/btn_pve_interact',
] as const;

/** 战斗状态/战报/遗物图标 */
export const PVE_STATUS_KEYS = [
  'pve/icons/icon_block',
  'pve/icons/icon_boss_warn',
  'pve/icons/icon_crit',
  'pve/icons/icon_relic_default',
  'pve/icons/icon_scroll',
  'pve/icons/icon_status_burn',
  'pve/icons/icon_status_chill',
  'pve/icons/icon_status_frozen',
] as const;

/** 职业图标 */
export const PVE_CLASS_KEYS = [
  'pve/class/icon_class_adventurer',
  'pve/class/icon_class_archer',
  'pve/class/icon_class_berserker',
  'pve/class/icon_class_rogue',
] as const;

export const PVE_POPUP_KEYS = [
  'pve/popup/card_strengthen_choice_9s',
  'pve/popup/panel_strengthen_9s',
  'pve/popup/panel_interact_9s',
  'pve/popup/panel_death_9s',
  'pve/popup/panel_floor_clear_9s',
] as const;

/** 大章节背景（720×1280 竖图）；微信真机走分包，不进主包 native */
// 首章背景是远征首屏关键图，需进入主包；其余大背景继续走资源分包。
export const PVE_CHAPTER_BG_KEYS = {
  1: 'pve/backgrounds/bg_pve_ch1',
  2: 'pve/backgrounds/bg_pve_ch2_runtime',
  3: 'pve/backgrounds/bg_pve_ch3_runtime',
  4: 'pve/backgrounds/bg_pve_ch4_runtime',
  5: 'pve/backgrounds/bg_pve_ch5_runtime',
} as const;

export const PVE_BG_KEYS = [
  ...Object.values(PVE_CHAPTER_BG_KEYS),
  'pve/backgrounds/bg_pve_camp',
  'pve/backgrounds/bg_destiny_tree',
] as const;

/** 面板/弹窗/营地/命运树底框，与弹窗一起预加载 */
export const PVE_PANEL_KEYS = [
  'pve/panel/panel_char_bg_9s',
  'pve/panel/slot_equip_empty',
  'pve/camp/panel_camp_main_9s',
  'pve/destiny/node_frame',
] as const;

export const PVE_UI_KEYS = [
  ...PVE_MAP_KEYS,
  ...PVE_HUD_KEYS,
  ...PVE_STATUS_KEYS,
  ...PVE_CLASS_KEYS,
  ...PVE_POPUP_KEYS,
  ...PVE_PANEL_KEYS,
] as const;

/** 大厅首屏必需：仅大厅背景 + 大厅 UI；阻塞启动流程，越小越快。 */
const LOBBY_ESSENTIAL_KEYS = [
  'backgrounds/bg_lobby',
  ...LOBBY_UI_KEYS,
] as const;

/** PVE-only 大厅最小图集；不触发输入框、匹配按钮、房间或棋盘资源加载。 */
const PVE_LOBBY_ESSENTIAL_KEYS = [
  'backgrounds/bg_lobby',
  'pve/lobby/logo_destiny_tower',
  'pve/lobby/asset_top_chip_blue_9s',
  'pve/lobby/icon_chip_destiny_shards',
  'pve/lobby/icon_chip_diamond',
  'pve/lobby/icon_chip_stamina',
  'pve/lobby/icon_nav_expedition',
  'pve/lobby/icon_nav_destiny_tree',
  'pve/lobby/icon_nav_leaderboard',
] as const;

/** 大厅次要：房间背景/卡片/棋子等，可在大厅显示后后台预加载，玩家点"创建房间"前几乎肯定已就绪。 */
const LOBBY_BACKGROUND_KEYS = [
  'backgrounds/bg_room',
  ...ROOM_UI_KEYS,
  ...BOARD_PAWN_KEYS,
] as const;

const SETTLEMENT_KEYS = [
  'backgrounds/bg_settlement',
  ...SETTLEMENT_UI_KEYS,
] as const;

/** 装备 / 道具 / 商店商品 → art/ui 路径 */
export const ITEM_ICON_KEY: Record<string, string> = {
  SWORD: 'icons/icon_weapon_sword',
  GUN: 'icons/icon_weapon_gun',
  ROCKET: 'icons/icon_weapon_rocket',
  HELMET: 'icons/icon_armor_helmet',
  ARMOR: 'icons/icon_armor_armor',
  MARCHING_SHOES: 'icons/icon_shoes_marching',
  RAPID_SHOES: 'icons/icon_shoes_rapid',
  DOUBLE_DICE: 'icons/icon_item_dice',
  TRAP: 'icons/icon_item_trap',
  MEDKIT: 'icons/icon_item_medkit',
  IMMUNITY_POTION: 'icons/icon_item_immunity',
  VAMPIRE_STONE: 'icons/icon_item_vampire',
};

/** Cocos 编译后 [...new Set(...)] 可能变成 Set 对象本身，禁止用于预加载列表 */
function uniqueUiKeys(values: readonly string[]): string[] {
  const out: string[] = [];
  for (const v of values) {
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

export const ITEM_ICON_PRELOAD_KEYS = uniqueUiKeys(Object.values(ITEM_ICON_KEY));

/** 状态 / 战报角标 → art/ui 路径 */
export const STATUS_ICON_KEY = {
  KILL: 'icons/icon_kill',
  INFECTED: 'icons/icon_status_infected',
  BOUNTY: 'icons/icon_status_bounty',
  AMULET: 'icons/icon_status_amulet',
  WARNING: 'icons/icon_warning',
  CONNECTED: 'icons/icon_connected',
} as const;

export const STATUS_ICON_PRELOAD_KEYS = uniqueUiKeys(Object.values(STATUS_ICON_KEY));

export type StatusBadge = { key: string; count?: number };

/** HUD 玩家卡角标：击杀、感染、悬赏、护符、低血/淘汰警告（在线图标暂时禁用） */
export function playerStatusBadges(p: GamePlayer, game: GameDoc): StatusBadge[] {
  const badges: StatusBadge[] = [];
  const kills = p.kills ?? 0;
  if (kills > 0) badges.push({ key: STATUS_ICON_KEY.KILL, count: kills });
  if (p.infected) badges.push({ key: STATUS_ICON_KEY.INFECTED });
  if (p.chosenOne || game.bountySeat === p.seat) {
    badges.push({ key: STATUS_ICON_KEY.BOUNTY });
  }
  if (p.mysteriousAmulet) badges.push({ key: STATUS_ICON_KEY.AMULET });
  const hp = p.hp ?? 0;
  if (p.isDefeated || (!p.isDefeated && hp > 0 && hp <= 2)) {
    badges.push({ key: STATUS_ICON_KEY.WARNING });
  }
  return badges;
}

/** 商店行 / 背包选项 / 玩家装备 → 图标 key */
export function resolveItemIconKey(idOrKind: string): string | null {
  const direct = ITEM_ICON_KEY[idOrKind];
  if (direct) return direct;
  if (idOrKind.startsWith('EW_')) {
    return ITEM_ICON_KEY[idOrKind.slice(3)] ?? null;
  }
  if (idOrKind === 'U_DOUBLE_DICE') return ITEM_ICON_KEY.DOUBLE_DICE;
  if (idOrKind === 'U_TRAP') return ITEM_ICON_KEY.TRAP;
  if (idOrKind === 'U_MEDKIT') return ITEM_ICON_KEY.MEDKIT;
  return null;
}

/** 预加载列表：仅 resources/art/ui 里实际存在的图（删资源后勿留死路径） */
const BOARD_KEYS = [
  'backgrounds/bg_board',
  ...Object.values(CELL_TYPE_SPRITE),
  'board/cells/cell_region_frame_1',
  'board/cells/cell_region_frame_2',
  'board/cells/cell_region_frame_3',
  ...ITEM_ICON_PRELOAD_KEYS,
  ...STATUS_ICON_PRELOAD_KEYS,
] as const;

export const BOARD_PANEL_KEYS = [
  'board/panels/panel_board_hud_9s',
  'board/panels/card_board_player_9s',
  'board/panels/card_board_player_selected_9s',
  'board/panels/panel_board_message_9s',
  'board/panels/panel_board_modal_9s',
  'board/panels/panel_board_guide_9s',
  'board/panels/panel_board_toast_9s',
  'board/panels/bar_turn_status_9s',
] as const;

/** 按钮/面板图放回 resources 后取消注释并跑 sync-ui-asset-uuids.py */
export const BOARD_OPTIONAL_IMAGE_KEYS = [
  ...Object.values(BOARD_BTN_KEYS),
  ...BOARD_PANEL_KEYS,
  ...BOARD_PAWN_KEYS,
] as const;

const cache = new Map<string, SpriteFrame>();

let resourcesReady: Promise<AssetManager.Bundle | null> | null = null;

function isWechatRuntime(): boolean {
  return typeof wx !== 'undefined' && typeof wx.loadSubpackage === 'function';
}

/** 微信开发者工具：分包 native 无法 fs.readFile，须走 bundle.load */
function isWechatDevtools(): boolean {
  if (!isWechatRuntime()) {
    return false;
  }
  try {
    const sys = wx.getSystemInfoSync?.();
    return sys?.platform === 'devtools';
  } catch {
    return false;
  }
}

/** 微信真机（非开发者工具） */
function usesWechatNativeFs(): boolean {
  return isWechatRuntime() && !isWechatDevtools();
}

/** 真机分包下载完成后额外等待（success 常早于 native 落盘；bytesExpected=0 时更久） */
const WECHAT_REAL_DEVICE_SUBPACKAGE_SETTLE_MS = 1000;
const WECHAT_SUBPACKAGE_ZERO_BYTES_EXTRA_MS = 1000;
/** 分包-only 资源 copyFile 重试（大背景） */
const SUB_NATIVE_RETRY_ATTEMPTS = 12;
const SUB_NATIVE_RETRY_INTERVAL_MS = 200;
/** 并行 preload 过大会压垮微信 fs，真机分批加载 */
const PRELOAD_BATCH_SIZE = 6;
/** 仅分包的大背景/结算，不进主包；preload 跳过；主包仅有编译占位 PNG */
const WECHAT_SUBPACKAGE_ONLY_KEYS = new Set([
  'backgrounds/bg_settlement',
  'pve/backgrounds/bg_pve_ch2',
  'pve/backgrounds/bg_pve_ch3',
  'pve/backgrounds/bg_pve_ch4',
  'pve/backgrounds/bg_pve_ch5',
  'pve/backgrounds/bg_pve_ch2_runtime',
  'pve/backgrounds/bg_pve_ch3_runtime',
  'pve/backgrounds/bg_pve_ch4_runtime',
  'pve/backgrounds/bg_pve_ch5_runtime',
  'pve/backgrounds/bg_pve_camp',
  'pve/backgrounds/bg_destiny_tree',
]);

function isPveCriticalNative(key: string): boolean {
  if (
    key === 'pve/map/tile_floor_ch1L'
    || key === 'pve/map/tile_floor_ch1'
    || /^pve\/backgrounds\/bg_pve_ch[2-5]_runtime$/.test(key)
  ) {
    return false;
  }
  return key === 'pve/backgrounds/bg_pve_ch1'
    || key.startsWith('pve/map/')
    || key.startsWith('pve/hud/')
    || key.startsWith('pve/lobby/')
    || key.startsWith('pve/icons/icon_hud_');
}

function usesSubpackageOnlyNative(key: string): boolean {
  return WECHAT_SUBPACKAGE_ONLY_KEYS.has(key)
    || key.startsWith('settlement/')
    || (key.startsWith('pve/') && !isPveCriticalNative(key));
}
const WECHAT_SUBPACKAGE_DOWNLOAD_WAIT_MS = 30000;

/**
 * 微信 readFile 候选路径（含 / 前缀变体）。
 * 禁止用 [...new Set(flatMap(...))]：Cocos 编译后会变成 [].concat(new Set(...))，
 * 把整个 Set 对象传给 readFile，真机报 parameter.filePath should be String instead of Object。
 * 与 BgmController.wechatBgmSourcePaths 相同写法。
 */
function wechatNativeReadCandidates(paths: readonly string[]): string[] {
  const candidates: string[] = [];
  for (const path of paths) {
    const normalized = path.replace(/^\/+/, '');
    const variants = normalized === path ? [path, `/${path}`] : [path, normalized];
    for (const candidate of variants) {
      if (!candidates.includes(candidate)) {
        candidates.push(candidate);
      }
    }
  }
  return candidates;
}

/**
 * 真机 Error 4930：分包 native 不能以 / 开头（引擎或补丁曾加过此前缀）。
 * 仅规范化 URL 后交回引擎 downloadDomImage；禁止 readFile 拦截（真机 fs 读不到分包 native）。
 */
function patchWechatSubpackageImageDownloader(): void {
  if (!usesWechatNativeFs()) {
    return;
  }
  type Downloader = typeof assetManager.downloader & {
    downloadDomImage?: (
      url: string,
      options: Record<string, unknown>,
      onComplete: (err?: Error | null, img?: HTMLImageElement) => void,
    ) => void;
    __coupleSubNativePatched?: boolean;
  };
  const dl = assetManager.downloader as Downloader;
  if (dl.__coupleSubNativePatched || typeof dl.downloadDomImage !== 'function') {
    return;
  }
  const original = dl.downloadDomImage.bind(dl) as Downloader['downloadDomImage'];
  dl.downloadDomImage = ((url, options, onComplete) => {
    let bare = url.replace(/^\/+/, '');
    if (bare.includes('subpackages/resources/native/')) {
      bare = bare.replace('subpackages/resources/native/', `${MAIN_NATIVE_ROOT}/`);
    }
    original?.(bare, options, onComplete);
  }) as Downloader['downloadDomImage'];
  dl.__coupleSubNativePatched = true;
  console.log('[UiAssets] patched downloadDomImage strip-leading-slash');
}

function waitForWechatSubpackageBytes(
  isComplete: () => boolean,
  maxWaitMs = WECHAT_SUBPACKAGE_DOWNLOAD_WAIT_MS,
  intervalMs = 200,
): Promise<void> {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (isComplete() || Date.now() - started >= maxWaitMs) {
        resolve();
        return;
      }
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

/** 微信：须先 loadSubpackage，再 loadBundle('resources')（由 engine-adapter 映射到分包目录） */
function loadWechatSubpackage(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!isWechatRuntime()) {
      resolve();
      return;
    }

    const devtools = isWechatDevtools();
    let settled = false;
    let downloadComplete = devtools;
    let bytesExpected = 0;
    let bytesWritten = 0;

    const settleOk = (label: string) => {
      if (settled) return;
      settled = true;
      console.log('[UiAssets] wx.loadSubpackage', name, 'ok,', label);
      resolve();
    };

    const settleFail = (err: unknown) => {
      if (settled) return;
      settled = true;
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    const isDownloadComplete = () => {
      if (downloadComplete) return true;
      if (bytesExpected > 0 && bytesWritten >= Math.floor(bytesExpected * 0.98)) {
        return true;
      }
      return false;
    };

    const runAfterDownload = () => {
      if (settled) return;
      if (devtools) {
        settleOk('devtools skip fs probe');
        return;
      }
      void waitForWechatSubpackageBytes(isDownloadComplete).then(() => {
        if (settled) return;
        const extraMs =
          bytesExpected > 0 ? WECHAT_REAL_DEVICE_SUBPACKAGE_SETTLE_MS : WECHAT_SUBPACKAGE_ZERO_BYTES_EXTRA_MS;
        setTimeout(
          () => settleOk(`real-device after download ${bytesWritten}/${bytesExpected || '?'}`),
          extraMs,
        );
      });
    };

    const task = wx.loadSubpackage({
      name,
      success: () => runAfterDownload(),
      fail: (err) => settleFail(err ?? new Error(`loadSubpackage ${name} failed`)),
    });

    if (task && typeof task.onProgressUpdate === 'function') {
      task.onProgressUpdate((res) => {
        bytesExpected = res.totalBytesExpectedToWrite || bytesExpected;
        bytesWritten = res.totalBytesWritten || bytesWritten;
        if (res.progress >= 100 || isDownloadComplete()) {
          downloadComplete = true;
        }
        if (res.progress === 100 || res.progress % 25 === 0) {
          console.log(
            '[UiAssets] subpackage download',
            name,
            res.progress,
            `${res.totalBytesWritten}/${res.totalBytesExpectedToWrite}`,
          );
        }
      });
    }
  });
}

function isWechatResourcesBundleReady(bundle: AssetManager.Bundle): boolean {
  const base = bundle.base ?? '';
  return base.includes('subpackages/resources');
}

/** 确保 resources 分包已下载并注册到 assetManager（大厅/棋盘 UI 依赖） */
export function ensureResourcesBundle(): Promise<AssetManager.Bundle | null> {
  if (EDITOR) {
    return Promise.resolve(assetManager.getBundle('resources'));
  }

  const existing = assetManager.bundles.get('resources');
  if (existing) {
    if (!isWechatRuntime() || isWechatResourcesBundleReady(existing)) {
      return Promise.resolve(existing);
    }
    assetManager.removeBundle(existing);
    resourcesReady = null;
  }

  if (!resourcesReady) {
    resourcesReady = loadResourcesBundleOnce();
  }

  return resourcesReady;
}

function loadResourcesBundleOnce(): Promise<AssetManager.Bundle | null> {
  patchWechatSubpackageImageDownloader();

  const loadByName = (): Promise<AssetManager.Bundle | null> =>
    new Promise((resolve) => {
      try {
        assetManager.loadBundle('resources', (err, bundle) => {
          if (err || !bundle) {
            console.error('[UiAssets] loadBundle(resources) failed', err);
            resolve(null);
            return;
          }
          if (isWechatRuntime() && !isWechatResourcesBundleReady(bundle)) {
            console.error('[UiAssets] resources bundle base wrong', bundle.base);
            resolve(null);
            return;
          }
          console.log('[UiAssets] resources bundle ready', bundle.name, bundle.base);
          resolve(bundle);
        });
      } catch (syncErr) {
        console.error('[UiAssets] loadBundle(resources) threw', syncErr);
        resolve(null);
      }
    });

  if (!isWechatRuntime()) {
    return loadByName();
  }

  console.log('[UiAssets] loading resources subpackage…', usesWechatNativeFs() ? 'real-device' : 'devtools');
  return loadWechatSubpackage('resources')
    .then(() => loadByName())
    .then((bundle) => {
      if (!bundle || !isWechatRuntime()) {
        return bundle;
      }
      return probeWechatResourcesAssets(bundle).then(() => bundle);
    })
    .catch((err) => {
      console.error('[UiAssets] wx.loadSubpackage resources failed', err);
      return null;
    });
}

/** 抽样 bg_lobby：真机仅主包 native（禁止 bundle.load → Error 4930）；devtools 走 bundle.load */
async function probeWechatResourcesAssets(bundle: AssetManager.Bundle): Promise<boolean> {
  const key = 'backgrounds/bg_lobby';
  const sf = usesWechatNativeFs()
    ? await loadWechatNativeSprite(key)
    : await new Promise<SpriteFrame | null>((resolve) => {
        bundle.load(resourcesPath(key), SpriteFrame, (err, asset) => {
          if (!err && asset) {
            resolve(cacheSprite(key, asset));
            return;
          }
          if (err) {
            console.error('[UiAssets] probe resources.load failed', key, err);
          }
          resolve(null);
        });
      });
  if (sf) {
    console.log('[UiAssets] probe ok bg_lobby');
    return true;
  }
  console.warn('[UiAssets] probe warn bg_lobby (non-blocking, sprites retry on demand)');
  return false;
}

/** resources 包路径：assets/resources/art/ui/ */
function resourcesPath(key: string): string {
  return `art/ui/${key}/spriteFrame`;
}

/** main 包路径（构建后 assets 根目录相对路径） */
function mainBundlePath(key: string): string {
  return `art/ui/${key}/spriteFrame`;
}

function cacheSprite(key: string, sf: SpriteFrame | null): SpriteFrame | null {
  if (sf) {
    normalizeUiSpriteFrame(sf);
    cache.set(key, sf);
  }
  return sf;
}

/** 主包 native（patch 复制首屏关键贴图）；分包 native 为兜底 */
const MAIN_NATIVE_ROOT = ['assets', 'resources', 'native'].join('/');
const SUB_NATIVE_ROOT = ['subpackages', 'resources', 'native'].join('/');

function nativeTexturePathsFromUuid(key: string, uuidWithSuffix: string): string[] {
  const uuid = uuidWithSuffix.split('@')[0];
  const ext = /^pve\/backgrounds\/bg_pve_ch[2-5]_runtime$/.test(key) ? '.jpg' : '.png';
  const rel = `${uuid.slice(0, 2)}/${uuid}${ext}`;
  const paths = [`${MAIN_NATIVE_ROOT}/${rel}`, `${SUB_NATIVE_ROOT}/${rel}`];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of paths) {
    if (!seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}

function readWechatNativeToTempOnce(path: string, tempPath: string): Promise<string | null> {
  if (!isWechatRuntime() || !wx.getFileSystemManager) {
    return Promise.resolve(null);
  }

  const fs = wx.getFileSystemManager();
  return new Promise((resolve) => {
    const readThenWrite = () => {
      fs.readFile({
        filePath: path,
        success: (res) => {
          fs.writeFile({
            filePath: tempPath,
            data: res.data,
            success: () => resolve(tempPath),
            fail: (err) => {
              console.warn('[UiAssets] wx.writeFile native temp failed', tempPath, err);
              resolve(null);
            },
          });
        },
        fail: () => {
          resolve(null);
        },
      });
    };

    if (typeof fs.copyFile === 'function') {
      fs.copyFile({
        srcPath: path,
        destPath: tempPath,
        success: () => resolve(tempPath),
        fail: () => readThenWrite(),
      });
      return;
    }
    readThenWrite();
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readWechatNativeToTempAny(
  paths: readonly string[],
  tempPath: string,
  maxAttempts = 20,
  intervalMs = 300,
): Promise<string | null> {
  const candidates = wechatNativeReadCandidates(paths);
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    for (let i = 0; i < candidates.length; i += 1) {
      const filePath = await readWechatNativeToTempOnce(candidates[i], tempPath);
      if (filePath) return filePath;
    }
    if (attempt + 1 < maxAttempts) {
      await delay(intervalMs);
    }
  }
  return null;
}

function imageToSpriteFrame(key: string, imagePath: string): Promise<SpriteFrame | null> {
  return new Promise((resolve) => {
    const image =
      typeof wx !== 'undefined' && typeof wx.createImage === 'function'
        ? wx.createImage()
        : new Image();
    image.onload = () => {
      const imageAsset = new ImageAsset(image);
      const texture = new Texture2D();
      texture.image = imageAsset;
      const sf = new SpriteFrame();
      sf.texture = texture;
      const w = image.width || imageAsset.width || 1;
      const h = image.height || imageAsset.height || 1;
      sf.rect = new Rect(0, 0, w, h);
      sf.originalSize = new Size(w, h);
      resolve(cacheSprite(key, sf));
    };
    image.onerror = (err) => {
      console.warn('[UiAssets] native image decode failed', key, err);
      resolve(null);
    };
    image.src = imagePath;
  });
}

async function imageToSpriteFrameAny(
  key: string,
  imagePaths: readonly string[],
): Promise<SpriteFrame | null> {
  for (const imagePath of imagePaths) {
    const sf = await imageToSpriteFrame(key, imagePath);
    if (sf) return sf;
  }
  return null;
}

/** 微信真机：主包 native（patch 复制）优先；禁止直载分包路径（4930） */
async function loadWechatNativeSprite(key: string): Promise<SpriteFrame | null> {
  const uuid = UI_SPRITE_UUID[key];
  if (!uuid || !isWechatRuntime()) {
    return null;
  }
  const paths = nativeTexturePathsFromUuid(key, uuid);
  const skipMain = usesWechatNativeFs() && usesSubpackageOnlyNative(key);
  const mainPaths = skipMain ? [] : paths.filter((p) => p.startsWith(`${MAIN_NATIVE_ROOT}/`));
  const subPaths = paths.filter((p) => p.startsWith(`${SUB_NATIVE_ROOT}/`));
  const rawUuid = uuid.split('@')[0];
  const tempPath = `${wx.env.USER_DATA_PATH}/couple-ui-${rawUuid}.png`;

  if (!skipMain) {
    if (usesWechatNativeFs()) {
      // 真机 createImage 直读包内路径不稳定，优先 readFile/copyFile 到 USER_DATA_PATH
      const mainFile = await readWechatNativeToTempAny(mainPaths, tempPath, 6, 150);
      if (mainFile) {
        const sf = await imageToSpriteFrame(key, mainFile);
        if (sf) return sf;
      }
    } else {
      const directMain = await imageToSpriteFrameAny(key, mainPaths);
      if (directMain) return directMain;
      const mainFile = await readWechatNativeToTempAny(mainPaths, tempPath, 4, 150);
      if (mainFile) {
        const sf = await imageToSpriteFrame(key, mainFile);
        if (sf) return sf;
      }
    }
  }

  // 真机禁止读分包 native（HTMLImageElement → Error 4930）；分包-only 大图走 bundle.load（devtools）
  if (usesWechatNativeFs()) {
    console.warn('[UiAssets] native sprite main miss on wx device', key, mainPaths[0] ?? paths[0]);
    return null;
  }

  const subFile = await readWechatNativeToTempAny(
    subPaths,
    tempPath,
    SUB_NATIVE_RETRY_ATTEMPTS,
    SUB_NATIVE_RETRY_INTERVAL_MS,
  );
  if (subFile) {
    return imageToSpriteFrame(key, subFile);
  }

  console.warn('[UiAssets] native sprite unavailable on wx', key, mainPaths[0] ?? paths[0]);
  return null;
}

function loadFromResources(key: string): Promise<SpriteFrame | null> {
  const path = resourcesPath(key);

  if (EDITOR) {
    return new Promise((resolve) => {
      editorResources.load(path, SpriteFrame, (err, sf) => {
        if (!err && sf) {
          resolve(cacheSprite(key, sf));
          return;
        }
        if (err) {
          console.warn('[UiAssets] editor resources.load failed', key, path, err);
        }
        resolve(null);
      });
    });
  }

  return ensureResourcesBundle().then((bundle) => {
    if (!bundle) return null;
    return new Promise<SpriteFrame | null>((resolve) => {
      bundle.load(path, SpriteFrame, (err, sf) => {
        if (!err && sf) {
          resolve(cacheSprite(key, sf));
          return;
        }
        if (err) {
          console.error('[UiAssets] resources.load failed', key, path, err);
        }
        resolve(null);
      });
    });
  });
}

function loadFromBundle(
  bundle: AssetManager.Bundle,
  key: string,
): Promise<SpriteFrame | null> {
  const path = mainBundlePath(key);
  return new Promise((resolve) => {
    bundle.load(path, SpriteFrame, (err, sf) => {
      if (!err && sf) {
        resolve(cacheSprite(key, sf));
        return;
      }
      resolve(null);
    });
  });
}

function loadFromMainBundle(key: string): Promise<SpriteFrame | null> {
  const existing = assetManager.bundles.get('main');
  if (existing) return loadFromBundle(existing, key);

  return new Promise((resolve) => {
    assetManager.loadBundle('main', (err, bundle) => {
      if (err || !bundle) {
        resolve(null);
        return;
      }
      void loadFromBundle(bundle, key).then(resolve);
    });
  });
}

function loadByUuid(key: string): Promise<SpriteFrame | null> {
  const uuid = UI_SPRITE_UUID[key];
  if (!uuid) return Promise.resolve(null);

  return new Promise((resolve) => {
    assetManager.loadAny([{ uuid, type: SpriteFrame }], (err, asset) => {
      if (err || !asset) {
        console.warn('[UiAssets] uuid load failed', key, uuid, err);
        resolve(null);
        return;
      }
      const sf = asset as SpriteFrame;
      resolve(cacheSprite(key, sf));
    });
  });
}

export function loadUiSprite(key: string): Promise<SpriteFrame | null> {
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);

  // 微信真机：主包 native 优先；非 critical 禁止 bundle.load 直读分包（4930）
  const chain = EDITOR
    ? [() => loadByUuid(key), () => loadFromResources(key), () => loadFromMainBundle(key)]
    : usesWechatNativeFs()
      ? [() => loadWechatNativeSprite(key), () => loadFromMainBundle(key)]
    : isWechatRuntime()
      ? [() => loadFromResources(key), () => loadFromMainBundle(key)]
      : [() => loadFromResources(key), () => loadFromMainBundle(key), () => loadByUuid(key)];

  return chain
    .reduce<Promise<SpriteFrame | null>>(
      (p, loader) => p.then((sf) => sf ?? loader()),
      Promise.resolve(null),
    )
    .then((sf) => {
      if (!sf) {
        console.warn('[UiAssets] load failed:', key, '(path:', resourcesPath(key), ')');
      }
      return sf;
    });
}

export async function preloadKeys(
  keys: readonly string[],
  opts: { parallel?: boolean } = {},
): Promise<void> {
  const safeKeys = keys.filter(
    (k): k is string => typeof k === 'string' && k.length > 0,
  );
  // parallel=true：忽略分批限制，全部并行（用于大厅首屏关键小图集合 ≤ 10 张）。
  // 默认仍走 PRELOAD_BATCH_SIZE 分批，避免微信 fs 在重资源批次中被压垮。
  const batchSize =
    opts.parallel || !usesWechatNativeFs() ? safeKeys.length : PRELOAD_BATCH_SIZE;
  for (let i = 0; i < safeKeys.length; i += batchSize) {
    const batch = safeKeys.slice(i, i + batchSize);
    await Promise.all(batch.map((k) => loadUiSprite(k)));
  }
}

export function getCachedSprite(key: string): SpriteFrame | null {
  return cache.get(key) ?? null;
}

export function getBoardButtonSprite(key: keyof typeof BOARD_BTN_KEYS): SpriteFrame | null {
  return getCachedSprite(BOARD_BTN_KEYS[key]);
}

/** 大厅首屏所需的最小图集；并行加载（7 张主包 native 小图，不受 PRELOAD_BATCH_SIZE 限制）。 */
export async function preloadLobbyUi(): Promise<void> {
  if (!(await ensureResourcesBundle())) return;
  await preloadKeys([...LOBBY_ESSENTIAL_KEYS], { parallel: true });
}

export async function preloadPveLobbyUi(): Promise<void> {
  if (!(await ensureResourcesBundle())) return;
  await preloadKeys([...PVE_LOBBY_ESSENTIAL_KEYS], { parallel: true });
}

/** 大厅显示后异步预热的次要图集（房间/棋子）。fire-and-forget，错误吞掉不阻塞玩家。 */
export async function preloadLobbyBackgroundAssets(): Promise<void> {
  if (!(await ensureResourcesBundle())) return;
  try {
    await preloadKeys([...LOBBY_BACKGROUND_KEYS]);
  } catch (err) {
    console.warn('[UiAssets] background preload failed', err);
  }
}

export async function preloadBoardUi(): Promise<void> {
  if (!(await ensureResourcesBundle())) return;
  const allKeys = [
    ...BOARD_KEYS,
    ...BOARD_PANEL_KEYS,
    ...Object.values(BOARD_BTN_KEYS),
    ...BOARD_PAWN_KEYS,
  ];
  const keys = usesWechatNativeFs()
    ? allKeys.filter((k) => !usesSubpackageOnlyNative(k))
    : allKeys;
  await preloadKeys(keys);
}

export async function preloadSettlementUi(): Promise<void> {
  if (!(await ensureResourcesBundle())) return;
  await preloadKeys([...SETTLEMENT_KEYS]);
}

export async function preloadPveUi(): Promise<void> {
  if (!(await ensureResourcesBundle())) return;
  // 大章节背景（720×1280）在微信真机走分包延迟加载，不进主包 preload
  const keys = usesWechatNativeFs()
    ? ([...PVE_UI_KEYS] as string[]).filter((k) => !usesSubpackageOnlyNative(k))
    : [...PVE_UI_KEYS];
  await preloadKeys(keys);
}

export type ScreenBgKey = 'lobby' | 'room' | 'board' | 'settlement';

const BG_KEY: Record<ScreenBgKey, string> = {
  lobby: 'backgrounds/bg_lobby',
  room: 'backgrounds/bg_room',
  board: 'backgrounds/bg_board',
  settlement: 'backgrounds/bg_settlement',
};

/** 将 Canvas 下 ScreenBg 换为图片背景 */
export async function applyScreenBackground(
  canvas: Node,
  which: ScreenBgKey,
): Promise<void> {
  const sf = await loadUiSprite(BG_KEY[which]);
  if (!sf) {
    console.warn('[UiAssets] screen bg missing', which);
    return;
  }

  let bg = canvas.getChildByName('ScreenBg');
  if (!bg) {
    bg = new Node('ScreenBg');
    bg.setParent(canvas);
    bg.setPosition(0, 0, 0);
    bg.addComponent(UITransform);
  }
  const { w, h } = visibleDesignSize();
  bg.getComponent(UITransform)?.setContentSize(w, h);
  removePlaceholderGraphics(bg);
  ensureArtCover(bg, 'Art', sf, w, h);
  bg.setSiblingIndex(0);
  applyUiLayerTree(bg, canvas.layer);
  const tex = sf.texture;
  console.log(
    '[UiAssets] screen bg applied',
    which,
    tex ? `${tex.width}x${tex.height}` : 'no-texture',
  );
}
