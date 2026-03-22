# Architecture Document: D&D 3.5 Data-Driven Engine (Svelte 5 + TypeScript)

## 1. Architecture Philosophy (Entity-Component-System)

This engine is designed to handle the extreme complexity of D&D 3.5 (SRD, Psionics, Homebrew). There are **zero hardcoded rules**.

- **Entities:** The Character, the Animal Companion, the Weapon. These are pure data aggregators.
- **Components:** `Features`. A race, a class, a buff, a weapon are all Features. They contain `Modifiers` and `Tags`.
- **System:** The `GameEngine` (a Svelte 5 reactive class). It listens to active Features, evaluates their prerequisites (logic trees), resolves mathematical formulas (placeholders), and updates `StatisticPipelines` (Strength, AC, Attack).
- **Open Content Ecosystem:** The architecture is designed for community-driven content creation. Rule source files are plain JSON that can be shared, versioned, and distributed independently. Characters can be exported as self-contained JSON blobs. No compilation or build step is required to add new content — drop a JSON file and update the manifest.

---

## 2. Primitives and Fundamental Types

_Suggested target file: `src/lib/types/primitives.ts`_

```typescript
export type ID = string; // kebab-case format (e.g.: "stat_str", "feat_power_attack")

// D&D 3.5 modifier types for stacking rules management
export type ModifierType = 
    | "base" | "multiplier" | "untyped" | "racial" | "enhancement" 
    | "morale" | "luck" | "insight" | "sacred" | "profane" 
    | "dodge" | "armor" | "shield" | "natural_armor" | "deflection" 
    | "competence" | "circumstance" | "synergy" | "size" | "setAbsolute"; 
    // "setAbsolute" forces the value (e.g.: Wild Shape), "base" defines the foundation before bonuses.

// Operators for the logic engine
export type LogicOperator = "==" | ">=" | "<=" | "!=" | "includes" | "not_includes" | "has_tag" | "missing_tag";
```

---

## 3. The Logic Engine (Prerequisites and Conditions)

Handles complex decision trees (AND/OR/NOT) to validate whether an item can be equipped, a feat selected, or a buff applies (e.g.: "Active only against Orcs").

_Suggested target file: `src/lib/types/logic.ts`_

```typescript
export type LogicNode =
    | { logic: "AND"; nodes: LogicNode[] }
    | { logic: "OR";  nodes: LogicNode[] }
    | { logic: "NOT"; node: LogicNode }
    | { 
        logic: "CONDITION"; 
        targetPath: string; // E.g.: "@attributes.stat_str.totalValue" or "@activeTags"
        operator: LogicOperator; 
        value: any;         // E.g.: "large" or 13
        errorMessage?: string; // E.g.: "Requires Strength 13+"
      };
```

---

## 4. Mathematical Pipelines (Statistics, Skills, and Resources)

Everything that is calculated is a Pipeline. The base + the list of active modifiers = the total. To handle Exploration, Encumbrance, Skills, and **especially Contextual Bonuses**, we specialize the pipelines.

_Suggested target file: `src/lib/types/pipeline.ts`_

```typescript
import type { ID, ModifierType } from './primitives';
import type { LocalizedString } from './i18n';
import type { LogicNode } from './logic';

export interface Modifier {
    id: ID;
    sourceId: ID;           
    sourceName: LocalizedString;     
    targetId: ID;           
    value: number | string; 
    type: ModifierType;
    
    // Evaluated when the character sheet updates (e.g.: "Am I currently Raging?")
    conditionNode?: LogicNode; 
    
    // Evaluated at DICE ROLL time (e.g.: "vs_orcs", "vs_attacks_of_opportunity")
    // If this field is present, the modifier is NOT added to the static `totalBonus` on the sheet.
    situationalContext?: string; 
}

// Generic pipeline (Strength, AC, Speed, Initiative)
export interface StatisticPipeline {
    id: ID;
    label: LocalizedString;
    baseValue: number;
    
    // Permanent modifiers or active buffs (affect the displayed total)
    activeModifiers: Modifier[]; 
    // Latent modifiers (e.g.: +2 vs Orcs). Kept here to be sent to the Dice Engine.
    situationalModifiers: Modifier[]; 
    
    totalBonus: number; // Calculated only from activeModifiers
    totalValue: number; // baseValue + totalBonus
    
    // Computed on the fly by the engine: floor((totalValue - 10) / 2)
    // Only meaningful for the 6 main ability scores (STR, DEX, CON, INT, WIS, CHA).
    // For other pipelines (AC, BAB, etc.), this field is 0 or ignored.
    derivedModifier: number;
}

// Specialized pipeline for Skills
export interface SkillPipeline extends StatisticPipeline {
    keyAbility: ID;         // E.g.: "stat_dex" (for Tumble)
    ranks: number;          // Invested ranks (replaces baseValue for calculation)
    isClassSkill: boolean;  
    appliesArmorCheckPenalty: boolean; 
    canBeUsedUntrained: boolean;
}

// Resources (HP, Psi Points, Charges)
export interface ResourcePool {
    id: ID;
    label: LocalizedString;
    maxPipelineId: ID;       // Pointer to the pipeline computing the Max (e.g.: "stat_max_hp")
    currentValue: number;
    temporaryValue: number;  // E.g.: Temporary HP (absorb damage first)

    // Full-reset: "long_rest" | "short_rest" | "encounter" | "never"
    // Incremental: "per_turn" (start of character's turn) | "per_round" (once per global round)
    resetCondition: "short_rest" | "long_rest" | "encounter" | "never" | "per_turn" | "per_round";

    // Only used for "per_turn" / "per_round" incremental pools.
    // Amount to restore per tick (number or Math Parser formula string).
    // Capped at maxPipelineId totalValue. Ignored for full-reset conditions.
    rechargeAmount?: number | string;
}
```

### 4.1. Behavior of `derivedModifier`

The `derivedModifier` field is **automatically computed** by the `GameEngine` every time the pipeline updates. It is never stored in save JSONs. For the 6 main ability scores (Strength, Dexterity, Constitution, Intelligence, Wisdom, Charisma), the formula is:

```
derivedModifier = floor((totalValue - 10) / 2)
```

Examples:
- Strength 10 → `derivedModifier` = 0
- Strength 18 → `derivedModifier` = +4
- Strength 7 → `derivedModifier` = -2

For any other pipeline (AC, BAB, Initiative, etc.), `derivedModifier` is `0` and has no functional meaning. The engine initializes it to `0` by default.

### 4.2. Behavior of `setAbsolute`

A modifier of type `setAbsolute` **overrides the entire pipeline result**. When the engine encounters a `setAbsolute` modifier:

1. The `baseValue` and all other modifiers are **ignored**.
2. The `totalValue` is set to the `setAbsolute` value directly.
3. If multiple `setAbsolute` modifiers target the same pipeline, the **last one applied wins** (following the resolution chain order: rule sources → GM global → GM per-character).
4. The `derivedModifier` is still recalculated from the forced `totalValue`.

**Use cases:** Constitution set to 0 for Undead, Hit Die forced to d12, GM overriding a monster's HP to exactly 200.

### 4.3. Special Paths for the Math Parser

When the Math Parser encounters `@` prefixed paths in formula strings, it resolves them against the character's state. The following special paths are recognized:

| Path Pattern                       | Resolves To                                                                                 | Available                              |
| ---------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------- |
| `@attributes.<id>.totalValue`      | The pipeline's computed total                                                               | Always                                 |
| `@attributes.<id>.derivedModifier` | `floor((totalValue - 10) / 2)` for ability scores                                           | Always                                 |
| `@attributes.<id>.baseValue`       | The pipeline's base value before modifiers                                                  | Always                                 |
| `@skills.<id>.ranks`               | The invested skill ranks                                                                    | Always                                 |
| `@combatStats.<id>.totalValue`     | The combat pipeline's computed total                                                        | Always                                 |
| `@saves.<id>.totalValue`           | The save pipeline's computed total                                                          | Always                                 |
| `@characterLevel`                  | `Object.values(character.classLevels).reduce((a, b) => a + b, 0)` — **excludes LA** — use for feats/ASI/HP/skills | Always |
| `@eclForXp`                        | `characterLevel + character.levelAdjustment` — **includes LA** — use for XP table lookups  | Always                                 |
| `@classLevels.<classId>`           | `character.classLevels[classId]` (e.g., `@classLevels.class_soulknife`)                     | Always                                 |
| `@activeTags`                      | Flat array of all tags from active Features (used with `has_tag` / `missing_tag` operators) | Always                                 |
| `@equippedWeaponTags`              | Tags of the currently equipped weapon                                                       | Always                                 |
| `@selection.<choiceId>`            | The selected value(s) from an `ActiveFeatureInstance.selections` record                     | Always                                 |
| `@targetTags`                      | The target creature's tags                                                                  | **Roll time only** (via `RollContext`) |
| `@master.classLevels.<classId>`    | The master character's class level (for `LinkedEntity` companion formulas)                  | LinkedEntity only                      |
| `@constant.<id>`                   | A named constant from a config table (e.g., `@constant.darkvision_range`)                   | Always                                 |

