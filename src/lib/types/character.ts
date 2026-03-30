/**
 * @file character.ts
 * @description The Character entity — the global state container for one playable
 *              character, NPC, or monster in the engine.
 *
 * Design philosophy:
 *   The Character is an Entity in the ECS sense: it is a DATA AGGREGATOR only.
 *   It holds NO game logic. All calculated values (final AC, total BAB, etc.) are
 *   DERIVED by the GameEngine (Phase 3) from the raw state stored here.
 *
 *   THE SOURCE OF TRUTH:
 *   - `activeFeatures` is the canonical source for ALL abilities and bonuses.
 *     The entire character sheet is derived from this array + `classLevels`.
 *   - `attributes.*.baseValue` stores the player-assigned base scores.
 *   - `skills.*.ranks` stores invested skill points.
 *   - `resources.*.currentValue` stores current HP, psi points, etc.
 *
 *   WHAT IS NOT STORED (computed at runtime):
 *   - totalBonus, totalValue, derivedModifier (pipeline computed values)
 *   - activeModifiers, situationalModifiers (flattened by Phase 0 DAG)
 *   - isClassSkill (derived from active class features' classSkills arrays)
 *   - Any final stat totals
 *
 *   SERIALIZATION SAFETY:
 *   The `LinkedEntity` type has a strict unidirectional design to prevent circular
 *   JSON serialization. A familiar knows nothing about its master. The master
 *   references the familiar. `JSON.stringify()` on a Character is always safe.
 *
 * @see src/lib/engine/GameEngine.svelte.ts (Phase 3) for DAG derivation logic.
 * @see src/lib/engine/StorageManager.ts    (Phase 4.1) for persistence.
 */

import type { ID } from './primitives';
import type { StatisticPipeline, SkillPipeline, ResourcePool } from './pipeline';

// =============================================================================
// ACTIVE FEATURE INSTANCE — A Feature activated on a specific character
// =============================================================================

/**
 * Represents a Feature that is currently active on a character.
 *
 * WHY AN INSTANCE WRAPPER?
 *   The same Feature definition (e.g., "feat_weapon_focus") can appear on many
 *   characters, each with DIFFERENT player choices (different weapon type selected).
 *   The `ActiveFeatureInstance` separates the DEFINITION (what the feat does —
 *   stored in the JSON) from the INSTANCE (which specific weapon this character chose).
 *
 *   It also allows:
 *   - Multiple instances of the same feature type (e.g., multiple items with the
 *     same base item ID but different customizations).
 *   - Toggle on/off without removing the feature (for buffs, conditions, etc.).
 *
 * SELECTIONS RECORD:
 *   `selections` stores the player's choices for `FeatureChoice` prompts.
 *   Key: the `FeatureChoice.choiceId`
 *   Value: array of selected Feature IDs (strings)
 *
 *   Example for Weapon Focus (longsword):
 *   ```json
 *   { "weapon_choice": ["item_longsword"] }
 *   ```
 *   This is referenced by conditional modifier logic via `@selection.weapon_choice`.
 */
export interface ActiveFeatureInstance {
  /**
   * Unique UUID generated when the feature is first activated on this character.
   * This is NOT the Feature ID — it is a per-character-activation identifier.
   * Allows multiple instances of the same feature (e.g., two different rings).
   *
   * Convention: "afi_<featureId>_<timestamp>" or any UUID string.
   */
  instanceId: ID;

  /**
   * The ID of the Feature JSON this instance references.
   * The DataLoader fetches the full Feature data using this ID.
   * Example: "feat_weapon_focus", "item_ring_of_protection_2", "race_elf"
   */
  featureId: ID;

  /**
   * Whether this feature is currently contributing its modifiers to the engine.
   *
   * `true`:  The feature's `grantedModifiers` are included in the DAG calculation.
   * `false`: The feature is "unequipped" or "deactivated". Its modifiers are ignored.
   *          The instance remains in `activeFeatures` for UI display purposes.
   *
   * Used for:
   *   - Equipment items: `false` = carried in backpack (weight counts, bonuses don't).
   *   - Buffs/conditions: `false` = buff has expired.
   *   - Rage: toggled by the player during combat.
   */
  isActive: boolean;

  /**
   * Optional player-assigned custom name, overriding the feature's default label.
   * Useful for renamed magic items ("Grandpa's Sword" instead of "Longsword +2").
   * If absent, the UI displays the feature's localized `label`.
   */
  customName?: string;

