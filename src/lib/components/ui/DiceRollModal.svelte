<!--
  @file src/lib/components/ui/DiceRollModal.svelte
  @description Modal dialog for rolling dice against a specific pipeline.
  Phase 19.8: Migrated to use Modal.svelte + Tailwind CSS. All scoped <style> removed.

  SPIN ANIMATION:
    The rolling die icon animation is a CSS keyframe (@keyframes spin) — kept in a
    scoped <style> block because keyframe animations cannot be expressed as Tailwind
    utility classes (there is no `animate-spin-custom` class for arbitrary durations).
    This is the only remaining scoped style, per spec rule:
    "No scoped CSS except for truly component-specific animation keyframes."
-->

<script lang="ts">
  import { parseAndRoll } from '$lib/utils/diceEngine';
  import { formatModifier } from '$lib/utils/formatters';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import type { StatisticPipeline } from '$lib/types/pipeline';
  import type { RollResult } from '$lib/utils/diceEngine';
  import Modal from '$lib/components/ui/Modal.svelte';
  import { IconDiceRoll, IconAttacks, IconDamage, IconAbilities } from '$lib/components/ui/icons';

  interface Props {
    formula: string;
    pipeline: StatisticPipeline;
    targetTags?: string[];
    label: string;
    onclose: () => void;
  }

  let { formula, pipeline, targetTags = [], label, onclose }: Props = $props();

  let lastResult       = $state<RollResult | null>(null);
  let isRolling        = $state(false);
  let customTargetTags = $state('');

  const effectiveTargetTags = $derived.by(() => {
    const custom = customTargetTags.split(',').map(t => t.trim()).filter(Boolean);
    return [...targetTags, ...custom];
  });

  async function roll() {
    isRolling  = true;
    lastResult = null;
    await new Promise(resolve => setTimeout(resolve, 150));
    lastResult = parseAndRoll(
      formula,
      pipeline,
      { targetTags: effectiveTargetTags, isAttackOfOpportunity: false },
      engine.settings
    );
    isRolling = false;
  }
</script>

