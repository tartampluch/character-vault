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
  import { apiHeaders } from '$lib/engine/StorageManager';
  import { campaignTaskStats } from '$lib/types/campaign';
  import { ui } from '$lib/i18n/ui-strings';
  import { IconCampaign, IconVault, IconGMDashboard, IconSettings, IconSpells, IconChecked, IconSuccess, IconBack } from '$lib/components/ui/icons';

  const campaignId = $derived($page.params.id ?? '');
  const campaign   = $derived(campaignStore.getCampaign(campaignId));

  const chapterStats = $derived.by(() => {
    if (!campaign) return { total: 0, completed: 0, percent: 0 };
    // campaignTaskStats() computes `pct` via Math.round internally — use it directly
    // rather than duplicating the arithmetic here (zero-arithmetic-in-Svelte,
    // ARCHITECTURE.md §3). The `pct` field is the canonical campaign progress percentage.
    const { total, completed, pct } = campaignTaskStats(campaign.chapters);
    return { total, completed, percent: pct };
  });

  $effect(() => {
    if (campaignId) sessionContext.setActiveCampaign(campaignId);
  });

  /** Sends the current chapter list (including tasks) to the API. */
  async function persistChapters() {
    const updated = campaignStore.getCampaign(campaignId);
    if (!updated) return;
    try {
      await fetch(`/api/campaigns/${campaignId}`, {
        method: 'PUT',
        headers: apiHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          chapters: updated.chapters.map(ch => ({
            id: ch.id,
            title: ch.title,
            description: ch.description,
            isCompleted: ch.isCompleted,
            tasks: (ch.tasks ?? []).map(t => ({
              id: t.id,
              title: t.title,
              isCompleted: t.isCompleted,
            })),
          })),
        }),
      });
    } catch (err) {
      console.warn('[CampaignDetail] Failed to persist chapters:', err);
    }
  }

  async function toggleChapter(chapterId: string) {
    campaignStore.toggleChapterCompleted(campaignId, chapterId);
    await persistChapters();
  }

  async function toggleTask(chapterId: string, taskId: string) {
    campaignStore.toggleTaskCompleted(campaignId, chapterId, taskId);
    await persistChapters();
  }

  function t(textObj: Record<string, string> | string): string {
    return engine.t(textObj);
  }

  /**
   * Resolves the campaign description, which may be a plain string or a
   * JSON-encoded LocalizedString `{"en":"...", "fr":"..."}`.
   * Falls back gracefully to the raw string if JSON parsing fails.
   */
  function resolveDescription(desc: string): string {
    if (!desc) return '';
    try {
      const parsed = JSON.parse(desc);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return engine.t(parsed as Record<string, string>);
      }
    } catch { /* not JSON — plain string */ }
    return desc;
  }
</script>