  /**
   * Player's selection choices for `FeatureChoice` prompts on this feature.
   * Each key matches a `FeatureChoice.choiceId`.
   * Each value is an array of selected Feature/option IDs.
   *
   * Example: Weapon Focus feat with longsword selected:
   * ```typescript
   * { weapon_choice: ["item_longsword"] }
   * ```
   *
   * Example: Cleric with two domains selected:
   * ```typescript
   * { domain_1: ["domain_fire"], domain_2: ["domain_war"] }
   * ```
   *
   * These selections are referenced by conditional modifiers via `@selection.<choiceId>`.
   */
  selections?: Record<ID, string[]>;

  /**
   * Whether this item is stashed in remote storage (wagon, home, bank vault).
   *
   * Architecture §13.2 defines THREE inventory sections:
   *   1. Equipped (isActive: true)      — contributes modifiers + weight
   *   2. Backpack (isActive: false, !isStashed) — weight only
   *   3. Storage  (isStashed: true)     — neither modifiers nor weight
   *
   * WHY SEPARATE FROM isActive:
   *   isActive controls whether modifiers are applied to the DAG.
   *   isStashed controls whether the item counts toward carried weight.
   *   A stashed item is always isActive=false, but not all isActive=false items are stashed.
   *
   * Default: undefined/false (item is in backpack, not stashed).
   */
  isStashed?: boolean;

  /**
   * Ephemeral activation data — present on feature instances created by consuming
   * a potion, oil, or any one-shot / duration-limited item.
   *
   * DESIGN — WHY A DEDICATED FIELD:
   *   When a character drinks a Potion of Bull's Strength, the engine creates a new
   *   `ActiveFeatureInstance` (isActive: true) carrying the +4 STR enhancement modifier.
   *   This instance is "ephemeral" — it has a finite life and is not part of the
   *   character's permanent equipment. Without a separate field, there is no way to
   *   distinguish a permanent ring effect from a temporary potion effect in the UI.
   *
   *   `ephemeral: true` signals the UI to:
   *   1. Display the instance in the "Active Effects" panel (not in Inventory).
   *   2. Show an "Expire" button that the player can click to end the effect early.
   *   3. Show a visual countdown if `appliedAtRound` is provided.
   *
   * LIFECYCLE:
   *   - Created by `GameEngine.consumeItem()` when a consumable is used.
   *   - Removed by `GameEngine.expireEffect()` when:
   *       (a) The player clicks the "Expire" button.
   *       (b) The session manager auto-expires based on in-game time (future feature).
   *   - Never written to permanent equipment storage.
   *
   * `appliedAtRound`:
   *   The in-game combat round (or 0 for out-of-combat) when the effect was applied.
   *   Used by the UI to display "applied N rounds ago" for time-tracking.
   *   Absent for effects applied outside combat.
   *
   * `sourceItemInstanceId`:
   *   The `instanceId` of the originating item (if consumed from inventory).
   *   Used for traceability in the UI ("from Potion of Bull's Strength").
   *   Absent for effects created without a corresponding inventory item.
   *
   * @see GameEngine.consumeItem() — creates ephemeral instances
   * @see GameEngine.expireEffect() — removes ephemeral instances
   * @see EphemeralEffectsPanel.svelte — the "Active Effects" UI panel
   */
  ephemeral?: {
    /** Whether this instance was created by consuming a one-shot item. */
    isEphemeral: true;
    /** Combat round when the effect was applied (0 = out of combat). */
    appliedAtRound?: number;
    /** instanceId of the source item (for display traceability). */
    sourceItemInstanceId?: ID;
    /** Human-readable duration hint from the item description (e.g. "3 minutes"). */
    durationHint?: string;
  };

