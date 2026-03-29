<!--
  @file src/lib/components/content-editor/TieredCostsEditor.svelte
  @description Tiered-resource-costs array editor for ActivationEditor.
  Manages the `activation.tieredResourceCosts` field via EditorContext.

  Each tier represents a different power level at a different charge cost
  (Ring of the Ram pattern). The user can add / remove tiers, edit label
  EN/FR, pool ID, charge cost (FormulaBuilderInput), and per-tier transient
  modifiers (via LevelModifierModal).

  Reads/writes `ctx.feature.activation.tieredResourceCosts` via EditorContext.

  @see ActivationEditor.svelte  for cost-mode radio selector and fixed-cost fields
  @see LevelModifierModal.svelte for per-tier modifier editing
-->

<script lang="ts">
  import { getContext } from 'svelte';
  import { EDITOR_CONTEXT_KEY, type EditorContext } from './editorContext';
  import type { ActivationTier } from '$lib/types/feature';
  import type { Modifier } from '$lib/types/pipeline';
  import FormulaBuilderInput from './FormulaBuilderInput.svelte';
  import LevelModifierModal  from './LevelModifierModal.svelte';

  // ===========================================================================
  // CONTEXT
  // ===========================================================================

  const ctx = getContext<EditorContext>(EDITOR_CONTEXT_KEY);

  // ===========================================================================
  // TIERED COST MUTATIONS
  // ===========================================================================

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

  function setTierLabel(i: number, lang: string, value: string): void {
    const tier = ctx.feature.activation?.tieredResourceCosts?.[i];
    if (!tier) return;
    patchTier(i, { label: { ...(tier.label as Record<string, string>), [lang]: value } });
  }

  // ===========================================================================
  // MODAL STATE (per-tier modifier editor)
  // ===========================================================================

  type ModalState = { kind: 'tier-modifiers'; tierIndex: number; modifiers: Modifier[] } | null;
  let modalState = $state<ModalState>(null);

  // Unique uid for label↔input id associations
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
    Each tier offers a different power level at a different charge cost.
    The player chooses a tier at activation time.
  </p>

  {#each (ctx.feature.activation?.tieredResourceCosts ?? []) as tier, i (i)}
    <div class="flex flex-col gap-2 rounded border border-border bg-surface p-3">

      <div class="flex items-center justify-between">
        <span class="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
          Tier {i + 1}
        </span>
        <button
          type="button"
          class="btn-ghost btn-icon h-6 w-6 p-0 text-text-muted hover:text-danger"
          onclick={() => deleteTier(i)}
          aria-label="Delete tier {i + 1}"
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
            Label (EN)
          </label>
          <input
            id={fid(`tier-lbl-en-${i}`)}
            type="text"
            class="input text-xs"
            value={(tier.label as Record<string, string>)?.['en'] ?? ''}
            placeholder="e.g. 2 Charges: 2d6 damage"
            oninput={(e) => setTierLabel(i, 'en', (e.currentTarget as HTMLInputElement).value)}
          />
        </div>

        <!-- Label FR -->
        <div class="flex flex-col gap-1">
          <label for={fid(`tier-lbl-fr-${i}`)}
                 class="text-[10px] text-text-muted font-semibold uppercase tracking-wider">
            Label (FR)
          </label>
          <input
            id={fid(`tier-lbl-fr-${i}`)}
            type="text"
            class="input text-xs"
            value={(tier.label as Record<string, string>)?.['fr'] ?? ''}
            placeholder="ex. 2 Charges : 2d6 dégâts"
            oninput={(e) => setTierLabel(i, 'fr', (e.currentTarget as HTMLInputElement).value)}
          />
        </div>

        <!-- targetPoolId -->
        <div class="flex flex-col gap-1">
          <label for={fid(`tier-pool-${i}`)}
                 class="text-[10px] text-text-muted font-semibold uppercase tracking-wider">
            Pool ID
          </label>
          <input
            id={fid(`tier-pool-${i}`)}
            type="text"
            class="input font-mono text-xs"
            value={tier.targetPoolId}
            placeholder="e.g. charges"
            oninput={(e) => patchTier(i, { targetPoolId: (e.currentTarget as HTMLInputElement).value })}
            autocomplete="off"
            spellcheck="false"
          />
        </div>

        <!-- cost -->
        <div class="flex flex-col gap-1">
          <label for={fid(`tier-cost-${i}`)}
                 class="text-[10px] text-text-muted font-semibold uppercase tracking-wider">
            Charge cost
          </label>
          <FormulaBuilderInput
            id={fid(`tier-cost-${i}`)}
            value={tier.cost}
            placeholder="e.g. 1, 2, 3"
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
            {tier.grantedModifiers.length} modifier{tier.grantedModifiers.length === 1 ? '' : 's'}
          </span>
        {:else}
          <span class="text-[10px] text-text-muted italic">No transient modifiers.</span>
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
          {tier.grantedModifiers.length > 0 ? 'Edit' : '+ Add'} modifiers
        </button>
      </div>

    </div>
  {/each}

  <button
    type="button"
    class="btn-ghost text-xs py-1 px-3 h-auto w-full"
    onclick={addTier}
  >
    + Add Tier
  </button>
</div>
