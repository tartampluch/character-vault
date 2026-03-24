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

    §5  CHARGED ITEMS      — Wand, Staff, Scroll, Metamagic Rod (21.4.4)
    §6  CURSED             — removalPrevention, removableBy chips, note (21.4.4)
    §7  INTELLIGENT ITEM   — INT/WIS/CHA, egoScore, alignment, comms,
                             senses, languages, powers, purpose (21.4.4)

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
  import FeaturePickerModal from './FeaturePickerModal.svelte';

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

  // ===========================================================================
  // 21.4.4 — CHARGED ITEMS toggle helpers / state
  // ===========================================================================

  const METAMAGIC_FEATS = [
    { value: 'feat_empower_spell',  label: 'Empower Spell',  hint: 'All variable numeric effects ×1.5' },
    { value: 'feat_enlarge_spell',  label: 'Enlarge Spell',  hint: 'Doubles range' },
    { value: 'feat_extend_spell',   label: 'Extend Spell',   hint: 'Doubles duration' },
    { value: 'feat_maximize_spell', label: 'Maximize Spell', hint: 'All variable effects are maximum' },
    { value: 'feat_quicken_spell',  label: 'Quicken Spell',  hint: 'Free-action casting (once/round)' },
    { value: 'feat_silent_spell',   label: 'Silent Spell',   hint: 'No verbal component required' },
  ];

  function toggleWand(on: boolean): void {
    (ctx.feature as ItemFeature).wandSpell = on
      ? { spellId: '', casterLevel: 1 }
      : undefined;
  }
  function toggleStaff(on: boolean): void {
    (ctx.feature as ItemFeature).staffSpells = on ? [] : undefined;
  }
  function toggleScroll(on: boolean): void {
    (ctx.feature as ItemFeature).scrollSpells = on ? [] : undefined;
  }
  function toggleRod(on: boolean): void {
    (ctx.feature as ItemFeature).metamagicEffect = on
      ? { feat: 'feat_empower_spell', maxSpellLevel: 3 }
      : undefined;
  }

  // Staff spell management
  function addStaffSpell(): void {
    const item2 = ctx.feature as ItemFeature;
    item2.staffSpells = [...(item2.staffSpells ?? []), { spellId: '', chargeCost: 1 }];
  }
  function removeStaffSpell(i: number): void {
    const item2 = ctx.feature as ItemFeature;
    item2.staffSpells = (item2.staffSpells ?? []).filter((_, k) => k !== i);
  }
  function patchStaffSpell(i: number, patch: Partial<{ spellId: string; chargeCost: 1|2|3|4|5; spellLevel?: number }>): void {
    const item2 = ctx.feature as ItemFeature;
    const arr = [...(item2.staffSpells ?? [])];
    arr[i] = { ...arr[i], ...patch } as typeof arr[0];
    item2.staffSpells = arr;
  }

  // Scroll spell management
  type ScrollEntry = NonNullable<ItemFeature['scrollSpells']>[number];
  function addScrollSpell(): void {
    const item2 = ctx.feature as ItemFeature;
    const blank: ScrollEntry = { spellId: '', casterLevel: 1, spellLevel: 1, spellType: 'arcane' };
    item2.scrollSpells = [...(item2.scrollSpells ?? [] as ScrollEntry[]), blank];
  }
  function removeScrollSpell(i: number): void {
    const item2 = ctx.feature as ItemFeature;
    item2.scrollSpells = ((item2.scrollSpells ?? []) as ScrollEntry[]).filter((_, k) => k !== i);
  }
  function patchScrollSpell(i: number, patch: Partial<ScrollEntry>): void {
    const item2 = ctx.feature as ItemFeature;
    const arr = [...((item2.scrollSpells ?? []) as ScrollEntry[])];
    arr[i] = { ...arr[i], ...patch } as ScrollEntry;
    item2.scrollSpells = arr;
  }

  // Spell picker state for Staff / Scroll pickers
  type SpellPickerTarget = { kind: 'wand' } | { kind: 'staff'; index: number } | { kind: 'scroll'; index: number } | null;
  let spellPickerTarget = $state<SpellPickerTarget>(null);

  // ===========================================================================
  // 21.4.4 — CURSED toggle
  // ===========================================================================

  function toggleCursed(on: boolean): void {
    (ctx.feature as ItemFeature).removalPrevention = on
      ? { isCursed: true, removableBy: [], preventionNote: '' }
      : undefined;
  }

  let showCursedTagPicker = $state(false);

  // ===========================================================================
  // 21.4.4 — INTELLIGENT ITEM toggle + ego
  // ===========================================================================

  function toggleIntelligent(on: boolean): void {
    (ctx.feature as ItemFeature).intelligentItemData = on
      ? {
          intelligenceScore: 10, wisdomScore: 10, charismaScore: 10,
          egoScore: 0, alignment: 'true_neutral', communication: 'empathy',
          senses: { visionFt: 30, darkvisionFt: 0, blindsense: false },
          languages: [], lesserPowers: 0, greaterPowers: 0,
          specialPurpose: null, dedicatedPower: null,
        }
      : undefined;
  }

  /** Whether the GM is manually overriding the auto-computed ego score. */
  let egoManualOverride = $state(false);

  /** Auto-computed Ego score from the intelligent item stats (SRD formula). */
  const autoEgo = $derived.by((): number => {
    const d = (ctx.feature as ItemFeature).intelligentItemData;
    if (!d) return 0;
    const intBonus  = Math.floor((d.intelligenceScore - 10) / 2);
    const wisBonus  = Math.floor((d.wisdomScore       - 10) / 2);
    const chaBonus  = Math.floor((d.charismaScore     - 10) / 2);
    const teleBonus = d.communication === 'telepathy' ? 1 : 0;
    const purposeBonus = (d.specialPurpose && d.dedicatedPower) ? 4 : 0;
    return Math.max(0,
      (d.lesserPowers  * 1)
      + (d.greaterPowers * 2)
      + purposeBonus
      + teleBonus
      + intBonus + wisBonus + chaBonus
    );
  });

  const ALIGNMENT_OPTIONS = [
    { value: 'lawful_good',    label: 'Lawful Good' },
    { value: 'lawful_neutral', label: 'Lawful Neutral' },
    { value: 'lawful_evil',    label: 'Lawful Evil' },
    { value: 'neutral_good',   label: 'Neutral Good' },
    { value: 'true_neutral',   label: 'True Neutral' },
    { value: 'neutral_evil',   label: 'Neutral Evil' },
    { value: 'chaotic_good',   label: 'Chaotic Good' },
    { value: 'chaotic_neutral',label: 'Chaotic Neutral' },
    { value: 'chaotic_evil',   label: 'Chaotic Evil' },
  ];
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
<!-- SECTION 5 — CHARGED ITEMS (Wand / Staff / Scroll / Metamagic Rod)        -->
<!-- ======================================================================= -->

