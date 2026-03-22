# Character Vault — VTT RPG Engine Progress Tracker

---

## CRITICAL CODING GUIDELINES

> ⚠️ **These guidelines must be respected for EVERY task without exception.**

1. **Context Loading:** The architecture is split into two files. `ARCHITECTURE.md` must be loaded for EVERY task. `ANNEXES.md` (JSON examples and config tables) should only be loaded when the current task requires reference data (Phases 1, 5, 17, or when explicitly instructed).
2. **Language:** All code, variables, and comments MUST be in English.
3. **Comments:** Comments must be exhaustive, educational, and explain the _why_ behind complex logic (especially for D&D 3.5 specificities like DAG resolution, stacking rules, or Exploding Dice mechanics).
4. **Quality:** Prioritize extreme readability, modularity, and strict TypeScript typing. Apply software engineering best practices so any other developer or AI can easily onboard and scale the project.
5. **Workflow & Source of Truth:** The official project checklist will reside in a `PROGRESS.md` file at the root of the project. At each iteration, I will explicitly instruct you which specific task to tackle next (e.g., "Execute Phase 1.2"). You must provide the complete code for the requested file(s) ensuring they perfectly respect the Architecture Document. Do not skip steps. Do not anticipate future steps.
6. **ZERO HARDCODING:** The engine and UI must be 100% agnostic. Never hardcode specific D&D terms (like "Fighter", "Elf", "Strength", or "Longsword") in your TypeScript logic or Svelte templates.
7. **QUOTA MANAGEMENT & ATOMIC WORKFLOW:** To prevent mid-task interruptions due to context limits, you must operate in strict, isolated steps.
    1. **One Task at a Time:** I will prompt you with a specific sub-task (e.g., "Do Phase 1.1"). You must ONLY execute that single sub-task. Do NOT chain multiple sub-tasks together unless explicitly commanded.
    2. **The Stable State Guarantee:** Before finishing your turn, you must ensure the codebase is completely stable. There must be no unresolved imports, no dangling functions, and no TypeScript errors. If a task requires modifying 3 files, do them all in the same turn so the project compiles perfectly at the end.
    3. **The Pause & Acknowledge Protocol:** When you finish the requested sub-task, stop completely. Do not anticipate the next step. End your response by stating: _"Task [X.X] is complete and stable. Ready for the next task."_
    4. **Progress Tracking (The Breadcrumb):** Create and update a `PROGRESS.md` file at the root of the project. Every time you complete a sub-task from the checklist, check it off in this file. This ensures that if our session is interrupted, you can instantly read this file upon reboot to know exactly where we left off.

---

## Checklist

- [x] Initialize Project & PROGRESS.md

### Phase 1: Typed Foundations (Data Models)

- [x] **1.1 Primitives & i18n:** Create `src/lib/types/primitives.ts` (ID, ModifierType, LogicOperator) and `src/lib/types/i18n.ts` (LocalizedString, I18N_CONFIG).
- [x] **1.2 Logic & Math Engine:** Create `src/lib/types/logic.ts` (Recursive LogicNode) and `src/lib/types/pipeline.ts` (Modifier with `situationalContext`, StatisticPipeline with computed `derivedModifier`, separating active/situational, SkillPipeline, ResourcePool).
- [x] **1.3 Unified Feature Model:** Create `src/lib/types/feature.ts` (Feature with `levelProgression`, ItemFeature with `two_hands` slot, MagicFeature, FeatureChoice, AugmentationRule). Ensure every JSON entity carries a `ruleSource` field and an optional `merge` field for the Data Override system.
- [x] **1.3a MagicFeature psionic fields (`discipline` + `displays`):** Add two psionic-specific optional fields to `MagicFeature` in `src/lib/types/feature.ts`: `discipline?: PsionicDiscipline` (typed union of the 6 SRD disciplines: clairsentience, metacreativity, psychokinesis, psychometabolism, psychoportation, telepathy) and `displays?: PsionicDisplay[]` (typed array of the 5 SRD display types: auditory, material, mental, olfactory, visual). Export both types (`PsionicDiscipline`, `PsionicDisplay`) from `feature.ts`. Document psionic fields (relationship to `school`, DataLoader query format `discipline:<d>`, display suppression mechanic, complete JSON example) in `ARCHITECTURE.md` section 5.2.1. Required for: all psionic power JSON data (D20SRD_CONVERSION.md C-15a–k), Psicraft skill checks, Psionic Powers panel UI (Phase 12).
- [x] **1.3b ItemFeature psionic item subtypes (`psionicItemData`):** Add `PsionicItemType` union type, `PowerStoneEntry` interface, and optional `psionicItemData` block to `ItemFeature` in `src/lib/types/feature.ts`. Covers all five D&D 3.5 psionic item types: Cognizance Crystals (`storedPP`, `maxPP`, `attuned`), Dorjes (`powerStored`, `charges`, `manifesterLevel`), Power Stones (`powersImprinted: PowerStoneEntry[]` with Brainburn ML tracking), Psicrowns (`storedPP`, `maxPP`, `powersKnown[]`, `manifesterLevel`), Psionic Tattoos (`powerStored`, `manifesterLevel`, `activated`). Document the full per-type field-to-type matrix, mutable vs immutable fields, JSON examples, and SRD mechanical details in `ARCHITECTURE.md` section 5.1.1. Required for: all psionic item JSON data (D20SRD_CONVERSION.md C-15g–k), Inventory tab psionic item display (Phase 13), PP management from cognizance crystals.
- [x] **1.4 Global State & Campaign Settings:** Create `src/lib/types/character.ts` (ActiveFeatureInstance, LinkedEntity with serialization guard, Character with `classLevels` record and `gmOverrides` array) and `src/lib/types/settings.ts` (CampaignSettings with language, point buy budget, reroll 1s, exploding 20s rules, and `enabledRuleSources`). Create `src/lib/types/campaign.ts` (Campaign, Chapter, SceneState).
- [x] **1.5 Character ECL & XP fields (monster PC support):** Add `levelAdjustment: number` and `xp: number` fields to the `Character` interface in `src/lib/types/character.ts`. Document both fields and the `@characterLevel` vs `@eclForXp` distinction in `ARCHITECTURE.md` (sections 4.3 and 6, new subsection 6.4). Required for: monster PCs with racial Level Adjustment, the "Reducing Level Adjustments" SRD variant, correct XP-table lookups when LA > 0.
- [x] **1.6 ResourcePool incremental reset conditions (`per_turn` / `per_round`):** Extend `ResourcePool.resetCondition` in `src/lib/types/pipeline.ts` from a 4-value union to a 6-value union adding `"per_turn"` and `"per_round"`. Add optional `rechargeAmount?: number | string` field (formula-capable) for the amount restored per tick. Document the full `resetCondition` reference table (including Fast Healing vs Regeneration design notes) in `ARCHITECTURE.md` section 4.4. Required for: Fast Healing, Regeneration, per-round environmental hazard pools, and any ability that recovers gradually each combat turn.

### Phase 2: Pure Functions & Dice Engine (The Brain)

- [x] **2.1 i18n Formatters:** Create `src/lib/utils/formatters.ts` (Localization and unit conversion based on CampaignSettings).
- [x] **2.2 Math Parser:** Create `src/lib/utils/mathParser.ts` (Evaluate formulas, replace `@` placeholders, and handle `|distance` / `|weight` pipes).
- [x] **2.3 Logic Evaluator:** Create `src/lib/utils/logicEvaluator.ts` (Recursive evaluation of `LogicNode`).
 - [x] **2.4 Stacking Rules:** Create `src/lib/utils/stackingRules.ts` (Ignore stacking for identical modifier types unless exceptions apply).
 - [x] **2.4a Damage Reduction stacking & `drBypassTags`:** Add `"damage_reduction"` to `ModifierType` in `primitives.ts`. Add `drBypassTags?: string[]` field to `Modifier` in `pipeline.ts` — holds the material/condition tags that bypass a DR entry (e.g., `["magic"]`, `["silver"]`, `[]` for DR/—). Add `DREntry` result type to `stackingRules.ts`. Implement best-wins-per-bypass-group DR resolution in `applyStackingRules()`: group DR modifiers by sorted `drBypassTags` signature; within each group keep only the highest value; return as `StackingResult.drEntries[]`. Document two DR authoring modes ("base" for additive class-progression DR, "damage_reduction" for innate/racial DR) in `ARCHITECTURE.md` section 4.5.
 - [x] **2.5 Dice Engine (RNG):** Create `src/lib/utils/diceEngine.ts`. Implement `parseAndRoll(formula, pipeline, context, settings)`. It MUST accept `CampaignSettings` to handle "Exploding 20s" (recursive reroll and add) and "Reroll 1s" (for stat generation). Return a strict `RollResult` type handling crits, fumbles, explosions count, and applying situational buffs.

