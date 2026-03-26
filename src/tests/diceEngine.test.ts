/**
 * @file src/tests/diceEngine.test.ts
 * @description Vitest unit tests for the Dice Engine (parseAndRoll, rollAllAbilityScores).
 *
 * CRITICAL: All tests use an INJECTABLE RNG parameter to force specific dice results.
 * This ensures tests are 100% deterministic — no random results.
 *
 * TESTS:
 *   - Context test: situational modifier applies when targetTag matches.
 *   - Context test: situational modifier ignored when no tag match.
 *   - Exploding 20s: forced [20, 20, 5] → naturalTotal = 45, numberOfExplosions = 2.
 *   - isAutomaticHit: natural 20 on d20.
 *   - isAutomaticMiss: natural 1 on d20.
 *   - isCriticalThreat: roll within critRange (e.g., 19-20).
 *   - 4d6 drop lowest: rollAllAbilityScores basic roll.
 *   - rerollOnes: 1s are rerolled when setting is enabled.
 *
 * RollResult.targetPool — Vitality/Wound Points variant (Phase 2.5b):
 *   - Standard mode: all rolls return targetPool = "res_hp".
 *   - V/WP mode, normal hit: targetPool = "res_vitality".
 *   - V/WP mode, crit threat on attack roll: targetPool = "res_wound_points".
 *   - V/WP mode, context.isCriticalHit = true (separate damage roll): targetPool = "res_wound_points".
 *   - V/WP mode, non-d20 damage roll with no crit flag: targetPool = "res_vitality".
 *
 * @see src/lib/utils/diceEngine.ts
 * @see ARCHITECTURE.md section 8.3 — Vitality/Wound Points variant
 * @see ARCHITECTURE.md section 17
 * @see ARCHITECTURE.md Phase 17.4
 */

import { describe, it, expect, vi } from 'vitest';
import { parseAndRoll, rollAllAbilityScores } from '$lib/utils/diceEngine';
import type { DamageTargetPool, RollContext } from '$lib/utils/diceEngine';
import type { CampaignSettings } from '$lib/types/settings';
import { createDefaultCampaignSettings } from '$lib/types/settings';
import type { StatisticPipeline } from '$lib/types/pipeline';

// ============================================================
// HELPERS
// ============================================================

/**
 * Creates a minimal StatisticPipeline for testing.
 * The totalBonus is the static bonus added to every dice roll.
 */
function makePipeline(totalBonus = 0, situationalModifiers: StatisticPipeline['situationalModifiers'] = []): StatisticPipeline {
  return {
    id: 'test_pipeline',
    label: { en: 'Test' },
    baseValue: 0,
    activeModifiers: [],
    situationalModifiers,
    totalBonus,
    totalValue: totalBonus,
    derivedModifier: 0,
  };
}

/**
 * Creates a mock Modifier with a situationalContext.
 */
function makeSituationalMod(value: number, context: string) {
  return {
    id: `sit_${context}`,
    sourceId: 'test',
    sourceName: { en: 'Test' },
    targetId: 'test_pipeline',
    value,
    type: 'untyped' as const,
    situationalContext: context,
  };
}

/** Default campaign settings (no house rules). */
const defaultSettings: CampaignSettings = createDefaultCampaignSettings();

/** Campaign settings with Exploding 20s enabled. */
const explodingSettings: CampaignSettings = {
  ...defaultSettings,
  diceRules: { explodingTwenties: true },
};

/**
 * Creates a sequential RNG that returns values from the provided array in order.
 * Each call to `rng(faces)` returns the next value from the sequence (mod faces).
 * This makes tests completely deterministic.
 */
function makeSequentialRng(...values: number[]): (faces: number) => number {
  let index = 0;
  return (_faces: number) => {
    const value = values[index % values.length];
    index++;
    return value;
  };
}

// ============================================================
// BASIC ROLL TESTS
// ============================================================

