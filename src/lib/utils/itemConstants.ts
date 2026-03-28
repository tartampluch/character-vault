/**
 * @file itemConstants.ts
 * @description Item, weapon, magic type, and DR constants.
 *
 * Extracted from constants.ts. Import from constants.ts (barrel) for backward compatibility.
 */

/** Standard maximum charge count for a Dorje (psionic wand equivalent). D&D 3.5 SRD: 50 charges. */
export const DORJE_MAX_CHARGES = 50 as const;

/** Canonical identifier for a Cognizance Crystal psionic item. */
export const PSIONIC_ITEM_TYPE_CRYSTAL  = 'cognizance_crystal' as const;
/** Canonical identifier for a Dorje psionic item (psionic wand equivalent). */
export const PSIONIC_ITEM_TYPE_DORJE    = 'dorje'              as const;
/** Canonical identifier for a Power Stone psionic item. */
export const PSIONIC_ITEM_TYPE_STONE    = 'power_stone'        as const;
/** Canonical identifier for a Psicrown psionic item. */
export const PSIONIC_ITEM_TYPE_PSICROWN = 'psicrown'           as const;
/** Canonical identifier for a Psionic Tattoo item. */
export const PSIONIC_ITEM_TYPE_TATTOO   = 'psionic_tattoo'     as const;

/** Feature ID prefix for custom Damage Reduction entries added by the GM at runtime. */
export const DR_CUSTOM_FEATURE_PREFIX = 'dr_custom_' as const;

/** Tag used on ItemFeature.tags to identify melee weapons. */
export const WEAPON_CATEGORY_TAG = 'weapon' as const;
/** Tag used on ItemFeature.tags to identify ranged weapons. */
export const RANGED_CATEGORY_TAG = 'ranged' as const;
/** wieldCategory value for two-handed weapons. */
export const TWO_HANDED_WIELD_CATEGORY = 'two_handed' as const;

/** UI string key for the synthetic weapon-roll pipeline label. */
export const WEAPON_ROLL_LABEL_KEY = 'combat.weapon_roll' as const;
/** UI string key for the synthetic spell-roll pipeline label. */
export const SPELL_ROLL_LABEL_KEY = 'magic.spell_roll' as const;

/**
 * Sentinel value for `combatStats.max_dexterity_bonus` when no DEX cap is in effect.
 * An unarmoured character has baseValue 99 (= no restriction).
 */
export const MAX_DEX_CAP_UNCAPPED_VALUE = 99 as const;

/** Default list of DR bypass material/alignment tags (fallback when config table absent). */
export const DR_BYPASS_TAGS_FALLBACK: readonly string[] = [
  '—', 'magic', 'adamantine', 'cold_iron', 'silver', 'mithral',
  'slashing', 'bludgeoning', 'piercing', 'good', 'evil', 'lawful', 'chaotic', 'epic',
] as const;

/** Tag used on ItemFeature.tags to identify potion-type consumables. */
export const POTION_ITEM_TAG = 'potion' as const;
/** Tag used on ItemFeature.tags to identify oil-type consumables. */
export const OIL_ITEM_TAG = 'oil' as const;
/** Tag used to indicate items stored away from the character (not carried). */
export const STASHED_ITEM_TAG = 'stashed' as const;
/** Sentinel value for `ItemFeature.equipmentSlot` when the item occupies no slot. */
export const EQUIPMENT_SLOT_NONE = 'none' as const;

/** Canonical identifier for arcane magic features (wizard, sorcerer, bard spells). */
export const MAGIC_TYPE_ARCANE  = 'arcane'  as const;
/** Canonical identifier for divine magic features (cleric, druid, paladin spells). */
export const MAGIC_TYPE_DIVINE  = 'divine'  as const;
/** Canonical identifier for psionic power features (psion, wilder, psychic warrior). */
export const MAGIC_TYPE_PSIONIC = 'psionic' as const;

/**
 * ID prefix → feature category mapping.
 * Used by `FeatureModal.svelte` as a display fallback for granted feature IDs
 * not present in the DataLoader cache.
 */
export const FEATURE_ID_CATEGORY_PREFIXES: ReadonlyArray<{ prefix: string; category: string }> = [
  { prefix: 'language_',       category: 'language'      },
  { prefix: 'sense_',          category: 'sense'         },
  { prefix: 'proficiency_',    category: 'proficiency'   },
  { prefix: 'immunity_',       category: 'immunity'      },
  { prefix: 'class_feature_',  category: 'class_feature' },
  { prefix: 'racial_feature_', category: 'racial'        },
  { prefix: 'feat_',           category: 'feat'          },
  { prefix: 'spell_',          category: 'spell'         },
  { prefix: 'item_',           category: 'item'          },
  { prefix: 'condition_',      category: 'condition'     },
];
