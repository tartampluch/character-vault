/**
 * @file src/tests/magicFeature.test.ts
 * @description Vitest unit tests for MagicFeature psionic-specific fields.
 *
 * WHAT IS TESTED (Phase 1.3a — ARCHITECTURE.md section 5.2.1):
 *
 *   1. TYPE SOUNDNESS — `PsionicDiscipline` and `PsionicDisplay` type coverage:
 *      - All 6 discipline values compile as valid `PsionicDiscipline` assignments.
 *      - All 5 display values compile as valid `PsionicDisplay` assignments.
 *      - Both types are exported from `feature.ts` (import must succeed).
 *
 *   2. `MagicFeature.discipline` field:
 *      - Psionic powers can carry each of the 6 discipline values.
 *      - `discipline` is OPTIONAL — arcane/divine spells compile with `undefined`.
 *      - Discipline values are the canonical source for engine queries (not `school`).
 *
 *   3. `MagicFeature.displays` field:
 *      - Psionic powers can carry any combination of the 5 display types.
 *      - An empty array `[]` is valid (rare powers with no display).
 *      - Multiple simultaneous displays (e.g., `["auditory", "visual"]`) are valid.
 *      - `displays` is OPTIONAL — can be absent for spells.
 *
 *   4. ARCANE/DIVINE SPELLS — no discipline or displays fields needed:
 *      - Arcane spells compile with only `school` (no `discipline` / `displays`).
 *      - Division between arcane school and psionic discipline values is clean.
 *
 *   5. DATA AUTHORING SCENARIOS from ARCHITECTURE.md §5.2.1:
 *      - Mind Thrust (telepathy, auditory+mental displays, augmentations).
 *      - Astral Construct (metacreativity, visual display, no PR).
 *      - Detect Psionics (clairsentience, no display).
 *      - Fireball equivalent (arcane, no discipline/displays).
 *      - discipline vs school independence.
 *
 * WHY PURE TYPE TESTS?
 *   `MagicFeature` is a TypeScript interface. Its correctness is guaranteed by the
 *   type checker, not by runtime logic. These tests serve as:
 *     1. Compile-time regressions (if a type changes, the test file fails to compile).
 *     2. Documentation-as-tests (each test describes the intended semantics).
 *     3. Runtime value checks (confirming stored values can be read back correctly).
 *
 * @see src/lib/types/feature.ts — PsionicDiscipline, PsionicDisplay, MagicFeature
 * @see ARCHITECTURE.md section 5.2.1 — MagicFeature psionic fields
 * @see ARCHITECTURE.md Phase 17 (test suite)
 */

import { describe, it, expect } from 'vitest';
import type {
  MagicFeature,
  PsionicDiscipline,
  PsionicDisplay,
  AugmentationRule,
} from '$lib/types/feature';

// =============================================================================
// SECTION 1: Type exports — PsionicDiscipline and PsionicDisplay are exported
// =============================================================================

describe('Exports from feature.ts — PsionicDiscipline and PsionicDisplay', () => {
  /**
   * This test verifies that both types are exported from feature.ts.
   * If either import fails, the test file will not compile.
   * At runtime, we confirm we can assign valid values to typed variables.
   */
  it('PsionicDiscipline — all 6 values are valid assignments', () => {
    const d1: PsionicDiscipline = 'clairsentience';
    const d2: PsionicDiscipline = 'metacreativity';
    const d3: PsionicDiscipline = 'psychokinesis';
    const d4: PsionicDiscipline = 'psychometabolism';
    const d5: PsionicDiscipline = 'psychoportation';
    const d6: PsionicDiscipline = 'telepathy';

    const allDisciplines: PsionicDiscipline[] = [d1, d2, d3, d4, d5, d6];
    expect(allDisciplines).toHaveLength(6);
    expect(allDisciplines).toContain('clairsentience');
    expect(allDisciplines).toContain('metacreativity');
    expect(allDisciplines).toContain('psychokinesis');
    expect(allDisciplines).toContain('psychometabolism');
    expect(allDisciplines).toContain('psychoportation');
    expect(allDisciplines).toContain('telepathy');
  });

  it('PsionicDisplay — all 5 values are valid assignments', () => {
    const disp1: PsionicDisplay = 'auditory';
    const disp2: PsionicDisplay = 'material';
    const disp3: PsionicDisplay = 'mental';
    const disp4: PsionicDisplay = 'olfactory';
    const disp5: PsionicDisplay = 'visual';

    const allDisplays: PsionicDisplay[] = [disp1, disp2, disp3, disp4, disp5];
    expect(allDisplays).toHaveLength(5);
    expect(allDisplays).toContain('auditory');
    expect(allDisplays).toContain('material');
    expect(allDisplays).toContain('mental');
    expect(allDisplays).toContain('olfactory');
    expect(allDisplays).toContain('visual');
  });
});

