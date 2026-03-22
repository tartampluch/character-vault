/**
 * @file src/tests/psionicItems.test.ts
 * @description Vitest unit tests for ItemFeature psionic item subtypes.
 *
 * WHAT IS TESTED (Phase 1.3b — ARCHITECTURE.md section 5.1.1):
 *
 *   1. TYPE SOUNDNESS — `PsionicItemType` and `PowerStoneEntry`:
 *      - All 5 type values compile as valid `PsionicItemType` assignments.
 *      - `PowerStoneEntry` has `powerId`, `manifesterLevel`, `usedUp`.
 *      - Both exported from `feature.ts` (import succeeds).
 *
 *   2. COGNIZANCE CRYSTAL — `storedPP`, `maxPP`, `attuned`:
 *      - Valid item with correct psionic data block.
 *      - maxPP must be ODD (1,3,5,7,9,11,13,15,17 — per SRD creation table).
 *      - storedPP depletes when PP are spent.
 *      - attuned starts false; set to true after 10-minute attunement.
 *      - Can be recharged (storedPP increases back toward maxPP).
 *
 *   3. DORJE — `powerStored`, `charges`, `manifesterLevel`:
 *      - Created with 50 charges (SRD default).
 *      - Each use decrements charges by 1.
 *      - At 0 charges, dorje is exhausted.
 *      - manifesterLevel bounds: minimum power ML, max = minimum + 5.
 *
 *   4. POWER STONE — `powersImprinted: PowerStoneEntry[]`:
 *      - Created with 1–6 powers (all usedUp: false).
 *      - Powers are used independently (one flush doesn't affect others).
 *      - When ALL entries usedUp: stone is fully depleted.
 *      - Brainburn risk: user ML < entry.manifesterLevel → make ML check.
 *
 *   5. PSICROWN — `storedPP`, `maxPP`, `powersKnown[]`, `manifesterLevel`:
 *      - maxPP = 50 × manifesterLevel (per SRD rule).
 *      - powersKnown is non-empty array of power IDs.
 *      - storedPP depletes as powers are manifested from the crown.
 *
 *   6. PSIONIC TATTOO — `powerStored`, `manifesterLevel`, `activated`:
 *      - activated starts false; set to true after use.
 *      - Used tattoos no longer count toward body limit.
 *      - Only 1st–3rd level powers (enforced by ML check in UI).
 *
 *   7. NON-PSIONIC ITEMS — psionicItemData is absent (undefined).
 *
 *   8. INVARIANTS — field relationships and SRD mechanical rules.
 *
 * @see src/lib/types/feature.ts — PsionicItemType, PowerStoneEntry, ItemFeature
 * @see ARCHITECTURE.md section 5.1.1 — Psionic Item Data full reference
 * @see SRD: /srd/psionic/items/
 */

import { describe, it, expect } from 'vitest';
import type {
  ItemFeature,
  PsionicItemType,
  PowerStoneEntry,
} from '$lib/types/feature';

// =============================================================================
// HELPERS — Item factories
// =============================================================================

function baseItem(id: string): Omit<ItemFeature, 'psionicItemData'> {
  return {
    id,
    category: 'item',
    ruleSource: 'srd_psionics',
    label: { en: id },
    description: { en: `Test item: ${id}` },
    tags: ['item'],
    grantedModifiers: [],
    grantedFeatures: [],
    weightLbs: 0,
    costGp: 0,
    equipmentSlot: 'none',
  };
}

function makeCognizanceCrystal(maxPP: number, storedPP: number, attuned = false): ItemFeature {
  return {
    ...baseItem(`item_cc_${maxPP}pp`),
    costGp: maxPP * 500,
    weightLbs: 1,
    psionicItemData: {
      psionicItemType: 'cognizance_crystal',
      maxPP,
      storedPP,
      attuned,
    },
  };
}

