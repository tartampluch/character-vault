/**
 * @file src/tests/inherentBonus.test.ts
 * @description Vitest unit tests for Enhancement E-8 — Inherent Bonus modifier type.
 *
 * WHAT IS TESTED:
 *   The `"inherent"` ModifierType was added to support Tomes (Manual of Bodily Health,
 *   Tome of Clear Thought, etc.) and similar permanent ability score improvements granted
 *   by Wish/Miracle. Inherent bonuses have unique stacking semantics:
 *     - Non-stacking WITHIN the same type: only the highest applies (same as enhancement)
 *     - STACKS WITH enhancement and all other bonus types: a +2 inherent + +4 enhancement
 *       = +6 total (both apply)
 *     - Maximum of +5 inherent bonus to any given ability score (SRD rule)
 *
 * TESTS (14):
 *
 * ─── TYPE SOUNDNESS (2) ──────────────────────────────────────────────────────
 *   1.  `"inherent"` is a valid ModifierType (TypeScript compile check via assignment)
 *   2.  A Modifier object with `type: "inherent"` compiles and type-checks correctly
 *
 * ─── STACKING RULES — WITHIN INHERENT (5) ───────────────────────────────────
 *   3.  Single inherent +2 STR → totalBonus = 2
 *   4.  Two inherent bonuses (+2 and +4) → only the highest (+4) applies (non-stacking)
 *   5.  Two inherent bonuses (+2 and +2) → only one +2 applies (equal, first wins)
 *   6.  Inherent +5 is the SRD maximum → correct value produced
 *   7.  Three inherent bonuses (+1, +3, +5) → only +5 applies, others suppressed
 *
 * ─── STACKING RULES — INHERENT + OTHER TYPES (5) ────────────────────────────
 *   8.  Inherent +4 + enhancement +4 → totalBonus = 8 (both apply, different types)
 *   9.  Inherent +2 + enhancement +6 → totalBonus = 8 (both apply)
 *  10.  Inherent +4 + luck +2 → totalBonus = 6 (both apply, different types)
 *  11.  Inherent +2 + morale +2 → totalBonus = 4 (both apply)
 *  12.  Two inherent (+4, +2) + enhancement (+4) → highest inherent (+4) + enhancement (+4) = 8
 *
 * ─── SUPPRESSED LIST ACCURACY (2) ───────────────────────────────────────────
 *  13.  Weaker inherent is in suppressedModifiers when a stronger one exists
 *  14.  No modifiers suppressed when only one inherent bonus is present
 *
 * @see src/lib/types/primitives.ts      — ModifierType union (inherent added by E-8a)
 * @see src/lib/utils/stackingRules.ts   — applyStackingRules() handles inherent as non-stacking
 * @see ARCHITECTURE.md section 4.10     — Inherent Bonus mechanic reference
 */

import { describe, it, expect } from 'vitest';
import { applyStackingRules } from '../lib/utils/stackingRules';
import type { Modifier } from '../lib/types/pipeline';

// =============================================================================
// HELPERS
// =============================================================================

function inh(id: string, targetId: string, value: number): Modifier {
  return {
    id,
    sourceId: `tome_${id}`,
    sourceName: { en: `Tome (${id})`, fr: `Tome (${id})` },
    targetId,
    value,
    type: 'inherent',
  };
}

function enh(id: string, targetId: string, value: number): Modifier {
  return {
    id,
    sourceId: `item_${id}`,
    sourceName: { en: `Item (${id})`, fr: `Item (${id})` },
    targetId,
    value,
    type: 'enhancement',
  };
}

function lck(id: string, targetId: string, value: number): Modifier {
  return {
    id,
    sourceId: `item_${id}`,
    sourceName: { en: `Item (${id})`, fr: `Item (${id})` },
    targetId,
    value,
    type: 'luck',
  };
}

