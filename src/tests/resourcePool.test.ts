/**
 * @file src/tests/resourcePool.test.ts
 * @description Vitest unit tests for ResourcePool incremental tick and rest mechanics.
 *
 * WHAT IS TESTED:
 *   These tests cover the logic introduced in ARCHITECTURE.md section 4.4 and
 *   Phase 1.6 / Phase 3.6:
 *
 *   1. `resetCondition` type coverage:
 *      - All six values (`long_rest`, `short_rest`, `encounter`, `never`,
 *        `per_turn`, `per_round`) are valid TypeScript types on `ResourcePool`.
 *
 *   2. Incremental tick logic (mirrors `GameEngine.#applyIncrementalTick()`):
 *      - `"per_turn"` pools gain `rechargeAmount` per tick and cap at max.
 *      - `"per_round"` pools gain `rechargeAmount` per tick and cap at max.
 *      - Non-matching pools (e.g., `"long_rest"`, `"encounter"`) are not affected.
 *      - `temporaryValue` is NEVER modified by a tick.
 *      - `rechargeAmount` of 0 or absent → no change.
 *      - Multiple ticks accumulate correctly until capped.
 *      - Formula string `rechargeAmount` is resolved via the Math Parser.
 *
 *   3. Full-reset logic (mirrors `GameEngine.triggerLongRest()`, etc.):
 *      - Long rest resets `"long_rest"` AND `"short_rest"` pools.
 *      - Short rest resets ONLY `"short_rest"` pools.
 *      - Encounter reset resets ONLY `"encounter"` pools.
 *      - `"never"` pools are not affected by any rest.
 *      - `"per_turn"` / `"per_round"` pools are not affected by rest events.
 *
 *   4. Invariants:
 *      - `currentValue` can never exceed `max` after a tick.
 *      - `currentValue` can never go below its pre-tick value via ticking (ticks only add).
 *      - Formula-resolved `rechargeAmount` yields correct numeric result.
 *
 * WHY PURE HELPERS:
 *   The GameEngine uses Svelte 5 `$derived` runes and a full character context.
 *   These cannot be instantiated in Vitest (no Svelte runtime). Instead, we extract
 *   the core resource-tick algorithm into pure utility functions
 *   (`applyTick`, `applyFullReset`) that mirror `#applyIncrementalTick()` and the
 *   rest trigger methods, accepting a plain `ResourcePool[]` and a resolved max.
 *
 * FAST HEALING / REGENERATION SCENARIO:
 *   The canonical use case is a creature with Fast Healing 3 (HP pool,
 *   `resetCondition: "per_turn"`, `rechargeAmount: 3`). At the start of each of its
 *   turns, it regains 3 HP, capped at its maximum. This test suite proves all the
 *   mechanics of that scenario work correctly in isolation from Svelte reactivity.
 *
 * @see src/lib/types/pipeline.ts — ResourcePool type definition (Phase 1.6)
 * @see src/lib/engine/GameEngine.svelte.ts — triggerTurnTick, #applyIncrementalTick (Phase 3.6)
 * @see ARCHITECTURE.md section 4.4 — ResourcePool resetCondition full reference
 * @see ARCHITECTURE.md Phase 17 (test suite)
 */

import { describe, it, expect } from 'vitest';
import { evaluateFormula } from '$lib/utils/mathParser';
import type { ResourcePool } from '$lib/types/pipeline';
import type { CharacterContext } from '$lib/utils/mathParser';

// =============================================================================
// PURE HELPERS — Portable mirrors of GameEngine private methods
// =============================================================================

/**
 * Mirrors `GameEngine.#getEffectiveMax()`.
 * In tests, we pass the max directly rather than reading from a pipeline map.
 */
function getEffectiveMax(pool: ResourcePool, resolvedMax: number): number {
  return resolvedMax;
}

