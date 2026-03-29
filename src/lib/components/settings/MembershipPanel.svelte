<!--
  @file src/lib/components/settings/MembershipPanel.svelte
  @description Campaign Members panel — collapsible list with add/remove UI.
  Extracted from settings/+page.svelte as part of F1f refactoring.

  Props:
    campaignId: string  — the campaign ID used for API calls
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import { IconVault, IconChevronDown, IconChevronUp, IconAdd, IconDelete } from '$lib/components/ui/icons';
  import { getCampaignUsers, addCampaignUser, removeCampaignUser, listUsers, ApiError } from '$lib/api/userApi';
  import type { CampaignMember, User } from '$lib/types/user';

  let { campaignId }: { campaignId: string } = $props();

  let membersOpen          = $state(false);
  let members              = $state<CampaignMember[]>([]);
  let membersLoading       = $state(false);
  let membersError         = $state('');
  let memberActionLoading  = $state<Record<string, boolean>>({});

  // User picker state
  let pickerOpen     = $state(false);
  let pickerSearch   = $state('');
  let pickerUsers    = $state<User[]>([]);   // all users from listUsers()
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

  function toggleMembers(): void {
    membersOpen = !membersOpen;
    if (membersOpen && members.length === 0 && !membersLoading) {
      loadMembers();
    }
  }

  async function openPicker(): Promise<void> {
    pickerSearch = '';
    pickerError  = '';
    pickerOpen   = true;
    // Focus the search input after the picker renders (replaces `autofocus` attr).
    setTimeout(() => pickerInputEl?.focus(), 10);
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

  async function handleAddMember(userId: string): Promise<void> {
    pickerOpen = false;
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
      // Remove from local state immediately for instant feedback, then reload.
      members = members.filter(m => m.user_id !== userId);
    } catch (e) {
      membersError = e instanceof ApiError ? e.message : ui('settings.members.error_remove', engine.settings.language);
      await loadMembers(); // Reload to restore consistent state
    } finally {
      memberActionLoading = { ...memberActionLoading, [userId]: false };
    }
  }

  /**
   * Role badge colour classes — uses design system badge variants defined in app.css.
   * badge-red for Admin (high privilege / danger), badge-amber for GM (authority),
   * badge-blue for Player (informational). Both light and dark themes are handled
   * automatically by the .badge-* design system classes.
   */
  function memberRoleBadge(role: CampaignMember['role']): string {
    switch (role) {
      case 'admin':  return 'badge badge-red';
      case 'gm':     return 'badge badge-amber';
      default:       return 'badge badge-blue';
    }
  }

  /**
   * Localized role display label for a campaign member.
   * Delegates D&D/app terminology to ui() — no hardcoded English literals in templates.
   * ARCHITECTURE.md §2 zero-hardcoding rule.
   */
  function memberRoleLabel(role: CampaignMember['role']): string {
    const lang = engine.settings.language;
    switch (role) {
      case 'admin':  return ui('settings.members.role_admin', lang);
      case 'gm':     return ui('common.gm', lang);
      default:       return ui('common.player', lang);
    }
  }
</script>

<!-- ── SECTION 7: CAMPAIGN MEMBERS (Phase 22.9) ─────────────────────────────── -->
<section class="card overflow-hidden">

  <!-- Collapsible toggle header -->
  <button
    type="button"
    class="flex items-center justify-between w-full px-5 py-4 text-left
           hover:bg-surface-alt/50 transition-colors focus:outline-none
           focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50"
    onclick={toggleMembers}
    aria-expanded={membersOpen}
  >
    <h2 class="flex items-center gap-2 text-base font-semibold text-text-primary">
      <IconVault size={20} aria-hidden="true" />
      {ui('settings.members.title', engine.settings.language)}
      {#if members.length > 0}
        <span class="text-xs font-normal text-text-muted">({members.length})</span>
      {/if}
    </h2>
    {#if membersOpen}
      <IconChevronUp size={16} class="shrink-0 text-text-muted" aria-hidden="true" />
    {:else}
      <IconChevronDown size={16} class="shrink-0 text-text-muted" aria-hidden="true" />
    {/if}
  </button>

  {#if membersOpen}
    <div class="border-t border-border px-5 py-4 flex flex-col gap-4">

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
        <!-- Member list -->
        <ul class="flex flex-col divide-y divide-border rounded-lg border border-border overflow-hidden">
          {#each members as member (member.user_id)}
            <li class="flex items-center justify-between gap-3 px-3 py-2.5">
              <div class="flex items-center gap-2 min-w-0">
                 <!-- Role badge -->
                <span class={memberRoleBadge(member.role)}>
                  {memberRoleLabel(member.role)}
                </span>
                <!-- Username + player name -->
                <span class="text-sm font-medium text-text-primary truncate">
                  {member.username}
                </span>
                <span class="text-xs text-text-muted truncate hidden sm:inline">
                  {member.player_name}
                </span>
                 <!-- Suspended indicator -->
                {#if member.is_suspended}
                  <span class="text-xs text-orange-400 font-medium shrink-0">{ui('settings.members.suspended', engine.settings.language)}</span>
                {/if}
              </div>
              <!-- Remove button -->
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

      <!-- Add Member button + inline user picker -->
      <div class="relative">
        <button
          type="button"
          class="btn-secondary gap-1.5 text-sm"
          onclick={openPicker}
        >
          <IconAdd size={14} aria-hidden="true" />
          {ui('settings.members.add', engine.settings.language)}
        </button>

        {#if pickerOpen}
          <!-- Backdrop: clicking outside closes the picker -->
          <div
            class="fixed inset-0 z-10"
            onclick={() => (pickerOpen = false)}
            aria-hidden="true"
          ></div>

          <!-- Picker dropdown -->
          <div class="absolute left-0 top-full mt-1 z-20 w-72 rounded-lg border border-border
                       bg-surface shadow-xl flex flex-col overflow-hidden">
            <!-- Search input -->
            <div class="px-3 pt-3 pb-2 border-b border-border">
              <input
                type="search"
                bind:this={pickerInputEl}
                bind:value={pickerSearch}
                placeholder={ui('settings.members.search_placeholder', engine.settings.language)}
                class="input text-sm w-full"
              />
            </div>

            <!-- User list -->
            <div class="overflow-y-auto max-h-60">
              {#if pickerLoading}
                <div class="p-4 text-sm text-text-muted text-center">{ui('settings.members.loading_users', engine.settings.language)}</div>

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
                        class="flex items-center justify-between w-full px-3 py-2 text-left text-sm
                               transition-colors hover:bg-surface-alt
                               {u.is_suspended ? 'text-text-muted' : 'text-text-primary'}"
                        onclick={() => handleAddMember(u.id)}
                      >
                        <span>
                          <span class="font-medium">{u.username}</span>
                          <span class="text-xs ml-1 {u.is_suspended ? 'text-text-muted/70' : 'text-text-muted'}">
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

            <!-- Close footer -->
            <div class="border-t border-border px-3 py-2">
              <button
                type="button"
                class="text-xs text-text-muted hover:text-text-secondary w-full text-center"
                onclick={() => (pickerOpen = false)}
              >
                {ui('settings.members.close_picker', engine.settings.language)}
              </button>
            </div>
          </div>
        {/if}
      </div>

    </div>
  {/if}

</section>
