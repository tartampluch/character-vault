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
- [x] **1.4 Global State & Campaign Settings:** Create `src/lib/types/character.ts` (ActiveFeatureInstance, LinkedEntity with serialization guard, Character with `classLevels` record and `gmOverrides` array) and `src/lib/types/settings.ts` (CampaignSettings with language, point buy budget, reroll 1s, exploding 20s rules, and `enabledRuleSources`). Create `src/lib/types/campaign.ts` (Campaign, Chapter, SceneState).

### Phase 2: Pure Functions & Dice Engine (The Brain)

- [x] **2.1 i18n Formatters:** Create `src/lib/utils/formatters.ts` (Localization and unit conversion based on CampaignSettings).
- [x] **2.2 Math Parser:** Create `src/lib/utils/mathParser.ts` (Evaluate formulas, replace `@` placeholders, and handle `|distance` / `|weight` pipes).
- [x] **2.3 Logic Evaluator:** Create `src/lib/utils/logicEvaluator.ts` (Recursive evaluation of `LogicNode`).
- [x] **2.4 Stacking Rules:** Create `src/lib/utils/stackingRules.ts` (Ignore stacking for identical modifier types unless exceptions apply).
- [x] **2.5 Dice Engine (RNG):** Create `src/lib/utils/diceEngine.ts`. Implement `parseAndRoll(formula, pipeline, context, settings)`. It MUST accept `CampaignSettings` to handle "Exploding 20s" (recursive reroll and add) and "Reroll 1s" (for stat generation). Return a strict `RollResult` type handling crits, fumbles, explosions count, and applying situational buffs.

### Phase 3: Svelte 5 Reactive Engine (The DAG)

- [x] **3.1 Store Skeleton:** Create `src/lib/engine/GameEngine.svelte.ts` (Initialize global state, including `CampaignSettings` and active `Character`).
- [x] **3.2 Flattening & Filtering:** Create Step 0 `$derived` (Flat list of valid modifiers after checking prerequisites, forbidden tags, `classLevel` gating from `levelProgression`, and applying the full Data Override resolution chain including `gmOverrides`).
- [x] **3.3 DAG - Base Attributes:** Create Step 1 & 2 `$derived` (Calculate 6 main stats and their `derivedModifier`, isolating situational modifiers).
- [x] **3.4 DAG - Combat Stats & Skills:** Create Step 3 & 4 `$derived` (Calculate AC, BAB, Saves, Max HP, and Skills using results from previous derivations to prevent infinite loops).

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
- [ ] **8.6 Saving Throws Summary:** Create `src/lib/components/core/SavingThrowsSummary.svelte`. Display Fortitude, Reflex, and Will total modifiers in a compact read-only format.
- [ ] **8.7 Skills Summary:** Create `src/lib/components/core/SkillsSummary.svelte`. Display a condensed skills list (skill name + total bonus). No editing capability — link to Phase 9 for full editing.
- [ ] **8.8 Languages & Lore Component:** Create `src/lib/components/core/LoreAndLanguages.svelte`. Bind text areas for Personal Story, Appearance (Height, Weight, etc.). Implement the Language selection system: calculate available languages (INT mod + Speak Language ranks), display automatically granted languages (from Race/Class features), and provide a dropdown to add new languages until the limit is reached.

### Phase 9: UI Construction - "Abilities & Skills" Tab (Full Interactive Editor)

_Goal: Build the complete interactive Abilities, Saving Throws, and Skills interfaces. These are the full editors with calculation breakdowns, dice rolling modals, and stat generation logic._

- [ ] **9.1 Data Model Extensions:** Update `src/lib/types/feature.ts`. Add `recommendedAttributes?: ID[]` to the `Feature` interface (used by the Point Buy UI to highlight class-preferred stats). Ensure the `SkillPipeline` and `Feature` logic correctly handles "Synergy" modifiers triggered by skill ranks.
- [ ] **9.2 Breakdown & Dice Roll Modals (Shared UI):**
    - Create `src/lib/components/ui/ModifierBreakdownModal.svelte`. It reads a pipeline's `activeModifiers` and displays the math (Base + Modifiers = Final).
    - Create `src/lib/components/ui/DiceRollModal.svelte`. It takes a target pipeline (e.g., Strength, Jump), calls the `DiceEngine.parseAndRoll()` function, and displays the `RollResult` (Natural Roll + Total Bonus = Final Result, highlighting Critical Failures/Successes).