function makeDorje(powerId: string, charges = 50, manifesterLevel = 1): ItemFeature {
  return {
    ...baseItem(`item_dorje_${powerId}`),
    equipmentSlot: 'main_hand',
    weightLbs: 0.25,
    psionicItemData: {
      psionicItemType: 'dorje',
      powerStored: powerId,
      charges,
      manifesterLevel,
    },
  };
}

function makePowerStone(entries: PowerStoneEntry[]): ItemFeature {
  const totalCost = entries.length * 125;
  return {
    ...baseItem(`item_power_stone_${entries.length}pwr`),
    weightLbs: 0.05,
    costGp: totalCost,
    psionicItemData: {
      psionicItemType: 'power_stone',
      powersImprinted: entries,
    },
  };
}

function makePsicrown(manifesterLevel: number, powersKnown: string[]): ItemFeature {
  return {
    ...baseItem(`item_psicrown_ml${manifesterLevel}`),
    equipmentSlot: 'head',
    weightLbs: 0.5,
    costGp: manifesterLevel * 1000,
    psionicItemData: {
      psionicItemType: 'psicrown',
      manifesterLevel,
      maxPP: 50 * manifesterLevel,
      storedPP: 50 * manifesterLevel,
      powersKnown,
    },
  };
}

function makeTattoo(powerId: string, manifesterLevel = 1): ItemFeature {
  return {
    ...baseItem(`item_tattoo_${powerId}`),
    equipmentSlot: 'body',
    weightLbs: 0,
    costGp: manifesterLevel * 100,
    psionicItemData: {
      psionicItemType: 'psionic_tattoo',
      powerStored: powerId,
      manifesterLevel,
      activated: false,
    },
  };
}

function makeStoneEntry(powerId: string, ml: number, used = false): PowerStoneEntry {
  return { powerId, manifesterLevel: ml, usedUp: used };
}

// =============================================================================
// SECTION 1: Type exports — PsionicItemType and PowerStoneEntry
// =============================================================================

describe('Exports from feature.ts — PsionicItemType and PowerStoneEntry', () => {
  it('PsionicItemType — all 5 values are valid assignments', () => {
    const t1: PsionicItemType = 'cognizance_crystal';
    const t2: PsionicItemType = 'dorje';
    const t3: PsionicItemType = 'power_stone';
    const t4: PsionicItemType = 'psicrown';
    const t5: PsionicItemType = 'psionic_tattoo';

    const all: PsionicItemType[] = [t1, t2, t3, t4, t5];
    expect(all).toHaveLength(5);
    expect(all).toContain('cognizance_crystal');
    expect(all).toContain('dorje');
    expect(all).toContain('power_stone');
    expect(all).toContain('psicrown');
    expect(all).toContain('psionic_tattoo');
  });

  it('PowerStoneEntry — has powerId, manifesterLevel, usedUp', () => {
    const entry: PowerStoneEntry = {
      powerId: 'power_mind_thrust',
      manifesterLevel: 3,
      usedUp: false,
    };
    expect(entry.powerId).toBe('power_mind_thrust');
    expect(entry.manifesterLevel).toBe(3);
    expect(entry.usedUp).toBe(false);
  });

  it('PowerStoneEntry.usedUp can be true', () => {
    const flushed: PowerStoneEntry = makeStoneEntry('power_charm', 5, true);
    expect(flushed.usedUp).toBe(true);
  });
});

// =============================================================================
// SECTION 2: Cognizance Crystal
// =============================================================================

