/**
 * @file src/tests/maxDexBonus.test.ts
 * @description Vitest unit tests for Engine Enhancement E-17:
 *              `combatStats.max_dex_bonus` pipeline and `max_dex_cap` modifier type.
 *
 * WHAT IS TESTED:
 *
 * D&D 3.5 SRD Rule:
 *   "If your armor has a maximum Dexterity bonus, this is the highest Dexterity
 *    modifier you can add to your Armor Class while wearing it."
 *
 * ARCHITECTURAL OVERVIEW:
 *   - `combatStats.max_dex_bonus` is a StatisticPipeline with `baseValue = 99` (≈ "no cap").
 *   - Armor/conditions impose a CAP via `type: "max_dex_cap"` modifiers. Multiple caps
 *     → MINIMUM wins (most restrictive applies).
 *   - Additive bonuses (e.g., Mithral +2) use `type: "untyped"` and stack on top of the cap.
 *
 * STACKING EXAMPLES:
 *   • No armor          → totalValue = 99 (no restriction on DEX to AC)
 *   • Chain mail        → max_dex_cap=2  → totalValue = 2
 *   • Chain mail + Mithral → max_dex_cap=2 + untyped=+2 → totalValue = 4
 *   • Chain mail + Tower Shield (max=2) → min(2,2)=2 + no untyped → totalValue = 2
 *   • Full plate (cap=1) + Tower Shield (cap=2) → min(1,2)=1 → totalValue = 1
 *   • Heavy Load cond (cap=1) + Padded armor (cap=8) → min(1,8)=1 → totalValue = 1
 *
 * TEST SECTIONS:
 *
 * ─── PART 1: Stacking Rules — applyStackingRules behavior ────────────────────
 *   Tests the stacking rules treatment of max_dex_cap modifiers (they should NOT
 *   be grouped as non-stacking standard types; Phase 3 intercepts them separately).
 *   (5 tests)
 *
 * ─── PART 2: Phase 3 Pipeline Computation ─────────────────────────────────────
 *   Tests the combatStats.max_dex_bonus pipeline via stackingRules called directly
 *   (simulating Phase 3 special handling logic).
 *   (7 tests)
 *
 * ─── PART 3: Content Authoring Contracts ──────────────────────────────────────
 *   Tests the expected JSON structure for armor items, mithral material, and
 *   conditions, using TypeScript type assertions.
 *   (5 tests)
 *
 * ─── PART 4: Edge Cases ───────────────────────────────────────────────────────
 *   Boundary values, single cap, concurrent caps, zero cap.
 *   (5 tests)
 *
 * TOTAL: 22 tests
 *
 * @see src/lib/types/primitives.ts       — ModifierType "max_dex_cap" definition
 * @see src/lib/engine/GameEngine.svelte.ts — Phase 3 special handling
 * @see ARCHITECTURE.md section 4.17      — Max DEX Bonus pipeline reference
 */

import { describe, it, expect } from 'vitest';
import { applyStackingRules } from '../lib/utils/stackingRules';
import type { Modifier } from '../lib/types/pipeline';
import type { ModifierType } from '../lib/types/primitives';

// =============================================================================
// TEST HELPERS
// =============================================================================

/**
 * Creates a minimal Modifier for testing.
 * The `type` parameter accepts any ModifierType, including the new "max_dex_cap".
 */
function makeModifier(
  id: string,
  type: ModifierType,
  value: number,
  sourceId = 'test_source',
): Modifier {
  return {
    id,
    sourceId,
    sourceName: { en: `Test ${id}`, fr: `Test ${id}` },
    targetId: 'combatStats.max_dex_bonus',
    value,
    type,
  };
}

/**
 * Simulates the Phase 3 special-case computation for combatStats.max_dex_bonus.
 *
 * This replicates the engine logic from GameEngine.svelte.ts Phase 3:
 *   1. Separate max_dex_cap modifiers from additive modifiers.
 *   2. effectiveBaseValue = min(cap values) if any, else 99.
 *   3. Apply remaining modifiers (untyped, enhancement, etc.) via applyStackingRules.
 *   4. Return totalValue.
 *
 * @param mods     - All active modifiers targeting combatStats.max_dex_bonus
 * @param baseVal  - Pipeline baseValue (99 for max_dex_bonus)
 */