// =============================================================================
// SECTION 2: MagicFeature.discipline — optional field for psionic powers
// =============================================================================

/** Minimal valid psionic MagicFeature factory. */
function makePsionicPower(
  id: string,
  discipline: PsionicDiscipline,
  displays: PsionicDisplay[] = [],
  augmentations?: AugmentationRule[]
): MagicFeature {
  return {
    id,
    category: 'magic',
    magicType: 'psionic',
    ruleSource: 'srd_psionics',
    label: { en: id },
    description: { en: `Test psionic power: ${id}` },
    tags: ['magic', 'psionic'],
    discipline,
    displays,
    spellLists: {},
    school: discipline, // legacy display — same string as discipline
    descriptors: [],
    resistanceType: 'power_resistance',
    components: [],
    range: 'close',
    targetArea: { en: 'One creature' },
    duration: 'instantaneous',
    savingThrow: 'will_negates',
    grantedModifiers: [],
    grantedFeatures: [],
    augmentations,
  };
}

/** Minimal valid arcane MagicFeature factory (NO discipline or displays). */
function makeArcaneSpell(id: string, school: string): MagicFeature {
  return {
    id,
    category: 'magic',
    magicType: 'arcane',
    ruleSource: 'srd_core',
    label: { en: id },
    description: { en: `Test arcane spell: ${id}` },
    tags: ['magic', 'arcane'],
    // discipline is intentionally absent — arcane spells have no discipline
    // displays is intentionally absent
    spellLists: {},
    school,
    descriptors: [],
    resistanceType: 'spell_resistance',
    components: ['V', 'S'],
    range: 'medium',
    targetArea: { en: '20-ft. radius' },
    duration: 'instantaneous',
    savingThrow: 'ref_negates',
    grantedModifiers: [],
    grantedFeatures: [],
  };
}

describe('MagicFeature.discipline — psionic-only field', () => {
  /**
   * D&D 3.5 SRD: Each psionic power belongs to exactly one of six disciplines.
   * ARCHITECTURE.md §5.2.1: `discipline` is the canonical engine field.
   */
  it('clairsentience discipline: read back correctly', () => {
    const power = makePsionicPower('power_identify', 'clairsentience');
    expect(power.discipline).toBe('clairsentience');
    expect(power.magicType).toBe('psionic');
  });

  it('metacreativity discipline: read back correctly', () => {
    const power = makePsionicPower('power_astral_construct', 'metacreativity');
    expect(power.discipline).toBe('metacreativity');
  });

  it('psychokinesis discipline: read back correctly', () => {
    const power = makePsionicPower('power_energy_blast', 'psychokinesis');
    expect(power.discipline).toBe('psychokinesis');
  });

  it('psychometabolism discipline: read back correctly', () => {
    const power = makePsionicPower('power_body_adjustment', 'psychometabolism');
    expect(power.discipline).toBe('psychometabolism');
  });

  it('psychoportation discipline: read back correctly', () => {
    const power = makePsionicPower('power_psionic_blink', 'psychoportation');
    expect(power.discipline).toBe('psychoportation');
  });

  it('telepathy discipline: read back correctly', () => {
    const power = makePsionicPower('power_mind_thrust', 'telepathy');
    expect(power.discipline).toBe('telepathy');
  });

  it('discipline is OPTIONAL — arcane spells compile without it', () => {
    const spell = makeArcaneSpell('spell_fireball', 'evocation');
    // TypeScript compile-time check: no error without discipline
    expect(spell.discipline).toBeUndefined();
    expect(spell.magicType).toBe('arcane');
  });

  it('discipline is OPTIONAL — divine spells compile without it', () => {
    const divineSpell: MagicFeature = {
      ...makeArcaneSpell('spell_cure_light_wounds', 'conjuration'),
      magicType: 'divine',
      ruleSource: 'srd_core',
    };
    expect(divineSpell.discipline).toBeUndefined();
    expect(divineSpell.magicType).toBe('divine');
  });

  it('discipline !== school: discipline is canonical, school is display/legacy', () => {
    // A psionic power may have school = "telepathy" (legacy) AND discipline = "telepathy"
    // But a content author could set school = "psionics" while discipline drives the engine.
    const power = makePsionicPower('power_charm_person_psionic', 'telepathy');
    power.school = 'psionics'; // override school to a display-only string
    expect(power.discipline).toBe('telepathy'); // canonical
    expect(power.school).toBe('psionics');       // display/legacy — irrelevant to engine
  });
});

