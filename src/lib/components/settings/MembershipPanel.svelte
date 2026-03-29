<!--
  @file src/lib/components/settings/MembershipPanel.svelte
  @description Campaign Members panel — member list with modal add/remove UI.
  Extracted from settings/+page.svelte as part of F1f refactoring.

  Props:
    campaignId: string  — the campaign ID used for API calls
-->

<script lang="ts">
  import { onMount } from 'svelte';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import { IconVault, IconAdd, IconDelete, IconClose } from '$lib/components/ui/icons';
  import { getCampaignUsers, addCampaignUser, removeCampaignUser, listUsers, ApiError } from '$lib/api/userApi';
  import type { CampaignMember, User } from '$lib/types/user';

  let { campaignId }: { campaignId: string } = $props();

  let members              = $state<CampaignMember[]>([]);
  let membersLoading       = $state(false);
  let membersError         = $state('');
  let memberActionLoading  = $state<Record<string, boolean>>({});

  // Modal state
  let modalOpen      = $state(false);
  let pickerSearch   = $state('');
  let pickerUsers    = $state<User[]>([]);
  let pickerLoading  = $state(false);
  let pickerError    = $state('');
  let pickerInputEl  = $state<HTMLInputElement | null>(null);

  /** IDs of users already in the campaign — used to exclude them from picker. */
  const memberIds = $derived(new Set(members.map(m => m.user_id)));

  /** Filtered picker users: match search text AND not already a member. */
  const filteredPickerUsers = $derived(
    pickerUsers.filter(u => {
      if (memberIds.has(u.id)) return false;
      if (!pickerSearch.trim()) return true;
      const q = pickerSearch.toLowerCase();
      return u.username.toLowerCase().includes(q) || u.player_name.toLowerCase().includes(q);
    })
  );

  async function loadMembers(): Promise<void> {
    membersLoading = true;
    membersError   = '';
    try {
      members = await getCampaignUsers(campaignId);
    } catch (e) {
      membersError = e instanceof ApiError ? e.message : ui('settings.members.error_load', engine.settings.language);
    } finally {
      membersLoading = false;
    }
  }

  // Load members immediately — panel is open by default.
  onMount(() => { loadMembers(); });

  async function openModal(): Promise<void> {
    pickerSearch = '';
    pickerError  = '';
    modalOpen    = true;
    // Focus the search input after the modal renders.
    setTimeout(() => pickerInputEl?.focus(), 30);
    if (pickerUsers.length === 0) {
      pickerLoading = true;
      try {
        pickerUsers = await listUsers();
      } catch (e) {
        if (e instanceof ApiError && e.status === 403) {
          pickerError = ui('settings.members.admin_only', engine.settings.language);
        } else {
          pickerError = e instanceof ApiError ? e.message : ui('settings.members.error_load_users', engine.settings.language);
        }
      } finally {
        pickerLoading = false;
      }
    }
  }

  function closeModal(): void { modalOpen = false; }

  async function handleAddMember(userId: string): Promise<void> {
    closeModal();
    try {
      await addCampaignUser(campaignId, userId);
      await loadMembers();
    } catch (e) {
      membersError = e instanceof ApiError ? e.message : ui('settings.members.error_add', engine.settings.language);
    }
  }

  async function handleRemoveMember(userId: string): Promise<void> {
    if (memberActionLoading[userId]) return;
    memberActionLoading = { ...memberActionLoading, [userId]: true };
    try {
      await removeCampaignUser(campaignId, userId);
      members = members.filter(m => m.user_id !== userId);
    } catch (e) {
      membersError = e instanceof ApiError ? e.message : ui('settings.members.error_remove', engine.settings.language);
      await loadMembers();
    } finally {
      memberActionLoading = { ...memberActionLoading, [userId]: false };
    }
  }

  function memberRoleBadge(role: CampaignMember['role']): string {
    switch (role) {
      case 'admin':  return 'badge badge-red';
      case 'gm':     return 'badge badge-amber';
      default:       return 'badge badge-blue';
    }
  }

  function memberRoleLabel(role: CampaignMember['role']): string {
    const lang = engine.settings.language;
    switch (role) {
      case 'admin':  return ui('settings.members.role_admin', lang);
      case 'gm':     return ui('common.gm', lang);
      default:       return ui('common.player', lang);
    }
  }

  /** Close modal on Escape key. */
  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') closeModal();
  }
</script>

