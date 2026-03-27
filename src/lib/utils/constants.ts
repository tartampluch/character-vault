/**
 * Shared constants for the D&D 3.5 engine.
 *
 * These are SRD structural invariants — the 6 core ability scores and their
 * standard 3-letter abbreviations, plus engine-internal localized labels.
 * They are used by multiple engine files and UI components
 * (AbilityScores, PointBuyModal, RollStatsModal, AbilityScoresSummary, GameEngine).
 *
 * WHY A SEPARATE CONSTANTS FILE?
 *   Centralising these values prevents magic strings from appearing in engine code.
 *   Any developer adding a new language adds translations here (and in the locale
 *   JSON) rather than searching the codebase for hardcoded strings.
 *
 * Note: The abbreviations are English-only by convention (STR, DEX, CON, INT,
 * WIS, CHA are universally recognised in D&D 3.5 regardless of locale).
 */

import type { ID } from '../types/primitives';
import { ui, UI_STRINGS } from '../i18n/ui-strings';

/**
 * The 6 main ability score pipeline IDs, in canonical D&D 3.5 order:
 * Strength → Constitution → Dexterity → Intelligence → Wisdom → Charisma.
 */
export const MAIN_ABILITY_IDS = [
  'stat_strength', 'stat_constitution', 'stat_dexterity',
  'stat_intelligence', 'stat_wisdom', 'stat_charisma',
] as const;

/**
 * English-only fallback abbreviations for ability scores.
 *
 * WHY ENGLISH-ONLY NOW:
 *   French (and all other language) abbreviations live in the locale JSON files
 *   (`static/locales/fr.json`) under the `ability_abbr.*` namespace. Adding a
 *   new language only requires adding those keys to the new locale file — no
 *   changes to this constant are needed. See `ui-strings.ts` for the full
 *   set of `ability_abbr.*` keys.
 *
 * USAGE: prefer `getAbilityAbbr(id, language)` which resolves via the locale
 * system automatically.
 */
export const ABILITY_ABBRS: Readonly<Record<ID, { en: string }>> = {
  stat_strength:     { en: 'STR' },
  stat_dexterity:    { en: 'DEX' },
  stat_constitution: { en: 'CON' },
  stat_intelligence: { en: 'INT' },
  stat_wisdom:       { en: 'WIS' },
  stat_charisma:     { en: 'CHA' },
};

/**
 * Returns the localized 3-letter abbreviation for an ability score ID.
 *
 * Resolution order:
 *   1. `ui('ability_abbr.<id>', language)` — locale JSON file for the active
 *      language (loaded via `loadUiLocale()`; falls back to English baseline
 *      from `UI_STRINGS` when the locale key is missing).
 *   2. `ABILITY_ABBRS[id].en` — English fallback for unknown IDs not in
 *      `UI_STRINGS` (e.g. homebrew ability scores: derives from the ID itself).
 *
 * Adding French abbreviations for a new homebrew ability: add a key to
 * `static/locales/fr.json`. No TypeScript changes needed.
 *
 * @param id       - The ability score ID (e.g. 'stat_strength').
 * @param language - The current UI language code (e.g. 'en', 'fr').
 */
export function getAbilityAbbr(id: ID, language: string): string {
  const uiKey = `ability_abbr.${id}`;
  // ui() returns the key itself when both the locale and English baseline are missing.
  // That gives us a verbose fallback for homebrew IDs — shorten it.
  const fromLocale = ui(uiKey, language);
  if (fromLocale !== uiKey) return fromLocale; // Locale or EN baseline resolved it.
  // Homebrew ability score not in UI_STRINGS: derive uppercase abbreviation from ID.
  return id.replace(/^stat_/, '').toUpperCase().slice(0, 3);
}

// =============================================================================
// ENGINE-INTERNAL LOCALIZED LABELS
// =============================================================================

/**
 * UI string key for the "Synergy" modifier source label.
 *
 * WHY A KEY (not an inline LocalizedString)?
 *   Previously this was `{ en: 'Synergy', fr: 'Synergie' }` — adding any new
 *   language required modifying this TypeScript constant. Now the translations
 *   live in `static/locales/fr.json` (and future locale files) under the key
 *   `'modifier.synergy'`.  Adding a new language only requires editing the JSON.
 *
 *   The engine calls `buildLocalizedString(SYNERGY_SOURCE_LABEL_KEY)` at runtime
 *   to obtain a full `LocalizedString` for the modifier's `sourceName` field.
 *   Because `buildLocalizedString()` is called inside a `$derived.by()` block,
 *   all locale files are guaranteed to be loaded by then.
 *
 * @example  sourceName built by the engine:
 *   `buildLocalizedString(SYNERGY_SOURCE_LABEL_KEY)`
 *   → `{ en: 'Synergy', fr: 'Synergie', de: 'Synergie', … }`
 */
