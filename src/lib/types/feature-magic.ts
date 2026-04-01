/**
 * @file feature-magic.ts
 * @description Magic spell and psionic power Feature types.
 *
 * Contains: PsionicDiscipline, PsionicDisplay, AugmentationRule, MagicFeature.
 * PsionicItemType and PowerStoneEntry (psionic item data) are in feature-items.ts.
 *
 * Extracted from feature.ts. Import from 'feature.ts' (barrel) for backward compatibility.
 *
 * @see ARCHITECTURE.md section 5 for full design specification.
 */

import type { ID } from './primitives';
import type { LocalizedString } from './i18n';
import type { Modifier } from './pipeline';
import type { Feature } from './feature-base';

// =============================================================================
// PSIONIC DISCIPLINE & DISPLAY — Psionic-specific scalar types
// =============================================================================

/**
 * The six psionic disciplines defined by the D&D 3.5 SRD (Expanded Psionics Handbook).
 *
 * Every psionic power belongs to exactly ONE discipline. A discipline is a group of
 * related powers that work in similar ways (SRD "Psionic Powers Overview", §Discipline).
 *
 * DISCIPLINES AND THEIR MECHANICS:
 *   - `"clairsentience"`:    Gather information, perceive the past/future, reveal hidden things.
 *                            (Subdisciplines: scrying)
 *   - `"metacreativity"`:   Create physical matter, objects, or creatures from psionic energy.
 *                            (Subdisciplines: creation)
 *   - `"psychokinesis"`:    Manipulate energy (fire, electricity, cold, sonic) or physical force.
 *                            (Subdisciplines: none in SRD)
 *   - `"psychometabolism"`: Alter the manifester's or target's physical body.
 *                            (Subdisciplines: healing)
 *   - `"psychoportation"`:  Move creatures or objects through space/time/planes.
 *                            (Subdisciplines: teleportation)
 *   - `"telepathy"`:        Influence, control, or read minds.
 *                            (Subdisciplines: charm, compulsion)
 *
 * DISCIPLINE SPECIALIST CLASSES (Psion specialisations):
 *   Each discipline corresponds to a Psion specialist focus-class:
 *   | Specialist     | Discipline          |
 *   |----------------|---------------------|
 *   | Seer           | clairsentience       |
 *   | Shaper         | metacreativity       |
 *   | Kineticist     | psychokinesis        |
 *   | Egoist         | psychometabolism     |
 *   | Nomad          | psychoportation      |
 *   | Telepath       | telepathy            |
 *
 * ONLY relevant when `MagicFeature.magicType === "psionic"`.
 * For arcane/divine spells, `discipline` remains `undefined`.
 *
 * @see ARCHITECTURE.md section 5.2.1 — MagicFeature psionic fields
 * @see SRD: /srd/psionic/psionicPowersOverview.html#disciplineSubdiscipline
 */
export type PsionicDiscipline =
  | 'clairsentience'    // Information, scrying, precognition
  | 'metacreativity'    // Matter creation, astral constructs
  | 'psychokinesis'     // Energy manipulation, force
  | 'psychometabolism'  // Body alteration, healing
  | 'psychoportation'   // Movement, teleportation
  | 'telepathy';        // Mind reading, control, charm

/**
 * The five sensory display types for psionic powers (D&D 3.5 SRD).
 *
 * When a power is manifested, a secondary sensory effect (a "display") may be
 * perceivable by observers. Displays are cosmetic — they have no mechanical impact
 * during combat but can be suppressed with a Concentration check (DC 15 + power level).
 *
 * SRD DISPLAY TYPES (from psionicPowersOverview.html):
 *   - `"auditory"`:   A bass hum, like deep voices, heard up to 100 ft. away.
 *   - `"material"`:   A translucent, shimmering ectoplasmic substance briefly coats
 *                     the subject or area. Evaporates in 1 round.
 *   - `"mental"`:     A subtle chime rings once (or continuously) in the minds of
 *                     creatures within 15 ft. of the manifester or subject.
 *   - `"olfactory"`:  An odd, hard-to-pin-down scent spreads 20 ft. from the manifester,
 *                     fading almost immediately.
 *   - `"visual"`:     The manifester's eyes burn like silver fire; a rainbow flash sweeps
 *                     5 ft. from the manifester and dissipates.
 *
 * A power may have MULTIPLE displays simultaneously (e.g., `["auditory", "visual"]`).
 * Powers marked "see text" in an original source should use the display type that most
 * closely describes the unique text description.
 *
 * SUPPRESSING DISPLAYS:
 *   To manifest without any display, the manifester makes a Concentration check
 *   (DC 15 + power level). Handled by the UI / Dice Engine — not by the engine's
 *   DAG pipeline.
 *
 * ONLY relevant when `MagicFeature.magicType === "psionic"`.
 * For arcane/divine spells, the `displays` array should be empty or absent.
 *
 * @see ARCHITECTURE.md section 5.2.1 — MagicFeature psionic fields
 * @see SRD: /srd/psionic/psionicPowersOverview.html#auditory (et seq.)
 */
