/**
 * @file src/tests/staffSpells.test.ts
 * @description Vitest unit tests for Enhancement E-10 — Staff Spell List field.
 *
 * WHAT IS TESTED:
 *   The `staffSpells` array on `ItemFeature` was added to support staves — items
 *   that store multiple spells at varying charge costs. The field pre-wires the
 *   CastingPanel contract so it can display available spells and deduct the
 *   correct number of charges when the wielder activates a staff spell.
 *
 * D&D 3.5 SRD — KEY RULES:
 *   - Staves start with 50 charges (resourcePoolTemplates, resetCondition: "never").
 *   - Each spell stored in a staff costs 1–5 charges to activate.
 *   - Staves use the wielder's caster level and ability modifier for DCs.
 *   - Some staves hold heightened spells (Staff of Power); the spellLevel field
 *     records the effective level, overriding the spell's base level.
 *
 * TESTS (15):
 *
 * ─── TYPE SOUNDNESS (4) ──────────────────────────────────────────────────────
 *   1.  All valid chargeCost values (1–5) compile
 *   2.  staffSpells is optional — non-staves compile without it
 *   3.  A single-spell staff entry compiles with all fields
 *   4.  spellLevel is optional — most entries omit it
 *
 * ─── FIELD CONTRACT (5) ──────────────────────────────────────────────────────
 *   5.  Staff of Healing — 4 spells with costs [1,1,2,3] all preserved
 *   6.  Staff of Life — Resurrection at 5 charges (max SRD value) preserved
 *   7.  Staff of Woodlands — Animate plants at 4 charges preserved
 *   8.  Staff of Power — heightened fireball at spellLevel 5 preserved
 *   9.  Empty staffSpells array is valid (edge case)
 *
 * ─── CHARGE COST RANGE (3) ───────────────────────────────────────────────────
 *  10.  chargeCost 1 is valid (minimum)
 *  11.  chargeCost 5 is valid (maximum, only resurrection)
 *  12.  All five charge cost values can appear in the same staff (theoretical)
 *
 * ─── REAL-WORLD COMBINATIONS (3) ─────────────────────────────────────────────
 *  13.  Staff coexists with resourcePoolTemplates (charges + spells together)
 *  14.  Staff coexists with weaponData (e.g., Staff of Woodlands = +2 quarterstaff)
 *  15.  Staff coexists with grantedModifiers (e.g., Staff of Power +2 luck AC/saves)
 *
 * @see src/lib/types/feature.ts   — ItemFeature.staffSpells added by E-10a
 * @see ARCHITECTURE.md section 4.12 — Staff Spell List contract
 */

import { describe, it, expect } from 'vitest';
import type { ItemFeature } from '../lib/types/feature';

// =============================================================================
// HELPERS
// =============================================================================

type StaffSpell = NonNullable<ItemFeature['staffSpells']>[number];

function makeStaff(id: string, spells: StaffSpell[], extras?: Partial<ItemFeature>): ItemFeature {
  return {
    id,
    category: 'item',
    ruleSource: 'srd_core',
    label: { en: `Staff (${id})`, fr: `Bâton (${id})` },
    description: { en: 'test staff', fr: 'bâton de test' },
    tags: ['item', 'staff', 'magic_item'],
    equipmentSlot: 'none',
    weightLbs: 5,
    costGp: 10000,
    grantedModifiers: [],
    grantedFeatures: [],
    staffSpells: spells,
    resourcePoolTemplates: [{
      poolId: 'charges',
      label: { en: 'Staff Charges (50)', fr: 'Charges de bâton (50)' },
      maxPipelineId: 'combatStats.staff_charges_max',
      defaultCurrent: 50,
      resetCondition: 'never',
    }],
    ...extras,
  };
}

// =============================================================================
// TYPE SOUNDNESS
// =============================================================================

describe('Staff Spells — Type Soundness', () => {

  it('1. All valid chargeCost values (1, 2, 3, 4, 5) compile correctly', () => {
    const costs: StaffSpell['chargeCost'][] = [1, 2, 3, 4, 5];
    expect(costs).toHaveLength(5);
    expect(new Set(costs).size).toBe(5); // All distinct
  });

  it('2. staffSpells is optional — non-staff items compile without it', () => {
    const wand: ItemFeature = {
      id: 'item_wand_fireball',
      category: 'item',
      ruleSource: 'srd_core',
      label: { en: 'Wand of Fireball', fr: 'Baguette de boule de feu' },
      description: { en: 'test wand', fr: 'baguette de test' },
      tags: ['item', 'wand', 'magic_item'],
      equipmentSlot: 'none',
      weightLbs: 1,
      costGp: 11250,
      grantedModifiers: [],
      grantedFeatures: [],
      // No staffSpells — should be valid
    };
    expect(wand.staffSpells).toBeUndefined();
  });

  it('3. A single-spell staff entry compiles with all fields (spellId + chargeCost + spellLevel)', () => {
    const entry: StaffSpell = {
      spellId: 'spell_fireball',
      chargeCost: 1,
      spellLevel: 5,  // heightened
    };
    expect(entry.spellId).toBe('spell_fireball');
    expect(entry.chargeCost).toBe(1);
    expect(entry.spellLevel).toBe(5);
  });

  it('4. spellLevel is optional — most entries omit it', () => {
    const entry: StaffSpell = {
      spellId: 'spell_charm_person',
      chargeCost: 1,
      // No spellLevel — valid for non-heightened spells
    };
    expect(entry.spellLevel).toBeUndefined();
  });
});

