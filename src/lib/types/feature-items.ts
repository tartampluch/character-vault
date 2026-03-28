/**
 * @file feature-items.ts
 * @description Item and weapon Feature types: OnCritDiceSpec and ItemFeature.
 *
 * Extracted from feature.ts. Import from 'feature.ts' (barrel) for backward compatibility.
 *
 * @see ARCHITECTURE.md sections 5 for full design specification.
 */

import type { ID } from './primitives';
import type { LocalizedString } from './i18n';
import type { Modifier } from './pipeline';
import type { Feature, ResourcePoolTemplate } from './feature-base';

// =============================================================================
// ON-CRIT DICE SPEC — Burst weapon bonus dice (Flaming Burst, Thundering, etc.)
// =============================================================================

/**
 * Specification for additional dice rolled ONLY on a confirmed critical hit.
 *
 * D&D 3.5 SRD — "BURST" WEAPON ABILITIES (Flaming Burst, Icy Burst, etc.):
 *   Burst weapons deal extra elemental / sonic dice on a confirmed crit in addition
 *   to their standard on-hit elemental damage. The count of burst dice scales with
 *   the weapon's crit multiplier when `scalesWithCritMultiplier === true`.
 *
 * This type is exported here (its canonical location in the type system) and
 * imported by `diceEngine.ts` for use as the `weaponOnCritDice` parameter of
 * `parseAndRoll()`. It is also used directly as the type of
 * `ItemFeature.weaponData.onCritDice`, keeping both definitions in sync.
 *
 * @see ItemFeature.weaponData.onCritDice — the field on weapon definitions
 * @see RollResult.onCritDiceRolled — where the roll result is stored
 * @see ARCHITECTURE.md section 4.9 — On-Crit Burst Dice mechanic reference
 */
export interface OnCritDiceSpec {
  /**
   * Base dice formula for a ×2 crit multiplier weapon.
   * Examples: "1d10" (Flaming/Icy/Shocking Burst), "1d8" (Thundering)
   * Parsed by the dice expression parser in `diceEngine.ts`.
   */
  baseDiceFormula: string;

  /**
   * The energy / damage type of these bonus dice.
   * Examples: "fire", "cold", "electricity", "sonic"
   * Used by the UI to display "1d10 fire (on crit)" in the roll breakdown.
   */
  damageType: string;

  /**
   * When `true`, multiply the base dice count by (critMultiplier − 1).
   *   ×2 crit → 1 × baseDiceFormula  (e.g., 1d10)
   *   ×3 crit → 2 × baseDiceFormula  (e.g., 2d10)
   *   ×4 crit → 3 × baseDiceFormula  (e.g., 3d10)
   * When `false`, always roll `baseDiceFormula` exactly once regardless of multiplier.
   * All SRD burst weapons use `true`.
   */
  scalesWithCritMultiplier: boolean;
}

// =============================================================================
// ITEM FEATURE — Equipment, weapons, armour, magic items
// =============================================================================

/**
 * A Feature that represents physical equipment.
 *
 * Extends `Feature` with item-specific metadata:
 *   - Equipment slot (which body slot the item occupies)
 *   - Weight and cost (for encumbrance calculation and wealth tracking)
 *   - Weapon data (damage dice, crit range, damage type)
 *   - Armour data (armour bonus, max DEX, check penalty)
 *
 * HOW ITEMS WORK IN THE ENGINE:
 *   Items are stored in the character's `activeFeatures` list as
 *   `ActiveFeatureInstance` objects. The `isActive` flag determines if the item
 *   is "equipped" (contributing its modifiers to the pipelines) or just "carried"
 *   (contributing weight but not modifiers).
 *
 * TWO-HANDED WEAPONS:
 *   Items with `equipmentSlot: "two_hands"` require BOTH main_hand AND off_hand slots.
 *   The GameEngine (Phase 3) enforces this during slot validation (Phase 13.3).
 *   Two-handed weapons also typically allow 1.5× STR modifier to damage — this is
 *   handled via a modifier with `value: "floor(@attributes.stat_strength.derivedModifier * 1.5)"`.
 *
 * MAGIC ITEMS:
 *   A magic sword is just an ItemFeature with weapon data AND a `grantedModifiers`
 *   array containing the enhancement bonus. No special type needed.
 *   Example: Longsword +2 has weaponData.damageDice = "1d8" and a modifier
 *     { type: "enhancement", targetId: "combatStats.attack_bonus", value: 2 }.
 */
export interface ItemFeature extends Feature {
  category: 'item';

  /**
   * The equipment slot this item occupies on the character's body.
   *
   * `"none"`: The item has no slot (e.g., a rope, a torch, a gem). It can be carried
   *   in unlimited quantities (weight still counts for encumbrance).
   * `"two_hands"`: The item requires BOTH main_hand AND off_hand slots. The engine
   *   blocks equipping if either hand already holds something.
   *
   * Exotic races may gain extra slots via pipeline modifiers (e.g., "slots.ring" = 4
   * for a race with extra ring slots). The slot enforcement logic (Phase 13.3) reads
   * the current pipeline value, not a hardcoded constant.
   */
  equipmentSlot?:
    | 'head'
    | 'eyes'
    | 'neck'
    | 'torso'
    | 'body'
    | 'waist'
    | 'shoulders'
    | 'arms'
    | 'hands'
    | 'ring'
    | 'feet'
    | 'main_hand'
    | 'off_hand'
    | 'two_hands'
    | 'none';

  /**
   * Item weight in POUNDS (the SRD reference unit).
   * Always stored in pounds, regardless of the active display language.
   * The UI converts to kg for metric-system languages using `UNIT_SYSTEM_CONFIG.metric.weightMultiplier`.
   */
  weightLbs: number;

  /**
   * Item cost in GOLD PIECES (the SRD reference unit).
   * Always stored in GP. The UI can display in different currency if needed.
   */
  costGp: number;

  /**
   * Item hardness (how resistant to damage — used in item damage rules).
   * Optional: not all items need this (worn equipment usually doesn't).
   */
  hardness?: number;

  /**
   * Maximum hit points of the item (for targeted attacks or "Sunder" maneuver).
   * Optional: most items in normal play don't track HP.
   */
  hpMax?: number;

  /**
   * Whether this item is consumed (removed from inventory) when used.
   *
   * D&D 3.5 CONTEXT:
   *   Potions, oils, scrolls, and one-shot wands are "single-use" consumables.
   *   When a character drinks a potion, the item disappears from their inventory
   *   and its magical effect begins. The effect persists until it expires naturally
   *   or the player manually dismisses it via the "Expire" button.
   *
   * ENGINE CONTRACT — TWO-PHASE CONSUMPTION:
   *   When `consumable: true` and the player clicks "Use" on this item:
   *   1. `GameEngine.consumeItem(instanceId)` is called.
   *   2. The engine creates a NEW ephemeral `ActiveFeatureInstance` carrying the
   *      item's `grantedModifiers` (so the buff becomes active on the character).
   *   3. The source item instance is REMOVED from `activeFeatures` (consumed).
   *   4. The ephemeral instance appears in `EphemeralEffectsPanel` with an
   *      "Expire" button to end the effect early.
   *
   * OILS vs POTIONS:
   *   Both are consumable. Potions affect the drinker; oils affect an object.
   *   Mechanically, both follow the same consumption pattern in the engine.
   *   The distinction is purely descriptive (in `label` and `description`).
   *
   * NON-CONSUMABLE ITEMS:
   *   Rings, amulets, armour — set `consumable: false` or omit this field entirely.
   *   Charged items (Ring of the Ram, wand with 50 charges) use `resourcePoolTemplates`
   *   instead. They are NOT consumable — they deplete a charge pool but stay in inventory.
   *
   * POTION DURATION HINT:
   *   The human-readable duration (e.g., "3 minutes", "10 rounds") comes from the
   *   item's `description` field. The engine does NOT enforce duration mechanically;
   *   the player is trusted to expire the effect at the right time.
   *
   * `durationHint`:
   *   Optional short string displayed in the EphemeralEffectsPanel timer badge.
   *   Example: "3 min", "10 rounds", "1 hour"
   *
   * @see GameEngine.consumeItem() — the consumption handler
   * @see GameEngine.expireEffect() — removes an expired ephemeral instance
   * @see ActiveFeatureInstance.ephemeral — marks the generated effect instance
    * @see EphemeralEffectsPanel.svelte — the "Active Effects" UI panel
    */
   consumable?: {
    /** Whether this item is consumed on use (true for potions, oils, single-shot scrolls). */
    isConsumable: true;
    /**
     * Human-readable duration displayed in the EphemeralEffectsPanel badge.
     * Purely cosmetic — the engine does NOT auto-expire after this duration.
     * Examples: "3 min", "10 rounds", "1 hour", "until discharged"
     */
     durationHint?: string;
    };

