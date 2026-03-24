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
    00_d20srd_core_races.json       ← Loaded first (lowest priority)
    01_d20srd_core_classes.json
    02_d20srd_core_class_features.json
    03_d20srd_core_feats.json
    05_d20srd_core_spells.json
    06_d20srd_core_equipment_weapons.json
    07_d20srd_core_equipment_armor.json
    09_d20srd_core_config.json
  50_homebrew_my_setting/
    00_my_custom_races.json         ← Loaded last (highest priority)
  config_tables.json
  manifest.json
```

**Naming convention:** `NN_rule_source_name/NN_rule_source_name_content_type.json`

Each rule file is a **JSON array** containing Feature objects (and optionally config tables). A single file can mix races, feats, and items freely.

```json
[
  { "id": "race_orc", "category": "race", ... },
  { "id": "feat_power_attack", "category": "feat", ... },
  { "id": "item_greataxe", "category": "item", ... }
]
```

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
| `id` | `string` | ✅ | Unique identifier. Use `kebab-case` with category prefix. |
| `category` | `string` | ✅ | What kind of Feature this is. See [category table](#featurecategory-values). |
| `ruleSource` | `string` | ✅ | Which rules module this belongs to (e.g., `"srd_core"`, `"homebrew_mymod"`). Used for filtering. |
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

IDs are **globally unique** kebab-case strings. Use the category as the prefix:

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
| Modifier | `mod_` | `mod_barbarian_rage_str`, `mod_power_attack_penalty` |
| Config table | `config_` | `config_xp_table`, `config_carrying_capacity` |

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
| `heavy_load` / `medium_load` | Encumbrance condition | Auto-injected by engine |
| `spellcaster` | Has spellcasting | Used in prestige class prerequisites |
| `caster_ability_STAT` | Casting stat identifier | `caster_ability_stat_int`, `caster_ability_stat_wis` |
| `condition_NAME` | Active condition | `condition_stunned`, `condition_raging` |
| `extraordinary` / `supernatural` / `spell_like` | Ability type | For SR/PR checks |
| `sys_` | System-wide global modifier | `sys_immune_mind_affecting`, `sys_roll_maximize_damage` |

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
| `situationalContext` | `string` | ❌ | Roll-time tag: modifier goes to `situationalModifiers` and only fires when this string is in the roll's target tags. |
| `drBypassTags` | `string[]` | ❌ | **Only for `type: "damage_reduction"`** — materials that bypass this DR. |

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
| `"inherent"` | ❌ Highest wins | Permanent (tomes, wish, miracle). Stacks with all other types. |
| `"resistance"` | ❌ Highest wins | Resistance bonus to saves (Cloak of Resistance). |
| `"setAbsolute"` | Special | Forces pipeline to exact value. Last one wins. |
| `"damage_reduction"` | Special | Best-wins per bypass-tag group. See Section 16. |
| `"max_dex_cap"` | Special | Minimum wins (most restrictive cap). See Section 16. |
| `"multiplier"` | Special | Highest-impact multiplier wins. Applied after all additive bonuses. |

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
| `attributes.stat_str` or `stat_str` | Strength |
| `attributes.stat_dex` or `stat_dex` | Dexterity |
| `attributes.stat_con` or `stat_con` | Constitution |
| `attributes.stat_int` or `stat_int` | Intelligence |
| `attributes.stat_wis` or `stat_wis` | Wisdom |
| `attributes.stat_cha` or `stat_cha` | Charisma |
| `attributes.stat_size` | Size modifier pipeline |
| `attributes.stat_caster_level` | Arcane/divine caster level |
| `attributes.stat_manifester_level` | Psionic manifester level |
| `attributes.skill_points_per_level` | Skill points per level (class declares its own) |
| `attributes.bonus_skill_points_per_level` | Bonus SP/level (human racial) |
| `attributes.bonus_feat_slots` | Extra feat slots (human racial) |

#### Saving Throws (`saves.*`)

| Target ID | Save | Ability |
|---|---|---|
| `saves.fort` | Fortitude | CON |
| `saves.ref` | Reflex | DEX |
| `saves.will` | Will | WIS |
| `saves.all` | **All three** (fan-out broadcast) | — |

> Using `saves.all` automatically creates three copies targeting `saves.fort`, `saves.ref`, and `saves.will`. Use this for bonuses like Resistance or Luck that apply to all saves simultaneously.

#### Combat Statistics (`combatStats.*`)

| Target ID | Statistic |
|---|---|
| `combatStats.bab` | Base Attack Bonus |
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
| `combatStats.max_dex_bonus` | Maximum DEX bonus to AC |
| `combatStats.armor_check_penalty` | Armor Check Penalty |
| `combatStats.arcane_spell_failure` | Arcane Spell Failure % |
| `combatStats.fortification` | Fortification % (crit negation) |
| `combatStats.hit_die_type` | Hit die type (d6, d8, d10, d12) |

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
| … | _All skill IDs follow `skill_` prefix + snake_case name_ |

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
| `@attributes.stat_str.totalValue` | Strength's total score |
| `@attributes.stat_str.derivedModifier` | STR modifier = `floor((STR - 10) / 2)` |
| `@attributes.stat_str.baseValue` | Base STR before modifiers |
| `@skills.skill_tumble.ranks` | Ranks invested in Tumble |
| `@skills.skill_tumble.totalValue` | Total Tumble check value |
| `@combatStats.bab.totalValue` | Current BAB total |
| `@combatStats.speed_land.totalValue` | Land speed in feet |
| `@saves.fort.totalValue` | Fortitude save total |
| `@characterLevel` | Sum of all class levels |
| `@classLevels.class_rogue` | Level in a specific class |
| `@activeTags` | Array of all currently active tags |
| `@equippedWeaponTags` | Tags of the currently equipped weapon |
| `@selection.CHOICE_ID` | Player's choice for a `FeatureChoice` |
| `@constant.NAME` | Named constant from config tables |

### Formula Examples

```json
{ "value": "@attributes.stat_wis.derivedModifier" }
```
→ Uses the WIS modifier as the value (Monk AC bonus)

```json
{ "value": "floor(@classLevels.class_soulknife / 4)d8" }
```
→ Psychic Strike dice: 1d8 at level 4, 2d8 at level 8, etc.

```json
{ "value": "1d12 + floor(@attributes.stat_str.derivedModifier * 1.5)" }
```
→ Two-handed weapon damage (1.5× STR modifier)

```json
{ "value": "3 + @attributes.stat_con.derivedModifier" }
```
→ Barbarian Rage duration in rounds

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
{
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
| `"has_tag"` | `@activeTags` contains tag | tag string |
| `"missing_tag"` | `@activeTags` does not contain | tag string |

### Common `targetPath` Values

| Path | Checks |
|---|---|
| `@activeTags` | Active tag list (use with `has_tag` / `missing_tag`) |
| `@attributes.stat_str.totalValue` | Strength score (use with `>=`) |
| `@attributes.stat_dex.totalValue` | Dexterity score |
| `@attributes.stat_caster_level.totalValue` | Caster level |
| `@skills.skill_tumble.ranks` | Skill ranks |
| `@characterLevel` | Total character level |
| `@classLevels.class_fighter` | Fighter class level |
| `@equippedWeaponTags` | Equipped weapon tags |

### Tutorial — Prerequisite: Power Attack (STR 13+)

```json
"prerequisitesNode": {
  "logic": "CONDITION",
  "targetPath": "@attributes.stat_str.totalValue",
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
          "value": "armor_heavy",
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
      "targetId": "attributes.stat_con",
      "value": 2,
      "type": "racial"
    },
    {
      "id": "dwarf_cha_penalty",
      "sourceId": "race_dwarf",
      "sourceName": { "en": "Dwarf", "fr": "Nain" },
      "targetId": "attributes.stat_cha",
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
  "recommendedAttributes": ["stat_str", "stat_con"],
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
          "targetId": "combatStats.bab",
          "value": 1, "type": "base"
        },
        {
          "id": "fight_1_fort",
          "sourceId": "class_fighter",
          "sourceName": { "en": "Fighter 1", "fr": "Guerrier 1" },
          "targetId": "saves.fort",
          "value": 2, "type": "base"
        },
        {
          "id": "fight_1_ref",
          "sourceId": "class_fighter",
          "sourceName": { "en": "Fighter 1", "fr": "Guerrier 1" },
          "targetId": "saves.ref",
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
          "targetId": "combatStats.bab",
          "value": 1, "type": "base"
        },
        {
          "id": "fight_2_fort",
          "sourceId": "class_fighter",
          "sourceName": { "en": "Fighter 2", "fr": "Guerrier 2" },
          "targetId": "saves.fort",
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
          "targetId": "combatStats.bab",
          "value": 1, "type": "base"
        },
        {
          "id": "fight_3_fort",
          "sourceId": "class_fighter",
          "sourceName": { "en": "Fighter 3", "fr": "Guerrier 3" },
          "targetId": "saves.fort",
          "value": 1, "type": "base"
        }
      ]
    }
  ]
}
```

> **At level 3:** BAB = 1+1+1 = **+3**, Fort = 2+1+1 = **+4**, Ref = 0, Will = 0 — exactly matching the SRD Fighter table.

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
  "tags": ["class_feature", "barbarian", "extraordinary"],
  "activation": {
    "actionType": "free",
    "resourceCost": {
      "targetId": "resources.barbarian_rage_uses",
      "cost": 1
    }
  },
  "grantedModifiers": [
    {
      "id": "rage_str",
      "sourceId": "class_feature_barbarian_rage",
      "sourceName": { "en": "Rage", "fr": "Furie" },
      "targetId": "attributes.stat_str",
      "value": 4,
      "type": "morale",
      "conditionNode": {
        "logic": "CONDITION",
        "targetPath": "@activeTags",
        "operator": "has_tag",
        "value": "condition_raging"
      }
    },
    {
      "id": "rage_con",
      "sourceId": "class_feature_barbarian_rage",
      "sourceName": { "en": "Rage", "fr": "Furie" },
      "targetId": "attributes.stat_con",
      "value": 4,
      "type": "morale",
      "conditionNode": {
        "logic": "CONDITION",
        "targetPath": "@activeTags",
        "operator": "has_tag",
        "value": "condition_raging"
      }
    },
    {
      "id": "rage_will",
      "sourceId": "class_feature_barbarian_rage",
      "sourceName": { "en": "Rage", "fr": "Furie" },
      "targetId": "saves.will",
      "value": 2,
      "type": "morale",
      "conditionNode": {
        "logic": "CONDITION",
        "targetPath": "@activeTags",
        "operator": "has_tag",
        "value": "condition_raging"
      }
    },
    {
      "id": "rage_ac_penalty",
      "sourceId": "class_feature_barbarian_rage",
      "sourceName": { "en": "Rage Penalty", "fr": "Pénalité de furie" },
      "targetId": "combatStats.ac_normal",
      "value": -2,
      "type": "untyped",
      "conditionNode": {
        "logic": "CONDITION",
        "targetPath": "@activeTags",
        "operator": "has_tag",
        "value": "condition_raging"
      }
    }
  ],
  "grantedFeatures": []
}
```

