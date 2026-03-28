/**
 * @file stackingRules.ts
 * @description D&D 3.5 modifier stacking rules engine.
 *
 * Design philosophy:
 *   The single most important mechanical rule in D&D 3.5 is the stacking rule:
 *   "In general, a bonus of the same type doesn't stack with itself."
 *   (SRD, "Combining Magical Effects", p. 21)
 *
 *   This module is the ONLY place in the codebase where stacking decisions are made.
 *   Every pipeline reduction — from a flat list of Modifiers to a `totalBonus` — passes
 *   through this module. This ensures complete consistency and makes rule changes trivial.
 *
 *   THE RULES (D&D 3.5 SRD p. 21):
 *     NON-STACKING (only highest applies, per type):
 *       armor, circumstance (penalties only), competence, deflection, dodge (NO — see below),
 *       enhancement, insight, luck, morale, natural_armor, profane, racial, sacred, shield, size
 *
 *     ALWAYS STACKING (all values summed):
 *       `dodge`       — Explicitly called out in SRD: "Dodge bonuses stack with each other."
 *       `circumstance`— Bonuses stack; penalties also stack (but are tracked separately).
 *       `synergy`     — Skill synergy bonuses always stack (by design, they're small fixed values).
 *       `untyped`     — Any bonus/penalty without a declared type always stacks.
 *       `base`        — The BAB/Save base values from levelProgression are summed across classes.
 *
 *     SPECIAL HANDLING:
 *       `multiplier`  — Applied AFTER all additive bonuses. Multiple multipliers are not stacked
 *                       additively — instead, they compound: (1 + bonus1) * (1 + bonus2).
 *                       Example: ×1.5 STR damage (two-handed) + ×1.25 from a feat:
 *                       (1.5) * (1.25) = 1.875 multiplier.
 *                       However, for simplicity and SRD accuracy, the engine uses only the
 *                       LARGEST multiplier (SRD: "When multipliers apply to the same value,
 *                       combine them into one: add 1 to each multiplier and multiply the
 *                       results, then subtract 1."). The engine respects the highest single
 *                       multiplier as the default — complex compounding is not standard SRD.
 *
 *       `setAbsolute` — Bypasses the entire stacking system. When present, the engine
 *                       ignores ALL other modifiers on the pipeline and sets totalValue directly.
 *                       If multiple setAbsolute modifiers compete, the LAST one wins
 *                       (following resolution chain order — see DataLoader phase).
 *
 *       `damage_reduction` — DR uses BEST-WINS PER BYPASS GROUP, not additive stacking.
 *                       Each unique `drBypassTags` signature forms a separate DR entry.
 *                       Within that group, only the HIGHEST value applies.
 *                       A creature can have multiple independent DR entries simultaneously
 *                       (e.g., "DR 5/magic AND DR 10/silver" from different sources).
 *                       See ARCHITECTURE.md section 4.5 for the full DR rules.
 *
 *   PENALTIES:
 *     Penalties (negative modifier values) are handled IDENTICALLY to bonuses with respect
 *     to stacking rules. A penalty of type `armor` does not stack with another `armor`
 *     penalty (take the WORST, i.e., most negative). An `untyped` penalty always stacks.
 *     This implementation handles both signs uniformly.
 *
 * @see src/lib/types/primitives.ts    for ModifierType definitions (includes "damage_reduction")
 * @see src/lib/types/pipeline.ts      for Modifier (includes drBypassTags) and StatisticPipeline
 * @see ARCHITECTURE.md section 4.5    for Damage Reduction design documentation
 */

import type { Modifier } from '../types/pipeline';

// =============================================================================
// STACKING CONFIGURATION — Which types always stack
// =============================================================================

/**
 * The set of modifier types that ALWAYS stack (all values are summed).
 *
 * All other types are non-stacking: only the highest (or most negative) value
 * among modifiers of the same type is applied.
 *
 * IMPORTANT: `base` is in the stackable set because class BAB increments
 * from `levelProgression` are EACH separate `base` type modifiers from different
 * classes, and their total defines the character's BAB. They MUST all sum.
 */
