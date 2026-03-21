<!--
  @file src/routes/campaigns/[id]/gm-dashboard/+page.svelte
  @description GM-only Entity Dashboard — view all characters and manage per-character overrides.

  ARCHITECTURE.md Phase 15.3:
    GM-exclusive page (navigation guard redirects non-GMs).

    FEATURES:
      1. List of ALL characters, NPCs, and monsters in the campaign.
      2. Clicking a character shows a read-only summary (key stats, active effects, current HP).
      3. Below the summary: JSON text area for GM per-character overrides.
      4. Same JSON validator as in Settings page (Phase 15.2).
      5. Saving per-character overrides via PUT /api/characters/{id}/gm-overrides.

    PER-CHARACTER OVERRIDES:
      Stored in Character.gmOverrides (as ActiveFeatureInstance[]).
      Applied LAST in the resolution chain (after global overrides).
      These override any game rule — GMs use them to secretly buff/nerf players.

    OVERRIDE RESOLUTION CHAIN (Phase 15.4 documented here):
      1. Rule source files (alphabetical, enabledRuleSources filter)
      2. Campaign.gmGlobalOverrides (after all files)
      3. Character.gmOverrides (last, per-character — this page)

  @see src/routes/campaigns/[id]/settings/+page.svelte for the campaign-level overrides.
  @see ARCHITECTURE.md Phase 15.3-15.4 for the full specification.
-->

<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { sessionContext } from '$lib/engine/SessionContext.svelte';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { IconGMDashboard, IconStats, IconSuccess, IconError } from '$lib/components/ui/icons';

  // ============================================================
  // NAVIGATION GUARD — GM-only page
  // ============================================================

  $effect(() => {
    if (!sessionContext.isGameMaster) {
      goto(`/campaigns/${campaignId}`);
    }
  });

  const campaignId = $derived($page.params.id);

  // ============================================================
  // CHARACTER LIST
  // ============================================================

  $effect(() => {
    if (sessionContext.isGameMaster) {
      engine.loadVaultCharacters();
    }
  });

  /** Selected character for editing (null = none selected). */
  let selectedCharId = $state<string | null>(null);

  const selectedChar = $derived(
    selectedCharId ? engine.allVaultCharacters.find(c => c.id === selectedCharId) : undefined
  );

  // ============================================================
  // PER-CHARACTER OVERRIDE EDITOR
  // ============================================================

  /**
   * Override text per character ID (local state while editing).
   * Each character gets its own text area state.
   */
  let overrideTexts = $state<Record<string, string>>({});

  /**
   * JSON validation state per character.
   */
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
    validateOverride(charId, text);
  }

  function validateOverride(charId: string, text: string) {
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        overrideErrors[charId] = 'Must be a JSON array.';
        overrideValid[charId] = false;
        return;
      }
      overrideErrors[charId] = '';
      overrideValid[charId] = true;
    } catch (e: unknown) {
      overrideErrors[charId] = `Syntax error: ${(e as Error).message}`;
      overrideValid[charId] = false;
    }
  }

  // ============================================================
  // SAVE GM OVERRIDES
  // ============================================================

  let savingIds = $state<Record<string, boolean>>({});
  let saveSuccessIds = $state<Record<string, string>>({});

  async function saveGmOverrides(charId: string) {
    if (!overrideValid[charId]) return;
    savingIds[charId] = true;
    saveSuccessIds[charId] = '';

    const overrides = JSON.parse(overrideTexts[charId]);

    try {
      const response = await fetch(`/api/characters/${charId}/gm-overrides`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ gmOverrides: overrides }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      // Update local character in vault
      const char = engine.allVaultCharacters.find(c => c.id === charId);
      if (char) char.gmOverrides = overrides;

      saveSuccessIds[charId] = 'Saved!';
      setTimeout(() => { saveSuccessIds[charId] = ''; }, 3000);
    } catch (err) {
      // Fallback: update local character
      const char = engine.allVaultCharacters.find(c => c.id === charId);
      if (char) char.gmOverrides = overrides;
      saveSuccessIds[charId] = 'Saved locally (API unavailable).';
      setTimeout(() => { saveSuccessIds[charId] = ''; }, 5000);
    } finally {
      savingIds[charId] = false;
    }
  }

  /** Gets a short stat summary for the read-only character view. */
  function getStatSummary(char: typeof engine.character) {
    const attrs = char.attributes ?? {};
    const str = attrs['stat_str']?.totalValue ?? attrs['stat_str']?.baseValue ?? '?';
    const dex = attrs['stat_dex']?.totalValue ?? attrs['stat_dex']?.baseValue ?? '?';
    const con = attrs['stat_con']?.totalValue ?? attrs['stat_con']?.baseValue ?? '?';
    const hp = char.resources?.['resources.hp']?.currentValue ?? '?';
    const maxHp = char.resources?.['resources.hp'] ? engine.phase3_maxHp : '?';
    return { str, dex, con, hp, maxHp };
  }
