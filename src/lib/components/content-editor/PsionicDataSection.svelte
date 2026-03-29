<!--
  @file src/lib/components/content-editor/PsionicDataSection.svelte
  @description Psionic Data section (§3) for MagicDataEditor.
  Only rendered when magicType === 'psionic'.
  Extracted from MagicDataEditor.svelte as part of F5b refactoring.
  Reads/writes via EditorContext (no props).
-->

<script lang="ts">
  import { getContext } from 'svelte';
  import { EDITOR_CONTEXT_KEY, type EditorContext } from './editorContext';
  import type { MagicFeature, AugmentationRule, PsionicDiscipline, PsionicDisplay } from '$lib/types/feature';
  import type { Modifier } from '$lib/types/pipeline';
  import LevelModifierModal from './LevelModifierModal.svelte';
  import LocalizedStringEditor from './LocalizedStringEditor.svelte';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui, uiN } from '$lib/i18n/ui-strings';

  const ctx = getContext<EditorContext>(EDITOR_CONTEXT_KEY);
  const magic = $derived(ctx.feature as unknown as MagicFeature);
  const lang = $derived(engine.settings.language);

  // ===========================================================================
  // PSIONIC METADATA
  // ===========================================================================

  const DISCIPLINES = $derived<Array<{ value: PsionicDiscipline; label: string; hint: string }>>([
    { value: 'clairsentience',   label: ui('psi.discipline.clairsentience',        lang), hint: ui('psi.discipline.clairsentience.hint',   lang) },
    { value: 'metacreativity',   label: ui('psi.discipline.metacreativity',        lang), hint: ui('psi.discipline.metacreativity.hint',   lang) },
    { value: 'psychokinesis',    label: ui('psi.discipline.psychokinesis',         lang), hint: ui('psi.discipline.psychokinesis.hint',    lang) },
    { value: 'psychometabolism', label: ui('psi.discipline.psychometabolism',      lang), hint: ui('psi.discipline.psychometabolism.hint', lang) },
    { value: 'psychoportation',  label: ui('psi.discipline.psychoportation',       lang), hint: ui('psi.discipline.psychoportation.hint',  lang) },
    { value: 'telepathy',        label: ui('psi.discipline.telepathy',             lang), hint: ui('psi.discipline.telepathy.hint',        lang) },
  ]);

  const DISPLAYS = $derived<Array<{ value: PsionicDisplay; label: string; hint: string }>>([
    { value: 'auditory', label: ui('psi.display.auditory.label', lang), hint: ui('psi.display.auditory.hint', lang) },
    { value: 'material', label: ui('psi.display.material.label', lang), hint: ui('psi.display.material.hint', lang) },
    { value: 'mental',   label: ui('psi.display.mental.label',   lang), hint: ui('psi.display.mental.hint',   lang) },
    { value: 'olfactory',label: ui('psi.display.olfactory.label',lang), hint: ui('psi.display.olfactory.hint',lang) },
    { value: 'visual',   label: ui('psi.display.visual.label',   lang), hint: ui('psi.display.visual.hint',   lang) },
  ]);

  function hasDisplay(d: PsionicDisplay): boolean {
    return (magic.displays ?? []).includes(d);
  }
  function toggleDisplay(d: PsionicDisplay, on: boolean): void {
    const current = magic.displays ?? [];
    (ctx.feature as MagicFeature).displays = on
      ? [...current, d]
      : current.filter(x => x !== d);
  }

  // ===========================================================================
  // AUGMENTATIONS
  // ===========================================================================

  function makeBlankAugmentation(): AugmentationRule {
    return { costIncrement: 2, effectDescription: { en: '' }, grantedModifiers: [], isRepeatable: false };
  }

  function addAugmentation(): void {
    (ctx.feature as MagicFeature).augmentations = [
      ...(magic.augmentations ?? []), makeBlankAugmentation(),
    ];
  }
  function removeAugmentation(i: number): void {
    (ctx.feature as MagicFeature).augmentations = (magic.augmentations ?? []).filter((_, k) => k !== i);
  }
  function patchAugmentation(i: number, patch: Partial<AugmentationRule>): void {
    const arr = [...(magic.augmentations ?? [])];
    arr[i] = { ...arr[i], ...patch } as AugmentationRule;
    (ctx.feature as MagicFeature).augmentations = arr;
  }
  type AugModalState = { index: number; modifiers: Modifier[] } | null;
  let augModalState = $state<AugModalState>(null);

  // Unique uid
  const uid = Math.random().toString(36).slice(2, 7);
  const fid = (n: string) => `psd-${uid}-${n}`;
