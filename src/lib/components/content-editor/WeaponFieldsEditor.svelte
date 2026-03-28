<!--
  @file src/lib/components/content-editor/WeaponFieldsEditor.svelte
  @description Weapon Data section (Section 2) for ItemDataEditor.
  Extracted from ItemDataEditor.svelte as part of F2a refactoring.
  Reads/writes via EditorContext (no props).
-->

<script lang="ts">
  import { getContext } from 'svelte';
  import { EDITOR_CONTEXT_KEY, type EditorContext } from './editorContext';
  import type { ItemFeature } from '$lib/types/feature';
  import TagPickerModal from './TagPickerModal.svelte';

  const ctx = getContext<EditorContext>(EDITOR_CONTEXT_KEY);
  const item = $derived(ctx.feature as unknown as ItemFeature);

  const WIELD_OPTIONS = [
    { value: 'light',      label: 'Light',      hint: 'One-handed; off-hand without penalty' },
    { value: 'one_handed', label: 'One-Handed',  hint: 'Standard grip; 1.5× STR when 2-handed' },
    { value: 'two_handed', label: 'Two-Handed',  hint: 'Always requires both hands' },
    { value: 'double',     label: 'Double',      hint: 'Two attack ends (quarterstaff, dire flail)' },
  ];

  let showDamageTypePicker    = $state(false);
  let showSecDamageTypePicker = $state(false);

  function toggleWeaponData(on: boolean): void {
    (ctx.feature as ItemFeature).weaponData = on
      ? { wieldCategory: 'one_handed', damageDice: '1d8', damageType: ['slashing'],
          critRange: '20', critMultiplier: 2, reachFt: 5 }
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

  const uid = Math.random().toString(36).slice(2, 7);
  const fid = (name: string) => `wfe-${uid}-${name}`;
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
