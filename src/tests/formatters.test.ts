/**
 * @file src/tests/formatters.test.ts
 * @description Unit tests for all localization and formatting utilities.
 *
 * All functions in formatters.ts are PURE FUNCTIONS (no side effects, no state),
 * making them trivially testable in Node.js without any mocking or Svelte runtime.
 *
 * COVERAGE TARGET: formatters.ts — 100% statement/branch/function coverage.
 *
 * WHAT IS TESTED:
 *   - t()              : LocalizedString → string with 4-level fallback chain
 *   - formatDistance() : feet → locale-appropriate distance string
 *   - formatDistanceWithSettings(): CampaignSettings convenience overload
 *   - formatWeight()   : pounds → locale-appropriate weight string
 *   - formatWeightWithSettings(): CampaignSettings convenience overload
 *   - formatModifier() : numeric modifier with explicit +/- sign
 *   - formatCurrency() : amount + denomination string
 *   - formatDiceRolls(): die results array → readable string
 *
 * @see src/lib/utils/formatters.ts
 * @see ARCHITECTURE.md section 11 — i18n and Unit Conversion
 */

import { describe, it, expect } from 'vitest';
import {
  t,
  formatDistance,
  formatDistanceWithSettings,
  formatWeight,
  formatWeightWithSettings,
  formatModifier,
  formatCurrency,
  formatDiceRolls,
} from '$lib/utils/formatters';
import type { LocalizedString } from '$lib/types/i18n';

// =============================================================================
// HELPERS
// =============================================================================

function makeSettings(lang: 'en' | 'fr') {
  return {
    language: lang as 'en' | 'fr',
    statGeneration: { method: 'standard_array' as const, rerollOnes: false, pointBuyBudget: 25 },
    diceRules: { explodingTwenties: false },
    variantRules: { vitalityWoundPoints: false, gestalt: false },
    enabledRuleSources: ['srd_core'],
  };
}

// =============================================================================
// 1. t() — LocalizedString translation with fallback chain
// =============================================================================

describe('t() — LocalizedString translation', () => {
  it('returns the requested language when available', () => {
    const label: LocalizedString = { en: 'Strength', fr: 'Force' };
    expect(t(label, 'fr')).toBe('Force');
    expect(t(label, 'en')).toBe('Strength');
  });

  it('falls back to English when requested language is missing', () => {
    const label: LocalizedString = { en: 'Initiative', fr: 'Initiative' };
    // Simulate a 3rd language not in the object
    const labelNoFr: LocalizedString = { en: 'Strength' };
    expect(t(labelNoFr, 'fr')).toBe('Strength'); // Fallback: en
  });

  it('falls back to first available language when English is also missing', () => {
    // Homebrew content only in Spanish — should still render something
    const label: LocalizedString = { es: 'Fuerza' } as LocalizedString;
    expect(t(label, 'fr')).toBe('Fuerza'); // Falls back to first value
  });

  it('returns "??" sentinel when all languages are missing or object is empty', () => {
    const empty: LocalizedString = {} as LocalizedString;
    expect(t(empty, 'en')).toBe('??');
    expect(t(empty, 'fr')).toBe('??');
  });

  it('passes through plain strings unchanged (already translated)', () => {
    expect(t('Force', 'en')).toBe('Force');
    expect(t('Force', 'fr')).toBe('Force');
    expect(t('', 'en')).toBe(''); // empty string passes through
  });

  it('English fallback wins over first-key fallback when English key exists', () => {
    const label: LocalizedString = { de: 'Stärke', en: 'Strength' };
    // Requesting 'fr' (not available): falls back to English (not German)
    expect(t(label, 'fr')).toBe('Strength');
  });
});

// =============================================================================
// 2. formatDistance() — feet → locale display string
// =============================================================================

describe('formatDistance() — feet to display unit', () => {
  // English: 1:1 ratio, unit = "ft."
  it('English: 30 ft → "30 ft."', () => {
    expect(formatDistance(30, 'en')).toBe('30 ft.');
  });

  it('English: 0 ft → "0 ft."', () => {
    expect(formatDistance(0, 'en')).toBe('0 ft.');
  });

  it('English: 120 ft (darkvision) → "120 ft."', () => {
    expect(formatDistance(120, 'en')).toBe('120 ft.');
  });

  // French: × 0.3 multiplier, unit = "m"
  it('French: 30 ft → "9 m" (30 × 0.3 = 9)', () => {
    expect(formatDistance(30, 'fr')).toBe('9 m');
  });

  it('French: 25 ft → "7.5 m" (25 × 0.3 = 7.5, 1 decimal)', () => {
    expect(formatDistance(25, 'fr')).toBe('7.5 m');
  });

  it('French: 40 ft → "12 m" (40 × 0.3 = 12.0, no trailing zero)', () => {
    expect(formatDistance(40, 'fr')).toBe('12 m');
  });

  it('French: 60 ft (darkvision) → "18 m"', () => {
    expect(formatDistance(60, 'fr')).toBe('18 m');
  });

  it('French: 5 ft (1 square) → "1.5 m"', () => {
    expect(formatDistance(5, 'fr')).toBe('1.5 m');
  });

  it('French: 10 ft → "3 m"', () => {
    expect(formatDistance(10, 'fr')).toBe('3 m');
  });

  it('rounds to 1 decimal to avoid floating point noise', () => {
    // 3 ft × 0.3 = 0.8999... → rounds to 0.9
    const result = formatDistance(3, 'fr');
    expect(result).toBe('0.9 m');
  });
});