describe('Cognizance Crystal — storedPP / maxPP / attuned (ARCHITECTURE.md §5.1.1)', () => {
  /**
   * SRD: maxPP is always ODD, 1–17.
   * ARCHITECTURE.md §5.1.1: "always an odd integer between 1 and 17"
   */
  it('valid crystal with maxPP=5: all fields read correctly', () => {
    const crystal = makeCognizanceCrystal(5, 5, false);
    expect(crystal.psionicItemData).toBeDefined();
    expect(crystal.psionicItemData!.psionicItemType).toBe('cognizance_crystal');
    expect(crystal.psionicItemData!.maxPP).toBe(5);
    expect(crystal.psionicItemData!.storedPP).toBe(5);
    expect(crystal.psionicItemData!.attuned).toBe(false);
  });

  it('all valid SRD maxPP values are odd: 1,3,5,7,9,11,13,15,17', () => {
    const validMaxPPs = [1, 3, 5, 7, 9, 11, 13, 15, 17];
    for (const maxPP of validMaxPPs) {
      const crystal = makeCognizanceCrystal(maxPP, maxPP);
      expect(crystal.psionicItemData!.maxPP).toBe(maxPP);
      expect(maxPP % 2).toBe(1); // All must be odd
    }
  });

  it('attunement: transitions from false to true after 10 minutes', () => {
    const crystal = makeCognizanceCrystal(7, 7, false);
    expect(crystal.psionicItemData!.attuned).toBe(false);

    // Simulate attunement: owner holds for 10 minutes
    crystal.psionicItemData!.attuned = true;
    expect(crystal.psionicItemData!.attuned).toBe(true);
  });

  it('PP depletion: storedPP decreases after spending', () => {
    const crystal = makeCognizanceCrystal(9, 9, true);
    expect(crystal.psionicItemData!.storedPP).toBe(9);

    // Spend 3 PP on a power
    crystal.psionicItemData!.storedPP! -= 3;
    expect(crystal.psionicItemData!.storedPP).toBe(6);

    // Spend remaining 6 PP
    crystal.psionicItemData!.storedPP! -= 6;
    expect(crystal.psionicItemData!.storedPP).toBe(0);
  });

  it('recharge: storedPP can be increased back toward maxPP', () => {
    const crystal = makeCognizanceCrystal(5, 2, true); // partially depleted
    // Owner spends personal PP to recharge
    crystal.psionicItemData!.storedPP! += 3;
    expect(crystal.psionicItemData!.storedPP).toBe(5); // back to max

    // Cannot exceed maxPP
    crystal.psionicItemData!.storedPP = Math.min(
      crystal.psionicItemData!.storedPP!,
      crystal.psionicItemData!.maxPP!
    );
    expect(crystal.psionicItemData!.storedPP).toBe(5);
  });

  it('fully depleted crystal: storedPP = 0, attuned still true', () => {
    // SRD: "the glow dims" when depleted, but structure remains
    const crystal = makeCognizanceCrystal(3, 0, true);
    expect(crystal.psionicItemData!.storedPP).toBe(0);
    expect(crystal.psionicItemData!.attuned).toBe(true); // still attuned
  });

  it('non-attuned crystal: storedPP exists but cannot be used yet', () => {
    const crystal = makeCognizanceCrystal(11, 11, false);
    // The `attuned: false` flag signals the UI to block drawing PP
    const canUsePP = crystal.psionicItemData!.attuned === true;
    expect(canUsePP).toBe(false);
    expect(crystal.psionicItemData!.storedPP).toBe(11); // PP is present, just inaccessible
  });
});

// =============================================================================
// SECTION 3: Dorje
// =============================================================================

