<!--
  @file src/routes/character/[id]/+page.svelte
  @description The character sheet container with tabbed navigation.

  PURPOSE:
    This is the main character sheet page. It:
      1. Loads the character from localStorage using the URL `[id]` parameter.
      2. Provides a persistent tabbed navigation: Core | Abilities | Combat | Feats | Inventory.
         Optional future tabs: Magic, Notes.
      3. Renders the selected tab's content in the main area.
      4. The tab state is driven by the `?tab=` URL query parameter, not local state.
         This allows deep-linking ("Share your character sheet open on the Combat tab").

  NAVIGATION (tabs via query parameter):
    /character/[id]              → default: core tab
    /character/[id]?tab=core     → Phase 8 (Core summary)
    /character/[id]?tab=abilities → Phase 9 (Abilities & Skills)
    /character/[id]?tab=combat   → Phase 10 (Combat)
    /character/[id]?tab=feats    → Phase 11 (Feats)
    /character/[id]?tab=magic    → Phase 12 (Spells & Powers)
    /character/[id]?tab=inventory → Phase 13 (Inventory)

    WHY QUERY PARAMS AND NOT SUB-ROUTES?
    Per ARCHITECTURE.md section 20: "Character sheet tabs use a query parameter
    `?tab=` rather than sub-routes, to keep the same parent layout and avoid
    reloading the `GameEngine` on tab change."

  CHARACTER LOADING:
    On mount, reads `[id]` from the URL. If the character is in `engine.allVaultCharacters`,
    loads it into `engine.character`. If not (direct URL access), loads from localStorage
    via `storageManager.loadCharacter(id)` and injets it into the engine.

  ARCHITECTURE:
    "Dumb" page pattern — only reads engine state and dispatches actions.
    No game logic lives here. All computation is in GameEngine.$derived.

  @see src/lib/engine/GameEngine.svelte.ts for the character engine.
  @see src/lib/engine/StorageManager.ts for persistence.
  @see ARCHITECTURE.md section 20 for the routing specification.
-->

