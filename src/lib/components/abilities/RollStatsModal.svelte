<!--
  @file src/lib/components/abilities/RollStatsModal.svelte
  @description Roll Stats (4d6 drop lowest) generation wizard modal.
  Phase 19.8: Migrated to use Modal.svelte + Tailwind CSS. All scoped <style> removed.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { rollAllAbilityScores } from '$lib/utils/diceEngine';
  import { formatModifier } from '$lib/utils/formatters';
  import Modal from '$lib/components/ui/Modal.svelte';
  import { IconDiceRoll, IconChecked, IconSuccess, IconTabFeats } from '$lib/components/ui/icons';

  interface Props { onclose: () => void; }
  let { onclose }: Props = $props();

  const MAIN_ABILITY_IDS = [
    'stat_str', 'stat_dex', 'stat_con',
    'stat_int', 'stat_wis', 'stat_cha',
  ] as const;

  const ABILITY_ABBRS: Record<string, string> = {
    stat_str: 'STR', stat_dex: 'DEX', stat_con: 'CON',
    stat_int: 'INT', stat_wis: 'WIS', stat_cha: 'CHA',
  };

  let rolledValues = $state<[number, number, number, number, number, number] | null>(null);
  let assignments  = $state<Record<string, number>>(
    Object.fromEntries(MAIN_ABILITY_IDS.map(id => [id, -1]))
  );

  const assignedScores = $derived.by(() => {
    const result: Record<string, number | null> = {};
    for (const id of MAIN_ABILITY_IDS) {
      const idx = assignments[id];
      result[id] = (rolledValues && idx >= 0) ? rolledValues[idx] : null;
    }
    return result;
  });

  const usedIndices = $derived(new Set(Object.values(assignments).filter(i => i >= 0)));
  const allAssigned = $derived(
    rolledValues !== null && MAIN_ABILITY_IDS.every(id => assignments[id] >= 0)
  );

  const recommendedIds = $derived.by(() => {
    for (const afi of engine.character.activeFeatures) {
      if (!afi.isActive) continue;
      const feat = dataLoader.getFeature(afi.featureId);
      if (feat?.category === 'class' && feat.recommendedAttributes?.length) return feat.recommendedAttributes as string[];
    }
    return [] as string[];
  });

  function rollAll() {
    rolledValues = rollAllAbilityScores(engine.settings.statGeneration.rerollOnes);
    for (const id of MAIN_ABILITY_IDS) assignments[id] = -1;
  }

  function assignValue(abilityId: string, rolledIndex: number) {
    for (const [otherId, idx] of Object.entries(assignments)) {
      if (idx === rolledIndex) assignments[otherId] = -1;
    }
    assignments[abilityId] = rolledIndex;
  }

  function clearAssignment(abilityId: string) { assignments[abilityId] = -1; }

  function confirmAssignments() {
    if (!allAssigned || !rolledValues) return;
    for (const id of MAIN_ABILITY_IDS) {
      const idx = assignments[id];
      if (idx >= 0 && rolledValues) engine.setAttributeBase(id, rolledValues[idx]);
    }
    onclose();
  }

  function derivedMod(score: number | null): number {
    if (score === null) return 0;
    return Math.floor((score - 10) / 2);
  }
</script>

