/**
 * @file src/tests/wandSpell.test.ts
 * @description Vitest unit tests for Enhancement E-11 — Wand Spell field.
 *
 * WHAT IS TESTED:
 *   The `wandSpell` field on `ItemFeature` was added to support wands — items
 *   that hold a single spell at a fixed caster level. The field pre-wires the
 *   CastingPanel contract so it can identify the spell, apply the correct CL,
 *   and handle heightened variants.
 *
 * D&D 3.5 SRD — KEY RULES:
 *   - A wand holds exactly ONE spell (≤ 4th level).
 *   - Each use costs exactly 1 charge.
 *   - Wands use their OWN fixed caster level (not the wielder's).
 *   - Some wands store heightened spells (e.g., Charm person to 3rd level,
 *     Hold person to 4th level, Ray of enfeeblement to 4th, Suggestion to 4th).
 *   - 50 charges created; runs out → just a stick.
 *
 * WHY `casterLevel` MATTERS:
 *   "Magic missile" appears at CL 1 (1 missile), CL 3 (2 missiles), CL 5 (3),
 *   CL 7 (4 missiles), CL 9 (5 missiles). "Fireball" appears at CL 5 (5d6),
 *   CL 6 (6d6), CL 8 (8d6), CL 10 (10d6). Same spell ID, vastly different
 *   damage — the CL is essential data for the CastingPanel.
 *
 * TESTS (16):
 *
 * ─── TYPE SOUNDNESS (4) ──────────────────────────────────────────────────────
 *   1.  wandSpell compiles with required fields only (spellId + casterLevel)
 *   2.  wandSpell with spellLevel (heightened) compiles
 *   3.  wandSpell is optional — non-wand items compile without it
 *   4.  casterLevel is a plain number (not an enum — any valid CL accepted)
 *
 * ─── CASTER LEVEL VARIANTS (5) ───────────────────────────────────────────────
 *   5.  Magic missile CL 1 and CL 9 have different casterLevel
 *   6.  Fireball CL 5 (5d6) and CL 10 (10d6) are distinguishable
 *   7.  casterLevel 1 is valid (minimum wand CL)
 *   8.  casterLevel 10 is valid (maximum standard wand CL per SRD table)
 *   9.  Two wands with same spellId but different CL represent different items
 *
 * ─── HEIGHTENED SPELL VARIANTS (4) ───────────────────────────────────────────
 *  10.  Charm person heightened to 3rd level — spellLevel: 3 preserved
 *  11.  Hold person heightened to 4th level — spellLevel: 4 preserved
 *  12.  Ray of enfeeblement heightened to 4th level — spellLevel: 4 preserved
 *  13.  Suggestion heightened to 4th level — spellLevel: 4 preserved
 *
 * ─── FIELD COEXISTENCE (3) ───────────────────────────────────────────────────
 *  14.  wandSpell coexists with resourcePoolTemplates (charges pool)
 *  15.  spellLevel absent for non-heightened wands
 *  16.  Can build all 5 Magic Missile CL variants as distinct ItemFeature objects
 *
 * @see src/lib/types/feature.ts  — ItemFeature.wandSpell added by E-11a
 * @see ARCHITECTURE.md section 4.13 — Wand Spell contract
 */

import { describe, it, expect } from 'vitest';
import type { ItemFeature } from '../lib/types/feature';

// =============================================================================
// HELPERS
// =============================================================================

function makeWand(
  id: string,
  spellId: string,
  casterLevel: number,
  price: number,
  spellLevel?: number
): ItemFeature {
  const spell: NonNullable<ItemFeature['wandSpell']> = { spellId, casterLevel };
  if (spellLevel !== undefined) spell.spellLevel = spellLevel;

  return {
    id,
    category: 'item',
    ruleSource: 'srd_core',
    label: { en: `Wand (${id})`, fr: `Baguette (${id})` },
    description: { en: 'test wand', fr: 'baguette de test' },
    tags: ['item', 'wand', 'magic_item'],
    equipmentSlot: 'none',
    weightLbs: 0.1,
    costGp: price,
    hardness: 5,
    hpMax: 5,
    wandSpell: spell,
    grantedModifiers: [],
    grantedFeatures: [],
    resourcePoolTemplates: [{
      poolId: 'charges',
      label: { en: 'Wand Charges (50)', fr: 'Charges de baguette (50)' },
      maxPipelineId: 'combatStats.wand_charges_max',
      defaultCurrent: 50,
      resetCondition: 'never',
    }],
  };
}

// =============================================================================
// TYPE SOUNDNESS
// =============================================================================