> **AI Implementation Note:** The Math Parser MUST handle nested paths by splitting on `.` and walking the object tree. For example, `@attributes.stat_str.derivedModifier` splits into `["attributes", "stat_str", "derivedModifier"]` and resolves by looking up `character.attributes["stat_str"].derivedModifier`. Paths that don't resolve should return `0` and log a warning, not crash.
>
> **Special path distinction — `@characterLevel` vs `@eclForXp`:** Always use `@characterLevel` for game-mechanical calculations (feats, HP, skill max ranks, caster level, class feature gating). Use `@eclForXp` ONLY when consulting the XP threshold table (`config_xp_table`) for level-up checks, starting wealth, and encounter budgeting. For standard PC races with `levelAdjustment = 0`, both paths return the same value.

### 4.4. ResourcePool `resetCondition` — Full Reference

The `resetCondition` field governs exactly when and how a pool recovers. There are two conceptually distinct recovery modes:

#### Full-Reset Conditions (restore to maximum on event)

| Value | Trigger | Typical Uses |
|---|---|---|
| `"long_rest"` | `GameEngine.triggerLongRest()` | Spell slots, psi points, HP, Rage rounds, Turn Undead uses |
| `"short_rest"` | `GameEngine.triggerShortRest()` | Optional house-rule pools, d20 Modern variant resources |
| `"encounter"` | `GameEngine.triggerEncounterReset()` | Once-per-encounter class abilities, Ki points (if house-ruled) |
| `"never"` | Never automatic | Item charges, XP-spent powers, truly consumable resources |

`triggerLongRest()` resets BOTH `"long_rest"` AND `"short_rest"` pools (a long rest implies a short rest).

#### Incremental Recharge Conditions (add `rechargeAmount` per tick, capped at max)

| Value | Trigger | `rechargeAmount` | Typical Uses |
|---|---|---|---|
| `"per_turn"` | `GameEngine.triggerTurnTick()` | Required | Fast Healing, Regeneration |
| `"per_round"` | `GameEngine.triggerRoundTick()` | Required | Environmental hazard pools, global aura charges |

**`rechargeAmount`** — the amount restored per tick. Accepts a number or a Math Parser formula string (enables level-scaled healing). The pool is capped at the `maxPipelineId` pipeline's `totalValue` — it can never exceed its maximum via ticking. `temporaryValue` (temporary HP) is never affected by tick recharges.

**`"per_turn"` vs `"per_round"` distinction:**
- `"per_turn"` fires at the **start of the specific character's turn** in initiative order. The combat tracker calls `engine.triggerTurnTick()` on the correct character's `GameEngine` instance.
- `"per_round"` fires **once per global round** at a fixed point (e.g., top of round), independent of initiative. Used for environmental or world-level effects.

#### Engine Contract — Stateless w.r.t. the combat clock

The `GameEngine` is a stateless character-sheet engine. It does NOT track rounds, turns, or a clock. **The UI / combat tracker is responsible for calling the tick methods at the correct times.** The engine guarantees:
- `triggerTurnTick()` applies exactly `rechargeAmount` to all `"per_turn"` pools, capped at max.
- `triggerRoundTick()` applies exactly `rechargeAmount` to all `"per_round"` pools, capped at max.
- `triggerEncounterReset()` fully restores all `"encounter"` pools.
- `triggerLongRest()` fully restores all `"long_rest"` and `"short_rest"` pools.

#### Fast Healing vs Regeneration (D&D 3.5 SRD)

Both **Fast Healing** and **Regeneration** use `resetCondition: "per_turn"` with `rechargeAmount: N`:

```json
// Fast Healing 3 — added via creature Feature's grantedFeatures or grantedModifiers
{
  "id": "resources.hp",
  "resetCondition": "per_turn",
  "rechargeAmount": 3
}
```

The mechanical difference between Fast Healing and Regeneration lies **not** in the `resetCondition` but in DR/bypass tags on the creature Feature:
- **Fast Healing**: does not convert lethal to nonlethal; stops at 0 HP without Regeneration.
- **Regeneration**: the creature Feature carries tags like `"regeneration_bypassed_by_fire"` or `"regeneration_bypassed_by_acid"`, and bypass damage is tracked via separate modifier logic. The tick itself (`rechargeAmount`) is identical.

The calling UI should skip `triggerTurnTick()` for Fast Healing only creatures when `currentValue ≤ 0`. For Regeneration creatures, the tick applies even at negative HP.

---

## 5. The Unified Feature Model and Its Sub-Types

The central data block. To handle equipment, magic (divine, arcane, psionic), and monsters, the base `Feature` interface is extended into specific sub-types.

_Suggested target file: `src/lib/types/feature.ts`_

