<!--
  @file src/routes/campaigns/[id]/settings/+page.svelte
  @description GM-only Campaign Settings page — Rule Source Manager + Global Overrides.

  ARCHITECTURE.md Phase 15.1 + 15.2:
    This page is accessible ONLY to Game Masters (enforced by navigation guard below).
    It provides:

    SECTION 1: Rule Source Manager (Phase 15.1)
      - Lists all available JSON rule source files (fetched from GET /api/rules/list).
      - Each source can be enabled/disabled by the GM.
      - Sources can be reordered via drag-and-drop (order = override priority, last wins).
      - Saves the ordered enabled list to CampaignSettings.enabledRuleSources.
      - Shows entity count per source file.

    SECTION 2: Global Override Text Area (Phase 15.2)
      - Large JSON text area for GM global overrides.
      - Live JSON validator: highlights syntax errors with line numbers.
      - Structural warning if entries lack `id`+`category` or `tableId`.
      - Saved to Campaign.gmGlobalOverrides via PUT /api/campaigns/{id}.

  NAVIGATION GUARD:
    Non-GMs are redirected to the campaign detail page immediately.
    This prevents unauthorized access to GM override data.

  DRAG-AND-DROP:
    Uses the HTML5 native drag-and-drop API (no external library needed).
    The order of `enabledRuleSources` determines override priority.

  @see api/controllers/RulesController.php for GET /api/rules/list.
  @see ARCHITECTURE.md Phase 15.1-15.2 for the full specification.
-->

