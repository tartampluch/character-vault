# Prompt

You are an expert developer in Svelte 5 and TypeScript. We are developing a Virtual Tabletop (VTT) RPG engine for D&D 3.5 based on a "Data-Driven" Entity-Component-System (ECS) architecture. All rules are defined in JSONs; the engine only resolves logic trees and mathematical pipelines.

I have provided the complete Architecture Document and Annexes in your context. Your goal is to strictly and sequentially follow the checklist below.

Create a `PROGRESS.md` file at the root of the workspace. Extract the entire "Checklist" section (all phases, including all sub-tasks) and format it exactly as a GitHub-flavored markdown task list with unchecked boxes `- [ ]`. Add and check off a setup task at the top: `- [x] Initialize Project & PROGRESS.md`. At the very top of the `PROGRESS.md` file, copy the entire CRITICAL CODING GUIDELINES section to make sure it stays in the context the whole time.

Once the `PROGRESS.md` file is successfully created and saved, apply the Pause & Acknowledge Protocol. Confirm that the file is ready, and **stop completely**. Wait for my explicit command to begin the first coding task.

**CRITICAL CODING GUIDELINES:**

0. **Context Loading:** The architecture is split into two files. `ARCHITECTURE.md` must be loaded for EVERY task. `ANNEXES.md` (complete JSON examples and config tables) should be loaded when the current task requires reference data (Phases 1, 5, 17, or when explicitly instructed).
1. **Language:** All code, variables, and comments MUST be in English.
2. **Comments:** Comments must be exhaustive, educational, and explain the _why_ behind complex logic (especially for D&D 3.5 specificities like DAG resolution, stacking rules, or Exploding Dice mechanics).
3. **Quality:** Prioritize extreme readability, modularity, and strict TypeScript typing. Apply software engineering best practices so any other developer or AI can easily onboard and scale the project.
4. **Workflow & Source of Truth:** The official project checklist will reside in a `PROGRESS.md` file at the root of the project. At each iteration, I will explicitly instruct you which specific task to tackle next (e.g., "Execute Phase 1.2"). You must provide the complete code for the requested file(s) ensuring they perfectly respect the Architecture Document. Do not skip steps. Do not anticipate future steps.
5. **ZERO HARDCODING:** The engine and UI must be 100% agnostic. Never hardcode specific D&D terms (like "Fighter", "Elf", "Strength", or "Longsword") in your TypeScript logic or Svelte templates.
6. **QUOTA MANAGEMENT & ATOMIC WORKFLOW:** To prevent mid-task interruptions due to context limits, you must operate in strict, isolated steps.
    1. **One Task at a Time:** I will prompt you with a specific sub-task (e.g., "Do Phase 1.1"). You must ONLY execute that single sub-task. Do NOT chain multiple sub-tasks together unless explicitly commanded.
    2. **The Stable State Guarantee:** Before finishing your turn, you must ensure the codebase is completely stable. There must be no unresolved imports, no dangling functions, and no TypeScript errors. If a task requires modifying 3 files, do them all in the same turn so the project compiles perfectly at the end.
    3. **The Pause & Acknowledge Protocol:** When you finish the requested sub-task, stop completely. Do not anticipate the next step. End your response by stating: _"Task [X.X] is complete and stable. Ready for the next task."_
    4. **Progress Tracking (The Breadcrumb):** Create and update a `PROGRESS.md` file at the root of the project. Every time you complete a sub-task from the checklist, check it off in this file. This ensures that if our session is interrupted, you can instantly read this file upon reboot to know exactly where we left off.

---

# Checklist

### Phase 1: Typed Foundations (Data Models)

_Goal: Define the complete TypeScript type system up-front. All interfaces — including every sub-type extension — are established here so subsequent phases can build on a stable contract._

- [ ] **1.1 Primitives & i18n:** Create `src/lib/types/primitives.ts` with `ID` (string alias), complete `ModifierType` union (enhancement, deflection, natural_armor, armor, shield, luck, morale, competence, racial, insight, sacred, profane, circumstance, dodge, synergy, untyped, resistance, base, setAbsolute, `"damage_reduction"`, `"inherent"`, `"max_dex_cap"`), and `LogicOperator`. Create `src/lib/types/i18n.ts` (`LocalizedString`, `I18N_CONFIG`). Per `ARCHITECTURE.md` §2.

- [ ] **1.2 Logic & Pipeline Types:** Create `src/lib/types/logic.ts` (recursive `LogicNode` — AND, OR, NOT, CONDITION node types with all 8 `LogicOperator` values). Create `src/lib/types/pipeline.ts`: `Modifier` (required `sourceId`, `sourceName`, `targetId`, `value`, `type`; optional `drBypassTags?: string[]`, `situationalContext?`, JSDoc for the `"attacker.*"` target prefix convention); `StatisticPipeline` with `derivedModifier`; `SkillPipeline`; `ResourcePool` with 8-value `resetCondition` union: `"short_rest"`, `"long_rest"`, `"encounter"`, `"never"`, `"per_turn"`, `"per_round"`, `"per_day"`, `"per_week"` and optional `rechargeAmount?: number | string`. Per `ARCHITECTURE.md` §3–4.4.

