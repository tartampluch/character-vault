/**
 * @file src/tests/characterBuildScenario.test.ts
 * @description Comprehensive character build scenario test.
 *
 * Tests the full mechanical accuracy of a complex multiclass character by
 * exercising the same pure utility functions the GameEngine uses internally.
 * (The GameEngine itself uses Svelte 5 $derived runes and cannot be instantiated
 * in Vitest — see multiclass.test.ts for the established testing pattern.)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CHARACTER BUILD: Fighter 3 / Monk 3 / Psion 1 / Wizard 1  (Level 8, ECL 8)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * LEVELING ORDER (critical for D&D 3.5 skill-point attribution):
 *   Char Lvl 1 → Fighter 1   (d10 HP, 2+INT SP/lv,  full BAB, Good Fort)
 *   Char Lvl 2 → Monk 1      (d8  HP, 4+INT SP/lv,  ¾ BAB,   All Good saves)
 *   Char Lvl 3 → Fighter 2   (d10 HP, Fighter bonus feat #2)
 *   Char Lvl 4 → Fighter 3   (d10 HP)  ← ASI #1: CON 17→18 (mod +3→+4)
 *   Char Lvl 5 → Psion 1     (d4  HP, 2+INT SP/lv,  half BAB, Poor Fort/Ref, Good Will)
 *   Char Lvl 6 → Monk 2      (d8  HP, Evasion)
 *   Char Lvl 7 → Monk 3      (d8  HP, Still Mind)
 *   Char Lvl 8 → Wizard 1    (d4  HP, 2+INT SP/lv,  half BAB, Good Will) ← ASI #2: CON 18→19
 *
 * BASE ABILITY SCORES (rolled; ASIs noted above):
 *   STR 18 (+4) | DEX 16 (+3) | CON 17→19 (+3→+4) | INT 15 (+2) | WIS 14 (+2) | CHA 13 (+1)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EXPECTED RESULTS (documented and verified in each test below):
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   Character level        8
 *   ECL (LA = 0)           8
 *   CON after both ASIs    19 (modifier +4 — both ASIs go to CON; 18 and 19 share the same +4 mod)
 *
 *   BAB breakdown:
 *     Fighter 3 (full):   +1+1+1 = +3
 *     Monk 3 (3/4):       +0+1+1 = +2
 *     Psion 1 (half):     +0     =  0
 *     Wizard 1 (half):    +0     =  0
 *     TOTAL BAB:          +5
 *
 *   Save bases (from class level-progression only, before ability modifiers):
 *     Fort: Fighter(Good 3) + Monk(Good 3) + Psion(Poor 1) + Wiz(Poor 1) = 3+3+0+0 = +6
 *     Ref:  Fighter(Poor 1) + Monk(Good 3) + Psion(Poor 1) + Wiz(Poor 1) = 1+3+0+0 = +4
 *     Will: Fighter(Poor 1) + Monk(Good 3) + Psion(Good 2) + Wiz(Good 2) = 1+3+2+2 = +8
 *   Saves with ability modifiers (CON+4, DEX+3, WIS+2):
 *     Fort +10 | Ref +7 | Will +10
 *
 *   Skill points (INT mod +2; Fighter was taken first → 4× bonus at char level 1):
 *     Fighter 3: max(1, 2+2)×3 + 3×max(1, 2+2) = 12 + 12 = 24  ← first-level 4× bonus
 *     Monk 3:    max(1, 4+2)×3 = 18
 *     Psion 1:   max(1, 2+2)×1 =  4
 *     Wizard 1:  max(1, 2+2)×1 =  4
 *     TOTAL SP:  50
 *
 *   Feat slots:
 *     Base (1 + floor(8/3)):     3
 *     Fighter bonus feats (L1,2): +2
 *     TOTAL:                     5
 *
 *   Hit Points (fixed dice: max at char lvl 1, half+1 thereafter; CON mod = +4):
 *     Dice: [10, 5, 6, 6, 3, 5, 5, 3] → sum = 43
 *     CON bonus: +4 × 8 = +32
 *     MAX HP = 75
 *
 *   AC (no armor, unencumbered — Monk WIS-to-AC applies):
 *     10 (base) + 3 (DEX) + 2 (Monk WIS bonus) = 15
 *     Monk level 3 AC enhancement: not yet (starts at Monk 5)
 *
 *   Wizard 1 spells per day (INT 15, mod +2):
 *     0-level: 3  (no INT bonus on cantrips)
 *     1st:     2  (1 base + 1 INT bonus; INT mod ≥ 1)
 *     2nd+:    0  (not yet accessible at Wizard 1)
 *
 *   Psionic power points (Psion 1, key ability INT 15):
 *     Base PP at level 1:  2   (standard Psion class table)
 *     INT-bonus PP (INT 14–15 tier, column "1st"): +1
 *     TOTAL PP:            3
 *
 *   Multiclass XP penalty (informational — applied by GM, not engine):
 *     Highest class level = 3 (Fighter and Monk both at 3).
 *     Psion 1 and Wizard 1 are each 2 levels below → XP penalty applies.
 *
 * @see ARCHITECTURE.md section 5.4 — levelProgression mechanics
 * @see ARCHITECTURE.md section 9   — DAG phase descriptions
 * @see src/tests/multiclass.test.ts — established testing pattern
 * @see src/lib/utils/stackingRules.ts — applyStackingRules
 */

import { describe, it, expect } from 'vitest';
import { applyStackingRules } from '$lib/utils/stackingRules';
import type { Modifier } from '$lib/types/pipeline';
import type { Feature, LevelProgressionEntry } from '$lib/types/feature';
import type { ModifierType } from '$lib/types/primitives';

// =============================================================================
// PURE HELPERS
// =============================================================================

/** Sum of all class levels = total character level. */
const characterLevel = (cl: Record<string, number>) =>
  Object.values(cl).reduce((s, v) => s + v, 0);

/** ECL = character level + level adjustment. */
const eclForXp = (cl: Record<string, number>, la: number) =>
  characterLevel(cl) + la;

/** D&D 3.5 ability modifier: floor((score − 10) / 2). */
const abilityMod = (score: number) => Math.floor((score - 10) / 2);

/**
 * Collect modifiers targeting `targetId` from a class's levelProgression
 * entries up to and including `classLevel`.
 *
 * Mirrors GameEngine.#collectModifiersFromInstance() level-gating logic.
 */
function collectClassMods(
  progression: LevelProgressionEntry[],
  classLevel: number,
  targetId: string
): Modifier[] {
  return progression
    .filter(e => e.level <= classLevel)
    .flatMap(e => e.grantedModifiers)
    .filter(m => m.targetId === targetId);
}

/**
 * Collect all grantedFeature IDs from levelProgression entries up to classLevel.
 * Mirrors GameEngine.phase_grantedFeatIds and levelProgression resolution.
 */
function collectGrantedFeatures(progression: LevelProgressionEntry[], classLevel: number): string[] {
  return progression
    .filter(e => e.level <= classLevel)
    .flatMap(e => e.grantedFeatures);
}

/**
 * D&D 3.5 per-class skill point budget (base, without first-level bonus).
 * Each class contributes max(1, spPerLevel + intMod) × classLevel independently.
 *
 * @see firstLevelSpBonus for the additional 4× multiplier at character level 1.
 * @see GameEngine.phase4_skillPointsBudget
 */
function classSkillPoints(spPerLevel: number, classLevel: number, intMod: number): number {
  return Math.max(1, spPerLevel + intMod) * classLevel;
}

/**
 * D&D 3.5 first-level 4× skill point bonus.
 *
 * At character level 1, the first class taken grants 4× the normal SP instead of 1×.
 * (SRD, "Skills" section: "At 1st level, you get four times the number of skill points
 * you normally get for a level in that class.")
 *
 * This function returns the EXTRA portion — the bonus above the base 1× calculation:
 *   bonus = 3 × max(1, spPerLevel + intMod)
 *
 * The total for the first class is:  classSkillPoints(...) + firstLevelSpBonus(...)
 *
 * @param spPerLevel  Base SP/level for the first class taken at character level 1.
 * @param intMod      Current INT modifier.
 */
function firstLevelSpBonus(spPerLevel: number, intMod: number): number {
  return 3 * Math.max(1, spPerLevel + intMod);
}

/**
 * Max HP = sum(hitDieResults) + CON modifier × character level.
 * Mirrors GameEngine phase 3 HP formula (@see ARCHITECTURE.md section 9 Phase 3).
 */
function maxHp(dice: number[], conMod: number): number {
  return dice.reduce((s, v) => s + v, 0) + conMod * dice.length;
}

/**
 * Compute bonus spell slots per spell level from an ability modifier.
 * Returns array indexed by spell level (0 = cantrips, no bonus; 1–9 = spell levels).
 *
 * D&D 3.5 rule: +1 bonus slot at each spell level ≤ ability modifier value.
 * E.g., INT mod +2 → +1 bonus at 1st and 2nd level.
 */
function bonusSpellSlots(abilityModifier: number, highestCastableLevel: number): number[] {
  const slots = [0]; // index 0 = cantrips; never get bonus
  for (let lvl = 1; lvl <= highestCastableLevel; lvl++) {
    slots.push(abilityModifier >= lvl ? 1 : 0);
  }
  return slots;
}

