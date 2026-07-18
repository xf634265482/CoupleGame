import { MINGHEN_TRIAL_REQUIREMENTS, incrementTrialEvidence, isMinghenTrialComplete } from '../../assets/scripts/pve/core/minghen/MinghenTrial';
describe('Minghen trials',()=>{
 test('all 38 trials have explicit cloud-compatible counters',()=>{expect(Object.keys(MINGHEN_TRIAL_REQUIREMENTS)).toHaveLength(38);for(const requirement of Object.values(MINGHEN_TRIAL_REQUIREMENTS))expect(Object.keys(requirement).length).toBeGreaterThan(0);});
 test('trial completes only when every counter reaches its threshold',()=>{expect(isMinghenTrialComplete('M01',{bleedApplied:6,bloodwalkKills:1})).toBe(false);expect(isMinghenTrialComplete('M01',{bleedApplied:8,bloodwalkKills:2})).toBe(true);});
 test('evidence accumulation is immutable',()=>{const first={bleedApplied:5};const next=incrementTrialEvidence(first,'bleedApplied');expect(first.bleedApplied).toBe(5);expect(next.bleedApplied).toBe(6);});
});
