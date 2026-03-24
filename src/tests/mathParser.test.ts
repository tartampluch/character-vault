/**
 * @file src/tests/mathParser.test.ts
 * @description Vitest unit tests for the Math Parser (evaluateFormula).
 *
 * Tests all special path patterns from ARCHITECTURE.md section 4.3:
 *   - @attributes.<id>.totalValue
 *   - @attributes.<id>.derivedModifier
 *   - @attributes.<id>.baseValue
 *   - @skills.<id>.ranks
 *   - @combatStats.<id>.totalValue
 *   - @characterLevel    — sum of classLevels only (excludes levelAdjustment)
 *   - @eclForXp          — sum of classLevels + levelAdjustment (for XP table lookups)
 *   - @classLevels.<classId>
 *   - @activeTags (via has_tag in logicEvaluator, not directly in mathParser)
 *   - @selection.<choiceId>
 *   - |distance pipe
 *   - |weight pipe
 *   - Unresolved paths → returns 0 (no crash)
 *   - floor() and math operations
 *
 * ECL / Level Adjustment (ARCHITECTURE.md section 4.3, 6, and 6.4):
 *   Standard PCs (levelAdjustment = 0):  @eclForXp === @characterLevel
 *   Monster PCs  (levelAdjustment > 0):  @eclForXp === @characterLevel + levelAdjustment
 *   The distinction matters for XP-table lookups — a Drow Rogue 3 (LA +2) needs
 *   the same XP as a 5th-level character, even though she only has 3 class levels.
 *
 * @see src/lib/utils/mathParser.ts
 * @see ARCHITECTURE.md section 4.3
 * @see ARCHITECTURE.md section 6.4 (Level Adjustment and ECL — Monster PCs)
 * @see ARCHITECTURE.md Phase 17.1
 */

import { describe, it, expect } from 'vitest';
import { evaluateFormula, interpolateDescription } from '$lib/utils/mathParser';
import type { CharacterContext } from '$lib/utils/mathParser';

// ============================================================
// MOCK CONTEXT
// ============================================================

/**
 * A mock CharacterContext for testing formula evaluation.
 * Mimics a character with STR 18 (+4 mod), DEX 14 (+2 mod), CON 12 (+1 mod).
 */
const mockContext: CharacterContext = {
  attributes: {
    stat_strength: { baseValue: 18, totalValue: 18, derivedModifier: 4 },
    stat_dexterity: { baseValue: 14, totalValue: 14, derivedModifier: 2 },
    stat_constitution: { baseValue: 12, totalValue: 12, derivedModifier: 1 },
    stat_intelligence: { baseValue: 10, totalValue: 10, derivedModifier: 0 },
    stat_wisdom: { baseValue: 8,  totalValue: 8,  derivedModifier: -1 },
    stat_charisma: { baseValue: 6,  totalValue: 6,  derivedModifier: -2 },
    speed_land: { baseValue: 30, totalValue: 40, derivedModifier: 0 },
    speed_fly: { baseValue: 0, totalValue: 60, derivedModifier: 0 },
    // Simulated caster_level for spell formulas (see ARCHITECTURE.md A.7 Soulknife)
    caster_level: { baseValue: 0, totalValue: 8, derivedModifier: 0 },
  },
  skills: {
    skill_climb: { ranks: 5, totalValue: 9 },
    skill_hide: { ranks: 3, totalValue: 5 },
    'skill_knowledge-arcana': { ranks: 8, totalValue: 8 }, // Hyphenated ID (important test case)
  },
  combatStats: {
    // NOTE: In the real engine, the GameEngine strips the "combatStats." prefix when building the context,
    // so the key is stored as the flat part of the pipeline ID (e.g., "base_attack_bonus", not "combatStats.base_attack_bonus").
    // The @combatStats.X.totalValue path traversal works because the path segments map exactly to flat keys.
    base_attack_bonus: { totalValue: 6 },
    ac_normal: { totalValue: 18 },
  },
  saves: {
    fortitude: { totalValue: 5 },
  },
  characterLevel: 8,
  eclForXp: 8,
  classLevels: {
    'class_fighter': 5,
    'class_wizard': 3,
  },
  activeTags: ['race_human', 'class_fighter', 'alignment_lawful_good'],
  equippedWeaponTags: ['weapon', 'longsword', 'martial'],
  selection: {
    'weapon_choice': ['item_longsword'],
    'domain_choice_1': ['domain_war'],
  },
  constants: {
    'darkvision_range': 60,
    'barbarian_fast_movement_bonus': 10,
  },
};