<!-- ── CAMPAIGN MEMBERS ───────────────────────────────────────────────────── -->
<section class="card p-5 flex flex-col gap-4" aria-label={ui('settings.members.title', engine.settings.language)}>

  <div class="flex items-center justify-between gap-2">
    <h2 class="flex items-center gap-2 text-base font-semibold text-accent">
      <IconVault size={18} aria-hidden="true" />
      {ui('settings.members.title', engine.settings.language)}
      {#if members.length > 0}
        <span class="text-xs font-normal text-text-muted">({members.length})</span>
      {/if}
    </h2>
    <button
      type="button"
      class="btn-secondary gap-1.5 text-sm shrink-0"
      onclick={openModal}
    >
      <IconAdd size={14} aria-hidden="true" />
      {ui('settings.members.add', engine.settings.language)}
    </button>
  </div>

  <!-- Error banner -->
  {#if membersError}
    <div class="px-3 py-2 rounded border border-red-700/40 bg-red-950/20 text-red-400 text-sm" role="alert">
      {membersError}
    </div>
  {/if}

  <!-- Loading -->
  {#if membersLoading}
    <div class="flex items-center gap-2 text-text-muted text-sm py-2">
      <span class="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full shrink-0" aria-hidden="true"></span>
      {ui('settings.members.loading', engine.settings.language)}
    </div>

  {:else if members.length === 0}
    <p class="text-sm text-text-muted">{ui('settings.members.empty', engine.settings.language)}</p>

  {:else}
    <ul class="flex flex-col divide-y divide-border rounded-lg border border-border overflow-hidden">
      {#each members as member (member.user_id)}
        <li class="flex items-center justify-between gap-3 px-3 py-2.5">
          <div class="flex items-center gap-2 min-w-0">
            <span class={memberRoleBadge(member.role)}>
              {memberRoleLabel(member.role)}
            </span>
            <span class="text-sm font-medium text-text-primary truncate">
              {member.username}
            </span>
            <span class="text-xs text-text-muted truncate hidden sm:inline">
              {member.player_name}
            </span>
            {#if member.is_suspended}
              <span class="text-xs text-orange-400 font-medium shrink-0">{ui('settings.members.suspended', engine.settings.language)}</span>
            {/if}
          </div>
          <button
            type="button"
            class="shrink-0 p-1.5 rounded-md text-text-muted hover:text-red-400 hover:bg-red-900/20
                   transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={!!memberActionLoading[member.user_id]}
            onclick={() => handleRemoveMember(member.user_id)}
            title={ui('settings.members.remove', engine.settings.language).replace('{username}', member.username)}
            aria-label={ui('settings.members.remove', engine.settings.language).replace('{username}', member.username)}
          >
            <IconDelete size={14} aria-hidden="true" />
          </button>
        </li>
      {/each}
    </ul>
  {/if}

</section>

<!-- ── ADD MEMBER MODAL ───────────────────────────────────────────────────── -->
{#if modalOpen}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
    aria-label={ui('settings.members.add', engine.settings.language)}
    onkeydown={handleKeydown}
  >
    <!-- Backdrop -->
    <div
      class="absolute inset-0 bg-black/60 backdrop-blur-sm"
      onclick={closeModal}
      aria-hidden="true"
    ></div>

    <!-- Dialog panel -->
    <div class="relative z-10 w-full max-w-sm rounded-xl border border-border
                bg-surface shadow-2xl flex flex-col overflow-hidden max-h-[80vh]">

      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <h3 class="text-sm font-semibold text-text-primary">
          {ui('settings.members.add', engine.settings.language)}
        </h3>
        <button
          type="button"
          class="p-1 rounded text-text-muted hover:text-text-primary transition-colors"
          onclick={closeModal}
          aria-label={ui('common.close', engine.settings.language)}
        >
          <IconClose size={16} aria-hidden="true" />
        </button>
      </div>

      <!-- Search -->
      <div class="px-3 py-2.5 border-b border-border shrink-0">
        <input
          type="search"
          bind:this={pickerInputEl}
          bind:value={pickerSearch}
          placeholder={ui('settings.members.search_placeholder', engine.settings.language)}
          class="input text-sm w-full"
        />
      </div>

      <!-- User list -->
      <div class="overflow-y-auto flex-1">
        {#if pickerLoading}
          <div class="p-6 text-sm text-text-muted text-center flex items-center justify-center gap-2">
            <span class="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" aria-hidden="true"></span>
            {ui('settings.members.loading_users', engine.settings.language)}
          </div>

        {:else if pickerError}
          <div class="p-4 text-sm text-red-400 text-center">{pickerError}</div>

        {:else if filteredPickerUsers.length === 0}
          <div class="p-4 text-sm text-text-muted text-center">
            {pickerSearch ? ui('settings.members.no_match', engine.settings.language) : ui('settings.members.all_members', engine.settings.language)}
          </div>

        {:else}
          <ul>
            {#each filteredPickerUsers as u (u.id)}
              <li>
                <button
                  type="button"
                  class="flex items-center justify-between w-full px-4 py-2.5 text-left text-sm
                         transition-colors hover:bg-surface-alt
                         {u.is_suspended ? 'text-text-muted' : 'text-text-primary'}"
                  onclick={() => handleAddMember(u.id)}
                >
                  <span>
                    <span class="font-medium">{u.username}</span>
                    <span class="text-xs ml-1.5 {u.is_suspended ? 'text-text-muted/70' : 'text-text-muted'}">
                      {u.player_name}
                    </span>
                  </span>
                  <span class="flex items-center gap-1.5 shrink-0 ml-2">
                    <span class={memberRoleBadge(u.role)}>
                      {memberRoleLabel(u.role)}
                    </span>
                    {#if u.is_suspended}
                      <span class="text-xs text-orange-400">{ui('settings.members.suspended', engine.settings.language)}</span>
                    {/if}
                  </span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

    </div>
  </div>
{/if}
