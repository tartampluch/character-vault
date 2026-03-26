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
 *   changes, because all formatting reads from the `UNIT_SYSTEM_CONFIG` constant.
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
 * @see src/lib/types/i18n.ts       for LocalizedString, UnitSystem, UNIT_SYSTEM_CONFIG
 * @see src/lib/types/settings.ts   for CampaignSettings
 * @see src/lib/utils/mathParser.ts (Phase 2.2) for |distance and |weight pipe handling
 */

import { UNIT_SYSTEM_CONFIG } from '../types/i18n';
import type { LocalizedString, UnitSystem } from '../types/i18n';
import { LANG_UNIT_SYSTEM } from '../i18n/ui-strings';
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
export function t(textObj: LocalizedString | string, lang: string): string {
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
// UNIT SYSTEM RESOLUTION
// =============================================================================

/**
 * Resolves the `UnitSystem` for a given language code.
 *
 * LOOKUP ORDER:
 *   1. `LANG_UNIT_SYSTEM` (from `ui-strings.ts`) — covers all built-in UI languages.
 *   2. Default: `"imperial"` — safest fallback for community languages not in the map.
 *      (All SRD values are stored in feet/pounds, so imperial is always correct.)
 *
 * This is the ONLY place that bridges language code → unit system.
 * Adding a new built-in language only requires adding its entry to
 * `SUPPORTED_UI_LANGUAGES` in `ui-strings.ts`; this function needs no changes.
 *
 * @param lang - Any language code string (e.g. `"en"`, `"fr"`, `"es"`).
 * @returns `"imperial"` or `"metric"`.
 *
 * @example
 * getUnitSystem("en")  // → "imperial"
 * getUnitSystem("fr")  // → "metric"
 * getUnitSystem("es")  // → "imperial" (community lang, defaults to imperial)
 * getUnitSystem("de")  // → "imperial" (not yet in map, defaults to imperial)
 */
export function getUnitSystem(lang: string): UnitSystem {
  return LANG_UNIT_SYSTEM.get(lang) ?? 'imperial';
}

// =============================================================================
// DISTANCE FORMATTING
// =============================================================================

/**
 * Converts a distance value in FEET to the display unit for the active language.
 *
 * Delegates unit-system resolution to `getUnitSystem(lang)`, then applies the
 * appropriate multiplier and suffix from `UNIT_SYSTEM_CONFIG`.
 *
 * Conversion:
 *   - imperial languages (en, …): 1:1 (feet stay as feet) → "30 ft."
 *   - metric languages   (fr, …): feet × 0.3 → metres     → "9 m"
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
 * @param feet - Distance in feet (the engine's reference unit).
 * @param lang - The target display language (any string; unknown → imperial).
 * @returns Formatted distance string with unit suffix.
 *
 * @example
 * formatDistance(30, "en") // → "30 ft."
 * formatDistance(30, "fr") // → "9 m"
 * formatDistance(25, "fr") // → "7.5 m"
 * formatDistance(0, "en")  // → "0 ft."
 * formatDistance(30, "es") // → "30 ft." (community lang → imperial fallback)
 */
export function formatDistance(feet: number, lang: string): string {
  const config = UNIT_SYSTEM_CONFIG[getUnitSystem(lang)];
  const converted = feet * config.distanceMultiplier;
  // Round to 1 decimal to avoid floating point artifacts (e.g., 9.000000001)
  const rounded = Math.round(converted * 10) / 10;
  return `${rounded} ${config.distanceUnit}`;
}

/**
 * Convenience overload: resolves the language from a `CampaignSettings` object.
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
 * Delegates unit-system resolution to `getUnitSystem(lang)`, then applies the
 * appropriate multiplier and suffix from `UNIT_SYSTEM_CONFIG`.
 *
 * Conversion:
 *   - imperial languages (en, …): 1:1 (pounds stay as pounds) → "10 lb."
 *   - metric languages   (fr, …): pounds × 0.5 → kilograms    → "5 kg"
 *
 * WHY 0.5 FOR KG (not 0.4536)?
 *   D&D 3.5 French editions use 0.5 kg/lb as a rounded convention for encumbrance
 *   calculations (it simplifies head-math at the gaming table). The exact scientific
 *   conversion (0.4536) would produce ugly numbers like "4.536 kg" for a 10 lb item.
 *
 * ROUNDING:
 *   Rounded to 1 decimal place for clean display output.
 *
 * @param lbs  - Weight in pounds (the engine's reference unit).
 * @param lang - The target display language (any string; unknown → imperial).
 * @returns Formatted weight string with unit suffix.
 *
 * @example
 * formatWeight(10, "en") // → "10 lb."
 * formatWeight(10, "fr") // → "5 kg"
 * formatWeight(1, "fr")  // → "0.5 kg"
 * formatWeight(10, "es") // → "10 lb." (community lang → imperial fallback)
 */
export function formatWeight(lbs: number, lang: string): string {
  const config = UNIT_SYSTEM_CONFIG[getUnitSystem(lang)];
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
// ABILITY SCORE MODIFIER COMPUTATION
// =============================================================================

/**
 * Computes the D&D 3.5 ability score modifier from a raw ability score.
 *
 * D&D 3.5 FORMULA: modifier = floor((score − 10) / 2)
 *
 * This is the canonical formula used throughout the SRD:
 *   STR 18 → modifier +4
 *   STR 10 → modifier +0
 *   STR  8 → modifier -1
 *   STR  3 → modifier -4
 *
 * WHY IN FORMATTERS (not GameEngine)?
 *   This is a pure stateless function with no reactive dependencies — it needs
 *   neither character state nor campaign settings. Placing it here keeps the engine
 *   focused on reactive DAG derivations while giving any layer (engine, math parser,
 *   or UI wizard) access to the formula without duplicating it.
 *
 * UI USE CASES:
 *   - PointBuyModal: preview modifier before committing scores to the engine.
 *   - RollStatsModal: preview rolled modifiers before assigning them.
 *   - ItemDataEditor: compute ego score components from INT/WIS/CHA spinners.
 *
 * @param score - The raw ability score (typically 3–20 for D&D characters).
 * @returns The ability modifier (can be negative for scores below 10).
 *
 * @example
 * computeAbilityModifier(18) // → 4
 * computeAbilityModifier(10) // → 0
 * computeAbilityModifier(8)  // → -1
 * computeAbilityModifier(3)  // → -4
 */
export function computeAbilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
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
 * Localized human-readable labels for `Modifier.situationalContext` values.
 * Used by ModifierBreakdownModal to display situational modifiers with readable
 * text instead of raw snake_case context keys.
 *
 * TYPE: `Record<string, LocalizedString>` — every entry provides both EN and FR.
 * FALLBACK: `formatSituationalContext()` pretty-prints the raw key if a context
 * key is not in this map (e.g., a homebrew situational context string).
 *
 * AUTHORING NOTE:
 *   When adding new `situationalContext` values to JSON rule files, add the
 *   corresponding entry here (with both `en` and `fr`) to ensure it displays
 *   correctly in all supported languages.
 */
export const SITUATIONAL_LABELS: Readonly<Record<string, LocalizedString>> = {
  // --- Spell / magic save contexts ---
  vs_enchantment:                        { en: 'vs. Enchantment',                  fr: 'contre l\'Enchantement' },
  vs_poison:                             { en: 'vs. Poison',                       fr: 'contre le Poison' },
  vs_spells_and_spell_like:              { en: 'vs. Spells & Spell-likes',         fr: 'contre sorts et pouvoirs magiques' },
  vs_spells_and_spell_like_effects:      { en: 'vs. Spells & Spell-likes',         fr: 'contre sorts et pouvoirs magiques' },
  vs_fear:                               { en: 'vs. Fear',                         fr: 'contre la Peur' },
  vs_charm_or_fear:                      { en: 'vs. Charm or Fear',                fr: 'contre le Charme ou la Peur' },
  vs_illusion:                           { en: 'vs. Illusion',                     fr: 'contre l\'Illusion' },
  vs_mind_affecting_and_compulsion:      { en: 'vs. Mind-affecting & Compulsions', fr: 'contre sorts mentaux et Coercitions' },
  vs_mind_affecting_compulsion:          { en: 'vs. Mind-affecting & Compulsions', fr: 'contre sorts mentaux et Coercitions' },
  vs_compulsions_and_mind_affecting:     { en: 'vs. Compulsions & Mind-affecting', fr: 'contre Coercitions et sorts mentaux' },
  vs_divination:                         { en: 'vs. Divination',                   fr: 'contre la Divination' },
  vs_power_resistance:                   { en: 'vs. Power Resistance',             fr: 'contre la Résistance aux pouvoirs' },
  vs_powers_spells_and_spell_like_effects: { en: 'vs. Powers & Spells',            fr: 'contre pouvoirs et sorts' },

  // --- Alignment-based ---
  vs_evil:                               { en: 'vs. Evil',                         fr: 'contre le Mal' },
  vs_good:                               { en: 'vs. Good',                         fr: 'contre le Bien' },
  vs_chaotic:                            { en: 'vs. Chaos',                        fr: 'contre le Chaos' },
  vs_lawful:                             { en: 'vs. Law',                          fr: 'contre la Loi' },

  // --- Creature type / race ---
  vs_giant:                              { en: 'vs. Giants',                       fr: 'contre les Géants' },
  vs_giant_type:                         { en: 'vs. Giant type',                   fr: 'contre les créatures de type Géant' },
  vs_orc_goblinoid:                      { en: 'vs. Orcs & Goblinoids',            fr: 'contre Orques et Gobelinoïdes' },
  vs_orcs_and_goblinoids:               { en: 'vs. Orcs & Goblinoids',            fr: 'contre Orques et Gobelinoïdes' },
  vs_kobold_goblinoid:                   { en: 'vs. Kobolds & Goblinoids',         fr: 'contre Kobolds et Gobelinoïdes' },
  vs_outsider:                           { en: 'vs. Outsiders',                    fr: 'contre les Extérieurs' },
  vs_construct:                          { en: 'vs. Constructs',                   fr: 'contre les Artificiels' },
  vs_shapechanger:                       { en: 'vs. Shapechangers',                fr: 'contre les Métamorphes' },
  vs_fey_spell_like:                     { en: 'vs. Fey spell-likes',              fr: 'contre pouvoirs des Fées' },
  vs_elemental:                          { en: 'vs. Elementals',                   fr: 'contre les Élémentaires' },
  vs_aquatic_creature:                   { en: 'vs. Aquatic creatures',            fr: 'contre créatures aquatiques' },
  vs_forest_creature:                    { en: 'vs. Forest creatures',             fr: 'contre créatures forestières' },
  vs_desert_creature:                    { en: 'vs. Desert creatures',             fr: 'contre créatures du désert' },
  vs_hills_creature:                     { en: 'vs. Hills creatures',              fr: 'contre créatures des collines' },
  vs_marsh_creature:                     { en: 'vs. Marsh creatures',              fr: 'contre créatures des marais' },
  vs_mountain_creature:                  { en: 'vs. Mountain creatures',           fr: 'contre créatures de montagne' },
  vs_plains_creature:                    { en: 'vs. Plains creatures',             fr: 'contre créatures des plaines' },
  vs_underground_creature:               { en: 'vs. Underground creatures',        fr: 'contre créatures souterraines' },
  vs_air_planar_creature:                { en: 'vs. Air planar creatures',         fr: 'contre créatures du Plan Air' },
  vs_cavernous_plane_creature:           { en: 'vs. Cavernous planar creatures',   fr: 'contre créatures du Plan Caverneux' },
  vs_shifting_plane_creature:            { en: 'vs. Shifting planar creatures',    fr: 'contre créatures du Plan Mouvant' },
  vs_aligned_plane_creature:             { en: 'vs. Aligned planar creatures',     fr: 'contre créatures de Plans alignés' },

  // --- Elemental subtypes ---
  vs_fire_creature:                      { en: 'vs. Fire creatures',               fr: 'contre créatures du Feu' },
  vs_fire_effects:                       { en: 'vs. Fire effects',                 fr: 'contre effets de Feu' },
  vs_fire_spells_and_effects:            { en: 'vs. Fire spells & effects',        fr: 'contre sorts et effets de Feu' },
  vs_fire_elementals:                    { en: 'vs. Fire elementals',              fr: 'contre Élémentaires du Feu' },
  vs_cold_creature:                      { en: 'vs. Cold creatures',               fr: 'contre créatures du Froid' },
  vs_air_or_electricity_effects:         { en: 'vs. Air / Electricity',            fr: 'contre effets Air / Électricité' },
  vs_earth_effects:                      { en: 'vs. Earth effects',                fr: 'contre effets de Terre' },
  vs_water_or_cold_effects:              { en: 'vs. Water / Cold effects',         fr: 'contre effets Eau / Froid' },
  vs_air_elementals:                     { en: 'vs. Air elementals',               fr: 'contre Élémentaires de l\'Air' },
  vs_earth_elementals:                   { en: 'vs. Earth elementals',             fr: 'contre Élémentaires de la Terre' },
  vs_water_elementals:                   { en: 'vs. Water elementals',             fr: 'contre Élémentaires de l\'Eau' },
  vs_spider_poison:                      { en: 'vs. Spider poison',                fr: 'contre le venin d\'araignée' },

  // --- Favored / designated enemy ---
  vs_designated_foe:                     { en: 'vs. Designated foe',              fr: 'contre l\'ennemi désigné' },
  vs_designated_target:                  { en: 'vs. Designated target',           fr: 'contre la cible désignée' },
  vs_favored_enemy_1:                    { en: 'vs. Favored Enemy 1',             fr: 'contre Ennemi juré 1' },
  vs_favored_enemy_2:                    { en: 'vs. Favored Enemy 2',             fr: 'contre Ennemi juré 2' },
  vs_favored_enemy_3:                    { en: 'vs. Favored Enemy 3',             fr: 'contre Ennemi juré 3' },
  vs_favored_enemy_4:                    { en: 'vs. Favored Enemy 4',             fr: 'contre Ennemi juré 4' },
  vs_favored_enemy_5:                    { en: 'vs. Favored Enemy 5',             fr: 'contre Ennemi juré 5' },
  vs_sworn_enemy:                        { en: 'vs. Sworn Enemy',                 fr: 'contre l\'Ennemi juré' },

  // --- Terrain / environment ---
  vs_unusual_stonework:                  { en: 'vs. Unusual stonework',           fr: 'contre maçonnerie inhabituelle' },
  unusual_stonework:                     { en: 'Near unusual stonework',          fr: 'près de maçonnerie inhabituelle' },
  underwater:                            { en: 'While underwater',                fr: 'sous l\'eau' },
  in_saltwater:                          { en: 'In saltwater',                    fr: 'en eau salée' },
  in_bright_or_absolute_darkness:        { en: 'In bright light or darkness',     fr: 'en pleine lumière ou obscurité totale' },
  outdoors_temperate:                    { en: 'In temperate outdoors',           fr: 'en extérieur tempéré' },
  near_wall:                             { en: 'When adjacent to a wall',         fr: 'adjacent à un mur' },

  // --- Trap / stonework expertise ---
  vs_trap:                               { en: 'vs. Traps',                       fr: 'contre les Pièges' },
  vs_traps:                              { en: 'vs. Traps',                       fr: 'contre les Pièges' },
  appraise_stone_metal_items:            { en: 'Appraising stone/metal items',    fr: 'Estimation d\'objets en pierre/métal' },
  craft_stone_metal_items:               { en: 'Crafting stone/metal items',      fr: 'Artisanat d\'objets en pierre/métal' },
  tracking:                              { en: 'While tracking',                  fr: 'lors du pistage' },

  // --- Combat maneuver contexts ---
  vs_bull_rush_or_trip:                  { en: 'vs. Bull Rush / Trip',            fr: 'contre Bousculade / Croc-en-jambe' },
  vs_bull_rush_or_trip_on_ground:        { en: 'vs. Bull Rush / Trip (standing)', fr: 'contre Bousculade / Croc-en-jambe (debout)' },
  vs_charge_attacks:                     { en: 'vs. Charge attacks',              fr: 'contre les charges' },
  vs_ranged_attacks:                     { en: 'vs. Ranged attacks',              fr: 'contre les attaques à distance' },
  vs_attacks_of_opportunity_on_movement: { en: 'vs. AoOs on movement',            fr: 'contre AO lors de déplacement' },
  vs_attacks_of_opportunity_while_moving:{ en: 'vs. AoOs while moving',           fr: 'contre AO en mouvement' },

  // --- Attack / damage conditions ---
  sneak_attack:                          { en: 'On sneak attack',                 fr: 'lors d\'une attaque sournoise' },
  on_hit:                                { en: 'On hit',                          fr: 'lors d\'un coup porté' },
  on_hit_fire:                           { en: 'On hit (fire)',                   fr: 'lors d\'un coup porté (feu)' },
  on_hit_cold:                           { en: 'On hit (cold)',                   fr: 'lors d\'un coup porté (froid)' },
  on_hit_electricity:                    { en: 'On hit (electricity)',            fr: 'lors d\'un coup porté (électricité)' },
  on_hit_nonlethal:                      { en: 'On hit (nonlethal)',              fr: 'lors d\'un coup non-létal' },
  target_flat_footed_or_flanked:         { en: 'vs. Flat-footed / flanked',       fr: 'contre cible prise au dépourvu / flanquée' },
  vs_opponent_already_damaged_this_turn: { en: 'vs. Already-damaged opponent',    fr: 'contre adversaire déjà blessé ce tour' },
  puncture_touch_attack:                 { en: 'On puncture touch attack',        fr: 'lors d\'une attaque de contact perforante' },
  shield_bash:                           { en: 'On shield bash',                  fr: 'lors d\'un coup de bouclier' },

  // --- Fighting style / stance contexts ---
  casting_defensively_or_grappled:       { en: 'Casting defensively / grappled',  fr: 'lancer en défensif ou agrippé' },
  fighting_defensively_or_total_defense: { en: 'While fighting defensively',      fr: 'en combat défensif / défense totale' },
  wielding_two_weapons:                  { en: 'While two-weapon fighting',        fr: 'avec deux armes' },
  single_piercing_weapon_no_offhand:     { en: 'Single piercing weapon, no off-hand', fr: 'arme perforante seule, sans main gauche' },
  using_bow:                             { en: 'While using a bow',               fr: 'en utilisant un arc' },
  thrown_weapons_and_slings:             { en: 'With thrown weapons & slings',    fr: 'avec armes de jet et frondes' },
  ranged_within_30ft:                    { en: 'Ranged within 30 ft.',            fr: 'à distance (<= 9 m)' },
  unarmed_or_natural:                    { en: 'Unarmed / natural attacks',       fr: 'attaques à mains nues / naturelles' },

  // --- Spell school / casting contexts ---
  when_casting_chaos_spells:             { en: 'When casting Chaos spells',       fr: 'en lançant des sorts du Chaos' },
  when_casting_divination_spells:        { en: 'When casting Divination spells',  fr: 'en lançant des sorts de Divination' },
  when_casting_evil_spells:              { en: 'When casting Evil spells',        fr: 'en lançant des sorts du Mal' },
  when_casting_good_spells:              { en: 'When casting Good spells',        fr: 'en lançant des sorts du Bien' },
  when_casting_healing_spells:           { en: 'When casting Healing spells',     fr: 'en lançant des sorts de Soin' },
  when_casting_law_spells:               { en: 'When casting Law spells',         fr: 'en lançant des sorts de la Loi' },

  // --- Psionic contexts ---
  becoming_psionically_focused:          { en: 'When becoming psionically focused', fr: 'en se concentrant psioniquement' },
  manifesting_on_defensive_or_grappling: { en: 'When manifesting defensively',   fr: 'en manifestant en défensif ou agrippé' },

  // --- Special item / class ability contexts ---
  wielded_by_paladin:                    { en: 'When wielded by a paladin',       fr: 'manié par un paladin' },

  // --- Elemental form (wild shape / polymorph) ---
  air_elemental:                         { en: 'While air elemental',             fr: 'sous forme d\'Élémentaire de l\'Air' },
  earth_elemental:                       { en: 'While earth elemental',           fr: 'sous forme d\'Élémentaire de la Terre' },
  fire_elemental:                        { en: 'While fire elemental',            fr: 'sous forme d\'Élémentaire du Feu' },
  water_elemental:                       { en: 'While water elemental',           fr: 'sous forme d\'Élémentaire de l\'Eau' },
};

/**
 * Converts a machine-readable `situationalContext` string to a localized
 * short label in the requested language.
 *
 * LOOKUP ORDER:
 *   1. `SITUATIONAL_LABELS[ctx]` — known context key, returns the localized string.
 *   2. Fallback — pretty-prints the raw snake_case key (e.g., "my_custom_ctx" →
 *      "My Custom Ctx") when the context is not in the known-labels map.
 *      This handles homebrew situational context strings gracefully.
 *
 * @param ctx  - The raw `Modifier.situationalContext` value.
 * @param lang - The active UI language (defaults to `'en'`). Passed from
 *               `engine.settings.language` at the call site.
 * @returns A human-readable label in the requested language.
 */
export function formatSituationalContext(ctx: string, lang: string = 'en'): string {
  const entry = SITUATIONAL_LABELS[ctx];
  if (entry) {
    return (entry as Record<string, string>)[lang] ?? entry['en'] ?? ctx;
  }
  // Fallback: prettify the raw key.
  // ORDER MATTERS: capitalize words first, then restore "Vs" → "vs." so the
  // common "vs_*" context key pattern always renders as lowercase "vs.".
  return ctx
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\bVs\b/g, 'vs.');
}

// =============================================================================
// COIN UTILITIES — D&D 3.5 currency helpers
// =============================================================================
//
// These functions are extracted from Encumbrance.svelte to comply with the
// zero-game-logic-in-Svelte rule (ARCHITECTURE.md §3). Mathematical calculations
// involving D&D-specific constants (coin weight, exchange rates) must not appear
// in .svelte files. Keeping them here as pure functions allows unit testing and
// ensures all D&D coin math is in one auditable location.

/**
 * Computes the total weight of a coin purse in pounds.
 *
 * D&D 3.5 RULE: Every denomination (cp, sp, ep, gp, pp) weighs the same —
 * 50 coins = 1 lb (Player's Handbook, Equipment chapter, Coins entry).
 * This convention simplifies logistics and is standard across 3.0/3.5/d20.
 *
 * @param cp - Copper piece count
 * @param sp - Silver piece count
 * @param gp - Gold piece count
 * @param pp - Platinum piece count
 * @returns Weight in pounds (integer, rounded down per SRD encumbrance rules)
 */
export function computeCoinWeight(cp: number, sp: number, gp: number, pp: number): number {
  return Math.floor((cp + sp + gp + pp) / 50);
}

/**
 * Converts a mixed coin purse to its total gold piece equivalent.
 *
 * D&D 3.5 EXCHANGE RATES (Player's Handbook, Equipment):
 *   100 cp = 1 gp
 *    10 sp = 1 gp
 *     1 gp = 1 gp
 *     1 pp = 10 gp
 *
 * @param cp - Copper piece count
 * @param sp - Silver piece count
 * @param gp - Gold piece count
 * @param pp - Platinum piece count
 * @returns Total value in gold pieces (fractional for cp/sp)
 */
export function computeWealthInGP(cp: number, sp: number, gp: number, pp: number): number {
  return cp / 100 + sp / 10 + gp + pp * 10;
}

// =============================================================================
// DISPLAY PREVIEW HELPERS (keep arithmetic out of .svelte templates)
// =============================================================================

/**
 * Returns the effective ability score value when a temporary modifier is applied.
 *
 * PURPOSE (ARCHITECTURE.md §3):
 *   Components must not perform arithmetic in templates. The "temporary modifier"
 *   field in the Abilities tab is a UI-only preview (not persisted to the engine),
 *   so it cannot live in the engine. This helper keeps the addition out of the
 *   Svelte template while remaining testable as a pure function.
 *
 * @param baseTotal  - The engine's computed totalValue for the pipeline.
 * @param tempMod    - A locally entered temporary adjustment (can be negative).
 * @returns Preview total (baseTotal + tempMod).
 */
export function previewWithTempMod(baseTotal: number, tempMod: number): number {
  return baseTotal + tempMod;
}

/**
 * Isolates the base save bonus from a saving throw pipeline.
 *
 * D&D 3.5 FORMULA:
 *   baseSave = total save modifier − key ability modifier
 *
 * This appears in the SavingThrows component to show the class-progression
 * contribution separately from the ability modifier.
 *
 * PURPOSE (ARCHITECTURE.md §3):
 *   Subtraction of two engine-derived values must not appear inline in Svelte
 *   templates. This pure function makes the intent explicit and keeps arithmetic
 *   in a testable utility file.
 *
 * @param totalBonus  - The pipeline's totalBonus (total save modifier from all sources).
 * @param abilityMod  - The key ability's derived modifier (CON/DEX/WIS for Fort/Ref/Will).
 * @returns The base save bonus contributed by class progression and racial bonuses.
 */
export function computeBaseSave(totalBonus: number, abilityMod: number): number {
  return totalBonus - abilityMod;
}

/**
 * Clamps a ratio to a display percentage (0–100), avoiding division by zero.
 *
 * PURPOSE (ARCHITECTURE.md §3):
 *   Progress-bar fill percentage calculations (Math.min + division + multiplication)
 *   must not appear inline in Svelte templates. This helper centralises the pattern
 *   used by SkillsMatrix, PointBuyModal, Encumbrance, and PsionicItemCard.
 *
 * @param value  - Current value (e.g., points spent, current PP).
 * @param max    - Maximum value. Returns 0 if max ≤ 0.
 * @returns Percentage in [0, 100] inclusive.
 */
export function toDisplayPct(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(100, Math.max(0, (value / max) * 100));
}

// =============================================================================
// CHARACTER LEVEL UTILITY (keep D&D formula out of .svelte templates)
// =============================================================================

/**
 * Computes total character level from a classLevels record.
 *
 * D&D 3.5 RULE:
 *   Character level = sum of all individual class levels.
 *   Level Adjustment is NOT included (that is eclForXp).
 *
 * PURPOSE (ARCHITECTURE.md §3):
 *   CharacterCard and the GM Dashboard need the level for ARBITRARY characters
 *   from the vault (not the currently-loaded engine character). The engine only
 *   exposes `phase0_characterLevel` for the active character, so this utility
 *   function makes the formula available to those components without embedding
 *   `Object.values(classLevels).reduce()` inline in a `.svelte` file.
 *
 * @param classLevels - Record mapping class feature ID → level count.
 * @returns Total character level (integer ≥ 0).
 */
export function getCharacterLevel(classLevels: Record<string, number>): number {
  return Object.values(classLevels).reduce((sum: number, lvl: number) => sum + lvl, 0);
}
