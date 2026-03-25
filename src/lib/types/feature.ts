/**
 * @file feature.ts
 * @description The Unified Feature Model — the central data block of the ECS architecture.
 *
 * Design philosophy:
 *   In this engine, EVERYTHING is a Feature. A race, a class level, a feat, a magic item,
 *   a spell, a condition (Blinded, Raging), and a monster type (Undead) are all Features.
 *   This radical unification means the engine has ONE code path to process all game content:
 *     1. Load the Feature's JSON.
 *     2. Check its prerequisites (`prerequisitesNode`).
 *     3. Apply its modifiers (`grantedModifiers`) to the relevant pipelines.
 *     4. Recursively activate any features it grants (`grantedFeatures`).
 *
 *   SPECIALIZATION via sub-types:
 *   The base `Feature` interface handles ~80% of all D&D 3.5 content. For the remaining
 *   20% that needs extra data (items need weight/slot, spells need school/components,
 *   psionics need augmentation rules), we use TypeScript interface extension:
 *     - `ItemFeature`    : Equipment, weapons, armour, magic items
 *     - `MagicFeature`   : Spells (arcane/divine) and psionic powers
 *
 *   THE MERGE SYSTEM:
 *   Every Feature optionally carries a `merge` field. When the DataLoader (Phase 4.2)
 *   encounters a Feature with the same `id` as an already-loaded Feature, it uses:
 *     - `merge: "replace"` (or absent): Full overwrite. The new entity replaces the old.
 *     - `merge: "partial"`: Additive merge. Arrays are appended (or deleted with `-prefix`),
 *       scalars are overwritten only if defined in the new entity.
 *   This system allows homebrew content to extend SRD content without duplicating it.
 *
 * @see ARCHITECTURE.md sections 5 and 18 for full design specification.
 * @see ANNEXES.md section A for complete JSON examples (classes, spells, items).
 */

import type { ID } from './primitives';
import type { LocalizedString } from './i18n';
import type { LogicNode } from './logic';
import type { Modifier, ResourcePool } from './pipeline';

// =============================================================================
// FEATURE CATEGORY
// =============================================================================

/**
 * All possible categories of Features in the engine.
 *
 * WHY CATEGORIES?
 *   Categories serve multiple purposes:
 *     1. The UI uses them to organise features into sections (Phase 8-13).
 *     2. The DataLoader uses them to filter features in `FeatureChoice.optionsQuery`.
 *     3. The GameEngine uses them for special handling (e.g., `class` features drive
 *        `levelProgression`; `item` features gate on equipment slots).
 *
 *   ZERO HARDCODING RULE: The engine never branches on category strings in core logic.
 *   Categories are metadata for routing and filtering only. The actual game mechanical
 *   differences between a "race" and a "feat" come purely from their data (their
 *   modifiers, prerequisites, and granted features).
 */
export type FeatureCategory =
  | 'race'           // Racial features (Human, Elf, Dwarf, etc.)
  | 'class'          // Class definitions with level progression
  | 'class_feature'  // Individual class abilities granted by level (Rage, Sneak Attack, etc.)
  | 'feat'           // Player-selected feats (Power Attack, Dodge, etc.)
  | 'deity'          // Deity choice (for Clerics/Paladins — grants domains, weapons)
  | 'domain'         // Cleric domains (granting spells and domain powers)
  | 'magic'          // Spells and psionic powers (specialised as MagicFeature)
  | 'item'           // Equipment, weapons, armour, magic items (specialised as ItemFeature)
  | 'condition'      // Status conditions (Blinded, Raging, Prone, Encumbered, etc.)
  | 'monster_type'   // Creature type (Undead, Dragon, Aberration — for monsters/NPCs)
  | 'environment';   // Environmental features (Extreme Heat, Underwater, Darkness, etc.)

// =============================================================================
// MERGE STRATEGY — Data Override System
// =============================================================================

/**
 * The merge strategy used by the DataLoader's Merge Engine when processing
 * a Feature with the same `id` as an already-loaded Feature.
 *
 * "replace" (default, also used when `merge` is absent):
 *   The new entity completely replaces the existing entity. All fields from the
 *   existing entity are discarded. Use this when creating a fundamentally different
 *   version of an existing rule (e.g., replacing the SRD Monk with a homebrew variant).
 *
 * "partial":
 *   The new entity is merged with the existing one field-by-field:
 *     - Arrays (tags, grantedFeatures, etc.): new items are APPENDED.
 *       Items prefixed with "-" are REMOVED from the existing array.
 *     - Scalars (label, description, etc.): only overwritten if defined in the new entity.
 *     - levelProgression: merged by level (same level = replace that level's entry).
 *     - prerequisitesNode: completely replaced if present (too complex to merge).
 *   Use this for additive extensions: adding a new tag, a new class level to an existing
 *   class, or adjusting a specific modifier without rewriting the whole feature.
 *
 * @see ARCHITECTURE.md section 18 for full Merge Engine specification.
 */
export type MergeStrategy = 'replace' | 'partial';

// =============================================================================
// FEATURE CHOICE — Player selection prompts
// =============================================================================

/**
 * Defines a player-facing choice associated with a Feature.
 *
 * Used for feats like Weapon Focus (choose a weapon type), Cleric domains
 * (choose 2 domains), Knowledge skills (choose a subcategory), etc.
 *
 * HOW IT WORKS:
 *   1. When a Feature with `choices` is activated, the UI (Phase 8.4) reads
 *      each `FeatureChoice` and renders a dropdown/selector.
 *   2. The player's selection is stored in `ActiveFeatureInstance.selections`
 *      as a `Record<choiceId, string[]>`.
 *   3. Conditional modifiers that reference `@selection.<choiceId>` are then
 *      resolved dynamically: the modifier only fires when the equipped weapon
 *      matches the player's chosen weapon type (for Weapon Focus, etc.).
 *
 * @example Weapon Focus feat choice:
 * ```json
 * {
 *   "choiceId": "weapon_choice",
 *   "label": { "en": "Choose a weapon", "fr": "Choisissez une arme" },
 *   "optionsQuery": "tag:weapon",
 *   "maxSelections": 1
 * }
 * ```
 *
 * @example Cleric domain choice:
 * ```json
 * {
 *   "choiceId": "domain_1",
 *   "label": { "en": "First Domain", "fr": "Premier domaine" },
 *   "optionsQuery": "category:domain",
 *   "maxSelections": 1
 * }
 * ```
 */
export interface FeatureChoice {
  /**
   * Stable identifier for this choice within the Feature.
   * Referenced by `ActiveFeatureInstance.selections` keys and by `@selection.<choiceId>`
   * paths in conditional modifier logic.
   */
  choiceId: ID;

  /**
   * Localized label displayed above the selector in the UI.
   */
  label: LocalizedString;

  /**
   * Declarative query string used by the DataLoader to fetch the available options.
   *
   * Supported formats:
   *   - `"tag:<tag_name>"`            : All Features with this tag in their tags array.
   *   - `"category:<category>"`       : All Features of this category.
   *   - `"tag:<tag1>+tag:<tag2>"`     : Intersection (must have both tags).
   *
   * Examples:
   *   - `"tag:domain"`                → Cleric domain selection
   *   - `"tag:weapon"`                → Weapon Focus weapon selection
   *   - `"category:feat"`             → Feat selection (e.g., for bonus feat choices)
   *   - `"tag:weapon+tag:martial"`    → Martial weapon selection (for weapon specialist)
   */
  optionsQuery: string;

  /**
   * Maximum number of selections the player can make for this choice.
   * Most choices are 1 (exclusive). Some allow multiple (e.g., some homebrew feats).
   */
  maxSelections: number;

  /**
   * Optional tag prefix for choice-derived sub-tags.
   *
   * WHY THIS EXISTS — THE PARAMETERIZED FEAT PREREQUISITE PROBLEM:
   *   Feats like Weapon Focus, Skill Focus, and Spell Focus are parameterized:
   *   the player picks a specific weapon/skill/school. These selections are stored
   *   in `ActiveFeatureInstance.selections` but are NOT reflected in `@activeTags`
   *   without this field. Consequently, a prerequisite like "requires Weapon Focus
   *   (longbow)" cannot be expressed — `has_tag "feat_weapon_focus"` passes for ANY
   *   weapon, not specifically longbow.
   *
   * HOW IT WORKS:
   *   When `choiceGrantedTagPrefix` is set on a `FeatureChoice`, the GameEngine
   *   (Phase 0 — `#computeActiveTags()`) inspects every `ActiveFeatureInstance`'s
   *   `selections` map for this `choiceId`. For each selected item ID, it emits
   *   a new active tag: `<choiceGrantedTagPrefix><selectedId>`.
   *
   *   This happens at the same phase as static tag collection, so the derived
   *   sub-tags are available to ALL prerequisitesNode and conditionNode evaluations.
   *
   * EXAMPLE — Weapon Focus (feat_weapon_focus):
   * ```json
   * {
   *   "choiceId": "weapon_choice",
   *   "optionsQuery": "tag:weapon",
   *   "maxSelections": 1,
   *   "choiceGrantedTagPrefix": "feat_weapon_focus_"
   * }
   * ```
   * Player selects `item_longbow` → engine emits `feat_weapon_focus_item_longbow`.
   * Arcane Archer can then require: `has_tag "feat_weapon_focus_item_longbow"`.
   *
   * EXAMPLE — Spell Focus (feat_spell_focus):
   * ```json
   * {
   *   "choiceId": "spell_school_choice",
   *   "optionsQuery": "tag:arcane_school",
   *   "maxSelections": 1,
   *   "choiceGrantedTagPrefix": "feat_spell_focus_"
   * }
   * ```
   * Player selects `arcane_school_conjuration` → emits `feat_spell_focus_arcane_school_conjuration`.
   * Thaumaturgist can then require: `has_tag "feat_spell_focus_arcane_school_conjuration"`.
   *
   * EXAMPLE — Skill Focus (feat_skill_focus):
   * Player selects `skill_spellcraft` → emits `feat_skill_focus_skill_spellcraft`.
   * Archmage can then require: `has_tag "feat_skill_focus_skill_spellcraft"`.
   *
   * MULTIPLE SELECTIONS (maxSelections > 1):
   *   All selected IDs emit tags. A character who selected multiple schools for
   *   Spell Focus (if the feat were multiselect) would get one sub-tag per school.
   *
   * NAMING CONVENTION:
   *   Prefix should end with `_` and mirror the feat's own ID for readability:
   *   `feat_weapon_focus_`, `feat_skill_focus_`, `feat_spell_focus_`.
   *
   * @see ARCHITECTURE.md section 5.3 — FeatureChoice and active tag derivation
   */
  choiceGrantedTagPrefix?: string;

  /**
   * Optional list of other `choiceId` values within the SAME Feature whose
   * selected value must be excluded from THIS choice's option list.
   *
   * USE CASE — Cleric domains:
   *   A cleric picks two domains. The same domain cannot be picked twice, and
   *   some combinations are mutually exclusive (alignment restrictions, deity
   *   requirements, etc.).
   *
   *   ```json
   *   { "choiceId": "domain_1", "excludedBy": ["domain_2"] }
   *   { "choiceId": "domain_2", "excludedBy": ["domain_1"] }
   *   ```
   *
   *   At render time the UI reads every sibling choice listed in `excludedBy`,
   *   looks up the player's current selection for each, and removes those option
   *   IDs from the current choice's `<select>`.  This prevents:
   *     - Picking the same domain twice (cross-reference both ways).
   *     - Domain combinations that are mutually exclusive (add only the
   *       incompatible sibling's choiceId where the restriction applies).
   *
   * IMPORTANT:
   *   To prevent picking the SAME option twice across two choices, list each
   *   choice's `choiceId` in the other choice's `excludedBy` array.
   *
   *   Additional per-option tag-based restrictions (alignment, deity) should be
   *   modelled via `prerequisitesNode` on the domain Feature itself and surfaced
   *   as disabled options in the UI (future work — current implementation removes
   *   the option entirely when it is selected in a sibling choice).
   */
  excludedBy?: ID[];
}

// =============================================================================
// LEVEL PROGRESSION — Class advancement table
// =============================================================================

/**
 * One entry in a class's level progression table.
 *
 * WHY INCREMENTS AND NOT TOTALS?
 *   Storing INCREMENTS per level (rather than the total BAB/Save at each level)
 *   makes multiclassing trivially additive:
 *     Fighter 5 / Wizard 3 BAB = sum(Fighter increments[1..5]) + sum(Wizard increments[1..3])
 *   If we stored totals, the engine would need to know "which level is the character
 *   in Fighter vs Wizard" and do subtraction. Increments are simply summed.
 *
 * SAVE INCREMENT CONVENTION (D&D 3.5 SRD):
 *   Good save:  +2 at level 1, then +1 for every even level (1,0,1,0,1...)
 *   Poor save:  +0 at level 1, then +1 every 3 levels (0,0,1,0,0,1...)
 *   These increments are stored in `grantedModifiers` with type `"base"`.
 *
 * BAB INCREMENT CONVENTION:
 *   Full BAB class (Fighter, Barbarian, etc.): +1 every level.
 *   3/4 BAB class (Cleric, Rogue, etc.):       +1 every 4/3 levels (0.75/level, floored).
 *   1/2 BAB class (Wizard, Sorcerer, etc.):    +1 every 2 levels.
 *   The increments in JSON are pre-computed: e.g., Fighter[1..3] = [1,1,1,1,1...]
 *   Wizard[1..4] = [0,1,0,1,0,1...] (increment at the appropriate levels).
 */
export interface LevelProgressionEntry {
  /**
   * The class level this entry applies to.
   * 1-indexed: level 1 is the first entry.
   */
  level: number;

  /**
   * Feature IDs granted at this level.
   *
   * Examples:
   *   - Fighter 1: ["class_feature_fighter_bonus_feat"]
   *   - Barbarian 1: ["class_feature_rage", "class_feature_fast_movement"]
   *   - Druid 1: ["class_feature_animal_companion", "class_feature_nature_sense"]
   *
   * The engine fetches each ID from the DataLoader and activates them as
   * `ActiveFeatureInstance`s linked to the character.
   */
  grantedFeatures: ID[];

  /**
   * Modifiers granted at this specific level increment.
   *
   * CRITICAL DESIGN: These are INCREMENT values, not cumulative totals.
   * The engine SUMS all `grantedModifiers` of type `"base"` from all entries
   * up to and including the character's current level in this class.
   *
   * Typical contents:
   *   - BAB increment (type: "base", targetId: "combatStats.base_attack_bonus", value: 1 or 0)
   *   - Fort save increment (type: "base", targetId: "saves.fortitude", value: 1 or 0)
   *   - Ref save increment (type: "base", targetId: "saves.reflex", value: 1 or 0)
   *   - Will save increment (type: "base", targetId: "saves.will", value: 1 or 0)
   *   - HP die (type: "base", targetId: "stat_max_hp", value: "d10" or formula)
   */
  grantedModifiers: Modifier[];
}

// =============================================================================
// RESOURCE POOL TEMPLATE — Charge/use pools scoped to item instances
// =============================================================================

