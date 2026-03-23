<!--
  @file src/lib/components/inventory/InventoryTab.svelte
  @description Inventory management tab — Equipped, Backpack, and Encumbrance.
  Phase 19.11: Migrated to Tailwind CSS — all scoped <style> removed.

  LAYOUT (spec 19.11):
    - Card wrapping the full inventory.
    - Three collapsible section groups:
        1. Equipped / Readied — accent-tinted header, green-bordered item rows.
        2. Backpack / Carried  — neutral header, standard item rows.
        (Storage section omitted — not yet modelled in the engine.)
    - Each item row: Package icon | name | slot badge | weight | action buttons.
    - Equip/unequip validation warnings use the browser alert (Phase 13 stub;
      Phase 19.14 will upgrade to toast notifications).
    - Encumbrance panel below the sections (separate component).

  MOBILE:
    Item action buttons are always visible (no swipe-to-reveal in this phase —
    Phase 19.13 will add that polish). Buttons are min 40px touch targets.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';
  import FeatureModal from '$lib/components/ui/FeatureModal.svelte';
  import Encumbrance from './Encumbrance.svelte';
  import PsionicItemCard from './PsionicItemCard.svelte';
  import type { ItemFeature } from '$lib/types/feature';
  import type { ID } from '$lib/types/primitives';
  import {
    IconTabInventory, IconAttacks, IconInfo,
    IconEquip, IconUnequip, IconDelete,
    IconPotion, IconOil,
  } from '$lib/components/ui/icons';
  import { ui } from '$lib/i18n/ui-strings';
  import { Package } from 'lucide-svelte';

  let modalItemId = $state<ID | null>(null);

  // Collapsible section state — Equipped and Carried open by default, Storage closed
  let equippedOpen = $state(true);
  let carriedOpen  = $state(true);
  let stashedOpen  = $state(false);

  const allItems = $derived.by(() =>
    engine.character.activeFeatures
      .filter(afi => dataLoader.getFeature(afi.featureId)?.category === 'item')
      .map(afi => ({
        instanceId: afi.instanceId,
        isActive:   afi.isActive,
        isStashed:  afi.isStashed ?? false,
        customName: afi.customName,
        feature:    dataLoader.getFeature(afi.featureId) as ItemFeature,
      }))
      .filter(item => item.feature !== undefined)
  );

  const equippedItems = $derived(allItems.filter(i =>  i.isActive && !i.feature.tags?.includes('stashed')));
  const carriedItems  = $derived(allItems.filter(i => !i.isActive && !i.isStashed));
  const stashedItems  = $derived(allItems.filter(i =>  i.isStashed === true));

  function canEquip(itemFeat: ItemFeature): { ok: boolean; reason?: string } {
    const slot = itemFeat.equipmentSlot;
    if (!slot || slot === 'none') return { ok: true };
    if (slot === 'two_hands') {
      const mainFull = (engine.phase_equippedSlotCounts['slots.main_hand'] ?? 0) >=
                       (engine.phase_equipmentSlots['slots.main_hand'] ?? 1);
      const offFull  = (engine.phase_equippedSlotCounts['slots.off_hand'] ?? 0) >=
                       (engine.phase_equipmentSlots['slots.off_hand'] ?? 1);
      if (mainFull || offFull) return { ok: false, reason: 'Both hand slots must be free for this weapon.' };
      return { ok: true };
    }
    const slotKey = `slots.${slot}`;
    const current = engine.phase_equippedSlotCounts[slotKey] ?? 0;
    const max     = engine.phase_equipmentSlots[slotKey] ?? 1;
    if (current >= max) return { ok: false, reason: `${slot} slot is full. Unequip an item first.` };
    return { ok: true };
  }

  function equipItem(instanceId: ID, itemFeat: ItemFeature) {
    const check = canEquip(itemFeat);
    if (!check.ok) { alert(check.reason ?? 'Cannot equip.'); return; }
    engine.setFeatureActive(instanceId, true);
  }

  function unequipItem(instanceId: ID) {
    engine.setFeatureActive(instanceId, false);
  }

  /**
   * Consumes a potion, oil, or other single-use item.
   *
   * Calls GameEngine.consumeItem() which:
   *   1. Removes the item from inventory (it's gone — consumed!).
   *   2. Creates an ephemeral ActiveFeatureInstance with the item's modifiers.
   *   3. The effect appears in EphemeralEffectsPanel with an "Expire" button.
   *
   * The `currentRound` argument is always 0 here because we don't track
   * combat round numbers in the inventory UI. The combat tab would pass the
   * actual round number if this button were available in-combat (future work).
   */
  function useConsumable(instanceId: ID) {
    engine.consumeItem(instanceId, 0);
  }

  /**
   * Returns the correct label for the "Use" button based on item tags.
   * Potions → "Drink", Oils → "Apply", anything else → "Use".
   */
  function getUseLabel(feature: ItemFeature): string {
    if (feature.tags?.includes('potion')) {
      return ui('inventory.drink_potion', engine.settings.language);
    }
    if (feature.tags?.includes('oil')) {
      return ui('inventory.apply_oil', engine.settings.language);
    }
    return ui('inventory.use_item', engine.settings.language);
  }

  /**
   * Type-safe check whether an item is a consumable (potion/oil/one-shot).
   *
   * WHY A HELPER:
   *   The `ItemFeature.consumable` field was added in Phase E-1.
   *   The InventoryTab receives items as plain `ItemFeature` objects. To access
   *   the `consumable` field from the template, we need to cast — but inline
   *   `as` casts in Svelte templates are not always supported cleanly.
   *   A typed helper function is cleaner and keeps the template readable.
   */
  function isConsumable(feature: ItemFeature): boolean {
    return !!(feature as ItemFeature & { consumable?: { isConsumable: boolean } })
      .consumable?.isConsumable;
  }
