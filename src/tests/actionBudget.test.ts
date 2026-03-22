/**
 * @file src/tests/actionBudget.test.ts
 * @description Vitest unit tests for the Feature.actionBudget field.
 *
 * WHAT IS TESTED (Phase 1.3c — ARCHITECTURE.md section 5.6):
 *
 *   1. TYPE SOUNDNESS — `actionBudget` is optional on Feature; all six keys optional.
 *
 *   2. CONDITION CANONICAL PATTERNS — the 12 SRD conditions from section 5.6:
 *      - Normal (no actionBudget): unrestricted
 *      - Staggered: { standard: 1, move: 1, full_round: 0 }
 *      - Disabled: same as Staggered
 *      - Nauseated: { standard: 0, move: 1, full_round: 0 }
 *      - Stunned: { standard: 0, move: 0, full_round: 0 }
 *      - Cowering / Dazed / Paralyzed / Fascinated / Dying / Unconscious / Dead: all zero
 *
 *   3. EFFECTIVE BUDGET RESOLUTION — `computeEffectiveBudget(features[])`:
 *      Pure function that mirrors the Combat UI's "minimum wins" algorithm.
 *      - Single active feature: effective budget = that feature's budget.
 *      - Multiple features: per category, take minimum.
 *      - Absent key = unlimited (Infinity): never restricts.
 *      - Empty `actionBudget: {}` = unlimited (all absent).
 *
 *   4. XOR MUTUAL EXCLUSION — Staggered "standard OR move not both":
 *      - `"action_budget_xor"` tag is present on Staggered/Disabled.
 *      - `hasActionBudgetXor(feature)` helper detects the tag.
 *      - XOR logic: once standard spent → block move, and vice versa.
 *
 *   5. COMBINED CONDITIONS:
 *      - Staggered + Nauseated → effective budget is Nauseated's (more restrictive).
 *      - Stunned + anything → all zeros (Stunned is maximally restrictive).
 *      - Normal features (no actionBudget) do not restrict anything.
 *
 *   6. NON-CONDITION FEATURES — actionBudget is absent on weapons, classes, feats.
 *
 * @see src/lib/types/feature.ts — Feature.actionBudget
 * @see ARCHITECTURE.md section 5.6 — actionBudget full reference
 * @see SRD: /srd/conditionSummary.html
 */

import { describe, it, expect } from 'vitest';
import type { Feature } from '$lib/types/feature';

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Minimal Feature shape for testing. Sets only required fields.
 */
function makeFeature(id: string, overrides: Partial<Feature> = {}): Feature {
  return {
    id,
    category: 'condition',
    ruleSource: 'srd_core',
    label: { en: id },
    description: { en: `Test: ${id}` },
    tags: ['condition', id],
    grantedModifiers: [],
    grantedFeatures: [],
    ...overrides,
  };
}

/**
 * Mirrors the Combat UI's effective budget computation (ARCHITECTURE.md §5.6):
 *   For each category, take MIN of all active budgets (absent = Infinity = unlimited).
 *
 * Returns the resolved budget per category. `undefined` means "unlimited" for that key.
 */
function computeEffectiveBudget(features: Feature[]): {
  standard: number;
  move: number;
  swift: number;
  immediate: number;
  free: number;
  full_round: number;
} {
  const UNLIMITED = Infinity;
  let standard   = UNLIMITED;
  let move       = UNLIMITED;
  let swift      = UNLIMITED;
  let immediate  = UNLIMITED;
  let free       = UNLIMITED;
  let full_round = UNLIMITED;

  for (const f of features) {
    const b = f.actionBudget;
    if (!b) continue; // No budget on this feature = no restriction
    if (b.standard   !== undefined) standard   = Math.min(standard,   b.standard);
    if (b.move       !== undefined) move       = Math.min(move,       b.move);
    if (b.swift      !== undefined) swift      = Math.min(swift,      b.swift);
    if (b.immediate  !== undefined) immediate  = Math.min(immediate,  b.immediate);
    if (b.free       !== undefined) free       = Math.min(free,       b.free);
    if (b.full_round !== undefined) full_round = Math.min(full_round, b.full_round);
  }

  return {
    standard:   standard   === UNLIMITED ? UNLIMITED : standard,
    move:       move       === UNLIMITED ? UNLIMITED : move,
    swift:      swift      === UNLIMITED ? UNLIMITED : swift,
    immediate:  immediate  === UNLIMITED ? UNLIMITED : immediate,
    free:       free       === UNLIMITED ? UNLIMITED : free,
    full_round: full_round === UNLIMITED ? UNLIMITED : full_round,
  };
}

