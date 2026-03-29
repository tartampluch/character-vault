<!--
  @file src/lib/components/content-editor/TieredCostsEditor.svelte
  @description Tiered-resource-costs array editor for ActivationEditor.
-->

<script lang="ts">
  import { getContext } from 'svelte';
  import { EDITOR_CONTEXT_KEY, type EditorContext } from './editorContext';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui, uiN } from '$lib/i18n/ui-strings';
  import type { ActivationTier } from '$lib/types/feature';
  import type { Modifier } from '$lib/types/pipeline';
  import FormulaBuilderInput from './FormulaBuilderInput.svelte';
  import LevelModifierModal  from './LevelModifierModal.svelte';

  const ctx = getContext<EditorContext>(EDITOR_CONTEXT_KEY);
  const lang = $derived(engine.settings.language);

  function makeBlankTier(): ActivationTier {
    return {
      label:            { en: '' },
      targetPoolId:     '',
      cost:             1,
      grantedModifiers: [],
    };
  }

  function addTier(): void {
    if (!ctx.feature.activation) return;
    ctx.feature.activation = {
      ...ctx.feature.activation,
      tieredResourceCosts: [...(ctx.feature.activation.tieredResourceCosts ?? []), makeBlankTier()],
    };
  }

  function deleteTier(i: number): void {
    if (!ctx.feature.activation) return;
    ctx.feature.activation = {
      ...ctx.feature.activation,
      tieredResourceCosts: (ctx.feature.activation.tieredResourceCosts ?? []).filter((_, k) => k !== i),
    };
  }

  function patchTier(i: number, patch: Partial<ActivationTier>): void {
    if (!ctx.feature.activation) return;
    const tiers = [...(ctx.feature.activation.tieredResourceCosts ?? [])];
    tiers[i] = { ...tiers[i], ...patch };
    ctx.feature.activation = { ...ctx.feature.activation, tieredResourceCosts: tiers };
  }

  function setTierLabel(i: number, langCode: string, value: string): void {
    const tier = ctx.feature.activation?.tieredResourceCosts?.[i];
    if (!tier) return;
    patchTier(i, { label: { ...(tier.label as Record<string, string>), [langCode]: value } });
  }

  type ModalState = { kind: 'tier-modifiers'; tierIndex: number; modifiers: Modifier[] } | null;
  let modalState = $state<ModalState>(null);

  const uid = Math.random().toString(36).slice(2, 7);
  const fid = (name: string) => `tce-${uid}-${name}`;
</script>