- [ ] **1.3 Unified Feature Model:** Create `src/lib/types/feature.ts` as the complete feature type system per `ARCHITECTURE.md` §5–5.7 and `ANNEXES.md` A.1–A.12. Base `Feature`: `levelProgression`, `resourcePoolTemplates?: ResourcePoolTemplate[]` (export `ResourcePoolTemplate` with `poolId`, `label`, `maxPipelineId`, `defaultCurrent`, `resetCondition`, `rechargeAmount?`), `actionBudget?` (6 optional numeric keys: standard, move, swift, immediate, free, full_round), `recommendedAttributes?`. `activation`: 10-value `actionType` union (standard, move, swift, immediate, free, full_round, passive, reaction), `triggerEvent?`, `tieredResourceCosts?: ActivationTier[]` (export `ActivationTier` with `label`, `targetPoolId`, `cost`, `grantedModifiers`). `ItemFeature`: `two_hands` slot; `psionicItemData?` (export `PsionicItemType` — 5-value union, `PowerStoneEntry` with `powerId`/`manifesterLevel`/`usedUp`); `weaponData.onCritDice?` (export `OnCritDiceSpec` with `baseDiceFormula`, `damageType`, `scalesWithCritMultiplier`); `metamagicEffect?` (6-feat union, `maxSpellLevel: 3|6|9`); `staffSpells?` (`chargeCost: 1|2|3|4|5`); `wandSpell?` (`casterLevel`, optional `spellLevel`); `scrollSpells?` (required `spellLevel`, `spellType: "arcane"|"divine"`); `removalPrevention?` (`isCursed: true`, `removableBy`); `intelligentItemData?` (INT/WIS/CHA scores, egoScore, 9-value alignment, 3-value communication, senses with discrete vision ranges); `isUnique?`; `artifactTier?`. `MagicFeature`: `discipline?: PsionicDiscipline` (export 6-value union), `displays?: PsionicDisplay[]` (export 5-value union). `AugmentationRule`: `effectDescription?: LocalizedString`. `FeatureChoice`: `choiceGrantedTagPrefix?`. All fields exhaustively documented with SRD authoring patterns per `ARCHITECTURE.md` §4.9–4.17, 5.1.1, 5.2.1, 5.3.1, 5.5b, 5.6, 5.7.

- [ ] **1.4 Global State & Campaign Settings:** Create `src/lib/types/character.ts`: `ActiveFeatureInstance` with `itemResourcePools?: Record<string, number>` and `ephemeral?: { isEphemeral: true; appliedAtRound?: number; sourceItemInstanceId?: string; durationHint?: string }`; `LinkedEntity` with serialization guard; `Character` with `classLevels`, `gmOverrides`, `minimumSkillRanks?: Record<ID, number>`, `levelAdjustment: number`, `xp: number`, and all UI metadata fields (`campaignId`, `ownerId`, `isNPC`, `posterUrl`, `playerRealName`, `customSubtitle`). Create `src/lib/types/settings.ts`: `CampaignSettings` with `language`, `statGeneration`, `diceRules`, `enabledRuleSources`, `variantRules: { vitalityWoundPoints: boolean; gestalt: boolean }`. Create `src/lib/types/campaign.ts`: `Campaign` (with `gmGlobalOverrides`, `enabledRuleSources`, `updatedAt`), `Chapter`, `SceneState`. Per `ARCHITECTURE.md` §6–8.

### Phase 2: Pure Functions & Dice Engine (The Brain)

_Goal: Build all pure, stateless utility functions. These have no Svelte dependencies and can be tested in isolation._

- [ ] **2.1 i18n Formatters:** Create `src/lib/utils/formatters.ts` (localization helpers and unit conversion based on `CampaignSettings` locale).

- [ ] **2.2 Math Parser:** Create `src/lib/utils/mathParser.ts`. Evaluate formula strings, replace `@` placeholders with character context values. Support all paths per `ARCHITECTURE.md` §4.3: `@characterLevel`, `@eclForXp`, `@classLevels.<id>`, `@activeTags`, `@selection.<choiceId>`, `@constant.<id>`, `@master.classLevels.<id>`. Handle `|distance` and `|weight` pipes. Return 0 and log warning for unresolved paths. Export `CharacterContext` type with `eclForXp` field.

- [ ] **2.3 Logic Evaluator:** Create `src/lib/utils/logicEvaluator.ts`. Recursive evaluation of `LogicNode` trees (AND, OR, NOT, CONDITION). Support all 8 `LogicOperator` values (`==`, `>=`, `<=`, `!=`, `includes`, `not_includes`, `has_tag`, `missing_tag`). Return `errorMessage` from failing CONDITION nodes.

- [ ] **2.4 Stacking Rules:** Create `src/lib/utils/stackingRules.ts`. Standard stacking: `dodge`, `circumstance`, `synergy`, `untyped` stack additively; all other types keep highest only. `setAbsolute` overrides all (last wins). `"damage_reduction"` handled as a separate pass: group by sorted `drBypassTags` signature, keep highest per group, return `StackingResult.drEntries[]` with `amount`, `bypassTags`, `sourceModifier`, `suppressedModifiers`. Note: `"max_dex_cap"` is intercepted at DAG level (Phase 3.5), not subject to this function. Per `ARCHITECTURE.md` §4.2 and 4.5.

- [ ] **2.5 Gestalt Rules:** Create `src/lib/utils/gestaltRules.ts`. Export `computeGestaltBase(modifiers, classLevels, characterLevel)` (max-per-level from each contributing class, then sum), `groupBaseModifiersByClass()`, `GESTALT_AFFECTED_PIPELINES` Set (`combatStats.bab`, `saves.fort`, `saves.ref`, `saves.will` — NOT `combatStats.max_hp`), `isGestaltAffectedPipeline()`. Per `ARCHITECTURE.md` §8.1–8.2.

- [ ] **2.6 Dice Engine (RNG):** Create `src/lib/utils/diceEngine.ts`. Implement `parseAndRoll(formula, pipeline, context, settings, rng?, situationalModifiers?, defenderAttackerMods?, defenderFortificationPct?, weaponOnCritDice?, critMultiplier?)` per `ARCHITECTURE.md` §17. Export `DamageTargetPool` (`"res_hp" | "res_vitality" | "res_wound_points"`), `OnCritDiceSpec` (re-export from feature.ts), `RollResult` (with required `targetPool`, optional `fortification?: { roll, pct, critNegated }`, `onCritDiceRolled?: { formula, rolls, totalAdded, damageType }`, `attackerPenaltiesApplied?: Modifier[]`), `RollContext` (with optional `isCriticalHit?`). Implement: injectable `rng` for deterministic tests; Exploding 20s (recursive reroll + accumulate); Reroll 1s; V/WP routing (`"res_wound_points"` on confirmed crit, `"res_vitality"` otherwise, `"res_hp"` when V/WP disabled); `attacker.*` modifier resolution (strip prefix, match pipeline, apply `situationalContext` filtering, add to `finalTotal`); fortification crit negation (roll 1d100 ≤ pct → `critNegated: true`, negated crits route to `"res_vitality"` in V/WP mode); on-crit burst dice (parse `baseDiceFormula`, scale by `(critMultiplier − 1)` when `scalesWithCritMultiplier`, add to `finalTotal`, absent when crit negated). Per `ARCHITECTURE.md` §4.6–4.7, 4.9, 8.3.

