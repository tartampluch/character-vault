<!--
  @file src/lib/components/abilities/PointBuyModal.svelte
  @description Point Buy stat generation wizard modal.
  Phase 19.8: Migrated to use Modal.svelte + Tailwind CSS. All scoped <style> removed.

  Uses Modal.svelte (size="md") for mobile bottom-sheet / desktop centered behaviour.
  Touch-friendly: increment/decrement buttons use min-h-[44px] on pointer:coarse.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { formatModifier } from '$lib/utils/formatters';
  import Modal from '$lib/components/ui/Modal.svelte';
  import { IconTabFeats, IconChecked } from '$lib/components/ui/icons';
  import { MAIN_ABILITY_IDS, ABILITY_ABBRS } from '$lib/utils/constants';

  interface Props { onclose: () => void; }
  let { onclose }: Props = $props();

  const FALLBACK_COSTS: Record<number, number> = {
    7: -4, 8: 0, 9: 1, 10: 2, 11: 3, 12: 4,
    13: 5, 14: 6, 15: 8, 16: 10, 17: 13, 18: 16,
  };
  const MIN_SCORE = 7;
  const MAX_SCORE = 18;

  const budget = $derived(engine.settings.statGeneration.pointBuyBudget);

  function getCumulativeCost(score: number): number {
    const table = dataLoader.getConfigTable('config_point_buy_costs');
    if (table?.data) {
      const row = (table.data as Array<Record<string, unknown>>).find(r => r['score'] === score);
      if (row) return typeof row['cost'] === 'number' ? row['cost'] : 0;
    }
    return FALLBACK_COSTS[score] ?? 0;
  }

  function getMarginalCost(score: number): number {
    return getCumulativeCost(score) - getCumulativeCost(score - 1);
  }

  let workingScores = $state<Record<string, number>>(
    Object.fromEntries(
      MAIN_ABILITY_IDS.map(id => [
        id,
        Math.min(MAX_SCORE, Math.max(MIN_SCORE, engine.character.attributes[id]?.baseValue ?? 8)),
      ])
    )
  );

  const pointsSpent     = $derived(MAIN_ABILITY_IDS.reduce((t, id) => t + getCumulativeCost(workingScores[id] ?? 8), 0));
  const pointsRemaining = $derived(budget - pointsSpent);
  const isOverBudget    = $derived(pointsRemaining < 0);
  const spPct           = $derived(budget > 0 ? Math.min(100, (pointsSpent / budget) * 100) : 0);

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
    if (pointsRemaining < getMarginalCost(cur + 1)) return;
    workingScores[id] = cur + 1;
  }
  function decreaseScore(id: string) {
    const cur = workingScores[id] ?? 8;
    if (cur <= MIN_SCORE) return;
    workingScores[id] = cur - 1;
  }
  function resetAll() { for (const id of MAIN_ABILITY_IDS) workingScores[id] = 8; }
  function confirmBuy() {
    if (isOverBudget) return;
    for (const id of MAIN_ABILITY_IDS) engine.setAttributeBase(id, workingScores[id] ?? 8);
    onclose();
  }
  function derivedMod(score: number) { return Math.floor((score - 10) / 2); }
</script>

<Modal open={true} onClose={onclose} title="Point Buy" size="md">
  {#snippet children()}
    <div class="flex flex-col gap-4">

      <!-- Budget display + progress bar -->
      <div class="flex flex-col gap-1.5">
        <div class="flex items-center gap-2 text-sm">
          <span class="text-text-muted">Budget:</span>
          <span class="{isOverBudget ? 'text-red-500 dark:text-red-400' : 'text-accent'} font-bold">{pointsSpent}/{budget}</span>
          <span class="text-xs {isOverBudget ? 'text-red-500 dark:text-red-400' : 'text-green-500 dark:text-green-400'}">
            ({pointsRemaining >= 0 ? '+' : ''}{pointsRemaining} remaining)
          </span>
        </div>
        <div
          class="progress-bar"
          style="--progress-pct: {spPct}%; --progress-color: {isOverBudget ? 'oklch(55% 0.20 28)' : 'var(--theme-accent)'};"
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
          {@const score = workingScores[abilityId] ?? 8}
          {@const cost  = getCumulativeCost(score)}
          {@const isRec = recommendedIds.includes(abilityId)}
          {@const abbr  = ABILITY_ABBRS[abilityId]}
          {@const dMod  = derivedMod(score)}

          <div
            class="flex items-center gap-2 px-3 py-2 rounded-md border
                   {isRec ? 'border-green-500/40 bg-green-950/10 dark:bg-green-950/20' : 'border-border bg-surface-alt'}"
          >
            <!-- Abbreviation -->
            <span class="text-xs font-bold tracking-wider text-text-muted w-8 shrink-0">{abbr}</span>

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
              disabled={score >= MAX_SCORE || pointsRemaining < getMarginalCost(score + 1)}
              aria-label="Increase {abbr}"
              type="button"
            >+</button>

            <!-- Cost -->
            <span class="text-xs text-text-muted ml-auto shrink-0">
              {cost >= 0 ? '+' : ''}{cost} pts
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
        <button class="btn-secondary" onclick={resetAll} type="button">Reset All (8s)</button>
        <button
          class="btn-primary gap-1"
          onclick={confirmBuy}
          disabled={isOverBudget}
          type="button"
        >
          <IconChecked size={16} aria-hidden="true" /> Confirm
        </button>
      </div>

    </div>
  {/snippet}
</Modal>
