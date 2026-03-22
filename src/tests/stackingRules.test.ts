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
 * DAMAGE REDUCTION (Phase 2.4a — ARCHITECTURE.md section 4.5):
 *   DR uses "best-wins per bypass-tag group", not additive stacking.
 *   Each unique drBypassTags signature is an independent DR entry.
 *   Multiple DR entries coexist (e.g., DR 5/magic AND DR 10/silver).
 *
 * @see src/lib/utils/stackingRules.ts
 * @see ARCHITECTURE.md section 4.5 — Damage Reduction
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

// ============================================================
// DAMAGE REDUCTION — Phase 2.4a (ARCHITECTURE.md section 4.5)
//
//   DR uses BEST-WINS PER BYPASS GROUP, not additive stacking.
//   Each unique drBypassTags signature = one independent DREntry.
//   Within a group: only the highest value applies.
// ============================================================

/**
 * Helper to build a DR modifier (type: "damage_reduction").
 */
function makeDR(id: string, value: number, bypassTags: string[]): Modifier {
  return {
    id,
    sourceId: `source_${id}`,
    sourceName: { en: id },
    targetId: 'combatStats.damage_reduction',
    value,
    type: 'damage_reduction',
    drBypassTags: bypassTags,
  };
}

// -------------------------------------------------------
// SECTION A: Single DR entry (basic cases)
// -------------------------------------------------------

describe('DR — single entry, various bypass types', () => {
  /**
   * Vampire: DR 10/magic — hardest single bypass to satisfy.
   * Only a +1 or better magic weapon bypasses it.
   */
  it('DR 10/magic: one entry with bypassTags ["magic"]', () => {
    const result = applyStackingRules([makeDR('dr_vampire', 10, ['magic'])], 0);
    expect(result.drEntries).toHaveLength(1);
    expect(result.drEntries![0].amount).toBe(10);
    expect(result.drEntries![0].bypassTags).toEqual(['magic']);
  });

  /**
   * Lycanthrope: DR 10/silver — only silver weapons bypass.
   */
  it('DR 10/silver: one entry with bypassTags ["silver"]', () => {
    const result = applyStackingRules([makeDR('dr_lycan', 10, ['silver'])], 0);
    expect(result.drEntries).toHaveLength(1);
    expect(result.drEntries![0].amount).toBe(10);
    expect(result.drEntries![0].bypassTags).toEqual(['silver']);
  });

  /**
   * Barbarian 20: DR 5/— — overcome by nothing at all.
   * Empty bypass array = "DR X/—".
   */
  it('DR 5/—: empty bypass array means nothing bypasses', () => {
    const result = applyStackingRules([makeDR('dr_nothing', 5, [])], 0);
    expect(result.drEntries).toHaveLength(1);
    expect(result.drEntries![0].amount).toBe(5);
    expect(result.drEntries![0].bypassTags).toEqual([]);
  });

  /**
   * Good-aligned outsider: DR 10/good.
   */
  it('DR 10/good: bypassTags ["good"]', () => {
    const result = applyStackingRules([makeDR('dr_good', 10, ['good'])], 0);
    expect(result.drEntries![0].bypassTags).toEqual(['good']);
  });

  /**
   * Demon / fey: DR 10/cold iron.
   */
  it('DR 10/cold iron: bypassTags ["cold_iron"]', () => {
    const result = applyStackingRules([makeDR('dr_cold_iron', 10, ['cold_iron'])], 0);
    expect(result.drEntries![0].bypassTags).toEqual(['cold_iron']);
  });

  /**
   * Epic monster: DR 10/epic.
   */
  it('DR 10/epic: bypassTags ["epic"]', () => {
    const result = applyStackingRules([makeDR('dr_epic', 10, ['epic'])], 0);
    expect(result.drEntries![0].bypassTags).toEqual(['epic']);
  });
});

// -------------------------------------------------------
// SECTION B: Best-wins within the same bypass group
// -------------------------------------------------------

