<!--
  @file src/routes/+page.svelte
  @description Root route — client-side redirect to the Campaign Hub.

  With adapter-static there is no Node.js server to issue an HTTP redirect,
  so the redirect is performed in the browser as soon as the SvelteKit router
  mounts this component.

  The previous +page.server.ts (redirect 303 /campaigns) is removed because
  .server.ts files require a Node.js runtime that is not present in the static
  build.  This client-side equivalent produces the same UX: visiting "/" always
  sends the user to /campaigns.
-->

<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  // Replace the current history entry so the back button does not loop back to "/".
  onMount(() => {
    goto('/campaigns', { replaceState: true });
  });
</script>
