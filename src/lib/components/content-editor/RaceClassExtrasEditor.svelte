<!--
  @file src/lib/components/content-editor/RaceClassExtrasEditor.svelte
  @description Extra fields for Race and Class entities in the Content Editor.

  ────────────────────────────────────────────────────────────────────────────
  RENDERS WHEN: category === "race" OR category === "class"
  Returns nothing for all other categories (clean null render).
  ────────────────────────────────────────────────────────────────────────────

  RACE FIELDS:
    recommendedAttributes  — Checkbox grid of the 6 ability scores.
                             A cosmetic UX hint shown in the Point Buy UI
                             (green = recommended, orange = useful, red = dump).
                             Engine reads Feature.recommendedAttributes.

  CLASS FIELDS:
    classSkills            — Chip list of skill IDs drawn from
                             config_skill_definitions (DataLoader).
                             Skills are NOT features — we use a dropdown
                             populated from the config table, not FeaturePickerModal.
                             Engine reads Feature.classSkills.

    spPerLevel             — Skill points gained per level + 1 per INT mod.
                             Stored as a base modifier targeting
                             "attributes.skill_points_per_level" in grantedModifiers.
                             Engine reads GameEngine.#computeSkillPoints().

    hitDie                 — Hit die type (d4 / d6 / d8 / d10 / d12).
                             Stored as a base modifier targeting "combatStats.max_hp"
                             whose value is the dice expression string ("d10" etc.).
                             Engine rolls this die per level when the player gains HP.

  ────────────────────────────────────────────────────────────────────────────
  @see src/lib/types/feature.ts   Feature.recommendedAttributes / classSkills
  @see editorContext.ts           EditorContext
  @see ARCHITECTURE.md §5.5       classSkills spec
-->

<script lang="ts">
  import { getContext } from 'svelte';
  import { EDITOR_CONTEXT_KEY, type EditorContext } from './editorContext';
  import { dataLoader } from '$lib/engine/DataLoader';
  import type { Modifier } from '$lib/types/pipeline';
  import type { ID } from '$lib/types/primitives';

  // ===========================================================================
  // CONTEXT
  // ===========================================================================

  const ctx = getContext<EditorContext>(EDITOR_CONTEXT_KEY);

  // ===========================================================================
  // ABILITY SCORE OPTIONS (for recommendedAttributes)
  // ===========================================================================

  const ABILITY_SCORES: Array<{ id: ID; label: string }> = [
    { id: 'stat_str', label: 'Strength (STR)' },
    { id: 'stat_dex', label: 'Dexterity (DEX)' },
    { id: 'stat_con', label: 'Constitution (CON)' },
    { id: 'stat_int', label: 'Intelligence (INT)' },
    { id: 'stat_wis', label: 'Wisdom (WIS)' },
    { id: 'stat_cha', label: 'Charisma (CHA)' },
  ];

  function hasRecommendedAttr(id: ID): boolean {
    return (ctx.feature.recommendedAttributes ?? []).includes(id);
  }

  function toggleRecommendedAttr(id: ID, on: boolean): void {
    const current = ctx.feature.recommendedAttributes ?? [];
    ctx.feature.recommendedAttributes = on
      ? [...current, id]
      : current.filter(a => a !== id);
  }

  // ===========================================================================
  // SKILL DEFINITIONS (for classSkills chip editor)
  // ===========================================================================

  interface SkillDef { id: string; label?: { en?: string } }

  /**
   * All skill IDs available from config_skill_definitions, sorted alphabetically
   * by English label.  Populated dynamically from DataLoader.
   */
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

  /** Skill IDs already in classSkills (for duplicate-prevention). */
  const existingClassSkills = $derived(new Set(ctx.feature.classSkills ?? []));

  function addClassSkill(skillId: string): void {
    if (!skillId || existingClassSkills.has(skillId)) return;
    ctx.feature.classSkills = [...(ctx.feature.classSkills ?? []), skillId];
  }

  function removeClassSkill(skillId: string): void {
    ctx.feature.classSkills = (ctx.feature.classSkills ?? []).filter(s => s !== skillId);
  }

  let classSkillDropdownValue = $state('');

  // ===========================================================================
  // spPerLevel — read/write via grantedModifiers
  // ===========================================================================

  const SP_TARGET = 'attributes.skill_points_per_level';

  /**
   * Finds the base modifier targeting SP_TARGET in grantedModifiers.
   * Returns its numeric value, or 2 as a sensible default.
   */
  function readSpPerLevel(): number {
    const mod = ctx.feature.grantedModifiers.find(
      m => m.targetId === SP_TARGET && m.type === 'base'
    );
    return typeof mod?.value === 'number' ? mod.value : 2;
  }

  /**
   * Sets the spPerLevel by updating or inserting the base modifier.
   */
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

  // ===========================================================================
  // hitDie — read/write via grantedModifiers
  // ===========================================================================

  const HP_TARGET = 'combatStats.max_hp';
  const HIT_DICE = ['d4', 'd6', 'd8', 'd10', 'd12'] as const;
  type HitDie = typeof HIT_DICE[number];

  /**
   * Finds the base modifier targeting HP_TARGET in grantedModifiers.
   * Returns its string value ('d10' etc.), defaulting to 'd8'.
   */
  function readHitDie(): HitDie {
    const mod = ctx.feature.grantedModifiers.find(
      m => m.targetId === HP_TARGET && m.type === 'base'
    );
    const val = typeof mod?.value === 'string' ? mod.value : 'd8';
    return (HIT_DICE as readonly string[]).includes(val)
      ? (val as HitDie)
      : 'd8';
  }

  /**
   * Sets the hitDie by updating or inserting the base modifier.
   */
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

  // Unique uid for label->input ids
  const uid = Math.random().toString(36).slice(2, 7);
  const fid = (n: string) => `rce-${uid}-${n}`;
