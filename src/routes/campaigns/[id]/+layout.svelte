<!--
  @file src/routes/campaigns/[id]/+layout.svelte
  @description Layout wrapper for all campaign sub-routes.

  PURPOSE:
    Ensures the CampaignStore is populated with real API data before any
    campaign sub-page renders. Without this, a hard refresh (or direct URL
    navigation) on /campaigns/[id], /campaigns/[id]/settings, etc. would
    render against the empty initial store state, showing nothing.

    Uses loadIfNeeded() so the fetch is skipped when the hub page has already
    populated the store in the same browser session.
-->

<script lang="ts">
  import { onMount } from 'svelte';
  import { campaignStore } from '$lib/engine/CampaignStore.svelte';

  const { children } = $props();

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
</script>

{@render children()}