export const ALWAYS_STACKING_TYPES = new Set([
  'dodge',        // SRD explicit exception (PHB p.21: "Dodge bonuses stack with each other")
  'circumstance', // SRD explicit exception (both bonuses and penalties stack)
  'synergy',      // Skill synergy (each +2 from a different skill must stack)
  'untyped',      // No declared type: always stacks

  // WHY "base" is in ALWAYS_STACKING_TYPES:
  //   This is NOT a standard D&D 3.5 modifier type per the SRD — it is a convention
  //   used exclusively for BAB and saving throw INCREMENTS in `levelProgression` entries.
  //
  //   The engine stores BAB/save progression as INCREMENTS per level (not cumulative totals)
  //   to make multiclassing trivially additive:
  //     Fighter 5 (BAB +1/level) + Wizard 3 (BAB +0,+1,+0) = sum of all increments = +6
  //
  //   If "base" were non-stacking, the engine would only keep the HIGHEST base increment
  //   per level, completely breaking the multiclass progression system.
  //   Since `base` type modifiers from different class-level instances MUST all sum,
  //   it belongs in the always-stacking set.
  //
  //   @see ARCHITECTURE.md section 5.4 for the full multiclassing BAB/save resolution spec.
  //   @see ANNEXES.md section A.7 for the Soulknife class example (mixed full/part BAB).
  'base',
]);

/**
 * Modifier types that require SPECIAL handling — neither pure additive stacking
 * nor simple best-wins.
 *
 * Exported for the Content Editor's `ModifierListEditor` stacking badge display
 * so that it can classify types correctly without duplicating this rule knowledge
 * as a local constant inside the Svelte component (zero-hardcoding rule, ARCHITECTURE.md §6).
 *
 *   `multiplier`       — Applied AFTER all additive bonuses; compounded, not summed.
 *                        The engine uses the largest multiplier (SRD: combine multipliers).
 *   `setAbsolute`      — Overrides ALL other modifiers; last-set wins on ties.
 *   `damage_reduction` — Best-wins per bypass-tag group; multiple independent DR entries
 *                        can coexist (e.g., DR 5/magic AND DR 10/silver).
 *   `max_dex_cap`      — Minimum-wins; intercepted in Phase 3.5 (DAG), not the normal
 *                        stacking pass.
 */
export const SPECIAL_MODIFIER_TYPES = new Set([
  'multiplier',         // Special compounding — not additive stacking (see note above)
  'setAbsolute',        // Bypasses stacking entirely; last-set wins
  'damage_reduction',   // Best-wins per bypass-tag group (see DR section above)
  'max_dex_cap',        // Minimum-wins; DAG Phase 3.5 intercept
]);

// =============================================================================
// STACKING RESULT
// =============================================================================

// =============================================================================
// DR ENTRY — One resolved Damage Reduction entry after best-wins grouping
// =============================================================================

/**
 * A single resolved Damage Reduction entry, produced by `applyStackingRules()`.
 *
 * D&D 3.5 DR is presented as "DR X/material" — this type captures both the
 * numeric amount and the bypass condition for display and combat resolution.
 *
 * Multiple `DREntry` objects can coexist on one creature simultaneously:
 *   e.g., a creature with both "DR 5/magic" and "DR 10/silver" has two entries.
 *
 * The Dice Engine uses `drEntries` from the `combatStats.damage_reduction` pipeline
 * to check whether the attacking weapon bypasses each entry before subtracting damage.
 *
 * @see Modifier.drBypassTags
 * @see ARCHITECTURE.md section 4.5
 */
export interface DREntry {
  /**
   * The amount of damage reduced per hit.
   * This is the HIGHEST value among all modifiers sharing this bypass signature.
   */
  amount: number;

