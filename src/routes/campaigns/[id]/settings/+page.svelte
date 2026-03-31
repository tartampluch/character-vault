<!--
  @file src/routes/campaigns/[id]/settings/+page.svelte
  @description GM-only Campaign Settings — tab-based layout.

  LAYOUT:
    PageHeader  (sticky top-0, from PageHeader component)
    Tab bar     (sticky below header, scrollable on narrow screens)
    Tab content (one panel rendered at a time, scrolls within the page)

  TABS:
    • info         → CampaignInfoPanel      (title & localized description)
    • chapters     → ChaptersPanel          (chapter / act CRUD)
    • members      → MembershipPanel        (player membership management)
    • rule_sources → RuleSourcesPanel       (enable / order rule source files)
    • rules_gen    → CharacterCreationPanel (Dice Rules + Stat Generation)
                     + VariantRulesPanel    (Gestalt + Vitality/WP)
    • gm_overrides → GmOverridesPanel       (campaign-wide JSON overrides)

  TAB STATE:
    Driven by the `?tab=` URL query parameter so tabs are deep-linkable and
    survive a page refresh. `replaceState: true` on each switch prevents
    polluting the browser history with intermediate tab visits.

  SAVE BEHAVIOUR:
    A single "Save Settings" button in the PageHeader header persists ALL tabs'
    state at once via a single PUT to /api/campaigns/{id}. The active tab does
    not affect which data is saved.
-->