  /**
   * Instance-scoped resource pool current values for charged items.
   *
   * D&D 3.5 CONTEXT — WHY INSTANCE-SCOPED:
   *   Charges on a Ring of the Ram, uses-per-day on a Ring of Spell Turning, or
   *   weekly uses on an Elemental Command ring belong to THE SPECIFIC ITEM, not to
   *   the character in general. If the character trades the ring away, whoever receives
   *   it should get the remaining charges, not start fresh.
   *
   *   `Character.resources` holds pools that belong to the CHARACTER (HP, spell slots,
   *   Rage rounds). This field holds pools that belong to THIS SPECIFIC ITEM INSTANCE.
   *
   * DATA MODEL:
   *   Key:   `poolId` — matches a `ResourcePoolTemplate.poolId` on the parent Feature.
   *   Value: `currentValue` — the current charge / uses count for this item instance.
   *
   * LIFECYCLE:
   *   - On first equip: `GameEngine.initItemResourcePools()` populates missing keys
   *     using the Feature's `resourcePoolTemplates[n].defaultCurrent`. Idempotent.
   *   - During play: `GameEngine.spendItemPoolCharge()` decrements atomically.
   *   - At dawn/weekly reset: `triggerDawnReset()` / `triggerWeeklyReset()` restore
   *     pools whose template has `resetCondition: "per_day"` or `"per_week"`.
   *   - On item transfer: move the entire `ActiveFeatureInstance` (including this field)
   *     to the recipient character — charges travel with the item.
   *
   * EXAMPLES:
   *   Ring of the Ram, 23 charges remaining:
   *   ```json
   *   { "charges": 23 }
   *   ```
   *   Ring of Spell Turning, 1 of 3 daily uses remaining:
   *   ```json
   *   { "spell_turning_uses": 1 }
   *   ```
   *
   * Items without `resourcePoolTemplates` on their Feature definition
   * (the vast majority of items) will have this field as `undefined`.
   *
   * @see Feature.resourcePoolTemplates — the static charge pool schema on the item definition
   * @see GameEngine.initItemResourcePools() — idempotent initialisation on equip
   * @see GameEngine.spendItemPoolCharge()  — atomic charge deduction
   * @see ARCHITECTURE.md section 5.7 — full instance-scoped pool documentation
   */
  itemResourcePools?: Record<string, number>;
}

// =============================================================================
// LINKED ENTITY — Familiars, animal companions, mounts, summoned creatures
// =============================================================================

/**
 * Represents a creature linked to the character (familiar, animal companion, etc.).
 *
 * CRITICAL DESIGN CONSTRAINT — UNIDIRECTIONAL REFERENCE:
 *   The relationship is STRICTLY UNIDIRECTIONAL:
 *     Master  → holds `LinkedEntity[]` (references the linked creature)
 *     Familiar → has NO back-reference to its master
 *
 *   WHY THIS MATTERS:
 *   A circular reference (master ↔ familiar) would cause infinite recursion in:
 *     - `JSON.stringify()` (stack overflow during save)
 *     - TypeScript type checking (circular type error)
 *     - Any recursive tree traversal in the engine
 *
 *   The familiar's stats that depend on the master (e.g., "master's character level")
 *   are accessed via the `@master.classLevels.<classId>` path in the Math Parser.
 *   This path is resolved BY THE ENGINE when evaluating a LinkedEntity's character,
 *   with the master's context injected temporarily during the evaluation.
 *
 * RECURSIVE CHARACTER STRUCTURE:
 *   `characterData: Character` means a familiar is a FULL character with its own:
 *   - `activeFeatures` (its racial features, class levels if applicable, items)
 *   - `attributes` (its own STR, DEX, etc.)
 *   - `resources` (its own HP)
 *   This allows even complex linked entities (like Cleric cohorts or Dragon companions)
 *   to be fully represented without special-casing.
 */
export interface LinkedEntity {
  /**
   * Unique identifier for this linked entity instance.
   * Generated when the link is established (e.g., when a Wizard gets a familiar).
   */
  instanceId: ID;

  /**
   * The type of link/relationship between character and linked entity.
   * Used by the UI to display the appropriate label ("Familiar", "Animal Companion", etc.).
   */
  entityType: 'companion' | 'familiar' | 'mount' | 'summon';

  /**
   * The ID of the Feature on the MASTER CHARACTER that created this link.
   * Example: "class_feature_wizard_familiar" for a Wizard's familiar.
   * Used to find the bonding feature for display and for @master path resolution context.
   */
  bondingFeatureId: ID;

  /**
   * The full character data for the linked entity.
   * This IS a recursive structure: a Character containing a LinkedEntity[]
   * containing more Characters... but in practice, nesting beyond 1-2 levels is rare.
   *
   * SERIALIZATION NOTE:
   *   This is safe to serialize because the inner `Character.linkedEntities`
   *   can be empty (no further linked entities for a familiar's familiar).
   *   The engine limits nesting depth to prevent memory issues.
   *
   * ⚠️ FORBIDDEN: Do NOT add a `masterId` or `parentCharacter` field here.
   *    The back-reference is explicitly prohibited to prevent circular serialization.
   */
  characterData: Character;
}

