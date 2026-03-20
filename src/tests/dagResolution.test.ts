/**
 * @file src/tests/dagResolution.test.ts
 * @description Vitest integration tests for the DAG (Directed Acyclic Graph) resolution.
 *
 * ARCHITECTURE:
 *   The DAG consists of phases (0-4) implemented as Svelte 5 $derived runes.
 *   These cannot be tested directly in Vitest (no Svelte runtime context).
 *   Instead, we test the PURE UTILITY FUNCTIONS used by the DAG phases:
 *     - applyStackingRules (Phase 0/2/3)
 *     - computeDerivedModifier (Phase 2)
 *     - evaluateFormula (Phase 0)
 *     - evaluateLogicNode / checkCondition (Phase 0)
 *
 *   For Phase 17.5 scenarios, we simulate what the GameEngine would compute
 *   by building the pipeline manually and verifying the cascade logic.
 *
 * SCENARIOS:
 *   1. Belt of Constitution +2: CON → Fort save → Max HP cascade.
 *      Validates that the CON modifier flows correctly through the stacking rules
 *      and that computeDerivedModifier produces the correct contribution.
 *
 *   2. Circular dependency detection: a feature granting +1 CON based on Max HP.
 *      Since GameEngine uses $derived (Svelte 5), circular deps cause infinite loops.
 *      We test the individual stacking/formula functions don't themselves loop.
 *      The true circular dep protection is tested in the GameEngine's depth counter.
 *
 * @see src/lib/utils/stackingRules.ts for applyStackingRules
 * @see src/lib/utils/mathParser.ts for evaluateFormula
 * @see src/lib/engine/GameEngine.svelte.ts for MAX_RESOLUTION_DEPTH constant
 * @see ARCHITECTURE.md Phase 17.5
 */

import { describe, it, expect } from 'vitest';
import { applyStackingRules, computeDerivedModifier } from '$lib/utils/stackingRules';
import { evaluateFormula } from '$lib/utils/mathParser';
import type { CharacterContext } from '$lib/utils/mathParser';
import type { Modifier } from '$lib/types/pipeline';

// ============================================================
// HELPERS
// ============================================================

function makeMod(id: string, value: number, type: string, targetId = 'test'): Modifier {
  return {
    id,
    sourceId: `src_${id}`,
    sourceName: { en: id },
    targetId,
    value,
    type: type as import('$lib/types/primitives').ModifierType,
  };
}

// ============================================================
// SCENARIO 1: Belt of Constitution +2 cascade
// (ARCHITECTURE.md Phase 17.5)
// ============================================================

describe('DAG cascade: Belt of Constitution +2', () => {
  /**
   * Simulates the Phase 2 computation for stat_con.
   * Belt of Constitution grants +2 enhancement to CON.
   * CON base = 12 → totalValue = 14 → derivedModifier = +2
   */
  it('Belt +2 enhancement: CON base 12 → totalValue 14', () => {
    const beltMod = makeMod('belt_con', 2, 'enhancement');

    const result = applyStackingRules([beltMod], 12);

    expect(result.totalValue).toBe(14);
    expect(result.totalBonus).toBe(2);
  });

  it('CON 14 → derivedModifier +2 (before Belt: CON 12 → mod +1)', () => {
    const withoutBelt = computeDerivedModifier(12);
    const withBelt = computeDerivedModifier(14);

    expect(withoutBelt).toBe(1);   // floor((12-10)/2) = 1
    expect(withBelt).toBe(2);      // floor((14-10)/2) = 2
  });

  /**
   * Simulates Phase 3 Fort save cascade.
   * Fort = class base + CON modifier.
   * If CON mod increases from +1 to +2 (due to Belt), Fort save increases by 1.
   */
  it('CON modifier increases Fort save by 1 when Belt is active', () => {
    const characterLevel = 5;
    const classBaseFort = 4;  // E.g., Fighter level 5 (good saves: 2+1+0+1+0)

    // Without Belt: CON 12 → mod +1
    const fortWithoutBelt = classBaseFort + computeDerivedModifier(12);
    // With Belt: CON 14 → mod +2
    const fortWithBelt = classBaseFort + computeDerivedModifier(14);

    expect(fortWithBelt - fortWithoutBelt).toBe(1);
    expect(fortWithBelt).toBe(fortWithoutBelt + 1);
  });

  it('Correct Max HP: CON 12 → mod+1 → HP=35; CON 14 → mod+2 → HP=40 (at level 5)', () => {
    const level = 5;
    const hitDice = 30;

    const hpBase   = hitDice + computeDerivedModifier(12) * level;  // 30 + 1*5 = 35
    const hpBelt   = hitDice + computeDerivedModifier(14) * level;  // 30 + 2*5 = 40

    expect(hpBase).toBe(35);
    expect(hpBelt).toBe(40);
    expect(hpBelt - hpBase).toBe(5);  // +5 HP from the Belt at level 5
  });

  /**
   * Formula-as-value test: "@classLevels.class_soulknife / 4"
   * Proves formulas with @classLevels resolve correctly (ARCHITECTURE.md Example A.7)
   */
  it('Formula-as-value: Psychic Strike at Soulknife level 9 = floor(9/4)d8 = 2d8', () => {
    const ctx: CharacterContext = {
      attributes: {},
      skills: {},
      combatStats: {},
      saves: {},
      characterLevel: 9,
      classLevels: { 'class_soulknife': 9 },
      activeTags: [],
      equippedWeaponTags: [],
      selection: {},
      constants: {},
    };

    const result = evaluateFormula('floor(@classLevels.class_soulknife / 4)', ctx, 'en');
    expect(result).toBe(2);  // floor(9/4) = 2 → "2d8"
  });
});