export type PsionicDisplay =
  | 'auditory'    // Bass hum; heard up to 100 ft.
  | 'material'    // Ectoplasmic coating; evaporates in 1 round
  | 'mental'      // Subtle chime in nearby minds (15 ft.)
  | 'olfactory'   // Odd scent; spreads 20 ft., fades quickly
  | 'visual';     // Silver eye-fire + rainbow flash at 5 ft.

// =============================================================================
// MAGIC FEATURE — Spells and psionic powers
// =============================================================================

/**
 * An augmentation rule for psionic powers (or custom augmentable abilities).
 *
 * In D&D 3.5 Expanded Psionics Handbook, psionic powers can be augmented by
 * spending additional Power Points. Each augmentation level costs more PP and
 * provides an additional effect (extra damage dice, extended duration, etc.).
 *
 * D20SRD CONVERSION NOTE (C-15c/d):
 *   The conversion pipeline specifies `effectDescription.en/fr` on each augmentation
 *   to describe the effect in human-readable terms. This is required for two scenarios:
 *   1. MECHANICAL augmentations (e.g., +1d10 damage): the description supplements
 *      the `grantedModifiers[].sourceName` with a full sentence explanation.
 *   2. QUALITATIVE augmentations (e.g., "change energy type", "manifest as swift
 *      action"): `grantedModifiers` may be empty or contain a flag-only modifier;
 *      `effectDescription` carries the only human-readable description of the effect.
 *
 * CastingPanel UI contract:
 *   - Display `effectDescription` (if present) as the augmentation's label/tooltip.
 *   - If absent, fall back to the first `grantedModifiers[0].sourceName`.
 *   - Never error if both are absent (some augmentations are description-only placeholders).
 *
 * Example: "Mind Thrust" (1d10 base) can be augmented for +1d10 per 2 extra PP.
 * ```json
 * {
 *   "costIncrement": 2,
 *   "effectDescription": {
 *     "en": "For every 2 additional power points you spend, this power's damage increases by 1d10.",
 *     "fr": "Pour chaque 2 points de pouvoir supplémentaires dépensés, les dégâts augmentent de 1d10."
 *   },
 *   "grantedModifiers": [{ "targetId": "combatStats.power_damage_bonus", "value": "1d10", ... }],
 *   "isRepeatable": true
 * }
 * ```
 *
 * Example: qualitative-only augmentation (no pipeline modifier):
 * ```json
 * {
 *   "costIncrement": 4,
 *   "effectDescription": {
 *     "en": "You may change the energy type to cold, electricity, fire, or sonic.",
 *     "fr": "Vous pouvez changer le type d'énergie en froid, électricité, feu ou son."
 *   },
 *   "grantedModifiers": [],
 *   "isRepeatable": false
 * }
 * ```
 *
 * @see ARCHITECTURE.md section 5.2.2 — AugmentationRule fields and CastingPanel contract
 * @see D20SRD_CONVERSION.md C-15c/d — conversion spec for psionic powers
 */
export interface AugmentationRule {
  /**
   * The additional Power Point cost for this augmentation step.
   * Added on top of the power's base cost.
   * Total cost (base + all applied increments) is capped at the manifester's level.
   */
  costIncrement: number;

  /**
   * Human-readable description of the augmentation's effect, in both languages.
   *
   * REQUIRED for qualitative augmentations (energy type changes, action type changes,
   * targeting changes) where `grantedModifiers` is empty or contains only flag-like
   * pipeline modifications that are not self-explanatory.
   *
   * OPTIONAL for purely mechanical augmentations where `grantedModifiers[0].sourceName`
   * already clearly describes the effect (e.g., "+1d10 fire damage").
   *
   * The CastingPanel displays this text verbatim in the augmentation picker UI.
   *
   * Must be present if `grantedModifiers` is empty — otherwise augmentation has no
   * description at all and would appear as a blank entry in the UI.
   */
  effectDescription?: LocalizedString;