// ============================================================
// BASIC PATH RESOLUTION TESTS
// ============================================================

describe('evaluateFormula — @attributes paths', () => {
  it('resolves @attributes.stat_strength.totalValue', () => {
    const result = evaluateFormula('@attributes.stat_strength.totalValue', mockContext, 'en');
    expect(result).toBe(18);
  });

  it('resolves @attributes.stat_strength.derivedModifier', () => {
    const result = evaluateFormula('@attributes.stat_strength.derivedModifier', mockContext, 'en');
    expect(result).toBe(4);
  });

  it('resolves @attributes.stat_strength.baseValue', () => {
    const result = evaluateFormula('@attributes.stat_strength.baseValue', mockContext, 'en');
    expect(result).toBe(18);
  });

  it('resolves @attributes.stat_wisdom.derivedModifier (negative)', () => {
    const result = evaluateFormula('@attributes.stat_wisdom.derivedModifier', mockContext, 'en');
    expect(result).toBe(-1);
  });
});

describe('evaluateFormula — @skills paths', () => {
  it('resolves @skills.skill_climb.ranks', () => {
    const result = evaluateFormula('@skills.skill_climb.ranks', mockContext, 'en');
    expect(result).toBe(5);
  });

  it('resolves @skills.skill_hide.totalValue', () => {
    const result = evaluateFormula('@skills.skill_hide.totalValue', mockContext, 'en');
    expect(result).toBe(5);
  });

  it('resolves @skills with hyphenated ID (skill_knowledge-arcana)', () => {
    // ARCHITECTURE.md Phase 1 fix: hyphenated IDs must be supported
    const result = evaluateFormula('@skills.skill_knowledge-arcana.ranks', mockContext, 'en');
    expect(result).toBe(8);
  });
});

describe('evaluateFormula — @combatStats paths', () => {
  it('resolves @combatStats.base_attack_bonus.totalValue (flat key in context)', () => {
    // The path @combatStats.base_attack_bonus.totalValue traverses context.combatStats['base_attack_bonus'].totalValue
    // In test context, we use flat keys (no dots in key names).
    const result = evaluateFormula('@combatStats.base_attack_bonus.totalValue', mockContext, 'en');
    expect(result).toBe(6);
  });

  it('resolves @combatStats.ac_normal.totalValue', () => {
    const result = evaluateFormula('@combatStats.ac_normal.totalValue', mockContext, 'en');
    expect(result).toBe(18);
  });
});

// ============================================================
// MONSTER PC CONTEXT — Drow Rogue 3 with Level Adjustment +2
// ============================================================

/**
 * Drow Rogue 3 — a canonical monster PC example (ARCHITECTURE.md section 6.4):
 *   classLevels:     { "class_rogue": 3 }
 *   levelAdjustment: 2
 *
 *   @characterLevel  = 3  (class levels only — used for feats, HP, max ranks)
 *   @eclForXp        = 5  (3 + LA 2 — used for XP table lookups and wealth)
 *
 * This character is as powerful as a 5th-level character for balance purposes,
 * but she only has Rogue levels 1–3 for class features, skill points, and feats.
 */