   /**
    * Intelligent item personality data — present only on items imbued with sentience.
    *
    * D&D 3.5 SRD — INTELLIGENT ITEMS:
    *   "Magic items sometimes have intelligence of their own. Magically imbued with
    *   sentience, these items think and feel the same way characters do and should
    *   be treated as NPCs. Intelligent items have extra abilities and sometimes
    *   extraordinary powers and special purposes. Only permanent magic items (as
    *   opposed to single-use items or those with charges) can be intelligent."
    *
    * ENGINE CONTRACT:
    *   This is a METADATA block. It has NO effect on the DAG computation pipeline.
    *   All mechanical effects of intelligent item powers (spells 3/day, skill ranks,
    *   luck bonuses, etc.) are modelled using existing engine primitives:
    *   - Lesser/greater powers → `resourcePoolTemplates` (per_day) + `activation`
    *   - Dedicated powers → `conditionNode` + `resourcePoolTemplates`
    *   - Skill ranks → `grantedModifiers type:"competence"` with value 10
    *   - Alignment penalties (mismatched wielder) → `conditionNode` on alignment tag
    *
    *   `intelligentItemData` provides the GM layer with:
    *   - The item's INT/WIS/CHA ability scores (needed to compute languages, Ego)
    *   - The Ego score (pre-computed, used for dominance Will DC = Ego)
    *   - The alignment of the item (for personality conflict logic)
    *   - Communication mode (empathy, speech, telepathy)
    *   - Senses range and type (30-ft vision, darkvision 60 ft, blindsense)
    *   - Language list (Common + 1 per INT bonus)
    *   - Special purpose (if any) and dedicated power description
    *
    * EGO SCORE FORMULA (from SRD):
    *   Ego = (sum of all enhancement bonus points)
    *       + (1 per lesser power)
    *       + (2 per greater power)
    *       + (4 if special purpose + dedicated power)
    *       + (1 if telepathic)
    *       + (1 if read languages)
    *       + (1 if read magic)
    *       + (INT bonus)
    *       + (WIS bonus)
    *       + (CHA bonus)
    *   where ability bonus = (score - 10) / 2 (rounded down)
    *
    *   Content authors COMPUTE Ego from the item's total profile and store it here.
    *   The engine does NOT recompute it dynamically — the stored value is canonical.
    *
    * EGO-BASED DOMINANCE (GM-layer rule, not engine-computed):
    *   When personality conflict occurs: owner makes Will save DC = Ego score.
    *   - Success: owner is dominant for 1 day (or until critical situation).
    *   - Failure: item is dominant — demands concessions; may resist commands.
    *   This is handled by the GM using the stored Ego score. No engine pipeline needed.
    *
    * NEGATIVE LEVELS FOR MISALIGNED WIELDERS:
    *   Items with Ego 1-19: 1 negative level for misaligned possessor.
    *   Items with Ego 20-29: 2 negative levels.
    *   Items with Ego 30+:   3 negative levels.
    *   These are modelled via `grantedModifiers` with `conditionNode` checking if the
    *   character's alignment matches `intelligentItemData.alignment`.
    *
    * CONTENT AUTHORING EXAMPLE — Intelligent +2 Longsword (Lawful Good, Ego 6):
    *   ```json
    *   {
    *     "intelligentItemData": {
    *       "intelligenceScore": 12,
    *       "wisdomScore": 12,
    *       "charismaScore": 10,
    *       "egoScore": 6,
    *       "alignment": "lawful_good",
    *       "communication": "empathy",
    *       "senses": { "visionFt": 30, "darkvisionFt": 0, "blindsense": false },
    *       "languages": ["Common", "Celestial"],
    *       "lesserPowers": 2,
    *       "greaterPowers": 0,
    *       "specialPurpose": null,
    *       "dedicatedPower": null
    *     }
    *   }
    *   ```
    *
    * @see ARCHITECTURE.md section 4.16 — Intelligent Item Data contract
    */
   intelligentItemData?: {
     /** Intelligence score of the item (10–19 per SRD distribution table). */
     intelligenceScore: number;
     /** Wisdom score of the item (10–19 per SRD distribution table). */
     wisdomScore: number;
     /** Charisma score of the item (10–19 per SRD distribution table). */
     charismaScore: number;
     /**
      * Pre-computed Ego score (see formula in doc block above).
      * Used as the Will DC for dominance checks (GM layer).
      * Items with Ego 20+ always attempt dominance; 30+ grant 3 negative levels.
      */
     egoScore: number;
     /**
      * The item's alignment (determines personality, purpose, and wielder restrictions).
      * Kebab-case SRD alignment identifiers.
      */
     alignment: 'lawful_good' | 'lawful_neutral' | 'lawful_evil'
                | 'neutral_good' | 'true_neutral' | 'neutral_evil'
                | 'chaotic_good' | 'chaotic_neutral' | 'chaotic_evil';
     /**
      * How the item communicates with its wielder.
      * - `"empathy"`: urges and emotional impressions only (no actual words).
      * - `"speech"`: speaks Common plus INT-bonus languages.
      * - `"telepathy"`: projects thoughts directly into wielder's mind.
      */
     communication: 'empathy' | 'speech' | 'telepathy';
     /**
      * Senses of the item. Vision and darkvision are measured in feet (0 = absent).
      * Blindsense is a boolean — present at the highest intelligence tiers.
      */
     senses: {
       /** Normal vision range in feet (0, 30, 60, or 120). */
       visionFt: 0 | 30 | 60 | 120;
       /** Darkvision range in feet (0 or 60 or 120). */
       darkvisionFt: 0 | 60 | 120;
       /** Whether the item has blindsense (highest-tier intelligence items only). */
       blindsense: boolean;
     };
     /**
      * Languages the item speaks (and can read if speech or telepathy tier).
      * Always includes Common; additional languages equal to INT bonus.
      */
     languages: string[];
     /** Number of lesser powers (1–4). Each contributes 1 Ego point. */
     lesserPowers: number;
     /** Number of greater powers (0–3). Each contributes 2 Ego points. */
     greaterPowers: number;
     /**
      * The item's special purpose (from SRD special purpose table), or null.
      * When set, the item has a dedicated power that operates ONLY in pursuit of this purpose.
      * A special purpose + dedicated power contributes 4 Ego points.
      * Examples: "Defeat arcane spellcasters", "Defend elves", "Slay undead"
      */
     specialPurpose: string | null;
     /**
      * Description of the dedicated power (from SRD dedicated power table), or null.
      * Only set when `specialPurpose` is non-null.
      * Examples: "Cast lightning bolt 10d6", "+2 luck on all attacks/saves/checks"
      */
     dedicatedPower: string | null;
   };

