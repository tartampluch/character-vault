<!--
  @file src/lib/components/content-editor/ItemDataEditor.svelte
  @description Specialised editor for ItemFeature fields (category: "item" only).

  ────────────────────────────────────────────────────────────────────────────
  SECTIONS (all collapsible <details>):

    §1  GENERAL           — slot, weightLbs, costGp, hardness, hpMax,
                            isUnique toggle, artifactTier dropdown
    §2  WEAPON DATA        — collapse-toggle; wieldCategory, damageDice,
                            damageType chips, critRange, critMultiplier,
                            reachFt, rangeIncrementFt, secondaryWeaponData
                            nested collapsible, onCritDice sub-form
    §3  ARMOR DATA         — collapse-toggle; armorBonus, maxDex,
                            armorCheckPenalty, arcaneSpellFailure
    §4  CONSUMABLE         — collapse-toggle; isConsumable, durationHint

    §5  CHARGED ITEMS      — TODO 21.4.4 placeholder (compiles clean)
    §6  CURSED             — TODO 21.4.4 placeholder
    §7  INTELLIGENT ITEM   — TODO 21.4.4 placeholder

  ────────────────────────────────────────────────────────────────────────────
  CONTEXT USAGE
  ────────────────────────────────────────────────────────────────────────────
  Reads/writes via EditorContext — no props.
  Casts ctx.feature to ItemFeature for TypeScript to access item-specific fields.
  Mutations write directly to the $state proxy; Svelte 5 propagates reactivity.

  ────────────────────────────────────────────────────────────────────────────
  @see src/lib/types/feature.ts   ItemFeature, ActivationTier, etc.
  @see editorContext.ts           EditorContext
  @see TagPickerModal.svelte      for damageType chips
  @see ARCHITECTURE.md §5 (item)  for ItemFeature field semantics
-->

<script lang="ts">
  import { getContext } from 'svelte';
  import { EDITOR_CONTEXT_KEY, type EditorContext } from './editorContext';
  import type { ItemFeature } from '$lib/types/feature';
  import TagPickerModal from './TagPickerModal.svelte';

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
  // WEAPON DATA — WIELD CATEGORY
  // ===========================================================================

  const WIELD_OPTIONS = [
    { value: 'light',      label: 'Light',      hint: 'One-handed; off-hand without penalty' },
    { value: 'one_handed', label: 'One-Handed',  hint: 'Standard grip; 1.5× STR when 2-handed' },
    { value: 'two_handed', label: 'Two-Handed',  hint: 'Always requires both hands' },
    { value: 'double',     label: 'Double',      hint: 'Two attack ends (quarterstaff, dire flail)' },
  ];

  // ===========================================================================
  // DAMAGE TYPE TAG PICKER
  // ===========================================================================

  let showDamageTypePicker     = $state(false);
  let showSecDamageTypePicker  = $state(false);

  // ===========================================================================
  // TOGGLE HELPERS — add/remove optional sub-objects
  // ===========================================================================

  function toggleWeaponData(on: boolean): void {
    (ctx.feature as ItemFeature).weaponData = on
      ? { wieldCategory: 'one_handed', damageDice: '1d8', damageType: ['slashing'],
          critRange: '20', critMultiplier: 2, reachFt: 5 }
      : undefined;
  }

  function toggleArmorData(on: boolean): void {
    (ctx.feature as ItemFeature).armorData = on
      ? { armorBonus: 0, maxDex: 99, armorCheckPenalty: 0, arcaneSpellFailure: 0 }
      : undefined;
  }

  function toggleConsumable(on: boolean): void {
    (ctx.feature as ItemFeature).consumable = on
      ? { isConsumable: true }
      : undefined;
  }

  function toggleSecondaryWeapon(on: boolean): void {
    const wd = (ctx.feature as ItemFeature).weaponData;
    if (!wd) return;
    wd.secondaryWeaponData = on
      ? { damageDice: '1d6', damageType: ['bludgeoning'], critRange: '20', critMultiplier: 2 }
      : undefined;
  }

  function toggleOnCritDice(on: boolean): void {
    const wd = (ctx.feature as ItemFeature).weaponData;
    if (!wd) return;
    wd.onCritDice = on
      ? { baseDiceFormula: '1d10', damageType: 'fire', scalesWithCritMultiplier: true }
      : undefined;
  }

  // Unique uid for label->input ids
  const uid = Math.random().toString(36).slice(2, 7);
  const fid = (name: string) => `ide-${uid}-${name}`;
</script>

