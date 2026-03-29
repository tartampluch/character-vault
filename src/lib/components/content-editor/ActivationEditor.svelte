<!--
  @file src/lib/components/content-editor/ActivationEditor.svelte
  @description Editor for Feature.activation — action type, resource cost, and
  tiered costs for active abilities.
-->

<script lang="ts">
  import { getContext } from 'svelte';
  import { EDITOR_CONTEXT_KEY, type EditorContext } from './editorContext';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import FormulaBuilderInput  from './FormulaBuilderInput.svelte';
  import PipelinePickerModal  from './PipelinePickerModal.svelte';
  import TieredCostsEditor    from './TieredCostsEditor.svelte';

  const ctx = getContext<EditorContext>(EDITOR_CONTEXT_KEY);
  const lang = $derived(engine.settings.language);

  type ActionType =
    | 'standard' | 'move' | 'swift' | 'immediate' | 'free'
    | 'full_round' | 'minutes' | 'hours' | 'passive' | 'reaction';

  const ACTION_TYPES = $derived<Array<{ value: ActionType; label: string; hint: string }>>([
    { value: 'standard',   label: ui('editor.activation.action_standard_label',   lang), hint: ui('editor.activation.action_standard_hint',   lang) },
    { value: 'move',       label: ui('editor.activation.action_move_label',       lang), hint: ui('editor.activation.action_move_hint',       lang) },
    { value: 'swift',      label: ui('editor.activation.action_swift_label',      lang), hint: ui('editor.activation.action_swift_hint',      lang) },
    { value: 'immediate',  label: ui('editor.activation.action_immediate_label',  lang), hint: ui('editor.activation.action_immediate_hint',  lang) },
    { value: 'free',       label: ui('editor.activation.action_free_label',       lang), hint: ui('editor.activation.action_free_hint',       lang) },
    { value: 'full_round', label: ui('editor.activation.action_full_round_label', lang), hint: ui('editor.activation.action_full_round_hint', lang) },
    { value: 'minutes',    label: ui('editor.activation.action_minutes_label',    lang), hint: ui('editor.activation.action_minutes_hint',    lang) },
    { value: 'hours',      label: ui('editor.activation.action_hours_label',      lang), hint: ui('editor.activation.action_hours_hint',      lang) },
    { value: 'passive',    label: ui('editor.activation.action_passive_label',    lang), hint: ui('editor.activation.action_passive_hint',    lang) },
    { value: 'reaction',   label: ui('editor.activation.action_reaction_label',   lang), hint: ui('editor.activation.action_reaction_hint',   lang) },
  ]);

  // Suggested trigger events for the reaction field (code values, not translated)
  const REACTION_SUGGESTIONS = [
    'When targeted by an attack',
    'When an ally within 30 ft. is hit',
    'When a spell is cast within range',
    'When reduced below half HP',
    'When entering a threatened square',
    'When damage would reduce HP to 0',
  ];

  type CostMode = 'none' | 'fixed' | 'tiered';

  function currentCostMode(): CostMode {
    const act = ctx.feature.activation;
    if (!act) return 'none';
    if (act.tieredResourceCosts && act.tieredResourceCosts.length > 0) return 'tiered';
    if (act.resourceCost) return 'fixed';
    return 'none';
  }

  let costMode = $state<CostMode>(currentCostMode());

  function setCostMode(mode: CostMode): void {
    costMode = mode;
    if (!ctx.feature.activation) return;
    if (mode === 'none') {
      ctx.feature.activation = {
        ...ctx.feature.activation,
        resourceCost:        undefined,
        tieredResourceCosts: undefined,
      };
    } else if (mode === 'fixed') {
      ctx.feature.activation = {
        ...ctx.feature.activation,
        tieredResourceCosts: undefined,
        resourceCost: ctx.feature.activation.resourceCost ?? { targetId: '', cost: 1 },
      };
    } else {
      ctx.feature.activation = {
        ...ctx.feature.activation,
        resourceCost: undefined,
        tieredResourceCosts: ctx.feature.activation.tieredResourceCosts ?? [],
      };
    }
  }

  let hasActivation = $state(!!ctx.feature.activation);

  function toggleActivation(enabled: boolean): void {
    hasActivation = enabled;
    if (enabled) {
      ctx.feature.activation = ctx.feature.activation ?? {
        actionType:  'standard',
        resourceCost: undefined,
        tieredResourceCosts: undefined,
        triggerEvent: undefined,
      };
    } else {
      ctx.feature.activation = undefined;
      costMode = 'none';
    }
  }

  type ModalState = { kind: 'pipeline-fixed' } | null;
  let modalState = $state<ModalState>(null);

  const uid = Math.random().toString(36).slice(2, 7);
  const fid = (name: string) => `act-${uid}-${name}`;
</script>

