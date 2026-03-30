<!--
  @file src/lib/components/admin/UserFormModal.svelte
  @description Create / Edit user modal for the admin panel (Phase 22.8).

  MODES:
    Create (user prop is null):
      Fields: username + player_name.
      On submit: calls createUser(username, playerName).
      Returns 409 if username is already taken.

    Edit (user prop is a User object):
      Fields: player_name (editable) + role dropdown + suspended toggle.
      On submit: calls updatePlayerName() and/or updateRole() and/or
      suspendUser()/reinstateUser() only when values changed.
      Self-edit is prevented at the API level (400); this modal is never
      opened for the currently logged-in admin's own row (page-level guard).

  EVENTS:
    onSuccess — called after a successful create or edit so the parent page
                can reload the user list. The modal closes automatically.
-->

<script lang="ts">
  import Modal from '$lib/components/ui/Modal.svelte';
  import {
    createUser,
    updateUsername,
    updatePlayerName,
    updateRole,
    suspendUser,
    reinstateUser,
    ApiError,
  } from '$lib/api/userApi';
  import type { User, UserRole } from '$lib/types/user';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';

  // ── Props ────────────────────────────────────────────────────────────────────

  interface Props {
    /** Whether the modal is visible. */
    open: boolean;
    /** Close callback — called on cancel or after successful submit. */
    onClose: () => void;
    /**
     * The user to edit, or null when creating a new user.
     * Setting this prop switches the modal between Create and Edit modes.
     */
    user: User | null;
    /** Called after a successful create or edit so the parent can refresh. */
    onSuccess: () => void;
  }

  let { open, onClose, user, onSuccess }: Props = $props();

  const lang = $derived(engine.settings.language);

  // ── Derived mode ─────────────────────────────────────────────────────────────

  const isEditMode = $derived(user !== null);
  const title      = $derived(isEditMode
    ? ui('admin.user_form.edit_title', lang).replace('{username}', user!.username)
    : ui('admin.users.add', lang));

  // ── Form state — reset whenever modal opens ───────────────────────────────

  let username    = $state('');
  let playerName  = $state('');
  let role        = $state<UserRole>('player');
  let isSuspended = $state(false);
  let error       = $state('');
  let isLoading   = $state(false);

  // Populate fields when the modal opens or the target user changes.
  $effect(() => {
    if (open) {
      if (user) {
        // Edit mode: seed all fields from the existing user.
        username    = user.username;
        playerName  = user.player_name;
        role        = user.role;
        isSuspended = user.is_suspended;
      } else {
        // Create mode: clear all fields.
        username    = '';
        playerName  = '';
        role        = 'player';
        isSuspended = false;
      }
      error     = '';
      isLoading = false;
    }
  });

  // ── Validation ────────────────────────────────────────────────────────────

  const canSubmit = $derived(
    !isLoading &&
    username.trim().length > 0 &&
    playerName.trim().length > 0
  );

  // ── Submit handler ────────────────────────────────────────────────────────

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    error     = '';
    isLoading = true;

    try {
      if (!isEditMode) {
        // ── CREATE ──────────────────────────────────────────────────────────
        await createUser(username.trim(), playerName.trim());
      } else {
        // ── EDIT — apply only what changed ──────────────────────────────────
        const uid              = user!.id;
        const newUsername      = username.trim();
        const newPlayerName    = playerName.trim();
        const usernameChanged  = newUsername  !== user!.username;
        const playerNameChanged = newPlayerName !== user!.player_name;

        // 1. Username and/or player name (single API call covers both)
        if (usernameChanged || playerNameChanged) {
          await updateUsername(uid, newUsername, newPlayerName);
        }

        // 2. Role
        if (role !== user!.role) {
          await updateRole(uid, role);
        }

        // 3. Suspend / Reinstate
        if (isSuspended !== user!.is_suspended) {
          if (isSuspended) {
            await suspendUser(uid);
          } else {
            await reinstateUser(uid);
          }
        }
      }

      onSuccess();
      onClose();
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 409) {
          error = ui('admin.user_form.error_taken', lang).replace('{username}', username.trim());
        } else if (e.status === 400) {
          error = e.message;
        } else {
          error = e.message || ui('common.error_unexpected', lang);
        }
      } else {
        error = ui('common.error_unexpected', lang);
      }
    } finally {
      isLoading = false;
    }
  }
