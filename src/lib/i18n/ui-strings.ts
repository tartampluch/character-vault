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
export const SUPPORTED_UI_LANGUAGES: ReadonlyArray<{ code: string; unitSystem: UnitSystem }> = [
  { code: 'en', unitSystem: 'imperial' },
  { code: 'fr', unitSystem: 'metric'   },
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
export async function loadUiLocale(code: string): Promise<void> {
  if (code === 'en' || _loadedLocales.has(code)) return;
  try {
    const res = await fetch(`/locales/${code}.json`);
    if (!res.ok) return;
    const raw = await res.json() as Record<string, unknown>;
    // Strip the $meta block — it is translator metadata, not a string key.
    const { $meta: _ignored, ...strings } = raw;
    _loadedLocales.set(code, strings as UiLocale);
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
  'login.username':               'Username',
  'login.password':               'Password',
  'login.sign_in':                'Sign In',
  'login.signing_in':             'Signing in…',
  'login.error_invalid':          'Invalid username or password.',
  'login.error_too_many':         'Too many login attempts. Please wait 15 minutes.',
  'login.error_failed':           'Login failed (HTTP {status}). Please try again.',
  'login.error_server':           'Could not reach the server. Is the PHP API running?',
  'login.dev_hint':               'Dev accounts: {gm} or {player} — run {cmd} to create them.',

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
  'nav.role_gm':                  'Game Master',
  'nav.role_player':              'Player',
  'nav.switch_to_player':         'Switch to Player mode',
  'nav.switch_to_gm':             'Switch to GM mode',
  'nav.dev_prefix':               'Dev:',

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
  'gm.syntax_error':              'Syntax error:',
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
  'common.saved':                 'Saved ✓',
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
  // LANGUAGE SELECTOR
  // ==========================================================================
  'lang.label':                   'Language',
  'lang.select_tooltip':          'Switch display language',

  // English names itself here because English has no separate locale file
  // (it is always bundled as the baseline) and because the PHP /api/locales
  // endpoint intentionally excludes 'en' from its response.
  //
  // ALL OTHER languages name themselves inside their own locale JSON file
  // (e.g. fr.json has "lang.fr": "Français", de.json has "lang.de": "Deutsch").
  // This ensures the language dropdown always shows native names that speakers
  // recognise, regardless of which language is currently active in the UI.
  //
  // DO NOT add 'lang.de', 'lang.fr', 'lang.es' etc. here — those belong in
  // their respective locale files only.
  'lang.en':                      'English',
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Resolves a UI chrome string by key for the given language.
 *
 * Resolution order:
 *   1. Loaded locale for the requested language (from /locales/{lang}.json)
 *   2. English baseline (UI_STRINGS)
 *   3. The key itself, with a console warning (for debug visibility)
 *
 * For plural keys, returns the "other" form as the default.
 * Use uiN() when you have a count and need the correct plural form.
 *
 * @example
 * ui('combat.hp.title', 'fr')  // → "Points de vie"
 * ui('combat.hp.title', 'en')  // → "Hit Points"
 * ui('combat.hp.title', 'de')  // → "Hit Points" (falls back to EN if de.json not loaded)
 */
export function ui(key: string, lang: string = 'en'): string {
  const localeEntry = lang !== 'en' ? _loadedLocales.get(lang)?.[key] : undefined;
  const entry = localeEntry ?? UI_STRINGS[key];
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
 * @example
 * uiN('settings.rule_sources.files', 1,  'fr') // → "1 fichier"
 * uiN('settings.rule_sources.files', 28, 'fr') // → "28 fichiers"
 * uiN('settings.rule_sources.files', 28, 'en') // → "28 files"
 */
export function uiN(key: string, count: number, lang: string = 'en'): string {
  const localeEntry = lang !== 'en' ? _loadedLocales.get(lang)?.[key] : undefined;
  const entry = localeEntry ?? UI_STRINGS[key];
  if (entry === undefined) {
    console.warn(`[i18n] Missing UI string key: "${key}"`);
    return key;
  }
  if (typeof entry === 'string') return entry;

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
