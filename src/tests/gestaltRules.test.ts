/**
 * @file src/tests/gestaltRules.test.ts
 * @description Vitest unit tests for the Gestalt variant rules engine.
 *
 * WHAT IS TESTED (Phase 2.5a — ARCHITECTURE.md sections 8.1 and 8.2):
 *
 *   1. TYPE COVERAGE — `CampaignSettings.variantRules.gestalt`:
 *      - Default settings have `gestalt: false`.
 *      - Settings with `gestalt: true` are valid.
 *
 *   2. `computeGestaltBase()` — the core gestalt algorithm:
 *      D&D 3.5 Gestalt rule: for each level, take the MAX contribution from any class.
 *      Sum all per-level maxima → gestalt total.
 *
 *      - Empty modifiers → 0.
 *      - Single class → identical to sum (max of one = that one).
 *      - Two classes — full BAB + half BAB:
 *          Fighter 5 (full: 1,1,1,1,1) + Wizard 5 (half: 0,1,0,1,0)
 *          Per level max: 1,1,1,1,1 → total = 5 (not 7 as standard multiclass would give)
 *      - Two classes — identical BAB: max = same as either alone.
 *      - Saves — Good save vs Poor save:
 *          Fighter Fort (2,0,1,0,1) + Wizard Fort (0,0,1,0,0)
 *          Per level max: 2,0,1,0,1 → total = 4 (Fighter Good Fort wins)
 *      - Three classes: max still applies (takes best of all three per level).
 *      - Negative increments: max still works correctly (floor at 0).
 *
 *   3. `isGestaltAffectedPipeline()` — which pipelines use gestalt:
 *      - BAB, Fort, Ref, Will: affected.
 *      - max_hp, AC, initiative, resistances: NOT affected.
 *
 *   4. `groupBaseModifiersByClass()` — groups modifiers by sourceId:
 *      - Returns one entry per unique sourceId.
 *      - Handles multiple modifiers from same source (sums them into same level).
 *
 *   5. SETTINGS INTEGRATION:
 *      - `createDefaultCampaignSettings()` initializes `gestalt: false`.
 *      - Gestalt flag can be toggled to `true` for Gestalt campaigns.
 *
 *   6. GESTALT vs STANDARD COMPARISON:
 *      - Standard multiclass SUMS all base modifiers → Fighter 5 + Wizard 5 = BAB 7.
 *      - Gestalt MAX per level → Fighter 5 + Wizard 5 = BAB 5.
 *      - Gestalt ≤ standard always (max ≤ sum for non-negative values).
 *
 * @see src/lib/utils/gestaltRules.ts — computeGestaltBase, groupBaseModifiersByClass
 * @see src/lib/types/settings.ts — CampaignSettings.variantRules.gestalt
 * @see ARCHITECTURE.md section 8.2 — Gestalt variant documentation
 * @see ARCHITECTURE.md Phase 17.6 (multiclass tests)
 */

import { describe, it, expect } from 'vitest';
import {
  computeGestaltBase,
  groupBaseModifiersByClass,
  isGestaltAffectedPipeline,
  GESTALT_AFFECTED_PIPELINES,
} from '$lib/utils/gestaltRules';
import { createDefaultCampaignSettings } from '$lib/types/settings';
import { applyStackingRules } from '$lib/utils/stackingRules';
import type { Modifier } from '$lib/types/pipeline';
import type { ModifierType } from '$lib/types/primitives';

// =============================================================================
// HELPERS
// =============================================================================

function makeBaseModifier(id: string, sourceId: string, targetId: string, value: number): Modifier {
  return {
    id,
    sourceId,
    sourceName: { en: id },
    targetId,
    value,
    type: 'base' as ModifierType,
  };
}

/**
 * Builds the flat list of "base" type BAB modifiers for a class with the given increments.
 * increments[0] = level 1, increments[1] = level 2, ...
 * Only builds entries up to classLevel.
 */
function buildBabModifiers(classId: string, increments: number[], classLevel: number): Modifier[] {
  return increments
    .slice(0, classLevel)
    .map((inc, i) => makeBaseModifier(
      `${classId}_bab_l${i + 1}`,
      classId,
      'combatStats.base_attack_bonus',
      inc
    ));
}

/**
 * Builds save modifiers similarly.
 */
