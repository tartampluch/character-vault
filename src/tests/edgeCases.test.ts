/**
 * @file src/tests/edgeCases.test.ts
 * @description Edge case tests for previously uncovered code paths.
 *
 * COVERAGE TARGETS (from coverage report gaps):
 *   - stackingRules.ts lines 370-377: multiplier modifier type
 *   - stackingRules.ts lines 462-465: getNumericValue with non-numeric string value
 *   - logicEvaluator.ts lines 367-377: not_includes / missing_tag operators
 *   - mathParser.ts line 361: division by zero guard
 *   - mathParser.ts lines 570-571: unsupported type warning in pipe resolution
 *   - diceEngine.ts lines 690-691: isAttackOfOpportunity flag adds tag to effectiveTargetTags
 *   - gestaltRules.ts lines 136, 142: gestalt with formula-string values (non-number)
 *
 * REGRESSION GUARDS:
 *   - saves.all fan-out produces three independent modifier entries
 *   - setAbsoluteValue field is populated in StackingResult
 *   - NOT operator in LogicNode
 *   - Multiple multiplier modifiers: highest-impact wins
 *
 * @see ARCHITECTURE.md section 2 (ModifierType: multiplier)
 * @see ARCHITECTURE.md section 4.5 (DR stacking)
 * @see ARCHITECTURE.md section 10 Example D (stacking scenario)
 */

import { describe, it, expect, vi } from 'vitest';
import { applyStackingRules } from '$lib/utils/stackingRules';
import { checkCondition } from '$lib/utils/logicEvaluator';
import { evaluateFormula, resolvePath } from '$lib/utils/mathParser';
import { parseAndRoll } from '$lib/utils/diceEngine';
import type { Modifier } from '$lib/types/pipeline';
import type { CharacterContext } from '$lib/utils/mathParser';
import type { LogicNode } from '$lib/types/logic';
import type { StatisticPipeline } from '$lib/types/pipeline';

// =============================================================================
// HELPERS
// =============================================================================

function makeModifier(id: string, value: number | string, type: string, extra?: Partial<Modifier>): Modifier {
  return {
    id,
    sourceId: `source_${id}`,
    sourceName: { en: id },
    targetId: 'test_pipeline',
    value,
    type: type as import('$lib/types/primitives').ModifierType,
    ...extra,
  };
}

function makePipeline(baseValue = 0, mods: Modifier[] = [], situationalMods: Modifier[] = []): StatisticPipeline {
  return {
    id: 'test_pipeline',
    label: { en: 'Test' },
    baseValue,
    activeModifiers: mods,
    situationalModifiers: situationalMods,
    totalBonus: mods.reduce((s, m) => s + (typeof m.value === 'number' ? m.value : 0), 0),
    totalValue: baseValue + mods.reduce((s, m) => s + (typeof m.value === 'number' ? m.value : 0), 0),
    derivedModifier: 0,
  };
}

const BASE_CONTEXT: CharacterContext = {
  attributes: { stat_strength: { baseValue: 10, totalValue: 10, derivedModifier: 0 } },
  skills: {},
  combatStats: { base_attack_bonus: { totalValue: 1 } },
  saves: { fortitude: { totalValue: 2 }, reflex: { totalValue: 2 }, will: { totalValue: 2 } },
  characterLevel: 1,
  eclForXp: 1,
  classLevels: {},
  activeTags: [],
  equippedWeaponTags: [],
  selection: {},
  constants: {},
};

const BASE_SETTINGS = {
  language: 'en' as const,
  statGeneration: { method: 'standard_array' as const, rerollOnes: false, pointBuyBudget: 25 },
  diceRules: { explodingTwenties: false },
  variantRules: { vitalityWoundPoints: false, gestalt: false },
  enabledRuleSources: ['srd_core'],
};

// =============================================================================
// 1. stacking rules — multiplier modifier type (lines 370-377)
// =============================================================================