// =============================================================================
// 3. formatDistanceWithSettings() — CampaignSettings convenience overload
// =============================================================================

describe('formatDistanceWithSettings() — uses language from settings object', () => {
  it('English settings: 30 ft → "30 ft."', () => {
    expect(formatDistanceWithSettings(30, makeSettings('en'))).toBe('30 ft.');
  });

  it('French settings: 30 ft → "9 m"', () => {
    expect(formatDistanceWithSettings(30, makeSettings('fr'))).toBe('9 m');
  });
});

// =============================================================================
// 4. formatWeight() — pounds → locale display string
// =============================================================================

describe('formatWeight() — pounds to display unit', () => {
  // English: 1:1 ratio, unit = "lb."
  it('English: 10 lbs → "10 lb."', () => {
    expect(formatWeight(10, 'en')).toBe('10 lb.');
  });

  it('English: 0 lbs → "0 lb."', () => {
    expect(formatWeight(0, 'en')).toBe('0 lb.');
  });

  it('English: 50 lbs (full plate) → "50 lb."', () => {
    expect(formatWeight(50, 'en')).toBe('50 lb.');
  });

  // French: × 0.5 multiplier, unit = "kg"
  it('French: 10 lbs → "5 kg" (10 × 0.5 = 5)', () => {
    expect(formatWeight(10, 'fr')).toBe('5 kg');
  });

  it('French: 1 lb → "0.5 kg"', () => {
    expect(formatWeight(1, 'fr')).toBe('0.5 kg');
  });

  it('French: 50 lbs (full plate) → "25 kg"', () => {
    expect(formatWeight(50, 'fr')).toBe('25 kg');
  });

  it('French: 25 lbs → "12.5 kg"', () => {
    expect(formatWeight(25, 'fr')).toBe('12.5 kg');
  });

  it('French: 3 lbs → "1.5 kg"', () => {
    expect(formatWeight(3, 'fr')).toBe('1.5 kg');
  });
});

// =============================================================================
// 5. formatWeightWithSettings() — CampaignSettings convenience overload
// =============================================================================

describe('formatWeightWithSettings() — uses language from settings object', () => {
  it('English settings: 10 lbs → "10 lb."', () => {
    expect(formatWeightWithSettings(10, makeSettings('en'))).toBe('10 lb.');
  });

  it('French settings: 10 lbs → "5 kg"', () => {
    expect(formatWeightWithSettings(10, makeSettings('fr'))).toBe('5 kg');
  });
});

// =============================================================================
// 6. formatModifier() — explicit sign formatting
// =============================================================================

describe('formatModifier() — explicit +/- sign', () => {
  it('positive value gets "+" prefix: +4', () => {
    expect(formatModifier(4)).toBe('+4');
  });

  it('negative value keeps "-" prefix: -2', () => {
    expect(formatModifier(-2)).toBe('-2');
  });

  it('zero value gets "+" prefix: +0', () => {
    expect(formatModifier(0)).toBe('+0');
  });

  it('large positive: +18', () => {
    expect(formatModifier(18)).toBe('+18');
  });

  it('large negative: -5 (ability drain)', () => {
    expect(formatModifier(-5)).toBe('-5');
  });

  it('+1 (the most common modifier in D&D 3.5)', () => {
    expect(formatModifier(1)).toBe('+1');
  });
});

// =============================================================================
// 7. formatCurrency() — denomination formatting
// =============================================================================

describe('formatCurrency() — D&D 3.5 denomination formatting', () => {
  it('formats Gold Pieces: 150 GP', () => {
    expect(formatCurrency(150, 'GP')).toBe('150 GP');
  });

  it('formats Platinum Pieces: 5 PP', () => {
    expect(formatCurrency(5, 'PP')).toBe('5 PP');
  });

  it('formats Silver Pieces: 30 SP', () => {
    expect(formatCurrency(30, 'SP')).toBe('30 SP');
  });

  it('formats Copper Pieces: 100 CP', () => {
    expect(formatCurrency(100, 'CP')).toBe('100 CP');
  });

  it('formats 0 GP', () => {
    expect(formatCurrency(0, 'GP')).toBe('0 GP');
  });

  it('formats large amount (standard wand price): 750 GP', () => {
    expect(formatCurrency(750, 'GP')).toBe('750 GP');
  });
});

// =============================================================================
// 8. formatDiceRolls() — die results array → readable string
// =============================================================================

describe('formatDiceRolls() — dice roll display', () => {
  it('single d20 roll: "1d20: [17]"', () => {
    expect(formatDiceRolls([17], 20)).toBe('1d20: [17]');
  });

  it('4d6: "4d6: [4, 2, 6, 1]"', () => {
    expect(formatDiceRolls([4, 2, 6, 1], 6)).toBe('4d6: [4, 2, 6, 1]');
  });

  it('3d8: "3d8: [8, 3, 5]"', () => {
    expect(formatDiceRolls([8, 3, 5], 8)).toBe('3d8: [8, 3, 5]');
  });

  it('empty rolls array: "0d6: []"', () => {
    expect(formatDiceRolls([], 6)).toBe('0d6: []');
  });

  it('single 1: "1d4: [1]"', () => {
    expect(formatDiceRolls([1], 4)).toBe('1d4: [1]');
  });
});
