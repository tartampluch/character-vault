/**
 * @file statFormatters.ts
 * @description Stat display formatters, situational context labels, and math helpers.
 *
 * Extracted from formatters.ts. Import from formatters.ts (barrel) for backward compatibility.
 */

import type { LocalizedString } from '../types/i18n';
import { ui } from '../i18n/ui-strings';


// =============================================================================
// ABILITY SCORE MODIFIER COMPUTATION
// =============================================================================

/**
 * Computes the D&D 3.5 ability score modifier from a raw ability score.
 *
 * D&D 3.5 FORMULA: modifier = floor((score − 10) / 2)
 *
 * This is the canonical formula used throughout the SRD:
 *   STR 18 → modifier +4
 *   STR 10 → modifier +0
 *   STR  8 → modifier -1
 *   STR  3 → modifier -4
 *
 * WHY IN FORMATTERS (not GameEngine)?
 *   This is a pure stateless function with no reactive dependencies — it needs
 *   neither character state nor campaign settings. Placing it here keeps the engine
 *   focused on reactive DAG derivations while giving any layer (engine, math parser,
 *   or UI wizard) access to the formula without duplicating it.
 *
 * UI USE CASES:
 *   - PointBuyModal: preview modifier before committing scores to the engine.
 *   - RollStatsModal: preview rolled modifiers before assigning them.
 *   - ItemDataEditor: compute ego score components from INT/WIS/CHA spinners.
 *
 * @param score - The raw ability score (typically 3–20 for D&D characters).
 * @returns The ability modifier (can be negative for scores below 10).
 *
 * @example
 * computeAbilityModifier(18) // → 4
 * computeAbilityModifier(10) // → 0
 * computeAbilityModifier(8)  // → -1
 * computeAbilityModifier(3)  // → -4
 */
export function computeAbilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

// =============================================================================
// INTELLIGENT ITEM EGO SCORE FORMULA
// =============================================================================

/**
 * Computes the D&D 3.5 SRD Intelligent Item Ego score from the item's stats.
 *
 * D&D 3.5 SRD — INTELLIGENT ITEM EGO FORMULA (Dungeon Master's Guide, Chapter 8):
 *   Ego = INT modifier + WIS modifier + CHA modifier
 *       + lesser special abilities (each × 1)
 *       + greater special abilities (each × 2)
 *       + 1 if communication is telepathy
 *       + 4 if the item has a special purpose and dedicated power
 *   Minimum value: 0 (floor at 0 per SRD)
 *
 * WHY IN FORMATTERS (not GameEngine)?
 *   This is a pure, stateless formula with no reactive dependencies.
 *   Placing it here enforces the zero-game-logic-in-Svelte rule
 *   (ARCHITECTURE.md §3): `ItemDataEditor.svelte` MUST NOT contain D&D arithmetic.
 *   `computeAbilityModifier()` (INT/WIS/CHA modifiers) is also here, so this
 *   function consolidates the complete Ego formula in one place.
 *
 * NOTE: The `egoScore` field on `IntelligentItemData` stores the *pre-computed*
 *   value from this formula (or a manual GM override). The real-time auto-preview
 *   in `ItemDataEditor` calls this function reactively while the GM edits the form.
 *
 * @param data - A subset of `IntelligentItemData` fields needed for Ego computation.
 * @returns The computed Ego score (minimum 0).
 *
 * @example
 * computeIntelligentItemEgo({ intelligenceScore: 17, wisdomScore: 14, charismaScore: 10,
 *   communication: 'telepathy', lesserPowers: 2, greaterPowers: 1,
 *   specialPurpose: 'Slay undead', dedicatedPower: '+4 to attacks vs undead' })
 * // INT 17 → +3, WIS 14 → +2, CHA 10 → +0 = 5 ability mods
 * // + telepathy bonus 1
 * // + lesser 2×1 = 2
 * // + greater 1×2 = 2
 * // + purpose+power 4
 * // = 14
 */
export function computeIntelligentItemEgo(data: {
  intelligenceScore: number;
  wisdomScore: number;
  charismaScore: number;
  communication: string;
  lesserPowers: number;
  greaterPowers: number;
  specialPurpose: string | null;
  dedicatedPower: string | null;
}): number {
  const intBonus     = computeAbilityModifier(data.intelligenceScore);
  const wisBonus     = computeAbilityModifier(data.wisdomScore);
  const chaBonus     = computeAbilityModifier(data.charismaScore);
  // Telepathy grants +1 Ego point (SRD: "telepathic items gain +1 to Ego")
  const teleBonus    = data.communication === 'telepathy' ? 1 : 0;
  // Special purpose + dedicated power combo grants +4 Ego points
  const purposeBonus = (data.specialPurpose && data.dedicatedPower) ? 4 : 0;
  // Each lesser special ability adds 1 Ego point; greater adds 2
  return Math.max(0,
    intBonus + wisBonus + chaBonus
    + teleBonus
    + purposeBonus
    + (data.lesserPowers  * 1)
    + (data.greaterPowers * 2),
  );
}