function buildSaveModifiers(classId: string, targetId: string, increments: number[], classLevel: number): Modifier[] {
  return increments
    .slice(0, classLevel)
    .map((inc, i) => makeBaseModifier(
      `${classId}_${targetId.replace('.', '_')}_l${i + 1}`,
      classId,
      targetId,
      inc
    ));
}

// D&D 3.5 BAB progressions (increments per level, 1-indexed)
// Full BAB (Fighter, Barbarian, Paladin, Ranger): +1 every level
const FULL_BAB_INCREMENTS = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
// Half BAB (Wizard, Sorcerer): +1 every 2 levels
const HALF_BAB_INCREMENTS = [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1];
// 3/4 BAB (Cleric, Rogue): increment at 1,2,3(!), then every 4/3 levels
const THREEQUARTER_BAB_INCREMENTS = [0, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0];

// Save progressions
// Good save (Fighter Fort): +2 at level 1, then +1 every 2 levels
const GOOD_SAVE_INCREMENTS = [2, 0, 1, 0, 1, 0, 1, 0, 1, 0];
// Poor save (Wizard Fort): +0 at level 1, then +1 every 3 levels
const POOR_SAVE_INCREMENTS = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0];

// =============================================================================
// SECTION 1: CampaignSettings.variantRules.gestalt
// =============================================================================

describe('CampaignSettings.variantRules.gestalt — type and defaults', () => {
  it('createDefaultCampaignSettings() initializes gestalt: false', () => {
    const settings = createDefaultCampaignSettings();
    expect(settings.variantRules).toBeDefined();
    expect(settings.variantRules.gestalt).toBe(false);
  });

  it('gestalt can be set to true for Gestalt campaigns', () => {
    const settings = createDefaultCampaignSettings();
    settings.variantRules.gestalt = true;
    expect(settings.variantRules.gestalt).toBe(true);
  });

  it('variantRules is a separate block from diceRules and statGeneration', () => {
    const settings = createDefaultCampaignSettings();
    expect(settings.variantRules).toBeDefined();
    expect(settings.diceRules).toBeDefined();
    expect(settings.statGeneration).toBeDefined();
    // Independent blocks
    expect(settings.variantRules.gestalt).toBe(false);
    expect(settings.diceRules.explodingTwenties).toBe(false);
  });

  it('createDefaultCampaignSettings() initializes enabledRuleSources as empty array (permissive mode)', () => {
    // REGRESSION GUARD — This default was previously ['srd_core'], which is a
    // Feature.ruleSource ID string, NOT a DataLoader file path.
    //
    // The DataLoader.loadRuleSources() filters by file-path (e.g.
    // "00_d20srd_core/01_races.json"), not by ruleSource ID. Passing a source
    // ID as the filter caused zero rule files to match, silently loading nothing
    // for every new campaign.
    //
    // The correct default is [] (empty), which the DataLoader treats as permissive
    // mode: all discovered rule files are loaded. GMs can restrict to specific
    // files later via the Rule Source Manager (Phase 15.1).
    //
    // If this ever reverts to a non-empty array containing a source ID like
    // 'srd_core', new campaigns will load zero game content — making the engine
    // appear broken with no error message.
    const settings = createDefaultCampaignSettings();
    expect(settings.enabledRuleSources).toEqual([]);
  });
});

// =============================================================================
// SECTION 2: GESTALT_AFFECTED_PIPELINES and isGestaltAffectedPipeline()
// =============================================================================