/**
 * Mirrors `GameEngine.#applyIncrementalTick()` for a single pool.
 *
 * Applies one tick to `pool` if its `resetCondition` matches `condition`.
 * Resolves `rechargeAmount` via the Math Parser if it is a string formula.
 * Caps `currentValue` at `resolvedMax`. Never modifies `temporaryValue`.
 *
 * @param pool        - The ResourcePool to tick (mutated in place).
 * @param condition   - `"per_turn"` or `"per_round"`.
 * @param resolvedMax - The effective maximum (from the maxPipelineId pipeline).
 * @param context     - Character context for formula evaluation of `rechargeAmount`.
 */
function applyTick(
  pool: ResourcePool,
  condition: 'per_turn' | 'per_round',
  resolvedMax: number,
  context: CharacterContext
): void {
  if (pool.resetCondition !== condition) return;

  const raw = pool.rechargeAmount;
  let amount = 0;
  if (typeof raw === 'number') {
    amount = raw;
  } else if (typeof raw === 'string') {
    const resolved = evaluateFormula(raw, context, 'en');
    amount = typeof resolved === 'number' ? resolved : parseFloat(String(resolved)) || 0;
  }
  if (amount <= 0) return;

  const max = getEffectiveMax(pool, resolvedMax);
  pool.currentValue = Math.min(pool.currentValue + amount, max);
  // temporaryValue is intentionally NOT modified
}

/**
 * Mirrors `GameEngine.triggerLongRest()` for a collection of pools.
 * Resets ALL `"long_rest"` and `"short_rest"` pools to their resolved maximum.
 *
 * @param pools       - Map of pool id → ResourcePool (mutated in place).
 * @param maxResolver - Function that returns the effective max for a given pool.
 */
function triggerLongRest(pools: Record<string, ResourcePool>, maxResolver: (id: string) => number): void {
  for (const [id, pool] of Object.entries(pools)) {
    if (pool.resetCondition !== 'long_rest' && pool.resetCondition !== 'short_rest') continue;
    pool.currentValue = maxResolver(id);
  }
}

/**
 * Mirrors `GameEngine.triggerShortRest()` — resets ONLY `"short_rest"` pools.
 */
function triggerShortRest(pools: Record<string, ResourcePool>, maxResolver: (id: string) => number): void {
  for (const [id, pool] of Object.entries(pools)) {
    if (pool.resetCondition !== 'short_rest') continue;
    pool.currentValue = maxResolver(id);
  }
}

/**
 * Mirrors `GameEngine.triggerEncounterReset()` — resets ONLY `"encounter"` pools.
 */
function triggerEncounterReset(pools: Record<string, ResourcePool>, maxResolver: (id: string) => number): void {
  for (const [id, pool] of Object.entries(pools)) {
    if (pool.resetCondition !== 'encounter') continue;
    pool.currentValue = maxResolver(id);
  }
}

// =============================================================================
// MINIMAL CONTEXT for formula evaluation
// =============================================================================

/**
 * A minimal CharacterContext for testing formula-based `rechargeAmount`.
 * Uses a Cleric 10 to test `"floor(@classLevels.class_cleric / 2)"` = 5.
 */
const testContext: CharacterContext = {
  attributes: {},
  skills: {},
  combatStats: {},
  saves: {},
  characterLevel: 10,
  eclForXp: 10,
  classLevels: { 'class_cleric': 10 },
  activeTags: [],
  equippedWeaponTags: [],
  selection: {},
  constants: {},
};

// =============================================================================
// HELPERS — Pool factories
// =============================================================================

/**
 * Creates a ResourcePool for Fast Healing N.
 * Max HP is tracked externally as `resolvedMax`.
 */
function makeFastHealingPool(currentHp: number, rechargeAmount: number | string): ResourcePool {
  return {
    id: 'resources.hp',
    label: { en: 'Hit Points', fr: 'Points de vie' },
    maxPipelineId: 'combatStats.max_hp',
    currentValue: currentHp,
    temporaryValue: 0,
    resetCondition: 'per_turn',
    rechargeAmount,
  };
}

// =============================================================================
// SECTION 1: TypeScript type soundness — all six resetCondition values compile
// =============================================================================

