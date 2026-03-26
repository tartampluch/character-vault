/**
 * @file gestaltRules.ts
 * @description Pure utility functions for Gestalt character variant rules.
 *
 * WHAT IS GESTALT?
 *   The Gestalt Characters variant (Unearthed Arcana) allows a player character
 *   to advance in TWO classes simultaneously at each level. Rather than additively
 *   combining both classes' BAB and saves (standard multiclassing), Gestalt takes
 *   the BEST (maximum) contribution from either class at each individual level.
 *
 * WHY THIS FILE?
 *   The GameEngine's DAG Phase 3 normally passes all "base" type modifiers directly
 *   to `applyStackingRules()`, which SUMS them (because "base" is in ALWAYS_STACKING_TYPES).
 *   Gestalt requires a DIFFERENT aggregation (max-per-level, then sum) that cannot be
 *   expressed through the standard stacking system.
 *
 *   This module provides `computeGestaltBase()` as a pure, testable replacement
 *   for the standard "base" modifier summation when gestalt mode is enabled.
 *   The GameEngine reads `settings.variantRules.gestalt` and calls this function
 *   instead of passing raw "base" modifiers to `applyStackingRules()`.
 *
 * ALGORITHM:
 *   Standard multiclassing:
 *     BAB total = Σ(ALL "base" increments from ALL class levelProgressions)
 *
 *   Gestalt:
 *     For each character level N from 1 to max(classLevels):
 *       BAB at N = max(class1.bab_at_N, class2.bab_at_N, ..., classK.bab_at_N)
 *     BAB total = Σ(BAB at N for each N)
 *
 * MODULE SCOPE:
 *   This module ONLY handles the per-level max-then-sum aggregation for "base"
 *   type modifiers on BAB and save pipelines. It does NOT affect:
 *   - Non-"base" modifiers (enhancement, racial, luck, etc.)
 *   - HP (Gestalt adds HP from both classes — standard additive)
 *   - Class features (both classes' features are granted — additive)
 *   - Skill points (handled by UI; best class skill points are used, not both)
 *   - Spellcasting / resource pools (both classes' progressions are used)
 *
 * ARCHITECTURE REFERENCE:
 *   @see ARCHITECTURE.md section 8.2 — Gestalt variant documentation
 *   @see CampaignSettings.variantRules.gestalt — the flag that activates this
 *   @see src/lib/engine/GameEngine.svelte.ts — DAG Phase 3 reads this when gestalt mode is on
 *   @see src/lib/utils/stackingRules.ts — standard (non-gestalt) stacking
 */

import type { Modifier } from '../types/pipeline';
import type { ID } from '../types/primitives';

// =============================================================================
// GESTALT PER-LEVEL CONTRIBUTION TYPE
// =============================================================================

/**
 * Per-level contribution record from a single class.
 *
 * Maps character level (1-indexed) → the "base" increment that class contributes
 * to a specific pipeline (BAB or save) at that level.
 *
 * Example for a Fighter up to level 5 (full BAB):
 *   { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 }
 *
 * Example for a Wizard up to level 5 (half BAB):
 *   { 2: 1, 4: 1 }  (only the levels where a +1 increment occurs)
 */
export type ClassLevelContributions = Record<number, number>;

// =============================================================================
// GESTALT BASE COMPUTATION
// =============================================================================

/**
 * Groups "base" type modifiers by their `sourceId` (class identifier).
 *
 * In D&D 3.5, each "base" type modifier from a class level progression entry
 * has a `sourceId` matching the class Feature ID (e.g., "class_fighter").
 * Each modifier also carries a `value` (the increment for that level).
 *
 * However, the `Modifier` type does not carry an explicit `level` field —
 * it is generated from a `levelProgression` entry. To reconstruct per-level
 * contributions, modifiers from the same class at the same level must be
 * grouped and their values summed (a single class may have multiple "base"
 * modifiers at one level in rare cases, though typically just one per pipeline).
 *
 * IMPORTANT: This function groups by `sourceId`. For Gestalt to work correctly,
 * each class's "base" type BAB/save modifiers must use a UNIQUE `sourceId`
 * that matches their class ID (e.g., "class_fighter"). Mixed source IDs from
 * the same class at different levels will each be treated as a separate "class".
 *
 * @param mods     - Array of "base" type `Modifier` objects targeting one pipeline.
 * @param classLevels - Record of classId → number of levels in that class.
 *                      Used to know the maximum level of each class for iteration.
 * @returns Map from sourceId → ClassLevelContributions (level → increment).
 *
 * @see computeGestaltBase — uses this to group before max-per-level computation
 */