<!-- Damage type pickers -->
{#if showDamageTypePicker}
  <TagPickerModal
    initialSelected={(ctx.feature as ItemFeature).weaponData?.damageType ?? []}
    onTagsPicked={(tags) => {
      const wd = (ctx.feature as ItemFeature).weaponData;
      if (wd) wd.damageType = tags;
      showDamageTypePicker = false;
    }}
    onclose={() => (showDamageTypePicker = false)}
  />
{/if}
{#if showSecDamageTypePicker}
  <TagPickerModal
    initialSelected={(ctx.feature as ItemFeature).weaponData?.secondaryWeaponData?.damageType ?? []}
    onTagsPicked={(tags) => {
      const sd = (ctx.feature as ItemFeature).weaponData?.secondaryWeaponData;
      if (sd) sd.damageType = tags;
      showSecDamageTypePicker = false;
    }}
    onclose={() => (showSecDamageTypePicker = false)}
  />
{/if}

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
<!-- SECTION 2 — WEAPON DATA                                                   -->
<!-- ======================================================================= -->
<details class="group/wpn rounded-lg border border-border overflow-hidden">
  <summary class="flex items-center justify-between px-4 py-2 bg-surface-alt cursor-pointer
                  select-none list-none hover:bg-accent/5 font-semibold text-sm text-text-primary">
    <label class="flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        class="h-4 w-4 accent-accent"
        checked={!!item.weaponData}
        onchange={(e) => toggleWeaponData((e.currentTarget as HTMLInputElement).checked)}
        onclick={(e) => e.stopPropagation()}
      />
      Weapon Data
    </label>
    <svg class="h-4 w-4 text-text-muted transition-transform group-open/wpn:rotate-180"
         xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2" stroke-linecap="round"
         stroke-linejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  </summary>

  {#if item.weaponData}
    {@const wd = item.weaponData}
    <div class="grid grid-cols-1 md:grid-cols-3 gap-3 p-4">

      <!-- Wield Category -->
      <div class="flex flex-col gap-1 md:col-span-2">
        <label for={fid('wcat')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Wield Category
        </label>
        <select id={fid('wcat')} class="input text-sm"
                value={wd.wieldCategory}
                onchange={(e) => { wd.wieldCategory = (e.currentTarget as HTMLSelectElement).value as typeof wd.wieldCategory; }}>
          {#each WIELD_OPTIONS as wo (wo.value)}
            <option value={wo.value}>{wo.label} — {wo.hint}</option>
          {/each}
        </select>
      </div>

      <!-- Damage Dice -->
      <div class="flex flex-col gap-1">
        <label for={fid('ddice')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Damage Dice
        </label>
        <input id={fid('ddice')} type="text" class="input font-mono text-xs"
               value={wd.damageDice} placeholder="e.g. 1d8"
               oninput={(e) => { wd.damageDice = (e.currentTarget as HTMLInputElement).value; }}
               autocomplete="off" spellcheck="false"/>
      </div>

      <!-- Damage Types (chips) -->
      <div class="flex flex-col gap-1 md:col-span-2">
        <div class="flex items-center justify-between">
          <span class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Damage Types</span>
          <button type="button" class="btn-ghost text-xs py-0.5 px-2 h-auto"
                  onclick={() => (showDamageTypePicker = true)}>Edit Tags</button>
        </div>
        <div class="flex flex-wrap gap-1.5 min-h-[2rem]">
          {#each (wd.damageType ?? []) as dt (dt)}
            <span class="badge font-mono text-[10px]">{dt}</span>
          {/each}
          {#if !(wd.damageType ?? []).length}
            <span class="text-xs text-text-muted italic">No damage types.</span>
          {/if}
        </div>
      </div>

      <!-- Crit Range -->
      <div class="flex flex-col gap-1">
        <label for={fid('cr')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Crit Range
        </label>
        <input id={fid('cr')} type="text" class="input font-mono text-xs"
               value={wd.critRange} placeholder="e.g. 20 or 19-20"
               oninput={(e) => { wd.critRange = (e.currentTarget as HTMLInputElement).value; }}
               autocomplete="off"/>
      </div>

      <!-- Crit Multiplier -->
      <div class="flex flex-col gap-1">
        <label for={fid('cm')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Crit Multiplier (×)
        </label>
        <input id={fid('cm')} type="number" class="input text-xs" min="2" max="6"
               value={wd.critMultiplier}
               oninput={(e) => { wd.critMultiplier = parseInt((e.currentTarget as HTMLInputElement).value) || 2; }}/>
      </div>

      <!-- Reach -->
      <div class="flex flex-col gap-1">
        <label for={fid('rch')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Reach (ft.)
        </label>
        <input id={fid('rch')} type="number" class="input text-xs" min="0" step="5"
               value={wd.reachFt}
               oninput={(e) => { wd.reachFt = parseInt((e.currentTarget as HTMLInputElement).value) || 5; }}/>
      </div>

      <!-- Range Increment -->
      <div class="flex flex-col gap-1">
        <label for={fid('ri')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Range Increment (ft.) <span class="font-normal text-[9px]">— ranged only</span>
        </label>
        <input id={fid('ri')} type="number" class="input text-xs" min="0" step="10"
               value={wd.rangeIncrementFt ?? ''}
               placeholder="blank = melee"
               oninput={(e) => {
                 const v = (e.currentTarget as HTMLInputElement).value.trim();
                 wd.rangeIncrementFt = v ? parseInt(v) : undefined;
               }}/>
      </div>

      <!-- Secondary Weapon Data (double weapons only) -->
      <div class="md:col-span-3">
        <details class="group/sec rounded border border-border overflow-hidden">
          <summary class="flex items-center gap-3 px-3 py-2 bg-surface cursor-pointer
                          select-none list-none text-xs font-semibold text-text-muted hover:text-text-primary">
            <label class="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" class="h-3.5 w-3.5 accent-accent"
                     checked={!!wd.secondaryWeaponData}
                     onchange={(e) => toggleSecondaryWeapon((e.currentTarget as HTMLInputElement).checked)}
                     onclick={(e) => e.stopPropagation()}/>
              Secondary Weapon End (double weapons)
            </label>
          </summary>
          {#if wd.secondaryWeaponData}
            {@const sec = wd.secondaryWeaponData}
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 p-3">
              <div class="flex flex-col gap-1">
                <label for={fid('sdice')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Damage Dice</label>
                <input id={fid('sdice')} type="text" class="input font-mono text-xs"
                       value={sec.damageDice} placeholder="e.g. 1d6"
                       oninput={(e) => { sec.damageDice = (e.currentTarget as HTMLInputElement).value; }}/>
              </div>
              <div class="flex flex-col gap-1">
                <span class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Damage Types</span>
                <div class="flex flex-wrap gap-1 mt-0.5">
                  {#each (sec.damageType ?? []) as dt (dt)}
                    <span class="badge font-mono text-[10px]">{dt}</span>
                  {/each}
                  <button type="button" class="btn-ghost text-[10px] py-0 px-1.5 h-auto"
                          onclick={() => (showSecDamageTypePicker = true)}>Edit</button>
                </div>
              </div>
              <div class="flex flex-col gap-1">
                <label for={fid('scr')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Crit Range</label>
                <input id={fid('scr')} type="text" class="input font-mono text-xs"
                       value={sec.critRange} placeholder="20"
                       oninput={(e) => { sec.critRange = (e.currentTarget as HTMLInputElement).value; }}/>
              </div>
              <div class="flex flex-col gap-1">
                <label for={fid('scm')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Crit ×</label>
                <input id={fid('scm')} type="number" class="input text-xs" min="2" max="6"
                       value={sec.critMultiplier}
                       oninput={(e) => { sec.critMultiplier = parseInt((e.currentTarget as HTMLInputElement).value) || 2; }}/>
              </div>
            </div>
          {/if}
        </details>
      </div>

      <!-- On-Crit Dice (Burst weapons) -->
      <div class="md:col-span-3">
        <details class="group/crit rounded border border-border overflow-hidden">
          <summary class="flex items-center gap-3 px-3 py-2 bg-surface cursor-pointer
                          select-none list-none text-xs font-semibold text-text-muted hover:text-text-primary">
            <label class="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" class="h-3.5 w-3.5 accent-accent"
                     checked={!!wd.onCritDice}
                     onchange={(e) => toggleOnCritDice((e.currentTarget as HTMLInputElement).checked)}
                     onclick={(e) => e.stopPropagation()}/>
              On-Crit Bonus Dice (Burst weapons: Flaming Burst, Thundering, etc.)
            </label>
          </summary>
          {#if wd.onCritDice}
            {@const ocd = wd.onCritDice}
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3 p-3">
              <div class="flex flex-col gap-1">
                <label for={fid('ocdf')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Dice Formula (×2 baseline)</label>
                <input id={fid('ocdf')} type="text" class="input font-mono text-xs"
                       value={ocd.baseDiceFormula} placeholder="e.g. 1d10"
                       oninput={(e) => { ocd.baseDiceFormula = (e.currentTarget as HTMLInputElement).value; }}/>
              </div>
              <div class="flex flex-col gap-1">
                <label for={fid('ocdt')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Damage Type</label>
                <input id={fid('ocdt')} type="text" class="input font-mono text-xs"
                       value={ocd.damageType} placeholder="e.g. fire, cold, sonic"
                       oninput={(e) => { ocd.damageType = (e.currentTarget as HTMLInputElement).value; }}/>
              </div>
              <div class="flex flex-col gap-1 justify-end">
                <label class="flex items-center gap-2 cursor-pointer text-xs">
                  <input type="checkbox" class="h-3.5 w-3.5 accent-accent"
                         checked={ocd.scalesWithCritMultiplier}
                         onchange={(e) => { ocd.scalesWithCritMultiplier = (e.currentTarget as HTMLInputElement).checked; }}/>
                  <span>Scales with crit multiplier (×2→+1d, ×3→+2d, ×4→+3d)</span>
                </label>
              </div>
            </div>
          {/if}
        </details>
      </div>

    </div>
  {:else}
    <div class="px-4 py-3 text-xs text-text-muted italic">
      Enable the checkbox above to add weapon statistics to this item.
    </div>
  {/if}
</details>

<!-- ======================================================================= -->
<!-- SECTION 3 — ARMOR DATA                                                    -->
<!-- ======================================================================= -->
<details class="group/arm rounded-lg border border-border overflow-hidden">
  <summary class="flex items-center justify-between px-4 py-2 bg-surface-alt cursor-pointer
                  select-none list-none hover:bg-accent/5 font-semibold text-sm text-text-primary">
    <label class="flex items-center gap-3 cursor-pointer select-none">
      <input type="checkbox" class="h-4 w-4 accent-accent"
             checked={!!item.armorData}
             onchange={(e) => toggleArmorData((e.currentTarget as HTMLInputElement).checked)}
             onclick={(e) => e.stopPropagation()}/>
      Armor / Shield Data
    </label>
    <svg class="h-4 w-4 text-text-muted transition-transform group-open/arm:rotate-180"
         xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2" stroke-linecap="round"
         stroke-linejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  </summary>

  {#if item.armorData}
    {@const ad = item.armorData}
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 p-4">
      <div class="flex flex-col gap-1">
        <label for={fid('ab')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Armor Bonus</label>
        <input id={fid('ab')} type="number" class="input text-xs" min="0"
               value={ad.armorBonus}
               oninput={(e) => { ad.armorBonus = parseInt((e.currentTarget as HTMLInputElement).value) || 0; }}/>
      </div>
      <div class="flex flex-col gap-1">
        <label for={fid('md')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Max DEX Bonus</label>
        <input id={fid('md')} type="number" class="input text-xs" min="0"
               value={ad.maxDex === 99 ? '' : ad.maxDex}
               placeholder="blank = no cap"
               oninput={(e) => {
                 const v = (e.currentTarget as HTMLInputElement).value.trim();
                 ad.maxDex = v ? parseInt(v) : 99;
               }}/>
      </div>
      <div class="flex flex-col gap-1">
        <label for={fid('acp')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Armor Check Penalty
        </label>
        <input id={fid('acp')} type="number" class="input text-xs" max="0"
               value={ad.armorCheckPenalty}
               title="Enter as a negative number (e.g. -6) or a positive number (stored as-is)"
               oninput={(e) => { ad.armorCheckPenalty = parseInt((e.currentTarget as HTMLInputElement).value) || 0; }}/>
      </div>
      <div class="flex flex-col gap-1">
        <label for={fid('asf')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Arcane Spell Failure (%)
        </label>
        <input id={fid('asf')} type="number" class="input text-xs" min="0" max="100"
               value={ad.arcaneSpellFailure}
               oninput={(e) => { ad.arcaneSpellFailure = parseInt((e.currentTarget as HTMLInputElement).value) || 0; }}/>
      </div>
    </div>
  {:else}
    <div class="px-4 py-3 text-xs text-text-muted italic">
      Enable for armour, shields, and items that apply an armor or shield bonus to AC.
    </div>
  {/if}
</details>

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
<!-- TODO 21.4.4 — CHARGED ITEMS, CURSED, INTELLIGENT ITEM                    -->
<!-- These sections are implemented in task 21.4.4.                            -->
<!-- The placeholders below ensure the file compiles cleanly.                  -->
<!-- ======================================================================= -->

<!-- TODO 21.4.4: Charged Items section (Wand / Staff / Scroll / Metamagic Rod tabs) -->

<!-- TODO 21.4.4: Cursed section (isCursed, removableBy chip list, preventionNote) -->

<!-- TODO 21.4.4: Intelligent Item section (INT/WIS/CHA, egoScore, alignment,
     communication, senses, languages, specialPurpose, dedicatedPower) -->
