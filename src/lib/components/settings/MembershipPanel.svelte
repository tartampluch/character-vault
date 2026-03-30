<!--
  @file src/lib/components/settings/MembershipPanel.svelte
  @description Campaign Members panel — character-based enrollment list with
  modal add/remove UI.

  SAVE BEHAVIOUR (flat-diff model):
    The panel maintains two lists:
      loadedMembers  — the server's current state (last API fetch)
      localMembers   — the user's desired state (editable locally)

    Add/remove operations mutate `localMembers` only — no API calls happen
    immediately. On commit() the panel diffs the two lists and executes the
    minimal set of add/remove API calls. This naturally handles cases like
    "remove then re-add the same character" (net diff = nothing to do).

  Member list rows:  Character Name  Player Name (dimmed)  [trash]
  Add Modal:         Multi-select character picker grouped by enrollment status.

  Props:
    campaignId : string                — the campaign ID used for API calls
    commit     : () => Promise<void>   — $bindable; parent calls this on save
-->

<script lang="ts">
  import { onMount } from 'svelte';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import { IconVault, IconAdd, IconDelete, IconClose } from '$lib/components/ui/icons';
  import {
    getCampaignCharacters,
    getAllCharactersForPicker,
    addCampaignCharacters,
    removeCampaignCharacter,
    ApiError,
  } from '$lib/api/userApi';
  import type { CharacterSummary } from '$lib/api/userApi';

  let {
    campaignId,
    commit = $bindable<() => Promise<void>>(),
    hasPendingChanges = $bindable(false),
  }: {
    campaignId: string;
    commit?: () => Promise<void>;
    hasPendingChanges?: boolean;
  } = $props();

  // ---------------------------------------------------------------------------
  // MEMBER LIST STATE
  // ---------------------------------------------------------------------------

  /** Server state — reflects what is actually persisted in the DB. */
  let loadedMembers  = $state<CharacterSummary[]>([]);
  /** User's desired state — mutated locally; diffed against loadedMembers on save. */
  let localMembers   = $state<CharacterSummary[]>([]);
  let membersLoading = $state(false);
  let membersError   = $state('');

  // ---------------------------------------------------------------------------
  // MODAL STATE
  // ---------------------------------------------------------------------------

  let modalOpen     = $state(false);
  let pickerSearch  = $state('');
  let pickerChars   = $state<CharacterSummary[]>([]);
  let pickerLoading = $state(false);
  let pickerError   = $state('');
  let pickerInputEl = $state<HTMLInputElement | null>(null);
  let selected      = $state(new Set<string>());

  // ---------------------------------------------------------------------------
  // DERIVED
  // ---------------------------------------------------------------------------

  const localMemberIds = $derived(new Set(localMembers.map(m => m.id)));

  /** True when localMembers differs from loadedMembers (unsaved changes). */
  const _hasPendingChanges = $derived.by(() => {
    const loadedIds = new Set(loadedMembers.map(m => m.id));
    for (const m of localMembers)  if (!loadedIds.has(m.id))       return true;
    for (const m of loadedMembers) if (!localMemberIds.has(m.id))  return true;
    return false;
  });

  /** Sync internal derived dirty state to the parent via the $bindable prop. */
  $effect(() => { hasPendingChanges = _hasPendingChanges; });

  /**
   * Picker groups — categorised using the LOCAL desired state (not DB state)
   * so the picker immediately reflects pending adds/removes without re-fetching.
   *
   *  available  chars NOT in localMembers that can be added:
   *    • No campaignId (completely free), OR
   *    • campaignId === currentCampaignId (removed from list — can be re-added)
   *
   *  enrolled   chars that cannot be added:
   *    • Already in localMembers (shown in the list), OR
   *    • Enrolled in a DIFFERENT campaign
   */
  const pickerGroups = $derived.by(() => {
    const q = pickerSearch.trim().toLowerCase();
    const matches = (c: CharacterSummary) => {
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.playerName ?? '').toLowerCase().includes(q)
      );
    };

    const available: CharacterSummary[] = [];
    const enrolled:  CharacterSummary[] = [];

    for (const c of pickerChars) {
      if (!matches(c)) continue;

      if (localMemberIds.has(c.id)) {
        // Already in the desired list → greyed.
        enrolled.push(c);
      } else if (c.campaignId && c.campaignId !== campaignId) {
        // Enrolled in a different campaign → greyed.
        enrolled.push(c);
      } else {
        // Free, OR from this campaign but removed → selectable.
        available.push(c);
      }
    }

    return { available, enrolled };
  });

  const hasPickerResults = $derived(
    pickerGroups.available.length > 0 || pickerGroups.enrolled.length > 0,
  );

  // ---------------------------------------------------------------------------
  // MEMBER LIST OPERATIONS  (mutate localMembers only — no API calls)
  // ---------------------------------------------------------------------------

  async function loadMembers(): Promise<void> {
    membersLoading = true;
    membersError   = '';
    try {
      loadedMembers = await getCampaignCharacters(campaignId);
      localMembers  = [...loadedMembers];
    } catch (e) {
      membersError = e instanceof ApiError
        ? e.message
        : ui('settings.members.error_load', engine.settings.language);
    } finally {
      membersLoading = false;
    }
  }

  onMount(() => { loadMembers(); });

  function handleRemove(charId: string): void {
    localMembers = localMembers.filter(m => m.id !== charId);
  }

  // ---------------------------------------------------------------------------
  // MODAL OPERATIONS  (no API calls on add — deferred to commit)
  // ---------------------------------------------------------------------------

  async function openModal(): Promise<void> {
    pickerSearch = '';
    pickerError  = '';
    selected     = new Set();
    modalOpen    = true;
    setTimeout(() => pickerInputEl?.focus(), 30);

    // Always reload from API so the picker data is fresh.
    // The picker groups are then derived from localMembers (local desired state)
    // so pending removes / adds are reflected immediately without relying on
    // the API data being up-to-date.
    pickerLoading = true;
    try {
      pickerChars = await getAllCharactersForPicker(campaignId);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        pickerError = ui('settings.members.admin_only', engine.settings.language);
      } else {
        pickerError = e instanceof ApiError
          ? e.message
          : ui('settings.members.error_load_chars', engine.settings.language);
      }
    } finally {
      pickerLoading = false;
    }
  }

  function closeModal(): void {
    modalOpen = false;
    selected  = new Set();
  }

  function toggleSelect(charId: string): void {
    const next = new Set(selected);
    if (next.has(charId)) {
      next.delete(charId);
    } else {
      next.add(charId);
    }
    selected = next;
  }

  /** Moves selected chars into localMembers (no API call). */
  function handleAddSelected(): void {
    if (selected.size === 0) return;
    const toAdd: CharacterSummary[] = [];
    for (const charId of selected) {
      const char = pickerChars.find(c => c.id === charId);
      if (char && !localMemberIds.has(charId)) toAdd.push(char);
    }
    if (toAdd.length > 0) {
      localMembers = [...localMembers, ...toAdd];
    }
    selected = new Set();
    closeModal();
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') closeModal();
  }

  // ---------------------------------------------------------------------------
  // COMMIT  (flat-diff — called by parent on "Save Settings")
  // ---------------------------------------------------------------------------

  /**
   * Computes the diff between localMembers and loadedMembers and persists it.
   * Handles remove-then-re-add as a no-op (net diff is empty).
   * Throws on failure so the parent's save handler can show an error toast.
   */
  async function doCommit(): Promise<void> {
    const loadedIds = new Set(loadedMembers.map(m => m.id));

    const toAdd    = localMembers.filter(m => !loadedIds.has(m.id));
    const toRemove = loadedMembers.filter(m => !localMemberIds.has(m.id));

    if (toAdd.length === 0 && toRemove.length === 0) return;

    if (toAdd.length > 0) {
      await addCampaignCharacters(campaignId, toAdd.map(c => c.id));
    }
    for (const char of toRemove) {
      await removeCampaignCharacter(campaignId, char.id);
    }

    // Re-sync both lists from API so the next save starts from a clean state.
    loadedMembers = await getCampaignCharacters(campaignId);
    localMembers  = [...loadedMembers];
  }

  // Expose the commit function to the parent via $bindable.
  $effect(() => {
    commit = doCommit;
  });