/** Returns true if the feature carries the action_budget_xor tag (Staggered/Disabled). */
function hasActionBudgetXor(feature: Feature): boolean {
  return feature.tags.includes('action_budget_xor');
}

/**
 * Simulates the XOR logic for Staggered/Disabled:
 * Given a spent action type, returns the set of newly blocked action types.
 * "standard OR move, not both" — once one is spent, the other is blocked.
 */
function getXorBlockedActions(spentActionType: 'standard' | 'move'): Array<'standard' | 'move'> {
  if (spentActionType === 'standard') return ['move'];
  if (spentActionType === 'move') return ['standard'];
  return [];
}

// =============================================================================
// SRD CONDITION FACTORIES
// =============================================================================

/** Normal (no restriction) */
const conditionNormal = makeFeature('condition_normal', {
  category: 'condition',
  tags: ['condition'],
  // actionBudget intentionally absent
});

/** Staggered: { standard: 1, move: 1, full_round: 0 }, XOR tag */
const conditionStaggered = makeFeature('condition_staggered', {
  tags: ['condition', 'condition_staggered', 'action_budget_xor'],
  actionBudget: { standard: 1, move: 1, full_round: 0 },
});

/** Disabled: same pattern as Staggered */
const conditionDisabled = makeFeature('condition_disabled', {
  tags: ['condition', 'condition_disabled', 'action_budget_xor'],
  actionBudget: { standard: 1, move: 1, full_round: 0 },
});

/** Nauseated: { standard: 0, move: 1, full_round: 0 } */
const conditionNauseated = makeFeature('condition_nauseated', {
  tags: ['condition', 'condition_nauseated'],
  actionBudget: { standard: 0, move: 1, full_round: 0 },
});

/** Stunned: { standard: 0, move: 0, full_round: 0 } */
const conditionStunned = makeFeature('condition_stunned', {
  tags: ['condition', 'condition_stunned'],
  actionBudget: { standard: 0, move: 0, full_round: 0 },
});

/** Cowering: { standard: 0, move: 0, full_round: 0 } */
const conditionCowering = makeFeature('condition_cowering', {
  tags: ['condition', 'condition_cowering'],
  actionBudget: { standard: 0, move: 0, full_round: 0 },
});

/** Dazed: { standard: 0, move: 0, full_round: 0 } */
const conditionDazed = makeFeature('condition_dazed', {
  tags: ['condition', 'condition_dazed'],
  actionBudget: { standard: 0, move: 0, full_round: 0 },
});

/** Paralyzed: { standard: 0, move: 0, full_round: 0 } (mental actions still possible) */
const conditionParalyzed = makeFeature('condition_paralyzed', {
  tags: ['condition', 'condition_paralyzed'],
  actionBudget: { standard: 0, move: 0, full_round: 0 },
});

/** Fascinated: { standard: 0, move: 0, full_round: 0 } */
const conditionFascinated = makeFeature('condition_fascinated', {
  tags: ['condition', 'condition_fascinated'],
  actionBudget: { standard: 0, move: 0, full_round: 0 },
});

/** Dying: { standard: 0, move: 0, full_round: 0 } */
const conditionDying = makeFeature('condition_dying', {
  tags: ['condition', 'condition_dying'],
  actionBudget: { standard: 0, move: 0, full_round: 0 },
});

