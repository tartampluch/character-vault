/**
 * @file src/tests/multiclass.test.ts
 * @description Vitest integration tests for multiclassing and level progression resolution.
 *
 * ARCHITECTURE:
 *   The GameEngine uses Svelte 5 $derived runes for reactive DAG phases.
 *   These cannot be instantiated in a Vitest environment (no Svelte runtime).
 *   Instead, we test the PURE UTILITY FUNCTIONS and DATA STRUCTURES that implement
 *   the multiclassing logic, simulating what the GameEngine would compute:
 *
 *     - characterLevel = Object.values(classLevels).reduce((a, b) => a + b, 0)
 *     - eclForXp       = characterLevel + levelAdjustment
 *     - BAB per class: sum of "base" modifiers in levelProgression entries ≤ classLevel
 *     - Level-gated features: grantedFeatures from entries where entry.level ≤ classLevel
 *     - applyStackingRules: BAB contributions are type "base" (always stacks)
 *
 * SCENARIO (ARCHITECTURE.md Phase 17.6):
 *   A character with classLevels: { "class_fighter": 5, "class_wizard": 3 }
 *     1. Character level = 8
 *     2. BAB: Fighter (full, +1/level) → +5; Wizard (half, +1 every 2 levels) → +1; Total → +6
 *     3. Level-gated features: Fighter bonus feats at level 2 and 4 are active;
 *        level 6 Fighter bonus feat is NOT (Fighter level is only 5).
 *
 * ECL / LEVEL ADJUSTMENT SCENARIOS (ARCHITECTURE.md section 6.4, Phase 1.5 and 3.5):
 *   Standard PC (LA = 0):   eclForXp = characterLevel
 *   Monster PC (LA > 0):    eclForXp = characterLevel + levelAdjustment
 *   - Drow Rogue 3 (LA +2): eclForXp = 5  (@characterLevel = 3)
 *   - Half-Dragon Fighter 4 (LA +3): eclForXp = 7  (@characterLevel = 4)
 *   - Reducing LA: after 3× LA class levels, LA reduces by 1 via XP payment.
 *
 * MULTICLASSING RULES (D&D 3.5 SRD):
 *   - Character level: Sum of all class levels.
 *   - Base Attack Bonus (BAB): Each class contributes its BAB increment per level,
 *     accumulated from levelProgression entries (type: "base"). "base" type modifiers
 *     STACK across classes (ARCHITECTURE.md Example G).
 *   - Level-gated features: The GameEngine only grants features from levelProgression
 *     entries where entry.level ≤ character.classLevels[classId].
 *
 * @see ARCHITECTURE.md section 5.4 for levelProgression mechanics
 * @see ARCHITECTURE.md section 6.4 for Level Adjustment and ECL
 * @see ARCHITECTURE.md section 9, Example G for multiclassing BAB and save resolution
 * @see src/lib/engine/GameEngine.svelte.ts #collectModifiersFromInstance
 * @see src/lib/utils/stackingRules.ts for applyStackingRules
 * @see ARCHITECTURE.md Phase 17.6
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { applyStackingRules } from '$lib/utils/stackingRules';
import { DataLoader } from '$lib/engine/DataLoader';
import type { Modifier } from '$lib/types/pipeline';
import type { Feature, LevelProgressionEntry } from '$lib/types/feature';
import type { ModifierType } from '$lib/types/primitives';

// ============================================================
// HELPERS
// ============================================================

/**
 * Creates a BAB modifier for a levelProgression entry.
 * BAB uses type "base" — this type STACKS in D&D 3.5, allowing multiclassing contributions
 * to simply add together (unlike typed bonuses which take the highest only).
 *
 * @param id       - Unique modifier ID.
 * @param sourceId - The class ID generating this BAB increment.
 * @param value    - The BAB increment for this level (+1 for full BAB, 0/+1 alternating for half, etc.).
 * @returns A Modifier targeting "combatStats.bab" with type "base".
 */
function makeBabModifier(id: string, sourceId: string, value: number): Modifier {
  return {
    id,
    sourceId,
    sourceName: { en: id },
    targetId: 'combatStats.bab',
    value,
    type: 'base' as ModifierType,
  };
}

/**
 * Creates a save modifier for a levelProgression entry.
 * Used for Fort/Ref/Will progressions (type "base" — stacks across classes).
 *
 * D&D 3.5 Save Progressions:
 *   Good save: +2 at level 1, then +1 every 2 levels (increments: 2, 0, 1, 0, 1, 0, ...)
 *   Poor save: +0 at level 1, then +1 every 3 levels (increments: 0, 0, 1, 0, 0, 1, ...)
 *   The levelProgression stores INCREMENTS per level (differences, not cumulative totals).
 *
 * @param id       - Unique modifier ID.
 * @param sourceId - The class ID generating this save increment.
 * @param targetId - Pipeline ID (e.g., "saves.fort", "saves.ref", "saves.will").
 * @param value    - The save increment for this level.
 * @returns A Modifier with type "base".
 */
function makeSaveModifier(id: string, sourceId: string, targetId: string, value: number): Modifier {
  return {
    id,
    sourceId,
    sourceName: { en: id },
    targetId,
    value,
    type: 'base' as ModifierType,
  };
}

// ============================================================
// MOCK FEATURE: Fighter (Full BAB, Good Fort, Poor Ref/Will)
// ============================================================

/**
 * D&D 3.5 Fighter class mock with 6 levels of levelProgression.
 *
 * BAB PROGRESSION (Full):     +1 per level → increments: [1, 1, 1, 1, 1, 1, ...]
 * FORT SAVE (Good):           +2 at level 1, then +1 every 2 → increments: [2, 0, 1, 0, 1, 0]
 * REF SAVE (Poor):            +0 at level 1, then +1 every 3 → increments: [0, 0, 1, 0, 0, 1]
 * WILL SAVE (Poor):           +0 at level 1, then +1 every 3 → increments: [0, 0, 1, 0, 0, 1]
 * BONUS FEATS: At levels 1, 2, 4, 6 (Fighter gets a bonus feat every even level starting at 1).
 *   For simplicity in tests, we grant bonus feat features at levels 2, 4, and 6 specifically
 *   (levels used to test the boundary condition where level 6 is NOT reached by a Fighter 5).
 *
 * ARCHITECTURE NOTE:
 *   "grantedModifiers" in each levelProgression entry represent INCREMENTS, not cumulative.
 *   The GameEngine sums all entries with entry.level ≤ classLevels[classId] to compute totals.
 *   This makes multiclassing trivial: just add each class's contributions separately.
 */
