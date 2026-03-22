# Architecture Document: D&D 3.5 Data-Driven Engine (Svelte 5 + TypeScript)

## 1. Architecture Philosophy (Entity-Component-System)

This engine is designed to handle the extreme complexity of D&D 3.5 (SRD, Psionics, Homebrew). There are **zero hardcoded rules**.

- **Entities:** The Character, the Animal Companion, the Weapon. These are pure data aggregators.
- **Components:** `Features`. A race, a class, a buff, a weapon are all Features. They contain `Modifiers` and `Tags`.
- **System:** The `GameEngine` (a Svelte 5 reactive class). It listens to active Features, evaluates their prerequisites (logic trees), resolves mathematical formulas (placeholders), and updates `StatisticPipelines` (Strength, AC, Attack).
- **Open Content Ecosystem:** The architecture is designed for community-driven content creation. Rule source files are plain JSON that can be shared, versioned, and distributed independently. Characters can be exported as self-contained JSON blobs. No compilation or build step is required to add new content — drop a JSON file and update the manifest.

```mermaid
graph TD
    subgraph "Content Layer (JSON)"
        RS[Rule Source Files<br/>static/rules/**/*.json]
        GM_G[GM Global Overrides<br/>Campaign.gmGlobalOverrides]
        GM_C[GM Per-Character Overrides<br/>Character.gmOverrides]
    end

    subgraph "Data Layer"
        DL[DataLoader<br/>Merge Engine]
        RS --> DL
        GM_G --> DL
        GM_C --> DL
    end

    subgraph "Entity (Character)"
        AFI["activeFeatures: ActiveFeatureInstance[]"]
        CL[classLevels: Record&lt;ID, number&gt;]
        PIPE[attributes / skills / combatStats / saves / resources]
    end

    subgraph "System (GameEngine — Svelte 5 Runes)"
        P0["Phase 0: Flatten & Filter<br/>(prerequisites, forbiddenTags, levelProgression)"]
        P1["Phase 1: Size & Encumbrance"]
        P2["Phase 2: Ability Scores + derivedModifier"]
        P3["Phase 3: Combat Stats + HP<br/>(BAB, AC, Saves — gestalt-aware)"]
        P4["Phase 4: Skills + Class Skills<br/>(SP budget, leveling journal)"]
        OUT["CharacterContext snapshot<br/>(read by Math Parser + Logic Evaluator)"]

        P0 -->|flat Modifier[]| P1
        P1 --> P2
        P2 --> P3
        P3 --> P4
        P4 --> OUT
    end

    DL -->|resolved Feature JSON| AFI
    AFI --> P0
    CL --> P0
    OUT --> PIPE
```

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
    | "competence" | "circumstance" | "synergy" | "size" | "setAbsolute"
    | "damage_reduction"; // Best-wins per bypass-tag group. See Modifier.drBypassTags + section 4.5.
    // "setAbsolute" forces the value (e.g.: Wild Shape); "base" defines the additive foundation.

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

    // Only used when type === "damage_reduction".
    // Tags that bypass this DR entry. Empty array = "DR X/—" (overcome by nothing).
    // Examples: ["magic"], ["silver"], ["good"], ["cold_iron"], ["magic","silver"] (AND).
    // Content authoring: use type "damage_reduction" for innate/racial DR (best-wins per group).
    // For class-progression DR that adds up (Barbarian DR/—): use type "base" instead.
    // @see ARCHITECTURE.md section 4.5 — full Damage Reduction reference
    drBypassTags?: string[];
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

### 4.5. Damage Reduction (DR) — `drBypassTags` and Best-Wins Grouping

Damage Reduction (SRD "Special Abilities") is one of the most mechanically distinctive systems in D&D 3.5. It does **not** follow the normal stacking rules — it uses a **best-wins-per-bypass-group** model instead.

#### The DR Data Model

DR is expressed as a `Modifier` with two fields working together:

| Field | Type | Role |
|---|---|---|
| `value` | `number` | How much damage is reduced per hit |
| `type` | `"damage_reduction"` | Identifies this modifier for DR-specific grouping |
| `drBypassTags` | `string[]` | Materials/conditions that overcome the DR |

```json
// Examples showing the full DR modifier structure
{ "id": "dr_vampire",     "value": 10, "type": "damage_reduction", "drBypassTags": ["magic"] }
{ "id": "dr_lycanthrope", "value": 10, "type": "damage_reduction", "drBypassTags": ["silver"] }
{ "id": "dr_barbarian",   "value": 1,  "type": "damage_reduction", "drBypassTags": ["magic", "silver"] }
{ "id": "dr_barbarian_dr","value": 2,  "type": "base",             "targetId": "combatStats.damage_reduction" }
```

`drBypassTags` semantics:
- `[]` → DR X/— (nothing bypasses; e.g., Barbarian end-game DR)
- `["magic"]` → DR X/magic (any +1 or better magic weapon bypasses)
- `["silver"]` → DR X/silver (silver weapon bypasses)
- `["cold_iron"]` → DR X/cold iron
- `["good"]` → DR X/good (good-aligned weapon bypasses)
- `["epic"]` → DR X/epic (+6 or better weapon)
- `["magic", "silver"]` → DR X/magic AND silver (weapon must be BOTH — extremely rare)

#### The Two DR Authoring Modes

| Mode | `type` field | Stacking | Use For |
|---|---|---|---|
| **Additive class progression** | `"base"` | Always stacks (ALWAYS_STACKING_TYPES) | Barbarian DR/— increments (+1 at level 7, +2 at 10, +3 at 13, +4 at 16, +5 at 20) |
| **Innate/racial/template DR** | `"damage_reduction"` | Best-wins per bypass group | Vampire DR 10/magic, Troll (no DR), race/template DRs |

**Why two modes?**
- Barbarian DR is gained incrementally as the character levels. Each level adds +1 DR. These all target `combatStats.damage_reduction` with `type: "base"` so they SUM to the correct total (DR 1/— at 7th, DR 2/— at 10th, etc.).
- Racial or template DR from different sources uses `type: "damage_reduction"` and follows the best-wins rule: having both DR 5/magic and DR 10/silver from different racial features means the creature has BOTH, but it won't gain DR 10/magic if it only has DR 5/magic and DR 10/silver.

#### The Stacking Resolution Algorithm

`applyStackingRules()` in `stackingRules.ts` handles `"damage_reduction"` modifiers separately in Step 6 (after all regular modifier types):

1. Sort each modifier's `drBypassTags` array and JSON-serialize it as a group key.
   - `["silver", "magic"]` and `["magic", "silver"]` both serialize to `'["magic","silver"]'` (same group).
2. Group all DR modifiers by this key. Each unique key = one `DREntry` in `StackingResult.drEntries`.
3. Within each group: keep the modifier with the **highest `value`**. Suppress all others.
4. Return each winner as a `DREntry` with `{ amount, bypassTags, sourceModifier, suppressedModifiers }`.

**Result:** `StackingResult.drEntries` is an array of `DREntry` objects. Each one describes one "DR X/material" line independently.

#### Example: Vampire Fighter 3 (DR 10/magic from race + no DR from class)

```json
[
  { "value": 10, "type": "damage_reduction", "drBypassTags": ["magic"], "sourceId": "race_vampire" }
]
```
→ `drEntries = [{ amount: 10, bypassTags: ["magic"] }]`

#### Example: Half-Troll Barbarian 10 (DR 5/— from class + DR 5/fire from race)

```json
[
  { "value": 1, "type": "base",             "targetId": "combatStats.damage_reduction" },  // Level 7 increment
  { "value": 1, "type": "base",             "targetId": "combatStats.damage_reduction" },  // Level 10 increment
  { "value": 5, "type": "damage_reduction", "drBypassTags": [],      "sourceId": "race_half_troll" },
  { "value": 5, "type": "damage_reduction", "drBypassTags": ["fire"],"sourceId": "half_troll_fire_vuln" }
]
```
→ `totalBonus = 2` (from "base" additive increments)  
→ `drEntries = [{ amount: 5, bypassTags: [] }, { amount: 5, bypassTags: ["fire"] }]`  
→ The creature effectively has: DR 2/— (class) + DR 5/— (race) + DR 5/fire (race vuln)

> **Note:** The "base" DR and the `type: "damage_reduction"` DR entries are **independent**. The UI should display both: the `totalValue` pipeline (base additive DR) and each `drEntry` separately.

#### Example: Best-wins — Two DR/magic sources, different amounts

```json
[
  { "value": 5,  "type": "damage_reduction", "drBypassTags": ["magic"], "sourceId": "feature_a" },
  { "value": 10, "type": "damage_reduction", "drBypassTags": ["magic"], "sourceId": "feature_b" }
]
```
→ `drEntries = [{ amount: 10, bypassTags: ["magic"], suppressedModifiers: [feature_a mod] }]`  
→ feature_a is suppressed; only the best DR 10/magic applies.

#### Combat Resolution (Dice Engine)

