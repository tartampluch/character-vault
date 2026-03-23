/**
 * @file src/tests/metamagicRods.test.ts
 * @description Vitest unit tests for Enhancement E-9 — Metamagic Rod field.
 *
 * WHAT IS TESTED:
 *   The `metamagicEffect` field on `ItemFeature` was added to support Metamagic
 *   Rods — items that allow applying a metamagic feat to a spell without occupying
 *   a higher spell slot. The field is purely a type contract; the charging mechanics
 *   (3 uses/day) are handled by `resourcePoolTemplates`.
 *
 * D&D 3.5 SRD rule:
 *   "Metamagic rods hold the essence of a metamagic feat but do NOT change the
 *   spell slot of the altered spell."
 *   - Lesser rods: spells up to 3rd level
 *   - Normal rods: spells up to 6th level
 *   - Greater rods: spells up to 9th level
 *   - Each rod: 3 uses per day
 *
 * TESTS (12):
 *
 * ─── TYPE SOUNDNESS (6) ──────────────────────────────────────────────────────
 *   1.  All 6 metamagic feats are valid `feat` values (compile-time check)
 *   2.  All 3 maxSpellLevel values (3, 6, 9) are valid (compile-time check)
 *   3.  Rod of Empower (lesser) — feat + maxSpellLevel correctly typed
 *   4.  Rod of Quicken (greater) — highest tier correctly typed
 *   5.  metamagicEffect is optional — non-rods compile without it
 *   6.  An ItemFeature with metamagicEffect but no weaponData/armorData compiles
 *
 * ─── FIELD CONTRACT (4) ──────────────────────────────────────────────────────
 *   7.  feat value is preserved exactly after assignment
 *   8.  maxSpellLevel value is preserved exactly after assignment
 *   9.  Can distinguish lesser/normal/greater by maxSpellLevel
 *  10.  A rod can have both metamagicEffect AND resourcePoolTemplates (realistic)
 *
 * ─── ALL 6 SRD FEATS DISTINCT (2) ────────────────────────────────────────────
 *  11.  All 6 feat values are distinct strings
 *  12.  Two rods of the same tier but different feats have different feat values
 *
 * @see src/lib/types/feature.ts  — ItemFeature.metamagicEffect added by E-9a
 * @see ARCHITECTURE.md section 4.11 — Metamagic Rod contract
 */

import { describe, it, expect } from 'vitest';
import type { ItemFeature } from '../lib/types/feature';

// =============================================================================
// HELPERS — build minimal ItemFeature objects
// =============================================================================

function makeRod(
  feat: ItemFeature['metamagicEffect'] extends undefined ? never : NonNullable<ItemFeature['metamagicEffect']>['feat'],
  maxSpellLevel: 3 | 6 | 9,
  id: string
): ItemFeature {
  return {
    id,
    category: 'item',
    ruleSource: 'srd_core',
    label: { en: `Rod of ${feat}`, fr: `Baguette de ${feat}` },
    description: { en: 'test rod', fr: 'baguette de test' },
    tags: ['item', 'rod', 'magic_item'],
    equipmentSlot: 'none',
    weightLbs: 5,
    costGp: 9000,
    grantedModifiers: [],
    grantedFeatures: [],
    metamagicEffect: { feat, maxSpellLevel },
    resourcePoolTemplates: [{
      poolId: 'metamagic_uses',
      label: { en: '3 uses/day', fr: '3 utilisations/jour' },
      maxPipelineId: 'combatStats.metamagic_uses_max',
      defaultCurrent: 3,
      resetCondition: 'per_day',
    }],
  };
}

// =============================================================================
// TYPE SOUNDNESS TESTS
// =============================================================================

describe('Metamagic Rod — Type Soundness', () => {

  it('1. All 6 metamagic feats compile as valid feat values', () => {
    // Each assignment would fail to compile if the union type were wrong.
    const feats: NonNullable<ItemFeature['metamagicEffect']>['feat'][] = [
      'feat_empower_spell',
      'feat_enlarge_spell',
      'feat_extend_spell',
      'feat_maximize_spell',
      'feat_quicken_spell',
      'feat_silent_spell',
    ];
    expect(feats).toHaveLength(6);
    // Verify all 6 are distinct values
    expect(new Set(feats).size).toBe(6);
  });

  it('2. All 3 maxSpellLevel values (3, 6, 9) compile correctly', () => {
    const levels: NonNullable<ItemFeature['metamagicEffect']>['maxSpellLevel'][] = [3, 6, 9];
    expect(levels).toHaveLength(3);
    expect(levels).toContain(3);
    expect(levels).toContain(6);
    expect(levels).toContain(9);
  });

  it('3. Rod of Empower (lesser) — feat and maxSpellLevel correctly typed', () => {
    const rod: ItemFeature = {
      id: 'item_rod_metamagic_empower_lesser',
      category: 'item',
      ruleSource: 'srd_core',
      label: { en: 'Rod of Metamagic Empower (Lesser)', fr: 'Baguette de sort amplifié (inférieure)' },
      description: { en: '3 empowered spells/day, max 3rd level.', fr: '3 sorts amplifiés/jour, max niveau 3.' },
      tags: ['item', 'rod', 'magic_item'],
      equipmentSlot: 'none',
      weightLbs: 5,
      costGp: 9000,
      grantedModifiers: [],
      grantedFeatures: [],
      metamagicEffect: {
        feat: 'feat_empower_spell',
        maxSpellLevel: 3,
      },
    };
    expect(rod.metamagicEffect?.feat).toBe('feat_empower_spell');
    expect(rod.metamagicEffect?.maxSpellLevel).toBe(3);
  });

  it('4. Rod of Quicken (greater) — highest tier correctly typed', () => {
    const rod = makeRod('feat_quicken_spell', 9, 'item_rod_metamagic_quicken_greater');
    expect(rod.metamagicEffect?.feat).toBe('feat_quicken_spell');
    expect(rod.metamagicEffect?.maxSpellLevel).toBe(9);
  });

  it('5. metamagicEffect is optional — non-rod items compile without it', () => {
    const ring: ItemFeature = {
      id: 'item_ring_of_protection_1',
      category: 'item',
      ruleSource: 'srd_core',
      label: { en: 'Ring of Protection +1', fr: 'Anneau de protection +1' },
      description: { en: '+1 deflection AC.', fr: '+1 parade CA.' },
      tags: ['item', 'ring', 'magic_item'],
      equipmentSlot: 'ring',
      weightLbs: 0,
      costGp: 2000,
      grantedModifiers: [],
      grantedFeatures: [],
      // No metamagicEffect — should compile perfectly
    };
    expect(ring.metamagicEffect).toBeUndefined();
  });

  it('6. An ItemFeature with metamagicEffect but no weaponData/armorData compiles', () => {
    const rod = makeRod('feat_extend_spell', 6, 'item_rod_metamagic_extend');
    // Rod has metamagicEffect but no weaponData or armorData (both are optional)
    expect(rod.weaponData).toBeUndefined();
    expect(rod.armorData).toBeUndefined();
    expect(rod.metamagicEffect).toBeDefined();
  });
});

