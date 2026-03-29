<!--
  @file src/lib/components/content-editor/RaceClassExtrasEditor.svelte
  @description Extra fields for Race and Class entities in the Content Editor.
-->

<script lang="ts">
  import { getContext } from 'svelte';
  import { EDITOR_CONTEXT_KEY, type EditorContext } from './editorContext';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import type { Modifier } from '$lib/types/pipeline';
  import type { ID } from '$lib/types/primitives';
  import { MAIN_ABILITY_IDS } from '$lib/utils/constants';
  import { IconClose } from '$lib/components/ui/icons';

  const ctx = getContext<EditorContext>(EDITOR_CONTEXT_KEY);
  const lang = $derived(engine.settings.language);

  const ABILITY_SCORES = $derived(
    MAIN_ABILITY_IDS.map(id => ({
      id: id as ID,
      label: engine.resolvePipelineLabel(id),
    }))
  );

  function hasRecommendedAttr(id: ID): boolean {
    return (ctx.feature.recommendedAttributes ?? []).includes(id);
  }

  function toggleRecommendedAttr(id: ID, on: boolean): void {
    const current = ctx.feature.recommendedAttributes ?? [];
    ctx.feature.recommendedAttributes = on
      ? [...current, id]
      : current.filter(a => a !== id);
  }

  interface SkillDef { id: string; label?: { en?: string } }

  const skillDefs = $derived.by((): SkillDef[] => {
    const table = dataLoader.getConfigTable('config_skill_definitions');
    if (!table?.data) return [];
    const raw = table.data as unknown as Record<string, SkillDef>;
    return Object.values(raw)
      .sort((a, b) => (a.label?.en ?? a.id).localeCompare(b.label?.en ?? b.id));
  });

  function skillLabel(id: string): string {
    const def = skillDefs.find(s => s.id === id);
    return def?.label?.en ?? id;
  }

  const existingClassSkills = $derived(new Set(ctx.feature.classSkills ?? []));

  function addClassSkill(skillId: string): void {
    if (!skillId || existingClassSkills.has(skillId)) return;
    ctx.feature.classSkills = [...(ctx.feature.classSkills ?? []), skillId];
  }

  function removeClassSkill(skillId: string): void {
    ctx.feature.classSkills = (ctx.feature.classSkills ?? []).filter(s => s !== skillId);
  }

  let classSkillDropdownValue = $state('');

  const SP_TARGET = 'attributes.skill_points_per_level';

  function readSpPerLevel(): number {
    const mod = ctx.feature.grantedModifiers.find(
      m => m.targetId === SP_TARGET && m.type === 'base'
    );
    return typeof mod?.value === 'number' ? mod.value : 2;
  }

  function writeSpPerLevel(value: number): void {
    const existing = ctx.feature.grantedModifiers;
    const idx = existing.findIndex(m => m.targetId === SP_TARGET && m.type === 'base');

    if (idx >= 0) {
      const arr = [...existing];
      arr[idx] = { ...arr[idx], value };
      ctx.feature.grantedModifiers = arr;
    } else {
      ctx.feature.grantedModifiers = [
        ...existing,
        {
          id:         `base_sp_per_level`,
          sourceId:   ctx.feature.id || 'class_id',
          sourceName: ctx.feature.label as Record<string, string>,
          targetId:   SP_TARGET,
          value,
          type:       'base',
        } as Modifier,
      ];
    }
  }

  const HP_TARGET = 'combatStats.max_hp';
  const HIT_DICE = ['d4', 'd6', 'd8', 'd10', 'd12'] as const;
  type HitDie = typeof HIT_DICE[number];

  function readHitDie(): HitDie {
    const mod = ctx.feature.grantedModifiers.find(
      m => m.targetId === HP_TARGET && m.type === 'base'
    );
    const val = typeof mod?.value === 'string' ? mod.value : 'd8';
    return (HIT_DICE as readonly string[]).includes(val)
      ? (val as HitDie)
      : 'd8';
  }

  function writeHitDie(die: HitDie): void {
    const existing = ctx.feature.grantedModifiers;
    const idx = existing.findIndex(m => m.targetId === HP_TARGET && m.type === 'base');

    if (idx >= 0) {
      const arr = [...existing];
      arr[idx] = { ...arr[idx], value: die };
      ctx.feature.grantedModifiers = arr;
    } else {
      ctx.feature.grantedModifiers = [
        ...existing,
        {
          id:         `base_hit_die`,
          sourceId:   ctx.feature.id || 'class_id',
          sourceName: ctx.feature.label as Record<string, string>,
          targetId:   HP_TARGET,
          value:      die,
          type:       'base',
        } as Modifier,
      ];
    }
  }

  const uid = Math.random().toString(36).slice(2, 7);
  const fid = (n: string) => `rce-${uid}-${n}`;
</script>