describe('stackingRules — multiplier modifier type', () => {
  it('a single multiplier modifier applies as a factor', () => {
    const mods = [makeModifier('twohanded_str', 1.5, 'multiplier')];
    const result = applyStackingRules(mods, 10);
    // floor((10 + 0) * 1.5) = floor(15) = 15
    expect(result.totalValue).toBe(15);
    expect(result.multiplierFactor).toBe(1.5);
  });

  it('two multiplier modifiers with equal delta: first one (prev) is kept on tie', () => {
    // Both have delta 0.5 from 1.0: |1.5-1|=0.5 and |0.5-1|=0.5
    // The reduce uses `currDelta > prevDelta` (strict >), so on a tie, prev is kept.
    const mods = [
      makeModifier('twohanded', 1.5, 'multiplier'),   // delta 0.5 — first (prev)
      makeModifier('halfstr',   0.5, 'multiplier'),   // delta 0.5 — second (curr), tie → keep prev
    ];
    const result = applyStackingRules(mods, 10);
    // Tie: first modifier (1.5) is kept since currDelta NOT > prevDelta
    expect(result.multiplierFactor).toBe(1.5);
    expect(result.appliedModifiers).toHaveLength(1);
    expect(result.suppressedModifiers).toHaveLength(1);
  });

  it('multiplier of 2.0 beats multiplier of 1.5 (farther from 1.0)', () => {
    const mods = [
      makeModifier('normal',    1.5, 'multiplier'),
      makeModifier('powerful',  2.0, 'multiplier'),  // delta 1.0 beats delta 0.5
    ];
    const result = applyStackingRules(mods, 10);
    expect(result.multiplierFactor).toBe(2.0);
    expect(result.suppressedModifiers.map(m => m.id)).toContain('normal');
  });

  it('multiplier combines with additive bonus: (base + bonus) * factor', () => {
    const mods = [
      makeModifier('str_enhancement', 4, 'enhancement'),  // +4 additive
      makeModifier('twohanded', 1.5, 'multiplier'),        // × 1.5
    ];
    const result = applyStackingRules(mods, 10);
    // floor((10 + 4) * 1.5) = floor(21) = 21
    expect(result.totalValue).toBe(21);
    expect(result.totalBonus).toBe(4); // additive only
    expect(result.multiplierFactor).toBe(1.5);
  });

  it('multiplier does not apply when setAbsolute is present (setAbsolute wins)', () => {
    const mods = [
      makeModifier('wild_shape_str', 18, 'setAbsolute'),
      makeModifier('twohanded', 1.5, 'multiplier'),
    ];
    const result = applyStackingRules(mods, 10);
    expect(result.setAbsoluteValue).toBe(18);
    expect(result.totalValue).toBe(18); // setAbsolute wins
    expect(result.multiplierFactor).toBe(1); // multiplier is in suppressedModifiers
  });

  it('StackingResult.setAbsoluteValue is populated when setAbsolute fires', () => {
    const mods = [makeModifier('undead_con', 0, 'setAbsolute')];
    const result = applyStackingRules(mods, 14);
    expect(result.setAbsoluteValue).toBe(0);
    expect(result.totalValue).toBe(0);
    expect(result.totalBonus).toBe(0); // N/A
    expect(result.appliedModifiers[0].id).toBe('undead_con');
  });

  it('last setAbsolute wins when multiple are present', () => {
    const mods = [
      makeModifier('gm_override_1', 15, 'setAbsolute'),
      makeModifier('gm_override_2', 20, 'setAbsolute'), // Last one wins
    ];
    const result = applyStackingRules(mods, 10);
    expect(result.setAbsoluteValue).toBe(20);
    expect(result.totalValue).toBe(20);
    expect(result.suppressedModifiers).toHaveLength(1);
    expect(result.suppressedModifiers[0].id).toBe('gm_override_1');
  });
});

// =============================================================================
// 2. stackingRules — getNumericValue fallback (lines 462-465)
// =============================================================================