/**
 * Declares a resource pool that is created per-instance when an item is equipped.
 *
 * WHY THIS EXISTS — INSTANCE-SCOPED CHARGES:
 *   Charged items (Ring of the Ram, wands, staves) have charges that belong to
 *   the SPECIFIC ITEM INSTANCE, not to the character. When the item is traded,
 *   its remaining charges travel with it.
 *
 *   This template is the STATIC SCHEMA on the Feature definition (written once
 *   in JSON by the content author). The RUNTIME STATE (current charge count)
 *   is stored in `ActiveFeatureInstance.itemResourcePools[poolId]`.
 *
 * LIFECYCLE:
 *   1. Content author adds `resourcePoolTemplates` to the Feature JSON.
 *   2. When the item is first equipped (added to activeFeatures), the engine
 *      calls `initItemResourcePools()` to create any missing pool entries
 *      in `ActiveFeatureInstance.itemResourcePools` using `defaultCurrent`.
 *   3. During play, charges are spent via `spendItemPoolCharge()`.
 *   4. Calendar/rest resets restore pools matching their `resetCondition`.
 *
 * @see ActiveFeatureInstance.itemResourcePools — the runtime state storage
 * @see GameEngine.initItemResourcePools()       — idempotent initialisation
 * @see ARCHITECTURE.md section 5.7              — full design documentation
 *
 * @example Ring of the Ram — 50 finite charges, never auto-refills:
 * ```json
 * {
 *   "poolId": "charges",
 *   "label": { "en": "Ram Charges", "fr": "Charges du bélier" },
 *   "maxPipelineId": "combatStats.ram_charges_max",
 *   "defaultCurrent": 50,
 *   "resetCondition": "never"
 * }
 * ```
 *
 * @example Ring of Spell Turning — 3 uses/day, resets at dawn:
 * ```json
 * {
 *   "poolId": "spell_turning_uses",
 *   "label": { "en": "Spell Turning (3/day)", "fr": "Renvoi des sorts (3/jour)" },
 *   "maxPipelineId": "combatStats.spell_turning_max",
 *   "defaultCurrent": 3,
 *   "resetCondition": "per_day"
 * }
 * ```
 */
export interface ResourcePoolTemplate {
  /**
   * Stable identifier for this pool within the item instance.
   * Referenced as the key in `ActiveFeatureInstance.itemResourcePools`.
   * Convention: short kebab-case noun ("charges", "spell_turning_uses", "daily_call").
   */
  poolId: string;

  /**
   * Localized display label for this pool.
   * Shown on the item card in the Inventory tab.
   * Example: { en: "Ram Charges", fr: "Charges du bélier" }
   */
  label: LocalizedString;

  /**
   * ID of the pipeline that computes the MAXIMUM allowed value.
   *
   * For most charged items this is a simple config pipeline set to a fixed number
   * (e.g., "combatStats.ram_charges_max" → totalValue = 50).
   * For scaling items it could depend on caster level or character level.
   */
  maxPipelineId: ID;

  /**
   * The starting current value when this pool is first initialised on an item instance.
   *
   * D&D 3.5 convention:
   *   - Newly created items start at maximum (defaultCurrent = max).
   *   - Found/looted items may have fewer charges — the GM sets
   *     `ActiveFeatureInstance.itemResourcePools[poolId]` directly.
   *
   * `initItemResourcePools()` uses this value ONLY for pools not yet present
   * in `itemResourcePools`. It never overwrites an existing (depleted) count.
   */
  defaultCurrent: number;

  /**
   * When and how this pool automatically resets.
   *
   * Shares the same union as `ResourcePool.resetCondition` (Phase 1.6 + E-1):
   *   - `"never"`:    Finite charges — Ring of the Ram, Three Wishes, wands.
   *   - `"per_day"`:  Resets at dawn — Ring of Djinni Calling (1/day).
   *   - `"per_week"`: Resets weekly  — Elemental Command chain lightning (1/week).
   *   - `"long_rest"`: Recovers on rest — unusual for items but possible.
   *   - `"encounter"`: Recovers per encounter — very rare for items.
   */
  resetCondition: ResourcePool['resetCondition'];

  /**
   * Amount restored per tick for `"per_turn"` or `"per_round"` reset conditions.
   * Rarely used on items but included for completeness with `ResourcePool.rechargeAmount`.
   * Accepts a number or a Math Parser formula string.
   */
  rechargeAmount?: number | string;
}

// =============================================================================
// ACTIVATION TIER — One option in a tiered variable-cost activation
// =============================================================================

/**
 * One option in a `Feature.activation.tieredResourceCosts` array.
 *
 * Represents a single power level the player can choose when activating an
 * ability that offers variable charge expenditure (e.g., Ring of the Ram).
 *
 * The player selects a tier at activation time. The engine:
 *   1. Validates the choice (tier index in bounds, pool has enough charges).
 *   2. Deducts `cost` from the pool identified by `targetPoolId`.
 *   3. Makes `grantedModifiers` available to the Dice Engine for the current
 *      roll, as transient context modifiers valid for this activation only.
 *
 * @see Feature.activation.tieredResourceCosts — parent field
 * @see GameEngine.activateWithTier()          — execution method
 * @see ARCHITECTURE.md section 5              — tiered activation specification
 */
export interface ActivationTier {
  /**
   * Localized label describing this power tier.
   * Displayed in the tier selector UI.
   * Example: { en: "2 Charges: 2d6 + bull rush +1", fr: "2 Charges : 2d6 + brise-adversaire +1" }
   */
  label: LocalizedString;

  /**
   * The ID of the pool to deduct charges from.
   * References a key in `ActiveFeatureInstance.itemResourcePools` (E-2)
   * OR a `Character.resources` pool ID for class-based tiered abilities.
   */
  targetPoolId: string;

  /**
   * Number of charges (or uses) to deduct when this tier is chosen.
   * Formula strings are supported for dynamic cost scaling:
   *   Example: `"floor(@classLevels.class_soulknife / 4)"` (unusual but valid).
   */
  cost: number | string;

  /**
   * Transient modifiers activated for this specific use of the ability.
   *
   * These modifiers are NOT permanently added to the character sheet. They
   * are only active for the CURRENT activation (the single attack, roll, or
   * effect triggered by choosing this tier). After the Dice Engine consumes them,
   * they are discarded.
   *
   * Use case: Tier 2 of Ring of the Ram grants +1 to the bull rush check.
   * The `grantedModifiers` here hold that +1. They are applied only to the
   * roll triggered by this activation.
   *
   * Empty array: the tier's effect is purely descriptive (handled by the UI
   * constructing the correct dice formula, e.g., "2d6" vs "1d6").
   */
  grantedModifiers: Modifier[];
}

// =============================================================================
// FEATURE — The central data block
// =============================================================================

/**
 * The base interface for ALL game content entities.
 *
 * Every race, class, feat, item, spell, condition, and monster type in the game
 * is a Feature. The engine processes them all identically. The only differences
 * come from their data content (modifiers, prerequisites, choices, etc.).
 *
 * CRITICAL FIELDS:
 *   - `ruleSource`: Every Feature MUST declare its origin. This is used by the
 *     DataLoader to filter features by `CampaignSettings.enabledRuleSources`.
 *     If a feature's ruleSource is not in the enabled list, it is ignored entirely.
 *
 *   - `merge`: The override strategy for the Data Override system. If absent,
 *     defaults to "replace". Set to "partial" for additive extensions.
 *
 *   - `levelProgression`: Only meaningful for `category: "class"` features.
 *     Defines the per-level grants of modifiers and sub-features.
 *
 *   - `forbiddenTags`: A list of tags that, if present in the character's active
 *     tags, will prevent this feature from contributing its modifiers (even if
 *     `isActive: true`). Example: a Druid's metal armour prohibition.
 *
 * @see ARCHITECTURE.md section 5 for full specification.
 */
export interface Feature {
  /**
   * Unique entity identifier in kebab-case.
   * Examples: "race_human", "class_fighter", "feat_power_attack", "item_longsword"
   * Must be unique across ALL features in all enabled rule sources.
   */
  id: ID;

  /**
   * The feature's category. Used for routing, filtering, and UI organisation.
   */
  category: FeatureCategory;

  /**
   * Localised display name.
   * Example: { en: "Power Attack", fr: "Attaque en puissance" }
   */
  label: LocalizedString;

  /**
   * Localised description text.
   * May contain `@`-path variables with pipe operators for dynamic values:
   *   Example: "Your speed increases to {@attributes.speed_land.totalValue|distance}."
   * The Math Parser resolves these when the description is displayed in the UI.
   */
  description: LocalizedString;

  /**
   * Array of tags on this feature.
   *
   * DUAL PURPOSE:
   *   1. Membership testing: `@activeTags` contains all tags from all active Features.
   *      Prerequisites can check `has_tag: "feat_power_attack"` against `@activeTags`.
   *   2. Routing: `optionsQuery: "tag:domain"` finds all Features with "domain" in tags.
   *
   * Convention: use the feature's own `id` as one of its tags (for prerequisite chains).
   * Example: feat "Power Attack" should have tag "feat_power_attack" so other feats
   * can declare "requires Power Attack" via `has_tag: "feat_power_attack"`.
   */
  tags: string[];

  /**
   * Optional list of tags that PROHIBIT this feature from applying its modifiers.
   *
   * If the character's `@activeTags` contains ANY of these forbidden tags, the
   * feature's `grantedModifiers` are suppressed (as if `isActive: false`).
   * The feature entry itself remains in `activeFeatures` (it is not removed).
   *
   * D&D 3.5 examples:
   *   - Druid's Wild Shape: forbiddenTags = ["metal_armor"] (cannot transform in metal armour)
   *   - Barbarian Rage: forbiddenTags = ["calm"] (some prestige class abilities suppress rage)
   *   - Monk AC Bonus: handled via a conditionNode on the modifier (not a forbiddenTag,
   *     because it's the modifier that's conditional, not the entire feature being forbidden)
   *
   * Key distinction: `forbiddenTags` suppresses ALL of the feature's modifiers.
   * A modifier's `conditionNode` suppresses only THAT specific modifier.
   */
  forbiddenTags?: string[];

  /**
   * Optional prerequisite logic tree for feature activation/selection.
   *
   * Evaluated by `logicEvaluator.ts` (Phase 2.3) at sheet time.
   * If the evaluation returns `false`, the feature is either:
   *   - Grayed out in feature selection UI (phase 11.4)
   *   - Not applied during the flattening phase (Phase 3.2 for passive prerequisites)
   *
   * Example: Feat "Cleave" requires STR 13+ AND Power Attack.
   * Example: Prestige class "Arcane Archer" requires BAB +6, Weapon Focus (longbow), etc.
   */
  prerequisitesNode?: LogicNode;

  /**
   * All modifiers this feature grants to character pipelines.
   *
   * These are the "payload" of the feature — the actual mechanical effects.
   * The engine flattens these from all active Features and resolves them
   * according to the stacking rules.
   *
   * Note: Modifiers can be conditional (via `conditionNode`) or situational
   * (via `situationalContext`). See `Modifier` interface for full details.
   */
  grantedModifiers: Modifier[];

  /**
   * IDs of other Features that this feature automatically activates.
   *
   * Used for:
   *   - Classes granting class features (Barbarian grants Rage, Fast Movement, etc.)
   *   - Races granting racial abilities (Human grants bonus feat slot)
   *   - Feats that are feat chains (one feat grants another)
   *   - Partial merge deletions: prefixing with "-" removes an ID during partial merge
   *     (e.g., `"-feat_wild_shape"` removes Wild Shape from a Druid variant)
   *
   * NOTE ON `-prefix` in MERGE CONTEXT ONLY:
   *   When `merge: "partial"`, entries prefixed with "-" (e.g., "-feat_wild_shape")
   *   instruct the Merge Engine to REMOVE that ID from the base feature's array.
   *   At runtime (when the engine processes active features), the "-prefix" is
   *   NOT present — it is resolved during loading by the DataLoader.
   */
  grantedFeatures: ID[];

  /**
   * Optional player-facing choices associated with this feature.
   * See `FeatureChoice` for full documentation.
   */
  choices?: FeatureChoice[];

  /**
   * The rule source identifier this feature belongs to.
   *
   * MANDATORY FIELD. Every feature MUST declare its origin.
   *
   * Examples: "srd_core", "srd_psionics", "homebrew_darklands", "gm_override"
   *
   * Used by the DataLoader's filter:
   *   Only features whose `ruleSource` is included in
   *   `CampaignSettings.enabledRuleSources` are loaded for the character.
   *   Features from disabled sources are completely ignored.
   */
  ruleSource: ID;

  /**
   * The merge strategy for the Data Override system.
   *
   * If absent or `"replace"`: this feature completely replaces any previously
   *   loaded feature with the same `id`.
   * If `"partial"`: this feature is merged with the existing one using
   *   the partial merge rules (arrays appended, scalars overwritten if defined).
   *
   * @see MergeStrategy for full documentation.
   * @see ARCHITECTURE.md section 18 for the complete resolution chain.
   */
  merge?: MergeStrategy;

  /**
   * Level progression table for class features.
   *
   * ONLY used when `category === "class"`. Ignored for all other categories.
   *
   * The engine reads `character.classLevels[feature.id]` to determine how many
   * levels the character has in this class, then activates all entries up to
   * and including that level's `grantedFeatures` and `grantedModifiers`.
   *
   * @see LevelProgressionEntry for individual entry documentation.
   * @see ARCHITECTURE.md section 5.4 for multiclassing BAB/save resolution examples.
   */
  levelProgression?: LevelProgressionEntry[];

  /**
   * Recommended ability scores for this class, used by the Point Buy UI.
   *
   * ONLY used when `category === "class"`. Provides UX guidance during character creation:
   * the Point Buy modal (Phase 9.4) color-codes stats as green (recommended),
   * orange (useful), or red (dump stat) based on this field.
   *
   * Example for a Fighter: ["stat_strength", "stat_constitution", "stat_dexterity"]
   * Example for a Wizard:  ["stat_intelligence", "stat_dexterity", "stat_constitution"]
   *
   * This field has ZERO mechanical impact; it is purely cosmetic/UX guidance.
   */
  recommendedAttributes?: ID[];

  /**
   * List of skill IDs that are class skills for characters with this feature.
   *
   * USED BY: Any feature category (most commonly "class", but also "domain"
   * and "race" can declare class skills — e.g., Knowledge Domain adds all
   * Knowledge skills as class skills for Clerics with that domain).
   *
   * The engine unions `classSkills` arrays from ALL active Features (not just
   * class features) to determine the character's complete set of class skills.
   *
   * If a skill ID in this array does not exist in the config skill definitions
   * table, the engine logs a warning and ignores it (no crash on missing data).
   *
   * @see ARCHITECTURE.md section 5.5 for full documentation.
   */
  classSkills?: ID[];