   /**
    * Cursed item removal prevention — present on cursed items that cannot be
    * voluntarily unequipped or removed without specific magical intervention.
    *
    * D&D 3.5 SRD — CURSED ITEM REMOVAL:
    *   Most specific cursed items carry language like:
    *   - "can be removed only with a remove curse spell"
    *   - "can be gotten rid of only by limited wish, wish, or miracle"
    *   - "cannot be removed by any means short of a wish/miracle"
    *   - "remains clasped around the victim's throat even after his death"
    *
    *   This is a hard mechanical constraint. Without this field, `removeFeature()`
    *   would allow any item to be removed unconditionally, which is incorrect for
    *   cursed items — the whole point of a curse is that you can't just take it off.
    *
    * ENGINE CONTRACT:
    *   When `removalPrevention.isCursed === true`:
    *   1. `removeFeature(instanceId)` checks this field and REFUSES to remove the
    *      instance, logging a warning instead.
    *   2. `tryRemoveCursedItem(instanceId, dispelMethod)` is the safe bypass path.
    *      It succeeds only if `dispelMethod` is in `removableBy`, and then calls
    *      the internal `removeFeature()` via a trusted path.
    *   3. The Inventory UI reads this field to:
    *      - Grey out the Remove/Unequip button with a tooltip explaining the curse.
    *      - Show which dispel methods can remove it.
    *
    * UI CONTRACT:
    *   `InventoryTab.svelte`:
    *   - If `removalPrevention.isCursed === true` → show a red "Cursed" badge.
    *   - The Unequip/Remove button is replaced with the tooltip:
    *     "Cannot be removed [until remove curse / wish / miracle is cast]."
    *   - Optionally show `removalPrevention.preventionNote` as a sub-tooltip.
    *
    * `isCursed`:
    *   Discriminant — always `true` when the block is present. Used to distinguish
    *   voluntary "cursed item" behavior from other removal-prevention concepts.
    *
    * `removableBy`:
    *   The list of in-game methods that CAN remove this item.
    *   The caller must pass one of these strings to `tryRemoveCursedItem()`.
    *   Standard SRD values:
    *   - `"remove_curse"`: Standard remove curse spell (cleric 3, bard 3, etc.)
    *   - `"limited_wish"`: Limited wish (requires access to 7th-level spell)
    *   - `"wish"`: Wish spell (9th level)
    *   - `"miracle"`: Miracle spell (9th level)
    *   Some items require combinations or ordered sequences — document those in
    *   `preventionNote` rather than modelling the order in the type system.
    *
    * `preventionNote`:
    *   Optional human-readable note for the UI. Explains special removal
    *   conditions that the `removableBy` array alone cannot express.
    *   Examples:
    *   - "Must be cast by a caster of at least 12th level"
    *   - "Remove curse followed by heal to restore ability scores"
    *   - "Requires neutralize poison THEN raise dead"
    *
    * CONTENT AUTHORING — Necklace of Strangulation (never drops off):
    *   ```json
    *   "removalPrevention": {
    *     "isCursed": true,
    *     "removableBy": ["limited_wish", "wish", "miracle"],
    *     "preventionNote": "Cannot be removed by any means short of limited wish, wish, or miracle. Remains clasped even after death."
    *   }
    *   ```
    *
    * CONTENT AUTHORING — Ring of Clumsiness (remove curse works):
    *   ```json
    *   "removalPrevention": {
    *     "isCursed": true,
    *     "removableBy": ["remove_curse", "wish", "miracle"]
    *   }
    *   ```
    *
    * @see GameEngine.removeFeature()         — blocked for cursed items
    * @see GameEngine.tryRemoveCursedItem()   — the bypass method
    * @see InventoryTab.svelte                — reads this to render the curse UI
    * @see ARCHITECTURE.md section 4.15      — Cursed Item Removal contract
    */
   removalPrevention?: {
     /** Discriminant — always true when this block is present. */
     isCursed: true;
     /**
      * Which in-game methods can remove this item.
      * At least one method must be provided.
      * Pass one of these strings to `GameEngine.tryRemoveCursedItem()`.
      */
     removableBy: ('remove_curse' | 'limited_wish' | 'wish' | 'miracle')[];
     /**
      * Optional human-readable note displayed to the player/GM.
      * Use for multi-step removal sequences or unusual conditions.
      */
     preventionNote?: string;
   };

   /**
    * Whether this item is a unique item that can only exist once in the world.
    *
    * D&D 3.5 SRD — MAJOR ARTIFACTS:
    *   "Major artifacts are unique items — only one of each such item exists.
    *   These are the most potent of magic items, capable of altering the balance
    *   of a campaign."
    *
    * ENGINE CONTRACT:
    *   This is a METADATA field. It has NO effect on the DAG computation pipeline,
    *   modifier stacking, dice engine, or ability activation flows. All artifact
    *   effects (modifiers, activated abilities, charges, weapon stats) are modelled
    *   using the same primitives as non-unique items.
    *
    *   The field exists exclusively for the GM Campaign Layer (Phase 21+) to:
    *   - Prevent duplicate instances of the same major artifact from being added
    *     to the campaign world inventory.
    *   - Display a special UI badge ("Unique — Only One Exists") in the item detail.
    *   - Warn the GM when trading, looting, or copying a unique item.
    *
    * CONTENT AUTHORING:
    *   - All major artifacts: `isUnique: true`
    *   - Minor artifacts: omit (they are NOT necessarily unique — "minor artifacts
    *     are not necessarily unique items")
    *   - All non-artifact items: omit
    *
    * @see artifactTier — whether this is a minor or major artifact
    */
   isUnique?: boolean;

   /**
    * Artifact tier — distinguishes minor artifacts from major artifacts.
    *
    * D&D 3.5 SRD:
    *   - **Minor artifacts**: "not necessarily unique items. Even so, they are
    *     magic items that no longer can be created, at least by common mortal means."
    *     Examples: Book of Infinite Spells, Deck of Many Things, Sphere of Annihilation.
    *   - **Major artifacts**: "unique items — only one of each such item exists."
    *     Examples: The Shadowstaff, The Shield of the Sun, The Orbs of Dragonkind.
    *
    * ENGINE CONTRACT:
    *   Metadata only — affects no engine computation.
    *   The `artifact` tag in `tags[]` identifies an item as an artifact;
    *   `artifactTier` further classifies it for display and campaign management.
    *
    * CONTENT AUTHORING:
    *   Artifacts carry tags: `["item", "artifact", "magic_item"]`.
    *   Major artifacts additionally have `isUnique: true`.
    *   `artifactTier` should always be set when `tags` includes `"artifact"`.
    */
   artifactTier?: 'minor' | 'major';

