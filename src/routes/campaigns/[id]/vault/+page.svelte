<!--
  @file src/routes/campaigns/[id]/vault/+page.svelte
  @description The Character Vault — all adventurers for this campaign.

  PURPOSE:
    Displays the `visibleCharacters` array from the GameEngine as a responsive
    card grid. Each card navigates to the character's sheet on click.

    Includes:
      - Empty state: "No adventurers yet!" with context-appropriate action buttons.
      - "Create New Character" button (always visible).
      - "Add NPC/Monster" button (visible only to GMs).

  VISIBILITY:
    The `engine.visibleCharacters` $derived (Phase 7.1) handles ALL visibility
    filtering automatically:
      - GM: sees everyone in the campaign (PCs, NPCs, monsters).
      - Player: sees only their own characters + their linked entities.
    This page does NOT implement visibility logic — it just displays the result.

  ARCHITECTURE:
    "Dumb" component pattern:
      - Reads data from `engine.visibleCharacters` (pre-filtered $derived).
      - Character creation intent dispatched via `engine.addCharacterToVault()`.
      - Navigation via `goto()`.
      - No game logic. No D&D rules.

  INITIALIZATION:
    On mount, calls `engine.loadVaultCharacters()` to populate `allVaultCharacters`
    from localStorage. This triggers the `visibleCharacters` $derived to recompute.

  @see src/lib/components/vault/CharacterCard.svelte for individual card rendering.
  @see src/lib/engine/GameEngine.svelte.ts for visibleCharacters logic.
  @see ARCHITECTURE.md Phase 7.3 for the specification.
-->

<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { engine, createEmptyCharacter } from '$lib/engine/GameEngine.svelte';
  import { sessionContext } from '$lib/engine/SessionContext.svelte';
  import { campaignStore } from '$lib/engine/CampaignStore.svelte';
  import CharacterCard from '$lib/components/vault/CharacterCard.svelte';
  import { IconVault, IconAddCharacter, IconNPC, IconGMDashboard, IconCharacter, IconCampaign } from '$lib/components/ui/icons';

  // ============================================================
  // DERIVED DATA
  // ============================================================

  const campaignId = $derived($page.params.id);
  const campaign = $derived(campaignStore.getCampaign(campaignId));

  // ============================================================
  // INITIALIZATION
  // ============================================================

  $effect(() => {
    // Update session context when entering this vault
    sessionContext.setActiveCampaign(campaignId);

    // Load vault characters from localStorage (Phase 4.1 persistence)
    // This fills `engine.allVaultCharacters`, which triggers `engine.visibleCharacters`
    engine.loadVaultCharacters();
  });

  // ============================================================
  // ACTIONS
  // ============================================================

  /**
   * Creates a new blank Player Character and navigates to their sheet editor.
   * The character is pre-assigned to the current campaign and owner.
   */
  function createNewCharacter() {
    const id = `char_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const newChar = createEmptyCharacter(id, 'New Character');

    // Assign campaign and ownership metadata
    newChar.campaignId = campaignId;
    newChar.ownerId = sessionContext.currentUserId;
    newChar.isNPC = false;

    // Persist and add to the vault's reactive list
    engine.addCharacterToVault(newChar);

    // Navigate to the character sheet editor (Phase 8.1)
    goto(`/character/${id}?tab=core`);
  }

  /**
   * Creates a new blank NPC/Monster and navigates to their sheet editor.
   * Only callable by GMs — button is hidden for players.
   */
  function addNPCMonster() {
    const id = `npc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const newNPC = createEmptyCharacter(id, 'New NPC');

    // Assign metadata
    newNPC.campaignId = campaignId;
    newNPC.ownerId = sessionContext.currentUserId;
    newNPC.isNPC = true;

    engine.addCharacterToVault(newNPC);
    goto(`/character/${id}?tab=core`);
  }

  /**
   * Navigates to a character's sheet when their card is clicked.
   */
  function openCharacter(characterId: string) {
    engine.loadCharacter(
      engine.allVaultCharacters.find(c => c.id === characterId) ??
      engine.character
    );
    goto(`/character/${characterId}?tab=core`);
  }
</script>

