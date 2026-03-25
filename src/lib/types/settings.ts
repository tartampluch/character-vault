/**
 * @file settings.ts
 * @description Campaign settings that govern character creation rules, dice house rules,
 *              and which rule sources are active in this campaign.
 *
 * Design philosophy:
 *   `CampaignSettings` is the global configuration object that the entire engine reads.
 *   It acts as a "campaign constitution" — all rules about HOW the game is played
 *   (what variant rules are active, what house rules apply, what content is enabled)
 *   are controlled from here.
 *
 *   ZERO HARDCODING ENFORCEMENT:
 *   By centralizing all house rules in this object and passing it to every function
 *   that needs it (especially the Dice Engine), we ensure that no rule is hardcoded.
 *   Want "Exploding 20s"? Set the flag. Want a higher point-buy budget? Set the number.
 *   No code path ever branches on a "is this campaign X or Y?" check.
 *
 *   HOW THIS CONNECTS TO THE ENGINE:
 *   - `diceRules.explodingTwenties` → read by `diceEngine.ts` `parseAndRoll()`
 *   - `statGeneration.rerollOnes`   → read by `RollStatsModal.svelte` (Phase 9.4)
 *   - `statGeneration.pointBuyBudget` → read by `PointBuyModal.svelte` (Phase 9.4)
 *   - `enabledRuleSources`          → read by `DataLoader.ts` to filter loaded features
 *   - `language`                    → read by `GameEngine.t()` for all localized strings
 *
 * @see src/lib/types/i18n.ts            for UnitSystem, UNIT_SYSTEM_CONFIG.
 * @see src/lib/utils/diceEngine.ts       (Phase 2.5) for explodingTwenties use.
 * @see src/lib/engine/DataLoader.ts      (Phase 4.2) for enabledRuleSources use.
 */

import type { ID } from './primitives';

// =============================================================================
// CAMPAIGN SETTINGS
// =============================================================================

/**
 * The global configuration for a campaign session.
 *
 * This object is stored in:
 *   - `localStorage` alongside the campaign data (Phase 4.1)
 *   - The `campaigns` database table as part of the campaign JSON (Phase 14.4)
 *
 * It is loaded into the `GameEngine`'s `$state` at startup and can be
 * modified by the GM via the Settings page (Phase 15.1).
 */
export interface CampaignSettings {
  // ---------------------------------------------------------------------------
  // 1. Localization
  // ---------------------------------------------------------------------------

  /**
   * The active display language for all localized strings.
   *
   * Used by:
   *   - `GameEngine.t()` to pick the correct translation from `LocalizedString` objects.
   *   - `formatDistance()` and `formatWeight()` helpers to apply the correct unit config.
   *
   * Changing this setting at runtime causes the entire UI to re-render in the new language
   * because all text goes through reactive `$derived` calls to `engine.t()`.
   *
   * TYPE NOTE:
   *   Using `string` (not a union type) allows arbitrary language codes from
   *   community JSON files to be selected. The `t()` fallback chain gracefully handles
   *   any code that lacks a full translation set by falling back to English.
   *   UI chrome strings (ui-strings.ts) always provide at least `en` and `fr`.
   */
  language: string;

  // ---------------------------------------------------------------------------
  // 2. Character creation rules
  // ---------------------------------------------------------------------------

