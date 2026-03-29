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
    IconInventory, IconClose,
    IconChevronUp, IconChevronDown,
  } from '$lib/components/ui/icons';
  import { ui } from '$lib/i18n/ui-strings';
  import { POTION_ITEM_TAG, OIL_ITEM_TAG, STASHED_ITEM_TAG, EQUIPMENT_SLOT_NONE } from '$lib/utils/constants';

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

  // STASHED_ITEM_TAG / EQUIPMENT_SLOT_NONE imported from constants.ts
  // (zero-hardcoding rule: item state tags and model sentinel values must
  // not be literal strings in .svelte files, ARCHITECTURE.md §6).
  // NOTE: The `isStashed` field is the canonical stash-state flag (line 52 above).
  // The tag check is kept for backward compatibility with items tagged before the
  // isStashed field was introduced, but uses the named constant instead of a literal.
  const equippedItems = $derived(allItems.filter(i =>  i.isActive && !i.feature.tags?.includes(STASHED_ITEM_TAG)));
  const carriedItems  = $derived(allItems.filter(i => !i.isActive && !i.isStashed));
  const stashedItems  = $derived(allItems.filter(i =>  i.isStashed === true));

  /**
   * Translates the engine's equip-check blocker into a human-readable string.
   *
   * WHY A HELPER:
   *   The engine's `getEquipCheckResult()` returns a symbolic blocker key and an
   *   optional slot name. Translating those into a display string is a UI concern
   *   (calls `ui()` which is i18n, not game logic), so it belongs here.
   */
  function equipReasonText(check: { ok: boolean; blocker: 'tattoo_limit' | 'two_hands_full' | 'slot_full' | null; slotName?: string }): string {
    if (check.blocker === 'tattoo_limit')    return ui('inventory.tattoo.limit_exceeded', engine.settings.language);
    if (check.blocker === 'two_hands_full')  return ui('inventory.two_hands.slots_full', engine.settings.language);
    if (check.blocker === 'slot_full')       return ui('inventory.slot.full', engine.settings.language).replace('{slot}', check.slotName ?? '');
    return ui('inventory.slot.full', engine.settings.language);
  }

  function equipItem(instanceId: ID, itemFeat: ItemFeature) {
    const check = engine.getEquipCheckResult(itemFeat);
    if (!check.ok) { alert(equipReasonText(check)); return; }
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
    // POTION_ITEM_TAG / OIL_ITEM_TAG are constants from constants.ts
    // (zero-hardcoding rule: D&D item category names must not be magic strings, ARCHITECTURE.md §6).
    if (feature.tags?.includes(POTION_ITEM_TAG)) {
      return ui('inventory.drink_potion', engine.settings.language);
    }
    if (feature.tags?.includes(OIL_ITEM_TAG)) {
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

  /**
   * Checks whether an item is cursed (has removalPrevention.isCursed === true).
   *
   * Cursed items cannot be unequipped via normal means — the Unequip button must
   * be hidden for these items (CHECKPOINTS.md §2 Section 10). Only
   * engine.tryRemoveCursedItem() (with a valid dispel method) can remove them.
   */
  function isCursed(feature: ItemFeature): boolean {
    return feature.removalPrevention?.isCursed === true;
  }

  // NOTE: Tattoo count, slot availability, and two-handed checks have been moved to
  // engine.getEquipCheckResult() (zero-game-logic-in-Svelte rule, ARCHITECTURE.md §3).
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
            {ui('inventory.section.equipped', engine.settings.language)}
          </span>
          <span class="badge-accent text-[10px]">{equippedItems.length}</span>
        </div>
        <!-- IconChevronUp/Down from icon barrel (zero-hardcoding rule: no raw Unicode symbols, ARCHITECTURE.md §6) -->
        <span class="text-text-muted" aria-hidden="true">
          {#if equippedOpen}<IconChevronUp size={14} />{:else}<IconChevronDown size={14} />{/if}
        </span>
      </button>

      {#if equippedOpen}
        <div id="equipped-list" class="flex flex-col divide-y divide-border">
          {#if equippedItems.length === 0}
            <p class="px-4 py-3 text-sm text-text-muted italic">{ui('inventory.empty.equipped', engine.settings.language)}</p>
          {:else}
            {#each equippedItems as item}
              <div
                class="flex items-center gap-3 px-4 py-2.5
                       bg-green-950/10 dark:bg-green-950/20
                       hover:bg-green-950/20 transition-colors duration-100"
              >
                <!-- Item icon — IconInventory from the centralized barrel (no direct lucide import, ARCHITECTURE.md §6) -->
                <span class="text-green-500 dark:text-green-400 shrink-0" aria-hidden="true">
                  <IconInventory size={16} />
                </span>

                <!-- Item info -->
                <div class="flex-1 flex flex-col gap-0.5 min-w-0">
                  <span class="text-sm font-medium text-text-primary truncate">
                    {item.customName ?? engine.t(item.feature.label)}
                  </span>
                  <div class="flex items-center gap-1.5 flex-wrap">
                    {#if item.feature.equipmentSlot && item.feature.equipmentSlot !== EQUIPMENT_SLOT_NONE}
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
                    aria-label={ui('common.item_details_aria', engine.settings.language).replace('{name}', engine.t(item.feature.label))}
                     type="button"
                    ><IconInfo size={14} aria-hidden="true" /></button>
                   {#if isCursed(item.feature)}
                      <!-- Cursed items cannot be unequipped via normal means.
                           IconClose replaces raw Unicode ✗ (zero-hardcoding rule:
                           symbols must come from the icon barrel, not inline
                           characters, ARCHITECTURE.md §6). -->
                      <span
                        class="inline-flex items-center justify-center p-1.5 text-red-600 dark:text-red-400 rounded border border-red-700/40 bg-red-950/20"
                        title={ui('inventory.cursed.tooltip', engine.settings.language)}
                        aria-label={ui('inventory.cursed.label', engine.settings.language)}
                      ><IconClose size={12} aria-hidden="true" /></span>
                   {:else}
                     <button
                       class="btn-ghost p-1.5 text-yellow-500 dark:text-yellow-400 hover:bg-yellow-500/10"
                       onclick={() => unequipItem(item.instanceId)}
                        aria-label="{ui('inventory.unequip', engine.settings.language)} {engine.t(item.feature.label)}"
                        title={ui('inventory.unequip', engine.settings.language)}
                       type="button"
                     ><IconUnequip size={14} aria-hidden="true" /></button>
                   {/if}
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
            {ui('inventory.section.backpack', engine.settings.language)}
          </span>
          <span class="badge-gray text-[10px]">{carriedItems.length}</span>
        </div>
        <span class="text-text-muted" aria-hidden="true">
          {#if carriedOpen}<IconChevronUp size={14} />{:else}<IconChevronDown size={14} />{/if}
        </span>
      </button>

      {#if carriedOpen}
        <div id="carried-list" class="flex flex-col divide-y divide-border">
          {#if carriedItems.length === 0}
            <p class="px-4 py-3 text-sm text-text-muted italic">{ui('inventory.empty.backpack', engine.settings.language)}</p>
          {:else}
            {#each carriedItems as item}
              {@const check = engine.getEquipCheckResult(item.feature)}
              <div
                class="flex items-center gap-3 px-4 py-2.5
                       hover:bg-surface-alt transition-colors duration-100"
              >
                <!-- Item icon -->
                <span class="text-text-muted shrink-0" aria-hidden="true">
                  <IconInventory size={16} />
                </span>

                <!-- Item info -->
                <div class="flex-1 flex flex-col gap-0.5 min-w-0">
                  <span class="text-sm font-medium text-text-primary truncate">
                    {item.customName ?? engine.t(item.feature.label)}
                  </span>
                  <div class="flex items-center gap-1.5 flex-wrap">
                    {#if item.feature.equipmentSlot && item.feature.equipmentSlot !== EQUIPMENT_SLOT_NONE}
                       <span class="badge-gray font-mono text-[10px]">{item.feature.equipmentSlot}</span>
                    {/if}
                    <span class="text-[10px] text-text-muted">{engine.formatWeight(item.feature.weightLbs)}</span>
                    {#if !check.ok}
                      <span class="badge-yellow text-[10px]" title={equipReasonText(check)}>{ui('inventory.slot.full_badge', engine.settings.language)}</span>
                    {/if}
                  </div>
                </div>

                <!-- Action buttons -->
                <div class="flex gap-1 shrink-0">
                   <button
                     class="btn-ghost p-1.5 text-accent hover:bg-accent/10"
                     onclick={() => (modalItemId = item.feature.id)}
                     aria-label={ui('common.item_details_aria', engine.settings.language).replace('{name}', engine.t(item.feature.label))}
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
                      title={ui('inventory.consume_tooltip', engine.settings.language)}
                      aria-label="{getUseLabel(item.feature)} {engine.t(item.feature.label)}"
                      type="button"
                    >
                      {#if item.feature.tags?.includes(POTION_ITEM_TAG)}
                        <IconPotion size={12} aria-hidden="true" />
                      {:else if item.feature.tags?.includes(OIL_ITEM_TAG)}
                        <IconOil size={12} aria-hidden="true" />
                      {/if}
                      {getUseLabel(item.feature)}
                    </button>
                  {:else if item.feature.equipmentSlot && item.feature.equipmentSlot !== EQUIPMENT_SLOT_NONE}
                    <!-- Non-consumable equippable items: show standard Equip button -->
                    <button
                      class="btn-ghost p-1.5 text-green-500 dark:text-green-400 hover:bg-green-500/10
                             disabled:opacity-30 disabled:cursor-not-allowed"
                      onclick={() => equipItem(item.instanceId, item.feature)}
                      disabled={!check.ok}
                      title={check.ok ? ui('inventory.equip_title', engine.settings.language) : equipReasonText(check)}
                      aria-label={ui('inventory.equip_item_aria', engine.settings.language).replace('{name}', engine.t(item.feature.label))}
                      type="button"
                    ><IconEquip size={14} aria-hidden="true" /></button>
                  {/if}

                   <button
                     class="btn-ghost p-1.5 text-red-400 hover:bg-red-500/10"
                     onclick={() => engine.removeFeature(item.instanceId)}
                      aria-label={ui('common.remove_item_aria', engine.settings.language).replace('{name}', engine.t(item.feature.label))}
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
            {ui('inventory.section.storage', engine.settings.language)}
          </span>
          <span class="badge-gray text-[10px]">{stashedItems.length}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-[10px] text-text-muted italic">{ui('inventory.section.storage_weight_note', engine.settings.language)}</span>
          <span class="text-text-muted" aria-hidden="true">
            {#if stashedOpen}<IconChevronUp size={14} />{:else}<IconChevronDown size={14} />{/if}
          </span>
        </div>
      </button>

      {#if stashedOpen}
        <div id="stashed-list" class="flex flex-col divide-y divide-border">
          {#if stashedItems.length === 0}
            <p class="px-4 py-3 text-sm text-text-muted italic">{ui('inventory.empty.storage', engine.settings.language)}</p>
          {:else}
            {#each stashedItems as item}
              <div class="flex items-center gap-3 px-4 py-2.5 opacity-60 hover:opacity-80 transition-opacity hover:bg-surface-alt">
                <!-- Item icon -->
                <span class="text-text-muted shrink-0" aria-hidden="true">
                  <IconInventory size={16} />
                </span>

                <!-- Item info -->
                <div class="flex-1 flex flex-col gap-0.5 min-w-0">
                  <span class="text-sm font-medium text-text-primary truncate">
                    {item.customName ?? engine.t(item.feature.label)}
                  </span>
                  <div class="flex items-center gap-1.5 flex-wrap">
                    {#if item.feature.equipmentSlot && item.feature.equipmentSlot !== EQUIPMENT_SLOT_NONE}
                       <span class="badge-gray font-mono text-[10px]">{item.feature.equipmentSlot}</span>
                    {/if}
                    <span class="text-[10px] text-text-muted">{engine.formatWeight(item.feature.weightLbs)}</span>
                     <span class="badge-gray text-[10px]">{ui('inventory.not_carried', engine.settings.language)}</span>
                  </div>
                </div>

                <!-- Action buttons -->
                <div class="flex gap-1 shrink-0">
                   <button
                     class="btn-ghost p-1.5 text-accent hover:bg-accent/10"
                     onclick={() => (modalItemId = item.feature.id)}
                     aria-label={ui('common.item_details_aria', engine.settings.language).replace('{name}', engine.t(item.feature.label))}
                     type="button"
                   ><IconInfo size={14} aria-hidden="true" /></button>
                    <button
                      class="btn-ghost p-1.5 text-text-muted hover:bg-surface-alt text-xs"
                      onclick={() => engine.moveItemFromStash(item.instanceId)}
                      aria-label={ui('inventory.move_to_backpack_aria', engine.settings.language).replace('{name}', engine.t(item.feature.label))}
                      title={ui('inventory.move_to_backpack_title', engine.settings.language)}
                      type="button"
                    ><IconUnequip size={14} aria-hidden="true" /></button>
                   <button
                     class="btn-ghost p-1.5 text-red-400 hover:bg-red-500/10"
                     onclick={() => engine.removeFeature(item.instanceId)}
                     aria-label={ui('common.remove_item_aria', engine.settings.language).replace('{name}', engine.t(item.feature.label))}
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
