/**
 * @file src/tests/mergeEngine.test.ts
 * @description Vitest unit tests for the DataLoader's Merge Engine.
 *
 * ARCHITECTURE:
 *   The Merge Engine is the core mechanism for the Data Override System.
 *   It is implemented in `src/lib/engine/DataLoader.ts` as a set of pure functions
 *   (`mergePartial`, `mergeArray`, `mergeLevelProgression`, `mergeChoices`) plus
 *   the `DataLoader` class's `cacheFeature()` / `#processEntity()` pipeline.
 *
 *   The DataLoader exposes two public testing APIs:
 *     - `cacheFeature(feature)`: Directly seeds the feature cache (bypasses merge pipeline,
 *       always replaces). Used for testing scenarios that don't need the merge path for the base.
 *     - `clearCache()`: Resets all caches. Called automatically by `loadRuleSources()`.
 *
 *   KEY CONSTRAINT: `loadRuleSources()` ALWAYS calls `clearCache()` at the start.
 *   This means we CANNOT pre-seed with `cacheFeature()` and then call `loadRuleSources()`,
 *   because the cache is cleared before the override JSON is processed.
 *
 *   TESTING STRATEGY (used here):
 *   To test the PARTIAL MERGE path, we deliver BOTH the base entity AND the override entity
 *   in a single `gmGlobalOverrides` JSON array: [base_entity, override_entity].
 *   The DataLoader processes them in array order: the base is loaded first (as a "replace"),
 *   then the override is applied on top (partial or replace, per its merge field).
 *   This faithfully simulates how two rule source files interact (earlier file = base,
 *   later file = override).
 *
 *   For scenarios involving ONLY `cacheFeature()` + `getFeature()` (no partial merge),
 *   we avoid calling `loadRuleSources()` entirely to keep tests fast and free of network calls.
 *
 * RESOLUTION CHAIN (ARCHITECTURE.md section 18.5):
 *   Layer 1: Base source files (loaded in alphabetical order, last wins)
 *   Layer 2: GM Global Override (applied after all files, gmGlobalOverrides JSON)
 *   Layer 3: GM Per-Character Override (Character.gmOverrides — applied by GameEngine, not DataLoader)
 *
 * SCENARIOS (ARCHITECTURE.md Phase 17.7):
 *   1. Replace Test:  merge: "replace" — fully overwrites the existing entity.
 *   2. Partial Merge: merge: "partial" — appends tags, adds levelProgression entry,
 *                    adds modifiers, while preserving existing data.
 *   3. Deletion:     "-feat_wild_shape" in grantedFeatures — removes the feat.
 *   4. Resolution Chain: base → partial override → GM global override → verify final state.
 *
 * @see src/lib/engine/DataLoader.ts for Merge Engine implementation
 * @see ARCHITECTURE.md section 18 for Data Override System specification
 * @see ARCHITECTURE.md section 18.3 for Partial Merge Rules
 * @see ARCHITECTURE.md Phase 17.7
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { DataLoader } from '$lib/engine/DataLoader';
import type { Feature, LevelProgressionEntry } from '$lib/types/feature';
import type { Modifier } from '$lib/types/pipeline';
import type { ModifierType } from '$lib/types/primitives';

// ---------------------------------------------------------------------------
// FETCH MOCK — suppress DataLoader network discovery noise
// ---------------------------------------------------------------------------
// The mergeEngine tests use loadRuleSources() exclusively to exercise the
// gmGlobalOverrides / merge pipeline. No real rule source files are needed.
// Without this mock, calling loadRuleSources() in a Node.js test environment
// (where relative URLs like "/rules" are invalid) generates ERR_INVALID_URL
// errors and console output on every test, obscuring real failures.
//
// This mock reports an empty file list so the DataLoader immediately proceeds
// to apply the gmGlobalOverrides JSON that each test provides.
beforeAll(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    headers: { get: () => 'application/json' },
    json: () => Promise.resolve([]),
  }));
});

afterAll(() => {
  vi.unstubAllGlobals();
});

// ============================================================
// HELPERS
// ============================================================

/**
 * Creates a minimal Modifier for use in test features.
 */
function makeModifier(id: string, targetId: string, value: number, type: ModifierType = 'untyped'): Modifier {
  return {
    id,
    sourceId: `src_${id}`,
    sourceName: { en: id },
    targetId,
    value,
    type,
  };
}

/**
 * Creates a minimal LevelProgressionEntry for test features.
 */
function makeEntry(level: number, grantedFeatures: string[], modifiers: Modifier[]): LevelProgressionEntry {
  return { level, grantedFeatures, grantedModifiers: modifiers };
}

// ============================================================
// BASE FEATURE: A "Druid" class used across all merge tests
// ============================================================

/**
 * The base Druid class feature before any overrides.
 *
 * DESIGN:
 *   This represents the "canonical" Druid from the SRD core rules file.
 *   Override scenarios then modify it using "replace" or "partial" strategies.
 *
 * Fields deliberately chosen to exercise all merge rules:
 *   tags            — tested with partial append and -prefix deletion
 *   grantedFeatures — tested with -feat_wild_shape deletion
 *   grantedModifiers — tested with partial append
 *   levelProgression — tested with merge-by-level replacement
 *   choices         — tested with merge-by-choiceId
 */
const BASE_DRUID: Feature = {
  id: 'class_druid',
  category: 'class',
  label: { en: 'Druid', fr: 'Druide' },
  description: { en: 'A priest of nature.', fr: 'Un prêtre de la nature.' },
  tags: ['class', 'divine', 'druid', 'spellcaster', 'wild_shape'],
  forbiddenTags: ['metal_armor'],
  ruleSource: 'srd_core',
  grantedModifiers: [
    makeModifier('druid_bab_l1', 'combatStats.base_attack_bonus', 0, 'base'),
    makeModifier('druid_fort_l1', 'saves.fortitude', 2, 'base'),
  ],
  grantedFeatures: ['feat_wild_shape', 'feat_animal_companion', 'feat_nature_sense'],
  choices: [
    {
      choiceId: 'druid_domain',
      label: { en: 'Choose a Domain' },
      optionsQuery: 'tag:domain',
      maxSelections: 1,
    },
  ],
  levelProgression: [
    makeEntry(1, [], [makeModifier('druid_bab_l1_prog', 'combatStats.base_attack_bonus', 0, 'base')]),
    makeEntry(2, ['feat_wild_shape_small'], [makeModifier('druid_bab_l2', 'combatStats.base_attack_bonus', 1, 'base')]),
    makeEntry(3, [], [makeModifier('druid_bab_l3', 'combatStats.base_attack_bonus', 0, 'base')]),
  ],
};

/**
 * Builds a JSON string containing: [BASE_DRUID, ...overrideEntities].
 * This simulates two rule source files in loading order:
 *   - BASE_DRUID = "first file loaded" (lowest priority)
 *   - overrideEntities = "later files loaded" (higher priority, applied on top)
 *
 * This is the recommended technique for testing the partial merge path,
 * since loadRuleSources() clears the cache before applying the gmGlobalOverrides.
 */
function buildOverrideJson(overrideEntities: Record<string, unknown>[]): string {
  // Spread BASE_DRUID as a plain object so JSON.stringify includes all fields
  const basePlain = JSON.parse(JSON.stringify(BASE_DRUID)) as Record<string, unknown>;
  return JSON.stringify([basePlain, ...overrideEntities]);
}

// ============================================================
// SCENARIO 1: Replace Test
// ============================================================

describe('Merge Engine: merge: "replace" — full entity overwrite', () => {
  let loader: DataLoader;

  beforeEach(() => {
    loader = new DataLoader();
  });

  /**
   * ARCHITECTURE.md section 18.2:
   *   "replace" (absent or explicit): The entity completely replaces any existing entity.
   *   This is the DEFAULT strategy — no merge field needed.
   */
  it('Replace with no merge field: later entity fully replaces the earlier one', async () => {
    // Both entities in one GM override payload: base first, replace second.
    const overrideJson = buildOverrideJson([
      {
        id: 'class_druid',
        category: 'class',
        ruleSource: 'srd_core',
        label: { en: 'Druid (Revised)' },
        description: { en: 'A completely rewritten Druid.' },
        tags: ['class', 'divine', 'druid_revised'], // Entirely different tags
        forbiddenTags: [],
        grantedModifiers: [], // Stripped all modifiers
        grantedFeatures: ['feat_new_druid_ability'], // Entirely different features
        levelProgression: [],
        // No "merge" field → defaults to "replace"
      },
    ]);

    await loader.loadRuleSources([], overrideJson);

    const druid = loader.getFeature('class_druid');
    expect(druid).toBeDefined();

    // The label should be the override's label (base is replaced entirely)
    expect(druid!.label['en']).toBe('Druid (Revised)');
    expect(druid!.description['en']).toBe('A completely rewritten Druid.');

    // Tags should be ONLY the override's tags (not merged with base)
    expect(druid!.tags).toContain('druid_revised');
    expect(druid!.tags).not.toContain('wild_shape');     // Base tag, gone
    expect(druid!.tags).not.toContain('spellcaster');    // Base tag, gone

    // grantedFeatures should be ONLY the override's (wild_shape removed from base)
    expect(druid!.grantedFeatures).toContain('feat_new_druid_ability');
    expect(druid!.grantedFeatures).not.toContain('feat_wild_shape');
    expect(druid!.grantedFeatures).not.toContain('feat_animal_companion');

    // Modifiers should be empty (replaced by empty array)
    expect(druid!.grantedModifiers).toHaveLength(0);
  });

  it('Explicit merge: "replace" has same effect as no merge field', async () => {
    const overrideJson = buildOverrideJson([
      {
        id: 'class_druid',
        category: 'class',
        ruleSource: 'srd_core',
        label: { en: 'Druid (Explicit Replace)' },
        description: { en: 'Explicitly replaced.' },
        tags: ['class', 'druid_explicit'],
        grantedModifiers: [],
        grantedFeatures: [],
        merge: 'replace',  // Explicit "replace"
      },
    ]);

    await loader.loadRuleSources([], overrideJson);

    const druid = loader.getFeature('class_druid');
    expect(druid!.label['en']).toBe('Druid (Explicit Replace)');
    expect(druid!.tags).toContain('druid_explicit');
    expect(druid!.tags).not.toContain('wild_shape'); // Base tags gone
  });

  it('Replace preserves the entity ID and category (not modifiable)', async () => {
    const overrideJson = buildOverrideJson([
      {
        id: 'class_druid',
        category: 'class',
        ruleSource: 'srd_core',
        label: { en: 'Replaced' },
        tags: ['class'],
        grantedModifiers: [],
        grantedFeatures: [],
      },
    ]);

    await loader.loadRuleSources([], overrideJson);

    const druid = loader.getFeature('class_druid');
    // ID and category survive (they're the lookup key and type discriminator)
    expect(druid!.id).toBe('class_druid');
    expect(druid!.category).toBe('class');
  });
});

