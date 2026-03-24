<!--
  @file src/lib/components/content-editor/TagPickerModal.svelte
  @description Modal for picking one or more tag strings from the full tag pool.

  PURPOSE:
    Used wherever an editor field needs the GM to choose tags — e.g.:
      • `Feature.tags: string[]`          (CoreFieldsSection — 21.3.2)
      • `Feature.forbiddenTags: string[]` (CoreFieldsSection — 21.3.2)
      • `Modifier.drBypassTags: string[]` (ModifierListEditor — 21.3.3)
      • `has_tag` / `missing_tag` value in ConditionNodeBuilder (21.2.6)

    Exposes the full tag pool — every distinct tag string currently present
    across all Features in the DataLoader cache — so GMs can pick from existing
    tags rather than typing from memory.  A freeform "Add custom tag" input
    lets them introduce new tags that don't yet exist in any loaded entity.

  TAG POOL DERIVATION:
    1. Iterate `dataLoader.getAllFeatures()`.
    2. For every feature, add each tag in `feature.tags` to a `Map<tag, count>`.
       Also include `feature.forbiddenTags` so condition-builders can pick from
       the full forbidden-tag vocabulary as well.
    3. Group all collected tags by prefix: the segment before the first `_`
       (e.g., `"feat_power_attack"` → prefix `"feat"`).
       Tags with no underscore fall into an "Uncategorised" group.
    4. Within each group, sort tags alphabetically.
    5. Sort groups alphabetically.

  USAGE COUNT BADGE:
    Shows how many Feature entries in the DataLoader cache carry each tag.
    A count of "1" is normal for very specific tags; counts ≥ 10 indicate a
    well-established convention tag.

  SELECTION MODEL:
    Always multi-select: the component accumulates a `Set<string>` of selected
    tags and calls `onTagsPicked(string[])` when the GM confirms.

    `initialSelected?: string[]` — pre-ticks tags the field already holds, so
    the GM sees the current state and can add/remove without losing existing tags.

  CUSTOM TAG:
    An always-visible text input at the bottom allows the GM to type a new tag
    that does not yet exist in the pool.  Pressing Enter or clicking "+ Add"
    adds it to the selection immediately (does not persist until Confirm).
    Validation: non-empty, no spaces (convention: `snake_case`), not already
    in the selection.

  CALLBACK PROPS (Svelte 5 pattern):
    onTagsPicked(tags: string[]) — called with the final selected tag array.
    onclose()                    — called when the user dismisses.

  @see src/lib/components/content-editor/ConditionNodeBuilder.svelte (21.2.6)
  @see src/lib/engine/DataLoader.ts for the tag pool source.
  @see ARCHITECTURE.md §21.4 for the picker modal design specification.
-->

