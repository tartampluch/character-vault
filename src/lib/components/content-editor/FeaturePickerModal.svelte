<!--
  @file src/lib/components/content-editor/FeaturePickerModal.svelte
  @description Modal for picking one or more Feature IDs from the full DataLoader catalog.

  PURPOSE:
    Used wherever an editor field needs the GM to choose Feature IDs — e.g.:
      • `grantedFeatures: ID[]`  (GrantedFeaturesEditor — 21.3.4)
      • `FeatureChoice.optionsQuery` result preview
      • `EntitySearchModal` "Clone this entity" predecessor

    Exposes the complete SRD + homebrew catalog (everything in the DataLoader cache)
    through a two-pane layout:
      LEFT / TOP:  filters (search + category checkboxes) + scrollable feature list
      RIGHT / BOTTOM: inline preview card for the currently highlighted feature

  LAYOUTS:
    ≥ md breakpoint (desktop):  side-by-side split — list on left, preview on right.
    < md breakpoint (mobile):   stacked — list fills screen, tapping a row shows
                                preview below (the preview slides in above the footer).

  SINGLE vs. MULTI-SELECT (via `multiple` prop):
    false (default):
      Clicking a row immediately calls `onFeaturePicked([id])` and the parent
      unmounts the modal.  No confirm button needed.

    true:
      Each row has a checkbox.  Clicking toggles selection.  A sticky footer
      shows "Confirm N selected" button that calls `onFeaturePicked(selectedIds)`.
      Clicking a row WITHOUT holding Shift does NOT immediately confirm — it just
      previews the feature and adds it to the selection.

  CALLBACK PROPS (Svelte 5 pattern):
    onFeaturePicked(ids: ID[]) — called with the chosen IDs (length ≥ 1).
    onclose()                  — called when the user dismisses without picking.

  CATEGORY FILTER:
    Multi-select checkboxes for all 11 FeatureCategory values.
    "All" shortcut toggles every category simultaneously.
    Default: all categories selected.

  PERFORMANCE:
    `getAllFeatures()` can return thousands of entities.  We use `$derived.by` with
    a single filtering pass so Svelte only re-runs it when the search query or
    selected categories change — not on every keystroke.

  @see src/lib/components/ui/FeatureModal.svelte  for the badge style reference.
  @see src/lib/engine/DataLoader.ts               for the feature cache API.
  @see ARCHITECTURE.md §21.4 for the picker modal design specification.
-->