describe('DR — best-wins within same bypass group (ARCHITECTURE.md §4.5)', () => {
  /**
   * CANONICAL SCENARIO:
   *   A creature has two sources of DR/magic (e.g., from two different class features
   *   or a racial template + a spell effect), with different amounts.
   *   Only the HIGHEST value applies per group.
   *
   *   DR 5/magic (source A) + DR 10/magic (source B) → DR 10/magic wins.
   *   source A is suppressed.
   */
  it('two DR/magic: 5 and 10 → only 10 applies; 5 is suppressed', () => {
    const modA = makeDR('dr_magic_5', 5,  ['magic']);
    const modB = makeDR('dr_magic_10', 10, ['magic']);

    const result = applyStackingRules([modA, modB], 0);

    expect(result.drEntries).toHaveLength(1);
    expect(result.drEntries![0].amount).toBe(10);
    expect(result.drEntries![0].sourceModifier.id).toBe('dr_magic_10');
    expect(result.drEntries![0].suppressedModifiers).toHaveLength(1);
    expect(result.drEntries![0].suppressedModifiers[0].id).toBe('dr_magic_5');
  });

  it('three DR/silver: 3, 7, 5 → only 7 applies; 3 and 5 suppressed', () => {
    const result = applyStackingRules([
      makeDR('dr_s3', 3, ['silver']),
      makeDR('dr_s7', 7, ['silver']),
      makeDR('dr_s5', 5, ['silver']),
    ], 0);

    expect(result.drEntries).toHaveLength(1);
    expect(result.drEntries![0].amount).toBe(7);
    expect(result.drEntries![0].suppressedModifiers).toHaveLength(2);
  });

  it('two DR/—: 2 and 5 → only 5 applies (best wins even for empty bypass)', () => {
    const result = applyStackingRules([
      makeDR('dr_nothing_2', 2, []),
      makeDR('dr_nothing_5', 5, []),
    ], 0);

    expect(result.drEntries).toHaveLength(1);
    expect(result.drEntries![0].amount).toBe(5);
    expect(result.drEntries![0].bypassTags).toEqual([]);
  });

  it('identical DR values: one applied, other suppressed (not double-counted)', () => {
    const result = applyStackingRules([
      makeDR('dr_m_a', 10, ['magic']),
      makeDR('dr_m_b', 10, ['magic']),
    ], 0);

    expect(result.drEntries).toHaveLength(1);
    expect(result.drEntries![0].amount).toBe(10);
    // One applied, one suppressed (tie → first wins by reduce)
    expect(result.drEntries![0].suppressedModifiers).toHaveLength(1);
  });
});

// -------------------------------------------------------
// SECTION C: Multiple independent DR entries (different bypass groups)
// -------------------------------------------------------

describe('DR — multiple independent bypass groups (ARCHITECTURE.md §4.5)', () => {
  /**
   * D&D 3.5 SRD rule: "A creature does not get a better DR by combining both its
   * DR 5/magic and its DR 10/silver — it simply has both."
   * Two different bypass groups → two separate DREntry items in drEntries.
   *
   * CANONICAL SCENARIO: Werewolf (DR 10/silver) + Spell effect (DR 5/magic)
   *   → DR 10/silver coexists with DR 5/magic as two independent entries.
   */
  it('DR 10/silver AND DR 5/magic coexist as two independent entries', () => {
    const result = applyStackingRules([
      makeDR('dr_silver', 10, ['silver']),
      makeDR('dr_magic',  5,  ['magic']),
    ], 0);

    expect(result.drEntries).toHaveLength(2);

    const magicEntry = result.drEntries!.find(e => e.bypassTags.includes('magic'));
    const silverEntry = result.drEntries!.find(e => e.bypassTags.includes('silver'));
    expect(magicEntry?.amount).toBe(5);
    expect(silverEntry?.amount).toBe(10);
  });

  it('DR 5/magic, DR 10/silver, DR 15/—: three independent entries', () => {
    const result = applyStackingRules([
      makeDR('dr_m',   5,  ['magic']),
      makeDR('dr_s',   10, ['silver']),
      makeDR('dr_n',   15, []),
    ], 0);

    expect(result.drEntries).toHaveLength(3);
    // Use numeric sort (not default lexicographic) to avoid [10, 15, 5] ordering
    expect(result.drEntries!.map(e => e.amount).sort((a, b) => a - b)).toEqual([5, 10, 15]);
  });

  /**
   * Best-wins within each group, independence between groups:
   *   DR 5/magic + DR 10/magic (→ only DR 10/magic) + DR 5/silver (keeps)
   *   = DR 10/magic AND DR 5/silver as two entries
   */
  it('best-wins within group, independence between groups combined', () => {
    const result = applyStackingRules([
      makeDR('dr_m5',  5,  ['magic']),
      makeDR('dr_m10', 10, ['magic']),
      makeDR('dr_s5',  5,  ['silver']),
    ], 0);

    expect(result.drEntries).toHaveLength(2); // magic group + silver group
    const magicEntry  = result.drEntries!.find(e => e.bypassTags.includes('magic'));
    const silverEntry = result.drEntries!.find(e => e.bypassTags.includes('silver'));
    expect(magicEntry?.amount).toBe(10);   // best DR/magic wins
    expect(silverEntry?.amount).toBe(5);   // only one DR/silver, kept as-is
  });
});

