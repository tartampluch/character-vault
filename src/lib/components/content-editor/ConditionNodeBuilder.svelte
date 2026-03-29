<!--
  @file src/lib/components/content-editor/ConditionNodeBuilder.svelte
  @description Visual editor for LogicNode prerequisite / condition trees.
-->

<script lang="ts">
  import type {
    LogicNode,
    LogicNodeAnd,
    LogicNodeOr,
    LogicNodeNot,
    LogicNodeCondition,
  } from '$lib/types/logic';
  import type { LogicOperator } from '$lib/types/primitives';
  import { CONDITION_NODE_KNOWN_PATHS } from '$lib/utils/constants';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import TagPickerModal from './TagPickerModal.svelte';
  import ConditionNodeBuilder from './ConditionNodeBuilder.svelte';

  interface Props {
    node: LogicNode | undefined;
    onNodeChanged: (node: LogicNode | undefined) => void;
    depth?: number;
  }

  let { node, onNodeChanged, depth = 0 }: Props = $props();
  const lang = $derived(engine.settings.language);

  const OPERATOR_LABEL_KEYS: Record<LogicOperator, string> = {
    '==':          'editor.condition.op_equals',
    '!=':          'editor.condition.op_not_equals',
    '>=':          'editor.condition.op_at_least',
    '<=':          'editor.condition.op_at_most',
    'includes':    'editor.condition.op_includes',
    'not_includes':'editor.condition.op_not_includes',
    'has_tag':     'editor.condition.op_has_tag',
    'missing_tag': 'editor.condition.op_missing_tag',
  };

  const ALL_OPERATORS = Object.keys(OPERATOR_LABEL_KEYS) as LogicOperator[];

  function isNumericOperator(op: LogicOperator): boolean {
    return op === '>=' || op === '<=';
  }

  function isTagOperator(op: LogicOperator): boolean {
    return op === 'has_tag' || op === 'missing_tag';
  }

  const uid = Math.random().toString(36).slice(2, 8);
  const datalistId   = `cnd-paths-${uid}`;
  const idTargetPath = `cnd-tp-${uid}`;
  const idOperator   = `cnd-op-${uid}`;
  const idValue      = `cnd-val-${uid}`;
  const idErrorMsg   = `cnd-err-${uid}`;

  function makeBlankCondition(): LogicNodeCondition {
    return {
      logic:        'CONDITION',
      targetPath:   '@activeTags',
      operator:     'has_tag',
      value:        '',
      errorMessage: '',
    };
  }

  function handleAndOrChildChanged(
    andOrNode: LogicNodeAnd | LogicNodeOr,
    childIndex: number,
    newChild: LogicNode | undefined
  ): void {
    if (newChild === undefined) {
      const newNodes = andOrNode.nodes.filter((_, i) => i !== childIndex);
      onNodeChanged(newNodes.length > 0 ? { ...andOrNode, nodes: newNodes } : undefined);
    } else {
      const newNodes = [
        ...andOrNode.nodes.slice(0, childIndex),
        newChild,
        ...andOrNode.nodes.slice(childIndex + 1),
      ];
      onNodeChanged({ ...andOrNode, nodes: newNodes });
    }
  }

  function handleNotChildChanged(notNode: LogicNodeNot, newChild: LogicNode | undefined): void {
    onNodeChanged(newChild ? { ...notNode, node: newChild } : undefined);
  }

  function patchCondition(patch: Partial<LogicNodeCondition>): void {
    if (node?.logic !== 'CONDITION') return;
    onNodeChanged({ ...node, ...patch });
  }

  function handleOperatorChange(newOp: LogicOperator): void {
    if (node?.logic !== 'CONDITION') return;
    let newValue: unknown = node.value;
    if (isNumericOperator(newOp) && typeof newValue !== 'number') {
      newValue = 0;
    } else if (isTagOperator(newOp) && typeof newValue !== 'string') {
      newValue = '';
    } else if (!isNumericOperator(newOp) && !isTagOperator(newOp)) {
      newValue = String(newValue ?? '');
    }
    onNodeChanged({ ...node, operator: newOp, value: newValue });
  }

  let showTagPicker = $state(false);

  function containerBorderColor(logic: 'AND' | 'OR' | 'NOT'): string {
    if (logic === 'AND') return 'border-l-blue-500/60';
    if (logic === 'OR')  return 'border-l-purple-500/60';
    return 'border-l-red-500/60';
  }

  const MAX_DEPTH = 4;

  function addConditionToAndOr(andOrNode: LogicNodeAnd | LogicNodeOr): void {
    onNodeChanged({ ...andOrNode, nodes: [...andOrNode.nodes, makeBlankCondition()] });
  }

  function addGroupToAndOr(andOrNode: LogicNodeAnd | LogicNodeOr, newGroupLogic: 'AND' | 'OR'): void {
    const newGroup: LogicNodeAnd | LogicNodeOr = { logic: newGroupLogic, nodes: [makeBlankCondition()] };
    onNodeChanged({ ...andOrNode, nodes: [...andOrNode.nodes, newGroup] });
  }

  function swapChildren(andOrNode: LogicNodeAnd | LogicNodeOr, indexA: number, indexB: number): void {
    if (indexB < 0 || indexB >= andOrNode.nodes.length) return;
    const newNodes = [...andOrNode.nodes];
    [newNodes[indexA], newNodes[indexB]] = [newNodes[indexB], newNodes[indexA]];
    onNodeChanged({ ...andOrNode, nodes: newNodes });
  }

  function switchAndOr(andOrNode: LogicNodeAnd | LogicNodeOr): void {
    onNodeChanged({ logic: andOrNode.logic === 'AND' ? 'OR' : 'AND', nodes: andOrNode.nodes });
  }

  function addConditionAtRoot(): void {
    onNodeChanged({ logic: 'AND', nodes: [makeBlankCondition()] });
  }

  function addGroupAtRoot(groupLogic: 'AND' | 'OR'): void {
    onNodeChanged({ logic: groupLogic, nodes: [makeBlankCondition()] });
  }

  let addGroupDropdownOpen = $state(false);
