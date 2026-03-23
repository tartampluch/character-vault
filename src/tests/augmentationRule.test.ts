/**
 * @file src/tests/augmentationRule.test.ts
 * @description Vitest unit tests for AugmentationRule — specifically the new
 *   `effectDescription?: LocalizedString` field added in Phase E-16.
 *
 * WHAT IS TESTED (Phase E-16a/b — ARCHITECTURE.md section 5.2.2):
 *
 *   1. BACKWARD COMPATIBILITY:
 *      - AugmentationRule without `effectDescription` still compiles and works
 *        (all existing psionic power data authored before E-16 remains valid).
 *
 *   2. MECHANICAL AUGMENTATION (grantedModifiers + effectDescription):
 *      - An augmentation with numeric pipeline effects can also carry a
 *        human-readable `effectDescription` that the CastingPanel displays.
 *      - Both `en` and `fr` keys are present.
 *
 *   3. QUALITATIVE AUGMENTATION (grantedModifiers: [] + effectDescription required):
 *      - An augmentation with zero pipeline modifiers (energy-type change, swift
 *        action upgrade, object vs creature targeting, etc.) relies solely on
 *        `effectDescription` for its UI label.
 *      - The CastingPanel must display `effectDescription` — no modifier sourceName
 *        fallback is available.
 *
 *   4. MIXED AUGMENTATION ARRAY:
 *      - A power with two augmentation entries (one mechanical, one qualitative)
 *        is a valid `MagicFeature.augmentations[]` shape.
 *
 *   5. CASTINGPANEL FALLBACK LOGIC (description-only test):
 *      - When `effectDescription` is absent, `grantedModifiers[0].sourceName`
 *        serves as the fallback label. Confirms both code paths produce a
 *        displayable string.
 *
 * WHY TYPE TESTS?
 *   `AugmentationRule` is a TypeScript interface. Correctness is enforced at
 *   compile time. These tests serve as compile-time regressions and runtime
 *   value-read confirmations.
 *
 * D20SRD CONTEXT:
 *   The D20SRD_CONVERSION.md C-15c/d specification lists `effectDescription.en/fr`
 *   as a required field on every augmentation entry. This is needed for qualitative
 *   psionic augmentation effects that have no numeric pipeline modifier — e.g.:
 *     • Energy powers: "You may change the energy type to cold, electricity, fire, or sonic."
 *     • Swift-action upgrade: "You can manifest this power as a swift action."
 *     • Object targeting: "The power can now also affect non-living objects."
 *   Without `effectDescription`, these augmentations would appear as blank entries in
 *   the CastingPanel augmentation picker UI.
 *
 * @see src/lib/types/feature.ts — AugmentationRule interface
 * @see ARCHITECTURE.md section 5.2.2 — AugmentationRule fields and CastingPanel contract
 * @see D20SRD_CONVERSION.md C-15c, C-15d — psionic powers conversion spec
 */

import { describe, it, expect } from 'vitest';
import type {
  AugmentationRule,
  MagicFeature,
} from '$lib/types/feature';
import type { LocalizedString } from '$lib/types/i18n';

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Minimal mechanical augmentation: has grantedModifiers for a damage bonus.
 * `effectDescription` is optional and omitted here to test backward compat.
 */
function makeMechanicalAugmentation(costIncrement: number, isRepeatable: boolean): AugmentationRule {
  return {
    costIncrement,
    grantedModifiers: [
      {
        id: `aug_damage_${costIncrement}`,
        sourceId: 'power_energy_missile',
        sourceName: { en: 'Energy Missile (Augmented)', fr: 'Missile d\'énergie (Augmenté)' },
        targetId: 'combatStats.power_damage_bonus',
        value: '1d6',
        type: 'untyped',
      },
    ],
    isRepeatable,
  };
}

/**
 * Qualitative augmentation: `grantedModifiers` is empty; description only.
 */
function makeQualitativeAugmentation(
  costIncrement: number,
  descEn: string,
  descFr: string,
  isRepeatable: boolean,
): AugmentationRule {
  return {
    costIncrement,
    effectDescription: { en: descEn, fr: descFr },
    grantedModifiers: [],
    isRepeatable,
  };
}

/**
 * Returns a displayable label for an augmentation entry, simulating the
 * CastingPanel fallback logic described in ARCHITECTURE.md section 5.2.2:
 *   1. Use effectDescription if present.
 *   2. Fall back to grantedModifiers[0].sourceName.
 *   3. Fall back to "Unknown augmentation" as a last resort.
 */
