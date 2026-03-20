<!--
  @file src/routes/campaigns/+page.svelte
  @description Campaign Hub — the list of all available campaigns.

  PURPOSE:
    Displays a responsive grid of campaign cards. Each card shows the campaign's
    poster image, title, and a brief description.

    The "Create Campaign" button is ONLY visible to GMs (isGameMaster === true).
    This is enforced by reading `sessionContext.isGameMaster` — no game logic,
    just conditional rendering based on role.

  ARCHITECTURE PATTERN:
    This component is deliberately "dumb":
      - Reads campaign data from `campaignStore` ($state).
      - Reads role from `sessionContext` ($state).
      - Dispatches intents via `campaignStore` methods.
      - No D&D rules. No game logic. Just data display + user intent dispatching.

  NAVIGATION:
    From ARCHITECTURE.md section 20:
      /campaigns → Campaign Hub (this page)
      /campaigns/[id] → Campaign Details (Phase 6.4)

  @see src/lib/engine/CampaignStore.svelte.ts for campaign state.
  @see src/lib/engine/SessionContext.svelte.ts for GM role check.
-->

<script lang="ts">
  import { campaignStore } from '$lib/engine/CampaignStore.svelte';
  import { sessionContext } from '$lib/engine/SessionContext.svelte';
  import { goto } from '$app/navigation';

  // ============================================================
  // STATE
  // ============================================================

  /** Controls visibility of the "Create Campaign" input form. */
  let showCreateForm = $state(false);
  /** The title input value for the new campaign. */
  let newCampaignTitle = $state('');

  // ============================================================
  // ACTIONS
  // ============================================================

  /**
   * Creates a new campaign and navigates to its details page.
   * Only callable when `sessionContext.isGameMaster === true` (button hidden otherwise).
   */
  function handleCreateCampaign() {
    if (!newCampaignTitle.trim()) return;

    const campaign = campaignStore.createCampaign(
      newCampaignTitle.trim(),
      sessionContext.currentUserId
    );

    // Reset form
    newCampaignTitle = '';
    showCreateForm = false;

    // Navigate to the new campaign's details page
    goto(`/campaigns/${campaign.id}`);
  }

  /**
   * Navigates to a campaign's details page.
   */
  function openCampaign(campaignId: string) {
    sessionContext.setActiveCampaign(campaignId);
    goto(`/campaigns/${campaignId}`);
  }
</script>

