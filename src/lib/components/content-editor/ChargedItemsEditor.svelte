<!--
  @file src/lib/components/content-editor/ChargedItemsEditor.svelte
  @description Charged Items section (Section 5) for ItemDataEditor.
-->

<script lang="ts">
  import { getContext } from 'svelte';
  import { EDITOR_CONTEXT_KEY, type EditorContext } from './editorContext';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import type { ItemFeature } from '$lib/types/feature';
  import FeaturePickerModal from './FeaturePickerModal.svelte';

  const ctx = getContext<EditorContext>(EDITOR_CONTEXT_KEY);
  const lang = $derived(engine.settings.language);

  const METAMAGIC_FEATS = $derived([
    { value: 'feat_empower_spell',  labelKey: 'editor.charged.feat_empower',  hintKey: 'editor.charged.feat_empower_hint' },
    { value: 'feat_enlarge_spell',  labelKey: 'editor.charged.feat_enlarge',  hintKey: 'editor.charged.feat_enlarge_hint' },
    { value: 'feat_extend_spell',   labelKey: 'editor.charged.feat_extend',   hintKey: 'editor.charged.feat_extend_hint' },
    { value: 'feat_maximize_spell', labelKey: 'editor.charged.feat_maximize', hintKey: 'editor.charged.feat_maximize_hint' },
    { value: 'feat_quicken_spell',  labelKey: 'editor.charged.feat_quicken',  hintKey: 'editor.charged.feat_quicken_hint' },
    { value: 'feat_silent_spell',   labelKey: 'editor.charged.feat_silent',   hintKey: 'editor.charged.feat_silent_hint' },
  ]);

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

  function addStaffSpell(): void {
    const item = ctx.feature as ItemFeature;
    item.staffSpells = [...(item.staffSpells ?? []), { spellId: '', chargeCost: 1 }];
  }
  function removeStaffSpell(i: number): void {
    const item = ctx.feature as ItemFeature;
    item.staffSpells = (item.staffSpells ?? []).filter((_, k) => k !== i);
  }
  function patchStaffSpell(i: number, patch: Partial<{ spellId: string; chargeCost: 1|2|3|4|5; spellLevel?: number }>): void {
    const item = ctx.feature as ItemFeature;
    const arr = [...(item.staffSpells ?? [])];
    arr[i] = { ...arr[i], ...patch } as typeof arr[0];
    item.staffSpells = arr;
  }

  type ScrollEntry = NonNullable<ItemFeature['scrollSpells']>[number];
  function addScrollSpell(): void {
    const item = ctx.feature as ItemFeature;
    const blank: ScrollEntry = { spellId: '', casterLevel: 1, spellLevel: 1, spellType: 'arcane' };
    item.scrollSpells = [...(item.scrollSpells ?? [] as ScrollEntry[]), blank];
  }
  function removeScrollSpell(i: number): void {
    const item = ctx.feature as ItemFeature;
    item.scrollSpells = ((item.scrollSpells ?? []) as ScrollEntry[]).filter((_, k) => k !== i);
  }
  function patchScrollSpell(i: number, patch: Partial<ScrollEntry>): void {
    const item = ctx.feature as ItemFeature;
    const arr = [...((item.scrollSpells ?? []) as ScrollEntry[])];
    arr[i] = { ...arr[i], ...patch } as ScrollEntry;
    item.scrollSpells = arr;
  }

  type SpellPickerTarget = { kind: 'wand' } | { kind: 'staff'; index: number } | { kind: 'scroll'; index: number } | null;
  let spellPickerTarget = $state<SpellPickerTarget>(null);

  const uid = Math.random().toString(36).slice(2, 7);
  const fid = (name: string) => `cie-${uid}-${name}`;
</script>

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

