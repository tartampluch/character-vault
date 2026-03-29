<!--
  @file src/lib/components/content-editor/GrantedFeaturesEditor.svelte
  @description Editor for Feature.grantedFeatures.
-->

<script lang="ts">
  import { getContext } from 'svelte';
  import { EDITOR_CONTEXT_KEY, type EditorContext } from './editorContext';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import type { ID } from '$lib/types/primitives';
  import FeaturePickerModal from './FeaturePickerModal.svelte';
  import FeatureModal from '$lib/components/ui/FeatureModal.svelte';
  import { IconClose } from '$lib/components/ui/icons';

  const ctx = getContext<EditorContext>(EDITOR_CONTEXT_KEY);
  const lang = $derived(engine.settings.language);

  let showPicker = $state(false);
  let previewId  = $state<ID | null>(null);

  function labelFor(id: ID): string {
    const rawId   = id.startsWith('-') ? id.slice(1) : id;
    const feature = dataLoader.getFeature(rawId);
    if (!feature) return rawId;
    const lbl = feature.label as Record<string, string>;
    return lbl?.['en'] ?? rawId;
  }

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

  function addFeatures(ids: ID[]): void {
    const existing = new Set(ctx.feature.grantedFeatures);
    const toAdd = ids.filter(id => !existing.has(id) && !existing.has(`-${id}`));
    if (toAdd.length === 0) return;
    ctx.feature.grantedFeatures = [...ctx.feature.grantedFeatures, ...toAdd];
  }

  function removeFeature(id: ID): void {
    ctx.feature.grantedFeatures = ctx.feature.grantedFeatures.filter(f => f !== id);
  }

  function toggleRemoveOnMerge(id: ID): void {
    ctx.feature.grantedFeatures = ctx.feature.grantedFeatures.map(f => {
      if (f === id)     return `-${id}`;
      if (f === `-${id}`) return id;
      return f;
    });
  }

  function isRemoval(id: ID): boolean {
    return id.startsWith('-');
  }

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
        {ui('editor.granted_features.section_title', lang)}
        {#if ctx.feature.grantedFeatures.length > 0}
          <span class="ml-1.5 text-xs font-normal text-text-muted badge">
            {ctx.feature.grantedFeatures.length}
          </span>
        {/if}
      </span>
      <span class="text-[11px] text-text-muted">
        {ui('editor.granted_features.section_hint', lang)}
      </span>
    </div>
    <button
      type="button"
      class="btn-primary text-xs py-1 px-3 h-auto shrink-0"
      onclick={() => (showPicker = true)}
    >
      {ui('editor.granted_features.add_feature_btn', lang)}
    </button>
  </div>

  <!-- Partial-merge hint (shown only when merge === 'partial') -->
  {#if ctx.feature.merge === 'partial'}
    <p class="text-[11px] text-amber-400/80 bg-amber-900/10 border border-amber-700/30
              rounded px-3 py-1.5">
      {ui('editor.granted_features.partial_merge_hint', lang)}
    </p>
  {/if}

  <!-- Chip list -->
  {#if ctx.feature.grantedFeatures.length === 0}
    <div class="rounded border border-dashed border-border px-4 py-4 text-center">
      <p class="text-xs text-text-muted italic">
        {ui('editor.granted_features.no_features', lang)}
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
            title={ui('editor.granted_features.preview_title', lang).replace('{id}', rawId)}
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
                ? ui('editor.granted_features.cancel_removal', lang)
                : ui('editor.granted_features.mark_removal', lang)}
              aria-label={removal
                ? ui('editor.granted_features.cancel_removal_aria', lang)
                : ui('editor.granted_features.mark_removal_aria', lang)}
            >
              {removal ? '↩' : '−'}
            </button>
          {/if}

          <!-- Remove from list entirely -->
          <button
            type="button"
            class="text-text-muted hover:text-danger transition-colors leading-none text-sm"
            onclick={() => removeFeature(id)}
            aria-label={ui('editor.granted_features.remove_aria', lang).replace('{id}', rawId)}
          >
            <IconClose size={12} aria-hidden="true" />
          </button>
        </div>
      {/each}
    </div>
  {/if}

</div>