describe('ResourcePool.resetCondition — type coverage (all 6 values)', () => {
  /**
   * This test is primarily a TypeScript compile-time check:
   * if any union member were missing, the assignment would fail to compile.
   * At runtime it simply confirms the value is stored correctly.
   */
  it('accepts "long_rest"', () => {
    const pool: ResourcePool = {
      id: 'r', label: { en: '' }, maxPipelineId: 'p',
      currentValue: 5, temporaryValue: 0, resetCondition: 'long_rest',
    };
    expect(pool.resetCondition).toBe('long_rest');
  });

  it('accepts "short_rest"', () => {
    const pool: ResourcePool = {
      id: 'r', label: { en: '' }, maxPipelineId: 'p',
      currentValue: 3, temporaryValue: 0, resetCondition: 'short_rest',
    };
    expect(pool.resetCondition).toBe('short_rest');
  });

  it('accepts "encounter"', () => {
    const pool: ResourcePool = {
      id: 'r', label: { en: '' }, maxPipelineId: 'p',
      currentValue: 2, temporaryValue: 0, resetCondition: 'encounter',
    };
    expect(pool.resetCondition).toBe('encounter');
  });

  it('accepts "never"', () => {
    const pool: ResourcePool = {
      id: 'r', label: { en: '' }, maxPipelineId: 'p',
      currentValue: 50, temporaryValue: 0, resetCondition: 'never',
    };
    expect(pool.resetCondition).toBe('never');
  });

  it('accepts "per_turn" (Phase 1.6 — new)', () => {
    const pool: ResourcePool = {
      id: 'r', label: { en: '' }, maxPipelineId: 'p',
      currentValue: 7, temporaryValue: 0, resetCondition: 'per_turn',
      rechargeAmount: 3,
    };
    expect(pool.resetCondition).toBe('per_turn');
    expect(pool.rechargeAmount).toBe(3);
  });

  it('accepts "per_round" (Phase 1.6 — new)', () => {
    const pool: ResourcePool = {
      id: 'r', label: { en: '' }, maxPipelineId: 'p',
      currentValue: 0, temporaryValue: 0, resetCondition: 'per_round',
      rechargeAmount: 2,
    };
    expect(pool.resetCondition).toBe('per_round');
    expect(pool.rechargeAmount).toBe(2);
  });

  it('rechargeAmount is optional (can be omitted for non-incremental pools)', () => {
    const pool: ResourcePool = {
      id: 'r', label: { en: '' }, maxPipelineId: 'p',
      currentValue: 10, temporaryValue: 0, resetCondition: 'long_rest',
      // rechargeAmount intentionally absent
    };
    expect(pool.rechargeAmount).toBeUndefined();
  });
});

// =============================================================================
// SECTION 2: Per-turn tick logic (Fast Healing)
// =============================================================================

