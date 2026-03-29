<!--
  @file src/lib/components/content-editor/ModifierRow.svelte
  @description Single modifier row editor — encapsulates all field editing UI for one
  Modifier entry in ModifierListEditor.
  Extracted from ModifierListEditor.svelte as part of F4 refactoring.
-->

<script lang="ts">
  import { getContext } from 'svelte';
  import { EDITOR_CONTEXT_KEY, type EditorContext } from './editorContext';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import type { Modifier } from '$lib/types/pipeline';
  import type { LogicNode } from '$lib/types/logic';
  import type { ModifierType } from '$lib/types/primitives';
  import { ALWAYS_STACKING_TYPES, SPECIAL_MODIFIER_TYPES } from '$lib/utils/stackingRules';
  import Modal from '$lib/components/ui/Modal.svelte';
  import PipelinePickerModal     from './PipelinePickerModal.svelte';
  import ModifierTypePickerModal from './ModifierTypePickerModal.svelte';
  import FormulaBuilderInput     from './FormulaBuilderInput.svelte';
  import ConditionNodeBuilder    from './ConditionNodeBuilder.svelte';
  import TagPickerModal          from './TagPickerModal.svelte';

  const ctx = getContext<EditorContext>(EDITOR_CONTEXT_KEY);
  const lang = $derived(engine.settings.language);

  let {
    modifier,
    index,
    onchange,
    ondelete,
    onduplicate,
  }: {
    modifier:    Modifier;
    index:       number;
    onchange:    (updated: Modifier) => void;
    ondelete:    () => void;
    onduplicate: () => void;
  } = $props();

  function defaultSourceId(): string {
    return ctx.feature.id || 'feature_id';
  }

  function defaultSourceName(): string {
    const lbl = ctx.feature.label as Record<string, string>;
    return lbl?.['en'] || ctx.feature.id || ui('editor.modifier.fallback_feature', lang);
  }

  function patch(p: Partial<Modifier>): void {
    onchange({ ...modifier, ...p });
  }

  type ActiveModal =
    | { kind: 'pipeline' }
    | { kind: 'modtype' }
    | { kind: 'condition' }
    | { kind: 'tags_dr' };

  let activeModal = $state<ActiveModal | null>(null);

  function closeModal(): void { activeModal = null; }

  let conditionWorkingCopy = $state<LogicNode | undefined>(undefined);

  function openConditionModal(): void {
    conditionWorkingCopy = modifier.conditionNode
      ? structuredClone(modifier.conditionNode)
      : undefined;
    activeModal = { kind: 'condition' };
  }

  function applyCondition(): void {
    patch({ conditionNode: conditionWorkingCopy });
    closeModal();
  }

  function conditionSummary(node: LogicNode | undefined): string {
    if (!node) return '';
    if (node.logic === 'AND') return ui('editor.modifier.condition_and_summary', lang).replace('{n}', String(node.nodes.length));
    if (node.logic === 'OR')  return ui('editor.modifier.condition_or_summary', lang).replace('{n}', String(node.nodes.length));
    if (node.logic === 'NOT') return ui('editor.modifier.condition_not_summary', lang);
    return `${node.targetPath} ${node.operator} ${JSON.stringify(node.value)}`;
  }

  function typeBadgeClass(type: ModifierType): string {
    if (ALWAYS_STACKING_TYPES.has(type))
      return 'bg-green-900/30 text-green-400 border-green-700/40';
    if (SPECIAL_MODIFIER_TYPES.has(type))
      return 'bg-purple-900/30 text-purple-300 border-purple-700/40';
    return 'bg-yellow-900/30 text-yellow-300 border-yellow-700/40';
  }
</script>