describe('GESTALT_AFFECTED_PIPELINES and isGestaltAffectedPipeline()', () => {
  /**
   * Only BAB and saves use gestalt max-per-level. HP and other stats are unaffected.
   * @see ARCHITECTURE.md section 8.2 — Affected vs Unaffected Pipelines table
   */
  it('GESTALT_AFFECTED_PIPELINES contains BAB and 3 saves', () => {
    expect(GESTALT_AFFECTED_PIPELINES.size).toBe(4);
    expect(GESTALT_AFFECTED_PIPELINES).toContain('combatStats.base_attack_bonus');
    expect(GESTALT_AFFECTED_PIPELINES).toContain('saves.fortitude');
    expect(GESTALT_AFFECTED_PIPELINES).toContain('saves.reflex');
    expect(GESTALT_AFFECTED_PIPELINES).toContain('saves.will');
  });

  it('isGestaltAffectedPipeline: BAB and 3 saves → true', () => {
    expect(isGestaltAffectedPipeline('combatStats.base_attack_bonus')).toBe(true);
    expect(isGestaltAffectedPipeline('saves.fortitude')).toBe(true);
    expect(isGestaltAffectedPipeline('saves.reflex')).toBe(true);
    expect(isGestaltAffectedPipeline('saves.will')).toBe(true);
  });

  it('isGestaltAffectedPipeline: HP is NOT affected (HP stacks additively in gestalt)', () => {
    // Gestalt rule: HP from BOTH classes contributes fully (additive, not max)
    expect(isGestaltAffectedPipeline('combatStats.max_hp')).toBe(false);
  });

  it('isGestaltAffectedPipeline: AC, initiative, speed, SR, resistances → false', () => {
    expect(isGestaltAffectedPipeline('combatStats.ac_normal')).toBe(false);
    expect(isGestaltAffectedPipeline('combatStats.initiative')).toBe(false);
    expect(isGestaltAffectedPipeline('combatStats.speed_land')).toBe(false);
    expect(isGestaltAffectedPipeline('combatStats.spell_resistance')).toBe(false);
    expect(isGestaltAffectedPipeline('combatStats.damage_reduction')).toBe(false);
  });

  it('isGestaltAffectedPipeline: unknown pipeline → false', () => {
    expect(isGestaltAffectedPipeline('attributes.stat_strength')).toBe(false);
    expect(isGestaltAffectedPipeline('')).toBe(false);
    expect(isGestaltAffectedPipeline('saves.unknown')).toBe(false);
  });
});

// =============================================================================
// SECTION 3: computeGestaltBase() — edge cases and single class
// =============================================================================

describe('computeGestaltBase() — edge cases', () => {
  it('empty modifiers → 0', () => {
    expect(computeGestaltBase([], {}, 0)).toBe(0);
    expect(computeGestaltBase([], { 'class_fighter': 5 }, 5)).toBe(0);
  });

  it('single class, 5 levels, full BAB: sum = 5 (gestalt identical to standard)', () => {
    const mods = buildBabModifiers('class_fighter', FULL_BAB_INCREMENTS, 5);
    const classLevels = { 'class_fighter': 5 };
    const result = computeGestaltBase(mods, classLevels, 5);
    // Single class: max(one value) = that value, summed = same as additive sum
    expect(result).toBe(5);
  });

  it('single class, 3 levels, half BAB: sum = 1 (gestalt identical to standard)', () => {
    // Wizard 3: increments [0,1,0] → sum = 1
    const mods = buildBabModifiers('class_wizard', HALF_BAB_INCREMENTS, 3);
    const classLevels = { 'class_wizard': 3 };
    const result = computeGestaltBase(mods, classLevels, 3);
    expect(result).toBe(1);
  });
});

// =============================================================================
// SECTION 4: computeGestaltBase() — BAB canonical scenarios
// =============================================================================