  /**
   * The material/condition tags that bypass this DR entry.
   *
   * An attack weapon that carries ANY tag in this array bypasses the DR entirely.
   * Empty array (`[]`) means the DR is unbeatable ("DR X/—" overcome by nothing).
   *
   * Examples:
   *   []                      → DR X/— (nothing bypasses)
   *   ["magic"]               → DR X/magic
   *   ["silver"]              → DR X/silver
   *   ["good"]                → DR X/good (good-aligned weapons)
   *   ["cold_iron"]           → DR X/cold iron
   *   ["epic"]                → DR X/epic (+6 or better)
   *   ["magic", "silver"]     → DR X/magic and silver (extremely rare AND condition)
   */
  bypassTags: string[];

  /**
   * The winning modifier that provided this DR entry.
   * Used by the UI to show the source ("Barbarian DR", "Troll Regeneration", etc.).
   */
  sourceModifier: Modifier;

  /**
   * Modifiers with the same bypass signature that were suppressed (lower value).
   * Shown in the ModifierBreakdownModal to explain which DR source was overridden.
   */
  suppressedModifiers: Modifier[];
}

/**
 * The result of applying stacking rules to a list of modifiers.
 *
 * Separates the breakdown so the UI (Phase 9.2 ModifierBreakdownModal) can show
 * which modifiers were applied vs. which were suppressed by stacking rules.
 */
export interface StackingResult {
  /**
   * The net bonus (or penalty) after applying stacking rules.
   * Does NOT include `setAbsolute` results (those bypass this entirely).
   * `multiplier` effects are also not in this value — they are in `multiplierFactor`.
   *
   * NOTE: For the `combatStats.damage_reduction` pipeline, `totalBonus` reflects
   * only the `"base"` type DR increments (class-progression additive DR).
   * The separate best-wins DR is surfaced through `drEntries` instead.
   */
  totalBonus: number;

  /**
   * The final `totalValue` of the pipeline after applying all modifier categories:
   *   1. If `setAbsoluteValue` is present: use that directly.
   *   2. Otherwise: `baseValue + totalBonus` then applied with `multiplierFactor`.
   *
   * For `combatStats.damage_reduction`, `totalValue` represents the "base" additive
   * DR amount (class progression). The full resolved DR list is in `drEntries`.
   */
  totalValue: number;

  /**
   * The combined multiplier factor. Defaults to 1.0 (no multiplier).
   * Applied AFTER all additive bonuses: `(baseValue + totalBonus) * multiplierFactor`.
   *
   * When multiple `multiplier` modifiers exist, uses the single largest multiplier
   * value (conservative SRD interpretation for simplicity).
   */
  multiplierFactor: number;

  /**
   * If any `setAbsolute` modifier was present, this holds its value.
   * When present, it fully overrides `baseValue + totalBonus + multiplierFactor`.
   * The LAST setAbsolute in the provided list wins (list should be pre-sorted by
   * resolution chain order by the caller — GameEngine Phase 0).
   */
  setAbsoluteValue?: number;

  /**
   * Modifiers that were actually APPLIED and contribute to `totalBonus`.
   * Used by the ModifierBreakdownModal to show the math.
   */
  appliedModifiers: Modifier[];

  /**
   * Modifiers that were SUPPRESSED by stacking rules (duplicate type, lower value).
   * Used by the ModifierBreakdownModal to show why a bonus wasn't counted.
   */
  suppressedModifiers: Modifier[];

  /**
   * Resolved Damage Reduction entries after best-wins grouping by bypass signature.
   *
   * This field is populated when ANY modifier in the input has `type: "damage_reduction"`.
   * Each entry represents one "DR X/material" line that the UI and Dice Engine use.
   *
   * EMPTY (absent) for pipelines that do not contain `"damage_reduction"` modifiers.
   *
   * Multiple entries coexist independently. The Dice Engine checks each entry
   * separately — a weapon that bypasses DR 5/magic still faces DR 10/silver
   * unless it is also made of silver.
   *
   * @see DREntry
   * @see ARCHITECTURE.md section 4.5
   */
  drEntries?: DREntry[];
}

// =============================================================================
// MAIN STACKING FUNCTION
// =============================================================================