<!-- Pipeline picker — fixed resourceCost.targetId -->
{#if modalState?.kind === 'pipeline-fixed'}
  <PipelinePickerModal
    onPipelinePicked={(id) => {
      if (ctx.feature.activation) {
        ctx.feature.activation = {
          ...ctx.feature.activation,
          resourceCost: { ...(ctx.feature.activation.resourceCost ?? { cost: 1 }), targetId: id },
        };
      }
      modalState = null;
    }}
    onclose={() => (modalState = null)}
  />
{/if}

<!-- ======================================================================= -->
<!-- MAIN RENDER                                                               -->
<!-- ======================================================================= -->
<div class="flex flex-col gap-3">

  <!-- ── TOP TOGGLE ────────────────────────────────────────────────────────── -->
  <label class="flex items-center gap-3 cursor-pointer select-none">
    <input
      type="checkbox"
      class="h-4 w-4 accent-accent"
      checked={hasActivation}
      onchange={(e) => toggleActivation((e.currentTarget as HTMLInputElement).checked)}
    />
    <div class="flex flex-col gap-0">
      <span class="text-sm font-semibold text-text-primary">{ui('editor.activation.toggle_label', lang)}</span>
      <span class="text-[11px] text-text-muted">
        {ui('editor.activation.toggle_hint', lang)}
      </span>
    </div>
  </label>

  <!-- ── ACTIVATION BODY (only when enabled) ──────────────────────────────── -->
  {#if hasActivation && ctx.feature.activation}
    {@const act = ctx.feature.activation}

    <div class="flex flex-col gap-4 rounded-lg border border-border bg-surface-alt p-4 ml-7">

      <!-- ── ACTION TYPE ──────────────────────────────────────────────────── -->
      <div class="flex flex-col gap-1">
        <label for={fid('action')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          {ui('editor.activation.action_type_label', lang)}
        </label>
        <select
          id={fid('action')}
          class="input text-sm"
          value={act.actionType}
          onchange={(e) => {
            ctx.feature.activation = {
              ...act,
              actionType: (e.currentTarget as HTMLSelectElement).value as ActionType,
            };
          }}
        >
          {#each ACTION_TYPES as at (at.value)}
            <option value={at.value}>{at.label} — {at.hint}</option>
          {/each}
        </select>
      </div>

      <!-- ── TRIGGER EVENT (reaction only) ────────────────────────────────── -->
      {#if act.actionType === 'reaction'}
        <div class="flex flex-col gap-1">
          <label for={fid('trigger')}
                 class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            {ui('editor.activation.trigger_event_label', lang)}
            <span class="ml-1 text-[9px] font-normal normal-case text-text-muted">
              {ui('editor.activation.trigger_event_hint', lang)}
            </span>
          </label>
          <input
            id={fid('trigger')}
            type="text"
            class="input text-sm"
            value={act.triggerEvent ?? ''}
            placeholder="e.g. When targeted by an attack"
            list={fid('trigger-list')}
            oninput={(e) => {
              ctx.feature.activation = {
                ...act,
                triggerEvent: (e.currentTarget as HTMLInputElement).value || undefined,
              };
            }}
            autocomplete="off"
          />
          <datalist id={fid('trigger-list')}>
            {#each REACTION_SUGGESTIONS as s (s)}
              <option value={s}></option>
            {/each}
          </datalist>
        </div>
      {/if}

      <!-- ── RESOURCE COST MODE SELECTOR ──────────────────────────────────── -->
      <fieldset class="flex flex-col gap-2">
        <legend class="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">
          {ui('editor.activation.resource_cost_legend', lang)}
        </legend>

        <div class="flex flex-wrap gap-3">
          {#each ([
            ['none',   'editor.activation.cost_none'],
            ['fixed',  'editor.activation.cost_fixed'],
            ['tiered', 'editor.activation.cost_tiered'],
          ] as const) as [mode, lblKey]}
            <label class="flex items-center gap-1.5 cursor-pointer text-xs">
              <input
                type="radio"
                name={fid('cost-mode')}
                class="accent-accent"
                value={mode}
                checked={costMode === mode}
                onchange={() => setCostMode(mode)}
              />
              {ui(lblKey, lang)}
            </label>
          {/each}
        </div>

        <!-- Fixed cost fields -->
        {#if costMode === 'fixed'}
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
            <!-- Resource Pool ID -->
            <div class="flex flex-col gap-1">
              <label for={fid('rc-pool')}
                     class="text-[10px] text-text-muted font-semibold uppercase tracking-wider">
                {ui('editor.activation.resource_pool_id_label', lang)}
              </label>
              <button
                id={fid('rc-pool')}
                type="button"
                class="input text-xs text-left font-mono
                       {act.resourceCost?.targetId ? 'text-text-primary' : 'text-text-muted italic'}"
                onclick={() => (modalState = { kind: 'pipeline-fixed' })}
                title={ui('editor.activation.click_to_pick_pool_title', lang)}
              >
                {act.resourceCost?.targetId || ui('editor.activation.click_to_pick_pool', lang)}
              </button>
            </div>
            <!-- Cost formula -->
            <div class="flex flex-col gap-1">
              <label for={fid('rc-cost')}
                     class="text-[10px] text-text-muted font-semibold uppercase tracking-wider">
                {ui('editor.activation.cost_per_use_label', lang)}
              </label>
              <FormulaBuilderInput
                id={fid('rc-cost')}
                value={act.resourceCost?.cost ?? 1}
                placeholder="e.g. 1, 2, @attributes.stat_charisma.derivedModifier"
                onValueChanged={(v) => {
                  const asNum = Number(v);
                  const cost = (!isNaN(asNum) && v.trim() !== '') ? asNum : v;
                  ctx.feature.activation = {
                    ...act,
                    resourceCost: { ...(act.resourceCost ?? { targetId: '' }), cost },
                  };
                }}
              />
            </div>
          </div>

        <!-- Tiered costs list -->
        {:else if costMode === 'tiered'}
          <TieredCostsEditor />
        {/if}

      </fieldset>

    </div>
  {/if}

</div>
