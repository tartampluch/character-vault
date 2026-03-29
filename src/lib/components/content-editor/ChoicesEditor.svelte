<!--
  @file src/lib/components/content-editor/ChoicesEditor.svelte
  @description Editor for Feature.choices — the list of player-facing selection
  prompts that let players choose a weapon type, domain, skill focus, etc.

  ────────────────────────────────────────────────────────────────────────────
  PURPOSE
  ────────────────────────────────────────────────────────────────────────────
  D&D 3.5 feats and class features often require a one-time player choice:
    • Weapon Focus — pick a weapon type
    • Cleric — pick two domains
    • Knowledge — pick a subcategory
    • Greater Weapon Focus — pick the same weapon chosen for Weapon Focus

  Each `FeatureChoice` defines one such prompt. The player's answer is stored
  in `ActiveFeatureInstance.selections[choiceId]` and is referenced in
  conditional logic via `@selection.<choiceId>`.

  ────────────────────────────────────────────────────────────────────────────
  FIELDS PER ENTRY
  ────────────────────────────────────────────────────────────────────────────
  choiceId            — slug identifier; referenced by @selection.<choiceId>
  label (EN / FR)     — prompt shown above the selector
  optionsQuery        — query syntax for populating the dropdown (see below)
  maxSelections       — how many items the player can pick (usually 1)
  choiceGrantedTagPrefix — optional tag prefix for derived sub-tags (see below)

  ────────────────────────────────────────────────────────────────────────────
  OPTIONSQUERY SYNTAX
  ────────────────────────────────────────────────────────────────────────────
  Three supported formats (per ARCHITECTURE.md §5.3):

    tag:<tag>                   All features with this tag.
                                Example:  tag:weapon
                                Example:  tag:domain

    category:<category>         All features of a given FeatureCategory.
                                Example:  category:feat
                                Example:  category:domain

    tag:<t1>+tag:<t2>           Intersection — must have ALL listed tags.
                                Example:  tag:weapon+tag:martial
                                Example:  tag:arcane_school

  The "Test Query" button runs the query against the live DataLoader cache and
  displays the number of matching features.  This lets GMs verify that the
  query returns a sensible set before saving.

  ────────────────────────────────────────────────────────────────────────────
  CHOICEGRANTEDTAGPREFIX
  ────────────────────────────────────────────────────────────────────────────
  When set, the GameEngine emits a sub-tag for each selected item at Phase 0:
    `<choiceGrantedTagPrefix><selectedId>`

  Example — Weapon Focus picks `item_longbow`:
    prefix  = "feat_weapon_focus_"
    tag     = "feat_weapon_focus_item_longbow"

  This enables specific prerequisites like "requires Weapon Focus (longbow)"
  expressed as `has_tag: "feat_weapon_focus_item_longbow"`.  Without the prefix
  there is no way to distinguish "Weapon Focus (any)" from "Weapon Focus (X)".

  ────────────────────────────────────────────────────────────────────────────
  @see src/lib/types/feature.ts    for FeatureChoice interface
  @see editorContext.ts            for EditorContext
  @see ARCHITECTURE.md §5.3        for full FeatureChoice specification
-->

