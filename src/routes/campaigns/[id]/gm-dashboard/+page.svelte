<!--
  @file src/routes/campaigns/[id]/gm-dashboard/+page.svelte
  @description GM-only Entity Dashboard — view all characters, edit per-character overrides.
  Phase 19.12: Migrated to Tailwind CSS — all scoped <style> removed.

  LAYOUT:
    Desktop (≥768px): sidebar list (280px) | detail panel (flex-1).
    Mobile (<768px): stacked — character list then detail below.
    Sidebar: scrollable character list. Detail: read-only stat cards + JSON override editor.
-->

<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { sessionContext } from '$lib/engine/SessionContext.svelte';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { IconGMDashboard, IconStats, IconSuccess, IconError, IconBack } from '$lib/components/ui/icons';

  $effect(() => { if (!sessionContext.isGameMaster) goto(`/campaigns/${campaignId}`); });

  const campaignId = $derived($page.params.id ?? '');

  $effect(() => { if (sessionContext.isGameMaster) engine.loadVaultCharacters(); });

  let selectedCharId = $state<string | null>(null);
  const selectedChar = $derived(
    selectedCharId ? engine.allVaultCharacters.find(c => c.id === selectedCharId) : undefined
  );

  let overrideTexts  = $state<Record<string, string>>({});
  let overrideErrors = $state<Record<string, string>>({});
  let overrideValid  = $state<Record<string, boolean>>({});

  function getOverrideText(charId: string): string {
    if (!(charId in overrideTexts)) {
      const char = engine.allVaultCharacters.find(c => c.id === charId);
      overrideTexts[charId] = JSON.stringify(char?.gmOverrides ?? [], null, 2);
    }
    return overrideTexts[charId];
  }

  function setOverrideText(charId: string, text: string) {
    overrideTexts[charId] = text;
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) { overrideErrors[charId] = 'Must be a JSON array.'; overrideValid[charId] = false; return; }
      overrideErrors[charId] = ''; overrideValid[charId] = true;
    } catch (e: unknown) {
      overrideErrors[charId] = `Syntax error: ${(e as Error).message}`;
      overrideValid[charId] = false;
    }
  }

  let savingIds     = $state<Record<string, boolean>>({});
  let saveSuccessIds = $state<Record<string, string>>({});

  async function saveGmOverrides(charId: string) {
    if (!overrideValid[charId]) return;
    savingIds[charId] = true; saveSuccessIds[charId] = '';
    const overrides = JSON.parse(overrideTexts[charId]);
    try {
      const response = await fetch(`/api/characters/${charId}/gm-overrides`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ gmOverrides: overrides }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const char = engine.allVaultCharacters.find(c => c.id === charId);
      if (char) char.gmOverrides = overrides;
      saveSuccessIds[charId] = 'Saved!';
      setTimeout(() => { saveSuccessIds[charId] = ''; }, 3000);
    } catch (err) {
      const char = engine.allVaultCharacters.find(c => c.id === charId);
      if (char) char.gmOverrides = overrides;
      saveSuccessIds[charId] = 'Saved locally (API unavailable).';
      setTimeout(() => { saveSuccessIds[charId] = ''; }, 5000);
    } finally {
      savingIds[charId] = false;
    }
  }

  function getStatSummary(char: typeof engine.character) {
    const attrs = char.attributes ?? {};
    return {
      str:   attrs['stat_str']?.totalValue ?? attrs['stat_str']?.baseValue ?? '?',
      dex:   attrs['stat_dex']?.totalValue ?? attrs['stat_dex']?.baseValue ?? '?',
      con:   attrs['stat_con']?.totalValue ?? attrs['stat_con']?.baseValue ?? '?',
      hp:    char.resources?.['resources.hp']?.currentValue ?? '?',
      maxHp: char.resources?.['resources.hp'] ? engine.phase3_maxHp : '?',
    };
  }
</script>