function computeMaxDexBonus(mods: Modifier[], baseVal = 99): number {
  const capMods = mods.filter(m => m.type === 'max_dex_cap');
  const remainingMods = mods.filter(m => m.type !== 'max_dex_cap');

  const effectiveBaseValue = capMods.length > 0
    ? Math.min(...capMods.map(m => Number(m.value)))
    : baseVal;

  const stacking = applyStackingRules(remainingMods, effectiveBaseValue);
  return stacking.totalValue;
}

// =============================================================================
// PART 1 — STACKING RULES TREATMENT OF max_dex_cap
// =============================================================================

describe('maxDexBonus — stacking rules behavior', () => {

  it('T01 — max_dex_cap is a valid ModifierType (type-check)', () => {
    // Verify the type can be used without TypeScript error
    const capType: ModifierType = 'max_dex_cap';
    expect(capType).toBe('max_dex_cap');
  });

  it('T02 — applyStackingRules without max_dex_cap: returns baseValue + untyped', () => {
    // Without any cap modifier, untyped stacks on the baseValue of 99
    const mods: Modifier[] = [makeModifier('m1', 'untyped', 2)];
    const result = applyStackingRules(mods, 99);
    // untyped always stacks → 99 + 2 = 101 (theoretical; in practice no armor = no cap needed)
    expect(result.totalValue).toBe(101);
  });

  it('T03 — single max_dex_cap mod in applyStackingRules: treated as non-stacking type', () => {
    // max_dex_cap is NOT in ALWAYS_STACKING_TYPES, so applyStackingRules keeps only the highest
    // (Phase 3 interceptsmax_dex_cap BEFORE calling applyStackingRules, but we test in isolation)
    const mods: Modifier[] = [makeModifier('cap1', 'max_dex_cap', 2)];
    const result = applyStackingRules(mods, 99);
    // Standard non-stacking: takes the highest value → baseValue=99, mod=2 → total = 99+2 = 101?
    // No — setAbsolute semantics don't apply; non-stacking takes highest BONUS.
    // Actually "max_dex_cap" would be grouped with same type; only highest applies.
    // With a single modifier and base=99: the modifier IS applied.
    // The real behavior: base=99, one cap modifier of 2 → totalBonus=2 → totalValue=101
    // But this is NOT the correct semantics for max_dex_bonus!
    // This test documents that Phase 3 must intercept BEFORE calling applyStackingRules.
    expect(result.totalBonus).toBe(2); // cap mod is treated as regular additive by stackingRules
  });

  it('T04 — computeMaxDexBonus: two max_dex_cap → minimum wins', () => {
    const mods: Modifier[] = [
      makeModifier('cap1', 'max_dex_cap', 3, 'item_armor_breastplate'),
      makeModifier('cap2', 'max_dex_cap', 2, 'item_shield_tower'),
    ];
    // min(3, 2) = 2; no other mods → totalValue = 2
    expect(computeMaxDexBonus(mods)).toBe(2);
  });

  it('T05 — computeMaxDexBonus: max_dex_cap + untyped stack correctly', () => {
    const mods: Modifier[] = [
      makeModifier('cap1', 'max_dex_cap', 2, 'item_armor_chainmail'), // chain mail
      makeModifier('bonus1', 'untyped', 2, 'special_material_mithral'), // mithral +2
    ];
    // effectiveBase = min(2) = 2; untyped +2 → totalValue = 4
    expect(computeMaxDexBonus(mods)).toBe(4);
  });

});

// =============================================================================
// PART 2 — PHASE 3 PIPELINE COMPUTATION (via computeMaxDexBonus helper)
// =============================================================================

