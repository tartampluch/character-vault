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
  import { listUsers, ApiError } from '$lib/api/userApi';
  import type { User } from '$lib/types/user';
  import {
    IconAdd,
    IconEdit,
    IconDelete,
    IconLocked,
    IconUnlocked,
  } from '$lib/components/ui/icons';

  // ── State ───────────────────────────────────────────────────────────────────
  let users      = $state<User[]>([]);
  let isLoading  = $state(true);
  let loadError  = $state('');

  // Modal state — wired to modal components in Phase 22.8
  let showAddModal    = $state(false);
  let editTarget      = $state<User | null>(null);
  let deleteTarget    = $state<User | null>(null);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /**
   * Formats a Unix timestamp as a short human-readable date (e.g. "26 Mar 2026").
   * Returns "Never" for null timestamps (user has never logged in).
   */
  function formatDate(ts: number | null): string {
    if (ts === null) return 'Never';
    return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(ts * 1000));
  }

  /**
   * Returns Tailwind badge classes for a given user role.
   * Admin = red, GM = amber, Player = blue.
   */
  function roleBadgeClass(role: User['role']): string {
    const base = 'inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border';
    switch (role) {
      case 'admin':  return `${base} bg-red-900/30  text-red-400  border-red-700/40`;
      case 'gm':     return `${base} bg-amber-900/30 text-amber-400 border-amber-700/40`;
      default:       return `${base} bg-blue-900/30  text-blue-400  border-blue-700/40`;
    }
  }

  /** Human-readable role label. */
  function roleLabel(role: User['role']): string {
    return { admin: 'Admin', gm: 'GM', player: 'Player' }[role] ?? role;
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
      loadError = e instanceof ApiError ? e.message : 'Failed to load users.';
      console.error('[AdminUsers] loadUsers error:', e);
    } finally {
      isLoading = false;
    }
  }

  onMount(() => {
    loadUsers();
  });

  // ── Action stubs (Phase 22.8 will wire these to modals) ─────────────────────

  function openAddModal(): void {
    showAddModal = true;
  }

  function openEditModal(user: User): void {
    editTarget = user;
  }

  function openDeleteModal(user: User): void {
    deleteTarget = user;
  }

  // ── Utilities ───────────────────────────────────────────────────────────────

  /** Whether the given user is the currently logged-in admin (self-row guard). */
  function isSelf(user: User): boolean {
    return user.id === sessionContext.currentUserId;
  }
</script>

<svelte:head>
  <title>User Management — Character Vault</title>
</svelte:head>

<div class="max-w-7xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">

  <!-- ── HEADER ─────────────────────────────────────────────────────────────── -->
  <header class="flex items-start justify-between gap-4 flex-wrap">
    <div>
      <h1 class="text-2xl font-bold text-text-primary">User Management</h1>
      <p class="mt-1 text-sm text-text-muted">
        Manage accounts, roles, and campaign memberships.
      </p>
    </div>

    <button
      class="btn-primary gap-1.5 shrink-0"
      onclick={openAddModal}
    >
      <IconAdd size={16} aria-hidden="true" />
      Add User
    </button>
  </header>

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
        Loading users…
      </div>

    {:else if users.length === 0 && !loadError}
      <div class="p-8 text-center text-text-muted text-sm">
        No users found.
      </div>

    {:else}
      <!-- Horizontal scroll wrapper for narrow viewports -->
      <div class="overflow-x-auto">
        <table class="w-full text-sm text-left">

          <thead>
            <tr class="border-b border-border bg-surface-alt text-xs uppercase tracking-wider text-text-muted">
              <th class="px-4 py-3 font-semibold">Username</th>
              <th class="px-4 py-3 font-semibold">Player Name</th>
              <th class="px-4 py-3 font-semibold">Role</th>
              <th class="px-4 py-3 font-semibold">Campaigns (chars)</th>
              <th class="px-4 py-3 font-semibold">Created</th>
              <th class="px-4 py-3 font-semibold">Last Login</th>
              <th class="px-4 py-3 font-semibold">Status</th>
              <th class="px-4 py-3 font-semibold text-right">Actions</th>
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
                    <span class="ml-1.5 text-xs text-text-muted">(you)</span>
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
                      Suspended
                    </span>
                  {:else}
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold
                                 border bg-green-900/30 text-green-400 border-green-700/40">
                      Active
                    </span>
                  {/if}
                </td>

                <!-- Actions -->
                <td class="px-4 py-3 whitespace-nowrap">
                  <div class="flex items-center justify-end gap-1">

                    <!-- Edit button -->
                    <button
                      type="button"
                      class="p-1.5 rounded-md transition-colors
                             {self
                               ? 'text-text-muted cursor-not-allowed opacity-40'
                               : 'text-text-secondary hover:text-accent hover:bg-accent/10'}"
                      disabled={self}
                      onclick={() => !self && openEditModal(user)}
                      title={self ? 'Cannot edit your own account' : `Edit ${user.username}`}
                      aria-label="Edit {user.username}"
                    >
                      <IconEdit size={15} aria-hidden="true" />
                    </button>

                    <!-- Suspend / Reinstate button -->
                    <button
                      type="button"
                      class="p-1.5 rounded-md transition-colors
                             {self
                               ? 'text-text-muted cursor-not-allowed opacity-40'
                               : user.is_suspended
                                 ? 'text-green-400 hover:text-green-300 hover:bg-green-900/20'
                                 : 'text-amber-400 hover:text-amber-300 hover:bg-amber-900/20'}"
                      disabled={self}
                      title={self
                        ? 'Cannot suspend your own account'
                        : user.is_suspended
                          ? `Reinstate ${user.username}`
                          : `Suspend ${user.username}`}
                      aria-label="{user.is_suspended ? 'Reinstate' : 'Suspend'} {user.username}"
                    >
                      {#if user.is_suspended}
                        <IconUnlocked size={15} aria-hidden="true" />
                      {:else}
                        <IconLocked size={15} aria-hidden="true" />
                      {/if}
                    </button>

                    <!-- Delete button -->
                    <button
                      type="button"
                      class="p-1.5 rounded-md transition-colors
                             {self
                               ? 'text-text-muted cursor-not-allowed opacity-40'
                               : 'text-text-secondary hover:text-red-400 hover:bg-red-900/20'}"
                      disabled={self}
                      onclick={() => !self && openDeleteModal(user)}
                      title={self ? 'Cannot delete your own account' : `Delete ${user.username}`}
                      aria-label="Delete {user.username}"
                    >
                      <IconDelete size={15} aria-hidden="true" />
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
        {users.length} {users.length === 1 ? 'user' : 'users'}
      </div>
    {/if}
  </div>

</div>

<!--
  Phase 22.8: Mount UserFormModal and ConfirmDeleteModal here.
  Bind showAddModal, editTarget, and deleteTarget to trigger them.
  After each successful action, call loadUsers() to refresh the list.
-->
