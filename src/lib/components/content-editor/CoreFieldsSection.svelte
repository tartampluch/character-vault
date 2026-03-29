<!--
  @file src/lib/components/content-editor/CoreFieldsSection.svelte
  @description Core fields common to every entity type in the Content Editor.

  ────────────────────────────────────────────────────────────────────────────
  PURPOSE
  ────────────────────────────────────────────────────────────────────────────
  Rendered at the top of EntityForm for ALL FeatureCategory values. Edits the
  fields that exist on the base `Feature` interface:

    id              — kebab-case entity identifier with collision warning
    category        — FeatureCategory dropdown (11 values w/ D&D labels)
    label           — Localised name (multi-language via LocalizedStringEditor)
    description     — Localised description (multi-language, textarea + preview)
    ruleSource      — Defaults to "user_homebrew"; governs filter/stacking
    tags            — String[] chip list, opens TagPickerModal
    forbiddenTags   — String[] chip list, opens TagPickerModal
    merge           — Replace / Partial radio with inline explanation

  ────────────────────────────────────────────────────────────────────────────
  MULTILINGUAL EDITING
  ────────────────────────────────────────────────────────────────────────────
  Both `label` and `description` are `LocalizedString` (Record<string, string>).
  The `LocalizedStringEditor` component dynamically renders one field per
  language present in the value, always starting with English (mandatory).
  GMs can add translations in any language (from loaded rule files or via the
  NewLanguageModal for unlisted languages) and remove non-English ones.

  ────────────────────────────────────────────────────────────────────────────
  EDITOR CONTEXT
  ────────────────────────────────────────────────────────────────────────────
  This component does NOT accept props. It reads the shared EditorContext
  created by EntityForm via Svelte's `getContext` API:

    ctx.feature          — the mutable $state Feature draft
    ctx.hasOverrideWarning — true when feature.id matches an existing SRD entity
    ctx.mode             — 'create' | 'edit'

  Mutations write directly to ctx.feature fields (e.g. `ctx.feature.id = val`).
  Svelte 5's $state proxy propagates the change to all consumers automatically.

  ────────────────────────────────────────────────────────────────────────────
  @see editorContext.ts                       for EditorContext type
  @see TagPickerModal.svelte                  for tag chip editing
  @see LocalizedStringEditor.svelte          for multilingual text input
  @see ARCHITECTURE.md §21.3                  for full specification
-->