describe('Dorje — powerStored / charges / manifesterLevel (ARCHITECTURE.md §5.1.1)', () => {
  /**
   * SRD: Dorje is created with 50 charges. Each charge = one use of the stored power.
   */
  it('standard dorje: 50 charges, power stored, ML 1', () => {
    const dorje = makeDorje('power_mind_thrust');
    expect(dorje.psionicItemData!.psionicItemType).toBe('dorje');
    expect(dorje.psionicItemData!.powerStored).toBe('power_mind_thrust');
    expect(dorje.psionicItemData!.charges).toBe(50);
    expect(dorje.psionicItemData!.manifesterLevel).toBe(1);
  });

  it('charge depletion: each use decrements charges by 1', () => {
    const dorje = makeDorje('power_energy_blast', 50, 3);
    expect(dorje.psionicItemData!.charges).toBe(50);

    // Use it 3 times
    for (let i = 0; i < 3; i++) {
      dorje.psionicItemData!.charges! -= 1;
    }
    expect(dorje.psionicItemData!.charges).toBe(47);
  });

  it('exhausted dorje: charges = 0 → inert', () => {
    const dorje = makeDorje('power_mind_blast', 1); // 1 charge remaining
    dorje.psionicItemData!.charges! -= 1;
    expect(dorje.psionicItemData!.charges).toBe(0);

    // An exhausted dorje cannot be used
    const isExhausted = dorje.psionicItemData!.charges === 0;
    expect(isExhausted).toBe(true);
  });

  it('higher-ML dorje: ML can be above minimum (pre-augmented at creation)', () => {
    // A power requiring ML 3, created at ML 7 (within +5 max) — pre-augmented
    const augmentedDorje = makeDorje('power_energy_bolt', 50, 7);
    expect(augmentedDorje.psionicItemData!.manifesterLevel).toBe(7);
    // ML 7 is within the allowed range of ML 3 + 5 = ML 8 max
    const minML = 3;
    const maxAllowedML = minML + 5;
    expect(augmentedDorje.psionicItemData!.manifesterLevel!).toBeLessThanOrEqual(maxAllowedML);
  });

  it('partially used dorje: tracks non-50 charge count', () => {
    const partialDorje = makeDorje('power_charm', 23, 2);
    expect(partialDorje.psionicItemData!.charges).toBe(23);
  });
});

// =============================================================================
// SECTION 4: Power Stone
// =============================================================================

describe('Power Stone — powersImprinted (ARCHITECTURE.md §5.1.1)', () => {
  /**
   * SRD: Power stone holds 1d3–1d6 powers. Each used independently.
   */
  it('single-power stone: one imprinted power, not yet used', () => {
    const stone = makePowerStone([makeStoneEntry('power_precognition', 1)]);
    expect(stone.psionicItemData!.psionicItemType).toBe('power_stone');
    expect(stone.psionicItemData!.powersImprinted).toHaveLength(1);
    expect(stone.psionicItemData!.powersImprinted![0].powerId).toBe('power_precognition');
    expect(stone.psionicItemData!.powersImprinted![0].usedUp).toBe(false);
  });

  it('multi-power stone: three independent powers', () => {
    const stone = makePowerStone([
      makeStoneEntry('power_mind_thrust', 1),
      makeStoneEntry('power_psionic_minor_creation', 3),
      makeStoneEntry('power_energy_ball', 7),
    ]);
    expect(stone.psionicItemData!.powersImprinted).toHaveLength(3);
  });

  it('using one power does NOT affect others on the same stone', () => {
    const stone = makePowerStone([
      makeStoneEntry('power_mind_thrust', 1),
      makeStoneEntry('power_charm', 3),
    ]);

    // Use (flush) the first power
    stone.psionicItemData!.powersImprinted![0].usedUp = true;

    // Second power is still intact
    expect(stone.psionicItemData!.powersImprinted![0].usedUp).toBe(true);
    expect(stone.psionicItemData!.powersImprinted![1].usedUp).toBe(false);
  });

  it('fully depleted stone: all powers usedUp', () => {
    const stone = makePowerStone([
      makeStoneEntry('power_p1', 1, true),
      makeStoneEntry('power_p2', 3, true),
    ]);

    const allUsed = stone.psionicItemData!.powersImprinted!.every(e => e.usedUp);
    expect(allUsed).toBe(true);
  });

  it('partially depleted stone: some powers still available', () => {
    const stone = makePowerStone([
      makeStoneEntry('power_p1', 1, true),  // used
      makeStoneEntry('power_p2', 3, false), // available
    ]);

    const availableCount = stone.psionicItemData!.powersImprinted!.filter(e => !e.usedUp).length;
    expect(availableCount).toBe(1);
  });

  /**
   * BRAINBURN RISK (ARCHITECTURE.md §5.1.1):
   *   If user ML < entry.manifesterLevel → level check DC = entry.manifesterLevel + 1.
   *   Failure → Brainburn: 1d6/stored power/round for 1d4 rounds.
   */
  it('Brainburn risk: detectable by comparing user ML to entry ML', () => {
    const stone = makePowerStone([
      makeStoneEntry('power_energy_ball', 13), // High-level stone
    ]);

    const userManifesterLevel = 7;
    const entryML = stone.psionicItemData!.powersImprinted![0].manifesterLevel;
    const hasBrainburnRisk = userManifesterLevel < entryML;

    expect(hasBrainburnRisk).toBe(true);
    // Brainburn DC = entry.manifesterLevel + 1 = 14
    const brainburnDC = entryML + 1;
    expect(brainburnDC).toBe(14);
  });

  it('no Brainburn risk: user ML >= entry ML', () => {
    const stone = makePowerStone([makeStoneEntry('power_mind_thrust', 5)]);
    const userML = 7;
    const entryML = stone.psionicItemData!.powersImprinted![0].manifesterLevel;
    expect(userML >= entryML).toBe(true);
  });
});