### Phase 3: Svelte 5 Reactive Engine (The DAG)

_Goal: Build the reactive game engine as a Svelte 5 store. Each DAG phase is a `$derived` rune that builds on the previous, forming a topological dependency graph._

- [ ] **3.1 Store Skeleton & Default Pipelines:** Create `src/lib/engine/GameEngine.svelte.ts`. Initialize global Svelte 5 `$state` for `CampaignSettings` and active `Character`. Initialize all default pipeline maps: 6 ability score pipelines, full `combatStats` map including `combatStats.fortification` (baseValue 0), `combatStats.arcane_spell_failure` (baseValue 0), `combatStats.max_dex_bonus` (baseValue 99 = uncapped), `combatStats.ac_normal/touch/flat_footed`, `combatStats.bab`, `combatStats.initiative`, `combatStats.grapple`, `combatStats.max_hp`; `saves.fort/ref/will`; all skill pipelines; feat slot pipeline; equipment slot pipelines (`slots.ring = 2`, `slots.head = 1`, etc.); character resource pools. Per `ARCHITECTURE.md` §9, 4.7–4.17.

- [ ] **3.2 Flattening & Filtering (DAG Phase 0):** `$derived` producing flat validated modifier list. Per feature instance: check `prerequisitesNode` via Logic Evaluator against current context, check `forbiddenTags`, apply `classLevel` gating from `levelProgression`. Apply full Data Override resolution chain (rule files in `enabledRuleSources` order → `Campaign.gmGlobalOverrides` → `Character.gmOverrides`), respecting `merge` semantics. Implement `#computeActiveTags()` emitting `<choiceGrantedTagPrefix><selectedId>` for each active `FeatureChoice` selection. Derive `phase0_characterLevel` (sum of `classLevels`, excludes `levelAdjustment`) and `phase0_eclForXp` (`phase0_characterLevel + (character.levelAdjustment ?? 0)`). Expose both in `CharacterContext` snapshot. Per `ARCHITECTURE.md` §9.2–9.4, 5.3.1, 6.4.

- [ ] **3.3 Base Attributes (DAG Phases 1–2):** `$derived` pipelines for the 6 ability scores using `applyStackingRules()`. Compute `derivedModifier = floor((totalValue − 10) / 2)` for all 6 stats. Route modifiers with `situationalContext` to `situationalModifiers` array. Implement infinite loop detection (depth counter, cut at 3). Per `ARCHITECTURE.md` §9.6.

- [ ] **3.4 Combat Stats & Skills (DAG Phases 3–4):** `$derived` pipelines for AC variants (normal/touch/flat-footed), BAB, initiative, grapple, save totals, max HP (CON mod × `phase0_characterLevel`, not ECL). `$derived` for all skill pipelines. Auto-generate synergy modifier entries from `config_skill_synergies` config table. Per `ARCHITECTURE.md` §9.7–9.8.

- [ ] **3.5 Max DEX Bonus Special Case (DAG Phase 3 intercept):** In Phase 3 `$derived`, intercept `combatStats.max_dex_bonus`: (1) separate all `"max_dex_cap"` modifiers, (2) `effectiveBaseValue = Math.min(...caps)` (99 when no caps), (3) remaining untyped additive modifiers through `applyStackingRules()` with this base, (4) `continue` to skip general loop. Per `ARCHITECTURE.md` §4.17.

- [ ] **3.6 Gestalt Mode Integration (DAG Phase 3.7):** When `settings.variantRules.gestalt === true`, for each pipeline in `GESTALT_AFFECTED_PIPELINES`: separate `"base"` modifiers by class, call `computeGestaltBase()`, inject as `effectiveBaseValue` with only non-`"base"` mods. HP always additive. Standard path when `false`. Per `ARCHITECTURE.md` §8.1–8.2.

- [ ] **3.7 Resource Pools, Action & Ephemeral Methods:** Add all runtime methods to `GameEngine.svelte.ts`. _Resource ticks & rests:_ `triggerTurnTick()`, `triggerRoundTick()`, `triggerEncounterReset()`, `triggerShortRest()`, `triggerLongRest()`, `triggerDawnReset()` (resets `"per_day"` pools + `#resetItemPoolsByCondition("per_day")`), `triggerWeeklyReset()`. _Item pool management:_ `initItemResourcePools()` (idempotent), `getItemPoolValue()` (fallback to `defaultCurrent`), `spendItemPoolCharge()` (floor at 0), `#resetItemPoolsByCondition()`. _Activation:_ `activateWithTier(instanceId, tierIndex)` (validates, resolves cost via Math Parser, checks pool, returns `grantedModifiers` or `null`). _Trigger dispatch:_ `getReactionFeaturesByTrigger(triggerEvent)` (excludes `"passive"`, inactive). _Consumables & ephemeral:_ `consumeItem()` (two-phase atomic), `expireEffect()` (blocks non-ephemeral), `getEphemeralEffects()` (sorted newest-first). _Removal guard:_ `removeFeature()` (blocks cursed), `#removeFeatureUnchecked()`, `tryRemoveCursedItem()` (returns true/false/null). Per `ARCHITECTURE.md` §4.4, 5.5b, 5.7, 6.5, 4.15.

- [ ] **3.8 Feat Slots & Leveling Analytics (DAG Phase 4b):** Add `phase4_featSlots` `$derived` (base = `1 + floor(@characterLevel / 3)` + bonus slots from features). Add `phase4_skillPointsBudget` `$derived`: per-class `max(1, spPerLevel + intMod) × classLevel`; first class gets 4× first-level bonus; racial/feat bonus SP per total character level. Export `ClassSkillPointsEntry` and `SkillPointsBudget` types. Add `phase4_levelingJournal` `$derived` (per-class BAB/save totals, XP penalty). Export `LevelingJournalClassEntry` and `LevelingJournal` types. Methods: `setSkillRanks()` with `minimumSkillRanks` floor clamping, `lockSkillRanksMin()`, `lockAllSkillRanks()`. Per `ARCHITECTURE.md` §9.8.