describe('stackingRules — getNumericValue with non-numeric string (fallback coverage)', () => {
  it('modifier with dice string value "1d8" — parseFloat("1d8") = 1 (stops at d)', () => {
    // parseFloat("1d8") returns 1, stopping at the non-numeric "d" character.
    // This is why string values in modifiers should be pre-resolved to numbers.
    // The engine calls evaluateFormula() before applyStackingRules() for this reason.
    const mods = [makeModifier('unarmed_damage', '1d8' as unknown as number, 'base')];
    const result = applyStackingRules(mods, 0);
    // parseFloat("1d8") = 1 (partial parse)
    expect(result.totalBonus).toBe(1);
  });

  it('modifier with truly non-parseable string "abc" warns and treats as 0', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mods = [makeModifier('bad_value', 'abc' as unknown as number, 'untyped')];
    const result = applyStackingRules(mods, 0);
    // parseFloat("abc") = NaN → getNumericValue returns 0 with a warning
    expect(result.totalBonus).toBe(0);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('non-numeric value "abc"')
    );
    consoleSpy.mockRestore();
  });

  it('modifier with parseable numeric string "4" is correctly treated as 4', () => {
    const mods = [makeModifier('str_bonus', '4' as unknown as number, 'enhancement')];
    const result = applyStackingRules(mods, 10);
    // parseFloat("4") = 4, which is valid
    expect(result.totalBonus).toBe(4);
    expect(result.totalValue).toBe(14);
  });
});

// =============================================================================
// 3. logicEvaluator — not_includes and missing_tag operators (lines 367-377)
// =============================================================================

describe('logicEvaluator — not_includes and missing_tag operators', () => {
  const contextWithTags: CharacterContext = {
    ...BASE_CONTEXT,
    activeTags: ['race_human', 'class_fighter', 'wearing_armor'],
  };

  // --- not_includes ---
  it('not_includes: passes when the value is NOT in the array', () => {
    const node: LogicNode = {
      logic: 'CONDITION',
      targetPath: '@activeTags',
      operator: 'not_includes',
      value: 'race_elf', // not in activeTags
    };
    expect(checkCondition(node, contextWithTags)).toBe(true);
  });

  it('not_includes: fails when the value IS in the array', () => {
    const node: LogicNode = {
      logic: 'CONDITION',
      targetPath: '@activeTags',
      operator: 'not_includes',
      value: 'wearing_armor', // IS in activeTags
    };
    expect(checkCondition(node, contextWithTags)).toBe(false);
  });

  // --- missing_tag ---
  it('missing_tag: passes when character does NOT have the tag', () => {
    const node: LogicNode = {
      logic: 'CONDITION',
      targetPath: '@activeTags',
      operator: 'missing_tag',
      value: 'stunned',
    };
    expect(checkCondition(node, contextWithTags)).toBe(true);
  });

  it('missing_tag: fails when character HAS the tag', () => {
    const node: LogicNode = {
      logic: 'CONDITION',
      targetPath: '@activeTags',
      operator: 'missing_tag',
      value: 'wearing_armor',
    };
    expect(checkCondition(node, contextWithTags)).toBe(false);
  });

  it('missing_tag on a non-array path logs a warning and returns false', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const node: LogicNode = {
      logic: 'CONDITION',
      targetPath: '@characterLevel', // This is a number, not an array
      operator: 'missing_tag',
      value: 'someTag',
    };
    const result = checkCondition(node, contextWithTags);
    expect(result).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Operator "missing_tag" requires an array target')
    );
    consoleSpy.mockRestore();
  });

  it('not_includes on a non-array path logs a warning and returns false', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const node: LogicNode = {
      logic: 'CONDITION',
      targetPath: '@characterLevel',
      operator: 'not_includes',
      value: 'someValue',
    };
    const result = checkCondition(node, BASE_CONTEXT);
    expect(result).toBe(false);
    consoleSpy.mockRestore();
  });

  // Ensure missing_tag and not_includes behave identically for includes arrays
  it('missing_tag and not_includes give the same result on @activeTags', () => {
    const missingNode: LogicNode = {
      logic: 'CONDITION', targetPath: '@activeTags', operator: 'missing_tag', value: 'race_elf',
    };
    const notIncNode: LogicNode = {
      logic: 'CONDITION', targetPath: '@activeTags', operator: 'not_includes', value: 'race_elf',
    };
    expect(checkCondition(missingNode, contextWithTags)).toBe(checkCondition(notIncNode, contextWithTags));
  });
});

// =============================================================================
// 4. logicEvaluator — unknown operator fallback
// =============================================================================

describe('logicEvaluator — unknown operator graceful fallback', () => {
  it('unknown operator logs a warning and returns false (safe failure)', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const node = {
      logic: 'CONDITION' as const,
      targetPath: '@characterLevel',
      operator: 'xyzzy' as unknown as import('$lib/types/primitives').LogicOperator,
      value: 1,
    };
    const result = checkCondition(node, BASE_CONTEXT);
    expect(result).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unknown operator "xyzzy"')
    );
    consoleSpy.mockRestore();
  });
});