describe('triggerTurnTick — "per_turn" incremental recharge (Fast Healing)', () => {
  /**
   * CANONICAL D&D 3.5 SCENARIO:
   *   Troll with Fast Healing 5, currently at 8 HP, max HP 40.
   *   At start of its turn: gains 5 HP → 13 HP. Max not exceeded.
   *
   * ARCHITECTURE.md section 4.4: "per_turn — recharges at the START OF THE
   * CHARACTER'S OWN TURN each round."
   */
  it('Fast Healing 5: gains 5 HP per turn', () => {
    const pool = makeFastHealingPool(8, 5);
    applyTick(pool, 'per_turn', 40, testContext);
    expect(pool.currentValue).toBe(13); // 8 + 5
  });

  it('Fast Healing 3: gains 3 HP per turn (canonical example from ARCHITECTURE.md §4.4)', () => {
    const pool = makeFastHealingPool(10, 3);
    applyTick(pool, 'per_turn', 30, testContext);
    expect(pool.currentValue).toBe(13); // 10 + 3
  });

  it('caps at max HP: partial tick when close to maximum', () => {
    // 38 HP, max 40, Fast Healing 5 → gains only 2 to reach 40 (not +5)
    const pool = makeFastHealingPool(38, 5);
    applyTick(pool, 'per_turn', 40, testContext);
    expect(pool.currentValue).toBe(40); // capped at max
  });

  it('already at max HP: no change from tick', () => {
    const pool = makeFastHealingPool(40, 5);
    applyTick(pool, 'per_turn', 40, testContext);
    expect(pool.currentValue).toBe(40); // no change
  });

  it('multiple turns accumulate until max is reached', () => {
    // 20 HP, max 35, Fast Healing 5
    const pool = makeFastHealingPool(20, 5);
    applyTick(pool, 'per_turn', 35, testContext); // → 25
    expect(pool.currentValue).toBe(25);
    applyTick(pool, 'per_turn', 35, testContext); // → 30
    expect(pool.currentValue).toBe(30);
    applyTick(pool, 'per_turn', 35, testContext); // → 35
    expect(pool.currentValue).toBe(35);
    applyTick(pool, 'per_turn', 35, testContext); // → still 35 (capped)
    expect(pool.currentValue).toBe(35);
  });

  it('temporaryValue is NOT modified by a turn tick (only currentValue changes)', () => {
    // D&D 3.5: Fast Healing never restores Temporary HP.
    const pool = makeFastHealingPool(10, 5);
    pool.temporaryValue = 8; // pre-existing temporary HP
    applyTick(pool, 'per_turn', 30, testContext);
    expect(pool.currentValue).toBe(15);   // healed
    expect(pool.temporaryValue).toBe(8);  // unchanged
  });

  it('Regeneration at 0 HP: tick still applies (unlike Fast Healing UI restriction)', () => {
    // For Regeneration, the engine tick applies even at 0 HP.
    // (The UI decides whether to skip based on the creature type — the engine itself
    // always applies the tick if the pool has per_turn and rechargeAmount > 0.)
    const pool = makeFastHealingPool(0, 5);
    applyTick(pool, 'per_turn', 40, testContext);
    expect(pool.currentValue).toBe(5); // 0 + 5
  });

  it('Regeneration at negative HP: tick applies (pulls toward 0)', () => {
    // Trolls regenerate even from -8 HP.
    const pool = makeFastHealingPool(-8, 5);
    applyTick(pool, 'per_turn', 40, testContext);
    expect(pool.currentValue).toBe(-3); // -8 + 5
  });

  it('"per_turn" pool is NOT affected by triggerRoundTick', () => {
    // A per_turn pool should only be ticked by triggerTurnTick, never by triggerRoundTick.
    const pool = makeFastHealingPool(10, 5);
    applyTick(pool, 'per_round', 40, testContext); // wrong condition
    expect(pool.currentValue).toBe(10); // unchanged
  });

  it('"long_rest" pool is NOT affected by turn tick', () => {
    const pool: ResourcePool = {
      id: 'resources.rage', label: { en: 'Rage' }, maxPipelineId: 'p',
      currentValue: 2, temporaryValue: 0, resetCondition: 'long_rest',
      rechargeAmount: 99, // should be ignored because condition doesn't match
    };
    applyTick(pool, 'per_turn', 10, testContext);
    expect(pool.currentValue).toBe(2); // unchanged
  });

  it('"encounter" pool is NOT affected by turn tick', () => {
    const pool: ResourcePool = {
      id: 'resources.smite', label: { en: 'Smite' }, maxPipelineId: 'p',
      currentValue: 0, temporaryValue: 0, resetCondition: 'encounter',
      rechargeAmount: 5,
    };
    applyTick(pool, 'per_turn', 3, testContext);
    expect(pool.currentValue).toBe(0); // unchanged
  });

  it('rechargeAmount of 0 does nothing', () => {
    const pool = makeFastHealingPool(10, 0);
    applyTick(pool, 'per_turn', 30, testContext);
    expect(pool.currentValue).toBe(10); // unchanged
  });

  it('absent rechargeAmount (undefined) does nothing', () => {
    const pool: ResourcePool = {
      id: 'resources.hp', label: { en: 'HP' }, maxPipelineId: 'p',
      currentValue: 10, temporaryValue: 0, resetCondition: 'per_turn',
      // rechargeAmount intentionally absent
    };
    applyTick(pool, 'per_turn', 30, testContext);
    expect(pool.currentValue).toBe(10); // unchanged
  });
});