<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { sessionContext } from '$lib/engine/SessionContext.svelte';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { campaignStore } from '$lib/engine/CampaignStore.svelte';
  import { apiHeaders } from '$lib/engine/StorageManager';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { ui } from '$lib/i18n/ui-strings';
  import { getCachedBanner, setCachedBanner, evictStaleBannerEntries } from '$lib/utils/bannerCache';
  import { isImageDataUri } from '$lib/utils/bannerImageUtils';
  import { getGmGlobalOverrides, setGmGlobalOverrides } from '$lib/api/serverSettingsApi';

  // ── Icons — one per tab plus the page-level icon ──────────────────────────
  import {
    IconSettings, IconWarning,
    IconCampaign,      // Campaign Info tab
    IconJournal,       // Chapters tab
    IconVault,         // Members tab
    IconRuleSources,   // Rule Sources tab
    IconDiceRoll,      // Rules & Generation tab
    IconEdit,          // Campaign Content tab
    IconGMDashboard,   // GM Overrides tab
  } from '$lib/components/ui/icons';

  import PageHeader            from '$lib/components/layout/PageHeader.svelte';
  import Toast                 from '$lib/components/ui/Toast.svelte';
  import CampaignInfoPanel     from '$lib/components/settings/CampaignInfoPanel.svelte';
  import ChaptersPanel         from '$lib/components/settings/ChaptersPanel.svelte';
  import MembershipPanel       from '$lib/components/settings/MembershipPanel.svelte';
  import RuleSourcesPanel      from '$lib/components/settings/RuleSourcesPanel.svelte';
  import CharacterCreationPanel from '$lib/components/settings/CharacterCreationPanel.svelte';
  import VariantRulesPanel     from '$lib/components/settings/VariantRulesPanel.svelte';
  import GmOverridesPanel      from '$lib/components/settings/GmOverridesPanel.svelte';
  import CampaignContentPanel  from '$lib/components/settings/CampaignContentPanel.svelte';
  import { homebrewStore }      from '$lib/engine/HomebrewStore.svelte';

  // ── EditableChapter / EditableTask types ──────────────────────────────────
  // These mirror the internal interfaces of ChaptersPanel. They cannot be
  // imported directly from a Svelte component script, so they are re-declared
  // here. Both must stay in sync with ChaptersPanel.svelte.
  interface EditableTask {
    id: string;
    title: Record<string, string>;
    isCompleted: boolean;
  }
  interface EditableChapter {
    id: string;
    title: Record<string, string>;
    description: Record<string, string>;
    isCompleted: boolean;
    tasks: EditableTask[];
  }

  // ===========================================================================
  // TABS DEFINITION
  // Data-driven tab list — labels resolved through ui() so they are translated.
  // Icons reuse the same icon already shown in each panel's section header,
  // keeping visual language consistent between the tab and the content within.
  // ===========================================================================

  const SETTINGS_TABS = [
    { key: 'info',         labelKey: 'settings.tabs.info',         icon: IconCampaign    },
    { key: 'chapters',     labelKey: 'settings.tabs.chapters',     icon: IconJournal     },
    { key: 'members',      labelKey: 'settings.tabs.members',      icon: IconVault       },
    { key: 'rule_sources',     labelKey: 'settings.tabs.rule_sources',     icon: IconRuleSources },
    { key: 'rules_gen',        labelKey: 'settings.tabs.rules_gen',        icon: IconDiceRoll    },
    { key: 'campaign_content', labelKey: 'settings.tabs.campaign_content', icon: IconEdit        },
    { key: 'gm_overrides',     labelKey: 'settings.tabs.gm_overrides',     icon: IconGMDashboard },
  ] as const;

  type SettingsTabKey = (typeof SETTINGS_TABS)[number]['key'];

  // ===========================================================================
  // DERIVED STATE
  // ===========================================================================

  /** Campaign ID from the SvelteKit route parameter `/campaigns/[id]/settings`. */
  const campaignId = $derived($page.params.id ?? '');

  /** Live campaign object from the in-memory campaign store. */
  const campaign   = $derived(campaignStore.getCampaign(campaignId));

  /** Active UI language — used for all ui() calls in this script. */
  const lang       = $derived(engine.settings.language);

  /**
   * Active settings tab from the `?tab=` query parameter.
   * Defaults to 'info' when no parameter is present or when the value is unknown.
   * Invalid values fall through to the default branch in the tab content block.
   */
  const activeTab = $derived<SettingsTabKey>(
    ($page.url.searchParams.get('tab') as SettingsTabKey) ?? 'info'
  );

  // ===========================================================================
  // GM GUARD
  // Redirect non-GM users back to the campaign detail page immediately.
  // ===========================================================================

  $effect(() => {
    if (!sessionContext.isGameMaster) goto(`/campaigns/${campaignId}`);
  });

  // ===========================================================================
  // TAB NAVIGATION
  // ===========================================================================

  /**
   * Navigate to a settings tab by updating the `?tab=` query parameter.
   * `replaceState: true` avoids polluting the browser history with each switch.
   */
  function switchTab(tabKey: SettingsTabKey): void {
    goto(`/campaigns/${campaignId}/settings?tab=${tabKey}`, { replaceState: true });
  }

  // ===========================================================================
  // CAMPAIGN INFO STATE (title & description)
  // ===========================================================================

   // ===========================================================================
   // BANNER IMAGE STATE
   // Fetched lazily from GET /api/campaigns/{id} (the list endpoint omits it).
   // Cached in sessionStorage keyed by `{campaignId}:{updatedAt}`.
   // ===========================================================================

   let editableBannerImageData: string | null = $state(null);
   let savedBannerImageData:   string | null = $state(null);
   let bannerInitialised       = false;
   // eslint-disable-next-line @typescript-eslint/no-unused-vars
   let bannerLoading           = $state(false);

   $effect(() => {
     const c = campaign;
     if (!c || bannerInitialised) return;
     bannerInitialised = true;

      // 1. Fast path — check sessionStorage cache first.
      const cached = getCachedBanner(campaignId, c.updatedAt);
      if (cached) {
        editableBannerImageData = cached;
        savedBannerImageData    = cached;
        return;
      }

      // 2. Slow path — fetch the full campaign (show endpoint returns bannerImageData).
      bannerLoading = true;
      fetch(`/api/campaigns/${campaignId}`, {
        headers:     apiHeaders(),
        credentials: 'include',
      })
        .then(async r => {
          if (!r.ok) return;
          const data = await r.json() as { bannerImageData?: string; updatedAt?: number };
          if (isImageDataUri(data.bannerImageData)) {
            editableBannerImageData = data.bannerImageData!;
            savedBannerImageData    = data.bannerImageData!;
            // Cache using the campaign's current updatedAt so the cache is
            // automatically stale after the next save (new updatedAt = new key).
            const ts = data.updatedAt ?? c.updatedAt;
            setCachedBanner(campaignId, ts, data.bannerImageData!);
          }
        })
       .catch(err => console.warn('[Settings] Failed to load banner:', err))
       .finally(() => { bannerLoading = false; });
   });

   // ===========================================================================
   // CAMPAIGN INFO STATE (title & description)
   // ===========================================================================

   /**
    * Normalises a LocalizedString | string value to a plain Record<string,string>
    * suitable for LocalizedStringEditor:
    *   - LocalizedString object   → used as-is
    *   - JSON-encoded string      → JSON.parsed
    *   - Plain string             → wrapped as { en: value }
    *   - Empty / missing          → { en: '' }
    */
   function toLocalizedRecord(
    field: Record<string, string> | string | undefined,
  ): Record<string, string> {
    if (!field) return { en: '' };
    if (typeof field !== 'string') return { ...field };
    try {
      const parsed = JSON.parse(field);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, string>;
      }
    } catch { /* not JSON — treat as a plain English string */ }
    return { en: field };
  }

  let editableTitle       = $state<Record<string, string>>({ en: '' });
  let editableDescription = $state<Record<string, string>>({ en: '' });
  let savedTitle          = $state<Record<string, string>>({ en: '' });
  let savedDescription    = $state<Record<string, string>>({ en: '' });
  let infoInitialised     = false;

  $effect(() => {
    const c = campaign;
    if (!c || infoInitialised) return;
    editableTitle       = toLocalizedRecord(c.title as Record<string, string> | string);
    editableDescription = toLocalizedRecord(c.description as Record<string, string> | string);
    infoInitialised     = true;
    savedTitle          = { ...editableTitle };
    savedDescription    = { ...editableDescription };
  });

  // ===========================================================================
  // ENABLED RULE SOURCES STATE
  // ===========================================================================

  let enabledSources     = $state<string[]>([]);
  let savedSources       = $state<string[]>([]);
  let sourcesInitialised = false;

  $effect(() => {
    const sources = campaign?.enabledRuleSources;
    if (sources && !sourcesInitialised) {
      enabledSources     = [...sources];
      savedSources       = [...sources];
      sourcesInitialised = true;
    }
  });

  // ===========================================================================
  // GM OVERRIDES STATE
  // ===========================================================================
  //
  // GM global overrides are now server-wide (not per-campaign) and live in the
  // `server_settings` table.  We fetch them once from
  //   GET /api/server-settings/gm-overrides
  // and save them separately (not bundled with the campaign PUT) via
  //   PUT /api/server-settings/gm-overrides
  //

  let gmOverridesText      = $state('[]');
  let savedGmOverridesText = $state('[]');
  let isValidJson          = $state(true);
  let overridesInitialised = false;

  $effect(() => {
    // Only fetch once per page load (avoid re-fetching on every reactive update).
    if (overridesInitialised) return;
    // Guard: don't fetch until the user is confirmed to be a GM (the panel is GM-only).
    if (!sessionContext.isGameMaster) return;
    overridesInitialised = true;

    // Fetch global GM overrides from the server settings endpoint.
    // This replaces the old `campaign?.gmGlobalOverrides` read.
    getGmGlobalOverrides().then(overrides => {
      gmOverridesText      = overrides;
      savedGmOverridesText = overrides;
    });
  });

  // ===========================================================================
  // CHAPTERS STATE
  // ===========================================================================

  let editableChapters = $state<EditableChapter[]>([]);
  let savedChapters    = $state<EditableChapter[]>([]);
  let syncedUpdatedAt  = $state<number>(-1);
  let chaptersAreDirty = $state(false);

  $effect(() => {
    const c = campaign;
    if (!c) return;
    // Re-sync chapters from the server only when:
    //   • First load (syncedUpdatedAt is still the sentinel value -1), OR
    //   • The server version is newer AND local edits have already been saved.
    if (syncedUpdatedAt === -1 || (!chaptersAreDirty && c.updatedAt > syncedUpdatedAt)) {
      editableChapters = (c.chapters ?? []).map(ch => ({
        id: ch.id,
        title: { ...ch.title },
        description: { ...ch.description },
        isCompleted: ch.isCompleted,
        tasks: (
          (ch as unknown as Record<string, unknown>)['tasks'] as EditableTask[] ?? []
        ).map((t: EditableTask) => ({
          id: t.id,
          title: { ...t.title },
          isCompleted: t.isCompleted,
        })),
      }));
      syncedUpdatedAt  = c.updatedAt;
      chaptersAreDirty = false;
      savedChapters    = JSON.parse(JSON.stringify(editableChapters));
    }
  });

  // ===========================================================================
  // DICE / STAT-GEN / VARIANT SETTINGS STATE
  // ===========================================================================

  let explodingTwenties = $state(false);
  let rerollOnes        = $state(false);
  let pointBuyBudget    = $state(25);
  let allowedRoll       = $state(true);
  let allowedPointBuy   = $state(true);
  let allowedStdArray   = $state(true);
  let variantGestalt    = $state(false);
  let variantVWP        = $state(false);

  // Saved snapshots for dirty detection (mirrors the live values above)
  let savedExplodingTwenties = $state(false);
  let savedRerollOnes        = $state(false);
  let savedPointBuyBudget    = $state(25);
  let savedAllowedRoll       = $state(true);
  let savedAllowedPointBuy   = $state(true);
  let savedAllowedStdArray   = $state(true);
  let savedVariantGestalt    = $state(false);
  let savedVariantVWP        = $state(false);

  /**
   * Derives the allowed stat generation methods array from the individual
   * toggle booleans. The first item is used as the default method for new
   * characters (falls back to 'point_buy' when all toggles are off).
   */
  const allowedMethods = $derived.by((): Array<'roll' | 'point_buy' | 'standard_array'> => {
    const methods: Array<'roll' | 'point_buy' | 'standard_array'> = [];
    if (allowedRoll)     methods.push('roll');
    if (allowedPointBuy) methods.push('point_buy');
    if (allowedStdArray) methods.push('standard_array');
    return methods;
  });

  let diceSettingsInitialised = false;

  $effect(() => {
    const cs = campaign?.campaignSettings;
    if (!diceSettingsInitialised && cs && !Array.isArray(cs)) {
      explodingTwenties = cs.diceRules?.explodingTwenties            ?? false;
      rerollOnes        = cs.statGeneration?.rerollOnes               ?? false;
      pointBuyBudget    = cs.statGeneration?.pointBuyBudget           ?? 25;
      const methods     = cs.statGeneration?.allowedMethods
                          ?? ['roll', 'point_buy', 'standard_array'];
      allowedRoll       = methods.includes('roll');
      allowedPointBuy   = methods.includes('point_buy');
      allowedStdArray   = methods.includes('standard_array');
      variantGestalt    = cs.variantRules?.gestalt                    ?? false;
      variantVWP        = cs.variantRules?.vitalityWoundPoints        ?? false;
      diceSettingsInitialised  = true;
      savedExplodingTwenties   = explodingTwenties;
      savedRerollOnes          = rerollOnes;
      savedPointBuyBudget      = pointBuyBudget;
      savedAllowedRoll         = allowedRoll;
      savedAllowedPointBuy     = allowedPointBuy;
      savedAllowedStdArray     = allowedStdArray;
      savedVariantGestalt      = variantGestalt;
      savedVariantVWP          = variantVWP;
    }
  });

  // ===========================================================================
  // TAB DIRTY STATE
  // Per-tab unsaved-changes indicators shown as an amber bullet in the tab bar.
  // Each derived compares the current editable value against its saved snapshot
  // (set on first load and reset to the new value after every successful save).
  // ===========================================================================

  /** Dirty state for the Members tab — written back by MembershipPanel. */
  let membersAreDirty = $state(false);

  const infoIsDirty = $derived.by(() =>
    JSON.stringify(editableTitle)       !== JSON.stringify(savedTitle)       ||
    JSON.stringify(editableDescription) !== JSON.stringify(savedDescription) ||
    editableBannerImageData             !== savedBannerImageData
  );

  const ruleSourcesAreDirty = $derived.by(() => {
    if (enabledSources.length !== savedSources.length) return true;
    return enabledSources.some((s, i) => s !== savedSources[i]);
  });

  const rulesGenAreDirty = $derived.by(() =>
    explodingTwenties !== savedExplodingTwenties ||
    rerollOnes        !== savedRerollOnes        ||
    pointBuyBudget    !== savedPointBuyBudget    ||
    allowedRoll       !== savedAllowedRoll       ||
    allowedPointBuy   !== savedAllowedPointBuy   ||
    allowedStdArray   !== savedAllowedStdArray   ||
    variantGestalt    !== savedVariantGestalt    ||
    variantVWP        !== savedVariantVWP
  );

  const gmOverridesAreDirty = $derived(gmOverridesText !== savedGmOverridesText);

  /** Maps each tab key → whether it has unsaved changes (drives the tab-bar bullet). */
  const tabDirtyMap = $derived.by((): Record<SettingsTabKey, boolean> => ({
    info:             infoIsDirty,
    chapters:         JSON.stringify(editableChapters) !== JSON.stringify(savedChapters),
    members:          membersAreDirty,
    rule_sources:     ruleSourcesAreDirty,
    rules_gen:        rulesGenAreDirty,
    campaign_content: homebrewStore.isDirty,
    gm_overrides:     gmOverridesAreDirty,
  }));

  // ===========================================================================
  // SAVE
  // The save action persists every tab's state at once — the active tab does
  // not affect which data is sent. This matches the single "Save" button UX:
  // the GM configures settings across multiple tabs and saves once at the end.
  // ===========================================================================

  let isSaving      = $state(false);
  let toastMessage  = $state('');
  let toastVariant  = $state<'success' | 'warning'>('success');
  /** True when the last save attempt failed to reach the API. Cleared on next
   *  successful save. Drives the warning icon on the Save button. */
  let saveHasError  = $state(false);

  /**
   * Commit function exposed by MembershipPanel via $bindable.
   * Called during saveSettings() to persist any pending character
   * enrollment / unenrollment operations.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let commitMembership = $state<() => Promise<void>>(() => Promise.resolve());

  async function saveSettings(): Promise<void> {
    if (!isValidJson) return;
    isSaving = true; toastMessage = '';

    // 1. Apply dice / stat / variant settings to the in-memory game engine so
    //    characters open in other tabs reflect the new rules immediately.
    engine.updateSettings({
      enabledRuleSources: [...enabledSources],
      diceRules:      { explodingTwenties },
      statGeneration: {
        method:         allowedMethods[0] ?? 'point_buy',
        rerollOnes,
        pointBuyBudget,
        allowedMethods,
      },
      variantRules:   { gestalt: variantGestalt, vitalityWoundPoints: variantVWP },
    });

    // 2. Reload rule sources with the new configuration (async, non-blocking).
    dataLoader
      .loadRuleSources(enabledSources, gmOverridesText)
      .catch(e => console.warn('[Settings] DataLoader reload failed:', e));

    // 3. Persist to the PHP API (falls back to a local confirmation on error).
    try {
      const chaptersPayload = editableChapters.map(ch => ({
        id:          ch.id,
        title:       ch.title,
        description: ch.description,
        isCompleted: ch.isCompleted,
        tasks:       ch.tasks.map((t: EditableTask) => ({
          id:          t.id,
          title:       t.title,
          isCompleted: t.isCompleted,
        })),
      }));

      // Save campaign-specific settings (title, description, banner, chapters, etc.)
      // via PUT /api/campaigns/{id}.
      // NOTE: gmGlobalOverrides is no longer included here — it is now server-wide
      // and saved separately below via PUT /api/server-settings/gm-overrides.
      const response = await fetch(`/api/campaigns/${campaignId}`, {
        method:      'PUT',
        headers:     apiHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          title:              editableTitle,
          description:        editableDescription,
          // Null explicitly removes the stored banner; omitting the field would
          // leave the existing banner unchanged — we always send the current value.
          bannerImageData:    editableBannerImageData ?? null,
          enabledRuleSources: enabledSources,
          chapters:           chaptersPayload,
          diceRules:          { explodingTwenties },
          statGeneration:     {
            method:         allowedMethods[0] ?? 'point_buy',
            rerollOnes,
            pointBuyBudget,
            allowedMethods,
          },
          variantRules:       { gestalt: variantGestalt, vitalityWoundPoints: variantVWP },
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      // Save global GM overrides separately via PUT /api/server-settings/gm-overrides.
      // These are server-wide (affect all campaigns) so they live outside the campaign row.
      if (gmOverridesText !== savedGmOverridesText) {
        const overridesOk = await setGmGlobalOverrides(gmOverridesText);
        if (!overridesOk) {
          console.warn('[Settings] Failed to save GM global overrides');
        }
      }

      // Extract the new `updatedAt` timestamp returned by the server.
      // The server always returns { id, updatedAt } on a successful PUT.
      const saveResult = await response.clone().json() as { updatedAt?: number };
      const newUpdatedAt = saveResult.updatedAt ?? Date.now();

      // 4. Update the banner sessionStorage cache with the new timestamp so the
      //    next visit reads from cache (fast path) rather than fetching again.
      if (isImageDataUri(editableBannerImageData)) {
        setCachedBanner(campaignId, newUpdatedAt, editableBannerImageData!);
      } else {
        // Banner was removed — evict all cached entries for this campaign.
        evictStaleBannerEntries(campaignId);
      }

      // 5. Update the in-memory campaign store so the rest of the UI reflects
      //    the saved values without requiring a page reload.
      //    NOTE: gmGlobalOverrides is intentionally omitted — it is no longer
      //    part of the Campaign type (it lives in server_settings).
      campaignStore.updateCampaign(campaignId, {
        title:              { ...editableTitle },
        description:        { ...editableDescription },
        bannerImageData:    editableBannerImageData ?? undefined,
        enabledRuleSources: [...enabledSources],
        chapters:           chaptersPayload,
        campaignSettings: {
          diceRules:      { explodingTwenties },
          statGeneration: {
            method:         allowedMethods[0] ?? 'point_buy',
            rerollOnes,
            pointBuyBudget,
            allowedMethods,
          },
          variantRules:   { gestalt: variantGestalt, vitalityWoundPoints: variantVWP },
        },
      });

      // Commit deferred membership changes (character enrollment / unenrollment).
      await commitMembership();

      chaptersAreDirty = false;
      savedChapters    = JSON.parse(JSON.stringify(editableChapters));
      // MembershipPanel may be unmounted (different tab active) so its $effect
      // won't sync back after commit — reset the flag here directly.
      membersAreDirty  = false;

      // Reset all dirty snapshots so the tab-bar bullets clear after a save.
      savedTitle            = { ...editableTitle };
      savedDescription      = { ...editableDescription };
      savedBannerImageData  = editableBannerImageData;
      savedSources          = [...enabledSources];
      savedGmOverridesText  = gmOverridesText;
      savedExplodingTwenties = explodingTwenties;
      savedRerollOnes        = rerollOnes;
      savedPointBuyBudget    = pointBuyBudget;
      savedAllowedRoll       = allowedRoll;
      savedAllowedPointBuy   = allowedPointBuy;
      savedAllowedStdArray   = allowedStdArray;
      savedVariantGestalt    = variantGestalt;
      savedVariantVWP        = variantVWP;

      saveHasError = false;
      toastVariant = 'success';
      toastMessage = ui('settings.saved', lang);
      setTimeout(() => (toastMessage = ''), 3000);
    } catch (err) {
      console.warn('[Settings] API unavailable:', err);
      saveHasError = true;
      toastVariant = 'warning';
      toastMessage = ui('settings.saved_local', lang);
      setTimeout(() => (toastMessage = ''), 5000);
    } finally {
      isSaving = false;
    }
  }
</script>

<!-- Full-height column: sticky header + sticky tab bar + scrollable content -->
<div class="h-full flex flex-col bg-surface overflow-hidden">

  <!-- =========================================================================
       PAGE HEADER — sticky, save button on the right
  ========================================================================= -->
  <PageHeader
    title={ui('settings.title', lang)}
    icon={IconSettings}
    breadcrumb={{ href: `/campaigns/${campaignId}`, label: ui('settings.back_campaign', lang) }}
  >
    {#snippet actions()}
      <button
        class="btn-primary inline-flex items-center gap-1.5"
        onclick={saveSettings}
        disabled={isSaving || !isValidJson}
        aria-label={ui('nav.save_campaign_settings_aria', lang)}
        type="button"
      >
        {#if saveHasError && !isSaving}
          <IconWarning size={14} aria-hidden="true" class="text-amber-300" />
        {/if}
        {isSaving ? ui('settings.saving', lang) : ui('settings.save', lang)}
      </button>
    {/snippet}
  </PageHeader>

  <!-- TAB NAVIGATION BAR — shrink-0, overflow-x-auto, snap-x for touch -->
  <div
    class="shrink-0 flex overflow-x-auto bg-surface border-b border-border
           snap-x snap-mandatory scrollbar-none"
    role="tablist"
    aria-label={ui('settings.title', lang)}
  >
    {#each SETTINGS_TABS as tab}
      <!--
        TAB BUTTON
        Active:   accent underline + subtle tint + bold text.
        Inactive: muted text, transparent bottom border.
        Mobile:   icon only (label hidden below md). min-h-[44px] guarantees
                  WCAG 2.1 SC 2.5.5 touch target on coarse-pointer devices.
      -->
      <button
        class="
          flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium
          border-b-2 whitespace-nowrap transition-colors duration-150
          min-h-[44px] snap-start
          {activeTab === tab.key
            ? 'border-accent text-accent bg-accent/5'
            : 'border-transparent text-text-secondary hover:text-text-primary hover:bg-surface-alt'}
        "
        onclick={() => switchTab(tab.key)}
        role="tab"
        aria-selected={activeTab === tab.key}
        aria-controls="settings-tab-panel-{tab.key}"
        id="settings-tab-btn-{tab.key}"
        type="button"
        title={ui(tab.labelKey, lang)}
      >
        <tab.icon size={18} aria-hidden="true" />
        <!-- Label hidden on mobile — icon alone suffices on small screens -->
        <span class="hidden md:inline">{ui(tab.labelKey, lang)}</span>
        {#if tabDirtyMap[tab.key]}
          <span class="text-xs font-normal text-amber-400/80" aria-hidden="true">●</span>
        {/if}
      </button>
    {/each}
  </div>

  <!-- TAB CONTENT AREA — flex-1 overflow-y-auto, p-4 xl:p-6 -->
  <div
    class="flex-1 overflow-y-auto p-4 xl:p-6"
    role="tabpanel"
    id="settings-tab-panel-{activeTab}"
    aria-labelledby="settings-tab-btn-{activeTab}"
  >

    <!-- ── TAB: Campaign Info ──────────────────────────────────────────────── -->
    {#if activeTab === 'info'}
      <CampaignInfoPanel
        bind:editableTitle
        bind:editableDescription
        bind:editableBannerImageData
      />

    <!-- ── TAB: Chapters ──────────────────────────────────────────────────── -->
    {:else if activeTab === 'chapters'}
      <ChaptersPanel bind:editableChapters bind:chaptersAreDirty />

    <!-- ── TAB: Campaign Members ──────────────────────────────────────────── -->
    {:else if activeTab === 'members'}
      <MembershipPanel {campaignId} bind:commit={commitMembership} bind:hasPendingChanges={membersAreDirty} />

    <!-- ── TAB: Rule Sources ──────────────────────────────────────────────── -->
    {:else if activeTab === 'rule_sources'}
      <RuleSourcesPanel bind:enabledSources />

    <!-- ── TAB: Rules & Generation (Dice Rules + Stat Gen + Variant Rules) ── -->
    {:else if activeTab === 'rules_gen'}
      <!--
        Three logically related panels rendered together:
          1. CharacterCreationPanel — Dice Rules section + Stat Generation section
          2. VariantRulesPanel      — Gestalt + Vitality/Wound Points
        Grouping them avoids three separate short tabs while keeping each panel
        component self-contained and reusable.
      -->
      <div class="flex flex-col gap-5">
        <CharacterCreationPanel
          bind:explodingTwenties
          bind:rerollOnes
          bind:pointBuyBudget
          bind:allowedRoll
          bind:allowedPointBuy
          bind:allowedStdArray
        />
        <VariantRulesPanel bind:variantGestalt bind:variantVWP />
      </div>

    <!-- ── TAB: Campaign Content ─────────────────────────────────────────── -->
    {:else if activeTab === 'campaign_content'}
      <CampaignContentPanel {campaignId} />

    <!-- ── TAB: GM Overrides ──────────────────────────────────────────────── -->
    {:else if activeTab === 'gm_overrides'}
      <GmOverridesPanel bind:gmOverridesText bind:isValidJson />

    {/if}

  </div>

</div>

<!-- Toast notification — fixed at the bottom of the viewport -->
<Toast message={toastMessage} variant={toastVariant} />
