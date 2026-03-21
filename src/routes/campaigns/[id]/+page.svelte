<!--
  @file src/routes/campaigns/[id]/+page.svelte
  @description Campaign Details page — banner, summary, and chapters/acts.

  PURPOSE:
    Displays the full details of one campaign:
      1. The campaign banner image (fallback placeholder if absent).
      2. The campaign title and description.
      3. The list of Chapters/Acts with their completion status.
    
    If `isGameMaster === true`, each chapter shows a checkbox to toggle
    `isCompleted`. This is the GM's primary tool for tracking story progress.
    Players can see chapter titles but cannot change completion status.

  ARCHITECTURE PATTERN:
    - "Dumb" component: reads from `campaignStore` and `sessionContext`.
    - Dispatches intents via `campaignStore.toggleChapterCompleted()`.
    - No game logic. No D&D rules.
    - The URL parameter `[id]` is read from `$page.params.id`.

  NAVIGATION:
    From ARCHITECTURE.md section 20:
      /campaigns/[id] → This page
      /campaigns/[id]/vault → Character Vault (Phase 7.3)
      /campaigns/[id]/settings → GM Settings (Phase 15.1, GM only)
      /campaigns/[id]/gm-dashboard → GM Dashboard (Phase 15.3, GM only)

  @see src/lib/engine/CampaignStore.svelte.ts for campaign/chapter state.
  @see src/lib/engine/SessionContext.svelte.ts for GM role check.
-->

<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { campaignStore } from '$lib/engine/CampaignStore.svelte';
  import { sessionContext } from '$lib/engine/SessionContext.svelte';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { IconCampaign, IconVault, IconGMDashboard, IconSettings, IconSpells, IconChecked, IconSuccess } from '$lib/components/ui/icons';

  // ============================================================
  // DERIVED DATA
  // ============================================================

  /**
   * The campaign ID from the URL route parameter.
   * SvelteKit provides this via `$page.params.id`.
   */
  const campaignId = $derived($page.params.id);

  /**
   * The full campaign object looked up by URL id.
   * `undefined` if the ID doesn't exist (handled in template).
   */
  const campaign = $derived(campaignStore.getCampaign(campaignId));

  /**
   * Overall chapter completion statistics.
   */
  const chapterStats = $derived.by(() => {
    if (!campaign) return { total: 0, completed: 0, percent: 0 };
    const total = campaign.chapters.length;
    const completed = campaign.chapters.filter(ch => ch.isCompleted).length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, percent };
  });

  // ============================================================
  // LIFECYCLE
  // ============================================================

  // Update the session context when this campaign page is visited.
  // This ensures components deeper in the tree (e.g., the Vault) know
  // which campaign is active.
  $effect(() => {
    if (campaignId) {
      sessionContext.setActiveCampaign(campaignId);
    }
    return () => {
      // Clean up when leaving this campaign's routes
      // (do NOT reset to null here — sub-pages like /vault still need it)
    };
  });

  // ============================================================
  // ACTIONS
  // ============================================================

  /**
   * Toggles a chapter's completion status.
   * Only called from the GM's checkbox — UI enforces the GM restriction.
   */
  function toggleChapter(chapterId: string) {
    campaignStore.toggleChapterCompleted(campaignId, chapterId);
  }

  /**
   * Navigates to the Character Vault for this campaign.
   */
  function goToVault() {
    goto(`/campaigns/${campaignId}/vault`);
  }

  /**
   * Navigates to the GM Settings page (GM only).
   */
  function goToSettings() {
    goto(`/campaigns/${campaignId}/settings`);
  }

  /**
   * Navigates to the GM Dashboard (GM only).
   */
  function goToDashboard() {
    goto(`/campaigns/${campaignId}/gm-dashboard`);
  }

  /**
   * Translates a localised string using the engine's t() helper.
   * Falls back gracefully per the i18n spec.
   */
  function t(textObj: Record<string, string> | string): string {
    return engine.t(textObj);
  }
</script>

