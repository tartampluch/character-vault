<!--
  @file src/lib/components/content-editor/ItemDataEditor.svelte
  @description Specialised editor for ItemFeature fields (category: "item" only).

  ────────────────────────────────────────────────────────────────────────────
  SECTIONS (all collapsible <details>):

    §1  GENERAL           — slot, weightLbs, costGp, hardness, hpMax,
                            isUnique toggle, artifactTier dropdown
    §2  WEAPON DATA        — WeaponFieldsEditor (extracted F2a)
    §3  ARMOR DATA         — ArmorFieldsEditor (extracted F2b)
    §4  CONSUMABLE         — collapse-toggle; isConsumable, durationHint
    §5  CHARGED ITEMS      — ChargedItemsEditor (extracted F2c)
    §6  CURSED             — CursedItemEditor (extracted F2d)
    §7  INTELLIGENT ITEM   — IntelligentItemEditor (extracted F2e)

  ────────────────────────────────────────────────────────────────────────────
  CONTEXT USAGE
  ────────────────────────────────────────────────────────────────────────────
  Reads/writes via EditorContext — no props.
  Casts ctx.feature to ItemFeature for TypeScript to access item-specific fields.
  Mutations write directly to the $state proxy; Svelte 5 propagates reactivity.

  ────────────────────────────────────────────────────────────────────────────
  @see src/lib/types/feature.ts   ItemFeature, ActivationTier, etc.
  @see editorContext.ts           EditorContext
  @see WeaponFieldsEditor.svelte  §2
  @see ArmorFieldsEditor.svelte   §3
  @see ChargedItemsEditor.svelte  §5
  @see CursedItemEditor.svelte    §6
  @see IntelligentItemEditor.svelte §7
-->

<script lang="ts">
  import { getContext } from 'svelte';
  import { EDITOR_CONTEXT_KEY, type EditorContext } from './editorContext';
  import type { ItemFeature } from '$lib/types/feature';
  import WeaponFieldsEditor    from './WeaponFieldsEditor.svelte';
  import ArmorFieldsEditor     from './ArmorFieldsEditor.svelte';
  import ChargedItemsEditor    from './ChargedItemsEditor.svelte';
  import CursedItemEditor      from './CursedItemEditor.svelte';
  import IntelligentItemEditor from './IntelligentItemEditor.svelte';

  // ===========================================================================
  // CONTEXT
  // ===========================================================================

  const ctx = getContext<EditorContext>(EDITOR_CONTEXT_KEY);

  /**
   * The feature cast to ItemFeature for TypeScript access to item-specific fields.
   * Because ctx.feature is a $state proxy, all reads and writes are reactive.
   */
  const item = $derived(ctx.feature as unknown as ItemFeature);

  // ===========================================================================
  // EQUIPMENT SLOT OPTIONS
  // ===========================================================================

  const SLOT_OPTIONS = [
    { value: '',          label: '— (none / carry in inventory)' },
    { value: 'head',      label: 'Head' },
    { value: 'eyes',      label: 'Eyes' },
    { value: 'neck',      label: 'Neck' },
    { value: 'torso',     label: 'Torso' },
    { value: 'body',      label: 'Body' },
    { value: 'waist',     label: 'Waist' },
    { value: 'shoulders', label: 'Shoulders' },
    { value: 'arms',      label: 'Arms / Bracers' },
    { value: 'hands',     label: 'Hands / Gloves' },
    { value: 'ring',      label: 'Ring (x2 by default)' },
    { value: 'feet',      label: 'Feet / Boots' },
    { value: 'main_hand', label: 'Main Hand (weapon / shield)' },
    { value: 'off_hand',  label: 'Off Hand (weapon / shield)' },
    { value: 'two_hands', label: 'Two Hands (requires both)' },
    { value: 'none',      label: 'None — unslotted item (can carry many)' },
  ];

  // ===========================================================================
  // CONSUMABLE TOGGLE
  // ===========================================================================

  function toggleConsumable(on: boolean): void {
    (ctx.feature as ItemFeature).consumable = on
      ? { isConsumable: true }
      : undefined;
  }

  // Unique uid for label->input ids
  const uid = Math.random().toString(36).slice(2, 7);
  const fid = (name: string) => `ide-${uid}-${name}`;