The class resource pool for Rage uses maximum formula; add this to the class's `grantedModifiers`:

```json
{
  "id": "barbarian_rage_pool_max",
  "sourceId": "class_barbarian",
  "sourceName": { "en": "Barbarian Rage", "fr": "Furie barbare" },
  "targetId": "resources.barbarian_rage_uses.maxValue",
  "value": "1 + floor(@characterLevel / 4)",
  "type": "base"
}
```

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

### `FeatureChoice.optionsQuery` Formats

| Format | Meaning |
|---|---|
| `"tag:weapon"` | All Features with the `"weapon"` tag |
| `"tag:weapon+tag:martial"` | Features with BOTH `"weapon"` AND `"martial"` tags |
| `"category:domain"` | All Features of category `"domain"` |
| `"discipline:telepathy"` | All psionic powers in the telepathy discipline |

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
| `list_domain_NAME` | Domain spell list (e.g., `list_domain_fire`) |
| `list_psion_wilder` | Psion/Wilder (psionic) |
| `list_psychic_warrior` | Psychic Warrior (psionic) |

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
| `onCritDice` | `object` | On-crit burst dice (Flaming Burst, etc.) — see Section 17 |

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
      "targetId": "combatStats.max_dex_bonus",
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
| `maxDex` | Display value (engine uses `combatStats.max_dex_bonus` modifier) |
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