const monsterPcContext: CharacterContext = {
  attributes: {
    stat_strength: { baseValue: 10, totalValue: 10, derivedModifier: 0 },
    stat_dexterity: { baseValue: 14, totalValue: 14, derivedModifier: 2 },
    stat_intelligence: { baseValue: 12, totalValue: 12, derivedModifier: 1 },
    stat_wisdom: { baseValue: 10, totalValue: 10, derivedModifier: 0 },
    stat_charisma: { baseValue: 10, totalValue: 10, derivedModifier: 0 },
    stat_constitution: { baseValue: 10, totalValue: 10, derivedModifier: 0 },
  },
  skills: {
    skill_hide:         { ranks: 3,  totalValue: 5 },
    skill_move_silently:{ ranks: 3,  totalValue: 5 },
    skill_sneak:        { ranks: 3,  totalValue: 5 },
  },
  combatStats: {
    base_attack_bonus: { totalValue: 2 },  // Rogue 3 with 3/4 BAB = +2
  },
  saves: {},
  // classLevels sum = 3; levelAdjustment = 2; eclForXp = 5
  characterLevel: 3,
  eclForXp: 5,
  classLevels: { 'class_rogue': 3 },
  activeTags: ['race_drow', 'class_rogue', 'alignment_chaotic_neutral'],
  equippedWeaponTags: ['weapon', 'short_sword', 'light', 'martial'],
  selection: {},
  constants: {},
};

// ============================================================
// @characterLevel PATH TESTS
// ============================================================

describe('evaluateFormula — @characterLevel', () => {
  it('resolves @characterLevel for a standard PC (Fighter 5 / Wizard 3 = 8)', () => {
    const result = evaluateFormula('@characterLevel', mockContext, 'en');
    expect(result).toBe(8);
  });

  it('resolves @characterLevel for a monster PC (Drow Rogue 3, LA +2 = 3)', () => {
    // CRITICAL: @characterLevel must return 3, not 5.
    // levelAdjustment is NOT included here — only class levels count.
    // This ensures feats, HP, and skill max ranks are based on actual class levels.
    // @see ARCHITECTURE.md section 4.3 and 6.4
    const result = evaluateFormula('@characterLevel', monsterPcContext, 'en');
    expect(result).toBe(3);
  });

  it('@characterLevel equals @eclForXp for a standard PC with no level adjustment', () => {
    // For all standard PC races (levelAdjustment = 0), both paths return the same value.
    const cl  = evaluateFormula('@characterLevel', mockContext, 'en');
    const ecl = evaluateFormula('@eclForXp',       mockContext, 'en');
    expect(cl).toBe(ecl);
  });
});

// ============================================================
// @eclForXp PATH TESTS (ARCHITECTURE.md section 4.3, 6.4 — Phase 1.5 / 3.5)
// ============================================================

