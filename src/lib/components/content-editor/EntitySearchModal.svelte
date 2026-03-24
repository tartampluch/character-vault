<!--
  @file src/lib/components/content-editor/EntitySearchModal.svelte
  @description Full-text entity search with clone-and-edit support.

  PURPOSE:
    GMs cloning an existing SRD or homebrew entity as the starting point for a new
    homebrew entity open this modal from NewEntityPage (Phase 21.5.2).  It lets them
    search across ALL loaded entities, preview any result in a side pane, and emit
    the full Feature object so the editor pre-populates the form.

  BEHAVIOUR:
    1. Text input (debounced 200 ms) searches feature IDs, labels, and descriptions.
    2. The result list shows ID, category badge, ruleSource, and a one-line description
       excerpt for each match, capped at 200 results to keep DOM size manageable.
    3. Clicking a result — or pressing ↑↓ to navigate and Enter to confirm — opens
       a detail preview card in the right pane.
    4. The preview card contains a "Clone this entity" button that calls
       `onEntityCloneSelected(feature)` and closes the modal.
    5. Keyboard navigation: ↑/↓ moves the highlighted row; Enter previews the
       focused row (same as clicking it); Enter on the "Clone" button confirms.

  CALLBACK PROPS (Svelte 5):
    onEntityCloneSelected(feature: Feature) — emitted when the GM confirms a clone.
    onclose()                               — emitted on dismiss.

  DEBOUNCE:
    Uses a Svelte 5 `$effect` with `setTimeout` / cleanup return to debounce the
    search query.  This avoids importing the StorageManager just for `debounce` and
    follows the idiomatic Svelte 5 pattern for reactive side-effects with cleanup.

  RESULT CAP:
    The first 200 matches are shown.  D&D 3.5 SRD + typical homebrew loads ~2 000
    entities; rendering all of them at once would stress the DOM.  The search
    filter narrows results quickly enough that the cap is rarely hit in practice.

  @see src/lib/components/content-editor/FeaturePickerModal.svelte  — similar pattern.
  @see src/lib/engine/DataLoader.ts                                  — feature pool source.
  @see ARCHITECTURE.md §21.4 for the picker modal design specification.
-->

