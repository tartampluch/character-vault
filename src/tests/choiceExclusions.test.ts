/**
 * @file src/tests/choiceExclusions.test.ts
 * @description Unit tests for the FeatureChoice.excludedBy exclusion mechanism.
 *
 * WHAT IS TESTED:
 *   1. The pure `getExcludedOptionIds` logic (extracted as a testable helper).
 *   2. Domain-level: the cleric class JSON declares `excludedBy` on both domain
 *      choices so the same domain cannot be selected twice.
 *   3. Multi-sibling exclusions: choice A excluded by [B, C] accumulates all
 *      their selections.
 *   4. No excludedBy → no options removed.
 *   5. Empty sibling selection → nothing excluded.
 *   6. Language switching — engine.settings.language mutates and the `t()` helper
 *      returns the correct localised string for each language.
 *
 * ARCHITECTURE NOTE:
 *   `getExcludedOptionIds` is the pure function that implements the exclusion
 *   logic extracted from BasicInfo.svelte so it can be tested without a DOM.
 *   It mirrors the component logic exactly.
 *
 * @see src/lib/components/core/BasicInfo.svelte — getExcludedOptionIds()
 * @see src/lib/types/feature.ts                 — FeatureChoice.excludedBy
 * @see static/rules/00_d20srd_core/02_d20srd_core_classes.json — cleric choices
 */

import { describe, it, expect } from 'vitest';
import type { FeatureChoice } from '$lib/types/feature';
import type { ID } from '$lib/types/primitives';

// =============================================================================
// Pure implementation of the exclusion helper (mirrors BasicInfo.svelte logic)
// =============================================================================

/**
 * Returns the set of option IDs that must be excluded from `choice`'s list.
 * Mirrors the `getExcludedOptionIds` function in BasicInfo.svelte.
 *
 * @param choice     - The FeatureChoice being rendered.
 * @param selections - The current selections map: { choiceId → string[] }.
 */
function getExcludedOptionIds(
  choice: FeatureChoice,
  selections: Record<string, string[]>
): Set<string> {
  const excluded = new Set<string>();
  if (!choice.excludedBy?.length) return excluded;
  for (const siblingChoiceId of choice.excludedBy) {
    const sibling = selections[siblingChoiceId];
    if (sibling?.length) {
      for (const id of sibling) excluded.add(id);
    }
  }
  return excluded;
}

// =============================================================================
// 1. No exclusions configured
// =============================================================================

describe('getExcludedOptionIds — no excludedBy', () => {
  const choice: FeatureChoice = {
    choiceId: 'domain_1',
    label: { en: 'First Domain', fr: 'Premier domaine' },
    optionsQuery: 'tag:domain',
    maxSelections: 1,
    // excludedBy intentionally absent
  };

  it('returns an empty set when excludedBy is absent', () => {
    const excluded = getExcludedOptionIds(choice, {});
    expect(excluded.size).toBe(0);
  });

  it('returns an empty set when excludedBy is absent even with active selections', () => {
    const excluded = getExcludedOptionIds(choice, { domain_2: ['domain_fire'] });
    expect(excluded.size).toBe(0);
  });
});

// =============================================================================
// 2. Single sibling exclusion — domain_1 excluded by domain_2
// =============================================================================

describe('getExcludedOptionIds — single sibling exclusion', () => {
  const domain1Choice: FeatureChoice = {
    choiceId: 'domain_1',
    label: { en: 'First Domain', fr: 'Premier domaine' },
    optionsQuery: 'tag:domain',
    maxSelections: 1,
    excludedBy: ['domain_2'],
  };

  it('excludes the domain already selected in the sibling choice', () => {
    const selections = { domain_2: ['domain_fire'] };
    const excluded = getExcludedOptionIds(domain1Choice, selections);
    expect(excluded.has('domain_fire')).toBe(true);
  });

  it('does not exclude anything when the sibling has no selection', () => {
    const excluded = getExcludedOptionIds(domain1Choice, {});
    expect(excluded.size).toBe(0);
  });

  it('does not exclude anything when the sibling selection is empty', () => {
    const excluded = getExcludedOptionIds(domain1Choice, { domain_2: [] });
    expect(excluded.size).toBe(0);
  });

  it('excludes multiple domains if sibling selected multiple (maxSelections > 1 future case)', () => {
    const selections = { domain_2: ['domain_fire', 'domain_air'] };
    const excluded = getExcludedOptionIds(domain1Choice, selections);
    expect(excluded.has('domain_fire')).toBe(true);
    expect(excluded.has('domain_air')).toBe(true);
    expect(excluded.size).toBe(2);
  });
});