// ============================================================
// SCENARIO 2: Partial Merge Test
// ============================================================

describe('Merge Engine: merge: "partial" — additive merge', () => {
  let loader: DataLoader;

  beforeEach(() => {
    loader = new DataLoader();
  });

  /**
   * ARCHITECTURE.md section 18.3 — Tags:
   *   "Arrays (tags, grantedFeatures, grantedModifiers, …): Append.
   *    Items prefixed with '-' are removed from the existing array."
   */
  it('Partial merge: appends new tags while preserving existing tags', async () => {
    // Base Druid (no merge field = replace) + Partial override (adds new tags)
    const overrideJson = buildOverrideJson([
      {
        id: 'class_druid',
        category: 'class',
        ruleSource: 'srd_core',
        merge: 'partial',
        tags: ['circle_winter', 'cold_magic'],  // New tags to append
        // Other fields omitted → preserved from base
        grantedModifiers: [],
        grantedFeatures: [],
      },
    ]);

    await loader.loadRuleSources([], overrideJson);

    const druid = loader.getFeature('class_druid');
    expect(druid).toBeDefined();

    // New tags must be appended
    expect(druid!.tags).toContain('circle_winter');
    expect(druid!.tags).toContain('cold_magic');

    // Existing tags must be PRESERVED (not wiped)
    expect(druid!.tags).toContain('class');
    expect(druid!.tags).toContain('divine');
    expect(druid!.tags).toContain('druid');
    expect(druid!.tags).toContain('spellcaster');
    expect(druid!.tags).toContain('wild_shape');
  });

  it('Partial merge: appends new grantedModifiers while preserving existing', async () => {
    const newModifier = makeModifier('druid_cold_resist', 'combatStats.resist_cold', 5, 'racial');

    const overrideJson = buildOverrideJson([
      {
        id: 'class_druid',
        category: 'class',
        ruleSource: 'srd_core',
        merge: 'partial',
        tags: [],
        grantedModifiers: [newModifier],  // Only this new modifier
        grantedFeatures: [],
      },
    ]);

    await loader.loadRuleSources([], overrideJson);

    const druid = loader.getFeature('class_druid');

    // The base modifiers must still be present
    const baseModIds = druid!.grantedModifiers.map(m => m.id);
    expect(baseModIds).toContain('druid_bab_l1');
    expect(baseModIds).toContain('druid_fort_l1');

    // The new modifier must be appended
    expect(baseModIds).toContain('druid_cold_resist');
  });

  /**
   * ARCHITECTURE.md section 18.3 — levelProgression:
   *   "Merge by level: if the partial defines an entry for an existing level,
   *    it REPLACES that entry. Undefined levels remain intact. New levels are added."
   */
  it('Partial merge: adds a new levelProgression entry (level 4)', async () => {
    const overrideJson = buildOverrideJson([
      {
        id: 'class_druid',
        category: 'class',
        ruleSource: 'srd_core',
        merge: 'partial',
        tags: [],
        grantedModifiers: [],
        grantedFeatures: [],
        levelProgression: [
          // New level 4 entry — doesn't exist in base
          makeEntry(4, ['feat_wild_shape_medium'], [
            makeModifier('druid_bab_l4', 'combatStats.base_attack_bonus', 1, 'base'),
          ]),
        ],
      },
    ]);

    await loader.loadRuleSources([], overrideJson);

    const druid = loader.getFeature('class_druid');
    expect(druid!.levelProgression).toBeDefined();

    // Existing levels 1, 2, 3 must still be present
    const levels = druid!.levelProgression!.map(e => e.level);
    expect(levels).toContain(1);
    expect(levels).toContain(2);
    expect(levels).toContain(3);

    // New level 4 must be present
    expect(levels).toContain(4);

    // Level 4 must have the correct grantedFeatures
    const level4 = druid!.levelProgression!.find(e => e.level === 4);
    expect(level4!.grantedFeatures).toContain('feat_wild_shape_medium');
  });

  it('Partial merge: same-level entry REPLACES that level (not appends)', async () => {
    // Override level 2 entry (which in base grants feat_wild_shape_small)
    const overrideJson = buildOverrideJson([
      {
        id: 'class_druid',
        category: 'class',
        ruleSource: 'srd_core',
        merge: 'partial',
        tags: [],
        grantedModifiers: [],
        grantedFeatures: [],
        levelProgression: [
          makeEntry(2, ['feat_wild_shape_tiny'], [  // Replaces level 2 content
            makeModifier('druid_bab_l2_revised', 'combatStats.base_attack_bonus', 1, 'base'),
          ]),
        ],
      },
    ]);

    await loader.loadRuleSources([], overrideJson);

    const druid = loader.getFeature('class_druid');
    const level2 = druid!.levelProgression!.find(e => e.level === 2);

    // Level 2 now has the override content
    expect(level2!.grantedFeatures).toContain('feat_wild_shape_tiny');

    // The base content for level 2 (feat_wild_shape_small) is gone (replaced, not merged)
    expect(level2!.grantedFeatures).not.toContain('feat_wild_shape_small');
  });

  it('Partial merge: scalar fields (label) are overwritten if provided, description preserved', async () => {
    const overrideJson = buildOverrideJson([
      {
        id: 'class_druid',
        category: 'class',
        ruleSource: 'srd_core',
        merge: 'partial',
        tags: [],
        grantedModifiers: [],
        grantedFeatures: [],
        label: { en: 'Circle of Winter Druid', fr: 'Druide du Cercle Hivernal' },
        // description is NOT provided → should remain from base
      },
    ]);

    await loader.loadRuleSources([], overrideJson);

    const druid = loader.getFeature('class_druid');

    // Label overwritten (provided in partial)
    expect(druid!.label['en']).toBe('Circle of Winter Druid');
    expect(druid!.label['fr']).toBe('Druide du Cercle Hivernal');

    // Description preserved (NOT provided in partial)
    expect(druid!.description['en']).toBe('A priest of nature.');
  });
});

// ============================================================
// SCENARIO 3: Deletion Test (-prefix)
// ============================================================

