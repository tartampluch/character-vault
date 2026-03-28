/**
 * @file src/tests/componentSplits.test.ts
 * @description Logic-layer tests for Group F component splits (REFACTORING.md §F).
 *
 * WHY THIS FILE EXISTS:
 *   Group F extracted large Svelte components into focused sub-components.
 *   Because the project's Vitest environment is `node` and @testing-library/svelte
 *   is not available, we follow the same "logic layer only" approach used in
 *   rawJsonPanel.test.ts and conditionNodeBuilder.test.ts:
 *
 *   We lift the pure functions out of their component context and test them
 *   directly.  This exercises every real branch without needing a DOM renderer.
 *
 * WHAT IS COVERED:
 *
 * §1  GmOverridesPanel JSON validation  (F1e — GmOverridesPanel.svelte)
 *     The `_jsonValidation` derived block inside the component encapsulates
 *     all structural checks for the GM global-overrides textarea.  We extract
 *     its logic as `validateGmOverridesJson()` and verify:
 *     1.  Empty / `[]` text → valid, no error, no warnings.
 *     2.  Syntax error → invalid, error message contains line number.
 *     3.  Valid JSON but not an array → invalid.
 *     4.  Array with non-object entry → warning appended, still valid.
 *     5.  Entry missing both `id`+`category` and `tableId` → warning.
 *     6.  Config table entry (`tableId`) without `data` → warning.
 *     7.  Well-formed Feature entry → valid, no warnings.
 *     8.  Well-formed config-table entry → valid, no warnings.
 *     9.  Multiple warnings accumulate independently.
 *     10. Whitespace-only text treated as empty → valid.
 *
 * §2  TieredCostsEditor tier management  (F6 — TieredCostsEditor.svelte)
 *     The `makeBlankTier`, `addTier`, `deleteTier`, and `patchTier` helpers
 *     are pure data operations on an `ActivationTier[]`.  We re-implement them
 *     here as standalone functions (mirroring the component exactly) and verify:
 *     11. makeBlankTier returns an object with all required fields.
 *     12. addTier appends a blank tier to an existing list.
 *     13. addTier on an empty list creates a single-element list.
 *     14. deleteTier removes the correct element by index.
 *     15. deleteTier on the last element produces an empty list.
 *     16. patchTier updates only the specified field (label).
 *     17. patchTier updates `targetPoolId`.
 *     18. patchTier updates `cost`.
 *     19. patchTier does not mutate other tiers in the list.
 *
 * §3  MagicItemsCastingSubpanel item filtering  (F3a — MagicItemsCastingSubpanel.svelte)
 *     The component derives four sub-lists from `equippedItems`.  We re-implement
 *     those filter predicates as pure functions and verify:
 *     20. isMetamagicRod — true for items with `metamagicEffect`, false otherwise.
 *     21. isStaff — true for items with non-empty `staffSpells`, false otherwise.
 *     22. isWand — true for items with `wandSpell`, false otherwise.
 *     23. isScroll — true for items with non-empty `scrollSpells`, false otherwise.
 *     24. A single item list correctly partitioned into four sub-lists.
 *     25. An empty item list produces four empty sub-lists.
 *
 * §4  ModifierRow source-field defaulting  (F4 — ModifierRow.svelte)
 *     The component auto-fills `sourceId` / `sourceName` from the parent
 *     EditorContext when the modifier row is blank.  We test the defaulting
 *     logic extracted as a pure function:
 *     26. No existing sourceId → use entity id as default.
 *     27. Existing sourceId is preserved unchanged.
 *     28. No existing sourceName → use entity label as default.
 *     29. Existing sourceName is preserved unchanged.
 *
 * §5  Settings page structural contract  (F1a–F1f — settings/+page.svelte split)
 *     Verifies the orchestrating page shrank to ≤350 lines after the extraction
 *     (REFACTORING.md target: ~300 lines).  Uses `readFileSync` — no Svelte
 *     scheduler needed.
 *     30. settings/+page.svelte has ≤350 lines.
 *     31. ItemDataEditor.svelte has ≤350 lines.
 *     32. CastingPanel.svelte has ≤350 lines.
 *     33. ModifierListEditor.svelte has ≤200 lines.
 *     34. MagicDataEditor.svelte has ≤250 lines.
 *     35. ActivationEditor.svelte has ≤400 lines.
 *     36. Each new settings panel component exists.
 *     37. Each new content-editor sub-component exists.
 *     38. Each new magic sub-component exists.
 *
 * @see src/lib/components/settings/GmOverridesPanel.svelte
 * @see src/lib/components/content-editor/TieredCostsEditor.svelte
 * @see src/lib/components/magic/MagicItemsCastingSubpanel.svelte
 * @see src/lib/components/content-editor/ModifierRow.svelte
 * @see REFACTORING.md Group F
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ActivationTier } from '$lib/types/feature';
import type { ItemFeature } from '$lib/types/feature';
import type { Modifier } from '$lib/types/pipeline';
import type { LocalizedString } from '$lib/types/i18n';

// ---------------------------------------------------------------------------
// §1  GmOverridesPanel JSON validation logic
//     Extracted from GmOverridesPanel.svelte `_jsonValidation` derived block.
// ---------------------------------------------------------------------------

/**
 * Pure re-implementation of the validation logic in GmOverridesPanel.svelte.
 * Mirrors the component's script block so all branches are exercised
 * without requiring a Svelte component context.
 */