<script lang="ts">
  import { untrack } from 'svelte';
  import Modal from '$lib/components/ui/Modal.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';

  // ===========================================================================
  // PROPS
  // ===========================================================================

  interface Props {
    /** Called when the GM confirms the selection. Always an array (may be empty). */
    onTagsPicked: (tags: string[]) => void;
    /** Called when the GM dismisses without confirming. */
    onclose: () => void;
    /**
     * Tags already selected by the field this picker serves.
     * They are pre-ticked when the modal opens.
     * Read once at mount via `untrack` — not a live reactive binding.
     */
    initialSelected?: string[];
  }

  let { onTagsPicked, onclose, initialSelected = [] }: Props = $props();

  // ===========================================================================
  // TAG POOL — collected from DataLoader
  // ===========================================================================

  /**
   * A single entry in the tag pool.
   */
  interface TagEntry {
    tag:   string;
    count: number;  // how many Feature entries in the cache carry this tag
  }

  /**
   * A named group of tags sharing a common prefix.
   */
  interface TagGroup {
    prefix:  string;       // e.g. "feat", "item", "weapon"
    entries: TagEntry[];   // sorted alphabetically within the group
  }

  /**
   * Builds the full tag pool from the DataLoader cache and groups by prefix.
   *
   * We use `$derived.by` so the pool is rebuilt whenever DataLoader's
   * underlying state changes (e.g., after a campaign switches and the DataLoader
   * is reloaded with new rule sources).
   *
   * GROUPING ALGORITHM:
   *   prefix = tag.split('_')[0]   (text before the first underscore)
   *   Tags without an underscore → prefix = tag itself (they form a singleton group,
   *   or merge with the "Uncategorised" bucket if no common prefix exists).
   *
   *   Convention in this codebase: prefix_<rest> e.g. "feat_power_attack",
   *   "race_elf", "weapon_slashing", "condition_blinded".
   */
  const tagGroups = $derived.by((): TagGroup[] => {
    // Step 1: build tag → usage-count map (include both tags and forbiddenTags).
    const countMap = new Map<string, number>();
    for (const feature of dataLoader.getAllFeatures()) {
      for (const tag of feature.tags ?? []) {
        countMap.set(tag, (countMap.get(tag) ?? 0) + 1);
      }
      for (const tag of (feature as { forbiddenTags?: string[] }).forbiddenTags ?? []) {
        countMap.set(tag, (countMap.get(tag) ?? 0) + 1);
      }
    }

    // Step 2: group by prefix.
    const groupMap = new Map<string, TagEntry[]>();
    for (const [tag, count] of countMap) {
      const underscoreIndex = tag.indexOf('_');
      const prefix = underscoreIndex === -1 ? '(other)' : tag.slice(0, underscoreIndex);
      if (!groupMap.has(prefix)) groupMap.set(prefix, []);
      groupMap.get(prefix)!.push({ tag, count });
    }

    // Step 3: sort entries within each group alphabetically.
    for (const entries of groupMap.values()) {
      entries.sort((a, b) => a.tag.localeCompare(b.tag));
    }

    // Step 4: sort groups alphabetically (put "(other)" last).
    return Array.from(groupMap.entries())
      .sort(([a], [b]) => {
        if (a === '(other)') return 1;
        if (b === '(other)') return -1;
        return a.localeCompare(b);
      })
      .map(([prefix, entries]) => ({ prefix, entries }));
  });

  // ===========================================================================
  // SEARCH
  // ===========================================================================

  let searchQuery = $state('');
  const searchLower = $derived(searchQuery.toLowerCase().trim());

  /** Whether a tag entry matches the current search query. */
  function matchesSearch(entry: TagEntry): boolean {
    if (!searchLower) return true;
    return entry.tag.toLowerCase().includes(searchLower);
  }

  /** Whether a group has at least one matching entry. */
  function groupHasMatch(group: TagGroup): boolean {
    if (!searchLower) return true;
    return group.entries.some(matchesSearch);
  }

  // ===========================================================================
  // SELECTION STATE
  // ===========================================================================

  /**
   * The working set of selected tags.
   * Read `initialSelected` once at mount via `untrack`.
   */
  let selectedTags = $state<Set<string>>(
    untrack(() => new Set<string>(initialSelected))
  );

  function toggleTag(tag: string): void {
    const next = new Set(selectedTags);
    if (next.has(tag)) {
      next.delete(tag);
    } else {
      next.add(tag);
    }
    selectedTags = next;
  }

  function confirmSelection(): void {
    onTagsPicked(Array.from(selectedTags).sort());
  }

  // ===========================================================================
  // CUSTOM TAG INPUT
  // ===========================================================================

  let customTag = $state('');

  /**
   * True when `customTag` is a valid, addable tag:
   *   - Non-empty after trim.
   *   - No whitespace (convention: snake_case).
   *   - Not already in the selection.
   */
  const customTagIsValid = $derived(
    customTag.trim().length > 0 &&
    !/\s/.test(customTag.trim())   &&
    !selectedTags.has(customTag.trim())
  );

  function addCustomTag(): void {
    const trimmed = customTag.trim();
    if (!trimmed || /\s/.test(trimmed)) return;
    const next = new Set(selectedTags);
    next.add(trimmed);
    selectedTags = next;
    customTag = '';
  }

  // Convenience: total number of tags in pool
  const totalTagCount = $derived(
    tagGroups.reduce((sum, g) => sum + g.entries.length, 0)
  );