// =============================================================================
// CHARACTER — The global state container
// =============================================================================

/**
 * The entire state of one character (PC, NPC, or monster).
 *
 * STORAGE STRATEGY:
 *   When saved to localStorage or the PHP API, only the "source of truth" fields
 *   are persisted. The engine reconstructs all derived values at load time.
 *
 *   STORED (raw player choices & play state):
 *   - `id`, `name`, all metadata fields
 *   - `classLevels` (current level in each class)
 *   - `activeFeatures` (all features and their activation state + selections)
 *   - `attributes.*.baseValue` (player-assigned base scores for each attribute pipeline)
 *   - `skills.*.ranks` (invested skill points per skill)
 *   - `resources.*.currentValue` and `resources.*.temporaryValue` (in-play resource usage)
 *   - `linkedEntities` (recursively stored)
 *   - `gmOverrides` (GM-only secret overrides, stored separately in the API)
 *
 *   NOT STORED (recomputed by the engine at load):
 *   - `attributes.*.totalBonus`, `totalValue`, `derivedModifier`
 *   - `attributes.*.activeModifiers`, `situationalModifiers`
 *   - `combatStats.*` (all derived from attributes + features)
 *   - `saves.*` (all derived from class levels + CON/DEX/WIS)
 *   - `skills.*.totalBonus`, `totalValue`, `isClassSkill`
 *
 * MULTICLASSING:
 *   `classLevels` is the central multiclassing data structure.
 *   Example: `{ "class_fighter": 5, "class_wizard": 3 }` = Fighter 5 / Wizard 3
 *   Character Level = sum of all values = 8
 *   The GameEngine reads each class Feature's `levelProgression` table up to
 *   the declared level to accumulate BAB, save increments, and class features.
 *
 * GM OVERRIDES:
 *   `gmOverrides` contains `ActiveFeatureInstance`s injected secretly by the GM.
 *   These are processed last in the resolution chain (after all rule sources and
 *   global overrides). The player never sees this field or its raw content —
 *   they only see the final calculated result.
 *   @see ARCHITECTURE.md section 6.3 for usage examples.
 */
export interface Character {
  // ---------------------------------------------------------------------------
  // Core identity
  // ---------------------------------------------------------------------------

  /**
   * Unique character identifier (UUID string).
   * Never changes after character creation.
   */
  id: ID;

  /**
   * The character's in-game name.
   * Example: "Thorin Ironforge", "Shadowmere the Black"
   */
  name: string;

  // ---------------------------------------------------------------------------
  // Campaign & UI Metadata
  // Note: Phase 6.2 adds these fields to support the Campaign Hub and Vault UI.
  // ---------------------------------------------------------------------------

  /**
   * The ID of the campaign this character belongs to.
   * Absent for characters not yet assigned to a campaign.
   */
  campaignId?: ID;

  /**
   * The user ID of the player who owns this character.
   * Used for visibility filtering in the Character Vault (Phase 7.1):
   *   - GM sees all characters.
   *   - Players see only characters where `ownerId === currentUserId`.
   */
  ownerId?: ID;

  /**
   * Whether this character is an NPC (non-player character) managed by the GM.
   *
   * Set to `true` for both NPC and Monster instances spawned from templates,
   * as well as any character the GM creates directly via "Add NPC / Monster".
   *
   * Players can see the NAME and portrait of NPC/Monster instances in their
   * campaign vault (read-only), but cannot access their character sheet or
   * see their level.  The CharacterCard uses `viewOnly` mode for these.
   */
  isNPC: boolean;

  /**
   * Subtype distinguishing NPC instances from Monster instances.
   *
   * Values:
   *   'npc'     — Spawned from an NPC template.
   *               character.name     = NPC name (from template)
   *               character.playerName = GM who spawned it (their display_name)
   *
   *   'monster' — Spawned from a Monster template.
   *               character.name     = instance name (e.g. "Wolfie", editable by GM)
   *               character.playerName = original species name (e.g. "Wolf")
   *
   *   undefined — Regular player character (isNPC = false).
   *
   * USAGE:
   *   - CharacterCard badge: 'NPC' or 'Monster' overlay on the poster.
   *   - Vault filtering: separate NPC vs. Monster template sections.
   *   - CharacterController: determines name/playerName assignment on spawn.
   */
  npcType?: 'npc' | 'monster';

