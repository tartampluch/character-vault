/**
 * @file src/tests/engineConfigTables.test.ts
 * @description Unit tests for the GameEngine's data-driven config table features.
 *
 * SCOPE — Covers the medium-severity fixes (M2, M3, M4) and the low-severity
 * fixes (L6, L7) that involve config table reads:
 *
 *   M2 — `savingThrowConfig`: Proves that `engine.savingThrowConfig` switches from
 *        the hardcoded `DEFAULT_SAVE_CONFIG` fallback to JSON-driven values when the
 *        `config_save_definitions` config table is loaded into the DataLoader.
 *
 *   M3 — `getWeaponDefaults()` / `getWeaponAttackBonus()` / `getWeaponDamageBonus()`:
 *        Proves that weapon ability-score assignments are read from `config_weapon_defaults`
 *        rather than hardcoded 'stat_strength'/'stat_dexterity' ID strings.
 *
 *   M4 — `getSpellSaveDC()` casting ability detection: Proves that the fallback in
 *        `getSpellSaveDC()` reads the `isCastingAbility` flag from
 *        `config_attribute_definitions` instead of comparing against hardcoded IDs.
 *
 * TESTING APPROACH:
 *   All three features use the module-level `engine` and `dataLoader` singletons.
 *   `dataLoader.cacheConfigTable()` injects test data; `dataLoader.clearCache()` and
 *   `engine.bumpDataLoaderVersion()` reset state between tests. The engine's `$derived`
 *   computations re-evaluate lazily on next read, so bumping the version is sufficient.
 *
 * @see src/lib/engine/GameEngine.svelte.ts — SaveConfigEntry, WeaponDefaults, fixes
 * @see static/rules/00_d20srd_core/00_d20srd_core_config_tables.json — JSON source data
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { engine, createEmptyCharacter } from '$lib/engine/GameEngine.svelte';
import { dataLoader } from '$lib/engine/DataLoader';
import type { SaveConfigEntry, WeaponDefaults } from '$lib/engine/GameEngine.svelte';
import type { ConfigTable } from '$lib/engine/DataLoader';
import { SYNERGY_SOURCE_LABEL, SYNERGY_SOURCE_LABEL_KEY } from '$lib/utils/constants';
import { UI_STRINGS, ui, loadUiLocaleFromObject } from '$lib/i18n/ui-strings';

// =============================================================================
// HELPERS
// =============================================================================

/** Wraps a data array into the ConfigTable shape expected by cacheConfigTable(). */
function makeConfigTable(tableId: string, data: Record<string, unknown>[]): ConfigTable {
  return { tableId, ruleSource: 'test', data };
}

// =============================================================================
// SETUP / TEARDOWN
// =============================================================================

beforeEach(() => {
  // Start each test with a clean DataLoader cache so config tables from one test
  // don't leak into the next. The engine's `savingThrowConfig` $derived will
  // recompute on next read after clearCache() + bumpDataLoaderVersion().
  dataLoader.clearCache();
  engine.bumpDataLoaderVersion();

  // Reset the character to a known baseline state
  const blank = createEmptyCharacter('test-cfg-001', 'Test Character');
  engine.character.attributes           = blank.attributes;
  engine.character.combatStats          = blank.combatStats;
  engine.character.saves                = blank.saves;
  engine.character.skills               = blank.skills;
  engine.character.classLevels          = {};
  engine.character.activeFeatures       = [];
  engine.character.minimumSkillRanks    = {};
});

afterEach(() => {
  dataLoader.clearCache();
  engine.bumpDataLoaderVersion();
});

// =============================================================================
// M2 — savingThrowConfig: data-driven from config_save_definitions
// =============================================================================