  /**
   * Optional charge / use pools scoped to each individual instance of this item.
   *
   * Present ONLY on features that represent charged items (rings with X/day or
   * X/week abilities, wands, staves, rings with finite charges, etc.).
   * Absent (undefined) on all other features (races, classes, feats, spells, etc.).
   *
   * Each template declares ONE pool. Items with multiple independent charge pools
   * (e.g., a ring with both a daily ability AND a weekly ability) declare multiple
   * templates in this array.
   *
   * ENGINE CONTRACT:
   *   When an item Feature is added to a character's `activeFeatures`, the engine
   *   calls `initItemResourcePools(instance, feature)` to create `itemResourcePools`
   *   entries for any templates not yet present. This is idempotent — a second call
   *   on the same instance adds only NEW pools, never resets existing ones.
   *
   * @see ResourcePoolTemplate — the template interface
   * @see ActiveFeatureInstance.itemResourcePools — the per-instance runtime state
   * @see GameEngine.initItemResourcePools() — initialisation method
   * @see ARCHITECTURE.md section 5.7 — full design documentation
   */
  resourcePoolTemplates?: ResourcePoolTemplate[];

  /**
   * Optional activation data for active abilities (Ex/Su/Sp).
   *
   * Presence of this field indicates the feature requires an action to use
   * (Standard Action, Move Action, etc.) and may consume resources.
   *
   * Used by the Special Abilities panel (Phase 12.4) to display the activation
   * buttons and resource cost indicators.
   */
  activation?: {
    /** The action economy cost to activate this ability. */
    actionType:
      | 'standard'
      | 'move'
      | 'swift'
      | 'immediate'
      | 'free'
      | 'full_round'
      | 'minutes'
      | 'hours'
      | 'passive'    // Always active, no player action required (Enhancement E-4)
      | 'reaction';  // Fires automatically in response to a trigger event (Enhancement E-4)

    /**
     * Optional resource consumed when this ability is activated.
     * `targetId` references a `ResourcePool.id` (e.g., "resources.turn_undead").
     * `cost` is the amount consumed per activation (number or formula string).
     *
     * Mutually exclusive with `tieredResourceCosts` — specify one or the other,
     * not both. If both are present, `tieredResourceCosts` takes precedence.
     */
    resourceCost?: {
      targetId: ID;
      cost: number | string;
    };

    /**
     * Optional tiered resource costs for variable-spend abilities.
     *
     * WHY THIS EXISTS — THE VARIABLE-CHARGE PROBLEM:
     *   Some abilities (Ring of the Ram, many Rods and Staves in D&D 3.5) allow the
     *   player to choose HOW MANY charges to spend. More charges = stronger effect.
     *
     *   Example — Ring of the Ram:
     *     Spend 1 charge → 1d6 damage, no bonus on bull rush.
     *     Spend 2 charges → 2d6 damage, +1 on bull rush.
     *     Spend 3 charges → 3d6 damage, +2 on bull rush.
     *
     *   The standard `resourceCost` field cannot represent this because the cost
     *   is not fixed. The player must choose a tier at activation time.
     *
     * HOW IT WORKS:
     *   1. The UI (Special Abilities panel / Inventory item card) reads `tieredResourceCosts`
     *      and renders a tier selector ("1 charge / 2 charges / 3 charges").
     *   2. The player selects a tier.
     *   3. The engine calls `activateWithTier(instanceId, poolId, tierIndex)`:
     *      a. Validates the selected tier index is within bounds.
     *      b. Checks the pool has enough charges (pools identified by
     *         `tieredResourceCosts[i].targetPoolId`).
     *      c. Deducts the tier's `cost` from the pool.
     *      d. Makes the tier's `grantedModifiers` available to the Dice Engine
     *         for the current roll context.
     *
     * RELATIONSHIP TO `resourceCost`:
     *   Use `resourceCost` for fixed-cost abilities (one cost, always the same).
     *   Use `tieredResourceCosts` when the player has a choice of power level.
     *   Do NOT set both on the same activation — the engine ignores `resourceCost`
     *   when `tieredResourceCosts` is present.
     *
     * @see ARCHITECTURE.md section 5 — activation.tieredResourceCosts
     * @see GameEngine.activateWithTier() — the execution method
     *
     * @example Ring of the Ram activation tiers:
     * ```json
     * "tieredResourceCosts": [
     *   {
     *     "label": { "en": "1 Charge: 1d6 damage", "fr": "1 Charge : 1d6 dégâts" },
     *     "targetPoolId": "charges",
     *     "cost": 1,
     *     "grantedModifiers": [
     *       { "id": "ram_1_dmg", "sourceId": "item_ring_ram", "targetId": "combatStats.attack_bonus",
     *         "value": 0, "type": "untyped", "sourceName": { "en": "Ram 1 charge" } }
     *     ]
     *   },
     *   {
     *     "label": { "en": "2 Charges: 2d6 + bull rush +1", "fr": "2 Charges : 2d6 + brise-adversaire +1" },
     *     "targetPoolId": "charges",
     *     "cost": 2,
     *     "grantedModifiers": []
     *   },
     *   {
     *     "label": { "en": "3 Charges: 3d6 + bull rush +2", "fr": "3 Charges : 3d6 + brise-adversaire +2" },
     *     "targetPoolId": "charges",
     *     "cost": 3,
     *     "grantedModifiers": []
     *   }
     * ]
     * ```
     */
    tieredResourceCosts?: ActivationTier[];

    /**
     * Optional trigger event identifier for `"reaction"` action types.
     *
     * Only meaningful when `actionType === "reaction"`. Indicates the in-world
     * event that automatically fires this ability. The combat tracker / event
     * system reads this field to know when to invoke the reaction.
     *
     * STANDARD TRIGGER EVENTS:
     *   - `"on_fall"`:          Activates when the wearer falls > 5 feet.
     *                           (Ring of Feather Falling)
     *   - `"on_spell_targeted"`: Activates when a spell is cast at the wearer.
     *                           (Ring of Counterspells, Spell Turning)
     *   - `"on_damage_taken"`:  Activates after the wearer takes X damage.
     *   - `"on_attack_received"`: Activates when the wearer is attacked.
     *
     * Custom trigger event strings are allowed (open string for future extensibility).
     * The engine does not validate the string — it is used as a lookup key by
     * the combat event dispatcher.
     *
     * @see Enhancement E-4 — trigger-based activation full documentation
     */
    triggerEvent?: string;
  };

  /**
   * Optional action-economy budget this feature enforces when active.
   *
   * PURPOSE:
   *   Several D&D 3.5 conditions and status effects restrict what actions a
   *   character can take each round. Without this field, the engine can apply
   *   the condition's modifiers (penalties to attack, DEX, etc.) but has no
   *   machine-readable way to tell the Combat UI "this character may only take
   *   a single move action — no standard actions, no full-round actions".
   *
   *   `actionBudget` bridges that gap: when a condition Feature is active and
   *   has this field set, the Combat Turn UI reads it to enforce the restriction
   *   automatically — greying out illegal action buttons, showing a tooltip
   *   ("Staggered: only one standard OR move action per round"), and blocking
   *   full-round-action sequences.
   *
   * FIELD SEMANTICS:
   *   Each key represents a category of actions. Its value is the MAXIMUM NUMBER
   *   of that action type the character may take per round while this feature is
   *   active. `0` means the action is completely prohibited.
   *
   *   The budget is ADDITIVE across multiple active condition Features — if two
   *   conditions each grant `{ standard: 1 }`, the effective budget is `1` (the
   *   minimum of all active budgets for each category wins, not the sum).
   *   The Combat UI must take the MOST RESTRICTIVE value across all active
   *   condition Features.
   *
   *   Fields that are `undefined` (absent) mean "no restriction from this Feature
   *   on that action type". A feature with `actionBudget: {}` (empty object) also
   *   means no action restriction (it was defined but left intentionally empty).
   *
   * ACTION CATEGORIES (D&D 3.5):
   *   - `standard`:   Standard actions (attack, cast a spell, use a special ability, etc.)
   *   - `move`:       Move actions (move up to speed, draw weapon, stand up from prone, etc.)
   *   - `swift`:      Swift actions (once per turn; some class abilities)
   *   - `immediate`:  Immediate actions (once per round, even outside turn)
   *   - `free`:       Free actions (drop item, speak, etc.)
   *   - `full_round`: Full-round actions (full attack, run, charge, coup de grace, etc.)
   *
   * D&D 3.5 SRD Examples (conditionSummary.html):
   *
   *   STAGGERED / DISABLED — "may take a single move action or standard action
   *     each round (but not both, nor can she take full-round actions)":
   *     ```json
   *     "actionBudget": { "standard": 1, "move": 1, "full_round": 0 }
   *     ```
   *     NOTE: The "or" constraint (standard OR move, not both) is expressed by
   *     having both at 1 with `full_round: 0`. The Combat UI implements the
   *     "not both" rule by tracking whether any standard or move action has
   *     already been taken this turn and blocking the other if so.
   *
   *   NAUSEATED — "only action such a character can take is a single move action":
   *     ```json
   *     "actionBudget": { "standard": 0, "move": 1, "full_round": 0 }
   *     ```
   *
   *   STUNNED — "can't take actions":
   *     ```json
   *     "actionBudget": { "standard": 0, "move": 0, "swift": 0, "immediate": 0, "free": 0, "full_round": 0 }
   *     ```
   *
   *   COWERING / DAZED — "can take no actions":
   *     ```json
   *     "actionBudget": { "standard": 0, "move": 0, "full_round": 0 }
   *     ```
   *
   *   PARALYZED — "unable to move or act" (but CAN take purely mental actions,
   *     which are not physical actions — hence no `free: 0` to allow mental-only):
   *     ```json
   *     "actionBudget": { "standard": 0, "move": 0, "full_round": 0 }
   *     ```
   *
   * DESIGN NOTES:
   *   - `actionBudget` is meaningful on ANY Feature (condition, environment, spell
   *     effect), not just `category: "condition"`. A Slow spell effect or an
   *     environmental hazard could also restrict actions.
   *   - The field is intentionally NOT limited to condition Features. A metamagic
   *     feat or unusual racial ability could theoretically grant extra swift actions
   *     by setting `{ swift: 2 }`.
   *   - The Combat Tab UI (Phase 10) reads `character.activeFeatures` with `isActive: true`,
   *     finds all features with `actionBudget` set, and computes the effective budget
   *     per round as the minimum of each key across all active budgets.
   *
   * "STAGGERED/DISABLED XOR" SPECIAL CASE:
   *   The "standard OR move (not both)" rule is a soft constraint — neither action
   *   is individually prohibited, but the combination is. The budget declares the
   *   per-action cap (`standard: 1`, `move: 1`). The Combat UI is responsible for
   *   tracking which action type was spent first this turn and disabling the other.
   *   This is a UI concern, not a data model concern.
   *
   * UI CONTRACT (Phase 10.1 — Combat Tab):
   *   For each turn:
   *   1. Collect all active features with `actionBudget` defined.
   *   2. For each action category, take the MINIMUM value across all collected budgets
   *      (absent key = unlimited = ∞, treated as no restriction for that category).
   *   3. Enforce: disable action buttons whose category count has reached the budget.
   *   4. Show condition tooltip on disabled buttons listing the source condition name.
   *
   * NULL SAFETY:
   *   The Combat UI must handle `actionBudget: undefined` (most features) by treating
   *   all categories as unrestricted. It must NOT error on missing keys within the block.
   *
   * @see ARCHITECTURE.md section 5.6 — actionBudget field full reference
   * @see SRD: /srd/conditionSummary.html — Staggered, Disabled, Nauseated, Stunned
   */
  actionBudget?: {
    /** Maximum standard actions per round. 0 = prohibited. Default (absent) = unlimited. */
    standard?: number;
    /** Maximum move actions per round. 0 = prohibited. Default (absent) = unlimited. */
    move?: number;
    /** Maximum swift actions per round. 0 = prohibited. Default (absent) = unlimited. */
    swift?: number;
    /** Maximum immediate actions per round. 0 = prohibited. Default (absent) = unlimited. */
    immediate?: number;
    /** Maximum free actions per round. 0 = prohibited. Default (absent) = unlimited. */
    free?: number;
    /** Maximum full-round actions per round. 0 = prohibited. Default (absent) = unlimited. */
    full_round?: number;
  };
}

// =============================================================================
// ITEM FEATURE — Equipment, weapons, armour, magic items
// =============================================================================

/**
 * A Feature that represents physical equipment.
 *
 * Extends `Feature` with item-specific metadata:
 *   - Equipment slot (which body slot the item occupies)
 *   - Weight and cost (for encumbrance calculation and wealth tracking)
 *   - Weapon data (damage dice, crit range, damage type)
 *   - Armour data (armour bonus, max DEX, check penalty)
 *
 * HOW ITEMS WORK IN THE ENGINE:
 *   Items are stored in the character's `activeFeatures` list as
 *   `ActiveFeatureInstance` objects. The `isActive` flag determines if the item
 *   is "equipped" (contributing its modifiers to the pipelines) or just "carried"
 *   (contributing weight but not modifiers).
 *
 * TWO-HANDED WEAPONS:
 *   Items with `equipmentSlot: "two_hands"` require BOTH main_hand AND off_hand slots.
 *   The GameEngine (Phase 3) enforces this during slot validation (Phase 13.3).
 *   Two-handed weapons also typically allow 1.5× STR modifier to damage — this is
 *   handled via a modifier with `value: "floor(@attributes.stat_strength.derivedModifier * 1.5)"`.
 *
 * MAGIC ITEMS:
 *   A magic sword is just an ItemFeature with weapon data AND a `grantedModifiers`
 *   array containing the enhancement bonus. No special type needed.
 *   Example: Longsword +2 has weaponData.damageDice = "1d8" and a modifier
 *     { type: "enhancement", targetId: "combatStats.attack_bonus", value: 2 }.
 */
export interface ItemFeature extends Feature {
  category: 'item';

  /**
   * The equipment slot this item occupies on the character's body.
   *
   * `"none"`: The item has no slot (e.g., a rope, a torch, a gem). It can be carried
   *   in unlimited quantities (weight still counts for encumbrance).
   * `"two_hands"`: The item requires BOTH main_hand AND off_hand slots. The engine
   *   blocks equipping if either hand already holds something.
   *
   * Exotic races may gain extra slots via pipeline modifiers (e.g., "slots.ring" = 4
   * for a race with extra ring slots). The slot enforcement logic (Phase 13.3) reads
   * the current pipeline value, not a hardcoded constant.
   */
  equipmentSlot?:
    | 'head'
    | 'eyes'
    | 'neck'
    | 'torso'
    | 'body'
    | 'waist'
    | 'shoulders'
    | 'arms'
    | 'hands'
    | 'ring'
    | 'feet'
    | 'main_hand'
    | 'off_hand'
    | 'two_hands'
    | 'none';

  /**
   * Item weight in POUNDS (the SRD reference unit).
   * Always stored in pounds, regardless of the active display language.
   * The UI converts to kg for French display using `I18N_CONFIG.fr.weightMultiplier`.
   */
  weightLbs: number;

  /**
   * Item cost in GOLD PIECES (the SRD reference unit).
   * Always stored in GP. The UI can display in different currency if needed.
   */
  costGp: number;

  /**
   * Item hardness (how resistant to damage — used in item damage rules).
   * Optional: not all items need this (worn equipment usually doesn't).
   */
  hardness?: number;

