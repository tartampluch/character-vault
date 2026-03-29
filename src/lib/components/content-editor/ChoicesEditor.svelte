<!--
  @file src/lib/components/content-editor/ChoicesEditor.svelte
  @description Editor for Feature.choices — the list of player-facing selection
  prompts that let players choose a weapon type, domain, skill focus, etc.
-->

<script lang="ts">
  import { getContext } from 'svelte';
  import { EDITOR_CONTEXT_KEY, type EditorContext } from './editorContext';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import LocalizedStringEditor from './LocalizedStringEditor.svelte';
  import type { FeatureChoice } from '$lib/types/feature';
  import type { ID } from '$lib/types/primitives';
  import { IconWarning, IconSuccess } from '$lib/components/ui/icons';

  const ctx = getContext<EditorContext>(EDITOR_CONTEXT_KEY);
  const lang = $derived(engine.settings.language);

  function makeBlankChoice(): FeatureChoice {
    return {
      choiceId:       '',
      label:          { en: '' },
      optionsQuery:   '',
      maxSelections:  1,
    };
  }

  function addChoice(): void {
    ctx.feature.choices = [...(ctx.feature.choices ?? []), makeBlankChoice()];
  }

  function deleteChoice(index: number): void {
    ctx.feature.choices = (ctx.feature.choices ?? []).filter((_, i) => i !== index);
  }

  function patchChoice(index: number, patch: Partial<FeatureChoice>): void {
    const arr = [...(ctx.feature.choices ?? [])];
    arr[index] = { ...arr[index], ...patch };
    ctx.feature.choices = arr;
  }

  let queryResults = $state<Map<number, { count: number; sample: string[] }>>(new Map());

  function runQuery(query: string): { count: number; sample: string[] } {
    const q = query.trim();
    if (!q) return { count: 0, sample: [] };

    const parts = q.split('+').map(p => p.trim()).filter(Boolean);

    const matches = dataLoader.getAllFeatures().filter(f => {
      return parts.every(part => {
        if (part.startsWith('tag:')) {
          const tag = part.slice(4).trim();
          return (f.tags ?? []).includes(tag);
        }
        if (part.startsWith('category:')) {
          const cat = part.slice(9).trim();
          return f.category === cat;
        }
        return false;
      });
    });

    const sample = matches
      .slice(0, 5)
      .map(f => {
        const lbl = f.label as Record<string, string>;
        return lbl?.['en'] ?? f.id;
      });

    return { count: matches.length, sample };
  }

  function testQuery(index: number): void {
    const choice = (ctx.feature.choices ?? [])[index];
    if (!choice) return;
    const result = runQuery(choice.optionsQuery ?? '');
    const next = new Map(queryResults);
    next.set(index, result);
    queryResults = next;
  }

  function onQueryInput(index: number, value: string): void {
    patchChoice(index, { optionsQuery: value });
    const next = new Map(queryResults);
    next.delete(index);
    queryResults = next;
  }
</script>

