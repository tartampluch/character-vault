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
  import { apiHeaders } from '$lib/engine/StorageManager';
  import { ui } from '$lib/i18n/ui-strings';
  import { MAIN_ABILITY_IDS, getAbilityAbbr, RESOURCE_HP_ID } from '$lib/utils/constants';
  import { getCharacterLevel } from '$lib/utils/formatters';
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
      if (!Array.isArray(parsed)) { overrideErrors[charId] = ui('gm.must_be_json_array', engine.settings.language); overrideValid[charId] = false; return; }
      overrideErrors[charId] = ''; overrideValid[charId] = true;
    } catch (e: unknown) {
      overrideErrors[charId] = `${ui('gm.syntax_error', engine.settings.language)} ${(e as Error).message}`;
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
        headers: apiHeaders(),
        credentials: 'include',
        body: JSON.stringify({ gmOverrides: overrides }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      // Delegate vault character mutation to the engine (ARCHITECTURE.md §3:
      // all character state writes must go through the GameEngine, not direct
      // property assignment from a route component).
      engine.setCharacterGmOverrides(charId, overrides);
      saveSuccessIds[charId] = ui('gm.saved', engine.settings.language);
      setTimeout(() => { saveSuccessIds[charId] = ''; }, 3000);
    } catch (err) {
      // API unavailable — update local state so the GM sees their changes immediately.
      // Delegate to engine method for the same reason as the success branch above.
      engine.setCharacterGmOverrides(charId, overrides);
      saveSuccessIds[charId] = ui('gm.saved_locally', engine.settings.language);
      setTimeout(() => { saveSuccessIds[charId] = ''; }, 5000);
    } finally {
      savingIds[charId] = false;
    }
  }

  /**
   * Extracts a quick stat snapshot from a character object for the GM overview panel.
   *
   * ZERO-HARDCODING COMPLIANCE (ARCHITECTURE.md §6):
   *   Stat pipeline IDs are resolved via MAIN_ABILITY_IDS constants (centralized in
   *   constants.ts) rather than hardcoded string literals like 'stat_strength'.
   *   MAIN_ABILITY_IDS order: [strength(0), constitution(1), dexterity(2), intelligence(3), ...]
   *
   * NOTE: This function reads from the RAW character data object, not the active
   *   engine's computed pipelines, because the GM dashboard shows all vault characters
   *   (not just the currently loaded one).
   *
   *   `engine.phase3_maxHp` is ONLY used when `char` is the currently active engine
   *   character (verified by ID comparison). For any other character, maxHp falls back
   *   to the raw resource pool value if present, or '?' when unavailable.
   *   (ARCHITECTURE.md §3 — zero-game-logic-in-Svelte: `phase3_maxHp` belongs to the
   *   active engine character; using it for arbitrary vault characters would return
   *   incorrect data when the GM selects a character other than the one last loaded.)
   */
  function getStatSummary(char: typeof engine.character) {
    const attrs = char.attributes ?? {};
    // Use MAIN_ABILITY_IDS constants — avoids hardcoding D&D stat names (ARCHITECTURE.md §6).
    // MAIN_ABILITY_IDS[0] = stat_strength, [1] = stat_constitution, [2] = stat_dexterity
    const strId = MAIN_ABILITY_IDS[0]; // stat_strength
    const conId = MAIN_ABILITY_IDS[1]; // stat_constitution
    const dexId = MAIN_ABILITY_IDS[2]; // stat_dexterity

    // Only use engine.phase3_maxHp when this IS the active engine character.
    // For other vault characters, maxHp cannot be computed without loading them
    // into the engine, so we show '?' to avoid displaying stale/incorrect data.
    // (ARCHITECTURE.md §3 — `engine.phase3_maxHp` belongs to the active character only.)
    const hpPool = char.resources?.[RESOURCE_HP_ID];
    const isActiveChar = engine.character.id === char.id;
    const maxHpValue = hpPool
      ? (isActiveChar ? engine.phase3_maxHp : '?')
      : '?';

    return {
      str:   attrs[strId]?.totalValue ?? attrs[strId]?.baseValue ?? '?',
      dex:   attrs[dexId]?.totalValue ?? attrs[dexId]?.baseValue ?? '?',
      con:   attrs[conId]?.totalValue ?? attrs[conId]?.baseValue ?? '?',
      hp:    hpPool?.currentValue ?? '?',
      maxHp: maxHpValue,
    };
  }

  /**
   * Returns the total character level (sum of class levels) for any character.
   *
   * WHY A HELPER:
   *   The GM dashboard reads from `allVaultCharacters` (arbitrary character objects,
   *   not the active engine character), so `engine.phase0_characterLevel` cannot be
   *   used. Delegates to `getCharacterLevel()` from formatters.ts which centralises
   *   the D&D character-level formula (ARCHITECTURE.md §3 — arithmetic must not be
   *   inline in .svelte templates).
   */
  function getTotalLevel(char: typeof engine.character): number {
    return getCharacterLevel(char.classLevels);
  }
