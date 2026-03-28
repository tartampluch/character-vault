<!--
  @file src/lib/components/content-editor/ActivationEditor.svelte
  @description Editor for Feature.activation — action type, resource cost, and
  tiered costs for active abilities.

  ────────────────────────────────────────────────────────────────────────────
  PURPOSE
  ────────────────────────────────────────────────────────────────────────────
  Passive features (races, feats with permanent bonuses) have no `activation`
  field. Active abilities (Barbarian Rage, Ring of the Ram, Turn Undead) do.

  This component is rendered inside EntityForm for any entity that might need
  an activation. It starts COLLAPSED behind a checkbox toggle to avoid visual
  clutter for purely passive content. Once enabled:

    actionType       — 10-value dropdown (standard, move, swift, immediate, free,
                       full_round, minutes, hours, passive, reaction)
    triggerEvent     — text input, visible ONLY for reaction; describes what triggers
                       the automatic activation (e.g. "When targeted by an attack")
    resourceCost     — fixed-cost field pair:
                         targetId  (opens PipelinePickerModal — resource pool ID)
                         cost      (FormulaBuilderInput — number or formula)
    tieredResourceCosts — variable-spend tiers (Ring of the Ram pattern):
                         each tier: label EN/FR, targetPoolId, cost, modifier count

  Exactly ONE of resourceCost / tieredResourceCosts should be set.  The editor
  shows a radio selector ("Fixed cost" / "Tiered costs" / "No cost") to switch
  between modes; only the active section is shown.

  ────────────────────────────────────────────────────────────────────────────
  ACTION TYPE LABELS (per ARCHITECTURE.md §5.5)
  ────────────────────────────────────────────────────────────────────────────
    standard   — Standard Action      (1/round, most activated abilities)
    move       — Move Action          (e.g. guided movement, swift draw)
    swift      — Swift Action         (1/round; minor in-combat abilities)
    immediate  — Immediate Action     (1/round outside own turn; expensive)
    free       — Free Action          (effectively no cost in-round)
    full_round — Full-Round Action    (takes the entire round)
    minutes    — Several Minutes      (non-combat ritual-like activation)
    hours      — Hours                (long rituals, item creation, etc.)
    passive    — Passive / Always-On  (no activation needed; always active)
    reaction   — Reaction             (fires automatically on trigger event)

  ────────────────────────────────────────────────────────────────────────────
  TIERED COSTS vs. FIXED COST
  ────────────────────────────────────────────────────────────────────────────
  D&D 3.5 charged items often allow spending MORE charges for stronger effects:
    Ring of the Ram: 1 charge → 1d6; 2 charges → 2d6+1 bull rush; 3 charges → 3d6+2
  This is modelled as `tieredResourceCosts: ActivationTier[]`.  Each tier has:
    label (EN/FR), targetPoolId, cost (FormulaBuilderInput), grantedModifiers[] (count)

  Per-tier modifier editing opens `LevelModifierModal` (reused from LevelProgressionEditor)
  to provide an isolated ModifierListEditor context.

  ────────────────────────────────────────────────────────────────────────────
  @see src/lib/types/feature.ts  for activation, ActivationTier types
  @see editorContext.ts          for EditorContext
  @see LevelModifierModal.svelte for per-tier modifier editing
  @see ARCHITECTURE.md §5.5      for action type and activation specification
-->

