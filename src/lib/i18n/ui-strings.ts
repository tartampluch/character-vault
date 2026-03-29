/**
 * @file src/lib/i18n/ui-strings.ts
 * @description UI chrome i18n: English baseline strings + runtime locale loader.
 *
 * ARCHITECTURE
 * ────────────
 * English is always bundled here as the fallback baseline.
 * Every other language is loaded on demand from /locales/{code}.json.
 *
 * ADDING A BUILT-IN LANGUAGE (ships with the app):
 *   1. Add { code, unitSystem } to SUPPORTED_UI_LANGUAGES.
 *   2. Create static/locales/{code}.json with all translated keys.
 *   No TypeScript change is needed — the loader is purely data-driven.
 *
 * ADDING A COMMUNITY LANGUAGE (server-dropped file):
 *   Drop static/locales/{code}.json on the server. The discovery endpoint
 *   GET /api/locales returns it automatically and the language appears in
 *   the dropdown on next page load. No code change required.
 *
 * STRING TYPES
 *   Simple string:  "key": "Translation text"
 *   Template var:   "key": "Hello {name}!" — caller does .replace('{name}', val)
 *   Plural object:  "key": { "one": "1 file", "other": "{n} files" }
 *                   → use uiN(key, count, lang) at call sites
 *
 * PLURAL FORM NAMES (CLDR):
 *   Most European languages only use "one" and "other".
 *   Languages like Russian, Arabic, Polish need "few", "many", "zero" too.
 *   Intl.PluralRules handles the selection automatically for any BCP-47 code.
 */

import type { UiStringValue, UiLocale, UnitSystem, LocalizedString } from '../types/i18n';

// =============================================================================
// BUILT-IN LANGUAGE REGISTRY
// =============================================================================

/**
 * Languages that ship with the application (always available, even offline).
 * English is the fallback baseline — it never needs a locale file.
 * French ships as static/locales/fr.json.
 *
 * Community languages (dropped in static/locales/) are discovered dynamically
 * via GET /api/locales and registered at runtime — no entry needed here.
 */
/**
 * The one truly built-in UI language.
 *
 * English is the ONLY compile-time entry: it has no locale file on the server,
 * is never returned by GET /api/locales, and is always available regardless of
 * deployment configuration. It is the hardcoded fallback for every ui() call.
 *
 * EVERY other language — including the bundled fr.json — is treated as a
 * server-side locale file. Its code, native name, and unit system are discovered
 * at runtime via DataLoader.loadExternalLocales() → GET /api/locales. This means:
 *   • A deployed server can freely add or remove locale files without any code change.
 *   • The language dropdown only shows a language AFTER its metadata is available,
 *     so getLanguageDisplayName() never needs a compile-time fallback table.
 *   • Unit system registration (registerLangUnitSystem) is also runtime-only for
 *     all non-English languages; getUnitSystem() falls back to 'imperial' until the
 *     locale is fetched.
 *
 * To add a new locale: create static/locales/<code>.json with a valid $meta block
 * (language, code, unitSystem) and translated strings. No TypeScript changes needed.
 */
export const SUPPORTED_UI_LANGUAGES: ReadonlyArray<{ code: string; unitSystem: UnitSystem }> = [
  { code: 'en', unitSystem: 'imperial' },
];

/**
 * Language code → unit system map.
 * Built from SUPPORTED_UI_LANGUAGES at module load; extended at runtime for
 * community locales via registerLangUnitSystem().
 */
export const LANG_UNIT_SYSTEM = new Map<string, UnitSystem>(
  SUPPORTED_UI_LANGUAGES.map(({ code, unitSystem }) => [code, unitSystem])
);

/**
 * Register a unit system for a language code discovered at runtime.
 * Called by DataLoader.loadExternalLocales() after the /api/locales discovery.
 * No-op if the code is already registered (built-in languages take priority).
 */
export function registerLangUnitSystem(code: string, unitSystem: UnitSystem): void {
  if (!LANG_UNIT_SYSTEM.has(code)) LANG_UNIT_SYSTEM.set(code, unitSystem);
}

// =============================================================================
// RUNTIME LOCALE CACHE
// =============================================================================

/** Loaded locale maps, keyed by language code (never contains 'en'). */
const _loadedLocales = new Map<string, UiLocale>();

/** Cached Intl.PluralRules instances, one per language code. */
const _pluralCache = new Map<string, Intl.PluralRules>();

/**
 * Load a locale file from /locales/{code}.json and cache it.
 *
 * - No-op for 'en' (always resolved from the bundled baseline).
 * - No-op if already loaded.
 * - Falls back silently to English if the file is missing or unreachable.
 *
 * Call this once when the user selects a language (Sidebar.svelte) and once
 * on app startup for the active language (AppShell.svelte).
 */
// =============================================================================
// LOCALE CACHE — localStorage persistence for instant restoration on refresh
// =============================================================================

const LOCALE_CACHE_PREFIX = 'cv_locale_';
/** Refresh cached locale after 24 h (background re-fetch on next load). */
const LOCALE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface StoredLocaleEntry {
  /** Unix timestamp (ms) when the entry was written. */
  ts: number;
  /** Parsed locale strings, identical to what _loadedLocales stores. */
  data: UiLocale;
}

/**
 * Set of locale codes that were loaded from localStorage cache this session.
 * Used by `loadUiLocale` to decide whether to background-refresh the cache
 * even when `_loadedLocales` already has an entry.
 */
const _fromCache = new Set<string>();

/**
 * Synchronously restores a locale from the localStorage cache.
 *
 * Called in AppShell's script block (before first render) to allow the warm
 * start path to render directly in the user's language without a spinner.
 * If the cached entry is absent or older than LOCALE_CACHE_TTL_MS returns
 * `false` and the async fetch path (onMount) handles the cold start.
 *
 * English ('en') is always available — returns `true` immediately.
 *
 * BCP-47 REGIONAL VARIANTS (e.g. 'fr-be'):
 *   For regional variants, this function also attempts to restore the base
 *   language ('fr') from cache so the fallback chain fr-be → fr → en works
 *   on the synchronous warm-start path. The return value reflects only the
 *   requested code's availability, not the base language.
 *
 * @param code - BCP-47 language code (e.g. 'fr', 'fr-be', 'en-gb').
 * @returns `true` if the locale for `code` is now available in `_loadedLocales`.
 */
export function loadUiLocaleFromCache(code: string): boolean {
  if (code === 'en') return true;

  // For regional variants (e.g. 'fr-be'), also restore the base language ('fr')
  // from cache so the fallback chain works on the synchronous warm-start path.
  const hyphenIdx = code.indexOf('-');
  if (hyphenIdx > 0) {
    const baseLang = code.slice(0, hyphenIdx);
    if (baseLang !== 'en') loadUiLocaleFromCache(baseLang); // recursive, sync
  }

  // Already freshly fetched this session — nothing to do.
  if (_loadedLocales.has(code) && !_fromCache.has(code)) return true;
  if (typeof localStorage === 'undefined') return false;
  try {
    const raw = localStorage.getItem(LOCALE_CACHE_PREFIX + code);
    if (!raw) return false;
    const entry = JSON.parse(raw) as StoredLocaleEntry;
    if (!entry?.data || Date.now() - entry.ts > LOCALE_CACHE_TTL_MS) {
      // Stale — evict so the async fetch stores a fresh copy.
      localStorage.removeItem(LOCALE_CACHE_PREFIX + code);
      return false;
    }
    _loadedLocales.set(code, entry.data);
    _fromCache.add(code);
    return true;
  } catch {
    return false;
  }
}

/**
 * Loads a UI locale file from the server and caches it.
 *
 * BCP-47 REGIONAL VARIANTS (e.g. 'fr-be'):
 *   When loading a regional variant, this function also triggers a parallel
 *   load of the base language ('fr') so the fallback chain fr-be → fr → en
 *   works correctly. The base-language load is non-blocking (fire-and-forget)
 *   to avoid sequential fetches.
 *
 * @param code - BCP-47 language code (e.g. 'fr', 'fr-be', 'en-gb').
 */
export async function loadUiLocale(code: string): Promise<void> {
  if (code === 'en') return;

  // For REAL BCP-47 regional variants (e.g. 'fr-be', 'en-gb'), also load the
  // base language ('fr') in parallel so the fallback chain is populated before
  // any ui() calls. This is fire-and-forget to avoid sequential fetches.
  //
  // GUARD: Only trigger for strict BCP-47 format — both the language tag and
  // the region tag must be 2–3 alphabetic characters. This prevents spurious
  // fetches for synthetic codes like 'lc-1' (used in unit tests) which contain
  // a digit region tag and are not valid BCP-47 regional variants.
  const bcp47RegionalPattern = /^([a-z]{2,3})-([a-z]{2,3})$/;
  const bcp47Match = bcp47RegionalPattern.exec(code);
  if (bcp47Match) {
    const baseLang = bcp47Match[1];
    if (baseLang !== 'en') {
      void loadUiLocale(baseLang);
    }
  }

  // Skip only if the locale was freshly fetched this session (not just from
  // cache). Cache entries are always background-refreshed so the next page
  // load benefits from up-to-date translations.
  if (_loadedLocales.has(code) && !_fromCache.has(code)) return;
  try {
    const res = await fetch(`/locales/${code}.json`);
    if (!res.ok) return;
    const raw = await res.json() as Record<string, unknown>;
    // Strip the $meta block — it is translator metadata, not a string key.
    const { $meta: _ignored, ...strings } = raw;
    const locale = strings as UiLocale;
    _loadedLocales.set(code, locale);
    _fromCache.delete(code); // mark as freshly fetched

    // Persist to localStorage so the next page load can restore synchronously.
    try {
      localStorage.setItem(
        LOCALE_CACHE_PREFIX + code,
        JSON.stringify({ ts: Date.now(), data: locale } satisfies StoredLocaleEntry),
      );
    } catch { /* quota exceeded — silently skip */ }
  } catch {
    // Non-critical: the UI will display English strings as a graceful fallback.
  }
}

// =============================================================================
// ENGLISH BASELINE — all UI chrome strings in English
// =============================================================================
// Keys:   dot-separated namespaces  →  'section.subsection.element'
// Values: plain string  OR  { one: '…', other: '…' } for count-sensitive labels
//         (use uiN() at call sites for plural objects)
// =============================================================================

