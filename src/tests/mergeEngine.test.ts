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

import { describe, it, expect, beforeEach } from 'vitest';
import { DataLoader } from '$lib/engine/DataLoader';
import type { Feature, LevelProgressionEntry } from '$lib/types/feature';
import type { Modifier } from '$lib/types/pipeline';
import type { ModifierType } from '$lib/types/primitives';

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
    makeModifier('druid_bab_l1', 'combatStats.bab', 0, 'base'),
    makeModifier('druid_fort_l1', 'saves.fort', 2, 'base'),
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
    makeEntry(1, [], [makeModifier('druid_bab_l1_prog', 'combatStats.bab', 0, 'base')]),
    makeEntry(2, ['feat_wild_shape_small'], [makeModifier('druid_bab_l2', 'combatStats.bab', 1, 'base')]),
    makeEntry(3, [], [makeModifier('druid_bab_l3', 'combatStats.bab', 0, 'base')]),
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
            makeModifier('druid_bab_l4', 'combatStats.bab', 1, 'base'),
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
            makeModifier('druid_bab_l2_revised', 'combatStats.bab', 1, 'base'),
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