### Phase 4: Persistence & I/O

- [ ] **4.1 Multi-Character & Settings Storage:** Create `src/lib/engine/StorageManager.ts`. CRUD for multiple `Character` objects and `CampaignSettings` in `localStorage`. Connect to `GameEngine` via `$effect`. `LinkedEntity` serialization guard.

- [ ] **4.2 Data Dictionary (DataLoader & Merge Engine):** Create `src/lib/engine/DataLoader.ts`. Fetch JSON rule files from `static/rules/` recursively (alphabetical order). Memory cache. Filter by `enabledRuleSources`. Distinguish `Feature` entities from config tables (`tableId`). **Merge Engine:** `"replace"` (full overwrite), `"partial"` (append arrays, merge `levelProgression` by level, `choices` by `choiceId`, `-prefix` deletions). Chain: base rule files → `gmGlobalOverrides` → `gmOverrides`. Config tables: always replaced entirely.

### Phase 5: Test UI (Validation)

_Goal: Minimal test harness validating the core engine pipeline end-to-end._

- [ ] **5.1 Mock Data:** Create `static/rules/test_mock.json` (Race, Class with `levelProgression`, Armor with `"max_dex_cap"` modifier, Condition, Orc Enemy with `"attacker.*"` modifier). Create `static/rules/test_override.json` (tests `merge: "partial"` + `-prefix` deletion and `merge: "replace"`).

- [ ] **5.2 Settings & Character Sheet Component:** Create `src/routes/+page.svelte`. Toggles for "Exploding 20s", "Reroll 1s", "Vitality/WP Mode", "Gestalt Mode". Display Total Strength and Total AC.

- [ ] **5.3 Graph & Context Testing:** "Attack the Orc" button. Prove: situational modifier applies ONLY at roll time; Exploding 20s works; V/WP routes crit to `"res_wound_points"`; Orc `"attacker.*"` modifier penalizes the attacker.

- [ ] **5.4 Merge Engine Testing:** Prove `test_override.json` correctly applies partial merge (append, `-prefix`) and replace. Verify resolution chain order (base → GM global → GM per-character).

- [ ] **Checkpoint #1 — Engine & Foundation Conformance** (requires Phases 1–5): Run from `CHECKPOINTS.md`. Verify TypeScript interfaces, Math Parser, Logic Evaluator, Stacking Rules, Dice Engine (incl. V/WP, fortification, on-crit burst, attacker mods), DAG phases 0–4b, all resource/action/ephemeral methods, DataLoader & Merge Engine, Test UI. Resolve all CRITICAL and MAJOR issues before proceeding.

### Phase 6: Campaign Management & User Context

_Goal: Establish the overarching container for characters, respecting GM vs. Player visibility._

- [ ] **6.1 User Context & Roles:** Create `src/lib/engine/SessionContext.svelte.ts` — mock session with `currentUserId`, `isGameMaster`, `activeCampaignId`. Replaceable by real PHP-backed auth later.

- [ ] **6.2 Character Model UI Updates:** Update `Character` in `character.ts` with UI metadata: `campaignId`, `ownerId`, `isNPC`, `posterUrl`, `playerRealName`, `customSubtitle`.

- [ ] **6.3 Campaign Hub UI:** Create `src/routes/campaigns/+page.svelte`. Campaign grid with `posterUrl`/`bannerUrl`. "Create Campaign" GM-only.

- [ ] **6.4 Campaign Details & Acts UI:** Create `src/routes/campaigns/[id]/+page.svelte`. Banner, summary, Chapter list. GM can toggle `isCompleted` on chapters.

### Phase 7: The Character Vault

_Goal: Character selection screen respecting visibility rules._

- [ ] **7.1 Visibility Logic:** `$derived` `visibleCharacters` — filter by `activeCampaignId`; GM sees all; player sees own + `LinkedEntity` companions.

- [ ] **7.2 Character Card Component:** Create `src/lib/components/vault/CharacterCard.svelte`. Poster image, name, level badge (sum of `classLevels`). Subtitle: `customSubtitle` → Race label (NPC) → `playerRealName` (PC).

- [ ] **7.3 Character Vault Page:** Create `src/routes/campaigns/[id]/vault/+page.svelte`. Responsive grid of `CharacterCard` from `visibleCharacters`.

- [ ] **7.4 Empty State & Creation Actions:** Empty state. "Create New Character" button. GM: "Add NPC/Monster" button. Both initialize blank `Character` via `StorageManager` and navigate to Phase 8 editor.

### Phase 8: UI Construction — "Core" Tab (Summary View)

_Goal: Simplified read-only overview components. No game logic in .svelte files._

- [ ] **8.1 Tab Navigation & Layout Skeleton:** Create `src/routes/character/[id]/+page.svelte`. Tabbed navigation (Core, Abilities, Combat, Feats, Magic, Inventory). `GameEngine` loads character from URL.

- [ ] **8.2 Generic Feature Modal:** Create `src/lib/components/ui/FeatureModal.svelte`. Feature ID → fetch from `DataLoader` → display localized description, prerequisites, modifiers as readable text, granted features.

- [ ] **8.3 Basic Information Component:** Create `src/lib/components/core/BasicInfo.svelte`. Race/Class/Deity/Alignment/Size dropdowns. Selecting triggers engine `ActiveFeatureInstance` creation + `classLevels` init. Modifier badges read from feature data.

- [ ] **8.4 Dynamic Feature Choices:** Update `BasicInfo.svelte` for `FeatureChoice` arrays. Per choice: dropdown from `optionsQuery` via `DataLoader`. Bind to `ActiveFeatureInstance.selections`.

- [ ] **8.5 Ability Scores Summary:** Create `src/lib/components/core/AbilityScoresSummary.svelte`. Compact read-only 6-stat grid (`totalValue` + `derivedModifier`). Link to Abilities tab.

