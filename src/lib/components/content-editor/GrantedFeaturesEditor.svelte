<!--
  @file src/lib/components/content-editor/GrantedFeaturesEditor.svelte
  @description Editor for Feature.grantedFeatures — the list of child feature IDs
  that this entity automatically activates on every character that has it.

  ────────────────────────────────────────────────────────────────────────────
  PURPOSE
  ────────────────────────────────────────────────────────────────────────────
  Examples of grantedFeatures usage in D&D 3.5:
    • A class feature "Barbarian Rage" grants sub-features like the rage HP bonus
      and the morale bonus modifiers — those are separate grantedFeatures IDs.
    • A race "Half-Orc" grants "Darkvision 60 ft." as a standalone Feature.
    • A feat "Improved Initiative" grants no sub-features (empty array).
    • The Fighter class grants "Bonus Combat Feat" at levels 1, 2, 4, 6, 8 …
      via its levelProgression.grantedFeatures rather than here.

  This component renders the FLAT `grantedFeatures: ID[]` on the base Feature,
  NOT the per-level progression table (that is LevelProgressionEditor, 21.3.6).

  ────────────────────────────────────────────────────────────────────────────
  DISPLAY
  ────────────────────────────────────────────────────────────────────────────
  Each ID is shown as a pill-shaped chip containing:
    • The feature's English label (loaded from DataLoader — falls back to the
      raw ID if the feature is not loaded or has no label).
    • A category badge (same colour coding as FeatureModal and FeaturePickerModal).
    • A ✕ remove button.
    • Clicking the label text opens FeatureModal for a read-only preview.

  ────────────────────────────────────────────────────────────────────────────
  ADDING FEATURES
  ────────────────────────────────────────────────────────────────────────────
  "+ Add Feature" opens FeaturePickerModal in multi-select mode.
  Already-selected IDs are excluded from the picker results to avoid duplicates.
  (Deduplication note: grantedFeatures may contain the same ID more than once
  in some edge cases — the engine handles this gracefully — but the editor
  prevents adding a duplicate interactively.)

  ────────────────────────────────────────────────────────────────────────────
  MERGE NOTE
  ────────────────────────────────────────────────────────────────────────────
  When `feature.merge === 'partial'`, entries can be prefixed with "-" to
  REMOVE an ID from the base entity's grantedFeatures array.  The editor
  supports this via a "Remove on merge" toggle on each chip, which prepends
  the "-" character.

  ────────────────────────────────────────────────────────────────────────────
  @see editorContext.ts               for EditorContext
  @see FeaturePickerModal.svelte      for the multi-select add flow
  @see FeatureModal.svelte            for the read-only preview
  @see ARCHITECTURE.md §5.3           for grantedFeatures specification
-->

<script lang="ts">
  import { getContext } from 'svelte';
  import { EDITOR_CONTEXT_KEY, type EditorContext } from './editorContext';
  import { dataLoader } from '$lib/engine/DataLoader';
  import type { ID } from '$lib/types/primitives';
  import FeaturePickerModal from './FeaturePickerModal.svelte';
  import FeatureModal from '$lib/components/ui/FeatureModal.svelte';

  // ===========================================================================
  // CONTEXT
  // ===========================================================================

  const ctx = getContext<EditorContext>(EDITOR_CONTEXT_KEY);

  // ===========================================================================
  // MODAL STATE
  // ===========================================================================

  let showPicker   = $state(false);
  let previewId    = $state<ID | null>(null);

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  /**
   * Returns the English display label for a feature ID, falling back to the ID.
   * Handles merge-deletion entries (IDs prefixed with "-").
   */
  function labelFor(id: ID): string {
    const rawId   = id.startsWith('-') ? id.slice(1) : id;
    const feature = dataLoader.getFeature(rawId);
    if (!feature) return rawId;
    const lbl = feature.label as Record<string, string>;
    return lbl?.['en'] ?? rawId;
  }

  /**
   * Returns the category badge Tailwind colour classes for a feature ID.
   * Falls back to neutral when the feature is not loaded.
   */
  function badgeClass(id: ID): string {
    const rawId   = id.startsWith('-') ? id.slice(1) : id;
    const feature = dataLoader.getFeature(rawId);
    if (!feature) return 'bg-surface-alt text-text-muted border-border';

    const map: Record<string, string> = {
      race:          'bg-green-900/40 text-green-400 border-green-700/50',
      class:         'bg-blue-900/40 text-blue-300 border-blue-700/50',
      feat:          'bg-yellow-900/40 text-yellow-300 border-yellow-700/50',
      item:          'bg-cyan-900/30 text-cyan-300 border-cyan-700/30',
      condition:     'bg-red-900/30 text-red-400 border-red-700/30',
      magic:         'bg-purple-900/30 text-purple-300 border-purple-700/30',
      domain:        'bg-teal-900/30 text-teal-300 border-teal-700/30',
      class_feature: 'bg-blue-900/30 text-blue-200 border-blue-700/30',
      environment:   'bg-amber-900/30 text-amber-300 border-amber-700/30',
      monster_type:  'bg-red-900/20 text-red-300 border-red-700/20',
      deity:         'bg-amber-900/20 text-amber-200 border-amber-700/20',
    };
    return map[feature.category] ?? 'bg-surface-alt text-text-muted border-border';
  }

  // ===========================================================================
  // MUTATIONS
  // ===========================================================================

  function addFeatures(ids: ID[]): void {
    const existing = new Set(ctx.feature.grantedFeatures);
    const toAdd = ids.filter(id => !existing.has(id) && !existing.has(`-${id}`));
    if (toAdd.length === 0) return;
    ctx.feature.grantedFeatures = [...ctx.feature.grantedFeatures, ...toAdd];
  }

  function removeFeature(id: ID): void {
    ctx.feature.grantedFeatures = ctx.feature.grantedFeatures.filter(f => f !== id);
  }

  /**
   * Toggles the "-" removal prefix on an entry (for partial-merge use).
   * A removal entry is displayed with a strikethrough style.
   */
  function toggleRemoveOnMerge(id: ID): void {
    ctx.feature.grantedFeatures = ctx.feature.grantedFeatures.map(f => {
      if (f === id)     return `-${id}`;   // add "-" prefix
      if (f === `-${id}`) return id;       // remove "-" prefix
      return f;
    });
  }

  /** Whether an entry is a merge-deletion (starts with "-"). */
  function isRemoval(id: ID): boolean {
    return id.startsWith('-');
  }

  /**
   * IDs already in the list (without "-" prefix) — passed to FeaturePickerModal
   * so it can visually mark already-added features (though multi-select still
   * allows them to be un-selected; deduplication is enforced in addFeatures).
   */
  const existingIds = $derived(
    new Set(ctx.feature.grantedFeatures.map(id => id.startsWith('-') ? id.slice(1) : id))
  );
