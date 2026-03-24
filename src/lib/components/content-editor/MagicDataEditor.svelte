<!--
  @file src/lib/components/content-editor/MagicDataEditor.svelte
  @description Specialised editor for MagicFeature fields (category: "magic" only).

  ────────────────────────────────────────────────────────────────────────────
  SECTIONS (all collapsible <details>):

    §1  GENERAL         — magicType radio (Arcane/Divine/Psionic), school dropdown,
                         subSchool text, spell components checkboxes (V/S/M/F/DF/XP)
    §2  SPELL LISTS     — Record<classId, level>; table rows with class picker +
                         level spinner; "Add Class" opens FeaturePickerModal for class
    §3  PSIONIC         — visible when magicType === 'psionic':
                         discipline dropdown (6 values), displays multi-select (5 values),
                         basePpCost spinner, augmentations list (costIncrement, isRepeatable,
                         effectDescription EN/FR, grantedModifiers via LevelModifierModal)

  ────────────────────────────────────────────────────────────────────────────
  @see src/lib/types/feature.ts   MagicFeature, AugmentationRule, PsionicDiscipline
  @see editorContext.ts           EditorContext
  @see FeaturePickerModal.svelte  for adding spell-list class IDs
  @see LevelModifierModal.svelte  for per-augmentation modifier editing
-->

<script lang="ts">
  import { getContext } from 'svelte';
  import { EDITOR_CONTEXT_KEY, type EditorContext } from './editorContext';
  import type { MagicFeature, AugmentationRule, PsionicDiscipline, PsionicDisplay } from '$lib/types/feature';
  import type { Modifier } from '$lib/types/pipeline';
  import { dataLoader } from '$lib/engine/DataLoader';
  import FeaturePickerModal from './FeaturePickerModal.svelte';
  import LevelModifierModal from './LevelModifierModal.svelte';

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
  // SPELL LISTS
  // ===========================================================================

  let showClassPicker = $state(false);

  /** Sorted entries from spellLists Record for stable table rendering. */
  const spellListEntries = $derived(
    Object.entries(magic.spellLists ?? {}).sort(([a], [b]) => a.localeCompare(b))
  );

  function addSpellListClass(classId: string): void {
    (ctx.feature as MagicFeature).spellLists = {
      ...(magic.spellLists ?? {}),
      [classId]: 0,
    };
  }
  function removeSpellListClass(classId: string): void {
    const { [classId]: _removed, ...rest } = magic.spellLists ?? {};
    (ctx.feature as MagicFeature).spellLists = rest;
  }
  function setSpellListLevel(classId: string, level: number): void {
    (ctx.feature as MagicFeature).spellLists = {
      ...(magic.spellLists ?? {}),
      [classId]: level,
    };
  }

  /** Returns the English label for a loaded feature (class), or the raw ID. */
  function classLabel(id: string): string {
    const f = dataLoader.getFeature(id);
    const lbl = f?.label as Record<string,string> | undefined;
    return lbl?.['en'] ?? id;
  }

  // ===========================================================================
  // AUGMENTATIONS
  // ===========================================================================

  function makeBlankAugmentation(): AugmentationRule {
    return { costIncrement: 2, effectDescription: { en: '', fr: '' }, grantedModifiers: [], isRepeatable: false };
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
  const fid = (n: string) => `mde-${uid}-${n}`;
</script>

<!-- Class picker for spell lists -->
{#if showClassPicker}
  <FeaturePickerModal
    filterCategory="class"
    onFeaturePicked={(ids) => {
      ids.forEach(id => addSpellListClass(id));
      showClassPicker = false;
    }}
    onclose={() => (showClassPicker = false)}
  />
{/if}

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
        {#each ([['arcane','Arcane','Wizard, Sorcerer, Bard — INT/CHA based, ASF applies'],
                 ['divine','Divine','Cleric, Druid, Paladin, Ranger — WIS based, no ASF'],
                 ['psionic','Psionic','Psion, Wilder — PP based, no verbal/somatic components']] as const) as [val, lbl, hint] (val)}
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
<!-- SECTION 2 — SPELL LISTS                                                   -->
<!-- ======================================================================= -->
<details class="group/sl rounded-lg border border-border overflow-hidden">
  <summary class="flex items-center justify-between px-4 py-2 bg-surface-alt cursor-pointer
                  select-none list-none hover:bg-accent/5 font-semibold text-sm text-text-primary">
    Spell Lists (Class → Level)
    <svg class="h-4 w-4 text-text-muted transition-transform group-open/sl:rotate-180"
         xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2" stroke-linecap="round"
         stroke-linejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  </summary>

  <div class="p-4 flex flex-col gap-3">
    <p class="text-[11px] text-text-muted">
      Defines which class spell lists include this spell and at what level.
      For psionic powers, list the manifester classes (Psion, Wilder, etc.) and the power level.
    </p>

    {#if spellListEntries.length === 0}
      <p class="text-xs text-text-muted italic">No spell lists assigned.</p>
    {:else}
      <table class="w-full text-xs border-collapse">
        <thead>
          <tr class="border-b border-border">
            <th class="text-left px-2 py-1 font-semibold text-text-muted">Class</th>
            <th class="text-center px-2 py-1 font-semibold text-text-muted w-20">Level</th>
            <th class="w-8"></th>
          </tr>
        </thead>
        <tbody>
          {#each spellListEntries as [classId, level] (classId)}
            <tr class="border-b border-border/50 hover:bg-surface-alt/50">
              <td class="px-2 py-1">
                <span class="text-text-primary">{classLabel(classId)}</span>
                <code class="ml-1.5 font-mono text-[9px] text-text-muted">{classId}</code>
              </td>
              <td class="px-2 py-1 text-center">
                <input type="number" class="input text-xs text-center w-14 py-0.5" min="0" max="9"
                       value={level}
                       oninput={(e) => setSpellListLevel(classId, parseInt((e.currentTarget as HTMLInputElement).value) || 0)}
                       aria-label="Spell level for {classId}"/>
              </td>
              <td class="px-2 py-1 text-center">
                <button type="button" class="btn-ghost btn-icon h-6 w-6 p-0 text-text-muted hover:text-danger"
                        onclick={() => removeSpellListClass(classId)}
                        aria-label="Remove {classId}">
                  <svg class="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
                       fill="none" stroke="currentColor" stroke-width="2"
                       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}

    <button type="button" class="btn-primary text-xs py-1 px-3 h-auto w-fit"
            onclick={() => (showClassPicker = true)}>
      + Add Class
    </button>
  </div>
</details>

<!-- ======================================================================= -->
<!-- SECTION 3 — PSIONIC (only when magicType === 'psionic')                  -->
<!-- ======================================================================= -->
{#if magic.magicType === 'psionic'}
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
{/if}