  /**
   * Maximum hit points of the item (for targeted attacks or "Sunder" maneuver).
   * Optional: most items in normal play don't track HP.
   */
  hpMax?: number;

  /**
   * Whether this item is consumed (removed from inventory) when used.
   *
   * D&D 3.5 CONTEXT:
   *   Potions, oils, scrolls, and one-shot wands are "single-use" consumables.
   *   When a character drinks a potion, the item disappears from their inventory
   *   and its magical effect begins. The effect persists until it expires naturally
   *   or the player manually dismisses it via the "Expire" button.
   *
   * ENGINE CONTRACT — TWO-PHASE CONSUMPTION:
   *   When `consumable: true` and the player clicks "Use" on this item:
   *   1. `GameEngine.consumeItem(instanceId)` is called.
   *   2. The engine creates a NEW ephemeral `ActiveFeatureInstance` carrying the
   *      item's `grantedModifiers` (so the buff becomes active on the character).
   *   3. The source item instance is REMOVED from `activeFeatures` (consumed).
   *   4. The ephemeral instance appears in `EphemeralEffectsPanel` with an
   *      "Expire" button to end the effect early.
   *
   * OILS vs POTIONS:
   *   Both are consumable. Potions affect the drinker; oils affect an object.
   *   Mechanically, both follow the same consumption pattern in the engine.
   *   The distinction is purely descriptive (in `label` and `description`).
   *
   * NON-CONSUMABLE ITEMS:
   *   Rings, amulets, armour — set `consumable: false` or omit this field entirely.
   *   Charged items (Ring of the Ram, wand with 50 charges) use `resourcePoolTemplates`
   *   instead. They are NOT consumable — they deplete a charge pool but stay in inventory.
   *
   * POTION DURATION HINT:
   *   The human-readable duration (e.g., "3 minutes", "10 rounds") comes from the
   *   item's `description` field. The engine does NOT enforce duration mechanically;
   *   the player is trusted to expire the effect at the right time.
   *
   * `durationHint`:
   *   Optional short string displayed in the EphemeralEffectsPanel timer badge.
   *   Example: "3 min", "10 rounds", "1 hour"
   *
   * @see GameEngine.consumeItem() — the consumption handler
   * @see GameEngine.expireEffect() — removes an expired ephemeral instance
   * @see ActiveFeatureInstance.ephemeral — marks the generated effect instance
    * @see EphemeralEffectsPanel.svelte — the "Active Effects" UI panel
    */
   consumable?: {
    /** Whether this item is consumed on use (true for potions, oils, single-shot scrolls). */
    isConsumable: true;
    /**
     * Human-readable duration displayed in the EphemeralEffectsPanel badge.
     * Purely cosmetic — the engine does NOT auto-expire after this duration.
     * Examples: "3 min", "10 rounds", "1 hour", "until discharged"
     */
     durationHint?: string;
    };

   /**
    * Intelligent item personality data — present only on items imbued with sentience.
    *
    * D&D 3.5 SRD — INTELLIGENT ITEMS:
    *   "Magic items sometimes have intelligence of their own. Magically imbued with
    *   sentience, these items think and feel the same way characters do and should
    *   be treated as NPCs. Intelligent items have extra abilities and sometimes
    *   extraordinary powers and special purposes. Only permanent magic items (as
    *   opposed to single-use items or those with charges) can be intelligent."
    *
    * ENGINE CONTRACT:
    *   This is a METADATA block. It has NO effect on the DAG computation pipeline.
    *   All mechanical effects of intelligent item powers (spells 3/day, skill ranks,
    *   luck bonuses, etc.) are modelled using existing engine primitives:
    *   - Lesser/greater powers → `resourcePoolTemplates` (per_day) + `activation`
    *   - Dedicated powers → `conditionNode` + `resourcePoolTemplates`
    *   - Skill ranks → `grantedModifiers type:"competence"` with value 10
    *   - Alignment penalties (mismatched wielder) → `conditionNode` on alignment tag
    *
    *   `intelligentItemData` provides the GM layer with:
    *   - The item's INT/WIS/CHA ability scores (needed to compute languages, Ego)
    *   - The Ego score (pre-computed, used for dominance Will DC = Ego)
    *   - The alignment of the item (for personality conflict logic)
    *   - Communication mode (empathy, speech, telepathy)
    *   - Senses range and type (30-ft vision, darkvision 60 ft, blindsense)
    *   - Language list (Common + 1 per INT bonus)
    *   - Special purpose (if any) and dedicated power description
    *
    * EGO SCORE FORMULA (from SRD):
    *   Ego = (sum of all enhancement bonus points)
    *       + (1 per lesser power)
    *       + (2 per greater power)
    *       + (4 if special purpose + dedicated power)
    *       + (1 if telepathic)
    *       + (1 if read languages)
    *       + (1 if read magic)
    *       + (INT bonus)
    *       + (WIS bonus)
    *       + (CHA bonus)
    *   where ability bonus = (score - 10) / 2 (rounded down)
    *
    *   Content authors COMPUTE Ego from the item's total profile and store it here.
    *   The engine does NOT recompute it dynamically — the stored value is canonical.
    *
    * EGO-BASED DOMINANCE (GM-layer rule, not engine-computed):
    *   When personality conflict occurs: owner makes Will save DC = Ego score.
    *   - Success: owner is dominant for 1 day (or until critical situation).
    *   - Failure: item is dominant — demands concessions; may resist commands.
    *   This is handled by the GM using the stored Ego score. No engine pipeline needed.
    *
    * NEGATIVE LEVELS FOR MISALIGNED WIELDERS:
    *   Items with Ego 1-19: 1 negative level for misaligned possessor.
    *   Items with Ego 20-29: 2 negative levels.
    *   Items with Ego 30+:   3 negative levels.
    *   These are modelled via `grantedModifiers` with `conditionNode` checking if the
    *   character's alignment matches `intelligentItemData.alignment`.
    *
    * CONTENT AUTHORING EXAMPLE — Intelligent +2 Longsword (Lawful Good, Ego 6):
    *   ```json
    *   {
    *     "intelligentItemData": {
    *       "intelligenceScore": 12,
    *       "wisdomScore": 12,
    *       "charismaScore": 10,
    *       "egoScore": 6,
    *       "alignment": "lawful_good",
    *       "communication": "empathy",
    *       "senses": { "visionFt": 30, "darkvisionFt": 0, "blindsense": false },
    *       "languages": ["Common", "Celestial"],
    *       "lesserPowers": 2,
    *       "greaterPowers": 0,
    *       "specialPurpose": null,
    *       "dedicatedPower": null
    *     }
    *   }
    *   ```
    *
    * @see ARCHITECTURE.md section 4.16 — Intelligent Item Data contract
    */
   intelligentItemData?: {
     /** Intelligence score of the item (10–19 per SRD distribution table). */
     intelligenceScore: number;
     /** Wisdom score of the item (10–19 per SRD distribution table). */
     wisdomScore: number;
     /** Charisma score of the item (10–19 per SRD distribution table). */
     charismaScore: number;
     /**
      * Pre-computed Ego score (see formula in doc block above).
      * Used as the Will DC for dominance checks (GM layer).
      * Items with Ego 20+ always attempt dominance; 30+ grant 3 negative levels.
      */
     egoScore: number;
     /**
      * The item's alignment (determines personality, purpose, and wielder restrictions).
      * Kebab-case SRD alignment identifiers.
      */
     alignment: 'lawful_good' | 'lawful_neutral' | 'lawful_evil'
                | 'neutral_good' | 'true_neutral' | 'neutral_evil'
                | 'chaotic_good' | 'chaotic_neutral' | 'chaotic_evil';
     /**
      * How the item communicates with its wielder.
      * - `"empathy"`: urges and emotional impressions only (no actual words).
      * - `"speech"`: speaks Common plus INT-bonus languages.
      * - `"telepathy"`: projects thoughts directly into wielder's mind.
      */
     communication: 'empathy' | 'speech' | 'telepathy';
     /**
      * Senses of the item. Vision and darkvision are measured in feet (0 = absent).
      * Blindsense is a boolean — present at the highest intelligence tiers.
      */
     senses: {
       /** Normal vision range in feet (0, 30, 60, or 120). */
       visionFt: 0 | 30 | 60 | 120;
       /** Darkvision range in feet (0 or 60 or 120). */
       darkvisionFt: 0 | 60 | 120;
       /** Whether the item has blindsense (highest-tier intelligence items only). */
       blindsense: boolean;
     };
     /**
      * Languages the item speaks (and can read if speech or telepathy tier).
      * Always includes Common; additional languages equal to INT bonus.
      */
     languages: string[];
     /** Number of lesser powers (1–4). Each contributes 1 Ego point. */
     lesserPowers: number;
     /** Number of greater powers (0–3). Each contributes 2 Ego points. */
     greaterPowers: number;
     /**
      * The item's special purpose (from SRD special purpose table), or null.
      * When set, the item has a dedicated power that operates ONLY in pursuit of this purpose.
      * A special purpose + dedicated power contributes 4 Ego points.
      * Examples: "Defeat arcane spellcasters", "Defend elves", "Slay undead"
      */
     specialPurpose: string | null;
     /**
      * Description of the dedicated power (from SRD dedicated power table), or null.
      * Only set when `specialPurpose` is non-null.
      * Examples: "Cast lightning bolt 10d6", "+2 luck on all attacks/saves/checks"
      */
     dedicatedPower: string | null;
   };

   /**
    * Cursed item removal prevention — present on cursed items that cannot be
    * voluntarily unequipped or removed without specific magical intervention.
    *
    * D&D 3.5 SRD — CURSED ITEM REMOVAL:
    *   Most specific cursed items carry language like:
    *   - "can be removed only with a remove curse spell"
    *   - "can be gotten rid of only by limited wish, wish, or miracle"
    *   - "cannot be removed by any means short of a wish/miracle"
    *   - "remains clasped around the victim's throat even after his death"
    *
    *   This is a hard mechanical constraint. Without this field, `removeFeature()`
    *   would allow any item to be removed unconditionally, which is incorrect for
    *   cursed items — the whole point of a curse is that you can't just take it off.
    *
    * ENGINE CONTRACT:
    *   When `removalPrevention.isCursed === true`:
    *   1. `removeFeature(instanceId)` checks this field and REFUSES to remove the
    *      instance, logging a warning instead.
    *   2. `tryRemoveCursedItem(instanceId, dispelMethod)` is the safe bypass path.
    *      It succeeds only if `dispelMethod` is in `removableBy`, and then calls
    *      the internal `removeFeature()` via a trusted path.
    *   3. The Inventory UI reads this field to:
    *      - Grey out the Remove/Unequip button with a tooltip explaining the curse.
    *      - Show which dispel methods can remove it.
    *
    * UI CONTRACT:
    *   `InventoryTab.svelte`:
    *   - If `removalPrevention.isCursed === true` → show a red "Cursed" badge.
    *   - The Unequip/Remove button is replaced with the tooltip:
    *     "Cannot be removed [until remove curse / wish / miracle is cast]."
    *   - Optionally show `removalPrevention.preventionNote` as a sub-tooltip.
    *
    * `isCursed`:
    *   Discriminant — always `true` when the block is present. Used to distinguish
    *   voluntary "cursed item" behavior from other removal-prevention concepts.
    *
    * `removableBy`:
    *   The list of in-game methods that CAN remove this item.
    *   The caller must pass one of these strings to `tryRemoveCursedItem()`.
    *   Standard SRD values:
    *   - `"remove_curse"`: Standard remove curse spell (cleric 3, bard 3, etc.)
    *   - `"limited_wish"`: Limited wish (requires access to 7th-level spell)
    *   - `"wish"`: Wish spell (9th level)
    *   - `"miracle"`: Miracle spell (9th level)
    *   Some items require combinations or ordered sequences — document those in
    *   `preventionNote` rather than modelling the order in the type system.
    *
    * `preventionNote`:
    *   Optional human-readable note for the UI. Explains special removal
    *   conditions that the `removableBy` array alone cannot express.
    *   Examples:
    *   - "Must be cast by a caster of at least 12th level"
    *   - "Remove curse followed by heal to restore ability scores"
    *   - "Requires neutralize poison THEN raise dead"
    *
    * CONTENT AUTHORING — Necklace of Strangulation (never drops off):
    *   ```json
    *   "removalPrevention": {
    *     "isCursed": true,
    *     "removableBy": ["limited_wish", "wish", "miracle"],
    *     "preventionNote": "Cannot be removed by any means short of limited wish, wish, or miracle. Remains clasped even after death."
    *   }
    *   ```
    *
    * CONTENT AUTHORING — Ring of Clumsiness (remove curse works):
    *   ```json
    *   "removalPrevention": {
    *     "isCursed": true,
    *     "removableBy": ["remove_curse", "wish", "miracle"]
    *   }
    *   ```
    *
    * @see GameEngine.removeFeature()         — blocked for cursed items
    * @see GameEngine.tryRemoveCursedItem()   — the bypass method
    * @see InventoryTab.svelte                — reads this to render the curse UI
    * @see ARCHITECTURE.md section 4.15      — Cursed Item Removal contract
    */
   removalPrevention?: {
     /** Discriminant — always true when this block is present. */
     isCursed: true;
     /**
      * Which in-game methods can remove this item.
      * At least one method must be provided.
      * Pass one of these strings to `GameEngine.tryRemoveCursedItem()`.
      */
     removableBy: ('remove_curse' | 'limited_wish' | 'wish' | 'miracle')[];
     /**
      * Optional human-readable note displayed to the player/GM.
      * Use for multi-step removal sequences or unusual conditions.
      */
     preventionNote?: string;
   };

   /**
    * Whether this item is a unique item that can only exist once in the world.
    *
    * D&D 3.5 SRD — MAJOR ARTIFACTS:
    *   "Major artifacts are unique items — only one of each such item exists.
    *   These are the most potent of magic items, capable of altering the balance
    *   of a campaign."
    *
    * ENGINE CONTRACT:
    *   This is a METADATA field. It has NO effect on the DAG computation pipeline,
    *   modifier stacking, dice engine, or ability activation flows. All artifact
    *   effects (modifiers, activated abilities, charges, weapon stats) are modelled
    *   using the same primitives as non-unique items.
    *
    *   The field exists exclusively for the GM Campaign Layer (Phase 21+) to:
    *   - Prevent duplicate instances of the same major artifact from being added
    *     to the campaign world inventory.
    *   - Display a special UI badge ("Unique — Only One Exists") in the item detail.
    *   - Warn the GM when trading, looting, or copying a unique item.
    *
    * CONTENT AUTHORING:
    *   - All major artifacts: `isUnique: true`
    *   - Minor artifacts: omit (they are NOT necessarily unique — "minor artifacts
    *     are not necessarily unique items")
    *   - All non-artifact items: omit
    *
    * @see artifactTier — whether this is a minor or major artifact
    */
   isUnique?: boolean;