describe('parseAndRoll — basic 1d20 roll', () => {
  it('returns the forced die value as naturalTotal', () => {
    const rng = makeSequentialRng(15);  // Force roll of 15
    const result = parseAndRoll('1d20', makePipeline(5), { targetTags: [], isAttackOfOpportunity: false }, defaultSettings, rng);

    expect(result.naturalTotal).toBe(15);
    expect(result.staticBonus).toBe(5);
    expect(result.finalTotal).toBe(20);  // 15 + 5
    expect(result.diceRolls).toEqual([15]);
    expect(result.numberOfExplosions).toBe(0);
  });

  it('applies static bonus from pipeline.totalBonus', () => {
    const rng = makeSequentialRng(10);
    const result = parseAndRoll('1d20', makePipeline(7), { targetTags: [], isAttackOfOpportunity: false }, defaultSettings, rng);

    expect(result.finalTotal).toBe(17);  // 10 + 7
    expect(result.staticBonus).toBe(7);
  });

  it('rolls multiple dice and sums them', () => {
    const rng = makeSequentialRng(3, 5, 2);  // 3d6 → 3+5+2 = 10
    const result = parseAndRoll('3d6', makePipeline(0), { targetTags: [], isAttackOfOpportunity: false }, defaultSettings, rng);

    expect(result.naturalTotal).toBe(10);
    expect(result.diceRolls).toEqual([3, 5, 2]);
  });
});

// ============================================================
// CONTEXT TEST — SITUATIONAL MODIFIERS
// ============================================================

describe('parseAndRoll — situational modifier context test', () => {
  it('applies situational bonus when targetTag matches ("orc" matches "orc")', () => {
    // ARCHITECTURE.md section 17: modifier.situationalContext is IN targetTags → apply.
    // Convention: situationalContext value MUST match a tag string exactly.
    // Ranger's Favored Enemy: "orc" → +2 bonus when target has "orc" tag.
    const pipeline = makePipeline(3, [
      makeSituationalMod(2, 'orc'),     // Applies when target has "orc" tag
      makeSituationalMod(2, 'goblin'),  // Does NOT apply (no "goblin" in targetTags)
    ]);

    const rng = makeSequentialRng(15);
    const result = parseAndRoll(
      '1d20',
      pipeline,
      { targetTags: ['orc', 'humanoid', 'evil'], isAttackOfOpportunity: false },
      defaultSettings,
      rng
    );

    expect(result.situationalBonusApplied).toBe(2);
    expect(result.finalTotal).toBe(20);  // 15 + 3 (static) + 2 (situational)
  });

  it('does NOT apply situational bonus when no tag matches', () => {
    const pipeline = makePipeline(3, [
      makeSituationalMod(2, 'orc'),  // Only applies vs "orc"
    ]);

    const rng = makeSequentialRng(15);
    const result = parseAndRoll(
      '1d20',
      pipeline,
      { targetTags: ['goblin', 'humanoid'], isAttackOfOpportunity: false },  // No "orc" tag
      defaultSettings,
      rng
    );

    expect(result.situationalBonusApplied).toBe(0);
    expect(result.finalTotal).toBe(18);  // 15 + 3 (static only)
  });

  it('applies MULTIPLE matching situational bonuses', () => {
    const pipeline = makePipeline(0, [
      makeSituationalMod(2, 'orc'),   // orc is present
      makeSituationalMod(1, 'evil'),  // orc is also evil
    ]);

    const rng = makeSequentialRng(10);
    const result = parseAndRoll(
      '1d20',
      pipeline,
      { targetTags: ['orc', 'evil'], isAttackOfOpportunity: false },
      defaultSettings,
      rng
    );

    expect(result.situationalBonusApplied).toBe(3);  // 2 + 1 = 3
    expect(result.finalTotal).toBe(13);  // 10 + 3
  });
});

// ============================================================
// EXPLODING 20S (ARCHITECTURE.md Phase 17.4)
// ============================================================

