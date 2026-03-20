/**
 * @file src/tests/stackingRules.test.ts
 * @description Vitest unit tests for the Stacking Rules engine.
 *
 * Tests the golden rule of D&D 3.5:
 *   "Bonuses of the same type do not stack; only the highest applies.
 *    Exceptions: dodge, circumstance, synergy, and untyped bonuses ALL stack."
 *
 * ARCHITECTURE.md Example D:
 *   Ring of Protection +2 (deflection) + Shield of Faith +3 (deflection) + Dodge +1 + Haste +1
 *   → deflection: max(2,3) = 3
 *   → dodge: 1 + 1 = 2 (stacks)
 *   → TOTAL: 5 (not 7)
 *
 * ARCHITECTURE.md Phase 17.3 scenario:
 *   +2 enhancement, +4 enhancement, +1 dodge, +1 dodge, +2 deflection
 *   → Takes highest enhancement (4) + stacks both dodges (2) + deflection (2) = 8
 *
 * @see src/lib/utils/stackingRules.ts
 * @see ARCHITECTURE.md section 10 Example D
 * @see ARCHITECTURE.md Phase 17.3
 */

import { describe, it, expect } from 'vitest';
import { applyStackingRules, computeDerivedModifier } from '$lib/utils/stackingRules';
import type { Modifier } from '$lib/types/pipeline';

// ============================================================
// HELPER: Create minimal Modifier objects for testing
// ============================================================

function makeModifier(id: string, value: number, type: string): Modifier {
  return {
    id,
    sourceId: `source_${id}`,
    sourceName: { en: id },
    targetId: 'test_pipeline',
    value,
    type: type as import('$lib/types/primitives').ModifierType,
  };
}

// ============================================================
// PHASE 17.3 SCENARIO TEST (from checklist)
// ============================================================

describe('Phase 17.3 scenario: +2 enhancement, +4 enhancement, +1 dodge, +1 dodge, +2 deflection', () => {
  it('total equals +8 (highest enhancement + stacked dodges + deflection)', () => {
    const modifiers: Modifier[] = [
      makeModifier('enh_1', 2, 'enhancement'),     // +2 enhancement
      makeModifier('enh_2', 4, 'enhancement'),     // +4 enhancement (wins)
      makeModifier('dodge_1', 1, 'dodge'),          // +1 dodge (stacks)
      makeModifier('dodge_2', 1, 'dodge'),          // +1 dodge (stacks)
      makeModifier('deflect_1', 2, 'deflection'),  // +2 deflection
    ];

    const result = applyStackingRules(modifiers, 0);

    expect(result.totalBonus).toBe(8);
    // enhancement: max(2,4) = 4
    // dodge: 1+1 = 2 (stacks)
    // deflection: 2
    // total bonus: 4 + 2 + 2 = 8
  });

  it('applied modifiers include the highest enhancement only', () => {
    const modifiers: Modifier[] = [
      makeModifier('enh_1', 2, 'enhancement'),
      makeModifier('enh_2', 4, 'enhancement'),
      makeModifier('dodge_1', 1, 'dodge'),
      makeModifier('dodge_2', 1, 'dodge'),
      makeModifier('deflect_1', 2, 'deflection'),
    ];

    const result = applyStackingRules(modifiers, 0);

    const appliedIds = result.appliedModifiers.map(m => m.id);
    expect(appliedIds).not.toContain('enh_1');  // Lower enhancement is suppressed
    expect(appliedIds).toContain('enh_2');       // Higher enhancement applied
    expect(appliedIds).toContain('dodge_1');
    expect(appliedIds).toContain('dodge_2');
    expect(appliedIds).toContain('deflect_1');
  });
});

// ============================================================
// ALL 4 ALWAYS-STACKING TYPES
// ============================================================

describe('stackingRules — dodge bonuses always stack', () => {
  it('two +1 dodge bonuses = +2 total', () => {
    const result = applyStackingRules([
      makeModifier('d1', 1, 'dodge'),
      makeModifier('d2', 1, 'dodge'),
    ], 0);
    expect(result.totalBonus).toBe(2);
  });

  it('three dodge bonuses (+1, +2, +1) = +4 total', () => {
    const result = applyStackingRules([
      makeModifier('d1', 1, 'dodge'),
      makeModifier('d2', 2, 'dodge'),
      makeModifier('d3', 1, 'dodge'),
    ], 0);
    expect(result.totalBonus).toBe(4);
  });
});

describe('stackingRules — circumstance bonuses always stack', () => {
  it('two circumstance bonuses (+2, +1) = +3 total', () => {
    const result = applyStackingRules([
      makeModifier('c1', 2, 'circumstance'),
      makeModifier('c2', 1, 'circumstance'),
    ], 0);
    expect(result.totalBonus).toBe(3);
  });
});

describe('stackingRules — synergy bonuses always stack', () => {
  it('two synergy bonuses (+2, +2) = +4 total', () => {
    const result = applyStackingRules([
      makeModifier('s1', 2, 'synergy'),
      makeModifier('s2', 2, 'synergy'),
    ], 0);
    expect(result.totalBonus).toBe(4);
  });
});

describe('stackingRules — untyped bonuses always stack', () => {
  it('two untyped bonuses (+1, +3) = +4 total', () => {
    const result = applyStackingRules([
      makeModifier('u1', 1, 'untyped'),
      makeModifier('u2', 3, 'untyped'),
    ], 0);
    expect(result.totalBonus).toBe(4);
  });
});