</script>

<Modal
  open={true}
  onClose={onclose}
  title="Pick Tags"
  size="lg"
  fullscreen={true}
>
  {#snippet children()}
    <div class="flex flex-col gap-4">

      <!-- ================================================================ -->
      <!-- SEARCH BAR                                                        -->
      <!-- ================================================================ -->
      <div class="relative">
        <label for="tag-search" class="sr-only">Search tags</label>
        <input
          id="tag-search"
          type="search"
          class="input w-full pl-9"
          placeholder="Search tags…"
          bind:value={searchQuery}
          autocomplete="off"
          spellcheck="false"
        />
        <svg
          class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted"
          xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
      </div>

      <!-- Summary line -->
      <p class="text-xs text-text-muted -mt-2" aria-live="polite">
        {#if totalTagCount === 0}
          No tags loaded — enable a rule source in Campaign Settings.
        {:else}
          {totalTagCount} tag{totalTagCount === 1 ? '' : 's'} in pool
          {#if selectedTags.size > 0}
            — <span class="text-accent font-medium">{selectedTags.size} selected</span>
          {/if}
        {/if}
      </p>

      <!-- ================================================================ -->
      <!-- TAG GROUPS                                                        -->
      <!-- ================================================================ -->

      {#if totalTagCount === 0}
        <p class="py-4 text-center text-sm text-text-muted italic">
          The tag pool is empty. Load rule sources to populate it.
        </p>

      {:else}
        <div class="flex flex-col gap-2">
          {#each tagGroups as group (group.prefix)}
            {#if groupHasMatch(group)}
              <details
                class="group/details border border-border rounded-lg overflow-hidden"
                open={!!searchLower || group.entries.some(e => selectedTags.has(e.tag))}
              >
                <summary
                  class="flex items-center justify-between px-3 py-2 cursor-pointer
                         bg-surface-alt text-xs font-semibold text-text-primary
                         hover:bg-accent/10 select-none list-none"
                >
                  <span class="flex items-center gap-2">
                    <!-- prefix label -->
                    <code class="font-mono">{group.prefix}_*</code>
                    <!-- group count badge -->
                    <span class="text-[10px] font-normal text-text-muted">
                      {group.entries.filter(matchesSearch).length} tag{group.entries.filter(matchesSearch).length === 1 ? '' : 's'}
                    </span>
                    <!-- selected-in-group indicator -->
                    {#if group.entries.some(e => selectedTags.has(e.tag))}
                      <span class="inline-block w-1.5 h-1.5 rounded-full bg-accent"
                            title="Some tags from this group are selected"
                            aria-hidden="true">
                      </span>
                    {/if}
                  </span>
                  <!-- Chevron -->
                  <svg
                    class="h-4 w-4 text-text-muted transition-transform group-open/details:rotate-180"
                    xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" stroke-width="2"
                    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
                  >
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </summary>

                <!-- Tag chip grid inside the group -->
                <div class="p-3 flex flex-wrap gap-2">
                  {#each group.entries.filter(matchesSearch) as entry (entry.tag)}
                    {@const isSelected = selectedTags.has(entry.tag)}
                    <button
                      type="button"
                      class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full
                             text-xs font-mono border transition-colors
                             {isSelected
                               ? 'bg-accent/20 border-accent text-text-primary font-semibold'
                               : 'bg-surface border-border text-text-muted hover:border-accent/50 hover:text-text-primary'}"
                      onclick={() => toggleTag(entry.tag)}
                      aria-pressed={isSelected}
                      title="{entry.count} feature{entry.count === 1 ? '' : 's'} use this tag"
                    >
                      <!-- Selected checkmark -->
                      {#if isSelected}
                        <svg class="h-3 w-3 text-accent shrink-0" xmlns="http://www.w3.org/2000/svg"
                             viewBox="0 0 24 24" fill="none" stroke="currentColor"
                             stroke-width="3" stroke-linecap="round" stroke-linejoin="round"
                             aria-hidden="true">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      {/if}

                      {entry.tag}

                      <!-- Usage count badge -->
                      <span class="text-[9px] text-text-muted bg-surface-alt border border-border
                                   rounded-full px-1.5 py-0.5 tabular-nums">
                        {entry.count}
                      </span>
                    </button>
                  {/each}
                </div>
              </details>
            {/if}
          {/each}
        </div>
      {/if}

      <!-- ================================================================ -->
      <!-- CUSTOM TAG INPUT                                                  -->
      <!-- ================================================================ -->
      <div class="border border-border rounded-lg p-4 bg-surface-alt space-y-3">
        <p class="text-sm font-semibold text-text-primary">Add a custom tag</p>
        <p class="text-xs text-text-muted">
          Type a new tag not yet in the pool. Use <code class="font-mono">snake_case</code>
          (no spaces). Example: <code class="font-mono">weapon_exotic</code>.
        </p>

        <div class="flex gap-2">
          <label for="custom-tag" class="sr-only">Custom tag</label>
          <input
            id="custom-tag"
            type="text"
            class="input flex-1 font-mono text-sm"
            placeholder="e.g. weapon_exotic"
            bind:value={customTag}
            autocomplete="off"
            spellcheck="false"
            onkeydown={(e) => { if (e.key === 'Enter' && customTagIsValid) addCustomTag(); }}
          />
          <button
            type="button"
            class="btn-primary"
            disabled={!customTagIsValid}
            onclick={addCustomTag}
          >
            + Add
          </button>
        </div>

        {#if customTag.trim() && /\s/.test(customTag.trim())}
          <p class="text-xs text-danger" role="alert">
            Tags cannot contain spaces — use <code class="font-mono">snake_case</code> instead.
          </p>
        {:else if customTag.trim() && selectedTags.has(customTag.trim())}
          <p class="text-xs text-text-muted" role="alert">
            This tag is already selected.
          </p>
        {/if}
      </div>

      <!-- ================================================================ -->
      <!-- SELECTED TAGS PREVIEW                                             -->
      <!-- ================================================================ -->
      {#if selectedTags.size > 0}
        <div class="border border-accent/30 rounded-lg p-3 bg-accent/5 space-y-2">
          <p class="text-xs font-semibold text-text-primary">
            Selected tags ({selectedTags.size})
          </p>
          <div class="flex flex-wrap gap-1.5">
            {#each Array.from(selectedTags).sort() as tag (tag)}
              <span
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/15
                       border border-accent/40 text-xs font-mono text-text-primary"
              >
                {tag}
                <button
                  type="button"
                  class="text-text-muted hover:text-danger transition-colors leading-none"
                  onclick={() => toggleTag(tag)}
                  aria-label="Remove tag {tag}"
                >
                  ×
                </button>
              </span>
            {/each}
          </div>
        </div>
      {/if}

      <!-- ================================================================ -->
      <!-- FOOTER                                                            -->
      <!-- ================================================================ -->
      <div class="flex items-center justify-between gap-3 pt-2 border-t border-border">
        <p class="text-sm text-text-muted">
          {selectedTags.size === 0
            ? 'No tags selected'
            : `${selectedTags.size} tag${selectedTags.size === 1 ? '' : 's'} selected`}
        </p>
        <div class="flex gap-2">
          <button type="button" class="btn-ghost" onclick={onclose}>
            Cancel
          </button>
          <button
            type="button"
            class="btn-primary"
            onclick={confirmSelection}
          >
            Confirm{selectedTags.size > 0 ? ` (${selectedTags.size})` : ''}
          </button>
        </div>
      </div>

    </div>
  {/snippet}
</Modal>
