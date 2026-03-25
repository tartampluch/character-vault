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
   * All distinct ruleSource group IDs present in the available file list.
   * Used for the "Enable all / Disable all" quick-toggle buttons.
   */
  const availableGroups = $derived.by((): string[] => {
    const seen = new Set<string>();
    for (const f of availableFiles) {
      if (f.ruleSource && f.ruleSource !== 'unknown' && f.ruleSource !== '?') {
        seen.add(f.ruleSource);
      }
    }
    return Array.from(seen).sort();
  });

  // ── Enabled sources — stored as RELATIVE FILE PATHS ──────────────────────
  // e.g. ["00_d20srd_core/00_d20srd_core_config_tables.json", "00_d20srd_core/01_d20srd_core_races.json"]
  //
  // The DataLoader receives these paths and fetches ONLY the listed files.
  // This gives fine-grained control: the GM can enable individual files
  // (e.g. disable prestige classes without disabling core rules).
  //
  // Initialised from campaign.enabledRuleSources on first load.
  let enabledSources     = $state<string[]>([]);
  let sourcesInitialised = false;
  $effect(() => {
    const sources = campaign?.enabledRuleSources;
    if (sources && !sourcesInitialised) {
      enabledSources     = [...sources];
      sourcesInitialised = true;
    }
  });

  let dragSrcIndex = $state<number | null>(null);

  /** Toggle a single file path on/off. */
  function toggleFile(path: string) {
    enabledSources = enabledSources.includes(path)
      ? enabledSources.filter(p => p !== path)
      : [...enabledSources, path];
  }

  /**
   * Enable or disable ALL files belonging to a ruleSource group in one click.
   * If ALL group files are already enabled → disables them all (toggle behaviour).
   * Otherwise → enables all that aren't already enabled.
   */
  function toggleGroup(groupId: string) {
    const groupPaths = availableFiles.filter(f => f.ruleSource === groupId).map(f => f.path);
    const allEnabled = groupPaths.every(p => enabledSources.includes(p));
    if (allEnabled) {
      enabledSources = enabledSources.filter(p => !groupPaths.includes(p));
    } else {
      const toAdd = groupPaths.filter(p => !enabledSources.includes(p));
      enabledSources = [...enabledSources, ...toAdd];
    }
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

  // ── Dice Rules ────────────────────────────────────────────────────────────
  let explodingTwenties = $state(engine.settings.diceRules?.explodingTwenties ?? false);

  // ── Stat Generation ───────────────────────────────────────────────────────
  let statMethod      = $state<'roll' | 'point_buy' | 'standard_array'>(engine.settings.statGeneration?.method ?? 'point_buy');
  let rerollOnes      = $state(engine.settings.statGeneration?.rerollOnes ?? false);
  let pointBuyBudget  = $state(engine.settings.statGeneration?.pointBuyBudget ?? 25);

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
    engine.settings.diceRules      = { explodingTwenties };
    engine.settings.statGeneration = { method: statMethod, rerollOnes, pointBuyBudget };
    engine.settings.variantRules   = { gestalt: variantGestalt, vitalityWoundPoints: variantVWP };

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
          diceRules:      { explodingTwenties },
          statGeneration: { method: statMethod, rerollOnes, pointBuyBudget },
          variantRules:   { gestalt: variantGestalt, vitalityWoundPoints: variantVWP },
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
      HOW RULE SOURCES WORK:
        Each JSON file carries a `ruleSource` field (e.g. "srd_core").
        DataLoader loads ALL discovered files, then filters its feature cache
        to only keep entities whose `ruleSource` is in `enabledRuleSources`.
        So enabling "srd_core" enables ALL files tagged with that source ID —
        you do not need to enable individual files.

        The list below shows individual files for transparency and fine-grained
        ordering. The "Enable group" buttons let you turn on all files of a
        source in one click.
    -->

    <!--
      FILE-BASED RULE SOURCE MANAGER
      ────────────────────────────────
      • Each row = one JSON file (maximum granularity).
      • Files are sorted alphabetically by path (= load order).
      • Quick-toggle buttons enable/disable all files of a ruleSource group at once.
      • The DataLoader loads ONLY the enabled files — no ruleSource-ID filtering.
    -->

    <!-- Quick group enable/disable buttons -->
    {#if availableGroups.length > 0}
      <div class="flex flex-wrap gap-2 py-1">
        <span class="text-xs text-text-muted self-center shrink-0">Quick toggle:</span>
        {#each availableGroups as groupId}
          {@const groupFiles = availableFiles.filter(f => f.ruleSource === groupId)}
          {@const allOn = groupFiles.length > 0 && groupFiles.every(f => enabledSources.includes(f.path))}
          {@const someOn = groupFiles.some(f => enabledSources.includes(f.path))}
          <button
            class="text-xs px-2.5 py-1 rounded border transition-colors
                   {allOn
                     ? 'border-accent/60 bg-accent/10 text-accent hover:bg-red-950/20 hover:text-red-400 hover:border-red-700/40'
                     : someOn
                       ? 'border-yellow-600/60 bg-yellow-950/20 text-yellow-400 hover:border-accent/60 hover:bg-accent/10 hover:text-accent'
                       : 'border-border text-text-muted hover:border-green-700/40 hover:bg-green-950/20 hover:text-green-400'}"
            onclick={() => toggleGroup(groupId)}
            title="{allOn ? 'Disable all' : 'Enable all'} files for: {groupId}"
            type="button"
          >
            {#if allOn}<IconChecked size={11} class="inline mr-0.5" aria-hidden="true" />{/if}{groupId}
          </button>
        {/each}
      </div>
    {/if}

    <!-- Full file list sorted alphabetically — one row per file -->
    {#if availableFiles.length > 0}
      {@const enabledSet = new Set(enabledSources)}
      <div class="flex flex-col gap-1">
        <p class="text-xs font-semibold uppercase tracking-wider text-text-muted mb-0.5">
          All files — {enabledSources.length} / {availableFiles.length} enabled
        </p>
        {#each availableFiles as file}
          {@const on = enabledSet.has(file.path)}
          <div
            class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-all duration-150
                   {on
                     ? 'border-accent/40 bg-surface-alt'
                     : 'border-border bg-surface opacity-50 hover:opacity-80'}"
          >
            <!-- ruleSource badge -->
            <span
              class="shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded
                     {on ? 'bg-accent/15 text-accent' : 'bg-surface-alt text-text-muted'}"
            >{file.ruleSource}</span>

            <!-- File path -->
            <span class="flex-1 text-[10px] font-mono truncate {on ? 'text-text-primary' : 'text-text-muted'}">
              {file.path}
            </span>

            <!-- Entity count -->
            <span class="shrink-0 text-[10px] text-text-muted/70">{file.entityCount}</span>

            <!-- Toggle button -->
            <button
              class="shrink-0 text-[10px] px-2 py-0.5 rounded border transition-colors
                     {on
                       ? 'border-red-700/40 bg-red-950/20 text-red-400 hover:bg-red-900/30'
                       : 'border-green-700/40 bg-green-950/20 text-green-400 hover:bg-green-900/30'}"
              onclick={() => toggleFile(file.path)}
              aria-label="{on ? 'Disable' : 'Enable'} {file.path}"
              type="button"
            >{on ? 'Disable' : 'Enable'}</button>
          </div>
        {/each}
      </div>
    {/if}

    {#if availableFiles.length === 0 && !loadingError}
      <p class="text-xs text-text-muted italic">No rule sources found. Start the PHP API server to load sources.</p>
    {/if}

  </section>

  <!-- ── SECTION 2: DICE RULES ────────────────────────────────────────────── -->
  <section class="card p-5 flex flex-col gap-4">
    <div>
      <h2 class="section-header text-base border-b border-border pb-2">
        🎲 {ui('settings.dice_rules.title', engine.settings.language)}
      </h2>
      <p class="mt-2 text-xs text-text-muted leading-relaxed">
        {ui('settings.dice_rules.desc', engine.settings.language)}
      </p>
    </div>

    <!-- Exploding Twenties -->
    <label class="flex items-start gap-3 cursor-pointer group">
      <div class="mt-0.5 shrink-0">
        <input
          type="checkbox"
          bind:checked={explodingTwenties}
          class="w-4 h-4 accent-accent rounded"
          aria-labelledby="dice-exploding-twenties-label"
        />
      </div>
      <div class="flex flex-col gap-0.5">
        <span id="dice-exploding-twenties-label" class="text-sm font-semibold text-text-primary group-hover:text-accent transition-colors">
          {ui('settings.exploding_twenties', engine.settings.language)}
        </span>
        <span class="text-xs text-text-muted leading-relaxed">
          {ui('settings.exploding_twenties_desc', engine.settings.language)}
        </span>
      </div>
    </label>
  </section>

  <!-- ── SECTION 3: STAT GENERATION ───────────────────────────────────────── -->
  <section class="card p-5 flex flex-col gap-4">
    <div>
      <h2 class="section-header text-base border-b border-border pb-2">
        ⚀ {ui('settings.stat_gen.title', engine.settings.language)}
      </h2>
      <p class="mt-2 text-xs text-text-muted leading-relaxed">
        {ui('settings.stat_gen.desc', engine.settings.language)}
      </p>
    </div>

    <!-- Method selector -->
    <div class="flex flex-col gap-2">
      <span class="text-xs font-semibold uppercase tracking-wider text-text-muted">
        {ui('settings.stat_gen.method', engine.settings.language)}
      </span>
      <div class="flex flex-col gap-1.5">
        {#each ([
          ['roll',           'settings.stat_gen.roll'],
          ['point_buy',      'settings.stat_gen.point_buy'],
          ['standard_array', 'settings.stat_gen.standard_array'],
        ] as const) as [value, key]}
          <label class="flex items-center gap-2.5 cursor-pointer group">
            <input
              type="radio"
              name="stat-gen-method"
              {value}
              bind:group={statMethod}
              class="w-4 h-4 accent-accent shrink-0"
            />
            <span class="text-sm text-text-primary group-hover:text-accent transition-colors">
              {ui(key, engine.settings.language)}
            </span>
          </label>
        {/each}
      </div>
    </div>

    <!-- Reroll Ones — only relevant for roll method -->
    {#if statMethod === 'roll'}
      <label class="flex items-start gap-3 cursor-pointer group">
        <div class="mt-0.5 shrink-0">
          <input
            type="checkbox"
            bind:checked={rerollOnes}
            class="w-4 h-4 accent-accent rounded"
            aria-labelledby="stat-gen-reroll-label"
          />
        </div>
        <div class="flex flex-col gap-0.5">
          <span id="stat-gen-reroll-label" class="text-sm font-semibold text-text-primary group-hover:text-accent transition-colors">
            {ui('settings.stat_gen.reroll_ones', engine.settings.language)}
          </span>
          <span class="text-xs text-text-muted leading-relaxed">
            {ui('settings.stat_gen.reroll_ones_desc', engine.settings.language)}
          </span>
        </div>
      </label>
    {/if}

    <!-- Point Buy Budget — only relevant for point_buy method -->
    {#if statMethod === 'point_buy'}
      <div class="flex flex-col gap-2">
        <label for="point-buy-budget" class="text-xs font-semibold uppercase tracking-wider text-text-muted">
          {ui('settings.stat_gen.budget', engine.settings.language)}
        </label>
        <p class="text-xs text-text-muted -mt-1">
          {ui('settings.stat_gen.budget_desc', engine.settings.language)}
        </p>

        <!-- Preset buttons -->
        <div class="flex flex-wrap gap-2">
          {#each ([
            [15, 'settings.stat_gen.preset_low'],
            [25, 'settings.stat_gen.preset_std'],
            [32, 'settings.stat_gen.preset_high'],
            [40, 'settings.stat_gen.preset_epic'],
          ] as const) as [pts, key]}
            <button
              type="button"
              class="text-xs px-3 py-1 rounded border transition-colors
                     {pointBuyBudget === pts
                       ? 'border-accent bg-accent/15 text-accent'
                       : 'border-border text-text-muted hover:border-accent/50 hover:text-text-primary'}"
              onclick={() => { pointBuyBudget = pts; }}
            >
              {ui(key, engine.settings.language)}
            </button>
          {/each}
        </div>

        <!-- Custom budget input -->
        <div class="flex items-center gap-2">
          <input
            id="point-buy-budget"
            type="number"
            min="1"
            max="999"
            bind:value={pointBuyBudget}
            class="input w-24 text-center text-sm font-bold text-sky-500 dark:text-sky-400"
            aria-label="Point buy budget"
          />
          <span class="text-xs text-text-muted">{ui('common.level', engine.settings.language).toLowerCase()} pts</span>
        </div>
      </div>
    {/if}
  </section>

  <!-- ── SECTION 4: VARIANT RULES (Extensions G + H) ─────────────────────── -->
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

  <!-- ── SECTION 5: GM GLOBAL OVERRIDES ────────────────────────────────────── -->
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
