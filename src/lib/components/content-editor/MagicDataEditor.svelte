<!--
  @file src/lib/components/content-editor/MagicDataEditor.svelte
  @description Specialised editor for MagicFeature fields (category: "magic" only).
  F5 refactoring: §2 and §3 extracted to SpellListsSection and PsionicDataSection.

  SECTIONS (all collapsible <details>):
    §1  GENERAL         — magicType radio, school dropdown, subSchool text, spell components
    §2  SPELL LISTS     — SpellListsSection (extracted F5a)
    §3  PSIONIC         — PsionicDataSection (extracted F5b, psionic only)
-->

<script lang="ts">
  import { getContext } from 'svelte';
  import { EDITOR_CONTEXT_KEY, type EditorContext } from './editorContext';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import type { MagicFeature } from '$lib/types/feature';
  import SpellListsSection  from './SpellListsSection.svelte';
  import PsionicDataSection from './PsionicDataSection.svelte';

  const ctx = getContext<EditorContext>(EDITOR_CONTEXT_KEY);
  const magic = $derived(ctx.feature as unknown as MagicFeature);
  const lang = $derived(engine.settings.language);

  const ARCANE_SCHOOLS = [
    'abjuration', 'conjuration', 'divination', 'enchantment',
    'evocation', 'illusion', 'necromancy', 'transmutation', 'universal',
  ];

  const ALL_COMPONENTS = $derived([
    { code: 'V',  labelKey: 'editor.magic.comp_v_label',  hintKey: 'editor.magic.comp_v_hint' },
    { code: 'S',  labelKey: 'editor.magic.comp_s_label',  hintKey: 'editor.magic.comp_s_hint' },
    { code: 'M',  labelKey: 'editor.magic.comp_m_label',  hintKey: 'editor.magic.comp_m_hint' },
    { code: 'F',  labelKey: 'editor.magic.comp_f_label',  hintKey: 'editor.magic.comp_f_hint' },
    { code: 'DF', labelKey: 'editor.magic.comp_df_label', hintKey: 'editor.magic.comp_df_hint' },
    { code: 'XP', labelKey: 'editor.magic.comp_xp_label', hintKey: 'editor.magic.comp_xp_hint' },
  ]);

  function hasComponent(code: string): boolean {
    return (magic.components ?? []).includes(code);
  }
  function toggleComponent(code: string, on: boolean): void {
    const current = magic.components ?? [];
    (ctx.feature as MagicFeature).components = on
      ? [...current, code]
      : current.filter(c => c !== code);
  }

  const uid = Math.random().toString(36).slice(2, 7);
  const fid = (n: string) => `mde-${uid}-${n}`;
</script>

<!-- ======================================================================= -->
<!-- SECTION 1 — GENERAL                                                       -->
<!-- ======================================================================= -->
<details class="group/mg rounded-lg border border-border overflow-hidden" open>
  <summary class="flex items-center justify-between px-4 py-2 bg-surface-alt cursor-pointer
                  select-none list-none hover:bg-accent/5 font-semibold text-sm text-text-primary">
    {ui('editor.magic.general_section', lang)}
    <svg class="h-4 w-4 text-text-muted transition-transform group-open/mg:rotate-180"
         xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2" stroke-linecap="round"
         stroke-linejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  </summary>

  <div class="p-4 flex flex-col gap-4">

    <!-- Magic Type radio -->
    <fieldset class="flex flex-col gap-2">
      <legend class="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-0.5">
        {ui('editor.magic.magic_type_legend', lang)}
      </legend>
      <div class="flex flex-wrap gap-4">
        {#each ([
          ['arcane',  'editor.magic.arcane_label',  'editor.magic.arcane_hint'],
          ['divine',  'editor.magic.divine_label',  'editor.magic.divine_hint'],
          ['psionic', 'editor.magic.psionic_label', 'editor.magic.psionic_hint'],
        ] as const) as [val, lblKey, hintKey] (val)}
          <label class="flex items-start gap-2 cursor-pointer text-xs select-none">
            <input type="radio" name={fid('mtype')} class="mt-0.5 accent-accent"
                   value={val}
                   checked={magic.magicType === val}
                   onchange={() => { (ctx.feature as MagicFeature).magicType = val; }}/>
            <span>
              <span class="font-semibold text-text-primary">{ui(lblKey, lang)}</span>
              <span class="text-text-muted"> — {ui(hintKey, lang)}</span>
            </span>
          </label>
        {/each}
      </div>
    </fieldset>

    <!-- School + Sub-school -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div class="flex flex-col gap-1">
        {#if magic.magicType !== 'psionic'}
          <label for={fid('school')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{ui('editor.magic.school_label', lang)}</label>
          <select id={fid('school')} class="input text-sm"
                  value={magic.school ?? ''}
                  onchange={(e) => { (ctx.feature as MagicFeature).school = (e.currentTarget as HTMLSelectElement).value; }}>
            <option value="">{ui('editor.magic.select_school', lang)}</option>
            {#each ARCANE_SCHOOLS as s (s)}
              <option value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            {/each}
          </select>
        {:else}
          <label for={fid('school-p')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            {ui('editor.magic.school_label', lang)}
            <span class="font-normal text-[9px]">{ui('editor.magic.school_psionic_hint', lang)}</span>
          </label>
          <input id={fid('school-p')} type="text" class="input text-sm"
                 value={magic.school ?? ''}
                 placeholder="e.g. clairsentience (display only)"
                 oninput={(e) => { (ctx.feature as MagicFeature).school = (e.currentTarget as HTMLInputElement).value; }}
                 autocomplete="off"/>
        {/if}
      </div>
      <div class="flex flex-col gap-1">
        <label for={fid('sub')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          {ui('editor.magic.sub_school_label', lang)}
          <span class="font-normal text-[9px]">{ui('editor.choices.prefix_optional', lang)}</span>
        </label>
        <input id={fid('sub')} type="text" class="input text-sm"
               value={magic.subSchool ?? ''}
               placeholder="e.g. summoning, calling, charm"
               oninput={(e) => {
                 const v = (e.currentTarget as HTMLInputElement).value.trim();
                 (ctx.feature as MagicFeature).subSchool = v || undefined;
               }}
               autocomplete="off"/>
      </div>
    </div>

    <!-- Spell Components (hidden for psionic) -->
    {#if magic.magicType !== 'psionic'}
      <fieldset class="flex flex-col gap-2">
        <legend class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          {ui('editor.magic.spell_components_legend', lang)}
        </legend>
        <div class="flex flex-wrap gap-3">
          {#each ALL_COMPONENTS as comp (comp.code)}
            <label class="flex items-center gap-1.5 text-xs cursor-pointer select-none"
                   title={ui(comp.hintKey, lang)}>
              <input type="checkbox" class="h-3.5 w-3.5 accent-accent"
                     checked={hasComponent(comp.code)}
                     onchange={(e) => toggleComponent(comp.code, (e.currentTarget as HTMLInputElement).checked)}/>
              <span class="font-semibold">{comp.code}</span>
              <span class="text-text-muted hidden md:inline">{ui(comp.hintKey, lang)}</span>
            </label>
          {/each}
        </div>
      </fieldset>
    {/if}

  </div>
</details>

<!-- ======================================================================= -->
<!-- SECTION 2 — SPELL LISTS                                                   -->
<!-- ======================================================================= -->
<SpellListsSection />

<!-- ======================================================================= -->
<!-- SECTION 3 — PSIONIC (psionic only)                                        -->
<!-- ======================================================================= -->
{#if magic.magicType === 'psionic'}
  <PsionicDataSection />
{/if}
