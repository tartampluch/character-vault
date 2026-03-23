/**
 * @file src/tests/onCritBurstDice.test.ts
 * @description Vitest unit tests for Enhancement E-7 — On-Crit Burst Dice.
 *
 * WHAT IS TESTED:
 *   The Burst weapon special abilities (Flaming Burst, Icy Burst, Shocking Burst,
 *   Thundering) deal extra elemental / sonic dice ONLY on a confirmed critical hit.
 *   These extra dice:
 *     - Scale with the weapon's critical multiplier (×2 → 1d10, ×3 → 2d10, ×4 → 3d10)
 *     - Are NOT multiplied by the critMultiplier themselves (they are flat additions)
 *     - Are NOT rolled if Fortification negated the crit
 *     - Are included in RollResult.finalTotal
 *
 * TESTS (22):
 *
 * ─── HAPPY PATH ─────────────────────────────────────────────────────────────
 *   1.  Non-crit roll → no onCritDiceRolled on RollResult
 *   2.  Confirmed crit, no onCritDice spec → no onCritDiceRolled
 *   3.  Flaming Burst (1d10 fire), ×2 crit → rolls 1d10, formula "1d10"
 *   4.  Flaming Burst, ×3 crit (battleaxe) → rolls 2d10, formula "2d10"
 *   5.  Flaming Burst, ×4 crit (scythe) → rolls 3d10, formula "3d10"
 *   6.  Thundering (1d8 sonic), ×2 crit → rolls 1d8
 *   7.  Thundering (1d8 sonic), ×3 crit → rolls 2d8
 *   8.  onCritDiceRolled.totalAdded is included in RollResult.finalTotal
 *   9.  onCritDiceRolled.damageType matches the spec
 *  10.  onCritDiceRolled.rolls records individual die results
 *  11.  scalesWithCritMultiplier=false → always rolls baseDiceFormula regardless of critMultiplier
 *  12.  scalesWithCritMultiplier=false, ×3 crit → still only 1d10 (no scaling)
 *
 * ─── FORTIFICATION INTERACTION ──────────────────────────────────────────────
 *  13.  Fortification negates crit (critNegated=true) → no onCritDiceRolled
 *  14.  Fortification does NOT negate crit → onCritDiceRolled present
 *
 * ─── V/WP INTERACTION ───────────────────────────────────────────────────────
 *  15.  V/WP mode, effective crit with burst dice → targetPool = res_wound_points
 *  16.  V/WP mode, fort-negated crit → targetPool = res_vitality (no burst dice)
 *
 * ─── PARSING EDGE CASES ─────────────────────────────────────────────────────
 *  17.  baseDiceFormula "d10" (no count prefix) → treated as 1d10
 *  18.  baseDiceFormula "2d6" with scalesWithCritMultiplier=true, ×3 → 4d6
 *  19.  Malformed baseDiceFormula → no crash, no onCritDiceRolled
 *  20.  critMultiplier=2, scalesWithCritMultiplier=true → diceCount = (2-1) = 1
 *
 * ─── COMBINED WITH ATTACKER MODS (non-interference) ────────────────────────
 *  21.  onCritDiceRolled is present alongside attackerPenaltiesApplied (both present)
 *  22.  onCritDiceRolled is present alongside fortification (both fields present)
 *
 * @see src/lib/utils/diceEngine.ts  — parseAndRoll() 9th+10th parameters
 * @see src/lib/types/feature.ts     — ItemFeature.weaponData.onCritDice
 * @see ARCHITECTURE.md section 4.9 — On-Crit Burst Dice mechanic
 */

import { describe, it, expect } from 'vitest';
import { parseAndRoll } from '../lib/utils/diceEngine';
import type { OnCritDiceSpec } from '../lib/utils/diceEngine';
import type { StatisticPipeline } from '../lib/types/pipeline';
import type { CampaignSettings } from '../lib/types/settings';
import { createDefaultCampaignSettings } from '../lib/types/settings';