  /**
   * Whether this Character record represents a TEMPLATE (not a playable instance).
   *
   * Templates are stored in the `templates` table and are edited through the
   * same character sheet UI.  The StorageManager detects this flag and routes
   * save/load calls to the `/api/templates` endpoints instead of `/api/characters`.
   *
   * This flag is set by the TemplateController when the template JSON is serialised
   * and is preserved on round-trips through the character editor.
   *
   * `undefined` / `false` — regular character or spawned NPC/Monster instance.
   * `true`                — this record IS the template blueprint itself.
   */
  isTemplate?: boolean;

  /**
   * Accessibility flag injected by CharacterController for player responses.
   *
   * When a player fetches campaign characters, the backend includes NPC/Monster
   * instances but with limited data (no classLevels, no features).  This flag
   * signals the vault page to render CharacterCard in view-only mode:
   *   - No click-through to the character sheet.
   *   - No level badge displayed.
   *
   * This field is NEVER stored in the database — it is ephemeral, injected only
   * in the GET /api/characters response for player-visibility rows.
   *
   * `undefined` — full-access character (player owns it or is GM).
   * `true`      — restricted view (player can see name/portrait only).
   */
  _playerRestricted?: boolean;

  /**
   * URL to the character portrait image.
   * Used on the Character Card (Phase 7.2) and character sheet header.
   * Falls back to a placeholder image if absent.
   */
  posterUrl?: string;

  /**
   * The name of the player controlling this character (first name, nickname, etc.).
   * Displayed on the Character Card subtitle when `customSubtitle` is absent and
   * the character is a PC (not an NPC).
   *
   * This can be a first name, nickname, or any other identifier the table uses to
   * associate a character with the person playing it — useful when a single person
   * plays multiple characters (followers, companions, hirelings).
   */
  playerName?: string;

  /**
   * Optional custom subtitle shown on the Character Card.
   * Overrides the default subtitle (playerName for PCs, race label for NPCs).
   * Example: "The Shadow Blade", "Former Merchant Prince"
   */
  customSubtitle?: string;

  /**
   * Free-form personal story / backstory text for the character.
   *
   * Displayed in the "Personal Story" section of the Lore & Languages tab.
   * Unlike `customSubtitle` (a short one-liner for the Character Card),
   * this field is intended for a longer narrative description (paragraphs).
   *
   * Not used for game mechanics — purely cosmetic / roleplay information.
   */
  notes?: string;

  /**
   * Physical appearance traits: height, weight, age, eye colour, hair, skin.
   *
   * Stored as a flat key→value record so new traits can be added without
   * schema changes. Standard keys: "height", "weight", "age", "eyes", "hair", "skin".
   *
   * Example: `{ height: "5'10\"", weight: "175 lb.", age: "27", eyes: "Green", hair: "Black", skin: "Tanned" }`
   *
   * Not used for game mechanics — purely cosmetic / roleplay information.
   */
  physicalTraits?: Record<string, string>;

  // ---------------------------------------------------------------------------
  // Multiclassing
  // ---------------------------------------------------------------------------

  /**
   * Dictionary of class Feature IDs to the character's level in that class.
   *
   * This is the CENTRAL MULTICLASSING DATA STRUCTURE.
   * The sum of all values gives the total character level.
   *
   * Examples:
   *   { "class_fighter": 10 }              → Pure Fighter 10
   *   { "class_fighter": 5, "class_wizard": 3 } → Fighter 5 / Wizard 3 (level 8)
   *   { "class_barbarian": 1, "class_ranger": 2, "class_druid_npc": 3 } → Multiclass level 6
   *
   * The GameEngine uses `classLevels[classId]` to filter `levelProgression` entries
   * from each class feature, accumulating BAB/saves/class features up to the
   * declared level in each class.
   *
   * Empty for level 0 characters (commoners with no class levels).
   *
   * MONSTER PCs / LEVEL ADJUSTMENT:
   *   Racial HD (e.g., "hd_gnoll") are also tracked here as a class-like entry.
   *   The `levelAdjustment` field (below) adds to this sum when computing ECL.
   */
  classLevels: Record<ID, number>;