<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { engine, createEmptyCharacter } from '$lib/engine/GameEngine.svelte';
  import { storageManager } from '$lib/engine/StorageManager';
  import BasicInfo from '$lib/components/core/BasicInfo.svelte';
  import AbilityScoresSummary from '$lib/components/core/AbilityScoresSummary.svelte';
  import SavingThrowsSummary from '$lib/components/core/SavingThrowsSummary.svelte';
  import SkillsSummary from '$lib/components/core/SkillsSummary.svelte';
  import LoreAndLanguages from '$lib/components/core/LoreAndLanguages.svelte';

  // ============================================================
  // TABS DEFINITION
  // The tab list is data-driven — no hardcoded D&D terms.
  // Each tab has a `key` (used in the URL param) and a `label` for display.
  // ============================================================

  const TABS = [
    { key: 'core',      label: '📋 Core',       phase: 8  },
    { key: 'abilities', label: '💪 Abilities',   phase: 9  },
    { key: 'combat',    label: '⚔️ Combat',      phase: 10 },
    { key: 'feats',     label: '🌟 Feats',       phase: 11 },
    { key: 'magic',     label: '✨ Magic',        phase: 12 },
    { key: 'inventory', label: '🎒 Inventory',    phase: 13 },
  ] as const;

  type TabKey = (typeof TABS)[number]['key'];

  // ============================================================
  // DERIVED STATE from the URL
  // ============================================================

  /** The character ID from the URL route parameter. */
  const characterId = $derived($page.params.id);

  /** The active tab key from the `?tab=` query parameter. Defaults to 'core'. */
  const activeTab = $derived<TabKey>(
    ($page.url.searchParams.get('tab') as TabKey) ?? 'core'
  );

  // ============================================================
  // CHARACTER LOADING
  // ============================================================

  /**
   * Loads the character when this page is mounted or the ID changes.
   *
   * STRATEGY:
   *   1. Check if the character is already in the vault's in-memory list.
   *   2. If not, load from localStorage.
   *   3. If neither, create an empty character as a fallback (graceful degradation).
   *
   * In Phase 14.6 (PHP API): replace with `GET /api/characters/:id`.
   */
  $effect(() => {
    const id = characterId;
    if (!id) return;

    // Check vault in-memory first (fast path — no I/O)
    const fromVault = engine.allVaultCharacters.find(c => c.id === id);
    if (fromVault) {
      engine.loadCharacter(fromVault);
      return;
    }

    // Fallback: load from localStorage
    const fromStorage = storageManager.loadCharacter(id);
    if (fromStorage) {
      engine.loadCharacter(fromStorage);
      // Also add to vault list so future navigations use the fast path
      if (!engine.allVaultCharacters.some(c => c.id === id)) {
        engine.allVaultCharacters.push(fromStorage);
      }
      return;
    }

    // Last resort: character not found — create a blank one with this ID
    // This handles direct URL access for characters not yet saved
    console.warn(`[CharacterSheet] Character "${id}" not found. Creating blank.`);
    const blank = createEmptyCharacter(id, 'Unknown Character');
    engine.loadCharacter(blank);
  });

  // ============================================================
  // TAB NAVIGATION
  // ============================================================

  /**
   * Switches to a tab by updating the URL query parameter.
   * Using `goto()` with `?tab=X` preserves the character ID in the URL.
   * `replaceState: true` prevents cluttering the browser history with tab changes.
   */
  function switchTab(tabKey: TabKey) {
    goto(`/character/${characterId}?tab=${tabKey}`, { replaceState: true });
  }

  // ============================================================
  // TAB CONTENT SELECTION
  // (Future phases will import actual tab components — for now, placeholders)
  // ============================================================

  /** Returns a status label indicating which phase implements this tab. */
  function getTabStatus(tabKey: TabKey): string {
    const tab = TABS.find(t => t.key === tabKey);
    return tab ? `Phase ${tab.phase}` : '';
  }
</script>

