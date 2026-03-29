/**
 * @file editorContext.ts
 * @description Svelte context contract shared by EntityForm and all its sub-form components.
 *
 * DESIGN RATIONALE (ARCHITECTURE.md §21.3):
 *   EntityForm creates the context once and passes it via `setContext`. Every
 *   sub-form component (CoreFieldsSection, ModifierListEditor, etc.) reads it
 *   via `getContext` — no prop-drilling through a 4-level deep tree.
 *
 *   The `feature` field is a `$state`-wrapped reactive object.  Sub-components
 *   mutate it directly (`ctx.feature.id = 'new_id'`) which propagates reactivity
 *   back up to EntityForm automatically via Svelte 5's reactive proxy.
 *
 * USAGE IN ENTITYFORM (sets context):
 * ```typescript
 * import { setContext } from 'svelte';
 * import { EDITOR_CONTEXT_KEY, type EditorContext } from './editorContext';
 * import { dataLoader } from '$lib/engine/DataLoader';
 *
 * const feature = $state(structuredClone(initialData ?? defaultFeature('feat')));
 * const ctx: EditorContext = {
 *   feature,
 *   mode,
 *   store,
 *   dataLoader,
 *   get hasOverrideWarning() {
 *     return dataLoader.getAllFeatures()
 *       .some(f => f.id === feature.id && f.ruleSource !== 'user_homebrew');
 *   },
 * };
 * setContext(EDITOR_CONTEXT_KEY, ctx);
 * ```
 *
 * USAGE IN SUB-COMPONENTS (reads context):
 * ```typescript
 * import { getContext } from 'svelte';
 * import { EDITOR_CONTEXT_KEY, type EditorContext } from './editorContext';
 *
 * const ctx = getContext<EditorContext>(EDITOR_CONTEXT_KEY);
 * // Read: ctx.feature.id, ctx.dataLoader.getFeature('race_elf')
 * // Mutate: ctx.feature.tags = [...ctx.feature.tags, 'new_tag'];
 * ```
 *
 * TESTABILITY:
 *   Because all DataLoader access goes through `ctx.dataLoader`, tests can
 *   supply a mock DataLoader instance when constructing a mock context:
 *
 * ```typescript
 * const mockLoader = new DataLoader();
 * mockLoader.cacheFeature(myFeature);
 * const mockCtx: EditorContext = {
 *   feature: defaultFeature('feat'),
 *   mode: 'create',
 *   store: new HomebrewStore(),
 *   dataLoader: mockLoader,
 *   get hasOverrideWarning() { return false; },
 * };
 * setContext(EDITOR_CONTEXT_KEY, mockCtx);
 * ```
 *
 * @see ARCHITECTURE.md §21.3 for the full EditorContext specification.
 */

import type { Feature, FeatureCategory, MergeStrategy } from '$lib/types/feature';
import type { HomebrewStore } from '$lib/engine/HomebrewStore.svelte';
import type { DataLoader } from '$lib/engine/DataLoader';

// =============================================================================
// CONTEXT KEY
// =============================================================================

/**
 * Symbol used as the Svelte context key.
 * Using a Symbol prevents accidental key collisions with other contexts on the page.
 */
export const EDITOR_CONTEXT_KEY = Symbol('editor-context');

// =============================================================================
// EDITOR CONTEXT TYPE
// =============================================================================

export interface EditorContext {
  /**
   * The reactive Feature draft being edited.
   * Sub-form components mutate fields directly; Svelte's `$state` proxy ensures
   * all reads anywhere in the component tree re-run when a field changes.
   *
   * NOTE: Because `feature` is a `$state` object created in EntityForm, it is
   * reactive throughout the component tree.  Sub-components do NOT need to
   * wrap their reads in `$derived` — reading `ctx.feature.id` inside the
   * template or a `$derived` automatically registers the dependency.
   */
  feature: Feature;

  /**
   * 'create' — the form is authoring a brand-new entity.
   *   Save calls `store.add(feature)`.
   * 'edit'   — the form is modifying an existing homebrew entity.
   *   Save calls `store.update(feature.id, feature)`.
   */
  mode: 'create' | 'edit';

  /**
   * The HomebrewStore that owns persistence for this form.  Sub-components do
   * not call `store` methods directly — that is EntityForm's responsibility.
   * Exposed here for advanced sub-components that may need isDirty / isSaving.
   */
  store: HomebrewStore;

  /**
   * The DataLoader instance used to look up existing features for validation,
   * label resolution, and autocomplete.
   *
   * WHY ON THE CONTEXT INSTEAD OF IMPORTED DIRECTLY?
   *   Placing `dataLoader` on the context enables full isolation in tests:
   *   a test can supply a pre-populated `new DataLoader()` instance without
   *   touching the application-level singleton.  Sub-forms that currently
   *   `import { dataLoader }` directly should migrate to `ctx.dataLoader`
   *   to benefit from this testability contract.
   *
   *   In production, EntityForm sets this to the application singleton:
   *   `import { dataLoader } from '$lib/engine/DataLoader'`.
   *
   * USAGE IN SUB-FORMS:
   *   const ctx = getContext<EditorContext>(EDITOR_CONTEXT_KEY);
   *   const feature = ctx.dataLoader.getFeature('race_elf');
   */
  dataLoader: DataLoader;

  /**
   * True when `feature.id` matches an existing SRD or rule-source entity ID
   * and `feature.ruleSource !== 'user_homebrew'`.
   *
   * WHY A GETTER?
   *   EntityForm defines this as a computed property (via `Object.defineProperty`
   *   or a plain getter) so that sub-components can read it reactively without
   *   needing to import DataLoader themselves.
   *
   *   CoreFieldsSection reads this to show the amber "⚠ Override Warning" banner.
   *   EntityForm shows a sticky top banner via `ctx.hasOverrideWarning`.
   *
   * NOTE: Must read `feature.id` internally so Svelte's dependency tracking
   * fires when the id changes.
   */
  readonly hasOverrideWarning: boolean;
}

// =============================================================================
// DEFAULT FEATURE FACTORY
// =============================================================================

/**
 * Returns a minimal valid Feature object for the given category.
 * Used by EntityForm when creating a new entity from scratch.
 *
 * WHY A FACTORY FUNCTION?
 *   `defaultFeature` must be called for each new entity — cloning a shared
 *   singleton would cause mutations to bleed across form instances.
 *
 * All required fields are given sensible defaults:
 *   - `id`:             empty string (GM must fill in)
 *   - `label`:          { en: '' }
 *   - `description`:    { en: '' }
 *   - `ruleSource`:     'user_homebrew'
 *   - `tags`:           []
 *   - `grantedModifiers`: []
 *   - `grantedFeatures`: []
 *   - `merge`:          'replace'
 *
 * @param category - The FeatureCategory for the new entity.
 */
export function defaultFeature(category: FeatureCategory): Feature {
  return {
    id:               '',
    category,
    label:            { en: '' },
    description:      { en: '' },
    ruleSource:       'user_homebrew',
    tags:             [],
    forbiddenTags:    [],
    grantedModifiers: [],
    grantedFeatures:  [],
    merge:            'replace' as MergeStrategy,
  };
}