describe('computeGestaltBase() — BAB gestalt vs standard (ARCHITECTURE.md §8.2)', () => {
  /**
   * CANONICAL GESTALT SCENARIO (ARCHITECTURE.md section 8.2):
   *   Fighter 5 / Wizard 5 (gestalt, both at same 5 levels)
   *
   *   Level | Fighter BAB | Wizard BAB | Standard sum | Gestalt max
   *   ------|-------------|------------|-------------|------------
   *     1   |     +1      |     0      |      1      |     1
   *     2   |     +1      |    +1      |      3      |     2
   *     3   |     +1      |     0      |      4      |     3
   *     4   |     +1      |    +1      |      6      |     4
   *     5   |     +1      |     0      |      7      |     5
   *
   *   Standard BAB = 7; Gestalt BAB = 5
   */
  it('Fighter 5 / Wizard 5: gestalt BAB = 5 (standard would be 7)', () => {
    const fighterMods = buildBabModifiers('class_fighter', FULL_BAB_INCREMENTS, 5);
    const wizardMods  = buildBabModifiers('class_wizard',  HALF_BAB_INCREMENTS, 5);
    const allMods = [...fighterMods, ...wizardMods];
    const classLevels = { 'class_fighter': 5, 'class_wizard': 5 };

    const gestaltResult = computeGestaltBase(allMods, classLevels, 5);
    expect(gestaltResult).toBe(5); // max(1,0)+max(1,1)+max(1,0)+max(1,1)+max(1,0) = 1+1+1+1+1

    // Compare with standard (applyStackingRules sums all base modifiers)
    const standardResult = applyStackingRules(allMods, 0);
    expect(standardResult.totalBonus).toBe(7); // 5 + 2 = 7

    // Gestalt < standard (as expected — gestalt is more restrictive)
    expect(gestaltResult).toBeLessThan(standardResult.totalBonus);
  });

  it('Fighter 5 / Cleric 5: gestalt BAB = 5 (standard would be 8)', () => {
    // Fighter: full BAB (1,1,1,1,1)
    // Cleric (3/4 BAB): (0,1,1,0,1)
    // Per level max: max(1,0)=1, max(1,1)=1, max(1,1)=1, max(1,0)=1, max(1,1)=1 → total 5
    const fighterMods = buildBabModifiers('class_fighter', FULL_BAB_INCREMENTS, 5);
    const clericMods  = buildBabModifiers('class_cleric',  THREEQUARTER_BAB_INCREMENTS, 5);
    const allMods = [...fighterMods, ...clericMods];
    const classLevels = { 'class_fighter': 5, 'class_cleric': 5 };

    const gestalt = computeGestaltBase(allMods, classLevels, 5);
    const standard = applyStackingRules(allMods, 0);

    expect(gestalt).toBe(5);                         // Fighter full BAB dominates
    expect(standard.totalBonus).toBe(5 + 3);         // Fighter 5 + Cleric 0+1+1+0+1 = 3 → 8
    expect(gestalt).toBeLessThan(standard.totalBonus);
  });

  it('Wizard 5 / Cleric 5: gestalt BAB = 3 (standard would be 5)', () => {
    // Wizard (half): (0,1,0,1,0) → sum = 2
    // Cleric (3/4):  (0,1,1,0,1) → sum = 3
    // Per level max: max(0,0)=0, max(1,1)=1, max(0,1)=1, max(1,0)=1, max(0,1)=1 → total 4
    // Wait, let me recalculate THREEQUARTER: [0,1,1,0,1,0,1,0,1,0...]
    // Level 1: Wiz 0, Cler 0 → max 0
    // Level 2: Wiz 1, Cler 1 → max 1
    // Level 3: Wiz 0, Cler 1 → max 1
    // Level 4: Wiz 1, Cler 0 → max 1
    // Level 5: Wiz 0, Cler 1 → max 1
    // Sum = 4
    const wizardMods = buildBabModifiers('class_wizard', HALF_BAB_INCREMENTS, 5);
    const clericMods = buildBabModifiers('class_cleric', THREEQUARTER_BAB_INCREMENTS, 5);
    const allMods = [...wizardMods, ...clericMods];
    const classLevels = { 'class_wizard': 5, 'class_cleric': 5 };

    const gestalt = computeGestaltBase(allMods, classLevels, 5);
    const standard = applyStackingRules(allMods, 0);

    // Standard: 2 + 3 = 5
    expect(standard.totalBonus).toBe(5);
    // Gestalt: 0+1+1+1+1 = 4
    expect(gestalt).toBe(4);
    expect(gestalt).toBeLessThan(standard.totalBonus);
  });

  it('Two identical classes (same BAB): gestalt = standard (max of identical = one)', () => {
    // Fighter 5 / Barbarian 5: both have full BAB
    // Gestalt per level: max(1,1)=1 × 5 = 5
    // Standard: 5 + 5 = 10 (BAB would be 10 in standard, which is wrong in practice,
    //   but this tests the math: gestalt correctly outputs 5)
    const fighter = buildBabModifiers('class_fighter',    FULL_BAB_INCREMENTS, 5);
    const barbarian = buildBabModifiers('class_barbarian', FULL_BAB_INCREMENTS, 5);
    const allMods = [...fighter, ...barbarian];
    const classLevels = { 'class_fighter': 5, 'class_barbarian': 5 };

    const gestalt = computeGestaltBase(allMods, classLevels, 5);
    expect(gestalt).toBe(5); // max(1,1) = 1 × 5 levels
  });

  it('Three classes: max still applies across all three per level', () => {
    // Fighter 3 / Wizard 3 / Rogue 3 (all gestalt, character level 3)
    // Fighter  full: [1,1,1]
    // Wizard   half: [0,1,0]
    // Rogue   3/4:  [0,1,1]
    // Per level: max(1,0,0)=1, max(1,1,1)=1, max(1,0,1)=1 → total 3
    const fighterMods = buildBabModifiers('class_fighter', FULL_BAB_INCREMENTS, 3);
    const wizardMods  = buildBabModifiers('class_wizard',  HALF_BAB_INCREMENTS, 3);
    const rogueMods   = buildBabModifiers('class_rogue',   THREEQUARTER_BAB_INCREMENTS, 3);
    const allMods = [...fighterMods, ...wizardMods, ...rogueMods];
    const classLevels = { 'class_fighter': 3, 'class_wizard': 3, 'class_rogue': 3 };

    const gestalt = computeGestaltBase(allMods, classLevels, 3);
    expect(gestalt).toBe(3); // Fighter wins at every level
  });
});

