<!--
  @file src/lib/components/combat/ActionBudgetBar.svelte
  @description Action economy budget bar for the Combat tab.
  Engine Extension F (Phase 1.3c) — actionBudget field on Feature.

  Displays the character's available actions this turn based on ALL active
  condition Features that have an `actionBudget` block.

  UI RULES (ARCHITECTURE.md section 5.6):
    • For each action category, the effective budget = MIN across all active budgets.
    • Absent key = unlimited (Infinity).
    • Buttons with budget = 0 are shown as BLOCKED (red bg, tooltip shows source conditions).
    • Buttons with budget = 1 count down when clicked.
    • Staggered/Disabled XOR: if a standard OR move action has already been spent,
      the other becomes blocked (signalled by `action_budget_xor` tag).

  The component tracks "actions spent this turn" in local $state and provides
  a "Reset Turn" button. The GM/player presses each action button to mark it spent.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { ui } from '$lib/i18n/ui-strings';
  import type { Feature } from '$lib/types/feature';
  import {
    IconActionStandard, IconActionMove, IconActionSwift,
    IconActionFullRound, IconActionFree,
    IconWarning, IconReset, IconClose,
  } from '$lib/components/ui/icons';

  const lang = $derived(engine.settings.language);

  // ── Collect all active features with an actionBudget (for display labels) ─
  // Used only for the condition-name chips shown in the header.
  // The min-wins budget computation and XOR detection have been moved to the
  // engine (phase_effectiveActionBudget / phase_actionBudgetHasXOR) to comply
  // with the zero-game-logic-in-Svelte rule (ARCHITECTURE.md §3).
  const budgetFeatures = $derived<Feature[]>(
    engine.character.activeFeatures
      .filter(afi => afi.isActive)
      .map(afi => dataLoader.getFeature(afi.featureId))
      .filter((f): f is Feature => !!f && !!f.actionBudget)
  );

  // Is there any restriction at all? If not, we hide the bar entirely.
  const hasAnyRestriction = $derived(budgetFeatures.length > 0);

  // ── Engine-computed effective budget (min-wins per ARCHITECTURE.md §5.6) ──
  // The min-wins arithmetic lives in GameEngine.phase_effectiveActionBudget.
  const effectiveBudget = $derived(engine.phase_effectiveActionBudget);
  const Inf = Infinity;

  // ── XOR check from the engine ─────────────────────────────────────────────
  const hasXOR = $derived(engine.phase_actionBudgetHasXOR);

  // ── Blocking condition names from the engine ──────────────────────────────
  // Previously computed here via filter + map; moved to the engine (CHECKPOINTS.md §2 §1).
  function blockingConditions(category: string): string {
    return engine.phase_actionBudgetBlockers[category] || '?';
  }

  // ── Spent actions this turn (local state, reset each turn) ───────────────
  // `spent` is purely a UI turn-tracking state — it is NOT game logic.
  // It does not affect the character's data or any engine computation.
  let spent = $state({ standard: 0, move: 0, swift: 0, immediate: 0, free: 0, full_round: 0 });

  function spendAction(type: keyof typeof spent) {
    spent[type] = (spent[type] ?? 0) + 1;
  }

  function resetTurn() {
    spent = { standard: 0, move: 0, swift: 0, immediate: 0, free: 0, full_round: 0 };
  }

  // XOR mutual exclusion: if one of standard/move was spent, block the other.
  // This uses local `spent` state (not engine data) — it belongs in the component.
  function isXorBlocked(type: 'standard' | 'move'): boolean {
    if (!hasXOR) return false;
    const other = type === 'standard' ? 'move' : 'standard';
    return spent[other] > 0;
  }

  function isBlocked(type: string): boolean {
    const budget = effectiveBudget[type] ?? Inf;
    if (budget === 0) return true; // Hard block from condition
    if (budget === Inf) return false; // No restriction
    if ((spent as Record<string, number>)[type] >= budget) return true; // Spent all
    if ((type === 'standard' || type === 'move') && isXorBlocked(type as 'standard' | 'move')) return true;
    return false;
  }

  function canSpend(type: string): boolean {
    return !isBlocked(type);
  }

  // The actions to display (only show categories that are restricted).
  // Icons are Lucide Svelte components — zero emoji (zero-hardcoding rule, ARCHITECTURE.md §6).
  // Stored as component references so the template can render them with <svelte:component>.
  const SHOWN_ACTIONS = [
    { key: 'standard',   labelKey: 'action.standard',   icon: IconActionStandard  },
    { key: 'move',       labelKey: 'action.move',        icon: IconActionMove      },
    { key: 'swift',      labelKey: 'action.swift',       icon: IconActionSwift     },
    { key: 'full_round', labelKey: 'action.full_round',  icon: IconActionFullRound },
    { key: 'free',       labelKey: 'action.free',        icon: IconActionFree      },
  ] as const;
