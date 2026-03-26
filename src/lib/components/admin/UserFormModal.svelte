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
    updatePlayerName,
    updateRole,
    suspendUser,
    reinstateUser,
    ApiError,
  } from '$lib/api/userApi';
  import type { User, UserRole } from '$lib/types/user';

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

  // ── Derived mode ─────────────────────────────────────────────────────────────

  const isEditMode = $derived(user !== null);
  const title      = $derived(isEditMode ? `Edit "${user!.username}"` : 'Add User');

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
        // Edit mode: seed fields from the existing user.
        username    = user.username; // display-only in edit mode
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
    playerName.trim().length > 0 &&
    (!isEditMode ? username.trim().length > 0 : true)
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
        const uid = user!.id;

        // 1. Player name
        if (playerName.trim() !== user!.player_name) {
          await updatePlayerName(uid, playerName.trim());
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
          error = `Username "${username.trim()}" is already taken.`;
        } else if (e.status === 400) {
          error = e.message;
        } else {
          error = e.message || 'An unexpected error occurred.';
        }
      } else {
        error = 'An unexpected error occurred. Please try again.';
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

    <!-- ── CREATE MODE FIELDS ─────────────────────────────────────────────── -->
    {#if !isEditMode}
      <div class="flex flex-col gap-1.5">
        <label for="uf-username" class="text-xs font-medium text-text-secondary">
          Username <span class="text-red-400" aria-hidden="true">*</span>
        </label>
        <input
          id="uf-username"
          type="text"
          bind:value={username}
          autocomplete="off"
          required
          disabled={isLoading}
          placeholder="e.g. alice"
          class="input"
        />
        <p class="text-xs text-text-muted">Used to log in. Must be unique.</p>
      </div>
    {/if}

    <!-- ── PLAYER NAME (both modes) ──────────────────────────────────────── -->
    <div class="flex flex-col gap-1.5">
      <label for="uf-player-name" class="text-xs font-medium text-text-secondary">
        Player Name <span class="text-red-400" aria-hidden="true">*</span>
      </label>
      <input
        id="uf-player-name"
        type="text"
        bind:value={playerName}
        autocomplete="off"
        required
        disabled={isLoading}
        placeholder="e.g. Alice"
        class="input"
      />
      <p class="text-xs text-text-muted">In-game display name shown to the GM.</p>
    </div>

    <!-- ── EDIT-ONLY FIELDS ───────────────────────────────────────────────── -->
    {#if isEditMode}

      <!-- Role dropdown -->
      <div class="flex flex-col gap-1.5">
        <label for="uf-role" class="text-xs font-medium text-text-secondary">Role</label>
        <select id="uf-role" bind:value={role} disabled={isLoading} class="input">
          <option value="player">Player</option>
          <option value="gm">GM (Game Master)</option>
          <option value="admin">Admin</option>
        </select>
        <p class="text-xs text-text-muted">
          Admin can manage users. GM can manage campaigns and characters.
        </p>
      </div>

      <!-- Suspend toggle -->
      <div class="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
        <div>
          <p class="text-sm font-medium text-text-primary">Account Suspended</p>
          <p class="text-xs text-text-muted">Suspended accounts cannot log in.</p>
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
                 {isSuspended ? 'bg-orange-500' : 'bg-border'}"
          title={isSuspended ? 'Click to reinstate' : 'Click to suspend'}
        >
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
        Cancel
      </button>
      <button
        type="submit"
        disabled={!canSubmit}
        class="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? 'Saving…' : isEditMode ? 'Save Changes' : 'Create User'}
      </button>
    </div>

  </form>
</Modal>