</script>

<!-- ── CAMPAIGN MEMBERS ───────────────────────────────────────────────────── -->
<section class="card p-5 flex flex-col gap-4" aria-label={ui('settings.members.title', engine.settings.language)}>

  <div class="flex items-center justify-between gap-2">
    <h2 class="flex items-center gap-2 text-base font-semibold text-accent">
      <IconVault size={18} aria-hidden="true" />
      {ui('settings.members.title', engine.settings.language)}
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

  {:else if localMembers.length === 0}
    <p class="text-sm text-text-muted">{ui('settings.members.empty', engine.settings.language)}</p>

  {:else}
    <ul class="flex flex-col divide-y divide-border rounded-lg border border-border overflow-hidden">
      {#each localMembers as member (member.id)}
        <li class="flex items-center justify-between gap-3 px-3 h-11">
          <div class="flex items-center gap-2 min-w-0 flex-1">
            <span class="text-sm font-medium text-text-primary truncate">
              {member.name}
            </span>
            {#if member.playerName}
              <span class="text-xs text-text-muted truncate shrink-0">
                {member.playerName}
              </span>
            {/if}
          </div>

          <button
            type="button"
            class="shrink-0 p-1.5 rounded-md text-text-muted hover:text-red-400 hover:bg-red-900/20
                   transition-colors"
            onclick={() => handleRemove(member.id)}
            title={ui('settings.members.remove', engine.settings.language).replace('{name}', member.name)}
            aria-label={ui('settings.members.remove', engine.settings.language).replace('{name}', member.name)}
          >
            <IconDelete size={14} aria-hidden="true" />
          </button>
        </li>
      {/each}
    </ul>
  {/if}

</section>

<!-- ── ADD CHARACTERS MODAL ──────────────────────────────────────────────── -->
{#if modalOpen}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4"
    role="dialog"
    tabindex="-1"
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

      <!-- Character list -->
      <div class="overflow-y-auto flex-1">
        {#if pickerLoading}
          <div class="p-6 text-sm text-text-muted text-center flex items-center justify-center gap-2">
            <span class="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" aria-hidden="true"></span>
            {ui('settings.members.loading_chars', engine.settings.language)}
          </div>

        {:else if pickerError}
          <div class="p-4 text-sm text-red-400 text-center">{pickerError}</div>

        {:else if !hasPickerResults}
          <div class="p-4 text-sm text-text-muted text-center">
            {pickerSearch
              ? ui('settings.members.no_match', engine.settings.language)
              : ui('settings.members.all_enrolled', engine.settings.language)}
          </div>

        {:else}
          <ul role="listbox" aria-multiselectable="true">

            <!-- ── Available characters ────────────────────────────────────── -->
            {#each pickerGroups.available as char (char.id)}
              {@const isChecked = selected.has(char.id)}
              <li>
                <button
                  type="button"
                  role="option"
                  aria-selected={isChecked}
                  class="flex items-center gap-3 w-full px-4 h-11 text-left text-sm
                         transition-colors hover:bg-surface-alt
                         {isChecked ? 'bg-surface-alt' : ''}"
                  onclick={() => toggleSelect(char.id)}
                >
                  <span
                    class="shrink-0 w-4 h-4 rounded border transition-colors
                           {isChecked
                             ? 'bg-accent border-accent'
                             : 'border-border bg-transparent'}"
                    aria-hidden="true"
                  >
                    {#if isChecked}
                      <svg viewBox="0 0 12 12" class="w-full h-full p-0.5 text-white fill-none stroke-current stroke-2">
                        <polyline points="1.5,6 4.5,9 10.5,3" />
                      </svg>
                    {/if}
                  </span>

                  <span class="flex items-baseline gap-2 min-w-0">
                    <span class="font-medium text-text-primary truncate">{char.name}</span>
                    {#if char.playerName}
                      <span class="text-xs text-text-muted shrink-0">{char.playerName}</span>
                    {/if}
                  </span>
                </button>
              </li>
            {/each}

            <!-- ── Already enrolled ────────────────────────────────────────── -->
            {#if pickerGroups.enrolled.length > 0}
              <li class="px-4 pt-3 pb-1" aria-hidden="true">
                <span class="text-xs font-semibold text-text-muted uppercase tracking-wide">
                  {ui('settings.members.already_enrolled', engine.settings.language)}
                </span>
              </li>
              {#each pickerGroups.enrolled as char (char.id)}
                <li>
                  <div
                    class="flex items-center gap-3 w-full px-4 h-11 text-sm
                           opacity-50 cursor-default select-none"
                    aria-disabled="true"
                  >
                    <span
                      class="shrink-0 w-4 h-4 rounded border border-border bg-transparent"
                      aria-hidden="true"
                    ></span>
                    <span class="flex items-baseline gap-2 min-w-0">
                      <span class="font-medium text-text-primary truncate">{char.name}</span>
                      {#if char.playerName}
                        <span class="text-xs text-text-muted shrink-0">{char.playerName}</span>
                      {/if}
                    </span>
                  </div>
                </li>
              {/each}
            {/if}

          </ul>
        {/if}
      </div>

      <!-- Footer -->
      <div class="px-4 py-3 border-t border-border shrink-0 flex justify-end gap-2">
        <button
          type="button"
          class="btn-ghost text-sm"
          onclick={closeModal}
        >
          {ui('settings.members.close_picker', engine.settings.language)}
        </button>
        <button
          type="button"
          class="btn-primary text-sm gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={selected.size === 0}
          onclick={handleAddSelected}
        >
          <IconAdd size={13} aria-hidden="true" />
          {ui('settings.members.add_selected', engine.settings.language)}
          {#if selected.size > 0}
            <span class="ml-0.5 opacity-75">({selected.size})</span>
          {/if}
        </button>
      </div>

    </div>
  </div>
{/if}