describe('parseAndRoll — Exploding 20s (CampaignSettings.diceRules.explodingTwenties)', () => {
  it('forced [20, 20, 5]: naturalTotal = 45, numberOfExplosions = 2', () => {
    const rng = makeSequentialRng(20, 20, 5);  // Three rolls: 20, 20, 5
    const result = parseAndRoll(
      '1d20',
      makePipeline(0),
      { targetTags: [], isAttackOfOpportunity: false },
      explodingSettings,
      rng
    );

    expect(result.naturalTotal).toBe(45);        // 20 + 20 + 5
    expect(result.numberOfExplosions).toBe(2);   // Two explosions (20 and 20)
    expect(result.finalTotal).toBe(45);          // No static bonus
  });

  it('single 20 with exploding: [20, 8] → naturalTotal = 28, explosions = 1', () => {
    const rng = makeSequentialRng(20, 8);
    const result = parseAndRoll(
      '1d20',
      makePipeline(5),
      { targetTags: [], isAttackOfOpportunity: false },
      explodingSettings,
      rng
    );

    expect(result.naturalTotal).toBe(28);        // 20 + 8
    expect(result.numberOfExplosions).toBe(1);
    expect(result.finalTotal).toBe(33);          // 28 + 5 static bonus
  });

  it('without exploding 20s enabled, a 20 is just a 20', () => {
    const rng = makeSequentialRng(20);
    const result = parseAndRoll(
      '1d20',
      makePipeline(0),
      { targetTags: [], isAttackOfOpportunity: false },
      defaultSettings,  // No exploding
      rng
    );

    expect(result.naturalTotal).toBe(20);
    expect(result.numberOfExplosions).toBe(0);
  });
});

// ============================================================
// CRITICAL HIT / FUMBLE FLAGS
// ============================================================

describe('parseAndRoll — isAutomaticHit and isAutomaticMiss', () => {
  it('natural 20 is isAutomaticHit (first d20 roll only)', () => {
    const rng = makeSequentialRng(20);
    const result = parseAndRoll('1d20', makePipeline(0), { targetTags: [], isAttackOfOpportunity: false }, defaultSettings, rng);

    expect(result.isAutomaticHit).toBe(true);
  });

  it('natural 1 is isAutomaticMiss', () => {
    const rng = makeSequentialRng(1);
    const result = parseAndRoll('1d20', makePipeline(0), { targetTags: [], isAttackOfOpportunity: false }, defaultSettings, rng);

    expect(result.isAutomaticMiss).toBe(true);
    expect(result.isAutomaticHit).toBe(false);
  });

  it('any other roll is neither auto-hit nor auto-miss', () => {
    const rng = makeSequentialRng(15);
    const result = parseAndRoll('1d20', makePipeline(0), { targetTags: [], isAttackOfOpportunity: false }, defaultSettings, rng);

    expect(result.isAutomaticHit).toBe(false);
    expect(result.isAutomaticMiss).toBe(false);
  });
});

describe('parseAndRoll — isCriticalThreat (weapon crit range)', () => {
  it('roll of 20 on a standard weapon is a critical threat (natural 20 always crits)', () => {
    // isCriticalThreat is set when the first d20 roll falls within the weapon's crit range.
    // The current implementation uses `firstD20Roll === 20` as the sole crit trigger.
    // This is the default D&D 3.5 crit range (20/×2).
    const rng = makeSequentialRng(20);
    const result = parseAndRoll('1d20', makePipeline(0), { targetTags: [], isAttackOfOpportunity: false }, defaultSettings, rng);

    expect(result.isCriticalThreat).toBe(true);
  });

  it('roll of 10 is not a critical threat', () => {
    const rng = makeSequentialRng(10);
    const result = parseAndRoll('1d20', makePipeline(0), { targetTags: [], isAttackOfOpportunity: false }, defaultSettings, rng);

    expect(result.isCriticalThreat).toBe(false);
  });

  /**
   * ARCHITECTURE.md section 17 — isCriticalThreat with custom crit range (19-20):
   *
   * The Dice Engine accepts an optional `critRange` parameter (6th argument)
   * that specifies the weapon's critical threat range (e.g., "19-20", "18-20").
   * When provided, rolls at or above the minimum of the range trigger `isCriticalThreat`.
   * Without `critRange`, the default is "20" (natural 20 only).
   *
   * @see ARCHITECTURE.md section 17 isCriticalThreat
   * @see src/lib/types/feature.ts ItemFeature.weaponData.critRange
   */
  it('roll of 19 with default critRange "20" does NOT set isCriticalThreat', () => {
    const rng = makeSequentialRng(19);
    const result = parseAndRoll('1d20', makePipeline(0), { targetTags: [], isAttackOfOpportunity: false }, defaultSettings, rng);

    // Default critRange is "20" — only natural 20 is a threat
    expect(result.isCriticalThreat).toBe(false);
    expect(result.diceRolls[0]).toBe(19);
  });

  it('roll of 19 with critRange "19-20" DOES set isCriticalThreat (Longsword/Rapier)', () => {
    // A Rapier or Longsword has a 19-20 crit range. Rolling a 19 IS a threat.
    const rng = makeSequentialRng(19);
    const result = parseAndRoll('1d20', makePipeline(0), { targetTags: [], isAttackOfOpportunity: false }, defaultSettings, rng, '19-20');

    expect(result.isCriticalThreat).toBe(true);
    // But it's NOT an automatic hit — only natural 20 is an auto hit.
    expect(result.isAutomaticHit).toBe(false);
  });

  it('roll of 18 with critRange "18-20" DOES set isCriticalThreat (Scimitar/Keen)', () => {
    // A Keen Scimitar has 18-20 crit range.
    const rng = makeSequentialRng(18);
    const result = parseAndRoll('1d20', makePipeline(0), { targetTags: [], isAttackOfOpportunity: false }, defaultSettings, rng, '18-20');

    expect(result.isCriticalThreat).toBe(true);
    expect(result.isAutomaticHit).toBe(false);
  });

  it('roll of 17 with critRange "18-20" does NOT set isCriticalThreat', () => {
    const rng = makeSequentialRng(17);
    const result = parseAndRoll('1d20', makePipeline(0), { targetTags: [], isAttackOfOpportunity: false }, defaultSettings, rng, '18-20');

    expect(result.isCriticalThreat).toBe(false);
  });

  it('roll of 20 with critRange "19-20" sets BOTH isCriticalThreat AND isAutomaticHit', () => {
    const rng = makeSequentialRng(20);
    const result = parseAndRoll('1d20', makePipeline(0), { targetTags: [], isAttackOfOpportunity: false }, defaultSettings, rng, '19-20');

    expect(result.isCriticalThreat).toBe(true);
    expect(result.isAutomaticHit).toBe(true);
  });
});