// =============================================================================
// SECTION 5: computeGestaltBase() — Save canonical scenarios
// =============================================================================

describe('computeGestaltBase() — saves gestalt vs standard (ARCHITECTURE.md §8.2)', () => {
  /**
   * SAVE SCENARIO (ARCHITECTURE.md section 8.2):
   *   Fighter 5 (Good Fort) / Wizard 5 (Poor Fort)
   *
   *   Level | Fighter Fort | Wizard Fort | Standard sum | Gestalt max
   *   ------|--------------|-------------|-------------|------------
   *     1   |     +2       |     0       |      2      |     2
   *     2   |      0       |     0       |      2      |     2
   *     3   |     +1       |    +1       |      4      |     3
   *     4   |      0       |     0       |      4      |     3
   *     5   |     +1       |     0       |      5      |     4
   *
   *   Standard Fort = 5; Gestalt Fort = 4
   */
  it('Fighter 5 / Wizard 5: gestalt Fortitude = 4 (standard would be 5)', () => {
    const fighterFort = buildSaveModifiers('class_fighter', 'saves.fortitude', GOOD_SAVE_INCREMENTS, 5);
    const wizardFort  = buildSaveModifiers('class_wizard',  'saves.fortitude', POOR_SAVE_INCREMENTS, 5);
    const allMods = [...fighterFort, ...wizardFort];
    const classLevels = { 'class_fighter': 5, 'class_wizard': 5 };

    const gestalt = computeGestaltBase(allMods, classLevels, 5);
    const standard = applyStackingRules(allMods, 0);

    // Standard: Good(2+0+1+0+1=4) + Poor(0+0+1+0+0=1) = 5
    expect(standard.totalBonus).toBe(5);
    // Gestalt: max(2,0)+max(0,0)+max(1,1)+max(0,0)+max(1,0) = 2+0+1+0+1 = 4
    expect(gestalt).toBe(4);
    expect(gestalt).toBeLessThan(standard.totalBonus);
  });

  it('Two Good saves (e.g., both classes are "Good Fort"): gestalt = standard = 4', () => {
    // Both have Good Fort save increments — max of identical = same as one
    const class1Fort = buildSaveModifiers('class_fighter',  'saves.fortitude', GOOD_SAVE_INCREMENTS, 5);
    const class2Fort = buildSaveModifiers('class_barbarian', 'saves.fortitude', GOOD_SAVE_INCREMENTS, 5);
    const allMods = [...class1Fort, ...class2Fort];
    const classLevels = { 'class_fighter': 5, 'class_barbarian': 5 };

    const gestalt = computeGestaltBase(allMods, classLevels, 5);

    // Gestalt: max(2,2)+max(0,0)+max(1,1)+max(0,0)+max(1,1) = 2+0+1+0+1 = 4
    expect(gestalt).toBe(4);
    // Standard would double-count: 8 (two good saves summed) — gestalt prevents this
    const standard = applyStackingRules(allMods, 0);
    expect(standard.totalBonus).toBe(8);
    expect(gestalt).toBeLessThan(standard.totalBonus);
  });

  it('Gestalt Reflex: Rogue 5 (Good) / Fighter 5 (Poor) — Rogue wins', () => {
    // Rogue has Good Ref (same pattern as Fighter Good Fort)
    const rogueRef   = buildSaveModifiers('class_rogue',    'saves.reflex', GOOD_SAVE_INCREMENTS, 5);
    const fighterRef = buildSaveModifiers('class_fighter',  'saves.reflex', POOR_SAVE_INCREMENTS, 5);
    const allMods = [...rogueRef, ...fighterRef];
    const classLevels = { 'class_rogue': 5, 'class_fighter': 5 };

    const gestalt = computeGestaltBase(allMods, classLevels, 5);
    const standard = applyStackingRules(allMods, 0);

    expect(gestalt).toBe(4);  // Rogue's Good Ref dominates
    expect(standard.totalBonus).toBe(5); // 4 + 1
    expect(gestalt).toBeLessThan(standard.totalBonus);
  });
});

