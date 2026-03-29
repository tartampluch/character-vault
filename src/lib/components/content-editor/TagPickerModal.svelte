<!--
  @file src/lib/components/content-editor/TagPickerModal.svelte
  @description Modal for picking one or more tag strings from the full tag pool.
-->

<script lang="ts">
  import { untrack } from 'svelte';
  import Modal from '$lib/components/ui/Modal.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui, uiN } from '$lib/i18n/ui-strings';
  import { IconClose } from '$lib/components/ui/icons';

  interface Props {
    onTagsPicked: (tags: string[]) => void;
    onclose: () => void;
    initialSelected?: string[];
  }

  let { onTagsPicked, onclose, initialSelected = [] }: Props = $props();
  const lang = $derived(engine.settings.language);

  interface TagEntry {
    tag:   string;
    count: number;
  }

  interface TagGroup {
    prefix:  string;
    entries: TagEntry[];
  }

  const tagGroups = $derived.by((): TagGroup[] => {
    const countMap = new Map<string, number>();
    for (const feature of dataLoader.getAllFeatures()) {
      for (const tag of feature.tags ?? []) {
        countMap.set(tag, (countMap.get(tag) ?? 0) + 1);
      }
      for (const tag of (feature as { forbiddenTags?: string[] }).forbiddenTags ?? []) {
        countMap.set(tag, (countMap.get(tag) ?? 0) + 1);
      }
    }

    const groupMap = new Map<string, TagEntry[]>();
    for (const [tag, count] of countMap) {
      const underscoreIndex = tag.indexOf('_');
      const prefix = underscoreIndex === -1 ? '(other)' : tag.slice(0, underscoreIndex);
      if (!groupMap.has(prefix)) groupMap.set(prefix, []);
      groupMap.get(prefix)!.push({ tag, count });
    }

    for (const entries of groupMap.values()) {
      entries.sort((a, b) => a.tag.localeCompare(b.tag));
    }

    return Array.from(groupMap.entries())
      .sort(([a], [b]) => {
        if (a === '(other)') return 1;
        if (b === '(other)') return -1;
        return a.localeCompare(b);
      })
      .map(([prefix, entries]) => ({ prefix, entries }));
  });

  let searchQuery = $state('');
  const searchLower = $derived(searchQuery.toLowerCase().trim());

  function matchesSearch(entry: TagEntry): boolean {
    if (!searchLower) return true;
    return entry.tag.toLowerCase().includes(searchLower);
  }

  function groupHasMatch(group: TagGroup): boolean {
    if (!searchLower) return true;
    return group.entries.some(matchesSearch);
  }

  let selectedTags = $state<Set<string>>(
    untrack(() => new Set<string>(initialSelected))
  );

  function toggleTag(tag: string): void {
    const next = new Set(selectedTags);
    if (next.has(tag)) { next.delete(tag); } else { next.add(tag); }
    selectedTags = next;
  }

  function confirmSelection(): void {
    onTagsPicked(Array.from(selectedTags).sort());
  }

  let customTag = $state('');

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

  const totalTagCount = $derived(
    tagGroups.reduce((sum, g) => sum + g.entries.length, 0)
  );
</script>

<Modal
  open={true}
  onClose={onclose}
  title={ui('editor.tag_picker.title', lang)}
  size="lg"
  fullscreen={true}