export const SYNERGY_SOURCE_LABEL_KEY = 'modifier.synergy' as const;

/**
 * @deprecated Use `SYNERGY_SOURCE_LABEL_KEY` with `buildLocalizedString()`.
 *   This alias is kept only for the test that was written before the i18n
 *   refactor. It resolves the English baseline value at module load time.
 * @internal
 */
export const SYNERGY_SOURCE_LABEL = {
  get en() { return UI_STRINGS[SYNERGY_SOURCE_LABEL_KEY] as string; },
  get fr() { return 'Synergie'; }, // Kept for test backward-compat; fr.json is authoritative.
} as const;

// =============================================================================
// ALIGNMENT DEFINITIONS
// =============================================================================

/**
 * The 9 standard D&D 3.5 alignments, each with a stable internal ID and a
 * localized label.
 *
 * WHY IN CONSTANTS (not hardcoded in BasicInfo.svelte)?
 *   Alignment names are D&D game content. Centralizing them here enforces the
 *   zero-hardcoding rule (ARCHITECTURE.md §6): no D&D game terms may be embedded
 *   directly in `.svelte` component files. Components import and translate these
 *   via `engine.t()` at render time.
 *
 *   Ideally these would live in JSON rule files so GMs can override them.
 *   This constant serves as a typed, centralized fallback until a
 *   `config_alignments` rule table is added to the D20 SRD data pack.
 *
 * NOTE ON IDENTIFIERS:
 *   The IDs (e.g., `alignment_lawful_good`) are also used as feature IDs when
 *   the alignment is injected as a condition feature instance in the engine.
 *   They MUST remain stable across sessions.
 */
// =============================================================================
// SYSTEM FEATURE IDs — Auto-dispatched condition and pseudo-item identifiers
// =============================================================================

/**
 * Feature ID for the encumbered condition (defined in rule files).
 *
 * WHY A CONSTANT (not inlined in Encumbrance.svelte):
 *   Svelte components must not hardcode game content IDs (zero-hardcoding rule,
 *   ARCHITECTURE.md §6). Centralising here makes renames safe: update once here
 *   and all consumers follow automatically.
 */
export const CONDITION_ENCUMBERED_FEATURE_ID = 'condition_encumbered' as const;

/**
 * Instance ID for the auto-dispatched encumbered condition.
 *
 * Using a stable, predictable ID allows idempotent add/remove in
 * Encumbrance.svelte: we can safely call addFeature / removeFeature without
 * accidentally creating duplicate instances.
 */
export const CONDITION_ENCUMBERED_INSTANCE_ID = 'afi_condition_encumbered_auto' as const;

// =============================================================================
// PSIONIC ITEM CONSTANTS
// =============================================================================

/**
 * Standard maximum charge count for a Dorje (psionic wand equivalent).
 *
 * D&D 3.5 SRD (Expanded Psionics Handbook, p. 218):
 *   "A dorje is created with 50 charges."
 *
 * WHY A CONSTANT (not inlined in PsionicItemCard.svelte):
 *   Game constants must not appear in .svelte files (zero-hardcoding rule,
 *   ARCHITECTURE.md §6). Centralising here means a GM-extended rule set that
 *   changes the standard charge count only needs updating in one place.
 */
export const DORJE_MAX_CHARGES = 50 as const;

// =============================================================================
// CUSTOM DR PREFIX
// =============================================================================

/**
 * Feature ID prefix for custom Damage Reduction entries added by the GM at runtime.
 *
 * The DamageReduction component queries active features whose IDs start with this
 * prefix to find GM-added DR entries (as opposed to class/racial DR from rule files).
 */
export const DR_CUSTOM_FEATURE_PREFIX = 'dr_custom_' as const;

// =============================================================================
// CLASS LEVEL BOUNDS
// =============================================================================

/**
 * Maximum allowed class level per class in D&D 3.5 SRD.
 * Standard core classes cap at 20 levels (Epic rules extend beyond this,
 * but the standard game runs 1–20).
 *
 * WHY A CONSTANT (not inlined as `20` in BasicInfo.svelte):
 *   Game rule constants must not appear as magic numbers in .svelte component
 *   files (zero-hardcoding rule, ARCHITECTURE.md §6). Using this constant
 *   allows future GMs to override the cap (e.g., custom epic rules) without
 *   touching component code.
 */
export const MAX_CLASS_LEVEL = 20 as const;

// =============================================================================
// ABILITY SCORE BOUNDS
// =============================================================================

/**
 * Minimum allowed base value for an ability score input.
 * D&D 3.5 SRD: ability scores can theoretically reach 1 (minimum survivable).
 * Centralised here to comply with the zero-hardcoding rule (ARCHITECTURE.md §6).
 */
export const ABILITY_SCORE_MIN = 1 as const;

