/**
 * @file primitives.ts
 * @description Fundamental scalar types used throughout the entire engine.
 *
 * These are the building blocks. Every other type in the codebase imports from here.
 * Keeping primitives in a single, isolated file ensures:
 *   1. Zero circular dependencies — this file has no imports of its own.
 *   2. A single place to evolve core type contracts (e.g., if ID becomes a branded type).
 *   3. Easy onboarding: any new developer reads this file first to understand the vocabulary.
 */

// =============================================================================
// IDENTITY
// =============================================================================

/**
 * A string identifier in kebab-case format.
 *
 * Convention: always use a category prefix to avoid collisions across the entire
 * data dictionary. Examples:
 *   - "stat_str"          → an attribute pipeline
 *   - "feat_power_attack" → a feat feature
 *   - "item_longsword"    → an equipment item
 *   - "skill_climb"       → a skill pipeline
 *   - "class_fighter"     → a class feature
 *   - "race_human"        → a race feature
 *
 * Using a plain `string` alias (rather than a branded type) keeps JSON
 * interoperability trivial while still serving as clear documentation intent.
 */
export type ID = string;

// =============================================================================
// MODIFIER TYPES — D&D 3.5 STACKING RULES
// =============================================================================

/**
 * The type of a bonus or penalty modifier.
 *
 * D&D 3.5 stacking rule (SRD p. 21):
 *   "In general, a bonus of the same type doesn't stack with itself."
 *   The key exceptions are:
 *     - `dodge`       : Multiple dodge bonuses always stack with each other.
 *     - `circumstance`: Multiple circumstance bonuses stack (and so do penalties).
 *     - `synergy`     : Explicit skill-synergy bonuses stack.
 *     - `untyped`     : Bonuses/penalties without a declared type always stack.
 *
 * For all other types (enhancement, morale, sacred, etc.), the engine retains
 * only the highest value among modifiers of the same type targeting the same
 * pipeline. See `stackingRules.ts` for the implementation.
 *
 * Special types:
 *   - `base`        : Defines the foundational value before external bonuses are
 *                     applied. Used primarily by class levelProgression to accumulate
 *                     BAB and Save base values per level.
 *   - `multiplier`  : Multiplies the pipeline total (e.g., × 1.5 for two-handed
 *                     strength damage). Applied after all additive bonuses.
 *   - `setAbsolute` : Forces the pipeline total to an exact value, ignoring base
 *                     and all other modifiers. Examples: Wild Shape (STR/DEX forced
 *                     to animal form values), Undead (CON set to 0), GM override
 *                     setting a monster's HP to exactly 200.
 *                     If multiple setAbsolute modifiers compete, the last one in the
 *                     resolution chain wins (see DataLoader resolution order).
 */
export type ModifierType =
  | "base"         // Foundational value; accumulated per class level
  | "multiplier"   // Multiplicative factor applied after all additive bonuses
  | "untyped"      // Always stacks; no declared type
  | "racial"       // Racial trait bonus; non-stacking with other racial bonuses
  | "enhancement"  // Magic enhancement to an item or natural attribute; non-stacking
  | "morale"       // Morale bonus (courage spells, bard song); non-stacking
  | "luck"         // Luck bonus (divine favour, etc.); non-stacking
  | "insight"      // Insight bonus (divine power, oracle spells); non-stacking
  | "sacred"       // Holy/sacred bonus (divine magic); non-stacking
  | "profane"      // Unholy/profane penalty or bonus; non-stacking
  | "dodge"        // Dodge bonus; ALWAYS STACKS (exception to general rule)
  | "armor"        // Armour bonus (physical armour); non-stacking
  | "shield"       // Shield bonus (shields); non-stacking
  | "natural_armor"// Natural armour bonus (racial hide, Barkskin spell); non-stacking
  | "deflection"   // Deflection bonus (Ring of Protection, Shield of Faith); non-stacking
  | "competence"   // Competence bonus (skills and checks, Guidance spell); non-stacking
  | "circumstance" // Circumstance bonus; ALWAYS STACKS (exception to general rule)
  | "synergy"      // Skill-synergy bonus; ALWAYS STACKS (exception to general rule)
  | "size"         // Size modifier to attack rolls and AC; non-stacking
  | "setAbsolute"; // Forces an absolute value; overrides everything on the pipeline

// =============================================================================
// LOGIC OPERATORS — PREREQUISITE & CONDITION SYSTEM
// =============================================================================

/**
 * Comparison and membership operators used by the Logic Engine.
 *
 * These are the leaf-level comparisons that `LogicNode` CONDITION nodes evaluate.
 * The engine resolves these against a resolved character context object at sheet
 * computation time (for prerequisites and conditional modifiers) or at dice-roll
 * time (for situational modifiers that check `@targetTags`).
 *
 * Operator semantics:
 *   - `"=="`           : Strict equality. Numeric or string comparison.
 *   - `">="`           : Greater-than-or-equal. Numeric comparison.
 *   - `"<="`           : Less-than-or-equal. Numeric comparison.
 *   - `"!="`           : Strict inequality.
 *   - `"includes"`     : The resolved array contains the given value.
 *                        Example: checking if "@activeTags" includes "feat_cleave".
 *   - `"not_includes"` : The resolved array does NOT contain the given value.
 *   - `"has_tag"`      : Alias for "includes" on tag arrays. Used exclusively with
 *                        `@activeTags` or `@targetTags` paths for semantic clarity.
 *   - `"missing_tag"`  : Alias for "not_includes" on tag arrays. Equivalent to
 *                        wrapping `has_tag` in a NOT node, but more readable in JSON.
 */
export type LogicOperator =
  | "=="
  | ">="
  | "<="
  | "!="
  | "includes"
  | "not_includes"
  | "has_tag"
  | "missing_tag";