  /**
   * Configuration for how player characters generate their ability scores.
   *
   * These settings only affect the character creation wizards (Phase 9.4).
   * Once scores are assigned, they behave identically regardless of generation method.
   */
  statGeneration: {
    /**
     * The allowed method for generating ability scores.
     *
     * - `"roll"`:          Roll 4d6, drop the lowest die. 6 total scores.
     * - `"point_buy"`:     Spend a budget of points to raise stats from a base of 8.
     *                      Each point raised costs 1 point up to 14, then 2 points
     *                      per +1 from 14 to 18 (SRD standard point buy cost table).
     * - `"standard_array"`: Use the fixed array: 15, 14, 13, 12, 10, 8. Assign to any stat.
     */
    method: 'roll' | 'point_buy' | 'standard_array';

    /**
     * Whether to reroll natural 1s during the 4d6 stat generation roll.
     *
     * When `true`:
     *   Before dropping the lowest die, any die showing 1 is rerolled once.
     *   (Some tables repeat this until no 1s remain — this variant rolls once.)
     *   This house rule produces higher average scores and is a common table rule.
     *
     * When `false`:
     *   Use straight 4d6 drop lowest (SRD standard).
     *
     * Only relevant when `method === "roll"`. Ignored for point buy and standard array.
     * Read by `RollStatsModal.svelte` (Phase 9.4) and tested in `diceEngine.test.ts` (Phase 17.4).
     */
    rerollOnes: boolean;

    /**
     * The total point budget for the point buy method.
     *
     * D&D 3.5 SRD standard budgets (DMG p. 169):
     *   - Low Fantasy:  15 points
     *   - Standard:     25 points (recommended default)
     *   - High Fantasy: 32 points
     *   - Epic Fantasy: 40 points
     *
     * The GM can set any value to support custom campaign power levels.
     * Read by `PointBuyModal.svelte` (Phase 9.4) to restrict spending.
     *
     * Only relevant when `method === "point_buy"`. Ignored for roll and standard array.
     */
    pointBuyBudget: number;
  };

  // ---------------------------------------------------------------------------
  // 3. Dice rules (House Rules)
  // ---------------------------------------------------------------------------

  /**
   * House rules that modify dice resolution mechanics.
   *
   * These are the most impactful house rules — they change the fundamental
   * die-rolling behaviour and must be passed to `parseAndRoll()` on every roll.
   */
  diceRules: {
    /**
     * The "Exploding 20s" house rule.
     *
     * When `true`:
     *   After rolling a natural 20 on a d20, the die is rolled again.
     *   If the second roll is also a 20, roll again. Continue until the result
     *   is not a 20. Sum ALL rolls (first 20 + second 20 + ... + final non-20).
     *
     *   This creates the dramatic possibility of astronomically high rolls.
     *   Example: Rolling 20, 20, 14 → naturalTotal = 54, numberOfExplosions = 2.
     *
     *   Implementation in `diceEngine.ts`:
     *   ```
     *   while (lastRoll === 20 && settings.diceRules.explodingTwenties) {
     *     lastRoll = rng(20);
     *     naturalTotal += lastRoll;
     *     numberOfExplosions++;
     *   }
     *   ```
     *
     * When `false`:
     *   Standard D&D 3.5 crit confirmation mechanic (not implemented by this flag —
     *   the crit threat range and confirmation are handled by the combat system).
     *
     * Tested in `diceEngine.test.ts` Phase 17.4.
     */
    explodingTwenties: boolean;
  };

  // ---------------------------------------------------------------------------
  // 4. Variant rules (optional mechanics that change core engine behaviour)
  // ---------------------------------------------------------------------------