<!-- ======================================================================= -->
<!-- RACE EXTRAS                                                               -->
<!-- ======================================================================= -->
{#if ctx.feature.category === 'race'}

  <div class="flex flex-col gap-4 rounded-lg border border-border p-4">
    <div class="flex flex-col gap-0.5">
      <span class="text-sm font-semibold text-text-primary">{ui('editor.race_class.race_section_title', lang)}</span>
      <span class="text-[11px] text-text-muted">
        {ui('editor.race_class.race_section_hint', lang)}
      </span>
    </div>

    <!-- Recommended Attributes -->
    <fieldset class="flex flex-col gap-2">
      <legend class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        {ui('editor.race_class.recommended_attrs_legend', lang)}
        <span class="ml-1 font-normal text-[9px]">
          {ui('editor.race_class.recommended_attrs_hint', lang)}
        </span>
      </legend>
      <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
        {#each ABILITY_SCORES as attr (attr.id)}
          <label class="flex items-center gap-2 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              class="h-3.5 w-3.5 accent-accent"
              checked={hasRecommendedAttr(attr.id)}
              onchange={(e) => toggleRecommendedAttr(attr.id, (e.currentTarget as HTMLInputElement).checked)}
            />
            <span class="{hasRecommendedAttr(attr.id) ? 'text-green-400 font-medium' : 'text-text-primary'}">
              {attr.label}
            </span>
          </label>
        {/each}
      </div>
      <p class="text-[10px] text-text-muted">
        {ui('editor.race_class.race_attrs_desc', lang)}
      </p>
    </fieldset>

    <!-- Class Skills (races can also grant class skills) -->
    <div class="flex flex-col gap-2">
      <div class="flex items-center justify-between">
        <span class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          {ui('editor.race_class.race_class_skills_label', lang)}
          <span class="ml-1 font-normal text-[9px]">{ui('editor.race_class.race_class_skills_hint', lang)}</span>
        </span>
      </div>
      <div class="flex flex-wrap gap-1.5 min-h-[2rem]">
        {#each (ctx.feature.classSkills ?? []) as skillId (skillId)}
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface
                       border border-border text-[10px] font-mono text-text-primary">
            {skillLabel(skillId)}
            <button type="button"
                    class="text-text-muted hover:text-danger ml-0.5"
                     onclick={() => removeClassSkill(skillId)}
                     aria-label={ui('editor.race_class.remove_skill_aria', lang).replace('{id}', skillId)}><IconClose size={12} aria-hidden="true" /></button>
          </span>
        {:else}
          <span class="text-xs text-text-muted italic">{ui('editor.race_class.no_racial_class_skills', lang)}</span>
        {/each}
      </div>
      {#if skillDefs.length > 0}
        <div class="flex gap-2">
          <label for={fid('race-skill-add')} class="sr-only">{ui('editor.race_class.add_class_skill_aria', lang)}</label>
          <select
            id={fid('race-skill-add')}
            class="input text-xs flex-1"
            bind:value={classSkillDropdownValue}
          >
            <option value="">{ui('editor.race_class.select_skill_placeholder', lang)}</option>
            {#each skillDefs.filter(s => !existingClassSkills.has(s.id)) as s (s.id)}
              <option value={s.id}>{s.label?.en ?? s.id}</option>
            {/each}
          </select>
          <button type="button" class="btn-primary text-xs py-0.5 px-3 h-auto"
                  onclick={() => { addClassSkill(classSkillDropdownValue); classSkillDropdownValue = ''; }}
                  disabled={!classSkillDropdownValue}>
            {ui('common.add', lang)}
          </button>
        </div>
      {:else}
        <p class="text-[10px] text-text-muted italic">
          {ui('editor.race_class.load_skills_hint', lang)}
        </p>
      {/if}
    </div>

  </div>

<!-- ======================================================================= -->
<!-- CLASS EXTRAS                                                              -->
<!-- ======================================================================= -->
{:else if ctx.feature.category === 'class'}

  <div class="flex flex-col gap-4 rounded-lg border border-border p-4">
    <div class="flex flex-col gap-0.5">
      <span class="text-sm font-semibold text-text-primary">{ui('editor.race_class.class_section_title', lang)}</span>
      <span class="text-[11px] text-text-muted">
        {ui('editor.race_class.class_section_hint', lang)}
      </span>
    </div>

    <!-- Hit Die + spPerLevel side by side -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">

      <!-- Hit Die -->
      <div class="flex flex-col gap-1.5">
        <label for={fid('hitdie')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          {ui('editor.race_class.hit_die_label', lang)}
        </label>
        <div class="flex gap-2 flex-wrap">
          {#each HIT_DICE as die (die)}
            <label class="flex flex-col items-center cursor-pointer select-none">
              <input type="radio" name={fid('hitdie-radio')} class="sr-only"
                     value={die}
                     checked={readHitDie() === die}
                     onchange={() => writeHitDie(die)}/>
              <span class="px-3 py-2 rounded border text-sm font-bold font-mono transition-colors
                           {readHitDie() === die
                             ? 'border-accent bg-accent/15 text-text-primary'
                             : 'border-border text-text-muted hover:border-border/80 cursor-pointer'}">
                {die}
              </span>
            </label>
          {/each}
        </div>
        <p class="text-[10px] text-text-muted">
          {ui('editor.race_class.hit_die_hint', lang)}
        </p>
      </div>

      <!-- Skill Points Per Level -->
      <div class="flex flex-col gap-1.5">
        <label for={fid('sp')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          {ui('editor.race_class.sp_per_level_label', lang)} <span class="font-normal text-[9px]">{ui('editor.race_class.sp_before_int_hint', lang)}</span>
        </label>
        <input
          id={fid('sp')}
          type="number"
          class="input text-sm w-24"
          min="2"
          max="12"
          step="2"
          value={readSpPerLevel()}
          oninput={(e) => writeSpPerLevel(parseInt((e.currentTarget as HTMLInputElement).value) || 2)}
        />
        <p class="text-[10px] text-text-muted">
          {ui('editor.race_class.sp_per_level_hint', lang)}
        </p>
      </div>

    </div>

    <!-- Recommended Attributes (classes also use this) -->
    <fieldset class="flex flex-col gap-2">
      <legend class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        {ui('editor.race_class.recommended_attrs_legend', lang)}
        <span class="ml-1 font-normal text-[9px]">{ui('editor.race_class.recommended_attrs_hint2', lang)}</span>
      </legend>
      <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
        {#each ABILITY_SCORES as attr (attr.id)}
          <label class="flex items-center gap-2 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              class="h-3.5 w-3.5 accent-accent"
              checked={hasRecommendedAttr(attr.id)}
              onchange={(e) => toggleRecommendedAttr(attr.id, (e.currentTarget as HTMLInputElement).checked)}
            />
            <span class="{hasRecommendedAttr(attr.id) ? 'text-green-400 font-medium' : 'text-text-primary'}">
              {attr.label}
            </span>
          </label>
        {/each}
      </div>
    </fieldset>

    <!-- Class Skills -->
    <div class="flex flex-col gap-2">
      <div class="flex items-center justify-between">
        <span class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          {ui('editor.race_class.race_class_skills_label', lang)}
          {#if (ctx.feature.classSkills ?? []).length > 0}
            <span class="ml-1.5 badge font-normal text-[9px]">{ctx.feature.classSkills?.length}</span>
          {/if}
        </span>
      </div>
      <p class="text-[11px] text-text-muted -mt-1">
        {ui('editor.race_class.class_skills_hint', lang)}
      </p>

      <!-- Chip list -->
      <div class="flex flex-wrap gap-1.5 min-h-[2.5rem]">
        {#each (ctx.feature.classSkills ?? []) as skillId (skillId)}
          <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface
                       border border-border text-xs font-mono text-text-primary">
            {skillLabel(skillId)}
            <button type="button"
                    class="text-text-muted hover:text-danger ml-0.5 leading-none"
                     onclick={() => removeClassSkill(skillId)}
                     aria-label={ui('editor.race_class.remove_class_skill_aria', lang).replace('{id}', skillId)}><IconClose size={12} aria-hidden="true" /></button>
          </span>
        {:else}
          <span class="text-xs text-text-muted italic">{ui('editor.race_class.no_class_skills', lang)}</span>
        {/each}
      </div>

      <!-- Add dropdown -->
      {#if skillDefs.length > 0}
        <div class="flex gap-2 mt-1">
          <label for={fid('skill-add')} class="sr-only">{ui('editor.race_class.add_class_skill_aria', lang)}</label>
          <select
            id={fid('skill-add')}
            class="input text-xs flex-1"
            bind:value={classSkillDropdownValue}
          >
            <option value="">{ui('editor.race_class.select_skill_placeholder', lang)}</option>
            {#each skillDefs.filter(s => !existingClassSkills.has(s.id)) as s (s.id)}
              <option value={s.id}>{s.label?.en ?? s.id}</option>
            {/each}
          </select>
          <button
            type="button"
            class="btn-primary text-xs py-1 px-3 h-auto"
            onclick={() => { addClassSkill(classSkillDropdownValue); classSkillDropdownValue = ''; }}
            disabled={!classSkillDropdownValue}
          >
            {ui('common.add', lang)}
          </button>
        </div>

        <!-- Quick-select: add ALL skills at once -->
        {#if skillDefs.length > 0 && (ctx.feature.classSkills ?? []).length < skillDefs.length}
          <button
            type="button"
            class="btn-ghost text-[10px] py-0.5 w-fit"
            onclick={() => {
              for (const s of skillDefs) {
                if (!existingClassSkills.has(s.id)) addClassSkill(s.id);
              }
            }}
            title={ui('editor.race_class.add_all_skills_title', lang).replace('{n}', String(skillDefs.length))}
          >
            {ui('editor.race_class.add_all_skills_btn', lang).replace('{n}', String(skillDefs.length))}
          </button>
        {/if}

      {:else}
        <p class="text-[10px] text-text-muted italic">
          {ui('editor.race_class.load_skills_hint', lang)}
        </p>
      {/if}
    </div>

  </div>

{/if}