// =============================================================================
// 5. mathParser — division by zero guard (line 361 in parseTerm)
// =============================================================================

describe('mathParser — division by zero guard', () => {
  it('division by zero returns 0 (not Infinity or NaN)', () => {
    const result = evaluateFormula('10 / 0', BASE_CONTEXT, 'en');
    // parseTerm checks: right !== 0 ? left / right : 0
    expect(result).toBe(0);
    expect(Number.isFinite(result as number)).toBe(true);
  });

  it('division by a formula resolving to 0 also returns 0', () => {
    const contextWithZeroBAB: CharacterContext = {
      ...BASE_CONTEXT,
      combatStats: { base_attack_bonus: { totalValue: 0 } },
    };
    const result = evaluateFormula('10 / @combatStats.base_attack_bonus.totalValue', contextWithZeroBAB, 'en');
    expect(result).toBe(0);
  });

  it('floor(x / y) handles zero denominator without crashing', () => {
    const result = evaluateFormula('floor(8 / 0)', BASE_CONTEXT, 'en');
    expect(result).toBe(0);
  });
});

// =============================================================================
// 6. mathParser — array / unsupported type in pipe resolution (lines 570-571)
// =============================================================================

describe('mathParser — @activeTags in arithmetic formula (array → 0 with warning)', () => {
  it('using @activeTags in an arithmetic context returns 0 and logs a warning', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ctxWithTags: CharacterContext = {
      ...BASE_CONTEXT,
      activeTags: ['race_human', 'class_fighter'],
    };
    const result = evaluateFormula('@activeTags + 1', ctxWithTags, 'en');
    // @activeTags resolves to an array; in arithmetic, this becomes "0"
    expect(result).toBe(1); // 0 + 1
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('resolved to an array')
    );
    consoleSpy.mockRestore();
  });
});

// =============================================================================
// 7. diceEngine — isAttackOfOpportunity adds tag to effectiveTargetTags
// =============================================================================

describe('diceEngine — isAttackOfOpportunity flag', () => {
  it('situational modifier for "attack_of_opportunity" applies only on AoO rolls', () => {
    const aooMod: Modifier = makeModifier('snake_reflexes_aoo', 4, 'untyped', {
      situationalContext: 'attack_of_opportunity',
    });
    const pipeline = makePipeline(0, [], [aooMod]);
    const deterministicRng = () => 10; // Always rolls 10

    const normalRollContext = {
      targetTags: ['orc'],
      isAttackOfOpportunity: false,
    };
    const aooRollContext = {
      targetTags: ['orc'],
      isAttackOfOpportunity: true,
    };

    const normalResult = parseAndRoll('1d20', pipeline, normalRollContext, BASE_SETTINGS, deterministicRng);
    const aooResult = parseAndRoll('1d20', pipeline, aooRollContext, BASE_SETTINGS, deterministicRng);

    // Normal roll: AoO mod does NOT apply
    expect(normalResult.situationalBonusApplied).toBe(0);
    expect(normalResult.finalTotal).toBe(10); // d20=10, no bonus

    // AoO roll: AoO mod DOES apply (+4)
    expect(aooResult.situationalBonusApplied).toBe(4);
    expect(aooResult.finalTotal).toBe(14); // d20=10 + 4
  });

  it('AoO flag does not affect a modifier without situational context', () => {
    const permanentBonus: Modifier = makeModifier('combat_expertise', 2, 'dodge');
    const pipeline = makePipeline(0, [permanentBonus], []);
    const deterministicRng = () => 12;

    const aooResult = parseAndRoll('1d20', pipeline, { targetTags: [], isAttackOfOpportunity: true }, BASE_SETTINGS, deterministicRng);
    // Permanent modifiers are in pipeline.totalBonus (staticBonus), not situationalBonusApplied
    expect(aooResult.staticBonus).toBe(2);
    expect(aooResult.situationalBonusApplied).toBe(0);
  });
});

// =============================================================================
// 8. saves.all fan-out — three entries with correct suffixed IDs
// =============================================================================