// =============================================================================
// SECTION 5: Psicrown
// =============================================================================

describe('Psicrown — storedPP / maxPP / powersKnown / manifesterLevel (ARCHITECTURE.md §5.1.1)', () => {
  /**
   * SRD: Psicrown has 50 × manifesterLevel PP when created.
   */
  it('psicrown created at ML 9: maxPP = 450, storedPP = 450', () => {
    const crown = makePsicrown(9, ['power_dominate_person', 'power_charm_person_psionic']);
    expect(crown.psionicItemData!.psionicItemType).toBe('psicrown');
    expect(crown.psionicItemData!.manifesterLevel).toBe(9);
    expect(crown.psionicItemData!.maxPP).toBe(450);   // 50 × 9
    expect(crown.psionicItemData!.storedPP).toBe(450);
  });

  it('psicrown maxPP formula: always 50 × manifesterLevel', () => {
    for (const ml of [3, 5, 7, 11, 13]) {
      const crown = makePsicrown(ml, ['power_mind_blast']);
      expect(crown.psionicItemData!.maxPP).toBe(50 * ml);
    }
  });

  it('powersKnown: list of accessible power IDs', () => {
    const crown = makePsicrown(7, [
      'power_charm_person_psionic',
      'power_read_thoughts',
      'power_modify_memory',
    ]);
    expect(crown.psionicItemData!.powersKnown).toHaveLength(3);
    expect(crown.psionicItemData!.powersKnown).toContain('power_charm_person_psionic');
  });

  it('PP spending from psicrown: storedPP depletes, not personal PP', () => {
    const crown = makePsicrown(5, ['power_energy_cone']);
    expect(crown.psionicItemData!.storedPP).toBe(250); // 50 × 5

    // Manifesting a 5-PP power from the crown (uses crown PP, not personal)
    crown.psionicItemData!.storedPP! -= 5;
    expect(crown.psionicItemData!.storedPP).toBe(245);
  });

  it('fully depleted psicrown: storedPP = 0, powers inaccessible', () => {
    const crown = makePsicrown(3, ['power_blast']);
    crown.psionicItemData!.storedPP = 0;
    expect(crown.psionicItemData!.storedPP).toBe(0);

    // Cannot manifest any more powers (UI blocks when storedPP < power cost)
    const canManifest = (crown.psionicItemData!.storedPP ?? 0) >= 3; // cost of a 3-PP power
    expect(canManifest).toBe(false);
  });
});

// =============================================================================
// SECTION 6: Psionic Tattoo
// =============================================================================

