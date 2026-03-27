<!--
  @file src/lib/components/abilities/PointBuyModal.svelte
  @description Point Buy stat generation wizard modal.
  Phase 19.8: Migrated to use Modal.svelte + Tailwind CSS. All scoped <style> removed.

  Uses Modal.svelte (size="md") for mobile bottom-sheet / desktop centered behaviour.
  Touch-friendly: increment/decrement buttons use min-h-[44px] on pointer:coarse.
-->

<script lang="ts">
  import { engine, GameEngine } from '$lib/engine/GameEngine.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { formatModifier, toDisplayPct } from '$lib/utils/formatters';
  import { ui } from '$lib/i18n/ui-strings';
  import Modal from '$lib/components/ui/Modal.svelte';
  import { IconTabFeats, IconChecked, IconInfo } from '$lib/components/ui/icons';
  import { MAIN_ABILITY_IDS, getAbilityAbbr } from '$lib/utils/constants';

  interface Props { onclose: () => void; }
  let { onclose }: Props = $props();

  const lang   = $derived(engine.settings.language);
  const budget = $derived(engine.settings.statGeneration.pointBuyBudget);

  // ── Point-buy bounds — read from the engine class constants (zero-game-logic rule).
  // D&D 3.5 uses 7–18 as the valid range. These are defined in the engine so that
  // .svelte files never hardcode D&D-specific numeric bounds (ARCHITECTURE.md §3, §6).
  const MIN_SCORE = GameEngine.POINT_BUY_MIN_SCORE;
  const MAX_SCORE = GameEngine.POINT_BUY_MAX_SCORE;

  // ── Working scores — clamped via engine.clampPointBuyScore() ──────────────────
  // Initialisation of workingScores previously used Math.min/Math.max with hardcoded
  // D&D bounds (7–18). Delegating to engine.clampPointBuyScore() keeps the D&D
  // arithmetic out of the Svelte component (zero-game-logic-in-Svelte, ARCHITECTURE.md §3).
  let workingScores = $state<Record<string, number>>(
    Object.fromEntries(
      MAIN_ABILITY_IDS.map(id => [
        id,
        engine.clampPointBuyScore(engine.character.attributes[id]?.baseValue ?? 8),
      ])
    )
  );

  // ── Total points spent — delegated to engine.getPointBuyTotalSpent() ──────────
  // Array.reduce() with game-cost lookups is game arithmetic forbidden in .svelte
  // files (zero-game-logic-in-Svelte rule, ARCHITECTURE.md §3). The engine computes
  // this using getPointBuyCumulativeCost() for each score.
  const pointsSpent     = $derived(engine.getPointBuyTotalSpent(workingScores));
  // Remaining budget and over-budget flag are also delegated to the engine to stay
  // consistent with the zero-game-logic-in-Svelte pattern (cf. phase4_skillPointsRemaining
  // / phase4_skillPointsBudgetExceeded for skills — ARCHITECTURE.md §3).
  const pointsRemaining = $derived(engine.getPointBuyRemaining(workingScores));
  const isOverBudget    = $derived(engine.getPointBuyBudgetExceeded(workingScores));
  const spPct           = $derived(toDisplayPct(pointsSpent, budget));
  // Pre-compute the signed display string (e.g. "+5" / "-2") in the script block
  // so that no Math function or ternary operator appears in the Svelte template
  // (zero-game-logic-in-Svelte rule, ARCHITECTURE.md §3).
  const pointsRemainingDisplay = $derived(
    pointsRemaining >= 0 ? `+${pointsRemaining}` : String(pointsRemaining)
  );

  const recommendedIds = $derived.by(() => {
    for (const afi of engine.character.activeFeatures) {
      if (!afi.isActive) continue;
      const feat = dataLoader.getFeature(afi.featureId);
      if (feat?.category === 'class' && feat.recommendedAttributes?.length) return feat.recommendedAttributes as string[];
    }
    return [] as string[];
  });

  function increaseScore(id: string) {
    const cur = workingScores[id] ?? 8;
    if (cur >= MAX_SCORE) return;
    // Marginal cost check delegated to engine (zero-game-logic rule, ARCHITECTURE.md §3).
    if (pointsRemaining < engine.getPointBuyMarginalCost(cur + 1)) return;
    workingScores[id] = cur + 1;
  }
  function decreaseScore(id: string) {
    const cur = workingScores[id] ?? 8;
    if (cur <= MIN_SCORE) return;
    workingScores[id] = cur - 1;
  }
  function resetAll() { for (const id of MAIN_ABILITY_IDS) workingScores[id] = MIN_SCORE; }
  function confirmBuy() {
    if (isOverBudget) return;
    for (const id of MAIN_ABILITY_IDS) engine.setAttributeBase(id, workingScores[id] ?? 8);
    onclose();
  }
  // derivedMod delegates to engine.previewAbilityModifier() which wraps the
  // D&D ability modifier formula floor((score-10)/2) (ARCHITECTURE.md §3:
  // mathematical game calculations must not be called from .svelte files —
  // even when imported from a utility module they violate the zero-game-logic
  // rule when invoked directly. Calling the engine method instead keeps the
  // formula inside the engine layer where game logic belongs).
  const derivedMod = (score: number) => engine.previewAbilityModifier(score);