/**
 * Maximum allowed base value entered directly in the ability score input.
 * D&D 3.5 typical PC cap via tomes/wishes; can be higher for monsters.
 * This bound guards the freeform input only — the engine never clamps
 * totalValue, which can exceed this through modifiers.
 */
export const ABILITY_SCORE_MAX = 30 as const;

// =============================================================================
// WEAPON CLASSIFICATION CONSTANTS
// =============================================================================

/**
 * Tag used on ItemFeature.tags to identify melee weapons.
 * Centralised here to enforce zero-hardcoding rule (ARCHITECTURE.md §6):
 * no D&D item classification strings may appear as literals in .svelte files.
 */
export const WEAPON_CATEGORY_TAG = 'weapon' as const;

/**
 * Tag used on ItemFeature.tags to identify ranged weapons (bows, crossbows,
 * thrown weapons). Combined with a non-zero rangeIncrementFt check in the engine.
 */
export const RANGED_CATEGORY_TAG = 'ranged' as const;

/**
 * wieldCategory value for two-handed weapons (greatswords, greataxes, etc.).
 * Used to determine 1.5× STR bonus to damage.
 */
export const TWO_HANDED_WIELD_CATEGORY = 'two_handed' as const;

// =============================================================================
// COMBAT PIPELINE IDs — CANONICAL STRING CONSTANTS
// =============================================================================

/**
 * Canonical pipeline ID for the Base Attack Bonus pipeline.
 *
 * WHY A CONSTANT (not inlined as `'combatStats.base_attack_bonus'` in Attacks.svelte):
 *   Pipeline IDs are D&D game-system constants that must not appear as magic strings
 *   in `.svelte` component files (zero-hardcoding rule, ARCHITECTURE.md §6).
 *   Centralising here means a rename of the pipeline ID only requires updating
 *   this constant and the GameEngine default pipelines — all consumers follow
 *   automatically.
 *
 * Used by:
 *   - `Attacks.svelte` — to read situational modifiers from the BAB pipeline for
 *     synthetic weapon roll pipelines (situational context pass-through).
 *   - Any other component that needs to access the BAB pipeline by key.
 */
export const BAB_PIPELINE_ID = 'combatStats.base_attack_bonus' as const;

// =============================================================================
// SYNTHETIC PIPELINE LABELS — LOCALIZED
// =============================================================================

/**
 * UI string key for the synthetic weapon-roll pipeline label.
 *
 * `Attacks.svelte` calls `buildLocalizedString(WEAPON_ROLL_LABEL_KEY)` when
 * building the synthetic `StatisticPipeline` passed to `DiceRollModal`. The
 * actual translation lives in `ui-strings.ts` (English) and locale JSON files
 * (other languages) under `'combat.weapon_roll'`.
 *
 * ADDING A NEW LANGUAGE: add `"combat.weapon_roll": "..."` to the locale JSON.
 */
export const WEAPON_ROLL_LABEL_KEY = 'combat.weapon_roll' as const;

/**
 * UI string key for the synthetic spell-roll pipeline label.
 *
 * `CastingPanel.svelte` calls `buildLocalizedString(SPELL_ROLL_LABEL_KEY)` when
 * building the synthetic `StatisticPipeline` passed to `DiceRollModal`. The
 * actual translation lives in `ui-strings.ts` (English) and locale JSON files
 * under `'magic.spell_roll'`.
 *
 * ADDING A NEW LANGUAGE: add `"magic.spell_roll": "..."` to the locale JSON.
 */
export const SPELL_ROLL_LABEL_KEY = 'magic.spell_roll' as const;

// =============================================================================
// MAX DEXTERITY CAP — SENTINEL VALUE
// =============================================================================

/**
 * Sentinel value for the `combatStats.max_dexterity_bonus` pipeline when no
 * DEX cap is in effect (i.e., the character is unarmoured or wears armour
 * with no explicit DEX cap).
 *
 * The pipeline is initialised with `baseValue: 99` per the architecture
 * (ARCHITECTURE.md §4.17). A totalValue below this threshold indicates that
 * at least one `"max_dex_cap"` modifier is in effect.
 *
 * WHY A CONSTANT (not inlined as `99` in ArmorClass.svelte):
 *   Sentinel values are game-system constants (zero-hardcoding rule,
 *   ARCHITECTURE.md §6). Centralising here allows the value to change once
 *   without hunting through Svelte templates.
 */
export const MAX_DEX_CAP_UNCAPPED_VALUE = 99 as const;

// =============================================================================
// DR BYPASS TAGS — DEFAULT FALLBACK LIST
// =============================================================================