describe('Psionic Tattoo — powerStored / manifesterLevel / activated (ARCHITECTURE.md §5.1.1)', () => {
  /**
   * SRD: Psionic tattoo is single-use. Maximum 20 tattoos on one body.
   * Only 1st–3rd level powers.
   */
  it('unused tattoo: activated = false, power accessible', () => {
    const tattoo = makeTattoo('power_force_screen');
    expect(tattoo.psionicItemData!.psionicItemType).toBe('psionic_tattoo');
    expect(tattoo.psionicItemData!.powerStored).toBe('power_force_screen');
    expect(tattoo.psionicItemData!.manifesterLevel).toBe(1);
    expect(tattoo.psionicItemData!.activated).toBe(false);
  });

  it('tattoo activation: activated transitions false → true after use', () => {
    const tattoo = makeTattoo('power_inertial_armor', 1);
    expect(tattoo.psionicItemData!.activated).toBe(false);

    // Wearer activates the tattoo as a standard action
    tattoo.psionicItemData!.activated = true;
    expect(tattoo.psionicItemData!.activated).toBe(true);
  });

  it('used tattoo: no longer counts toward body limit', () => {
    const activeTattoo   = makeTattoo('power_p1');   // activated: false
    const depleted = makeTattoo('power_p2');
    depleted.psionicItemData!.activated = true;       // already used

    // Count only non-activated tattoos for body limit
    const tattoos = [activeTattoo, depleted];
    const activeCount = tattoos.filter(t => !t.psionicItemData!.activated).length;
    expect(activeCount).toBe(1); // only the unused one counts
  });

  it('20-tattoo body-limit: count of non-activated tattoos', () => {
    // Create 20 unused tattoos
    const tattoos: ItemFeature[] = Array.from({ length: 20 }, (_, i) =>
      makeTattoo(`power_p${i + 1}`)
    );

    const activeCount = tattoos.filter(t => !t.psionicItemData!.activated).length;
    expect(activeCount).toBe(20); // exactly at the limit

    // A 21st tattoo would trigger all 20 to simultaneously activate (SRD rule)
    // The UI checks activeCount before equipping:
    const wouldExceedLimit = activeCount >= 20;
    expect(wouldExceedLimit).toBe(true);
  });

  it('manifesterLevel 1 for 1st-level power, 3 for 3rd-level (max per SRD)', () => {
    const low   = makeTattoo('power_mind_thrust_1', 1);
    const high  = makeTattoo('power_energy_ball_3', 3);

    expect(low.psionicItemData!.manifesterLevel).toBe(1);
    expect(high.psionicItemData!.manifesterLevel).toBe(3);

    // SRD cap: tattoos cannot store powers above 3rd level
    expect(high.psionicItemData!.manifesterLevel!).toBeLessThanOrEqual(3);
  });
});

// =============================================================================
// SECTION 7: Non-psionic items — psionicItemData is absent
// =============================================================================

describe('Non-psionic ItemFeature — psionicItemData is undefined', () => {
  it('a standard weapon has no psionicItemData', () => {
    const sword: ItemFeature = {
      ...baseItem('item_longsword'),
      equipmentSlot: 'main_hand',
      weightLbs: 4,
      costGp: 15,
      weaponData: {
        wieldCategory: 'one_handed',
        damageDice: '1d8',
        damageType: ['slashing'],
        critRange: '19-20',
        critMultiplier: 2,
        reachFt: 5,
      },
    };
    expect(sword.psionicItemData).toBeUndefined();
  });

  it('a standard armour has no psionicItemData', () => {
    const chainShirt: ItemFeature = {
      ...baseItem('item_chain_shirt'),
      equipmentSlot: 'torso',
      weightLbs: 25,
      costGp: 100,
      armorData: {
        armorBonus: 4,
        maxDex: 4,
        armorCheckPenalty: -2,
        arcaneSpellFailure: 20,
      },
    };
    expect(chainShirt.psionicItemData).toBeUndefined();
  });

  it('a mundane goods item has no psionicItemData', () => {
    const torch: ItemFeature = {
      ...baseItem('item_torch'),
      equipmentSlot: 'main_hand',
      weightLbs: 1,
      costGp: 0.01,
    };
    expect(torch.psionicItemData).toBeUndefined();
  });
});

