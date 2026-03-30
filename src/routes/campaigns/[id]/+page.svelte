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
  import type { LocalizedString } from '$lib/types/i18n';
  import { ui } from '$lib/i18n/ui-strings';
  import { IconCampaign, IconVault, IconSettings, IconSpells, IconChecked, IconSuccess, IconBack } from '$lib/components/ui/icons';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import { getCampaignRoster, type RosterEntry } from '$lib/api/userApi';

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

  // ---------------------------------------------------------------------------
  // PARTY ROSTER — lightweight public data (player name + character name + level)
  // Fetched from GET /api/campaigns/{id}/roster which is accessible to all members.
  // Uses $effect so the data refreshes automatically on campaign navigation.
  // ---------------------------------------------------------------------------

  let roster = $state<RosterEntry[]>([]);

  $effect(() => {
    const id = campaignId;
    if (!id) return;
    getCampaignRoster(id)
      .then((r: RosterEntry[]) => { roster = r; })
      .catch((err: unknown) => console.warn('[CampaignDetail] Failed to load roster:', err));
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
   * Resolves a LocalizedString | string field (title or description) to the
   * active language. Handles three forms:
   *   1. Already-decoded LocalizedString object → engine.t() directly.
   *   2. JSON-encoded string `{"en":"…","fr":"…"}` → JSON.parse then engine.t().
   *   3. Plain string → returned as-is.
   */
  // ── Rule source pill colours ─────────────────────────────────────────────────
  // Uses the shared ruleSourcePalette utility (same as RuleSourcesPanel.svelte)
  // so that the same `ruleSource` identifier always maps to the same colour
  // on both the campaign detail page and the campaign settings page.
  import { ruleSourcePalette } from '$lib/utils/ruleSourceColors';

  interface RuleSourceFile { path: string; ruleSource: string; }
  let availableRuleSourceFiles = $state<RuleSourceFile[]>([]);

  $effect(() => {
    if (!sessionContext.isGameMaster) return;
    fetch('/api/rules/list', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then((files: RuleSourceFile[]) => { availableRuleSourceFiles = files; })
      .catch(() => { availableRuleSourceFiles = []; });
  });

  /** Maps each file path to its ruleSource group ID for colour lookup. */
  const pathToRuleSource = $derived(
    new Map(availableRuleSourceFiles.map(f => [f.path, f.ruleSource]))
  );

  /**
   * One entry per distinct ruleSource group that has at least one enabled file.
   * `isPartial` is true when only some (not all) files in the group are enabled.
   */
  interface RuleSourceGroup { id: string; isPartial: boolean; }
  const activeRuleSourceGroups = $derived((): RuleSourceGroup[] => {
    // Total file count per group across the full available list
    const totalPerGroup = new Map<string, number>();
    for (const f of availableRuleSourceFiles) {
      totalPerGroup.set(f.ruleSource, (totalPerGroup.get(f.ruleSource) ?? 0) + 1);
    }
    // Enabled file count per group
    const enabledPerGroup = new Map<string, number>();
    for (const path of (campaign?.enabledRuleSources ?? [])) {
      const rs = pathToRuleSource.get(path);
      if (rs) enabledPerGroup.set(rs, (enabledPerGroup.get(rs) ?? 0) + 1);
    }
    // Build ordered, de-duplicated group list
    const seen = new Set<string>();
    const groups: RuleSourceGroup[] = [];
    for (const path of (campaign?.enabledRuleSources ?? [])) {
      const rs = pathToRuleSource.get(path) ?? path;
      if (seen.has(rs)) continue;
      seen.add(rs);
      const enabled = enabledPerGroup.get(rs) ?? 0;
      const total   = totalPerGroup.get(rs) ?? 0;
      groups.push({ id: rs, isPartial: total > 0 && enabled < total });
    }
    return groups;
  });

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

    <!-- ── BANNER HEADER — uses PageHeader in banner mode ─────────────────── -->
    <!--
      Action buttons (Vault, Settings) are passed as the `actions` snippet so
      PageHeader renders them in the toolbar strip below the banner image.
      This keeps them part of the header rather than floating in the page body.
    -->
    <PageHeader
      title={resolveLocalized(campaign.title)}
      banner={{ src: campaign.bannerUrl ?? null, alt: ui('campaign.banner_alt', engine.settings.language).replace('{title}', resolveLocalized(campaign.title)) }}
      breadcrumb={{ href: '/campaigns', label: ui('nav.campaigns', engine.settings.language), ariaLabel: ui('nav.back_to_campaign_hub', engine.settings.language) }}
    >
      {#snippet actions()}
        <button class="btn-primary gap-1" onclick={() => goto(`/campaigns/${campaignId}/vault`)} type="button">
          <IconVault size={16} aria-hidden="true" /> {ui('campaign.character_vault', engine.settings.language)}
        </button>
        {#if sessionContext.isGameMaster}
          <button class="btn-secondary gap-1" onclick={() => goto(`/campaigns/${campaignId}/settings`)} type="button">
            <IconSettings size={16} aria-hidden="true" /> {ui('nav.settings', engine.settings.language)}
          </button>
        {/if}
      {/snippet}
    </PageHeader>

    <!-- ── BODY ───────────────────────────────────────────────────────────── -->
    <div class="max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">

      <!-- Description (may be a plain string or JSON-encoded LocalizedString) -->
      {#if campaign.description}
        <p class="text-text-secondary text-sm leading-relaxed">{resolveLocalized(campaign.description)}</p>
      {/if}

      <!-- ── PARTY ROSTER ───────────────────────────────────────────────────── -->
      <!--
        Shows "Players: John (Ravian Lv. 5), Olivia (Yggdogbert Lv. 4)".
        Accessible to all campaign members — the /roster endpoint only returns
        player names + character names + total level (no stats).
        Hidden while loading (roster is empty array until the fetch resolves).
      -->
      {#if roster.length > 0}
        <p class="text-sm text-text-secondary leading-relaxed">
          <span class="font-medium text-text-primary">{ui('campaign.players_label', engine.settings.language)}:</span>
          {#each roster as entry, i}
            {#if i > 0}<span aria-hidden="true">, </span>{/if}
            <!--
              Each entry: "PlayerName (CharName Lv. X)"
              If a player has multiple characters they appear in the same parentheses:
              "PlayerName (Char1 Lv. 5, Char2 Lv. 3)"
            -->
            <span>
              {entry.playerName}
              <span class="text-text-muted">
                ({#each entry.characters as char, j}{#if j > 0}, {/if}{char.name} {ui('campaign.level_abbrev', engine.settings.language)} {char.level}{/each})
              </span>
            </span>
          {/each}
        </p>
      {/if}

      <!-- ── CHAPTERS ────────────────────────────────────────────────────── -->
      <section aria-label={ui('campaign.chapters_section_aria', engine.settings.language)}>
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
          <ol class="flex flex-col gap-2" aria-label={ui('campaign.chapters_list_aria', engine.settings.language)}>
            {#each campaign.chapters as chapter, index (chapter.id)}
              <!-- Players only see completed chapters — hide incomplete ones to avoid spoilers -->
              {#if sessionContext.isGameMaster || chapter.isCompleted}
              <li
                class="flex items-start gap-3 rounded-xl border px-4 py-3 transition-colors duration-150
                       {chapter.isCompleted
                         ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-700/40 dark:bg-emerald-950/20'
                         : 'border-border bg-surface-alt hover:border-accent/40'}"
                aria-label={ui('campaign.chapter_item_aria', engine.settings.language).replace('{n}', String(index + 1)).replace('{title}', t(chapter.title))}
              >
                 <!-- Number / check badge -->
                <span
                  class="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold mt-0.5
                         {chapter.isCompleted
                           ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300/70 dark:bg-emerald-900/40 dark:text-emerald-300 dark:ring-emerald-700/50'
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
                  <h3 class="text-sm font-medium {chapter.isCompleted ? 'text-text-muted' : 'text-text-primary'}">
                    {t(chapter.title)}
                  </h3>
                  {#if chapter.description}
                    <p class="mt-0.5 text-xs text-text-muted leading-relaxed">{t(chapter.description)}</p>
                  {/if}

                  <!-- ── Task list ────────────────────────────────────────── -->
                  {#if chapter.tasks && chapter.tasks.length > 0}
                    <ul class="mt-2 flex flex-col gap-1" aria-label={ui('campaign.chapter_tasks_aria', engine.settings.language).replace('{title}', t(chapter.title))}>
                      {#each chapter.tasks as task (task.id)}
                        <!-- Players only see completed tasks -->
                        {#if sessionContext.isGameMaster || task.isCompleted}
                        <li class="flex items-center gap-2 text-xs py-1">
                          {#if sessionContext.isGameMaster}
                            <label class="flex items-center gap-2 cursor-pointer group flex-1 min-w-0">
                              <input
                                type="checkbox"
                                checked={task.isCompleted}
                                onchange={() => toggleTask(chapter.id, task.id)}
                                class="w-4 h-4 accent-accent shrink-0"
                                aria-label="{task.isCompleted
                                  ? ui('campaign.task_done', engine.settings.language)
                                  : ui('campaign.task_mark_done', engine.settings.language)}: {t(task.title)}"
                              />
                               <span class="truncate transition-colors
                                           {task.isCompleted
                                             ? 'text-text-muted'
                                             : 'text-text-secondary group-hover:text-text-primary'}">
                                {t(task.title)}
                              </span>
                            </label>
                          {:else}
                            <span class="shrink-0 w-3 h-3 flex items-center justify-center">
                              <IconChecked size={10} class="text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                            </span>
                            <span class="truncate text-text-muted">
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
                      aria-label={ui('campaign.chapter_toggle_aria', engine.settings.language).replace('{title}', t(chapter.title))}
                      class="sr-only"
                    />
                      <span
                      class="text-xs border rounded px-3 py-2 cursor-pointer flex items-center gap-1 transition-colors duration-150
                             {chapter.isCompleted
                               ? 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:border-emerald-600/50 dark:text-emerald-300 dark:hover:bg-emerald-900/40'
                               : 'border-border text-accent hover:bg-accent/10'}"
                      aria-hidden="true"
                    >
                      {#if chapter.isCompleted}<IconSuccess size={10} aria-hidden="true" /> {ui('campaign.completed', engine.settings.language)}{:else}{ui('campaign.mark_done', engine.settings.language)}{/if}
                    </span>
                  </label>
                {:else if chapter.isCompleted}
                  <span class="shrink-0 flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400" aria-hidden="true">
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
      <!--
        One pill per distinct ruleSource group, coloured via the shared
        ruleSourcePalette utility (same as RuleSourcesPanel.svelte) so that
        the same source group always appears in the same colour on both pages.
      -->
      {#if sessionContext.isGameMaster && campaign.enabledRuleSources.length > 0}
        <section class="border-t border-border pt-5" aria-label={ui('campaign.sources_section_aria', engine.settings.language)}>
          <h2 class="flex items-center gap-2 text-sm font-semibold text-accent mb-3">
            <IconSpells size={16} aria-hidden="true" /> {ui('campaign.active_sources', engine.settings.language)}
          </h2>
          <div class="flex flex-wrap gap-2">
            {#each activeRuleSourceGroups() as group}
              {@const gc = ruleSourcePalette(group.id)}
              <span class="border rounded overflow-hidden inline-flex items-center font-mono text-[10px] {gc.splitBorder}">
                <span class="px-2 py-0.5 {gc.splitLabel}">{group.id}</span>
                <span class="px-2 py-0.5 {gc.splitBadge}">{group.isPartial ? ui('campaign.source_partial', engine.settings.language) : ui('campaign.source_full', engine.settings.language)}</span>
              </span>
            {/each}
          </div>
        </section>
      {/if}

    </div>
  </div>
{/if}
