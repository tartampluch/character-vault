<!--
  @file src/lib/components/inventory/InventoryTab.svelte
  @description Inventory management tab with three sections and encumbrance.

  PURPOSE:
    Divides inventory into three visual containers:
      1. Equipped / Readied (isActive: true) — contributes modifiers
      2. Backpack / Carried (isActive: false, in backpack) — contributes weight
      3. Storage / Stashed (explicitly marked as stashed) — no weight

    Features equip/unequip logic via slot enforcement.
    Includes the Encumbrance calculator (Phase 13.4).

  @see src/lib/engine/GameEngine.svelte.ts for phase_equipmentSlots, phase_equippedSlotCounts.
  @see ARCHITECTURE.md Phase 13.2-13.3 for the specification.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';
  import FeatureModal from '$lib/components/ui/FeatureModal.svelte';
  import Encumbrance from './Encumbrance.svelte';
  import type { ItemFeature } from '$lib/types/feature';
  import type { ID } from '$lib/types/primitives';
  import { IconTabInventory, IconAttacks, IconInfo, IconEquip, IconUnequip, IconDelete } from '$lib/components/ui/icons';

  let modalItemId = $state<ID | null>(null);

  /**
   * All item instances from activeFeatures.
   * Sorted into equipped (isActive: true) and carried (isActive: false).
   */
  const allItems = $derived.by(() => {
    return engine.character.activeFeatures
      .filter(afi => {
        const feat = dataLoader.getFeature(afi.featureId);
        return feat?.category === 'item';
      })
      .map(afi => ({
        instanceId: afi.instanceId,
        isActive: afi.isActive,
        customName: afi.customName,
        feature: dataLoader.getFeature(afi.featureId) as ItemFeature,
      }))
      .filter(item => item.feature !== undefined);
  });

  const equippedItems = $derived(allItems.filter(i => i.isActive));
  const carriedItems  = $derived(allItems.filter(i => !i.isActive));

  /** Checks if a slot has space for one more item. */
  function canEquip(itemFeat: ItemFeature): { ok: boolean; reason?: string } {
    const slot = itemFeat.equipmentSlot;
    if (!slot || slot === 'none') return { ok: true };

    if (slot === 'two_hands') {
      const mainFull = (engine.phase_equippedSlotCounts['slots.main_hand'] ?? 0) >=
                       (engine.phase_equipmentSlots['slots.main_hand'] ?? 1);
      const offFull  = (engine.phase_equippedSlotCounts['slots.off_hand'] ?? 0) >=
                       (engine.phase_equipmentSlots['slots.off_hand'] ?? 1);
      if (mainFull || offFull) {
        return { ok: false, reason: 'Both hand slots must be free for this weapon.' };
      }
      return { ok: true };
    }

    const slotKey = `slots.${slot}`;
    const current = engine.phase_equippedSlotCounts[slotKey] ?? 0;
    const max     = engine.phase_equipmentSlots[slotKey] ?? 1;
    if (current >= max) {
      return { ok: false, reason: `${slot} slot is full. Unequip an item first.` };
    }
    return { ok: true };
  }

  function equipItem(instanceId: ID, itemFeat: ItemFeature) {
    const check = canEquip(itemFeat);
    if (!check.ok) {
      alert(check.reason ?? 'Cannot equip.');
      return;
    }
    engine.setFeatureActive(instanceId, true);
  }

  function unequipItem(instanceId: ID) {
    engine.setFeatureActive(instanceId, false);
  }
</script>