</script>

{#if hasAnyRestriction}
<div class="card p-3 flex flex-col gap-2 border-amber-700/30 bg-amber-950/10">

  <!-- Header -->
  <div class="flex items-center justify-between">
    <span class="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-amber-400">
      <IconWarning size={13} aria-hidden="true" /> {ui('action.budget_title', lang)}
    </span>
    <button
      class="flex items-center gap-1 text-[10px] text-text-muted hover:text-accent px-1.5 py-0.5 rounded border border-border hover:border-accent/30 transition-colors duration-150"
      onclick={resetTurn}
      type="button"
      title={ui('action.reset_turn', lang)}
    ><IconReset size={11} aria-hidden="true" /> {ui('action.reset_turn', lang)}</button>
  </div>

  <!-- XOR note for Staggered/Disabled -->
  {#if hasXOR}
    <p class="text-[10px] text-amber-400/80 italic">{ui('action.xor_note', lang)}</p>
  {/if}

  <!-- Condition sources -->
  <div class="flex flex-wrap gap-1">
    {#each budgetFeatures as f}
      <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-700/30 text-amber-300">{engine.t(f.label)}</span>
    {/each}
  </div>

  <!-- Action buttons -->
  <div class="flex flex-wrap gap-2">
    {#each SHOWN_ACTIONS as act}
      {@const budget = effectiveBudget[act.key]}
      {#if budget !== Inf}
        {@const blocked = isBlocked(act.key)}
        {@const spentCount = spent[act.key as keyof typeof spent] ?? 0}
        {@const ActionIcon = act.icon}
        <button
          class="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors duration-150
                 {blocked
                   ? 'border-red-700/50 bg-red-950/20 text-red-400/60 cursor-not-allowed'
                   : 'border-green-700/40 bg-green-950/15 text-green-400 hover:bg-green-900/30'}"
          onclick={() => canSpend(act.key) && spendAction(act.key as keyof typeof spent)}
          disabled={blocked}
          title={blocked
            ? (budget === 0
               ? ui('action.blocked', lang).replace('{conditions}', blockingConditions(act.key))
               : ui('action.spent_with_conditions', lang)
                   .replace('{spent}', String(spent[act.key as keyof typeof spent] ?? 0))
                   .replace('{budget}', String(budget))
                   .replace('{conditions}', blockingConditions(act.key)))
            : ui('action.available', lang)}
          type="button"
          aria-label="{ui(act.labelKey, lang)} — {blocked ? ui('action.spent', lang) : ui('action.available', lang)}"
        >
          <ActionIcon size={14} aria-hidden="true" />
          <span class="leading-none">{ui(act.labelKey, lang)}</span>
          <!-- Budget counter: show X/budget or BLOCKED -->
          {#if budget > 0 && budget !== Inf}
            <span class="text-[9px] opacity-70">{spentCount}/{budget}</span>
          {:else if budget === 0}
            <IconClose size={9} class="text-red-500" aria-hidden="true" />
          {/if}
        </button>
      {/if}
    {/each}
  </div>

</div>
{/if}
