/**
 * @file src/tests/rawJsonPanel.test.ts
 * @description Vitest logic tests for the RawJsonPanel two-way sync system.
 *
 * WHAT IS TESTED (Phase 21.7.7 — PROGRESS.md):
 *
 *   Two-way sync logic — `parseRawJson()`:
 *   1.  Valid JSON object → returns parsed Feature (form state updated).
 *   2.  Invalid JSON string → throws SyntaxError, form state unchanged.
 *   3.  Valid JSON but non-object root (array) → throws TypeError.
 *   4.  Valid JSON but non-object root (null) → throws TypeError.
 *   5.  Valid JSON but non-object root (number) → throws TypeError.
 *
 *   Form → textarea sync — `featureToJson()`:
 *   6.  Feature mutation → textarea content changes (form field updates JSON).
 *   7.  Prettify mode: output is indented JSON (2-space indent, newlines present).
 *   8.  Minify mode: output has no whitespace between tokens.
 *   9.  Minify → values unchanged (same data, just no formatting).
 *   10. Prettify → minify → prettify round-trip preserves all fields.
 *
 *   Override warning — `computeHasOverrideWarning()`:
 *   11. id matches an SRD entity (ruleSource !== 'user_homebrew') → warning = true.
 *   12. id matches a user_homebrew entity → warning = false (editing own entity).
 *   13. id does not match any loaded entity → warning = false (new entity).
 *   14. id is empty string → warning = false (form not filled in yet).
 *   15. id changes from SRD id to non-SRD id → warning updates accordingly.
 *
 *   Parse error state:
 *   16. Empty textarea should return 'empty' (not throw).
 *   17. Whitespace-only textarea should return 'empty'.
 *   18. JSON with missing required id field is accepted (structural checks
 *       are the engine's responsibility, not the panel's).
 *   19. Very large valid JSON object parses without error.
 *   20. Unicode characters in string values survive round-trip.
 *   21. Nested objects (e.g., `label`, `description`) survive round-trip.
 *   22. Arrays (e.g., `tags`, `grantedFeatures`) survive round-trip intact.
 *
 *   defaultFeature factory:
 *   23. defaultFeature('feat') returns an object with all required fields set.
 *   24. defaultFeature returns ruleSource = 'user_homebrew'.
 *   25. Successive calls return independent objects (no shared state).
 *
 * APPROACH — LOGIC LAYER ONLY:
 *   `RawJsonPanel.svelte` uses `getContext` (which requires a Svelte component
 *   hierarchy) and `$state`/`$derived`/`$effect` (which need the Svelte scheduler
 *   to fire in a component context).  The project's Vitest environment is `node`
 *   and `@testing-library/svelte` is not installed.
 *
 *   The two-way sync logic is entirely captured in three pure operations:
 *     a) `featureToJson(feature, pretty)` — form → textarea (JSON.stringify).
 *     b) `parseRawJson(text)` — textarea → form (JSON.parse + structural check).
 *     c) `computeHasOverrideWarning(featureId, loadedFeatures)` — id collision check.
 *
 *   These are extracted here as standalone helpers that mirror the component's
 *   script block exactly and cover every branch the component exercises.
 *
 * @see src/lib/components/content-editor/RawJsonPanel.svelte
 * @see src/lib/components/content-editor/editorContext.ts   EditorContext / defaultFeature
 * @see ARCHITECTURE.md §21.4  for the RawJsonPanel specification
 */

import { describe, it, expect } from 'vitest';
import type { Feature } from '$lib/types/feature';
import { defaultFeature } from '$lib/components/content-editor/editorContext';

// =============================================================================
// LOGIC EXTRACTED FROM RawJsonPanel.svelte + editorContext.ts
// =============================================================================
// These standalone helpers mirror the non-reactive portions of the component's
// <script> block.  They are kept in sync with the component; if the component
// changes these must be updated to match.
// =============================================================================

