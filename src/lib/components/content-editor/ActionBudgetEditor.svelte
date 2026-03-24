<!--
  @file src/lib/components/content-editor/ActionBudgetEditor.svelte
  @description Editor for Feature.actionBudget — per-round action restrictions.

  ────────────────────────────────────────────────────────────────────────────
  PURPOSE
  ────────────────────────────────────────────────────────────────────────────
  Used on Conditions (Staggered, Nauseated, Stunned, Paralyzed) and any feature
  that restricts or grants non-standard action counts.  The `actionBudget` field
  tells the Combat UI how many of each action type the character may use per
  round while this feature is active.

  SEMANTICS:
    blank / undefined  —  No restriction from this feature (unlimited).
    0                  —  Action type is completely prohibited (blocked).
    1                  —  Exactly one use per round.
    2+                 —  Unusual; e.g. a homebrew feat granting 2 swift actions.

  When the GM leaves a field blank it is stored as `undefined` on the object
  (the key is absent from the JSON), keeping the data compact.

  ────────────────────────────────────────────────────────────────────────────
  SRD PRESETS (ARCHITECTURE.md §5.6)
  ────────────────────────────────────────────────────────────────────────────
    Staggered    { standard: 1, move: 1, full_round: 0 }
                 One standard OR one move per round, not both. full_round blocked.

    Nauseated    { standard: 0, move: 1, full_round: 0 }
                 Can only take a single move action. All else blocked.

    Stunned      { standard: 0, move: 0, swift: 0, immediate: 0, free: 0, full_round: 0 }
                 Cannot take any actions.

    Paralyzed    { standard: 0, move: 0, full_round: 0 }
                 Cannot move or act; mental-only (free) actions implicitly allowed.

  ────────────────────────────────────────────────────────────────────────────
  @see src/lib/types/feature.ts  actionBudget field (lines 924–937)
  @see ARCHITECTURE.md §5.6      actionBudget full reference
-->

