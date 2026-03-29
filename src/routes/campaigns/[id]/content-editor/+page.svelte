<!--
  @file src/routes/campaigns/[id]/content-editor/+page.svelte
  @description Content Library Page — GM-only homebrew entity manager.

  ────────────────────────────────────────────────────────────────────────────
  NAVIGATION GUARD
  ────────────────────────────────────────────────────────────────────────────
  If the current user is not a GM, this page redirects to the campaign root
  immediately. The check runs in a $effect so it re-evaluates reactively if
  the session changes mid-visit.

  ────────────────────────────────────────────────────────────────────────────
  LAYOUT
  ────────────────────────────────────────────────────────────────────────────
  Header — HomebrewScopePanel:
    • Scope toggle: Campaign / Global
    • filename input (visible when scope === 'global')
      with load-order tooltip
    • isDirty / isSaving indicator

  Toolbar — New Entity | Import JSON | Export All

  Table — sortable, filterable entity table:
    • Columns: ID (monospace), Category badge, Label, Source, Actions
    • Filter: debounced search (id + label)
    • Sort: click column header toggles asc/desc
    • Actions per row: Edit → /content-editor/[id]
                       Clone → opens NewEntityPage pre-populated
                       Delete → confirmation and HomebrewStore.remove()

  ────────────────────────────────────────────────────────────────────────────
  IMPORT JSON
  ────────────────────────────────────────────────────────────────────────────
  Opens a modal with a textarea where the GM can paste a full JSON array of
  Feature objects. On confirm, calls HomebrewStore.importJSON(text).
  Shows a parse error banner for invalid JSON.

  ────────────────────────────────────────────────────────────────────────────
  EXPORT ALL
  ────────────────────────────────────────────────────────────────────────────
  Downloads the current entity array as a .json file named after the scope/filename.

  ────────────────────────────────────────────────────────────────────────────
  @see src/lib/engine/HomebrewStore.svelte.ts  for reactive state
  @see ARCHITECTURE.md §21.5.1                 for full specification
-->