describe('evaluateFormula — @eclForXp (Level Adjustment support)', () => {
  /**
   * Standard PC (LA = 0): @eclForXp === @characterLevel
   * ARCHITECTURE.md section 6.4: "For standard PC races with levelAdjustment = 0,
   * eclForXp === characterLevel."
   */
  it('resolves @eclForXp for a standard PC (Fighter 5 / Wizard 3 = 8, LA 0 → ECL 8)', () => {
    const result = evaluateFormula('@eclForXp', mockContext, 'en');
    expect(result).toBe(8);
  });

  /**
   * Monster PC (LA = 2): @eclForXp = @characterLevel + levelAdjustment
   * Drow Rogue 3 (LA +2): ECL = 3 + 2 = 5.
   * Used to look up the XP required for level 4 Rogue: config_xp_table[6].xpRequired.
   */
  it('resolves @eclForXp for a monster PC (Drow Rogue 3, LA +2 → ECL 5)', () => {
    const result = evaluateFormula('@eclForXp', monsterPcContext, 'en');
    expect(result).toBe(5);
  });

  it('@eclForXp is HIGHER than @characterLevel for a monster PC with LA > 0', () => {
    // The whole point of this distinction: ECL > character level when LA > 0.
    // evaluateFormula returns string | number; cast to number for arithmetic comparison.
    const cl  = evaluateFormula('@characterLevel', monsterPcContext, 'en') as number;
    const ecl = evaluateFormula('@eclForXp',       monsterPcContext, 'en') as number;
    expect(ecl).toBeGreaterThan(cl);
    expect(ecl - cl).toBe(2); // LA = +2
  });

  /**
   * Half-Dragon Fighter 4 (LA +3): ECL = 4 + 3 = 7.
   * Used to verify that a large LA correctly makes ECL much higher than character level.
   */
  it('resolves @eclForXp for Half-Dragon Fighter 4 (LA +3 → ECL 7)', () => {
    const halfDragonCtx: CharacterContext = {
      ...monsterPcContext,
      characterLevel: 4,
      eclForXp: 7,   // 4 + LA 3
      classLevels: { 'class_fighter': 4 },
      activeTags: ['race_half_dragon', 'class_fighter', 'template_half_dragon'],
    };
    const cl  = evaluateFormula('@characterLevel', halfDragonCtx, 'en') as number;
    const ecl = evaluateFormula('@eclForXp',       halfDragonCtx, 'en') as number;
    expect(cl).toBe(4);
    expect(ecl).toBe(7);
    expect(ecl - cl).toBe(3);  // LA = +3
  });

  it('@eclForXp can be used in a floor formula (XP threshold multiplier)', () => {
    // Example formula from config_xp_table lookup helper:
    //   "(@eclForXp - 1) * 1000"  — simplistic XP needed at ECL N
    // For Drow Rogue 3 (eclForXp = 5): (5 - 1) * 1000 = 4000
    const result = evaluateFormula('(@eclForXp - 1) * 1000', monsterPcContext, 'en');
    expect(result).toBe(4000);
  });

  it('@eclForXp formula: floor(@eclForXp / 2) for ECL 5 → 2', () => {
    // Some CR / encounter budget formulae use floor(ECL / 2)
    const result = evaluateFormula('floor(@eclForXp / 2)', monsterPcContext, 'en');
    expect(result).toBe(2); // floor(5 / 2) = 2
  });
});

describe('evaluateFormula — @classLevels paths', () => {
  it('resolves @classLevels.class_fighter', () => {
    const result = evaluateFormula('@classLevels.class_fighter', mockContext, 'en');
    expect(result).toBe(5);
  });

  it('resolves @classLevels.class_wizard', () => {
    const result = evaluateFormula('@classLevels.class_wizard', mockContext, 'en');
    expect(result).toBe(3);
  });

  it('returns 0 for unknown class level', () => {
    const result = evaluateFormula('@classLevels.class_barbarian', mockContext, 'en');
    expect(result).toBe(0);
  });
});

// ============================================================
// MATHEMATICAL EXPRESSIONS
// ============================================================

describe('evaluateFormula — math operations', () => {
  it('evaluates simple arithmetic: "10 + 2"', () => {
    expect(evaluateFormula('10 + 2', mockContext, 'en')).toBe(12);
  });

  it('evaluates complex order of operations: "(10 + 2) * 1.5"', () => {
    expect(evaluateFormula('(10 + 2) * 1.5', mockContext, 'en')).toBe(18);
  });

  it('evaluates floor: "floor(7 / 2)"', () => {
    expect(evaluateFormula('floor(7 / 2)', mockContext, 'en')).toBe(3);
  });

  it('evaluates floor with path: "floor(@attributes.stat_strength.totalValue / 2)"', () => {
    // floor(18 / 2) = 9
    const result = evaluateFormula('floor(@attributes.stat_strength.totalValue / 2)', mockContext, 'en');
    expect(result).toBe(9);
  });

  it('evaluates formula with derivedModifier: "3 + @attributes.stat_charisma.derivedModifier"', () => {
    // 3 + (-2) = 1
    const result = evaluateFormula('3 + @attributes.stat_charisma.derivedModifier', mockContext, 'en');
    expect(result).toBe(1);
  });

  it('evaluates two-handed damage formula: "floor(@attributes.stat_strength.derivedModifier * 1.5)"', () => {
    // floor(4 * 1.5) = floor(6) = 6
    const result = evaluateFormula('floor(@attributes.stat_strength.derivedModifier * 1.5)', mockContext, 'en');
    expect(result).toBe(6);
  });

  it('evaluates classLevel formula: "floor(@classLevels.class_soulknife / 4)"', () => {
    // class_soulknife not in context → 0, floor(0/4) = 0
    const result = evaluateFormula('floor(@classLevels.class_soulknife / 4)', mockContext, 'en');
    expect(result).toBe(0);
  });

  it('evaluates Psychic Strike formula at level 9: floor(9 / 4) = 2', () => {
    const ctxWith9 = { ...mockContext, classLevels: { 'class_soulknife': 9 } };
    const result = evaluateFormula('floor(@classLevels.class_soulknife / 4)', ctxWith9 as CharacterContext, 'en');
    expect(result).toBe(2);
  });
});