// -------------------------------------------------------
// SECTION D: AND-bypass (multi-tag bypass group)
// -------------------------------------------------------

describe('DR — AND bypass (multiple tags in drBypassTags)', () => {
  /**
   * Extremely rare: a weapon MUST be BOTH magic AND silver to bypass the DR.
   * ["magic","silver"] and ["silver","magic"] must be the same group.
   */
  it('AND bypass: ["magic","silver"] treated as one group regardless of order', () => {
    const modA = makeDR('dr_ms_a', 10, ['magic', 'silver']);
    const modB = makeDR('dr_ms_b', 5,  ['silver', 'magic']); // Same bypass, different order
    const modC = makeDR('dr_ms_c', 15, ['magic', 'silver']);

    const result = applyStackingRules([modA, modB, modC], 0);

    // All three share the same canonical bypass group → one entry wins
    expect(result.drEntries).toHaveLength(1);
    expect(result.drEntries![0].amount).toBe(15);
    expect(result.drEntries![0].bypassTags).toEqual(['magic', 'silver']); // sorted
  });

  it('AND bypass distinct from single-tag bypass (["magic","silver"] ≠ ["magic"])', () => {
    const result = applyStackingRules([
      makeDR('dr_magic_only',  10, ['magic']),
      makeDR('dr_magic_silver', 5, ['magic', 'silver']),
    ], 0);

    // Two different groups → two entries
    expect(result.drEntries).toHaveLength(2);
    const magicOnly   = result.drEntries!.find(e => e.bypassTags.length === 1 && e.bypassTags.includes('magic'));
    const magicSilver = result.drEntries!.find(e => e.bypassTags.length === 2);
    expect(magicOnly?.amount).toBe(10);
    expect(magicSilver?.amount).toBe(5);
  });
});

// -------------------------------------------------------
// SECTION E: DR does not pollute totalBonus
// -------------------------------------------------------

describe('DR — does not affect totalBonus or totalValue', () => {
  /**
   * ARCHITECTURE.md §4.5: "damage_reduction" modifiers are separated from the
   * regular stacking pass. They must NOT contribute to totalBonus.
   */
  it('DR modifiers: totalBonus remains 0 when only DR modifiers present', () => {
    const result = applyStackingRules([
      makeDR('dr_magic', 10, ['magic']),
      makeDR('dr_silver', 5, ['silver']),
    ], 0);

    expect(result.totalBonus).toBe(0);
    expect(result.totalValue).toBe(0);
  });

  it('DR modifiers: mixed with regular modifiers — regular stacking unaffected', () => {
    // DR should not bleed into the regular modifier pipeline
    const result = applyStackingRules([
      makeModifier('enh', 4, 'enhancement'),       // +4 enhancement to some stat
      makeDR('dr_magic', 10, ['magic']),            // DR 10/magic — should be isolated
    ], 5); // baseValue = 5

    expect(result.totalBonus).toBe(4);              // Only enhancement
    expect(result.totalValue).toBe(9);              // 5 + 4
    expect(result.drEntries).toHaveLength(1);       // DR entry separately
    expect(result.drEntries![0].amount).toBe(10);
  });

  it('no DR modifiers: drEntries is undefined (absent)', () => {
    const result = applyStackingRules([
      makeModifier('enhancement_only', 3, 'enhancement'),
    ], 0);
    expect(result.drEntries).toBeUndefined();
  });
});

// -------------------------------------------------------
// SECTION F: DR breakdown tracked in appliedModifiers / suppressedModifiers
// -------------------------------------------------------

