<!--
  @file src/routes/campaigns/[id]/gm-dashboard/+page.svelte
  @description REMOVED — GM Dashboard has been replaced by the global Vault (/vault).

  The GM Vault accessible at /vault shows all characters across all campaigns with
  full editing capabilities and GM per-character overrides. When a GM opens a
  character from the Vault, the character sheet includes the GM overrides panel.

  This page redirects to /vault so that any bookmarks or cached links continue
  to work.
-->

<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';

  // Redirect immediately to the global vault.
  // Use the campaign vault as the target so the GM lands in the right context.
  const campaignId = $derived($page.params.id ?? '');
  $effect(() => {
    goto(`/campaigns/${campaignId}/vault`, { replaceState: true });
  });
</script>
