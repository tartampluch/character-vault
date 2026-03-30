<!--
  @file src/routes/campaigns/+page.svelte
  @description Campaign Hub — the list of all available campaigns.
  Phase 19.12: Migrated to Tailwind CSS — all scoped <style> removed.

  LAYOUT: max-w-5xl centered, responsive grid of campaign cards.
  Campaign cards: poster image (160px tall) + card body + hover CTA.
  "Create Campaign" button: visible only to GMs.
-->

<script lang="ts">
  import { onMount } from 'svelte';
  import { campaignStore } from '$lib/engine/CampaignStore.svelte';
  import { sessionContext } from '$lib/engine/SessionContext.svelte';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import { goto } from '$app/navigation';
  import { campaignTaskStats } from '$lib/types/campaign';
  import type { LocalizedString } from '$lib/types/i18n';
  import { IconCampaign, IconAdd, IconClose, IconPin, IconPinOff } from '$lib/components/ui/icons';
  import { sidebarPinsStore } from '$lib/engine/SidebarPinsStore.svelte';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';

  // Load campaigns from the PHP API when the hub mounts.
  // The store starts with mock data so the UI is never empty during the load.
  onMount(() => {
    campaignStore.loadFromApi();
  });

  let showCreateForm   = $state(false);
  let newCampaignTitle = $state('');

  async function handleCreateCampaign() {
    if (!newCampaignTitle.trim()) return;
    const campaign = await campaignStore.createInApi(newCampaignTitle.trim(), sessionContext.currentUserId);
    newCampaignTitle = '';
    showCreateForm = false;
    await goto(`/campaigns/${campaign.id}`);
  }

  /**
   * Resolves a LocalizedString | string field (title or description) to the
   * active language. Handles three forms:
   *   1. Already-decoded LocalizedString object → engine.t() directly.
   *   2. JSON-encoded string `{"en":"…","fr":"…"}` → JSON.parse then engine.t().
   *   3. Plain string → returned as-is.
   */
  function resolveLocalized(field: LocalizedString | string | undefined): string {
    if (!field) return '';
    if (typeof field !== 'string') return engine.t(field);
    try {
      const parsed = JSON.parse(field);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return engine.t(parsed as Record<string, string>);
      }
    } catch { /* not JSON — plain string */ }
    return field;
  }

  async function openCampaign(campaignId: string) {
    // Set the active campaign immediately so the sidebar contextual links
    // (Vault, GM Dashboard) reflect the new campaign before the navigation
    // transition completes.
    sessionContext.setActiveCampaign(campaignId);
    // Await the navigation so any caller can sequence after it if needed,
    // and so unhandled-rejection errors surface rather than being silently lost.
    await goto(`/campaigns/${campaignId}`);
  }
</script>

<PageHeader
  title={ui('campaigns.title', engine.settings.language)}
  subtitle={ui('campaigns.subtitle', engine.settings.language)}
  icon={IconCampaign}
>
  {#snippet actions()}
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
  {/snippet}
</PageHeader>

<div class="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">

  <!-- ── CREATE FORM (GM only, inline) ────────────────────────────────────── -->
  {#if showCreateForm && sessionContext.isGameMaster}
    <div class="card p-5 flex flex-col gap-4" role="form" aria-label={ui('campaigns.create_new_aria', engine.settings.language)}>
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
        <!--
          Wrapper div so pin button can be a sibling of the main click-target
          button without creating an invalid nested-button structure.
        -->
        <div class="relative group">
          <button
            class="group/card flex flex-col text-left rounded-xl border border-border bg-surface
                   overflow-hidden transition-all duration-200 w-full
                   hover:border-accent hover:-translate-y-0.5 hover:shadow-lg hover:shadow-accent/10
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            onclick={() => openCampaign(campaign.id)}
            aria-label={ui('campaigns.open_campaign_aria', engine.settings.language).replace('{title}', resolveLocalized(campaign.title))}
            type="button"
          >
            <!-- Poster / placeholder -->
            <div class="relative w-full h-40 shrink-0 overflow-hidden">
              {#if campaign.posterUrl}
                <img
                  src={campaign.posterUrl}
                  alt={resolveLocalized(campaign.title)}
                  class="w-full h-full object-cover"
                />
              {:else}
                <div
                  class="w-full h-full flex items-center justify-center
                         bg-gradient-to-br from-accent-100 to-accent-50
                         dark:from-accent-950 dark:to-accent-900"
                  aria-hidden="true"
                >
                  <IconCampaign size={48} class="opacity-30 text-accent" />
                </div>
              {/if}

              <!-- Hover CTA overlay -->
              <div class="absolute inset-0 flex items-end justify-end p-3 opacity-0 group-hover/card:opacity-100 transition-opacity duration-150" aria-hidden="true">
                <span class="text-xs font-medium text-accent bg-surface/80 backdrop-blur-sm px-2 py-0.5 rounded-full">
                  {ui('campaigns.open', engine.settings.language)}
                </span>
              </div>
            </div>

            <!-- Card body -->
            <div class="flex flex-col gap-2 p-4 flex-1">
              <h2 class="text-base font-semibold text-text-primary leading-tight">{resolveLocalized(campaign.title)}</h2>

              {#if campaign.description}
                <p class="text-xs text-text-muted line-clamp-3 leading-relaxed">{resolveLocalized(campaign.description)}</p>
              {/if}

              <!-- Chapter / task progress -->
              {#if campaign.chapters.length > 0}
                {@const stats = campaignTaskStats(campaign.chapters)}
                <div class="flex items-center gap-2 mt-auto pt-1">
                  <span class="text-[10px] text-text-muted shrink-0">{stats.completed}/{stats.total}</span>
                  <div
                    class="flex-1 h-1 bg-border rounded-full overflow-hidden"
                    role="progressbar"
                    aria-valuenow={stats.completed}
                    aria-valuemin={0}
                    aria-valuemax={stats.total}
                  >
                    <div
                      class="h-full bg-accent rounded-full transition-all duration-300"
                      style="width: {stats.pct}%"
                    ></div>
                  </div>
                  <span class="text-[10px] text-accent shrink-0">{stats.pct}%</span>
                </div>
              {/if}
            </div>
          </button>

          <!-- Pin button — top-left overlay, always visible when pinned, hover otherwise -->
          <button
            type="button"
            class="absolute top-2 left-2 z-10 p-1.5 rounded-md
                   bg-surface/80 backdrop-blur-sm
                   {sidebarPinsStore.isPinnedCampaign(campaign.id) ? 'text-accent opacity-100' : 'text-text-muted opacity-0 group-hover:opacity-100'}
                   hover:text-accent hover:bg-accent/10
                   transition-all duration-150
                   focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1
                   focus-visible:ring-accent"
            onclick={() => sidebarPinsStore.toggleCampaign(campaign.id)}
            aria-label={sidebarPinsStore.isPinnedCampaign(campaign.id)
              ? ui('nav.unpin_campaign', engine.settings.language) + ': ' + resolveLocalized(campaign.title)
              : ui('nav.pin_campaign', engine.settings.language) + ': ' + resolveLocalized(campaign.title)}
            title={sidebarPinsStore.isPinnedCampaign(campaign.id) ? ui('nav.unpin_campaign', engine.settings.language) : ui('nav.pin_campaign', engine.settings.language)}
          >
            {#if sidebarPinsStore.isPinnedCampaign(campaign.id)}
              <IconPinOff size={14} aria-hidden="true" />
            {:else}
              <IconPin size={14} aria-hidden="true" />
            {/if}
          </button>
        </div>
      {/each}
    </div>
  {/if}


</div>