export function groupBaseModifiersByClass(
  mods: Modifier[],
  classLevels: Record<ID, number>
): Map<string, ClassLevelContributions> {
  // Group all modifiers by sourceId
  const bySource = new Map<string, Modifier[]>();
  for (const mod of mods) {
    if (mod.type !== 'base') continue;
    const key = mod.sourceId;
    if (!bySource.has(key)) bySource.set(key, []);
    bySource.get(key)!.push(mod);
  }

  // For each source, reconstruct the per-level contribution map.
  //
  // Because levelProgression stores INCREMENTS (not cumulative totals) and
  // the engine collects all modifiers from entries where entry.level <= classLevel,
  // the modifier list for a class is an ordered series of increment values.
  //
  // We reconstruct per-level assignments by iterating modifiers for a class in order
  // and assigning each to successive levels from level 1 to classLevels[sourceId].
  //
  // This works because:
  //   - The engine only includes modifiers from entries where entry.level ≤ classLevel.
  //   - The modifiers are added in levelProgression order (ascending level).
  //   - Each level entry contributes exactly the modifiers declared for that level.
  //
  // LIMITATION: This reconstruction is accurate only when a class contributes
  // EXACTLY ONE "base" modifier per level per pipeline (the standard case).
  // If multiple "base" modifiers from the same source target the same pipeline
  // at the same level, they are summed (which is correct — they should be summed
  // before the gestalt max is applied).
  //
  // The reconstruction assigns increments to levels 1..N (where N = classLevels[sourceId]).
  // Each modifier in order maps to one level.
  const result = new Map<string, ClassLevelContributions>();

  for (const [sourceId, sourceMods] of bySource.entries()) {
    const contributions: ClassLevelContributions = {};
    const maxLevel = classLevels[sourceId] ?? sourceMods.length;

    // Assign each modifier to its level (1-indexed, ascending)
    // sourceMods is ordered from lowest to highest level (engine collection order)
    for (let levelIdx = 0; levelIdx < sourceMods.length && levelIdx < maxLevel; levelIdx++) {
      const level = levelIdx + 1;
      const value = typeof sourceMods[levelIdx].value === 'number'
        ? (sourceMods[levelIdx].value as number)
        : 0;
      contributions[level] = (contributions[level] ?? 0) + value;
    }

    result.set(sourceId, contributions);
  }

  return result;
}

/**
 * Computes the gestalt base value for a single pipeline (BAB or save).
 *
 * D&D 3.5 GESTALT ALGORITHM (ARCHITECTURE.md section 8.2):
 *   For each character level N from 1 to max(classLevels.values()):
 *     perLevelMax = max(class1.increment_at_N, class2.increment_at_N, ..., 0)
 *   gestaltTotal = sum(perLevelMax for N = 1 to maxLevel)
 *
 * This is the value that replaces the standard "sum ALL base modifiers" path
 * in GameEngine Phase 3 when `settings.variantRules.gestalt === true`.
 *
 * EXAMPLE:
 *   Fighter 5 / Wizard 5 (gestalt, both at the same 5 levels):
 *
 *   Level | Fighter BAB | Wizard BAB | max | cumulative
 *   ------|-------------|------------|-----|----------
 *     1   |     +1      |     0      |  1  |   1
 *     2   |     +1      |    +1      |  1  |   2
 *     3   |     +1      |     0      |  1  |   3
 *     4   |     +1      |    +1      |  1  |   4
 *     5   |     +1      |     0      |  1  |   5
 *   Total gestalt BAB = 5 (same as full BAB — Fighter dominates at every level)
 *
 *   Standard multiclass would give: 5 (Fighter) + 2 (Wizard) = 7 BAB.
 *   Gestalt gives: max per level = 5 BAB (Fighter's full BAB wins each level).
 *
 * SAVES EXAMPLE:
 *   Fighter 5 (Good Fort: 2,0,1,0,1) / Wizard 5 (Poor Fort: 0,0,1,0,0):
 *
 *   Level | Fighter Fort | Wizard Fort | max
 *   ------|--------------|-------------|-----
 *     1   |     +2       |     0       |  2
 *     2   |      0       |     0       |  0
 *     3   |     +1       |    +1       |  1
 *     4   |      0       |     0       |  0
 *     5   |     +1       |     0       |  1
 *   Gestalt Fort = 4 (same as Fighter alone — Good Fort wins at every level)
 *
 * @param mods         - All "base" type modifiers for this pipeline from all active class features.
 * @param classLevels  - The character's class levels record (sourceId → level count).
 * @param characterLevel - Total character level (sum of all class levels). Used to iterate all levels.
 * @returns The gestalt total base value for this pipeline.
 *
 * @see groupBaseModifiersByClass — groups input modifiers by class for per-level iteration
 * @see ARCHITECTURE.md section 8.2 — full gestalt specification
 */
