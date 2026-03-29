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
    label           — Localised name (EN + FR text inputs)
    description     — Localised description (EN + FR textareas + preview toggle)
    ruleSource      — Defaults to "user_homebrew"; governs filter/stacking
    tags            — String[] chip list, opens TagPickerModal
    forbiddenTags   — String[] chip list, opens TagPickerModal
    merge           — Replace / Partial radio with inline explanation

  ────────────────────────────────────────────────────────────────────────────
  EDITOR CONTEXT
  ────────────────────────────────────────────────────────────────────────────
  This component does NOT accept props.  It reads the shared EditorContext
  created by EntityForm via Svelte's `getContext` API:

    ctx.feature          — the mutable $state Feature draft
    ctx.hasOverrideWarning — true when feature.id matches an existing SRD entity
    ctx.mode             — 'create' | 'edit'

  Mutations write directly to ctx.feature fields (e.g. `ctx.feature.id = val`).
  Svelte 5's $state proxy propagates the change to all consumers automatically.

  ────────────────────────────────────────────────────────────────────────────
  ID FIELD — OVERRIDE WARNING
  ────────────────────────────────────────────────────────────────────────────
  When `ctx.hasOverrideWarning` is true AND the id is non-empty, the field
  label turns amber and an inline banner reads:
    "⚠ This ID matches an existing SRD entity — it will be overridden in the
     resolution chain. Set merge: "Partial" to extend it instead of replacing."

  ────────────────────────────────────────────────────────────────────────────
  DESCRIPTION PREVIEW
  ────────────────────────────────────────────────────────────────────────────
  Each language tab has a "Preview" toggle (per-language $state boolean).
  In preview mode the textarea is replaced with a <div> that renders the raw
  text with `white-space: pre-wrap`.  Full Markdown rendering is a future
  enhancement — the component is forward-compatible because the preview div
  shares the same container class (`prose`).

  ────────────────────────────────────────────────────────────────────────────
  @see editorContext.ts                       for EditorContext type
  @see TagPickerModal.svelte                  for tag chip editing
  @see ARCHITECTURE.md §21.3                  for full specification
-->

