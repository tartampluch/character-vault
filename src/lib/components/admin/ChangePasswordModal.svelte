<!--
  @file src/lib/components/admin/ChangePasswordModal.svelte
  @description Self-service password change modal (Phase 22.15).

  ACCESSIBLE TO: All authenticated users (from the Sidebar footer "Change Password" button).
  NOT the same as the first-login /setup-password page — that page handles
  no-password accounts. This modal is for users who already have a password
  and want to change it, or for no-password accounts still in setup state.

  FLOW:
    1. User fills in Current Password + New Password + Confirm.
    2. Client validates: new ≥ 8 chars, new === confirm, current non-empty
       (backend skips current-password check if account has no password).
    3. Calls changePassword(currentPassword, newPassword) from userApi.
    4. On 400 WrongPassword: shows inline error "Current password is incorrect."
    5. On success: clears sessionContext.needsPasswordSetup, emits onSuccess.
-->

<script lang="ts">
  import Modal from '$lib/components/ui/Modal.svelte';
  import { changePassword, ApiError } from '$lib/api/userApi';
  import { sessionContext } from '$lib/engine/SessionContext.svelte';

  // ── Props ────────────────────────────────────────────────────────────────────

  interface Props {
    open: boolean;
    onClose: () => void;
  }

  let { open, onClose }: Props = $props();

  // ── State ─────────────────────────────────────────────────────────────────

  let currentPassword  = $state('');
  let newPassword      = $state('');
  let confirmPassword  = $state('');
  let error            = $state('');
  let isLoading        = $state(false);

  // Reset fields when the modal opens.
  $effect(() => {
    if (open) {
      currentPassword = '';
      newPassword     = '';
      confirmPassword = '';
      error           = '';
      isLoading       = false;
    }
  });

  // ── Validation ────────────────────────────────────────────────────────────

  const validationError = $derived((): string => {
    // currentPassword is NOT validated client-side.
    // The backend handles both cases:
    //   - account has a password → verifies current_password (400 WrongPassword on mismatch)
    //   - account has NO password → skips the check (supports post-reset sessions)
    if (newPassword.length === 0)        return 'Please enter a new password.';
    if (newPassword.length < 8)          return 'New password must be at least 8 characters.';
    if (confirmPassword.length === 0)    return 'Please confirm your new password.';
    if (newPassword !== confirmPassword) return 'New passwords do not match.';
    return '';
  });

  const canSubmit = $derived(!isLoading && validationError() === '');

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    const ve = validationError();
    if (ve) { error = ve; return; }
    error     = '';
    isLoading = true;

    try {
      await changePassword(currentPassword, newPassword);
      // Clear the first-login flag in case the user was in setup state.
      sessionContext.clearPasswordSetup();
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'WrongPassword') {
          error = 'Current password is incorrect.';
        } else {
          error = err.message || 'An unexpected error occurred.';
        }
      } else {
        error = 'An unexpected error occurred. Please try again.';
      }
    } finally {
      isLoading = false;
    }
  }
</script>

<Modal {open} {onClose} title="Change Password" size="sm">
  <form onsubmit={handleSubmit} class="flex flex-col gap-4" novalidate>

    {#if error}
      <div class="px-3 py-2 rounded border border-red-700/40 bg-red-950/20 text-red-400 text-sm" role="alert">
        {error}
      </div>
    {/if}

    <!-- Current password -->
    <div class="flex flex-col gap-1.5">
      <label for="cp-current" class="text-xs font-medium text-text-secondary">
        Current Password <span class="text-red-400" aria-hidden="true">*</span>
      </label>
      <input
        id="cp-current"
        type="password"
        bind:value={currentPassword}
        autocomplete="current-password"
        disabled={isLoading}
        placeholder="Your current password"
        class="input"
      />
    </div>

    <!-- New password -->
    <div class="flex flex-col gap-1.5">
      <label for="cp-new" class="text-xs font-medium text-text-secondary">
        New Password <span class="text-red-400" aria-hidden="true">*</span>
      </label>
      <input
        id="cp-new"
        type="password"
        bind:value={newPassword}
        autocomplete="new-password"
        disabled={isLoading}
        placeholder="At least 8 characters"
        class="input"
      />
    </div>

    <!-- Confirm new password -->
    <div class="flex flex-col gap-1.5">
      <label for="cp-confirm" class="text-xs font-medium text-text-secondary">
        Confirm New Password <span class="text-red-400" aria-hidden="true">*</span>
      </label>
      <input
        id="cp-confirm"
        type="password"
        bind:value={confirmPassword}
        autocomplete="new-password"
        disabled={isLoading}
        placeholder="Repeat your new password"
        class="input"
      />
      {#if confirmPassword.length > 0 && newPassword !== confirmPassword}
        <p class="text-xs text-red-400 mt-0.5">Passwords do not match.</p>
      {/if}
    </div>

    <!-- Actions -->
    <div class="flex justify-end gap-2 pt-1">
      <button type="button" onclick={onClose} disabled={isLoading} class="btn-secondary">
        Cancel
      </button>
      <button
        type="submit"
        disabled={!canSubmit}
        class="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? 'Saving…' : 'Change Password'}
      </button>
    </div>

  </form>
</Modal>