<div class="character-sheet">
  <!-- ========================================================= -->
  <!-- CHARACTER HEADER -->
  <!-- ========================================================= -->
  <header class="sheet-header">
    <div class="header-left">
      <!-- Back navigation: return to the campaign vault if we know it -->
      {#if engine.character.campaignId}
        <a
          href="/campaigns/{engine.character.campaignId}/vault"
          class="back-link"
          aria-label="Back to Character Vault"
        >
          ← Vault
        </a>
      {:else}
        <a href="/campaigns" class="back-link" aria-label="Back to campaigns">
          ← Campaigns
        </a>
      {/if}

      <!-- Character name (inline editable in a future phase) -->
      <h1 class="char-name">
        {engine.character.name}
        {#if engine.character.isNPC}
          <span class="npc-label" aria-label="Non-player character">NPC</span>
        {/if}
      </h1>

      <!-- Character level summary -->
      {#if Object.keys(engine.character.classLevels).length > 0}
        {@const totalLevel = Object.values(engine.character.classLevels).reduce((a, b) => a + b, 0)}
        <p class="char-meta">Level {totalLevel}</p>
      {:else}
        <p class="char-meta char-meta--empty">No class selected yet</p>
      {/if}
    </div>

    <!-- Character ID for debugging (shown only in dev-like context) -->
    <code class="char-id" aria-label="Character ID">{engine.character.id.slice(0, 12)}…</code>
  </header>

  <!-- ========================================================= -->
  <!-- TAB NAVIGATION -->
  <!-- ========================================================= -->
  <nav class="tab-nav" aria-label="Character sheet sections" role="tablist">
    {#each TABS as tab}
      <button
        class="tab-btn"
        class:active={activeTab === tab.key}
        onclick={() => switchTab(tab.key)}
        role="tab"
        aria-selected={activeTab === tab.key}
        aria-controls="tab-panel-{tab.key}"
        id="tab-btn-{tab.key}"
      >
        {tab.label}
      </button>
    {/each}
  </nav>

  <!-- ========================================================= -->
  <!-- TAB CONTENT AREA -->
  <!-- Phase 8–13 will replace these placeholders with real components.
       Each placeholder clearly states which phase implements it and
       shows a preview of the data it will display.
  ========================================================= -->
  <main
    class="tab-panel"
    id="tab-panel-{activeTab}"
    role="tabpanel"
    aria-labelledby="tab-btn-{activeTab}"
  >

    {#if activeTab === 'core'}
      <!-- ---- CORE TAB — Phase 8 Components ---- -->
      <div class="tab-content">
        <BasicInfo />
        <AbilityScoresSummary />
        <SavingThrowsSummary />
        <SkillsSummary />
        <LoreAndLanguages />
      </div>

    {:else if activeTab === 'abilities'}
      <!-- ---- ABILITIES TAB STUB (Phase 9) ---- -->
      <div class="tab-stub">
        <span class="stub-icon">💪</span>
        <h2>Abilities & Skills</h2>
        <p>Full interactive editor — Point Buy, Roll Stats, Saving Throws, Skills Matrix.</p>
        <span class="phase-badge large">Phase 9</span>
      </div>

    {:else if activeTab === 'combat'}
      <!-- ---- COMBAT TAB STUB (Phase 10) ---- -->
      <div class="tab-stub">
        <span class="stub-icon">⚔️</span>
        <h2>Combat</h2>
        <p>HP bar, AC panels, BAB, Weapons & Attacks, Movement, Resistances, Damage Reduction.</p>
        <span class="phase-badge large">Phase 10</span>
      </div>

    {:else if activeTab === 'feats'}
      <!-- ---- FEATS TAB STUB (Phase 11) ---- -->
      <div class="tab-stub">
        <span class="stub-icon">🌟</span>
        <h2>Feats</h2>
        <p>Feat slots management, granted feats list, feat catalog with prerequisite evaluation.</p>
        <span class="phase-badge large">Phase 11</span>
      </div>

    {:else if activeTab === 'magic'}
      <!-- ---- MAGIC TAB STUB (Phase 12) ---- -->
      <div class="tab-stub">
        <span class="stub-icon">✨</span>
        <h2>Spells & Powers</h2>
        <p>Grimoire, spell preparation/casting, psionic powers, domain abilities.</p>
        <span class="phase-badge large">Phase 12</span>
      </div>

    {:else if activeTab === 'inventory'}
      <!-- ---- INVENTORY TAB STUB (Phase 13) ---- -->
      <div class="tab-stub">
        <span class="stub-icon">🎒</span>
        <h2>Inventory</h2>
        <p>Equipment slots, backpack, encumbrance calculator, wealth tracker.</p>
        <span class="phase-badge large">Phase 13</span>
      </div>

    {:else}
      <!-- Unknown tab key -->
      <div class="tab-stub">
        <span class="stub-icon">❓</span>
        <h2>Unknown Tab</h2>
        <p>Tab <code>{activeTab}</code> is not recognised. Use the navigation above.</p>
      </div>
    {/if}

  </main>
</div>

<style>
  .character-sheet {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    background: #0d1117;
    color: #e0e0e0;
    font-family: 'Segoe UI', system-ui, sans-serif;
  }

  /* ========================= HEADER ========================= */
  .sheet-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1.5rem 0.75rem;
    background: #161b22;
    border-bottom: 1px solid #21262d;
  }

  .header-left {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .back-link {
    font-size: 0.75rem;
    color: #6080a0;
    text-decoration: none;
  }
  .back-link:hover { color: #c4b5fd; }

  .char-name {
    margin: 0;
    font-size: 1.5rem;
    color: #f0f0ff;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .npc-label {
    font-size: 0.65rem;
    background: #7f1d1d;
    color: #fca5a5;
    padding: 0.15rem 0.4rem;
    border-radius: 4px;
    letter-spacing: 0.05em;
    font-weight: bold;
    text-transform: uppercase;
  }

  .char-meta {
    margin: 0;
    font-size: 0.8rem;
    color: #8080a0;
  }
  .char-meta--empty { font-style: italic; }

  .char-id {
    font-size: 0.7rem;
    color: #3a3a5a;
    background: #0d1117;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    border: 1px solid #21262d;
    align-self: flex-start;
    flex-shrink: 0;
  }

  /* ========================= TAB NAV ========================= */
  .tab-nav {
    display: flex;
    gap: 0;
    background: #161b22;
    border-bottom: 1px solid #21262d;
    padding: 0 1rem;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }

  .tab-nav::-webkit-scrollbar { display: none; }

  .tab-btn {
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: #6080a0;
    padding: 0.7rem 1rem;
    font-size: 0.85rem;
    cursor: pointer;
    white-space: nowrap;
    transition: color 0.15s, border-color 0.15s;
    font-family: inherit;
  }

  .tab-btn:hover {
    color: #c0c0d0;
  }

  .tab-btn.active {
    color: #c4b5fd;
    border-bottom-color: #7c3aed;
  }

  /* ========================= TAB PANEL ========================= */
  .tab-panel {
    flex: 1;
    padding: 1.5rem;
    overflow-y: auto;
    max-width: 1000px;
    width: 100%;
    margin: 0 auto;
  }

  /* ========================= CORE TAB CONTENT ========================= */
  .tab-content {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .stub-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .stub-header h2 { margin: 0; font-size: 1.15rem; color: #c4b5fd; }

  .stats-preview {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 0.5rem;
  }

  .stat-row {
    background: #161b22;
    border: 1px solid #21262d;
    border-radius: 8px;
    padding: 0.5rem 0.75rem;
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .stat-label {
    font-size: 0.75rem;
    color: #6080a0;
    width: 2rem;
    font-weight: bold;
    text-transform: uppercase;
  }

  .stat-value {
    font-size: 1.1rem;
    color: #7dd3fc;
    font-weight: bold;
  }

  .stat-mod {
    font-size: 0.8rem;
    color: #86efac;
  }

  .combat-preview {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .combat-item {
    background: #161b22;
    border: 1px solid #21262d;
    border-radius: 8px;
    padding: 0.4rem 0.75rem;
    display: flex;
    gap: 0.4rem;
    align-items: center;
  }

  .combat-label {
    font-size: 0.7rem;
    color: #6080a0;
    text-transform: uppercase;
  }

  .combat-value {
    font-size: 1rem;
    color: #fbbf24;
    font-weight: bold;
  }

  .stub-note {
    font-size: 0.8rem;
    color: #4a4a6a;
    font-style: italic;
    border-top: 1px solid #21262d;
    padding-top: 0.75rem;
  }

  /* ========================= STUB PLACEHOLDER ========================= */
  .tab-stub {
    text-align: center;
    padding: 4rem 2rem;
    color: #4a4a6a;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .stub-icon {
    font-size: 3rem;
    opacity: 0.4;
  }

  .tab-stub h2 {
    color: #5a5a8a;
    margin: 0;
    font-size: 1.2rem;
  }

  .tab-stub p {
    font-size: 0.85rem;
    max-width: 400px;
    line-height: 1.6;
    margin: 0;
  }

  /* ========================= PHASE BADGE ========================= */
  .phase-badge {
    background: #1c1a3a;
    color: #4c35a0;
    border: 1px solid #2d1b69;
    border-radius: 6px;
    padding: 0.15rem 0.5rem;
    font-size: 0.7rem;
    letter-spacing: 0.05em;
  }

  .phase-badge.large {
    font-size: 0.85rem;
    padding: 0.3rem 0.75rem;
    margin-top: 0.5rem;
  }
</style>