</script>

<!-- Per-augmentation modifier editor -->
{#if augModalState !== null}
  <LevelModifierModal
    levelNumber={augModalState.index + 1}
    initialModifiers={augModalState.modifiers}
    parentFeatureId={ctx.feature.id}
    parentFeatureLabelEn={(ctx.feature.label as Record<string,string>)?.['en'] ?? ''}
    onModifiersSaved={(mods) => {
      patchAugmentation(augModalState!.index, { grantedModifiers: mods });
      augModalState = null;
    }}
    onclose={() => (augModalState = null)}
  />
{/if}

<!-- ======================================================================= -->
<!-- SECTION 3 — PSIONIC (only when magicType === 'psionic')                  -->
<!-- ======================================================================= -->
<details class="group/ps rounded-lg border border-border overflow-hidden">
  <summary class="flex items-center justify-between px-4 py-2 bg-surface-alt cursor-pointer
                  select-none list-none hover:bg-accent/5 font-semibold text-sm text-text-primary">
    {ui('content_editor.psi.section_title', lang)}
    <svg class="h-4 w-4 text-text-muted transition-transform group-open/ps:rotate-180"
         xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2" stroke-linecap="round"
         stroke-linejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  </summary>

  <div class="p-4 flex flex-col gap-4">

    <!-- Discipline + Base PP Cost -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div class="flex flex-col gap-1">
        <label for={fid('disc')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          {ui('psi.discipline_label', lang)}
        </label>
        <select id={fid('disc')} class="input text-sm"
                value={magic.discipline ?? ''}
                onchange={(e) => {
                  const v = (e.currentTarget as HTMLSelectElement).value;
                  (ctx.feature as MagicFeature).discipline = v ? (v as PsionicDiscipline) : undefined;
                }}>
          <option value="">{ui('content_editor.psi.not_set', lang)}</option>
          {#each DISCIPLINES as d (d.value)}
            <option value={d.value}>{d.label} — {d.hint}</option>
          {/each}
        </select>
      </div>

      <div class="flex flex-col gap-1">
        <label for={fid('ppbase')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          {ui('content_editor.psi.base_pp_cost_label', lang)}
        </label>
        <input id={fid('ppbase')} type="number" class="input text-xs w-24" min="1" max="17"
               value={(magic as unknown as { basePpCost?: number }).basePpCost ?? ''}
               placeholder={ui('content_editor.psi.base_pp_cost_placeholder', lang)}
               oninput={(e) => {
                 const v = (e.currentTarget as HTMLInputElement).value.trim();
                 (ctx.feature as unknown as { basePpCost?: number }).basePpCost = v ? parseInt(v) : undefined;
               }}/>
        <p class="text-[10px] text-text-muted">{ui('content_editor.psi.base_pp_cost_desc', lang)}</p>
      </div>
    </div>

    <!-- Displays (multi-select checkboxes) -->
    <fieldset class="flex flex-col gap-2">
      <legend class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        {ui('content_editor.psi.displays_legend', lang)}
      </legend>
      <div class="flex flex-wrap gap-3">
        {#each DISPLAYS as d (d.value)}
          <label class="flex items-center gap-1.5 text-xs cursor-pointer select-none"
                 title={d.hint}>
            <input type="checkbox" class="h-3.5 w-3.5 accent-accent"
                   checked={hasDisplay(d.value)}
                   onchange={(e) => toggleDisplay(d.value, (e.currentTarget as HTMLInputElement).checked)}/>
            <span class="font-medium">{d.label}</span>
            <span class="text-text-muted hidden md:inline text-[10px]"> — {d.hint}</span>
          </label>
        {/each}
      </div>
    </fieldset>

    <!-- Augmentations -->
    <div class="flex flex-col gap-3">
      <div class="flex items-center justify-between">
        <span class="text-sm font-semibold text-text-primary">
          {ui('content_editor.psi.augmentations_title', lang)}
          {#if (magic.augmentations ?? []).length > 0}
            <span class="ml-1.5 badge text-xs font-normal">{magic.augmentations?.length}</span>
          {/if}
        </span>
        <button type="button" class="btn-primary text-xs py-1 px-3 h-auto"
                onclick={addAugmentation}>
          {ui('content_editor.psi.add_augmentation', lang)}
        </button>
      </div>

      {#if (magic.augmentations ?? []).length === 0}
        <p class="text-xs text-text-muted italic">
          {ui('content_editor.psi.no_augmentations', lang)}
        </p>
      {:else}
        {#each (magic.augmentations ?? []) as aug, i (i)}
          <div class="rounded border border-border bg-surface p-3 flex flex-col gap-2">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
                {ui('content_editor.psi.augmentation_label', lang).replace('{n}', String(i + 1))}
              </span>
              <button type="button"
                      class="btn-ghost btn-icon h-6 w-6 p-0 text-text-muted hover:text-danger"
                      onclick={() => removeAugmentation(i)} aria-label={ui('content_editor.psi.augmentation_label', lang).replace('{n}', String(i + 1)) + ' — ' + ui('common.delete', lang)}>
                <svg class="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
                     fill="none" stroke="currentColor" stroke-width="2"
                     stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
              <!-- PP cost increment -->
              <div class="flex flex-col gap-1">
                <label for={fid(`aug-pp-${i}`)}
                       class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                  {ui('content_editor.psi.pp_cost_increment', lang)}
                </label>
                <input id={fid(`aug-pp-${i}`)} type="number" class="input text-xs" min="1" max="17"
                       value={aug.costIncrement}
                       oninput={(e) => patchAugmentation(i, { costIncrement: parseInt((e.currentTarget as HTMLInputElement).value) || 1 })}/>
              </div>

              <!-- isRepeatable -->
              <div class="flex flex-col gap-1 justify-end">
                <label class="flex items-center gap-2 text-xs cursor-pointer select-none">
                  <input type="checkbox" class="h-3.5 w-3.5 accent-accent"
                         checked={aug.isRepeatable}
                         onchange={(e) => patchAugmentation(i, { isRepeatable: (e.currentTarget as HTMLInputElement).checked })}/>
                  <span>{ui('content_editor.psi.repeatable', lang)}</span>
                  <span class="text-text-muted text-[10px]">{ui('content_editor.psi.repeatable_hint', lang)}</span>
                </label>
              </div>

              <!-- Modifier count + edit button -->
              <div class="flex flex-col gap-1 justify-end">
                <div class="flex items-center gap-2">
                  {#if aug.grantedModifiers.length > 0}
                    <span class="badge text-[10px]">{uiN('content_editor.psi.modifier_count', aug.grantedModifiers.length, lang)}</span>
                  {:else}
                    <span class="text-[10px] text-text-muted italic">{ui('content_editor.psi.no_modifiers', lang)}</span>
                  {/if}
                  <button type="button" class="text-[10px] text-text-muted underline hover:text-accent"
                          onclick={() => (augModalState = { index: i, modifiers: aug.grantedModifiers })}>
                    {aug.grantedModifiers.length > 0 ? ui('content_editor.psi.edit_modifiers', lang) : ui('content_editor.psi.add_modifiers', lang)}
                  </button>
                </div>
              </div>
            </div>

            <!-- Effect description — multi-language editor -->
            <div class="flex flex-col gap-1">
              <span class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                {ui('content_editor.psi.effect_desc_legend', lang)}
              </span>
              <LocalizedStringEditor
                value={(aug.effectDescription as Record<string,string>) ?? { en: '' }}
                onchange={(v) => patchAugmentation(i, { effectDescription: v })}
                mode="textarea"
                uid={fid(`aug-${i}`)}
                fieldName="eff-desc"
                {lang}
                placeholder={ui('content_editor.psi.effect_desc_en_placeholder', lang)}
                extraPlaceholder={ui('editor.lang.desc_translation_placeholder', lang)}
                inputClass="text-xs min-h-[4rem]"
              />
            </div>
          </div>
        {/each}
      {/if}
    </div>

  </div>
</details>
