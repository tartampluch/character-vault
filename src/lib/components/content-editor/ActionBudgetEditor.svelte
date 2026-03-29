<!--
  @file src/lib/components/content-editor/ActionBudgetEditor.svelte
  @description Editor for Feature.actionBudget — per-round action restrictions.
-->

<script lang="ts">
  import { getContext } from 'svelte';
  import { EDITOR_CONTEXT_KEY, type EditorContext } from './editorContext';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';

  const ctx = getContext<EditorContext>(EDITOR_CONTEXT_KEY);
  const lang = $derived(engine.settings.language);

  type BudgetKey = 'standard' | 'move' | 'swift' | 'immediate' | 'free' | 'full_round';

  interface ActionField {
    key:      BudgetKey;
    labelKey: string;
    hintKey:  string;
  }

  const FIELDS: ActionField[] = [
    { key: 'standard',   labelKey: 'editor.action_budget.standard_label',    hintKey: 'editor.action_budget.standard_hint' },
    { key: 'move',       labelKey: 'editor.action_budget.move_label',         hintKey: 'editor.action_budget.move_hint' },
    { key: 'swift',      labelKey: 'editor.action_budget.swift_label',        hintKey: 'editor.action_budget.swift_hint' },
    { key: 'immediate',  labelKey: 'editor.action_budget.immediate_label',    hintKey: 'editor.action_budget.immediate_hint' },
    { key: 'free',       labelKey: 'editor.action_budget.free_label',         hintKey: 'editor.action_budget.free_hint' },
    { key: 'full_round', labelKey: 'editor.action_budget.full_round_label',   hintKey: 'editor.action_budget.full_round_hint' },
  ];

  interface Preset {
    labelKey:       string;
    descriptionKey: string;
    budget:         Partial<Record<BudgetKey, number>>;
  }

  const PRESETS: Preset[] = [
    {
      labelKey:       'editor.action_budget.preset_staggered_label',
      descriptionKey: 'editor.action_budget.preset_staggered_desc',
      budget:         { standard: 1, move: 1, full_round: 0 },
    },
    {
      labelKey:       'editor.action_budget.preset_nauseated_label',
      descriptionKey: 'editor.action_budget.preset_nauseated_desc',
      budget:         { standard: 0, move: 1, full_round: 0 },
    },
    {
      labelKey:       'editor.action_budget.preset_stunned_label',
      descriptionKey: 'editor.action_budget.preset_stunned_desc',
      budget:         { standard: 0, move: 0, swift: 0, immediate: 0, free: 0, full_round: 0 },
    },
    {
      labelKey:       'editor.action_budget.preset_paralyzed_label',
      descriptionKey: 'editor.action_budget.preset_paralyzed_desc',
      budget:         { standard: 0, move: 0, full_round: 0 },
    },
  ];

  function getValue(key: BudgetKey): string {
    const v = ctx.feature.actionBudget?.[key];
    return v === undefined ? '' : String(v);
  }

  function setValue(key: BudgetKey, raw: string): void {
    const trimmed = raw.trim();
    const existing = ctx.feature.actionBudget ?? {};

    if (trimmed === '') {
      const { [key]: _removed, ...rest } = existing;
      ctx.feature.actionBudget = Object.keys(rest).length > 0 ? rest : undefined;
    } else {
      const value = parseInt(trimmed);
      if (isNaN(value) || value < 0) return;
      ctx.feature.actionBudget = { ...existing, [key]: value };
    }
  }

  function applyPreset(preset: Preset): void {
    ctx.feature.actionBudget = Object.keys(preset.budget).length > 0
      ? { ...preset.budget }
      : undefined;
  }

  function clearBudget(): void {
    ctx.feature.actionBudget = undefined;
  }

  const hasAnyValue = $derived(
    ctx.feature.actionBudget !== undefined &&
    Object.keys(ctx.feature.actionBudget).length > 0
  );

  const uid = Math.random().toString(36).slice(2, 7);
  const fid = (key: string) => `ab-${uid}-${key}`;
