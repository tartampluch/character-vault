<!--
  @file src/routes/campaigns/[id]/+page.svelte
  @description Campaign Details page — banner, summary, chapters.
  Phase 19.12: Migrated to Tailwind CSS — all scoped <style> removed.

  LAYOUT:
    Full-width banner image (220px) with gradient overlay and title/back-link.
    Below: action bar, description, chapter list, rule sources (GM only).
-->

<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { campaignStore } from '$lib/engine/CampaignStore.svelte';
  import { sessionContext } from '$lib/engine/SessionContext.svelte';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { IconCampaign, IconVault, IconGMDashboard, IconSettings, IconSpells, IconChecked, IconSuccess, IconBack } from '$lib/components/ui/icons';

  const campaignId = $derived($page.params.id ?? '');
  const campaign   = $derived(campaignStore.getCampaign(campaignId));

  const chapterStats = $derived.by(() => {
    if (!campaign) return { total: 0, completed: 0, percent: 0 };
    const total     = campaign.chapters.length;
    const completed = campaign.chapters.filter(ch => ch.isCompleted).length;
    return { total, completed, percent: total > 0 ? Math.round((completed / total) * 100) : 0 };
  });

  $effect(() => {
    if (campaignId) sessionContext.setActiveCampaign(campaignId);
  });

  function toggleChapter(chapterId: string) {
    campaignStore.toggleChapterCompleted(campaignId, chapterId);
  }

  function t(textObj: Record<string, string> | string): string {
    return engine.t(textObj);
  }
</script>

