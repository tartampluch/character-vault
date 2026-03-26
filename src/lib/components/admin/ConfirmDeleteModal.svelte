<!--
  @file src/lib/components/admin/ConfirmDeleteModal.svelte
  @description Confirmation dialog for permanent user account deletion (Phase 22.8).

  PURPOSE:
    Prevents accidental deletion by requiring an explicit "Delete" click after
    seeing the username and an "irreversible" warning. A Cancel button and
    Escape key both close without action.

  FLOW:
    1. Parent opens modal with a `user` prop set to the target User.
    2. Admin reads the warning and clicks "Delete [username]".
    3. Modal calls deleteUser(user.id) via userApi.
    4. On success: calls onSuccess() then onClose() so the parent refreshes.
    5. On error: shows an inline error banner; modal stays open.
-->

<script lang="ts">
  import Modal from '$lib/components/ui/Modal.svelte';
  import { deleteUser, ApiError } from '$lib/api/userApi';
  import type { User } from '$lib/types/user';

  // ── Props ────────────────────────────────────────────────────────────────────

  interface Props {
    /** Whether the modal is visible. */
    open: boolean;
    /** Close callback — called on cancel or after successful delete. */
    onClose: () => void;
    /** The user to delete. When null the modal renders nothing meaningful. */
    user: User | null;
    /** Called after successful deletion so the parent can refresh the list. */
    onSuccess: () => void;
  }

  let { open, onClose, user, onSuccess }: Props = $props();

  // ── State ─────────────────────────────────────────────────────────────────

  let isLoading = $state(false);
  let error     = $state('');

  // Clear error whenever the modal opens / target changes.
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
        error = 'An unexpected error occurred. Please try again.';
      }
    } finally {
      isLoading = false;
    }
  }
</script>

<Modal {open} {onClose} title="Delete User" size="sm">
  {#if user}
    <div class="flex flex-col gap-4">

      <!-- Warning block -->
      <div class="rounded-lg border border-red-700/40 bg-red-950/20 px-4 py-3 text-sm text-red-300">
        <p class="font-semibold mb-1">This action cannot be undone.</p>
        <p class="text-red-400/80">
          The account <span class="font-mono font-bold text-red-300">{user.username}</span>
          and all their characters will be permanently deleted.
          Campaign memberships will also be removed.
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
          Cancel
        </button>
        <button
          type="button"
          onclick={handleDelete}
          disabled={isLoading}
          class="btn-danger disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Deleting…' : `Delete ${user.username}`}
        </button>
      </div>

    </div>
  {/if}
</Modal>