  /**
   * The modifiers granted by this augmentation level.
   *
   * For mechanical effects (damage, range, duration increases):
   *   Use StandardModifier objects targeting appropriate combat stat pipelines.
   *   E.g.: `{ "targetId": "combatStats.power_damage_bonus", "value": "1d6", ... }`
   *
   * For qualitative effects (change targeting, energy type, spell-like behaviour):
   *   May be empty `[]`. The `effectDescription` field carries the description.
   *
   * These modifiers are NOT processed by the static DAG pipeline. Instead, the
   * CastingPanel reads them at manifestion time and applies them transiently to
   * the current cast context only. They do NOT appear in the character sheet.
   */
  grantedModifiers: Modifier[];

  /**
   * Whether this augmentation can be applied multiple times.
   * `true`: The manifester can spend multiple increments (e.g., +1d10 per 2 PP,
   *         spending up to manifester level total PP across all augmentations).
   * `false`: This augmentation can only be applied once per manifestation.
   *          Example: "Spend 6 extra PP to treat this as a Greater power" — once is enough.
   */
  isRepeatable: boolean;
}

/**
 * A Feature representing a spell (arcane or divine) or psionic power.
 *
 * Extends `Feature` with magic-specific metadata:
 *   - Magic type (arcane, divine, psionic)
 *   - Spell lists (which classes can cast this spell and at what level)
 *   - School, descriptors (for spell resistance checks, immunity interactions)
 *   - Range, area, duration (displayed in the spell detail modal)
 *   - Saving throw type (for DC calculation and effect description)
 *   - Psionic augmentation rules
 *
 * SPELL SAVE DC CALCULATION:
 *   10 + spell level + key ability modifier (INT for arcane, WIS for divine, etc.)
 *   The spell level is read from `spellLists[casterClassId]`.
 *   The key ability is defined on the caster class Feature (future Phase 12 data).
 *
 * ARCANE/DIVINE/PSIONIC TRANSPARENCY (SRD rule):
 *   By default, SR and PR are equivalent (Magic-Psionic Transparency rule).
 *   This is implemented as a rule source "srd_psionic_transparency" that creates
 *   cross-modifiers making SR = PR. Disabling this source disables the rule.
 * @see ARCHITECTURE.md section 15.2.
 */
export interface MagicFeature extends Feature {
  category: 'magic';

  /**
   * The source of magic for this ability.
   * Determines which key ability (INT/WIS/CHA) governs the save DC,
   * which classes can learn it, and whether Arcane Spell Failure applies.
   */
  magicType: 'arcane' | 'divine' | 'psionic';

  /**
   * Dictionary mapping class IDs to the spell/power level for that class.
   *
   * Examples:
   *   { "list_wizard": 3, "list_cleric": 3 }   → Level 3 spell for both Wizard and Cleric
   *   { "list_sorcerer": 5 }                    → Sorcerer-only level 5 spell
   *   { "list_psion_telepath": 2 }               → Psion (telepath discipline) level 2 power
   *
   * Used by the Grimoire (Phase 12.2) to filter spells relevant to the character's
   * active classes (e.g., only show cleric spells up to 1/2 caster level rounded down).
   *
   * A missing class ID means the power/spell is NOT on that class's list.
   */
  spellLists: Record<ID, number>;

  /**
   * The school of magic for arcane/divine spells.
   *
   * For `magicType: "arcane"` or `"divine"`:
   *   One of the eight schools of magic from the SRD, plus "universal":
   *   "abjuration" | "conjuration" | "divination" | "enchantment" |
   *   "evocation" | "illusion" | "necromancy" | "transmutation" | "universal"
   *
   * For `magicType: "psionic"`:
   *   Use this field for backward compatibility with legacy psionic entries that
   *   stored the discipline name here (e.g., "clairsentience"). ALL NEW psionic
   *   power entries should use the dedicated `discipline` field instead, and set
   *   `school` to `""` (empty) or the discipline string for display convenience.
   *
   *   The canonical machine-readable discipline value is ALWAYS `discipline`, not `school`.
   *   The engine reads `discipline` for game-mechanical psionic queries.
   *   `school` on psionic powers is informational/display text only.
   *
   * @see discipline — the canonical psionic discipline field
   */
  school: string;