// =============================================================================
// SECTION 3: MagicFeature.displays — psionic sensory effect array
// =============================================================================

describe('MagicFeature.displays — psionic sensory effects', () => {
  /**
   * D&D 3.5 SRD: A power may have 0–5 display types simultaneously.
   * Most powers have 1–2 displays. Powers with no display are rare.
   */

  it('single auditory display ("A" abbreviation in SRD)', () => {
    const power = makePsionicPower('power_telekinesis', 'psychokinesis', ['auditory']);
    expect(power.displays).toEqual(['auditory']);
    expect(power.displays).toHaveLength(1);
  });

  it('single visual display ("Vi" abbreviation)', () => {
    const power = makePsionicPower('power_energy_splash', 'psychokinesis', ['visual']);
    expect(power.displays).toEqual(['visual']);
  });

  it('single mental display ("Me" abbreviation)', () => {
    const power = makePsionicPower('power_empathy', 'telepathy', ['mental']);
    expect(power.displays).toEqual(['mental']);
  });

  it('single material display ("Ma" abbreviation)', () => {
    const power = makePsionicPower('power_astral_construct', 'metacreativity', ['material']);
    expect(power.displays).toEqual(['material']);
  });

  it('single olfactory display ("Ol" abbreviation)', () => {
    const power = makePsionicPower('power_ectoplasmic_form', 'psychometabolism', ['olfactory']);
    expect(power.displays).toEqual(['olfactory']);
  });

  it('multiple displays simultaneously: ["auditory", "visual"]', () => {
    // SRD: A power can have multiple displays; they are all observed simultaneously.
    const power = makePsionicPower('power_mind_thrust', 'telepathy', ['auditory', 'mental']);
    expect(power.displays).toContain('auditory');
    expect(power.displays).toContain('mental');
    expect(power.displays).toHaveLength(2);
  });

  it('all five displays: rare but valid (e.g., high-level reality revision)', () => {
    const power = makePsionicPower('power_reality_revision', 'psychoportation',
      ['auditory', 'material', 'mental', 'olfactory', 'visual']);
    expect(power.displays).toHaveLength(5);
  });

  it('empty displays array: no sensory effect (uncommon)', () => {
    // Some psi-like abilities have no display.
    const power = makePsionicPower('power_detect_psionics', 'clairsentience', []);
    expect(power.displays).toEqual([]);
    expect(power.displays).toHaveLength(0);
  });

  it('displays is OPTIONAL — arcane spells can have undefined displays', () => {
    const spell = makeArcaneSpell('spell_sleep', 'enchantment');
    expect(spell.displays).toBeUndefined();
  });

  it('suppress-display logic: presence of displays array enables suppression UI', () => {
    // ARCHITECTURE.md §5.2.1: "Suppressing displays" section.
    // A power with at least one display can be suppressed via Concentration DC 15 + power level.
    // The `displays` array is non-empty → suppression option is available in the UI.
    const power = makePsionicPower('power_charm', 'telepathy', ['auditory', 'visual']);
    const canSuppress = power.displays !== undefined && power.displays.length > 0;
    expect(canSuppress).toBe(true);

    const powerNoDisplay = makePsionicPower('power_no_display', 'clairsentience', []);
    const canSuppressEmpty = powerNoDisplay.displays !== undefined && powerNoDisplay.displays.length > 0;
    expect(canSuppressEmpty).toBe(false); // Nothing to suppress
  });
});

