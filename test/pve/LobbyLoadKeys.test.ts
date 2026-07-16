import {
  PVE_LOBBY_ESSENTIAL_KEYS,
  PVE_CAMP_WARM_KEYS,
} from '../../assets/scripts/ui/UiAssets';

// preloadPveLobbyUi must not await ensureResourcesBundle — first-paint keys are main-pack critical native.
describe('lobby load keys', () => {
  it('blocks only first-paint lobby assets', () => {
    expect(PVE_LOBBY_ESSENTIAL_KEYS).toContain('backgrounds/bg_lobby');
    expect(PVE_LOBBY_ESSENTIAL_KEYS).toContain('pve/lobby/icon_nav_camp');
    expect(PVE_LOBBY_ESSENTIAL_KEYS).not.toContain('pve/backgrounds/bg_pve_loading_expedition');
  });

  it('defines camp warm keys for post-lobby preload', () => {
    expect(PVE_CAMP_WARM_KEYS).toEqual([
      'pve/backgrounds/bg_pve_camp',
      'pve/camp/panel_camp_main_9s',
    ]);
  });
});
