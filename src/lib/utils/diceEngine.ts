/**
 * @file diceEngine.ts
 * @description The Random Number Generator and dice rolling engine with situational bonus evaluation.
 *
 * Design philosophy:
 *   The Dice Engine is the ONLY place where random numbers are introduced into the system.
 *   Every roll — attack, damage, skill check, saving throw, initiative — goes through `parseAndRoll()`.
 *   By centralising all dice logic here, house rules (Exploding 20s, Reroll 1s) are guaranteed
 *   to apply consistently everywhere without duplicated code.
 *
 *   THREE RESPONSIBILITIES:
 *     1. DICE ROLLING: Parse a dice expression (e.g., "2d6 + 4"), roll the dice using the
 *        provided (or default) RNG, and compute the natural total.
 *
 *     2. SITUATIONAL BONUS EVALUATION: Read `situationalModifiers` from the pipeline,
 *        compare each modifier's `situationalContext` tag against `RollContext.targetTags`,
 *        and add matching bonuses to the result. This is what makes "+2 vs Orcs" work.
 *
 *     3. HOUSE RULE APPLICATION: Check `CampaignSettings.diceRules.explodingTwenties` to
 *        implement the exploding dice mechanic for d20 rolls.
 *
 *   INJECTABLE RNG:
 *     The function signature accepts an optional `rng` parameter:
 *       `rng?: (faces: number) => number`
 *     This allows unit tests (Phase 17.4) to inject a deterministic RNG that forces
 *     specific rolls (e.g., "force a 20 for the exploding dice test").
 *     In production, the default `Math.random()`-based RNG is used automatically.
 *
 *   DICE EXPRESSION FORMAT:
 *     The engine parses expressions like:
 *       "1d20 + 7"         → roll one d20, add constant 7
 *       "2d6 + 3"          → roll two d6, add 3
 *       "1d8"              → roll one d8, no constant
 *       "1d20"             → attack roll (triggers crit/fumble detection)
 *       "5"                → a constant (no dice), used for static modifiers
 *     Multiple dice groups are supported: "1d8 + 1d6 + 4" (e.g., sneak attack damage)
 *
 *   CRITICAL HIT / FUMBLE DETECTION:
 *     Only triggered for d20 rolls (attack rolls, saving throws, skill checks in some variants).
 *     - `isCriticalThreat`: true when the natural d20 roll equals or exceeds the weapon's
 *       crit range (tracked by the combat system, not this engine). The engine only checks
 *       for natural 20 as the default — the caller/UI handles crit range thresholds.
 *     - `isAutomaticHit`:  natural 20 on d20 is an automatic hit regardless of AC.
 *     - `isAutomaticMiss`: natural 1 on d20 is an automatic miss regardless of bonuses.
 *     For non-d20 rolls (damage, saves with flat modifiers), these are always false.
 *
 * @see src/lib/types/settings.ts  for CampaignSettings.diceRules
 * @see src/lib/types/pipeline.ts  for StatisticPipeline.situationalModifiers
 * @see ARCHITECTURE.md section 17 for the full specification
 */

import type { StatisticPipeline } from '../types/pipeline';
import type { CampaignSettings } from '../types/settings';

// =============================================================================
// ROLL CONTEXT — Target information for situational bonuses
// =============================================================================

/**
 * Context provided by the caller when initiating a dice roll.
 *
 * This is the bridge between the character sheet (which knows the static bonuses)
 * and the roll (which needs to know what/who is being targeted).
 *
 * WHY NOT STORED ON PIPELINE?
 *   Because `RollContext` data (target creature's tags) is ENTIRELY TRANSIENT.
 *   It only exists for the duration of one roll interaction. The character sheet
 *   doesn't "know" what it's attacking at rest — it only knows situational modifiers
 *   are available. The context is provided by the UI at roll time.
 *
 * @example Attacking an Orc Warrior:
 * ```typescript
 * const context: RollContext = {
 *   targetTags: ["orc", "giant", "evil"],
 *   isAttackOfOpportunity: false
 * };
 * ```
 *
 * @example Saving throw against an evil spell:
 * ```typescript
 * const context: RollContext = {
 *   targetTags: ["evil", "mind-affecting"],
 *   isAttackOfOpportunity: false
 * };
 * ```
 */