- [ ] **9.3 Ability Scores Panel:** Create `src/lib/components/abilities/AbilityScores.svelte`. Display the 6 main stats (STR to CHA). Show the Final Modifier (`derivedModifier`), Base Score (editable), and Temporary Modifier. Add the "i" button (opens Breakdown) and the "Dice" button (opens Roll Modal) for each stat.
- [ ] **9.4 Stat Generation Wizards (Point Buy & Roll):**
    - Create `PointBuyModal.svelte`. Implement the 3.5 point buy math. Read `recommendedAttributes` from the character's active Class feature to color-code (green/orange/red) the stats. Restrict spending based on `CampaignSettings.statGeneration.pointBuyBudget`.
    - Create `RollStatsModal.svelte`. Implement the 4d6 drop lowest logic. Automatically reroll 1s if `CampaignSettings.statGeneration.rerollOnes` is true. Allow assigning the 6 rolled values to the desired attributes.
- [ ] **9.5 Saving Throws Panel:** Create `src/lib/components/abilities/SavingThrows.svelte`. Display Fortitude, Reflex, and Will. For each, display the Final Modifier, the related Ability Modifier block (color-coded, e.g., CON for Fortitude), Misc Modifiers, and an editable Temporary Modifier input. Include Breakdown and Dice Roll buttons.
- [ ] **9.6 Skills Matrix Panel:** Create `src/lib/components/abilities/SkillsMatrix.svelte`.
    - Create the header calculating "Skill Points Available" vs "Skill Points Spent".
    - Render the table of skills. For each skill: show a checkbox for "Class Skill" (read-only, derived from active classes), Skill Name, Total Bonus, Key Ability label, User Misc input, Ranks input, Cost per rank (1 or 2), and Max allowed ranks (Level + 3, or half for cross-class).
    - _Requirement:_ Typing in the "Ranks" input must directly update the `ranks` property of the specific `SkillPipeline` in the `GameEngine`.
    - _Requirement:_ Ensure Synergy bonuses granted by other skills appear correctly in the Breakdown modal when the "i" button is clicked.

### Phase 10: UI Construction - "Combat" Tab

_Goal: Build the Combat tab containing Health, Experience, Armor Class, Offense (Attacks), Movement, and Defenses. Rely entirely on the DAG pipelines calculated in Phase 3._

- [ ] **10.1 Health & Experience Panel:** Create `src/lib/components/combat/HealthAndXP.svelte`.
    - **Health:** Bind to the `resources.hp` pool. Create the visual HP bar (Current, Temporary, Nonlethal). Implement the "Heal" and "Damage" buttons that open a small prompt to add/subtract from `currentValue` and `temporaryValue` correctly (damage depletes temp HP first). Display the base HP and CON modifier breakdown.
    - **Experience:** Create the XP progress bar. XP thresholds per level are defined in the configuration JSON lookup table (not hardcoded). Add the "Level Up" button.
- [ ] **10.2 Armor Class Panel:** Create `src/lib/components/combat/ArmorClass.svelte`.
    - Read from three distinct pipelines: `combatStats.ac_normal`, `combatStats.ac_touch`, and `combatStats.ac_flat_footed`.
    - _Requirement:_ Include the `ModifierBreakdownModal` (from Phase 9) on the "i" icons so the user can see exactly why their Touch AC ignores Armor/Shield modifiers. Bind the "Temporary Modifier" input to a generic untyped modifier applied to all three AC pipelines.