  /**
   * Optional sub-school within the main school (arcane/divine) or
   * subdiscipline within the psionic discipline.
   *
   * Arcane/Divine examples: "calling" (within Conjuration), "charm" (Enchantment),
   *   "creation" (Conjuration), "summoning" (Conjuration), "scrying" (Divination)
   *
   * Psionic subdiscipline examples (same value, different field context):
   *   "scrying" (within Clairsentience), "creation" (within Metacreativity),
   *   "healing" (within Psychometabolism), "teleportation" (within Psychoportation),
   *   "charm" (within Telepathy), "compulsion" (within Telepathy)
   */
  subSchool?: string;

  /**
   * The psionic discipline this power belongs to.
   *
   * ONLY set for `magicType: "psionic"` powers.
   * `undefined` for all arcane and divine spells.
   *
   * D&D 3.5 SRD defines six disciplines:
   *   clairsentience | metacreativity | psychokinesis |
   *   psychometabolism | psychoportation | telepathy
   *
   * RELATIONSHIP TO `school`:
   *   `discipline` is the canonical, typed field for psionic powers.
   *   `school` on a psionic power may hold the same string as a display fallback,
   *   but all engine-level queries should use `discipline`.
   *
   * USES IN THE ENGINE:
   *   - DataLoader query `"discipline:clairsentience"` → powers of that discipline.
   *   - Psion specialist class restrictions (Seer can access extra clairsentience powers).
   *   - Psicraft DC calculation (+5 DC to identify powers from a non-specialist discipline).
   *   - UI filtering in the Psionic Powers panel (Phase 12) — group by discipline.
   *   - Psicraft "detect psionics" check (SRD: see discipline of psionic aura).
   *
   * @see PsionicDiscipline for the full type documentation
   * @see ARCHITECTURE.md section 5.2.1 — Psionic power fields
   */
  discipline?: PsionicDiscipline;

  /**
   * Sensory effects observable when this power is manifested.
   *
   * ONLY relevant for `magicType: "psionic"` powers.
   * For arcane/divine spells, this array should be empty or absent.
   *
   * A power can have multiple simultaneous display types.
   * Examples:
   *   []                      → No display (rare; most powers have at least one)
   *   ["auditory"]            → Bass hum only
   *   ["visual"]              → Silver eye-fire + rainbow flash
   *   ["auditory", "visual"]  → Both hum and visual effect
   *   ["material", "olfactory"] → Ectoplasmic coating + odd scent
   *
   * MECHANICAL USE:
   *   The Concentration DC to suppress ALL displays is: 15 + power level.
   *   The `displays` array is read by the psionic casting panel (Phase 12.3) to:
   *     1. Show which displays will be observable when manifesting.
   *     2. Offer a "Suppress Display" option (with Concentration check button).
   *   Displays have NO mechanical effect during combat per the SRD.
   *
   * AUTHORING NOTE:
   *   Original SRD power descriptions use letters: "A" (auditory), "Ma" (material),
   *   "Me" (mental), "Ol" (olfactory), "Vi" (visual). JSON data content should
   *   translate these abbreviations to full `PsionicDisplay` string values.
   *
   * @see PsionicDisplay for the full type documentation and SRD definitions
   * @see ARCHITECTURE.md section 5.2.1 — Psionic power fields
   */
  displays?: PsionicDisplay[];

  /**
   * Array of descriptor tags.
   * Examples: ["fire", "evil"], ["mind-affecting", "compulsion", "language-dependent"]
   * Used for immunity/resistance checks (fire immunity blocks fire spells, etc.).
   */
  descriptors: string[];

  /**
   * Whether the spell is subject to magic resistance, psionic resistance, or neither.
   */
  resistanceType: 'spell_resistance' | 'power_resistance' | 'none';

  /**
   * Material, somatic, verbal, or psionic components required.
   * Arcane/Divine examples: ["V", "S", "M"], ["V", "S", "DF"]
   * Psionic examples: ["A"] (Auditory), ["M"] (Material), ["V"] (Visual), ["O"] (Olfactory)
   *
   * Used by the arcane spell failure calculation (if "S" or "M" present) and
   * for display in the spell detail modal.
   */
  components: string[];

