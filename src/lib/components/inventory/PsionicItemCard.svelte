<!--
  @file src/lib/components/inventory/PsionicItemCard.svelte
  @description Inline card for psionic item subtype display and interaction.
  Engine Extension E (Phase 1.3b) — psionicItemData UI.

  Renders a compact row for each of the five psionic item types:
    - Cognizance Crystal: PP bar + attunement toggle
    - Dorje: charge counter + Use button
    - Power Stone: list of imprinted powers with used/available; Brainburn warning
    - Psicrown: PP bar + power list + Manifest button per power
    - Psionic Tattoo: activate button with body-limit awareness

  Props:
    item       — ItemFeature with psionicItemData set
    instanceId — ActiveFeatureInstance.instanceId (for mutation)
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { ui } from '$lib/i18n/ui-strings';
  import type { ItemFeature } from '$lib/types/feature';

  let { item, instanceId }: { item: ItemFeature; instanceId: string } = $props();

  const lang   = $derived(engine.settings.language);
  const psi    = $derived(item.psionicItemData!);
  const type   = $derived(psi.psionicItemType);

  // Manifester level for Brainburn check
  const charML = $derived(engine.phase_casterLevel ?? 0);

  // Cognizance Crystal / Psicrown: PP bar
  const ppPct = $derived(
    (psi.maxPP ?? 0) > 0
      ? Math.max(0, Math.min(100, ((psi.storedPP ?? 0) / (psi.maxPP ?? 1)) * 100))
      : 0
  );

  function toggleAttune() {
    if (!item.psionicItemData) return;
    item.psionicItemData.attuned = !item.psionicItemData.attuned;
  }

  function useCharge() {
    if (!item.psionicItemData || (item.psionicItemData.charges ?? 0) <= 0) return;
    item.psionicItemData.charges = (item.psionicItemData.charges ?? 1) - 1;
  }

  function activateTattoo() {
    if (!item.psionicItemData || item.psionicItemData.activated) return;
    if (!confirm(`Activate ${engine.t(item.label)}? It will fade after use.`)) return;
    item.psionicItemData.activated = true;
  }

  function drawPP(amount: number) {
    if (!item.psionicItemData) return;
    const current = item.psionicItemData.storedPP ?? 0;
    item.psionicItemData.storedPP = Math.max(0, current - amount);
  }

  function rechargePP(amount: number) {
    if (!item.psionicItemData) return;
    const current = item.psionicItemData.storedPP ?? 0;
    const max     = item.psionicItemData.maxPP ?? 0;
    item.psionicItemData.storedPP = Math.min(max, current + amount);
  }

  function flushPower(idx: number) {
    if (!item.psionicItemData?.powersImprinted) return;
    item.psionicItemData.powersImprinted[idx].usedUp = true;
  }

  function getPowerName(id: string): string {
    const f = dataLoader.getFeature(id);
    return f ? engine.t(f.label) : id;
  }

  let ppToRecharge = $state(1);
</script>