export interface RollContext {
  /**
   * The tags of the target entity for this roll.
   * Used to match against `Modifier.situationalContext` values.
   *
   * The engine does a simple inclusion check:
   * modifier.situationalContext is IN targetTags → apply the bonus.
   *
   * Example: modifier has `situationalContext: "orc"`.
   *   targetTags: ["orc", "evil"] → matches → bonus applies.
   *   targetTags: ["goblin", "evil"] → no match → bonus ignored.
   */
  targetTags: string[];

  /**
   * Whether this roll is for an Attack of Opportunity.
   * Some abilities (like Combat Reflexes) apply specific bonuses to AoO.
   * Modifiers with `situationalContext: "attack_of_opportunity"` match this.
   *
   * Note: This flag causes "attack_of_opportunity" to be added to the effective
   * target tags before matching. The engine appends it to `targetTags` internally.
   */
  isAttackOfOpportunity: boolean;
}

// =============================================================================
// ROLL RESULT — Complete structured result of a dice roll
// =============================================================================

/**
 * The complete, structured result of a single dice roll operation.
 *
 * WHY SO DETAILED?
 *   The DiceRollModal UI (Phase 9.2) displays a full breakdown:
 *     "Natural Roll: [17] + Static Bonus: +7 + Situational Bonus: +2 (vs Orcs) = Total: 26"
 *   The `numberOfExplosions` counter powers the "EXPLOSION x2!" celebration UI.
 *   The `isCriticalThreat`/`isAutomaticHit`/`isAutomaticMiss` flags power the crit confirmation flow.
 *
 * FORMULA:
 *   finalTotal = naturalTotal + staticBonus + situationalBonusApplied
 */
export interface RollResult {
  /**
   * The original dice expression that was parsed and rolled.
   * Stored for display in the roll history and breakdown modal.
   * Example: "1d20 + 7", "2d6 + 3"
   */
  formula: string;

  /**
   * Individual die results for each die rolled.
   * Example: for "2d6": [4, 3] (two separate d6 results)
   * For "1d20 + 5": [17] (the static bonus is NOT a die roll)
   * Multiple dice groups are flattened: "1d8 + 1d6" → [5, 3]
   */
  diceRolls: number[];

  /**
   * The sum of all dice rolls only, BEFORE adding static bonuses.
   * For "2d6" rolling [4,3]: naturalTotal = 7.
   * For exploding dice: includes all explosions summed.
   * Example: [20, 20, 14] → naturalTotal = 54 (with 2 explosions).
   */
  naturalTotal: number;

  /**
   * The static bonus from the pipeline's `totalBonus` (pre-computed on the sheet).
   * This is the fixed "+7" in "1d20 + 7" — it comes from the pipeline's net modifier.
   * Does NOT include situational bonuses (those are in `situationalBonusApplied`).
   */
  staticBonus: number;

  /**
   * The total bonus from all matching situational modifiers.
   * Added ONLY when the modifier's `situationalContext` matches a target tag.
   * Example: "+2 vs Orcs" with targetTags:["orc"] → situationalBonusApplied = 2.
   *
   * NOTE: Multiple situational modifiers can stack (they are `untyped` or declared
   * as stackable). The engine sums all matching ones.
   */
  situationalBonusApplied: number;

  /**
   * The grand total: naturalTotal + staticBonus + situationalBonusApplied.
   * This is the final number compared against AC or a DC.
   */
  finalTotal: number;

  /**
   * The number of times the exploding 20s mechanic triggered.
   * 0 = no explosions (normal roll, or house rule disabled).
   * 1 = one explosion (rolled 20, then rolled again).
   * 2 = two explosions (rolled 20 twice, then non-20).
   *
   * Used by the UI to display "💥 EXPLOSION x2!" celebration effects.
   * Also used by Phase 17.4 tests: assert numberOfExplosions === 2 for [20, 20, 5].
   */
  numberOfExplosions: number;

  /**
   * Whether the natural d20 roll(s) resulted in a critical threat.
   * Default interpretation: any result of 20+ on the natural d20 is a threat.
   * (The weapon's actual crit range is verified by the combat system.)
   * Only meaningful for d20 rolls. Always `false` for damage/saves.
   */
  isCriticalThreat: boolean;

  /**
   * Whether this roll is an automatic hit regardless of the target's AC.
   * True only when `naturalTotal >= 20` on a d20 roll (natural 20).
   * Note: With exploding 20s, the FIRST die must be 20 for this to be true.
   */
  isAutomaticHit: boolean;

  /**
   * Whether this roll is an automatic miss regardless of bonuses.
   * True only when first die result is 1 on a d20 roll (natural 1 = fumble).
   * Note: If exploding 20s are active and the first roll is 1, this is still a fumble.
   */
  isAutomaticMiss: boolean;
}