<!-- ======================================================================= -->
<!-- SECTION 5 — CHARGED ITEMS                                                 -->
<!-- ======================================================================= -->
<details class="group/chg rounded-lg border border-border overflow-hidden">
  <summary class="flex items-center justify-between px-4 py-2 bg-surface-alt cursor-pointer
                  select-none list-none hover:bg-accent/5 text-sm font-semibold text-text-primary">
    {ui('editor.charged.section_label', lang)}
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
        {ui('editor.charged.wand_label', lang)}
      </label>
      {#if (ctx.feature as ItemFeature).wandSpell}
        {@const ws = (ctx.feature as ItemFeature).wandSpell!}
        <div class="grid grid-cols-1 md:grid-cols-3 gap-2 mt-1">
          <div class="flex flex-col gap-1 md:col-span-2">
            <label for={fid('wand-spell')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{ui('editor.charged.wand_spell_label', lang)}</label>
            <button id={fid('wand-spell')} type="button"
                    class="input text-xs text-left font-mono {ws.spellId ? 'text-text-primary' : 'text-text-muted italic'}"
                    onclick={() => (spellPickerTarget = { kind: 'wand' })}>
              {ws.spellId || ui('editor.charged.wand_click_to_pick', lang)}
            </button>
          </div>
          <div class="flex flex-col gap-1">
            <label for={fid('wand-cl')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{ui('editor.charged.wand_caster_level_label', lang)}</label>
            <input id={fid('wand-cl')} type="number" class="input text-xs" min="1" max="20"
                   value={ws.casterLevel}
                   oninput={(e) => { ws.casterLevel = parseInt((e.currentTarget as HTMLInputElement).value) || 1; }}/>
          </div>
          <div class="flex flex-col gap-1">
            <label for={fid('wand-sl')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              {ui('editor.charged.wand_spell_level_label', lang)} <span class="font-normal text-[9px]">{ui('editor.charged.wand_heightened_hint', lang)}</span>
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
        {ui('editor.charged.staff_label', lang)}
      </label>
      {#if (ctx.feature as ItemFeature).staffSpells}
        {@const ss = (ctx.feature as ItemFeature).staffSpells!}
        <div class="flex flex-col gap-2">
          {#each ss as entry, i (i)}
            <div class="flex items-center gap-2 p-2 rounded border border-border/50 bg-surface">
              <button type="button"
                      class="input text-xs font-mono flex-1 text-left {entry.spellId ? 'text-text-primary' : 'text-text-muted italic'}"
                      onclick={() => (spellPickerTarget = { kind: 'staff', index: i })}>
                {entry.spellId || ui('editor.charged.pick_spell_btn', lang)}
              </button>
              <div class="flex flex-col gap-0.5 shrink-0 w-20">
                <label for={fid(`ss-cost-${i}`)} class="text-[9px] text-text-muted">{ui('editor.charged.charges_label', lang)}</label>
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
          <button type="button" class="btn-ghost text-xs py-0.5" onclick={addStaffSpell}>{ui('editor.charged.add_spell_btn', lang)}</button>
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
        {ui('editor.charged.scroll_label', lang)}
      </label>
      {#if (ctx.feature as ItemFeature).scrollSpells}
        {@const scr = (ctx.feature as ItemFeature).scrollSpells!}
        <div class="flex flex-col gap-2">
          {#each scr as entry, i (i)}
            <div class="grid grid-cols-2 md:grid-cols-5 gap-2 p-2 rounded border border-border/50 bg-surface items-end">
              <div class="flex flex-col gap-0.5 md:col-span-2">
                <label for={fid(`sc-spell-${i}`)} class="text-[9px] text-text-muted">{ui('editor.charged.scroll_spell_label', lang)}</label>
                <button id={fid(`sc-spell-${i}`)} type="button"
                        class="input text-xs font-mono text-left {entry.spellId ? 'text-text-primary' : 'text-text-muted italic'}"
                        onclick={() => (spellPickerTarget = { kind: 'scroll', index: i })}>
                  {entry.spellId || ui('editor.charged.pick_spell_btn', lang)}
                </button>
              </div>
              <div class="flex flex-col gap-0.5">
                <label for={fid(`sc-cl-${i}`)} class="text-[9px] text-text-muted">{ui('editor.charged.scroll_cl_label', lang)}</label>
                <input id={fid(`sc-cl-${i}`)} type="number" class="input text-xs" min="1" max="20"
                       value={entry.casterLevel}
                       oninput={(e) => patchScrollSpell(i, { casterLevel: parseInt((e.currentTarget as HTMLInputElement).value) || 1 })}/>
              </div>
              <div class="flex flex-col gap-0.5">
                <label for={fid(`sc-sl-${i}`)} class="text-[9px] text-text-muted">{ui('editor.charged.scroll_spell_lvl_label', lang)}</label>
                <input id={fid(`sc-sl-${i}`)} type="number" class="input text-xs" min="0" max="9"
                       value={entry.spellLevel}
                       oninput={(e) => patchScrollSpell(i, { spellLevel: parseInt((e.currentTarget as HTMLInputElement).value) || 0 })}/>
              </div>
              <div class="flex items-end gap-1">
                <div class="flex flex-col gap-0.5 flex-1">
                  <label for={fid(`sc-type-${i}`)} class="text-[9px] text-text-muted">{ui('editor.charged.scroll_type_label', lang)}</label>
                  <select id={fid(`sc-type-${i}`)} class="input text-xs"
                          value={entry.spellType}
                          onchange={(e) => patchScrollSpell(i, { spellType: (e.currentTarget as HTMLSelectElement).value as 'arcane'|'divine' })}>
                    <option value="arcane">{ui('editor.charged.arcane_option', lang)}</option>
                    <option value="divine">{ui('editor.charged.divine_option', lang)}</option>
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
          <button type="button" class="btn-ghost text-xs py-0.5" onclick={addScrollSpell}>{ui('editor.charged.add_spell_btn', lang)}</button>
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
        {ui('editor.charged.rod_label', lang)}
      </label>
      {#if (ctx.feature as ItemFeature).metamagicEffect}
        {@const me = (ctx.feature as ItemFeature).metamagicEffect!}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div class="flex flex-col gap-1">
            <label for={fid('rod-feat')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{ui('editor.charged.rod_feat_label', lang)}</label>
            <select id={fid('rod-feat')} class="input text-sm"
                    value={me.feat}
                    onchange={(e) => { me.feat = (e.currentTarget as HTMLSelectElement).value as typeof me.feat; }}>
              {#each METAMAGIC_FEATS as mf (mf.value)}
                <option value={mf.value}>{ui(mf.labelKey, lang)} — {ui(mf.hintKey, lang)}</option>
              {/each}
            </select>
          </div>
          <fieldset class="flex flex-col gap-1">
            <legend class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{ui('editor.charged.rod_max_spell_level', lang)}</legend>
            <div class="flex gap-3">
              {#each [[3,'editor.charged.rod_lesser'],[6,'editor.charged.rod_normal'],[9,'editor.charged.rod_greater']] as [lvl, lblKey] (lvl)}
                <label class="flex items-center gap-1 text-xs cursor-pointer">
                  <input type="radio" class="accent-accent"
                         name={fid('rod-ml')}
                         value={lvl}
                         checked={me.maxSpellLevel === lvl}
                         onchange={() => { me.maxSpellLevel = lvl as 3|6|9; }}/>
                  {ui(lblKey as string, lang)}
                </label>
              {/each}
            </div>
          </fieldset>
        </div>
      {/if}
    </div>

  </div>
</details>