// =============================================================================
// SECTION 3: Per-round tick logic
// =============================================================================

describe('triggerRoundTick — "per_round" incremental recharge', () => {
  it('per_round pool gains rechargeAmount each round', () => {
    const pool: ResourcePool = {
      id: 'resources.hazard', label: { en: 'Hazard charges' }, maxPipelineId: 'p',
      currentValue: 0, temporaryValue: 0, resetCondition: 'per_round',
      rechargeAmount: 2,
    };
    applyTick(pool, 'per_round', 10, testContext);
    expect(pool.currentValue).toBe(2);
    applyTick(pool, 'per_round', 10, testContext);
    expect(pool.currentValue).toBe(4);
  });

  it('per_round pool caps at max', () => {
    const pool: ResourcePool = {
      id: 'resources.hazard', label: { en: 'Hazard' }, maxPipelineId: 'p',
      currentValue: 9, temporaryValue: 0, resetCondition: 'per_round',
      rechargeAmount: 5,
    };
    applyTick(pool, 'per_round', 10, testContext);
    expect(pool.currentValue).toBe(10); // capped at 10, not 14
  });

  it('"per_round" pool is NOT affected by turn tick', () => {
    const pool: ResourcePool = {
      id: 'resources.hazard', label: { en: 'Hazard' }, maxPipelineId: 'p',
      currentValue: 0, temporaryValue: 0, resetCondition: 'per_round',
      rechargeAmount: 3,
    };
    applyTick(pool, 'per_turn', 10, testContext); // wrong condition
    expect(pool.currentValue).toBe(0); // unchanged
  });
});

// =============================================================================
// SECTION 4: Formula-based rechargeAmount
// =============================================================================

describe('rechargeAmount as formula string', () => {
  /**
   * ARCHITECTURE.md section 4.4:
   *   `rechargeAmount` can be a Math Parser formula string.
   *   Example: `"floor(@classLevels.class_cleric / 2)"` for level-scaled healing.
   *
   * testContext has class_cleric: 10 → floor(10 / 2) = 5.
   */
  it('formula rechargeAmount: "floor(@classLevels.class_cleric / 2)" with cleric 10 → heals 5', () => {
    const pool: ResourcePool = {
      id: 'resources.hp', label: { en: 'HP' }, maxPipelineId: 'p',
      currentValue: 20, temporaryValue: 0, resetCondition: 'per_turn',
      rechargeAmount: 'floor(@classLevels.class_cleric / 2)',
    };
    applyTick(pool, 'per_turn', 50, testContext); // floor(10/2) = 5
    expect(pool.currentValue).toBe(25); // 20 + 5
  });

  it('formula "1 + 2" evaluates to 3 and heals 3 per turn', () => {
    const pool: ResourcePool = {
      id: 'resources.hp', label: { en: 'HP' }, maxPipelineId: 'p',
      currentValue: 10, temporaryValue: 0, resetCondition: 'per_turn',
      rechargeAmount: '1 + 2',
    };
    applyTick(pool, 'per_turn', 30, testContext);
    expect(pool.currentValue).toBe(13); // 10 + 3
  });

  it('formula rechargeAmount capped at max same as numeric', () => {
    const pool: ResourcePool = {
      id: 'resources.hp', label: { en: 'HP' }, maxPipelineId: 'p',
      currentValue: 28, temporaryValue: 0, resetCondition: 'per_turn',
      rechargeAmount: 'floor(@classLevels.class_cleric / 2)', // 5
    };
    applyTick(pool, 'per_turn', 30, testContext); // 28 + 5 = 33 → capped at 30
    expect(pool.currentValue).toBe(30);
  });
});

