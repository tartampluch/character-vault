<!--
  @file src/lib/components/admin/ChangePasswordModal.svelte
  @description Self-service password change modal (Phase 22.15).
-->

<script lang="ts">
  import Modal from '$lib/components/ui/Modal.svelte';
  import { changePassword, ApiError } from '$lib/api/userApi';
  import { sessionContext } from '$lib/engine/SessionContext.svelte';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';

  // ── Props ────────────────────────────────────────────────────────────────────

  interface Props {
    open: boolean;
    onClose: () => void;
  }

  let { open, onClose }: Props = $props();

  const lang = $derived(engine.settings.language);

  // ── State ─────────────────────────────────────────────────────────────────

  let currentPassword  = $state('');
  let newPassword      = $state('');
  let confirmPassword  = $state('');
  let error            = $state('');
  let isLoading        = $state(false);

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
    if (newPassword.length === 0)        return ui('admin.change_password.val_enter_new', lang);
    if (newPassword.length < 8)          return ui('admin.change_password.val_min_8', lang);
    if (confirmPassword.length === 0)    return ui('admin.change_password.val_confirm_empty', lang);
    if (newPassword !== confirmPassword) return ui('admin.change_password.val_mismatch', lang);
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
      sessionContext.clearPasswordSetup();
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'WrongPassword') {
          error = ui('admin.change_password.error_wrong', lang);
        } else {
          error = err.message || ui('common.error_unexpected', lang);
        }
      } else {
        error = ui('common.error_unexpected', lang);
      }
    } finally {
      isLoading = false;
    }
  }
</script>

<Modal {open} {onClose} title={ui('user.change_password', lang)} size="sm">
  <form onsubmit={handleSubmit} class="flex flex-col gap-4" novalidate>

    {#if error}
      <div class="px-3 py-2 rounded border border-red-700/40 bg-red-950/20 text-red-400 text-sm" role="alert">
        {error}
      </div>
    {/if}

    <!-- Current password -->
    <div class="flex flex-col gap-1.5">
      <label for="cp-current" class="text-xs font-medium text-text-secondary">
        {ui('admin.change_password.current_label', lang)} <span class="text-red-400" aria-hidden="true">*</span>
      </label>
      <input
        id="cp-current"
        type="password"
        bind:value={currentPassword}
        autocomplete="current-password"
        disabled={isLoading}
        placeholder={ui('admin.change_password.current_placeholder', lang)}
        class="input"
      />
    </div>

    <!-- New password -->
    <div class="flex flex-col gap-1.5">
      <label for="cp-new" class="text-xs font-medium text-text-secondary">
        {ui('admin.change_password.new_label', lang)} <span class="text-red-400" aria-hidden="true">*</span>
      </label>
      <input
        id="cp-new"
        type="password"
        bind:value={newPassword}
        autocomplete="new-password"
        disabled={isLoading}
        placeholder={ui('admin.change_password.new_placeholder', lang)}
        class="input"
      />
    </div>

    <!-- Confirm new password -->
    <div class="flex flex-col gap-1.5">
      <label for="cp-confirm" class="text-xs font-medium text-text-secondary">
        {ui('admin.change_password.confirm_label', lang)} <span class="text-red-400" aria-hidden="true">*</span>
      </label>
      <input
        id="cp-confirm"
        type="password"
        bind:value={confirmPassword}
        autocomplete="new-password"
        disabled={isLoading}
        placeholder={ui('admin.change_password.confirm_placeholder', lang)}
        class="input"
      />
      {#if confirmPassword.length > 0 && newPassword !== confirmPassword}
        <p class="text-xs text-red-400 mt-0.5">{ui('admin.change_password.mismatch_hint', lang)}</p>
      {/if}
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
        {isLoading ? ui('common.saving', lang) : ui('user.change_password', lang)}
      </button>
    </div>

  </form>
</Modal>