// ============================================================
// rollAllAbilityScores (4d6 drop lowest)
// ============================================================

describe('rollAllAbilityScores — 4d6 drop lowest', () => {
  it('returns 6 ability scores with deterministic rng', () => {
    // 6 scores × 4 dice each = 24 rolls needed.
    // Each set of 4: drops the lowest, sums the top 3.
    // Set 1: [4, 3, 5, 2] → drop 2 → 4+3+5 = 12
    // Set 2: [6, 6, 6, 6] → drop 6 → 6+6+6 = 18
    // Set 3: [1, 1, 1, 1] → drop 1 → 1+1+1 = 3
    // Set 4: [3, 4, 5, 6] → drop 3 → 4+5+6 = 15
    // Set 5: [2, 2, 2, 2] → drop 2 → 2+2+2 = 6
    // Set 6: [5, 4, 3, 6] → drop 3 → 5+4+6 = 15
    const rng = makeSequentialRng(
      4, 3, 5, 2,  // Set 1
      6, 6, 6, 6,  // Set 2
      1, 1, 1, 1,  // Set 3
      3, 4, 5, 6,  // Set 4
      2, 2, 2, 2,  // Set 5
      5, 4, 3, 6,  // Set 6
    );
    const scores = rollAllAbilityScores(false, rng);
    expect(scores).toHaveLength(6);
    expect(scores[0]).toBe(12);
    expect(scores[1]).toBe(18);
    expect(scores[2]).toBe(3);
    expect(scores[3]).toBe(15);
    expect(scores[4]).toBe(6);
    expect(scores[5]).toBe(15);
  });

  it('rerollOnes=false: allows 1s in the final score', () => {
    // Force dice with 1s — they should be kept in the final calculation.
    // Set: [1, 1, 1, 2] → drop 1 → 1+1+2 = 4 (1s are kept)
    // Repeat for all 6 sets.
    const rng = makeSequentialRng(
      1, 1, 1, 2,  // Set 1 → 4
      1, 1, 1, 1,  // Set 2 → 3
      3, 3, 3, 3,  // Set 3 → 9
      6, 5, 4, 3,  // Set 4 → 15
      2, 1, 1, 1,  // Set 5 → 4
      4, 4, 4, 4,  // Set 6 → 12
    );
    const scores = rollAllAbilityScores(false, rng);
    expect(scores).toHaveLength(6);
    expect(scores[0]).toBe(4);   // 1+1+2
    expect(scores[1]).toBe(3);   // 1+1+1
    expect(scores[2]).toBe(9);   // 3+3+3
    expect(scores[3]).toBe(15);  // 6+5+4
    expect(scores[4]).toBe(4);   // 2+1+1
    expect(scores[5]).toBe(12);  // 4+4+4
  });

  it('rerollOnes=true: rerolls 1s once before dropping lowest', () => {
    // With rerollOnes=true, each die showing 1 is rerolled ONCE (not recursively).
    // Implementation: if roll === 1, call rng(6) once more and use the new result
    // even if it's also 1.
    //
    // Set 1: die1=1→reroll=3, die2=2, die3=4, die4=5 → [2,3,4,5] → drop 2 → 3+4+5 = 12
    // Set 2: die1=1→reroll=1 (kept as 1), die2=6, die3=3, die4=5 → [1,3,5,6] → drop 1 → 3+5+6 = 14
    // Sets 3-6: no 1s to keep things simple.
    const rng = makeSequentialRng(
      1, 3,   // Set 1, die 1: rolls 1 → rerolls once → 3
      2,      // Set 1, die 2: 2
      4,      // Set 1, die 3: 4
      5,      // Set 1, die 4: 5
      1, 1,   // Set 2, die 1: rolls 1 → rerolls once → 1 (still 1, only one reroll)
      6,      // Set 2, die 2: 6
      3,      // Set 2, die 3: 3
      5,      // Set 2, die 4: 5
      3, 3, 3, 3, // Set 3: all 3s → 9
      4, 4, 4, 4, // Set 4: all 4s → 12
      5, 5, 5, 5, // Set 5: all 5s → 15
      6, 6, 6, 6, // Set 6: all 6s → 18
    );
    const scores = rollAllAbilityScores(true, rng);
    expect(scores).toHaveLength(6);
    expect(scores[0]).toBe(12);  // 3+4+5 (drop 2)
    expect(scores[1]).toBe(14);  // 3+5+6 (drop the 1)
    expect(scores[2]).toBe(9);   // 3+3+3
    expect(scores[3]).toBe(12);  // 4+4+4
    expect(scores[4]).toBe(15);  // 5+5+5
    expect(scores[5]).toBe(18);  // 6+6+6
  });
});