   /**
    * Artifact tier — distinguishes minor artifacts from major artifacts.
    *
    * D&D 3.5 SRD:
    *   - **Minor artifacts**: "not necessarily unique items. Even so, they are
    *     magic items that no longer can be created, at least by common mortal means."
    *     Examples: Book of Infinite Spells, Deck of Many Things, Sphere of Annihilation.
    *   - **Major artifacts**: "unique items — only one of each such item exists."
    *     Examples: The Shadowstaff, The Shield of the Sun, The Orbs of Dragonkind.
    *
    * ENGINE CONTRACT:
    *   Metadata only — affects no engine computation.
    *   The `artifact` tag in `tags[]` identifies an item as an artifact;
    *   `artifactTier` further classifies it for display and campaign management.
    *
    * CONTENT AUTHORING:
    *   Artifacts carry tags: `["item", "artifact", "magic_item"]`.
    *   Major artifacts additionally have `isUnique: true`.
    *   `artifactTier` should always be set when `tags` includes `"artifact"`.
    */
   artifactTier?: 'minor' | 'major';

   /**
    * Scroll spell list — present ONLY on scrolls.
    *
    * D&D 3.5 SRD — SCROLL MECHANICS:
    *   "A scroll is a spell (or collection of spells) that has been stored in
    *   written form. A spell on a scroll can be used only once. The writing
    *   vanishes from the scroll when the spell is activated."
    *
    *   Key rules that distinguish scrolls from wands and staves:
    *
    *   1. SPELL TYPE RESTRICTION (unique to scrolls — not wands or staves):
    *      "Arcane spellcasters (wizards, sorcerers, and bards) can only use
    *      scrolls containing arcane spells, and divine spellcasters (clerics,
    *      druids, paladins, and rangers) can only use scrolls containing divine
    *      spells."
    *      → `spellType: 'arcane' | 'divine'` is REQUIRED on each entry.
    *
    *   2. FIXED CASTER LEVEL (same as wands — NOT the wielder's CL):
    *      The scroll uses the original scribe's CL. The SRD's standard CL per
    *      spell level is: CL = 2 × spellLevel − 1 (minimum CL to cast that level).
    *      → `casterLevel` is REQUIRED per entry.
    *
    *   3. CL CHECK WHEN WIELDER'S CL < SCROLL'S CL:
    *      If the user's own CL is lower than the scroll's CL, she must make a
    *      caster level check (DC = scroll's CL + 1) to cast the spell successfully.
    *      On failure: DC 5 Wisdom save or mishap.
    *      → The CastingPanel computes: `checkRequired = wielder.casterLevel < entry.casterLevel`
    *      → `checkDC = entry.casterLevel + 1`
    *      `spellLevel` is REQUIRED (not optional) to compute this DC.
    *
    *   4. MULTI-SPELL (same as staves — unlike wands which hold only one):
    *      A scroll can hold 1d3 (minor), 1d4 (medium), or 1d6 (major) spells.
    *      The market table lists individual single-spell scrolls; authored items
    *      will each have `scrollSpells.length === 1`.
    *      → `scrollSpells` is an ARRAY (not a single object like `wandSpell`).
    *
    *   5. SINGLE-USE CONSUMABLE (combined with `consumable.isConsumable: true`):
    *      Unlike wands (50 charges) and staves (50 charges), a scroll spell is
    *      destroyed when cast. Model as `consumable: { isConsumable: true }`.
    *      No `resourcePoolTemplates` needed — the scroll is just used and gone.
    *
    * WHY A DEDICATED FIELD (not reusing `wandSpell` or `staffSpells`):
    *   - `wandSpell`: single object, no `spellType`, not consumed permanently
    *   - `staffSpells`: has `chargeCost` (irrelevant for scrolls), no `spellType`,
    *     uses wielder's CL, not consumed permanently
    *   - `scrollSpells`: array, `spellType` required, `spellLevel` required for
    *     CL check DC, uses item's fixed CL, combined with `consumable`
    *
    * CONTENT AUTHORING — Scroll of Fireball example:
    *   ```json
    *   {
    *     "id": "item_scroll_arcane_fireball",
    *     "consumable": { "isConsumable": true },
    *     "scrollSpells": [{
    *       "spellId": "spell_fireball",
    *       "casterLevel": 5,
    *       "spellLevel": 3,
    *       "spellType": "arcane"
    *     }]
    *   }
    *   ```
    *   Note: no `resourcePoolTemplates` — the scroll is consumed on use.
    *
    * CONTENT AUTHORING — Standard CL per Spell Level (SRD defaults):
    *   | Spell Level | Min CL | Cost Formula (CL × SL × 25 gp) | Price |
    *   |-------------|--------|----------------------------------|-------|
    *   | 0th         | 1      | special: 12.5 gp                | 12.5 gp |
    *   | 1st         | 1      | 1 × 1 × 25                      | 25 gp |
    *   | 2nd         | 3      | 3 × 2 × 25                      | 150 gp |
    *   | 3rd         | 5      | 5 × 3 × 25                      | 375 gp |
    *   | 4th         | 7      | 7 × 4 × 25                      | 700 gp |
    *   | 5th         | 9      | 9 × 5 × 25                      | 1,125 gp |
    *   | 6th         | 11     | 11 × 6 × 25                     | 1,650 gp |
    *   | 7th         | 13     | 13 × 7 × 25                     | 2,275 gp |
    *   | 8th         | 15     | 15 × 8 × 25                     | 3,000 gp |
    *   | 9th         | 17     | 17 × 9 × 25                     | 3,825 gp |
    *
    * CASTING PANEL CONTRACT:
    *   When the player activates a scroll spell:
    *   1. Read `scrollSpells[i].spellType` — validate it matches wielder's type.
    *   2. Validate spell is on wielder's class list (UMD check if not).
    *   3. If `wielder.casterLevel < entry.casterLevel`:
    *        → CL check required: `checkDC = entry.casterLevel + 1`
    *        → On failure: DC 5 Wisdom check or mishap.
    *   4. Remove `scrollSpells[i]` from the scroll (or consume entire item if array
    *      is now empty, via `engine.consumeItem()` or `engine.expireEffect()`).
    *   5. Apply the spell using `entry.casterLevel` as the CL.
    *   6. Save DC = `10 + entry.spellLevel + abilityModifier`.
    *
    * @see wandSpell            — single-spell, item CL, wand-specific
    * @see staffSpells          — multi-spell, wielder CL, charge-based
    * @see consumable           — MUST be paired with `{ isConsumable: true }`
    * @see ARCHITECTURE.md section 4.14 — Scroll Spell List contract
    */
   scrollSpells?: {
     /**
      * The ID of the spell on the scroll.
      * Matches a Feature with `category: "magic"` in the DataLoader.
      */
     spellId: ID;
     /**
      * The scroll's fixed caster level.
      * Unlike staves, scrolls use this CL regardless of the wielder's level.
      * Standard SRD values: CL 1/1/3/5/7/9/11/13/15/17 for levels 0–9.
      */
     casterLevel: number;
     /**
      * The spell's level on this scroll (REQUIRED — not optional).
      * Needed to compute the CL check DC: `checkDC = casterLevel + 1`
      * and the save DC: `10 + spellLevel + abilityModifier`.
      * Also enforces the 4th-level-maximum rule (scrolls can hold any level,
      * but the CastingPanel should validate the spell exists at the intended level).
      */
     spellLevel: number;
     /**
      * Whether this spell is arcane or divine.
      *
      * This is a HARD class-restriction requirement unique to scrolls.
      * Arcane scrolls → wizards, sorcerers, bards only.
      * Divine scrolls → clerics, druids, paladins, rangers only.
      *
      * The CastingPanel checks `spellType` against the wielder's class before
      * allowing activation. Activating the wrong type requires a Use Magic Device
      * check (DC = 20 + spell level) — future enhancement.
      */
     spellType: 'arcane' | 'divine';
   }[];

   /**
    * Staff spell list — present only on staves. Each entry describes one spell
    * available from the staff and the number of charges it costs to cast.
    *
    * D&D 3.5 SRD — STAFF MECHANICS:
    *   "A staff has 50 charges when created." Each spell stored in a staff can be
    *   activated via spell trigger (standard action). The charge cost varies by
    *   spell: common staffs use 1–3 charges; the Staff of Life uses 5 charges for
    *   Resurrection; the Staff of Woodlands uses 4 for Animate Plants.
    *
    *   Key rules:
    *   - Staffs use the WIELDER'S caster level (if higher than the staff's own CL)
    *     and the wielder's ability modifier to set saving throw DCs.
    *   - A staff can hold spells of any level (unlike wands which max at 4th).
    *   - Minimum CL for a staff is 8th.
    *   - Some staves also function as +N weapons after charges are depleted
    *     (modelled separately via `weaponData` and `grantedModifiers`).
    *
    * ENGINE CONTRACT — CHARGE DEDUCTION:
    *   When the player activates a staff spell from `CastingPanel.svelte`:
    *   1. Look up `staffSpells` on the equipped staff's `ItemFeature`.
    *   2. Find the entry matching the selected spell.
    *   3. Check `instance.itemResourcePools['charges']` >= entry.chargeCost.
    *   4. Call `engine.spendItemPoolCharge(instanceId, 'charges', entry.chargeCost)`.
    *   5. Apply the spell effect (using the wielder's caster level and ability mod).
    *
    *   `spendItemPoolCharge()` already accepts a variable `amount` parameter, so
    *   no engine computation change is needed for variable charge costs.
    *
    * THE `spellLevel` FIELD (heightened spells):
    *   The Staff of Power stores fireball, ray of enfeeblement, and lightning bolt
    *   at a heightened level (5th). When the CastingPanel resolves the spell, it
    *   should use this effective level for DC and other level-dependent effects,
    *   overriding the spell's base level. Absent for non-heightened spells.
    *
    * CONTENT AUTHORING — Staff of Healing example:
    *   ```json
    *   "staffSpells": [
    *     { "spellId": "spell_lesser_restoration",  "chargeCost": 1 },
    *     { "spellId": "spell_cure_serious_wounds", "chargeCost": 1 },
    *     { "spellId": "spell_remove_blindness_deafness", "chargeCost": 2 },
    *     { "spellId": "spell_remove_disease",      "chargeCost": 3 }
    *   ],
    *   "resourcePoolTemplates": [{
    *     "poolId": "charges",
    *     "label": { "en": "Staff Charges (50)", "fr": "Charges de bâton (50)" },
    *     "maxPipelineId": "combatStats.staff_charges_max",
    *     "defaultCurrent": 50,
    *     "resetCondition": "never"
    *   }]
    *   ```
    *
    * @see CastingPanel.svelte              — reads this field to show spell options
    * @see GameEngine.spendItemPoolCharge() — deducts chargeCost charges
    * @see resourcePoolTemplates            — tracks the charge pool separately
    * @see ARCHITECTURE.md section 4.12    — Staff Spell List contract
    */
   staffSpells?: {
     /**
      * The ID of the spell stored in the staff.
      * Must match a Feature entry with `category: "magic"` in the DataLoader.
      * Example: "spell_fireball", "spell_charm_monster"
      */
     spellId: ID;
     /**
      * Number of charges consumed to cast this spell from the staff.
      * Range: 1 (cheap spell) to 5 (resurrection on Staff of Life).
      * The SRD uses 1–4 for standard staves, with 5 only for Resurrection.
      */
     chargeCost: 1 | 2 | 3 | 4 | 5;
     /**
      * Effective spell level for this entry, if the spell is heightened.
      *
      * ONLY set when the staff stores a spell at a DIFFERENT level than its
      * base spell level. Currently used only by the Staff of Power, which
      * stores fireball (base 3rd) at 5th level, ray of enfeeblement (base 1st)
      * at 5th level, and lightning bolt (base 3rd) at 5th level.
      *
      * When present, the CastingPanel uses THIS value instead of the spell's
      * base level to determine: save DCs, damage dice count, and enemy SR checks.
      *
      * Absent for: all non-heightened spells (the vast majority of staff spells).
      */
     spellLevel?: number;
   }[];

   /**
    * Wand spell definition — present ONLY on wands.
    *
    * D&D 3.5 SRD — WAND MECHANICS:
    *   "A wand is a thin baton that contains a single spell of 4th level or lower.
    *   Each wand has 50 charges when created, and each charge expended allows the
    *   user to use the wand's spell one time. A wand that runs out of charges is
    *   just a stick."
    *
    *   Key rules:
    *   - Wands always contain EXACTLY ONE spell (not a menu like staves).
    *   - Each activation costs EXACTLY ONE charge (no variation).
    *   - Wands use the item's OWN FIXED CASTER LEVEL, not the wielder's.
    *     This is critical: a Wand of Magic Missile (CL 1) fires 1 missile;
    *     a Wand of Magic Missile (CL 9) fires 5 missiles. Same table entry,
    *     very different effect.
    *   - Some wands store heightened spells (e.g., "Charm person, heightened
    *     (3rd-level spell)" = charm person treated as a 3rd-level spell for
    *     DC and other level-dependent calculations).
    *   - Wands can only hold spells up to 4th level.
    *   - All wands in the table use the minimum caster level for the spell's
    *     class level, EXCEPT for explicitly higher-CL variants
    *     (e.g., Magic Missile appears at CL 1, CL 3, CL 5, CL 7, CL 9).
    *
    * WHY A DEDICATED FIELD (not reusing `staffSpells`):
    *   1. Wands have exactly ONE spell — not an array.
    *   2. The charge cost is always 1 — no `chargeCost` field needed.
    *   3. Wands use their OWN FIXED `casterLevel` — staves use the wielder's CL.
    *      The item's CL is data that must be stored explicitly (cannot be inferred
    *      from price, since the SRD table shows prices at fixed CLs).
    *   4. The CastingPanel reads `wandSpell.casterLevel` to compute damage dice,
    *      range, duration, and area — critical for variants of the same spell.
    *
    * CONTENT AUTHORING — Wand of Magic Missile (CL 9) example:
    *   ```json
    *   {
    *     "id": "item_wand_magic_missile_cl9",
    *     "wandSpell": {
    *       "spellId": "spell_magic_missile",
    *       "casterLevel": 9
    *     },
    *     "resourcePoolTemplates": [{
    *       "poolId": "charges",
    *       "label": { "en": "Wand Charges (50)", "fr": "Charges de baguette (50)" },
    *       "maxPipelineId": "combatStats.wand_charges_max",
    *       "defaultCurrent": 50,
    *       "resetCondition": "never"
    *     }]
    *   }
    *   ```
    *
    * HEIGHTENED WANDS:
    *   The `spellLevel` field overrides the spell's effective level for DC
    *   and restriction purposes. Only needed for wands where the SRD
    *   explicitly stores the spell at a higher level:
    *   - "Charm person, heightened (3rd-level spell)" → `spellLevel: 3`
    *   - "Hold person, heightened (4th level)"       → `spellLevel: 4`
    *   - "Ray of enfeeblement, heightened (4th level)"→ `spellLevel: 4`
    *   - "Suggestion, heightened (4th level)"        → `spellLevel: 4`
    *
    * CASTING PANEL CONTRACT:
    *   When the player activates a wand:
    *   1. Read `wandSpell.spellId` to identify the spell to cast.
    *   2. Use `wandSpell.casterLevel` as the CL for all level-dependent effects.
    *   3. If `wandSpell.spellLevel` is set, use it as the effective spell level
    *      (for DC = 10 + spellLevel + ability modifier).
    *   4. Validate `instance.itemResourcePools['charges'] >= 1`.
    *   5. Call `engine.spendItemPoolCharge(instanceId, 'charges', 1)`.
    *   6. Apply the spell effect with the wand's fixed CL.
    *
    * @see staffSpells             — the analogous field for staves (array of spells)
    * @see resourcePoolTemplates   — tracks the 50-charge pool separately
    * @see ARCHITECTURE.md section 4.13 — Wand Spell contract
    */
   wandSpell?: {
     /**
      * The ID of the spell stored in the wand.
      * Must match a Feature with `category: "magic"` in the DataLoader.
      * Example: "spell_magic_missile", "spell_fireball"
      */
     spellId: ID;
     /**
      * The wand's fixed caster level.
      *
      * Wands use their own CL regardless of the wielder's caster level.
      * This distinguishes variants like Wand of Magic Missile at CL 1
      * (1 missile) vs. CL 9 (5 missiles).
      *
      * Minimum CL = the minimum caster level to cast the spell
      * (e.g., fireball level 3 → minimum CL 5).
      */
     casterLevel: number;
     /**
      * Effective spell level if the wand holds a heightened spell.
      *
      * Only present for the 4 heightened wands in the SRD table:
      * - Charm person heightened (3rd-level spell):  `spellLevel: 3`
      * - Hold person heightened (4th level):          `spellLevel: 4`
      * - Ray of enfeeblement heightened (4th level):  `spellLevel: 4`
      * - Suggestion heightened (4th level):           `spellLevel: 4`
      *
      * When absent, use the spell's base level for DC calculations.
      */
     spellLevel?: number;
   };