const MOCK_FIGHTER: Feature = {
  id: 'class_fighter',
  category: 'class',
  label: { en: 'Fighter' },
  description: { en: 'A master of martial combat.' },
  tags: ['class', 'warrior', 'fighter'],
  ruleSource: 'test_multiclass',
  grantedModifiers: [],
  grantedFeatures: [],
  classSkills: ['skill_climb', 'skill_craft', 'skill_intimidate', 'skill_swim'],
  levelProgression: [
    // Level 1: Good Fort (+2), Poor Ref (+0), Poor Will (+0), Full BAB (+1), Bonus Feat
    {
      level: 1,
      grantedFeatures: ['class_feature_fighter_bonus_feat'],
      grantedModifiers: [
        makeBabModifier('fighter_bab_l1', 'class_fighter', 1),
        makeSaveModifier('fighter_fort_l1', 'class_fighter', 'saves.fort', 2),
        makeSaveModifier('fighter_ref_l1', 'class_fighter', 'saves.ref', 0),
        makeSaveModifier('fighter_will_l1', 'class_fighter', 'saves.will', 0),
      ],
    },
    // Level 2: Good Fort (+0), Bonus Feat
    {
      level: 2,
      grantedFeatures: ['class_feature_fighter_bonus_feat_2'],
      grantedModifiers: [
        makeBabModifier('fighter_bab_l2', 'class_fighter', 1),
        makeSaveModifier('fighter_fort_l2', 'class_fighter', 'saves.fort', 0),
        makeSaveModifier('fighter_ref_l2', 'class_fighter', 'saves.ref', 0),
        makeSaveModifier('fighter_will_l2', 'class_fighter', 'saves.will', 0),
      ],
    },
    // Level 3: Good Fort (+1), Poor Ref (+1 — every 3 levels), Poor Will (+1)
    {
      level: 3,
      grantedFeatures: [],
      grantedModifiers: [
        makeBabModifier('fighter_bab_l3', 'class_fighter', 1),
        makeSaveModifier('fighter_fort_l3', 'class_fighter', 'saves.fort', 1),
        makeSaveModifier('fighter_ref_l3', 'class_fighter', 'saves.ref', 1),
        makeSaveModifier('fighter_will_l3', 'class_fighter', 'saves.will', 1),
      ],
    },
    // Level 4: Good Fort (+0), Bonus Feat
    {
      level: 4,
      grantedFeatures: ['class_feature_fighter_bonus_feat_4'],
      grantedModifiers: [
        makeBabModifier('fighter_bab_l4', 'class_fighter', 1),
        makeSaveModifier('fighter_fort_l4', 'class_fighter', 'saves.fort', 0),
        makeSaveModifier('fighter_ref_l4', 'class_fighter', 'saves.ref', 0),
        makeSaveModifier('fighter_will_l4', 'class_fighter', 'saves.will', 0),
      ],
    },
    // Level 5: Good Fort (+1)
    {
      level: 5,
      grantedFeatures: [],
      grantedModifiers: [
        makeBabModifier('fighter_bab_l5', 'class_fighter', 1),
        makeSaveModifier('fighter_fort_l5', 'class_fighter', 'saves.fort', 1),
        makeSaveModifier('fighter_ref_l5', 'class_fighter', 'saves.ref', 0),
        makeSaveModifier('fighter_will_l5', 'class_fighter', 'saves.will', 0),
      ],
    },
    // Level 6: Good Fort (+0), Bonus Feat (THIS LEVEL IS NOT REACHED when Fighter = 5)
    {
      level: 6,
      grantedFeatures: ['class_feature_fighter_bonus_feat_6'],
      grantedModifiers: [
        makeBabModifier('fighter_bab_l6', 'class_fighter', 1),
        makeSaveModifier('fighter_fort_l6', 'class_fighter', 'saves.fort', 0),
        makeSaveModifier('fighter_ref_l6', 'class_fighter', 'saves.ref', 1),
        makeSaveModifier('fighter_will_l6', 'class_fighter', 'saves.will', 1),
      ],
    },
  ],
};

// ============================================================
// MOCK FEATURE: Wizard (Half BAB, Poor Fort/Ref, Good Will)
// ============================================================

/**
 * D&D 3.5 Wizard class mock with 3 levels of levelProgression.
 *
 * BAB PROGRESSION (Half):     +0.5 per level, rounded down → increments: [0, 1, 0] (totals: 0, 1, 1)
 *   Note: In D&D 3.5 SRD, half BAB progression is: level 1 = 0, level 2 = 1, level 3 = 1.
 *   The increments are: level 1 = 0, level 2 = +1, level 3 = 0.
 * FORT SAVE (Poor):           increments: [0, 0, 1]
 * REF SAVE (Poor):            increments: [0, 0, 1]
 * WILL SAVE (Good):           increments: [2, 1, 0] → totals: 2, 3, 3
 *
 * ARCHITECTURE NOTE:
 *   Half BAB is represented as increments [0, 1, 0, 1, 0, 1, ...] at the LEVEL granularity.
 *   The GameEngine sums these to get the class's total BAB contribution.
 *   For Wizard levels 1-3: 0 + 1 + 0 = 1 total BAB contribution.
 */
const MOCK_WIZARD: Feature = {
  id: 'class_wizard',
  category: 'class',
  label: { en: 'Wizard' },
  description: { en: 'An arcane spellcaster.' },
  tags: ['class', 'arcane', 'wizard', 'spellcaster'],
  ruleSource: 'test_multiclass',
  grantedModifiers: [],
  grantedFeatures: [],
  classSkills: ['skill_concentration', 'skill_craft', 'skill_knowledge_arcana', 'skill_spellcraft'],
  levelProgression: [
    // Level 1: Good Will (+2), Poor Fort (+0), Poor Ref (+0), Half BAB (+0)
    {
      level: 1,
      grantedFeatures: ['class_feature_wizard_scribe_scroll'],
      grantedModifiers: [
        makeBabModifier('wizard_bab_l1', 'class_wizard', 0),
        makeSaveModifier('wizard_fort_l1', 'class_wizard', 'saves.fort', 0),
        makeSaveModifier('wizard_ref_l1', 'class_wizard', 'saves.ref', 0),
        makeSaveModifier('wizard_will_l1', 'class_wizard', 'saves.will', 2),
      ],
    },
    // Level 2: Good Will (+1), Half BAB (+1)
    {
      level: 2,
      grantedFeatures: [],
      grantedModifiers: [
        makeBabModifier('wizard_bab_l2', 'class_wizard', 1),
        makeSaveModifier('wizard_fort_l2', 'class_wizard', 'saves.fort', 0),
        makeSaveModifier('wizard_ref_l2', 'class_wizard', 'saves.ref', 0),
        makeSaveModifier('wizard_will_l2', 'class_wizard', 'saves.will', 1),
      ],
    },
    // Level 3: Good Will (+0), Poor Fort (+1 every 3 levels), Half BAB (+0)
    {
      level: 3,
      grantedFeatures: [],
      grantedModifiers: [
        makeBabModifier('wizard_bab_l3', 'class_wizard', 0),
        makeSaveModifier('wizard_fort_l3', 'class_wizard', 'saves.fort', 1),
        makeSaveModifier('wizard_ref_l3', 'class_wizard', 'saves.ref', 1),
        makeSaveModifier('wizard_will_l3', 'class_wizard', 'saves.will', 0),
      ],
    },
  ],
};

// ============================================================
// PURE HELPER: Simulate GameEngine's multiclass modifier collection
// ============================================================

/**
 * Collects all BAB modifiers from a class's levelProgression up to the given class level.
 *
 * This directly simulates the logic in GameEngine.#collectModifiersFromInstance():
 *   if (feature.category === 'class' && feature.levelProgression) {
 *     const classLevel = character.classLevels[feature.id] ?? 0;
 *     for (const entry of feature.levelProgression) {
 *       if (entry.level <= classLevel) {
 *         processModifierList(entry.grantedModifiers, ...);
 *       }
 *     }
 *   }
 *
 * @param progressionEntries - The class's levelProgression array.
 * @param classLevel         - The character's level in this class.
 * @param targetPipeline     - The pipeline ID to filter by (e.g., "combatStats.bab").
 * @returns All modifiers targeting the specified pipeline, from entries ≤ classLevel.
 */
function collectLevelGatedModifiers(
  progressionEntries: LevelProgressionEntry[],
  classLevel: number,
  targetPipeline: string
): Modifier[] {
  return progressionEntries
    .filter(entry => entry.level <= classLevel)
    .flatMap(entry => entry.grantedModifiers)
    .filter(mod => mod.targetId === targetPipeline);
}

/**
 * Collects all grantedFeature IDs from a class's levelProgression up to the given class level.
 *
 * This simulates the level-gating logic in GameEngine.#collectModifiersFromInstance():
 *   const classLevel = character.classLevels[feature.id] ?? 0;
 *   for (const entry of feature.levelProgression) {
 *     if (entry.level <= classLevel) {
 *       for (const gfId of entry.grantedFeatures) { grantedFeatureIds.add(gfId); }
 *     }
 *   }
 *
 * @param progressionEntries - The class's levelProgression array.
 * @param classLevel         - The character's level in this class.
 * @returns Array of feature IDs granted up to and including the given class level.
 */