export const UI_STRINGS: Record<string, UiStringValue> = {

  // ==========================================================================
  // LOGIN PAGE
  // ==========================================================================
  'login.title':                  'Sign in to continue',
  /** Placeholder for the username field on the login page. */
  'login.username_placeholder':   'e.g. gm',
  'login.username':               'Username',
  'login.password':               'Password',
  'login.sign_in':                'Sign In',
  'login.signing_in':             'Signing in…',
  'login.error_account_expired':   'This account was not activated within 7 days and has been suspended. Contact an administrator.',
  'login.error_account_suspended': 'This account has been suspended. Contact an administrator.',
  /** Placeholder for the password field on the login page (visual mask hint). */
  'login.password_placeholder':   '••••••••',
  'login.error_invalid':          'Invalid username or password.',
  'login.error_too_many':         'Too many login attempts. Please wait 15 minutes.',
  'login.error_failed':           'Login failed (HTTP {status}). Please try again.',
  'login.error_server':           'Could not reach the server. Is the PHP API running?',


  // ==========================================================================
  // SIDEBAR & NAVIGATION
  // ==========================================================================
  'app.title':                    'Character Vault',
  'nav.campaigns':                'Campaigns',
  'nav.vault':                    'Vault',
  'nav.character':                'Character',
  'nav.character_sheet':          'Character Sheet',
  'nav.gm_tools':                 'GM Tools',
  'nav.gm_dashboard':             'GM Dashboard',
  'nav.content_editor':           'Content Editor',
  'nav.settings':                 'Settings',
  'nav.campaign_settings':        'Campaign Settings',
  'nav.expand_sidebar':           'Expand sidebar',
  'nav.collapse_sidebar':         'Collapse sidebar',
  'nav.close_navigation':         'Close navigation',
  'nav.open_navigation':          'Open navigation',
  'nav.app_nav_aria':             'Application navigation',
  'nav.mobile_nav_aria':          'Mobile navigation bar',
  'nav.rules':                    'Rules',
  'nav.back_to_campaign_hub':     'Back to Campaign Hub',
  'nav.save_campaign_settings_aria': 'Save campaign settings',
  'nav.role_gm':                  'Game Master',
  'nav.role_player':              'Player',

  // ==========================================================================
  // USER MENU
  // ==========================================================================
  'user.logout':                  'Log out',
  'user.change_password':         'Change Password',
  'user.menu_label':              'User options',

  // ==========================================================================
  // THEME TOGGLE
  // ==========================================================================
  'theme.system':                 'System',
  'theme.light':                  'Light',
  'theme.dark':                   'Dark',
  'theme.tooltip_system':         'Theme: System (follows OS preference). Click for Light.',
  'theme.tooltip_light':          'Theme: Light. Click for Dark.',
  'theme.tooltip_dark':           'Theme: Dark. Click for System.',

  // ==========================================================================
  // CHARACTER SHEET TABS
  // ==========================================================================
  'tab.core':                     'Core',
  'tab.abilities':                'Abilities',
  'tab.combat':                   'Combat',
  'tab.feats':                    'Feats',
  'tab.magic':                    'Magic',
  'tab.inventory':                'Inventory',

  // ==========================================================================
  // CHARACTER SHEET — PAGE CHROME
  // ==========================================================================
  'character.back_vault':         'Vault',
  'character.back_campaigns':     'Campaigns',
  'character.level_display':      'Level {n}',
  'character.no_class':           'No class selected yet',
  'character.go_to_core_tab':     'Go to Core tab',
  /** Shown in the fallback block when an unrecognised ?tab= query parameter is encountered. */
  'character.unknown_tab_prefix': 'Unknown tab:',
  /** Fallback name for a character that could not be found in the vault or storage. */
  'character.unknown_name':       'Unknown Character',

  // ==========================================================================
  // CAMPAIGNS HUB
  // ==========================================================================
  'campaigns.title':              'Your Campaigns',
  'campaigns.subtitle':           'Choose a campaign to begin, or create a new one.',
  'campaigns.create':             'Create Campaign',
  'campaigns.new_title':          'New Campaign',
  'campaigns.field_title':        'Campaign Title',
  'campaigns.field_title_placeholder': 'e.g. Reign of Winter, Curse of Strahd…',
  'campaigns.empty_title':        'No campaigns yet',
  'campaigns.empty_gm':           'Click "+ Create Campaign" above to start your first adventure.',
  'campaigns.empty_player':       "Your Game Master hasn't created a campaign yet. Check back later!",
  'campaigns.open':               'Open →',

  // ==========================================================================
  // CAMPAIGN DETAIL
  // ==========================================================================
  'campaign.not_found':           'Campaign not found',
  'campaign.not_found_desc':      "The campaign with this ID doesn't exist.",
  'campaign.back_to_hub':         'Back to Campaign Hub',
  'campaign.character_vault':     'Character Vault',
  'campaign.chapters_title':      'Chapters & Acts',
  'campaign.chapters_empty_gm':   'No chapters yet. Add chapters in Campaign Settings.',
  'campaign.chapters_empty_player': 'No chapters have been added to this campaign yet.',
  'campaign.completed':           'Completed',
  'campaign.mark_done':           'Mark done',
  'campaign.mark_incomplete':     'Mark as incomplete',
  'campaign.mark_completed':      'Mark as completed',
  'campaign.done':                'Done',
  'campaign.task_done':           'Done',
  'campaign.task_mark_done':      'Mark done',
  'campaign.active_sources':      'Active Rule Sources',
  'campaign.manage_sources_hint': 'Manage rule sources in GM Settings.',
  'campaign.tasks_total':         '{completed}/{total} tasks',
  /** Alt text for the campaign banner image. {title} = campaign title. */
  'campaign.banner_alt':          '{title} banner',

  // ==========================================================================
  // CHARACTER VAULT
  // ==========================================================================
  'vault.title':                  'Your Adventurers',
  'vault.create_character':       'Create New Character',
  'vault.add_npc':                'Add NPC / Monster',
  /** Default name assigned to a freshly-created PC before the player renames it. */
  'vault.default_char_name':      'New Character',
  /** Default name assigned to a freshly-created NPC / monster before the GM renames it. */
  'vault.default_npc_name':       'New NPC',
  'vault.gm_view':                'GM View',
  'vault.player_view':            'Player View',
  'vault.characters':             'character(s)',
  'vault.empty_title':            'No adventurers yet!',
  'vault.empty_gm':               "Create the party's first character or add an NPC to get started.",
  'vault.empty_player':           'You don\'t have any characters in this campaign yet. Click "Create New Character" to begin your journey!',
  'vault.delete_confirm':         'Delete "{name}"? This cannot be undone.',
  'vault.delete_character':       'Delete character',
  /** Accessible label for the per-card delete button. {name} = character name. */
  'vault.delete_aria':            'Delete {name}',
  /**
   * Short abbreviation shown on the character-card level badge ("Lv. 5").
   * Must be a brief abbreviation (≤ 3 characters) to fit the compact badge.
   * French equivalent: same abbreviation "Nv." (Niveau).
   */
  'vault.level_abbr':             'Lv.',

  // ==========================================================================
  // GM DASHBOARD
  // ==========================================================================
  'gm.dashboard':                 'GM Dashboard',
  'gm.all_characters':            'All Characters',
  'gm.no_characters':             'No characters in this campaign yet.',
  'gm.select_character':          '← Select a character to view their stats and edit GM overrides.',
  'gm.npc':                       'NPC',
  'gm.pc':                        'PC',
  'gm.quick_stats':               'Quick Stats (read-only)',
  'gm.active_features':           'active features',
  'gm.overrides':                 'GM override(s)',
  'gm.per_char_overrides':        'Per-Character GM Overrides',
  'gm.override_help':             'Array of ActiveFeatureInstance objects applied LAST in the resolution chain. Each entry needs instanceId, featureId, isActive.',
  'gm.must_be_json_array':        'Must be a JSON array.',
  'gm.invalid_json':              'Invalid JSON',
  'gm.valid_json':                'Valid JSON',
  'gm.saved':                     'Saved!',
  'gm.saved_locally':             'Saved locally (API unavailable).',
  'gm.saving':                    'Saving…',
  'gm.save_overrides':            'Save Overrides',
  /** {name} = character name */
  'gm.overrides_for_aria':        'GM overrides for {name}',
  'gm.save_overrides_for_aria':   'Save GM overrides for {name}',
  'gm.syntax_error':              'Syntax error:',
  /**
   * Shown when JSON.parse throws and a character-offset position is extractable.
   * Replace the `{line}` placeholder at call sites with the computed line number.
   * Example output: "Syntax error on line 3: Unexpected token '}'"
   */
  'gm.json_syntax_on_line':      'Syntax error on line {line}:',
  'gm.level_prefix':              'Lv.',
  'gm.override_count':            'override(s)',
  'gm.view':                      'GM View',
  /**
   * Short abbreviation for Hit Points displayed in the GM Dashboard quick-stats
   * chip. English uses "HP"; French uses "PV" (Points de Vie).
   * Kept separate from `combat.hp.title` ("Hit Points") because the GM chip
   * needs an ultra-compact 2–3-character label, not the full title.
   */
  'gm.hp_abbr':                   'HP',

  // ==========================================================================
  // CORE TAB — BASIC INFO
  // ==========================================================================
  'core.basic_info':              'Basic Information',
  'core.character_name':          'Character Name',
  'core.player_name':             'Player Name',
  'core.character_name_placeholder': 'e.g. Thorin Ironforge',
  'core.player_name_placeholder': 'e.g. Alice, Bob…',
  'core.race':                    'Race',
  'core.class':                   'Class',
  'core.deity':                   'Deity',
  'core.alignment':               'Alignment',
  'core.none':                    '— None —',
  'core.select':                  '— Select —',
  'core.level_in':                'Level in',
  'core.recommended':             'Recommended:',
  'core.show_details':            'Show details',
  'core.no_deities':              'No deities loaded. Enable a rule source with deity data.',
  'core.choices':                 'Choices',
  'core.up_to':                   'up to',
  'core.no_options':              'No options matching',
  /** Accessible label for the (i) info button next to a choice dropdown. */
  'core.show_option_details_aria': 'Show selected option details',

  // ==========================================================================
  // CORE TAB — SUMMARY PANELS
  // ==========================================================================
  'core.ability_scores':          'Ability Scores',
  'core.saving_throws':           'Saving Throws',
  'core.skills':                  'Skills',
  'core.edit_link':               'Edit →',
  'core.skills_trained_total':    '{trained} trained • {total} total',
  'core.skills_empty':            'No skills loaded.',
  'core.skills_empty_hint':       'Skills appear once {key} is loaded.',
  'core.ability_scores_empty':    'No attributes loaded. Load rule sources to initialise.',

  // ==========================================================================
  // ABILITIES TAB — POINT BUY MODAL
  // ==========================================================================
  'abilities.point_buy.title':    'Point Buy',
  'abilities.point_buy.budget_label': 'Budget',
  'abilities.point_buy.remaining': '{n} remaining',
  'abilities.point_buy.cost':     'Cost',
  'abilities.point_buy.pts':      'pts',
  'abilities.point_buy.how_it_works': 'Scores start at 8 for free. Raising a score costs points — higher scores cost more per point (15+ costs 2 pts/step). The GM sets the budget in campaign settings.',
  'abilities.point_buy.reset':    'Reset All (8s)',
  'abilities.point_buy.confirm':  'Confirm',

  // ==========================================================================
  // ABILITIES TAB — ROLL STATS MODAL
  // ==========================================================================
  'abilities.roll.title':         'Roll Stats (4d6 Drop Lowest)',
  'abilities.roll.reroll_active': 'Reroll 1s active',
  'abilities.roll.reroll_off':    'Reroll 1s: OFF',
  'abilities.roll.method_desc':   'Method: 4d6 drop lowest × 6',
  'abilities.roll.rolled_values': 'Rolled values — click to assign:',
  'abilities.roll.not_assigned':  '— Not assigned —',
  'abilities.roll.roll':          'Roll!',
  'abilities.roll.roll_again':    'Roll Again',
  'abilities.roll.apply':         'Apply These Scores',
  'abilities.roll.prompt':        'Click "Roll!" to generate 6 ability scores.',

  // ==========================================================================
  // ABILITIES TAB
  // ==========================================================================
  'abilities.title':              'Ability Scores',
  'abilities.point_buy':          'Point Buy',
  'abilities.roll_stats':         'Roll Stats',
  'abilities.base':               'Base',
  'abilities.total':              'Total',
  'abilities.mod':                'Mod',
  'abilities.temp':               'Temp',
  'abilities.recommended_for':    'Recommended for your class',
  'abilities.check':              'Check',
  'abilities.show_breakdown':     'Show modifier breakdown',
  'abilities.temp_tooltip':       'Temporary modifier (buff/curse)',
  'abilities.point_buy_tooltip':  'Point Buy stat generation wizard',
  'abilities.roll_stats_tooltip': 'Roll Stats wizard (4d6 drop lowest)',

  // ==========================================================================
  // SAVING THROWS
  // ==========================================================================
  'saves.title':                  'Saving Throws',
  'saves.base':                   'Base',
  'saves.mods':                   'Mods',
  'saves.temp':                   'Temp',
  'saves.show_breakdown':         'Show breakdown',
  'saves.roll':                   'Roll saving throw',
  'saves.save':                   'Save',

  // ==========================================================================
  // SKILLS MATRIX
  // ==========================================================================
  'skills.title':                 'Skills Matrix',
  'skills.sp':                    'SP:',
  'skills.no_skills':             'No skills loaded.',
  'skills.enable_source':         'Enable a rule source with skill definitions.',
  'skills.col_skill':             'Skill',
  'skills.col_total':             'Total',
  'skills.col_ability':           'Ability',
  'skills.col_ranks':             'Ranks',
  'skills.col_cost':              'Cost',
  'skills.col_max':               'Max',
  'skills.training_required':     'T',
  'skills.class_skill':           'Class Skill',
  'skills.cross_class':           'Cross-class Skill',
  'skills.cross_class_short':     'Cross-class',
  'skills.rank_locked':           'Min',
  'skills.rank_locked_tooltip':   'Minimum rank — skill points spent at a committed level-up cannot be refunded.',
  'skills.rank_min_label':        'Min {n}',
  'skills.rank_min_tooltip':      'Minimum rank floor: {n} — committed during a previous level-up. Cannot go below this value.',
  'skills.journal_btn':           'Journal',
  'skills.journal_tooltip':       'Open the leveling journal — explains which class contributed which skill points, BAB, and saves.',

  // ==========================================================================
  // LEVELING JOURNAL MODAL
  // ==========================================================================
  'journal.title':                'Leveling Journal',
  'journal.subtitle':             'Per-class contribution breakdown',
  'journal.no_classes':           'No classes active. Add a class on the Core tab to begin.',
  'journal.class_level':          'Level',
  'journal.bab':                  'BAB',
  'journal.fort':                 'Fort',
  'journal.ref':                  'Ref',
  'journal.will':                 'Will',
  'journal.skill_points':         'SP',
  'journal.sp_formula':           '{base} SP/lv',
  'journal.sp_with_int':          '({base}+INT{int:+}) × {lvl} = {total}',
  'journal.sp_note':              '× {lvl} levels',
  'journal.class_skills_title':   'Class Skills',
  'journal.class_skills_none':    'None declared',
  'journal.features_title':       'Features Granted (up to level {lvl})',
  'journal.features_none':        'No features',
  'journal.totals_row':           'Totals',
  'journal.bonus_sp':             'Bonus SP/lv (racial/feat): +{bonus}',
  'journal.multiclass_warning':   'Multiclass XP penalty may apply if classes differ by more than 1 level (SRD rule).',
  'journal.lock_ranks_btn':       'Lock Current Ranks',
  'journal.lock_ranks_tooltip':   'Lock current skill ranks as the minimum floor — simulates committing a level-up.',
  'journal.unlock_ranks_btn':     'Unlock Ranks',
  'journal.unlock_ranks_tooltip': 'Remove all rank minimums — allow free reallocation (only for character creation).',
  'journal.sp_first_level_note':  'The first class taken at character level 1 receives 4× the normal SP for that level (D&D 3.5 SRD). This bonus is already included in the totals above.',

  // ==========================================================================
  // COMBAT TAB — HIT POINTS & XP
  // ==========================================================================
  'combat.hp.title':              'Hit Points',
  'combat.hp.con_contrib':        'CON contrib:',
  'combat.hp.con_contrib_tooltip': 'Constitution modifier × character level',
  'combat.hp.current':            'Current',
  'combat.hp.max':                'Max',
  'combat.hp.temp':               '+Temp',
  'combat.hp.heal':               'Heal',
  'combat.hp.damage':             'Damage',
  'combat.hp.add_temp':           '+ Temp',
  // Accessible labels for HP/XP control inputs and buttons (ARCHITECTURE.md §6)
  'combat.hp.heal_amount_aria':   'Healing amount',
  'combat.hp.apply_heal_aria':    'Apply healing',
  'combat.hp.damage_amount_aria': 'Damage amount',
  'combat.hp.apply_damage_aria':  'Apply damage',
  'combat.hp.temp_amount_aria':   'Temporary HP amount',
  'combat.hp.add_temp_aria':      'Add temporary HP',
  'combat.hp.current_aria':       'Current HP',
  'combat.hp.bar_aria':           'HP: {current} / {max}',
  'combat.hp.unknown':            'Unknown',
  'combat.hp.dead':               'Dead',
  'combat.hp.dying':              'Dying',
  'combat.hp.unconscious':        'Unconscious',
  'combat.hp.bloodied':           'Bloodied',
  'combat.hp.injured':            'Injured',
  'combat.hp.healthy':            'Healthy',
  'combat.xp.title':              'Experience',
  'combat.xp.level':              'Level',
  'combat.xp.xp_separator':      'XP /',
  'combat.xp.xp':                 'XP',
  'combat.xp.to_next':            'XP to next level',
  'combat.xp.add_placeholder':    'Add XP…',
  'combat.xp.award':              '+ Award XP',
  'combat.xp.level_up':           'Level Up!',
  // Accessible labels for XP controls (ARCHITECTURE.md §6)
  'combat.xp.add_aria':           'XP to add',
  'combat.xp.award_aria':         'Award XP',
  'combat.xp.level_up_aria':      'Level Up',
  'combat.xp.bar_aria':           'XP: {pct}% to next level (ECL {ecl})',
  'combat.xp.config_hint':        'Load config_xp_thresholds for accurate XP thresholds.',

  // ==========================================================================
  // COMBAT TAB — ARMOR CLASS
  // ==========================================================================
  'combat.ac.title':              'Armor Class',
  'combat.ac.temp_mod':           'Temp Mod',
  'combat.ac.normal':             'AC',
  'combat.ac.touch':              'Touch',
  'combat.ac.flat':               'Flat',
  'combat.ac.normal_desc':        'Normal Armor Class',
  'combat.ac.touch_desc':         'Touch AC (ignores armor/shield/natural armor)',
  'combat.ac.flat_desc':          'Flat-Footed AC (ignores DEX/dodge)',
  'combat.ac.temp_label':         'temp',
  'combat.ac.effective_dex':      'Effective DEX to AC:',
  'combat.ac.effective_dex_tooltip': 'DEX modifier capped by max_dexterity_bonus (e.g. from armor)',
  'combat.ac.cap':                'Cap:',
  /** Accessible label for AC breakdown buttons. {description} = AC type name. */
  'combat.ac.show_breakdown_aria': 'Show {description} breakdown',

  // ==========================================================================
  // COMBAT TAB — CORE COMBAT
  // ==========================================================================
  'combat.core.title':            'Core Combat',
  'combat.core.bab':              'BAB',
  'combat.core.initiative':       'Initiative',
  'combat.core.grapple':          'Grapple',
  'combat.core.bab_desc':         'Base Attack Bonus',
  'combat.core.initiative_desc':  'Initiative modifier (DEX + misc)',
  'combat.core.grapple_desc':     'Grapple modifier (BAB + STR + size)',
  'combat.core.initiative_roll':  'Initiative Roll',
  'combat.core.grapple_check':    'Grapple Check',
  'combat.core.breakdown':        'Breakdown',
  'combat.core.roll':             'Roll',
  // Accessible label for the dice-roll button in CoreCombat stat cards (ARCHITECTURE.md §6)
  'combat.core.roll_dice_aria':   'Roll dice',
  // Fortification (ARCHITECTURE.md §4.7) — critical hit negation percentage
  'combat.core.fort':             'Fort.',
  'combat.core.fort_desc':        'Fortification — chance (%) to negate a confirmed critical hit',
  // Arcane Spell Failure (ARCHITECTURE.md §4.8) — accumulated armour penalty for arcane casters
  'combat.core.asf':              'ASF',
  'combat.core.asf_desc':         'Arcane Spell Failure — total % chance from equipped armour and shields',

  // ==========================================================================
  // COMBAT TAB — ATTACKS
  // ==========================================================================
  'combat.attacks.title':         'Weapons & Attacks',
  'combat.attacks.main_hand':     'Main Hand',
  'combat.attacks.unarmed':       'Unarmed',
  'combat.attacks.atk':           'ATK:',
  'combat.attacks.dmg':           'DMG:',
  'combat.attacks.crit':          'Crit:',
  'combat.attacks.attack':        'Attack',
  'combat.attacks.damage':        'Damage',
  // Accessible labels for roll buttons (ARCHITECTURE.md §6)
  'combat.attacks.roll_attack_aria': 'Roll attack',
  'combat.attacks.roll_damage_aria': 'Roll damage',

  // ==========================================================================
  // COMBAT TAB — MOVEMENT
  // ==========================================================================
  'combat.movement.title':        'Movement Speeds',
  'combat.movement.penalty_note': 'Armor & encumbrance penalties applied via pipeline modifiers.',
  'combat.movement.penalty_title': 'Penalty from armor or encumbrance',

  // ==========================================================================
  // COMBAT TAB — RESISTANCES
  // ==========================================================================
  'combat.resistances.title':     'Resistances',
  'combat.resistances.fire':      'Fire',
  'combat.resistances.cold':      'Cold',
  'combat.resistances.acid':      'Acid',
  'combat.resistances.electricity': 'Electricity',
  'combat.resistances.sonic':     'Sonic',
  'combat.resistances.sr':        'SR',
  'combat.resistances.pr':        'PR',
  'combat.resistances.fort':      'Fort.',
  'combat.resistances.asf':       'Arcane SF%',
  'combat.resistances.misc':      'Misc modifier',

  // ==========================================================================
  // COMBAT TAB — DAMAGE REDUCTION
  // ==========================================================================
  'combat.dr.title':              'Damage Reduction',
  'combat.dr.empty':              'No Damage Reduction configured.',
  'combat.dr.add':                'Add DR',
  'combat.dr.value':              'Value',
  'combat.dr.bypassed_by':        'Bypassed By',
  'combat.dr.type_label':         'Type',
  'combat.dr.type_innate':        'Innate (best-wins)',
  'combat.dr.type_class':         'Class (additive)',

  // ==========================================================================
  // INVENTORY — ENCUMBRANCE
  // ==========================================================================
  'inventory.encumbrance.title':  'Encumbrance & Wealth',
  'inventory.encumbrance.carried': 'carried',
  'inventory.encumbrance.light':  'Light',
  'inventory.encumbrance.medium': 'Medium',
  'inventory.encumbrance.heavy':  'Heavy',
  'inventory.encumbrance.max':    'Max',
  'inventory.encumbrance.light_lte': 'Light ≤',
  'inventory.encumbrance.medium_lte': 'Medium ≤',
  'inventory.encumbrance.heavy_lte': 'Heavy ≤',
  'inventory.encumbrance.speed_warning': '— speed reduced, check penalties apply',
  'inventory.encumbrance.coin_weight': 'Coins add:',
  'inventory.encumbrance.wealth': 'Wealth',
  'inventory.encumbrance.total':  'Total',
  'inventory.encumbrance.gp':     'GP',
  'inventory.encumbrance.config_hint': 'Load config_carrying_capacity for accurate weight limits.',
  'inventory.encumbrance.tier_unknown':     'Unknown',
  'inventory.encumbrance.tier_overloaded':  'Overloaded',
  'inventory.encumbrance.tier_heavy':       'Heavy Load',
  'inventory.encumbrance.tier_medium':      'Medium Load',
  'inventory.encumbrance.tier_light':       'Light Load',
  'inventory.coins.pp':           'PP',
  'inventory.coins.gp':           'GP',
  'inventory.coins.sp':           'SP',
  'inventory.coins.cp':           'CP',
  'inventory.coins.pp_title':     'Platinum Pieces',
  'inventory.coins.gp_title':     'Gold Pieces',
  'inventory.coins.sp_title':     'Silver Pieces',
  'inventory.coins.cp_title':     'Copper Pieces',

  // ==========================================================================
  // FEATS TAB
  // ==========================================================================
  'feats.title':                  'Feats',
  'feats.available':              'Available:',
  'feats.remaining':              'Remaining:',
  'feats.add':                    'Add Feat',
  'feats.granted':                'Granted Feats (automatic)',
  'feats.from':                   'from:',
  'feats.selected':               'Selected Feats',
  'feats.empty':                  'No feats selected yet. Click "+ Add Feat" to choose from the catalog.',
  'feats.slots_available':        'slot(s) available.',
  'feats.remove_tooltip':         'Remove this feat (frees a slot)',
  'feats.unknown_source':         'Unknown',
  /** Accessible label for Add Feat button. {n} = remaining slots. */
  'feats.add_aria':               'Add feat ({n} slots remaining)',

  // ==========================================================================
  // FEAT CATALOG MODAL
  // ==========================================================================
  'feat_catalog.title':           'Feat Catalog',
  'feat_catalog.slots_left':      'slot(s) left',
  'feat_catalog.feats_found':     'feat(s) found',
  'feat_catalog.search':          'Search feats…',
  'feat_catalog.all_tags':        'All tags',
  'feat_catalog.filter_by_tag':   'Filter by tag',
  'feat_catalog.empty':           'Load a rule source with feats to populate this catalog.',
  'feat_catalog.have':            'Have',
  'feat_catalog.select':          'Select',
  'feat_catalog.prereqs_met':     'prerequisites met',
  'feat_catalog.prereqs_not_met': 'prerequisites not met',
  'feat_catalog.already_have':    'Already have this feat',
  'feat_catalog.cannot_select':   'Cannot select: prerequisites not met',

  // ==========================================================================
  // EPHEMERAL EFFECTS PANEL
  // ==========================================================================
  'effects.panel.title':          'Active Effects',
  'effects.panel.empty':          'No active effects. Drink a potion or use an ability to see effects here.',
  'effects.panel.expire':         'Expire',
  'effects.panel.expire_tooltip': 'End this effect early',
  'effects.panel.duration':       'Duration:',
  'effects.panel.applied_round':  'Applied at round',
  'effects.panel.source':         'Source:',
  'effects.panel.active_badge':   'Active',
  'effects.panel.confirm_expire': 'End this effect?',
  'effects.panel.modifiers':      { one: '1 modifier', other: '{n} modifiers' },

  'inventory.use_item':           'Use',
  'inventory.drink_potion':       'Drink',
  'inventory.apply_oil':          'Apply',
  'inventory.consumable_badge':   'Consumable',
  /** Tooltip shown on the consume (Drink/Apply/Use) button. */
  'inventory.consume_tooltip':    'Consume this item — it will be removed from inventory.',

  // Inventory section headers & empty states
  'inventory.section.equipped':   'Equipped / Readied',
  'inventory.section.backpack':   'Backpack / Carried',
  'inventory.section.storage':    'Storage / Stashed',
  'inventory.section.storage_weight_note': 'no weight',
  'inventory.empty.equipped':     'No items equipped.',
  'inventory.empty.backpack':     'No items in backpack.',
  'inventory.empty.storage':      'No items in storage.',

  // Equip / unequip actions
  'inventory.unequip':            'Unequip',

  // Cursed item UI
  'inventory.cursed.label':       'Cursed (cannot unequip)',
  'inventory.cursed.tooltip':     'This item is cursed and cannot be removed by normal means.',

  // Slot capacity errors
  'inventory.two_hands.slots_full': 'Both hand slots must be free for this two-handed weapon.',
  'inventory.slot.full':          '{slot} slot is full. Unequip an item first.',
  'inventory.slot.full_badge':    'Slot full',

  // Storage status badge (shown in stashed-items section)
  'inventory.not_carried':        'not carried',

  // Psionic tattoo limit (D&D 3.5: max 20 tattoos)
  'inventory.tattoo.limit_exceeded': 'Cannot equip: maximum of 20 psionic tattoos reached.',

  // ==========================================================================
  // MAGIC TAB
  // ==========================================================================
  'magic.abilities.title':        'Special Abilities',
  'magic.abilities.empty':        'No special abilities found. Class and domain abilities with activation types will appear here.',
  'magic.abilities.cost':         'Cost:',
  'magic.abilities.use':          'Use',
  'magic.casting.title':          'Spells & Powers',
  'magic.casting.empty':          'No spells known. Use the Grimoire to learn spells.',
  'magic.casting.cantrips':       'Cantrips (0)',
  'magic.casting.level':          'Level',
  'magic.casting.save_dc':        'Save DC:',
  'magic.casting.cast':           'Cast',
  'magic.casting.manifest':       'Manifest',
  'magic.casting.damage':         'Damage',
  // Accessible labels and feedback for Cast/Manifest buttons (ARCHITECTURE.md §6)
  'magic.casting.roll_damage_aria': 'Roll damage',
  'magic.casting.cast_aria':      'Cast {name}',
  'magic.casting.manifest_aria':  'Manifest {name} ({pp} PP)',
  'magic.casting.insufficient_pp':     'Not enough power points to manifest.',
  'magic.casting.no_slot_available':   'No spell slots available at this level.',

  // Magic item casting support
  'magic.casting.metamagic_rods': 'Metamagic Rods',
  'magic.casting.rod_feat':       '{feat}',
  'magic.casting.rod_max_level':  'max spell lvl {lvl}',
  'magic.casting.rod_applies':    'Free metamagic available for this spell',
  'magic.casting.staves':         'Staves',
  'magic.casting.staff_charge_cost': '{n} charge(s)',
  'magic.casting.wands':          'Wands',
  'magic.casting.wand_cl':        'CL {cl}',
  'magic.casting.scrolls':        'Scrolls',

  // Scroll restriction / CL check
  'magic.scroll.wrong_type':      'Cannot use: requires {type} casting ability',
  'magic.scroll.cl_check':        'CL check DC {dc}',
  'magic.scroll.cl_check_tooltip': 'Your caster level is lower than the scroll\'s. Make a caster level check DC {dc}.',

  // Psionic augmentation
  'psi.augment_label':            'Augment',
  'psi.augment_no_desc':          'No description available.',
  'psi.pp_total':                 'Total: {pp} PP',
  'psi.manifester_level':         'ML:',
  'magic.grimoire.title':         'Grimoire — Spell Catalog',
  'magic.grimoire.cl':            'CL',
  'magic.grimoire.max_level':     'Max Lvl',
  'magic.grimoire.search':        'Search spells…',
  'magic.grimoire.no_class':      'Select a spellcasting class to see its spell list.',
  'magic.grimoire.no_match':      'no spells match the current filters.',
  'magic.grimoire.lvl':           'Lvl',
  'magic.grimoire.known':         'Known',
  'magic.grimoire.learn':         'Learn',

  // Magic type display labels — used in Grimoire and CastingPanel to show
  // human-readable, localizable labels for spell/power type identifiers.
  // These must NOT be hardcoded as literal strings in .svelte templates
  // (ARCHITECTURE.md §6 zero-hardcoding rule).
  'magic.type.arcane':            'Arcane',
  'magic.type.divine':            'Divine',
  'magic.type.psionic':           'Psionic',

  // Magic school display labels — used in Grimoire and SpellRowItem to show
  // localised school names for each spell.  These are the player-facing versions;
  // the GM content-editor uses editor.school.* (which share the same values).
  // Falls back to the raw spell.school identifier for custom/unknown schools.
  'magic.school.abjuration':    'Abjuration',
  'magic.school.conjuration':   'Conjuration',
  'magic.school.divination':    'Divination',
  'magic.school.enchantment':   'Enchantment',
  'magic.school.evocation':     'Evocation',
  'magic.school.illusion':      'Illusion',
  'magic.school.necromancy':    'Necromancy',
  'magic.school.transmutation': 'Transmutation',
  'magic.school.universal':     'Universal',

  // ==========================================================================
  // MODIFIER BREAKDOWN MODAL
  // ==========================================================================
  'breakdown.title_suffix':       '— Breakdown',
  'breakdown.base_value':         'Base value',
  'breakdown.suppressed':         'Suppressed (stacking rules)',
  'breakdown.base':               'Base',
  'breakdown.modifiers':          'Modifiers',
  'breakdown.derived_mod':        '→ Mod:',
  'breakdown.situational':        'Situational (applied at roll time)',
  'breakdown.vs':                 'vs.',
  'breakdown.conditional':        'Conditional',

  // ==========================================================================
  // FEATURE MODAL
  // ==========================================================================
  'feature.section_modifiers':    'Modifiers',
  'feature.section_grants':       'Grants',
  'feature.section_prerequisites': 'Prerequisites',
  'feature.section_choices':      'Choices',
  'feature.conditional':          'Conditional',
  'feature.not_found':            'Feature not found',
  'feature.not_found_desc':       'No feature found with ID',
  'feature.cache_hint':           'The DataLoader cache may not be loaded, or the rule source containing this feature may not be enabled.',
  'feature.no_prereqs':           'No labelled prerequisites found.',
  'feature.grant_type.sense':     'Sense',
  'feature.grant_type.proficiency': 'Proficiency',
  'feature.grant_type.language':  'Language',
  'feature.grant_type.immunity':  'Immunity',
  'feature.grant_type.racial':    'Racial',
  'feature.grant_type.class_feature': 'Class Feature',
  'feature.grant_type.feat':      'Feat',
  'feature.grant_type.spell':     'Spell',
  'feature.grant_type.item':      'Item',
  'feature.grant_type.condition': 'Condition',
  'feature.grant_type.feature':   'Feature',
  'feature.choice_select':        'Select',
  'feature.choice_selected':      'Selected',
  'feature.choice_remove':        'Remove',
  'feature.choice_pick_up_to':    'Pick up to {n}',
  'feature.choice_pick_one':      'Pick one',
  'feature.choice_no_options':    'No options available. Enable the relevant rule source.',
  // GM metadata section labels (ARCHITECTURE.md §6: all visible text via ui())
  'feature.label_source':        'Source',
  'feature.label_id':            'ID',
  'feature.label_category':      'Cat.',
  'feature.label_tags':          'Tags',

  // ==========================================================================
  // DICE ROLL MODAL
  // ==========================================================================
  'dice.target_tags':             'Target Tags',
  'dice.situational_available':   'situational bonus(es) available',
  'dice.tags_placeholder':        'e.g. orc, evil, undead',
  'dice.rolling':                 'Rolling...',
  'dice.roll_again':              'Roll Again',
  'dice.roll':                    'Roll!',
  'dice.critical_threat':         'CRITICAL THREAT!',
  'dice.fumble':                  'FUMBLE!',
  'dice.result':                  'Result',
  'dice.explosion':               'EXPLOSION',
  'dice.dice_rolls':              'Dice rolls',
  'dice.natural_total':           'Natural total',
  'dice.static_bonus':            'Static bonus',
  'dice.situational_bonus':       'Situational bonus',
  'dice.final_total':             'Final Total',
  'dice.exploding_active':        'Exploding 20s active',

  // ==========================================================================
  // COMMON / SHARED
  // ==========================================================================
  'common.cancel':                'Cancel',
  'common.save':                  'Save',
  'common.saving':                'Saving…',
  'common.saved':                 'Saved',
  'common.save_error':            'Error',
  'common.campaign':              'Campaign',
  /** Short label for "Class" (e.g., column header in Leveling Journal overview table). */
  'common.class':                 'Class',
  'common.level':                 'Level',
  'common.unknown':               'Unknown',
  'common.gm':                    'GM',
  'common.player':                'Player',
  /** Short label for a Non-Player Character. Shown as a badge on NPC cards/sheets. */
  'common.npc':                   'NPC',
  /** Accessible full label for NPC badge (used in aria-label). */
  'common.npc_aria':              'Non-player character',

  // ==========================================================================
  // PREREQUISITE STATUS
  // ==========================================================================
  'prereq.disabled':              'Prerequisites no longer met — effects suspended',
  /** Defensive fallback shown when a LogicNode has an unrecognised type (TypeScript exhaustiveness guard). */
  'prereq.unknown_type':          'Unknown prerequisite type',

  // ==========================================================================
  // ECL / LEVEL ADJUSTMENT
  // ==========================================================================
  'ecl.title':                    'Level Adjustment',
  'ecl.la_label':                 'LA',
  'ecl.ecl_label':                'ECL',
  'ecl.xp_label':                 'XP',
  'ecl.la_tooltip':               'Level Adjustment — racial balance surcharge. ECL = class levels + LA.',
  'ecl.ecl_tooltip':              'Effective Character Level — used for XP thresholds.',
  'ecl.reduce_la':                'Reduce LA',
  'ecl.reduce_la_tooltip':        'Pay XP to reduce LA by 1 (requires 3× LA class levels — SRD variant rule).',
  'ecl.reduce_la_confirm':        'Reduce Level Adjustment from {current} to {next}?',
  'ecl.xp_bar_label':             'XP to next level',

  // ==========================================================================
  // FAST HEALING / REGENERATION
  // ==========================================================================
  'heal.fast_healing':            'Fast Healing',
  'heal.regeneration':            'Regeneration',
  'heal.tick_button':             'Start Turn',
  'heal.tick_tooltip':            "Apply per-turn healing (Fast Healing / Regeneration) for this character's turn.",
  'heal.per_turn_badge':          '+{n}/turn',
  'heal.per_round_badge':         '+{n}/round',
  'heal.encounter_reset':         'New Encounter',
  'heal.long_rest':               'Long Rest',
  'heal.short_rest':              'Short Rest',

  // ==========================================================================
  // DAMAGE REDUCTION
  // ==========================================================================
  'dr.abbr':                      'DR',
  'dr.groups_title':              'Active DR',
  'dr.bypass_label':              'Bypassed by:',
  'dr.none_bypass':               '— (nothing)',
  'dr.suppressed':                'Suppressed (lower value)',
  'dr.add_innate':                'Add Innate DR',
  'dr.base_class_label':          'Class DR (additive):',
  'dr.innate_label':              'Innate / Racial DR:',
  /**
   * Templates used to build the label and description of a custom DR feature.
   * {value} = numeric DR value, {bypass} = bypass material/tag string.
   * Called via buildLocalizedString() + template replacement at runtime.
   */
  'dr.label_template':       'DR {value}/{bypass}',
  'dr.description_template': 'Damage Reduction {value}/{bypass}',

  // ==========================================================================
  // PSIONIC POWERS
  // ==========================================================================
  'psi.discipline_label':         'Discipline',
  'psi.displays_label':           'Displays',
  'psi.suppress_displays':        'Suppress Displays',
  'psi.suppress_dc':              'DC {dc}',
  'psi.pp_cost':                  '{pp} PP',
  'psi.discipline.clairsentience':  'Clairsentience',
  'psi.discipline.metacreativity': 'Metacreativity',
  'psi.discipline.psychokinesis':  'Psychokinesis',
  'psi.discipline.psychometabolism': 'Psychometabolism',
  'psi.discipline.psychoportation': 'Psychoportation',
  'psi.discipline.telepathy':      'Telepathy',
  'psi.display.auditory':         'Aud',
  'psi.display.material':         'Mat',
  'psi.display.mental':           'Men',
  'psi.display.olfactory':        'Olf',
  'psi.display.visual':           'Vis',
  'psi.filter_discipline':        'Filter by discipline',
  'psi.all_disciplines':          'All disciplines',
  'psi.no_powers_in_filter':      'No powers match this discipline filter.',
  // Hint strings for psionic disciplines (content editor dropdown)
  'psi.discipline.clairsentience.hint':   'Information, scrying, precognition',
  'psi.discipline.metacreativity.hint':   'Matter creation, astral constructs',
  'psi.discipline.psychokinesis.hint':    'Energy manipulation, force',
  'psi.discipline.psychometabolism.hint': 'Body alteration, healing',
  'psi.discipline.psychoportation.hint':  'Movement, teleportation',
  'psi.discipline.telepathy.hint':        'Mind reading, charm, compulsion',
  // Full display names for psionic manifestation displays (the psi.display.* keys are abbreviations)
  'psi.display.auditory.label':  'Auditory',
  'psi.display.material.label':  'Material',
  'psi.display.mental.label':    'Mental',
  'psi.display.olfactory.label': 'Olfactory',
  'psi.display.visual.label':    'Visual',
  // Hint strings for psionic displays (content editor checkboxes)
  'psi.display.auditory.hint':   'Bass hum; heard up to 100 ft.',
  'psi.display.material.hint':   'Ectoplasmic coating; evaporates in 1 round',
  'psi.display.mental.hint':     'Subtle chime in nearby minds (15 ft.)',
  'psi.display.olfactory.hint':  'Odd scent; spreads 20 ft., fades quickly',
  'psi.display.visual.hint':     'Silver eye-fire + rainbow flash',

  // ==========================================================================
  // PSIONIC ITEMS
  // ==========================================================================
  'psionic_item.cognizance_crystal': 'Cognizance Crystal',
  'psionic_item.dorje':              'Dorje',
  'psionic_item.power_stone':        'Power Stone',
  'psionic_item.psicrown':           'Psicrown',
  'psionic_item.psionic_tattoo':     'Psionic Tattoo',
  /** Label for the PP bar on a Psicrown item card. */
  'psionic_item.crown_pp_label':     'Crown PP',
  'psionic_item.stored_pp':          '{pp} / {max} PP',
  'psionic_item.charges':            '{n} / {max} charges',
  'psionic_item.attuned':            'Attuned',
  'psionic_item.not_attuned':        'Not attuned (10 min.)',
  'psionic_item.attune_button':      'Attune',
  'psionic_item.activated':          'Used',
  'psionic_item.activate_button':    'Activate Tattoo',
  'psionic_item.use_charge':         'Use',
  'psionic_item.manifest_from_crown': 'Manifest',
  'psionic_item.draw_pp':            'Draw {pp} PP',
  'psionic_item.powers_known':       'Powers',
  'psionic_item.pp_abbr':            'PP',
  'psionic_item.brainburn_risk':     'Brainburn risk (ML check DC {dc})',
  'psionic_item.power_flushed':      'Used up',
  'psionic_item.tattoo_activate_confirm': 'Activate {name}? It will fade after use.',
  'psionic_item.recharge_label':     'Recharge:',

  // ==========================================================================
  // LORE & LANGUAGES
  // ==========================================================================
  'lore.personal_story':          'Personal Story',
  'lore.personal_story_placeholder': "The character's backstory, motivation, personality traits, ideals, bonds, and flaws…",
  'lore.languages':               'Languages',
  'lore.bonus_slots':             '{used}/{total} bonus slots',
  'lore.no_bonus_slots':          'No bonus slots',
  'lore.automatic':               'Automatic',
  'lore.learned':                 'Learned',
  'lore.add_language':            '— Add language ({n} slot{s} left) —',
  'lore.all_slots_filled':        'All bonus language slots filled. Increase INT or add Speak Language ranks for more.',
  'lore.no_languages_available':  'No additional languages available. Enable a rule source with language features.',
  'lore.appearance':              'Appearance',
  'lore.height':                  'Height',
  'lore.weight':                  'Weight',
  'lore.age':                     'Age',
  'lore.eyes':                    'Eyes',
  'lore.hair':                    'Hair',
  'lore.skin':                    'Skin',
  'lore.height_placeholder':      "5'8\"",
  'lore.weight_placeholder':      '160 lb.',
  'lore.age_placeholder':         '24',
  'lore.eyes_placeholder':        'Brown',
  'lore.hair_placeholder':        'Dark brown',
  'lore.skin_placeholder':        'Olive',

  // ==========================================================================
  // ACTION BUDGET
  // ==========================================================================
  'action.budget_title':          'Actions This Turn',
  'action.standard':              'Standard',
  'action.move':                  'Move',
  'action.swift':                 'Swift',
  'action.immediate':             'Immediate',
  'action.free':                  'Free',
  'action.full_round':            'Full Round',
  'action.minutes':               'Minutes',
  'action.hours':                 'Hours',
  'action.passive':               'Passive',
  'action.reaction':              'Reaction',
  'action.blocked':               'Blocked by: {conditions}',
  'action.spent':                 'Spent',
  'action.spent_with_conditions': '{spent}/{budget} spent — condition: {conditions}',
  'action.available':             'Available',
  'action.spend_standard':        'Use Standard Action',
  'action.spend_move':            'Use Move Action',
  'action.spend_full':            'Use Full-Round Action',
  'action.reset_turn':            'Reset Turn',
  'action.xor_note':              'Standard OR Move — not both.',

  // ==========================================================================
  // CAMPAIGN SETTINGS — GENERAL
  // ==========================================================================
  'settings.save':                'Save Settings',
  'settings.saving':              'Saving…',
  'settings.saved':               'Settings saved successfully!',
  'settings.saved_local':         'Saved locally (API unavailable).',
  'settings.back_campaign':       'Campaign',
  'settings.gm_view':             'GM View',
  'settings.title':               'Campaign Settings',

  // ==========================================================================
  // CAMPAIGN SETTINGS — RULE SOURCES
  // ==========================================================================
  'settings.rule_sources.title':  'Rule Sources',
  'settings.rule_sources.desc':   'Enable or disable rule source files. Drag to reorder — sources loaded later have higher priority (last wins on duplicate IDs).',
  'settings.rule_sources.quick_toggle': 'Quick toggle:',
  'settings.rule_sources.disable_all': 'Disable all',
  'settings.rule_sources.enable_all': 'Enable all',
  'settings.rule_sources.load_order':   'Load order',
  'settings.rule_sources.all_files':    'All files',
  'settings.rule_sources.available':    'available',
  'settings.rule_sources.entities':     { one: 'entity',  other: 'entities' },
  'settings.rule_sources.files':        { one: 'file',    other: 'files'    },
  'settings.rule_sources.toggle_all':   'All',
  'settings.rule_sources.toggle_none':  'None',
  'settings.rule_sources.enabled_count': '{enabled} / {total} enabled',
  'settings.rule_sources.enable': 'Enable',
  'settings.rule_sources.disable': 'Disable',
  'settings.rule_sources.none':   'No rule sources found. Start the PHP API server to load sources.',
  'settings.rule_sources.error':  'Could not load rule sources',

  // ==========================================================================
  // CAMPAIGN SETTINGS — GM OVERRIDES
  // ==========================================================================
  'settings.overrides.title':      'GM Global Overrides',
  'settings.overrides.desc':       'A JSON array of Feature-like objects and/or config tables applied to ALL characters in this campaign, AFTER all rule source files. Features need <code>id</code> + <code>category</code>. Config tables need <code>tableId</code> + <code>data</code>.',
  'settings.overrides.aria_label': 'GM Global Overrides JSON',
  'settings.overrides.valid':      'Valid JSON',
  'settings.overrides.invalid':    'Invalid JSON — fix errors before saving',
  'settings.overrides.entry':      { one: '{n} override entry', other: '{n} override entries' },
  'settings.overrides.examples':   'Examples',
  'settings.overrides.ex_new_label':   'New feature — grant a bonus to all characters',
  'settings.overrides.ex_merge_label': 'Partial override — patch an existing rule entity',
  'settings.overrides.ex_table_label': 'Config table — replace a lookup table',

  // ==========================================================================
  // CAMPAIGN SETTINGS — JSON OVERRIDE VALIDATOR (settings page)
  // These keys are used by the inline $derived JSON validator in
  // src/routes/campaigns/[id]/settings/+page.svelte to produce localized
  // error and warning messages without hardcoded English strings.
  // ==========================================================================
  /** Prefix for a syntax error that includes the line number. {line} = line number. */
  'settings.overrides.json_syntax_on_line': 'Syntax error on line {line}:',
  /** Used when the JSON is not a top-level array. */
  'settings.overrides.json_not_array':      'Override JSON must be a JSON array ([ ... ]).',
  /** Warning when an array entry is not an object. {n} = index, {type} = JS typeof result. */
  'settings.overrides.json_entry_bad_type': 'Entry {n}: expected object, got {type}.',
  /** Warning when an entry is missing required id/category fields. {n} = index, {id} = resolved id or "?". */
  'settings.overrides.json_entry_no_id':    'Entry {n} ("{id}"): missing id or category.',
  /** Warning when a tableId entry is missing its data array. {n} = index, {tableId} = tableId value. */
  'settings.overrides.json_entry_no_data':  'Entry {n} (tableId: "{tableId}"): missing data array.',

  // ==========================================================================
  // CAMPAIGN SETTINGS — DICE RULES
  // ==========================================================================
  'settings.dice_rules.title':    'Dice Rules',
  'settings.dice_rules.desc':     'House rules that modify how dice are resolved in this campaign.',
  'settings.exploding_twenties':  'Exploding 20s',
  'settings.exploding_twenties_desc': 'When a natural 20 is rolled on a d20, roll again and add the result. Repeat while 20s keep coming. Can produce astronomically high totals.',

  // ==========================================================================
  // CAMPAIGN SETTINGS — STAT GENERATION
  // ==========================================================================
  'settings.stat_gen.title':      'Stat Generation',
  'settings.stat_gen.desc':       'Method used by players to generate their ability scores during character creation.',
  'settings.stat_gen.method':     'Generation Method',
  'settings.stat_gen.roll':       'Roll (4d6 drop lowest)',
  'settings.stat_gen.point_buy':  'Point Buy',
  'settings.stat_gen.standard_array': 'Standard Array (15/14/13/12/10/8)',
  'settings.stat_gen.reroll_ones': 'Reroll 1s',
  'settings.stat_gen.reroll_ones_desc': 'Before dropping the lowest die, reroll any die showing 1 once. Produces higher average scores.',
  'settings.stat_gen.budget':     'Point Buy Budget',
  'settings.stat_gen.budget_desc': 'Total points to spend. Standard D&D 3.5: Low = 15, Standard = 25, High = 32, Epic = 40.',
  'settings.stat_gen.allowed_methods': 'Allowed Methods (players may use any checked method)',
  'settings.stat_gen.preset_low':  'Low (15)',
  'settings.stat_gen.preset_std':  'Standard (25)',
  'settings.stat_gen.preset_high': 'High (32)',
  'settings.stat_gen.preset_epic': 'Epic (40)',

  // ==========================================================================
  // VARIANT RULES
  // ==========================================================================
  'variant.title':                'Variant Rules',
  'variant.gestalt':              'Gestalt Characters',
  'variant.gestalt_desc':         'Characters advance in two classes simultaneously. BAB and saves use the best progression each level (not additive).',
  'variant.vitality_wound':       'Vitality & Wound Points',
  'variant.vitality_wound_desc':  'Replaces HP with Vitality Points (normal hits) and Wound Points (critical hits). Critical damage goes directly to Wound Points.',

  // ==========================================================================
  // VITALITY / WOUND POINTS
  // ==========================================================================
  'vwp.vitality_label':           'Vitality',
  'vwp.wound_label':              'Wounds',
  'vwp.wound_dc_note':            'Fort save DC {dc} or stunned',
  'vwp.fatigued_note':            'First wound damage → Fatigued',
  'vwp.damage_to':                'Damage → {pool}',
  'vwp.pool_vitality':            'Vitality Points',
  'vwp.pool_wounds':              'Wound Points',
  'vwp.pool_hp':                  'Hit Points',
  'dice.damage_routes_to':        'Routes to:',
  'dice.critical_wound':          '→ WOUND POINTS',
  'dice.normal_vitality':         '→ Vitality Points',

  // ==========================================================================
  // CAMPAIGN SETTINGS — CHAPTERS & ACTS
  // ==========================================================================
  'settings.chapters.title':        'Chapters & Acts',
  'settings.chapters.desc':         "Manage the campaign's narrative chapters and acts, visible to all players. Changes are saved with the rest of the settings.",
  'settings.chapters.add':          'Add Chapter',
  'settings.chapters.empty':        'No chapters yet. Click "Add Chapter" below to create the first one.',
  'settings.chapters.title_label':  'Title',
  'settings.chapters.desc_label':   'Description (optional)',
  'settings.chapters.remove':       'Remove',
  'settings.chapters.title_placeholder': 'e.g. Act I: The Beginning',
  'settings.chapters.desc_placeholder': 'Brief summary of this chapter…',
  'settings.chapters.tasks_label':      'Tasks',
  'settings.chapters.add_task':         '+ Add task',
  'settings.chapters.task_placeholder': 'Task title…',
  'settings.chapters.remove_task':      'Remove task',
  /** Aria-label suffix for an individual task input. {n} = 1-based task index. */
  'settings.chapters.task_n':           'task {n}',

  // ==========================================================================
  // CAMPAIGN SETTINGS — STAT GENERATION
  // ==========================================================================
  'settings.stat_gen.points_unit':  'points',

  // ==========================================================================
  // CAMPAIGN SETTINGS — VARIANT RULES SECTION DESCRIPTION
  // ==========================================================================
  'settings.variant.section_desc':  'Variant rules change core engine behaviour. These flags are saved per-campaign and applied immediately. Only enable variant rules your group has agreed to use.',
  /** Displayed below the V/WP variant checkbox when the option is enabled. */
  'settings.variant.vwp_warning':   'Requires {v} and {w} pools on each character.',

  // ==========================================================================
  // CAMPAIGN SETTINGS — CAMPAIGN MEMBERS SECTION
  // ==========================================================================
  'settings.members.title':         'Campaign Members',
  'settings.members.loading':       'Loading members…',
  'settings.members.empty':         'No members yet. Add players using the button below.',
  'settings.members.suspended':     '(Suspended)',
  'settings.members.add':           'Add Member',
  'settings.members.search_placeholder': 'Search by username or name…',
  'settings.members.loading_users': 'Loading users…',
  'settings.members.no_match':      'No matching users.',
  'settings.members.all_members':   'All users are already members.',
  'settings.members.close_picker':  'Close',
  /** Role display labels used in the member list badge. */
  'settings.members.role_admin':    'Admin',
  'settings.members.remove':        'Remove {username} from campaign',
  'settings.members.error_load':    'Failed to load members.',
  'settings.members.error_add':     'Failed to add member.',
  'settings.members.error_remove':  'Failed to remove member.',
  'settings.members.error_load_users': 'Failed to load users.',
  'settings.members.admin_only':    'Only administrators can browse the full user list.',

  // ==========================================================================
  // ABILITY SCORE ABBREVIATIONS
  // Three-letter abbreviations shown in headers, stat chips, and compact tables.
  // French D&D 3.5 uses different abbreviations (FOR, SAG) from English (STR, WIS).
  // Adding a new language only requires adding 'ability_abbr.*' keys to its
  // locale JSON — no changes to constants.ts needed.
  // ==========================================================================
  'ability_abbr.stat_strength':     'STR',
  'ability_abbr.stat_dexterity':    'DEX',
  'ability_abbr.stat_constitution': 'CON',
  'ability_abbr.stat_intelligence': 'INT',
  'ability_abbr.stat_wisdom':       'WIS',
  'ability_abbr.stat_charisma':     'CHA',

  // ==========================================================================
  // ALIGNMENT LABELS
  // The 9 standard D&D 3.5 alignments. Adding a new language requires only
  // adding 'alignment.*' keys to the locale JSON file.
  // ==========================================================================
  'alignment.lawful_good':     'Lawful Good',
  'alignment.neutral_good':    'Neutral Good',
  'alignment.chaotic_good':    'Chaotic Good',
  'alignment.lawful_neutral':  'Lawful Neutral',
  'alignment.true_neutral':    'True Neutral',
  'alignment.chaotic_neutral': 'Chaotic Neutral',
  'alignment.lawful_evil':     'Lawful Evil',
  'alignment.neutral_evil':    'Neutral Evil',
  'alignment.chaotic_evil':    'Chaotic Evil',

  // ==========================================================================
  // SYNTHETIC PIPELINE LABELS
  // Labels for roll-modal pipelines built at runtime (weapon rolls, spell rolls).
  // Adding a new language only requires adding these keys to the locale JSON.
  // ==========================================================================
  'combat.weapon_roll':  'Weapon Roll',
  'magic.spell_roll':    'Spell Roll',

  // ==========================================================================
  // ENGINE MODIFIER SOURCE LABELS
  // Source labels stored in Modifier.sourceName (LocalizedString) for display
  // in the modifier breakdown modal. Adding a new language only requires adding
  // these keys to the locale JSON.
  // ==========================================================================
  'modifier.synergy':    'Synergy',

  // ==========================================================================
  // CONTENT EDITOR — PIPELINE PICKER & FORMULA BUILDER GROUP HEADERS
  // These labels appear in GM-only authoring tools (PipelinePickerModal,
  // FormulaBuilderInput) to group pipeline IDs by namespace.
  // Adding a new language requires adding these keys to the locale JSON.
  // ==========================================================================
  'content_editor.group.ability_scores':  'Ability Scores',
  'content_editor.group.combat_stats':    'Combat Statistics',
  'content_editor.group.saves':           'Saving Throws',
  'content_editor.group.resources':       'Resources & Pools',
  'content_editor.group.skills':          'Skills',
  'content_editor.group.class_levels':    'Class Levels',
  'content_editor.group.constants':       'Constants & Special',

  // ==========================================================================
  // CONTENT EDITOR — FORMULA BUILDER PATH QUALIFIERS
  // Short qualifiers appended to pipeline names in the formula assistant.
  // e.g. 'Strength (total)', 'Strength modifier', 'Strength (base)'
  // ==========================================================================
  'formula.qualifier.total':    '(total)',
  'formula.qualifier.modifier': 'modifier',
  'formula.qualifier.base':     '(base)',
  // Developer hint labels used as formula assistant descriptions (not game terms).
  'formula.hint.skill_ranks':          '<skill>.ranks  — type skill ID after click',
  'formula.hint.skill_total':          '<skill>.totalValue  — type skill ID after click',
  'formula.hint.class_levels':         'Levels in a class  — type class ID after click',
  'formula.hint.character_level':      'Total character level (all classes)',
  'formula.hint.ecl_for_xp':           'ECL for XP table (characterLevel + LA)',
  'formula.hint.constant':             'Named constant — type constant ID after click',
  'formula.hint.selection':            'Player\'s selection on parent feature',
  'formula.hint.active_tags':          'All active feature tags (array)',
  'formula.hint.weapon_tags':          'Equipped weapon tags (array)',
  'formula.hint.target_tags':          'Target creature tags (roll-time only)',
  'formula.hint.master_class_levels':  'Master\'s class level (LinkedEntity)',

  // ==========================================================================
  // CONTENT EDITOR — PSIONIC DATA SECTION (PsionicDataSection.svelte)
  // All GM-facing strings in the psionic data authoring panel.
  // ==========================================================================
  'content_editor.psi.section_title':       'Psionic Data',
  'content_editor.psi.not_set':             '— Not set',
  'content_editor.psi.base_pp_cost_label':  'Base PP Cost',
  'content_editor.psi.base_pp_cost_desc':   'Power points spent per manifestation (1–17).',
  /** Placeholder for the base PP cost input. */
  'content_editor.psi.base_pp_cost_placeholder': 'e.g. 1',
  'content_editor.psi.displays_legend':     'Displays (sensory effects on manifestation)',
  'content_editor.psi.augmentations_title': 'Augmentations',
  'content_editor.psi.add_augmentation':    '+ Add Augmentation',
  'content_editor.psi.no_augmentations':    'No augmentations. The base power is manifested at its standard effect.',
  /** {n} is replaced with the 1-based augmentation number. */
  'content_editor.psi.augmentation_label':  'Augmentation #{n}',
  'content_editor.psi.pp_cost_increment':   'PP Cost Increment',
  'content_editor.psi.repeatable':          'Repeatable',
  'content_editor.psi.repeatable_hint':     '(can apply multiple times)',
  'content_editor.psi.modifier_count':      { one: '{n} modifier', other: '{n} modifiers' },
  'content_editor.psi.no_modifiers':        'No modifiers',
  'content_editor.psi.edit_modifiers':      'Edit modifiers',
  'content_editor.psi.add_modifiers':       '+ Add modifiers',
  /** {lang} is replaced with the target language code (EN, FR, …). */
  'content_editor.psi.effect_desc_label':   'Effect Description ({lang})',

  // ==========================================================================
  // CONTENT EDITOR — RESOURCE POOL EDITOR (ResourcePoolEditor.svelte)
  // All GM-facing strings in the resource pool authoring panel.
  // ==========================================================================
  'content_editor.pool.section_title':             'Resource Pool Templates',
  'content_editor.pool.section_desc':              'Declares charge or usage pools stamped onto each item instance when equipped. Use for charged items (wands, rods, rings with limited uses).',
  'content_editor.pool.add':                       '+ Add Pool',
  'content_editor.pool.empty':                     'No resource pools defined.',
  'content_editor.pool.empty_hint':                'Add a pool for charged items (e.g., Ring of the Ram uses "charges") or limited-use abilities that reset on a schedule.',
  /** {n} is replaced with the 1-based pool number. */
  'content_editor.pool.entry_label':               'Pool #{n}',
  'content_editor.pool.pool_id_label':             'Pool ID',
  'content_editor.pool.pool_id_placeholder':       'e.g. charges, daily_call, spell_uses',
  'content_editor.pool.pool_id_desc':              'Key in ActiveFeatureInstance.itemResourcePools. Convention: short noun in snake_case.',
  'content_editor.pool.default_current_label':     'Default Current',
  'content_editor.pool.default_current_desc':      'Charges when the item is first created. Looted items start here too unless the GM overrides in the item instance.',
  'content_editor.pool.label_en':                  'Label (English)',
  'content_editor.pool.label_fr':                  'Label (Français)',
  'content_editor.pool.label_en_placeholder':      'e.g. Ram Charges',
  'content_editor.pool.label_fr_placeholder':      'ex. Charges du bélier',
  'content_editor.pool.max_pipeline_label':        'Max Pipeline ID',
  'content_editor.pool.max_pipeline_empty':        'Click to pick max pipeline…',
  'content_editor.pool.max_pipeline_title':        'Click to pick the pipeline that defines the maximum charges',
  'content_editor.pool.reset_condition_label':     'Reset Condition',
  'content_editor.pool.recharge_amount_label':     'Recharge Amount',
  /** Placeholder for the recharge amount formula input. */
  'content_editor.pool.recharge_formula_placeholder': 'e.g. 1, 2, @classLevels.class_druid',
  /** Shown next to the recharge amount field when resetCondition === 'per_turn'. */
  'content_editor.pool.recharge_restored_turn':    '(restored each turn)',
  /** Shown next to the recharge amount field when resetCondition === 'per_round'. */
  'content_editor.pool.recharge_restored_round':   '(restored each round)',
  /**
   * Help text displayed below the "Max Pipeline ID" field in ResourcePoolEditor.
   * Contains HTML with <code> tags; rendered as {@html ...} in the template.
   */
  'content_editor.pool.max_pipeline_help': 'The pipeline whose <code>totalValue</code> sets the cap. For fixed-charge items, create a dedicated stat pipeline (e.g. <code>combatStats.ram_charges_max</code>) and give it a <code>setAbsolute</code> modifier of value 50.',

  // ==========================================================================
  // RESET CONDITIONS (ResourcePoolEditor dropdown values)
  // Label + hint for each of the 8 reset conditions.
  // Adding a new language requires adding reset_condition.* keys to its locale JSON.
  // ==========================================================================
  'reset_condition.never.label':       'Never',
  'reset_condition.never.hint':        'Finite charges — wands, Ring of the Ram (use until empty)',
  'reset_condition.per_day.label':     'Per Day (at dawn)',
  'reset_condition.per_day.hint':      'X/day items; resets at dawn regardless of sleep',
  'reset_condition.long_rest.label':   'Long Rest',
  'reset_condition.long_rest.hint':    '8 hours restful sleep — standard D&D 3.5 spell/HP recovery',
  'reset_condition.short_rest.label':  'Short Rest',
  'reset_condition.short_rest.hint':   'House-rule variant; non-default D&D 3.5',
  'reset_condition.encounter.label':   'Per Encounter',
  'reset_condition.encounter.hint':    'Resets at the start of each new combat encounter',
  'reset_condition.per_week.label':    'Per Week',
  'reset_condition.per_week.hint':     'Calendar weekly ability — e.g. Elemental Command chain lightning',
  'reset_condition.per_turn.label':    'Per Turn',
  'reset_condition.per_turn.hint':     "Recharges at start of this character's own turn",
  'reset_condition.per_round.label':   'Per Round',
  'reset_condition.per_round.hint':    'Recharges once per round at a fixed initiative point',

  // ==========================================================================
  // PIPELINE PRETTIFIER SUFFIXES
  // Used by GameEngine.resolvePipelineLabel() last-resort prettifier to
  // append human-readable suffixes to raw pipeline IDs that end in
  // .maxValue / .currentValue and have no dedicated pipeline_label.* key.
  // ==========================================================================
  /**
   * Suffix appended when a pipeline ID ends in ".maxValue" and has no dedicated label.
   * Example: "resources.shadow_points.maxValue" → "Shadow Points (max)"
   */
  'pipeline.suffix_max':          '(max)',
  /**
   * Suffix appended when a pipeline ID ends in ".currentValue" and has no dedicated label.
   * Example: "resources.shadow_points.currentValue" → "Shadow Points (current)"
   */
  'pipeline.suffix_current':      '(current)',

  // ==========================================================================
  // PIPELINE FALLBACK LABELS
  // English baseline for GameEngine.PIPELINE_FALLBACK_LABELS.
  // These labels are shown in modifier breakdown modals for stats that have
  // no runtime pipeline (e.g. saves, resources, combat stats).
  // French translations live in fr.json under the same keys.
  // Adding a new language requires only adding these keys to its locale JSON.
  // ==========================================================================
  'pipeline_label.saves.all':                                'All Saving Throws',
  'pipeline_label.saves.fortitude':                          'Fortitude Save',
  'pipeline_label.saves.reflex':                             'Reflex Save',
  'pipeline_label.saves.will':                               'Will Save',
  'pipeline_label.combatStats.attack_bonus':                 'Attack Bonus',
  'pipeline_label.combatStats.stability_check':              'Stability Check',
  'pipeline_label.combatStats.hit_die_type':                 'Hit Die',
  'pipeline_label.combatStats.speed_land':                   'Land Speed',
  'pipeline_label.combatStats.speed_fly':                    'Fly Speed',
  'pipeline_label.combatStats.speed_swim':                   'Swim Speed',
  'pipeline_label.combatStats.speed_climb':                  'Climb Speed',
  'pipeline_label.combatStats.speed_burrow':                 'Burrow Speed',
  'pipeline_label.combatStats.ac_normal':                    'Armor Class',
  'pipeline_label.combatStats.ac_touch':                     'Touch AC',
  'pipeline_label.combatStats.ac_flat_footed':               'Flat-Footed AC',
  'pipeline_label.attributes.speed_land':                    'Land Speed',
  'pipeline_label.attributes.skill_points_per_level':        'Skill Points / Level',
  'pipeline_label.attributes.bonus_skill_points_per_level':  'Bonus Skill Points / Level',
  'pipeline_label.attributes.bonus_skill_points_1st_level':  'Bonus Skill Points (1st Level)',
  'pipeline_label.attributes.bonus_feat_slots':              'Bonus Feat Slots',
  'pipeline_label.attributes.spell_dc_illusion':             'Illusion Spell DC',
  'pipeline_label.attributes.stat_strength':                 'Strength',
  'pipeline_label.attributes.stat_dexterity':                'Dexterity',
  'pipeline_label.attributes.stat_constitution':             'Constitution',
  'pipeline_label.attributes.stat_intelligence':             'Intelligence',
  'pipeline_label.attributes.stat_wisdom':                   'Wisdom',
  'pipeline_label.attributes.stat_charisma':                 'Charisma',
  'pipeline_label.attributes.stat_size':                     'Size',
  'pipeline_label.resources.power_points.maxValue':          'Power Points (max)',
  'pipeline_label.resources.vitality_points.maxValue':       'Vitality Points (max)',
  'pipeline_label.resources.wound_points.maxValue':          'Wound Points (max)',
  'pipeline_label.resources.hp.maxValue':                    'Hit Points (max)',
  'pipeline_label.resources.ki_points.maxValue':             'Ki Points (max)',

  // ==========================================================================
  // SITUATIONAL CONTEXT LABELS
  // English baseline for statFormatters.SITUATIONAL_LABELS.
  // These are shown in modifier breakdown modals for situational modifiers.
  // French translations live in fr.json under the same keys.
  // Adding a new language requires only adding situation.* keys to its locale JSON.
  // ==========================================================================
  // Spell / magic save contexts
  'situation.vs_enchantment':                        'vs. Enchantment',
  'situation.vs_poison':                             'vs. Poison',
  'situation.vs_spells_and_spell_like':              'vs. Spells & Spell-likes',
  'situation.vs_spells_and_spell_like_effects':      'vs. Spells & Spell-likes',
  'situation.vs_fear':                               'vs. Fear',
  'situation.vs_charm_or_fear':                      'vs. Charm or Fear',
  'situation.vs_illusion':                           'vs. Illusion',
  'situation.vs_mind_affecting_and_compulsion':      'vs. Mind-affecting & Compulsions',
  'situation.vs_mind_affecting_compulsion':          'vs. Mind-affecting & Compulsions',
  'situation.vs_compulsions_and_mind_affecting':     'vs. Compulsions & Mind-affecting',
  'situation.vs_divination':                         'vs. Divination',
  'situation.vs_power_resistance':                   'vs. Power Resistance',
  'situation.vs_powers_spells_and_spell_like_effects': 'vs. Powers & Spells',
  // Alignment-based
  'situation.vs_evil':                               'vs. Evil',
  'situation.vs_good':                               'vs. Good',
  'situation.vs_chaotic':                            'vs. Chaos',
  'situation.vs_lawful':                             'vs. Law',
  // Creature type / race
  'situation.vs_giant':                              'vs. Giants',
  'situation.vs_giant_type':                         'vs. Giant type',
  'situation.vs_orc_goblinoid':                      'vs. Orcs & Goblinoids',
  'situation.vs_orcs_and_goblinoids':                'vs. Orcs & Goblinoids',
  'situation.vs_kobold_goblinoid':                   'vs. Kobolds & Goblinoids',
  'situation.vs_outsider':                           'vs. Outsiders',
  'situation.vs_construct':                          'vs. Constructs',
  'situation.vs_shapechanger':                       'vs. Shapechangers',
  'situation.vs_fey_spell_like':                     'vs. Fey spell-likes',
  'situation.vs_elemental':                          'vs. Elementals',
  'situation.vs_aquatic_creature':                   'vs. Aquatic creatures',
  'situation.vs_forest_creature':                    'vs. Forest creatures',
  'situation.vs_desert_creature':                    'vs. Desert creatures',
  'situation.vs_hills_creature':                     'vs. Hills creatures',
  'situation.vs_marsh_creature':                     'vs. Marsh creatures',
  'situation.vs_mountain_creature':                  'vs. Mountain creatures',
  'situation.vs_plains_creature':                    'vs. Plains creatures',
  'situation.vs_underground_creature':               'vs. Underground creatures',
  'situation.vs_air_planar_creature':                'vs. Air planar creatures',
  'situation.vs_cavernous_plane_creature':           'vs. Cavernous planar creatures',
  'situation.vs_shifting_plane_creature':            'vs. Shifting planar creatures',
  'situation.vs_aligned_plane_creature':             'vs. Aligned planar creatures',
  // Elemental subtypes
  'situation.vs_fire_creature':                      'vs. Fire creatures',
  'situation.vs_fire_effects':                       'vs. Fire effects',
  'situation.vs_fire_spells_and_effects':            'vs. Fire spells & effects',
  'situation.vs_fire_elementals':                    'vs. Fire elementals',
  'situation.vs_cold_creature':                      'vs. Cold creatures',
  'situation.vs_air_or_electricity_effects':         'vs. Air / Electricity',
  'situation.vs_earth_effects':                      'vs. Earth effects',
  'situation.vs_water_or_cold_effects':              'vs. Water / Cold effects',
  'situation.vs_air_elementals':                     'vs. Air elementals',
  'situation.vs_earth_elementals':                   'vs. Earth elementals',
  'situation.vs_water_elementals':                   'vs. Water elementals',
  'situation.vs_spider_poison':                      'vs. Spider poison',
  // Favored / designated enemy
  'situation.vs_designated_foe':                     'vs. Designated foe',
  'situation.vs_designated_target':                  'vs. Designated target',
  'situation.vs_favored_enemy_1':                    'vs. Favored Enemy 1',
  'situation.vs_favored_enemy_2':                    'vs. Favored Enemy 2',
  'situation.vs_favored_enemy_3':                    'vs. Favored Enemy 3',
  'situation.vs_favored_enemy_4':                    'vs. Favored Enemy 4',
  'situation.vs_favored_enemy_5':                    'vs. Favored Enemy 5',
  'situation.vs_sworn_enemy':                        'vs. Sworn Enemy',
  // Terrain / environment
  'situation.vs_unusual_stonework':                  'vs. Unusual stonework',
  'situation.unusual_stonework':                     'Near unusual stonework',
  'situation.underwater':                            'While underwater',
  'situation.in_saltwater':                          'In saltwater',
  'situation.in_bright_or_absolute_darkness':        'In bright light or darkness',
  'situation.outdoors_temperate':                    'In temperate outdoors',
  'situation.near_wall':                             'When adjacent to a wall',
  // Trap / stonework expertise
  'situation.vs_trap':                               'vs. Traps',
  'situation.vs_traps':                              'vs. Traps',
  'situation.appraise_stone_metal_items':            'Appraising stone/metal items',
  'situation.craft_stone_metal_items':               'Crafting stone/metal items',
  'situation.tracking':                              'While tracking',
  // Combat maneuver contexts
  'situation.vs_bull_rush_or_trip':                  'vs. Bull Rush / Trip',
  'situation.vs_bull_rush_or_trip_on_ground':        'vs. Bull Rush / Trip (standing)',
  'situation.vs_charge_attacks':                     'vs. Charge attacks',
  'situation.vs_ranged_attacks':                     'vs. Ranged attacks',
  'situation.vs_attacks_of_opportunity_on_movement': 'vs. AoOs on movement',
  'situation.vs_attacks_of_opportunity_while_moving': 'vs. AoOs while moving',
  // Attack / damage conditions
  'situation.sneak_attack':                          'On sneak attack',
  'situation.on_hit':                                'On hit',
  'situation.on_hit_fire':                           'On hit (fire)',
  'situation.on_hit_cold':                           'On hit (cold)',
  'situation.on_hit_electricity':                    'On hit (electricity)',
  'situation.on_hit_nonlethal':                      'On hit (nonlethal)',
  'situation.target_flat_footed_or_flanked':         'vs. Flat-footed / flanked',
  'situation.vs_opponent_already_damaged_this_turn': 'vs. Already-damaged opponent',
  'situation.puncture_touch_attack':                 'On puncture touch attack',
  'situation.shield_bash':                           'On shield bash',
  // Fighting style / stance contexts
  'situation.casting_defensively_or_grappled':       'Casting defensively / grappled',
  'situation.fighting_defensively_or_total_defense': 'While fighting defensively',
  'situation.wielding_two_weapons':                  'While two-weapon fighting',
  'situation.single_piercing_weapon_no_offhand':     'Single piercing weapon, no off-hand',
  'situation.using_bow':                             'While using a bow',
  'situation.thrown_weapons_and_slings':             'With thrown weapons & slings',
  'situation.ranged_within_30ft':                    'Ranged within 30 ft.',
  'situation.unarmed_or_natural':                    'Unarmed / natural attacks',
  // Spell school / casting contexts
  'situation.when_casting_chaos_spells':             'When casting Chaos spells',
  'situation.when_casting_divination_spells':        'When casting Divination spells',
  'situation.when_casting_evil_spells':              'When casting Evil spells',
  'situation.when_casting_good_spells':              'When casting Good spells',
  'situation.when_casting_healing_spells':           'When casting Healing spells',
  'situation.when_casting_law_spells':               'When casting Law spells',
  // Psionic contexts
  'situation.becoming_psionically_focused':          'When becoming psionically focused',
  'situation.manifesting_on_defensive_or_grappling': 'When manifesting defensively',
  // Special item / class ability contexts
  'situation.wielded_by_paladin':                    'When wielded by a paladin',
  // Elemental form (wild shape / polymorph)
  'situation.air_elemental':                         'While air elemental',
  'situation.earth_elemental':                       'While earth elemental',
  'situation.fire_elemental':                        'While fire elemental',
  'situation.water_elemental':                       'While water elemental',

  // ==========================================================================
  // STAT LABELS
  // Fallback labels for synthetic stat pipelines built at runtime.
  // Used when no rule source has defined the stat (e.g. stat_size fallback).
  // ==========================================================================
  'stat.size': 'Size',

  // ==========================================================================
  // LANGUAGE SELECTOR
  // ==========================================================================
  'lang.label':                   'Language',
  'lang.select_tooltip':          'Switch display language',
  'lang.unavailable':             'currently unavailable',

  // ==========================================================================
  // COMMON / SHARED
  // ==========================================================================
  'common.close':  'Close',
  'common.delete': 'Delete',
  'common.edit':   'Edit',
  'common.clone':  'Clone',
  'common.import': 'Import',
  'common.export': 'Export',
  'common.never':  'Never',
  'common.error_unexpected': 'An unexpected error occurred. Please try again.',

  // ==========================================================================
  // ADMIN — SIDEBAR SECTION
  // ==========================================================================
  'admin.nav.section_title':   'Admin',
  'admin.nav.user_management': 'User Management',

  // ==========================================================================
  // ADMIN — USER MANAGEMENT PAGE (src/routes/admin/users/+page.svelte)
  // ==========================================================================
  'admin.users.title':         'User Management',
  'admin.users.subtitle':      'Manage accounts, roles, and campaign memberships.',
  'admin.users.add':           'Add User',
  'admin.users.loading':       'Loading users…',
  'admin.users.none':          'No users found.',
  'admin.users.col_username':  'Username',
  'admin.users.col_player':    'Player Name',
  'admin.users.col_role':      'Role',
  'admin.users.col_campaigns': 'Campaigns (chars)',
  'admin.users.col_created':   'Created',
  'admin.users.col_last_login':'Last Login',
  'admin.users.col_status':    'Status',
  'admin.users.col_actions':   'Actions',
  'admin.users.you':           '(you)',
  'admin.users.status_suspended': 'Suspended',
  'admin.users.status_active':    'Active',
  'admin.users.role_admin':    'Admin',
  'admin.users.role_gm':       'GM',
  'admin.users.role_player':   'Player',
  'admin.users.count': { one: '{n} user', other: '{n} users' },
  'admin.users.cannot_edit_self':    'Cannot edit your own account',
  'admin.users.edit_title':          'Edit {username}',
  'admin.users.cannot_suspend_self': 'Cannot suspend your own account',
  'admin.users.reinstate_title':     'Reinstate {username}',
  'admin.users.suspend_title':       'Suspend {username}',
  'admin.users.reset_password_title':'Reset password for {username} (forces setup on next login)',
  'admin.users.cannot_delete_self':  'Cannot delete your own account',
  'admin.users.delete_title':        'Delete {username}',
  'admin.users.error_load':          'Failed to load users.',
  'admin.users.error_action':        'Action failed.',
  'admin.users.error_reset':         'Reset failed.',

  // ==========================================================================
  // ADMIN — USER FORM MODAL (UserFormModal.svelte)
  // ==========================================================================
  'admin.user_form.edit_title':         'Edit "{username}"',
  'admin.user_form.username_label':     'Username',
  'admin.user_form.username_placeholder': 'e.g. alice',
  'admin.user_form.username_desc':      'Used to log in. Must be unique.',
  'admin.user_form.player_name_label':  'Player Name',
  'admin.user_form.player_name_placeholder': 'e.g. Alice',
  'admin.user_form.player_name_desc':   'In-game display name shown to the GM.',
  'admin.user_form.role_label':         'Role',
  'admin.user_form.role_player':        'Player',
  'admin.user_form.role_gm':            'GM (Game Master)',
  'admin.user_form.role_admin':         'Admin',
  'admin.user_form.role_desc':          'Admin can manage users. GM can manage campaigns and characters.',
  'admin.user_form.suspended_label':    'Account Suspended',
  'admin.user_form.suspended_desc':     'Suspended accounts cannot log in.',
  'admin.user_form.reinstate_title':    'Click to reinstate',
  'admin.user_form.suspend_title':      'Click to suspend',
  'admin.user_form.error_taken':        'Username "{username}" is already taken.',
  'admin.user_form.save_changes':       'Save Changes',
  'admin.user_form.create_user':        'Create User',

  // ==========================================================================
  // ADMIN — CONFIRM DELETE MODAL (ConfirmDeleteModal.svelte)
  // ==========================================================================
  'admin.delete_modal.title':          'Delete User',
  'admin.delete_modal.warning_title':  'This action cannot be undone.',
  'admin.delete_modal.warning_desc':   'The account {username} and all their characters will be permanently deleted. Campaign memberships will also be removed.',
  'admin.delete_modal.deleting':       'Deleting…',
  'admin.delete_modal.confirm_btn':    'Delete {username}',

  // ==========================================================================
  // ADMIN — CHANGE PASSWORD MODAL (ChangePasswordModal.svelte)
  // ==========================================================================
  'admin.change_password.current_label':       'Current Password',
  'admin.change_password.current_placeholder': 'Your current password',
  'admin.change_password.new_label':           'New Password',
  'admin.change_password.new_placeholder':     'At least 8 characters',
  'admin.change_password.confirm_label':       'Confirm New Password',
  'admin.change_password.confirm_placeholder': 'Repeat your new password',
  'admin.change_password.mismatch_hint':       'Passwords do not match.',
  'admin.change_password.error_wrong':         'Current password is incorrect.',
  'admin.change_password.val_enter_new':       'Please enter a new password.',
  'admin.change_password.val_min_8':           'New password must be at least 8 characters.',
  'admin.change_password.val_confirm_empty':   'Please confirm your new password.',
  'admin.change_password.val_mismatch':        'New passwords do not match.',

  // ==========================================================================
  // SETUP PASSWORD PAGE (src/routes/setup-password/+page.svelte)
  // ==========================================================================
  'setup_password.subtitle':        'Set your password to continue',
  'setup_password.info':            'Your account requires a password before you can use the application. Choose a strong password — you will use it for all future logins.',
  'setup_password.new_label':       'New Password',
  'setup_password.confirm_label':   'Confirm Password',
  'setup_password.placeholder_min8': 'At least 8 characters',
  'setup_password.placeholder_repeat': 'Repeat your password',
  'setup_password.mismatch_hint':   'Passwords do not match.',
  'setup_password.submit':          'Set Password & Continue',
  'setup_password.val_enter':       'Please enter a new password.',
  'setup_password.val_min8':        'Password must be at least 8 characters.',
  'setup_password.val_confirm':     'Please confirm your password.',
  'setup_password.val_mismatch':    'Passwords do not match.',

  // ==========================================================================
  // CONTENT EDITOR — LIBRARY PAGE (content-editor/+page.svelte)
  // ==========================================================================
  'content_editor.lib.scope_title':          'Homebrew Scope',
  'content_editor.lib.scope_campaign':       'Campaign',
  'content_editor.lib.scope_campaign_hint':  "Stored in this campaign's database record",
  'content_editor.lib.scope_global':         'Global',
  'content_editor.lib.scope_global_hint':    'Stored as a JSON file on the server (shared across campaigns)',
  'content_editor.lib.filename_label':       'Filename',
  /** Placeholder for the homebrew JSON filename input. */
  'content_editor.lib.filename_placeholder': '50_homebrew.json',
  'content_editor.lib.saving':               'Saving…',
  'content_editor.lib.unsaved':              'Unsaved changes',
  'content_editor.lib.saved':                'Saved',
  'content_editor.lib.ready':                'Ready',
  'content_editor.lib.new_entity':           '+ New Entity',
  'content_editor.lib.import_json':          'Import JSON',
  /** {n} = entity count. */
  'content_editor.lib.export_all':           'Export All ({n})',
  'content_editor.lib.filter_placeholder':   'Filter entities…',
  'content_editor.lib.col_id':               'ID',
  'content_editor.lib.col_category':         'Category',
  'content_editor.lib.col_label':            'Label',
  'content_editor.lib.col_source':           'Source',
  'content_editor.lib.col_actions':          'Actions',
  /** {search} = the current search query. */
  'content_editor.lib.no_match':             'No entities match "{search}".',
  'content_editor.lib.empty_title':          'No homebrew entities yet.',
  'content_editor.lib.empty_hint':           'Click "+ New Entity" to author your first homebrew race, feat, spell, or item.',
  /** {filtered} = visible count, {total} = total count. */
  'content_editor.lib.entity_count':         '{filtered} of {total} entities',
  'content_editor.lib.entity_count_filtered':'(filtered)',
  'content_editor.lib.delete_entity_title':  'Delete Entity',
  /** {id} = entity ID. */
  'content_editor.lib.delete_prompt':        'Delete {id}? This cannot be undone.',
  'content_editor.lib.import_modal_title':   'Import JSON',
  'content_editor.lib.import_desc':          'Paste a JSON array of Feature objects. Each entity is merged by ID: existing entities with matching IDs are updated; new IDs are added; entities already in the store that are absent from the import are left untouched.',
  'content_editor.lib.import_placeholder':   'Paste JSON array here…',
  'content_editor.lib.import_submit':        'Import',

  // ==========================================================================
  // CONTENT EDITOR — CORE FIELDS SECTION — labels and placeholders
  // ==========================================================================
  /** Language indicator label for the English content field. */
  'editor.core.lang_en_label':  'English',
  /** Language indicator label for the French content field. */
  'editor.core.lang_fr_label':  'Français',
  /** Placeholder for the EN description textarea. */
  'editor.core.desc_en_placeholder': 'Enter the English description. Use @-path variables (e.g. @characterLevel) for dynamic values resolved at display time.',
  /** Placeholder for the FR description textarea. */
  'editor.core.desc_fr_placeholder': 'Enter the French description. (Same syntax as English.)',

  /** title for the "Export All" download button. */
  'content_editor.lib.download_all_title':   'Download all entities as a JSON file',
  /** title for the "Edit entity" row action button. {id} = entity ID. */
  'content_editor.lib.edit_entity_title':    'Edit {id}',
  /** title for the "Clone entity" row action button. {id} = entity ID. */
  'content_editor.lib.clone_entity_title':   'Clone {id}',
  /** title for the "Delete entity" row action button. {id} = entity ID. */
  'content_editor.lib.delete_entity_title2': 'Delete {id}',

  // ==========================================================================
  // CONTENT EDITOR — NEW ENTITY WIZARD (content-editor/new/+page.svelte)
  // ==========================================================================
  'content_editor.new.title':           'New Entity',
  /** {category} = FeatureCategory value. */
  'content_editor.new.category_note':   'Category: {category}',
  'content_editor.new.step_type':       'Choose Type',
  'content_editor.new.step_origin':     'Starting point',
  'content_editor.new.step_author':     'Author',
  'content_editor.new.how_to_start':    'How would you like to start?',
  'content_editor.new.scratch_title':   'Start from Scratch',
  'content_editor.new.scratch_desc':    'Open an empty form for a brand-new entity. All fields start at their defaults.',
  'content_editor.new.clone_title':     'Clone an Existing Entity',
  'content_editor.new.clone_desc':      'Search the full SRD + homebrew catalog, copy a record as a starting point, and give it a new ID.',
  'content_editor.new.back_category':   '← Back to category selection',
  'content_editor.back_to_library_aria':'Back to Content Library',

  // ==========================================================================
  // CONTENT EDITOR — EDIT ENTITY PAGE (content-editor/[entityId]/+page.svelte)
  // ==========================================================================
  /** {id} = entity ID. */
  'content_editor.edit.heading':               'Edit: {id}',
  'content_editor.edit.delete_btn':            'Delete',
  /** {id} = entity ID. */
  'content_editor.edit.loading':               'Loading entity {id}…',
  'content_editor.edit.loading_hint':          'If this message persists the entity may not exist in the current homebrew store.',
  'content_editor.edit.return_link':           'Return to library.',
  'content_editor.edit.delete_entity_title':   'Delete Entity',
  /** {id} = entity ID. */
  'content_editor.edit.delete_prompt':         'Permanently delete {id}? This cannot be undone.',
  'content_editor.edit.delete_desc':           'The entity will be removed from the homebrew store and will no longer be available in the DataLoader after the next reload.',
  'content_editor.edit.delete_permanently':    'Delete permanently',

  // ==========================================================================
  // FORMULA BUILDER INPUT — validation & UI chrome (FormulaBuilderInput.svelte)
  // ==========================================================================
  /** Default placeholder for the FormulaBuilderInput component when no override is provided. */
  'formula.value_placeholder':  'e.g. 5, 1d6, @attributes.stat_strength.derivedModifier',
  /** Title on the formula assistant entry buttons. {path} = the @-path to insert. */
  'formula.insert_title':       'Insert: {path}',
  /** Dice notation example descriptions (shown in the help popup). */
  'formula.dice_ex_num':        '— plain number',
  'formula.dice_ex_1d6':        '— roll 1 six-sided die',
  'formula.dice_ex_2d8':        '— roll 2d8, add 3',
  /** Loaded skills label in FormulaBuilderInput. */
  'formula.loaded_skills_label': 'Loaded skills:',
  /** Suffix appended to each skill name in the formula assistant path list (e.g. "Acrobatics — ranks"). */
  'formula.skill_ranks_suffix':  ' — ranks',
  'formula.validation.valid':   'Valid formula or @-path',
  'formula.validation.partial': 'Partial @-path — add a suffix (e.g. class ID or skill ID)',
  'formula.validation.invalid': 'Unrecognised @-path — check the Formula Assistant for valid paths',
  'formula.clear_title':        'Clear value',
  'formula.clear_aria':         'Clear formula input',
  'formula.dice_help_aria':     'Dice notation help',
  'formula.dice_examples_title':'Dice notation examples',
  'formula.assistant_title':    'Formula Assistant',

  // ==========================================================================
  // LEVELING JOURNAL MODAL — minor gap
  // ==========================================================================
  'journal.sp_min_note': '(min 1 per level)',

  // ==========================================================================
  // COMMON / SHARED ADDITIONS
  // ==========================================================================
  'common.apply':           'Apply',
  'common.confirm':         'Confirm',
  'common.add':             '+ Add',
  'common.remove':          'Remove',
  'common.change':          'Change',
  'common.test':            'Test',

  // ==========================================================================
  // CONTENT EDITOR — SHARED CATEGORY LABELS
  // Used in EntityTypeSelector, FeaturePickerModal, CoreFieldsSection, etc.
  // ==========================================================================
  'editor.category.race':          'Race',
  'editor.category.class':         'Class',
  'editor.category.class_feature': 'Class Feature',
  'editor.category.feat':          'Feat',
  'editor.category.deity':         'Deity',
  'editor.category.domain':        'Domain',
  'editor.category.magic':         'Spell / Power',
  'editor.category.item':          'Item',
  'editor.category.condition':     'Condition',
  'editor.category.monster_type':  'Monster Type',
  'editor.category.environment':   'Environment',

  // ==========================================================================
  // CONTENT EDITOR — CORE FIELDS SECTION (CoreFieldsSection.svelte)
  // ==========================================================================
   'editor.core.entity_id_label':           'Entity ID',
   'editor.core.entity_id_kebab_hint':      '(kebab-case)',
   'editor.core.entity_id_desc':            'Must be unique across all loaded rule sources. Use the feature\'s ID as one of its tags so prerequisite chains can reference it.',
   /** Placeholder for the entity ID input field. */
   'editor.core.entity_id_placeholder':     'e.g. feat_power_attack, race_half_orc_variant',
  'editor.core.category_label':            'Category',
  'editor.core.category_desc':             'Determines which specialised sub-form sections are shown below, and how the DataLoader routes feature queries.',
  'editor.core.label_legend':              'Label',
  'editor.core.label_display_hint':        '(display name)',
  'editor.core.description_legend':        'Description',
  'editor.core.preview_btn':               'Preview',
  'editor.core.edit_btn':                  'Edit',
  'editor.core.no_description_en':         '(no description)',
  'editor.core.no_description_fr':         '(pas de description)',
  'editor.core.desc_preview_aria':         '{lang} description preview',
   'editor.core.rule_source_label':         'Rule Source',
   'editor.core.rule_source_desc':          'Controls which campaigns can use this entity. Leave as user_homebrew for campaign-scoped homebrew — it is always active and never filtered out.',
   /** Placeholder for the rule source input field. */
   'editor.core.rule_source_placeholder':   'user_homebrew',
  'editor.core.tags_label':                'Tags',
  'editor.core.add_tags_btn':              '+ Add Tags',
  'editor.core.tags_convention_hint':      'Convention: include this entity\'s own ID as a tag so prerequisites can reference it via has_tag.',
  'editor.core.no_tags':                   'No tags.',
  'editor.core.remove_tag_aria':           'Remove tag {tag}',
  'editor.core.forbidden_tags_label':      'Forbidden Tags',
  'editor.core.forbidden_tags_hint':       'If the character has ANY of these tags active, ALL of this entity\'s grantedModifiers are suppressed — the feature remains active but contributes nothing.',
  'editor.core.no_forbidden_tags':         'None.',
  'editor.core.remove_forbidden_tag_aria': 'Remove forbidden tag {tag}',
  'editor.core.merge_strategy_legend':     'Merge Strategy',
  'editor.core.merge_replace_label':       'Replace',
  'editor.core.merge_replace_desc':        'This entity completely replaces any previously loaded entity with the same ID. All fields from the earlier version are discarded. Default — use this for entirely new or wholly rewritten entities.',
  'editor.core.merge_partial_label':       'Partial Merge',
  'editor.core.merge_partial_desc':        'Fields defined in this entity are merged into the existing one: arrays are appended (prefix with - to remove), scalars are overwritten only when defined here. Use this to extend SRD content without duplicating the entire entry.',
  'editor.core.override_warning_title':    'This ID matches an existing SRD entity — it will be overridden.',
  'editor.core.override_warning_desc':     'The homebrew version will take precedence in the resolution chain because it loads after all file-based rule sources. Set Merge to Partial below if you want to extend the original instead of replacing it entirely.',

  // ==========================================================================
  // CONTENT EDITOR — ENTITY TYPE SELECTOR (EntityTypeSelector.svelte)
  // ==========================================================================
  'editor.type_selector.choose_hint':          'Choose the entity type you want to create. This determines which editor sections are shown.',
  'editor.type_selector.race_desc':            'Species traits, ability score bonuses, and racial class skills',
  'editor.type_selector.class_desc':           'Hit die, skill points, BAB/save progressions, and class feature grants',
  'editor.type_selector.class_feature_desc':   'Abilities granted by a class at specific levels',
  'editor.type_selector.feat_desc':            'Player-chosen abilities at character creation or bonus feat levels',
  'editor.type_selector.magic_desc':           'Arcane / divine spells or psionic powers with school, components, and spell lists',
  'editor.type_selector.item_desc':            'Equipment, weapons, armour, magic rings, charged items, wands, staves, and scrolls',
  'editor.type_selector.deity_desc':           'Divine patron with domains, favoured weapon, and alignment-restriction modifiers',
  'editor.type_selector.domain_desc':          'Domain granting bonus spells per day and a domain power',
  'editor.type_selector.condition_desc':       'Status effects with stat penalties and action budget restrictions',
  'editor.type_selector.monster_type_desc':    'Creature type traits shared across multiple monsters',
  'editor.type_selector.environment_desc':     'Terrain or environmental conditions granting modifiers',

  // ==========================================================================
  // CONTENT EDITOR — MAGIC DATA EDITOR (MagicDataEditor.svelte)
  // ==========================================================================
  'editor.magic.general_section':           'General',
  'editor.magic.magic_type_legend':         'Magic Type',
  'editor.magic.arcane_label':              'Arcane',
  'editor.magic.arcane_hint':               'INT/CHA based, ASF applies',
  'editor.magic.divine_label':              'Divine',
  'editor.magic.divine_hint':               'WIS based, no ASF',
  'editor.magic.psionic_label':             'Psionic',
  'editor.magic.psionic_hint':              'PP based, no verbal/somatic components',
   'editor.magic.school_label':              'School',
   'editor.magic.school_psionic_hint':       '(legacy display text — use Discipline below)',
   /** Placeholder for the psionic school input when type is psionic. */
   'editor.magic.school_psionic_placeholder':'e.g. clairsentience',
   'editor.magic.select_school':             '— Select school',
   'editor.magic.sub_school_label':          'Sub-school / Sub-discipline',
   /** Placeholder for the sub-school input field. */
   'editor.magic.sub_school_placeholder':    'e.g. summoning, calling, charm',
  'editor.magic.spell_components_legend':   'Spell Components',
  'editor.magic.comp_v_label':              'V — Verbal',
  'editor.magic.comp_v_hint':               'Requires incantation',
  'editor.magic.comp_s_label':              'S — Somatic',
  'editor.magic.comp_s_hint':               'Requires hand gestures',
  'editor.magic.comp_m_label':              'M — Material',
  'editor.magic.comp_m_hint':               'Requires a consumed or non-consumed component',
  'editor.magic.comp_f_label':              'F — Focus',
  'editor.magic.comp_f_hint':               'Non-consumed focus object (arcane)',
  'editor.magic.comp_df_label':             'DF — Divine Focus',
  'editor.magic.comp_df_hint':              'Holy symbol / sacred item (divine spells)',
  'editor.magic.comp_xp_label':             'XP — XP Cost',
  'editor.magic.comp_xp_hint':              'Consumes XP on casting',

  // ==========================================================================
  // CONTENT EDITOR — ACTIVATION EDITOR (ActivationEditor.svelte)
  // ==========================================================================
  'editor.activation.toggle_label':              'Has activation cost or action type',
  'editor.activation.toggle_hint':               'Enable for active abilities (Barbarian Rage, Turn Undead, charged items). Leave off for passive features (racial bonuses, permanent feat effects).',
  'editor.activation.action_type_label':         'Action Type',
  'editor.activation.trigger_event_label':       'Trigger Event',
  'editor.activation.trigger_event_hint':        '(describes what causes this ability to fire)',
  'editor.activation.resource_cost_legend':      'Resource Cost',
  'editor.activation.cost_none':                 'No cost',
  'editor.activation.cost_fixed':                'Fixed cost',
  'editor.activation.cost_tiered':               'Tiered costs',
  'editor.activation.resource_pool_id_label':    'Resource Pool ID',
  'editor.activation.click_to_pick_pool':        'Click to pick pool pipeline…',
  'editor.activation.click_to_pick_pool_title':  'Click to pick a resource pool pipeline',
   'editor.activation.cost_per_use_label':        'Cost per use',
   /** Placeholder for the cost per use formula input. */
   'editor.activation.cost_per_use_placeholder':  'e.g. 1, 2, @attributes.stat_charisma.derivedModifier',
   'editor.activation.action_standard_label':     'Standard Action',
  'editor.activation.action_standard_hint':      '1 per round — most activated abilities',
  'editor.activation.action_move_label':         'Move Action',
  'editor.activation.action_move_hint':          'e.g. guided movement, swift draw',
  'editor.activation.action_swift_label':        'Swift Action',
  'editor.activation.action_swift_hint':         '1 per round; minor in-combat abilities',
  'editor.activation.action_immediate_label':    'Immediate Action',
  'editor.activation.action_immediate_hint':     '1 per round; usable outside own turn',
  'editor.activation.action_free_label':         'Free Action',
  'editor.activation.action_free_hint':          'Effectively no action cost during round',
  'editor.activation.action_full_round_label':   'Full-Round Action',
  'editor.activation.action_full_round_hint':    'Consumes the entire turn',
  'editor.activation.action_minutes_label':      'Several Minutes',
  'editor.activation.action_minutes_hint':       'Non-combat ritual or extended activation',
  'editor.activation.action_hours_label':        'Hours',
  'editor.activation.action_hours_hint':         'Long ritual, item creation, etc.',
  'editor.activation.action_passive_label':      'Passive / Always-On',
  'editor.activation.action_passive_hint':       'No activation needed; ability is always active',
  'editor.activation.action_reaction_label':     'Reaction',
  'editor.activation.action_reaction_hint':      'Fires automatically on a trigger event',

  // ==========================================================================
  // CONTENT EDITOR — MODIFIER ROW (ModifierRow.svelte)
  // ==========================================================================
  'editor.modifier.edit_condition_title':        'Edit Condition',
  'editor.modifier.condition_sheet_time_desc':   'This condition is evaluated at sheet time. If it evaluates to false, this specific modifier is completely ignored (it does not contribute to the pipeline total).',
  /** {n} = 1-based modifier index */
  'editor.modifier.row_label':                   'Modifier #{n}',
  'editor.modifier.duplicate_title':             'Duplicate this modifier',
  'editor.modifier.duplicate_aria':              'Duplicate modifier {n}',
  'editor.modifier.delete_title':                'Delete this modifier',
  'editor.modifier.delete_aria':                 'Delete modifier {n}',
  'editor.modifier.target_pipeline_label':       'Target Pipeline',
  'editor.modifier.click_to_pick_pipeline':      'Click to pick…',
  'editor.modifier.click_to_pick_title':         'Click to pick a pipeline',
  'editor.modifier.change_pipeline_btn':         'Change',
  'editor.modifier.type_label':                  'Type',
  'editor.modifier.click_to_change_type_title':  'Click to change modifier type',
   'editor.modifier.value_label':                 'Value',
   /** Placeholder for the modifier value / formula input. */
   'editor.modifier.value_placeholder':           'e.g. 2, -1, @attributes.stat_strength.derivedModifier',
   'editor.modifier.situational_label':           'Situational Context',
   'editor.modifier.situational_hint':            '(optional — routes to situational modifiers, applied at roll time)',
   /** Placeholder for the situational context tag list input. */
   'editor.modifier.situational_placeholder':     'e.g. orc, flanking, vs_enchantment',
  'editor.modifier.condition_label':             'Condition (sheet-time gate)',
  'editor.modifier.condition_optional_hint':     '(optional — if false, modifier is ignored)',
  'editor.modifier.edit_condition_btn':          'Edit…',
  'editor.modifier.remove_condition_btn':        'Remove',
  'editor.modifier.remove_condition_aria':       'Remove condition',
  'editor.modifier.no_condition_label':          'No condition — always active.',
  'editor.modifier.add_condition_btn':           '+ Add Condition',
  'editor.modifier.dr_bypass_tags_label':        'DR Bypass Tags',
  'editor.modifier.dr_bypass_tags_hint':         '(e.g. silver, magic, cold_iron — empty = "DR X/—")',
  'editor.modifier.edit_dr_tags_btn':            'Edit Tags',
  /** {value} = the modifier's numeric value */
  'editor.modifier.no_dr_bypass_tags':           'No bypass tags — DR {value}/— (overcome by nothing).',
  'editor.modifier.source_summary':              'Source attribution (auto-filled from entity id/label)',
  'editor.modifier.source_id_label':             'Source ID',
  'editor.modifier.source_name_label':           'Source Name (EN)',
  'editor.modifier.stacks_badge':                'STACKS',
  'editor.modifier.special_badge':               'SPECIAL',
  'editor.modifier.best_wins_badge':             'BEST WINS',

  // ==========================================================================
  // CONTENT EDITOR — MODIFIER LIST EDITOR (ModifierListEditor.svelte)
  // ==========================================================================
  'editor.modifier_list.section_title':          'Modifiers',
  'editor.modifier_list.add_modifier_btn':       '+ Add Modifier',
  'editor.modifier_list.no_modifiers':           'No modifiers yet.',
  'editor.modifier_list.empty_hint':             'Click "+ Add Modifier" to add the first mechanical effect of this entity.',

  // ==========================================================================
  // CONTENT EDITOR — MODIFIER TYPE PICKER MODAL (ModifierTypePickerModal.svelte)
  // ==========================================================================
  'editor.modtype_picker.title':               'Pick Modifier Type',
  'editor.modtype_picker.stacking_hint':       '— stacking behaviour in the pipeline',
  'editor.modtype_picker.search_aria':         'Search modifier types',
  'editor.modtype_picker.search_placeholder':  'Search by name or description…',
  'editor.modtype_picker.no_match':            'No modifier types match "{query}".',
  'editor.modtype_picker.badge_always_stacks': 'ALWAYS STACKS',
  'editor.modtype_picker.badge_best_wins':     'BEST WINS',
  'editor.modtype_picker.badge_special':       'SPECIAL',
  // Modifier type labels:
  'editor.modtype.base.label':             'Base',
  'editor.modtype.base.tooltip':           'Foundational value accumulated by class levels (e.g. BAB progression, save totals). Multiple base modifiers stack freely — use for class progression tables and racial HD.',
  'editor.modtype.untyped.label':          'Untyped',
  'editor.modtype.untyped.tooltip':        'A bonus with no declared type — always stacks with everything. Use sparingly: stacking untyped bonuses quickly become unbalanced. Common for minor situational bonuses that have no SRD type.',
  'editor.modtype.dodge.label':            'Dodge',
  'editor.modtype.dodge.tooltip':          'Dodge bonuses to AC always stack with each other — SRD explicit exception. Use for the Dodge feat (+1 AC), Tumble-based dodge, and monk AC bonus.',
  'editor.modtype.circumstance.label':     'Circumstance',
  'editor.modtype.circumstance.tooltip':   'Circumstance bonuses (and penalties) always stack. Use for situational modifiers: flanking, higher ground, aid-another, or environmental obstacles.',
  'editor.modtype.synergy.label':          'Synergy',
  'editor.modtype.synergy.tooltip':        '5-rank skill-synergy bonus — always stacks with all other bonus types. Example: 5 ranks in Tumble grant a +2 synergy bonus to Balance.',
  'editor.modtype.multiplier.label':       'Multiplier',
  'editor.modtype.multiplier.tooltip':     'Multiplicative factor applied AFTER all additive modifiers are summed. Use for effects like "double Strength to damage" or "half speed". Multiple multipliers stack multiplicatively.',
  'editor.modtype.enhancement.label':      'Enhancement',
  'editor.modtype.enhancement.tooltip':    'Magic enhancement bonus to an item or natural attribute. Only the highest enhancement bonus applies. A +3 weapon and a +1 Bull\'s Strength cannot both give an enhancement bonus to STR.',
  'editor.modtype.armor.label':            'Armor',
  'editor.modtype.armor.tooltip':          'Armour bonus to AC granted by wearing physical armour. Only the highest armor bonus applies (you cannot benefit from two suits of armour).',
  'editor.modtype.shield.label':           'Shield',
  'editor.modtype.shield.tooltip':         'Shield bonus to AC from wielding a shield. Highest shield bonus wins — you cannot stack a buckler with a tower shield.',
  'editor.modtype.natural_armor.label':    'Natural Armor',
  'editor.modtype.natural_armor.tooltip':  'Natural armour bonus (thick hide, carapace, Barkskin spell). Only the highest natural armor bonus applies. Barkskin does not stack with a creature\'s existing natural armor.',
  'editor.modtype.deflection.label':       'Deflection',
  'editor.modtype.deflection.tooltip':     'Deflection bonus to AC from magical force effects. Highest wins — a Ring of Protection +3 and Shield of Faith +2 do not stack.',
  'editor.modtype.morale.label':           'Morale',
  'editor.modtype.morale.tooltip':         'Morale bonus from courage, bardic inspiration, or spells like Heroism. Only the highest morale bonus applies — Heroism and Good Hope do not stack.',
  'editor.modtype.luck.label':             'Luck',
  'editor.modtype.luck.tooltip':           'Luck bonus from divine sources (Divine Favor, Prayer). Highest luck bonus wins — a Cloak of Luck and Divine Favor do not stack on the same roll.',
  'editor.modtype.insight.label':          'Insight',
  'editor.modtype.insight.tooltip':        'Insight bonus to checks, representing knowledge or foresight (Guidance spell). Only the highest insight bonus applies.',
  'editor.modtype.sacred.label':           'Sacred',
  'editor.modtype.sacred.tooltip':         'Sacred bonus from holy magic (Bless, Consecrate, divine domains). Only the highest sacred bonus applies to any single statistic.',
  'editor.modtype.profane.label':          'Profane',
  'editor.modtype.profane.tooltip':        'Profane bonus or penalty from unholy/dark magic (Desecrate, Death Knell). Only the highest (or most severe) profane modifier applies per statistic.',
  'editor.modtype.racial.label':           'Racial',
  'editor.modtype.racial.tooltip':         'Racial trait bonus inherent to the creature\'s lineage. Only the highest racial bonus applies per statistic. Do not use for template abilities — use "untyped" or "enhancement" instead.',
  'editor.modtype.competence.label':       'Competence',
  'editor.modtype.competence.tooltip':     'Competence bonus to skills and checks (Guidance, masterwork tools). Only the highest competence bonus to the same check applies.',
  'editor.modtype.size.label':             'Size',
  'editor.modtype.size.tooltip':           'Size modifier to attack rolls and AC (small creatures get +1, large −1). Only one size modifier applies — size category is always singular.',
  'editor.modtype.inherent.label':         'Inherent',
  'editor.modtype.inherent.tooltip':       'Permanent inherent bonus from Tomes, Manuals, Wish, or Miracle. Highest inherent bonus wins (max +5 to any ability score per SRD). Stacks with enhancement and all other types.',
  'editor.modtype.resistance.label':       'Resistance',
  'editor.modtype.resistance.tooltip':     'Resistance bonus to saving throws (Cloak of Resistance, Resistance spell). Only the highest resistance bonus to the same save applies.',
  'editor.modtype.setAbsolute.label':      'Set Absolute',
  'editor.modtype.setAbsolute.tooltip':    'Forces the pipeline to an exact value, overriding all other modifiers. Last-in-chain wins. Use for Undead (CON = 0), Shapechange (stat set to animal form), or GM fiat ("set HP to exactly 200").',
  'editor.modtype.damage_reduction.label':   'Damage Reduction',
  'editor.modtype.damage_reduction.tooltip': 'D&D 3.5 DR — best-wins per bypass-tag group. Use for racial/innate/template DR; set drBypassTags to the bypass material. For class-progression DR that adds incrementally, use "base" instead.',
  'editor.modtype.max_dex_cap.label':      'Max DEX Cap',
  'editor.modtype.max_dex_cap.tooltip':    'Sets a maximum DEX-to-AC cap imposed by armor or conditions. Multiple caps compete with MINIMUM-WINS semantics (most restrictive wins). Meaningful only on the combatStats.max_dexterity_bonus pipeline.',

  // ==========================================================================
  // CONTENT EDITOR — PIPELINE PICKER MODAL (PipelinePickerModal.svelte)
  // ==========================================================================
  'editor.pipeline_picker.title':                'Pick a Pipeline',
  'editor.pipeline_picker.search_aria':          'Search pipelines',
  'editor.pipeline_picker.search_placeholder':   'Search by ID or label…',
  'editor.pipeline_picker.col_pipeline_id':      'Pipeline ID',
  'editor.pipeline_picker.col_label':            'Label',
  'editor.pipeline_picker.col_base_value':       'Default base value',
  'editor.pipeline_picker.select_pipeline_aria': 'Select pipeline {id}',
  'editor.pipeline_picker.skills_section':       'Skills',
  'editor.pipeline_picker.skills_load_hint':     'Skills load automatically from rule sources. Enable a rule source in Campaign Settings to populate this list.',
  'editor.pipeline_picker.col_skill_name':       'Skill Name',
  'editor.pipeline_picker.col_base':             'Base',
  'editor.pipeline_picker.custom_section_title': 'Custom Pipeline ID',
  'editor.pipeline_picker.custom_section_desc':  'For homebrew pipelines not listed above (e.g. resources.shadow_points). Enter the exact ID as it appears in your rule source JSON.',
  'editor.pipeline_picker.custom_id_aria':       'Custom pipeline ID',
  'editor.pipeline_picker.use_this_id_btn':      'Use this ID',
  'editor.pipeline_picker.invalid_id_error':     'Pipeline IDs cannot contain spaces or start with "@".',
  /** Placeholder for the custom pipeline ID input field. */
  'editor.pipeline_picker.custom_id_placeholder': 'e.g. resources.shadow_points',

  // ==========================================================================
  // CONTENT EDITOR — ENTITY FORM (EntityForm.svelte)
  // ==========================================================================
  'editor.form.override_warning_title':          'Override Warning',
  /** {id} = entity ID */
  'editor.form.override_warning_desc':           'The ID {id} already exists in a loaded rule source. This entity will override the existing one for this campaign. Use merge: "partial" to extend it additively.',
  'editor.form.prerequisites_label':             'Prerequisites / Activation Condition',
  'editor.form.prerequisites_hint':              '(logic tree — feat chain, ability prereqs)',
  'editor.form.validation_id_required':          'Entity ID is required.',
  'editor.form.validation_category_required':    'Category is required.',
  'editor.form.save_failed':                     'Save failed.',
  'editor.form.saved_successfully':              'Saved successfully.',
  'editor.form.creating_entity':                 'Creating new entity',
  'editor.form.editing_entity':                  'Editing entity',
  'editor.form.saving_spinner':                  'Saving…',
  'editor.form.create_entity_btn':               'Create Entity',
  'editor.form.save_changes_btn':                'Save Changes',

  // ==========================================================================
  // CONTENT EDITOR — CHOICES EDITOR (ChoicesEditor.svelte)
  // ==========================================================================
  'editor.choices.section_title':              'Player Choices',
  'editor.choices.section_hint':               'Prompts shown to the player when they add this entity to their character. Selections are stored in ActiveFeatureInstance.selections and referenced via @selection.<choiceId>.',
  'editor.choices.add_choice_btn':             '+ Add Choice',
  'editor.choices.no_choices':                 'No choices defined.',
  'editor.choices.no_choices_hint':            'Add a choice for feats like Weapon Focus (weapon type) or Cleric domains.',
  /** {n} = 1-based choice index */
  'editor.choices.entry_label':                'Choice #{n}',
  /** {n} = 1-based choice index */
  'editor.choices.delete_title':               'Delete choice #{n}',
  /** {n} = 1-based choice index */
  'editor.choices.delete_aria':                'Delete choice {n}',
  'editor.choices.choice_id_label':            'Choice ID',
  /** {id} = choiceId value */
  'editor.choices.choice_id_ref':              'Referenced as @selection.{id} in modifier conditions.',
  'editor.choices.max_selections_label':       'Max Selections',
  'editor.choices.max_selections_hint':        'Usually 1. Use 2+ for "choose N domains", "choose N feats", etc.',
  'editor.choices.label_en_label':             'Label (English)',
  'editor.choices.label_fr_label':             'Label (Français)',
  'editor.choices.options_query_label':        'Options Query',
  'editor.choices.test_query_btn':             'Test Query',
  'editor.choices.test_query_title':           'Run this query against the current DataLoader cache',
  'editor.choices.syntax_tag_hint':            'features with that tag',
  'editor.choices.syntax_category_hint':       'features of that category',
  'editor.choices.syntax_intersection_hint':   'must match all parts (AND)',
  'editor.choices.zero_matches_label':         '0 matches',
  'editor.choices.zero_matches_desc':          'No features match this query in the current DataLoader cache. Check that the rule sources containing the target features are enabled.',
  /** {n} = match count, {s} = '' or 's' */
  'editor.choices.matches_label':              '{n} feature{s} match',
  'editor.choices.sample_label':               'Sample: ',
  'editor.choices.prefix_label':               'Choice Granted Tag Prefix',
  'editor.choices.prefix_optional':            '(optional)',
  'editor.choices.prefix_engine_hint':         'When set, the engine emits <prefix><selectedId> as an active tag for each selection.',
  'editor.choices.prefix_convention_hint':     'Needed for parameterized prerequisites (Weapon Focus (X), Spell Focus (school)). Convention: end with _ and mirror this feat\'s ID.',
  /** Appended to the sample list when more results exist. {n} = overflow count. */
   'editor.choices.sample_more':                '+{n} more…',
   /** Placeholder for the choice ID input field. */
   'editor.choices.choice_id_placeholder':       'e.g. weapon_choice, domain_1',
   /** Placeholder for the options query filter input. */
   'editor.choices.query_filter_placeholder':    'e.g. tag:weapon  or  category:domain  or  tag:weapon+tag:martial',
   /** Placeholder for the choice granted tag prefix input. */
   'editor.choices.prefix_placeholder':          'e.g. feat_weapon_focus_',

  // ==========================================================================
  // CONTENT EDITOR — LEVEL PROGRESSION EDITOR (LevelProgressionEditor.svelte)
  // ==========================================================================
  'editor.level_prog.section_title':           'Level Progression',
  'editor.level_prog.section_hint':            'Defines what each class level grants. BAB and save values are increments accumulated by the engine — not totals.',
  'editor.level_prog.fill_column_hint':        'Fill entire column with preset:',
  'editor.level_prog.bab_prefix':              'BAB:',
  'editor.level_prog.save_prefix':             'Fort / Ref / Will:',
  'editor.level_prog.full_bab_btn':            'Full BAB',
  'editor.level_prog.full_bab_title':          'BAB = +1 every level',
  'editor.level_prog.3_4_bab_btn':             '¾ BAB',
  'editor.level_prog.3_4_bab_title':           'BAB = floor(level × 3/4)',
  'editor.level_prog.1_2_bab_btn':             '½ BAB',
  'editor.level_prog.1_2_bab_title':           'BAB = floor(level / 2)',
  'editor.level_prog.good_save_btn':           'Good Save',
  'editor.level_prog.good_save_title':         'Good Save = 2 + floor(level / 2). Prompts for Fort, Ref, or Will.',
  'editor.level_prog.poor_save_btn':           'Poor Save',
  'editor.level_prog.poor_save_title':         'Poor Save = floor(level / 3). Prompts for Fort, Ref, or Will.',
  'editor.level_prog.quick_fill_label':        'Quick fill:',
  'editor.level_prog.good_save_prompt':        'Apply Good Save to which save? Enter: fort, ref, or will',
  'editor.level_prog.poor_save_prompt':        'Apply Poor Save to which save? Enter: fort, ref, or will',
  'editor.level_prog.col_lvl':                 'Lvl',
  'editor.level_prog.col_bab':                 'BAB',
  'editor.level_prog.col_fort':                'Fort',
  'editor.level_prog.col_ref':                 'Ref',
  'editor.level_prog.col_will':                'Will',
  'editor.level_prog.col_features':            'Features granted',
  'editor.level_prog.col_modifiers':           'Modifiers',
  /** {n} = level number */
  'editor.level_prog.bab_aria':                'BAB increment at level {n}',
  'editor.level_prog.fort_aria':               'Fortitude increment at level {n}',
  'editor.level_prog.ref_aria':                'Reflex increment at level {n}',
  'editor.level_prog.will_aria':               'Will increment at level {n}',
  'editor.level_prog.remove_feature_aria':     'Remove {id} from level {n}',
  'editor.level_prog.add_feature_title':       'Add feature at level {n}',
  /**
   * Single-word abbreviations accepted as input in the save-preset prompt.
   * Must match exactly what the corresponding good/poor save prompt strings
   * instruct the user to type.  Keep these lower-case.
   * EN: 'fort' / 'ref' / 'will'
   * FR: 'vig'  / 'refl' / 'vol'   (see editor.level_prog.good_save_prompt in fr.json)
   */
  'editor.level_prog.input_fort': 'fort',
  'editor.level_prog.input_ref':  'ref',
  'editor.level_prog.input_will': 'will',

  // ==========================================================================
  // CONTENT EDITOR — RACE / CLASS EXTRAS EDITOR (RaceClassExtrasEditor.svelte)
  // ==========================================================================
  'editor.race_class.race_section_title':        'Race Extras',
  'editor.race_class.race_section_hint':         'Fields specific to category: "race" entities.',
  'editor.race_class.class_section_title':       'Class Extras',
  'editor.race_class.class_section_hint':        'Fields specific to category: "class" entities.',
  'editor.race_class.recommended_attrs_legend':  'Recommended Attributes',
  'editor.race_class.recommended_attrs_hint':    '(cosmetic UX guidance for Point Buy — no mechanical effect)',
  'editor.race_class.recommended_attrs_hint2':   '(cosmetic UX hint — no mechanical effect)',
  'editor.race_class.race_attrs_desc':           'Checked stats are highlighted green in the Point Buy UI during character creation. Example: Fighter → STR, CON, DEX; Wizard → INT, DEX, CON.',
  'editor.race_class.race_class_skills_label':   'Class Skills',
  'editor.race_class.race_class_skills_hint':    '(optional — racial bonus class skills)',
  'editor.race_class.no_racial_class_skills':    'No racial class skills.',
  'editor.race_class.add_class_skill_aria':      'Add class skill',
  'editor.race_class.load_skills_hint':          'Load rule sources to populate the skill list.',
  'editor.race_class.class_skills_hint':         'Skills on this list cost ×1 SP per rank for characters in this class. All other skills cost ×2 SP (cross-class).',
  'editor.race_class.no_class_skills':           'No class skills defined.',
  /** {n} = total skill count */
  'editor.race_class.add_all_skills_btn':        '+ Add all {n} skills',
  'editor.race_class.add_all_skills_title':      'Add all {n} skills as class skills (for Rogue-style all-class-skills)',
  'editor.race_class.select_skill_placeholder':  '— Select a skill to add',
  'editor.race_class.hit_die_label':             'Hit Die',
  'editor.race_class.hit_die_hint':              'Stored as a base modifier on combatStats.max_hp. Each class level rolls this die to determine HP gained. D&D 3.5 standard: d6/d8/d10/d12 for most classes.',
  'editor.race_class.sp_per_level_label':        'Skill Points per Level',
  'editor.race_class.sp_before_int_hint':        '(before INT modifier)',
  'editor.race_class.sp_per_level_hint':         'Stored as a base modifier on attributes.skill_points_per_level. Actual SP/lvl = max(1, this value + INT modifier). SRD convention: 2/4/6/8 (×4 at level 1).',
  'editor.race_class.remove_skill_aria':         'Remove {id}',
  'editor.race_class.remove_class_skill_aria':   'Remove {id} from class skills',

  // ==========================================================================
  // CONTENT EDITOR — ITEM DATA EDITOR (ItemDataEditor.svelte)
  // ==========================================================================
  'editor.item.general_section':               'General',
  'editor.item.slot_label':                    'Equipment Slot',
  'editor.item.weight_label':                  'Weight (lb.)',
  'editor.item.cost_label':                    'Cost (gp)',
   'editor.item.hardness_label':                'Hardness',
   /** Placeholder for the Hardness numeric input. */
   'editor.item.hardness_placeholder':          'e.g. 5',
   'editor.item.hp_max_label':                  'Item HP Max',
   /** Placeholder for the Item HP Max numeric input. */
   'editor.item.hp_max_placeholder':            'e.g. 20',
  'editor.item.unique_label':                  'Unique item',
  'editor.item.unique_hint':                   '(adds tag unique; prevents duplicate equipping)',
  'editor.item.artifact_tier_label':           'Artifact Tier',
  'editor.item.artifact_tier_hint':            '(optional — leave blank for non-artifacts)',
  'editor.item.consumable_section':            'Consumable (potion, oil, single-use scroll)',
  'editor.item.consumable_hint':               'When the player uses this item, it is consumed (removed from inventory) and its grantedModifiers become active as an ephemeral effect the player can expire manually.',
   'editor.item.duration_hint_label':           'Duration Hint',
   'editor.item.duration_hint_optional':        '(optional — purely cosmetic)',
   /** Placeholder for the consumable item duration hint input. */
   'editor.item.duration_placeholder':          'e.g. 3 min, 10 rounds, 1 hour',
  'editor.item.consumable_empty':              'Enable for potions, oils, and single-use scrolls that are destroyed on use. Charged items (wands, rods, rings) use Resource Pools instead — they are not consumed.',
  'editor.item.slot_none_option':              '— (none / carry in inventory)',
  'editor.item.slot_head':                     'Head',
  'editor.item.slot_eyes':                     'Eyes',
  'editor.item.slot_neck':                     'Neck',
  'editor.item.slot_torso':                    'Torso',
  'editor.item.slot_body':                     'Body',
  'editor.item.slot_waist':                    'Waist',
  'editor.item.slot_shoulders':                'Shoulders',
  'editor.item.slot_arms':                     'Arms / Bracers',
  'editor.item.slot_hands':                    'Hands / Gloves',
  'editor.item.slot_ring':                     'Ring (x2 by default)',
  'editor.item.slot_feet':                     'Feet / Boots',
  'editor.item.slot_main_hand':                'Main Hand (weapon / shield)',
  'editor.item.slot_off_hand':                 'Off Hand (weapon / shield)',
  'editor.item.slot_two_hands':                'Two Hands (requires both)',
  'editor.item.slot_none':                     'None — unslotted item (can carry many)',
  'editor.item.artifact_not_artifact':         '— Not an artifact',
  'editor.item.artifact_minor':                'Minor Artifact',
  'editor.item.artifact_major':                'Major Artifact',

  // ==========================================================================
  // CONTENT EDITOR — WEAPON FIELDS EDITOR (WeaponFieldsEditor.svelte)
  // ==========================================================================
  'editor.weapon.section_label':               'Weapon Data',
  'editor.weapon.wield_label':                 'Wield Category',
  'editor.weapon.damage_dice_label':           'Damage Dice',
  'editor.weapon.damage_types_label':          'Damage Types',
  'editor.weapon.no_damage_types':             'No damage types.',
  'editor.weapon.crit_range_label':            'Crit Range',
  'editor.weapon.crit_mult_label':             'Crit Multiplier (×)',
  'editor.weapon.reach_label':                 'Reach (ft.)',
  'editor.weapon.range_increment_label':       'Range Increment (ft.)',
  'editor.weapon.range_ranged_hint':           '— ranged only',
  'editor.weapon.secondary_weapon_section':    'Secondary Weapon End (double weapons)',
  'editor.weapon.on_crit_section':             'On-Crit Bonus Dice (Burst weapons: Flaming Burst, Thundering, etc.)',
  'editor.weapon.on_crit_dice_label':          'Dice Formula (×2 baseline)',
  'editor.weapon.on_crit_type_label':          'Damage Type',
  'editor.weapon.on_crit_scales_label':        'Scales with crit multiplier (×2→+1d, ×3→+2d, ×4→+3d)',
  'editor.weapon.empty_hint':                  'Enable the checkbox above to add weapon statistics to this item.',
  'editor.weapon.wield_light_label':           'Light',
  'editor.weapon.wield_light_hint':            'One-handed; off-hand without penalty',
  'editor.weapon.wield_one_handed_label':      'One-Handed',
  'editor.weapon.wield_one_handed_hint':       'Standard grip; 1.5× STR when 2-handed',
  'editor.weapon.wield_two_handed_label':      'Two-Handed',
  'editor.weapon.wield_two_handed_hint':       'Always requires both hands',
  'editor.weapon.wield_double_label':          'Double',
  'editor.weapon.wield_double_hint':           'Two attack ends (quarterstaff, dire flail)',

  // ==========================================================================
  // CONTENT EDITOR — ARMOR FIELDS EDITOR (ArmorFieldsEditor.svelte)
  // ==========================================================================
  /** Tooltip for the ACP input in ArmorFieldsEditor explaining sign convention. */
  'editor.armor.acp_sign_hint':                'Enter as a negative number (e.g. -6) or a positive number (stored as-is)',
  'editor.armor.section_label':                'Armor / Shield Data',

  // ==========================================================================
  // CONTENT EDITOR — ADDITIONAL PLACEHOLDERS
  // ==========================================================================
  'editor.weapon.damage_dice_placeholder':     'e.g. 1d8',
  'editor.weapon.crit_range_placeholder':      'e.g. 20 or 19-20',
  'editor.weapon.range_melee_hint':            'blank = melee',
  'editor.weapon.on_crit_type_placeholder':    'e.g. fire, cold, sonic',
  'editor.core.label_en_placeholder':          'e.g. Power Attack',
  'editor.core.label_fr_placeholder':          'ex. Attaque en puissance',
  'editor.cursed.prevention_note_placeholder': 'e.g. Remains clasped even after death.',
  'editor.activation.trigger_event_placeholder': 'e.g. When targeted by an attack',
  'editor.condition.value_placeholder':        'value',
  'editor.condition.error_msg_placeholder':    'e.g. Requires stat_strength 13+',
  'editor.armor.armor_bonus_label':            'Armor Bonus',
  'editor.armor.max_dex_label':                'Max DEX Bonus',
  'editor.armor.no_cap_hint':                  'blank = no cap',
  'editor.armor.acp_label':                    'Armor Check Penalty',
  'editor.armor.asf_label':                    'Arcane Spell Failure (%)',
  'editor.armor.empty_hint':                   'Enable for armour, shields, and items that apply an armor or shield bonus to AC.',

  // ==========================================================================
  // CONTENT EDITOR — CHARGED ITEMS EDITOR (ChargedItemsEditor.svelte)
  // Accessible labels for remove-spell buttons. {n} = 1-based entry index.
  'editor.charged.remove_staff_spell_aria':  'Remove staff spell {n}',
  'editor.charged.remove_scroll_spell_aria': 'Remove scroll spell {n}',
  // ==========================================================================
  // CONTENT EDITOR — CHARGED ITEMS EDITOR (ChargedItemsEditor.svelte)
  // ==========================================================================
  'editor.charged.section_label':              'Charged Items (Wand / Staff / Scroll / Metamagic Rod)',
  'editor.charged.wand_label':                 'Wand (single spell, fixed CL)',
  'editor.charged.wand_spell_label':           'Spell',
  'editor.charged.wand_caster_level_label':    'Caster Level',
  'editor.charged.wand_spell_level_label':     'Spell Level override',
  'editor.charged.wand_heightened_hint':       '(heightened only)',
  'editor.charged.wand_spell_level_placeholder': 'blank = base level',
  'editor.charged.wand_click_to_pick':         'Click to pick spell…',
  'editor.charged.staff_label':                'Staff (multiple spells, wielder CL, charge-based)',
  'editor.charged.charges_label':              'Charges',
  'editor.charged.add_spell_btn':              '+ Add Spell',
  'editor.charged.pick_spell_btn':             'Pick spell…',
  'editor.charged.scroll_label':               'Scroll (spell array, fixed CL per entry, arcane/divine type)',
  'editor.charged.scroll_spell_label':         'Spell',
  'editor.charged.scroll_cl_label':            'CL',
  'editor.charged.scroll_spell_lvl_label':     'Spell Lvl',
  'editor.charged.scroll_type_label':          'Type',
  'editor.charged.arcane_option':              'Arcane',
  'editor.charged.divine_option':              'Divine',
  'editor.charged.rod_label':                  'Metamagic Rod (grants a metamagic feat at no slot cost, 3/day)',
  'editor.charged.rod_feat_label':             'Metamagic Feat',
  'editor.charged.rod_max_spell_level':        'Max Spell Level',
  'editor.charged.rod_lesser':                 'Lesser (3rd)',
  'editor.charged.rod_normal':                 'Normal (6th)',
  'editor.charged.rod_greater':                'Greater (9th)',
  'editor.charged.feat_empower':               'Empower Spell',
  'editor.charged.feat_empower_hint':          'All variable numeric effects ×1.5',
  'editor.charged.feat_enlarge':               'Enlarge Spell',
  'editor.charged.feat_enlarge_hint':          'Doubles range',
  'editor.charged.feat_extend':                'Extend Spell',
  'editor.charged.feat_extend_hint':           'Doubles duration',
  'editor.charged.feat_maximize':              'Maximize Spell',
  'editor.charged.feat_maximize_hint':         'All variable effects are maximum',
  'editor.charged.feat_quicken':               'Quicken Spell',
  'editor.charged.feat_quicken_hint':          'Free-action casting (once/round)',
  'editor.charged.feat_silent':                'Silent Spell',
  'editor.charged.feat_silent_hint':           'No verbal component required',

  // ==========================================================================
  // CONTENT EDITOR — CONDITION NODE BUILDER (ConditionNodeBuilder.svelte)
  // ==========================================================================
  'editor.condition.no_conditions':            'No conditions.',
  'editor.condition.add_condition_btn':        '+ Add Condition',
  'editor.condition.add_group_btn':            '+ Add Group ▾',
  'editor.condition.and_all_of':               'AND — All of these',
  'editor.condition.or_any_of':               'OR — Any of these',
  'editor.condition.max_depth_reached':        'Max depth reached',
  'editor.condition.max_depth_title':          'Maximum nesting depth reached. Use the Raw JSON panel to add deeper groups.',
  'editor.condition.all_of_and_label':         'All of these (AND)',
  'editor.condition.any_of_or_label':          'Any of these (OR)',
  'editor.condition.toggle_and_or_title':      'Click to toggle between AND and OR',
  'editor.condition.not_none_of':              'NOT — None of these',
  /** {type} = AND or OR */
  'editor.condition.delete_group_title':       'Delete this {type} group',
  'editor.condition.delete_group_aria':        'Delete {type} group',
  'editor.condition.delete_not_title':         'Delete NOT group',
  'editor.condition.delete_not_aria':          'Delete NOT group',
  'editor.condition.move_up_title':            'Move up',
  'editor.condition.move_up_aria':             'Move condition up',
  'editor.condition.move_down_title':          'Move down',
  'editor.condition.move_down_aria':           'Move condition down',
   'editor.condition.target_path_label':        'Target path',
   /** Placeholder for the target path input — shows a typical @-path example. */
   'editor.condition.target_path_placeholder':  '@activeTags',
   'editor.condition.operator_label':           'Operator',
  'editor.condition.value_label':              'Value',
  'editor.condition.click_to_pick_tag':        'Click to pick a tag…',
  'editor.condition.click_to_pick_tag_title':  'Click to open tag picker',
  'editor.condition.error_message_label':      'Error message',
  'editor.condition.delete_condition_title':   'Delete this condition',
  'editor.condition.delete_condition_aria':    'Delete condition',
  'editor.condition.op_equals':                'equals',
  'editor.condition.op_not_equals':            'does not equal',
  'editor.condition.op_at_least':              'is at least',
  'editor.condition.op_at_most':               'is at most',
  'editor.condition.op_includes':              'includes',
  'editor.condition.op_not_includes':          'does not include',
  'editor.condition.op_has_tag':               'has tag',
  'editor.condition.op_missing_tag':           'missing tag',

  // ==========================================================================
  // CONTENT EDITOR — ACTION BUDGET EDITOR (ActionBudgetEditor.svelte)
  // ==========================================================================
  'editor.action_budget.section_title':        'Action Budget',
  'editor.action_budget.clear_all_btn':        'Clear all',
  'editor.action_budget.section_hint':         'Restricts the number of each action type per round while this feature is active. Leave blank for no restriction (unlimited). Use 0 to block an action type entirely. Primarily used on Conditions and spell effects.',
  'editor.action_budget.srd_presets':          'SRD presets:',
  'editor.action_budget.blocked_label':        'blocked',
  /** {n} = the current max value */
  'editor.action_budget.max_label':            'max {n}',
  'editor.action_budget.current_budget':       'Current budget:',
  'editor.action_budget.standard_label':       'Standard',
  'editor.action_budget.standard_hint':        'Attack, cast a spell, use a special ability',
  'editor.action_budget.move_label':           'Move',
  'editor.action_budget.move_hint':            'Move up to speed, draw weapon, stand up from prone',
  'editor.action_budget.swift_label':          'Swift',
  'editor.action_budget.swift_hint':           'Once per turn; some class abilities',
  'editor.action_budget.immediate_label':      'Immediate',
  'editor.action_budget.immediate_hint':       'Once per round; usable outside own turn (expensive)',
  'editor.action_budget.free_label':           'Free',
  'editor.action_budget.free_hint':            'Drop item, speak a few words, release a held spell',
  'editor.action_budget.full_round_label':     'Full-Round',
  'editor.action_budget.full_round_hint':      'Full attack, charge, run, coup de grâce, etc.',
  'editor.action_budget.preset_staggered_label':    'Staggered',
  'editor.action_budget.preset_staggered_desc':     'One standard OR one move per round (not both); full-round blocked.',
  'editor.action_budget.preset_nauseated_label':    'Nauseated',
  'editor.action_budget.preset_nauseated_desc':     'Only a single move action; everything else blocked.',
  'editor.action_budget.preset_stunned_label':      'Stunned',
  'editor.action_budget.preset_stunned_desc':       'Cannot take any actions of any type.',
   'editor.action_budget.preset_paralyzed_label':    'Paralyzed',
   'editor.action_budget.preset_paralyzed_desc':     'Cannot move or act; mental-only (free) actions are implicitly allowed.',
   /** Appended to the input title tooltip: explains blank vs. 0. */
   'editor.action_budget.input_title_suffix':        'Blank = unlimited. 0 = blocked.',
   /** Full aria-label for a budget input field. {label} = field label, {hint} = hint text. */
   'editor.action_budget.input_aria_label':          '{label} action budget. {hint}. Blank means unlimited, 0 means blocked.',

  // ==========================================================================
  // CONTENT EDITOR — TIERED COSTS EDITOR (TieredCostsEditor.svelte)
  // ==========================================================================
  'editor.tiered_costs.intro':                 'Each tier offers a different power level at a different charge cost. The player chooses a tier at activation time.',
  /** {n} = 1-based tier index */
  'editor.tiered_costs.tier_label':            'Tier {n}',
  'editor.tiered_costs.delete_aria':           'Delete tier {n}',
  'editor.tiered_costs.label_en':              'Label (EN)',
  'editor.tiered_costs.label_fr':              'Label (FR)',
  'editor.tiered_costs.pool_id_label':         'Pool ID',
  'editor.tiered_costs.charge_cost_label':     'Charge cost',
  'editor.tiered_costs.no_modifiers':          'No transient modifiers.',
  'editor.tiered_costs.edit_modifiers_btn':    'Edit modifiers',
  'editor.tiered_costs.add_modifiers_btn':     '+ Add modifiers',
  'editor.tiered_costs.add_tier_btn':          '+ Add Tier',
   /** Placeholder for EN tier label input. */
   'editor.tiered_costs.label_en_placeholder':  'e.g. 2 Charges: 2d6 damage',
   /** Placeholder for FR tier label input. */
   'editor.tiered_costs.label_fr_placeholder':  'ex. 2 Charges : 2d6 dégâts',
   /** Placeholder for the tier pool ID input. */
   'editor.tiered_costs.pool_id_placeholder':   'e.g. charges',
   /** Placeholder for the tier charge cost formula input. */
   'editor.tiered_costs.cost_placeholder':      'e.g. 1, 2, 3',

  // ==========================================================================
  // CONTENT EDITOR — GRANTED FEATURES EDITOR (GrantedFeaturesEditor.svelte)
  // ==========================================================================
  'editor.granted_features.section_title':     'Granted Features',
  'editor.granted_features.section_hint':      'Sub-features automatically activated for every character that has this entity.',
  'editor.granted_features.add_feature_btn':   '+ Add Feature',
  'editor.granted_features.partial_merge_hint':'Partial merge mode: Use the "Remove on merge" toggle (−) on any chip to instruct the Merge Engine to remove that feature from the base entity\'s grantedFeatures list.',
  'editor.granted_features.no_features':       'No granted features. Click "+ Add Feature" to select sub-features.',
  /** {id} = feature ID */
  'editor.granted_features.preview_title':     'Preview {id}',
  'editor.granted_features.cancel_removal':    'Click to keep this feature (remove the deletion marker)',
  'editor.granted_features.mark_removal':      'Mark for removal on merge (prepends "-" prefix)',
  'editor.granted_features.cancel_removal_aria': 'Cancel removal',
  'editor.granted_features.mark_removal_aria': 'Mark for removal on merge',
  'editor.granted_features.remove_aria':       'Remove {id} from granted features',

  // ==========================================================================
  // CONTENT EDITOR — SPELL LISTS SECTION (SpellListsSection.svelte)
  // ==========================================================================
  'editor.spell_lists.section_label':          'Spell Lists (Class → Level)',
  'editor.spell_lists.section_hint':           'Defines which class spell lists include this spell and at what level. For psionic powers, list the manifester classes (Psion, Wilder, etc.) and the power level.',
  'editor.spell_lists.no_spell_lists':         'No spell lists assigned.',
  'editor.spell_lists.col_class':              'Class',
  'editor.spell_lists.col_level':              'Level',
  /** {id} = class ID */
  'editor.spell_lists.spell_level_aria':       'Spell level for {id}',
  'editor.spell_lists.remove_aria':            'Remove {id}',
  'editor.spell_lists.add_class_btn':          '+ Add Class',

  // ==========================================================================
  // CONTENT EDITOR — RAW JSON PANEL (RawJsonPanel.svelte)
  // ==========================================================================
  'editor.raw_json.section_title':             'Raw JSON',
  'editor.raw_json.editing_hint':              '(editing — will sync on pause)',
  'editor.raw_json.prettify_btn':              'Prettify',
  'editor.raw_json.minify_btn':                'Minify',
  'editor.raw_json.copy_btn':                  'Copy to Clipboard',
  'editor.raw_json.copied_btn':                'Copied!',
  /** {n} = character count */
  'editor.raw_json.char_count':                '{n} chars',
  'editor.raw_json.parse_error_prefix':        'JSON parse error:',
  'editor.raw_json.parse_error_suffix':        ' — form state unchanged.',
  'editor.raw_json.json_editor_aria':          'Raw JSON editor',
  'editor.raw_json.auto_parse_hint':           'Changes are parsed automatically 300 ms after you stop typing. Valid JSON objects replace the form state; invalid JSON shows an error without affecting the form.',
  'editor.raw_json.must_be_object_error':      'Root value must be a JSON object (a Feature).',

  // ==========================================================================
  // CONTENT EDITOR — CURSED ITEM EDITOR (CursedItemEditor.svelte)
  // ==========================================================================
  'editor.cursed.section_label':               'Cursed (cannot be voluntarily removed)',
  'editor.cursed.removable_by_label':          'Removable By (tags)',
  'editor.cursed.nothing_removes':             'Nothing — cannot be removed by any means.',
  'editor.cursed.srd_methods_hint':            'SRD methods: remove_curse, limited_wish, wish, miracle',
  'editor.cursed.prevention_note_label':       'Prevention Note',
  'editor.cursed.prevention_note_hint':        '(optional flavour text)',
  'editor.cursed.empty_hint':                  'Enable for items that cannot be voluntarily unequipped (Necklace of Strangulation, etc.).',

  // ==========================================================================
  // CONTENT EDITOR — INTELLIGENT ITEM EDITOR (IntelligentItemEditor.svelte)
  // ==========================================================================
  'editor.intelligent.section_label':          'Intelligent Item',
  'editor.intelligent.ego_label':              'Ego',
  'editor.intelligent.ego_manual':             'manual',
  'editor.intelligent.ego_auto_prefix':        'auto = ',
  'editor.intelligent.alignment_label':        'Alignment',
  'editor.intelligent.communication_label':    'Communication',
  'editor.intelligent.empathy_option':         'Empathy — emotional impressions only',
  'editor.intelligent.speech_option':          'Speech — speaks Common + INT-bonus languages',
  'editor.intelligent.telepathy_option':       'Telepathy — projects thoughts directly',
  'editor.intelligent.senses_legend':          'Senses',
  'editor.intelligent.vision_label':           'Vision (ft.)',
  'editor.intelligent.darkvision_label':       'Darkvision (ft.)',
  'editor.intelligent.blindsense_label':       'Blindsense',
  'editor.intelligent.vision_none':            'None',
  'editor.intelligent.lesser_powers_label':    'Lesser Powers',
  'editor.intelligent.lesser_powers_hint':     '(+1 Ego each)',
  'editor.intelligent.greater_powers_label':   'Greater Powers',
  'editor.intelligent.greater_powers_hint':    '(+2 Ego each)',
   'editor.intelligent.languages_label':        'Languages',
   'editor.intelligent.languages_hint':         '(comma-separated)',
   /** Placeholder for the intelligent item languages input. */
   'editor.intelligent.languages_placeholder':  'e.g. Common, Elvish, Draconic',
   'editor.intelligent.special_purpose_label':       'Special Purpose',
  'editor.intelligent.special_purpose_hint':        '(+4 Ego if set)',
  'editor.intelligent.special_purpose_placeholder': 'e.g. Defeat arcane spellcasters',
  'editor.intelligent.dedicated_power_label':       'Dedicated Power',
  'editor.intelligent.dedicated_power_placeholder': 'e.g. Cast lightning bolt 10d6',
  'editor.intelligent.empty_hint':                  'Enable for sentient magic items (intelligent swords, orbs of dragonkind, etc.).',

  // ==========================================================================
  // CONTENT EDITOR — TAG PICKER MODAL (TagPickerModal.svelte)
  // ==========================================================================
  /** Title on a tag group chip when some but not all tags from the group are selected. */
  'editor.tag_picker.some_selected_title':     'Some tags from this group are selected',
  'editor.tag_picker.title':                   'Pick Tags',
  'editor.tag_picker.search_aria':             'Search tags',
  'editor.tag_picker.search_placeholder':      'Search tags…',
  'editor.tag_picker.no_tags_loaded':          'No tags loaded — enable a rule source in Campaign Settings.',
  /** {n} = total count, {s} = '' or 's' */
  'editor.tag_picker.tag_count':               '{n} tag{s} in pool',
  /** {n} = selection count */
  'editor.tag_picker.selected_suffix':         '{n} selected',
  'editor.tag_picker.empty_pool_msg':          'The tag pool is empty. Load rule sources to populate it.',
  /** {n} = usage count, {s} = '' or 's' */
  'editor.tag_picker.feature_uses_tag':        '{n} feature{s} use this tag',
  'editor.tag_picker.custom_section_title':    'Add a custom tag',
  'editor.tag_picker.custom_section_desc':     'Type a new tag not yet in the pool. Use snake_case (no spaces). Example: weapon_exotic.',
  /** Placeholder for the custom tag input field. */
  'editor.tag_picker.new_tag_placeholder':     'e.g. weapon_exotic',
  'editor.tag_picker.custom_tag_aria':         'Custom tag',
  'editor.tag_picker.spaces_error':            'Tags cannot contain spaces — use snake_case instead.',
  'editor.tag_picker.already_selected':        'This tag is already selected.',
  /** {n} = selection count */
  'editor.tag_picker.selected_preview_title':  'Selected tags ({n})',
  'editor.tag_picker.no_selected_footer':      'No tags selected',
  /** {n} = count, {s} = '' or 's' */
  'editor.tag_picker.selected_footer':         '{n} tag{s} selected',
  'editor.tag_picker.remove_tag_aria':         'Remove tag {tag}',
  'editor.tag_picker.confirm_btn':             'Confirm',
  /** {n} = selection count */
  'editor.tag_picker.confirm_with_count':      'Confirm ({n})',

  // ==========================================================================
  // CONTENT EDITOR — FEATURE PICKER MODAL (FeaturePickerModal.svelte)
  // ==========================================================================
  'editor.feature_picker.title_single':        'Pick a Feature',
  'editor.feature_picker.title_multiple':      'Pick Features',
  'editor.feature_picker.search_aria':         'Search features',
  'editor.feature_picker.search_placeholder':  'Search by ID or name…',
  'editor.feature_picker.all_label':           'All',
  'editor.feature_picker.no_features_search':  'Try a different search term or expand the category filter.',
  'editor.feature_picker.no_features_empty':   'Enable a rule source in Campaign Settings to populate the catalog.',
  'editor.feature_picker.no_features_found':   'No features found.',
  'editor.feature_picker.no_features_match':   'No features match.',
  /** {n} = count, {s} = '' or 's' */
  'editor.feature_picker.feature_count_match': '{n} feature{s} match',
  'editor.feature_picker.feature_count_available': '{n} feature{s} available',
  'editor.feature_picker.no_selected_footer':  'No features selected',
  'editor.feature_picker.selected_footer':     '{n} feature{s} selected',
  'editor.feature_picker.no_description':      'No description available.',
  'editor.feature_picker.source_label':        'Source: ',
  /** {label} = feature label */
  'editor.feature_picker.select_btn':          'Select "{label}"',
  'editor.feature_picker.click_preview':       'Click a feature to preview it here.',
  'editor.feature_picker.feature_list_aria':   'Feature list',
  'editor.feature_picker.confirm_btn':         'Confirm',
  /** {n} = count */
  'editor.feature_picker.confirm_with_count':  'Confirm ({n})',

  // ==========================================================================
  // CONTENT EDITOR — LEVEL MODIFIER MODAL (LevelModifierModal.svelte)
  // ==========================================================================
  /** {n} = level number */
  'editor.level_modifier.title':               'Level {n} — Modifiers',
  'editor.level_modifier.desc':                'These are incremental modifiers applied at exactly level {n}. The engine SUMS all type: "base" modifiers from every level entry up to the character\'s current level. Use type: "base" for BAB / save increments.',

  // ==========================================================================
  // CONTENT EDITOR — ENTITY SEARCH MODAL (EntitySearchModal.svelte)
  // ==========================================================================
  'editor.entity_search.title':                'Search Entities',
  'editor.entity_search.search_aria':          'Search entities',
  'editor.entity_search.search_placeholder':   'Search by ID, name, or description…',
  'editor.entity_search.keyboard_hint':        '↑↓ navigate · Enter preview · Esc close',
  /** {n} = total entity count */
  'editor.entity_search.start_typing':         'Start typing to search across all {n} loaded entities.',
  /** {query} = search query */
  'editor.entity_search.no_match':             'No entities match "{query}".',
  /** {max} = result cap */
  'editor.entity_search.too_many':             'Showing first {max} of many results — refine your query to narrow down.',
  /** {n} = result count, {s} = '' or 's', {query} = search query */
  'editor.entity_search.result_count':         '{n} result{s} for "{query}"',
  'editor.entity_search.search_results_aria':  'Search results',
  'editor.entity_search.empty_prompt':         'Search for any race, class, feat, spell, item, condition…',
  /** {query} = search query */
  'editor.entity_search.no_entities_found':    'No entities found for "{query}".',
  'editor.entity_search.no_entities_hint':     'Try fewer words, or search by ID (e.g. "race_elf", "feat_power").',
  'editor.entity_search.clone_copying_hint':   'Cloning copies all fields into a new entity. Set a new ID (or keep the same ID to override the original).',
  /** {label} = entity label */
  'editor.entity_search.clone_btn':            'Clone "{label}"',
  'editor.entity_search.click_to_preview':     'Click a result to preview it here.',
  'editor.entity_search.no_description':       'No description available.',

  // ==========================================================================
  // CHARACTER SHEET PAGE — accessible labels
  // ==========================================================================
  'character.back_vault_aria':          'Back to Character Vault',
  'character.back_campaigns_aria':      'Back to campaigns',
  'character.save_aria':                'Save character',
  'character.sheet_sections_aria':      'Character sheet sections',
  'character.character_id_aria':        'Character ID',

  // ==========================================================================
  // CAMPAIGNS PAGE — accessible labels
  // ==========================================================================
  'campaigns.create_new_aria':          'Create new campaign',
  /** aria-label for the campaign card link. {title} = campaign title. */
  'campaigns.open_campaign_aria':       'Open campaign: {title}',

  // ==========================================================================
  // CAMPAIGN DETAIL PAGE — accessible labels
  // ==========================================================================
  'campaign.chapters_section_aria':     'Campaign chapters',
  'campaign.chapters_list_aria':        'List of chapters',
  /** aria-label for a chapter card. {n} = 1-based chapter index, {title} = chapter title. */
  'campaign.chapter_item_aria':         'Chapter {n}: {title}',
  /** aria-label for the chapter tasks list. {title} = chapter title. */
  'campaign.chapter_tasks_aria':        'Tasks for {title}',
  /** aria-label for the "mark done/incomplete" toggle. {title} = chapter title. */
  'campaign.chapter_toggle_aria':       'Toggle completion for {title}',
  'campaign.sources_section_aria':      'Active rule sources',

  // ==========================================================================
  // VAULT PAGE — accessible labels
  // ==========================================================================
  /** aria-label for the character list. {n} = character count. */
  'vault.character_list_aria':          'Character list ({n} adventurers)',

  // ==========================================================================
  // SETTINGS PAGE — accessible labels & tooltips
  // ==========================================================================
  'settings.back_to_campaign_aria':     'Back to campaign',
  /** aria-label for the drag-handle on rule source rows. {name} = file path. */
  'settings.drag_reorder_aria':         'Drag to reorder: {name}',

  // ==========================================================================
  // SIDEBAR & NAVIGATION — accessible labels
  // ==========================================================================
  'nav.main_navigation_aria':           'Main navigation',
  /** aria-label for the loading spinner container. */
  'nav.loading_aria':                   'Loading…',
  /** aria-label for the breadcrumb <nav> element. */
  'nav.breadcrumb_aria':                'Breadcrumb',

  // ==========================================================================
  // SKILLS MATRIX — column / row accessible labels
  // ==========================================================================
  'skills.class_skill_col_aria':        'Class skill',
  'skills.training_required_aria':      'Requires training',
  /** aria-label for a rank-minimum badge. {n} = minimum rank count. */
  'skills.min_ranks_aria':              'Minimum ranks: {n}',

  // ==========================================================================
  // COMBAT — accessible labels
  // ==========================================================================
  'combat.attacks.main_hand_aria':      'Main hand weapon',
  /** aria-label for the breakdown button in CoreCombat. {name} = stat description. */
  'combat.core.show_breakdown_aria':    'Show {name} breakdown',
  /** aria-label for DR remove button. {label} = DR label (e.g. "DR 5/—"). */
  'combat.dr.remove_aria':              'Remove {label}',

  // ==========================================================================
  // LORE & LANGUAGES — accessible labels
  // ==========================================================================
  /** aria-label for the "remove language" button. {name} = language name. */
  'lore.remove_language_aria':          'Remove {name}',
  /** aria-label for the bonus-language slot counter. {n} = remaining slot count. */
  'lore.language_slots_remaining_aria': '{n} language slots remaining',
  /** aria-label for an automatic (locked) language badge. {name} = language name. */
  'lore.lang_badge_automatic_aria':     '{name} (automatic)',
  /** aria-label for a removable (manually-learned) language badge. {name} = language name. */
  'lore.lang_badge_removable_aria':     '{name} (removable)',

  // ==========================================================================
  // INVENTORY — ENCUMBRANCE
  // ==========================================================================
  /** aria-label for the encumbrance progress bar. {tier} = load tier label. */
  'inventory.encumbrance_aria':         'Encumbrance: {tier}',

  // ==========================================================================
  // HORIZONTAL SCROLL COMPONENT — accessible labels
  // ==========================================================================
  'horizontal_scroll.position_aria':   'Scroll position indicators',
  /** aria-label for a dot-navigation button. {n} = 1-based index, {total} = total count. */
  'horizontal_scroll.section_aria':    'Scroll to section {n} of {total}',
  /** Default ariaLabel prop value for HorizontalScroll wrapper. */
  'horizontal_scroll.default_label':   'Scrollable content',

  // ==========================================================================
  // COMMON — generic accessible labels reused across multiple components
  // ==========================================================================
  /** aria-label for item-details (i) info buttons. {name} = item/feature name. */
  'common.item_details_aria':      'Details for {name}',
  /** aria-label for "Remove X" icon buttons. {name} = item/feature name. */
  'common.remove_item_aria':       'Remove {name}',

  // ==========================================================================
  // INVENTORY TAB — accessible labels & tooltips
  // ==========================================================================
  /** title on the equip button when equipping is possible. */
  'inventory.equip_title':         'Equip this item',
  /** aria-label for the equip button. {name} = item name. */
  'inventory.equip_item_aria':     'Equip {name}',
  /** aria-label for "move to backpack" button. {name} = item name. */
  'inventory.move_to_backpack_aria': 'Move {name} to backpack',
  /** title for the "move to backpack" button. */
  'inventory.move_to_backpack_title': 'Move to backpack',

  // ==========================================================================
  // MAGIC TAB — accessible labels & short labels
  // ==========================================================================
  /** aria-label for "Show details" (i) button in SpecialAbilities panel. */
  'magic.abilities.show_details_aria': 'Show details',
  /** aria-label for "Use ability" button. {name} = ability name. */
  'magic.abilities.use_aria':      'Use {name}',
  /** aria-label for spell details (i) button in Grimoire. {name} = spell name. */
  'magic.casting.spell_details_aria': 'Show {name} details',
  /** Short label for the details button in SpellRowItem. */
  'magic.casting.details_short':   'Details',
  /** aria-label for staff spell info button in MagicItemsCastingSubpanel. */
  'magic.casting.staff_details_aria': 'Staff spell details',
  /** aria-label for the PP amount input in PsionicItemCard. */
  'inventory.psionic.pp_recharge_aria': 'PP to recharge',

  // ==========================================================================
  // POINT BUY MODAL — accessible labels
  // ==========================================================================
  /** aria-label for decrease buttons. {name} = ability abbreviation. */
  'abilities.decrease_aria':        'Decrease {name}',
  /** aria-label for increase buttons. {name} = ability abbreviation. */
  'abilities.increase_aria':        'Increase {name}',
  /** aria-label for the "Recommended" star badge. */
  'abilities.recommended_badge_aria': 'Recommended',
  /** title on the "Recommended" star badge for the current class. */
  'abilities.recommended_tooltip':  'Recommended for your class',

  // ==========================================================================
  // ROLL STATS MODAL — accessible labels
  // ==========================================================================
  /** aria-label for a rolled value chip. {val} = the value, used/unused suffix added in code. */
  'abilities.roll_value_aria':      'Value {val}',
  /** Suffix when a rolled value is already assigned. */
  'abilities.roll_value_assigned':  '(assigned)',
  /** aria-label for "assign this value to ability" button. {name} = ability abbreviation. */
  'abilities.assign_value_aria':    'Assign a rolled value to {name}',

  // ==========================================================================
  // CORE TAB — BASIC INFO ACCESSIBLE LABELS
  // ==========================================================================
  'core.select_race_aria':         'Select character race',
  'core.select_class_aria':        'Select character class',
  'core.select_deity_aria':        'Select deity',
  'core.select_alignment_aria':    'Select alignment',
  /** aria-label for the (i) info button next to a selected entity. {name} = entity name. */
  'core.show_feature_details_aria':'Show {name} details',

  // ==========================================================================
  // ABILITIES TAB — accessible labels with injected variable parts
  // ==========================================================================
  /** aria-label for the base-score input. {name} = localized ability name. */
  'abilities.base_score_aria':    '{name} base score',
  /** aria-label for the temp-modifier input. {name} = localized ability name. */
  'abilities.temp_mod_aria':      '{name} temporary modifier',
  /** aria-label for the breakdown button. {name} = localized ability name. */
  'abilities.show_breakdown_aria': 'Show {name} breakdown',
  /** title/aria-label for the roll-check button. {name} = localized ability name, {check} = localized "Check". */
  'abilities.roll_check_aria':    'Roll a {name} {check}',

  // ==========================================================================
  // SAVING THROWS TAB — accessible labels with injected variable parts
  // ==========================================================================
  /** title for the key-ability modifier chip. {ability} = localized ability abbreviation. */
  'saves.ability_modifier_title': '{ability} modifier',
  /** aria-label for the temp-modifier input. {name} = localized save name. */
  'saves.temp_mod_aria':          '{name} temporary modifier',
  /** aria-label for the breakdown button. {name} = localized save name. */
  'saves.show_breakdown_aria':    'Show {name} breakdown',
  /** aria-label for the roll-save button. {name} = localized save name. */
  'saves.roll_save_aria':         'Roll {name} save',

  // ==========================================================================
  // SKILLS MATRIX — accessible labels
  // ==========================================================================
  /** aria-label for the SP progress bar. {spent} = points used, {available} = total budget. */
  'skills.sp_progress_aria':      'Skill points: {spent} of {available}',
  /** aria-label for the HorizontalScroll wrapper around the skills table. */
  'skills.matrix_scroll_aria':    'Skills matrix table',
  /** aria-label for the <table> element. */
  'skills.matrix_table_aria':     'Skills matrix',

  // ==========================================================================
  // CORE TAB — SUMMARY PANEL ACCESSIBLE LABELS
  // ==========================================================================
  /** aria-label for the "Edit →" link in AbilityScoresSummary. */
  'core.open_ability_scores_aria': 'Open full Ability Scores editor',
  /** aria-label for the "Edit →" link in SkillsSummary. */
  'core.open_skills_aria':         'Open full Skills editor',
  /** aria-label for the "Edit →" link in SavingThrowsSummary. */
  'core.open_saves_aria':          'Open full Saving Throws editor',
  /** aria-label for the modifier value chip. {value} = formatted modifier (e.g. "+2"). */
  'core.modifier_aria':            'Modifier: {value}',
  /** Tooltip for the ranks badge in SkillsSummary. {n} = rank count. */
  'skills.ranks_invested':         '{n} ranks invested',
  /** Tooltip for the key ability chip in SavingThrowsSummary.
   *  {ability} = localized ability abbreviation, {mod} = formatted modifier. */
  'saves.governed_by':             'Governed by {ability} ({mod})',

  // ==========================================================================
  // LEVELING JOURNAL MODAL — additional inline strings
  // ==========================================================================
  /** Short level badge shown on per-class cards. {n} = class level. */
  'journal.class_level_badge':    'Lv {n}',
  /** Tooltip for the Fort/Ref/Will combined display. */
  'journal.fort_ref_will_title':  'Fort | Ref | Will',
  /** Tooltip shown when a class skill badge's pipeline is not loaded. */
  'journal.skill_not_loaded':     'Skill not loaded',
  /** "N more" suffix when a class has more than 12 granted features. {n} = overflow count. */
  'journal.n_more':               '+{n} more',
  /** Shown when at least one skill rank is locked (committed). */
  'journal.ranks_locked_note':    'Some skill ranks are locked (committed level-up floors).',
  /** Shown when no skill ranks are locked (free allocation). */
  'journal.ranks_free_note':      'All ranks are freely editable (no levels committed).',

  // ==========================================================================
  // HEALTH & XP — button tooltips
  // ==========================================================================
  /** Tooltip on the New Encounter button. */
  'heal.encounter_reset_tooltip': 'Reset encounter-slot abilities',
  /** Tooltip on the Long Rest button. */
  'heal.long_rest_tooltip':       'Restore all long-rest resources',

  // ==========================================================================
  // ARMOR CLASS — accessible labels & tooltips
  // ==========================================================================
  /** aria-label for the temporary AC modifier input. */
  'combat.ac.temp_mod_aria':      'Temporary AC modifier (applied to all AC types)',
  /** title tooltip for the temporary AC modifier input. */
  'combat.ac.temp_mod_tooltip':   'Quick temporary modifier (buff spell, condition, etc.)',
  /** Generic "Show breakdown" tooltip used on multiple buttons. */
  'common.show_breakdown':        'Show breakdown',

  // ==========================================================================
  // EPHEMERAL EFFECTS PANEL — accessible labels
  // ==========================================================================
  /** aria-label for the effects count badge. {n} = count. */
  'effects.panel.count_aria':     '{n} active effects',
  /** title for the effect-details info button. */
  'effects.panel.info_title':     'Show effect details',
  /** aria-label for the effect-details info button. {name} = effect/feature name. */
  'effects.panel.info_aria':      'Show details for {name}',

  // ==========================================================================
  // DICE ROLL MODAL — accessible labels
  // ==========================================================================
  /** title tooltip for "add tag" chip buttons. {tag} = situational context string. */
  'dice.add_tag_title':           "Add '{tag}' to target tags",
  /** aria-label for "add tag" chip buttons. {tag} = situational context string. */
  'dice.add_tag_aria':            'Add {tag} tag',
  /** aria-label for the Roll button. {formula} = dice formula string. */
  'dice.roll_aria':               'Roll {formula}',
  /** aria-label for the rolling animation container. */
  'dice.rolling_aria':            'Rolling dice...',

  // ==========================================================================
  // MODAL — close button
  // ==========================================================================
  /** aria-label for the ✕ close button inside the modal header. */
  'modal.close_dialog_aria':      'Close dialog',

  // ==========================================================================
  // CONTENT EDITOR — ACTIVATION EDITOR reaction suggestions (datalist)
  // ==========================================================================
  'editor.activation.suggestion_targeted_by_attack':    'When targeted by an attack',
  'editor.activation.suggestion_ally_hit':              'When an ally within 30 ft. is hit',
  'editor.activation.suggestion_spell_cast':            'When a spell is cast within range',
  'editor.activation.suggestion_below_half_hp':         'When reduced below half HP',
  'editor.activation.suggestion_threatened_square':     'When entering a threatened square',
  'editor.activation.suggestion_damage_to_zero':        'When damage would reduce HP to 0',

  // ==========================================================================
  // CONTENT EDITOR — LIBRARY PAGE LOAD ORDER TOOLTIP
  // ==========================================================================
  'content_editor.lib.load_order_tooltip': 'Files are loaded alphabetically — prefix with a number like `50_` to control priority. Example: "50_my_setting.json" loads after all SRD files (00_*) but before any 90_* overrides.',

  // ==========================================================================
  // CONTENT EDITOR — MODIFIER ROW condition summary labels
  // Used in conditionSummary() to build a compact human-readable description
  // of the top-level logic node shown next to the Condition field.
  // ==========================================================================
  /** Compact AND group summary shown in ModifierRow condition field. {n} = child count. */
  'editor.modifier.condition_and_summary': 'AND ({n} conditions)',
  /** Compact OR group summary shown in ModifierRow condition field. {n} = child count. */
  'editor.modifier.condition_or_summary':  'OR ({n} conditions)',
  /** Compact NOT group summary shown in ModifierRow condition field. */
  'editor.modifier.condition_not_summary': 'NOT (…)',
  /** Fallback source-name label when a feature has no English label. */
  'editor.modifier.fallback_feature':      'Feature',

  // ==========================================================================
  // CONTENT EDITOR — TAG PICKER group tag count
  // ==========================================================================
  /** Count of tags in a grouped prefix section in TagPickerModal. {n} = count. */
  'editor.tag_picker.group_tag_count': { one: '{n} tag', other: '{n} tags' },

  // ==========================================================================
  // CONTENT EDITOR — INTELLIGENT ITEM EDITOR sense range options
  // ==========================================================================
  /** Label for a vision/darkvision dropdown option. {n} = range value. */
  'editor.intelligent.sense_ft_option': '{n} ft.',

  // ==========================================================================
  // CONTENT EDITOR — ARCANE SCHOOL NAMES
  // Localised display names for the ARCANE_SCHOOLS identifier list.
  // Adding a new language requires adding editor.school.* keys to its locale JSON.
  // ==========================================================================
  'editor.school.abjuration':    'Abjuration',
  'editor.school.conjuration':   'Conjuration',
  'editor.school.divination':    'Divination',
  'editor.school.enchantment':   'Enchantment',
  'editor.school.evocation':     'Evocation',
  'editor.school.illusion':      'Illusion',
  'editor.school.necromancy':    'Necromancy',
  'editor.school.transmutation': 'Transmutation',
  'editor.school.universal':     'Universal',

  // ==========================================================================
  // CONTENT EDITOR — CHOICES EDITOR label + query placeholders
  // ==========================================================================
  /** Placeholder for the EN label input in the choice row. */
  'editor.choices.label_en_placeholder': 'e.g. Choose a weapon type',
  /** Placeholder for the FR label input in the choice row. */
  'editor.choices.label_fr_placeholder': "ex. Choisissez un type d'arme",
  /** First part of the inline example shown when a prefix is set. */
  'editor.choices.prefix_example_selects': 'Example: player selects',
  /** Arrow separator between example entity and emitted tag. */
  'editor.choices.prefix_example_tag':     '→ tag',

  // ==========================================================================
  // CONTENT EDITOR — PSIONIC DATA SECTION effect description placeholders
  // ==========================================================================
  /** Placeholder for the EN augmentation effect description textarea. */
  'content_editor.psi.effect_desc_en_placeholder': 'e.g. For every 2 additional PP, damage increases by 1d10.',
  /** Placeholder for the FR augmentation effect description textarea. */
  'content_editor.psi.effect_desc_fr_placeholder': 'ex. Pour chaque 2 PP supplémentaires, les dégâts augmentent de 1d10.',

  // ==========================================================================
  // LEVELING JOURNAL — first-level SP multiplier abbreviation
  // Appended to the SP formula when the first-level bonus is active.
  // "L1" = "Level 1" (EN); "N1" = "Niveau 1" (FR).
  // ==========================================================================
  /** Compact "(×4 at level 1)" note appended to the SP formula. */
  'journal.sp_first_level_abbr': '(×4 L1)',

  // English names itself here because it is the only language that has NO
  // separate locale file: it is the hardcoded baseline and is intentionally
  // excluded from the /api/locales response.
  //
  // ALL OTHER languages (including the bundled fr.json) are discovered at
  // runtime via loadExternalLocales() → GET /api/locales.  Their native name
  // comes from the `$meta.language` field inside each locale file
  // (e.g. fr.json declares "lang.fr": "Français").  The dropdown only shows a
  // language once the API response has been processed, which guarantees that
  // getLanguageDisplayName() always has the display name ready.
  //
  // DO NOT add 'lang.de', 'lang.fr', 'lang.es' etc. here.  Those belong
  // exclusively in their respective locale files.
  'lang.en':                      'English',

  // ==========================================================================
  // CONTENT EDITOR — LOCALIZED STRING EDITOR (LocalizedStringEditor.svelte)
  // Strings used in the multi-language translation editor embedded inside
  // CoreFieldsSection, ResourcePoolEditor, PsionicDataSection, ChoicesEditor.
  // ==========================================================================

  /**
   * Short "(required)" badge shown next to the English language label.
   * English is the mandatory fallback language — it can never be removed.
   */
  'editor.lang.required_hint':          'required',

  /**
   * Remove button label and aria-label for a non-English translation.
   * {lang} = native language name (e.g. "Deutsch").
   */
  'editor.lang.remove_translation':     'Remove {lang} translation',

  /**
   * Placeholder option shown in the "add translation" <select> when no
   * language has been chosen yet.
   */
  'editor.lang.add_translation':        '+ Add Translation',

  /**
   * Last option in the "add translation" <select> — opens NewLanguageModal
   * so the GM can enter a language not in the premade list.
   */
  'editor.lang.new_language_option':    '+ New language...',

  /**
   * Shown in textarea preview mode when the translation value is empty.
   * Generic — replaces the language-specific 'editor.core.no_description_en'
   * and 'editor.core.no_description_fr' keys.
   */
  'editor.lang.no_description':         '(no translation)',

  /**
   * Warning shown below the editor when the English (fallback) field is empty.
   * English must always have a value — the engine falls back to it when a
   * translation is missing.
   */
  'editor.lang.english_required_hint':  'English is the fallback language — please add an English translation.',

  /**
   * Generic placeholder for non-English single-line label inputs.
   * Shown when no language-specific placeholder has been provided.
   */
  'editor.lang.translation_placeholder': 'Translation in this language',

  /**
   * Generic placeholder for non-English multi-line description textareas.
   */
  'editor.lang.desc_translation_placeholder': 'Description in this language',

  // ==========================================================================
  // CONTENT EDITOR — NEW LANGUAGE MODAL (NewLanguageModal.svelte)
  // Strings for the modal that lets GMs add brand-new languages not yet in
  // any loaded rule file or server locale.
  // ==========================================================================

  /** Modal title. */
  'editor.lang.new_language_title':     'Add New Language',

  /**
   * Section header for the premade language list.
   * Prompts the GM to select from common languages.
   */
  'editor.lang.premade_section':        'Common Languages',

  /**
   * Title attribute on premade language buttons.
   * {name} = native language name (e.g. "Deutsch").
   * Double-clicking a premade button confirms immediately.
   */
  'editor.lang.confirm_premade_title':  'Double-click to add {name}',

  /**
   * Label on the "Add <name>" quick-confirm button shown when a premade
   * language is selected (single-clicked).
   * {name} = native language name.
   */
  'editor.lang.add_premade_btn':        'Add {name}',

  /**
   * Empty-state message in the premade list when all common languages are
   * already present in the LocalizedString being edited.
   */
  'editor.lang.all_premade_added':      'All common languages are already added.',

  /**
   * Label on the horizontal divider between the premade list and the custom
   * entry form.
   */
  'editor.lang.custom_section':         'Custom Language',

  /**
   * Helper text above the custom entry form.
   * Tells the GM what to fill in for a language not in the premade list.
   */
  'editor.lang.custom_section_hint':    'For a language not in the list above, enter its code, native name, and flag country code manually.',

  /** Field label for the language code input. */
  'editor.lang.code_label':             'Language Code',

  /**
   * Helper text below the language code input.
   * Explains the BCP-47 format: base code or base-region code.
   * Examples: de, es, fr, pt-br, en-gb, fr-be
   */
  'editor.lang.code_hint':              'BCP-47 code — base (e.g. de, es) or region variant (e.g. en-gb, fr-be, pt-br)',

  /** Placeholder for the language code input. */
  'editor.lang.code_placeholder':       'e.g. de or en-gb',

  /**
   * Validation error shown when the language code is not a valid BCP-47 format.
   * Valid: 2–3 letters, or 2–3 letters + hyphen + 2–3 letters (region).
   */
  'editor.lang.code_invalid_error':     'Must be BCP-47: 2-3 letters, or with region (e.g. de, en-gb, fr-be)',

  /**
   * Validation error shown when the language code is already present in the
   * LocalizedString being edited.
   * {code} = the duplicate language code.
   */
  'editor.lang.code_duplicate_error':   'Language "{code}" is already added',

  /**
   * Field label for the ISO 3166-1 alpha-2 country code input (flag icon).
   */
  'editor.lang.flag_code_label':        'Flag Country Code',

  /**
   * Helper text below the country code input.
   * For regional variants like 'en-gb', the region part IS the country code.
   */
  'editor.lang.flag_code_hint':         '2-letter ISO 3166-1 country code for the flag. Auto-set from region tag (e.g. en-gb → gb).',

  /** Placeholder for the country code input. */
  'editor.lang.flag_placeholder':       'e.g. gb',

  /**
   * Field label for the native language name input.
   * The name should be written in the language itself (e.g. "Deutsch").
   */
  'editor.lang.native_name_label':      'Language Name (native)',

  /**
   * Helper text below the native name input.
   * Tells the GM to write the name in the language itself.
   */
  'editor.lang.native_name_hint':       'Write the name as it appears in the language itself (e.g. Deutsch, Espanol)',

  /** Placeholder for the native name input. */
  'editor.lang.name_placeholder':       'e.g. Deutsch',

  /**
   * Label on the custom-form confirm button.
   * Becomes active once the required fields (code + name) are filled and valid.
   */
  'editor.lang.confirm_custom':         'Add Language',

  // ==========================================================================
  // CONTENT EDITOR — RESOURCE POOL EDITOR (ResourcePoolEditor.svelte)
  // Label for the LocalizedStringEditor section inside a pool entry.
  // ==========================================================================
  /** Section label above the multilingual pool label editor. */
  'content_editor.pool.label_legend':   'Label',

  // ==========================================================================
  // CONTENT EDITOR — CHOICES EDITOR (ChoicesEditor.svelte)
  // Label for the LocalizedStringEditor section inside a choice entry.
  // ==========================================================================
  /** Section label above the multilingual choice label editor. */
  'editor.choices.label_legend':        'Label',

  // ==========================================================================
  // CONTENT EDITOR — PSIONIC DATA SECTION (PsionicDataSection.svelte)
  // Legend for the LocalizedStringEditor inside the augmentation effect
  // description block.
  // ==========================================================================
  /** Section label above the multilingual augmentation effect description editor. */
  'content_editor.psi.effect_desc_legend': 'Effect Description',

  // ==========================================================================
  // CONTENT EDITOR — TIERED COSTS EDITOR (TieredCostsEditor.svelte)
  // Label for the multilingual tier label editor (replaces label_en / label_fr).
  // The old keys (label_en, label_fr) are kept for backward-compatibility but
  // TieredCostsEditor will be updated separately.
  // ==========================================================================
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Resolves a UI chrome string by key for the given language.
 *
 * RESOLUTION ORDER (BCP-47 regional variant aware):
 *   1. Exact locale for `lang`        (e.g. loaded 'fr-be.json')
 *   2. Base language locale            (e.g. loaded 'fr.json' for 'fr-be')
 *   3. English baseline (UI_STRINGS)   (always available, bundled at build)
 *   4. The raw key itself              (fallback sentinel — logs a console.warn)
 *
 * The base-language step (2) implements the `fr-be → fr → en` fallback chain:
 * a user with 'fr-be' selected gets Belgian-French overrides where available,
 * generic French translations for the rest, and English for anything untranslated.
 *
 * For plural keys, returns the "other" form as the non-count-aware default.
 * Use uiN() when you have a count and need the correct CLDR plural form.
 *
 * @example
 * ui('combat.hp.title', 'fr')     // → "Points de vie"
 * ui('combat.hp.title', 'fr-be')  // → "Points de vie" (from fr.json if fr-be.json lacks it)
 * ui('combat.hp.title', 'en')     // → "Hit Points"
 * ui('combat.hp.title', 'de')     // → "Hit Points" (falls back to EN if de.json not loaded)
 */
export function ui(key: string, lang: string = 'en'): string {
  if (lang !== 'en') {
    // Step 1: try the exact locale (e.g. 'fr-be').
    const exactEntry = _loadedLocales.get(lang)?.[key];
    if (exactEntry !== undefined) {
      if (typeof exactEntry === 'string') return exactEntry;
      return exactEntry['other'] ?? exactEntry['one'] ?? key;
    }

    // Step 2: for regional variants (e.g. 'fr-be'), try the base language ('fr').
    const hyphenIdx = lang.indexOf('-');
    if (hyphenIdx > 0) {
      const baseLang = lang.slice(0, hyphenIdx);
      if (baseLang !== 'en') {
        const baseEntry = _loadedLocales.get(baseLang)?.[key];
        if (baseEntry !== undefined) {
          if (typeof baseEntry === 'string') return baseEntry;
          return baseEntry['other'] ?? baseEntry['one'] ?? key;
        }
      }
    }
  }

  // Step 3: English baseline (always available — bundled in UI_STRINGS).
  const entry = UI_STRINGS[key];
  if (entry === undefined) {
    console.warn(`[i18n] Missing UI string key: "${key}"`);
    return key;
  }
  if (typeof entry === 'string') return entry;
  // Plural object: return the "other" form as a non-count-aware fallback.
  return entry['other'] ?? entry['one'] ?? key;
}

/**
 * Resolves a count-aware UI chrome string using Intl.PluralRules.
 *
 * The string value for the key must be a UiPluralForms object:
 *   { one: "{n} file", other: "{n} files" }
 *
 * The token {n} in the selected form is replaced with String(count).
 *
 * Falls back to ui(key, lang) behaviour if the value is a plain string.
 *
 * BCP-47 REGIONAL VARIANTS:
 *   Applies the same exact → base → English fallback chain as `ui()`.
 *   `Intl.PluralRules` accepts regional BCP-47 codes natively (e.g.
 *   `new Intl.PluralRules('fr-be')` selects the correct French plural forms).
 *
 * @example
 * uiN('settings.rule_sources.files', 1,  'fr')    // → "1 fichier"
 * uiN('settings.rule_sources.files', 28, 'fr')    // → "28 fichiers"
 * uiN('settings.rule_sources.files', 28, 'fr-be') // → "28 fichiers" (from fr.json fallback)
 * uiN('settings.rule_sources.files', 28, 'en')    // → "28 files"
 */
export function uiN(key: string, count: number, lang: string = 'en'): string {
  // Resolve the entry using the same BCP-47 fallback chain as ui().
  let entry: UiStringValue | undefined;

  if (lang !== 'en') {
    entry = _loadedLocales.get(lang)?.[key];

    if (entry === undefined) {
      // Regional variant: try base language.
      const hyphenIdx = lang.indexOf('-');
      if (hyphenIdx > 0) {
        const baseLang = lang.slice(0, hyphenIdx);
        if (baseLang !== 'en') entry = _loadedLocales.get(baseLang)?.[key];
      }
    }
  }

  entry ??= UI_STRINGS[key];

  if (entry === undefined) {
    console.warn(`[i18n] Missing UI string key: "${key}"`);
    return key;
  }
  if (typeof entry === 'string') return entry;

  // Use the full BCP-47 code for plural rule selection — Intl handles it.
  let pr = _pluralCache.get(lang);
  if (!pr) { pr = new Intl.PluralRules(lang); _pluralCache.set(lang, pr); }

  const form  = pr.select(count);
  const value = entry[form] ?? entry['other'] ?? entry['one'] ?? key;
  return value.replace('{n}', String(count));
}

/**
 * Builds a `LocalizedString` (all-languages map) for a UI string key by
 * consulting the English baseline and every loaded locale at the time of call.
 *
 * PURPOSE — WHY THIS EXISTS:
 *   The game engine stores modifier `sourceName`, feature `label`, and similar
 *   fields as `LocalizedString` objects (a `Record<string, string>` that maps
 *   language codes to their translations). These objects are resolved at display
 *   time via `engine.t()` so the active language can change without re-running
 *   the DAG. Previously, such objects were constructed with inline translations
 *   (e.g. `{ en: 'Synergy', fr: 'Synergie' }`), which forced every new language
 *   to modify TypeScript source files.
 *
 *   `buildLocalizedString(key)` replaces that pattern: the English baseline
 *   comes from `UI_STRINGS` and all other languages from their loaded locale
 *   files. Adding a new language never requires changes to `constants.ts` or
 *   the engine — only a new entry in the locale JSON file is needed.
 *
 * WHEN TO CALL:
 *   Call inside reactive engine methods (e.g. inside `$derived.by()`) or
 *   component handlers — NOT at module-level constant initialisation time,
 *   because locale files are loaded asynchronously after boot. By the time
 *   any user action triggers these paths, all locales are already cached.
 *
 * @param key - A `ui-strings.ts` key whose value must be a plain string
 *              (not a plural object).
 * @returns A `LocalizedString` populated with the English value and every
 *          currently loaded locale's translation for that key.
 */
export function buildLocalizedString(key: string): LocalizedString {
  const en = typeof UI_STRINGS[key] === 'string'
    ? (UI_STRINGS[key] as string)
    : key; // Graceful fallback if the key is missing or is a plural object.

  const result: Record<string, string> = { en };

  for (const [code, locale] of _loadedLocales.entries()) {
    const entry = locale[key];
    if (typeof entry === 'string') result[code] = entry;
  }

  return result;
}

/**
 * Injects a locale object directly into the cache without an HTTP fetch.
 *
 * INTENDED FOR TESTING ONLY.
 *   Unit tests cannot fetch `/locales/fr.json` from the filesystem.
 *   Call this helper at the top of a describe block to prime the locale cache
 *   with the translations the test needs.
 *
 * @example
 *   loadUiLocaleFromObject('fr', { 'ability_abbr.stat_strength': 'FOR' });
 *   expect(getAbilityAbbr('stat_strength', 'fr')).toBe('FOR');
 *
 * @param code         - BCP-47 language code (e.g., 'fr', 'de').
 * @param translations - Partial locale map to inject.
 */
export function loadUiLocaleFromObject(code: string, translations: UiLocale): void {
  if (code === 'en') return; // English is always served from the bundled baseline.
  const existing = _loadedLocales.get(code) ?? {};
  _loadedLocales.set(code, { ...existing, ...translations });
}