function getAugmentationLabel(aug: AugmentationRule, lang: 'en' | 'fr'): string {
  if (aug.effectDescription) {
    return aug.effectDescription[lang] ?? aug.effectDescription['en'] ?? 'Unknown augmentation';
  }
  if (aug.grantedModifiers.length > 0) {
    const name = aug.grantedModifiers[0].sourceName;
    if (name) {
      return (name as LocalizedString)[lang] ?? (name as LocalizedString)['en'] ?? 'Unknown augmentation';
    }
  }
  return 'Unknown augmentation';
}

// =============================================================================
// SECTION 1: Backward compatibility — effectDescription is optional
// =============================================================================

describe('AugmentationRule.effectDescription — backward compatibility', () => {
  /**
   * All augmentation data authored before E-16 has no `effectDescription`.
   * The field is optional: `AugmentationRule` without it must still compile
   * and behave identically to before.
   */
  it('AugmentationRule without effectDescription compiles and reads correctly', () => {
    const aug: AugmentationRule = {
      costIncrement: 2,
      grantedModifiers: [],
      isRepeatable: false,
    };

    // effectDescription is absent — TypeScript should NOT complain
    expect(aug.effectDescription).toBeUndefined();
    expect(aug.costIncrement).toBe(2);
    expect(aug.isRepeatable).toBe(false);
  });

  it('existing mechanical augmentation without effectDescription still works', () => {
    const aug = makeMechanicalAugmentation(2, true);
    expect(aug.effectDescription).toBeUndefined();
    expect(aug.grantedModifiers).toHaveLength(1);
    expect(aug.grantedModifiers[0].targetId).toBe('combatStats.power_damage_bonus');
  });

  it('effectDescription: undefined is an explicit valid assignment', () => {
    const aug: AugmentationRule = {
      costIncrement: 4,
      effectDescription: undefined,
      grantedModifiers: [],
      isRepeatable: false,
    };
    expect(aug.effectDescription).toBeUndefined();
  });
});

// =============================================================================
// SECTION 2: Mechanical augmentation with effectDescription
// =============================================================================

describe('AugmentationRule — mechanical augmentation with effectDescription', () => {
  /**
   * Pattern 1 from ARCHITECTURE.md section 5.2.2:
   * A numeric pipeline effect augmentation that ALSO carries `effectDescription`
   * for richer UI display.
   *
   * Real example: Energy Missile "+1d6 damage per 1 extra PP" has both a
   * damage modifier AND a description of what that means.
   */
  it('mechanical augmentation: effectDescription present alongside grantedModifiers', () => {
    const aug: AugmentationRule = {
      costIncrement: 1,
      effectDescription: {
        en: 'For every 1 additional power point you spend, this power\'s damage increases by 1d6 points.',
        fr: 'Pour chaque point de pouvoir supplémentaire dépensé, les dégâts augmentent de 1d6.',
      },
      grantedModifiers: [
        {
          id: 'aug_energy_missile_damage',
          sourceId: 'power_energy_missile',
          sourceName: { en: 'Energy Missile +1d6', fr: 'Missile d\'énergie +1d6' },
          targetId: 'combatStats.power_damage_bonus',
          value: '1d6',
          type: 'untyped',
        },
      ],
      isRepeatable: true,
    };

    expect(aug.effectDescription).toBeDefined();
    expect(aug.effectDescription!.en).toContain('1d6');
    expect(aug.effectDescription!.fr).toContain('1d6');
    expect(aug.grantedModifiers).toHaveLength(1);
    expect(aug.isRepeatable).toBe(true);
  });

  it('effectDescription carries both en and fr translations', () => {
    const desc: LocalizedString = {
      en: 'Increases damage by 1d10.',
      fr: 'Augmente les dégâts de 1d10.',
    };

    const aug: AugmentationRule = {
      costIncrement: 2,
      effectDescription: desc,
      grantedModifiers: [],
      isRepeatable: true,
    };

    expect(aug.effectDescription!.en).toBe('Increases damage by 1d10.');
    expect(aug.effectDescription!.fr).toBe('Augmente les dégâts de 1d10.');
  });
});

// =============================================================================
// SECTION 3: Qualitative augmentation (grantedModifiers: []) — effectDescription required
// =============================================================================