<script lang="ts">
  import { getContext } from 'svelte';
  import { EDITOR_CONTEXT_KEY, type EditorContext } from './editorContext';
  import { dataLoader } from '$lib/engine/DataLoader';
  import type { FeatureChoice } from '$lib/types/feature';
  import type { ID } from '$lib/types/primitives';
  import { IconWarning, IconSuccess } from '$lib/components/ui/icons';

  // ===========================================================================
  // CONTEXT
  // ===========================================================================

  const ctx = getContext<EditorContext>(EDITOR_CONTEXT_KEY);

  // ===========================================================================
  // FACTORY
  // ===========================================================================

  function makeBlankChoice(): FeatureChoice {
    return {
      choiceId:       '',
      label:          { en: '' },
      optionsQuery:   '',
      maxSelections:  1,
    };
  }

  // ===========================================================================
  // MUTATIONS (immutable array updates)
  // ===========================================================================

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

  function setChoiceLabel(index: number, lang: string, value: string): void {
    const choice = (ctx.feature.choices ?? [])[index];
    if (!choice) return;
    patchChoice(index, {
      label: { ...(choice.label as Record<string, string>), [lang]: value },
    });
  }

  // ===========================================================================
  // optionsQuery — LIVE TEST
  // ===========================================================================

  /**
   * Map from entry index → test result.
   * Null means "not tested yet"; populated when the GM clicks "Test Query".
   */
  let queryResults = $state<Map<number, { count: number; sample: string[] }>>(new Map());

  /**
   * Runs a FeatureChoice optionsQuery against the live DataLoader cache.
   *
   * Supported operators:
   *   tag:<tag>          — feature.tags includes <tag>
   *   category:<cat>     — feature.category === <cat>
   *   tag:<t1>+tag:<t2>  — all parts must match (AND semantics)
   *
   * Returns { count, sample } where `sample` contains up to 5 matching labels.
   */
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
        // Unknown operator — no match
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

  // Clear cached result when optionsQuery changes
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
        Player Choices
        {#if (ctx.feature.choices ?? []).length > 0}
          <span class="ml-1.5 text-xs font-normal text-text-muted badge">
            {ctx.feature.choices?.length}
          </span>
        {/if}
      </span>
      <span class="text-[11px] text-text-muted">
        Prompts shown to the player when they add this entity to their character.
        Selections are stored in <code class="font-mono">ActiveFeatureInstance.selections</code>
        and referenced via <code class="font-mono">@selection.&lt;choiceId&gt;</code>.
      </span>
    </div>
    <button
      type="button"
      class="btn-primary text-xs py-1 px-3 h-auto shrink-0"
      onclick={addChoice}
    >
      + Add Choice
    </button>
  </div>

  <!-- Empty state -->
  {#if (ctx.feature.choices ?? []).length === 0}
    <div class="rounded border border-dashed border-border px-4 py-6 text-center">
      <p class="text-xs text-text-muted italic">No choices defined.</p>
      <p class="text-xs text-text-muted mt-1">
        Add a choice for feats like Weapon Focus (weapon type) or Cleric domains.
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
            Choice #{i + 1}
          </span>
          <button
            type="button"
            class="btn-ghost btn-icon h-7 w-7 p-0 text-text-muted hover:text-danger"
            onclick={() => deleteChoice(i)}
            title="Delete choice #{i + 1}"
            aria-label="Delete choice {i + 1}"
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
              Choice ID
            </label>
            <input
              id="choice-id-{i}"
              type="text"
              class="input font-mono text-xs"
              value={choice.choiceId}
              placeholder="e.g. weapon_choice, domain_1"
              oninput={(e) => patchChoice(i, { choiceId: (e.currentTarget as HTMLInputElement).value as ID })}
              autocomplete="off"
              spellcheck="false"
            />
            <p class="text-[10px] text-text-muted">
              Referenced as <code class="font-mono">@selection.{choice.choiceId || 'choiceId'}</code>
              in modifier conditions.
            </p>
          </div>

          <!-- maxSelections -->
          <div class="flex flex-col gap-1">
            <label
              for="choice-max-{i}"
              class="text-[10px] font-semibold uppercase tracking-wider text-text-muted"
            >
              Max Selections
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
              Usually 1. Use 2+ for "choose N domains", "choose N feats", etc.
            </p>
          </div>

          <!-- Label EN -->
          <div class="flex flex-col gap-1">
            <label
              for="choice-lbl-en-{i}"
              class="text-[10px] font-semibold uppercase tracking-wider text-text-muted"
            >
              Label (English)
            </label>
            <input
              id="choice-lbl-en-{i}"
              type="text"
              class="input text-sm"
              value={(choice.label as Record<string,string>)?.['en'] ?? ''}
              placeholder="e.g. Choose a weapon type"
              oninput={(e) => setChoiceLabel(i, 'en', (e.currentTarget as HTMLInputElement).value)}
            />
          </div>

          <!-- Label FR -->
          <div class="flex flex-col gap-1">
            <label
              for="choice-lbl-fr-{i}"
              class="text-[10px] font-semibold uppercase tracking-wider text-text-muted"
            >
              Label (Français)
            </label>
            <input
              id="choice-lbl-fr-{i}"
              type="text"
              class="input text-sm"
              value={(choice.label as Record<string,string>)?.['fr'] ?? ''}
              placeholder="ex. Choisissez un type d'arme"
              oninput={(e) => setChoiceLabel(i, 'fr', (e.currentTarget as HTMLInputElement).value)}
            />
          </div>

          <!-- optionsQuery + Test Query -->
          <div class="flex flex-col gap-1 md:col-span-2">
            <label
              for="choice-query-{i}"
              class="text-[10px] font-semibold uppercase tracking-wider text-text-muted"
            >
              Options Query
            </label>

            <div class="flex gap-2">
              <input
                id="choice-query-{i}"
                type="text"
                class="input font-mono text-xs flex-1"
                value={choice.optionsQuery}
                placeholder="e.g. tag:weapon  or  category:domain  or  tag:weapon+tag:martial"
                oninput={(e) => onQueryInput(i, (e.currentTarget as HTMLInputElement).value)}
                autocomplete="off"
                spellcheck="false"
              />
              <button
                type="button"
                class="btn-ghost text-xs py-1 px-3 h-auto shrink-0"
                onclick={() => testQuery(i)}
                disabled={!choice.optionsQuery?.trim()}
                title="Run this query against the current DataLoader cache"
              >
                Test Query
              </button>
            </div>

            <!-- Query syntax reference -->
            <div class="text-[10px] text-text-muted flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
              <span><code class="font-mono">tag:&lt;tag&gt;</code> — features with that tag</span>
              <span><code class="font-mono">category:&lt;cat&gt;</code> — features of that category</span>
              <span><code class="font-mono">tag:t1+tag:t2</code> — must match all parts (AND)</span>
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
                    0 matches
                  </span>
                  <span class="text-amber-400/80">
                    No features match this query in the current DataLoader cache.
                    Check that the rule sources containing the target features are enabled.
                  </span>
                {:else}
                  <span class="flex items-center gap-1 font-semibold">
                    <IconSuccess size={14} aria-hidden="true" />
                    {qResult.count} feature{qResult.count === 1 ? '' : 's'} match
                  </span>
                  {#if qResult.sample.length > 0}
                    <span class="text-text-muted">
                      Sample: {qResult.sample.join(', ')}{qResult.count > qResult.sample.length ? `, +${qResult.count - qResult.sample.length} more…` : ''}
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
              Choice Granted Tag Prefix
              <span class="ml-1 text-[9px] font-normal normal-case">(optional)</span>
            </label>
            <input
              id="choice-prefix-{i}"
              type="text"
              class="input font-mono text-xs"
              value={choice.choiceGrantedTagPrefix ?? ''}
              placeholder="e.g. feat_weapon_focus_"
              oninput={(e) => {
                const v = (e.currentTarget as HTMLInputElement).value;
                patchChoice(i, { choiceGrantedTagPrefix: v || undefined });
              }}
              autocomplete="off"
              spellcheck="false"
            />
            <div class="text-[10px] text-text-muted space-y-0.5">
              <p>
                When set, the engine emits
                <code class="font-mono">&lt;prefix&gt;&lt;selectedId&gt;</code>
                as an active tag for each selection.
              </p>
              {#if choice.choiceGrantedTagPrefix}
                <p class="text-accent/80">
                  Example: player selects <code class="font-mono">item_longbow</code>
                  → tag <code class="font-mono">{choice.choiceGrantedTagPrefix}item_longbow</code>
                </p>
              {:else}
                <p>
                  Needed for parameterized prerequisites (Weapon Focus (X), Spell Focus (school)).
                  Convention: end with <code class="font-mono">_</code>
                  and mirror this feat's ID, e.g. <code class="font-mono">feat_weapon_focus_</code>.
                </p>
              {/if}
            </div>
          </div>

        </div>
      </div>
    {/each}

    <!-- Bottom add button when list is non-empty -->
    <button type="button" class="btn-ghost text-sm w-full py-2" onclick={addChoice}>
      + Add Choice
    </button>
  {/if}

</div>