</script>

<div class="flex flex-col h-full overflow-hidden">

  <!-- ── HEADER ───────────────────────────────────────────────────────────── -->
  <header class="flex items-center gap-3 flex-wrap px-4 sm:px-6 py-3 bg-surface-alt border-b border-border shrink-0">
    <a href="/campaigns/{campaignId}" class="inline-flex items-center gap-1 text-xs text-text-muted hover:text-accent transition-colors">
      <IconBack size={12} aria-hidden="true" /> {ui('common.campaign', engine.settings.language)}
    </a>
    <h1 class="flex items-center gap-2 text-lg font-bold text-text-primary flex-1">
      <IconGMDashboard size={18} aria-hidden="true" /> {ui('gm.dashboard', engine.settings.language)}
    </h1>
    <span class="badge-accent flex items-center gap-1 text-xs">
      <IconGMDashboard size={11} aria-hidden="true" /> {ui('gm.view', engine.settings.language)}
    </span>
  </header>

  <!-- ── TWO-COLUMN LAYOUT ─────────────────────────────────────────────────── -->
  <div class="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">

    <!-- ── CHARACTER LIST SIDEBAR ────────────────────────────────────────── -->
    <aside class="md:w-72 shrink-0 flex flex-col border-b md:border-b-0 md:border-r border-border overflow-y-auto max-h-64 md:max-h-none bg-surface-alt">
      <div class="px-3 py-2.5 border-b border-border shrink-0">
        <p class="text-xs font-semibold uppercase tracking-wider text-text-muted">
          {ui('gm.all_characters', engine.settings.language)} ({engine.allVaultCharacters.length})
        </p>
      </div>

      {#if engine.allVaultCharacters.length === 0}
        <p class="px-3 py-4 text-xs text-text-muted italic">{ui('gm.no_characters', engine.settings.language)}</p>
      {:else}
        <div class="flex flex-col p-2 gap-1">
          {#each engine.allVaultCharacters as char}
            {@const isSelected    = selectedCharId === char.id}
            {@const totalLevel    = getTotalLevel(char)}
            {@const hasOverrides  = (char.gmOverrides?.length ?? 0) > 0}

            <button
              class="flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-colors duration-150
                     {isSelected  ? 'border-accent bg-accent/10' : 'border-border bg-surface hover:border-accent/40'}
                     {hasOverrides ? 'border-l-4 border-l-red-500' : ''}"
              onclick={() => (selectedCharId = isSelected ? null : char.id)}
              aria-label="{char.name} — {ui('gm.level_prefix', engine.settings.language)}{totalLevel}{char.isNPC ? ' ' + ui('gm.npc', engine.settings.language) : ''}"
              type="button"
            >
              <div class="flex-1 min-w-0">
                <span class="text-sm font-medium text-text-primary truncate block">{char.name}</span>
                <span class="text-xs text-text-muted flex items-center gap-1">
                  {ui('gm.level_prefix', engine.settings.language)}{totalLevel}
                  {#if char.isNPC}<span class="badge-red text-[9px] py-0">{ui('gm.npc', engine.settings.language)}</span>{/if}
                </span>
              </div>
              {#if hasOverrides}
                <span class="text-red-400 text-xs shrink-0" title="{char.gmOverrides?.length} {ui('gm.override_count', engine.settings.language)}" aria-hidden="true">●</span>
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
          {ui('gm.select_character', engine.settings.language)}
        </div>

      {:else}
        {@const stats = getStatSummary(selectedChar)}

        <!-- Character header -->
        <div class="flex items-center gap-2 border-b border-border pb-3">
          <h2 class="text-lg font-bold text-text-primary flex-1">{selectedChar.name}</h2>
          {#if selectedChar.isNPC}
            <span class="badge-red text-xs">{ui('gm.npc', engine.settings.language)}</span>
          {:else}
            <!-- PC badge: sky-blue tint using Tailwind classes instead of inline oklch -->
            <span class="text-xs font-semibold px-2 py-0.5 rounded-full border bg-sky-900/20 text-sky-400 border-sky-700/40">{ui('gm.pc', engine.settings.language)}</span>
          {/if}
        </div>

        <!-- Read-only stat chips -->
        <section class="card p-4 flex flex-col gap-3">
          <div class="section-header text-xs border-b border-border pb-2">
            <IconStats size={16} aria-hidden="true" />
            <span>{ui('gm.quick_stats', engine.settings.language)}</span>
          </div>
          <div class="flex flex-wrap gap-2">
            {#each [
              { label: getAbilityAbbr(MAIN_ABILITY_IDS[0], engine.settings.language), value: stats.str },
              { label: getAbilityAbbr(MAIN_ABILITY_IDS[2], engine.settings.language), value: stats.dex },
              { label: getAbilityAbbr(MAIN_ABILITY_IDS[1], engine.settings.language), value: stats.con },
              { label: ui('gm.hp_abbr', engine.settings.language),  value: `${stats.hp}/${stats.maxHp}`, accent: true },
              { label: ui('common.level', engine.settings.language), value: getTotalLevel(selectedChar) },
            ] as chip}
              <div class="flex flex-col items-center px-3 py-1.5 rounded-lg border {chip.accent ? 'border-red-700/50' : 'border-border'} bg-surface-alt min-w-[3rem]">
                <span class="text-[10px] uppercase tracking-wider text-text-muted">{chip.label}</span>
                <span class="text-base font-bold text-sky-400">{chip.value}</span>
              </div>
            {/each}
          </div>
          <p class="text-xs text-text-muted">
            {selectedChar.activeFeatures.length} {ui('gm.active_features', engine.settings.language)}
            {#if (selectedChar.gmOverrides?.length ?? 0) > 0}
              · <span class="text-red-400">{selectedChar.gmOverrides?.length} {ui('gm.overrides', engine.settings.language)}</span>
            {/if}
          </p>
        </section>

        <!-- Per-character override editor -->
        <section class="card p-4 flex flex-col gap-3">
          <!-- GM Override header in red-orange accent using Tailwind instead of inline oklch -->
          <div class="section-header text-sm border-b border-border pb-2 text-red-400">
            <IconGMDashboard size={16} aria-hidden="true" />
            <span>{ui('gm.per_char_overrides', engine.settings.language)}</span>
          </div>
          <p class="text-xs text-text-muted leading-relaxed">
            {ui('gm.override_help', engine.settings.language)}
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
                <IconError size={12} aria-hidden="true" /> {ui('gm.invalid_json', engine.settings.language)}
              {:else}
                <IconSuccess size={12} aria-hidden="true" /> {ui('gm.valid_json', engine.settings.language)}
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
              {savingIds[selectedChar.id] ? ui('gm.saving', engine.settings.language) : ui('gm.save_overrides', engine.settings.language)}
            </button>
          </div>
        </section>
      {/if}
    </main>
  </div>
</div>