describe('AugmentationRule — qualitative augmentation (description-only)', () => {
  /**
   * Pattern 2 from ARCHITECTURE.md section 5.2.2:
   * Qualitative effects that change the power's nature without a numeric modifier.
   * Without `effectDescription`, these would appear as blank entries in the UI.
   *
   * Real D&D 3.5 SRD examples:
   *   - Energy powers: player chooses the energy type at manifestation (cold/elec/fire/sonic)
   *   - Psionic buff: "If you spend 4 PP, you can manifest this power as a swift action"
   *   - Targeting change: "If you spend 2 PP, the power affects objects as well as creatures"
   */
  it('qualitative augmentation: grantedModifiers empty, effectDescription present', () => {
    const aug = makeQualitativeAugmentation(
      4,
      'If you spend 4 additional power points, you can manifest this power as a swift action.',
      'Si vous dépensez 4 points de pouvoir supplémentaires, vous pouvez manifester ce pouvoir par une action rapide.',
      false,
    );

    expect(aug.grantedModifiers).toHaveLength(0);
    expect(aug.effectDescription).toBeDefined();
    expect(aug.effectDescription!.en).toContain('swift action');
    expect(aug.effectDescription!.fr).toContain('action rapide');
    expect(aug.isRepeatable).toBe(false);
  });

  it('energy type choice augmentation: qualitative shift, description conveying choice', () => {
    const aug: AugmentationRule = {
      costIncrement: 2,
      effectDescription: {
        en: 'You may choose a different energy type (cold, electricity, fire, or sonic) for this manifestation.',
        fr: 'Vous pouvez choisir un type d\'énergie différent (froid, électricité, feu ou son) pour cette manifestation.',
      },
      grantedModifiers: [],
      isRepeatable: false,
    };

    expect(aug.grantedModifiers).toHaveLength(0);
    expect(aug.effectDescription!.en).toContain('energy type');
    expect(aug.effectDescription!.fr).toContain('type d\'énergie');
    expect(aug.costIncrement).toBe(2);
  });

  it('object-targeting augmentation: qualitative, non-repeatable', () => {
    const aug: AugmentationRule = {
      costIncrement: 4,
      effectDescription: {
        en: 'The power can now target non-living objects in addition to creatures.',
        fr: 'Le pouvoir peut désormais cibler des objets non vivants en plus des créatures.',
      },
      grantedModifiers: [],
      isRepeatable: false,
    };

    expect(aug.grantedModifiers).toHaveLength(0);
    expect(aug.effectDescription!.en).toContain('non-living objects');
    expect(aug.isRepeatable).toBe(false);
  });
});

// =============================================================================
// SECTION 4: Mixed augmentation array (mechanical + qualitative)
// =============================================================================

describe('MagicFeature.augmentations — mixed mechanical and qualitative entries', () => {
  /**
   * Real psionic powers in D&D 3.5 SRD often have both types:
   *   - Energy Missile (Level 2): +1d6 damage per PP (mechanical) + change energy type (qualitative)
   *   - Body Adjustment (Level 2): +2d6 heal per 3 PP (mechanical) + heal ability damage (qualitative)
   * Both patterns must be expressible in the same `augmentations[]` array.
   */

  it('power with two augmentation entries: one mechanical, one qualitative', () => {
    const mechanicalAug: AugmentationRule = {
      costIncrement: 1,
      effectDescription: {
        en: 'For every 1 additional power point, deal 1d6 more damage.',
        fr: 'Pour chaque point de pouvoir supplémentaire, infligez 1d6 de dégâts supplémentaires.',
      },
      grantedModifiers: [
        {
          id: 'aug_em_damage',
          sourceId: 'power_energy_missile',
          sourceName: { en: 'Energy Missile +1d6' },
          targetId: 'combatStats.power_damage_bonus',
          value: '1d6',
          type: 'untyped',
        },
      ],
      isRepeatable: true,
    };

    const qualitativeAug: AugmentationRule = {
      costIncrement: 2,
      effectDescription: {
        en: 'If you spend 2 additional power points, you can manifest one additional missile (maximum of 5 missiles total).',
        fr: 'Si vous dépensez 2 points de pouvoir supplémentaires, vous pouvez manifester un missile supplémentaire (maximum 5 missiles au total).',
      },
      grantedModifiers: [
        {
          // Even "additional missile" can have a modifier if the CastingPanel tracks missile count:
          id: 'aug_em_extra_missile',
          sourceId: 'power_energy_missile',
          sourceName: { en: 'Energy Missile (Extra Missile)' },
          targetId: 'combatStats.power_extra_missiles',
          value: 1,
          type: 'untyped',
        },
      ],
      isRepeatable: true,
    };

    const powerAugmentations = [mechanicalAug, qualitativeAug];

    expect(powerAugmentations).toHaveLength(2);
    expect(powerAugmentations[0].grantedModifiers[0].targetId).toBe('combatStats.power_damage_bonus');
    expect(powerAugmentations[1].grantedModifiers[0].targetId).toBe('combatStats.power_extra_missiles');

    // Both have effectDescription
    expect(powerAugmentations[0].effectDescription!.en).toContain('1d6');
    expect(powerAugmentations[1].effectDescription!.en).toContain('additional missile');
  });

  it('power with three entries: damage (repeatable), target count (repeatable), qualitative (once)', () => {
    const augmentations: AugmentationRule[] = [
      {
        costIncrement: 2,
        effectDescription: { en: '+1d10 damage', fr: '+1d10 dégâts' },
        grantedModifiers: [{
          id: 'aug1', sourceId: 'p1', sourceName: { en: 'A' },
          targetId: 'combatStats.power_damage_bonus', value: '1d10', type: 'untyped',
        }],
        isRepeatable: true,
      },
      {
        costIncrement: 4,
        effectDescription: { en: 'Affect one additional target', fr: 'Affecte une cible supplémentaire' },
        grantedModifiers: [],
        isRepeatable: true,
      },
      {
        costIncrement: 8,
        effectDescription: { en: 'Become a psi-like ability for 1 hour', fr: 'Devient une capacité analogue à la psionique pendant 1 heure' },
        grantedModifiers: [],
        isRepeatable: false,
      },
    ];

    expect(augmentations[0].isRepeatable).toBe(true);
    expect(augmentations[1].grantedModifiers).toHaveLength(0);
    expect(augmentations[1].isRepeatable).toBe(true);
    expect(augmentations[2].grantedModifiers).toHaveLength(0);
    expect(augmentations[2].isRepeatable).toBe(false);
    expect(augmentations[2].effectDescription!.en).toContain('psi-like');
  });
});

