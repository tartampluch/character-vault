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
 *       crit range. The engine accepts an optional `critRange` parameter (e.g., "19-20",
 *       "18-20") and parses it to determine the minimum threat threshold. Defaults to "20"
 *       (only natural 20 is a threat) when `critRange` is not provided.
 *     - `isAutomaticHit`:  natural 20 on d20 is an automatic hit regardless of AC.
 *     - `isAutomaticMiss`: natural 1 on d20 is an automatic miss regardless of bonuses.
 *     For non-d20 rolls (damage, saves with flat modifiers), these are always false.
 *
 * @see src/lib/types/settings.ts  for CampaignSettings.diceRules
 * @see src/lib/types/pipeline.ts  for StatisticPipeline.situationalModifiers
 * @see ARCHITECTURE.md section 17 for the full specification
 */

import type { StatisticPipeline, Modifier } from '../types/pipeline';
import type { CampaignSettings } from '../types/settings';

// =============================================================================
// DAMAGE ROUTING — Vitality/Wound Points variant target pool enum
// =============================================================================

/**
 * Identifies which ResourcePool receives the damage from a roll result.
 *
 * STANDARD HP MODE (default):
 *   All damage routes to `"res_hp"` regardless of crit status.
 *
 * VITALITY/WOUND POINTS MODE (`settings.variantRules.vitalityWoundPoints === true`):
 *   Normal hits:   damage routes to `"res_vitality"`
 *   Critical hits: damage routes to `"res_wound_points"` (same amount, different pool)
 *   After vitality reaches 0: subsequent normal damage routes to `"res_wound_points"`
 *     (this overflow routing is handled by the Combat UI, not the dice engine)
 *
 * The dice engine always sets the INITIAL routing based on the roll outcome.
 * The Combat UI (Phase 10.1) may redirect routing if vitality is already at 0.
 *
 * @see RollResult.targetPool — the field on RollResult that carries this value
 * @see CampaignSettings.variantRules.vitalityWoundPoints — the flag that enables V/WP mode
 * @see ARCHITECTURE.md section 8.3 — Vitality/Wound Points variant documentation
 */
export type DamageTargetPool =
  /** Standard D&D 3.5: all damage to the main HP resource pool. Default. */
  | 'res_hp'
  /** V/WP variant: normal hits reduce Vitality Points (standard pool). */
  | 'res_vitality'
  /** V/WP variant: critical hits (and overflow when VP = 0) reduce Wound Points. */
  | 'res_wound_points';

// =============================================================================
// ON-CRIT DICE SPEC — Burst weapon data passed to parseAndRoll (Enhancement E-7)
// =============================================================================

/**
 * Specification for additional dice rolled only on a confirmed critical hit.
 * Mirrors `ItemFeature.weaponData.onCritDice` but exported for use at roll-call sites.
 *
 * The caller (combat UI) extracts this from the equipped weapon's `weaponData.onCritDice`
 * and passes it as the 9th argument to `parseAndRoll()` when rolling damage for a
 * confirmed critical hit.
 *
 * @see ItemFeature.weaponData.onCritDice — the source field on weapon definitions
 * @see RollResult.onCritDiceRolled — where the result is stored
 * @see ARCHITECTURE.md section 4.9 — On-Crit Burst Dice mechanic reference
 */
