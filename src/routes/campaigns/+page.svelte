<!--
  @file src/routes/campaigns/+page.svelte
  @description Campaign Hub — the list of all available campaigns.
  Phase 19.12: Migrated to Tailwind CSS — all scoped <style> removed.

  LAYOUT: max-w-5xl centered, responsive grid of campaign cards.
  Campaign cards: poster image (160px tall) + card body + hover CTA.
  "Create Campaign" button: visible only to GMs.
  Dev toolbar: always shown in DEV builds for role switching.
-->

<script lang="ts">
  import { campaignStore } from '$lib/engine/CampaignStore.svelte';
  import { sessionContext } from '$lib/engine/SessionContext.svelte';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import { goto } from '$app/navigation';
  import { IconCampaign, IconAdd, IconClose, IconGMDashboard, IconCharacter } from '$lib/components/ui/icons';

  let showCreateForm   = $state(false);
  let newCampaignTitle = $state('');

  function handleCreateCampaign() {
    if (!newCampaignTitle.trim()) return;
    const campaign = campaignStore.createCampaign(newCampaignTitle.trim(), sessionContext.currentUserId);
    newCampaignTitle = '';
    showCreateForm = false;
    goto(`/campaigns/${campaign.id}`);
  }

  function openCampaign(campaignId: string) {
    sessionContext.setActiveCampaign(campaignId);
    goto(`/campaigns/${campaignId}`);
  }
</script>

