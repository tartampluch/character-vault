<!--
  @file src/lib/components/combat/Attacks.svelte
  @description Weapons & Attacks panel for the Combat tab.
  Phase 19.9: Migrated to Tailwind CSS — all scoped <style> removed.

  Weapon selector dropdown + stat badges (ATK/DMG/Crit) + roll buttons.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui, buildLocalizedString } from '$lib/i18n/ui-strings';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { formatModifier } from '$lib/utils/formatters';
  import DiceRollModal from '$lib/components/ui/DiceRollModal.svelte';
  import type { ItemFeature } from '$lib/types/feature';
  import type { StatisticPipeline } from '$lib/types/pipeline';
  import { IconAttacks, IconDiceRoll } from '$lib/components/ui/icons';
  import { WEAPON_CATEGORY_TAG, RANGED_CATEGORY_TAG, TWO_HANDED_WIELD_CATEGORY, BAB_PIPELINE_ID, WEAPON_ROLL_LABEL_KEY } from '$lib/utils/constants';

  // Unarmed strike statistics come from the engine (zero-hardcoding rule, ARCHITECTURE.md §6).
  // engine.phase_unarmedStrike reads from the `item_unarmed_strike` rule feature and can be
  // overridden by class features (e.g., Monk improved unarmed strike) via the
  // `combatStats.unarmed_damage_dice` pipeline. No D&D constants appear in this component.
  const UNARMED_OPTION = $derived({
    id: '__unarmed__',
    name: ui('combat.attacks.unarmed', engine.settings.language),
    damageDice: engine.phase_unarmedStrike.damageDice,
    critRange: engine.phase_unarmedStrike.critRange,
    critMultiplier: engine.phase_unarmedStrike.critMultiplier,
    isRanged: false, enhancement: 0, stacks15Str: false, tags: [],
  });

  type WeaponOption = {
    id: string; name: string; damageDice: string; critRange: string;
    critMultiplier: number; isRanged: boolean; enhancement: number;
    stacks15Str: boolean; tags: string[];
  };

  function toWeaponOption(feature: ItemFeature, isActive: boolean): WeaponOption | null {
    if (!isActive || !feature.weaponData) return null;
    if (!feature.tags.some(t => t === WEAPON_CATEGORY_TAG || t === RANGED_CATEGORY_TAG)) return null;
    // Enhancement bonus and ranged classification delegated to the engine
    // (zero-game-logic-in-Svelte rule, ARCHITECTURE.md §3).
    // isWeaponRanged() encapsulates the D&D classification rule (ranged tag OR
    // rangeIncrementFt > 0) so this component stays free of game logic.
    const enhancement = engine.getWeaponEnhancementBonus(feature);
    const isRanged    = engine.isWeaponRanged(feature);
    const isTwoHanded = feature.weaponData.wieldCategory === TWO_HANDED_WIELD_CATEGORY;
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

  /**
   * Builds a synthetic `StatisticPipeline` used only for the `DiceRollModal`.
   *
   * WHY SYNTHETIC (not reading a real engine pipeline):
   *   Weapon attack and damage bonuses are computed by `engine.getWeaponAttackBonus()`
   *   and `engine.getWeaponDamageBonus()`, which aggregate contributions from BAB,
   *   STR/DEX modifiers, enhancement bonuses, and other active modifiers. The
   *   `DiceRollModal` accepts a `StatisticPipeline` to render the breakdown and to
   *   read situational modifiers at roll time. We therefore construct a minimal
   *   synthetic pipeline that wraps the pre-computed total and passes through the
   *   BAB situational modifiers (which may add, for example, flanking bonuses).
   *
   * CONSTANTS USED:
   *   - `BAB_PIPELINE_ID`  — pipeline key for the BAB situational mods pass-through.
   *     (ARCHITECTURE.md §6 — no magic strings in .svelte files)
    *   - `WEAPON_ROLL_LABEL_KEY` — ui-strings.ts key for the pipeline label.
    *     `buildLocalizedString(key)` reads all loaded locale files at call time
    *     so no inline translations exist in TypeScript source (ARCHITECTURE.md §6).
    *
    * @param attackBonus - The total attack bonus (from engine.getWeaponAttackBonus()).
    * @param damageBonus - The total damage bonus (from engine.getWeaponDamageBonus()).
    * @param isDamage    - `true` for a damage roll, `false` for an attack roll.
    */
   function buildWeaponPipeline(attackBonus: number, damageBonus: number, isDamage: boolean): StatisticPipeline {
     return {
       id: 'synthetic_weapon_roll',
       // buildLocalizedString builds the label from ui-strings.ts + all loaded
       // locale files — no inline EN/FR translations in .svelte files.
       label: buildLocalizedString(WEAPON_ROLL_LABEL_KEY),
      baseValue: 0,
      activeModifiers: [],
      // Pass through situational modifiers from the BAB pipeline (flanking, etc.).
      // BAB_PIPELINE_ID constant avoids a magic string literal here.
      situationalModifiers: engine.phase3_combatStats[BAB_PIPELINE_ID]?.situationalModifiers ?? [],
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
      label:    isDamage ? `${weapon.name} ${ui('combat.attacks.damage', engine.settings.language)}` : `${weapon.name} ${ui('combat.attacks.attack', engine.settings.language)}`,
      pipeline: buildWeaponPipeline(attackBonus, damageBonus, isDamage),
    };
  });
</script>

<div class="card p-4 flex flex-col gap-4">

  <div class="section-header border-b border-border pb-2">
    <IconAttacks size={20} aria-hidden="true" />
    <span>{ui('combat.attacks.title', engine.settings.language)}</span>
  </div>

  <!-- Main hand weapon slot -->
  <div class="flex flex-col gap-2 p-3 rounded-lg border border-border bg-surface-alt">

    <span class="text-xs text-text-muted uppercase tracking-wider">{ui('combat.attacks.main_hand', engine.settings.language)}</span>

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
          {ui('combat.attacks.atk', engine.settings.language)} {formatModifier(calcAttackBonus(mainHandWeapon))}
        </span>
        <span class="badge-red font-mono">
          {ui('combat.attacks.dmg', engine.settings.language)} {mainHandWeapon.damageDice}{calcDamageBonus(mainHandWeapon) !== 0 ? ' ' + formatModifier(calcDamageBonus(mainHandWeapon)) : ''}
        </span>
        <span class="badge-accent font-mono">
          {ui('combat.attacks.crit', engine.settings.language)} {mainHandWeapon.critRange}/×{mainHandWeapon.critMultiplier}
        </span>
      </div>

      <!-- Roll buttons -->
      <div class="grid grid-cols-2 gap-2">
        <button
          class="flex items-center justify-center gap-1 rounded-md px-3 py-2 text-sm font-medium
                 bg-green-800/40 text-green-300 hover:bg-green-700/40 transition-colors duration-150"
          onclick={() => (rollTarget = 'main_attack')}
          aria-label={ui('combat.attacks.roll_attack_aria', engine.settings.language)}
          type="button"
        >
          <IconDiceRoll size={14} aria-hidden="true" /> {ui('combat.attacks.attack', engine.settings.language)}
        </button>
        <button
          class="flex items-center justify-center gap-1 rounded-md px-3 py-2 text-sm font-medium
                 bg-red-800/40 text-red-300 hover:bg-red-700/40 transition-colors duration-150"
          onclick={() => (rollTarget = 'main_damage')}
          aria-label={ui('combat.attacks.roll_damage_aria', engine.settings.language)}
          type="button"
        >
          <IconDiceRoll size={14} aria-hidden="true" /> {ui('combat.attacks.damage', engine.settings.language)}
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