</script>

<!-- DATALIST for targetPath autocomplete -->
<datalist id={datalistId}>
  {#each CONDITION_NODE_KNOWN_PATHS as path (path)}
    <option value={path}></option>
  {/each}
</datalist>

{#if node === undefined}
  <!-- ── EMPTY STATE ──────────────────────────────────────────────────── -->
  <div class="flex flex-wrap items-center gap-2 py-2 px-3 rounded border border-dashed
              border-border bg-surface/50">
    <span class="text-xs text-text-muted italic mr-1">{ui('editor.condition.no_conditions', lang)}</span>

    <button
      type="button"
      class="btn-ghost text-xs py-0.5 px-2 h-auto"
      onclick={addConditionAtRoot}
    >
      {ui('editor.condition.add_condition_btn', lang)}
    </button>

    {#if depth < MAX_DEPTH}
      <div class="relative">
        <button
          type="button"
          class="btn-ghost text-xs py-0.5 px-2 h-auto"
          onclick={() => (addGroupDropdownOpen = !addGroupDropdownOpen)}
          aria-haspopup="menu"
          aria-expanded={addGroupDropdownOpen}
        >
          {ui('editor.condition.add_group_btn', lang)}
        </button>
        {#if addGroupDropdownOpen}
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <div
            role="menu"
            tabindex="-1"
            class="absolute left-0 top-full mt-1 z-10 flex flex-col rounded-lg border
                   border-border bg-surface shadow-lg overflow-hidden text-xs w-44"
            onkeydown={(e) => { if (e.key === 'Escape') addGroupDropdownOpen = false; }}
          >
            <button
              type="button" role="menuitem"
              class="px-3 py-2 text-left hover:bg-surface-alt text-blue-400 font-semibold"
              onclick={() => { addGroupAtRoot('AND'); addGroupDropdownOpen = false; }}
            >
              {ui('editor.condition.and_all_of', lang)}
            </button>
            <button
              type="button" role="menuitem"
              class="px-3 py-2 text-left hover:bg-surface-alt text-purple-400 font-semibold"
              onclick={() => { addGroupAtRoot('OR'); addGroupDropdownOpen = false; }}
            >
              {ui('editor.condition.or_any_of', lang)}
            </button>
          </div>
        {/if}
      </div>
    {:else}
      <span
        class="text-xs text-text-muted italic"
        title={ui('editor.condition.max_depth_title', lang)}
      >
        {ui('editor.condition.max_depth_reached', lang)}
      </span>
    {/if}
  </div>

{:else if node.logic === 'AND' || node.logic === 'OR'}
  <!-- ── AND / OR CONTAINER ────────────────────────────────────────────── -->
  {@const isAnd = node.logic === 'AND'}
  <div class="flex flex-col gap-0 rounded-lg border border-border
              border-l-4 {containerBorderColor(node.logic)} overflow-hidden">

    <!-- Header row -->
    <div class="flex items-center justify-between px-3 py-2 bg-surface-alt gap-2">
      <div class="flex items-center gap-2 flex-1">
        <button
          type="button"
          class="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded
                 border transition-colors
                 {isAnd
                   ? 'text-blue-400 border-blue-700/50 hover:bg-blue-900/30'
                   : 'text-purple-400 border-purple-700/50 hover:bg-purple-900/30'}"
          onclick={() => switchAndOr(node)}
          title={ui('editor.condition.toggle_and_or_title', lang)}
        >
          {isAnd ? ui('editor.condition.all_of_and_label', lang) : ui('editor.condition.any_of_or_label', lang)}
          <span class="ml-1 opacity-60 text-[9px]">↕</span>
        </button>
      </div>

      <button
        type="button"
        class="btn-ghost btn-icon text-text-muted hover:text-danger shrink-0"
        onclick={() => onNodeChanged(undefined)}
        title={ui('editor.condition.delete_group_title', lang).replace('{type}', node.logic)}
        aria-label={ui('editor.condition.delete_group_aria', lang).replace('{type}', node.logic)}
      >
        <svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6l-1 14H6L5 6"/>
          <path d="M10 11v6M14 11v6"/>
          <path d="M9 6V4h6v2"/>
        </svg>
      </button>
    </div>

    <!-- Children -->
    <div class="flex flex-col gap-2 p-3">
      {#each node.nodes as child, i (i)}
        <div class="flex items-start gap-1.5">
          <!-- Reorder controls -->
          <div class="flex flex-col shrink-0 mt-1">
            <button
              type="button"
              class="btn-ghost btn-icon h-5 w-5 p-0 text-text-muted
                     disabled:opacity-20 disabled:cursor-not-allowed"
              onclick={() => swapChildren(node, i, i - 1)}
              disabled={i === 0}
              title={ui('editor.condition.move_up_title', lang)}
              aria-label={ui('editor.condition.move_up_aria', lang)}
            >
              <svg class="h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
                   fill="none" stroke="currentColor" stroke-width="2.5"
                   stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="18 15 12 9 6 15"/>
              </svg>
            </button>
            <button
              type="button"
              class="btn-ghost btn-icon h-5 w-5 p-0 text-text-muted
                     disabled:opacity-20 disabled:cursor-not-allowed"
              onclick={() => swapChildren(node, i, i + 1)}
              disabled={i === node.nodes.length - 1}
              title={ui('editor.condition.move_down_title', lang)}
              aria-label={ui('editor.condition.move_down_aria', lang)}
            >
              <svg class="h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
                   fill="none" stroke="currentColor" stroke-width="2.5"
                   stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
          </div>

          <!-- Child node (recursive) -->
          <div class="flex-1 min-w-0">
            <ConditionNodeBuilder
              node={child}
              depth={depth + 1}
              onNodeChanged={(newChild) => handleAndOrChildChanged(node, i, newChild)}
            />
          </div>
        </div>
      {/each}

      <!-- ── Add bar ──────────────────────────────────────────────────── -->
      <div class="flex flex-wrap items-center gap-2 pt-1 border-t border-border/50 mt-1">
        <button
          type="button"
          class="btn-ghost text-xs py-0.5 px-2 h-auto"
          onclick={() => addConditionToAndOr(node)}
        >
          {ui('editor.condition.add_condition_btn', lang)}
        </button>

        {#if depth < MAX_DEPTH}
          <div class="relative">
            <button
              type="button"
              class="btn-ghost text-xs py-0.5 px-2 h-auto"
              onclick={() => (addGroupDropdownOpen = !addGroupDropdownOpen)}
              aria-haspopup="menu"
              aria-expanded={addGroupDropdownOpen}
            >
              {ui('editor.condition.add_group_btn', lang)}
            </button>
            {#if addGroupDropdownOpen}
              <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
              <div
                role="menu"
                tabindex="-1"
                class="absolute left-0 top-full mt-1 z-10 flex flex-col rounded-lg border
                       border-border bg-surface shadow-lg overflow-hidden text-xs w-44"
                onkeydown={(e) => { if (e.key === 'Escape') addGroupDropdownOpen = false; }}
              >
                <button
                  type="button" role="menuitem"
                  class="px-3 py-2 text-left hover:bg-surface-alt text-blue-400 font-semibold"
                  onclick={() => { addGroupToAndOr(node, 'AND'); addGroupDropdownOpen = false; }}
                >
                  {ui('editor.condition.and_all_of', lang)}
                </button>
                <button
                  type="button" role="menuitem"
                  class="px-3 py-2 text-left hover:bg-surface-alt text-purple-400 font-semibold"
                  onclick={() => { addGroupToAndOr(node, 'OR'); addGroupDropdownOpen = false; }}
                >
                  {ui('editor.condition.or_any_of', lang)}
                </button>
              </div>
            {/if}
          </div>
        {:else}
          <span
            class="text-xs text-text-muted italic"
            title={ui('editor.condition.max_depth_title', lang)}
          >
            {ui('editor.condition.max_depth_reached', lang)}
          </span>
        {/if}
      </div>
    </div>
  </div>

{:else if node.logic === 'NOT'}
  <!-- ── NOT CONTAINER ─────────────────────────────────────────────────── -->
  <div class="flex flex-col gap-0 rounded-lg border border-border
              border-l-4 {containerBorderColor('NOT')} overflow-hidden">

    <div class="flex items-center justify-between px-3 py-2 bg-surface-alt gap-2">
      <span class="text-xs font-bold uppercase tracking-wider text-red-400">
        {ui('editor.condition.not_none_of', lang)}
      </span>
      <button
        type="button"
        class="btn-ghost btn-icon text-text-muted hover:text-danger shrink-0"
        onclick={() => onNodeChanged(undefined)}
        title={ui('editor.condition.delete_not_title', lang)}
        aria-label={ui('editor.condition.delete_not_aria', lang)}
      >
        <svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6l-1 14H6L5 6"/>
          <path d="M10 11v6M14 11v6"/>
          <path d="M9 6V4h6v2"/>
        </svg>
      </button>
    </div>

    <div class="p-3">
      <ConditionNodeBuilder
        node={node.node}
        depth={depth + 1}
        onNodeChanged={(newChild) => handleNotChildChanged(node, newChild)}
      />
    </div>
  </div>

{:else if node.logic === 'CONDITION'}
  <!-- ── CONDITION ROW ─────────────────────────────────────────────────── -->

  {#if showTagPicker}
    <TagPickerModal
      initialSelected={typeof node.value === 'string' && node.value ? [node.value] : []}
      onTagsPicked={(tags) => {
        patchCondition({ value: tags[0] ?? '' });
        showTagPicker = false;
      }}
      onclose={() => (showTagPicker = false)}
    />
  {/if}

  <div class="flex flex-col md:flex-row md:items-center gap-2 rounded-lg border
              border-border bg-surface-alt px-3 py-2">

    <!-- ① targetPath input -->
    <div class="flex flex-col gap-0.5 flex-1 min-w-0">
      <label for={idTargetPath}
             class="text-[10px] text-text-muted uppercase tracking-wider font-semibold">
        {ui('editor.condition.target_path_label', lang)}
      </label>
      <input
        id={idTargetPath}
        type="text"
        class="input font-mono text-xs w-full"
        list={datalistId}
        value={node.targetPath}
        placeholder="@activeTags"
        oninput={(e) => patchCondition({ targetPath: (e.currentTarget as HTMLInputElement).value })}
        autocomplete="off"
        spellcheck="false"
      />
    </div>

    <!-- ② Operator <select> -->
    <div class="flex flex-col gap-0.5 shrink-0">
      <label for={idOperator}
             class="text-[10px] text-text-muted uppercase tracking-wider font-semibold">
        {ui('editor.condition.operator_label', lang)}
      </label>
      <select
        id={idOperator}
        class="input text-xs pr-6"
        value={node.operator}
        onchange={(e) => handleOperatorChange((e.currentTarget as HTMLSelectElement).value as LogicOperator)}
      >
        {#each ALL_OPERATORS as op (op)}
          <option value={op}>{ui(OPERATOR_LABEL_KEYS[op], lang)}</option>
        {/each}
      </select>
    </div>

    <!-- ③ Adaptive value field -->
    <div class="flex flex-col gap-0.5 flex-1 min-w-0">
      <label for={idValue}
             class="text-[10px] text-text-muted uppercase tracking-wider font-semibold">
        {ui('editor.condition.value_label', lang)}
      </label>

      {#if isNumericOperator(node.operator)}
        <input
          id={idValue}
          type="number"
          class="input text-xs w-full"
          value={typeof node.value === 'number' ? node.value : 0}
          oninput={(e) => patchCondition({ value: Number((e.currentTarget as HTMLInputElement).value) })}
        />

      {:else if isTagOperator(node.operator)}
        <button
          id={idValue}
          type="button"
          class="input text-xs text-left w-full truncate
                 {node.value ? 'text-text-primary font-mono' : 'text-text-muted italic'}"
          onclick={() => (showTagPicker = true)}
          title={ui('editor.condition.click_to_pick_tag_title', lang)}
        >
          {node.value ? String(node.value) : ui('editor.condition.click_to_pick_tag', lang)}
        </button>

      {:else}
        <input
          id={idValue}
          type="text"
          class="input text-xs w-full"
          value={node.value !== undefined && node.value !== null ? String(node.value) : ''}
          placeholder="value"
          oninput={(e) => patchCondition({ value: (e.currentTarget as HTMLInputElement).value })}
          autocomplete="off"
          spellcheck="false"
        />
      {/if}
    </div>

    <!-- ④ errorMessage text input -->
    <div class="flex flex-col gap-0.5 flex-1 min-w-0">
      <label for={idErrorMsg}
             class="text-[10px] text-text-muted uppercase tracking-wider font-semibold">
        {ui('editor.condition.error_message_label', lang)}
      </label>
      <input
        id={idErrorMsg}
        type="text"
        class="input text-xs w-full"
        value={node.errorMessage ?? ''}
        placeholder="e.g. Requires stat_strength 13+"
        oninput={(e) => patchCondition({ errorMessage: (e.currentTarget as HTMLInputElement).value || undefined })}
        autocomplete="off"
      />
    </div>

    <!-- ⑤ Delete button -->
    <div class="flex flex-col gap-0.5 shrink-0 md:pt-4">
      <button
        type="button"
        class="btn-ghost btn-icon text-text-muted hover:text-danger"
        onclick={() => onNodeChanged(undefined)}
        title={ui('editor.condition.delete_condition_title', lang)}
        aria-label={ui('editor.condition.delete_condition_aria', lang)}
      >
        <svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
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
{/if}