/**
 * Applies D&D 3.5 stacking rules to a list of resolved Modifier objects,
 * producing a single net bonus value and a breakdown for display.
 *
 * ALGORITHM:
 *   1. Scan for any `setAbsolute` modifier → if found, return immediately with forced value.
 *   2. Separate `multiplier`, `damage_reduction`, and all other ("regular") modifiers.
 *   3. Group regular modifiers by their `type` (ModifierType).
 *   4. For each regular group:
 *      a. If the type is in `ALWAYS_STACKING_TYPES`: sum ALL values in the group.
 *      b. For all others: separate into positive (bonuses) and negative (penalties).
 *         - Bonuses: take only the HIGHEST value (best).
 *         - Penalties: take only the LOWEST value (worst, most negative).
 *         This matches the SRD ruling that non-stacking types use the best/worst value.
 *   5. Collect `multiplier` type modifiers → use the value farthest from 1.0
 *      (the most impactful multiplier wins; see note on `setAbsolute` behavior).
 *   6. Process `damage_reduction` modifiers → group by sorted `drBypassTags` signature;
 *      within each group, keep the HIGHEST value (best-wins). Return as `drEntries[]`.
 *   7. Sum all group totals → `totalBonus`.
 *   8. Apply multiplier: `totalValue = (baseValue + totalBonus) * multiplierFactor`.
 *
 * NOTE ON MODIFIER VALUES:
 *   `Modifier.value` can be a `number | string`. When this function is called,
 *   the GameEngine has ALREADY resolved string formulas to numbers via the Math Parser.
 *   This function only receives pre-resolved numeric values. The caller is responsible
 *   for formula resolution before calling `applyStackingRules()`.
 *
 * @param modifiers  - Array of active Modifier objects with numeric values (already resolved).
 * @param baseValue  - The pipeline's base value before any modifiers.
 * @returns A `StackingResult` with the computed totals and full breakdown.
 *
 * @example
 * // Ring of Protection +2 (deflection) + Shield of Faith +3 (deflection) + Haste +1 (dodge)
 * applyStackingRules([mod_deflection_2, mod_deflection_3, mod_dodge_1], 0)
 * // → totalBonus: 4 (max deflection 3 + dodge 1), not 6
 */
