<!--
  @file src/lib/components/content-editor/FeaturePickerModal.svelte
  @description Modal for picking one or more Feature IDs from the full DataLoader catalog.
-->

<script lang="ts">
  import { untrack } from 'svelte';
  import Modal from '$lib/components/ui/Modal.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import type { Feature, FeatureCategory } from '$lib/types/feature';
  import type { ID } from '$lib/types/primitives';

  interface Props {
    onFeaturePicked: (ids: ID[]) => void;
    onclose: () => void;
    multiple?: boolean;
    filterCategory?: FeatureCategory | null;
  }

  let {
    onFeaturePicked,
    onclose,
    multiple = false,
    filterCategory = null,
  }: Props = $props();

  const lang = $derived(engine.settings.language);

  const ALL_CATEGORIES: FeatureCategory[] = [
    'race', 'class', 'class_feature', 'feat', 'deity', 'domain',
    'magic', 'item', 'condition', 'monster_type', 'environment',
  ];

  const CATEGORY_LABEL_KEYS: Record<FeatureCategory, string> = {
    race:          'editor.category.race',
    class:         'editor.category.class',
    class_feature: 'editor.category.class_feature',
    feat:          'editor.category.feat',
    deity:         'editor.category.deity',
    domain:        'editor.category.domain',
    magic:         'editor.category.magic',
    item:          'editor.category.item',
    condition:     'editor.category.condition',
    monster_type:  'editor.category.monster_type',
    environment:   'editor.category.environment',
  };

  function categoryBadgeClass(cat: string): string {
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
    return `${map[cat] ?? 'bg-surface-alt text-text-muted border-border'} border text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded`;
  }

  let searchQuery = $state('');
  const searchLower = $derived(searchQuery.toLowerCase().trim());

  let enabledCategories = $state<Set<FeatureCategory>>(
    untrack(() => new Set<FeatureCategory>(filterCategory ? [filterCategory] : ALL_CATEGORIES))
  );

  const allSelected = $derived(enabledCategories.size === ALL_CATEGORIES.length);

  function toggleCategory(cat: FeatureCategory): void {
    const next = new Set(enabledCategories);
    if (next.has(cat)) {
      if (next.size === 1) return;
      next.delete(cat);
    } else {
      next.add(cat);
    }
    enabledCategories = next;
  }

  function toggleAll(): void {
    enabledCategories = allSelected
      ? new Set([ALL_CATEGORIES[0]])
      : new Set(ALL_CATEGORIES);
  }

  function featureLabel(feature: Feature): string {
    if (!feature.label) return feature.id;
    if (typeof feature.label === 'string') return feature.label;
    const loc = feature.label as Record<string, string>;
    return loc['en'] ?? Object.values(loc)[0] ?? feature.id;
  }

  function featureExcerpt(feature: Feature): string {
    if (!feature.description) return '';
    if (typeof feature.description === 'string') return feature.description;
    const loc = feature.description as Record<string, string>;
    return loc['en'] ?? Object.values(loc)[0] ?? '';
  }

  const filteredFeatures = $derived.by((): Feature[] => {
    const all = dataLoader.getAllFeatures();
    const filtered = all.filter(f => {
      if (!enabledCategories.has(f.category as FeatureCategory)) return false;
      if (!searchLower) return true;
      const label = featureLabel(f).toLowerCase();
      return f.id.toLowerCase().includes(searchLower) || label.includes(searchLower);
    });
    return filtered.sort((a, b) => featureLabel(a).localeCompare(featureLabel(b)));
  });

  let selectedIds = $state<Set<ID>>(new Set());
  let previewFeature = $state<Feature | null>(null);

  function toggleSelection(id: ID): void {
    const next = new Set(selectedIds);
    if (next.has(id)) { next.delete(id); } else { next.add(id); }
    selectedIds = next;
  }

  function handleRowClick(feature: Feature): void {
    previewFeature = feature;
    if (!multiple) {
      onFeaturePicked([feature.id]);
    } else {
      toggleSelection(feature.id);
    }
  }

  function confirmSelection(): void {
    const ids = Array.from(selectedIds);
    if (ids.length > 0) { onFeaturePicked(ids); }
  }

  let focusedIndex = $state<number>(-1);

  function handleListKeydown(e: KeyboardEvent): void {
    if (filteredFeatures.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusedIndex = Math.min(focusedIndex + 1, filteredFeatures.length - 1);
      previewFeature = filteredFeatures[focusedIndex] ?? null;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusedIndex = Math.max(focusedIndex - 1, 0);
      previewFeature = filteredFeatures[focusedIndex] ?? null;
    } else if (e.key === 'Enter' && focusedIndex >= 0) {
      e.preventDefault();
      const f = filteredFeatures[focusedIndex];
      if (f) handleRowClick(f);
    }
  }