<script lang="ts">
  import { getContext } from 'svelte';
  import { EDITOR_CONTEXT_KEY, type EditorContext } from './editorContext';

  // ===========================================================================
  // CONTEXT
  // ===========================================================================

  const ctx = getContext<EditorContext>(EDITOR_CONTEXT_KEY);

  // ===========================================================================
  // ACTION BUDGET FIELDS
  // ===========================================================================

  type BudgetKey = 'standard' | 'move' | 'swift' | 'immediate' | 'free' | 'full_round';

  interface ActionField {
    key:   BudgetKey;
    label: string;
    hint:  string;
  }

  const FIELDS: ActionField[] = [
    { key: 'standard',   label: 'Standard',    hint: 'Attack, cast a spell, use a special ability' },
    { key: 'move',       label: 'Move',         hint: 'Move up to speed, draw weapon, stand up from prone' },
    { key: 'swift',      label: 'Swift',        hint: 'Once per turn; some class abilities' },
    { key: 'immediate',  label: 'Immediate',    hint: 'Once per round; usable outside own turn (expensive)' },
    { key: 'free',       label: 'Free',         hint: 'Drop item, speak a few words, release a held spell' },
    { key: 'full_round', label: 'Full-Round',   hint: 'Full attack, charge, run, coup de grâce, etc.' },
  ];

  // ===========================================================================
  // SRD PRESETS
  // ===========================================================================

  interface Preset {
    label:       string;
    description: string;
    budget:      Partial<Record<BudgetKey, number>>;
  }

  const PRESETS: Preset[] = [
    {
      label:       'Staggered',
      description: 'One standard OR one move per round (not both); full-round blocked.',
      budget:      { standard: 1, move: 1, full_round: 0 },
    },
    {
      label:       'Nauseated',
      description: 'Only a single move action; everything else blocked.',
      budget:      { standard: 0, move: 1, full_round: 0 },
    },
    {
      label:       'Stunned',
      description: 'Cannot take any actions of any type.',
      budget:      { standard: 0, move: 0, swift: 0, immediate: 0, free: 0, full_round: 0 },
    },
    {
      label:       'Paralyzed',
      description: 'Cannot move or act; mental-only (free) actions are implicitly allowed.',
      budget:      { standard: 0, move: 0, full_round: 0 },
    },
  ];

  // ===========================================================================
  // READ / WRITE HELPERS
  // ===========================================================================

  /**
   * Returns the current budget value for a key as a string for the input.
   * Blank string = undefined (unlimited); integer string = the value.
   */
  function getValue(key: BudgetKey): string {
    const v = ctx.feature.actionBudget?.[key];
    return v === undefined ? '' : String(v);
  }

  /**
   * Sets the budget value for `key`.  Empty string → undefined (remove key).
   * Ensures the `actionBudget` object is created if absent.
   */
  function setValue(key: BudgetKey, raw: string): void {
    const trimmed = raw.trim();
    const existing = ctx.feature.actionBudget ?? {};

    if (trimmed === '') {
      // Remove the key — absence means "no restriction"
      const { [key]: _removed, ...rest } = existing;
      // If the budget object is now completely empty, remove it too
      ctx.feature.actionBudget = Object.keys(rest).length > 0 ? rest : undefined;
    } else {
      const value = parseInt(trimmed);
      if (isNaN(value) || value < 0) return;
      ctx.feature.actionBudget = { ...existing, [key]: value };
    }
  }

  /**
   * Applies an SRD preset, replacing any existing budget values with the preset.
   * Keys that are undefined in the preset are REMOVED (not set to unlimited).
   */
  function applyPreset(preset: Preset): void {
    ctx.feature.actionBudget = Object.keys(preset.budget).length > 0
      ? { ...preset.budget }  // spread makes a plain object (not a Partial<…> reference)
      : undefined;
  }

  /**
   * Clears the entire action budget (sets to undefined, removing the field).
   */
  function clearBudget(): void {
    ctx.feature.actionBudget = undefined;
  }

  /** True when any budget key is set. */
  const hasAnyValue = $derived(
    ctx.feature.actionBudget !== undefined &&
    Object.keys(ctx.feature.actionBudget).length > 0
  );

  // Unique uid for label->input ids
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
      <span class="text-sm font-semibold text-text-primary">Action Budget</span>
      {#if hasAnyValue}
        <button
          type="button"
          class="text-[10px] text-text-muted underline hover:text-danger"
          onclick={clearBudget}
        >
          Clear all
        </button>
      {/if}
    </div>
    <span class="text-[11px] text-text-muted">
      Restricts the number of each action type per round while this feature is active.
      <strong>Leave blank</strong> for no restriction (unlimited).
      Use <strong>0</strong> to block an action type entirely.
      Primarily used on Conditions and spell effects.
    </span>
  </div>

  <!-- ── SRD PRESET BUTTONS ────────────────────────────────────────────────── -->
  <div class="flex flex-wrap gap-2 p-3 rounded-lg border border-border bg-surface-alt">
    <span class="text-[11px] font-semibold text-text-muted self-center w-full md:w-auto mr-1">
      SRD presets:
    </span>
    {#each PRESETS as preset (preset.label)}
      <button
        type="button"
        class="btn-ghost text-xs py-0.5 px-3 h-auto"
        onclick={() => applyPreset(preset)}
        title={preset.description}
      >
        {preset.label}
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
          {field.label}
          {#if val === '0'}
            <span class="ml-1 text-[9px] normal-case font-normal text-red-400/80">blocked</span>
          {:else if val !== ''}
            <span class="ml-1 text-[9px] normal-case font-normal text-text-muted">max {val}</span>
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
          title="{field.hint}. Blank = unlimited. 0 = blocked."
          aria-label="{field.label} action budget. {field.hint}. Blank means unlimited, 0 means blocked."
        />
        <p class="text-[10px] text-text-muted leading-tight">
          {field.hint}
        </p>
      </div>
    {/each}
  </div>

  <!-- ── CURRENT PRESET SUMMARY ────────────────────────────────────────────── -->
  {#if hasAnyValue}
    <div class="rounded border border-border px-3 py-2 bg-surface text-xs">
      <p class="font-semibold text-text-muted mb-1">Current budget:</p>
      <code class="font-mono text-text-secondary text-[11px] break-all">
        {JSON.stringify(ctx.feature.actionBudget ?? {}, null, 0)}
      </code>
    </div>
  {/if}

</div>
