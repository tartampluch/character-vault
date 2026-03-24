<!--
  @file src/lib/components/content-editor/ModifierListEditor.svelte
  @description CRUD editor for a Feature's grantedModifiers array.

  ────────────────────────────────────────────────────────────────────────────
  PURPOSE
  ────────────────────────────────────────────────────────────────────────────
  Used inside EntityForm to let GMs build and edit the `Modifier[]` array on a
  Feature.  Each row represents one Modifier and exposes all its fields:

    targetId         — opens PipelinePickerModal
    type             — opens ModifierTypePickerModal (with stacking badges)
    value            — FormulaBuilderInput (number | @-path | dice | arithmetic)
    conditionNode    — inline summary label; "Edit…" opens ConditionNodeBuilder
                       inside a Modal wrapper
    situationalContext — plain text input with tooltip
    drBypassTags     — TagPickerModal (visible only when type === "damage_reduction")
    sourceId         — auto-filled from parent feature id; editable override
    sourceName       — auto-filled from parent feature label.en; editable override

  ────────────────────────────────────────────────────────────────────────────
  CONTEXT USAGE
  ────────────────────────────────────────────────────────────────────────────
  Reads ctx.feature.grantedModifiers and ctx.feature.id/label from EditorContext.
  Mutations replace the entire array (Svelte $state immutable update pattern).

  ────────────────────────────────────────────────────────────────────────────
  ROW IDENTITY
  ────────────────────────────────────────────────────────────────────────────
  Each modifier is keyed by its `id` field (a random hex string generated at
  creation time).  The row key is used in {#each} to preserve DOM identity
  across reorders.  Duplicate creates a new id for the clone.

  ────────────────────────────────────────────────────────────────────────────
  CONDITION NODE MODAL
  ────────────────────────────────────────────────────────────────────────────
  The conditionNode is not inlined directly — embedding a full LogicNode tree
  inside each Modifier row would overwhelm the form.  Instead:
    • The row shows a one-line summary (or "No condition" if absent).
    • Clicking "Edit condition…" opens a Modal containing ConditionNodeBuilder.
    • The modal's onNodeChanged callback patches the modifier in place.
    • Closing without saving discards changes (the modal stores a working copy).

  ────────────────────────────────────────────────────────────────────────────
  @see editorContext.ts             for EditorContext
  @see PipelinePickerModal.svelte   for targetId selection
  @see ModifierTypePickerModal.svelte for type selection
  @see FormulaBuilderInput.svelte   for value field
  @see ConditionNodeBuilder.svelte  for conditionNode editing
  @see TagPickerModal.svelte        for drBypassTags
  @see ARCHITECTURE.md §4.5        for drBypassTags / DR stacking docs
  @see ARCHITECTURE.md §21.3.3     for full specification
-->

<script lang="ts">
  import { getContext } from 'svelte';
  import { EDITOR_CONTEXT_KEY, type EditorContext } from './editorContext';
  import type { Modifier } from '$lib/types/pipeline';
  import type { LogicNode } from '$lib/types/logic';
  import type { ModifierType } from '$lib/types/primitives';
  import Modal from '$lib/components/ui/Modal.svelte';
  import PipelinePickerModal     from './PipelinePickerModal.svelte';
  import ModifierTypePickerModal from './ModifierTypePickerModal.svelte';
  import FormulaBuilderInput     from './FormulaBuilderInput.svelte';
  import ConditionNodeBuilder    from './ConditionNodeBuilder.svelte';
  import TagPickerModal          from './TagPickerModal.svelte';

  // ===========================================================================
  // CONTEXT
  // ===========================================================================

  const ctx = getContext<EditorContext>(EDITOR_CONTEXT_KEY);

  // ===========================================================================
  // HELPERS — default source fields from parent feature
  // ===========================================================================

  function defaultSourceId(): string {
    return ctx.feature.id || 'feature_id';
  }

  function defaultSourceName(): string {
    const lbl = ctx.feature.label as Record<string, string>;
    return lbl?.['en'] || ctx.feature.id || 'Feature';
  }

  // ===========================================================================
  // MODIFIER FACTORY
  // ===========================================================================

  /**
   * Creates a fresh blank Modifier for "+ Add Modifier".
   * `id` is a random hex string — unique within this editing session.
   */
  function makeBlankModifier(): Modifier {
    return {
      id:         crypto.getRandomValues(new Uint8Array(4)).reduce((s, b) => s + b.toString(16).padStart(2, '0'), ''),
      sourceId:   defaultSourceId(),
      sourceName: { en: defaultSourceName() },
      targetId:   '',
      value:      0,
      type:       'untyped',
    };
  }

  // ===========================================================================
  // MODIFIER ARRAY MUTATIONS (immutable pattern)
  // ===========================================================================

  function addModifier(): void {
    ctx.feature.grantedModifiers = [...ctx.feature.grantedModifiers, makeBlankModifier()];
  }

  function duplicateModifier(index: number): void {
    const src = ctx.feature.grantedModifiers[index];
    const clone: Modifier = {
      ...structuredClone(src),
      id: crypto.getRandomValues(new Uint8Array(4)).reduce((s, b) => s + b.toString(16).padStart(2, '0'), ''),
    };
    const arr = [...ctx.feature.grantedModifiers];
    arr.splice(index + 1, 0, clone);
    ctx.feature.grantedModifiers = arr;
  }

  function deleteModifier(index: number): void {
    ctx.feature.grantedModifiers = ctx.feature.grantedModifiers.filter((_, i) => i !== index);
  }

  /**
   * Patches one or more fields on the modifier at `index`.
   * Creates a new array + new modifier object (Svelte $state immutable update).
   */
  function patchModifier(index: number, patch: Partial<Modifier>): void {
    const arr = [...ctx.feature.grantedModifiers];
    arr[index] = { ...arr[index], ...patch };
    ctx.feature.grantedModifiers = arr;
  }

  // ===========================================================================
  // PER-ROW MODAL STATE
  // ===========================================================================

  /**
   * Which modifier row (by index) has a modal open, and which modal it is.
   * Only one modal can be open at a time across all rows.
   */
  type ActiveModal =
    | { kind: 'pipeline';        index: number }
    | { kind: 'modtype';         index: number }
    | { kind: 'condition';       index: number }
    | { kind: 'tags_dr';         index: number };

  let activeModal = $state<ActiveModal | null>(null);

  function closeModal(): void { activeModal = null; }

  // ===========================================================================
  // CONDITION NODE MODAL — working copy
  // ===========================================================================

  /**
   * Working copy of the conditionNode being edited.  Loaded when the "Edit
   * condition…" modal opens; committed to the modifier array on "Apply".
   * Discarded if the user closes the modal without applying.
   */
  let conditionWorkingCopy = $state<LogicNode | undefined>(undefined);

  function openConditionModal(index: number): void {
    const mod = ctx.feature.grantedModifiers[index];
    conditionWorkingCopy = mod.conditionNode
      ? structuredClone(mod.conditionNode)
      : undefined;
    activeModal = { kind: 'condition', index };
  }

  function applyCondition(): void {
    if (activeModal?.kind !== 'condition') return;
    patchModifier(activeModal.index, { conditionNode: conditionWorkingCopy });
    closeModal();
  }

  // ===========================================================================
  // CONDITION NODE SUMMARY HELPER
  // ===========================================================================

  /**
   * Returns a short human-readable summary of a LogicNode for the row preview.
   * Keeps it to one line so it fits in the compact row layout.
   */
  function conditionSummary(node: LogicNode | undefined): string {
    if (!node) return '';
    if (node.logic === 'AND') return `AND (${node.nodes.length} conditions)`;
    if (node.logic === 'OR')  return `OR (${node.nodes.length} conditions)`;
    if (node.logic === 'NOT') return 'NOT (…)';
    // CONDITION leaf
    return `${node.targetPath} ${node.operator} ${JSON.stringify(node.value)}`;
  }

  // ===========================================================================
  // STACKING BADGE (type column visual hint)
  // ===========================================================================

  const ALWAYS_STACKS: ModifierType[] = ['base', 'untyped', 'dodge', 'circumstance', 'synergy', 'multiplier'];
  const SPECIAL_TYPES: ModifierType[] = ['setAbsolute', 'damage_reduction', 'max_dex_cap'];

  function typeBadgeClass(type: ModifierType): string {
    if (ALWAYS_STACKS.includes(type))
      return 'bg-green-900/30 text-green-400 border-green-700/40';
    if (SPECIAL_TYPES.includes(type))
      return 'bg-purple-900/30 text-purple-300 border-purple-700/40';
    return 'bg-yellow-900/30 text-yellow-300 border-yellow-700/40';
  }
</script>

<!-- ============================================================ -->
<!-- PIPELINE PICKER MODAL                                         -->
<!-- ============================================================ -->
{#if activeModal?.kind === 'pipeline'}
  {@const idx = activeModal.index}
  <PipelinePickerModal
    onPipelinePicked={(id) => { patchModifier(idx, { targetId: id }); closeModal(); }}
    onclose={closeModal}
  />
{/if}

<!-- ============================================================ -->
<!-- MODIFIER TYPE PICKER MODAL                                    -->
<!-- ============================================================ -->
{#if activeModal?.kind === 'modtype'}
  {@const idx = activeModal.index}
  <ModifierTypePickerModal
    onModifierTypePicked={(t) => { patchModifier(idx, { type: t }); closeModal(); }}
    onclose={closeModal}
  />
{/if}

<!-- ============================================================ -->
<!-- DR BYPASS TAGS PICKER MODAL                                   -->
<!-- ============================================================ -->
{#if activeModal?.kind === 'tags_dr'}
  {@const idx = activeModal.index}
  <TagPickerModal
    initialSelected={ctx.feature.grantedModifiers[idx]?.drBypassTags ?? []}
    onTagsPicked={(tags) => { patchModifier(idx, { drBypassTags: tags }); closeModal(); }}
    onclose={closeModal}
  />
{/if}

<!-- ============================================================ -->
<!-- CONDITION NODE MODAL                                          -->
<!-- ============================================================ -->
{#if activeModal?.kind === 'condition'}
  <Modal
    open={true}
    onClose={closeModal}
    title="Edit Condition"
    size="xl"
    fullscreen={true}
  >
    {#snippet children()}
      <div class="flex flex-col gap-4">
        <p class="text-xs text-text-muted">
          This condition is evaluated at <strong>sheet time</strong>. If it
          evaluates to <em>false</em>, this specific modifier is completely
          ignored (it does not contribute to the pipeline total).
        </p>

        <ConditionNodeBuilder
          node={conditionWorkingCopy}
          onNodeChanged={(n) => { conditionWorkingCopy = n; }}
        />

        <div class="flex justify-end gap-2 pt-3 border-t border-border">
          <button type="button" class="btn-ghost" onclick={closeModal}>
            Cancel
          </button>
          <button type="button" class="btn-primary" onclick={applyCondition}>
            Apply Condition
          </button>
        </div>
      </div>
    {/snippet}
  </Modal>
{/if}

<!-- ============================================================ -->
<!-- MODIFIER LIST                                                 -->
<!-- ============================================================ -->
<div class="flex flex-col gap-3">

  <!-- Header row -->
  <div class="flex items-center justify-between">
    <span class="text-sm font-semibold text-text-primary">
      Modifiers
      {#if ctx.feature.grantedModifiers.length > 0}
        <span class="ml-1.5 text-xs font-normal text-text-muted badge">
          {ctx.feature.grantedModifiers.length}
        </span>
      {/if}
    </span>
    <button type="button" class="btn-primary text-xs py-1 px-3 h-auto" onclick={addModifier}>
      + Add Modifier
    </button>
  </div>

  <!-- Empty state -->
  {#if ctx.feature.grantedModifiers.length === 0}
    <div class="rounded-lg border border-dashed border-border px-4 py-6 text-center">
      <p class="text-sm text-text-muted italic">No modifiers yet.</p>
      <p class="text-xs text-text-muted mt-1">
        Click "+ Add Modifier" to add the first mechanical effect of this entity.
      </p>
    </div>

  {:else}
    <!-- Modifier rows -->
    {#each ctx.feature.grantedModifiers as mod, i (mod.id)}
      <div class="flex flex-col gap-3 rounded-lg border border-border bg-surface-alt p-4">

        <!-- ── ROW HEADER: index label + duplicate + delete ─────────── -->
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold text-text-muted uppercase tracking-wider">
            Modifier #{i + 1}
            {#if mod.id}
              <code class="ml-1 font-mono text-[9px] opacity-50">{mod.id}</code>
            {/if}
          </span>
          <div class="flex gap-1">
            <!-- Duplicate -->
            <button
              type="button"
              class="btn-ghost btn-icon h-7 w-7 p-0 text-text-muted"
              onclick={() => duplicateModifier(i)}
              title="Duplicate this modifier"
              aria-label="Duplicate modifier {i + 1}"
            >
              <svg class="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
                   fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
            </button>
            <!-- Delete -->
            <button
              type="button"
              class="btn-ghost btn-icon h-7 w-7 p-0 text-text-muted hover:text-danger"
              onclick={() => deleteModifier(i)}
              title="Delete this modifier"
              aria-label="Delete modifier {i + 1}"
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
        </div>

        <!-- ── MAIN FIELDS GRID ──────────────────────────────────────── -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">

          <!-- Target Pipeline -->
          <div class="flex flex-col gap-1">
            <span class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              Target Pipeline
            </span>
            <button
              type="button"
              class="input text-xs text-left flex items-center gap-2 font-mono
                     {mod.targetId ? 'text-text-primary' : 'text-text-muted italic'}"
              onclick={() => (activeModal = { kind: 'pipeline', index: i })}
              title="Click to pick a pipeline"
            >
              {mod.targetId || 'Click to pick…'}
              <svg class="h-3 w-3 text-text-muted ml-auto shrink-0"
                   xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
                   fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            {#if mod.targetId}
              <button
                type="button"
                class="text-[10px] text-text-muted underline text-left"
                onclick={() => (activeModal = { kind: 'pipeline', index: i })}
              >Change</button>
            {/if}
          </div>

          <!-- Modifier Type -->
          <div class="flex flex-col gap-1">
            <span class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              Type
            </span>
            <button
              type="button"
              class="input text-xs text-left flex items-center gap-2"
              onclick={() => (activeModal = { kind: 'modtype', index: i })}
              title="Click to change modifier type"
            >
              <code class="font-mono">{mod.type}</code>
              <span class="border text-[9px] font-bold uppercase tracking-wider px-1.5
                           py-0.5 rounded shrink-0 {typeBadgeClass(mod.type)}">
                {ALWAYS_STACKS.includes(mod.type)
                  ? 'STACKS'
                  : SPECIAL_TYPES.includes(mod.type)
                  ? 'SPECIAL'
                  : 'BEST WINS'}
              </span>
              <svg class="h-3 w-3 text-text-muted ml-auto shrink-0"
                   xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
                   fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
          </div>

          <!-- Value (FormulaBuilderInput) -->
          <div class="flex flex-col gap-1 md:col-span-2">
            <label
              for="mod-val-{mod.id}"
              class="text-[10px] font-semibold uppercase tracking-wider text-text-muted"
            >
              Value
            </label>
            <FormulaBuilderInput
              id="mod-val-{mod.id}"
              value={mod.value}
              placeholder="e.g. 2, -1, @attributes.stat_strength.derivedModifier"
              onValueChanged={(v) => {
                // Coerce to number if it looks like a plain number; keep string otherwise.
                const asNum = Number(v);
                patchModifier(i, { value: (!isNaN(asNum) && v.trim() !== '') ? asNum : v });
              }}
            />
          </div>

          <!-- Situational Context -->
          <div class="flex flex-col gap-1 md:col-span-2">
            <label
              for="mod-sit-{mod.id}"
              class="text-[10px] font-semibold uppercase tracking-wider text-text-muted"
            >
              Situational Context
              <span class="ml-1 text-[9px] font-normal normal-case text-text-muted">
                (optional — routes to situational modifiers, applied at roll time)
              </span>
            </label>
            <input
              id="mod-sit-{mod.id}"
              type="text"
              class="input text-xs font-mono"
              value={mod.situationalContext ?? ''}
              placeholder="e.g. orc, flanking, vs_enchantment  (match against roll target tags)"
              oninput={(e) => {
                const v = (e.currentTarget as HTMLInputElement).value.trim();
                patchModifier(i, { situationalContext: v || undefined });
              }}
              autocomplete="off"
              spellcheck="false"
            />
          </div>

          <!-- conditionNode row -->
          <div class="flex flex-col gap-1 md:col-span-2">
            <span class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              Condition (sheet-time gate)
              <span class="ml-1 text-[9px] font-normal normal-case">
                (optional — if false, modifier is ignored)
              </span>
            </span>
            <div class="flex items-center gap-2 rounded border border-border px-3 py-2
                        bg-surface text-xs">
              {#if mod.conditionNode}
                <span class="text-text-secondary font-mono truncate flex-1">
                  {conditionSummary(mod.conditionNode)}
                </span>
                <button
                  type="button"
                  class="btn-ghost text-xs py-0.5 px-2 h-auto shrink-0"
                  onclick={() => openConditionModal(i)}
                >Edit…</button>
                <button
                  type="button"
                  class="btn-ghost text-xs py-0.5 px-2 h-auto text-danger shrink-0"
                  onclick={() => patchModifier(i, { conditionNode: undefined })}
                  aria-label="Remove condition"
                >Remove</button>
              {:else}
                <span class="text-text-muted italic flex-1">No condition — always active.</span>
                <button
                  type="button"
                  class="btn-ghost text-xs py-0.5 px-2 h-auto shrink-0"
                  onclick={() => openConditionModal(i)}
                >+ Add Condition</button>
              {/if}
            </div>
          </div>

          <!-- DR Bypass Tags — only when type === 'damage_reduction' -->
          {#if mod.type === 'damage_reduction'}
            <div class="flex flex-col gap-1.5 md:col-span-2">
              <div class="flex items-center justify-between">
                <span class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                  DR Bypass Tags
                  <span class="ml-1 text-[9px] font-normal normal-case text-text-muted">
                    (e.g. silver, magic, cold_iron — empty = "DR X/—")
                  </span>
                </span>
                <button
                  type="button"
                  class="btn-ghost text-xs py-0.5 px-2 h-auto"
                  onclick={() => (activeModal = { kind: 'tags_dr', index: i })}
                >Edit Tags</button>
              </div>
              <div class="flex flex-wrap gap-1.5 min-h-[1.75rem]">
                {#if (mod.drBypassTags ?? []).length === 0}
                  <span class="text-xs text-text-muted italic">
                    No bypass tags — DR {mod.value}/— (overcome by nothing).
                  </span>
                {:else}
                  {#each (mod.drBypassTags ?? []) as tag (tag)}
                    <span class="badge font-mono text-[10px]">{tag}</span>
                  {/each}
                {/if}
              </div>
            </div>
          {/if}

        </div>

        <!-- ── SOURCE FIELDS (collapsible) ──────────────────────────── -->
        <details class="group/src">
          <summary
            class="cursor-pointer text-[10px] text-text-muted hover:text-text-secondary
                   select-none list-none flex items-center gap-1 w-fit"
          >
            <svg class="h-3 w-3 transition-transform group-open/src:rotate-90"
                 xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
                 fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            Source attribution (auto-filled from entity id/label)
          </summary>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
            <div class="flex flex-col gap-1">
              <label
                for="mod-srcid-{mod.id}"
                class="text-[10px] text-text-muted font-semibold uppercase tracking-wider"
              >Source ID</label>
              <input
                id="mod-srcid-{mod.id}"
                type="text"
                class="input font-mono text-xs"
                value={mod.sourceId}
                placeholder={defaultSourceId()}
                oninput={(e) => patchModifier(i, { sourceId: (e.currentTarget as HTMLInputElement).value })}
                autocomplete="off"
              />
            </div>
            <div class="flex flex-col gap-1">
              <label
                for="mod-srcname-{mod.id}"
                class="text-[10px] text-text-muted font-semibold uppercase tracking-wider"
              >Source Name (EN)</label>
              <input
                id="mod-srcname-{mod.id}"
                type="text"
                class="input text-xs"
                value={(mod.sourceName as Record<string,string>)?.['en'] ?? ''}
                placeholder={defaultSourceName()}
                oninput={(e) => patchModifier(i, {
                  sourceName: {
                    ...(mod.sourceName as Record<string,string>),
                    en: (e.currentTarget as HTMLInputElement).value,
                  }
                })}
              />
            </div>
          </div>
        </details>

      </div>
    {/each}
  {/if}

  <!-- Bottom "+ Add Modifier" when list is non-empty (saves scrolling) -->
  {#if ctx.feature.grantedModifiers.length > 0}
    <button type="button" class="btn-ghost text-sm w-full py-2" onclick={addModifier}>
      + Add Modifier
    </button>
  {/if}

</div>