   /**
    * Scroll spell list — present ONLY on scrolls.
    *
    * D&D 3.5 SRD — SCROLL MECHANICS:
    *   "A scroll is a spell (or collection of spells) that has been stored in
    *   written form. A spell on a scroll can be used only once. The writing
    *   vanishes from the scroll when the spell is activated."
    *
    *   Key rules that distinguish scrolls from wands and staves:
    *
    *   1. SPELL TYPE RESTRICTION (unique to scrolls — not wands or staves):
    *      "Arcane spellcasters (wizards, sorcerers, and bards) can only use
    *      scrolls containing arcane spells, and divine spellcasters (clerics,
    *      druids, paladins, and rangers) can only use scrolls containing divine
    *      spells."
    *      → `spellType: 'arcane' | 'divine'` is REQUIRED on each entry.
    *
    *   2. FIXED CASTER LEVEL (same as wands — NOT the wielder's CL):
    *      The scroll uses the original scribe's CL. The SRD's standard CL per
    *      spell level is: CL = 2 × spellLevel − 1 (minimum CL to cast that level).
    *      → `casterLevel` is REQUIRED per entry.
    *
    *   3. CL CHECK WHEN WIELDER'S CL < SCROLL'S CL:
    *      If the user's own CL is lower than the scroll's CL, she must make a
    *      caster level check (DC = scroll's CL + 1) to cast the spell successfully.
    *      On failure: DC 5 Wisdom save or mishap.
    *      → The CastingPanel computes: `checkRequired = wielder.casterLevel < entry.casterLevel`
    *      → `checkDC = entry.casterLevel + 1`
    *      `spellLevel` is REQUIRED (not optional) to compute this DC.
    *
    *   4. MULTI-SPELL (same as staves — unlike wands which hold only one):
    *      A scroll can hold 1d3 (minor), 1d4 (medium), or 1d6 (major) spells.
    *      The market table lists individual single-spell scrolls; authored items
    *      will each have `scrollSpells.length === 1`.
    *      → `scrollSpells` is an ARRAY (not a single object like `wandSpell`).
    *
    *   5. SINGLE-USE CONSUMABLE (combined with `consumable.isConsumable: true`):
    *      Unlike wands (50 charges) and staves (50 charges), a scroll spell is
    *      destroyed when cast. Model as `consumable: { isConsumable: true }`.
    *      No `resourcePoolTemplates` needed — the scroll is just used and gone.
    *
    * WHY A DEDICATED FIELD (not reusing `wandSpell` or `staffSpells`):
    *   - `wandSpell`: single object, no `spellType`, not consumed permanently
    *   - `staffSpells`: has `chargeCost` (irrelevant for scrolls), no `spellType`,
    *     uses wielder's CL, not consumed permanently
    *   - `scrollSpells`: array, `spellType` required, `spellLevel` required for
    *     CL check DC, uses item's fixed CL, combined with `consumable`
    *
    * CONTENT AUTHORING — Scroll of Fireball example:
    *   ```json
    *   {
    *     "id": "item_scroll_arcane_fireball",
    *     "consumable": { "isConsumable": true },
    *     "scrollSpells": [{
    *       "spellId": "spell_fireball",
    *       "casterLevel": 5,
    *       "spellLevel": 3,
    *       "spellType": "arcane"
    *     }]
    *   }
    *   ```
    *   Note: no `resourcePoolTemplates` — the scroll is consumed on use.
    *
    * CONTENT AUTHORING — Standard CL per Spell Level (SRD defaults):
    *   | Spell Level | Min CL | Cost Formula (CL × SL × 25 gp) | Price |
    *   |-------------|--------|----------------------------------|-------|
    *   | 0th         | 1      | special: 12.5 gp                | 12.5 gp |
    *   | 1st         | 1      | 1 × 1 × 25                      | 25 gp |
    *   | 2nd         | 3      | 3 × 2 × 25                      | 150 gp |
    *   | 3rd         | 5      | 5 × 3 × 25                      | 375 gp |
    *   | 4th         | 7      | 7 × 4 × 25                      | 700 gp |
    *   | 5th         | 9      | 9 × 5 × 25                      | 1,125 gp |
    *   | 6th         | 11     | 11 × 6 × 25                     | 1,650 gp |
    *   | 7th         | 13     | 13 × 7 × 25                     | 2,275 gp |
    *   | 8th         | 15     | 15 × 8 × 25                     | 3,000 gp |
    *   | 9th         | 17     | 17 × 9 × 25                     | 3,825 gp |
    *
    * CASTING PANEL CONTRACT:
    *   When the player activates a scroll spell:
    *   1. Read `scrollSpells[i].spellType` — validate it matches wielder's type.
    *   2. Validate spell is on wielder's class list (UMD check if not).
    *   3. If `wielder.casterLevel < entry.casterLevel`:
    *        → CL check required: `checkDC = entry.casterLevel + 1`
    *        → On failure: DC 5 Wisdom check or mishap.
    *   4. Remove `scrollSpells[i]` from the scroll (or consume entire item if array
    *      is now empty, via `engine.consumeItem()` or `engine.expireEffect()`).
    *   5. Apply the spell using `entry.casterLevel` as the CL.
    *   6. Save DC = `10 + entry.spellLevel + abilityModifier`.
    *
    * @see wandSpell            — single-spell, item CL, wand-specific
    * @see staffSpells          — multi-spell, wielder CL, charge-based
    * @see consumable           — MUST be paired with `{ isConsumable: true }`
    * @see ARCHITECTURE.md section 4.14 — Scroll Spell List contract
    */
   scrollSpells?: {
     /**
      * The ID of the spell on the scroll.
      * Matches a Feature with `category: "magic"` in the DataLoader.
      */
     spellId: ID;
     /**
      * The scroll's fixed caster level.
      * Unlike staves, scrolls use this CL regardless of the wielder's level.
      * Standard SRD values: CL 1/1/3/5/7/9/11/13/15/17 for levels 0–9.
      */
     casterLevel: number;
     /**
      * The spell's level on this scroll (REQUIRED — not optional).
      * Needed to compute the CL check DC: `checkDC = casterLevel + 1`
      * and the save DC: `10 + spellLevel + abilityModifier`.
      * Also enforces the 4th-level-maximum rule (scrolls can hold any level,
      * but the CastingPanel should validate the spell exists at the intended level).
      */
     spellLevel: number;
     /**
      * Whether this spell is arcane or divine.
      *
      * This is a HARD class-restriction requirement unique to scrolls.
      * Arcane scrolls → wizards, sorcerers, bards only.
      * Divine scrolls → clerics, druids, paladins, rangers only.
      *
      * The CastingPanel checks `spellType` against the wielder's class before
      * allowing activation. Activating the wrong type requires a Use Magic Device
      * check (DC = 20 + spell level) — future enhancement.
      */
     spellType: 'arcane' | 'divine';
   }[];

   /**
    * Staff spell list — present only on staves. Each entry describes one spell
    * available from the staff and the number of charges it costs to cast.
    *
    * D&D 3.5 SRD — STAFF MECHANICS:
    *   "A staff has 50 charges when created." Each spell stored in a staff can be
    *   activated via spell trigger (standard action). The charge cost varies by
    *   spell: common staffs use 1–3 charges; the Staff of Life uses 5 charges for
    *   Resurrection; the Staff of Woodlands uses 4 for Animate Plants.
    *
    *   Key rules:
    *   - Staffs use the WIELDER'S caster level (if higher than the staff's own CL)
    *     and the wielder's ability modifier to set saving throw DCs.
    *   - A staff can hold spells of any level (unlike wands which max at 4th).
    *   - Minimum CL for a staff is 8th.
    *   - Some staves also function as +N weapons after charges are depleted
    *     (modelled separately via `weaponData` and `grantedModifiers`).
    *
    * ENGINE CONTRACT — CHARGE DEDUCTION:
    *   When the player activates a staff spell from `CastingPanel.svelte`:
    *   1. Look up `staffSpells` on the equipped staff's `ItemFeature`.
    *   2. Find the entry matching the selected spell.
    *   3. Check `instance.itemResourcePools['charges']` >= entry.chargeCost.
    *   4. Call `engine.spendItemPoolCharge(instanceId, 'charges', entry.chargeCost)`.
    *   5. Apply the spell effect (using the wielder's caster level and ability mod).
    *
    *   `spendItemPoolCharge()` already accepts a variable `amount` parameter, so
    *   no engine computation change is needed for variable charge costs.
    *
    * THE `spellLevel` FIELD (heightened spells):
    *   The Staff of Power stores fireball, ray of enfeeblement, and lightning bolt
    *   at a heightened level (5th). When the CastingPanel resolves the spell, it
    *   should use this effective level for DC and other level-dependent effects,
    *   overriding the spell's base level. Absent for non-heightened spells.
    *
    * CONTENT AUTHORING — Staff of Healing example:
    *   ```json
    *   "staffSpells": [
    *     { "spellId": "spell_lesser_restoration",  "chargeCost": 1 },
    *     { "spellId": "spell_cure_serious_wounds", "chargeCost": 1 },
    *     { "spellId": "spell_remove_blindness_deafness", "chargeCost": 2 },
    *     { "spellId": "spell_remove_disease",      "chargeCost": 3 }
    *   ],
    *   "resourcePoolTemplates": [{
    *     "poolId": "charges",
    *     "label": { "en": "Staff Charges (50)", "fr": "Charges de bâton (50)" },
    *     "maxPipelineId": "combatStats.staff_charges_max",
    *     "defaultCurrent": 50,
    *     "resetCondition": "never"
    *   }]
    *   ```
    *
    * @see CastingPanel.svelte              — reads this field to show spell options
    * @see GameEngine.spendItemPoolCharge() — deducts chargeCost charges
    * @see resourcePoolTemplates            — tracks the charge pool separately
    * @see ARCHITECTURE.md section 4.12    — Staff Spell List contract
    */
   staffSpells?: {
     /**
      * The ID of the spell stored in the staff.
      * Must match a Feature entry with `category: "magic"` in the DataLoader.
      * Example: "spell_fireball", "spell_charm_monster"
      */
     spellId: ID;
     /**
      * Number of charges consumed to cast this spell from the staff.
      * Range: 1 (cheap spell) to 5 (resurrection on Staff of Life).
      * The SRD uses 1–4 for standard staves, with 5 only for Resurrection.
      */
     chargeCost: 1 | 2 | 3 | 4 | 5;
     /**
      * Effective spell level for this entry, if the spell is heightened.
      *
      * ONLY set when the staff stores a spell at a DIFFERENT level than its
      * base spell level. Currently used only by the Staff of Power, which
      * stores fireball (base 3rd) at 5th level, ray of enfeeblement (base 1st)
      * at 5th level, and lightning bolt (base 3rd) at 5th level.
      *
      * When present, the CastingPanel uses THIS value instead of the spell's
      * base level to determine: save DCs, damage dice count, and enemy SR checks.
      *
      * Absent for: all non-heightened spells (the vast majority of staff spells).
      */
     spellLevel?: number;
   }[];