describe('Wand Spell — Type Soundness', () => {

  it('1. wandSpell compiles with required fields only (spellId + casterLevel)', () => {
    const wand: ItemFeature = makeWand('item_wand_cure_light', 'spell_cure_light_wounds', 1, 750);
    expect(wand.wandSpell?.spellId).toBe('spell_cure_light_wounds');
    expect(wand.wandSpell?.casterLevel).toBe(1);
    expect(wand.wandSpell?.spellLevel).toBeUndefined();
  });

  it('2. wandSpell with spellLevel (heightened) compiles correctly', () => {
    const wand: ItemFeature = {
      id: 'item_wand_charm_person_heightened_3',
      category: 'item',
      ruleSource: 'srd_core',
      label: { en: 'Wand of Charm Person (Heightened 3rd)', fr: 'Baguette de charme-personne (amplifié 3e)' },
      description: { en: 'test', fr: 'test' },
      tags: ['item', 'wand', 'magic_item'],
      equipmentSlot: 'none',
      weightLbs: 0.1,
      costGp: 11250,
      grantedModifiers: [],
      grantedFeatures: [],
      wandSpell: {
        spellId: 'spell_charm_person',
        casterLevel: 5,
        spellLevel: 3,  // heightened to 3rd level
      },
    };
    expect(wand.wandSpell?.spellLevel).toBe(3);
  });

  it('3. wandSpell is optional — non-wand items compile without it', () => {
    const ring: ItemFeature = {
      id: 'item_ring_test',
      category: 'item',
      ruleSource: 'srd_core',
      label: { en: 'Ring Test', fr: 'Anneau test' },
      description: { en: 'test', fr: 'test' },
      tags: ['item', 'ring', 'magic_item'],
      equipmentSlot: 'ring',
      weightLbs: 0,
      costGp: 2000,
      grantedModifiers: [],
      grantedFeatures: [],
      // No wandSpell — should be perfectly valid
    };
    expect(ring.wandSpell).toBeUndefined();
  });

  it('4. casterLevel is a plain number (any valid CL accepted, no enum restriction)', () => {
    // Verify a range of valid CL values all compile
    const cls = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 15, 20];
    cls.forEach(cl => {
      const wand = makeWand(`test_cl_${cl}`, 'spell_fireball', cl, 1000);
      expect(wand.wandSpell?.casterLevel).toBe(cl);
    });
  });
});

// =============================================================================
// CASTER LEVEL VARIANTS
// =============================================================================

describe('Wand Spell — Caster Level Variants', () => {

  it('5. Magic missile CL 1 and CL 9 have distinct casterLevel values', () => {
    // CL 1 fires 1 missile; CL 9 fires 5 missiles — mechanically very different
    const mm_cl1 = makeWand('item_wand_magic_missile_cl1', 'spell_magic_missile', 1, 750);
    const mm_cl9 = makeWand('item_wand_magic_missile_cl9', 'spell_magic_missile', 9, 6750);

    expect(mm_cl1.wandSpell?.spellId).toBe('spell_magic_missile');
    expect(mm_cl9.wandSpell?.spellId).toBe('spell_magic_missile');
    expect(mm_cl1.wandSpell?.casterLevel).toBe(1);
    expect(mm_cl9.wandSpell?.casterLevel).toBe(9);
    expect(mm_cl1.wandSpell?.casterLevel).not.toBe(mm_cl9.wandSpell?.casterLevel);
  });

  it('6. Fireball CL 5 and CL 10 are distinguishable by casterLevel', () => {
    // CL 5 = 5d6 damage; CL 10 = 10d6 damage
    const fb_cl5  = makeWand('item_wand_fireball_cl5',  'spell_fireball', 5, 11250);
    const fb_cl10 = makeWand('item_wand_fireball_cl10', 'spell_fireball', 10, 22500);

    expect(fb_cl5.wandSpell?.casterLevel).toBe(5);
    expect(fb_cl10.wandSpell?.casterLevel).toBe(10);
    // Damage varies by CL: 5d6 vs 10d6
    expect(fb_cl10.wandSpell?.casterLevel).toBe(fb_cl5.wandSpell!.casterLevel * 2);
  });

  it('7. casterLevel 1 is valid (minimum wand CL — detect magic, light, CLW)', () => {
    const wand = makeWand('item_wand_detect_magic', 'spell_detect_magic', 1, 375);
    expect(wand.wandSpell?.casterLevel).toBe(1);
  });

  it('8. casterLevel 10 is valid (maximum standard CL in SRD wand table)', () => {
    // Fireball (10th), Lightning bolt (10th), Dispel magic (10th) all at CL 10
    const wand = makeWand('item_wand_fireball_cl10_max', 'spell_fireball', 10, 22500);
    expect(wand.wandSpell?.casterLevel).toBe(10);
  });

  it('9. Two wands with same spellId but different CL represent different items', () => {
    const wands = [
      makeWand('item_wand_mm_1', 'spell_magic_missile', 1, 750),
      makeWand('item_wand_mm_3', 'spell_magic_missile', 3, 2250),
      makeWand('item_wand_mm_5', 'spell_magic_missile', 5, 3750),
      makeWand('item_wand_mm_7', 'spell_magic_missile', 7, 5250),
      makeWand('item_wand_mm_9', 'spell_magic_missile', 9, 6750),
    ];

    // All have same spellId
    expect(wands.every(w => w.wandSpell?.spellId === 'spell_magic_missile')).toBe(true);
    // All have different casterLevels
    const cls = wands.map(w => w.wandSpell?.casterLevel);
    expect(new Set(cls).size).toBe(5); // All distinct
    // Monotonically increasing
    expect(cls).toEqual([1, 3, 5, 7, 9]);
  });
});