  /**
   * The character's favored class, identified by class Feature ID.
   *
   * D&D 3.5 SRD RULE ("Multiclass Characters", PHB p.59):
   *   "Humans and half-elves can choose any class as their favored class.
   *    All other races each have a single, fixed favored class."
   *   The favored class is ignored when determining whether a character incurs a
   *   multiclassing XP penalty: only NON-favored classes that are 2+ levels below
   *   the highest non-favored class level impose the 20% XP penalty per class.
   *
   * OPTIONAL FIELD:
   *   Absent during character creation or for single-class characters (no penalty
   *   applies regardless). For human PCs the player must explicitly select their
   *   favored class (stored here). For non-human PCs it is typically set
   *   automatically when the race feature is activated (via `grantedModifiers`).
   *
   * USAGE:
   *   Read by `GameEngine.phase_multiclassXpPenaltyRisk` to exclude the favored
   *   class when checking whether any class level is 2+ below the highest active class.
   *
   * @example "class_fighter" (Human who chose Fighter as favored class)
   * @example "class_wizard"  (Elf whose favored class is Wizard)
   * @see ARCHITECTURE.md section 6 — Character Entity
   * @see GameEngine.phase_multiclassXpPenaltyRisk
   */
  favoredClass?: ID;

  // ---------------------------------------------------------------------------
  // Effective Character Level (ECL) — monster PCs and level adjustment variant
  // ---------------------------------------------------------------------------

  /**
   * Level Adjustment (LA) for monster player-characters and LA-variant rules.
   *
   * D&D 3.5 CONTEXT:
   *   Some races (e.g., Drow, Ogre, Half-Dragon) have a Level Adjustment that
   *   raises their Effective Character Level (ECL) above their Hit Dice count,
   *   reflecting their innate racial power.
   *
   *   ECL = sum(classLevels values) + racial HD (if tracked in classLevels) + levelAdjustment
   *
   *   ECL governs:
   *   - XP required to advance (looked up in `config_xp_table` with ECL as key)
   *   - Starting wealth calculations
   *   - Party balance (encounter budgeting)
   *
   *   BUT feat and ability score increase acquisition is governed by total HD
   *   (class levels + racial HD only, NOT adding levelAdjustment).
   *
   * MUTABILITY:
   *   This field can decrease over time via the "Reducing Level Adjustments" variant
   *   (SRD variant rules) — after accumulating 3× their current LA in class levels,
   *   a character pays XP to reduce LA by 1. This makes the field mutable in-play.
   *
   * MATH PARSER PATHS:
   *   - `@characterLevel`  = sum(classLevels values) — HD for feats/ASI only
   *   - `@eclForXp`        = sum(classLevels values) + levelAdjustment — for XP table lookups
   *
   * Default: 0 (no adjustment, all standard PC races have LA 0)
   *
   * @see ARCHITECTURE.md section 6 — Character Entity (levelAdjustment field)
   * @see D20SRD_CONVERSION.md C-15f — Psionic races (several have LA > 0)
   * @see SRD variant Reducing Level Adjustments (races/reducingLevelAdjustments.html)
   */
  levelAdjustment: number;

  /**
   * Character's current Experience Points (XP).
   *
   * D&D 3.5 CONTEXT:
   *   XP is accumulated through encounters and other rewards. When XP crosses the
   *   threshold for the next ECL, the character may level up.
   *   Thresholds are loaded from `config_xp_table` using ECL as the key.
   *
   *   XP penalty:
   *   - Bloodline variant: may trigger a 20% XP penalty modifier if level thresholds
   *     are skipped (tracked via `character.xpPenaltyModifier` in future variants).
   *   - Multiclassing: in RAW D&D 3.5, each class more than 1 level apart from the
   *     highest applies a 20% XP penalty. This is a UI-level enforcement concern,
   *     not an engine computation.
   *
   * STORAGE:
   *   Stored as a plain integer (total XP earned, not spending-based). The engine
   *   computes XP until next level = `config_xp_table[eclForXp + 1].xpRequired - xp`.
   *
   *   Updated by the GM or combat resolution UI (Phase 10.1 Level Up flow).
   *
   * Default: 0 (new character, no XP yet)
   *
   * @see ARCHITECTURE.md section 6 — Character Entity (xp field)
   * @see `config_xp_table` config table for XP thresholds per ECL
   */
  xp: number;

  // ---------------------------------------------------------------------------
  // Hit Die Results — Per-level HP rolls (stored, not recomputed)
  // ---------------------------------------------------------------------------