   /**
    * Wand spell definition — present ONLY on wands.
    *
    * D&D 3.5 SRD — WAND MECHANICS:
    *   "A wand is a thin baton that contains a single spell of 4th level or lower.
    *   Each wand has 50 charges when created, and each charge expended allows the
    *   user to use the wand's spell one time. A wand that runs out of charges is
    *   just a stick."
    *
    *   Key rules:
    *   - Wands always contain EXACTLY ONE spell (not a menu like staves).
    *   - Each activation costs EXACTLY ONE charge (no variation).
    *   - Wands use the item's OWN FIXED CASTER LEVEL, not the wielder's.
    *     This is critical: a Wand of Magic Missile (CL 1) fires 1 missile;
    *     a Wand of Magic Missile (CL 9) fires 5 missiles. Same table entry,
    *     very different effect.
    *   - Some wands store heightened spells (e.g., "Charm person, heightened
    *     (3rd-level spell)" = charm person treated as a 3rd-level spell for
    *     DC and other level-dependent calculations).
    *   - Wands can only hold spells up to 4th level.
    *   - All wands in the table use the minimum caster level for the spell's
    *     class level, EXCEPT for explicitly higher-CL variants
    *     (e.g., Magic Missile appears at CL 1, CL 3, CL 5, CL 7, CL 9).
    *
    * WHY A DEDICATED FIELD (not reusing `staffSpells`):
    *   1. Wands have exactly ONE spell — not an array.
    *   2. The charge cost is always 1 — no `chargeCost` field needed.
    *   3. Wands use their OWN FIXED `casterLevel` — staves use the wielder's CL.
    *      The item's CL is data that must be stored explicitly (cannot be inferred
    *      from price, since the SRD table shows prices at fixed CLs).
    *   4. The CastingPanel reads `wandSpell.casterLevel` to compute damage dice,
    *      range, duration, and area — critical for variants of the same spell.
    *
    * CONTENT AUTHORING — Wand of Magic Missile (CL 9) example:
    *   ```json
    *   {
    *     "id": "item_wand_magic_missile_cl9",
    *     "wandSpell": {
    *       "spellId": "spell_magic_missile",
    *       "casterLevel": 9
    *     },
    *     "resourcePoolTemplates": [{
    *       "poolId": "charges",
    *       "label": { "en": "Wand Charges (50)", "fr": "Charges de baguette (50)" },
    *       "maxPipelineId": "combatStats.wand_charges_max",
    *       "defaultCurrent": 50,
    *       "resetCondition": "never"
    *     }]
    *   }
    *   ```
    *
    * HEIGHTENED WANDS:
    *   The `spellLevel` field overrides the spell's effective level for DC
    *   and restriction purposes. Only needed for wands where the SRD
    *   explicitly stores the spell at a higher level:
    *   - "Charm person, heightened (3rd-level spell)" → `spellLevel: 3`
    *   - "Hold person, heightened (4th level)"       → `spellLevel: 4`
    *   - "Ray of enfeeblement, heightened (4th level)"→ `spellLevel: 4`
    *   - "Suggestion, heightened (4th level)"        → `spellLevel: 4`
    *
    * CASTING PANEL CONTRACT:
    *   When the player activates a wand:
    *   1. Read `wandSpell.spellId` to identify the spell to cast.
    *   2. Use `wandSpell.casterLevel` as the CL for all level-dependent effects.
    *   3. If `wandSpell.spellLevel` is set, use it as the effective spell level
    *      (for DC = 10 + spellLevel + ability modifier).
    *   4. Validate `instance.itemResourcePools['charges'] >= 1`.
    *   5. Call `engine.spendItemPoolCharge(instanceId, 'charges', 1)`.
    *   6. Apply the spell effect with the wand's fixed CL.
    *
    * @see staffSpells             — the analogous field for staves (array of spells)
    * @see resourcePoolTemplates   — tracks the 50-charge pool separately
    * @see ARCHITECTURE.md section 4.13 — Wand Spell contract
    */
   wandSpell?: {
     /**
      * The ID of the spell stored in the wand.
      * Must match a Feature with `category: "magic"` in the DataLoader.
      * Example: "spell_magic_missile", "spell_fireball"
      */
     spellId: ID;
     /**
      * The wand's fixed caster level.
      *
      * Wands use their own CL regardless of the wielder's caster level.
      * This distinguishes variants like Wand of Magic Missile at CL 1
      * (1 missile) vs. CL 9 (5 missiles).
      *
      * Minimum CL = the minimum caster level to cast the spell
      * (e.g., fireball level 3 → minimum CL 5).
      */
     casterLevel: number;
     /**
      * Effective spell level if the wand holds a heightened spell.
      *
      * Only present for the 4 heightened wands in the SRD table:
      * - Charm person heightened (3rd-level spell):  `spellLevel: 3`
      * - Hold person heightened (4th level):          `spellLevel: 4`
      * - Ray of enfeeblement heightened (4th level):  `spellLevel: 4`
      * - Suggestion heightened (4th level):           `spellLevel: 4`
      *
      * When absent, use the spell's base level for DC calculations.
      */
     spellLevel?: number;
   };