describe('Merge Engine: partial merge with -prefix deletion', () => {
  let loader: DataLoader;

  beforeEach(() => {
    loader = new DataLoader();
  });

  /**
   * ARCHITECTURE.md section 18.3:
   *   "Items prefixed with '-' are removed from the existing array"
   * ARCHITECTURE.md section 18.4:
   *   "-feat_wild_shape in grantedFeatures → feat_wild_shape is removed from result"
   */
  it('Deletion: -feat_wild_shape in grantedFeatures removes it from the merged result', async () => {
    const overrideJson = buildOverrideJson([
      {
        id: 'class_druid',
        category: 'class',
        ruleSource: 'srd_core',
        merge: 'partial',
        tags: [],
        grantedModifiers: [],
        grantedFeatures: ['-feat_wild_shape'],  // -prefix = REMOVE this from base array
      },
    ]);

    await loader.loadRuleSources([], overrideJson);

    const druid = loader.getFeature('class_druid');

    // feat_wild_shape must be REMOVED
    expect(druid!.grantedFeatures).not.toContain('feat_wild_shape');
    // Deletion marker must not remain in the array
    expect(druid!.grantedFeatures).not.toContain('-feat_wild_shape');

    // Other features must be PRESERVED
    expect(druid!.grantedFeatures).toContain('feat_animal_companion');
    expect(druid!.grantedFeatures).toContain('feat_nature_sense');
  });

  it('Deletion: -prefix on tags removes the tag', async () => {
    // The base Druid has tag "wild_shape"
    const overrideJson = buildOverrideJson([
      {
        id: 'class_druid',
        category: 'class',
        ruleSource: 'srd_core',
        merge: 'partial',
        tags: ['-wild_shape', 'circle_winter'],  // Remove wild_shape, add circle_winter
        grantedModifiers: [],
        grantedFeatures: [],
      },
    ]);

    await loader.loadRuleSources([], overrideJson);

    const druid = loader.getFeature('class_druid');

    // 'wild_shape' must be removed
    expect(druid!.tags).not.toContain('wild_shape');

    // 'circle_winter' must be added
    expect(druid!.tags).toContain('circle_winter');

    // Other tags must survive
    expect(druid!.tags).toContain('class');
    expect(druid!.tags).toContain('divine');
    expect(druid!.tags).toContain('druid');
  });

  it('Deletion: -prefix on non-existing item is a no-op (no crash)', async () => {
    const overrideJson = buildOverrideJson([
      {
        id: 'class_druid',
        category: 'class',
        ruleSource: 'srd_core',
        merge: 'partial',
        tags: ['-nonexistent_tag'],  // This tag does not exist in base
        grantedModifiers: [],
        grantedFeatures: ['-feat_nonexistent'],  // This feature does not exist in base
      },
    ]);

    // Must NOT throw — gracefully ignores missing deletion targets
    await expect(loader.loadRuleSources([], overrideJson)).resolves.not.toThrow();

    const druid = loader.getFeature('class_druid');
    expect(druid).toBeDefined();

    // All original tags still present (deletion of non-existing item is no-op)
    expect(druid!.tags).toContain('class');
    expect(druid!.tags).toContain('druid');
  });

  it('Deletion of all grantedFeatures leaves an empty array', async () => {
    const overrideJson = buildOverrideJson([
      {
        id: 'class_druid',
        category: 'class',
        ruleSource: 'srd_core',
        merge: 'partial',
        tags: [],
        grantedModifiers: [],
        grantedFeatures: [
          '-feat_wild_shape',
          '-feat_animal_companion',
          '-feat_nature_sense',
        ],
      },
    ]);

    await loader.loadRuleSources([], overrideJson);

    const druid = loader.getFeature('class_druid');

    // All three features should be gone
    expect(druid!.grantedFeatures).not.toContain('feat_wild_shape');
    expect(druid!.grantedFeatures).not.toContain('feat_animal_companion');
    expect(druid!.grantedFeatures).not.toContain('feat_nature_sense');

    // Array should contain no deletion markers (they're consumed by the merge)
    const nonDeletionMarkers = druid!.grantedFeatures.filter(f => !f.startsWith('-'));
    expect(nonDeletionMarkers).toHaveLength(0);
  });

  /**
   * ARCHITECTURE.md section 18.3 — choices:
   *   "Merge by choiceId: same-ID choice is replaced. '-' prefixed choices are removed."
   */
  it('Deletion: choices with -choiceId prefix are removed from the choices array', async () => {
    const overrideJson = buildOverrideJson([
      {
        id: 'class_druid',
        category: 'class',
        ruleSource: 'srd_core',
        merge: 'partial',
        tags: [],
        grantedModifiers: [],
        grantedFeatures: [],
        choices: [
          { choiceId: '-druid_domain' },  // Remove the domain choice
        ],
      },
    ]);

    await loader.loadRuleSources([], overrideJson);

    const druid = loader.getFeature('class_druid');

    // The druid_domain choice must be removed
    const choiceIds = (druid!.choices ?? []).map(c => c.choiceId);
    expect(choiceIds).not.toContain('druid_domain');
  });

  /**
   * ARCHITECTURE.md section 18.3 — choices:
   *   "Merge by choiceId: same-ID choice is replaced. New choices are added."
   *
   * This test verifies that a partial merge providing a choice with the SAME choiceId
   * as an existing choice completely REPLACES that choice's properties (label, optionsQuery,
   * maxSelections), rather than appending a duplicate.
   */
  it('Replacement: choices with same choiceId replace the existing choice properties', async () => {
    const overrideJson = buildOverrideJson([
      {
        id: 'class_druid',
        category: 'class',
        ruleSource: 'srd_core',
        merge: 'partial',
        tags: [],
        grantedModifiers: [],
        grantedFeatures: [],
        choices: [
          {
            choiceId: 'druid_domain',
            label: { en: 'Choose a Nature Domain', fr: 'Choisissez un Domaine de la Nature' },
            optionsQuery: 'tag:nature_domain',
            maxSelections: 2,
          },
        ],
      },
    ]);

    await loader.loadRuleSources([], overrideJson);

    const druid = loader.getFeature('class_druid');

    // The druid_domain choice must still exist (not duplicated)
    const matchingChoices = (druid!.choices ?? []).filter(c => c.choiceId === 'druid_domain');
    expect(matchingChoices).toHaveLength(1);

    // Its properties must be fully replaced
    const choice = matchingChoices[0];
    expect(choice.label['en']).toBe('Choose a Nature Domain');
    expect(choice.label['fr']).toBe('Choisissez un Domaine de la Nature');
    expect(choice.optionsQuery).toBe('tag:nature_domain');
    expect(choice.maxSelections).toBe(2);
  });
});

// ============================================================
// SCENARIO 4: Resolution Chain Test
// ============================================================

describe('Merge Engine: full resolution chain priority order', () => {
  let loader: DataLoader;

  beforeEach(() => {
    loader = new DataLoader();
  });

  /**
   * ARCHITECTURE.md section 18.5, resolution chain diagram:
   *   Layer 1: Base source files (loaded alphabetically, last wins)
   *   Layer 2: GM Global Override (applied after files)
   *   Layer 3: GM Per-Character Override (applied by GameEngine, not DataLoader)
   *
   * TEST APPROACH:
   *   We simulate the chain using the gmGlobalOverrides array:
   *     Position 0 in array: "base" entity (simulates first loaded file)
   *     Position 1 in array: "override" entity (simulates later file or GM override)
   *   The DataLoader processes them in array order, so position 1 takes precedence.
   */
  it('Later entity (position 1) takes precedence over earlier entity (position 0)', async () => {
    // Simulate two-file resolution: base file + GM global override
    const chainJson = JSON.stringify([
      // "Layer 1: base file" — the canonical Druid
      JSON.parse(JSON.stringify(BASE_DRUID)),
      // "Layer 2: GM global override" — fully replaces with GM version
      {
        id: 'class_druid',
        category: 'class',
        ruleSource: 'srd_core',
        label: { en: 'GM Modified Druid' },
        tags: ['class', 'divine', 'druid', 'gm_modified'],
        grantedModifiers: [],
        grantedFeatures: [],
        merge: 'replace',
      },
    ]);

    await loader.loadRuleSources([], chainJson);

    const druid = loader.getFeature('class_druid');

    // GM override (later in array) wins — label is now GM's version
    expect(druid!.label['en']).toBe('GM Modified Druid');
    expect(druid!.tags).toContain('gm_modified');

    // Base tag 'spellcaster' is gone (GM replace wiped it)
    expect(druid!.tags).not.toContain('spellcaster');
  });

  it('Partial override at position 1 adds to base at position 0', async () => {
    const chainJson = buildOverrideJson([
      // "Layer 2: GM partial override" — adds tag, removes feat_wild_shape
      {
        id: 'class_druid',
        category: 'class',
        ruleSource: 'srd_core',
        merge: 'partial',
        tags: ['gm_secret_buff', '-wild_shape'],
        grantedModifiers: [],
        grantedFeatures: ['-feat_wild_shape'],
      },
    ]);

    await loader.loadRuleSources([], chainJson);

    const druid = loader.getFeature('class_druid');

    // GM partial adds 'gm_secret_buff'
    expect(druid!.tags).toContain('gm_secret_buff');

    // GM partial removes 'wild_shape' tag
    expect(druid!.tags).not.toContain('wild_shape');

    // GM partial removes 'feat_wild_shape' from grantedFeatures
    expect(druid!.grantedFeatures).not.toContain('feat_wild_shape');

    // Base tags (not touched by override) are preserved
    expect(druid!.tags).toContain('class');
    expect(druid!.tags).toContain('divine');
    expect(druid!.tags).toContain('druid');

    // Other grantedFeatures preserved
    expect(druid!.grantedFeatures).toContain('feat_animal_companion');
    expect(druid!.grantedFeatures).toContain('feat_nature_sense');
  });

  it('Resolution chain: base → partial → replace: final replace takes all', async () => {
    // Three-entity chain to simulate 3-layer resolution:
    //   [0]: base (replace) → seeds the feature
    //   [1]: partial (partial) → adds an intermediate tag
    //   [2]: replace (replace) → wipes everything
    const chainJson = JSON.stringify([
      // Base
      JSON.parse(JSON.stringify(BASE_DRUID)),
      // Partial override
      {
        id: 'class_druid',
        category: 'class',
        ruleSource: 'srd_core',
        merge: 'partial',
        tags: ['partial_layer'],
        grantedModifiers: [],
        grantedFeatures: [],
      },
      // Full replace — wipes the partial result
      {
        id: 'class_druid',
        category: 'class',
        ruleSource: 'srd_core',
        label: { en: 'Final Override' },
        tags: ['replace_layer'],
        grantedModifiers: [],
        grantedFeatures: [],
        // No merge field → defaults to "replace"
      },
    ]);

    await loader.loadRuleSources([], chainJson);

    const druid = loader.getFeature('class_druid');

    // The "replace" (last entity) wins — overrides the partial result
    expect(druid!.label['en']).toBe('Final Override');
    expect(druid!.tags).toContain('replace_layer');
    expect(druid!.tags).not.toContain('partial_layer');  // Wiped by replace
    expect(druid!.tags).not.toContain('druid');           // Wiped by replace
  });

  it('Resolution chain: multiple files — last replace wins over all previous', async () => {
    // Simulate loading multiple "versions" directly via cacheFeature
    // (no loadRuleSources needed since we're testing cacheFeature order only)
    const versionA: Feature = {
      ...BASE_DRUID,
      label: { en: 'Druid v1' },
      tags: ['class', 'divine', 'druid', 'version_a'],
    };

    const versionB: Feature = {
      ...BASE_DRUID,
      label: { en: 'Druid v2' },
      tags: ['class', 'divine', 'druid', 'version_b'],
    };

    // Simulate loading order: versionA first, then versionB overwrites
    loader.cacheFeature(versionA); // "srd_core" file 1
    loader.cacheFeature(versionB); // "srd_core" file 2 (loaded later = higher priority)

    const druid = loader.getFeature('class_druid');

    // versionB (last loaded) must win
    expect(druid!.label['en']).toBe('Druid v2');
    expect(druid!.tags).toContain('version_b');
    expect(druid!.tags).not.toContain('version_a'); // Overwritten by versionB
  });
});

