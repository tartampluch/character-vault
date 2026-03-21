<!--
  @file src/lib/components/combat/Resistances.svelte
  @description Energy Resistances and Special Resistances panel.
  Phase 19.9: Migrated to Tailwind CSS — all scoped <style> removed.

  Grid of resistance rows: element icon | label | total value | misc input.
  Values with no resistance show "—" in muted color.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import { Flame, Snowflake, FlaskConical, Zap, Volume2, Sparkles, BrainCircuit, ShieldAlert } from 'lucide-svelte';
  import { IconResistances } from '$lib/components/ui/icons';

  const RESISTANCES = $derived([
    { id: 'combatStats.resist_fire',        icon: Flame,        label: ui('combat.resistances.fire', engine.settings.language)        },
    { id: 'combatStats.resist_cold',        icon: Snowflake,    label: ui('combat.resistances.cold', engine.settings.language)        },
    { id: 'combatStats.resist_acid',        icon: FlaskConical, label: ui('combat.resistances.acid', engine.settings.language)        },
    { id: 'combatStats.resist_electricity', icon: Zap,          label: ui('combat.resistances.electricity', engine.settings.language) },
    { id: 'combatStats.resist_sonic',       icon: Volume2,      label: ui('combat.resistances.sonic', engine.settings.language)       },
    { id: 'combatStats.spell_resistance',   icon: Sparkles,     label: ui('combat.resistances.sr', engine.settings.language)          },
    { id: 'combatStats.power_resistance',   icon: BrainCircuit, label: ui('combat.resistances.pr', engine.settings.language)          },
    { id: 'combatStats.fortification',      icon: ShieldAlert,  label: ui('combat.resistances.fort', engine.settings.language)       },
  ]);

  let miscMods = $state<Record<string, string>>({});
  function getMisc(id: string): number {
    const v = parseInt(miscMods[id] ?? '0', 10);
    return isNaN(v) ? 0 : v;
  }
</script>

<div class="card p-4 flex flex-col gap-3">

  <div class="section-header border-b border-border pb-2">
    <IconResistances size={20} aria-hidden="true" />
    <span>{ui('combat.resistances.title', engine.settings.language)}</span>
  </div>

  <div class="flex flex-col gap-1">
    {#each RESISTANCES as res}
      {@const pipeline = engine.phase3_combatStats[res.id]}
      {@const baseVal  = pipeline?.totalValue ?? 0}
      {@const misc     = getMisc(res.id)}
      {@const total    = baseVal + misc}

      <div class="grid grid-cols-[1.5rem_1fr_3rem_3.5rem] items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-alt transition-colors duration-100">

        <!-- Element icon -->
        <span class="text-text-muted" aria-hidden="true"><res.icon size={14} /></span>

        <!-- Label -->
        <span class="text-sm text-text-secondary">{res.label}</span>

        <!-- Total value -->
        <span class="text-sm font-semibold text-right {total > 0 ? 'text-green-500 dark:text-green-400' : 'text-text-muted'}">
          {total > 0 ? total : '—'}
        </span>

        <!-- Misc input -->
        <input
          type="number"
          class="input text-center text-xs px-1 py-0.5 text-yellow-500 dark:text-yellow-400"
          value={miscMods[res.id] ?? '0'}
          aria-label="{res.label} misc modifier"
          title={ui('combat.resistances.misc', engine.settings.language)}
          oninput={(e) => (miscMods[res.id] = (e.target as HTMLInputElement).value)}
        />
      </div>
    {/each}
  </div>

</div>