<Modal open={true} onClose={onclose} title="Roll Stats (4d6 Drop Lowest)" size="md">
  {#snippet children()}
    <div class="flex flex-col gap-4">

      <!-- Settings chips -->
      <div class="flex items-center gap-2 flex-wrap">
        {#if engine.settings.statGeneration.rerollOnes}
          <span class="badge-green flex items-center gap-1">
            <IconSuccess size={12} aria-hidden="true" /> Reroll 1s active
          </span>
        {:else}
          <span class="badge-gray">Reroll 1s: OFF</span>
        {/if}
        <span class="text-xs text-text-muted">Method: 4d6 drop lowest × 6</span>
      </div>

      <!-- Roll button -->
      <button
        class="btn-primary w-full py-3 text-base gap-2"
        onclick={rollAll}
        type="button"
      >
        <IconDiceRoll size={18} aria-hidden="true" />
        {rolledValues ? 'Roll Again' : 'Roll!'}
      </button>

      {#if rolledValues}

        <!-- Rolled values pool -->
        <div class="flex flex-col gap-1.5">
          <span class="text-xs text-text-muted">Rolled values — click to assign to next ability:</span>
          <div class="flex flex-wrap gap-2">
            {#each rolledValues as val, index}
              {@const isUsed = usedIndices.has(index)}
              <button
                class="px-3 py-1.5 rounded-md border font-bold text-sm transition-all duration-150
                       {isUsed
                         ? 'opacity-40 cursor-default border-border text-text-muted'
                         : 'border-accent text-accent hover:bg-accent/10 cursor-pointer'}
                       flex items-center gap-1"
                onclick={() => {
                  if (!isUsed) {
                    const unassigned = MAIN_ABILITY_IDS.find(id => assignments[id] < 0);
                    if (unassigned) assignValue(unassigned, index);
                  }
                }}
                aria-label="Value {val}{isUsed ? ' (assigned)' : ''}"
                type="button"
                disabled={isUsed}
              >
                {val}
                {#if isUsed}
                  <IconChecked size={12} class="text-green-500" aria-hidden="true" />
                {/if}
              </button>
            {/each}
          </div>
        </div>

        <!-- Assignment rows -->
        <div class="flex flex-col gap-1.5">
          {#each MAIN_ABILITY_IDS as abilityId}
            {@const abbr       = ABILITY_ABBRS[abilityId]}
            {@const assignedIdx = assignments[abilityId]}
            {@const score      = assignedScores[abilityId]}
            {@const isRec      = recommendedIds.includes(abilityId)}
            {@const dMod       = derivedMod(score)}

            <div
              class="flex items-center gap-2 px-3 py-1.5 rounded border
                     {isRec ? 'border-green-500/40 bg-green-950/10 dark:bg-green-950/20' : 'border-border bg-surface-alt'}"
            >
              <span class="text-xs font-bold tracking-wider text-text-muted w-8 shrink-0">{abbr}</span>

              <select
                class="select flex-1 py-1 text-sm"
                value={assignedIdx}
                onchange={(e) => {
                  const idx = parseInt((e.target as HTMLSelectElement).value, 10);
                  if (idx >= 0) assignValue(abilityId, idx);
                  else clearAssignment(abilityId);
                }}
                aria-label="Assign a rolled value to {abbr}"
              >
                <option value="-1">— Not assigned —</option>
                {#each rolledValues as val, index}
                  {#if !usedIndices.has(index) || assignments[abilityId] === index}
                    <option value={index}>{val}</option>
                  {/if}
                {/each}
              </select>

              {#if score !== null}
                <span class="text-base font-bold text-sky-500 dark:text-sky-400 w-7 text-center shrink-0">{score}</span>
                <span class="text-sm w-9 text-center shrink-0
                  {dMod > 0 ? 'text-green-500 dark:text-green-400' : dMod < 0 ? 'text-red-500 dark:text-red-400' : 'text-text-muted'}">
                  ({formatModifier(dMod)})
                </span>
              {:else}
                <span class="text-text-muted/30 w-16 text-center shrink-0">—</span>
              {/if}

              {#if isRec}
                <span class="text-green-500 shrink-0" aria-label="Recommended">
                  <IconTabFeats size={12} />
                </span>
              {/if}
            </div>
          {/each}
        </div>

        <!-- Confirm button -->
        <div class="flex justify-end pt-2 border-t border-border">
          <button
            class="btn-primary gap-1"
            onclick={confirmAssignments}
            disabled={!allAssigned}
            type="button"
          >
            <IconChecked size={16} aria-hidden="true" /> Apply These Scores
          </button>
        </div>

      {:else}
        <p class="text-sm text-text-muted text-center italic py-2">
          Click "Roll!" to generate 6 ability scores.
        </p>
      {/if}

    </div>
  {/snippet}
</Modal>