export interface OnCritDiceSpec {
  /** Base dice formula for a ×2 crit. E.g., "1d10" for Flaming Burst, "1d8" for Thundering. */
  baseDiceFormula: string;
  /** Damage type label (for display). E.g., "fire", "cold", "electricity", "sonic". */
  damageType: string;
  /**
   * When true, the count of base dice is multiplied by (critMultiplier - 1).
   * False = always roll `baseDiceFormula` exactly once, regardless of critMultiplier.
   */
  scalesWithCritMultiplier: boolean;
}

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

  /**
   * Optional flag indicating this is a damage roll for a CONFIRMED critical hit.
   *
   * PURPOSE — Two-Roll Combat Flow:
   *   In D&D 3.5, attack and damage are separate rolls:
   *     1. Attack roll → `isCriticalThreat` signals a threat (natural 20 or within critRange).
   *     2. Optional: confirmation roll (some tables require it).
   *     3. Damage roll → caller passes `isCriticalHit: true` if the crit was confirmed.
   *
   * ON A DAMAGE ROLL ("2d6", "1d8"), there is no d20, so `isCriticalThreat` is always `false`.
   * Setting `isCriticalHit: true` is the ONLY way to signal a confirmed critical for damage
   * pool routing in the Vitality/Wound Points variant.
   *
   * DAMAGE ROUTING IN V/WP MODE:
   *   - `isCriticalHit: true` → `targetPool = "res_wound_points"` (critical hit → wound pool)
   *   - `isCriticalHit: false` or absent → use `isCriticalThreat` from the roll itself.
   *     For non-d20 rolls, `isCriticalThreat` is false → `targetPool = "res_vitality"`.
   *
   * Ignored in standard HP mode (`variantRules.vitalityWoundPoints === false`).
   *
   * @default undefined (absent = check isCriticalThreat from the roll)
   * @see RollResult.targetPool — uses this to determine routing
   * @see ARCHITECTURE.md section 8.3 — Vitality/Wound Points combat flow
   */
  isCriticalHit?: boolean;
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

  /**
   * The resource pool ID that should receive the damage from this roll.
   *
   * STANDARD MODE (CampaignSettings.variantRules.vitalityWoundPoints === false):
   *   Always `"res_hp"`. The standard hit point pool takes all damage.
   *
   * VITALITY/WOUND POINTS MODE (variantRules.vitalityWoundPoints === true):
   *   `"res_vitality"`:     Normal hit — damage reduces Vitality Points.
   *   `"res_wound_points"`: Critical hit — damage reduces Wound Points directly.
   *
   *   The Combat UI uses this field to route the damage to the correct ResourcePool
   *   without needing to re-examine the crit flag after the fact.
   *
   *   NOTE: Vitality overflow (when VP hits 0 and further damage must go to wound
   *   points) is handled separately by the Combat UI after applying the damage.
   *   The dice engine only provides the INITIAL routing decision based on crit status.
   *
   * ONLY SET FOR DAMAGE ROLLS. For attack rolls, saves, and skill checks,
   * this field is `"res_hp"` as a reasonable default (it is ignored by the UI
   * for non-damage rolls).
   *
   * @see DamageTargetPool — the enum type for this field
   * @see CampaignSettings.variantRules.vitalityWoundPoints — the activating flag
   * @see ARCHITECTURE.md section 8.3 — Vitality/Wound Points variant documentation
   * @see ARCHITECTURE.md Phase 2.5b — task tracking
   */
  targetPool: DamageTargetPool;

  /**
   * Modifiers drawn from the DEFENDER's `attacker.*` active modifiers that were
   * applied to THIS roll (Enhancement E-5).
   *
   * CONTEXT:
   *   Some features (Ring of Elemental Command, supernatural auras) impose penalties
   *   on characters who ATTACK the feature owner, rather than on the owner themselves.
   *   At roll time, when an attacker targets the owner, the Dice Engine collects the
   *   defender's `attacker.*` modifiers (pre-filtered for the `situationalContext`)
   *   and applies them to the incoming attack roll.
   *
   * This field records which modifiers were applied, for transparent display in the
   * dice roll modal ("Air elemental: −1 to attack rolls while targeting ring wearer").
   *
   * EMPTY ARRAY when: no `attacker.*` modifiers exist on the defender, OR none match
   * the attacker's tag set.
   *
   * OPTIONAL: this field is absent on rolls that do not involve an attacker context
   * (e.g., saving throws, skill checks, initiative rolls).
   *
   * @see ARCHITECTURE.md section 4.6 — `attacker.*` target namespace
   * @see Modifier.targetId — the `"attacker."` prefix convention
   */
  attackerPenaltiesApplied?: Modifier[];

  /**
   * Result of on-crit burst dice (Enhancement E-7 — Flaming Burst, Icy Burst, etc.).
   *
   * D&D 3.5 SRD — "BURST" WEAPON ABILITIES:
   *   Flaming Burst / Icy Burst / Shocking Burst / Thundering weapons deal extra dice
   *   of elemental damage ONLY on a confirmed critical hit. The burst dice are NOT
   *   multiplied by the weapon's critMultiplier (they are a fixed extra, not a base roll
   *   that gets multiplied). They are in addition to the on-hit bonus damage (e.g., a
   *   Flaming Burst weapon deals 1d6 fire on every hit, PLUS 1d10 fire on a confirmed crit).
   *
   * SCALING WITH CRIT MULTIPLIER (SRD rule):
   *   When `scalesWithCritMultiplier: true` on the weapon's `onCritDice` spec:
   *     - ×2 (most weapons): +1d10 (or 1d8 for Thundering)
   *     - ×3 (greataxe, falchion): +2d10 (or 2d8)
   *     - ×4 (scythe, lance): +3d10 (or 3d8)
   *
   * FORTIFICATION INTERACTION:
   *   If `fortification.critNegated === true`, no on-crit dice are rolled.
   *   Fortification negates ALL crit effects, including burst damage.
   *
   * PRESENT when: `isConfirmedCrit === true` AND `weaponOnCritDice` parameter is provided
   *   AND (fortification did not negate the crit).
   * ABSENT for: non-critical hits, or when the weapon has no onCritDice spec.
   *
   * `totalAdded` is already included in `RollResult.finalTotal`.
   * The UI should display this separately for transparency (e.g., "burst: 7 fire damage on crit").
   *
   * @see ItemFeature.weaponData.onCritDice — the spec on the weapon definition
   * @see parseAndRoll() — 9th parameter: weaponOnCritDice
   * @see ARCHITECTURE.md section 4.9 — On-Crit Burst Dice mechanic
   */
  onCritDiceRolled?: {
    /** The actual dice formula that was rolled (e.g., "2d10" for a ×3 weapon). */
    formula: string;
    /** Individual die results from the burst roll. */
    rolls: number[];
    /** Sum of all burst dice. Already included in finalTotal. */
    totalAdded: number;
    /** Damage type of the burst (e.g., "fire", "cold", "electricity", "sonic"). */
    damageType: string;
  };

  /**
   * Result of the Fortification critical-negation roll (Enhancement E-6b).
   *
   * D&D 3.5 SRD — FORTIFICATION MECHANIC:
   *   When a critical hit or sneak attack is scored against a creature wearing
   *   armor or a shield with the Fortification special ability, there is a
   *   percentage chance that the crit is negated and damage is instead rolled
   *   normally (as a non-critical hit).
   *
   *   | Fortification Type | Negation Chance |
   *   |--------------------|-----------------|
   *   | Light              | 25%             |
   *   | Moderate           | 75%             |
   *   | Heavy              | 100%            |
   *
   * ROLL-TIME ALGORITHM (in parseAndRoll):
   *   1. Only evaluated when `isCriticalThreat === true` AND the crit is
   *      confirmed (see `isConfirmedCrit` logic).
   *   2. Reads `defenderFortificationPct` parameter (0 = no fortification).
   *   3. If pct > 0: rolls 1d100 using the same PRNG.
   *      - If 1d100 result <= pct → crit negated → `critNegatedByFortification: true`
   *        and `finalTotal` is re-computed as a normal (non-critical) damage roll.
   *      - If 1d100 result > pct  → crit stands → `critNegatedByFortification: false`
   *   4. The `fortificationRoll` records the raw 1d100 result for transparency.
   *
   * PRESENT only when `defenderFortificationPct > 0` AND `isCriticalThreat === true`.
   * ABSENT for non-critical rolls, or when the defender has no fortification.
   *
   * UI DISPLAY:
   *   The DiceRollModal should display, when present:
   *     "Fortification roll: 23 vs 25% → NEGATED" (green, crit cancelled)
   *     "Fortification roll: 63 vs 25% → CRITICAL STANDS" (red, crit confirmed)
   *
   * @see defenderFortificationPct — the 8th parameter of parseAndRoll()
   * @see ARCHITECTURE.md section 4.7 — Fortification mechanic reference
   */
  fortification?: {
    /** Raw 1d100 roll result (1–100). */
    roll: number;
    /** The fortification percentage checked against (from defenderFortificationPct). */
    pct: number;
    /**
     * True when the roll was <= pct, meaning the critical hit was negated.
     * When true, the damage in this RollResult was computed as a normal hit.
     * When false, the critical hit stands and damage uses the weapon's critMultiplier.
     */
    critNegated: boolean;
  };
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
 * Filters the defender's active modifiers for `attacker.*` entries, strips the
 * prefix, and returns the resolved bonus sum to apply to the attacker's roll.
 *
 * ENHANCEMENT E-5 — `attacker.*` modifier convention:
 *   A Feature on the *defender* can penalise *attackers* by setting a modifier's
 *   `targetId` to `"attacker.<pipeline>"` (e.g., `"attacker.combatStats.attack_bonus"`).
 *   The Dice Engine calls this helper at roll time, passes the defender's mods, and
 *   the result is added to the attacker's `finalTotal`.
 *
 * EXAMPLE:
 *   Defender has: `{ targetId: "attacker.combatStats.attack_bonus", value: -1, situationalContext: "vs_air_elementals" }`
 *   Attacker's targetTags includes `"air_elemental"` → mod applies → returns { totalBonus: -1, ... }.
 *
 * @param defenderMods   - Full active-modifier list from the defender's character.
 * @param targetTags     - The attacker's current tags (from `RollContext.targetTags`).
 * @param targetPipeline - The pipeline being rolled (e.g., `"combatStats.attack_bonus"`).
 *                         Only `attacker.*` mods whose stripped id matches this pipeline apply.
 * @returns `{ totalBonus, applied }` — the net bonus and the list of matched mods.
 * @internal Called inside `parseAndRoll` when `defenderAttackerMods` is provided.
 */
