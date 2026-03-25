<!--
  @file src/lib/components/ui/ModifierBreakdownModal.svelte
  @description Modal dialog displaying the math breakdown for a pipeline.
  Phase 19.8: Migrated to use Modal.svelte + Tailwind CSS. All scoped <style> removed.

  Modifier type badges retain a small set of inline background/color via CSS classes
  defined here — not in app.css — because these are highly specific to modifier types
  and not reused elsewhere in the app.
-->

<script lang="ts">
  import { formatModifier, formatSituationalContext } from '$lib/utils/formatters';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import type { Modifier } from '$lib/types/pipeline';
  import Modal from '$lib/components/ui/Modal.svelte';
  import { IconStats, IconWarning } from '$lib/components/ui/icons';

  interface Props {
    label: string;
    baseValue: number;
    activeModifiers: Modifier[];
    suppressedModifiers?: Modifier[];
    situationalModifiers?: Modifier[];
    totalValue: number;
    derivedModifier?: number;
    onclose: () => void;
  }

  let {
    label,
    baseValue,
    activeModifiers,
    suppressedModifiers = [],
    situationalModifiers = [],
    totalValue,
    derivedModifier = 0,
    onclose,
  }: Props = $props();

  function modColor(value: number): string {
    if (value > 0) return 'text-green-500 dark:text-green-400';
    if (value < 0) return 'text-red-500 dark:text-red-400';
    return 'text-text-muted';
  }

  /**
   * Badge colour classes per modifier type.
   * These can't be driven purely by Tailwind class strings dynamically
   * because Tailwind purges classes not present in source — only a
   * limited set of known types need styling.
   */
  function typeBadgeClass(type: string): string {
    const map: Record<string, string> = {
      untyped:     'bg-surface-alt text-text-muted',
      racial:      'bg-green-950/40 text-green-400',
      enhancement: 'bg-purple-950/40 text-purple-400',
      morale:      'bg-yellow-950/40 text-yellow-400',
      base:        'bg-blue-950/40 text-blue-400',
      armor:       'bg-yellow-900/30 text-yellow-300',
      dodge:       'bg-cyan-950/40 text-cyan-400',
      deflection:  'bg-orange-950/40 text-orange-400',
      size:        'bg-surface-alt text-text-secondary',
      natural_armor: 'bg-green-950/30 text-green-300',
    };
    return map[type] ?? 'bg-surface-alt text-text-muted';
  }
</script>

<Modal open={true} onClose={onclose} title="{label} {ui('breakdown.title_suffix', engine.settings.language)}" size="md">
  {#snippet children()}
    <div class="flex flex-col gap-0.5">

      <!-- BASE VALUE row -->
      <div class="grid grid-cols-[1fr_auto_auto] gap-2 items-center px-2 py-1.5 rounded hover:bg-surface-alt text-sm">
        <span class="text-text-secondary truncate">{ui('breakdown.base_value', engine.settings.language)}</span>
        <span class="text-[10px] px-1.5 py-0.5 rounded bg-surface-alt text-text-muted whitespace-nowrap">—</span>
        <span class="font-semibold text-right min-w-[2.5rem] text-text-muted">{formatModifier(baseValue)}</span>
      </div>

      <!-- ACTIVE MODIFIERS -->
      {#each activeModifiers as mod}
        {@const numVal = typeof mod.value === 'number' ? mod.value : 0}
        <div class="grid grid-cols-[1fr_auto_auto] gap-2 items-center px-2 py-1.5 rounded hover:bg-surface-alt text-sm">
          <span class="text-text-primary truncate">{engine.t(mod.sourceName)}</span>
          <span class="text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap {typeBadgeClass(mod.type)}">{mod.type}</span>
          <span class="font-semibold text-right min-w-[2.5rem] flex items-center justify-end gap-1 {modColor(numVal)}">
            {formatModifier(numVal)}
            {#if mod.conditionNode}
              <span title={ui('breakdown.conditional', engine.settings.language)} aria-label={ui('breakdown.conditional', engine.settings.language)}>
                <IconWarning size={11} aria-hidden="true" />
              </span>
            {/if}
          </span>
        </div>
      {/each}

      <!-- SUPPRESSED MODIFIERS -->
      {#if suppressedModifiers.length > 0}
        <div class="flex items-center gap-2 my-1 text-[10px] uppercase tracking-wider text-text-muted">
          <div class="flex-1 h-px bg-border"></div>
          <span>{ui('breakdown.suppressed', engine.settings.language)}</span>
          <div class="flex-1 h-px bg-border"></div>
        </div>
        {#each suppressedModifiers as mod}
          {@const numVal = typeof mod.value === 'number' ? mod.value : 0}
          <div class="grid grid-cols-[1fr_auto_auto] gap-2 items-center px-2 py-1.5 rounded opacity-40 text-sm">
            <span class="text-text-secondary truncate">{engine.t(mod.sourceName)}</span>
            <span class="text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap {typeBadgeClass(mod.type)}">{mod.type}</span>
            <span class="font-semibold text-right min-w-[2.5rem] text-text-muted">{formatModifier(numVal)}</span>
          </div>
        {/each}
      {/if}

      <!-- FORMULA LINE -->
      <div class="flex items-center gap-1.5 flex-wrap pt-2 mt-1 border-t border-border text-sm">
        <span class="text-text-muted text-xs">{ui('breakdown.base', engine.settings.language)}</span>
        <span class="text-text-muted">+</span>
        <span class="text-text-muted text-xs">{ui('breakdown.modifiers', engine.settings.language)}</span>
        <span class="text-text-muted">=</span>
        <span class="text-lg font-bold text-yellow-500 dark:text-yellow-400">{totalValue}</span>
        {#if derivedModifier !== 0}
          <span class="text-xs text-text-muted ml-1">
            {ui('breakdown.derived_mod', engine.settings.language)} <strong class="{modColor(derivedModifier)}">{formatModifier(derivedModifier)}</strong>
          </span>
        {/if}
      </div>

      <!-- SITUATIONAL MODIFIERS -->
      {#if situationalModifiers.length > 0}
        <div class="flex items-center gap-2 my-1 text-[10px] uppercase tracking-wider text-accent">
          <div class="flex-1 h-px bg-border"></div>
          <span>{ui('breakdown.situational', engine.settings.language)}</span>
          <div class="flex-1 h-px bg-border"></div>
        </div>
        {#each situationalModifiers as mod}
          {@const numVal = typeof mod.value === 'number' ? mod.value : 0}
          <div class="grid grid-cols-[1fr_auto_auto] gap-2 items-center px-2 py-1.5 rounded bg-accent/5 text-sm">
            <span class="text-text-primary truncate">{engine.t(mod.sourceName)}</span>
            <span class="text-[10px] px-1.5 py-0.5 rounded border border-accent/30 text-accent bg-accent/10 whitespace-nowrap">
              {formatSituationalContext(mod.situationalContext ?? '')}
            </span>
            <span class="font-semibold text-right min-w-[2.5rem] {modColor(numVal)}">{formatModifier(numVal)}</span>
          </div>
        {/each}
      {/if}

    </div>
  {/snippet}
</Modal>