>
  {#snippet children()}
    <div class="flex flex-col gap-4">

      <!-- ================================================================ -->
      <!-- SEARCH BAR                                                        -->
      <!-- ================================================================ -->
      <div class="relative">
        <label for="tag-search" class="sr-only">{ui('editor.tag_picker.search_aria', lang)}</label>
        <input
          id="tag-search"
          type="search"
          class="input w-full pl-9"
          placeholder={ui('editor.tag_picker.search_placeholder', lang)}
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
          {ui('editor.tag_picker.no_tags_loaded', lang)}
        {:else}
          {ui('editor.tag_picker.tag_count', lang).replace('{n}', String(totalTagCount)).replace('{s}', totalTagCount === 1 ? '' : 's')}
          {#if selectedTags.size > 0}
            — <span class="text-accent font-medium">{ui('editor.tag_picker.selected_suffix', lang).replace('{n}', String(selectedTags.size))}</span>
          {/if}
        {/if}
      </p>

      <!-- ================================================================ -->
      <!-- TAG GROUPS                                                        -->
      <!-- ================================================================ -->

      {#if totalTagCount === 0}
        <p class="py-4 text-center text-sm text-text-muted italic">
          {ui('editor.tag_picker.empty_pool_msg', lang)}
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
                    <code class="font-mono">{group.prefix}_*</code>
                    <span class="text-[10px] font-normal text-text-muted">
                       {uiN('editor.tag_picker.group_tag_count', group.entries.filter(matchesSearch).length, lang)}
                     </span>
                    {#if group.entries.some(e => selectedTags.has(e.tag))}
                      <span class="inline-block w-1.5 h-1.5 rounded-full bg-accent"
                            title={ui('editor.tag_picker.some_selected_title', lang)}
                            aria-hidden="true">
                      </span>
                    {/if}
                  </span>
                  <svg
                    class="h-4 w-4 text-text-muted transition-transform group-open/details:rotate-180"
                    xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" stroke-width="2"
                    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
                  >
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </summary>

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
                      title={ui('editor.tag_picker.feature_uses_tag', lang).replace('{n}', String(entry.count)).replace('{s}', entry.count === 1 ? '' : 's').replace('{s2}', entry.count === 1 ? '' : 'nt')}
                    >
                      {#if isSelected}
                        <svg class="h-3 w-3 text-accent shrink-0" xmlns="http://www.w3.org/2000/svg"
                             viewBox="0 0 24 24" fill="none" stroke="currentColor"
                             stroke-width="3" stroke-linecap="round" stroke-linejoin="round"
                             aria-hidden="true">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      {/if}

                      {entry.tag}

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
        <p class="text-sm font-semibold text-text-primary">{ui('editor.tag_picker.custom_section_title', lang)}</p>
        <p class="text-xs text-text-muted">
          {ui('editor.tag_picker.custom_section_desc', lang)}
        </p>

        <div class="flex gap-2">
          <label for="custom-tag" class="sr-only">{ui('editor.tag_picker.custom_tag_aria', lang)}</label>
          <input
            id="custom-tag"
            type="text"
            class="input flex-1 font-mono text-sm"
            placeholder={ui('editor.tag_picker.new_tag_placeholder', lang)}
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
            {ui('common.add', lang)}
          </button>
        </div>

        {#if customTag.trim() && /\s/.test(customTag.trim())}
          <p class="text-xs text-danger" role="alert">
            {ui('editor.tag_picker.spaces_error', lang)}
          </p>
        {:else if customTag.trim() && selectedTags.has(customTag.trim())}
          <p class="text-xs text-text-muted" role="alert">
            {ui('editor.tag_picker.already_selected', lang)}
          </p>
        {/if}
      </div>

      <!-- ================================================================ -->
      <!-- SELECTED TAGS PREVIEW                                             -->
      <!-- ================================================================ -->
      {#if selectedTags.size > 0}
        <div class="border border-accent/30 rounded-lg p-3 bg-accent/5 space-y-2">
          <p class="text-xs font-semibold text-text-primary">
            {ui('editor.tag_picker.selected_preview_title', lang).replace('{n}', String(selectedTags.size))}
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
                  aria-label={ui('editor.tag_picker.remove_tag_aria', lang).replace('{tag}', tag)}
                >
                  <IconClose size={12} aria-hidden="true" />
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
            ? ui('editor.tag_picker.no_selected_footer', lang)
            : ui('editor.tag_picker.selected_footer', lang).replace('{n}', String(selectedTags.size)).replace('{s}', selectedTags.size === 1 ? '' : 's')}
        </p>
        <div class="flex gap-2">
          <button type="button" class="btn-ghost" onclick={onclose}>
            {ui('common.cancel', lang)}
          </button>
          <button
            type="button"
            class="btn-primary"
            onclick={confirmSelection}
          >
            {selectedTags.size > 0
              ? ui('editor.tag_picker.confirm_with_count', lang).replace('{n}', String(selectedTags.size))
              : ui('editor.tag_picker.confirm_btn', lang)}
          </button>
        </div>
      </div>

    </div>
  {/snippet}
</Modal>