describe('M2 — engine.savingThrowConfig — data-driven from config_save_definitions', () => {

  it('returns the D&D 3.5 SRD bootstrap fallback when no config table is loaded', () => {
    // DataLoader cache is empty (cleared in beforeEach). savingThrowConfig should
    // fall back to DEFAULT_SAVE_CONFIG: Fort→CON, Ref→DEX, Will→WIS.
    const saves = engine.savingThrowConfig;

    expect(saves).toHaveLength(3);
    expect(saves[0].pipelineId).toBe('saves.fortitude');
    expect(saves[0].keyAbilityId).toBe('stat_constitution');
    // The bootstrap fallback uses the pipeline ID as the abbreviation (not 'CON') to comply
    // with the zero-D&D-hardcoding rule (PROGRESS.md guideline 6). The human-readable
    // abbreviation ('CON') is loaded from config_save_definitions at runtime.
    // See DEFAULT_SAVE_CONFIG comment in GameEngine.svelte.ts for full rationale.
    expect(saves[0].keyAbilityAbbr.en).toBe('stat_constitution');
    expect(saves[1].pipelineId).toBe('saves.reflex');
    expect(saves[1].keyAbilityId).toBe('stat_dexterity');
    expect(saves[2].pipelineId).toBe('saves.will');
    expect(saves[2].keyAbilityId).toBe('stat_wisdom');
  });

  it('every fallback entry has non-empty pipelineId, keyAbilityId, label, accentColor', () => {
    const saves = engine.savingThrowConfig;
    for (const entry of saves) {
      expect(entry.pipelineId,   `${entry.pipelineId}: pipelineId empty`).toBeTruthy();
      expect(entry.keyAbilityId, `${entry.pipelineId}: keyAbilityId empty`).toBeTruthy();
      expect(entry.label.en,     `${entry.pipelineId}: EN label empty`).toBeTruthy();
      expect(entry.label.fr,     `${entry.pipelineId}: FR label empty`).toBeTruthy();
      expect(entry.accentColor,  `${entry.pipelineId}: accentColor empty`).toBeTruthy();
    }
  });

  it('switches to JSON-driven values when config_save_definitions is cached', () => {
    // Inject an override table that swaps the saves around (homebrew ruleset)
    dataLoader.cacheConfigTable(makeConfigTable('config_save_definitions', [
      {
        pipelineId:     'saves.brawn',
        label:          { en: 'Brawn',   fr: 'Robustesse' },
        keyAbilityId:   'stat_strength',
        keyAbilityAbbr: { en: 'STR',     fr: 'FOR' },
        accentColor:    '#ff0000',
      },
      {
        pipelineId:     'saves.finesse',
        label:          { en: 'Finesse', fr: 'Finesse' },
        keyAbilityId:   'stat_dexterity',
        keyAbilityAbbr: { en: 'DEX',     fr: 'DEX' },
        accentColor:    '#00ff00',
      },
    ]));
    engine.bumpDataLoaderVersion(); // invalidate the $derived cache

    const saves = engine.savingThrowConfig;

    // Should now use the injected table, not the D&D 3.5 defaults
    expect(saves).toHaveLength(2);
    expect(saves[0].pipelineId).toBe('saves.brawn');
    expect(saves[0].keyAbilityId).toBe('stat_strength');
    expect(saves[0].label.fr).toBe('Robustesse');
    expect(saves[1].pipelineId).toBe('saves.finesse');
  });

  it('falls back to DEFAULT_SAVE_CONFIG when cached table has empty data array', () => {
    dataLoader.cacheConfigTable(makeConfigTable('config_save_definitions', []));
    engine.bumpDataLoaderVersion();

    const saves = engine.savingThrowConfig;
    // Empty data → treats as "table absent", returns bootstrap fallback
    expect(saves).toHaveLength(3);
    expect(saves[0].keyAbilityId).toBe('stat_constitution');
  });

  it('SaveConfigEntry type is exported and has the expected shape', () => {
    // TYPE REGRESSION GUARD — if SaveConfigEntry changes shape, this test catches it.
    const entry: SaveConfigEntry = {
      pipelineId:     'saves.fortitude',
      label:          { en: 'Fortitude', fr: 'Vigueur' },
      keyAbilityId:   'stat_constitution',
      keyAbilityAbbr: { en: 'CON', fr: 'CON' },
      accentColor:    'oklch(65% 0.19 28)',
    };
    expect(entry.pipelineId).toBe('saves.fortitude');
    expect(entry.label.fr).toBe('Vigueur');
  });
});

// =============================================================================
// M3 — getWeaponDefaults() / getWeaponAttackBonus() / getWeaponDamageBonus()
// =============================================================================

