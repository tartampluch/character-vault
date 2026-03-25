/**
 * @file formatters.ts
 * @description Localization helpers and unit conversion utilities.
 *
 * Design philosophy:
 *   ALL game data is stored in the engine using the SRD reference units:
 *     - Distances: feet (ft)
 *     - Weights:   pounds (lb)
 *   These values are NEVER converted until the display layer.
 *
 *   This file is the ONLY place where unit conversion happens. Any component or
 *   utility that needs to display a distance or weight to the user must call
 *   these functions. The result changes automatically when the active language
 *   changes, because all formatting reads from the `I18N_CONFIG` constant.
 *
 *   PURE FUNCTIONS:
 *   All functions in this file are pure (no side effects, no state).
 *   They receive the `CampaignSettings` (or just the language) as a parameter
 *   so that they can be called in:
 *     - The GameEngine's helper methods (Phase 3.1)
 *     - The Math Parser's pipe handlers (Phase 2.2)
 *     - Svelte component templates (Phase 8+)
 *     - Unit tests (Phase 17.1)
 *
 * @see src/lib/types/i18n.ts       for LocalizedString, SupportedLanguage, I18N_CONFIG
 * @see src/lib/types/settings.ts   for CampaignSettings
 * @see src/lib/utils/mathParser.ts (Phase 2.2) for |distance and |weight pipe handling
 */

import { I18N_CONFIG } from '../types/i18n';
import type { LocalizedString, SupportedLanguage } from '../types/i18n';
import type { CampaignSettings } from '../types/settings';

// =============================================================================
// LOCALIZED STRING RESOLUTION
// =============================================================================

/**
 * Resolves a `LocalizedString` to a plain string for the given language.
 *
 * FALLBACK STRATEGY:
 *   1. Try the requested language  (`textObj[lang]`)
 *   2. Fall back to English        (`textObj["en"]`)
 *   3. Fall back to the first key  (`Object.values(textObj)[0]`)
 *   4. Return a sentinel string    ("??") to visually flag missing translations
 *
 * This strategy ensures:
 *   - Community content in a single language still works in other language UIs.
 *   - Missing translations are visually obvious in the UI (not silent empty strings).
 *   - The engine never crashes on a missing translation key.
 *
 * @param textObj  - A `LocalizedString` record or a plain string (returned as-is).
 * @param lang     - The target display language from `CampaignSettings.language`.
 * @returns The localised string for the requested language, with fallbacks.
 *
 * @example
 * const label: LocalizedString = { en: "Strength", fr: "Force" };
 * t(label, "fr") // → "Force"
 * t(label, "de") // → "Strength" (falls back to English)
 * t("raw string", "fr") // → "raw string" (pass-through for plain strings)
 */
export function t(textObj: LocalizedString | string, lang: SupportedLanguage): string {
  // --- Pass-through for plain strings (already translated or non-translated labels) ---
  if (typeof textObj === 'string') return textObj;

  // --- Try the requested language ---
  if (textObj[lang]) return textObj[lang];

  // --- Fall back to English ---
  if (textObj['en']) return textObj['en'];

  // --- Fall back to any available language ---
  const firstValue = Object.values(textObj)[0];
  if (firstValue) return firstValue;

  // --- Sentinel for completely missing translations (visually obvious in UI) ---
  return '??';
}

// =============================================================================
// DISTANCE FORMATTING
// =============================================================================

/**
 * Converts a distance value in FEET to the display unit for the active language.
 *
 * Conversion:
 *   - English: 1:1 (feet stay as feet) → "30 ft."
 *   - French:  feet × 0.3 → metres     → "9 m"
 *
 * WHY NOT STORE IN METRES?
 *   D&D 3.5 rule text, spell ranges, and movement speeds are always specified in
 *   feet in the SRD. All modifiers targeting speed pipelines use feet. Converting
 *   storage to metric would require different numbers in all JSON files for different
 *   locales — a maintenance nightmare. Storing in feet and converting at display time
 *   is the standard Single-Source-of-Truth approach.
 *
 * ROUNDING:
 *   Values are rounded to 1 decimal place to avoid floating point noise.
 *   Feet × 0.3 = metres:
 *     30 ft → 9.0 m  (displayed as "9 m")
 *     25 ft → 7.5 m  (displayed as "7.5 m")
 *     40 ft → 12.0 m (displayed as "12 m")
 *   Trailing zeros after the decimal are stripped by JS's default number-to-string.
 *
 * @param feet     - Distance in feet (the engine's reference unit).
 * @param lang     - The target display language.
 * @returns Formatted distance string with unit suffix.
 *
 * @example
 * formatDistance(30, "en") // → "30 ft."
 * formatDistance(30, "fr") // → "9 m"
 * formatDistance(25, "fr") // → "7.5 m"
 * formatDistance(0, "en")  // → "0 ft."
 */