   /**
    * Metamagic rod effect — present only on rods (and similar items) that grant
    * the ability to apply a metamagic feat to a spell without occupying a higher
    * spell slot.
    *
    * D&D 3.5 SRD — METAMAGIC RODS:
    *   "Metamagic rods hold the essence of a metamagic feat but do not change the
    *   spell slot of the altered spell. A caster may only use one metamagic rod on
    *   any given spell."
    *
    *   Each rod grants 3 uses per day (tracked via `resourcePoolTemplates`).
    *   Lesser rods work on spells up to 3rd level; normal rods up to 6th level;
    *   greater rods up to 9th level.
    *
    * ENGINE CONTRACT:
    *   This field is the **type declaration** for the metamagic effect. The actual
    *   usage limit (3/day) is tracked via `resourcePoolTemplates` with
    *   `resetCondition: "per_day"`.
    *
    *   The `CastingPanel.svelte` reads `metamagicEffect` on the character's equipped
    *   rods to offer a metamagic upgrade option at the moment of casting. If a rod
    *   with matching `feat` is equipped and the player selects it, the panel:
    *   1. Checks that the spell's level is ≤ `maxSpellLevel`.
    *   2. Decrements the rod's ResourcePool charge by 1.
    *   3. Applies the metamagic effect to the cast spell (e.g., doubles variable
    *      numeric effects for Empower, extends duration for Extend, etc.).
    *   4. The spell slot used is NOT increased (unlike the feat itself).
    *
    * `feat`:
    *   The SRD metamagic feat identifier. Maps to a known feat ID in the data.
    *   Valid values (all SRD metamagic rods):
    *     - "feat_empower_spell"   — All variable numeric effects × 1.5
    *     - "feat_enlarge_spell"   — Doubles range
    *     - "feat_extend_spell"    — Doubles duration
    *     - "feat_maximize_spell"  — All variable numeric effects are maximum
    *     - "feat_quicken_spell"   — Free action casting (once/round max)
    *     - "feat_silent_spell"    — No verbal component required
    *
    * `maxSpellLevel`:
    *   Maximum spell level this rod can affect.
    *   - Lesser:  3 (rods labeled "lesser")
    *   - Normal:  6 (standard rods)
    *   - Greater: 9 (rods labeled "greater")
    *
    * CONTENT AUTHORING:
    *   A lesser metamagic empower rod is authored as:
    *   ```json
    *   {
    *     "id": "item_rod_metamagic_empower_lesser",
    *     "metamagicEffect": {
    *       "feat": "feat_empower_spell",
    *       "maxSpellLevel": 3
    *     },
    *     "resourcePoolTemplates": [{
    *       "poolId": "metamagic_uses",
    *       "resetCondition": "per_day",
    *       "defaultCurrent": 3
    *     }]
    *   }
    *   ```
    *
    * @see CastingPanel.svelte       — reads this field to offer metamagic option
    * @see resourcePoolTemplates     — tracks the 3 uses/day separately
    * @see ARCHITECTURE.md section 4.11 — Metamagic Rod contract
    */
   metamagicEffect?: {
     /**
      * The feat this rod applies at no spell slot cost.
      * One of the 6 SRD metamagic feats available on rods.
      */
     feat: 'feat_empower_spell'
           | 'feat_enlarge_spell'
           | 'feat_extend_spell'
           | 'feat_maximize_spell'
           | 'feat_quicken_spell'
           | 'feat_silent_spell';
     /**
      * Maximum spell level this rod can affect.
      * Lesser = 3, Normal = 6, Greater = 9.
      */
     maxSpellLevel: 3 | 6 | 9;
   };

   /**
    * Weapon-specific data. Present only for weapons.
    *
    * Note: A weapon's attack and damage MODIFIERS (like +2 enhancement) are stored
    * in `grantedModifiers`. This `weaponData` block holds the STATIC properties
    * that define the weapon's base capabilities.
    */
   weaponData?: {
    /**
     * How the weapon is wielded relative to character size.
     * "light": One-handed. Can be used off-hand without penalty.
     * "one_handed": Standard one-hand weapon. 2-handed grants 1.5× STR mod.
     * "two_handed": Always requires both hands (different from `equipmentSlot: "two_hands"` —
     *   this describes wielding category for the purpose of damage/feats; slot binding
     *   is handled by `equipmentSlot`).
     */
     wieldCategory:
       | 'light'       // One-handed; can be used off-hand without penalty
       | 'one_handed'  // Standard one-hand weapon; 2-handed grants 1.5× STR mod
       | 'two_handed'  // Always requires both hands (large weapons)
       | 'double';     // Has two ends — each end can be attacked with independently.
                       // D&D 3.5 SRD: "A character can fight with both ends of a double weapon
                       // as if fighting with two weapons, but incurs all TWF attack penalties."
                       // The PRIMARY end uses damageDice/damageType/critRange/critMultiplier.
                       // The SECONDARY end uses the `secondaryWeaponData` field below.

     /**
      * Base damage dice expression (PRIMARY end for double weapons).
      * Examples: "1d4", "1d8", "2d6"
      * Actual damage formula appended by the engine: "1d8 + @attributes.stat_strength.derivedModifier"
      */
     damageDice: string;

    /**
     * Array of damage types dealt.
     * Examples: ["slashing"], ["piercing", "slashing"], ["bludgeoning", "magic"]
     * Used for DR type-testing and spell effect filtering.
     */
    damageType: string[];

    /**
     * Critical threat range as a string.
     * Examples: "20" (most weapons), "19-20" (longsword), "18-20" (scimitar, keen)
     * The engine parses this to determine if a natural roll falls in the crit range.
     */
    critRange: string;

    /**
     * Critical hit damage multiplier.
     * Examples: 2 (most weapons), 3 (greatsword, battleaxe), 4 (scythe)
     */
    critMultiplier: number;

    /**
     * Natural reach of the weapon in FEET.
     * 5 = standard melee (not a reach weapon).
     * 10 = reach weapon (halberd, longspear, etc.).
     * Exotic creatures or abilities may extend this via pipeline modifiers.
     */
    reachFt: number;

     /**
      * Range increment in FEET for ranged weapons. Absent for melee weapons.
      * Examples: 30 (shortbow first range increment), 60 (longbow), 10 (throwing axe)
      * Each additional range increment beyond the first adds -2 to attack rolls.
      */
     rangeIncrementFt?: number;

     /**
      * Secondary end data for double weapons (`wieldCategory: "double"`).
      *
      * D&D 3.5 SRD: Double weapons (quarterstaff, dire flail, two-bladed sword, etc.)
      * have two attack ends. The primary end is described by the top-level
      * `damageDice`/`damageType`/`critRange`/`critMultiplier` fields.
      * The secondary end is described here when it differs.
      *
      * CASES:
      *   - Quarterstaff: both ends identical (1d6 bludgeoning, ×2). Secondary may be omitted.
      *   - Two-bladed sword: primary 1d8 slashing (19–20/×2), secondary 1d6 piercing (19–20/×2).
      *   - Dwarven urgrosh: primary 1d8 piercing ×3, secondary 1d6 slashing ×3.
      *   - Gnome hooked hammer: primary 1d8 bludgeoning ×3, secondary 1d6 piercing ×4.
      *   - Orc double axe: primary 1d8 slashing ×3, secondary 1d8 slashing ×3.
      *   - Dire flail: primary 1d8 bludgeoning ×2, secondary 1d8 bludgeoning ×2.
      *
      * When absent: the secondary end is identical to the primary end.
      */
     secondaryWeaponData?: {
       damageDice: string;
       damageType: string[];
       critRange: string;
       critMultiplier: number;
     };

     /**
      * Additional dice rolled ONLY on a confirmed critical hit (Enhancement E-7).
     *
     * D&D 3.5 SRD — "BURST" WEAPON ABILITIES:
     *   Flaming Burst, Icy Burst, and Shocking Burst weapons deal their base elemental
     *   damage on every hit (1d6, from the Flaming/Frost/Shock property), PLUS extra
     *   dice on a confirmed critical hit only:
     *     - ×2 crit multiplier:  +1d10 of the element
     *     - ×3 crit multiplier:  +2d10 of the element
     *     - ×4 crit multiplier:  +3d10 of the element
     *
     *   Thundering similarly adds 1d8/2d8/3d8 sonic damage on crits.
     *
     *   The SRD explicitly states: "Additional dice of damage are NOT multiplied when
     *   the attacker scores a critical hit." This means these burst dice are added ONCE
     *   on a crit, not multiplied by critMultiplier — even though they only trigger on crits.
     *
     * CONTENT AUTHORING:
     *   Set `baseDiceFormula` to the ×2 value (e.g., "1d10" for Flaming Burst).
     *   Set `scalesWithCritMultiplier: true` to indicate the engine should scale the
     *   formula by (critMultiplier - 1):
     *     - critMultiplier = 2 → 1 × baseDiceFormula  (e.g., "1d10")
     *     - critMultiplier = 3 → 2 × baseDiceFormula  (e.g., "2d10")
     *     - critMultiplier = 4 → 3 × baseDiceFormula  (e.g., "3d10")
     *   Set `scalesWithCritMultiplier: false` for fixed crit bonus dice (rare, non-SRD).
     *
     *   `damageType`: the energy type of the on-crit bonus dice.
     *   Examples: "fire" (Flaming Burst), "cold" (Icy Burst), "electricity" (Shocking Burst),
     *             "sonic" (Thundering).
     *
     * ENGINE CONTRACT:
     *   `parseAndRoll()` accepts `weaponOnCritDice?: OnCritDiceSpec` as a 9th parameter.
     *   When `isConfirmedCrit === true` AND `weaponOnCritDice` is provided:
     *   1. Compute the actual dice formula:
     *        if scalesWithCritMultiplier: diceCount = critMultiplier - 1; formula = `${diceCount}d${faces}`
     *        else: use baseDiceFormula directly
     *   2. Roll the formula using the same injected RNG.
     *   3. Store the result in `RollResult.onCritDiceRolled`.
     *   4. Add the total to `RollResult.finalTotal` (the burst damage is part of the total).
     *
     *   If Fortification negates the crit (`fortification.critNegated === true`), the
     *   on-crit dice are NOT rolled (Fortification negates ALL crit effects).
     *
     * NOTE: This field is on `weaponData`, not on `grantedModifiers`, because it is a
     * dice-roll side-effect rather than a static pipeline modifier. The combat system
     * passes the value when constructing the roll call for a confirmed crit.
     *
     * @see ARCHITECTURE.md section 4.9 — On-Crit Burst Dice mechanic
     * @see RollResult.onCritDiceRolled — the result field
     * @see parseAndRoll() — 9th parameter: weaponOnCritDice
     */
     /**
      * On-crit burst dice spec. Uses the exported `OnCritDiceSpec` type (canonical
      * definition at the top of this file) rather than an inline anonymous type so
      * that `diceEngine.ts` can import and reuse the same type for `parseAndRoll()`.
      *
      * @see OnCritDiceSpec — the exported type definition
      */
     onCritDice?: OnCritDiceSpec;
  };

