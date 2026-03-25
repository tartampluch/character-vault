<!--
  @file src/routes/campaigns/[id]/settings/+page.svelte
  @description GM-only Campaign Settings — Rule Source Manager + Global Overrides.
  Phase 19.12: Migrated to Tailwind CSS — all scoped <style> removed.

  LAYOUT:
    Sticky page header (back link, title, GM badge, Save button).
    Section 1: Rule Sources — draggable enabled list + available (disabled) list.
    Section 2: GM Global Overrides — JSON textarea with live validation.
-->

<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { sessionContext } from '$lib/engine/SessionContext.svelte';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { campaignStore } from '$lib/engine/CampaignStore.svelte';
  import { storageManager, apiHeaders } from '$lib/engine/StorageManager';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { IconSettings, IconGMDashboard, IconSpells, IconChecked, IconError, IconWarning, IconSuccess, IconDragHandle, IconBack } from '$lib/components/ui/icons';
  import { ui } from '$lib/i18n/ui-strings';

  $effect(() => {
    if (!sessionContext.isGameMaster) goto(`/campaigns/${campaignId}`);
  });

  const campaignId = $derived($page.params.id ?? '');
  const campaign   = $derived(campaignStore.getCampaign(campaignId));

  // ── Rule source file metadata (one entry per JSON file from GET /api/rules/list) ──
  interface RuleSourceFile { path: string; ruleSource: string; entityCount: number; description: string; }
  let availableFiles = $state<RuleSourceFile[]>([]);
  let loadingError   = $state('');

  async function loadAvailableSources() {
    try {
      const response = await fetch('/api/rules/list', { credentials: 'include' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      availableFiles = await response.json();
      loadingError = '';
    } catch (err) {
      loadingError = `Could not load rule sources: ${err}`;
      availableFiles = [];
    }
  }

  $effect(() => { if (sessionContext.isGameMaster) loadAvailableSources(); });

  /**
   * Groups the flat file list by `ruleSource` ID (the logical source identifier
   * from inside each JSON file, e.g. "srd_core", "srd_psionics").
   * This is the level the DataLoader.loadRuleSources() filter operates on.
   * Files with ruleSource "unknown" or "?" are omitted (they carry no game data).
   */
  interface SourceGroup { id: string; entityCount: number; fileCount: number; }
  const sourceGroups = $derived.by((): SourceGroup[] => {
    const map = new Map<string, SourceGroup>();
    for (const f of availableFiles) {
      const id = f.ruleSource;
      if (!id || id === 'unknown' || id === '?' ) continue;
      const g = map.get(id) ?? { id, entityCount: 0, fileCount: 0 };
      map.set(id, { ...g, entityCount: g.entityCount + f.entityCount, fileCount: g.fileCount + 1 });
    }
    // Return in deterministic order (alphabetically by source ID)
    return Array.from(map.values()).sort((a, b) => a.id.localeCompare(b.id));
  });

  // ── Enabled rule sources — stored as logical source IDs, NOT file paths ──────
  // Initialised from the campaign's saved enabledRuleSources so that a page
  // refresh reflects what was last saved to the database.
  let enabledSources   = $state<string[]>([]);
  let sourcesInitialised = false;
  $effect(() => {
    const sources = campaign?.enabledRuleSources;
    if (sources && !sourcesInitialised) {
      enabledSources     = [...sources];
      sourcesInitialised = true;
    }
  });

  let dragSrcIndex = $state<number | null>(null);

  function toggleSource(sourceId: string) {
    enabledSources = enabledSources.includes(sourceId)
      ? enabledSources.filter(s => s !== sourceId)
      : [...enabledSources, sourceId];
  }

  function handleDragStart(index: number) { dragSrcIndex = index; }
  function handleDragOver(event: DragEvent, targetIndex: number) {
    event.preventDefault();
    if (dragSrcIndex === null || dragSrcIndex === targetIndex) return;
    const newList = [...enabledSources];
    const [removed] = newList.splice(dragSrcIndex, 1);
    newList.splice(targetIndex, 0, removed);
    enabledSources = newList;
    dragSrcIndex = targetIndex;
  }
  function handleDragEnd() { dragSrcIndex = null; }

  let gmOverridesText = $state('[]');
  let jsonError       = $state('');
  let jsonWarnings    = $state<string[]>([]);
  let isValidJson     = $state(true);

  // Sync the override text from campaign data when campaign loads/changes.
  // Using $effect avoids the "initial value capture" warning from $derived.
  let overridesInitialised = false;
  $effect(() => {
    const overrides = campaign?.gmGlobalOverrides;
    if (overrides && !overridesInitialised) {
      gmOverridesText = overrides;
      overridesInitialised = true;
    }
  });

  function validateOverrideJson() {
    jsonError = ''; jsonWarnings = []; isValidJson = true;
    if (!gmOverridesText.trim() || gmOverridesText.trim() === '[]') return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(gmOverridesText);
    } catch (e: unknown) {
      const err = e as Error;
      const posMatch = err.message.match(/position (\d+)/);
      if (posMatch) {
        const pos = parseInt(posMatch[1], 10);
        const lineNum = gmOverridesText.slice(0, pos).split('\n').length;
        jsonError = `Syntax error on line ${lineNum}: ${err.message}`;
      } else {
        jsonError = `Syntax error: ${err.message}`;
      }
      isValidJson = false; return;
    }
    if (!Array.isArray(parsed)) { jsonError = 'Override JSON must be an array ([ ... ]).'; isValidJson = false; return; }
    for (let i = 0; i < (parsed as unknown[]).length; i++) {
      const entry = (parsed as Record<string, unknown>[])[i];
      if (!entry || typeof entry !== 'object') { jsonWarnings.push(`Entry ${i}: expected object, got ${typeof entry}.`); continue; }
      if (!entry['tableId'] && (!entry['id'] || !entry['category'])) {
        jsonWarnings.push(`Entry ${i} ("${entry['id'] ?? '?'}"): missing 'id' or 'category'.`);
      }
      if (entry['tableId'] && !entry['data']) {
        jsonWarnings.push(`Entry ${i} (tableId: "${entry['tableId']}"): missing 'data' array.`);
      }
    }
  }

  $effect(() => { gmOverridesText; validateOverrideJson(); });

  // ── Variant Rules (Extensions G + H) ─────────────────────────────────────
  let variantGestalt = $state(engine.settings.variantRules?.gestalt ?? false);
  let variantVWP     = $state(engine.settings.variantRules?.vitalityWoundPoints ?? false);

  let isSaving    = $state(false);
  let saveSuccess = $state('');

  async function saveSettings() {
    if (!isValidJson) return;
    isSaving = true; saveSuccess = '';

    // Apply to in-memory engine state immediately (instant UI feedback)
    engine.settings.enabledRuleSources = [...enabledSources];
    engine.settings.variantRules = { gestalt: variantGestalt, vitalityWoundPoints: variantVWP };

    // Reload rule sources so character sheet dropdowns reflect new selection
    dataLoader
      .loadRuleSources(enabledSources, gmOverridesText)
      .catch(e => console.warn('[Settings] DataLoader reload failed:', e));

    try {
      const response = await fetch(`/api/campaigns/${campaignId}`, {
        method: 'PUT',
        headers: apiHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          enabledRuleSources: enabledSources,
          gmGlobalOverrides: gmOverridesText,
          variantRules: { gestalt: variantGestalt, vitalityWoundPoints: variantVWP },
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      // Sync the campaign store so other pages see the updated sources
      campaignStore.updateCampaign(campaignId, {
        enabledRuleSources: [...enabledSources],
        gmGlobalOverrides: gmOverridesText,
      });
      saveSuccess = 'Settings saved successfully!';
      setTimeout(() => (saveSuccess = ''), 3000);
    } catch (err) {
      console.warn('[Settings] API unavailable:', err);
      saveSuccess = 'Saved locally (API unavailable).';
      setTimeout(() => (saveSuccess = ''), 5000);
    } finally {
      isSaving = false;
    }
  }
</script>

<div class="max-w-4xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-5">

  <!-- ── HEADER ───────────────────────────────────────────────────────────── -->
  <header class="flex items-center gap-3 flex-wrap border-b border-border pb-4">
    <a href="/campaigns/{campaignId}" class="inline-flex items-center gap-1 text-xs text-text-muted hover:text-accent transition-colors shrink-0">
      <IconBack size={12} aria-hidden="true" /> Campaign
    </a>
    <h1 class="flex items-center gap-2 text-xl font-bold text-text-primary flex-1">
      <IconSettings size={20} aria-hidden="true" /> Campaign Settings
    </h1>
    <div class="flex items-center gap-2">
      <span class="badge-accent flex items-center gap-1 text-xs">
        <IconGMDashboard size={12} aria-hidden="true" /> GM View
      </span>
      <button
        class="btn-primary"
        onclick={saveSettings}
        disabled={isSaving || !isValidJson}
        aria-label="Save campaign settings"
        type="button"
      >
        {isSaving ? 'Saving…' : 'Save Settings'}
      </button>
    </div>
  </header>

  {#if saveSuccess}
    <div class="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-green-600/40 bg-green-950/20 text-green-400 text-sm" role="status">
      <IconSuccess size={14} aria-hidden="true" /> {saveSuccess}
    </div>
  {/if}

  <!-- ── SECTION 1: RULE SOURCE MANAGER ────────────────────────────────────── -->
  <section class="card p-5 flex flex-col gap-4">
    <div>
      <h2 class="section-header text-base border-b border-border pb-2">
        <IconSpells size={18} aria-hidden="true" /> Rule Sources
      </h2>
      <p class="mt-2 text-xs text-text-muted leading-relaxed">
        Enable or disable rule source files. Drag to reorder — sources loaded <strong class="text-text-secondary">later</strong> have higher priority (last wins on duplicate IDs).
      </p>
    </div>

    {#if loadingError}
      <div class="flex items-center gap-2 px-3 py-2 rounded border border-red-700/40 bg-red-950/20 text-red-400 text-xs">
        <IconError size={12} aria-hidden="true" /> {loadingError}
      </div>
    {/if}

    <!--
      Sources are displayed as LOGICAL GROUPS (by ruleSource ID, e.g. "srd_core"),
      not as individual file paths. A single source ID like "srd_core" covers
      17 JSON files; enabling it passes that ID to DataLoader.loadRuleSources()
      which filters all cached entities by their ruleSource field.
    -->

    <!-- Enabled (draggable) sources -->
    {#if enabledSources.length > 0}
      <div class="flex flex-col gap-1.5">
        <p class="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-accent">
          <IconChecked size={12} aria-hidden="true" /> Enabled (drag to reorder)
        </p>
        {#each enabledSources as sourceId, index}
          {@const group = sourceGroups.find(g => g.id === sourceId)}
          <div
            class="flex items-center gap-2 px-3 py-2 rounded-lg border border-accent/40 bg-surface-alt
                   cursor-grab active:cursor-grabbing transition-opacity duration-150
                   {dragSrcIndex === index ? 'opacity-40 border-dashed' : ''}"
            draggable="true"
            ondragstart={() => handleDragStart(index)}
            ondragover={(e) => handleDragOver(e, index)}
            ondragend={handleDragEnd}
            role="listitem"
            aria-label="{sourceId} (drag to reorder)"
          >
            <span class="text-text-muted shrink-0"><IconDragHandle size={14} aria-hidden="true" /></span>
            <div class="flex-1 min-w-0">
              <span class="text-xs font-mono font-semibold text-text-primary truncate block">{sourceId}</span>
              {#if group}
                <span class="text-[10px] text-text-muted">
                  {group.fileCount} file{group.fileCount !== 1 ? 's' : ''} · {group.entityCount} entities
                </span>
              {:else}
                <span class="text-[10px] text-amber-400/80 italic">
                  Saved source — not found in current file list
                </span>
              {/if}
            </div>
            <span class="badge-accent shrink-0 text-[10px]">#{index + 1}</span>
            <button
              class="shrink-0 text-xs px-2 py-0.5 rounded border border-red-700/40 bg-red-950/20 text-red-400 hover:bg-red-900/30 transition-colors"
              onclick={() => toggleSource(sourceId)}
              aria-label="Disable {sourceId}"
              type="button"
            >Disable</button>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Available (disabled) sources -->
    {#if sourceGroups.filter(g => !enabledSources.includes(g.id)).length > 0}
      <div class="flex flex-col gap-1.5">
        <p class="text-xs font-semibold uppercase tracking-wider text-text-muted">Available (not loaded)</p>
        {#each sourceGroups.filter(g => !enabledSources.includes(g.id)) as group}
          <div class="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-surface-alt opacity-60 hover:opacity-100 transition-opacity">
            <span class="text-border shrink-0"><IconDragHandle size={14} aria-hidden="true" /></span>
            <div class="flex-1 min-w-0">
              <span class="text-xs font-mono font-semibold text-text-muted truncate block">{group.id}</span>
              <span class="text-[10px] text-text-muted">
                {group.fileCount} file{group.fileCount !== 1 ? 's' : ''} · {group.entityCount} entities
              </span>
            </div>
            <button
              class="shrink-0 text-xs px-2 py-0.5 rounded border border-green-700/40 bg-green-950/20 text-green-400 hover:bg-green-900/30 transition-colors"
              onclick={() => toggleSource(group.id)}
              aria-label="Enable {group.id}"
              type="button"
            >Enable</button>
          </div>
        {/each}
      </div>
    {/if}

    {#if sourceGroups.length === 0 && !loadingError}
      <p class="text-xs text-text-muted italic">No rule sources found. Start the PHP API server to load sources.</p>
    {/if}
  </section>

  <!-- ── SECTION 2: VARIANT RULES (Extensions G + H) ─────────────────────── -->
  <section class="card p-5 flex flex-col gap-4">
    <div>
      <h2 class="section-header text-base border-b border-border pb-2">
        ⚗ {ui('variant.title', engine.settings.language)}
      </h2>
      <p class="mt-2 text-xs text-text-muted leading-relaxed">
        Variant rules change core engine behaviour. These flags are saved per-campaign and applied immediately.
        Only enable variant rules your group has agreed to use.
      </p>
    </div>

    <!-- Gestalt Characters (Extension G) -->
    <label class="flex items-start gap-3 cursor-pointer group">
      <div class="mt-0.5 shrink-0">
        <input
          type="checkbox"
          bind:checked={variantGestalt}
          class="w-4 h-4 accent-accent rounded"
          aria-labelledby="variant-gestalt-label"
        />
      </div>
      <div class="flex flex-col gap-0.5">
        <span id="variant-gestalt-label" class="text-sm font-semibold text-text-primary group-hover:text-accent transition-colors">
          {ui('variant.gestalt', engine.settings.language)}
        </span>
        <span class="text-xs text-text-muted leading-relaxed">
          {ui('variant.gestalt_desc', engine.settings.language)}
        </span>
      </div>
    </label>

    <!-- Vitality / Wound Points (Extension H) -->
    <label class="flex items-start gap-3 cursor-pointer group">
      <div class="mt-0.5 shrink-0">
        <input
          type="checkbox"
          bind:checked={variantVWP}
          class="w-4 h-4 accent-accent rounded"
          aria-labelledby="variant-vwp-label"
        />
      </div>
      <div class="flex flex-col gap-0.5">
        <span id="variant-vwp-label" class="text-sm font-semibold text-text-primary group-hover:text-accent transition-colors">
          {ui('variant.vitality_wound', engine.settings.language)}
        </span>
        <span class="text-xs text-text-muted leading-relaxed">
          {ui('variant.vitality_wound_desc', engine.settings.language)}
        </span>
        {#if variantVWP}
          <p class="text-xs text-amber-400/80 italic mt-0.5">
            ⚠ Requires <code class="bg-surface-alt px-1 rounded">resources.vitality_points</code> and
            <code class="bg-surface-alt px-1 rounded">resources.wound_points</code> pools on each character.
          </p>
        {/if}
      </div>
    </label>
  </section>

  <!-- ── SECTION 3: GM GLOBAL OVERRIDES ────────────────────────────────────── -->
  <section class="card p-5 flex flex-col gap-3">
    <div>
      <h2 class="section-header text-base border-b border-border pb-2">
        <IconGMDashboard size={18} aria-hidden="true" /> GM Global Overrides
      </h2>
      <p class="mt-2 text-xs text-text-muted leading-relaxed">
        A JSON array of Feature-like objects and/or config tables applied to ALL characters in this campaign,
        AFTER all rule source files. Features need <code class="bg-surface-alt px-1 rounded">id</code> + <code class="bg-surface-alt px-1 rounded">category</code>.
        Config tables need <code class="bg-surface-alt px-1 rounded">tableId</code> + <code class="bg-surface-alt px-1 rounded">data</code>.
      </p>
    </div>

    <!-- JSON error -->
    {#if jsonError}
      <div class="flex items-start gap-2 px-3 py-2 rounded border border-red-700/40 bg-red-950/20 text-red-400 text-xs font-mono" role="alert">
        <IconWarning size={12} class="mt-0.5 shrink-0" aria-hidden="true" />
        <strong>JSON Syntax Error:</strong> {jsonError}
      </div>
    {/if}

    <!-- JSON warnings (non-blocking) -->
    {#if jsonWarnings.length > 0}
      <ul class="flex flex-col gap-1">
        {#each jsonWarnings as warning}
          <li class="flex items-center gap-1.5 px-2 py-1 rounded border border-yellow-700/40 bg-yellow-950/20 text-yellow-400 text-xs">
            <IconWarning size={11} aria-hidden="true" /> {warning}
          </li>
        {/each}
      </ul>
    {/if}

    <!-- JSON textarea -->
    <textarea
      class="w-full rounded-lg border px-3 py-2.5 font-mono text-xs leading-relaxed resize-vertical
             bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50 transition-colors
             {isValidJson ? 'border-border focus:border-accent' : 'border-red-600 bg-red-950/10'}"
      bind:value={gmOverridesText}
      spellcheck="false"
      rows="18"
      aria-label="GM Global Overrides JSON"
    ></textarea>

    <!-- JSON status bar -->
    <div class="flex items-center justify-between text-xs px-0.5">
      <span class="flex items-center gap-1.5 font-medium {isValidJson ? 'text-green-400' : 'text-red-400'}">
        {#if isValidJson}
          <IconSuccess size={13} aria-hidden="true" /> Valid JSON
        {:else}
          <IconError size={13} aria-hidden="true" /> Invalid JSON — fix errors before saving
        {/if}
      </span>
      {#if isValidJson}
        <span class="text-text-muted">
          {(() => { const c = JSON.parse(gmOverridesText || '[]').length; return `${c} override entr${c === 1 ? 'y' : 'ies'}`; })()}
        </span>
      {/if}
    </div>
  </section>

</div>