<div class="vault-page">
  <!-- ========================================================= -->
  <!-- HEADER -->
  <!-- ========================================================= -->
  <header class="vault-header">
    <div class="header-left">
      <a href="/campaigns/{campaignId}" class="back-link">← Campaign</a>
      <h1 class="vault-title">
         <IconVault size={24} aria-hidden="true" /> Your Adventurers
      </h1>
      {#if campaign}
        <p class="vault-campaign">{campaign.title}</p>
      {/if}
    </div>

    <div class="header-actions">
      <button class="btn-primary" onclick={createNewCharacter}>
           <IconAddCharacter size={16} aria-hidden="true" /> Create New Character
         </button>
         {#if sessionContext.isGameMaster}
           <button class="btn-secondary" onclick={addNPCMonster}>
             <IconNPC size={16} aria-hidden="true" /> Add NPC / Monster
        </button>
      {/if}
    </div>
  </header>

  <!-- ========================================================= -->
  <!-- VISIBILITY INFO (dev helper) -->
  <!-- ========================================================= -->
  <div class="visibility-info" aria-live="polite">
    {#if sessionContext.isGameMaster}
      <span class="info-badge gm">
         <IconGMDashboard size={14} aria-hidden="true" /> GM View — Showing all {engine.visibleCharacters.length} characters
      </span>
    {:else}
      <span class="info-badge player">
         <IconCharacter size={14} aria-hidden="true" /> Player View — Showing your {engine.visibleCharacters.length} characters
      </span>
    {/if}
  </div>

  <!-- ========================================================= -->
  <!-- CHARACTER GRID or EMPTY STATE -->
  <!-- ========================================================= -->
  {#if engine.visibleCharacters.length === 0}
    <!-- ---- EMPTY STATE ---- -->
    <div class="empty-state">
       <p class="empty-icon" aria-hidden="true"><IconCampaign size={64} /></p>
      <h2>No adventurers yet!</h2>
      <p class="empty-desc">
        {#if sessionContext.isGameMaster}
          Create the party's first character or add an NPC to get started.
        {:else}
          You don't have any characters in this campaign yet.
          Click "Create New Character" to begin your journey!
        {/if}
      </p>
      <div class="empty-actions">
        <button class="btn-primary btn-large" onclick={createNewCharacter}>
           <IconAddCharacter size={16} aria-hidden="true" /> Create New Character
         </button>
         {#if sessionContext.isGameMaster}
           <button class="btn-secondary btn-large" onclick={addNPCMonster}>
             <IconNPC size={16} aria-hidden="true" /> Add NPC / Monster
          </button>
        {/if}
      </div>
    </div>
  {:else}
    <!-- ---- CHARACTER GRID ---- -->
    <section
      class="character-grid"
      aria-label="Character list ({engine.visibleCharacters.length} adventurers)"
    >
      {#each engine.visibleCharacters as character (character.id)}
        <CharacterCard
          {character}
          onclick={() => openCharacter(character.id)}
        />
      {/each}
    </section>
  {/if}
</div>

<style>
  .vault-page {
    max-width: 1100px;
    margin: 0 auto;
    padding: 1.5rem;
    font-family: 'Segoe UI', system-ui, sans-serif;
    color: #e0e0e0;
    min-height: 100vh;
    background: #0d1117;
  }

  /* ========================= HEADER ========================= */
  .vault-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
    margin-bottom: 1.25rem;
  }

  .header-left {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .back-link {
    font-size: 0.8rem;
    color: #6080a0;
    text-decoration: none;
    transition: color 0.15s;
  }
  .back-link:hover { color: #c4b5fd; }

  .vault-title {
    margin: 0;
    font-size: 1.8rem;
    color: #f0f0ff;
  }

  .vault-campaign {
    margin: 0;
    font-size: 0.85rem;
    color: #8080a0;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .btn-primary {
    background: #7c3aed;
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 0.6rem 1.25rem;
    font-size: 0.9rem;
    cursor: pointer;
    transition: background 0.2s;
    white-space: nowrap;
  }
  .btn-primary:hover { background: #6d28d9; }

  .btn-secondary {
    background: transparent;
    color: #f87171;
    border: 1px solid #7f1d1d;
    border-radius: 8px;
    padding: 0.6rem 1.25rem;
    font-size: 0.9rem;
    cursor: pointer;
    transition: border-color 0.2s, color 0.2s;
    white-space: nowrap;
  }
  .btn-secondary:hover {
    border-color: #dc2626;
    background: #1c0808;
  }

  /* ======================= VISIBILITY INFO ======================== */
  .visibility-info {
    margin-bottom: 1.25rem;
  }

  .info-badge {
    font-size: 0.8rem;
    padding: 0.25rem 0.75rem;
    border-radius: 6px;
  }

  .info-badge.gm {
    background: #1a1a3a;
    color: #c4b5fd;
    border: 1px solid #4c35a0;
  }

  .info-badge.player {
    background: #0f1e2e;
    color: #93c5fd;
    border: 1px solid #1e4080;
  }

  /* ========================= EMPTY STATE ========================= */
  .empty-state {
    text-align: center;
    padding: 4rem 2rem;
    color: #8080a0;
  }

  .empty-icon {
    font-size: 3.5rem;
    margin: 0 0 0.5rem;
  }

  .empty-state h2 {
    color: #c0c0d0;
    margin-bottom: 0.5rem;
    font-size: 1.4rem;
  }

  .empty-desc {
    max-width: 480px;
    margin: 0 auto 1.5rem;
    line-height: 1.65;
    font-size: 0.95rem;
  }

  .empty-actions {
    display: flex;
    justify-content: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .btn-large {
    padding: 0.75rem 1.75rem;
    font-size: 1rem;
  }

  /* ========================= CHARACTER GRID ======================== */
  .character-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 1.25rem;
  }
</style>