<!-- Per-tier modifier editor -->
{#if modalState?.kind === 'tier-modifiers'}
  {@const ti = modalState.tierIndex}
  <LevelModifierModal
    levelNumber={ti + 1}
    initialModifiers={modalState.modifiers}
    parentFeatureId={ctx.feature.id}
    parentFeatureLabelEn={(ctx.feature.label as Record<string, string>)?.['en'] ?? ''}
    onModifiersSaved={(mods) => { patchTier(ti, { grantedModifiers: mods }); modalState = null; }}
    onclose={() => (modalState = null)}
  />
{/if}

<!-- ======================================================================= -->
<!-- TIERED COSTS LIST                                                         -->
<!-- ======================================================================= -->
<div class="flex flex-col gap-2 mt-2">
  <p class="text-[11px] text-text-muted">
    {ui('editor.tiered_costs.intro', lang)}
  </p>

  {#each (ctx.feature.activation?.tieredResourceCosts ?? []) as tier, i (i)}
    <div class="flex flex-col gap-2 rounded border border-border bg-surface p-3">

      <div class="flex items-center justify-between">
        <span class="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
          {ui('editor.tiered_costs.tier_label', lang).replace('{n}', String(i + 1))}
        </span>
        <button
          type="button"
          class="btn-ghost btn-icon h-6 w-6 p-0 text-text-muted hover:text-danger"
          onclick={() => deleteTier(i)}
          aria-label={ui('editor.tiered_costs.delete_aria', lang).replace('{n}', String(i + 1))}
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

      <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
        <!-- Label EN -->
        <div class="flex flex-col gap-1">
          <label for={fid(`tier-lbl-en-${i}`)}
                 class="text-[10px] text-text-muted font-semibold uppercase tracking-wider">
            {ui('editor.tiered_costs.label_en', lang)}
          </label>
          <input
            id={fid(`tier-lbl-en-${i}`)}
            type="text"
            class="input text-xs"
            value={(tier.label as Record<string, string>)?.['en'] ?? ''}
             placeholder={ui('editor.tiered_costs.label_en_placeholder', lang)}
            oninput={(e) => setTierLabel(i, 'en', (e.currentTarget as HTMLInputElement).value)}
          />
        </div>

        <!-- Label FR -->
        <div class="flex flex-col gap-1">
          <label for={fid(`tier-lbl-fr-${i}`)}
                 class="text-[10px] text-text-muted font-semibold uppercase tracking-wider">
            {ui('editor.tiered_costs.label_fr', lang)}
          </label>
          <input
            id={fid(`tier-lbl-fr-${i}`)}
            type="text"
            class="input text-xs"
            value={(tier.label as Record<string, string>)?.['fr'] ?? ''}
             placeholder={ui('editor.tiered_costs.label_fr_placeholder', lang)}
            oninput={(e) => setTierLabel(i, 'fr', (e.currentTarget as HTMLInputElement).value)}
          />
        </div>

        <!-- targetPoolId -->
        <div class="flex flex-col gap-1">
          <label for={fid(`tier-pool-${i}`)}
                 class="text-[10px] text-text-muted font-semibold uppercase tracking-wider">
            {ui('editor.tiered_costs.pool_id_label', lang)}
          </label>
          <input
            id={fid(`tier-pool-${i}`)}
            type="text"
            class="input font-mono text-xs"
            value={tier.targetPoolId}
            placeholder={ui('editor.tiered_costs.pool_id_placeholder', lang)}
            oninput={(e) => patchTier(i, { targetPoolId: (e.currentTarget as HTMLInputElement).value })}
            autocomplete="off"
            spellcheck="false"
          />
        </div>

        <!-- cost -->
        <div class="flex flex-col gap-1">
          <label for={fid(`tier-cost-${i}`)}
                 class="text-[10px] text-text-muted font-semibold uppercase tracking-wider">
            {ui('editor.tiered_costs.charge_cost_label', lang)}
          </label>
          <FormulaBuilderInput
            id={fid(`tier-cost-${i}`)}
            value={tier.cost}
            placeholder={ui('editor.tiered_costs.cost_placeholder', lang)}
            onValueChanged={(v) => {
              const asNum = Number(v);
              patchTier(i, { cost: (!isNaN(asNum) && v.trim() !== '') ? asNum : v });
            }}
          />
        </div>
      </div>

      <!-- Per-tier modifiers -->
      <div class="flex items-center gap-2">
        {#if tier.grantedModifiers.length > 0}
          <span class="badge text-[10px]">
            {uiN('content_editor.psi.modifier_count', tier.grantedModifiers.length, lang)}
          </span>
        {:else}
          <span class="text-[10px] text-text-muted italic">{ui('editor.tiered_costs.no_modifiers', lang)}</span>
        {/if}
        <button
          type="button"
          class="text-[10px] text-text-muted underline hover:text-accent"
          onclick={() => (modalState = {
            kind: 'tier-modifiers',
            tierIndex: i,
            modifiers: tier.grantedModifiers,
          })}
        >
          {tier.grantedModifiers.length > 0 ? ui('editor.tiered_costs.edit_modifiers_btn', lang) : ui('editor.tiered_costs.add_modifiers_btn', lang)}
        </button>
      </div>

    </div>
  {/each}

  <button
    type="button"
    class="btn-ghost text-xs py-1 px-3 h-auto w-full"
    onclick={addTier}
  >
    {ui('editor.tiered_costs.add_tier_btn', lang)}
  </button>
</div>
