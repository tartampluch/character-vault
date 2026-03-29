<!--
  @file src/lib/components/content-editor/IntelligentItemEditor.svelte
  @description Intelligent Item section (Section 7) for ItemDataEditor.
-->

<script lang="ts">
  import { getContext } from 'svelte';
  import { EDITOR_CONTEXT_KEY, type EditorContext } from './editorContext';
  import type { ItemFeature } from '$lib/types/feature';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import { computeIntelligentItemEgo } from '$lib/utils/formatters';
  import { ALIGNMENTS } from '$lib/utils/constants';

  const ctx = getContext<EditorContext>(EDITOR_CONTEXT_KEY);
  const lang = $derived(engine.settings.language);

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

  let egoManualOverride = $state(false);

  const autoEgo = $derived.by((): number => {
    const d = (ctx.feature as ItemFeature).intelligentItemData;
    if (!d) return 0;
    return computeIntelligentItemEgo(d);
  });

  const ALIGNMENT_OPTIONS = $derived(
    ALIGNMENTS.map(a => ({
      value: a.id.replace(/^alignment_/, ''),
      label: ui(a.ui_key, lang),
    }))
  );

  const uid = Math.random().toString(36).slice(2, 7);
  const fid = (name: string) => `intitem-${uid}-${name}`;
</script>

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
      {ui('editor.intelligent.section_label', lang)}
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
            <label for={fid('ii-ego')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{ui('editor.intelligent.ego_label', lang)}</label>
            <label class="flex items-center gap-1 text-[9px] text-text-muted cursor-pointer">
              <input type="checkbox" class="h-2.5 w-2.5 accent-accent"
                     checked={egoManualOverride}
                     onchange={(e) => {
                       egoManualOverride = (e.currentTarget as HTMLInputElement).checked;
                       if (!egoManualOverride) id.egoScore = autoEgo;
                     }}/>
              {ui('editor.intelligent.ego_manual', lang)}
            </label>
          </div>
          <input id={fid('ii-ego')} type="number" class="input text-xs text-center" min="0"
                 value={egoManualOverride ? id.egoScore : autoEgo}
                 disabled={!egoManualOverride}
                 oninput={(e) => { if (egoManualOverride) id.egoScore = parseInt((e.currentTarget as HTMLInputElement).value) || 0; }}/>
          {#if !egoManualOverride}
            <p class="text-[9px] text-text-muted">{ui('editor.intelligent.ego_auto_prefix', lang)}{autoEgo}</p>
          {/if}
        </div>
      </div>

      <!-- Alignment + Communication -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div class="flex flex-col gap-1">
          <label for={fid('ii-align')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{ui('editor.intelligent.alignment_label', lang)}</label>
          <select id={fid('ii-align')} class="input text-sm"
                  value={id.alignment}
                  onchange={(e) => { id.alignment = (e.currentTarget as HTMLSelectElement).value as typeof id.alignment; }}>
            {#each ALIGNMENT_OPTIONS as ao (ao.value)}
              <option value={ao.value}>{ao.label}</option>
            {/each}
          </select>
        </div>
        <div class="flex flex-col gap-1">
          <label for={fid('ii-comm')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{ui('editor.intelligent.communication_label', lang)}</label>
          <select id={fid('ii-comm')} class="input text-sm"
                  value={id.communication}
                  onchange={(e) => { id.communication = (e.currentTarget as HTMLSelectElement).value as typeof id.communication; }}>
            <option value="empathy">{ui('editor.intelligent.empathy_option', lang)}</option>
            <option value="speech">{ui('editor.intelligent.speech_option', lang)}</option>
            <option value="telepathy">{ui('editor.intelligent.telepathy_option', lang)}</option>
          </select>
        </div>
      </div>

      <!-- Senses -->
      <fieldset class="flex flex-col gap-2">
        <legend class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{ui('editor.intelligent.senses_legend', lang)}</legend>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div class="flex flex-col gap-1">
            <label for={fid('ii-vis')} class="text-[10px] text-text-muted">{ui('editor.intelligent.vision_label', lang)}</label>
            <select id={fid('ii-vis')} class="input text-xs"
                    value={id.senses.visionFt}
                    onchange={(e) => { id.senses.visionFt = parseInt((e.currentTarget as HTMLSelectElement).value) as 0|30|60|120; }}>
              <option value="0">{ui('editor.intelligent.vision_none', lang)}</option>
              <option value="30">30 ft.</option>
              <option value="60">60 ft.</option>
              <option value="120">120 ft.</option>
            </select>
          </div>
          <div class="flex flex-col gap-1">
            <label for={fid('ii-dv')} class="text-[10px] text-text-muted">{ui('editor.intelligent.darkvision_label', lang)}</label>
            <select id={fid('ii-dv')} class="input text-xs"
                    value={id.senses.darkvisionFt}
                    onchange={(e) => { id.senses.darkvisionFt = parseInt((e.currentTarget as HTMLSelectElement).value) as 0|60|120; }}>
              <option value="0">{ui('editor.intelligent.vision_none', lang)}</option>
              <option value="60">60 ft.</option>
              <option value="120">120 ft.</option>
            </select>
          </div>
          <div class="flex items-center gap-2 pt-4">
            <input type="checkbox" id={fid('ii-blind')} class="h-4 w-4 accent-accent"
                   checked={id.senses.blindsense}
                   onchange={(e) => { id.senses.blindsense = (e.currentTarget as HTMLInputElement).checked; }}/>
            <label for={fid('ii-blind')} class="text-xs cursor-pointer">{ui('editor.intelligent.blindsense_label', lang)}</label>
          </div>
        </div>
      </fieldset>

      <!-- Powers -->
      <div class="grid grid-cols-2 gap-3">
        <div class="flex flex-col gap-1">
          <label for={fid('ii-lp')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            {ui('editor.intelligent.lesser_powers_label', lang)} <span class="font-normal text-[9px]">{ui('editor.intelligent.lesser_powers_hint', lang)}</span>
          </label>
          <input id={fid('ii-lp')} type="number" class="input text-xs" min="0" max="10"
                 value={id.lesserPowers}
                 oninput={(e) => { id.lesserPowers = parseInt((e.currentTarget as HTMLInputElement).value) || 0; if(!egoManualOverride) id.egoScore = autoEgo; }}/>
        </div>
        <div class="flex flex-col gap-1">
          <label for={fid('ii-gp')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            {ui('editor.intelligent.greater_powers_label', lang)} <span class="font-normal text-[9px]">{ui('editor.intelligent.greater_powers_hint', lang)}</span>
          </label>
          <input id={fid('ii-gp')} type="number" class="input text-xs" min="0" max="10"
                 value={id.greaterPowers}
                 oninput={(e) => { id.greaterPowers = parseInt((e.currentTarget as HTMLInputElement).value) || 0; if(!egoManualOverride) id.egoScore = autoEgo; }}/>
        </div>
      </div>

      <!-- Languages -->
      <div class="flex flex-col gap-1">
        <label for={fid('ii-lang')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          {ui('editor.intelligent.languages_label', lang)} <span class="font-normal text-[9px]">{ui('editor.intelligent.languages_hint', lang)}</span>
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
            {ui('editor.intelligent.special_purpose_label', lang)} <span class="font-normal text-[9px]">{ui('editor.intelligent.special_purpose_hint', lang)}</span>
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
          <label for={fid('ii-dp')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{ui('editor.intelligent.dedicated_power_label', lang)}</label>
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
      {ui('editor.intelligent.empty_hint', lang)}
    </div>
  {/if}
</details>