/** Unconscious: { standard: 0, move: 0, full_round: 0 } */
const conditionUnconscious = makeFeature('condition_unconscious', {
  tags: ['condition', 'condition_unconscious'],
  actionBudget: { standard: 0, move: 0, full_round: 0 },
});

/** Dead: { standard: 0, move: 0, full_round: 0 } */
const conditionDead = makeFeature('condition_dead', {
  tags: ['condition', 'condition_dead'],
  actionBudget: { standard: 0, move: 0, full_round: 0 },
});

// =============================================================================
// SECTION 1: Type soundness
// =============================================================================

describe('Feature.actionBudget — type soundness (Phase 1.3c)', () => {
  it('actionBudget is optional — features without it compile fine', () => {
    const f: Feature = makeFeature('class_fighter', {
      category: 'class', tags: ['class', 'class_fighter'],
      // actionBudget intentionally absent
    });
    expect(f.actionBudget).toBeUndefined();
  });

  it('actionBudget with all six keys — compiles and stores correctly', () => {
    const f: Feature = makeFeature('test_all_keys', {
      actionBudget: {
        standard: 1,
        move: 0,
        swift: 1,
        immediate: 0,
        free: 3,
        full_round: 0,
      },
    });
    expect(f.actionBudget!.standard).toBe(1);
    expect(f.actionBudget!.move).toBe(0);
    expect(f.actionBudget!.swift).toBe(1);
    expect(f.actionBudget!.immediate).toBe(0);
    expect(f.actionBudget!.free).toBe(3);
    expect(f.actionBudget!.full_round).toBe(0);
  });

  it('actionBudget with only some keys — undefined for absent keys', () => {
    const f: Feature = makeFeature('test_partial', {
      actionBudget: { standard: 0, move: 1 },
    });
    expect(f.actionBudget!.standard).toBe(0);
    expect(f.actionBudget!.move).toBe(1);
    expect(f.actionBudget!.full_round).toBeUndefined();
    expect(f.actionBudget!.swift).toBeUndefined();
  });

  it('empty actionBudget: {} — valid, all keys undefined', () => {
    const f: Feature = makeFeature('test_empty', { actionBudget: {} });
    expect(f.actionBudget).toBeDefined();
    expect(f.actionBudget!.standard).toBeUndefined();
    expect(f.actionBudget!.move).toBeUndefined();
  });
});

// =============================================================================
// SECTION 2: SRD canonical condition patterns (ARCHITECTURE.md section 5.6)
// =============================================================================