/**
 * Default list of Damage Reduction bypass material/alignment tags for the
 * DamageReduction builder select. These are the standard D&D 3.5 SRD options.
 *
 * WHY A CONSTANT (not inlined in DamageReduction.svelte):
 *   DR bypass material names are D&D game content (zero-hardcoding rule,
 *   ARCHITECTURE.md §6). This list is used ONLY when the `config_dr_bypass_options`
 *   config table is not loaded. Production rule files should always define
 *   this table.
 *
 * NOTE: The `'—'` entry represents "no bypass" (all-damage DR).
 */
export const DR_BYPASS_TAGS_FALLBACK: readonly string[] = [
  '—', 'magic', 'adamantine', 'cold_iron', 'silver', 'mithral',
  'slashing', 'bludgeoning', 'piercing', 'good', 'evil', 'lawful', 'chaotic', 'epic',
] as const;

// =============================================================================
// CONSUMABLE ITEM TYPE TAGS
// =============================================================================

/**
 * Tag used on ItemFeature.tags to identify potion-type consumables.
 *
 * WHY A CONSTANT (not inlined as `'potion'` in InventoryTab.svelte):
 *   D&D item type names are game content that must not appear as magic strings
 *   in `.svelte` component files (zero-hardcoding rule, ARCHITECTURE.md §6).
 *   Centralising here means a rename only requires updating this constant.
 */
export const POTION_ITEM_TAG = 'potion' as const;

/**
 * Tag used on ItemFeature.tags to identify oil-type consumables.
 * Oils are applied to weapons or armor (e.g., Oil of Magic Weapon).
 *
 * WHY A CONSTANT: same rationale as POTION_ITEM_TAG above.
 */
export const OIL_ITEM_TAG = 'oil' as const;

/**
 * Tag used on `ActiveFeatureInstance.isStashed` to indicate items stored away
 * from the character (not carried, not equipped — weight does not count).
 *
 * This constant centralises the tag string so no `.svelte` component file ever
 * contains the literal `'stashed'` (zero-hardcoding rule, ARCHITECTURE.md §6).
 *
 * Used by `InventoryTab.svelte` to separate the three inventory sections:
 *   Equipped (isActive && !isStashed), Backpack (!isActive && !isStashed), Storage (isStashed).
 */
export const STASHED_ITEM_TAG = 'stashed' as const;

/**
 * Sentinel value for `ItemFeature.equipmentSlot` when the item occupies no
 * equipment slot (e.g. a simple backpack consumable, a story item).
 *
 * WHY A CONSTANT (not inlined as `'none'` in InventoryTab.svelte):
 *   Template conditionals that filter slot badges must not hardcode model
 *   sentinel values as magic strings (zero-hardcoding rule, ARCHITECTURE.md §6).
 *   Using a named constant makes the intent clear and ensures a rename of the
 *   sentinel propagates automatically to all usage sites.
 */
export const EQUIPMENT_SLOT_NONE = 'none' as const;

/**
 * The 9 standard D&D 3.5 alignments with their stable IDs and `ui-strings.ts`
 * translation keys.
 *
 * WHY `ui_key` INSTEAD OF `label: LocalizedString`?
 *   Previously each alignment carried an inline `{ en: '…', fr: '…' }` object.
 *   Adding a new language required modifying this constant. Now translations live
 *   exclusively in the locale JSON files (`static/locales/fr.json`, etc.) under
 *   `alignment.*` keys. Adding a new language only requires editing the JSON.
 *
 * USAGE IN COMPONENTS:
 *   Display: `ui(alignment.ui_key, lang)` → localized string for the UI.
 *
 * USAGE IN ENGINE (`setAlignment`):
 *   `buildLocalizedString(alignment.ui_key)` → full `LocalizedString` for the
 *   synthetic feature registered in the DataLoader cache.
 *
 * NOTE ON IDs:
 *   The `id` values (e.g. `alignment_lawful_good`) are used as feature IDs when
 *   the alignment is injected as a condition feature instance. They MUST remain
 *   stable across sessions.
 */
export const ALIGNMENTS: ReadonlyArray<{ id: string; ui_key: string }> = [
  { id: 'alignment_lawful_good',     ui_key: 'alignment.lawful_good'     },
  { id: 'alignment_neutral_good',    ui_key: 'alignment.neutral_good'    },
  { id: 'alignment_chaotic_good',    ui_key: 'alignment.chaotic_good'    },
  { id: 'alignment_lawful_neutral',  ui_key: 'alignment.lawful_neutral'  },
  { id: 'alignment_true_neutral',    ui_key: 'alignment.true_neutral'    },
  { id: 'alignment_chaotic_neutral', ui_key: 'alignment.chaotic_neutral' },
  { id: 'alignment_lawful_evil',     ui_key: 'alignment.lawful_evil'     },
  { id: 'alignment_neutral_evil',    ui_key: 'alignment.neutral_evil'    },
  { id: 'alignment_chaotic_evil',    ui_key: 'alignment.chaotic_evil'    },
] as const;