// =============================================================================
// FIXTURES
// =============================================================================

const DEFAULT_SETTINGS: CampaignSettings = createDefaultCampaignSettings();
const VWP_SETTINGS: CampaignSettings = {
  ...DEFAULT_SETTINGS,
  variantRules: { vitalityWoundPoints: true, gestalt: false },
};

/** Basic pipeline (no bonuses) for damage rolls. */
const DAMAGE_PIPELINE: StatisticPipeline = {
  id: 'damage',
  label: { en: 'Damage', fr: 'Dégâts' },
  baseValue: 0,
  activeModifiers: [],
  situationalModifiers: [],
  totalBonus: 0,
  totalValue: 0,
  derivedModifier: 0,
};

/** Flaming Burst spec: 1d10 fire, scales with crit multiplier. */
const FLAMING_BURST: OnCritDiceSpec = {
  baseDiceFormula: '1d10',
  damageType: 'fire',
  scalesWithCritMultiplier: true,
};

/** Thundering spec: 1d8 sonic, scales with crit multiplier. */
const THUNDERING: OnCritDiceSpec = {
  baseDiceFormula: '1d8',
  damageType: 'sonic',
  scalesWithCritMultiplier: true,
};

/** Fixed burst (non-scaling): always 1d10 regardless of critMultiplier. */
const FIXED_BURST: OnCritDiceSpec = {
  baseDiceFormula: '1d10',
  damageType: 'fire',
  scalesWithCritMultiplier: false,
};

/**
 * Deterministic RNG sequence.
 * Returns values in order, cycling if needed.
 * First value(s) = weapon damage roll, then burst dice.
 */