</script>

<!-- Feature preview modal (read-only) -->
{#if previewId !== null}
  <FeatureModal featureId={previewId} onclose={() => (previewId = null)} />
{/if}

<!-- Feature picker (multi-select) -->
{#if showPicker}
  <FeaturePickerModal
    multiple={true}
    onFeaturePicked={(ids) => { addFeatures(ids); showPicker = false; }}
    onclose={() => (showPicker = false)}
  />
{/if}

<!-- ======================================================================= -->
<!-- MAIN RENDER                                                               -->
<!-- ======================================================================= -->
<div class="flex flex-col gap-2">

  <!-- Header -->
  <div class="flex items-center justify-between">
    <div class="flex flex-col gap-0.5">
      <span class="text-sm font-semibold text-text-primary">
        Granted Features
        {#if ctx.feature.grantedFeatures.length > 0}
          <span class="ml-1.5 text-xs font-normal text-text-muted badge">
            {ctx.feature.grantedFeatures.length}
          </span>
        {/if}
      </span>
      <span class="text-[11px] text-text-muted">
        Sub-features automatically activated for every character that has this entity.
      </span>
    </div>
    <button
      type="button"
      class="btn-primary text-xs py-1 px-3 h-auto shrink-0"
      onclick={() => (showPicker = true)}
    >
      + Add Feature
    </button>
  </div>

  <!-- Partial-merge hint (shown only when merge === 'partial') -->
  {#if ctx.feature.merge === 'partial'}
    <p class="text-[11px] text-amber-400/80 bg-amber-900/10 border border-amber-700/30
              rounded px-3 py-1.5">
      <strong>Partial merge mode:</strong> Use the "Remove on merge" toggle (−) on any chip
      to instruct the Merge Engine to remove that feature from the base entity's
      <code class="font-mono">grantedFeatures</code> list.
    </p>
  {/if}

  <!-- Chip list -->
  {#if ctx.feature.grantedFeatures.length === 0}
    <div class="rounded border border-dashed border-border px-4 py-4 text-center">
      <p class="text-xs text-text-muted italic">
        No granted features. Click "+ Add Feature" to select sub-features.
      </p>
    </div>
  {:else}
    <div class="flex flex-wrap gap-2">
      {#each ctx.feature.grantedFeatures as id (id)}
        {@const removal = isRemoval(id)}
        {@const rawId   = removal ? id.slice(1) : id}

        <div
          class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1
                 transition-colors
                 {removal
                   ? 'bg-red-900/15 border-red-700/40 opacity-60'
                   : 'bg-surface border-border'}"
        >
          <!-- Category badge -->
          <span class="border text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5
                       rounded shrink-0 {badgeClass(id)}">
            {dataLoader.getFeature(rawId)?.category ?? '?'}
          </span>

          <!-- Label (clickable → FeatureModal preview) -->
          <button
            type="button"
            class="text-xs text-text-primary hover:text-accent hover:underline
                   transition-colors {removal ? 'line-through opacity-70' : ''}"
            onclick={() => (previewId = rawId)}
            title="Preview {rawId}"
          >
            {labelFor(id)}
          </button>

          <!-- "Remove on merge" toggle — only when merge === 'partial' -->
          {#if ctx.feature.merge === 'partial'}
            <button
              type="button"
              class="text-[10px] font-bold leading-none px-1 rounded transition-colors
                     {removal
                       ? 'text-red-400 hover:text-text-primary'
                       : 'text-text-muted hover:text-amber-400'}"
              onclick={() => toggleRemoveOnMerge(removal ? rawId : id)}
              title={removal
                ? 'Click to keep this feature (remove the deletion marker)'
                : 'Mark for removal on merge (prepends "-" prefix)'}
              aria-label={removal ? 'Cancel removal' : 'Mark for removal on merge'}
            >
              {removal ? '↩' : '−'}
            </button>
          {/if}

          <!-- Remove from list entirely -->
          <button
            type="button"
            class="text-text-muted hover:text-danger transition-colors leading-none text-sm"
            onclick={() => removeFeature(id)}
            aria-label="Remove {rawId} from granted features"
          >
            ×
          </button>
        </div>
      {/each}
    </div>
  {/if}

</div>