// =============================================================================
// FIELD CONTRACT
// =============================================================================

describe('Staff Spells — Field Contract', () => {

  it('5. Staff of Healing — 4 spells with costs [1,1,2,3] all preserved', () => {
    // From SRD: lesser restoration (1), cure serious wounds (1),
    // remove blindness/deafness (2), remove disease (3)
    const staff = makeStaff('item_staff_healing', [
      { spellId: 'spell_lesser_restoration',     chargeCost: 1 },
      { spellId: 'spell_cure_serious_wounds',     chargeCost: 1 },
      { spellId: 'spell_remove_blindness_deafness', chargeCost: 2 },
      { spellId: 'spell_remove_disease',          chargeCost: 3 },
    ]);

    expect(staff.staffSpells).toHaveLength(4);
    expect(staff.staffSpells![0]).toEqual({ spellId: 'spell_lesser_restoration', chargeCost: 1 });
    expect(staff.staffSpells![1]).toEqual({ spellId: 'spell_cure_serious_wounds', chargeCost: 1 });
    expect(staff.staffSpells![2]).toEqual({ spellId: 'spell_remove_blindness_deafness', chargeCost: 2 });
    expect(staff.staffSpells![3]).toEqual({ spellId: 'spell_remove_disease', chargeCost: 3 });
  });

  it('6. Staff of Life — Resurrection at 5 charges (maximum SRD value) preserved', () => {
    // From SRD: heal (1 charge), resurrection (5 charges)
    const staff = makeStaff('item_staff_life', [
      { spellId: 'spell_heal',         chargeCost: 1 },
      { spellId: 'spell_resurrection', chargeCost: 5 },
    ]);

    expect(staff.staffSpells).toHaveLength(2);
    expect(staff.staffSpells![1].spellId).toBe('spell_resurrection');
    expect(staff.staffSpells![1].chargeCost).toBe(5);
  });

  it('7. Staff of Woodlands — Animate plants at 4 charges preserved', () => {
    // From SRD: animate plants (4 charges) is the highest cost in this staff
    const staff = makeStaff('item_staff_woodlands', [
      { spellId: 'spell_charm_animal',      chargeCost: 1 },
      { spellId: 'spell_speak_with_animals', chargeCost: 1 },
      { spellId: 'spell_barkskin',          chargeCost: 2 },
      { spellId: 'spell_wall_of_thorns',    chargeCost: 3 },
      { spellId: 'spell_summon_natures_ally_vi', chargeCost: 3 },
      { spellId: 'spell_animate_plants',    chargeCost: 4 },
    ]);

    const animatePlants = staff.staffSpells!.find(s => s.spellId === 'spell_animate_plants');
    expect(animatePlants).toBeDefined();
    expect(animatePlants!.chargeCost).toBe(4);
  });

  it('8. Staff of Power — heightened fireball at spellLevel 5 preserved', () => {
    // From SRD: fireball is heightened to 5th level; base is 3rd level
    const staff = makeStaff('item_staff_power', [
      { spellId: 'spell_magic_missile',   chargeCost: 1 },
      { spellId: 'spell_ray_of_enfeeblement', chargeCost: 1, spellLevel: 5 }, // heightened
      { spellId: 'spell_continual_flame', chargeCost: 1 },
      { spellId: 'spell_levitate',        chargeCost: 1 },
      { spellId: 'spell_lightning_bolt',  chargeCost: 1, spellLevel: 5 }, // heightened
      { spellId: 'spell_fireball',        chargeCost: 1, spellLevel: 5 }, // heightened
      { spellId: 'spell_cone_of_cold',    chargeCost: 2 },
      { spellId: 'spell_hold_monster',    chargeCost: 2 },
      { spellId: 'spell_wall_of_force',   chargeCost: 2 },
      { spellId: 'spell_globe_of_invulnerability', chargeCost: 2 },
    ]);

    const fireball = staff.staffSpells!.find(s => s.spellId === 'spell_fireball');
    expect(fireball).toBeDefined();
    expect(fireball!.chargeCost).toBe(1);
    expect(fireball!.spellLevel).toBe(5); // Heightened to 5th

    const lightningBolt = staff.staffSpells!.find(s => s.spellId === 'spell_lightning_bolt');
    expect(lightningBolt!.spellLevel).toBe(5); // Also heightened

    const coneOfCold = staff.staffSpells!.find(s => s.spellId === 'spell_cone_of_cold');
    expect(coneOfCold!.spellLevel).toBeUndefined(); // Not heightened
  });

  it('9. Empty staffSpells array is valid (edge case — no spells loaded)', () => {
    const staff = makeStaff('item_staff_empty', []);
    expect(staff.staffSpells).toHaveLength(0);
    expect(staff.staffSpells).toEqual([]);
  });
});