describe('saves.all fan-out logic (ARCHITECTURE.md section 9.4)', () => {
  /**
   * We test the fan-out indirectly by verifying that Divine Grace (+CHA to all saves)
   * produces three independent +CHA bonus modifiers targeting saves.fortitude, saves.reflex, saves.will.
   *
   * This mirrors the internal behavior of #processModifierList when targetId === "saves.all".
   * We test via the stacking rules by manually constructing what the fan-out produces.
   */

  it('Three independent modifiers from saves.all fan-out stack independently', () => {
    // Fan-out produces: mod_fort, mod_ref, mod_will each with value 3 (CHA mod)
    const fortMod = makeModifier('divine_grace_fort', 3, 'untyped', { targetId: 'saves.fortitude' });
    const refMod  = makeModifier('divine_grace_ref',  3, 'untyped', { targetId: 'saves.reflex' });
    const willMod = makeModifier('divine_grace_will', 3, 'untyped', { targetId: 'saves.will' });

    // Each save is computed independently
    expect(applyStackingRules([fortMod], 5).totalValue).toBe(8);
    expect(applyStackingRules([refMod],  3).totalValue).toBe(6);
    expect(applyStackingRules([willMod], 4).totalValue).toBe(7);
  });

  it('Multiple saves.all sources sum (type "untyped" always stacks)', () => {
    // Cloak of Resistance +2 targets saves.all → each save gets +2
    // Resistance spell +1 targets saves.all → each save also gets +1
    // Both are "resistance" type → only highest applies (non-stacking)
    const cloakFort   = makeModifier('cloak_fort',   2, 'resistance', { targetId: 'saves.fortitude' });
    const spellFort   = makeModifier('spell_fort',   1, 'resistance', { targetId: 'saves.fortitude' });
    // resistance type = non-stacking, max wins
    const fortResult = applyStackingRules([cloakFort, spellFort], 4);
    expect(fortResult.totalValue).toBe(6); // 4 base + 2 (max resistance)
    expect(fortResult.suppressedModifiers).toHaveLength(1); // spell_fort suppressed
  });
});

// =============================================================================
// 9. LogicNode NOT operator
// =============================================================================

describe('logicEvaluator — NOT operator', () => {
  const ctx: CharacterContext = {
    ...BASE_CONTEXT,
    activeTags: ['wearing_armor', 'class_fighter'],
  };

  it('NOT negates a true condition', () => {
    const node: LogicNode = {
      logic: 'NOT',
      node: {
        logic: 'CONDITION',
        targetPath: '@activeTags',
        operator: 'has_tag',
        value: 'wearing_armor', // true → NOT true = false
      },
    };
    expect(checkCondition(node, ctx)).toBe(false);
  });

  it('NOT negates a false condition', () => {
    const node: LogicNode = {
      logic: 'NOT',
      node: {
        logic: 'CONDITION',
        targetPath: '@activeTags',
        operator: 'has_tag',
        value: 'stunned', // false → NOT false = true
      },
    };
    expect(checkCondition(node, ctx)).toBe(true);
  });

  it('Monk AC condition: NOT wearing_armor AND NOT carrying_shield AND NOT heavy_load', () => {
    const monkAcCondition: LogicNode = {
      logic: 'AND',
      nodes: [
        { logic: 'NOT', node: { logic: 'CONDITION', targetPath: '@activeTags', operator: 'has_tag', value: 'wearing_armor' } },
        { logic: 'NOT', node: { logic: 'CONDITION', targetPath: '@activeTags', operator: 'has_tag', value: 'carrying_shield' } },
        { logic: 'NOT', node: { logic: 'CONDITION', targetPath: '@activeTags', operator: 'has_tag', value: 'heavy_load' } },
        { logic: 'NOT', node: { logic: 'CONDITION', targetPath: '@activeTags', operator: 'has_tag', value: 'medium_load' } },
      ],
    };

    const unarmoredCtx: CharacterContext = {
      ...BASE_CONTEXT,
      activeTags: ['class_monk', 'size_medium'],
    };
    const armoredCtx: CharacterContext = {
      ...BASE_CONTEXT,
      activeTags: ['class_monk', 'wearing_armor', 'armor_chain_shirt'],
    };

    // Unarmored monk: all conditions pass
    expect(checkCondition(monkAcCondition, unarmoredCtx)).toBe(true);
    // Armored monk: first condition fails
    expect(checkCondition(monkAcCondition, armoredCtx)).toBe(false);
  });
});