</script>

<div class="flex flex-col gap-4">

  <!-- ── INVENTORY SECTIONS ─────────────────────────────────────────────── -->
  <div class="card overflow-hidden p-0">

    <!-- ================================================================= -->
    <!-- EQUIPPED / READIED — accent-tinted header                         -->
    <!-- ================================================================= -->
    <div>
      <!-- Section header (clickable to collapse) -->
      <button
        class="w-full flex items-center justify-between gap-2 px-4 py-3
               bg-accent/10 border-b border-accent/30
               hover:bg-accent/15 transition-colors duration-150"
        onclick={() => (equippedOpen = !equippedOpen)}
        aria-expanded={equippedOpen}
        aria-controls="equipped-list"
        type="button"
      >
        <div class="flex items-center gap-2">
          <IconAttacks size={16} class="text-accent" aria-hidden="true" />
          <span class="text-sm font-semibold uppercase tracking-wider text-accent">
            Equipped / Readied
          </span>
          <span class="badge-accent text-[10px]">{equippedItems.length}</span>
        </div>
        <span class="text-text-muted text-xs">{equippedOpen ? '▲' : '▼'}</span>
      </button>

      {#if equippedOpen}
        <div id="equipped-list" class="flex flex-col divide-y divide-border">
          {#if equippedItems.length === 0}
            <p class="px-4 py-3 text-sm text-text-muted italic">No items equipped.</p>
          {:else}
            {#each equippedItems as item}
              <div
                class="flex items-center gap-3 px-4 py-2.5
                       bg-green-950/10 dark:bg-green-950/20
                       hover:bg-green-950/20 transition-colors duration-100"
              >
                <!-- Item icon -->
                <span class="text-green-500 dark:text-green-400 shrink-0" aria-hidden="true">
                  <Package size={16} />
                </span>

                <!-- Item info -->
                <div class="flex-1 flex flex-col gap-0.5 min-w-0">
                  <span class="text-sm font-medium text-text-primary truncate">
                    {item.customName ?? engine.t(item.feature.label)}
                  </span>
                  <div class="flex items-center gap-1.5 flex-wrap">
                    {#if item.feature.equipmentSlot && item.feature.equipmentSlot !== 'none'}
                      <span class="badge-green font-mono text-[10px]">{item.feature.equipmentSlot}</span>
                    {/if}
                    <span class="text-[10px] text-text-muted">{engine.formatWeight(item.feature.weightLbs)}</span>
                  </div>
                </div>

                 <!-- Action buttons -->
                 <div class="flex gap-1 shrink-0">
                   <button
                     class="btn-ghost p-1.5 text-accent hover:bg-accent/10"
                     onclick={() => (modalItemId = item.feature.id)}
                     aria-label="Details for {engine.t(item.feature.label)}"
                     type="button"
                   ><IconInfo size={14} aria-hidden="true" /></button>
                   <button
                     class="btn-ghost p-1.5 text-yellow-500 dark:text-yellow-400 hover:bg-yellow-500/10"
                     onclick={() => unequipItem(item.instanceId)}
                     aria-label="Unequip {engine.t(item.feature.label)}"
                     title="Unequip"
                     type="button"
                   ><IconUnequip size={14} aria-hidden="true" /></button>
                 </div>
               </div>
               <!-- Psionic item data card (Extension E) -->
               {#if item.feature.psionicItemData}
                 <PsionicItemCard item={item.feature} instanceId={item.instanceId} />
               {/if}
             {/each}
          {/if}
        </div>
      {/if}
    </div>

    <!-- ================================================================= -->
    <!-- BACKPACK / CARRIED — neutral header                               -->
    <!-- ================================================================= -->
    <div class="border-t border-border">
      <!-- Section header -->
      <button
        class="w-full flex items-center justify-between gap-2 px-4 py-3
               bg-surface-alt border-b border-border
               hover:bg-surface transition-colors duration-150"
        onclick={() => (carriedOpen = !carriedOpen)}
        aria-expanded={carriedOpen}
        aria-controls="carried-list"
        type="button"
      >
        <div class="flex items-center gap-2">
          <IconTabInventory size={16} class="text-text-secondary" aria-hidden="true" />
          <span class="text-sm font-semibold uppercase tracking-wider text-text-secondary">
            Backpack / Carried
          </span>
          <span class="badge-gray text-[10px]">{carriedItems.length}</span>
        </div>
        <span class="text-text-muted text-xs">{carriedOpen ? '▲' : '▼'}</span>
      </button>

      {#if carriedOpen}
        <div id="carried-list" class="flex flex-col divide-y divide-border">
          {#if carriedItems.length === 0}
            <p class="px-4 py-3 text-sm text-text-muted italic">No items in backpack.</p>
          {:else}
            {#each carriedItems as item}
              {@const check = canEquip(item.feature)}
              <div
                class="flex items-center gap-3 px-4 py-2.5
                       hover:bg-surface-alt transition-colors duration-100"
              >
                <!-- Item icon -->
                <span class="text-text-muted shrink-0" aria-hidden="true">
                  <Package size={16} />
                </span>

                <!-- Item info -->
                <div class="flex-1 flex flex-col gap-0.5 min-w-0">
                  <span class="text-sm font-medium text-text-primary truncate">
                    {item.customName ?? engine.t(item.feature.label)}
                  </span>
                  <div class="flex items-center gap-1.5 flex-wrap">
                    {#if item.feature.equipmentSlot && item.feature.equipmentSlot !== 'none'}
                      <span class="badge-gray font-mono text-[10px]">{item.feature.equipmentSlot}</span>
                    {/if}
                    <span class="text-[10px] text-text-muted">{engine.formatWeight(item.feature.weightLbs)}</span>
                    {#if !check.ok}
                      <span class="badge-yellow text-[10px]" title={check.reason}>Slot full</span>
                    {/if}
                  </div>
                </div>

                <!-- Action buttons -->
                <div class="flex gap-1 shrink-0">
                  <button
                    class="btn-ghost p-1.5 text-accent hover:bg-accent/10"
                    onclick={() => (modalItemId = item.feature.id)}
                    aria-label="Details for {engine.t(item.feature.label)}"
                    type="button"
                  ><IconInfo size={14} aria-hidden="true" /></button>

                  <!--
                    CONSUMABLE ITEMS (potions, oils):
                    Show a "Drink" / "Apply" / "Use" button instead of (or in addition to)
                    the Equip button. Clicking this calls engine.consumeItem() which:
                      1. Removes the item from inventory permanently.
                      2. Creates an ephemeral ActiveFeatureInstance with the effect.
                      3. The effect shows in EphemeralEffectsPanel with an Expire button.
                  -->
                  {#if isConsumable(item.feature)}
                    <button
                      class="flex items-center gap-1 px-2 py-1 rounded-md
                             text-[11px] font-medium
                             bg-amber-100 text-amber-800
                             dark:bg-amber-900/30 dark:text-amber-300
                             hover:bg-amber-200 dark:hover:bg-amber-900/50
                             transition-colors"
                      onclick={() => useConsumable(item.instanceId)}
                      title="Consume this item — it will be removed from inventory"
                      aria-label="{getUseLabel(item.feature)} {engine.t(item.feature.label)}"
                      type="button"
                    >
                      {#if item.feature.tags?.includes('potion')}
                        <IconPotion size={12} aria-hidden="true" />
                      {:else if item.feature.tags?.includes('oil')}
                        <IconOil size={12} aria-hidden="true" />
                      {/if}
                      {getUseLabel(item.feature)}
                    </button>
                  {:else if item.feature.equipmentSlot && item.feature.equipmentSlot !== 'none'}
                    <!-- Non-consumable equippable items: show standard Equip button -->
                    <button
                      class="btn-ghost p-1.5 text-green-500 dark:text-green-400 hover:bg-green-500/10
                             disabled:opacity-30 disabled:cursor-not-allowed"
                      onclick={() => equipItem(item.instanceId, item.feature)}
                      disabled={!check.ok}
                      title={check.ok ? 'Equip this item' : check.reason}
                      aria-label="Equip {engine.t(item.feature.label)}"
                      type="button"
                    ><IconEquip size={14} aria-hidden="true" /></button>
                  {/if}

                   <button
                     class="btn-ghost p-1.5 text-red-400 hover:bg-red-500/10"
                     onclick={() => engine.removeFeature(item.instanceId)}
                     aria-label="Remove {engine.t(item.feature.label)}"
                     type="button"
                   ><IconDelete size={14} aria-hidden="true" /></button>
                 </div>
               </div>
               <!-- Psionic item data card (Extension E) -->
               {#if item.feature.psionicItemData}
                 <PsionicItemCard item={item.feature} instanceId={item.instanceId} />
               {/if}
             {/each}
           {/if}
         </div>
       {/if}
     </div>

     <!-- ================================================================= -->
     <!-- STORAGE / STASHED — muted header, no weight contribution         -->
     <!-- ================================================================= -->
    <div class="border-t border-border">
      <button
        class="w-full flex items-center justify-between gap-2 px-4 py-3
               bg-surface-alt/60 border-b border-border
               hover:bg-surface-alt transition-colors duration-150"
        onclick={() => (stashedOpen = !stashedOpen)}
        aria-expanded={stashedOpen}
        aria-controls="stashed-list"
        type="button"
      >
        <div class="flex items-center gap-2">
          <IconTabInventory size={16} class="text-text-muted" aria-hidden="true" />
          <span class="text-sm font-semibold uppercase tracking-wider text-text-muted">
            Storage / Stashed
          </span>
          <span class="badge-gray text-[10px]">{stashedItems.length}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-[10px] text-text-muted italic">no weight</span>
          <span class="text-text-muted text-xs">{stashedOpen ? '▲' : '▼'}</span>
        </div>
      </button>

      {#if stashedOpen}
        <div id="stashed-list" class="flex flex-col divide-y divide-border">
          {#if stashedItems.length === 0}
            <p class="px-4 py-3 text-sm text-text-muted italic">No items in storage.</p>
          {:else}
            {#each stashedItems as item}
              <div class="flex items-center gap-3 px-4 py-2.5 opacity-60 hover:opacity-80 transition-opacity hover:bg-surface-alt">
                <!-- Item icon -->
                <span class="text-text-muted shrink-0" aria-hidden="true">
                  <Package size={16} />
                </span>

                <!-- Item info -->
                <div class="flex-1 flex flex-col gap-0.5 min-w-0">
                  <span class="text-sm font-medium text-text-primary truncate">
                    {item.customName ?? engine.t(item.feature.label)}
                  </span>
                  <div class="flex items-center gap-1.5 flex-wrap">
                    {#if item.feature.equipmentSlot && item.feature.equipmentSlot !== 'none'}
                      <span class="badge-gray font-mono text-[10px]">{item.feature.equipmentSlot}</span>
                    {/if}
                    <span class="text-[10px] text-text-muted">{engine.formatWeight(item.feature.weightLbs)}</span>
                    <span class="badge-gray text-[10px]">not carried</span>
                  </div>
                </div>

                <!-- Action buttons -->
                <div class="flex gap-1 shrink-0">
                  <button
                    class="btn-ghost p-1.5 text-accent hover:bg-accent/10"
                    onclick={() => (modalItemId = item.feature.id)}
                    aria-label="Details for {engine.t(item.feature.label)}"
                    type="button"
                  ><IconInfo size={14} aria-hidden="true" /></button>
                  <button
                    class="btn-ghost p-1.5 text-text-muted hover:bg-surface-alt text-xs"
                    onclick={() => {
                      const afi = engine.character.activeFeatures.find(a => a.instanceId === item.instanceId);
                      if (afi) afi.isStashed = false;
                    }}
                    aria-label="Move {engine.t(item.feature.label)} to backpack"
                    title="Move to backpack"
                    type="button"
                  ><IconUnequip size={14} aria-hidden="true" /></button>
                  <button
                    class="btn-ghost p-1.5 text-red-400 hover:bg-red-500/10"
                    onclick={() => engine.removeFeature(item.instanceId)}
                    aria-label="Remove {engine.t(item.feature.label)}"
                    type="button"
                  ><IconDelete size={14} aria-hidden="true" /></button>
                </div>
              </div>
            {/each}
          {/if}
        </div>
      {/if}
    </div>

  </div><!-- /card -->

  <!-- ── ENCUMBRANCE (separate component) ───────────────────────────────── -->
  <Encumbrance />

</div>

{#if modalItemId}
  <FeatureModal featureId={modalItemId} onclose={() => (modalItemId = null)} />
{/if}