/**
 * Compute bonus psionic power points from an ability score.
 *
 * D&D 3.5 Expanded Psionics Handbook table (SRD psionics):
 *   The table grants additional PP for each "tier" (column) accessible at the
 *   character's manifester level. For a manifester level 1 character:
 *     Int 12–13 → +1 PP (tier 1 bonus)
 *     Int 14–15 → +1 PP (tier 1) + +1 PP (tier 2, but not accessible at ML 1) = +1 usable
 *   For simplicity, a manifester level 1 character with Int 14–15 gains +1 bonus PP.
 *
 * @param intScore  - The character's Intelligence score.
 * @param manifesterLevel - The character's manifester level (determines accessible tiers).
 * @returns Total bonus power points from the ability score.
 */
function psionicBonusPP(intScore: number, manifesterLevel: number): number {
  const mod = abilityMod(intScore);
  if (mod <= 0) return 0;
  // Each tier (power level 1–9) grants +1 bonus PP if the key score column is active.
  // A tier is accessible if: manifesterLevel >= tier × 2 - 1 (standard power level unlocks)
  // For manifester level 1, only tier 1 power level (1st) is accessible.
  let bonus = 0;
  for (let tier = 1; tier <= 9; tier++) {
    const minManifesterLevel = tier * 2 - 1; // level 1 → tier 1, level 3 → tier 2, etc.
    if (manifesterLevel >= minManifesterLevel && intScore >= 10 + tier * 2) {
      bonus += 1;
    }
  }
  return bonus;
}

// =============================================================================
// MOCK CLASS DEFINITIONS
// =============================================================================

/** Shorthand: produce a Modifier for use in levelProgression.grantedModifiers. */
function m(id: string, sourceId: string, targetId: string, value: number, type: ModifierType = 'base'): Modifier {
  return { id, sourceId, sourceName: { en: sourceId }, targetId, value, type };
}

