import { REWARD_DESCRIPTIONS } from '../../assets/scripts/platform/wechat/AdManager';

test('only stamina restoration remains registered', () => {
  expect(Object.keys(REWARD_DESCRIPTIONS)).toEqual(['restore_stamina']);
  expect(REWARD_DESCRIPTIONS.restore_stamina).toContain('体力');
});