At roll time, for each `DREntry` in the target's `combatStats.damage_reduction.drEntries`:
1. Check if the attacking weapon's tags include **any** tag from `DREntry.bypassTags`.
2. If **YES**: the DR is overcome; skip this entry (no damage reduction).
3. If **NO** (or `bypassTags` is empty): subtract `DREntry.amount` from the damage total.
4. **Minimum 0** per hit (damage cannot go negative from DR, per SRD).
5. Spells and most energy damage **ignore DR** entirely (unless the feat "Penetrating Strike" or similar applies).

---

## 5. The Unified Feature Model and Its Sub-Types

The central data block. To handle equipment, magic (divine, arcane, psionic), and monsters, the base `Feature` interface is extended into specific sub-types.

```mermaid
classDiagram
    class Feature {
        +ID id
        +FeatureCategory category
        +LocalizedString label
        +LocalizedString description
        +string[] tags
        +string[] forbiddenTags
        +LogicNode prerequisitesNode
        +Modifier[] grantedModifiers
        +ID[] grantedFeatures
        +FeatureChoice[] choices
        +ID ruleSource
        +MergeStrategy merge
        +LevelProgressionEntry[] levelProgression
        +ID[] classSkills
        +ID[] recommendedAttributes
        +activation
        +actionBudget
    }

    class ItemFeature {
        +equipmentSlot
        +number weightLbs
        +number costGp
        +weaponData
        +armorData
        +psionicItemData
    }

    class MagicFeature {
        +magicType: arcane|divine|psionic
        +Record spellLists
        +string school
        +PsionicDiscipline discipline
        +PsionicDisplay[] displays
        +AugmentationRule[] augmentations
    }

    Feature <|-- ItemFeature : extends item
    Feature <|-- MagicFeature : extends magic
    Feature --> "0..1" LogicNode : prerequisitesNode
    Feature --> "0..*" Modifier : grantedModifiers
    Feature --> "0..*" LevelProgressionEntry : levelProgression
    ItemFeature --> "0..1" PsionicItemData : psionicItemData
```

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

    // Action-economy budget imposed by this feature (conditions, slow spells, etc.)
    // Each key = max of that action type per round. 0 = prohibited. absent = unlimited.
    // Combat UI takes MIN across all active features' budgets per category.
    // @see ARCHITECTURE.md section 5.6 — actionBudget full reference and condition table
    actionBudget?: {
        standard?: number;   // Max standard actions (0 = blocked)
        move?: number;       // Max move actions
        swift?: number;      // Max swift actions
        immediate?: number;  // Max immediate actions
        free?: number;       // Max free actions
        full_round?: number; // Max full-round actions (0 = blocked)
    };
}

// --- SPECIALIZED SUB-TYPES ---

// 5.1 Items (Equipment, Magic Items, Treasure)

// Psionic item type discriminant (see section 5.1.1 for full reference)
export type PsionicItemType =
    "cognizance_crystal" | "dorje" | "power_stone" | "psicrown" | "psionic_tattoo";