  /**
   * The result of the hit die roll for EACH character level.
   *
   * KEY: The character level at which the die was rolled (1-indexed).
   * VALUE: The numeric result of the hit die roll for that level.
   *
   * D&D 3.5 Max HP FORMULA (ARCHITECTURE.md section 9, Phase 3):
   *   Max HP = sum(hitDieResults.values()) + (CON_derivedModifier × character_level)
   *
   * Rolling strategy (Campaign Settings dependent):
   *   - Roll / Reroll: Player rolls the class's hit die during level-up (stored here).
   *   - Max HP (house rule): All dice set to the maximum face value.
   *   - Fixed / Average: All dice set to (faces / 2) + 1 (e.g., d10 → 6).
   *
   * This record is populated by the Level Up mechanic (Phase 10.1 UI).
   * For a brand-new character, it is empty and Max HP = CON_modifier × level.
   * For a Fighter 5 with CON 14 (mod +2) who rolled [7, 4, 8, 5, 10]:
   *   Max HP = (7+4+8+5+10) + (2 × 5) = 34 + 10 = 44
   *
   * STORED in save files (irreversible player choice — once a die is rolled and
   * accepted, it cannot be re-rolled without a GM override).
   * NOT recalculated at runtime — each value is set once at level-up.
   *
   * @example { 1: 8, 2: 5, 3: 10, 4: 3, 5: 7 } (Fighter 5, d10 hit die)
   */
  hitDieResults: Record<number, number>;

  // ---------------------------------------------------------------------------
  // Pipeline containers (saved state for base values only)
  // ---------------------------------------------------------------------------

  /**
   * The 6 main ability score pipelines and any custom attribute pipelines.
   *
   * Standard keys: "stat_strength", "stat_dexterity", "stat_constitution", "stat_intelligence", "stat_wisdom", "stat_charisma"
   * Custom homebrew stats can also appear here (e.g., "stat_sanity", "stat_honour").
   *
   * STORED: `baseValue` (player-assigned score)
   * DERIVED: `totalBonus`, `totalValue`, `derivedModifier`, `activeModifiers`
   */
  attributes: Record<ID, StatisticPipeline>;

  /**
   * All skill pipelines, keyed by skill ID.
   *
   * Standard keys follow the "skill_" prefix convention:
   *   "skill_climb", "skill_tumble", "skill_knowledge_arcana", etc.
   *
   * STORED: `ranks` (invested skill points)
   * DERIVED: `totalBonus`, `totalValue`, `isClassSkill`, `activeModifiers`
   */
  skills: Record<ID, SkillPipeline>;

  /**
   * The minimum allowed ranks for each skill (per-skill rank floor).
   *
   * WHY THIS EXISTS — D&D 3.5 RULE:
   *   In D&D 3.5, skill points granted at a given character level are PERMANENTLY spent.
   *   Once a player commits ranks to a skill (by confirming a level-up), those ranks
   *   cannot be lowered — the skill points have been permanently allocated.
   *
   *   This field stores the floor for each skill, set by `GameEngine.lockSkillRanksMin()`
   *   whenever the player commits a level-up. The engine's `setSkillRanks()` method
   *   refuses to set ranks below this value for each skill.
   *
   * ABSENT = ALL ZEROS:
   *   During character creation (before any level is committed), this record is either
   *   absent or empty — all minimums default to 0, and ranks can be freely reassigned.
   *   This lets players freely experiment with skill allocation while building a character
   *   before play begins.
   *
   * MULTICLASS NOTE:
   *   The minimum only applies to ranks already confirmed as spent. When a new class level
   *   is gained and new skill points are available, those NEW points can be freely allocated
   *   to any skill up to the new level's max ranks, then locked via `lockAllSkillRanks()`.
   *
   * KEY: skill ID (e.g., "skill_climb")
   * VALUE: minimum rank count the player can never lower below.
   *
   * STORED in save files (committed level-up decisions are irreversible).
   */
  minimumSkillRanks?: Record<ID, number>;

  /**
   * Combat-related derived statistics.
   *
   * Standard keys:
   *   "combatStats.ac_normal"      → Full armour class
   *   "combatStats.ac_touch"       → Touch armour class (no armour/shield/natural armour)
   *   "combatStats.ac_flat_footed" → Flat-footed AC (no DEX/dodge bonuses)
   *   "combatStats.base_attack_bonus"            → Base attack bonus (cumulative from all classes)
   *   "combatStats.initiative"           → Initiative modifier
   *   "combatStats.grapple"        → Grapple check modifier
   *   "combatStats.speed_land"     → Land speed in feet
   *
   * ALL DERIVED. The `baseValue` for most combat stats is 0; bonuses come from
   * features (armour grants armor modifier, DEX adds to AC, etc.).
   */
  combatStats: Record<ID, StatisticPipeline>;