// =============================================================================
// DICE EXPRESSION PARSER
// =============================================================================

/**
 * Represents a parsed component of a dice expression.
 * Examples from parsing "2d6 + 1d8 + 5":
 *   { count: 2, faces: 6, constant: 0 }
 *   { count: 1, faces: 8, constant: 0 }
 *   { count: 0, faces: 0, constant: 5 }
 */
interface DiceGroup {
  count: number;   // Number of dice (0 = constant only)
  faces: number;   // Faces per die (0 = constant only)
  constant: number; // Additional constant for this group
  sign: 1 | -1;  // Positive or negative group (e.g., "- 1d4" is sign=-1)
}

/**
 * Parses a dice expression string into structured groups.
 *
 * Supports:
 *   - "1d20"          → [{count:1, faces:20, constant:0, sign:1}]
 *   - "2d6 + 3"       → [{count:2, faces:6, constant:0, sign:1}, {count:0, faces:0, constant:3, sign:1}]
 *   - "1d8 + 1d6 + 4" → [{count:1, faces:8,...}, {count:1, faces:6,...}, {count:0, faces:0, constant:4,...}]
 *   - "5"             → [{count:0, faces:0, constant:5, sign:1}]
 *
 * @param formula - The dice expression string to parse.
 * @returns Array of parsed dice groups.
 */
function parseDiceExpression(formula: string): DiceGroup[] {
  const groups: DiceGroup[] = [];
  // Split into tokens by + and - while keeping the sign
  // Normalise whitespace and handle "-" at start
  const normalised = formula.replace(/\s+/g, '').replace(/^([+-])/, '0$1');

  // Split by + and - but keep delimiters as part of subsequent tokens
  const parts = normalised.split(/(?=[+-])/);

  for (const part of parts) {
    if (!part) continue;

    const sign: 1 | -1 = part.startsWith('-') ? -1 : 1;
    const cleanPart = part.replace(/^[+-]/, '');

    // Check for dice notation: <count>d<faces>
    const diceMatch = cleanPart.match(/^(\d+)d(\d+)$/i);
    if (diceMatch) {
      groups.push({
        count: parseInt(diceMatch[1], 10),
        faces: parseInt(diceMatch[2], 10),
        constant: 0,
        sign,
      });
      continue;
    }

    // Check for a pure number constant
    const numberMatch = cleanPart.match(/^(\d+(?:\.\d+)?)$/);
    if (numberMatch) {
      groups.push({
        count: 0,
        faces: 0,
        constant: parseFloat(numberMatch[1]),
        sign,
      });
      continue;
    }

    // Unknown token — log warning and skip
    console.warn(`[DiceEngine] Could not parse dice expression token: "${part}" in formula "${formula}". Skipping.`);
  }

  return groups;
}

// =============================================================================
// DEFAULT RNG
// =============================================================================

/**
 * The default random number generator.
 * Produces a random integer from 1 to `faces` (inclusive), simulating a real die.
 *
 * @param faces - The number of faces on the die (e.g., 6, 8, 20).
 * @returns A random integer from 1 to faces.
 */
function defaultRng(faces: number): number {
  return Math.floor(Math.random() * faces) + 1;
}

// =============================================================================
// MAIN ENTRY POINT — parseAndRoll
// =============================================================================