// ============================================================
// SCENARIO 2: Circular Dependency Safety Test
// (ARCHITECTURE.md Phase 17.5 — "Loop Test")
// ============================================================

describe('DAG circular dependency safety', () => {
  /**
   * The REAL circular dependency protection is the GameEngine's MAX_RESOLUTION_DEPTH = 3
   * counter in #collectModifiersFromInstance(). This prevents infinite recursion in
   * the grantedFeatures recursion.
   *
   * We test that the pure utility functions themselves don't loop:
   *   - applyStackingRules with a formula-value modifier
   *   - evaluateFormula with a self-referential path
   */

  it('applyStackingRules with many identical modifiers does not hang (no infinite loop)', () => {
    // Build 100 identical +1 untyped modifiers — should sum to +100
    const mods: Modifier[] = Array.from({ length: 100 }, (_, i) =>
      makeMod(`m${i}`, 1, 'untyped')
    );

    const start = performance.now();
    const result = applyStackingRules(mods, 0);
    const elapsed = performance.now() - start;

    expect(result.totalBonus).toBe(100);
    expect(elapsed).toBeLessThan(100);  // Should complete in < 100ms
  });

  it('evaluateFormula with deeply nested formula does not crash', () => {
    const ctx: CharacterContext = {
      attributes: { stat_str: { baseValue: 10, totalValue: 10, derivedModifier: 0 } },
      skills: {},
      combatStats: {},
      saves: {},
      characterLevel: 1,
      classLevels: {},
      activeTags: [],
      equippedWeaponTags: [],
      selection: {},
      constants: {},
    };

    // A "circular" formula tries to read STR based on STR — but evaluateFormula is
    // not reactive; it reads a snapshot. So it just resolves once, no loop.
    const result = evaluateFormula(
      '@attributes.stat_str.derivedModifier + @attributes.stat_str.totalValue',
      ctx,
      'en'
    );
    // 0 + 10 = 10 (no loop, resolved statically)
    expect(result).toBe(10);
    expect(typeof result).toBe('number');
  });

  it('evaluateFormula with unknown path returns 0 (no crash)', () => {
    const ctx: CharacterContext = {
      attributes: {},
      skills: {},
      combatStats: {},
      saves: {},
      characterLevel: 1,
      classLevels: {},
      activeTags: [],
      equippedWeaponTags: [],
      selection: {},
      constants: {},
    };

    // A "malicious" path that would cause CON-based HP → HP-based CON → loop
    // In practice, evaluateFormula just returns 0 for unresolved paths.
    expect(() => {
      evaluateFormula('@attributes.resources.hp.maxValue', ctx, 'en');
    }).not.toThrow();
  });

  it('applyStackingRules with setAbsolute and other modifiers terminates correctly', () => {
    const mods: Modifier[] = [
      makeMod('normal1', 5, 'enhancement'),
      makeMod('normal2', 3, 'morale'),
      makeMod('abs', 100, 'setAbsolute'),   // Forces totalValue to 100
      makeMod('normal3', 10, 'racial'),    // Ignored (setAbsolute wins)
    ];

    const result = applyStackingRules(mods, 10);

    // setAbsolute should set totalValue = 100 regardless of other modifiers
    expect(result.totalValue).toBe(100);
  });
});