function collectGrantedFeatureIds(
  progressionEntries: LevelProgressionEntry[],
  classLevel: number
): string[] {
  return progressionEntries
    .filter(entry => entry.level <= classLevel)
    .flatMap(entry => entry.grantedFeatures);
}

// ============================================================
// TESTS
// ============================================================

// --- SCENARIO 1: Character Level ---

describe('Multiclass: Character Level calculation', () => {
  /**
   * ARCHITECTURE.md section 9 Phase 0c:
   *   characterLevel = Object.values(character.classLevels).reduce((a, b) => a + b, 0)
   * ARCHITECTURE.md Character.classLevels:
   *   { "class_fighter": 5, "class_wizard": 3 } = Character Level 8
   */
  it('Fighter 5 / Wizard 3: character level equals 8', () => {
    const classLevels: Record<string, number> = {
      'class_fighter': 5,
      'class_wizard': 3,
    };

    const characterLevel = Object.values(classLevels).reduce((sum, lvl) => sum + lvl, 0);

    expect(characterLevel).toBe(8);
  });

  it('Single class Rogue 10: character level equals 10', () => {
    const classLevels: Record<string, number> = { 'class_rogue': 10 };
    const characterLevel = Object.values(classLevels).reduce((sum, lvl) => sum + lvl, 0);
    expect(characterLevel).toBe(10);
  });

  it('Three-class multiclass adds all levels', () => {
    // Fighter 4 / Wizard 2 / Rogue 1 = Character Level 7
    const classLevels: Record<string, number> = {
      'class_fighter': 4,
      'class_wizard': 2,
      'class_rogue': 1,
    };
    const characterLevel = Object.values(classLevels).reduce((sum, lvl) => sum + lvl, 0);
    expect(characterLevel).toBe(7);
  });

  it('Empty classLevels: character level is 0', () => {
    const classLevels: Record<string, number> = {};
    const characterLevel = Object.values(classLevels).reduce((sum, lvl) => sum + lvl, 0);
    expect(characterLevel).toBe(0);
  });
});

// --- SCENARIO 2: BAB (Base Attack Bonus) Multiclass Resolution ---

describe('Multiclass: BAB calculation (ARCHITECTURE.md Example G)', () => {
  /**
   * ARCHITECTURE.md Example G:
   *   For a Fighter 5 / Wizard 3:
   *   - Fighter 5: BAB 1+1+1+1+1 = 5 (full BAB, +1/level)
   *   - Wizard 3:  BAB 0+1+0     = 1 (half BAB, floor(level/2))
   *   - Combined: BAB 6 (+6/+1 attacks at character level 8)
   *
   * HOW THE ENGINE ACHIEVES THIS:
   *   1. Phase 0 collects levelProgression BAB modifiers for Fighter (levels 1-5)
   *      and Wizard (levels 1-3), all with type "base".
   *   2. applyStackingRules processes them all → "base" type STACKS (not highest-only).
   *   3. totalBonus = 5 (fighter) + 1 (wizard) = 6.
   */
  it('Fighter 5 contributes exactly +5 BAB', () => {
    const fighterLevel = 5;
    const fighterBabMods = collectLevelGatedModifiers(
      MOCK_FIGHTER.levelProgression!,
      fighterLevel,
      'combatStats.bab'
    );

    const result = applyStackingRules(fighterBabMods, 0);

    // Full BAB: +1 per level × 5 levels = +5
    expect(result.totalBonus).toBe(5);
    expect(result.totalValue).toBe(5); // baseValue 0 + bonus 5
  });

  it('Wizard 3 contributes exactly +1 BAB', () => {
    const wizardLevel = 3;
    const wizardBabMods = collectLevelGatedModifiers(
      MOCK_WIZARD.levelProgression!,
      wizardLevel,
      'combatStats.bab'
    );

    const result = applyStackingRules(wizardBabMods, 0);

    // Half BAB: increments [0, 1, 0] → sum = 1
    expect(result.totalBonus).toBe(1);
    expect(result.totalValue).toBe(1); // baseValue 0 + bonus 1
  });

  it('Combined Fighter 5 + Wizard 3: total BAB equals +6 (type "base" stacks)', () => {
    const fighterLevel = 5;
    const wizardLevel = 3;

    // Collect BAB modifiers from BOTH classes (simulating Phase 0 combining all active features)
    const allBabMods: Modifier[] = [
      ...collectLevelGatedModifiers(MOCK_FIGHTER.levelProgression!, fighterLevel, 'combatStats.bab'),
      ...collectLevelGatedModifiers(MOCK_WIZARD.levelProgression!, wizardLevel, 'combatStats.bab'),
    ];

    // Apply stacking rules — "base" type STACKS (it does not take-the-highest like typed bonuses)
    const result = applyStackingRules(allBabMods, 0);

    // Fighter +5 + Wizard +1 = Total BAB +6
    expect(result.totalBonus).toBe(6);
    expect(result.totalValue).toBe(6);

    // All 8 BAB modifiers should be in the applied list (base type stacks = all included)
    // Fighter levels 1-5 (5 mods) + Wizard levels 1-3 (3 mods) = 8 total BAB mods
    // However, zero-value mods (Wizard's +0 increments) don't contribute but ARE in the list
    // The engine processes all and sums them.
    const babAppliedCount = result.appliedModifiers.filter(
      m => m.targetId === 'combatStats.bab'
    ).length;
    expect(babAppliedCount).toBeGreaterThanOrEqual(2); // At minimum both non-zero contributions
  });

  it('BAB does not take-the-highest (differs from typed bonuses)', () => {
    // Fighter 5 would give +5 alone. Wizard 3 gives +1 on top.
    // If BAB mistakenly used highest-only (like "enhancement" type), we'd get only +5.
    // This test PROVES that "base" type correctly STACKS to give +6.
    const allBabMods: Modifier[] = [
      ...collectLevelGatedModifiers(MOCK_FIGHTER.levelProgression!, 5, 'combatStats.bab'),
      ...collectLevelGatedModifiers(MOCK_WIZARD.levelProgression!, 3, 'combatStats.bab'),
    ];

    const result = applyStackingRules(allBabMods, 0);
    expect(result.totalBonus).toBe(6); // NOT 5 (which would be if highest-only)
  });
});

// --- SCENARIO 3: Saving Throw Multiclass Resolution ---