| `drBypassTags` Value | D&D 3.5 Notation |
|---|---|
| `[]` | DR X/— (nothing bypasses) |
| `["magic"]` | DR X/magic |
| `["silver"]` | DR X/silver |
| `["cold_iron"]` | DR X/cold iron |
| `["good"]` | DR X/good |
| `["epic"]` | DR X/epic |
| `["magic", "silver"]` | DR X/magic AND silver (both required) |

**For class progression DR (Barbarian)**, use `"type": "base"` (additive) instead of `"damage_reduction"`:

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
      "targetId": "attributes.stat_str",
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
      "targetId": "saves.fort",
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

Config tables can be placed inside any rule file alongside Features, or in the dedicated `config_tables.json` file. A table with the same `tableId` from a later file completely replaces the earlier version.

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

All `label` and `description` fields must provide values for all supported languages.

```json
"label": {
  "en": "Power Attack",
  "fr": "Attaque en puissance"
}
```

**Supported languages:** `"en"` (English), `"fr"` (French)

All rule values are stored in **imperial units** (feet, pounds). The display layer converts automatically:
- French: meters (`0.3 × feet`), kilograms (`0.5 × pounds`)
- English: feet, pounds (no conversion)

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
| `@master.classLevels.<id>` | Master's class level (linked entities only) |

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
| `saves.fort` | `saves.fortitude`, `saves.save_fort` |
| `saves.ref` | `saves.reflex`, `saves.save_ref` |
| `saves.will` | `saves.save_will` |
| `saves.all` | Broadcasts to all three saves |

---

_For AI-assisted migration from PCGen, Hero Lab, d20 SRD HTML/PDF, and other sources, see [`AI_MIGRATION_GUIDE.md`](AI_MIGRATION_GUIDE.md)._