<div class="inventory-tab">
   <h2 class="inv-title"><IconTabInventory size={24} aria-hidden="true" /> Inventory</h2>

  <div class="inventory-sections">

    <!-- ============================================================ -->
    <!-- EQUIPPED / READIED -->
    <!-- ============================================================ -->
    <section class="inv-section equipped">
       <h3 class="section-header"><IconAttacks size={20} aria-hidden="true" /> Equipped / Readied</h3>
      {#if equippedItems.length === 0}
        <p class="empty-note">No items equipped.</p>
      {:else}
        {#each equippedItems as item}
          <div class="item-row equipped">
            <div class="item-info">
              <span class="item-name">{item.customName ?? engine.t(item.feature.label)}</span>
              <span class="item-slot">[{item.feature.equipmentSlot ?? 'none'}]</span>
              <span class="item-weight">{engine.formatWeight(item.feature.weightLbs)}</span>
            </div>
            <div class="item-actions">
               <button class="btn-info" onclick={() => (modalItemId = item.feature.id)} aria-label="Details"><IconInfo size={16} aria-hidden="true" /></button>
               <button class="btn-unequip" onclick={() => unequipItem(item.instanceId)} aria-label="Unequip"><IconUnequip size={16} aria-hidden="true" /></button>
            </div>
          </div>
        {/each}
      {/if}
    </section>

    <!-- ============================================================ -->
    <!-- BACKPACK / CARRIED -->
    <!-- ============================================================ -->
    <section class="inv-section carried">
       <h3 class="section-header"><IconTabInventory size={20} aria-hidden="true" /> Backpack / Carried</h3>
      {#if carriedItems.length === 0}
        <p class="empty-note">No items in backpack.</p>
      {:else}
        {#each carriedItems as item}
          {@const check = canEquip(item.feature)}
          <div class="item-row">
            <div class="item-info">
              <span class="item-name">{item.customName ?? engine.t(item.feature.label)}</span>
              <span class="item-slot">[{item.feature.equipmentSlot ?? 'none'}]</span>
              <span class="item-weight">{engine.formatWeight(item.feature.weightLbs)}</span>
            </div>
            <div class="item-actions">
               <button class="btn-info" onclick={() => (modalItemId = item.feature.id)} aria-label="Details"><IconInfo size={16} aria-hidden="true" /></button>
              {#if item.feature.equipmentSlot && item.feature.equipmentSlot !== 'none'}
                 <button
                   class="btn-equip"
                   onclick={() => equipItem(item.instanceId, item.feature)}
                   disabled={!check.ok}
                   title={check.ok ? 'Equip this item' : check.reason}
                   aria-label="Equip {engine.t(item.feature.label)}"
                 ><IconEquip size={16} aria-hidden="true" /></button>
               {/if}
               <button
                 class="btn-delete"
                 onclick={() => engine.removeFeature(item.instanceId)}
                 aria-label="Remove {engine.t(item.feature.label)}"
               ><IconDelete size={16} aria-hidden="true" /></button>
            </div>
          </div>
        {/each}
      {/if}
    </section>

  </div>

  <!-- Encumbrance panel -->
  <Encumbrance />

</div>

{#if modalItemId}
  <FeatureModal featureId={modalItemId} onclose={() => (modalItemId = null)} />
{/if}

<style>
  .inventory-tab {
    background: #161b22;
    border: 1px solid #21262d;
    border-radius: 10px;
    padding: 1.25rem;
    font-family: 'Segoe UI', system-ui, sans-serif;
    color: #e0e0e0;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .inv-title { margin: 0; font-size: 1rem; color: #c4b5fd; border-bottom: 1px solid #21262d; padding-bottom: 0.5rem; }

  .inventory-sections {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 0.75rem;
  }

  .inv-section {
    background: #0d1117;
    border: 1px solid #21262d;
    border-radius: 8px;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .section-header {
    margin: 0 0 0.4rem;
    font-size: 0.82rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 1px solid #21262d;
    padding-bottom: 0.25rem;
    color: #c4b5fd;
  }

  .equipped .section-header { color: #86efac; }

  .empty-note { font-size: 0.78rem; color: #4a4a6a; font-style: italic; }

  .item-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.25rem 0.3rem;
    border-radius: 4px;
    background: #161b22;
    border: 1px solid #21262d;
  }

  .item-row.equipped { border-color: #166534; background: #0f1a0f; }

  .item-info { flex: 1; display: flex; flex-direction: column; gap: 0.05rem; }
  .item-name { font-size: 0.85rem; color: #e0e0f0; }
  .item-slot { font-size: 0.68rem; color: #6080a0; font-family: monospace; }
  .item-weight { font-size: 0.7rem; color: #4a4a6a; }

  .item-actions { display: flex; gap: 0.25rem; flex-shrink: 0; }

  .btn-info, .btn-equip, .btn-unequip, .btn-delete {
    border: 1px solid #30363d;
    border-radius: 3px;
    width: 1.4rem;
    height: 1.4rem;
    font-size: 0.72rem;
    cursor: pointer;
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .btn-info { color: #7c3aed; }
  .btn-info:hover { background: #1c1a3a; }
  .btn-equip { color: #86efac; }
  .btn-equip:hover:not(:disabled) { background: #0f1a0f; }
  .btn-equip:disabled { opacity: 0.3; cursor: not-allowed; }
  .btn-unequip { color: #fbbf24; }
  .btn-unequip:hover { background: #1a1800; }
  .btn-delete { color: #f87171; }
  .btn-delete:hover { background: #1c0000; }
</style>