describe('M3 — engine.getWeaponDefaults() — data-driven from config_weapon_defaults', () => {

  it('returns D&D 3.5 SRD defaults when no config table is loaded', () => {
    // DataLoader cache empty → returns DEFAULT_WEAPON_CONFIG
    const defaults = engine.getWeaponDefaults();
    expect(defaults.meleeAttackAbility).toBe('stat_strength');
    expect(defaults.rangedAttackAbility).toBe('stat_dexterity');
    expect(defaults.meleeDamageAbility).toBe('stat_strength');
    expect(defaults.twoHandedDamageMultiplier).toBe(1.5);
  });

  it('returns overridden values when config_weapon_defaults is cached', () => {
    // Homebrew rule: ranged attacks use stat_perception instead of stat_dexterity
    dataLoader.cacheConfigTable(makeConfigTable('config_weapon_defaults', [
      { key: 'meleeAttackAbility',        abilityId: 'stat_strength' },
      { key: 'rangedAttackAbility',       abilityId: 'stat_perception' },
      { key: 'meleeDamageAbility',        abilityId: 'stat_strength' },
      { key: 'twoHandedDamageMultiplier', value: 2.0 },
    ]));

    const defaults = engine.getWeaponDefaults();
    expect(defaults.rangedAttackAbility).toBe('stat_perception');
    expect(defaults.twoHandedDamageMultiplier).toBe(2.0);
    // Non-overridden defaults stay at SRD values
    expect(defaults.meleeAttackAbility).toBe('stat_strength');
  });

  it('WeaponDefaults type is exported and has the expected shape', () => {
    const d: WeaponDefaults = {
      meleeAttackAbility:        'stat_strength',
      rangedAttackAbility:       'stat_dexterity',
      meleeDamageAbility:        'stat_strength',
      twoHandedDamageMultiplier: 1.5,
    };
    expect(d.meleeAttackAbility).toBe('stat_strength');
  });
});

describe('M3 — engine.getWeaponAttackBonus() / getWeaponDamageBonus()', () => {

  beforeEach(() => {
    // Set STR=16 (mod +3), DEX=14 (mod +2)
    engine.character.attributes['stat_strength'].baseValue  = 16;
    engine.character.attributes['stat_dexterity'].baseValue = 14;
  });

  it('getWeaponAttackBonus(0, false) — melee uses STR mod (+3) + BAB (0)', () => {
    expect(engine.getWeaponAttackBonus(0, false)).toBe(3); // STR mod = +3
  });

  it('getWeaponAttackBonus(2, false) — melee with +2 enhancement = STR mod + 2', () => {
    expect(engine.getWeaponAttackBonus(2, false)).toBe(5); // +3 STR + 2 enhancement
  });

  it('getWeaponAttackBonus(0, true) — ranged uses DEX mod (+2)', () => {
    expect(engine.getWeaponAttackBonus(0, true)).toBe(2); // DEX mod = +2
  });

  it('getWeaponDamageBonus(0, false) — melee one-handed uses full STR mod (+3)', () => {
    expect(engine.getWeaponDamageBonus(0, false)).toBe(3);
  });

  it('getWeaponDamageBonus(0, true) — two-handed uses floor(STR mod × 1.5) = floor(4.5) = 4', () => {
    expect(engine.getWeaponDamageBonus(0, true)).toBe(4); // floor(3 × 1.5) = 4
  });

  it('getWeaponDamageBonus(3, true) — two-handed + enhancement', () => {
    expect(engine.getWeaponDamageBonus(3, true)).toBe(7); // floor(3 × 1.5) + 3 = 7
  });

  it('uses overridden ability when config_weapon_defaults is cached', () => {
    // Add stat_agility = 18 (mod +4) and override melee to use it
    engine.character.attributes['stat_agility'] = {
      ...engine.character.attributes['stat_strength'],
      id: 'stat_agility',
      label: { en: 'Agility', fr: 'Agilité' },
      baseValue: 18,
    };

    dataLoader.cacheConfigTable(makeConfigTable('config_weapon_defaults', [
      { key: 'meleeAttackAbility',        abilityId: 'stat_agility' },
      { key: 'rangedAttackAbility',       abilityId: 'stat_dexterity' },
      { key: 'meleeDamageAbility',        abilityId: 'stat_agility' },
      { key: 'twoHandedDamageMultiplier', value: 1.5 },
    ]));

    // stat_agility mod = +4, not STR mod +3 → attack bonus should be +4
    expect(engine.getWeaponAttackBonus(0, false)).toBe(4);
    expect(engine.getWeaponDamageBonus(0, false)).toBe(4);
  });
});

// =============================================================================
// M4 — getSpellSaveDC(): isCastingAbility flag replaces hardcoded IDs
// =============================================================================