```typescript
import type { ID, ModifierType } from './primitives';
import type { LocalizedString } from './i18n';
import type { LogicNode } from './logic';
import type { Modifier } from './pipeline';

export type FeatureCategory = "race" | "class" | "class_feature" | "feat" | "deity" | "domain" | "magic" | "item" | "condition" | "monster_type" | "environment";

// Merge strategy used by the DataLoader's Merge Engine.
// "replace" (default if absent): the entity completely replaces any existing entity with the same ID.
// "partial": the entity is merged with the existing one according to partial merge rules.
export type MergeStrategy = "replace" | "partial";

export interface FeatureChoice {
    choiceId: ID;
    label: LocalizedString;
    // Declarative query to find available options.
    // Format: "tag:<tag_name>" to filter Features having that tag.
    // Examples: "tag:domain" for cleric domains, "tag:weapon" for Weapon Focus.
    optionsQuery: string; 
    maxSelections: number;
}

// Class level progression table, indexed by class level.
// Each entry associates a level with the list of Features granted at that level.
export interface LevelProgressionEntry {
    level: number;
    grantedFeatures: ID[];    // E.g.: ["class_feature_bonus_feat_fighter"] at Fighter 2
    grantedModifiers: Modifier[]; // E.g.: BAB +1, Fort Save +1 for this level increment
}

// Base Interface (Common to everything)
export interface Feature {
    id: ID;
    category: FeatureCategory;
    label: LocalizedString; 
    description: LocalizedString;
    tags: string[]; 
    forbiddenTags?: string[]; 
    prerequisitesNode?: LogicNode;
    grantedModifiers: Modifier[];
    grantedFeatures: ID[]; 
    choices?: FeatureChoice[];
    
    // Identifier of the rule source this entity belongs to.
    // Example: "srd_core", "srd_psionics", "homebrew_darklands".
    // Used by the DataLoader to filter by enabledRuleSources.
    ruleSource: ID;
    
    // Merge strategy for the Data Override system.
    // If absent, defaults to "replace" (full overwrite).
    // If "partial", the Merge Engine merges this entity with the existing one.
    merge?: MergeStrategy;
    
    // Level progression table (used only for category: "class").
    // Allows the engine to only grant features corresponding to the character's
    // current level in this class.
    levelProgression?: LevelProgressionEntry[];
    
    // Recommended attributes for this class (used by the Point Buy UI).
    // Example: A Fighter recommends STR and CON, a Wizard recommends INT.
    recommendedAttributes?: ID[];
    
    // List of skill IDs that are class skills for this class.
    // Only used for category: "class". The DAG Phase 4 unions
    // these across all active classes to determine isClassSkill
    // for each skill in the character's skills record.
    // If a referenced skill ID does not exist in the skill definitions
    // config table, the engine logs a warning and ignores it.
    classSkills?: ID[];
    
    // For active abilities (Ex/Su/Sp)
    activation?: {
        actionType: "standard" | "move" | "swift" | "immediate" | "free" | "full_round" | "minutes" | "hours";
        resourceCost?: { targetId: ID; cost: number | string }; // E.g.: Consumes 2 Psi Points
    };
}

// --- SPECIALIZED SUB-TYPES ---

// 5.1 Items (Equipment, Magic Items, Treasure)
export interface ItemFeature extends Feature {
    category: "item";
    equipmentSlot?: "head" | "eyes" | "neck" | "torso" | "body" | "waist" | "shoulders" 
                   | "arms" | "hands" | "ring" | "feet" 
                   | "main_hand" | "off_hand" | "two_hands" | "none";
    weightLbs: number; // Always stored in neutral unit (pounds)
    costGp: number;    // Stored in Gold Pieces
    hardness?: number; 
    hpMax?: number;
    
    // Weapon-specific
    weaponData?: {
        wieldCategory: "light" | "one_handed" | "two_handed";
        damageDice: string;    // E.g.: "1d8"
        damageType: string[];  // E.g.: ["slashing", "magic"]
        critRange: string;     // E.g.: "19-20"
        critMultiplier: number;// E.g.: 2
        reachFt: number;       // E.g.: 5 (standard melee) or 10 (reach)
        rangeIncrementFt?: number; // E.g.: 30 for a bow
    };
    
    // Armor-specific
    armorData?: {
        armorBonus: number;
        maxDex: number;
        armorCheckPenalty: number;
        arcaneSpellFailure: number; // Percentage
    };
}

// 5.2 Magic (Spells & Psionic Powers unified)
export interface AugmentationRule {
    costIncrement: number; // E.g.: +1 Psi Point
    grantedModifiers: Modifier[]; // What the augmentation provides
    isRepeatable: boolean; 
}

export interface MagicFeature extends Feature {
    category: "magic";
    magicType: "arcane" | "divine" | "psionic";
    spellLists: Record<ID, number>; // E.g.: { "list_wizard": 3, "list_cleric": 3 }
    
    school: string;      // E.g.: "evocation", "metacreativity"
    subSchool?: string;  
    descriptors: string[]; // E.g.: ["fire", "evil", "mind-affecting"]
    
    resistanceType: "spell_resistance" | "power_resistance" | "none";
    components: string[]; // Magic (V, S, M) or Psionic (A, M, O, V)
    
    range: string;       // Formula (e.g.: "25 + floor(@attributes.caster_level.totalValue / 2) * 5")
    targetArea: LocalizedString;
    duration: string;    
    savingThrow: "fort_half" | "ref_negates" | "will_disbelieves" | "none" | string;
    
    augmentations?: AugmentationRule[]; // Exclusive to Psionics (or custom rules)
}
```

### 5.3. The `FeatureChoice.optionsQuery` Mechanism

The `optionsQuery` field uses a simple declarative format that the `DataLoader` knows how to interpret. Supported formats:

| Format | Example | Meaning |
|---|---|---|
| `tag:<tag_name>` | `"tag:domain"` | All Features having `"domain"` in their `tags` array. |
| `category:<cat>` | `"category:feat"` | All Features of this category. |
| `tag:<tag1>+tag:<tag2>` | `"tag:weapon+tag:martial"` | Intersection: Features having both tags. |

**Concrete example (Weapon Focus):**

```json
{
  "id": "feat_weapon_focus",
  "category": "feat",
  "ruleSource": "srd_core",
  "label": { "en": "Weapon Focus", "fr": "Arme de predilection" },
  "tags": ["feat", "general", "fighter_bonus_feat", "feat_weapon_focus"],
  "description": { "en": "Choose one type of weapon. You are especially good with that weapon.", "fr": "Choisissez un type d'arme. Vous etes particulierement doue avec cette arme." },
  "grantedFeatures": [],
  "choices": [
    {
      "choiceId": "weapon_choice",
      "label": { "en": "Choose a weapon", "fr": "Choisissez une arme" },
      "optionsQuery": "tag:weapon",
      "maxSelections": 1
    }
  ],
  "grantedModifiers": [
    {
      "id": "mod_weapon_focus",
      "sourceId": "feat_weapon_focus",
      "sourceName": { "en": "Weapon Focus", "fr": "Arme de predilection" },
      "targetId": "combatStats.attack_bonus",
      "value": 1,
      "type": "untyped",
      "conditionNode": {
        "logic": "CONDITION",
        "targetPath": "@equippedWeaponTags",
        "operator": "includes",
        "value": "@selection.weapon_choice"
      }
    }
  ]
}
```

The corresponding `ActiveFeatureInstance` stores the player's choice in `selections`:

```json
{
  "instanceId": "afi_weapon_focus_001",
  "featureId": "feat_weapon_focus",
  "isActive": true,
  "selections": {
    "weapon_choice": ["item_longsword"]
  }
}
```

### 5.4. Class Level Progression (`levelProgression`)

The `levelProgression` field is the central mechanism for handling **multiclassing** and **prestige classes**. Each class defines, for each level, the features and modifiers granted. The `GameEngine` only grants entries corresponding to the character's current level in that class (via `classLevels`).

**Note on base bonuses (BAB, Saves):** The `grantedModifiers` of type `"base"` in `levelProgression` represent **increments** per level, not cumulative totals. The engine sums all increments for levels ≤ `classLevels[classId]` to get the base total. This allows multiclassing to simply add the contributions from each class.

**Convention:** Save base values follow D&D 3.5 progressions:
- **Good:** +2 at level 1, then +1 every 2 levels
- **Poor:** +0 at level 1, then +1 every 3 levels

The increments in `levelProgression` represent the **difference** between the total at this level and the total at the previous level.

See **Annex A** (sections A.1 through A.2) for complete class examples including Fighter (4 levels), Barbarian (20 levels), Cleric (5 levels + Turn Undead), Monk (5 levels), Dragon Disciple (10 levels as prestige class), Druid (5 levels + Animal Companion), and Soulknife (6 levels, psionic).

### 5.5. Class Skills Declaration (`classSkills`)

Each class Feature declares which skills are class skills for characters of that class via the `classSkills` field. This is an array of skill IDs referencing the skill definitions config table (Annex B, B.13).

**Example (Barbarian):**
```json
{
 "id": "class_barbarian",
 "category": "class",
 "classSkills": [
   "skill_climb", "skill_craft", "skill_handle_animal",
   "skill_intimidate", "skill_jump", "skill_listen",
   "skill_ride", "skill_survival", "skill_swim"
 ]
}
```

**How the engine uses this:**
During DAG Phase 4 (Skills & Abilities), the engine collects `classSkills` from ALL active class Features (respecting `classLevels` — a class must have at least 1 level to contribute its class skills). The union of all these arrays determines which skills have `isClassSkill: true` in the character's `skills` record. This affects:
- **Rank cost:** Class skills cost 1 skill point per rank; cross-class skills cost 2.
- **Max ranks:** Class skills allow up to (character level + 3) ranks; cross-class skills allow half that.

**Handling missing references:** If a `classSkills` entry references a skill ID that doesn't exist in the `config_skill_definitions` table, the engine logs a warning and ignores it. This prevents crashes when a class file is loaded without its companion skill definitions file.

**Domain and Feature-granted class skills:** Some Features (like Cleric domains) can add class skills dynamically. For example, the Knowledge Domain adds all Knowledge skills as class skills. This is handled by adding a `classSkills` field on the domain Feature as well — the engine unions class skills from ALL active Features that have this field, not just classes.

```json
{
 "id": "domain_knowledge",
 "category": "domain",
 "classSkills": [
   "skill_knowledge_arcana", "skill_knowledge_architecture",
   "skill_knowledge_dungeoneering", "skill_knowledge_geography",
   "skill_knowledge_history", "skill_knowledge_local",
   "skill_knowledge_nature", "skill_knowledge_nobility",
   "skill_knowledge_planes", "skill_knowledge_religion"
 ]
}
```

> **AI Implementation Note:** The `classSkills` field is optional on ALL Feature categories, not just `"class"`. This allows domains, racial features, or even feats to grant class skills. The engine should scan all active Features (not just classes) for this field during Phase 4.