<script lang="ts">
  import Modal from '$lib/components/ui/Modal.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';
  import type { Feature, FeatureCategory } from '$lib/types/feature';

  // ===========================================================================
  // PROPS
  // ===========================================================================

  interface Props {
    /**
     * Called when the GM clicks "Clone this entity" on a previewed result.
     * The caller should pre-populate the entity form with the cloned feature
     * (clearing the `id` so the GM sets a new unique ID, or keeping it for an
     * override-by-ID flow).
     */
    onEntityCloneSelected: (feature: Feature) => void;
    /** Called when the GM closes the modal without selecting anything. */
    onclose: () => void;
  }

  let { onEntityCloneSelected, onclose }: Props = $props();

  // ===========================================================================
  // CATEGORY BADGE HELPER
  // ===========================================================================

  /** Returns Tailwind colour classes for a category badge.
   *  All strings are complete, static literals — safe for Tailwind's scanner.
   *  Mirrors the same helper in FeatureModal.svelte and FeaturePickerModal.svelte.
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
  // LABEL / EXCERPT HELPERS
  // ===========================================================================

  /** Returns the English display label for a feature. */
  function featureLabel(f: Feature): string {
    if (!f.label) return f.id;
    if (typeof f.label === 'string') return f.label;
    const loc = f.label as Record<string, string>;
    return loc['en'] ?? Object.values(loc)[0] ?? f.id;
  }

  /** Returns a one-line description excerpt (English). */
  function featureExcerpt(f: Feature): string {
    if (!f.description) return '';
    if (typeof f.description === 'string') return f.description;
    const loc = f.description as Record<string, string>;
    return loc['en'] ?? Object.values(loc)[0] ?? '';
  }

  // ===========================================================================
  // DEBOUNCED SEARCH
  // ===========================================================================

  /**
   * MAX_RESULTS caps the DOM list at 200 rows.
   * The SRD alone has ~2 000 entities; rendering all at once is expensive.
   * Users typing into the search field narrow results well below this limit.
   */
  const MAX_RESULTS = 200;

  /** Raw value bound to the <input> — updated on every keystroke. */
  let searchInput = $state('');

  /**
   * Debounced copy of searchInput, updated 200 ms after the user stops typing.
   *
   * PATTERN:
   *   `$effect` runs whenever `searchInput` changes.  It schedules a 200 ms
   *   timeout to propagate the new value to `debouncedQuery`.  The cleanup
   *   function (the returned callback) cancels any pending timeout when the
   *   effect re-runs, implementing the trailing-edge debounce.
   */
  let debouncedQuery = $state('');

  $effect(() => {
    const current = searchInput;
    const timer = setTimeout(() => {
      debouncedQuery = current;
    }, 200);
    return () => clearTimeout(timer);
  });

  /** Lower-cased version of the debounced query for comparison. */
  const queryLower = $derived(debouncedQuery.toLowerCase().trim());

  // ===========================================================================
  // FILTERED RESULTS
  // ===========================================================================

  /**
   * Features matching the debounced query, capped at MAX_RESULTS.
   * Searches across: feature.id, English label, English description excerpt.
   * Shows ALL features (no category filter here — this is a broad search tool).
   * If the query is empty, shows nothing (wait for the user to type).
   */
  const results = $derived.by((): Feature[] => {
    if (!queryLower) return [];

    const all = dataLoader.getAllFeatures();
    const matched: Feature[] = [];

    for (const f of all) {
      if (matched.length >= MAX_RESULTS) break;

      const idMatch      = f.id.toLowerCase().includes(queryLower);
      const labelMatch   = featureLabel(f).toLowerCase().includes(queryLower);
      const excerptText  = featureExcerpt(f).toLowerCase();
      const excerptMatch = excerptText.includes(queryLower);

      if (idMatch || labelMatch || excerptMatch) {
        matched.push(f);
      }
    }

    // Rank: ID matches first, then label matches, then description-only matches.
    return matched.sort((a, b) => {
      const aId    = a.id.toLowerCase().includes(queryLower) ? 0 : 1;
      const bId    = b.id.toLowerCase().includes(queryLower) ? 0 : 1;
      const aLabel = featureLabel(a).toLowerCase().includes(queryLower) ? 0 : 1;
      const bLabel = featureLabel(b).toLowerCase().includes(queryLower) ? 0 : 1;
      // Primary sort: id match rank, then label match rank, then alphabetical by id.
      return (aId + aLabel) - (bId + bLabel) || a.id.localeCompare(b.id);
    });
  });

  // ===========================================================================
  // SELECTION / PREVIEW STATE
  // ===========================================================================

  /** Index of the keyboard-focused row; -1 = none. */
  let focusedIndex = $state(-1);

  /** Feature currently shown in the preview card. */
  let previewFeature = $state<Feature | null>(null);

  /** Reset focus and preview whenever the results list changes. */
  $effect(() => {
    const _r = results; // track
    focusedIndex   = -1;
    previewFeature = null;
  });

  function selectResult(f: Feature, idx: number): void {
    previewFeature = f;
    focusedIndex   = idx;
  }

  function confirmClone(): void {
    if (previewFeature) {
      onEntityCloneSelected(previewFeature);
    }
  }

  // ===========================================================================
  // KEYBOARD NAVIGATION
  // ===========================================================================

  function handleListKeydown(e: KeyboardEvent): void {
    if (results.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.min(focusedIndex + 1, results.length - 1);
      focusedIndex   = next;
      previewFeature = results[next] ?? null;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = Math.max(focusedIndex - 1, 0);
      focusedIndex   = prev;
      previewFeature = results[prev] ?? null;
    } else if (e.key === 'Enter' && focusedIndex >= 0) {
      e.preventDefault();
      const f = results[focusedIndex];
      if (f) selectResult(f, focusedIndex);
    }
  }