<!-- Spell pickers for Wand / Staff / Scroll -->
{#if spellPickerTarget !== null}
  {@const target = spellPickerTarget}
  <FeaturePickerModal
    filterCategory="magic"
    onFeaturePicked={(ids) => {
      const id = ids[0] ?? '';
      if (target.kind === 'wand') {
        const wd = (ctx.feature as ItemFeature).wandSpell;
        if (wd) wd.spellId = id;
      } else if (target.kind === 'staff') {
        patchStaffSpell(target.index, { spellId: id });
      } else if (target.kind === 'scroll') {
        patchScrollSpell(target.index, { spellId: id });
      }
      spellPickerTarget = null;
    }}
    onclose={() => (spellPickerTarget = null)}
  />
{/if}

<details class="group/chg rounded-lg border border-border overflow-hidden">
  <summary class="flex items-center justify-between px-4 py-2 bg-surface-alt cursor-pointer
                  select-none list-none hover:bg-accent/5 text-sm font-semibold text-text-primary">
    Charged Items (Wand / Staff / Scroll / Metamagic Rod)
    <svg class="h-4 w-4 text-text-muted transition-transform group-open/chg:rotate-180"
         xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2" stroke-linecap="round"
         stroke-linejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  </summary>

  <div class="p-4 flex flex-col gap-4">

    <!-- ── WAND ─────────────────────────────────────────────────────────── -->
    <div class="flex flex-col gap-2 rounded border border-border p-3">
      <label class="flex items-center gap-2 cursor-pointer text-xs font-semibold select-none">
        <input type="checkbox" class="h-3.5 w-3.5 accent-accent"
               checked={!!(ctx.feature as ItemFeature).wandSpell}
               onchange={(e) => toggleWand((e.currentTarget as HTMLInputElement).checked)}
               onclick={(e) => e.stopPropagation()}/>
        Wand (single spell, fixed CL)
      </label>
      {#if (ctx.feature as ItemFeature).wandSpell}
        {@const ws = (ctx.feature as ItemFeature).wandSpell!}
        <div class="grid grid-cols-1 md:grid-cols-3 gap-2 mt-1">
          <div class="flex flex-col gap-1 md:col-span-2">
            <label for={fid('wand-spell')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Spell</label>
            <button id={fid('wand-spell')} type="button"
                    class="input text-xs text-left font-mono {ws.spellId ? 'text-text-primary' : 'text-text-muted italic'}"
                    onclick={() => (spellPickerTarget = { kind: 'wand' })}>
              {ws.spellId || 'Click to pick spell…'}
            </button>
          </div>
          <div class="flex flex-col gap-1">
            <label for={fid('wand-cl')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Caster Level</label>
            <input id={fid('wand-cl')} type="number" class="input text-xs" min="1" max="20"
                   value={ws.casterLevel}
                   oninput={(e) => { ws.casterLevel = parseInt((e.currentTarget as HTMLInputElement).value) || 1; }}/>
          </div>
          <div class="flex flex-col gap-1">
            <label for={fid('wand-sl')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              Spell Level override <span class="font-normal text-[9px]">(heightened only)</span>
            </label>
            <input id={fid('wand-sl')} type="number" class="input text-xs" min="1" max="9"
                   value={ws.spellLevel ?? ''}
                   placeholder="blank = base level"
                   oninput={(e) => {
                     const v = (e.currentTarget as HTMLInputElement).value.trim();
                     ws.spellLevel = v ? parseInt(v) : undefined;
                   }}/>
          </div>
        </div>
      {/if}
    </div>

    <!-- ── STAFF ─────────────────────────────────────────────────────────── -->
    <div class="flex flex-col gap-2 rounded border border-border p-3">
      <label class="flex items-center gap-2 cursor-pointer text-xs font-semibold select-none">
        <input type="checkbox" class="h-3.5 w-3.5 accent-accent"
               checked={!!(ctx.feature as ItemFeature).staffSpells}
               onchange={(e) => toggleStaff((e.currentTarget as HTMLInputElement).checked)}
               onclick={(e) => e.stopPropagation()}/>
        Staff (multiple spells, wielder CL, charge-based)
      </label>
      {#if (ctx.feature as ItemFeature).staffSpells}
        {@const ss = (ctx.feature as ItemFeature).staffSpells!}
        <div class="flex flex-col gap-2">
          {#each ss as entry, i (i)}
            <div class="flex items-center gap-2 p-2 rounded border border-border/50 bg-surface">
              <button type="button"
                      class="input text-xs font-mono flex-1 text-left {entry.spellId ? 'text-text-primary' : 'text-text-muted italic'}"
                      onclick={() => (spellPickerTarget = { kind: 'staff', index: i })}>
                {entry.spellId || 'Pick spell…'}
              </button>
              <div class="flex flex-col gap-0.5 shrink-0 w-20">
                <label for={fid(`ss-cost-${i}`)} class="text-[9px] text-text-muted">Charges</label>
                <select id={fid(`ss-cost-${i}`)} class="input text-xs py-0.5"
                        value={entry.chargeCost}
                        onchange={(e) => patchStaffSpell(i, { chargeCost: parseInt((e.currentTarget as HTMLSelectElement).value) as 1|2|3|4|5 })}>
                  {#each [1,2,3,4,5] as c (c)}<option value={c}>{c}</option>{/each}
                </select>
              </div>
              <button type="button" class="btn-ghost btn-icon h-7 w-7 p-0 text-text-muted hover:text-danger shrink-0"
                      onclick={() => removeStaffSpell(i)} aria-label="Remove staff spell {i+1}">
                <svg class="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
                     fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          {/each}
          <button type="button" class="btn-ghost text-xs py-0.5" onclick={addStaffSpell}>+ Add Spell</button>
        </div>
      {/if}
    </div>

    <!-- ── SCROLL ────────────────────────────────────────────────────────── -->
    <div class="flex flex-col gap-2 rounded border border-border p-3">
      <label class="flex items-center gap-2 cursor-pointer text-xs font-semibold select-none">
        <input type="checkbox" class="h-3.5 w-3.5 accent-accent"
               checked={!!(ctx.feature as ItemFeature).scrollSpells}
               onchange={(e) => toggleScroll((e.currentTarget as HTMLInputElement).checked)}
               onclick={(e) => e.stopPropagation()}/>
        Scroll (spell array, fixed CL per entry, arcane/divine type)
      </label>
      {#if (ctx.feature as ItemFeature).scrollSpells}
        {@const scr = (ctx.feature as ItemFeature).scrollSpells!}
        <div class="flex flex-col gap-2">
          {#each scr as entry, i (i)}
            <div class="grid grid-cols-2 md:grid-cols-5 gap-2 p-2 rounded border border-border/50 bg-surface items-end">
              <div class="flex flex-col gap-0.5 md:col-span-2">
                <label for={fid(`sc-spell-${i}`)} class="text-[9px] text-text-muted">Spell</label>
                <button id={fid(`sc-spell-${i}`)} type="button"
                        class="input text-xs font-mono text-left {entry.spellId ? 'text-text-primary' : 'text-text-muted italic'}"
                        onclick={() => (spellPickerTarget = { kind: 'scroll', index: i })}>
                  {entry.spellId || 'Pick spell…'}
                </button>
              </div>
              <div class="flex flex-col gap-0.5">
                <label for={fid(`sc-cl-${i}`)} class="text-[9px] text-text-muted">CL</label>
                <input id={fid(`sc-cl-${i}`)} type="number" class="input text-xs" min="1" max="20"
                       value={entry.casterLevel}
                       oninput={(e) => patchScrollSpell(i, { casterLevel: parseInt((e.currentTarget as HTMLInputElement).value) || 1 })}/>
              </div>
              <div class="flex flex-col gap-0.5">
                <label for={fid(`sc-sl-${i}`)} class="text-[9px] text-text-muted">Spell Lvl</label>
                <input id={fid(`sc-sl-${i}`)} type="number" class="input text-xs" min="0" max="9"
                       value={entry.spellLevel}
                       oninput={(e) => patchScrollSpell(i, { spellLevel: parseInt((e.currentTarget as HTMLInputElement).value) || 0 })}/>
              </div>
              <div class="flex items-end gap-1">
                <div class="flex flex-col gap-0.5 flex-1">
                  <label for={fid(`sc-type-${i}`)} class="text-[9px] text-text-muted">Type</label>
                  <select id={fid(`sc-type-${i}`)} class="input text-xs"
                          value={entry.spellType}
                          onchange={(e) => patchScrollSpell(i, { spellType: (e.currentTarget as HTMLSelectElement).value as 'arcane'|'divine' })}>
                    <option value="arcane">Arcane</option>
                    <option value="divine">Divine</option>
                  </select>
                </div>
                <button type="button" class="btn-ghost btn-icon h-7 w-7 p-0 text-text-muted hover:text-danger mb-0.5 shrink-0"
                        onclick={() => removeScrollSpell(i)} aria-label="Remove scroll spell {i+1}">
                  <svg class="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
                       fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            </div>
          {/each}
          <button type="button" class="btn-ghost text-xs py-0.5" onclick={addScrollSpell}>+ Add Spell</button>
        </div>
      {/if}
    </div>

    <!-- ── METAMAGIC ROD ─────────────────────────────────────────────────── -->
    <div class="flex flex-col gap-2 rounded border border-border p-3">
      <label class="flex items-center gap-2 cursor-pointer text-xs font-semibold select-none">
        <input type="checkbox" class="h-3.5 w-3.5 accent-accent"
               checked={!!(ctx.feature as ItemFeature).metamagicEffect}
               onchange={(e) => toggleRod((e.currentTarget as HTMLInputElement).checked)}
               onclick={(e) => e.stopPropagation()}/>
        Metamagic Rod (grants a metamagic feat at no slot cost, 3/day)
      </label>
      {#if (ctx.feature as ItemFeature).metamagicEffect}
        {@const me = (ctx.feature as ItemFeature).metamagicEffect!}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div class="flex flex-col gap-1">
            <label for={fid('rod-feat')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Metamagic Feat</label>
            <select id={fid('rod-feat')} class="input text-sm"
                    value={me.feat}
                    onchange={(e) => { me.feat = (e.currentTarget as HTMLSelectElement).value as typeof me.feat; }}>
              {#each METAMAGIC_FEATS as mf (mf.value)}
                <option value={mf.value}>{mf.label} — {mf.hint}</option>
              {/each}
            </select>
          </div>
          <fieldset class="flex flex-col gap-1">
            <legend class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Max Spell Level</legend>
            <div class="flex gap-3">
              {#each [[3,'Lesser (3rd)'],[6,'Normal (6th)'],[9,'Greater (9th)']] as [lvl, lbl] (lvl)}
                <label class="flex items-center gap-1 text-xs cursor-pointer">
                  <input type="radio" class="accent-accent"
                         name={fid('rod-ml')}
                         value={lvl}
                         checked={me.maxSpellLevel === lvl}
                         onchange={() => { me.maxSpellLevel = lvl as 3|6|9; }}/>
                  {lbl}
                </label>
              {/each}
            </div>
          </fieldset>
        </div>
      {/if}
    </div>

  </div>
</details>

<!-- ======================================================================= -->
<!-- SECTION 6 — CURSED                                                        -->
<!-- ======================================================================= -->

{#if showCursedTagPicker}
  <TagPickerModal
    initialSelected={((ctx.feature as ItemFeature).removalPrevention?.removableBy ?? []) as string[]}
    onTagsPicked={(tags) => {
      const rp = (ctx.feature as ItemFeature).removalPrevention;
      if (rp) rp.removableBy = tags as ('remove_curse'|'limited_wish'|'wish'|'miracle')[];
      showCursedTagPicker = false;
    }}
    onclose={() => (showCursedTagPicker = false)}
  />
{/if}

<details class="group/crs rounded-lg border border-border overflow-hidden">
  <summary class="flex items-center justify-between px-4 py-2 bg-surface-alt cursor-pointer
                  select-none list-none hover:bg-accent/5 text-sm font-semibold text-text-primary">
    <label class="flex items-center gap-3 cursor-pointer select-none">
      <input type="checkbox" class="h-4 w-4 accent-accent"
             checked={!!(ctx.feature as ItemFeature).removalPrevention}
             onchange={(e) => toggleCursed((e.currentTarget as HTMLInputElement).checked)}
             onclick={(e) => e.stopPropagation()}/>
      Cursed (cannot be voluntarily removed)
    </label>
    <svg class="h-4 w-4 text-text-muted transition-transform group-open/crs:rotate-180"
         xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2" stroke-linecap="round"
         stroke-linejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  </summary>
  {#if (ctx.feature as ItemFeature).removalPrevention}
    {@const rp = (ctx.feature as ItemFeature).removalPrevention!}
    <div class="p-4 flex flex-col gap-3">
      <!-- Removable By chip list -->
      <div class="flex flex-col gap-1.5">
        <div class="flex items-center justify-between">
          <span class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            Removable By (tags)
          </span>
          <button type="button" class="btn-ghost text-xs py-0.5 px-2 h-auto"
                  onclick={() => (showCursedTagPicker = true)}>Edit</button>
        </div>
        <div class="flex flex-wrap gap-1.5 min-h-[2rem]">
          {#each (rp.removableBy ?? []) as tag (tag)}
            <span class="badge font-mono text-[10px] bg-red-900/20 text-red-300 border-red-700/30">{tag}</span>
          {:else}
            <span class="text-xs text-text-muted italic">Nothing — cannot be removed by any means.</span>
          {/each}
        </div>
        <p class="text-[10px] text-text-muted">
          SRD methods: <code class="font-mono">remove_curse</code>, <code class="font-mono">limited_wish</code>,
          <code class="font-mono">wish</code>, <code class="font-mono">miracle</code>
        </p>
      </div>
      <!-- Prevention note -->
      <div class="flex flex-col gap-1">
        <label for={fid('crs-note')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Prevention Note <span class="font-normal text-[9px]">(optional flavour text)</span>
        </label>
        <input id={fid('crs-note')} type="text" class="input text-sm"
               value={rp.preventionNote ?? ''}
               placeholder="e.g. Remains clasped even after death."
               oninput={(e) => {
                 rp.preventionNote = (e.currentTarget as HTMLInputElement).value || undefined;
               }}/>
      </div>
    </div>
  {:else}
    <div class="px-4 py-3 text-xs text-text-muted italic">
      Enable for items that cannot be voluntarily unequipped (Necklace of Strangulation, etc.).
    </div>
  {/if}
</details>

<!-- ======================================================================= -->
<!-- SECTION 7 — INTELLIGENT ITEM                                              -->
<!-- ======================================================================= -->

<details class="group/int rounded-lg border border-border overflow-hidden">
  <summary class="flex items-center justify-between px-4 py-2 bg-surface-alt cursor-pointer
                  select-none list-none hover:bg-accent/5 text-sm font-semibold text-text-primary">
    <label class="flex items-center gap-3 cursor-pointer select-none">
      <input type="checkbox" class="h-4 w-4 accent-accent"
             checked={!!(ctx.feature as ItemFeature).intelligentItemData}
             onchange={(e) => toggleIntelligent((e.currentTarget as HTMLInputElement).checked)}
             onclick={(e) => e.stopPropagation()}/>
      Intelligent Item
    </label>
    <svg class="h-4 w-4 text-text-muted transition-transform group-open/int:rotate-180"
         xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2" stroke-linecap="round"
         stroke-linejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  </summary>
  {#if (ctx.feature as ItemFeature).intelligentItemData}
    {@const id = (ctx.feature as ItemFeature).intelligentItemData!}
    <div class="p-4 flex flex-col gap-4">

      <!-- Ability scores + Ego -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        {#each [['int','intelligenceScore','INT'],['wis','wisdomScore','WIS'],['cha','charismaScore','CHA']] as [k, field, lbl] (k)}
          <div class="flex flex-col gap-1">
            <label for={fid(`ii-${k}`)} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{lbl}</label>
            <input id={fid(`ii-${k}`)} type="number" class="input text-xs text-center" min="10" max="19"
                   value={(id as unknown as Record<string,number>)[field]}
                   oninput={(e) => {
                     (id as unknown as Record<string,number>)[field] = parseInt((e.currentTarget as HTMLInputElement).value) || 10;
                     if (!egoManualOverride) id.egoScore = autoEgo;
                   }}/>
          </div>
        {/each}
        <div class="flex flex-col gap-1">
          <div class="flex items-center gap-1">
            <label for={fid('ii-ego')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Ego</label>
            <label class="flex items-center gap-1 text-[9px] text-text-muted cursor-pointer">
              <input type="checkbox" class="h-2.5 w-2.5 accent-accent"
                     checked={egoManualOverride}
                     onchange={(e) => {
                       egoManualOverride = (e.currentTarget as HTMLInputElement).checked;
                       if (!egoManualOverride) id.egoScore = autoEgo;
                     }}/>
              manual
            </label>
          </div>
          <input id={fid('ii-ego')} type="number" class="input text-xs text-center" min="0"
                 value={egoManualOverride ? id.egoScore : autoEgo}
                 disabled={!egoManualOverride}
                 oninput={(e) => { if (egoManualOverride) id.egoScore = parseInt((e.currentTarget as HTMLInputElement).value) || 0; }}/>
          {#if !egoManualOverride}
            <p class="text-[9px] text-text-muted">auto = {autoEgo}</p>
          {/if}
        </div>
      </div>

      <!-- Alignment + Communication -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div class="flex flex-col gap-1">
          <label for={fid('ii-align')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Alignment</label>
          <select id={fid('ii-align')} class="input text-sm"
                  value={id.alignment}
                  onchange={(e) => { id.alignment = (e.currentTarget as HTMLSelectElement).value as typeof id.alignment; }}>
            {#each ALIGNMENT_OPTIONS as ao (ao.value)}
              <option value={ao.value}>{ao.label}</option>
            {/each}
          </select>
        </div>
        <div class="flex flex-col gap-1">
          <label for={fid('ii-comm')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Communication</label>
          <select id={fid('ii-comm')} class="input text-sm"
                  value={id.communication}
                  onchange={(e) => { id.communication = (e.currentTarget as HTMLSelectElement).value as typeof id.communication; }}>
            <option value="empathy">Empathy — emotional impressions only</option>
            <option value="speech">Speech — speaks Common + INT-bonus languages</option>
            <option value="telepathy">Telepathy — projects thoughts directly</option>
          </select>
        </div>
      </div>

      <!-- Senses -->
      <fieldset class="flex flex-col gap-2">
        <legend class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Senses</legend>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div class="flex flex-col gap-1">
            <label for={fid('ii-vis')} class="text-[10px] text-text-muted">Vision (ft.)</label>
            <select id={fid('ii-vis')} class="input text-xs"
                    value={id.senses.visionFt}
                    onchange={(e) => { id.senses.visionFt = parseInt((e.currentTarget as HTMLSelectElement).value) as 0|30|60|120; }}>
              <option value="0">None</option>
              <option value="30">30 ft.</option>
              <option value="60">60 ft.</option>
              <option value="120">120 ft.</option>
            </select>
          </div>
          <div class="flex flex-col gap-1">
            <label for={fid('ii-dv')} class="text-[10px] text-text-muted">Darkvision (ft.)</label>
            <select id={fid('ii-dv')} class="input text-xs"
                    value={id.senses.darkvisionFt}
                    onchange={(e) => { id.senses.darkvisionFt = parseInt((e.currentTarget as HTMLSelectElement).value) as 0|60|120; }}>
              <option value="0">None</option>
              <option value="60">60 ft.</option>
              <option value="120">120 ft.</option>
            </select>
          </div>
          <div class="flex items-center gap-2 pt-4">
            <input type="checkbox" id={fid('ii-blind')} class="h-4 w-4 accent-accent"
                   checked={id.senses.blindsense}
                   onchange={(e) => { id.senses.blindsense = (e.currentTarget as HTMLInputElement).checked; }}/>
            <label for={fid('ii-blind')} class="text-xs cursor-pointer">Blindsense</label>
          </div>
        </div>
      </fieldset>

      <!-- Powers -->
      <div class="grid grid-cols-2 gap-3">
        <div class="flex flex-col gap-1">
          <label for={fid('ii-lp')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            Lesser Powers <span class="font-normal text-[9px]">(+1 Ego each)</span>
          </label>
          <input id={fid('ii-lp')} type="number" class="input text-xs" min="0" max="10"
                 value={id.lesserPowers}
                 oninput={(e) => { id.lesserPowers = parseInt((e.currentTarget as HTMLInputElement).value) || 0; if(!egoManualOverride) id.egoScore = autoEgo; }}/>
        </div>
        <div class="flex flex-col gap-1">
          <label for={fid('ii-gp')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            Greater Powers <span class="font-normal text-[9px]">(+2 Ego each)</span>
          </label>
          <input id={fid('ii-gp')} type="number" class="input text-xs" min="0" max="10"
                 value={id.greaterPowers}
                 oninput={(e) => { id.greaterPowers = parseInt((e.currentTarget as HTMLInputElement).value) || 0; if(!egoManualOverride) id.egoScore = autoEgo; }}/>
        </div>
      </div>

      <!-- Languages (comma-separated) -->
      <div class="flex flex-col gap-1">
        <label for={fid('ii-lang')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Languages <span class="font-normal text-[9px]">(comma-separated)</span>
        </label>
        <input id={fid('ii-lang')} type="text" class="input text-sm"
               value={(id.languages ?? []).join(', ')}
               placeholder="e.g. Common, Elvish, Draconic"
               oninput={(e) => {
                 id.languages = (e.currentTarget as HTMLInputElement).value
                   .split(',').map(s => s.trim()).filter(Boolean);
               }}/>
      </div>

      <!-- Special Purpose + Dedicated Power -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div class="flex flex-col gap-1">
          <label for={fid('ii-sp')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            Special Purpose <span class="font-normal text-[9px]">(+4 Ego if set)</span>
          </label>
          <input id={fid('ii-sp')} type="text" class="input text-sm"
                 value={id.specialPurpose ?? ''}
                 placeholder="e.g. Defeat arcane spellcasters"
                 oninput={(e) => {
                   id.specialPurpose = (e.currentTarget as HTMLInputElement).value || null;
                   if(!egoManualOverride) id.egoScore = autoEgo;
                 }}/>
        </div>
        <div class="flex flex-col gap-1">
          <label for={fid('ii-dp')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Dedicated Power</label>
          <input id={fid('ii-dp')} type="text" class="input text-sm"
                 value={id.dedicatedPower ?? ''}
                 placeholder="e.g. Cast lightning bolt 10d6"
                 oninput={(e) => {
                   id.dedicatedPower = (e.currentTarget as HTMLInputElement).value || null;
                   if(!egoManualOverride) id.egoScore = autoEgo;
                 }}/>
        </div>
      </div>

    </div>
  {:else}
    <div class="px-4 py-3 text-xs text-text-muted italic">
      Enable for sentient magic items (intelligent swords, orbs of dragonkind, etc.).
    </div>
  {/if}
</details>