<div class="max-w-5xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">

  <!-- ── HEADER ───────────────────────────────────────────────────────────── -->
  <header class="flex items-start justify-between gap-4 flex-wrap">
    <div>
      <h1 class="flex items-center gap-2 text-3xl font-bold text-text-primary">
        <IconCampaign size={28} aria-hidden="true" />
        {ui('campaigns.title', engine.settings.language)}
      </h1>
      <p class="mt-1 text-text-muted text-sm">{ui('campaigns.subtitle', engine.settings.language)}</p>
    </div>

    {#if sessionContext.isGameMaster}
      <button
        class="btn-primary gap-1 shrink-0"
        onclick={() => (showCreateForm = !showCreateForm)}
        aria-expanded={showCreateForm}
        type="button"
      >
        {#if showCreateForm}
          <IconClose size={16} aria-hidden="true" /> {ui('common.cancel', engine.settings.language)}
        {:else}
          <IconAdd size={16} aria-hidden="true" /> {ui('campaigns.create', engine.settings.language)}
        {/if}
      </button>
    {/if}
  </header>

  <!-- ── CREATE FORM (GM only, inline) ────────────────────────────────────── -->
  {#if showCreateForm && sessionContext.isGameMaster}
    <div class="card p-5 flex flex-col gap-4" role="form" aria-label="Create new campaign">
      <h2 class="text-base font-semibold text-accent">{ui('campaigns.new_title', engine.settings.language)}</h2>
      <div class="flex flex-col gap-1.5">
        <label for="campaign-title" class="text-sm text-text-secondary">{ui('campaigns.field_title', engine.settings.language)}</label>
        <input
          id="campaign-title"
          type="text"
          bind:value={newCampaignTitle}
          placeholder={ui('campaigns.field_title_placeholder', engine.settings.language)}
          maxlength="80"
          class="input max-w-lg"
          onkeydown={(e) => e.key === 'Enter' && handleCreateCampaign()}
        />
      </div>
      <div class="flex gap-2">
        <button
          class="btn-primary"
          onclick={handleCreateCampaign}
          disabled={!newCampaignTitle.trim()}
          type="button"
        >{ui('campaigns.create', engine.settings.language)}</button>
        <button class="btn-secondary" onclick={() => (showCreateForm = false)} type="button">{ui('common.cancel', engine.settings.language)}</button>
      </div>
    </div>
  {/if}

  <!-- ── CAMPAIGN GRID or EMPTY STATE ─────────────────────────────────────── -->
  {#if campaignStore.campaigns.length === 0}
    <div class="flex flex-col items-center gap-3 py-20 text-center text-text-muted">
      <IconCampaign size={64} class="opacity-20" aria-hidden="true" />
      <h2 class="text-xl font-semibold text-text-secondary">{ui('campaigns.empty_title', engine.settings.language)}</h2>
      <p class="text-sm max-w-sm">
        {#if sessionContext.isGameMaster}
          {ui('campaigns.empty_gm', engine.settings.language)}
        {:else}
          {ui('campaigns.empty_player', engine.settings.language)}
        {/if}
      </p>
    </div>

  {:else}
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {#each campaignStore.campaigns as campaign (campaign.id)}
        <button
          class="group flex flex-col text-left rounded-xl border border-border bg-surface
                 overflow-hidden transition-all duration-200
                 hover:border-accent hover:-translate-y-0.5 hover:shadow-lg hover:shadow-accent/10
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          onclick={() => openCampaign(campaign.id)}
          aria-label="Open campaign: {campaign.title}"
          type="button"
        >
          <!-- Poster / placeholder -->
          <div class="relative w-full h-40 shrink-0 overflow-hidden">
            {#if campaign.posterUrl}
              <img
                src={campaign.posterUrl}
                alt={campaign.title}
                class="w-full h-full object-cover"
              />
            {:else}
              <div
                class="w-full h-full flex items-center justify-center"
                style="background: linear-gradient(135deg, oklch(25% 0.08 280) 0%, oklch(30% 0.15 280) 60%, oklch(20% 0.10 280) 100%);"
                aria-hidden="true"
              >
                <IconCampaign size={48} class="opacity-30 text-accent" />
              </div>
            {/if}

            <!-- Hover CTA overlay -->
            <div class="absolute inset-0 flex items-end justify-end p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-150" aria-hidden="true">
              <span class="text-xs font-medium text-accent bg-surface/80 backdrop-blur-sm px-2 py-0.5 rounded-full">
                {ui('campaigns.open', engine.settings.language)}
              </span>
            </div>
          </div>

          <!-- Card body -->
          <div class="flex flex-col gap-2 p-4 flex-1">
            <h2 class="text-base font-semibold text-text-primary leading-tight">{campaign.title}</h2>

            {#if campaign.description}
              <p class="text-xs text-text-muted line-clamp-3 leading-relaxed">{campaign.description}</p>
            {/if}

            <!-- Chapter progress -->
            {#if campaign.chapters.length > 0}
              {@const completedCount = campaign.chapters.filter(ch => ch.isCompleted).length}
              {@const pct = Math.round((completedCount / campaign.chapters.length) * 100)}
              <div class="flex items-center gap-2 mt-auto pt-1">
                <span class="text-[10px] text-text-muted shrink-0">{completedCount}/{campaign.chapters.length}</span>
                <div
                  class="flex-1 h-1 bg-border rounded-full overflow-hidden"
                  role="progressbar"
                  aria-valuenow={completedCount}
                  aria-valuemin={0}
                  aria-valuemax={campaign.chapters.length}
                >
                  <div
                    class="h-full bg-accent rounded-full transition-all duration-300"
                    style="width: {pct}%"
                  ></div>
                </div>
                <span class="text-[10px] text-accent shrink-0">{pct}%</span>
              </div>
            {/if}
          </div>
        </button>
      {/each}
    </div>
  {/if}

  <!-- ── DEV TOOLBAR ───────────────────────────────────────────────────────── -->
  {#if import.meta.env.DEV}
    <div class="flex items-center gap-3 flex-wrap mt-4 p-3 rounded-lg border border-dashed border-border text-xs text-text-muted" aria-label="Developer toolbar">
      <span class="font-bold">{ui('nav.dev_prefix', engine.settings.language)}</span>
      <span class="{sessionContext.isGameMaster ? 'badge-accent' : 'badge-gray'} flex items-center gap-1">
        {#if sessionContext.isGameMaster}
          <IconGMDashboard size={11} aria-hidden="true" /> {ui('nav.role_gm', engine.settings.language)}
        {:else}
          <IconCharacter size={11} aria-hidden="true" /> {ui('nav.role_player', engine.settings.language)}
        {/if}
        ({sessionContext.currentUserDisplayName})
      </span>
      <button
        class="btn-ghost px-2 py-1 text-xs ml-auto"
        onclick={() => sessionContext.isGameMaster ? sessionContext.switchToPlayer() : sessionContext.switchToGM()}
        type="button"
      >
        {sessionContext.isGameMaster ? ui('nav.switch_to_player', engine.settings.language) : ui('nav.switch_to_gm', engine.settings.language)}
      </button>
    </div>
  {/if}

</div>
