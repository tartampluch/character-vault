<!--
  @file src/lib/components/content-editor/EntitySearchModal.svelte
  @description Full-text entity search with clone-and-edit support.
-->

<script lang="ts">
  import Modal from '$lib/components/ui/Modal.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import type { Feature } from '$lib/types/feature';

  interface Props {
    onEntityCloneSelected: (feature: Feature) => void;
    onclose: () => void;
  }

  let { onEntityCloneSelected, onclose }: Props = $props();
  const lang = $derived(engine.settings.language);

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

  function featureLabel(f: Feature): string {
    if (!f.label) return f.id;
    if (typeof f.label === 'string') return f.label;
    const loc = f.label as Record<string, string>;
    return loc['en'] ?? Object.values(loc)[0] ?? f.id;
  }

  function featureExcerpt(f: Feature): string {
    if (!f.description) return '';
    if (typeof f.description === 'string') return f.description;
    const loc = f.description as Record<string, string>;
    return loc['en'] ?? Object.values(loc)[0] ?? '';
  }

  const MAX_RESULTS = 200;

  let searchInput = $state('');
  let debouncedQuery = $state('');

  $effect(() => {
    const current = searchInput;
    const timer = setTimeout(() => { debouncedQuery = current; }, 200);
    return () => clearTimeout(timer);
  });

  const queryLower = $derived(debouncedQuery.toLowerCase().trim());

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

      if (idMatch || labelMatch || excerptMatch) { matched.push(f); }
    }

    return matched.sort((a, b) => {
      const aId    = a.id.toLowerCase().includes(queryLower) ? 0 : 1;
      const bId    = b.id.toLowerCase().includes(queryLower) ? 0 : 1;
      const aLabel = featureLabel(a).toLowerCase().includes(queryLower) ? 0 : 1;
      const bLabel = featureLabel(b).toLowerCase().includes(queryLower) ? 0 : 1;
      return (aId + aLabel) - (bId + bLabel) || a.id.localeCompare(b.id);
    });
  });

  let focusedIndex = $state(-1);
  let previewFeature = $state<Feature | null>(null);

  $effect(() => {
    const _r = results;
    focusedIndex   = -1;
    previewFeature = null;
  });

  function selectResult(f: Feature, idx: number): void {
    previewFeature = f;
    focusedIndex   = idx;
  }

  function confirmClone(): void {
    if (previewFeature) { onEntityCloneSelected(previewFeature); }
  }

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
  title={ui('editor.entity_search.title', lang)}
  size="2xl"
  fullscreen={true}
>
  {#snippet children()}
    <div class="flex flex-col gap-4 h-full">

      <!-- ================================================================ -->
      <!-- SEARCH INPUT                                                       -->
      <!-- ================================================================ -->
      <div class="relative">
        <label for="entity-search" class="sr-only">{ui('editor.entity_search.search_aria', lang)}</label>
        <input
          id="entity-search"
          type="search"
          class="input w-full pl-9"
          placeholder={ui('editor.entity_search.search_placeholder', lang)}
          bind:value={searchInput}
          autocomplete="off"
          spellcheck="false"
        />
        <svg
          class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted"
          xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <span class="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-text-muted hidden md:block"
              aria-hidden="true">
          {ui('editor.entity_search.keyboard_hint', lang)}
        </span>
      </div>

      <!-- Result count hint -->
      <p class="text-xs text-text-muted -mt-2" aria-live="polite">
        {#if !queryLower}
          {ui('editor.entity_search.start_typing', lang).replace('{n}', String(dataLoader.getAllFeatures().length))}
        {:else if results.length === 0}
          {ui('editor.entity_search.no_match', lang).replace('{query}', debouncedQuery)}
        {:else if results.length >= MAX_RESULTS}
          {ui('editor.entity_search.too_many', lang).replace('{max}', String(MAX_RESULTS))}
        {:else}
          {ui('editor.entity_search.result_count', lang).replace('{n}', String(results.length)).replace('{s}', results.length === 1 ? '' : 's').replace('{query}', debouncedQuery)}
        {/if}
      </p>

      <!-- ================================================================ -->
      <!-- SPLIT PANE                                                         -->
      <!-- ================================================================ -->
      <div class="flex-1 flex flex-col md:flex-row gap-4 min-h-0">

        <!-- ─── RESULTS LIST ─────────────────────────────────────────────── -->
        <div
          class="flex-1 overflow-y-auto rounded-lg border border-border"
          role="listbox"
          aria-label={ui('editor.entity_search.search_results_aria', lang)}
          aria-activedescendant={focusedIndex >= 0 ? `entity-result-${focusedIndex}` : undefined}
          onkeydown={handleListKeydown}
          tabindex={results.length > 0 ? 0 : -1}
        >
          {#if !queryLower}
            <div class="flex flex-col items-center justify-center py-12 gap-2 text-center px-6">
              <svg class="h-8 w-8 text-text-muted" xmlns="http://www.w3.org/2000/svg"
                   viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
                   stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <p class="text-sm text-text-muted">
                {ui('editor.entity_search.empty_prompt', lang)}
              </p>
            </div>

          {:else if results.length === 0}
            <div class="flex flex-col items-center justify-center py-12 gap-2 text-center px-6">
              <p class="text-sm text-text-muted italic">
                {ui('editor.entity_search.no_entities_found', lang).replace('{query}', debouncedQuery)}
              </p>
              <p class="text-xs text-text-muted">
                {ui('editor.entity_search.no_entities_hint', lang)}
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
                <span class="{categoryBadgeClass(feature.category)} shrink-0 mt-0.5">
                  {feature.category}
                </span>

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
                    {ui('editor.entity_search.no_description', lang).includes('Source') ? '' : ''}<span class="font-mono">{f.ruleSource}</span>
                  </p>
                {/if}
              </div>

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

              {#if excerpt}
                <p class="text-xs text-text-secondary leading-relaxed line-clamp-8 flex-1">
                  {excerpt}
                </p>
              {:else}
                <p class="text-xs text-text-muted italic flex-1">{ui('editor.entity_search.no_description', lang)}</p>
              {/if}

              <div class="flex flex-col gap-2 pt-2 border-t border-border">
                <p class="text-[10px] text-text-muted leading-snug">
                  {ui('editor.entity_search.clone_copying_hint', lang)}
                </p>
                <button
                  type="button"
                  class="btn-primary w-full"
                  onclick={confirmClone}
                >
                  {ui('editor.entity_search.clone_btn', lang).replace('{label}', label)}
                </button>
              </div>
            </div>

          {:else}
            <div class="flex flex-col items-center justify-center h-40 rounded-lg border
                        border-dashed border-border text-center gap-2 px-4">
              <p class="text-xs text-text-muted italic">
                {ui('editor.entity_search.click_to_preview', lang)}
              </p>
            </div>
          {/if}
        </div>

      </div>
    </div>
  {/snippet}
</Modal>