// =============================================================================
// SECTION 5: CastingPanel fallback logic
// =============================================================================

describe('CastingPanel display resolution — effectDescription vs sourceName fallback', () => {
  /**
   * ARCHITECTURE.md section 5.2.2, CastingPanel UI Contract step 1:
   *   "Display `effectDescription` (if present) as the augmentation's label/tooltip.
   *    If absent, fall back to the first `grantedModifiers[0].sourceName`."
   *
   * We test the helper function `getAugmentationLabel()` which simulates this logic.
   */

  it('effectDescription present: use it as the label (ignoring modifier sourceName)', () => {
    const aug: AugmentationRule = {
      costIncrement: 2,
      effectDescription: {
        en: 'Preferred description from effectDescription',
        fr: 'Description préférée depuis effectDescription',
      },
      grantedModifiers: [
        {
          id: 'aug1', sourceId: 'p1',
          sourceName: { en: 'Modifier sourceName (fallback)', fr: '' },
          targetId: 'combatStats.foo', value: 1, type: 'untyped',
        },
      ],
      isRepeatable: true,
    };

    const label = getAugmentationLabel(aug, 'en');
    expect(label).toBe('Preferred description from effectDescription');
  });

  it('effectDescription absent: fall back to grantedModifiers[0].sourceName', () => {
    const aug: AugmentationRule = makeMechanicalAugmentation(2, true);
    // No effectDescription — should fall back
    expect(aug.effectDescription).toBeUndefined();

    const label = getAugmentationLabel(aug, 'en');
    expect(label).toBe('Energy Missile (Augmented)');
  });

  it('french locale: effectDescription returns fr text', () => {
    const aug: AugmentationRule = {
      costIncrement: 4,
      effectDescription: {
        en: 'Swift action upgrade',
        fr: 'Améliorationaction rapide',
      },
      grantedModifiers: [],
      isRepeatable: false,
    };

    expect(getAugmentationLabel(aug, 'fr')).toBe('Améliorationaction rapide');
    expect(getAugmentationLabel(aug, 'en')).toBe('Swift action upgrade');
  });

  it('french locale: fallback to grantedModifiers[0].sourceName fr', () => {
    const aug: AugmentationRule = {
      costIncrement: 1,
      grantedModifiers: [
        {
          id: 'aug_fr', sourceId: 'p1',
          sourceName: { en: 'English name', fr: 'Nom français' },
          targetId: 'combatStats.power_damage_bonus', value: '1d6', type: 'untyped',
        },
      ],
      isRepeatable: true,
    };

    expect(getAugmentationLabel(aug, 'fr')).toBe('Nom français');
    expect(getAugmentationLabel(aug, 'en')).toBe('English name');
  });

  it('both absent: returns fallback string "Unknown augmentation"', () => {
    // This is a degenerate case — content authors should not create this.
    // We test that the UI does not crash.
    const aug: AugmentationRule = {
      costIncrement: 2,
      grantedModifiers: [],
      isRepeatable: false,
    };

    const label = getAugmentationLabel(aug, 'en');
    expect(label).toBe('Unknown augmentation');
  });
});