</script>

<Modal {open} {onClose} {title} size="sm">
  <form onsubmit={handleSubmit} class="flex flex-col gap-4" novalidate>

    <!-- Error banner -->
    {#if error}
      <div class="px-3 py-2 rounded border border-red-700/40 bg-red-950/20 text-red-400 text-sm" role="alert">
        {error}
      </div>
    {/if}

    <!-- ── USERNAME (both modes — display-only hint differs) ────────────── -->
    <div class="flex flex-col gap-1.5">
      <label for="uf-username" class="text-xs font-medium text-text-secondary">
        {ui('admin.user_form.username_label', lang)} <span class="text-red-400" aria-hidden="true">*</span>
      </label>
      <input
        id="uf-username"
        type="text"
        bind:value={username}
        autocomplete="off"
        required
        disabled={isLoading}
        placeholder={ui('admin.user_form.username_placeholder', lang)}
        class="input"
      />
      <p class="text-xs text-text-muted">
        {isEditMode
          ? ui('admin.user_form.username_desc_edit', lang)
          : ui('admin.user_form.username_desc', lang)}
      </p>
    </div>

    <!-- ── PLAYER NAME (both modes) ──────────────────────────────────────── -->
    <div class="flex flex-col gap-1.5">
      <label for="uf-player-name" class="text-xs font-medium text-text-secondary">
        {ui('admin.user_form.player_name_label', lang)} <span class="text-red-400" aria-hidden="true">*</span>
      </label>
      <input
        id="uf-player-name"
        type="text"
        bind:value={playerName}
        autocomplete="off"
        required
        disabled={isLoading}
        placeholder={ui('admin.user_form.player_name_placeholder', lang)}
        class="input"
      />
      <p class="text-xs text-text-muted">{ui('admin.user_form.player_name_desc', lang)}</p>
    </div>

    <!-- ── EDIT-ONLY FIELDS ───────────────────────────────────────────────── -->
    {#if isEditMode}

      <!-- Role dropdown -->
      <div class="flex flex-col gap-1.5">
        <label for="uf-role" class="text-xs font-medium text-text-secondary">{ui('admin.user_form.role_label', lang)}</label>
        <select id="uf-role" bind:value={role} disabled={isLoading} class="input">
          <option value="player">{ui('admin.user_form.role_player', lang)}</option>
          <option value="gm">{ui('admin.user_form.role_gm', lang)}</option>
          <option value="admin">{ui('admin.user_form.role_admin', lang)}</option>
        </select>
        <p class="text-xs text-text-muted">
          {ui('admin.user_form.role_desc', lang)}
        </p>
      </div>

      <!-- Suspend toggle -->
      <div class="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
        <div>
          <p class="text-sm font-medium text-text-primary">{ui('admin.user_form.suspended_label', lang)}</p>
          <p class="text-xs text-text-muted">{ui('admin.user_form.suspended_desc', lang)}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isSuspended}
          disabled={isLoading}
          onclick={() => (isSuspended = !isSuspended)}
          class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent
                 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-accent/50
                 disabled:opacity-50 disabled:cursor-not-allowed
                 {isSuspended ? 'bg-orange-500 dark:bg-orange-400' : 'bg-border'}"
          title={isSuspended ? ui('admin.user_form.reinstate_title', lang) : ui('admin.user_form.suspend_title', lang)}
        >
          <!-- Toggle thumb: bg-white is conventional for toggle knobs and provides
               the required contrast against both orange (suspended) and gray (active) tracks. -->
          <span
            class="pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow
                   transform transition-transform duration-200
                   {isSuspended ? 'translate-x-4' : 'translate-x-0'}"
          ></span>
        </button>
      </div>

    {/if}

    <!-- ── ACTION BUTTONS ────────────────────────────────────────────────── -->
    <div class="flex justify-end gap-2 pt-1">
      <button
        type="button"
        onclick={onClose}
        disabled={isLoading}
        class="btn-secondary"
      >
        {ui('common.cancel', lang)}
      </button>
      <button
        type="submit"
        disabled={!canSubmit}
        class="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading
          ? ui('common.saving', lang)
          : isEditMode
            ? ui('admin.user_form.save_changes', lang)
            : ui('admin.user_form.create_user', lang)}
      </button>
    </div>

  </form>
</Modal>