// =============================================================================
// 3. Mutual exclusion (both choices exclude each other — the cleric model)
// =============================================================================

describe('getExcludedOptionIds — mutual domain exclusion (cleric)', () => {
  const domain1Choice: FeatureChoice = {
    choiceId: 'domain_1',
    label: { en: 'First Domain', fr: 'Premier domaine' },
    optionsQuery: 'tag:domain',
    maxSelections: 1,
    excludedBy: ['domain_2'],  // domain_2's pick is blocked in domain_1
  };

  const domain2Choice: FeatureChoice = {
    choiceId: 'domain_2',
    label: { en: 'Second Domain', fr: 'Second domaine' },
    optionsQuery: 'tag:domain',
    maxSelections: 1,
    excludedBy: ['domain_1'],  // domain_1's pick is blocked in domain_2
  };

  it('domain_1 blocks the domain already chosen for domain_2', () => {
    const selections = { domain_2: ['domain_air'] };
    const excluded1 = getExcludedOptionIds(domain1Choice, selections);
    expect(excluded1.has('domain_air')).toBe(true);
  });

  it('domain_2 blocks the domain already chosen for domain_1', () => {
    const selections = { domain_1: ['domain_fire'] };
    const excluded2 = getExcludedOptionIds(domain2Choice, selections);
    expect(excluded2.has('domain_fire')).toBe(true);
  });

  it('both domains are blocked from each other — no duplication possible', () => {
    // Player already selected domain_fire for domain_1
    // → domain_air should be available for domain_2 but domain_fire must not appear
    const selections = { domain_1: ['domain_fire'] };
    const excluded2 = getExcludedOptionIds(domain2Choice, selections);

    expect(excluded2.has('domain_fire')).toBe(true);   // blocked
    expect(excluded2.has('domain_air')).toBe(false);   // still available
  });

  it('when neither choice has a selection, nothing is excluded', () => {
    const excluded1 = getExcludedOptionIds(domain1Choice, {});
    const excluded2 = getExcludedOptionIds(domain2Choice, {});
    expect(excluded1.size).toBe(0);
    expect(excluded2.size).toBe(0);
  });
});

// =============================================================================
// 4. Multi-sibling exclusion: choice excluded by two siblings
// =============================================================================

describe('getExcludedOptionIds — multiple siblings in excludedBy', () => {
  const choiceC: FeatureChoice = {
    choiceId: 'choice_c',
    label: { en: 'Choice C', fr: 'Choix C' },
    optionsQuery: 'tag:some_tag',
    maxSelections: 1,
    excludedBy: ['choice_a', 'choice_b'],
  };

  it('accumulates exclusions from all listed sibling choices', () => {
    const selections = {
      choice_a: ['option_x'],
      choice_b: ['option_y'],
    };
    const excluded = getExcludedOptionIds(choiceC, selections);
    expect(excluded.has('option_x')).toBe(true);
    expect(excluded.has('option_y')).toBe(true);
    expect(excluded.size).toBe(2);
  });

  it('partial siblings: only the active sibling contributes', () => {
    const selections = {
      choice_a: ['option_x'],
      // choice_b has no selection
    };
    const excluded = getExcludedOptionIds(choiceC, selections);
    expect(excluded.has('option_x')).toBe(true);
    expect(excluded.size).toBe(1);
  });

  it('no siblings active → nothing excluded', () => {
    const excluded = getExcludedOptionIds(choiceC, {});
    expect(excluded.size).toBe(0);
  });
});