   /**
    * Metamagic rod effect — present only on rods (and similar items) that grant
    * the ability to apply a metamagic feat to a spell without occupying a higher
    * spell slot.
    *
    * D&D 3.5 SRD — METAMAGIC RODS:
    *   "Metamagic rods hold the essence of a metamagic feat but do not change the
    *   spell slot of the altered spell. A caster may only use one metamagic rod on
    *   any given spell."
    *
    *   Each rod grants 3 uses per day (tracked via `resourcePoolTemplates`).
    *   Lesser rods work on spells up to 3rd level; normal rods up to 6th level;
    *   greater rods up to 9th level.
    *
    * ENGINE CONTRACT:
    *   This field is the **type declaration** for the metamagic effect. The actual
    *   usage limit (3/day) is tracked via `resourcePoolTemplates` with
    *   `resetCondition: "per_day"`.
    *
    *   The `CastingPanel.svelte` reads `metamagicEffect` on the character's equipped
    *   rods to offer a metamagic upgrade option at the moment of casting. If a rod
    *   with matching `feat` is equipped and the player selects it, the panel:
    *   1. Checks that the spell's level is ≤ `maxSpellLevel`.
    *   2. Decrements the rod's ResourcePool charge by 1.
    *   3. Applies the metamagic effect to the cast spell (e.g., doubles variable
    *      numeric effects for Empower, extends duration for Extend, etc.).
    *   4. The spell slot used is NOT increased (unlike the feat itself).
    *
    * `feat`:
    *   The SRD metamagic feat identifier. Maps to a known feat ID in the data.
    *   Valid values (all SRD metamagic rods):
    *     - "feat_empower_spell"   — All variable numeric effects × 1.5
    *     - "feat_enlarge_spell"   — Doubles range
    *     - "feat_extend_spell"    — Doubles duration
    *     - "feat_maximize_spell"  — All variable numeric effects are maximum
    *     - "feat_quicken_spell"   — Free action casting (once/round max)
    *     - "feat_silent_spell"    — No verbal component required
    *
    * `maxSpellLevel`:
    *   Maximum spell level this rod can affect.
    *   - Lesser:  3 (rods labeled "lesser")
    *   - Normal:  6 (standard rods)
    *   - Greater: 9 (rods labeled "greater")
    *
    * CONTENT AUTHORING:
    *   A lesser metamagic empower rod is authored as:
    *   ```json
    *   {
    *     "id": "item_rod_metamagic_empower_lesser",
    *     "metamagicEffect": {
    *       "feat": "feat_empower_spell",
    *       "maxSpellLevel": 3
    *     },
    *     "resourcePoolTemplates": [{
    *       "poolId": "metamagic_uses",
    *       "resetCondition": "per_day",
    *       "defaultCurrent": 3
    *     }]
    *   }
    *   ```
    *
    * @see CastingPanel.svelte       — reads this field to offer metamagic option
    * @see resourcePoolTemplates     — tracks the 3 uses/day separately
    * @see ARCHITECTURE.md section 4.11 — Metamagic Rod contract
    */
   metamagicEffect?: {
     /**
      * The feat this rod applies at no spell slot cost.
      * One of the 6 SRD metamagic feats available on rods.
      */
     feat: 'feat_empower_spell'
           | 'feat_enlarge_spell'
           | 'feat_extend_spell'
           | 'feat_maximize_spell'
           | 'feat_quicken_spell'
           | 'feat_silent_spell';
     /**
      * Maximum spell level this rod can affect.
      * Lesser = 3, Normal = 6, Greater = 9.
      */
     maxSpellLevel: 3 | 6 | 9;
   };

   /**
    * Weapon-specific data. Present only for weapons.
    *
    * Note: A weapon's attack and damage MODIFIERS (like +2 enhancement) are stored
    * in `grantedModifiers`. This `weaponData` block holds the STATIC properties
    * that define the weapon's base capabilities.
    */
   weaponData?: {
    /**
     * How the weapon is wielded relative to character size.
     * "light": One-handed. Can be used off-hand without penalty.
     * "one_handed": Standard one-hand weapon. 2-handed grants 1.5× STR mod.
     * "two_handed": Always requires both hands (different from `equipmentSlot: "two_hands"` —
     *   this describes wielding category for the purpose of damage/feats; slot binding
     *   is handled by `equipmentSlot`).
     */
     wieldCategory:
       | 'light'       // One-handed; can be used off-hand without penalty
       | 'one_handed'  // Standard one-hand weapon; 2-handed grants 1.5× STR mod
       | 'two_handed'  // Always requires both hands (large weapons)
       | 'double';     // Has two ends — each end can be attacked with independently.
                       // D&D 3.5 SRD: "A character can fight with both ends of a double weapon
                       // as if fighting with two weapons, but incurs all TWF attack penalties."
                       // The PRIMARY end uses damageDice/damageType/critRange/critMultiplier.
                       // The SECONDARY end uses the `secondaryWeaponData` field below.

     /**
      * Base damage dice expression (PRIMARY end for double weapons).
      * Examples: "1d4", "1d8", "2d6"
      * Actual damage formula appended by the engine: "1d8 + @attributes.stat_strength.derivedModifier"
      */
     damageDice: string;

    /**
     * Array of damage types dealt.
     * Examples: ["slashing"], ["piercing", "slashing"], ["bludgeoning", "magic"]
     * Used for DR type-testing and spell effect filtering.
     */
    damageType: string[];

    /**
     * Critical threat range as a string.
     * Examples: "20" (most weapons), "19-20" (longsword), "18-20" (scimitar, keen)
     * The engine parses this to determine if a natural roll falls in the crit range.
     */
    critRange: string;

    /**
     * Critical hit damage multiplier.
     * Examples: 2 (most weapons), 3 (greatsword, battleaxe), 4 (scythe)
     */
    critMultiplier: number;

    /**
     * Natural reach of the weapon in FEET.
     * 5 = standard melee (not a reach weapon).
     * 10 = reach weapon (halberd, longspear, etc.).
     * Exotic creatures or abilities may extend this via pipeline modifiers.
     */
    reachFt: number;

     /**
      * Range increment in FEET for ranged weapons. Absent for melee weapons.
      * Examples: 30 (shortbow first range increment), 60 (longbow), 10 (throwing axe)
      * Each additional range increment beyond the first adds -2 to attack rolls.
      */
     rangeIncrementFt?: number;

     /**
      * Secondary end data for double weapons (`wieldCategory: "double"`).
      *
      * D&D 3.5 SRD: Double weapons (quarterstaff, dire flail, two-bladed sword, etc.)
      * have two attack ends. The primary end is described by the top-level
      * `damageDice`/`damageType`/`critRange`/`critMultiplier` fields.
      * The secondary end is described here when it differs.
      *
      * CASES:
      *   - Quarterstaff: both ends identical (1d6 bludgeoning, ×2). Secondary may be omitted.
      *   - Two-bladed sword: primary 1d8 slashing (19–20/×2), secondary 1d6 piercing (19–20/×2).
      *   - Dwarven urgrosh: primary 1d8 piercing ×3, secondary 1d6 slashing ×3.
      *   - Gnome hooked hammer: primary 1d8 bludgeoning ×3, secondary 1d6 piercing ×4.
      *   - Orc double axe: primary 1d8 slashing ×3, secondary 1d8 slashing ×3.
      *   - Dire flail: primary 1d8 bludgeoning ×2, secondary 1d8 bludgeoning ×2.
      *
      * When absent: the secondary end is identical to the primary end.
      */
     secondaryWeaponData?: {
       damageDice: string;
       damageType: string[];
       critRange: string;
       critMultiplier: number;
     };

     /**
      * Additional dice rolled ONLY on a confirmed critical hit (Enhancement E-7).
     *
     * D&D 3.5 SRD — "BURST" WEAPON ABILITIES:
     *   Flaming Burst, Icy Burst, and Shocking Burst weapons deal their base elemental
     *   damage on every hit (1d6, from the Flaming/Frost/Shock property), PLUS extra
     *   dice on a confirmed critical hit only:
     *     - ×2 crit multiplier:  +1d10 of the element
     *     - ×3 crit multiplier:  +2d10 of the element
     *     - ×4 crit multiplier:  +3d10 of the element
     *
     *   Thundering similarly adds 1d8/2d8/3d8 sonic damage on crits.
     *
     *   The SRD explicitly states: "Additional dice of damage are NOT multiplied when
     *   the attacker scores a critical hit." This means these burst dice are added ONCE
     *   on a crit, not multiplied by critMultiplier — even though they only trigger on crits.
     *
     * CONTENT AUTHORING:
     *   Set `baseDiceFormula` to the ×2 value (e.g., "1d10" for Flaming Burst).
     *   Set `scalesWithCritMultiplier: true` to indicate the engine should scale the
     *   formula by (critMultiplier - 1):
     *     - critMultiplier = 2 → 1 × baseDiceFormula  (e.g., "1d10")
     *     - critMultiplier = 3 → 2 × baseDiceFormula  (e.g., "2d10")
     *     - critMultiplier = 4 → 3 × baseDiceFormula  (e.g., "3d10")
     *   Set `scalesWithCritMultiplier: false` for fixed crit bonus dice (rare, non-SRD).
     *
     *   `damageType`: the energy type of the on-crit bonus dice.
     *   Examples: "fire" (Flaming Burst), "cold" (Icy Burst), "electricity" (Shocking Burst),
     *             "sonic" (Thundering).
     *
     * ENGINE CONTRACT:
     *   `parseAndRoll()` accepts `weaponOnCritDice?: OnCritDiceSpec` as a 9th parameter.
     *   When `isConfirmedCrit === true` AND `weaponOnCritDice` is provided:
     *   1. Compute the actual dice formula:
     *        if scalesWithCritMultiplier: diceCount = critMultiplier - 1; formula = `${diceCount}d${faces}`
     *        else: use baseDiceFormula directly
     *   2. Roll the formula using the same injected RNG.
     *   3. Store the result in `RollResult.onCritDiceRolled`.
     *   4. Add the total to `RollResult.finalTotal` (the burst damage is part of the total).
     *
     *   If Fortification negates the crit (`fortification.critNegated === true`), the
     *   on-crit dice are NOT rolled (Fortification negates ALL crit effects).
     *
     * NOTE: This field is on `weaponData`, not on `grantedModifiers`, because it is a
     * dice-roll side-effect rather than a static pipeline modifier. The combat system
     * passes the value when constructing the roll call for a confirmed crit.
     *
     * @see ARCHITECTURE.md section 4.9 — On-Crit Burst Dice mechanic
     * @see RollResult.onCritDiceRolled — the result field
     * @see parseAndRoll() — 9th parameter: weaponOnCritDice
     */
    onCritDice?: {
      /**
       * Base dice formula for a ×2 crit multiplier weapon.
       * Examples: "1d10" (Flaming/Icy/Shocking Burst), "1d8" (Thundering)
       * Parsed by the dice expression parser.
       */
      baseDiceFormula: string;
      /**
       * The energy / damage type of these bonus dice.
       * Examples: "fire", "cold", "electricity", "sonic"
       * Used by the UI to display "1d10 fire (on crit)" in the roll breakdown.
       */
      damageType: string;
      /**
       * When true, multiply baseDiceFormula by (critMultiplier - 1).
       * ×2 → 1×formula, ×3 → 2×formula, ×4 → 3×formula.
       * Set false for fixed bonus (e.g., always 2d6 regardless of crit multiplier).
       * Should be true for all SRD burst weapons.
       */
      scalesWithCritMultiplier: boolean;
    };
  };

  /**
   * Armour/shield-specific data. Present only for worn protective equipment.
   *
   * Note: The actual AC bonus modifier (e.g., +6 for breastplate) is stored in
   * `grantedModifiers` with `type: "armor"` or `type: "shield"`.
   * This `armorData` block holds additional armour-specific metadata.
   */
  armorData?: {
    /**
     * The armour bonus to AC (matching the modifier value in `grantedModifiers`).
     * Stored here for easy UI display and for computing touch/flat-footed AC correctly.
     */
    armorBonus: number;

    /**
     * Maximum Dexterity bonus the character can apply to AC while wearing this armour.
     * Examples: Full plate = 1, Breastplate = 3, Leather = 6, Mage Armor (spell) = infinity.
     * The engine applies this cap during DAG Phase 3 AC calculation.
     */
    maxDex: number;

    /**
     * Armour check penalty applied to physical skills (Climb, Jump, Swim, etc.).
     * Examples: Full plate = -6, Chain shirt = -2, Leather = 0.
     * The engine injects this as a modifier during DAG Phase 4 for skills
     * with `appliesArmorCheckPenalty: true`.
     */
    armorCheckPenalty: number;

    /**
     * Arcane spell failure chance as a PERCENTAGE.
     * Examples: Full plate = 35, Chain shirt = 20, Cloth/no armour = 0.
     * Used by the spellcasting UI to warn arcane casters about failure chance.
     */
    arcaneSpellFailure: number;
  };