</script>

<Modal
  open={true}
  onClose={onclose}
  title="Search Entities"
  size="2xl"
  fullscreen={true}
>
  {#snippet children()}
    <div class="flex flex-col gap-4 h-full">

      <!-- ================================================================ -->
      <!-- SEARCH INPUT                                                       -->
      <!-- ================================================================ -->
      <div class="relative">
        <label for="entity-search" class="sr-only">Search entities</label>
        <input
          id="entity-search"
          type="search"
          class="input w-full pl-9"
          placeholder="Search by ID, name, or description…"
          bind:value={searchInput}
          autocomplete="off"
          spellcheck="false"
        />
        <!-- Search icon -->
        <svg
          class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted"
          xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <!-- Keyboard hint -->
        <span class="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-text-muted hidden md:block"
              aria-hidden="true">
          ↑↓ navigate · Enter preview · Esc close
        </span>
      </div>

      <!-- Result count hint -->
      <p class="text-xs text-text-muted -mt-2" aria-live="polite">
        {#if !queryLower}
          Start typing to search across all {dataLoader.getAllFeatures().length} loaded entities.
        {:else if results.length === 0}
          No entities match "<strong>{debouncedQuery}</strong>".
        {:else if results.length >= MAX_RESULTS}
          Showing first {MAX_RESULTS} of many results — refine your query to narrow down.
        {:else}
          {results.length} result{results.length === 1 ? '' : 's'} for "<strong>{debouncedQuery}</strong>"
        {/if}
      </p>

      <!-- ================================================================ -->
      <!-- SPLIT PANE: RESULTS LIST (left) + PREVIEW CARD (right)            -->
      <!-- ================================================================ -->
      <div class="flex-1 flex flex-col md:flex-row gap-4 min-h-0">

        <!-- ─── RESULTS LIST ─────────────────────────────────────────────── -->
        <div
          class="flex-1 overflow-y-auto rounded-lg border border-border"
          role="listbox"
          aria-label="Search results"
          aria-activedescendant={focusedIndex >= 0 ? `entity-result-${focusedIndex}` : undefined}
          onkeydown={handleListKeydown}
          tabindex={results.length > 0 ? 0 : -1}
        >
          {#if !queryLower}
            <!-- Empty state before typing -->
            <div class="flex flex-col items-center justify-center py-12 gap-2 text-center px-6">
              <svg class="h-8 w-8 text-text-muted" xmlns="http://www.w3.org/2000/svg"
                   viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
                   stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <p class="text-sm text-text-muted">
                Search for any race, class, feat, spell, item, condition…
              </p>
            </div>

          {:else if results.length === 0}
            <div class="flex flex-col items-center justify-center py-12 gap-2 text-center px-6">
              <p class="text-sm text-text-muted italic">
                No entities found for "{debouncedQuery}".
              </p>
              <p class="text-xs text-text-muted">
                Try fewer words, or search by ID (e.g. "race_elf", "feat_power").
              </p>
            </div>

          {:else}
            {#each results as feature, idx (feature.id)}
              {@const isFocused   = focusedIndex === idx}
              {@const isPreviewed = previewFeature?.id === feature.id}
              {@const excerpt     = featureExcerpt(feature)}

              <div
                id="entity-result-{idx}"
                class="flex items-start gap-3 px-4 py-3 border-b border-border last:border-b-0
                       cursor-pointer transition-colors
                       {isPreviewed
                         ? 'bg-accent/10 border-l-2 border-l-accent'
                         : 'hover:bg-surface-alt'}
                       {isFocused ? 'ring-inset ring-1 ring-accent/50' : ''}"
                role="option"
                aria-selected={isPreviewed}
                tabindex={isFocused ? 0 : -1}
                onclick={() => selectResult(feature, idx)}
                onkeydown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    selectResult(feature, idx);
                  }
                }}
                onmouseenter={() => focusedIndex = idx}
              >
                <!-- Category badge (shrinks to a fixed width column) -->
                <span class="{categoryBadgeClass(feature.category)} shrink-0 mt-0.5">
                  {feature.category}
                </span>

                <!-- Main content: label + id + ruleSource + excerpt -->
                <div class="flex flex-col gap-0.5 min-w-0 flex-1">
                  <div class="flex items-baseline gap-2 flex-wrap">
                    <span class="text-sm font-medium text-text-primary truncate">
                      {featureLabel(feature)}
                    </span>
                    <span class="font-mono text-[10px] text-text-muted truncate">
                      {feature.id}
                    </span>
                  </div>
                  {#if feature.ruleSource}
                    <span class="text-[10px] text-text-muted font-mono">
                      {feature.ruleSource}
                    </span>
                  {/if}
                  {#if excerpt}
                    <p class="text-xs text-text-secondary line-clamp-1 mt-0.5">
                      {excerpt}
                    </p>
                  {/if}
                </div>

                <!-- Preview chevron (visual affordance on desktop) -->
                <svg
                  class="h-4 w-4 text-text-muted shrink-0 mt-1 hidden md:block
                         {isPreviewed ? 'text-accent' : ''}"
                  xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
                >
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </div>
            {/each}
          {/if}
        </div>

        <!-- ─── PREVIEW CARD ─────────────────────────────────────────────── -->
        <div class="md:w-80 shrink-0">
          {#if previewFeature}
            {@const f       = previewFeature}
            {@const label   = featureLabel(f)}
            {@const excerpt = featureExcerpt(f)}

            <div class="rounded-lg border border-border bg-surface-alt p-4 flex flex-col gap-4 h-full">

              <!-- Header: badge + name + id -->
              <div class="flex flex-col gap-1.5">
                <span class={categoryBadgeClass(f.category)}>
                  {f.category}
                </span>
                <h3 class="text-base font-semibold text-text-primary leading-snug">
                  {label}
                </h3>
                <p class="font-mono text-[10px] text-text-muted break-all">
                  {f.id}
                </p>
                {#if f.ruleSource}
                  <p class="text-[10px] text-text-muted">
                    Source: <span class="font-mono">{f.ruleSource}</span>
                  </p>
                {/if}
              </div>

              <!-- Tags strip (up to 8) -->
              {#if f.tags?.length > 0}
                <div class="flex flex-wrap gap-1">
                  {#each f.tags.slice(0, 8) as tag (tag)}
                    <span class="badge font-mono text-[9px]">{tag}</span>
                  {/each}
                  {#if f.tags.length > 8}
                    <span class="text-[9px] text-text-muted">+{f.tags.length - 8} more</span>
                  {/if}
                </div>
              {/if}

              <!-- Description -->
              {#if excerpt}
                <p class="text-xs text-text-secondary leading-relaxed line-clamp-8 flex-1">
                  {excerpt}
                </p>
              {:else}
                <p class="text-xs text-text-muted italic flex-1">No description available.</p>
              {/if}

              <!-- Clone button — the primary action in this modal -->
              <div class="flex flex-col gap-2 pt-2 border-t border-border">
                <p class="text-[10px] text-text-muted leading-snug">
                  Cloning copies all fields into a new entity.
                  Set a new ID (or keep the same ID to override the original).
                </p>
                <button
                  type="button"
                  class="btn-primary w-full"
                  onclick={confirmClone}
                >
                  Clone "{label}"
                </button>
              </div>
            </div>

          {:else}
            <!-- Placeholder when nothing is highlighted yet -->
            <div class="flex flex-col items-center justify-center h-40 rounded-lg border
                        border-dashed border-border text-center gap-2 px-4">
              <p class="text-xs text-text-muted italic">
                Click a result to preview it here.
              </p>
            </div>
          {/if}
        </div>

      </div>
    </div>
  {/snippet}
</Modal>