- [ ] **10.3 Core Combat Stats:** Create `src/lib/components/combat/CoreCombat.svelte`. Display Base Attack Bonus (BAB), Initiative, and Grapple Modifier pipelines. Include the "Dice Roll" and "Breakdown" buttons for Initiative and Grapple.
- [ ] **10.4 Weapons & Attacks Panel:** Create `src/lib/components/combat/Attacks.svelte`.
    - Create dropdowns for Main Hand, Off Hand, and Ranged Weapon. These dropdowns must read from the character's `Inventory` (filtering for `ItemFeature` with weapon tags) plus a default "Unarmed" option.
    - _Requirement:_ Dynamically calculate and display the Total Attack Bonus and Damage Bonus based on the selected weapon (factoring in Weapon Enhancement, STR/DEX modifiers, BAB, and Size). Include "Dice Roll" buttons that pass the weapon's damage dice to the `DiceEngine`.
- [ ] **10.5 Movement Speeds Panel:** Create `src/lib/components/combat/MovementSpeeds.svelte`. Display Land, Burrow, Climb, Fly, and Swim speed pipelines. Explicitly show the "Armor Penalty Effect" and "Load Penalty Effect" pipelines so the player understands why their speed is reduced.
- [ ] **10.6 Energy & Special Resistances:** Create `src/lib/components/combat/Resistances.svelte`. Display pipelines for Fire, Cold, Acid, Electricity, Sonic, Spell Resistance (SR), Power Resistance (PR), and Fortification. Allow user-inputted "Misc Modifiers".
- [ ] **10.7 Damage Reduction (DR) Builder:** Create `src/lib/components/combat/DamageReduction.svelte`.
    - Implement the UI to construct a DR rule (Value, Rule: Bypassed/Excepted, Type: Adamantine/Magic/Slashing).
    - _Requirement:_ When "Add Damage Reduction" is clicked, it should generate a custom `ActiveFeatureInstance` (category: condition/trait) containing the DR modifier and push it to the `GameEngine`. Display the list of active DRs with a delete button.

### Phase 11: UI Construction - "Feats" Tab

_Goal: Build the Feats management interface. This involves tracking available feat slots, distinguishing between automatically granted features and player-selected feats, and building a catalog modal that rigorously enforces D&D 3.5 prerequisites using the Logic Engine._

- [ ] **11.1 Feat Capacity Pipeline:** In `GameEngine`, establish a specific pipeline/resource to calculate `Feat Slots`.
    - _Base logic:_ `1 + floor(character_level / 3)`.
    - _Bonus logic:_ Add bonus slots granted by other features (e.g., Human bonus feat, Fighter bonus feats). Calculate "Feats Left" by subtracting the number of manually selected feats from this total.
- [ ] **11.2 Feats Tab Layout & Lists:** Create `src/lib/components/feats/FeatsTab.svelte`.
    - Render the header showing "Feats Available" and "Feats Left" dynamically.
    - Create a `Granted Feats` section: Loop through `activeFeatures` to find features automatically granted by a parent feature (like Class or Race). Display them as read-only (no delete button). Show the source tag (e.g., "Druid" or "Gnome").
    - Create a `Selected Feats` section: List the feats manually chosen by the player, with a "Delete" button to free up the slot.
- [ ] **11.3 Feat Catalog Modal (Search & Filter):** Create `src/lib/components/feats/FeatSelectionModal.svelte`.
    - Fetch all features with `category: "feat"` from the `DataLoader`.
    - Implement a text search bar (filtering by title and description).
    - Implement visual tags (e.g., reading the `tags` array to display badges like "Fighter Bonus Feat" or "Metamagic").
- [ ] **11.4 Prerequisite Evaluation UI:** Inside the `FeatSelectionModal`, implement the logic constraint UI.
    - For each feat in the list, run its `prerequisitesNode` through the `logicEvaluator`.
    - If the evaluation fails, disable the "Select" button/row for that feat.
    - _Requirement:_ Extract the specific `errorMessage` from the failing `LogicNode`s (e.g., "Dexterity 19", "BAB +11") and display them in red. Met prerequisites should be displayed in a neutral/green color.

### Phase 12: UI Construction - "Spells & Powers" Tab

_Goal: Build the Magic, Psionics, and Special Abilities interface. This tab manages Spellbooks, Power Points, Domain Powers, and daily casting limits using the `MagicFeature` and `ResourcePool` models._