<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { sessionContext } from '$lib/engine/SessionContext.svelte';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { campaignStore } from '$lib/engine/CampaignStore.svelte';
  import { storageManager } from '$lib/engine/StorageManager';
  import { IconSettings, IconGMDashboard, IconSpells, IconAdd, IconChecked, IconError, IconWarning, IconSuccess, IconDragHandle } from '$lib/components/ui/icons';

  // ============================================================
  // NAVIGATION GUARD — GM-only page
  // ============================================================

  $effect(() => {
    if (!sessionContext.isGameMaster) {
      goto(`/campaigns/${campaignId}`);
    }
  });

  // ============================================================
  // CAMPAIGN DATA
  // ============================================================

  const campaignId = $derived($page.params.id);
  const campaign = $derived(campaignStore.getCampaign(campaignId));

  // ============================================================
  // AVAILABLE RULE SOURCES (from /api/rules/list or static files)
  // ============================================================

  interface RuleSourceFile {
    path: string;
    ruleSource: string;
    entityCount: number;
    description: string;
  }

  let availableSources = $state<RuleSourceFile[]>([]);
  let loadingError = $state('');

  /**
   * Loads the list of available rule source files.
   * Tries the API first, falls back to the SvelteKit /api/rules/list endpoint.
   */
  async function loadAvailableSources() {
    try {
      const response = await fetch('/api/rules/list', { credentials: 'include' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      availableSources = await response.json();
      loadingError = '';
    } catch (err) {
      loadingError = `Could not load rule sources: ${err}`;
      availableSources = [];
    }
  }

  $effect(() => {
    if (sessionContext.isGameMaster) {
      loadAvailableSources();
    }
  });

  // ============================================================
  // ENABLED SOURCES STATE
  // ============================================================

  /**
   * The ordered list of enabled rule source paths.
   * Initialised from engine.settings.enabledRuleSources.
   * Order = override priority (last wins).
   */
  let enabledSources = $state<string[]>([...engine.settings.enabledRuleSources]);

  const isSaved = $state(false);

  function toggleSource(path: string) {
    if (enabledSources.includes(path)) {
      enabledSources = enabledSources.filter(s => s !== path);
    } else {
      enabledSources = [...enabledSources, path];
    }
  }

  function isEnabled(path: string): boolean {
    return enabledSources.includes(path);
  }

  // ============================================================
  // DRAG-AND-DROP REORDERING
  // ============================================================

  let dragSrcIndex = $state<number | null>(null);

  function handleDragStart(index: number) {
    dragSrcIndex = index;
  }

  function handleDragOver(event: DragEvent, targetIndex: number) {
    event.preventDefault();
    if (dragSrcIndex === null || dragSrcIndex === targetIndex) return;

    const newList = [...enabledSources];
    const [removed] = newList.splice(dragSrcIndex, 1);
    newList.splice(targetIndex, 0, removed);
    enabledSources = newList;
    dragSrcIndex = targetIndex;
  }

  function handleDragEnd() {
    dragSrcIndex = null;
  }

  // ============================================================
  // GLOBAL OVERRIDE TEXT AREA (Phase 15.2)
  // ============================================================

  let gmOverridesText = $state(campaign?.gmGlobalOverrides ?? '[]');
  let jsonError = $state('');
  let jsonWarnings = $state<string[]>([]);
  let isValidJson = $state(true);

  /**
   * Validates the JSON syntax and structural integrity of the override text.
   * Updates `jsonError` and `jsonWarnings` for display.
   */
  function validateOverrideJson() {
    jsonError = '';
    jsonWarnings = [];
    isValidJson = true;

    if (!gmOverridesText.trim() || gmOverridesText.trim() === '[]') {
      return;
    }

    // 1. Syntax validation
    let parsed: unknown;
    try {
      parsed = JSON.parse(gmOverridesText);
    } catch (e: unknown) {
      const err = e as Error;
      // Extract line number from error message (Chrome/Node format: "at position N")
      const posMatch = err.message.match(/position (\d+)/);
      if (posMatch) {
        const pos = parseInt(posMatch[1], 10);
        const lineNum = gmOverridesText.slice(0, pos).split('\n').length;
        jsonError = `Syntax error on line ${lineNum}: ${err.message}`;
      } else {
        jsonError = `Syntax error: ${err.message}`;
      }
      isValidJson = false;
      return;
    }

    if (!Array.isArray(parsed)) {
      jsonError = 'Override JSON must be an array ([ ... ]).';
      isValidJson = false;
      return;
    }

    // 2. Structural validation (non-blocking warnings)
    for (let i = 0; i < (parsed as unknown[]).length; i++) {
      const entry = (parsed as Record<string, unknown>[])[i];
      if (!entry || typeof entry !== 'object') {
        jsonWarnings.push(`Entry ${i}: expected an object, got ${typeof entry}.`);
        continue;
      }
      // Feature: must have id + category
      if (!entry['tableId'] && (!entry['id'] || !entry['category'])) {
        jsonWarnings.push(`Entry ${i} ("${entry['id'] ?? '?'}"): missing 'id' or 'category'. Add these fields or a 'tableId' for config tables.`);
      }
      // Config table: must have tableId + data
      if (entry['tableId'] && !entry['data']) {
        jsonWarnings.push(`Entry ${i} (tableId: "${entry['tableId']}"): missing 'data' array.`);
      }
    }
  }

  // Re-validate whenever the text changes
  $effect(() => {
    gmOverridesText; // Trigger reactivity
    validateOverrideJson();
  });

  // ============================================================
  // SAVE
  // ============================================================

  let isSaving = $state(false);
  let saveSuccess = $state('');

  async function saveSettings() {
    if (!isValidJson) return;
    isSaving = true;
    saveSuccess = '';

    // Update engine settings
    engine.settings.enabledRuleSources = [...enabledSources];

    // Persist via API
    try {
      const response = await fetch(`/api/campaigns/${campaignId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          enabledRuleSources: enabledSources,
          gmGlobalOverrides: gmOverridesText,
        }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      // Update local campaign store
      if (campaign) {
        campaign.enabledRuleSources = [...enabledSources];
        campaign.gmGlobalOverrides = gmOverridesText;
      }

      saveSuccess = 'Settings saved successfully!';
      setTimeout(() => (saveSuccess = ''), 3000);
    } catch (err) {
      // Fallback: settings already saved to engine in-memory
      console.warn('[Settings] API unavailable, settings saved in-memory only:', err);
      saveSuccess = 'Saved locally (API unavailable).';
      setTimeout(() => (saveSuccess = ''), 5000);
    } finally {
      isSaving = false;
    }
  }
</script>

<div class="settings-page">
  <!-- ========================================================= -->
  <!-- HEADER -->
  <!-- ========================================================= -->
  <header class="page-header">
    <a href="/campaigns/{campaignId}" class="back-link">← Campaign</a>
     <h1 class="page-title"><IconSettings size={24} aria-hidden="true" /> Campaign Settings</h1>
     <div class="header-meta">
       <span class="gm-badge"><IconGMDashboard size={14} aria-hidden="true" /> GM View</span>
       <button
         class="btn-save"
         onclick={saveSettings}
         disabled={isSaving || !isValidJson}
         aria-label="Save campaign settings"
       >
         {isSaving ? 'Saving...' : 'Save Settings'}
       </button>
    </div>
  </header>

  {#if saveSuccess}
    <div class="success-banner" role="status">{saveSuccess}</div>
  {/if}

  <!-- ========================================================= -->
  <!-- SECTION 1: RULE SOURCE MANAGER (Phase 15.1) -->
  <!-- ========================================================= -->
  <section class="settings-section">
     <h2 class="section-title"><IconSpells size={20} aria-hidden="true" /> Rule Sources</h2>
    <p class="section-desc">
      Enable or disable rule source files. Drag to reorder — sources loaded LATER have HIGHER priority
      (last source wins when two entities share the same ID).
    </p>

    {#if loadingError}
      <div class="error-banner">{loadingError}</div>
    {/if}

    <!-- ENABLED SOURCES (reorderable) -->
    {#if enabledSources.length > 0}
      <div class="sources-section">
         <h3 class="subsection-title"><IconChecked size={16} aria-hidden="true" /> Enabled Sources (drag to reorder)</h3>
        <div class="sources-list reorderable">
          {#each enabledSources as sourcePath, index}
            {@const meta = availableSources.find(s => s.path === sourcePath)}
            <div
              class="source-item enabled"
              class:dragging={dragSrcIndex === index}
              draggable="true"
              ondragstart={() => handleDragStart(index)}
              ondragover={(e) => handleDragOver(e, index)}
              ondragend={handleDragEnd}
              role="listitem"
              aria-label="{sourcePath} (drag to reorder)"
            >
               <span class="drag-handle" aria-hidden="true"><IconDragHandle size={16} /></span>
              <div class="source-info">
                <span class="source-path">{sourcePath}</span>
                {#if meta}
                  <span class="source-meta">{meta.ruleSource} · {meta.entityCount} entities</span>
                {/if}
              </div>
              <div class="source-badge priority-badge">#{index + 1}</div>
              <button
                class="btn-toggle disable-btn"
                onclick={() => toggleSource(sourcePath)}
                aria-label="Disable {sourcePath}"
              >Disable</button>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- AVAILABLE (DISABLED) SOURCES -->
    {#if availableSources.filter(s => !enabledSources.includes(s.path)).length > 0}
      {@const disabledSources = availableSources.filter(s => !enabledSources.includes(s.path))}
      <div class="sources-section">
         <h3 class="subsection-title">Available Sources (not loaded)</h3>
        <div class="sources-list">
          {#each disabledSources as source}
            <div class="source-item disabled">
               <span class="drag-handle muted" aria-hidden="true"><IconDragHandle size={16} /></span>
              <div class="source-info">
                <span class="source-path muted">{source.path}</span>
                <span class="source-meta">{source.ruleSource} · {source.entityCount} entities</span>
                {#if source.description}
                  <span class="source-desc">{source.description}</span>
                {/if}
              </div>
              <button
                class="btn-toggle enable-btn"
                onclick={() => toggleSource(source.path)}
                aria-label="Enable {source.path}"
              >Enable</button>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    {#if availableSources.length === 0 && !loadingError}
      <p class="empty-note">No rule sources found. Start the PHP API server to load sources.</p>
    {/if}
  </section>

  <!-- ========================================================= -->
  <!-- SECTION 2: GLOBAL OVERRIDE TEXT AREA (Phase 15.2) -->
  <!-- ========================================================= -->
  <section class="settings-section">
     <h2 class="section-title"><IconGMDashboard size={20} aria-hidden="true" /> GM Global Overrides</h2>
    <p class="section-desc">
      A JSON array of Feature-like objects and/or config tables applied to ALL characters
      in this campaign, AFTER all rule source files. Features need <code>id</code> + <code>category</code>.
      Config tables need <code>tableId</code> + <code>data</code>.
    </p>

    <!-- JSON Error indicator -->
    {#if jsonError}
      <div class="json-error" role="alert">
         <strong><IconWarning size={14} aria-hidden="true" /> JSON Syntax Error:</strong> {jsonError}
      </div>
    {/if}

    <!-- JSON Warnings (non-blocking) -->
    {#if jsonWarnings.length > 0}
      <ul class="json-warnings" role="list">
        {#each jsonWarnings as warning}
           <li class="json-warning"><IconWarning size={12} aria-hidden="true" /> {warning}</li>
        {/each}
      </ul>
    {/if}

    <textarea
      class="override-textarea"
      class:has-error={!isValidJson}
      bind:value={gmOverridesText}
      spellcheck="false"
      rows="20"
      aria-label="GM Global Overrides JSON"
      placeholder="[&#10;  &#123;&#10;    &quot;id&quot;: &quot;gm_custom_feature&quot;,&#10;    &quot;category&quot;: &quot;condition&quot;,&#10;    &quot;ruleSource&quot;: &quot;gm_override&quot;,&#10;    &quot;label&quot;: &#123; &quot;en&quot;: &quot;...&quot; &#125;,&#10;    &quot;grantedModifiers&quot;: [],&#10;    &quot;grantedFeatures&quot;: [],&#10;    &quot;tags&quot;: []&#10;  &#125;&#10;]"
    ></textarea>

    <!-- JSON status bar -->
    <div class="json-status-bar">
      <span class="status-indicator" class:valid={isValidJson} class:invalid={!isValidJson}>
         {#if isValidJson}<IconSuccess size={14} aria-hidden="true" /> Valid JSON{:else}<IconError size={14} aria-hidden="true" /> Invalid JSON — fix errors before saving{/if}
      </span>
      {#if isValidJson}
        {@const count = JSON.parse(gmOverridesText || '[]').length}
        <span class="entry-count">{count} override entr{count === 1 ? 'y' : 'ies'}</span>
      {/if}
    </div>
  </section>

</div>

<style>
  .settings-page {
    max-width: 900px;
    margin: 0 auto;
    padding: 1.5rem;
    font-family: 'Segoe UI', system-ui, sans-serif;
    color: #e0e0e0;
    background: #0d1117;
    min-height: 100vh;
  }

  /* ========================= HEADER ========================= */
  .page-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-bottom: 1.5rem;
    border-bottom: 1px solid #21262d;
    padding-bottom: 0.75rem;
  }

  .back-link { font-size: 0.8rem; color: #6080a0; text-decoration: none; }
  .back-link:hover { color: #c4b5fd; }

  .page-title { margin: 0; font-size: 1.5rem; color: #f0f0ff; flex: 1; }

  .header-meta { display: flex; align-items: center; gap: 0.75rem; }

  .gm-badge {
    font-size: 0.75rem;
    background: #1c1a3a;
    color: #c4b5fd;
    border: 1px solid #4c35a0;
    border-radius: 4px;
    padding: 0.15rem 0.5rem;
  }

  .btn-save {
    background: #7c3aed;
    color: #fff;
    border: none;
    border-radius: 6px;
    padding: 0.5rem 1.1rem;
    font-size: 0.9rem;
    cursor: pointer;
  }
  .btn-save:hover:not(:disabled) { background: #6d28d9; }
  .btn-save:disabled { opacity: 0.5; cursor: not-allowed; }

  /* ========================= BANNERS ========================= */
  .success-banner {
    background: #0f2a0f;
    color: #4ade80;
    border: 1px solid #166534;
    border-radius: 6px;
    padding: 0.5rem 0.9rem;
    margin-bottom: 1rem;
    font-size: 0.9rem;
  }

  .error-banner {
    background: #1c0000;
    color: #f87171;
    border: 1px solid #7f1d1d;
    border-radius: 6px;
    padding: 0.5rem 0.9rem;
    margin-bottom: 0.75rem;
    font-size: 0.85rem;
  }

  /* ========================= SECTIONS ========================= */
  .settings-section {
    background: #161b22;
    border: 1px solid #21262d;
    border-radius: 10px;
    padding: 1.25rem;
    margin-bottom: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .section-title { margin: 0; font-size: 1rem; color: #c4b5fd; }

  .section-desc {
    font-size: 0.82rem;
    color: #6080a0;
    line-height: 1.55;
    margin: 0;
  }

  .section-desc code { background: #0d1117; padding: 0.1rem 0.3rem; border-radius: 3px; font-size: 0.82rem; }

  /* ========================= SOURCES ========================= */
  .sources-section { display: flex; flex-direction: column; gap: 0.4rem; }

  .subsection-title {
    margin: 0;
    font-size: 0.82rem;
    color: #7c3aed;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .sources-list { display: flex; flex-direction: column; gap: 0.3rem; }

  .source-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: #0d1117;
    border: 1px solid #21262d;
    border-radius: 6px;
    transition: background 0.1s;
  }

  .source-item.enabled { border-color: #4c35a0; }
  .source-item.disabled { opacity: 0.65; }
  .source-item.dragging { opacity: 0.5; border-style: dashed; }

  .reorderable .source-item { cursor: grab; }
  .reorderable .source-item:active { cursor: grabbing; }

  .drag-handle { color: #30363d; font-size: 1rem; flex-shrink: 0; }
  .drag-handle.muted { color: #1a1a3a; }

  .source-info { flex: 1; display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }

  .source-path {
    font-size: 0.82rem;
    color: #c0c0d0;
    font-family: monospace;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .source-path.muted { color: #4a4a6a; }
  .source-meta { font-size: 0.72rem; color: #6080a0; }
  .source-desc { font-size: 0.7rem; color: #4a4a6a; font-style: italic; }

  .priority-badge {
    font-size: 0.68rem;
    background: #1c1a3a;
    color: #c4b5fd;
    border: 1px solid #4c35a0;
    border-radius: 3px;
    padding: 0.1rem 0.3rem;
    flex-shrink: 0;
  }

  .btn-toggle {
    border: 1px solid #30363d;
    border-radius: 4px;
    padding: 0.2rem 0.6rem;
    font-size: 0.75rem;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .enable-btn { background: #0f2a0f; color: #4ade80; border-color: #166534; }
  .enable-btn:hover { background: #0a2010; }
  .disable-btn { background: #1c0000; color: #f87171; border-color: #7f1d1d; }
  .disable-btn:hover { background: #150000; }

  .empty-note { font-size: 0.82rem; color: #4a4a6a; font-style: italic; margin: 0; }

  /* ========================= OVERRIDE TEXTAREA ========================= */
  .override-textarea {
    width: 100%;
    box-sizing: border-box;
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    color: #c9d1d9;
    font-family: 'Courier New', monospace;
    font-size: 0.82rem;
    line-height: 1.55;
    padding: 0.75rem;
    resize: vertical;
    transition: border-color 0.15s;
  }

  .override-textarea:focus { outline: none; border-color: #7c3aed; }
  .override-textarea.has-error { border-color: #dc2626; background: #1c0000; }

  .json-error {
    background: #1c0000;
    color: #f87171;
    border: 1px solid #7f1d1d;
    border-radius: 4px;
    padding: 0.4rem 0.75rem;
    font-size: 0.82rem;
    font-family: monospace;
  }

  .json-warnings {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .json-warning {
    font-size: 0.78rem;
    color: #fbbf24;
    background: #1c1400;
    border: 1px solid #854d0e;
    border-radius: 3px;
    padding: 0.2rem 0.5rem;
  }

  .json-status-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.78rem;
    padding: 0 0.1rem;
  }

  .status-indicator { font-weight: 500; }
  .status-indicator.valid { color: #4ade80; }
  .status-indicator.invalid { color: #f87171; }
  .entry-count { color: #4a4a6a; }
</style>