// ============================================================
// SCENARIO 5: Config Table Handling
// ============================================================

describe('Merge Engine: Config table handling (always replace, no partial)', () => {
  let loader: DataLoader;

  beforeEach(() => {
    loader = new DataLoader();
  });

  /**
   * ARCHITECTURE.md section 18.1:
   *   "Configuration tables do not use the merge field — they are always replaced entirely."
   */
  it('Config table: later table with same tableId fully replaces the earlier one', async () => {
    // Two config tables with the same tableId in the same GM override array.
    // The second one (XP fast) should replace the first (XP standard).
    const chainJson = JSON.stringify([
      {
        tableId: 'config_xp_thresholds',
        ruleSource: 'srd_core',
        description: 'Standard XP table',
        data: [
          { level: 1, xpRequired: 0 },
          { level: 2, xpRequired: 1000 },
          { level: 3, xpRequired: 3000 },
        ],
      },
      {
        tableId: 'config_xp_thresholds',   // Same tableId → replaces the previous
        ruleSource: 'srd_core',
        description: 'Fast-progression XP table',
        data: [
          { level: 1, xpRequired: 0 },
          { level: 2, xpRequired: 500 },   // Faster
          { level: 3, xpRequired: 1500 },  // Faster
        ],
      },
    ]);

    await loader.loadRuleSources([], chainJson);

    const table = loader.getConfigTable('config_xp_thresholds');
    expect(table).toBeDefined();

    // The data from the second (later) table should win
    const level2Row = table!.data.find(r => r['level'] === 2);
    expect(level2Row!['xpRequired']).toBe(500);   // Second table value, not 1000

    const level3Row = table!.data.find(r => r['level'] === 3);
    expect(level3Row!['xpRequired']).toBe(1500);  // Second table value, not 3000
  });

  it('Config table and Feature can coexist in the same GM override JSON array', async () => {
    // Feature + ConfigTable in the same JSON array (ARCHITECTURE.md section 18.6 example)
    const mixedJson = JSON.stringify([
      {
        // Feature
        id: 'feat_test',
        category: 'feat',
        ruleSource: 'srd_core',
        label: { en: 'Test Feat' },
        description: { en: 'A test feat.' },
        tags: ['feat', 'general'],
        grantedModifiers: [],
        grantedFeatures: [],
      },
      {
        // Config table
        tableId: 'config_carrying_capacity',
        ruleSource: 'srd_core',
        description: 'House rule carrying capacity',
        data: [{ str: 10, lightLoad: 33, mediumLoad: 66, heavyLoad: 100 }],
      },
    ]);

    await loader.loadRuleSources([], mixedJson);

    // Feature should be present
    const feat = loader.getFeature('feat_test');
    expect(feat).toBeDefined();
    expect(feat!.tags).toContain('feat');

    // Config table should be present
    const carryTable = loader.getConfigTable('config_carrying_capacity');
    expect(carryTable).toBeDefined();
    expect(carryTable!.data[0]['lightLoad']).toBe(33);
  });

  it('DataLoader.getConfigValue retrieves specific rows from loaded config tables', async () => {
    const xpJson = JSON.stringify([
      {
        tableId: 'config_xp_thresholds',
        ruleSource: 'srd_core',
        data: [
          { level: 1, xpRequired: 0 },
          { level: 5, xpRequired: 10000 },
          { level: 10, xpRequired: 45000 },
        ],
      },
    ]);

    await loader.loadRuleSources([], xpJson);

    const xpForLevel5 = loader.getConfigValue('config_xp_thresholds', 'level', 5, 'xpRequired');
    expect(xpForLevel5).toBe(10000);

    const xpForLevel10 = loader.getConfigValue('config_xp_thresholds', 'level', 10, 'xpRequired');
    expect(xpForLevel10).toBe(45000);

    const xpForLevel99 = loader.getConfigValue('config_xp_thresholds', 'level', 99, 'xpRequired');
    expect(xpForLevel99).toBeUndefined(); // Non-existent row returns undefined
  });
});

// ============================================================
// SCENARIO 6: Edge Cases & Robustness
// ============================================================

describe('Merge Engine: edge cases and robustness', () => {
  let loader: DataLoader;

  beforeEach(() => {
    loader = new DataLoader();
  });

  it('Unknown entity (no id, no tableId) is ignored without crashing', async () => {
    const invalidJson = JSON.stringify([
      {
        // No 'id', no 'tableId' — both missing
        category: 'class',
        label: { en: 'Invalid entity' },
        ruleSource: 'srd_core',
      },
    ]);

    // Must not throw
    await expect(loader.loadRuleSources([], invalidJson)).resolves.not.toThrow();

    // Nothing should be added to the cache (no id means it can't be stored)
    expect(loader.getAllFeatures()).toHaveLength(0);
  });

  it('Invalid JSON in gmGlobalOverrides is silently ignored (no crash)', async () => {
    // Pass deliberately broken JSON as the GM override
    const brokenJson = '{ this is not valid JSON }';

    await expect(loader.loadRuleSources([], brokenJson)).resolves.not.toThrow();

    // Cache should be empty — nothing was processed
    expect(loader.getAllFeatures()).toHaveLength(0);
  });

  it('New entity (no pre-existing match) with merge: "partial" is inserted as-is', async () => {
    // A "partial" entity with no pre-existing entity of the same ID.
    // Since there's nothing to merge INTO, it should be stored as-is (DataLoader behaviour).
    const newJson = JSON.stringify([
      {
        id: 'feat_new_feat',
        category: 'feat',
        ruleSource: 'srd_core',
        merge: 'partial',  // No existing entity to merge with
        label: { en: 'New Feat' },
        description: { en: 'A brand new feat.' },
        tags: ['feat', 'general'],
        grantedModifiers: [],
        grantedFeatures: [],
      },
    ]);

    await loader.loadRuleSources([], newJson);

    const feat = loader.getFeature('feat_new_feat');
    expect(feat).toBeDefined();
    expect(feat!.label['en']).toBe('New Feat');
    expect(feat!.tags).toContain('feat');
    expect(feat!.tags).toContain('general');
  });

  it('clearCache() resets all features and config tables', async () => {
    // Load a feature
    const testJson = JSON.stringify([
      {
        id: 'class_druid',
        category: 'class',
        ruleSource: 'srd_core',
        label: { en: 'Druid' },
        tags: ['class'],
        grantedModifiers: [],
        grantedFeatures: [],
      },
      {
        tableId: 'config_test',
        ruleSource: 'srd_core',
        data: [],
      },
    ]);

    await loader.loadRuleSources([], testJson);
    expect(loader.getAllFeatures()).toHaveLength(1);
    expect(loader.getConfigTable('config_test')).toBeDefined();

    loader.clearCache();

    expect(loader.getAllFeatures()).toHaveLength(0);
    expect(loader.getConfigTable('config_test')).toBeUndefined();
    expect(loader.getFeature('class_druid')).toBeUndefined();
  });

  it('queryFeatures correctly filters by tag after a partial merge adds new tags', async () => {
    const chainJson = buildOverrideJson([
      // Add 'arctic_druid' tag via partial merge
      {
        id: 'class_druid',
        category: 'class',
        ruleSource: 'srd_core',
        merge: 'partial',
        tags: ['arctic_druid'],
        grantedModifiers: [],
        grantedFeatures: [],
      },
    ]);

    await loader.loadRuleSources([], chainJson);

    // QueryFeatures should find the Druid by its newly added tag
    const arcticFeatured = loader.queryFeatures('tag:arctic_druid');
    expect(arcticFeatured).toHaveLength(1);
    expect(arcticFeatured[0].id).toBe('class_druid');

    // Also still findable by original tags
    const divineFeatured = loader.queryFeatures('tag:divine');
    expect(divineFeatured.some(f => f.id === 'class_druid')).toBe(true);
  });
});

// ============================================================
// PHASE 21.7.4 — DataLoader Injection Chain Tests
// ============================================================
//
// These tests exercise the FULL dual-scope resolution chain introduced in
// Phase 21.1.3 (ARCHITECTURE.md §21.5):
//
//   1. Static file sources (static/rules/)            — lowest priority
//   2. Global file sources (storage/rules/)            — interleaved alphabetically
//   3. Campaign homebrew  (campaigns.homebrew_rules_json) — above all file sources
//   4. GM global overrides (campaigns.gmGlobalOverrides)  — highest file-like priority
//
// FETCH MOCK STRATEGY FOR INJECTION TESTS:
//   These tests need more fine-grained control over fetch() than the global
//   `beforeAll` mock provides (which returns [] for every request). Each
//   describe block installs its own per-test vi.fn() via `beforeEach`
//   and restores it in `afterEach`. This overrides the global stub for that
//   block without interfering with other suites.
//
// TEST FEATURE: "race_elf"
//   A canonical SRD elf race used as the base entity in all injection tests.
//   Each test simulates a different resolution layer asserting the correct
//   winner in the priority chain.
// ============================================================

// ---------------------------------------------------------------------------
// Shared fixtures for injection tests
// ---------------------------------------------------------------------------