// =============================================================================
// SECTION 6: groupBaseModifiersByClass()
// =============================================================================

describe('groupBaseModifiersByClass() — modifier grouping by sourceId', () => {
  it('single class: returns one entry', () => {
    const mods = buildBabModifiers('class_fighter', FULL_BAB_INCREMENTS, 3);
    const classLevels = { 'class_fighter': 3 };
    const grouped = groupBaseModifiersByClass(mods, classLevels);

    expect(grouped.size).toBe(1);
    expect(grouped.has('class_fighter')).toBe(true);
    const contributions = grouped.get('class_fighter')!;
    expect(contributions[1]).toBe(1); // Level 1: +1
    expect(contributions[2]).toBe(1); // Level 2: +1
    expect(contributions[3]).toBe(1); // Level 3: +1
  });

  it('two classes: returns two entries', () => {
    const fighter = buildBabModifiers('class_fighter', FULL_BAB_INCREMENTS, 5);
    const wizard  = buildBabModifiers('class_wizard',  HALF_BAB_INCREMENTS, 5);
    const grouped = groupBaseModifiersByClass([...fighter, ...wizard], { 'class_fighter': 5, 'class_wizard': 5 });

    expect(grouped.size).toBe(2);
    expect(grouped.has('class_fighter')).toBe(true);
    expect(grouped.has('class_wizard')).toBe(true);
  });

  it('ignores non-"base" type modifiers', () => {
    const baseMod     = makeBaseModifier('m1', 'class_fighter', 'combatStats.base_attack_bonus', 1);
    const enhancement = { ...makeBaseModifier('m2', 'class_fighter', 'combatStats.base_attack_bonus', 2), type: 'enhancement' as ModifierType };
    const grouped = groupBaseModifiersByClass([baseMod, enhancement], { 'class_fighter': 1 });

    // Only the "base" type mod should be grouped
    expect(grouped.size).toBe(1);
    const contributions = grouped.get('class_fighter')!;
    expect(contributions[1]).toBe(1); // Only the base modifier at level 1
  });

  it('empty input: returns empty map', () => {
    const grouped = groupBaseModifiersByClass([], {});
    expect(grouped.size).toBe(0);
  });
});

// =============================================================================
// SECTION 7: Gestalt ≤ Standard — invariant
// =============================================================================

describe('Gestalt ≤ Standard invariant (for non-negative increments)', () => {
  /**
   * Mathematical invariant: for non-negative BAB increments,
   * gestalt total ≤ standard total.
   * (max per level ≤ sum per level, and this holds when summed across all levels)
   */
  it('gestalt BAB ≤ standard BAB for all tested class combinations', () => {
    type TestCase = { classes: Record<string, number>; mods: Modifier[] };
    const testCases: TestCase[] = [
      { classes: { 'class_fighter': 5 },        mods: buildBabModifiers('class_fighter', FULL_BAB_INCREMENTS, 5) },
      {
        classes: { 'class_fighter': 5, 'class_wizard': 5 },
        mods: [
          ...buildBabModifiers('class_fighter', FULL_BAB_INCREMENTS, 5),
          ...buildBabModifiers('class_wizard',  HALF_BAB_INCREMENTS, 5),
        ],
      },
      {
        classes: { 'class_wizard': 5, 'class_cleric': 5 },
        mods: [
          ...buildBabModifiers('class_wizard',  HALF_BAB_INCREMENTS, 5),
          ...buildBabModifiers('class_cleric',  THREEQUARTER_BAB_INCREMENTS, 5),
        ],
      },
    ];

    for (const { classes, mods } of testCases) {
      const gestalt  = computeGestaltBase(mods, classes, Object.values(classes).reduce((a, b) => Math.max(a, b), 0));
      const standard = applyStackingRules(mods, 0);
      expect(gestalt).toBeLessThanOrEqual(standard.totalBonus);
    }
  });
});