- [ ] **12.1 Magic Resources & Limits:** In `GameEngine`, derive the spellcasting/manifesting limits.
    - Calculate `Caster Level` and `Manifester Level` pipelines based on active classes.
    - Calculate available `Spell Slots` (per level) or `Power Points` (PP) max by reading the class JSON formulas and the relevant key ability modifier (e.g., INT for Wizards, WIS for Clerics).
- [ ] **12.2 Spells/Powers Catalog (The Grimoire):** Create `src/lib/components/magic/Grimoire.svelte`.
    - Build an interface allowing the player to "Learn" or "Add" spells to their spellbook.
    - _Filter Logic:_ Fetch `MagicFeature` items from `DataLoader`. Filter them so the UI only shows spells/powers corresponding to the character's active `spellLists` (e.g., if Cleric level 3, only show Cleric spells up to level 2).
- [ ] **12.3 Preparation & Casting Panel:** Create `src/lib/components/magic/CastingPanel.svelte`.
    - _Layout:_ Group known spells by Level (0 to 9).
    - _Interaction:_ Add a "Prepare" counter (for Vancian magic like Wizards/Clerics) or a "Cast/Manifest" button (for Sorcerers/Psions).
    - _Breakdown UI:_ Clicking a spell opens a modal displaying its School, Components, Range, Duration, and a "Dice Roll" button for damage/healing. Calculate the Spell Save DC dynamically (`10 + Spell Level + Key Ability Mod`).
- [ ] **12.4 Special & Domain Abilities Panel:** Create `src/lib/components/magic/SpecialAbilities.svelte`.
    - Filter the character's `activeFeatures` for abilities categorized as `class_feature` or `domain` that have an `activation` type (e.g., "Standard Action", "3/Day").
    - Display these as distinct cards. Tie their daily uses to localized `ResourcePool`s so the player can tick off uses (e.g., Turn Undead uses per day).

### Phase 13: UI Construction - "Inventory" Tab

_Goal: Manage equipment, slots, encumbrance, and wealth. The UI must enforce equipment slot limits dynamically based on the engine's pipelines, and calculate weight penalties accurately._

- [ ] **13.1 Equipment Slot Pipelines:** In `GameEngine`, establish base pipelines for body slots (e.g., `slots.head`, `slots.ring`, `slots.body`, `slots.main_hand`). Set default base values (e.g., `slots.ring` = 2, `slots.head` = 1). This ensures exotic races can simply apply modifiers to these pipelines to gain extra slots.
- [ ] **13.2 Inventory Sections & Layout:** Create `src/lib/components/inventory/InventoryTab.svelte`. Divide the layout into three distinct visual containers:
    1. **Equipped / Readied:** Items actively worn or held.
    2. **Backpack / Carried:** Items on the character's person but not granting active stats (contributes to weight).
    3. **Storage / Stashed:** Items kept in a wagon, mount, or home (does not contribute to weight).
- [ ] **13.3 Equip & Slot Enforcement Logic:** Create the item interaction logic.
    - When a user clicks "Equip" on an item in the Backpack, the UI must check the item's `equipmentSlot` tag (e.g., "ring").
    - It then checks the `slots.ring` pipeline. If the number of currently equipped rings equals the max allowed, the UI blocks the action and shows a warning ("Ring slots full. Unequip an item first.").
    - _Action:_ If successful, toggle the `isActive` boolean on the `ActiveFeatureInstance`. The `GameEngine` will automatically inject its modifiers (like Armor AC or Sword Damage) into the DAG.
    - _Two-Handed Weapons:_ If `equipmentSlot` is `two_hands`, the engine must check that both `slots.main_hand` and `slots.off_hand` are free, and occupy both when equipped.
- [ ] **13.4 Encumbrance & Wealth Calculator:** Create `src/lib/components/inventory/Encumbrance.svelte`.
    - _Weight Calculation:_ Create a `$derived` that sums the `weightLbs` of all items in the "Equipped" and "Backpack" categories.
    - _Encumbrance Tiers:_ Compare total weight against the character's Strength carrying capacity (thresholds loaded from a configuration JSON lookup table, not hardcoded). If the load is Medium or Heavy, automatically dispatch a situational `condition_encumbered` feature to the engine to apply speed and armor check penalties.
    - _Wealth:_ Add simple input fields for CP, SP, GP, PP, and calculate their total weight (standard rule: 50 coins = 1 lb).