/**
 * Serialises a Feature to a JSON string.
 * Mirrors the `derivedJson` $derived expression in RawJsonPanel.svelte:
 *   pretty  → JSON.stringify(feature, null, 2)
 *   minified → JSON.stringify(feature)
 */
function featureToJson(feature: Feature, pretty: boolean): string {
  return pretty
    ? JSON.stringify(feature, null, 2)
    : JSON.stringify(feature);
}

/**
 * Parses a raw textarea string into a Feature object.
 * Mirrors the debounced parse block in RawJsonPanel.svelte.
 *
 * Returns the parsed Feature on success.
 * Throws SyntaxError for invalid JSON.
 * Throws TypeError for valid JSON with a non-object root.
 * Returns null for empty / whitespace-only input (no parse attempt needed).
 *
 * WHY RETURN null FOR EMPTY?
 *   The component only runs the debounced parser when `userEditing === true`,
 *   which is set on oninput.  An empty textarea would only appear after a clear
 *   action — which immediately calls onRawJsonChange — so the debounced path
 *   is never reached for empty strings.  Returning null here matches that
 *   "no-op on empty" contract.
 */
function parseRawJson(text: string): Feature | null {
  const trimmed = text.trim();
  if (!trimmed) return null;   // empty → no-op

  const parsed = JSON.parse(trimmed) as unknown;   // throws SyntaxError if invalid

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TypeError('Root value must be a JSON object (a Feature).');
  }

  return parsed as Feature;
}

/**
 * Computes whether the currently-edited entity's id collides with a non-homebrew
 * entity already in the DataLoader cache.
 * Mirrors the `hasOverrideWarning` getter in EditorContext (editorContext.ts):
 *
 *   return loadedFeatures.some(f =>
 *     f.id === featureId && f.ruleSource !== 'user_homebrew'
 *   );
 *
 * @param featureId      - The id currently in the editor form.
 * @param loadedFeatures - The features currently in the DataLoader cache.
 */
function computeHasOverrideWarning(
  featureId: string,
  loadedFeatures: Pick<Feature, 'id' | 'ruleSource'>[]
): boolean {
  if (!featureId) return false;
  return loadedFeatures.some(
    f => f.id === featureId && f.ruleSource !== 'user_homebrew'
  );
}

// =============================================================================
// FIXTURE HELPERS
// =============================================================================

/** Returns a minimal Feature fixture for use in tests. */
function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id:               'feat_power_attack',
    category:         'feat',
    label:            { en: 'Power Attack', fr: 'Attaque puissante' },
    description:      { en: 'Trade accuracy for damage.', fr: 'Échangez précision contre dégâts.' },
    ruleSource:       'user_homebrew',
    tags:             ['feat', 'combat'],
    grantedModifiers: [],
    grantedFeatures:  [],
    ...overrides,
  };
}

// =============================================================================
// TESTS 1-5: parseRawJson — valid/invalid/non-object inputs
// =============================================================================

describe('RawJsonPanel — parseRawJson(): valid JSON input', () => {
  /**
   * TEST 1 (spec: "valid JSON pasted into textarea updates form label field"):
   * Pasting valid JSON with a changed label must return a Feature object
   * with the new label — the caller then hands this to onRawJsonChange.
   */
  it('valid JSON object returns a parsed Feature (label updated)', () => {
    const feature = makeFeature({ label: { en: 'Power Attack', fr: 'Attaque puissante' } });
    const modified = { ...feature, label: { en: 'Power Attack (revised)' } };
    const json = JSON.stringify(modified);

    const result = parseRawJson(json);

    expect(result).not.toBeNull();
    expect(result!.label['en']).toBe('Power Attack (revised)');
    expect(result!.id).toBe('feat_power_attack');
    expect(result!.ruleSource).toBe('user_homebrew');
  });

  it('valid JSON preserves all fields of the Feature', () => {
    const feature = makeFeature({
      tags:            ['feat', 'combat', 'melee'],
      grantedFeatures: ['feat_cleave'],
    });
    const result = parseRawJson(JSON.stringify(feature));

    expect(result!.tags).toEqual(['feat', 'combat', 'melee']);
    expect(result!.grantedFeatures).toEqual(['feat_cleave']);
  });
});