<script lang="ts">
  import { getContext } from 'svelte';
  import { EDITOR_CONTEXT_KEY, type EditorContext } from './editorContext';
  import { dataLoader } from '$lib/engine/DataLoader';
  import TagPickerModal from './TagPickerModal.svelte';
  import type { FeatureCategory } from '$lib/types/feature';
  import { IconWarning, IconClose } from '$lib/components/ui/icons';

  // ===========================================================================
  // CONTEXT
  // ===========================================================================

  const ctx = getContext<EditorContext>(EDITOR_CONTEXT_KEY);

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

  const CATEGORY_LABELS: Record<FeatureCategory, string> = {
    race:          'Race',
    class:         'Class',
    class_feature: 'Class Feature',
    feat:          'Feat',
    deity:         'Deity',
    domain:        'Domain',
    magic:         'Spell / Psionic Power',
    item:          'Item / Equipment',
    condition:     'Condition / Status',
    monster_type:  'Monster Type',
    environment:   'Environment',
  };

  // ===========================================================================
  // DESCRIPTION PREVIEW TOGGLES (per-language)
  // ===========================================================================

  let previewEn = $state(false);
  let previewFr = $state(false);

  // ===========================================================================
  // TAG PICKER STATE
  // ===========================================================================

  /**
   * 'tags' → opens TagPickerModal for feature.tags
   * 'forbiddenTags' → opens TagPickerModal for feature.forbiddenTags
   * null → no picker open
   */
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
  // HELPERS
  // ===========================================================================

  /**
   * Safe read from a LocalizedString (Record<string,string>) with fallback.
   */
  function locGet(obj: Record<string, string> | undefined, lang: string): string {
    return (obj as Record<string, string> | undefined)?.[lang] ?? '';
  }

  /**
   * Write one language key into a LocalizedString field on the feature.
   * Creates a new object reference so Svelte's proxy detects the change.
   */
  function locSet(
    field: 'label' | 'description',
    lang: string,
    value: string
  ): void {
    ctx.feature[field] = {
      ...(ctx.feature[field] as Record<string, string>),
      [lang]: value,
    } as Record<string, string>;
  }

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
          This ID matches an existing SRD entity — it will be overridden.
        </p>
        <p class="text-xs text-amber-400/80">
          The homebrew version will take precedence in the resolution chain
          because it loads after all file-based rule sources.
          Set <strong>Merge</strong> to <em>Partial</em> below if you want to
          extend the original instead of replacing it entirely.
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
      Entity ID
      <span class="ml-1 text-xs font-normal text-text-muted">(kebab-case)</span>
    </label>
    <input
      id={fid('id')}
      type="text"
      class="input font-mono {hasOverride ? 'border-amber-600/60 focus:ring-amber-500/40' : ''}"
      value={ctx.feature.id}
      placeholder="e.g. feat_power_attack, race_half_orc_variant"
      oninput={(e) => { ctx.feature.id = (e.currentTarget as HTMLInputElement).value; }}
      autocomplete="off"
      spellcheck="false"
    />
    <p class="text-[11px] text-text-muted">
      Must be unique across all loaded rule sources. Use the feature's ID as one of
      its tags (e.g. tag <code class="font-mono">feat_power_attack</code>) so
      prerequisite chains can reference it.
    </p>
  </div>

  <!-- ======================================================================= -->
  <!-- CATEGORY                                                                  -->
  <!-- ======================================================================= -->
  <div class="flex flex-col gap-1.5">
    <label for={fid('category')} class="text-sm font-semibold text-text-primary">
      Category
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
        <option value={cat}>{CATEGORY_LABELS[cat]}</option>
      {/each}
    </select>
    <p class="text-[11px] text-text-muted">
      Determines which specialised sub-form sections are shown below, and how the
      DataLoader routes feature queries.
    </p>
  </div>

  <!-- ======================================================================= -->
  <!-- LABEL (EN + FR)                                                           -->
  <!-- ======================================================================= -->
  <fieldset class="flex flex-col gap-2">
    <legend class="text-sm font-semibold text-text-primary mb-1.5">
      Label <span class="text-xs font-normal text-text-muted">(display name)</span>
    </legend>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div class="flex flex-col gap-1">
        <label for={fid('label-en')} class="text-xs text-text-muted font-medium">English</label>
        <input
          id={fid('label-en')}
          type="text"
          class="input text-sm"
          value={locGet(ctx.feature.label as Record<string,string>, 'en')}
          placeholder="e.g. Power Attack"
          oninput={(e) => locSet('label', 'en', (e.currentTarget as HTMLInputElement).value)}
        />
      </div>
      <div class="flex flex-col gap-1">
        <label for={fid('label-fr')} class="text-xs text-text-muted font-medium">Français</label>
        <input
          id={fid('label-fr')}
          type="text"
          class="input text-sm"
          value={locGet(ctx.feature.label as Record<string,string>, 'fr')}
          placeholder="ex. Attaque en puissance"
          oninput={(e) => locSet('label', 'fr', (e.currentTarget as HTMLInputElement).value)}
        />
      </div>
    </div>
  </fieldset>

  <!-- ======================================================================= -->
  <!-- DESCRIPTION (EN + FR + Markdown preview toggle)                          -->
  <!-- ======================================================================= -->
  <fieldset class="flex flex-col gap-2">
    <legend class="text-sm font-semibold text-text-primary mb-1.5">
      Description
    </legend>

    <!-- English description -->
    <div class="flex flex-col gap-1">
      <div class="flex items-center justify-between">
        <label for={fid('desc-en')} class="text-xs text-text-muted font-medium">English</label>
        <button
          type="button"
          class="text-[10px] text-text-muted underline hover:text-text-primary"
          onclick={() => (previewEn = !previewEn)}
        >
          {previewEn ? 'Edit' : 'Preview'}
        </button>
      </div>

      {#if previewEn}
        <!-- Preview (plain text, white-space preserved — Markdown rendering future work) -->
        <div
          class="input min-h-[6rem] text-sm text-text-secondary whitespace-pre-wrap
                 overflow-auto bg-surface-alt"
          aria-label="English description preview"
        >
          {locGet(ctx.feature.description as Record<string,string>, 'en') || '(no description)'}
        </div>
      {:else}
        <textarea
          id={fid('desc-en')}
          class="input min-h-[6rem] text-sm resize-y font-sans"
          value={locGet(ctx.feature.description as Record<string,string>, 'en')}
          placeholder="Enter the English description. Use @-path variables (e.g. @characterLevel) for dynamic values resolved at display time."
          oninput={(e) => locSet('description', 'en', (e.currentTarget as HTMLTextAreaElement).value)}
          spellcheck="true"
        ></textarea>
      {/if}
    </div>

    <!-- French description -->
    <div class="flex flex-col gap-1">
      <div class="flex items-center justify-between">
        <label for={fid('desc-fr')} class="text-xs text-text-muted font-medium">Français</label>
        <button
          type="button"
          class="text-[10px] text-text-muted underline hover:text-text-primary"
          onclick={() => (previewFr = !previewFr)}
        >
          {previewFr ? 'Modifier' : 'Aperçu'}
        </button>
      </div>

      {#if previewFr}
        <div
          class="input min-h-[6rem] text-sm text-text-secondary whitespace-pre-wrap
                 overflow-auto bg-surface-alt"
          aria-label="French description preview"
        >
          {locGet(ctx.feature.description as Record<string,string>, 'fr') || '(pas de description)'}
        </div>
      {:else}
        <textarea
          id={fid('desc-fr')}
          class="input min-h-[6rem] text-sm resize-y font-sans"
          value={locGet(ctx.feature.description as Record<string,string>, 'fr')}
          placeholder="Entrez la description en français."
          oninput={(e) => locSet('description', 'fr', (e.currentTarget as HTMLTextAreaElement).value)}
          spellcheck="true"
        ></textarea>
      {/if}
    </div>
  </fieldset>

  <!-- ======================================================================= -->
  <!-- RULE SOURCE                                                               -->
  <!-- ======================================================================= -->
  <div class="flex flex-col gap-1.5">
    <label for={fid('ruleSource')} class="text-sm font-semibold text-text-primary">
      Rule Source
    </label>
    <input
      id={fid('ruleSource')}
      type="text"
      class="input font-mono text-sm"
      value={ctx.feature.ruleSource}
      placeholder="user_homebrew"
      oninput={(e) => { ctx.feature.ruleSource = (e.currentTarget as HTMLInputElement).value || 'user_homebrew'; }}
      autocomplete="off"
      spellcheck="false"
    />
    <p class="text-[11px] text-text-muted">
      Controls which campaigns can use this entity (via
      <code class="font-mono">CampaignSettings.enabledRuleSources</code>).
      Leave as <code class="font-mono">user_homebrew</code> for campaign-scoped
      homebrew — it is always active and never filtered out.
    </p>
  </div>

  <!-- ======================================================================= -->
  <!-- TAGS                                                                      -->
  <!-- ======================================================================= -->
  <div class="flex flex-col gap-1.5">
    <div class="flex items-center justify-between">
      <span class="text-sm font-semibold text-text-primary">Tags</span>
      <button
        type="button"
        class="btn-ghost text-xs py-0.5 px-2 h-auto"
        onclick={() => openTagPicker('tags')}
      >
        + Add Tags
      </button>
    </div>
    <p class="text-[11px] text-text-muted -mt-1">
      Convention: include this entity's own ID as a tag (e.g.
      <code class="font-mono">feat_power_attack</code>) so prerequisites can
      reference it via <code class="font-mono">has_tag</code>.
    </p>
    <div class="flex flex-wrap gap-1.5 min-h-[2rem]">
      {#if (ctx.feature.tags ?? []).length === 0}
        <span class="text-xs text-text-muted italic">No tags.</span>
      {:else}
        {#each ctx.feature.tags as tag (tag)}
          <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full
                       bg-surface border border-border text-xs font-mono text-text-primary">
            {tag}
            <button
              type="button"
              class="text-text-muted hover:text-danger transition-colors leading-none ml-0.5"
              onclick={() => removeTag('tags', tag)}
              aria-label="Remove tag {tag}"
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
        Forbidden Tags
        <span class="ml-1 text-xs font-normal text-text-muted">(optional)</span>
      </span>
      <button
        type="button"
        class="btn-ghost text-xs py-0.5 px-2 h-auto"
        onclick={() => openTagPicker('forbiddenTags')}
      >
        + Add
      </button>
    </div>
    <p class="text-[11px] text-text-muted -mt-1">
      If the character has ANY of these tags active, ALL of this entity's
      <code class="font-mono">grantedModifiers</code> are suppressed —
      the feature remains active but contributes nothing.
    </p>
    <div class="flex flex-wrap gap-1.5 min-h-[2rem]">
      {#if (ctx.feature.forbiddenTags ?? []).length === 0}
        <span class="text-xs text-text-muted italic">None.</span>
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
              aria-label="Remove forbidden tag {tag}"
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
    <legend class="text-sm font-semibold text-text-primary mb-1">Merge Strategy</legend>

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
        <span class="text-sm font-semibold text-text-primary">Replace</span>
        <span class="text-xs text-text-muted">
          This entity completely replaces any previously loaded entity with the
          same ID. All fields from the earlier version are discarded.
          <em>Default — use this for entirely new or wholly rewritten entities.</em>
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
        <span class="text-sm font-semibold text-text-primary">Partial Merge</span>
        <span class="text-xs text-text-muted">
          Fields defined in this entity are merged into the existing one:
          arrays are <em>appended</em> (prefix with <code class="font-mono">-</code>
          to remove), scalars are overwritten only when defined here.
          <em>Use this to extend SRD content — add a new tag, a new modifier, or
          adjust a single value — without duplicating the entire entry.</em>
        </span>
      </div>
    </label>
  </fieldset>

</div>