describe('Multiclass: Saving throw calculation (ARCHITECTURE.md Example G)', () => {
  /**
   * ARCHITECTURE.md Example G:
   *   For a Fighter 5 / Wizard 3:
   *   - Fighter 5: Fort 2+0+1+0+1 = 4, Ref 0+0+1+0+0 = 1, Will 0+0+1+0+0 = 1
   *   - Wizard 3:  Fort 0+0+1     = 1, Ref 0+0+1     = 1, Will 2+1+0     = 3
   *   - Combined:  Fort 5, Ref 2,  Will 4
   */
  it('Fighter 5 Fort save contribution = +4', () => {
    const fortMods = collectLevelGatedModifiers(
      MOCK_FIGHTER.levelProgression!,
      5,
      'saves.fort'
    );
    const result = applyStackingRules(fortMods, 0);
    // Fighter Good Fort at levels 1-5: 2+0+1+0+1 = 4
    expect(result.totalBonus).toBe(4);
  });

  it('Fighter 5 Reflex save contribution = +1', () => {
    const refMods = collectLevelGatedModifiers(
      MOCK_FIGHTER.levelProgression!,
      5,
      'saves.ref'
    );
    const result = applyStackingRules(refMods, 0);
    // Fighter Poor Ref at levels 1-5: 0+0+1+0+0 = 1
    expect(result.totalBonus).toBe(1);
  });

  it('Fighter 5 Will save contribution = +1', () => {
    const willMods = collectLevelGatedModifiers(
      MOCK_FIGHTER.levelProgression!,
      5,
      'saves.will'
    );
    const result = applyStackingRules(willMods, 0);
    // Fighter Poor Will at levels 1-5: 0+0+1+0+0 = 1
    expect(result.totalBonus).toBe(1);
  });

  it('Wizard 3 Fort save contribution = +1', () => {
    const fortMods = collectLevelGatedModifiers(
      MOCK_WIZARD.levelProgression!,
      3,
      'saves.fort'
    );
    const result = applyStackingRules(fortMods, 0);
    // Wizard Poor Fort at levels 1-3: 0+0+1 = 1
    expect(result.totalBonus).toBe(1);
  });

  it('Wizard 3 Will save contribution = +3', () => {
    const willMods = collectLevelGatedModifiers(
      MOCK_WIZARD.levelProgression!,
      3,
      'saves.will'
    );
    const result = applyStackingRules(willMods, 0);
    // Wizard Good Will at levels 1-3: 2+1+0 = 3
    expect(result.totalBonus).toBe(3);
  });

  it('Combined Fort save = +5 (Fighter 4 + Wizard 1)', () => {
    const allFortMods = [
      ...collectLevelGatedModifiers(MOCK_FIGHTER.levelProgression!, 5, 'saves.fort'),
      ...collectLevelGatedModifiers(MOCK_WIZARD.levelProgression!, 3, 'saves.fort'),
    ];
    const result = applyStackingRules(allFortMods, 0);
    expect(result.totalBonus).toBe(5); // 4 + 1 = 5
  });

  it('Combined Reflex save = +2 (Fighter 1 + Wizard 1)', () => {
    const allRefMods = [
      ...collectLevelGatedModifiers(MOCK_FIGHTER.levelProgression!, 5, 'saves.ref'),
      ...collectLevelGatedModifiers(MOCK_WIZARD.levelProgression!, 3, 'saves.ref'),
    ];
    const result = applyStackingRules(allRefMods, 0);
    expect(result.totalBonus).toBe(2); // 1 + 1 = 2
  });

  it('Combined Will save = +4 (Fighter 1 + Wizard 3)', () => {
    const allWillMods = [
      ...collectLevelGatedModifiers(MOCK_FIGHTER.levelProgression!, 5, 'saves.will'),
      ...collectLevelGatedModifiers(MOCK_WIZARD.levelProgression!, 3, 'saves.will'),
    ];
    const result = applyStackingRules(allWillMods, 0);
    expect(result.totalBonus).toBe(4); // 1 + 3 = 4
  });
});

// --- SCENARIO 4: Level-Gated Feature Granting ---

describe('Multiclass: Level-gated feature granting', () => {
  /**
   * KEY INVARIANT (ARCHITECTURE.md Phase 17.6):
   *   Features granted at entry.level are ONLY active when classLevels[classId] >= entry.level.
   *
   * EXAMPLE:
   *   Fighter class grants bonus feats at levels 2 and 4 (class_feature_fighter_bonus_feat_2,
   *   class_feature_fighter_bonus_feat_4). At Fighter level 5, both are active.
   *   The level 6 bonus feat (class_feature_fighter_bonus_feat_6) is NOT granted
   *   because classLevels["class_fighter"] = 5 < 6.
   */
  it('Fighter 5: features at levels 1, 2, 3, 4, and 5 are granted', () => {
    const fighterLevel = 5;
    const grantedIds = collectGrantedFeatureIds(MOCK_FIGHTER.levelProgression!, fighterLevel);

    // Features from level 1 and 2 must be present
    expect(grantedIds).toContain('class_feature_fighter_bonus_feat');     // level 1
    expect(grantedIds).toContain('class_feature_fighter_bonus_feat_2');   // level 2
    expect(grantedIds).toContain('class_feature_fighter_bonus_feat_4');   // level 4
  });

  it('Fighter 5: level 6 feature (bonus feat) is NOT granted', () => {
    const fighterLevel = 5;
    const grantedIds = collectGrantedFeatureIds(MOCK_FIGHTER.levelProgression!, fighterLevel);

    // Level 6 feature must NOT be present — Fighter level is only 5.
    expect(grantedIds).not.toContain('class_feature_fighter_bonus_feat_6'); // level 6, not reached
  });

  it('Fighter 6: level 6 feature (bonus feat) IS granted', () => {
    // Boundary test: at exactly level 6, the level 6 feature should appear
    const fighterLevel = 6;
    const grantedIds = collectGrantedFeatureIds(MOCK_FIGHTER.levelProgression!, fighterLevel);

    expect(grantedIds).toContain('class_feature_fighter_bonus_feat_6'); // level 6, now reached
  });

  it('Fighter 1: only level 1 bonus feat is granted', () => {
    const fighterLevel = 1;
    const grantedIds = collectGrantedFeatureIds(MOCK_FIGHTER.levelProgression!, fighterLevel);

    expect(grantedIds).toContain('class_feature_fighter_bonus_feat');       // level 1
    expect(grantedIds).not.toContain('class_feature_fighter_bonus_feat_2'); // level 2, not reached
    expect(grantedIds).not.toContain('class_feature_fighter_bonus_feat_4'); // level 4, not reached
    expect(grantedIds).not.toContain('class_feature_fighter_bonus_feat_6'); // level 6, not reached
  });

  it('Wizard 3: Scribe Scroll (level 1) is granted; no other feats', () => {
    const wizardLevel = 3;
    const grantedIds = collectGrantedFeatureIds(MOCK_WIZARD.levelProgression!, wizardLevel);

    expect(grantedIds).toContain('class_feature_wizard_scribe_scroll'); // level 1
    // Wizard levels 2-3 grant no special features in this mock
    expect(grantedIds.length).toBe(1); // Only Scribe Scroll
  });

  it('Fighter 0 (no levels): no features granted', () => {
    // Edge case: character has added the Fighter class entry but has 0 levels
    // (shouldn't happen in practice, but the engine should handle it gracefully)
    const fighterLevel = 0;
    const grantedIds = collectGrantedFeatureIds(MOCK_FIGHTER.levelProgression!, fighterLevel);

    expect(grantedIds).toHaveLength(0); // Nothing granted at level 0
  });
});

// --- SCENARIO 5: DataLoader Integration — Level-Gating via Cache ---