// ============================================================
// UNRESOLVED PATH TESTS
// ============================================================

describe('evaluateFormula — unresolved paths', () => {
  it('returns 0 for unknown attribute path (no crash)', () => {
    const result = evaluateFormula('@attributes.stat_nonexistent.totalValue', mockContext, 'en');
    expect(result).toBe(0);
  });

  it('returns 0 for deeply unknown path (no crash)', () => {
    const result = evaluateFormula('@something.completely.unknown', mockContext, 'en');
    expect(result).toBe(0);
  });

  it('returns 0 for empty formula', () => {
    const result = evaluateFormula('', mockContext, 'en');
    expect(result).toBe(0);
  });

  it('returns string "0" or number 0 — does NOT crash on invalid formula', () => {
    // A malformed formula like "NOTVALID" should not throw
    expect(() => evaluateFormula('NOTVALID', mockContext, 'en')).not.toThrow();
  });
});

// ============================================================
// PIPE RESOLUTION TESTS
// ============================================================

describe('evaluateFormula / interpolateDescription — |distance pipe', () => {
  it('resolves |distance pipe for English (ft.)', () => {
    // English: 40 feet → "40 ft."
    const result = interpolateDescription(
      'Your speed is {@attributes.speed_land.totalValue|distance}.',
      mockContext,
      'en'
    );
    expect(result).toContain('40 ft.');
  });

  it('resolves |distance pipe for French (m)', () => {
    // French: 40 feet * 0.3 = 12 m
    const result = interpolateDescription(
      'Votre vitesse est de {@attributes.speed_land.totalValue|distance}.',
      mockContext,
      'fr'
    );
    expect(result).toContain('12 m');
  });

  it('resolves |distance pipe with non-standard speed (60 ft = fly)', () => {
    const result = interpolateDescription(
      'Fly speed: {@attributes.speed_fly.totalValue|distance}',
      mockContext,
      'en'
    );
    expect(result).toContain('60 ft.');
  });
});

describe('evaluateFormula / interpolateDescription — |weight pipe', () => {
  it('resolves |weight pipe for English via @constant (lb.)', () => {
    // darkvision_range = 60 feet. Treated as a number for weight pipe test.
    // NOTE: The |weight pipe requires @-path resolution.
    // Direct literals like {10|weight} don't work since the regex requires @prefix.
    // Use @constant.darkvision_range|weight to test the pipe.
    const result = interpolateDescription(
      'Weight: {@constant.darkvision_range|weight}',
      mockContext,
      'en'
    );
    expect(result).toContain('60 lb.');
  });

  it('resolves |weight pipe for French via @constant (kg)', () => {
    // French: 60 lbs * 0.5 = 30 kg
    const result = interpolateDescription(
      'Poids : {@constant.darkvision_range|weight}',
      mockContext,
      'fr'
    );
    expect(result).toContain('30 kg');
  });
});

// ============================================================
// @selection PATH TESTS
// ============================================================