// =============================================================================
// CHARGE COST RANGE
// =============================================================================

describe('Staff Spells — Charge Cost Range', () => {

  it('10. chargeCost 1 is valid (minimum — most common staff spells)', () => {
    const entry: StaffSpell = { spellId: 'spell_charm_person', chargeCost: 1 };
    expect(entry.chargeCost).toBe(1);
  });

  it('11. chargeCost 5 is valid (maximum — Resurrection on Staff of Life)', () => {
    const entry: StaffSpell = { spellId: 'spell_resurrection', chargeCost: 5 };
    expect(entry.chargeCost).toBe(5);
  });

  it('12. All five charge cost values can appear in the same staff', () => {
    // Theoretical max-cost spread; only Staff of Life reaches 5 in SRD
    const staff = makeStaff('item_staff_all_costs', [
      { spellId: 'spell_a', chargeCost: 1 },
      { spellId: 'spell_b', chargeCost: 2 },
      { spellId: 'spell_c', chargeCost: 3 },
      { spellId: 'spell_d', chargeCost: 4 },
      { spellId: 'spell_e', chargeCost: 5 },
    ]);

    const costs = staff.staffSpells!.map(s => s.chargeCost);
    expect(costs).toEqual([1, 2, 3, 4, 5]);
    // Total cost if all used once = 15 charges
    expect(costs.reduce((a, b) => a + b, 0)).toBe(15);
  });
});

// =============================================================================
// REAL-WORLD COMBINATIONS
// =============================================================================

describe('Staff Spells — Real-World Field Combinations', () => {

  it('13. staffSpells coexists with resourcePoolTemplates (realistic charged staff)', () => {
    const staff = makeStaff('item_staff_fire', [
      { spellId: 'spell_burning_hands', chargeCost: 1 },
      { spellId: 'spell_fireball',      chargeCost: 1 },
      { spellId: 'spell_wall_of_fire',  chargeCost: 2 },
    ]);
    expect(staff.staffSpells).toHaveLength(3);
    expect(staff.resourcePoolTemplates).toHaveLength(1);
    expect(staff.resourcePoolTemplates![0].poolId).toBe('charges');
    expect(staff.resourcePoolTemplates![0].defaultCurrent).toBe(50);
    expect(staff.resourcePoolTemplates![0].resetCondition).toBe('never');
  });

  it('14. staffSpells coexists with weaponData (Staff of Woodlands = +2 quarterstaff)', () => {
    const staff = makeStaff('item_staff_woodlands_combo', [
      { spellId: 'spell_charm_animal', chargeCost: 1 },
    ], {
      weaponData: {
        wieldCategory: 'two_handed',
        damageDice: '1d6',
        damageType: ['bludgeoning'],
        critRange: '20',
        critMultiplier: 2,
        reachFt: 5,
      },
    });
    expect(staff.staffSpells).toHaveLength(1);
    expect(staff.weaponData).toBeDefined();
    expect(staff.weaponData!.damageDice).toBe('1d6');
  });

  it('15. staffSpells coexists with grantedModifiers (Staff of Power +2 luck AC/saves)', () => {
    const staff = makeStaff('item_staff_power_combo', [
      { spellId: 'spell_magic_missile', chargeCost: 1 },
      { spellId: 'spell_fireball',      chargeCost: 1, spellLevel: 5 },
    ], {
      grantedModifiers: [
        {
          id: 'staff_power_luck_ac',
          sourceId: 'item_staff_power_combo',
          sourceName: { en: 'Staff of Power', fr: 'Bâton de puissance' },
          targetId: 'combatStats.ac_normal',
          value: 2,
          type: 'luck',
        },
        {
          id: 'staff_power_luck_saves_fort',
          sourceId: 'item_staff_power_combo',
          sourceName: { en: 'Staff of Power', fr: 'Bâton de puissance' },
          targetId: 'saves.fort',
          value: 2,
          type: 'luck',
        },
      ],
    });
    expect(staff.staffSpells).toHaveLength(2);
    expect(staff.grantedModifiers).toHaveLength(2);
    expect(staff.grantedModifiers[0].type).toBe('luck');
    // Heightened fireball is still correctly filed
    const fb = staff.staffSpells!.find(s => s.spellId === 'spell_fireball');
    expect(fb!.spellLevel).toBe(5);
  });
});