describe('M4 — engine.getSpellSaveDC() — isCastingAbility flag in config_attribute_definitions', () => {

  beforeEach(() => {
    // Set a known INT modifier: INT=16 → mod +3, WIS=10 → mod 0, CHA=8 → mod -1
    engine.character.attributes['stat_intelligence'].baseValue = 16;
    engine.character.attributes['stat_wisdom'].baseValue       = 10;
    engine.character.attributes['stat_charisma'].baseValue     = 8;
  });

  it('returns 10 + spell_level + 0 when no casting ability data is available (bootstrap)', () => {
    // With no caster_ability_* tags and no config table, fallback uses WIS/INT/CHA.
    // max(WIS mod 0, INT mod +3, CHA mod -1) = 3 → DC = 10 + 3 + 3 = 16
    expect(engine.getSpellSaveDC(3)).toBe(16);
  });

  it('uses isCastingAbility flag to identify valid casting stats from config table', () => {
    // Inject an attribute definitions table that ONLY flags stat_intelligence as a
    // casting ability (not WIS or CHA). This is the data-driven path.
    dataLoader.cacheConfigTable(makeConfigTable('config_attribute_definitions', [
      { id: 'stat_strength',     label: { en: 'Strength',     fr: 'Force' } },
      { id: 'stat_intelligence', label: { en: 'Intelligence', fr: 'Intelligence' }, isCastingAbility: true },
      { id: 'stat_wisdom',       label: { en: 'Wisdom',       fr: 'Sagesse' } },
      { id: 'stat_charisma',     label: { en: 'Charisma',     fr: 'Charisme' } },
    ]));

    // Now only INT is flagged → max of [INT +3] = +3, DC = 10 + 3 + 3 = 16
    // Same result here, but the path through the code is data-driven, not hardcoded.
    expect(engine.getSpellSaveDC(3)).toBe(16);
  });

  it('respects homebrew casting ability (e.g., stat_sanity) via isCastingAbility flag', () => {
    // Add a custom stat_sanity = 20 (mod +5) as the ONLY casting ability
    engine.character.attributes['stat_sanity'] = {
      ...engine.character.attributes['stat_strength'],
      id: 'stat_sanity',
      label: { en: 'Sanity', fr: 'Sanité' },
      baseValue: 20,
    };

    dataLoader.cacheConfigTable(makeConfigTable('config_attribute_definitions', [
      { id: 'stat_strength',     label: { en: 'Strength',     fr: 'Force' } },
      { id: 'stat_intelligence', label: { en: 'Intelligence', fr: 'Intelligence' } },
      { id: 'stat_wisdom',       label: { en: 'Wisdom',       fr: 'Sagesse' } },
      { id: 'stat_charisma',     label: { en: 'Charisma',     fr: 'Charisme' } },
      { id: 'stat_sanity',       label: { en: 'Sanity',       fr: 'Sanité'  }, isCastingAbility: true },
    ]));

    // stat_sanity mod = +5; INT = +3; WIS = 0; CHA = -1
    // Only stat_sanity has isCastingAbility: true → max([+5]) = +5
    // DC = 10 + 2 + 5 = 17
    expect(engine.getSpellSaveDC(2)).toBe(17);
  });

  it('falls back to WIS/INT/CHA bootstrap IDs when no isCastingAbility entry found', () => {
    // Table exists but no rows have isCastingAbility: true
    dataLoader.cacheConfigTable(makeConfigTable('config_attribute_definitions', [
      { id: 'stat_strength', label: { en: 'Strength', fr: 'Force' } },
      { id: 'stat_wisdom',   label: { en: 'Wisdom',   fr: 'Sagesse' } },
    ]));

    // No isCastingAbility flags → bootstrap fallback: max(WIS 0, INT +3, CHA -1) = +3
    // DC = 10 + 1 + 3 = 14
    expect(engine.getSpellSaveDC(1)).toBe(14);
  });

  it('uses explicit keyAbilityId when provided (bypasses all fallback logic)', () => {
    // Providing keyAbilityId bypasses tag lookup and isCastingAbility entirely
    // stat_wisdom = 10 → mod 0; DC = 10 + 4 + 0 = 14
    expect(engine.getSpellSaveDC(4, 'stat_wisdom')).toBe(14);
    // stat_intelligence = 16 → mod +3; DC = 10 + 4 + 3 = 17
    expect(engine.getSpellSaveDC(4, 'stat_intelligence')).toBe(17);
  });
});