</script>

<!-- ======================================================================= -->
<!-- RACE EXTRAS                                                               -->
<!-- ======================================================================= -->
{#if ctx.feature.category === 'race'}

  <div class="flex flex-col gap-4 rounded-lg border border-border p-4">
    <div class="flex flex-col gap-0.5">
      <span class="text-sm font-semibold text-text-primary">Race Extras</span>
      <span class="text-[11px] text-text-muted">
        Fields specific to <code class="font-mono">category: "race"</code> entities.
      </span>
    </div>

    <!-- Recommended Attributes -->
    <fieldset class="flex flex-col gap-2">
      <legend class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        Recommended Attributes
        <span class="ml-1 font-normal text-[9px]">
          (cosmetic UX guidance for Point Buy — no mechanical effect)
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
        Checked stats are highlighted green in the Point Buy UI during character creation.
        Example: Fighter → STR, CON, DEX; Wizard → INT, DEX, CON.
      </p>
    </fieldset>

    <!-- Class Skills (races can also grant class skills — e.g. Elf gets Spot as class skill) -->
    <div class="flex flex-col gap-2">
      <div class="flex items-center justify-between">
        <span class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Class Skills
          <span class="ml-1 font-normal text-[9px]">(optional — racial bonus class skills)</span>
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
                    aria-label="Remove {skillId}">×</button>
          </span>
        {:else}
          <span class="text-xs text-text-muted italic">No racial class skills.</span>
        {/each}
      </div>
      {#if skillDefs.length > 0}
        <div class="flex gap-2">
          <label for={fid('race-skill-add')} class="sr-only">Add class skill</label>
          <select
            id={fid('race-skill-add')}
            class="input text-xs flex-1"
            bind:value={classSkillDropdownValue}
          >
            <option value="">— Select a skill to add</option>
            {#each skillDefs.filter(s => !existingClassSkills.has(s.id)) as s (s.id)}
              <option value={s.id}>{s.label?.en ?? s.id}</option>
            {/each}
          </select>
          <button type="button" class="btn-primary text-xs py-0.5 px-3 h-auto"
                  onclick={() => { addClassSkill(classSkillDropdownValue); classSkillDropdownValue = ''; }}
                  disabled={!classSkillDropdownValue}>
            + Add
          </button>
        </div>
      {:else}
        <p class="text-[10px] text-text-muted italic">
          Load rule sources to populate the skill list.
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
      <span class="text-sm font-semibold text-text-primary">Class Extras</span>
      <span class="text-[11px] text-text-muted">
        Fields specific to <code class="font-mono">category: "class"</code> entities.
      </span>
    </div>

    <!-- Hit Die + spPerLevel side by side -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">

      <!-- Hit Die -->
      <div class="flex flex-col gap-1.5">
        <label for={fid('hitdie')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Hit Die
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
          Stored as a <code class="font-mono">base</code> modifier on
          <code class="font-mono">combatStats.max_hp</code>.
          Each class level rolls this die to determine HP gained.
          D&D 3.5 standard: d6/d8/d10/d12 for most classes.
        </p>
      </div>

      <!-- Skill Points Per Level -->
      <div class="flex flex-col gap-1.5">
        <label for={fid('sp')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Skill Points per Level <span class="font-normal text-[9px]">(before INT modifier)</span>
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
          Stored as a <code class="font-mono">base</code> modifier on
          <code class="font-mono">attributes.skill_points_per_level</code>.
          Actual SP/lvl = max(1, this value + INT modifier). SRD convention: 2/4/6/8 (×4 at level 1).
          Human racial feature grants +1 via
          <code class="font-mono">attributes.bonus_skill_points_per_level</code>.
        </p>
      </div>

    </div>

    <!-- Recommended Attributes (classes also use this) -->
    <fieldset class="flex flex-col gap-2">
      <legend class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        Recommended Attributes
        <span class="ml-1 font-normal text-[9px]">(cosmetic UX hint — no mechanical effect)</span>
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
          Class Skills
          {#if (ctx.feature.classSkills ?? []).length > 0}
            <span class="ml-1.5 badge font-normal text-[9px]">{ctx.feature.classSkills?.length}</span>
          {/if}
        </span>
      </div>
      <p class="text-[11px] text-text-muted -mt-1">
        Skills on this list cost ×1 SP per rank for characters in this class.
        All other skills cost ×2 SP (cross-class).
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
                    aria-label="Remove {skillId} from class skills">×</button>
          </span>
        {:else}
          <span class="text-xs text-text-muted italic">No class skills defined.</span>
        {/each}
      </div>

      <!-- Add dropdown -->
      {#if skillDefs.length > 0}
        <div class="flex gap-2 mt-1">
          <label for={fid('skill-add')} class="sr-only">Add class skill</label>
          <select
            id={fid('skill-add')}
            class="input text-xs flex-1"
            bind:value={classSkillDropdownValue}
          >
            <option value="">— Select a skill to add</option>
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
            + Add
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
            title="Add all {skillDefs.length} skills as class skills (for Rogue-style all-class-skills)"
          >
            + Add all {skillDefs.length} skills
          </button>
        {/if}

      {:else}
        <p class="text-[10px] text-text-muted italic">
          Load rule sources to populate the skill list.
        </p>
      {/if}
    </div>

  </div>

{/if}