// =============================================================================
// SECTION 6: Full MagicFeature integration — augmentations with effectDescription
// =============================================================================

describe('MagicFeature — full psionic power with effectDescription augmentations', () => {
  /**
   * Integrates the AugmentationRule changes into a complete MagicFeature,
   * ensuring the feature compiles correctly in context.
   *
   * This mirrors a real D20SRD psionic power (Energy Missile, Level 2).
   */
  it('complete psionic power with effectDescription augmentations compiles correctly', () => {
    const energyMissile: MagicFeature = {
      id: 'power_energy_missile',
      category: 'magic',
      ruleSource: 'srd_psionics',
      magicType: 'psionic',
      label: { en: 'Energy Missile', fr: 'Missile d\'énergie' },
      description: {
        en: 'You release a powerful missile of energy dealing 3d6 damage. Augmentable.',
        fr: 'Vous libérez un missile d\'énergie puissant infligeant 3d6 dégâts. Augmentable.',
      },
      tags: ['magic', 'power', 'psionic', 'psychokinesis'],
      school: 'psychokinesis',
      discipline: 'psychokinesis',
      displays: ['auditory', 'visual'],
      spellLists: { list_psion_kineticist: 2, list_wilder: 2 },
      descriptors: ['fire'],
      resistanceType: 'power_resistance',
      components: ['V', 'S'],
      range: 'medium',
      targetArea: { en: 'Up to five creatures', fr: 'Jusqu\'à cinq créatures' },
      duration: 'instantaneous',
      savingThrow: 'ref_half',
      grantedModifiers: [],
      grantedFeatures: [],
      augmentations: [
        {
          costIncrement: 1,
          effectDescription: {
            en: 'For every 1 additional power point you spend, this power\'s damage increases by 1 die (d6) of the same energy type.',
            fr: 'Pour chaque point de pouvoir supplémentaire dépensé, les dégâts de ce pouvoir augmentent d\'un dé (d6) du même type d\'énergie.',
          },
          grantedModifiers: [
            {
              id: 'aug_energy_missile_damage',
              sourceId: 'power_energy_missile',
              sourceName: { en: 'Energy Missile +1d6', fr: 'Missile d\'énergie +1d6' },
              targetId: 'combatStats.power_damage_bonus',
              value: '1d6',
              type: 'untyped',
            },
          ],
          isRepeatable: true,
        },
        {
          costIncrement: 2,
          effectDescription: {
            en: 'If you spend 2 additional power points, you can manifest one additional missile targeting the same or a different creature (maximum of 5 missiles from one manifestation).',
            fr: 'Si vous dépensez 2 points de pouvoir supplémentaires, vous pouvez manifester un missile supplémentaire ciblant la même créature ou une créature différente (maximum de 5 missiles par manifestation).',
          },
          grantedModifiers: [
            {
              id: 'aug_energy_missile_extra',
              sourceId: 'power_energy_missile',
              sourceName: { en: 'Energy Missile (Extra Missile)', fr: 'Missile d\'énergie (Missile supplémentaire)' },
              targetId: 'combatStats.power_extra_missiles',
              value: 1,
              type: 'untyped',
            },
          ],
          isRepeatable: true,
        },
      ],
    };

    // Basic structure checks
    expect(energyMissile.augmentations).toHaveLength(2);
    expect(energyMissile.discipline).toBe('psychokinesis');
    expect(energyMissile.displays).toContain('auditory');
    expect(energyMissile.displays).toContain('visual');

    // effectDescription on both augmentations
    expect(energyMissile.augmentations![0].effectDescription!.en).toContain('1 die (d6)');
    expect(energyMissile.augmentations![0].effectDescription!.fr).toContain('dé (d6)');
    expect(energyMissile.augmentations![1].effectDescription!.en).toContain('additional missile');
    expect(energyMissile.augmentations![1].effectDescription!.fr).toContain('missile supplémentaire');

    // Both augmentations are repeatable (capped at manifester level)
    expect(energyMissile.augmentations![0].isRepeatable).toBe(true);
    expect(energyMissile.augmentations![1].isRepeatable).toBe(true);
  });
});
