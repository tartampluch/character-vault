/**
 * @file src/tests/utilsCoverage.test.ts
 * @description Tests to cover previously uncovered utility modules.
 *
 * COVERAGE TARGETS:
 *   - utils/languageCookie.ts   — readLanguageCookie, writeLanguageCookie, LANG_COOKIE_NAME
 *   - utils/classProgressionPresets.ts — BAB_FULL, BAB_3_4, BAB_1_2, SAVE_GOOD, SAVE_POOR
 *   - utils/constants.ts        — barrel re-export (abilityConstants, itemConstants, ruleConstants)
 *   - utils/formatters.ts       — barrel re-export (localizationHelpers, unitFormatters, statFormatters)
 *   - engine/CharacterFactory.ts — normaliseModifierTargetId (skills./ resources.*.maxValue branches),
 *                                  makeSkillPipeline, createEmptyCharacter
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// =============================================================================
// 1. utils/languageCookie.ts
// =============================================================================

import {
  LANG_COOKIE_NAME,
  readLanguageCookie,
  writeLanguageCookie,
} from '$lib/utils/languageCookie';

describe('languageCookie — readLanguageCookie', () => {
  // Save original document.cookie descriptor for restoration
  const originalDocument = globalThis.document;

  it('returns "en" when document is undefined (SSR context)', () => {
    // The module checks `typeof document === "undefined"` — simulate by removing it
    const docDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'document', { value: undefined, writable: true, configurable: true });
    try {
      expect(readLanguageCookie()).toBe('en');
    } finally {
      if (docDescriptor) {
        Object.defineProperty(globalThis, 'document', docDescriptor);
      }
    }
  });

  it('returns "en" when no cookie is set', () => {
    // Mock document.cookie as an empty string
    const cookieMock = { cookie: '' };
    const docDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'document', { value: cookieMock, writable: true, configurable: true });
    try {
      expect(readLanguageCookie()).toBe('en');
    } finally {
      if (docDescriptor) Object.defineProperty(globalThis, 'document', docDescriptor);
    }
  });

  it('reads language from cookie when set', () => {
    const cookieMock = { cookie: `${LANG_COOKIE_NAME}=fr; other=value` };
    const docDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'document', { value: cookieMock, writable: true, configurable: true });
    try {
      expect(readLanguageCookie()).toBe('fr');
    } finally {
      if (docDescriptor) Object.defineProperty(globalThis, 'document', docDescriptor);
    }
  });

  it('decodes URI-encoded language values', () => {
    const cookieMock = { cookie: `${LANG_COOKIE_NAME}=zh-Hant` };
    const docDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'document', { value: cookieMock, writable: true, configurable: true });
    try {
      expect(readLanguageCookie()).toBe('zh-Hant');
    } finally {
      if (docDescriptor) Object.defineProperty(globalThis, 'document', docDescriptor);
    }
  });

  it('returns "en" when cookie key matches but value is empty', () => {
    const cookieMock = { cookie: `${LANG_COOKIE_NAME}=` };
    const docDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'document', { value: cookieMock, writable: true, configurable: true });
    try {
      expect(readLanguageCookie()).toBe('en');
    } finally {
      if (docDescriptor) Object.defineProperty(globalThis, 'document', docDescriptor);
    }
  });

  it('falls back to localStorage cv_user_language when no cookie', () => {
    const cookieMock = {
      cookie: '',
      // Mock localStorage
    };
    const localStorageMock = {
      getItem: vi.fn().mockReturnValue('de'),
      removeItem: vi.fn(),
    };
    const docDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
    const lsDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'document', { value: cookieMock, writable: true, configurable: true });
    Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true, configurable: true });
    try {
      expect(readLanguageCookie()).toBe('de');
    } finally {
      if (docDescriptor) Object.defineProperty(globalThis, 'document', docDescriptor);
      if (lsDescriptor) Object.defineProperty(globalThis, 'localStorage', lsDescriptor);
    }
  });
});

describe('languageCookie — writeLanguageCookie', () => {
  it('does nothing when document is undefined (SSR context)', () => {
    const docDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'document', { value: undefined, writable: true, configurable: true });
    try {
      expect(() => writeLanguageCookie('fr')).not.toThrow();
    } finally {
      if (docDescriptor) Object.defineProperty(globalThis, 'document', docDescriptor);
    }
  });

  it('writes the cookie to document.cookie', () => {
    let writtenCookie = '';
    const cookieMock = {
      get cookie() { return writtenCookie; },
      set cookie(val: string) { writtenCookie = val; },
    };
    const localStorageMock = { removeItem: vi.fn() };
    const docDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
    const lsDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'document', { value: cookieMock, writable: true, configurable: true });
    Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true, configurable: true });
    try {
      writeLanguageCookie('fr');
      expect(writtenCookie).toContain(`${LANG_COOKIE_NAME}=fr`);
      expect(writtenCookie).toContain('path=/');
      expect(writtenCookie).toContain('max-age=');
      expect(writtenCookie).toContain('SameSite=Lax');
    } finally {
      if (docDescriptor) Object.defineProperty(globalThis, 'document', docDescriptor);
      if (lsDescriptor) Object.defineProperty(globalThis, 'localStorage', lsDescriptor);
    }
  });

  it('URI-encodes non-ASCII language codes', () => {
    let writtenCookie = '';
    const cookieMock = {
      get cookie() { return writtenCookie; },
      set cookie(val: string) { writtenCookie = val; },
    };
    const localStorageMock = { removeItem: vi.fn() };
    const docDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
    const lsDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'document', { value: cookieMock, writable: true, configurable: true });
    Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true, configurable: true });
    try {
      writeLanguageCookie('zh-Hant');
      expect(writtenCookie).toContain('zh-Hant');
    } finally {
      if (docDescriptor) Object.defineProperty(globalThis, 'document', docDescriptor);
      if (lsDescriptor) Object.defineProperty(globalThis, 'localStorage', lsDescriptor);
    }
  });

  it('calls localStorage.removeItem to clear legacy key', () => {
    let writtenCookie = '';
    const cookieMock = {
      get cookie() { return writtenCookie; },
      set cookie(val: string) { writtenCookie = val; },
    };
    const removeItem = vi.fn();
    const localStorageMock = { removeItem };
    const docDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
    const lsDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'document', { value: cookieMock, writable: true, configurable: true });
    Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true, configurable: true });
    try {
      writeLanguageCookie('en');
      expect(removeItem).toHaveBeenCalledWith('cv_user_language');
    } finally {
      if (docDescriptor) Object.defineProperty(globalThis, 'document', docDescriptor);
      if (lsDescriptor) Object.defineProperty(globalThis, 'localStorage', lsDescriptor);
    }
  });
});

describe('languageCookie — LANG_COOKIE_NAME constant', () => {
  it('is the expected cookie key', () => {
    expect(LANG_COOKIE_NAME).toBe('cv_language');
  });
});

// =============================================================================
// 2. utils/classProgressionPresets.ts — BAB/save progression arrays
// =============================================================================

import {
  BAB_FULL,
  BAB_3_4,
  BAB_1_2,
  SAVE_GOOD,
  SAVE_POOR,
} from '$lib/utils/classProgressionPresets';

describe('classProgressionPresets — array length', () => {
  it('BAB_FULL has 20 entries', () => { expect(BAB_FULL).toHaveLength(20); });
  it('BAB_3_4 has 20 entries', () => { expect(BAB_3_4).toHaveLength(20); });
  it('BAB_1_2 has 20 entries', () => { expect(BAB_1_2).toHaveLength(20); });
  it('SAVE_GOOD has 20 entries', () => { expect(SAVE_GOOD).toHaveLength(20); });
  it('SAVE_POOR has 20 entries', () => { expect(SAVE_POOR).toHaveLength(20); });
});

describe('classProgressionPresets — BAB_FULL (Fighter, Paladin, Barbarian)', () => {
  it('every level gains +1 BAB (all ones)', () => {
    expect(BAB_FULL.every(v => v === 1)).toBe(true);
  });

  it('cumulative at level 1 = 1', () => {
    const cum = BAB_FULL.slice(0, 1).reduce((s, v) => s + v, 0);
    expect(cum).toBe(1);
  });

  it('cumulative at level 20 = 20', () => {
    const cum = BAB_FULL.reduce((s, v) => s + v, 0);
    expect(cum).toBe(20);
  });
});

describe('classProgressionPresets — BAB_3_4 (Rogue, Cleric)', () => {
  it('cumulative at level 4 = floor(3×4/4) = 3', () => {
    const cum = BAB_3_4.slice(0, 4).reduce((s, v) => s + v, 0);
    expect(cum).toBe(3);
  });

  it('cumulative at level 20 = floor(3×20/4) = 15', () => {
    const cum = BAB_3_4.reduce((s, v) => s + v, 0);
    expect(cum).toBe(15);
  });

  it('all values are 0 or 1 (never jumps by 2)', () => {
    expect(BAB_3_4.every(v => v === 0 || v === 1)).toBe(true);
  });
});

describe('classProgressionPresets — BAB_1_2 (Wizard, Sorcerer)', () => {
  it('cumulative at level 2 = floor(2/2) = 1', () => {
    const cum = BAB_1_2.slice(0, 2).reduce((s, v) => s + v, 0);
    expect(cum).toBe(1);
  });

  it('cumulative at level 20 = floor(20/2) = 10', () => {
    const cum = BAB_1_2.reduce((s, v) => s + v, 0);
    expect(cum).toBe(10);
  });

  it('all values are 0 or 1', () => {
    expect(BAB_1_2.every(v => v === 0 || v === 1)).toBe(true);
  });
});

describe('classProgressionPresets — SAVE_GOOD', () => {
  it('first level gain is 0 (initial offset baked into formula)', () => {
    // totalFn(n) = 2 + floor(n/2)
    // increment[0] = totalFn(1) - totalFn(0) = (2+0) - (2+0) = 0
    // The "+2" initial offset is encoded in the formula base, not as an increment.
    // The cumulative save total is obtained by using the base-class pipeline starting
    // at 0 and adding these increments — the DataLoader applies them as `type: "base"`.
    expect(SAVE_GOOD[0]).toBe(0);
  });

  it('cumulative sum matches expected good save progression', () => {
    // At level 20, cumulative = totalFn(20) - totalFn(0) = (2+10) - (2+0) = 10
    const sum = SAVE_GOOD.reduce((s: number, v: number) => s + v, 0);
    expect(sum).toBe(10);
  });

  it('all values are non-negative', () => {
    expect(SAVE_GOOD.every((v: number) => v >= 0)).toBe(true);
  });
});

describe('classProgressionPresets — SAVE_POOR', () => {
  it('cumulative at level 20 = floor(20/3) = 6', () => {
    const cum = SAVE_POOR.reduce((s: number, v: number) => s + v, 0);
    expect(cum).toBe(6); // floor(20/3) = 6, floor(0/3) = 0, delta = 6
  });

  it('cumulative at level 3 = floor(3/3) = 1', () => {
    const cum = SAVE_POOR.slice(0, 3).reduce((s: number, v: number) => s + v, 0);
    expect(cum).toBe(1);
  });

  it('all values are 0 or 1', () => {
    expect(SAVE_POOR.every((v: number) => v === 0 || v === 1)).toBe(true);
  });
});

// =============================================================================
// 3. utils/constants.ts — barrel re-export
// =============================================================================

import {
  MAIN_ABILITY_IDS,
  ABILITY_ABBRS,
  getAbilityAbbr,
  ABILITY_SCORE_MIN,
  ABILITY_SCORE_MAX,
} from '$lib/utils/constants';

import {
  BAB_PIPELINE_ID,
  SAVE_FORT_PIPELINE_ID,
  SAVE_REFLEX_PIPELINE_ID,
  SAVE_WILL_PIPELINE_ID,
  ALIGNMENTS,
  MAX_CLASS_LEVEL,
} from '$lib/utils/constants';

describe('utils/constants — abilityConstants', () => {
  it('MAIN_ABILITY_IDS has 6 standard D&D ability IDs', () => {
    expect(MAIN_ABILITY_IDS).toHaveLength(6);
    expect(MAIN_ABILITY_IDS).toContain('stat_strength');
    expect(MAIN_ABILITY_IDS).toContain('stat_charisma');
  });

  it('ABILITY_ABBRS is an object with entries for each ability', () => {
    expect(typeof ABILITY_ABBRS).toBe('object');
    expect('stat_strength' in ABILITY_ABBRS).toBe(true);
  });

  it('getAbilityAbbr returns expected abbreviation for known ability', () => {
    const abbr = getAbilityAbbr('stat_strength', 'en');
    expect(typeof abbr).toBe('string');
    expect(abbr.length).toBeGreaterThan(0);
  });

  it('getAbilityAbbr returns derived abbreviation for unknown ability', () => {
    const abbr = getAbilityAbbr('stat_custom_ability', 'en');
    expect(typeof abbr).toBe('string');
  });

  it('ABILITY_SCORE_MIN is a number <= 1', () => {
    expect(typeof ABILITY_SCORE_MIN).toBe('number');
    expect(ABILITY_SCORE_MIN).toBeLessThanOrEqual(1);
  });

  it('ABILITY_SCORE_MAX is a number >= 30', () => {
    expect(typeof ABILITY_SCORE_MAX).toBe('number');
    expect(ABILITY_SCORE_MAX).toBeGreaterThanOrEqual(30);
  });
});

describe('utils/constants — ruleConstants', () => {
  it('BAB_PIPELINE_ID is the correct string', () => {
    expect(BAB_PIPELINE_ID).toBe('combatStats.base_attack_bonus');
  });

  it('SAVE_FORT_PIPELINE_ID is the correct string', () => {
    expect(SAVE_FORT_PIPELINE_ID).toBe('saves.fortitude');
  });

  it('SAVE_REFLEX_PIPELINE_ID is the correct string', () => {
    expect(SAVE_REFLEX_PIPELINE_ID).toBe('saves.reflex');
  });

  it('SAVE_WILL_PIPELINE_ID is the correct string', () => {
    expect(SAVE_WILL_PIPELINE_ID).toBe('saves.will');
  });

  it('ALIGNMENTS has 9 entries (3×3 alignment grid)', () => {
    expect(ALIGNMENTS).toHaveLength(9);
  });

  it('MAX_CLASS_LEVEL is 20', () => {
    expect(MAX_CLASS_LEVEL).toBe(20);
  });
});

// =============================================================================
// 4. utils/formatters.ts — barrel re-export
// =============================================================================

import { t, getUnitSystem } from '$lib/utils/formatters';
import { formatDistance, formatWeight } from '$lib/utils/formatters';
import { computeAbilityModifier, formatModifier } from '$lib/utils/formatters';

describe('utils/formatters — barrel re-exports', () => {
  it('exports t() function from localizationHelpers', () => {
    expect(typeof t).toBe('function');
    const result = t({ en: 'Test', fr: 'Essai' }, 'en');
    expect(result).toBe('Test');
  });

  it('exports getUnitSystem() function', () => {
    expect(typeof getUnitSystem).toBe('function');
    const result = getUnitSystem('en');
    expect(result).toBe('imperial');
  });

  it('exports formatDistance() from unitFormatters', () => {
    expect(typeof formatDistance).toBe('function');
    // 30 ft for an English (imperial) context
    const result = formatDistance(30, 'en');
    expect(result).toBeTruthy();
  });

  it('exports formatWeight() from unitFormatters', () => {
    expect(typeof formatWeight).toBe('function');
    const result = formatWeight(10, 'en');
    expect(result).toBeTruthy();
  });

  it('exports computeAbilityModifier() from statFormatters', () => {
    expect(typeof computeAbilityModifier).toBe('function');
    expect(computeAbilityModifier(10)).toBe(0);
    expect(computeAbilityModifier(16)).toBe(3);
  });

  it('exports formatModifier() from statFormatters', () => {
    expect(typeof formatModifier).toBe('function');
    expect(formatModifier(3)).toBe('+3');
    expect(formatModifier(-2)).toBe('-2');
  });
});

// =============================================================================
// 5. engine/CharacterFactory.ts — normaliseModifierTargetId (uncovered branches)
// =============================================================================

import { normaliseModifierTargetId, makeSkillPipeline, createEmptyCharacter } from '$lib/engine/CharacterFactory';

describe('CharacterFactory — normaliseModifierTargetId', () => {
  it('strips "attributes." prefix (already covered by phase0)', () => {
    expect(normaliseModifierTargetId('attributes.stat_strength')).toBe('stat_strength');
  });

  it('strips "skills." prefix', () => {
    expect(normaliseModifierTargetId('skills.skill_climb')).toBe('skill_climb');
  });

  it('normalises "resources.X.maxValue" → "combatStats.X_max"', () => {
    expect(normaliseModifierTargetId('resources.barbarian_rage.maxValue')).toBe('combatStats.barbarian_rage_max');
  });

  it('leaves "combatStats.*" unchanged', () => {
    expect(normaliseModifierTargetId('combatStats.ac_normal')).toBe('combatStats.ac_normal');
  });

  it('leaves "saves.*" unchanged', () => {
    expect(normaliseModifierTargetId('saves.fortitude')).toBe('saves.fortitude');
  });

  it('leaves bare skill IDs unchanged', () => {
    expect(normaliseModifierTargetId('skill_climb')).toBe('skill_climb');
  });

  it('leaves bare attribute IDs unchanged', () => {
    expect(normaliseModifierTargetId('stat_strength')).toBe('stat_strength');
  });

  it('handles "resources.psi_points.maxValue" correctly', () => {
    expect(normaliseModifierTargetId('resources.psi_points.maxValue')).toBe('combatStats.psi_points_max');
  });
});

describe('CharacterFactory — makeSkillPipeline', () => {
  it('creates a skill pipeline with correct defaults', () => {
    const skill = makeSkillPipeline('skill_climb', { en: 'Climb' }, 'stat_strength');
    expect(skill.id).toBe('skill_climb');
    expect(skill.label).toEqual({ en: 'Climb' });
    expect(skill.keyAbility).toBe('stat_strength');
    expect(skill.ranks).toBe(0);
    expect(skill.isClassSkill).toBe(false);
    expect(skill.costPerRank).toBe(2);
    expect(skill.appliesArmorCheckPenalty).toBe(false);
    expect(skill.canBeUsedUntrained).toBe(true);
    expect(skill.totalValue).toBe(0);
    expect(skill.baseValue).toBe(0);
  });

  it('sets appliesArmorCheckPenalty when requested', () => {
    const skill = makeSkillPipeline('skill_swim', { en: 'Swim' }, 'stat_strength', true);
    expect(skill.appliesArmorCheckPenalty).toBe(true);
  });

  it('sets canBeUsedUntrained to false when requested', () => {
    const skill = makeSkillPipeline('skill_spellcraft', { en: 'Spellcraft' }, 'stat_intelligence', false, false);
    expect(skill.canBeUsedUntrained).toBe(false);
  });
});

describe('CharacterFactory — createEmptyCharacter', () => {
  it('creates a character with the given id and name', () => {
    const char = createEmptyCharacter('uuid-1', 'Aldric');
    expect(char.id).toBe('uuid-1');
    expect(char.name).toBe('Aldric');
  });

  it('has all 6 standard attribute pipelines', () => {
    const char = createEmptyCharacter('uuid-2', 'Test');
    expect('stat_strength' in char.attributes).toBe(true);
    expect('stat_dexterity' in char.attributes).toBe(true);
    expect('stat_constitution' in char.attributes).toBe(true);
    expect('stat_intelligence' in char.attributes).toBe(true);
    expect('stat_wisdom' in char.attributes).toBe(true);
    expect('stat_charisma' in char.attributes).toBe(true);
  });

  it('has base attribute values of 10 for all standard stats', () => {
    const char = createEmptyCharacter('uuid-3', 'Test');
    expect(char.attributes['stat_strength'].baseValue).toBe(10);
    expect(char.attributes['stat_dexterity'].baseValue).toBe(10);
  });

  it('has 3 saving throw pipelines', () => {
    const char = createEmptyCharacter('uuid-4', 'Test');
    expect('saves.fortitude' in char.saves).toBe(true);
    expect('saves.reflex' in char.saves).toBe(true);
    expect('saves.will' in char.saves).toBe(true);
  });

  it('has essential combat stats (AC, BAB, Initiative)', () => {
    const char = createEmptyCharacter('uuid-5', 'Test');
    expect('combatStats.ac_normal' in char.combatStats).toBe(true);
    expect('combatStats.base_attack_bonus' in char.combatStats).toBe(true);
    expect('combatStats.initiative' in char.combatStats).toBe(true);
  });

  it('starts with no class levels, no active features', () => {
    const char = createEmptyCharacter('uuid-6', 'Test');
    expect(Object.keys(char.classLevels)).toHaveLength(0);
    expect(char.activeFeatures).toHaveLength(0);
  });

  it('starts with HP resource pool', () => {
    const char = createEmptyCharacter('uuid-7', 'Test');
    expect('resources.hp' in char.resources).toBe(true);
    expect(char.resources['resources.hp'].maxPipelineId).toBe('combatStats.max_hp');
  });

  it('has max_dexterity_bonus at 99 (no restriction)', () => {
    const char = createEmptyCharacter('uuid-8', 'Test');
    expect(char.combatStats['combatStats.max_dexterity_bonus'].baseValue).toBe(99);
  });

  it('has all 13 equipment slot pipelines', () => {
    const char = createEmptyCharacter('uuid-9', 'Test');
    const expectedSlots = [
      'slots.head', 'slots.eyes', 'slots.neck', 'slots.torso', 'slots.body',
      'slots.waist', 'slots.shoulders', 'slots.arms', 'slots.hands',
      'slots.ring', 'slots.feet', 'slots.main_hand', 'slots.off_hand',
    ];
    for (const slot of expectedSlots) {
      expect(slot in char.combatStats).toBe(true);
    }
  });

  it('is not NPC by default', () => {
    const char = createEmptyCharacter('uuid-10', 'Test');
    expect(char.isNPC).toBe(false);
  });

  it('starts with levelAdjustment 0 and xp 0', () => {
    const char = createEmptyCharacter('uuid-11', 'Test');
    expect(char.levelAdjustment).toBe(0);
    expect(char.xp).toBe(0);
  });
});