  /**
   * Armour/shield-specific data. Present only for worn protective equipment.
   *
   * Note: The actual AC bonus modifier (e.g., +6 for breastplate) is stored in
   * `grantedModifiers` with `type: "armor"` or `type: "shield"`.
   * This `armorData` block holds additional armour-specific metadata.
   */
  armorData?: {
    /**
     * The armour bonus to AC (matching the modifier value in `grantedModifiers`).
     * Stored here for easy UI display and for computing touch/flat-footed AC correctly.
     */
    armorBonus: number;

    /**
     * Maximum Dexterity bonus the character can apply to AC while wearing this armour.
     * Examples: Full plate = 1, Breastplate = 3, Leather = 6, Mage Armor (spell) = infinity.
     * The engine applies this cap during DAG Phase 3 AC calculation.
     */
    maxDex: number;

    /**
     * Armour check penalty applied to physical skills (Climb, Jump, Swim, etc.).
     * Examples: Full plate = -6, Chain shirt = -2, Leather = 0.
     * The engine injects this as a modifier during DAG Phase 4 for skills
     * with `appliesArmorCheckPenalty: true`.
     */
    armorCheckPenalty: number;

    /**
     * Arcane spell failure chance as a PERCENTAGE.
     * Examples: Full plate = 35, Chain shirt = 20, Cloth/no armour = 0.
     * Used by the spellcasting UI to warn arcane casters about failure chance.
     */
    arcaneSpellFailure: number;
  };

  /**
   * Psionic item-specific data block.
   *
   * Present ONLY for the five psionic item types:
   *   cognizance_crystal | dorje | power_stone | psicrown | psionic_tattoo
   *
   * For all non-psionic items (weapons, armour, standard magic items), this
   * field is `undefined`.
   *
   * The `psionicItemType` discriminant tells the UI and Dice Engine which
   * sub-block of data is relevant. Only the fields applicable to the declared
   * type are populated — unused fields are `undefined`.
   *
   * EACH TYPE'S CANONICAL DATA:
   * ─────────────────────────────────────────────────────────────────────────
   *
   * COGNIZANCE CRYSTAL (`"cognizance_crystal"`):
   *   Stores power points that any psionic character can draw on (like an
   *   external PP battery). Can be recharged by the owner at 1 PP per 1 PP.
   *   PP maximum is always ODD and between 1–17 (SRD table).
   *   Fields used: `storedPP`, `maxPP`, `attuned`
   *
   * DORJE (`"dorje"`):
   *   A single-power wand analogue. Created with 50 charges; each charge
   *   manifests the stored power once. The user needs the power on their
   *   class list. Powers are NOT augmented unless the creator built the dorje
   *   at a higher ML (pre-augmented, locked in at creation).
   *   Fields used: `powerStored`, `charges`, `manifesterLevel`
   *
   * POWER STONE (`"power_stone"`):
   *   A scroll analogue holding 1–6 distinct powers (separate imprints).
   *   Each power is used independently (single use per power = "flushed").
   *   Brainburn risk if user ML < stone ML. Stone glows brighter with more
   *   or higher-level powers.
   *   Fields used: `powersImprinted`
   *
   * PSICROWN (`"psicrown"`):
   *   A headband containing a fixed set of powers AND a dedicated PP pool
   *   (50 × manifester level when created). Powers can be augmented using
   *   the psicrown's own PP (NOT the user's personal PP). The user cannot
   *   supplement with their own PP.
   *   Fields used: `storedPP`, `maxPP`, `powersKnown`, `manifesterLevel`
   *
   * PSIONIC TATTOO (`"psionic_tattoo"`):
   *   A single-use power inscribed as a body tattoo. Only 1st–3rd level
   *   powers. Maximum 20 tattoos on one body at once (exceeding 20 causes
   *   all to simultaneously activate). Fades after use.
   *   Fields used: `powerStored`, `manifesterLevel`, `activated`
   *
   * @see PsionicItemType — the discriminant union type
   * @see PowerStoneEntry — individual imprinted power on a power stone
   * @see ARCHITECTURE.md section 5.1.1 — Psionic Item Data full reference
   * @see SRD: /srd/psionic/items/
   */
  psionicItemData?: {
    /**
     * Discriminant tag identifying which sub-type of psionic item this is.
     * Determines which other fields in this block are meaningful.
     */
    psionicItemType: PsionicItemType;

    // ─── COGNIZANCE CRYSTAL + PSICROWN fields ────────────────────────────

    /**
     * Current stored Power Points in this item.
     *
     * COGNIZANCE CRYSTAL: The PP available for the owner to draw on when
     *   manifesting powers. Depletes as the owner uses it. Can be recharged
     *   at 1-for-1 by spending the owner's own PP (these then stay in the
     *   crystal until used).
     *   Range: 0 to `maxPP` (odd number, 1–17).
     *
     * PSICROWN: The PP available for manifesting the crown's powers.
     *   Powers from the crown are augmentable using ONLY the crown's own PP.
     *   The user cannot supplement with their personal PP.
     *   Created with `50 × manifesterLevel` PP.
     *
     * Mutable during play (decremented as PP are spent).
     * Null-safe: if `undefined`, treat as 0.
     *
     * Only meaningful for `psionicItemType: "cognizance_crystal"` or `"psicrown"`.
     */
    storedPP?: number;

    /**
     * Maximum Power Points this item can hold.
     *
     * COGNIZANCE CRYSTAL: Always ODD, between 1 and 17 (per SRD creation table).
     *   Determines the item's tier and market price.
     *   The crystal can never hold more than this maximum, even when recharged.
     *
     * PSICROWN: Set at creation time as `50 × manifesterLevel`.
     *   Psicrowns do NOT recharge between adventures (unlike some interpretations
     *   of other charged items) unless explicitly stated by the GM.
     *
     * Immutable after creation (stored as a configuration value, not runtime state).
     *
     * Only meaningful for `psionicItemType: "cognizance_crystal"` or `"psicrown"`.
     */
    maxPP?: number;

    /**
     * Whether the cognizance crystal is currently attuned to the owner.
     *
     * COGNIZANCE CRYSTAL ONLY.
     * Attunement requires holding the crystal for 10 minutes (the activation period).
     * Until attuned, the PP stored in the crystal cannot be accessed.
     *
     * `true`: Crystal is attuned — owner can draw on its PP.
     * `false`: Crystal is not yet attuned (just acquired; needs 10 minutes).
     *
     * Only meaningful for `psionicItemType: "cognizance_crystal"`.
     * Ignored for all other psionic item types.
     */
    attuned?: boolean;

    // ─── DORJE + PSIONIC TATTOO fields ───────────────────────────────────

    /**
     * The ID of the single `MagicFeature` (psionic power) stored in this item.
     *
     * DORJE: The power this dorje manifests when a charge is expended.
     *   The user must have the power on their class list to activate the dorje.
     *   Powers can be pre-augmented at creation (locked in at the creator's ML).
     *
     * PSIONIC TATTOO: The power imprinted on this tattoo. Manifested when the
     *   wearer activates it (standard action). Single use — tattoo fades after.
     *   Only 1st–3rd level powers can be stored.
     *
     * Looked up from the DataLoader to display power name, level, and effects.
     *
     * Only meaningful for `psionicItemType: "dorje"` or `"psionic_tattoo"`.
     * Use `powersImprinted[]` for power stones; `powersKnown[]` for psicrowns.
     */
    powerStored?: ID;

    /**
     * Remaining charges (uses) for this dorje.
     *
     * DORJE ONLY.
     * Created with 50 charges. Each charge allows one use of the stored power.
     * When charges reach 0, the dorje is exhausted — it becomes an inert
     * crystal with no further psionic function.
     *
     * Mutable during play (decremented each time the dorje is used).
     *
     * Only meaningful for `psionicItemType: "dorje"`.
     */
    charges?: number;

    // ─── POWER STONE fields ────────────────────────────────────────────

    /**
     * Array of powers imprinted on this power stone.
     *
     * POWER STONE ONLY.
     * A power stone holds 1d3–1d6 distinct powers depending on quality
     * (minor/medium/major). Each entry in this array represents one imprinted
     * power with its manifester level and used status.
     *
     * Powers can be used in any order. Using one power does NOT affect the others.
     * When ALL entries have `usedUp: true`, the stone is fully depleted.
     *
     * BRAINBURN: If the user's manifester level < entry.manifesterLevel, they
     * must make a level check (DC = manifesterLevel + 1) or trigger Brainburn
     * (1d6 damage per stored power per round for 1d4 rounds). This risk is
     * computed by the Dice Engine at activation time.
     *
     * @see PowerStoneEntry for individual entry structure.
     *
     * Only meaningful for `psionicItemType: "power_stone"`.
     */
    powersImprinted?: PowerStoneEntry[];

    // ─── PSICROWN fields ──────────────────────────────────────────────

    /**
     * IDs of powers accessible via this psicrown's PP pool.
     *
     * PSICROWN ONLY.
     * A psicrown has a fixed, predefined list of powers. The wearer can manifest
     * any of these powers by spending the crown's PP (not personal PP). The
     * manifested powers can be augmented using additional crown PP, provided
     * the total PP spent does not exceed the wearer's manifester level.
     *
     * The wearer does not need these powers on their personal class list —
     * they access them through the crown. However, they must meet key ability
     * score requirements to activate the crown.
     *
     * Each ID references a `MagicFeature` in the DataLoader.
     *
     * Only meaningful for `psionicItemType: "psicrown"`.
     */
    powersKnown?: ID[];

    // ─── SHARED: MANIFESTER LEVEL ─────────────────────────────────────

    /**
     * The manifester level at which this item was created.
     *
     * Used by:
     *   DORJE:          The caster level for the stored power's variable effects.
     *                   (Range, duration, damage dice all scale with this.)
     *                   Cannot be more than 5 higher than the power's minimum ML.
     *   PSIONIC TATTOO: The caster level. Minimum ML required to inscribe the power.
     *   PSICROWN:       Determines the PP pool size (50 × manifesterLevel) and
     *                   serves as an upper cap on per-power PP spending.
     *   POWER STONE:    Stored per-power in `PowerStoneEntry.manifesterLevel`
     *                   (not here) because each power may have different MLs.
     *
     * For power stones this field is not used (each power entry has its own ML).
     *
     * Only meaningful for `psionicItemType: "dorje"`, `"psionic_tattoo"`, or `"psicrown"`.
     */
    manifesterLevel?: number;

    // ─── PSIONIC TATTOO fields ────────────────────────────────────────

    /**
     * Whether this psionic tattoo has already been activated (used).
     *
     * PSIONIC TATTOO ONLY.
     * `false` (default): Tattoo is intact and can still be activated once.
     * `true`: Tattoo has been activated and has faded. The slot it occupied
     *   is now free (contributing to the 20-tattoo body limit).
     *
     * NOTE: The 20-tattoo body-limit enforcement is a UI concern — the inventory
     * manager (Phase 13.3) must count active tattoos with `activated: false`
     * and block equipping a 21st. Exceeding this limit causes ALL tattoos to
     * simultaneously activate (this is a rare edge case handled narratively).
     *
     * Only meaningful for `psionicItemType: "psionic_tattoo"`.
     */
    activated?: boolean;
  };
}