function mor(id: string, targetId: string, value: number): Modifier {
  return {
    id,
    sourceId: `item_${id}`,
    sourceName: { en: `Item (${id})`, fr: `Item (${id})` },
    targetId,
    value,
    type: 'morale',
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('Inherent Bonus — Type Soundness', () => {

  it('1. "inherent" is a valid ModifierType (TypeScript compile check)', () => {
    // This test primarily exists to verify the TypeScript type compiles.
    // If `"inherent"` were not in the ModifierType union, this would fail to compile.
    const mod: Modifier = {
      id: 'tome_str_2',
      sourceId: 'item_manual_of_gainful_exercise_2',
      sourceName: { en: 'Manual of Gainful Exercise +2', fr: 'Manuel d\'exercice profitable +2' },
      targetId: 'attributes.stat_strength',
      value: 2,
      type: 'inherent',
    };
    expect(mod.type).toBe('inherent');
  });

  it('2. A Modifier with type "inherent" is correctly typed at all fields', () => {
    const mod: Modifier = {
      id: 'tome_con_4',
      sourceId: 'item_manual_of_bodily_health_4',
      sourceName: { en: 'Manual of Bodily Health +4', fr: 'Manuel de la santé corporelle +4' },
      targetId: 'attributes.stat_constitution',
      value: 4,
      type: 'inherent',
    };
    expect(mod.value).toBe(4);
    expect(mod.targetId).toBe('attributes.stat_constitution');
  });
});

describe('Inherent Bonus — Stacking Rules (Within Inherent)', () => {

  it('3. Single inherent +2 STR → totalBonus = 2', () => {
    const result = applyStackingRules([
      inh('tome_str_2', 'attributes.stat_strength', 2),
    ], 10);
    expect(result.totalBonus).toBe(2);
    expect(result.appliedModifiers).toHaveLength(1);
    expect(result.suppressedModifiers).toHaveLength(0);
  });

  it('4. Two inherent bonuses (+2 and +4) → only the highest (+4) applies', () => {
    // D&D 3.5 SRD: If a character reads two tomes of the same ability, only the
    // higher of the two inherent bonuses applies. applyStackingRules() correctly
    // takes the highest for non-stackable types.
    const result = applyStackingRules([
      inh('tome_str_2', 'attributes.stat_strength', 2),
      inh('tome_str_4', 'attributes.stat_strength', 4),
    ], 10);
    expect(result.totalBonus).toBe(4);  // +4 wins over +2
    expect(result.appliedModifiers).toHaveLength(1);
    expect(result.appliedModifiers[0].id).toBe('tome_str_4');
    expect(result.suppressedModifiers).toHaveLength(1);
    expect(result.suppressedModifiers[0].id).toBe('tome_str_2');
  });

  it('5. Two inherent bonuses (+2 and +2) → only one +2 applies', () => {
    const result = applyStackingRules([
      inh('tome_str_2a', 'attributes.stat_strength', 2),
      inh('tome_str_2b', 'attributes.stat_strength', 2),
    ], 10);
    expect(result.totalBonus).toBe(2);  // Only one +2 applies
    expect(result.appliedModifiers).toHaveLength(1);
    expect(result.suppressedModifiers).toHaveLength(1);
  });

  it('6. Inherent +5 (SRD maximum) → totalBonus = 5', () => {
    // The SRD maximum is +5; this test verifies the value is accepted and applied.
    const result = applyStackingRules([
      inh('tome_str_5', 'attributes.stat_strength', 5),
    ], 10);
    expect(result.totalBonus).toBe(5);
  });

  it('7. Three inherent bonuses (+1, +3, +5) → only +5 applies, others suppressed', () => {
    const result = applyStackingRules([
      inh('tome_str_1', 'attributes.stat_strength', 1),
      inh('tome_str_3', 'attributes.stat_strength', 3),
      inh('tome_str_5', 'attributes.stat_strength', 5),
    ], 10);
    expect(result.totalBonus).toBe(5);
    expect(result.appliedModifiers).toHaveLength(1);
    expect(result.appliedModifiers[0].value).toBe(5);
    expect(result.suppressedModifiers).toHaveLength(2);
    const suppressedValues = result.suppressedModifiers.map(m => m.value).sort((a, b) => (a as number) - (b as number));
    expect(suppressedValues).toEqual([1, 3]);
  });
});

describe('Inherent Bonus — Stacking Rules (With Other Types)', () => {

  it('8. Inherent +4 + enhancement +4 → totalBonus = 8 (both apply, different types)', () => {
    // This is the key D&D 3.5 rule: inherent stacks WITH enhancement.
    // A character with both a Manual of Gainful Exercise (+4 STR, inherent) and a
    // Belt of Giant Strength (+4 STR, enhancement) benefits from BOTH.
    const result = applyStackingRules([
      inh('tome_str_4', 'attributes.stat_strength', 4),
      enh('belt_str_4', 'attributes.stat_strength', 4),
    ], 10);
    expect(result.totalBonus).toBe(8);  // 4 (inherent) + 4 (enhancement) = 8
    expect(result.appliedModifiers).toHaveLength(2);
    expect(result.suppressedModifiers).toHaveLength(0);
  });

  it('9. Inherent +2 + enhancement +6 → totalBonus = 8', () => {
    const result = applyStackingRules([
      inh('tome_str_2', 'attributes.stat_strength', 2),
      enh('belt_str_6', 'attributes.stat_strength', 6),
    ], 10);
    expect(result.totalBonus).toBe(8);
    expect(result.appliedModifiers).toHaveLength(2);
  });

  it('10. Inherent +4 + luck +2 → totalBonus = 6 (both apply)', () => {
    const result = applyStackingRules([
      inh('tome_str_4', 'attributes.stat_strength', 4),
      lck('stone_luck', 'attributes.stat_strength', 2),
    ], 10);
    expect(result.totalBonus).toBe(6);
    expect(result.appliedModifiers).toHaveLength(2);
  });

  it('11. Inherent +2 + morale +2 → totalBonus = 4 (both apply)', () => {
    const result = applyStackingRules([
      inh('tome_str_2', 'attributes.stat_strength', 2),
      mor('rage_str', 'attributes.stat_strength', 2),
    ], 10);
    expect(result.totalBonus).toBe(4);
    expect(result.appliedModifiers).toHaveLength(2);
  });

  it('12. Two inherent (+4, +2) + enhancement (+4) → highest inherent (+4) + enhancement (+4) = 8', () => {
    // Reading a weaker tome after a stronger one: only the stronger inherent applies,
    // but the enhancement bonus from equipment still stacks fully.
    const result = applyStackingRules([
      inh('tome_str_4', 'attributes.stat_strength', 4),  // from first (stronger) tome
      inh('tome_str_2', 'attributes.stat_strength', 2),  // from second (weaker) tome — suppressed
      enh('belt_str_4', 'attributes.stat_strength', 4),  // Belt of Giant Strength
    ], 10);
    expect(result.totalBonus).toBe(8);              // +4 inherent + +4 enhancement
    expect(result.appliedModifiers).toHaveLength(2);
    expect(result.suppressedModifiers).toHaveLength(1);
    expect(result.suppressedModifiers[0].id).toBe('tome_str_2');
  });
});

describe('Inherent Bonus — Suppressed List Accuracy', () => {

  it('13. Weaker inherent is in suppressedModifiers when a stronger one exists', () => {
    const result = applyStackingRules([
      inh('tome_str_2', 'attributes.stat_strength', 2),
      inh('tome_str_4', 'attributes.stat_strength', 4),
    ], 10);
    expect(result.suppressedModifiers).toHaveLength(1);
    expect(result.suppressedModifiers[0].id).toBe('tome_str_2');
    expect(result.suppressedModifiers[0].value).toBe(2);
  });

  it('14. No modifiers suppressed when only one inherent bonus is present', () => {
    const result = applyStackingRules([
      inh('tome_str_3', 'attributes.stat_strength', 3),
    ], 10);
    expect(result.suppressedModifiers).toHaveLength(0);
    expect(result.appliedModifiers).toHaveLength(1);
  });
});