// =============================================================================
// SECTION 4: Augmentable powers with discipline + displays (full scenario)
// =============================================================================

describe('MagicFeature — full psionic power scenarios (ARCHITECTURE.md §5.2.1)', () => {
  /**
   * CANONICAL SCENARIO: Mind Thrust (SRD telepathy power)
   *   - Discipline: telepathy (Telepath specialist power)
   *   - Displays: auditory ("A") + mental ("Me")
   *   - Augmentable: +1d10 per 2 extra PP (repeatable)
   *   - Save: Will negates
   */
  it('Mind Thrust: telepathy, auditory+mental displays, with augmentation', () => {
    const augRule: AugmentationRule = {
      costIncrement: 2,
      grantedModifiers: [{
        id: 'aug_mind_thrust_damage',
        sourceId: 'power_mind_thrust',
        sourceName: { en: 'Mind Thrust (augmented)' },
        targetId: 'damage',
        value: '1d10',
        type: 'untyped',
      }],
      isRepeatable: true,
    };

    const mindThrust = makePsionicPower(
      'power_mind_thrust',
      'telepathy',
      ['auditory', 'mental'],
      [augRule]
    );

    expect(mindThrust.discipline).toBe('telepathy');
    expect(mindThrust.displays).toContain('auditory');
    expect(mindThrust.displays).toContain('mental');
    expect(mindThrust.augmentations).toHaveLength(1);
    expect(mindThrust.augmentations![0].costIncrement).toBe(2);
    expect(mindThrust.augmentations![0].isRepeatable).toBe(true);
    expect(mindThrust.resistanceType).toBe('power_resistance');
    expect(mindThrust.savingThrow).toBe('will_negates');
  });

  /**
   * CANONICAL SCENARIO: Astral Construct (SRD metacreativity power)
   *   - Discipline: metacreativity (Shaper specialist power)
   *   - Displays: visual ("Vi")
   *   - No PR (creates a construct, not a direct attack)
   *   - Augmentable by power point spending for a stronger construct
   */
  it('Astral Construct: metacreativity, visual display, no PR', () => {
    const astralConstruct = makePsionicPower(
      'power_astral_construct',
      'metacreativity',
      ['visual']
    );

    expect(astralConstruct.discipline).toBe('metacreativity');
    expect(astralConstruct.displays).toEqual(['visual']);
    // Override PR to none (Astral Construct is not subject to PR)
    astralConstruct.resistanceType = 'none';
    expect(astralConstruct.resistanceType).toBe('none');
  });

  /**
   * CANONICAL SCENARIO: Detect Psionics (SRD clairsentience power)
   *   - Discipline: clairsentience (Seer specialist power)
   *   - No display (rare — detect powers often have no display)
   *   - No saving throw
   */
  it('Detect Psionics: clairsentience, no display, no save', () => {
    const detectPsionics = makePsionicPower(
      'power_detect_psionics',
      'clairsentience',
      []
    );
    detectPsionics.savingThrow = 'none';

    expect(detectPsionics.discipline).toBe('clairsentience');
    expect(detectPsionics.displays).toEqual([]);
    expect(detectPsionics.savingThrow).toBe('none');
  });

  /**
   * ARCANE vs PSIONIC comparison:
   *   Arcane Fireball has no discipline/displays.
   *   Psionic Energy Ball (equivalent) has discipline + displays.
   *   They should both be valid MagicFeature shapes.
   */
  it('Arcane Fireball vs psionic Energy Ball: clean separation of fields', () => {
    const fireball = makeArcaneSpell('spell_fireball', 'evocation');
    const energyBall = makePsionicPower('power_energy_ball', 'psychokinesis', ['visual']);

    // Arcane spell: no psionic fields
    expect(fireball.discipline).toBeUndefined();
    expect(fireball.displays).toBeUndefined();
    expect(fireball.school).toBe('evocation');
    expect(fireball.magicType).toBe('arcane');

    // Psionic power: has discipline and displays
    expect(energyBall.discipline).toBe('psychokinesis');
    expect(energyBall.displays).toContain('visual');
    expect(energyBall.magicType).toBe('psionic');
  });
});