### Phase 3: Svelte 5 Reactive Engine (The DAG)

- [x] **3.1 Store Skeleton:** Create `src/lib/engine/GameEngine.svelte.ts` (Initialize global state, including `CampaignSettings` and active `Character`).
- [x] **3.2 Flattening & Filtering:** Create Step 0 `$derived` (Flat list of valid modifiers after checking prerequisites, forbidden tags, `classLevel` gating from `levelProgression`, and applying the full Data Override resolution chain including `gmOverrides`).
- [x] **3.3 DAG - Base Attributes:** Create Step 1 & 2 `$derived` (Calculate 6 main stats and their `derivedModifier`, isolating situational modifiers).
- [x] **3.4 DAG - Combat Stats & Skills:** Create Step 3 & 4 `$derived` (Calculate AC, BAB, Saves, Max HP, and Skills using results from previous derivations to prevent infinite loops).
- [x] **3.5 DAG - ECL derivation (`@eclForXp`):** Add `phase0_eclForXp` `$derived` to `GameEngine.svelte.ts` (formula: `phase0_characterLevel + character.levelAdjustment`). Expose as `eclForXp` in the `CharacterContext` snapshot so the Math Parser can resolve `@eclForXp`. Add `eclForXp` field to `CharacterContext` in `src/lib/utils/mathParser.ts`. Add `resolvePath` case for `@eclForXp`. Required by: XP-threshold lookups for monster PCs, Level Up UI, config_xp_table formula references.
- [x] **3.6 GameEngine tick & rest action methods:** Add `triggerTurnTick()`, `triggerRoundTick()`, `triggerEncounterReset()`, `triggerShortRest()`, and `triggerLongRest()` public methods to `GameEngine.svelte.ts`. Add private helpers `#getEffectiveMax()` and `#applyIncrementalTick()`. These methods drive the `"per_turn"` / `"per_round"` / `"encounter"` / rest resource-recovery lifecycle. `rechargeAmount` formulas are evaluated via the Math Parser using `phase0_context`. Required by: Fast Healing, Regeneration, Combat Tab "New Encounter" button (Phase 10.1), Long Rest button, incremental pool UI.

### Phase 4: Persistence & I/O

- [x] **4.1 Multi-Character & Settings Storage:** Create `src/lib/engine/StorageManager.ts`. Implement logic to store multiple characters AND the `CampaignSettings` in `localStorage` (CRUD operations). Connect this to the `GameEngine` via `$effect`. Implement `LinkedEntity` serialization guard (no back-references).
- [x] **4.2 Data Dictionary (Data Loader & Merge Engine):** Create `src/lib/engine/DataLoader.ts`. Fetch JSON rules from `static/rules/`, cache them in memory, and respect `CampaignSettings.enabledRuleSources` ordering. Implement the **Merge Engine**: process the `merge` field on each JSON entity (`"replace"` by default, `"partial"` for additive/subtractive merge with `-prefix` convention for deletions).

### Phase 5: Test UI (Validation)

- [x] **5.1 Mock Data:** Create `static/rules/test_mock.json` (Race, Class with `levelProgression`, Item, Condition, and an Orc Enemy). Create a second file `static/rules/test_override.json` to test `merge: "partial"` and `merge: "replace"` overrides.
- [x] **5.2 Settings & Character Sheet Component:** Create `src/routes/+page.svelte`. Add a toggle for "Exploding 20s" and display Total Strength and Total AC.
- [x] **5.3 Graph & Context Testing:** Add a button "Attack the Orc" to trigger the Dice Engine. Prove the "+2 vs Orcs" situational modifier applies ONLY to the roll. Prove that turning on "Exploding 20s" properly rerolls and adds consecutive 20s.
- [x] **5.4 Merge Engine Testing:** Prove that enabling `test_override.json` as a rule source correctly merges/replaces Features, including `-prefix` deletions.

### Phase 6: Campaign Management & User Context

_Goal: Establish the overarching container for characters. A Campaign groups characters, tracks story progression via Acts/Chapters, and handles Game Master (GM) vs Player visibility._

- [x] **6.1 User Context & Roles:** Create `src/lib/engine/SessionContext.svelte.ts` to mock a user session. It must include `currentUserId`, `isGameMaster` (boolean), and `activeCampaignId`. Design it so it can later be replaced by a real PHP-backed auth session.
- [x] **6.2 Character Model Updates:** Update `src/lib/types/character.ts` to include meta-data for the UI: `campaignId`, `ownerId` (to link to the user), `isNPC` (boolean), `posterUrl`, `playerRealName`, and `customSubtitle`.
- [x] **6.3 Campaign Hub UI:** Create `src/routes/campaigns/+page.svelte`. Display a grid of available campaigns using their `posterUrl` and `bannerUrl`. Add a "Create Campaign" button (visible only if GM).
- [x] **6.4 Campaign Details & Acts UI:** Create `src/routes/campaigns/[id]/+page.svelte`. Display the campaign banner and summary. Render the list of Chapters/Acts. If `isGameMaster` is true, allow checking/unchecking the `isCompleted` status of chapters.

### Phase 7: The Character Vault

_Goal: Build the character selection screen (Your Adventurers) based on the current active campaign, respecting visibility rules._

- [x] **7.1 Visibility Logic (The Filter):** In `GameEngine` or a dedicated `VaultStore`, create a `$derived` array called `visibleCharacters`.
    - _Rule:_ Filter characters by `activeCampaignId`.
    - _Rule:_ If `isGameMaster` is true, return all characters, NPCs, and monsters in the campaign.
    - _Rule:_ If `isGameMaster` is false, return ONLY characters where `ownerId === currentUserId`, plus any `LinkedEntity` belonging to those characters.
- [x] **7.2 Character Card Component:** Create `src/lib/components/vault/CharacterCard.svelte`. It must accept a `Character` object as a prop.
    - _Layout:_ Display the `posterUrl` at the top (fallback to a placeholder 300x200 if undefined). Display the Character Name.
    - _Subtitle Logic:_ If `customSubtitle` exists, display it. Otherwise, if `isNPC`, display the Race label. If it's a Player Character, display `playerRealName`.
    - _Level Badge:_ Display the Overall Effective Level (sum of all class levels from `classLevels`).
- [x] **7.3 Character Vault Page:** Create `src/routes/campaigns/[id]/vault/+page.svelte`. Implement the layout from the design mockup. Display the `visibleCharacters` array using the `CharacterCard` component in a responsive grid.
- [x] **7.4 Empty State & Creation Actions:** Inside the Vault Page, implement the empty state ("No adventurers yet!"). Add the "Create New Character" button. If `isGameMaster` is true, also add an "Add NPC/Monster" button. Both should initialize a blank/mock Character in the `StorageManager` and navigate to the Phase 8 (Core Tab) editor.

### Phase 8: UI Construction - "Core" Tab (Summary View)

_Goal: Build the fundamental character sheet summary interface. These components are simplified, read-only overviews. The full interactive editors are built in Phase 9+. The UI must be "dumb": it should only read `$derived` data from the `GameEngine` and dispatch intents/actions back to it. No game logic should reside in `.svelte` files._