<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { sessionContext } from '$lib/engine/SessionContext.svelte';
  import { homebrewStore } from '$lib/engine/HomebrewStore.svelte';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import type { Feature, FeatureCategory } from '$lib/types/feature';
  import Modal from '$lib/components/ui/Modal.svelte';

  // ===========================================================================
  // ROUTE PARAMS + AUTH GUARD
  // ===========================================================================

  const campaignId = $derived($page.params.id ?? '');
  const lang       = $derived(engine.settings.language);

  /** Non-GM users are redirected to the campaign root. */
  $effect(() => {
    if (!sessionContext.isGameMaster) {
      goto(`/campaigns/${campaignId}`);
    }
  });

  /** Set the campaign in homebrewStore when this page mounts. */
  $effect(() => {
    if (campaignId) {
      sessionContext.setActiveCampaign(campaignId);
    }
  });

  // ===========================================================================
  // SCOPE PANEL
  // ===========================================================================

  const LOAD_ORDER_TOOLTIP =
    'Files are loaded alphabetically — prefix with a number like `50_` to control priority. ' +
    'Example: "50_my_setting.json" loads after all SRD files (00_*) but before any 90_* overrides.';

  // ===========================================================================
  // CATEGORY BADGE HELPER
  // ===========================================================================

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

  // ===========================================================================
  // FILTER + SORT
  // ===========================================================================

  let searchInput = $state('');
  let debouncedSearch = $state('');

  $effect(() => {
    const q = searchInput;
    const t = setTimeout(() => { debouncedSearch = q; }, 200);
    return () => clearTimeout(t);
  });

  type SortKey = 'id' | 'category' | 'label' | 'ruleSource';
  type SortDir = 'asc' | 'desc';

  let sortKey = $state<SortKey>('label');
  let sortDir = $state<SortDir>('asc');

  function toggleSort(key: SortKey): void {
    if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    else { sortKey = key; sortDir = 'asc'; }
  }

  const filteredEntities = $derived.by((): Feature[] => {
    const q = debouncedSearch.toLowerCase().trim();
    const all = homebrewStore.entities;
    const filtered = q
      ? all.filter(f =>
          f.id.toLowerCase().includes(q) ||
          featureLabel(f).toLowerCase().includes(q)
        )
      : all;

    return [...filtered].sort((a, b) => {
      let va: string;
      let vb: string;
      if (sortKey === 'label') { va = featureLabel(a); vb = featureLabel(b); }
      else if (sortKey === 'category') { va = a.category; vb = b.category; }
      else if (sortKey === 'ruleSource') { va = a.ruleSource; vb = b.ruleSource; }
      else { va = a.id; vb = b.id; }
      return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    });
  });

  function sortIndicator(key: SortKey): string {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  }

  // ===========================================================================
  // DELETE
  // ===========================================================================

  let deleteConfirmId = $state<string | null>(null);

  function confirmDelete(): void {
    if (!deleteConfirmId) return;
    homebrewStore.remove(deleteConfirmId);
    deleteConfirmId = null;
  }

  // ===========================================================================
  // CLONE — navigate to new page with cloneFrom param
  // ===========================================================================

  function cloneEntity(entityId: string): void {
    goto(`/campaigns/${campaignId}/content-editor/new?cloneFrom=${encodeURIComponent(entityId)}`);
  }

  // ===========================================================================
  // IMPORT JSON MODAL
  // ===========================================================================

  let showImportModal = $state(false);
  let importText      = $state('');
  let importError     = $state('');

  function handleImport(): void {
    importError = '';
    try {
      homebrewStore.importJSON(importText);
      showImportModal = false;
      importText = '';
    } catch (err) {
      importError = err instanceof Error ? err.message : 'Invalid JSON';
    }
  }

  // ===========================================================================
  // EXPORT ALL
  // ===========================================================================

  function exportAll(): void {
    const filename = homebrewStore.scope === 'global'
      ? homebrewStore.filename
      : `homebrew_${campaignId}.json`;
    const blob = new Blob([homebrewStore.toJSON()], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<!-- ── DELETE CONFIRM MODAL ────────────────────────────────────────────────── -->
{#if deleteConfirmId !== null}
  <Modal open={true} onClose={() => (deleteConfirmId = null)} title={ui('content_editor.lib.delete_entity_title', lang)} size="sm">
    {#snippet children()}
      <div class="flex flex-col gap-4">
        <p class="text-sm text-text-primary">
          {ui('content_editor.lib.delete_prompt', lang).replace('{id}', deleteConfirmId ?? '')}
        </p>
        <div class="flex justify-end gap-2">
          <button type="button" class="btn-ghost" onclick={() => (deleteConfirmId = null)}>
            {ui('common.cancel', lang)}
          </button>
          <button type="button" class="btn-danger" onclick={confirmDelete}>
            {ui('common.delete', lang)}
          </button>
        </div>
      </div>
    {/snippet}
  </Modal>
{/if}

<!-- ── IMPORT JSON MODAL ────────────────────────────────────────────────────── -->
{#if showImportModal}
  <Modal open={true} onClose={() => (showImportModal = false)} title={ui('content_editor.lib.import_modal_title', lang)} size="lg">
    {#snippet children()}
      <div class="flex flex-col gap-4">
        <p class="text-xs text-text-muted">
          {ui('content_editor.lib.import_desc', lang)}
        </p>

        {#if importError}
          <div class="rounded border border-red-700/50 bg-red-900/20 px-3 py-2 text-xs text-red-400"
               role="alert">
            {importError}
          </div>
        {/if}

        <textarea
          class="input font-mono text-xs min-h-[16rem] resize-y"
          bind:value={importText}
          placeholder={ui('content_editor.lib.import_placeholder', lang)}
          spellcheck="false"
          autocomplete="off"
        ></textarea>

        <div class="flex justify-end gap-2">
          <button type="button" class="btn-ghost" onclick={() => (showImportModal = false)}>
            {ui('common.cancel', lang)}
          </button>
          <button
            type="button"
            class="btn-primary"
            disabled={!importText.trim()}
            onclick={handleImport}
          >
            {ui('content_editor.lib.import_submit', lang)}
          </button>
        </div>
      </div>
    {/snippet}
  </Modal>
{/if}

<!-- ======================================================================== -->
<!-- PAGE                                                                      -->
<!-- ======================================================================== -->
<div class="flex flex-col gap-6 p-4 md:p-6 max-w-6xl mx-auto">

  <!-- PAGE TITLE -->
  <div class="flex items-center gap-3">
    <a href="/campaigns/{campaignId}" class="text-text-muted hover:text-text-primary transition-colors"
       aria-label="Back to campaign">
      <svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
           fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
    </a>
    <h1 class="text-xl font-bold text-text-primary">{ui('nav.content_editor', engine.settings.language)}</h1>
  </div>

  <!-- ──────────────────────────────────────────────────────────────────────── -->
  <!-- HOMEBREW SCOPE PANEL                                                     -->
  <!-- ──────────────────────────────────────────────────────────────────────── -->
  <div class="rounded-lg border border-border bg-surface-alt p-4 flex flex-col gap-4">
    <p class="text-xs font-semibold text-text-muted uppercase tracking-wider">{ui('content_editor.lib.scope_title', lang)}</p>

    <!-- Scope toggle -->
    <div class="flex gap-2">
      {#each ([
        ['campaign', ui('content_editor.lib.scope_campaign', lang), ui('content_editor.lib.scope_campaign_hint', lang)],
        ['global',   ui('content_editor.lib.scope_global',   lang), ui('content_editor.lib.scope_global_hint',   lang)],
      ] as const) as [s, lbl, hint] (s)}
        <button
          type="button"
          class="flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors text-left
                 {homebrewStore.scope === s
                   ? 'border-accent bg-accent/10 text-text-primary'
                   : 'border-border text-text-muted hover:border-border/80'}"
          onclick={() => { homebrewStore.scope = s; }}
          title={hint}
        >
          <div class="font-semibold">{lbl}</div>
          <div class="text-[10px] font-normal text-text-muted mt-0.5">{hint}</div>
        </button>
      {/each}
    </div>

    <!-- Filename input (global only) -->
    {#if homebrewStore.scope === 'global'}
      <div class="flex flex-col gap-1">
        <label for="filename" class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          {ui('content_editor.lib.filename_label', lang)}
        </label>
        <input
          id="filename"
          type="text"
          class="input font-mono text-sm"
          bind:value={homebrewStore.filename}
          placeholder="50_homebrew.json"
          autocomplete="off"
          spellcheck="false"
        />
        <p class="text-[10px] text-text-muted" title={LOAD_ORDER_TOOLTIP}>
          {LOAD_ORDER_TOOLTIP}
        </p>
      </div>
    {/if}

    <!-- Save state indicator -->
    <div class="flex items-center gap-2 text-xs">
      {#if homebrewStore.isSaving}
        <span class="inline-block h-3 w-3 rounded-full border-2 border-accent border-t-transparent
                     animate-spin shrink-0" aria-label={ui('content_editor.lib.saving', lang)}></span>
        <span class="text-text-muted">{ui('content_editor.lib.saving', lang)}</span>
      {:else if homebrewStore.isDirty}
        <span class="inline-block h-2 w-2 rounded-full bg-amber-400 shrink-0"
              aria-label={ui('content_editor.lib.unsaved', lang)}></span>
        <span class="text-amber-400">{ui('content_editor.lib.unsaved', lang)}</span>
      {:else if homebrewStore.entities.length > 0}
        <span class="inline-block h-2 w-2 rounded-full bg-green-500 shrink-0"
              aria-label={ui('content_editor.lib.saved', lang)}></span>
        <span class="text-green-400">{ui('content_editor.lib.saved', lang)}</span>
      {:else}
        <span class="text-text-muted">{ui('content_editor.lib.ready', lang)}</span>
      {/if}
    </div>
  </div>

  <!-- ──────────────────────────────────────────────────────────────────────── -->
  <!-- TOOLBAR                                                                  -->
  <!-- ──────────────────────────────────────────────────────────────────────── -->
  <div class="flex flex-wrap items-center gap-2">
    <a
      href="/campaigns/{campaignId}/content-editor/new"
      class="btn-primary text-sm"
    >
      {ui('content_editor.lib.new_entity', lang)}
    </a>

    <button type="button" class="btn-ghost text-sm"
            onclick={() => (showImportModal = true)}>
      {ui('content_editor.lib.import_json', lang)}
    </button>

    <button type="button" class="btn-ghost text-sm"
            onclick={exportAll}
            disabled={homebrewStore.entities.length === 0}
            title="Download all entities as a JSON file">
      {ui('content_editor.lib.export_all', lang).replace('{n}', String(homebrewStore.entities.length))}
    </button>

    <!-- Search -->
    <div class="relative ml-auto">
      <label for="entity-search" class="sr-only">{ui('content_editor.lib.filter_placeholder', lang)}</label>
      <input
        id="entity-search"
        type="search"
        class="input pl-8 text-sm w-56"
        placeholder={ui('content_editor.lib.filter_placeholder', lang)}
        bind:value={searchInput}
        autocomplete="off"
      />
      <svg class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4
                  text-text-muted"
           xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
           fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="8"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
    </div>
  </div>

  <!-- ──────────────────────────────────────────────────────────────────────── -->
  <!-- ENTITY TABLE                                                             -->
  <!-- ──────────────────────────────────────────────────────────────────────── -->
  {#if homebrewStore.entities.length === 0}
    <div class="rounded-lg border border-dashed border-border px-6 py-12 text-center">
      <p class="text-text-muted italic text-sm">{ui('content_editor.lib.empty_title', lang)}</p>
      <p class="text-text-muted text-xs mt-1">
        {ui('content_editor.lib.empty_hint', lang)}
      </p>
    </div>

  {:else}
    <div class="overflow-x-auto rounded-lg border border-border">
      <table class="w-full text-sm border-collapse min-w-[640px]">
        <thead>
          <tr class="bg-surface-alt border-b border-border">

              <th class="px-3 py-2 text-left">
              <button type="button"
                      class="text-xs font-semibold text-text-muted hover:text-text-primary"
                      onclick={() => toggleSort('id')}>
                {ui('content_editor.lib.col_id', lang)}{sortIndicator('id')}
              </button>
            </th>

            <th class="px-3 py-2 text-left">
              <button type="button"
                      class="text-xs font-semibold text-text-muted hover:text-text-primary"
                      onclick={() => toggleSort('category')}>
                {ui('content_editor.lib.col_category', lang)}{sortIndicator('category')}
              </button>
            </th>

            <th class="px-3 py-2 text-left">
              <button type="button"
                      class="text-xs font-semibold text-text-muted hover:text-text-primary"
                      onclick={() => toggleSort('label')}>
                {ui('content_editor.lib.col_label', lang)}{sortIndicator('label')}
              </button>
            </th>

            <th class="px-3 py-2 text-left">
              <button type="button"
                      class="text-xs font-semibold text-text-muted hover:text-text-primary"
                      onclick={() => toggleSort('ruleSource')}>
                {ui('content_editor.lib.col_source', lang)}{sortIndicator('ruleSource')}
              </button>
            </th>

            <th class="px-3 py-2 text-right">
              <span class="text-xs font-semibold text-text-muted">{ui('content_editor.lib.col_actions', lang)}</span>
            </th>

          </tr>
        </thead>
        <tbody>
          {#if filteredEntities.length === 0}
            <tr>
              <td colspan="5" class="px-4 py-6 text-center text-sm text-text-muted italic">
                {ui('content_editor.lib.no_match', lang).replace('{search}', debouncedSearch)}
              </td>
            </tr>
          {:else}
            {#each filteredEntities as entity (entity.id)}
              <tr class="border-b border-border/50 hover:bg-surface-alt/50 transition-colors">

                <!-- ID -->
                <td class="px-3 py-2.5">
                  <code class="font-mono text-xs text-text-primary">{entity.id}</code>
                </td>

                <!-- Category badge -->
                <td class="px-3 py-2.5">
                  <span class={categoryBadgeClass(entity.category)}>
                    {entity.category}
                  </span>
                </td>

                <!-- Label -->
                <td class="px-3 py-2.5 text-text-primary">
                  {featureLabel(entity)}
                </td>

                <!-- Rule source -->
                <td class="px-3 py-2.5">
                  <code class="font-mono text-[10px] text-text-muted">{entity.ruleSource}</code>
                </td>

                <!-- Actions -->
                <td class="px-3 py-2.5">
                  <div class="flex items-center justify-end gap-1.5">
                    <a
                      href="/campaigns/{campaignId}/content-editor/{encodeURIComponent(entity.id)}"
                      class="btn-ghost text-xs py-0.5 px-2 h-auto"
                      title="Edit {entity.id}"
                    >
                      {ui('common.edit', lang)}
                    </a>
                    <button
                      type="button"
                      class="btn-ghost text-xs py-0.5 px-2 h-auto"
                      onclick={() => cloneEntity(entity.id)}
                      title="Clone {entity.id}"
                    >
                      {ui('common.clone', lang)}
                    </button>
                    <button
                      type="button"
                      class="btn-ghost text-xs py-0.5 px-2 h-auto text-danger hover:bg-danger/10"
                      onclick={() => (deleteConfirmId = entity.id)}
                      title="Delete {entity.id}"
                    >
                      {ui('common.delete', lang)}
                    </button>
                  </div>
                </td>

              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>

    <p class="text-xs text-text-muted text-right -mt-2">
      {ui('content_editor.lib.entity_count', lang)
        .replace('{filtered}', String(filteredEntities.length))
        .replace('{total}', String(homebrewStore.entities.length))}
      {#if debouncedSearch}{ui('content_editor.lib.entity_count_filtered', lang)}{/if}
    </p>
  {/if}

</div>