// =============================================================================
// MODIFIER SIGN FORMATTING
// =============================================================================

/**
 * Formats a numeric modifier value with an explicit sign prefix.
 *
 * D&D 3.5 convention: modifiers are always displayed with signs:
 *   - Positive: "+2"
 *   - Negative: "-2"
 *   - Zero:     "+0" (explicit zero on stats, "0" might be used for totals)
 *
 * This is used throughout the UI for:
 *   - Ability score modifiers: "+4 STR"
 *   - Spell save DCs: "+3 to DC"
 *   - Modifier breakdown lists: "+2 enhancement (Belt of Strength)"
 *
 * @param value    - The numeric modifier value (positive, negative, or zero).
 * @returns A string with an explicit +/- sign.
 *
 * @example
 * formatModifier(4)  // → "+4"
 * formatModifier(-2) // → "-2"
 * formatModifier(0)  // → "+0"
 */
export function formatModifier(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

// =============================================================================
// CURRENCY FORMATTING
// =============================================================================

/**
 * Formats a currency amount with the standard D&D 3.5 denomination abbreviation.
 *
 * D&D 3.5 currency denominations (in order of value):
 *   - CP: Copper Pieces   (1/100 gp)
 *   - SP: Silver Pieces   (1/10 gp)
 *   - GP: Gold Pieces     (1 gp, the reference unit — all prices stored in GP)
 *   - PP: Platinum Pieces (10 gp)
 *
 * Localization note: Currency abbreviations are abbreviated in Latin (CP, SP, GP, PP)
 * and are NOT localized — they are universally recognizable in RPG contexts across
 * all supported languages.
 *
 * @param amount       - The numeric amount.
 * @param denomination - The currency type abbreviation.
 * @returns Formatted currency string.
 *
 * @example
 * formatCurrency(150, "GP") // → "150 GP"
 * formatCurrency(5, "PP")   // → "5 PP"
 */
export function formatCurrency(amount: number, denomination: 'CP' | 'SP' | 'GP' | 'PP'): string {
  return `${amount} ${denomination}`;
}

// =============================================================================
// DICE EXPRESSION FORMATTING
// =============================================================================

/**
 * Formats a dice expression for display in roll result UIs.
 *
 * Pure formatting utility — does not perform any calculation.
 * Used by the DiceRollModal (Phase 9.2) to display what was rolled.
 *
 * @param rolls    - Array of individual die results.
 * @param faces    - Number of faces on each die (e.g., 6, 8, 20).
 * @returns A human-readable dice roll string.
 *
 * @example
 * formatDiceRolls([4, 2, 6, 1], 6) // → "4d6: [4, 2, 6, 1]"
 * formatDiceRolls([17], 20)         // → "1d20: [17]"
 */
export function formatDiceRolls(rolls: number[], faces: number): string {
  return `${rolls.length}d${faces}: [${rolls.join(', ')}]`;
}

// =============================================================================
// SITUATIONAL CONTEXT LABELS
// =============================================================================

/**
 * English labels for `Modifier.situationalContext` values.
 * Used by ModifierBreakdownModal to display situational modifiers with readable
 * text instead of raw snake_case context keys.
 *
 * TYPE: `Record<string, { en: string }>` — every entry provides the EN baseline.
 * Other languages are loaded dynamically from locale files (e.g. fr.json) and
 * looked up via `ui('situation.' + ctx, lang)` in `formatSituationalContext()`.
 * FALLBACK: `formatSituationalContext()` pretty-prints the raw key if a context
 * key is not in this map (e.g., a homebrew situational context string).
 *
 * AUTHORING NOTE:
 *   When adding new `situationalContext` values to JSON rule files, add the
 *   corresponding entry here (with `en`) and a `situation.<key>` entry in
 *   each locale file to ensure it displays correctly in all supported languages.
 */
export const SITUATIONAL_LABELS: Readonly<Record<string, { en: string }>> = {
  // --- Spell / magic save contexts ---
  vs_enchantment:                        { en: 'vs. Enchantment'                  },
  vs_poison:                             { en: 'vs. Poison'                       },
  vs_spells_and_spell_like:              { en: 'vs. Spells & Spell-likes'         },
  vs_spells_and_spell_like_effects:      { en: 'vs. Spells & Spell-likes'         },
  vs_fear:                               { en: 'vs. Fear'                         },
  vs_charm_or_fear:                      { en: 'vs. Charm or Fear'                },
  vs_illusion:                           { en: 'vs. Illusion'                     },
  vs_mind_affecting_and_compulsion:      { en: 'vs. Mind-affecting & Compulsions' },
  vs_mind_affecting_compulsion:          { en: 'vs. Mind-affecting & Compulsions' },
  vs_compulsions_and_mind_affecting:     { en: 'vs. Compulsions & Mind-affecting' },
  vs_divination:                         { en: 'vs. Divination'                   },
  vs_power_resistance:                   { en: 'vs. Power Resistance'             },
  vs_powers_spells_and_spell_like_effects: { en: 'vs. Powers & Spells'            },

  // --- Alignment-based ---
  vs_evil:                               { en: 'vs. Evil'                         },
  vs_good:                               { en: 'vs. Good'                         },
  vs_chaotic:                            { en: 'vs. Chaos'                        },
  vs_lawful:                             { en: 'vs. Law'                          },

  // --- Creature type / race ---
  vs_giant:                              { en: 'vs. Giants'                       },
  vs_giant_type:                         { en: 'vs. Giant type'                   },
  vs_orc_goblinoid:                      { en: 'vs. Orcs & Goblinoids'            },
  vs_orcs_and_goblinoids:               { en: 'vs. Orcs & Goblinoids'            },
  vs_kobold_goblinoid:                   { en: 'vs. Kobolds & Goblinoids'         },
  vs_outsider:                           { en: 'vs. Outsiders'                    },
  vs_construct:                          { en: 'vs. Constructs'                   },
  vs_shapechanger:                       { en: 'vs. Shapechangers'                },
  vs_fey_spell_like:                     { en: 'vs. Fey spell-likes'              },
  vs_elemental:                          { en: 'vs. Elementals'                   },
  vs_aquatic_creature:                   { en: 'vs. Aquatic creatures'            },
  vs_forest_creature:                    { en: 'vs. Forest creatures'             },
  vs_desert_creature:                    { en: 'vs. Desert creatures'             },
  vs_hills_creature:                     { en: 'vs. Hills creatures'              },
  vs_marsh_creature:                     { en: 'vs. Marsh creatures'              },
  vs_mountain_creature:                  { en: 'vs. Mountain creatures'           },
  vs_plains_creature:                    { en: 'vs. Plains creatures'             },
  vs_underground_creature:               { en: 'vs. Underground creatures'        },
  vs_air_planar_creature:                { en: 'vs. Air planar creatures'         },
  vs_cavernous_plane_creature:           { en: 'vs. Cavernous planar creatures'   },
  vs_shifting_plane_creature:            { en: 'vs. Shifting planar creatures'    },
  vs_aligned_plane_creature:             { en: 'vs. Aligned planar creatures'     },

  // --- Elemental subtypes ---
  vs_fire_creature:                      { en: 'vs. Fire creatures'               },
  vs_fire_effects:                       { en: 'vs. Fire effects'                 },
  vs_fire_spells_and_effects:            { en: 'vs. Fire spells & effects'        },
  vs_fire_elementals:                    { en: 'vs. Fire elementals'              },
  vs_cold_creature:                      { en: 'vs. Cold creatures'               },
  vs_air_or_electricity_effects:         { en: 'vs. Air / Electricity'            },
  vs_earth_effects:                      { en: 'vs. Earth effects'                },
  vs_water_or_cold_effects:              { en: 'vs. Water / Cold effects'         },
  vs_air_elementals:                     { en: 'vs. Air elementals'               },
  vs_earth_elementals:                   { en: 'vs. Earth elementals'             },
  vs_water_elementals:                   { en: 'vs. Water elementals'             },
  vs_spider_poison:                      { en: 'vs. Spider poison'                },

  // --- Favored / designated enemy ---
  vs_designated_foe:                     { en: 'vs. Designated foe'              },
  vs_designated_target:                  { en: 'vs. Designated target'           },
  vs_favored_enemy_1:                    { en: 'vs. Favored Enemy 1'             },
  vs_favored_enemy_2:                    { en: 'vs. Favored Enemy 2'             },
  vs_favored_enemy_3:                    { en: 'vs. Favored Enemy 3'             },
  vs_favored_enemy_4:                    { en: 'vs. Favored Enemy 4'             },
  vs_favored_enemy_5:                    { en: 'vs. Favored Enemy 5'             },
  vs_sworn_enemy:                        { en: 'vs. Sworn Enemy'                 },

  // --- Terrain / environment ---
  vs_unusual_stonework:                  { en: 'vs. Unusual stonework'           },
  unusual_stonework:                     { en: 'Near unusual stonework'          },
  underwater:                            { en: 'While underwater'                },
  in_saltwater:                          { en: 'In saltwater'                    },
  in_bright_or_absolute_darkness:        { en: 'In bright light or darkness'     },
  outdoors_temperate:                    { en: 'In temperate outdoors'           },
  near_wall:                             { en: 'When adjacent to a wall'         },

  // --- Trap / stonework expertise ---
  vs_trap:                               { en: 'vs. Traps'                       },
  vs_traps:                              { en: 'vs. Traps'                       },
  appraise_stone_metal_items:            { en: 'Appraising stone/metal items'    },
  craft_stone_metal_items:               { en: 'Crafting stone/metal items'      },
  tracking:                              { en: 'While tracking'                  },

  // --- Combat maneuver contexts ---
  vs_bull_rush_or_trip:                  { en: 'vs. Bull Rush / Trip'            },
  vs_bull_rush_or_trip_on_ground:        { en: 'vs. Bull Rush / Trip (standing)' },
  vs_charge_attacks:                     { en: 'vs. Charge attacks'              },
  vs_ranged_attacks:                     { en: 'vs. Ranged attacks'              },
  vs_attacks_of_opportunity_on_movement: { en: 'vs. AoOs on movement'            },
  vs_attacks_of_opportunity_while_moving:{ en: 'vs. AoOs while moving'           },

  // --- Attack / damage conditions ---
  sneak_attack:                          { en: 'On sneak attack'                 },
  on_hit:                                { en: 'On hit'                          },
  on_hit_fire:                           { en: 'On hit (fire)'                   },
  on_hit_cold:                           { en: 'On hit (cold)'                   },
  on_hit_electricity:                    { en: 'On hit (electricity)'            },
  on_hit_nonlethal:                      { en: 'On hit (nonlethal)'              },
  target_flat_footed_or_flanked:         { en: 'vs. Flat-footed / flanked'       },
  vs_opponent_already_damaged_this_turn: { en: 'vs. Already-damaged opponent'    },
  puncture_touch_attack:                 { en: 'On puncture touch attack'        },
  shield_bash:                           { en: 'On shield bash'                  },

  // --- Fighting style / stance contexts ---
  casting_defensively_or_grappled:       { en: 'Casting defensively / grappled'  },
  fighting_defensively_or_total_defense: { en: 'While fighting defensively'      },
  wielding_two_weapons:                  { en: 'While two-weapon fighting'        },
  single_piercing_weapon_no_offhand:     { en: 'Single piercing weapon, no off-hand' },
  using_bow:                             { en: 'While using a bow'               },
  thrown_weapons_and_slings:             { en: 'With thrown weapons & slings'    },
  ranged_within_30ft:                    { en: 'Ranged within 30 ft.'            },
  unarmed_or_natural:                    { en: 'Unarmed / natural attacks'       },

  // --- Spell school / casting contexts ---
  when_casting_chaos_spells:             { en: 'When casting Chaos spells'       },
  when_casting_divination_spells:        { en: 'When casting Divination spells'  },
  when_casting_evil_spells:              { en: 'When casting Evil spells'        },
  when_casting_good_spells:              { en: 'When casting Good spells'        },
  when_casting_healing_spells:           { en: 'When casting Healing spells'     },
  when_casting_law_spells:               { en: 'When casting Law spells'         },

  // --- Psionic contexts ---
  becoming_psionically_focused:          { en: 'When becoming psionically focused' },
  manifesting_on_defensive_or_grappling: { en: 'When manifesting defensively'   },

  // --- Special item / class ability contexts ---
  wielded_by_paladin:                    { en: 'When wielded by a paladin'       },

  // --- Elemental form (wild shape / polymorph) ---
  air_elemental:                         { en: 'While air elemental'             },
  earth_elemental:                       { en: 'While earth elemental'           },
  fire_elemental:                        { en: 'While fire elemental'            },
  water_elemental:                       { en: 'While water elemental'           },
};

/**
 * Converts a machine-readable `situationalContext` string to a localized
 * short label in the requested language.
 *
 * LOOKUP ORDER:
 *   1. `SITUATIONAL_LABELS[ctx]` — known context key, returns the localized string.
 *   2. Fallback — pretty-prints the raw snake_case key (e.g., "my_custom_ctx" →
 *      "My Custom Ctx") when the context is not in the known-labels map.
 *      This handles homebrew situational context strings gracefully.
 *
 * @param ctx  - The raw `Modifier.situationalContext` value.
 * @param lang - The active UI language (defaults to `'en'`). Passed from
 *               `engine.settings.language` at the call site.
 * @returns A human-readable label in the requested language.
 */
export function formatSituationalContext(ctx: string, lang: string = 'en'): string {
  const entry = SITUATIONAL_LABELS[ctx];
  if (entry) {
    // For non-English, try the locale system (keys are registered as
    // "situation.<ctx>" in each locale file, e.g. fr.json).
    if (lang !== 'en') {
      const uiKey = `situation.${ctx}`;
      const translated = ui(uiKey, lang);
      // ui() returns the key itself when not found; a real translation differs.
      if (translated !== uiKey) return translated;
    }
    return entry.en;
  }
  // Fallback: prettify the raw key.
  // ORDER MATTERS: capitalize words first, then restore "Vs" → "vs." so the
  // common "vs_*" context key pattern always renders as lowercase "vs.".
  return ctx
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\bVs\b/g, 'vs.');
}



