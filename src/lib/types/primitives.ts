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
  | "base"             // Foundational value; accumulated per class level (ALWAYS STACKS)
  | "multiplier"       // Multiplicative factor applied after all additive bonuses
  | "untyped"          // Always stacks; no declared type (ALWAYS STACKS)
  | "racial"           // Racial trait bonus; non-stacking with other racial bonuses
  | "enhancement"      // Magic enhancement to an item or natural attribute; non-stacking
  | "morale"           // Morale bonus (courage spells, bard song); non-stacking
  | "luck"             // Luck bonus (divine favour, etc.); non-stacking
  | "insight"          // Insight bonus (divine power, oracle spells); non-stacking
  | "sacred"           // Holy/sacred bonus (divine magic); non-stacking
  | "profane"          // Unholy/profane penalty or bonus; non-stacking
  | "dodge"            // Dodge bonus; ALWAYS STACKS (explicit SRD exception)
  | "armor"            // Armour bonus (physical armour); non-stacking
  | "shield"           // Shield bonus (shields); non-stacking
  | "natural_armor"    // Natural armour bonus (racial hide, Barkskin); non-stacking
  | "deflection"       // Deflection bonus (Ring of Protection, Shield of Faith); non-stacking
  | "competence"       // Competence bonus (skills and checks, Guidance spell); non-stacking
  | "circumstance"     // Circumstance bonus; ALWAYS STACKS (explicit SRD exception)
  | "synergy"          // Skill-synergy bonus; ALWAYS STACKS (explicit SRD exception)
  | "size"             // Size modifier to attack rolls and AC; non-stacking
  | "inherent"         // Inherent bonus (from Tomes, Manuals, Wish, Miracle — permanent gains).
                       // STACKING RULES: Non-stacking within the same type (highest wins),
                       // but STACKS with enhancement and all other bonus types.
                       // D&D 3.5 SRD: A character may only benefit from a maximum +5 inherent
                       // bonus to any given ability score. Reading a second tome of the same
                       // stat only benefits the character if the new inherent bonus exceeds the
                       // existing one. The "highest wins" behavior of applyStackingRules()
                       // for non-stacking types correctly implements this rule automatically.
                       // CONTENT AUTHORING: Tome/Manual items use `consumable.isConsumable: true`.
                       // When consumed, they create a permanent (non-ephemeral) ActiveFeatureInstance
                       // whose grantedModifier has `type: "inherent"`. The player cannot remove
                       // this effect via "Expire" — it's a permanent character improvement.
                       // @see ARCHITECTURE.md section 4.10 — Inherent Bonus reference
  | "setAbsolute"      // Forces an absolute value; overrides everything on the pipeline
  | "damage_reduction" // D&D 3.5 DR — special stacking: BEST-WINS per bypass-tag group.
                       // Modifier.value = DR amount; Modifier.drBypassTags = material type.
                       // Use this for racial/innate/template DR. For class-progression
                       // incremental DR that ADDS, use "base" instead (it always stacks).
                       // @see Modifier.drBypassTags in pipeline.ts
                       // @see ARCHITECTURE.md section 4.5 — Damage Reduction reference
  | "resistance"       // Resistance bonus to saving throws (Cloak of Resistance, etc.).
                       // Non-stacking: only the highest resistance bonus to the same save applies.
                       // D&D 3.5 SRD: common on cloaks, rings, and class features.
                       // Example: Cloak of Resistance +3 + another resistance +2 → only +3 applies.
  | "max_dex_cap";     // Maximum-DEX-to-AC cap imposed by armor, shield, or conditions.
                       // MINIMUM-WINS STACKING: when multiple max_dex_cap modifiers are
                       // active simultaneously, the engine applies only the LOWEST value
                       // (most restrictive cap wins — a character wearing a tower shield AND
                       // heavy armor cannot exceed the lower of the two maxDex values).
                       //
                       // This type is meaningful ONLY on the `combatStats.max_dex_bonus`
                       // pipeline. The Phase 3 computation handles it specially: it collects
                       // all `max_dex_cap` modifiers, takes the minimum as the effective
                       // base for the pipeline, then applies any remaining modifiers
                       // (e.g., +2 from Mithral special material) on top normally.
                       //
                       // baseValue of `combatStats.max_dex_bonus` = 99 (no cap when
                       // no max_dex_cap modifier is active — unarmored character can apply
                       // full DEX modifier to AC). Mithral uses `type: "untyped"` (+2) on
                       // the same pipeline; that stacks AFTER the cap is established.
                       //
                       // CONTENT AUTHORING:
                       //   Armor: { type: "max_dex_cap", targetId: "combatStats.max_dex_bonus", value: 3 }
                       //   Mithral: { type: "untyped", targetId: "combatStats.max_dex_bonus", value: 2 }
                       //   Heavy Load condition: { type: "max_dex_cap", ... value: 1 }
                       //   Encumbrance (medium): { type: "max_dex_cap", ... value: 3 }
                       //
                       // @see ARCHITECTURE.md section 4.17 — Max DEX Bonus pipeline reference

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