function resolveAttackerMods(
  defenderMods: Modifier[],
  targetTags: string[],
  targetPipeline: string,
): { totalBonus: number; applied: Modifier[] } {
  const ATTACKER_PREFIX = 'attacker.';
  let totalBonus = 0;
  const applied: Modifier[] = [];

  for (const mod of defenderMods) {
    // Only process `attacker.*` modifiers
    if (!mod.targetId.startsWith(ATTACKER_PREFIX)) continue;

    // Strip the prefix to get the effective pipeline target
    const strippedTarget = mod.targetId.slice(ATTACKER_PREFIX.length);

    // Only apply when the stripped target matches the pipeline being rolled
    if (strippedTarget !== targetPipeline) continue;

    // Apply situationalContext filtering: like regular situational mods,
    // the modifier only fires when the attacker has the matching tag.
    if (mod.situationalContext && !targetTags.includes(mod.situationalContext)) continue;

    const modValue = typeof mod.value === 'number'
      ? mod.value
      : parseFloat(String(mod.value)) || 0;

    totalBonus += modValue;
    applied.push(mod);
  }

  return { totalBonus, applied };
}

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
 * @param settings    - Campaign settings (explodingTwenties, variantRules, etc.).
 * @param rng         - Optional injectable RNG for testing. Default: Math.random-based.
 * @param critRange   - Optional weapon critical threat range string (e.g., "19-20", "18-20").
 *                      If provided, the engine parses it and uses it to determine `isCriticalThreat`.
 *                      If absent, defaults to "20" (natural 20 only, standard D&D 3.5 behavior).
 *                      This enables weapons like longswords (19-20) and scimitars (18-20) to
 *                      correctly flag critical threats without caller-side workarounds.
 * @param defenderAttackerMods - Optional. Active modifiers from the defender's character that
 *                      target the `attacker.*` namespace. Resolved via `resolveAttackerMods()`.
 *                      @see resolveAttackerMods — the internal helper that processes these.
 *                      @see ARCHITECTURE.md section 4.6 — `attacker.*` convention.
 * @param defenderFortificationPct - Optional. The defender's `combatStats.fortification.totalValue`
 *                      (0–100). When > 0 and a critical hit is confirmed, the engine rolls 1d100.
 *                      If the 1d100 result ≤ pct, the crit is negated (damage rolled normally).
 *                      Absent / 0 = no fortification check performed.
 *                      @see RollResult.fortification — result field carrying the roll detail.
 *                      @see ARCHITECTURE.md section 4.7 — Fortification mechanic reference.
 * @param weaponOnCritDice - Optional. The equipped weapon's `weaponData.onCritDice` spec.
 *                      When provided AND the crit is confirmed (and not negated by fortification):
 *                      extra dice are rolled and added to `finalTotal`.
 *                      @see OnCritDiceSpec — the type definition.
 *                      @see RollResult.onCritDiceRolled — result field.
 *                      @see ARCHITECTURE.md section 4.9 — On-Crit Burst Dice mechanic reference.
 * @param critMultiplier - Optional. The weapon's critical hit damage multiplier (2/3/4). Default: 2.
 *                      Required when `weaponOnCritDice.scalesWithCritMultiplier === true`.
 *                      Used to compute scaled burst dice: ×3 weapon → 2d10 instead of 1d10.
 * @returns A fully structured `RollResult` including `targetPool` for damage routing.
 */