<div class="flex flex-col gap-1.5 px-3 py-2 rounded-md border border-purple-700/30 bg-purple-950/15">

  <!-- Type badge + item name -->
  <div class="flex items-center gap-2">
    <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-700/30 text-purple-300 font-semibold uppercase tracking-wide">
      {ui(`psionic_item.${type}`, lang)}
    </span>
    <span class="text-sm font-medium text-text-primary truncate">{engine.t(item.label)}</span>
  </div>

  <!-- ── COGNIZANCE CRYSTAL ───────────────────────────────────────────── -->
  {#if type === 'cognizance_crystal'}
    <!-- PP bar -->
    <div class="flex items-center gap-2 text-xs">
      <span class="text-text-muted shrink-0">PP</span>
      <div class="flex-1 h-1.5 rounded-full bg-surface-alt overflow-hidden border border-border">
        <div class="h-full rounded-full bg-purple-500 transition-all duration-300" style="width: {ppPct}%;" aria-hidden="true"></div>
      </div>
      <span class="text-purple-300 font-mono shrink-0">
        {ui('psionic_item.stored_pp', lang).replace('{pp}', String(psi.storedPP ?? 0)).replace('{max}', String(psi.maxPP ?? 0))}
      </span>
    </div>
    <!-- Attunement toggle -->
    <div class="flex items-center gap-2">
      <span class="text-xs {psi.attuned ? 'text-green-400' : 'text-amber-400'}">
        {psi.attuned ? ui('psionic_item.attuned', lang) : ui('psionic_item.not_attuned', lang)}
      </span>
      {#if !psi.attuned}
        <button
          class="px-2 py-0.5 text-xs rounded border border-amber-600/40 text-amber-400 hover:bg-amber-950/30 transition-colors duration-150"
          onclick={toggleAttune}
          type="button"
        >{ui('psionic_item.attune_button', lang)}</button>
      {/if}
    </div>
    <!-- Recharge PP controls (owner pays from personal PP) -->
    {#if psi.attuned && (psi.storedPP ?? 0) < (psi.maxPP ?? 0)}
      <div class="flex items-center gap-1.5">
        <span class="text-[10px] text-text-muted">Recharge:</span>
        <input type="number" min="1" max={psi.maxPP} bind:value={ppToRecharge}
               class="input w-12 text-center text-xs px-1 py-0.5" aria-label="PP to recharge" />
        <button
          class="px-2 py-0.5 text-xs rounded border border-purple-600/40 text-purple-400 hover:bg-purple-950/30 transition-colors duration-150"
          onclick={() => rechargePP(ppToRecharge)}
          type="button"
        >+ {ppToRecharge} PP</button>
      </div>
    {/if}

  <!-- ── DORJE ────────────────────────────────────────────────────────── -->
  {:else if type === 'dorje'}
    <div class="flex items-center gap-3 text-xs">
      <!-- Power stored -->
      <span class="text-purple-300 truncate">{psi.powerStored ? getPowerName(psi.powerStored) : '?'}</span>
      <!-- Charge progress -->
      <div class="flex items-center gap-1 ml-auto shrink-0">
        <div class="w-16 h-1.5 rounded-full bg-surface-alt overflow-hidden border border-border">
          <div
            class="h-full rounded-full bg-purple-500 transition-all duration-300"
            style="width: {Math.max(0, ((psi.charges ?? 0) / 50) * 100)}%;"
            aria-hidden="true"
          ></div>
        </div>
        <span class="font-mono text-purple-300">
          {ui('psionic_item.charges', lang).replace('{n}', String(psi.charges ?? 0)).replace('{max}', '50')}
        </span>
      </div>
      <button
        class="px-2 py-0.5 rounded border border-purple-600/40 text-purple-300 hover:bg-purple-950/30 transition-colors duration-150
               disabled:opacity-40 disabled:cursor-not-allowed"
        onclick={useCharge}
        disabled={(psi.charges ?? 0) <= 0}
        type="button"
        title="ML {psi.manifesterLevel ?? '?'}"
      >{ui('psionic_item.use_charge', lang)}</button>
    </div>

  <!-- ── POWER STONE ──────────────────────────────────────────────────── -->
  {:else if type === 'power_stone'}
    <div class="flex flex-col gap-1">
      {#each psi.powersImprinted ?? [] as entry, idx}
        <div class="flex items-center gap-2 text-xs {entry.usedUp ? 'opacity-40' : ''}">
          <span class="flex-1 truncate {entry.usedUp ? 'line-through text-text-muted' : 'text-text-primary'}">
            {getPowerName(entry.powerId)}
          </span>
          <span class="text-text-muted shrink-0">ML {entry.manifesterLevel}</span>
          <!-- Brainburn warning -->
          {#if !entry.usedUp && charML < entry.manifesterLevel}
            <span
              class="text-[10px] text-amber-400 shrink-0"
              title={ui('psionic_item.brainburn_risk', lang).replace('{dc}', String(entry.manifesterLevel + 1))}
            >⚠</span>
          {/if}
          {#if entry.usedUp}
            <span class="text-[10px] text-text-muted">{ui('psionic_item.power_flushed', lang)}</span>
          {:else}
            <button
              class="px-1.5 py-0.5 rounded border border-purple-600/40 text-purple-300 text-[10px] hover:bg-purple-950/30 transition-colors duration-150"
              onclick={() => flushPower(idx)}
              type="button"
            >{ui('psionic_item.use_charge', lang)}</button>
          {/if}
        </div>
      {/each}
    </div>

  <!-- ── PSICROWN ─────────────────────────────────────────────────────── -->
  {:else if type === 'psicrown'}
    <!-- PP bar -->
    <div class="flex items-center gap-2 text-xs">
      <span class="text-text-muted shrink-0">Crown PP</span>
      <div class="flex-1 h-1.5 rounded-full bg-surface-alt overflow-hidden border border-border">
        <div class="h-full rounded-full bg-purple-500 transition-all duration-300" style="width: {ppPct}%;" aria-hidden="true"></div>
      </div>
      <span class="text-purple-300 font-mono shrink-0">
        {ui('psionic_item.stored_pp', lang).replace('{pp}', String(psi.storedPP ?? 0)).replace('{max}', String(psi.maxPP ?? 0))}
      </span>
    </div>
    <!-- Powers list -->
    {#if (psi.powersKnown ?? []).length > 0}
      <div class="flex flex-wrap gap-1">
        {#each psi.powersKnown ?? [] as powId}
          <button
            class="px-2 py-0.5 rounded border border-purple-600/30 text-purple-300 text-[10px]
                   hover:bg-purple-950/40 transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
            onclick={() => drawPP(1)}
            disabled={(psi.storedPP ?? 0) <= 0}
            title={getPowerName(powId)}
            type="button"
          >{getPowerName(powId)} ({ui('psionic_item.manifest_from_crown', lang)})</button>
        {/each}
      </div>
    {/if}

  <!-- ── PSIONIC TATTOO ────────────────────────────────────────────────── -->
  {:else if type === 'psionic_tattoo'}
    <div class="flex items-center gap-2 text-xs">
      <span class="flex-1 truncate {psi.activated ? 'line-through text-text-muted' : 'text-text-primary'}">
        {psi.powerStored ? getPowerName(psi.powerStored) : '?'}
      </span>
      <span class="text-text-muted shrink-0">ML {psi.manifesterLevel ?? '?'}</span>
      {#if psi.activated}
        <span class="text-[10px] px-1.5 py-0.5 rounded bg-surface-alt text-text-muted">
          {ui('psionic_item.activated', lang)}
        </span>
      {:else}
        <button
          class="px-2 py-0.5 rounded border border-purple-600/40 text-purple-300 text-[10px]
                 hover:bg-purple-950/30 transition-colors duration-150"
          onclick={activateTattoo}
          type="button"
        >{ui('psionic_item.activate_button', lang)}</button>
      {/if}
    </div>
  {/if}

</div>