</script>

<!-- ======================================================================= -->
<!-- MAIN RENDER                                                               -->
<!-- ======================================================================= -->
<div class="flex flex-col gap-3">

  <!-- Section header -->
  <div class="flex flex-col gap-0.5">
    <div class="flex items-center justify-between">
      <span class="text-sm font-semibold text-text-primary">{ui('editor.action_budget.section_title', lang)}</span>
      {#if hasAnyValue}
        <button
          type="button"
          class="text-[10px] text-text-muted underline hover:text-danger"
          onclick={clearBudget}
        >
          {ui('editor.action_budget.clear_all_btn', lang)}
        </button>
      {/if}
    </div>
    <span class="text-[11px] text-text-muted">
      {ui('editor.action_budget.section_hint', lang)}
    </span>
  </div>

  <!-- ── SRD PRESET BUTTONS ────────────────────────────────────────────────── -->
  <div class="flex flex-wrap gap-2 p-3 rounded-lg border border-border bg-surface-alt">
    <span class="text-[11px] font-semibold text-text-muted self-center w-full md:w-auto mr-1">
      {ui('editor.action_budget.srd_presets', lang)}
    </span>
    {#each PRESETS as preset (preset.labelKey)}
      <button
        type="button"
        class="btn-ghost text-xs py-0.5 px-3 h-auto"
        onclick={() => applyPreset(preset)}
        title={ui(preset.descriptionKey, lang)}
      >
        {ui(preset.labelKey, lang)}
      </button>
    {/each}
  </div>

  <!-- ── INPUT GRID ────────────────────────────────────────────────────────── -->
  <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
    {#each FIELDS as field (field.key)}
      {@const val = getValue(field.key)}
      <div class="flex flex-col gap-1">
        <label
          for={fid(field.key)}
          class="text-[10px] font-semibold uppercase tracking-wider
                 {val === '0'
                   ? 'text-red-400'
                   : val !== ''
                   ? 'text-text-primary'
                   : 'text-text-muted'}"
        >
          {ui(field.labelKey, lang)}
          {#if val === '0'}
            <span class="ml-1 text-[9px] normal-case font-normal text-red-400/80">{ui('editor.action_budget.blocked_label', lang)}</span>
          {:else if val !== ''}
            <span class="ml-1 text-[9px] normal-case font-normal text-text-muted">{ui('editor.action_budget.max_label', lang).replace('{n}', val)}</span>
          {/if}
        </label>
        <input
          id={fid(field.key)}
          type="number"
          class="input text-xs text-center
                 {val === '0'
                   ? 'border-red-600/50 bg-red-900/10 text-red-400'
                   : val !== ''
                   ? 'border-accent/40'
                   : ''}"
          min="0"
          value={val}
          placeholder="∞"
          oninput={(e) => setValue(field.key, (e.currentTarget as HTMLInputElement).value)}
          title="{ui(field.hintKey, lang)}. Blank = unlimited. 0 = blocked."
          aria-label="{ui(field.labelKey, lang)} action budget. {ui(field.hintKey, lang)}. Blank means unlimited, 0 means blocked."
        />
        <p class="text-[10px] text-text-muted leading-tight">
          {ui(field.hintKey, lang)}
        </p>
      </div>
    {/each}
  </div>

  <!-- ── CURRENT PRESET SUMMARY ────────────────────────────────────────────── -->
  {#if hasAnyValue}
    <div class="rounded border border-border px-3 py-2 bg-surface text-xs">
      <p class="font-semibold text-text-muted mb-1">{ui('editor.action_budget.current_budget', lang)}</p>
      <code class="font-mono text-text-secondary text-[11px] break-all">
        {JSON.stringify(ctx.feature.actionBudget ?? {}, null, 0)}
      </code>
    </div>
  {/if}

</div>