// =============================================================================
// L6 — createEmptyCharacter(): speed_land base value from config_movement_defaults
// =============================================================================

describe('L6 — createEmptyCharacter() — speed_land base value from config_movement_defaults', () => {

  it('defaults speed_land to 30 when config_movement_defaults is not loaded (bootstrap)', () => {
    // DataLoader cache is empty (cleared in beforeEach).
    // The fallback in getSpeedDefault() returns 30 for speed_land.
    const char = createEmptyCharacter('test-spd-001', 'SpeedTest');
    expect(char.combatStats['combatStats.speed_land'].baseValue).toBe(30);
    // Other speeds default to 0
    expect(char.combatStats['combatStats.speed_burrow'].baseValue).toBe(0);
    expect(char.combatStats['combatStats.speed_fly'].baseValue).toBe(0);
  });

  it('reads speed_land base from config_movement_defaults when the table is cached', () => {
    // Override the default: this homebrew setting gives all characters 25 ft base speed.
    dataLoader.cacheConfigTable(makeConfigTable('config_movement_defaults', [
      { pipelineId: 'combatStats.speed_land', defaultBaseValue: 25 },
    ]));

    const char = createEmptyCharacter('test-spd-002', 'SlowDefault');
    expect(char.combatStats['combatStats.speed_land'].baseValue).toBe(25);
    // Unconfigured speeds still fall back to 0
    expect(char.combatStats['combatStats.speed_burrow'].baseValue).toBe(0);
  });

  it('can set a non-zero default fly speed for flying-capable homebrew settings', () => {
    dataLoader.cacheConfigTable(makeConfigTable('config_movement_defaults', [
      { pipelineId: 'combatStats.speed_land', defaultBaseValue: 30 },
      { pipelineId: 'combatStats.speed_fly',  defaultBaseValue: 20 },
    ]));

    const char = createEmptyCharacter('test-spd-003', 'FlyDefault');
    expect(char.combatStats['combatStats.speed_land'].baseValue).toBe(30);
    expect(char.combatStats['combatStats.speed_fly'].baseValue).toBe(20);
  });

  it('all speed pipelines are present on a new character regardless of config', () => {
    const char = createEmptyCharacter('test-spd-004', 'AllSpeeds');
    const expectedPipelines = [
      'combatStats.speed_land',
      'combatStats.speed_burrow',
      'combatStats.speed_climb',
      'combatStats.speed_fly',
      'combatStats.speed_swim',
    ];
    for (const pid of expectedPipelines) {
      expect(char.combatStats[pid], `Missing pipeline: ${pid}`).toBeDefined();
    }
  });
});

// =============================================================================
// L7 — SYNERGY_SOURCE_LABEL_KEY: i18n key lives in ui-strings.ts, not constants.ts
// =============================================================================

describe('L7 — SYNERGY_SOURCE_LABEL_KEY — externalized i18n key in constants.ts', () => {

  it('SYNERGY_SOURCE_LABEL_KEY is the ui-strings.ts key "modifier.synergy"', () => {
    expect(SYNERGY_SOURCE_LABEL_KEY).toBe('modifier.synergy');
  });

  it('English "Synergy" baseline is registered in UI_STRINGS', () => {
    // The translation must live in ui-strings.ts, not in constants.ts.
    expect(UI_STRINGS[SYNERGY_SOURCE_LABEL_KEY]).toBe('Synergy');
  });

  it('ui() resolves to "Synergy" in English', () => {
    expect(ui(SYNERGY_SOURCE_LABEL_KEY, 'en')).toBe('Synergy');
  });

  it('ui() resolves to French "Synergie" when the locale is loaded', () => {
    // Inject the French translation via the test helper (no HTTP fetch needed).
    // In production this comes from static/locales/fr.json.
    loadUiLocaleFromObject('fr', { [SYNERGY_SOURCE_LABEL_KEY]: 'Synergie' });
    expect(ui(SYNERGY_SOURCE_LABEL_KEY, 'fr')).toBe('Synergie');
  });

  // Backward-compat: the deprecated SYNERGY_SOURCE_LABEL shim still resolves
  // the English value at access time. Remove this test when the shim is removed.
  it('deprecated SYNERGY_SOURCE_LABEL shim returns the English string', () => {
    expect(SYNERGY_SOURCE_LABEL.en).toBe('Synergy');
  });
});