<script lang="ts">
  import { getContext } from 'svelte';
  import { EDITOR_CONTEXT_KEY, type EditorContext } from './editorContext';
  import FormulaBuilderInput  from './FormulaBuilderInput.svelte';
  import PipelinePickerModal  from './PipelinePickerModal.svelte';
  import TieredCostsEditor    from './TieredCostsEditor.svelte';

  // ===========================================================================
  // CONTEXT
  // ===========================================================================

  const ctx = getContext<EditorContext>(EDITOR_CONTEXT_KEY);

  // ===========================================================================
  // ACTION TYPE METADATA
  // ===========================================================================

  type ActionType =
    | 'standard' | 'move' | 'swift' | 'immediate' | 'free'
    | 'full_round' | 'minutes' | 'hours' | 'passive' | 'reaction';

  const ACTION_TYPES: Array<{ value: ActionType; label: string; hint: string }> = [
    { value: 'standard',   label: 'Standard Action',    hint: '1 per round — most activated abilities' },
    { value: 'move',       label: 'Move Action',        hint: 'e.g. guided movement, swift draw' },
    { value: 'swift',      label: 'Swift Action',       hint: '1 per round; minor in-combat abilities' },
    { value: 'immediate',  label: 'Immediate Action',   hint: '1 per round; usable outside own turn' },
    { value: 'free',       label: 'Free Action',        hint: 'Effectively no action cost during round' },
    { value: 'full_round', label: 'Full-Round Action',  hint: 'Consumes the entire turn' },
    { value: 'minutes',    label: 'Several Minutes',    hint: 'Non-combat ritual or extended activation' },
    { value: 'hours',      label: 'Hours',              hint: 'Long ritual, item creation, etc.' },
    { value: 'passive',    label: 'Passive / Always-On',hint: 'No activation needed; ability is always active' },
    { value: 'reaction',   label: 'Reaction',           hint: 'Fires automatically on a trigger event' },
  ];

  // Suggested trigger events for the reaction field
  const REACTION_SUGGESTIONS = [
    'When targeted by an attack',
    'When an ally within 30 ft. is hit',
    'When a spell is cast within range',
    'When reduced below half HP',
    'When entering a threatened square',
    'When damage would reduce HP to 0',
  ];

  // ===========================================================================
  // COST MODE
  // ===========================================================================

  type CostMode = 'none' | 'fixed' | 'tiered';

  /**
   * Derives the current cost mode from the feature's activation state.
   * Used to initialise the radio selector; not stored in the feature itself.
   */
  function currentCostMode(): CostMode {
    const act = ctx.feature.activation;
    if (!act) return 'none';
    if (act.tieredResourceCosts && act.tieredResourceCosts.length > 0) return 'tiered';
    if (act.resourceCost) return 'fixed';
    return 'none';
  }

  let costMode = $state<CostMode>(currentCostMode());

  /**
   * Switches cost mode: clears fields that belong to the old mode.
   */
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

  // ===========================================================================
  // ACTIVATION TOGGLE
  // ===========================================================================

  /**
   * Whether the activation section is enabled at all.
   * Toggling off removes `activation` from the feature entirely.
   */
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

  // ===========================================================================
  // PIPELINE PICKER MODAL STATE
  // ===========================================================================

  type ModalState = { kind: 'pipeline-fixed' } | null;

  let modalState = $state<ModalState>(null);

  // Unique uid for label->input ids
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
      <span class="text-sm font-semibold text-text-primary">Has activation cost or action type</span>
      <span class="text-[11px] text-text-muted">
        Enable for active abilities (Barbarian Rage, Turn Undead, charged items).
        Leave off for passive features (racial bonuses, permanent feat effects).
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
          Action Type
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
            Trigger Event
            <span class="ml-1 text-[9px] font-normal normal-case text-text-muted">
              (describes what causes this ability to fire)
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
          Resource Cost
        </legend>

        <div class="flex flex-wrap gap-3">
          {#each ([['none','No cost'],['fixed','Fixed cost'],['tiered','Tiered costs']] as const) as [mode, lbl]}
            <label class="flex items-center gap-1.5 cursor-pointer text-xs">
              <input
                type="radio"
                name={fid('cost-mode')}
                class="accent-accent"
                value={mode}
                checked={costMode === mode}
                onchange={() => setCostMode(mode)}
              />
              {lbl}
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
                Resource Pool ID
              </label>
              <button
                id={fid('rc-pool')}
                type="button"
                class="input text-xs text-left font-mono
                       {act.resourceCost?.targetId ? 'text-text-primary' : 'text-text-muted italic'}"
                onclick={() => (modalState = { kind: 'pipeline-fixed' })}
                title="Click to pick a resource pool pipeline"
              >
                {act.resourceCost?.targetId || 'Click to pick pool pipeline…'}
              </button>
            </div>
            <!-- Cost formula -->
            <div class="flex flex-col gap-1">
              <label for={fid('rc-cost')}
                     class="text-[10px] text-text-muted font-semibold uppercase tracking-wider">
                Cost per use
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