// One imprinted power on a Power Stone (see section 5.1.1)
export interface PowerStoneEntry {
    powerId: ID;           // MagicFeature ID of the imprinted power
    manifesterLevel: number; // ML at which the power was imprinted (for Brainburn check)
    usedUp: boolean;       // True = power has been "flushed" (single-use)
}

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

    // Psionic item-specific data — present only for psionic item types.
    // See section 5.1.1 for full per-type field documentation.
    psionicItemData?: {
        psionicItemType: PsionicItemType;
        // === COGNIZANCE CRYSTAL + PSICROWN ===
        storedPP?: number;      // Current PP available to draw on
        maxPP?: number;         // Maximum PP capacity (odd 1–17 for crystals; 50×ML for psicrowns)
        attuned?: boolean;      // Cognizance crystal only — needs 10 min to attune
        // === DORJE + PSIONIC TATTOO ===
        powerStored?: ID;       // The single power stored in this item
        charges?: number;       // Dorje only — remaining uses (created with 50)
        // === POWER STONE ===
        powersImprinted?: PowerStoneEntry[]; // Array of 1–6 imprinted powers
        // === PSICROWN ===
        powersKnown?: ID[];     // Fixed list of power IDs accessible via the crown's PP
        // === SHARED ===
        manifesterLevel?: number; // Dorje/tattoo/psicrown: creation ML (affects variable effects)
        // === PSIONIC TATTOO ===
         activated?: boolean;    // True = tattoo has been used and has faded
     };
}
```

### 5.1.1. Psionic Item Data — `psionicItemData` and the Five Item Types

The D&D 3.5 SRD (Expanded Psionics Handbook) defines five psionic item categories, each analogous to a mundane magic item type but with psionic-specific mechanics. All five are modelled as `ItemFeature` with a `psionicItemData` block — no separate interface is needed.

#### Overview Table

| Type | SRD Analogue | Key mechanic | Fields used |
|---|---|---|---|
| `"cognizance_crystal"` | Ring of Storing | External PP battery; rechargeable | `storedPP`, `maxPP`, `attuned` |
| `"dorje"` | Wand | 50 charges, single power, power-trigger | `powerStored`, `charges`, `manifesterLevel` |
| `"power_stone"` | Scroll | 1–6 powers, single-use each, Brainburn | `powersImprinted[]` |
| `"psicrown"` | Staff | PP pool + fixed power list, augmentable | `storedPP`, `maxPP`, `powersKnown[]`, `manifesterLevel` |
| `"psionic_tattoo"` | Potion | Body-worn single-use, 1st–3rd level only | `powerStored`, `manifesterLevel`, `activated` |

#### Cognizance Crystal (`"cognizance_crystal"`)

A PP-storing crystal worn or held by a psionic character. Acts as a supplemental PP battery.

- `storedPP` (mutable): current PP available. Decrements as powers are manifested.  
- `maxPP` (immutable after creation): always an **odd integer between 1–17**. Determines market price tier.  
- `attuned` (mutable): requires 10 minutes of contact to attune. Until `true`, stored PP cannot be accessed.  
- **Recharge rule**: owner may spend their own PP to refill (1 PP spent → 1 PP stored). Does NOT auto-recharge on rest.  
- **Restriction**: cannot draw from more than one PP source per power manifestation.

```json
{
  "id": "item_cognizance_crystal_5pp",
  "category": "item",
  "equipmentSlot": "none",
  "weightLbs": 1,
  "costGp": 9000,
  "psionicItemData": {
    "psionicItemType": "cognizance_crystal",
    "maxPP": 5,
    "storedPP": 5,
    "attuned": false
  }
}
```

#### Dorje (`"dorje"`)

A slender crystal wand containing a single psionic power. Uses the power-trigger activation method (standard action, no AoO).

- `powerStored`: ID of the `MagicFeature` (psionic power) this dorje manifests.  
- `charges` (mutable): starts at 50, decrements per use. At 0, the dorje is an inert crystal.  
- `manifesterLevel`: the ML at which the power was baked in (affects range/duration/damage). Cannot exceed `minimumML + 5`.  
- **Augmentation**: dorjes cannot be augmented at use time. A higher-ML dorje is pre-augmented at creation.  
- **Restriction**: user must have the power on their class list.

```json
{
  "id": "item_dorje_mind_thrust_750gp",
  "category": "item",
  "equipmentSlot": "main_hand",
  "weightLbs": 0.25,
  "costGp": 750,
  "psionicItemData": {
    "psionicItemType": "dorje",
    "powerStored": "power_mind_thrust",
    "charges": 50,
    "manifesterLevel": 1
  }
}
```

#### Power Stone (`"power_stone"`)

A crystal scroll analogue. Holds 1–6 independently usable powers, each with its own manifester level.

- `powersImprinted`: array of `PowerStoneEntry` objects (each: `powerId`, `manifesterLevel`, `usedUp`).  
- Each power is used independently — manifesting one does not affect the others.  
- When all `usedUp === true`, the stone is fully depleted.  
- **Brainburn**: if the user's ML is below an entry's `manifesterLevel`, they make a level check (DC = ML + 1). Failure triggers Brainburn: 1d6/stored power/round for 1d4 rounds.  
- **Addressing**: before use, the stone must be "addressed" (Psicraft DC 15 + power level) to know what it contains.

```json
{
  "id": "item_power_stone_minor_001",
  "category": "item",
  "equipmentSlot": "none",
  "weightLbs": 0.05,
  "costGp": 175,
  "psionicItemData": {
    "psionicItemType": "power_stone",
    "powersImprinted": [
      { "powerId": "power_mind_thrust", "manifesterLevel": 1, "usedUp": false },
      { "powerId": "power_psionic_minor_creation", "manifesterLevel": 3, "usedUp": false }
    ]
  }
}
```

#### Psicrown (`"psicrown"`)

A head-slot item containing a fixed set of psionic powers backed by a dedicated PP pool.

- `storedPP` (mutable): current PP in the crown. Created with `50 × manifesterLevel` PP.  
- `maxPP` (immutable): set to `50 × manifesterLevel` at creation.  
- `powersKnown[]`: IDs of powers accessible via the crown. Wearer can augment using crown PP.  
- `manifesterLevel`: affects PP pool size and per-power augmentation ceiling.  
- **Key restriction**: the user CANNOT supplement crown PP with personal PP.  
  They also cannot use personal PP to manifest the crown's powers independently.

```json
{
  "id": "item_psicrown_dominator",
  "category": "item",
  "equipmentSlot": "head",
  "weightLbs": 0.5,
  "costGp": 20250,
  "psionicItemData": {
    "psionicItemType": "psicrown",
    "manifesterLevel": 9,
    "maxPP": 450,
    "storedPP": 450,
    "powersKnown": [
      "power_charm_person_psionic",
      "power_dominate_person",
      "power_mass_conceal_thoughts"
    ]
  }
}
```

#### Psionic Tattoo (`"psionic_tattoo"`)

A single-use psionic power inscribed on the body. Only 1st–3rd level powers. Maximum 20 tattoos per body.

- `powerStored`: ID of the power this tattoo manifests when activated.  
- `manifesterLevel`: the minimum ML for the stored power.  
- `activated` (mutable): `false` = intact; `true` = tattoo has been used and faded.  
- **Body-slot limit**: the inventory manager (Phase 13.3) must count non-activated tattoos. At 21, ALL activate simultaneously (house narration).  
- **Equipment slot**: use `"body"` for tattoos (they cover body surface; unlike normal body-slot items, 20 can coexist).

```json
{
  "id": "item_psionic_tattoo_force_screen",
  "category": "item",
  "equipmentSlot": "body",
  "weightLbs": 0,
  "costGp": 50,
  "psionicItemData": {
    "psionicItemType": "psionic_tattoo",
    "powerStored": "power_force_screen",
    "manifesterLevel": 1,
    "activated": false
  }
}
```

#### Field-to-Type Matrix

| Field | cognizance_crystal | dorje | power_stone | psicrown | psionic_tattoo |
|---|:---:|:---:|:---:|:---:|:---:|
| `psionicItemType` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `storedPP` | ✓ | — | — | ✓ | — |
| `maxPP` | ✓ | — | — | ✓ | — |
| `attuned` | ✓ | — | — | — | — |
| `powerStored` | — | ✓ | — | — | ✓ |
| `charges` | — | ✓ | — | — | — |
| `powersImprinted` | — | — | ✓ | — | — |
| `powersKnown` | — | — | — | ✓ | — |
| `manifesterLevel` | — | ✓ | — | ✓ | ✓ |
| `activated` | — | — | — | — | ✓ |

> **Mutable vs immutable**: `storedPP`, `charges`, `powersImprinted[].usedUp`, and `activated` change during play (deplete as the item is used). `maxPP`, `powerStored`, `powersImprinted[].powerId`, `powersImprinted[].manifesterLevel`, `powersKnown`, and `manifesterLevel` are immutable static configuration set at item creation time.

```typescript
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
    
    // For arcane/divine: the school of magic ("abjuration", "conjuration", etc.)
    // For psionic: legacy/display use only — use `discipline` field for engine queries.
    school: string;
    subSchool?: string;  
    descriptors: string[]; // E.g.: ["fire", "evil", "mind-affecting"]

    // === PSIONIC-ONLY FIELDS (undefined for arcane/divine spells) ===

    // Canonical psionic discipline. All engine queries use this, not `school`.
    // "clairsentience"|"metacreativity"|"psychokinesis"|"psychometabolism"|"psychoportation"|"telepathy"
    // @see PsionicDiscipline type and ARCHITECTURE.md section 5.2.1
    discipline?: "clairsentience" | "metacreativity" | "psychokinesis"
               | "psychometabolism" | "psychoportation" | "telepathy";

    // Sensory display effects. Can have multiple simultaneously.
    // "auditory"|"material"|"mental"|"olfactory"|"visual"
    // Suppressed with Concentration DC 15 + power level.
    // @see PsionicDisplay type and ARCHITECTURE.md section 5.2.1
    displays?: ("auditory" | "material" | "mental" | "olfactory" | "visual")[];

    // ======================================================
    
    resistanceType: "spell_resistance" | "power_resistance" | "none";
    components: string[]; // Magic (V, S, M) or Psionic (A, M, O, V)
    
    range: string;       // Formula (e.g.: "25 + floor(@attributes.caster_level.totalValue / 2) * 5")
    targetArea: LocalizedString;
    duration: string;    
    savingThrow: "fort_half" | "ref_negates" | "will_disbelieves" | "none" | string;
    
     augmentations?: AugmentationRule[]; // Exclusive to Psionics (or custom rules)
}
```

### 5.2.1. Psionic Power Fields — `discipline` and `displays`

These two fields extend `MagicFeature` specifically for `magicType: "psionic"` powers. They have no meaning for arcane or divine spells and should be left `undefined` for those.

#### `discipline: PsionicDiscipline | undefined`

The psionic discipline is the canonical grouping of a power in the D&D 3.5 SRD (EPH). It is a **required field for all psionic powers**. Arcane/divine spells leave it `undefined`.

| Value | Specialist Class | Focus |
|---|---|---|
| `"clairsentience"` | Seer | Information, precognition, scrying |
| `"metacreativity"` | Shaper | Matter/creature creation from psionic energy |
| `"psychokinesis"` | Kineticist | Energy manipulation (fire, ice, electricity, force) |
| `"psychometabolism"` | Egoist | Body alteration, healing, self-transformation |
| `"psychoportation"` | Nomad | Movement, teleportation, time/plane travel |
| `"telepathy"` | Telepath | Mind-affecting, control, charm, compulsion |

**Why a separate `discipline` field instead of using `school`?**

The `school` field already exists and is a plain `string` — it was used in early psionic entries to store the discipline name (e.g., `"clairsentience"`). However, `school` is a generic string that carries no type safety or engine-queryable contract. The dedicated `discipline` field:
1. Is a **typed union** — the TypeScript compiler rejects invalid values.
2. Provides a **stable query key** for DataLoader queries (`"discipline:telepathy"`).
3. Enables **psicraft mechanics** (Psicraft DC +5 to identify powers outside specialist discipline).
4. Enables **UI grouping** in the Psionic Powers panel — powers organised by discipline tab.
5. Enables future **Psion specialist class restrictions** (Seer gets extra clairsentience powers).

`school` on psionic powers is kept for display/legacy compatibility but is NOT used by the engine for mechanical discipline queries.

**`discipline` in `optionsQuery`:**

The DataLoader supports a new query format for psionic filtering:

| Format | Example | Meaning |
|---|---|---|
| `discipline:<d>` | `"discipline:telepathy"` | All psionic powers in that discipline |
| `discipline:<d>+level:<n>` | `"discipline:clairsentience+level:3"` | Discipline + level filter |

#### `displays: PsionicDisplay[] | undefined`

An array of sensory display types observable when the power is manifested. For most psionic powers this has 0–3 entries; for spells it is `undefined` or `[]`.

| Value | SRD abbreviation | Sensory effect |
|---|---|---|
| `"auditory"` | `A` | Bass hum, like deep voices; heard up to 100 ft. |
| `"material"` | `Ma` | Translucent ectoplasmic coating on subject; evaporates in 1 round |
| `"mental"` | `Me` | Subtle chime in minds of creatures within 15 ft. |
| `"olfactory"` | `Ol` | Odd scent spreading 20 ft. from manifester; fades quickly |
| `"visual"` | `Vi` | Silver eye-fire on manifester; rainbow flash at 5 ft. |

Multiple displays can coexist: `["auditory", "visual"]` means both effects occur simultaneously.

**Suppressing displays (SRD rule):**
A manifester can suppress ALL of a power's displays by succeeding on a Concentration check (DC 15 + power level) as part of the manifestation action. This is a UI/Dice Engine concern, not an engine pipeline concern — `displays` is purely informational/display metadata.

**Authoring note:** SRD power descriptions use abbreviation letters (`A`, `Ma`, `Me`, `Ol`, `Vi`, `see text`). JSON data content should translate these to full `PsionicDisplay` values. Powers with `"see text"` should use the display type that best matches the described effect.

#### Complete psionic power example

```json
{
  "id": "power_mind_thrust",
  "category": "magic",
  "magicType": "psionic",
  "ruleSource": "srd_psionics",
  "label": { "en": "Mind Thrust", "fr": "Assaut mental" },
  "description": { "en": "You send a lance of mental energy at a target..." },
  "tags": ["magic", "psionic", "mind-affecting"],
  "school": "telepathy",
  "discipline": "telepathy",
  "subSchool": null,
  "descriptors": ["mind-affecting"],
  "spellLists": {
    "list_psion_wilder": 1,
    "list_psion_telepath": 1
  },
  "displays": ["auditory", "mental"],
  "resistanceType": "power_resistance",
  "components": ["Me"],
  "range": "close",
  "targetArea": { "en": "One creature", "fr": "Une créature" },
  "duration": "instantaneous",
  "savingThrow": "will_negates",
  "grantedModifiers": [],
  "grantedFeatures": [],
  "augmentations": [
    {
      "costIncrement": 2,
      "grantedModifiers": [
        {
          "id": "aug_mind_thrust_1d10",
          "sourceId": "power_mind_thrust",
          "sourceName": { "en": "Mind Thrust (augmented)" },
          "targetId": "damage",
          "value": "1d10",
          "type": "untyped"
        }
      ],
      "isRepeatable": true
    }
  ]
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

See **Annex A** (sections A.1 through A.2) for complete class examples including Barbarian (20 levels), Cleric (5 levels + Turn Undead), Monk (5 levels), Dragon Disciple (10 levels as prestige class), Druid (5 levels + Animal Companion), and Soulknife (6 levels, psionic). Fighter class increments are demonstrated in multiclass test fixtures (`src/tests/multiclass.test.ts`) and `static/rules/test_mock.json`.

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

### 5.6. Action Budget (`actionBudget`) — Condition-Imposed Action Restrictions

D&D 3.5 has many conditions that limit a character's available actions per round. Without a machine-readable action budget, the engine can apply a condition's modifiers (attack penalties, DEX loss, etc.) but the Combat UI has no programmatic way to enforce action restrictions — a Staggered character shouldn't be allowed a full attack.

The `actionBudget` field on `Feature` solves this. When a condition Feature is active and has `actionBudget` set, the Combat Turn UI reads it to enforce the restriction automatically.

#### Field Structure

```typescript
actionBudget?: {
    standard?:   number;   // Max standard actions per round (0 = completely blocked)
    move?:       number;   // Max move actions per round
    swift?:      number;   // Max swift actions per round
    immediate?:  number;   // Max immediate actions per round
    free?:       number;   // Max free actions per round
    full_round?: number;   // Max full-round actions per round (0 = no full attack/run)
}
```

- Each key is **optional**. An **absent key** means "no restriction from this Feature for that action type" (effectively unlimited).
- A value of **`0`** means that action type is **completely blocked** while this Feature is active.
- A value of **`1`** means at most one of that action type per round.
- The field is optional on the `Feature` itself — `actionBudget: undefined` means no restrictions.

#### UI Resolution Rule — Minimum Wins

When multiple active condition Features each have an `actionBudget`, the Combat UI computes the effective budget per category as the **minimum** of all active values for that category. This means the most restrictive condition always wins:

```
effectiveStandard = min(all active feature.actionBudget.standard values)
                    (absent values = ∞, treated as no restriction)
```

Example: If `condition_staggered` gives `{ standard: 1 }` and `condition_nauseated` gives `{ standard: 0 }`, the effective standard action budget is `min(1, 0) = 0` — the character cannot take a standard action.

#### Complete D&D 3.5 SRD Condition Table

| Condition | `standard` | `move` | `full_round` | Notes |
|---|:---:|:---:|:---:|---|
| **Normal** | — | — | — | No `actionBudget` field (absent = unlimited) |
| **Staggered** | 1 | 1 | 0 | Either standard OR move, not both; "or" enforced by UI turn tracker |
| **Disabled** | 1 | 1 | 0 | Same as Staggered; standard action costs 1 HP (UI concern) |
| **Nauseated** | 0 | 1 | 0 | Only move action; no attack, cast, concentrate |
| **Stunned** | 0 | 0 | 0 | No actions at all; `free: 0` optional (drops held items — physical) |
| **Cowering** | 0 | 0 | 0 | Frozen in fear; no actions |
| **Dazed** | 0 | 0 | 0 | No actions; 1 round typical duration |
| **Fascinated** | 0 | 0 | 0 | Only pays attention; no other actions |
| **Paralyzed** | 0 | 0 | 0 | No physical actions; mental-only (no `free: 0` to allow speech) |
| **Dying** | 0 | 0 | 0 | Unconscious; no actions |
| **Unconscious** | 0 | 0 | 0 | Helpless; no actions |
| **Dead** | 0 | 0 | 0 | No actions |

> **Design Note — `swift` and `immediate` omitted from simple conditions:** Most basic conditions do not explicitly restrict swift/immediate actions in the SRD. Content authors should only add `swift: 0` or `immediate: 0` if the SRD text explicitly says "cannot take any actions whatsoever", and even then only for completeness. The standard conditions above focus on the explicitly named restrictions.

#### The "Standard OR Move, Not Both" Rule (Staggered / Disabled)

The D&D 3.5 SRD states: a Staggered character may take a single move action OR a standard action — but NOT both. This is a **soft mutual exclusion** that cannot be represented as a simple per-category cap alone, because both `standard: 1` and `move: 1` are individually valid.

**Solution — UI turn tracker**: The `actionBudget` declares the per-action cap. The Combat Turn UI tracks a `actionsSpentThisTurn: { standard: 0, move: 0, ... }` counter. When either a standard or a move action has been spent:
- The counter is updated.
- The UI checks: if the character is Staggered (has the XOR constraint) AND one action has been spent, disable the other.

This is a **UI logic concern**, not a data model concern. The `actionBudget` remains simple (`{ standard: 1, move: 1, full_round: 0 }`), and the UI adds the mutual exclusion logic when it detects the Staggered or Disabled condition tag.

**Suggested implementation tags for the XOR condition:**
```json
// On the condition_staggered Feature:
{
  "tags": ["condition", "condition_staggered", "action_budget_xor"],
  "actionBudget": { "standard": 1, "move": 1, "full_round": 0 }
}
```

The `"action_budget_xor"` tag signals the Combat UI that this condition applies a mutual exclusion between standard and move actions.

#### JSON Examples

```json
// Staggered condition (SRD: conditionSummary.html)
{
  "id": "condition_staggered",
  "category": "condition",
  "ruleSource": "srd_core",
  "tags": ["condition", "condition_staggered", "action_budget_xor"],
  "actionBudget": { "standard": 1, "move": 1, "full_round": 0 },
  "grantedModifiers": [],
  "grantedFeatures": []
}

// Nauseated condition
{
  "id": "condition_nauseated",
  "category": "condition",
  "ruleSource": "srd_core",
  "tags": ["condition", "condition_nauseated"],
  "actionBudget": { "standard": 0, "move": 1, "full_round": 0 },
  "grantedModifiers": [],
  "grantedFeatures": []
}

// Stunned condition
{
  "id": "condition_stunned",
  "category": "condition",
  "ruleSource": "srd_core",
  "tags": ["condition", "condition_stunned"],
  "actionBudget": { "standard": 0, "move": 0, "full_round": 0 },
  "grantedModifiers": [
    {
      "id": "mod_stunned_ac",
      "sourceId": "condition_stunned",
      "sourceName": { "en": "Stunned" },
      "targetId": "combatStats.ac_normal",
      "value": -2,
      "type": "untyped"
    }
  ],
  "grantedFeatures": []
}
```

#### `actionBudget` on Non-Condition Features

While primarily used on `category: "condition"` Features, `actionBudget` is defined on the base `Feature` interface and is therefore available to ALL Feature types:

- **Spell effects** — A *Slow* spell effect applied as an active Feature could carry `{ move: 1 }` (half speed, one action only).
- **Environmental conditions** — `environment_gale_force_winds` might restrict full-round actions for small creatures: `{ full_round: 0 }`.
- **Racial abilities** — A class feature that limits action economy mid-combat (unusual but possible in homebrew).

> **AI Implementation Note (Phase 10.1 — Combat Tab):**
> The Combat Turn UI must:
> 1. At the start of each turn, collect all active `ActiveFeatureInstance`s where `feature.actionBudget` is defined and the instance `isActive: true`.
> 2. Compute effective budget: for each category (`standard`, `move`, etc.), take `min(all defined values)`.
> 3. Render each action button with the budget applied: show a count indicator ("1/1") and disable the button when the turn budget is exhausted.
> 4. On the Staggered/Disabled XOR case: check for the `"action_budget_xor"` tag and apply mutual exclusion logic.
> 5. Display a tooltip on restricted buttons: "[Condition Name]: [original SRD text]".

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

A Fighter 5 / Wizard 3 / Duelist 2 (character level 10):

```json
{
  "id": "char_aldric",
  "name": "Aldric",
  "classLevels": {
    "class_fighter": 5,
    "class_wizard": 3,
    "class_duelist": 2
  },
  "levelAdjustment": 0,
  "xp": 45000
}
```

- `@characterLevel` = 10 (5 + 3 + 2)
- BAB = 5 (Fighter full) + 1 (Wizard half) + 2 (Duelist full) = **+8**
- The engine sums BAB increments from each class's `levelProgression` up to `classLevels[classId]`.

### 6.2. Example: `ActiveFeatureInstance` with `selections`

A Cleric who has chosen the War domain and the deity Heironeous:

```json
{
  "instances": [
    {
      "instanceId": "afi_cleric_001",
      "featureId": "class_cleric",
      "isActive": true,
      "selections": {
        "domain_choice_1": ["domain_war"],
        "domain_choice_2": ["domain_strength"],
        "deity_choice": ["deity_heironeous"]
      }
    }
  ]
}
```

The `selections` record maps each `choiceId` (defined in the Feature's `choices` array) to the array of selected Feature IDs. The `GameEngine` reads this record during Phase 0 to activate the chosen sub-features (e.g., injecting `domain_war` and `domain_strength` into the active features list as if they were directly granted).

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

    // 4. Variant rules — flags that change core engine behaviour (default all false)
    variantRules: {
        // Vitality/Wound Points (UA): crit damage routes to res_wound_points.
        // RollResult.targetPool = "res_vitality" | "res_wound_points" | "res_hp"
        // @see ARCHITECTURE.md section 8.3 — Vitality/Wound Points variant
        // @see DamageTargetPool in diceEngine.ts — the routing enum
        vitalityWoundPoints: boolean;
        // Gestalt Characters (UA): BAB/saves use max-per-level instead of sum.
        // @see ARCHITECTURE.md section 8.2 — Gestalt variant documentation
        // @see src/lib/utils/gestaltRules.ts — computeGestaltBase() implementation
        gestalt: boolean;
    };
    
    // 5. Enabled rule sources (ORDERED)
    // Ordered array of JSON rule source IDs enabled for this campaign.
    // ORDER IS CRUCIAL: sources listed last have the highest priority.
    // The DataLoader loads and merges Features in this order.
    // Example: ["srd_core", "srd_psionics", "unearthed_arcana", "homebrew_darklands"]
    enabledRuleSources: ID[];
}
```

### 8.1. `variantRules` Block — Engine-Level Variant Flags

The `variantRules` block in `CampaignSettings` collects flags that require **engine-level code branches** — they change how the DAG computes character statistics, not just what data is loaded. This is distinct from `enabledRuleSources`, which controls content filtering.

**Principle:** Every variant rule flag gates exactly ONE code path in the engine. No variant rules are checked outside of `settings.variantRules.*`.

| Flag | Default | Engine Effect |
|---|:---:|---|
| `vitalityWoundPoints` | `false` | Dice Engine: `RollResult.targetPool` set to `"res_vitality"`/`"res_wound_points"` based on crit |
| `gestalt` | `false` | Phase 3: BAB/saves use max-per-level instead of additive sum |

### 8.2. Gestalt Characters Variant (`variantRules.gestalt`)

**Source:** Unearthed Arcana "Gestalt Characters" (SRD variant rules).

A Gestalt character advances in **two classes simultaneously** at each level. The character gains the best features of each class, but BAB and saving throw progressions use the **maximum contribution per level** rather than the additive sum that standard multiclassing uses.

#### Standard vs Gestalt BAB Comparison

| Level | Fighter BAB | Wizard BAB | Standard BAB | Gestalt BAB |
|:---:|:---:|:---:|:---:|:---:|
| 1 | +1 | 0 | 1 | 1 |
| 2 | +1 | +1 |3 | 2 |
| 3 | +1 | 0 | 4 | 3 |
| 4 | +1 | +1 | 6 | 4 |
| 5 | +1 | 0 | 7 | 5 |
| **Total** | **5** | **2** | **7** | **5** |

Standard multiclassing gives BAB +7 (Fighter 5 + Wizard 5 increments summed). Gestalt gives BAB +5 (Fighter's full BAB wins at every level).

#### Gestalt Save Comparison

For Fortitude (Fighter = Good save, Wizard = Poor save):

| Level | Fighter Fort | Wizard Fort | Standard | Gestalt |
|:---:|:---:|:---:|:---:|:---:|
| 1 | +2 | 0 | 2 | 2 |
| 2 | 0 | 0 | 2 | 2 |
| 3 | +1 | +1 | 4 | 3 |
| 4 | 0 | 0 | 4 | 3 |
| 5 | +1 | 0 | 5 | 4 |
| **Total** | **4** | **1** | **5** | **4** |

Fighter's Good Fortitude dominates, giving the same total as Fighter alone.

#### Algorithm — `computeGestaltBase()` (`src/lib/utils/gestaltRules.ts`)

```
For pipeline P (BAB, Fort, Ref, or Will):
  For each character level N = 1 to characterLevel:
    perLevelMax[N] = max(class1.base_increment_at_N, class2.base_increment_at_N, ..., 0)
  gestaltTotal = sum(perLevelMax[1..N])
```

Implemented in `src/lib/utils/gestaltRules.ts` as a pure function `computeGestaltBase(mods, classLevels, characterLevel)`.

#### Affected vs Unaffected Pipelines

| Pipeline | Affected? | Notes |
|---|:---:|---|
| `combatStats.bab` | ✅ | Max per level |
| `saves.fort` | ✅ | Max per level |
| `saves.ref` | ✅ | Max per level |
| `saves.will` | ✅ | Max per level |
| `combatStats.max_hp` | ❌ | HP stacks: both classes' hit dice contribute fully |
| All non-`"base"` types | ❌ | Enhancement/racial/luck etc. always use standard stacking |
| Class features/spells | ❌ | Gestalt characters get ALL features of BOTH classes |

#### DAG Integration (Phase 3.7)

When `settings.variantRules.gestalt === true`, Phase 3 of the GameEngine splits the active modifiers for each affected pipeline:
1. Separates `"base"` type modifiers from non-`"base"` modifiers.
2. Calls `computeGestaltBase(baseMods, classLevels, characterLevel)` → gestalt base value.
3. Injects the gestalt base as `effectiveBaseValue` into `applyStackingRules()` with only the non-`"base"` modifiers.
4. Non-`"base"` modifiers (enhancement, luck, morale, etc.) pass through standard stacking unchanged.

When `gestalt === false` (default), both pipelines use the standard path: all modifiers go to `applyStackingRules()` which sums them (because `"base"` is in `ALWAYS_STACKING_TYPES`).

> **AI Implementation Note (Phase 3.7):** The gestalt flag is checked once at the top of `phase3_combatStats` (read from `this.settings.variantRules?.gestalt ?? false`). For each pipeline, `isGestaltAffectedPipeline(pipelineId)` determines if the gestalt path applies. Only `"base"` type modifiers are separated; all other modifier types go through standard stacking in both modes.

### 8.3. Vitality and Wound Points Variant (`variantRules.vitalityWoundPoints`)

**Source:** Unearthed Arcana "Vitality and Wound Points" (SRD variant rules, `aventuring/vitalityAndWoundPoints.html`).

This variant replaces the standard hit point system with TWO separate resource pools. It creates a more cinematic combat experience: characters are hard to kill outright on normal hits, but a lucky critical strike can bring down even a powerful character in one blow.

#### The Two Resource Pools

| Pool | Standard analogue | Refilled by | Reduced by |
|---|---|---|---|
| **Vitality Points** (`res_vitality`) | Hit Points | Long rest (like VP die roll at level-up) | Normal hits, most damage |
| **Wound Points** (`res_wound_points`) | (none) | Healing only | Critical hits; overflow when VP = 0 |

- **Vitality Points (VP)**: Gained per level using the class vitality die (d4–d12, same as the class hit die). Equal to class die + CON modifier at each level. Can be recovered with an 8-hour rest. Represents the ability to turn a hit into a glancing blow.
- **Wound Points (WP)**: Equal to the character's **current Constitution score** (not modifier — the score itself). Represents actual physical damage. Very slow to recover.

#### Critical Hit Damage Routing — The Key Rule

In standard D&D 3.5: critical hits multiply damage (`×2`, `×3`, `×4`) and route it to HP.

In V/WP mode:
- **Critical hits route the SAME (non-multiplied) damage** directly to **Wound Points**, bypassing Vitality Points. There is NO critical multiplier.
- This is why crits are so dangerous: even a Fighter with 50 VP can be one-shot by a crit if their WP (= CON score) is low.

| Scenario | Standard HP | V/WP Vitality | V/WP Wound |
|---|---|---|---|
| Normal hit, 8 damage | −8 HP | −8 VP | 0 WP |
| Critical (×2), 8 damage | −16 HP | 0 VP | −8 WP |
| Critical (×3), 8 damage | −24 HP | 0 VP | −8 WP |
| Overflow (VP = 0), 8 damage | −8 HP | 0 (already 0) | −8 WP |

#### `DamageTargetPool` — The Routing Enum

```typescript
type DamageTargetPool =
  | "res_hp"           // Standard mode: all damage here
  | "res_vitality"     // V/WP mode: normal hit → vitality points
  | "res_wound_points" // V/WP mode: critical hit → wound points
```

#### Algorithm in `parseAndRoll()` (Phase 2.5b)

When `settings.variantRules.vitalityWoundPoints === true`:

1. `isVWPMode = true`
2. Check `context.isCriticalHit` (caller explicitly signals this is a confirmed-crit damage roll) OR fall back to `isCriticalThreat` (combined attack+damage rolls).
3. If confirmed crit: `targetPool = "res_wound_points"`
4. Otherwise: `targetPool = "res_vitality"`

When `vitalityWoundPoints === false` (default): `targetPool = "res_hp"` always.

#### Overflow Handling (Combat UI Responsibility)

When `res_vitality.currentValue === 0`, the Combat UI redirects ALL subsequent damage — even normal hits — to `res_wound_points`. The dice engine only determines the **initial routing** based on crit status. This overflow check is a Combat Tab (Phase 10.1) concern.

#### `RollContext.isCriticalHit` — Two-Roll Combat Flow

In standard D&D 3.5 combat, attack and damage are separate rolls:
1. **Attack roll** → determines `isCriticalThreat` (and crit confirmation, if applicable).
2. **Damage roll** → caller passes `context.isCriticalHit: true` if the attack was a confirmed crit.

The `isCriticalHit` field on `RollContext` is optional (`boolean | undefined`). When present and `true`, it overrides `isCriticalThreat` (which is always `false` on a damage roll) for pool routing.

#### Required Content (JSON data)

For V/WP mode to work, each character needs these ResourcePools in their character data:

```json
// Vitality Points pool — replaces res_hp for normal damage
{
  "id": "resources.vitality_points",
  "label": { "en": "Vitality Points" },
  "maxPipelineId": "combatStats.max_vitality",
  "currentValue": 0,
  "temporaryValue": 0,
  "resetCondition": "long_rest"
}
// Wound Points pool — equals current Constitution score
{
  "id": "resources.wound_points",
  "label": { "en": "Wound Points" },
  "maxPipelineId": "attributes.stat_con.totalValue",
  "currentValue": 0,
  "temporaryValue": 0,
  "resetCondition": "never"
}
```

> **AI Implementation Note (Combat Tab Phase 10.1):** When `settings.variantRules.vitalityWoundPoints` is `true`, the Combat Tab must: (1) display BOTH `resources.vitality_points` AND `resources.wound_points` bars. (2) After applying any damage: if `vitality_points.currentValue` dropped to 0 and there is remaining damage, apply the rest to `wound_points`. (3) Read `RollResult.targetPool` on damage rolls to route to the initial pool. (4) Apply the Wound damage consequences (Fatigued on first wound, Fortitude save DC 5+WP_lost or Stunned).

---

## 9. The Svelte 5 Engine (The Brain and Resolution Order)

The reactive store architecture. It uses Svelte 5 Runes (`$state`, `$derived`). To avoid cyclic dependencies (infinite loops), the engine evaluates characteristics according to a **strict sequential Directed Acyclic Graph (DAG)**.

_Suggested target file: `src/lib/engine/GameEngine.svelte.ts`_

```mermaid
flowchart TD
    INPUT["character.$state\nactiveFeatures, classLevels,\nlevelAdjustment, xp, ..."]

    subgraph "Phase 0 — Flatten & Filter"
        P0C["phase0_characterLevel\n= Σ classLevels"]
        P0ECL["phase0_eclForXp\n= characterLevel + LA"]
        P0FLAT["phase0_flatModifiers\nFilter: prerequisites ✓\nFilter: forbiddenTags ✓\nFilter: levelProgression ✓\nApply: gmOverrides"]
    end

    subgraph "Phase 1 — Size & Encumbrance"
        P1["Size modifiers\nEquipment weight sum\nLoad condition injection"]
    end

    subgraph "Phase 2 — Ability Scores"
        P2["STR / DEX / CON / INT / WIS / CHA\nStack modifiers (stacking rules)\nCompute derivedModifier = ⌊(total−10)/2⌋"]
    end

    subgraph "Phase 3 — Combat Statistics"
        P3BAB["BAB\n(gestalt-aware: max/level)"]
        P3SAVES["Fort / Ref / Will\n(gestalt-aware: max/level)"]
        P3HP["Max HP\n= Σ hitDieResults + CON_mod×level"]
        P3AC["AC (normal / touch / flat-footed)\nInitiative, Grapple"]
    end

    subgraph "Phase 4 — Skills & Budget"
        P4SKILLS["SkillPipeline per skill\nisClassSkill union\napplyArmorCheckPenalty"]
        P4BUDGET["phase4_skillPointsBudget\nper-class SP (4× first level)"]
        P4JOURNAL["phase4_levelingJournal\nper-class BAB/saves/SP breakdown"]
    end

    SNAPSHOT["CharacterContext snapshot\nused by Math Parser & Logic Evaluator"]

    INPUT --> P0C & P0ECL
    P0C & P0ECL --> P0FLAT
    P0FLAT --> P1
    P1 --> P2
    P2 --> P3BAB & P3SAVES & P3HP & P3AC
    P3BAB & P3SAVES & P3HP & P3AC --> P4SKILLS
    P4SKILLS --> P4BUDGET & P4JOURNAL
    P4BUDGET & P4JOURNAL --> SNAPSHOT
```

**Responsibilities and Resolution Order (Cascading `$derived` Phases):**

1. **Phase 0 (Extraction & Flattening):**
   A `$derived` loops over `character.activeFeatures` **and** `character.gmOverrides`, loads each Feature's JSON via the `DataLoader` (which has already resolved the complete Data Override chain), validates `prerequisitesNode`, ignores `forbiddenTags`, and applies filtering by `levelProgression` (using `classLevels[featureId]` to only retain entries ≤ the current level in that class). The result is a flat list of all valid `Modifiers`.

2. **Phase 1 (Base & Equipment):**
   A `$derived` computes Size modifiers and Encumbrance (sum of equipment weights).

3. **Phase 2 (Main Attributes):**
   A `$derived` computes STR, DEX, CON, INT, WIS, CHA by applying Phase 0 modifiers, stacking rules, and `derivedModifier` via `floor((totalValue - 10) / 2)`. _(Constitution total is now frozen)._

 4. **Phase 3 (Combat Statistics):**
    A `$derived` computes AC, Initiative, BAB (sum of contributions from all classes via `levelProgression`), Saves, and **Max HP**. It uses the frozen results from Phase 2 (e.g.: Constitution modifier for HP). Character Level is derived here as `Object.values(character.classLevels).reduce((a, b) => a + b, 0)`.
    **HP Calculation:** Max HP = sum of `hitDieResults[level]` (stored in the character's resources) + (`stat_con.derivedModifier` × character level). Hit die values per level are stored in the character state (rolled once during level-up or set to a fixed value based on campaign rules). When CON changes (e.g., from a Belt of Constitution), the HP maximum automatically recalculates because it reads the frozen CON modifier from Phase 2.
    **Phase 3.7 — Gestalt Mode:** When `settings.variantRules.gestalt === true`, Phase 3 replaces the standard "sum all base modifiers" path for BAB and saves with `computeGestaltBase()` (max per level across classes, then sum). See section 8.2 and `src/lib/utils/gestaltRules.ts`.

5. **Phase 4 (Skills & Abilities):**
   A `$derived` computes skills (which depend on Phase 2 Attributes and Phase 3 Armor Check Penalty). Determines which skills are "class skills" by combining the tags of all active classes. Also derives the full skill point budget and the leveling journal. See **section 9.6** for the complete specification.

   **Phase 4.5 — Skill Point Budget (`phase4_skillPointsBudget`):**
   A dedicated `$derived` computes the per-class skill point budget using the SRD RAW formula (section 9.6). Exported as `SkillPointsBudget`.

   **Phase 4.6 — Leveling Journal (`phase4_levelingJournal`):**
   A dedicated `$derived` produces per-class breakdowns of BAB, saves, SP, class skills, and granted features. Exported as `LevelingJournal`. Consumed by `LevelingJournalModal.svelte`.

6. **Context Sorting:**
   During injection into Pipelines, the engine separates modifiers that have a `situationalContext`. They are not summed into `totalBonus`, but stored in `situationalModifiers` for the UI and the Dice Engine.

### 9.1. Infinite Loop Detection

The sequential DAG naturally prevents most cyclic dependencies since each phase only reads results from previous phases. However, malicious or poorly designed Features could attempt to create loops (e.g.: a Feature that increases CON based on Max HP, while Max HP depends on CON).

**Protection strategy:**
- The engine maintains a resolution depth counter.
- If a pipeline is re-evaluated more than **3 times** in a single resolution cycle, the engine cuts the evaluation, logs a warning ("Circular dependency detected on pipeline: stat_con"), and preserves the last stable value.
- This mechanism is tested in Phase 17.5.

### 9.2. Phase 0 Detail — Character Level and ECL Derivation

Two intermediate `$derived` values are computed in Phase 0 before the main resolution phases:

**Phase 0c — `phase0_characterLevel`:**
```typescript
phase0_characterLevel = Object.values(character.classLevels).reduce((a, b) => a + b, 0);
```
This is the sum of all class levels. It explicitly **excludes** `levelAdjustment`. Used for: feat slot calculation, max skill ranks, HP formula, class feature gating.

**Phase 0c2 — `phase0_eclForXp`:**
```typescript
phase0_eclForXp = phase0_characterLevel + (character.levelAdjustment ?? 0);
```
Combined ECL used only for XP threshold lookups. Exposed in `CharacterContext` as `@eclForXp` for the Math Parser.

Both values are computed before the modifier flattening phase so that `levelProgression` filtering and formula resolution (`@characterLevel`, `@eclForXp`) are available throughout all subsequent phases.

### 9.3. Phase 0 Detail — Feature Activation and `levelProgression` Filtering

The flattening phase (Phase 0) applies three layers of filtering for each `ActiveFeatureInstance`:

1. **Feature existence check:** The Feature JSON is fetched from `DataLoader`. If the Feature ID is unknown (not in any loaded rule source), the instance is silently skipped with a console warning.
2. **`prerequisitesNode` evaluation:** The `logicEvaluator` is called with `phase0_context`. If the node returns `false`, all modifiers from this instance are excluded for this resolution cycle.
3. **`forbiddenTags` check:** If the character has any tag from the Feature's `forbiddenTags` array in their current `@activeTags`, the Feature is deactivated.
4. **`levelProgression` filtering:** For class Features, only `levelProgression` entries where `entry.level <= classLevels[featureId]` contribute their modifiers. This implements the "you only get bonuses for levels you've attained" rule.

The output of Phase 0 is `phase0_flatModifiers`: a flat `Modifier[]` array ready for pipeline injection.

### 9.4. Context Snapshot (`CharacterContext`)

The `CharacterContext` is a read-only snapshot of the character's current state, passed to the Math Parser and Logic Evaluator. It is rebuilt at the start of each resolution cycle to avoid stale reads.

```typescript
interface CharacterContext {
    attributes:     Record<ID, StatisticPipeline>;
    skills:         Record<ID, SkillPipeline>;
    combatStats:    Record<ID, StatisticPipeline>;
    saves:          Record<ID, StatisticPipeline>;
    resources:      Record<ID, ResourcePool>;
    activeTags:     string[];         // @activeTags
    classLevels:    Record<ID, number>; // @classLevels.<classId>
    characterLevel: number;           // @characterLevel
    eclForXp:       number;           // @eclForXp
    selections:     Record<ID, string[]>; // @selection.<choiceId>
}
```

The `activeTags` array is the union of all `tags` from active Features (instances with `isActive: true`). It is used heavily by `conditionNode` logic trees.

### 9.5. Phase 1 Detail — Size and Encumbrance

Phase 1 computes two foundational pipeline groups before ability scores:

**Size modifiers:** The Size pipeline (`attributes.size_category`) is set by the race Feature. The engine uses it to apply standard D&D 3.5 size modifiers to attack rolls, AC, Hide checks, grapple checks, and carrying capacity. Size is one of the first things resolved because it affects combat statistics computed in Phase 3.

**Encumbrance:** The `GameEngine` sums `weightLbs` across all `isActive: true` `ItemFeature` instances. It then looks up the character's Strength score (from a previous-cycle snapshot to avoid circular dependency) in the carrying capacity config table (`config_carrying_capacity`). If the total weight exceeds the Medium or Heavy load threshold, it automatically activates the `condition_medium_load` or `condition_heavy_load` feature respectively, injecting encumbrance penalties into Phase 3 without any hardcoded logic.

### 9.6. Leveling Progression & Skill Point Budget

This section formalises the D&D 3.5 SRD leveling rules as implemented by the engine. It covers skill point calculation, minimum rank enforcement, multiclass class skill tracking, and the Leveling Journal UI.

#### 9.6.1 Skill Points Per Level — The Correct Multiclass Formula

**SRD rule (Skills chapter):** At each character level, the character gains skill points equal to the base SP/level of the *class gained at that level* plus their current INT modifier (minimum 1).

This means skill points must be computed **per class independently**, never as a unified average:

| Class | Formula | Example (INT 14, +2 mod) |
|-------|---------|--------------------------|
| Fighter 3 | max(1, 2+2) × 3 = **12 SP** | 4/level × 3 levels |
| Rogue 3   | max(1, 8+2) × 3 = **30 SP** | 10/level × 3 levels |
| **Combined** | 12 + 30 = **42 SP** | _correct_ |
| **Broken unified formula** | max(1, (2+8)+2) × 6 = 72 SP | _wrong — averages SP/level_ |

**How SP/level modifiers are attributed:** Class Features declare a modifier to `attributes.skill_points_per_level` with `sourceId` = the class Feature ID. The engine reads `modifier.sourceId` to match it against `character.classLevels[sourceId]` and compute the per-class contribution independently.

**Racial/feat bonus SP:** Sources that target `attributes.bonus_skill_points_per_level` (e.g. Human "+1 SP/level") apply uniformly per **total character level** (not per class level). They are tracked separately in `SkillPointsBudget.bonusSpPerLevel`.

**INT modifier retroactivity:** D&D 3.5 makes INT bonuses retroactive. The engine uses the **current** INT modifier for all levels (the most common practitioner interpretation). This is configurable in a future campaign setting flag if strict retroactivity is needed.

#### 9.6.2 First-Level 4× Skill Point Bonus

**SRD rule:** "At 1st level, you get **four times** the number of skill points you normally get for a level in that class." This is a one-time bonus for the class taken at **character level 1 only**.

**Engine implementation:** `phase4_skillPointsBudget` identifies the first class via `Object.keys(character.classLevels)[0]` — JavaScript ES2015+ preserves insertion order for string keys, so the first key is the class the player added first in the UI. The bonus is: `firstLevelBonus = 3 × max(1, spPerLevel + intMod)`.

```
Fighter first at char level 1 (INT 14, +2 mod):
  Base levels 1-3:   max(1, 2+2) × 3 = 12 SP
  First-level bonus: 3 × max(1, 2+2) = 12 SP  (3 extra multiples → 4× total for level 1)
  Fighter total: 24 SP
```

The `ClassSkillPointsEntry` type tracks `firstLevelBonus` separately for transparency in the Leveling Journal display.

#### 9.6.3 Skill Point Budget Types

```typescript
// Exported from GameEngine.svelte.ts

interface ClassSkillPointsEntry {
  classId: ID;
  classLabel: LocalizedString;
  spPerLevel: number;       // base SP/level (before INT)
  classLevel: number;       // character's level in this class
  intModifier: number;      // INT modifier used in computation
  pointsPerLevel: number;   // max(1, spPerLevel + intMod)
  firstLevelBonus: number;  // 3 × pointsPerLevel if this is the first class; else 0
  totalPoints: number;      // (pointsPerLevel × classLevel) + firstLevelBonus
}

interface SkillPointsBudget {
  perClassBreakdown: ClassSkillPointsEntry[];  // one entry per active class
  bonusSpPerLevel: number;     // from racial/feat sources (human +1, etc.)
  totalBonusPoints: number;    // bonusSpPerLevel × totalCharacterLevel
  totalClassPoints: number;    // sum of all ClassSkillPointsEntry.totalPoints
  totalAvailable: number;      // totalClassPoints + totalBonusPoints
  intModifier: number;         // current INT derivedModifier
}
```

#### 9.6.4 Minimum Skill Rank Enforcement

**SRD rule:** Skill points spent at a given level are **permanently allocated**. A player cannot lower a skill's ranks to reclaim points after a level-up is committed.

**Engine implementation:**

- `Character.minimumSkillRanks?: Record<ID, number>` — per-skill rank floor stored in the character save. Absent for new characters (all zeros = free allocation during creation).
- `GameEngine.lockSkillRanksMin(skillId)` — sets the floor for one skill to `max(existingFloor, currentRanks)`.
- `GameEngine.lockAllSkillRanks()` — locks all skills at once (call at level-up commit).
- `GameEngine.setSkillRanks(skillId, ranks)` — clamps the requested value to `max(minimumFloor, 0)`. Cannot go below the floor.

**Character creation mode:** While `minimumSkillRanks` is absent or empty, all rank floors are 0. Players can freely reassign ranks to experiment with builds. After calling `lockAllSkillRanks()`, the current ranks become the irreducible minimum.

#### 9.6.5 Maximum Skill Ranks

| Skill type | Maximum ranks |
|------------|---------------|
| Class skill | `characterLevel + 3` |
| Cross-class skill | `floor((characterLevel + 3) / 2)` |

Enforced by `SkillsMatrix.svelte` input clamping and read from `phase0_characterLevel`.

#### 9.6.6 Class Skills — Multiclass Union

The character's effective set of class skills is the **union** of `classSkills` arrays from ALL active Features (not just class features). A skill that is a class skill for **any one** of the character's active classes costs 1 SP/rank for that character.

Computed by `phase4_classSkillSet: ReadonlySet<ID>` in `GameEngine`. This derived is consumed by:
- `phase4_skills` — to set `SkillPipeline.isClassSkill`
- `SkillsMatrix.svelte` — to display class/cross-class indicator and cost per rank
- `phase4_levelingJournal` — to list class skills per class in the Journal

#### 9.6.7 Leveling Journal

The Leveling Journal provides complete transparency about where every mechanical bonus comes from. It is surfaced via `LevelingJournalModal.svelte` (opened from the Skills Matrix).

```typescript
interface LevelingJournalClassEntry {
  classId: ID;
  classLabel: LocalizedString;
  classLevel: number;
  totalBab: number;         // sum of "base" BAB increments up to classLevel
  totalFort: number;        // sum of "base" Fort save increments
  totalRef: number;         // sum of "base" Ref save increments
  totalWill: number;        // sum of "base" Will save increments
  spPerLevel: number;       // base SP/level
  spPointsPerLevel: number; // max(1, spPerLevel + intMod)
  firstLevelBonus: number;  // 3 × spPointsPerLevel if this was the first class
  totalSp: number;          // total SP including first-level bonus
  classSkills: ID[];
  classSkillLabels: Array<{ id: ID; label: LocalizedString }>;
  grantedFeatureIds: string[];  // features from levelProgression entries ≤ classLevel
}

interface LevelingJournal {
  perClassBreakdown: LevelingJournalClassEntry[];
  totalBab: number;
  totalFort: number;
  totalRef: number;
  totalWill: number;
  totalSp: number;       // includes all class SP + bonus SP (racial etc.)
  characterLevel: number;
}
```

**BAB/save attribution:** Each increment's `modifier.sourceId` identifies which class contributed it. The journal filters `phase0_flatModifiers` by `sourceId` to build per-class totals.

**Multiclass XP penalty detection:** The Journal modal shows a warning when any class is 2+ levels below the highest class level (applying the 20%/class SRD XP penalty rule). The favored class (racial or player-designated) is excluded from this check.

#### 9.6.8 Hit Points and Hit Dice

**HP Formula (SRD):**
```
Max HP = sum(hitDieResults[1..characterLevel]) + (CON_derivedModifier × characterLevel)
```

`character.hitDieResults: Record<number, number>` — keyed by character level (1-indexed). Values are die results rolled (or fixed) at each level-up. The standard "half+1" convention for levels 2+:
- Level 1: max die value (e.g. 10 for d10)
- Level 2+: `floor(maxDie / 2) + 1` (e.g. 6 for d10)

HP recalculates automatically when CON changes (reactive DAG dependency on `phase2_attributes['stat_con'].derivedModifier`).

**Hit die type per level:** The die type used at each character level is determined by the class taken at that level. Since the engine does not track level-up order (only final `classLevels`), the hit die type per character level is derived from `hitDieResults` directly — the player enters the die result; the engine sums them. For Level Up UX, the UI reads `combatStats.hit_die_type` from the most recently added class Feature.

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

For rules that modify game resolution itself (e.g.: psionic transparency, divine immunity), the engine uses `sys_` prefixed tags on Features loaded via `enabledRuleSources`. Examples:

- `sys_immune_mind_affecting` — blocks Features tagged `mind-affecting`
- `sys_roll_maximize_damage` — Math Parser replaces all `XdY` expressions with `X × Y`
- `sys_ignore_dr` — attack rolls bypass all Damage Reduction entries

**Important:** The Vitality/Wound Points variant is handled via `CampaignSettings.variantRules.vitalityWoundPoints` (a boolean engine flag), NOT via `sys_` tags. This is because V/WP changes the Dice Engine's damage routing algorithm, which requires a direct engine code branch rather than a tag check. See **section 8.3** for the complete V/WP specification.

---

## 17. The Dice Engine (RNG & Action Resolver)

_Suggested target file: `src/lib/utils/diceEngine.ts`_

```mermaid
flowchart TD
    FORMULA["formula: string\ne.g. '1d20 + 7'"]
    PIPELINE["pipeline: StatisticPipeline\n(carries situationalModifiers)"]
    CTX["context: RollContext\n{ targetTags, isCriticalHit? }"]
    SETTINGS["settings: CampaignSettings\n{ explodingTwenties, variantRules }"]

    PARSE["Parse formula\nExtract dice groups (XdY) + static bonus"]

    ROLL["Roll each die\n(injectable rng for tests)"]

    EXP["Exploding 20s?\nif settings.explodingTwenties\n  while lastRoll===20: reroll+add\n  numberOfExplosions++"]

    CRIT["Determine crit\nisCriticalThreat: roll >= critRange.min\nisAutomaticHit: natural 20\nisAutomaticMiss: natural 1"]

    SITU["Situational modifiers\nFilter pipeline.situationalModifiers\nwhere mod.situationalContext\n  ∈ context.targetTags\nAdd to situationalBonusApplied"]

    POOL["Target pool routing\nif !vitalityWoundPoints → res_hp\nif vitalityWoundPoints:\n  crit? → res_wound_points\n  else → res_vitality"]

    RESULT["RollResult\n{ formula, diceRolls, naturalTotal,\n  staticBonus, situationalBonusApplied,\n  finalTotal, numberOfExplosions,\n  isCriticalThreat, isAutomaticHit,\n  isAutomaticMiss, targetPool }"]

    FORMULA & PIPELINE & CTX & SETTINGS --> PARSE
    PARSE --> ROLL --> EXP --> CRIT --> SITU --> POOL --> RESULT
```

```typescript
export interface RollContext {
    targetTags: string[]; // E.g.: ["orc", "evil", "living"]
    isAttackOfOpportunity: boolean;
    // Optional: set to true on damage rolls for a confirmed crit (for V/WP pool routing)
    isCriticalHit?: boolean;
}

// Damage routing for Vitality/Wound Points variant. Default: "res_hp".
// "res_vitality": normal hit in V/WP mode. "res_wound_points": crit or VP overflow.
export type DamageTargetPool = "res_hp" | "res_vitality" | "res_wound_points";

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
    // Which ResourcePool receives the damage. "res_hp" in standard mode.
    // "res_vitality" / "res_wound_points" when variantRules.vitalityWoundPoints = true.
    // @see ARCHITECTURE.md section 8.3 — Vitality/Wound Points variant
    targetPool: DamageTargetPool;
}

