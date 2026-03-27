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
  // All icons imported from the centralized barrel (ARCHITECTURE.md §6 — no direct lucide-svelte imports).
  // Semantic names (IconFire, IconCold, etc.) are defined in src/lib/components/ui/icons.ts
  // so that a single rename propagates everywhere automatically.
  import {
    IconResistances,
    IconFire, IconCold, IconAcid, IconElectricity, IconSonic,
    IconSpellSR, IconPowerPR, IconFortification,
  } from '$lib/components/ui/icons';

  const RESISTANCES = $derived([
    { id: 'combatStats.resist_fire',          icon: IconFire,         label: ui('combat.resistances.fire', engine.settings.language)        },
    { id: 'combatStats.resist_cold',          icon: IconCold,         label: ui('combat.resistances.cold', engine.settings.language)        },
    { id: 'combatStats.resist_acid',          icon: IconAcid,         label: ui('combat.resistances.acid', engine.settings.language)        },
    { id: 'combatStats.resist_electricity',   icon: IconElectricity,  label: ui('combat.resistances.electricity', engine.settings.language) },
    { id: 'combatStats.resist_sonic',         icon: IconSonic,        label: ui('combat.resistances.sonic', engine.settings.language)       },
    { id: 'combatStats.spell_resistance',     icon: IconSpellSR,      label: ui('combat.resistances.sr', engine.settings.language)          },
    { id: 'combatStats.power_resistance',     icon: IconPowerPR,      label: ui('combat.resistances.pr', engine.settings.language)          },
    { id: 'combatStats.fortification',        icon: IconFortification, label: ui('combat.resistances.fort', engine.settings.language)       },
    // Arcane Spell Failure — percentage chance that arcane spells in armor fail (CHECKPOINTS.md §2 §7)
    { id: 'combatStats.arcane_spell_failure', icon: IconFortification, label: ui('combat.resistances.asf', engine.settings.language)        },
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
      <!--
        engine.getPipelineDisplayValue() adds the temporary misc modifier to the
        pipeline total — arithmetic on game values must not appear in Svelte templates
        (zero-game-logic-in-Svelte rule, ARCHITECTURE.md §3). This follows the same
        pattern as engine.getDisplayAc() used in ArmorClass.svelte.
      -->
      {@const total = engine.getPipelineDisplayValue(res.id, getMisc(res.id))}

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