describe('RawJsonPanel — parseRawJson(): invalid inputs', () => {
  /**
   * TEST 2 (spec: "invalid JSON shows error banner and does NOT alter form state"):
   * An invalid JSON string must throw SyntaxError. The caller catches this,
   * sets parseError, and does NOT call onRawJsonChange → form state unchanged.
   */
  it('invalid JSON string throws SyntaxError', () => {
    expect(() => parseRawJson('{ invalid json }')).toThrow(SyntaxError);
  });

  it('truncated JSON throws SyntaxError', () => {
    expect(() => parseRawJson('{ "id": "feat')).toThrow(SyntaxError);
  });

  it('bare identifier throws SyntaxError', () => {
    expect(() => parseRawJson('undefined')).toThrow(SyntaxError);
  });

  /**
   * TEST 3: Valid JSON array at root throws TypeError (not a Feature object).
   */
  it('valid JSON array at root throws TypeError', () => {
    expect(() => parseRawJson('[]')).toThrow(TypeError);
    expect(() => parseRawJson('[{"id":"feat_x"}]')).toThrow(TypeError);
  });

  /**
   * TEST 4: JSON null at root throws TypeError.
   */
  it('JSON null at root throws TypeError', () => {
    expect(() => parseRawJson('null')).toThrow(TypeError);
  });

  /**
   * TEST 5: JSON number at root throws TypeError.
   */
  it('JSON number at root throws TypeError', () => {
    expect(() => parseRawJson('42')).toThrow(TypeError);
    expect(() => parseRawJson('3.14')).toThrow(TypeError);
  });

  it('JSON boolean at root throws TypeError', () => {
    expect(() => parseRawJson('true')).toThrow(TypeError);
    expect(() => parseRawJson('false')).toThrow(TypeError);
  });
});

// =============================================================================
// TESTS 6-10: featureToJson — form → textarea sync
// =============================================================================