<Modal open={true} onClose={onclose} size="sm">
  {#snippet children()}

    <!-- Custom header content: title + formula chip -->
    <div class="flex items-center gap-2 mb-4">
      <div class="flex items-center gap-2 flex-1 min-w-0">
        <IconDiceRoll size={18} aria-hidden="true" class="text-yellow-500 dark:text-yellow-400 shrink-0" />
        <span class="font-semibold text-text-primary truncate">{label}</span>
      </div>
      <code class="shrink-0 text-xs bg-surface-alt border border-border rounded px-2 py-0.5 text-sky-500 dark:text-sky-400 font-mono">
        {formula}
      </code>
    </div>

    <div class="flex flex-col gap-3">

      <!-- Target tags input (only when situational bonuses exist) -->
      {#if pipeline.situationalModifiers.length > 0}
        <div class="flex flex-col gap-1.5">
          <label for="target-tags-input" class="text-xs text-text-muted flex items-center gap-1 flex-wrap">
            {ui('dice.target_tags', engine.settings.language)}
            <span class="text-accent italic">
              ({pipeline.situationalModifiers.length} {ui('dice.situational_available', engine.settings.language)})
            </span>
          </label>
          <input
            id="target-tags-input"
            type="text"
            bind:value={customTargetTags}
            placeholder={ui('dice.tags_placeholder', engine.settings.language)}
            class="input text-sm"
            aria-label="Target creature tags for situational bonuses"
          />
          <div class="flex flex-wrap gap-1">
            {#each pipeline.situationalModifiers as mod}
              <button
                class="badge-accent cursor-pointer hover:bg-accent-200 dark:hover:bg-accent-800 transition-colors"
                onclick={() => {
                  const tag = mod.situationalContext ?? '';
                  if (tag && !customTargetTags.includes(tag)) {
                    customTargetTags = customTargetTags ? `${customTargetTags}, ${tag}` : tag;
                  }
                }}
                title="Add '{mod.situationalContext}' to target tags"
                aria-label="Add {mod.situationalContext} tag"
                type="button"
              >
                + {mod.situationalContext} ({formatModifier(typeof mod.value === 'number' ? mod.value : 0)})
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Roll button -->
      <button
        class="btn-primary w-full py-3 text-base gap-2"
        onclick={roll}
        disabled={isRolling}
        aria-label="Roll {formula}"
        type="button"
      >
        <IconDiceRoll size={18} aria-hidden="true" />
        {#if isRolling}{ui('dice.rolling', engine.settings.language)}{:else if lastResult}{ui('dice.roll_again', engine.settings.language)}{:else}{ui('dice.roll', engine.settings.language)}{/if}
      </button>

      <!-- Rolling animation -->
      {#if isRolling}
        <div class="flex justify-center py-3 text-yellow-500 dark:text-yellow-400 rolling-icon" aria-live="polite" aria-label="Rolling dice...">
          <IconDiceRoll size={36} aria-hidden="true" />
        </div>

      {:else if lastResult}
        <!-- Result panel -->
        <div
          class="flex flex-col gap-2 p-3 rounded-lg border
            {lastResult.isCriticalThreat
              ? 'border-yellow-500/60 bg-yellow-950/20'
              : lastResult.isAutomaticMiss
                ? 'border-red-500/60 bg-red-950/20'
                : 'border-border bg-surface-alt'}"
          aria-live="polite"
        >
          <!-- Headline badges -->
          <div class="flex items-center gap-2 flex-wrap">
            {#if lastResult.isCriticalThreat}
              <span class="badge-yellow flex items-center gap-1">
                <IconAttacks size={12} aria-hidden="true" /> {ui('dice.critical_threat', engine.settings.language)}
              </span>
            {:else if lastResult.isAutomaticMiss}
              <span class="badge-red flex items-center gap-1">
                <IconDamage size={12} aria-hidden="true" /> {ui('dice.fumble', engine.settings.language)}
              </span>
            {:else}
              <span class="badge-accent">{ui('dice.result', engine.settings.language)}</span>
            {/if}
            {#if lastResult.numberOfExplosions > 0}
              <span class="px-2 py-0.5 rounded-full text-xs font-bold bg-yellow-500 text-black flex items-center gap-1">
                <IconAbilities size={12} aria-hidden="true" /> {ui('dice.explosion', engine.settings.language)} ×{lastResult.numberOfExplosions}
              </span>
            {/if}
          </div>

          <!-- Breakdown rows -->
          <div class="flex flex-col gap-1 text-sm">
            <div class="flex justify-between">
              <span class="text-text-muted">{ui('dice.dice_rolls', engine.settings.language)}</span>
              <span class="font-mono text-sky-500 dark:text-sky-400">[{lastResult.diceRolls.join(', ')}]</span>
            </div>
            <div class="flex justify-between">
              <span class="text-text-muted">{ui('dice.natural_total', engine.settings.language)}</span>
              <span class="font-semibold text-text-primary">{lastResult.naturalTotal}</span>
            </div>
            {#if lastResult.staticBonus !== 0}
              <div class="flex justify-between">
                <span class="text-text-muted">{ui('dice.static_bonus', engine.settings.language)}</span>
                <span class="font-semibold text-accent">{formatModifier(lastResult.staticBonus)}</span>
              </div>
            {/if}
            {#if lastResult.situationalBonusApplied !== 0}
              <div class="flex justify-between bg-accent/5 rounded px-1.5">
                <span class="text-text-muted">{ui('dice.situational_bonus', engine.settings.language)}</span>
                <span class="font-semibold text-green-500 dark:text-green-400">{formatModifier(lastResult.situationalBonusApplied)}</span>
              </div>
            {/if}
          </div>

          <!-- Final total -->
          <div class="flex items-center justify-between pt-2 border-t border-border">
            <span class="text-sm text-text-secondary font-medium">{ui('dice.final_total', engine.settings.language)}</span>
            <span
              class="text-3xl font-bold leading-none
                {lastResult.isCriticalThreat ? 'text-yellow-500 dark:text-yellow-400'
                : lastResult.isAutomaticMiss ? 'text-red-500 dark:text-red-400'
                : 'text-yellow-500 dark:text-yellow-400'}"
            >
              {lastResult.finalTotal}
            </span>
          </div>

        </div>
      {/if}

      <!-- Exploding 20s indicator -->
      {#if engine.settings.diceRules.explodingTwenties}
        <p class="text-xs text-accent bg-accent/10 border border-accent/30 rounded px-2 py-1 text-center flex items-center justify-center gap-1">
          <IconAbilities size={13} aria-hidden="true" /> {ui('dice.exploding_active', engine.settings.language)}
        </p>
      {/if}

    </div>
  {/snippet}
</Modal>

<style>
  /*
   * Spinning animation for the rolling die icon.
   * Kept here because CSS keyframe animations cannot be expressed as
   * Tailwind utility classes in v4. This is the only justified scoped
   * style in this file (per Phase 19.14 spec allowance for keyframes).
   */
  .rolling-icon :global(svg) {
    animation: spin 0.4s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
</style>