  /**
   * Psionic item-specific data block.
   *
   * Present ONLY for the five psionic item types:
   *   cognizance_crystal | dorje | power_stone | psicrown | psionic_tattoo
   *
   * For all non-psionic items (weapons, armour, standard magic items), this
   * field is `undefined`.
   *
   * The `psionicItemType` discriminant tells the UI and Dice Engine which
   * sub-block of data is relevant. Only the fields applicable to the declared
   * type are populated — unused fields are `undefined`.
   *
   * EACH TYPE'S CANONICAL DATA:
   * ─────────────────────────────────────────────────────────────────────────
   *
   * COGNIZANCE CRYSTAL (`"cognizance_crystal"`):
   *   Stores power points that any psionic character can draw on (like an
   *   external PP battery). Can be recharged by the owner at 1 PP per 1 PP.
   *   PP maximum is always ODD and between 1–17 (SRD table).
   *   Fields used: `storedPP`, `maxPP`, `attuned`
   *
   * DORJE (`"dorje"`):
   *   A single-power wand analogue. Created with 50 charges; each charge
   *   manifests the stored power once. The user needs the power on their
   *   class list. Powers are NOT augmented unless the creator built the dorje
   *   at a higher ML (pre-augmented, locked in at creation).
   *   Fields used: `powerStored`, `charges`, `manifesterLevel`
   *
   * POWER STONE (`"power_stone"`):
   *   A scroll analogue holding 1–6 distinct powers (separate imprints).
   *   Each power is used independently (single use per power = "flushed").
   *   Brainburn risk if user ML < stone ML. Stone glows brighter with more
   *   or higher-level powers.
   *   Fields used: `powersImprinted`
   *
   * PSICROWN (`"psicrown"`):
   *   A headband containing a fixed set of powers AND a dedicated PP pool
   *   (50 × manifester level when created). Powers can be augmented using
   *   the psicrown's own PP (NOT the user's personal PP). The user cannot
   *   supplement with their own PP.
   *   Fields used: `storedPP`, `maxPP`, `powersKnown`, `manifesterLevel`
   *
   * PSIONIC TATTOO (`"psionic_tattoo"`):
   *   A single-use power inscribed as a body tattoo. Only 1st–3rd level
   *   powers. Maximum 20 tattoos on one body at once (exceeding 20 causes
   *   all to simultaneously activate). Fades after use.
   *   Fields used: `powerStored`, `manifesterLevel`, `activated`
   *
   * @see PsionicItemType — the discriminant union type
   * @see PowerStoneEntry — individual imprinted power on a power stone
   * @see ARCHITECTURE.md section 5.1.1 — Psionic Item Data full reference
   * @see SRD: /srd/psionic/items/
   */
  psionicItemData?: {
    /**
     * Discriminant tag identifying which sub-type of psionic item this is.
     * Determines which other fields in this block are meaningful.
     */
    psionicItemType: PsionicItemType;

    // ─── COGNIZANCE CRYSTAL + PSICROWN fields ────────────────────────────

    /**
     * Current stored Power Points in this item.
     *
     * COGNIZANCE CRYSTAL: The PP available for the owner to draw on when
     *   manifesting powers. Depletes as the owner uses it. Can be recharged
     *   at 1-for-1 by spending the owner's own PP (these then stay in the
     *   crystal until used).
     *   Range: 0 to `maxPP` (odd number, 1–17).
     *
     * PSICROWN: The PP available for manifesting the crown's powers.
     *   Powers from the crown are augmentable using ONLY the crown's own PP.
     *   The user cannot supplement with their personal PP.
     *   Created with `50 × manifesterLevel` PP.
     *
     * Mutable during play (decremented as PP are spent).
     * Null-safe: if `undefined`, treat as 0.
     *
     * Only meaningful for `psionicItemType: "cognizance_crystal"` or `"psicrown"`.
     */
    storedPP?: number;

    /**
     * Maximum Power Points this item can hold.
     *
     * COGNIZANCE CRYSTAL: Always ODD, between 1 and 17 (per SRD creation table).
     *   Determines the item's tier and market price.
     *   The crystal can never hold more than this maximum, even when recharged.
     *
     * PSICROWN: Set at creation time as `50 × manifesterLevel`.
     *   Psicrowns do NOT recharge between adventures (unlike some interpretations
     *   of other charged items) unless explicitly stated by the GM.
     *
     * Immutable after creation (stored as a configuration value, not runtime state).
     *
     * Only meaningful for `psionicItemType: "cognizance_crystal"` or `"psicrown"`.
     */
    maxPP?: number;

    /**
     * Whether the cognizance crystal is currently attuned to the owner.
     *
     * COGNIZANCE CRYSTAL ONLY.
     * Attunement requires holding the crystal for 10 minutes (the activation period).
     * Until attuned, the PP stored in the crystal cannot be accessed.
     *
     * `true`: Crystal is attuned — owner can draw on its PP.
     * `false`: Crystal is not yet attuned (just acquired; needs 10 minutes).
     *
     * Only meaningful for `psionicItemType: "cognizance_crystal"`.
     * Ignored for all other psionic item types.
     */
    attuned?: boolean;

    // ─── DORJE + PSIONIC TATTOO fields ───────────────────────────────────

    /**
     * The ID of the single `MagicFeature` (psionic power) stored in this item.
     *
     * DORJE: The power this dorje manifests when a charge is expended.
     *   The user must have the power on their class list to activate the dorje.
     *   Powers can be pre-augmented at creation (locked in at the creator's ML).
     *
     * PSIONIC TATTOO: The power imprinted on this tattoo. Manifested when the
     *   wearer activates it (standard action). Single use — tattoo fades after.
     *   Only 1st–3rd level powers can be stored.
     *
     * Looked up from the DataLoader to display power name, level, and effects.
     *
     * Only meaningful for `psionicItemType: "dorje"` or `"psionic_tattoo"`.
     * Use `powersImprinted[]` for power stones; `powersKnown[]` for psicrowns.
     */
    powerStored?: ID;

    /**
     * Remaining charges (uses) for this dorje.
     *
     * DORJE ONLY.
     * Created with 50 charges. Each charge allows one use of the stored power.
     * When charges reach 0, the dorje is exhausted — it becomes an inert
     * crystal with no further psionic function.
     *
     * Mutable during play (decremented each time the dorje is used).
     *
     * Only meaningful for `psionicItemType: "dorje"`.
     */
    charges?: number;

    // ─── POWER STONE fields ────────────────────────────────────────────

    /**
     * Array of powers imprinted on this power stone.
     *
     * POWER STONE ONLY.
     * A power stone holds 1d3–1d6 distinct powers depending on quality
     * (minor/medium/major). Each entry in this array represents one imprinted
     * power with its manifester level and used status.
     *
     * Powers can be used in any order. Using one power does NOT affect the others.
     * When ALL entries have `usedUp: true`, the stone is fully depleted.
     *
     * BRAINBURN: If the user's manifester level < entry.manifesterLevel, they
     * must make a level check (DC = manifesterLevel + 1) or trigger Brainburn
     * (1d6 damage per stored power per round for 1d4 rounds). This risk is
     * computed by the Dice Engine at activation time.
     *
     * @see PowerStoneEntry for individual entry structure.
     *
     * Only meaningful for `psionicItemType: "power_stone"`.
     */
    powersImprinted?: PowerStoneEntry[];

    // ─── PSICROWN fields ──────────────────────────────────────────────

    /**
     * IDs of powers accessible via this psicrown's PP pool.
     *
     * PSICROWN ONLY.
     * A psicrown has a fixed, predefined list of powers. The wearer can manifest
     * any of these powers by spending the crown's PP (not personal PP). The
     * manifested powers can be augmented using additional crown PP, provided
     * the total PP spent does not exceed the wearer's manifester level.
     *
     * The wearer does not need these powers on their personal class list —
     * they access them through the crown. However, they must meet key ability
     * score requirements to activate the crown.
     *
     * Each ID references a `MagicFeature` in the DataLoader.
     *
     * Only meaningful for `psionicItemType: "psicrown"`.
     */
    powersKnown?: ID[];

    // ─── SHARED: MANIFESTER LEVEL ─────────────────────────────────────

    /**
     * The manifester level at which this item was created.
     *
     * Used by:
     *   DORJE:          The caster level for the stored power's variable effects.
     *                   (Range, duration, damage dice all scale with this.)
     *                   Cannot be more than 5 higher than the power's minimum ML.
     *   PSIONIC TATTOO: The caster level. Minimum ML required to inscribe the power.
     *   PSICROWN:       Determines the PP pool size (50 × manifesterLevel) and
     *                   serves as an upper cap on per-power PP spending.
     *   POWER STONE:    Stored per-power in `PowerStoneEntry.manifesterLevel`
     *                   (not here) because each power may have different MLs.
     *
     * For power stones this field is not used (each power entry has its own ML).
     *
     * Only meaningful for `psionicItemType: "dorje"`, `"psionic_tattoo"`, or `"psicrown"`.
     */
    manifesterLevel?: number;

    // ─── PSIONIC TATTOO fields ────────────────────────────────────────

    /**
     * Whether this psionic tattoo has already been activated (used).
     *
     * PSIONIC TATTOO ONLY.
     * `false` (default): Tattoo is intact and can still be activated once.
     * `true`: Tattoo has been activated and has faded. The slot it occupied
     *   is now free (contributing to the 20-tattoo body limit).
     *
     * NOTE: The 20-tattoo body-limit enforcement is a UI concern — the inventory
     * manager (Phase 13.3) must count active tattoos with `activated: false`
     * and block equipping a 21st. Exceeding this limit causes ALL tattoos to
     * simultaneously activate (this is a rare edge case handled narratively).
     *
     * Only meaningful for `psionicItemType: "psionic_tattoo"`.
     */
    activated?: boolean;
  };
}

// =============================================================================
// PSIONIC ITEM DATA — Subtypes for psionic consumables and power stores
// =============================================================================

/**
 * The five psionic item categories defined by D&D 3.5 SRD (Expanded Psionics Handbook).
 *
 * Each type has unique mechanical data stored in `ItemFeature.psionicItemData`.
 * A non-psionic item has `psionicItemData: undefined`.
 *
 * | Type                  | Analogue       | Key mechanic                              |
 * |-----------------------|----------------|-------------------------------------------|
 * | `"cognizance_crystal"` | Ring of Spell Storing | Stores/recharges PP externally          |
 * | `"dorje"`              | Wand           | 50 charges, one power, trigger activation |
 * | `"power_stone"`        | Scroll         | 1–6 powers, single use each, Brainburn    |
 * | `"psicrown"`           | Staff          | PP pool + known powers, caster-level use  |
 * | `"psionic_tattoo"`     | Potion         | 1–3rd level, single-use, body-slot limit  |
 *
 * @see ARCHITECTURE.md section 5.1.1 — Psionic Item Data
 */
export type PsionicItemType =
  | 'cognizance_crystal'  // PP-storing crystal; rechargeable on 1-to-1 basis
  | 'dorje'              // Single-power charge-based wand (50 charges default)
  | 'power_stone'        // Multi-power single-use scroll analogue (+ Brainburn risk)
  | 'psicrown'           // PP pool + fixed power list; headband slot
  | 'psionic_tattoo';    // Single-use body-worn power (max 20 tattoos total)

/**
 * One imprinted power entry on a Power Stone.
 *
 * A power stone can hold 1d3–1d6 powers (depending on minor/medium/major quality).
 * Each power is used independently — manifesting one power from the stone "flushes"
 * only that specific power (the others remain until used).
 *
 * BRAINBURN RISK:
 *   If the user's manifester level is lower than the power's manifester level on the
 *   stone, they must make a manifester level check (DC = stone ML + 1) or face the
 *   Brainburn effect: 1d6 damage per stored power per round for 1d4 rounds.
 *   This is a UI/Dice Engine concern tracked via the `manifesterLevel` field.
 *
 * @see ARCHITECTURE.md section 5.1.1 — Power Stone imprinted power entries
 * @see SRD: /srd/psionic/items/powerStones.html
 */
export interface PowerStoneEntry {
  /**
   * The ID of the `MagicFeature` (psionic power) imprinted on this stone.
   * Looked up from the DataLoader to display power name, level, and description.
   */
  powerId: ID;

  /**
   * The manifester level at which the power was imprinted.
   *
   * Normally the minimum manifester level required for the power's level.
   * The creator may specify a higher ML (up to minimumML + 5) for augmented versions.
   *
   * Used by the Brainburn check: if the user's ML < this value, they roll a
   * manifester level check (DC manifesterLevel + 1) or fail with Brainburn.
   */
  manifesterLevel: number;

  /**
   * Whether this power has already been manifested ("flushed") from the stone.
   *
   * Single-use: once `usedUp === true` the power cannot be manifested again.
   * The stone itself may still hold other powers (tracked as separate entries).
   * When ALL powers are `usedUp`, the stone is inert.
   */
  usedUp: boolean;
}

// =============================================================================
// PSIONIC DISCIPLINE & DISPLAY — Psionic-specific scalar types
// =============================================================================

/**
 * The six psionic disciplines defined by the D&D 3.5 SRD (Expanded Psionics Handbook).
 *
 * Every psionic power belongs to exactly ONE discipline. A discipline is a group of
 * related powers that work in similar ways (SRD "Psionic Powers Overview", §Discipline).
 *
 * DISCIPLINES AND THEIR MECHANICS:
 *   - `"clairsentience"`:    Gather information, perceive the past/future, reveal hidden things.
 *                            (Subdisciplines: scrying)
 *   - `"metacreativity"`:   Create physical matter, objects, or creatures from psionic energy.
 *                            (Subdisciplines: creation)
 *   - `"psychokinesis"`:    Manipulate energy (fire, electricity, cold, sonic) or physical force.
 *                            (Subdisciplines: none in SRD)
 *   - `"psychometabolism"`: Alter the manifester's or target's physical body.
 *                            (Subdisciplines: healing)
 *   - `"psychoportation"`:  Move creatures or objects through space/time/planes.
 *                            (Subdisciplines: teleportation)
 *   - `"telepathy"`:        Influence, control, or read minds.
 *                            (Subdisciplines: charm, compulsion)
 *
 * DISCIPLINE SPECIALIST CLASSES (Psion specialisations):
 *   Each discipline corresponds to a Psion specialist focus-class:
 *   | Specialist     | Discipline          |
 *   |----------------|---------------------|
 *   | Seer           | clairsentience       |
 *   | Shaper         | metacreativity       |
 *   | Kineticist     | psychokinesis        |
 *   | Egoist         | psychometabolism     |
 *   | Nomad          | psychoportation      |
 *   | Telepath       | telepathy            |
 *
 * ONLY relevant when `MagicFeature.magicType === "psionic"`.
 * For arcane/divine spells, `discipline` remains `undefined`.
 *
 * @see ARCHITECTURE.md section 5.2.1 — MagicFeature psionic fields
 * @see SRD: /srd/psionic/psionicPowersOverview.html#disciplineSubdiscipline
 */
export type PsionicDiscipline =
  | 'clairsentience'    // Information, scrying, precognition
  | 'metacreativity'    // Matter creation, astral constructs
  | 'psychokinesis'     // Energy manipulation, force
  | 'psychometabolism'  // Body alteration, healing
  | 'psychoportation'   // Movement, teleportation
  | 'telepathy';        // Mind reading, control, charm