{#if !campaign}
  <!-- Not found -->
  <div class="flex flex-col items-center gap-4 py-20 text-center text-text-muted px-6">
    <IconCampaign size={48} class="opacity-20" aria-hidden="true" />
    <h1 class="text-xl font-bold text-text-secondary">Campaign not found</h1>
    <p class="text-sm">The campaign with ID <code class="bg-surface-alt px-1.5 py-0.5 rounded text-xs">{campaignId}</code> doesn't exist.</p>
    <a href="/campaigns" class="btn-secondary gap-1 mt-2">
      <IconBack size={14} aria-hidden="true" /> Back to Campaign Hub
    </a>
  </div>

{:else}
  <div class="flex flex-col">

    <!-- ── BANNER ─────────────────────────────────────────────────────────── -->
    <div class="relative w-full h-52 overflow-hidden shrink-0">
      {#if campaign.bannerUrl}
        <img
          src={campaign.bannerUrl}
          alt="{campaign.title} banner"
          class="w-full h-full object-cover"
        />
      {:else}
        <div
          class="w-full h-full flex items-center justify-center"
          style="background: linear-gradient(135deg, oklch(25% 0.08 280) 0%, oklch(30% 0.15 280) 50%, oklch(20% 0.10 280) 100%);"
          aria-hidden="true"
        >
          <IconCampaign size={72} class="opacity-20 text-accent" />
        </div>
      {/if}

      <!-- Gradient overlay with back link + title.
           Uses Tailwind's from-black/80 to transparent via gradient utilities
           instead of inline rgba() to stay within the design system. -->
      <div class="absolute inset-0 flex flex-col justify-end gap-1 px-5 py-4
                  bg-gradient-to-t from-black/80 via-black/20 to-transparent">
        <a
          href="/campaigns"
          class="inline-flex items-center gap-1 text-xs text-white/60 hover:text-white transition-colors w-fit"
          aria-label="Back to Campaign Hub"
        >
          <IconBack size={12} aria-hidden="true" /> Campaigns
        </a>
        <h1 class="text-2xl font-bold text-white text-shadow-sm">{campaign.title}</h1>
      </div>
    </div>

    <!-- ── BODY ───────────────────────────────────────────────────────────── -->
    <div class="max-w-4xl w-full mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">

      <!-- Action bar -->
      <div class="flex gap-2 flex-wrap">
        <button class="btn-primary gap-1" onclick={() => goto(`/campaigns/${campaignId}/vault`)} type="button">
          <IconVault size={16} aria-hidden="true" /> Character Vault
        </button>
        {#if sessionContext.isGameMaster}
          <button class="btn-secondary gap-1" onclick={() => goto(`/campaigns/${campaignId}/gm-dashboard`)} type="button">
            <IconGMDashboard size={16} aria-hidden="true" /> GM Dashboard
          </button>
          <button class="btn-secondary gap-1" onclick={() => goto(`/campaigns/${campaignId}/settings`)} type="button">
            <IconSettings size={16} aria-hidden="true" /> Settings
          </button>
        {/if}
      </div>

      <!-- Description -->
      {#if campaign.description}
        <p class="text-text-secondary text-sm leading-relaxed">{campaign.description}</p>
      {/if}

      <!-- ── CHAPTERS ────────────────────────────────────────────────────── -->
      <section aria-label="Campaign chapters">
        <div class="flex items-center gap-4 flex-wrap mb-4">
          <h2 class="flex items-center gap-2 text-base font-semibold text-accent">
            <IconSpells size={18} aria-hidden="true" /> Chapters &amp; Acts
          </h2>
          {#if chapterStats.total > 0}
            <div class="flex items-center gap-2 flex-1 min-w-[160px]">
              <span class="text-xs text-text-muted whitespace-nowrap">{chapterStats.completed}/{chapterStats.total}</span>
              <div
                class="flex-1 h-1.5 bg-border rounded-full overflow-hidden"
                role="progressbar"
                aria-valuenow={chapterStats.completed}
                aria-valuemin={0}
                aria-valuemax={chapterStats.total}
              >
                <div class="h-full bg-accent rounded-full transition-all duration-300" style="width: {chapterStats.percent}%"></div>
              </div>
              <span class="text-xs text-accent font-medium">{chapterStats.percent}%</span>
            </div>
          {/if}
        </div>

        {#if campaign.chapters.length === 0}
          <div class="card p-5 text-sm text-text-muted text-center italic">
            {sessionContext.isGameMaster
              ? 'No chapters yet. Add chapters via GM Settings.'
              : 'No chapters have been added to this campaign yet.'}
          </div>
        {:else}
          <ol class="flex flex-col gap-2" aria-label="List of chapters">
            {#each campaign.chapters as chapter, index (chapter.id)}
              <li
                class="flex items-start gap-3 rounded-xl border px-4 py-3 transition-colors duration-150
                       {chapter.isCompleted
                         ? 'border-green-700/40 bg-green-950/10 dark:bg-green-950/20'
                         : 'border-border bg-surface-alt hover:border-accent/40'}"
                aria-label="Chapter {index + 1}: {t(chapter.title)}"
              >
                <!-- Number / check badge -->
                <span
                  class="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold mt-0.5
                         {chapter.isCompleted
                           ? 'bg-green-800/40 text-green-400'
                           : 'bg-surface-alt border border-border text-text-muted'}"
                  aria-hidden="true"
                >
                  {#if chapter.isCompleted}
                    <IconChecked size={14} />
                  {:else}
                    {index + 1}
                  {/if}
                </span>

                <!-- Content -->
                <div class="flex-1 min-w-0">
                  <h3 class="text-sm font-medium {chapter.isCompleted ? 'text-text-muted line-through decoration-green-600/40' : 'text-text-primary'}">
                    {t(chapter.title)}
                  </h3>
                  {#if chapter.description}
                    <p class="mt-0.5 text-xs text-text-muted leading-relaxed">{t(chapter.description)}</p>
                  {/if}
                </div>

                <!-- GM toggle / player status -->
                {#if sessionContext.isGameMaster}
                  <label
                    class="shrink-0 cursor-pointer"
                    title={chapter.isCompleted ? 'Mark as incomplete' : 'Mark as completed'}
                  >
                    <input
                      type="checkbox"
                      checked={chapter.isCompleted}
                      onchange={() => toggleChapter(chapter.id)}
                      aria-label="Toggle completion for {t(chapter.title)}"
                      class="sr-only"
                    />
                    <span
                      class="text-xs border rounded px-2 py-0.5 cursor-pointer flex items-center gap-1 transition-colors duration-150
                             {chapter.isCompleted
                               ? 'border-green-600/50 text-green-400 hover:bg-green-900/20'
                               : 'border-border text-accent hover:bg-accent/10'}"
                      aria-hidden="true"
                    >
                      {#if chapter.isCompleted}<IconSuccess size={10} aria-hidden="true" /> Completed{:else}Mark done{/if}
                    </span>
                  </label>
                {:else if chapter.isCompleted}
                  <span class="shrink-0 flex items-center gap-1 text-xs text-green-400" aria-hidden="true">
                    <IconSuccess size={12} aria-hidden="true" /> Done
                  </span>
                {/if}
              </li>
            {/each}
          </ol>
        {/if}
      </section>

      <!-- ── RULE SOURCES (GM only) ────────────────────────────────────────── -->
      {#if sessionContext.isGameMaster && campaign.enabledRuleSources.length > 0}
        <section class="border-t border-border pt-5" aria-label="Active rule sources">
          <h2 class="flex items-center gap-2 text-sm font-semibold text-accent mb-3">
            <IconSpells size={16} aria-hidden="true" /> Active Rule Sources
          </h2>
          <div class="flex flex-wrap gap-2 mb-2">
            {#each campaign.enabledRuleSources as sourceId}
              <span class="badge-accent font-mono text-[10px]">{sourceId}</span>
            {/each}
          </div>
          <p class="text-xs text-text-muted">
            Manage rule sources in <a href="/campaigns/{campaignId}/settings" class="text-accent hover:underline">GM Settings</a>.
          </p>
        </section>
      {/if}

    </div>
  </div>
{/if}
