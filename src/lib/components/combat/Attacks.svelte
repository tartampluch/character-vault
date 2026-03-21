<!--
  @file src/lib/components/combat/Attacks.svelte
  @description Weapons & Attacks panel for the Combat tab.

  PURPOSE:
    Allows the player to select active weapons (Main Hand, Off Hand, Ranged)
    from their equipped inventory. Dynamically calculates and displays:
      - Total Attack Bonus: BAB + STR/DEX modifier + weapon enhancement + size
      - Damage Bonus: STR modifier (×1.5 for two-handed) + enhancement
    Includes "Roll Attack" and "Roll Damage" buttons using the DiceRollModal.

  WEAPON SELECTION:
    Reads character.activeFeatures for items with `category: "item"` that are
    currently `isActive: true` (equipped). Filters further by weapon tags
    (tags that include "weapon") and the appropriate slot (main_hand, off_hand, ranged).

    Also provides a default "Unarmed" option (0 attack, 1d3 improvised damage).

  ARCHITECTURE:
    - Reads: engine.character.activeFeatures (for equipped weapon items)
    - Reads: engine.phase2_attributes (STR/DEX for attack and damage calculation)
    - Reads: engine.phase3_combatStats.bab (for total attack bonus)
    - No mutations here (weapon equipping handled in Phase 13 Inventory)

  @see ARCHITECTURE.md Phase 10.4 for the specification.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { formatModifier } from '$lib/utils/formatters';
  import DiceRollModal from '$lib/components/ui/DiceRollModal.svelte';
  import type { ItemFeature } from '$lib/types/feature';
  import type { StatisticPipeline } from '$lib/types/pipeline';
  import { IconAttacks, IconDiceRoll } from '$lib/components/ui/icons';

  // ============================================================
  // UNARMED OPTION
  // ============================================================

  const UNARMED_OPTION = {
    id: '__unarmed__',
    name: 'Unarmed',
    damageDice: '1d3',
    critRange: '20',
    critMultiplier: 2,
    isRanged: false,
    enhancement: 0,
    stacks15Str: false,
    tags: [],
  };

  // ============================================================
  // EQUIPPED WEAPONS (from active features)
  // ============================================================

  type WeaponOption = {
    id: string;
    name: string;
    damageDice: string;
    critRange: string;
    critMultiplier: number;
    isRanged: boolean;
    enhancement: number;
    stacks15Str: boolean;
    tags: string[];
  };

  /**
   * Builds a WeaponOption from an ItemFeature.
   */
  function toWeaponOption(feature: ItemFeature, isActive: boolean): WeaponOption | null {
    if (!isActive || !feature.weaponData) return null;
    if (!feature.tags.some(t => t === 'weapon' || t === 'ranged')) return null;

    // Enhancement bonus from grantedModifiers of type "enhancement" targeting attack
    const enhancement = feature.grantedModifiers
      .filter(m => m.type === 'enhancement' && m.targetId.includes('bab'))
      .reduce((sum, m) => sum + (typeof m.value === 'number' ? m.value : 0), 0);

    const isRanged = feature.tags.includes('ranged') || (feature.weaponData.rangeIncrementFt ?? 0) > 0;
    const isTwoHanded = feature.weaponData.wieldCategory === 'two_handed';

    return {
      id: feature.id,
      name: engine.t(feature.label),
      damageDice: feature.weaponData.damageDice,
      critRange: feature.weaponData.critRange,
      critMultiplier: feature.weaponData.critMultiplier,
      isRanged,
      enhancement,
      stacks15Str: isTwoHanded,
      tags: feature.tags,
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

  // ============================================================
  // SELECTIONS
  // ============================================================
  let mainHandId = $state('__unarmed__');
  let offHandId  = $state('');
  let rangedId   = $state('');

  const mainHandWeapon = $derived(equippedWeapons.find(w => w.id === mainHandId) ?? UNARMED_OPTION as WeaponOption);
  const offHandWeapon  = $derived(equippedWeapons.find(w => w.id === offHandId) ?? null);
  const rangedWeapon   = $derived(equippedWeapons.find(w => w.id === rangedId) ?? null);

  // ============================================================
  // ATTACK BONUS CALCULATION (delegated to GameEngine — no game logic in components)
  // ============================================================

  /**
   * Returns the total attack bonus for a weapon by calling the GameEngine helper.
   * The GameEngine handles all D&D 3.5 rule calculations (BAB + ability + enhancement).
   */
  function calcAttackBonus(weapon: WeaponOption | null): number {
    if (!weapon) return 0;
    return engine.getWeaponAttackBonus(weapon.enhancement, weapon.isRanged);
  }

  /**
   * Returns the total damage bonus for a weapon by calling the GameEngine helper.
   */
  function calcDamageBonus(weapon: WeaponOption | null): number {
    if (!weapon) return 0;
    return engine.getWeaponDamageBonus(weapon.enhancement, weapon.stacks15Str);
  }

  // ============================================================
  // DICE ROLL MODAL
  // ============================================================
  type RollTarget = 'main_attack' | 'main_damage' | 'off_attack' | 'off_damage' | 'range_attack' | 'range_damage';
  let rollTarget = $state<RollTarget | null>(null);

  /**
   * Builds a minimal StatisticPipeline for the dice roll modal.
   * The pipeline is synthetic — we just need totalBonus and situationalModifiers.
   */
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
    const weapon = rollTarget.startsWith('main') ? mainHandWeapon
                 : rollTarget.startsWith('off')  ? offHandWeapon
                 : rangedWeapon;
    if (!weapon) return null;
    const isDamage = rollTarget.endsWith('_damage');
    const attackBonus = calcAttackBonus(weapon);
    const damageBonus = calcDamageBonus(weapon);
    const formula = isDamage ? weapon.damageDice : '1d20';
    const label = isDamage ? `${weapon.name} Damage` : `${weapon.name} Attack`;
    const pipeline = buildWeaponPipeline(attackBonus, damageBonus, isDamage);
    return { formula, label, pipeline };
  });