/**
 * Parses a compiled dice expression, rolls the dice, applies house rules,
 * evaluates situational bonuses, and returns a complete `RollResult`.
 *
 * This is THE primary interface to the dice system. Every roll in the game
 * (attack, damage, save, skill) goes through this function.
 *
 * CALL FLOW:
 *   1. Parse `formula` into DiceGroups.
 *   2. For each DiceGroup, roll the dice using `rng`.
 *      - If the group is d20 AND `settings.diceRules.explodingTwenties` is true:
 *        Implement the explosion loop: while (lastRoll === 20) { roll again; add to total; }
 *      - Track individual rolls in `diceRolls`.
 *   3. Compute `naturalTotal` = sum of all dice rolls (no constants yet).
 *   4. Compute `staticBonus` = pipeline's `totalBonus` attribute.
 *      (The formula already has the bonus baked in for attack rolls like "1d20 + 7",
 *       BUT for skill checks the pipeline's totalBonus is passed separately as staticBonus.
 *       Callers should pass the formula with or without the static bonus based on context.)
 *   5. Build the effective targetTags: RollContext.targetTags + ["attack_of_opportunity"] if AoO.
 *   6. Evaluate pipeline.situationalModifiers against effective targetTags.
 *      Sum all matching modifiers into `situationalBonusApplied`.
 *   7. Add all constant groups to `naturalTotal`.
 *   8. Compute `finalTotal` = naturalTotal + staticBonus + situationalBonusApplied.
 *      (Note: if the formula already includes the static bonus as "+7", don't double-count.
 *       The convention: pass staticBonus=0 when the formula already includes it,
 *       or pass the pipeline's totalBonus separately to the formula "1d20" as staticBonus.)
 *   9. Detect crits/fumbles for d20 groups.
 *
 * FORMULA CONVENTION:
 *   For ATTACK ROLLS: Pass formula = "1d20" + staticBonus = pipeline.totalBonus.
 *   For DAMAGE:       Pass formula = "1d8" + staticBonus = 0 (damage dice only).
 *   For SAVES/SKILLS: Pass formula = "1d20" + staticBonus = save.totalValue.
 *
 * @param formula     - The dice expression. Examples: "1d20", "2d6 + 3", "1d8 + 1d6"
 * @param pipeline    - The relevant pipeline (used for staticBonus and situationalModifiers).
 * @param context     - Roll context: target tags and action type for situational matching.
 * @param settings    - Campaign settings (explodingTwenties, etc.).
 * @param rng         - Optional injectable RNG for testing. Default: Math.random-based.
 * @returns A fully structured `RollResult`.
 */
export function parseAndRoll(
  formula: string,
  pipeline: StatisticPipeline,
  context: RollContext,
  settings: CampaignSettings,
  rng: (faces: number) => number = defaultRng
): RollResult {
  const groups = parseDiceExpression(formula);

  const diceRolls: number[] = [];
  let naturalTotal = 0;
  let numberOfExplosions = 0;
  let isD20Roll = false;
  // -- firstD20Roll: tracks the first individual d20 roll for crit/fumble detection.
  //
  // WHY INITIALIZED TO 0?
  //   0 is used as a sentinel value meaning "no d20 has been rolled yet".
  //   After the loop, if isD20Roll is true but firstD20Roll is still 0, the condition
  //   `firstD20Roll === 0 && naturalTotal >= 20` handles this edge case.
  //
  // EDGE CASE: Formula with numeric constant BEFORE a d20 group (e.g., "5 + 1d20").
  //   Constants are added to `naturalTotal` first (group.count === 0 branch),
  //   then the d20 group is processed. `firstD20Roll` is only set on the FIRST d20
  //   die roll (`i === 0 && diceRolls.length === 1`). This check ensures we capture
  //   only the first d20 result, NOT any subsequent die type results.
  //   In practice, formulas like "5 + 1d20" are uncommon — the convention is
  //   "1d20" (raw) + static bonus via pipeline.totalBonus. Low-risk in real usage.
  let firstD20Roll = 0;

  // --- Step 1: Roll all dice groups ---
  for (const group of groups) {
    if (group.count === 0) {
      // Pure constant — added to naturalTotal directly
      naturalTotal += group.sign * group.constant;
      continue;
    }

    // Determine if this is a d20 group (for crit/fumble/explosion checks)
    const isD20Group = group.faces === 20;
    if (isD20Group) isD20Roll = true;

    for (let i = 0; i < group.count; i++) {
      let roll = rng(group.faces);
      diceRolls.push(roll);
      naturalTotal += group.sign * roll;

      // Track first d20 roll for crit/fumble detection
      if (isD20Group && i === 0 && diceRolls.length === 1) {
        firstD20Roll = roll;
      }

      // --- Exploding 20s mechanic (only on d20 rolls) ---
      // D&D 3.5 house rule: when you roll a natural 20 on a d20, roll again and ADD the result.
      // If that is also a 20, roll yet again. Continue until the result is not 20.
      // Each repeated 20 increments `numberOfExplosions`.
      if (isD20Group && settings.diceRules.explodingTwenties) {
        while (roll === 20) {
          roll = rng(group.faces);
          diceRolls.push(roll);
          naturalTotal += group.sign * roll;
          numberOfExplosions++;
        }
      }
    }
  }

  // --- Step 2: Determine static bonus from pipeline ---
  // The `pipeline.totalBonus` is the sum of active (non-situational) modifiers.
  // This represents the character's permanent bonus to this type of roll.
  const staticBonus = pipeline.totalBonus;

  // --- Step 3: Evaluate situational modifiers ---
  // Build the effective target tags: start with the roll context tags,
  // then add "attack_of_opportunity" if the AoO flag is set.
  const effectiveTargetTags = [...context.targetTags];
  if (context.isAttackOfOpportunity) {
    effectiveTargetTags.push('attack_of_opportunity');
  }

  // Filter and sum all situational modifiers that match the target context.
  // The matching rule: modifier.situationalContext is CONTAINED IN effectiveTargetTags.
  // We sum all matching modifiers (they are effectively "untyped" situational bonuses).
  let situationalBonusApplied = 0;
  for (const mod of pipeline.situationalModifiers) {
    if (mod.situationalContext && effectiveTargetTags.includes(mod.situationalContext)) {
      // The modifier's value may be a formula — for situational modifiers, we assume
      // the GameEngine has pre-resolved string formulas to numbers before storing.
      // If somehow a string appears here, we parse it as a float (defaulting to 0).
      const modValue = typeof mod.value === 'number' ? mod.value : parseFloat(String(mod.value)) || 0;
      situationalBonusApplied += modValue;
    }
  }

  // --- Step 4: Compute final total ---
  const finalTotal = naturalTotal + staticBonus + situationalBonusApplied;

  // --- Step 5: Detect crits and fumbles (d20 only) ---
  // Natural 20: automatic hit and critical threat.
  // Natural 1:  automatic miss (fumble).
  // For exploding 20s: the FIRST die result determines the crit/fumble status.
  const isCriticalThreat = isD20Roll && (firstD20Roll === 20 || (firstD20Roll === 0 && naturalTotal >= 20));
  const isAutomaticHit = isCriticalThreat;
  const isAutomaticMiss = isD20Roll && firstD20Roll === 1;

  return {
    formula,
    diceRolls,
    naturalTotal,
    staticBonus,
    situationalBonusApplied,
    finalTotal,
    numberOfExplosions,
    isCriticalThreat,
    isAutomaticHit,
    isAutomaticMiss,
  };
}

