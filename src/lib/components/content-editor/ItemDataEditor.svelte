<!--
  @file src/lib/components/content-editor/ItemDataEditor.svelte
  @description Specialised editor for ItemFeature fields (category: "item" only).
-->

<script lang="ts">
  import { getContext } from 'svelte';
  import { EDITOR_CONTEXT_KEY, type EditorContext } from './editorContext';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import type { ItemFeature } from '$lib/types/feature';
  import WeaponFieldsEditor    from './WeaponFieldsEditor.svelte';
  import ArmorFieldsEditor     from './ArmorFieldsEditor.svelte';
  import ChargedItemsEditor    from './ChargedItemsEditor.svelte';
  import CursedItemEditor      from './CursedItemEditor.svelte';
  import IntelligentItemEditor from './IntelligentItemEditor.svelte';

  const ctx = getContext<EditorContext>(EDITOR_CONTEXT_KEY);
  const lang = $derived(engine.settings.language);
  const item = $derived(ctx.feature as unknown as ItemFeature);

  const SLOT_OPTIONS = $derived([
    { value: '',          labelKey: 'editor.item.slot_none_option' },
    { value: 'head',      labelKey: 'editor.item.slot_head' },
    { value: 'eyes',      labelKey: 'editor.item.slot_eyes' },
    { value: 'neck',      labelKey: 'editor.item.slot_neck' },
    { value: 'torso',     labelKey: 'editor.item.slot_torso' },
    { value: 'body',      labelKey: 'editor.item.slot_body' },
    { value: 'waist',     labelKey: 'editor.item.slot_waist' },
    { value: 'shoulders', labelKey: 'editor.item.slot_shoulders' },
    { value: 'arms',      labelKey: 'editor.item.slot_arms' },
    { value: 'hands',     labelKey: 'editor.item.slot_hands' },
    { value: 'ring',      labelKey: 'editor.item.slot_ring' },
    { value: 'feet',      labelKey: 'editor.item.slot_feet' },
    { value: 'main_hand', labelKey: 'editor.item.slot_main_hand' },
    { value: 'off_hand',  labelKey: 'editor.item.slot_off_hand' },
    { value: 'two_hands', labelKey: 'editor.item.slot_two_hands' },
    { value: 'none',      labelKey: 'editor.item.slot_none' },
  ]);

  function toggleConsumable(on: boolean): void {
    (ctx.feature as ItemFeature).consumable = on
      ? { isConsumable: true }
      : undefined;
  }

  const uid = Math.random().toString(36).slice(2, 7);
  const fid = (name: string) => `ide-${uid}-${name}`;
</script>

<!-- ======================================================================= -->
<!-- SECTION 1 — GENERAL                                                       -->
<!-- ======================================================================= -->
<details class="group/gen rounded-lg border border-border overflow-hidden" open>
  <summary class="flex items-center justify-between px-4 py-2 bg-surface-alt cursor-pointer
                  select-none list-none hover:bg-accent/5 font-semibold text-sm text-text-primary">
    {ui('editor.item.general_section', lang)}
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
        {ui('editor.item.slot_label', lang)}
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
          <option value={opt.value}>{ui(opt.labelKey, lang)}</option>
        {/each}
      </select>
    </div>

    <!-- Weight -->
    <div class="flex flex-col gap-1">
      <label for={fid('wt')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        {ui('editor.item.weight_label', lang)}
      </label>
      <input id={fid('wt')} type="number" class="input text-xs" min="0" step="0.5"
             value={item.weightLbs ?? 0}
             oninput={(e) => { (ctx.feature as ItemFeature).weightLbs = parseFloat((e.currentTarget as HTMLInputElement).value) || 0; }}
      />
    </div>

    <!-- Cost -->
    <div class="flex flex-col gap-1">
      <label for={fid('gp')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        {ui('editor.item.cost_label', lang)}
      </label>
      <input id={fid('gp')} type="number" class="input text-xs" min="0"
             value={item.costGp ?? 0}
             oninput={(e) => { (ctx.feature as ItemFeature).costGp = parseInt((e.currentTarget as HTMLInputElement).value) || 0; }}
      />
    </div>

    <!-- Hardness -->
    <div class="flex flex-col gap-1">
      <label for={fid('hard')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        {ui('editor.item.hardness_label', lang)} <span class="text-[9px] font-normal">(optional)</span>
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
        {ui('editor.item.hp_max_label', lang)} <span class="text-[9px] font-normal">(optional)</span>
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
        <span class="font-medium text-text-primary">{ui('editor.item.unique_label', lang)}</span>
        <span class="text-text-muted">{ui('editor.item.unique_hint', lang)}</span>
      </label>

      <div class="flex flex-col gap-1">
        <label for={fid('atier')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          {ui('editor.item.artifact_tier_label', lang)} <span class="font-normal text-[9px]">{ui('editor.item.artifact_tier_hint', lang)}</span>
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
          <option value="">{ui('editor.item.artifact_not_artifact', lang)}</option>
          <option value="minor">{ui('editor.item.artifact_minor', lang)}</option>
          <option value="major">{ui('editor.item.artifact_major', lang)}</option>
        </select>
      </div>
    </div>

  </div>
</details>

<!-- ======================================================================= -->
<!-- SECTION 2 — WEAPON DATA                                                   -->
<!-- ======================================================================= -->
<WeaponFieldsEditor />

<!-- ======================================================================= -->
<!-- SECTION 3 — ARMOR DATA                                                    -->
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
      {ui('editor.item.consumable_section', lang)}
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
        {ui('editor.item.consumable_hint', lang)}
      </p>
      <div class="flex flex-col gap-1 w-64">
        <label for={fid('dur')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          {ui('editor.item.duration_hint_label', lang)} <span class="font-normal text-[9px]">{ui('editor.item.duration_hint_optional', lang)}</span>
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
      {ui('editor.item.consumable_empty', lang)}
    </div>
  {/if}
</details>

<!-- ======================================================================= -->
<!-- SECTION 5 — CHARGED ITEMS                                                 -->
<!-- ======================================================================= -->
<ChargedItemsEditor />

<!-- ======================================================================= -->
<!-- SECTION 6 — CURSED                                                        -->
<!-- ======================================================================= -->
<CursedItemEditor />

<!-- ======================================================================= -->
<!-- SECTION 7 — INTELLIGENT ITEM                                              -->
<!-- ======================================================================= -->
<IntelligentItemEditor />