  /**
   * Variant rules that alter how the engine resolves character statistics.
   *
   * D&D 3.5 Unearthed Arcana and the SRD variant rules directory define numerous
   * opt-in rule variants that change fundamental mechanics. This block collects
   * those that require ENGINE-LEVEL handling (not just data differences).
   *
   * ZERO HARDCODING ENFORCEMENT:
   *   Each flag in this block corresponds to a specific code branch in the GameEngine
   *   DAG (Phase 3 or later). The engine NEVER checks variant rules outside of this
   *   object — all variant behaviour is gated by `settings.variantRules.*`.
   *
   * OPTIONAL BLOCK: All sub-fields default to `false` if the block or field is absent.
   * The default settings factory (`createDefaultCampaignSettings`) always initialises
   * this block explicitly so TypeScript can enforce field presence.
   */
  variantRules: {
    /**
     * Vitality and Wound Points system (Unearthed Arcana variant).
     *
     * D&D 3.5 VARIANT RULE:
     *   Replaces the standard hit point system with two separate resource pools:
     *   - **Vitality Points (VP)**: Represents the ability to avoid real harm; gained
     *     per level using the class vitality die. Most damage depletes VP first.
     *   - **Wound Points (WP)**: Represents true physical damage; equals the character's
     *     current Constitution score. Only reduced by critical hits or when VP hits 0.
     *
     * CRITICAL HIT DAMAGE ROUTING:
     *   In standard D&D 3.5, a critical hit multiplies damage and routes it to HP.
     *   In the V/WP system, a critical hit routes the SAME (non-multiplied) damage
     *   directly to Wound Points, bypassing Vitality Points entirely. There is no
     *   critical multiplier — the danger of crits comes from targeting WP directly.
     *   This is the key mechanical change requiring engine support.
     *
     * ENGINE IMPLEMENTATION (Phase 2.5b):
     *   When `vitalityWoundPoints === true`, `parseAndRoll()` in `diceEngine.ts` sets
     *   `RollResult.targetPool` based on the roll's critical status:
     *     - Normal damage: `targetPool = "res_vitality"`
     *     - Critical hit damage: `targetPool = "res_wound_points"`
     *   The Combat UI reads `targetPool` to apply damage to the correct ResourcePool.
     *
     * RESOURCE POOLS REQUIRED (content authors must create these):
     *   - `resources.vitality_points`:  resetCondition "long_rest", maxPipelineId points
     *                                   to a VP max pipeline (class vitality die + CON).
     *   - `resources.wound_points`:     equals current Constitution score.
     *
     * OVERFLOW HANDLING (Combat UI concern, not engine):
     *   When `resources.vitality_points.currentValue === 0`, the Combat UI redirects
     *   ALL subsequent damage (even non-crits) to `resources.wound_points`.
     *   The dice engine only provides the INITIAL routing based on crit status.
     *
     * @default false
     *
     * @see RollResult.targetPool — the field carrying the routing decision
     * @see DamageTargetPool — the enum: "res_hp" | "res_vitality" | "res_wound_points"
     * @see ARCHITECTURE.md section 8.3 — Vitality/Wound Points variant documentation
     * @see src/lib/utils/diceEngine.ts — parseAndRoll() targetPool computation
     */
    vitalityWoundPoints: boolean;

    /**
     * Gestalt characters (Unearthed Arcana "Gestalt Characters" variant).
     *
     * D&D 3.5 VARIANT RULE:
     *   In a Gestalt campaign, each character advances in TWO classes simultaneously
     *   at each level. The character uses the BEST features of each class per level,
     *   rather than combining them additively. This makes every character more powerful
     *   but is balanced because all characters benefit equally.
     *
     * MECHANICAL CHANGE vs STANDARD MULTICLASSING:
     *
     *   Standard multiclassing (gestalt = false):
     *     BAB = SUM of all "base" type modifiers from all class levelProgression entries.
     *     Fort/Ref/Will = SUM of all "base" type save modifiers from all classes.
     *
     *   Gestalt (gestalt = true):
     *     BAB and saves are resolved by taking the MAXIMUM contribution PER LEVEL
     *     across both gestalt classes, then summing across all levels.
     *
     *     Per level:
     *       BAB_at_level_N      = max(class1_bab_at_level_N, class2_bab_at_level_N)
     *       Fort_at_level_N     = max(class1_fort_at_level_N, class2_fort_at_level_N)
     *       Ref_at_level_N      = max(class1_ref_at_level_N, class2_ref_at_level_N)
     *       Will_at_level_N     = max(class1_will_at_level_N, class2_will_at_level_N)
     *
     *     Total BAB = sum(max_bab_at_each_level)
     *     Total Fort = sum(max_fort_at_each_level), etc.
     *
     * ENGINE IMPLEMENTATION (DAG Phase 3.7):
     *   When `variantRules.gestalt === true`, Phase 3 uses `computeGestaltBase()` instead
     *   of passing all "base" type modifiers directly to `applyStackingRules()`.
     *
     *   `computeGestaltBase(targetId, classLevels, flatModifiers)` (src/lib/utils/gestaltRules.ts):
     *     1. Group all "base" type modifiers for the target pipeline by their `sourceId`.
     *     2. For each character level N (1 to max characterLevel):
     *        - Collect the "base" increment contributed by each class at level N.
     *        - Take the MAX of all class contributions at that level.
     *     3. Sum all per-level maxima → this is the gestalt base for that pipeline.
     *
     * WHAT IS AND ISN'T AFFECTED:
     *   AFFECTED (uses gestalt max-per-level):
     *     - BAB (`combatStats.base_attack_bonus`)
     *     - Fortitude save (`saves.fortitude`)
     *     - Reflex save (`saves.reflex`)
     *     - Will save (`saves.will`)
     *
     *   NOT AFFECTED (uses standard additive stacking even in gestalt):
     *     - HP (each gestalt class grants full HD at each level — HP stacks)
     *     - Skill points (use best skill point total, not sum; but this is a UI concern)
     *     - Class features (character gets ALL features of BOTH classes — additive)
     *     - Spellcasting (both classes' spell slot progressions are available)
     *     - Non-"base" modifiers (enhancement, racial, untyped — always standard)
     *
     * GESTALT REQUIREMENT:
     *   Gestalt assumes EXACTLY TWO classes leveled together (same level in both).
     *   The engine does not enforce this — the variant rules allow flexibility — but
     *   content authors should ensure gestalt characters have equal levels in both classes.
     *
     * LIMITATIONS:
     *   - Level progression increments MUST be stored per-level (not cumulative totals).
     *     This is always the case in this engine (ARCHITECTURE.md section 5.4).
     *   - The GameEngine computes per-level max across ALL active class features whose
     *     `category === "class"`. If a character has 3+ class features (unusual base
     *     gestalt), the max still applies correctly across all classes at each level.
     *
     * @default false
     *
     * @see ARCHITECTURE.md section 8.2 — Gestalt variant rule documentation
     * @see src/lib/utils/gestaltRules.ts — `computeGestaltBase()` implementation
     * @see SRD variant: /srd/variant/classes/gestalt.html
     */
    gestalt: boolean;
  };