---

## 6. The Character Entity (Global State)

This is the data structure saved to the database or `localStorage`.

_Suggested target file: `src/lib/types/character.ts`_

```typescript
import type { ID } from './primitives';
import type { StatisticPipeline, SkillPipeline, ResourcePool } from './pipeline';

export interface ActiveFeatureInstance {
    instanceId: ID;      // Unique UUID generated at equip time
    featureId: ID;       // Reference to the Feature JSON
    isActive: boolean;   // Allows "unequipping" or ending a buff
    customName?: string; // If the player renames the item
    
    // Choices made by the player (e.g.: "weapon_focus" -> choiceId: "weapon_choice", selected: ["item_longsword"])
    selections?: Record<ID, string[]>; 
}

// Represents a linked entity (familiar, animal companion, mount, summoned creature).
// IMPORTANT: The relationship is UNIDIRECTIONAL. The master references their linked entities,
// but a linked entity does NOT have a back-reference to their master.
// This prevents infinite loops during JSON serialization.
export interface LinkedEntity {
    instanceId: ID;
    entityType: "companion" | "familiar" | "mount" | "summon";
    bondingFeatureId: ID; // The master's Feature that generated this link
    characterData: Character; // Recursive structure: The familiar has its own stats
    // NO "masterId" or "parentCharacter" field here. The back-link is forbidden.
}

export interface Character {
    id: ID;
    name: string;
    
    // --- UI & Campaign Metadata ---
    campaignId?: ID;          // Campaign this character belongs to
    ownerId?: ID;             // User who owns this character
    isNPC: boolean;           // True for NPCs and monsters managed by the GM
    posterUrl?: string;       // Character portrait image
    playerRealName?: string;  // Real name of the player (displayed on the character card)
    customSubtitle?: string;  // Custom subtitle (e.g.: "The Shadow Blade")
    
    // --- Multiclassing ---
    // Dictionary of levels per class. The sum of all values gives the Character Level.
    // Racial Hit Dice (e.g., "hd_gnoll") are also stored here as class-like entries.
    // Example: { "class_fighter": 5, "class_wizard": 3 } = Character Level 8
    // The engine uses this structure to resolve each class's levelProgression.
    classLevels: Record<ID, number>;

    // --- Effective Character Level (ECL) — Monster PCs and Level Adjustment variant ---
    //
    // Level Adjustment (LA): Offset added to classLevels sum when computing ECL.
    // Standard PC races have LA = 0; monster PCs may have LA = 1–5+.
    //
    // ECL formula:  eclForXp = sum(classLevels values) + levelAdjustment
    //
    // ECL governs XP thresholds (config_xp_table lookup key) and starting wealth.
    // Feat/ASI acquisition uses ONLY sum(classLevels) — levelAdjustment is excluded.
    //
    // Math Parser paths:
    //   @characterLevel  = sum(classLevels values)           ← feats, ASI, HP, skills
    //   @eclForXp        = sum(classLevels values) + LA      ← XP table lookups
    //
    // Mutability: LA can decrease via "Reducing Level Adjustments" variant rule
    // (after 3× LA class levels have been accumulated, pay XP to reduce LA by 1).
    //
    // Default: 0 for all standard player-character races.
    levelAdjustment: number;

    // Experience Points earned by this character.
    // Compared against config_xp_table[eclForXp] to determine next level threshold.
    // Updated by the GM or combat resolution UI. Default: 0.
    xp: number;

    // Pipeline containers (Generated on the fly, but base state is saved)
    attributes: Record<ID, StatisticPipeline>;
    skills: Record<ID, SkillPipeline>;
    combatStats: Record<ID, StatisticPipeline>;
    saves: Record<ID, StatisticPipeline>;
    resources: Record<ID, ResourcePool>;

    // THE SOURCE OF TRUTH: The entire character is derived from this array.
    activeFeatures: ActiveFeatureInstance[];

    linkedEntities: LinkedEntity[];
    
    // --- GM Secret Overrides ---
    // Array of ActiveFeatureInstance injected secretly by the GM.
    // These overrides use the "setAbsolute" type to force values,
    // or add/remove Features without the player knowing the source.
    // Applied LAST in the resolution chain, after all other layers.
    // The player never sees this field — they only see the final result.
    gmOverrides?: ActiveFeatureInstance[];
}
```

### 6.1. Example: Multiclassed Character

See the Fighter 5 / Wizard 3 / Duelist 2 example in the original document section 6.1.

### 6.2. Example: `ActiveFeatureInstance` with `selections`

See the Cleric domain selection example in the original document section 6.2.

### 6.3. Example: GM Secret Override

The GM wants to secretly weaken a cursed player (-4 Strength) and give them darkvision without them knowing why:

```json
{
  "gmOverrides": [
    { "instanceId": "gm_curse_001", "featureId": "gm_custom_curse_weakness", "isActive": true },
    { "instanceId": "gm_gift_001", "featureId": "gm_custom_darkvision", "isActive": true }
  ]
}
```

The Features `gm_custom_curse_weakness` and `gm_custom_darkvision` are defined in the GM's JSON text area (global or per-character override). The player sees their Strength drop by 4 with the source "Mysterious Weakness", without knowing it's a GM override.

To force an absolute value (e.g., an NPC with exactly 200 HP), the GM uses a modifier of type `setAbsolute`:

```json
{
  "id": "gm_force_hp",
  "sourceId": "gm_override",
  "sourceName": { "en": "GM Override", "fr": "Override MJ" },
  "targetId": "resources.hp.maxValue",
  "value": 200,
  "type": "setAbsolute"
}
```

### 6.4. Level Adjustment and ECL — Monster PCs

**Context:** In D&D 3.5, monster races that are played as PCs (e.g., Gnolls, Drow, Half-Dragons) have a **Level Adjustment (LA)** value that increases their **Effective Character Level (ECL)** beyond their actual class level count. This reflects their innate racial power.

**Two distinct level values on the Character object:**

| Field | Formula | Used for |
|---|---|---|
| `character.classLevels` sum → `@characterLevel` | `Σ classLevels values` | Feat slots, ASI, HP, skill max ranks, class progression |
| `character.levelAdjustment` + above → `@eclForXp` | `@characterLevel + levelAdjustment` | XP threshold table lookups, starting wealth, encounter balance |

**Design details:**

- `levelAdjustment` is stored as a plain integer on `Character` (default `0` for all standard PC races). It is **mutable** in play (the "Reducing Level Adjustments" SRD variant allows a character to pay XP to lower their LA by 1 after accumulating 3× LA in class levels).
- `xp` stores total accumulated experience points.  The engine computes XP until next level as `config_xp_table[eclForXp + 1].xpRequired - character.xp`.
- Racial Hit Dice are stored in `classLevels` as a class-like entry (e.g., `"hd_gnoll": 2`), making them naturally contribute to `@characterLevel` (for feat purposes) while `levelAdjustment` handles the balance surcharge separately.

**Example — Drow Rogue 3 (LA +2):**

```json
{
  "classLevels": { "hd_elf_drow": 0, "class_rogue": 3 },
  "levelAdjustment": 2,
  "xp": 6000
}
```

- `@characterLevel` = 3 (Rogue levels only — used for feat acquisition, HP, max ranks)
- `@eclForXp` = 3 + 2 = 5 (XP threshold same as a 5th-level character)
- To gain Rogue level 4, she needs the XP required for ECL 6: `config_xp_table[6].xpRequired`

**Math Parser paths (section 4.3):**

- Use `@characterLevel` everywhere **except** XP calculations (feats, HP, skills, class features).
- Use `@eclForXp` only when looking up XP thresholds or initial wealth.

---

## 7. Campaign Data Model

_Suggested target file: `src/lib/types/campaign.ts`_

