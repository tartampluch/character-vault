<!--
  @file src/lib/components/settings/RuleSourcesPanel.svelte
  @description Rule Sources panel — draggable enabled list + available (disabled) list.
  Extracted from settings/+page.svelte as part of F1a refactoring.

  Props:
    bind:enabledSources — string[] of relative file paths currently in the load order
-->

<script lang="ts">
  import { sessionContext } from '$lib/engine/SessionContext.svelte';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui, uiN } from '$lib/i18n/ui-strings';
  import { IconSpells, IconError, IconChecked, IconDragHandle } from '$lib/components/ui/icons';

  let { enabledSources = $bindable<string[]>([]) } = $props();

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
      loadingError = `${ui('settings.rule_sources.error', engine.settings.language)}: ${err}`;
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

  // ── Group-color palette — shared utility, deterministic, light & dark aware ──
  import { ruleSourcePalette } from '$lib/utils/ruleSourceColors';
  const groupPalette = ruleSourcePalette;

  /** Enable every available file (adds all to the load order). */
  function enableAllSources() { enabledSources = availableFiles.map(f => f.path); }

  /** Remove every file from the load order. */
  function disableAllSources() { enabledSources = []; }

  let dragSrcIndex = $state<number | null>(null);

  /** Toggle a single file path on/off. */
  function toggleFile(path: string) {
    enabledSources = enabledSources.includes(path)
      ? enabledSources.filter(p => p !== path)
      : [...enabledSources, path];
  }

  /**
   * Enable or disable ALL files belonging to a ruleSource group in one click.
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
</script>

<!-- ── SECTION 1: RULE SOURCE MANAGER ────────────────────────────────────── -->
<section class="card p-5 flex flex-col gap-4">
  <div>
    <h2 class="section-header text-base border-b border-border pb-2">
      <IconSpells size={24} aria-hidden="true" /> {ui('settings.rule_sources.title', engine.settings.language)}
    </h2>
    <p class="mt-2 text-xs text-text-muted leading-relaxed">
      {ui('settings.rule_sources.desc', engine.settings.language)}
    </p>
  </div>

  {#if loadingError}
    <div class="flex items-center gap-2 px-3 py-2 rounded border border-red-700/40 bg-red-950/20 text-red-400 text-xs">
      <IconError size={12} aria-hidden="true" /> {ui('settings.rule_sources.error', engine.settings.language)}: {loadingError}
    </div>
  {/if}

  <!-- Quick group enable/disable buttons -->
  {#if availableGroups.length > 0}
    <div class="flex flex-wrap items-center gap-2 py-1">
      <span class="text-xs text-text-muted self-center shrink-0">{ui('settings.rule_sources.quick_toggle', engine.settings.language)}</span>

      <!-- Global All / None -->
      <button
        type="button"
        class="text-xs px-2.5 py-1 rounded border transition-colors
               border-border text-text-secondary hover:border-green-600/50 hover:bg-green-600/10 hover:text-green-600 dark:hover:border-green-500/50 dark:hover:bg-green-500/10 dark:hover:text-green-400"
        onclick={enableAllSources}
        title={ui('settings.rule_sources.enable_all', engine.settings.language)}
      >{ui('settings.rule_sources.toggle_all', engine.settings.language)}</button>
      <button
        type="button"
        class="text-xs px-2.5 py-1 rounded border transition-colors
               border-border text-text-secondary hover:border-red-600/50 hover:bg-red-600/10 hover:text-red-600 dark:hover:border-red-500/50 dark:hover:bg-red-500/10 dark:hover:text-red-400"
        onclick={disableAllSources}
        title={ui('settings.rule_sources.disable_all', engine.settings.language)}
      >{ui('settings.rule_sources.toggle_none', engine.settings.language)}</button>

      <!-- Separator -->
      <span class="self-stretch w-px bg-border/60 shrink-0 my-0.5" aria-hidden="true"></span>

      <!-- Per-group colored pills -->
      {#each availableGroups as groupId}
        {@const groupFiles = availableFiles.filter(f => f.ruleSource === groupId)}
        {@const allOn = groupFiles.length > 0 && groupFiles.every(f => enabledSources.includes(f.path))}
        {@const someOn = groupFiles.some(f => enabledSources.includes(f.path))}
        {@const gc = groupPalette(groupId)}
        <button
          class="text-xs px-2.5 py-1 rounded border transition-all
                 {allOn ? gc.on : someOn ? gc.partial : gc.off}"
          onclick={() => toggleGroup(groupId)}
          title="{allOn ? ui('settings.rule_sources.disable_all', engine.settings.language) : ui('settings.rule_sources.enable_all', engine.settings.language)} — {groupId}"
          type="button"
        >
          {#if allOn}<IconChecked size={11} class="inline mr-0.5" aria-hidden="true" />{/if}{groupId}
        </button>
      {/each}
    </div>
  {/if}

  <!-- ── Load order — draggable, shows only enabled files in their current order -->
  {#if enabledSources.length > 0}
    <div class="flex flex-col gap-1">
      <p class="text-xs font-semibold uppercase tracking-wider text-text-muted mb-0.5">
        {ui('settings.rule_sources.load_order', engine.settings.language)}
        <span class="normal-case font-normal ml-1">— {enabledSources.length} / {availableFiles.length} {uiN('settings.rule_sources.files', availableFiles.length, engine.settings.language)}</span>
      </p>
      {#each enabledSources as path, i (path)}
        {@const file = availableFiles.find(f => f.path === path)}
        {@const gc   = groupPalette(file?.ruleSource ?? '')}
        <div
          class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-accent/40 bg-surface-alt
                 select-none transition-opacity duration-100 {dragSrcIndex === i ? 'opacity-30' : ''}"
          draggable="true"
          ondragstart={() => handleDragStart(i)}
          ondragover={(e) => handleDragOver(e, i)}
          ondragend={handleDragEnd}
          role="listitem"
          aria-label={ui('settings.drag_reorder_aria', engine.settings.language).replace('{name}', path)}
        >
          <IconDragHandle size={12} class="text-text-muted/50 shrink-0 cursor-grab" aria-hidden="true" />
          <span class="shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded border {gc.on}">
            {file?.ruleSource ?? '?'}
          </span>
          <span class="flex-1 text-[10px] font-mono truncate text-text-primary">{path}</span>
          {#if file}
            <span class="shrink-0 text-[10px] text-text-muted/60">{file.entityCount} {uiN('settings.rule_sources.entities', file.entityCount ?? 0, engine.settings.language)}</span>
          {/if}
          <button
            type="button"
            class="shrink-0 text-[10px] px-2 py-0.5 btn-danger-outline"
            onclick={() => toggleFile(path)}
            aria-label="{ui('settings.rule_sources.disable', engine.settings.language)} {path}"
          >{ui('settings.rule_sources.disable', engine.settings.language)}</button>
        </div>
      {/each}
    </div>
  {/if}

  <!-- ── Available files — only files not yet in the load order -->
  {#if availableFiles.length > 0}
    {@const enabledSet = new Set(enabledSources)}
    {@const disabledFiles = availableFiles.filter(f => !enabledSet.has(f.path))}
    {#if disabledFiles.length > 0}
      <div class="flex flex-col gap-1">
        <p class="text-xs font-semibold uppercase tracking-wider text-text-muted mb-0.5">
          {ui('settings.rule_sources.all_files', engine.settings.language)}
          <span class="normal-case font-normal ml-1">— {disabledFiles.length} / {availableFiles.length} {uiN('settings.rule_sources.files', availableFiles.length, engine.settings.language)}</span>
        </p>
        {#each disabledFiles as file}
          {@const gc = groupPalette(file.ruleSource)}
          <div class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-border bg-surface opacity-50 hover:opacity-80 transition-all duration-150">
            <span class="shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded border {gc.off}">
              {file.ruleSource}
            </span>
            <span class="flex-1 text-[10px] font-mono truncate text-text-muted">{file.path}</span>
            <span class="shrink-0 text-[10px] text-text-muted/70">{file.entityCount} {uiN('settings.rule_sources.entities', file.entityCount ?? 0, engine.settings.language)}</span>
            <button
              class="shrink-0 text-[10px] px-2 py-0.5 rounded border border-green-700/40 bg-green-950/20 text-green-400 hover:bg-green-900/30 transition-colors"
              onclick={() => toggleFile(file.path)}
              aria-label="{ui('settings.rule_sources.enable', engine.settings.language)} {file.path}"
              type="button"
            >{ui('settings.rule_sources.enable', engine.settings.language)}</button>
          </div>
        {/each}
      </div>
    {/if}
  {/if}

  {#if availableFiles.length === 0 && !loadingError}
    <p class="text-xs text-text-muted italic">{ui('settings.rule_sources.none', engine.settings.language)}</p>
  {/if}

</section>