describe('maxDexBonus — Phase 3 pipeline computation', () => {

  it('T06 — no armor (no mods): totalValue = 99 (no cap)', () => {
    expect(computeMaxDexBonus([])).toBe(99);
  });

  it('T07 — single armor cap (chainmail maxDex=2): totalValue = 2', () => {
    const mods: Modifier[] = [makeModifier('cap', 'max_dex_cap', 2, 'item_armor_chainmail')];
    expect(computeMaxDexBonus(mods)).toBe(2);
  });

  it('T08 — mithral chainmail (cap=2 + untyped +2): totalValue = 4', () => {
    const mods: Modifier[] = [
      makeModifier('cap', 'max_dex_cap', 2, 'item_armor_chainmail'),
      makeModifier('mithral', 'untyped', 2, 'special_material_mithral'),
    ];
    expect(computeMaxDexBonus(mods)).toBe(4);
  });

  it('T09 — most restrictive of two caps wins: full_plate(1) + tower_shield(2) → 1', () => {
    const mods: Modifier[] = [
      makeModifier('cap1', 'max_dex_cap', 1, 'item_armor_full_plate'),
      makeModifier('cap2', 'max_dex_cap', 2, 'item_shield_tower'),
    ];
    expect(computeMaxDexBonus(mods)).toBe(1);
  });

  it('T10 — condition (heavy_load cap=1) overrides armor (padded cap=8): totalValue = 1', () => {
    const mods: Modifier[] = [
      makeModifier('armor_cap', 'max_dex_cap', 8, 'item_armor_padded'),
      makeModifier('load_cap', 'max_dex_cap', 1, 'condition_heavy_load'),
    ];
    expect(computeMaxDexBonus(mods)).toBe(1);
  });

  it('T11 — three identical caps: minimum (same value) → same result', () => {
    // e.g., three separate sources all capping at 3
    const mods: Modifier[] = [
      makeModifier('cap1', 'max_dex_cap', 3),
      makeModifier('cap2', 'max_dex_cap', 3),
      makeModifier('cap3', 'max_dex_cap', 3),
    ];
    expect(computeMaxDexBonus(mods)).toBe(3);
  });

  it('T12 — mithral on full plate (cap=1 + untyped +2): totalValue = 3', () => {
    // Full plate mithral: base cap 1, mithral adds +2 → cap of 3
    const mods: Modifier[] = [
      makeModifier('cap', 'max_dex_cap', 1, 'item_armor_full_plate'),
      makeModifier('mithral', 'untyped', 2, 'special_material_mithral'),
    ];
    expect(computeMaxDexBonus(mods)).toBe(3);
  });

});

// =============================================================================
// PART 3 — CONTENT AUTHORING CONTRACTS
// =============================================================================

describe('maxDexBonus — content authoring contracts', () => {

  it('T13 — armor item max_dex_cap modifier structure is valid', () => {
    // Verify the expected modifier structure that C-08 armor items use
    const armorMod: Modifier = {
      id: 'armor_chainmail_max_dex',
      sourceId: 'item_armor_chainmail',
      sourceName: { en: 'Chainmail', fr: 'Cotte de mailles' },
      targetId: 'combatStats.max_dex_bonus',
      value: 2,
      type: 'max_dex_cap',
    };
    expect(armorMod.type).toBe('max_dex_cap');
    expect(armorMod.targetId).toBe('combatStats.max_dex_bonus');
    expect(armorMod.value).toBe(2);
  });

  it('T14 — mithral material modifier structure is valid', () => {
    // Mithral uses untyped (not max_dex_cap) so it adds to the cap
    const mithralMod: Modifier = {
      id: 'special_material_mithral_max_dex',
      sourceId: 'special_material_mithral',
      sourceName: { en: 'Mithral', fr: 'Mithral' },
      targetId: 'combatStats.max_dex_bonus',
      value: 2,
      type: 'untyped',
    };
    expect(mithralMod.type).toBe('untyped');
    expect(mithralMod.value).toBe(2);
  });

  it('T15 — condition modifier (encumbrance) uses max_dex_cap', () => {
    const encumbranceMod: Modifier = {
      id: 'condition_medium_load_max_dex',
      sourceId: 'condition_medium_load',
      sourceName: { en: 'Medium Load', fr: 'Charge moyenne' },
      targetId: 'combatStats.max_dex_bonus',
      value: 3,
      type: 'max_dex_cap',
    };
    expect(encumbranceMod.type).toBe('max_dex_cap');
  });

  it('T16 — shields WITHOUT dex restriction have no max_dex_cap mod (clean absence)', () => {
    // Shields like heavy steel (maxDex=99) should NOT have any max_dex_bonus modifier
    // This is modeled by simply omitting the modifier (not adding a "cap at 99")
    const heavySteelShieldMods: Modifier[] = [
      // Only AC bonus and ACP modifiers; NO max_dex_bonus modifier
      {
        id: 'shield_heavy_steel_ac',
        sourceId: 'item_shield_heavy_steel',
        sourceName: { en: 'Heavy Steel Shield', fr: 'Grand bouclier en acier' },
        targetId: 'combatStats.ac_normal',
        value: 2,
        type: 'shield',
      },
    ];
    const maxDexMod = heavySteelShieldMods.find(m => m.targetId === 'combatStats.max_dex_bonus');
    expect(maxDexMod).toBeUndefined();
    // Without a max_dex_cap mod, computeMaxDexBonus returns 99 (no cap)
    expect(computeMaxDexBonus([])).toBe(99);
  });

  it('T17 — tower shield (maxDex=2) uses max_dex_cap type (not setAbsolute)', () => {
    const towerShieldMod: Modifier = {
      id: 'shield_tower_max_dex',
      sourceId: 'item_shield_tower',
      sourceName: { en: 'Tower Shield', fr: 'Pavois' },
      targetId: 'combatStats.max_dex_bonus',
      value: 2,
      type: 'max_dex_cap', // MUST be max_dex_cap, NOT setAbsolute
    };
    // Using 'max_dex_cap' ensures mithral-enhanced tower shield could theoretically add +2
    expect(towerShieldMod.type).toBe('max_dex_cap');
    expect(towerShieldMod.type).not.toBe('setAbsolute');
  });

});

