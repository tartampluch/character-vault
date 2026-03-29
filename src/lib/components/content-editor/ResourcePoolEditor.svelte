<!--
  @file src/lib/components/content-editor/ResourcePoolEditor.svelte
  @description Editor for Feature.resourcePoolTemplates — per-instance charge/use pools.

  ────────────────────────────────────────────────────────────────────────────
  PURPOSE
  ────────────────────────────────────────────────────────────────────────────
  Charged items and use-limited class abilities declare template pools that are
  stamped onto each ActiveFeatureInstance when the item is first equipped or the
  ability first activates.  Examples:

    Ring of the Ram          — "charges", max: 50, resetCondition: "never"
    Ring of Djinni Calling   — "daily_call", max: 1, resetCondition: "per_day"
    Wand of Magic Missile    — "charges", max: 50, resetCondition: "never"
    Healing Keg (homebrew)   — "uses", max: 3, resetCondition: "per_day"

  Each `ResourcePoolTemplate` has:
    poolId          — short slug key (references itemResourcePools key)
    label           — EN + FR display name on item card
    maxPipelineId   — pipeline computing the maximum (opens PipelinePickerModal)
    defaultCurrent  — charge count when the item is first created/found
    resetCondition  — 8 values with plain-English names
    rechargeAmount  — formula (only visible for "per_turn" / "per_round")

  ────────────────────────────────────────────────────────────────────────────
  RESET CONDITIONS (8 values — per ARCHITECTURE.md §5.7 / pipeline.ts)
  ────────────────────────────────────────────────────────────────────────────
    long_rest   Long Rest          (8 hours sleep/rest — HP and spells)
    short_rest  Short Rest         (house-rule variant; non-default D&D 3.5)
    encounter   Per Encounter      (resets at start of each combat)
    never       Never              (finite charges; Ring of the Ram, wands)
    per_day     Per Day (at dawn)  (calendar-based; X/day items regardless of sleep)
    per_week    Per Week           (calendar-based weekly abilities)
    per_turn    Per Turn           (recharges at start of character's own turn)
    per_round   Per Round          (recharges at a fixed point each round)

  The `rechargeAmount` field is only meaningful for `per_turn` / `per_round` and is
  shown/hidden dynamically.

  ────────────────────────────────────────────────────────────────────────────
  @see src/lib/types/feature.ts    for ResourcePoolTemplate interface
  @see src/lib/types/pipeline.ts   for ResourcePool.resetCondition union
  @see editorContext.ts            for EditorContext
  @see ARCHITECTURE.md §5.7        for item resource pool design
-->

<script lang="ts">
  import { getContext } from 'svelte';
  import { EDITOR_CONTEXT_KEY, type EditorContext } from './editorContext';
  import type { ResourcePoolTemplate } from '$lib/types/feature';
  import type { ResourcePool } from '$lib/types/pipeline';
  import PipelinePickerModal from './PipelinePickerModal.svelte';
  import FormulaBuilderInput from './FormulaBuilderInput.svelte';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';

  // ===========================================================================
  // CONTEXT
  // ===========================================================================

  const ctx = getContext<EditorContext>(EDITOR_CONTEXT_KEY);
  const lang = $derived(engine.settings.language);

  // ===========================================================================
  // RESET CONDITION METADATA
  // ===========================================================================

  type ResetCondition = ResourcePool['resetCondition'];

  const RESET_CONDITIONS = $derived<Array<{ value: ResetCondition; label: string; hint: string }>>([
    { value: 'never',      label: ui('reset_condition.never.label',       lang), hint: ui('reset_condition.never.hint',       lang) },
    { value: 'per_day',    label: ui('reset_condition.per_day.label',     lang), hint: ui('reset_condition.per_day.hint',     lang) },
    { value: 'long_rest',  label: ui('reset_condition.long_rest.label',   lang), hint: ui('reset_condition.long_rest.hint',   lang) },
    { value: 'short_rest', label: ui('reset_condition.short_rest.label',  lang), hint: ui('reset_condition.short_rest.hint',  lang) },
    { value: 'encounter',  label: ui('reset_condition.encounter.label',   lang), hint: ui('reset_condition.encounter.hint',   lang) },
    { value: 'per_week',   label: ui('reset_condition.per_week.label',    lang), hint: ui('reset_condition.per_week.hint',    lang) },
    { value: 'per_turn',   label: ui('reset_condition.per_turn.label',    lang), hint: ui('reset_condition.per_turn.hint',    lang) },
    { value: 'per_round',  label: ui('reset_condition.per_round.label',   lang), hint: ui('reset_condition.per_round.hint',   lang) },
  ]);

  /** Returns true when the reset condition supports / requires a rechargeAmount. */
  function needsRechargeAmount(c: ResetCondition): boolean {
    return c === 'per_turn' || c === 'per_round';
  }

  // ===========================================================================
  // FACTORY
  // ===========================================================================

  function makeBlankPool(): ResourcePoolTemplate {
    return {
      poolId:         '',
      label:          { en: '' },
      maxPipelineId:  '',
      defaultCurrent: 0,
      resetCondition: 'never',
    };
  }

  // ===========================================================================
  // MUTATIONS (immutable array updates)
  // ===========================================================================

  function addPool(): void {
    ctx.feature.resourcePoolTemplates = [
      ...(ctx.feature.resourcePoolTemplates ?? []),
      makeBlankPool(),
    ];
  }

  function deletePool(i: number): void {
    ctx.feature.resourcePoolTemplates = (ctx.feature.resourcePoolTemplates ?? [])
      .filter((_, k) => k !== i);
  }

  function patchPool(i: number, patch: Partial<ResourcePoolTemplate>): void {
    const arr = [...(ctx.feature.resourcePoolTemplates ?? [])];
    arr[i] = { ...arr[i], ...patch };
    ctx.feature.resourcePoolTemplates = arr;
  }

  function setPoolLabel(i: number, lang: string, value: string): void {
    const pool = (ctx.feature.resourcePoolTemplates ?? [])[i];
    if (!pool) return;
    patchPool(i, { label: { ...(pool.label as Record<string,string>), [lang]: value } });
  }

  // ===========================================================================
  // PIPELINE PICKER STATE
  // ===========================================================================

  let pickerOpenForIndex = $state<number | null>(null);

  // Unique uid for label->input ids
  const uid = Math.random().toString(36).slice(2, 7);
  const fid = (name: string) => `rpe-${uid}-${name}`;
</script>

<!-- Pipeline picker modal -->
{#if pickerOpenForIndex !== null}
  {@const idx = pickerOpenForIndex}
  <PipelinePickerModal
    onPipelinePicked={(id) => { patchPool(idx, { maxPipelineId: id }); pickerOpenForIndex = null; }}
    onclose={() => (pickerOpenForIndex = null)}
  />
{/if}

<!-- ======================================================================= -->
<!-- MAIN RENDER                                                               -->
<!-- ======================================================================= -->
<div class="flex flex-col gap-3">

  <!-- Header -->
  <div class="flex items-center justify-between">
    <div class="flex flex-col gap-0.5">
      <span class="text-sm font-semibold text-text-primary">
        {ui('content_editor.pool.section_title', lang)}
        {#if (ctx.feature.resourcePoolTemplates ?? []).length > 0}
          <span class="ml-1.5 text-xs font-normal text-text-muted badge">
            {ctx.feature.resourcePoolTemplates?.length}
          </span>
        {/if}
      </span>
      <span class="text-[11px] text-text-muted">
        {ui('content_editor.pool.section_desc', lang)}
      </span>
    </div>
    <button
      type="button"
      class="btn-primary text-xs py-1 px-3 h-auto shrink-0"
      onclick={addPool}
    >
      {ui('content_editor.pool.add', lang)}
    </button>
  </div>

  <!-- Empty state -->
  {#if (ctx.feature.resourcePoolTemplates ?? []).length === 0}
    <div class="rounded border border-dashed border-border px-4 py-5 text-center">
      <p class="text-xs text-text-muted italic">{ui('content_editor.pool.empty', lang)}</p>
      <p class="text-xs text-text-muted mt-1">
        {ui('content_editor.pool.empty_hint', lang)}
      </p>
    </div>

  {:else}
    <!-- Pool entries -->
    {#each (ctx.feature.resourcePoolTemplates ?? []) as pool, i (i)}
      {@const recharge = needsRechargeAmount(pool.resetCondition)}
      <div class="flex flex-col gap-3 rounded-lg border border-border bg-surface-alt p-4">

        <!-- Entry header: index + delete -->
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold text-text-muted uppercase tracking-wider">
            {ui('content_editor.pool.entry_label', lang).replace('{n}', String(i + 1))}
            {#if pool.poolId}
              <code class="ml-1 font-mono text-[9px] opacity-60">{pool.poolId}</code>
            {/if}
          </span>
          <button
            type="button"
            class="btn-ghost btn-icon h-7 w-7 p-0 text-text-muted hover:text-danger"
            onclick={() => deletePool(i)}
            aria-label={ui('content_editor.pool.entry_label', lang).replace('{n}', String(i + 1)) + ' — ' + ui('common.delete', lang)}
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

          <!-- poolId -->
          <div class="flex flex-col gap-1">
            <label
              for={fid(`pid-${i}`)}
              class="text-[10px] font-semibold uppercase tracking-wider text-text-muted"
            >
              {ui('content_editor.pool.pool_id_label', lang)}
            </label>
            <input
              id={fid(`pid-${i}`)}
              type="text"
              class="input font-mono text-xs"
              value={pool.poolId}
              placeholder={ui('content_editor.pool.pool_id_placeholder', lang)}
              oninput={(e) => patchPool(i, { poolId: (e.currentTarget as HTMLInputElement).value })}
              autocomplete="off"
              spellcheck="false"
            />
            <p class="text-[10px] text-text-muted">
              {ui('content_editor.pool.pool_id_desc', lang)}
            </p>
          </div>

          <!-- defaultCurrent -->
          <div class="flex flex-col gap-1">
            <label
              for={fid(`def-${i}`)}
              class="text-[10px] font-semibold uppercase tracking-wider text-text-muted"
            >
              {ui('content_editor.pool.default_current_label', lang)}
            </label>
            <input
              id={fid(`def-${i}`)}
              type="number"
              class="input text-xs w-28"
              min="0"
              value={pool.defaultCurrent}
              oninput={(e) => patchPool(i, {
                defaultCurrent: parseInt((e.currentTarget as HTMLInputElement).value) || 0
              })}
            />
            <p class="text-[10px] text-text-muted">
              {ui('content_editor.pool.default_current_desc', lang)}
            </p>
          </div>

          <!-- Label EN -->
          <div class="flex flex-col gap-1">
            <label
              for={fid(`lbl-en-${i}`)}
              class="text-[10px] font-semibold uppercase tracking-wider text-text-muted"
            >
              {ui('content_editor.pool.label_en', lang)}
            </label>
            <input
              id={fid(`lbl-en-${i}`)}
              type="text"
              class="input text-sm"
              value={(pool.label as Record<string,string>)?.['en'] ?? ''}
              placeholder={ui('content_editor.pool.label_en_placeholder', lang)}
              oninput={(e) => setPoolLabel(i, 'en', (e.currentTarget as HTMLInputElement).value)}
            />
          </div>

          <!-- Label FR -->
          <div class="flex flex-col gap-1">
            <label
              for={fid(`lbl-fr-${i}`)}
              class="text-[10px] font-semibold uppercase tracking-wider text-text-muted"
            >
              {ui('content_editor.pool.label_fr', lang)}
            </label>
            <input
              id={fid(`lbl-fr-${i}`)}
              type="text"
              class="input text-sm"
              value={(pool.label as Record<string,string>)?.['fr'] ?? ''}
              placeholder={ui('content_editor.pool.label_fr_placeholder', lang)}
              oninput={(e) => setPoolLabel(i, 'fr', (e.currentTarget as HTMLInputElement).value)}
            />
          </div>

          <!-- maxPipelineId (PipelinePickerModal) -->
          <div class="flex flex-col gap-1 md:col-span-2">
            <label
              for={fid(`maxpl-${i}`)}
              class="text-[10px] font-semibold uppercase tracking-wider text-text-muted"
            >
              {ui('content_editor.pool.max_pipeline_label', lang)}
            </label>
            <button
              id={fid(`maxpl-${i}`)}
              type="button"
              class="input text-xs text-left flex items-center gap-2 font-mono
                     {pool.maxPipelineId ? 'text-text-primary' : 'text-text-muted italic'}"
              onclick={() => (pickerOpenForIndex = i)}
              title={ui('content_editor.pool.max_pipeline_title', lang)}
            >
              {pool.maxPipelineId || ui('content_editor.pool.max_pipeline_empty', lang)}
              <svg class="h-3 w-3 text-text-muted ml-auto shrink-0"
                   xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
                   fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <p class="text-[10px] text-text-muted">
              {@html ui('content_editor.pool.max_pipeline_help', lang)}
            </p>
          </div>

          <!-- resetCondition -->
          <div class="flex flex-col gap-1 {recharge ? '' : 'md:col-span-2'}">
            <label
              for={fid(`rst-${i}`)}
              class="text-[10px] font-semibold uppercase tracking-wider text-text-muted"
            >
              {ui('content_editor.pool.reset_condition_label', lang)}
            </label>
            <select
              id={fid(`rst-${i}`)}
              class="input text-sm"
              value={pool.resetCondition}
              onchange={(e) => {
                const newCond = (e.currentTarget as HTMLSelectElement).value as ResetCondition;
                const update: Partial<ResourcePoolTemplate> = { resetCondition: newCond };
                if (!needsRechargeAmount(newCond)) update.rechargeAmount = undefined;
                patchPool(i, update);
              }}
            >
              {#each RESET_CONDITIONS as rc (rc.value)}
                <option value={rc.value}>{rc.label} — {rc.hint}</option>
              {/each}
            </select>
          </div>

          <!-- rechargeAmount (per_turn / per_round only) -->
          {#if recharge}
            <div class="flex flex-col gap-1">
              <label
                for={fid(`rech-${i}`)}
                class="text-[10px] font-semibold uppercase tracking-wider text-text-muted"
              >
                {ui('content_editor.pool.recharge_amount_label', lang)}
                <span class="ml-1 text-[9px] font-normal normal-case text-text-muted">
                  {pool.resetCondition === 'per_turn'
                    ? ui('content_editor.pool.recharge_restored_turn', lang)
                    : ui('content_editor.pool.recharge_restored_round', lang)}
                </span>
              </label>
              <FormulaBuilderInput
                id={fid(`rech-${i}`)}
                value={pool.rechargeAmount ?? 1}
                placeholder={ui('content_editor.pool.recharge_formula_placeholder', lang)}
                onValueChanged={(v) => {
                  const asNum = Number(v);
                  patchPool(i, {
                    rechargeAmount: (!isNaN(asNum) && v.trim() !== '') ? asNum : v
                  });
                }}
              />
            </div>
          {/if}

        </div>
      </div>
    {/each}

    <!-- Bottom add button -->
    <button type="button" class="btn-ghost text-sm w-full py-2" onclick={addPool}>
      {ui('content_editor.pool.add', lang)}
    </button>
  {/if}

</div>