// ============================================================
// NON-STACKING TYPES (take highest)
// ============================================================

describe('stackingRules — typed bonuses (non-stacking)', () => {
  it('two enhancement bonuses: takes highest (+2, +4) = +4', () => {
    const result = applyStackingRules([
      makeModifier('e1', 2, 'enhancement'),
      makeModifier('e2', 4, 'enhancement'),
    ], 0);
    expect(result.totalBonus).toBe(4);
  });

  it('two morale bonuses: takes highest (+3, +5) = +5', () => {
    const result = applyStackingRules([
      makeModifier('m1', 3, 'morale'),
      makeModifier('m2', 5, 'morale'),
    ], 0);
    expect(result.totalBonus).toBe(5);
  });

  it('two deflection bonuses: takes highest (+2, +3) = +3', () => {
    const result = applyStackingRules([
      makeModifier('d1', 2, 'deflection'),
      makeModifier('d2', 3, 'deflection'),
    ], 0);
    expect(result.totalBonus).toBe(3);
  });

  it('two racial bonuses: takes highest (+2, +4) = +4', () => {
    const result = applyStackingRules([
      makeModifier('r1', 2, 'racial'),
      makeModifier('r2', 4, 'racial'),
    ], 0);
    expect(result.totalBonus).toBe(4);
  });
});

// ============================================================
// NEGATIVE MODIFIERS (PENALTIES)
// ============================================================

describe('stackingRules — negative modifiers (penalties)', () => {
  it('armor check penalty accumulates (base type stacks)', () => {
    // Armor Check Penalty uses type "base" which stacks
    const result = applyStackingRules([
      makeModifier('acp_1', -6, 'base'),
      makeModifier('acp_2', -3, 'base'),
    ], 0);
    expect(result.totalBonus).toBe(-9);  // -6 + -3 = -9 (base stacks)
  });

  it('mix of positive enhancement and negative untyped penalty', () => {
    const result = applyStackingRules([
      makeModifier('e', 4, 'enhancement'),   // +4 enhancement
      makeModifier('p', -2, 'untyped'),      // -2 untyped penalty
    ], 0);
    expect(result.totalBonus).toBe(2);  // 4 + (-2) = 2
  });
});

// ============================================================
// setAbsolute (overrides everything)
// ============================================================

describe('stackingRules — setAbsolute modifier', () => {
  it('setAbsolute overrides all other bonuses (Monk unarmed damage)', () => {
    const result = applyStackingRules([
      makeModifier('base', 2, 'enhancement'),
      makeModifier('race', 1, 'racial'),
      makeModifier('abs', 8, 'setAbsolute'),  // Forces totalValue to 8
    ], 5);  // baseValue = 5

    // setAbsolute sets totalValue directly = 8, ignoring other modifiers
    expect(result.totalValue).toBe(8);
  });

  it('last setAbsolute wins when multiple are present', () => {
    const result = applyStackingRules([
      makeModifier('abs1', 6, 'setAbsolute'),
      makeModifier('abs2', 10, 'setAbsolute'),  // Last one wins
    ], 5);

    expect(result.totalValue).toBe(10);
  });
});

// ============================================================
// BASE VALUE INTERACTION
// ============================================================

describe('stackingRules — base value interaction', () => {
  it('totalValue = baseValue + totalBonus', () => {
    const result = applyStackingRules([
      makeModifier('e', 3, 'enhancement'),
    ], 10);  // STR base 10

    expect(result.totalValue).toBe(13);  // 10 + 3
  });

  it('empty modifiers: totalValue = baseValue', () => {
    const result = applyStackingRules([], 15);
    expect(result.totalValue).toBe(15);
    expect(result.totalBonus).toBe(0);
  });
});

// ============================================================
// ARCHITECTURE.MD EXAMPLE D
// ============================================================

describe('ARCHITECTURE.md Example D: Ring (+2 deflect) + Shield of Faith (+3 deflect) + Dodge (+1) + Haste (+1)', () => {
  it('total = 5 (not 7), deflection 3 + dodge 2', () => {
    const modifiers: Modifier[] = [
      makeModifier('ring', 2, 'deflection'),     // Ring of Protection
      makeModifier('sof', 3, 'deflection'),      // Shield of Faith (higher, wins)
      makeModifier('dodge_feat', 1, 'dodge'),    // Dodge feat
      makeModifier('haste', 1, 'dodge'),         // Haste (stacks with Dodge)
    ];

    const result = applyStackingRules(modifiers, 0);
    expect(result.totalBonus).toBe(5);  // max(2,3) + 1 + 1 = 5
  });
});

// ============================================================
// computeDerivedModifier (floor((totalValue - 10) / 2))
// ============================================================

describe('computeDerivedModifier', () => {
  it('STR 10 → modifier 0', () => expect(computeDerivedModifier(10)).toBe(0));
  it('STR 18 → modifier +4', () => expect(computeDerivedModifier(18)).toBe(4));
  it('STR 7 → modifier -2', () => expect(computeDerivedModifier(7)).toBe(-2));
  it('STR 1 → modifier -5', () => expect(computeDerivedModifier(1)).toBe(-5));
  it('STR 20 → modifier +5', () => expect(computeDerivedModifier(20)).toBe(5));
});
