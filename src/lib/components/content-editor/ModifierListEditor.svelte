<!--
  @file src/lib/components/content-editor/ModifierListEditor.svelte
  @description CRUD editor for a Feature's grantedModifiers array.
  F4 refactoring: each modifier row is now a ModifierRow component.

  ────────────────────────────────────────────────────────────────────────────
  PURPOSE
  ────────────────────────────────────────────────────────────────────────────
  Used inside EntityForm to let GMs build and edit the `Modifier[]` array on a
  Feature.  Each row is rendered as <ModifierRow> which encapsulates all field
  editing, modal management, and per-row state.

  ────────────────────────────────────────────────────────────────────────────
  CONTEXT USAGE
  ────────────────────────────────────────────────────────────────────────────
  Reads ctx.feature.grantedModifiers and ctx.feature.id/label from EditorContext.
  Mutations replace the entire array (Svelte $state immutable update pattern).

  ────────────────────────────────────────────────────────────────────────────
  @see editorContext.ts       for EditorContext
  @see ModifierRow.svelte     for the per-row editing UI
  @see ARCHITECTURE.md §21.3.3 for full specification
-->

<script lang="ts">
  import { getContext } from 'svelte';
  import { EDITOR_CONTEXT_KEY, type EditorContext } from './editorContext';
  import type { Modifier } from '$lib/types/pipeline';
  import ModifierRow from './ModifierRow.svelte';

  // ===========================================================================
  // CONTEXT
  // ===========================================================================

  const ctx = getContext<EditorContext>(EDITOR_CONTEXT_KEY);

  // ===========================================================================
  // HELPERS — default source fields from parent feature
  // ===========================================================================

  function defaultSourceId(): string {
    return ctx.feature.id || 'feature_id';
  }

  function defaultSourceName(): string {
    const lbl = ctx.feature.label as Record<string, string>;
    return lbl?.['en'] || ctx.feature.id || 'Feature';
  }

  // ===========================================================================
  // MODIFIER FACTORY
  // ===========================================================================

  /**
   * Creates a fresh blank Modifier for "+ Add Modifier".
   * `id` is a random hex string — unique within this editing session.
   */
  function makeBlankModifier(): Modifier {
    return {
      id:         crypto.getRandomValues(new Uint8Array(4)).reduce((s, b) => s + b.toString(16).padStart(2, '0'), ''),
      sourceId:   defaultSourceId(),
      sourceName: { en: defaultSourceName() },
      targetId:   '',
      value:      0,
      type:       'untyped',
    };
  }

  // ===========================================================================
  // MODIFIER ARRAY MUTATIONS (immutable pattern)
  // ===========================================================================

  function addModifier(): void {
    ctx.feature.grantedModifiers = [...ctx.feature.grantedModifiers, makeBlankModifier()];
  }

  function duplicateModifier(index: number): void {
    const src = ctx.feature.grantedModifiers[index];
    const clone: Modifier = {
      ...structuredClone(src),
      id: crypto.getRandomValues(new Uint8Array(4)).reduce((s, b) => s + b.toString(16).padStart(2, '0'), ''),
    };
    const arr = [...ctx.feature.grantedModifiers];
    arr.splice(index + 1, 0, clone);
    ctx.feature.grantedModifiers = arr;
  }

  function deleteModifier(index: number): void {
    ctx.feature.grantedModifiers = ctx.feature.grantedModifiers.filter((_, i) => i !== index);
  }

  /**
   * Patches one or more fields on the modifier at `index`.
   * Creates a new array + new modifier object (Svelte $state immutable update).
   */
  function updateModifier(index: number, updated: Modifier): void {
    const arr = [...ctx.feature.grantedModifiers];
    arr[index] = updated;
    ctx.feature.grantedModifiers = arr;
  }
</script>

<!-- ============================================================ -->
<!-- MODIFIER LIST                                                 -->
<!-- ============================================================ -->
<div class="flex flex-col gap-3">

  <!-- Header row -->
  <div class="flex items-center justify-between">
    <span class="text-sm font-semibold text-text-primary">
      Modifiers
      {#if ctx.feature.grantedModifiers.length > 0}
        <span class="ml-1.5 text-xs font-normal text-text-muted badge">
          {ctx.feature.grantedModifiers.length}
        </span>
      {/if}
    </span>
    <button type="button" class="btn-primary text-xs py-1 px-3 h-auto" onclick={addModifier}>
      + Add Modifier
    </button>
  </div>

  <!-- Empty state -->
  {#if ctx.feature.grantedModifiers.length === 0}
    <div class="rounded-lg border border-dashed border-border px-4 py-6 text-center">
      <p class="text-sm text-text-muted italic">No modifiers yet.</p>
      <p class="text-xs text-text-muted mt-1">
        Click "+ Add Modifier" to add the first mechanical effect of this entity.
      </p>
    </div>

  {:else}
    <!-- Modifier rows -->
    {#each ctx.feature.grantedModifiers as mod, i (mod.id)}
      <ModifierRow
        modifier={mod}
        index={i}
        onchange={(updated) => updateModifier(i, updated)}
        ondelete={() => deleteModifier(i)}
        onduplicate={() => duplicateModifier(i)}
      />
    {/each}
  {/if}

  <!-- Bottom "+ Add Modifier" when list is non-empty (saves scrolling) -->
  {#if ctx.feature.grantedModifiers.length > 0}
    <button type="button" class="btn-ghost text-sm w-full py-2" onclick={addModifier}>
      + Add Modifier
    </button>
  {/if}

</div>