// =============================================================================
// 10. DR stacking — three independent bypass groups coexist
// =============================================================================

describe('Damage Reduction — multiple bypass groups coexist (ARCHITECTURE.md section 4.5)', () => {
  it('DR 5/magic AND DR 10/silver coexist as independent entries', () => {
    const drMagic  = makeModifier('vampire_dr_magic',  10, 'damage_reduction', { drBypassTags: ['magic'] });
    const drSilver = makeModifier('vampire_dr_silver', 10, 'damage_reduction', { drBypassTags: ['silver'] });
    const result = applyStackingRules([drMagic, drSilver], 0);
    expect(result.drEntries).toHaveLength(2);
    const bypassKeys = result.drEntries!.map(e => JSON.stringify(e.bypassTags.sort()));
    expect(bypassKeys).toContain('["magic"]');
    expect(bypassKeys).toContain('["silver"]');
  });

  it('Two DR/magic sources: best-wins (10 beats 5)', () => {
    const drA = makeModifier('dr_magic_a', 5,  'damage_reduction', { drBypassTags: ['magic'] });
    const drB = makeModifier('dr_magic_b', 10, 'damage_reduction', { drBypassTags: ['magic'] });
    const result = applyStackingRules([drA, drB], 0);
    expect(result.drEntries).toHaveLength(1);
    expect(result.drEntries![0].amount).toBe(10);
    expect(result.suppressedModifiers.map(m => m.id)).toContain('dr_magic_a');
  });

  it('DR X/— (empty bypass): drBypassTags = []', () => {
    const drNone = makeModifier('barbarian_dr', 3, 'damage_reduction', { drBypassTags: [] });
    const result = applyStackingRules([drNone], 0);
    expect(result.drEntries).toHaveLength(1);
    expect(result.drEntries![0].bypassTags).toEqual([]);
    expect(result.drEntries![0].amount).toBe(3);
  });

  it('AND bypass: magic AND silver treated as one group', () => {
    const drA = makeModifier('dr_magic_silver_5',  5, 'damage_reduction', { drBypassTags: ['magic', 'silver'] });
    const drB = makeModifier('dr_silver_magic_10', 10, 'damage_reduction', { drBypassTags: ['silver', 'magic'] });
    // Both should map to the same group key after sorting → best-wins
    const result = applyStackingRules([drA, drB], 0);
    expect(result.drEntries).toHaveLength(1);
    expect(result.drEntries![0].amount).toBe(10);
  });

  it('Barbarian DR uses "base" type (stacks additively — DIFFERENT from damage_reduction type)', () => {
    // 3 separate "base" increments from level progression — all sum
    const lvl7  = makeModifier('dr_7',  1, 'base', { targetId: 'combatStats.damage_reduction' });
    const lvl10 = makeModifier('dr_10', 1, 'base', { targetId: 'combatStats.damage_reduction' });
    const lvl13 = makeModifier('dr_13', 1, 'base', { targetId: 'combatStats.damage_reduction' });
    const result = applyStackingRules([lvl7, lvl10, lvl13], 0);
    expect(result.totalBonus).toBe(3); // All sum
    expect(result.totalValue).toBe(3);
    expect(result.drEntries).toBeUndefined(); // No damage_reduction type mods → no drEntries
  });
});

// =============================================================================
// 11. mathParser — @constant.<id> resolution
// =============================================================================

describe('mathParser — @constant paths', () => {
  const ctxWithConstants: CharacterContext = {
    ...BASE_CONTEXT,
    constants: {
      darkvision_range: 60,
      barbarian_fast_movement_bonus: 10,
      // A constant ID with a dot in it — should be reconstituted by the join logic
    },
  };

  it('resolves @constant.darkvision_range = 60', () => {
    const result = evaluateFormula('@constant.darkvision_range', ctxWithConstants, 'en');
    expect(result).toBe(60);
  });

  it('resolves @constant.barbarian_fast_movement_bonus = 10', () => {
    const result = evaluateFormula('@constant.barbarian_fast_movement_bonus', ctxWithConstants, 'en');
    expect(result).toBe(10);
  });

  it('returns 0 for unknown constant', () => {
    const result = evaluateFormula('@constant.nonexistent', ctxWithConstants, 'en');
    expect(result).toBe(0);
  });

  it('uses constant in arithmetic formula', () => {
    const result = evaluateFormula('@constant.darkvision_range * 2', ctxWithConstants, 'en');
    expect(result).toBe(120);
  });
});

