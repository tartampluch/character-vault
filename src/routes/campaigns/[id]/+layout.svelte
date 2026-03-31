<!--
  @file src/routes/campaigns/[id]/+layout.svelte
  @description Layout wrapper for all campaign sub-routes.

  PURPOSE:
    1. Ensures the CampaignStore is populated with real API data before any
       campaign sub-page renders. Without this, a hard refresh (or direct URL
       navigation) on /campaigns/[id], /campaigns/[id]/settings, etc. would
       render against the empty initial store state, showing nothing.
       Uses loadIfNeeded() so the fetch is skipped when the hub page has already
       populated the store in the same browser session.

    2. Scans the campaign's own LocalizedString fields (title, description,
       chapters) for language codes and registers them in the DataLoader so
       they appear in the sidebar language dropdown. This is necessary because
       campaign metadata is never processed by loadRuleSources() — it lives
       outside the rule-file pipeline. Example: a Japanese campaign title adds
       'ja' to the available languages immediately on any campaign sub-page
       (Settings, Vault, Content Editor, etc.), without requiring a visit to
       the vault page first.
-->

<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { campaignStore } from '$lib/engine/CampaignStore.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';

  const { children } = $props();
  const lang = $derived(engine.settings.language);

  const campaignId = $derived($page.params.id ?? '');
  const campaign   = $derived(campaignStore.getCampaign(campaignId));

  // On mount (including hard refresh / direct URL navigation), ensure the
  // campaign list is loaded. loadIfNeeded() is a no-op if hasLoaded is true.
  //
  // WHY onMount INSTEAD OF $effect?
  //   $effect reads `campaignStore.hasLoaded` and `campaignStore.isLoading`
  //   synchronously inside `loadIfNeeded()`, which registers them as reactive
  //   dependencies. This causes the effect to re-run every time either flag
  //   changes (i.e. three times during a single loadFromApi() call:
  //   initial → isLoading=true → isLoading=false + hasLoaded=true).
  //
  //   During a client-side navigation those extra micro-task re-runs can fire
  //   while SvelteKit's router is still patching the component tree, producing
  //   a race where the new page content and scroll position are set in the
  //   wrong order — the "campaign detail shown below the list" symptom.
  //
  //   onMount runs exactly ONCE when the layout first mounts, which is the
  //   semantically correct behavior: load campaign data on entry, never again.
  onMount(() => {
    campaignStore.loadIfNeeded();
  });

  // Reactively scan the campaign's own LocalizedString fields for language codes
  // (title, description, chapters, chapter tasks) and register them so the
  // sidebar language dropdown stays up to date on ALL campaign sub-pages.
  //
  // WHY $effect HERE (not onMount)?
  //   The campaign object is fetched asynchronously — it may be null on first
  //   render and become available after the CampaignStore API call resolves.
  //   $effect re-runs whenever `campaign` changes, so languages discovered in
  //   campaign metadata are registered as soon as the data is ready.
  //
  //   Additionally, if the GM saves new translations (e.g. adds a Japanese
  //   title on the Settings page), the campaignStore updates, campaign changes,
  //   this effect re-fires, and the dropdown immediately reflects the new language.
  //
  // WHY localesVersion (not dataLoaderVersion)?
  //   `bumpLocalesVersion()` only invalidates `availableLanguages` — it does NOT
  //   cause the heavy game-mechanics $derived blocks (combat stats, saves, skills)
  //   to re-compute. This keeps the scan lightweight and safe to run on every
  //   campaign sub-page.
  //
  // INTERACTION WITH loadRuleSources() (vault page):
  //   `loadRuleSources()` calls `clearCache()` which resets `_availableLanguages`.
  //   The vault page compensates by calling `registerLanguagesFromValue(campaign)`
  //   again in its `.then()` callback, after the cache is rebuilt.
  $effect(() => {
    if (!campaign) return;
    dataLoader.registerLanguagesFromValue(campaign);
    engine.bumpLocalesVersion();
  });
</script>

{#if campaignStore.isLoading}
  <!-- Campaign list is being fetched — show a brief loading indicator. -->
  <div class="flex items-center justify-center py-20 text-text-muted" aria-live="polite">
    <p class="text-sm">{ui('campaign.loading', lang)}</p>
  </div>
{:else if !campaign && !campaignStore.isLoading}
  <!-- Campaign list loaded but this ID is not in it. -->
  <div class="flex flex-col items-center gap-2 py-20 text-center">
    <p class="font-semibold text-text-primary">{ui('campaign.not_found', lang)}</p>
    <p class="text-sm text-text-muted">{ui('campaign.not_found_desc', lang)}</p>
    <a href="/campaigns" class="btn-secondary mt-2">{ui('campaign.back_to_hub', lang)}</a>
  </div>
{:else}
  {@render children()}
{/if}