<div class="flex flex-col h-full overflow-hidden">

  <!-- ── HEADER ───────────────────────────────────────────────────────────── -->
  <header class="flex items-center gap-3 flex-wrap px-4 sm:px-6 py-3 bg-surface-alt border-b border-border shrink-0">
    <a href="/campaigns/{campaignId}" class="inline-flex items-center gap-1 text-xs text-text-muted hover:text-accent transition-colors">
      <IconBack size={12} aria-hidden="true" /> Campaign
    </a>
    <h1 class="flex items-center gap-2 text-lg font-bold text-text-primary flex-1">
      <IconGMDashboard size={18} aria-hidden="true" /> GM Dashboard
    </h1>
    <span class="badge-accent flex items-center gap-1 text-xs">
      <IconGMDashboard size={11} aria-hidden="true" /> GM View
    </span>
  </header>

  <!-- ── TWO-COLUMN LAYOUT ─────────────────────────────────────────────────── -->
  <div class="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">

    <!-- ── CHARACTER LIST SIDEBAR ────────────────────────────────────────── -->
    <aside class="md:w-72 shrink-0 flex flex-col border-b md:border-b-0 md:border-r border-border overflow-y-auto max-h-64 md:max-h-none bg-surface-alt">
      <div class="px-3 py-2.5 border-b border-border shrink-0">
        <p class="text-xs font-semibold uppercase tracking-wider text-text-muted">
          All Characters ({engine.allVaultCharacters.length})
        </p>
      </div>

      {#if engine.allVaultCharacters.length === 0}
        <p class="px-3 py-4 text-xs text-text-muted italic">No characters in this campaign yet.</p>
      {:else}
        <div class="flex flex-col p-2 gap-1">
          {#each engine.allVaultCharacters as char}
            {@const isSelected    = selectedCharId === char.id}
            {@const totalLevel    = Object.values(char.classLevels).reduce((a,b) => a+b, 0)}
            {@const hasOverrides  = (char.gmOverrides?.length ?? 0) > 0}

            <button
              class="flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-colors duration-150
                     {isSelected  ? 'border-accent bg-accent/10' : 'border-border bg-surface hover:border-accent/40'}
                     {hasOverrides ? 'border-l-4 border-l-red-500' : ''}"
              onclick={() => (selectedCharId = isSelected ? null : char.id)}
              aria-label="{char.name} — Level {totalLevel}{char.isNPC ? ' (NPC)' : ''}"
              type="button"
            >
              <div class="flex-1 min-w-0">
                <span class="text-sm font-medium text-text-primary truncate block">{char.name}</span>
                <span class="text-xs text-text-muted flex items-center gap-1">
                  Lv.{totalLevel}
                  {#if char.isNPC}<span class="badge-red text-[9px] py-0">NPC</span>{/if}
                </span>
              </div>
              {#if hasOverrides}
                <span class="text-red-400 text-xs shrink-0" title="{char.gmOverrides?.length} override(s)" aria-hidden="true">●</span>
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    </aside>

    <!-- ── CHARACTER DETAIL + OVERRIDE EDITOR ────────────────────────────── -->
    <main class="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-4">
      {#if !selectedChar}
        <div class="flex items-center justify-center h-48 text-text-muted text-sm italic">
          ← Select a character to view their stats and edit GM overrides.
        </div>

      {:else}
        {@const stats = getStatSummary(selectedChar)}

        <!-- Character header -->
        <div class="flex items-center gap-2 border-b border-border pb-3">
          <h2 class="text-lg font-bold text-text-primary flex-1">{selectedChar.name}</h2>
          {#if selectedChar.isNPC}
            <span class="badge-red text-xs">NPC</span>
          {:else}
            <span class="badge-gray text-xs" style="color: oklch(70% 0.14 220); border-color: oklch(40% 0.10 220)40;">PC</span>
          {/if}
        </div>

        <!-- Read-only stat chips -->
        <section class="card p-4 flex flex-col gap-3">
          <div class="section-header text-xs border-b border-border pb-2">
            <IconStats size={16} aria-hidden="true" />
            <span>Quick Stats (read-only)</span>
          </div>
          <div class="flex flex-wrap gap-2">
            {#each [
              { label: 'STR', value: stats.str },
              { label: 'DEX', value: stats.dex },
              { label: 'CON', value: stats.con },
              { label: 'HP',  value: `${stats.hp}/${stats.maxHp}`, accent: true },
              { label: 'Level', value: Object.values(selectedChar.classLevels).reduce((a,b) => a+b, 0) },
            ] as chip}
              <div class="flex flex-col items-center px-3 py-1.5 rounded-lg border {chip.accent ? 'border-red-700/50' : 'border-border'} bg-surface-alt min-w-[3rem]">
                <span class="text-[10px] uppercase tracking-wider text-text-muted">{chip.label}</span>
                <span class="text-base font-bold text-sky-400">{chip.value}</span>
              </div>
            {/each}
          </div>
          <p class="text-xs text-text-muted">
            {selectedChar.activeFeatures.length} active features
            {#if (selectedChar.gmOverrides?.length ?? 0) > 0}
              · <span class="text-red-400">{selectedChar.gmOverrides?.length} GM override{(selectedChar.gmOverrides?.length ?? 0) !== 1 ? 's' : ''}</span>
            {/if}
          </p>
        </section>

        <!-- Per-character override editor -->
        <section class="card p-4 flex flex-col gap-3">
          <div class="section-header text-sm border-b border-border pb-2" style="color: oklch(65% 0.20 28);">
            <IconGMDashboard size={16} aria-hidden="true" />
            <span>Per-Character GM Overrides</span>
          </div>
          <p class="text-xs text-text-muted leading-relaxed">
            Array of <code class="bg-surface-alt px-1 rounded">ActiveFeatureInstance</code> objects applied LAST in the resolution chain.
            Each entry needs <code class="bg-surface-alt px-1 rounded">instanceId</code>, <code class="bg-surface-alt px-1 rounded">featureId</code>, <code class="bg-surface-alt px-1 rounded">isActive</code>.
          </p>

          {#if overrideErrors[selectedChar.id]}
            <div class="flex items-center gap-2 px-3 py-2 rounded border border-red-700/40 bg-red-950/20 text-red-400 text-xs font-mono">
              <IconError size={12} aria-hidden="true" /> {overrideErrors[selectedChar.id]}
            </div>
          {/if}

          <textarea
            class="w-full rounded-lg border px-3 py-2 font-mono text-xs leading-relaxed resize-vertical
                   bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50
                   {overrideValid[selectedChar.id] === false ? 'border-red-600 bg-red-950/10' : 'border-border focus:border-accent'}"
            value={getOverrideText(selectedChar.id)}
            oninput={(e) => setOverrideText(selectedChar.id, (e.target as HTMLTextAreaElement).value)}
            spellcheck="false"
            rows="10"
            aria-label="GM overrides for {selectedChar.name}"
          ></textarea>

          <div class="flex items-center gap-3 flex-wrap">
            <span class="flex items-center gap-1 text-xs flex-1
                         {overrideValid[selectedChar.id] === false ? 'text-red-400' : 'text-green-400'}">
              {#if overrideValid[selectedChar.id] === false}
                <IconError size={12} aria-hidden="true" /> Invalid JSON
              {:else}
                <IconSuccess size={12} aria-hidden="true" /> Valid JSON
              {/if}
            </span>

            {#if saveSuccessIds[selectedChar.id]}
              <span class="text-xs text-green-400">{saveSuccessIds[selectedChar.id]}</span>
            {/if}

            <button
              class="btn-primary shrink-0"
              onclick={() => saveGmOverrides(selectedChar.id)}
              disabled={savingIds[selectedChar.id] || overrideValid[selectedChar.id] === false}
              aria-label="Save GM overrides for {selectedChar.name}"
              type="button"
            >
              {savingIds[selectedChar.id] ? 'Saving…' : 'Save Overrides'}
            </button>
          </div>
        </section>
      {/if}
    </main>
  </div>
</div>