// =============================================================================
// RollResult.targetPool — Vitality/Wound Points variant (Phase 2.5b)
//
// ARCHITECTURE.md section 8.3:
//   Standard mode (vitalityWoundPoints = false): ALL rolls return targetPool = "res_hp".
//   V/WP mode (vitalityWoundPoints = true):
//     Normal hit → targetPool = "res_vitality"
//     Critical hit → targetPool = "res_wound_points"
//     context.isCriticalHit = true (separate damage roll) → "res_wound_points"
// =============================================================================

/** Campaign settings with V/WP mode on. */
const vwpSettings: CampaignSettings = {
  ...createDefaultCampaignSettings(),
  variantRules: {
    vitalityWoundPoints: true,
    gestalt: false,
  },
};

describe('RollResult.targetPool — standard mode (vitalityWoundPoints = false)', () => {
  /**
   * In standard D&D 3.5, all damage routes to res_hp regardless of crit status.
   * targetPool should always be "res_hp" when the flag is off.
   */
  it('attack roll (1d20, normal hit): targetPool = "res_hp"', () => {
    const result = parseAndRoll(
      '1d20', makePipeline(), { targetTags: [], isAttackOfOpportunity: false },
      defaultSettings, makeSequentialRng(15) // Natural 15 — normal hit
    );
    expect(result.targetPool).toBe('res_hp');
  });

  it('attack roll (1d20, crit threat nat 20): targetPool = "res_hp" in standard mode', () => {
    const result = parseAndRoll(
      '1d20', makePipeline(), { targetTags: [], isAttackOfOpportunity: false },
      defaultSettings, makeSequentialRng(20) // Natural 20 — crit threat
    );
    expect(result.isCriticalThreat).toBe(true); // Crit detected
    expect(result.targetPool).toBe('res_hp');   // But still hp in standard mode
  });

  it('damage roll (2d6, no crit): targetPool = "res_hp"', () => {
    const result = parseAndRoll(
      '2d6', makePipeline(), { targetTags: [], isAttackOfOpportunity: false },
      defaultSettings, makeSequentialRng(4, 3) // [4, 3] = 7 damage
    );
    expect(result.targetPool).toBe('res_hp');
  });

  it('damage roll with context.isCriticalHit = true: still "res_hp" in standard mode', () => {
    const critContext: RollContext = {
      targetTags: [],
      isAttackOfOpportunity: false,
      isCriticalHit: true,
    };
    const result = parseAndRoll(
      '2d6', makePipeline(), critContext,
      defaultSettings, makeSequentialRng(5, 5)
    );
    // isCriticalHit is set but standard mode means we still use res_hp
    expect(result.targetPool).toBe('res_hp');
  });
});