</script>

<div class="attacks-panel">
   <h2 class="panel-title"><IconAttacks size={24} aria-hidden="true" /> Weapons & Attacks</h2>

  <!-- ========================================================= -->
  <!-- WEAPONS TABLE -->
  <!-- ========================================================= -->
  {#each [
    { slot: 'Main Hand', weaponId: mainHandId, setter: (id: string) => (mainHandId = id), weapon: mainHandWeapon },
  ] as row}
    <div class="weapon-slot">
      <label class="slot-label">{row.slot}</label>
      <select
        class="weapon-select"
        value={row.weaponId}
        onchange={(e) => row.setter((e.target as HTMLSelectElement).value)}
        aria-label="{row.slot} weapon"
      >
        {#each equippedWeapons as w}
          <option value={w.id}>{w.name}</option>
        {/each}
      </select>

      {#if row.weapon}
        <div class="weapon-stats">
          <span class="stat-chip attack">
            ATK: {formatModifier(calcAttackBonus(row.weapon))}
          </span>
          <span class="stat-chip damage">
            DMG: {row.weapon.damageDice}{calcDamageBonus(row.weapon) !== 0 ? ' ' + formatModifier(calcDamageBonus(row.weapon)) : ''}
          </span>
          <span class="stat-chip crit">
            Crit: {row.weapon.critRange}/×{row.weapon.critMultiplier}
          </span>
        </div>
        <div class="weapon-roll-btns">
           <button class="roll-btn attack" onclick={() => (rollTarget = 'main_attack')} aria-label="Roll attack"><IconDiceRoll size={16} aria-hidden="true" /> Attack</button>
           <button class="roll-btn damage" onclick={() => (rollTarget = 'main_damage')} aria-label="Roll damage"><IconDiceRoll size={16} aria-hidden="true" /> Damage</button>
        </div>
      {/if}
    </div>
  {/each}

</div>

{#if rollTarget && rollConfig}
  <DiceRollModal
    formula={rollConfig.formula}
    pipeline={rollConfig.pipeline}
    label={rollConfig.label}
    onclose={() => (rollTarget = null)}
  />
{/if}

<style>
  .attacks-panel {
    background: #161b22;
    border: 1px solid #21262d;
    border-radius: 10px;
    padding: 1.25rem;
    font-family: 'Segoe UI', system-ui, sans-serif;
    color: #e0e0e0;
  }

  .panel-title { margin: 0 0 1rem; font-size: 1rem; color: #c4b5fd; border-bottom: 1px solid #21262d; padding-bottom: 0.5rem; }

  .weapon-slot {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.75rem;
    background: #0d1117;
    border: 1px solid #21262d;
    border-radius: 8px;
  }

  .slot-label { font-size: 0.72rem; color: #6080a0; text-transform: uppercase; letter-spacing: 0.06em; }

  .weapon-select {
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 4px;
    color: #e0e0f0;
    padding: 0.3rem 0.5rem;
    font-size: 0.9rem;
    font-family: inherit;
    width: 100%;
  }

  .weapon-stats {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .stat-chip {
    font-size: 0.78rem;
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
    font-family: monospace;
    border: 1px solid;
  }

  .stat-chip.attack  { background: #1a1500; color: #fbbf24; border-color: #854d0e; }
  .stat-chip.damage  { background: #1a0000; color: #f87171; border-color: #7f1d1d; }
  .stat-chip.crit    { background: #1a001a; color: #c084fc; border-color: #6b21a8; }

  .weapon-roll-btns { display: flex; gap: 0.4rem; }

  .roll-btn {
    flex: 1;
    border: none;
    border-radius: 4px;
    padding: 0.3rem 0.5rem;
    font-size: 0.8rem;
    cursor: pointer;
    transition: background 0.2s;
  }

  .roll-btn.attack { background: #1e3a1a; color: #86efac; }
  .roll-btn.attack:hover { background: #1a3216; }
  .roll-btn.damage { background: #2a1a1a; color: #f87171; }
  .roll-btn.damage:hover { background: #241616; }
</style>