- [x] **8.1 Tab Navigation & Layout Skeleton:** Create the main layout `src/routes/character/[id]/+page.svelte`. Implement a tabbed navigation system (Core, Abilities, Combat, Feats, Inventory). Ensure the `GameEngine` correctly loads the character ID from the URL using the `StorageManager`.
- [x] **8.2 Generic Feature Modal (Data Display):** Create a highly reusable component `src/lib/components/ui/FeatureModal.svelte`. This modal takes a `Feature` ID as a prop, fetches it from the `DataLoader`, and displays its localized description, prerequisites, granted modifiers (translated into readable text like "+2 Strength"), and granted features.
- [x] **8.3 Basic Information Component (Feature Selectors):** Create `src/lib/components/core/BasicInfo.svelte`. Implement dropdowns for Race, Class, Deity, Alignment, and Size.
    - _Requirement:_ Selecting a Race/Class must trigger the `GameEngine` to add the corresponding `ActiveFeatureInstance` to the character, including initializing a `classLevels` entry for new classes.
    - _Requirement:_ Implement dynamic badges (e.g., showing `+2 DEX` next to the Elf selection by reading the feature's modifiers).
- [x] **8.4 Dynamic Feature Choices (Sub-selections):** Update `BasicInfo.svelte` to handle `FeatureChoice` arrays. If the active Class feature has choices (e.g., Cleric Domains), dynamically render additional dropdowns below it based on the `optionsQuery` (e.g., fetching features with `tag: "domain"`). Bind the selection to the `selections` record of the `ActiveFeatureInstance`.
- [x] **8.5 Ability Scores Summary:** Create `src/lib/components/core/AbilityScoresSummary.svelte`. Display a compact read-only view of the 6 main stats showing `totalValue` and `derivedModifier`. Include a link/button to navigate to the full Abilities tab (Phase 9).
- [x] **8.6 Saving Throws Summary:** Create `src/lib/components/core/SavingThrowsSummary.svelte`. Display Fortitude, Reflex, and Will total modifiers in a compact read-only format.
- [x] **8.7 Skills Summary:** Create `src/lib/components/core/SkillsSummary.svelte`. Display a condensed skills list (skill name + total bonus). No editing capability — link to Phase 9 for full editing.
- [x] **8.8 Languages & Lore Component:** Create `src/lib/components/core/LoreAndLanguages.svelte`. Bind text areas for Personal Story, Appearance (Height, Weight, etc.). Implement the Language selection system: calculate available languages (INT mod + Speak Language ranks), display automatically granted languages (from Race/Class features), and provide a dropdown to add new languages until the limit is reached.

### Phase 9: UI Construction - "Abilities & Skills" Tab (Full Interactive Editor)

_Goal: Build the complete interactive Abilities, Saving Throws, and Skills interfaces. These are the full editors with calculation breakdowns, dice rolling modals, and stat generation logic._

- [x] **9.1 Data Model Extensions:** Update `src/lib/types/feature.ts`. Add `recommendedAttributes?: ID[]` to the `Feature` interface (used by the Point Buy UI to highlight class-preferred stats). Ensure the `SkillPipeline` and `Feature` logic correctly handles "Synergy" modifiers triggered by skill ranks.
- [x] **9.2 Breakdown & Dice Roll Modals (Shared UI):**
    - Create `src/lib/components/ui/ModifierBreakdownModal.svelte`. It reads a pipeline's `activeModifiers` and displays the math (Base + Modifiers = Final).
    - Create `src/lib/components/ui/DiceRollModal.svelte`. It takes a target pipeline (e.g., Strength, Jump), calls the `DiceEngine.parseAndRoll()` function, and displays the `RollResult` (Natural Roll + Total Bonus = Final Result, highlighting Critical Failures/Successes).
- [x] **9.3 Ability Scores Panel:** Create `src/lib/components/abilities/AbilityScores.svelte`. Display the 6 main stats (STR to CHA). Show the Final Modifier (`derivedModifier`), Base Score (editable), and Temporary Modifier. Add the "i" button (opens Breakdown) and the "Dice" button (opens Roll Modal) for each stat.
- [x] **9.4 Stat Generation Wizards (Point Buy & Roll):**
    - Create `PointBuyModal.svelte`. Implement the 3.5 point buy math. Read `recommendedAttributes` from the character's active Class feature to color-code (green/orange/red) the stats. Restrict spending based on `CampaignSettings.statGeneration.pointBuyBudget`.
    - Create `RollStatsModal.svelte`. Implement the 4d6 drop lowest logic. Automatically reroll 1s if `CampaignSettings.statGeneration.rerollOnes` is true. Allow assigning the 6 rolled values to the desired attributes.
- [x] **9.5 Saving Throws Panel:** Create `src/lib/components/abilities/SavingThrows.svelte`. Display Fortitude, Reflex, and Will. For each, display the Final Modifier, the related Ability Modifier block (color-coded, e.g., CON for Fortitude), Misc Modifiers, and an editable Temporary Modifier input. Include Breakdown and Dice Roll buttons.
- [x] **9.6 Skills Matrix Panel:** Create `src/lib/components/abilities/SkillsMatrix.svelte`.
    - Create the header calculating "Skill Points Available" vs "Skill Points Spent".
    - Render the table of skills. For each skill: show a checkbox for "Class Skill" (read-only, derived from active classes), Skill Name, Total Bonus, Key Ability label, User Misc input, Ranks input, Cost per rank (1 or 2), and Max allowed ranks (Level + 3, or half for cross-class).
    - _Requirement:_ Typing in the "Ranks" input must directly update the `ranks` property of the specific `SkillPipeline` in the `GameEngine`.
    - _Requirement:_ Ensure Synergy bonuses granted by other skills appear correctly in the Breakdown modal when the "i" button is clicked.

### Phase 10: UI Construction - "Combat" Tab

_Goal: Build the Combat tab containing Health, Experience, Armor Class, Offense (Attacks), Movement, and Defenses. Rely entirely on the DAG pipelines calculated in Phase 3._

- [x] **10.1 Health & Experience Panel:** Create `src/lib/components/combat/HealthAndXP.svelte`.
    - **Health:** Bind to the `resources.hp` pool. Create the visual HP bar (Current, Temporary, Nonlethal). Implement the "Heal" and "Damage" buttons that open a small prompt to add/subtract from `currentValue` and `temporaryValue` correctly (damage depletes temp HP first). Display the base HP and CON modifier breakdown.
    - **Experience:** Create the XP progress bar. XP thresholds per level are defined in the configuration JSON lookup table (not hardcoded). Add the "Level Up" button.
- [x] **10.2 Armor Class Panel:** Create `src/lib/components/combat/ArmorClass.svelte`.
    - Read from three distinct pipelines: `combatStats.ac_normal`, `combatStats.ac_touch`, and `combatStats.ac_flat_footed`.
    - _Requirement:_ Include the `ModifierBreakdownModal` (from Phase 9) on the "i" icons so the user can see exactly why their Touch AC ignores Armor/Shield modifiers. Bind the "Temporary Modifier" input to a generic untyped modifier applied to all three AC pipelines.
- [x] **10.3 Core Combat Stats:** Create `src/lib/components/combat/CoreCombat.svelte`. Display Base Attack Bonus (BAB), Initiative, and Grapple Modifier pipelines. Include the "Dice Roll" and "Breakdown" buttons for Initiative and Grapple.
- [x] **10.4 Weapons & Attacks Panel:** Create `src/lib/components/combat/Attacks.svelte`.
    - Create dropdowns for Main Hand, Off Hand, and Ranged Weapon. These dropdowns must read from the character's `Inventory` (filtering for `ItemFeature` with weapon tags) plus a default "Unarmed" option.
    - _Requirement:_ Dynamically calculate and display the Total Attack Bonus and Damage Bonus based on the selected weapon (factoring in Weapon Enhancement, STR/DEX modifiers, BAB, and Size). Include "Dice Roll" buttons that pass the weapon's damage dice to the `DiceEngine`.
- [x] **10.5 Movement Speeds Panel:** Create `src/lib/components/combat/MovementSpeeds.svelte`. Display Land, Burrow, Climb, Fly, and Swim speed pipelines. Explicitly show the "Armor Penalty Effect" and "Load Penalty Effect" pipelines so the player understands why their speed is reduced.
- [x] **10.6 Energy & Special Resistances:** Create `src/lib/components/combat/Resistances.svelte`. Display pipelines for Fire, Cold, Acid, Electricity, Sonic, Spell Resistance (SR), Power Resistance (PR), and Fortification. Allow user-inputted "Misc Modifiers".
- [x] **10.7 Damage Reduction (DR) Builder:** Create `src/lib/components/combat/DamageReduction.svelte`.
    - Implement the UI to construct a DR rule (Value, Rule: Bypassed/Excepted, Type: Adamantine/Magic/Slashing).
    - _Requirement:_ When "Add Damage Reduction" is clicked, it should generate a custom `ActiveFeatureInstance` (category: condition/trait) containing the DR modifier and push it to the `GameEngine`. Display the list of active DRs with a delete button.

### Phase 11: UI Construction - "Feats" Tab

_Goal: Build the Feats management interface. This involves tracking available feat slots, distinguishing between automatically granted features and player-selected feats, and building a catalog modal that rigorously enforces D&D 3.5 prerequisites using the Logic Engine._

- [x] **11.1 Feat Capacity Pipeline:** In `GameEngine`, establish a specific pipeline/resource to calculate `Feat Slots`.
    - _Base logic:_ `1 + floor(character_level / 3)`.
    - _Bonus logic:_ Add bonus slots granted by other features (e.g., Human bonus feat, Fighter bonus feats). Calculate "Feats Left" by subtracting the number of manually selected feats from this total.
- [x] **11.2 Feats Tab Layout & Lists:** Create `src/lib/components/feats/FeatsTab.svelte`.
    - Render the header showing "Feats Available" and "Feats Left" dynamically.
    - Create a `Granted Feats` section: Loop through `activeFeatures` to find features automatically granted by a parent feature (like Class or Race). Display them as read-only (no delete button). Show the source tag (e.g., "Druid" or "Gnome").
    - Create a `Selected Feats` section: List the feats manually chosen by the player, with a "Delete" button to free up the slot.
- [x] **11.3 Feat Catalog Modal (Search & Filter):** Create `src/lib/components/feats/FeatSelectionModal.svelte`.
    - Fetch all features with `category: "feat"` from the `DataLoader`.
    - Implement a text search bar (filtering by title and description).
    - Implement visual tags (e.g., reading the `tags` array to display badges like "Fighter Bonus Feat" or "Metamagic").
- [x] **11.4 Prerequisite Evaluation UI:** Inside the `FeatSelectionModal`, implement the logic constraint UI.
    - For each feat in the list, run its `prerequisitesNode` through the `logicEvaluator`.
    - If the evaluation fails, disable the "Select" button/row for that feat.
    - _Requirement:_ Extract the specific `errorMessage` from the failing `LogicNode`s (e.g., "Dexterity 19", "BAB +11") and display them in red. Met prerequisites should be displayed in a neutral/green color.

### Phase 12: UI Construction - "Spells & Powers" Tab

_Goal: Build the Magic, Psionics, and Special Abilities interface. This tab manages Spellbooks, Power Points, Domain Powers, and daily casting limits using the `MagicFeature` and `ResourcePool` models._

- [x] **12.1 Magic Resources & Limits:** In `GameEngine`, derive the spellcasting/manifesting limits.
    - Calculate `Caster Level` and `Manifester Level` pipelines based on active classes.
    - Calculate available `Spell Slots` (per level) or `Power Points` (PP) max by reading the class JSON formulas and the relevant key ability modifier (e.g., INT for Wizards, WIS for Clerics).
- [x] **12.2 Spells/Powers Catalog (The Grimoire):** Create `src/lib/components/magic/Grimoire.svelte`.
    - Build an interface allowing the player to "Learn" or "Add" spells to their spellbook.
    - _Filter Logic:_ Fetch `MagicFeature` items from `DataLoader`. Filter them so the UI only shows spells/powers corresponding to the character's active `spellLists` (e.g., if Cleric level 3, only show Cleric spells up to level 2).
 - [x] **12.3 Preparation & Casting Panel:** Create `src/lib/components/magic/CastingPanel.svelte`.
     - _Layout:_ Group known spells by Level (0 to 9). For psionic characters, also group by `discipline` (Phase 1.3a) with discipline tabs (Clairsentience, Metacreativity, etc.).
     - _Interaction:_ Add a "Prepare" counter (for Vancian magic like Wizards/Clerics) or a "Cast/Manifest" button (for Sorcerers/Psions).
     - _Breakdown UI:_ Clicking a spell opens a modal displaying its School, Components, Range, Duration, and a "Dice Roll" button for damage/healing. Calculate the Spell Save DC dynamically (`10 + Spell Level + Key Ability Mod`). For psionic powers: show `discipline`, `displays` (with icons), and augmentation cost options.
- [x] **12.4 Special & Domain Abilities Panel:** Create `src/lib/components/magic/SpecialAbilities.svelte`.
    - Filter the character's `activeFeatures` for abilities categorized as `class_feature` or `domain` that have an `activation` type (e.g., "Standard Action", "3/Day").
    - Display these as distinct cards. Tie their daily uses to localized `ResourcePool`s so the player can tick off uses (e.g., Turn Undead uses per day).

### Phase 13: UI Construction - "Inventory" Tab

_Goal: Manage equipment, slots, encumbrance, and wealth. The UI must enforce equipment slot limits dynamically based on the engine's pipelines, and calculate weight penalties accurately._

- [x] **13.1 Equipment Slot Pipelines:** In `GameEngine`, establish base pipelines for body slots (e.g., `slots.head`, `slots.ring`, `slots.body`, `slots.main_hand`). Set default base values (e.g., `slots.ring` = 2, `slots.head` = 1). This ensures exotic races can simply apply modifiers to these pipelines to gain extra slots.
- [x] **13.2 Inventory Sections & Layout:** Create `src/lib/components/inventory/InventoryTab.svelte`. Divide the layout into three distinct visual containers:
    1. **Equipped / Readied:** Items actively worn or held.
    2. **Backpack / Carried:** Items on the character's person but not granting active stats (contributes to weight).
    3. **Storage / Stashed:** Items kept in a wagon, mount, or home (does not contribute to weight).
 - [x] **13.3 Equip & Slot Enforcement Logic:** Create the item interaction logic.
     - When a user clicks "Equip" on an item in the Backpack, the UI must check the item's `equipmentSlot` tag (e.g., "ring").
     - It then checks the `slots.ring` pipeline. If the number of currently equipped rings equals the max allowed, the UI blocks the action and shows a warning ("Ring slots full. Unequip an item first.").
     - _Action:_ If successful, toggle the `isActive` boolean on the `ActiveFeatureInstance`. The `GameEngine` will automatically inject its modifiers (like Armor AC or Sword Damage) into the DAG.
     - _Two-Handed Weapons:_ If `equipmentSlot` is `two_hands`, the engine must check that both `slots.main_hand` and `slots.off_hand` are free, and occupy both when equipped.
     - _Psionic Tattoo Limit (Phase 1.3b):_ When equipping a psionic tattoo, count non-activated tattoos currently equipped. If count ≥ 20, block equipping (or warn GM of the "all activate" consequence per SRD rules).
- [x] **13.4 Encumbrance & Wealth Calculator:** Create `src/lib/components/inventory/Encumbrance.svelte`.
    - _Weight Calculation:_ Create a `$derived` that sums the `weightLbs` of all items in the "Equipped" and "Backpack" categories.
    - _Encumbrance Tiers:_ Compare total weight against the character's Strength carrying capacity (thresholds loaded from a configuration JSON lookup table, not hardcoded). If the load is Medium or Heavy, automatically dispatch a situational `condition_encumbered` feature to the engine to apply speed and armor check penalties.
    - _Wealth:_ Add simple input fields for CP, SP, GP, PP, and calculate their total weight (standard rule: 50 coins = 1 lb).

### Phase 14: PHP Backend & Frontend Integration

_Goal: Replace the local storage mock with a PHP backend using PDO and SQLite. The backend will serve as a REST API to persist Campaigns, Users, and Character states. Designed for cheap shared hosting (e.g., OVH shared hosting)._

- [x] **14.1 Database Configuration & PDO Setup:** Create the backend folder structure (`/api`). Create `api/config.php` containing DB path for SQLite and an environment mode toggle (`production` / `development`). Create a singleton `api/Database.php` wrapper using PDO with SQLite as the sole driver. Ensure it supports falling back to an in-memory SQLite DB (`sqlite::memory:`) if a test environment variable is detected.
- [x] **14.2 Authentication System:** Create `api/auth.php`. Implement a simple session-based authentication using PHP sessions:
    - `POST /api/auth/login` (username + password, verified against bcrypt hash in DB).
    - `POST /api/auth/logout` (destroy session).
    - `GET /api/auth/me` (return current user info and `isGameMaster` flag).
    - Create a middleware helper `requireAuth()` that guards protected endpoints and returns `401 Unauthorized` if no valid session exists.
- [x] **14.3 CORS & Security Middleware:** Create `api/middleware.php`.
    - Implement CORS headers allowing the SvelteKit dev server origin (configurable).
    - Implement CSRF protection for state-changing requests (POST/PUT/DELETE).
    - Add rate limiting (simple in-memory or file-based counter) to prevent abuse.
- [x] **14.4 Database Schema & Migrations:** Create a setup script `api/migrate.php` to generate the tables: `users` (id, username, password_hash, display_name, is_game_master), `campaigns` (id, title, description, poster_url, banner_url, owner_id, chapters_json, enabled_rule_sources_json, gm_global_overrides_text, updated_at), and `characters` (id, campaign_id, owner_id, name, is_npc, character_json, gm_overrides_json, updated_at).
    - _Crucial:_ The `characters` table stores the core ECS state (the `activeFeatures` array, `classLevels`, base attribute scores, temporary modifiers, and `resources` like current HP) as a single `character_json` TEXT field. The `gm_overrides_json` field stores the GM's per-character overrides separately. The backend does _not_ process D&D rules; it just persists the GameEngine's state.
- [x] **14.5 REST API Endpoints:** Create basic RESTful controllers returning JSON payloads:
    - `GET /api/campaigns` & `POST /api/campaigns`
    - `GET /api/campaigns/{id}` (includes chapters; if GM, includes `gmGlobalOverrides`)
    - `PUT /api/campaigns/{id}` (update campaign settings, sources, GM overrides; updates `updated_at`)
    - `GET /api/campaigns/{id}/sync-status` (returns `campaignUpdatedAt` and per-character `updatedAt` timestamps for polling)
    - `GET /api/characters?campaignId=X` (Applies visibility rules: GM gets all + raw `gmOverrides`; players get theirs with overrides already merged invisibly).
    - `POST /api/characters` (Create new character)
    - `PUT /api/characters/{id}` (Save character sheet state — must verify ownership or GM status; updates `updated_at`)
    - `PUT /api/characters/{id}/gm-overrides` (GM-only: save per-character overrides; updates character's `updated_at`)
    - `DELETE /api/characters/{id}` (Must verify ownership or GM status).
- [x] **14.6 Frontend Integration (StorageManager):** Refactor `src/lib/engine/StorageManager.ts` (from Phase 4.1). Replace the `localStorage` logic with asynchronous `fetch()` calls to the new PHP API. Ensure the `GameEngine`'s `$effect` auto-save debounces these API calls (e.g., waits 2 seconds after the user stops making changes before sending the `PUT` request to avoid spamming the server). Implement graceful fallback to `localStorage` if the API is unreachable (offline mode). Implement the **polling mechanism**: check `GET /api/campaigns/{id}/sync-status` every 5-10 seconds, compare timestamps, and selectively re-fetch only changed data.
- [x] **14.7 SvelteKit Proxy Configuration:** Configure `vite.config.ts` to proxy `/api` requests to the PHP development server (e.g., `php -S localhost:8080`) during local development, avoiding CORS issues in dev mode.

### Phase 15: GM Tools - Rule Sources & Override Screens

_Goal: Build the GM-exclusive interfaces for managing rule sources, global overrides, and per-character secret overrides._

- [x] **15.1 Rule Source Manager UI:** Create `src/routes/campaigns/[id]/settings/+page.svelte` (GM-only).
    - Display the list of available JSON rule source files (read from a manifest or directory listing).
    - Allow the GM to **enable/disable** sources and **reorder** them via drag-and-drop (order determines override priority: last wins).
    - Display a summary of what each source provides (number of Features, classes, items, etc.).
    - Save the ordered list to `CampaignSettings.enabledRuleSources`.
- [x] **15.2 Global Override Text Area:** On the same settings page, add a large JSON text area for `gmGlobalOverrides`.
    - Include a JSON validator with clear error messages (red highlight on the offending line).
    - The content is a JSON array of Feature-like objects (any category). Each entry must have a `category` field to identify what it overrides.
    - This override layer is applied **after** all rule source files in the DataLoader resolution chain.
    - Save to `Campaign.gmGlobalOverrides` on the backend.
- [x] **15.3 GM Entity Dashboard:** Create `src/routes/campaigns/[id]/gm-dashboard/+page.svelte` (GM-only).
    - Display a list of all characters, NPCs, and monsters in the campaign.
    - Clicking an entity shows a **read-only summary** of their character sheet (key stats, active effects, current HP, etc.).
    - Below the summary, display a JSON text area for **per-character GM overrides** (`gmOverrides`).
    - This override is stored on the `Character` model and applied **last** in the resolution chain (after global overrides).
    - Include the same JSON validator as in 15.2.
- [x] **15.4 Override Resolution Chain Documentation:** Ensure the DataLoader and GameEngine implement the following strict resolution order:
    1. Base rule source files (in `enabledRuleSources` order, last wins)
    2. `Campaign.gmGlobalOverrides` (applied after all files)
    3. `Character.gmOverrides` (applied last, per-character)
    
    Each layer respects `merge` semantics: `"replace"` (default) overwrites entirely, `"partial"` merges additively with `-prefix` deletion support.

### Phase 16: Backend Unit Testing (PHPUnit)

_Goal: Ensure the PHP API is secure, handles data correctly, and respects the SQLite database._

- [x] **16.1 PHPUnit & Memory DB Setup:** Install PHPUnit. Create a `phpunit.xml` configuring the test environment. Ensure the `Database.php` class connects to `sqlite::memory:` during tests so no actual files are created or corrupted.
- [x] **16.2 Character Persistence Tests:** Create `tests/CharacterControllerTest.php`.
    - Create a mock JSON string representing a complex character state (with nested arrays of `activeFeatures` and `classLevels`).
    - Test `POST`: Ensure the JSON is correctly saved to the DB.
    - Test `GET`: Ensure the retrieved JSON exactly matches the stored data without corruption or encoding issues.
- [x] **16.3 Visibility & Authorization Tests:** Create `tests/VisibilityTest.php`. Mock a session where `isGameMaster = false`. Attempt to fetch a character belonging to another `ownerId`. Assert that the API returns a `403 Forbidden` or filters the character out of the list.
- [x] **16.4 Authentication Tests:** Create `tests/AuthTest.php`. Test login with valid/invalid credentials. Test that protected endpoints reject unauthenticated requests with `401`. Test that session persists across requests.
- [x] **16.5 GM Override Visibility Tests:** Create `tests/GmOverrideTest.php`. Test that a player fetching their own character receives the merged result (with GM overrides applied invisibly). Test that a GM fetching the same character receives both the base data and the raw `gmOverrides` separately.
- [x] **16.6 Sync Timestamp Tests:** Create `tests/SyncTest.php`. Test that modifying a character updates its `updated_at`. Test that `GET /api/campaigns/{id}/sync-status` returns correct timestamps. Test that modifying GM overrides also updates the character's `updated_at`.

### Phase 17: Frontend Engine & Rules Unit Testing (Vitest)

_Goal: Exhaustively test the "Brain" of the VTT. Use Vitest to ensure the mathematical parser, stacking rules, logic trees, and DAG resolve complex D&D 3.5 scenarios perfectly using raw JSON strings as inputs._

- [x] **17.1 Math & Placeholder Tests:** Create `src/tests/mathParser.test.ts`.
    - Provide a mock `characterContext` object.
    - Assert that `evaluateFormula("floor(@attributes.stat_str.totalValue / 2)", context)` correctly extracts the variable and applies the math.
    - Assert complex order of operations: `"(10 + 2) * 1.5"`.
    - Assert pipe resolution: `"@attributes.speed_land.totalValue|distance"` correctly calls the formatter.
- [x] **17.2 Logic Node (Prerequisite) Tests:** Create `src/tests/logicEvaluator.test.ts`.
    - Construct a JSON string of a deeply nested `LogicNode` (e.g., an `AND` node requiring `BAB >= 8`, `tag: weapon_focus`, and a `NOT` node forbidding `tag: heavy_armor`).
    - Assert it returns `true` when the mock context meets all conditions.
    - Assert it returns `false` (and the correct `errorMessage`) when a specific condition fails.
- [x] **17.3 Stacking Rules Tests:** Create `src/tests/stackingRules.test.ts`. Includes DR best-wins grouping tests (Phase 2.4a): all bypass types, multi-source same-bypass suppression, coexisting independent entries, AND-bypass, boundary values.
    - Pass an array of `Modifier` objects: `+2 enhancement`, `+4 enhancement`, `+1 dodge`, `+1 dodge`, `+2 deflection`.
    - Assert the total is exactly `+8` (Takes the highest enhancement (4) + stacks both dodges (2) + deflection (2)).
- [x] **17.4 Dice Engine Tests:** Create `src/tests/diceEngine.test.ts`.
    - Mock the RNG to force specific dice rolls.
    - _Context Test:_ Pass a situational context `["orc"]`. Assert a modifier with `situationalContext: "orc"` is added to the `RollResult`, but one with `"goblin"` is ignored.
    - _Exploding Dice Test:_ Mock a `CampaignSettings` with `explodingTwenties: true`. Force the RNG to roll `20, 20, 5`. Assert the `naturalTotal` is `45` and `numberOfExplosions` is `2`.
- [x] **17.5 DAG Integration Test (The Infinite Loop Check):** Create `src/tests/dagResolution.test.ts`.
    - _The Scenario:_ Provide a JSON `Feature` of a "Belt of Constitution +2".
    - Assert that injecting this feature into the `GameEngine` updates the `stat_con` pipeline (Phase 2), which _automatically_ cascades to update the Fortitude save (Phase 3) and increases the `resources.hp.maxPipelineId` (Phase 4).
    - _Loop Test:_ Inject a malicious custom feature that grants +1 CON based on Max HP. Assert the engine resolves it safely or throws a handled circular dependency error without crashing the test runner.
- [x] **17.6 Multiclass & Level Progression Tests:** Create `src/tests/multiclass.test.ts`.
    - _The Scenario:_ Provide a mock character with `classLevels: { "class_fighter": 5, "class_wizard": 3 }`.
    - Assert that `character_level` resolves to 8.
    - Assert that Fighter's BAB progression (full) contributes +5 and Wizard's (half) contributes +1, for a total BAB of +6.
    - Assert that level-gated features (e.g., Fighter Bonus Feat at level 2 and 4) are correctly granted, while level 6 Fighter Bonus Feat is not (since Fighter level is only 5).
- [x] **17.7 Merge Engine Tests:** Create `src/tests/mergeEngine.test.ts`.
    - _Replace Test:_ Load a base Feature, then load an override with `merge: "replace"`. Assert the original is fully replaced.
    - _Partial Merge Test:_ Load a base Feature, then load a partial with `merge: "partial"` adding new tags, a new `levelProgression` entry, and a new modifier. Assert they are appended correctly while existing data is preserved.
    - _Deletion Test:_ Load a partial with `"-feat_wild_shape"` in `grantedFeatures`. Assert that `feat_wild_shape` is removed from the merged result.
    - _Resolution Chain Test:_ Load a base source, a partial override source, a GM global override, and a GM per-character override. Assert the final resolution follows the correct priority order.

### Phase 18: Tooling, Build Pipeline & Developer Experience

_Goal: Create a complete, zero-dependency build and deployment pipeline, VS Code debug integration, environment variable management, and local runner scripts. All tooling must work both natively (macOS/Linux) and inside Docker containers. The developer should be able to clone, build, test, debug, and deploy without installing global dependencies beyond Node.js._

- [x] **18.1 Docker Build Pipeline:** Create `Dockerfile` (multi-stage: node-deps → type-check → test → build → php-deps → php-test → artifact) and `docker-compose.yml` (single `builder` service with configurable `APP_VERSION`, `NODE_VERSION`, `PHP_VERSION`, `OUTPUT_DIR`). The final stage must produce a compressed tarball containing the SvelteKit build, PHP API, static assets, and an Apache `.htaccess`.
- [x] **18.2 Native Build Script:** Create `scripts/build.sh`. It must bootstrap portable tools in `.build-tools/` (download a static PHP binary if system PHP < 8.1, download Composer PHAR), then execute the full pipeline: npm install → Composer install → svelte-check → Vitest → PHPUnit → Vite build → artifact assembly → tarball. Support `--env`, `--output`, `--deploy`, `--tag`, `--skip-tests`, and `--no-clean` options.
- [x] **18.3 Docker Build Wrapper:** Create `scripts/build-docker.sh`. It must detect Docker/docker-compose availability, export `APP_VERSION` and `OUTPUT_DIR`, then run the Docker multi-stage build. Support `--tag`, `--output`, `--no-cache`, `--push`, and `--registry` options. Verify the output tarball after build.
- [x] **18.4 Local Run Script (Native):** Create `run.sh`. It must auto-locate the latest artifact in `dist/`, resolve the PHP binary (portable or system), load `.env` with priority resolution (shell env > `--env-file` > project root `.env` > artifact `.env`), write a PHP router script (handle `/api/*` → PHP, static files → build/, SPA fallback → `build/index.html`), and auto-run `migrate.php` on first launch. Support `--port`, `--dir`, `--env-file` options.
- [x] **18.5 Local Run Script (Docker):** Create `run-docker.sh`. It must build a minimal `php:8.3-apache` run image (install `pdo_sqlite`, enable `mod_rewrite`), mount the artifact read-only at `/var/www/html`, persist the SQLite DB in a named Docker volume (`character-vault-db`). Support `--port`, `--dir`, `--env-file`, `--no-cache` options.
- [x] **18.6 VS Code Debug Configurations:** Create `.vscode/launch.json` with configurations for: Chrome, Edge, Firefox (frontend on port 5173), PHP/Xdebug (backend on port 9003), compound full-stack sessions (Vite + PHP + browser). Create `.vscode/tasks.json` with background tasks for Vite dev server, PHP dev server, DB migrations, native build, and local server. All PHP configs must use `scripts/php-dev.sh` as runtime. Organize configurations in presentation groups (fullstack → frontend → backend → tests → artifact).
- [x] **18.7 VS Code Extensions:** Create/update `.vscode/extensions.json` with recommendations for Svelte, PHP IntelliSense, Xdebug, ESLint, Prettier, and browser debug tools (Chrome/Edge DevTools, Firefox Debugger).
- [x] **18.8 PHP Binary Resolver:** Create `scripts/php-dev.sh`. Resolution priority: (1) `CHAR_VAULT_PHP` env var override, (2) system PHP with Xdebug when `XDEBUG_MODE` is set, (3) `.build-tools/bin/php` portable binary, (4) system PHP >= 8.1. Print clear warning if Xdebug is requested but not found. Forward all arguments via `exec`.
- [x] **18.9 Environment Variable Support:** Create `.env.example` documenting all supported variables (`APP_ENV`, `DB_PATH`, `CORS_ORIGIN`) with usage instructions for shared hosting, local development, and Docker. Update `api/config.php` to load `.env` files with priority resolution (process env > .env file > built-in defaults). Update `run.sh` and `run-docker.sh` with `--env-file` option and `.env` loading logic.
- [x] **18.10 Version Control & Documentation:** Update `.gitignore` to exclude build artifacts (`dist/`, `dist-pkg/`, `.build-tools/`), portable tools, and sensitive files (`.env`, `*.sqlite*`). Rewrite `README.md` with comprehensive sections: project structure, prerequisites, quick start, development setup, testing, VS Code debugging, building & packaging (native + Docker), running locally, environment variables, and production deployment.

### Phase 19: UI Excellence — Tailwind CSS, Theming, Responsive Design & Iconography

_Goal: Elevate the entire UI to professional-grade quality. Replace all hand-written scoped CSS with Tailwind CSS utility classes. Implement a robust light/dark theme system with system preference detection and cookie persistence. Integrate Lucide Icons to replace all emoji placeholders. Build a responsive layout that works seamlessly on desktop (widescreen), tablet (landscape/portrait), and mobile. Ensure the character sheet uses a full-height layout where tabs are always visible and only the content scrolls. Long data lists (skills, feats, spells) must support horizontal scrolling on narrow viewports. All interactive elements must be properly sized for both mouse and touch input. The migration palette shifts from raw purple (#7c3aed) to a more refined indigo/blue-violet accent. The navigation system uses a collapsible sidebar (icons-only on collapsed desktop, drawer on mobile)._

**Design Decisions (locked in):**
- **CSS Framework:** Tailwind CSS (v4+) with PostCSS
- **Icon Library:** Lucide Icons via `lucide-svelte` (tree-shakable SVG components)
- **Accent Color:** Indigo/blue-violet (Tailwind's `indigo` scale as primary, replacing the raw purple)
- **Theme Strategy:** CSS class-based (`dark` class on `<html>`), Tailwind `darkMode: 'class'`, system preference via `prefers-color-scheme`, user choice persisted in a cookie
- **Navigation:** Collapsible sidebar (full on desktop, icons-only when collapsed, slide-out drawer on mobile)
- **Tab Behavior:** Full-viewport-height layout — tabs are always visible, only tab content scrolls internally
- **Touch Targets:** Minimum 44px on touch devices, adaptive via `@media (pointer: coarse)`

---

- [x] **19.1 Tailwind CSS & PostCSS Setup:** Install Tailwind CSS (v4), PostCSS, and autoprefixer. Create `src/app.css` with Tailwind directives (`@import "tailwindcss"`). Configure `tailwind.config.ts` (or CSS-based config for v4) with the custom theme: extend the color palette with an `accent` scale mapped to Tailwind's `indigo` (replacing the old purple), define semantic color aliases (`surface`, `surface-alt`, `border`, `text-primary`, `text-secondary`, `text-muted`), configure responsive breakpoints (`sm: 640px`, `md: 768px`, `lg: 1024px`, `xl: 1280px`, `2xl: 1536px`), and set `darkMode: 'class'`. Update `svelte.config.js` and `vite.config.ts` if necessary for PostCSS integration. Import `src/app.css` in the root `+layout.svelte`. Verify the build still compiles and Tailwind utilities are available.
    - _Deliverables:_ `tailwind.config.ts` (or equivalent), `postcss.config.js`, `src/app.css`, updated `+layout.svelte`, updated `package.json`.

- [x] **19.2 Theme Engine & Cookie Persistence:** Create `src/lib/stores/ThemeManager.svelte.ts`. Implement a reactive theme store using Svelte 5 runes with three states: `'system'`, `'light'`, `'dark'`. On initialization, read the user's preference from a `theme` cookie (using `document.cookie` parsing). If no cookie exists, default to `'system'`. When the resolved theme is `'system'`, detect the OS preference via `window.matchMedia('(prefers-color-scheme: dark)')` and listen for changes. Apply the resolved theme by toggling the `dark` class on `document.documentElement`. When the user changes their preference, persist it in a cookie with `path=/`, `max-age=31536000` (1 year), and `SameSite=Lax`. Create a `<ThemeToggle />` component (`src/lib/components/ui/ThemeToggle.svelte`) with three-state cycling: System → Light → Dark → System, using Lucide icons (`Monitor`, `Sun`, `Moon`).
    - _Requirement:_ The theme must be applied **before** the first paint to prevent flash-of-wrong-theme (FOWT). Use a `<script>` block in `src/app.html` `<head>` that reads the cookie and applies the `dark` class synchronously.
    - _Requirement:_ Define all theme-aware colors as CSS custom properties in `src/app.css` (e.g., `--color-surface`, `--color-surface-alt`, `--color-border`, `--color-text-primary`, `--color-text-muted`, `--color-accent`), with separate values under `.dark` and default (light). Map these to Tailwind's `theme.extend.colors` so utilities like `bg-surface`, `text-primary`, `border-border` work.

- [x] **19.3 Lucide Icons Integration & Icon Mapping:** Install `lucide-svelte`. Define an icon mapping convention for the project (documented in a comment block or a small mapping file). Replace ALL emoji characters in the codebase with appropriate Lucide icon components. Apply consistent icon sizing: `16px` inline with text, `20px` in buttons and nav items, `24px` in section headers. Ensure icons inherit the current text color via `currentColor`.
    - _Icon mapping (minimum):_
      - **Tabs:** Core → `FileText`, Abilities → `Dumbbell` or `BicepsFlexed`, Combat → `Swords`, Feats → `Star`, Magic → `Sparkles`, Inventory → `Backpack`
      - **Sections:** Settings → `Settings`, Stats → `BarChart3`, Skills → `GraduationCap`, Saves → `Shield`, Health → `Heart`, XP → `TrendingUp`, AC → `ShieldCheck`, Attacks → `Sword`, Movement → `Footprints`, Resistances → `Flame`, DR → `ShieldAlert`, Spells → `BookOpen`, Abilities → `Zap`, Languages → `Languages`, Lore → `Scroll`
      - **Actions:** Add → `Plus`, Delete → `Trash2`, Edit → `Pencil`, Info/Breakdown → `Info`, Dice Roll → `Dices`, Search → `Search`, Filter → `Filter`, Equip → `ArrowUpToLine`, Unequip → `ArrowDownToLine`, Heal → `HeartPulse`, Damage → `Skull`
      - **Navigation:** Campaign → `Map`, Vault → `Users`, Character → `User`, GM Dashboard → `Crown`, Back → `ArrowLeft`, Menu → `Menu`, Close → `X`
      - **Theme:** System → `Monitor`, Light → `Sun`, Dark → `Moon`
      - **Status:** Success → `Check`, Error → `AlertCircle`, Warning → `AlertTriangle`, Locked → `Lock`
    - _Requirement:_ Icons must be used as Svelte components, not as raw SVG strings. This ensures tree-shaking works correctly.

- [x] **19.4 Global Layout Shell & Sidebar Navigation:** Refactor `src/routes/+layout.svelte` to implement the application shell layout. Create `src/lib/components/layout/AppShell.svelte` as the main wrapper providing:
    - **Sidebar** (`src/lib/components/layout/Sidebar.svelte`): Rendered on the left side. On desktop (≥1024px): default to expanded (showing icon + label), with a collapse toggle button that shrinks it to icon-only mode (persisted in a cookie). On tablet (768px-1023px): default to icon-only. On mobile (<768px): hidden by default, slides in as an overlay drawer when the hamburger button is tapped, with a semi-transparent backdrop.
      - _Content:_ App logo/title at the top, navigation links (Campaigns, Vault — contextual to active campaign, Character Sheet — if a character is loaded), a divider, then the Theme Toggle and a user/session indicator at the bottom.
      - _Active state:_ Current route highlighted with accent background and left border indicator.
    - **Main content area:** Takes the remaining width. Has a thin top bar on mobile showing the hamburger menu button, the current page title, and breadcrumb navigation (e.g., "Reign of Winter > Vault > Aldric").
    - _Requirement:_ The sidebar state (expanded/collapsed) must be persisted in a cookie.
    - _Requirement:_ Use Tailwind `transition-all` with `duration-200` for smooth sidebar expand/collapse and drawer animations.

- [x] **19.5 Design System: Base Component Classes & Patterns:** Define a set of reusable Tailwind-based component patterns. These are NOT new Svelte components for simple cases — they are documented utility class combinations applied via Tailwind's `@apply` in `src/app.css` or used directly. For complex interactive patterns, create minimal Svelte wrapper components in `src/lib/components/ui/`.
    - **Cards/Panels:** `.card` class — `bg-surface rounded-lg border border-border shadow-sm` with dark variant. Used for all content sections.
    - **Section Headers:** Consistent pattern: Lucide icon (20px) + label text (`text-sm font-semibold uppercase tracking-wider text-muted`) + optional action buttons aligned right.
    - **Buttons:** Primary (`bg-accent text-white hover:bg-accent-600`), Secondary (`bg-surface-alt border border-border hover:bg-surface`), Danger (`bg-red-600`), Ghost (`hover:bg-surface-alt`). All with `rounded-md px-3 py-2 text-sm font-medium transition-colors`. Touch: minimum `h-11` on `pointer: coarse`.
    - **Inputs:** `bg-surface border border-border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-accent/50 focus:border-accent`. Consistent height matching buttons.
    - **Badges:** Small pills for tags, modifiers, sources. `px-2 py-0.5 rounded-full text-xs font-medium`. Color variants: accent, green (met prerequisite), red (failed), yellow (warning), gray (neutral).
    - **Modals:** Create `src/lib/components/ui/Modal.svelte` — a unified modal wrapper. On desktop: centered overlay with backdrop blur, max-width configurable (sm/md/lg/xl/full). On mobile (<768px): slides up from bottom as a sheet, or goes full-screen for complex modals (feat catalog, grimoire). Includes focus trap, Escape to close, backdrop click to close. Smooth enter/exit transitions.
    - **Horizontal Scroll Container:** Create `src/lib/components/ui/HorizontalScroll.svelte` — a wrapper that enables horizontal scrolling with scroll-snap, fade-out edge shadows (left/right gradients) indicating scrollable content, and optional scroll indicator dots or arrows. Uses `overflow-x: auto`, `scroll-snap-type: x mandatory`, and `scrollbar-width: thin` (or hidden on mobile).
    - **Data Tables:** Define a pattern for tabular data with `overflow-x: auto` wrapper, sticky first column on mobile, alternating row colors in light theme, subtle hover highlight.

- [x] **19.6 Character Sheet Full-Height Layout & Tab Redesign:** Refactor `src/routes/character/[id]/+page.svelte` to implement a full-viewport-height layout:
    - _Structure:_ The character sheet occupies `100vh` minus the sidebar/top-bar height. Inside, the layout is split: a fixed tab navigation bar at the top, and a scrollable content area below that fills the remaining height (`flex-1 overflow-y-auto`).
    - _Tab bar:_ Horizontal row of tab buttons. Each tab shows a Lucide icon (20px) + label text. On mobile (<768px): labels are hidden, only icons shown (with tooltip on long-press or title attribute). The tab bar has `overflow-x: auto` with scroll-snap for swipe navigation between tabs on mobile. Active tab: bold text + accent underline (2px bottom border) + subtle accent background tint.
    - _Content area:_ Uses `overflow-y: auto` with smooth scrolling. Padded appropriately (`p-4` on mobile, `p-6` on desktop).
    - _Requirement:_ The user must NEVER need to scroll the page to reach the tabs. Tabs are always accessible.
    - _Requirement:_ On desktop wide screens (≥1280px), the content area should intelligently use the horizontal space by arranging panels in a multi-column grid (2 or 3 columns), avoiding excessively long single-column layouts.

- [x] **19.7 Core Tab Migration:** Migrate all Core tab components to Tailwind CSS and add Lucide icons:
    - `BasicInfo.svelte`: Redesign the feature selectors (Race, Class, Deity, Alignment, Size) as a clean card with icon-labeled dropdowns. Dynamic badges (e.g., "+2 DEX") use the badge component pattern. Feature choices render as a sub-card with indented styling.
    - `AbilityScoresSummary.svelte`: Compact 6-stat grid. Each stat as a mini-card with the stat icon, value, and modifier. On desktop: horizontal row. On mobile: 3×2 grid or 2×3 grid.
    - `SavingThrowsSummary.svelte`: Three inline stat blocks (Fortitude/Reflex/Will) with Shield icons.
    - `SkillsSummary.svelte`: Condensed list with horizontal scroll on mobile. Use the `HorizontalScroll` container.
    - `LoreAndLanguages.svelte`: Two-column on desktop (story left, languages right), stacked on mobile. Text areas with proper Tailwind styling.
    - _Requirement:_ Remove ALL scoped `<style>` CSS from these components. All styling via Tailwind utility classes only.

- [x] **19.8 Abilities & Skills Tab Migration:** Migrate all Abilities tab components to Tailwind CSS:
    - `AbilityScores.svelte`: 6 ability score panels in a responsive grid (3×2 on desktop, 2×3 on tablet, 1 column on mobile). Each panel: stat name with icon, base score (editable input), modifier display (large prominent number), and action buttons (Info `Info` icon, Roll `Dices` icon). The editable fields must be properly sized for touch.
    - `SavingThrows.svelte`: Three save panels with breakdown display, ability modifier block (color-coded), and action buttons. Responsive grid.
    - `SkillsMatrix.svelte`: This is the most critical component for horizontal scrolling.
      - _Desktop (≥1024px):_ Full table layout with all columns visible. Alternating row styling.
      - _Tablet/Mobile (<1024px):_ The skill table becomes a horizontally scrollable container using the `HorizontalScroll` component. The skill name column is **sticky** (pinned left) while the data columns (ranks, bonus, ability, misc, cost, max) scroll horizontally. This prevents a kilometer-long vertical list.
      - _Header:_ Skill points available/spent displayed as a progress-bar-style indicator.
    - `PointBuyModal.svelte` and `RollStatsModal.svelte`: Redesign as full-screen sheets on mobile, centered modals on desktop. Touch-friendly increment/decrement buttons (≥44px).
    - `ModifierBreakdownModal.svelte` and `DiceRollModal.svelte`: Use the unified `Modal` component. Clean math breakdown layout. Dice results with animated roll display (optional, subtle).

- [x] **19.9 Combat Tab Migration:** Migrate all Combat tab components to Tailwind CSS:
    - `HealthAndXP.svelte`: HP bar redesigned as a full-width visual bar with gradient colors (green → yellow → red). Touch-friendly Heal (`HeartPulse`) and Damage (`Skull`) buttons. XP progress bar with level indicator. Level Up button prominent with `TrendingUp` icon.
    - `ArmorClass.svelte`: Three AC values (Normal, Touch, Flat-Footed) displayed as prominent number cards in a row. Each with breakdown icon. Temp modifier input styled consistently.
    - `CoreCombat.svelte`: BAB, Initiative, Grapple displayed as stat blocks with action buttons. Responsive grid.
    - `Attacks.svelte`: Weapon selection dropdowns with weapon icon. Attack/damage summary as card. Roll buttons prominent.
    - `MovementSpeeds.svelte`: Speed values with `Footprints` icon. Penalty indicators with warning styling.
    - `Resistances.svelte`: Grid of resistance values with element-themed icons (`Flame` for fire, `Snowflake` for cold, etc.).
    - `DamageReduction.svelte`: DR list as cards with delete action. Builder form as a compact inline form.
    - _Layout:_ On desktop (≥1280px), arrange in a 2-column grid: left column (Health, AC, Core Combat), right column (Attacks, Movement, Resistances, DR). On mobile: single column stacked.

- [x] **19.10 Feats & Magic Tabs Migration:** Migrate Feats and Magic tab components to Tailwind CSS:
    - **Feats Tab:**
      - `FeatsTab.svelte`: Header with feat counter (available/left) as badge indicators. Granted feats section with `Lock` icon (read-only). Selected feats with `Trash2` delete action. Responsive card grid.
      - `FeatSelectionModal.svelte`: On mobile: full-screen modal with sticky search bar at top. On desktop: large centered modal. Search input with `Search` icon. Tag badges for feat categories. Prerequisites: `Check` (green) for met, `X` (red) for unmet, with `errorMessage` tooltip. Scrollable feat list.
    - **Magic Tab:**
      - `Grimoire.svelte`: Spell catalog with search and filter. Horizontal scroll by spell level on mobile.
      - `CastingPanel.svelte`: Spells grouped by level in collapsible sections. Prepare counters as touch-friendly stepper buttons. Spell detail modal with school icon and roll button.
      - `SpecialAbilities.svelte`: Ability cards with activation info and resource tracking (uses/day as tappable pips or stepper).

- [x] **19.11 Inventory Tab Migration:** Migrate Inventory tab components to Tailwind CSS:
    - `InventoryTab.svelte`: Three sections (Equipped, Backpack, Storage) as collapsible card groups with distinct visual treatment (Equipped: accent-tinted header, Backpack: neutral, Storage: muted). Each item row: icon (`Package` or weapon/armor icon), name, weight, equip/unequip action button. Slot indicator badges on equipped items.
    - `Encumbrance.svelte`: Full-width encumbrance bar with three tier markers (Light/Medium/Heavy). Current weight displayed numerically. Wealth section as a compact inline form (CP/SP/GP/PP inputs with coin icons).
    - _Mobile:_ Item actions accessible via swipe-to-reveal or action menu (tap → action sheet). Equipment slot validation warnings as toast-style notifications.

- [x] **19.12 Campaign Hub, Vault & GM Tools Migration:** Migrate all non-character-sheet pages to Tailwind CSS:
    - **Campaign Hub** (`/campaigns`): Campaign cards as large image-topped cards in a responsive grid. "Create Campaign" button with `Plus` icon, visible only for GM.
    - **Campaign Details** (`/campaigns/[id]`): Banner image full-width. Chapter list with `Check` icons for completion status. GM controls for chapter management.
    - **Character Vault** (`/campaigns/[id]/vault`): Character cards in responsive grid. Poster image with fallback avatar (Lucide `User` icon). Level badge. Class/race subtitle. Empty state with illustration and CTA buttons.
    - **GM Settings** (`/campaigns/[id]/settings`): Rule source manager with drag-and-drop reorder (styled list with grip handles `GripVertical` icon). JSON text area with monospace font, line numbers, and syntax error highlighting. Light/dark appropriate code editor styling.
    - **GM Dashboard** (`/campaigns/[id]/gm-dashboard`): Entity list as a sidebar list on desktop (responsive split view), drawer on mobile. Read-only character summary as stat cards. Per-character override text area.
    - _Requirement:_ All pages must have smooth theme transitions and consistent card/panel styling.

- [x] **19.13 Touch Adaptation, Accessibility & Cross-Device Polish:** Ensure the entire UI works flawlessly on touch devices and all screen sizes:
    - **Touch targets:** Add a global CSS rule: `@media (pointer: coarse)` increases minimum interactive element height to `44px` (buttons, links, inputs, tab buttons, dropdown options, list items). Increase spacing between adjacent interactive elements to prevent mis-taps.
    - **Focus management:** All interactive elements must have visible focus rings (`ring-2 ring-accent/50 ring-offset-2`) for keyboard navigation. Focus rings hidden for mouse users (`:focus-visible` only).
    - **Responsive spacing:** Define a Tailwind plugin or utility pattern where padding/gaps increase on `pointer: coarse` (e.g., `gap-2` on desktop, `gap-3` on touch).
    - **Scrollbar styling:** Thin scrollbars on desktop (via `scrollbar-width: thin`), hidden scrollbars on mobile (via `scrollbar-width: none` or WebKit pseudo-elements).
    - **Viewport consistency:** Test at: 320px (small phone), 375px (iPhone), 414px (large phone), 768px (tablet portrait), 1024px (tablet landscape), 1280px (laptop), 1536px (desktop), 1920px (widescreen). Ensure no horizontal overflow at any breakpoint.
    - **Animations:** Use `prefers-reduced-motion: reduce` to disable transitions/animations for users who prefer reduced motion.

- [x] **19.14 Legacy CSS Cleanup, Performance Audit & Final QA:** Complete the migration by removing all legacy styles and verifying quality:
    - Remove ALL `<style>` blocks from every `.svelte` component that has been migrated to Tailwind. No scoped CSS should remain except for truly component-specific animation keyframes or pseudo-element hacks that cannot be expressed in Tailwind.
    - Audit `src/app.css` to ensure the `@apply` directives (if used) are minimal and justified. Prefer direct utility classes in templates.
    - Run `npx tailwindcss --content` analysis to verify unused styles are purged. Check final CSS bundle size.
    - Verify that the dark and light themes are visually consistent across ALL pages and components. Check contrast ratios meet WCAG AA (4.5:1 for normal text, 3:1 for large text).
    - Verify the theme cookie is correctly read before first paint (no flash of wrong theme).
    - Verify the sidebar cookie persistence works (collapsed state survives page reload).
    - Smoke-test the complete user flow: landing → campaign hub → vault → character sheet → all 6 tabs → back to vault. Ensure no visual glitches, no broken layouts, no orphaned old styles.
