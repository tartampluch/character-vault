/**
 * @file src/tests/scrollSpells.test.ts
 * @description Vitest unit tests for Enhancement E-12 — Scroll Spell List field.
 *
 * WHAT IS TESTED:
 *   The `scrollSpells` array on `ItemFeature` was added to support scrolls.
 *   Scrolls differ from wands and staves in four critical ways:
 *   1. `spellType: 'arcane' | 'divine'` — hard class restriction (arcane casters
 *      can only use arcane scrolls; divine casters only divine scrolls).
 *   2. `spellLevel` is REQUIRED (not optional) — needed to compute save DCs
 *      and caster level check DCs (checkDC = entry.casterLevel + 1).
 *   3. Item's own fixed CL — like wands, unlike staves.
 *   4. Single-use consumable (combined with `consumable.isConsumable: true`),
 *      NOT a charged item like wands/staves.
 *
 * TESTS (17):
 *
 * ─── TYPE SOUNDNESS (5) ──────────────────────────────────────────────────────
 *   1.  scrollSpells compiles with all required fields
 *   2.  spellType 'arcane' is a valid value
 *   3.  spellType 'divine' is a valid value
 *   4.  scrollSpells is optional — non-scroll items compile without it
 *   5.  spellLevel is required (NOT optional — this test confirms via value check)
 *
 * ─── CL CHECK MECHANICS (4) ──────────────────────────────────────────────────
 *   6.  CL check DC = entry.casterLevel + 1 (SRD rule)
 *   7.  No CL check needed when wielder CL >= scroll CL
 *   8.  CL check required when wielder CL < scroll CL
 *   9.  Standard CL per level: 0→1, 1→1, 2→3, 3→5, 4→7, 5→9, 6→11, 7→13, 8→15, 9→17
 *
 * ─── ARCANE VS DIVINE RESTRICTION (3) ────────────────────────────────────────
 *  10.  Arcane scroll cannot be used by divine casters (spellType discrimination)
 *  11.  Divine scroll cannot be used by arcane casters
 *  12.  Same spell can appear as both arcane and divine (separate scroll items)
 *
 * ─── SCROLL PRICE FORMULA (2) ────────────────────────────────────────────────
 *  13.  Standard price formula: CL × spellLevel × 25 gp (levels 1–9)
 *  14.  0th level price: 12.5 gp (special case, half of 1st-level formula)
 *
 * ─── COEXISTENCE & MULTI-SPELL (3) ───────────────────────────────────────────
 *  15.  scrollSpells coexists with consumable.isConsumable (no resourcePoolTemplates)
 *  16.  Multi-spell scroll (theoretically valid) compiles correctly
 *  17.  A scroll with no resourcePoolTemplates is correct (unlike wands/staves)
 *
 * @see src/lib/types/feature.ts   — ItemFeature.scrollSpells added by E-12a
 * @see ARCHITECTURE.md section 4.14 — Scroll Spell List contract
 */

import { describe, it, expect } from 'vitest';
import type { ItemFeature } from '../lib/types/feature';

// =============================================================================
// HELPERS
// =============================================================================

type ScrollSpell = NonNullable<ItemFeature['scrollSpells']>[number];

/** Standard SRD caster levels per spell level (minimum CL to cast) */
const STD_CL: Record<number, number> = {
  0: 1, 1: 1, 2: 3, 3: 5, 4: 7, 5: 9, 6: 11, 7: 13, 8: 15, 9: 17,
};

/** Standard SRD price per spell level (CL × spellLevel × 25 gp; 0th = 12.5 gp) */
function scrollPrice(spellLevel: number, cl?: number): number {
  if (spellLevel === 0) return 12.5;
  const useCL = cl ?? STD_CL[spellLevel];
  return spellLevel * useCL * 25;
}

function makeScroll(
  id: string,
  spells: ScrollSpell[],
  price: number
): ItemFeature {
  return {
    id,
    category: 'item',
    ruleSource: 'srd_core',
    label: { en: `Scroll (${id})`, fr: `Parchemin (${id})` },
    description: { en: 'test scroll', fr: 'parchemin de test' },
    tags: ['item', 'scroll', 'magic_item'],
    equipmentSlot: 'none',
    weightLbs: 0.1,
    costGp: price,
    hardness: 0,
    hpMax: 1,
    scrollSpells: spells,
    consumable: { isConsumable: true },
    grantedModifiers: [],
    grantedFeatures: [],
    // NOTE: No resourcePoolTemplates — scrolls are consumed, not charged
  };
}

function arcaneSpell(spellId: string, level: number, cl?: number): ScrollSpell {
  return { spellId, casterLevel: cl ?? STD_CL[level], spellLevel: level, spellType: 'arcane' };
}

