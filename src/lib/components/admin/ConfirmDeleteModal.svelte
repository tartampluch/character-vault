<!--
  @file src/lib/components/admin/ConfirmDeleteModal.svelte
  @description Confirmation dialog for permanent user account deletion (Phase 22.8).
-->

<script lang="ts">
  import Modal from '$lib/components/ui/Modal.svelte';
  import { deleteUser, ApiError } from '$lib/api/userApi';
  import type { User } from '$lib/types/user';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';

  // ── Props ────────────────────────────────────────────────────────────────────

  interface Props {
    open: boolean;
    onClose: () => void;
    user: User | null;
    onSuccess: () => void;
  }

  let { open, onClose, user, onSuccess }: Props = $props();

  const lang = $derived(engine.settings.language);

  // ── State ─────────────────────────────────────────────────────────────────

  let isLoading = $state(false);
  let error     = $state('');

  $effect(() => {
    if (open) {
      isLoading = false;
      error     = '';
    }
  });

  // ── Delete handler ────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!user) return;
    isLoading = true;
    error     = '';

    try {
      await deleteUser(user.id);
      onSuccess();
      onClose();
    } catch (e) {
      if (e instanceof ApiError) {
        error = e.message;
      } else {
        error = ui('common.error_unexpected', lang);
      }
    } finally {
      isLoading = false;
    }
  }
</script>

<Modal {open} {onClose} title={ui('admin.delete_modal.title', lang)} size="sm">
  {#if user}
    <div class="flex flex-col gap-4">

      <!-- Warning block -->
      <div class="rounded-lg border border-red-700/40 bg-red-950/20 px-4 py-3 text-sm text-red-300">
        <p class="font-semibold mb-1">{ui('admin.delete_modal.warning_title', lang)}</p>
        <p class="text-red-400/80">
          {ui('admin.delete_modal.warning_desc', lang).replace('{username}', user.username)}
        </p>
      </div>

      <!-- Error banner -->
      {#if error}
        <div class="px-3 py-2 rounded border border-red-700/40 bg-red-950/30 text-red-400 text-sm" role="alert">
          {error}
        </div>
      {/if}

      <!-- Action buttons -->
      <div class="flex justify-end gap-2">
        <button
          type="button"
          onclick={onClose}
          disabled={isLoading}
          class="btn-secondary"
        >
          {ui('common.cancel', lang)}
        </button>
        <button
          type="button"
          onclick={handleDelete}
          disabled={isLoading}
          class="btn-danger disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading
            ? ui('admin.delete_modal.deleting', lang)
            : ui('admin.delete_modal.confirm_btn', lang).replace('{username}', user.username)}
        </button>
      </div>

    </div>
  {/if}
</Modal>