  /**
   * Range formula or constant string.
   * Examples:
   *   "close"       → Constant range category
   *   "medium"      → Constant range category
   *   "25 + floor(@classLevels.class_wizard / 2) * 5"  → Scaling formula
   *   "@attributes.caster_level.totalValue * 30"        → Pure formula
   *
   * The Math Parser resolves `@`-prefixed variables from the character context.
   * The result is then formatted via formatDistance() for the active language.
   */
  range: string;

  /**
   * Localised description of the target/area of effect.
   * Examples: { en: "One creature", fr: "Une creature" }
   *            { en: "20-ft. radius spread", fr: "Rayon de 6 m" }
   */
  targetArea: LocalizedString;

  /**
   * Duration formula or constant string.
   * Can reference variables: "1 round per @classLevels.class_cleric level".
   * The Math Parser resolves these for display in the spell detail modal.
   */
  duration: string;

  /**
   * Saving throw type.
   * Standard D&D 3.5 values: "fort_half", "ref_negates", "will_disbelieves", "none"
   * Or a custom string for complex cases (e.g., "fort_partial, will_negates").
   * Used to calculate and display the save DC in the casting panel (Phase 12.3).
   */
  savingThrow: 'fort_half' | 'ref_negates' | 'will_disbelieves' | 'none' | string;

  /**
   * Optional psionic augmentation rules.
   * Exclusive to `magicType: "psionic"` (or custom rules for augmentable magic).
   * If present, the UI displays augmentation options in the casting panel.
   * @see AugmentationRule for full documentation.
   */
  augmentations?: AugmentationRule[];

  /**
   * Optional cast-time side effect: what happens mechanically when this spell is cast.
   *
   * DESIGN RATIONALE (zero-hardcoding, ARCHITECTURE.md §6):
   *   The engine must not know the names "Magic Stone", "Spiritual Weapon", or
   *   "Invoke Allies" — those are D&D content, not engine logic. Instead, each
   *   spell's JSON entry declares WHAT it does when cast via this field. The engine
   *   reads the `castEffect` and dispatches to the appropriate engine method.
   *
   * Supported cast effect types:
   *
   *   `spawn_weapons`:
   *     Casting this spell creates one or more new weapon entries on the character.
   *     These are ephemeral — they disappear when all charges are consumed or when
   *     the effect is manually dismissed. Used for: Magic Stone (3 enchanted pebbles),
   *     Shillelagh (enchanted staff), Masterwork Transformation, etc.
   *
   *     Fields:
   *       - `weaponFeatureId`: The Feature ID of the item_* weapon to spawn.
   *         The feature must have `weaponData` and the 'weapon' or 'ranged' tag.
   *       - `count`:           How many weapon instances to create (e.g., 3 for Magic Stone).
   *       - `chargesPerWeapon`:Optional charges; if present an `itemResourcePools.charges`
   *         entry is initialised on each spawned weapon instance. When a charge is spent
   *         (a throw is made), `spendItemPoolCharge()` decrements it. When 0, the weapon
   *         is automatically removed by the engine.
   *       - `durationHint`:    Human-readable lifetime string shown in the ephemeral
   *         effects panel (e.g., "30 min" for Magic Stone's duration).
   *
   *   `summon_entity`:
   *     Casting this spell adds a linked entity to the character.
   *     The linked entity is a minimal creature / weapon / object with its own
   *     character data (stats, features). The player can later dismiss it manually.
   *     Used for: Spiritual Weapon, Invoke Allies, Summon Swarm, etc.
   *
   *     Fields:
   *       - `entityType`:      'summon' | 'companion' | 'familiar' | 'mount'.
   *       - `bondingFeatureId`:Feature ID of the spell — used to track which spell
   *         created this entity and to label the entity in the dismissed panel.
   *       - `entityTemplateId`:Feature ID of a 'summon_template' Feature that
   *         describes the entity's base character data (stats, attacks, etc.).
   *         The engine calls `dataLoader.getFeature(entityTemplateId)` and uses
   *         the template's embedded `characterTemplate` sub-object.
   *       - `nameKey`:         UI string key for the entity's display name
   *         (e.g., 'magic.summon.spiritual_weapon').
   *       - `durationHint`:    Human-readable duration hint (e.g., "1 round/level").
   */
  castEffect?: SpellCastEffect;
}

// =============================================================================
// SPELL CAST EFFECT — Discriminated union for all supported cast-time mechanics
// =============================================================================

