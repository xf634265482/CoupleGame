import { makeExpeditionState } from './helpers';
import {
  createPartnerBattleState,
  usePartnerSkill,
  type PartnerCombatResources,
} from '../../assets/scripts/pve/core/partner/PartnerSkillExecutor';
import { listTeleportCells } from '../../assets/scripts/pve/core/partner/PartnerTeleport';

function resourcesFrom(state: ReturnType<typeof makeExpeditionState>, overrides: Partial<PartnerCombatResources> = {}): PartnerCombatResources {
  return {
    hp: state.player.hp,
    maxHp: state.player.maxHp,
    shield: 0,
    spirit: 0,
    ap: state.floorState.ap,
    maxAp: state.floorState.maxAp,
    ...overrides,
  };
}

describe('PartnerSkillExecutor basic', () => {
  it('rejects when skill already used', () => {
    const expedition = makeExpeditionState({ seed: 1 });
    const partnerBattle = { ...createPartnerBattleState('GUARD', 1), skillUsed: true };
    const result = usePartnerSkill({
      expedition,
      partnerBattle,
      phase: 'PLAYER_INPUT',
      resources: resourcesFrom(expedition),
    });
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toBe('PARTNER_SKILL_USED');
  });

  it('MOBILITY stage1 teleports within 2 and sets skillUsed', () => {
    const expedition = makeExpeditionState({ seed: 1 });
    const from = expedition.floorState.player;
    const cells = listTeleportCells(expedition.floorState, from, 2);
    expect(cells.length).toBeGreaterThan(0);
    const to = cells[0]!;
    const result = usePartnerSkill({
      expedition,
      partnerBattle: createPartnerBattleState('MOBILITY', 1),
      phase: 'PLAYER_INPUT',
      resources: resourcesFrom(expedition),
      targetCell: to,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.partnerBattle.skillUsed).toBe(true);
      expect(result.expedition.floorState.player).toEqual(to);
      expect(result.events.some((e) => e.type === 'PLAYER_TELEPORT')).toBe(true);
    }
  });

  it('GUARD stage1 grants 15% maxHp shield', () => {
    const expedition = makeExpeditionState({ seed: 1, playerOverrides: { maxHp: 100, hp: 100 } });
    const result = usePartnerSkill({
      expedition,
      partnerBattle: createPartnerBattleState('GUARD', 1),
      phase: 'PLAYER_INPUT',
      resources: resourcesFrom(expedition),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.resources.shield).toBe(15);
      expect(result.partnerBattle.skillUsed).toBe(true);
    }
  });

  it('HEAL stage1 heals 15% and clamps to maxHp', () => {
    const expedition = makeExpeditionState({ seed: 1, playerOverrides: { maxHp: 100, hp: 50 } });
    const result = usePartnerSkill({
      expedition,
      partnerBattle: createPartnerBattleState('HEAL', 1),
      phase: 'PLAYER_INPUT',
      resources: resourcesFrom(expedition, { hp: 50, maxHp: 100 }),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.resources.hp).toBe(65);
      expect(result.expedition.player.hp).toBe(65);
    }
  });

  it('HEAL stage4 converts 50% overheal to shield capped 10%', () => {
    const expedition = makeExpeditionState({ seed: 1, playerOverrides: { maxHp: 100, hp: 95 } });
    const result = usePartnerSkill({
      expedition,
      partnerBattle: createPartnerBattleState('HEAL', 4),
      phase: 'PLAYER_INPUT',
      resources: resourcesFrom(expedition, { hp: 95, maxHp: 100 }),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.resources.hp).toBe(100);
      // requested 20, missing 5 → overheal 15 → 50% = 7 or 8, cap 10
      expect(result.resources.shield).toBeGreaterThan(0);
      expect(result.resources.shield).toBeLessThanOrEqual(10);
    }
  });

  it('asks for cell target when MOBILITY missing targetCell', () => {
    const expedition = makeExpeditionState({ seed: 1 });
    const result = usePartnerSkill({
      expedition,
      partnerBattle: createPartnerBattleState('MOBILITY', 1),
      phase: 'PLAYER_INPUT',
      resources: resourcesFrom(expedition),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.needCellTarget).toBe(true);
      expect(result.partnerBattle.skillUsed).toBe(false);
    }
  });
});