### Phase 14: PHP Backend & Frontend Integration

_Goal: Replace the local storage mock with a PHP backend using PDO and SQLite. The backend will serve as a REST API to persist Campaigns, Users, and Character states. Designed for cheap shared hosting (e.g., OVH shared hosting)._

- [ ] **14.1 Database Configuration & PDO Setup:** Create the backend folder structure (`/api`). Create `api/config.php` containing DB path for SQLite and an environment mode toggle (`production` / `development`). Create a singleton `api/Database.php` wrapper using PDO with SQLite as the sole driver. Ensure it supports falling back to an in-memory SQLite DB (`sqlite::memory:`) if a test environment variable is detected.
- [ ] **14.2 Authentication System:** Create `api/auth.php`. Implement a simple session-based authentication using PHP sessions:
    - `POST /api/auth/login` (username + password, verified against bcrypt hash in DB).
    - `POST /api/auth/logout` (destroy session).
    - `GET /api/auth/me` (return current user info and `isGameMaster` flag).
    - Create a middleware helper `requireAuth()` that guards protected endpoints and returns `401 Unauthorized` if no valid session exists.
- [ ] **14.3 CORS & Security Middleware:** Create `api/middleware.php`.
    - Implement CORS headers allowing the SvelteKit dev server origin (configurable).
    - Implement CSRF protection for state-changing requests (POST/PUT/DELETE).
    - Add rate limiting (simple in-memory or file-based counter) to prevent abuse.
- [ ] **14.4 Database Schema & Migrations:** Create a setup script `api/migrate.php` to generate the tables: `users` (id, username, password_hash, display_name, is_game_master), `campaigns` (id, title, description, poster_url, banner_url, owner_id, chapters_json, enabled_rule_sources_json, gm_global_overrides_text, updated_at), and `characters` (id, campaign_id, owner_id, name, is_npc, character_json, gm_overrides_json, updated_at).
    - _Crucial:_ The `characters` table stores the core ECS state (the `activeFeatures` array, `classLevels`, base attribute scores, temporary modifiers, and `resources` like current HP) as a single `character_json` TEXT field. The `gm_overrides_json` field stores the GM's per-character overrides separately. The backend does _not_ process D&D rules; it just persists the GameEngine's state.
