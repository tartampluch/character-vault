# Annexes

### Annex A: JSON Rule File Schemas — Complete Examples

Annex A provides complete JSON examples conforming to the architecture described in this document. These examples serve as canonical reference for content creation. Each JSON entity respects the TypeScript interfaces defined in sections 2-6.

The following examples are provided (see the full Annex A document for complete JSON):

| Section   | Content                                    | Key Mechanics Demonstrated                                                                                                                                                                                                                                                                          |
| --------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A.1.1     | Barbarian (20 levels complete)             | Full BAB progression, Rage (ResourcePool + conditional modifiers), DR progression, Greater/Mighty Rage upgrades, conditional Fast Movement                                                                                                                                                          |
| A.1.2     | Cleric (5 levels + features)               | 3/4 BAB, divine spellcasting (spell slots per level), Turn Undead (ResourcePool with formula), FeatureChoice (domains), deity selection                                                                                                                                                             |
| A.1.3     | Monk (5 levels + features)                 | All-good saves, conditional AC bonus (WIS to AC when unarmored), progressive unarmed damage (setAbsolute), speed bonus, alignment restrictions                                                                                                                                                      |
| A.2.1     | Dragon Disciple (10 levels)                | Prestige class with complex prerequisitesNode, ability score increases at specific levels, natural armor progression, Wings (fly speed formula), Dragon Apotheosis                                                                                                                                  |
| A.3.1-3.4 | Human, Elf, Gnome, Dromite                 | Attribute modifiers (racial), size bonuses, bonus feats/skills, situational modifiers (vs_enchantment, vs_illusion, vs_giant), FeatureChoice (energy type), psionic traits                                                                                                                          |
| A.4.1-4.6 | 6 Feats                                    | Prerequisite chain (Heavy Armor Prof), conditional prerequisites + choice (Exotic Weapon Prof), simple skill bonus (Self-Sufficient), caster level prerequisite (Craft Wand), metamagic (Maximize Spell), metapsionic (Burrowing Power)                                                             |
| A.5.1-5.9 | 9 Items                                    | Heavy armor (Full Plate with ACP, max Dex, ASF), light armor (Chain Shirt), wondrous item (Bracers of Armor), ring (Feather Falling), container (Bag of Holding), exotic two-handed weapon (Repeating Crossbow), simple ranged (Sling), cursed item (Scarab of Death), clothing (Explorer's Outfit) |
| A.6.1-6.5 | 5 Spells                                   | Divine with costly component (Raise Dead), multi-list (Speak with Plants), arcane scaling damage with formula (Chain Lightning), buff transmutation (Darkvision with granted feature), multi-list material component (Stone Shape)                                                                  |
| A.7       | Soulknife (6 levels)                       | Psionic class, Mind Blade (manifested weapon), Psychic Strike with dynamic damage formula `floor(@classLevels.class_soulknife / 4)d8`, conditional on target not being mindless                                                                                                                     |
| A.8       | Druid (5 levels + companion)               | forbiddenTags (metal_armor, metal_shield), Animal Companion (LinkedEntity via FeatureChoice), spellcasting progression                                                                                                                                                                              |
| A.9       | Sphere of Annihilation                     | Artifact with no standard stats, equipmentSlot: "none"                                                                                                                                                                                                                                              |
| A.10      | Orc Warrior 1 (complete monster)           | Race (Orc with +4 STR, darkvision, light sensitivity as situational), NPC class (Warrior), complete Character JSON with equipment, step-by-step resolution walkthrough                                                                                                                              |
| A.11      | Extreme Heat + Underwater                  | Environment Features as Global Auras, conditionNode blocking via Endure Elements tag, heavy armor penalty, swim speed check, Freedom of Movement interaction                                                                                                                                        |
| A.12      | Energy Missile, Energy Push, Metamorphosis | Psionic powers with augmentations (repeatable and non-repeatable), energy type choice, manifester level cost cap explanation, augmentation resolution walkthrough                                                                                                                                   |

> **AI Implementation Note:** When implementing the DataLoader and GameEngine, use these examples as your primary test fixtures. Every mechanic shown here (conditional modifiers, situational contexts, formulas, `setAbsolute`, `forbiddenTags`, `levelProgression`, `augmentations`, etc.) MUST be handled by the engine. If your engine cannot process one of these examples, the implementation is incomplete.

> **Convention:** In the `grantedModifiers` of `levelProgression`, BAB and save values represent **per-level increments** (not cumulative totals). The engine sums all increments for levels ≤ `classLevels[classId]`.

> **Convention:** Base save values follow D&D 3.5 progressions:
> - **Good:** +2 at level 1, then +1 every 2 levels (cumulative: 2, 3, 3, 4, 4, 5, 5, ...)
> - **Poor:** +0 at level 1, then +1 every 3 levels (cumulative: 0, 0, 1, 1, 1, 2, 2, 2, 3, ...)
>
> The increments in `levelProgression` represent the **difference** between the total at this level and the total at the previous level.

---

## A.1. Base Classes

### A.1.1. Barbarian (Full Base Class — 20 Levels)

> _This class demonstrates: full BAB progression (+1/level), d12 hit die, Rage as an activated ability with ResourcePool, conditional Fast Movement (no heavy armor/load), progressive Damage Reduction, Rage upgrades (Greater/Mighty) with conditionNode gating, Indomitable Will as both conditional AND situational, and alignment restriction via `forbiddenTags`._

```json
{
  "id": "class_barbarian",
  "category": "class",
  "ruleSource": "srd_core",
  "label": { "en": "Barbarian", "fr": "Barbare" },
  "description": {
    "en": "A ferocious warrior who can fly into a battle rage.",
    "fr": "Un guerrier feroce capable d'entrer dans une rage de combat."
  },
  "tags": ["class", "base_class", "martial", "class_barbarian"],
  "forbiddenTags": ["alignment_lawful"],
  "grantedModifiers": [
    {
      "id": "barbarian_hit_die",
      "sourceId": "class_barbarian",
      "targetId": "combatStats.hit_die_type",
      "value": 12,
      "type": "base",
      "sourceName": { "en": "Barbarian", "fr": "Barbare" }
    },
    {
      "id": "barbarian_skill_points",
      "sourceId": "class_barbarian",
      "targetId": "attributes.skill_points_per_level",
      "value": 4,
      "type": "base",
      "sourceName": { "en": "Barbarian", "fr": "Barbare" }
    }
  ],
  "grantedFeatures": [
    "proficiency_all_simple",
    "proficiency_all_martial",
    "proficiency_armor_light",
    "proficiency_armor_medium",
    "proficiency_shields_except_tower"
  ],
  "recommendedAttributes": ["stat_str", "stat_con"],
  "levelProgression": [
    {
      "level": 1,
      "grantedFeatures": ["class_feature_barbarian_fast_movement", "class_feature_barbarian_illiteracy", "class_feature_barbarian_rage"],
      "grantedModifiers": [
        { "id": "barb_1_bab", "sourceId": "class_barbarian", "targetId": "combatStats.bab", "value": 1, "type": "base", "sourceName": { "en": "Barbarian 1", "fr": "Barbare 1" } },
        { "id": "barb_1_fort", "sourceId": "class_barbarian", "targetId": "saves.fort", "value": 2, "type": "base", "sourceName": { "en": "Barbarian 1", "fr": "Barbare 1" } },
        { "id": "barb_1_ref", "sourceId": "class_barbarian", "targetId": "saves.ref", "value": 0, "type": "base", "sourceName": { "en": "Barbarian 1", "fr": "Barbare 1" } },
        { "id": "barb_1_will", "sourceId": "class_barbarian", "targetId": "saves.will", "value": 0, "type": "base", "sourceName": { "en": "Barbarian 1", "fr": "Barbare 1" } }
      ]
    },
    {
      "level": 2,
      "grantedFeatures": ["class_feature_uncanny_dodge"],
      "grantedModifiers": [
        { "id": "barb_2_bab", "sourceId": "class_barbarian", "targetId": "combatStats.bab", "value": 1, "type": "base", "sourceName": { "en": "Barbarian 2", "fr": "Barbare 2" } },
        { "id": "barb_2_fort", "sourceId": "class_barbarian", "targetId": "saves.fort", "value": 1, "type": "base", "sourceName": { "en": "Barbarian 2", "fr": "Barbare 2" } }
      ]
    },
    {
      "level": 3,
      "grantedFeatures": ["class_feature_barbarian_trap_sense_1"],
      "grantedModifiers": [
        { "id": "barb_3_bab", "sourceId": "class_barbarian", "targetId": "combatStats.bab", "value": 1, "type": "base", "sourceName": { "en": "Barbarian 3", "fr": "Barbare 3" } },
        { "id": "barb_3_ref", "sourceId": "class_barbarian", "targetId": "saves.ref", "value": 1, "type": "base", "sourceName": { "en": "Barbarian 3", "fr": "Barbare 3" } },
        { "id": "barb_3_will", "sourceId": "class_barbarian", "targetId": "saves.will", "value": 1, "type": "base", "sourceName": { "en": "Barbarian 3", "fr": "Barbare 3" } }
      ]
    },
    {
      "level": 4,
      "grantedFeatures": ["class_feature_barbarian_rage_2_day"],
      "grantedModifiers": [
        { "id": "barb_4_bab", "sourceId": "class_barbarian", "targetId": "combatStats.bab", "value": 1, "type": "base", "sourceName": { "en": "Barbarian 4", "fr": "Barbare 4" } },
        { "id": "barb_4_fort", "sourceId": "class_barbarian", "targetId": "saves.fort", "value": 1, "type": "base", "sourceName": { "en": "Barbarian 4", "fr": "Barbare 4" } }
      ]
    },
    {
      "level": 5,
      "grantedFeatures": ["class_feature_improved_uncanny_dodge"],
      "grantedModifiers": [
        { "id": "barb_5_bab", "sourceId": "class_barbarian", "targetId": "combatStats.bab", "value": 1, "type": "base", "sourceName": { "en": "Barbarian 5", "fr": "Barbare 5" } }
      ]
    },
    {
      "level": 6,
      "grantedFeatures": ["class_feature_barbarian_trap_sense_2"],
      "grantedModifiers": [
        { "id": "barb_6_bab", "sourceId": "class_barbarian", "targetId": "combatStats.bab", "value": 1, "type": "base", "sourceName": { "en": "Barbarian 6", "fr": "Barbare 6" } },
        { "id": "barb_6_fort", "sourceId": "class_barbarian", "targetId": "saves.fort", "value": 1, "type": "base", "sourceName": { "en": "Barbarian 6", "fr": "Barbare 6" } },
        { "id": "barb_6_ref", "sourceId": "class_barbarian", "targetId": "saves.ref", "value": 1, "type": "base", "sourceName": { "en": "Barbarian 6", "fr": "Barbare 6" } },
        { "id": "barb_6_will", "sourceId": "class_barbarian", "targetId": "saves.will", "value": 1, "type": "base", "sourceName": { "en": "Barbarian 6", "fr": "Barbare 6" } }
      ]
    },
    {
      "level": 7,
      "grantedFeatures": ["class_feature_barbarian_dr_1"],
      "grantedModifiers": [
        { "id": "barb_7_bab", "sourceId": "class_barbarian", "targetId": "combatStats.bab", "value": 1, "type": "base", "sourceName": { "en": "Barbarian 7", "fr": "Barbare 7" } }
      ]
    },
    {
      "level": 8,
      "grantedFeatures": ["class_feature_barbarian_rage_3_day"],
      "grantedModifiers": [
        { "id": "barb_8_bab", "sourceId": "class_barbarian", "targetId": "combatStats.bab", "value": 1, "type": "base", "sourceName": { "en": "Barbarian 8", "fr": "Barbare 8" } },
        { "id": "barb_8_fort", "sourceId": "class_barbarian", "targetId": "saves.fort", "value": 1, "type": "base", "sourceName": { "en": "Barbarian 8", "fr": "Barbare 8" } }
      ]
    },
    {
      "level": 9,
      "grantedFeatures": ["class_feature_barbarian_trap_sense_3"],
      "grantedModifiers": [
        { "id": "barb_9_bab", "sourceId": "class_barbarian", "targetId": "combatStats.bab", "value": 1, "type": "base", "sourceName": { "en": "Barbarian 9", "fr": "Barbare 9" } },
        { "id": "barb_9_ref", "sourceId": "class_barbarian", "targetId": "saves.ref", "value": 1, "type": "base", "sourceName": { "en": "Barbarian 9", "fr": "Barbare 9" } },
        { "id": "barb_9_will", "sourceId": "class_barbarian", "targetId": "saves.will", "value": 1, "type": "base", "sourceName": { "en": "Barbarian 9", "fr": "Barbare 9" } }
      ]
    },
    {
      "level": 10,
      "grantedFeatures": ["class_feature_barbarian_dr_2"],
      "grantedModifiers": [
        { "id": "barb_10_bab", "sourceId": "class_barbarian", "targetId": "combatStats.bab", "value": 1, "type": "base", "sourceName": { "en": "Barbarian 10", "fr": "Barbare 10" } },
        { "id": "barb_10_fort", "sourceId": "class_barbarian", "targetId": "saves.fort", "value": 1, "type": "base", "sourceName": { "en": "Barbarian 10", "fr": "Barbare 10" } }
      ]
    },
    {
      "level": 11,
      "grantedFeatures": ["class_feature_barbarian_greater_rage"],
      "grantedModifiers": [
        { "id": "barb_11_bab", "sourceId": "class_barbarian", "targetId": "combatStats.bab", "value": 1, "type": "base", "sourceName": { "en": "Barbarian 11", "fr": "Barbare 11" } }
      ]
    },
    {
      "level": 12,
      "grantedFeatures": ["class_feature_barbarian_rage_4_day", "class_feature_barbarian_trap_sense_4"],
      "grantedModifiers": [
        { "id": "barb_12_bab", "sourceId": "class_barbarian", "targetId": "combatStats.bab", "value": 1, "type": "base", "sourceName": { "en": "Barbarian 12", "fr": "Barbare 12" } },
        { "id": "barb_12_fort", "sourceId": "class_barbarian", "targetId": "saves.fort", "value": 1, "type": "base", "sourceName": { "en": "Barbarian 12", "fr": "Barbare 12" } },
        { "id": "barb_12_ref", "sourceId": "class_barbarian", "targetId": "saves.ref", "value": 1, "type": "base", "sourceName": { "en": "Barbarian 12", "fr": "Barbare 12" } },
        { "id": "barb_12_will", "sourceId": "class_barbarian", "targetId": "saves.will", "value": 1, "type": "base", "sourceName": { "en": "Barbarian 12", "fr": "Barbare 12" } }
      ]
    },
    {
      "level": 13,
      "grantedFeatures": ["class_feature_barbarian_dr_3"],
      "grantedModifiers": [
        { "id": "barb_13_bab", "sourceId": "class_barbarian", "targetId": "combatStats.bab", "value": 1, "type": "base", "sourceName": { "en": "Barbarian 13", "fr": "Barbare 13" } }
      ]
    },
    {
      "level": 14,
      "grantedFeatures": ["class_feature_barbarian_indomitable_will"],
      "grantedModifiers": [
        { "id": "barb_14_bab", "sourceId": "class_barbarian", "targetId": "combatStats.bab", "value": 1, "type": "base", "sourceName": { "en": "Barbarian 14", "fr": "Barbare 14" } },
        { "id": "barb_14_fort", "sourceId": "class_barbarian", "targetId": "saves.fort", "value": 1, "type": "base", "sourceName": { "en": "Barbarian 14", "fr": "Barbare 14" } }
      ]
    },
    {
      "level": 15,
      "grantedFeatures": ["class_feature_barbarian_trap_sense_5"],
      "grantedModifiers": [
        { "id": "barb_15_bab", "sourceId": "class_barbarian", "targetId": "combatStats.bab", "value": 1, "type": "base", "sourceName": { "en": "Barbarian 15", "fr": "Barbare 15" } },
        { "id": "barb_15_ref", "sourceId": "class_barbarian", "targetId": "saves.ref", "value": 1, "type": "base", "sourceName": { "en": "Barbarian 15", "fr": "Barbare 15" } },
        { "id": "barb_15_will", "sourceId": "class_barbarian", "targetId": "saves.will", "value": 1, "type": "base", "sourceName": { "en": "Barbarian 15", "fr": "Barbare 15" } }
      ]
    },
    {
      "level": 16,
      "grantedFeatures": ["class_feature_barbarian_dr_4", "class_feature_barbarian_rage_5_day"],
      "grantedModifiers": [
        { "id": "barb_16_bab", "sourceId": "class_barbarian", "targetId": "combatStats.bab", "value": 1, "type": "base", "sourceName": { "en": "Barbarian 16", "fr": "Barbare 16" } },
        { "id": "barb_16_fort", "sourceId": "class_barbarian", "targetId": "saves.fort", "value": 1, "type": "base", "sourceName": { "en": "Barbarian 16", "fr": "Barbare 16" } }
      ]
    },
    {
      "level": 17,
      "grantedFeatures": ["class_feature_barbarian_tireless_rage"],
      "grantedModifiers": [
        { "id": "barb_17_bab", "sourceId": "class_barbarian", "targetId": "combatStats.bab", "value": 1, "type": "base", "sourceName": { "en": "Barbarian 17", "fr": "Barbare 17" } }
      ]
    },
    {
      "level": 18,
      "grantedFeatures": ["class_feature_barbarian_trap_sense_6"],
      "grantedModifiers": [
        { "id": "barb_18_bab", "sourceId": "class_barbarian", "targetId": "combatStats.bab", "value": 1, "type": "base", "sourceName": { "en": "Barbarian 18", "fr": "Barbare 18" } },
        { "id": "barb_18_fort", "sourceId": "class_barbarian", "targetId": "saves.fort", "value": 1, "type": "base", "sourceName": { "en": "Barbarian 18", "fr": "Barbare 18" } },
        { "id": "barb_18_ref", "sourceId": "class_barbarian", "targetId": "saves.ref", "value": 1, "type": "base", "sourceName": { "en": "Barbarian 18", "fr": "Barbare 18" } },
        { "id": "barb_18_will", "sourceId": "class_barbarian", "targetId": "saves.will", "value": 1, "type": "base", "sourceName": { "en": "Barbarian 18", "fr": "Barbare 18" } }
      ]
    },
    {
      "level": 19,
      "grantedFeatures": ["class_feature_barbarian_dr_5"],
      "grantedModifiers": [
        { "id": "barb_19_bab", "sourceId": "class_barbarian", "targetId": "combatStats.bab", "value": 1, "type": "base", "sourceName": { "en": "Barbarian 19", "fr": "Barbare 19" } }
      ]
    },
    {
      "level": 20,
      "grantedFeatures": ["class_feature_barbarian_mighty_rage", "class_feature_barbarian_rage_6_day"],
      "grantedModifiers": [
        { "id": "barb_20_bab", "sourceId": "class_barbarian", "targetId": "combatStats.bab", "value": 1, "type": "base", "sourceName": { "en": "Barbarian 20", "fr": "Barbare 20" } },
        { "id": "barb_20_fort", "sourceId": "class_barbarian", "targetId": "saves.fort", "value": 1, "type": "base", "sourceName": { "en": "Barbarian 20", "fr": "Barbare 20" } }
      ]
    }
  ]
}
```

#### Barbarian Class Features (Selection of the Most Architecturally Interesting)

> _These class features demonstrate key engine mechanics: conditional modifiers via `conditionNode`, activated abilities with `ResourcePool` costs, rage upgrade stacking, situational + conditional dual-gating (Indomitable Will), and progressive DR._

```json
[
  {
    "id": "class_feature_barbarian_fast_movement",
    "category": "class_feature",
    "ruleSource": "srd_core",
    "label": { "en": "Fast Movement", "fr": "Deplacement accelere" },
    "description": {
      "en": "A barbarian's land speed is faster than the norm for his race by {@constant.barbarian_fast_movement_bonus|distance}. This benefit applies only when he is wearing no armor, light armor, or medium armor and not carrying a heavy load.",
      "fr": "La vitesse de deplacement terrestre du barbare est superieure a la norme de sa race de {@constant.barbarian_fast_movement_bonus|distance}. Cet avantage ne s'applique que lorsqu'il ne porte pas d'armure, une armure legere ou intermediaire et ne transporte pas une charge lourde."
    },
    "tags": ["class_feature", "barbarian", "extraordinary"],
    "grantedModifiers": [
      {
        "id": "barbarian_fast_movement_speed",
        "sourceId": "class_feature_barbarian_fast_movement",
        "targetId": "attributes.speed_land",
        "value": 10,
        "type": "enhancement",
        "sourceName": { "en": "Fast Movement", "fr": "Deplacement accelere" },
        "conditionNode": {
          "logic": "AND",
          "nodes": [
            {
              "logic": "NOT",
              "node": {
                "logic": "CONDITION",
                "targetPath": "@activeTags",
                "operator": "has_tag",
                "value": "heavy_armor"
              }
            },
            {
              "logic": "NOT",
              "node": {
                "logic": "CONDITION",
                "targetPath": "@activeTags",
                "operator": "has_tag",
                "value": "heavy_load"
              }
            }
          ]
        }
      }
    ],
    "grantedFeatures": []
  },
  {
    "id": "class_feature_barbarian_rage",
    "category": "class_feature",
    "ruleSource": "srd_core",
    "label": { "en": "Rage", "fr": "Rage" },
    "description": {
      "en": "A barbarian can fly into a rage, gaining +4 Strength, +4 Constitution, +2 morale bonus on Will saves, and -2 penalty to AC. The rage lasts 3 + (new) Constitution modifier rounds.",
      "fr": "Le barbare peut entrer en rage, gagnant +4 en Force, +4 en Constitution, +2 bonus de moral aux sauvegardes de Volonte, et -2 a la CA. La rage dure 3 + modificateur de Constitution (nouveau) rounds."
    },
    "tags": ["class_feature", "barbarian", "extraordinary", "rage"],
    "activation": {
      "actionType": "free",
      "resourceCost": { "targetId": "resources.barbarian_rage_uses", "cost": 1 }
    },
    "grantedModifiers": [
      {
        "id": "rage_str_bonus",
        "sourceId": "class_feature_barbarian_rage",
        "targetId": "attributes.stat_str",
        "value": 4,
        "type": "morale",
        "sourceName": { "en": "Rage", "fr": "Rage" }
      },
      {
        "id": "rage_con_bonus",
        "sourceId": "class_feature_barbarian_rage",
        "targetId": "attributes.stat_con",
        "value": 4,
        "type": "morale",
        "sourceName": { "en": "Rage", "fr": "Rage" }
      },
      {
        "id": "rage_will_bonus",
        "sourceId": "class_feature_barbarian_rage",
        "targetId": "saves.will",
        "value": 2,
        "type": "morale",
        "sourceName": { "en": "Rage", "fr": "Rage" }
      },
      {
        "id": "rage_ac_penalty",
        "sourceId": "class_feature_barbarian_rage",
        "targetId": "combatStats.ac_normal",
        "value": -2,
        "type": "untyped",
        "sourceName": { "en": "Rage", "fr": "Rage" }
      },
      {
        "id": "rage_ac_touch_penalty",
        "sourceId": "class_feature_barbarian_rage",
        "targetId": "combatStats.ac_touch",
        "value": -2,
        "type": "untyped",
        "sourceName": { "en": "Rage", "fr": "Rage" }
      }
    ],
    "grantedFeatures": []
  },
  {
    "id": "class_feature_barbarian_greater_rage",
    "category": "class_feature",
    "ruleSource": "srd_core",
    "label": { "en": "Greater Rage", "fr": "Rage superieure" },
    "description": {
      "en": "At 11th level, a barbarian's bonuses to Strength and Constitution during his rage each increase to +6, and his morale bonus on Will saves increases to +3.",
      "fr": "Au niveau 11, les bonus de Force et de Constitution du barbare en rage passent a +6, et son bonus de moral aux sauvegardes de Volonte passe a +3."
    },
    "tags": ["class_feature", "barbarian", "extraordinary", "rage_upgrade"],
    "grantedModifiers": [
      {
        "id": "greater_rage_str_upgrade",
        "sourceId": "class_feature_barbarian_greater_rage",
        "targetId": "attributes.stat_str",
        "value": 2,
        "type": "morale",
        "sourceName": { "en": "Greater Rage", "fr": "Rage superieure" },
        "conditionNode": {
          "logic": "CONDITION",
          "targetPath": "@activeTags",
          "operator": "has_tag",
          "value": "rage"
        }
      },
      {
        "id": "greater_rage_con_upgrade",
        "sourceId": "class_feature_barbarian_greater_rage",
        "targetId": "attributes.stat_con",
        "value": 2,
        "type": "morale",
        "sourceName": { "en": "Greater Rage", "fr": "Rage superieure" },
        "conditionNode": {
          "logic": "CONDITION",
          "targetPath": "@activeTags",
          "operator": "has_tag",
          "value": "rage"
        }
      },
      {
        "id": "greater_rage_will_upgrade",
        "sourceId": "class_feature_barbarian_greater_rage",
        "targetId": "saves.will",
        "value": 1,
        "type": "morale",
        "sourceName": { "en": "Greater Rage", "fr": "Rage superieure" },
        "conditionNode": {
          "logic": "CONDITION",
          "targetPath": "@activeTags",
          "operator": "has_tag",
          "value": "rage"
        }
      }
    ],
    "grantedFeatures": []
  },
  {
    "id": "class_feature_barbarian_dr_1",
    "category": "class_feature",
    "ruleSource": "srd_core",
    "label": { "en": "Damage Reduction 1/—", "fr": "Reduction de degats 1/—" },
    "description": {
      "en": "At 7th level, a barbarian gains damage reduction. Subtract 1 from the damage the barbarian takes each time he is dealt damage from a weapon or a natural attack.",
      "fr": "Au niveau 7, le barbare obtient une reduction de degats. Soustrayez 1 aux degats qu'il subit chaque fois qu'il est touche par une arme ou une attaque naturelle."
    },
    "tags": ["class_feature", "barbarian", "extraordinary", "damage_reduction"],
    "grantedModifiers": [
      {
        "id": "barbarian_dr_1",
        "sourceId": "class_feature_barbarian_dr_1",
        "targetId": "combatStats.damage_reduction",
        "value": 1,
        "type": "base",
        "sourceName": { "en": "Barbarian DR", "fr": "RD Barbare" }
      }
    ],
    "grantedFeatures": []
  },
  {
    "id": "class_feature_barbarian_indomitable_will",
    "category": "class_feature",
    "ruleSource": "srd_core",
    "label": { "en": "Indomitable Will", "fr": "Volonte indomptable" },
    "description": {
      "en": "While in a rage, a barbarian of 14th level or higher gains a +4 bonus on Will saves to resist enchantment spells. This bonus stacks with all other modifiers.",
      "fr": "Lorsqu'il est en rage, un barbare de niveau 14 ou plus obtient un bonus de +4 aux sauvegardes de Volonte contre les sorts d'enchantement. Ce bonus se cumule avec tous les autres modificateurs."
    },
    "tags": ["class_feature", "barbarian", "extraordinary"],
    "grantedModifiers": [
      {
        "id": "indomitable_will_bonus",
        "sourceId": "class_feature_barbarian_indomitable_will",
        "targetId": "saves.will",
        "value": 4,
        "type": "untyped",
        "sourceName": { "en": "Indomitable Will", "fr": "Volonte indomptable" },
        "conditionNode": {
          "logic": "CONDITION",
          "targetPath": "@activeTags",
          "operator": "has_tag",
          "value": "rage"
        },
        "situationalContext": "vs_enchantment"
      }
    ],
    "grantedFeatures": []
  }
]
```

> **AI Implementation Note — Indomitable Will dual gating:** This modifier has BOTH a `conditionNode` (must be raging) AND a `situationalContext` (vs enchantment). The engine must handle this in two stages: (1) During sheet update, the `conditionNode` is evaluated — if the barbarian is not raging, this modifier is completely ignored. (2) If the barbarian IS raging, the modifier passes the condition check but because it has a `situationalContext`, it goes into `situationalModifiers` (not `activeModifiers`). It will only be applied at dice roll time when the roll context includes "enchantment". This is a rare but important edge case.

### A.1.2. Cleric (Base Class — Levels 1-5 + Key Mechanics)

> _This class demonstrates: 3/4 BAB progression, divine spellcasting with spell slots as ResourcePool modifiers, Turn Undead as an activated ability with a formula-based ResourcePool (`3 + @attributes.stat_cha.derivedModifier`), FeatureChoice for domains and deity, and good Fort + Will saves._
>
> _Note: For readability, only the first 5 levels are detailed. The full 20-level progression follows the same pattern._

```json
{
  "id": "class_cleric",
  "category": "class",
  "ruleSource": "srd_core",
  "label": { "en": "Cleric", "fr": "Pretre" },
  "description": {
    "en": "A master of divine magic and a capable warrior as well.",
    "fr": "Un maitre de la magie divine et un guerrier capable egalement."
  },
  "tags": ["class", "base_class", "divine_caster", "class_cleric", "spellcaster"],
  "grantedModifiers": [
    {
      "id": "cleric_hit_die",
      "sourceId": "class_cleric",
      "targetId": "combatStats.hit_die_type",
      "value": 8,
      "type": "base",
      "sourceName": { "en": "Cleric", "fr": "Pretre" }
    },
    {
      "id": "cleric_skill_points",
      "sourceId": "class_cleric",
      "targetId": "attributes.skill_points_per_level",
      "value": 2,
      "type": "base",
      "sourceName": { "en": "Cleric", "fr": "Pretre" }
    }
  ],
  "grantedFeatures": [
    "proficiency_all_simple",
    "proficiency_all_armor",
    "proficiency_shields_except_tower"
  ],
  "choices": [
    {
      "choiceId": "domain_choice_1",
      "label": { "en": "First Domain", "fr": "Premier Domaine" },
      "optionsQuery": "tag:domain",
      "maxSelections": 1
    },
    {
      "choiceId": "domain_choice_2",
      "label": { "en": "Second Domain", "fr": "Second Domaine" },
      "optionsQuery": "tag:domain",
      "maxSelections": 1
    },
    {
      "choiceId": "deity_choice",
      "label": { "en": "Deity", "fr": "Divinite" },
      "optionsQuery": "category:deity",
      "maxSelections": 1
    }
  ],
  "recommendedAttributes": ["stat_wis", "stat_cha"],
  "levelProgression": [
    {
      "level": 1,
      "grantedFeatures": ["class_feature_cleric_turn_undead", "class_feature_cleric_aura", "class_feature_cleric_spellcasting"],
      "grantedModifiers": [
        { "id": "cleric_1_bab", "sourceId": "class_cleric", "targetId": "combatStats.bab", "value": 0, "type": "base", "sourceName": { "en": "Cleric 1", "fr": "Pretre 1" } },
        { "id": "cleric_1_fort", "sourceId": "class_cleric", "targetId": "saves.fort", "value": 2, "type": "base", "sourceName": { "en": "Cleric 1", "fr": "Pretre 1" } },
        { "id": "cleric_1_ref", "sourceId": "class_cleric", "targetId": "saves.ref", "value": 0, "type": "base", "sourceName": { "en": "Cleric 1", "fr": "Pretre 1" } },
        { "id": "cleric_1_will", "sourceId": "class_cleric", "targetId": "saves.will", "value": 2, "type": "base", "sourceName": { "en": "Cleric 1", "fr": "Pretre 1" } },
        { "id": "cleric_1_slots_0", "sourceId": "class_cleric", "targetId": "resources.spell_slots_cleric_0", "value": 3, "type": "base", "sourceName": { "en": "Cleric 1", "fr": "Pretre 1" } },
        { "id": "cleric_1_slots_1", "sourceId": "class_cleric", "targetId": "resources.spell_slots_cleric_1", "value": 1, "type": "base", "sourceName": { "en": "Cleric 1", "fr": "Pretre 1" } },
        { "id": "cleric_1_domain_slots_1", "sourceId": "class_cleric", "targetId": "resources.spell_slots_cleric_domain_1", "value": 1, "type": "base", "sourceName": { "en": "Cleric 1 (Domain)", "fr": "Pretre 1 (Domaine)" } }
      ]
    },
    {
      "level": 2,
      "grantedFeatures": [],
      "grantedModifiers": [
        { "id": "cleric_2_bab", "sourceId": "class_cleric", "targetId": "combatStats.bab", "value": 1, "type": "base", "sourceName": { "en": "Cleric 2", "fr": "Pretre 2" } },
        { "id": "cleric_2_fort", "sourceId": "class_cleric", "targetId": "saves.fort", "value": 1, "type": "base", "sourceName": { "en": "Cleric 2", "fr": "Pretre 2" } },
        { "id": "cleric_2_will", "sourceId": "class_cleric", "targetId": "saves.will", "value": 1, "type": "base", "sourceName": { "en": "Cleric 2", "fr": "Pretre 2" } },
        { "id": "cleric_2_slots_0", "sourceId": "class_cleric", "targetId": "resources.spell_slots_cleric_0", "value": 1, "type": "base", "sourceName": { "en": "Cleric 2", "fr": "Pretre 2" } },
        { "id": "cleric_2_slots_1", "sourceId": "class_cleric", "targetId": "resources.spell_slots_cleric_1", "value": 1, "type": "base", "sourceName": { "en": "Cleric 2", "fr": "Pretre 2" } }
      ]
    },
    {
      "level": 3,
      "grantedFeatures": [],
      "grantedModifiers": [
        { "id": "cleric_3_bab", "sourceId": "class_cleric", "targetId": "combatStats.bab", "value": 1, "type": "base", "sourceName": { "en": "Cleric 3", "fr": "Pretre 3" } },
        { "id": "cleric_3_ref", "sourceId": "class_cleric", "targetId": "saves.ref", "value": 1, "type": "base", "sourceName": { "en": "Cleric 3", "fr": "Pretre 3" } },
        { "id": "cleric_3_slots_2", "sourceId": "class_cleric", "targetId": "resources.spell_slots_cleric_2", "value": 1, "type": "base", "sourceName": { "en": "Cleric 3", "fr": "Pretre 3" } },
        { "id": "cleric_3_domain_slots_2", "sourceId": "class_cleric", "targetId": "resources.spell_slots_cleric_domain_2", "value": 1, "type": "base", "sourceName": { "en": "Cleric 3 (Domain)", "fr": "Pretre 3 (Domaine)" } }
      ]
    },
    {
      "level": 4,
      "grantedFeatures": [],
      "grantedModifiers": [
        { "id": "cleric_4_bab", "sourceId": "class_cleric", "targetId": "combatStats.bab", "value": 1, "type": "base", "sourceName": { "en": "Cleric 4", "fr": "Pretre 4" } },
        { "id": "cleric_4_fort", "sourceId": "class_cleric", "targetId": "saves.fort", "value": 1, "type": "base", "sourceName": { "en": "Cleric 4", "fr": "Pretre 4" } },
        { "id": "cleric_4_will", "sourceId": "class_cleric", "targetId": "saves.will", "value": 1, "type": "base", "sourceName": { "en": "Cleric 4", "fr": "Pretre 4" } },
        { "id": "cleric_4_slots_0", "sourceId": "class_cleric", "targetId": "resources.spell_slots_cleric_0", "value": 1, "type": "base", "sourceName": { "en": "Cleric 4", "fr": "Pretre 4" } },
        { "id": "cleric_4_slots_1", "sourceId": "class_cleric", "targetId": "resources.spell_slots_cleric_1", "value": 1, "type": "base", "sourceName": { "en": "Cleric 4", "fr": "Pretre 4" } },
        { "id": "cleric_4_slots_2", "sourceId": "class_cleric", "targetId": "resources.spell_slots_cleric_2", "value": 1, "type": "base", "sourceName": { "en": "Cleric 4", "fr": "Pretre 4" } }
      ]
    },
    {
      "level": 5,
      "grantedFeatures": [],
      "grantedModifiers": [
        { "id": "cleric_5_slots_1", "sourceId": "class_cleric", "targetId": "resources.spell_slots_cleric_1", "value": 0, "type": "base", "sourceName": { "en": "Cleric 5", "fr": "Pretre 5" } },
        { "id": "cleric_5_slots_3", "sourceId": "class_cleric", "targetId": "resources.spell_slots_cleric_3", "value": 1, "type": "base", "sourceName": { "en": "Cleric 5", "fr": "Pretre 5" } },
        { "id": "cleric_5_domain_slots_3", "sourceId": "class_cleric", "targetId": "resources.spell_slots_cleric_domain_3", "value": 1, "type": "base", "sourceName": { "en": "Cleric 5 (Domain)", "fr": "Pretre 5 (Domaine)" } }
      ]
    }
  ]
}
```

#### Cleric: Turn Undead Feature

> _Demonstrates a ResourcePool with a formula-based maximum that references another pipeline (`stat_cha.derivedModifier`). The Math Parser must resolve this at runtime._

```json
{
  "id": "class_feature_cleric_turn_undead",
  "category": "class_feature",
  "ruleSource": "srd_core",
  "label": { "en": "Turn or Rebuke Undead", "fr": "Renvoi ou Intimidation des morts-vivants" },
  "description": {
    "en": "A cleric may attempt to turn undead a number of times per day equal to 3 + his Charisma modifier.",
    "fr": "Un pretre peut tenter de renvoyer les morts-vivants un nombre de fois par jour egal a 3 + son modificateur de Charisme."
  },
  "tags": ["class_feature", "cleric", "supernatural", "turn_undead"],
  "activation": {
    "actionType": "standard",
    "resourceCost": { "targetId": "resources.turn_undead_uses", "cost": 1 }
  },
  "grantedModifiers": [
    {
      "id": "turn_undead_uses_max",
      "sourceId": "class_feature_cleric_turn_undead",
      "targetId": "resources.turn_undead_uses.maxValue",
      "value": "3 + @attributes.stat_cha.derivedModifier",
      "type": "base",
      "sourceName": { "en": "Turn Undead", "fr": "Renvoi des morts-vivants" }
    }
  ],
  "grantedFeatures": []
}
```

#### Example Domain: War

```json
{
  "id": "domain_war",
  "category": "domain",
  "ruleSource": "srd_core",
  "label": { "en": "War Domain", "fr": "Domaine de la Guerre" },
  "description": {
    "en": "The War domain grants proficiency with your deity's favored weapon and Weapon Focus with that weapon.",
    "fr": "Le domaine de la Guerre accorde la maitrise de l'arme de predilection de votre divinite et le don Arme de predilection avec cette arme."
  },
  "tags": ["domain", "war"],
  "grantedModifiers": [],
  "grantedFeatures": ["feat_weapon_focus_deity_weapon", "proficiency_deity_weapon"],
  "choices": []
}
```

### A.1.3. Monk (Base Class — Levels 1-5 + Key Mechanics)

> _This class demonstrates unique mechanics: conditional AC bonus (Wisdom to AC when unarmored, applied to both normal and touch AC), progressive unarmed damage using `setAbsolute` to override the damage die at each tier, progressive speed bonus, all-good saves, and alignment restrictions via `forbiddenTags`._

```json
{
  "id": "class_monk",
  "category": "class",
  "ruleSource": "srd_core",
  "label": { "en": "Monk", "fr": "Moine" },
  "description": {
    "en": "A martial artist whose unarmed strikes hit fast and hard—a monk needs no weapons.",
    "fr": "Un artiste martial dont les frappes à mains nues sont rapides et puissantes — un moine n'a pas besoin d'armes."
  },
  "tags": ["class", "base_class", "class_monk"],
  "forbiddenTags": ["alignment_chaotic", "alignment_neutral_ethical"],
  "grantedModifiers": [
    {
      "id": "monk_hit_die",
      "sourceId": "class_monk",
      "targetId": "combatStats.hit_die_type",
      "value": 8,
      "type": "base",
      "sourceName": { "en": "Monk", "fr": "Moine" }
    },
    {
      "id": "monk_skill_points",
      "sourceId": "class_monk",
      "targetId": "attributes.skill_points_per_level",
      "value": 4,
      "type": "base",
      "sourceName": { "en": "Monk", "fr": "Moine" }
    }
  ],
  "grantedFeatures": [
    "proficiency_monk_weapons",
    "class_feature_monk_ac_bonus",
    "class_feature_monk_unarmed_strike"
  ],
  "recommendedAttributes": ["stat_wis", "stat_dex", "stat_str"],
  "levelProgression": [
    {
      "level": 1,
      "grantedFeatures": ["class_feature_monk_flurry_of_blows", "class_feature_monk_bonus_feat_1"],
      "grantedModifiers": [
        { "id": "monk_1_bab", "sourceId": "class_monk", "targetId": "combatStats.bab", "value": 0, "type": "base", "sourceName": { "en": "Monk 1", "fr": "Moine 1" } },
        { "id": "monk_1_fort", "sourceId": "class_monk", "targetId": "saves.fort", "value": 2, "type": "base", "sourceName": { "en": "Monk 1", "fr": "Moine 1" } },
        { "id": "monk_1_ref", "sourceId": "class_monk", "targetId": "saves.ref", "value": 2, "type": "base", "sourceName": { "en": "Monk 1", "fr": "Moine 1" } },
        { "id": "monk_1_will", "sourceId": "class_monk", "targetId": "saves.will", "value": 2, "type": "base", "sourceName": { "en": "Monk 1", "fr": "Moine 1" } },
        { "id": "monk_1_unarmed", "sourceId": "class_monk", "targetId": "combatStats.unarmed_damage", "value": "1d6", "type": "setAbsolute", "sourceName": { "en": "Monk 1", "fr": "Moine 1" } }
      ]
    },
    {
      "level": 2,
      "grantedFeatures": ["class_feature_monk_bonus_feat_2", "class_feature_evasion"],
      "grantedModifiers": [
        { "id": "monk_2_bab", "sourceId": "class_monk", "targetId": "combatStats.bab", "value": 1, "type": "base", "sourceName": { "en": "Monk 2", "fr": "Moine 2" } },
        { "id": "monk_2_fort", "sourceId": "class_monk", "targetId": "saves.fort", "value": 1, "type": "base", "sourceName": { "en": "Monk 2", "fr": "Moine 2" } },
        { "id": "monk_2_ref", "sourceId": "class_monk", "targetId": "saves.ref", "value": 1, "type": "base", "sourceName": { "en": "Monk 2", "fr": "Moine 2" } },
        { "id": "monk_2_will", "sourceId": "class_monk", "targetId": "saves.will", "value": 1, "type": "base", "sourceName": { "en": "Monk 2", "fr": "Moine 2" } }
      ]
    },
    {
      "level": 3,
      "grantedFeatures": ["class_feature_monk_still_mind"],
      "grantedModifiers": [
        { "id": "monk_3_bab", "sourceId": "class_monk", "targetId": "combatStats.bab", "value": 1, "type": "base", "sourceName": { "en": "Monk 3", "fr": "Moine 3" } },
        { "id": "monk_3_speed", "sourceId": "class_monk", "targetId": "attributes.speed_land", "value": 10, "type": "enhancement", "sourceName": { "en": "Monk 3", "fr": "Moine 3" } }
      ]
    },
    {
      "level": 4,
      "grantedFeatures": ["class_feature_monk_ki_strike_magic", "class_feature_monk_slow_fall_20"],
      "grantedModifiers": [
        { "id": "monk_4_bab", "sourceId": "class_monk", "targetId": "combatStats.bab", "value": 1, "type": "base", "sourceName": { "en": "Monk 4", "fr": "Moine 4" } },
        { "id": "monk_4_fort", "sourceId": "class_monk", "targetId": "saves.fort", "value": 1, "type": "base", "sourceName": { "en": "Monk 4", "fr": "Moine 4" } },
        { "id": "monk_4_ref", "sourceId": "class_monk", "targetId": "saves.ref", "value": 1, "type": "base", "sourceName": { "en": "Monk 4", "fr": "Moine 4" } },
        { "id": "monk_4_will", "sourceId": "class_monk", "targetId": "saves.will", "value": 1, "type": "base", "sourceName": { "en": "Monk 4", "fr": "Moine 4" } },
        { "id": "monk_4_unarmed", "sourceId": "class_monk", "targetId": "combatStats.unarmed_damage", "value": "1d8", "type": "setAbsolute", "sourceName": { "en": "Monk 4", "fr": "Moine 4" } }
      ]
    },
    {
      "level": 5,
      "grantedFeatures": ["class_feature_monk_purity_of_body"],
      "grantedModifiers": [
        { "id": "monk_5_ac", "sourceId": "class_monk", "targetId": "combatStats.ac_normal", "value": 1, "type": "untyped", "sourceName": { "en": "Monk AC Bonus", "fr": "Bonus CA Moine" },
          "conditionNode": {
            "logic": "AND",
            "nodes": [
              { "logic": "NOT", "node": { "logic": "CONDITION", "targetPath": "@activeTags", "operator": "has_tag", "value": "wearing_armor" } },
              { "logic": "NOT", "node": { "logic": "CONDITION", "targetPath": "@activeTags", "operator": "has_tag", "value": "carrying_shield" } }
            ]
          }
        }
      ]
    }
  ]
}
```

> **AI Implementation Note — Monk AC Bonus:** The `value` field is a formula string `"@attributes.stat_wis.derivedModifier"`, not a number. The Math Parser MUST resolve this formula against the character's current Wisdom score. This means the Monk's AC updates automatically when Wisdom changes, without any hardcoded logic. This is a critical test case for the formula resolution system.

> **AI Implementation Note — Unarmed Damage with setAbsolute:** At Monk level 1, unarmed damage is set to "1d6" via `setAbsolute`. At level 4, it's overridden to "1d8". The engine must handle `setAbsolute` with string values (dice expressions), not just numbers. The last `setAbsolute` in level order wins.

---

## A.2. Prestige Class

### A.2.1. Dragon Disciple (10 Levels)

> _This class demonstrates: prestige class with complex `prerequisitesNode` (NOT dragon + NOT half-dragon + skill ranks + spontaneous arcane caster tag), ability score increases at specific levels (not via racial type — these are untyped bonuses that stack), progressive natural armor, Wings granting fly speed via formula (`@attributes.speed_land.totalValue`), Dragon Apotheosis as a capstone transformation, FeatureChoice for dragon variety, and bonus spells._

```json
{
  "id": "class_dragon_disciple",
  "category": "class",
  "ruleSource": "srd_core",
  "label": { "en": "Dragon Disciple", "fr": "Disciple Draconique" },
  "description": {
    "en": "A prestige class for those who seek to unlock the power of their draconic heritage.",
    "fr": "Une classe de prestige pour ceux qui cherchent à libérer le pouvoir de leur héritage draconique."
  },
  "tags": ["class", "prestige_class", "class_dragon_disciple"],
  "prerequisitesNode": {
    "logic": "AND",
    "nodes": [
      {
        "logic": "NOT",
        "node": {
          "logic": "CONDITION",
          "targetPath": "@activeTags",
          "operator": "has_tag",
          "value": "race_dragon",
          "errorMessage": "Cannot already be a dragon"
        }
      },
      {
        "logic": "NOT",
        "node": {
          "logic": "CONDITION",
          "targetPath": "@activeTags",
          "operator": "has_tag",
          "value": "template_half_dragon",
          "errorMessage": "Cannot already be a half-dragon"
        }
      },
      {
        "logic": "CONDITION",
        "targetPath": "@skills.skill_knowledge_arcana.ranks",
        "operator": ">=",
        "value": 8,
        "errorMessage": "Requires 8 ranks in Knowledge (Arcana)"
      },
      {
        "logic": "CONDITION",
        "targetPath": "@activeTags",
        "operator": "has_tag",
        "value": "arcane_caster_spontaneous",
        "errorMessage": "Must be able to cast arcane spells without preparation"
      }
    ]
  },
  "grantedModifiers": [
    {
      "id": "dragon_disciple_hit_die",
      "sourceId": "class_dragon_disciple",
      "targetId": "combatStats.hit_die_type",
      "value": 12,
      "type": "base",
      "sourceName": { "en": "Dragon Disciple", "fr": "Disciple Draconique" }
    },
    {
      "id": "dragon_disciple_skill_points",
      "sourceId": "class_dragon_disciple",
      "targetId": "attributes.skill_points_per_level",
      "value": 2,
      "type": "base",
      "sourceName": { "en": "Dragon Disciple", "fr": "Disciple Draconique" }
    }
  ],
  "grantedFeatures": [],
  "choices": [
    {
      "choiceId": "dragon_variety",
      "label": { "en": "Dragon Variety", "fr": "Type de dragon" },
      "optionsQuery": "tag:dragon_ancestry",
      "maxSelections": 1
    }
  ],
  "recommendedAttributes": ["stat_str", "stat_con", "stat_cha"],
  "levelProgression": [
    {
      "level": 1,
      "grantedFeatures": ["class_feature_dd_natural_armor_1", "class_feature_dd_bonus_spell"],
      "grantedModifiers": [
        { "id": "dd_1_bab", "sourceId": "class_dragon_disciple", "targetId": "combatStats.bab", "value": 0, "type": "base", "sourceName": { "en": "Dragon Disciple 1", "fr": "Disciple Draconique 1" } },
        { "id": "dd_1_fort", "sourceId": "class_dragon_disciple", "targetId": "saves.fort", "value": 2, "type": "base", "sourceName": { "en": "Dragon Disciple 1", "fr": "Disciple Draconique 1" } },
        { "id": "dd_1_ref", "sourceId": "class_dragon_disciple", "targetId": "saves.ref", "value": 0, "type": "base", "sourceName": { "en": "Dragon Disciple 1", "fr": "Disciple Draconique 1" } },
        { "id": "dd_1_will", "sourceId": "class_dragon_disciple", "targetId": "saves.will", "value": 2, "type": "base", "sourceName": { "en": "Dragon Disciple 1", "fr": "Disciple Draconique 1" } },
        { "id": "dd_1_nat_armor", "sourceId": "class_dragon_disciple", "targetId": "combatStats.ac_normal", "value": 1, "type": "natural_armor", "sourceName": { "en": "Dragon Disciple Natural Armor", "fr": "Armure naturelle Disciple Draconique" } }
      ]
    },
    {
      "level": 2,
      "grantedFeatures": ["class_feature_dd_claws_and_bite", "class_feature_dd_bonus_spell"],
      "grantedModifiers": [
        { "id": "dd_2_bab", "sourceId": "class_dragon_disciple", "targetId": "combatStats.bab", "value": 1, "type": "base", "sourceName": { "en": "Dragon Disciple 2", "fr": "Disciple Draconique 2" } },
        { "id": "dd_2_fort", "sourceId": "class_dragon_disciple", "targetId": "saves.fort", "value": 1, "type": "base", "sourceName": { "en": "Dragon Disciple 2", "fr": "Disciple Draconique 2" } },
        { "id": "dd_2_will", "sourceId": "class_dragon_disciple", "targetId": "saves.will", "value": 1, "type": "base", "sourceName": { "en": "Dragon Disciple 2", "fr": "Disciple Draconique 2" } },
        { "id": "dd_2_str", "sourceId": "class_dragon_disciple", "targetId": "attributes.stat_str", "value": 2, "type": "untyped", "sourceName": { "en": "Dragon Disciple Str +2", "fr": "Disciple Draconique For +2" } }
      ]
    },
    {
      "level": 3,
      "grantedFeatures": ["class_feature_dd_breath_weapon_2d8"],
      "grantedModifiers": [
        { "id": "dd_3_bab", "sourceId": "class_dragon_disciple", "targetId": "combatStats.bab", "value": 1, "type": "base", "sourceName": { "en": "Dragon Disciple 3", "fr": "Disciple Draconique 3" } },
        { "id": "dd_3_ref", "sourceId": "class_dragon_disciple", "targetId": "saves.ref", "value": 1, "type": "base", "sourceName": { "en": "Dragon Disciple 3", "fr": "Disciple Draconique 3" } }
      ]
    },
    {
      "level": 4,
      "grantedFeatures": ["class_feature_dd_bonus_spell"],
      "grantedModifiers": [
        { "id": "dd_4_bab", "sourceId": "class_dragon_disciple", "targetId": "combatStats.bab", "value": 1, "type": "base", "sourceName": { "en": "Dragon Disciple 4", "fr": "Disciple Draconique 4" } },
        { "id": "dd_4_fort", "sourceId": "class_dragon_disciple", "targetId": "saves.fort", "value": 1, "type": "base", "sourceName": { "en": "Dragon Disciple 4", "fr": "Disciple Draconique 4" } },
        { "id": "dd_4_will", "sourceId": "class_dragon_disciple", "targetId": "saves.will", "value": 1, "type": "base", "sourceName": { "en": "Dragon Disciple 4", "fr": "Disciple Draconique 4" } },
        { "id": "dd_4_str", "sourceId": "class_dragon_disciple", "targetId": "attributes.stat_str", "value": 2, "type": "untyped", "sourceName": { "en": "Dragon Disciple Str +2", "fr": "Disciple Draconique For +2" } },
        { "id": "dd_4_nat_armor", "sourceId": "class_dragon_disciple", "targetId": "combatStats.ac_normal", "value": 1, "type": "natural_armor", "sourceName": { "en": "Dragon Disciple Natural Armor", "fr": "Armure naturelle Disciple Draconique" } }
      ]
    },
    {
      "level": 5,
      "grantedFeatures": ["class_feature_dd_blindsense_30", "class_feature_dd_bonus_spell"],
      "grantedModifiers": [
        { "id": "dd_5_ref", "sourceId": "class_dragon_disciple", "targetId": "saves.ref", "value": 0, "type": "base", "sourceName": { "en": "Dragon Disciple 5", "fr": "Disciple Draconique 5" } }
      ]
    },
    {
      "level": 6,
      "grantedFeatures": ["class_feature_dd_bonus_spell"],
      "grantedModifiers": [
        { "id": "dd_6_bab", "sourceId": "class_dragon_disciple", "targetId": "combatStats.bab", "value": 1, "type": "base", "sourceName": { "en": "Dragon Disciple 6", "fr": "Disciple Draconique 6" } },
        { "id": "dd_6_fort", "sourceId": "class_dragon_disciple", "targetId": "saves.fort", "value": 1, "type": "base", "sourceName": { "en": "Dragon Disciple 6", "fr": "Disciple Draconique 6" } },
        { "id": "dd_6_ref", "sourceId": "class_dragon_disciple", "targetId": "saves.ref", "value": 1, "type": "base", "sourceName": { "en": "Dragon Disciple 6", "fr": "Disciple Draconique 6" } },
        { "id": "dd_6_will", "sourceId": "class_dragon_disciple", "targetId": "saves.will", "value": 1, "type": "base", "sourceName": { "en": "Dragon Disciple 6", "fr": "Disciple Draconique 6" } },
        { "id": "dd_6_con", "sourceId": "class_dragon_disciple", "targetId": "attributes.stat_con", "value": 2, "type": "untyped", "sourceName": { "en": "Dragon Disciple Con +2", "fr": "Disciple Draconique Con +2" } }
      ]
    },
    {
      "level": 7,
      "grantedFeatures": ["class_feature_dd_breath_weapon_4d8"],
      "grantedModifiers": [
        { "id": "dd_7_bab", "sourceId": "class_dragon_disciple", "targetId": "combatStats.bab", "value": 1, "type": "base", "sourceName": { "en": "Dragon Disciple 7", "fr": "Disciple Draconique 7" } },
        { "id": "dd_7_nat_armor", "sourceId": "class_dragon_disciple", "targetId": "combatStats.ac_normal", "value": 1, "type": "natural_armor", "sourceName": { "en": "Dragon Disciple Natural Armor", "fr": "Armure naturelle Disciple Draconique" } }
      ]
    },
    {
      "level": 8,
      "grantedFeatures": ["class_feature_dd_bonus_spell"],
      "grantedModifiers": [
        { "id": "dd_8_bab", "sourceId": "class_dragon_disciple", "targetId": "combatStats.bab", "value": 1, "type": "base", "sourceName": { "en": "Dragon Disciple 8", "fr": "Disciple Draconique 8" } },
        { "id": "dd_8_fort", "sourceId": "class_dragon_disciple", "targetId": "saves.fort", "value": 1, "type": "base", "sourceName": { "en": "Dragon Disciple 8", "fr": "Disciple Draconique 8" } },
        { "id": "dd_8_will", "sourceId": "class_dragon_disciple", "targetId": "saves.will", "value": 1, "type": "base", "sourceName": { "en": "Dragon Disciple 8", "fr": "Disciple Draconique 8" } },
        { "id": "dd_8_int", "sourceId": "class_dragon_disciple", "targetId": "attributes.stat_int", "value": 2, "type": "untyped", "sourceName": { "en": "Dragon Disciple Int +2", "fr": "Disciple Draconique Int +2" } }
      ]
    },
    {
      "level": 9,
      "grantedFeatures": ["class_feature_dd_wings", "class_feature_dd_bonus_spell"],
      "grantedModifiers": [
        { "id": "dd_9_ref", "sourceId": "class_dragon_disciple", "targetId": "saves.ref", "value": 1, "type": "base", "sourceName": { "en": "Dragon Disciple 9", "fr": "Disciple Draconique 9" } },
        { "id": "dd_9_fly_speed", "sourceId": "class_dragon_disciple", "targetId": "attributes.speed_fly", "value": "@attributes.speed_land.totalValue", "type": "base", "sourceName": { "en": "Dragon Wings", "fr": "Ailes draconiques" } }
      ]
    },
    {
      "level": 10,
      "grantedFeatures": ["class_feature_dd_blindsense_60", "class_feature_dd_dragon_apotheosis"],
      "grantedModifiers": [
        { "id": "dd_10_bab", "sourceId": "class_dragon_disciple", "targetId": "combatStats.bab", "value": 1, "type": "base", "sourceName": { "en": "Dragon Disciple 10", "fr": "Disciple Draconique 10" } },
        { "id": "dd_10_fort", "sourceId": "class_dragon_disciple", "targetId": "saves.fort", "value": 1, "type": "base", "sourceName": { "en": "Dragon Disciple 10", "fr": "Disciple Draconique 10" } },
        { "id": "dd_10_will", "sourceId": "class_dragon_disciple", "targetId": "saves.will", "value": 1, "type": "base", "sourceName": { "en": "Dragon Disciple 10", "fr": "Disciple Draconique 10" } },
        { "id": "dd_10_str", "sourceId": "class_dragon_disciple", "targetId": "attributes.stat_str", "value": 4, "type": "untyped", "sourceName": { "en": "Dragon Apotheosis Str", "fr": "Apothéose draconique For" } },
        { "id": "dd_10_cha", "sourceId": "class_dragon_disciple", "targetId": "attributes.stat_cha", "value": 2, "type": "untyped", "sourceName": { "en": "Dragon Apotheosis Cha", "fr": "Apothéose draconique Cha" } },
        { "id": "dd_10_nat_armor", "sourceId": "class_dragon_disciple", "targetId": "combatStats.ac_normal", "value": 1, "type": "natural_armor", "sourceName": { "en": "Dragon Disciple Natural Armor", "fr": "Armure naturelle Disciple Draconique" } }
      ]
    }
  ]
}
```

---

## A.3. Races

### A.3.1. Human

> _Demonstrates: no ability score modifiers (unique among core races), bonus skill points (both 1st level ×4 and per-level), bonus feat slot as a racial modifier targeting a custom pipeline, and base land speed._

```json
{
  "id": "race_human",
  "category": "race",
  "ruleSource": "srd_core",
  "label": { "en": "Human", "fr": "Humain" },
  "description": {
    "en": "Humans are the most adaptable, flexible, and ambitious people among the common races.",
    "fr": "Les humains sont les plus adaptables, flexibles et ambitieux parmi les races courantes."
  },
  "tags": ["race", "humanoid", "medium", "race_human"],
  "grantedModifiers": [
    {
      "id": "human_speed",
      "sourceId": "race_human",
      "targetId": "attributes.speed_land",
      "value": 30,
      "type": "base",
      "sourceName": { "en": "Human", "fr": "Humain" }
    },
    {
      "id": "human_bonus_skill_1st",
      "sourceId": "race_human",
      "targetId": "attributes.bonus_skill_points_1st_level",
      "value": 4,
      "type": "racial",
      "sourceName": { "en": "Human Versatility", "fr": "Polyvalence humaine" }
    },
    {
      "id": "human_bonus_skill_per_level",
      "sourceId": "race_human",
      "targetId": "attributes.bonus_skill_points_per_level",
      "value": 1,
      "type": "racial",
      "sourceName": { "en": "Human Versatility", "fr": "Polyvalence humaine" }
    },
    {
      "id": "human_bonus_feat",
      "sourceId": "race_human",
      "targetId": "attributes.bonus_feat_slots",
      "value": 1,
      "type": "racial",
      "sourceName": { "en": "Human Bonus Feat", "fr": "Don supplémentaire humain" }
    }
  ],
  "grantedFeatures": ["language_common"],
  "choices": []
}
```

### A.3.2. Elf

> _Demonstrates: racial ability score modifiers (+2 DEX, -2 CON), situational modifier (enchantment save bonus with `situationalContext: "vs_enchantment"`), racial skill bonuses, granted features (immunities, senses, weapon proficiencies, languages), and no FeatureChoice._

```json
{
  "id": "race_elf",
  "category": "race",
  "ruleSource": "srd_core",
  "label": { "en": "Elf", "fr": "Elfe" },
  "description": {
    "en": "Elves are known for their poetry, song, and magical arts, but when danger threatens they show great skill with weapons and strategy.",
    "fr": "Les elfes sont connus pour leur poésie, leur chant et leurs arts magiques, mais lorsque le danger menace, ils montrent une grande habileté avec les armes et la stratégie."
  },
  "tags": ["race", "humanoid", "medium", "race_elf"],
  "grantedModifiers": [
    {
      "id": "elf_dex_bonus",
      "sourceId": "race_elf",
      "targetId": "attributes.stat_dex",
      "value": 2,
      "type": "racial",
      "sourceName": { "en": "Elf", "fr": "Elfe" }
    },
    {
      "id": "elf_con_penalty",
      "sourceId": "race_elf",
      "targetId": "attributes.stat_con",
      "value": -2,
      "type": "racial",
      "sourceName": { "en": "Elf", "fr": "Elfe" }
    },
    {
      "id": "elf_speed",
      "sourceId": "race_elf",
      "targetId": "attributes.speed_land",
      "value": 30,
      "type": "base",
      "sourceName": { "en": "Elf", "fr": "Elfe" }
    },
    {
      "id": "elf_enchantment_save",
      "sourceId": "race_elf",
      "targetId": "saves.will",
      "value": 2,
      "type": "racial",
      "sourceName": { "en": "Elf Enchantment Resistance", "fr": "Résistance elfique aux enchantements" },
      "situationalContext": "vs_enchantment"
    },
    {
      "id": "elf_listen",
      "sourceId": "race_elf",
      "targetId": "skills.skill_listen",
      "value": 2,
      "type": "racial",
      "sourceName": { "en": "Elf", "fr": "Elfe" }
    },
    {
      "id": "elf_search",
      "sourceId": "race_elf",
      "targetId": "skills.skill_search",
      "value": 2,
      "type": "racial",
      "sourceName": { "en": "Elf", "fr": "Elfe" }
    },
    {
      "id": "elf_spot",
      "sourceId": "race_elf",
      "targetId": "skills.skill_spot",
      "value": 2,
      "type": "racial",
      "sourceName": { "en": "Elf", "fr": "Elfe" }
    }
  ],
  "grantedFeatures": [
    "immunity_sleep_magic",
    "sense_low_light_vision",
    "proficiency_longsword",
    "proficiency_rapier",
    "proficiency_longbow",
    "proficiency_shortbow",
    "language_common",
    "language_elven"
  ],
  "choices": []
}
```

### A.3.3. Gnome

> _Demonstrates Small size: size bonuses to AC, attack, and Hide (as `size` type modifiers), reduced speed (20 ft), situational combat bonuses (vs kobolds/goblinoids for attack, vs giants for dodge AC), racial saving throw bonus vs illusions, spell DC bonus for illusion school, and spell-like abilities as granted features._

```json
{
  "id": "race_gnome",
  "category": "race",
  "ruleSource": "srd_core",
  "label": { "en": "Gnome", "fr": "Gnome" },
  "description": {
    "en": "Gnomes are welcome everywhere as technicians, alchemists, and inventors.",
    "fr": "Les gnomes sont les bienvenus partout en tant que techniciens, alchimistes et inventeurs."
  },
  "tags": ["race", "humanoid", "small", "race_gnome"],
  "grantedModifiers": [
    {
      "id": "gnome_con_bonus",
      "sourceId": "race_gnome",
      "targetId": "attributes.stat_con",
      "value": 2,
      "type": "racial",
      "sourceName": { "en": "Gnome", "fr": "Gnome" }
    },
    {
      "id": "gnome_str_penalty",
      "sourceId": "race_gnome",
      "targetId": "attributes.stat_str",
      "value": -2,
      "type": "racial",
      "sourceName": { "en": "Gnome", "fr": "Gnome" }
    },
    {
      "id": "gnome_size_ac",
      "sourceId": "race_gnome",
      "targetId": "combatStats.ac_normal",
      "value": 1,
      "type": "size",
      "sourceName": { "en": "Small Size", "fr": "Petite taille" }
    },
    {
      "id": "gnome_size_attack",
      "sourceId": "race_gnome",
      "targetId": "combatStats.attack_bonus",
      "value": 1,
      "type": "size",
      "sourceName": { "en": "Small Size", "fr": "Petite taille" }
    },
    {
      "id": "gnome_size_hide",
      "sourceId": "race_gnome",
      "targetId": "skills.skill_hide",
      "value": 4,
      "type": "size",
      "sourceName": { "en": "Small Size", "fr": "Petite taille" }
    },
    {
      "id": "gnome_speed",
      "sourceId": "race_gnome",
      "targetId": "attributes.speed_land",
      "value": 20,
      "type": "base",
      "sourceName": { "en": "Gnome", "fr": "Gnome" }
    },
    {
      "id": "gnome_illusion_save",
      "sourceId": "race_gnome",
      "targetId": "saves.will",
      "value": 2,
      "type": "racial",
      "sourceName": { "en": "Gnome Illusion Resistance", "fr": "Résistance gnome aux illusions" },
      "situationalContext": "vs_illusion"
    },
    {
      "id": "gnome_illusion_dc",
      "sourceId": "race_gnome",
      "targetId": "attributes.spell_dc_illusion",
      "value": 1,
      "type": "racial",
      "sourceName": { "en": "Gnome Illusion Mastery", "fr": "Maîtrise gnome des illusions" }
    },
    {
      "id": "gnome_attack_kobolds",
      "sourceId": "race_gnome",
      "targetId": "combatStats.attack_bonus",
      "value": 1,
      "type": "racial",
      "sourceName": { "en": "Gnome vs Kobolds/Goblinoids", "fr": "Gnome vs Kobolds/Gobelinoïdes" },
      "situationalContext": "vs_kobold_goblinoid"
    },
    {
      "id": "gnome_dodge_giants",
      "sourceId": "race_gnome",
      "targetId": "combatStats.ac_normal",
      "value": 4,
      "type": "dodge",
      "sourceName": { "en": "Gnome vs Giants", "fr": "Gnome vs Géants" },
      "situationalContext": "vs_giant"
    },
    {
      "id": "gnome_listen",
      "sourceId": "race_gnome",
      "targetId": "skills.skill_listen",
      "value": 2,
      "type": "racial",
      "sourceName": { "en": "Gnome", "fr": "Gnome" }
    },
    {
      "id": "gnome_craft_alchemy",
      "sourceId": "race_gnome",
      "targetId": "skills.skill_craft_alchemy",
      "value": 2,
      "type": "racial",
      "sourceName": { "en": "Gnome", "fr": "Gnome" }
    }
  ],
  "grantedFeatures": [
    "sense_low_light_vision",
    "language_common",
    "language_gnome",
    "spell_like_speak_with_animals_burrowing",
    "spell_like_gnome_cantrips"
  ],
  "choices": []
}
```

### A.3.4. Dromite (Psionic Race)

> _Demonstrates: non-standard creature type (monstrous_humanoid — not subject to humanoid-only effects), natural armor (+3 as `natural_armor` type), bonus power points as a racial modifier, FeatureChoice for chitin energy resistance type, psi-like ability as a granted feature, and bonus feat (Blind-Fight) as a granted feature._

```json
{
  "id": "race_dromite",
  "category": "race",
  "ruleSource": "srd_psionics",
  "label": { "en": "Dromite", "fr": "Dromite" },
  "description": {
    "en": "Dromites are Small, insectoid creatures with a hive-like society and innate psionic ability.",
    "fr": "Les dromites sont de petites créatures insectoïdes avec une société de type ruche et des capacités psioniques innées."
  },
  "tags": ["race", "monstrous_humanoid", "small", "race_dromite", "psionic"],
  "grantedModifiers": [
    {
      "id": "dromite_cha_bonus",
      "sourceId": "race_dromite",
      "targetId": "attributes.stat_cha",
      "value": 2,
      "type": "racial",
      "sourceName": { "en": "Dromite", "fr": "Dromite" }
    },
    {
      "id": "dromite_str_penalty",
      "sourceId": "race_dromite",
      "targetId": "attributes.stat_str",
      "value": -2,
      "type": "racial",
      "sourceName": { "en": "Dromite", "fr": "Dromite" }
    },
    {
      "id": "dromite_wis_penalty",
      "sourceId": "race_dromite",
      "targetId": "attributes.stat_wis",
      "value": -2,
      "type": "racial",
      "sourceName": { "en": "Dromite", "fr": "Dromite" }
    },
    {
      "id": "dromite_size_ac",
      "sourceId": "race_dromite",
      "targetId": "combatStats.ac_normal",
      "value": 1,
      "type": "size",
      "sourceName": { "en": "Small Size", "fr": "Petite taille" }
    },
    {
      "id": "dromite_size_attack",
      "sourceId": "race_dromite",
      "targetId": "combatStats.attack_bonus",
      "value": 1,
      "type": "size",
      "sourceName": { "en": "Small Size", "fr": "Petite taille" }
    },
    {
      "id": "dromite_size_hide",
      "sourceId": "race_dromite",
      "targetId": "skills.skill_hide",
      "value": 4,
      "type": "size",
      "sourceName": { "en": "Small Size", "fr": "Petite taille" }
    },
    {
      "id": "dromite_speed",
      "sourceId": "race_dromite",
      "targetId": "attributes.speed_land",
      "value": 20,
      "type": "base",
      "sourceName": { "en": "Dromite", "fr": "Dromite" }
    },
    {
      "id": "dromite_chitin_nat_armor",
      "sourceId": "race_dromite",
      "targetId": "combatStats.ac_normal",
      "value": 3,
      "type": "natural_armor",
      "sourceName": { "en": "Chitin", "fr": "Chitine" }
    },
    {
      "id": "dromite_bonus_pp",
      "sourceId": "race_dromite",
      "targetId": "resources.power_points",
      "value": 1,
      "type": "racial",
      "sourceName": { "en": "Naturally Psionic", "fr": "Psionique naturel" }
    },
    {
      "id": "dromite_spot",
      "sourceId": "race_dromite",
      "targetId": "skills.skill_spot",
      "value": 2,
      "type": "racial",
      "sourceName": { "en": "Compound Eyes", "fr": "Yeux composés" }
    }
  ],
  "grantedFeatures": [
    "sense_scent",
    "feat_blind_fight",
    "psi_like_energy_ray",
    "language_common"
  ],
  "choices": [
    {
      "choiceId": "chitin_energy_type",
      "label": { "en": "Chitin Energy Resistance", "fr": "Résistance énergétique de la chitine" },
      "optionsQuery": "tag:dromite_energy_type",
      "maxSelections": 1
    }
  ]
}
```

---

## A.4. Feats

### A.4.1. Armor Proficiency (Heavy) — Prerequisite Chain

> _Demonstrates prerequisite chaining: this feat requires two other feats via `has_tag` conditions. This validates that the logic evaluator correctly checks the `@activeTags` collection._

```json
{
  "id": "feat_armor_proficiency_heavy",
  "category": "feat",
  "ruleSource": "srd_core",
  "label": { "en": "Armor Proficiency (Heavy)", "fr": "Port des armures lourdes" },
  "description": {
    "en": "You are proficient with heavy armor.",
    "fr": "Vous savez porter les armures lourdes."
  },
  "tags": ["feat", "general", "armor_proficiency"],
  "prerequisitesNode": {
    "logic": "AND",
    "nodes": [
      {
        "logic": "CONDITION",
        "targetPath": "@activeTags",
        "operator": "has_tag",
        "value": "feat_armor_proficiency_light",
        "errorMessage": "Requires Armor Proficiency (Light)"
      },
      {
        "logic": "CONDITION",
        "targetPath": "@activeTags",
        "operator": "has_tag",
        "value": "feat_armor_proficiency_medium",
        "errorMessage": "Requires Armor Proficiency (Medium)"
      }
    ]
  },
  "grantedModifiers": [],
  "grantedFeatures": []
}
```

### A.4.2. Exotic Weapon Proficiency — Conditional Prerequisite + Choice

> _Demonstrates: BAB prerequisite (numeric comparison on a pipeline value), FeatureChoice with compound query (`"tag:weapon+tag:exotic"`), and the `fighter_bonus_feat` tag (allowing Fighters to select it as a bonus feat)._

```json
{
  "id": "feat_exotic_weapon_proficiency",
  "category": "feat",
  "ruleSource": "srd_core",
  "label": { "en": "Exotic Weapon Proficiency", "fr": "Maniement d'une arme exotique" },
  "description": {
    "en": "Choose a type of exotic weapon. You understand how to use that type of exotic weapon in combat.",
    "fr": "Choisissez un type d'arme exotique. Vous comprenez comment utiliser ce type d'arme exotique au combat."
  },
  "tags": ["feat", "general", "fighter_bonus_feat"],
  "prerequisitesNode": {
    "logic": "CONDITION",
    "targetPath": "@combatStats.bab.totalValue",
    "operator": ">=",
    "value": 1,
    "errorMessage": "Requires Base Attack Bonus +1"
  },
  "grantedModifiers": [],
  "grantedFeatures": [],
  "choices": [
    {
      "choiceId": "exotic_weapon_choice",
      "label": { "en": "Choose an exotic weapon", "fr": "Choisissez une arme exotique" },
      "optionsQuery": "tag:weapon+tag:exotic",
      "maxSelections": 1
    }
  ]
}
```

### A.4.3. Self-Sufficient — Simple Feat

> _Demonstrates the simplest feat pattern: no prerequisites, two untyped skill bonuses._

```json
{
  "id": "feat_self_sufficient",
  "category": "feat",
  "ruleSource": "srd_core",
  "label": { "en": "Self-Sufficient", "fr": "Autonome" },
  "description": {
    "en": "You get a +2 bonus on all Heal checks and Survival checks.",
    "fr": "Vous obtenez un bonus de +2 à tous les jets de Premiers soins et de Survie."
  },
  "tags": ["feat", "general", "feat_self_sufficient"],
  "grantedModifiers": [
    {
      "id": "self_sufficient_heal",
      "sourceId": "feat_self_sufficient",
      "targetId": "skills.skill_heal",
      "value": 2,
      "type": "untyped",
      "sourceName": { "en": "Self-Sufficient", "fr": "Autonome" }
    },
    {
      "id": "self_sufficient_survival",
      "sourceId": "feat_self_sufficient",
      "targetId": "skills.skill_survival",
      "value": 2,
      "type": "untyped",
      "sourceName": { "en": "Self-Sufficient", "fr": "Autonome" }
    }
  ],
  "grantedFeatures": []
}
```

### A.4.4. Craft Wand — Item Creation Feat

> _Demonstrates: caster level prerequisite (referencing a computed pipeline `@attributes.caster_level.totalValue`). The caster level pipeline is itself derived from class levels and is not a simple base attribute._

```json
{
  "id": "feat_craft_wand",
  "category": "feat",
  "ruleSource": "srd_core",
  "label": { "en": "Craft Wand", "fr": "Création de baguettes magiques" },
  "description": {
    "en": "You can create a wand of any 4th-level or lower spell that you know.",
    "fr": "Vous pouvez créer une baguette de n'importe quel sort de niveau 4 ou moins que vous connaissez."
  },
  "tags": ["feat", "item_creation", "feat_craft_wand"],
  "prerequisitesNode": {
    "logic": "CONDITION",
    "targetPath": "@attributes.caster_level.totalValue",
    "operator": ">=",
    "value": 5,
    "errorMessage": "Requires caster level 5th"
  },
  "grantedModifiers": [],
  "grantedFeatures": []
}
```

### A.4.5. Maximize Spell — Metamagic Feat

> _Demonstrates a feat with no modifiers — its effect is entirely descriptive/behavioral. The engine doesn't need to process metamagic mechanically; the player applies it manually when preparing spells. The `metamagic` tag is used by the Feat Catalog UI for filtering._

```json
{
  "id": "feat_maximize_spell",
  "category": "feat",
  "ruleSource": "srd_core",
  "label": { "en": "Maximize Spell", "fr": "Quintessence des sorts" },
  "description": {
    "en": "All variable, numeric effects of a spell modified by this feat are maximized. A maximized spell uses up a spell slot three levels higher than the spell's actual level.",
    "fr": "Tous les effets numériques variables d'un sort modifié par ce don sont maximisés. Un sort maximisé occupe un emplacement de sort de trois niveaux supérieurs au niveau réel du sort."
  },
  "tags": ["feat", "metamagic", "feat_maximize_spell"],
  "grantedModifiers": [],
  "grantedFeatures": []
}
```

### A.4.6. Burrowing Power — Metapsionic Feat

> _Demonstrates a psionic feat from the `srd_psionics` rule source. Tagged with both `metapsionic` and `psionic` for UI filtering. No mechanical modifiers — behavioral effect only._

```json
{
  "id": "feat_burrowing_power",
  "category": "feat",
  "ruleSource": "srd_psionics",
  "label": { "en": "Burrowing Power", "fr": "Pouvoir fouisseur" },
  "description": {
    "en": "Your powers sometimes bypass barriers. To use this feat, you must expend your psionic focus. Using this feat increases the power point cost of the power by 2.",
    "fr": "Vos pouvoirs contournent parfois les barrières. Pour utiliser ce don, vous devez dépenser votre focalisation psionique. L'utilisation de ce don augmente le coût en points de pouvoir de 2."
  },
  "tags": ["feat", "metapsionic", "psionic", "feat_burrowing_power"],
  "grantedModifiers": [],
  "grantedFeatures": []
}
```

---

## A.5. Items

### A.5.1. Armor — Full Plate (Heavy)

> _Demonstrates: heavy armor with all standard armor properties (AC bonus as `armor` type, armor check penalty, max Dex as `setAbsolute`, arcane spell failure), the `metal_armor` tag (which triggers the Druid's `forbiddenTags` conflict), and the `heavy_armor` tag (which disables the Barbarian's Fast Movement)._

```json
{
  "id": "item_full_plate",
  "category": "item",
  "ruleSource": "srd_core",
  "label": { "en": "Full Plate", "fr": "Harnois" },
  "description": {
    "en": "This armor consists of shaped, interlocking metal plates that cover the entire body.",
    "fr": "Cette armure consiste en des plaques de métal imbriquées qui couvrent tout le corps."
  },
  "tags": ["item", "armor", "heavy_armor", "metal_armor"],
  "equipmentSlot": "body",
  "weightLbs": 50,
  "costGp": 1500,
  "hardness": 10,
  "hpMax": 40,
  "armorData": {
    "armorBonus": 8,
    "maxDex": 1,
    "armorCheckPenalty": -6,
    "arcaneSpellFailure": 35
  },
  "grantedModifiers": [
    {
      "id": "full_plate_ac",
      "sourceId": "item_full_plate",
      "targetId": "combatStats.ac_normal",
      "value": 8,
      "type": "armor",
      "sourceName": { "en": "Full Plate", "fr": "Harnois" }
    },
    {
      "id": "full_plate_acp",
      "sourceId": "item_full_plate",
      "targetId": "combatStats.armor_check_penalty",
      "value": -6,
      "type": "base",
      "sourceName": { "en": "Full Plate", "fr": "Harnois" }
    },
    {
      "id": "full_plate_max_dex",
      "sourceId": "item_full_plate",
      "targetId": "combatStats.max_dex_bonus",
      "value": 1,
      "type": "setAbsolute",
      "sourceName": { "en": "Full Plate", "fr": "Harnois" }
    },
    {
      "id": "full_plate_asf",
      "sourceId": "item_full_plate",
      "targetId": "combatStats.arcane_spell_failure",
      "value": 35,
      "type": "base",
      "sourceName": { "en": "Full Plate", "fr": "Harnois" }
    }
  ],
  "grantedFeatures": []
}
```

### A.5.2. Armor — Chain Shirt (Light)

> _Demonstrates light armor with less restrictive values. Note: still has `metal_armor` tag, so Druids can't wear it either._

```json
{
  "id": "item_chain_shirt",
  "category": "item",
  "ruleSource": "srd_core",
  "label": { "en": "Chain Shirt", "fr": "Chemise de mailles" },
  "description": {
    "en": "A chain shirt protects the wearer's torso while leaving the limbs free.",
    "fr": "Une chemise de mailles protège le torse du porteur tout en laissant les membres libres."
  },
  "tags": ["item", "armor", "light_armor", "metal_armor"],
  "equipmentSlot": "body",
  "weightLbs": 25,
  "costGp": 100,
  "armorData": {
    "armorBonus": 4,
    "maxDex": 4,
    "armorCheckPenalty": -2,
    "arcaneSpellFailure": 20
  },
  "grantedModifiers": [
    {
      "id": "chain_shirt_ac",
      "sourceId": "item_chain_shirt",
      "targetId": "combatStats.ac_normal",
      "value": 4,
      "type": "armor",
      "sourceName": { "en": "Chain Shirt", "fr": "Chemise de mailles" }
    },
    {
      "id": "chain_shirt_acp",
      "sourceId": "item_chain_shirt",
      "targetId": "combatStats.armor_check_penalty",
      "value": -2,
      "type": "base",
      "sourceName": { "en": "Chain Shirt", "fr": "Chemise de mailles" }
    },
    {
      "id": "chain_shirt_max_dex",
      "sourceId": "item_chain_shirt",
      "targetId": "combatStats.max_dex_bonus",
      "value": 4,
      "type": "setAbsolute",
      "sourceName": { "en": "Chain Shirt", "fr": "Chemise de mailles" }
    },
    {
      "id": "chain_shirt_asf",
      "sourceId": "item_chain_shirt",
      "targetId": "combatStats.arcane_spell_failure",
      "value": 20,
      "type": "base",
      "sourceName": { "en": "Chain Shirt", "fr": "Chemise de mailles" }
    }
  ],
  "grantedFeatures": []
}
```

### A.5.3. Bracers of Armor +3 (Wondrous Item)

> _Demonstrates: wondrous item occupying the `arms` slot, providing an `armor` type AC bonus. Important: this armor bonus does NOT stack with actual armor (stacking rules prevent two `armor` type bonuses). A Monk would benefit from these since they don't wear armor._

```json
{
  "id": "item_bracers_of_armor_3",
  "category": "item",
  "ruleSource": "srd_core",
  "label": { "en": "Bracers of Armor +3", "fr": "Brassards d'armure +3" },
  "description": {
    "en": "These items surround the wearer with an invisible but tangible field of force, granting an armor bonus of +3.",
    "fr": "Ces objets entourent le porteur d'un champ de force invisible mais tangible, accordant un bonus d'armure de +3."
  },
  "tags": ["item", "wondrous_item", "magic_item"],
  "equipmentSlot": "arms",
  "weightLbs": 1,
  "costGp": 9000,
  "grantedModifiers": [
    {
      "id": "bracers_armor_3_ac",
      "sourceId": "item_bracers_of_armor_3",
      "targetId": "combatStats.ac_normal",
      "value": 3,
      "type": "armor",
      "sourceName": { "en": "Bracers of Armor +3", "fr": "Brassards d'armure +3" }
    }
  ],
  "grantedFeatures": []
}
```

### A.5.4. Ring of Feather Falling

> _Demonstrates: ring slot item, zero weight, granted feature (permanent spell effect) rather than modifiers._

```json
{
  "id": "item_ring_feather_falling",
  "category": "item",
  "ruleSource": "srd_core",
  "label": { "en": "Ring of Feather Falling", "fr": "Anneau de feuille morte" },
  "description": {
    "en": "This ring is crafted with a feather pattern all around its edge. It acts exactly like a feather fall spell, activated immediately if the wearer falls more than 5 feet.",
    "fr": "Cet anneau est orné d'un motif de plume tout autour de son bord. Il agit exactement comme un sort de feuille morte, activé immédiatement si le porteur chute de plus de 1,5 m."
  },
  "tags": ["item", "ring", "magic_item"],
  "equipmentSlot": "ring",
  "weightLbs": 0,
  "costGp": 2200,
  "grantedModifiers": [],
  "grantedFeatures": ["spell_effect_feather_fall_permanent"]
}
```

### A.5.5. Bag of Holding (Type I)

> _Demonstrates: container item with `equipmentSlot: "none"` (doesn't occupy a body slot), fixed weight regardless of contents. The bag itself weighs 15 lb — its magical contents don't count toward encumbrance._

```json
{
  "id": "item_bag_of_holding_1",
  "category": "item",
  "ruleSource": "srd_core",
  "label": { "en": "Bag of Holding (Type I)", "fr": "Sac sans fond (Type I)" },
  "description": {
    "en": "This appears to be a common cloth sack. The bag of holding opens into a nondimensional space: its inside is larger than its outside dimensions. Weight limit: 250 lb. Volume limit: 30 cu. ft.",
    "fr": "Ceci semble être un sac en tissu ordinaire. Le sac sans fond s'ouvre sur un espace extradimensionnel : son intérieur est plus grand que ses dimensions extérieures. Limite de poids : 125 kg. Limite de volume : 0,85 m³."
  },
  "tags": ["item", "wondrous_item", "magic_item", "container"],
  "equipmentSlot": "none",
  "weightLbs": 15,
  "costGp": 2500,
  "grantedModifiers": [],
  "grantedFeatures": []
}
```

### A.5.6. Repeating Heavy Crossbow (Exotic Weapon)

> _Demonstrates: exotic two-handed ranged weapon with `equipmentSlot: "two_hands"` (occupies both main_hand and off_hand), range increment, and the `exotic` tag (requires Exotic Weapon Proficiency to use without penalty)._

```json
{
  "id": "item_crossbow_repeating_heavy",
  "category": "item",
  "ruleSource": "srd_core",
  "label": { "en": "Repeating Heavy Crossbow", "fr": "Arbalète lourde à répétition" },
  "description": {
    "en": "The repeating crossbow holds 5 crossbow bolts. As long as it holds bolts, you can reload it by pulling the reloading lever (a free action). Loading a new case of 5 bolts is a full-round action.",
    "fr": "L'arbalète à répétition contient 5 carreaux d'arbalète. Tant qu'elle contient des carreaux, vous pouvez la recharger en tirant le levier (une action libre). Charger un nouveau chargeur de 5 carreaux est une action complexe."
  },
  "tags": ["item", "weapon", "exotic", "ranged", "crossbow"],
  "equipmentSlot": "two_hands",
  "weightLbs": 12,
  "costGp": 400,
  "weaponData": {
    "wieldCategory": "two_handed",
    "damageDice": "1d10",
    "damageType": ["piercing"],
    "critRange": "19-20",
    "critMultiplier": 2,
    "reachFt": 0,
    "rangeIncrementFt": 120
  },
  "grantedModifiers": [],
  "grantedFeatures": []
}
```

### A.5.7. Sling (Simple Weapon)

> _Demonstrates: simple ranged weapon with `wieldCategory: "light"` (unusual for ranged), zero weight, zero cost, and `equipmentSlot: "main_hand"` (one-handed use). Per D&D 3.5 rules, Strength modifier applies to sling damage — this is handled by the weapon damage calculation in the Combat tab, not by a modifier on the item itself._

```json
{
  "id": "item_sling",
  "category": "item",
  "ruleSource": "srd_core",
  "label": { "en": "Sling", "fr": "Fronde" },
  "description": {
    "en": "Your Strength modifier applies to damage rolls when you use a sling. Loading a sling is a move action that requires two hands.",
    "fr": "Votre modificateur de Force s'applique aux jets de dégâts lorsque vous utilisez une fronde. Charger une fronde est une action de mouvement nécessitant les deux mains."
  },
  "tags": ["item", "weapon", "simple", "ranged"],
  "equipmentSlot": "main_hand",
  "weightLbs": 0,
  "costGp": 0,
  "weaponData": {
    "wieldCategory": "light",
    "damageDice": "1d4",
    "damageType": ["bludgeoning"],
    "critRange": "20",
    "critMultiplier": 2,
    "reachFt": 0,
    "rangeIncrementFt": 50
  },
  "grantedModifiers": [],
  "grantedFeatures": []
}
```

### A.5.8. Scarab of Death (Cursed Item)

> _Demonstrates: cursed item that appears beneficial. The `neck` equipment slot means it occupies the amulet slot. The actual curse effect is referenced as a granted feature (`curse_scarab_death_effect`) — the mechanical resolution of the curse (death after 1 minute) would be handled by a separate Feature with its own logic._

```json
{
  "id": "item_scarab_of_death",
  "category": "item",
  "ruleSource": "srd_core",
  "label": { "en": "Scarab of Death", "fr": "Scarabée de mort" },
  "description": {
    "en": "This small pin appears to be any one of the various beneficial amulets. However, if carried for 1 minute, it changes into a horrible burrowing beetle that reaches the victim's heart in 1 round, causing death. DC 25 Reflex save to tear it away (3d6 damage).",
    "fr": "Ce petit bijou semble être l'une des diverses amulettes bénéfiques. Cependant, s'il est porté pendant 1 minute, il se transforme en un horrible scarabée fouisseur qui atteint le cœur de la victime en 1 round, causant la mort. Jet de Réflexes DD 25 pour l'arracher (3d6 dégâts)."
  },
  "tags": ["item", "cursed_item", "magic_item", "amulet"],
  "equipmentSlot": "neck",
  "weightLbs": 0,
  "costGp": 0,
  "grantedModifiers": [],
  "grantedFeatures": ["curse_scarab_death_effect"]
}
```

### A.5.9. Explorer's Outfit (Clothing)

> _Demonstrates: mundane clothing with no magical properties, occupying the `body` slot, with weight and cost. This is the baseline item pattern._

```json
{
  "id": "item_explorers_outfit",
  "category": "item",
  "ruleSource": "srd_core",
  "label": { "en": "Explorer's Outfit", "fr": "Tenue d'explorateur" },
  "description": {
    "en": "This is a full set of clothes for someone who never knows what to expect. Includes sturdy boots, leather breeches, belt, shirt, gloves, and cloak.",
    "fr": "C'est un ensemble complet de vêtements pour quelqu'un qui ne sait jamais à quoi s'attendre. Comprend des bottes solides, un pantalon de cuir, une ceinture, une chemise, des gants et un manteau."
  },
  "tags": ["item", "clothing"],
  "equipmentSlot": "body",
  "weightLbs": 8,
  "costGp": 10,
  "grantedModifiers": [],
  "grantedFeatures": []
}
```

---

## A.6. Spells

### A.6.1. Raise Dead (Divine, Costly Component)

> _Demonstrates: divine-only spell (single spell list entry), touch range, instantaneous duration, material component with significant cost. No mechanical modifiers — the level loss effect is descriptive/narrative._

```json
{
  "id": "spell_raise_dead",
  "category": "magic",
  "ruleSource": "srd_core",
  "label": { "en": "Raise Dead", "fr": "Rappel à la vie" },
  "description": {
    "en": "You restore life to a deceased creature that has been dead for no longer than one day per caster level. The subject loses one level when raised.",
    "fr": "Vous rendez la vie à une créature décédée depuis un nombre de jours ne dépassant pas votre niveau de lanceur de sorts. Le sujet perd un niveau lorsqu'il est rappelé à la vie."
  },
  "tags": ["magic", "spell", "divine", "conjuration", "healing"],
  "magicType": "divine",
  "spellLists": { "list_cleric": 5 },
  "school": "conjuration",
  "subSchool": "healing",
  "descriptors": [],
  "resistanceType": "spell_resistance",
  "components": ["V", "S", "M", "DF"],
  "range": "touch",
  "targetArea": { "en": "Dead creature touched", "fr": "Créature morte touchée" },
  "duration": "instantaneous",
  "savingThrow": "none",
  "grantedModifiers": [],
  "grantedFeatures": []
}
```

### A.6.2. Speak with Plants (Multi-list)

> _Demonstrates: a spell appearing on multiple spell lists at different levels (Bard 4, Druid 3, Ranger 2). The `spellLists` record is the key mechanism — the Grimoire UI (Phase 12.2) filters available spells by checking which lists the character has access to and at what level._

```json
{
  "id": "spell_speak_with_plants",
  "category": "magic",
  "ruleSource": "srd_core",
  "label": { "en": "Speak with Plants", "fr": "Communication avec les plantes" },
  "description": {
    "en": "You can comprehend and communicate with plants, including both normal plants and plant creatures.",
    "fr": "Vous pouvez comprendre et communiquer avec les plantes, y compris les plantes normales et les créatures végétales."
  },
  "tags": ["magic", "spell", "divine", "arcane", "divination"],
  "magicType": "divine",
  "spellLists": { "list_bard": 4, "list_druid": 3, "list_ranger": 2 },
  "school": "divination",
  "descriptors": [],
  "resistanceType": "none",
  "components": ["V", "S"],
  "range": "personal",
  "targetArea": { "en": "You", "fr": "Vous" },
  "duration": "1 min./level",
  "savingThrow": "none",
  "grantedModifiers": [],
  "grantedFeatures": []
}
```

### A.6.3. Chain Lightning (Arcane, Scaling Damage)

> _Demonstrates: formula-based range (`400 + 40 * floor(@attributes.caster_level.totalValue)`), scaling damage description using the `{@...}` placeholder syntax, and the `electricity` descriptor (used for energy resistance checks)._

```json
{
  "id": "spell_chain_lightning",
  "category": "magic",
  "ruleSource": "srd_core",
  "label": { "en": "Chain Lightning", "fr": "Éclair multiple" },
  "description": {
    "en": "This spell creates an electrical discharge that strikes one object or creature initially, then arcs to secondary targets. Deals {@attributes.caster_level.totalValue}d6 electricity damage (max 20d6) to primary target, half to secondary targets.",
    "fr": "Ce sort crée une décharge électrique qui frappe un objet ou une créature initialement, puis rebondit vers des cibles secondaires. Inflige {@attributes.caster_level.totalValue}d6 dégâts d'électricité (max 20d6) à la cible primaire, la moitié aux cibles secondaires."
  },
  "tags": ["magic", "spell", "arcane", "evocation", "electricity"],
  "magicType": "arcane",
  "spellLists": { "list_sorcerer_wizard": 6, "list_domain_air": 6 },
  "school": "evocation",
  "descriptors": ["electricity"],
  "resistanceType": "spell_resistance",
  "components": ["V", "S", "F"],
  "range": "400 + 40 * floor(@attributes.caster_level.totalValue)",
  "targetArea": {
    "en": "One primary target, plus one secondary target/level (each within 30 ft. of the primary)",
    "fr": "Une cible primaire, plus une cible secondaire/niveau (chacune à 9 m de la cible primaire)"
  },
  "duration": "instantaneous",
  "savingThrow": "ref_half",
  "grantedModifiers": [],
  "grantedFeatures": []
}
```

### A.6.4. Darkvision (Buff, Transmutation)

> _Demonstrates: a buff spell that grants both a modifier (darkvision range = 60 as a `base` type modifier on a dynamic pipeline) and a feature (`sense_darkvision`). Also uses the `{@...|distance}` pipe in its description for i18n distance conversion._

```json
{
  "id": "spell_darkvision",
  "category": "magic",
  "ruleSource": "srd_core",
  "label": { "en": "Darkvision", "fr": "Vision dans le noir" },
  "description": {
    "en": "The subject gains the ability to see {@constant.darkvision_range|distance} even in total darkness. Darkvision is black and white only.",
    "fr": "Le sujet obtient la capacité de voir à {@constant.darkvision_range|distance} même dans l'obscurité totale. La vision dans le noir est en noir et blanc uniquement."
  },
  "tags": ["magic", "spell", "arcane", "transmutation", "buff"],
  "magicType": "arcane",
  "spellLists": { "list_ranger": 3, "list_sorcerer_wizard": 2 },
  "school": "transmutation",
  "descriptors": [],
  "resistanceType": "spell_resistance",
  "components": ["V", "S", "M"],
  "range": "touch",
  "targetArea": { "en": "Creature touched", "fr": "Créature touchée" },
  "duration": "1 hour/level",
  "savingThrow": "will_negates_harmless",
  "grantedModifiers": [
    {
      "id": "darkvision_grant",
      "sourceId": "spell_darkvision",
      "targetId": "attributes.darkvision_range",
      "value": 60,
      "type": "base",
      "sourceName": { "en": "Darkvision", "fr": "Vision dans le noir" }
    }
  ],
  "grantedFeatures": ["sense_darkvision"]
}
```

### A.6.5. Stone Shape (Multi-list, Material Component)

> _Demonstrates: a spell appearing on 4 different spell lists at different levels, including domain lists. The `earth` descriptor enables domain-based filtering._

```json
{
  "id": "spell_stone_shape",
  "category": "magic",
  "ruleSource": "srd_core",
  "label": { "en": "Stone Shape", "fr": "Façonnage de la pierre" },
  "description": {
    "en": "You can form an existing piece of stone into any shape that suits your purpose. You can affect up to 10 cu. ft. + 1 cu. ft./level. There is a 30% chance that any shape including moving parts simply doesn't work.",
    "fr": "Vous pouvez façonner un morceau de pierre existant en la forme de votre choix. Vous pouvez affecter jusqu'à 0,3 m³ + 0,03 m³/niveau. Il y a 30% de chances que toute forme incluant des parties mobiles ne fonctionne pas."
  },
  "tags": ["magic", "spell", "divine", "arcane", "transmutation", "earth"],
  "magicType": "arcane",
  "spellLists": { "list_cleric": 3, "list_druid": 3, "list_domain_earth": 3, "list_sorcerer_wizard": 4 },
  "school": "transmutation",
  "descriptors": ["earth"],
  "resistanceType": "none",
  "components": ["V", "S", "M"],
  "range": "touch",
  "targetArea": {
    "en": "Stone or stone object touched, up to 10 cu. ft. + 1 cu. ft./level",
    "fr": "Pierre ou objet en pierre touché, jusqu'à 0,3 m³ + 0,03 m³/niveau"
  },
  "duration": "instantaneous",
  "savingThrow": "none",
  "grantedModifiers": [],
  "grantedFeatures": []
}
```

---

## A.7. Soulknife (Psionic Class — Levels 1-6)

> _This class demonstrates unique psionic mechanics: manifested weapon (Mind Blade) as a class feature rather than an item, progressive enhancement bonus on the mind blade, Psychic Strike with a dynamic damage formula based on class level (`floor(@classLevels.class_soulknife / 4)d8`), and psionic abilities without power points (the Soulknife is unique among psionic classes in this regard). Also demonstrates Good Ref + Good Will save progression._

```json
{
  "id": "class_soulknife",
  "category": "class",
  "ruleSource": "srd_psionics",
  "label": { "en": "Soulknife", "fr": "Couteau de l'âme" },
  "description": {
    "en": "A soulknife is the literal interpretation of using the power of the mind as a weapon.",
    "fr": "Le couteau de l'âme est l'interprétation littérale de l'utilisation du pouvoir de l'esprit comme arme."
  },
  "tags": ["class", "base_class", "psionic", "class_soulknife"],
  "grantedModifiers": [
    {
      "id": "soulknife_hit_die",
      "sourceId": "class_soulknife",
      "targetId": "combatStats.hit_die_type",
      "value": 10,
      "type": "base",
      "sourceName": { "en": "Soulknife", "fr": "Couteau de l'âme" }
    },
    {
      "id": "soulknife_skill_points",
      "sourceId": "class_soulknife",
      "targetId": "attributes.skill_points_per_level",
      "value": 4,
      "type": "base",
      "sourceName": { "en": "Soulknife", "fr": "Couteau de l'âme" }
    }
  ],
  "grantedFeatures": [
    "proficiency_all_simple",
    "proficiency_armor_light",
    "proficiency_shields_except_tower",
    "class_feature_soulknife_mind_blade",
    "feat_weapon_focus_mind_blade",
    "feat_wild_talent"
  ],
  "recommendedAttributes": ["stat_str", "stat_dex", "stat_wis"],
  "levelProgression": [
    {
      "level": 1,
      "grantedFeatures": [],
      "grantedModifiers": [
        { "id": "sk_1_bab", "sourceId": "class_soulknife", "targetId": "combatStats.bab", "value": 0, "type": "base", "sourceName": { "en": "Soulknife 1", "fr": "Couteau de l'âme 1" } },
        { "id": "sk_1_fort", "sourceId": "class_soulknife", "targetId": "saves.fort", "value": 0, "type": "base", "sourceName": { "en": "Soulknife 1", "fr": "Couteau de l'âme 1" } },
        { "id": "sk_1_ref", "sourceId": "class_soulknife", "targetId": "saves.ref", "value": 2, "type": "base", "sourceName": { "en": "Soulknife 1", "fr": "Couteau de l'âme 1" } },
        { "id": "sk_1_will", "sourceId": "class_soulknife", "targetId": "saves.will", "value": 2, "type": "base", "sourceName": { "en": "Soulknife 1", "fr": "Couteau de l'âme 1" } }
      ]
    },
    {
      "level": 2,
      "grantedFeatures": ["class_feature_soulknife_throw_mind_blade"],
      "grantedModifiers": [
        { "id": "sk_2_bab", "sourceId": "class_soulknife", "targetId": "combatStats.bab", "value": 1, "type": "base", "sourceName": { "en": "Soulknife 2", "fr": "Couteau de l'âme 2" } },
        { "id": "sk_2_ref", "sourceId": "class_soulknife", "targetId": "saves.ref", "value": 1, "type": "base", "sourceName": { "en": "Soulknife 2", "fr": "Couteau de l'âme 2" } },
        { "id": "sk_2_will", "sourceId": "class_soulknife", "targetId": "saves.will", "value": 1, "type": "base", "sourceName": { "en": "Soulknife 2", "fr": "Couteau de l'âme 2" } }
      ]
    },
    {
      "level": 3,
      "grantedFeatures": ["class_feature_soulknife_psychic_strike_1d8"],
      "grantedModifiers": [
        { "id": "sk_3_bab", "sourceId": "class_soulknife", "targetId": "combatStats.bab", "value": 1, "type": "base", "sourceName": { "en": "Soulknife 3", "fr": "Couteau de l'âme 3" } },
        { "id": "sk_3_fort", "sourceId": "class_soulknife", "targetId": "saves.fort", "value": 1, "type": "base", "sourceName": { "en": "Soulknife 3", "fr": "Couteau de l'âme 3" } }
      ]
    },
    {
      "level": 4,
      "grantedFeatures": [],
      "grantedModifiers": [
        { "id": "sk_4_bab", "sourceId": "class_soulknife", "targetId": "combatStats.bab", "value": 1, "type": "base", "sourceName": { "en": "Soulknife 4", "fr": "Couteau de l'âme 4" } },
        { "id": "sk_4_ref", "sourceId": "class_soulknife", "targetId": "saves.ref", "value": 1, "type": "base", "sourceName": { "en": "Soulknife 4", "fr": "Couteau de l'âme 4" } },
        { "id": "sk_4_will", "sourceId": "class_soulknife", "targetId": "saves.will", "value": 1, "type": "base", "sourceName": { "en": "Soulknife 4", "fr": "Couteau de l'âme 4" } },
        { "id": "sk_4_mind_blade_enhancement", "sourceId": "class_soulknife", "targetId": "combatStats.mind_blade_enhancement", "value": 1, "type": "enhancement", "sourceName": { "en": "+1 Mind Blade", "fr": "Lame mentale +1" } }
      ]
    },
    {
      "level": 5,
      "grantedFeatures": ["class_feature_soulknife_free_draw", "class_feature_soulknife_shape_mind_blade"],
      "grantedModifiers": [
        { "id": "sk_5_fort", "sourceId": "class_soulknife", "targetId": "saves.fort", "value": 0, "type": "base", "sourceName": { "en": "Soulknife 5", "fr": "Couteau de l'âme 5" } }
      ]
    },
    {
      "level": 6,
      "grantedFeatures": ["class_feature_soulknife_mind_blade_enhancement_1", "feat_speed_of_thought"],
      "grantedModifiers": [
        { "id": "sk_6_bab", "sourceId": "class_soulknife", "targetId": "combatStats.bab", "value": 1, "type": "base", "sourceName": { "en": "Soulknife 6", "fr": "Couteau de l'âme 6" } },
        { "id": "sk_6_fort", "sourceId": "class_soulknife", "targetId": "saves.fort", "value": 1, "type": "base", "sourceName": { "en": "Soulknife 6", "fr": "Couteau de l'âme 6" } },
        { "id": "sk_6_ref", "sourceId": "class_soulknife", "targetId": "saves.ref", "value": 1, "type": "base", "sourceName": { "en": "Soulknife 6", "fr": "Couteau de l'âme 6" } },
        { "id": "sk_6_will", "sourceId": "class_soulknife", "targetId": "saves.will", "value": 1, "type": "base", "sourceName": { "en": "Soulknife 6", "fr": "Couteau de l'âme 6" } }
      ]
    }
  ]
}
```

```json
{
  "id": "class_feature_soulknife_psychic_strike_1d8",
  "category": "class_feature",
  "ruleSource": "srd_psionics",
  "label": { "en": "Psychic Strike", "fr": "Frappe psionique" },
  "description": {
    "en": "As a move action, a soulknife can imbue his mind blade with destructive psychic energy. This deals an extra floor(@classLevels.class_soulknife / 4)d8 points of damage to the next living, nonmindless target.",
    "fr": "Par une action de mouvement, le couteau de l'âme peut imprégner sa lame mentale d'énergie psychique destructrice. Cela inflige floor(@classLevels.class_soulknife / 4)d8 points de dégâts supplémentaires à la prochaine cible vivante et dotée d'esprit."
  },
  "tags": ["class_feature", "soulknife", "supernatural", "psionic", "psychic_strike"],
  "activation": {
    "actionType": "move"
  },
  "grantedModifiers": [
    {
      "id": "psychic_strike_damage",
      "sourceId": "class_feature_soulknife_psychic_strike_1d8",
      "targetId": "combatStats.mind_blade_bonus_damage",
      "value": "floor(@classLevels.class_soulknife / 4)d8",
      "type": "untyped",
      "sourceName": { "en": "Psychic Strike", "fr": "Frappe psionique" },
      "conditionNode": {
        "logic": "AND",
        "nodes": [
          {
            "logic": "NOT",
            "node": {
              "logic": "CONDITION",
              "targetPath": "@targetTags",
              "operator": "has_tag",
              "value": "mindless"
            }
          },
          {
            "logic": "NOT",
            "node": {
              "logic": "CONDITION",
              "targetPath": "@targetTags",
              "operator": "has_tag",
              "value": "immune_mind_affecting"
            }
          }
        ]
      }
    }
  ],
  "grantedFeatures": []
}
```

> **AI Implementation Note — Psychic Strike formula:** The `value` field contains `"floor(@classLevels.class_soulknife / 4)d8"`. The Math Parser must: (1) Resolve `@classLevels.class_soulknife` to the current class level, (2) Evaluate `floor(level / 4)`, (3) Return the result as a dice expression like `"2d8"` for level 9. The `conditionNode` checks `@targetTags` — this is evaluated at ROLL TIME, not at sheet update time, because it depends on the target being attacked.

---

## A.8. Druid — Key Excerpts (forbiddenTags + Animal Companion)

> _The Druid class is already referenced in the main document for `forbiddenTags`. These complementary elements demonstrate: metal restriction enforcement, divine spellcasting progression, and the Animal Companion as a LinkedEntity via FeatureChoice._

### A.8.1. Druid Class (Levels 1-5 Only)

```json
{
  "id": "class_druid",
  "category": "class",
  "ruleSource": "srd_core",
  "label": { "en": "Druid", "fr": "Druide" },
  "description": {
    "en": "The fury of a storm, the gentle strength of the morning sun, the cunning of the fox — these and more are at the druid's command.",
    "fr": "La furie de la tempête, la douce force du soleil matinal, la ruse du renard — tout cela et plus encore sont au commandement du druide."
  },
  "tags": ["class", "base_class", "divine_caster", "class_druid", "spellcaster"],
  "forbiddenTags": ["metal_armor", "metal_shield"],
  "grantedModifiers": [
    {
      "id": "druid_hit_die",
      "sourceId": "class_druid",
      "targetId": "combatStats.hit_die_type",
      "value": 8,
      "type": "base",
      "sourceName": { "en": "Druid", "fr": "Druide" }
    },
    {
      "id": "druid_skill_points",
      "sourceId": "class_druid",
      "targetId": "attributes.skill_points_per_level",
      "value": 4,
      "type": "base",
      "sourceName": { "en": "Druid", "fr": "Druide" }
    }
  ],
  "grantedFeatures": [
    "proficiency_druid_weapons",
    "proficiency_armor_light_nonmetal",
    "proficiency_armor_medium_nonmetal",
    "proficiency_shields_wooden",
    "language_druidic",
    "class_feature_druid_spellcasting"
  ],
  "recommendedAttributes": ["stat_wis", "stat_con"],
  "levelProgression": [
    {
      "level": 1,
      "grantedFeatures": ["class_feature_druid_animal_companion", "class_feature_druid_nature_sense", "class_feature_druid_wild_empathy"],
      "grantedModifiers": [
        { "id": "druid_1_bab", "sourceId": "class_druid", "targetId": "combatStats.bab", "value": 0, "type": "base", "sourceName": { "en": "Druid 1", "fr": "Druide 1" } },
        { "id": "druid_1_fort", "sourceId": "class_druid", "targetId": "saves.fort", "value": 2, "type": "base", "sourceName": { "en": "Druid 1", "fr": "Druide 1" } },
        { "id": "druid_1_ref", "sourceId": "class_druid", "targetId": "saves.ref", "value": 0, "type": "base", "sourceName": { "en": "Druid 1", "fr": "Druide 1" } },
        { "id": "druid_1_will", "sourceId": "class_druid", "targetId": "saves.will", "value": 2, "type": "base", "sourceName": { "en": "Druid 1", "fr": "Druide 1" } },
        { "id": "druid_1_slots_0", "sourceId": "class_druid", "targetId": "resources.spell_slots_druid_0", "value": 3, "type": "base", "sourceName": { "en": "Druid 1", "fr": "Druide 1" } },
        { "id": "druid_1_slots_1", "sourceId": "class_druid", "targetId": "resources.spell_slots_druid_1", "value": 1, "type": "base", "sourceName": { "en": "Druid 1", "fr": "Druide 1" } }
      ]
    },
    {
      "level": 2,
      "grantedFeatures": ["class_feature_druid_woodland_stride"],
      "grantedModifiers": [
        { "id": "druid_2_bab", "sourceId": "class_druid", "targetId": "combatStats.bab", "value": 1, "type": "base", "sourceName": { "en": "Druid 2", "fr": "Druide 2" } },
        { "id": "druid_2_fort", "sourceId": "class_druid", "targetId": "saves.fort", "value": 1, "type": "base", "sourceName": { "en": "Druid 2", "fr": "Druide 2" } },
        { "id": "druid_2_will", "sourceId": "class_druid", "targetId": "saves.will", "value": 1, "type": "base", "sourceName": { "en": "Druid 2", "fr": "Druide 2" } },
        { "id": "druid_2_slots_0", "sourceId": "class_druid", "targetId": "resources.spell_slots_druid_0", "value": 1, "type": "base", "sourceName": { "en": "Druid 2", "fr": "Druide 2" } },
        { "id": "druid_2_slots_1", "sourceId": "class_druid", "targetId": "resources.spell_slots_druid_1", "value": 1, "type": "base", "sourceName": { "en": "Druid 2", "fr": "Druide 2" } }
      ]
    },
    {
      "level": 3,
      "grantedFeatures": ["class_feature_druid_trackless_step"],
      "grantedModifiers": [
        { "id": "druid_3_bab", "sourceId": "class_druid", "targetId": "combatStats.bab", "value": 1, "type": "base", "sourceName": { "en": "Druid 3", "fr": "Druide 3" } },
        { "id": "druid_3_ref", "sourceId": "class_druid", "targetId": "saves.ref", "value": 1, "type": "base", "sourceName": { "en": "Druid 3", "fr": "Druide 3" } },
        { "id": "druid_3_slots_2", "sourceId": "class_druid", "targetId": "resources.spell_slots_druid_2", "value": 1, "type": "base", "sourceName": { "en": "Druid 3", "fr": "Druide 3" } }
      ]
    },
    {
      "level": 4,
      "grantedFeatures": ["class_feature_druid_resist_natures_lure"],
      "grantedModifiers": [
        { "id": "druid_4_bab", "sourceId": "class_druid", "targetId": "combatStats.bab", "value": 1, "type": "base", "sourceName": { "en": "Druid 4", "fr": "Druide 4" } },
        { "id": "druid_4_fort", "sourceId": "class_druid", "targetId": "saves.fort", "value": 1, "type": "base", "sourceName": { "en": "Druid 4", "fr": "Druide 4" } },
        { "id": "druid_4_will", "sourceId": "class_druid", "targetId": "saves.will", "value": 1, "type": "base", "sourceName": { "en": "Druid 4", "fr": "Druide 4" } },
        { "id": "druid_4_slots_1", "sourceId": "class_druid", "targetId": "resources.spell_slots_druid_1", "value": 1, "type": "base", "sourceName": { "en": "Druid 4", "fr": "Druide 4" } },
        { "id": "druid_4_slots_2", "sourceId": "class_druid", "targetId": "resources.spell_slots_druid_2", "value": 1, "type": "base", "sourceName": { "en": "Druid 4", "fr": "Druide 4" } }
      ]
    },
    {
      "level": 5,
      "grantedFeatures": ["class_feature_druid_wild_shape_1_day"],
      "grantedModifiers": [
        { "id": "druid_5_slots_3", "sourceId": "class_druid", "targetId": "resources.spell_slots_druid_3", "value": 1, "type": "base", "sourceName": { "en": "Druid 5", "fr": "Druide 5" } }
      ]
    }
  ]
}
```

### A.8.2. Animal Companion Feature (LinkedEntity)

```json
{
  "id": "class_feature_druid_animal_companion",
  "category": "class_feature",
  "ruleSource": "srd_core",
  "label": { "en": "Animal Companion", "fr": "Compagnon animal" },
  "description": {
    "en": "A druid may begin play with an animal companion. As the druid advances in level, the animal's power increases.",
    "fr": "Un druide peut commencer le jeu avec un compagnon animal. Au fur et à mesure que le druide progresse en niveau, la puissance de l'animal augmente."
  },
  "tags": ["class_feature", "druid", "extraordinary", "animal_companion", "linked_entity"],
  "grantedModifiers": [],
  "grantedFeatures": [],
  "choices": [
    {
      "choiceId": "companion_choice",
      "label": { "en": "Choose Animal Companion", "fr": "Choisir un compagnon animal" },
      "optionsQuery": "tag:animal_companion_base",
      "maxSelections": 1
    }
  ]
}
```

> **AI Implementation Note:** When the player selects a companion, the `GameEngine` creates a `LinkedEntity` of type `"companion"` with a child `Character` initialized from the base stats of the chosen animal. The companion's progression (Bonus HD, Natural Armor, Str/Dex, etc.) is managed by a separate Feature (`companion_progression`) whose `grantedModifiers` use formulas based on `@master.classLevels.class_druid`. Remember: the LinkedEntity relationship is UNIDIRECTIONAL — the companion has NO back-reference to its master.

---

## A.9. Sphere of Annihilation (Artifact — Non-Standard Item)

> _This item demonstrates how the system handles objects that don't follow standard patterns: `equipmentSlot: "none"` (not worn or wielded), zero weight, zero cost, no modifiers, no granted features. It exists purely as a narrative/descriptive entry. The control check mechanics would be handled by the GM using the Dice Engine manually._

```json
{
  "id": "item_sphere_of_annihilation",
  "category": "item",
  "ruleSource": "srd_core",
  "label": { "en": "Sphere of Annihilation", "fr": "Sphère d'annihilation" },
  "description": {
    "en": "A globe of absolute blackness, a ball of nothingness 2 feet in diameter. Any matter that comes in contact with the sphere is instantly sucked into the void. Control check: DC 30 (1d20 + character level + Int modifier). Speed: 10 ft. + 5 ft. per 5 points above DC 30.",
    "fr": "Un globe de noirceur absolue, une boule de néant de 60 cm de diamètre. Toute matière qui entre en contact avec la sphère est instantanément aspirée dans le vide. Jet de contrôle : DD 30 (1d20 + niveau du personnage + modificateur d'Int). Vitesse : 3 m + 1,5 m par tranche de 5 points au-dessus du DD 30."
  },
  "tags": ["item", "artifact", "magic_item", "major_artifact"],
  "equipmentSlot": "none",
  "weightLbs": 0,
  "costGp": 0,
  "grantedModifiers": [],
  "grantedFeatures": []
}
```

---

## A.10. Complete Monster: Orc Warrior 1

> _This example demonstrates how a monster is built exactly like a PC in the ECS system: a creature type (`race`) provides racial traits, combined with class levels (here `class_warrior`, the NPC class). The resulting Character uses `classLevels` normally. This proves that the engine makes zero technical distinction between a PC and a monster._

### A.10.1. Orc Race (Monster Racial Traits)

> _Demonstrates: strong ability score modifiers (+4 STR, -2 INT/WIS/CHA), darkvision as a granted feature, and Light Sensitivity as a situational modifier (`situationalContext: "in_bright_light"`) — the -1 attack penalty only applies when the context matches._

```json
{
  "id": "race_orc",
  "category": "race",
  "ruleSource": "srd_core",
  "label": { "en": "Orc", "fr": "Orque" },
  "description": {
    "en": "An orc's hair usually is black. It has lupine ears and reddish eyes. Orcs prefer wearing vivid colors that many humans would consider unpleasant, such as blood red, mustard yellow, yellow-green, and deep purple. Their equipment is dirty and unkempt.",
    "fr": "Les cheveux d'un orque sont généralement noirs. Il a des oreilles lupines et des yeux rougeâtres. Les orques préfèrent porter des couleurs vives que beaucoup d'humains considéreraient déplaisantes."
  },
  "tags": ["race", "humanoid", "medium", "race_orc", "orc"],
  "grantedModifiers": [
    {
      "id": "orc_str_bonus",
      "sourceId": "race_orc",
      "targetId": "attributes.stat_str",
      "value": 4,
      "type": "racial",
      "sourceName": { "en": "Orc", "fr": "Orque" }
    },
    {
      "id": "orc_int_penalty",
      "sourceId": "race_orc",
      "targetId": "attributes.stat_int",
      "value": -2,
      "type": "racial",
      "sourceName": { "en": "Orc", "fr": "Orque" }
    },
    {
      "id": "orc_wis_penalty",
      "sourceId": "race_orc",
      "targetId": "attributes.stat_wis",
      "value": -2,
      "type": "racial",
      "sourceName": { "en": "Orc", "fr": "Orque" }
    },
    {
      "id": "orc_cha_penalty",
      "sourceId": "race_orc",
      "targetId": "attributes.stat_cha",
      "value": -2,
      "type": "racial",
      "sourceName": { "en": "Orc", "fr": "Orque" }
    },
    {
      "id": "orc_speed",
      "sourceId": "race_orc",
      "targetId": "attributes.speed_land",
      "value": 30,
      "type": "base",
      "sourceName": { "en": "Orc", "fr": "Orque" }
    },
    {
      "id": "orc_light_sensitivity",
      "sourceId": "race_orc",
      "targetId": "combatStats.attack_bonus",
      "value": -1,
      "type": "untyped",
      "sourceName": { "en": "Light Sensitivity", "fr": "Sensibilité à la lumière" },
      "situationalContext": "in_bright_light"
    }
  ],
  "grantedFeatures": [
    "sense_darkvision_60",
    "language_common",
    "language_orc"
  ],
  "choices": []
}
```

### A.10.2. Warrior NPC Class (Levels 1-3)

> _The Warrior is the simplest NPC class. It serves to create soldiers, guards, and basic humanoid monsters. Full BAB progression, good Fortitude save only. Demonstrates that NPC classes follow the exact same `levelProgression` pattern as PC classes._

```json
{
  "id": "class_warrior",
  "category": "class",
  "ruleSource": "srd_core",
  "label": { "en": "Warrior", "fr": "Homme d'armes" },
  "description": {
    "en": "The warrior is the basic NPC fighting class. Warriors are not as skilled or versatile as fighters.",
    "fr": "L'homme d'armes est la classe PNJ de combat de base. Les hommes d'armes ne sont ni aussi compétents ni aussi polyvalents que les guerriers."
  },
  "tags": ["class", "npc_class", "martial", "class_warrior"],
  "grantedModifiers": [
    {
      "id": "warrior_hit_die",
      "sourceId": "class_warrior",
      "targetId": "combatStats.hit_die_type",
      "value": 8,
      "type": "base",
      "sourceName": { "en": "Warrior", "fr": "Homme d'armes" }
    },
    {
      "id": "warrior_skill_points",
      "sourceId": "class_warrior",
      "targetId": "attributes.skill_points_per_level",
      "value": 2,
      "type": "base",
      "sourceName": { "en": "Warrior", "fr": "Homme d'armes" }
    }
  ],
  "grantedFeatures": [
    "proficiency_all_simple",
    "proficiency_all_martial",
    "proficiency_all_armor",
    "proficiency_all_shields"
  ],
  "recommendedAttributes": ["stat_str", "stat_con"],
  "levelProgression": [
    {
      "level": 1,
      "grantedFeatures": [],
      "grantedModifiers": [
        { "id": "warrior_1_bab", "sourceId": "class_warrior", "targetId": "combatStats.bab", "value": 1, "type": "base", "sourceName": { "en": "Warrior 1", "fr": "Homme d'armes 1" } },
        { "id": "warrior_1_fort", "sourceId": "class_warrior", "targetId": "saves.fort", "value": 2, "type": "base", "sourceName": { "en": "Warrior 1", "fr": "Homme d'armes 1" } },
        { "id": "warrior_1_ref", "sourceId": "class_warrior", "targetId": "saves.ref", "value": 0, "type": "base", "sourceName": { "en": "Warrior 1", "fr": "Homme d'armes 1" } },
        { "id": "warrior_1_will", "sourceId": "class_warrior", "targetId": "saves.will", "value": 0, "type": "base", "sourceName": { "en": "Warrior 1", "fr": "Homme d'armes 1" } }
      ]
    },
    {
      "level": 2,
      "grantedFeatures": [],
      "grantedModifiers": [
        { "id": "warrior_2_bab", "sourceId": "class_warrior", "targetId": "combatStats.bab", "value": 1, "type": "base", "sourceName": { "en": "Warrior 2", "fr": "Homme d'armes 2" } },
        { "id": "warrior_2_fort", "sourceId": "class_warrior", "targetId": "saves.fort", "value": 1, "type": "base", "sourceName": { "en": "Warrior 2", "fr": "Homme d'armes 2" } }
      ]
    },
    {
      "level": 3,
      "grantedFeatures": [],
      "grantedModifiers": [
        { "id": "warrior_3_bab", "sourceId": "class_warrior", "targetId": "combatStats.bab", "value": 1, "type": "base", "sourceName": { "en": "Warrior 3", "fr": "Homme d'armes 3" } },
        { "id": "warrior_3_ref", "sourceId": "class_warrior", "targetId": "saves.ref", "value": 1, "type": "base", "sourceName": { "en": "Warrior 3", "fr": "Homme d'armes 3" } },
        { "id": "warrior_3_will", "sourceId": "class_warrior", "targetId": "saves.will", "value": 1, "type": "base", "sourceName": { "en": "Warrior 3", "fr": "Homme d'armes 3" } }
      ]
    }
  ]
}
```

### A.10.3. The Complete Monster Character (Orc Warrior 1)

> _This is what the `Character` JSON of an Orc Warrior 1 looks like when saved. This example shows the combination of race + NPC class + equipment, exactly like a PC. Note that the `attributes` contain `baseValue` only — the engine computes `totalValue` and `derivedModifier` at runtime by applying all modifiers from active features._

```json
{
  "id": "monster_orc_warrior_1",
  "name": "Orc Warrior",
  "isNPC": true,
  "campaignId": "campaign_001",
  "ownerId": "gm_user_001",
  "classLevels": {
    "class_warrior": 1
  },
  "activeFeatures": [
    {
      "instanceId": "afi_orc_race",
      "featureId": "race_orc",
      "isActive": true
    },
    {
      "instanceId": "afi_orc_warrior_class",
      "featureId": "class_warrior",
      "isActive": true
    },
    {
      "instanceId": "afi_orc_feat_alertness",
      "featureId": "feat_alertness",
      "isActive": true
    },
    {
      "instanceId": "afi_orc_falchion",
      "featureId": "item_falchion",
      "isActive": true
    },
    {
      "instanceId": "afi_orc_javelin",
      "featureId": "item_javelin",
      "isActive": false
    },
    {
      "instanceId": "afi_orc_studded_leather",
      "featureId": "item_studded_leather",
      "isActive": true
    },
    {
      "instanceId": "afi_orc_heavy_wooden_shield",
      "featureId": "item_heavy_wooden_shield",
      "isActive": true
    }
  ],
  "attributes": {
    "stat_str": { "id": "stat_str", "label": { "en": "Strength", "fr": "Force" }, "baseValue": 15, "activeModifiers": [], "situationalModifiers": [], "totalBonus": 0, "totalValue": 15, "derivedModifier": 0 },
    "stat_dex": { "id": "stat_dex", "label": { "en": "Dexterity", "fr": "Dextérité" }, "baseValue": 10, "activeModifiers": [], "situationalModifiers": [], "totalBonus": 0, "totalValue": 10, "derivedModifier": 0 },
    "stat_con": { "id": "stat_con", "label": { "en": "Constitution", "fr": "Constitution" }, "baseValue": 11, "activeModifiers": [], "situationalModifiers": [], "totalBonus": 0, "totalValue": 11, "derivedModifier": 0 },
    "stat_int": { "id": "stat_int", "label": { "en": "Intelligence", "fr": "Intelligence" }, "baseValue": 8, "activeModifiers": [], "situationalModifiers": [], "totalBonus": 0, "totalValue": 8, "derivedModifier": 0 },
    "stat_wis": { "id": "stat_wis", "label": { "en": "Wisdom", "fr": "Sagesse" }, "baseValue": 7, "activeModifiers": [], "situationalModifiers": [], "totalBonus": 0, "totalValue": 7, "derivedModifier": 0 },
    "stat_cha": { "id": "stat_cha", "label": { "en": "Charisma", "fr": "Charisme" }, "baseValue": 6, "activeModifiers": [], "situationalModifiers": [], "totalBonus": 0, "totalValue": 6, "derivedModifier": 0 }
  },
  "skills": {},
  "combatStats": {},
  "saves": {},
  "resources": {
    "hp": {
      "id": "hp",
      "label": { "en": "Hit Points", "fr": "Points de vie" },
      "maxPipelineId": "stat_max_hp",
      "currentValue": 5,
      "temporaryValue": 0,
      "resetCondition": "never"
    }
  },
  "linkedEntities": [],
  "gmOverrides": []
}
```

> **How the engine resolves this Orc (step-by-step walkthrough):**
> 1. Loads `race_orc` → applies +4 STR, -2 INT, -2 WIS, -2 CHA (racial type), darkvision, speed 30, light sensitivity (situational).
> 2. Loads `class_warrior` level 1 → applies BAB +1, Fort +2, Ref +0, Will +0, d8 HD.
> 3. Final attributes: STR 15+4=19 (mod +4), DEX 10 (mod +0), CON 11 (mod +0), INT 8-2=6 (mod -2), WIS 7-2=5 (mod -3), CHA 6-2=4 (mod -3).
> 4. BAB = +1. Fort = +2+0 = +2. Ref = +0+0 = +0. Will = +0+(-3) = -3.
> 5. Loads active items: studded leather (AC +3 armor), heavy wooden shield (AC +2 shield), falchion (2d4, 18-20/x2).
> 6. AC = 10 + 0 (DEX) + 3 (armor) + 2 (shield) = **15**.
> 7. Attack (falchion) = BAB(+1) + STR(+4) = **+5**, Damage = 2d4 + STR(+4) x 1.5 (two-handed) = **2d4+6**.

---

## A.11. Environment Features

> _These examples demonstrate the Global Aura concept (section 13 of the main document). When the GM activates an Environment Feature via the scene, it is injected into the `activeFeatures` of ALL characters. Effects apply automatically via the DAG, and characters with protections (e.g., Endure Elements) can block them via `conditionNode`._

### A.11.1. Extreme Heat

> _Demonstrates: conditional modifier gating on TWO conditions (heavy armor AND no Endure Elements), a speed penalty gated only on the absence of protection, situational context for save penalties, and an informational zero-value modifier. This is the primary test case for environment/protection interaction._

```json
{
  "id": "environment_extreme_heat",
  "category": "environment",
  "ruleSource": "srd_core",
  "label": { "en": "Extreme Heat", "fr": "Chaleur extrême" },
  "description": {
    "en": "The temperature is above 110°F (43°C). Characters must make a Fortitude save each hour (DC 15, +1 per previous check) or take 1d4 nonlethal damage. Characters wearing heavy armor or heavy clothing take a -4 penalty on their saves. Characters with the Endure Elements effect are immune.",
    "fr": "La température est supérieure à 43°C. Les personnages doivent effectuer un jet de Vigueur chaque heure (DD 15, +1 par jet précédent) ou subir 1d4 points de dégâts non-létaux. Les personnages portant une armure lourde ou des vêtements lourds subissent un malus de -4 à leurs jets. Les personnages sous l'effet d'Endurance aux énergies destructrices sont immunisés."
  },
  "tags": ["environment", "heat", "natural_hazard", "weather"],
  "grantedModifiers": [
    {
      "id": "extreme_heat_fort_penalty_heavy",
      "sourceId": "environment_extreme_heat",
      "targetId": "saves.fort",
      "value": -4,
      "type": "untyped",
      "sourceName": { "en": "Extreme Heat (Heavy Armor)", "fr": "Chaleur extrême (Armure lourde)" },
      "conditionNode": {
        "logic": "AND",
        "nodes": [
          {
            "logic": "CONDITION",
            "targetPath": "@activeTags",
            "operator": "has_tag",
            "value": "heavy_armor"
          },
          {
            "logic": "NOT",
            "node": {
              "logic": "CONDITION",
              "targetPath": "@activeTags",
              "operator": "has_tag",
              "value": "endure_elements"
            }
          }
        ]
      },
      "situationalContext": "vs_heat_hazard"
    },
    {
      "id": "extreme_heat_speed_penalty",
      "sourceId": "environment_extreme_heat",
      "targetId": "attributes.speed_land",
      "value": -5,
      "type": "untyped",
      "sourceName": { "en": "Heat Exhaustion", "fr": "Épuisement dû à la chaleur" },
      "conditionNode": {
        "logic": "NOT",
        "node": {
          "logic": "CONDITION",
          "targetPath": "@activeTags",
          "operator": "has_tag",
          "value": "endure_elements"
        }
      }
    },
    {
      "id": "extreme_heat_survival_bonus",
      "sourceId": "environment_extreme_heat",
      "targetId": "skills.skill_survival",
      "value": 0,
      "type": "untyped",
      "sourceName": { "en": "Extreme Heat (Informational)", "fr": "Chaleur extrême (Informatif)" }
    }
  ],
  "grantedFeatures": [],
  "choices": []
}
```

### A.11.2. Endure Elements (The Counter — Buff That Blocks the Environment)

> _Demonstrates: the protection spell that counters Extreme Heat. By having the `endure_elements` tag in its `tags` array, when this spell is active on a character, all `conditionNode` checks in the heat environment that verify `NOT has_tag endure_elements` will fail, effectively neutralizing the heat penalties._

```json
{
  "id": "spell_endure_elements",
  "category": "magic",
  "ruleSource": "srd_core",
  "label": { "en": "Endure Elements", "fr": "Endurance aux énergies destructrices" },
  "description": {
    "en": "A creature protected by endure elements suffers no harm from being in a place of extreme heat or cold (between -50°F and 140°F). The creature's equipment is likewise protected.",
    "fr": "Une créature protégée par endurance aux énergies destructrices ne subit aucun dommage dû à une chaleur ou un froid extrême (entre -45°C et 60°C). L'équipement de la créature est également protégé."
  },
  "tags": ["magic", "spell", "divine", "arcane", "abjuration", "endure_elements"],
  "magicType": "divine",
  "spellLists": { "list_cleric": 1, "list_druid": 1, "list_ranger": 1, "list_sorcerer_wizard": 1, "list_paladin": 1, "list_domain_sun": 1 },
  "school": "abjuration",
  "descriptors": [],
  "resistanceType": "spell_resistance",
  "components": ["V", "S"],
  "range": "touch",
  "targetArea": { "en": "Creature touched", "fr": "Créature touchée" },
  "duration": "24 hours",
  "savingThrow": "will_negates_harmless",
  "grantedModifiers": [],
  "grantedFeatures": []
}
```

> **How the engine resolves this interaction (step-by-step walkthrough):**
> 1. The GM activates `environment_extreme_heat` as a global scene Feature.
> 2. The engine injects this Feature into the `activeFeatures` of all characters.
> 3. For each character, the engine evaluates the `conditionNode` of each modifier:
>    - **Character A** (wearing heavy armor, no Endure Elements): The `heavy_armor` tag is present, `endure_elements` is absent → The -4 Fort penalty **applies**. The -5 speed penalty **applies**.
>    - **Character B** (light armor, no Endure Elements): The `heavy_armor` tag is absent → The -4 Fort penalty **does not apply**. The -5 speed penalty **does apply** (because it only depends on the absence of Endure Elements).
>    - **Character C** (has the Endure Elements buff active, so the `endure_elements` tag is present): All `conditionNode` checks fail because they verify `NOT has_tag endure_elements` → **No penalties apply**. The character is fully protected.
> 4. Non-lethal damage (1d4 per hour) is handled by the GM's action system (not automatic — the GM rolls and applies damage manually or via a timer in a future version).

### A.11.3. Underwater Environment

> _A more complex environment demonstrating: attack penalty conditional on NOT having Freedom of Movement AND NOT having a swim speed, damage penalty with a formula referencing the current damage bonus (halved for non-piercing weapons), and speed reduction to quarter speed using a formula that computes the difference needed._

```json
{
  "id": "environment_underwater",
  "category": "environment",
  "ruleSource": "srd_core",
  "label": { "en": "Underwater", "fr": "Sous l'eau" },
  "description": {
    "en": "Characters fighting underwater are at a significant disadvantage. Slashing and bludgeoning weapons take penalties. Fire spells are useless. Movement is reduced unless the character has a swim speed.",
    "fr": "Les personnages combattant sous l'eau sont considérablement désavantagés. Les armes tranchantes et contondantes subissent des malus. Les sorts de feu sont inutiles. Le déplacement est réduit sauf si le personnage a une vitesse de nage."
  },
  "tags": ["environment", "underwater", "aquatic"],
  "grantedModifiers": [
    {
      "id": "underwater_slashing_penalty",
      "sourceId": "environment_underwater",
      "targetId": "combatStats.attack_bonus",
      "value": -2,
      "type": "untyped",
      "sourceName": { "en": "Underwater Combat", "fr": "Combat sous-marin" },
      "conditionNode": {
        "logic": "AND",
        "nodes": [
          {
            "logic": "NOT",
            "node": {
              "logic": "CONDITION",
              "targetPath": "@activeTags",
              "operator": "has_tag",
              "value": "freedom_of_movement"
            }
          },
          {
            "logic": "NOT",
            "node": {
              "logic": "CONDITION",
              "targetPath": "@activeTags",
              "operator": "has_tag",
              "value": "has_swim_speed"
            }
          }
        ]
      }
    },
    {
      "id": "underwater_damage_penalty",
      "sourceId": "environment_underwater",
      "targetId": "combatStats.damage_bonus",
      "value": "-floor(@combatStats.damage_bonus.totalValue / 2)",
      "type": "untyped",
      "sourceName": { "en": "Underwater Damage Reduction", "fr": "Réduction de dégâts sous-marine" },
      "conditionNode": {
        "logic": "AND",
        "nodes": [
          {
            "logic": "CONDITION",
            "targetPath": "@equippedWeaponTags",
            "operator": "not_includes",
            "value": "piercing"
          },
          {
            "logic": "NOT",
            "node": {
              "logic": "CONDITION",
              "targetPath": "@activeTags",
              "operator": "has_tag",
              "value": "freedom_of_movement"
            }
          }
        ]
      }
    },
    {
      "id": "underwater_speed_penalty",
      "sourceId": "environment_underwater",
      "targetId": "attributes.speed_land",
      "value": "0 - @attributes.speed_land.totalValue + floor(@attributes.speed_land.totalValue / 4)",
      "type": "untyped",
      "sourceName": { "en": "Underwater Movement (Quarter Speed)", "fr": "Déplacement sous-marin (Vitesse divisée par 4)" },
      "conditionNode": {
        "logic": "AND",
        "nodes": [
          {
            "logic": "NOT",
            "node": {
              "logic": "CONDITION",
              "targetPath": "@activeTags",
              "operator": "has_tag",
              "value": "has_swim_speed"
            }
          },
          {
            "logic": "NOT",
            "node": {
              "logic": "CONDITION",
              "targetPath": "@activeTags",
              "operator": "has_tag",
              "value": "freedom_of_movement"
            }
          }
        ]
      }
    }
  ],
  "grantedFeatures": [],
  "choices": []
}
```

> **AI Implementation Note — Underwater speed formula:** The `value` field is `"0 - @attributes.speed_land.totalValue + floor(@attributes.speed_land.totalValue / 4)"`. This is a mathematical trick: it subtracts the current speed and adds back a quarter, effectively setting speed to 25% of normal. The Math Parser must handle this negative-then-add pattern correctly. For a character with speed 30: `0 - 30 + floor(30/4)` = `-30 + 7` = `-23`, making final speed `30 + (-23)` = `7` (approximately quarter speed).

---

## A.12. Psionic Powers with Augmentations

> _These examples demonstrate the psionic augmentation system, the key mechanic distinguishing psionic magic from arcane/divine in D&D 3.5. A psionic power has a base cost in Power Points (PP) and can be "augmented" by spending additional PP to enhance its effects. The `augmentations` field on `MagicFeature` handles this mechanic in a data-driven way._

### A.12.1. Energy Missile (Level 2 Psionic Power)

> _Demonstrates: two different repeatable augmentations (one for damage at +1 PP, one for extra missiles at +2 PP), energy type FeatureChoice, and the fundamental psionic cost cap rule._

```json
{
  "id": "power_energy_missile",
  "category": "magic",
  "ruleSource": "srd_psionics",
  "label": { "en": "Energy Missile", "fr": "Missile d'énergie" },
  "description": {
    "en": "Upon manifesting this power, you choose cold, electricity, fire, or sonic. You release a powerful missile of energy of the chosen type at your foe. The missile deals 3d6 points of damage of the chosen energy type to a single target. For every additional power point you spend, this power's damage increases by one die (d6). For each extra 2 PP spent, you can manifest an additional missile (max 5 missiles).",
    "fr": "En manifestant ce pouvoir, vous choisissez froid, électricité, feu ou son. Vous libérez un puissant missile d'énergie du type choisi contre votre ennemi. Le missile inflige 3d6 points de dégâts du type d'énergie choisi à une seule cible. Pour chaque point de pouvoir supplémentaire dépensé, les dégâts de ce pouvoir augmentent d'un dé (d6). Pour chaque tranche de 2 PP supplémentaires, vous pouvez manifester un missile additionnel (max 5 missiles)."
  },
  "tags": ["magic", "power", "psionic", "psychokinesis"],
  "magicType": "psionic",
  "spellLists": { "list_psion_kineticist": 2, "list_wilder": 2 },
  "school": "psychokinesis",
  "descriptors": ["cold", "electricity", "fire", "sonic"],
  "resistanceType": "power_resistance",
  "components": ["V", "S"],
  "range": "200 + 20 * floor(@attributes.manifester_level.totalValue)",
  "targetArea": { "en": "Up to five creatures or objects, no two of which can be more than 15 ft. apart", "fr": "Jusqu'à cinq créatures ou objets, dont aucun ne peut être distant de plus de 4,5 m d'un autre" },
  "duration": "instantaneous",
  "savingThrow": "ref_half",
  "grantedModifiers": [],
  "grantedFeatures": [],
  "choices": [
    {
      "choiceId": "energy_type",
      "label": { "en": "Energy Type", "fr": "Type d'énergie" },
      "optionsQuery": "tag:energy_type_selectable",
      "maxSelections": 1
    }
  ],
  "activation": {
    "actionType": "standard",
    "resourceCost": { "targetId": "resources.power_points", "cost": 3 }
  },
  "augmentations": [
    {
      "costIncrement": 1,
      "grantedModifiers": [
        {
          "id": "energy_missile_aug_damage",
          "sourceId": "power_energy_missile",
          "targetId": "combatStats.power_damage_bonus",
          "value": "1d6",
          "type": "untyped",
          "sourceName": { "en": "Energy Missile (Augmented Damage)", "fr": "Missile d'énergie (Dégâts augmentés)" }
        }
      ],
      "isRepeatable": true
    },
    {
      "costIncrement": 2,
      "grantedModifiers": [
        {
          "id": "energy_missile_aug_extra_missile",
          "sourceId": "power_energy_missile",
          "targetId": "combatStats.power_extra_missiles",
          "value": 1,
          "type": "untyped",
          "sourceName": { "en": "Energy Missile (Extra Missile)", "fr": "Missile d'énergie (Missile supplémentaire)" }
        }
      ],
      "isRepeatable": true
    }
  ]
}
```

### A.12.2. Energy Push (Level 2 Psionic Power with Single Augmentation)

> _Demonstrates a power with only one augmentation type (repeatable), showing that not all powers have multiple augmentation options._

```json
{
  "id": "power_energy_push",
  "category": "magic",
  "ruleSource": "srd_psionics",
  "label": { "en": "Energy Push", "fr": "Poussée d'énergie" },
  "description": {
    "en": "Upon manifesting this power, you choose cold, electricity, fire, or sonic. You create a solid, translucent field of the chosen energy type that pushes your target back and deals 2d6 points of damage. The target must make a Strength check (DC = damage dealt) or be pushed back 5 feet plus 5 feet per 5 points of damage dealt. Augment: For every 2 additional PP spent, this power's damage increases by 1d6 and the DC increases accordingly.",
    "fr": "En manifestant ce pouvoir, vous choisissez froid, électricité, feu ou son. Vous créez un champ solide et translucide du type d'énergie choisi qui repousse votre cible et inflige 2d6 points de dégâts. La cible doit réussir un test de Force (DD = dégâts infligés) sous peine d'être repoussée de 1,5 m plus 1,5 m par tranche de 5 points de dégâts. Augmentation : Pour chaque tranche de 2 PP supplémentaires dépensés, les dégâts augmentent de 1d6."
  },
  "tags": ["magic", "power", "psionic", "psychokinesis"],
  "magicType": "psionic",
  "spellLists": { "list_psion_kineticist": 2 },
  "school": "psychokinesis",
  "descriptors": ["cold", "electricity", "fire", "sonic"],
  "resistanceType": "power_resistance",
  "components": ["V", "S"],
  "range": "200 + 20 * floor(@attributes.manifester_level.totalValue)",
  "targetArea": { "en": "One creature or object", "fr": "Une créature ou un objet" },
  "duration": "instantaneous",
  "savingThrow": "ref_half",
  "grantedModifiers": [],
  "grantedFeatures": [],
  "choices": [
    {
      "choiceId": "energy_type",
      "label": { "en": "Energy Type", "fr": "Type d'énergie" },
      "optionsQuery": "tag:energy_type_selectable",
      "maxSelections": 1
    }
  ],
  "activation": {
    "actionType": "standard",
    "resourceCost": { "targetId": "resources.power_points", "cost": 3 }
  },
  "augmentations": [
    {
      "costIncrement": 2,
      "grantedModifiers": [
        {
          "id": "energy_push_aug_damage",
          "sourceId": "power_energy_push",
          "targetId": "combatStats.power_damage_bonus",
          "value": "1d6",
          "type": "untyped",
          "sourceName": { "en": "Energy Push (Augmented)", "fr": "Poussée d'énergie (Augmentée)" }
        }
      ],
      "isRepeatable": true
    }
  ]
}
```

### A.12.3. Metamorphosis (Complex Level 4 Psionic Power — Non-Repeatable Augmentation)

> _Demonstrates a power with an expensive, non-repeatable augmentation that fundamentally changes the nature of the effect (regular → greater metamorphosis). The `isRepeatable: false` flag is critical._

```json
{
  "id": "power_metamorphosis",
  "category": "magic",
  "ruleSource": "srd_psionics",
  "label": { "en": "Metamorphosis", "fr": "Métamorphose" },
  "description": {
    "en": "You assume the form of a creature of the same type as your normal form. The assumed form can't have more Hit Dice than your manifester level, to a maximum of 15 HD at 15th level. You acquire the physical qualities of the new form while retaining your own mind. Augment: If you spend 6 additional PP, you can manifest Greater Metamorphosis instead, allowing you to assume the form of any creature (not limited to your type).",
    "fr": "Vous prenez la forme d'une créature du même type que votre forme normale. La forme assumée ne peut pas avoir plus de Dés de Vie que votre niveau de manifestant, jusqu'à un maximum de 15 DV au niveau 15. Vous acquérez les qualités physiques de la nouvelle forme tout en conservant votre propre esprit. Augmentation : Si vous dépensez 6 PP supplémentaires, vous pouvez manifester Métamorphose supérieure à la place, vous permettant de prendre la forme de n'importe quelle créature."
  },
  "tags": ["magic", "power", "psionic", "psychometabolism", "shapechange"],
  "magicType": "psionic",
  "spellLists": { "list_psion_egoist": 4 },
  "school": "psychometabolism",
  "descriptors": [],
  "resistanceType": "none",
  "components": ["V", "S"],
  "range": "personal",
  "targetArea": { "en": "You", "fr": "Vous" },
  "duration": "1 min./level",
  "savingThrow": "none",
  "grantedModifiers": [],
  "grantedFeatures": [],
  "activation": {
    "actionType": "standard",
    "resourceCost": { "targetId": "resources.power_points", "cost": 7 }
  },
  "augmentations": [
    {
      "costIncrement": 6,
      "grantedModifiers": [
        {
          "id": "metamorphosis_greater_unlock",
          "sourceId": "power_metamorphosis",
          "targetId": "attributes.metamorphosis_type_restriction",
          "value": 0,
          "type": "setAbsolute",
          "sourceName": { "en": "Greater Metamorphosis (Any Type)", "fr": "Métamorphose supérieure (Tout type)" }
        }
      ],
      "isRepeatable": false
    }
  ]
}
```

> **How the engine resolves augmentations (step-by-step walkthrough):**
>
> 1. **At manifestation time**, the UI displays the base cost (e.g., 3 PP for Energy Missile) and available augmentations.
> 2. **Total cost cap**: The total cost (base + augmentations) can **never exceed the manifester level** of the character. A level 5 Psion cannot spend more than 5 PP total on a single power. This is the fundamental limitation of psionics in D&D 3.5.
> 3. **For Energy Missile (base cost 3 PP):**
>    - Level 3 Psion: Max cost 3 PP → No augmentation possible (3 + 1 = 4 > 3).
>    - Level 5 Psion: Max cost 5 PP → Can add +2 PP of augmentations. Examples: +2 damage dice (+1 PP x 2), or +1 extra missile (+2 PP), or +1 damage die and that's it.
>    - Level 9 Psion: Max cost 9 PP → Can add +6 PP. Examples: +3 extra missiles (+6 PP), or +6 damage dice (+6 PP), or a mix.
> 4. **For Metamorphosis (base cost 7 PP):**
>    - Level 7 Psion: Max cost 7 PP → No augmentation possible.
>    - Level 13 Psion: Max cost 13 PP → Can pay +6 PP for Greater Metamorphosis (total 13 PP = exactly at max). And since `isRepeatable` is `false`, you cannot pay +12 PP for a "double" augmentation.
> 5. **The UI (Phase 12.3)** must display augmentations as counters/buttons with the incremental cost, graying out those that would exceed the manifester level cap.

# Annex B: Configuration Data Tables

This annex provides the reference data tables required by the engine for calculations that cannot be derived from simple formulas. These tables are stored as JSON configuration files loaded by the `DataLoader` and are **never hardcoded** in TypeScript or Svelte logic.

> **AI Implementation Note:** These tables are loaded once at startup and cached in memory. They are referenced by the engine's DAG phases (particularly Phase 3 for HP/BAB/Saves and Phase 4 for Skills). The engine accesses them via the `DataLoader.getConfigTable(tableId)` method. All values use imperial units (feet, pounds) as the internal reference — the i18n layer converts them for display.

> **Convention:** Each configuration file is a JSON object with a `tableId` field and a `data` field. The `data` field structure varies by table type (lookup array, key-value map, etc.).

---

## B.1. XP Thresholds per Level

> _Used by the Combat tab (Phase 10.1) to render the XP progress bar and determine when the "Level Up" button should activate. The engine compares the character's current XP total against the threshold for the next level._

```json
{
  "tableId": "config_xp_thresholds",
  "ruleSource": "srd_core",
  "description": "D&D 3.5 experience point thresholds. Index = character level, value = minimum XP required to reach that level.",
  "data": [
    { "level": 1,  "xpRequired": 0 },
    { "level": 2,  "xpRequired": 1000 },
    { "level": 3,  "xpRequired": 3000 },
    { "level": 4,  "xpRequired": 6000 },
    { "level": 5,  "xpRequired": 10000 },
    { "level": 6,  "xpRequired": 15000 },
    { "level": 7,  "xpRequired": 21000 },
    { "level": 8,  "xpRequired": 28000 },
    { "level": 9,  "xpRequired": 36000 },
    { "level": 10, "xpRequired": 45000 },
    { "level": 11, "xpRequired": 55000 },
    { "level": 12, "xpRequired": 66000 },
    { "level": 13, "xpRequired": 78000 },
    { "level": 14, "xpRequired": 91000 },
    { "level": 15, "xpRequired": 105000 },
    { "level": 16, "xpRequired": 120000 },
    { "level": 17, "xpRequired": 136000 },
    { "level": 18, "xpRequired": 153000 },
    { "level": 19, "xpRequired": 171000 },
    { "level": 20, "xpRequired": 190000 }
  ]
}
```

> **AI Implementation Note:** The XP table is deliberately non-formulaic (the differences between levels are not constant: 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 11000, ...). A lookup table is therefore required — do NOT attempt to derive these from a formula. For epic levels (21+), the pattern becomes regular (+10000 per level) but should still be defined in a separate `config_xp_thresholds_epic` table loaded from an epic rule source.

---

## B.2. Carrying Capacity by Strength Score

> _Used by the Inventory tab (Phase 13.4) to determine Light/Medium/Heavy load thresholds. The engine looks up the character's current Strength score (after all modifiers) in this table to determine the three load brackets. When weight exceeds the Light threshold, the engine injects the appropriate encumbrance condition Feature._

```json
{
  "tableId": "config_carrying_capacity",
  "ruleSource": "srd_core",
  "description": "D&D 3.5 carrying capacity thresholds in pounds, indexed by Strength score. For Strength scores above 29, use the formula described in the extrapolation rules below.",
  "data": [
    { "strength": 1,  "lightLoad": 3,    "mediumLoad": 6,    "heavyLoad": 10 },
    { "strength": 2,  "lightLoad": 6,    "mediumLoad": 13,   "heavyLoad": 20 },
    { "strength": 3,  "lightLoad": 10,   "mediumLoad": 20,   "heavyLoad": 30 },
    { "strength": 4,  "lightLoad": 13,   "mediumLoad": 26,   "heavyLoad": 40 },
    { "strength": 5,  "lightLoad": 16,   "mediumLoad": 33,   "heavyLoad": 50 },
    { "strength": 6,  "lightLoad": 20,   "mediumLoad": 40,   "heavyLoad": 60 },
    { "strength": 7,  "lightLoad": 23,   "mediumLoad": 46,   "heavyLoad": 70 },
    { "strength": 8,  "lightLoad": 26,   "mediumLoad": 53,   "heavyLoad": 80 },
    { "strength": 9,  "lightLoad": 30,   "mediumLoad": 60,   "heavyLoad": 90 },
    { "strength": 10, "lightLoad": 33,   "mediumLoad": 66,   "heavyLoad": 100 },
    { "strength": 11, "lightLoad": 38,   "mediumLoad": 76,   "heavyLoad": 115 },
    { "strength": 12, "lightLoad": 43,   "mediumLoad": 86,   "heavyLoad": 130 },
    { "strength": 13, "lightLoad": 50,   "mediumLoad": 100,  "heavyLoad": 150 },
    { "strength": 14, "lightLoad": 58,   "mediumLoad": 116,  "heavyLoad": 175 },
    { "strength": 15, "lightLoad": 66,   "mediumLoad": 133,  "heavyLoad": 200 },
    { "strength": 16, "lightLoad": 76,   "mediumLoad": 153,  "heavyLoad": 230 },
    { "strength": 17, "lightLoad": 86,   "mediumLoad": 173,  "heavyLoad": 260 },
    { "strength": 18, "lightLoad": 100,  "mediumLoad": 200,  "heavyLoad": 300 },
    { "strength": 19, "lightLoad": 116,  "mediumLoad": 233,  "heavyLoad": 350 },
    { "strength": 20, "lightLoad": 133,  "mediumLoad": 266,  "heavyLoad": 400 },
    { "strength": 21, "lightLoad": 153,  "mediumLoad": 306,  "heavyLoad": 460 },
    { "strength": 22, "lightLoad": 173,  "mediumLoad": 346,  "heavyLoad": 520 },
    { "strength": 23, "lightLoad": 200,  "mediumLoad": 400,  "heavyLoad": 600 },
    { "strength": 24, "lightLoad": 233,  "mediumLoad": 466,  "heavyLoad": 700 },
    { "strength": 25, "lightLoad": 266,  "mediumLoad": 533,  "heavyLoad": 800 },
    { "strength": 26, "lightLoad": 306,  "mediumLoad": 613,  "heavyLoad": 920 },
    { "strength": 27, "lightLoad": 346,  "mediumLoad": 693,  "heavyLoad": 1040 },
    { "strength": 28, "lightLoad": 400,  "mediumLoad": 800,  "heavyLoad": 1200 },
    { "strength": 29, "lightLoad": 466,  "mediumLoad": 933,  "heavyLoad": 1400 }
  ],
  "extrapolation": {
    "description": "For Strength scores of 30 and above: every +10 Strength multiplies carrying capacity by x4. Find the row for (Strength - 10), then multiply all values by 4. For example, Strength 30 = Strength 20 values x4. Strength 40 = Strength 20 values x16.",
    "multiplierPer10": 4
  }
}
```

> **AI Implementation Note:** The `extrapolation` field handles epic Strength scores (30+). The engine should implement this as: `if (str > 29) { baseStr = ((str - 20) % 10) + 20; multiplier = 4 ^ floor((str - 20) / 10); return lookup(baseStr) * multiplier; }`. For example, STR 35: baseStr = (15 % 10) + 20 = 25, multiplier = 4^1 = 4, so lightLoad = 266 * 4 = 1064.

> **Size modifier:** Small creatures carry 3/4 of the listed values. Large creatures carry x2. This is handled by a separate size modifier pipeline, not by modifying this table.

---

## B.3. Point Buy Costs

> _Used by the Stat Generation Wizard (Phase 9.4) to implement the D&D 3.5 point buy system. The player distributes a budget of points (default: 25, configurable via `CampaignSettings.statGeneration.pointBuyBudget`) across the six ability scores. Each score starts at 8 (costing 0 points). The cost to increase a score is non-linear._

```json
{
  "tableId": "config_point_buy_costs",
  "ruleSource": "srd_core",
  "description": "D&D 3.5 point buy cost table. Each entry maps an ability score to the cumulative point cost to reach that score from a base of 8. Scores below 8 grant points back (negative cost).",
  "data": [
    { "score": 7,  "cost": -4 },
    { "score": 8,  "cost": 0 },
    { "score": 9,  "cost": 1 },
    { "score": 10, "cost": 2 },
    { "score": 11, "cost": 3 },
    { "score": 12, "cost": 4 },
    { "score": 13, "cost": 5 },
    { "score": 14, "cost": 6 },
    { "score": 15, "cost": 8 },
    { "score": 16, "cost": 10 },
    { "score": 17, "cost": 13 },
    { "score": 18, "cost": 16 }
  ],
  "constraints": {
    "minimumScore": 7,
    "maximumScore": 18,
    "defaultScore": 8,
    "description": "No ability score can be set below 7 or above 18 during point buy. The default starting score for each ability is 8 (cost 0). Common budget values: Low Fantasy = 15, Standard = 25, High Fantasy = 32, Epic = 45."
  }
}
```

> **AI Implementation Note:** The cost curve is non-linear — scores 15+ cost significantly more. This is intentional in D&D 3.5 to discourage extreme min-maxing. The UI (Phase 9.4) should show the marginal cost (cost to go from current score to current+1) alongside the total spent. For example, going from 14 to 15 costs 2 points (8-6), but going from 17 to 18 costs 3 points (16-13).

---

## B.4. Ability Score Modifier Table

> _While the formula `floor((score - 10) / 2)` can compute this, providing a lookup table ensures consistency and makes it available for display purposes in the UI without recalculation. This table also serves as documentation for content creators._

```json
{
  "tableId": "config_ability_modifiers",
  "ruleSource": "srd_core",
  "description": "D&D 3.5 ability score to modifier mapping. Formula: floor((score - 10) / 2). This table is provided for reference and UI display — the engine computes derivedModifier using the formula directly.",
  "data": [
    { "score": 1,  "modifier": -5 },
    { "score": 2,  "modifier": -4 },
    { "score": 3,  "modifier": -4 },
    { "score": 4,  "modifier": -3 },
    { "score": 5,  "modifier": -3 },
    { "score": 6,  "modifier": -2 },
    { "score": 7,  "modifier": -2 },
    { "score": 8,  "modifier": -1 },
    { "score": 9,  "modifier": -1 },
    { "score": 10, "modifier": 0 },
    { "score": 11, "modifier": 0 },
    { "score": 12, "modifier": 1 },
    { "score": 13, "modifier": 1 },
    { "score": 14, "modifier": 2 },
    { "score": 15, "modifier": 2 },
    { "score": 16, "modifier": 3 },
    { "score": 17, "modifier": 3 },
    { "score": 18, "modifier": 4 },
    { "score": 19, "modifier": 4 },
    { "score": 20, "modifier": 5 }
  ],
  "note": "For scores above 20, continue using the formula: floor((score - 10) / 2). The table extends infinitely."
}
```

---

## B.5. Base Speed by Armor Type

> _Used by the Movement Speeds panel (Phase 10.5) and the encumbrance system. When a character wears medium or heavy armor, their base land speed is reduced according to this table. Characters with a base speed of 30 ft drop to 20 ft in medium/heavy armor. Characters with a base speed of 20 ft drop to 15 ft._

```json
{
  "tableId": "config_armor_speed_reduction",
  "ruleSource": "srd_core",
  "description": "Speed reduction when wearing medium or heavy armor, indexed by base land speed. Dwarves and characters with special features (e.g., Barbarian Fast Movement for medium armor) may override these reductions via their Feature modifiers.",
  "data": [
    { "baseSpeed": 20, "armoredSpeed": 15 },
    { "baseSpeed": 30, "armoredSpeed": 20 },
    { "baseSpeed": 40, "armoredSpeed": 30 },
    { "baseSpeed": 50, "armoredSpeed": 35 },
    { "baseSpeed": 60, "armoredSpeed": 40 },
    { "baseSpeed": 70, "armoredSpeed": 50 },
    { "baseSpeed": 80, "armoredSpeed": 55 },
    { "baseSpeed": 90, "armoredSpeed": 60 },
    { "baseSpeed": 100, "armoredSpeed": 70 }
  ],
  "note": "For speeds not listed, the general rule is: reduce speed by one-third (round down to nearest 5 ft). Formula: floor(baseSpeed * 2 / 3 / 5) * 5. Dwarves are an exception — their speed is not reduced by medium or heavy armor. This exception is handled by the Dwarf race Feature granting immunity to the armored speed reduction condition."
}
```

> **AI Implementation Note:** The encumbrance system (Phase 13.4) uses this table when injecting the `condition_medium_load` or `condition_heavy_load` Features. These condition Features contain a modifier that references this table to compute the correct speed reduction. Alternatively, the condition Feature can use a formula: `"0 - @attributes.speed_land.baseValue + floor(@attributes.speed_land.baseValue * 2 / 3 / 5) * 5"`.

---

## B.6. Skill Synergy Bonuses

> _Used by the Skills Matrix (Phase 9.6) to automatically apply synergy bonuses. In D&D 3.5, having 5 or more ranks in certain skills grants a +2 synergy bonus to related skills._

```json
{
  "tableId": "config_skill_synergies",
  "ruleSource": "srd_core",
  "description": "D&D 3.5 skill synergy bonuses. When a character has 5 or more ranks in the source skill, they receive a +2 synergy bonus to the target skill.",
  "requiredRanks": 5,
  "bonusValue": 2,
  "bonusType": "synergy",
  "data": [
    { "sourceSkill": "skill_bluff",              "targetSkill": "skill_diplomacy" },
    { "sourceSkill": "skill_bluff",              "targetSkill": "skill_intimidate" },
    { "sourceSkill": "skill_bluff",              "targetSkill": "skill_sleight_of_hand" },
    { "sourceSkill": "skill_bluff",              "targetSkill": "skill_disguise",          "condition": "acting_in_character" },
    { "sourceSkill": "skill_concentration",      "targetSkill": "skill_autohypnosis" },
    { "sourceSkill": "skill_craft",              "targetSkill": "skill_appraise",          "condition": "related_items" },
    { "sourceSkill": "skill_decipher_script",    "targetSkill": "skill_use_magic_device",  "condition": "scrolls" },
    { "sourceSkill": "skill_escape_artist",      "targetSkill": "skill_use_rope",          "condition": "bindings" },
    { "sourceSkill": "skill_handle_animal",      "targetSkill": "skill_ride" },
    { "sourceSkill": "skill_handle_animal",      "targetSkill": "skill_wild_empathy" },
    { "sourceSkill": "skill_jump",               "targetSkill": "skill_tumble" },
    { "sourceSkill": "skill_knowledge_arcana",   "targetSkill": "skill_spellcraft" },
    { "sourceSkill": "skill_knowledge_architecture", "targetSkill": "skill_search",        "condition": "secret_doors" },
    { "sourceSkill": "skill_knowledge_dungeoneering", "targetSkill": "skill_survival",     "condition": "underground" },
    { "sourceSkill": "skill_knowledge_geography", "targetSkill": "skill_survival",          "condition": "lost_or_natural_hazards" },
    { "sourceSkill": "skill_knowledge_history",   "targetSkill": "skill_bardic_knowledge" },
    { "sourceSkill": "skill_knowledge_local",     "targetSkill": "skill_gather_information" },
    { "sourceSkill": "skill_knowledge_nature",    "targetSkill": "skill_survival",          "condition": "aboveground_natural" },
    { "sourceSkill": "skill_knowledge_nobility",  "targetSkill": "skill_diplomacy" },
    { "sourceSkill": "skill_knowledge_planes",    "targetSkill": "skill_survival",          "condition": "other_planes" },
    { "sourceSkill": "skill_knowledge_religion",  "targetSkill": "skill_turn_undead" },
    { "sourceSkill": "skill_search",              "targetSkill": "skill_survival",          "condition": "following_tracks" },
    { "sourceSkill": "skill_sense_motive",        "targetSkill": "skill_diplomacy" },
    { "sourceSkill": "skill_spellcraft",          "targetSkill": "skill_use_magic_device",  "condition": "scrolls" },
    { "sourceSkill": "skill_survival",            "targetSkill": "skill_knowledge_nature" },
    { "sourceSkill": "skill_tumble",              "targetSkill": "skill_balance" },
    { "sourceSkill": "skill_tumble",              "targetSkill": "skill_jump" },
    { "sourceSkill": "skill_use_magic_device",    "targetSkill": "skill_spellcraft",        "condition": "decipher_scrolls" },
    { "sourceSkill": "skill_use_rope",            "targetSkill": "skill_climb",             "condition": "rope_climbing" },
    { "sourceSkill": "skill_use_rope",            "targetSkill": "skill_escape_artist",     "condition": "rope_bindings" }
  ]
}
```

> **AI Implementation Note:** Synergy bonuses are `synergy` type modifiers. Per stacking rules, synergy bonuses from different sources stack with each other (they are an exception like `dodge`, `circumstance`, and `untyped`). The `condition` field on some entries indicates a situational restriction — these should be treated as `situationalContext` when generating the synergy modifier, so they appear in the breakdown but may not always apply. For the initial implementation, synergies WITHOUT a condition are always active; those WITH a condition are treated as situational.

> **AI Implementation Note:** The engine should auto-generate these synergy modifiers during Phase 4 (Skills & Abilities) of the DAG. For each skill in the character's `skills` record, check if `ranks >= 5`, then look up all synergy targets and inject the appropriate `+2 synergy` modifier into those target pipelines.

---

## B.7. Standard Array

> _Used by the Stat Generation Wizard (Phase 9.4) when `CampaignSettings.statGeneration.method` is `"standard_array"`. The player assigns these six predetermined values to their six ability scores._

```json
{
  "tableId": "config_standard_array",
  "ruleSource": "srd_core",
  "description": "The standard array of ability scores for D&D 3.5. The player assigns each value to one ability score. No two abilities can have the same value from this array.",
  "data": [15, 14, 13, 12, 10, 8]
}
```

---

## B.8. Size Categories

> _Used by Phase 1 (Base & Equipment) of the DAG to apply size-based modifiers to AC, attack rolls, grapple, Hide checks, and carrying capacity._

```json
{
  "tableId": "config_size_categories",
  "ruleSource": "srd_core",
  "description": "D&D 3.5 size categories with their associated modifiers. Size modifiers are applied as 'size' type modifiers to the relevant pipelines.",
  "data": [
    {
      "id": "size_fine",
      "label": { "en": "Fine", "fr": "Infime" },
      "sizeModifierAC": 8,
      "sizeModifierAttack": 8,
      "sizeModifierGrapple": -16,
      "sizeModifierHide": 16,
      "carryingCapacityMultiplier": 0.125,
      "spaceReachFt": { "space": 0.5, "reach": 0 },
      "naturalReachTall": 0,
      "naturalReachLong": 0
    },
    {
      "id": "size_diminutive",
      "label": { "en": "Diminutive", "fr": "Minuscule" },
      "sizeModifierAC": 4,
      "sizeModifierAttack": 4,
      "sizeModifierGrapple": -12,
      "sizeModifierHide": 12,
      "carryingCapacityMultiplier": 0.25,
      "spaceReachFt": { "space": 1, "reach": 0 },
      "naturalReachTall": 0,
      "naturalReachLong": 0
    },
    {
      "id": "size_tiny",
      "label": { "en": "Tiny", "fr": "Tres petit" },
      "sizeModifierAC": 2,
      "sizeModifierAttack": 2,
      "sizeModifierGrapple": -8,
      "sizeModifierHide": 8,
      "carryingCapacityMultiplier": 0.5,
      "spaceReachFt": { "space": 2.5, "reach": 0 },
      "naturalReachTall": 0,
      "naturalReachLong": 0
    },
    {
      "id": "size_small",
      "label": { "en": "Small", "fr": "Petit" },
      "sizeModifierAC": 1,
      "sizeModifierAttack": 1,
      "sizeModifierGrapple": -4,
      "sizeModifierHide": 4,
      "carryingCapacityMultiplier": 0.75,
      "spaceReachFt": { "space": 5, "reach": 5 },
      "naturalReachTall": 5,
      "naturalReachLong": 5
    },
    {
      "id": "size_medium",
      "label": { "en": "Medium", "fr": "Moyen" },
      "sizeModifierAC": 0,
      "sizeModifierAttack": 0,
      "sizeModifierGrapple": 0,
      "sizeModifierHide": 0,
      "carryingCapacityMultiplier": 1,
      "spaceReachFt": { "space": 5, "reach": 5 },
      "naturalReachTall": 5,
      "naturalReachLong": 5
    },
    {
      "id": "size_large",
      "label": { "en": "Large", "fr": "Grand" },
      "sizeModifierAC": -1,
      "sizeModifierAttack": -1,
      "sizeModifierGrapple": 4,
      "sizeModifierHide": -4,
      "carryingCapacityMultiplier": 2,
      "spaceReachFt": { "space": 10, "reach": 10 },
      "naturalReachTall": 10,
      "naturalReachLong": 5
    },
    {
      "id": "size_huge",
      "label": { "en": "Huge", "fr": "Tres grand" },
      "sizeModifierAC": -2,
      "sizeModifierAttack": -2,
      "sizeModifierGrapple": 8,
      "sizeModifierHide": -8,
      "carryingCapacityMultiplier": 4,
      "spaceReachFt": { "space": 15, "reach": 15 },
      "naturalReachTall": 15,
      "naturalReachLong": 10
    },
    {
      "id": "size_gargantuan",
      "label": { "en": "Gargantuan", "fr": "Gargantuesque" },
      "sizeModifierAC": -4,
      "sizeModifierAttack": -4,
      "sizeModifierGrapple": 12,
      "sizeModifierHide": -12,
      "carryingCapacityMultiplier": 8,
      "spaceReachFt": { "space": 20, "reach": 20 },
      "naturalReachTall": 20,
      "naturalReachLong": 15
    },
    {
      "id": "size_colossal",
      "label": { "en": "Colossal", "fr": "Colossal" },
      "sizeModifierAC": -8,
      "sizeModifierAttack": -8,
      "sizeModifierGrapple": 16,
      "sizeModifierHide": -16,
      "carryingCapacityMultiplier": 16,
      "spaceReachFt": { "space": 30, "reach": 30 },
      "naturalReachTall": 30,
      "naturalReachLong": 20
    }
  ]
}
```

> **AI Implementation Note:** The `carryingCapacityMultiplier` is applied to the values from the carrying capacity table (B.2). For a Small creature with STR 10: lightLoad = 33 * 0.75 = 24.75 lb (round down to 24). The `naturalReachTall` vs `naturalReachLong` distinction matters for creatures with the "Long" body type (quadrupeds) vs "Tall" body type (bipeds) — but this is a combat detail that can be deferred to a future version.

---

## B.9. Multiclass Penalty XP Reduction

> _In D&D 3.5, characters whose class levels are too uneven take an XP penalty. This table defines the rules. Note: this mechanic is often ignored by many gaming groups — it can be disabled by excluding this config table from the enabled rule sources._

```json
{
  "tableId": "config_multiclass_penalty",
  "ruleSource": "srd_core",
  "description": "D&D 3.5 multiclass XP penalty rules. A character with multiple classes takes a -20% XP penalty for each class that is more than 1 level apart from their highest-level class. The favored class (determined by race) and prestige classes do not count for this calculation.",
  "data": {
    "xpPenaltyPerOffendingClass": -20,
    "maxLevelDifference": 1,
    "exemptions": ["prestige_class", "favored_class"]
  }
}
```

> **AI Implementation Note:** This is an informational/reference table. The actual XP penalty calculation is relatively complex and can be implemented as a utility function that reads this config. For the initial implementation, it is acceptable to display this as a warning in the UI without automatically reducing XP gains.

---

## B.10. Bonus Spells per Day by Ability Score

> _Used by the Spells & Powers tab (Phase 12.1) to calculate bonus spell slots. A caster with a high casting ability (e.g., Wisdom for Clerics) gains bonus spell slots._

```json
{
  "tableId": "config_bonus_spells_per_day",
  "ruleSource": "srd_core",
  "description": "Bonus spells per day based on the relevant ability modifier. The ability modifier determines how many bonus spells of each level the caster receives. A caster must have an ability score of at least 10 + spell level to cast a spell of that level at all.",
  "data": [
    { "modifier": 1,  "bonusBySpellLevel": [0, 1, 0, 0, 0, 0, 0, 0, 0, 0] },
    { "modifier": 2,  "bonusBySpellLevel": [0, 1, 1, 0, 0, 0, 0, 0, 0, 0] },
    { "modifier": 3,  "bonusBySpellLevel": [0, 1, 1, 1, 0, 0, 0, 0, 0, 0] },
    { "modifier": 4,  "bonusBySpellLevel": [0, 1, 1, 1, 1, 0, 0, 0, 0, 0] },
    { "modifier": 5,  "bonusBySpellLevel": [0, 2, 1, 1, 1, 1, 0, 0, 0, 0] },
    { "modifier": 6,  "bonusBySpellLevel": [0, 2, 2, 1, 1, 1, 1, 0, 0, 0] },
    { "modifier": 7,  "bonusBySpellLevel": [0, 2, 2, 2, 1, 1, 1, 1, 0, 0] },
    { "modifier": 8,  "bonusBySpellLevel": [0, 2, 2, 2, 2, 1, 1, 1, 1, 0] },
    { "modifier": 9,  "bonusBySpellLevel": [0, 3, 2, 2, 2, 2, 1, 1, 1, 1] },
    { "modifier": 10, "bonusBySpellLevel": [0, 3, 3, 2, 2, 2, 2, 1, 1, 1] }
  ],
  "note": "Index 0 of bonusBySpellLevel corresponds to cantrips (level 0) — there are never bonus cantrips. Index 1 = spell level 1, etc. For modifiers above 10, the pattern continues: each +4 to the modifier grants one additional bonus spell of each level. The minimum ability score to cast a spell of level N is 10 + N."
}
```

> **AI Implementation Note:** The `bonusBySpellLevel` array is 0-indexed where index 0 = cantrips (always 0 bonus). For a Cleric with Wisdom 20 (modifier +5): they get +2 bonus 1st-level, +1 bonus 2nd-level, +1 bonus 3rd-level, +1 bonus 4th-level, +1 bonus 5th-level spell slots per day. These are ADDED to the base spell slots from the class's `levelProgression`. Also note the minimum casting ability: a Cleric needs WIS 11+ to cast 1st-level spells, WIS 12+ for 2nd-level, etc. This validation should be checked in the Grimoire/Casting UI.

---

## B.11. Two-Weapon Fighting Penalties

> _Used by the Weapons & Attacks panel (Phase 10.4) to calculate attack penalties when fighting with two weapons._

```json
{
  "tableId": "config_two_weapon_fighting",
  "ruleSource": "srd_core",
  "description": "D&D 3.5 two-weapon fighting penalty table. Penalties apply to both the primary and off-hand attacks based on whether the off-hand weapon is light.",
  "data": {
    "normal": {
      "primaryHandPenalty": -6,
      "offHandPenalty": -10
    },
    "offHandLight": {
      "primaryHandPenalty": -4,
      "offHandPenalty": -8
    },
    "twoWeaponFighting": {
      "description": "The Two-Weapon Fighting feat reduces penalties by 2 for both hands.",
      "reduction": 2
    }
  }
}
```

---

## B.12. Movement and Encumbrance Effects

> _Defines the penalties applied when a character is carrying a Medium or Heavy load. These are injected as condition Features by the encumbrance system._

```json
{
  "tableId": "config_encumbrance_effects",
  "ruleSource": "srd_core",
  "description": "Penalties applied by Medium and Heavy load conditions. These values are used by the engine when auto-injecting encumbrance condition Features.",
  "data": {
    "medium_load": {
      "maxDexBonus": 3,
      "armorCheckPenalty": -3,
      "speedReduction": "reduced",
      "runMultiplier": 4,
      "description": "Medium load: Max Dex +3, check penalty -3, reduced speed (see armor speed table), run x4."
    },
    "heavy_load": {
      "maxDexBonus": 1,
      "armorCheckPenalty": -6,
      "speedReduction": "reduced",
      "runMultiplier": 3,
      "description": "Heavy load: Max Dex +1, check penalty -6, reduced speed (see armor speed table), run x3."
    },
    "overloaded": {
      "maxDexBonus": 0,
      "speedReduction": 5,
      "description": "Over heavy load limit: Max Dex +0, speed reduced to 5 ft, no running."
    }
  }
}
```

> **AI Implementation Note:** The `speedReduction: "reduced"` value means "use the armor speed reduction table (B.5)". The engine should look up the character's base speed in that table to find the encumbered speed. The `speedReduction: 5` for overloaded means "set speed to exactly 5 ft" — this can be implemented as a `setAbsolute` modifier on the speed pipeline.
