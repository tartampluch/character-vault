<!--
  @file src/lib/components/content-editor/ConditionNodeBuilder.svelte
  @description Visual editor for LogicNode prerequisite / condition trees.

  ────────────────────────────────────────────────────────────────────────────
  PURPOSE
  ────────────────────────────────────────────────────────────────────────────
  Used in the Content Editor wherever a Feature, Modifier, or FeatureChoice
  holds a `LogicNode` field:
    • `Feature.prerequisitesNode`         — feat/class prereqs
    • `Modifier.conditionNode`            — conditional modifier activations
    • `FeatureChoice.optionsQuery` hints  — filter logic (future)

  The component renders the tree in-place inside the editor form — it is NOT a
  modal.  Each logical node type is visualised differently:

    AND / OR   →  Bordered container with colour-coded header label.
                  Children are indented and rendered recursively.
                  Header shows "All of these (AND)" or "Any of these (OR)".

    NOT        →  Bordered container with a "NOT —" label.
                  A single child is rendered inside.

    CONDITION  →  Compact single-row editor with three adaptive inputs:
                  [targetPath] [operator ▼] [value] [errorMsg] [🗑]

  ────────────────────────────────────────────────────────────────────────────
  MUTATION MODEL — IMMUTABLE UPWARD PROPAGATION
  ────────────────────────────────────────────────────────────────────────────
  Every state change creates new node objects (never mutates in place) and
  calls `onNodeChanged` with the updated subtree rooted at this component.

  When a child node calls its `onNodeChanged` prop with a new value, the parent
  replaces its own reference to that child and re-emits upward:

    CONDITION delete → calls onNodeChanged(undefined) → parent removes it from
                       its `nodes[]` → parent re-emits upward with smaller array.

    AND/OR delete    → calls onNodeChanged(undefined) → grandparent removes the
                       whole AND/OR container.

  An AND/OR container whose `nodes` array becomes empty after a deletion emits
  `undefined` instead of `{ logic: 'AND', nodes: [] }`, keeping the tree tidy.
  A NOT container whose child is deleted also emits `undefined`.

  The ROOT receives `undefined` when the last node is deleted — the editor
  field stores this as the absence of a prerequisite tree.

  ────────────────────────────────────────────────────────────────────────────
  PHASE SCOPE (21.2.6 vs. 21.2.7)
  ────────────────────────────────────────────────────────────────────────────
  21.2.6 (this file): Rendering and editing of EXISTING nodes.  Deletion.
  21.2.7 (next task): "+ Add Condition", "+ Add Group", node-type switcher,
                      ▲/▼ reorder controls, depth-4 guard.

  Extension points for 21.2.7 are marked with  ← 21.2.7  comments.

  ────────────────────────────────────────────────────────────────────────────
  @see src/lib/types/logic.ts              for LogicNode, LogicNodeCondition
  @see src/lib/types/primitives.ts         for LogicOperator
  @see src/lib/components/content-editor/TagPickerModal.svelte  (dependency)
  @see ARCHITECTURE.md §4.3               for the known @-path autocomplete list
  @see ARCHITECTURE.md §21.2.6 / §21.2.7  for full specification
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
  import TagPickerModal from './TagPickerModal.svelte';

  // Self-import for recursion — Svelte handles the circular reference correctly.
  import ConditionNodeBuilder from './ConditionNodeBuilder.svelte';

  // ===========================================================================
  // PROPS
  // ===========================================================================

  interface Props {
    /**
     * The LogicNode to render.  `undefined` means "no condition set yet"
     * (root empty state) or that a child was just deleted.
     * 21.2.7 will render an "+ Add" affordance when this is undefined.
     */
    node: LogicNode | undefined;

    /**
     * Called whenever the subtree rooted at this component changes.
     * Passing `undefined` signals deletion of this node.
     *
     * Callers (editor fields, parent ConditionNodeBuilder instances) must
     * replace their stored node reference with the received value.
     */
    onNodeChanged: (node: LogicNode | undefined) => void;

    /**
     * Current nesting depth.  Depth 0 = root.
     * Passed down and incremented for each AND/OR/NOT container.
     * Used for visual indentation; the maximum-depth guard (depth ≥ 4)
     * will be enforced by 21.2.7.
     */
    depth?: number;
  }

  let { node, onNodeChanged, depth = 0 }: Props = $props();

  // ===========================================================================
  // OPERATOR METADATA
  // ===========================================================================

  /**
   * Plain-English labels for all 8 LogicOperator values.
   * Displayed in the operator <select> inside CONDITION rows.
   */
  const OPERATOR_LABELS: Record<LogicOperator, string> = {
    '==':          'equals',
    '!=':          'does not equal',
    '>=':          'is at least',
    '<=':          'is at most',
    'includes':    'includes',
    'not_includes':'does not include',
    'has_tag':     'has tag',
    'missing_tag': 'missing tag',
  };

  const ALL_OPERATORS = Object.keys(OPERATOR_LABELS) as LogicOperator[];

  /**
   * Returns true when the operator expects a numeric value.
   * Drives the adaptive value input (number spinner vs. text vs. tag picker).
   */
  function isNumericOperator(op: LogicOperator): boolean {
    return op === '>=' || op === '<=';
  }

  /**
   * Returns true when the operator works on tag arrays.
   * Drives the TagPickerModal button for the value field.
   */
  function isTagOperator(op: LogicOperator): boolean {
    return op === 'has_tag' || op === 'missing_tag';
  }

  // ===========================================================================
  // KNOWN @-PATHS (autocomplete datalist)
  // ===========================================================================

  /**
   * All known @-paths from ARCHITECTURE.md §4.3.
   * Presented as a <datalist> so the GM can type the start of a path and
   * browser autocomplete narrows the list — no extra JS needed.
   *
   * WHY STATIC HERE?
   *   Skill paths are dynamic (@skills.<id>.ranks), but listing every SRD skill
   *   here gives the GM enough autocomplete coverage for core prerequisites.
   *   Power users can type any custom path — the input is always freeform.
   */
  const KNOWN_PATHS: string[] = [
    // Ability scores
    '@attributes.stat_str.totalValue',
    '@attributes.stat_str.derivedModifier',
    '@attributes.stat_str.baseValue',
    '@attributes.stat_dex.totalValue',
    '@attributes.stat_dex.derivedModifier',
    '@attributes.stat_dex.baseValue',
    '@attributes.stat_con.totalValue',
    '@attributes.stat_con.derivedModifier',
    '@attributes.stat_con.baseValue',
    '@attributes.stat_int.totalValue',
    '@attributes.stat_int.derivedModifier',
    '@attributes.stat_int.baseValue',
    '@attributes.stat_wis.totalValue',
    '@attributes.stat_wis.derivedModifier',
    '@attributes.stat_wis.baseValue',
    '@attributes.stat_cha.totalValue',
    '@attributes.stat_cha.derivedModifier',
    '@attributes.stat_cha.baseValue',
    // Combat
    '@combatStats.bab.totalValue',
    '@combatStats.ac_normal.totalValue',
    '@combatStats.ac_touch.totalValue',
    '@combatStats.ac_flat_footed.totalValue',
    '@combatStats.init.totalValue',
    '@combatStats.grapple.totalValue',
    '@combatStats.max_hp.totalValue',
    '@combatStats.speed_land.totalValue',
    // Saves
    '@saves.fort.totalValue',
    '@saves.ref.totalValue',
    '@saves.will.totalValue',
    // Level
    '@characterLevel',
    '@eclForXp',
    // Tags
    '@activeTags',
    '@equippedWeaponTags',
    '@targetTags',
    // Skills (common SRD skills — freeform entry for others)
    '@skills.skill_balance.ranks',      '@skills.skill_balance.totalValue',
    '@skills.skill_bluff.ranks',        '@skills.skill_bluff.totalValue',
    '@skills.skill_climb.ranks',        '@skills.skill_climb.totalValue',
    '@skills.skill_concentration.ranks','@skills.skill_concentration.totalValue',
    '@skills.skill_diplomacy.ranks',    '@skills.skill_diplomacy.totalValue',
    '@skills.skill_disable_device.ranks',
    '@skills.skill_disguise.ranks',
    '@skills.skill_escape_artist.ranks',
    '@skills.skill_handle_animal.ranks',
    '@skills.skill_heal.ranks',         '@skills.skill_heal.totalValue',
    '@skills.skill_hide.ranks',         '@skills.skill_hide.totalValue',
    '@skills.skill_intimidate.ranks',   '@skills.skill_intimidate.totalValue',
    '@skills.skill_jump.ranks',         '@skills.skill_jump.totalValue',
    '@skills.skill_knowledge_arcana.ranks',
    '@skills.skill_knowledge_dungeoneering.ranks',
    '@skills.skill_knowledge_history.ranks',
    '@skills.skill_knowledge_local.ranks',
    '@skills.skill_knowledge_nature.ranks',
    '@skills.skill_knowledge_planes.ranks',
    '@skills.skill_knowledge_religion.ranks',
    '@skills.skill_listen.ranks',       '@skills.skill_listen.totalValue',
    '@skills.skill_move_silently.ranks',
    '@skills.skill_open_lock.ranks',
    '@skills.skill_perform.ranks',
    '@skills.skill_ride.ranks',
    '@skills.skill_search.ranks',
    '@skills.skill_sense_motive.ranks',
    '@skills.skill_sleight_of_hand.ranks',
    '@skills.skill_spellcraft.ranks',   '@skills.skill_spellcraft.totalValue',
    '@skills.skill_spot.ranks',         '@skills.skill_spot.totalValue',
    '@skills.skill_survival.ranks',     '@skills.skill_survival.totalValue',
    '@skills.skill_swim.ranks',
    '@skills.skill_tumble.ranks',       '@skills.skill_tumble.totalValue',
    '@skills.skill_use_magic_device.ranks',
  ];

  /**
   * A unique suffix for IDs on this instance's DOM elements.
   * Prevents id collisions when multiple ConditionNodeBuilders are on the page
   * (e.g., editing both a prerequisitesNode and a Modifier.conditionNode).
   */
  const uid = Math.random().toString(36).slice(2, 8);
  const datalistId   = `cnd-paths-${uid}`;
  const idTargetPath = `cnd-tp-${uid}`;
  const idOperator   = `cnd-op-${uid}`;
  const idValue      = `cnd-val-${uid}`;
  const idErrorMsg   = `cnd-err-${uid}`;

  // ===========================================================================
  // MUTATION HELPERS
  // ===========================================================================

  /**
   * Creates a fresh blank CONDITION node.
   * Used as the default child when the GM creates a new condition (21.2.7).
   */
  function makeBlankCondition(): LogicNodeCondition {
    return {
      logic:        'CONDITION',
      targetPath:   '@activeTags',
      operator:     'has_tag',
      value:        '',
      errorMessage: '',
    };
  }

  // ----- AND / OR helpers ----------------------------------------------------

  function handleAndOrChildChanged(
    andOrNode: LogicNodeAnd | LogicNodeOr,
    childIndex: number,
    newChild: LogicNode | undefined
  ): void {
    if (newChild === undefined) {
      // Remove the child at childIndex.
      const newNodes = andOrNode.nodes.filter((_, i) => i !== childIndex);
      // An AND/OR with no children is semantically empty → emit undefined.
      onNodeChanged(
        newNodes.length > 0
          ? { ...andOrNode, nodes: newNodes }
          : undefined
      );
    } else {
      const newNodes = [
        ...andOrNode.nodes.slice(0, childIndex),
        newChild,
        ...andOrNode.nodes.slice(childIndex + 1),
      ];
      onNodeChanged({ ...andOrNode, nodes: newNodes });
    }
  }

  // ----- NOT helper -----------------------------------------------------------

  function handleNotChildChanged(
    notNode: LogicNodeNot,
    newChild: LogicNode | undefined
  ): void {
    // NOT with no child is empty → emit undefined.
    onNodeChanged(newChild ? { ...notNode, node: newChild } : undefined);
  }

  // ----- CONDITION helpers ----------------------------------------------------

  /**
   * Patches one or more fields on the current CONDITION node and re-emits.
   * Preserves all unpatched fields.
   */
  function patchCondition(patch: Partial<LogicNodeCondition>): void {
    if (node?.logic !== 'CONDITION') return;
    onNodeChanged({ ...node, ...patch });
  }

  /**
   * Called when the operator changes.
   * Resets the `value` field if the new operator needs a different value type:
   *   → numeric operators  (>= / <=)        : reset to 0
   *   → tag operators (has_tag/missing_tag)  : reset to ''
   *   → everything else                     : keep as string (toString)
   */
  function handleOperatorChange(newOp: LogicOperator): void {
    if (node?.logic !== 'CONDITION') return;
    let newValue: unknown = node.value;
    if (isNumericOperator(newOp) && typeof newValue !== 'number') {
      newValue = 0;
    } else if (isTagOperator(newOp) && typeof newValue !== 'string') {
      newValue = '';
    } else if (!isNumericOperator(newOp) && !isTagOperator(newOp)) {
      // General string-value operator — coerce current value to string.
      newValue = String(newValue ?? '');
    }
    onNodeChanged({ ...node, operator: newOp, value: newValue });
  }

  // ===========================================================================
  // TAG PICKER STATE (for CONDITION rows with has_tag / missing_tag)
  // ===========================================================================

  /**
   * Whether the TagPickerModal is currently open.
   * Only relevant when the CONDITION node's operator is has_tag or missing_tag.
   */
  let showTagPicker = $state(false);

  // ===========================================================================
  // VISUAL HELPER
  // ===========================================================================

  /**
   * Left-border colour for AND/OR/NOT containers, keyed by logic type.
   * Gives quick visual differentiation between nesting levels and combinators.
   */
  function containerBorderColor(logic: 'AND' | 'OR' | 'NOT'): string {
    if (logic === 'AND') return 'border-l-blue-500/60';
    if (logic === 'OR')  return 'border-l-purple-500/60';
    return 'border-l-red-500/60'; // NOT
  }