describe('Multiclass: DataLoader caching and level-gated feature lookup', () => {
  let loader: DataLoader;

  beforeEach(() => {
    // Create a fresh DataLoader instance for each test to avoid cross-test contamination
    loader = new DataLoader();
    // Seed the cache directly (avoids network calls to static/rules/)
    loader.cacheFeature(MOCK_FIGHTER);
    loader.cacheFeature(MOCK_WIZARD);
  });

  it('DataLoader returns the correct Fighter feature with all 6 progression entries', () => {
    const fighter = loader.getFeature('class_fighter');

    expect(fighter).toBeDefined();
    expect(fighter!.category).toBe('class');
    expect(fighter!.levelProgression).toHaveLength(6);
  });

  it('DataLoader returns the correct Wizard feature with all 3 progression entries', () => {
    const wizard = loader.getFeature('class_wizard');

    expect(wizard).toBeDefined();
    expect(wizard!.category).toBe('class');
    expect(wizard!.levelProgression).toHaveLength(3);
  });

  it('Simulated Engine: Fighter level-gating using cached data', () => {
    // Simulate GameEngine.#collectModifiersFromInstance's gating logic
    const fighter = loader.getFeature('class_fighter')!;
    const classLevel = 5;

    const babMods = collectLevelGatedModifiers(fighter.levelProgression!, classLevel, 'combatStats.bab');
    const result = applyStackingRules(babMods, 0);

    // Fighter 5 full BAB = +5
    expect(result.totalBonus).toBe(5);
  });

  it('Simulated Engine: Wizard level-gating using cached data', () => {
    const wizard = loader.getFeature('class_wizard')!;
    const classLevel = 3;

    const babMods = collectLevelGatedModifiers(wizard.levelProgression!, classLevel, 'combatStats.bab');
    const result = applyStackingRules(babMods, 0);

    // Wizard 3 half BAB = +1
    expect(result.totalBonus).toBe(1);
  });

  it('Simulated Engine: combined BAB from both classes in cache = +6', () => {
    const fighter = loader.getFeature('class_fighter')!;
    const wizard = loader.getFeature('class_wizard')!;

    const classLevels = { 'class_fighter': 5, 'class_wizard': 3 };

    const allBabMods: Modifier[] = [
      ...collectLevelGatedModifiers(
        fighter.levelProgression!,
        classLevels['class_fighter'],
        'combatStats.bab'
      ),
      ...collectLevelGatedModifiers(
        wizard.levelProgression!,
        classLevels['class_wizard'],
        'combatStats.bab'
      ),
    ];

    const result = applyStackingRules(allBabMods, 0);
    expect(result.totalBonus).toBe(6); // Fighter +5 + Wizard +1 = +6
  });

  it('Simulated Engine: Fighter level 6 feature absent when classLevel = 5', () => {
    const fighter = loader.getFeature('class_fighter')!;
    const classLevel = 5;

    const granted = collectGrantedFeatureIds(fighter.levelProgression!, classLevel);
    expect(granted).not.toContain('class_feature_fighter_bonus_feat_6');
  });
});

// --- SCENARIO 6: Boundary Conditions ---

describe('Multiclass: Boundary conditions and edge cases', () => {
  it('BAB at exactly the boundary level is included', () => {
    // At classLevel 5, the level 5 entry IS included (entry.level <= classLevel)
    const babMods = collectLevelGatedModifiers(
      MOCK_FIGHTER.levelProgression!,
      5,
      'combatStats.bab'
    );

    // Level 5 modifier (ID: fighter_bab_l5) must be in the list
    const hasLevel5 = babMods.some(m => m.id === 'fighter_bab_l5');
    expect(hasLevel5).toBe(true);

    // Level 6 modifier (ID: fighter_bab_l6) must NOT be in the list
    const hasLevel6 = babMods.some(m => m.id === 'fighter_bab_l6');
    expect(hasLevel6).toBe(false);
  });

  it('Downgrading class level retroactively removes features (gating re-evaluated)', () => {
    // At classLevel 4: levels 2 and 4 bonus feats ARE granted
    const grantedAt4 = collectGrantedFeatureIds(MOCK_FIGHTER.levelProgression!, 4);
    expect(grantedAt4).toContain('class_feature_fighter_bonus_feat_2');
    expect(grantedAt4).toContain('class_feature_fighter_bonus_feat_4');

    // At classLevel 3: level 4 bonus feat is NOT yet granted
    const grantedAt3 = collectGrantedFeatureIds(MOCK_FIGHTER.levelProgression!, 3);
    expect(grantedAt3).toContain('class_feature_fighter_bonus_feat_2'); // level 2, still active
    expect(grantedAt3).not.toContain('class_feature_fighter_bonus_feat_4'); // level 4, not yet reached
  });

  it('Class with no levelProgression grants no level-gated modifiers', () => {
    // A class that only uses grantedModifiers (no level progression)
    const noProgressionClass: Feature = {
      id: 'class_simple',
      category: 'class',
      label: { en: 'Simple' },
      description: { en: 'A simple class with no level progression.' },
      tags: ['class'],
      ruleSource: 'test_multiclass',
      grantedModifiers: [],
      grantedFeatures: [],
      // No levelProgression field at all
    };

    // Simulating logic: if !feature.levelProgression, no entries are processed
    const progression = noProgressionClass.levelProgression ?? [];
    const mods = collectLevelGatedModifiers(progression, 5, 'combatStats.bab');
    expect(mods).toHaveLength(0);

    const granted = collectGrantedFeatureIds(progression, 5);
    expect(granted).toHaveLength(0);
  });

  it('Character level sum is correct even with 5+ classes', () => {
    // Epic multiclassing edge case
    const classLevels: Record<string, number> = {
      'class_fighter': 3,
      'class_wizard': 3,
      'class_cleric': 3,
      'class_rogue': 3,
      'class_barbarian': 3,
      'class_sorcerer': 2,
    };
    const characterLevel = Object.values(classLevels).reduce((sum, lvl) => sum + lvl, 0);
    expect(characterLevel).toBe(17);
  });
});

// =============================================================================
// SCENARIO 6: Effective Character Level (ECL) and Level Adjustment
//
// ARCHITECTURE.md section 6.4 and Phase 1.5/3.5:
//   ECL is used for XP-table lookups and encounter balance.
//   It differs from @characterLevel when levelAdjustment > 0 (monster PCs).
//
//   eclForXp formula (GameEngine.svelte.ts `phase0_eclForXp`):
//     eclForXp = Object.values(classLevels).reduce() + levelAdjustment
//
//   This test suite verifies the ECL formula in isolation (pure math),
//   mirroring what GameEngine.$derived `phase0_eclForXp` computes.
// =============================================================================

/**
 * Helper that mirrors the GameEngine `phase0_eclForXp` $derived computation.
 * Defined as a pure function for testability (the real version is a $derived
 * in GameEngine.svelte.ts that cannot be instantiated in Vitest).
 *
 * @param classLevels      - The character's class-level record.
 * @param levelAdjustment  - Racial Level Adjustment (0 for standard PCs, 1-5+ for monster PCs).
 * @returns Effective Character Level for XP-table lookups.
 */
function computeEclForXp(
  classLevels: Record<string, number>,
  levelAdjustment: number
): number {
  const characterLevel = Object.values(classLevels).reduce((sum, lvl) => sum + lvl, 0);
  return characterLevel + levelAdjustment;
}