/**
 * Discriminated union describing everything that can happen at cast-time.
 *
 * DESIGN NOTE (zero-hardcoding, ARCHITECTURE.md §6):
 *   No spell name or D&D-specific logic appears in TypeScript. The JSON content
 *   for each spell declares which `type` of effect it has. The engine's
 *   `castSpellEffect()` dispatcher reads this and calls the appropriate handler.
 *
 * Supported types:
 *   - `spawn_weapons`   — Create 1..N ephemeral weapons (Magic Stone, Flame Blade, Produce Flame…)
 *   - `summon_entity`   — Conjure a creature/weapon/ally linked entity (Summon Monster, Spiritual Weapon…)
 *   - `animate_objects` — Animate existing inanimate objects as linked entities (Animate Rope, Animate Objects…)
 *   - `animate_undead`  — Raise undead from corpses; creates undead-type linked entities (Animate Dead…)
 *   - `create_object`   — Create a non-creature object/space; tracked as an 'object' linked entity
 *                         so the player can dismiss it when the duration ends
 *                         (Unseen Servant, Phantom Steed, Tiny Hut, Minor Creation…)
 */
export type SpellCastEffect =
  | {
      type: 'spawn_weapons';
      /**
       * Feature ID of the weapon item to spawn (`item_*` with `weaponData`).
       * Examples: "item_magic_stone", "item_flame_blade", "item_produce_flame"
       */
      weaponFeatureId: string;
      /** How many weapon instances to create. Magic Stone = 3, most others = 1. */
      count: number;
      /**
       * Optional per-weapon charge count. When set, an `itemResourcePools.charges`
       * entry is initialised. Each attack throw consumes one charge.
       * When ≤ 0, the weapon is automatically removed. Leave unset for weapons
       * that last the full duration (Flame Blade, Produce Flame).
       */
      chargesPerWeapon?: number;
      /** Human-readable duration hint shown in the Ephemeral Effects panel. */
      durationHint?: string;
    }
  | {
      type: 'summon_entity';
      /**
       * The type of linked entity. Controls the badge shown in SummonedEntitiesPanel.
       * Use 'summon' for temporary conjured creatures; 'mount' for Phantom Steed/Mount.
       */
      entityType: 'summon' | 'companion' | 'familiar' | 'mount' | 'undead' | 'object';
      /**
       * Feature ID of THIS spell — stored on the linked entity as `bondingFeatureId`
       * so the UI can display which spell created the entity.
       */
      bondingFeatureId: string;
      /**
       * Feature ID of a `summon_template` Feature that carries a `characterTemplate`
       * sub-object describing the summoned entity's base stats and active features.
       * DataLoader resolves this ID at cast-time.
       */
      entityTemplateId: string;
      /**
       * UI string key for the entity's display name.
       * Resolved via `ui(nameKey, language)` at runtime.
       * Examples: "magic.summon.spiritual_weapon", "magic.summon.summon_monster_1"
       */
      nameKey: string;
      /** Human-readable duration hint (e.g., "1 round/level", "2 hours/level"). */
      durationHint?: string;
    }
  | {
      type: 'animate_objects';
      /**
       * Feature ID of the template for the animated object/creature.
       * Typically a `summon_template` category feature with basic combat stats.
       */
      entityTemplateId: string;
      /** How many objects are animated (for spells like Animate Objects). */
      count?: number;
      /** UI string key for the animated object's display name. */
      nameKey: string;
      /** Human-readable duration hint. */
      durationHint?: string;
    }
  | {
      type: 'animate_undead';
      /**
       * Feature ID of the undead template (a `summon_template` with `entityType: 'undead'`).
       * Examples: "summon_template_skeleton", "summon_template_zombie"
       */
      entityTemplateId: string;
      /** How many undead are created. Animate Dead = up to 2 HD per level. */
      count?: number;
      /** UI string key for the undead name. */
      nameKey: string;
      /** Human-readable duration hint ("Instantaneous", "Permanent"). */
      durationHint?: string;
    }
  | {
      type: 'create_object';
      /**
       * Feature ID of the object template defining what was created.
       * Most simple "created objects" (Minor Creation, Phantom Steed if treated as
       * quasi-real mount) use generic templates in 19_d20srd_core_summon_templates.json.
       */
      entityTemplateId: string;
      /** UI string key for the object's name ("magic.create.unseen_servant", etc.). */
      nameKey: string;
      /** Human-readable duration hint shown in the SummonedEntitiesPanel. */
      durationHint?: string;
    };