<!-- ======================================================================== -->
<!-- MAIN RENDER                                                                -->
<!-- ======================================================================== -->
<div class="flex flex-col gap-3">

  <!-- Header -->
  <div class="flex items-center justify-between">
    <div class="flex flex-col gap-0.5">
      <span class="text-sm font-semibold text-text-primary">
        {ui('editor.choices.section_title', lang)}
        {#if (ctx.feature.choices ?? []).length > 0}
          <span class="ml-1.5 text-xs font-normal text-text-muted badge">
            {ctx.feature.choices?.length}
          </span>
        {/if}
      </span>
      <span class="text-[11px] text-text-muted">
        {ui('editor.choices.section_hint', lang)}
      </span>
    </div>
    <button
      type="button"
      class="btn-primary text-xs py-1 px-3 h-auto shrink-0"
      onclick={addChoice}
    >
      {ui('editor.choices.add_choice_btn', lang)}
    </button>
  </div>

  <!-- Empty state -->
  {#if (ctx.feature.choices ?? []).length === 0}
    <div class="rounded border border-dashed border-border px-4 py-6 text-center">
      <p class="text-xs text-text-muted italic">{ui('editor.choices.no_choices', lang)}</p>
      <p class="text-xs text-text-muted mt-1">
        {ui('editor.choices.no_choices_hint', lang)}
      </p>
    </div>

  {:else}
    <!-- Choice entries -->
    {#each (ctx.feature.choices ?? []) as choice, i (i)}
      {@const qResult = queryResults.get(i)}
      <div class="flex flex-col gap-3 rounded-lg border border-border bg-surface-alt p-4">

        <!-- Entry header: index + delete -->
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold text-text-muted uppercase tracking-wider">
            {ui('editor.choices.entry_label', lang).replace('{n}', String(i + 1))}
          </span>
          <button
            type="button"
            class="btn-ghost btn-icon h-7 w-7 p-0 text-text-muted hover:text-danger"
            onclick={() => deleteChoice(i)}
            title={ui('editor.choices.delete_title', lang).replace('{n}', String(i + 1))}
            aria-label={ui('editor.choices.delete_aria', lang).replace('{n}', String(i + 1))}
          >
            <svg class="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
                 fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14H6L5 6"/>
              <path d="M10 11v6M14 11v6"/>
              <path d="M9 6V4h6v2"/>
            </svg>
          </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">

          <!-- choiceId -->
          <div class="flex flex-col gap-1">
            <label
              for="choice-id-{i}"
              class="text-[10px] font-semibold uppercase tracking-wider text-text-muted"
            >
              {ui('editor.choices.choice_id_label', lang)}
            </label>
            <input
              id="choice-id-{i}"
              type="text"
              class="input font-mono text-xs"
              value={choice.choiceId}
              placeholder={ui('editor.choices.choice_id_placeholder', lang)}
              oninput={(e) => patchChoice(i, { choiceId: (e.currentTarget as HTMLInputElement).value as ID })}
              autocomplete="off"
              spellcheck="false"
            />
            <p class="text-[10px] text-text-muted">
              {ui('editor.choices.choice_id_ref', lang).replace('{id}', choice.choiceId || 'choiceId')}
            </p>
          </div>

          <!-- maxSelections -->
          <div class="flex flex-col gap-1">
            <label
              for="choice-max-{i}"
              class="text-[10px] font-semibold uppercase tracking-wider text-text-muted"
            >
              {ui('editor.choices.max_selections_label', lang)}
            </label>
            <input
              id="choice-max-{i}"
              type="number"
              class="input text-xs w-24"
              min="1"
              max="99"
              value={choice.maxSelections}
              oninput={(e) => patchChoice(i, {
                maxSelections: Math.max(1, parseInt((e.currentTarget as HTMLInputElement).value) || 1)
              })}
            />
            <p class="text-[10px] text-text-muted">
              {ui('editor.choices.max_selections_hint', lang)}
            </p>
          </div>

          <!-- Choice label — multi-language editor (spans both columns) -->
          <div class="flex flex-col gap-1 md:col-span-2">
            <span class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              {ui('editor.choices.label_legend', lang)}
            </span>
            <LocalizedStringEditor
              value={(choice.label as Record<string, string>) ?? { en: '' }}
              onchange={(v) => patchChoice(i, { label: v })}
              mode="input"
              uid="choice-lbl-{i}"
              fieldName="choice-label"
              {lang}
              placeholder={ui('editor.choices.label_en_placeholder', lang)}
              extraPlaceholder={ui('editor.lang.translation_placeholder', lang)}
            />
          </div>

          <!-- optionsQuery + Test Query -->
          <div class="flex flex-col gap-1 md:col-span-2">
            <label
              for="choice-query-{i}"
              class="text-[10px] font-semibold uppercase tracking-wider text-text-muted"
            >
              {ui('editor.choices.options_query_label', lang)}
            </label>

            <div class="flex gap-2">
              <input
                id="choice-query-{i}"
                type="text"
                class="input font-mono text-xs flex-1"
                value={choice.optionsQuery}
                placeholder={ui('editor.choices.query_filter_placeholder', lang)}
                oninput={(e) => onQueryInput(i, (e.currentTarget as HTMLInputElement).value)}
                autocomplete="off"
                spellcheck="false"
              />
              <button
                type="button"
                class="btn-ghost text-xs py-1 px-3 h-auto shrink-0"
                onclick={() => testQuery(i)}
                disabled={!choice.optionsQuery?.trim()}
                title={ui('editor.choices.test_query_title', lang)}
              >
                {ui('editor.choices.test_query_btn', lang)}
              </button>
            </div>

            <!-- Query syntax reference -->
            <div class="text-[10px] text-text-muted flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
              <span><code class="font-mono">tag:&lt;tag&gt;</code> — {ui('editor.choices.syntax_tag_hint', lang)}</span>
              <span><code class="font-mono">category:&lt;cat&gt;</code> — {ui('editor.choices.syntax_category_hint', lang)}</span>
              <span><code class="font-mono">tag:t1+tag:t2</code> — {ui('editor.choices.syntax_intersection_hint', lang)}</span>
            </div>

            <!-- Live test result -->
            {#if qResult !== undefined}
              <div
                class="flex flex-col gap-1 rounded border px-3 py-2 text-xs
                       {qResult.count > 0 ? 'border-green-700/40 bg-green-900/10 text-green-400' : 'border-border text-text-muted'}"
                role="status"
                aria-live="polite"
              >
                {#if qResult.count === 0}
                  <span class="flex items-center gap-1 font-semibold text-amber-400">
                    <IconWarning size={14} aria-hidden="true" />
                    {ui('editor.choices.zero_matches_label', lang)}
                  </span>
                  <span class="text-amber-400/80">
                    {ui('editor.choices.zero_matches_desc', lang)}
                  </span>
                {:else}
                  <span class="flex items-center gap-1 font-semibold">
                    <IconSuccess size={14} aria-hidden="true" />
                    {ui('editor.choices.matches_label', lang).replace('{n}', String(qResult.count)).replace('{s}', qResult.count === 1 ? '' : 's')}
                  </span>
                  {#if qResult.sample.length > 0}
                    <span class="text-text-muted">
                      {ui('editor.choices.sample_label', lang)}{qResult.sample.join(', ')}{qResult.count > qResult.sample.length ? `, ${ui('editor.choices.sample_more', lang).replace('{n}', String(qResult.count - qResult.sample.length))}` : ''}
                    </span>
                  {/if}
                {/if}
              </div>
            {/if}
          </div>

          <!-- choiceGrantedTagPrefix -->
          <div class="flex flex-col gap-1 md:col-span-2">
            <label
              for="choice-prefix-{i}"
              class="text-[10px] font-semibold uppercase tracking-wider text-text-muted"
            >
              {ui('editor.choices.prefix_label', lang)}
              <span class="ml-1 text-[9px] font-normal normal-case">{ui('editor.choices.prefix_optional', lang)}</span>
            </label>
            <input
              id="choice-prefix-{i}"
              type="text"
              class="input font-mono text-xs"
              value={choice.choiceGrantedTagPrefix ?? ''}
              placeholder={ui('editor.choices.prefix_placeholder', lang)}
              oninput={(e) => {
                const v = (e.currentTarget as HTMLInputElement).value;
                patchChoice(i, { choiceGrantedTagPrefix: v || undefined });
              }}
              autocomplete="off"
              spellcheck="false"
            />
            <div class="text-[10px] text-text-muted space-y-0.5">
              <p>
                {ui('editor.choices.prefix_engine_hint', lang)}
              </p>
              {#if choice.choiceGrantedTagPrefix}
                <p class="text-accent/80">
                  {ui('editor.choices.prefix_example_selects', lang)} <code class="font-mono">item_longbow</code>
                  {ui('editor.choices.prefix_example_tag', lang)} <code class="font-mono">{choice.choiceGrantedTagPrefix}item_longbow</code>
                </p>
              {:else}
                <p>
                  {ui('editor.choices.prefix_convention_hint', lang)}
                </p>
              {/if}
            </div>
          </div>

        </div>
      </div>
    {/each}

    <!-- Bottom add button when list is non-empty -->
    <button type="button" class="btn-ghost text-sm w-full py-2" onclick={addChoice}>
      {ui('editor.choices.add_choice_btn', lang)}
    </button>
  {/if}

</div>