{#if !campaign}
  <!-- Not found -->
  <div class="flex flex-col items-center gap-4 py-20 text-center text-text-muted px-6">
    <IconCampaign size={48} class="opacity-20" aria-hidden="true" />
    <h1 class="text-xl font-bold text-text-secondary">{ui('campaign.not_found', engine.settings.language)}</h1>
    <p class="text-sm">{ui('campaign.not_found_desc', engine.settings.language)}</p>
    <a href="/campaigns" class="btn-secondary gap-1 mt-2">
      <IconBack size={14} aria-hidden="true" /> {ui('campaign.back_to_hub', engine.settings.language)}
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
        <!--
          Placeholder gradient: Tailwind light/dark classes replace the
          previous inline style with hardcoded dark oklch values.
          Light: pale accent tint; Dark: deep atmospheric navy.
        -->
        <div
          class="w-full h-full flex items-center justify-center
                 bg-gradient-to-br from-accent-100 to-accent-50
                 dark:from-accent-950 dark:to-accent-900"
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
          aria-label={ui('nav.back_to_campaign_hub', engine.settings.language)}
        >
          <IconBack size={12} aria-hidden="true" /> {ui('nav.campaigns', engine.settings.language)}
        </a>
        <h1 class="text-2xl font-bold text-white text-shadow-sm">{campaign.title}</h1>
      </div>
    </div>

    <!-- ── BODY ───────────────────────────────────────────────────────────── -->
    <div class="max-w-4xl w-full mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">

      <!-- Action bar -->
      <div class="flex gap-2 flex-wrap">
        <button class="btn-primary gap-1" onclick={() => goto(`/campaigns/${campaignId}/vault`)} type="button">
          <IconVault size={16} aria-hidden="true" /> {ui('campaign.character_vault', engine.settings.language)}
        </button>
        {#if sessionContext.isGameMaster}
          <button class="btn-secondary gap-1" onclick={() => goto(`/campaigns/${campaignId}/gm-dashboard`)} type="button">
            <IconGMDashboard size={16} aria-hidden="true" /> {ui('nav.gm_dashboard', engine.settings.language)}
          </button>
          <button class="btn-secondary gap-1" onclick={() => goto(`/campaigns/${campaignId}/settings`)} type="button">
            <IconSettings size={16} aria-hidden="true" /> {ui('nav.settings', engine.settings.language)}
          </button>
        {/if}
      </div>

      <!-- Description (may be a plain string or JSON-encoded LocalizedString) -->
      {#if campaign.description}
        <p class="text-text-secondary text-sm leading-relaxed">{resolveDescription(campaign.description)}</p>
      {/if}

      <!-- ── CHAPTERS ────────────────────────────────────────────────────── -->
      <section aria-label="Campaign chapters">
        <div class="flex items-center gap-4 flex-wrap mb-4">
          <h2 class="flex items-center gap-2 text-base font-semibold text-accent">
            <IconSpells size={20} aria-hidden="true" /> {ui('campaign.chapters_title', engine.settings.language)}
          </h2>
          {#if chapterStats.total > 0}
            <div class="flex items-center gap-2 flex-1 min-w-[160px]">
              <span class="text-xs text-text-muted whitespace-nowrap">
                {ui('campaign.tasks_total', engine.settings.language)
                  .replace('{completed}', String(chapterStats.completed))
                  .replace('{total}',     String(chapterStats.total))}
              </span>
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
          <div class="card p-5 text-sm text-text-muted text-center italic flex flex-col items-center gap-3">
            <span>{sessionContext.isGameMaster
              ? ui('campaign.chapters_empty_gm', engine.settings.language)
              : ui('campaign.chapters_empty_player', engine.settings.language)}</span>
            {#if sessionContext.isGameMaster}
              <a
                href="/campaigns/{campaignId}/settings#chapters"
                class="btn-secondary inline-flex items-center gap-1 text-xs not-italic"
              >
                <IconSettings size={12} aria-hidden="true" /> {ui('nav.campaign_settings', engine.settings.language)}
              </a>
            {/if}
          </div>
        {:else}
          <ol class="flex flex-col gap-2" aria-label="List of chapters">
            {#each campaign.chapters as chapter, index (chapter.id)}
              <!-- Players only see completed chapters — hide incomplete ones to avoid spoilers -->
              {#if sessionContext.isGameMaster || chapter.isCompleted}
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

                  <!-- ── Task list ────────────────────────────────────────── -->
                  {#if chapter.tasks && chapter.tasks.length > 0}
                    <ul class="mt-2 flex flex-col gap-1" aria-label="Tasks for {t(chapter.title)}">
                      {#each chapter.tasks as task (task.id)}
                        <!-- Players only see completed tasks -->
                        {#if sessionContext.isGameMaster || task.isCompleted}
                        <li class="flex items-center gap-2 text-xs">
                          {#if sessionContext.isGameMaster}
                            <label class="flex items-center gap-2 cursor-pointer group flex-1 min-w-0">
                              <input
                                type="checkbox"
                                checked={task.isCompleted}
                                onchange={() => toggleTask(chapter.id, task.id)}
                                class="w-3 h-3 accent-accent shrink-0"
                                aria-label="{task.isCompleted
                                  ? ui('campaign.task_done', engine.settings.language)
                                  : ui('campaign.task_mark_done', engine.settings.language)}: {t(task.title)}"
                              />
                              <span class="truncate transition-colors
                                           {task.isCompleted
                                             ? 'text-text-muted line-through decoration-green-600/40'
                                             : 'text-text-secondary group-hover:text-text-primary'}">
                                {t(task.title)}
                              </span>
                            </label>
                          {:else}
                            <span class="shrink-0 w-3 h-3 flex items-center justify-center">
                              <IconChecked size={10} class="text-green-400" aria-hidden="true" />
                            </span>
                            <span class="truncate text-text-muted line-through decoration-green-600/40">
                              {t(task.title)}
                            </span>
                          {/if}
                        </li>
                        {/if}
                      {/each}
                    </ul>
                  {/if}
                </div>

                <!-- GM toggle / player status -->
                {#if sessionContext.isGameMaster}
                  <label
                    class="shrink-0 cursor-pointer"
                    title={chapter.isCompleted ? ui('campaign.mark_incomplete', engine.settings.language) : ui('campaign.mark_completed', engine.settings.language)}
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
                      {#if chapter.isCompleted}<IconSuccess size={10} aria-hidden="true" /> {ui('campaign.completed', engine.settings.language)}{:else}{ui('campaign.mark_done', engine.settings.language)}{/if}
                    </span>
                  </label>
                {:else if chapter.isCompleted}
                  <span class="shrink-0 flex items-center gap-1 text-xs text-green-400" aria-hidden="true">
                    <IconSuccess size={12} aria-hidden="true" /> {ui('campaign.done', engine.settings.language)}
                  </span>
                {/if}
              </li>
              {/if}
            {/each}
          </ol>
        {/if}
      </section>

      <!-- ── RULE SOURCES (GM only) ────────────────────────────────────────── -->
      {#if sessionContext.isGameMaster && campaign.enabledRuleSources.length > 0}
        <section class="border-t border-border pt-5" aria-label="Active rule sources">
          <h2 class="flex items-center gap-2 text-sm font-semibold text-accent mb-3">
            <IconSpells size={16} aria-hidden="true" /> {ui('campaign.active_sources', engine.settings.language)}
          </h2>
          <div class="flex flex-wrap gap-2 mb-2">
            {#each campaign.enabledRuleSources as sourceId}
              <span class="badge-accent font-mono text-[10px]">{sourceId}</span>
            {/each}
          </div>
          <p class="text-xs text-text-muted">
            {ui('campaign.manage_sources_hint', engine.settings.language)}
          </p>
        </section>
      {/if}

    </div>
  </div>
{/if}