describe('SRD canonical conditions — actionBudget patterns (ARCHITECTURE.md §5.6)', () => {
  it('Normal: no actionBudget — no restriction', () => {
    expect(conditionNormal.actionBudget).toBeUndefined();
  });

  it('Staggered: { standard: 1, move: 1, full_round: 0 }', () => {
    expect(conditionStaggered.actionBudget).toEqual({ standard: 1, move: 1, full_round: 0 });
  });

  it('Disabled: same pattern as Staggered (same SRD rule)', () => {
    expect(conditionDisabled.actionBudget).toEqual({ standard: 1, move: 1, full_round: 0 });
  });

  it('Nauseated: { standard: 0, move: 1, full_round: 0 } — only move action', () => {
    expect(conditionNauseated.actionBudget).toEqual({ standard: 0, move: 1, full_round: 0 });
    // Standard blocked
    expect(conditionNauseated.actionBudget!.standard).toBe(0);
    // Move allowed (once)
    expect(conditionNauseated.actionBudget!.move).toBe(1);
    // Full-round blocked
    expect(conditionNauseated.actionBudget!.full_round).toBe(0);
  });

  it('Stunned: { standard: 0, move: 0, full_round: 0 } — no physical actions', () => {
    expect(conditionStunned.actionBudget!.standard).toBe(0);
    expect(conditionStunned.actionBudget!.move).toBe(0);
    expect(conditionStunned.actionBudget!.full_round).toBe(0);
  });

  it('Cowering: all zeros — no actions', () => {
    expect(conditionCowering.actionBudget!.standard).toBe(0);
    expect(conditionCowering.actionBudget!.move).toBe(0);
    expect(conditionCowering.actionBudget!.full_round).toBe(0);
  });

  it('Dazed: all zeros — no actions', () => {
    expect(conditionDazed.actionBudget!.standard).toBe(0);
    expect(conditionDazed.actionBudget!.move).toBe(0);
  });

  it('Paralyzed: all zeros — no physical actions (mental actions unaffected by remaining keys absent)', () => {
    // actionBudget blocks standard/move/full_round; mental-only actions are unaffected
    // because swift/immediate/free are absent (not restricted by this condition)
    expect(conditionParalyzed.actionBudget!.standard).toBe(0);
    expect(conditionParalyzed.actionBudget!.move).toBe(0);
    expect(conditionParalyzed.actionBudget!.full_round).toBe(0);
    // Swift and immediate are absent: mental actions remain unrestricted
    expect(conditionParalyzed.actionBudget!.swift).toBeUndefined();
  });

  it('Fascinated: all zeros — no actions', () => {
    expect(conditionFascinated.actionBudget!.standard).toBe(0);
    expect(conditionFascinated.actionBudget!.move).toBe(0);
  });

  it('Dying: all zeros', () => {
    expect(conditionDying.actionBudget!.standard).toBe(0);
    expect(conditionDying.actionBudget!.move).toBe(0);
  });

  it('Unconscious: all zeros', () => {
    expect(conditionUnconscious.actionBudget!.standard).toBe(0);
  });

  it('Dead: all zeros', () => {
    expect(conditionDead.actionBudget!.standard).toBe(0);
    expect(conditionDead.actionBudget!.full_round).toBe(0);
  });
});

// =============================================================================
// SECTION 3: Effective budget resolution — minimum-wins algorithm
// =============================================================================

describe('computeEffectiveBudget — minimum-wins (ARCHITECTURE.md §5.6)', () => {
  it('no active conditions: all budgets are unlimited (Infinity)', () => {
    const budget = computeEffectiveBudget([]);
    expect(budget.standard).toBe(Infinity);
    expect(budget.move).toBe(Infinity);
    expect(budget.full_round).toBe(Infinity);
  });

  it('no conditions with actionBudget: all unlimited', () => {
    const budget = computeEffectiveBudget([conditionNormal]);
    expect(budget.standard).toBe(Infinity);
    expect(budget.move).toBe(Infinity);
  });

  it('single Staggered: { standard: 1, move: 1, full_round: 0 }', () => {
    const budget = computeEffectiveBudget([conditionStaggered]);
    expect(budget.standard).toBe(1);
    expect(budget.move).toBe(1);
    expect(budget.full_round).toBe(0);
    expect(budget.swift).toBe(Infinity); // not restricted by Staggered
  });

  it('single Nauseated: { standard: 0, move: 1, full_round: 0 }', () => {
    const budget = computeEffectiveBudget([conditionNauseated]);
    expect(budget.standard).toBe(0);
    expect(budget.move).toBe(1);
    expect(budget.full_round).toBe(0);
  });

  it('Staggered + Nauseated: Nauseated wins for standard (0 vs 1 → 0)', () => {
    // Staggered: standard=1, Nauseated: standard=0 → min = 0
    // Staggered: move=1, Nauseated: move=1 → min = 1
    const budget = computeEffectiveBudget([conditionStaggered, conditionNauseated]);
    expect(budget.standard).toBe(0); // Nauseated is more restrictive
    expect(budget.move).toBe(1);
    expect(budget.full_round).toBe(0);
  });

  it('Stunned overrides everything: any other condition + Stunned = all zeros', () => {
    // Stunned blocks standard/move/full_round = 0. All others are also 0.
    const budget = computeEffectiveBudget([conditionStaggered, conditionStunned]);
    expect(budget.standard).toBe(0);
    expect(budget.move).toBe(0);
    expect(budget.full_round).toBe(0);
  });

  it('normal feature (no actionBudget) does NOT restrict anything', () => {
    const fighter: Feature = makeFeature('class_fighter', {
      category: 'class', tags: ['class'], actionBudget: undefined,
    });
    const budget = computeEffectiveBudget([conditionStaggered, fighter]);
    // Fighter doesn't restrict; Staggered pattern still applies
    expect(budget.standard).toBe(1);
    expect(budget.move).toBe(1);
    expect(budget.full_round).toBe(0);
  });

  it('three conditions: most restrictive wins per category', () => {
    const featureA = makeFeature('cond_a', { actionBudget: { standard: 2, move: 1 } });
    const featureB = makeFeature('cond_b', { actionBudget: { standard: 1, move: 0 } });
    const featureC = makeFeature('cond_c', { actionBudget: { standard: 3 } });

    const budget = computeEffectiveBudget([featureA, featureB, featureC]);
    expect(budget.standard).toBe(1); // min(2, 1, 3) = 1
    expect(budget.move).toBe(0);     // min(1, 0) = 0
    expect(budget.full_round).toBe(Infinity); // absent in all = unlimited
  });

  it('feature with empty actionBudget: {} does not restrict anything', () => {
    const emptyBudget = makeFeature('empty', { actionBudget: {} });
    const budget = computeEffectiveBudget([emptyBudget]);
    expect(budget.standard).toBe(Infinity);
    expect(budget.move).toBe(Infinity);
  });

  it('combining Paralyzed + Stunned: remains all zeros', () => {
    const budget = computeEffectiveBudget([conditionParalyzed, conditionStunned]);
    expect(budget.standard).toBe(0);
    expect(budget.move).toBe(0);
    expect(budget.full_round).toBe(0);
  });
});