<!-- ============================================================ -->
<!-- PIPELINE PICKER MODAL                                         -->
<!-- ============================================================ -->
{#if activeModal?.kind === 'pipeline'}
  <PipelinePickerModal
    onPipelinePicked={(id) => { patch({ targetId: id }); closeModal(); }}
    onclose={closeModal}
  />
{/if}

<!-- ============================================================ -->
<!-- MODIFIER TYPE PICKER MODAL                                    -->
<!-- ============================================================ -->
{#if activeModal?.kind === 'modtype'}
  <ModifierTypePickerModal
    onModifierTypePicked={(t) => { patch({ type: t }); closeModal(); }}
    onclose={closeModal}
  />
{/if}

<!-- ============================================================ -->
<!-- DR BYPASS TAGS PICKER MODAL                                   -->
<!-- ============================================================ -->
{#if activeModal?.kind === 'tags_dr'}
  <TagPickerModal
    initialSelected={modifier.drBypassTags ?? []}
    onTagsPicked={(tags) => { patch({ drBypassTags: tags }); closeModal(); }}
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
    title={ui('editor.modifier.edit_condition_title', lang)}
    size="xl"
    fullscreen={true}
  >
    {#snippet children()}
      <div class="flex flex-col gap-4">
        <p class="text-xs text-text-muted">
          {ui('editor.modifier.condition_sheet_time_desc', lang)}
        </p>

        <ConditionNodeBuilder
          node={conditionWorkingCopy}
          onNodeChanged={(n) => { conditionWorkingCopy = n; }}
        />

        <div class="flex justify-end gap-2 pt-3 border-t border-border">
          <button type="button" class="btn-ghost" onclick={closeModal}>
            {ui('common.cancel', lang)}
          </button>
          <button type="button" class="btn-primary" onclick={applyCondition}>
            {ui('editor.modifier.edit_condition_title', lang)}
          </button>
        </div>
      </div>
    {/snippet}
  </Modal>
{/if}

<!-- ============================================================ -->
<!-- MODIFIER ROW                                                  -->
<!-- ============================================================ -->
<div class="flex flex-col gap-3 rounded-lg border border-border bg-surface-alt p-4">

  <!-- ── ROW HEADER: index label + duplicate + delete ─────────── -->
  <div class="flex items-center justify-between">
    <span class="text-xs font-semibold text-text-muted uppercase tracking-wider">
      {ui('editor.modifier.row_label', lang).replace('{n}', String(index + 1))}
      {#if modifier.id}
        <code class="ml-1 font-mono text-[9px] opacity-50">{modifier.id}</code>
      {/if}
    </span>
    <div class="flex gap-1">
      <!-- Duplicate -->
      <button
        type="button"
        class="btn-ghost btn-icon h-7 w-7 p-0 text-text-muted"
        onclick={onduplicate}
        title={ui('editor.modifier.duplicate_title', lang)}
        aria-label={ui('editor.modifier.duplicate_aria', lang).replace('{n}', String(index + 1))}
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
        onclick={ondelete}
        title={ui('editor.modifier.delete_title', lang)}
        aria-label={ui('editor.modifier.delete_aria', lang).replace('{n}', String(index + 1))}
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
        {ui('editor.modifier.target_pipeline_label', lang)}
      </span>
      <button
        type="button"
        class="input text-xs text-left flex items-center gap-2 font-mono
               {modifier.targetId ? 'text-text-primary' : 'text-text-muted italic'}"
        onclick={() => (activeModal = { kind: 'pipeline' })}
        title={ui('editor.modifier.click_to_pick_title', lang)}
      >
        {modifier.targetId || ui('editor.modifier.click_to_pick_pipeline', lang)}
        <svg class="h-3 w-3 text-text-muted ml-auto shrink-0"
             xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
      {#if modifier.targetId}
        <button
          type="button"
          class="text-[10px] text-text-muted underline text-left"
          onclick={() => (activeModal = { kind: 'pipeline' })}
        >{ui('editor.modifier.change_pipeline_btn', lang)}</button>
      {/if}
    </div>

    <!-- Modifier Type -->
    <div class="flex flex-col gap-1">
      <span class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        {ui('editor.modifier.type_label', lang)}
      </span>
      <button
        type="button"
        class="input text-xs text-left flex items-center gap-2"
        onclick={() => (activeModal = { kind: 'modtype' })}
        title={ui('editor.modifier.click_to_change_type_title', lang)}
      >
        <code class="font-mono">{modifier.type}</code>
        <span class="border text-[9px] font-bold uppercase tracking-wider px-1.5
                     py-0.5 rounded shrink-0 {typeBadgeClass(modifier.type)}">
          {ALWAYS_STACKING_TYPES.has(modifier.type)
            ? ui('editor.modifier.stacks_badge', lang)
            : SPECIAL_MODIFIER_TYPES.has(modifier.type)
            ? ui('editor.modifier.special_badge', lang)
            : ui('editor.modifier.best_wins_badge', lang)}
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
        for="mod-val-{modifier.id}"
        class="text-[10px] font-semibold uppercase tracking-wider text-text-muted"
      >
        {ui('editor.modifier.value_label', lang)}
      </label>
      <FormulaBuilderInput
        id="mod-val-{modifier.id}"
        value={modifier.value}
        placeholder="e.g. 2, -1, @attributes.stat_strength.derivedModifier"
        onValueChanged={(v) => {
          const asNum = Number(v);
          patch({ value: (!isNaN(asNum) && v.trim() !== '') ? asNum : v });
        }}
      />
    </div>

    <!-- Situational Context -->
    <div class="flex flex-col gap-1 md:col-span-2">
      <label
        for="mod-sit-{modifier.id}"
        class="text-[10px] font-semibold uppercase tracking-wider text-text-muted"
      >
        {ui('editor.modifier.situational_label', lang)}
        <span class="ml-1 text-[9px] font-normal normal-case text-text-muted">
          {ui('editor.modifier.situational_hint', lang)}
        </span>
      </label>
      <input
        id="mod-sit-{modifier.id}"
        type="text"
        class="input text-xs font-mono"
        value={modifier.situationalContext ?? ''}
        placeholder="e.g. orc, flanking, vs_enchantment  (match against roll target tags)"
        oninput={(e) => {
          const v = (e.currentTarget as HTMLInputElement).value.trim();
          patch({ situationalContext: v || undefined });
        }}
        autocomplete="off"
        spellcheck="false"
      />
    </div>

    <!-- conditionNode row -->
    <div class="flex flex-col gap-1 md:col-span-2">
      <span class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        {ui('editor.modifier.condition_label', lang)}
        <span class="ml-1 text-[9px] font-normal normal-case">
          {ui('editor.modifier.condition_optional_hint', lang)}
        </span>
      </span>
      <div class="flex items-center gap-2 rounded border border-border px-3 py-2
                  bg-surface text-xs">
        {#if modifier.conditionNode}
          <span class="text-text-secondary font-mono truncate flex-1">
            {conditionSummary(modifier.conditionNode)}
          </span>
          <button
            type="button"
            class="btn-ghost text-xs py-0.5 px-2 h-auto shrink-0"
            onclick={openConditionModal}
          >{ui('editor.modifier.edit_condition_btn', lang)}</button>
          <button
            type="button"
            class="btn-ghost text-xs py-0.5 px-2 h-auto text-danger shrink-0"
            onclick={() => patch({ conditionNode: undefined })}
            aria-label={ui('editor.modifier.remove_condition_aria', lang)}
          >{ui('editor.modifier.remove_condition_btn', lang)}</button>
        {:else}
          <span class="text-text-muted italic flex-1">{ui('editor.modifier.no_condition_label', lang)}</span>
          <button
            type="button"
            class="btn-ghost text-xs py-0.5 px-2 h-auto shrink-0"
            onclick={openConditionModal}
          >{ui('editor.modifier.add_condition_btn', lang)}</button>
        {/if}
      </div>
    </div>

    <!-- DR Bypass Tags — only when type === 'damage_reduction' -->
    {#if modifier.type === 'damage_reduction'}
      <div class="flex flex-col gap-1.5 md:col-span-2">
        <div class="flex items-center justify-between">
          <span class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            {ui('editor.modifier.dr_bypass_tags_label', lang)}
            <span class="ml-1 text-[9px] font-normal normal-case text-text-muted">
              {ui('editor.modifier.dr_bypass_tags_hint', lang)}
            </span>
          </span>
          <button
            type="button"
            class="btn-ghost text-xs py-0.5 px-2 h-auto"
            onclick={() => (activeModal = { kind: 'tags_dr' })}
          >{ui('editor.modifier.edit_dr_tags_btn', lang)}</button>
        </div>
        <div class="flex flex-wrap gap-1.5 min-h-[1.75rem]">
          {#if (modifier.drBypassTags ?? []).length === 0}
            <span class="text-xs text-text-muted italic">
              {ui('editor.modifier.no_dr_bypass_tags', lang).replace('{value}', String(modifier.value))}
            </span>
          {:else}
            {#each (modifier.drBypassTags ?? []) as tag (tag)}
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
      {ui('editor.modifier.source_summary', lang)}
    </summary>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
      <div class="flex flex-col gap-1">
        <label
          for="mod-srcid-{modifier.id}"
          class="text-[10px] text-text-muted font-semibold uppercase tracking-wider"
        >{ui('editor.modifier.source_id_label', lang)}</label>
        <input
          id="mod-srcid-{modifier.id}"
          type="text"
          class="input font-mono text-xs"
          value={modifier.sourceId}
          placeholder={defaultSourceId()}
          oninput={(e) => patch({ sourceId: (e.currentTarget as HTMLInputElement).value })}
          autocomplete="off"
        />
      </div>
      <div class="flex flex-col gap-1">
        <label
          for="mod-srcname-{modifier.id}"
          class="text-[10px] text-text-muted font-semibold uppercase tracking-wider"
        >{ui('editor.modifier.source_name_label', lang)}</label>
        <input
          id="mod-srcname-{modifier.id}"
          type="text"
          class="input text-xs"
          value={(modifier.sourceName as Record<string,string>)?.['en'] ?? ''}
          placeholder={defaultSourceName()}
          oninput={(e) => patch({
            sourceName: {
              ...(modifier.sourceName as Record<string,string>),
              en: (e.currentTarget as HTMLInputElement).value,
            }
          })}
        />
      </div>
    </div>
  </details>

</div>