<div class="campaign-hub">
  <!-- ======================================================== -->
  <!-- HEADER -->
  <!-- ======================================================== -->
  <header class="hub-header">
    <div class="header-content">
      <h1 class="hub-title">⚔️ Your Campaigns</h1>
      <p class="hub-subtitle">
        Choose a campaign to begin, or create a new one.
      </p>
    </div>

    <!-- "Create Campaign" button — only visible to GMs -->
    {#if sessionContext.isGameMaster}
      <button
        class="btn-create"
        onclick={() => (showCreateForm = !showCreateForm)}
        aria-expanded={showCreateForm}
      >
        {showCreateForm ? '✕ Cancel' : '✚ Create Campaign'}
      </button>
    {/if}
  </header>

  <!-- ======================================================== -->
  <!-- CREATE CAMPAIGN FORM (GM only, inline) -->
  <!-- ======================================================== -->
  {#if showCreateForm && sessionContext.isGameMaster}
    <div class="create-form" role="form" aria-label="Create new campaign">
      <h2>New Campaign</h2>
      <div class="form-row">
        <label for="campaign-title">Campaign Title</label>
        <input
          id="campaign-title"
          type="text"
          bind:value={newCampaignTitle}
          placeholder="e.g. Reign of Winter, Curse of Strahd..."
          maxlength="80"
          autofocus
          onkeydown={(e) => e.key === 'Enter' && handleCreateCampaign()}
          class="title-input"
        />
      </div>
      <div class="form-actions">
        <button
          class="btn-confirm"
          onclick={handleCreateCampaign}
          disabled={!newCampaignTitle.trim()}
        >
          Create Campaign
        </button>
        <button class="btn-cancel" onclick={() => (showCreateForm = false)}>
          Cancel
        </button>
      </div>
    </div>
  {/if}

  <!-- ======================================================== -->
  <!-- CAMPAIGN GRID -->
  <!-- ======================================================== -->
  {#if campaignStore.campaigns.length === 0}
    <!-- Empty state -->
    <div class="empty-state">
      <p class="empty-icon">🗺️</p>
      <h2>No campaigns yet</h2>
      <p>
        {#if sessionContext.isGameMaster}
          Click <strong>"✚ Create Campaign"</strong> above to start your first adventure.
        {:else}
          Your Game Master hasn't created a campaign yet. Check back later!
        {/if}
      </p>
    </div>
  {:else}
    <div class="campaign-grid">
      {#each campaignStore.campaigns as campaign (campaign.id)}
        <button
          class="campaign-card"
          onclick={() => openCampaign(campaign.id)}
          aria-label="Open campaign: {campaign.title}"
        >
          <!-- Poster image (fallback placeholder) -->
          <div class="card-poster">
            {#if campaign.posterUrl}
              <img
                src={campaign.posterUrl}
                alt={campaign.title}
                class="poster-image"
              />
            {:else}
              <!-- Placeholder with themed gradient -->
              <div class="poster-placeholder" aria-hidden="true">
                <span class="poster-icon">⚔️</span>
              </div>
            {/if}
          </div>

          <!-- Card content -->
          <div class="card-body">
            <h2 class="card-title">{campaign.title}</h2>

            {#if campaign.description}
              <p class="card-description">{campaign.description}</p>
            {/if}

            <!-- Chapter progress indicator -->
            {#if campaign.chapters.length > 0}
              {@const completedCount = campaign.chapters.filter(ch => ch.isCompleted).length}
              <div class="chapter-progress">
                <span class="progress-label">
                  {completedCount}/{campaign.chapters.length} chapters
                </span>
                <div
                  class="progress-bar"
                  role="progressbar"
                  aria-valuenow={completedCount}
                  aria-valuemin={0}
                  aria-valuemax={campaign.chapters.length}
                >
                  <div
                    class="progress-fill"
                    style="width: {campaign.chapters.length > 0 ? (completedCount / campaign.chapters.length) * 100 : 0}%"
                  ></div>
                </div>
              </div>
            {/if}
          </div>

          <!-- Hover cue -->
          <div class="card-cta" aria-hidden="true">Open →</div>
        </button>
      {/each}
    </div>
  {/if}

  <!-- Dev toolbar (visible only in development — helps test role switching) -->
  <div class="dev-toolbar" aria-label="Developer toolbar (development only)">
    <span class="dev-label">🛠 Dev:</span>
    <span class="role-badge" class:gm={sessionContext.isGameMaster}>
      {sessionContext.isGameMaster ? '🎲 GM' : '🧙 Player'}
      ({sessionContext.currentUserDisplayName})
    </span>
    <button
      class="dev-btn"
      onclick={() =>
        sessionContext.isGameMaster
          ? sessionContext.switchToPlayer()
          : sessionContext.switchToGM()}
    >
      Switch to {sessionContext.isGameMaster ? 'Player' : 'GM'} view
    </button>
  </div>
</div>

<style>
  .campaign-hub {
    max-width: 1100px;
    margin: 0 auto;
    padding: 2rem 1.5rem;
    font-family: 'Segoe UI', system-ui, sans-serif;
    color: #e0e0e0;
    min-height: 100vh;
    background: #0d1117;
  }

  /* -------------------------------- HEADER -------------------------------- */
  .hub-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 2rem;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .hub-title {
    font-size: 2rem;
    margin: 0 0 0.25rem;
    color: #f0f0ff;
  }

  .hub-subtitle {
    color: #8080a0;
    margin: 0;
    font-size: 0.95rem;
  }

  .btn-create {
    background: #7c3aed;
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 0.65rem 1.4rem;
    font-size: 0.95rem;
    cursor: pointer;
    transition: background 0.2s;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .btn-create:hover {
    background: #6d28d9;
  }

  /* ----------------------------- CREATE FORM ----------------------------- */
  .create-form {
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 10px;
    padding: 1.5rem;
    margin-bottom: 2rem;
  }

  .create-form h2 {
    margin: 0 0 1rem;
    font-size: 1.1rem;
    color: #c4b5fd;
  }

  .form-row {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin-bottom: 1rem;
  }

  .form-row label {
    font-size: 0.85rem;
    color: #8080a0;
  }

  .title-input {
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    color: #e0e0ff;
    padding: 0.5rem 0.75rem;
    font-size: 1rem;
    width: 100%;
    max-width: 480px;
    box-sizing: border-box;
  }

  .title-input:focus {
    outline: 2px solid #7c3aed;
    border-color: transparent;
  }

  .form-actions {
    display: flex;
    gap: 0.75rem;
  }

  .btn-confirm {
    background: #7c3aed;
    color: #fff;
    border: none;
    border-radius: 6px;
    padding: 0.5rem 1.2rem;
    font-size: 0.9rem;
    cursor: pointer;
  }

  .btn-confirm:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .btn-cancel {
    background: transparent;
    color: #8080a0;
    border: 1px solid #30363d;
    border-radius: 6px;
    padding: 0.5rem 1.2rem;
    font-size: 0.9rem;
    cursor: pointer;
  }

  /* ------------------------------ EMPTY STATE ------------------------------ */
  .empty-state {
    text-align: center;
    padding: 4rem 2rem;
    color: #8080a0;
  }

  .empty-icon {
    font-size: 3rem;
    margin: 0 0 0.5rem;
  }

  .empty-state h2 {
    color: #c0c0d0;
    margin-bottom: 0.5rem;
  }

  /* ------------------------------- GRID ----------------------------------- */
  .campaign-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1.5rem;
  }

  /* ------------------------------ CARD ------------------------------------ */
  .campaign-card {
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 12px;
    overflow: hidden;
    cursor: pointer;
    text-align: left;
    padding: 0;
    transition: border-color 0.2s, transform 0.15s;
    position: relative;
    display: flex;
    flex-direction: column;
  }

  .campaign-card:hover {
    border-color: #7c3aed;
    transform: translateY(-2px);
  }

  /* Poster */
  .card-poster {
    width: 100%;
    height: 160px;
    overflow: hidden;
    flex-shrink: 0;
  }

  .poster-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .poster-placeholder {
    width: 100%;
    height: 100%;
    background: linear-gradient(135deg, #1e1b4b 0%, #2d1b69 60%, #1c1033 100%);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .poster-icon {
    font-size: 3rem;
    opacity: 0.5;
  }

  /* Card body */
  .card-body {
    padding: 1rem 1.25rem;
    flex: 1;
  }

  .card-title {
    font-size: 1.15rem;
    margin: 0 0 0.5rem;
    color: #f0f0ff;
  }

  .card-description {
    font-size: 0.85rem;
    color: #8080a0;
    margin: 0 0 0.75rem;
    line-height: 1.5;
    /* Clamp to 3 lines */
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* Chapter progress */
  .chapter-progress {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .progress-label {
    font-size: 0.75rem;
    color: #6080a0;
    white-space: nowrap;
  }

  .progress-bar {
    flex: 1;
    height: 4px;
    background: #30363d;
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: #7c3aed;
    border-radius: 2px;
    transition: width 0.3s;
  }

  /* CTA overlay */
  .card-cta {
    position: absolute;
    bottom: 0.75rem;
    right: 1rem;
    font-size: 0.8rem;
    color: #7c3aed;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .campaign-card:hover .card-cta {
    opacity: 1;
  }

  /* ----------------------------- DEV TOOLBAR ------------------------------ */
  .dev-toolbar {
    margin-top: 3rem;
    padding: 0.6rem 1rem;
    background: #161b22;
    border: 1px dashed #30363d;
    border-radius: 8px;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.8rem;
    color: #6080a0;
  }

  .dev-label {
    font-weight: bold;
  }

  .role-badge {
    background: #0d3060;
    color: #93c5fd;
    padding: 0.15rem 0.6rem;
    border-radius: 12px;
    border: 1px solid #1e4080;
  }

  .role-badge.gm {
    background: #1c1a3a;
    color: #c4b5fd;
    border-color: #4c35a0;
  }

  .dev-btn {
    background: transparent;
    border: 1px solid #30363d;
    border-radius: 4px;
    color: #6080a0;
    padding: 0.2rem 0.6rem;
    font-size: 0.75rem;
    cursor: pointer;
    margin-left: auto;
  }

  .dev-btn:hover {
    background: #1c2030;
  }
</style>
