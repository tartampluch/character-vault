<!--
  @file src/lib/components/admin/RenameModal.svelte
  @description Self-service display name (player name) change modal.
  Accessible from the user dropdown in the sidebar.

  On success the SessionContext is updated immediately so the sidebar
  avatar and name reflect the change without a page reload.
-->

<script lang="ts">
  import Modal from '$lib/components/ui/Modal.svelte';
  import { updateOwnDisplayName, ApiError } from '$lib/api/userApi';
  import { sessionContext } from '$lib/engine/SessionContext.svelte';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';

  // ── Props ─────────────────────────────────────────────────────────────────

  interface Props {
    open: boolean;
    onClose: () => void;
  }

  let { open, onClose }: Props = $props();

  const lang = $derived(engine.settings.language);

  // ── State ─────────────────────────────────────────────────────────────────

  let displayName = $state('');
  let error       = $state('');
  let isLoading   = $state(false);

  // Pre-populate with the current display name each time the modal opens.
  $effect(() => {
    if (open) {
      displayName = sessionContext.currentUserDisplayName;
      error       = '';
      isLoading   = false;
    }
  });

  // ── Validation ────────────────────────────────────────────────────────────

  const canSubmit = $derived(
    !isLoading && displayName.trim().length > 0 &&
    displayName.trim() !== sessionContext.currentUserDisplayName
  );

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    const name = displayName.trim();
    if (!name) { error = ui('user.rename_error_empty', lang); return; }
    error     = '';
    isLoading = true;

    try {
      const result = await updateOwnDisplayName(name);
      // Update the sidebar avatar / name immediately — no reload needed.
      sessionContext.currentUserDisplayName = result.display_name;
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        error = err.message || ui('common.error_unexpected', lang);
      } else {
        error = ui('common.error_unexpected', lang);
      }
    } finally {
      isLoading = false;
    }
  }
</script>

<Modal {open} {onClose} title={ui('user.rename_title', lang)} size="sm">
  <form onsubmit={handleSubmit} class="flex flex-col gap-4" novalidate>

    {#if error}
      <div class="px-3 py-2 rounded border border-red-700/40 bg-red-950/20 text-red-400 text-sm" role="alert">
        {error}
      </div>
    {/if}

    <div class="flex flex-col gap-1.5">
      <label for="rn-display-name" class="text-xs font-medium text-text-secondary">
        {ui('user.rename_label', lang)} <span class="text-red-400" aria-hidden="true">*</span>
      </label>
      <input
        id="rn-display-name"
        type="text"
        bind:value={displayName}
        autocomplete="nickname"
        disabled={isLoading}
        placeholder={ui('user.rename_placeholder', lang)}
        class="input"
      />
      <p class="text-xs text-text-muted">{ui('user.rename_desc', lang)}</p>
    </div>

    <!-- Actions -->
    <div class="flex justify-end gap-2 pt-1">
      <button type="button" onclick={onClose} disabled={isLoading} class="btn-secondary">
        {ui('common.cancel', lang)}
      </button>
      <button
        type="submit"
        disabled={!canSubmit}
        class="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? ui('common.saving', lang) : ui('user.rename', lang)}
      </button>
    </div>

  </form>
</Modal>
