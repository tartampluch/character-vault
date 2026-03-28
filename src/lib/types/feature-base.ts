/**
 * @file feature-base.ts
 * @description Base Feature types: FeatureCategory, MergeStrategy, FeatureChoice,
 * LevelProgressionEntry, ResourcePoolTemplate, ActivationTier, and the core Feature interface.
 *
 * Extracted from feature.ts. Import from 'feature.ts' (barrel) for backward compatibility.
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
   * EXAMPLE — Weapon Focus (feat_weapon_focus):
   * Player selects `item_longbow` → engine emits `feat_weapon_focus_item_longbow`.
   * Arcane Archer can then require: `has_tag "feat_weapon_focus_item_longbow"`.
   *
   * @see ARCHITECTURE.md section 5.3 — FeatureChoice and active tag derivation
   */
  choiceGrantedTagPrefix?: string;

  /**
   * Optional list of other `choiceId` values within the SAME Feature whose
   * selected value must be excluded from THIS choice's option list.
   *
   * USE CASE — Cleric domains: prevent picking the same domain twice.
   *
   * @see FeatureChoice.excludedBy in feature.ts for full documentation
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
 */
export interface LevelProgressionEntry {
  /**
   * The class level this entry applies to.
   * 1-indexed: level 1 is the first entry.
   */
  level: number;

  /**
   * Feature IDs granted at this level.
   */
  grantedFeatures: ID[];

  /**
   * Modifiers granted at this specific level increment.
   *
   * CRITICAL DESIGN: These are INCREMENT values, not cumulative totals.
   * The engine SUMS all `grantedModifiers` of type `"base"` from all entries
   * up to and including the character's current level in this class.
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
 * @see ActiveFeatureInstance.itemResourcePools — the runtime state storage
 * @see GameEngine.initItemResourcePools()       — idempotent initialisation
 * @see ARCHITECTURE.md section 5.7              — full design documentation
 */
export interface ResourcePoolTemplate {
  /** Stable identifier for this pool within the item instance. */
  poolId: string;

  /** Localized display label for this pool. */
  label: LocalizedString;

  /** ID of the pipeline that computes the MAXIMUM allowed value. */
  maxPipelineId: ID;

  /**
   * The starting current value when this pool is first initialised on an item instance.
   * `initItemResourcePools()` uses this value ONLY for pools not yet present.
   */
  defaultCurrent: number;

  /**
   * When and how this pool automatically resets.
   * Shares the same union as `ResourcePool.resetCondition`.
   */
  resetCondition: ResourcePool['resetCondition'];

  /**
   * Amount restored per tick for `"per_turn"` or `"per_round"` reset conditions.
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
 * @see Feature.activation.tieredResourceCosts — parent field
 * @see GameEngine.activateWithTier()          — execution method
 * @see ARCHITECTURE.md section 5              — tiered activation specification
 */
export interface ActivationTier {
  /** Localized label describing this power tier. */
  label: LocalizedString;

  /**
   * The ID of the pool to deduct charges from.
   * References a key in `ActiveFeatureInstance.itemResourcePools` (E-2)
   * OR a `Character.resources` pool ID for class-based tiered abilities.
   */
  targetPoolId: string;

  /**
   * Number of charges (or uses) to deduct when this tier is chosen.
   * Formula strings are supported for dynamic cost scaling.
   */
  cost: number | string;

  /**
   * Transient modifiers activated for this specific use of the ability.
   * These are NOT permanently added to the character sheet.
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
   */
  label: LocalizedString;

  /**
   * Localised description text.
   * May contain `@`-path variables with pipe operators for dynamic values.
   */
  description: LocalizedString;

  /**
   * Array of tags on this feature.
   *
   * DUAL PURPOSE:
   *   1. Membership testing: `@activeTags` contains all tags from all active Features.
   *   2. Routing: `optionsQuery: "tag:domain"` finds all Features with "domain" in tags.
   */
  tags: string[];

  /**
   * Optional list of tags that PROHIBIT this feature from applying its modifiers.
   * If the character's `@activeTags` contains ANY of these forbidden tags, the
   * feature's `grantedModifiers` are suppressed.
   */
  forbiddenTags?: string[];

  /**
   * Optional prerequisite logic tree for feature activation/selection.
   * Evaluated by `logicEvaluator.ts`.
   */
  prerequisitesNode?: LogicNode;

  /**
   * All modifiers this feature grants to character pipelines.
   * The "payload" of the feature — the actual mechanical effects.
   */
  grantedModifiers: Modifier[];

  /**
   * IDs of other Features that this feature automatically activates.
   * Used for classes granting class features, races granting racial abilities, etc.
   * In partial merge context, entries prefixed with "-" remove an ID from the base.
   */
  grantedFeatures: ID[];

  /**
   * Optional player-facing choices associated with this feature.
   * @see FeatureChoice for full documentation.
   */
  choices?: FeatureChoice[];

  /**
   * The rule source identifier this feature belongs to.
   * MANDATORY FIELD. Used by the DataLoader to filter by enabled sources.
   */
  ruleSource: ID;

  /**
   * The merge strategy for the Data Override system.
   * @see MergeStrategy for full documentation.
   */
  merge?: MergeStrategy;

  /**
   * Level progression table for class features.
   * ONLY used when `category === "class"`.
   * @see LevelProgressionEntry for individual entry documentation.
   */
  levelProgression?: LevelProgressionEntry[];

  /**
   * Recommended ability scores for this class, used by the Point Buy UI.
   * ONLY used when `category === "class"`. Zero mechanical impact.
   */
  recommendedAttributes?: ID[];

  /**
   * List of skill IDs that are class skills for characters with this feature.
   * The engine unions `classSkills` from ALL active Features.
   */
  classSkills?: ID[];

  /**
   * Optional charge / use pools scoped to each individual instance of this item.
   * Present ONLY on features that represent charged items.
   * @see ResourcePoolTemplate — the template interface
   */
  resourcePoolTemplates?: ResourcePoolTemplate[];

  /**
   * Optional activation data for active abilities (Ex/Su/Sp).
   * Presence indicates the feature requires an action to use.
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
      | 'passive'
      | 'reaction';

    /**
     * Optional resource consumed when this ability is activated.
     * Mutually exclusive with `tieredResourceCosts`.
     */
    resourceCost?: {
      targetId: ID;
      cost: number | string;
    };

    /**
     * Optional tiered resource costs for variable-spend abilities.
     * Use when the player has a choice of power level (e.g., Ring of the Ram).
     * @see ActivationTier for full documentation.
     */
    tieredResourceCosts?: ActivationTier[];

    /**
     * Optional trigger event identifier for `"reaction"` action types.
     * Indicates the in-world event that automatically fires this ability.
     */
    triggerEvent?: string;
  };

  /**
   * Optional action-economy budget this feature enforces when active.
   * Used by conditions and status effects to restrict available actions.
   * @see ARCHITECTURE.md section 5.6 — actionBudget field full reference
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