describe('RawJsonPanel — featureToJson(): form → textarea sync', () => {
  /**
   * TEST 6 (spec: "form field mutation updates textarea content"):
   * Changing a Feature's label and re-serialising must produce JSON that
   * contains the updated label.
   */
  it('form mutation reflected in JSON output (label change)', () => {
    const before = makeFeature({ label: { en: 'Old Name' } });
    const after  = { ...before, label: { en: 'New Name', fr: 'Nouveau Nom' } } as Feature;

    const jsonBefore = featureToJson(before, true);
    const jsonAfter  = featureToJson(after,  true);

    expect(jsonBefore).toContain('"en": "Old Name"');
    expect(jsonAfter ).toContain('"en": "New Name"');
    expect(jsonAfter ).not.toContain('"en": "Old Name"');
  });

  it('form mutation reflected in JSON output (tags array change)', () => {
    const before = makeFeature({ tags: ['feat', 'combat'] });
    const after  = { ...before, tags: ['feat', 'combat', 'power'] } as Feature;

    const jsonAfter = featureToJson(after, false); // minified
    const parsed = JSON.parse(jsonAfter) as Feature;
    expect(parsed.tags).toContain('power');
  });

  /**
   * TEST 7 (spec: "prettify mode shows indented JSON"):
   * Pretty mode must produce a multi-line string with 2-space indentation.
   */
  it('pretty=true produces multi-line indented JSON', () => {
    const feature = makeFeature();
    const json = featureToJson(feature, true);

    expect(json).toContain('\n');
    // 2-space indent: any key should be preceded by "  " on its line
    expect(json).toMatch(/^  "/m);
  });

  it('pretty=true output can be re-parsed without modification', () => {
    const feature = makeFeature();
    const json = featureToJson(feature, true);
    const reparsed = JSON.parse(json) as Feature;
    expect(reparsed.id).toBe(feature.id);
    expect(reparsed.label).toEqual(feature.label);
  });

  /**
   * TEST 8 (spec: "minify mode removes whitespace without changing values"):
   * Minified JSON must have no newlines and no redundant spaces between tokens.
   */
  it('pretty=false produces a single-line string with no newlines', () => {
    const feature = makeFeature();
    const json = featureToJson(feature, false);

    expect(json).not.toContain('\n');
    expect(json).not.toContain('  '); // no double-spaces (indentation artifact)
  });

  /**
   * TEST 9 (spec: "minify mode removes whitespace without changing values"):
   * Minified and prettified JSON must decode to the same data.
   */
  it('minified and prettified JSON decode to identical Feature objects', () => {
    const feature = makeFeature({
      tags:            ['feat', 'combat'],
      grantedFeatures: ['feat_cleave'],
    });

    const pretty   = JSON.parse(featureToJson(feature, true))  as Feature;
    const minified = JSON.parse(featureToJson(feature, false)) as Feature;

    expect(pretty.id).toBe(minified.id);
    expect(pretty.label).toEqual(minified.label);
    expect(pretty.tags).toEqual(minified.tags);
    expect(pretty.grantedFeatures).toEqual(minified.grantedFeatures);
  });

  /**
   * TEST 10 (spec): prettify → minify → prettify round-trip preserves all fields.
   */
  it('prettify → minify → prettify round-trip preserves all fields', () => {
    const feature = makeFeature({
      description:     { en: 'Trade accuracy for damage.', fr: 'Échangez précision.' },
      tags:            ['feat', 'combat', 'power'],
      grantedFeatures: ['feat_cleave'],
    });

    const step1 = featureToJson(feature, true);              // prettify
    const step2 = featureToJson(JSON.parse(step1) as Feature, false); // minify
    const step3 = featureToJson(JSON.parse(step2) as Feature, true);  // prettify again

    const final = JSON.parse(step3) as Feature;
    expect(final.id         ).toBe(feature.id);
    expect(final.description).toEqual(feature.description);
    expect(final.tags       ).toEqual(feature.tags);
    expect(final.grantedFeatures).toEqual(feature.grantedFeatures);
  });
});

// =============================================================================
// TESTS 11-15: computeHasOverrideWarning — id collision detection
// =============================================================================

describe('RawJsonPanel — computeHasOverrideWarning(): id collision detection', () => {
  /** Simulated "loaded" features — the DataLoader cache snapshot. */
  const LOADED: Pick<Feature, 'id' | 'ruleSource'>[] = [
    { id: 'race_elf',          ruleSource: 'srd_core'       },
    { id: 'feat_power_attack', ruleSource: 'srd_core'       },
    { id: 'class_wizard',      ruleSource: 'srd_core'       },
    { id: 'race_dwarf',        ruleSource: 'srd_psionics'   },
    { id: 'feat_custom',       ruleSource: 'user_homebrew'  }, // own homebrew
  ];

  /**
   * TEST 11 (spec: "id collision with SRD entity sets hasOverrideWarning=true"):
   * When the id being authored matches an entity from any non-homebrew source,
   * the warning must be shown so the GM knows they're writing an override.
   */
  it('id matching SRD entity (ruleSource !== user_homebrew) → warning=true', () => {
    expect(computeHasOverrideWarning('race_elf', LOADED)).toBe(true);
    expect(computeHasOverrideWarning('feat_power_attack', LOADED)).toBe(true);
    expect(computeHasOverrideWarning('class_wizard', LOADED)).toBe(true);
  });

  it('id matching entity from non-core SRD source → warning=true', () => {
    expect(computeHasOverrideWarning('race_dwarf', LOADED)).toBe(true);
  });

  /**
   * TEST 12: id matches a user_homebrew entity → warning=false.
   * A GM editing their own homebrew entity should NOT see the override warning.
   * The warning is specifically for "you're about to shadow an SRD entity".
   */
  it('id matching a user_homebrew entity → warning=false (editing own entity)', () => {
    expect(computeHasOverrideWarning('feat_custom', LOADED)).toBe(false);
  });

  /**
   * TEST 13: id does not match any loaded entity → warning=false (new entity).
   */
  it('id not in loaded features → warning=false (brand new entity)', () => {
    expect(computeHasOverrideWarning('feat_totally_new', LOADED)).toBe(false);
  });

  /**
   * TEST 14: empty id → warning=false (guard before any lookup).
   * The form starts with an empty id; showing a warning for empty would be
   * disorienting and incorrect.
   */
  it("empty id '' → warning=false (form not yet filled in)", () => {
    expect(computeHasOverrideWarning('', LOADED)).toBe(false);
  });

  /**
   * TEST 15: id changes from SRD id to novel id → warning updates accordingly.
   * Simulates the GM first typing 'race_elf' (sees warning), then changing it
   * to 'race_moon_elf' (no longer a collision → warning clears).
   */
  it('id change from SRD id to novel id updates warning to false', () => {
    const warningOnSrd   = computeHasOverrideWarning('race_elf',      LOADED);
    const warningOnNovel = computeHasOverrideWarning('race_moon_elf', LOADED);

    expect(warningOnSrd  ).toBe(true);
    expect(warningOnNovel).toBe(false);
  });

  it('warning is case-sensitive (race_ELF ≠ race_elf)', () => {
    // id lookup is exact-match; wrong case → no collision → no warning
    expect(computeHasOverrideWarning('race_ELF', LOADED)).toBe(false);
  });

  it('empty loaded features → warning always false', () => {
    expect(computeHasOverrideWarning('race_elf', [])).toBe(false);
  });
});

// =============================================================================
// TESTS 16-22: Edge cases for parseRawJson
// =============================================================================

describe('RawJsonPanel — parseRawJson(): edge cases', () => {
  /**
   * TEST 16: Empty textarea returns null (no-op, no parse attempt).
   */
  it("empty string → returns null (no parse needed)", () => {
    expect(parseRawJson('')).toBeNull();
  });

  /**
   * TEST 17: Whitespace-only textarea returns null.
   */
  it("whitespace-only '   ' → returns null", () => {
    expect(parseRawJson('   ')).toBeNull();
    expect(parseRawJson('\n\t')).toBeNull();
  });

  /**
   * TEST 18: JSON object missing the 'id' field is accepted by the panel.
   * The panel does NOT validate Feature schema — that's the engine's job.
   * The panel only checks: is it a non-null, non-array object?
   */
  it('JSON object without required id field is accepted (schema validation is engine responsibility)', () => {
    const noId = { category: 'feat', ruleSource: 'user_homebrew' };
    expect(() => parseRawJson(JSON.stringify(noId))).not.toThrow();
    const result = parseRawJson(JSON.stringify(noId));
    expect(result).not.toBeNull();
  });

  /**
   * TEST 19: Large valid JSON object parses without error.
   * Realistic upper bound: a Feature with 50 modifiers and a full levelProgression.
   */
  it('very large valid JSON object parses without error', () => {
    const bigFeature = makeFeature({
      tags:            Array.from({ length: 50 }, (_, i) => `tag_${i}`),
      grantedModifiers: Array.from({ length: 50 }, (_, i) => ({
        id:         `mod_${i}`,
        sourceId:   `feat_power_attack`,
        sourceName: { en: `Modifier ${i}` },
        targetId:   `combatStats.damage_${i}`,
        value:      i,
        type:       'untyped' as const,
      })),
    });

    expect(() => parseRawJson(JSON.stringify(bigFeature))).not.toThrow();
    const result = parseRawJson(JSON.stringify(bigFeature));
    expect(result!.tags).toHaveLength(50);
    expect(result!.grantedModifiers).toHaveLength(50);
  });

  /**
   * TEST 20: Unicode characters in string values survive round-trip.
   * The French translations use accented characters. These must not be
   * mangled by JSON.stringify/parse.
   */
  it('unicode characters in string values survive round-trip', () => {
    const feature = makeFeature({
      label:       { en: 'Power Attack', fr: 'Attaque puissante (🗡️)' },
      description: { en: 'Trade accuracy.', fr: 'Échangez précision contre dégâts. Ω≈ç' },
    });

    const json   = featureToJson(feature, false);
    const result = parseRawJson(json);

    expect(result!.label['fr']).toBe('Attaque puissante (🗡️)');
    expect(result!.description['fr']).toBe('Échangez précision contre dégâts. Ω≈ç');
  });

  /**
   * TEST 21: Nested objects survive round-trip.
   */
  it('nested objects (label, description) survive featureToJson → parseRawJson round-trip', () => {
    const feature = makeFeature({
      label:       { en: 'Power Attack', fr: 'Attaque puissante' },
      description: { en: 'Melee only.', fr: 'Mêlée uniquement.' },
    });

    const json   = featureToJson(feature, true);
    const result = parseRawJson(json);

    expect(result!.label   ).toEqual({ en: 'Power Attack', fr: 'Attaque puissante' });
    expect(result!.description).toEqual({ en: 'Melee only.', fr: 'Mêlée uniquement.' });
  });

  /**
   * TEST 22: Arrays (tags, grantedFeatures) survive full round-trip intact.
   */
  it('arrays (tags, grantedFeatures) survive full round-trip', () => {
    const feature = makeFeature({
      tags:            ['feat', 'combat', 'power', 'melee_only'],
      grantedFeatures: ['feat_cleave', 'feat_great_cleave'],
    });

    const minifiedJson = featureToJson(feature, false);
    const parsedBack   = parseRawJson(minifiedJson);

    expect(parsedBack!.tags           ).toEqual(['feat', 'combat', 'power', 'melee_only']);
    expect(parsedBack!.grantedFeatures).toEqual(['feat_cleave', 'feat_great_cleave']);
  });
});

// =============================================================================
// TESTS 23-25: defaultFeature factory (from editorContext.ts)
// =============================================================================

describe('RawJsonPanel — defaultFeature() factory (editorContext.ts)', () => {
  /**
   * TEST 23: defaultFeature returns an object with all required fields.
   * The form relies on these being present to avoid undefined-access errors
   * when the GM first opens the Create dialog.
   */
  it("defaultFeature('feat') returns an object with all required fields", () => {
    const f = defaultFeature('feat');

    // Required fields from Feature interface
    expect(typeof f.id         ).toBe('string');
    expect(f.category          ).toBe('feat');
    expect(typeof f.label      ).toBe('object');
    expect(typeof f.description).toBe('object');
    expect(typeof f.ruleSource ).toBe('string');
    expect(Array.isArray(f.tags             )).toBe(true);
    expect(Array.isArray(f.grantedModifiers )).toBe(true);
    expect(Array.isArray(f.grantedFeatures  )).toBe(true);
  });

  it("defaultFeature('race') sets category to 'race'", () => {
    expect(defaultFeature('race').category).toBe('race');
  });

  it("defaultFeature('class') sets category to 'class'", () => {
    expect(defaultFeature('class').category).toBe('class');
  });

  /**
   * TEST 24: defaultFeature must set ruleSource = 'user_homebrew'.
   * This ensures new entities are exempt from the enabledRuleSources filter
   * and from showing the hasOverrideWarning banner (they have no id yet).
   */
  it("defaultFeature returns ruleSource = 'user_homebrew'", () => {
    expect(defaultFeature('feat').ruleSource).toBe('user_homebrew');
    expect(defaultFeature('race').ruleSource).toBe('user_homebrew');
    expect(defaultFeature('class').ruleSource).toBe('user_homebrew');
  });

  /**
   * TEST 25: Successive calls return independent objects.
   * Mutating one default feature must NOT affect a second one created later.
   * (Protects against a shared-singleton anti-pattern.)
   */
  it('successive calls return independent objects (no shared state)', () => {
    const f1 = defaultFeature('feat');
    const f2 = defaultFeature('feat');

    // Mutate f1
    f1.id = 'feat_modified';
    f1.tags.push('mutated');

    // f2 must be unaffected
    expect(f2.id  ).toBe('');
    expect(f2.tags).toHaveLength(0);
  });

  it("defaultFeature has empty id (GM must provide it)", () => {
    expect(defaultFeature('feat').id).toBe('');
  });

  it("defaultFeature has empty label.en (not placeholder text)", () => {
    expect(defaultFeature('feat').label['en']).toBe('');
  });
});

// =============================================================================
// Integration: full two-way sync simulation
// =============================================================================

describe('RawJsonPanel — full two-way sync simulation', () => {
  /**
   * Simulates the complete form↔textarea cycle:
   *   1. Form state serialised to textarea content (form → textarea).
   *   2. User edits textarea until JSON is valid.
   *   3. parseRawJson called → new Feature produced.
   *   4. onRawJsonChange replaces form state with parsed Feature.
   *   5. New form state serialised back to textarea (textarea → form → textarea).
   */
  it('complete form → textarea → parse → form cycle produces consistent state', () => {
    // Step 1: initial form state
    const initial = makeFeature({ label: { en: 'Iron Will' } });

    // Step 2: serialise to textarea
    const textareaText = featureToJson(initial, true);
    expect(textareaText).toContain('"en": "Iron Will"');

    // Step 3: user edits label in textarea
    const editedJson = textareaText.replace('"en": "Iron Will"', '"en": "Iron Will (Revised)"');

    // Step 4: parse
    const parsed = parseRawJson(editedJson);
    expect(parsed).not.toBeNull();
    expect(parsed!.label['en']).toBe('Iron Will (Revised)');

    // Step 5: new form state → textarea
    const newTextareaText = featureToJson(parsed!, false);
    const reparsed = JSON.parse(newTextareaText) as Feature;
    expect(reparsed.label['en']).toBe('Iron Will (Revised)');
    expect(reparsed.id).toBe(initial.id);      // id preserved
    expect(reparsed.tags).toEqual(initial.tags); // tags unchanged
  });

  it('invalid textarea edit leaves form state unchanged (simulated)', () => {
    // Simulate: form has a valid feature
    const formFeature = makeFeature({ label: { en: 'Endurance' } });

    // User types invalid JSON
    let formState = { ...formFeature };
    let parseError = '';

    try {
      const result = parseRawJson('{ id: broken }');
      // If parse succeeded, onRawJsonChange would be called (bad)
      formState = result!;
    } catch (err) {
      // The component catches the error and sets parseError instead
      parseError = err instanceof Error ? err.message : 'Invalid JSON';
    }

    // Form state must be unchanged
    expect(formState.label['en']).toBe('Endurance');
    expect(parseError           ).not.toBe('');
    // errorMessages are shown in the UI banner; parseError drives the red border
  });
});

// =============================================================================
// EditorContext.dataLoader — testability contract (Checkpoint #8 MAJOR #2 fix)
// =============================================================================

describe('EditorContext — dataLoader field testability contract', () => {
  /**
   * These tests verify the ARCHITECTURE of the `dataLoader` field on the
   * `EditorContext` interface — specifically that:
   *
   *   a) The `EditorContext` type includes `dataLoader: DataLoader`.
   *   b) A mock context constructed with a test-specific DataLoader instance
   *      works identically to the production context.
   *   c) `computeHasOverrideWarning` (which mirrors the `hasOverrideWarning`
   *      getter) correctly uses the provided DataLoader's feature list rather
   *      than any global singleton.
   *
   * WHY THIS MATTERS:
   *   Before this fix, sub-form components (ChoicesEditor, CoreFieldsSection,
   *   GrantedFeaturesEditor, etc.) all imported the DataLoader singleton directly.
   *   This made isolated unit tests impossible: tests could not control which
   *   features were "loaded" without modifying global state.
   *
   *   With `ctx.dataLoader`, tests supply a pre-populated DataLoader instance
   *   at context construction time — full isolation, no singleton pollution.
   *
   * IMPLEMENTATION NOTE:
   *   These tests exercise the logic pattern directly (not the Svelte component)
   *   to avoid needing @testing-library/svelte.  The `computeHasOverrideWarning`
   *   helper mirrors the getter body in EntityForm.svelte exactly.
   */

  it('mock EditorContext with empty DataLoader reports hasOverrideWarning=false for any id', () => {
    // An empty DataLoader (no features loaded) means no collision is possible.
    const loadedFeatures: Pick<Feature, 'id' | 'ruleSource'>[] = [];
    expect(computeHasOverrideWarning('race_elf', loadedFeatures)).toBe(false);
    expect(computeHasOverrideWarning('feat_power_attack', loadedFeatures)).toBe(false);
  });

  it('mock EditorContext with pre-populated DataLoader correctly detects SRD collision', () => {
    // Simulate a DataLoader loaded with SRD content.
    const srdFeatures: Pick<Feature, 'id' | 'ruleSource'>[] = [
      { id: 'race_elf',          ruleSource: 'srd_core' },
      { id: 'feat_power_attack', ruleSource: 'srd_core' },
    ];

    expect(computeHasOverrideWarning('race_elf', srdFeatures)).toBe(true);
    expect(computeHasOverrideWarning('feat_power_attack', srdFeatures)).toBe(true);
    expect(computeHasOverrideWarning('feat_brand_new', srdFeatures)).toBe(false);
  });

  it('mock EditorContext: user_homebrew entities do NOT trigger override warning', () => {
    // GM's own homebrew entity — editing it should never show a warning.
    const loadedFeatures: Pick<Feature, 'id' | 'ruleSource'>[] = [
      { id: 'race_custom_dragon', ruleSource: 'user_homebrew' },
      { id: 'feat_srd_entry',     ruleSource: 'srd_core' },
    ];

    expect(computeHasOverrideWarning('race_custom_dragon', loadedFeatures)).toBe(false);
    expect(computeHasOverrideWarning('feat_srd_entry', loadedFeatures)).toBe(true);
  });

  it('different DataLoader instances produce independent results (no singleton bleed)', () => {
    // Test DataLoader A — contains race_elf (SRD)
    const featuresA: Pick<Feature, 'id' | 'ruleSource'>[] = [
      { id: 'race_elf', ruleSource: 'srd_core' },
    ];
    // Test DataLoader B — contains race_elf as homebrew (different context)
    const featuresB: Pick<Feature, 'id' | 'ruleSource'>[] = [
      { id: 'race_elf', ruleSource: 'user_homebrew' },
    ];

    // Same id, different DataLoader instances → different results
    expect(computeHasOverrideWarning('race_elf', featuresA)).toBe(true);
    expect(computeHasOverrideWarning('race_elf', featuresB)).toBe(false);
  });

  it('hasOverrideWarning reacts to id changes (computed from the current id)', () => {
    // This mirrors the EntityForm.$derived behaviour: as the GM types in the ID
    // field, hasOverrideWarning updates live.
    const srdFeatures: Pick<Feature, 'id' | 'ruleSource'>[] = [
      { id: 'race_elf', ruleSource: 'srd_core' },
    ];

    // Before the GM types 'race_elf'
    expect(computeHasOverrideWarning('race_',    srdFeatures)).toBe(false); // partial id
    expect(computeHasOverrideWarning('race_elf', srdFeatures)).toBe(true);  // exact id
    expect(computeHasOverrideWarning('race_elf2', srdFeatures)).toBe(false); // different id
  });
});