<div class="campaign-details">
  {#if !campaign}
    <!-- ================================================ -->
    <!-- NOT FOUND STATE -->
    <!-- ================================================ -->
    <div class="not-found">
       <h1><IconCampaign size={24} aria-hidden="true" /> Campaign not found</h1>
      <p>The campaign with ID <code>{campaignId}</code> doesn't exist.</p>
      <a href="/campaigns" class="back-link">← Back to Campaign Hub</a>
    </div>
  {:else}
    <!-- ================================================ -->
    <!-- BANNER  -->
    <!-- ================================================ -->
    <div class="campaign-banner">
      {#if campaign.bannerUrl}
        <img
          src={campaign.bannerUrl}
          alt="{campaign.title} banner"
          class="banner-image"
        />
      {:else}
        <div class="banner-placeholder" aria-hidden="true">
               <span class="banner-icon"><IconCampaign size={64} aria-hidden="true" /></span>
        </div>
      {/if}
      <!-- Campaign title overlay on banner -->
      <div class="banner-overlay">
        <a href="/campaigns" class="back-link" aria-label="Back to Campaign Hub">← Campaigns</a>
        <h1 class="campaign-title">{campaign.title}</h1>
      </div>
    </div>

    <!-- ================================================ -->
    <!-- CAMPAIGN SUMMARY + NAVIGATION -->
    <!-- ================================================ -->
    <div class="campaign-body">

      <!-- Navigation action bar -->
      <div class="action-bar">
        <button class="btn-primary" onclick={goToVault}>
           <IconVault size={16} aria-hidden="true" /> Character Vault
         </button>

         {#if sessionContext.isGameMaster}
           <button class="btn-secondary" onclick={goToDashboard}>
             <IconGMDashboard size={16} aria-hidden="true" /> GM Dashboard
           </button>
           <button class="btn-secondary" onclick={goToSettings}>
             <IconSettings size={16} aria-hidden="true" /> Settings
           </button>
        {/if}
      </div>

      <!-- Description -->
      {#if campaign.description}
        <p class="campaign-description">{campaign.description}</p>
      {/if}

      <!-- ============================================= -->
      <!-- CHAPTERS / ACTS LIST -->
      <!-- ============================================= -->
      <section class="chapters-section" aria-label="Campaign chapters">
        <div class="section-header">
           <h2 class="section-title"><IconSpells size={20} aria-hidden="true" /> Chapters & Acts</h2>
          {#if chapterStats.total > 0}
            <div class="progress-summary">
              <span class="progress-text">
                {chapterStats.completed}/{chapterStats.total} completed
              </span>
              <div
                class="progress-bar"
                role="progressbar"
                aria-valuenow={chapterStats.completed}
                aria-valuemin={0}
                aria-valuemax={chapterStats.total}
                aria-label="{chapterStats.percent}% of chapters completed"
              >
                <div
                  class="progress-fill"
                  style="width: {chapterStats.percent}%"
                ></div>
              </div>
              <span class="progress-percent">{chapterStats.percent}%</span>
            </div>
          {/if}
        </div>

        {#if campaign.chapters.length === 0}
          <div class="chapters-empty">
            <p>
              {#if sessionContext.isGameMaster}
                No chapters yet. You can add chapters via the GM Settings page.
              {:else}
                No chapters have been added to this campaign yet.
              {/if}
            </p>
          </div>
        {:else}
          <ol class="chapter-list" aria-label="List of chapters">
            {#each campaign.chapters as chapter, index (chapter.id)}
              <li
                class="chapter-item"
                class:completed={chapter.isCompleted}
                aria-label="Chapter {index + 1}: {t(chapter.title)}"
              >
                <!-- Chapter number badge -->
                <span class="chapter-number" aria-hidden="true">
                   {#if chapter.isCompleted}<IconChecked size={16} aria-hidden="true" />{:else}{index + 1}{/if}
                </span>

                <!-- Chapter content -->
                <div class="chapter-content">
                  <h3 class="chapter-title">{t(chapter.title)}</h3>
                  {#if chapter.description}
                    <p class="chapter-description">{t(chapter.description)}</p>
                  {/if}
                </div>

                <!-- GM completion toggle -->
                {#if sessionContext.isGameMaster}
                  <label
                    class="chapter-toggle"
                    title={chapter.isCompleted ? 'Mark as incomplete' : 'Mark as completed'}
                  >
                    <input
                      type="checkbox"
                      checked={chapter.isCompleted}
                      onchange={() => toggleChapter(chapter.id)}
                      aria-label="Toggle completion for {t(chapter.title)}"
                      class="sr-only"
                    />
                    <span class="toggle-label" aria-hidden="true">
                       {chapter.isCompleted ? 'Completed' : 'Mark done'}{#if chapter.isCompleted} <IconSuccess size={12} aria-hidden="true" />{/if}
                    </span>
                  </label>
                {:else}
                  <span class="chapter-status" aria-hidden="true">
                     {#if chapter.isCompleted}<IconSuccess size={12} aria-hidden="true" /> Done{/if}
                  </span>
                {/if}
              </li>
            {/each}
          </ol>
        {/if}
      </section>

      <!-- ============================================= -->
      <!-- ENABLED RULE SOURCES (informational) -->
      <!-- ============================================= -->
      {#if sessionContext.isGameMaster && campaign.enabledRuleSources.length > 0}
        <section class="sources-section" aria-label="Active rule sources">
           <h2 class="section-title"><IconSpells size={20} aria-hidden="true" /> Active Rule Sources</h2>
          <div class="sources-list">
            {#each campaign.enabledRuleSources as sourceId}
              <span class="source-badge">{sourceId}</span>
            {/each}
          </div>
          <p class="sources-hint">
            Manage rule sources and overrides in <a href="/campaigns/{campaignId}/settings">GM Settings</a>.
          </p>
        </section>
      {/if}
    </div>
  {/if}
</div>

<style>
  .campaign-details {
    max-width: 900px;
    margin: 0 auto;
    padding-bottom: 3rem;
    font-family: 'Segoe UI', system-ui, sans-serif;
    color: #e0e0e0;
    background: #0d1117;
    min-height: 100vh;
  }

  /* ----------------------------- NOT FOUND -------------------------------- */
  .not-found {
    padding: 4rem 2rem;
    text-align: center;
    color: #8080a0;
  }

  .not-found h1 { color: #c0c0d0; }
  .not-found code {
    background: #161b22;
    padding: 0.1rem 0.4rem;
    border-radius: 3px;
  }

  /* ------------------------------- BANNER --------------------------------- */
  .campaign-banner {
    position: relative;
    width: 100%;
    height: 220px;
    overflow: hidden;
  }

  .banner-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .banner-placeholder {
    width: 100%;
    height: 100%;
    background: linear-gradient(135deg, #1e1b4b 0%, #2d1b69 50%, #1c1033 100%);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .banner-icon {
    font-size: 4rem;
    opacity: 0.3;
  }

  .banner-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(to top, rgba(13,17,23,0.9) 0%, rgba(13,17,23,0.2) 60%);
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    padding: 1.25rem 1.5rem;
    gap: 0.25rem;
  }

  .back-link {
    color: #8080c0;
    text-decoration: none;
    font-size: 0.85rem;
    width: fit-content;
    transition: color 0.15s;
  }

  .back-link:hover { color: #c4b5fd; }

  .campaign-title {
    margin: 0;
    font-size: 2rem;
    color: #f0f0ff;
    text-shadow: 0 2px 8px rgba(0,0,0,0.6);
  }

  /* ------------------------------ BODY ------------------------------------ */
  .campaign-body {
    padding: 1.5rem;
  }

  .action-bar {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-bottom: 1.5rem;
  }

  .btn-primary {
    background: #7c3aed;
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 0.6rem 1.3rem;
    font-size: 0.9rem;
    cursor: pointer;
    transition: background 0.2s;
  }
  .btn-primary:hover { background: #6d28d9; }

  .btn-secondary {
    background: transparent;
    color: #a0a0c0;
    border: 1px solid #30363d;
    border-radius: 8px;
    padding: 0.6rem 1.3rem;
    font-size: 0.9rem;
    cursor: pointer;
    transition: border-color 0.2s, color 0.2s;
  }
  .btn-secondary:hover {
    border-color: #7c3aed;
    color: #c4b5fd;
  }

  .campaign-description {
    color: #9090b0;
    font-size: 0.95rem;
    line-height: 1.65;
    margin-bottom: 2rem;
  }

  /* ----------------------------- CHAPTERS --------------------------------- */
  .chapters-section {
    margin-bottom: 2.5rem;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }

  .section-title {
    margin: 0;
    font-size: 1.15rem;
    color: #c4b5fd;
  }

  .progress-summary {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
    min-width: 200px;
  }

  .progress-text {
    font-size: 0.8rem;
    color: #6080a0;
    white-space: nowrap;
  }

  .progress-bar {
    flex: 1;
    height: 6px;
    background: #21262d;
    border-radius: 3px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #7c3aed, #a855f7);
    border-radius: 3px;
    transition: width 0.4s ease;
  }

  .progress-percent {
    font-size: 0.8rem;
    color: #c4b5fd;
    min-width: 2.5rem;
    text-align: right;
  }

  .chapters-empty {
    padding: 1.5rem;
    background: #161b22;
    border-radius: 8px;
    color: #6080a0;
    text-align: center;
    font-size: 0.9rem;
  }

  .chapter-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .chapter-item {
    background: #161b22;
    border: 1px solid #21262d;
    border-radius: 10px;
    padding: 1rem 1.25rem;
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    transition: border-color 0.15s;
  }

  .chapter-item.completed {
    border-color: #1e3a1a;
    background: #0f1e0f;
  }

  .chapter-number {
    flex-shrink: 0;
    width: 2rem;
    height: 2rem;
    background: #21262d;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.85rem;
    font-weight: bold;
    color: #8080a0;
  }

  .chapter-item.completed .chapter-number {
    background: #1a3a1a;
    color: #4ade80;
  }

  .chapter-content {
    flex: 1;
    min-width: 0;
  }

  .chapter-title {
    margin: 0 0 0.25rem;
    font-size: 1rem;
    color: #e0e0f0;
  }

  .chapter-item.completed .chapter-title {
    color: #6080a0;
    text-decoration: line-through;
    text-decoration-color: #4ade8060;
  }

  .chapter-description {
    margin: 0;
    font-size: 0.85rem;
    color: #6080a0;
    line-height: 1.5;
  }

  /* GM chapter toggle */
  .chapter-toggle {
    flex-shrink: 0;
    cursor: pointer;
  }

  .toggle-label {
    font-size: 0.8rem;
    color: #7c3aed;
    border: 1px solid #4c35a0;
    border-radius: 4px;
    padding: 0.2rem 0.6rem;
    cursor: pointer;
    transition: background 0.15s;
    white-space: nowrap;
  }

  .chapter-item.completed .toggle-label {
    color: #4ade80;
    border-color: #166534;
  }

  .toggle-label:hover {
    background: #2d1b69;
  }

  .chapter-status {
    font-size: 0.8rem;
    color: #4ade80;
    flex-shrink: 0;
  }

  /* Screen-reader only helper */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }

  /* -------------------------- RULE SOURCES -------------------------------- */
  .sources-section {
    border-top: 1px solid #21262d;
    padding-top: 1.5rem;
  }

  .sources-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 0.75rem 0;
  }

  .source-badge {
    background: #1c2540;
    color: #93c5fd;
    border: 1px solid #1e4080;
    border-radius: 6px;
    padding: 0.2rem 0.6rem;
    font-size: 0.8rem;
    font-family: monospace;
  }

  .sources-hint {
    font-size: 0.8rem;
    color: #6080a0;
    margin: 0;
  }

  .sources-hint a {
    color: #7c3aed;
    text-decoration: none;
  }

  .sources-hint a:hover {
    text-decoration: underline;
  }
</style>