// =============================================================================
// PSIONIC ITEM DATA — Subtypes for psionic consumables and power stores
// =============================================================================

// =============================================================================
// PSIONIC ITEM DATA — Subtypes for psionic consumables and power stores
// =============================================================================

/**
 * The five psionic item categories defined by D&D 3.5 SRD (Expanded Psionics Handbook).
 *
 * Each type has unique mechanical data stored in `ItemFeature.psionicItemData`.
 * A non-psionic item has `psionicItemData: undefined`.
 *
 * | Type                  | Analogue       | Key mechanic                              |
 * |-----------------------|----------------|-------------------------------------------|
 * | `"cognizance_crystal"` | Ring of Spell Storing | Stores/recharges PP externally          |
 * | `"dorje"`              | Wand           | 50 charges, one power, trigger activation |
 * | `"power_stone"`        | Scroll         | 1–6 powers, single use each, Brainburn    |
 * | `"psicrown"`           | Staff          | PP pool + known powers, caster-level use  |
 * | `"psionic_tattoo"`     | Potion         | 1–3rd level, single-use, body-slot limit  |
 *
 * @see ARCHITECTURE.md section 5.1.1 — Psionic Item Data
 */
export type PsionicItemType =
  | 'cognizance_crystal'  // PP-storing crystal; rechargeable on 1-to-1 basis
  | 'dorje'              // Single-power charge-based wand (50 charges default)
  | 'power_stone'        // Multi-power single-use scroll analogue (+ Brainburn risk)
  | 'psicrown'           // PP pool + fixed power list; headband slot
  | 'psionic_tattoo';    // Single-use body-worn power (max 20 tattoos total)

/**
 * One imprinted power entry on a Power Stone.
 *
 * A power stone can hold 1d3–1d6 powers (depending on minor/medium/major quality).
 * Each power is used independently — manifesting one power from the stone "flushes"
 * only that specific power (the others remain until used).
 *
 * BRAINBURN RISK:
 *   If the user's manifester level is lower than the power's manifester level on the
 *   stone, they must make a manifester level check (DC = stone ML + 1) or face the
 *   Brainburn effect: 1d6 damage per stored power per round for 1d4 rounds.
 *   This is a UI/Dice Engine concern tracked via the `manifesterLevel` field.
 *
 * @see ARCHITECTURE.md section 5.1.1 — Power Stone imprinted power entries
 * @see SRD: /srd/psionic/items/powerStones.html
 */
export interface PowerStoneEntry {
  /**
   * The ID of the `MagicFeature` (psionic power) imprinted on this stone.
   * Looked up from the DataLoader to display power name, level, and description.
   */
  powerId: ID;

  /**
   * The manifester level at which the power was imprinted.
   *
   * Normally the minimum manifester level required for the power's level.
   * The creator may specify a higher ML (up to minimumML + 5) for augmented versions.
   *
   * Used by the Brainburn check: if the user's ML < this value, they roll a
   * manifester level check (DC manifesterLevel + 1) or fail with Brainburn.
   */
  manifesterLevel: number;

  /**
   * Whether this power has already been manifested ("flushed") from the stone.
   *
   * Single-use: once `usedUp === true` the power cannot be manifested again.
   * The stone itself may still hold other powers (tracked as separate entries).
   * When ALL powers are `usedUp`, the stone is inert.
   */
  usedUp: boolean;
}