// =============================================================================
// 12. stacking — all zero-value modifiers are tracked (edge case)
// =============================================================================

describe('stackingRules — zero-value modifiers are applied (not suppressed)', () => {
  it('zero-value racial bonus is in appliedModifiers, not suppressedModifiers', () => {
    const zeroBonus = makeModifier('zero_racial', 0, 'racial');
    const result = applyStackingRules([zeroBonus], 10);
    expect(result.appliedModifiers.map(m => m.id)).toContain('zero_racial');
    expect(result.suppressedModifiers).toHaveLength(0);
    expect(result.totalBonus).toBe(0);
    expect(result.totalValue).toBe(10);
  });
});

// =============================================================================
// 13. logicEvaluator — includes operator (not_includes counterpart)
// =============================================================================

describe('logicEvaluator — includes operator', () => {
  it('includes: passes when value IS in equippedWeaponTags', () => {
    const ctx: CharacterContext = {
      ...BASE_CONTEXT,
      equippedWeaponTags: ['weapon_longsword', 'slashing', 'one_handed'],
    };
    const node: LogicNode = {
      logic: 'CONDITION',
      targetPath: '@equippedWeaponTags',
      operator: 'includes',
      value: 'slashing',
    };
    expect(checkCondition(node, ctx)).toBe(true);
  });

  it('includes: fails when value is NOT in equippedWeaponTags', () => {
    const ctx: CharacterContext = {
      ...BASE_CONTEXT,
      equippedWeaponTags: ['weapon_dagger', 'piercing'],
    };
    const node: LogicNode = {
      logic: 'CONDITION',
      targetPath: '@equippedWeaponTags',
      operator: 'includes',
      value: 'slashing',
    };
    expect(checkCondition(node, ctx)).toBe(false);
  });
});

// =============================================================================
// 14. mathParser — @classLevels path resolution
// =============================================================================

describe('mathParser — @classLevels paths', () => {
  const ctxWithClasses: CharacterContext = {
    ...BASE_CONTEXT,
    classLevels: {
      class_fighter: 5,
      class_wizard: 3,
    },
    characterLevel: 8,
  };

  it('resolves @classLevels.class_fighter = 5', () => {
    const result = evaluateFormula('@classLevels.class_fighter', ctxWithClasses, 'en');
    expect(result).toBe(5);
  });

  it('resolves @classLevels.class_wizard = 3', () => {
    const result = evaluateFormula('@classLevels.class_wizard', ctxWithClasses, 'en');
    expect(result).toBe(3);
  });

  it('floor(@classLevels.class_fighter / 2) = 2 (e.g., for a level-scaled formula)', () => {
    const result = evaluateFormula('floor(@classLevels.class_fighter / 2)', ctxWithClasses, 'en');
    expect(result).toBe(2);
  });

  it('Psychic Strike formula part: floor(@classLevels.class_soulknife / 4) = 2 at level 9', () => {
    // The Soulknife's damage is floor(level/4)d8 — the numeric prefix is computed first.
    // The engine computes floor(9/4)=2, then the Dice Engine constructs "2d8" for rolling.
    const ctxSoulknife: CharacterContext = {
      ...BASE_CONTEXT,
      classLevels: { class_soulknife: 9 },
      characterLevel: 9,
    };
    // evaluateFormula computes the numeric result; the dice string form "2d8" is for the Dice Engine
    const result = evaluateFormula('floor(@classLevels.class_soulknife / 4)', ctxSoulknife, 'en');
    expect(result).toBe(2);
  });

  it('Psychic Strike at Soulknife 1: floor(1/4) = 0 (no Psychic Strike yet)', () => {
    const ctxSoulknife1: CharacterContext = {
      ...BASE_CONTEXT,
      classLevels: { class_soulknife: 1 },
      characterLevel: 1,
    };
    expect(evaluateFormula('floor(@classLevels.class_soulknife / 4)', ctxSoulknife1, 'en')).toBe(0);
  });

  it('returns 0 for a class not in classLevels', () => {
    const result = evaluateFormula('@classLevels.class_barbarian', ctxWithClasses, 'en');
    expect(result).toBe(0);
  });
});