<script lang="ts">
  import { untrack } from 'svelte';
  import Modal from '$lib/components/ui/Modal.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';
  import type { Feature, FeatureCategory } from '$lib/types/feature';
  import type { ID } from '$lib/types/primitives';

  // ===========================================================================
  // PROPS
  // ===========================================================================

  interface Props {
    /**
     * Called when the user confirms a selection.
     * Always an array — single-select still wraps in `[id]`.
     */
    onFeaturePicked: (ids: ID[]) => void;
    /** Called when the user dismisses without confirming. */
    onclose: () => void;
    /**
     * When `true`, rows have checkboxes and a "Confirm" footer button is shown.
     * When `false` (default), clicking a row immediately calls `onFeaturePicked`.
     */
    multiple?: boolean;
    /**
     * Optional category pre-filter.  When set, only features of that category are
     * shown and the category filter panel is hidden.  Useful when the editor field
     * logically only accepts one category (e.g., GrantedFeaturesEditor → any,
     * ClassSkillsEditor → 'skill' only).
     */
    filterCategory?: FeatureCategory | null;
  }

  let {
    onFeaturePicked,
    onclose,
    multiple = false,
    filterCategory = null,
  }: Props = $props();

  // ===========================================================================
  // CATEGORY METADATA
  // ===========================================================================

  /** All 11 FeatureCategory values; defines list render order. */
  const ALL_CATEGORIES: FeatureCategory[] = [
    'race', 'class', 'class_feature', 'feat', 'deity', 'domain',
    'magic', 'item', 'condition', 'monster_type', 'environment',
  ];

  /** Human-readable English labels for the category filter checkboxes. */
  const CATEGORY_LABELS: Record<FeatureCategory, string> = {
    race:          'Race',
    class:         'Class',
    class_feature: 'Class Feature',
    feat:          'Feat',
    deity:         'Deity',
    domain:        'Domain',
    magic:         'Spell / Power',
    item:          'Item',
    condition:     'Condition',
    monster_type:  'Monster Type',
    environment:   'Environment',
  };

  /**
   * Returns the Tailwind colour classes for a category badge.
   * All strings are complete static literals — safe for Tailwind's scanner.
   * Mirrors `categoryBadgeClass` in FeatureModal.svelte.
   */
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

  // ===========================================================================
  // SEARCH
  // ===========================================================================

  let searchQuery = $state('');
  const searchLower = $derived(searchQuery.toLowerCase().trim());

  // ===========================================================================
  // CATEGORY FILTER
  // ===========================================================================

  /**
   * Use `untrack` to read the initial value of `filterCategory` without
   * establishing a reactive dependency.  `filterCategory` is a setup parameter
   * passed once when the modal opens; we intentionally only want the initial
   * snapshot, not live reactive updates (the category filter is mutable by the GM
   * via `toggleCategory` once the modal is open).
   */
  let enabledCategories = $state<Set<FeatureCategory>>(
    untrack(() => new Set<FeatureCategory>(filterCategory ? [filterCategory] : ALL_CATEGORIES))
  );

  const allSelected = $derived(enabledCategories.size === ALL_CATEGORIES.length);

  function toggleCategory(cat: FeatureCategory): void {
    const next = new Set(enabledCategories);
    if (next.has(cat)) {
      // Don't allow deselecting the last category (would show nothing).
      if (next.size === 1) return;
      next.delete(cat);
    } else {
      next.add(cat);
    }
    enabledCategories = next;
  }

  function toggleAll(): void {
    enabledCategories = allSelected
      ? new Set([ALL_CATEGORIES[0]])   // keep at least one
      : new Set(ALL_CATEGORIES);
  }

  // ===========================================================================
  // FILTERED FEATURE LIST
  // ===========================================================================

  /**
   * Resolve the display label from a LocalizedString (Record<string,string>)
   * or plain string.  Falls back through "en" → first available key → raw id.
   */
  function featureLabel(feature: Feature): string {
    if (!feature.label) return feature.id;
    if (typeof feature.label === 'string') return feature.label;
    const loc = feature.label as Record<string, string>;
    return loc['en'] ?? Object.values(loc)[0] ?? feature.id;
  }

  /**
   * Resolve a one-line description excerpt for the preview pane.
   * Returns the raw "en" string (no formula interpolation needed for preview).
   */
  function featureExcerpt(feature: Feature): string {
    if (!feature.description) return '';
    if (typeof feature.description === 'string') return feature.description;
    const loc = feature.description as Record<string, string>;
    return loc['en'] ?? Object.values(loc)[0] ?? '';
  }

  /**
   * All features currently matching the search query and category filter,
   * sorted alphabetically by label for a stable, scannable list.
   * Re-evaluated only when `searchLower` or `enabledCategories` changes.
   */
  const filteredFeatures = $derived.by((): Feature[] => {
    const all = dataLoader.getAllFeatures();
    const filtered = all.filter(f => {
      // Category gate
      if (!enabledCategories.has(f.category as FeatureCategory)) return false;

      // Search gate (empty query = show all)
      if (!searchLower) return true;
      const label = featureLabel(f).toLowerCase();
      return f.id.toLowerCase().includes(searchLower) || label.includes(searchLower);
    });
    // Sort inside the derived to keep the expression valid as an initializer.
    return filtered.sort((a, b) => featureLabel(a).localeCompare(featureLabel(b)));
  });

  // ===========================================================================
  // SELECTION STATE
  // ===========================================================================

  /** IDs currently selected (multi-select mode only). */
  let selectedIds = $state<Set<ID>>(new Set());

  /** The feature whose preview is currently shown in the right pane. */
  let previewFeature = $state<Feature | null>(null);

  function toggleSelection(id: ID): void {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    selectedIds = next;
  }

  function handleRowClick(feature: Feature): void {
    // Always update the preview pane.
    previewFeature = feature;

    if (!multiple) {
      // Single-select: confirm immediately.
      onFeaturePicked([feature.id]);
    } else {
      // Multi-select: toggle the checkbox.
      toggleSelection(feature.id);
    }
  }

  function confirmSelection(): void {
    const ids = Array.from(selectedIds);
    if (ids.length > 0) {
      onFeaturePicked(ids);
    }
  }

  // ===========================================================================
  // KEYBOARD NAVIGATION
  // ===========================================================================

  /** Index of the keyboard-focused row within `filteredFeatures`. */
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

<!--
  SIZE: `2xl` on desktop gives a comfortable split-pane width.
  FULLSCREEN: on mobile the catalog needs the full screen.
