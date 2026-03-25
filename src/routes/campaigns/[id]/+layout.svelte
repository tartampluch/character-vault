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
  import { campaignStore } from '$lib/engine/CampaignStore.svelte';

  const { children } = $props();

  // On mount (including hard refresh / direct URL navigation), ensure the
  // campaign list is loaded. loadIfNeeded() is a no-op if hasLoaded is true.
  $effect(() => {
    campaignStore.loadIfNeeded();
  });
</script>

{@render children()}