</script>

<div class="dashboard-page">
  <!-- ========================================================= -->
  <!-- HEADER -->
  <!-- ========================================================= -->
  <header class="page-header">
    <a href="/campaigns/{campaignId}" class="back-link">← Campaign</a>
     <h1 class="page-title"><IconGMDashboard size={24} aria-hidden="true" /> GM Dashboard</h1>
    <span class="gm-badge">GM View</span>
  </header>

  <div class="dashboard-layout">

    <!-- ========================================================= -->
    <!-- LEFT: CHARACTER LIST -->
    <!-- ========================================================= -->
    <aside class="char-list">
      <h2 class="list-title">All Characters ({engine.allVaultCharacters.length})</h2>

      {#if engine.allVaultCharacters.length === 0}
        <p class="empty-note">No characters in this campaign yet.</p>
      {:else}
        {#each engine.allVaultCharacters as char}
          {@const isSelected = selectedCharId === char.id}
          {@const totalLevel = Object.values(char.classLevels).reduce((a,b) => a+b, 0)}
          {@const hasOverrides = (char.gmOverrides?.length ?? 0) > 0}

          <button
            class="char-item"
            class:selected={isSelected}
            class:has-overrides={hasOverrides}
            class:is-npc={char.isNPC}
            onclick={() => (selectedCharId = isSelected ? null : char.id)}
            aria-label="{char.name} — Level {totalLevel}{char.isNPC ? ' (NPC)' : ''}"
          >
            <div class="char-item-info">
              <span class="char-item-name">{char.name}</span>
              <span class="char-item-meta">
                Lv.{totalLevel}
                {#if char.isNPC}<span class="npc-tag">NPC</span>{/if}
              </span>
            </div>
            {#if hasOverrides}
              <span class="override-dot" title="{char.gmOverrides?.length} GM override(s) active" aria-hidden="true">●</span>
            {/if}
          </button>
        {/each}
      {/if}
    </aside>

    <!-- ========================================================= -->
    <!-- RIGHT: CHARACTER DETAIL + OVERRIDE EDITOR -->
    <!-- ========================================================= -->
    <main class="char-detail">
      {#if !selectedChar}
        <div class="no-selection">
          <p>← Select a character to view their stats and edit GM overrides.</p>
        </div>
      {:else}
        {@const stats = getStatSummary(selectedChar)}

        <!-- CHARACTER HEADER -->
        <div class="detail-header">
          <h2 class="detail-name">{selectedChar.name}</h2>
          {#if selectedChar.isNPC}
            <span class="npc-badge">NPC</span>
          {:else}
            <span class="pc-badge">PC</span>
          {/if}
        </div>

        <!-- READ-ONLY SUMMARY -->
        <section class="summary-section">
           <h3 class="summary-title"><IconStats size={20} aria-hidden="true" /> Quick Stats (read-only)</h3>
          <div class="stat-chips">
            <div class="stat-chip">
              <span class="stat-chip-label">STR</span>
              <span class="stat-chip-value">{stats.str}</span>
            </div>
            <div class="stat-chip">
              <span class="stat-chip-label">DEX</span>
              <span class="stat-chip-value">{stats.dex}</span>
            </div>
            <div class="stat-chip">
              <span class="stat-chip-label">CON</span>
              <span class="stat-chip-value">{stats.con}</span>
            </div>
            <div class="stat-chip hp-chip">
              <span class="stat-chip-label">HP</span>
              <span class="stat-chip-value">{stats.hp}/{stats.maxHp}</span>
            </div>
            <div class="stat-chip">
              <span class="stat-chip-label">Level</span>
              <span class="stat-chip-value">{Object.values(selectedChar.classLevels).reduce((a,b) => a+b, 0)}</span>
            </div>
          </div>
          <div class="active-features-count">
            {selectedChar.activeFeatures.length} active features
            {#if (selectedChar.gmOverrides?.length ?? 0) > 0}
              · <span class="override-count">{selectedChar.gmOverrides?.length} GM override{(selectedChar.gmOverrides?.length ?? 0) !== 1 ? 's' : ''}</span>
            {/if}
          </div>
        </section>

        <!-- PER-CHARACTER GM OVERRIDES EDITOR -->
        <section class="override-section">
           <h3 class="override-title"><IconGMDashboard size={20} aria-hidden="true" /> Per-Character GM Overrides</h3>
          <p class="override-desc">
            Array of <code>ActiveFeatureInstance</code> objects applied LAST in the resolution chain.
            Each entry needs <code>instanceId</code>, <code>featureId</code>, <code>isActive</code>.
            The referenced Features must be defined in the Global Overrides or a rule source.
          </p>

          {#if overrideErrors[selectedChar.id]}
            <div class="json-error">{overrideErrors[selectedChar.id]}</div>
          {/if}

          <textarea
            class="override-textarea"
            class:has-error={overrideValid[selectedChar.id] === false}
            value={getOverrideText(selectedChar.id)}
            oninput={(e) => setOverrideText(selectedChar.id, (e.target as HTMLTextAreaElement).value)}
            spellcheck="false"
            rows="12"
            aria-label="GM overrides for {selectedChar.name}"
          ></textarea>

          <div class="override-actions">
            <span class="json-status" class:valid={overrideValid[selectedChar.id] !== false} class:invalid={overrideValid[selectedChar.id] === false}>
               {#if overrideValid[selectedChar.id] === false}<IconError size={14} aria-hidden="true" /> Invalid JSON{:else}<IconSuccess size={14} aria-hidden="true" /> Valid JSON{/if}
            </span>

            {#if saveSuccessIds[selectedChar.id]}
              <span class="save-success">{saveSuccessIds[selectedChar.id]}</span>
            {/if}

            <button
              class="btn-save-overrides"
              onclick={() => saveGmOverrides(selectedChar.id)}
              disabled={savingIds[selectedChar.id] || overrideValid[selectedChar.id] === false}
              aria-label="Save GM overrides for {selectedChar.name}"
            >
               {savingIds[selectedChar.id] ? 'Saving...' : 'Save Overrides'}
            </button>
          </div>
        </section>
      {/if}
    </main>
  </div>
</div>

<style>
  .dashboard-page {
    min-height: 100vh;
    background: #0d1117;
    color: #e0e0e0;
    font-family: 'Segoe UI', system-ui, sans-serif;
    display: flex;
    flex-direction: column;
  }

  /* ========================= HEADER ========================= */
  .page-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem 1.5rem;
    background: #161b22;
    border-bottom: 1px solid #21262d;
    flex-wrap: wrap;
  }

  .back-link { font-size: 0.8rem; color: #6080a0; text-decoration: none; }
  .back-link:hover { color: #c4b5fd; }
  .page-title { margin: 0; font-size: 1.4rem; color: #f0f0ff; flex: 1; }
  .gm-badge {
    font-size: 0.72rem;
    background: #1c1a3a;
    color: #c4b5fd;
    border: 1px solid #4c35a0;
    border-radius: 4px;
    padding: 0.15rem 0.5rem;
  }

  /* ========================= LAYOUT ========================= */
  .dashboard-layout {
    display: grid;
    grid-template-columns: 280px 1fr;
    flex: 1;
    min-height: 0;
  }

  /* ========================= CHAR LIST ========================= */
  .char-list {
    background: #161b22;
    border-right: 1px solid #21262d;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    overflow-y: auto;
  }

  .list-title {
    margin: 0;
    font-size: 0.82rem;
    color: #6080a0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding-bottom: 0.4rem;
    border-bottom: 1px solid #21262d;
  }

  .empty-note { font-size: 0.8rem; color: #4a4a6a; font-style: italic; }

  .char-item {
    background: #0d1117;
    border: 1px solid #21262d;
    border-radius: 6px;
    padding: 0.5rem 0.65rem;
    text-align: left;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    transition: border-color 0.15s;
    color: inherit;
    font-family: inherit;
  }

  .char-item:hover { border-color: #4c35a0; }
  .char-item.selected { border-color: #7c3aed; background: #1c1a3a; }
  .char-item.has-overrides { border-left: 3px solid #f87171; }
  .char-item.is-npc { border-left-color: #7f1d1d; }

  .char-item-info { flex: 1; display: flex; flex-direction: column; gap: 0.05rem; }
  .char-item-name { font-size: 0.88rem; color: #e0e0f0; font-weight: 500; }
  .char-item-meta { font-size: 0.72rem; color: #6080a0; display: flex; align-items: center; gap: 0.25rem; }

  .npc-tag {
    background: #7f1d1d;
    color: #fca5a5;
    border-radius: 3px;
    padding: 0.05rem 0.3rem;
    font-size: 0.65rem;
    text-transform: uppercase;
  }

  .override-dot { color: #f87171; font-size: 0.7rem; flex-shrink: 0; }

  /* ========================= CHAR DETAIL ========================= */
  .char-detail {
    padding: 1.25rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .no-selection {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 200px;
    color: #4a4a6a;
    font-style: italic;
    font-size: 0.9rem;
  }

  .detail-header {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    border-bottom: 1px solid #21262d;
    padding-bottom: 0.6rem;
  }

  .detail-name { margin: 0; font-size: 1.2rem; color: #f0f0ff; }

  .npc-badge, .pc-badge {
    font-size: 0.65rem;
    padding: 0.15rem 0.45rem;
    border-radius: 4px;
    font-weight: bold;
    text-transform: uppercase;
  }

  .npc-badge { background: #7f1d1d; color: #fca5a5; }
  .pc-badge  { background: #1e3a6a; color: #93c5fd; }

  /* ========================= SUMMARY ========================= */
  .summary-section {
    background: #161b22;
    border: 1px solid #21262d;
    border-radius: 8px;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .summary-title {
    margin: 0;
    font-size: 0.82rem;
    color: #c4b5fd;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .stat-chips { display: flex; flex-wrap: wrap; gap: 0.4rem; }

  .stat-chip {
    background: #0d1117;
    border: 1px solid #21262d;
    border-radius: 4px;
    padding: 0.2rem 0.5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0;
    min-width: 2.5rem;
  }

  .hp-chip { border-color: #7f1d1d; }

  .stat-chip-label { font-size: 0.65rem; color: #4a4a6a; text-transform: uppercase; }
  .stat-chip-value { font-size: 0.9rem; font-weight: bold; color: #7dd3fc; }

  .active-features-count { font-size: 0.75rem; color: #4a4a6a; }
  .override-count { color: #f87171; }

  /* ========================= OVERRIDE EDITOR ========================= */
  .override-section {
    background: #161b22;
    border: 1px solid #21262d;
    border-radius: 8px;
    padding: 0.85rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .override-title { margin: 0; font-size: 0.9rem; color: #f87171; }

  .override-desc {
    font-size: 0.78rem;
    color: #6080a0;
    line-height: 1.5;
    margin: 0;
  }

  .override-desc code { background: #0d1117; padding: 0.1rem 0.3rem; border-radius: 3px; font-size: 0.78rem; }

  .json-error {
    background: #1c0000;
    color: #f87171;
    border: 1px solid #7f1d1d;
    border-radius: 4px;
    padding: 0.3rem 0.6rem;
    font-size: 0.8rem;
    font-family: monospace;
  }

  .override-textarea {
    width: 100%;
    box-sizing: border-box;
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    color: #c9d1d9;
    font-family: 'Courier New', monospace;
    font-size: 0.8rem;
    line-height: 1.55;
    padding: 0.6rem;
    resize: vertical;
  }

  .override-textarea:focus { outline: none; border-color: #7c3aed; }
  .override-textarea.has-error { border-color: #dc2626; }

  .override-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .json-status { font-size: 0.78rem; flex: 1; }
  .json-status.valid { color: #4ade80; }
  .json-status.invalid { color: #f87171; }

  .save-success { font-size: 0.78rem; color: #4ade80; }

  .btn-save-overrides {
    background: #7c3aed;
    color: #fff;
    border: none;
    border-radius: 6px;
    padding: 0.4rem 0.9rem;
    font-size: 0.82rem;
    cursor: pointer;
    flex-shrink: 0;
  }
  .btn-save-overrides:hover:not(:disabled) { background: #6d28d9; }
  .btn-save-overrides:disabled { opacity: 0.5; cursor: not-allowed; }

  /* ========================= RESPONSIVE ========================= */
  @media (max-width: 700px) {
    .dashboard-layout { grid-template-columns: 1fr; }
    .char-list { border-right: none; border-bottom: 1px solid #21262d; max-height: 200px; }
  }
</style>