</script>

<Modal open={true} onClose={onclose} title={ui('abilities.point_buy.title', lang)} size="md">
  {#snippet children()}
    <div class="flex flex-col gap-4">

      <!-- How it works explanation -->
      <div class="flex items-start gap-2 px-3 py-2 rounded-lg bg-surface-alt border border-border text-xs text-text-muted leading-relaxed">
        <IconInfo size={13} class="shrink-0 mt-0.5 text-accent" aria-hidden="true" />
        <span>{ui('abilities.point_buy.how_it_works', lang)}</span>
      </div>

      <!-- Budget display + progress bar -->
      <div class="flex flex-col gap-1.5">
        <div class="flex items-center gap-2 text-sm">
          <span class="text-text-muted">{ui('abilities.point_buy.budget_label', lang)}:</span>
          <span class="{isOverBudget ? 'text-red-500 dark:text-red-400' : 'text-accent'} font-bold">{pointsSpent}/{budget}</span>
          <span class="text-xs {isOverBudget ? 'text-red-500 dark:text-red-400' : 'text-green-500 dark:text-green-400'}">
            ({ui('abilities.point_buy.remaining', lang).replace('{n}', pointsRemainingDisplay)})
          </span>
        </div>
        <div
          class="progress-bar"
          style="--progress-pct: {spPct}%; --progress-color: {isOverBudget ? 'var(--color-red-600)' : 'var(--theme-accent)'};"
          role="progressbar"
          aria-valuenow={pointsSpent}
          aria-valuemin={0}
          aria-valuemax={budget}
        >
          <div class="progress-bar__fill"></div>
        </div>
      </div>

      <!-- Score rows -->
      <div class="flex flex-col gap-1.5">
        {#each MAIN_ABILITY_IDS as abilityId}
          {@const score     = workingScores[abilityId] ?? 8}
          {@const cost      = engine.getPointBuyCumulativeCost(score)}
          {@const marginal  = engine.getPointBuyMarginalCost(score + 1)}
          {@const isRec     = recommendedIds.includes(abilityId)}
          {@const abbr      = getAbilityAbbr(abilityId, lang)}
          {@const fullLabel = engine.t(engine.phase2_attributes[abilityId]?.label ?? { en: abilityId })}
          {@const dMod      = derivedMod(score)}

          <div
            class="flex items-center gap-2 px-3 py-2 rounded-md border
                   {isRec ? 'border-green-500/40 bg-green-950/10 dark:bg-green-950/20' : 'border-border bg-surface-alt'}"
          >
            <!-- Abbreviation + full name -->
            <div class="flex flex-col min-w-0 w-20 shrink-0">
              <span class="text-xs font-bold tracking-wider text-text-muted">{abbr}</span>
              <span class="text-[10px] text-text-muted/70 truncate">{fullLabel}</span>
            </div>

            <!-- Decrement -->
            <button
              class="btn-secondary min-w-[2rem] min-h-[2rem] p-0 text-lg leading-none"
              onclick={() => decreaseScore(abilityId)}
              disabled={score <= MIN_SCORE}
              aria-label="Decrease {abbr}"
              type="button"
            >−</button>

            <!-- Score value -->
            <span class="text-lg font-bold text-sky-500 dark:text-sky-400 w-7 text-center shrink-0">{score}</span>

            <!-- Modifier -->
            <span class="text-sm w-9 text-center shrink-0
              {dMod > 0 ? 'text-green-500 dark:text-green-400'
              : dMod < 0 ? 'text-red-500 dark:text-red-400'
              : 'text-text-muted'}">
              ({formatModifier(dMod)})
            </span>

            <!-- Increment -->
            <button
              class="btn-secondary min-w-[2rem] min-h-[2rem] p-0 text-lg leading-none"
              onclick={() => increaseScore(abilityId)}
              disabled={score >= MAX_SCORE || pointsRemaining < marginal}
              aria-label="Increase {abbr}"
              type="button"
            >+</button>

            <!-- Cost: x pts -->
            <span class="text-xs text-text-muted ml-auto shrink-0">
              {ui('abilities.point_buy.cost', lang)}: {cost} {ui('abilities.point_buy.pts', lang)}
            </span>

            <!-- Recommended indicator -->
            {#if isRec}
              <span class="text-green-500 shrink-0" aria-label="Recommended" title="Recommended for your class">
                <IconTabFeats size={12} />
              </span>
            {/if}
          </div>
        {/each}
      </div>

      <!-- Actions -->
      <div class="flex gap-2 justify-end pt-2 border-t border-border">
        <button class="btn-secondary" onclick={resetAll} type="button">
          {ui('abilities.point_buy.reset', lang)}
        </button>
        <button
          class="btn-primary gap-1"
          onclick={confirmBuy}
          disabled={isOverBudget}
          type="button"
        >
          <IconChecked size={16} aria-hidden="true" /> {ui('abilities.point_buy.confirm', lang)}
        </button>
      </div>

    </div>
  {/snippet}
</Modal>