/** A minimal SRD "race_elf" from the base static rules file. */
const SRD_ELF: Record<string, unknown> = {
  id: 'race_elf',
  category: 'race',
  label: { en: 'Elf (SRD)' },
  description: { en: 'The base SRD elf.' },
  ruleSource: 'srd_core',
  tags: ['race', 'elf', 'srd_tag'],
  grantedModifiers: [],
  grantedFeatures: ['feat_low_light_vision'],
};

/** Global-file override of race_elf (replace semantics by default). */
const GLOBAL_ELF: Record<string, unknown> = {
  id: 'race_elf',
  category: 'race',
  label: { en: 'Elf (Global Override)' },
  description: { en: 'Global server-side customisation.' },
  ruleSource: 'global_setting',
  tags: ['race', 'elf', 'global_tag'],
  grantedModifiers: [],
  grantedFeatures: ['feat_low_light_vision'],
};

/** Campaign homebrew override of race_elf (replace semantics). */
const HOMEBREW_ELF: Record<string, unknown> = {
  id: 'race_elf',
  category: 'race',
  label: { en: 'Elf (Campaign Homebrew)' },
  description: { en: 'Campaign-scoped homebrew elf.' },
  ruleSource: 'user_homebrew',
  tags: ['race', 'elf', 'homebrew_tag'],
  grantedModifiers: [],
  grantedFeatures: ['feat_low_light_vision'],
};

/** GM global override of race_elf (replace semantics). */
const GM_ELF: Record<string, unknown> = {
  id: 'race_elf',
  category: 'race',
  label: { en: 'Elf (GM Override)' },
  description: { en: 'GM last-minute adjustment.' },
  ruleSource: 'gm_override',
  tags: ['race', 'elf', 'gm_tag'],
  grantedModifiers: [],
  grantedFeatures: ['feat_low_light_vision'],
};

// ---------------------------------------------------------------------------
// Helper: build a fetch mock that routes by URL
// ---------------------------------------------------------------------------

/**
 * Builds a `fetch` mock function whose behaviour is controlled by a URL→response
 * routing table.  Any URL not in the table falls through to the default: an
 * empty JSON array (same as the global `beforeAll` stub).
 *
 * EXACT MATCHING:
 *   Uses exact URL equality (`url === key`) so that "/rules/01_srd/races.json"
 *   does NOT accidentally match the "/rules" discovery key, which is a strict
 *   prefix of the per-file URL.  Substring matching would cause the file-fetch
 *   URLs to be mis-routed to the discovery endpoint's response.
 *
 * @param routes - Map of exact URL → resolved body (JSON-serialisable).
 */
function buildFetchMock(routes: Record<string, unknown>): ReturnType<typeof vi.fn> {
  return vi.fn().mockImplementation((url: string) => {
    // Exact-key lookup — O(1), unambiguous.
    if (Object.prototype.hasOwnProperty.call(routes, url)) {
      return Promise.resolve({
        ok: true,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve(routes[url]),
      });
    }
    // Default: empty array (no static files, no global files)
    return Promise.resolve({
      ok: true,
      headers: { get: () => 'application/json' },
      json: () => Promise.resolve([]),
    });
  });
}

// ============================================================
// INJECTION TEST 1:
// Campaign-homebrew entity with the same id as an SRD entity wins (replace)
// ============================================================