/**
 * Parses a compiled dice expression, rolls the dice, and applies contextual bonuses.
 *
 * @param formula - The dice expression already resolved by the Math Parser (e.g.: "1d20 + 7").
 * @param pipeline - The relevant StatisticPipeline, providing situationalModifiers to evaluate.
 * @param context - The roll context (target tags, action type, optional isCriticalHit flag).
 * @param settings - The campaign configuration (Exploding 20s, Reroll 1s, variantRules, etc.).
 * @param rng - (Optional) Injectable random generation function for unit tests.
 *             Default: () => Math.floor(Math.random() * faces) + 1
 * @param critRange - (Optional) The weapon's critical threat range as a string.
 *                   Format: "X-20" or "20". Default: "20" (natural 20 only).
 *                   Examples: "19-20" (keen longsword), "18-20" (improved crit rapier).
 *                   Parsed to determine `isCriticalThreat` on the RollResult.
 * @returns A structured RollResult including `targetPool` for damage routing.
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

**Vitality/Wound Points Routing:** If `settings.variantRules.vitalityWoundPoints` is active, `parseAndRoll()` sets `RollResult.targetPool` based on crit status. See section 8.3.

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

To remove an element from an array during partial merge, prefix the element with a dash `-`.

**Example — The Winter Circle homebrew Druid variant:**

The Winter Circle splat restricts the Druid to a different animal companion type and removes Wild Shape, but adds elemental ice traits.

```json
{
  "id": "class_druid",
  "category": "class",
  "ruleSource": "homebrew_winter_circle",
  "merge": "partial",
  "tags": ["circle_winter"],
  "grantedFeatures": [
    "-class_feature_druid_wild_shape",
    "class_feature_winter_circle_ice_form"
  ]
}
```

**Result after merge:**
- `grantedFeatures` from the base Druid: `[..., "class_feature_druid_wild_shape", ...]`
- After applying the Winter Circle partial: `wild_shape` removed, `ice_form` added.
- All other base Druid fields (`levelProgression`, `classSkills`, `choices`, etc.) are preserved.

**Rules:**
- The `-` prefix applies element-by-element to any array field: `tags`, `grantedFeatures`, `grantedModifiers`, `forbiddenTags`, `descriptors`, `components`.
- A `-choiceId` entry in `choices` removes that choice entirely.
- Attempting to remove an element that doesn't exist is a **no-op** (no crash).
- The `-` prefix applies only to string elements (IDs). Object-keyed entries (`levelProgression`, `choices`) use ID/level matching instead.

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
│   Array of ActiveFeatureInstance injected secretly.  │
│   Applied LAST.                                      │
│   Referenced Features can be defined in any previous │
│   layer, or be custom Features from Layer 2.         │
└──────────────────────────────────────────────────────┘
```

```mermaid
flowchart LR
    subgraph "Layer 1 — Rule Source Files (filtered by enabledRuleSources)"
        F1["00_srd_core/\n(lowest priority)"]
        F2["01_srd_psionics/"]
        F3["50_homebrew_winter/\n(highest among files)"]
        F1 -->|merge| F2 -->|merge| F3
    end

    subgraph "Layer 2 — GM Global Override"
        GG["Campaign.gmGlobalOverrides\n(JSON array — Features + config tables)"]
    end

    subgraph "Layer 3 — GM Per-Character Override"
        GC["Character.gmOverrides\n(ActiveFeatureInstance[])"]
    end

    subgraph "Output"
        RESOLVED["Resolved Feature registry\n+ config tables\n(used by GameEngine Phase 0)"]
    end

    F3 -->|replace / partial merge| GG
    GG -->|replace / partial merge| RESOLVED
    GC -->|injected last, invisible to player| RESOLVED
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
2. **Structural validation:** Each entry in the array must have either (`id` + `category`) for a Feature, or `tableId` for a configuration table. A non-blocking warning is displayed if expected fields are missing (e.g., `label` or `grantedModifiers` for Features, `data` for config tables).
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