// =============================================================================
// SECTION 5: Full-reset logic (long rest, short rest, encounter reset)
// =============================================================================

describe('triggerLongRest — resets long_rest and short_rest pools', () => {
  /**
   * ARCHITECTURE.md section 4.4:
   *   "triggerLongRest() resets BOTH long_rest AND short_rest pools
   *    (a long rest implies a short rest)."
   */
  it('long rest restores long_rest pool to max', () => {
    const pools: Record<string, ResourcePool> = {
      'resources.spell_slots': {
        id: 'resources.spell_slots', label: { en: 'Spell Slots' }, maxPipelineId: 'max_spells',
        currentValue: 0, temporaryValue: 0, resetCondition: 'long_rest',
      },
    };
    const maxResolver = (_id: string) => 10;
    triggerLongRest(pools, maxResolver);
    expect(pools['resources.spell_slots'].currentValue).toBe(10);
  });

  it('long rest also restores short_rest pools', () => {
    const pools: Record<string, ResourcePool> = {
      'resources.ki': {
        id: 'resources.ki', label: { en: 'Ki' }, maxPipelineId: 'max_ki',
        currentValue: 1, temporaryValue: 0, resetCondition: 'short_rest',
      },
    };
    const maxResolver = (_id: string) => 8;
    triggerLongRest(pools, maxResolver);
    expect(pools['resources.ki'].currentValue).toBe(8);
  });

  it('long rest does NOT affect encounter, never, per_turn, or per_round pools', () => {
    const pools: Record<string, ResourcePool> = {
      'resources.smite': {
        id: 'resources.smite', label: { en: 'Smite' }, maxPipelineId: 'p',
        currentValue: 0, temporaryValue: 0, resetCondition: 'encounter',
      },
      'resources.charges': {
        id: 'resources.charges', label: { en: 'Charges' }, maxPipelineId: 'p',
        currentValue: 3, temporaryValue: 0, resetCondition: 'never',
      },
      'resources.fast_heal': {
        id: 'resources.fast_heal', label: { en: 'Fast Heal' }, maxPipelineId: 'p',
        currentValue: 5, temporaryValue: 0, resetCondition: 'per_turn', rechargeAmount: 3,
      },
      'resources.aura': {
        id: 'resources.aura', label: { en: 'Aura' }, maxPipelineId: 'p',
        currentValue: 2, temporaryValue: 0, resetCondition: 'per_round', rechargeAmount: 1,
      },
    };
    const maxResolver = (_id: string) => 99;
    triggerLongRest(pools, maxResolver);
    expect(pools['resources.smite'].currentValue).toBe(0);    // encounter — unchanged
    expect(pools['resources.charges'].currentValue).toBe(3);  // never — unchanged
    expect(pools['resources.fast_heal'].currentValue).toBe(5); // per_turn — unchanged
    expect(pools['resources.aura'].currentValue).toBe(2);     // per_round — unchanged
  });
});

describe('triggerShortRest — resets ONLY short_rest pools', () => {
  it('short rest restores short_rest pool', () => {
    const pools: Record<string, ResourcePool> = {
      'resources.ki': {
        id: 'resources.ki', label: { en: 'Ki' }, maxPipelineId: 'max_ki',
        currentValue: 2, temporaryValue: 0, resetCondition: 'short_rest',
      },
    };
    triggerShortRest(pools, (_id) => 12);
    expect(pools['resources.ki'].currentValue).toBe(12);
  });

  it('short rest does NOT restore long_rest pools', () => {
    const pools: Record<string, ResourcePool> = {
      'resources.spell_slots': {
        id: 'resources.spell_slots', label: { en: 'Spells' }, maxPipelineId: 'p',
        currentValue: 0, temporaryValue: 0, resetCondition: 'long_rest',
      },
    };
    triggerShortRest(pools, (_id) => 10);
    expect(pools['resources.spell_slots'].currentValue).toBe(0); // unchanged
  });
});

