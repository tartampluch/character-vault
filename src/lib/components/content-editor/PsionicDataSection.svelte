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

  const ctx = getContext<EditorContext>(EDITOR_CONTEXT_KEY);
  const magic = $derived(ctx.feature as unknown as MagicFeature);

  // ===========================================================================
  // PSIONIC METADATA
  // ===========================================================================

  const DISCIPLINES: Array<{ value: PsionicDiscipline; label: string; hint: string }> = [
    { value: 'clairsentience',   label: 'Clairsentience',   hint: 'Information, scrying, precognition' },
    { value: 'metacreativity',   label: 'Metacreativity',   hint: 'Matter creation, astral constructs' },
    { value: 'psychokinesis',    label: 'Psychokinesis',    hint: 'Energy manipulation, force' },
    { value: 'psychometabolism', label: 'Psychometabolism', hint: 'Body alteration, healing' },
    { value: 'psychoportation',  label: 'Psychoportation',  hint: 'Movement, teleportation' },
    { value: 'telepathy',        label: 'Telepathy',        hint: 'Mind reading, charm, compulsion' },
  ];

  const DISPLAYS: Array<{ value: PsionicDisplay; label: string; hint: string }> = [
    { value: 'auditory', label: 'Auditory', hint: 'Bass hum; heard up to 100 ft.' },
    { value: 'material', label: 'Material', hint: 'Ectoplasmic coating; evaporates in 1 round' },
    { value: 'mental',   label: 'Mental',   hint: 'Subtle chime in nearby minds (15 ft.)' },
    { value: 'olfactory',label: 'Olfactory',hint: 'Odd scent; spreads 20 ft., fades quickly' },
    { value: 'visual',   label: 'Visual',   hint: 'Silver eye-fire + rainbow flash' },
  ];

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
  function setAugDesc(i: number, lang: string, value: string): void {
    const aug = (magic.augmentations ?? [])[i];
    if (!aug) return;
    patchAugmentation(i, {
      effectDescription: { ...(aug.effectDescription as Record<string,string> ?? {}), [lang]: value }
    });
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
    Psionic Data
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
          Discipline
        </label>
        <select id={fid('disc')} class="input text-sm"
                value={magic.discipline ?? ''}
                onchange={(e) => {
                  const v = (e.currentTarget as HTMLSelectElement).value;
                  (ctx.feature as MagicFeature).discipline = v ? (v as PsionicDiscipline) : undefined;
                }}>
          <option value="">— Not set</option>
          {#each DISCIPLINES as d (d.value)}
            <option value={d.value}>{d.label} — {d.hint}</option>
          {/each}
        </select>
      </div>

      <div class="flex flex-col gap-1">
        <label for={fid('ppbase')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Base PP Cost
        </label>
        <input id={fid('ppbase')} type="number" class="input text-xs w-24" min="1" max="17"
               value={(magic as unknown as { basePpCost?: number }).basePpCost ?? ''}
               placeholder="e.g. 1"
               oninput={(e) => {
                 const v = (e.currentTarget as HTMLInputElement).value.trim();
                 (ctx.feature as unknown as { basePpCost?: number }).basePpCost = v ? parseInt(v) : undefined;
               }}/>
        <p class="text-[10px] text-text-muted">Power points spent per manifestation (1–17).</p>
      </div>
    </div>

    <!-- Displays (multi-select checkboxes) -->
    <fieldset class="flex flex-col gap-2">
      <legend class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        Displays (sensory effects on manifestation)
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
          Augmentations
          {#if (magic.augmentations ?? []).length > 0}
            <span class="ml-1.5 badge text-xs font-normal">{magic.augmentations?.length}</span>
          {/if}
        </span>
        <button type="button" class="btn-primary text-xs py-1 px-3 h-auto"
                onclick={addAugmentation}>
          + Add Augmentation
        </button>
      </div>

      {#if (magic.augmentations ?? []).length === 0}
        <p class="text-xs text-text-muted italic">
          No augmentations. The base power is manifested at its standard effect.
        </p>
      {:else}
        {#each (magic.augmentations ?? []) as aug, i (i)}
          <div class="rounded border border-border bg-surface p-3 flex flex-col gap-2">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
                Augmentation #{i + 1}
              </span>
              <button type="button"
                      class="btn-ghost btn-icon h-6 w-6 p-0 text-text-muted hover:text-danger"
                      onclick={() => removeAugmentation(i)} aria-label="Delete augmentation {i+1}">
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
                  PP Cost Increment
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
                  <span>Repeatable</span>
                  <span class="text-text-muted text-[10px]">(can apply multiple times)</span>
                </label>
              </div>

              <!-- Modifier count + edit button -->
              <div class="flex flex-col gap-1 justify-end">
                <div class="flex items-center gap-2">
                  {#if aug.grantedModifiers.length > 0}
                    <span class="badge text-[10px]">{aug.grantedModifiers.length} modifier{aug.grantedModifiers.length === 1 ? '' : 's'}</span>
                  {:else}
                    <span class="text-[10px] text-text-muted italic">No modifiers</span>
                  {/if}
                  <button type="button" class="text-[10px] text-text-muted underline hover:text-accent"
                          onclick={() => (augModalState = { index: i, modifiers: aug.grantedModifiers })}>
                    {aug.grantedModifiers.length > 0 ? 'Edit' : '+ Add'} modifiers
                  </button>
                </div>
              </div>
            </div>

            <!-- Effect description EN/FR -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div class="flex flex-col gap-1">
                <label for={fid(`aug-en-${i}`)}
                       class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                  Effect Description (EN)
                </label>
                <textarea id={fid(`aug-en-${i}`)}
                          class="input text-xs min-h-[4rem] resize-y font-sans"
                          value={(aug.effectDescription as Record<string,string>)?.['en'] ?? ''}
                          placeholder="e.g. For every 2 additional PP, damage increases by 1d10."
                          oninput={(e) => setAugDesc(i, 'en', (e.currentTarget as HTMLTextAreaElement).value)}
                ></textarea>
              </div>
              <div class="flex flex-col gap-1">
                <label for={fid(`aug-fr-${i}`)}
                       class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                  Effect Description (FR)
                </label>
                <textarea id={fid(`aug-fr-${i}`)}
                          class="input text-xs min-h-[4rem] resize-y font-sans"
                          value={(aug.effectDescription as Record<string,string>)?.['fr'] ?? ''}
                          placeholder="ex. Pour chaque 2 PP supplémentaires, les dégâts augmentent de 1d10."
                          oninput={(e) => setAugDesc(i, 'fr', (e.currentTarget as HTMLTextAreaElement).value)}
                ></textarea>
              </div>
            </div>
          </div>
        {/each}
      {/if}
    </div>

  </div>
</details>