export function applyStackingRules(
  modifiers: Modifier[],
  baseValue: number
): StackingResult {
  const appliedModifiers: Modifier[] = [];
  const suppressedModifiers: Modifier[] = [];

  // --- Step 1: Handle setAbsolute (highest priority, bypasses all stacking) ---
  // Process in the order provided (caller has pre-sorted by resolution chain priority).
  // The LAST setAbsolute in the list wins (last = highest priority in the chain).
  const absoluteModifiers = modifiers.filter(m => m.type === 'setAbsolute');
  if (absoluteModifiers.length > 0) {
    const winningAbsolute = absoluteModifiers[absoluteModifiers.length - 1];
    const winningValue = typeof winningAbsolute.value === 'number' ? winningAbsolute.value : baseValue;

    appliedModifiers.push(winningAbsolute);
    // All other modifiers (including other setAbsolutes) are suppressed
    suppressedModifiers.push(...modifiers.filter(m => m !== winningAbsolute));

    return {
      totalBonus: 0, // N/A — setAbsolute bypasses additive stacking
      totalValue: winningValue,
      multiplierFactor: 1,
      setAbsoluteValue: winningValue,
      appliedModifiers,
      suppressedModifiers,
    };
  }

  // --- Step 2: Separate multipliers, DR, max_dex_cap, and regular modifiers ---
  //
  // `max_dex_cap` is intercepted in DAG Phase 3 (buildCombatStatPipelines) BEFORE
  // this function is called for the `combatStats.max_dexterity_bonus` pipeline.
  // Phase 3 separates cap mods, computes min() as effectiveBaseValue, then passes
  // only the remaining non-cap mods here. Excluding `max_dex_cap` from regularMods
  // ensures this function is also correct if called with such mods unexpectedly
  // (avoids applying the wrong "highest wins" semantics to a minimum-wins type).
  //
  // @see phase3CombatStats.ts — max_dex_cap interception logic
  // @see ARCHITECTURE.md section 4.17 — Max DEX Bonus pipeline reference
  const multiplierMods = modifiers.filter(m => m.type === 'multiplier');
  const drMods = modifiers.filter(m => m.type === 'damage_reduction');
  const regularMods = modifiers.filter(m =>
    m.type !== 'multiplier' &&
    m.type !== 'setAbsolute' &&
    m.type !== 'damage_reduction' &&
    m.type !== 'max_dex_cap'   // Intercepted in DAG Phase 3 — NOT handled here
  );

  // --- Step 3: Group regular modifiers by type ---
  const byType = new Map<string, Modifier[]>();
  for (const mod of regularMods) {
    const key = mod.type;
    if (!byType.has(key)) byType.set(key, []);
    byType.get(key)!.push(mod);
  }

  // --- Step 4: Process each type group according to stacking rules ---
  let totalBonus = 0;

  for (const [type, group] of byType.entries()) {
    if (ALWAYS_STACKING_TYPES.has(type)) {
      // STACKABLE type: sum ALL values
      for (const mod of group) {
        const numericValue = getNumericValue(mod);
        totalBonus += numericValue;
        appliedModifiers.push(mod);
      }
    } else {
      // NON-STACKABLE type: find the best bonus AND the worst penalty separately
      const bonuses = group.filter(m => getNumericValue(m) > 0);
      const penalties = group.filter(m => getNumericValue(m) < 0);
      const zeros = group.filter(m => getNumericValue(m) === 0);

      // Apply the highest bonus (if any)
      if (bonuses.length > 0) {
        const best = bonuses.reduce((prev, curr) =>
          getNumericValue(curr) > getNumericValue(prev) ? curr : prev
        );
        totalBonus += getNumericValue(best);
        appliedModifiers.push(best);
        suppressedModifiers.push(...bonuses.filter(m => m !== best));
      }

      // Apply the worst penalty (lowest value, most negative)
      if (penalties.length > 0) {
        const worst = penalties.reduce((prev, curr) =>
          getNumericValue(curr) < getNumericValue(prev) ? curr : prev
        );
        totalBonus += getNumericValue(worst);
        appliedModifiers.push(worst);
        suppressedModifiers.push(...penalties.filter(m => m !== worst));
      }

      // Zero-value modifiers are applied (they change nothing but are tracked)
      for (const mod of zeros) {
        appliedModifiers.push(mod);
      }
    }
  }

  // --- Step 5: Determine multiplier factor ---
  let multiplierFactor = 1;
  if (multiplierMods.length > 0) {
    // Apply the multiplier farthest from 1.0 (most impactful single multiplier wins).
    // All multiplier modifiers not chosen are suppressed.
    const bestMultiplier = multiplierMods.reduce((prev, curr) => {
      const prevDelta = Math.abs(getNumericValue(prev) - 1);
      const currDelta = Math.abs(getNumericValue(curr) - 1);
      return currDelta > prevDelta ? curr : prev;
    });
    multiplierFactor = getNumericValue(bestMultiplier);
    appliedModifiers.push(bestMultiplier);
    suppressedModifiers.push(...multiplierMods.filter(m => m !== bestMultiplier));
  }

  // --- Step 6: Resolve Damage Reduction entries (best-wins per bypass-tag group) ---
  //
  // D&D 3.5 SRD rule (specialAbilities.html):
  //   "A creature does not get to apply both its DR 5/magic and its DR 10/silver as
  //    bonuses to damage reduction — it simply possesses both independently."
  //   This means DR entries with DIFFERENT bypass signatures coexist as separate entries.
  //   DR entries with the SAME bypass signature: only the HIGHEST value applies.
  //
  // ALGORITHM:
  //   1. Serialize each modifier's `drBypassTags` array into a canonical string key
  //      (sorted, JSON-serialized: `["magic","silver"]` → '["magic","silver"]').
  //      Sorting ensures ["silver","magic"] and ["magic","silver"] map to the same key.
  //   2. Group all DR modifiers by this key.
  //   3. Within each group, keep the modifier with the HIGHEST value; suppress the rest.
  //   4. Return each winning modifier as a `DREntry`, alongside its suppressed peers.
  let drEntries: DREntry[] | undefined;
  if (drMods.length > 0) {
    drEntries = [];

    // Build a map: serialized bypass key → list of DR modifiers
    const drByGroup = new Map<string, Modifier[]>();
    for (const mod of drMods) {
      // Sort the bypass tags so ["silver","magic"] and ["magic","silver"] are identical
      const sortedTags = [...(mod.drBypassTags ?? [])].sort();
      const key = JSON.stringify(sortedTags);
      if (!drByGroup.has(key)) drByGroup.set(key, []);
      drByGroup.get(key)!.push(mod);
    }

    // For each bypass group, find the winner (highest DR value)
    for (const [key, group] of drByGroup.entries()) {
      const winner = group.reduce((prev, curr) =>
        getNumericValue(curr) > getNumericValue(prev) ? curr : prev
      );
      const suppressed = group.filter(m => m !== winner);

      appliedModifiers.push(winner);
      suppressedModifiers.push(...suppressed);

      drEntries.push({
        amount:            getNumericValue(winner),
        bypassTags:        JSON.parse(key) as string[], // Reconstruct sorted array
        sourceModifier:    winner,
        suppressedModifiers: suppressed,
      });
    }
  }

  // --- Step 7: Compute final total ---
  const totalValue = Math.floor((baseValue + totalBonus) * multiplierFactor);

  return {
    totalBonus,
    totalValue,
    multiplierFactor,
    setAbsoluteValue: undefined,
    appliedModifiers,
    suppressedModifiers,
    drEntries,
  };
}