export function formatDistance(feet: number, lang: SupportedLanguage): string {
  const config = I18N_CONFIG[lang];
  const converted = feet * config.distanceMultiplier;
  // Round to 1 decimal to avoid floating point artifacts (e.g., 9.000000001)
  const rounded = Math.round(converted * 10) / 10;
  return `${rounded} ${config.distanceUnit}`;
}

/**
 * Convenience overload: resolves the language from a `CampaignSettings` object.
 *
 * This signature is provided for callers that have access to the full settings
 * object (e.g., Svelte components, GameEngine methods) rather than just the language string.
 *
 * @param feet     - Distance in feet.
 * @param settings - The active campaign settings (language is read from here).
 * @returns Formatted distance string.
 */
export function formatDistanceWithSettings(feet: number, settings: CampaignSettings): string {
  return formatDistance(feet, settings.language);
}

// =============================================================================
// WEIGHT FORMATTING
// =============================================================================

/**
 * Converts a weight value in POUNDS to the display unit for the active language.
 *
 * Conversion:
 *   - English: 1:1 (pounds stay as pounds) → "10 lb."
 *   - French:  pounds × 0.5 → kilograms    → "5 kg"
 *
 * WHY 0.5 FOR KG (not 0.4536)?
 *   D&D 3.5 French editions use 0.5 kg/lb as a rounded convention for encumbrance
 *   calculations (it simplifies head-math at the gaming table). The exact scientific
 *   conversion (0.4536) would produce ugly numbers like "4.536 kg" for a 10 lb item.
 *   The convention is explicit in the I18N_CONFIG constant.
 *
 * ROUNDING:
 *   Rounded to 1 decimal place for clean display output.
 *
 * @param lbs      - Weight in pounds (the engine's reference unit).
 * @param lang     - The target display language.
 * @returns Formatted weight string with unit suffix.
 *
 * @example
 * formatWeight(10, "en") // → "10 lb."
 * formatWeight(10, "fr") // → "5 kg"
 * formatWeight(1, "fr")  // → "0.5 kg"
 */
export function formatWeight(lbs: number, lang: SupportedLanguage): string {
  const config = I18N_CONFIG[lang];
  const converted = lbs * config.weightMultiplier;
  const rounded = Math.round(converted * 10) / 10;
  return `${rounded} ${config.weightUnit}`;
}

/**
 * Convenience overload: resolves the language from a `CampaignSettings` object.
 *
 * @param lbs      - Weight in pounds.
 * @param settings - The active campaign settings (language is read from here).
 * @returns Formatted weight string.
 */
export function formatWeightWithSettings(lbs: number, settings: CampaignSettings): string {
  return formatWeight(lbs, settings.language);
}

// =============================================================================
// MODIFIER SIGN FORMATTING
// =============================================================================

/**
 * Formats a numeric modifier value with an explicit sign prefix.
 *
 * D&D 3.5 convention: modifiers are always displayed with signs:
 *   - Positive: "+2"
 *   - Negative: "-2"
 *   - Zero:     "+0" (explicit zero on stats, "0" might be used for totals)
 *
 * This is used throughout the UI for:
 *   - Ability score modifiers: "+4 STR"
 *   - Spell save DCs: "+3 to DC"
 *   - Modifier breakdown lists: "+2 enhancement (Belt of Strength)"
 *
 * @param value    - The numeric modifier value (positive, negative, or zero).
 * @returns A string with an explicit +/- sign.
 *
 * @example
 * formatModifier(4)  // → "+4"
 * formatModifier(-2) // → "-2"
 * formatModifier(0)  // → "+0"
 */