function divineSpell(spellId: string, level: number, cl?: number): ScrollSpell {
  return { spellId, casterLevel: cl ?? STD_CL[level], spellLevel: level, spellType: 'divine' };
}

// =============================================================================
// TYPE SOUNDNESS
// =============================================================================

describe('Scroll Spells — Type Soundness', () => {

  it('1. scrollSpells compiles with all required fields', () => {
    const spell: ScrollSpell = {
      spellId: 'spell_fireball',
      casterLevel: 5,
      spellLevel: 3,
      spellType: 'arcane',
    };
    expect(spell.spellId).toBe('spell_fireball');
    expect(spell.casterLevel).toBe(5);
    expect(spell.spellLevel).toBe(3);
    expect(spell.spellType).toBe('arcane');
  });

  it('2. spellType "arcane" is a valid value', () => {
    const spell: ScrollSpell = {
      spellId: 'spell_magic_missile', casterLevel: 1, spellLevel: 1, spellType: 'arcane',
    };
    expect(spell.spellType).toBe('arcane');
  });

  it('3. spellType "divine" is a valid value', () => {
    const spell: ScrollSpell = {
      spellId: 'spell_cure_light_wounds', casterLevel: 1, spellLevel: 1, spellType: 'divine',
    };
    expect(spell.spellType).toBe('divine');
  });

  it('4. scrollSpells is optional — non-scroll items compile without it', () => {
    const ring: ItemFeature = {
      id: 'item_ring_test',
      category: 'item',
      ruleSource: 'srd_core',
      label: { en: 'Test Ring', fr: 'Anneau test' },
      description: { en: 'test', fr: 'test' },
      tags: ['item', 'ring', 'magic_item'],
      equipmentSlot: 'ring',
      weightLbs: 0, costGp: 2000,
      grantedModifiers: [], grantedFeatures: [],
    };
    expect(ring.scrollSpells).toBeUndefined();
  });

  it('5. spellLevel is always present (required, not optional)', () => {
    const spell: ScrollSpell = arcaneSpell('spell_fireball', 3);
    // TypeScript would reject omitting spellLevel — test that it's always present
    expect(typeof spell.spellLevel).toBe('number');
    expect(spell.spellLevel).toBe(3);
  });
});

// =============================================================================
// CL CHECK MECHANICS
// =============================================================================

describe('Scroll Spells — CL Check Mechanics', () => {

  it('6. CL check DC = entry.casterLevel + 1 (SRD rule)', () => {
    // SRD: "she has to make a caster level check (DC = scroll's caster level + 1)"
    const fireball = arcaneSpell('spell_fireball', 3); // CL 5
    const checkDC = fireball.casterLevel + 1;
    expect(checkDC).toBe(6);

    const wish = arcaneSpell('spell_wish', 9); // CL 17
    const wishDC = wish.casterLevel + 1;
    expect(wishDC).toBe(18);
  });

  it('7. No CL check needed when wielder CL >= scroll CL', () => {
    const fireball = arcaneSpell('spell_fireball', 3); // CL 5
    const wielderCL = 5;
    const checkRequired = wielderCL < fireball.casterLevel;
    expect(checkRequired).toBe(false);
  });

  it('8. CL check required when wielder CL < scroll CL', () => {
    const fireball = arcaneSpell('spell_fireball', 3); // CL 5
    const wielderCL = 3; // lower than scroll's CL 5
    const checkRequired = wielderCL < fireball.casterLevel;
    expect(checkRequired).toBe(true);
    // DC = scroll CL + 1 = 6
    const checkDC = fireball.casterLevel + 1;
    expect(checkDC).toBe(6);
  });

  it('9. Standard CL per level matches SRD table (0→1, 1→1, 2→3, 3→5, ... 9→17)', () => {
    const expected: Record<number, number> = {
      0: 1, 1: 1, 2: 3, 3: 5, 4: 7, 5: 9, 6: 11, 7: 13, 8: 15, 9: 17,
    };
    for (const [level, cl] of Object.entries(expected)) {
      expect(STD_CL[parseInt(level)]).toBe(cl);
    }
  });
});

// =============================================================================
// ARCANE VS DIVINE RESTRICTION
// =============================================================================