```typescript
import type { ID } from './primitives';
import type { LocalizedString } from './i18n';

export interface Chapter {
    id: ID;
    title: LocalizedString;
    description: LocalizedString;
    isCompleted: boolean;
}

export interface Campaign {
    id: ID;
    title: string;
    description: string;
    posterUrl?: string;
    bannerUrl?: string;
    ownerId: ID;
    chapters: Chapter[];
    
    // Ordered list of enabled rule source IDs (order matters: last wins for overrides)
    enabledRuleSources: ID[];
    
    // Raw JSON string for the GM's global override text area
    // Parsed as a JSON array of Feature-like objects
    gmGlobalOverrides: string;
    
    // Unix timestamp, updated whenever campaign settings or overrides change
    updatedAt: number;
}

// Represents the current scene/environment state.
// The GM can activate global Features that affect all characters.
export interface SceneState {
    activeGlobalFeatures: ID[]; // Feature IDs to inject into all characters
}
```

---

## 8. Global Campaign Settings

_Suggested target file: `src/lib/types/settings.ts`_

```typescript
import type { SupportedLanguage } from './i18n';
import type { ID } from './primitives';

export interface CampaignSettings {
    // 1. Localization
    language: SupportedLanguage;
    
    // 2. Character creation rules
    statGeneration: {
        method: "roll" | "point_buy" | "standard_array";
        rerollOnes: boolean;    // If true, 1s are rerolled during stat rolls (4d6 drop lowest)
        pointBuyBudget: number; // Customizable budget (Default: 25. High Fantasy: 32)
    };
    
    // 3. Dice rules (House Rules)
    diceRules: {
        explodingTwenties: boolean; // If true, a natural 20 on a d20 is rerolled and added
    };
    
    // 4. Enabled rule sources (ORDERED)
    // Ordered array of JSON rule source IDs enabled for this campaign.
    // ORDER IS CRUCIAL: sources listed last have the highest priority.
    // The DataLoader loads and merges Features in this order.
    // Example: ["srd_core", "srd_psionics", "unearthed_arcana", "homebrew_darklands"]
    enabledRuleSources: ID[];
}
```

---

## 9. The Svelte 5 Engine (The Brain and Resolution Order)

The reactive store architecture. It uses Svelte 5 Runes (`$state`, `$derived`). To avoid cyclic dependencies (infinite loops), the engine evaluates characteristics according to a **strict sequential Directed Acyclic Graph (DAG)**.

_Suggested target file: `src/lib/engine/GameEngine.svelte.ts`_

**Responsibilities and Resolution Order (Cascading `$derived` Phases):**

1. **Phase 0 (Extraction & Flattening):**
   A `$derived` loops over `character.activeFeatures` **and** `character.gmOverrides`, loads each Feature's JSON via the `DataLoader` (which has already resolved the complete Data Override chain), validates `prerequisitesNode`, ignores `forbiddenTags`, and applies filtering by `levelProgression` (using `classLevels[featureId]` to only retain entries ≤ the current level in that class). The result is a flat list of all valid `Modifiers`.

2. **Phase 1 (Base & Equipment):**
   A `$derived` computes Size modifiers and Encumbrance (sum of equipment weights).

3. **Phase 2 (Main Attributes):**
   A `$derived` computes STR, DEX, CON, INT, WIS, CHA by applying Phase 0 modifiers, stacking rules, and `derivedModifier` via `floor((totalValue - 10) / 2)`. _(Constitution total is now frozen)._

