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
import type { Modifier } from './pipeline';

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
   *   - BAB increment (type: "base", targetId: "combatStats.bab", value: 1 or 0)
   *   - Fort save increment (type: "base", targetId: "saves.fort", value: 1 or 0)
   *   - Ref save increment (type: "base", targetId: "saves.ref", value: 1 or 0)
   *   - Will save increment (type: "base", targetId: "saves.will", value: 1 or 0)
   *   - HP die (type: "base", targetId: "stat_max_hp", value: "d10" or formula)
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
   * Example for a Fighter: ["stat_str", "stat_con", "stat_dex"]
   * Example for a Wizard:  ["stat_int", "stat_dex", "stat_con"]
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
      | 'hours';

    /**
     * Optional resource consumed when this ability is activated.
     * `targetId` references a `ResourcePool.id` (e.g., "resources.turn_undead").
     * `cost` is the amount consumed per activation (number or formula string).
     */
    resourceCost?: {
      targetId: ID;
      cost: number | string;
    };
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
 *   handled via a modifier with `value: "floor(@attributes.stat_str.derivedModifier * 1.5)"`.
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
    wieldCategory: 'light' | 'one_handed' | 'two_handed';

    /**
     * Base damage dice expression.
     * Examples: "1d4", "1d8", "2d6"
     * Actual damage formula appended by the engine: "1d8 + @attributes.stat_str.derivedModifier"
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
}

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
 * Example: "Mind Thrust" (1d10 base) can be augmented for +1d10 per 2 extra PP.
 * This would be represented as:
 * ```json
 * { "costIncrement": 2, "grantedModifiers": [{...damage+1d10...}], "isRepeatable": true }
 * ```
 */
export interface AugmentationRule {
  /**
   * The additional Power Point cost for this augmentation step.
   * Added on top of the power's base cost.
   */
  costIncrement: number;

  /**
   * The modifiers granted by this augmentation level.
   * These are added to the power's base effect when the augmentation is applied.
   */
  grantedModifiers: Modifier[];

  /**
   * Whether this augmentation can be applied multiple times.
   * `true`: The manifester can spend multiple increments (e.g., +1d10 per 2 PP, up to manifester level).
   * `false`: This augmentation can only be applied once.
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
   * The school of magic or psionic discipline.
   * Arcane/Divine: "abjuration", "conjuration", "divination", "enchantment",
   *   "evocation", "illusion", "necromancy", "transmutation", "universal"
   * Psionic: "clairsentience", "metacreativity", "psychokinesis",
   *   "psychometabolism", "psychoportation", "telepathy"
   */
  school: string;

  /**
   * Optional sub-school within the main school.
   * Examples: "calling" (within Conjuration), "charm" (within Enchantment)
   */
  subSchool?: string;

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