// =============================================================================
// SECTION 4: XOR mutual exclusion — Staggered / Disabled
// =============================================================================

describe('XOR action exclusion — Staggered / Disabled (ARCHITECTURE.md §5.6)', () => {
  /**
   * The "standard OR move not both" rule is signalled by the "action_budget_xor" tag.
   * The Combat UI detects this tag and applies mutual exclusion logic.
   */
  it('Staggered has action_budget_xor tag', () => {
    expect(hasActionBudgetXor(conditionStaggered)).toBe(true);
  });

  it('Disabled has action_budget_xor tag', () => {
    expect(hasActionBudgetXor(conditionDisabled)).toBe(true);
  });

  it('Nauseated does NOT have action_budget_xor tag', () => {
    expect(hasActionBudgetXor(conditionNauseated)).toBe(false);
  });

  it('Stunned does NOT have action_budget_xor tag', () => {
    expect(hasActionBudgetXor(conditionStunned)).toBe(false);
  });

  it('XOR logic: spending standard blocks move', () => {
    // Staggered character spends standard action → move becomes blocked
    const blocked = getXorBlockedActions('standard');
    expect(blocked).toContain('move');
    expect(blocked).not.toContain('standard');
  });

  it('XOR logic: spending move blocks standard', () => {
    const blocked = getXorBlockedActions('move');
    expect(blocked).toContain('standard');
    expect(blocked).not.toContain('move');
  });

  it('Normal conditions (no action_budget_xor): no XOR mutual exclusion', () => {
    const racialFeature = makeFeature('race_human', {
      category: 'race',
      tags: ['race', 'race_human'],
    });
    expect(hasActionBudgetXor(racialFeature)).toBe(false);
  });
});

// =============================================================================
// SECTION 5: Non-condition features have no actionBudget
// =============================================================================