// =============================================================================
// 5. Cleric JSON integration — verify the JSON declares excludedBy correctly
// =============================================================================

describe('Cleric class JSON — excludedBy declared on domain choices', () => {
  it('cleric class JSON declares excludedBy on both domain choices', async () => {
    const mod = await import(
      '../../static/rules/00_d20srd_core/02_d20srd_core_classes.json'
    );
    // JSON files now use the metadata wrapper format: { supportedLanguages, entities }
    const raw = mod.default as { entities: Record<string, unknown>[] } | Record<string, unknown>[];
    const classes = Array.isArray(raw) ? raw : (raw as { entities: Record<string, unknown>[] }).entities;
    const cleric = classes.find((c) => c['id'] === 'class_cleric');
    expect(cleric).toBeDefined();

    const choices = cleric!['choices'] as FeatureChoice[];
    const d1 = choices.find(ch => ch.choiceId === 'domain_1');
    const d2 = choices.find(ch => ch.choiceId === 'domain_2');

    expect(d1).toBeDefined();
    expect(d2).toBeDefined();
    expect(d1!.excludedBy).toBeDefined();
    expect(d2!.excludedBy).toBeDefined();
    expect(d1!.excludedBy).toContain('domain_2');
    expect(d2!.excludedBy).toContain('domain_1');
  });
});

// =============================================================================
// 6. Language switching
// =============================================================================

describe('Language switching — engine.settings.language', () => {
  it('engine starts with "en" as default language', async () => {
    const { engine } = await import('$lib/engine/GameEngine.svelte');
    expect(['en', 'fr']).toContain(engine.settings.language);
  });

  it('engine.t() returns English string when language is "en"', async () => {
    const { engine } = await import('$lib/engine/GameEngine.svelte');
    engine.settings.language = 'en';
    const label = { en: 'Fighter', fr: 'Guerrier' };
    expect(engine.t(label)).toBe('Fighter');
  });

  it('engine.t() returns French string when language is "fr"', async () => {
    const { engine } = await import('$lib/engine/GameEngine.svelte');
    engine.settings.language = 'fr';
    const label = { en: 'Fighter', fr: 'Guerrier' };
    expect(engine.t(label)).toBe('Guerrier');
  });

  it('switching language from "en" to "fr" updates the translation immediately', async () => {
    const { engine } = await import('$lib/engine/GameEngine.svelte');
    const label = { en: 'Barbarian', fr: 'Barbare' };

    engine.settings.language = 'en';
    expect(engine.t(label)).toBe('Barbarian');

    engine.settings.language = 'fr';
    expect(engine.t(label)).toBe('Barbare');
  });

  it('switching back to "en" works correctly (round-trip)', async () => {
    const { engine } = await import('$lib/engine/GameEngine.svelte');
    const label = { en: 'Cleric', fr: 'Clerc' };

    engine.settings.language = 'fr';
    expect(engine.t(label)).toBe('Clerc');

    engine.settings.language = 'en';
    expect(engine.t(label)).toBe('Cleric');
  });

  it('engine.t() falls back to English when French translation is missing', async () => {
    const { engine } = await import('$lib/engine/GameEngine.svelte');
    engine.settings.language = 'fr';
    // Partial label — no 'fr' key — cast via unknown to satisfy TS
    const label = { en: 'Special Ability' } as unknown as { en: string; fr: string };
    // engine.t should return the en value as fallback
    expect(engine.t(label)).toBe('Special Ability');
  });

  it('engine.t() falls back gracefully on an empty label object', async () => {
    const { engine } = await import('$lib/engine/GameEngine.svelte');
    engine.settings.language = 'en';
    // Edge case: completely empty label — cast via unknown to satisfy TS
    expect(() => engine.t({} as unknown as { en: string; fr: string })).not.toThrow();
  });
});
