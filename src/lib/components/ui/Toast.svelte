<!--
  @file src/lib/components/ui/Toast.svelte
  @description Temporary notification toast anchored to the bottom of the viewport.

  Renders a fixed-position pill at the bottom-centre of the screen. When `message`
  is non-empty the toast is visible; setting it back to an empty string hides it.
  The caller is responsible for clearing `message` (typically via setTimeout).

  PROPS
  ─────
  message  — Text to display. Toast is hidden when empty / falsy.
  variant  — Visual style: 'success' (green) | 'warning' (amber) | 'error' (red).
             Defaults to 'success'.

  USAGE
  ─────
  <Toast message={toastMessage} variant={toastVariant} />
-->

<script lang="ts">
  import { IconSuccess, IconWarning, IconError } from '$lib/components/ui/icons';

  interface Props {
    message: string;
    variant?: 'success' | 'warning' | 'error';
  }

  let { message, variant = 'success' }: Props = $props();
</script>

{#if message}
  <div
    class="
      fixed bottom-6 left-1/2 -translate-x-1/2 z-50
      flex items-center gap-2 px-4 py-3 rounded-lg border shadow-lg
      text-sm whitespace-nowrap pointer-events-none
      {variant === 'success'
        ? 'border-green-600/40 bg-green-950/90 text-green-400'
        : variant === 'warning'
          ? 'border-amber-600/40 bg-amber-950/90 text-amber-400'
          : 'border-red-600/40 bg-red-950/90 text-red-400'}
    "
    role="status"
    aria-live="polite"
  >
    {#if variant === 'success'}
      <IconSuccess size={14} aria-hidden="true" />
    {:else if variant === 'warning'}
      <IconWarning size={14} aria-hidden="true" />
    {:else}
      <IconError size={14} aria-hidden="true" />
    {/if}
    {message}
  </div>
{/if}