describe('triggerEncounterReset — resets ONLY encounter pools', () => {
  it('encounter reset restores encounter pool', () => {
    const pools: Record<string, ResourcePool> = {
      'resources.smite': {
        id: 'resources.smite', label: { en: 'Smite Evil' }, maxPipelineId: 'max_smite',
        currentValue: 0, temporaryValue: 0, resetCondition: 'encounter',
      },
    };
    triggerEncounterReset(pools, (_id) => 3);
    expect(pools['resources.smite'].currentValue).toBe(3);
  });

  it('encounter reset does NOT affect long_rest pools', () => {
    const pools: Record<string, ResourcePool> = {
      'resources.rage': {
        id: 'resources.rage', label: { en: 'Rage' }, maxPipelineId: 'p',
        currentValue: 0, temporaryValue: 0, resetCondition: 'long_rest',
      },
    };
    triggerEncounterReset(pools, (_id) => 10);
    expect(pools['resources.rage'].currentValue).toBe(0); // unchanged
  });

  it('encounter reset does NOT affect per_turn / per_round pools', () => {
    const pools: Record<string, ResourcePool> = {
      'resources.hp': {
        id: 'resources.hp', label: { en: 'HP' }, maxPipelineId: 'p',
        currentValue: 15, temporaryValue: 0, resetCondition: 'per_turn', rechargeAmount: 5,
      },
    };
    triggerEncounterReset(pools, (_id) => 40);
    expect(pools['resources.hp'].currentValue).toBe(15); // unchanged
  });
});

// =============================================================================
// SECTION 6: Invariants
// =============================================================================

describe('ResourcePool tick invariants', () => {
  it('currentValue can never exceed max via ticking (invariant)', () => {
    // Regardless of rechargeAmount, currentValue ≤ max after any tick.
    const pool = makeFastHealingPool(35, 100); // huge rechargeAmount
    applyTick(pool, 'per_turn', 40, testContext);
    expect(pool.currentValue).toBeLessThanOrEqual(40);
    expect(pool.currentValue).toBe(40);
  });

  it('currentValue can never decrease via ticking (ticks only add)', () => {
    const pool = makeFastHealingPool(20, 5);
    const before = pool.currentValue;
    applyTick(pool, 'per_turn', 30, testContext);
    expect(pool.currentValue).toBeGreaterThanOrEqual(before);
  });

  it('multiple pools in same character: only per_turn pools tick on turn tick', () => {
    // Simulates a Troll with Fast Healing 5 and remaining spell slots (long_rest):
    // Turn tick should only modify the HP pool, not the spell slots.
    const hp: ResourcePool = {
      id: 'resources.hp', label: { en: 'HP' }, maxPipelineId: 'max_hp',
      currentValue: 15, temporaryValue: 0, resetCondition: 'per_turn', rechargeAmount: 5,
    };
    const spells: ResourcePool = {
      id: 'resources.spell_slots_1', label: { en: 'Level 1 Slots' }, maxPipelineId: 'max_sp1',
      currentValue: 0, temporaryValue: 0, resetCondition: 'long_rest',
    };

    applyTick(hp, 'per_turn', 40, testContext);
    applyTick(spells, 'per_turn', 4, testContext);

    expect(hp.currentValue).toBe(20);     // healed
    expect(spells.currentValue).toBe(0);  // unchanged
  });

  it('Fast Healing and Regeneration share the same per_turn tick mechanics', () => {
    // Both use resetCondition: "per_turn" with a rechargeAmount.
    // The engine cannot distinguish them — that is a tag-level concern.
    const fastHealing = makeFastHealingPool(10, 3); // Fast Healing 3
    const regeneration = makeFastHealingPool(-5, 5); // Regeneration 5 (at neg HP)

    applyTick(fastHealing, 'per_turn', 30, testContext);
    applyTick(regeneration, 'per_turn', 30, testContext);

    expect(fastHealing.currentValue).toBe(13);  // 10 + 3
    expect(regeneration.currentValue).toBe(0);  // -5 + 5
  });
});