- [ ] **14.5 REST API Endpoints:** Create basic RESTful controllers returning JSON payloads:
    - `GET /api/campaigns` & `POST /api/campaigns`
    - `GET /api/campaigns/{id}` (includes chapters; if GM, includes `gmGlobalOverrides`)
    - `PUT /api/campaigns/{id}` (update campaign settings, sources, GM overrides; updates `updated_at`)
    - `GET /api/campaigns/{id}/sync-status` (returns `campaignUpdatedAt` and per-character `updatedAt` timestamps for polling)
    - `GET /api/characters?campaignId=X` (Applies visibility rules: GM gets all + raw `gmOverrides`; players get theirs with overrides already merged invisibly).
    - `POST /api/characters` (Create new character)
    - `PUT /api/characters/{id}` (Save character sheet state — must verify ownership or GM status; updates `updated_at`)
    - `PUT /api/characters/{id}/gm-overrides` (GM-only: save per-character overrides; updates character's `updated_at`)
    - `DELETE /api/characters/{id}` (Must verify ownership or GM status).
- [ ] **14.6 Frontend Integration (StorageManager):** Refactor `src/lib/engine/StorageManager.ts` (from Phase 4.1). Replace the `localStorage` logic with asynchronous `fetch()` calls to the new PHP API. Ensure the `GameEngine`'s `$effect` auto-save debounces these API calls (e.g., waits 2 seconds after the user stops making changes before sending the `PUT` request to avoid spamming the server). Implement graceful fallback to `localStorage` if the API is unreachable (offline mode). Implement the **polling mechanism**: check `GET /api/campaigns/{id}/sync-status` every 5-10 seconds, compare timestamps, and selectively re-fetch only changed data.
- [ ] **14.7 SvelteKit Proxy Configuration:** Configure `vite.config.ts` to proxy `/api` requests to the PHP development server (e.g., `php -S localhost:8080`) during local development, avoiding CORS issues in dev mode.

### Phase 15: GM Tools - Rule Sources & Override Screens

_Goal: Build the GM-exclusive interfaces for managing rule sources, global overrides, and per-character secret overrides._

- [ ] **15.1 Rule Source Manager UI:** Create `src/routes/campaigns/[id]/settings/+page.svelte` (GM-only).
    - Display the list of available JSON rule source files (read from a manifest or directory listing).
    - Allow the GM to **enable/disable** sources and **reorder** them via drag-and-drop (order determines override priority: last wins).
    - Display a summary of what each source provides (number of Features, classes, items, etc.).
    - Save the ordered list to `CampaignSettings.enabledRuleSources`.
- [ ] **15.2 Global Override Text Area:** On the same settings page, add a large JSON text area for `gmGlobalOverrides`.
    - Include a JSON validator with clear error messages (red highlight on the offending line).
    - The content is a JSON array of Feature-like objects (any category). Each entry must have a `category` field to identify what it overrides.
    - This override layer is applied **after** all rule source files in the DataLoader resolution chain.
    - Save to `Campaign.gmGlobalOverrides` on the backend.
- [ ] **15.3 GM Entity Dashboard:** Create `src/routes/campaigns/[id]/gm-dashboard/+page.svelte` (GM-only).
    - Display a list of all characters, NPCs, and monsters in the campaign.
    - Clicking an entity shows a **read-only summary** of their character sheet (key stats, active effects, current HP, etc.).
    - Below the summary, display a JSON text area for **per-character GM overrides** (`gmOverrides`).
    - This override is stored on the `Character` model and applied **last** in the resolution chain (after global overrides).
    - Include the same JSON validator as in 15.2.
- [ ] **15.4 Override Resolution Chain Documentation:** Ensure the DataLoader and GameEngine implement the following strict resolution order:
    1. Base rule source files (in `enabledRuleSources` order, last wins)
    2. `Campaign.gmGlobalOverrides` (applied after all files)
    3. `Character.gmOverrides` (applied last, per-character)
    
    Each layer respects `merge` semantics: `"replace"` (default) overwrites entirely, `"partial"` merges additively with `-prefix` deletion support.

### Phase 16: Backend Unit Testing (PHPUnit)

_Goal: Ensure the PHP API is secure, handles data correctly, and respects the SQLite database._

- [ ] **16.1 PHPUnit & Memory DB Setup:** Install PHPUnit. Create a `phpunit.xml` configuring the test environment. Ensure the `Database.php` class connects to `sqlite::memory:` during tests so no actual files are created or corrupted.
- [ ] **16.2 Character Persistence Tests:** Create `tests/CharacterControllerTest.php`.
    - Create a mock JSON string representing a complex character state (with nested arrays of `activeFeatures` and `classLevels`).
    - Test `POST`: Ensure the JSON is correctly saved to the DB.
    - Test `GET`: Ensure the retrieved JSON exactly matches the stored data without corruption or encoding issues.
- [ ] **16.3 Visibility & Authorization Tests:** Create `tests/VisibilityTest.php`. Mock a session where `isGameMaster = false`. Attempt to fetch a character belonging to another `ownerId`. Assert that the API returns a `403 Forbidden` or filters the character out of the list.
- [ ] **16.4 Authentication Tests:** Create `tests/AuthTest.php`. Test login with valid/invalid credentials. Test that protected endpoints reject unauthenticated requests with `401`. Test that session persists across requests.
- [ ] **16.5 GM Override Visibility Tests:** Create `tests/GmOverrideTest.php`. Test that a player fetching their own character receives the merged result (with GM overrides applied invisibly). Test that a GM fetching the same character receives both the base data and the raw `gmOverrides` separately.
- [ ] **16.6 Sync Timestamp Tests:** Create `tests/SyncTest.php`. Test that modifying a character updates its `updated_at`. Test that `GET /api/campaigns/{id}/sync-status` returns correct timestamps. Test that modifying GM overrides also updates the character's `updated_at`.

### Phase 17: Frontend Engine & Rules Unit Testing (Vitest)

_Goal: Exhaustively test the "Brain" of the VTT. Use Vitest to ensure the mathematical parser, stacking rules, logic trees, and DAG resolve complex D&D 3.5 scenarios perfectly using raw JSON strings as inputs._

- [ ] **17.1 Math & Placeholder Tests:** Create `src/tests/mathParser.test.ts`.
    - Provide a mock `characterContext` object.
    - Assert that `evaluateFormula("floor(@attributes.stat_str.totalValue / 2)", context)` correctly extracts the variable and applies the math.
    - Assert complex order of operations: `"(10 + 2) * 1.5"`.
    - Assert pipe resolution: `"@attributes.speed_land.totalValue|distance"` correctly calls the formatter.
- [ ] **17.2 Logic Node (Prerequisite) Tests:** Create `src/tests/logicEvaluator.test.ts`.
    - Construct a JSON string of a deeply nested `LogicNode` (e.g., an `AND` node requiring `BAB >= 8`, `tag: weapon_focus`, and a `NOT` node forbidding `tag: heavy_armor`).
    - Assert it returns `true` when the mock context meets all conditions.
    - Assert it returns `false` (and the correct `errorMessage`) when a specific condition fails.
- [ ] **17.3 Stacking Rules Tests:** Create `src/tests/stackingRules.test.ts`.
    - Pass an array of `Modifier` objects: `+2 enhancement`, `+4 enhancement`, `+1 dodge`, `+1 dodge`, `+2 deflection`.
    - Assert the total is exactly `+8` (Takes the highest enhancement (4) + stacks both dodges (2) + deflection (2)).
- [ ] **17.4 Dice Engine Tests:** Create `src/tests/diceEngine.test.ts`.
    - Mock the RNG to force specific dice rolls.
    - _Context Test:_ Pass a situational context `["orc"]`. Assert a modifier with `situationalContext: "orc"` is added to the `RollResult`, but one with `"goblin"` is ignored.
    - _Exploding Dice Test:_ Mock a `CampaignSettings` with `explodingTwenties: true`. Force the RNG to roll `20, 20, 5`. Assert the `naturalTotal` is `45` and `numberOfExplosions` is `2`.
- [ ] **17.5 DAG Integration Test (The Infinite Loop Check):** Create `src/tests/dagResolution.test.ts`.
    - _The Scenario:_ Provide a JSON `Feature` of a "Belt of Constitution +2".
    - Assert that injecting this feature into the `GameEngine` updates the `stat_con` pipeline (Phase 2), which _automatically_ cascades to update the Fortitude save (Phase 3) and increases the `resources.hp.maxPipelineId` (Phase 4).
    - _Loop Test:_ Inject a malicious custom feature that grants +1 CON based on Max HP. Assert the engine resolves it safely or throws a handled circular dependency error without crashing the test runner.
- [ ] **17.6 Multiclass & Level Progression Tests:** Create `src/tests/multiclass.test.ts`.
    - _The Scenario:_ Provide a mock character with `classLevels: { "class_fighter": 5, "class_wizard": 3 }`.
    - Assert that `character_level` resolves to 8.
    - Assert that Fighter's BAB progression (full) contributes +5 and Wizard's (half) contributes +1, for a total BAB of +6.
    - Assert that level-gated features (e.g., Fighter Bonus Feat at level 2 and 4) are correctly granted, while level 6 Fighter Bonus Feat is not (since Fighter level is only 5).
- [ ] **17.7 Merge Engine Tests:** Create `src/tests/mergeEngine.test.ts`.
    - _Replace Test:_ Load a base Feature, then load an override with `merge: "replace"`. Assert the original is fully replaced.
    - _Partial Merge Test:_ Load a base Feature, then load a partial with `merge: "partial"` adding new tags, a new `levelProgression` entry, and a new modifier. Assert they are appended correctly while existing data is preserved.
    - _Deletion Test:_ Load a partial with `"-feat_wild_shape"` in `grantedFeatures`. Assert that `feat_wild_shape` is removed from the merged result.
    - _Resolution Chain Test:_ Load a base source, a partial override source, a GM global override, and a GM per-character override. Assert the final resolution follows the correct priority order.