// =============================================================================
// UTILITY
// =============================================================================

/**
 * Extracts the numeric value from a Modifier, defaulting to 0 for string formulas.
 *
 * WHY CAN THIS BE A STRING?
 *   `Modifier.value` is `number | string` because formulas like
 *   `"@attributes.stat_wisdom.derivedModifier"` are valid modifier values in JSON.
 *   However, by the time a modifier reaches `applyStackingRules()`, the GameEngine
 *   has ALREADY resolved all string formulas to numbers via `evaluateFormula()`.
 *   This helper is a safety net for any string that somehow slipped through
 *   (e.g., a damage dice formula "1d8" which is not resolvable to a number).
 *
 * @param mod - The modifier to extract a value from.
 * @returns The numeric value, or 0 if the value is a non-numeric string.
 */
function getNumericValue(mod: Modifier): number {
  if (typeof mod.value === 'number') return mod.value;
  const parsed = parseFloat(mod.value);
  if (!isNaN(parsed)) return parsed;
  console.warn(`[StackingRules] Modifier "${mod.id}" has a non-numeric value "${mod.value}" that was not resolved before stacking. Treating as 0.`);
  return 0;
}

// =============================================================================
// DERIVED MODIFIER HELPER
// =============================================================================

/**
 * Computes the D&D 3.5 ability score modifier from a pipeline's totalValue.
 *
 * Formula: Math.floor((totalValue - 10) / 2)
 *
 * This is the formula used by the GameEngine to populate `StatisticPipeline.derivedModifier`
 * for the 6 main ability scores. It is defined here (utility file) and called from the
 * GameEngine's DAG Phase 2 rather than being duplicated in multiple places.
 *
 * For non-ability-score pipelines (AC, BAB, saves, skills), `derivedModifier` is always 0.
 * The engine only computes this for pipelines in `Character.attributes`.
 *
 * @param totalValue - The pipeline's final computed value (after stacking rules).
 * @returns The ability score modifier (floor((totalValue - 10) / 2)).
 *
 * @example
 * computeDerivedModifier(10) → 0   (10 - 10 = 0 / 2 = 0)
 * computeDerivedModifier(18) → 4   (18 - 10 = 8 / 2 = 4)
 * computeDerivedModifier(7)  → -2  (7  - 10 = -3 / 2 = -1.5 → floor = -2)
 * computeDerivedModifier(1)  → -5  (1  - 10 = -9 / 2 = -4.5 → floor = -5)
 */
export function computeDerivedModifier(totalValue: number): number {
  return Math.floor((totalValue - 10) / 2);
}