export function parseAndRoll(
  formula: string,
  pipeline: StatisticPipeline,
  context: RollContext,
  settings: CampaignSettings,
  rng: (faces: number) => number = defaultRng,
  critRange: string = '20',
  defenderAttackerMods?: Modifier[],
  defenderFortificationPct: number = 0,
  weaponOnCritDice?: OnCritDiceSpec,
  critMultiplier: number = 2
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

  // --- Step 3b: Resolve attacker modifiers from the defender (Enhancement E-5) ---
  // When a defender has `attacker.*` modifiers (e.g., Ring of Elemental Command −1 penalty
  // on attackers from the associated plane), the combat system passes these via
  // `defenderAttackerMods`. The Dice Engine applies them to the attacker's roll here.
  //
  // The `targetPipeline` for attacker mod matching is inferred from the pipeline.id.
  // This ensures only mods targeting the rolled pipeline are applied
  // (e.g., an `attacker.combatStats.attack_bonus` mod won't wrongly apply to a damage roll).
  let attackerPenaltyTotal = 0;
  let attackerPenaltiesApplied: Modifier[] | undefined;
  if (defenderAttackerMods && defenderAttackerMods.length > 0) {
    const result = resolveAttackerMods(
      defenderAttackerMods,
      effectiveTargetTags,
      pipeline.id,
    );
    attackerPenaltyTotal = result.totalBonus;
    if (result.applied.length > 0) {
      attackerPenaltiesApplied = result.applied;
    }
  }

  // --- Step 4: Compute final total ---
  // Incorporates situational bonuses + attacker penalties (E-5).
  // Declared as `let` so on-crit burst dice (E-7, Step 6c) can add to it.
  let finalTotal = naturalTotal + staticBonus + situationalBonusApplied + attackerPenaltyTotal;

  // --- Step 5: Detect crits and fumbles (d20 only) ---
  // Parse the critRange string to determine the minimum roll for a critical threat.
  // Default critRange is "20" (only natural 20). Weapons like longswords use "19-20",
  // scimitars/keen weapons use "18-20". Format: "MIN-MAX" or just "MAX" (= MIN).
  // ARCHITECTURE.md section 17: isCriticalThreat is true when the natural d20 roll
  // equals or exceeds the weapon's critical threat range minimum.
  let critMin = 20; // Default: only natural 20 is a threat
  if (critRange.includes('-')) {
    const rangeParts = critRange.split('-');
    critMin = parseInt(rangeParts[0], 10) || 20;
  } else {
    critMin = parseInt(critRange, 10) || 20;
  }

  // Natural 20: always an automatic hit AND critical threat.
  // Natural [critMin..19]: critical threat but NOT automatic hit (per RAW only 20 auto-hits).
  // Natural 1: automatic miss (fumble).
  // For exploding 20s: the FIRST die result determines the crit/fumble status.
  const effectiveFirstRoll = firstD20Roll > 0 ? firstD20Roll : (isD20Roll ? naturalTotal : 0);
  const isCriticalThreat = isD20Roll && effectiveFirstRoll >= critMin;
  const isAutomaticHit = isD20Roll && effectiveFirstRoll >= 20;
  const isAutomaticMiss = isD20Roll && firstD20Roll === 1;

  // Use context.isCriticalHit if provided (damage roll for a confirmed crit).
  // Fall back to isCriticalThreat for simple cases (combined attack+damage rolls).
  const isConfirmedCrit = context.isCriticalHit ?? isCriticalThreat;

  // --- Step 6b: Fortification critical-negation check (Enhancement E-6b) ---
  //
  // D&D 3.5 SRD — FORTIFICATION (ARCHITECTURE.md section 4.7):
  //   Armor with the Fortification special ability gives the wearer a percentage
  //   chance to negate a confirmed critical hit or sneak attack. The 1d100 roll
  //   is made by the DEFENDER's combat system at the moment the crit is confirmed.
  //
  // ALGORITHM:
  //   1. Only runs when `isConfirmedCrit === true` AND `defenderFortificationPct > 0`.
  //   2. Roll 1d100 using the same injectable RNG (consistent with test seeding).
  //   3. If 1d100 result <= pct → crit is negated:
  //        - `isCriticalThreat` stays true (the attack was still a threatening roll)
  //        - `critNegated: true` in the fortification result field
  //        - `finalTotal` is NOT changed — this function computes the initial roll.
  //          The CALLER (DiceRollModal / combat system) is responsible for applying
  //          damage WITHOUT the crit multiplier when `fortification.critNegated === true`.
  //   4. If 1d100 result > pct → crit stands normally.
  //
  // WHY NOT CHANGE finalTotal HERE?
  //   The function doesn't know the weapon's critMultiplier — that's a combat system
  //   concern. The damage roll is a SEPARATE call. `critNegated` signals to the caller
  //   that the follow-up damage roll should use a normal (non-crit) multiplier.
  //   For combined attack+damage formulas (rare), the caller must interpret the flag.
  //
  // 1d100 IMPLEMENTATION NOTE:
  //   We use rng(100) which gives a uniform integer in [1, 100], matching the SRD
  //   "roll d%" convention.
  let fortificationResult: RollResult['fortification'] | undefined;
  if (isConfirmedCrit && defenderFortificationPct > 0) {
    const fortRoll = rng(100);
    fortificationResult = {
      roll: fortRoll,
      pct: defenderFortificationPct,
      critNegated: fortRoll <= defenderFortificationPct,
    };
  }

  // --- Step 6c: On-Crit Burst Dice (Enhancement E-7) ---
  //
  // D&D 3.5 SRD — BURST WEAPON ABILITIES (Flaming Burst, Icy Burst, Shocking Burst, Thundering):
  //   On a confirmed critical hit, burst weapons deal extra elemental / sonic dice.
  //   These extra dice are NOT multiplied by the weapon's critical multiplier — they
  //   are a flat addition on top of the critical damage.
  //
  //   The dice formula scales with crit multiplier (when `scalesWithCritMultiplier === true`):
  //     - ×2 crit (most weapons):  1 × baseDiceFormula  (e.g., 1d10 fire for Flaming Burst)
  //     - ×3 crit (battleaxe):     2 × baseDiceFormula  (e.g., 2d10 fire)
  //     - ×4 crit (scythe):        3 × baseDiceFormula  (e.g., 3d10 fire)
  //
  // FORTIFICATION INTERACTION:
  //   If Fortification negated the crit (`fortificationResult?.critNegated`), no burst
  //   dice are rolled. Fortification negates ALL crit effects including burst damage.
  //
  // ALGORITHM:
  //   1. Guard: only when `isEffectiveCrit` (confirmed AND not negated) and spec provided.
  //   2. Parse the baseDiceFormula to extract faces (e.g., "1d10" → faces=10, count=1).
  //   3. If scalesWithCritMultiplier: total dice count = (critMultiplier - 1).
  //      Otherwise: use the exact baseDiceFormula as-is.
  //   4. Roll each die using the same injectable RNG.
  //   5. Sum the rolls, add to `finalTotal`, store in `onCritDiceRolled`.
  //
  // NOTE: `finalTotal` is already computed above (Step 4). We mutate it here because
  // the burst dice ARE part of the total damage on a critical hit.
  let onCritDiceRolled: RollResult['onCritDiceRolled'] | undefined;

  // `isEffectiveCrit` is computed in Step 7 below. We define it here early for E-7:
  const isEffectiveCrit = isConfirmedCrit && !(fortificationResult?.critNegated);

  if (isEffectiveCrit && weaponOnCritDice) {
    const spec = weaponOnCritDice;

    // Parse the base formula to get die faces and base count
    // Format: "NdF" where N is optional (defaults to 1), F is die faces
    const match = spec.baseDiceFormula.match(/^(\d+)?d(\d+)$/i);
    if (match) {
      const baseDiceCount = parseInt(match[1] ?? '1', 10);
      const diceFaces = parseInt(match[2], 10);

      // Compute actual dice count — scale if needed
      const actualDiceCount = spec.scalesWithCritMultiplier
        ? baseDiceCount * Math.max(1, critMultiplier - 1)
        : baseDiceCount;

      // Build the actual formula string for display
      const actualFormula = `${actualDiceCount}d${diceFaces}`;

      // Roll the burst dice
      const burstRolls: number[] = [];
      let burstTotal = 0;
      for (let i = 0; i < actualDiceCount; i++) {
        const roll = rng(diceFaces);
        burstRolls.push(roll);
        burstTotal += roll;
      }

      // Add burst total to finalTotal (it IS part of the crit damage)
      finalTotal += burstTotal;

      onCritDiceRolled = {
        formula: actualFormula,
        rolls: burstRolls,
        totalAdded: burstTotal,
        damageType: spec.damageType,
      };
    }
    // If parse fails (malformed formula), skip silently — no crash
  }

  // --- Step 7: Determine damage target pool (Vitality/Wound Points variant) ---
  //
  // VITALITY/WOUND POINTS VARIANT (ARCHITECTURE.md section 8.3):
  //   When `settings.variantRules?.vitalityWoundPoints` is true, damage rolls are
  //   routed to different resource pools based on hit type:
  //     - Normal hit:   → res_vitality   (standard body resilience)
  //     - Critical hit: → res_wound_points (represents a telling blow bypassing VP)
  //
  //   In standard mode (flag false/absent), ALL damage routes to res_hp.
  //
  //   FORTIFICATION INTERACTION:
  //   If fortification negated the crit (`fortificationResult?.critNegated === true`),
  //   a crit-that-was-negated routes to `res_vitality` (treated as a normal hit),
  //   not `res_wound_points`. The negation is the whole point of fortification.
  //
  //   NOTE: This field is meaningful primarily for DAMAGE rolls. For attack rolls
  //   (and saves/skills), the targetPool is set but ignored by the Combat UI.
  //   The caller may pass `isCriticalHit: true` in the RollContext when a confirmed
  //   crit is being rolled for damage — this is a separate call from the attack roll.
  //   In practice: attack roll determines isCriticalThreat (+ confirmation in SRD),
  //   damage roll uses `context.isCriticalHit` (if present) for pool routing.
  //
  // @see DamageTargetPool — the enum type
  // @see ARCHITECTURE.md section 8.3 — full V/WP rules
  const isVWPMode = settings.variantRules?.vitalityWoundPoints === true;
  // isEffectiveCrit was already computed in Step 6c (on-crit burst dice).
  let targetPool: DamageTargetPool;
  if (!isVWPMode) {
    targetPool = 'res_hp';
  } else if (isEffectiveCrit) {
    targetPool = 'res_wound_points';
  } else {
    targetPool = 'res_vitality';
  }

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
    targetPool,
    // E-5: only include if attacker penalties were actually applied
    ...(attackerPenaltiesApplied ? { attackerPenaltiesApplied } : {}),
    // E-6b: only include if a fortification check was performed
    ...(fortificationResult ? { fortification: fortificationResult } : {}),
    // E-7: only include if on-crit burst dice were rolled
    ...(onCritDiceRolled ? { onCritDiceRolled } : {}),
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