export function computeGestaltBase(
  mods: Modifier[],
  classLevels: Record<ID, number>,
  characterLevel: number
): number {
  if (mods.length === 0) return 0;

  // Group modifiers by source class
  const byClass = groupBaseModifiersByClass(mods, classLevels);

  if (byClass.size === 0) return 0;

  // If only one class contributes, gestalt is identical to standard (max of one = that one)
  if (byClass.size === 1) {
    const [, contributions] = [...byClass.entries()][0];
    return Object.values(contributions).reduce((sum, v) => sum + v, 0);
  }

  // Gestalt: for each character level, take the MAX contribution across all classes
  let gestaltTotal = 0;
  for (let level = 1; level <= characterLevel; level++) {
    let maxAtThisLevel = 0;
    for (const contributions of byClass.values()) {
      const contribution = contributions[level] ?? 0;
      if (contribution > maxAtThisLevel) {
        maxAtThisLevel = contribution;
      }
    }
    gestaltTotal += maxAtThisLevel;
  }

  return gestaltTotal;
}

// =============================================================================
// PIPELINE ELIGIBILITY
// =============================================================================

/**
 * Returns `true` if the given pipeline ID is subject to gestalt max-per-level resolution.
 *
 * Only BAB and save pipelines use the gestalt max-per-level rule.
 * All other pipelines (HP, resistances, AC, etc.) use standard additive stacking.
 *
 * AFFECTED pipelines:
 *   - `"combatStats.base_attack_bonus"`  — Base Attack Bonus
 *   - `"saves.fortitude"`       — Fortitude save base
 *   - `"saves.reflex"`        — Reflex save base
 *   - `"saves.will"`       — Will save base
 *
 * NOT AFFECTED:
 *   - `"combatStats.max_hp"` — HP stacks (both classes' HD contribute fully)
 *   - All non-"base" modifier pipelines
 *
 * @param pipelineId - The pipeline ID to check.
 * @returns True if this pipeline uses gestalt max-per-level for "base" type modifiers.
 *
 * @see ARCHITECTURE.md section 8.2 — what is and isn't affected by Gestalt
 */
export const GESTALT_AFFECTED_PIPELINES = new Set([
  'combatStats.base_attack_bonus',
  'saves.fortitude',
  'saves.reflex',
  'saves.will',
]);

/**
 * Checks whether a pipeline ID is subject to the Gestalt max-per-level calculation.
 *
 * When Gestalt mode is active (`CampaignSettings.variantRules.gestalt === true`),
 * `"base"` type modifiers on the pipelines in `GESTALT_AFFECTED_PIPELINES` are
 * resolved using the max-per-level algorithm (`computeGestaltBase`) instead of the
 * normal additive sum. All other pipelines — including `combatStats.max_hp` — always
 * use additive stacking regardless of Gestalt mode.
 *
 * @param pipelineId - The pipeline ID to check (e.g., `"saves.fortitude"`).
 * @returns `true` if this pipeline uses Gestalt max-per-level for `"base"` modifiers.
 * @see GESTALT_AFFECTED_PIPELINES — the set of affected pipeline IDs.
 * @see computeGestaltBase — the algorithm used when this returns `true`.
 * @see ARCHITECTURE.md section 8.2 — what is and isn't affected by Gestalt mode.
 */
export function isGestaltAffectedPipeline(pipelineId: string): boolean {
  return GESTALT_AFFECTED_PIPELINES.has(pipelineId);
}