<script lang="ts">
  import { getContext } from 'svelte';
  import { EDITOR_CONTEXT_KEY, type EditorContext } from './editorContext';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import TagPickerModal from './TagPickerModal.svelte';
  import LocalizedStringEditor from './LocalizedStringEditor.svelte';
  import type { FeatureCategory } from '$lib/types/feature';
  import { IconWarning, IconClose } from '$lib/components/ui/icons';

  // ===========================================================================
  // CONTEXT + LANGUAGE
  // ===========================================================================

  const ctx = getContext<EditorContext>(EDITOR_CONTEXT_KEY);
  const lang = $derived(engine.settings.language);

  /**
   * Re-derive override warning locally with a reactive $derived so it
   * updates whenever ctx.feature.id changes (ctx.hasOverrideWarning is a
   * non-reactive getter on the context object; reading it inside $derived
   * is sufficient because ctx.feature is $state).
   */
  const hasOverride = $derived(
    ctx.feature.id.length > 0 &&
    dataLoader.getAllFeatures().some(
      f => f.id === ctx.feature.id && f.ruleSource !== 'user_homebrew'
    )
  );

  // ===========================================================================
  // CATEGORY METADATA
  // ===========================================================================

  const ALL_CATEGORIES: FeatureCategory[] = [
    'race', 'class', 'class_feature', 'feat', 'deity', 'domain',
    'magic', 'item', 'condition', 'monster_type', 'environment',
  ];

  const CATEGORY_LABEL_KEYS: Record<FeatureCategory, string> = {
    race:          'editor.category.race',
    class:         'editor.category.class',
    class_feature: 'editor.category.class_feature',
    feat:          'editor.category.feat',
    deity:         'editor.category.deity',
    domain:        'editor.category.domain',
    magic:         'editor.category.magic',
    item:          'editor.category.item',
    condition:     'editor.category.condition',
    monster_type:  'editor.category.monster_type',
    environment:   'editor.category.environment',
  };

  // ===========================================================================
  // TAG PICKER STATE
  // ===========================================================================

  let tagPickerField = $state<'tags' | 'forbiddenTags' | null>(null);

  function openTagPicker(field: 'tags' | 'forbiddenTags'): void {
    tagPickerField = field;
  }

  function handleTagsPicked(tags: string[]): void {
    if (tagPickerField === 'tags') {
      ctx.feature.tags = tags;
    } else if (tagPickerField === 'forbiddenTags') {
      ctx.feature.forbiddenTags = tags;
    }
    tagPickerField = null;
  }

  function removeTag(field: 'tags' | 'forbiddenTags', tag: string): void {
    if (field === 'tags') {
      ctx.feature.tags = ctx.feature.tags.filter(t => t !== tag);
    } else {
      ctx.feature.forbiddenTags = (ctx.feature.forbiddenTags ?? []).filter(t => t !== tag);
    }
  }

  // ===========================================================================
  // LABEL / DESCRIPTION CHANGE HANDLERS
  // ===========================================================================

  function handleLabelChange(newValue: Record<string, string>): void {
    ctx.feature.label = newValue as Record<string, string>;
  }

  function handleDescriptionChange(newValue: Record<string, string>): void {
    ctx.feature.description = newValue as Record<string, string>;
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  // Unique suffix for this instance (label `for`/input `id` pairs)
  const uid = Math.random().toString(36).slice(2, 7);
  const fid = (name: string) => `cfs-${uid}-${name}`;
</script>

<!-- Tag Picker Modal (shared for tags and forbiddenTags) -->
{#if tagPickerField !== null}
  <TagPickerModal
    initialSelected={tagPickerField === 'tags'
      ? (ctx.feature.tags ?? [])
      : (ctx.feature.forbiddenTags ?? [])}
    onTagsPicked={handleTagsPicked}
    onclose={() => (tagPickerField = null)}
  />
{/if}

<div class="flex flex-col gap-5">

  <!-- ======================================================================= -->
  <!-- OVERRIDE WARNING BANNER                                                   -->
  <!-- ======================================================================= -->
  {#if hasOverride}
    <div class="flex items-start gap-3 rounded-lg border border-amber-600/40
                bg-amber-900/20 px-4 py-3 text-sm text-amber-300">
      <IconWarning size={18} class="shrink-0" aria-hidden="true" />
      <div class="flex flex-col gap-1">
        <p class="font-semibold">
          {ui('editor.core.override_warning_title', lang)}
        </p>
        <p class="text-xs text-amber-400/80">
          {ui('editor.core.override_warning_desc', lang)}
        </p>
      </div>
    </div>
  {/if}

  <!-- ======================================================================= -->
  <!-- ID                                                                        -->
  <!-- ======================================================================= -->
  <div class="flex flex-col gap-1.5">
    <label
      for={fid('id')}
      class="text-sm font-semibold {hasOverride ? 'text-amber-400' : 'text-text-primary'}"
    >
      {ui('editor.core.entity_id_label', lang)}
      <span class="ml-1 text-xs font-normal text-text-muted">{ui('editor.core.entity_id_kebab_hint', lang)}</span>
    </label>
    <input
      id={fid('id')}
      type="text"
      class="input font-mono {hasOverride ? 'border-amber-600/60 focus:ring-amber-500/40' : ''}"
      value={ctx.feature.id}
      placeholder={ui('editor.core.entity_id_placeholder', lang)}
      oninput={(e) => { ctx.feature.id = (e.currentTarget as HTMLInputElement).value; }}
      autocomplete="off"
      spellcheck="false"
    />
    <p class="text-[11px] text-text-muted">
      {ui('editor.core.entity_id_desc', lang)}
    </p>
  </div>

  <!-- ======================================================================= -->
  <!-- CATEGORY                                                                  -->
  <!-- ======================================================================= -->
  <div class="flex flex-col gap-1.5">
    <label for={fid('category')} class="text-sm font-semibold text-text-primary">
      {ui('editor.core.category_label', lang)}
    </label>
    <select
      id={fid('category')}
      class="input"
      value={ctx.feature.category}
      onchange={(e) => {
        ctx.feature.category = (e.currentTarget as HTMLSelectElement).value as FeatureCategory;
      }}
    >
      {#each ALL_CATEGORIES as cat (cat)}
        <option value={cat}>{ui(CATEGORY_LABEL_KEYS[cat], lang)}</option>
      {/each}
    </select>
    <p class="text-[11px] text-text-muted">
      {ui('editor.core.category_desc', lang)}
    </p>
  </div>

  <!-- ======================================================================= -->
  <!-- LABEL — multi-language                                                    -->
  <!-- ======================================================================= -->
  <fieldset class="flex flex-col gap-2">
    <legend class="text-sm font-semibold text-text-primary mb-1.5">
      {ui('editor.core.label_legend', lang)}
      <span class="text-xs font-normal text-text-muted">{ui('editor.core.label_display_hint', lang)}</span>
    </legend>

    <LocalizedStringEditor
      value={ctx.feature.label as Record<string, string>}
      onchange={handleLabelChange}
      mode="input"
      uid="cfs-{uid}"
      fieldName="label"
      {lang}
      placeholder={ui('editor.core.label_en_placeholder', lang)}
      extraPlaceholder={ui('editor.lang.translation_placeholder', lang)}
    />
  </fieldset>

  <!-- ======================================================================= -->
  <!-- DESCRIPTION — multi-language with preview                                -->
  <!-- ======================================================================= -->
  <fieldset class="flex flex-col gap-2">
    <legend class="text-sm font-semibold text-text-primary mb-1.5">
      {ui('editor.core.description_legend', lang)}
    </legend>

    <LocalizedStringEditor
      value={ctx.feature.description as Record<string, string>}
      onchange={handleDescriptionChange}
      mode="textarea"
      uid="cfs-{uid}"
      fieldName="description"
      {lang}
      placeholder={ui('editor.core.desc_en_placeholder', lang)}
      extraPlaceholder={ui('editor.lang.desc_translation_placeholder', lang)}
      showPreview={true}
    />
  </fieldset>

  <!-- ======================================================================= -->
  <!-- RULE SOURCE                                                               -->
  <!-- ======================================================================= -->
  <div class="flex flex-col gap-1.5">
    <label for={fid('ruleSource')} class="text-sm font-semibold text-text-primary">
      {ui('editor.core.rule_source_label', lang)}
    </label>
    <input
      id={fid('ruleSource')}
      type="text"
      class="input font-mono text-sm"
      value={ctx.feature.ruleSource}
      placeholder={ui('editor.core.rule_source_placeholder', lang)}
      oninput={(e) => { ctx.feature.ruleSource = (e.currentTarget as HTMLInputElement).value || 'user_homebrew'; }}
      autocomplete="off"
      spellcheck="false"
    />
    <p class="text-[11px] text-text-muted">
      {ui('editor.core.rule_source_desc', lang)}
    </p>
  </div>

  <!-- ======================================================================= -->
  <!-- TAGS                                                                      -->
  <!-- ======================================================================= -->
  <div class="flex flex-col gap-1.5">
    <div class="flex items-center justify-between">
      <span class="text-sm font-semibold text-text-primary">{ui('editor.core.tags_label', lang)}</span>
      <button
        type="button"
        class="btn-ghost text-xs py-0.5 px-2 h-auto"
        onclick={() => openTagPicker('tags')}
      >
        {ui('editor.core.add_tags_btn', lang)}
      </button>
    </div>
    <p class="text-[11px] text-text-muted -mt-1">
      {ui('editor.core.tags_convention_hint', lang)}
    </p>
    <div class="flex flex-wrap gap-1.5 min-h-[2rem]">
      {#if (ctx.feature.tags ?? []).length === 0}
        <span class="text-xs text-text-muted italic">{ui('editor.core.no_tags', lang)}</span>
      {:else}
        {#each ctx.feature.tags as tag (tag)}
          <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full
                       bg-surface border border-border text-xs font-mono text-text-primary">
            {tag}
            <button
              type="button"
              class="text-text-muted hover:text-danger transition-colors leading-none ml-0.5"
              onclick={() => removeTag('tags', tag)}
              aria-label={ui('editor.core.remove_tag_aria', lang).replace('{tag}', tag)}
            ><IconClose size={12} aria-hidden="true" /></button>
          </span>
        {/each}
      {/if}
    </div>
  </div>

  <!-- ======================================================================= -->
  <!-- FORBIDDEN TAGS                                                            -->
  <!-- ======================================================================= -->
  <div class="flex flex-col gap-1.5">
    <div class="flex items-center justify-between">
      <span class="text-sm font-semibold text-text-primary">
        {ui('editor.core.forbidden_tags_label', lang)}
        <span class="ml-1 text-xs font-normal text-text-muted">{ui('editor.choices.prefix_optional', lang)}</span>
      </span>
      <button
        type="button"
        class="btn-ghost text-xs py-0.5 px-2 h-auto"
        onclick={() => openTagPicker('forbiddenTags')}
      >
        {ui('common.add', lang)}
      </button>
    </div>
    <p class="text-[11px] text-text-muted -mt-1">
      {ui('editor.core.forbidden_tags_hint', lang)}
    </p>
    <div class="flex flex-wrap gap-1.5 min-h-[2rem]">
      {#if (ctx.feature.forbiddenTags ?? []).length === 0}
        <span class="text-xs text-text-muted italic">{ui('editor.core.no_forbidden_tags', lang)}</span>
      {:else}
        {#each (ctx.feature.forbiddenTags ?? []) as tag (tag)}
          <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full
                       bg-red-900/20 border border-red-700/30
                       text-xs font-mono text-red-300">
            {tag}
            <button
              type="button"
              class="text-red-400/60 hover:text-danger transition-colors leading-none ml-0.5"
              onclick={() => removeTag('forbiddenTags', tag)}
              aria-label={ui('editor.core.remove_forbidden_tag_aria', lang).replace('{tag}', tag)}
            ><IconClose size={12} aria-hidden="true" /></button>
          </span>
        {/each}
      {/if}
    </div>
  </div>

  <!-- ======================================================================= -->
  <!-- MERGE STRATEGY                                                            -->
  <!-- ======================================================================= -->
  <fieldset class="flex flex-col gap-2">
    <legend class="text-sm font-semibold text-text-primary mb-1">{ui('editor.core.merge_strategy_legend', lang)}</legend>

    <label
      class="flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors
             {ctx.feature.merge === 'replace' || !ctx.feature.merge
               ? 'border-accent/50 bg-accent/5'
               : 'border-border hover:border-border/80'}"
    >
      <input
        type="radio"
        class="mt-0.5 shrink-0 accent-accent"
        name={fid('merge')}
        value="replace"
        checked={ctx.feature.merge === 'replace' || !ctx.feature.merge}
        onchange={() => { ctx.feature.merge = 'replace'; }}
      />
      <div class="flex flex-col gap-0.5">
        <span class="text-sm font-semibold text-text-primary">{ui('editor.core.merge_replace_label', lang)}</span>
        <span class="text-xs text-text-muted">
          {ui('editor.core.merge_replace_desc', lang)}
        </span>
      </div>
    </label>

    <label
      class="flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors
             {ctx.feature.merge === 'partial'
               ? 'border-accent/50 bg-accent/5'
               : 'border-border hover:border-border/80'}"
    >
      <input
        type="radio"
        class="mt-0.5 shrink-0 accent-accent"
        name={fid('merge')}
        value="partial"
        checked={ctx.feature.merge === 'partial'}
        onchange={() => { ctx.feature.merge = 'partial'; }}
      />
      <div class="flex flex-col gap-0.5">
        <span class="text-sm font-semibold text-text-primary">{ui('editor.core.merge_partial_label', lang)}</span>
        <span class="text-xs text-text-muted">
          {ui('editor.core.merge_partial_desc', lang)}
        </span>
      </div>
    </label>
  </fieldset>

</div>