-->
<Modal
  open={true}
  onClose={onclose}
  title={multiple ? 'Pick Features' : 'Pick a Feature'}
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
          <label for="feature-search" class="sr-only">Search features</label>
          <input
            id="feature-search"
            type="search"
            class="input w-full pl-9"
            placeholder="Search by ID or name…"
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
            <!-- "All" toggle -->
            <label class="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                class="accent-accent"
                checked={allSelected}
                onchange={toggleAll}
              />
              <span class="font-semibold text-text-primary">All</span>
            </label>

            {#each ALL_CATEGORIES as cat (cat)}
              <label class="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  class="accent-accent"
                  checked={enabledCategories.has(cat)}
                  onchange={() => toggleCategory(cat)}
                />
                <span class={categoryBadgeClass(cat)}>{CATEGORY_LABELS[cat]}</span>
              </label>
            {/each}
          </div>
        {/if}

        <!-- Result count -->
        <p class="text-xs text-text-muted" aria-live="polite">
          {#if filteredFeatures.length === 0}
            No features match.
          {:else}
            {filteredFeatures.length} feature{filteredFeatures.length === 1 ? '' : 's'}
            {searchLower ? 'match' : 'available'}
            {#if multiple && selectedIds.size > 0}
              — <span class="text-accent font-medium">{selectedIds.size} selected</span>
            {/if}
          {/if}
        </p>
      </div>

      <!-- ================================================================ -->
      <!-- SPLIT PANE: FEATURE LIST (left) + PREVIEW (right)                -->
      <!-- ================================================================ -->
      <!--
        Desktop (md+): two-column grid.  Feature list is scrollable within its
        column; preview is sticky adjacent.
        Mobile: single column — preview renders below the list row on selection.
      -->
      <div class="flex-1 flex flex-col md:flex-row gap-0 min-h-0 mt-3">

        <!-- ─── FEATURE LIST ────────────────────────────────────────────── -->
        <div
          class="flex-1 overflow-y-auto md:border-r md:border-border md:pr-3"
          role="listbox"
          aria-label="Feature list"
          aria-multiselectable={multiple}
          onkeydown={handleListKeydown}
          tabindex="0"
        >
          {#if filteredFeatures.length === 0}
            <p class="py-6 text-center text-sm text-text-muted italic">
              No features found.
              {#if searchLower}
                Try a different search term or expand the category filter.
              {:else}
                Enable a rule source in Campaign Settings to populate the catalog.
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
                <!-- Checkbox (multi-select only) -->
                {#if multiple}
                  <input
                    type="checkbox"
                    class="shrink-0 accent-accent pointer-events-none"
                    checked={isSelected}
                    aria-hidden="true"
                    tabindex="-1"
                  />
                {/if}

                <!-- Category badge -->
                <span class="{categoryBadgeClass(feature.category)} shrink-0">
                  {feature.category}
                </span>

                <!-- ID + label -->
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
        <!--
          Desktop: fixed-width right column.
          Mobile: shown below the list only when a feature is highlighted.
        -->
        <div class="md:w-72 md:pl-3 shrink-0 mt-3 md:mt-0">
          {#if previewFeature}
            <div class="rounded-lg border border-border bg-surface-alt p-4 flex flex-col gap-3">

              <!-- Badge + ID -->
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

              <!-- Rule source -->
              {#if previewFeature.ruleSource}
                <p class="text-[10px] text-text-muted">
                  Source: <span class="font-mono">{previewFeature.ruleSource}</span>
                </p>
              {/if}

              <!-- Description excerpt -->
              {#if featureExcerpt(previewFeature)}
                <p class="text-xs text-text-secondary leading-relaxed line-clamp-6">
                  {featureExcerpt(previewFeature)}
                </p>
              {:else}
                <p class="text-xs text-text-muted italic">No description available.</p>
              {/if}

              <!-- Tags (up to 5 shown) -->
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

              <!-- Quick-confirm button in single-select mode -->
              {#if !multiple}
                <button
                  type="button"
                  class="btn-primary w-full mt-1"
                  onclick={() => onFeaturePicked([previewFeature!.id])}
                >
                  Select "{featureLabel(previewFeature)}"
                </button>
              {/if}
            </div>
          {:else}
            <!-- Placeholder when no row is highlighted yet -->
            <div class="flex flex-col items-center justify-center h-32 rounded-lg border
                        border-dashed border-border text-center gap-2 px-4">
              <p class="text-xs text-text-muted italic">
                Click a feature to preview it here.
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
              ? 'No features selected'
              : `${selectedIds.size} feature${selectedIds.size === 1 ? '' : 's'} selected`}
          </p>
          <div class="flex gap-2">
            <button type="button" class="btn-ghost" onclick={onclose}>
              Cancel
            </button>
            <button
              type="button"
              class="btn-primary"
              disabled={selectedIds.size === 0}
              onclick={confirmSelection}
            >
              Confirm {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
            </button>
          </div>
        </div>
      {/if}

    </div>
  {/snippet}
</Modal>