function validateGmOverridesJson(text: string): {
  valid: boolean;
  error: string;
  warnings: string[];
} {
  const trimmed = text.trim();

  if (!trimmed || trimmed === '[]') {
    return { valid: true, error: '', warnings: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e: unknown) {
    const err = e as Error;
    const posMatch = err.message.match(/position (\d+)/);
    let errMsg: string;
    if (posMatch) {
      const pos     = parseInt(posMatch[1], 10);
      const lineNum = text.slice(0, pos).split('\n').length;
      errMsg = `JSON syntax error on line ${lineNum}: ${err.message}`;
    } else {
      errMsg = `JSON syntax error: ${err.message}`;
    }
    return { valid: false, error: errMsg, warnings: [] };
  }

  if (!Array.isArray(parsed)) {
    return { valid: false, error: 'JSON must be an array', warnings: [] };
  }

  const warnings: string[] = [];
  for (let i = 0; i < (parsed as unknown[]).length; i++) {
    const entry = (parsed as Record<string, unknown>[])[i];
    if (!entry || typeof entry !== 'object') {
      warnings.push(`Entry ${i} has bad type: ${typeof entry}`);
      continue;
    }
    if (!entry['tableId'] && (!entry['id'] || !entry['category'])) {
      warnings.push(`Entry ${i} is missing id/category (id: ${entry['id'] ?? '?'})`);
    }
    if (entry['tableId'] && !entry['data']) {
      warnings.push(`Entry ${i} (tableId: ${entry['tableId']}) is missing data`);
    }
  }
  return { valid: true, error: '', warnings };
}

describe('GmOverridesPanel — JSON validation logic', () => {
  // Test 1
  it('empty string → valid, no error, no warnings', () => {
    const result = validateGmOverridesJson('');
    expect(result.valid).toBe(true);
    expect(result.error).toBe('');
    expect(result.warnings).toHaveLength(0);
  });

  // Test 2 (empty array literal)
  it('"[]" literal → valid, no error, no warnings', () => {
    const result = validateGmOverridesJson('[]');
    expect(result.valid).toBe(true);
    expect(result.error).toBe('');
    expect(result.warnings).toHaveLength(0);
  });

  // Test 3
  it('whitespace-only text → valid (treated as empty)', () => {
    const result = validateGmOverridesJson('   \n  \t  ');
    expect(result.valid).toBe(true);
  });

  // Test 4
  it('JSON syntax error → invalid with line number in error', () => {
    const text = '[\n  { "id": "feat_power_attack" \n  BROKEN }';
    const result = validateGmOverridesJson(text);
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
    // Error message should reference a line number
    expect(result.error).toMatch(/line \d+/i);
  });

  // Test 5 — single-line JSON error (no position match in some engines)
  it('syntax error without position match → still invalid with error message', () => {
    const result = validateGmOverridesJson('{ invalid json }');
    expect(result.valid).toBe(false);
    expect(result.error.length).toBeGreaterThan(0);
  });

  // Test 6
  it('valid JSON but not an array (object) → invalid', () => {
    const result = validateGmOverridesJson('{"id": "feat_x"}');
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  // Test 7
  it('valid JSON but not an array (string) → invalid', () => {
    const result = validateGmOverridesJson('"just a string"');
    expect(result.valid).toBe(false);
  });

  // Test 8
  it('array with non-object entry → warning, still valid', () => {
    const result = validateGmOverridesJson('[42, "hello"]');
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThanOrEqual(2);
  });

  // Test 9
  it('entry missing id and category (no tableId) → warning', () => {
    const result = validateGmOverridesJson('[{"tags":["item"]}]');
    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.includes('missing'))).toBe(true);
  });

  // Test 10
  it('config-table entry (tableId) without data → warning', () => {
    const result = validateGmOverridesJson('[{"tableId":"config_xp_table"}]');
    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.includes('config_xp_table'))).toBe(true);
  });

  // Test 11
  it('well-formed Feature entry → valid, no warnings', () => {
    const entry = JSON.stringify([{ id: 'feat_power_attack', category: 'feat', grantedModifiers: [] }]);
    const result = validateGmOverridesJson(entry);
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  // Test 12
  it('well-formed config-table entry → valid, no warnings', () => {
    const entry = JSON.stringify([{ tableId: 'config_xp_table', data: {} }]);
    const result = validateGmOverridesJson(entry);
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  // Test 13
  it('multiple warning causes accumulate independently', () => {
    const mixed = JSON.stringify([
      42,                                    // non-object → 1 warning
      { tags: ['item'] },                    // missing id/category → 1 warning
      { tableId: 'config_x' },               // tableId without data → 1 warning
    ]);
    const result = validateGmOverridesJson(mixed);
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// §2  TieredCostsEditor tier management logic
//     Mirrors makeBlankTier / addTier / deleteTier / patchTier exactly.
// ---------------------------------------------------------------------------

function makeBlankTier(): ActivationTier {
  return {
    label:            { en: '', fr: '' },
    targetPoolId:     '',
    cost:             1,
    grantedModifiers: [],
  };
}

function addTier(tiers: ActivationTier[]): ActivationTier[] {
  return [...tiers, makeBlankTier()];
}

function deleteTier(tiers: ActivationTier[], i: number): ActivationTier[] {
  return tiers.filter((_, k) => k !== i);
}

function patchTier(tiers: ActivationTier[], i: number, patch: Partial<ActivationTier>): ActivationTier[] {
  return tiers.map((t, k) => k === i ? { ...t, ...patch } : t);
}

describe('TieredCostsEditor — tier management logic', () => {
  // Test 14
  it('makeBlankTier returns object with all required ActivationTier fields', () => {
    const tier = makeBlankTier();
    expect(tier).toHaveProperty('label');
    expect(tier.label).toEqual({ en: '', fr: '' });
    expect(tier).toHaveProperty('targetPoolId', '');
    expect(tier).toHaveProperty('cost', 1);
    expect(tier).toHaveProperty('grantedModifiers');
    expect(Array.isArray(tier.grantedModifiers)).toBe(true);
    expect(tier.grantedModifiers).toHaveLength(0);
  });

  // Test 15
  it('addTier appends a blank tier to an existing list', () => {
    const existing: ActivationTier[] = [
      { label: { en: 'Push', fr: 'Pousser' }, targetPoolId: 'res_pp', cost: 1, grantedModifiers: [] },
    ];
    const result = addTier(existing);
    expect(result).toHaveLength(2);
    expect(result[0].label.en).toBe('Push');   // original unchanged
    expect(result[1].label.en).toBe('');       // new blank tier
  });

  // Test 16
  it('addTier on an empty list creates a single-element list', () => {
    const result = addTier([]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject(makeBlankTier());
  });

  // Test 17
  it('deleteTier removes the correct element by index', () => {
    const tiers: ActivationTier[] = [
      { label: { en: 'A', fr: 'A' }, targetPoolId: 'p1', cost: 1, grantedModifiers: [] },
      { label: { en: 'B', fr: 'B' }, targetPoolId: 'p2', cost: 2, grantedModifiers: [] },
      { label: { en: 'C', fr: 'C' }, targetPoolId: 'p3', cost: 3, grantedModifiers: [] },
    ];
    const result = deleteTier(tiers, 1);
    expect(result).toHaveLength(2);
    expect(result[0].label.en).toBe('A');
    expect(result[1].label.en).toBe('C');
  });

  // Test 18
  it('deleteTier on the last element produces an empty list', () => {
    const tiers: ActivationTier[] = [
      { label: { en: 'Only', fr: 'Seul' }, targetPoolId: 'p1', cost: 1, grantedModifiers: [] },
    ];
    const result = deleteTier(tiers, 0);
    expect(result).toHaveLength(0);
  });

  // Test 19
  it('patchTier updates only the label field', () => {
    const tiers: ActivationTier[] = [
      { label: { en: 'Old', fr: 'Ancien' }, targetPoolId: 'pool_a', cost: 2, grantedModifiers: [] },
    ];
    const updated = patchTier(tiers, 0, { label: { en: 'New', fr: 'Nouveau' } });
    expect(updated[0].label).toEqual({ en: 'New', fr: 'Nouveau' });
    expect(updated[0].targetPoolId).toBe('pool_a');  // unchanged
    expect(updated[0].cost).toBe(2);                 // unchanged
  });

  // Test 20
  it('patchTier updates targetPoolId', () => {
    const tiers: ActivationTier[] = [
      { label: { en: '', fr: '' }, targetPoolId: 'old_pool', cost: 1, grantedModifiers: [] },
    ];
    const updated = patchTier(tiers, 0, { targetPoolId: 'new_pool' });
    expect(updated[0].targetPoolId).toBe('new_pool');
  });

  // Test 21
  it('patchTier updates cost', () => {
    const tiers: ActivationTier[] = [
      { label: { en: '', fr: '' }, targetPoolId: 'p', cost: 1, grantedModifiers: [] },
    ];
    const updated = patchTier(tiers, 0, { cost: 5 });
    expect(updated[0].cost).toBe(5);
  });

  // Test 22
  it('patchTier does not mutate other tiers in the list', () => {
    const tiers: ActivationTier[] = [
      { label: { en: 'A', fr: 'A' }, targetPoolId: 'pa', cost: 1, grantedModifiers: [] },
      { label: { en: 'B', fr: 'B' }, targetPoolId: 'pb', cost: 2, grantedModifiers: [] },
    ];
    const updated = patchTier(tiers, 0, { cost: 99 });
    expect(updated[1].cost).toBe(2);  // tier 1 unchanged
    expect(updated[1].label.en).toBe('B');
  });
});

// ---------------------------------------------------------------------------
// §3  MagicItemsCastingSubpanel item filtering logic
//     Mirrors the $derived filter predicates in MagicItemsCastingSubpanel.svelte
// ---------------------------------------------------------------------------

/** Predicate mirrors: equippedMetamagicRods = equippedItems.filter(f => f.metamagicEffect) */
const isMetamagicRod = (f: Partial<ItemFeature>): boolean => !!f.metamagicEffect;

/** Predicate mirrors: equippedStaves = equippedItems.filter(f => f.staffSpells?.length) */
const isStaff = (f: Partial<ItemFeature>): boolean => !!(f.staffSpells?.length);

/** Predicate mirrors: equippedWands = equippedItems.filter(f => f.wandSpell) */
const isWand = (f: Partial<ItemFeature>): boolean => !!f.wandSpell;

/** Predicate mirrors: equippedScrolls = equippedItems.filter(f => f.scrollSpells?.length) */
const isScroll = (f: Partial<ItemFeature>): boolean => !!(f.scrollSpells?.length);

describe('MagicItemsCastingSubpanel — item filtering logic', () => {
  // Test 23
  it('isMetamagicRod — true for item with metamagicEffect', () => {
    const rod: Partial<ItemFeature> = {
      metamagicEffect: { feat: 'feat_empower_spell', maxSpellLevel: 3 },
    };
    expect(isMetamagicRod(rod)).toBe(true);
  });

  // Test 24
  it('isMetamagicRod — false for item without metamagicEffect', () => {
    expect(isMetamagicRod({ wandSpell: { spellId: 'spell_fireball', casterLevel: 5 } })).toBe(false);
  });

  // Test 25
  it('isStaff — true for item with non-empty staffSpells', () => {
    const staff: Partial<ItemFeature> = {
      staffSpells: [{ spellId: 'spell_fireball', chargeCost: 1 }],
    };
    expect(isStaff(staff)).toBe(true);
  });

  // Test 26
  it('isStaff — false for item with empty staffSpells array', () => {
    expect(isStaff({ staffSpells: [] })).toBe(false);
  });

  // Test 27
  it('isWand — true for item with wandSpell', () => {
    const wand: Partial<ItemFeature> = {
      wandSpell: { spellId: 'spell_magic_missile', casterLevel: 1 },
    };
    expect(isWand(wand)).toBe(true);
  });

  // Test 28
  it('isWand — false for item without wandSpell', () => {
    expect(isWand({ staffSpells: [] })).toBe(false);
  });

  // Test 29
  it('isScroll — true for item with non-empty scrollSpells', () => {
    const scroll: Partial<ItemFeature> = {
      scrollSpells: [{ spellId: 'spell_cure_light_wounds', casterLevel: 1, spellLevel: 1, spellType: 'divine' }],
    };
    expect(isScroll(scroll)).toBe(true);
  });

  // Test 30
  it('isScroll — false for item with empty scrollSpells', () => {
    expect(isScroll({ scrollSpells: [] })).toBe(false);
  });

  // Test 31
  it('a mixed equipped list partitions into correct sub-lists', () => {
    const items: Partial<ItemFeature>[] = [
      { metamagicEffect: { feat: 'feat_extend_spell', maxSpellLevel: 6 } },
      { staffSpells: [{ spellId: 'spell_fireball', chargeCost: 2 }] },
      { wandSpell: { spellId: 'spell_magic_missile', casterLevel: 3 } },
      { scrollSpells: [{ spellId: 'spell_cure_light_wounds', casterLevel: 1, spellLevel: 1, spellType: 'divine' }] },
    ];
    expect(items.filter(isMetamagicRod)).toHaveLength(1);
    expect(items.filter(isStaff)).toHaveLength(1);
    expect(items.filter(isWand)).toHaveLength(1);
    expect(items.filter(isScroll)).toHaveLength(1);
  });

  // Test 32
  it('empty equippedItems produces four empty sub-lists', () => {
    const items: Partial<ItemFeature>[] = [];
    expect(items.filter(isMetamagicRod)).toHaveLength(0);
    expect(items.filter(isStaff)).toHaveLength(0);
    expect(items.filter(isWand)).toHaveLength(0);
    expect(items.filter(isScroll)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// §4  ModifierRow source-field defaulting logic
//     Mirrors the #defaultSourceFields helper pattern in ModifierRow.svelte.
// ---------------------------------------------------------------------------

/**
 * Pure re-implementation of the source-field defaulting logic from
 * ModifierRow.svelte. When a modifier has no sourceId or sourceName, those
 * fields are populated from the parent entity's id and label.
 */
function applySourceDefaults(
  modifier: Partial<Modifier>,
  entityId: string,
  entityLabel: LocalizedString,
): Partial<Modifier> {
  return {
    ...modifier,
    sourceId:   modifier.sourceId && modifier.sourceId.trim()   ? modifier.sourceId   : entityId,
    sourceName: modifier.sourceName && (modifier.sourceName.en || modifier.sourceName.fr)
      ? modifier.sourceName
      : entityLabel,
  };
}

describe('ModifierRow — source field defaulting logic', () => {
  const entityId    = 'feat_power_attack';
  const entityLabel: LocalizedString = { en: 'Power Attack', fr: 'Attaque en puissance' };

  // Test 33
  it('no sourceId → uses entity id as default', () => {
    const mod = applySourceDefaults({ value: 5, type: 'untyped' }, entityId, entityLabel);
    expect(mod.sourceId).toBe('feat_power_attack');
  });

  // Test 34
  it('existing sourceId is preserved unchanged', () => {
    const mod = applySourceDefaults(
      { value: 5, type: 'untyped', sourceId: 'feat_custom' },
      entityId, entityLabel,
    );
    expect(mod.sourceId).toBe('feat_custom');
  });

  // Test 35
  it('empty string sourceId → uses entity id as default', () => {
    const mod = applySourceDefaults(
      { value: 5, type: 'untyped', sourceId: '' },
      entityId, entityLabel,
    );
    expect(mod.sourceId).toBe('feat_power_attack');
  });

  // Test 36
  it('no sourceName → uses entity label as default', () => {
    const mod = applySourceDefaults({ value: 5, type: 'untyped' }, entityId, entityLabel);
    expect(mod.sourceName).toEqual(entityLabel);
  });

  // Test 37
  it('existing sourceName is preserved unchanged', () => {
    const customName: LocalizedString = { en: 'Custom', fr: 'Personnalisé' };
    const mod = applySourceDefaults(
      { value: 5, type: 'untyped', sourceName: customName },
      entityId, entityLabel,
    );
    expect(mod.sourceName).toEqual(customName);
  });
});

// ---------------------------------------------------------------------------
// §5  Settings page structural contract
//     Line-count checks validate the split really happened (no code drift back).
// ---------------------------------------------------------------------------

const ROOT = resolve(__dirname, '../..');

function lineCount(relPath: string): number {
  const abs = resolve(ROOT, relPath);
  const content = readFileSync(abs, 'utf-8');
  return content.split('\n').length;
}

function fileExists(relPath: string): boolean {
  return existsSync(resolve(ROOT, relPath));
}

describe('Group F component split — structural contract', () => {
  // Test 38: Orchestrating parent pages are within spec
  it('settings/+page.svelte ≤ 350 lines (target ~300)', () => {
    expect(lineCount('src/routes/campaigns/[id]/settings/+page.svelte')).toBeLessThanOrEqual(350);
  });

  it('ItemDataEditor.svelte ≤ 350 lines (target ~300)', () => {
    expect(lineCount('src/lib/components/content-editor/ItemDataEditor.svelte')).toBeLessThanOrEqual(350);
  });

  it('CastingPanel.svelte ≤ 350 lines (was 655)', () => {
    expect(lineCount('src/lib/components/magic/CastingPanel.svelte')).toBeLessThanOrEqual(350);
  });

  it('ModifierListEditor.svelte ≤ 200 lines (was 619)', () => {
    expect(lineCount('src/lib/components/content-editor/ModifierListEditor.svelte')).toBeLessThanOrEqual(200);
  });

  it('MagicDataEditor.svelte ≤ 250 lines (was 560)', () => {
    expect(lineCount('src/lib/components/content-editor/MagicDataEditor.svelte')).toBeLessThanOrEqual(250);
  });

  it('ActivationEditor.svelte ≤ 400 lines (was 553)', () => {
    expect(lineCount('src/lib/components/content-editor/ActivationEditor.svelte')).toBeLessThanOrEqual(400);
  });

  // Test 39: All F1 settings panel sub-components exist
  it('F1a — RuleSourcesPanel.svelte exists', () => {
    expect(fileExists('src/lib/components/settings/RuleSourcesPanel.svelte')).toBe(true);
  });

  it('F1b — CharacterCreationPanel.svelte exists', () => {
    expect(fileExists('src/lib/components/settings/CharacterCreationPanel.svelte')).toBe(true);
  });

  it('F1c — VariantRulesPanel.svelte exists', () => {
    expect(fileExists('src/lib/components/settings/VariantRulesPanel.svelte')).toBe(true);
  });

  it('F1d — ChaptersPanel.svelte exists', () => {
    expect(fileExists('src/lib/components/settings/ChaptersPanel.svelte')).toBe(true);
  });

  it('F1e — GmOverridesPanel.svelte exists', () => {
    expect(fileExists('src/lib/components/settings/GmOverridesPanel.svelte')).toBe(true);
  });

  it('F1f — MembershipPanel.svelte exists', () => {
    expect(fileExists('src/lib/components/settings/MembershipPanel.svelte')).toBe(true);
  });

  // Test 40: All F2 content-editor sub-components exist
  it('F2a — WeaponFieldsEditor.svelte exists', () => {
    expect(fileExists('src/lib/components/content-editor/WeaponFieldsEditor.svelte')).toBe(true);
  });

  it('F2b — ArmorFieldsEditor.svelte exists', () => {
    expect(fileExists('src/lib/components/content-editor/ArmorFieldsEditor.svelte')).toBe(true);
  });

  it('F2c — ChargedItemsEditor.svelte exists', () => {
    expect(fileExists('src/lib/components/content-editor/ChargedItemsEditor.svelte')).toBe(true);
  });

  it('F2d — CursedItemEditor.svelte exists', () => {
    expect(fileExists('src/lib/components/content-editor/CursedItemEditor.svelte')).toBe(true);
  });

  it('F2e — IntelligentItemEditor.svelte exists', () => {
    expect(fileExists('src/lib/components/content-editor/IntelligentItemEditor.svelte')).toBe(true);
  });

  // Test 41: F3 magic sub-components exist
  it('F3a — MagicItemsCastingSubpanel.svelte exists', () => {
    expect(fileExists('src/lib/components/magic/MagicItemsCastingSubpanel.svelte')).toBe(true);
  });

  it('F3b — SpellRowItem.svelte exists', () => {
    expect(fileExists('src/lib/components/magic/SpellRowItem.svelte')).toBe(true);
  });

  // Test 42: F4 modifier row sub-component exists
  it('F4 — ModifierRow.svelte exists', () => {
    expect(fileExists('src/lib/components/content-editor/ModifierRow.svelte')).toBe(true);
  });

  // Test 43: F5 magic editor sub-sections exist
  it('F5a — SpellListsSection.svelte exists', () => {
    expect(fileExists('src/lib/components/content-editor/SpellListsSection.svelte')).toBe(true);
  });

  it('F5b — PsionicDataSection.svelte exists', () => {
    expect(fileExists('src/lib/components/content-editor/PsionicDataSection.svelte')).toBe(true);
  });

  // Test 44: F6 tiered costs editor exists
  it('F6 — TieredCostsEditor.svelte exists', () => {
    expect(fileExists('src/lib/components/content-editor/TieredCostsEditor.svelte')).toBe(true);
  });
});