describe('evaluateFormula — @selection paths', () => {
  it('resolves @selection.weapon_choice', () => {
    // selection returns the first selected value
    const ctxWithSelection: CharacterContext = {
      ...mockContext,
      selection: { 'weapon_choice': ['item_longsword'] },
    };
    // Note: @selection returns the array, not a number
    // evaluateFormula is designed for numeric results — test that it doesn't crash
    expect(() => evaluateFormula('@selection.weapon_choice', ctxWithSelection as CharacterContext, 'en')).not.toThrow();
  });
});

// ============================================================
// @master.classLevels PATH TESTS (MINOR fix #3)
// (ARCHITECTURE.md section 4.3 — LinkedEntity companion formulas)
// ============================================================

describe('evaluateFormula — @master.classLevels paths (LinkedEntity companion formulas)', () => {
  /**
   * ARCHITECTURE.md section 4.3:
   *   "@master.classLevels.<classId>" — The master character's class level.
   *   Used by LinkedEntity formulas (familiar, animal companion, mount, summon)
   *   to scale the companion's abilities based on the master's class level.
   *
   *   Example: An Animal Companion's Hit Dice formula might be:
   *     "floor(@master.classLevels.class_druid / 2)"
   *   so a Druid 8 would grant a 4 HD companion.
   *
   * IMPLEMENTATION NOTE:
   *   The CharacterContext for a LinkedEntity includes a "master" sub-context
   *   OR, in the current implementation, the @master.classLevels path is resolved
   *   by walking the context object. If the context has a "master" property with
   *   classLevels, the path resolves to the master's class level.
   *
   *   Current implementation: The mathParser resolves nested paths by splitting on "."
   *   and walking the object tree. A context with { master: { classLevels: {...} } }
   *   would support @master.classLevels.class_druid.
   */
  it('resolves @master.classLevels.class_druid when master context is present', () => {
    // Simulate a CharacterContext for a Druid's Animal Companion
    // The context has a "master" field with the master's class levels
    const companionContext = {
      ...mockContext,
      // The 'constants' field can carry master data in the current implementation
      // (the master context is injected as nested properties)
      master: {
        classLevels: {
          'class_druid': 8,
        },
      },
    } as unknown as CharacterContext;

    // The formula "@master.classLevels.class_druid" should resolve to 8
    const result = evaluateFormula('@master.classLevels.class_druid', companionContext, 'en');
    expect(result).toBe(8);
  });

  it('Animal Companion HD formula: floor(@master.classLevels.class_druid / 2) at Druid 8 = 4', () => {
    // A Druid 8 has an Animal Companion with floor(8/2) = 4 HD.
    const companionContext = {
      ...mockContext,
      master: {
        classLevels: { 'class_druid': 8 },
      },
    } as unknown as CharacterContext;

    const result = evaluateFormula('floor(@master.classLevels.class_druid / 2)', companionContext, 'en');
    expect(result).toBe(4); // floor(8/2) = 4 HD
  });

  it('returns 0 for @master.classLevels when no master context provided', () => {
    // When a character is not a LinkedEntity, no "master" is present.
    // The formula should safely return 0 (not crash).
    const result = evaluateFormula('@master.classLevels.class_druid', mockContext, 'en');
    expect(result).toBe(0); // No master → safely returns 0
  });
});

// ============================================================
// @constant PATH TESTS
// ============================================================

describe('evaluateFormula — @constant paths', () => {
  it('resolves @constant.darkvision_range', () => {
    const result = evaluateFormula('@constant.darkvision_range', mockContext, 'en');
    expect(result).toBe(60);
  });

  it('resolves @constant.barbarian_fast_movement_bonus', () => {
    const result = evaluateFormula('@constant.barbarian_fast_movement_bonus', mockContext, 'en');
    expect(result).toBe(10);
  });

  it('resolves |distance on constant: "{@constant.barbarian_fast_movement_bonus|distance}"', () => {
    const result = interpolateDescription(
      'This barbarian moves {@constant.barbarian_fast_movement_bonus|distance} faster.',
      mockContext,
      'en'
    );
    expect(result).toContain('10 ft.');
  });
});
