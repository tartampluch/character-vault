<!--
  @file src/lib/components/content-editor/MagicDataEditor.svelte
  @description Specialised editor for MagicFeature fields (category: "magic" only).
  F5 refactoring: §2 and §3 extracted to SpellListsSection and PsionicDataSection.

  ────────────────────────────────────────────────────────────────────────────
  SECTIONS (all collapsible <details>):

    §1  GENERAL         — magicType radio (Arcane/Divine/Psionic), school dropdown,
                         subSchool text, spell components checkboxes (V/S/M/F/DF/XP)
    §2  SPELL LISTS     — SpellListsSection (extracted F5a)
    §3  PSIONIC         — PsionicDataSection (extracted F5b, psionic only)

  ────────────────────────────────────────────────────────────────────────────
  @see src/lib/types/feature.ts    MagicFeature, AugmentationRule, PsionicDiscipline
  @see editorContext.ts            EditorContext
  @see SpellListsSection.svelte    §2
  @see PsionicDataSection.svelte   §3
-->

<script lang="ts">
  import { getContext } from 'svelte';
  import { EDITOR_CONTEXT_KEY, type EditorContext } from './editorContext';
  import type { MagicFeature } from '$lib/types/feature';
  import SpellListsSection  from './SpellListsSection.svelte';
  import PsionicDataSection from './PsionicDataSection.svelte';

  // ===========================================================================
  // CONTEXT
  // ===========================================================================

  const ctx = getContext<EditorContext>(EDITOR_CONTEXT_KEY);
  const magic = $derived(ctx.feature as unknown as MagicFeature);

  // ===========================================================================
  // SCHOOL OPTIONS
  // ===========================================================================

  const ARCANE_SCHOOLS = [
    'abjuration', 'conjuration', 'divination', 'enchantment',
    'evocation', 'illusion', 'necromancy', 'transmutation', 'universal',
  ];

  // ===========================================================================
  // SPELL COMPONENTS
  // ===========================================================================

  /**
   * D&D 3.5 spell components.
   * V = Verbal, S = Somatic, M = Material, F = Focus, DF = Divine Focus, XP = XP cost.
   * `components` on MagicFeature is `string[]` — we toggle these in/out.
   */
  const ALL_COMPONENTS = [
    { code: 'V',  label: 'V — Verbal',      hint: 'Requires incantation' },
    { code: 'S',  label: 'S — Somatic',     hint: 'Requires hand gestures' },
    { code: 'M',  label: 'M — Material',    hint: 'Requires a consumed or non-consumed component' },
    { code: 'F',  label: 'F — Focus',       hint: 'Non-consumed focus object (arcane)' },
    { code: 'DF', label: 'DF — Divine Focus',hint: 'Holy symbol / sacred item (divine spells)' },
    { code: 'XP', label: 'XP — XP Cost',    hint: 'Consumes XP on casting' },
  ];

  function hasComponent(code: string): boolean {
    return (magic.components ?? []).includes(code);
  }
  function toggleComponent(code: string, on: boolean): void {
    const current = magic.components ?? [];
    (ctx.feature as MagicFeature).components = on
      ? [...current, code]
      : current.filter(c => c !== code);
  }

  // Unique uid
  const uid = Math.random().toString(36).slice(2, 7);
  const fid = (n: string) => `mde-${uid}-${n}`;
</script>

<!-- ======================================================================= -->
<!-- SECTION 1 — GENERAL                                                       -->
<!-- ======================================================================= -->
<details class="group/mg rounded-lg border border-border overflow-hidden" open>
  <summary class="flex items-center justify-between px-4 py-2 bg-surface-alt cursor-pointer
                  select-none list-none hover:bg-accent/5 font-semibold text-sm text-text-primary">
    General
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
        Magic Type
      </legend>
      <div class="flex flex-wrap gap-4">
        {#each ([['arcane','Arcane','INT/CHA based, ASF applies'],
                 ['divine','Divine','WIS based, no ASF'],
                 ['psionic','Psionic','PP based, no verbal/somatic components']] as const) as [val, lbl, hint] (val)}
          <label class="flex items-start gap-2 cursor-pointer text-xs select-none">
            <input type="radio" name={fid('mtype')} class="mt-0.5 accent-accent"
                   value={val}
                   checked={magic.magicType === val}
                   onchange={() => { (ctx.feature as MagicFeature).magicType = val; }}/>
            <span>
              <span class="font-semibold text-text-primary">{lbl}</span>
              <span class="text-text-muted"> — {hint}</span>
            </span>
          </label>
        {/each}
      </div>
    </fieldset>

    <!-- School + Sub-school -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div class="flex flex-col gap-1">
        {#if magic.magicType !== 'psionic'}
          <label for={fid('school')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">School</label>
          <select id={fid('school')} class="input text-sm"
                  value={magic.school ?? ''}
                  onchange={(e) => { (ctx.feature as MagicFeature).school = (e.currentTarget as HTMLSelectElement).value; }}>
            <option value="">— Select school</option>
            {#each ARCANE_SCHOOLS as s (s)}
              <option value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            {/each}
          </select>
        {:else}
          <label for={fid('school-p')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            School <span class="font-normal text-[9px]">(legacy display text — use Discipline below)</span>
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
          Sub-school / Sub-discipline <span class="font-normal text-[9px]">(optional)</span>
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

    <!-- Spell Components (hidden for psionic — psionics have no components) -->
    {#if magic.magicType !== 'psionic'}
      <fieldset class="flex flex-col gap-2">
        <legend class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Spell Components
        </legend>
        <div class="flex flex-wrap gap-3">
          {#each ALL_COMPONENTS as comp (comp.code)}
            <label class="flex items-center gap-1.5 text-xs cursor-pointer select-none"
                   title={comp.hint}>
              <input type="checkbox" class="h-3.5 w-3.5 accent-accent"
                     checked={hasComponent(comp.code)}
                     onchange={(e) => toggleComponent(comp.code, (e.currentTarget as HTMLInputElement).checked)}/>
              <span class="font-semibold">{comp.code}</span>
              <span class="text-text-muted hidden md:inline">{comp.hint}</span>
            </label>
          {/each}
        </div>
      </fieldset>
    {/if}

  </div>
</details>

<!-- ======================================================================= -->
<!-- SECTION 2 — SPELL LISTS (extracted to SpellListsSection)                  -->
<!-- ======================================================================= -->
<SpellListsSection />

<!-- ======================================================================= -->
<!-- SECTION 3 — PSIONIC (extracted to PsionicDataSection, psionic only)       -->
<!-- ======================================================================= -->
{#if magic.magicType === 'psionic'}
  <PsionicDataSection />
{/if}