// =============================================================================
// FIELD CONTRACT TESTS
// =============================================================================

describe('Metamagic Rod — Field Contract', () => {

  it('7. feat value is preserved exactly after assignment', () => {
    const rod = makeRod('feat_maximize_spell', 6, 'item_rod_metamagic_maximize');
    expect(rod.metamagicEffect!.feat).toBe('feat_maximize_spell');
    // Verify it's exactly the string, not mutated
    expect(rod.metamagicEffect!.feat).toHaveLength('feat_maximize_spell'.length);
  });

  it('8. maxSpellLevel value is preserved exactly after assignment', () => {
    const lesser  = makeRod('feat_empower_spell', 3, 'rod_empower_lesser');
    const normal  = makeRod('feat_empower_spell', 6, 'rod_empower_normal');
    const greater = makeRod('feat_empower_spell', 9, 'rod_empower_greater');

    expect(lesser.metamagicEffect!.maxSpellLevel).toBe(3);
    expect(normal.metamagicEffect!.maxSpellLevel).toBe(6);
    expect(greater.metamagicEffect!.maxSpellLevel).toBe(9);
  });

  it('9. Can distinguish lesser/normal/greater by maxSpellLevel', () => {
    const rods = [
      makeRod('feat_silent_spell', 3, 'rod_silent_lesser'),
      makeRod('feat_silent_spell', 6, 'rod_silent_normal'),
      makeRod('feat_silent_spell', 9, 'rod_silent_greater'),
    ];

    const tierOf = (rod: ItemFeature): string => {
      switch (rod.metamagicEffect?.maxSpellLevel) {
        case 3: return 'lesser';
        case 6: return 'normal';
        case 9: return 'greater';
        default: return 'unknown';
      }
    };

    expect(tierOf(rods[0])).toBe('lesser');
    expect(tierOf(rods[1])).toBe('normal');
    expect(tierOf(rods[2])).toBe('greater');
  });

  it('10. A realistic rod has both metamagicEffect AND resourcePoolTemplates', () => {
    const rod = makeRod('feat_enlarge_spell', 3, 'item_rod_metamagic_enlarge_lesser');

    // Verify metamagicEffect
    expect(rod.metamagicEffect?.feat).toBe('feat_enlarge_spell');
    expect(rod.metamagicEffect?.maxSpellLevel).toBe(3);

    // Verify resourcePoolTemplates for 3 uses/day
    expect(rod.resourcePoolTemplates).toBeDefined();
    expect(rod.resourcePoolTemplates).toHaveLength(1);
    const pool = rod.resourcePoolTemplates![0];
    expect(pool.poolId).toBe('metamagic_uses');
    expect(pool.defaultCurrent).toBe(3);
    expect(pool.resetCondition).toBe('per_day');
  });
});

// =============================================================================
// ALL 6 SRD FEATS TESTS
// =============================================================================

describe('Metamagic Rod — All 6 SRD Feats', () => {

  it('11. All 6 feat values are distinct strings (no duplicates)', () => {
    const allFeats: NonNullable<ItemFeature['metamagicEffect']>['feat'][] = [
      'feat_empower_spell',
      'feat_enlarge_spell',
      'feat_extend_spell',
      'feat_maximize_spell',
      'feat_quicken_spell',
      'feat_silent_spell',
    ];
    const uniqueFeats = new Set(allFeats);
    expect(uniqueFeats.size).toBe(allFeats.length); // All 6 are distinct
  });

  it('12. Two rods of the same tier but different feats have different feat values', () => {
    const rodEmpower = makeRod('feat_empower_spell', 6, 'rod_empower_normal');
    const rodExtend  = makeRod('feat_extend_spell', 6, 'rod_extend_normal');

    expect(rodEmpower.metamagicEffect?.maxSpellLevel).toBe(6);
    expect(rodExtend.metamagicEffect?.maxSpellLevel).toBe(6);

    // Same tier, different feat
    expect(rodEmpower.metamagicEffect?.feat).not.toBe(rodExtend.metamagicEffect?.feat);
    expect(rodEmpower.metamagicEffect?.feat).toBe('feat_empower_spell');
    expect(rodExtend.metamagicEffect?.feat).toBe('feat_extend_spell');
  });
});