</script>

<Modal
  open={true}
  onClose={onclose}
  title={multiple ? ui('editor.feature_picker.title_multiple', lang) : ui('editor.feature_picker.title_single', lang)}
  size="2xl"
  fullscreen={true}
>
  {#snippet children()}
    <div class="flex flex-col gap-0 h-full">

      <!-- ================================================================ -->
      <!-- SEARCH + CATEGORY FILTER ROW                                      -->
      <!-- ================================================================ -->
      <div class="flex flex-col gap-3 pb-3 border-b border-border">

        <!-- Search input -->
        <div class="relative">
          <label for="feature-search" class="sr-only">{ui('editor.feature_picker.search_aria', lang)}</label>
          <input
            id="feature-search"
            type="search"
            class="input w-full pl-9"
            placeholder={ui('editor.feature_picker.search_placeholder', lang)}
            bind:value={searchQuery}
            autocomplete="off"
            spellcheck="false"
          />
          <svg
            class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted"
            xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </div>

        <!-- Category checkboxes (hidden when filterCategory is locked) -->
        {#if !filterCategory}
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
            <label class="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                class="accent-accent"
                checked={allSelected}
                onchange={toggleAll}
              />
              <span class="font-semibold text-text-primary">{ui('editor.feature_picker.all_label', lang)}</span>
            </label>

            {#each ALL_CATEGORIES as cat (cat)}
              <label class="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  class="accent-accent"
                  checked={enabledCategories.has(cat)}
                  onchange={() => toggleCategory(cat)}
                />
                <span class={categoryBadgeClass(cat)}>{ui(CATEGORY_LABEL_KEYS[cat], lang)}</span>
              </label>
            {/each}
          </div>
        {/if}

        <!-- Result count -->
        <p class="text-xs text-text-muted" aria-live="polite">
          {#if filteredFeatures.length === 0}
            {ui('editor.feature_picker.no_features_match', lang)}
          {:else}
            {searchLower
              ? ui('editor.feature_picker.feature_count_match', lang).replace('{n}', String(filteredFeatures.length)).replace('{s}', filteredFeatures.length === 1 ? '' : 's')
              : ui('editor.feature_picker.feature_count_available', lang).replace('{n}', String(filteredFeatures.length)).replace('{s}', filteredFeatures.length === 1 ? '' : 's')}
            {#if multiple && selectedIds.size > 0}
              — <span class="text-accent font-medium">{selectedIds.size} selected</span>
            {/if}
          {/if}
        </p>
      </div>

      <!-- ================================================================ -->
      <!-- SPLIT PANE: FEATURE LIST (left) + PREVIEW (right)                -->
      <!-- ================================================================ -->
      <div class="flex-1 flex flex-col md:flex-row gap-0 min-h-0 mt-3">

        <!-- ─── FEATURE LIST ────────────────────────────────────────────── -->
        <div
          class="flex-1 overflow-y-auto md:border-r md:border-border md:pr-3"
          role="listbox"
          aria-label={ui('editor.feature_picker.feature_list_aria', lang)}
          aria-multiselectable={multiple}
          onkeydown={handleListKeydown}
          tabindex="0"
        >
          {#if filteredFeatures.length === 0}
            <p class="py-6 text-center text-sm text-text-muted italic">
              {ui('editor.feature_picker.no_features_found', lang)}
              {#if searchLower}
                {ui('editor.feature_picker.no_features_search', lang)}
              {:else}
                {ui('editor.feature_picker.no_features_empty', lang)}
              {/if}
            </p>
          {:else}
            {#each filteredFeatures as feature, idx (feature.id)}
              {@const isSelected = selectedIds.has(feature.id)}
              {@const isFocused  = focusedIndex === idx}
              {@const isPreviewed = previewFeature?.id === feature.id}
              <div
                class="flex items-center gap-3 px-3 py-2 rounded cursor-pointer
                       transition-colors border border-transparent
                       {isPreviewed
                         ? 'bg-accent/15 border-accent/30'
                         : 'hover:bg-surface-alt'}
                       {isFocused ? 'ring-1 ring-accent' : ''}"
                role="option"
                aria-selected={multiple ? isSelected : isPreviewed}
                tabindex={isFocused ? 0 : -1}
                onclick={() => handleRowClick(feature)}
                onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleRowClick(feature); } }}
                onmouseenter={() => { previewFeature = feature; focusedIndex = idx; }}
              >
                {#if multiple}
                  <input
                    type="checkbox"
                    class="shrink-0 accent-accent pointer-events-none"
                    checked={isSelected}
                    aria-hidden="true"
                    tabindex="-1"
                  />
                {/if}

                <span class="{categoryBadgeClass(feature.category)} shrink-0">
                  {feature.category}
                </span>

                <div class="flex flex-col min-w-0 flex-1 gap-0.5">
                  <span class="text-sm font-medium text-text-primary truncate leading-snug">
                    {featureLabel(feature)}
                  </span>
                  <span class="font-mono text-[10px] text-text-muted truncate">
                    {feature.id}
                  </span>
                </div>
              </div>
            {/each}
          {/if}
        </div>

        <!-- ─── PREVIEW PANE ─────────────────────────────────────────────── -->
        <div class="md:w-72 md:pl-3 shrink-0 mt-3 md:mt-0">
          {#if previewFeature}
            <div class="rounded-lg border border-border bg-surface-alt p-4 flex flex-col gap-3">

              <div class="flex flex-col gap-1.5">
                <span class={categoryBadgeClass(previewFeature.category)}>
                  {previewFeature.category}
                </span>
                <h3 class="text-sm font-semibold text-text-primary leading-snug">
                  {featureLabel(previewFeature)}
                </h3>
                <p class="font-mono text-[10px] text-text-muted break-all">
                  {previewFeature.id}
                </p>
              </div>

              {#if previewFeature.ruleSource}
                <p class="text-[10px] text-text-muted">
                  {ui('editor.feature_picker.source_label', lang)}<span class="font-mono">{previewFeature.ruleSource}</span>
                </p>
              {/if}

              {#if featureExcerpt(previewFeature)}
                <p class="text-xs text-text-secondary leading-relaxed line-clamp-6">
                  {featureExcerpt(previewFeature)}
                </p>
              {:else}
                <p class="text-xs text-text-muted italic">{ui('editor.feature_picker.no_description', lang)}</p>
              {/if}

              {#if previewFeature.tags?.length > 0}
                <div class="flex flex-wrap gap-1">
                  {#each previewFeature.tags.slice(0, 5) as tag (tag)}
                    <span class="badge font-mono text-[9px]">{tag}</span>
                  {/each}
                  {#if previewFeature.tags.length > 5}
                    <span class="text-[9px] text-text-muted">+{previewFeature.tags.length - 5} more</span>
                  {/if}
                </div>
              {/if}

              {#if !multiple}
                <button
                  type="button"
                  class="btn-primary w-full mt-1"
                  onclick={() => onFeaturePicked([previewFeature!.id])}
                >
                  {ui('editor.feature_picker.select_btn', lang).replace('{label}', featureLabel(previewFeature))}
                </button>
              {/if}
            </div>
          {:else}
            <div class="flex flex-col items-center justify-center h-32 rounded-lg border
                        border-dashed border-border text-center gap-2 px-4">
              <p class="text-xs text-text-muted italic">
                {ui('editor.feature_picker.click_preview', lang)}
              </p>
            </div>
          {/if}
        </div>

      </div>

      <!-- ================================================================ -->
      <!-- MULTI-SELECT FOOTER                                               -->
      <!-- ================================================================ -->
      {#if multiple}
        <div class="mt-3 pt-3 border-t border-border flex items-center justify-between gap-3 shrink-0">
          <p class="text-sm text-text-muted">
            {selectedIds.size === 0
              ? ui('editor.feature_picker.no_selected_footer', lang)
              : ui('editor.feature_picker.selected_footer', lang).replace('{n}', String(selectedIds.size)).replace('{s}', selectedIds.size === 1 ? '' : 's')}
          </p>
          <div class="flex gap-2">
            <button type="button" class="btn-ghost" onclick={onclose}>
              {ui('common.cancel', lang)}
            </button>
            <button
              type="button"
              class="btn-primary"
              disabled={selectedIds.size === 0}
              onclick={confirmSelection}
            >
              {selectedIds.size > 0
                ? ui('editor.feature_picker.confirm_with_count', lang).replace('{n}', String(selectedIds.size))
                : ui('editor.feature_picker.confirm_btn', lang)}
            </button>
          </div>
        </div>
      {/if}

    </div>
  {/snippet}
</Modal>