describe('DataLoader injection: campaign homebrew overrides SRD base', () => {
  let loader: DataLoader;

  beforeEach(() => {
    loader = new DataLoader();
    // Fetch mock: /rules returns ["/rules/srd_core/races.json"],
    // that file returns [SRD_ELF].  No global files (/api/global-rules → []).
    vi.stubGlobal('fetch', buildFetchMock({
      '/rules/srd_core/races.json': [SRD_ELF],
      '/rules':                     ['/rules/srd_core/races.json'],
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * ARCHITECTURE.md §21.5:
   *   "Campaign homebrew JSON is injected after all file sources … but BEFORE
   *    gmGlobalOverrides."  entity with same id → replace semantics, homebrew wins.
   *
   * SETUP:
   *   Static file layer:      race_elf (SRD)    → label: "Elf (SRD)"
   *   Campaign homebrew:      race_elf (homebrew) → label: "Elf (Campaign Homebrew)"
   *   gmGlobalOverrides:      (none)
   *
   * EXPECTED: label = "Elf (Campaign Homebrew)", tags contain 'homebrew_tag',
   *           SRD-only tag 'srd_tag' is absent (replace semantics).
   */
  it('campaign-homebrew entity with same id fully replaces SRD entity', async () => {
    await loader.loadRuleSources(
      ['srd_core'],
      undefined,                          // no GM overrides
      JSON.stringify([HOMEBREW_ELF])      // campaign homebrew
    );

    const elf = loader.getFeature('race_elf');
    expect(elf).toBeDefined();
    expect(elf!.label['en']).toBe('Elf (Campaign Homebrew)');
    expect(elf!.tags).toContain('homebrew_tag');
    // SRD base is completely replaced — its exclusive tag is gone
    expect(elf!.tags).not.toContain('srd_tag');
  });

  /**
   * Verify that ruleSource is stamped to "user_homebrew" regardless of what
   * the homebrew JSON declared, ensuring the entity survives the filter.
   * ARCHITECTURE.md §21.5: "Stamped with ruleSource:'user_homebrew' (always active)."
   */
  it('campaign-homebrew entities are stamped with ruleSource "user_homebrew"', async () => {
    // Homebrew entity that incorrectly declares ruleSource as something else
    const badRuleSource = { ...HOMEBREW_ELF, ruleSource: 'some_other_source' };
    await loader.loadRuleSources(
      ['srd_core'],
      undefined,
      JSON.stringify([badRuleSource])
    );

    const elf = loader.getFeature('race_elf');
    // The DataLoader must force ruleSource = "user_homebrew"
    expect(elf?.ruleSource).toBe('user_homebrew');
  });

  /**
   * getHomebrewRules('campaign') should return exactly the campaign-homebrew entity.
   */
  it('getHomebrewRules("campaign") returns only campaign-scoped entities', async () => {
    await loader.loadRuleSources(
      ['srd_core'],
      undefined,
      JSON.stringify([HOMEBREW_ELF])
    );

    const homebrew = loader.getHomebrewRules('campaign');
    expect(homebrew).toHaveLength(1);
    expect(homebrew[0].id).toBe('race_elf');
    expect(homebrew[0].ruleSource).toBe('user_homebrew');
  });
});

// ============================================================
// INJECTION TEST 2:
// Global-scope file is interleaved alphabetically between SRD files.
// ============================================================

describe('DataLoader injection: global files interleaved alphabetically', () => {
  let loader: DataLoader;

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * ARCHITECTURE.md §21.5:
   *   "Files in storage/rules/ are merged into the alphabetical file sort alongside
   *    static/rules/ files — their position is determined by filename."
   *
   * FILE NAMED "00_z.json" (global) sorts BEFORE "01_*" (SRD) because
   *   "00_z.json" < "01_srd_core/races.json" alphabetically.
   * → Global file loads FIRST → SRD file overwrites it.
   *
   * SETUP:
   *   static  "01_srd_core/races.json"   → race_elf (SRD)   label: "Elf (SRD)"
   *   global  "00_z.json"                → race_elf (global) label: "Elf (Global Override)"
   *
   * Expected load order by sortKey: "00_z.json" then "01_srd_core/races.json"
   * → Because "00" < "01" alphabetically, global loads BEFORE static → SRD wins.
   */
  it('global file "00_z.json" loads BEFORE "01_*" SRD files → SRD wins', async () => {
    loader = new DataLoader();
    vi.stubGlobal('fetch', buildFetchMock({
      '/rules':                        ['/rules/01_srd_core/races.json'],
      '/rules/01_srd_core/races.json': [SRD_ELF],
      '/api/global-rules':             [{ filename: '00_z.json', bytes: 100 }],
      '/api/global-rules/00_z.json':   [GLOBAL_ELF],
    }));

    await loader.loadRuleSources(['srd_core', 'global_setting']);

    const elf = loader.getFeature('race_elf');
    expect(elf).toBeDefined();
    // "01_srd_core/races.json" sorted AFTER "00_z.json" → SRD is loaded last → SRD wins
    expect(elf!.label['en']).toBe('Elf (SRD)');
    expect(elf!.tags).toContain('srd_tag');
    expect(elf!.tags).not.toContain('global_tag');
  });

  /**
   * FILE NAMED "99_z.json" sorts AFTER all SRD files because
   *   "99_z.json" > "01_srd_core/..." alphabetically.
   * → Global file loads LAST → global file wins.
   *
   * SETUP:
   *   static  "01_srd_core/races.json"   → race_elf (SRD)    label: "Elf (SRD)"
   *   global  "99_z.json"                → race_elf (global)  label: "Elf (Global Override)"
   *
   * Expected load order by sortKey: "01_srd_core/races.json" then "99_z.json"
   * → Global is loaded AFTER static → global wins.
   */
  it('global file "99_z.json" loads AFTER all SRD files → global wins', async () => {
    loader = new DataLoader();
    vi.stubGlobal('fetch', buildFetchMock({
      '/rules':                        ['/rules/01_srd_core/races.json'],
      '/rules/01_srd_core/races.json': [SRD_ELF],
      '/api/global-rules':             [{ filename: '99_z.json', bytes: 100 }],
      '/api/global-rules/99_z.json':   [GLOBAL_ELF],
    }));

    await loader.loadRuleSources(['srd_core', 'global_setting']);

    const elf = loader.getFeature('race_elf');
    expect(elf).toBeDefined();
    // "99_z.json" sorted AFTER "01_srd_core/races.json" → global is loaded last → global wins
    expect(elf!.label['en']).toBe('Elf (Global Override)');
    expect(elf!.tags).toContain('global_tag');
    expect(elf!.tags).not.toContain('srd_tag');
  });

  /**
   * Two global files interleaved correctly in a multi-file sort.
   * "20_*.json" < "50_*.json" — the 20_ file loads first and 50_ overwrites it.
   */
  it('two global files are sorted with each other — higher number wins', async () => {
    const earlyGlobal: Record<string, unknown> = {
      ...GLOBAL_ELF,
      label: { en: 'Elf (20_global)' },
      tags: ['race', 'elf', 'early_global'],
    };
    const lateGlobal: Record<string, unknown> = {
      ...GLOBAL_ELF,
      label: { en: 'Elf (50_global)' },
      tags: ['race', 'elf', 'late_global'],
    };

    loader = new DataLoader();
    vi.stubGlobal('fetch', buildFetchMock({
      '/rules':                          [],  // No static files
      '/api/global-rules':               [
        { filename: '20_early.json', bytes: 50 },
        { filename: '50_late.json',  bytes: 50 },
      ],
      '/api/global-rules/20_early.json': [earlyGlobal],
      '/api/global-rules/50_late.json':  [lateGlobal],
    }));

    await loader.loadRuleSources(['global_setting']);

    const elf = loader.getFeature('race_elf');
    expect(elf).toBeDefined();
    // "50_late.json" sorts after "20_early.json" → 50_ wins
    expect(elf!.label['en']).toBe('Elf (50_global)');
    expect(elf!.tags).toContain('late_global');
    expect(elf!.tags).not.toContain('early_global');
  });
});

// ============================================================
// INJECTION TEST 3:
// user_homebrew (campaign scope) ranks ABOVE global files
// ============================================================

describe('DataLoader injection: user_homebrew ranks above global files', () => {
  let loader: DataLoader;

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * ARCHITECTURE.md §21.5, resolution chain:
   *   "3. Campaign homebrew JSON … always active, stored in campaigns.homebrew_rules_json.
   *    2. Files in storage/rules/ … global homebrew."
   *   Campaign (layer 3) is applied AFTER global files (layer 2) → campaign wins.
   *
   * SETUP:
   *   global  "50_setting.json"  → race_elf (global)    label: "Elf (Global Override)"
   *   campaign homebrew          → race_elf (campaign)   label: "Elf (Campaign Homebrew)"
   *   GM overrides               → (none)
   *
   * EXPECTED: campaign homebrew wins because it is injected after all file sources.
   */
  it('campaign homebrew overrides a global file with the same entity id', async () => {
    loader = new DataLoader();
    vi.stubGlobal('fetch', buildFetchMock({
      '/rules':                          [],
      '/api/global-rules':               [{ filename: '50_setting.json', bytes: 50 }],
      '/api/global-rules/50_setting.json': [GLOBAL_ELF],
    }));

    await loader.loadRuleSources(
      ['global_setting'],
      undefined,                         // no GM overrides
      JSON.stringify([HOMEBREW_ELF])     // campaign homebrew — should win
    );

    const elf = loader.getFeature('race_elf');
    expect(elf).toBeDefined();
    expect(elf!.label['en']).toBe('Elf (Campaign Homebrew)');
    expect(elf!.tags).toContain('homebrew_tag');
    expect(elf!.tags).not.toContain('global_tag');
  });

  /**
   * Campaign homebrew ranks above BOTH a static file AND a global file with the
   * same entity id.  All three layers present, campaign must win.
   */
  it('campaign homebrew ranks above both static and global files', async () => {
    loader = new DataLoader();
    vi.stubGlobal('fetch', buildFetchMock({
      '/rules':                          ['/rules/01_srd/races.json'],
      '/rules/01_srd/races.json':        [SRD_ELF],
      '/api/global-rules':               [{ filename: '50_setting.json', bytes: 50 }],
      '/api/global-rules/50_setting.json': [GLOBAL_ELF],
    }));

    await loader.loadRuleSources(
      ['srd_core', 'global_setting'],
      undefined,
      JSON.stringify([HOMEBREW_ELF])
    );

    const elf = loader.getFeature('race_elf');
    expect(elf!.label['en']).toBe('Elf (Campaign Homebrew)');
    expect(elf!.ruleSource).toBe('user_homebrew');
  });
});

// ============================================================
// INJECTION TEST 4:
// gmGlobalOverrides ranks ABOVE campaign homebrew
// ============================================================

describe('DataLoader injection: gmGlobalOverrides ranks above campaign homebrew', () => {
  let loader: DataLoader;

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * ARCHITECTURE.md §21.5, resolution chain:
   *   "4. GM global overrides (campaigns.gmGlobalOverrides)."
   *   GM overrides are applied last among file-like sources → they win over campaign homebrew.
   *
   * SETUP:
   *   campaign homebrew  → race_elf (campaign)  label: "Elf (Campaign Homebrew)"
   *   GM global override → race_elf (GM)         label: "Elf (GM Override)"
   *
   * EXPECTED: GM override wins.
   */
  it('gmGlobalOverrides overwrites campaign homebrew for the same entity id', async () => {
    loader = new DataLoader();
    vi.stubGlobal('fetch', buildFetchMock({
      '/rules':            [],
      '/api/global-rules': [],
    }));

    await loader.loadRuleSources(
      [],
      JSON.stringify([GM_ELF]),           // GM global override — highest priority
      JSON.stringify([HOMEBREW_ELF])      // campaign homebrew — should lose
    );

    const elf = loader.getFeature('race_elf');
    expect(elf).toBeDefined();
    expect(elf!.label['en']).toBe('Elf (GM Override)');
    expect(elf!.tags).toContain('gm_tag');
    expect(elf!.tags).not.toContain('homebrew_tag');
  });

  /**
   * Full four-layer chain: static → global → campaign → GM.
   * Each layer adds a distinct tag.  After loading, only the GM entity survives
   * (replace semantics at each layer).
   */
  it('full four-layer chain: static → global → campaign → GM (GM wins)', async () => {
    loader = new DataLoader();
    vi.stubGlobal('fetch', buildFetchMock({
      '/rules':                          ['/rules/01_srd/races.json'],
      '/rules/01_srd/races.json':        [SRD_ELF],
      '/api/global-rules':               [{ filename: '99_global.json', bytes: 50 }],
      '/api/global-rules/99_global.json': [GLOBAL_ELF],
    }));

    await loader.loadRuleSources(
      ['srd_core', 'global_setting'],
      JSON.stringify([GM_ELF]),
      JSON.stringify([HOMEBREW_ELF])
    );

    const elf = loader.getFeature('race_elf');
    expect(elf!.label['en']).toBe('Elf (GM Override)');
    // Only the GM layer's tag survives (each layer is a full replace)
    expect(elf!.tags).toContain('gm_tag');
    expect(elf!.tags).not.toContain('srd_tag');
    expect(elf!.tags).not.toContain('global_tag');
    expect(elf!.tags).not.toContain('homebrew_tag');
  });

  /**
   * GM override with merge: "partial" adds to the campaign homebrew rather than
   * replacing it entirely. Proves that merge semantics apply at every layer.
   */
  it('gmGlobalOverrides with merge "partial" extends campaign homebrew additively', async () => {
    loader = new DataLoader();
    vi.stubGlobal('fetch', buildFetchMock({
      '/rules':            [],
      '/api/global-rules': [],
    }));

    const gmPartial: Record<string, unknown> = {
      id: 'race_elf',
      category: 'race',
      ruleSource: 'gm_override',
      merge: 'partial',
      tags: ['gm_partial_tag'],           // appended to campaign homebrew tags
      grantedModifiers: [],
      grantedFeatures: [],
    };

    await loader.loadRuleSources(
      [],
      JSON.stringify([gmPartial]),
      JSON.stringify([HOMEBREW_ELF])
    );

    const elf = loader.getFeature('race_elf');
    // Both campaign homebrew tags AND GM partial tags should be present
    expect(elf!.tags).toContain('homebrew_tag');
    expect(elf!.tags).toContain('gm_partial_tag');
    // Base elf tag also preserved (from campaign homebrew layer)
    expect(elf!.tags).toContain('elf');
  });
});

// ============================================================
// INJECTION TEST 5:
// merge: "partial" homebrew extends SRD base without clobbering
// non-overridden fields
// ============================================================

describe('DataLoader injection: partial-merge homebrew extends SRD base', () => {
  let loader: DataLoader;

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * ARCHITECTURE.md §21.5 + §18.3:
   *   A campaign-homebrew entity declaring merge: "partial" must ADD its fields
   *   to the existing SRD entity without clobbering non-overridden fields.
   *
   * SETUP:
   *   static file: race_elf (SRD) with tags ["race","elf","srd_tag"]
   *                and grantedFeatures: ["feat_low_light_vision"]
   *
   *   campaign homebrew (partial): adds tag "homebrew_tag", adds grantedFeature
   *                "feat_elven_weapon_proficiency", changes label "en" only.
   *
   * EXPECTED after partial merge:
   *   - tags: contain both "srd_tag" (preserved) and "homebrew_tag" (appended)
   *   - grantedFeatures: contain both "feat_low_light_vision" and "feat_elven_weapon_proficiency"
   *   - label.en updated (scalar overwrite)
   *   - description.en from SRD preserved (not in partial)
   */
  it('partial homebrew appends tags and features without clobbering SRD base', async () => {
    loader = new DataLoader();
    vi.stubGlobal('fetch', buildFetchMock({
      '/rules':                        ['/rules/01_srd/races.json'],
      '/rules/01_srd/races.json':      [SRD_ELF],
    }));

    const partialHomebrew: Record<string, unknown> = {
      id: 'race_elf',
      category: 'race',
      ruleSource: 'user_homebrew',
      merge: 'partial',
      label: { en: 'Elf (Homebrew Variant)' },
      // description NOT provided → must be preserved from SRD base
      tags: ['homebrew_tag'],
      grantedModifiers: [],
      grantedFeatures: ['feat_elven_weapon_proficiency'],
    };

    await loader.loadRuleSources(
      ['srd_core'],
      undefined,
      JSON.stringify([partialHomebrew])
    );

    const elf = loader.getFeature('race_elf');
    expect(elf).toBeDefined();

    // Label scalar overwritten by partial:
    expect(elf!.label['en']).toBe('Elf (Homebrew Variant)');

    // Description NOT in partial → SRD value preserved:
    expect(elf!.description?.['en']).toBe('The base SRD elf.');

    // Tags: SRD tags preserved AND homebrew tag appended:
    expect(elf!.tags).toContain('srd_tag');
    expect(elf!.tags).toContain('race');
    expect(elf!.tags).toContain('elf');
    expect(elf!.tags).toContain('homebrew_tag');

    // grantedFeatures: SRD features preserved AND homebrew feature appended:
    expect(elf!.grantedFeatures).toContain('feat_low_light_vision');
    expect(elf!.grantedFeatures).toContain('feat_elven_weapon_proficiency');
  });

  /**
   * A partial GM override on top of a partial campaign homebrew on top of SRD:
   * three-layer additive chain.  Each layer adds a distinct, non-conflicting tag.
   * All three tag sets must be present in the final result.
   */
  it('three-layer partial chain accumulates all tags additively', async () => {
    loader = new DataLoader();
    vi.stubGlobal('fetch', buildFetchMock({
      '/rules':                        ['/rules/01_srd/races.json'],
      '/rules/01_srd/races.json':      [SRD_ELF],
    }));

    const partialHomebrew: Record<string, unknown> = {
      id: 'race_elf',
      category: 'race',
      ruleSource: 'user_homebrew',
      merge: 'partial',
      tags: ['homebrew_tag'],
      grantedModifiers: [],
      grantedFeatures: [],
    };

    const partialGm: Record<string, unknown> = {
      id: 'race_elf',
      category: 'race',
      ruleSource: 'gm_override',
      merge: 'partial',
      tags: ['gm_tag'],
      grantedModifiers: [],
      grantedFeatures: [],
    };

    await loader.loadRuleSources(
      ['srd_core'],
      JSON.stringify([partialGm]),
      JSON.stringify([partialHomebrew])
    );

    const elf = loader.getFeature('race_elf');
    // All three tag sets should be present
    expect(elf!.tags).toContain('srd_tag');       // from SRD file
    expect(elf!.tags).toContain('homebrew_tag');  // from campaign homebrew partial
    expect(elf!.tags).toContain('gm_tag');        // from GM partial override
  });

  /**
   * A -prefix deletion in campaign homebrew removes an SRD-defined
   * grantedFeature.  Other SRD features are preserved.
   */
  it('partial-merge homebrew -prefix deletion removes an SRD grantedFeature', async () => {
    loader = new DataLoader();
    vi.stubGlobal('fetch', buildFetchMock({
      '/rules':                        ['/rules/01_srd/races.json'],
      '/rules/01_srd/races.json':      [SRD_ELF],
    }));

    const deletionHomebrew: Record<string, unknown> = {
      id: 'race_elf',
      category: 'race',
      ruleSource: 'user_homebrew',
      merge: 'partial',
      tags: [],
      grantedModifiers: [],
      grantedFeatures: ['-feat_low_light_vision'],  // remove SRD feature
    };

    await loader.loadRuleSources(
      ['srd_core'],
      undefined,
      JSON.stringify([deletionHomebrew])
    );

    const elf = loader.getFeature('race_elf');
    // SRD feature removed by -prefix delegation
    expect(elf!.grantedFeatures).not.toContain('feat_low_light_vision');
    // Deletion marker itself must not remain in the array
    expect(elf!.grantedFeatures).not.toContain('-feat_low_light_vision');
  });
});

// ============================================================
// PHASE 21.7.8 — Override-by-ID Integration Test
// ============================================================
//
// Full end-to-end cycle exercising the COMPLETE override-by-ID pipeline:
//
//   HomebrewStore  →  DataLoader.loadRuleSources  →  feature cache
//
// Spec (PROGRESS.md §21.7.8):
//   1. Entity with id: "race_elf" added to HomebrewStore.
//   2. HomebrewStore serialises the entity array to JSON
//      (toJSON() → campaignHomebrewRulesJson argument).
//   3. DataLoader.loadRuleSources() injected with the JSON.
//   4. Result: cache contains the HOMEBREW race_elf, not the SRD one.
//   5. SRD-only fields absent (replace semantics — homebrew fully replaced SRD).
//   6. Switching to merge: "partial" → SRD base tags still present AND
//      homebrew tags appended — additive merge confirmed.
//
// WHY IMPORT HomebrewStore?
//   This test verifies the complete serialization path:
//   HomebrewStore.toJSON() → DataLoader.loadRuleSources().
//   Using the store's own toJSON() surface ensures the integration is tested
//   as production code would call it, not just JSON.stringify directly.
//
// FETCH MOCK:
//   Uses the same exact-match buildFetchMock from the Phase 21.7.4 suites above.
//   The SRD mock serves race_elf from a static file, and the global-rules
//   endpoint returns an empty list (no storage/rules/ files in this test).
// ============================================================

import { HomebrewStore } from '$lib/engine/HomebrewStore.svelte';

// ---------------------------------------------------------------------------
// Override-by-ID fixtures
// ---------------------------------------------------------------------------

const SRD_ELF_OBJ: Record<string, unknown> = {
  id:               'race_elf',
  category:         'race',
  label:            { en: 'Elf (SRD)' },
  description:      { en: 'The SRD base elf.' },
  ruleSource:       'srd_core',
  tags:             ['race', 'elf', 'srd_tag', 'srd_exclusive'],
  grantedModifiers: [],
  grantedFeatures:  ['feat_low_light_vision', 'feat_srd_immunity'],
};

describe('Override-by-ID integration: HomebrewStore → DataLoader full cycle', () => {
  let loader: DataLoader;

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * CYCLE TEST 1 (spec step 1–5):
   * Add a homebrew race_elf to HomebrewStore, serialize via toJSON(),
   * inject into loadRuleSources() as campaignHomebrewRulesJson.
   * Verify the HOMEBREW entity is in the cache and SRD-only fields are absent
   * (replace semantics: homebrew fully replaced the SRD entity).
   */
  it('homebrew entity with same id as SRD entity replaces it completely (replace semantics)', async () => {
    loader = new DataLoader();

    // Step 1: Create HomebrewStore and add a homebrew race_elf.
    const store = new HomebrewStore();
    store.add({
      id:               'race_elf',
      category:         'race',
      label:            { en: 'Elf (Homebrew)' },
      description:      { en: 'Our campaign-specific elf.' },
      ruleSource:       'user_homebrew',
      tags:             ['race', 'elf', 'homebrew_tag'],
      grantedModifiers: [],
      grantedFeatures:  ['feat_homebrew_ability'],
    });

    // Confirm store has the entity and is dirty (unsaved).
    expect(store.entities).toHaveLength(1);
    expect(store.entities[0].id).toBe('race_elf');
    expect(store.isDirty).toBe(true);

    // Step 2: Serialize via HomebrewStore.toJSON().
    const campaignJson = store.toJSON();
    expect(() => JSON.parse(campaignJson)).not.toThrow();
    expect(JSON.parse(campaignJson)).toHaveLength(1);

    // Step 3: Provide an SRD static file with the same entity.
    vi.stubGlobal('fetch', buildFetchMock({
      '/rules':                        ['/rules/01_srd/races.json'],
      '/rules/01_srd/races.json':      [SRD_ELF_OBJ],
      '/api/global-rules':             [],
    }));

    // Step 4: Inject into DataLoader as campaign homebrew.
    await loader.loadRuleSources(['srd_core'], undefined, campaignJson);

    // Step 5: Verify the HOMEBREW entity wins (campaign layer > static layer).
    const elf = loader.getFeature('race_elf');
    expect(elf).toBeDefined();

    // Homebrew label, not SRD label.
    expect(elf!.label['en']).toBe('Elf (Homebrew)');

    // ruleSource is stamped as 'user_homebrew' by DataLoader.#applyCampaignHomebrew.
    expect(elf!.ruleSource).toBe('user_homebrew');

    // Homebrew tags present.
    expect(elf!.tags).toContain('homebrew_tag');
    expect(elf!.tags).toContain('elf');

    // SRD-only fields absent (replace semantics — full replacement, not merge).
    expect(elf!.tags).not.toContain('srd_tag');
    expect(elf!.tags).not.toContain('srd_exclusive');

    // SRD-only grantedFeatures absent.
    expect(elf!.grantedFeatures).not.toContain('feat_srd_immunity');

    // Homebrew-specific grantedFeature present.
    expect(elf!.grantedFeatures).toContain('feat_homebrew_ability');
  });

  /**
   * CYCLE TEST 2 (spec step 6 — partial merge path):
   * Same cycle but the homebrew entity declares merge: "partial".
   * SRD BASE tags must still be present (preserved from the static layer),
   * AND homebrew tags must be appended (additive merge).
   *
   * WHY THIS MATTERS:
   *   A GM may want to tweak an SRD elf without losing all its base properties.
   *   merge: "partial" is the non-destructive override path.
   */
  it('homebrew entity with merge="partial" appends tags to SRD base (additive merge)', async () => {
    loader = new DataLoader();

    // Step 1: HomebrewStore with a PARTIAL homebrew race_elf.
    const store = new HomebrewStore();
    store.add({
      id:               'race_elf',
      category:         'race',
      label:            { en: 'Elf (Partial Homebrew)' },
      description:      { en: '' },
      ruleSource:       'user_homebrew',
      merge:            'partial',
      tags:             ['homebrew_partial_tag'],    // to be APPENDED
      grantedModifiers: [],
      grantedFeatures:  ['feat_bonus_cantrip'],      // to be ADDED
    });

    // Verify entity in store.
    expect(store.entities[0].merge).toBe('partial');

    // Step 2: Serialize.
    const campaignJson = store.toJSON();

    // Step 3: Static file provides SRD base.
    vi.stubGlobal('fetch', buildFetchMock({
      '/rules':                        ['/rules/01_srd/races.json'],
      '/rules/01_srd/races.json':      [SRD_ELF_OBJ],
      '/api/global-rules':             [],
    }));

    // Step 4: Inject.
    await loader.loadRuleSources(['srd_core'], undefined, campaignJson);

    // Step 5: Verify SRD tags preserved AND homebrew tags appended.
    const elf = loader.getFeature('race_elf');
    expect(elf).toBeDefined();

    // SRD base tags PRESERVED (partial merge does not replace).
    expect(elf!.tags).toContain('srd_tag');
    expect(elf!.tags).toContain('srd_exclusive');
    expect(elf!.tags).toContain('race');
    expect(elf!.tags).toContain('elf');

    // Homebrew tag APPENDED.
    expect(elf!.tags).toContain('homebrew_partial_tag');

    // SRD grantedFeatures PRESERVED.
    expect(elf!.grantedFeatures).toContain('feat_low_light_vision');
    expect(elf!.grantedFeatures).toContain('feat_srd_immunity');

    // Homebrew grantedFeature ADDED.
    expect(elf!.grantedFeatures).toContain('feat_bonus_cantrip');

    // Label OVERWRITTEN by partial (scalar overwrite rule).
    expect(elf!.label['en']).toBe('Elf (Partial Homebrew)');
  });

  /**
   * CYCLE TEST 3 — HomebrewStore.remove() removes entity from DataLoader cycle.
   * After calling remove() and re-injecting, the entity must revert to SRD.
   *
   * WHY TEST REMOVE?
   *   The GM may delete a homebrew override mid-session. After deletion and
   *   re-load, the SRD entity must reappear — not leave a ghost.
   */
  it('removing homebrew entity from store reverts to SRD entity on next load', async () => {
    loader = new DataLoader();

    const store = new HomebrewStore();
    store.add({
      id:               'race_elf',
      category:         'race',
      label:            { en: 'Elf (Homebrew to Delete)' },
      description:      { en: '' },
      ruleSource:       'user_homebrew',
      tags:             ['homebrew_delete_tag'],
      grantedModifiers: [],
      grantedFeatures:  [],
    });

    vi.stubGlobal('fetch', buildFetchMock({
      '/rules':                        ['/rules/01_srd/races.json'],
      '/rules/01_srd/races.json':      [SRD_ELF_OBJ],
      '/api/global-rules':             [],
    }));

    // Inject with homebrew present.
    await loader.loadRuleSources(['srd_core'], undefined, store.toJSON());
    expect(loader.getFeature('race_elf')!.label['en']).toBe('Elf (Homebrew to Delete)');

    // Remove the homebrew entity from the store.
    const removed = store.remove('race_elf');
    expect(removed).toBe(true);
    expect(store.entities).toHaveLength(0);

    // Re-inject with empty homebrew.
    loader.clearCache();
    await loader.loadRuleSources(['srd_core'], undefined, store.toJSON());

    // SRD entity must now be present.
    const elf = loader.getFeature('race_elf');
    expect(elf).toBeDefined();
    expect(elf!.label['en']).toBe('Elf (SRD)');
    expect(elf!.ruleSource).toBe('srd_core');
    expect(elf!.tags).toContain('srd_tag');
    expect(elf!.tags).not.toContain('homebrew_delete_tag');
  });

  /**
   * CYCLE TEST 4 — HomebrewStore.update() patchs entity; DataLoader sees new value.
   * Update a field, re-inject, verify the cache reflects the updated value.
   */
  it('update() on homebrew entity is reflected in DataLoader after re-injection', async () => {
    loader = new DataLoader();

    const store = new HomebrewStore();
    store.add({
      id:               'race_elf',
      category:         'race',
      label:            { en: 'Elf v1' },
      description:      { en: '' },
      ruleSource:       'user_homebrew',
      tags:             ['v1_tag'],
      grantedModifiers: [],
      grantedFeatures:  [],
    });

    vi.stubGlobal('fetch', buildFetchMock({
      '/rules':        [],
      '/api/global-rules': [],
    }));

    // First injection.
    await loader.loadRuleSources([], undefined, store.toJSON());
    expect(loader.getFeature('race_elf')!.label['en']).toBe('Elf v1');

    // Update label via store.
    store.update('race_elf', { label: { en: 'Elf v2' }, tags: ['v1_tag', 'v2_tag'] });
    expect(store.getById('race_elf')!.label['en']).toBe('Elf v2');

    // Re-inject.
    loader.clearCache();
    await loader.loadRuleSources([], undefined, store.toJSON());

    const elf = loader.getFeature('race_elf');
    expect(elf!.label['en']).toBe('Elf v2');
    expect(elf!.tags).toContain('v2_tag');
  });

  /**
   * CYCLE TEST 5 — Multiple homebrew entities from a single store inject correctly.
   * Store holds race_elf (override) + feat_custom (new entity).
   * After injection: both are in the cache; feat_custom is entirely new.
   */
  it('multiple entities from HomebrewStore all appear in DataLoader cache', async () => {
    loader = new DataLoader();

    const store = new HomebrewStore();
    store.add({
      id:               'race_elf',
      category:         'race',
      label:            { en: 'Elf (Multi-test)' },
      description:      { en: '' },
      ruleSource:       'user_homebrew',
      tags:             ['elf', 'homebrew'],
      grantedModifiers: [],
      grantedFeatures:  [],
    });
    store.add({
      id:               'feat_homebrew_custom',
      category:         'feat',
      label:            { en: 'Custom Homebrew Feat' },
      description:      { en: 'A new feat not in any SRD.' },
      ruleSource:       'user_homebrew',
      tags:             ['feat', 'custom_homebrew'],
      grantedModifiers: [],
      grantedFeatures:  [],
    });

    expect(store.entities).toHaveLength(2);
    const campaignJson = store.toJSON();

    vi.stubGlobal('fetch', buildFetchMock({
      '/rules':            [],
      '/api/global-rules': [],
    }));

    await loader.loadRuleSources([], undefined, campaignJson);

    // Both entities present.
    expect(loader.getFeature('race_elf')).toBeDefined();
    expect(loader.getFeature('feat_homebrew_custom')).toBeDefined();

    // Correct labels.
    expect(loader.getFeature('race_elf')!.label['en']).toBe('Elf (Multi-test)');
    expect(loader.getFeature('feat_homebrew_custom')!.label['en']).toBe('Custom Homebrew Feat');

    // Both stamped user_homebrew.
    expect(loader.getFeature('race_elf')!.ruleSource).toBe('user_homebrew');
    expect(loader.getFeature('feat_homebrew_custom')!.ruleSource).toBe('user_homebrew');

    // getHomebrewRules('campaign') returns exactly 2 entries.
    const campaignRules = loader.getHomebrewRules('campaign');
    expect(campaignRules).toHaveLength(2);
    expect(campaignRules.map(f => f.id).sort()).toEqual(
      ['feat_homebrew_custom', 'race_elf'].sort()
    );
  });

  /**
   * CYCLE TEST 6 — importJSON() round-trip via DataLoader.
   * Use HomebrewStore.importJSON() to bulk-replace entities, then inject.
   * Verifies importJSON → toJSON() → DataLoader is a clean path.
   */
  it('importJSON() → toJSON() → DataLoader produces the imported entities', async () => {
    loader = new DataLoader();

    const store = new HomebrewStore();

    // Bulk-import two entities via importJSON.
    const bulkEntities = [
      {
        id: 'race_gnome', category: 'race',
        label: { en: 'Gnome (Imported)' }, description: { en: '' },
        ruleSource: 'user_homebrew',
        tags: ['race', 'gnome', 'imported'],
        grantedModifiers: [], grantedFeatures: [],
      },
      {
        id: 'race_halfling', category: 'race',
        label: { en: 'Halfling (Imported)' }, description: { en: '' },
        ruleSource: 'user_homebrew',
        tags: ['race', 'halfling', 'imported'],
        grantedModifiers: [], grantedFeatures: [],
      },
    ];

    store.importJSON(JSON.stringify(bulkEntities));
    expect(store.entities).toHaveLength(2);
    expect(store.isDirty).toBe(true);

    vi.stubGlobal('fetch', buildFetchMock({
      '/rules':            [],
      '/api/global-rules': [],
    }));

    await loader.loadRuleSources([], undefined, store.toJSON());

    expect(loader.getFeature('race_gnome')!.label['en']).toBe('Gnome (Imported)');
    expect(loader.getFeature('race_halfling')!.label['en']).toBe('Halfling (Imported)');
    expect(loader.getHomebrewRules('campaign')).toHaveLength(2);
  });
});