// =============================================================================
// DISPLAY PREVIEW HELPERS (keep arithmetic out of .svelte templates)
// =============================================================================

/**
 * Returns the effective ability score value when a temporary modifier is applied.
 *
 * PURPOSE (ARCHITECTURE.md §3):
 *   Components must not perform arithmetic in templates. The "temporary modifier"
 *   field in the Abilities tab is a UI-only preview (not persisted to the engine),
 *   so it cannot live in the engine. This helper keeps the addition out of the
 *   Svelte template while remaining testable as a pure function.
 *
 * @param baseTotal  - The engine's computed totalValue for the pipeline.
 * @param tempMod    - A locally entered temporary adjustment (can be negative).
 * @returns Preview total (baseTotal + tempMod).
 */
export function previewWithTempMod(baseTotal: number, tempMod: number): number {
  return baseTotal + tempMod;
}

/**
 * Isolates the base save bonus from a saving throw pipeline.
 *
 * D&D 3.5 FORMULA:
 *   baseSave = total save modifier − key ability modifier
 *
 * This appears in the SavingThrows component to show the class-progression
 * contribution separately from the ability modifier.
 *
 * PURPOSE (ARCHITECTURE.md §3):
 *   Subtraction of two engine-derived values must not appear inline in Svelte
 *   templates. This pure function makes the intent explicit and keeps arithmetic
 *   in a testable utility file.
 *
 * @param totalBonus  - The pipeline's totalBonus (total save modifier from all sources).
 * @param abilityMod  - The key ability's derived modifier (CON/DEX/WIS for Fort/Ref/Will).
 * @returns The base save bonus contributed by class progression and racial bonuses.
 */