export function formatModifier(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

// =============================================================================
// CURRENCY FORMATTING
// =============================================================================

/**
 * Formats a currency amount with the standard D&D 3.5 denomination abbreviation.
 *
 * D&D 3.5 currency denominations (in order of value):
 *   - CP: Copper Pieces   (1/100 gp)
 *   - SP: Silver Pieces   (1/10 gp)
 *   - GP: Gold Pieces     (1 gp, the reference unit — all prices stored in GP)
 *   - PP: Platinum Pieces (10 gp)
 *
 * Localization note: Currency abbreviations are abbreviated in Latin (CP, SP, GP, PP)
 * and are NOT localized — they are universally recognizable in RPG contexts across
 * all supported languages.
 *
 * @param amount       - The numeric amount.
 * @param denomination - The currency type abbreviation.
 * @returns Formatted currency string.
 *
 * @example
 * formatCurrency(150, "GP") // → "150 GP"
 * formatCurrency(5, "PP")   // → "5 PP"
 */
export function formatCurrency(amount: number, denomination: 'CP' | 'SP' | 'GP' | 'PP'): string {
  return `${amount} ${denomination}`;
}

// =============================================================================
// DICE EXPRESSION FORMATTING
// =============================================================================

/**
 * Formats a dice expression for display in roll result UIs.
 *
 * Pure formatting utility — does not perform any calculation.
 * Used by the DiceRollModal (Phase 9.2) to display what was rolled.
 *
 * @param rolls    - Array of individual die results.
 * @param faces    - Number of faces on each die (e.g., 6, 8, 20).
 * @returns A human-readable dice roll string.
 *
 * @example
 * formatDiceRolls([4, 2, 6, 1], 6) // → "4d6: [4, 2, 6, 1]"
 * formatDiceRolls([17], 20)         // → "1d20: [17]"
 */
export function formatDiceRolls(rolls: number[], faces: number): string {
  return `${rolls.length}d${faces}: [${rolls.join(', ')}]`;
}

// =============================================================================
// SITUATIONAL CONTEXT LABELS
// =============================================================================

/**
 * Human-readable labels for `Modifier.situationalContext` values.
 * Used by FeatureModal and ModifierBreakdownModal to display situational
 * modifiers with readable text instead of raw snake_case keys.
 */
export const SITUATIONAL_LABELS: Readonly<Record<string, string>> = {
  vs_enchantment:                      'vs. Enchantment',
  vs_poison:                           'vs. Poison',
  vs_spells_and_spell_like:            'vs. Spells & Spell-likes',
  vs_spells_and_spell_like_effects:    'vs. Spells & Spell-likes',
  vs_giant:                            'vs. Giants',
  vs_giant_type:                       'vs. Giant type',
  vs_orc_goblinoid:                    'vs. Orcs & Goblinoids',
  vs_orcs_and_goblinoids:              'vs. Orcs & Goblinoids',
  vs_kobold_goblinoid:                 'vs. Kobolds & Goblinoids',
  vs_evil:                             'vs. Evil',
  vs_good:                             'vs. Good',
  vs_chaotic:                          'vs. Chaos',
  vs_lawful:                           'vs. Law',
  vs_charm_or_fear:                    'vs. Charm or Fear',
  vs_fear:                             'vs. Fear',
  vs_illusion:                         'vs. Illusion',
  vs_mind_affecting_and_compulsion:    'vs. Mind-affecting & Compulsions',
  vs_mind_affecting_compulsion:        'vs. Mind-affecting & Compulsions',
  vs_compulsions_and_mind_affecting:   'vs. Compulsions & Mind-affecting',
  vs_divination:                       'vs. Divination',
  vs_trap:                             'vs. Traps',
  vs_traps:                            'vs. Traps',
  vs_bull_rush_or_trip:                'vs. Bull Rush / Trip',
  vs_bull_rush_or_trip_on_ground:      'vs. Bull Rush / Trip (while standing)',
  vs_charge_attacks:                   'vs. Charge attacks',
  vs_ranged_attacks:                   'vs. Ranged attacks',
  vs_fire_spells_and_effects:          'vs. Fire spells & effects',
  vs_fire_creature:                    'vs. Fire creatures',
  vs_fire_effects:                     'vs. Fire effects',
  vs_fire_elementals:                  'vs. Fire elementals',
  vs_cold_creature:                    'vs. Cold creatures',
  vs_air_or_electricity_effects:       'vs. Air / Electricity',
  vs_earth_effects:                    'vs. Earth effects',
  vs_water_or_cold_effects:            'vs. Water / Cold effects',
  vs_elemental:                        'vs. Elementals',
  vs_outsider:                         'vs. Outsiders',
  vs_construct:                        'vs. Constructs',
  vs_shapechanger:                     'vs. Shapechangers',
  vs_fey_spell_like:                   'vs. Fey spell-likes',
  vs_designated_foe:                   'vs. Designated foe',
  vs_designated_target:                'vs. Designated target',
  vs_favored_enemy_1:                  'vs. Favored Enemy 1',
  vs_favored_enemy_2:                  'vs. Favored Enemy 2',
  vs_favored_enemy_3:                  'vs. Favored Enemy 3',
  vs_favored_enemy_4:                  'vs. Favored Enemy 4',
  vs_favored_enemy_5:                  'vs. Favored Enemy 5',
  vs_sworn_enemy:                      'vs. Sworn Enemy',
  vs_unusual_stonework:                'vs. Unusual stonework',
  vs_attacks_of_opportunity_on_movement: 'vs. AoOs on movement',
  vs_attacks_of_opportunity_while_moving: 'vs. AoOs while moving',
  vs_power_resistance:                 'vs. Power Resistance',
  vs_powers_spells_and_spell_like_effects: 'vs. Powers & Spells',
  vs_spider_poison:                    'vs. Spider poison',
  appraise_stone_metal_items:          'Appraising stone/metal items',
  craft_stone_metal_items:             'Crafting stone/metal items',
  unusual_stonework:                   'Near unusual stonework',
  tracking:                            'While tracking',
  sneak_attack:                        'On sneak attack',
  on_hit:                              'On hit',
  on_hit_fire:                         'On hit (fire)',
  on_hit_cold:                         'On hit (cold)',
  on_hit_electricity:                  'On hit (electricity)',
  on_hit_nonlethal:                    'On hit (nonlethal)',
  casting_defensively_or_grappled:     'While casting defensively / grappled',
  fighting_defensively_or_total_defense: 'While fighting defensively',
  wielding_two_weapons:                'While two-weapon fighting',
  single_piercing_weapon_no_offhand:   'Single piercing weapon, no off-hand',
  using_bow:                           'While using a bow',
  thrown_weapons_and_slings:           'With thrown weapons & slings',
  ranged_within_30ft:                  'Ranged within 30 ft.',
  unarmed_or_natural:                  'Unarmed / natural attacks',
  shield_bash:                         'On shield bash',
  near_wall:                           'When adjacent to a wall',
  underwater:                          'While underwater',
  in_saltwater:                        'In saltwater',
  in_bright_or_absolute_darkness:      'In bright light or darkness',
  outdoors_temperate:                  'In temperate outdoors',
  becoming_psionically_focused:        'When becoming psionically focused',
  manifesting_on_defensive_or_grappling: 'When manifesting defensively',
  puncture_touch_attack:               'On puncture touch attack',
  target_flat_footed_or_flanked:       'vs. Flat-footed / flanked target',
  vs_opponent_already_damaged_this_turn: 'vs. Already-damaged opponent',
  when_casting_chaos_spells:           'When casting Chaos spells',
  when_casting_divination_spells:      'When casting Divination spells',
  when_casting_evil_spells:            'When casting Evil spells',
  when_casting_good_spells:            'When casting Good spells',
  when_casting_healing_spells:         'When casting Healing spells',
  when_casting_law_spells:             'When casting Law spells',
  wielded_by_paladin:                  'When wielded by a paladin',
  air_elemental:                       'While air elemental',
  earth_elemental:                     'While earth elemental',
  fire_elemental:                      'While fire elemental',
  water_elemental:                     'While water elemental',
  vs_aquatic_creature:                 'vs. Aquatic creatures',
  vs_forest_creature:                  'vs. Forest creatures',
  vs_desert_creature:                  'vs. Desert creatures',
  vs_hills_creature:                   'vs. Hills creatures',
  vs_marsh_creature:                   'vs. Marsh creatures',
  vs_mountain_creature:                'vs. Mountain creatures',
  vs_plains_creature:                  'vs. Plains creatures',
  vs_underground_creature:             'vs. Underground creatures',
  vs_air_planar_creature:              'vs. Air planar creatures',
  vs_cavernous_plane_creature:         'vs. Cavernous planar creatures',
  vs_shifting_plane_creature:          'vs. Shifting planar creatures',
  vs_aligned_plane_creature:           'vs. Aligned planar creatures',
  vs_air_elementals:                   'vs. Air elementals',
  vs_earth_elementals:                 'vs. Earth elementals',
  vs_water_elementals:                 'vs. Water elementals',
};

/**
 * Converts a machine-readable `situationalContext` string to a short,
 * readable English label. Falls back to prettifying the raw key.
 */
export function formatSituationalContext(ctx: string): string {
  return SITUATIONAL_LABELS[ctx]
    ?? ctx.replace(/_/g, ' ').replace(/\bvs\b/, 'vs.').replace(/\b\w/g, c => c.toUpperCase());
}
