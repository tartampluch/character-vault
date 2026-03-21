<!--
  @file src/lib/components/combat/Attacks.svelte
  @description Weapons & Attacks panel for the Combat tab.
  Phase 19.9: Migrated to Tailwind CSS — all scoped <style> removed.

  Weapon selector dropdown + stat badges (ATK/DMG/Crit) + roll buttons.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { formatModifier } from '$lib/utils/formatters';
  import DiceRollModal from '$lib/components/ui/DiceRollModal.svelte';
  import type { ItemFeature } from '$lib/types/feature';
  import type { StatisticPipeline } from '$lib/types/pipeline';
  import { IconAttacks, IconDiceRoll } from '$lib/components/ui/icons';

  const UNARMED_OPTION = {
    id: '__unarmed__', name: 'Unarmed', damageDice: '1d3', critRange: '20',
    critMultiplier: 2, isRanged: false, enhancement: 0, stacks15Str: false, tags: [],
  };

  type WeaponOption = {
    id: string; name: string; damageDice: string; critRange: string;
    critMultiplier: number; isRanged: boolean; enhancement: number;
    stacks15Str: boolean; tags: string[];
  };

  function toWeaponOption(feature: ItemFeature, isActive: boolean): WeaponOption | null {
    if (!isActive || !feature.weaponData) return null;
    if (!feature.tags.some(t => t === 'weapon' || t === 'ranged')) return null;
    const enhancement = feature.grantedModifiers
      .filter(m => m.type === 'enhancement' && m.targetId.includes('bab'))
      .reduce((sum, m) => sum + (typeof m.value === 'number' ? m.value : 0), 0);
    const isRanged    = feature.tags.includes('ranged') || (feature.weaponData.rangeIncrementFt ?? 0) > 0;
    const isTwoHanded = feature.weaponData.wieldCategory === 'two_handed';
    return {
      id: feature.id, name: engine.t(feature.label),
      damageDice: feature.weaponData.damageDice, critRange: feature.weaponData.critRange,
      critMultiplier: feature.weaponData.critMultiplier,
      isRanged, enhancement, stacks15Str: isTwoHanded, tags: feature.tags,
    };
  }

  const equippedWeapons = $derived.by(() => {
    const weapons: WeaponOption[] = [UNARMED_OPTION as WeaponOption];
    for (const afi of engine.character.activeFeatures) {
      if (!afi.isActive) continue;
      const feat = dataLoader.getFeature(afi.featureId);
      if (!feat || feat.category !== 'item') continue;
      const weapon = toWeaponOption(feat as ItemFeature, true);
      if (weapon) weapons.push(weapon);
    }
    return weapons;
  });

  let mainHandId = $state('__unarmed__');
  const mainHandWeapon = $derived(equippedWeapons.find(w => w.id === mainHandId) ?? UNARMED_OPTION as WeaponOption);

  function calcAttackBonus(weapon: WeaponOption | null): number {
    if (!weapon) return 0;
    return engine.getWeaponAttackBonus(weapon.enhancement, weapon.isRanged);
  }
  function calcDamageBonus(weapon: WeaponOption | null): number {
    if (!weapon) return 0;
    return engine.getWeaponDamageBonus(weapon.enhancement, weapon.stacks15Str);
  }

  type RollTarget = 'main_attack' | 'main_damage';
  let rollTarget = $state<RollTarget | null>(null);

  function buildWeaponPipeline(attackBonus: number, damageBonus: number, isDamage: boolean): StatisticPipeline {
    return {
      id: 'synthetic_weapon_roll',
      label: { en: 'Weapon Roll' },
      baseValue: 0,
      activeModifiers: [],
      situationalModifiers: engine.phase3_combatStats['combatStats.bab']?.situationalModifiers ?? [],
      totalBonus: isDamage ? damageBonus : attackBonus,
      totalValue: isDamage ? damageBonus : attackBonus,
      derivedModifier: 0,
    };
  }

  const rollConfig = $derived.by(() => {
    if (!rollTarget) return null;
    const weapon     = mainHandWeapon;
    const isDamage   = rollTarget === 'main_damage';
    const attackBonus = calcAttackBonus(weapon);
    const damageBonus = calcDamageBonus(weapon);
    return {
      formula:  isDamage ? weapon.damageDice : '1d20',
      label:    isDamage ? `${weapon.name} Damage` : `${weapon.name} Attack`,
      pipeline: buildWeaponPipeline(attackBonus, damageBonus, isDamage),
    };
  });
</script>

<div class="card p-4 flex flex-col gap-4">

  <div class="section-header border-b border-border pb-2">
    <IconAttacks size={20} aria-hidden="true" />
    <span>Weapons & Attacks</span>
  </div>

  <!-- Main hand weapon slot -->
  <div class="flex flex-col gap-2 p-3 rounded-lg border border-border bg-surface-alt">

    <span class="text-xs text-text-muted uppercase tracking-wider">Main Hand</span>

    <select
      class="select"
      value={mainHandId}
      onchange={(e) => (mainHandId = (e.target as HTMLSelectElement).value)}
      aria-label="Main hand weapon"
    >
      {#each equippedWeapons as w}
        <option value={w.id}>{w.name}</option>
      {/each}
    </select>

    {#if mainHandWeapon}
      <!-- Stat badges -->
      <div class="flex flex-wrap gap-1.5">
        <span class="badge-yellow font-mono">
          ATK: {formatModifier(calcAttackBonus(mainHandWeapon))}
        </span>
        <span class="badge-red font-mono">
          DMG: {mainHandWeapon.damageDice}{calcDamageBonus(mainHandWeapon) !== 0 ? ' ' + formatModifier(calcDamageBonus(mainHandWeapon)) : ''}
        </span>
        <span class="badge-accent font-mono">
          Crit: {mainHandWeapon.critRange}/×{mainHandWeapon.critMultiplier}
        </span>
      </div>

      <!-- Roll buttons -->
      <div class="grid grid-cols-2 gap-2">
        <button
          class="flex items-center justify-center gap-1 rounded-md px-3 py-2 text-sm font-medium
                 bg-green-800/40 text-green-300 hover:bg-green-700/40 transition-colors duration-150"
          onclick={() => (rollTarget = 'main_attack')}
          aria-label="Roll attack"
          type="button"
        >
          <IconDiceRoll size={14} aria-hidden="true" /> Attack
        </button>
        <button
          class="flex items-center justify-center gap-1 rounded-md px-3 py-2 text-sm font-medium
                 bg-red-800/40 text-red-300 hover:bg-red-700/40 transition-colors duration-150"
          onclick={() => (rollTarget = 'main_damage')}
          aria-label="Roll damage"
          type="button"
        >
          <IconDiceRoll size={14} aria-hidden="true" /> Damage
        </button>
      </div>
    {/if}

  </div>

</div>

{#if rollTarget && rollConfig}
  <DiceRollModal
    formula={rollConfig.formula}
    pipeline={rollConfig.pipeline}
    label={rollConfig.label}
    onclose={() => (rollTarget = null)}
  />
{/if}