export function computeBaseSave(totalBonus: number, abilityMod: number): number {
  return totalBonus - abilityMod;
}

/**
 * Clamps a ratio to a display percentage (0–100), avoiding division by zero.
 *
 * PURPOSE (ARCHITECTURE.md §3):
 *   Progress-bar fill percentage calculations (Math.min + division + multiplication)
 *   must not appear inline in Svelte templates. This helper centralises the pattern
 *   used by SkillsMatrix, PointBuyModal, Encumbrance, and PsionicItemCard.
 *
 * @param value  - Current value (e.g., points spent, current PP).
 * @param max    - Maximum value. Returns 0 if max ≤ 0.
 * @returns Percentage in [0, 100] inclusive.
 */
export function toDisplayPct(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(100, Math.max(0, (value / max) * 100));
}

// =============================================================================
// CHARACTER LEVEL UTILITY (keep D&D formula out of .svelte templates)
// =============================================================================

/**
 * Computes total character level from a classLevels record.
 *
 * D&D 3.5 RULE:
 *   Character level = sum of all individual class levels.
 *   Level Adjustment is NOT included (that is eclForXp).
 *
 * PURPOSE (ARCHITECTURE.md §3):
 *   CharacterCard and the GM Dashboard need the level for ARBITRARY characters
 *   from the vault (not the currently-loaded engine character). The engine only
 *   exposes `phase0_characterLevel` for the active character, so this utility
 *   function makes the formula available to those components without embedding
 *   `Object.values(classLevels).reduce()` inline in a `.svelte` file.
 *
 * @param classLevels - Record mapping class feature ID → level count.
 * @returns Total character level (integer ≥ 0).
 */
export function getCharacterLevel(classLevels: Record<string, number>): number {
  return Object.values(classLevels).reduce((sum: number, lvl: number) => sum + lvl, 0);
}