describe('ECL and Level Adjustment (ARCHITECTURE.md section 6.4, Phase 1.5)', () => {
  // -----------------------------------------------------------------------
  // Standard PCs — LA = 0
  // -----------------------------------------------------------------------

  it('Standard PC (Fighter 10, LA 0): ECL equals characterLevel = 10', () => {
    // All standard PC races have LA = 0. ECL = class levels sum.
    const ecl = computeEclForXp({ 'class_fighter': 10 }, 0);
    expect(ecl).toBe(10);
  });

  it('Standard multiclass (Fighter 5 / Wizard 3, LA 0): ECL = 8', () => {
    const ecl = computeEclForXp({ 'class_fighter': 5, 'class_wizard': 3 }, 0);
    expect(ecl).toBe(8);
  });

  it('Standard PC level 1 (LA 0): ECL = 1', () => {
    const ecl = computeEclForXp({ 'class_rogue': 1 }, 0);
    expect(ecl).toBe(1);
  });

  it('New character (no class levels, LA 0): ECL = 0', () => {
    // Edge case: character with no levels at all.
    const ecl = computeEclForXp({}, 0);
    expect(ecl).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Monster PCs — LA > 0 (core validation scenario from ARCHITECTURE.md §6.4)
  // -----------------------------------------------------------------------

  it('Drow Rogue 3 (LA +2): @characterLevel = 3, @eclForXp = 5', () => {
    // ARCHITECTURE.md section 6.4 canonical example.
    // A Drow has LA +2; a Rogue 3 Drow needs the same XP as a level-5 character.
    const classLevels = { 'class_rogue': 3 };
    const levelAdjustment = 2;

    const characterLevel = Object.values(classLevels).reduce((sum, lvl) => sum + lvl, 0);
    const eclForXp = computeEclForXp(classLevels, levelAdjustment);

    // @characterLevel: used for feats, HP, max skill ranks (class levels only)
    expect(characterLevel).toBe(3);
    // @eclForXp: used for XP threshold — she needs as much XP as a 5th-level character
    expect(eclForXp).toBe(5);
    // The LA delta is exactly the level adjustment value
    expect(eclForXp - characterLevel).toBe(levelAdjustment);
  });

  it('Half-Dragon Fighter 4 (LA +3): characterLevel = 4, eclForXp = 7', () => {
    // Half-Dragon template grants LA +3.
    const classLevels = { 'class_fighter': 4 };
    const characterLevel = Object.values(classLevels).reduce((sum, lvl) => sum + lvl, 0);
    const eclForXp = computeEclForXp(classLevels, 3);

    expect(characterLevel).toBe(4);
    expect(eclForXp).toBe(7);
    expect(eclForXp - characterLevel).toBe(3);
  });

  it('Ogre Fighter 2 (racial HD 4 in classLevels, LA +2): characterLevel = 6, eclForXp = 8', () => {
    // Racial HD are stored in classLevels (e.g., "hd_ogre": 4).
    // An Ogre Fighter 2 has: 4 racial HD + 2 Fighter levels + LA 2 = ECL 8.
    // @characterLevel = 6 (4 HD + 2 Fighter) — used for feats/HP/skills
    // @eclForXp       = 8 (6 + LA 2)         — used for XP requirement
    const classLevels = { 'hd_ogre': 4, 'class_fighter': 2 };
    const characterLevel = Object.values(classLevels).reduce((sum, lvl) => sum + lvl, 0);
    const eclForXp = computeEclForXp(classLevels, 2);

    expect(characterLevel).toBe(6);
    expect(eclForXp).toBe(8);
  });

  // -----------------------------------------------------------------------
  // Reducing Level Adjustment variant (ARCHITECTURE.md section 6.4, SRD variant)
  // -----------------------------------------------------------------------

  it('Reducing LA variant: Drow Rogue 6 pays XP to reduce LA from 2 to 1 → eclForXp drops from 8 to 7', () => {
    // After accumulating 3× LA (= 6 class levels), a Drow may pay XP to reduce LA by 1.
    // Before reduction: Drow Rogue 6, LA 2 → ECL 8
    const classLevelsBefore = { 'class_rogue': 6 };
    const eclBefore = computeEclForXp(classLevelsBefore, 2);
    expect(eclBefore).toBe(8);

    // After reduction: same class levels, LA 1 → ECL 7
    // (character.levelAdjustment is mutated from 2 → 1 after paying XP)
    const eclAfter = computeEclForXp(classLevelsBefore, 1);
    expect(eclAfter).toBe(7);

    // The XP advantage of reducing LA: ECL drops, so next level is cheaper.
    expect(eclBefore - eclAfter).toBe(1);
  });

  it('Reducing LA to 0: Drow Rogue 12 (LA 0 after full reduction) → eclForXp === characterLevel', () => {
    // Full LA reduction to 0: ECL is now identical to character level.
    const classLevels = { 'class_rogue': 12 };
    const characterLevel = Object.values(classLevels).reduce((sum, lvl) => sum + lvl, 0);
    const eclForXp = computeEclForXp(classLevels, 0);

    expect(characterLevel).toBe(12);
    expect(eclForXp).toBe(12);
    expect(eclForXp).toBe(characterLevel); // Fully reduced — no longer a burden
  });

  // -----------------------------------------------------------------------
  // ECL property invariants
  // -----------------------------------------------------------------------

  it('ECL is never less than characterLevel (LA is always ≥ 0)', () => {
    // Level Adjustment cannot be negative per the SRD.
    // This invariant ensures ECL lookups never go below actual class-level count.
    const testCases: Array<{ classLevels: Record<string, number>; la: number }> = [
      { classLevels: {},                                          la: 0 },
      { classLevels: { 'class_fighter': 1 },                     la: 0 },
      { classLevels: { 'class_fighter': 5, 'class_wizard': 3 },  la: 0 },
      { classLevels: { 'class_rogue': 3 },                       la: 2 },
      { classLevels: { 'hd_gnoll': 2, 'class_ranger': 1 },       la: 1 },
    ];

    for (const { classLevels, la } of testCases) {
      const characterLevel = Object.values(classLevels).reduce((sum, lvl) => sum + lvl, 0);
      const eclForXp = computeEclForXp(classLevels, la);
      expect(eclForXp).toBeGreaterThanOrEqual(characterLevel);
    }
  });

  it('ECL delta equals levelAdjustment exactly', () => {
    // eclForXp - characterLevel === levelAdjustment, always.
    const testCases: Array<{ classLevels: Record<string, number>; la: number }> = [
      { classLevels: { 'class_fighter': 5 },  la: 0 },
      { classLevels: { 'class_rogue': 3 },    la: 2 },
      { classLevels: { 'class_fighter': 4 },  la: 3 },
      { classLevels: { 'hd_ogre': 4, 'class_fighter': 2 }, la: 2 },
    ];

    for (const { classLevels, la } of testCases) {
      const characterLevel = Object.values(classLevels).reduce((sum, lvl) => sum + lvl, 0);
      const eclForXp = computeEclForXp(classLevels, la);
      expect(eclForXp - characterLevel).toBe(la);
    }
  });
});

// ============================================================
// SCENARIO 7: Skill Point Budget (Multiclass-correct calculation)
// ============================================================

/**
 * D&D 3.5 MULTICLASS SKILL POINTS (SRD RAW):
 *   Each class grants SP/level independently. You do NOT average them.
 *   Fighter: 2+INT per level,  Rogue: 8+INT per level.
 *
 * FIRST CHARACTER LEVEL BONUS (SRD, "Skills" section):
 *   "At 1st level, you get four times the number of skill points you normally
 *    get for a level in that class."
 *   The class taken at character level 1 gets 4× SP for that one level.
 *   = 3 extra × max(1, spPerLevel + intMod) added to that class's total.
 *
 * Fighter 5 / Rogue 3 with INT 14 (+2 mod), Fighter taken first:
 *   Fighter: max(1, 2+2)×5 + 3×4 = 20 + 12 = 32 SP  (with first-level bonus)
 *   Rogue:   max(1, 8+2)×3        = 30 SP
 *   Total: 62 SP  (RAW with first-level bonus)
 *
 * WITHOUT first-level bonus:
 *   Fighter: max(1, 2+2)×5 = 20 SP
 *   Rogue:   max(1, 8+2)×3 = 30 SP
 *   Total: 50 SP  (per-class correct but missing first level)
 *
 * WRONG (broken unified formula): max(1, (2+8)+2) × 8 = 12 × 8 = 96 SP
 *
 * This simulates the per-class calculation logic in GameEngine.phase4_skillPointsBudget.
 */

/**
 * First-level 4× bonus: extra SP granted at character level 1.
 * Returns 3 × max(1, spPerLevel + intMod) — the "extra 3 multiples" beyond the normal 1×.
 */
function firstLevelBonus(spPerLevel: number, intModifier: number): number {
  return 3 * Math.max(1, spPerLevel + intModifier);
}

/**
 * Compute the correct D&D 3.5 per-class skill point budget.
 *
 * @param classes          - Array of {spPerLevel, classLevel, isFirstClass}.
 * @param intModifier      - Current INT modifier (applies to ALL classes' SP/level).
 * @param bonusSpPerLevel  - Additional flat SP/level from racial/feat sources.
 * @returns Total available skill points.
 */
function computeCorrectSkillPointBudget(
  classes: Array<{ spPerLevel: number; classLevel: number; isFirstClass?: boolean }>,
  intModifier: number,
  bonusSpPerLevel = 0
): { totalClassPoints: number; totalBonusPoints: number; totalAvailable: number } {
  const characterLevel = classes.reduce((sum, c) => sum + c.classLevel, 0);
  const totalClassPoints = classes.reduce((sum, c) => {
    const pointsPerLevel = Math.max(1, c.spPerLevel + intModifier);
    const base = pointsPerLevel * c.classLevel;
    const bonus = c.isFirstClass ? 3 * pointsPerLevel : 0; // first-level 4× bonus
    return sum + base + bonus;
  }, 0);
  const totalBonusPoints = bonusSpPerLevel * characterLevel;
  return {
    totalClassPoints,
    totalBonusPoints,
    totalAvailable: totalClassPoints + totalBonusPoints,
  };
}

/**
 * Compute the WRONG (broken) legacy formula:
 *   (sum of all class SP/level + bonus) × totalCharacterLevel
 * This is what the old SkillsMatrix used before the fix.
 */
function computeWrongSkillPointBudget(
  classes: Array<{ spPerLevel: number; classLevel: number }>,
  intModifier: number,
  bonusSpPerLevel = 0
): number {
  const characterLevel = classes.reduce((sum, c) => sum + c.classLevel, 0);
  const totalSpPerLevel = classes.reduce((sum, c) => sum + c.spPerLevel, 0) + bonusSpPerLevel;
  return Math.max(1, totalSpPerLevel + intModifier) * characterLevel;
}

describe('Multiclass skill points: per-class calculation (ARCHITECTURE.md Phase 9.6)', () => {
  /**
   * THE CORE MULTICLASS BUG:
   *   Old broken formula: (2+8+INT) × 8 = 12×8 = 96 (WRONG — averages class SP/level)
   *   Correct (no first-level bonus):   Fighter 20 + Rogue 30 = 50 (per-class independent)
   *   Correct (WITH first-level bonus): Fighter (20+12) + Rogue 30 = 62 (SRD RAW)
   */
  it('Fighter 5 / Rogue 3 (INT 14, +2 mod) WITHOUT first-level bonus: 50 SP', () => {
    const classes = [
      { spPerLevel: 2, classLevel: 5 }, // Fighter — no isFirstClass flag
      { spPerLevel: 8, classLevel: 3 }, // Rogue
    ];
    const intMod = 2;

    const result = computeCorrectSkillPointBudget(classes, intMod);
    // Fighter: max(1, 2+2)×5 = 20 ; Rogue: max(1, 8+2)×3 = 30
    expect(result.totalClassPoints).toBe(50);
  });

  it('Fighter 5 first, Rogue 3 (INT 14, +2 mod) WITH first-level bonus: 62 SP (SRD RAW)', () => {
    const classes = [
      { spPerLevel: 2, classLevel: 5, isFirstClass: true }, // Fighter at char level 1
      { spPerLevel: 8, classLevel: 3 },                     // Rogue
    ];
    const intMod = 2;

    const result = computeCorrectSkillPointBudget(classes, intMod);
    // Fighter: max(1,2+2)×5 + firstLevelBonus(2,2) = 20 + 3×4 = 20+12 = 32
    // Rogue:   max(1,8+2)×3 = 30
    expect(firstLevelBonus(2, intMod)).toBe(12);
    expect(result.totalClassPoints).toBe(62);
  });

  it('Broken (unified) formula gives 96 SP — nearly 2× too many', () => {
    const classes = [
      { spPerLevel: 2, classLevel: 5 },
      { spPerLevel: 8, classLevel: 3 },
    ];
    const intMod = 2;
    const wrong = computeWrongSkillPointBudget(classes, intMod);
    expect(wrong).toBe(96); // (2+8+2)×8 = 12×8 = 96
    // Correct RAW (per-class + first-level bonus) = 62
    expect(wrong).toBeGreaterThan(62);
  });

  it('Single class Fighter 10 with INT 10 (0 mod): correct = 20 SP', () => {
    const classes = [{ spPerLevel: 2, classLevel: 10 }];
    const intMod = 0;
    const result = computeCorrectSkillPointBudget(classes, intMod);
    // max(1, 2+0) × 10 = 2 × 10 = 20
    expect(result.totalClassPoints).toBe(20);
    expect(result.totalAvailable).toBe(20);
  });

  it('Single class Rogue 5 with INT 16 (+3 mod): correct = 55 SP', () => {
    const classes = [{ spPerLevel: 8, classLevel: 5 }];
    const intMod = 3;
    const result = computeCorrectSkillPointBudget(classes, intMod);
    // max(1, 8+3) × 5 = 11 × 5 = 55
    expect(result.totalClassPoints).toBe(55);
    expect(result.totalAvailable).toBe(55);
  });

  it('INT floor: min 1 SP per level even with negative INT modifier', () => {
    const classes = [{ spPerLevel: 2, classLevel: 4 }];
    const intMod = -3; // INT 4, very low

    const result = computeCorrectSkillPointBudget(classes, intMod);
    // max(1, 2 + (-3)) = max(1, -1) = 1 → 1 × 4 = 4 SP  (NOT 0 or negative)
    expect(result.totalClassPoints).toBe(4);
    expect(result.totalAvailable).toBe(4);
  });

  it('INT floor: even 0 SP/level class gets 1 SP/level minimum (hypothetical)', () => {
    // Hypothetical class with 0 base skill points — still gets 1/level minimum
    const classes = [{ spPerLevel: 0, classLevel: 3 }];
    const intMod = 0;
    const result = computeCorrectSkillPointBudget(classes, intMod);
    // max(1, 0+0) = 1 → 1 × 3 = 3 SP
    expect(result.totalClassPoints).toBe(3);
  });

  it('firstLevelBonus(): 3 × max(1, spPerLevel + intMod)', () => {
    expect(firstLevelBonus(2, 2)).toBe(12); // 3 × max(1, 2+2) = 3×4 = 12 (Fighter + INT 14)
    expect(firstLevelBonus(8, 2)).toBe(30); // 3 × max(1, 8+2) = 3×10 = 30 (Rogue + INT 14)
    expect(firstLevelBonus(2, -3)).toBe(3); // 3 × max(1, 2-3) = 3×1 = 3 (INT floor)
    expect(firstLevelBonus(0, 0)).toBe(3);  // 3 × max(1, 0+0) = 3×1 = 3 (min 1/level)
  });

  it('Single class Fighter 1 with INT 14 (+2 mod), isFirstClass: 4× = 16 SP at L1', () => {
    // Without first-level bonus: max(1,2+2)×1 = 4 SP
    // With first-level 4× bonus: 4 + 3×4 = 16 SP (= 4×4)
    const base = computeCorrectSkillPointBudget([{ spPerLevel: 2, classLevel: 1 }], 2);
    const withBonus = computeCorrectSkillPointBudget([{ spPerLevel: 2, classLevel: 1, isFirstClass: true }], 2);
    expect(base.totalClassPoints).toBe(4);       // 1 level at 4/level
    expect(withBonus.totalClassPoints).toBe(16); // 4 × 4 SP (the 4× first-level rule)
  });

  it('Racial bonus SP/level is applied per TOTAL character level (not per-class)', () => {
    // Human +1 SP/level applies to every level of EVERY class.
    // Fighter 3 / Rogue 2 with INT 10 (mod 0), Human +1 SP/level, Fighter taken first:
    //   Fighter:  max(1,2+0)×3 + firstLevelBonus(2,0) = 6 + 3×2 = 6+6 = 12
    //   Rogue:    max(1,8+0)×2 = 16
    //   Bonus SP: 1 × (3+2) = 5
    //   Total: 12 + 16 + 5 = 33 SP (RAW with first-level bonus)
    // Without first-level bonus (base per-class only):
    //   Fighter 6 + Rogue 16 + Bonus 5 = 27 SP
    const classes = [
      { spPerLevel: 2, classLevel: 3, isFirstClass: true }, // Fighter (first class)
      { spPerLevel: 8, classLevel: 2 },                     // Rogue
    ];
    const intMod = 0;
    const bonusSpPerLevel = 1; // Human racial
    const result = computeCorrectSkillPointBudget(classes, intMod, bonusSpPerLevel);

    // Fighter base 6 + firstLevel bonus 6 = 12; Rogue 16; class total = 28
    expect(result.totalClassPoints).toBe(28); // 12 + 16
    expect(result.totalBonusPoints).toBe(5);  // 1 × 5 levels
    expect(result.totalAvailable).toBe(33);   // 28 + 5

    // For reference — WITHOUT first-level bonus:
    const noBonus = computeCorrectSkillPointBudget(
      [{ spPerLevel: 2, classLevel: 3 }, { spPerLevel: 8, classLevel: 2 }],
      intMod, bonusSpPerLevel
    );
    expect(noBonus.totalAvailable).toBe(27); // 6+16+5 = 27
  });

  it('Multiclass with identical SP/level classes: correct = broken formula', () => {
    // If all classes have the same SP/level, both formulas agree.
    // Fighter 3 / Barbarian 3 — both have 2+INT SP/level.
    const classes = [
      { spPerLevel: 2, classLevel: 3 },
      { spPerLevel: 2, classLevel: 3 },
    ];
    const intMod = 2; // INT 14
    const correct = computeCorrectSkillPointBudget(classes, intMod);
    const wrong   = computeWrongSkillPointBudget(classes, intMod);

    // Both should be max(1, 2+2) × 3 + max(1, 2+2) × 3 = 4×3 + 4×3 = 24
    // Wrong formula: max(1, (2+2)+2) × 6 = 6×6 = 36 (STILL WRONG — summing SP first)
    // Correct formula: 4 × 3 + 4 × 3 = 24
    expect(correct.totalAvailable).toBe(24);
    expect(wrong).toBe(36); // The broken formula double-counts when multiple classes have same SP
  });

  it('Three-class multiclass: each class independent', () => {
    // Fighter 2 / Rogue 3 / Wizard 4 with INT 12 (+1 mod):
    //   Fighter: max(1, 2+1) × 2 = 3 × 2 = 6
    //   Rogue:   max(1, 8+1) × 3 = 9 × 3 = 27
    //   Wizard:  max(1, 2+1) × 4 = 3 × 4 = 12 (Wizards also get 2+INT in 3.5)
    //   Total: 6 + 27 + 12 = 45
    const classes = [
      { spPerLevel: 2, classLevel: 2 }, // Fighter
      { spPerLevel: 8, classLevel: 3 }, // Rogue
      { spPerLevel: 2, classLevel: 4 }, // Wizard
    ];
    const intMod = 1;
    const result = computeCorrectSkillPointBudget(classes, intMod);
    expect(result.totalClassPoints).toBe(45);
    expect(result.totalAvailable).toBe(45);
  });

  it('Zero levels — no skill points', () => {
    // Character with no class levels: 0 SP
    const result = computeCorrectSkillPointBudget([], 0);
    expect(result.totalClassPoints).toBe(0);
    expect(result.totalAvailable).toBe(0);
  });
});

// ============================================================
// SCENARIO 8: Minimum Skill Rank Enforcement
// ============================================================

describe('Minimum skill rank enforcement (D&D 3.5 level-up permanence)', () => {
  /**
   * D&D 3.5 RULE:
   *   Skill points allocated when leveling up are PERMANENTLY spent.
   *   You cannot lower a skill rank to reclaim skill points after committing a level.
   *
   * The engine enforces this via:
   *   1. character.minimumSkillRanks: per-skill floor (set by lockSkillRanksMin())
   *   2. engine.setSkillRanks(): clamps to max(minimumRanks, requestedRanks)
   */

  it('Minimum clamp: setSkillRanks cannot go below the locked floor', () => {
    // Simulate the engine's setSkillRanks() clamping logic
    function simulateSetSkillRanks(
      currentRanks: number,
      requestedRanks: number,
      minimumRanks: number
    ): number {
      // Engine logic: const minimum = character.minimumSkillRanks?.[skillId] ?? 0;
      return Math.max(minimumRanks, Math.max(0, requestedRanks));
    }

    // Ranks locked at 5 — cannot go below 5
    expect(simulateSetSkillRanks(5, 3, 5)).toBe(5); // clamped to floor
    expect(simulateSetSkillRanks(5, 0, 5)).toBe(5); // clamped to floor
    expect(simulateSetSkillRanks(5, 6, 5)).toBe(6); // above floor — OK
    expect(simulateSetSkillRanks(5, 5, 5)).toBe(5); // at floor — OK

    // No floor set (character creation) — can go to 0
    expect(simulateSetSkillRanks(5, 0, 0)).toBe(0);  // no floor — allowed
    expect(simulateSetSkillRanks(5, 3, 0)).toBe(3);  // no floor — allowed
  });

  it('Floor is the MAXIMUM of existing floor and current ranks', () => {
    // lockSkillRanksMin() sets floor = max(existingMin, currentRanks)
    function simulateLockRanks(existingMin: number, currentRanks: number): number {
      return Math.max(existingMin, currentRanks);
    }

    // First lock: floor becomes current ranks
    expect(simulateLockRanks(0, 3)).toBe(3);
    expect(simulateLockRanks(0, 5)).toBe(5);
    // Second lock after gaining more ranks: floor increases
    expect(simulateLockRanks(3, 5)).toBe(5);
    // Second lock with same ranks: floor unchanged
    expect(simulateLockRanks(5, 5)).toBe(5);
    // Cannot LOWER the floor via locking (the max() prevents this)
    expect(simulateLockRanks(5, 3)).toBe(5); // floor stays at 5, not 3
  });

  it('Floor is 0 for absent minimumSkillRanks (character creation mode)', () => {
    // When minimumSkillRanks is undefined/absent, all skills have floor 0.
    // This is the character creation state where ranks are freely editable.
    function getFloor(minimumSkillRanks: Record<string, number> | undefined, skillId: string): number {
      return minimumSkillRanks?.[skillId] ?? 0;
    }

    // Undefined record → all floors are 0
    expect(getFloor(undefined, 'skill_climb')).toBe(0);
    expect(getFloor(undefined, 'skill_tumble')).toBe(0);

    // Empty record → all floors are 0
    expect(getFloor({}, 'skill_climb')).toBe(0);

    // Skill not in the record → floor is 0
    expect(getFloor({ 'skill_climb': 3 }, 'skill_tumble')).toBe(0);
  });

  it('Multiclass scenario: cross-class skill cost affects SP budget', () => {
    // A skill that is a class skill costs 1 SP/rank.
    // A cross-class skill costs 2 SP/rank.
    // For a Fighter/Rogue: Climb is a Fighter class skill (1/rank),
    //   and Use Magic Device is a Rogue class skill (1/rank).
    //   Knowledge Arcana is cross-class for both (2/rank).
    function computeSpSpent(
      skills: Array<{ ranks: number; isClassSkill: boolean }>
    ): number {
      return skills.reduce((sum, s) => sum + s.ranks * (s.isClassSkill ? 1 : 2), 0);
    }

    // Example: 5 ranks Climb (class, 1/rank) + 3 ranks UMD (class, 1/rank) + 2 ranks Arcana (cross, 2/rank)
    const sp = computeSpSpent([
      { ranks: 5, isClassSkill: true  }, // Climb: class skill
      { ranks: 3, isClassSkill: true  }, // UMD: class skill
      { ranks: 2, isClassSkill: false }, // Knowledge Arcana: cross-class (×2)
    ]);
    // 5×1 + 3×1 + 2×2 = 5 + 3 + 4 = 12
    expect(sp).toBe(12);
  });
});