- [ ] **8.6 Saving Throws Summary:** Create `src/lib/components/core/SavingThrowsSummary.svelte`. Compact Fort/Ref/Will. Read-only.

- [ ] **8.7 Skills Summary:** Create `src/lib/components/core/SkillsSummary.svelte`. Condensed skill name + total bonus. Read-only, link to Abilities tab.

- [ ] **8.8 Languages & Lore Component:** Create `src/lib/components/core/LoreAndLanguages.svelte`. Personal Story / Appearance text areas. Language system: INT mod + Speak Language ranks, auto-granted languages, dropdown to add more.

### Phase 9: UI Construction — "Abilities & Skills" Tab (Full Interactive Editor)

- [ ] **9.1 Data Model Extensions:** Add `recommendedAttributes?: ID[]` to `Feature` interface in `feature.ts`. Confirm synergy bonuses auto-appear via DAG Phase 4 synergy generation (Phase 3.4).

- [ ] **9.2 Breakdown & Dice Roll Modals:** Create `ModifierBreakdownModal.svelte` (pipeline `activeModifiers` → "Base + Modifiers = Final" math). Create `DiceRollModal.svelte` (`parseAndRoll()`, crit/fumble highlighting; V/WP mode: `→ WOUND POINTS` / `→ Vitality Points` routing row).

- [ ] **9.3 Ability Scores Panel:** Create `src/lib/components/abilities/AbilityScores.svelte`. 6 stat panels: `derivedModifier`, editable base score, temporary modifier. Breakdown and Roll buttons per stat.

- [ ] **9.4 Stat Generation Wizards:** Create `PointBuyModal.svelte` (D&D 3.5 math, `pointBuyBudget` from settings, `recommendedAttributes` color-coding). Create `RollStatsModal.svelte` (4d6 drop lowest, `rerollOnes` setting, assign values to attributes).

- [ ] **9.5 Saving Throws Panel:** Create `src/lib/components/abilities/SavingThrows.svelte`. Fort/Ref/Will: final modifier, ability block (color-coded), misc modifier, editable temp. Breakdown and Roll buttons.

- [ ] **9.6 Skills Matrix Panel:** Create `src/lib/components/abilities/SkillsMatrix.svelte`. Header: SP Available (from `engine.phase4_skillPointsBudget.totalAvailable`) vs. Spent. Table: class-skill, name, total, key ability, misc, ranks (clamped `[minimumRanks, maxRanks]`, "Min" badge), cost, max ranks. Ranks input calls `engine.setSkillRanks()`. "Journal" button opens Leveling Journal modal.

### Phase 10: UI Construction — "Combat" Tab

_Goal: Full Combat tab. Engine handles all calculations._

- [ ] **10.1 Health & Experience Panel:** Create `src/lib/components/combat/HealthAndXP.svelte`. HP bar (Current/Temporary/Nonlethal), Heal/Damage buttons (temp HP depletes first). XP bar using `@eclForXp` from `config_xp_table`. LA/ECL badges, "Reduce LA" button. Turn/Encounter/Long Rest buttons call engine methods. V/WP mode: dual VP/WP bars.

- [ ] **10.2 Armor Class Panel:** Create `src/lib/components/combat/ArmorClass.svelte`. Three pipelines (`ac_normal`, `ac_touch`, `ac_flat_footed`). Breakdown modals. Effective DEX to AC = `min(dexMod, combatStats.max_dex_bonus.totalValue)`.

- [ ] **10.3 Core Combat Stats:** Create `src/lib/components/combat/CoreCombat.svelte`. BAB (iterative attacks), Initiative, Grapple. Roll and Breakdown buttons.

- [ ] **10.4 Weapons & Attacks Panel:** Create `src/lib/components/combat/Attacks.svelte`. Main Hand, Off Hand, Ranged dropdowns from Inventory + Unarmed. Dynamic Attack Bonus and Damage calculation. Roll buttons.

- [ ] **10.5 Movement Speeds Panel:** Create `src/lib/components/combat/MovementSpeeds.svelte`. Land/Burrow/Climb/Fly/Swim pipelines. Armor and Load penalty pipeline display.

- [ ] **10.6 Energy & Special Resistances:** Create `src/lib/components/combat/Resistances.svelte`. Fire/Cold/Acid/Electricity/Sonic/SR/PR/Fortification/ASF pipelines. Misc modifier inputs.

- [ ] **10.7 Damage Reduction Builder:** Create `src/lib/components/combat/DamageReduction.svelte`. DR builder (Value, bypass tags, Innate vs. Class type). "Add DR" → custom `ActiveFeatureInstance` pushed to engine. `drEntries` from `StackingResult` with suppressed DRs shown with strikethrough.

- [ ] **10.8 Action Budget Bar & Ephemeral Effects Panel:** Create `src/lib/components/combat/ActionBudgetBar.svelte` (min-wins per action category, spent counter, XOR exclusion via `action_budget_xor` tag, "Reset Turn"). Create `src/lib/components/combat/EphemeralEffectsPanel.svelte` (active ephemeral effect cards, two-click "Expire"). Both in Combat tab left column. Per `ARCHITECTURE.md` §5.6, 6.5.

### Phase 11: UI Construction — "Feats" Tab

- [ ] **11.1 Feat Capacity Pipeline:** `phase4_featSlots` from Phase 3.8. "Feats Left" = slots − manually selected count.

- [ ] **11.2 Feats Tab Layout & Lists:** Create `src/lib/components/feats/FeatsTab.svelte`. Header counters. Granted Feats (read-only, source tag). Selected Feats (Delete button).

- [ ] **11.3 Feat Catalog Modal:** Create `src/lib/components/feats/FeatSelectionModal.svelte`. All `category: "feat"` features. Text search. Tag badges.

- [ ] **11.4 Prerequisite Evaluation UI:** Run `prerequisitesNode` through `logicEvaluator` per feat. Failed: row disabled, `errorMessage`s in red. Met: green.

### Phase 12: UI Construction — "Spells & Powers" Tab

- [ ] **12.1 Magic Resources & Limits:** In `GameEngine`, derive Caster Level, Manifester Level. Derive Spell Slots (per level) and Power Points max.