/**
 * The five sensory display types for psionic powers (D&D 3.5 SRD).
 *
 * When a power is manifested, a secondary sensory effect (a "display") may be
 * perceivable by observers. Displays are cosmetic — they have no mechanical impact
 * during combat but can be suppressed with a Concentration check (DC 15 + power level).
 *
 * SRD DISPLAY TYPES (from psionicPowersOverview.html):
 *   - `"auditory"`:   A bass hum, like deep voices, heard up to 100 ft. away.
 *   - `"material"`:   A translucent, shimmering ectoplasmic substance briefly coats
 *                     the subject or area. Evaporates in 1 round.
 *   - `"mental"`:     A subtle chime rings once (or continuously) in the minds of
 *                     creatures within 15 ft. of the manifester or subject.
 *   - `"olfactory"`:  An odd, hard-to-pin-down scent spreads 20 ft. from the manifester,
 *                     fading almost immediately.
 *   - `"visual"`:     The manifester's eyes burn like silver fire; a rainbow flash sweeps
 *                     5 ft. from the manifester and dissipates.
 *
 * A power may have MULTIPLE displays simultaneously (e.g., `["auditory", "visual"]`).
 * Powers marked "see text" in an original source should use the display type that most
 * closely describes the unique text description.
 *
 * SUPPRESSING DISPLAYS:
 *   To manifest without any display, the manifester makes a Concentration check
 *   (DC 15 + power level). Handled by the UI / Dice Engine — not by the engine's
 *   DAG pipeline.
 *
 * ONLY relevant when `MagicFeature.magicType === "psionic"`.
 * For arcane/divine spells, the `displays` array should be empty or absent.
 *
 * @see ARCHITECTURE.md section 5.2.1 — MagicFeature psionic fields
 * @see SRD: /srd/psionic/psionicPowersOverview.html#auditory (et seq.)
 */
export type PsionicDisplay =
  | 'auditory'    // Bass hum; heard up to 100 ft.
  | 'material'    // Ectoplasmic coating; evaporates in 1 round
  | 'mental'      // Subtle chime in nearby minds (15 ft.)
  | 'olfactory'   // Odd scent; spreads 20 ft., fades quickly
  | 'visual';     // Silver eye-fire + rainbow flash at 5 ft.

// =============================================================================
// MAGIC FEATURE — Spells and psionic powers
// =============================================================================

/**
 * An augmentation rule for psionic powers (or custom augmentable abilities).
 *
 * In D&D 3.5 Expanded Psionics Handbook, psionic powers can be augmented by
 * spending additional Power Points. Each augmentation level costs more PP and
 * provides an additional effect (extra damage dice, extended duration, etc.).
 *
 * D20SRD CONVERSION NOTE (C-15c/d):
 *   The conversion pipeline specifies `effectDescription.en/fr` on each augmentation
 *   to describe the effect in human-readable terms. This is required for two scenarios:
 *   1. MECHANICAL augmentations (e.g., +1d10 damage): the description supplements
 *      the `grantedModifiers[].sourceName` with a full sentence explanation.
 *   2. QUALITATIVE augmentations (e.g., "change energy type", "manifest as swift
 *      action"): `grantedModifiers` may be empty or contain a flag-only modifier;
 *      `effectDescription` carries the only human-readable description of the effect.
 *
 * CastingPanel UI contract:
 *   - Display `effectDescription` (if present) as the augmentation's label/tooltip.
 *   - If absent, fall back to the first `grantedModifiers[0].sourceName`.
 *   - Never error if both are absent (some augmentations are description-only placeholders).
 *
 * Example: "Mind Thrust" (1d10 base) can be augmented for +1d10 per 2 extra PP.
 * ```json
 * {
 *   "costIncrement": 2,
 *   "effectDescription": {
 *     "en": "For every 2 additional power points you spend, this power's damage increases by 1d10.",
 *     "fr": "Pour chaque 2 points de pouvoir supplémentaires dépensés, les dégâts augmentent de 1d10."
 *   },
 *   "grantedModifiers": [{ "targetId": "combatStats.power_damage_bonus", "value": "1d10", ... }],
 *   "isRepeatable": true
 * }
 * ```
 *
 * Example: qualitative-only augmentation (no pipeline modifier):
 * ```json
 * {
 *   "costIncrement": 4,
 *   "effectDescription": {
 *     "en": "You may change the energy type to cold, electricity, fire, or sonic.",
 *     "fr": "Vous pouvez changer le type d'énergie en froid, électricité, feu ou son."
 *   },
 *   "grantedModifiers": [],
 *   "isRepeatable": false
 * }
 * ```
 *
 * @see ARCHITECTURE.md section 5.2.2 — AugmentationRule fields and CastingPanel contract
 * @see D20SRD_CONVERSION.md C-15c/d — conversion spec for psionic powers
 */
export interface AugmentationRule {
  /**
   * The additional Power Point cost for this augmentation step.
   * Added on top of the power's base cost.
   * Total cost (base + all applied increments) is capped at the manifester's level.
   */
  costIncrement: number;

  /**
   * Human-readable description of the augmentation's effect, in both languages.
   *
   * REQUIRED for qualitative augmentations (energy type changes, action type changes,
   * targeting changes) where `grantedModifiers` is empty or contains only flag-like
   * pipeline modifications that are not self-explanatory.
   *
   * OPTIONAL for purely mechanical augmentations where `grantedModifiers[0].sourceName`
   * already clearly describes the effect (e.g., "+1d10 fire damage").
   *
   * The CastingPanel displays this text verbatim in the augmentation picker UI.
   *
   * Must be present if `grantedModifiers` is empty — otherwise augmentation has no
   * description at all and would appear as a blank entry in the UI.
   */
  effectDescription?: LocalizedString;

  /**
   * The modifiers granted by this augmentation level.
   *
   * For mechanical effects (damage, range, duration increases):
   *   Use StandardModifier objects targeting appropriate combat stat pipelines.
   *   E.g.: `{ "targetId": "combatStats.power_damage_bonus", "value": "1d6", ... }`
   *
   * For qualitative effects (change targeting, energy type, spell-like behaviour):
   *   May be empty `[]`. The `effectDescription` field carries the description.
   *
   * These modifiers are NOT processed by the static DAG pipeline. Instead, the
   * CastingPanel reads them at manifestion time and applies them transiently to
   * the current cast context only. They do NOT appear in the character sheet.
   */
  grantedModifiers: Modifier[];

  /**
   * Whether this augmentation can be applied multiple times.
   * `true`: The manifester can spend multiple increments (e.g., +1d10 per 2 PP,
   *         spending up to manifester level total PP across all augmentations).
   * `false`: This augmentation can only be applied once per manifestation.
   *          Example: "Spend 6 extra PP to treat this as a Greater power" — once is enough.
   */
  isRepeatable: boolean;
}

/**
 * A Feature representing a spell (arcane or divine) or psionic power.
 *
 * Extends `Feature` with magic-specific metadata:
 *   - Magic type (arcane, divine, psionic)
 *   - Spell lists (which classes can cast this spell and at what level)
 *   - School, descriptors (for spell resistance checks, immunity interactions)
 *   - Range, area, duration (displayed in the spell detail modal)
 *   - Saving throw type (for DC calculation and effect description)
 *   - Psionic augmentation rules
 *
 * SPELL SAVE DC CALCULATION:
 *   10 + spell level + key ability modifier (INT for arcane, WIS for divine, etc.)
 *   The spell level is read from `spellLists[casterClassId]`.
 *   The key ability is defined on the caster class Feature (future Phase 12 data).
 *
 * ARCANE/DIVINE/PSIONIC TRANSPARENCY (SRD rule):
 *   By default, SR and PR are equivalent (Magic-Psionic Transparency rule).
 *   This is implemented as a rule source "srd_psionic_transparency" that creates
 *   cross-modifiers making SR = PR. Disabling this source disables the rule.
 * @see ARCHITECTURE.md section 15.2.
 */
export interface MagicFeature extends Feature {
  category: 'magic';

  /**
   * The source of magic for this ability.
   * Determines which key ability (INT/WIS/CHA) governs the save DC,
   * which classes can learn it, and whether Arcane Spell Failure applies.
   */
  magicType: 'arcane' | 'divine' | 'psionic';

  /**
   * Dictionary mapping class IDs to the spell/power level for that class.
   *
   * Examples:
   *   { "list_wizard": 3, "list_cleric": 3 }   → Level 3 spell for both Wizard and Cleric
   *   { "list_sorcerer": 5 }                    → Sorcerer-only level 5 spell
   *   { "list_psion_telepath": 2 }               → Psion (telepath discipline) level 2 power
   *
   * Used by the Grimoire (Phase 12.2) to filter spells relevant to the character's
   * active classes (e.g., only show cleric spells up to 1/2 caster level rounded down).
   *
   * A missing class ID means the power/spell is NOT on that class's list.
   */
  spellLists: Record<ID, number>;

  /**
   * The school of magic for arcane/divine spells.
   *
   * For `magicType: "arcane"` or `"divine"`:
   *   One of the eight schools of magic from the SRD, plus "universal":
   *   "abjuration" | "conjuration" | "divination" | "enchantment" |
   *   "evocation" | "illusion" | "necromancy" | "transmutation" | "universal"
   *
   * For `magicType: "psionic"`:
   *   Use this field for backward compatibility with legacy psionic entries that
   *   stored the discipline name here (e.g., "clairsentience"). ALL NEW psionic
   *   power entries should use the dedicated `discipline` field instead, and set
   *   `school` to `""` (empty) or the discipline string for display convenience.
   *
   *   The canonical machine-readable discipline value is ALWAYS `discipline`, not `school`.
   *   The engine reads `discipline` for game-mechanical psionic queries.
   *   `school` on psionic powers is informational/display text only.
   *
   * @see discipline — the canonical psionic discipline field
   */
  school: string;

  /**
   * Optional sub-school within the main school (arcane/divine) or
   * subdiscipline within the psionic discipline.
   *
   * Arcane/Divine examples: "calling" (within Conjuration), "charm" (Enchantment),
   *   "creation" (Conjuration), "summoning" (Conjuration), "scrying" (Divination)
   *
   * Psionic subdiscipline examples (same value, different field context):
   *   "scrying" (within Clairsentience), "creation" (within Metacreativity),
   *   "healing" (within Psychometabolism), "teleportation" (within Psychoportation),
   *   "charm" (within Telepathy), "compulsion" (within Telepathy)
   */
  subSchool?: string;

  /**
   * The psionic discipline this power belongs to.
   *
   * ONLY set for `magicType: "psionic"` powers.
   * `undefined` for all arcane and divine spells.
   *
   * D&D 3.5 SRD defines six disciplines:
   *   clairsentience | metacreativity | psychokinesis |
   *   psychometabolism | psychoportation | telepathy
   *
   * RELATIONSHIP TO `school`:
   *   `discipline` is the canonical, typed field for psionic powers.
   *   `school` on a psionic power may hold the same string as a display fallback,
   *   but all engine-level queries should use `discipline`.
   *
   * USES IN THE ENGINE:
   *   - DataLoader query `"discipline:clairsentience"` → powers of that discipline.
   *   - Psion specialist class restrictions (Seer can access extra clairsentience powers).
   *   - Psicraft DC calculation (+5 DC to identify powers from a non-specialist discipline).
   *   - UI filtering in the Psionic Powers panel (Phase 12) — group by discipline.
   *   - Psicraft "detect psionics" check (SRD: see discipline of psionic aura).
   *
   * @see PsionicDiscipline for the full type documentation
   * @see ARCHITECTURE.md section 5.2.1 — Psionic power fields
   */
  discipline?: PsionicDiscipline;

  /**
   * Sensory effects observable when this power is manifested.
   *
   * ONLY relevant for `magicType: "psionic"` powers.
   * For arcane/divine spells, this array should be empty or absent.
   *
   * A power can have multiple simultaneous display types.
   * Examples:
   *   []                      → No display (rare; most powers have at least one)
   *   ["auditory"]            → Bass hum only
   *   ["visual"]              → Silver eye-fire + rainbow flash
   *   ["auditory", "visual"]  → Both hum and visual effect
   *   ["material", "olfactory"] → Ectoplasmic coating + odd scent
   *
   * MECHANICAL USE:
   *   The Concentration DC to suppress ALL displays is: 15 + power level.
   *   The `displays` array is read by the psionic casting panel (Phase 12.3) to:
   *     1. Show which displays will be observable when manifesting.
   *     2. Offer a "Suppress Display" option (with Concentration check button).
   *   Displays have NO mechanical effect during combat per the SRD.
   *
   * AUTHORING NOTE:
   *   Original SRD power descriptions use letters: "A" (auditory), "Ma" (material),
   *   "Me" (mental), "Ol" (olfactory), "Vi" (visual). JSON data content should
   *   translate these abbreviations to full `PsionicDisplay` string values.
   *
   * @see PsionicDisplay for the full type documentation and SRD definitions
   * @see ARCHITECTURE.md section 5.2.1 — Psionic power fields
   */
  displays?: PsionicDisplay[];

  /**
   * Array of descriptor tags.
   * Examples: ["fire", "evil"], ["mind-affecting", "compulsion", "language-dependent"]
   * Used for immunity/resistance checks (fire immunity blocks fire spells, etc.).
   */
  descriptors: string[];

  /**
   * Whether the spell is subject to magic resistance, psionic resistance, or neither.
   */
  resistanceType: 'spell_resistance' | 'power_resistance' | 'none';

  /**
   * Material, somatic, verbal, or psionic components required.
   * Arcane/Divine examples: ["V", "S", "M"], ["V", "S", "DF"]
   * Psionic examples: ["A"] (Auditory), ["M"] (Material), ["V"] (Visual), ["O"] (Olfactory)
   *
   * Used by the arcane spell failure calculation (if "S" or "M" present) and
   * for display in the spell detail modal.
   */
  components: string[];

  /**
   * Range formula or constant string.
   * Examples:
   *   "close"       → Constant range category
   *   "medium"      → Constant range category
   *   "25 + floor(@classLevels.class_wizard / 2) * 5"  → Scaling formula
   *   "@attributes.caster_level.totalValue * 30"        → Pure formula
   *
   * The Math Parser resolves `@`-prefixed variables from the character context.
   * The result is then formatted via formatDistance() for the active language.
   */
  range: string;

  /**
   * Localised description of the target/area of effect.
   * Examples: { en: "One creature", fr: "Une creature" }
   *            { en: "20-ft. radius spread", fr: "Rayon de 6 m" }
   */
  targetArea: LocalizedString;

  /**
   * Duration formula or constant string.
   * Can reference variables: "1 round per @classLevels.class_cleric level".
   * The Math Parser resolves these for display in the spell detail modal.
   */
  duration: string;

  /**
   * Saving throw type.
   * Standard D&D 3.5 values: "fort_half", "ref_negates", "will_disbelieves", "none"
   * Or a custom string for complex cases (e.g., "fort_partial, will_negates").
   * Used to calculate and display the save DC in the casting panel (Phase 12.3).
   */
  savingThrow: 'fort_half' | 'ref_negates' | 'will_disbelieves' | 'none' | string;

  /**
   * Optional psionic augmentation rules.
   * Exclusive to `magicType: "psionic"` (or custom rules for augmentable magic).
   * If present, the UI displays augmentation options in the casting panel.
   * @see AugmentationRule for full documentation.
   */
  augmentations?: AugmentationRule[];
}