// =============================================================================
// STAT GENERATION: 4d6 DROP LOWEST
// =============================================================================

/**
 * Generates one ability score using the 4d6-drop-lowest method.
 *
 * D&D 3.5 standard: roll 4d6, discard the lowest die, sum the remaining 3.
 *
 * With `rerollOnes = true` (house rule):
 *   Any die showing 1 is rerolled ONCE before dropping lowest.
 *   This house rule produces higher average ability scores and is common at gaming tables.
 *   Phase 17.4 tests verify this behavior with a mock RNG.
 *
 * @param rerollOnes - If true, reroll dice showing 1 once before evaluation.
 * @param rng        - Optional injectable RNG for testing. Default: Math.random-based.
 * @returns A single ability score value (3–18 range, skewed toward 8–15 with this method).
 */
export function rollAbilityScore(
  rerollOnes: boolean,
  rng: (faces: number) => number = defaultRng
): number {
  // Roll 4d6
  const rolls: number[] = [];
  for (let i = 0; i < 4; i++) {
    let roll = rng(6);
    // If reroll-ones house rule is active, reroll once if a 1 was rolled
    if (rerollOnes && roll === 1) {
      roll = rng(6);
    }
    rolls.push(roll);
  }

  // Sort ascending and drop the lowest (index 0)
  rolls.sort((a, b) => a - b);
  const [, ...top3] = rolls; // Drop the first (lowest) element

  return top3.reduce((sum, r) => sum + r, 0);
}

/**
 * Generates a full set of 6 ability scores for character creation.
 *
 * Standard D&D 3.5 character creation: roll 6 sets of 4d6-drop-lowest,
 * then assign each result to a desired ability score.
 *
 * @param rerollOnes - If true, apply the "reroll 1s" house rule (from CampaignSettings).
 * @param rng        - Optional injectable RNG for testing.
 * @returns An array of 6 ability score values, unassigned (player assigns to stats).
 */
export function rollAllAbilityScores(
  rerollOnes: boolean,
  rng: (faces: number) => number = defaultRng
): [number, number, number, number, number, number] {
  return [
    rollAbilityScore(rerollOnes, rng),
    rollAbilityScore(rerollOnes, rng),
    rollAbilityScore(rerollOnes, rng),
    rollAbilityScore(rerollOnes, rng),
    rollAbilityScore(rerollOnes, rng),
    rollAbilityScore(rerollOnes, rng),
  ];
}
