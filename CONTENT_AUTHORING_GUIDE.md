# Character Vault — Content Authoring Guide

_D&D 3.5 SRD Data Engine — JSON Reference Manual_

---

## How to Read This Guide

This guide is a **progressive tutorial**. It starts with the simplest concept (a single modifier) and builds up to complex multi-class prestige abilities and enchanted items. Read it front to back as a tutorial, or jump directly to the section you need using the table of contents.

A companion document, [`AI_MIGRATION_GUIDE.md`](AI_MIGRATION_GUIDE.md), explains how to convert data from PCGen, Hero Lab, or raw HTML/PDF sources into this format at scale. This document is written primarily for **humans** who want to create or modify content.

---

## Table of Contents

1. [Core Philosophy — Everything is a Feature](#1-core-philosophy--everything-is-a-feature)
2. [File Structure & Organization](#2-file-structure--organization)
3. [The Feature Object — Base Template](#3-the-feature-object--base-template)
4. [IDs and Naming Conventions](#4-ids-and-naming-conventions)
5. [Tags — The Engine's Language](#5-tags--the-engines-language)
6. [Modifiers — Changing Numbers](#6-modifiers--changing-numbers)
7. [Modifier Types & Stacking Rules](#7-modifier-types--stacking-rules)
8. [Target IDs — What to Modify](#8-target-ids--what-to-modify)
9. [Formula Values — Dynamic Math](#9-formula-values--dynamic-math)
10. [Logic Nodes — Prerequisites & Conditions](#10-logic-nodes--prerequisites--conditions)
11. [Races](#11-races)
12. [Classes](#12-classes)
13. [Class Features](#13-class-features)
14. [Feats](#14-feats)
15. [Spells & Psionic Powers](#15-spells--psionic-powers)
16. [Items — Weapons & Armor](#16-items--weapons--armor)
17. [Items — Magic Items & Charged Items](#17-items--magic-items--charged-items)
18. [Items — Consumables (Potions, Scrolls, Wands, Staves)](#18-items--consumables-potions-scrolls-wands-staves)
19. [Conditions & Action Budgets](#19-conditions--action-budgets)
20. [Environments & Global Auras](#20-environments--global-auras)
21. [Configuration Tables](#21-configuration-tables)
22. [The Override System — Homebrew & Variants](#22-the-override-system--homebrew--variants)
23. [Localization (i18n)](#23-localization-i18n)
24. [Complete Reference Tables](#24-complete-reference-tables)

---

## 1. Core Philosophy — Everything is a Feature

The engine is built on one single idea: **everything is a Feature**.

A race is a Feature. A class is a Feature. A feat, a buff, a weapon, a condition, a spell — they are all Features. Each Feature can carry:
- **Tags** — string labels that describe what something is
- **Modifiers** — numeric changes to character statistics
- **Granted Features** — other Features that become active

The **GameEngine** collects all active Features, applies their modifiers, and computes final statistics automatically. You never write calculation code — you write data.

```
Race (Feature) → contributes modifiers
Class (Feature) → contributes modifiers + level progression
Feat (Feature) → contributes modifiers + may require prerequisites
Item (Feature) → contributes modifiers when equipped
Condition (Feature) → contributes modifiers while active
```

---

## 2. File Structure & Organization

All rule files live inside `static/rules/`. The engine loads them in **alphabetical order** — files with higher numbers override files with lower numbers.

```
static/rules/
  00_d20srd_core/
    00_d20srd_core_config_tables.json  ← Loaded first — XP, skills, synergies, etc.
    01_d20srd_core_races.json
    02_d20srd_core_classes.json
    03_d20srd_core_class_features.json
    04_d20srd_core_feats.json
    05_d20srd_core_skills_config.json
    06_d20srd_core_spells.json
    07_d20srd_core_equipment_weapons.json
    08_d20srd_core_equipment_armor.json
    09_d20srd_core_equipment_goods.json
    10_d20srd_core_config.json
    11_d20srd_core_prestige_classes.json
    12_d20srd_core_prestige_class_features.json
    13_d20srd_core_magic_items.json
    14_d20srd_core_cleric_domains.json
    15_d20srd_core_npc_classes.json
    16_d20srd_core_special_materials.json
    17_d20srd_core_racial_features.json
    18_d20srd_core_proficiency_features.json
  01_d20srd_psionics/
    00_d20srd_psionics_classes.json
    01_d20srd_psionics_class_features.json
    ...
  50_homebrew_my_setting/
    00_my_custom_races.json            ← Loaded last (highest priority)
  test/                               ← EXCLUDED — unit-test fixtures, never loaded
    test_mock.json
    test_override.json
  manifest.json                       ← Static fallback for Vitest (includes test/)
```

> **`test/` subfolder** — this directory is completely excluded from auto-discovery by
> both the SvelteKit endpoint and the PHP API. Its contents are Vitest unit-test
> fixtures only. Do NOT put content-authoring files there.

**Naming convention:** `NN_rule_source_name/NN_rule_source_name_content_type.json`

Each rule file uses the **metadata wrapper format**: a JSON object with an optional `supportedLanguages` array and a required `entities` array. A single file can mix races, feats, and items freely.

```json
{
  "supportedLanguages": ["en", "fr"],
  "entities": [
    { "id": "race_orc", "category": "race", ... },
    { "id": "feat_power_attack", "category": "feat", ... },
    { "id": "item_greataxe", "category": "item", ... }
  ]
}
```

#### `supportedLanguages` field

The `supportedLanguages` array is an **optional documentation hint** that tells the engine which languages a file contains upfront. The engine also automatically discovers languages by scanning every entity's `LocalizedString` fields at load time, so `supportedLanguages` is **not required** for a language to appear in the dropdown.

| Rule | Detail |
|---|---|
| If absent | Languages are discovered automatically by entity scanning. |
| Unknown language codes | Cause graceful fallback to English in the UI for any missing string. |
| Adding a new language | Simply add the language key to any `label` / `description` field — the engine detects it. Adding the code to `supportedLanguages` is optional but recommended as documentation. |

**How automatic language discovery works:**
The engine calls `scanEntityForLanguages()` on every entity loaded from any source (rule files, campaign homebrew, GM overrides). It recursively inspects each field for objects whose keys are all BCP-47 language codes (e.g. `"en"`, `"ja"`, `"fr-be"`) and whose values are all strings. Such objects are `LocalizedString` maps, and every key found is registered as an available language. This means adding `"ja": "katana"` to a homebrew weapon's `label` field in the Campaign Editor is sufficient to make Japanese appear in the language dropdown — no `supportedLanguages` declaration needed.

**Example — Spanish community file (with optional declaration):**
```json
{
  "supportedLanguages": ["en", "es"],
  "entities": [
    {
      "id": "feat_ataque_poderoso",
      "category": "feat",
      "ruleSource": "homebrew_es",
      "label": { "en": "Power Attack", "es": "Ataque poderoso" },
      "description": { "en": "Make powerful attacks.", "es": "Realiza ataques poderosos." }
    }
  ]
}
```
When this file is loaded, `"es"` appears in the language dropdown (discovered via entity scanning; the `supportedLanguages` declaration is bonus documentation). All UI chrome strings without an `"es"` key fall back silently to English.

> **Simplified format:** Files that are bare JSON arrays (without the wrapper object) are also accepted. The engine handles both formats seamlessly. Languages in bare-array files are discovered through entity scanning.

---

## 3. The Feature Object — Base Template

Every Feature shares the same base structure:

```json
{
  "id": "feat_power_attack",
  "category": "feat",
  "ruleSource": "srd_core",
  "label": {
    "en": "Power Attack",
    "fr": "Attaque en puissance"
  },
  "description": {
    "en": "You can make exceptionally powerful melee attacks...",
    "fr": "Vous pouvez effectuer des attaques de corps à corps particulièrement puissantes..."
  },
  "tags": ["feat", "general", "fighter_bonus_feat", "feat_power_attack"],
  "grantedModifiers": [],
  "grantedFeatures": []
}
```

### Field Reference

| Field | Type | Required | Description |
|---|---|:---:|---|
| `id` | `string` | ✅ | Unique identifier. Use `snake_case` with category prefix (e.g., `"feat_power_attack"`, `"race_elf"`). Never use hyphens. |
| `category` | `string` | ✅ | What kind of Feature this is. See [category table](#featurecategory-values). |
| `ruleSource` | `string` | ✅ | Which rules module this belongs to (e.g., `"srd_core"`, `"homebrew_mymod"`). Used for attribution and the `getHomebrewRules()` scope query. Note: `CampaignSettings.enabledRuleSources` is a **file-path whitelist** (not a source ID list) — it controls which JSON files are loaded, not which `ruleSource` values are retained. |
| `label` | `LocalizedString` | ✅ | Display name in all supported languages. |
| `description` | `LocalizedString` | ✅ | Flavor and rules text. |
| `tags` | `string[]` | ✅ | Labels that describe this Feature. Used for prerequisites and conditions. |
| `grantedModifiers` | `Modifier[]` | ✅ | Numeric changes applied when this Feature is active. |
| `grantedFeatures` | `string[]` | ✅ | IDs of other Features that become active with this one. |
| `forbiddenTags` | `string[]` | ❌ | If ANY of these tags are currently active, ALL modifiers from this Feature are suppressed. |
| `prerequisitesNode` | `LogicNode` | ❌ | Eligibility check. If this fails, the feat is shown grayed out (but stays in the character). |
| `choices` | `FeatureChoice[]` | ❌ | Player-selectable options (e.g., Weapon Focus chooses a weapon). |
| `merge` | `"replace"\|"partial"` | ❌ | How this entity combines with one having the same `id`. Default: `"replace"`. |
| `classSkills` | `string[]` | ❌ | Skill IDs that become class skills while this Feature is active. |
| `activation` | `object` | ❌ | For active abilities: how they are used (action type, resource cost). |
| `actionBudget` | `object` | ❌ | Action limits imposed by conditions (Staggered, Stunned, etc.). |
| `resourcePoolTemplates` | `array` | ❌ | Instance-scoped charge pools for items (wand charges, ring uses, etc.). |
| `levelProgression` | `array` | ❌ | **Classes only.** Per-level features and modifier increments. |
| `recommendedAttributes` | `string[]` | ❌ | UI hint for point-buy screen. No mechanical effect. |

### `FeatureCategory` Values

| Value | Used For |
|---|---|
| `"race"` | Racial traits (Human, Elf, Dwarf, etc.) |
| `"class"` | Base and prestige classes |
| `"class_feature"` | Individual class abilities (Rage, Sneak Attack, etc.) |
| `"feat"` | General, fighter bonus, metamagic feats |
| `"deity"` | Deity entities referenced by Cleric domain choices |
| `"domain"` | Cleric domains |
| `"magic"` | Spells and psionic powers |
| `"item"` | Weapons, armor, magic items, potions, scrolls, etc. |
| `"condition"` | Status conditions (Stunned, Frightened, Raging, etc.) |
| `"monster_type"` | Creature types (Undead, Construct, Dragon, etc.) |
| `"environment"` | Ambient conditions (Extreme Heat, Underwater, etc.) |

---

## 4. IDs and Naming Conventions

IDs are **globally unique** `snake_case` strings (lowercase words separated by underscores). Use the category as the prefix:

> **Critical:** IDs use `underscore_case`, not `kebab-case`. A modifier targeting `has_tag "feat_power_attack"` will never match an ID written as `feat-power-attack`. Every hyphen is a bug.

| Category | Prefix | Example |
|---|---|---|
| Race | `race_` | `race_human`, `race_elf`, `race_half_orc` |
| Class | `class_` | `class_fighter`, `class_wizard`, `class_arcane_archer` |
| Class feature | `class_feature_` | `class_feature_barbarian_rage` |
| Feat | `feat_` | `feat_power_attack`, `feat_weapon_focus` |
| Spell | `spell_` | `spell_fireball`, `spell_cure_light_wounds` |
| Psionic power | `power_` | `power_mind_thrust`, `power_psionic_telekinesis` |
| Item (weapon) | `item_weapon_` or `item_` | `item_longsword`, `item_weapon_flaming_burst_longsword` |
| Item (armor) | `item_armor_` | `item_armor_chain_shirt`, `item_armor_full_plate` |
| Item (magic) | `item_ring_`, `item_wand_`, etc. | `item_ring_protection_2`, `item_wand_magic_missile_cl1` |
| Condition | `condition_` | `condition_stunned`, `condition_blinded` |
| Environment | `environment_` | `environment_extreme_heat`, `environment_underwater` |
| Modifier | _(no fixed prefix)_ | `barbarian_fast_movement_speed`, `rage_str_bonus` |
| Config table | _(uses `tableId`, not `id`)_ | `config_xp_table`, `config_carrying_capacity` |

> **Rule:** A modifier's `id` must be unique within the Feature that contains it. When two modifiers inside the same Feature would conflict, append a suffix: `mod_barbarian_rage_str`, `mod_barbarian_rage_con`.

---

## 5. Tags — The Engine's Language

Tags are **string labels** placed on Features. They serve three purposes:

1. **Describing what something is** — The engine uses tags to track active state.
2. **Prerequisite checks** — "Does the character have feat_power_attack active?"
3. **Conditional modifier gates** — "Apply this bonus only when wearing armor."

```json
"tags": [
  "race",
  "humanoid",
  "size_medium",
  "race_human"          ← Self-referencing ID tag (always include this)
]
```

### Tag Naming Conventions

| Pattern | Meaning | Examples |
|---|---|---|
| `race_RACE` | Identifies creature's race | `race_human`, `race_elf`, `race_dwarf` |
| `class_CLASS` | Active class membership | `class_fighter`, `class_wizard` |
| `feat_FEAT` | Active feat | `feat_power_attack`, `feat_weapon_focus` |
| `size_SIZE` | Size category | `size_small`, `size_medium`, `size_large` |
| `armor_TYPE` | Armor weight category | `armor_light`, `armor_medium`, `armor_heavy` |
| `wearing_armor` | Generic armor presence | Used in Monk AC conditions |
| `carrying_shield` | Shield is equipped | Used in Monk AC conditions |
| `weapon_TYPE` | Weapon category | `weapon_simple`, `weapon_martial`, `weapon_exotic` |
| `weapon_melee` / `weapon_ranged` | Attack mode | For ranged attack bonus conditions |
| `alignment_ALIGN` | Moral alignment | `alignment_lawful`, `alignment_chaotic`, `alignment_good`, `alignment_evil` |
| `heavy_load` / `medium_load` | Encumbrance condition | Auto-injected by engine based on carried weight |
| `spellcaster` | Has spellcasting | Used in prestige class prerequisites |
| `caster_ability_STAT` | Casting stat identifier | `caster_ability_stat_intelligence`, `caster_ability_stat_wisdom`, `caster_ability_stat_charisma` |
| `condition_NAME` | Active condition | `condition_stunned`, `condition_raging` |
| `extraordinary` / `supernatural` / `spell_like` | Ability type | For SR/PR checks |
| `sys_` | System-wide global modifier | `sys_immune_mind_affecting`, `sys_roll_maximize_damage` |
| `metal_armor` / `metal_shield` | Metal construction | Used by Druid `forbiddenTags` |
| `action_budget_xor` | Standard OR Move restriction | Add to Staggered/Disabled conditions |

### `wearing_armor` and `carrying_shield` Tags

All armor items have the `"wearing_armor"` tag in their own `tags` array. All shield items have `"carrying_shield"`. These are the **canonical tags to check in conditionNodes** when a feature depends on whether the character is currently armored or carrying a shield.

```
item_armor_chain_shirt → tags: ["item","armor","armor_light","wearing_armor","item_armor_chain_shirt"]
item_shield_heavy_wooden → tags: ["item","shield","shield_heavy","carrying_shield","item_shield_heavy_wooden"]
```

The `"armor_light"`, `"armor_medium"`, `"armor_heavy"` tags identify the **weight category** — use these when you need to distinguish between types. Use `"wearing_armor"` when you only care whether ANY armor is equipped (e.g., Monk AC bonus).

### The Self-Referencing Tag Rule

> **Every Feature's `id` must appear in its own `tags` array.**

```json
{
  "id": "feat_weapon_focus",
  "tags": ["feat", "general", "fighter_bonus_feat", "feat_weapon_focus"]
}
```

This allows other Features to write `has_tag "feat_weapon_focus"` as a prerequisite. If the self-referencing tag is missing, the feat chain is silently broken.

### The `forbiddenTags` Field

If **any** tag in `forbiddenTags` is currently active on the character, ALL modifiers from this Feature are suppressed. The Feature stays in `activeFeatures` (the item stays equipped) but contributes nothing.

```json
{
  "id": "class_barbarian",
  "forbiddenTags": ["alignment_lawful"],
  ...
}
```

This is used for:
- Barbarian: forbids `alignment_lawful`
- Fast Movement: forbids `heavy_load` and `heavy_armor` (via `conditionNode` on the modifier itself — see [Section 10](#10-logic-nodes--prerequisites--conditions))
- Druid: forbids `metal_armor`, `metal_shield`

> **Note:** Only `class` and `class_feature` categories use `forbiddenTags` on the Feature itself. Individual modifier suppression uses `conditionNode` (see Section 10).

---

## 6. Modifiers — Changing Numbers

A **Modifier** is a single numeric change applied to a **pipeline** (a named statistic). Here is the complete Modifier shape:

```json
{
  "id": "mod_power_attack_penalty",
  "sourceId": "feat_power_attack",
  "sourceName": { "en": "Power Attack", "fr": "Attaque en puissance" },
  "targetId": "combatStats.attack_bonus",
  "value": -1,
  "type": "untyped",
  "conditionNode": { ... },
  "situationalContext": "melee"
}
```

### Modifier Fields

| Field | Type | Required | Description |
|---|---|:---:|---|
| `id` | `string` | ✅ | Unique within the containing Feature. |
| `sourceId` | `string` | ✅ | ID of the Feature that owns this modifier. Usually same as the Feature's `id`. |
| `sourceName` | `LocalizedString` | ✅ | Human-readable source name shown in the UI breakdown panel. |
| `targetId` | `string` | ✅ | Which pipeline to modify. See [Section 8](#8-target-ids--what-to-modify). |
| `value` | `number\|string` | ✅ | Amount to add/subtract. Can be a formula string. See [Section 9](#9-formula-values--dynamic-math). |
| `type` | `ModifierType` | ✅ | Controls stacking behavior. See [Section 7](#7-modifier-types--stacking-rules). |
| `conditionNode` | `LogicNode` | ❌ | Sheet-time gate: if this logic fails, the modifier is ignored entirely. |
| `situationalContext` | `string` | ❌ | Roll-time tag: modifier goes to `situationalModifiers` and only fires when this string is in the roll's target tags. See canonical values below. |
| `drBypassTags` | `string[]` | ❌ | **Required when `type: "damage_reduction"`** — materials that bypass this DR. Use `[]` for DR X/—. Omit only for non-DR modifiers. |

### Canonical `situationalContext` Values

| Value | When it fires |
|---|---|
| `"vs_poison"` | Saving throw against poison |
| `"vs_spells_and_spell_like"` | Saving throw vs. spells or spell-like abilities |
| `"vs_enchantment"` | Save or attack against enchantment-school effect |
| `"vs_illusion"` | Save or roll against illusion-school effect |
| `"vs_orc"` | Attack roll against an orc |
| `"vs_goblinoid"` | Attack roll against a goblinoid |
| `"vs_giant"` | Attack roll against a giant |
| `"vs_air_elementals"` | Attack or save against air elementals |
| `"vs_earth_effects"` | Save against earth-based effects |
| `"vs_fire"` | Save or damage against fire |
| `"on_hit"` | Damage roll only on a successful hit (e.g., Flaming +1d6) |
| `"vs_trap"` | Perception/saving throw against a trap |
| `"melee"` | Melee attack context |
| `"ranged"` | Ranged attack context |

> **Custom values are allowed.** The engine matches the string verbatim — `"vs_evil_outsiders"` is a valid custom context. Both the modifier's `situationalContext` and the `RollContext.targetTags` must include the same string for the modifier to fire.

### Your First Modifier — A Simple Bonus

A +2 racial bonus to Perception (Listen + Spot checks) from being an Elf:

```json
{
  "id": "elf_listen_bonus",
  "sourceId": "race_elf",
  "sourceName": { "en": "Elf", "fr": "Elfe" },
  "targetId": "skills.skill_listen",
  "value": 2,
  "type": "racial"
}
```

That's it. The engine adds +2 to the Listen skill pipeline whenever the Elf race Feature is active.

---

## 7. Modifier Types & Stacking Rules

**The most important rule:** only the **highest** modifier of the same typed bonus applies to a given statistic. Exceptions are explicitly listed below.

### Stacking Behavior Table

| `type` | Stacks? | Notes |
|---|---|---|
| `"base"` | ✅ Always stacks | Used for BAB/save level increments. Core class progression. |
| `"untyped"` | ✅ Always stacks | No declared bonus type. Feats often use this. |
| `"dodge"` | ✅ Always stacks | SRD explicit exception. Dodge feat +1 + Haste +1 = +2. |
| `"circumstance"` | ✅ Always stacks | Situational bonuses. |
| `"synergy"` | ✅ Always stacks | Skill synergy bonuses (auto-generated by engine). |
| `"racial"` | ❌ Highest wins | Racial trait bonuses. |
| `"enhancement"` | ❌ Highest wins | Magic enhancement bonuses (+1 sword, Mage Armor, etc.). |
| `"morale"` | ❌ Highest wins | Morale bonuses (Rage, Bless, etc.). |
| `"luck"` | ❌ Highest wins | Luck bonuses (Prayer, etc.). |
| `"insight"` | ❌ Highest wins | Insight bonuses (True Strike, etc.). |
| `"sacred"` | ❌ Highest wins | Sacred/holy bonuses (Divine Favor, etc.). |
| `"profane"` | ❌ Highest wins | Unholy/profane bonuses. |
| `"armor"` | ❌ Highest wins | Armor bonus to AC. |
| `"shield"` | ❌ Highest wins | Shield bonus to AC. |
| `"natural_armor"` | ❌ Highest wins | Natural armor (Amulet of Natural Armor, etc.). |
| `"deflection"` | ❌ Highest wins | Ring of Protection, Shield of Faith, etc. |
| `"competence"` | ❌ Highest wins | Competence bonus to skills (Skill Focus, etc.). |
| `"size"` | ❌ Highest wins | Size-based attack/AC bonuses/penalties. |
| `"inherent"` | ❌ Highest wins among inherent | Permanent (tomes, wish, miracle). Does NOT stack with another `"inherent"` bonus to the same pipeline — highest wins. BUT stacks freely with all non-inherent types (enhancement, racial, morale, etc.). |
| `"resistance"` | ❌ Highest wins | Resistance bonus to saves (Cloak of Resistance). |
| `"setAbsolute"` | Special | Forces pipeline to exact value. Last one wins. |
| `"damage_reduction"` | Special | Best-wins per bypass-tag group. See Section 16. |
| `"max_dex_cap"` | Special | Minimum wins (most restrictive cap). See Section 16. |
| `"multiplier"` | Special | Highest-impact multiplier wins (the one farthest from 1.0). Applied after all additive bonuses as: `totalValue = floor((base + additiveSum) × multiplier)`. Use for STR × 1.5 on two-handed weapons. Example: `{ "value": 1.5, "type": "multiplier", "targetId": "combatStats.damage_bonus" }`. |

### Practical Example — Ring of Protection vs Shield of Faith

Both grant a `deflection` bonus to AC. Since `deflection` doesn't stack:
- Ring of Protection +2: `"type": "deflection"`, `"value": 2`
- Shield of Faith +3: `"type": "deflection"`, `"value": 3`
- **Result:** +3 AC (the +2 from the ring is suppressed)

To get both bonuses, you need different bonus types.

### Practical Example — Two Dodge Bonuses

Dodge feat (+1 dodge) + Haste spell (+1 dodge):
- Both use `"type": "dodge"` and **always stack**
- **Result:** +2 AC total

---

## 8. Target IDs — What to Modify

The `targetId` in a modifier tells the engine **which pipeline** to affect.

### Canonical Target IDs

#### Ability Scores (`attributes.*`)

| Target ID | Statistic |
|---|---|
| `attributes.stat_strength` or `stat_strength` | Strength |
| `attributes.stat_dexterity` or `stat_dexterity` | Dexterity |
| `attributes.stat_constitution` or `stat_constitution` | Constitution |
| `attributes.stat_intelligence` or `stat_intelligence` | Intelligence |
| `attributes.stat_wisdom` or `stat_wisdom` | Wisdom |
| `attributes.stat_charisma` or `stat_charisma` | Charisma |
| `attributes.stat_size` | Size modifier pipeline |
| `attributes.stat_caster_level` | Arcane/divine caster level |
| `attributes.stat_manifester_level` | Psionic manifester level |
| `attributes.skill_points_per_level` | Skill points per level (class declares its own) |
| `attributes.bonus_skill_points_per_level` | Bonus SP/level (human racial) |
| `attributes.bonus_feat_slots` | Extra feat slots (human racial) |

#### Saving Throws (`saves.*`)

| Target ID | Save | Ability |
|---|---|---|
| `saves.fortitude` | Fortitude | CON |
| `saves.reflex` | Reflex | DEX |
| `saves.will` | Will | WIS |
| `saves.all` | **All three** (fan-out broadcast) | — |

> Using `saves.all` automatically creates three copies targeting `saves.fortitude`, `saves.reflex`, and `saves.will`. Use this for bonuses like Resistance or Luck that apply to all saves simultaneously.

#### Combat Statistics (`combatStats.*`)

| Target ID | Statistic |
|---|---|
| `combatStats.base_attack_bonus` | Base Attack Bonus |
| `combatStats.ac_normal` | Normal AC |
| `combatStats.ac_touch` | Touch AC |
| `combatStats.ac_flat_footed` | Flat-footed AC |
| `combatStats.attack_bonus` | Attack roll bonus (situational) |
| `combatStats.damage_bonus` | Damage roll bonus |
| `combatStats.damage_reduction` | Damage Reduction value |
| `combatStats.max_hp` | Maximum hit points |
| `combatStats.initiative` | Initiative |
| `combatStats.speed_land` | Land speed |
| `combatStats.speed_fly` | Fly speed |
| `combatStats.speed_swim` | Swim speed |
| `combatStats.speed_climb` | Climb speed |
| `combatStats.speed_burrow` | Burrow speed |
| `combatStats.max_dexterity_bonus` | Maximum DEX bonus to AC |
| `combatStats.armor_check_penalty` | Armor Check Penalty |
| `combatStats.arcane_spell_failure` | Arcane Spell Failure % |
| `combatStats.fortification` | Fortification % (crit negation) |
| `combatStats.hit_die_type` | Hit die type integer (6, 8, 10, 12) — class declares its own |
| `combatStats.saving_throw_bonus` | **Situational save bonus** — used for bonuses vs. creature types (ring vs. elementals). Use `saves.all` for unconditional save bonuses; use `combatStats.saving_throw_bonus` with `"situationalContext"` for conditional ones. |
| `combatStats.energy_resistance_fire` | Fire resistance value |
| `combatStats.energy_resistance_cold` | Cold resistance value |
| `combatStats.energy_resistance_electricity` | Electricity resistance value |
| `combatStats.energy_resistance_acid` | Acid resistance value |
| `combatStats.energy_resistance_sonic` | Sonic resistance value |

#### Skills (`skills.*`)

| Target ID | Skill |
|---|---|
| `skills.skill_climb` | Climb |
| `skills.skill_listen` | Listen |
| `skills.skill_spot` | Spot |
| `skills.skill_balance` | Balance |
| `skills.skill_tumble` | Tumble |
| `skills.skill_jump` | Jump |
| `skills.skill_hide` | Hide |
| `skills.skill_move_silently` | Move Silently |
| `skills.skill_bluff` | Bluff |
| `skills.skill_diplomacy` | Diplomacy |
| `skills.skill_intimidate` | Intimidate |
| `skills.skill_knowledge_arcana` | Knowledge (Arcana) |
| `skills.skill_knowledge_dungeoneering` | Knowledge (Dungeoneering) |
| `skills.skill_knowledge_history` | Knowledge (History) |
| `skills.skill_knowledge_nature` | Knowledge (Nature) |
| `skills.skill_knowledge_planes` | Knowledge (The Planes) |
| `skills.skill_knowledge_religion` | Knowledge (Religion) |
| `skills.skill_listen` | Listen |
| `skills.skill_open_lock` | Open Lock |
| `skills.skill_ride` | Ride |
| `skills.skill_search` | Search |
| `skills.skill_sense_motive` | Sense Motive |
| `skills.skill_sleight_of_hand` | Sleight of Hand |
| `skills.skill_spellcraft` | Spellcraft |
| `skills.skill_spot` | Spot |
| `skills.skill_survival` | Survival |
| `skills.skill_swim` | Swim |
| `skills.skill_use_magic_device` | Use Magic Device |
| `skills.skill_use_rope` | Use Rope |
| `skills.skill_autohypnosis` | Autohypnosis _(psionic)_ |
| `skills.skill_psicraft` | Psicraft _(psionic)_ |
| `skills.skill_use_psionic_device` | Use Psionic Device _(psionic)_ |

> **Rule:** Every skill ID is `skill_` + lowercase name with spaces replaced by underscores. The "skills." prefix is used in `targetId` (for modifiers) and in `@`-paths (for formulas), but is stripped when referencing a skill in `classSkills` arrays — write `"skill_climb"`, not `"skills.skill_climb"`, in class definitions.

#### Resources (`resources.*`)

| Target ID | Resource |
|---|---|
| `resources.hp.maxValue` | Maximum HP ceiling |
| `resources.barbarian_rage_uses.maxValue` | Max Rage uses |

> For resource maximums, use the special form `resources.X.maxValue`, which the engine normalizes to `combatStats.X_max`.

#### Special Targets

| Target ID | Effect |
|---|---|
| `attacker.combatStats.attack_bonus` | Penalty on attacks **made against** this character |
| `slots.ring` | Number of ring slots this character has |

---

## 9. Formula Values — Dynamic Math

Instead of a plain number, a modifier's `value` can be a **formula string** that references character statistics.

### `@`-Path Reference Syntax

Inside a formula string, any path starting with `@` is replaced with a live value from the character sheet:

| Path | Returns |
|---|---|
| `@attributes.stat_strength.totalValue` | Strength's total score |
| `@attributes.stat_strength.derivedModifier` | STR modifier = `floor((STR - 10) / 2)` |
| `@attributes.stat_strength.baseValue` | Base STR before modifiers |
| `@skills.skill_tumble.ranks` | Ranks invested in Tumble |
| `@skills.skill_tumble.totalValue` | Total Tumble check value |
| `@combatStats.base_attack_bonus.totalValue` | Current BAB total |
| `@combatStats.speed_land.totalValue` | Land speed in feet |
| `@saves.fortitude.totalValue` | Fortitude save total |
| `@characterLevel` | Sum of all class levels |
| `@classLevels.class_rogue` | Level in a specific class |
| `@activeTags` | Array of all currently active tags |
| `@equippedWeaponTags` | Tags of the currently equipped weapon |
| `@selection.CHOICE_ID` | Player's choice for a `FeatureChoice` |
| `@constant.NAME` | Named constant from config tables |

### Formula Examples

```json
{ "value": "@attributes.stat_wisdom.derivedModifier" }
```
→ Uses the WIS modifier as the value (Monk AC bonus)

```json
{ "value": "floor(@classLevels.class_soulknife / 4)d8" }
```
→ Psychic Strike dice: 1d8 at level 4, 2d8 at level 8, etc.

```json
{ "value": "1d12 + floor(@attributes.stat_strength.derivedModifier * 1.5)" }
```
→ Two-handed weapon damage (1.5× STR modifier)

```json
{ "value": "3 + @attributes.stat_constitution.derivedModifier" }
```
→ Barbarian Rage duration in rounds

### Which Target IDs Accept Dice Formula Values?

A `value` of `"1d6"` or `"2d10"` should only be used where the result is a **damage roll or variable numeric output**, not where the engine needs a static number to sum.

| Use dice formula for | Use numeric value for |
|---|---|
| `combatStats.damage_bonus` (on-hit bonus dice) | `attributes.stat_strength` (ability score delta) |
| Augmentation `grantedModifiers.targetId: "damage"` | `combatStats.base_attack_bonus` (attack bonus) |
| `combatStats.power_damage_bonus` (psionic) | `saves.fortitude/reflex/will` (save increments) |
| Any pipeline that accumulates damage at cast time | Any pipeline that feeds into a static sheet total |

The engine evaluates dice formulas using the Math Parser; if a dice result is fed into a static pipeline like `saves.fortitude`, it will roll each sheet recomputation — an unintended and incorrect result.

### Supported Math Functions

The Math Parser supports the following functions inside formula strings:

| Function | Example | Notes |
|---|---|---|
| `floor(x)` | `"floor(@classLevels.class_bard / 2)"` | Most common — for half/quarter progressions |
| `ceil(x)` | `"ceil(@characterLevel / 3)"` | Rounds up |
| `round(x)` | `"round(@attributes.stat_wisdom.derivedModifier)"` | Rounds to nearest |
| `max(a, b)` | `"max(0, @attributes.stat_strength.derivedModifier)"` | Floor at 0 |
| `min(a, b)` | `"min(5, @classLevels.class_barbarian)"` | Cap at value |
| `abs(x)` | `"abs(@saves.will.totalValue)"` | Absolute value |

Unsupported function calls return `0` with a console warning — they do not throw errors.

### Description Pipe Syntax

In description text, use `{@path|pipe}` to display a value with unit conversion:

```json
{
  "description": {
    "en": "Your speed increases by {@combatStats.speed_land.totalValue|distance}.",
    "fr": "Votre vitesse augmente de {@combatStats.speed_land.totalValue|distance}."
  }
}
```

| Pipe | Conversion |
|---|---|
| `\|distance` | Converts feet to meters (FR) or keeps feet (EN) |
| `\|weight` | Converts pounds to kg (FR) or keeps lb (EN) |

---

## 10. Logic Nodes — Prerequisites & Conditions

The Logic Engine powers two things:
1. **`prerequisitesNode`** on a Feature — determines if the feat/ability is eligible
2. **`conditionNode`** on a Modifier — determines if the modifier applies at sheet-computation time

Both use the same `LogicNode` structure: an AND/OR/NOT tree of `CONDITION` leaves.

### The Four Node Types

```json
{ "logic": "AND", "nodes": [ ...children... ] }
{ "logic": "OR",  "nodes": [ ...children... ] }
{ "logic": "NOT", "node": ...single child... }
```

> **Critical asymmetry:** `AND` and `OR` use `"nodes"` (plural array). `NOT` uses `"node"` (singular object — no array). Writing `"nodes": [...]` on a NOT node is a silent bug — the JSON is valid but the condition never evaluates correctly.

```json

  "logic": "CONDITION",
  "targetPath": "@activeTags",
  "operator": "has_tag",
  "value": "feat_power_attack",
  "errorMessage": "Requires Power Attack feat"
}
```

### CONDITION Operators

| Operator | Meaning | Value type |
|---|---|---|
| `"=="` | Exactly equals | number or string |
| `">="` | Greater than or equal | number |
| `"<="` | Less than or equal | number |
| `"!="` | Not equal | number or string |
| `"includes"` | Array contains value | string |
| `"not_includes"` | Array does not contain | string |
| `"has_tag"` | Shorthand: `@activeTags` contains tag | tag string |
| `"missing_tag"` | Shorthand: `@activeTags` does not contain | tag string |

> **`has_tag` vs `includes`:** `has_tag` and `missing_tag` are explicit shorthands for checking `@activeTags`. Use them when your `targetPath` is `@activeTags`. For other arrays (like `@equippedWeaponTags`), use `"includes"` or `"not_includes"`. Functionally they are equivalent for array membership — the distinction is semantic clarity.

> **No `>` or `<` operators.** To express "BAB strictly greater than 5", use `">=" 6`. The engine has no strict comparison operators.

### Common `targetPath` Values

| Path | Checks |
|---|---|
| `@activeTags` | Active tag list (use with `has_tag` / `missing_tag`) |
| `@attributes.stat_strength.totalValue` | Strength score (use with `>=`) |
| `@attributes.stat_dexterity.totalValue` | Dexterity score |
| `@attributes.stat_caster_level.totalValue` | Caster level |
| `@skills.skill_tumble.ranks` | Skill ranks |
| `@characterLevel` | Total character level |
| `@classLevels.class_fighter` | Fighter class level |
| `@equippedWeaponTags` | Equipped weapon tags |

### `errorMessage` Field

`errorMessage` appears on `CONDITION` leaves inside `prerequisitesNode` to provide a human-readable explanation to the player. Rules:
- Include it on every CONDITION leaf that is directly user-facing (prerequisite feats, ability scores)
- It is optional on intermediate logic nodes (`AND`/`OR`/`NOT`) — the leaves' messages are shown
- It is optional on `conditionNode` (modifier-level gates) — these are internal mechanics, not displayed to the user

### Tutorial — Prerequisite: Power Attack (STR 13+)

```json
"prerequisitesNode": {
  "logic": "CONDITION",
  "targetPath": "@attributes.stat_strength.totalValue",
  "operator": ">=",
  "value": 13,
  "errorMessage": "Requires Strength 13+"
}
```

### Tutorial — Prerequisite: Cleave (STR 13+ AND Power Attack)

```json
"prerequisitesNode": {
  "logic": "AND",
  "nodes": [
    {
      "logic": "CONDITION",
      "targetPath": "@attributes.stat_strength.totalValue",
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

### Tutorial — Prerequisite: Arcane Archer (Elf or Half-Elf, Weapon Focus with bow, arcane spellcaster)

```json
"prerequisitesNode": {
  "logic": "AND",
  "nodes": [
    {
      "logic": "OR",
      "nodes": [
        { "logic": "CONDITION", "targetPath": "@activeTags", "operator": "has_tag", "value": "race_elf" },
        { "logic": "CONDITION", "targetPath": "@activeTags", "operator": "has_tag", "value": "race_half_elf" }
      ]
    },
    {
      "logic": "OR",
      "nodes": [
        { "logic": "CONDITION", "targetPath": "@activeTags", "operator": "has_tag", "value": "feat_weapon_focus_item_longbow", "errorMessage": "Requires Weapon Focus (longbow or shortbow)" },
        { "logic": "CONDITION", "targetPath": "@activeTags", "operator": "has_tag", "value": "feat_weapon_focus_item_shortbow" }
      ]
    },
    {
      "logic": "CONDITION",
      "targetPath": "@activeTags",
      "operator": "has_tag",
      "value": "spellcaster",
      "errorMessage": "Requires ability to cast arcane spells"
    }
  ]
}
```

### Tutorial — Conditional Modifier: Fast Movement (Not heavy armor, not heavy load)

> **Tag naming note:** Heavy armor items carry both `"armor_heavy"` (weight-category tag) AND their `grantedModifiers` include a tag injection — but for conditionNode checks, the SRD data uses the string `"heavy_armor"` (matching the tag emitted by the engine when a heavy armor item is active). Always match the exact string used in the actual item's `tags` array or the engine-emitted tag. When in doubt, check the existing SRD armor JSON.

```json
{
  "id": "barbarian_fast_movement_speed",
  "sourceId": "class_feature_barbarian_fast_movement",
  "sourceName": { "en": "Fast Movement", "fr": "Déplacement accéléré" },
  "targetId": "combatStats.speed_land",
  "value": 10,
  "type": "enhancement",
  "conditionNode": {
    "logic": "AND",
    "nodes": [
      {
        "logic": "NOT",
        "node": {
          "logic": "CONDITION",
          "targetPath": "@activeTags",
          "operator": "has_tag",
          "value": "heavy_armor",
          "errorMessage": "Fast Movement does not apply while wearing heavy armor"
        }
      },
      {
        "logic": "NOT",
        "node": {
          "logic": "CONDITION",
          "targetPath": "@activeTags",
          "operator": "has_tag",
          "value": "heavy_load",
          "errorMessage": "Fast Movement does not apply while carrying a heavy load"
        }
      }
    ]
  }
}
```

### Tutorial — Situational Modifier vs. Conditional Modifier

These are two **different** mechanisms:

| Mechanism | Field | Evaluated when | Purpose |
|---|---|---|---|
| **Conditional** | `conditionNode` | Sheet computation (every DAG cycle) | Modifier is active or completely suppressed based on sheet state |
| **Situational** | `situationalContext` | Dice roll time only | Modifier goes into `situationalModifiers`; fires only when roll context includes the string |

```json
{
  "id": "dwarf_save_vs_poison",
  "sourceId": "race_dwarf",
  "sourceName": { "en": "Dwarf", "fr": "Nain" },
  "targetId": "saves.all",
  "value": 2,
  "type": "racial",
  "situationalContext": "vs_poison"
}
```
The dwarf's +2 racial save vs. poison never appears in the static save total — it only fires when rolling a save against poison (when the roll context includes the `"vs_poison"` tag).

A modifier can have **both** `conditionNode` AND `situationalContext` — the condition gates whether it's eligible, and the situational context gates when it fires (Barbarian Indomitable Will: "+4 Will vs. Enchantment while Raging"):

```json
{
  "id": "indomitable_will_bonus",
  "targetId": "saves.will",
  "value": 4,
  "type": "untyped",
  "conditionNode": {
    "logic": "CONDITION",
    "targetPath": "@activeTags",
    "operator": "has_tag",
    "value": "condition_raging"
  },
  "situationalContext": "vs_enchantment"
}
```
→ This modifier only exists when the barbarian is raging **AND** only fires on enchantment saves.

---

## 11. Races

A race Feature uses `"category": "race"` and follows the standard Feature template.

### Complete Example — Human

```json
{
  "id": "race_human",
  "category": "race",
  "ruleSource": "srd_core",
  "label": {
    "en": "Human",
    "fr": "Humain"
  },
  "description": {
    "en": "Humans are the most adaptable and ambitious of all races.",
    "fr": "Les humains sont les plus adaptables et ambitieux de toutes les races."
  },
  "tags": [
    "race",
    "humanoid",
    "size_medium",
    "race_human"
  ],
  "grantedModifiers": [
    {
      "id": "human_speed",
      "sourceId": "race_human",
      "sourceName": { "en": "Human", "fr": "Humain" },
      "targetId": "combatStats.speed_land",
      "value": 30,
      "type": "base"
    },
    {
      "id": "human_bonus_skill_per_level",
      "sourceId": "race_human",
      "sourceName": { "en": "Human Versatility", "fr": "Polyvalence humaine" },
      "targetId": "attributes.bonus_skill_points_per_level",
      "value": 1,
      "type": "racial"
    },
    {
      "id": "human_bonus_feat",
      "sourceId": "race_human",
      "sourceName": { "en": "Human Bonus Feat", "fr": "Don supplémentaire humain" },
      "targetId": "attributes.bonus_feat_slots",
      "value": 1,
      "type": "racial"
    }
  ],
  "grantedFeatures": [
    "language_common"
  ]
}
```

### Complete Example — Dwarf (with situational saves and attack bonuses)

```json
{
  "id": "race_dwarf",
  "category": "race",
  "ruleSource": "srd_core",
  "label": { "en": "Dwarf", "fr": "Nain" },
  "description": {
    "en": "Dwarves are known for their skill in warfare and ability to withstand punishment.",
    "fr": "Les nains sont réputés pour leur habileté au combat et leur résistance."
  },
  "tags": ["race", "humanoid", "size_medium", "race_dwarf"],
  "grantedModifiers": [
    {
      "id": "dwarf_con_bonus",
      "sourceId": "race_dwarf",
      "sourceName": { "en": "Dwarf", "fr": "Nain" },
      "targetId": "attributes.stat_constitution",
      "value": 2,
      "type": "racial"
    },
    {
      "id": "dwarf_cha_penalty",
      "sourceId": "race_dwarf",
      "sourceName": { "en": "Dwarf", "fr": "Nain" },
      "targetId": "attributes.stat_charisma",
      "value": -2,
      "type": "racial"
    },
    {
      "id": "dwarf_speed",
      "sourceId": "race_dwarf",
      "sourceName": { "en": "Dwarf speed", "fr": "Vitesse naine" },
      "targetId": "combatStats.speed_land",
      "value": 20,
      "type": "base"
    },
    {
      "id": "dwarf_save_vs_poison",
      "sourceId": "race_dwarf",
      "sourceName": { "en": "Dwarf Poison Resistance", "fr": "Résistance naine au poison" },
      "targetId": "saves.all",
      "value": 2,
      "type": "racial",
      "situationalContext": "vs_poison"
    },
    {
      "id": "dwarf_save_vs_spells",
      "sourceId": "race_dwarf",
      "sourceName": { "en": "Dwarf Spell Resistance", "fr": "Résistance naine aux sorts" },
      "targetId": "saves.all",
      "value": 2,
      "type": "racial",
      "situationalContext": "vs_spells_and_spell_like"
    },
    {
      "id": "dwarf_attack_vs_orcs",
      "sourceId": "race_dwarf",
      "sourceName": { "en": "Dwarf Attack Bonus", "fr": "Bonus d'attaque nain" },
      "targetId": "combatStats.attack_bonus",
      "value": 1,
      "type": "racial",
      "situationalContext": "vs_orc"
    }
  ],
  "grantedFeatures": []
}
```

### Key Points for Races

- Always include `"size_medium"` (or the appropriate size tag) — the engine uses it for AC/attack size modifiers.
- Use `"type": "base"` for speed (the race establishes base speed, which classes like Monk can then modify).
- Use `"type": "racial"` for ability score modifiers (so they don't stack with other racial bonuses).
- Situational bonuses (vs. poison, vs. orcs) use `"situationalContext"` — they appear in tooltips but not in static totals.

---

## 12. Classes

Classes use `"category": "class"` and add three things that other Features don't have:
1. **`levelProgression`** — per-level increments for BAB, saves, HP die, and granted features
2. **`classSkills`** — which skills cost 1 point/rank instead of 2
3. **`recommendedAttributes`** — UI hint for the point-buy screen

### How `levelProgression` Works

Each entry provides **increments** (not cumulative totals). The engine sums all increments from level 1 through the character's current level in that class.

**D&D 3.5 save progression patterns:**
- **Good save:** +2 at level 1, then +1 every 2 levels: `[2, 0, 1, 0, 1, 0, 1, ...]`
- **Poor save:** +0 at level 1, then +1 every 3 levels: `[0, 0, 1, 0, 0, 1, 0, 0, 1, ...]`

**BAB progressions:**
- **Full BAB (Fighter, Barbarian, Ranger...):** +1 per level: `[1, 1, 1, 1, ...]`
- **3/4 BAB (Rogue, Cleric...):** +3 per 4 levels: `[0, 1, 1, 0, 1, 1, 0, 1, ...]`
- **1/2 BAB (Wizard, Sorcerer...):** +1 per 2 levels: `[0, 1, 0, 1, 0, ...]`

### Complete Example — Fighter (First 3 Levels)

```json
{
  "id": "class_fighter",
  "category": "class",
  "ruleSource": "srd_core",
  "label": { "en": "Fighter", "fr": "Guerrier" },
  "description": {
    "en": "A master of martial combat, skilled with a variety of weapons and armor.",
    "fr": "Un maître du combat martial, compétent avec une variété d'armes et d'armures."
  },
  "tags": ["class", "base_class", "martial", "class_fighter"],
  "grantedModifiers": [
    {
      "id": "fighter_hit_die",
      "sourceId": "class_fighter",
      "sourceName": { "en": "Fighter", "fr": "Guerrier" },
      "targetId": "combatStats.hit_die_type",
      "value": 10,
      "type": "base"
    },
    {
      "id": "fighter_skill_points",
      "sourceId": "class_fighter",
      "sourceName": { "en": "Fighter", "fr": "Guerrier" },
      "targetId": "attributes.skill_points_per_level",
      "value": 2,
      "type": "base"
    }
  ],
  "grantedFeatures": [
    "proficiency_all_simple",
    "proficiency_all_martial",
    "proficiency_armor_light",
    "proficiency_armor_medium",
    "proficiency_armor_heavy",
    "proficiency_shields",
    "proficiency_tower_shield"
  ],
  "classSkills": [
    "skill_climb", "skill_craft", "skill_handle_animal",
    "skill_intimidate", "skill_jump", "skill_ride", "skill_swim"
  ],
  "recommendedAttributes": ["stat_strength", "stat_constitution"],
  "levelProgression": [
    {
      "level": 1,
      "grantedFeatures": [
        "class_feature_fighter_bonus_feat_1"
      ],
      "grantedModifiers": [
        {
          "id": "fight_1_bab",
          "sourceId": "class_fighter",
          "sourceName": { "en": "Fighter 1", "fr": "Guerrier 1" },
          "targetId": "combatStats.base_attack_bonus",
          "value": 1, "type": "base"
        },
        {
          "id": "fight_1_fort",
          "sourceId": "class_fighter",
          "sourceName": { "en": "Fighter 1", "fr": "Guerrier 1" },
          "targetId": "saves.fortitude",
          "value": 2, "type": "base"
        },
        {
          "id": "fight_1_ref",
          "sourceId": "class_fighter",
          "sourceName": { "en": "Fighter 1", "fr": "Guerrier 1" },
          "targetId": "saves.reflex",
          "value": 0, "type": "base"
        },
        {
          "id": "fight_1_will",
          "sourceId": "class_fighter",
          "sourceName": { "en": "Fighter 1", "fr": "Guerrier 1" },
          "targetId": "saves.will",
          "value": 0, "type": "base"
        }
      ]
    },
    {
      "level": 2,
      "grantedFeatures": ["class_feature_fighter_bonus_feat_2"],
      "grantedModifiers": [
        {
          "id": "fight_2_bab",
          "sourceId": "class_fighter",
          "sourceName": { "en": "Fighter 2", "fr": "Guerrier 2" },
          "targetId": "combatStats.base_attack_bonus",
          "value": 1, "type": "base"
        },
        {
          "id": "fight_2_fort",
          "sourceId": "class_fighter",
          "sourceName": { "en": "Fighter 2", "fr": "Guerrier 2" },
          "targetId": "saves.fortitude",
          "value": 1, "type": "base"
        }
      ]
    },
    {
      "level": 3,
      "grantedFeatures": [],
      "grantedModifiers": [
        {
          "id": "fight_3_bab",
          "sourceId": "class_fighter",
          "sourceName": { "en": "Fighter 3", "fr": "Guerrier 3" },
          "targetId": "combatStats.base_attack_bonus",
          "value": 1, "type": "base"
        },
        {
          "id": "fight_3_fort",
          "sourceId": "class_fighter",
          "sourceName": { "en": "Fighter 3", "fr": "Guerrier 3" },
          "targetId": "saves.fortitude",
          "value": 1, "type": "base"
        }
      ]
    }
  ]
}
```

> **At level 3:** BAB = 1+1+1 = **+3**, Fort = 2+1+1 = **+4**, Ref = 0, Will = 0 — exactly matching the SRD Fighter table.

### Level Progression — Important Authoring Rules

**Include all 20 levels even when saves are 0.** Every level entry must exist in `levelProgression`. For levels where a save or BAB increment is 0, simply omit that modifier's entry (the engine treats missing entries as 0). Do not write `"value": 0` entries — they are noise.

```json
{ "level": 2, "grantedFeatures": [], "grantedModifiers": [
    { "id": "fight_2_bab",  "targetId": "combatStats.base_attack_bonus",  "value": 1, "type": "base", ... },
    { "id": "fight_2_fort", "targetId": "saves.fortitude", "value": 1, "type": "base", ... }
]}
```
(No `fight_2_ref` or `fight_2_will` needed — they improved by 0.)

**Do include zero-value BAB entries for levels where BAB does not increase**, because the engine needs proof that the level was authored (missing entries are fine; the system sums only what is present).

**Spell slot resources** follow a `resources.spell_slots_CLASS_LEVEL` target pattern, also with `"type": "base"`:

```json
{ "id": "wizard_1_slots_1", "targetId": "resources.spell_slots_wizard_1", "value": 1, "type": "base" }
{ "id": "wizard_2_slots_1", "targetId": "resources.spell_slots_wizard_1", "value": 1, "type": "base" }
```
(At wizard level 2, the 1st-level slot pool maximum grows by +1, etc.)

### Spellcasting Class Tags

Every spellcasting class (arcane or divine) must include the casting ability tag in its **class-level** `tags` array:

| Class | Tag to add |
|---|---|
| Wizard | `"caster_ability_stat_intelligence"` |
| Sorcerer, Bard | `"caster_ability_stat_charisma"` |
| Cleric, Druid, Ranger, Paladin | `"caster_ability_stat_wisdom"` |
| Psion (INT), Psychic Warrior | `"caster_ability_stat_intelligence"` |
| Wilder | `"caster_ability_stat_charisma"` |

Also add `"spellcaster"` to the class `tags` array if the class can cast spells — this is the tag prestige class prerequisites check for "must be able to cast arcane/divine spells."

### Caster Level Progression

For spellcasting classes, add a modifier in each `levelProgression` entry targeting `"attributes.stat_caster_level"`:

```json
{
  "id": "wizard_1_cl",
  "sourceId": "class_wizard",
  "sourceName": { "en": "Wizard 1", "fr": "Magicien 1" },
  "targetId": "attributes.stat_caster_level",
  "value": 1,
  "type": "base"
}
```

---

## 13. Class Features

Class features use `"category": "class_feature"`. They are referenced from the class's `levelProgression[].grantedFeatures` array.

### Simple Class Feature — Uncanny Dodge

```json
{
  "id": "class_feature_uncanny_dodge",
  "category": "class_feature",
  "ruleSource": "srd_core",
  "label": { "en": "Uncanny Dodge", "fr": "Esquive instinctive" },
  "description": {
    "en": "The barbarian retains his Dexterity bonus to AC even when flat-footed.",
    "fr": "Le barbare conserve son bonus de Dextérité à la CA même lorsqu'il est pris au dépourvu."
  },
  "tags": ["class_feature", "barbarian", "extraordinary"],
  "grantedModifiers": [],
  "grantedFeatures": []
}
```

Some class features have no modifiers — they are narrative abilities that the UI displays and the player tracks manually.

### Active Class Feature — Rage (with ResourcePool)

> **Architecture note:** Rage modifiers fire whenever the Rage feature is **active** (i.e., in `activeFeatures` with `isActive: true`). They do NOT need a `conditionNode`. The player activates Rage by spending 1 charge via the UI button — the engine sets `isActive: true` on the class feature instance. The modifiers apply automatically while Rage is on. Do not add `conditionNode: { has_tag "condition_raging" }` — this is incorrect and will break the feature.

```json
{
  "id": "class_feature_barbarian_rage",
  "category": "class_feature",
  "ruleSource": "srd_core",
  "label": { "en": "Rage", "fr": "Furie" },
  "description": {
    "en": "A barbarian can fly into a rage, temporarily gaining +4 STR, +4 CON, and +2 morale bonus on Will saves, but -2 AC.",
    "fr": "Un barbare peut entrer dans une furie, gagnant +4 FOR, +4 CON, +2 moral aux jets de Volonté, mais subissant -2 CA."
  },
  "tags": ["class_feature", "barbarian", "extraordinary", "rage"],
  "activation": {
    "actionType": "free",
    "resourceCost": {
      "targetId": "resources.barbarian_rage_uses",
      "cost": 1
    }
  },
  "grantedModifiers": [
    {
      "id": "barbarian_rage_uses_max",
      "sourceId": "class_feature_barbarian_rage",
      "sourceName": { "en": "Rage", "fr": "Furie" },
      "targetId": "resources.barbarian_rage_uses.maxValue",
      "value": "1 + floor(@classLevels.class_barbarian / 4)",
      "type": "base"
    },
    {
      "id": "rage_str_bonus",
      "sourceId": "class_feature_barbarian_rage",
      "sourceName": { "en": "Rage", "fr": "Furie" },
      "targetId": "attributes.stat_strength",
      "value": 4,
      "type": "morale"
    },
    {
      "id": "rage_con_bonus",
      "sourceId": "class_feature_barbarian_rage",
      "sourceName": { "en": "Rage", "fr": "Furie" },
      "targetId": "attributes.stat_constitution",
      "value": 4,
      "type": "morale"
    },
    {
      "id": "rage_will_bonus",
      "sourceId": "class_feature_barbarian_rage",
      "sourceName": { "en": "Rage", "fr": "Furie" },
      "targetId": "saves.will",
      "value": 2,
      "type": "morale"
    },
    {
      "id": "rage_ac_penalty",
      "sourceId": "class_feature_barbarian_rage",
      "sourceName": { "en": "Rage Penalty", "fr": "Pénalité de furie" },
      "targetId": "combatStats.ac_normal",
      "value": -2,
      "type": "untyped"
    },
    {
      "id": "rage_ac_touch_penalty",
      "sourceId": "class_feature_barbarian_rage",
      "sourceName": { "en": "Rage Penalty (touch)", "fr": "Pénalité de furie (contact)" },
      "targetId": "combatStats.ac_touch",
      "value": -2,
      "type": "untyped"
    }
  ],
  "grantedFeatures": []
}
```

> **Resource pool max location:** The maximum for the Rage resource pool is declared on the class feature itself (`targetId: "resources.barbarian_rage_uses.maxValue"`), not on the class. The engine normalizes `resources.X.maxValue` to `combatStats.X_max` internally.

### Resource Cost `targetId` — ID Format Rules

The `activation.resourceCost.targetId` references a **character-level resource pool** using the full `resources.POOL_ID` path:

```json
"resourceCost": { "targetId": "resources.barbarian_rage_uses", "cost": 1 }
```

For **item-level pools** (wand charges, ring uses) tracked in `ActiveFeatureInstance.itemResourcePools`, the `activation.resourceCost.targetId` is just the bare `poolId` string (no `resources.` prefix):

```json
"resourceCost": { "targetId": "spell_turning_uses", "cost": 1 }
```

| Pool type | `targetId` format | Stored in |
|---|---|---|
| Class features (Rage, Smite, Bardic Music) | `"resources.POOL_ID"` (with prefix) | `Character.resources` |
| Item charges (wand, ring, staff) | `"POOL_ID"` (bare, no prefix) | `ActiveFeatureInstance.itemResourcePools` |

### Activation `actionType` Values

| Value | D&D 3.5 Equivalent |
|---|---|
| `"standard"` | Standard action |
| `"move"` | Move action |
| `"swift"` | Swift action |
| `"immediate"` | Immediate action |
| `"free"` | Free action |
| `"full_round"` | Full-round action |
| `"minutes"` | 1+ minutes (ritual) |
| `"hours"` | 1+ hours (meditation) |
| `"passive"` | Always active — no button |
| `"reaction"` | Auto-fires on `triggerEvent` |

---

## 14. Feats

Feats use `"category": "feat"`. The most important things feats add are `prerequisitesNode` and sometimes `choices`.

### Simple Feat — Toughness

```json
{
  "id": "feat_toughness",
  "category": "feat",
  "ruleSource": "srd_core",
  "label": { "en": "Toughness", "fr": "Robustesse" },
  "description": {
    "en": "You gain +3 hit points.",
    "fr": "Vous gagnez 3 points de vie supplémentaires."
  },
  "tags": ["feat", "general", "feat_toughness"],
  "grantedModifiers": [
    {
      "id": "feat_toughness_hp",
      "sourceId": "feat_toughness",
      "sourceName": { "en": "Toughness", "fr": "Robustesse" },
      "targetId": "combatStats.max_hp",
      "value": 3,
      "type": "untyped"
    }
  ],
  "grantedFeatures": []
}
```

### Feat with Prerequisite — Cleave

```json
{
  "id": "feat_cleave",
  "category": "feat",
  "ruleSource": "srd_core",
  "label": { "en": "Cleave", "fr": "Fendre" },
  "description": {
    "en": "After striking a foe, you may make one extra attack against an adjacent enemy.",
    "fr": "Après avoir frappé un ennemi, vous pouvez effectuer une attaque supplémentaire contre un ennemi adjacent."
  },
  "tags": ["feat", "general", "fighter_bonus_feat", "feat_cleave"],
  "prerequisitesNode": {
    "logic": "AND",
    "nodes": [
      {
        "logic": "CONDITION",
        "targetPath": "@attributes.stat_strength.totalValue",
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
  },
  "grantedModifiers": [],
  "grantedFeatures": []
}
```

### Feat with Choice — Weapon Focus

This is the most important pattern: a feat that grants different bonuses depending on which weapon was chosen.

```json
{
  "id": "feat_weapon_focus",
  "category": "feat",
  "ruleSource": "srd_core",
  "label": { "en": "Weapon Focus", "fr": "Arme de Prédilection" },
  "description": {
    "en": "Choose one type of weapon. You gain a +1 bonus on all attack rolls with the specified weapon.",
    "fr": "Choisissez un type d'arme. Vous obtenez un bonus de +1 à tous vos jets d'attaque avec l'arme choisie."
  },
  "tags": ["feat", "general", "fighter_bonus_feat", "feat_weapon_focus"],
  "choices": [
    {
      "choiceId": "weapon_choice",
      "label": { "en": "Choose a weapon", "fr": "Choisissez une arme" },
      "optionsQuery": "tag:weapon",
      "maxSelections": 1,
      "choiceGrantedTagPrefix": "feat_weapon_focus_"
    }
  ],
  "grantedModifiers": [
    {
      "id": "mod_weapon_focus",
      "sourceId": "feat_weapon_focus",
      "sourceName": { "en": "Weapon Focus", "fr": "Arme de Prédilection" },
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
  ],
  "grantedFeatures": []
}
```

**How this works:**
1. Player selects "Longsword" → `selections: { "weapon_choice": ["item_longsword"] }`
2. Engine emits tag `"feat_weapon_focus_item_longsword"` into `@activeTags`
3. When longsword is equipped, `@equippedWeaponTags` includes `"item_longsword"` → modifier fires
4. Another feat that requires "Weapon Focus (longsword)" checks for `has_tag "feat_weapon_focus_item_longsword"`

> **`choiceGrantedTagPrefix` is required for prerequisite chains.** If you omit it, the engine still records the player's selection in `selections` (so `@selection.CHOICE_ID` works in conditionNodes), but it will NOT emit a derived tag into `@activeTags`. This means any feat that checks `has_tag "feat_weapon_focus_item_longsword"` will never fire. Always include `choiceGrantedTagPrefix` when other features must detect what was chosen.

### `FeatureChoice.optionsQuery` Formats

| Format | Meaning |
|---|---|
| `"tag:weapon"` | All Features with the `"weapon"` tag |
| `"tag:weapon+tag:martial"` | Features with BOTH `"weapon"` AND `"martial"` tags |
| `"category:domain"` | All Features of category `"domain"` |
| `"category:feat"` | All feats |
| `"discipline:telepathy"` | All psionic powers in the telepathy discipline |
| `"discipline:clairsentience+level:3"` | Level-3 clairsentience powers |

---

## 15. Spells & Psionic Powers

Spells and powers use `"category": "magic"`. They extend the base Feature with magic-specific fields.

### Complete Spell Example — Fireball

```json
{
  "id": "spell_fireball",
  "category": "magic",
  "ruleSource": "srd_core",
  "magicType": "arcane",
  "label": { "en": "Fireball", "fr": "Boule de feu" },
  "description": {
    "en": "A fireball spell generates a searing explosion of flame that detonates with a low roar and deals 1d6 points of fire damage per caster level (maximum 10d6) to every creature within the area.",
    "fr": "Une boule de feu génère une explosion de flamme qui inflige 1d6 points de dégâts de feu par niveau de lanceur de sorts (maximum 10d6) à toutes les créatures dans la zone."
  },
  "tags": ["spell", "spell_evocation", "fire"],
  "school": "evocation",
  "descriptors": ["fire"],
  "spellLists": {
    "list_sorcerer": 3,
    "list_wizard": 3
  },
  "resistanceType": "spell_resistance",
  "components": ["V", "S", "M"],
  "range": "long",
  "targetArea": {
    "en": "20-ft.-radius spread",
    "fr": "Zone d'effet de 6 m de rayon"
  },
  "duration": "instantaneous",
  "savingThrow": "ref_half",
  "grantedModifiers": [],
  "grantedFeatures": []
}
```

### Spell Fields Reference

| Field | Type | Description |
|---|---|---|
| `magicType` | `string` | `"arcane"`, `"divine"`, or `"psionic"` |
| `school` | `string` | Abjuration, conjuration, divination, enchantment, evocation, illusion, necromancy, transmutation, universal |
| `subSchool` | `string` | Optional: creation, calling, charm, summoning, etc. |
| `descriptors` | `string[]` | Fire, cold, acid, electricity, sonic, mind-affecting, etc. |
| `spellLists` | `Record<ID, number>` | Spell list IDs → spell level. `{ "list_wizard": 3, "list_sorcerer": 3 }` |
| `resistanceType` | `string` | `"spell_resistance"`, `"power_resistance"`, or `"none"` |
| `components` | `string[]` | `["V", "S", "M"]` — Verbal, Somatic, Material, Focus, Divine Focus (DF) |
| `range` | `string` | `"personal"`, `"touch"`, `"close"`, `"medium"`, `"long"`, or formula |
| `targetArea` | `LocalizedString` | Localized description of targets/area |
| `duration` | `string` | `"instantaneous"`, `"1 round/level"`, formula, etc. |
| `savingThrow` | `string` | `"fort_half"`, `"ref_negates"`, `"will_disbelieves"`, `"none"`, or custom |

### Spell List IDs

| Spell List ID | Class |
|---|---|
| `list_bard` | Bard |
| `list_cleric` | Cleric |
| `list_druid` | Druid |
| `list_paladin` | Paladin |
| `list_ranger` | Ranger |
| `list_sorcerer` | Sorcerer |
| `list_wizard` | Wizard |
| `list_domain_NAME` | Domain spell list (e.g., `list_domain_fire`, `list_domain_water`, `list_domain_war`) |
| `list_assassin` | Assassin |
| `list_blackguard` | Blackguard |
| `list_psion_wilder` | Psion/Wilder (all disciplines) |
| `list_psion_seer` | Psion Specialist — Seer (clairsentience) |
| `list_psion_shaper` | Psion Specialist — Shaper (metacreativity) |
| `list_psion_kineticist` | Psion Specialist — Kineticist (psychokinesis) |
| `list_psion_egoist` | Psion Specialist — Egoist (psychometabolism) |
| `list_psion_nomad` | Psion Specialist — Nomad (psychoportation) |
| `list_psion_telepath` | Psion Specialist — Telepath (telepathy) |
| `list_psychic_warrior` | Psychic Warrior |

### Psionic Power — Mind Thrust

Psionic powers add `discipline`, `displays`, and `augmentations`:

```json
{
  "id": "power_mind_thrust",
  "category": "magic",
  "ruleSource": "srd_psionics",
  "magicType": "psionic",
  "label": { "en": "Mind Thrust", "fr": "Assaut mental" },
  "description": {
    "en": "You mentally bludgeon one creature you can see, dealing 1d10 points of damage.",
    "fr": "Vous assaillez mentalement une créature en vue, lui infligeant 1d10 points de dégâts."
  },
  "tags": ["magic", "psionic", "mind-affecting"],
  "school": "telepathy",
  "discipline": "telepathy",
  "displays": ["auditory", "mental"],
  "descriptors": ["mind-affecting"],
  "spellLists": {
    "list_psion_wilder": 1,
    "list_psion_telepath": 1
  },
  "resistanceType": "power_resistance",
  "components": ["Me"],
  "range": "close",
  "targetArea": { "en": "One creature", "fr": "Une créature" },
  "duration": "instantaneous",
  "savingThrow": "will_negates",
  "augmentations": [
    {
      "costIncrement": 2,
      "effectDescription": {
        "en": "Damage increases by 1d10 per 2 additional PP spent.",
        "fr": "Les dégâts augmentent de 1d10 par 2 PP supplémentaires dépensés."
      },
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
  ],
  "grantedModifiers": [],
  "grantedFeatures": []
}
```

---

## 16. Items — Weapons & Armor

Items use `"category": "item"` and the `ItemFeature` shape. The key extra fields are `equipmentSlot`, `weightLbs`, `costGp`, `weaponData`, and `armorData`.

### Weapon Example — Longsword

```json
{
  "id": "item_longsword",
  "category": "item",
  "ruleSource": "srd_core",
  "label": { "en": "Longsword", "fr": "Épée longue" },
  "description": {
    "en": "This sword is about 3½ feet in length.",
    "fr": "Cette épée mesure environ 1 mètre de long."
  },
  "tags": [
    "item", "weapon", "weapon_martial", "weapon_melee",
    "weapon_one_handed", "item_longsword"
  ],
  "equipmentSlot": "main_hand",
  "weightLbs": 4,
  "costGp": 15,
  "hardness": 10,
  "hpMax": 5,
  "grantedModifiers": [],
  "grantedFeatures": [],
  "weaponData": {
    "wieldCategory": "one_handed",
    "damageDice": "1d8",
    "damageType": ["slashing"],
    "critRange": "19-20",
    "critMultiplier": 2,
    "reachFt": 5
  }
}
```

### `weaponData` Fields

| Field | Type | Description |
|---|---|---|
| `wieldCategory` | `string` | `"light"`, `"one_handed"`, `"two_handed"`, `"double"` |
| `damageDice` | `string` | Damage dice expression: `"1d6"`, `"2d4"`, `"1d8"` |
| `damageType` | `string[]` | One or more of: `"slashing"`, `"piercing"`, `"bludgeoning"` |
| `critRange` | `string` | `"20"` (natural 20 only), `"19-20"` (longsword), `"18-20"` (keen rapier) |
| `critMultiplier` | `number` | Crit multiplier: `2`, `3`, or `4` |
| `reachFt` | `number` | Reach in feet: `5` (standard), `10` (reach weapon) |
| `rangeIncrementFt` | `number` | Range increment for thrown/ranged weapons (in feet) |
| `secondaryWeaponData` | `object` | **Double weapons only** — stats for the off-hand end. See below. |
| `onCritDice` | `object` | On-crit burst dice (Flaming Burst, etc.) — see Section 17 |

### Double Weapon — `secondaryWeaponData`

Double weapons (Dire Flail, Quarterstaff, Orc Double Axe) have two ends with different damage. Use `wieldCategory: "double"` and add a `secondaryWeaponData` block for the off-hand end:

```json
{
  "id": "item_dire_flail",
  "category": "item",
  "ruleSource": "srd_core",
  "label": { "en": "Dire Flail", "fr": "Fléau de guerre à deux têtes" },
  "tags": ["item", "weapon", "weapon_exotic", "weapon_melee", "item_dire_flail"],
  "equipmentSlot": "two_hands",
  "weightLbs": 10,
  "costGp": 90,
  "weaponData": {
    "wieldCategory": "double",
    "damageDice": "1d8",
    "damageType": ["bludgeoning"],
    "critRange": "20",
    "critMultiplier": 2,
    "reachFt": 5,
    "secondaryWeaponData": {
      "damageDice": "1d8",
      "damageType": ["bludgeoning"],
      "critRange": "20",
      "critMultiplier": 2
    }
  },
  "grantedModifiers": [],
  "grantedFeatures": []
}
```

### Armor Example — Chain Shirt

```json
{
  "id": "item_armor_chain_shirt",
  "category": "item",
  "ruleSource": "srd_core",
  "label": { "en": "Chain Shirt", "fr": "Chemise de mailles" },
  "description": {
    "en": "A shirt of interlocking metal rings worn beneath other clothing.",
    "fr": "Une chemise de mailles entrelacées portée sous d'autres vêtements."
  },
  "tags": [
    "item", "armor", "armor_light", "wearing_armor",
    "item_armor_chain_shirt"
  ],
  "equipmentSlot": "body",
  "weightLbs": 25,
  "costGp": 100,
  "hardness": 10,
  "hpMax": 20,
  "grantedModifiers": [
    {
      "id": "armor_chain_shirt_ac",
      "sourceId": "item_armor_chain_shirt",
      "sourceName": { "en": "Chain Shirt", "fr": "Chemise de mailles" },
      "targetId": "combatStats.ac_normal",
      "value": 4,
      "type": "armor"
    },
    {
      "id": "armor_chain_shirt_acp",
      "sourceId": "item_armor_chain_shirt",
      "sourceName": { "en": "Chain Shirt", "fr": "Chemise de mailles" },
      "targetId": "combatStats.armor_check_penalty",
      "value": -2,
      "type": "base"
    },
    {
      "id": "armor_chain_shirt_max_dex",
      "sourceId": "item_armor_chain_shirt",
      "sourceName": { "en": "Chain Shirt", "fr": "Chemise de mailles" },
      "targetId": "combatStats.max_dexterity_bonus",
      "value": 4,
      "type": "max_dex_cap"
    },
    {
      "id": "armor_chain_shirt_asf",
      "sourceId": "item_armor_chain_shirt",
      "sourceName": { "en": "Chain Shirt", "fr": "Chemise de mailles" },
      "targetId": "combatStats.arcane_spell_failure",
      "value": 20,
      "type": "base"
    }
  ],
  "grantedFeatures": [],
  "armorData": {
    "armorBonus": 4,
    "maxDex": 4,
    "armorCheckPenalty": -2,
    "arcaneSpellFailure": 20
  }
}
```

> **Important:** `armorData` is a display-only shadow for the item card tooltip. The actual mechanical values are in `grantedModifiers`. Always keep them consistent.

### `armorData` Fields

| Field | Description |
|---|---|
| `armorBonus` | Display value shown on item card |
| `maxDex` | Display value (engine uses `combatStats.max_dexterity_bonus` modifier) |
| `armorCheckPenalty` | Display value (engine uses `combatStats.armor_check_penalty` modifier) |
| `arcaneSpellFailure` | Display value (engine uses `combatStats.arcane_spell_failure` modifier) |

### Equipment Slots

| Slot | Worn At |
|---|---|
| `"head"` | Helm, hat, headband |
| `"eyes"` | Goggles, lenses |
| `"neck"` | Amulet, periapt, pendant |
| `"torso"` | Vest, shirt |
| `"body"` | Armor, robe |
| `"waist"` | Belt |
| `"shoulders"` | Cloak, mantle |
| `"arms"` | Bracers, armbands |
| `"hands"` | Gauntlets, gloves |
| `"ring"` | Rings (up to 2 by default) |
| `"feet"` | Boots, slippers |
| `"main_hand"` | Weapon, shield (if one-handed) |
| `"off_hand"` | Off-hand weapon, shield |
| `"two_hands"` | Two-handed weapon |
| `"none"` | Not worn — in pack, held but not equipped |

---

## 17. Items — Magic Items & Charged Items

### Passive Magic Item — Ring of Protection +2

A passive item is always active when equipped. Use `"activation": { "actionType": "passive" }`.

```json
{
  "id": "item_ring_protection_2",
  "category": "item",
  "ruleSource": "srd_core",
  "label": { "en": "Ring of Protection +2", "fr": "Anneau de protection +2" },
  "description": {
    "en": "This ring offers continual magical protection in the form of a deflection bonus of +2 to AC.",
    "fr": "Cet anneau offre une protection magique continue sous la forme d'un bonus de déviation de +2 à la CA."
  },
  "tags": ["item", "ring", "magic_item"],
  "equipmentSlot": "ring",
  "weightLbs": 0,
  "costGp": 8000,
  "hardness": 10,
  "hpMax": 2,
  "activation": { "actionType": "passive" },
  "grantedModifiers": [
    {
      "id": "ring_protection_2_deflection",
      "sourceId": "item_ring_protection_2",
      "sourceName": { "en": "Ring of Protection +2", "fr": "Anneau de protection +2" },
      "targetId": "combatStats.ac_normal",
      "value": 2,
      "type": "deflection"
    }
  ],
  "grantedFeatures": []
}
```

### Charged Item — Ring of Spell Turning (3/day)

```json
{
  "id": "item_ring_spell_turning",
  "category": "item",
  "ruleSource": "srd_core",
  "label": { "en": "Ring of Spell Turning", "fr": "Anneau de renvoi des sorts" },
  "description": {
    "en": "3 times per day, this ring reflects spells back at the caster.",
    "fr": "3 fois par jour, cet anneau réfléchit les sorts vers leur lanceur."
  },
  "tags": ["item", "ring", "magic_item"],
  "equipmentSlot": "ring",
  "weightLbs": 0,
  "costGp": 98280,
  "hardness": 10,
  "hpMax": 2,
  "activation": {
    "actionType": "reaction",
    "triggerEvent": "on_spell_targeted",
    "resourceCost": {
      "targetId": "spell_turning_uses",
      "cost": 1
    }
  },
  "resourcePoolTemplates": [
    {
      "poolId": "spell_turning_uses",
      "label": { "en": "Spell Turning (3/day)", "fr": "Renvoi des sorts (3/jour)" },
      "maxPipelineId": "combatStats.spell_turning_max",
      "defaultCurrent": 3,
      "resetCondition": "per_day"
    }
  ],
  "grantedModifiers": [],
  "grantedFeatures": []
}
```

### `resourcePoolTemplates` Fields

| Field | Description |
|---|---|
| `poolId` | ID for this charge pool (local to the item instance) |
| `label` | Display name |
| `maxPipelineId` | Pipeline that computes the maximum charges |
| `defaultCurrent` | Starting charge count when item is first added to character |
| `resetCondition` | When charges reset — see table below |
| `rechargeAmount` | For `"per_turn"` / `"per_round"` pools: charges regained per tick |

### `resetCondition` Values

| Value | Trigger | Typical Use |
|---|---|---|
| `"long_rest"` | After 8 hours of sleep | Spell slots, class abilities |
| `"short_rest"` | After short rest | Short-rest variants |
| `"encounter"` | After encounter ends | Once-per-encounter abilities |
| `"per_day"` | At dawn (regardless of sleep) | X/day ring abilities |
| `"per_week"` | Weekly | Rare weekly-reset items |
| `"per_turn"` | Each character's initiative turn | Fast Healing, Regeneration |
| `"per_round"` | Each global round | Area aura effects |
| `"never"` | Never automatic | Finite charges (wands at 50, Ring of the Ram) |

### Damage Reduction — `drBypassTags`

DR modifiers use `"type": "damage_reduction"` with a `drBypassTags` array:

```json
{
  "id": "vampire_dr",
  "sourceId": "race_vampire",
  "sourceName": { "en": "Vampire", "fr": "Vampire" },
  "targetId": "combatStats.damage_reduction",
  "value": 10,
  "type": "damage_reduction",
  "drBypassTags": ["magic"]
}
```

| `drBypassTags` Value | D&D 3.5 Notation | Semantics |
|---|---|---|
| `[]` | DR X/— | Nothing bypasses |
| `["magic"]` | DR X/magic | Magic weapons bypass |
| `["silver"]` | DR X/silver | Silver weapons bypass |
| `["cold_iron"]` | DR X/cold iron | Cold iron weapons bypass |
| `["good"]` | DR X/good | Good-aligned weapons bypass |
| `["epic"]` | DR X/epic | Epic weapons bypass |
| `["magic", "silver"]` | DR X/magic AND silver | Weapon must be BOTH magic AND silver |

> **DR "OR" logic** (e.g., DR 5/magic or silver — either bypasses): Model this as **two separate DR modifiers** with different `drBypassTags`, each at the same value. The best-wins grouping applies per bypass-tag group, so DR 5/magic and DR 5/silver independently resolve:

```json
{ "value": 5, "type": "damage_reduction", "drBypassTags": ["magic"] },
{ "value": 5, "type": "damage_reduction", "drBypassTags": ["silver"] }
```
Against a magic weapon: the first DR entry (magic) is bypassed; the second (silver) still applies → 5 DR remaining.
Against a magic+silver weapon: both are bypassed → no DR.

**For class progression DR (Barbarian)**: This is a special exception to the `"type": "base"` rule. The additive increments (+1 at level 7, +1 at level 10, etc.) targeting `"combatStats.damage_reduction"` use `"type": "base"` because the engine needs to sum them across levels. This is the only non-BAB/save/CL use of `"type": "base"` that is architecturally correct.

```json
{
  "id": "barbarian_dr_1",
  "targetId": "combatStats.damage_reduction",
  "value": 1,
  "type": "base"
}
```

### Flaming Burst Longsword (on-crit burst dice)

```json
{
  "id": "item_weapon_flaming_burst_longsword_1",
  "category": "item",
  "ruleSource": "srd_core",
  "label": { "en": "Flaming Burst Longsword +1", "fr": "Épée longue ardente coruscante +1" },
  "tags": ["item", "weapon", "weapon_martial", "weapon_melee", "magic_item", "magic_weapon"],
  "equipmentSlot": "main_hand",
  "weightLbs": 4,
  "costGp": 18315,
  "grantedModifiers": [
    {
      "id": "flaming_burst_enhancement_att",
      "sourceId": "item_weapon_flaming_burst_longsword_1",
      "sourceName": { "en": "Flaming Burst Longsword", "fr": "Épée ardente coruscante" },
      "targetId": "combatStats.attack_bonus",
      "value": 1,
      "type": "enhancement"
    },
    {
      "id": "flaming_burst_enhancement_dmg",
      "sourceId": "item_weapon_flaming_burst_longsword_1",
      "sourceName": { "en": "Flaming Burst Longsword", "fr": "Épée ardente coruscante" },
      "targetId": "combatStats.damage_bonus",
      "value": 1,
      "type": "enhancement"
    },
    {
      "id": "flaming_burst_fire_on_hit",
      "sourceId": "item_weapon_flaming_burst_longsword_1",
      "sourceName": { "en": "Flaming (on hit)", "fr": "Ardente (au toucher)" },
      "targetId": "combatStats.damage_bonus",
      "value": "1d6",
      "type": "untyped",
      "situationalContext": "on_hit"
    }
  ],
  "grantedFeatures": [],
  "weaponData": {
    "wieldCategory": "one_handed",
    "damageDice": "1d8",
    "damageType": ["slashing", "fire"],
    "critRange": "19-20",
    "critMultiplier": 2,
    "reachFt": 5,
    "onCritDice": {
      "baseDiceFormula": "1d10",
      "damageType": "fire",
      "scalesWithCritMultiplier": true
    }
  }
}
```

---

## 18. Items — Consumables (Potions, Scrolls, Wands, Staves)

### Potion (Consumable)

A potion is destroyed on use. Its modifiers become an ephemeral effect on the character. Use `"consumable": { "isConsumable": true }`.

```json
{
  "id": "item_potion_bulls_strength",
  "category": "item",
  "ruleSource": "srd_core",
  "label": { "en": "Potion of Bull's Strength", "fr": "Potion de force du taureau" },
  "description": {
    "en": "Drinking this potion grants +4 enhancement bonus to Strength for 1 minute.",
    "fr": "Boire cette potion accorde un bonus d'altération de +4 à la Force pendant 1 minute."
  },
  "tags": ["item", "potion", "magic_item", "consumable"],
  "equipmentSlot": "none",
  "weightLbs": 0.1,
  "costGp": 300,
  "consumable": {
    "isConsumable": true,
    "durationHint": "1 min"
  },
  "grantedModifiers": [
    {
      "id": "potion_bulls_str_bonus",
      "sourceId": "item_potion_bulls_strength",
      "sourceName": { "en": "Bull's Strength", "fr": "Force du taureau" },
      "targetId": "attributes.stat_strength",
      "value": 4,
      "type": "enhancement"
    }
  ],
  "grantedFeatures": []
}
```

> `durationHint` is **cosmetic only** — displayed in the Ephemeral Effects Panel as a reminder. The engine never auto-expires effects; the player clicks "Expire" manually.

### Wand

A wand uses the item's fixed caster level (NOT the wielder's). Always specify `wandSpell.casterLevel`.

```json
{
  "id": "item_wand_magic_missile_cl1",
  "category": "item",
  "ruleSource": "srd_core",
  "label": { "en": "Wand of Magic Missile (CL 1)", "fr": "Baguette de projectile magique (NLS 1)" },
  "tags": ["item", "wand", "magic_item"],
  "equipmentSlot": "main_hand",
  "weightLbs": 0,
  "costGp": 750,
  "resourcePoolTemplates": [
    {
      "poolId": "charges",
      "label": { "en": "Wand Charges", "fr": "Charges de baguette" },
      "maxPipelineId": "combatStats.wand_charges_max",
      "defaultCurrent": 50,
      "resetCondition": "never"
    }
  ],
  "wandSpell": {
    "spellId": "spell_magic_missile",
    "casterLevel": 1
  },
  "grantedModifiers": [],
  "grantedFeatures": []
}
```

> **Wand activation:** Wands do not need an explicit `activation` field. The presence of `wandSpell` is sufficient for the Casting Panel UI to display an "Activate" button. The CastingPanel checks for `wandSpell`, deducts 1 charge via `spendItemPoolCharge`, and casts with `wandSpell.casterLevel`. Similarly, staves use `staffSpells` to generate their UI, and scrolls use `scrollSpells`.

```
```

### Scroll

Scrolls are single-use. `spellLevel` is required. `spellType` restricts to arcane or divine casters.

```json
{
  "id": "item_scroll_fireball",
  "category": "item",
  "ruleSource": "srd_core",
  "label": { "en": "Scroll of Fireball", "fr": "Parchemin de boule de feu" },
  "tags": ["item", "scroll", "magic_item", "consumable"],
  "equipmentSlot": "none",
  "weightLbs": 0,
  "costGp": 375,
  "consumable": { "isConsumable": true },
  "scrollSpells": [
    {
      "spellId": "spell_fireball",
      "casterLevel": 5,
      "spellLevel": 3,
      "spellType": "arcane"
    }
  ],
  "grantedModifiers": [],
  "grantedFeatures": []
}
```

### Staff

A staff has multiple spells at varying charge costs. The wielder's applicable caster level is used (if higher than the staff's own CL).

```json
{
  "id": "item_staff_fire",
  "category": "item",
  "ruleSource": "srd_core",
  "label": { "en": "Staff of Fire", "fr": "Bâton du feu" },
  "tags": ["item", "staff", "magic_item"],
  "equipmentSlot": "two_hands",
  "weightLbs": 5,
  "costGp": 18950,
  "resourcePoolTemplates": [
    {
      "poolId": "charges",
      "label": { "en": "Staff Charges", "fr": "Charges du bâton" },
      "maxPipelineId": "combatStats.staff_charges_max",
      "defaultCurrent": 50,
      "resetCondition": "never"
    }
  ],
  "staffSpells": [
    { "spellId": "spell_burning_hands", "chargeCost": 1 },
    { "spellId": "spell_fireball", "chargeCost": 2 },
    { "spellId": "spell_wall_of_fire", "chargeCost": 2 }
  ],
  "grantedModifiers": [],
  "grantedFeatures": []
}
```

### Wand vs. Staff vs. Scroll — Quick Reference

| Feature | Wand | Staff | Scroll |
|---|---|---|---|
| Spell data field | `wandSpell` | `staffSpells[]` | `scrollSpells[]` |
| Single-use? | ❌ (50 charges) | ❌ (50 charges) | ✅ consumed on use |
| `resourcePoolTemplates` needed? | ✅ | ✅ | ❌ |
| CL used | Item's fixed CL | Wielder's CL if higher | Item's fixed CL |
| `spellLevel` required? | No (unless heightened) | No (unless heightened) | ✅ Required |
| `spellType` required? | ❌ | ❌ | ✅ (`"arcane"` or `"divine"`) |
| Max spell level | 4th | Any | Any |

---

## 19. Conditions & Action Budgets

Conditions use `"category": "condition"`. They can add modifiers (AC penalty for being stunned) and restrict available actions via `actionBudget`.

```json
{
  "id": "condition_stunned",
  "category": "condition",
  "ruleSource": "srd_core",
  "label": { "en": "Stunned", "fr": "Étourdi" },
  "description": {
    "en": "A stunned creature drops everything held, can't take actions, takes a –2 penalty to AC, and loses its Dexterity bonus to AC (if any).",
    "fr": "Une créature étourdie lâche tout ce qu'elle tient, ne peut prendre aucune action, subit une pénalité de -2 à la CA et perd son bonus de Dextérité à la CA."
  },
  "tags": ["condition", "condition_stunned"],
  "actionBudget": {
    "standard": 0,
    "move": 0,
    "full_round": 0
  },
  "grantedModifiers": [
    {
      "id": "stunned_ac_penalty",
      "sourceId": "condition_stunned",
      "sourceName": { "en": "Stunned", "fr": "Étourdi" },
      "targetId": "combatStats.ac_normal",
      "value": -2,
      "type": "untyped"
    }
  ],
  "grantedFeatures": []
}
```

### Action Budget Reference Table

| Condition | `standard` | `move` | `full_round` | Notes |
|---|:---:|:---:|:---:|---|
| Normal | — | — | — | No field needed |
| Staggered | 1 | 1 | 0 | XOR enforced by UI (add `"action_budget_xor"` tag) |
| Disabled | 1 | 1 | 0 | Standard action costs 1 HP |
| Nauseated | 0 | 1 | 0 | Move only |
| Stunned | 0 | 0 | 0 | No actions |
| Cowering | 0 | 0 | 0 | No actions |
| Paralyzed | 0 | 0 | 0 | No actions |
| Fascinated | 0 | 0 | 0 | No actions |
| Dazed | 0 | 0 | 0 | No actions |

---

## 20. Environments & Global Auras

Environment features use `"category": "environment"`. They are injected into all characters by the GM via `sceneState.activeGlobalFeatures`.

```json
{
  "id": "environment_extreme_heat",
  "category": "environment",
  "ruleSource": "srd_core",
  "label": { "en": "Extreme Heat (140°F+)", "fr": "Chaleur extrême (60°C+)" },
  "description": {
    "en": "Characters in extreme heat suffer 1d6 nonlethal damage per minute. Fort DC 15 or also take 1d4 lethal.",
    "fr": "Les personnages en chaleur extrême subissent 1d6 dégâts non-létaux par minute. Vig DD 15 ou subissent également 1d4 dégâts létaux."
  },
  "tags": ["environment", "heat", "extreme_heat"],
  "grantedModifiers": [
    {
      "id": "extreme_heat_penalty",
      "sourceId": "environment_extreme_heat",
      "sourceName": { "en": "Extreme Heat", "fr": "Chaleur extrême" },
      "targetId": "saves.fortitude",
      "value": -4,
      "type": "untyped"
    }
  ],
  "grantedFeatures": []
}
```

Characters with the Endure Elements spell active can gate out environmental penalties using `conditionNode` checking for the relevant tag.

---

## 21. Configuration Tables

Config tables provide lookup data (XP thresholds, carrying capacity, etc.) using a **different structure** than Features — they use `tableId` instead of `id` + `category`.

```json
{
  "tableId": "config_xp_table",
  "ruleSource": "srd_core",
  "description": "Experience points required per character level",
  "data": [
    { "level": 1, "xpRequired": 0 },
    { "level": 2, "xpRequired": 1000 },
    { "level": 3, "xpRequired": 3000 },
    { "level": 4, "xpRequired": 6000 },
    { "level": 5, "xpRequired": 10000 }
  ]
}
```

Config tables can be placed inside any rule file alongside Features. By convention, the dedicated `00_d20srd_core_config_tables.json` (loaded first) holds the SRD core config tables. A table with the same `tableId` from a later file completely replaces the earlier version — place overrides in files with higher numbers.

**Engine-read config tables (complete list as of Phase 21):**

| `tableId` | Purpose | Annex |
|---|---|:---:|
| `config_xp_thresholds` | Level-up XP thresholds | B.1 |
| `config_carrying_capacity` | Load limits by STR score | B.2 |
| `config_point_buy_costs` | Point-buy stat cost table | B.3 |
| `config_ability_modifiers` | Score → modifier lookup | B.4 |
| `config_armor_speed_reduction` | Armored movement table | B.5 |
| `config_skill_synergies` | Auto-generated synergy bonus pairs | B.6 |
| `config_standard_array` | Standard-array values | B.7 |
| `config_size_categories` | Size modifier data | B.8 |
| `config_multiclass_penalty` | XP penalty thresholds | B.9 |
| `config_bonus_spells_per_day` | Bonus spell slots by ability mod | B.10 |
| `config_two_weapon_fighting` | TWF attack penalty matrix | B.11 |
| `config_encumbrance_effects` | Load penalty values | B.12 |
| `config_save_definitions` | Save pipeline → ability mapping + display config | B.13 |
| `config_weapon_defaults` | Default attack/damage ability IDs and two-handed multiplier | B.14 |
| `config_movement_defaults` | Default base values for speed pipelines | B.15 |
| `config_attribute_definitions` | Attribute labels + `isCastingAbility` flag | — |
| `config_skill_definitions` | Skill labels and key ability IDs | — |

---

## 22. The Override System — Homebrew & Variants

### File Priority (Loading Order)

Files are loaded alphabetically. Higher numbers win:

```
00_srd_core/00_races.json   ← Loaded first (lowest priority)
00_srd_core/01_classes.json
50_homebrew/00_custom.json  ← Loaded last (highest priority)
```

### Full Override (Default)

When a file defines a Feature with the same `id` as a previously loaded Feature, the new one completely replaces the old one. This is the default behavior (`"merge": "replace"` or simply absent).

### Partial Override (`"merge": "partial"`)

With `"merge": "partial"`, you can modify only specific parts of an existing Feature without rewriting the whole thing.

**Example — Winter Circle Druid (removes Wild Shape, adds Ice Form):**

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

### Partial Merge Rules

| Array field | Effect |
|---|---|
| `tags`, `grantedFeatures`, `grantedModifiers`, `classSkills` | Items are added. Items prefixed `-` are removed. |
| `levelProgression` | Merged by `level` key (same level → replaces that entry). |
| `choices` | Merged by `choiceId`. |
| Scalars (`label`, `description`, etc.) | Overwrite only if defined in the partial. |
| `prerequisitesNode` | Full override. |
| `id`, `category` | Immutable (cannot be changed). |

### Removing Array Elements

Prefix any array element with `-` to remove it:

```json
"grantedFeatures": [
  "-class_feature_druid_wild_shape",   ← Remove Wild Shape
  "class_feature_ice_form"              ← Add Ice Form
]
```

---

## 23. Localization (i18n)

### Language Declarations

Languages are **automatically discovered** by the engine. You do not need to declare anything to make a language appear in the sidebar dropdown — simply add the language key to any `label` or `description` field and the engine will detect it.

The optional `supportedLanguages` array in the file wrapper is a documentation hint:

```json
{
  "supportedLanguages": ["en", "fr"],
  "entities": [ ... ]
}
```

**How discovery works:** The engine (`DataLoader`) runs `scanEntityForLanguages()` on every entity it processes, regardless of source (rule files, campaign homebrew, GM global overrides). The function recursively inspects every field for `LocalizedString` objects — plain objects whose every key is a BCP-47 code and every value is a string — and registers each key as an available language. This covers:
- Static rule files in `static/rules/`
- Global homebrew files in `storage/rules/`
- Campaign homebrew entities saved via the **Campaign Editor** (`campaigns.homebrew_rules_json`)
- GM global overrides

The `supportedLanguages` array, when present, provides a fast-path registration before entity scanning begins. Both paths feed `getAvailableLanguages()`, which drives the language selector dropdown. Any language code discovered via either path will appear as an option — even if the UI chrome strings do not have a built-in translation for that code (they fall back to English gracefully).

**Language code format — BCP-47 (all-lowercase hyphenated):**

Codes follow the IETF BCP-47 standard in all-lowercase form:
- Base language: `"en"`, `"fr"`, `"de"`, `"es"`
- Regional variant: `"en-gb"`, `"fr-be"`, `"fr-fr"`, `"pt-br"`, `"en-au"`

Why lowercase hyphenated? Consistent, unambiguous on case-sensitive file systems, and matches the de-facto web convention. **Not** `"en_GB"` (ICU/Java) or `"enGB"` (camelCase).

`"en"` is **US English by default** — it is the universal engine fallback and is always bundled. To provide British English overrides, create `en-gb.json`; to provide Belgian French overrides, create `fr-be.json`. Anything not in the regional file falls back to the base language, then to English.

**Fallback chain for `t()` (BCP-47 aware string resolution):**
1. Exact language code (`textObj["fr-be"]` — most specific)
2. Base language code (`textObj["fr"]` — if step 1 not found and code has a region tag)
3. English (`textObj["en"]` — universal fallback)
4. First available key in the object
5. `"??"` (sentinel — visually flags a completely missing translation)

Example: campaign set to `"fr-be"` (Belgian French):
- Key with `"fr-be"`: uses the Belgian override
- Key with only `"fr"`: falls back to generic French
- Key with only `"en"`: falls back to English
- Key absent entirely: `"??"` sentinel

### Providing Translations

Provide `label` and `description` in every language you want to support:

```json
"label": {
  "en":    "Power Attack",
  "fr":    "Attaque en puissance",
  "fr-be": "Attaque puissante",
  "es":    "Ataque poderoso",
  "pt-br": "Ataque Poderoso"
}
```

English is **always required** — it is the universal fallback. Other languages are optional; provide as many as you like. Each one you add is automatically discovered by the engine and appears in the language dropdown.

**Regional variants inherit from the base language.** If a player selects `"fr-be"` but a specific feature only provides `"fr"`, the French translation is shown automatically. You do **not** need to duplicate `"fr"` content into `"fr-be"` — only provide `"fr-be"` keys for strings that genuinely differ from generic French.

**Built-in UI chrome languages:**

`SUPPORTED_UI_LANGUAGES` contains **only English** — it is the one language that has no server-side locale file and is always available. All other languages, including French, are runtime-discovered locale files:

| Code | Language | UI chrome fully translated | Unit system | How it ships |
|---|---|:---:|---|---|
| `"en"` | English | ✅ (bundled in `ui-strings.ts`) | `imperial` (ft., lb.) | Compile-time baseline |
| `"fr"` | French | ✅ (`fr.json` — 1 900+ keys) | `metric` (m, kg) | `static/locales/fr.json` |
| Other codes | Community | ❌ (falls back to English) | `imperial` (default) | Drop `{code}.json` in `static/locales/` |

To add a new language: create `static/locales/{code}.json` with a valid `$meta` block and translated strings. No code change is required. The language appears in the dropdown on next server load.

### UI Chrome Locale Files

**Two separate translation systems exist in Character Vault:**

| System | What it translates | Where it lives | Format |
|---|---|---|---|
| **Rule content** | `label`, `description` on Features | JSON rule files (`static/rules/`) | `LocalizedString` objects |
| **UI chrome** | Buttons, labels, navigation, error messages | Locale files (`static/locales/`) | Flat JSON key-value file |

**UI chrome locale files** live at `static/locales/{code}.json`. French ships with the app as `static/locales/fr.json`. Community translators can contribute by dropping additional locale files in the same directory.

#### Locale file format

```json
{
  "$meta": {
    "language":    "Français",
    "code":        "fr",
    "countryCode": "fr",
    "unitSystem":  "metric",
    "author":      "Character Vault core team",
    "version":     1,
    "notes":       "Traduction française officielle."
  },

  "login.title":      "Connectez-vous pour continuer",
  "login.username":   "Identifiant",
  "nav.campaigns":    "Campagnes",
  "combat.hp.title":  "Points de vie",

  "settings.rule_sources.files": {
    "one":   "1 fichier",
    "other": "{n} fichiers"
  }
}
```

**Key rules:**

| Rule | Detail |
|---|---|
| `$meta` block | Required. Declares `language` (self-name — see **Native name convention** below), `code` (BCP-47 all-lowercase, e.g. `"fr"`, `"fr-be"`), `countryCode` (ISO 3166-1 alpha-2 — **mandatory**, used for the country flag), `unitSystem` (`"imperial"` or `"metric"`). The engine strips `$meta` before caching. **Locale files missing `countryCode` are skipped by the server and will not appear in the dropdown.** |
| Simple strings | Plain key-value pairs. `{placeholder}` syntax for variable substitution (caller does `.replace('{x}', value)`). |
| Plural strings | Object with CLDR plural category keys (`one`, `other`, and optionally `few`, `many`, `zero`). Use `uiN(key, count, lang)` at the call site. |
| `{n}` in plurals | Replaced with the count value by `uiN()`. |
| Fallback | Any key absent from the locale file falls back to the English baseline in `UI_STRINGS`. UI never breaks from a missing translation. |

#### Native name convention (`$meta.language`)

The `language` field is the self-name of the language — written **in the language itself**, never in English or as an abbreviation.

**Base languages** — the language name only:
```json
{ "$meta": { "code": "de", "language": "Deutsch", "countryCode": "de", "unitSystem": "metric" } }
{ "$meta": { "code": "es", "language": "Español", "countryCode": "es", "unitSystem": "metric" } }
```

**Regional variants** — `"<language name> (<full country name in that language>)"`.  
The country name is written **in full**, **in the same language as the entry**, never as an ISO 3166 abbreviation:

```json
{ "$meta": { "code": "fr-be", "language": "Français (Belgique)",      "countryCode": "be", "unitSystem": "metric"   } }
{ "$meta": { "code": "fr-ch", "language": "Français (Suisse)",         "countryCode": "ch", "unitSystem": "metric"   } }
{ "$meta": { "code": "fr-ca", "language": "Français (Canada)",         "countryCode": "ca", "unitSystem": "metric"   } }
{ "$meta": { "code": "en-gb", "language": "English (United Kingdom)",  "countryCode": "gb", "unitSystem": "imperial" } }
{ "$meta": { "code": "en-au", "language": "English (Australia)",       "countryCode": "au", "unitSystem": "imperial" } }
{ "$meta": { "code": "de-at", "language": "Deutsch (Österreich)",      "countryCode": "at", "unitSystem": "metric"   } }
{ "$meta": { "code": "de-ch", "language": "Deutsch (Schweiz)",         "countryCode": "ch", "unitSystem": "metric"   } }
{ "$meta": { "code": "pt-br", "language": "Português (Brasil)",        "countryCode": "br", "unitSystem": "metric"   } }
{ "$meta": { "code": "nl-be", "language": "Nederlands (België)",       "countryCode": "be", "unitSystem": "metric"   } }
{ "$meta": { "code": "it-ch", "language": "Italiano (Svizzera)",       "countryCode": "ch", "unitSystem": "metric"   } }
```

❌ **Never** use ISO abbreviations in the name:
- `"Français (BE)"` — wrong; "BE" is not a French word
- `"English (GB)"` — wrong; use "United Kingdom"
- `"Deutsch (AT)"` — wrong; use "Österreich"

The `countryCode` field is **always** the ISO 3166-1 alpha-2 code in lowercase.  
For regional variants, use the **region part** of the BCP-47 tag: `"fr-be"` → `"be"`, `"en-gb"` → `"gb"`.

#### Loading mechanism

Locale files are loaded lazily via `GET /api/locales` (served by `UiLocalesController.php`). The endpoint returns an array of `{ code, language, countryCode, unitSystem }` descriptors — only files with a valid `countryCode` are included. `DataLoader.loadExternalLocales()` calls this at app startup and registers each code in the language dropdown.

The `ui(key, lang)` function resolves strings:
1. Loaded locale for `lang` (if the locale file was fetched)
2. English baseline in `UI_STRINGS` (always available, bundled at build time)
3. The raw key itself (fallback sentinel — logs a `console.warn`)

The `uiN(key, count, lang)` function resolves plurals using `Intl.PluralRules` for automatic CLDR plural category selection.

#### Adding a community locale

1. Create `static/locales/{code}.json` with the `$meta` block and translations.
   - Use **all-lowercase BCP-47** format: `"fr"`, `"de"`, `"en-gb"`, `"fr-be"`.
   - `$meta.countryCode` is **mandatory** (ISO 3166-1 alpha-2). Files without it are skipped by the server.
   - `$meta.countryCode` drives the flag icon in `ThemeLanguagePicker`. For regional variants, use the **region part** of the tag: `"en-gb"` → `"countryCode": "gb"`, `"fr-be"` → `"countryCode": "be"`.
   - Examples:
     - German: `"code": "de", "countryCode": "de"`
     - British English: `"code": "en-gb", "countryCode": "gb"`
     - Belgian French: `"code": "fr-be", "countryCode": "be"`
2. **Regional variants only need to include keys that differ from the base language.** For `fr-be.json`, only add keys that differ from `fr.json`. The fallback chain (`fr-be → fr → en`) handles the rest automatically.
3. Deploy the file to the server — no code change required.
4. On the next page load, `GET /api/locales` returns it and the language (with its flag) appears in the dropdown.
5. Any UI key without a translation silently falls back to the base language, then to English.

#### Fallback chain for UI chrome (`ui()` function)

```
ui("combat.hp.title", "fr-be")
  → tries fr-be.json for "combat.hp.title"   [override for Belgian French]
  → not found → tries fr.json for that key   [generic French]
  → not found → uses UI_STRINGS["combat.hp.title"]  [English baseline]
  → not found → returns key as fallback sentinel (logs console.warn)
```

This means `fr-be.json` only needs entries that **differ** from `fr.json`. A minimal `fr-be.json` with just the `$meta` block is valid — all strings will fall back to French gracefully.

#### Testing locale behavior

In Vitest, use the `loadUiLocaleFromObject(code, translations)` helper (exported from `ui-strings.ts`) to inject locale data without an HTTP fetch:

```typescript
import { loadUiLocaleFromObject, ui } from '$lib/i18n/ui-strings';

loadUiLocaleFromObject('it', { 'combat.hp.title': 'Punti ferita' });
expect(ui('combat.hp.title', 'it')).toBe('Punti ferita');
```

### Unit Conversion

All rule values are stored in **imperial units** (feet, pounds). The display layer converts automatically based on the **unit system** of the active language:

| Unit system | Languages | Distance | Weight |
|---|---|---|---|
| `imperial` | `en` and unknown codes | feet (×1) | pounds (×1) |
| `metric` | `fr` | metres (×0.3) | kilograms (×0.5) |

The mapping from language code to unit system is defined in `LANG_UNIT_SYSTEM` (built from `SUPPORTED_UI_LANGUAGES`). Community language codes not in that map default to `imperial`.

In description text, use `{@path|distance}` or `{@path|weight}` pipes for automatic unit display:

```json
"description": {
  "en": "Speed: {@combatStats.speed_land.totalValue|distance}",
  "fr": "Vitesse : {@combatStats.speed_land.totalValue|distance}"
}
```
→ English output: "Speed: 30 ft."  
→ French output: "Vitesse : 9 m"

---

## 24. Complete Reference Tables

### Full `ModifierType` Reference

| Type | Stacks | Rule |
|---|---|---|
| `"base"` | ✅ | Core class progression; always additive |
| `"untyped"` | ✅ | No named type; always additive |
| `"dodge"` | ✅ | SRD exception — always stacks |
| `"circumstance"` | ✅ | Always stacks |
| `"synergy"` | ✅ | Skill synergy; auto-generated |
| `"racial"` | ❌ | Highest wins within type |
| `"enhancement"` | ❌ | Highest wins |
| `"morale"` | ❌ | Highest wins |
| `"luck"` | ❌ | Highest wins |
| `"insight"` | ❌ | Highest wins |
| `"sacred"` | ❌ | Highest wins |
| `"profane"` | ❌ | Highest wins |
| `"armor"` | ❌ | Highest wins |
| `"shield"` | ❌ | Highest wins |
| `"natural_armor"` | ❌ | Highest wins |
| `"deflection"` | ❌ | Highest wins |
| `"competence"` | ❌ | Highest wins |
| `"size"` | ❌ | Highest wins |
| `"inherent"` | ❌ | Highest wins; stacks with all other types |
| `"resistance"` | ❌ | Highest wins |
| `"setAbsolute"` | — | Forces exact value; last wins |
| `"damage_reduction"` | — | Best-wins per bypass-tag group |
| `"max_dex_cap"` | — | Minimum wins (most restrictive) |
| `"multiplier"` | — | Highest-impact wins; applied after additive sum |

### All `@`-Path Math Parser References

| Path | Returns |
|---|---|
| `@attributes.<id>.totalValue` | Ability score total |
| `@attributes.<id>.derivedModifier` | `floor((total - 10) / 2)` |
| `@attributes.<id>.baseValue` | Base value before modifiers |
| `@skills.<id>.ranks` | Ranks invested |
| `@skills.<id>.totalValue` | Total skill check value |
| `@combatStats.<id>.totalValue` | Combat stat total |
| `@saves.<id>.totalValue` | Save total |
| `@characterLevel` | Sum of all class levels |
| `@eclForXp` | Character level + level adjustment |
| `@classLevels.<classId>` | Level in specific class |
| `@activeTags` | Array of all active tags |
| `@equippedWeaponTags` | Tags of equipped weapon |
| `@selection.<choiceId>` | Player's choice selection |
| `@constant.<id>` | Named constant from config |
| `@targetTags` | Target's tags (roll-time only) |
| `@eclForXp` | Character level + level adjustment (use ONLY for XP table lookups) |
| `@master.classLevels.<id>` | Master's class level (animal companions / familiars only) |
| `@master.attributes.<id>.derivedModifier` | Master's ability modifier (linked entities only) |

### Feature Categories Quick Reference

| Category | Used For | Key Extra Fields |
|---|---|---|
| `"race"` | Racial traits | — |
| `"class"` | Classes | `levelProgression`, `classSkills`, `recommendedAttributes` |
| `"class_feature"` | Class abilities | `activation`, `resourcePoolTemplates` |
| `"feat"` | Feats | `prerequisitesNode`, `choices` |
| `"domain"` | Cleric domains | `classSkills` |
| `"deity"` | Deities | — |
| `"magic"` | Spells & powers | `magicType`, `school`, `spellLists`, `augmentations` |
| `"item"` | All equipment | `equipmentSlot`, `weightLbs`, `costGp`, `weaponData`, `armorData` |
| `"condition"` | Status effects | `actionBudget` |
| `"monster_type"` | Creature types | — |
| `"environment"` | Ambient effects | — |

### `FeatureChoice.optionsQuery` Reference

| Query | Selects |
|---|---|
| `"tag:weapon"` | All Features tagged `weapon` |
| `"tag:weapon+tag:martial"` | All Features tagged both `weapon` AND `martial` |
| `"category:feat"` | All feats |
| `"category:domain"` | All domains |
| `"discipline:telepathy"` | All telepathy psionic powers |
| `"discipline:clairsentience+level:3"` | Level 3 clairsentience powers |

### Canonical Save IDs

| ID | Do NOT use |
|---|---|
| `saves.fortitude` | `saves.fortitude`, `saves.save_fort` |
| `saves.reflex` | `saves.reflex`, `saves.save_ref` |
| `saves.will` | `saves.save_will` |
| `saves.all` | Broadcasts to all three saves |

---

_For AI-assisted migration from PCGen, Hero Lab, d20 SRD HTML/PDF, and other sources, see [`AI_MIGRATION_GUIDE.md`](AI_MIGRATION_GUIDE.md)._