// =============================================================================
// SECTION 8: Invariants — field relationships and SRD rules
// =============================================================================

describe('Psionic item invariants (ARCHITECTURE.md §5.1.1)', () => {
  it('psionicItemType discriminant correctly identifies crystal', () => {
    const items: ItemFeature[] = [
      makeCognizanceCrystal(5, 5, true),
      makeDorje('power_mind_thrust'),
      makePowerStone([makeStoneEntry('power_p1', 1)]),
      makePsicrown(7, ['power_dominate']),
      makeTattoo('power_force_screen'),
    ];

    const types = items.map(i => i.psionicItemData!.psionicItemType);
    expect(types).toEqual([
      'cognizance_crystal',
      'dorje',
      'power_stone',
      'psicrown',
      'psionic_tattoo',
    ]);
  });

  it('psionic items can be filtered from a mixed inventory by psionicItemType presence', () => {
    const inventory: ItemFeature[] = [
      makeDorje('power_mind_thrust'),
      {
        ...baseItem('item_sword'),
        weightLbs: 4, costGp: 15,
        weaponData: { wieldCategory: 'one_handed', damageDice: '1d8', damageType: ['slashing'], critRange: '20', critMultiplier: 2, reachFt: 5 },
      },
      makeTattoo('power_inertial_armor'),
    ];

    const psionicItems = inventory.filter(i => i.psionicItemData !== undefined);
    expect(psionicItems).toHaveLength(2);
  });

  it('cognizance crystal: storedPP is always ≤ maxPP', () => {
    const crystal = makeCognizanceCrystal(7, 7, true);
    expect(crystal.psionicItemData!.storedPP!).toBeLessThanOrEqual(crystal.psionicItemData!.maxPP!);

    crystal.psionicItemData!.storedPP = 7;
    expect(crystal.psionicItemData!.storedPP).toBeLessThanOrEqual(crystal.psionicItemData!.maxPP!);
  });

  it('psicrown storedPP ≤ maxPP after depletion', () => {
    const crown = makePsicrown(9, ['power_dominate']);
    crown.psionicItemData!.storedPP! -= 100;
    expect(crown.psionicItemData!.storedPP!).toBeLessThanOrEqual(crown.psionicItemData!.maxPP!);
  });

  it('mutable fields change; immutable fields stay constant after creation', () => {
    const dorje = makeDorje('power_mind_thrust', 50, 1);

    const originalPower   = dorje.psionicItemData!.powerStored;
    const originalML      = dorje.psionicItemData!.manifesterLevel;
    const originalCharges = dorje.psionicItemData!.charges;

    // Mutable: charges deplete
    dorje.psionicItemData!.charges! -= 5;
    expect(dorje.psionicItemData!.charges).toBe(45); // changed

    // Immutable: power and ML never change
    expect(dorje.psionicItemData!.powerStored).toBe(originalPower);
    expect(dorje.psionicItemData!.manifesterLevel).toBe(originalML);
    // originalCharges was 50, now 45 — confirming charges mutated
    expect(dorje.psionicItemData!.charges).not.toBe(originalCharges);
  });

  it('power stone: count of remaining powers drives UI depletion indicator', () => {
    const stone = makePowerStone([
      makeStoneEntry('power_p1', 1),
      makeStoneEntry('power_p2', 2),
      makeStoneEntry('power_p3', 3),
    ]);

    let remaining = stone.psionicItemData!.powersImprinted!.filter(e => !e.usedUp).length;
    expect(remaining).toBe(3);

    stone.psionicItemData!.powersImprinted![0].usedUp = true;
    remaining = stone.psionicItemData!.powersImprinted!.filter(e => !e.usedUp).length;
    expect(remaining).toBe(2);
  });
});