describe('DR — applied and suppressed modifiers tracked correctly', () => {
  it('winning DR modifier appears in appliedModifiers', () => {
    const winner = makeDR('dr_winner', 10, ['magic']);
    const loser  = makeDR('dr_loser',   5, ['magic']);

    const result = applyStackingRules([winner, loser], 0);

    const appliedIds = result.appliedModifiers.map(m => m.id);
    expect(appliedIds).toContain('dr_winner');
    expect(appliedIds).not.toContain('dr_loser');
  });

  it('suppressed DR modifier appears in suppressedModifiers', () => {
    const winner = makeDR('dr_winner', 10, ['magic']);
    const loser  = makeDR('dr_loser',   5, ['magic']);

    const result = applyStackingRules([winner, loser], 0);

    const suppressedIds = result.suppressedModifiers.map(m => m.id);
    expect(suppressedIds).toContain('dr_loser');
    expect(suppressedIds).not.toContain('dr_winner');
  });

  it('independent DR entries both appear in appliedModifiers', () => {
    const magicDR  = makeDR('dr_magic',  10, ['magic']);
    const silverDR = makeDR('dr_silver',  5, ['silver']);

    const result = applyStackingRules([magicDR, silverDR], 0);

    const appliedIds = result.appliedModifiers.map(m => m.id);
    expect(appliedIds).toContain('dr_magic');
    expect(appliedIds).toContain('dr_silver');
  });
});

// -------------------------------------------------------
// SECTION G: Barbarian DR authoring pattern
// -------------------------------------------------------

describe('DR — Barbarian class-progression DR (type: "base" pattern)', () => {
  /**
   * ARCHITECTURE.md §4.5: Barbarian DR/— is gained incrementally via class levels.
   * Each milestone adds +1 DR via type: "base" (always stacks).
   * These are NOT "damage_reduction" type — they use "base" for additive accumulation.
   * They are separate from innate racial DR.
   *
   * Barbarian DR increments: +1 at level 7, +1 at 10, +1 at 13, +1 at 16, +1 at 20.
   * So a level 20 Barbarian has base DR = 5.
   */
  it('Barbarian DR/— via "base" type: all increments ADD UP (=5 for 4 increments active here)', () => {
    const mods: Modifier[] = [
      { id: 'dr_barb_1', sourceId: 's', sourceName: { en: 'Barbarian DR' }, targetId: 'combatStats.damage_reduction', value: 1, type: 'base' },
      { id: 'dr_barb_2', sourceId: 's', sourceName: { en: 'Barbarian DR' }, targetId: 'combatStats.damage_reduction', value: 1, type: 'base' },
      { id: 'dr_barb_3', sourceId: 's', sourceName: { en: 'Barbarian DR' }, targetId: 'combatStats.damage_reduction', value: 1, type: 'base' },
      { id: 'dr_barb_4', sourceId: 's', sourceName: { en: 'Barbarian DR' }, targetId: 'combatStats.damage_reduction', value: 1, type: 'base' },
    ];

    const result = applyStackingRules(mods, 0);

    // "base" always stacks: 1+1+1+1 = 4
    expect(result.totalBonus).toBe(4);
    expect(result.totalValue).toBe(4);
    // No "damage_reduction" type modifiers → no drEntries
    expect(result.drEntries).toBeUndefined();
  });

  it('Barbarian with racial DR: additive base + best-wins racial coexist independently', () => {
    /**
     * Edge case: A Half-Troll Barbarian 10 has:
     *   - 2 Barbarian DR increments (type: "base", each +1) → DR 2/— additive
     *   - Half-Troll racial DR 5/fire (type: "damage_reduction") → best-wins
     *
     * The base DR and the racial DR entry are completely independent.
     * The UI should display "DR 2/— (class) + DR 5/fire (race)".
     */
    const mods: Modifier[] = [
      { id: 'barb_dr_1', sourceId: 's', sourceName: { en: 'Barbarian DR' }, targetId: 'combatStats.damage_reduction', value: 1, type: 'base' },
      { id: 'barb_dr_2', sourceId: 's', sourceName: { en: 'Barbarian DR' }, targetId: 'combatStats.damage_reduction', value: 1, type: 'base' },
      makeDR('troll_dr_fire', 5, ['fire']),
    ];

    const result = applyStackingRules(mods, 0);

    // Base additive DR from Barbarian levels
    expect(result.totalBonus).toBe(2);
    expect(result.totalValue).toBe(2);

    // Independent racial DR entry
    expect(result.drEntries).toHaveLength(1);
    expect(result.drEntries![0].amount).toBe(5);
    expect(result.drEntries![0].bypassTags).toEqual(['fire']);
  });
});