// =============================================================================
// HEIGHTENED SPELL VARIANTS
// =============================================================================

describe('Wand Spell — Heightened Spell Variants', () => {

  it('10. Charm person heightened to 3rd level — spellLevel 3 preserved', () => {
    // SRD: "Charm person, heightened (3rd-level spell)" costs 11,250 gp
    const wand = makeWand('item_wand_charm_person_hgt3', 'spell_charm_person', 5, 11250, 3);
    expect(wand.wandSpell?.spellId).toBe('spell_charm_person');
    expect(wand.wandSpell?.casterLevel).toBe(5);
    expect(wand.wandSpell?.spellLevel).toBe(3);
  });

  it('11. Hold person heightened to 4th level — spellLevel 4 preserved', () => {
    // SRD: "Hold person, heightened (4th level)" costs 21,000 gp
    const wand = makeWand('item_wand_hold_person_hgt4', 'spell_hold_person', 7, 21000, 4);
    expect(wand.wandSpell?.spellLevel).toBe(4);
  });

  it('12. Ray of enfeeblement heightened to 4th level — spellLevel 4 preserved', () => {
    // SRD: "Ray of enfeeblement, heightened (4th level)" costs 21,000 gp
    const wand = makeWand('item_wand_ray_of_enf_hgt4', 'spell_ray_of_enfeeblement', 7, 21000, 4);
    expect(wand.wandSpell?.spellId).toBe('spell_ray_of_enfeeblement');
    expect(wand.wandSpell?.spellLevel).toBe(4);
  });

  it('13. Suggestion heightened to 4th level — spellLevel 4 preserved', () => {
    // SRD: "Suggestion, heightened (4th level)" costs 21,000 gp
    const wand = makeWand('item_wand_suggestion_hgt4', 'spell_suggestion', 7, 21000, 4);
    expect(wand.wandSpell?.spellLevel).toBe(4);
  });
});

// =============================================================================
// FIELD COEXISTENCE
// =============================================================================

describe('Wand Spell — Field Coexistence', () => {

  it('14. wandSpell coexists with resourcePoolTemplates (50 charges, never reset)', () => {
    const wand = makeWand('item_wand_fireball_cl5_coexist', 'spell_fireball', 5, 11250);
    expect(wand.wandSpell?.spellId).toBe('spell_fireball');
    expect(wand.resourcePoolTemplates).toHaveLength(1);
    const pool = wand.resourcePoolTemplates![0];
    expect(pool.poolId).toBe('charges');
    expect(pool.defaultCurrent).toBe(50);
    expect(pool.resetCondition).toBe('never');
  });

  it('15. spellLevel absent for non-heightened wands (regular fireball, CLW, etc.)', () => {
    const wand = makeWand('item_wand_fireball_normal', 'spell_fireball', 5, 11250);
    // No spellLevel — regular fireball at base 3rd level
    expect(wand.wandSpell?.spellLevel).toBeUndefined();

    // DC for fireball = 10 + 3 (base level) + int modifier (not 10 + spellLevel)
    // CastingPanel uses spell's base level when spellLevel is absent
    expect(wand.wandSpell?.spellId).toBe('spell_fireball');
    expect(wand.wandSpell?.casterLevel).toBe(5);
  });

  it('16. Can build all 5 Magic Missile CL variants as distinct valid ItemFeature objects', () => {
    // The SRD table lists 5 variants: CL 1, 3, 5, 7, 9 → missile counts 1, 2, 3, 4, 5
    const variants = [
      { cl: 1, price: 750,  missiles: 1 },
      { cl: 3, price: 2250, missiles: 2 },
      { cl: 5, price: 3750, missiles: 3 },
      { cl: 7, price: 5250, missiles: 4 },
      { cl: 9, price: 6750, missiles: 5 },
    ];

    const wands = variants.map(({ cl, price }) =>
      makeWand(`item_wand_magic_missile_cl${cl}`, 'spell_magic_missile', cl, price)
    );

    // All are valid wand items
    wands.forEach((wand, i) => {
      expect(wand.category).toBe('item');
      expect(wand.wandSpell?.spellId).toBe('spell_magic_missile');
      expect(wand.wandSpell?.casterLevel).toBe(variants[i].cl);
      expect(wand.wandSpell?.spellLevel).toBeUndefined(); // MM is not heightened
    });

    // Magic missile count = Math.ceil(casterLevel / 2)
    wands.forEach((wand, i) => {
      const expectedMissiles = variants[i].missiles;
      const computedMissiles = Math.ceil(wand.wandSpell!.casterLevel / 2);
      expect(computedMissiles).toBe(expectedMissiles);
    });
  });
});