</script>

<!-- ============================================================ -->
<!-- DATALIST for targetPath autocomplete                          -->
<!-- ============================================================ -->
<!--
  Rendered once per ConditionNodeBuilder instance.
  Each instance generates a unique datalistId to avoid cross-component
  autocomplete pollution when multiple builders are on the same page.
-->
<datalist id={datalistId}>
  {#each KNOWN_PATHS as path (path)}
    <option value={path}></option>
  {/each}
</datalist>

<!-- ============================================================ -->
<!-- MAIN RENDER                                                   -->
<!-- ============================================================ -->

{#if node === undefined}
  <!-- ── EMPTY STATE ───────────────────────────────────────────────────── -->
  <!--
    Shown at the root when no condition has been set yet, or transiently when
    the last child is deleted from AND/OR.
    21.2.7 will place an "+ Add Condition" button here.
  -->
  <div class="flex items-center gap-2 py-2 px-3 rounded border border-dashed
              border-border text-xs text-text-muted italic">
    No conditions. <!-- ← 21.2.7: "+ Add Condition" button goes here -->
  </div>

{:else if node.logic === 'AND' || node.logic === 'OR'}
  <!-- ── AND / OR CONTAINER ────────────────────────────────────────────── -->
  {@const isAnd = node.logic === 'AND'}
  <div class="flex flex-col gap-0 rounded-lg border border-border
              border-l-4 {containerBorderColor(node.logic)} overflow-hidden">

    <!-- Header row -->
    <div class="flex items-center justify-between px-3 py-2 bg-surface-alt gap-2">
      <div class="flex items-center gap-2 flex-1">
        <!--
          Node-type label.
          21.2.7 will replace this <span> with a clickable toggle button.
        -->
        <span class="text-xs font-bold uppercase tracking-wider
                     {isAnd ? 'text-blue-400' : 'text-purple-400'}">
          {isAnd ? 'All of these (AND)' : 'Any of these (OR)'}
        </span>
        <!-- ← 21.2.7: AND↔OR switcher button goes here -->
      </div>

      <!-- Delete this entire AND/OR group -->
      <button
        type="button"
        class="btn-ghost btn-icon text-text-muted hover:text-danger shrink-0"
        onclick={() => onNodeChanged(undefined)}
        title="Delete this {node.logic} group"
        aria-label="Delete {node.logic} group"
      >
        <!-- Trash icon -->
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
        <div class="flex flex-col gap-0">
          <!-- ← 21.2.7: ▲/▼ reorder buttons go alongside each child -->
          <ConditionNodeBuilder
            node={child}
            depth={depth + 1}
            onNodeChanged={(newChild) => handleAndOrChildChanged(node, i, newChild)}
          />
        </div>
      {/each}

      <!-- ← 21.2.7: "+ Add Condition" and "+ Add Group" buttons go here -->
    </div>
  </div>

{:else if node.logic === 'NOT'}
  <!-- ── NOT CONTAINER ─────────────────────────────────────────────────── -->
  <div class="flex flex-col gap-0 rounded-lg border border-border
              border-l-4 {containerBorderColor('NOT')} overflow-hidden">

    <!-- Header -->
    <div class="flex items-center justify-between px-3 py-2 bg-surface-alt gap-2">
      <span class="text-xs font-bold uppercase tracking-wider text-red-400">
        NOT — None of these
      </span>
      <button
        type="button"
        class="btn-ghost btn-icon text-text-muted hover:text-danger shrink-0"
        onclick={() => onNodeChanged(undefined)}
        title="Delete NOT group"
        aria-label="Delete NOT group"
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

    <!-- Single child -->
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
  <!--
    Rendered as a compact horizontal row of inputs on desktop.
    Stacks vertically on mobile.
    Fields: [targetPath] [operator ▼] [value] [errorMessage] [🗑]
  -->

  <!-- TagPickerModal — mounted only when operator is has_tag / missing_tag -->
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

    <!-- ① targetPath input with @-path autocomplete -->
    <div class="flex flex-col gap-0.5 flex-1 min-w-0">
      <label for={idTargetPath}
             class="text-[10px] text-text-muted uppercase tracking-wider font-semibold">
        Target path
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
        Operator
      </label>
      <select
        id={idOperator}
        class="input text-xs pr-6"
        value={node.operator}
        onchange={(e) => handleOperatorChange((e.currentTarget as HTMLSelectElement).value as LogicOperator)}
      >
        {#each ALL_OPERATORS as op (op)}
          <option value={op}>{OPERATOR_LABELS[op]}</option>
        {/each}
      </select>
    </div>

    <!-- ③ Adaptive value field -->
    <div class="flex flex-col gap-0.5 flex-1 min-w-0">
      <label for={idValue}
             class="text-[10px] text-text-muted uppercase tracking-wider font-semibold">
        Value
      </label>

      {#if isNumericOperator(node.operator)}
        <!-- Number spinner for >= / <= -->
        <input
          id={idValue}
          type="number"
          class="input text-xs w-full"
          value={typeof node.value === 'number' ? node.value : 0}
          oninput={(e) => patchCondition({ value: Number((e.currentTarget as HTMLInputElement).value) })}
        />

      {:else if isTagOperator(node.operator)}
        <!-- Tag picker button for has_tag / missing_tag -->
        <!-- label links to the button via the same idValue -->
        <button
          id={idValue}
          type="button"
          class="input text-xs text-left w-full truncate
                 {node.value ? 'text-text-primary font-mono' : 'text-text-muted italic'}"
          onclick={() => (showTagPicker = true)}
          title="Click to open tag picker"
        >
          {node.value ? String(node.value) : 'Click to pick a tag…'}
        </button>

      {:else}
        <!-- Plain text for ==, !=, includes, not_includes -->
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
        Error message
      </label>
      <input
        id={idErrorMsg}
        type="text"
        class="input text-xs w-full"
        value={node.errorMessage ?? ''}
        placeholder="e.g. Requires Strength 13+"
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
        title="Delete this condition"
        aria-label="Delete condition"
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