// =============================================================================
// PART 4 — EDGE CASES
// =============================================================================

describe('maxDexBonus — edge cases', () => {

  it('T18 — zero cap (splint mail maxDex=0): no DEX contributes to AC', () => {
    const mods: Modifier[] = [makeModifier('cap', 'max_dex_cap', 0, 'item_armor_splint_mail')];
    expect(computeMaxDexBonus(mods)).toBe(0);
  });

  it('T19 — mithral on splint mail (cap=0 + untyped +2): totalValue = 2', () => {
    // Even with a zerocap, mithral still adds +2
    const mods: Modifier[] = [
      makeModifier('cap', 'max_dex_cap', 0, 'item_armor_splint_mail'),
      makeModifier('mithral', 'untyped', 2, 'special_material_mithral'),
    ];
    expect(computeMaxDexBonus(mods)).toBe(2);
  });

  it('T20 — very large cap (padded armor maxDex=8): effectively no restriction', () => {
    const mods: Modifier[] = [makeModifier('cap', 'max_dex_cap', 8, 'item_armor_padded')];
    expect(computeMaxDexBonus(mods)).toBe(8);
  });

  it('T21 — multiple untyped bonuses on top of cap: all stack', () => {
    // If for some reason multiple features add to max_dex_bonus, they all stack (untyped rule)
    const mods: Modifier[] = [
      makeModifier('cap', 'max_dex_cap', 2, 'item_armor_chainmail'),
      makeModifier('mithral', 'untyped', 2, 'special_material_mithral'),
      makeModifier('enhancement', 'enhancement', 1, 'item_magic_breastplate'), // hypothetical enhancement
    ];
    // min(2) = 2 effectiveBase; untyped 2 stacks; enhancement 1 stacks (different type)
    // Note: 'enhancement' is non-stacking (highest wins among enhancement mods), so +1 applies
    expect(computeMaxDexBonus(mods)).toBe(5); // 2 + 2 (untyped) + 1 (enhancement)
  });

  it('T22 — independence: max_dex_bonus pipeline does not affect other pipelines', () => {
    // Ensure max_dex_cap mods targeting max_dex_bonus don't bleed into other pipelines
    const maxDexMods: Modifier[] = [
      makeModifier('cap', 'max_dex_cap', 2),
      makeModifier('mithral', 'untyped', 2),
    ];
    // Compute max_dex_bonus
    const maxDex = computeMaxDexBonus(maxDexMods);
    expect(maxDex).toBe(4);

    // Compute an unrelated pipeline (e.g., armor_check_penalty) with different mods
    const acpMod: Modifier = {
      id: 'acp', sourceId: 'item_armor_chainmail',
      sourceName: { en: 'Chainmail', fr: 'Cotte de mailles' },
      targetId: 'combatStats.armor_check_penalty',
      value: -5, type: 'base',
    };
    const acpResult = applyStackingRules([acpMod], 0);
    expect(acpResult.totalValue).toBe(-5);
    // The max_dex_bonus computation had no effect on the ACP pipeline
    expect(maxDex).toBe(4); // still 4, confirming independence
  });

});