- [ ] **12.2 Spells/Powers Catalog (The Grimoire):** Create `src/lib/components/magic/Grimoire.svelte`. Learn/add spells. Filter by active `spellLists` and class level.

- [ ] **12.3 Preparation & Casting Panel:** Create `src/lib/components/magic/CastingPanel.svelte`. Spells by level (0–9). Psionic: `discipline` tab bar. Prepare counter (Vancian) or Cast/Manifest button. Spell detail: School, Components, Range, Duration, Roll, Save DC. Psionic: `displays` badges, augmentation picker with `effectDescription`. Metamagic rods, staff variable charge costs, wand item CL, scroll arcane/divine restriction + CL check.

- [ ] **12.4 Special & Domain Abilities Panel:** Create `src/lib/components/magic/SpecialAbilities.svelte`. `class_feature`/`domain` features with `activation`. Resource pool tracking. "Use" button calls engine pool spend.

### Phase 13: UI Construction — "Inventory" Tab

- [ ] **13.1 Equipment Slot Pipelines:** Use slot pipelines from Phase 3.1 (`slots.ring`, `slots.head`, etc.).

- [ ] **13.2 Inventory Sections & Layout:** Create `src/lib/components/inventory/InventoryTab.svelte`. Three sections: Equipped/Readied, Backpack/Carried, Storage/Stashed.

- [ ] **13.3 Equip, Slot Enforcement & Psionic Item Cards:** "Equip" checks slot count vs. pipeline total; blocks if full. `two_hands` checks both hands. Consumables: "Drink"/"Apply"/"Use" button → `engine.consumeItem()`. Create `src/lib/components/inventory/PsionicItemCard.svelte` (Cognizance Crystal PP bar, Dorje charge bar, Power Stone Brainburn warning, Psicrown PP/Manifest, Tattoo activate). Psionic tattoo 20-limit. Cursed items: no Unequip button. Per `ARCHITECTURE.md` §5.1.1, 4.15.

- [ ] **13.4 Encumbrance & Wealth Calculator:** Create `src/lib/components/inventory/Encumbrance.svelte`. `$derived` weight sum. STR carrying capacity from `config_carrying_capacity`. Medium/Heavy → dispatch `condition_encumbered`. CP/SP/GP/PP inputs (50 coins = 1 lb).

- [ ] **Checkpoint #2 — UI Layer Conformance** (requires Phases 1–13): Run from `CHECKPOINTS.md`. Verify zero game logic in .svelte files, zero hardcoding, Campaign/Vault visibility, all six tab implementations, Navigation & Routes. Resolve all CRITICAL and MAJOR issues before proceeding.

### Phase 14: PHP Backend & Frontend Integration

_Goal: PHP/SQLite REST API for shared hosting._

- [ ] **14.1 Database Configuration & PDO Setup:** `api/config.php`, singleton `api/Database.php` (PDO/SQLite, `sqlite::memory:` for tests).

- [ ] **14.2 Authentication System:** `api/auth.php`. Login/logout/me endpoints. `requireAuth()` middleware (401 on unauthenticated).

- [ ] **14.3 CORS & Security Middleware:** `api/middleware.php`. Configurable CORS. CSRF protection on POST/PUT/DELETE. Rate limiting.

- [ ] **14.4 Database Schema & Migrations:** `api/migrate.php`. Tables: `users`, `campaigns` (with `gm_global_overrides_text`, `updated_at`), `characters` (with separate `character_json`, `gm_overrides_json`, `updated_at`).

- [ ] **14.5 REST API Endpoints:** Campaigns CRUD, `sync-status`, Characters CRUD with visibility rules (GM vs. player), GM override endpoint. All with ownership/GM checks and `updated_at` tracking.

- [ ] **14.6 Frontend Integration (StorageManager):** Refactor `StorageManager.ts` with async `fetch()`. Debounced auto-save (2s). Offline fallback to localStorage. Polling `sync-status` every 5–10s.

- [ ] **14.7 SvelteKit Proxy Configuration:** `vite.config.ts` proxies `/api` to PHP dev server (configurable target).

### Phase 15: GM Tools — Rule Sources & Override Screens

- [ ] **15.1 Rule Source Manager UI:** `src/routes/campaigns/[id]/settings/+page.svelte` (GM-only). Enable/disable/reorder rule sources (drag-and-drop). Variant Rules section: Gestalt and V/WP checkboxes.

- [ ] **15.2 Global Override Text Area:** JSON textarea for `gmGlobalOverrides`. JSON validator with line-error highlighting.

- [ ] **15.3 GM Entity Dashboard:** `src/routes/campaigns/[id]/gm-dashboard/+page.svelte` (GM-only). Character list + read-only summary + per-character `gmOverrides` textarea.

- [ ] **15.4 Override Resolution Chain:** Enforce strict order in `DataLoader`: rule files → `gmGlobalOverrides` → `gmOverrides`. Both `merge` modes supported at every layer.

- [ ] **Checkpoint #3 — Backend & GM Tools** (requires Phases 1–15): Run from `CHECKPOINTS.md`. Verify auth/bcrypt, CSRF, SQL injection audit, schema, visibility rules, sync timestamps, GM override system, Vite proxy, rule source discovery. Resolve all CRITICAL and MAJOR issues before proceeding.

### Phase 16: Backend Unit Testing (PHPUnit)

- [ ] **16.1 PHPUnit & Memory DB Setup:** PHPUnit + `phpunit.xml` with `sqlite::memory:`.
- [ ] **16.2 Character Persistence Tests:** `tests/CharacterControllerTest.php` — save/load round-trip of deeply nested character JSON.
- [ ] **16.3 Visibility & Authorization Tests:** `tests/VisibilityTest.php` — non-GM accessing another's character → 403.
- [ ] **16.4 Authentication Tests:** `tests/AuthTest.php` — valid/invalid login, 401 without session, session persistence.
- [ ] **16.5 GM Override Visibility Tests:** `tests/GmOverrideTest.php` — player gets merged data; GM gets base + raw overrides separately.
- [ ] **16.6 Sync Timestamp Tests:** `tests/SyncTest.php` — `updated_at` on character edit and GM override edit, `sync-status` accuracy.