describe('RollResult.targetPool — Vitality/Wound Points mode (vitalityWoundPoints = true)', () => {
  /**
   * V/WP mode changes where damage goes based on crit status.
   * @see ARCHITECTURE.md section 8.3 — Critical Hit Damage Routing
   */

  it('normal attack roll (nat 15): targetPool = "res_vitality"', () => {
    const result = parseAndRoll(
      '1d20', makePipeline(), { targetTags: [], isAttackOfOpportunity: false },
      vwpSettings, makeSequentialRng(15)
    );
    expect(result.isCriticalThreat).toBe(false);
    expect(result.targetPool).toBe('res_vitality');
  });

  it('critical threat attack (nat 20): targetPool = "res_wound_points"', () => {
    /**
     * SRD V/WP rule: "A critical hit deals the same amount of damage as a normal
     * hit, but that damage is deducted from wound points rather than vitality points."
     * (vitalityAndWoundPoints.html)
     */
    const result = parseAndRoll(
      '1d20', makePipeline(), { targetTags: [], isAttackOfOpportunity: false },
      vwpSettings, makeSequentialRng(20)
    );
    expect(result.isCriticalThreat).toBe(true);
    expect(result.targetPool).toBe('res_wound_points');
  });

  it('crit range 18-20: nat 18 is a crit threat → targetPool = "res_wound_points"', () => {
    const result = parseAndRoll(
      '1d20', makePipeline(), { targetTags: [], isAttackOfOpportunity: false },
      vwpSettings, makeSequentialRng(18), '18-20'
    );
    expect(result.isCriticalThreat).toBe(true);
    expect(result.targetPool).toBe('res_wound_points');
  });

  it('crit range 18-20: nat 17 is NOT a crit → targetPool = "res_vitality"', () => {
    const result = parseAndRoll(
      '1d20', makePipeline(), { targetTags: [], isAttackOfOpportunity: false },
      vwpSettings, makeSequentialRng(17), '18-20'
    );
    expect(result.isCriticalThreat).toBe(false);
    expect(result.targetPool).toBe('res_vitality');
  });

  it('separate damage roll for confirmed crit (context.isCriticalHit = true): → "res_wound_points"', () => {
    /**
     * TWO-ROLL COMBAT FLOW (ARCHITECTURE.md section 8.3):
     *   1. Attack roll: parseAndRoll("1d20") → isCriticalThreat = true.
     *   2. Player confirms the crit.
     *   3. Damage roll: parseAndRoll("2d6", ..., { isCriticalHit: true }) → routes to WP.
     *
     * On a pure damage roll ("2d6"), isCriticalThreat is always false (no d20 rolled).
     * The context.isCriticalHit flag is the only way to signal a confirmed crit
     * for damage routing purposes.
     */
    const critDamageContext: RollContext = {
      targetTags: [],
      isAttackOfOpportunity: false,
      isCriticalHit: true, // Caller signals this damage roll is for a confirmed crit
    };
    const result = parseAndRoll(
      '2d6', makePipeline(), critDamageContext,
      vwpSettings, makeSequentialRng(5, 3) // [5, 3] = 8 damage
    );
    expect(result.isCriticalThreat).toBe(false); // No d20 on damage roll
    expect(result.finalTotal).toBe(8);           // Normal damage amount (no multiplier in V/WP)
    expect(result.targetPool).toBe('res_wound_points'); // Routes to WP
  });

  it('separate damage roll, NOT a crit (context.isCriticalHit = false): → "res_vitality"', () => {
    const normalDamageContext: RollContext = {
      targetTags: [],
      isAttackOfOpportunity: false,
      isCriticalHit: false,
    };
    const result = parseAndRoll(
      '1d8', makePipeline(), normalDamageContext,
      vwpSettings, makeSequentialRng(6)
    );
    expect(result.targetPool).toBe('res_vitality');
  });

  it('separate damage roll, isCriticalHit absent: treats as normal hit → "res_vitality"', () => {
    // When isCriticalHit is absent (undefined), falls back to isCriticalThreat (false for non-d20)
    const noFlagContext: RollContext = {
      targetTags: [],
      isAttackOfOpportunity: false,
      // isCriticalHit intentionally absent
    };
    const result = parseAndRoll(
      '1d8', makePipeline(), noFlagContext,
      vwpSettings, makeSequentialRng(7)
    );
    expect(result.targetPool).toBe('res_vitality'); // No crit → vitality
  });

  it('targetPool is the correct enum type (DamageTargetPool)', () => {
    // Type check: ensure the field carries a valid DamageTargetPool value.
    const r1 = parseAndRoll('1d20', makePipeline(), { targetTags: [], isAttackOfOpportunity: false }, defaultSettings, makeSequentialRng(10));
    const r2 = parseAndRoll('1d20', makePipeline(), { targetTags: [], isAttackOfOpportunity: false }, vwpSettings, makeSequentialRng(10));
    const r3 = parseAndRoll('1d20', makePipeline(), { targetTags: [], isAttackOfOpportunity: false }, vwpSettings, makeSequentialRng(20));

    const validValues: DamageTargetPool[] = ['res_hp', 'res_vitality', 'res_wound_points'];
    expect(validValues).toContain(r1.targetPool);
    expect(validValues).toContain(r2.targetPool);
    expect(validValues).toContain(r3.targetPool);

    expect(r1.targetPool).toBe('res_hp');
    expect(r2.targetPool).toBe('res_vitality');
    expect(r3.targetPool).toBe('res_wound_points');
  });
});

