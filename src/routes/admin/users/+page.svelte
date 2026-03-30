<!--
  @file src/routes/admin/users/+page.svelte
  @description User management admin panel (Phase 22.7).

  ACCESS:
    Admin-only. Non-admins are redirected to /campaigns when the API returns
    403 on the initial load, or immediately if sessionContext.isAdmin is false.

  COLUMNS:
    Username | Player Name | Role badge | Campaigns (name + char count) |
    Created | Last Login | Status (suspended badge)

  ROW ACTIONS (wired in Phase 22.8):
    Edit (pencil)            — opens UserFormModal in edit mode
    Suspend / Reinstate      — lock icon (active) / lock-open icon (suspended)
    Delete (trash)           — opens ConfirmDeleteModal

  SELF-ROW:
    All three action buttons are disabled and visually grayed out for the
    currently authenticated admin's own row (backend enforces this too).
-->

<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { sessionContext } from '$lib/engine/SessionContext.svelte';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui, uiN } from '$lib/i18n/ui-strings';
  import { listUsers, suspendUser, reinstateUser, resetUserPassword, ApiError } from '$lib/api/userApi';
  import type { User } from '$lib/types/user';
  import {
    IconAdd,
    IconEdit,
    IconDelete,
    IconLocked,
    IconUnlocked,
    IconKey,
  } from '$lib/components/ui/icons';
  import UserFormModal      from '$lib/components/admin/UserFormModal.svelte';
  import ConfirmDeleteModal  from '$lib/components/admin/ConfirmDeleteModal.svelte';
  import PageHeader         from '$lib/components/layout/PageHeader.svelte';
  import { IconAdmin } from '$lib/components/ui/icons';

  const lang = $derived(engine.settings.language);

  // ── State ───────────────────────────────────────────────────────────────────
  let users      = $state<User[]>([]);
  let isLoading  = $state(true);
  let loadError  = $state('');

  // Modal visibility / target state
  let showAddModal  = $state(false);
  let editTarget    = $state<User | null>(null);
  let deleteTarget  = $state<User | null>(null);

  // Per-row action loading (keyed by user id) — prevents double-clicks
  let actionLoading = $state<Record<string, boolean>>({});

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /**
   * Formats a Unix timestamp as a short human-readable date (e.g. "26 Mar 2026").
   * Returns "Never" for null timestamps (user has never logged in).
   */
  function formatDate(ts: number | null): string {
    if (ts === null) return ui('common.never', lang);
    return new Intl.DateTimeFormat(lang, { dateStyle: 'medium' }).format(new Date(ts * 1000));
  }

  /**
   * Returns design-system badge classes for a given user role.
   * Uses .badge-red (Admin), .badge-amber (GM), .badge-blue (Player) from app.css,
   * which provide correct light/dark theme variants automatically.
   */
  function roleBadgeClass(role: User['role']): string {
    switch (role) {
      case 'admin':  return 'badge badge-red';
      case 'gm':     return 'badge badge-amber';
      default:       return 'badge badge-blue';
    }
  }

  /** Human-readable role label. */
  function roleLabel(role: User['role']): string {
    const map: Record<string, string> = {
      admin:  ui('admin.users.role_admin',  lang),
      gm:     ui('admin.users.role_gm',     lang),
      player: ui('admin.users.role_player', lang),
    };
    return map[role] ?? role;
  }

  /**
   * Formats the campaigns column as a comma-separated list.
   * Each entry: "Campaign Title (N chars)"
   */
  function formatCampaigns(user: User): string {
    if (user.campaigns.length === 0) return '—';
    return user.campaigns
      .map(c => `${c.title} (${c.character_count})`)
      .join(', ');
  }

  // ── Data loading ────────────────────────────────────────────────────────────

  async function loadUsers(): Promise<void> {
    isLoading = true;
    loadError = '';
    try {
      users = await listUsers();
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        // Not an admin — redirect immediately.
        await goto('/campaigns');
        return;
      }
      loadError = e instanceof ApiError ? e.message : ui('admin.users.error_load', lang);
      console.error('[AdminUsers] loadUsers error:', e);
    } finally {
      isLoading = false;
    }
  }

  onMount(() => {
    loadUsers();
  });

  // ── Modal openers ────────────────────────────────────────────────────────────

  function openAddModal(): void {
    showAddModal = true;
  }

  function openEditModal(u: User): void {
    editTarget = u;
  }

  function openDeleteModal(u: User): void {
    deleteTarget = u;
  }

  // ── Direct row actions (no modal needed) ─────────────────────────────────────

  // Brief inline notice shown after a successful password reset.
  let resetNotice = $state<Record<string, boolean>>({});

  /**
   * Toggles suspension for a user row.
   * Calls suspendUser() or reinstateUser() immediately, then reloads the list.
   * Uses a per-row loading flag to prevent double-clicks.
   */
  async function toggleSuspend(u: User): Promise<void> {
    if (actionLoading[u.id]) return;
    actionLoading = { ...actionLoading, [u.id]: true };
    try {
      if (u.is_suspended) {
        await reinstateUser(u.id);
      } else {
        await suspendUser(u.id);
      }
      await loadUsers();
    } catch (e) {
      loadError = e instanceof ApiError ? e.message : ui('admin.users.error_action', lang);
    } finally {
      actionLoading = { ...actionLoading, [u.id]: false };
    }
  }

  /**
   * Resets a user's password to blank, forcing them through setup-password on next login.
   * No confirmation modal needed — the action is non-destructive (user can still log in).
   */
  async function handleResetPassword(u: User): Promise<void> {
    if (actionLoading[u.id]) return;
    actionLoading = { ...actionLoading, [u.id]: true };
    try {
      await resetUserPassword(u.id);
      // Show a brief "Password reset" indicator on the row, then reload.
      resetNotice = { ...resetNotice, [u.id]: true };
      setTimeout(() => {
        resetNotice = { ...resetNotice, [u.id]: false };
      }, 3000);
      await loadUsers();
    } catch (e) {
      loadError = e instanceof ApiError ? e.message : ui('admin.users.error_reset', lang);
    } finally {
      actionLoading = { ...actionLoading, [u.id]: false };
    }
  }

  // ── Utilities ───────────────────────────────────────────────────────────────

  /** Whether the given user is the currently logged-in admin (self-row guard). */
  function isSelf(user: User): boolean {
    return user.id === sessionContext.currentUserId;
  }