### Phase 17: Frontend Engine & Rules Unit Testing (Vitest)

_Goal: Exhaustively test the engine with deterministic tests._

- [ ] **17.1 Math & Placeholder Tests:** `src/tests/mathParser.test.ts`. All `@`-paths, order-of-operations, `|distance`/`|weight` pipes (both locales), `@eclForXp` vs `@characterLevel`, formula-as-value, unresolved path → 0.

- [ ] **17.2 Logic Evaluator Tests:** `src/tests/logicEvaluator.test.ts`. Nested AND > OR > NOT > CONDITION. `has_tag`/`missing_tag`. All 8 operators. `choiceGrantedTagPrefix` sub-tag emission. `errorMessage` from failing nodes.

- [ ] **17.3 Stacking Rules Tests:** `src/tests/stackingRules.test.ts`. All 4 stackable types. `setAbsolute` override + last-wins. Negative modifier. DR best-wins grouping (same-bypass suppression, independent bypass coexistence, AND-bypass distinct group, sort-order consistency, `drEntries` absent when no DR). `"inherent"` best-wins + cross-type stacking.

- [ ] **17.4 Dice Engine Tests:** `src/tests/diceEngine.test.ts`. Injectable RNG. Situational context match/no-match. Exploding 20s. Crit range. V/WP routing scenarios. Attacker mod resolution (correct pipeline, filter, defender `totalBonus` unchanged). Fortification boundaries. On-crit burst dice (scaling, Thundering, fort-negated → no burst, malformed formula → no crash).

- [ ] **17.5 DAG Integration Tests:** `src/tests/dagResolution.test.ts`. Belt of CON cascade (CON → Fort → HP). Formula-as-value (Monk WIS to AC). `forbiddenTags`. `conditionNode`. Dual-gated modifier. Synergy auto-generation. Circular dependency guard.

- [ ] **17.6 Multiclass & Level Progression Tests:** `src/tests/multiclass.test.ts`. `characterLevel` sum. Multi-class BAB. Level-gated feature granting. `@eclForXp` for monster PC (Drow Rogue 3 LA+2 → `eclForXp=5`, `@characterLevel=3`).

- [ ] **17.7 Merge Engine Tests:** `src/tests/mergeEngine.test.ts`. Full replace. Partial merge (array append, `levelProgression`, `choices`). `-prefix` deletion. 3-layer chain. Config table replacement.

- [ ] **17.8 Engine Enhancement & Edge Case Tests:** Create/extend: `resourcePool.test.ts` (all 8 conditions, reset isolation), `itemResourcePools.test.ts` (idempotency, floor, cross-instance, stashed excluded), `tieredActivation.test.ts` (guards → null), `triggerActivation.test.ts` (reaction vs. passive, inactive excluded), `ephemeralEffects.test.ts` (lifecycle, sorting), `inherentBonus.test.ts` (within-type/cross-type), `metamagicRods.test.ts`, `staffSpells.test.ts`, `wandSpell.test.ts`, `scrollSpells.test.ts`, `cursedItemRemoval.test.ts`, `intelligentItems.test.ts`, `augmentationRule.test.ts` (backward compat, qualitative, fallback), `maxDexBonus.test.ts` (no armor=99, cap+Mithral, multi-cap min-wins).

- [ ] **Checkpoint #4 — Test Suite Exhaustiveness** (requires Phases 1–17): Run from `CHECKPOINTS.md`. Verify PHPUnit coverage and Vitest coverage (all engine paths, all extension types, all edge cases). Resolve all CRITICAL and MAJOR gaps before proceeding.

### Phase 18: Tooling, Build Pipeline & Developer Experience

- [ ] **18.1 Docker Build Pipeline:** Multi-stage `Dockerfile` + `docker-compose.yml`. Final artifact: tarball with SvelteKit build + PHP API + static assets + `.htaccess`.
- [ ] **18.2 Native Build Script:** `scripts/build.sh`. Portable tools bootstrap. Full pipeline. Options: `--env`, `--output`, `--deploy`, `--tag`, `--skip-tests`, `--no-clean`.
- [ ] **18.3 Docker Build Wrapper:** `scripts/build-docker.sh`. Options: `--tag`, `--output`, `--no-cache`, `--push`, `--registry`.
- [ ] **18.4 Local Run Script (Native):** `run.sh`. Auto-locate artifact, PHP resolver, `.env` priority, PHP router, auto-migrate. Options: `--port`, `--dir`, `--env-file`.
- [ ] **18.5 Local Run Script (Docker):** `run-docker.sh`. Minimal Apache+PHP image. Named DB volume. Options: `--port`, `--dir`, `--env-file`, `--no-cache`.
- [ ] **18.6 VS Code Debug Configurations:** `.vscode/launch.json` (Chrome/Edge/Firefox frontend, PHP/Xdebug, compound full-stack). `.vscode/tasks.json` (background server tasks). Groups: fullstack → frontend → backend → tests → artifact.
- [ ] **18.7 VS Code Extensions:** `.vscode/extensions.json` (Svelte, PHP, Xdebug, ESLint, Prettier, browser debuggers).
- [ ] **18.8 PHP Binary Resolver:** `scripts/php-dev.sh`. Priority: `CHAR_VAULT_PHP` → Xdebug PHP → portable → system PHP ≥ 8.1.
- [ ] **18.9 Environment Variable Support:** `.env.example` (APP_ENV, DB_PATH, CORS_ORIGIN). `api/config.php` priority loader. `run.sh`/`run-docker.sh` `--env-file` option.
- [ ] **18.10 Version Control & Documentation:** `.gitignore` completeness. Comprehensive `README.md`.

- [ ] **Checkpoint #5 — Tooling & DX** (requires Phase 18): Run from `CHECKPOINTS.md`. Verify build pipeline, Docker, run scripts, VS Code configs, PHP resolver, `.env` priority, `.gitignore`, README. Resolve all CRITICAL and MAJOR issues before proceeding.

### Phase 19: UI Excellence — Tailwind CSS, Theming, Responsive Design & Iconography