describe('DamageTargetPool — createDefaultCampaignSettings initialises V/WP flag correctly', () => {
  it('default settings have vitalityWoundPoints = false', () => {
    const settings = createDefaultCampaignSettings();
    expect(settings.variantRules.vitalityWoundPoints).toBe(false);
  });

  it('default settings have gestalt = false', () => {
    const settings = createDefaultCampaignSettings();
    expect(settings.variantRules.gestalt).toBe(false);
  });

  it('V/WP flag can be toggled independently of gestalt', () => {
    const settings = createDefaultCampaignSettings();
    settings.variantRules.vitalityWoundPoints = true;
    expect(settings.variantRules.vitalityWoundPoints).toBe(true);
    expect(settings.variantRules.gestalt).toBe(false); // gestalt unchanged
  });
});

// =============================================================================
// parseDiceExpression edge cases — unknown token warning (line 509)
// =============================================================================

describe('parseAndRoll() — unknown/garbage token in formula (line 509 coverage)', () => {
  /**
   * Line 509: `console.warn(...)` inside `parseDiceExpression`.
   * Fires when a token cannot be parsed as a die group (NdN), a constant (+/- int),
   * or a valid separator. The unknown token is silently skipped after the warning.
   * This allows partial-parse: "1d6 ? xyz" still yields the valid 1d6 portion.
   */
  const pipeline = {
    id: 'test', label: { en: 'Test' }, baseValue: 0,
    activeModifiers: [], situationalModifiers: [], totalBonus: 0, totalValue: 0,
    derivedModifier: 0,
  };
  const ctx: RollContext = { targetTags: [], isAttackOfOpportunity: false };
  const settings = createDefaultCampaignSettings();
  const deterministicRng = () => 3; // always roll 3

  it('logs a warning but still returns a result when formula has unknown tokens', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // The parser normalises whitespace first, then splits by +/-.
    // "1d6+garbage": "1d6" is a valid dice group (rolled = 3); "+garbage" → sign=1,
    // cleanPart="garbage" matches neither /\d+d\d+/ nor /\d+/ → warning + skip.
    const result = parseAndRoll('1d6+garbage', pipeline, ctx, settings, deterministicRng);

    expect(spy).toHaveBeenCalledWith(expect.stringContaining('Could not parse dice expression token'));
    // 1d6 rolled deterministically (always 3) + no static bonus + no modifier = 3
    expect(result.finalTotal).toBe(3);
    spy.mockRestore();
  });
});