</script>

<!-- ======================================================================= -->
<!-- SECTION 1 — GENERAL                                                       -->
<!-- ======================================================================= -->
<details class="group/gen rounded-lg border border-border overflow-hidden" open>
  <summary class="flex items-center justify-between px-4 py-2 bg-surface-alt cursor-pointer
                  select-none list-none hover:bg-accent/5 font-semibold text-sm text-text-primary">
    General
    <svg class="h-4 w-4 text-text-muted transition-transform group-open/gen:rotate-180"
         xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2" stroke-linecap="round"
         stroke-linejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  </summary>

  <div class="grid grid-cols-1 md:grid-cols-3 gap-3 p-4">

    <!-- Equipment slot -->
    <div class="flex flex-col gap-1 md:col-span-3">
      <label for={fid('slot')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        Equipment Slot
      </label>
      <select
        id={fid('slot')}
        class="input text-sm"
        value={item.equipmentSlot ?? ''}
        onchange={(e) => {
          const v = (e.currentTarget as HTMLSelectElement).value;
          (ctx.feature as ItemFeature).equipmentSlot = v
            ? v as ItemFeature['equipmentSlot']
            : undefined;
        }}
      >
        {#each SLOT_OPTIONS as opt (opt.value)}
          <option value={opt.value}>{opt.label}</option>
        {/each}
      </select>
    </div>

    <!-- Weight -->
    <div class="flex flex-col gap-1">
      <label for={fid('wt')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        Weight (lb.)
      </label>
      <input id={fid('wt')} type="number" class="input text-xs" min="0" step="0.5"
             value={item.weightLbs ?? 0}
             oninput={(e) => { (ctx.feature as ItemFeature).weightLbs = parseFloat((e.currentTarget as HTMLInputElement).value) || 0; }}
      />
    </div>

    <!-- Cost -->
    <div class="flex flex-col gap-1">
      <label for={fid('gp')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        Cost (gp)
      </label>
      <input id={fid('gp')} type="number" class="input text-xs" min="0"
             value={item.costGp ?? 0}
             oninput={(e) => { (ctx.feature as ItemFeature).costGp = parseInt((e.currentTarget as HTMLInputElement).value) || 0; }}
      />
    </div>

    <!-- Hardness -->
    <div class="flex flex-col gap-1">
      <label for={fid('hard')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        Hardness <span class="text-[9px] font-normal">(optional)</span>
      </label>
      <input id={fid('hard')} type="number" class="input text-xs" min="0"
             value={item.hardness ?? ''}
             placeholder="e.g. 5"
             oninput={(e) => {
               const v = (e.currentTarget as HTMLInputElement).value.trim();
               (ctx.feature as ItemFeature).hardness = v ? parseInt(v) : undefined;
             }}
      />
    </div>

    <!-- HP Max -->
    <div class="flex flex-col gap-1">
      <label for={fid('hp')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        Item HP Max <span class="text-[9px] font-normal">(optional)</span>
      </label>
      <input id={fid('hp')} type="number" class="input text-xs" min="0"
             value={item.hpMax ?? ''}
             placeholder="e.g. 20"
             oninput={(e) => {
               const v = (e.currentTarget as HTMLInputElement).value.trim();
               (ctx.feature as ItemFeature).hpMax = v ? parseInt(v) : undefined;
             }}
      />
    </div>

    <!-- isUnique toggle + artifactTier -->
    <div class="flex flex-col gap-3 md:col-span-3">
      <label class="flex items-center gap-2 cursor-pointer text-xs">
        <input
          type="checkbox"
          class="h-4 w-4 accent-accent"
          checked={!!(item.tags ?? []).includes('unique')}
          onchange={(e) => {
            const checked = (e.currentTarget as HTMLInputElement).checked;
            const base = (ctx.feature as ItemFeature).tags ?? [];
            (ctx.feature as ItemFeature).tags = checked
              ? [...base.filter(t => t !== 'unique'), 'unique']
              : base.filter(t => t !== 'unique');
          }}
        />
        <span class="font-medium text-text-primary">Unique item</span>
        <span class="text-text-muted">(adds tag <code class="font-mono">unique</code>; prevents duplicate equipping)</span>
      </label>

      <div class="flex flex-col gap-1">
        <label for={fid('atier')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Artifact Tier <span class="font-normal text-[9px]">(optional — leave blank for non-artifacts)</span>
        </label>
        <select
          id={fid('atier')}
          class="input text-sm w-48"
          value={item.artifactTier ?? ''}
          onchange={(e) => {
            const v = (e.currentTarget as HTMLSelectElement).value;
            (ctx.feature as ItemFeature).artifactTier = v ? (v as 'minor' | 'major') : undefined;
          }}
        >
          <option value="">— Not an artifact</option>
          <option value="minor">Minor Artifact</option>
          <option value="major">Major Artifact</option>
        </select>
      </div>
    </div>

  </div>
</details>

<!-- ======================================================================= -->
<!-- SECTION 2 — WEAPON DATA (extracted to WeaponFieldsEditor)                 -->
<!-- ======================================================================= -->
<WeaponFieldsEditor />

<!-- ======================================================================= -->
<!-- SECTION 3 — ARMOR DATA (extracted to ArmorFieldsEditor)                   -->
<!-- ======================================================================= -->
<ArmorFieldsEditor />

<!-- ======================================================================= -->
<!-- SECTION 4 — CONSUMABLE                                                    -->
<!-- ======================================================================= -->
<details class="group/con rounded-lg border border-border overflow-hidden">
  <summary class="flex items-center justify-between px-4 py-2 bg-surface-alt cursor-pointer
                  select-none list-none hover:bg-accent/5 font-semibold text-sm text-text-primary">
    <label class="flex items-center gap-3 cursor-pointer select-none">
      <input type="checkbox" class="h-4 w-4 accent-accent"
             checked={!!item.consumable}
             onchange={(e) => toggleConsumable((e.currentTarget as HTMLInputElement).checked)}
             onclick={(e) => e.stopPropagation()}/>
      Consumable (potion, oil, single-use scroll)
    </label>
    <svg class="h-4 w-4 text-text-muted transition-transform group-open/con:rotate-180"
         xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2" stroke-linecap="round"
         stroke-linejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  </summary>

  {#if item.consumable}
    <div class="p-4 flex flex-col gap-3">
      <p class="text-[11px] text-text-muted">
        When the player uses this item, it is consumed (removed from inventory) and
        its <code class="font-mono">grantedModifiers</code> become active as an
        ephemeral effect the player can expire manually.
      </p>
      <div class="flex flex-col gap-1 w-64">
        <label for={fid('dur')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Duration Hint <span class="font-normal text-[9px]">(optional — purely cosmetic)</span>
        </label>
        <input id={fid('dur')} type="text" class="input text-sm"
               value={item.consumable.durationHint ?? ''}
               placeholder="e.g. 3 min, 10 rounds, 1 hour"
               oninput={(e) => {
                 const v = (e.currentTarget as HTMLInputElement).value.trim();
                 if (item.consumable) {
                   item.consumable = { isConsumable: true, durationHint: v || undefined };
                 }
               }}/>
      </div>
    </div>
  {:else}
    <div class="px-4 py-3 text-xs text-text-muted italic">
      Enable for potions, oils, and single-use scrolls that are destroyed on use.
      Charged items (wands, rods, rings) use Resource Pools instead — they are not consumed.
    </div>
  {/if}
</details>

<!-- ======================================================================= -->
<!-- SECTION 5 — CHARGED ITEMS (extracted to ChargedItemsEditor)               -->
<!-- ======================================================================= -->
<ChargedItemsEditor />

<!-- ======================================================================= -->
<!-- SECTION 6 — CURSED (extracted to CursedItemEditor)                        -->
<!-- ======================================================================= -->
<CursedItemEditor />

<!-- ======================================================================= -->
<!-- SECTION 7 — INTELLIGENT ITEM (extracted to IntelligentItemEditor)         -->
<!-- ======================================================================= -->
<IntelligentItemEditor />