describe('Non-condition features — actionBudget absent', () => {
  it('a weapon feature has no actionBudget', () => {
    const longsword: Feature = {
      ...makeFeature('item_longsword'),
      category: 'item',
      tags: ['item', 'weapon', 'martial', 'slashing'],
    };
    expect(longsword.actionBudget).toBeUndefined();
  });

  it('a class feature has no actionBudget', () => {
    const fighter: Feature = {
      ...makeFeature('class_fighter'),
      category: 'class',
      tags: ['class', 'class_fighter'],
    };
    expect(fighter.actionBudget).toBeUndefined();
  });

  it('a feat has no actionBudget', () => {
    const powerAttack: Feature = {
      ...makeFeature('feat_power_attack'),
      category: 'feat',
      tags: ['feat', 'feat_power_attack', 'fighter_bonus_feat'],
    };
    expect(powerAttack.actionBudget).toBeUndefined();
  });

  it('a racial feature has no actionBudget', () => {
    const humanRace: Feature = {
      ...makeFeature('race_human'),
      category: 'race',
      tags: ['race', 'race_human'],
    };
    expect(humanRace.actionBudget).toBeUndefined();
  });

  it('a spell has no actionBudget (spells have activation, not actionBudget)', () => {
    const fireball: Feature = {
      ...makeFeature('spell_fireball'),
      category: 'magic',
      tags: ['magic', 'arcane', 'evocation'],
      activation: { actionType: 'standard' },
    };
    expect(fireball.actionBudget).toBeUndefined();
    // action is declared via activation.actionType, not actionBudget
    expect(fireball.activation?.actionType).toBe('standard');
  });
});

// =============================================================================
// SECTION 6: Invariants and edge cases
// =============================================================================

describe('actionBudget invariants and edge cases', () => {
  it('a budget of 0 is more restrictive than 1', () => {
    const restrictive = makeFeature('cond_r', { actionBudget: { standard: 0 } });
    const lenient     = makeFeature('cond_l', { actionBudget: { standard: 1 } });
    const budget = computeEffectiveBudget([restrictive, lenient]);
    expect(budget.standard).toBe(0); // 0 < 1 → 0 wins
  });

  it('Infinity represents "no restriction" — never blocks an action', () => {
    const normal = makeFeature('normal', { actionBudget: undefined });
    const budget = computeEffectiveBudget([normal]);
    // All Infinity = the character can take any action
    expect(budget.standard).toBe(Infinity);
    expect(budget.move).toBe(Infinity);
    expect(budget.full_round).toBe(Infinity);
  });

  it('action budget values can be > 1 (exotic homebrew: extra actions per round)', () => {
    // e.g., a "Haste" condition grants an extra standard action
    const haste = makeFeature('spell_effect_haste', {
      category: 'condition',
      tags: ['condition', 'spell_effect_haste'],
      actionBudget: { standard: 2 }, // 2 standard actions per round
    });
    expect(haste.actionBudget!.standard).toBe(2);
  });

  it('all SRD total-restriction conditions have the same budget shape', () => {
    // These all use the same pattern: standard/move/full_round = 0
    const totalRestrictions = [
      conditionStunned, conditionCowering, conditionDazed,
      conditionParalyzed, conditionFascinated, conditionDying,
      conditionUnconscious, conditionDead,
    ];
    for (const cond of totalRestrictions) {
      expect(cond.actionBudget!.standard).toBe(0);
      expect(cond.actionBudget!.move).toBe(0);
      expect(cond.actionBudget!.full_round).toBe(0);
    }
  });

  it('Staggered and Disabled share the same budget but different condition IDs', () => {
    expect(conditionStaggered.actionBudget).toEqual(conditionDisabled.actionBudget);
    expect(conditionStaggered.id).not.toBe(conditionDisabled.id);
  });

  it('multiple identical conditions do not compound — minimum of identical is identical', () => {
    // Two Staggered conditions simultaneously (shouldn't happen, but robust)
    const budget = computeEffectiveBudget([conditionStaggered, conditionStaggered]);
    expect(budget.standard).toBe(1); // min(1, 1) = 1
    expect(budget.move).toBe(1);
    expect(budget.full_round).toBe(0);
  });
});