</script>

<svelte:head>
  <title>{ui('admin.users.title', lang)} — {ui('app.title', lang)}</title>
</svelte:head>

<PageHeader
  title={ui('admin.users.title', lang)}
  subtitle={ui('admin.users.subtitle', lang)}
  icon={IconAdmin}
>
  {#snippet actions()}
    <button
      class="btn-primary gap-1.5 shrink-0"
      onclick={openAddModal}
    >
      <IconAdd size={16} aria-hidden="true" />
      {ui('admin.users.add', lang)}
    </button>
  {/snippet}
</PageHeader>

<div class="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">

  <!-- ── ERROR BANNER ───────────────────────────────────────────────────────── -->
  {#if loadError}
    <div class="px-4 py-3 rounded-lg border border-red-700/40 bg-red-950/20 text-red-400 text-sm" role="alert">
      {loadError}
    </div>
  {/if}

  <!-- ── USER TABLE ─────────────────────────────────────────────────────────── -->
  <div class="card overflow-hidden">

    {#if isLoading}
      <!-- Loading skeleton -->
      <div class="p-8 flex items-center justify-center text-text-muted text-sm gap-2">
        <span class="animate-spin inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full" aria-hidden="true"></span>
        {ui('admin.users.loading', lang)}
      </div>

    {:else if users.length === 0 && !loadError}
      <div class="p-8 text-center text-text-muted text-sm">
        {ui('admin.users.none', lang)}
      </div>

    {:else}
      <!-- Horizontal scroll wrapper for narrow viewports -->
      <div class="overflow-x-auto">
        <table class="w-full text-sm text-left">

          <thead>
            <tr class="border-b border-border bg-surface-alt text-xs uppercase tracking-wider text-text-muted">
              <th class="px-4 py-3 font-semibold">{ui('admin.users.col_username', lang)}</th>
              <th class="px-4 py-3 font-semibold">{ui('admin.users.col_player', lang)}</th>
              <th class="px-4 py-3 font-semibold">{ui('admin.users.col_role', lang)}</th>
              <th class="px-4 py-3 font-semibold">{ui('admin.users.col_campaigns', lang)}</th>
              <th class="px-4 py-3 font-semibold">{ui('admin.users.col_created', lang)}</th>
              <th class="px-4 py-3 font-semibold">{ui('admin.users.col_last_login', lang)}</th>
              <th class="px-4 py-3 font-semibold">{ui('admin.users.col_status', lang)}</th>
              <th class="px-4 py-3 font-semibold text-right">{ui('admin.users.col_actions', lang)}</th>
            </tr>
          </thead>

          <tbody class="divide-y divide-border">
            {#each users as user (user.id)}
              {@const self = isSelf(user)}
              <tr
                class="transition-colors hover:bg-surface-alt/50 {self ? 'opacity-70' : ''}"
              >
                <!-- Username -->
                <td class="px-4 py-3 font-mono text-text-primary font-medium whitespace-nowrap">
                  {user.username}
                  {#if self}
                    <span class="ml-1.5 text-xs text-text-muted">{ui('admin.users.you', lang)}</span>
                  {/if}
                </td>

                <!-- Player Name -->
                <td class="px-4 py-3 text-text-secondary whitespace-nowrap">
                  {user.player_name}
                </td>

                <!-- Role badge -->
                <td class="px-4 py-3 whitespace-nowrap">
                  <span class={roleBadgeClass(user.role)}>
                    {roleLabel(user.role)}
                  </span>
                </td>

                <!-- Campaigns column -->
                <td class="px-4 py-3 text-text-secondary max-w-xs">
                  {#if user.campaigns.length === 0}
                    <span class="text-text-muted">—</span>
                  {:else}
                    <ul class="space-y-0.5">
                      {#each user.campaigns as c}
                        <li class="whitespace-nowrap">
                          <span class="text-text-secondary">{c.title}</span>
                          <span class="text-text-muted ml-1">({c.character_count})</span>
                        </li>
                      {/each}
                    </ul>
                  {/if}
                </td>

                <!-- Created date -->
                <td class="px-4 py-3 text-text-muted whitespace-nowrap">
                  {formatDate(user.created_at)}
                </td>

                <!-- Last login -->
                <td class="px-4 py-3 whitespace-nowrap {user.last_login_at === null ? 'text-text-muted italic' : 'text-text-secondary'}">
                  {formatDate(user.last_login_at)}
                </td>

                <!-- Status -->
                <td class="px-4 py-3 whitespace-nowrap">
                  {#if user.is_suspended}
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold
                                 border bg-orange-900/30 text-orange-400 border-orange-700/40">
                      {ui('admin.users.status_suspended', lang)}
                    </span>
                  {:else}
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold
                                 border bg-green-900/30 text-green-400 border-green-700/40">
                      {ui('admin.users.status_active', lang)}
                    </span>
                  {/if}
                </td>

                <!-- Actions -->
                <td class="px-4 py-3 whitespace-nowrap">
                  <div class="flex items-center justify-end gap-0.5">

                    <!-- Edit button -->
                    <button
                      type="button"
                      class="p-2.5 rounded-md transition-colors
                             {self
                               ? 'text-text-muted cursor-not-allowed opacity-40'
                               : 'text-text-secondary hover:text-accent hover:bg-accent/10'}"
                      disabled={self}
                      onclick={() => !self && openEditModal(user)}
                       title={self ? ui('admin.users.cannot_edit_self', lang) : ui('admin.users.edit_title', lang).replace('{username}', user.username)}
                      aria-label={ui('admin.users.edit_title', lang).replace('{username}', user.username)}
                    >
                      <IconEdit size={16} aria-hidden="true" />
                    </button>

                    <!-- Suspend / Reinstate button — direct action, no modal -->
                    <button
                      type="button"
                      class="p-2.5 rounded-md transition-colors
                             {self || actionLoading[user.id]
                               ? 'text-text-muted cursor-not-allowed opacity-40'
                               : user.is_suspended
                                 ? 'text-green-400 hover:text-green-300 hover:bg-green-900/20'
                                 : 'text-amber-400 hover:text-amber-300 hover:bg-amber-900/20'}"
                      disabled={self || !!actionLoading[user.id]}
                      onclick={() => !self && toggleSuspend(user)}
                       title={self
                         ? ui('admin.users.cannot_suspend_self', lang)
                         : user.is_suspended
                           ? ui('admin.users.reinstate_title', lang).replace('{username}', user.username)
                           : ui('admin.users.suspend_title', lang).replace('{username}', user.username)}
                      aria-label={user.is_suspended
                        ? ui('admin.users.reinstate_title', lang).replace('{username}', user.username)
                        : ui('admin.users.suspend_title', lang).replace('{username}', user.username)}
                    >
                      {#if user.is_suspended}
                        <IconUnlocked size={16} aria-hidden="true" />
                      {:else}
                        <IconLocked size={16} aria-hidden="true" />
                      {/if}
                    </button>

                    <!-- Reset Password button — blanks the password, no self-restriction -->
                    <button
                      type="button"
                      class="p-2.5 rounded-md transition-colors
                             {actionLoading[user.id]
                               ? 'text-text-muted opacity-40 cursor-not-allowed'
                               : resetNotice[user.id]
                                 ? 'text-green-400'
                                 : 'text-text-secondary hover:text-accent hover:bg-accent/10'}"
                      disabled={!!actionLoading[user.id]}
                      onclick={() => handleResetPassword(user)}
                       title={ui('admin.users.reset_password_title', lang).replace('{username}', user.username)}
                      aria-label={ui('admin.users.reset_password_title', lang).replace('{username}', user.username)}
                    >
                      <IconKey size={16} aria-hidden="true" />
                    </button>

                    <!-- Delete button -->
                    <button
                      type="button"
                      class="p-2.5 rounded-md transition-colors
                             {self
                               ? 'text-text-muted cursor-not-allowed opacity-40'
                               : 'text-text-secondary hover:text-red-400 hover:bg-red-900/20'}"
                      disabled={self}
                      onclick={() => !self && openDeleteModal(user)}
                       title={self ? ui('admin.users.cannot_delete_self', lang) : ui('admin.users.delete_title', lang).replace('{username}', user.username)}
                      aria-label={ui('admin.users.delete_title', lang).replace('{username}', user.username)}
                    >
                      <IconDelete size={16} aria-hidden="true" />
                    </button>

                  </div>
                </td>
              </tr>
            {/each}
          </tbody>

        </table>
      </div>

      <!-- Row count footer -->
      <div class="px-4 py-2 border-t border-border text-xs text-text-muted">
        {uiN('admin.users.count', users.length, lang)}
      </div>
    {/if}
  </div>

</div>

<!-- ── MODALS ────────────────────────────────────────────────────────────────── -->

<!-- Add / Edit user modal -->
<UserFormModal
  open={showAddModal || editTarget !== null}
  user={editTarget}
  onClose={() => { showAddModal = false; editTarget = null; }}
  onSuccess={loadUsers}
/>

<!-- Confirm delete modal -->
<ConfirmDeleteModal
  open={deleteTarget !== null}
  user={deleteTarget}
  onClose={() => { deleteTarget = null; }}
  onSuccess={loadUsers}
/>
