# Character Vault — AI Migration Guide

_Mass-Converting D&D 3.5 Content from PCGen, Hero Lab, HTML, PDF, and Other Sources_

---

## Who Is This Document For?

This document is written **primarily for AI agents** performing bulk data conversion from:
- PCGen `.lst` files (races, classes, feats, spells, equipment)
- Hero Lab community data sets (d20 XML format)
- The d20 SRD HTML mirror (`d20srd.org`)
- PDF rulebooks (Monster Manual, Spell Compendium, etc.)
- Any other structured or semi-structured source an AI can decompose

It assumes you have already read [`CONTENT_AUTHORING_GUIDE.md`](CONTENT_AUTHORING_GUIDE.md), which defines every field and all game engine rules. **This document is a conversion protocol, not a schema reference.**

---

## Table of Contents

1. [Migration Protocol — How to Approach a Conversion Task](#1-migration-protocol--how-to-approach-a-conversion-task)
2. [Validation Checklist](#2-validation-checklist)
3. [Decision Tree — Which Feature Category?](#3-decision-tree--which-feature-category)
4. [Converting Races](#4-converting-races)
5. [Converting Classes and Prestige Classes](#5-converting-classes-and-prestige-classes)
6. [Converting Class Features](#6-converting-class-features)
7. [Converting Feats](#7-converting-feats)
8. [Converting Spells and Psionic Powers](#8-converting-spells-and-psionic-powers)
9. [Converting Equipment (Weapons, Armor, Gear)](#9-converting-equipment-weapons-armor-gear)
10. [Converting Magic Items](#10-converting-magic-items)
11. [Converting Monsters and NPCs](#11-converting-monsters-and-npcs)
12. [Converting Conditions](#12-converting-conditions)
13. [Handling Prerequisites — Mapping to LogicNode](#13-handling-prerequisites--mapping-to-logicnode)
14. [Stacking Rules — Mapping Bonus Types from Source Material](#14-stacking-rules--mapping-bonus-types-from-source-material)
15. [Common Patterns and Anti-Patterns](#15-common-patterns-and-anti-patterns)
16. [PCGen LST Format — Field Mapping Reference](#16-pcgen-lst-format--field-mapping-reference)
17. [d20 SRD HTML — Extraction Heuristics](#17-d20-srd-html--extraction-heuristics)
18. [ID Collision and Deduplication Strategy](#18-id-collision-and-deduplication-strategy)
19. [Bilingual Output — Translation Guidelines](#19-bilingual-output--translation-guidelines)
20. [When to Stop and Ask](#20-when-to-stop-and-ask)

---

## 1. Migration Protocol — How to Approach a Conversion Task

Follow these steps for every batch of entities you convert:

### Step 1 — Read Context Files

Before converting **anything**, read:
1. `ARCHITECTURE.md` — For TypeScript interfaces, engine rules, modifier stacking, and pipeline semantics
2. `CONTENT_AUTHORING_GUIDE.md` — For complete field references, examples, and canonical ID tables
3. `ANNEXES.md` — For additional complete worked JSON examples (races, full 20-level classes, spells, psionic powers, magic items, environments)
4. This document (AI_MIGRATION_GUIDE.md) — For conversion protocols

### Step 2 — Identify the Entity Type

Use the Decision Tree in Section 3 to determine the `category` value. This determines which fields are required and which patterns apply.

### Step 3 — Extract Data from Source

For each entity in the source material, extract:
- **Name/ID** → `label` and `id`
- **Description/flavor text** → `description`
- **Numeric bonuses** → `grantedModifiers`
- **Prerequisite requirements** → `prerequisitesNode`
- **Special abilities** → `grantedFeatures` or additional modifiers
- **Active ability details** → `activation` and `resourcePoolTemplates`
- **Rules text that cannot be modeled** → goes into `description` as verbose text

### Step 4 — Build JSON

Follow the field-by-field mapping tables in sections 4–12. When a source field has no direct mapping, model it as a `description` text rather than inventing engine fields.

Every output file must use the metadata wrapper format with a `supportedLanguages` declaration:
```json
{
  "supportedLanguages": ["en"],
  "entities": [ ... ]
}
```
Add `"fr"` (or other codes) to `supportedLanguages` only when you are also providing those translations in every `label` and `description` field. See Section 19 for full guidelines.

### Step 5 — Run the Validation Checklist

Use Section 2 before committing any output.

### Step 6 — Report Blockers Immediately

If any rule cannot be modeled, is ambiguous, or requires an architectural decision, **STOP** and report the blocker. Do not invent workarounds or skip the entity silently.

---

## 2. Validation Checklist

Run this checklist on **every** converted entity before writing the output file:

### Schema Validation

- [ ] `id` is present and follows `snake_case` with category prefix (e.g., `"race_elf"`, `"feat_power_attack"`) — never use hyphens
- [ ] `category` matches one of the 11 valid values
- [ ] `ruleSource` is present and matches the source module ID
- [ ] `label` has at least `"en"` value (never empty string); add `"fr"` if the file declares `"fr"` in `supportedLanguages`
- [ ] `description` has at least `"en"` value; add `"fr"` if the file declares `"fr"` in `supportedLanguages`
- [ ] `tags` array is present and includes at least the self-referencing ID tag
- [ ] `grantedModifiers` is present (can be `[]`)
- [ ] `grantedFeatures` is present (can be `[]`)
- [ ] Every modifier has `id`, `sourceId`, `sourceName`, `targetId`, `value`, `type`
- [ ] No modifier's `id` collides with another modifier in the same Feature

### Semantic Validation

- [ ] All `targetId` values are canonical pipeline IDs (not invented names)
- [ ] `targetId` for saves uses `saves.fortitude` / `saves.reflex` / `saves.will` (not `saves.fort` / `saves.ref` etc.)
- [ ] Speed modifiers use `"combatStats.speed_land"` (not `"attributes.speed_land"` for formula paths)
- [ ] `type: "base"` is used ONLY for class progression (BAB, saves, CL increments) and race base speed — not for generic bonuses
- [ ] Racial ability score modifiers use `"type": "racial"` (not `"type": "untyped"`)
- [ ] Enhancement bonuses from magic items use `"type": "enhancement"` (not `"type": "untyped"`)
- [ ] No modifier stacks when it should be highest-wins (check the stacking table)
- [ ] `saves.all` is used for bonuses applying to all three saves simultaneously

### Items Validation

- [ ] `equipmentSlot` is a valid slot value (or `"none"` for non-wearable items)
- [ ] `weightLbs` is present (use `0` for weightless items)
- [ ] `costGp` is present (use `0` for free items)
- [ ] `weaponData` present for all weapons (including natural weapons)
- [ ] `armorData` present for all armored garments and shields
- [ ] `armorData` values match the corresponding `grantedModifiers` values
- [ ] `consumable: { isConsumable: true }` is set for potions, oils, scrolls (single-use items)
- [ ] Wands have `resourcePoolTemplates` with `"resetCondition": "never"` and `defaultCurrent: 50`
- [ ] Staves have `resourcePoolTemplates` and `staffSpells` array
- [ ] Scrolls have `scrollSpells[]` with `casterLevel`, `spellLevel`, and `spellType` — NO `resourcePoolTemplates`

### Classes Validation

- [ ] `levelProgression` has entries for all 20 levels (or all relevant levels)
- [ ] BAB/save values in `levelProgression` are **increments** not cumulative totals
- [ ] Good saves: +2 at level 1, then alternating 0/1/0/1... increments
- [ ] Poor saves: +0 at level 1, then 0/0/1/0/0/1... increments
- [ ] Full BAB: +1 at every level
- [ ] `classSkills` is populated for every class
- [ ] `caster_ability_stat_X` tag is present for spellcasting classes

### Logic Nodes Validation

- [ ] No field in `values` is an invented formula — check `@`-paths are valid
- [ ] `has_tag` operators check for actual tags that exist on Features
- [ ] `errorMessage` is human-readable and present on user-facing prerequisites

---

## 3. Decision Tree — Which Feature Category?

```
Is it a playable species? (Elf, Dwarf, Half-Orc, Gnoll, Drow, etc.)
  → category: "race"

Is it an NPC creature type that governs creature-wide immunities and HD?
  → category: "monster_type"  (Undead, Construct, Dragon, etc.)

Is it a class the character takes levels in?
  → category: "class"  (base class OR prestige class — same field)

Is it an ability that a class grants at a specific level?
  → category: "class_feature"  (Rage, Sneak Attack, Bardic Music, etc.)

Is it a selected bonus from a feat/class/level-up?
  → category: "feat"

Is it a god that Clerics choose (for domain access)?
  → category: "deity"

Is it a Cleric/Druid domain?
  → category: "domain"

Is it a spell, power, or psi effect that can be cast?
  → category: "magic"

Is it an object a character can carry, equip, or use?
  → category: "item"  (weapons, armor, rings, wands, potions, mundane gear)

Is it a status applied TO a character (Stunned, Blinded, Raging)?
  → category: "condition"

Is it an ambient effect that the GM injects globally (heat, underwater)?
  → category: "environment"
```

---

## 4. Converting Races

### Source Data Mapping — Race

| Source Material | Engine Field | Notes |
|---|---|---|
| Race name | `label.en` | Also generate `label.fr` |
| Stat adjustments (+2 STR, -2 CHA) | `grantedModifiers` with `type: "racial"` | One modifier per stat |
| Base land speed | `grantedModifiers` targeting `"combatStats.speed_land"` with `type: "base"` | Value in feet. Use `"combatStats.speed_land"` — **not** `"attributes.speed_land"` — as the canonical target ID in new content. The normalizer handles the legacy form but `"combatStats.speed_land"` is correct and unambiguous. |
| Size category | `tags`: add `"size_small"` / `"size_medium"` / `"size_large"` etc. | |
| Darkvision | `grantedFeatures: ["trait_darkvision_60"]` | Reference a shared Feature |
| Skill bonuses | `grantedModifiers` on `skills.skill_X` with `type: "racial"` | |
| Save bonuses vs specific thing | `grantedModifiers` on `saves.all` with `situationalContext` | |
| Attack bonus vs specific enemy | `grantedModifiers` on `combatStats.attack_bonus` with `situationalContext` | |
| AC bonus vs specific enemy | `grantedModifiers` on `combatStats.ac_normal` with `situationalContext` | |
| Automatic languages | `grantedFeatures: ["language_common", "language_dwarvish"]` | Reference shared Features |
| Bonus languages | `choices` with `optionsQuery: "category:language"` | |
| Favored class | Not modeled — no engine field for this. Include in `description` text only. | |
| Level adjustment (LA) | Stored on `Character.levelAdjustment` — not in the race Feature itself | |
| Racial Hit Dice | A class-like Feature `"hd_TYPE"` in `character.classLevels` | e.g., `"hd_gnoll": 2` |
| Spell-like abilities (X/day) | `resourcePoolTemplates` + `activation` on a sub-Feature | Reference in `grantedFeatures` |
| Natural armor | `grantedModifiers` on `combatStats.ac_normal` with `type: "natural_armor"` | |

### Size Category Tags

| D&D 3.5 Size | Tag to add |
|---|---|
| Fine | `"size_fine"` |
| Diminutive | `"size_diminutive"` |
| Tiny | `"size_tiny"` |
| Small | `"size_small"` |
| Medium | `"size_medium"` |
| Large | `"size_large"` |
| Huge | `"size_huge"` |
| Gargantuan | `"size_gargantuan"` |
| Colossal | `"size_colossal"` |

### Common Race Anti-Patterns

❌ **Wrong:** Using `"type": "untyped"` for racial ability score bonuses
```json
{ "value": 2, "type": "untyped", "targetId": "attributes.stat_dexterity" }
```
✅ **Correct:** Use `"type": "racial"`
```json
{ "value": 2, "type": "racial", "targetId": "attributes.stat_dexterity" }
```

❌ **Wrong:** Storing speed in a `conditionNode` without using the standard pipeline
```json
{ "targetId": "attributes.speed_land", "value": 30, "type": "base" }
```
✅ **Correct:** Always target `combatStats.speed_land`
```json
{ "targetId": "combatStats.speed_land", "value": 30, "type": "base" }
```

---

## 5. Converting Classes and Prestige Classes

Both base classes and prestige classes use `"category": "class"`. Prestige classes add prerequisites.

### Source Data Mapping — Class

| Source Material | Engine Field | Notes |
|---|---|---|
| Class name | `label.en/fr` + `id: "class_NAME"` | |
| Hit Die (d6, d8, d10, d12) | `grantedModifiers` on `combatStats.hit_die_type` with base value 6/8/10/12 | |
| Skill points/level | `grantedModifiers` on `attributes.skill_points_per_level` with `type: "base"` | Value: 2, 4, 6, 8 |
| BAB progression | `levelProgression[n].grantedModifiers` on `combatStats.base_attack_bonus` with `type: "base"` | Increments, not totals |
| Fortitude/Reflex/Will progression | `levelProgression[n].grantedModifiers` on `saves.fortitude/reflex/will` | Increments |
| Caster level | `levelProgression[n].grantedModifiers` on `attributes.stat_caster_level` | +1 per level |
| Manifester level | `levelProgression[n].grantedModifiers` on `attributes.stat_manifester_level` | +1 per level |
| Class skills | `classSkills: [...]` array | List of `skill_ID` strings |
| Weapon/armor proficiencies | `grantedFeatures: ["proficiency_TYPE"]` | Reference shared proficiency Features |
| Class feature at level N | `levelProgression[N].grantedFeatures: ["class_feature_ID"]` | The feature is defined separately |
| Alignment restriction | `forbiddenTags: ["alignment_lawful"]` | One tag per forbidden alignment |
| Spellcasting ability | Add tag `"caster_ability_stat_wisdom"` (or int/cha) | In the class's `tags` array |
| Prestige class prerequisites | `prerequisitesNode` | Use AND/OR/NOT tree; see Section 13 |

### BAB Conversion by Progression Type

| Progression | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 | L9 | Pattern |
|---|---|---|---|---|---|---|---|---|---|---|
| Full BAB (Fighter, Barbarian, Ranger...) | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | `1` every level |
| 3/4 BAB (Cleric, Rogue, Bard...) | 0 | 1 | 1 | 1 | 0 | 1 | 1 | 1 | 0 | `0` then `1,1,1` cycle |
| 1/2 BAB (Wizard, Sorcerer...) | 0 | 1 | 0 | 1 | 0 | 1 | 0 | 1 | 0 | alternating `0,1` |

> **Verify with cumulative totals:**
> - 3/4 BAB at level 4: 0+1+1+1 = **+3** (SRD: Cleric 4 = +3 ✓)
> - 3/4 BAB at level 8: 0+1+1+1+0+1+1+1 = **+6** (SRD: Cleric 8 = +6 ✓)
> - Do NOT use `[0,1,1,0,1,1,0,...]` — that produces +2 at level 4, which is wrong.

**Converting cumulative totals to increments:**
```
SRD table (cumulative): 0, 1, 2, 3, 3, 4, 5, 6, 6, 7...
Increment[N] = cumulative[N] - cumulative[N-1]
Increments:             0, 1, 1, 1, 0, 1, 1, 1, 0, 1...
```

**Include the increment entry for every level** — even when the value is 0, include the level entry in `levelProgression`. If a level has BAB=0, no BAB modifier entry is needed in `grantedModifiers` (just omit it from that level's array), but the level object itself must exist.

### Save Conversion by Progression Type

| Progression | L1 | L2 | L3 | L4 | L5 | L6 | L7 | Pattern |
|---|---|---|---|---|---|---|---|---|
| Good save | +2 | +0 | +1 | +0 | +1 | +0 | +1 | Start 2, then alt 0/1 |
| Poor save | +0 | +0 | +1 | +0 | +0 | +1 | +0 | 0,0,1 repeating |

### Common Class Anti-Patterns

❌ **Wrong:** Storing cumulative BAB totals
```json
{ "level": 5, "grantedModifiers": [{ "targetId": "combatStats.base_attack_bonus", "value": 5 }] }
```
✅ **Correct:** Store per-level increments
```json
{ "level": 5, "grantedModifiers": [{ "targetId": "combatStats.base_attack_bonus", "value": 1 }] }
```

❌ **Wrong:** Omitting level entries that grant nothing
```json
"levelProgression": [
  { "level": 1, "grantedFeatures": ["feat_bonus_1"] },
  { "level": 3, "grantedFeatures": ["feat_bonus_2"] }
]
```
✅ **Correct:** Include ALL levels, even those with only BAB/save increments and no features

❌ **Wrong:** Using `"type": "untyped"` for all class progression modifiers
✅ **Correct:** BAB and save increments MUST use `"type": "base"` — this is what enables multiclass stacking

---

## 6. Converting Class Features

### Source Data Mapping — Class Feature

| Source Material | Engine Field | Notes |
|---|---|---|
| Feature name | `label.en/fr` + `id: "class_feature_CLASSNAME_FEATURENAME"` | |
| Rules text | `description.en/fr` | Include all game text verbatim |
| Always-active bonus | `grantedModifiers` (no `conditionNode`) | |
| Conditional bonus (while raging, unarmored, etc.) | `grantedModifiers` with `conditionNode` checking `@activeTags` | |
| Active ability with action type | `activation: { actionType: "standard"|"free"|etc. }` | |
| Resource cost (uses/day) | `activation.resourceCost` + `resourcePoolTemplates` | |
| Situational bonus (vs. X) | `grantedModifiers` with `situationalContext: "tag_string"` | |
| Ability that grants sub-features | `grantedFeatures: ["sub_feature_id"]` | |
| Class ability requiring "not armored" | `conditionNode` with `NOT { has_tag "wearing_armor" }` | |
| Extraordinary (Ex) ability | Add `"extraordinary"` to `tags` | |
| Supernatural (Su) ability | Add `"supernatural"` to `tags` | |
| Spell-like (Sp) ability | Add `"spell_like"` to `tags` | |

### Active Ability Pattern

```json
{
  "activation": {
    "actionType": "standard",
    "resourceCost": { "targetId": "resources.paladin_smite_uses", "cost": 1 }
  },
  "resourcePoolTemplates": [
    {
      "poolId": "smite_uses",
      "label": { "en": "Smite Evil (1+/day)", "fr": "Châtiment du Mal (1+/jour)" },
      "maxPipelineId": "combatStats.smite_evil_max",
      "defaultCurrent": 1,
      "resetCondition": "long_rest"
    }
  ]
}
```

### Scaling Resource Pool

For pools that scale with level (Paladin Smite Evil: 1 at level 1, +1 per 5 levels):

```json
{
  "id": "paladin_smite_pool_max",
  "targetId": "resources.paladin_smite_uses.maxValue",
  "value": "1 + floor(@classLevels.class_paladin / 5)",
  "type": "base"
}
```

---

## 7. Converting Feats

### Source Data Mapping — Feat

| Source Material | Engine Field | Notes |
|---|---|---|
| Feat name | `label.en/fr` + `id: "feat_FEAT_NAME"` | |
| Prerequisites | `prerequisitesNode` | See Section 13 for logic tree patterns |
| Flat numeric bonus | `grantedModifiers` | Determine correct bonus type from source |
| "Choose a weapon/school/etc." | `choices` with appropriate `optionsQuery` and `choiceGrantedTagPrefix` | |
| Fighter bonus feat flag | Add `"fighter_bonus_feat"` to `tags` | |
| Metamagic feat | Add `"metamagic"` to `tags` | |
| Metapsionic feat | Add `"metapsionic"` to `tags` | |
| Skill synergy text | Do NOT model as a feat modifier — engine generates synergies from config table | |

### Feat Tag Conventions

| Feat Type | Add to `tags` |
|---|---|
| General feat | `"general"` |
| Fighter bonus feat | `"fighter_bonus_feat"` |
| Metamagic feat | `"metamagic"` |
| Metapsionic feat | `"metapsionic"` |
| Item creation feat | `"item_creation"` |
| Psionic feat | `"psionic"` |

### Parameterized Feat Pattern (Weapon Focus, Spell Focus, Skill Focus)

Any feat that applies to "one chosen X" follows this pattern:
1. Add `choices[]` with `choiceGrantedTagPrefix` = `"feat_FEAT_ID_"`
2. The `conditionNode` on the modifier checks `@equippedWeaponTags includes @selection.CHOICE_ID` (for weapon feats)
3. The prerequisite of a dependent feat (Weapon Specialization) checks `has_tag "feat_weapon_focus_WEAPON_ID"`

This makes every "Weapon Focus (longsword)" distinct without creating separate feat entries.

---

## 8. Converting Spells and Psionic Powers

### Source Data Mapping — Spell

| Source Material | Engine Field | Notes |
|---|---|---|
| Spell name | `label.en/fr` + `id: "spell_SPELL_NAME"` | |
| School | `school` | Use lowercase: `"evocation"`, `"conjuration"`, etc. |
| Sub-school | `subSchool` | `"creation"`, `"summoning"`, `"charm"`, etc. |
| Descriptors | `descriptors: ["fire", "mind-affecting"]` | Lowercase strings |
| Class/level | `spellLists: { "list_wizard": 3, "list_sorcerer": 3 }` | One entry per class list |
| SR/PR | `resistanceType: "spell_resistance"` | Or `"power_resistance"` or `"none"` |
| Components | `components: ["V", "S", "M"]` | Standard D&D abbreviations |
| Range | `range` | `"personal"`, `"touch"`, `"close"`, `"medium"`, `"long"`, formula |
| Target or Area | `targetArea: { "en": "...", "fr": "..." }` | Localized |
| Duration | `duration` | String like `"1 round/level"` |
| Saving throw | `savingThrow` | `"fort_half"`, `"ref_negates"`, `"will_disbelieves"`, `"none"` |
| Buff that grants a modifier | `grantedModifiers: [...]` | For spells that act as buffs when active on character |
| Scaling formula in description | Use `{@path|unit}` pipe syntax in description strings | |

### Spell List ID Mapping

| Source Class Name | Spell List ID |
|---|---|
| Bard | `list_bard` |
| Cleric | `list_cleric` |
| Druid | `list_druid` |
| Paladin | `list_paladin` |
| Ranger | `list_ranger` |
| Sorcerer | `list_sorcerer` |
| Wizard | `list_wizard` |
| Assassin | `list_assassin` |
| Blackguard | `list_blackguard` |
| Fire domain | `list_domain_fire` |
| Water domain | `list_domain_water` |
| _(any domain)_ | `list_domain_DOMAINNAME` |

### Psionic Power Additional Fields

| Source Material | Engine Field | Notes |
|---|---|---|
| Psionic discipline | `discipline` | One of 6 values; see table below |
| Display manifestations | `displays: ["auditory", "visual"]` | Array of sensory effects |
| Power list/level | `spellLists: { "list_psion_wilder": 1 }` | Same mechanism as spells |
| Augmentation option | `augmentations[]: { costIncrement, grantedModifiers, isRepeatable }` | |
| Repeatable augmentation | `augmentations[n].isRepeatable: true` | Player can spend multiple times |
| One-time augmentation | `augmentations[n].isRepeatable: false` | On/off choice |

### Psionic Discipline Reference

| Discipline | Psion Specialist | Focus |
|---|---|---|
| `"clairsentience"` | Seer | Information, scrying, precognition |
| `"metacreativity"` | Shaper | Creating matter/creatures from ectoplasm |
| `"psychokinesis"` | Kineticist | Energy blasts (fire, cold, electricity, force) |
| `"psychometabolism"` | Egoist | Body alteration, healing, self-transformation |
| `"psychoportation"` | Nomad | Movement, teleportation, time/plane shifts |
| `"telepathy"` | Telepath | Mind-affecting, charm, compulsion, reading |

---

## 9. Converting Equipment (Weapons, Armor, Gear)

### Weapon Field Mapping

| Source Material | Engine Field | Notes |
|---|---|---|
| Weapon name | `label.en/fr` + `id: "item_WEAPON_NAME"` | |
| Wield style | `weaponData.wieldCategory` | `"light"`, `"one_handed"`, `"two_handed"`, `"double"` |
| Damage dice | `weaponData.damageDice` | `"1d8"`, `"2d6"`, etc. |
| Damage type | `weaponData.damageType: ["slashing"]` | One or more: slashing, piercing, bludgeoning |
| Critical range | `weaponData.critRange` | `"20"`, `"19-20"`, `"18-20"` |
| Critical multiplier | `weaponData.critMultiplier` | `2`, `3`, or `4` |
| Reach | `weaponData.reachFt` | `5` for normal, `10` for reach weapons |
| Range increment | `weaponData.rangeIncrementFt` | In feet; only for thrown/ranged |
| Weight | `weightLbs` | In pounds |
| Cost | `costGp` | In gold pieces |
| Weapon type | `tags`: add `"weapon_simple"` / `"weapon_martial"` / `"weapon_exotic"` | |
| Melee/ranged | `tags`: add `"weapon_melee"` and/or `"weapon_ranged"` | |
| Light/one-handed | `tags`: add matching size category | `"weapon_light"`, `"weapon_one_handed"` |

### Standard Weapon Tags Reference

```
"item", "weapon"       ← Always required
"weapon_simple"        ← OR weapon_martial OR weapon_exotic
"weapon_melee"         ← If used in melee
"weapon_ranged"        ← If thrown or projectile
"weapon_light"         ← If light weapon
"weapon_one_handed"    ← If one-handed
"weapon_two_handed"    ← If two-handed
"item_WEAPON_ID"       ← Always: self-referencing tag for Weapon Focus targeting
```

### Armor Field Mapping

| Source Material | Engine Field | Notes |
|---|---|---|
| Armor bonus | `grantedModifiers` on `combatStats.ac_normal` with `type: "armor"` | Also set shadow in `armorData.armorBonus` |
| Max DEX | `grantedModifiers` on `combatStats.max_dexterity_bonus` with `type: "max_dex_cap"` | Also set shadow in `armorData.maxDex` |
| ACP | `grantedModifiers` on `combatStats.armor_check_penalty` with `type: "base"` | Negative value (e.g., -7 for full plate). Also set shadow in `armorData.armorCheckPenalty` |
| ASF | `grantedModifiers` on `combatStats.arcane_spell_failure` with `type: "base"` | As percentage integer (e.g., 35). Also shadow |
| Armor type (light/medium/heavy) | `tags`: add `"armor_light"` / `"armor_medium"` / `"armor_heavy"` | Also add `"wearing_armor"` to ALL armor items |
| Shield type | `tags`: add `"shield"` + `"shield_light"` / `"shield_heavy"` / `"shield_tower"` | Also add `"carrying_shield"` to ALL shield items |
| Metal construction | `tags`: add `"metal_armor"` for metal armors, `"metal_shield"` for metal shields | Required for Druid restriction |

### SRD Armor Table

All armors add `"item"`, `"armor"`, `"wearing_armor"`, and their specific weight-category tag. Metal armors also add `"metal_armor"`.

| Armor | AC | Max DEX | ACP | ASF | Weight | Required tags |
|---|---|---|---|---|---|---|
| Padded | 1 | 8 | 0 | 5% | 10 lb | `armor_light` |
| Leather | 2 | 6 | 0 | 10% | 15 lb | `armor_light` |
| Studded Leather | 3 | 5 | -1 | 15% | 20 lb | `armor_light`, `metal_armor` |
| Chain Shirt | 4 | 4 | -2 | 20% | 25 lb | `armor_light`, `metal_armor` |
| Hide | 3 | 4 | -3 | 20% | 25 lb | `armor_medium` |
| Scale Mail | 4 | 3 | -4 | 25% | 30 lb | `armor_medium`, `metal_armor` |
| Chainmail | 5 | 2 | -5 | 30% | 40 lb | `armor_medium`, `metal_armor` |
| Breastplate | 5 | 3 | -4 | 25% | 30 lb | `armor_medium`, `metal_armor` |
| Splint Mail | 6 | 0 | -7 | 40% | 45 lb | `armor_heavy`, `metal_armor` |
| Banded Mail | 6 | 1 | -6 | 35% | 35 lb | `armor_heavy`, `metal_armor` |
| Half Plate | 7 | 0 | -7 | 40% | 50 lb | `armor_heavy`, `metal_armor` |
| Full Plate | 8 | 1 | -6 | 35% | 50 lb | `armor_heavy`, `metal_armor` |

**Example — Full Plate full tag set:**
```json
"tags": ["item", "armor", "armor_heavy", "metal_armor", "wearing_armor", "item_armor_full_plate"]
```

---

## 10. Converting Magic Items

### Standard Magic Item Patterns

| Source Material | Engine Pattern |
|---|---|
| `+N` enhancement bonus to ability score | `grantedModifiers` with `type: "enhancement"` on `attributes.stat_X` |
| `+N` deflection bonus to AC | `grantedModifiers` with `type: "deflection"` on `combatStats.ac_normal` |
| `+N` natural armor bonus | `grantedModifiers` with `type: "natural_armor"` on `combatStats.ac_normal` AND `ac_flat_footed` |
| `+N` resistance bonus to saves | `grantedModifiers` with `type: "resistance"` on `saves.all` |
| `+N` competence bonus to skill | `grantedModifiers` with `type: "competence"` on `skills.skill_X` |
| Situational `+N` save bonus vs. creature type | `grantedModifiers` on `combatStats.saving_throw_bonus` with `type: "resistance"` (or `"untyped"`) and `"situationalContext"`. **Do NOT use `saves.all` for situational save bonuses** — use `combatStats.saving_throw_bonus` so the bonus only fires at roll time and never inflates the static save total. |
| X/day spell-like ability | `resourcePoolTemplates` with `"resetCondition": "per_day"` + `activation` |
| `+N` enhancement to weapon | `grantedModifiers` with `type: "enhancement"` on `combatStats.attack_bonus` AND `combatStats.damage_bonus` |
| On-hit fire damage (Flaming) | `grantedModifiers` on `combatStats.damage_bonus` with `"situationalContext": "on_hit"`, `"value": "1d6"` |
| Critical hit extra dice (Flaming Burst) | `weaponData.onCritDice: { baseDiceFormula, damageType, scalesWithCritMultiplier }` |
| Energy resistance | `grantedModifiers` on `combatStats.energy_resistance_ELEMENT` with `type: "resistance"` |
| Cursed item | Add `removalPrevention: { isCursed: true, removableBy: ["remove_curse", ...] }` |
| DR bypass by material | `grantedModifiers` on `combatStats.damage_reduction` with appropriate `drBypassTags` |
| Fortification (crit negation) | `grantedModifiers` on `combatStats.fortification` with `"type": "untyped"`, value 25/75/100 |
| Tome/manual (permanent stat boost) | `grantedModifiers` with `type: "inherent"` + `consumable: { isConsumable: true }` |
| Intelligent item | `intelligentItemData: { intelligenceScore, wisdomScore, charismaScore, egoScore, ... }` |

### `saves.all` vs `combatStats.saving_throw_bonus` — Which to Use

| Bonus type | Target ID | When |
|---|---|---|
| Unconditional save bonus (Cloak of Resistance) | `saves.all` with `type: "resistance"` | Always active, appears in static save total |
| Situational save bonus (Ring vs. elementals) | `combatStats.saving_throw_bonus` with `situationalContext` | Only fires at roll time, never inflates static total |
| Penalty to all saves (Cursed item) | `saves.all` with `type: "untyped"`, negative value | Always active, appears in static save total |

### Magic Weapon Bonus Type Disambiguation

| Source Text | Modifier Type | Target |
|---|---|---|
| "+N enhancement bonus to attacks and damage" | `"enhancement"` | `combatStats.attack_bonus` AND `combatStats.damage_bonus` |
| "+N morale bonus to attack" | `"morale"` | `combatStats.attack_bonus` |
| "+N luck bonus to attack" | `"luck"` | `combatStats.attack_bonus` |
| "+N insight bonus to attack" | `"insight"` | `combatStats.attack_bonus` |
| "Holy bonus" vs evil outsiders | `"untyped"` with `situationalContext` | situational |

### Fast Healing vs Regeneration

| Ability | Model |
|---|---|
| Fast Healing N | `resourcePoolTemplates` with `"resetCondition": "per_turn"`, `"rechargeAmount": N` |
| Regeneration N | Same, plus tags like `"regeneration_bypassed_by_fire"` — combat tracker uses these tags |

---

## 11. Converting Monsters and NPCs

A monster is built exactly like a PC (a `Character` object) with races representing creature types.

### Creature Type as a Feature

Monster types (Undead, Construct, Dragon, Humanoid, etc.) are Features with `"category": "monster_type"`. They grant type-wide immunities and special abilities.

```json
{
  "id": "monster_type_undead",
  "category": "monster_type",
  "ruleSource": "srd_core",
  "label": { "en": "Undead", "fr": "Mort-vivant" },
  "description": { "en": "Undead creatures are once-living beings...", "fr": "..." },
  "tags": ["monster_type", "undead", "sys_immune_mind_affecting"],
  "grantedModifiers": [
    {
      "id": "undead_con_zero",
      "sourceId": "monster_type_undead",
      "sourceName": { "en": "Undead Type", "fr": "Type mort-vivant" },
      "targetId": "attributes.stat_constitution",
      "value": 0,
      "type": "setAbsolute"
    }
  ],
  "grantedFeatures": [
    "immunity_mind_affecting",
    "immunity_poison",
    "immunity_sleep",
    "immunity_paralysis",
    "immunity_stunning",
    "immunity_disease",
    "immunity_death_effects",
    "immunity_critical_hits"
  ]
}
```

### Monster HD as a Class

Racial Hit Dice are stored as class entries. A Gnoll with 2 HD looks like:

```json
{
  "classLevels": {
    "hd_humanoid": 2,
    "class_warrior": 1
  }
}
```

The `hd_humanoid` Feature is a class-like Feature with `levelProgression` defining the BAB/save table for that creature type's HD.

### Complete NPC Character JSON

```json
{
  "id": "char_orc_warrior_1",
  "name": "Orc Warrior",
  "isNPC": true,
  "classLevels": { "hd_humanoid_orc": 1, "class_warrior": 1 },
  "levelAdjustment": 0,
  "xp": 0,
  "hitDieResults": { "1": 8, "2": 5 },
  "attributes": {
    "stat_strength": { "id": "stat_strength", "baseValue": 17, ... },
    "stat_dexterity": { "id": "stat_dexterity", "baseValue": 11, ... },
    "stat_constitution": { "id": "stat_constitution", "baseValue": 12, ... },
    "stat_intelligence": { "id": "stat_intelligence", "baseValue":  7, ... },
    "stat_wisdom": { "id": "stat_wisdom", "baseValue":  8, ... },
    "stat_charisma": { "id": "stat_charisma", "baseValue":  8, ... }
  },
  "activeFeatures": [
    { "instanceId": "afi_race_orc",   "featureId": "race_orc",         "isActive": true },
    { "instanceId": "afi_class_warr", "featureId": "class_warrior",    "isActive": true },
    { "instanceId": "afi_falchion",   "featureId": "item_falchion",    "isActive": true },
    { "instanceId": "afi_hide_armor", "featureId": "item_armor_hide",  "isActive": true }
  ],
  "linkedEntities": []
}
```

---

## 12. Converting Conditions

### Source Data Mapping — Condition

| Source Material | Engine Field | Notes |
|---|---|---|
| Condition name | `label.en/fr` + `id: "condition_NAME"` | |
| Flat AC penalty | `grantedModifiers` on `combatStats.ac_normal` | Use `"type": "untyped"` for most condition penalties |
| Stat penalty | `grantedModifiers` on `attributes.stat_X` | |
| Save penalty | `grantedModifiers` on `saves.all` or specific save | |
| Action restriction | `actionBudget: { standard: N, move: N, full_round: N }` | `0` = blocked, absent = unlimited |
| "Standard OR move" rule | Add tag `"action_budget_xor"` to the condition's `tags` array | UI enforces mutual exclusion between standard and move actions |
| Immune to | Conditions that prevent other conditions are modeled as `forbiddenTags` on the immunizing Feature | |

### Active Conditions vs. Passive Conditions

Most conditions are **active** — the GM or game system applies them to the character's `activeFeatures`. When a condition is active, its modifiers flow into the pipeline.

The `condition_raging` tag is special: it's injected by the Barbarian Rage class feature's `activation` — not added as a separate Feature.

---

## 13. Handling Prerequisites — Mapping to LogicNode

### Direct Mappings from Source Text

| Source Text Pattern | LogicNode Structure |
|---|---|
| `"Requires STR 13+"` | `CONDITION: @attributes.stat_strength.totalValue >= 13` |
| `"Requires Power Attack feat"` | `CONDITION: @activeTags has_tag feat_power_attack` |
| `"Requires BAB +6"` | `CONDITION: @combatStats.base_attack_bonus.totalValue >= 6` |
| `"Requires 5 ranks in Tumble"` | `CONDITION: @skills.skill_tumble.ranks >= 5` |
| `"Requires caster level 7th"` | `CONDITION: @attributes.stat_caster_level.totalValue >= 7` |
| `"Requires Fighter level 4"` | `CONDITION: @classLevels.class_fighter >= 4` |
| `"Requires character level 10"` | `CONDITION: @characterLevel >= 10` |
| `"Elf or Half-Elf"` | `OR: [ has_tag race_elf, has_tag race_half_elf ]` |
| `"Weapon Focus (same weapon)"` | `has_tag feat_weapon_focus_WEAPON` (look up weapon ID) |
| `"Cannot be lawful"` | `forbiddenTags: ["alignment_lawful"]` on the Feature |

### Common Prerequisite Chains

#### Power Attack Chain

```
Power Attack: STR 13+
Cleave: STR 13+, Power Attack
Great Cleave: STR 13+, Cleave, BAB +4
Whirlwind Attack: DEX 13+, INT 13+, Dodge, Mobility, Spring Attack, BAB +4
```

All follow the same AND pattern, referencing the lower feats by tag.

#### Improved Combat Maneuver Chain

```
Improved Trip: INT 13+, Combat Expertise
Greater Trip: INT 13+, Combat Expertise, Improved Trip, BAB +6
```

#### Spellcaster Prerequisites

```
"Must be able to cast 3rd-level arcane spells"
→ CONDITION: @attributes.stat_caster_level.totalValue >= 5
  (CL 5 is required to cast 3rd-level spells)
```

For more precise checks: `has_tag spellcaster` AND check spell list membership.

### Prestige Class Entry Requirements

These often combine many conditions:

```json
"prerequisitesNode": {
  "logic": "AND",
  "nodes": [
    {
      "logic": "CONDITION",
      "targetPath": "@activeTags",
      "operator": "has_tag",
      "value": "race_elf",
      "errorMessage": "Requires Elf race"
    },
    {
      "logic": "OR",
      "nodes": [
        { "logic": "CONDITION", "targetPath": "@activeTags", "operator": "has_tag",
          "value": "feat_weapon_focus_item_longbow", "errorMessage": "Requires Weapon Focus (longbow or shortbow)" },
        { "logic": "CONDITION", "targetPath": "@activeTags", "operator": "has_tag",
          "value": "feat_weapon_focus_item_shortbow" }
      ]
    },
    {
      "logic": "CONDITION",
      "targetPath": "@attributes.stat_caster_level.totalValue",
      "operator": ">=",
      "value": 1,
      "errorMessage": "Requires ability to cast arcane spells"
    }
  ]
}
```

---

## 14. Stacking Rules — Mapping Bonus Types from Source Material

When source material says "+N BONUS_TYPE bonus to X", use this mapping:

| Source Text | Modifier Type | Stacks? |
|---|---|---|
| "racial bonus" | `"racial"` | ❌ |
| "enhancement bonus" | `"enhancement"` | ❌ |
| "morale bonus" | `"morale"` | ❌ |
| "luck bonus" | `"luck"` | ❌ |
| "insight bonus" | `"insight"` | ❌ |
| "sacred bonus" | `"sacred"` | ❌ |
| "profane bonus" | `"profane"` | ❌ |
| "armor bonus" | `"armor"` | ❌ |
| "shield bonus" | `"shield"` | ❌ |
| "natural armor bonus" | `"natural_armor"` | ❌ |
| "deflection bonus" | `"deflection"` | ❌ |
| "competence bonus" | `"competence"` | ❌ |
| "resistance bonus" to saves | `"resistance"` | ❌ |
| "dodge bonus" | `"dodge"` | ✅ |
| "circumstance bonus" | `"circumstance"` | ✅ |
| "inherent bonus" (tomes, wish) | `"inherent"` | ❌ (highest wins) |
| "size bonus/penalty" | `"size"` | ❌ |
| "untyped bonus" or no type specified | `"untyped"` | ✅ |
| Class progression increment | `"base"` | ✅ |

> **Critical:** When source material says just "a +2 bonus" without specifying a type, use `"untyped"`. When it's clearly a feat bonus, use `"untyped"`. Reserve typed bonus names for when the source explicitly names the bonus type.

---

## 15. Common Patterns and Anti-Patterns

### The Self-Referencing Tag Rule

> **Every Feature's `id` must appear in its own `tags` array.**

```json
{ "id": "feat_cleave", "tags": ["feat", "general", "fighter_bonus_feat", "feat_cleave"] }
```

Without `"feat_cleave"` in the tags, no other Feature can check `has_tag "feat_cleave"` as a prerequisite. This silently breaks entire feat chains. Always include the self-referencing ID tag.

---

### The `"base"` Type Rule

`"type": "base"` is **ONLY** for:
- BAB level-by-level increments in `levelProgression`
- Save level-by-level increments in `levelProgression`
- Caster/manifester level increments in `levelProgression`
- Race base speed (establishes the character's movement floor)
- Armor Check Penalty (ACP) on armor items — additive, not stacking-capped
- Arcane Spell Failure (ASF) on armor items
- Class-progression Damage Reduction increments (Barbarian DR/— levels)
- Spell slot pool initial increment per level (`resources.spell_slots_X_N`)

It is **NOT** for:
- Ability score racial bonuses (use `"racial"`)
- Enhancement bonuses from magic items (use `"enhancement"`)
- Feat bonuses (use `"untyped"` unless explicitly typed in source)
- Armor bonus to AC (use `"armor"`)

### The Self-Referencing Tag Rule

Every Feature's `id` should appear in its own `tags` array:

```json
{
  "id": "feat_weapon_focus",
  "tags": ["feat", "general", "fighter_bonus_feat", "feat_weapon_focus"]
}
```

This allows other Features to check `has_tag feat_weapon_focus` as a prerequisite.

### The `saves.all` Fan-Out Rule

When a bonus applies to ALL three saving throws, use `targetId: "saves.all"` in a single modifier — do not write three separate modifiers. The engine automatically fans this out to `fortitude`, `reflex`, and `will`.

```json
{ "targetId": "saves.all", "value": 1, "type": "resistance" }
```

### The Speed Pipeline Rule

In `grantedModifiers`, use `"combatStats.speed_land"` as the `targetId`.
In `@`-paths inside formula strings or description pipes, use `@combatStats.speed_land.totalValue`.

Do NOT use `"attributes.speed_land"` in new content (the normaliser handles it, but it's fragile).

### The Stacking Analysis Rule

Before setting `"type"`, answer: "If a character has two sources of this bonus, should the higher one win (typed), or do they stack (untyped/base/dodge)?"

Example: Two spells both grant morale bonus to attack. Use `"morale"` — only the higher one applies. Two dodge bonuses? Use `"dodge"` — they stack.

### The Resource Pool vs. Consumable Rule

| Situation | Pattern |
|---|---|
| Item can be used N times per day, item persists | `resourcePoolTemplates` with `"resetCondition": "per_day"` |
| Item is destroyed on use (potion, oil) | `consumable: { isConsumable: true }` — NO resource pool |
| Item has finite charges and is never recharged | `resourcePoolTemplates` with `"resetCondition": "never"` |
| Item has 50 charges (wand/staff) | `resourcePoolTemplates`, `defaultCurrent: 50`, `"resetCondition": "never"` |

---

## 16. PCGen LST Format — Field Mapping Reference

PCGen stores data in `.lst` files with tab-separated custom DSL syntax. Here is a mapping from common PCGen tokens to engine JSON fields:

### Race LST → JSON

| PCGen Token | Engine Field |
|---|---|
| `MOVE:Walk,30` | `grantedModifiers` on `combatStats.speed_land`, `value: 30`, `type: "base"` |
| `SIZE:M` | `tags: ["size_medium"]` |
| `BONUS:STAT|STR|2|TYPE=Racial` | `grantedModifiers` on `attributes.stat_strength`, `value: 2`, `type: "racial"` |
| `VISION:Darkvision (60 ft)` | `grantedFeatures: ["trait_darkvision_60"]` |
| `LANGBONUS:Goblin,Orc` | Bonus language choices in `choices` |
| `LANGAUTO:Common,Gnoll` | `grantedFeatures: ["language_common", "language_gnoll"]` |
| `BONUS:COMBAT|AC|1|TYPE=NaturalArmor` | `grantedModifiers` on `combatStats.ac_normal`, `type: "natural_armor"` |
| `BONUS:SKILL|Listen,Spot|2|TYPE=Racial` | Two modifiers: skills.skill_listen and skills.skill_spot, `type: "racial"`, `value: 2` |

### Feat LST → JSON

| PCGen Token | Engine Field |
|---|---|
| `PRE:1,STAT:STR=13` | `prerequisitesNode: CONDITION >= 13 on @attributes.stat_strength.totalValue` |
| `PRE:1,FEAT:Power Attack` | `prerequisitesNode: CONDITION has_tag feat_power_attack on @activeTags` |
| `BONUS:COMBAT|TOHIT|1|TYPE=Untyped` | `grantedModifiers` on `combatStats.attack_bonus`, `type: "untyped"` |
| `BONUS:SKILL|Jump,Tumble|2` | Two modifiers on `skills.skill_jump` and `skills.skill_tumble` |
| `CHOOSE:EQTYPE=Weapon` | `choices: [{ optionsQuery: "tag:weapon" }]` |

### Spell LST → JSON

| PCGen Token | Engine Field |
|---|---|
| `CLASSES:Wizard=3,Sorcerer=3` | `spellLists: { "list_wizard": 3, "list_sorcerer": 3 }` |
| `SCHOOL:Evocation` | `school: "evocation"` |
| `SUBSCHOOL:Calling` | `subSchool: "calling"` |
| `DESCRIPTOR:Fire,Evil` | `descriptors: ["fire", "evil"]` |
| `RANGE:Long` | `range: "long"` |
| `SAVEINFO:Reflex half` | `savingThrow: "ref_half"` |
| `SR:Yes` | `resistanceType: "spell_resistance"` |
| `SR:No` | `resistanceType: "none"` |
| `COMPS:V,S,M` | `components: ["V", "S", "M"]` |

---

## 17. d20 SRD HTML — Extraction Heuristics

The d20 SRD HTML mirror is at `d20srd/www.d20srd.org/`. When extracting data from HTML:

### Race Pages

```
URL pattern: www.d20srd.org/srd/races/RACE.htm
Key tables: Racial Traits, Ability Score Modifiers
Look for: <ul> or <p> tags listing special abilities
```

Extract from the Racial Traits table:
- `Size` → map to `tags` size category
- `Speed` → `combatStats.speed_land`
- Ability score adjustments → `grantedModifiers` with `"racial"` type
- Special qualities → convert to modifiers or reference shared Features

### Class Pages

```
URL pattern: www.d20srd.org/srd/classes/CLASSNAME.htm (or spellcasters/CLASSNAME.htm)
Key tables: Class Features table (BAB, Saves, Special)
```

The HTML table has rows for each level. Extract:
- Column 1 (Level) → `levelProgression[n].level`
- Column 2 (BAB) → compute increment from cumulative total
- Fortitude/Reflex/Will columns → compute increment from cumulative total
- "Special" column → IDs of `grantedFeatures`

**Converting cumulative BAB to increments:**

```
Cumulative: [0, 1, 2, 3, 4, 5, 6, 7...]
Increment:  [0, 1, 1, 1, 1, 1, 1, 1...]  (each is: cumulative[n] - cumulative[n-1])
```

### Feat Pages

```
URL pattern: www.d20srd.org/srd/feats.htm (all feats alphabetically)
Key elements: feat name in <h5>, Prerequisites in <p>, Benefit in <p>
```

### Spell Pages

```
URL pattern: www.d20srd.org/srd/spells/SPELLNAME.htm
Key elements: spell stats in definition list (<dl><dt><dd>) pattern
School: Evocation [Fire]  → school: "evocation", descriptors: ["fire"]
```

### Magic Item Pages

```
URL pattern: www.d20srd.org/srd/magicItems/CATEGORY.htm
Key elements: item name in <h5>, stats in <p>, special abilities as bullet lists
```

---

## 18. ID Collision and Deduplication Strategy

### When IDs Collide Across Sources

If your target rule source defines an entity that already exists in another source, you have two options:

**Option A: Override** (default `merge: "replace"`)
Use when your version completely replaces the original. Common for homebrew that rewrites a class.

**Option B: Extend** (`merge: "partial"`)
Use when your version adds to or modifies the original. Common for:
- Adding a variant class feature
- Adding a new subschool spell to an existing list
- Giving a prestige class access to spells from a new list

### ID Naming for Variants

When you need a variant of an existing entity, append a descriptor to the ID:

```
feat_weapon_focus             ← Original
feat_weapon_focus_ranged      ← Ranged-only variant
item_ring_protection_2        ← Standard
item_ring_protection_2_mithral ← Special material variant
```

### Modifier ID Uniqueness

Within a single Feature, every modifier ID must be unique. Convention:
```
mod_[featureid]_[short_descriptor]_[counter_if_needed]
```

Example for a race with three skill bonuses:
```
mod_gnome_listen_bonus
mod_gnome_spot_bonus
mod_gnome_craft_alchemy_bonus
```

---

## 19. Multilingual Output — Translation Guidelines

### File Wrapper and `supportedLanguages`

Every rule file MUST use the metadata wrapper format and declare which languages it provides:

```json
{
  "supportedLanguages": ["en", "fr"],
  "entities": [
    { "id": "feat_power_attack", ... }
  ]
}
```

The `supportedLanguages` array drives the language dropdown in the UI: every code listed here will appear as a selectable language. The engine discovers these codes at load time via `DataLoader.getAvailableLanguages()`.

**Rules:**

| Rule | Detail |
|---|---|
| `"en"` is always required | English is the universal base and fallback. NEVER omit `"en"` from any `label` or `description`. |
| Other languages | Include them in every `label` and `description` if they are listed in `supportedLanguages`. |
| Missing translation | If a `"fr"` key is absent on a string, the UI silently falls back to `"en"`. This is safe but should be avoided when `"fr"` is declared. |
| Unknown codes | Any code (e.g., `"es"`, `"de"`, `"ja"`) is valid. UI chrome strings without that code fall back to English automatically. |

### Minimum vs. Full Coverage

| Scenario | What to output |
|---|---|
| English-only source (no translation available) | `"supportedLanguages": ["en"]` — only `"en"` keys in strings |
| English + French source | `"supportedLanguages": ["en", "fr"]` — both `"en"` and `"fr"` keys |
| English + Spanish community file | `"supportedLanguages": ["en", "es"]` — both `"en"` and `"es"` keys |
| Full trilingual file | `"supportedLanguages": ["en", "fr", "es"]` — all three keys |

### Mandatory Coverage for Declared Languages

Every `label` and `description` MUST have at least `"en"`. For each additional code in `supportedLanguages`, provide the translation. Never output empty strings:
```json
{ "en": "Power Attack", "fr": "" }         ← INVALID (empty French)
{ "en": "Power Attack" }                    ← valid IF supportedLanguages is ["en"] only
{ "en": "Power Attack", "fr": "Attaque en puissance" } ← valid for ["en", "fr"]
```

### Official French D&D 3.5 Terms

Use the official Wizards of the Coast French translation (Éditions Spécial Jeux / Asmodée). Key terms:

| English | French |
|---|---|
| Strength | Force |
| Dexterity | Dextérité |
| Constitution | Constitution |
| Intelligence | Intelligence |
| Wisdom | Sagesse |
| Charisma | Charisme |
| Fortitude | Vigueur |
| Reflex | Réflexes |
| Will | Volonté |
| Base Attack Bonus | Bonus de base à l'attaque (BBA) |
| Armor Class | Classe d'armure (CA) |
| Hit Points | Points de vie (PV) |
| Barbarian | Barbare |
| Fighter | Guerrier |
| Rogue | Roublard |
| Cleric | Clerc |
| Druid | Druide |
| Monk | Moine |
| Paladin | Paladin |
| Ranger | Rôdeur |
| Sorcerer | Ensorceleur |
| Wizard | Magicien |
| Bard | Barde |
| Sneak Attack | Attaque sournoise |
| Rage | Furie |
| Wild Shape | Forme sauvage |
| Damage Reduction | Réduction des dégâts |
| Spell Resistance | Résistance à la magie |

### UI Chrome vs. Game Content Translations

**Do not confuse the two translation systems:**

| System | Scope | Authored by | File |
|---|---|---|---|
| **Game content** | Feature `label`, `description` in rule JSON | Content authors | `static/rules/**/*.json` |
| **UI chrome** | Buttons, nav, error messages, tab names | Translators | `static/locales/{code}.json` |

When migrating D&D 3.5 content, you only produce **game content** translations (`label`/`description` in rule JSON). The UI chrome (`static/locales/fr.json`, etc.) is maintained separately by translators and requires no change.

### UI Locale JSON File Format

If you need to explain a UI locale file structure to a downstream translator or automation tool, the format is:

```json
{
  "$meta": {
    "language":    "Français",
    "code":        "fr",
    "countryCode": "fr",
    "unitSystem":  "metric",
    "author":      "Character Vault core team",
    "version":     1
  },
  "login.title":     "Connectez-vous pour continuer",
  "combat.hp.title": "Points de vie",
  "settings.rule_sources.files": {
    "one":   "1 fichier",
    "other": "{n} fichiers"
  }
}
```

- The `$meta` block is informational only; the loader strips it before caching.
- **`$meta.countryCode` is mandatory** (ISO 3166-1 alpha-2, e.g. `"fr"`, `"de"`). It is used to render the country flag in the language picker (`flag-icons` CSS library). Files missing this field are skipped by `UiLocalesController.php` and will not appear in the language dropdown.
- Simple string values use `{placeholder}` for template variables.
- Plural values use CLDR category keys (`one`, `other`, etc.); `{n}` is replaced with the count by `uiN()`.
- Any key absent from the locale file silently falls back to the English baseline.
- Drop the file in `static/locales/` — no code change required. It appears in the language dropdown on the next page load.

### Distance and Weight in Description Text

Rule values are always in imperial units (feet, pounds). The display layer uses `UNIT_SYSTEM_CONFIG` keyed by `UnitSystem` (`"imperial"` or `"metric"`), with the language→unit-system mapping coming from `LANG_UNIT_SYSTEM` in `ui-strings.ts`. Community languages not in that map default to `imperial`.

Use `{@path|distance}` pipes in description text for automatic unit conversion:

```json
"description": {
  "en": "You gain a 30-foot speed.",
  "fr": "Vous gagnez une vitesse de 9 m."
}
```

Or better, use the formula reference so it always shows the computed value:

```json
"description": {
  "en": "Your speed increases by {@combatStats.speed_land.totalValue|distance}.",
  "fr": "Votre vitesse passe à {@combatStats.speed_land.totalValue|distance}."
}
```

---

## 20. When to Stop and Ask

**ALWAYS STOP IMMEDIATELY** and report to the user if you encounter:

1. **A game rule that has no engine equivalent** — e.g., a spell that permanently changes another character's statistics in a non-ephemeral way

2. **Ambiguous stacking** — e.g., source text says "+2 bonus" without a type name, and it's unclear whether this should stack with similar bonuses

3. **A prerequisite condition that doesn't map to any `@`-path** — e.g., "Must be worshipper of Pelor" when no deity tag system exists

4. **A class feature that requires code logic** — e.g., "On a confirmed critical hit, the creature must make a Fortitude save or die" — this requires combat UI logic, not just data

5. **An ID that would collide with an existing entity in an unexpected way** — e.g., a prestige class sharing an ID with a base class

6. **A missing config table** — e.g., a feature that references `@constant.SOMETHING` but that constant doesn't exist in any config table

7. **Circular feature references** — e.g., Feature A grants Feature B which grants Feature A

8. **Any entity that would require new engine fields** — Never invent engine fields not documented in ARCHITECTURE.md

**Do NOT:**
- Silently skip entities that are hard to model
- Invent new `targetId` pipeline names
- Use `"untyped"` as a universal fallback without analyzing stacking
- Forget the bilingual requirement
- Store cumulative BAB/save values instead of increments

---

_For complete field definitions, examples, and engine rules, see [`CONTENT_AUTHORING_GUIDE.md`](CONTENT_AUTHORING_GUIDE.md) and [`ARCHITECTURE.md`](ARCHITECTURE.md)._