  // ---------------------------------------------------------------------------
  // 5. Enabled rule sources (content filter)
  // ---------------------------------------------------------------------------

  /**
   * Ordered array of rule source IDs enabled for this campaign.
   *
   * WHY ORDERED?
   *   The DataLoader loads rule source files in ALPHABETICAL ORDER by file path
   *   (the file system order determines merge priority, not this array order).
   *   This array is a FILTER: only features whose `Feature.ruleSource` matches
   *   one of these IDs are retained after loading.
   *
   * IMPORTANT DISTINCTION:
   *   - Loading order = alphabetical file path order (always, deterministic)
   *   - This array = which sources to include/exclude (a whitelist filter)
   *
   * The GM manages this list via the Rule Source Manager UI (Phase 15.1).
   * Adding a source to this list enables all its content.
   * Removing a source disables all content tagged with that ruleSource ID.
   *
   * Examples of common source IDs:
   *   - "srd_core"           : D&D 3.5 SRD core rules (PHB, DMG, MM content)
   *   - "srd_psionics"       : Expanded Psionics Handbook content
   *   - "srd_psionic_transparency": The Magic-Psionic Transparency rule
   *   - "unearthed_arcana"   : UA variant rules
   *   - "homebrew_darklands" : A custom homebrew rule source
   *
   * NOTE: Configuration tables (XP thresholds, carrying capacity) respect this filter too.
   * A config table's `ruleSource` must be in `enabledRuleSources` to be loaded.
   */
  enabledRuleSources: ID[];
}

// =============================================================================
// DEFAULT SETTINGS FACTORY
// =============================================================================

/**
 * Creates a default `CampaignSettings` object for a new campaign.
 *
 * Uses the recommended standard D&D 3.5 settings:
 *   - English language
 *   - Standard point buy (25 points)
 *   - No reroll ones (strict 4d6 drop lowest)
 *   - No exploding 20s
 *   - Only SRD Core enabled by default
 *
 * The GM can update any of these after campaign creation via the Settings page.
 *
 * WHY A FACTORY FUNCTION AND NOT A CONST?
 *   A function creates a fresh object each time, avoiding accidental mutation
 *   of a shared reference. Two different campaigns get two independent settings objects.
 */
export function createDefaultCampaignSettings(): CampaignSettings {
  return {
    language: 'en',
    statGeneration: {
      method: 'point_buy',
      rerollOnes: false,
      pointBuyBudget: 25,
    },
    diceRules: {
      explodingTwenties: false,
    },
    variantRules: {
      // Vitality/Wound Points (Unearthed Arcana): off by default.
      // When enabled, parseAndRoll() routes crit damage to res_wound_points.
      // @see CampaignSettings.variantRules.vitalityWoundPoints for full documentation.
      vitalityWoundPoints: false,
      // Gestalt characters (Unearthed Arcana): off by default.
      // When enabled, BAB and saves use max-per-level instead of sum across classes.
      // @see CampaignSettings.variantRules.gestalt for full documentation.
      gestalt: false,
    },
    enabledRuleSources: ['srd_core'],
  };
}