function seqRng(seq: number[]): (faces: number) => number {
  let i = 0;
  return (_faces: number) => seq[i++ % seq.length];
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Roll a d20 for the attack roll (checking crit), then a separate damage roll.
 * This mirrors the two-roll pattern used in D&D 3.5:
 *   1. Attack roll: if nat 20 → isCriticalThreat, caller confirms → isCriticalHit=true
 *   2. Damage roll with isCriticalHit=true → burst dice fire
 */
function rollDamageWithCrit(
  damageSeq: number[],
  onCritDice: OnCritDiceSpec | undefined,
  critMultiplier: number,
  fortPct: number = 0
) {
  return parseAndRoll(
    '1d8',
    DAMAGE_PIPELINE,
    { targetTags: [], isAttackOfOpportunity: false, isCriticalHit: true },
    DEFAULT_SETTINGS,
    seqRng(damageSeq),
    '20',
    undefined,
    fortPct,
    onCritDice,
    critMultiplier
  );
}

// =============================================================================
// TESTS
// =============================================================================

describe('On-Crit Burst Dice — Happy Path', () => {

  it('1. Non-crit roll → no onCritDiceRolled on RollResult', () => {
    // Roll a 10 on d20 — not a crit
    const result = parseAndRoll(
      '1d20',
      DAMAGE_PIPELINE,
      { targetTags: [], isAttackOfOpportunity: false },
      DEFAULT_SETTINGS,
      seqRng([10]),
      '20',
      undefined,
      0,
      FLAMING_BURST,
      2
    );
    expect(result.isCriticalThreat).toBe(false);
    expect(result.onCritDiceRolled).toBeUndefined();
  });

  it('2. Confirmed crit, no onCritDice spec → no onCritDiceRolled', () => {
    const result = rollDamageWithCrit([5], undefined, 2);
    expect(result.onCritDiceRolled).toBeUndefined();
  });

  it('3. Flaming Burst (1d10 fire), ×2 crit → rolls 1d10, formula "1d10"', () => {
    // d8=5 (weapon damage), d10=7 (burst fire)
    const result = rollDamageWithCrit([5, 7], FLAMING_BURST, 2);
    expect(result.onCritDiceRolled).toBeDefined();
    expect(result.onCritDiceRolled!.formula).toBe('1d10');
    expect(result.onCritDiceRolled!.rolls).toEqual([7]);
    expect(result.onCritDiceRolled!.totalAdded).toBe(7);
    expect(result.onCritDiceRolled!.damageType).toBe('fire');
  });

  it('4. Flaming Burst, ×3 crit (battleaxe) → rolls 2d10, formula "2d10"', () => {
    // d8=5, then two d10 rolls: 7, 9
    const result = rollDamageWithCrit([5, 7, 9], FLAMING_BURST, 3);
    expect(result.onCritDiceRolled!.formula).toBe('2d10');
    expect(result.onCritDiceRolled!.rolls).toEqual([7, 9]);
    expect(result.onCritDiceRolled!.totalAdded).toBe(16);
  });

  it('5. Flaming Burst, ×4 crit (scythe) → rolls 3d10, formula "3d10"', () => {
    // d8=4, then three d10 rolls: 3, 8, 6
    const result = rollDamageWithCrit([4, 3, 8, 6], FLAMING_BURST, 4);
    expect(result.onCritDiceRolled!.formula).toBe('3d10');
    expect(result.onCritDiceRolled!.rolls).toEqual([3, 8, 6]);
    expect(result.onCritDiceRolled!.totalAdded).toBe(17);
  });

  it('6. Thundering (1d8 sonic), ×2 crit → rolls 1d8', () => {
    const result = rollDamageWithCrit([5, 6], THUNDERING, 2);
    expect(result.onCritDiceRolled!.formula).toBe('1d8');
    expect(result.onCritDiceRolled!.damageType).toBe('sonic');
    expect(result.onCritDiceRolled!.rolls).toEqual([6]);
  });

  it('7. Thundering (1d8 sonic), ×3 crit → rolls 2d8', () => {
    const result = rollDamageWithCrit([5, 4, 7], THUNDERING, 3);
    expect(result.onCritDiceRolled!.formula).toBe('2d8');
    expect(result.onCritDiceRolled!.rolls).toEqual([4, 7]);
    expect(result.onCritDiceRolled!.totalAdded).toBe(11);
  });

  it('8. onCritDiceRolled.totalAdded is included in RollResult.finalTotal', () => {
    // d8=5 (weapon), burst d10=7
    // finalTotal = naturalTotal(5) + staticBonus(0) + situational(0) + burst(7) = 12
    const result = rollDamageWithCrit([5, 7], FLAMING_BURST, 2);
    expect(result.naturalTotal).toBe(5);         // weapon damage only
    expect(result.onCritDiceRolled!.totalAdded).toBe(7); // burst fire
    expect(result.finalTotal).toBe(12);          // 5 + 7 = 12
  });

  it('9. onCritDiceRolled.damageType matches the spec', () => {
    const icy: OnCritDiceSpec = { baseDiceFormula: '1d10', damageType: 'cold', scalesWithCritMultiplier: true };
    const result = rollDamageWithCrit([5, 8], icy, 2);
    expect(result.onCritDiceRolled!.damageType).toBe('cold');
  });

  it('10. onCritDiceRolled.rolls records individual die results', () => {
    const result = rollDamageWithCrit([3, 9, 2], FLAMING_BURST, 3);
    // ×3 crit → 2d10, rolls should be [9, 2]
    expect(result.onCritDiceRolled!.rolls).toHaveLength(2);
    expect(result.onCritDiceRolled!.rolls[0]).toBe(9);
    expect(result.onCritDiceRolled!.rolls[1]).toBe(2);
  });

  it('11. scalesWithCritMultiplier=false, ×2 crit → always rolls baseDiceFormula (1d10)', () => {
    const result = rollDamageWithCrit([5, 7], FIXED_BURST, 2);
    expect(result.onCritDiceRolled!.formula).toBe('1d10');
    expect(result.onCritDiceRolled!.rolls).toEqual([7]);
  });

  it('12. scalesWithCritMultiplier=false, ×3 crit → still only 1d10 (no scaling)', () => {
    // Even with ×3 crit multiplier, fixed burst never scales
    const result = rollDamageWithCrit([5, 7], FIXED_BURST, 3);
    expect(result.onCritDiceRolled!.formula).toBe('1d10');
    expect(result.onCritDiceRolled!.rolls).toHaveLength(1);
    expect(result.onCritDiceRolled!.rolls[0]).toBe(7);
  });
});

describe('On-Crit Burst Dice — Fortification Interaction', () => {

  it('13. Fortification negates crit (roll<=pct) → no onCritDiceRolled', () => {
    // d8=5 (damage), d100=20 (fort roll, 20 <= 25% → NEGATED)
    const result = parseAndRoll(
      '1d8',
      DAMAGE_PIPELINE,
      { targetTags: [], isAttackOfOpportunity: false, isCriticalHit: true },
      DEFAULT_SETTINGS,
      seqRng([5, 20]),   // weapon die then fort roll
      '20',
      undefined,
      25,                // 25% fortification
      FLAMING_BURST,
      2
    );
    expect(result.fortification!.critNegated).toBe(true);
    expect(result.onCritDiceRolled).toBeUndefined(); // No burst on negated crit
  });

  it('14. Fortification does NOT negate crit (roll>pct) → onCritDiceRolled present', () => {
    // d8=5, d100=50 (50 > 25% → NOT negated), d10=7 (burst)
    const result = parseAndRoll(
      '1d8',
      DAMAGE_PIPELINE,
      { targetTags: [], isAttackOfOpportunity: false, isCriticalHit: true },
      DEFAULT_SETTINGS,
      seqRng([5, 50, 7]),
      '20',
      undefined,
      25,
      FLAMING_BURST,
      2
    );
    expect(result.fortification!.critNegated).toBe(false);
    expect(result.onCritDiceRolled).toBeDefined();
    expect(result.onCritDiceRolled!.totalAdded).toBe(7);
  });
});

describe('On-Crit Burst Dice — V/WP Interaction', () => {

  it('15. V/WP mode, effective crit with burst → targetPool = res_wound_points', () => {
    const result = parseAndRoll(
      '1d8',
      DAMAGE_PIPELINE,
      { targetTags: [], isAttackOfOpportunity: false, isCriticalHit: true },
      VWP_SETTINGS,
      seqRng([5, 7]),
      '20',
      undefined,
      0,
      FLAMING_BURST,
      2
    );
    expect(result.targetPool).toBe('res_wound_points');
    expect(result.onCritDiceRolled).toBeDefined();
  });

  it('16. V/WP mode, fort-negated crit → targetPool = res_vitality, no burst dice', () => {
    // d8=5, d100=10 (10 <= 25 → negated)
    const result = parseAndRoll(
      '1d8',
      DAMAGE_PIPELINE,
      { targetTags: [], isAttackOfOpportunity: false, isCriticalHit: true },
      VWP_SETTINGS,
      seqRng([5, 10]),
      '20',
      undefined,
      25,
      FLAMING_BURST,
      2
    );
    expect(result.fortification!.critNegated).toBe(true);
    expect(result.targetPool).toBe('res_vitality'); // Negated → normal hit
    expect(result.onCritDiceRolled).toBeUndefined();
  });
});

describe('On-Crit Burst Dice — Parsing Edge Cases', () => {

  it('17. baseDiceFormula "d10" (no count prefix) → treated as 1d10', () => {
    const spec: OnCritDiceSpec = {
      baseDiceFormula: 'd10',  // no leading "1"
      damageType: 'fire',
      scalesWithCritMultiplier: true,
    };
    const result = rollDamageWithCrit([5, 8], spec, 2);
    expect(result.onCritDiceRolled!.formula).toBe('1d10');
    expect(result.onCritDiceRolled!.rolls).toEqual([8]);
  });

  it('18. baseDiceFormula "2d6" with scalesWithCritMultiplier=true, ×3 crit → 4d6', () => {
    // baseDiceCount=2, ×3 → 2 × (3-1) = 4d6
    const spec: OnCritDiceSpec = {
      baseDiceFormula: '2d6',
      damageType: 'fire',
      scalesWithCritMultiplier: true,
    };
    // d8=5, then four d6 rolls: 3, 5, 2, 4
    const result = rollDamageWithCrit([5, 3, 5, 2, 4], spec, 3);
    expect(result.onCritDiceRolled!.formula).toBe('4d6');
    expect(result.onCritDiceRolled!.rolls).toHaveLength(4);
    expect(result.onCritDiceRolled!.totalAdded).toBe(14); // 3+5+2+4
  });

  it('19. Malformed baseDiceFormula → no crash, no onCritDiceRolled', () => {
    const badSpec: OnCritDiceSpec = {
      baseDiceFormula: 'invalid_formula',
      damageType: 'fire',
      scalesWithCritMultiplier: true,
    };
    // Should not throw — graceful degradation
    expect(() => rollDamageWithCrit([5], badSpec, 2)).not.toThrow();
    const result = rollDamageWithCrit([5], badSpec, 2);
    expect(result.onCritDiceRolled).toBeUndefined(); // Parse failed silently
  });

  it('20. critMultiplier=2, scalesWithCritMultiplier=true → diceCount = (2-1) = 1', () => {
    const result = rollDamageWithCrit([5, 7], FLAMING_BURST, 2);
    // (2 - 1) = 1 die
    expect(result.onCritDiceRolled!.rolls).toHaveLength(1);
    expect(result.onCritDiceRolled!.formula).toBe('1d10');
  });
});

describe('On-Crit Burst Dice — Combined Fields', () => {

  it('21. onCritDiceRolled and attackerPenaltiesApplied can both be present', () => {
    // Attacker modifier: -1 on damage when defender has "air_elemental" tag
    const defenderMods = [{
      id: 'mod_test_attacker',
      sourceId: 'feature_air',
      sourceName: { en: 'Air Aura', fr: 'Aura air' },
      targetId: 'attacker.damage',
      value: -1,
      type: 'untyped' as const,
    }];

    const result = parseAndRoll(
      '1d8',
      DAMAGE_PIPELINE,
      { targetTags: ['air_elemental'], isAttackOfOpportunity: false, isCriticalHit: true },
      DEFAULT_SETTINGS,
      seqRng([5, 7]),
      '20',
      defenderMods,
      0,
      FLAMING_BURST,
      2
    );
    // Burst dice should still be present
    expect(result.onCritDiceRolled).toBeDefined();
    expect(result.onCritDiceRolled!.totalAdded).toBe(7);
    // finalTotal = d8(5) + burst(7) + attacker_penalty(0, different pipeline) = 12
    // Note: attacker mod targets "attacker.damage", the pipeline is "damage"
    // resolveAttackerMods strips "attacker." prefix → matches "damage" pipeline → applies -1
    expect(result.finalTotal).toBe(11); // 5 + 7 - 1 = 11
  });

  it('22. onCritDiceRolled and fortification result can both be present (not negated)', () => {
    // d8=5, d100=50 (50 > 25% → NOT negated), d10=7 (burst)
    const result = parseAndRoll(
      '1d8',
      DAMAGE_PIPELINE,
      { targetTags: [], isAttackOfOpportunity: false, isCriticalHit: true },
      DEFAULT_SETTINGS,
      seqRng([5, 50, 7]),
      '20',
      undefined,
      25,
      FLAMING_BURST,
      2
    );
    // Both should be present when crit stands despite fortification check
    expect(result.fortification).toBeDefined();
    expect(result.fortification!.critNegated).toBe(false);
    expect(result.onCritDiceRolled).toBeDefined();
    expect(result.onCritDiceRolled!.totalAdded).toBe(7);
  });
});