describe('Scroll Spells — Arcane vs. Divine Restriction', () => {

  it('10. spellType arcane blocks divine casters (example validation logic)', () => {
    const scroll = makeScroll('arcane_fireball', [arcaneSpell('spell_fireball', 3)], 375);
    const entry = scroll.scrollSpells![0];

    // CastingPanel validation: divine caster cannot use arcane scroll
    const isDivineCaster = true;
    const canUse = (isDivineCaster && entry.spellType === 'divine') ||
                   (!isDivineCaster && entry.spellType === 'arcane');
    expect(canUse).toBe(false); // divine caster cannot use arcane scroll
  });

  it('11. spellType divine blocks arcane casters', () => {
    const scroll = makeScroll('divine_clw', [divineSpell('spell_cure_light_wounds', 1)], 25);
    const entry = scroll.scrollSpells![0];

    const isArcaneCaster = true;
    const canUse = (!isArcaneCaster && entry.spellType === 'divine') ||
                   (isArcaneCaster && entry.spellType === 'arcane');
    expect(canUse).toBe(false); // arcane caster cannot use divine scroll
  });

  it('12. Same spell (summon monster I) appears as both arcane and divine scrolls', () => {
    // Summon monster I is on both the arcane and divine spell lists
    const arcaneScroll = makeScroll('arcane_sm1',
      [arcaneSpell('spell_summon_monster_i', 1)], 25);
    const divineScroll = makeScroll('divine_sm1',
      [divineSpell('spell_summon_monster_i', 1)], 25);

    expect(arcaneScroll.scrollSpells![0].spellType).toBe('arcane');
    expect(divineScroll.scrollSpells![0].spellType).toBe('divine');
    expect(arcaneScroll.scrollSpells![0].spellId).toBe(divineScroll.scrollSpells![0].spellId);
    expect(arcaneScroll.id).not.toBe(divineScroll.id); // different items
  });
});

// =============================================================================
// SCROLL PRICE FORMULA
// =============================================================================

describe('Scroll Spells — Price Formula', () => {

  it('13. Standard price formula: CL × spellLevel × 25 gp (levels 1–9)', () => {
    const cases: Array<[number, number, number]> = [
      [1, 1, 25],    // 1st level CL 1: 1×1×25 = 25
      [2, 3, 150],   // 2nd level CL 3: 2×3×25 = 150
      [3, 5, 375],   // 3rd level CL 5: 3×5×25 = 375
      [4, 7, 700],   // 4th level CL 7: 4×7×25 = 700
      [5, 9, 1125],  // 5th level CL 9: 5×9×25 = 1125
      [6, 11, 1650], // 6th level CL 11: 6×11×25 = 1650
      [7, 13, 2275], // 7th level CL 13: 7×13×25 = 2275
      [8, 15, 3000], // 8th level CL 15: 8×15×25 = 3000
      [9, 17, 3825], // 9th level CL 17: 9×17×25 = 3825
    ];
    for (const [level, cl, price] of cases) {
      expect(scrollPrice(level, cl)).toBe(price);
    }
  });

  it('14. 0th level price: 12.5 gp (special case — the SRD rounds this to "12 gp 5 sp")', () => {
    expect(scrollPrice(0)).toBe(12.5);
    // In the JSON we store costGp: 12.5 (or 12 with a note in description)
  });
});

// =============================================================================
// COEXISTENCE & MULTI-SPELL
// =============================================================================

describe('Scroll Spells — Coexistence and Multi-Spell', () => {

  it('15. scrollSpells coexists with consumable.isConsumable (no resourcePoolTemplates)', () => {
    const scroll = makeScroll('arcane_fireball', [arcaneSpell('spell_fireball', 3)], 375);
    expect(scroll.scrollSpells).toHaveLength(1);
    expect(scroll.consumable?.isConsumable).toBe(true);
    // Critically: NO resourcePoolTemplates — scroll is consumed, not charged
    expect(scroll.resourcePoolTemplates).toBeUndefined();
  });

  it('16. Multi-spell scroll compiles correctly (theoretically valid)', () => {
    // Scroll with 3 spells (minor scroll, 1d3 spells + max rolls)
    const scroll = makeScroll('scroll_multi', [
      arcaneSpell('spell_magic_missile', 1),
      arcaneSpell('spell_color_spray', 1),
      arcaneSpell('spell_enlarge_person', 1),
    ], 75);  // 25 gp × 3 spells

    expect(scroll.scrollSpells).toHaveLength(3);
    expect(scroll.scrollSpells?.every(s => s.spellType === 'arcane')).toBe(true);
    expect(scroll.scrollSpells?.every(s => s.spellLevel === 1)).toBe(true);
  });

  it('17. A scroll has no resourcePoolTemplates (unlike wands at 50 charges)', () => {
    // Wands: 50 charges in resourcePoolTemplates
    // Staves: 50 charges in resourcePoolTemplates
    // Scrolls: consumed once, no pool needed
    const scroll = makeScroll('arcane_clw', [arcaneSpell('spell_charm_person', 1)], 25);

    // The scroll has no charge pool — it's destroyed on use
    expect(scroll.resourcePoolTemplates).toBeUndefined();
    // But it IS a consumable
    expect(scroll.consumable?.isConsumable).toBe(true);
  });
});