_Design decisions: Tailwind CSS v4+, `lucide-svelte`, indigo accent palette, CSS class-based dark mode, collapsible sidebar, full-viewport-height character sheet, 44px touch targets._

- [ ] **19.1 Tailwind CSS & PostCSS Setup:** Install Tailwind v4+, PostCSS, autoprefixer. `tailwind.config.ts`, `postcss.config.js`, `src/app.css`. Custom palette, semantic aliases, breakpoints, `darkMode: 'class'`.
- [ ] **19.2 Theme Engine & Cookie Persistence:** `ThemeManager.svelte.ts` (3-state: system/light/dark, cookie persistence). FOWT prevention script in `app.html`. `ThemeToggle.svelte`. CSS custom properties for all theme colors.
- [ ] **19.3 Lucide Icons Integration:** Install `lucide-svelte`. Replace ALL emoji. Sizes: 16px/20px/24px. `currentColor`. Icon mapping documented.
- [ ] **19.4 Global Layout Shell & Sidebar Navigation:** `AppShell.svelte` + `Sidebar.svelte`. Desktop: expanded/collapsible (cookie). Tablet: icon-only. Mobile: slide-in drawer. Cookie-persisted state.
- [ ] **19.5 Design System — Base Component Classes:** `.card`, button variants (Primary/Secondary/Danger/Ghost), input style, badge variants, `Modal.svelte` (desktop centered / mobile bottom sheet), `HorizontalScroll.svelte`.
- [ ] **19.6 Character Sheet Full-Height Layout:** `100vh` − sidebar. Fixed tab bar (always visible). Scrollable content. Desktop ≥1280px: multi-column.
- [ ] **19.7 Core Tab Migration:** Migrate `BasicInfo`, `AbilityScoresSummary`, `SavingThrowsSummary`, `SkillsSummary`, `LoreAndLanguages`. Remove all `<style>` blocks.
- [ ] **19.8 Abilities & Skills Tab Migration:** Migrate `AbilityScores`, `SavingThrows`, `SkillsMatrix` (sticky column + `HorizontalScroll`), `PointBuyModal`, `RollStatsModal`, modals.
- [ ] **19.9 Combat Tab Migration:** Migrate all Combat components including `ActionBudgetBar`, `EphemeralEffectsPanel`. Desktop ≥1280px: 2-column layout.
- [ ] **19.10 Feats & Magic Tabs Migration:** Migrate `FeatsTab`, `FeatSelectionModal`, `Grimoire`, `CastingPanel`, `SpecialAbilities`.
- [ ] **19.11 Inventory Tab Migration:** Migrate `InventoryTab`, `PsionicItemCard`, `Encumbrance`. Mobile: swipe/action sheet.
- [ ] **19.12 Campaign Hub, Vault & GM Tools Migration:** Migrate all non-character-sheet pages.
- [ ] **19.13 Touch Adaptation, Accessibility & Cross-Device Polish:** `pointer: coarse` 44px targets. `:focus-visible` rings. `prefers-reduced-motion`. Test at 320/375/414/768/1024/1280/1536/1920px — zero overflow.
- [ ] **19.14 Legacy CSS Cleanup & Final QA:** Remove all remaining `<style>` blocks. WCAG AA contrast. Smoke-test full user flow.

- [ ] **Checkpoint #6 — UI Excellence** (requires Phase 19): Run from `CHECKPOINTS.md`. Verify Tailwind migration, theme system, Lucide coverage, sidebar, full-height layout, breakpoints, touch targets, design system consistency. Resolve all CRITICAL and MAJOR issues before proceeding.

### Phase 20: Leveling Progression & Skill Points (SRD-Accurate)

_Goal: Leveling UI and dedicated SRD-accurate tests. Engine analytics already implemented in Phase 3.8._

- [ ] **20.1 SkillsMatrix Update:** Use `engine.phase4_skillPointsBudget.totalAvailable`. Rank input min = `getMinRanks()`. "Min" badge on locked ranks. "Journal" button.

- [ ] **20.2 Leveling Journal Modal:** Create `src/lib/components/abilities/LevelingJournalModal.svelte`. Overview table (classes × BAB/saves/SP). Per-class SP formula with first-level bonus annotation. Lock/Unlock controls. XP penalty warning.

- [ ] **20.3 i18n Strings:** Add `journal.*` and `skills.rank_locked*` / `skills.journal_*` keys to `src/lib/i18n/ui-strings.ts` (EN + FR).

- [ ] **20.4 Vitest — Per-Class SP Budget Tests:** Extend `src/tests/multiclass.test.ts`. First-level 4× on first class only, INT floor, racial bonus, three-class scenario, proof of broken unified formula.

- [ ] **20.5 Vitest — Minimum Rank Enforcement Tests:** Extend `src/tests/multiclass.test.ts`. Floor clamping, max-merge (never lowers), absent = 0, cross-class cost.

- [ ] **20.6 Vitest — Character Build Integration Scenario:** Create `src/tests/characterBuildScenario.test.ts`. Fighter 3/Monk 3/Psion 1/Wizard 1 — 100+ assertions covering BAB, saves, HP, SP budget, AC, XP penalty, feats, spells, PP.

- [ ] **Checkpoint #7 — Leveling Progression** (requires Phase 20): Run from `CHECKPOINTS.md`. Verify per-class SP budget, rank enforcement, SkillsMatrix, LevelingJournalModal, i18n, test scenarios. Resolve all CRITICAL and MAJOR issues before proceeding.

### Phase 21: Custom Content Editors

- [ ] **21.1+ To be determined.** (Scope not yet defined — see `ARCHITECTURE.md` for future direction notes.)

---

### Final Review

- [ ] **Final Review** (complete system validation — before release): Run the full architecture conformance review from `CHECKPOINTS.md`. Covers: Part A — Architecture §1–20 sweep; Part B — cross-cutting concerns (zero hardcoding, i18n, error handling, TypeScript strictness, PHP security); Part C — ANNEXES.md examples A.1–A.12 traced end-to-end, Annex B tables B.1–B.12 verified; Part D — test coverage gap analysis; Part E — UI Excellence validation. All CRITICAL issues must be zero before release.