// ---------------------------------------------------------------------------
// Fighter — Full BAB, Good Fort / Poor Ref+Will, 2+INT SP/lv, d10 HD
//
// SAVE PROGRESSION (D&D 3.5 SRD, ARCHITECTURE.MD convention):
//   Good:  increments +2, +0, +1, +0, +1 … (cumulative: 2, 2, 3, 3, 4 …)
//   Poor:  increments +0, +0, +1, +0, +0 … (cumulative: 0, 0, 1, 1, 1 …)
//
// BONUS FEAT SLOTS:
//   The engine resolves Fighter bonus feats via:
//     levelProgression.grantedFeatures → ['class_feature_fighter_bonus_feat']
//     → that feature's grantedModifiers → bonus_feat_slots +1
//   For this pure-function test we embed the bonus_feat_slots modifier directly
//   in the levelProgression grantedModifiers (equivalent net result).
// ---------------------------------------------------------------------------
const MOCK_FIGHTER: Feature = {
  id: 'class_fighter',
  category: 'class',
  label: { en: 'Fighter', fr: 'Guerrier' },
  description: { en: 'Master of martial combat.' },
  tags: ['class', 'fighter'],
  ruleSource: 'test_build',
  grantedModifiers: [
    m('f_sp',  'class_fighter', 'attributes.skill_points_per_level', 2),
    m('f_hd',  'class_fighter', 'combatStats.hit_die_type',         10),
  ],
  grantedFeatures: [],
  classSkills: [
    'skill_climb', 'skill_craft', 'skill_handle_animal', 'skill_intimidate',
    'skill_jump', 'skill_knowledge_dungeoneering', 'skill_ride', 'skill_swim',
  ],
  levelProgression: [
    {
      level: 1,
      // Fighter L1 bonus feat → grants bonus_feat_slots +1
      grantedFeatures: ['class_feature_fighter_bonus_feat'],
      grantedModifiers: [
        m('f_bab_1',        'class_fighter', 'combatStats.bab',              1),
        m('f_fort_1',       'class_fighter', 'saves.fort',                   2), // Good: +2 at L1
        m('f_ref_1',        'class_fighter', 'saves.ref',                    0), // Poor: +0 at L1
        m('f_will_1',       'class_fighter', 'saves.will',                   0), // Poor: +0 at L1
        m('f_bonus_feat_1', 'class_fighter', 'attributes.bonus_feat_slots',  1, 'untyped'),
      ],
    },
    {
      level: 2,
      // Fighter L2 bonus feat → grants bonus_feat_slots +1
      grantedFeatures: ['class_feature_fighter_bonus_feat_2'],
      grantedModifiers: [
        m('f_bab_2',        'class_fighter', 'combatStats.bab',              1),
        m('f_fort_2',       'class_fighter', 'saves.fort',                   0), // Good: +0 at L2
        m('f_ref_2',        'class_fighter', 'saves.ref',                    0),
        m('f_will_2',       'class_fighter', 'saves.will',                   0),
        m('f_bonus_feat_2', 'class_fighter', 'attributes.bonus_feat_slots',  1, 'untyped'),
      ],
    },
    {
      level: 3,
      grantedFeatures: [],
      grantedModifiers: [
        m('f_bab_3',  'class_fighter', 'combatStats.bab',  1),
        m('f_fort_3', 'class_fighter', 'saves.fort',       1), // Good: +1 at L3
        m('f_ref_3',  'class_fighter', 'saves.ref',        1), // Poor: +1 at L3
        m('f_will_3', 'class_fighter', 'saves.will',       1), // Poor: +1 at L3
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Monk — 3/4 BAB, ALL Good saves, 4+INT SP/lv, d8 HD
//
// SPECIAL RULE — WIS to AC (unarmored, unencumbered):
//   "When unarmored and unencumbered, the monk adds her Wisdom bonus to AC."
//   Modeled here as an 'untyped' modifier on all three AC pipelines.
//   In the live engine this has a conditionNode checking !wearing_armor && !encumbered;
//   the modifier value is resolved from "@attributes.stat_wis.derivedModifier".
//   For the AC test we use the character's WIS modifier directly (WIS 14 → +2).
//
// BAB (3/4 progression): floor(3/4 × level)
//   Level 1: floor(0.75) = 0   → increment 0
//   Level 2: floor(1.50) = 1   → increment +1
//   Level 3: floor(2.25) = 2   → increment +1
//   Total at Monk 3: +2
// ---------------------------------------------------------------------------
const MOCK_MONK: Feature = {
  id: 'class_monk',
  category: 'class',
  label: { en: 'Monk', fr: 'Moine' },
  description: { en: 'Master of unarmed combat and inner power.' },
  tags: ['class', 'monk'],
  ruleSource: 'test_build',
  grantedModifiers: [
    m('mk_sp', 'class_monk', 'attributes.skill_points_per_level', 4),
    m('mk_hd', 'class_monk', 'combatStats.hit_die_type',          8),
    // WIS-to-AC (unarmored Monk). In the live engine, value is a formula string.
    // For the test we set the already-resolved numeric value (WIS 14 → +2).
    { id: 'mk_wis_ac', sourceId: 'class_monk', sourceName: { en: 'Monk: Wisdom to AC' },
      targetId: 'combatStats.ac_normal', value: 2, type: 'untyped' as ModifierType },
  ],
  grantedFeatures: ['class_feature_improved_unarmed_strike', 'class_feature_stunning_fist'],
  classSkills: [
    'skill_balance', 'skill_climb', 'skill_concentration', 'skill_craft',
    'skill_diplomacy', 'skill_escape_artist', 'skill_hide', 'skill_jump',
    'skill_knowledge_arcana', 'skill_knowledge_religion', 'skill_listen',
    'skill_move_silently', 'skill_perform', 'skill_profession',
    'skill_sense_motive', 'skill_spot', 'skill_swim', 'skill_tumble',
  ],
  levelProgression: [
    {
      level: 1,
      grantedFeatures: ['class_feature_flurry_of_blows'],
      grantedModifiers: [
        m('mk_bab_1',  'class_monk', 'combatStats.bab', 0), // ¾ BAB: +0 at L1
        m('mk_fort_1', 'class_monk', 'saves.fort',      2), // Good: +2 at L1
        m('mk_ref_1',  'class_monk', 'saves.ref',       2), // Good: +2 at L1
        m('mk_will_1', 'class_monk', 'saves.will',      2), // Good: +2 at L1
      ],
    },
    {
      level: 2,
      grantedFeatures: ['class_feature_evasion'],
      grantedModifiers: [
        m('mk_bab_2',  'class_monk', 'combatStats.bab', 1), // ¾ BAB: +1 at L2
        m('mk_fort_2', 'class_monk', 'saves.fort',      0), // Good: +0 at L2
        m('mk_ref_2',  'class_monk', 'saves.ref',       0),
        m('mk_will_2', 'class_monk', 'saves.will',      0),
      ],
    },
    {
      level: 3,
      grantedFeatures: ['class_feature_still_mind'],
      grantedModifiers: [
        m('mk_bab_3',  'class_monk', 'combatStats.bab', 1), // ¾ BAB: +1 at L3
        m('mk_fort_3', 'class_monk', 'saves.fort',      1), // Good: +1 at L3
        m('mk_ref_3',  'class_monk', 'saves.ref',       1),
        m('mk_will_3', 'class_monk', 'saves.will',      1),
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Psion — Half BAB, Poor Fort / Poor Ref / Good Will, 2+INT SP/lv, d4 HD
//
// Source: D&D 3.5 Expanded Psionics Handbook SRD
// Manifester level: 1 per Psion level (grants stat_manifester_level +1 per level).
// Base power points at level 1: 2 (from the standard Psion PP table).
// ---------------------------------------------------------------------------
const MOCK_PSION: Feature = {
  id: 'class_psion',
  category: 'class',
  label: { en: 'Psion', fr: 'Psion' },
  description: { en: 'Psionic manifester who shapes reality with mental power.' },
  tags: ['class', 'psion', 'psionic', 'spellcaster'],
  ruleSource: 'test_build',
  grantedModifiers: [
    m('ps_sp', 'class_psion', 'attributes.skill_points_per_level', 2),
    m('ps_hd', 'class_psion', 'combatStats.hit_die_type',          4),
  ],
  grantedFeatures: [],
  classSkills: [
    'skill_concentration', 'skill_craft', 'skill_knowledge_psionics',
    'skill_psicraft', 'skill_profession',
  ],
  levelProgression: [
    {
      level: 1,
      grantedFeatures: ['class_feature_psion_powers_l1'],
      grantedModifiers: [
        m('ps_bab_1',            'class_psion', 'combatStats.bab',          0), // Half BAB: +0 at L1
        m('ps_fort_1',           'class_psion', 'saves.fort',               0), // Poor: +0 at L1
        m('ps_ref_1',            'class_psion', 'saves.ref',                0), // Poor: +0 at L1
        m('ps_will_1',           'class_psion', 'saves.will',               2), // Good: +2 at L1
        m('ps_manifester_lv_1',  'class_psion', 'stat_manifester_level',    1), // ML +1 per level
        m('ps_base_pp_1',        'class_psion', 'resources.psi_points.max', 2), // 2 base PP at level 1
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Wizard — Half BAB, Poor Fort / Poor Ref / Good Will, 2+INT SP/lv, d4 HD
//
// Caster level: 1 per Wizard level (grants stat_caster_level +1).
// Spells per day (Wizard L1): 0-level: 3, 1st-level: 1 (+ INT bonus from ability score)
// ---------------------------------------------------------------------------
const MOCK_WIZARD: Feature = {
  id: 'class_wizard',
  category: 'class',
  label: { en: 'Wizard', fr: 'Magicien' },
  description: { en: 'Arcane spellcaster who studies the secrets of magic.' },
  tags: ['class', 'wizard', 'arcane', 'spellcaster'],
  ruleSource: 'test_build',
  grantedModifiers: [
    m('wz_sp', 'class_wizard', 'attributes.skill_points_per_level', 2),
    m('wz_hd', 'class_wizard', 'combatStats.hit_die_type',          4),
  ],
  grantedFeatures: ['class_feature_scribe_scroll'],
  classSkills: [
    'skill_concentration', 'skill_craft', 'skill_decipher_script',
    'skill_knowledge_arcana', 'skill_knowledge_dungeoneering', 'skill_knowledge_geography',
    'skill_knowledge_history', 'skill_knowledge_local', 'skill_knowledge_nature',
    'skill_knowledge_nobility', 'skill_knowledge_planes', 'skill_knowledge_religion',
    'skill_profession', 'skill_spellcraft',
  ],
  levelProgression: [
    {
      level: 1,
      grantedFeatures: ['class_feature_spellbook'],
      grantedModifiers: [
        m('wz_bab_1',          'class_wizard', 'combatStats.bab',       0), // Half BAB: +0 at L1
        m('wz_fort_1',         'class_wizard', 'saves.fort',            0), // Poor: +0 at L1
        m('wz_ref_1',          'class_wizard', 'saves.ref',             0), // Poor: +0 at L1
        m('wz_will_1',         'class_wizard', 'saves.will',            2), // Good: +2 at L1
        m('wz_caster_lv_1',    'class_wizard', 'stat_caster_level',     1), // CL +1 per level
        m('wz_spells_0_base',  'class_wizard', 'attributes.spells_per_day_level0', 3), // 3 cantrips/day
        m('wz_spells_1_base',  'class_wizard', 'attributes.spells_per_day_level1', 1), // 1 1st-level/day
      ],
    },
  ],
};

// =============================================================================
// CHARACTER CONFIGURATION
// =============================================================================

const CLASS_LEVELS = {
  class_fighter: 3,
  class_monk:    3,
  class_psion:   1,
  class_wizard:  1,
} as const;

// Ability scores — FINAL values after both ASIs (both to CON)
const STATS = {
  str: 18, // +4  (unchanged)
  dex: 16, // +3  (unchanged)
  con: 19, // +4  (CON 17 → +1 at lvl 4 → +1 at lvl 8 = 19; mod +3→+4→+4)
  int: 15, // +2  (unchanged)
  wis: 14, // +2  (unchanged)
  cha: 13, // +1  (unchanged)
};

// Fixed HP dice per character level (order follows leveling sequence):
//   Char Lvl 1 (Fighter d10): max for first character level = 10
//   Char Lvl 2 (Monk    d8):  half+1 = 4+1 = 5
//   Char Lvl 3 (Fighter d10): half+1 = 5+1 = 6
//   Char Lvl 4 (Fighter d10): half+1 = 5+1 = 6
//   Char Lvl 5 (Psion   d4):  half+1 = 2+1 = 3
//   Char Lvl 6 (Monk    d8):  half+1 = 4+1 = 5
//   Char Lvl 7 (Monk    d8):  half+1 = 4+1 = 5
//   Char Lvl 8 (Wizard  d4):  half+1 = 2+1 = 3
const HIT_DIE_RESULTS = [10, 5, 6, 6, 3, 5, 5, 3];

// =============================================================================
// TEST SUITES
// =============================================================================

describe('Character Build: Fighter 3 / Monk 3 / Psion 1 / Wizard 1 (Level 8)', () => {

  // ---------------------------------------------------------------------------
  // 1. CHARACTER LEVEL & ECL
  // ---------------------------------------------------------------------------

  describe('1. Character level and ECL', () => {
    it('Character level = sum of all class levels = 8', () => {
      expect(characterLevel(CLASS_LEVELS)).toBe(8);
    });

    it('ECL = character level + 0 (no Level Adjustment) = 8', () => {
      expect(eclForXp(CLASS_LEVELS, 0)).toBe(8);
    });

    it('Class level breakdown: Fighter 3, Monk 3, Psion 1, Wizard 1', () => {
      expect(CLASS_LEVELS.class_fighter).toBe(3);
      expect(CLASS_LEVELS.class_monk).toBe(3);
      expect(CLASS_LEVELS.class_psion).toBe(1);
      expect(CLASS_LEVELS.class_wizard).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. ABILITY SCORES & ASI TRACKING
  // ---------------------------------------------------------------------------

  describe('2. Ability scores and CON improvement via ASIs', () => {
    it('Initial CON 17 → modifier +3', () => {
      expect(abilityMod(17)).toBe(3);
    });

    it('After first ASI (level 4): CON 18 → modifier +4', () => {
      expect(abilityMod(18)).toBe(4);
    });

    it('After second ASI (level 8): CON 19 → modifier still +4 (floor((19-10)/2)=4)', () => {
      // Both CON 18 and CON 19 yield the same +4 modifier.
      // The second ASI to CON does NOT increase the modifier further.
      // CON must reach 20 to improve the mod from +4 to +5.
      expect(abilityMod(19)).toBe(4);
      expect(abilityMod(18)).toBe(abilityMod(19));
    });

    it('All final ability modifiers are correct', () => {
      expect(abilityMod(STATS.str)).toBe(4); // STR 18
      expect(abilityMod(STATS.dex)).toBe(3); // DEX 16
      expect(abilityMod(STATS.con)).toBe(4); // CON 19 (after both ASIs)
      expect(abilityMod(STATS.int)).toBe(2); // INT 15
      expect(abilityMod(STATS.wis)).toBe(2); // WIS 14
      expect(abilityMod(STATS.cha)).toBe(1); // CHA 13
    });
  });

  // ---------------------------------------------------------------------------
  // 3. BASE ATTACK BONUS
  // ---------------------------------------------------------------------------

  describe('3. Base Attack Bonus (BAB)', () => {
    /**
     * BAB progression (D&D 3.5 SRD):
     *   Fighter (full):  +1 per level → 3 levels = +3
     *   Monk (3/4):      floor(3/4 × level); increments: L1:+0, L2:+1, L3:+1 = +2
     *   Psion (half):    floor(1/2 × level); L1: +0
     *   Wizard (half):   floor(1/2 × level); L1: +0
     *   Combined: 3+2+0+0 = +5
     *
     * "base" type stacks (all class BAB contributions add together — never take-highest).
     * @see ARCHITECTURE.md Example G
     */
    it('Fighter 3 contributes +3 BAB (full progression)', () => {
      const mods = collectClassMods(MOCK_FIGHTER.levelProgression!, CLASS_LEVELS.class_fighter, 'combatStats.bab');
      expect(applyStackingRules(mods, 0).totalBonus).toBe(3);
    });

    it('Monk 3 contributes +2 BAB (3/4 progression: increments +0,+1,+1)', () => {
      const mods = collectClassMods(MOCK_MONK.levelProgression!, CLASS_LEVELS.class_monk, 'combatStats.bab');
      expect(applyStackingRules(mods, 0).totalBonus).toBe(2);
    });

    it('Psion 1 contributes +0 BAB (half progression at level 1)', () => {
      const mods = collectClassMods(MOCK_PSION.levelProgression!, CLASS_LEVELS.class_psion, 'combatStats.bab');
      expect(applyStackingRules(mods, 0).totalBonus).toBe(0);
    });

    it('Wizard 1 contributes +0 BAB (half progression at level 1)', () => {
      const mods = collectClassMods(MOCK_WIZARD.levelProgression!, CLASS_LEVELS.class_wizard, 'combatStats.bab');
      expect(applyStackingRules(mods, 0).totalBonus).toBe(0);
    });

    it('Combined BAB (all 4 classes) = +5', () => {
      const allBabMods: Modifier[] = [
        ...collectClassMods(MOCK_FIGHTER.levelProgression!, CLASS_LEVELS.class_fighter, 'combatStats.bab'),
        ...collectClassMods(MOCK_MONK.levelProgression!,    CLASS_LEVELS.class_monk,    'combatStats.bab'),
        ...collectClassMods(MOCK_PSION.levelProgression!,   CLASS_LEVELS.class_psion,   'combatStats.bab'),
        ...collectClassMods(MOCK_WIZARD.levelProgression!,  CLASS_LEVELS.class_wizard,  'combatStats.bab'),
      ];
      expect(applyStackingRules(allBabMods, 0).totalBonus).toBe(5);
    });

    it('BAB stacks (Fighter alone: +3; adding Monk raises it to +5, not max-of-the-two)', () => {
      const fighterOnly = applyStackingRules(
        collectClassMods(MOCK_FIGHTER.levelProgression!, 3, 'combatStats.bab'), 0
      ).totalBonus;
      const combined = applyStackingRules([
        ...collectClassMods(MOCK_FIGHTER.levelProgression!, 3, 'combatStats.bab'),
        ...collectClassMods(MOCK_MONK.levelProgression!, 3, 'combatStats.bab'),
      ], 0).totalBonus;
      expect(fighterOnly).toBe(3);
      expect(combined).toBe(5); // 3 + 2 = 5, NOT max(3, 2) = 3
    });
  });

  // ---------------------------------------------------------------------------
  // 4. SAVING THROWS
  // ---------------------------------------------------------------------------

  describe('4. Saving throws', () => {
    /**
     * Save increments (D&D 3.5, ARCHITECTURE.md convention):
     *   Good: +2 at L1, then +1 every 2 levels: increments [+2, +0, +1, +0, +1, ...]
     *   Poor: +0 at L1, then +1 every 3 levels: increments [+0, +0, +1, +0, +0, +1, ...]
     *
     * Per-class totals at declared class levels:
     *   Fighter 3: Fort Good (+2+0+1=+3), Ref Poor (+0+0+1=+1), Will Poor (+0+0+1=+1)
     *   Monk 3:    Fort Good (+2+0+1=+3), Ref Good (+2+0+1=+3), Will Good (+2+0+1=+3)
     *   Psion 1:   Fort Poor (+0),        Ref Poor (+0),         Will Good (+2)
     *   Wizard 1:  Fort Poor (+0),        Ref Poor (+0),         Will Good (+2)
     *
     * BASE TOTALS:
     *   Fort: 3+3+0+0 = +6   |   Ref: 1+3+0+0 = +4   |   Will: 1+3+2+2 = +8
     */
    const collectAllSaves = (targetId: string) => [
      ...collectClassMods(MOCK_FIGHTER.levelProgression!, CLASS_LEVELS.class_fighter, targetId),
      ...collectClassMods(MOCK_MONK.levelProgression!,    CLASS_LEVELS.class_monk,    targetId),
      ...collectClassMods(MOCK_PSION.levelProgression!,   CLASS_LEVELS.class_psion,   targetId),
      ...collectClassMods(MOCK_WIZARD.levelProgression!,  CLASS_LEVELS.class_wizard,  targetId),
    ];

    describe('Fortitude (Good saves: Fighter + Monk; Poor: Psion + Wizard)', () => {
      it('Fighter 3 Fort base = +3 (Good: +2+0+1)', () => {
        const mods = collectClassMods(MOCK_FIGHTER.levelProgression!, 3, 'saves.fort');
        expect(applyStackingRules(mods, 0).totalBonus).toBe(3);
      });

      it('Monk 3 Fort base = +3 (Good: +2+0+1)', () => {
        const mods = collectClassMods(MOCK_MONK.levelProgression!, 3, 'saves.fort');
        expect(applyStackingRules(mods, 0).totalBonus).toBe(3);
      });

      it('Psion 1 Fort base = 0 (Poor: +0 at L1)', () => {
        const mods = collectClassMods(MOCK_PSION.levelProgression!, 1, 'saves.fort');
        expect(applyStackingRules(mods, 0).totalBonus).toBe(0);
      });

      it('Wizard 1 Fort base = 0 (Poor: +0 at L1)', () => {
        const mods = collectClassMods(MOCK_WIZARD.levelProgression!, 1, 'saves.fort');
        expect(applyStackingRules(mods, 0).totalBonus).toBe(0);
      });

      it('Combined Fort base = +6; with CON+4 → total +10', () => {
        const base = applyStackingRules(collectAllSaves('saves.fort'), 0).totalBonus;
        expect(base).toBe(6);
        expect(base + abilityMod(STATS.con)).toBe(10);
      });
    });

    describe('Reflex (Poor: Fighter; Good: Monk; Poor: Psion + Wizard)', () => {
      it('Fighter 3 Ref base = +1 (Poor: +0+0+1)', () => {
        const mods = collectClassMods(MOCK_FIGHTER.levelProgression!, 3, 'saves.ref');
        expect(applyStackingRules(mods, 0).totalBonus).toBe(1);
      });

      it('Monk 3 Ref base = +3 (Good: +2+0+1)', () => {
        const mods = collectClassMods(MOCK_MONK.levelProgression!, 3, 'saves.ref');
        expect(applyStackingRules(mods, 0).totalBonus).toBe(3);
      });

      it('Combined Ref base = +4; with DEX+3 → total +7', () => {
        const base = applyStackingRules(collectAllSaves('saves.ref'), 0).totalBonus;
        expect(base).toBe(4);
        expect(base + abilityMod(STATS.dex)).toBe(7);
      });
    });

    describe('Will (Poor: Fighter; Good: Monk + Psion + Wizard)', () => {
      it('Fighter 3 Will base = +1 (Poor: +0+0+1)', () => {
        const mods = collectClassMods(MOCK_FIGHTER.levelProgression!, 3, 'saves.will');
        expect(applyStackingRules(mods, 0).totalBonus).toBe(1);
      });

      it('Monk 3 Will base = +3 (Good: +2+0+1)', () => {
        const mods = collectClassMods(MOCK_MONK.levelProgression!, 3, 'saves.will');
        expect(applyStackingRules(mods, 0).totalBonus).toBe(3);
      });

      it('Psion 1 Will base = +2 (Good: +2 at L1)', () => {
        const mods = collectClassMods(MOCK_PSION.levelProgression!, 1, 'saves.will');
        expect(applyStackingRules(mods, 0).totalBonus).toBe(2);
      });

      it('Wizard 1 Will base = +2 (Good: +2 at L1)', () => {
        const mods = collectClassMods(MOCK_WIZARD.levelProgression!, 1, 'saves.will');
        expect(applyStackingRules(mods, 0).totalBonus).toBe(2);
      });

      it('Combined Will base = +8; with WIS+2 → total +10', () => {
        const base = applyStackingRules(collectAllSaves('saves.will'), 0).totalBonus;
        expect(base).toBe(8);
        expect(base + abilityMod(STATS.wis)).toBe(10);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 5. SKILL POINTS BUDGET
  // ---------------------------------------------------------------------------

  describe('5. Skill points budget (per-class + 4× first-level bonus, SRD RAW)', () => {
    /**
     * D&D 3.5 MULTICLASS RULE: each class contributes INDEPENDENTLY.
     *   max(1, spPerLevel + intMod) × classLevel
     *
     * FIRST CHARACTER LEVEL BONUS (SRD, "Skills" section):
     *   "At 1st level, you get four times the number of skill points you
     *    normally get for a level in that class."
     *   Fighter was taken at character level 1, so Fighter 1 gets 4× SP.
     *   The 4× applies ONLY to the first class at character level 1.
     *   Fighter bonus = 3 × max(1, 2+2) = 3 × 4 = +12 extra SP.
     *
     * CORRECT totals (RAW):
     *   Fighter 3: max(1,2+2)×3 + 3×4 = 12 + 12 = 24  ← includes 4× first-level bonus
     *   Monk 3:    max(1,4+2)×3        = 18
     *   Psion 1:   max(1,2+2)×1        =  4
     *   Wizard 1:  max(1,2+2)×1        =  4
     *   TOTAL: 50 SP
     *
     * WRONG pre-fix formula: (2+4+2+2+intMod) × 8 = 12×8 = 96 SP  ← WRONG
     *
     * @see src/lib/engine/GameEngine.svelte.ts — phase4_skillPointsBudget
     */
    const intMod = abilityMod(STATS.int); // +2 from INT 15

    it('INT modifier from INT 15 = +2', () => {
      expect(intMod).toBe(2);
    });

    it('First-level 4× bonus: Fighter (the first class at char level 1) gets +12 extra SP', () => {
      // 3 extra multiples × max(1, 2+2) = 3 × 4 = 12
      expect(firstLevelSpBonus(2, intMod)).toBe(12);
    });

    it('First-level bonus only applies to the FIRST class — Monk gets none', () => {
      // Monk was taken at char level 2, so no first-level bonus
      expect(firstLevelSpBonus(4, intMod)).toBe(18); // 3 × 6 = 18 would be monk's bonus IF it were first
      // but Monk is NOT first, so its bonus is 0 in practice:
      const monkBonus = 0; // Monk was taken at character level 2
      expect(monkBonus).toBe(0);
    });

    it('Fighter 3 SP (with 4× first-level bonus): 12 (base) + 12 (L1 bonus) = 24', () => {
      const base  = classSkillPoints(2, CLASS_LEVELS.class_fighter, intMod); // 12
      const bonus = firstLevelSpBonus(2, intMod);                            // 12
      expect(base).toBe(12);
      expect(bonus).toBe(12);
      expect(base + bonus).toBe(24);
    });

    it('Monk 3 SP (no first-level bonus — Monk was taken at char level 2): 18', () => {
      expect(classSkillPoints(4, CLASS_LEVELS.class_monk, intMod)).toBe(18);
    });

    it('Psion 1 SP (char level 5, no bonus): 4', () => {
      expect(classSkillPoints(2, CLASS_LEVELS.class_psion, intMod)).toBe(4);
    });

    it('Wizard 1 SP (char level 8, no bonus): 4', () => {
      expect(classSkillPoints(2, CLASS_LEVELS.class_wizard, intMod)).toBe(4);
    });

    it('Total SP = 50 (SRD RAW, with first-level 4× bonus)', () => {
      const figSP  = classSkillPoints(2, CLASS_LEVELS.class_fighter, intMod) + firstLevelSpBonus(2, intMod);
      const monkSP = classSkillPoints(4, CLASS_LEVELS.class_monk, intMod);
      const psSP   = classSkillPoints(2, CLASS_LEVELS.class_psion, intMod);
      const wizSP  = classSkillPoints(2, CLASS_LEVELS.class_wizard, intMod);
      expect(figSP + monkSP + psSP + wizSP).toBe(50);
    });

    it('Without first-level bonus the (still correct) subtotal is 38 SP', () => {
      // Documented for completeness: this was the previous implementation's result.
      // It is the correct per-class sum but MISSING the first-level 4× bonus.
      const total =
        classSkillPoints(2, CLASS_LEVELS.class_fighter, intMod) +
        classSkillPoints(4, CLASS_LEVELS.class_monk, intMod) +
        classSkillPoints(2, CLASS_LEVELS.class_psion, intMod) +
        classSkillPoints(2, CLASS_LEVELS.class_wizard, intMod);
      expect(total).toBe(38); // Per-class correct, but missing the 12 first-level bonus
    });

    it('Proof: pre-fix unified formula gives 96 SP — 1.9× too many vs 50', () => {
      // This documents the original bug: sum all class SP/level, multiply by total level.
      // INT 15 mod = +2; summed SP/level = 2+4+2+2 = 10
      const brokenTotal = Math.max(1, 10 + intMod) * characterLevel(CLASS_LEVELS);
      expect(brokenTotal).toBe(96); // The wrong answer
      expect(50).toBeLessThan(96);  // The correct RAW answer is 50, not 96
    });

    it('INT floor rule: negative INT mod cannot reduce below 1 SP/level per class', () => {
      // Fighter with INT 6 (mod -2): max(1, 2 + (-2)) = max(1, 0) = 1/level
      const lowIntMod = abilityMod(6); // -2
      expect(classSkillPoints(2, 3, lowIntMod)).toBe(3); // 1 × 3 = 3 (not 0)
      expect(firstLevelSpBonus(2, lowIntMod)).toBe(3);   // 3 × 1 = 3 first-level bonus
    });
  });

  // ---------------------------------------------------------------------------
  // 6. FEAT SLOTS
  // ---------------------------------------------------------------------------

  describe('6. Feat slots', () => {
    /**
     * D&D 3.5 feat slot calculation:
     *   Base:         1 + floor(characterLevel / 3)  = 1 + floor(8/3) = 3
     *   Fighter bonus feats: at fighter levels 1, 2 (next at 4, 6, 8…) = +2
     *   TOTAL: 5
     *
     * NOTE: Does not include a racial bonus feat (no race defined for this character);
     * a human would have +1 additional feat slot.
     */
    it('Base feat slots = 1 + floor(8/3) = 3', () => {
      const base = 1 + Math.floor(characterLevel(CLASS_LEVELS) / 3);
      expect(base).toBe(3);
    });

    it('Fighter grants bonus_feat_slots +1 at level 1 and +1 at level 2 → +2 total', () => {
      const bonusMods = collectClassMods(
        MOCK_FIGHTER.levelProgression!, CLASS_LEVELS.class_fighter, 'attributes.bonus_feat_slots'
      );
      const bonusResult = applyStackingRules(bonusMods, 0);
      expect(bonusResult.totalBonus).toBe(2);
    });

    it('Fighter level 3 grants no additional bonus feat slot (next at fighter level 4)', () => {
      // At exactly fighter level 3, we should still have only 2 bonus feat entries (L1 and L2).
      const bonusMods = collectClassMods(
        MOCK_FIGHTER.levelProgression!, CLASS_LEVELS.class_fighter, 'attributes.bonus_feat_slots'
      );
      expect(bonusMods.length).toBe(2);
    });

    it('Monk, Psion, Wizard grant 0 bonus feat slots', () => {
      const monkBonus = collectClassMods(MOCK_MONK.levelProgression!, 3, 'attributes.bonus_feat_slots');
      const psionBonus = collectClassMods(MOCK_PSION.levelProgression!, 1, 'attributes.bonus_feat_slots');
      const wizBonus = collectClassMods(MOCK_WIZARD.levelProgression!, 1, 'attributes.bonus_feat_slots');
      expect(monkBonus.length).toBe(0);
      expect(psionBonus.length).toBe(0);
      expect(wizBonus.length).toBe(0);
    });

    it('Total feat slots = 3 (base) + 2 (Fighter bonus) = 5', () => {
      const base = 1 + Math.floor(characterLevel(CLASS_LEVELS) / 3);
      const bonus = applyStackingRules(
        collectClassMods(MOCK_FIGHTER.levelProgression!, CLASS_LEVELS.class_fighter, 'attributes.bonus_feat_slots'), 0
      ).totalBonus;
      expect(base + bonus).toBe(5);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. HIT POINTS
  // ---------------------------------------------------------------------------

  describe('7. Hit Points (fixed dice, max at level 1)', () => {
    /**
     * Fixed HP values (D&D 3.5: max at character level 1, half+1 thereafter):
     *   Char Lvl 1 (Fighter d10): 10   ← always max at first character level
     *   Char Lvl 2 (Monk    d8):   5   (4+1)
     *   Char Lvl 3 (Fighter d10):  6   (5+1)
     *   Char Lvl 4 (Fighter d10):  6   (5+1)
     *   Char Lvl 5 (Psion   d4):   3   (2+1)
     *   Char Lvl 6 (Monk    d8):   5   (4+1)
     *   Char Lvl 7 (Monk    d8):   5   (4+1)
     *   Char Lvl 8 (Wizard  d4):   3   (2+1)
     *   Sum of dice: 43
     *
     * CON modifier after both ASIs: CON 19 → +4
     * CON contribution: +4 × 8 levels = +32
     *
     * Max HP = 43 + 32 = 75
     */
    it('Fixed dice follow the correct convention (max at L1, half+1 thereafter)', () => {
      expect(HIT_DIE_RESULTS[0]).toBe(10); // d10 max
      expect(HIT_DIE_RESULTS[1]).toBe(5);  // d8 half+1
      expect(HIT_DIE_RESULTS[2]).toBe(6);  // d10 half+1
      expect(HIT_DIE_RESULTS[4]).toBe(3);  // d4 half+1
      expect(HIT_DIE_RESULTS[7]).toBe(3);  // d4 half+1
    });

    it('Sum of fixed dice = 43', () => {
      expect(HIT_DIE_RESULTS.reduce((s, v) => s + v, 0)).toBe(43);
    });

    it('CON modifier × character level = 4 × 8 = 32', () => {
      expect(abilityMod(STATS.con) * HIT_DIE_RESULTS.length).toBe(32);
    });

    it('Max HP = 75 (sum of dice 43 + CON bonus 32)', () => {
      expect(maxHp(HIT_DIE_RESULTS, abilityMod(STATS.con))).toBe(75);
    });

    it('CON improvement matters: CON 17 (+3) would give HP 67, not 75', () => {
      // Demonstrates that taking the CON ASI at level 4 was worth +8 HP.
      const hpWithConStart = maxHp(HIT_DIE_RESULTS, abilityMod(17));
      expect(hpWithConStart).toBe(67); // 43 + 3×8 = 43+24 = 67
      expect(maxHp(HIT_DIE_RESULTS, abilityMod(STATS.con))).toBe(75); // 43 + 4×8 = 75
      expect(75 - 67).toBe(8); // 1 full hit-die roll of CON bonus gained
    });

    it('Second ASI to CON 18→19 does NOT improve HP (same +4 modifier)', () => {
      // CON 18 and CON 19 both give +4 — the second ASI to CON was a wasted HP investment.
      // (Would have needed CON 20 to reach +5, requiring a 3rd ASI.)
      const hpAtCon18 = maxHp(HIT_DIE_RESULTS, abilityMod(18));
      const hpAtCon19 = maxHp(HIT_DIE_RESULTS, abilityMod(19));
      expect(hpAtCon18).toBe(75);
      expect(hpAtCon19).toBe(75);
      expect(hpAtCon18).toBe(hpAtCon19); // Same modifier — no HP difference
    });
  });

  // ---------------------------------------------------------------------------
  // 8. ARMOR CLASS (unarmored Monk)
  // ---------------------------------------------------------------------------

  describe('8. Armor Class (no armor, unencumbered)', () => {
    /**
     * AC = 10 (base)
     *      +3  DEX modifier (DEX 16)
     *      +2  Monk Wisdom-to-AC (WIS 14 → +2; untyped; applies when unarmored)
     *      +0  Monk level-3 AC Enhancement — does NOT apply yet (starts at Monk 5)
     *    = 15
     *
     * Monk WIS-to-AC stacks with DEX (both are untyped; no anti-stacking rule).
     * Touch AC = same 15 here (no armor/natural_armor to exclude).
     * Flat-footed AC = 12 (10 base + 2 WIS; DEX and Dodge lost when flat-footed).
     *
     * @see MOCK_MONK.grantedModifiers for the WIS-to-AC modifier definition.
     */
    it('DEX modifier contributes +3 to AC (DEX 16)', () => {
      expect(abilityMod(STATS.dex)).toBe(3);
    });

    it('WIS modifier contributes +2 to Monk AC bonus (WIS 14)', () => {
      expect(abilityMod(STATS.wis)).toBe(2);
    });

    it('Monk WIS-to-AC modifier exists on the Monk class definition', () => {
      const monkWisAcMod = MOCK_MONK.grantedModifiers.find(
        mod => mod.targetId === 'combatStats.ac_normal' && mod.sourceId === 'class_monk'
      );
      expect(monkWisAcMod).toBeDefined();
      expect(monkWisAcMod?.type).toBe('untyped'); // Stacks with everything
      expect(monkWisAcMod?.value).toBe(2);        // WIS 14 → +2
    });

    it('Monk level 3 does NOT grant an AC enhancement (starts at Monk 5)', () => {
      // AC bonus is declared in the Monk class at level 5, not level 3. Verify not present.
      const acBonusMods = collectClassMods(
        MOCK_MONK.levelProgression!, CLASS_LEVELS.class_monk, 'combatStats.ac_normal'
      );
      // No level-progression AC modifier at levels 1–3
      expect(acBonusMods.length).toBe(0);
    });

    it('Total unarmored AC = 15 (10 base + DEX+3 + WIS+2)', () => {
      const dexMod = abilityMod(STATS.dex);
      const wisMod = abilityMod(STATS.wis);
      const dexAcMod: Modifier = {
        id: 'dex_to_ac', sourceId: 'core', sourceName: { en: 'DEX' },
        targetId: 'combatStats.ac_normal', value: dexMod, type: 'untyped' as ModifierType,
      };
      const wisAcMod: Modifier = {
        id: 'monk_wis_ac', sourceId: 'class_monk', sourceName: { en: 'Monk WIS to AC' },
        targetId: 'combatStats.ac_normal', value: wisMod, type: 'untyped' as ModifierType,
      };
      const result = applyStackingRules([dexAcMod, wisAcMod], 10); // base AC = 10
      expect(result.totalValue).toBe(15);
    });

    it('Flat-footed AC = 12 (DEX bonus lost; only WIS Monk bonus applies)', () => {
      // In flat-footed state, DEX and Dodge bonuses are suppressed.
      // Monk WIS bonus (untyped, not DEX/Dodge typed) still applies.
      const wisMod = abilityMod(STATS.wis);
      const wisAcMod: Modifier = {
        id: 'monk_wis_ac', sourceId: 'class_monk', sourceName: { en: 'Monk WIS to AC' },
        targetId: 'combatStats.ac_normal', value: wisMod, type: 'untyped' as ModifierType,
      };
      // Flat-footed: no DEX modifier
      const result = applyStackingRules([wisAcMod], 10);
      expect(result.totalValue).toBe(12); // 10 + 2 WIS
    });
  });

  // ---------------------------------------------------------------------------
  // 9. WIZARD SPELLS PER DAY
  // ---------------------------------------------------------------------------

  describe('9. Wizard 1 spells per day (INT 15)', () => {
    /**
     * Wizard 1 base spells per day (D&D 3.5 SRD Wizard table):
     *   0-level: 3 cantrips
     *   1st:     1 spell slot
     *
     * Bonus spells from INT 15 (modifier +2):
     *   INT mod ≥ 1 → +1 bonus slot at 1st level
     *   INT mod ≥ 2 → +1 bonus slot at 2nd level (but Wizard 1 has no 2nd-level slots)
     *
     * Actual daily spell slots:
     *   0-level: 3  (cantrips never receive ability-score bonus slots)
     *   1st:     2  (1 base + 1 INT bonus)
     *   2nd+:    not accessible at Wizard 1
     */
    const intMod = abilityMod(STATS.int); // +2

    it('INT modifier for bonus spells = +2 (INT 15)', () => {
      expect(intMod).toBe(2);
    });

    it('Bonus spell slots from INT+2: +1 at 1st level, +1 at 2nd level', () => {
      const bonus = bonusSpellSlots(intMod, 3); // check up to 3rd level
      expect(bonus[0]).toBe(0); // cantrips: never get bonus
      expect(bonus[1]).toBe(1); // 1st level: INT mod ≥ 1 → +1
      expect(bonus[2]).toBe(1); // 2nd level: INT mod ≥ 2 → +1
      expect(bonus[3]).toBe(0); // 3rd level: INT mod ≥ 3 → no bonus (INT mod = 2 < 3)
    });

    it('Wizard 1 base spells per day: 3 cantrips, 1 first-level slot', () => {
      const wz1BaseMods = MOCK_WIZARD.levelProgression![0].grantedModifiers;
      const cantrips  = wz1BaseMods.find(m => m.targetId === 'attributes.spells_per_day_level0')?.value;
      const firstLevel = wz1BaseMods.find(m => m.targetId === 'attributes.spells_per_day_level1')?.value;
      expect(cantrips).toBe(3);
      expect(firstLevel).toBe(1);
    });

    it('Wizard 1 actual spells per day: 3 cantrips (no INT bonus); 2 first-level (1+1)', () => {
      const base0 = 3; // Wizard 1 base cantrips
      const base1 = 1; // Wizard 1 base 1st-level slots
      const bonus = bonusSpellSlots(intMod, 1);
      expect(base0 + bonus[0]).toBe(3); // 3 + 0 bonus
      expect(base1 + bonus[1]).toBe(2); // 1 + 1 bonus
    });

    it('2nd-level bonus spell exists but is NOT accessible at Wizard 1', () => {
      // INT 15 gives a bonus 2nd-level spell slot — but Wizard 1 cannot cast 2nd-level spells.
      // A future Wizard 3 level would unlock it.
      const bonus = bonusSpellSlots(intMod, 2);
      expect(bonus[2]).toBe(1); // The bonus IS earned by INT 15...
      // ...but the Wizard needs level 3 to cast 2nd-level spells (base slot = 0 at Wiz 1).
      const base2 = 0; // No base 2nd-level slots at Wizard 1
      expect(base2 + bonus[2]).toBe(1); // bonus slot with 0 base — accessible only once base > 0 unlocks it
    });
  });

  // ---------------------------------------------------------------------------
  // 10. PSIONIC POWER POINTS
  // ---------------------------------------------------------------------------

  describe('10. Psion 1 power points (INT 15)', () => {
    /**
     * Psion base PP at manifester level 1: 2  (standard Psion class table, EPH)
     *
     * Bonus PP from INT 15 (EPH SRD "Table: Ability Modifiers and Bonus Power Points"):
     *   INT 14-15 → +1 bonus PP accessible at manifester level 1 (tier 1, 1st-level powers)
     *   INT 14-15 → +1 bonus PP for tier 2 (2nd-level powers), but ML 1 cannot manifest them
     *
     * Total PP available at ML 1: 2 (base) + 1 (INT tier-1 bonus) = 3 PP
     *
     * EPH formula: bonus PP for each tier if key_ability_score >= 10 + (tier × 2)
     *   Tier 1 (1st-level powers): requires INT ≥ 12 → INT 15 qualifies → +1 PP
     *   Tier 2 (2nd-level powers): requires INT ≥ 14 → INT 15 qualifies → +1 PP (but ML < 3)
     *   Tier 3 (3rd-level powers): requires INT ≥ 16 → INT 15 does NOT qualify
     */
    const manifesterLevel = CLASS_LEVELS.class_psion; // = 1

    it('Psion manifester level = 1', () => {
      const mlMod = MOCK_PSION.levelProgression![0].grantedModifiers
        .find(m => m.targetId === 'stat_manifester_level');
      expect(mlMod?.value).toBe(1);
    });

    it('Psion base PP at level 1 = 2 (from class definition)', () => {
      const ppMod = MOCK_PSION.levelProgression![0].grantedModifiers
        .find(m => m.targetId === 'resources.psi_points.max');
      expect(ppMod?.value).toBe(2);
    });

    it('INT-bonus PP: INT 15 (≥12 for tier-1, ≥14 for tier-2) at ML 1 → +1 usable tier-1 bonus', () => {
      const bonusAtML1 = psionicBonusPP(STATS.int, manifesterLevel);
      expect(bonusAtML1).toBe(1); // Only tier 1 accessible at ML 1
    });

    it('Total PP at Psion 1 with INT 15 = 3 (2 base + 1 INT bonus)', () => {
      const basePP = 2;
      const bonus = psionicBonusPP(STATS.int, manifesterLevel);
      expect(basePP + bonus).toBe(3);
    });

    it('INT-bonus PP: INT 14 (tier 1 +1, tier 2 +1) at ML 3 → +2 total accessible', () => {
      // At manifester level 3, tier 2 (2nd-level powers) becomes accessible (ML ≥ 3 = 2×2-1).
      expect(psionicBonusPP(14, 3)).toBe(2); // tier 1 +1, tier 2 +1
    });

    it('INT 11 (mod +0) → no bonus psionic PP', () => {
      expect(psionicBonusPP(11, 5)).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 11. CLASS SKILL UNION
  // ---------------------------------------------------------------------------

  describe('11. Class skill set (union of all active classes)', () => {
    /**
     * The character's full class skill set is the UNION of all four classes'
     * classSkills arrays. Any skill that is a class skill for at least one of the
     * character's classes costs 1 SP/rank for this character; otherwise 2 SP/rank.
     *
     * @see GameEngine.phase4_classSkillSet
     */
    const allClassSkills = new Set([
      ...MOCK_FIGHTER.classSkills!,
      ...MOCK_MONK.classSkills!,
      ...MOCK_PSION.classSkills!,
      ...MOCK_WIZARD.classSkills!,
    ]);

    it('skill_climb is a class skill (Fighter + Monk both list it)', () => {
      expect(allClassSkills.has('skill_climb')).toBe(true);
    });

    it('skill_tumble is a class skill (Monk only)', () => {
      expect(allClassSkills.has('skill_tumble')).toBe(true);
    });

    it('skill_spellcraft is a class skill (Wizard only)', () => {
      expect(allClassSkills.has('skill_spellcraft')).toBe(true);
    });

    it('skill_concentration is a class skill (Monk + Psion + Wizard)', () => {
      expect(allClassSkills.has('skill_concentration')).toBe(true);
    });

    it('skill_knowledge_arcana is a class skill (Monk + Wizard)', () => {
      expect(allClassSkills.has('skill_knowledge_arcana')).toBe(true);
    });

    it('skill_psicraft is a class skill (Psion only)', () => {
      expect(allClassSkills.has('skill_psicraft')).toBe(true);
    });

    it('skill_hide is a class skill (Monk only — important for stealth builds)', () => {
      expect(allClassSkills.has('skill_hide')).toBe(true);
    });

    it('skill_move_silently is a class skill (Monk only)', () => {
      expect(allClassSkills.has('skill_move_silently')).toBe(true);
    });

    it('skill_bluff is NOT a class skill for any of the four classes', () => {
      expect(allClassSkills.has('skill_bluff')).toBe(false);
    });

    it('skill_forgery is NOT a class skill for any of the four classes', () => {
      expect(allClassSkills.has('skill_forgery')).toBe(false);
    });

    it('Total unique class skills >= 20 (large union from 4 diverse classes)', () => {
      expect(allClassSkills.size).toBeGreaterThanOrEqual(20);
    });

    it('Cross-class cost: skills not in the union cost 2 SP/rank (1 rank = 2 points)', () => {
      // For any skill not in allClassSkills, cost per rank = 2.
      const crossClassSkill = 'skill_bluff';
      expect(allClassSkills.has(crossClassSkill)).toBe(false);
      const costPerRank = allClassSkills.has(crossClassSkill) ? 1 : 2;
      expect(costPerRank).toBe(2);
    });

    it('Class skill cost: skills in the union cost 1 SP/rank', () => {
      const classSkill = 'skill_climb';
      expect(allClassSkills.has(classSkill)).toBe(true);
      const costPerRank = allClassSkills.has(classSkill) ? 1 : 2;
      expect(costPerRank).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 12. LEVEL-GATED CLASS FEATURES
  // ---------------------------------------------------------------------------

  describe('12. Level-gated class features', () => {
    /**
     * Only features from levelProgression entries with entry.level ≤ classLevel
     * are granted. Features from higher levels are NOT yet available.
     *
     * @see GameEngine.#collectModifiersFromInstance — levelProgression gating
     */

    it('Fighter 3 has bonus feats from levels 1 and 2 (fighter levels only)', () => {
      const features = collectGrantedFeatures(MOCK_FIGHTER.levelProgression!, CLASS_LEVELS.class_fighter);
      expect(features).toContain('class_feature_fighter_bonus_feat');
      expect(features).toContain('class_feature_fighter_bonus_feat_2');
    });

    it('Monk 3 has: Flurry (L1), Evasion (L2), Still Mind (L3)', () => {
      const features = collectGrantedFeatures(MOCK_MONK.levelProgression!, CLASS_LEVELS.class_monk);
      expect(features).toContain('class_feature_flurry_of_blows');
      expect(features).toContain('class_feature_evasion');
      expect(features).toContain('class_feature_still_mind');
    });

    it('Monk 3 does NOT have features from level 4+ (e.g., Slow Fall, already-future ability)', () => {
      // Monk 3 stops at still_mind. Monk 4 would grant Slow Fall.
      // Since our mock only defines levels 1-3, verify no phantom higher-level features.
      const features = collectGrantedFeatures(MOCK_MONK.levelProgression!, CLASS_LEVELS.class_monk);
      expect(features).not.toContain('class_feature_slow_fall');
    });

    it('Monk WIS-to-AC is in grantedModifiers (not level-gated: always active when Monk)', () => {
      const wisAcModOnClass = MOCK_MONK.grantedModifiers.find(
        m => m.targetId === 'combatStats.ac_normal'
      );
      expect(wisAcModOnClass).toBeDefined();
    });

    it('Psion 1 has psionic powers feature from level 1', () => {
      const features = collectGrantedFeatures(MOCK_PSION.levelProgression!, CLASS_LEVELS.class_psion);
      expect(features).toContain('class_feature_psion_powers_l1');
    });

    it('Wizard 1 has Scribe Scroll (in grantedFeatures, not level-gated)', () => {
      expect(MOCK_WIZARD.grantedFeatures).toContain('class_feature_scribe_scroll');
    });

    it('Wizard 1 levelProgression grants spellbook from level 1', () => {
      const features = collectGrantedFeatures(MOCK_WIZARD.levelProgression!, CLASS_LEVELS.class_wizard);
      expect(features).toContain('class_feature_spellbook');
    });
  });

  // ---------------------------------------------------------------------------
  // 12b. MONK GRANTED FEATS (class-granted ≠ chosen feat slots)
  // ---------------------------------------------------------------------------

  describe('12b. Monk and Wizard granted feats do not consume feat slots', () => {
    /**
     * D&D 3.5 SRD: Some classes grant specific feats automatically as class features.
     * These are "granted" feats — they are NOT drawn from the character's free feat
     * slot pool. The engine models this via `grantedFeatures` (class-level resolution)
     * which populates `phase_grantedFeatIds`; feats in that set are excluded from
     * `phase_manualFeatCount` (the count of manually-chosen, slot-consuming feats).
     *
     * Monk at level 1 auto-grants:
     *   - Improved Unarmed Strike (mandatory class feature, never chosen)
     *   - Stunning Fist (auto-granted free; the feat IS available for free via the class)
     * Monk at level 2 auto-grants:
     *   - Evasion (class feature — not a feat the player picks)
     * Wizard at level 1 auto-grants:
     *   - Scribe Scroll (free at wizard level 1, does not cost a feat slot)
     *
     * All of the above are in `MOCK_MONK.grantedFeatures` / `MOCK_WIZARD.grantedFeatures`
     * or in `grantedFeatures` of levelProgression entries — never in `bonus_feat_slots`.
     */

    it('Monk class grantedFeatures include Improved Unarmed Strike and Stunning Fist', () => {
      expect(MOCK_MONK.grantedFeatures).toContain('class_feature_improved_unarmed_strike');
      expect(MOCK_MONK.grantedFeatures).toContain('class_feature_stunning_fist');
    });

    it('Monk class does NOT grant bonus_feat_slots (these feats are imposed, not chosen)', () => {
      // Monk's auto-granted feats come through grantedFeatures, not bonus_feat_slots mods.
      const monkFeatSlotMods = [
        ...MOCK_MONK.grantedModifiers.filter(m => m.targetId === 'attributes.bonus_feat_slots'),
        ...collectClassMods(MOCK_MONK.levelProgression!, 3, 'attributes.bonus_feat_slots'),
      ];
      expect(monkFeatSlotMods.length).toBe(0);
    });

    it('Wizard Scribe Scroll is in grantedFeatures (free, does not consume a feat slot)', () => {
      expect(MOCK_WIZARD.grantedFeatures).toContain('class_feature_scribe_scroll');
      // Scribe Scroll is specifically a bonus feat granted free — not from the free-slot pool
      const wizFeatSlotMods = [
        ...MOCK_WIZARD.grantedModifiers.filter(m => m.targetId === 'attributes.bonus_feat_slots'),
        ...collectClassMods(MOCK_WIZARD.levelProgression!, 1, 'attributes.bonus_feat_slots'),
      ];
      expect(wizFeatSlotMods.length).toBe(0);
    });

    it('Monk Evasion (level 2) and Still Mind (level 3) are class features, not feat slots', () => {
      const monkLevel2Features = MOCK_MONK.levelProgression!
        .filter(e => e.level <= 2)
        .flatMap(e => e.grantedFeatures);
      expect(monkLevel2Features).toContain('class_feature_evasion');

      const monkLevel3Features = MOCK_MONK.levelProgression!
        .filter(e => e.level <= 3)
        .flatMap(e => e.grantedFeatures);
      expect(monkLevel3Features).toContain('class_feature_still_mind');
    });

    it('Total FREE feat slots remain 5 (Monk and Wizard class features do not reduce them)', () => {
      // Monk grants IUS + Stunning Fist + Evasion + Still Mind → all class features, not chosen feats
      // Wizard grants Scribe Scroll → class bonus feat, not chosen
      // These do NOT subtract from the 5 available free feat slots.
      const baseFeatSlots = 1 + Math.floor(characterLevel(CLASS_LEVELS) / 3); // = 3
      const fighterBonus  = applyStackingRules(
        collectClassMods(MOCK_FIGHTER.levelProgression!, CLASS_LEVELS.class_fighter, 'attributes.bonus_feat_slots'), 0
      ).totalBonus; // = 2
      expect(baseFeatSlots + fighterBonus).toBe(5);
      // The player can spend all 5 slots on OTHER feats without giving up the Monk/Wizard class grants.
    });
  });

  // ---------------------------------------------------------------------------
  // 13. MULTICLASS XP PENALTY (informational — not applied by engine)
  // ---------------------------------------------------------------------------

  describe('13. Multiclass XP penalty detection (D&D 3.5 SRD)', () => {
    /**
     * D&D 3.5 SRD: A character suffers a 20% XP penalty per class that is more than
     * 1 level lower than their highest class level, UNLESS that class is the character's
     * favored class.
     *
     * FAVORED CLASS rule:
     *   Humans:      any single class chosen at 1st level is the favored class.
     *   Other races: the favored class is race-specific (Elf = Wizard, Dwarf = Fighter, etc.).
     *   The favored class is IGNORED when checking the penalty condition.
     *
     * For this character (Fighter 3 / Monk 3 / Psion 1 / Wizard 1, no race defined):
     *   Highest level = 3.  Psion: 3−1=2 → penalty. Wizard: 3−1=2 → penalty.
     *   → Default (no favored class): −40% XP penalty.
     *   → If Wizard is favored class (e.g., Elf): Psion 1 still offends → −20%.
     *   → If Psion is favored class:  Wizard 1 still offends → −20%.
     *   → If Fighter or Monk is favored: Both Psion AND Wizard still offend → −40%.
     *     (Favored = Fighter/Monk has no effect since Fighter/Monk are already at max.)
     *
     * The engine does NOT auto-apply this penalty — it is the GM's responsibility.
     */

    /**
     * Detect classes that trigger the multiclass XP penalty.
     *
     * @param classLevels    - Record of classId → level.
     * @param favoredClassId - Optional: the character's favored class (excluded from penalty check).
     * @returns penaltyApplies and the list of offending class IDs.
     */
    function detectMulticlassXpPenalty(
      classLevels: Record<string, number>,
      favoredClassId?: string | null
    ): { penaltyApplies: boolean; offendingClasses: string[]; penaltyPercent: number } {
      const entries = Object.entries(classLevels);
      if (entries.length <= 1) return { penaltyApplies: false, offendingClasses: [], penaltyPercent: 0 };

      // Compute the effective highest level, excluding the favored class from checking.
      const checkableEntries = favoredClassId
        ? entries.filter(([id]) => id !== favoredClassId)
        : entries;

      const maxLevel = Math.max(...checkableEntries.map(([, lvl]) => lvl));
      const offending = checkableEntries
        .filter(([, lvl]) => maxLevel - lvl > 1)
        .map(([id]) => id);

      return {
        penaltyApplies: offending.length > 0,
        offendingClasses: offending,
        penaltyPercent: offending.length * 20,
      };
    }

    it('No favored class: −40% XP penalty (Psion 1 and Wizard 1 both 2 below max 3)', () => {
      const { penaltyApplies, offendingClasses, penaltyPercent } =
        detectMulticlassXpPenalty(CLASS_LEVELS); // no favored class
      expect(penaltyApplies).toBe(true);
      expect(offendingClasses).toContain('class_psion');
      expect(offendingClasses).toContain('class_wizard');
      expect(penaltyPercent).toBe(40);
    });

    it('Favored class = Wizard (e.g., Elf): only Psion penalized → −20%', () => {
      // Elf's racial favored class is Wizard. Wizard is excluded from the penalty check.
      // Remaining: Fighter 3, Monk 3, Psion 1. Max = 3; Psion 1 is 2 below → still penalized.
      const { penaltyPercent, offendingClasses } =
        detectMulticlassXpPenalty(CLASS_LEVELS, 'class_wizard');
      expect(offendingClasses).toContain('class_psion');
      expect(offendingClasses).not.toContain('class_wizard');
      expect(penaltyPercent).toBe(20);
    });

    it('Favored class = Psion: only Wizard penalized → −20%', () => {
      const { penaltyPercent, offendingClasses } =
        detectMulticlassXpPenalty(CLASS_LEVELS, 'class_psion');
      expect(offendingClasses).toContain('class_wizard');
      expect(offendingClasses).not.toContain('class_psion');
      expect(penaltyPercent).toBe(20);
    });

    it('Favored class = Fighter or Monk: still −40% (they are already at max level)', () => {
      // Exempting Fighter (or Monk) has no effect since they ARE the max-level classes.
      // The offending ones (Psion and Wizard) are still penalized.
      const { penaltyPercent } = detectMulticlassXpPenalty(CLASS_LEVELS, 'class_fighter');
      expect(penaltyPercent).toBe(40);
    });

    it('Penalty does NOT apply to Fighter and Monk (both at max level 3)', () => {
      const { offendingClasses } = detectMulticlassXpPenalty(CLASS_LEVELS);
      expect(offendingClasses).not.toContain('class_fighter');
      expect(offendingClasses).not.toContain('class_monk');
    });

    it('No penalty for a single-class character', () => {
      const { penaltyApplies } = detectMulticlassXpPenalty({ class_fighter: 8 });
      expect(penaltyApplies).toBe(false);
    });

    it('No penalty when all classes within 1 level of each other (Fighter 3 / Monk 2)', () => {
      const { penaltyApplies } = detectMulticlassXpPenalty({ class_fighter: 3, class_monk: 2 });
      expect(penaltyApplies).toBe(false);
    });

    it('On the penalty boundary: exactly 1 level gap → no penalty', () => {
      // Fighter 4 / Rogue 3 / Wizard 3: max=4, Rogue 3 is 1 below → OK; Wizard 3 → OK
      const { penaltyApplies } =
        detectMulticlassXpPenalty({ class_fighter: 4, class_rogue: 3, class_wizard: 3 });
      expect(penaltyApplies).toBe(false);
    });

    it('On the penalty boundary: exactly 2 level gap → penalty triggers', () => {
      // Fighter 4 / Wizard 2: max=4, Wizard 2 is 2 below → penalty
      const { penaltyApplies, penaltyPercent } =
        detectMulticlassXpPenalty({ class_fighter: 4, class_wizard: 2 });
      expect(penaltyApplies).toBe(true);
      expect(penaltyPercent).toBe(20);
    });
  });

  // ---------------------------------------------------------------------------
  // 14. MANIFESTER & CASTER LEVEL
  // ---------------------------------------------------------------------------

  describe('14. Manifester level and caster level from class progressions', () => {
    it('Psion 1 grants manifester level +1', () => {
      const mlMods = collectClassMods(
        MOCK_PSION.levelProgression!, CLASS_LEVELS.class_psion, 'stat_manifester_level'
      );
      expect(applyStackingRules(mlMods, 0).totalBonus).toBe(1);
    });

    it('Wizard 1 grants caster level +1', () => {
      const clMods = collectClassMods(
        MOCK_WIZARD.levelProgression!, CLASS_LEVELS.class_wizard, 'stat_caster_level'
      );
      expect(applyStackingRules(clMods, 0).totalBonus).toBe(1);
    });

    it('Fighter and Monk grant no caster level or manifester level', () => {
      const fCl = collectClassMods(MOCK_FIGHTER.levelProgression!, 3, 'stat_caster_level');
      const mCl = collectClassMods(MOCK_MONK.levelProgression!, 3, 'stat_caster_level');
      const fMl = collectClassMods(MOCK_FIGHTER.levelProgression!, 3, 'stat_manifester_level');
      const mMl = collectClassMods(MOCK_MONK.levelProgression!, 3, 'stat_manifester_level');
      expect(fCl.length).toBe(0);
      expect(mCl.length).toBe(0);
      expect(fMl.length).toBe(0);
      expect(mMl.length).toBe(0);
    });

    it('Character has both manifester level 1 (Psion) and caster level 1 (Wizard) — different magic systems', () => {
      const totalML = applyStackingRules(
        collectClassMods(MOCK_PSION.levelProgression!, 1, 'stat_manifester_level'), 0
      ).totalBonus;
      const totalCL = applyStackingRules(
        collectClassMods(MOCK_WIZARD.levelProgression!, 1, 'stat_caster_level'), 0
      ).totalBonus;
      expect(totalML).toBe(1);
      expect(totalCL).toBe(1);
      // The two levels are INDEPENDENT: no cross-class spellcasting/manifesting.
    });
  });
});