  /**
   * Saving throw pipelines.
   *
   * Standard keys: "saves.fortitude" (Fortitude), "saves.reflex" (Reflex), "saves.will" (Will)
   * ALL DERIVED from class `levelProgression` base increments + CON/DEX/WIS modifiers.
   */
  saves: Record<ID, StatisticPipeline>;

  /**
   * Depletable resources with current tracking.
   *
   * Standard keys:
   *   "resources.hp"            → Hit points (current, temporary, max)
   *   "resources.psi_points"    → Psionic power points
   *   "resources.rage_rounds"   → Barbarian rage rounds per day
   *   "resources.turn_undead"   → Cleric turn undead uses per day
   *
   * STORED: `currentValue`, `temporaryValue`
   * DERIVED: effective max (via `maxPipelineId` pointing to a computed pipeline)
   */
  resources: Record<ID, ResourcePool>;

  // ---------------------------------------------------------------------------
  // Source of truth — all derived state comes from here
  // ---------------------------------------------------------------------------

  /**
   * THE CANONICAL LIST OF ALL ACTIVE FEATURES on this character.
   *
   * This is the single source of truth. The entire character sheet is derived
   * by processing this array through the DAG (Phases 0-4 in GameEngine).
   *
   * Contains:
   *   - Race feature instance
   *   - Class feature instances (one per class)
   *   - Feat instances (one per selected feat)
   *   - Equipment instances (both equipped and carried/backpack items)
   *   - Active buff/condition instances (Rage, Haste, Blinded, etc.)
   *   - Any other features the character possesses
   *
   * ORDER: The order within this array is not significant for game mechanics
   * (the engine sorts by resolution chain rules). But conventionally, persistent
   * features (race, class) come first, then feats, then items.
   */
  activeFeatures: ActiveFeatureInstance[];

  // ---------------------------------------------------------------------------
  // Linked entities (familiars, animal companions, etc.)
  // ---------------------------------------------------------------------------

  /**
   * Creatures bonded to this character.
   * Each one is a full Character inside a LinkedEntity wrapper.
   * @see LinkedEntity for the unidirectional reference design constraint.
   */
  linkedEntities: LinkedEntity[];

  // ---------------------------------------------------------------------------
  // Wealth — coin purse (stored, not derived)
  // ---------------------------------------------------------------------------

  /**
   * The character's current coin purse.
   *
   * D&D 3.5 RULE (PHB p.149):
   *   Coins weigh 50 per pound regardless of type. Carrying coin counts toward
   *   encumbrance exactly like any other item. The engine includes `wealth` in
   *   `phase2b_totalCarriedWeight` so the encumbrance tier and `phase_isEncumbered`
   *   reflect coins automatically.
   *
   * UNIT: integer count per denomination.
   *   cp = copper pieces, sp = silver pieces, gp = gold pieces, pp = platinum pieces.
   *
   * Default: absent (treated as all-zero — new characters start with no coin).
   */
  wealth?: {
    cp: number;
    sp: number;
    gp: number;
    pp: number;
  };

  // ---------------------------------------------------------------------------
  // GM Secret Overrides
  // ---------------------------------------------------------------------------

  /**
   * Secret modifier features injected by the Game Master.
   *
   * These are `ActiveFeatureInstance`s that reference Features defined in:
   *   - The GM's global override text area (`Campaign.gmGlobalOverrides`)
   *   - Any previously loaded rule source
   *
   * SECRECY: This field is only visible to the GM. When the API returns a character
   * to a regular player, the overrides are merged invisibly — the player only sees
   * the final calculated result, not the raw `gmOverrides` array.
   *
   * RESOLUTION ORDER: Applied LAST in the override chain:
   *   Rule sources → GM global overrides → GM per-character overrides (this field)
   *
   * STORAGE: Stored separately in `characters.gm_overrides_json` in the database,
   * not in the main `character_json`. This separation ensures:
   *   - The player's `PUT /api/characters/{id}` saves cannot overwrite GM overrides.
   *   - GM overrides can be updated independently via `PUT /api/characters/{id}/gm-overrides`.
   *
   * @example A GM secretly weakening a cursed character:
   * ```json
   * [
   *   { "instanceId": "gm_curse_001", "featureId": "gm_custom_curse_weakness", "isActive": true }
   * ]
   * ```
   *
   * @see ARCHITECTURE.md section 6.3 for full GM override examples.
   */
  gmOverrides?: ActiveFeatureInstance[];
}