4. **Phase 3 (Combat Statistics):**
   A `$derived` computes AC, Initiative, BAB (sum of contributions from all classes via `levelProgression`), Saves, and **Max HP**. It uses the frozen results from Phase 2 (e.g.: Constitution modifier for HP). Character Level is derived here as `Object.values(character.classLevels).reduce((a, b) => a + b, 0)`.
   **HP Calculation:** Max HP = sum of `hitDieResults[level]` (stored in the character's resources) + (`stat_con.derivedModifier` × character level). Hit die values per level are stored in the character state (rolled once during level-up or set to a fixed value based on campaign rules). When CON changes (e.g., from a Belt of Constitution), the HP maximum automatically recalculates because it reads the frozen CON modifier from Phase 2.

5. **Phase 4 (Skills & Abilities):**
   A `$derived` computes skills (which depend on Phase 2 Attributes and Phase 3 Armor Check Penalty). Determines which skills are "class skills" by combining the tags of all active classes.

6. **Context Sorting:**
   During injection into Pipelines, the engine separates modifiers that have a `situationalContext`. They are not summed into `totalBonus`, but stored in `situationalModifiers` for the UI and the Dice Engine.

### 9.1. Infinite Loop Detection

The sequential DAG naturally prevents most cyclic dependencies since each phase only reads results from previous phases. However, malicious or poorly designed Features could attempt to create loops (e.g.: a Feature that increases CON based on Max HP, while Max HP depends on CON).

**Protection strategy:**
- The engine maintains a resolution depth counter.
- If a pipeline is re-evaluated more than **3 times** in a single resolution cycle, the engine cuts the evaluation, logs a warning ("Circular dependency detected on pipeline: stat_con"), and preserves the last stable value.
- This mechanism is tested in Phase 17.5.

---

## 10. Implementation Details and Examples (For the Logic Engine)

This section provides strict use cases to guide the implementation of the Math Parser, the Logic Resolver (`LogicNode`), and the Stacking Manager.

### Example A: Logic Tree (LogicNode) — Simple Prerequisite

**Scenario:** The Cleave feat requires: Strength 13+ **AND** the Power Attack feat.

```json
"prerequisitesNode": {
  "logic": "AND",
  "nodes": [
    {
      "logic": "CONDITION",
      "targetPath": "@attributes.stat_str.totalValue",
      "operator": ">=",
      "value": 13,
      "errorMessage": "Requires Strength 13+"
    },
    {
      "logic": "CONDITION",
      "targetPath": "@activeTags",
      "operator": "has_tag",
      "value": "feat_power_attack",
      "errorMessage": "Requires Power Attack feat"
    }
  ]
}
```

### Example B: Logic Tree — Complex Prerequisite (OR + NOT)

**Scenario:** A mystic Feature requires: (be Human **OR** Half-Elf) **AND** **NOT** wearing heavy armor **AND** (5 ranks in Knowledge (Arcana) **OR** have the "spellcaster" tag).

```json
"prerequisitesNode": {
  "logic": "AND",
  "nodes": [
    {
      "logic": "OR",
      "nodes": [
        { "logic": "CONDITION", "targetPath": "@activeTags", "operator": "has_tag", "value": "race_human", "errorMessage": "Must be Human" },
        { "logic": "CONDITION", "targetPath": "@activeTags", "operator": "has_tag", "value": "race_half_elf", "errorMessage": "Must be Half-Elf" }
      ]
    },
    {
      "logic": "NOT",
      "node": { "logic": "CONDITION", "targetPath": "@activeTags", "operator": "has_tag", "value": "heavy_armor", "errorMessage": "Cannot wear heavy armor" }
    },
    {
      "logic": "OR",
      "nodes": [
        { "logic": "CONDITION", "targetPath": "@skills.skill_knowledge_arcana.ranks", "operator": ">=", "value": 5, "errorMessage": "5 ranks in Knowledge (Arcana)" },
        { "logic": "CONDITION", "targetPath": "@activeTags", "operator": "has_tag", "value": "spellcaster", "errorMessage": "Must be a spellcaster" }
      ]
    }
  ]
}
```

### Example C: Formulas and Placeholders (Math Parser)

The engine must extract variables with the `@` prefix, navigate the Character object to find the value, replace the variable, then evaluate the final mathematical expression.

- **Raw expression:** `"floor(@attributes.classLevel_soulknife.totalValue / 4)d8"` → With level 9: `"2d8"`
- **Two-handed damage:** `"1d12 + floor(@attributes.stat_str.derivedModifier * 1.5)"` → With STR mod 3: `"1d12 + 4"`
- **i18n pipe:** `"@attributes.speed_land.totalValue|distance"` → 40 feet → `"12 m"` (French) or `"40 ft."` (English)

### Example D: Stacking Rules

The golden rule of D&D 3.5: **Bonuses of the same type do not stack; only the highest applies.** (Exceptions: `dodge`, `circumstance`, `synergy`, and `untyped`).

**Scenario:** Ring of Protection +2 (deflection) + Shield of Faith +3 (deflection) + Dodge feat +1 (dodge) + Haste +1 (dodge).

- deflection group: Math.max(2, 3) = **3**
- dodge group (stackable): 1 + 1 = **2**
- **TotalBonus** = **5** (not 7).

### Example E: Locking via "forbiddenTags"

A Druid wearing Plate Armor (tag: `metal_armor`) triggers a conflict. The engine sets the armor's `isActive` to `false`, instantly removing all its modifiers.

### Example F: Contextual Bonus (Situational Modifier)

A Ranger's Favored Enemy: Orcs gives +2 attack and damage vs Orcs. These modifiers go into `situationalModifiers`, NOT `activeModifiers`. The `totalBonus` on the sheet does NOT include this +2. When the player clicks "Attack" with `targetTags: ["orc"]`, the Dice Engine adds these +2 to `situationalBonusApplied`.

### Example G: Multiclassing — BAB and Save Resolution

For a Fighter 5 / Wizard 3:
- Fighter 5: BAB 1+1+1+1+1 = **5**, Fort 2+1+0+1+0 = **4**, Ref 0+0+1+0+0 = **1**, Will 0+0+1+0+0 = **1**
- Wizard 3: BAB 0+1+0 = **1**, Fort 0+0+1 = **1**, Ref 0+0+1 = **1**, Will 2+1+0 = **3**
- Combined: BAB **6** (+6/+1 attacks), Fort **5**, Ref **2**, Will **4**, Character Level **8**

### Example H: Formula-as-Value and Multi-Pipeline Conditional Modifier (Monk AC)

**Scenario:** The Monk's AC Bonus class feature adds the character's Wisdom modifier to both normal AC and touch AC, but only when the Monk is not wearing armor, carrying a shield, or encumbered.

This demonstrates two advanced engine mechanics simultaneously:

1. **Formula as value:** The modifier's `value` field is a string `"@attributes.stat_wis.derivedModifier"` instead of a number. The Math Parser must resolve this at runtime against the character's current Wisdom score. When Wisdom changes (e.g., from an Owl's Wisdom spell), the AC automatically updates without any hardcoded logic.    
2. **Same condition, multiple pipelines:** The same `conditionNode` is applied to modifiers targeting both `combatStats.ac_normal` and `combatStats.ac_touch`. The engine evaluates the condition once per modifier instance. Note that `ac_flat_footed` does NOT receive this bonus (by design — you lose WIS to AC when flat-footed), demonstrating how omitting a pipeline is itself a design decision.

```json
{
  "id": "monk_wis_to_ac",
  "sourceId": "class_feature_monk_ac_bonus",
  "sourceName": { "en": "Monk Wisdom AC", "fr": "CA Sagesse Moine" },
  "targetId": "combatStats.ac_normal",
  "value": "@attributes.stat_wis.derivedModifier",
  "type": "untyped",
  "conditionNode": {
    "logic": "AND",
    "nodes": [
      { "logic": "NOT", "node": { "logic": "CONDITION", "targetPath": "@activeTags", "operator": "has_tag", "value": "wearing_armor" } },
      { "logic": "NOT", "node": { "logic": "CONDITION", "targetPath": "@activeTags", "operator": "has_tag", "value": "carrying_shield" } },
      { "logic": "NOT", "node": { "logic": "CONDITION", "targetPath": "@activeTags", "operator": "has_tag", "value": "heavy_load" } },
      { "logic": "NOT", "node": { "logic": "CONDITION", "targetPath": "@activeTags", "operator": "has_tag", "value": "medium_load" } }
    ]
  }
}
```

See **Annex A, section A.1.3** for the complete Monk AC Bonus Feature with both the `ac_normal` and `ac_touch` modifiers.

---

## 11. Internationalization (i18n) and Unit Conversion

The engine operates on a **Single Source of Truth** principle. Rule files (JSON) are never duplicated by language. The engine calculates everything in reference units (SRD imperial system) and translates/converts only at the display layer.

### 11.1. Localized Data Structure

_Suggested target file: `src/lib/types/i18n.ts`_

```typescript
export type LocalizedString = Record<string, string>; 
// Example: { "en": "Fireball", "fr": "Boule de feu" }

export type SupportedLanguage = "en" | "fr";

export interface LocalizationConfig {
    distanceMultiplier: number;
    distanceUnit: string;
    weightMultiplier: number;
    weightUnit: string;
}

export const I18N_CONFIG: Record<SupportedLanguage, LocalizationConfig> = {
    "en": { distanceMultiplier: 1,   distanceUnit: "ft.", weightMultiplier: 1,   weightUnit: "lb." },
    "fr": { distanceMultiplier: 0.3, distanceUnit: "m",   weightMultiplier: 0.5, weightUnit: "kg" }
};
```

### 11.2. Integration in the Svelte Engine (GameEngine)

```typescript
export class GameEngine {
    currentLang = $state<SupportedLanguage>("en");

    t(textObj: LocalizedString | string): string {
        if (typeof textObj === "string") return textObj;
        return textObj[this.currentLang] || textObj["en"] || "Missing text";
    }

    formatDistance(feetValue: number): string {
        const config = I18N_CONFIG[this.currentLang];
        const converted = feetValue * config.distanceMultiplier;
        const rounded = Math.round(converted * 10) / 10;
        return `${rounded} ${config.distanceUnit}`;
    }

    formatWeight(lbsValue: number): string {
        const config = I18N_CONFIG[this.currentLang];
        const converted = lbsValue * config.weightMultiplier;
        return `${converted} ${config.weightUnit}`;
    }
}
```

### 11.3. Placeholder Pipes

In JSON descriptions, "Pipes" (like in Angular or Vue) indicate that a variable should be converted before display.

```json
"description": {
  "en": "Your speed increases to {@attributes.speed_land.totalValue|distance}.",
  "fr": "Votre vitesse passe a {@attributes.speed_land.totalValue|distance}."
}
```

The engine reads the value (40 feet), sees the `|distance` pipe, calls `formatDistance(40)`, and outputs `"12 m"` (French) or `"40 ft."` (English).

---

## 12. Bestiary, Monsters, and Templates

In D&D 3.5, a monster is built exactly like a PC. It has Hit Dice (acting like class levels), a Type (Aberration, Undead), and sometimes Sub-Types (Fire, Goblinoid).

- **Creature Type (e.g.: Undead):** A `Feature` of category `monster_type`. Its `grantedModifiers` grant immunity to mind-affecting effects, remove Constitution (set to 0 via `setAbsolute`), and fix Hit Dice to d12.
- **Template (e.g.: Half-Dragon):** A `Feature` added on top. It adds Strength modifiers, grants a Breath Weapon (added in `grantedFeatures`), and adds the "Dragon" Sub-Type.
- **Monster Advancement:** A Dire Wolf with 6 HD simply has the Feature "hd_animal" at rank 6 (acting exactly like 6 levels in a class for BAB and Save calculations via `classLevels` and `levelProgression`).

See **Annex A** (section A.10) for the complete Orc Warrior 1 example combining race + NPC class + equipment.

---

## 13. Environment, Planes, and Global Conditions

The SRD manages weather, traps, and planes (e.g.: Elemental Plane of Fire). The Svelte engine handles this via a "**Global Aura**" (or Environment) concept.

- **The Scene (SceneState):** The application has a global state containing an `activeGlobalFeatures: ID[]` array.
- **Usage:** If the GM activates `environment_extreme_heat`, this Feature is virtually injected into the `activeFeatures` of _all_ characters in the scene.
- **Resolution:** The Feature applies modifiers (non-lethal damage or save penalties). If the character has the Endure Elements spell, their own `conditionNode` tree will block the global Feature's modifiers.
- **Encumbrance:** Computed natively by a derived Pipeline. The engine evaluates Strength, consults the encumbrance table (loaded from a configuration JSON), generates thresholds (Light, Medium, Heavy) and compares with the sum of equipped `ItemFeature` weights. If weight exceeds Medium, the engine automatically injects `condition_medium_load`.

See **Annex A** (sections A.11) for complete Extreme Heat and Underwater environment examples.

---

## 14. Epic Rules Integration (Levels 21+ and Modular Magic)

The Epic system doesn't add new characteristics — it modifies caps and changes how base bonuses accumulate. The engine handles this via global conditions and Feature combinations.

- **Epic Progression:** Class `levelProgression` tables stop at level 20. Above that, a global Feature `rule_epic_progression` (with prerequisite `@characterLevel >= 21`) injects dynamic modifiers with formulas.
- **Epic Feats:** Simple Features with very high prerequisite values.
- **Epic Spells (Seed System):** Seeds and Factors are simple Features. The UI creates Custom Features on the fly by combining them. The Spellcraft DC is a temporary pipeline.
- **Epic Items/Monsters:** No engine change needed — just larger numbers in JSON.

---

## 15. Psionic Systems and Divine Rules

### 15.1. Divine Ranks and Global Rule Alteration

Divine Rank is a `StatisticPipeline` that feeds other characteristics. For divine abilities that alter game resolution itself, we use **System Tags** (`sys_` prefix).

Examples:
- `sys_immune_mind_affecting`: Blocks any Feature with the `mind-affecting` tag.
- `sys_roll_maximize_damage`: The math parser replaces all `XdY` with `X * Y`.
- `sys_roll_maximize_hp`: Same, applied only for Hit Dice calculation.
- `sys_ignore_dr`: Attacks ignore all Damage Reduction.

### 15.2. Magic-Psionic Transparency (Default SRD Rule)

SR and PR pipelines point to the same final value via a cross-modifier. Disabling transparency is as simple as removing `srd_psionic_transparency` from `enabledRuleSources`.

---

## 16. Alternative Rules Engine (Variants & Homebrew)

### 16.1. Data Overrides

If a custom JSON loads an item with `"id": "item_chainmail"`, it silently overwrites the base SRD version. Loading order is determined by `enabledRuleSources` order (last wins).

### 16.2. Custom Pipelines

The engine has no strict list of statistics. If a JSON declares a modifier targeting `stat_sanity`, the engine automatically initializes this new Pipeline. Homebrew content creators can freely invent new characteristics.

### 16.3. Global Variant System Tags

For rules that modify game resolution itself (e.g.: Vitality/Wound Points), the campaign uses tags via its `enabledRuleSources`. The Dice Engine checks these tags.

---

## 17. The Dice Engine (RNG & Action Resolver)

_Suggested target file: `src/lib/utils/diceEngine.ts`_

```typescript
export interface RollContext {
    targetTags: string[]; // E.g.: ["orc", "evil", "living"]
    isAttackOfOpportunity: boolean;
}

export interface RollResult {
    formula: string;
    diceRolls: number[];
    naturalTotal: number;
    staticBonus: number;
    situationalBonusApplied: number;
    finalTotal: number;
    numberOfExplosions: number;
    isCriticalThreat: boolean;
    isAutomaticHit: boolean;
    isAutomaticMiss: boolean;
}

/**
 * Parses a compiled dice expression, rolls the dice, and applies contextual bonuses.
 *
 * @param formula - The dice expression already resolved by the Math Parser (e.g.: "1d20 + 7").
 * @param pipeline - The relevant StatisticPipeline, providing situationalModifiers to evaluate.
 * @param context - The roll context (target tags, action type) to filter situational bonuses.
 * @param settings - The campaign configuration (Exploding 20s, Reroll 1s, etc.).
 * @param rng - (Optional) Injectable random generation function for unit tests.
 *             Default: () => Math.floor(Math.random() * faces) + 1
 * @param critRange - (Optional) The weapon's critical threat range as a string.
 *                   Format: "X-20" or "20". Default: "20" (natural 20 only).
 *                   Examples: "19-20" (keen longsword), "18-20" (improved crit rapier).
 *                   Parsed to determine `isCriticalThreat` on the RollResult.
 * @returns A structured RollResult object containing all roll details.
 */
export function parseAndRoll(
    formula: string,
    pipeline: StatisticPipeline,
    context: RollContext,
    settings: CampaignSettings,
    rng?: (faces: number) => number,
    critRange?: string  // E.g.: "19-20" or "18-20". Default: "20".
): RollResult;
```

**Contextual Evaluation:** Before finalizing the result, the Dice Engine reads `situationalModifiers` from the provided pipeline. It compares each `situationalContext` with the `targetTags` in the `RollContext`. If there's a match (e.g.: `"vs_orc"` matches `"orc"` in the tags), it adds the bonus to `situationalBonusApplied`.

**Exploding 20s:** If `settings.diceRules.explodingTwenties` is active, the function implements a `while (lastRoll === 20)` loop for d20s. Each new 20 is added to `naturalTotal` and increments `numberOfExplosions`.

---

## 18. The Rule Source Management System (Data Override Engine)

### 18.1. JSON Rule File Architecture

#### File Discovery and Loading Order

All JSON rule files are stored under `static/rules/` and its subdirectories. The DataLoader (and the PHP backend for serving them) scans this directory **recursively** and loads all `.json` files in **alphabetical order** (by full relative path, case-insensitive).

**Why alphabetical order matters:** The loading order determines override priority — files loaded later override files loaded earlier (for entities with the same `id`). By using numeric prefixes in filenames, content creators have deterministic control over the resolution chain.

**Naming convention:**
```
static/rules/
 00_srd_core/
   00_srd_core_races.json
   01_srd_core_classes.json
   02_srd_core_feats.json
   03_srd_core_spells.json
   04_srd_core_items.json
   05_srd_core_skills.json
   09_srd_core_config.json
 01_srd_psionics/
   00_srd_psionics_classes.json
   01_srd_psionics_powers.json
   02_srd_psionics_feats.json
   03_srd_psionics_races.json
   04_srd_psionics_skills.json
 50_homebrew_winter_circle/
   00_winter_circle_druid.json
 90_campaign_reign_of_winter/
   00_reign_custom_rules.json
```

**Resolution example:** `00_srd_core/01_srd_core_classes.json` is loaded before `50_homebrew_winter_circle/00_winter_circle_druid.json`, so the homebrew Druid variant (with `merge: "partial"`) correctly extends the base Druid from the core rules.

**Filtering by `enabledRuleSources`:** After all files are discovered and sorted, the DataLoader filters them: only entities whose `ruleSource` field matches one of the IDs in `CampaignSettings.enabledRuleSources` are retained. Files containing no entities matching any enabled source are effectively ignored. The `enabledRuleSources` array itself does NOT control loading order — alphabetical file order always wins. The `enabledRuleSources` array is purely a filter (include/exclude).

**AI Implementation Note:** The PHP backend serves a `GET /api/rules/list` endpoint that returns the sorted list of available rule source files and their metadata (extracted from the first entity's `ruleSource` field, or from a top-level `_meta` object if present). The SvelteKit frontend in dev mode reads directly from `static/rules/` via filesystem. In production, the PHP backend reads the directory and returns the file contents.

#### File Content Structure

Each JSON rule file is an **array of mixed-type entities**. A single file can contain races, classes, feats, spells, items, and configuration tables. Each entity is identified by its `category` and `id` (for Features) or by its `tableId` (for configuration tables).

**Configuration Tables vs. Feature Files:** The JSON configuration data tables described in Annex B (XP thresholds, carrying capacity, point buy costs, size categories, skill synergies, skill definitions, etc.) are stored in the same `static/rules/` directory as Feature files. They use a different structure (`tableId` + `data` instead of an array of Feature objects) and are accessed via `DataLoader.getConfigTable(tableId)`. Configuration tables do not use the `merge` field — they are **always replaced entirely** (a table with the same `tableId` from a later file completely overwrites the earlier version).

**Loading and priority for config tables:** Configuration tables follow the same alphabetical file loading order as Features. If multiple files provide a table with the same `tableId`, only the last one loaded is kept. This allows a campaign-specific file (e.g., `90_campaign_reign_of_winter/00_reign_custom_rules.json`) to override the default XP table from `00_srd_core/09_srd_core_config.json`.

**GM Global Overrides for config tables:** The GM's global override text area (section 18.6) can also contain configuration table objects alongside Feature objects. The DataLoader distinguishes them by checking for the presence of `tableId` (config table) vs `id` + `category` (Feature). Config tables in the GM override layer replace any previously loaded table with the same `tableId`. This allows the GM to customize the XP progression or point buy costs for a specific campaign without creating a separate rule source file.

**Per-character overrides:** Configuration tables are **campaign-wide** and cannot be overridden per-character. The `Character.gmOverrides` field only accepts `ActiveFeatureInstance` entries, not config tables.

### 18.2. The `merge` Field and Merge Strategy

| `merge` value | Behavior |
|---|---|
| Absent or `"replace"` | **Full overwrite.** The entity completely replaces any existing entity with the same ID. |
| `"partial"` | **Additive merge.** The entity is merged with the existing one according to partial merge rules. |

### 18.3. Partial Merge Rules (`merge: "partial"`)

| Field type | Behavior | Example |
|---|---|---|
| **Arrays** (`tags`, `grantedFeatures`, `grantedModifiers`, `forbiddenTags`, `components`, `descriptors`) | **Append**: new elements are added. Elements prefixed with `-` are **removed** from the existing array. | `"tags": ["circle_winter", "-wild_shape"]` → Adds `circle_winter`, removes `wild_shape`. |
| **`levelProgression`** | **Merge by level**: if the partial defines an entry for an existing level, it **replaces** that entry. Undefined levels remain intact. New levels are added. | A partial defining `level: 4` replaces the level 4 entry. |
| **`choices`** | **Merge by `choiceId`**: same-ID choice is replaced. New choices are added. `-` prefixed choices are removed. | `{ "choiceId": "-domain_choice_2" }` removes that choice. |
| **Strings / Scalars** (`label`, `description`, `school`, `range`, etc.) | **Override**: if defined in the partial, replaces the existing value. If not defined, existing value is preserved. | |
| **`prerequisitesNode`** | **Full override**: too complex to merge automatically. If defined in the partial, fully replaces. | |
| **`id`, `category`** | **Not modifiable.** The `id` must match the target entity. `category` cannot change. | |

### 18.4. Deletion Convention (`-prefix`)

To remove an element from an array during partial merge, prefix it with a dash `-`.

See the Winter Circle Druid example in the original document section 17.4.

### 18.5. Complete Resolution Chain

```
┌──────────────────────────────────────────────────────┐
│ Layer 1: JSON Rule Source Files                      │
│   Loaded in enabledRuleSources order.                │
│   ["srd_core", "srd_psionics", "homebrew_winter"]    │
│   → srd_core loaded first (lowest priority)          │
│   → homebrew_winter loaded last (highest priority)   │
│   Each entity respects its "merge" field.            │
├──────────────────────────────────────────────────────┤
│ Layer 2: GM Global Override (Campaign)               │
│   Stored in Campaign.gmGlobalOverrides.              │
│   Raw JSON text containing an array of entities.     │
│   Applied AFTER all files.                           │
│   Uses the same merge rules.                         │
├──────────────────────────────────────────────────────┤
│ Layer 3: GM Per-Character Override                   │
│   Stored in Character.gmOverrides.                   │
│   Array of ActiveFeatureInstance injected secretly.   │
│   Applied LAST.                                      │
│   Referenced Features can be defined in any previous │
│   layer, or be custom Features from Layer 2.         │
└──────────────────────────────────────────────────────┘
```

**Important:** Layers 2 and 3 are only visible to the GM. The player never sees the raw content of these overrides — they only see the final result after complete chain resolution.

### 18.6. GM Text Area Format (Layers 2 and 3)

The GM's JSON text area (global campaign override) accepts a **JSON array** containing a mix of:

1. **Feature-like objects** — identified by having both an `id` and a `category` field. These are processed by the merge engine using the same rules as any JSON source file (default: replace, optional: partial merge via the `merge` field).
2. **Configuration table objects** — identified by having a `tableId` field. These completely replace any previously loaded config table with the same `tableId`. No partial merge is supported for config tables.

**Example of a GM global override containing both types:**

```json
[
  {
    "id": "gm_custom_curse_weakness",
    "category": "condition",
    "ruleSource": "gm_override",
    "label": { "en": "Mysterious Weakness", "fr": "Faiblesse mysterieuse" },
    "tags": ["curse", "gm_secret"],
    "grantedModifiers": [
      {
        "id": "gm_curse_str",
        "sourceId": "gm_custom_curse_weakness",
        "sourceName": { "en": "Mysterious Weakness", "fr": "Faiblesse mysterieuse" },
        "targetId": "attributes.stat_str",
        "value": -4,
        "type": "untyped"
      }
    ],
    "grantedFeatures": []
  },
  {
    "tableId": "config_xp_thresholds",
    "ruleSource": "gm_override",
    "description": "Custom fast-progression XP table for this campaign.",
    "data": [
      { "level": 1,  "xpRequired": 0 },
      { "level": 2,  "xpRequired": 500 },
      { "level": 3,  "xpRequired": 1500 },
      { "level": 4,  "xpRequired": 3000 },
      { "level": 5,  "xpRequired": 5000 }
    ]
  }
]
```

In this example, the GM creates a custom curse Feature AND overrides the XP table with a faster progression, all in the same text area.

### 18.7. Client-Side JSON Validation

1. **Syntactic validation:** Must be valid JSON. On error, highlight the offending line in red.
2. **2. **Structural validation:** Each entry in the array must have either (`id` + `category`) for a Feature, or `tableId` for a configuration table. A non-blocking warning is displayed if expected fields are missing (e.g., `label` or `grantedModifiers` for Features, `data` for config tables).
3. **Preview:** Optionally display a summary of changes ("2 Features added, 1 Feature modified (partial), 1 modifier removed").

---

## 19. Client-Server Synchronization (Polling)

### 19.1. Timestamp Mechanism

Each modifiable entity has an `updated_at` (Unix timestamp) in the database:
- `campaigns.updated_at`: Updated when campaign settings, chapters, rule sources, or GM global overrides change.
- `characters.updated_at`: Updated when the character is modified (by the player OR by the GM via overrides).

### 19.2. Sync Endpoint

```
GET /api/campaigns/{id}/sync-status
```

Returns a minimal payload:

```json
{
  "campaignUpdatedAt": 1710754823,
  "characterTimestamps": {
    "char_001": 1710754800,
    "char_002": 1710754810
  }
}
```

The client stores its last known timestamps locally. On each poll, it compares and re-fetches only changed data.

### 19.3. Polling Intervals

- **Recommended interval:** 5 to 10 seconds.
- **Estimated load:** For 10 simultaneous tables of 10 players (100 players + 10 GMs): 11-22 requests/second. Lightweight for shared PHP hosting.
- **Polling payload size:** ~100-500 bytes per `sync-status` request.
- **Full re-fetch size:** ~50 KB (campaign) + ~200 KB (average character). Images are cached via HTTP cache headers and are not re-downloaded.

### 19.4. Client-Side Cache

The client uses `localStorage` or `IndexedDB` to store data between sessions. On reconnect, it only fetches data that has changed. Images are cached by the browser via standard HTTP headers (`Cache-Control`, `ETag`).

---

## 20. Application Navigation Plan (Routes)

```
/                                        → Redirect to /campaigns
/campaigns                               → Campaign list (Phase 6.3)
/campaigns/[id]                          → Campaign details + Chapters (Phase 6.4)
/campaigns/[id]/vault                    → Character vault for this campaign (Phase 7.3)
/campaigns/[id]/settings                 → Rule source management (Phase 15.1, GM only)
/campaigns/[id]/gm-dashboard             → GM dashboard with overrides (Phase 15.3, GM only)
/character/[id]                          → Character sheet — Default tab: Core (Phase 8.1)
/character/[id]?tab=core                 → Core tab (Phase 8)
/character/[id]?tab=abilities            → Abilities & Skills tab (Phase 9)
/character/[id]?tab=combat               → Combat tab (Phase 10)
/character/[id]?tab=feats                → Feats tab (Phase 11)
/character/[id]?tab=magic                → Spells & Powers tab (Phase 12)
/character/[id]?tab=inventory            → Inventory tab (Phase 13)
```

**Notes:**
- Character sheet tabs use a query parameter `?tab=` rather than sub-routes, to keep the same parent layout and avoid reloading the `GameEngine` on tab change.
- The `/character/[id]` route loads the character from the `StorageManager` (localStorage in Phase 4, PHP API in Phase 14) and injects it into the `GameEngine`.
- The redirect `/` → `/campaigns` is done via a `+page.server.ts` or a SvelteKit navigation hook.
- Routes `/campaigns/[id]/settings` and `/campaigns/[id]/gm-dashboard` are only accessible if `SessionContext.isGameMaster` is `true`. A navigation guard redirects non-GMs.