// =============================================================================
// SECTION 5: Discipline consistency invariants
// =============================================================================

describe('PsionicDiscipline — field consistency invariants', () => {
  it('discipline field is distinct from school field', () => {
    // Both may contain the discipline name, but they are independent.
    // This allows future content where school might differ from discipline
    // (e.g., a power from a cross-discipline prestige class).
    const power = makePsionicPower('power_precognition', 'clairsentience', ['visual']);
    expect(power.discipline).toBe('clairsentience');
    expect(power.school).toBe('clairsentience'); // same value in this factory, but distinct field
    expect(typeof power.discipline).toBe('string');
    expect(typeof power.school).toBe('string');
  });

  it('all 6 disciplines are represented in a collection of powers', () => {
    const powers: MagicFeature[] = [
      makePsionicPower('p1', 'clairsentience'),
      makePsionicPower('p2', 'metacreativity'),
      makePsionicPower('p3', 'psychokinesis'),
      makePsionicPower('p4', 'psychometabolism'),
      makePsionicPower('p5', 'psychoportation'),
      makePsionicPower('p6', 'telepathy'),
    ];

    const disciplines = powers.map(p => p.discipline);
    const uniqueDisciplines = new Set(disciplines);
    expect(uniqueDisciplines.size).toBe(6);
  });

  it('filtering powers by discipline works correctly (simulating DataLoader query)', () => {
    const powers: MagicFeature[] = [
      makePsionicPower('p1', 'telepathy'),
      makePsionicPower('p2', 'telepathy'),
      makePsionicPower('p3', 'psychokinesis'),
      makePsionicPower('p4', 'clairsentience'),
    ];

    // Simulate the DataLoader "discipline:telepathy" query
    const telepathyPowers = powers.filter(p => p.discipline === 'telepathy');
    expect(telepathyPowers).toHaveLength(2);
    expect(telepathyPowers.every(p => p.discipline === 'telepathy')).toBe(true);
  });

  it('a psion specialist can access extra powers from their discipline', () => {
    // Simulate: Telepath psion checks if a power is in their discipline.
    // This is the engine check that Phase 12.3 UI would use.
    const powers: MagicFeature[] = [
      makePsionicPower('p1', 'telepathy', ['auditory']),
      makePsionicPower('p2', 'clairsentience'),
    ];

    const specialistDiscipline: PsionicDiscipline = 'telepathy';
    const specialistPowers = powers.filter(p => p.discipline === specialistDiscipline);
    expect(specialistPowers).toHaveLength(1);
    expect(specialistPowers[0].id).toBe('p1');
  });
});

// =============================================================================
// SECTION 6: Display filtering invariants
// =============================================================================

describe('PsionicDisplay — display filtering invariants', () => {
  it('auditory-only powers can be identified', () => {
    const powers: MagicFeature[] = [
      makePsionicPower('pa', 'telepathy', ['auditory']),
      makePsionicPower('pb', 'telepathy', ['visual']),
      makePsionicPower('pc', 'telepathy', ['auditory', 'visual']),
    ];

    // Powers with auditory display (for stealth/silence detection purposes)
    const auditoryPowers = powers.filter(p => p.displays?.includes('auditory'));
    expect(auditoryPowers).toHaveLength(2);
    expect(auditoryPowers.map(p => p.id)).toContain('pa');
    expect(auditoryPowers.map(p => p.id)).toContain('pc');
  });

  it('powers with NO displays (fully silent) can be identified', () => {
    const powers: MagicFeature[] = [
      makePsionicPower('silent', 'telepathy', []),
      makePsionicPower('noisy', 'telepathy', ['auditory']),
    ];

    const silentPowers = powers.filter(p => p.displays !== undefined && p.displays.length === 0);
    expect(silentPowers).toHaveLength(1);
    expect(silentPowers[0].id).toBe('silent');
  });

  it('display count correctly reflects multiple simultaneous displays', () => {
    const power = makePsionicPower('power_complex', 'psychokinesis',
      ['auditory', 'material', 'visual']);
    expect(power.displays!.length).toBe(3);
  });
});
