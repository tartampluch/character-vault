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

- [ ] Initialize Project & PROGRESS.md

### Phase 1: Typed Foundations (Data Models)

_Goal: Define the complete TypeScript type system up-front. All interfaces — including every sub-type extension — are established here so subsequent phases can build on a stable contract._

- [ ] **1.1 Primitives & i18n:** Create `src/lib/types/primitives.ts` with `ID` (string alias), complete `ModifierType` union (enhancement, deflection, natural_armor, armor, shield, luck, morale, competence, racial, insight, sacred, profane, circumstance, dodge, synergy, untyped, resistance, base, setAbsolute, `"damage_reduction"`, `"inherent"`, `"max_dex_cap"`), and `LogicOperator`. Create `src/lib/types/i18n.ts` (`LocalizedString`, `I18N_CONFIG`). Per `ARCHITECTURE.md` §2.

- [ ] **1.2 Logic & Pipeline Types:** Create `src/lib/types/logic.ts` (recursive `LogicNode` — AND, OR, NOT, CONDITION node types with all 8 `LogicOperator` values). Create `src/lib/types/pipeline.ts`: `Modifier` (required `sourceId`, `sourceName`, `targetId`, `value`, `type`; optional `drBypassTags?: string[]`, `situationalContext?`, JSDoc for the `"attacker.*"` target prefix convention); `StatisticPipeline` with `derivedModifier`; `SkillPipeline`; `ResourcePool` with 8-value `resetCondition` union: `"short_rest"`, `"long_rest"`, `"encounter"`, `"never"`, `"per_turn"`, `"per_round"`, `"per_day"`, `"per_week"` and optional `rechargeAmount?: number | string`. Per `ARCHITECTURE.md` §3–4.4.

- [ ] **1.3 Unified Feature Model:** Create `src/lib/types/feature.ts` as the complete feature type system per `ARCHITECTURE.md` §5–5.7 and `ANNEXES.md` A.1–A.12. Base `Feature`: `levelProgression`, `resourcePoolTemplates?: ResourcePoolTemplate[]` (export `ResourcePoolTemplate` with `poolId`, `label`, `maxPipelineId`, `defaultCurrent`, `resetCondition`, `rechargeAmount?`), `actionBudget?` (6 optional numeric keys: standard, move, swift, immediate, free, full_round), `recommendedAttributes?`. `activation`: 10-value `actionType` union (standard, move, swift, immediate, free, full_round, passive, reaction), `triggerEvent?`, `tieredResourceCosts?: ActivationTier[]` (export `ActivationTier` with `label`, `targetPoolId`, `cost`, `grantedModifiers`). `ItemFeature`: `two_hands` slot; `psionicItemData?` (export `PsionicItemType` — 5-value union, `PowerStoneEntry` with `powerId`/`manifesterLevel`/`usedUp`); `weaponData.onCritDice?` (export `OnCritDiceSpec` with `baseDiceFormula`, `damageType`, `scalesWithCritMultiplier`); `metamagicEffect?` (6-feat union, `maxSpellLevel: 3|6|9`); `staffSpells?` (`chargeCost: 1|2|3|4|5`); `wandSpell?` (`casterLevel`, optional `spellLevel`); `scrollSpells?` (required `spellLevel`, `spellType: "arcane"|"divine"`); `removalPrevention?` (`isCursed: true`, `removableBy`); `intelligentItemData?` (INT/WIS/CHA scores, egoScore, 9-value alignment, 3-value communication, senses with discrete vision ranges); `isUnique?`; `artifactTier?`. `MagicFeature`: `discipline?: PsionicDiscipline` (export 6-value union), `displays?: PsionicDisplay[]` (export 5-value union). `AugmentationRule`: `effectDescription?: LocalizedString`. `FeatureChoice`: `choiceGrantedTagPrefix?`. All fields exhaustively documented with SRD authoring patterns per `ARCHITECTURE.md` §4.9–4.17, 15.3, 15.1, 5.3, 5.5b, 5.6, 5.7.

- [ ] **1.4 Global State & Campaign Settings:** Create `src/lib/types/character.ts`: `ActiveFeatureInstance` with `itemResourcePools?: Record<string, number>` and `ephemeral?: { isEphemeral: true; appliedAtRound?: number; sourceItemInstanceId?: string; durationHint?: string }`; `LinkedEntity` with serialization guard; `Character` with `classLevels`, `gmOverrides`, `minimumSkillRanks?: Record<ID, number>`, `levelAdjustment: number`, `xp: number`, and all UI metadata fields (`campaignId`, `ownerId`, `isNPC`, `posterUrl`, `playerRealName`, `customSubtitle`). Create `src/lib/types/settings.ts`: `CampaignSettings` with `language`, `statGeneration`, `diceRules`, `enabledRuleSources`, `variantRules: { vitalityWoundPoints: boolean; gestalt: boolean }`. Create `src/lib/types/campaign.ts`: `Campaign` (with `gmGlobalOverrides`, `enabledRuleSources`, `updatedAt`), `Chapter`, `SceneState`. Per `ARCHITECTURE.md` §6–8.

### Phase 2: Pure Functions & Dice Engine (The Brain)

_Goal: Build all pure, stateless utility functions. These have no Svelte dependencies and can be tested in isolation._

- [ ] **2.1 i18n Formatters:** Create `src/lib/utils/formatters.ts` (localization helpers and unit conversion based on `CampaignSettings` locale).

- [ ] **2.2 Math Parser:** Create `src/lib/utils/mathParser.ts`. Evaluate formula strings, replace `@` placeholders with character context values. Support all paths per `ARCHITECTURE.md` §4.3: `@characterLevel`, `@eclForXp`, `@classLevels.<id>`, `@activeTags`, `@selection.<choiceId>`, `@constant.<id>`, `@master.classLevels.<id>`. Handle `|distance` and `|weight` pipes. Return 0 and log warning for unresolved paths. Export `CharacterContext` type with `eclForXp` field.

- [ ] **2.3 Logic Evaluator:** Create `src/lib/utils/logicEvaluator.ts`. Recursive evaluation of `LogicNode` trees (AND, OR, NOT, CONDITION). Support all 8 `LogicOperator` values (`==`, `>=`, `<=`, `!=`, `includes`, `not_includes`, `has_tag`, `missing_tag`). Return `errorMessage` from failing CONDITION nodes.

- [ ] **2.4 Stacking Rules:** Create `src/lib/utils/stackingRules.ts`. Standard stacking: `dodge`, `circumstance`, `synergy`, `untyped` stack additively; all other types keep highest only. `setAbsolute` overrides all (last wins). `"damage_reduction"` handled as a separate pass: group by sorted `drBypassTags` signature, keep highest per group, return `StackingResult.drEntries[]` with `amount`, `bypassTags`, `sourceModifier`, `suppressedModifiers`. Note: `"max_dex_cap"` is intercepted at DAG level (Phase 3.5), not subject to this function. Per `ARCHITECTURE.md` §4.2 and 4.5.

- [ ] **2.5 Gestalt Rules:** Create `src/lib/utils/gestaltRules.ts`. Export `computeGestaltBase(modifiers, classLevels, characterLevel)` (max-per-level from each contributing class, then sum), `groupBaseModifiersByClass()`, `GESTALT_AFFECTED_PIPELINES` Set (`combatStats.bab`, `saves.fort`, `saves.ref`, `saves.will` — NOT `combatStats.max_hp`), `isGestaltAffectedPipeline()`. Per `ARCHITECTURE.md` §8.1–8.2.

- [ ] **2.6 Dice Engine (RNG):** Create `src/lib/utils/diceEngine.ts`. Implement `parseAndRoll(formula, pipeline, context, settings, rng?, situationalModifiers?, defenderAttackerMods?, defenderFortificationPct?, weaponOnCritDice?, critMultiplier?)` per `ARCHITECTURE.md` §17. Export `DamageTargetPool` (`"res_hp" | "res_vitality" | "res_wound_points"`), `OnCritDiceSpec` (re-export from feature.ts), `RollResult` (with required `targetPool`, optional `fortification?: { roll, pct, critNegated }`, `onCritDiceRolled?: { formula, rolls, totalAdded, damageType }`, `attackerPenaltiesApplied?: Modifier[]`), `RollContext` (with optional `isCriticalHit?`). Implement: injectable `rng` parameter for deterministic tests; Exploding 20s (recursive reroll + accumulate); Reroll 1s; V/WP routing (`"res_wound_points"` on confirmed crit, `"res_vitality"` otherwise, `"res_hp"` when V/WP disabled); `attacker.*` modifier resolution (strip prefix, match pipeline, apply `situationalContext` filtering, add to `finalTotal`, record in `attackerPenaltiesApplied`); fortification crit negation (roll 1d100 ≤ pct → `critNegated: true`, fortification-negated crits route to `"res_vitality"` in V/WP mode); on-crit burst dice (parse `baseDiceFormula`, scale dice count by `(critMultiplier − 1)` when `scalesWithCritMultiplier`, roll via RNG, add to `finalTotal`, absent when crit negated). Per `ARCHITECTURE.md` §4.6–4.7, 4.9, 8.2.

### Phase 3: Svelte 5 Reactive Engine (The DAG)

_Goal: Build the reactive game engine as a Svelte 5 store. Each DAG phase is a `$derived` rune that builds on the previous, forming a topological dependency graph._

- [ ] **3.1 Store Skeleton & Default Pipelines:** Create `src/lib/engine/GameEngine.svelte.ts`. Initialize global Svelte 5 `$state` for `CampaignSettings` and active `Character`. Initialize all default pipeline maps: 6 ability score pipelines, full `combatStats` map including `combatStats.fortification` (baseValue 0), `combatStats.arcane_spell_failure` (baseValue 0), `combatStats.max_dex_bonus` (baseValue 99 = uncapped), `combatStats.ac_normal/touch/flat_footed`, `combatStats.bab`, `combatStats.initiative`, `combatStats.grapple`, `combatStats.max_hp`; `saves.fort/ref/will`; all skill pipelines; feat slot pipeline; equipment slot pipelines (`slots.ring = 2`, `slots.head = 1`, etc.); character resource pools. Per `ARCHITECTURE.md` §9, 4.7–4.17.

- [ ] **3.2 Flattening & Filtering (DAG Phase 0):** `$derived` producing flat validated modifier list. Per feature instance: check `prerequisitesNode` via Logic Evaluator against current context, check `forbiddenTags`, apply `classLevel` gating from `levelProgression`. Apply full Data Override resolution chain (rule files in `enabledRuleSources` order → `Campaign.gmGlobalOverrides` → `Character.gmOverrides`), respecting `merge` semantics. Implement `#computeActiveTags()` emitting `<choiceGrantedTagPrefix><selectedId>` for each active `FeatureChoice` selection. Derive `phase0_characterLevel` (sum of `classLevels` values, excludes `levelAdjustment`) and `phase0_eclForXp` (`phase0_characterLevel + (character.levelAdjustment ?? 0)`). Expose both in `CharacterContext` snapshot. Per `ARCHITECTURE.md` §9.2–9.4, 5.3, 6.4.

- [ ] **3.3 Base Attributes (DAG Phases 1–2):** `$derived` pipelines for the 6 ability scores using `applyStackingRules()`. Compute `derivedModifier = floor((totalValue − 10) / 2)` for all 6 stats. Route modifiers with `situationalContext` to `situationalModifiers` array (separate from `activeModifiers`). Implement infinite loop detection (depth counter, cut at 3). Per `ARCHITECTURE.md` §9.6.

- [ ] **3.4 Combat Stats & Skills (DAG Phases 3–4):** `$derived` pipelines for AC variants (normal/touch/flat-footed, ignoring Armor/Shield for touch), BAB with all iterative attack entries, initiative, grapple, save totals, max HP (CON mod × `phase0_characterLevel`, not ECL). `$derived` for all skill pipelines referencing Phase 2 attribute results to prevent circular dependencies. Auto-generate synergy modifier entries from `config_skill_synergies` config table where ranks threshold is met. Per `ARCHITECTURE.md` §9.7–9.8.

- [ ] **3.5 Max DEX Bonus Special Case (DAG Phase 3 intercept):** In Phase 3 `$derived`, intercept `combatStats.max_dex_bonus` before the general stacking loop: (1) separate all modifiers with `type === "max_dex_cap"`, (2) `effectiveBaseValue = Math.min(...caps)` (99 when no cap modifiers exist), (3) pass remaining untyped additive modifiers (e.g. Mithral's +2) through `applyStackingRules()` with this `effectiveBaseValue`, (4) `continue` to skip general processing. This implements minimum-wins cap logic without polluting the standard stacking path. Per `ARCHITECTURE.md` §4.17.

- [ ] **3.6 Gestalt Mode Integration (DAG Phase 3.7):** In the Phase 3 `$derived`, read `settings.variantRules?.gestalt ?? false`. For each pipeline in `GESTALT_AFFECTED_PIPELINES`: when `true`, separate `"base"` type modifiers by class source, call `computeGestaltBase()`, inject gestalt total as `effectiveBaseValue` into `applyStackingRules()` with only non-`"base"` modifiers. HP pipeline always uses additive stacking regardless of gestalt mode. Standard path unchanged when `false`. Per `ARCHITECTURE.md` §8.1–8.2.

- [ ] **3.7 Resource Pools, Action & Ephemeral Methods:** Add all runtime action methods to `GameEngine.svelte.ts`. _Resource ticks & rests:_ `triggerTurnTick()`, `triggerRoundTick()`, `triggerEncounterReset()`, `triggerShortRest()`, `triggerLongRest()`, `triggerDawnReset()` (resets `"per_day"` character pools + calls private `#resetItemPoolsByCondition("per_day")`), `triggerWeeklyReset()`. `rechargeAmount` formulas resolved via Math Parser. _Item pool management:_ `initItemResourcePools(instance, feature)` (idempotent — only adds absent pool keys, never overwrites existing values including 0), `getItemPoolValue(instanceId, poolId)` (falls back to `template.defaultCurrent`), `spendItemPoolCharge(instanceId, poolId, amount?)` (floors at 0), `#resetItemPoolsByCondition(condition)`. _Activation:_ `activateWithTier(instanceId, tierIndex)` (validates tier index, resolves `cost` via Math Parser, checks pool balance, deducts charges, returns tier `grantedModifiers` array or `null` on any failure). _Trigger dispatch:_ `getReactionFeaturesByTrigger(triggerEvent)` (returns active `"reaction"` features matching event, excludes `"passive"` and inactive instances). _Consumables & ephemeral:_ `consumeItem(sourceInstanceId, currentRound?)` (two-phase atomic: push ephemeral `ActiveFeatureInstance` → remove source item; returns `null` for non-consumable or missing instance), `expireEffect(instanceId)` (refuses to remove non-ephemeral instances), `getEphemeralEffects()` (sorted newest-round-first). _Removal guard:_ `removeFeature(instanceId)` (checks `removalPrevention.isCursed`, blocks cursed items with warning), `#removeFeatureUnchecked(instanceId)` (trusted internal callers), `tryRemoveCursedItem(instanceId, dispelMethod)` (returns `true`/`false`/`null`). Per `ARCHITECTURE.md` §4.4, 5.5b, 5.7, 6.5, 4.15.

- [ ] **3.8 Feat Slots & Leveling Analytics (DAG Phase 4b):** Add `phase4_featSlots` `$derived` (base = `1 + floor(@characterLevel / 3)` + bonus slots from features). Add `phase4_skillPointsBudget` `$derived` computing SP independently per class: `max(1, spPerLevel + intMod) × classLevel` for each class; first class (JS key insertion order) receives 4× first-level bonus (`3 × max(1, spPerLevel + intMod)` added); racial/feat bonus SP (targeting `attributes.bonus_skill_points_per_level`) applied per total character level. Export `ClassSkillPointsEntry` and `SkillPointsBudget` types. Add `phase4_levelingJournal` `$derived` (per-class BAB/save totals from `phase0_flatModifiers` filtered by `sourceId`; XP penalty detection; multiclass XP penalty with favored-class exemption). Export `LevelingJournalClassEntry` and `LevelingJournal` types. Methods: `setSkillRanks(skillId, ranks)` with `max(minimumSkillRanks?.[skillId] ?? 0, 0)` floor clamping, `lockSkillRanksMin(skillId)` (max-merge, never lowers floor), `lockAllSkillRanks()`. Per `ARCHITECTURE.md` §9.8.

### Phase 4: Persistence & I/O

- [ ] **4.1 Multi-Character & Settings Storage:** Create `src/lib/engine/StorageManager.ts`. Implement CRUD for multiple `Character` objects and `CampaignSettings` in `localStorage`. Connect to `GameEngine` via Svelte 5 `$effect` for auto-save. Implement `LinkedEntity` serialization guard to prevent circular back-references.

- [ ] **4.2 Data Dictionary (DataLoader & Merge Engine):** Create `src/lib/engine/DataLoader.ts`. Fetch JSON rule files from `static/rules/` recursively in alphabetical directory order. Cache in memory. Filter entities by `CampaignSettings.enabledRuleSources`. Distinguish `Feature` entities (`id` + `category` fields) from config tables (`tableId` field). Implement **Merge Engine**: `"replace"` (default — fully overwrites entity), `"partial"` (append arrays, merge `levelProgression` by level key, merge `choices` by `choiceId`, `-prefix` convention for array deletions). Resolution chain: base rule files (last wins) → `Campaign.gmGlobalOverrides` → `Character.gmOverrides`. Config tables always replaced entirely (never partial-merged).

### Phase 5: Test UI (Validation)

_Goal: Build a minimal test harness that validates the core engine pipeline end-to-end before the full UI is built._

- [ ] **5.1 Mock Data:** Create `static/rules/test_mock.json` (Race with racial ability modifiers and tags, Class with `levelProgression` and `classSkills`, Armor Item with `"max_dex_cap"` modifier, Condition, Orc Enemy with `"attacker.*"` modifier for −1 to attacker rolls). Create `static/rules/test_override.json` to test `merge: "partial"` (array append + `-prefix` deletion) and `merge: "replace"`.

- [ ] **5.2 Settings & Character Sheet Component:** Create `src/routes/+page.svelte`. Add toggles for "Exploding 20s", "Reroll 1s", "Vitality/WP Mode", "Gestalt Mode". Display Total Strength pipeline total and Total AC pipeline total.

- [ ] **5.3 Graph & Context Testing:** Add "Attack the Orc" button triggering `parseAndRoll()`. Prove: (1) situational modifier `"+2 vs Orcs"` applies ONLY during the roll, not to the static pipeline total; (2) "Exploding 20s" rerolls and accumulates consecutive 20s correctly; (3) V/WP mode routes crit damage to `"res_wound_points"` and normal hits to `"res_vitality"`; (4) the Orc's `"attacker.*"` modifier applies a −1 penalty to the attacker's roll.

- [ ] **5.4 Merge Engine Testing:** Prove that enabling `test_override.json` as a rule source (after the base source) correctly applies partial merges (array append, `-prefix` deletion) and full replacement (`merge: "replace"`). Verify priority order: base → GM global → GM per-character.

- [ ] **Checkpoint #1 — Engine & Foundation Conformance** (requires Phases 1–5): Run from `CHECKPOINTS.md`. Verify TypeScript interfaces, Math Parser, Logic Evaluator, Stacking Rules, Dice Engine (incl. V/WP, fortification, on-crit burst, attacker mods), DAG phases 0–4b, all resource/action/ephemeral methods, DataLoader & Merge Engine, Test UI. Resolve all CRITICAL and MAJOR issues before proceeding.

### Phase 6: Campaign Management & User Context

_Goal: Establish the overarching container for characters. A Campaign groups characters, tracks story progression, and handles GM vs. Player visibility._

- [ ] **6.1 User Context & Roles:** Create `src/lib/engine/SessionContext.svelte.ts` — mock user session with `currentUserId`, `isGameMaster` (boolean), `activeCampaignId`. Design as a drop-in replacement for a real PHP-backed auth session.

- [ ] **6.2 Character Model UI Updates:** Update `src/lib/types/character.ts` to add UI metadata: `campaignId`, `ownerId`, `isNPC` (boolean), `posterUrl`, `playerRealName`, `customSubtitle`.

- [ ] **6.3 Campaign Hub UI:** Create `src/routes/campaigns/+page.svelte`. Display campaign grid using `posterUrl`/`bannerUrl`. "Create Campaign" button visible only to GM.

- [ ] **6.4 Campaign Details & Acts UI:** Create `src/routes/campaigns/[id]/+page.svelte`. Display campaign banner and summary. Render Chapters/Acts list. GM can toggle `isCompleted` on chapters.

### Phase 7: The Character Vault

_Goal: Build the character selection screen respecting GM vs. Player visibility rules._

- [ ] **7.1 Visibility Logic:** In `GameEngine` or a `VaultStore`, create `$derived` array `visibleCharacters`. Rules: filter by `activeCampaignId`; if GM return all characters/NPCs/monsters; if player return only own characters plus their `LinkedEntity` companions.

- [ ] **7.2 Character Card Component:** Create `src/lib/components/vault/CharacterCard.svelte`. Display `posterUrl` (fallback placeholder), character name, level badge (sum of `classLevels`). Subtitle priority: `customSubtitle` → Race label (if NPC) → `playerRealName` (if PC).

- [ ] **7.3 Character Vault Page:** Create `src/routes/campaigns/[id]/vault/+page.svelte`. Responsive grid of `CharacterCard` components from `visibleCharacters`.

- [ ] **7.4 Empty State & Creation Actions:** Empty state in vault page. "Create New Character" button. GM: additional "Add NPC/Monster" button. Both initialize a blank `Character` via `StorageManager` and navigate to the Phase 8 editor.

### Phase 8: UI Construction — "Core" Tab (Summary View)

_Goal: Build the fundamental character sheet. Components here are simplified read-only overviews. No game logic in .svelte files — UI only reads `$derived` values and dispatches intents to the engine._

- [ ] **8.1 Tab Navigation & Layout Skeleton:** Create `src/routes/character/[id]/+page.svelte`. Tabbed navigation (Core, Abilities, Combat, Feats, Magic, Inventory). `GameEngine` loads character from URL via `StorageManager`.

- [ ] **8.2 Generic Feature Modal (Data Display):** Create `src/lib/components/ui/FeatureModal.svelte`. Takes a Feature ID, fetches from `DataLoader`, displays localized description, prerequisites, modifiers as readable text, and granted features.

- [ ] **8.3 Basic Information Component:** Create `src/lib/components/core/BasicInfo.svelte`. Dropdowns for Race, Class, Deity, Alignment, Size. Selecting Race/Class triggers engine to add `ActiveFeatureInstance` and initialize `classLevels`. Dynamic modifier badges (e.g. "+2 DEX") read from feature data.

- [ ] **8.4 Dynamic Feature Choices:** Update `BasicInfo.svelte` to handle `FeatureChoice` arrays. For each choice, render a dropdown fetching options via `optionsQuery` from `DataLoader`. Bind selections to `ActiveFeatureInstance.selections`.

- [ ] **8.5 Ability Scores Summary:** Create `src/lib/components/core/AbilityScoresSummary.svelte`. Compact read-only 6-stat grid showing `totalValue` and `derivedModifier`. Link to Abilities tab.

- [ ] **8.6 Saving Throws Summary:** Create `src/lib/components/core/SavingThrowsSummary.svelte`. Compact Fort/Ref/Will total modifiers. Read-only.

- [ ] **8.7 Skills Summary:** Create `src/lib/components/core/SkillsSummary.svelte`. Condensed skill name + total bonus list. Read-only, link to Abilities tab.

- [ ] **8.8 Languages & Lore Component:** Create `src/lib/components/core/LoreAndLanguages.svelte`. Text areas for Personal Story and Appearance. Language system: calculate available languages (INT mod + Speak Language ranks), display auto-granted languages (from features), dropdown to add more until limit reached.

### Phase 9: UI Construction — "Abilities & Skills" Tab (Full Interactive Editor)

- [ ] **9.1 Data Model Extensions:** Add `recommendedAttributes?: ID[]` to `Feature` interface in `feature.ts` (used by Point Buy UI to color-code preferred stats). Ensure `SkillPipeline` synergy bonuses auto-appear via DAG Phase 4 synergy generation (Phase 3.4).

- [ ] **9.2 Breakdown & Dice Roll Modals:** Create `src/lib/components/ui/ModifierBreakdownModal.svelte` (reads pipeline `activeModifiers`, displays "Base + Modifiers = Final" math). Create `src/lib/components/ui/DiceRollModal.svelte` (calls `parseAndRoll()`, displays `RollResult` with crit/fumble highlighting; in V/WP mode shows `→ WOUND POINTS` or `→ Vitality Points` routing row).

- [ ] **9.3 Ability Scores Panel:** Create `src/lib/components/abilities/AbilityScores.svelte`. 6 stat panels: `derivedModifier` (prominent), editable base score, temporary modifier. "i" (opens Breakdown modal) and dice (opens Roll modal) buttons per stat.

- [ ] **9.4 Stat Generation Wizards:** Create `PointBuyModal.svelte` (D&D 3.5 point buy math, reads `pointBuyBudget` from `CampaignSettings`, color-codes stats using `recommendedAttributes`). Create `RollStatsModal.svelte` (4d6 drop lowest, respects `rerollOnes` setting, assigns rolled values to chosen attributes).

- [ ] **9.5 Saving Throws Panel:** Create `src/lib/components/abilities/SavingThrows.svelte`. Fort/Ref/Will panels: final modifier, related ability modifier block (color-coded), misc modifier, editable temporary modifier. Breakdown and Roll buttons.

- [ ] **9.6 Skills Matrix Panel:** Create `src/lib/components/abilities/SkillsMatrix.svelte`. Header showing SP Available (from `engine.phase4_skillPointsBudget.totalAvailable`) vs. SP Spent. Table: class-skill checkbox (read-only), skill name, total bonus, key ability, misc input, ranks input (clamped to `[minimumRanks, maxRanks]`, "Min" badge when floor active), cost per rank (1 or 2), max allowed ranks. Ranks input directly calls `engine.setSkillRanks()`. Synergy bonuses appear in Breakdown modal. "Journal" button opens Leveling Journal modal.

### Phase 10: UI Construction — "Combat" Tab

_Goal: Build the full Combat tab. Rely entirely on DAG pipelines. Engine handles all calculations._

- [ ] **10.1 Health & Experience Panel:** Create `src/lib/components/combat/HealthAndXP.svelte`. HP bar (Current/Temporary/Nonlethal); Heal/Damage buttons (damage depletes temp HP first). XP bar with threshold from `config_xp_table` using `@eclForXp` (not `@characterLevel`). LA and ECL badges when `levelAdjustment > 0`. "Reduce LA" button per SRD conditions. "Start Turn" → `triggerTurnTick()`. "New Encounter" → `triggerEncounterReset()`. "Long Rest" → `triggerLongRest()`. In V/WP mode: dual VP/WP bars replace standard HP status.

- [ ] **10.2 Armor Class Panel:** Create `src/lib/components/combat/ArmorClass.svelte`. Three pipelines: `combatStats.ac_normal`, `combatStats.ac_touch`, `combatStats.ac_flat_footed`. Breakdown modal on "i" icons (shows why Touch AC ignores Armor/Shield). Temp modifier input applies to all three pipelines. Effective DEX to AC = `min(dexMod, combatStats.max_dex_bonus.totalValue)`.

- [ ] **10.3 Core Combat Stats:** Create `src/lib/components/combat/CoreCombat.svelte`. BAB (with iterative attacks), Initiative, Grapple pipelines. Roll and Breakdown buttons for Initiative and Grapple.

- [ ] **10.4 Weapons & Attacks Panel:** Create `src/lib/components/combat/Attacks.svelte`. Main Hand, Off Hand, Ranged dropdowns reading from Inventory (`ItemFeature` with weapon tags) + Unarmed option. Dynamically calculate Total Attack Bonus and Damage based on weapon, STR/DEX mods, BAB, Size, enhancement. Roll buttons pass weapon damage dice to `DiceEngine`.

- [ ] **10.5 Movement Speeds Panel:** Create `src/lib/components/combat/MovementSpeeds.svelte`. Land, Burrow, Climb, Fly, Swim speed pipelines. Explicit "Armor Penalty Effect" and "Load Penalty Effect" pipeline display.

- [ ] **10.6 Energy & Special Resistances:** Create `src/lib/components/combat/Resistances.svelte`. Pipelines for Fire, Cold, Acid, Electricity, Sonic, SR, PR, Fortification (`combatStats.fortification`), Arcane Spell Failure (`combatStats.arcane_spell_failure`). User misc modifier inputs.

- [ ] **10.7 Damage Reduction Builder:** Create `src/lib/components/combat/DamageReduction.svelte`. UI to construct DR entries (Value, bypass tags, type: "Innate/best-wins" vs "Class/additive"). "Add DR" generates a custom `ActiveFeatureInstance` pushed to engine. Active DRs shown with delete button. DR panel renders `StackingResult.drEntries` — suppressed DRs shown with strikethrough.

- [ ] **10.8 Action Budget Bar & Ephemeral Effects Panel:** Create `src/lib/components/combat/ActionBudgetBar.svelte` — reads all active features with `actionBudget`, computes min-wins per action category, renders per-action buttons (Standard, Move, Swift, Full-Round, Free) with spent counter, blocked actions shown as disabled with source tooltip, XOR exclusion via `action_budget_xor` tag (Staggered/Disabled), "Reset Turn" button. Create `src/lib/components/combat/EphemeralEffectsPanel.svelte` — lists active ephemeral effects (source/duration badge/round); two-click "Expire" confirmation (single mis-click prevention). Both integrated into Combat tab left column. Per `ARCHITECTURE.md` §5.6, 6.5.

### Phase 11: UI Construction — "Feats" Tab

- [ ] **11.1 Feat Capacity Pipeline:** In `GameEngine`, `phase4_featSlots` `$derived` (from Phase 3.8) — base `1 + floor(characterLevel / 3)` plus bonus slots from active features. "Feats Left" = total slots − manually selected feats count.

- [ ] **11.2 Feats Tab Layout & Lists:** Create `src/lib/components/feats/FeatsTab.svelte`. Header showing "Feats Available" / "Feats Left" counters. Granted Feats section (auto-granted by Race/Class — read-only, shows source tag). Selected Feats section (player-chosen, with Delete button to free slot).

- [ ] **11.3 Feat Catalog Modal:** Create `src/lib/components/feats/FeatSelectionModal.svelte`. Fetches all `category: "feat"` features from `DataLoader`. Text search (by title/description). Tag badges (e.g. "Fighter Bonus Feat", "Metamagic").

- [ ] **11.4 Prerequisite Evaluation UI:** In `FeatSelectionModal`, run `prerequisitesNode` through `logicEvaluator` for each feat. Failed feats: row disabled, failing `errorMessage`s shown in red. Met prerequisites shown in green.

### Phase 12: UI Construction — "Spells & Powers" Tab

- [ ] **12.1 Magic Resources & Limits:** In `GameEngine`, derive `Caster Level` and `Manifester Level` pipelines. Derive `Spell Slots` (per level 0–9) and `Power Points` max from class JSON formulas and the relevant key ability modifier.

- [ ] **12.2 Spells/Powers Catalog (The Grimoire):** Create `src/lib/components/magic/Grimoire.svelte`. Interface to learn/add spells. Filters `MagicFeature` items by character's active `spellLists` and class level.

- [ ] **12.3 Preparation & Casting Panel:** Create `src/lib/components/magic/CastingPanel.svelte`. Group known spells by level (0–9). For psionic characters: group by `discipline` (discipline tab bar). "Prepare" counter (Vancian) or "Cast/Manifest" button (spontaneous/psionic). Spell detail modal: School, Components, Range, Duration, Roll button, Save DC = `10 + spell level + key ability mod`. Psionic: `displays` badges with suppress-DC tooltip, augmentation picker (cost stepper, cap at manifester level), `effectDescription` shown for qualitative augmentations. Rod of Metamagic integration: identifies equipped rods via `metamagicEffect`, offers free metamagic up to `maxSpellLevel`. Staff: `staffSpells` array drives per-spell charge cost. Wand: `wandSpell` uses item `casterLevel` (not wielder's). Scroll: `scrollSpells` enforces arcane/divine restriction, CL check DC = `casterLevel + 1`.

- [ ] **12.4 Special & Domain Abilities Panel:** Create `src/lib/components/magic/SpecialAbilities.svelte`. Filters active features for `class_feature` or `domain` category with `activation` type. Displays as cards tied to `ResourcePool`s. "Use" button calls `engine.spendItemPoolCharge()` or decrements the resource pool.

### Phase 13: UI Construction — "Inventory" Tab

- [ ] **13.1 Equipment Slot Pipelines:** `GameEngine` default slot pipelines (from Phase 3.1) now used by UI: `slots.ring`, `slots.head`, `slots.body`, `slots.main_hand`, `slots.off_hand`, etc.

- [ ] **13.2 Inventory Sections & Layout:** Create `src/lib/components/inventory/InventoryTab.svelte`. Three sections: Equipped/Readied, Backpack/Carried (contributes to weight), Storage/Stashed (does not).

- [ ] **13.3 Equip, Slot Enforcement & Psionic Item Cards:** "Equip" checks `slots.*` pipeline total vs. currently equipped count; blocks with warning if full. Toggle `isActive` on success. `two_hands` items check both `main_hand` and `off_hand` free. Consumable items show "Drink"/"Apply"/"Use" button calling `engine.consumeItem()`. Create `src/lib/components/inventory/PsionicItemCard.svelte` for items with `psionicItemData`: per-type UI — Cognizance Crystal (PP bar, attunement toggle); Dorje (charge bar 0–50, Use button); Power Stone (per-power list, Brainburn ⚠ warning when wielder ML < stone ML); Psicrown (PP bar, Manifest buttons); Psionic Tattoo (activate button, fade indicator). Psionic tattoo equipping enforces 20-tattoo limit. Cursed items show removal-prevention indicator (no Unequip button). Per `ARCHITECTURE.md` §15.3, 4.15.

- [ ] **13.4 Encumbrance & Wealth Calculator:** Create `src/lib/components/inventory/Encumbrance.svelte`. `$derived` total weight (Equipped + Backpack). Compare vs. STR carrying capacity thresholds from `config_carrying_capacity` table. Medium/Heavy load dispatches `condition_encumbered` feature to engine. CP/SP/GP/PP inputs with coin weight (50 coins = 1 lb).

- [ ] **Checkpoint #2 — UI Layer Conformance** (requires Phases 1–13): Run from `CHECKPOINTS.md`. Verify zero game logic in .svelte files, zero hardcoding, Campaign/Vault visibility rules, all six tab implementations, Navigation & Routes. Resolve all CRITICAL and MAJOR issues before proceeding.

### Phase 14: PHP Backend & Frontend Integration

_Goal: Replace localStorage mock with a PHP/SQLite backend REST API designed for cheap shared hosting._

- [ ] **14.1 Database Configuration & PDO Setup:** Create `/api` folder structure. `api/config.php` (SQLite DB path, env mode toggle). `api/Database.php` singleton with PDO/SQLite, falls back to `sqlite::memory:` during tests.

- [ ] **14.2 Authentication System:** Create `api/auth.php`. `POST /api/auth/login` (bcrypt verify), `POST /api/auth/logout`, `GET /api/auth/me`. `requireAuth()` middleware returning 401 on unauthenticated requests.

- [ ] **14.3 CORS & Security Middleware:** Create `api/middleware.php`. Configurable CORS headers (not wildcard `*`). CSRF protection on POST/PUT/DELETE. Simple rate limiting.

- [ ] **14.4 Database Schema & Migrations:** Create `api/migrate.php`. Tables: `users` (id, username, password_hash, display_name, is_game_master), `campaigns` (id, title, poster_url, banner_url, owner_id, chapters_json, enabled_rule_sources_json, gm_global_overrides_text, updated_at), `characters` (id, campaign_id, owner_id, name, is_npc, character_json, gm_overrides_json, updated_at). `character_json` stores full ECS state. Backend never processes D&D rules.

- [ ] **14.5 REST API Endpoints:** `GET/POST /api/campaigns`, `GET/PUT /api/campaigns/{id}`, `GET /api/campaigns/{id}/sync-status` (timestamps for polling), `GET /api/characters?campaignId=X` (visibility: GM gets all + raw overrides, players get own with overrides merged invisibly), `POST /api/characters`, `PUT /api/characters/{id}` (ownership/GM check), `PUT /api/characters/{id}/gm-overrides` (GM only), `DELETE /api/characters/{id}` (ownership/GM check).

- [ ] **14.6 Frontend Integration (StorageManager):** Refactor `StorageManager.ts` to use async `fetch()` calls to PHP API. Debounced auto-save (2s). Graceful offline fallback to localStorage. Polling mechanism: check `sync-status` every 5–10s, selectively re-fetch only changed data.

- [ ] **14.7 SvelteKit Proxy Configuration:** Configure `vite.config.ts` to proxy `/api` to PHP dev server. Target configurable (not hardcoded to localhost:8080).

### Phase 15: GM Tools — Rule Sources & Override Screens

- [ ] **15.1 Rule Source Manager UI:** Create `src/routes/campaigns/[id]/settings/+page.svelte` (GM-only). List available JSON rule source files. Enable/disable and reorder via drag-and-drop. Save ordered list to `CampaignSettings.enabledRuleSources`. Variant Rules section: "Gestalt Characters" and "Vitality & Wound Points" checkboxes persisted in `settings.variantRules`.

- [ ] **15.2 Global Override Text Area:** JSON text area for `gmGlobalOverrides` (array of Feature-like objects + config table objects). JSON validator with line-error highlighting. Saves to `Campaign.gmGlobalOverrides`.

- [ ] **15.3 GM Entity Dashboard:** Create `src/routes/campaigns/[id]/gm-dashboard/+page.svelte` (GM-only). List all characters/NPCs/monsters. Click → read-only character summary. Below: per-character `gmOverrides` JSON text area with validator. Applied last in resolution chain.

- [ ] **15.4 Override Resolution Chain:** Enforce the strict order in `DataLoader` and `GameEngine`: (1) rule source files (last-wins by order), (2) `Campaign.gmGlobalOverrides`, (3) `Character.gmOverrides`. Each layer respects `merge` semantics.

- [ ] **Checkpoint #3 — Backend & GM Tools** (requires Phases 1–15): Run from `CHECKPOINTS.md`. Verify auth/bcrypt, CSRF, SQL injection audit, schema integrity, visibility rules, sync timestamps, GM override system (Feature + config table objects), Vite proxy config, rule source discovery. Resolve all CRITICAL and MAJOR issues before proceeding.

### Phase 16: Backend Unit Testing (PHPUnit)

- [ ] **16.1 PHPUnit & Memory DB Setup:** Install PHPUnit. Configure `phpunit.xml` with `sqlite::memory:` for tests.

- [ ] **16.2 Character Persistence Tests:** Create `tests/CharacterControllerTest.php`. Test save/load round-trip of deeply nested character JSON (activeFeatures, classLevels, gmOverrides) without corruption.

- [ ] **16.3 Visibility & Authorization Tests:** Create `tests/VisibilityTest.php`. Non-GM session attempting to fetch another player's character → 403 Forbidden.

- [ ] **16.4 Authentication Tests:** Create `tests/AuthTest.php`. Valid/invalid login, protected endpoints return 401 without session, session persists across requests.

- [ ] **16.5 GM Override Visibility Tests:** Create `tests/GmOverrideTest.php`. Player receives merged data (raw `gmOverrides` not exposed). GM receives base data + raw `gmOverrides` separately.

- [ ] **16.6 Sync Timestamp Tests:** Create `tests/SyncTest.php`. Modifying a character updates `updated_at`. `sync-status` returns correct timestamps. Modifying GM overrides also updates character's `updated_at`.

### Phase 17: Frontend Engine & Rules Unit Testing (Vitest)

_Goal: Exhaustively test the engine Brain with deterministic tests using raw JSON inputs._

- [ ] **17.1 Math & Placeholder Tests:** Create `src/tests/mathParser.test.ts`. Cover all `@`-paths, order-of-operations, `|distance`/`|weight` pipes in both locales, `@eclForXp` vs `@characterLevel` distinction, formula-as-value strings, unresolved path returning 0.

- [ ] **17.2 Logic Evaluator Tests:** Create `src/tests/logicEvaluator.test.ts`. Deeply nested AND > OR > NOT > CONDITION trees. `has_tag`/`missing_tag` against `@activeTags`. All 8 operators. `choiceGrantedTagPrefix` sub-tag emission. `errorMessage` from failing nodes.

- [ ] **17.3 Stacking Rules Tests:** Create `src/tests/stackingRules.test.ts`. All 4 stackable types (dodge, circumstance, synergy, untyped). `setAbsolute` override + last-wins tie. Negative modifier. DR best-wins grouping: same-bypass suppression, independent bypass coexistence, AND-bypass distinct group, sort-order consistency, `drEntries` absent when no DR modifiers. `"inherent"` within-type best-wins, cross-type stacking. `"max_dex_cap"` excluded from this function (handled in Phase 3.5).

- [ ] **17.4 Dice Engine Tests:** Create `src/tests/diceEngine.test.ts`. Injectable RNG for all tests. Situational context match/no-match. Exploding 20s [20,20,5]. Natural 20/1 flags. Crit range. V/WP routing (standard/V/WP/`isCriticalHit` flag). Attacker mod resolution (correct pipeline, situational filter, wrong pipeline excluded, defender `totalBonus` unchanged, `attackerPenaltiesApplied` absent when no match). Fortification: no-pct absent, non-crit no-check, boundary values 25%/75%/100%, V/WP routing for negated vs. non-negated crits. On-crit burst dice: ×2/×3/×4 scaling, Thundering, `totalAdded` in `finalTotal`, `scalesWithCritMultiplier=false`, fort-negated → no burst, malformed formula → no crash.

- [ ] **17.5 DAG Integration Tests:** Create `src/tests/dagResolution.test.ts`. Belt of CON +2 cascade (CON → Fort → HP). Formula-as-value (`"@attributes.stat_wis.derivedModifier"` for Monk AC). `forbiddenTags` blocking. `conditionNode` on modifier. Dual-gated modifier. Synergy auto-generation. Circular dependency guard (handled gracefully, no crash).

- [ ] **17.6 Multiclass & Level Progression Tests:** Create `src/tests/multiclass.test.ts`. `characterLevel` sum. Multi-class BAB (full + half BAB contributions). Level-gated feature granting (granted at level X, not at X−1). `@eclForXp` for monster PC (Drow Rogue 3 LA+2 → `eclForXp = 5`, `@characterLevel = 3`). ECL equals `@characterLevel` for standard PCs.

- [ ] **17.7 Merge Engine Tests:** Create `src/tests/mergeEngine.test.ts`. Full replace. Partial merge (array append, `levelProgression` by level, `choices` by `choiceId`). `-prefix` array deletion. Full 3-layer resolution chain (base → GM global → GM per-character). Config table replacement (same `tableId`, no partial merge).

- [ ] **17.8 Engine Enhancement & Edge Case Tests:** Create / extend test files: `src/tests/resourcePool.test.ts` (all 8 `resetCondition` values, `triggerDawnReset` isolation from `"per_week"`/`"long_rest"`/`"never"`, `triggerWeeklyReset` isolation); `src/tests/itemResourcePools.test.ts` (`initItemResourcePools` idempotency including existing 0-values, `spendItemPoolCharge` floor, cross-instance independence, stashed instance excluded from reset); `src/tests/tieredActivation.test.ts` (charge deduction per tier, `grantedModifiers` returned, out-of-range/insufficient-charges → `null`); `src/tests/triggerActivation.test.ts` (`getReactionFeaturesByTrigger` returns matching reactions, excludes passive features and inactive instances); `src/tests/ephemeralEffects.test.ts` (`consumeItem` lifecycle + all guard paths, `expireEffect` safety, `getEphemeralEffects` sorting); `src/tests/inherentBonus.test.ts` (within-type best-wins, cross-type stacking); `src/tests/metamagicRods.test.ts` (all 6 feats, 3 tier levels); `src/tests/staffSpells.test.ts` (charge costs 1–5, coexistence); `src/tests/wandSpell.test.ts` (item CL, heightened wands, 5 MM variants); `src/tests/scrollSpells.test.ts` (arcane/divine restriction, spellLevel required, CL check DC); `src/tests/cursedItemRemoval.test.ts` (`removeFeature` guard, `tryRemoveCursedItem` return table, consumeItem/expireEffect unaffected); `src/tests/intelligentItems.test.ts` (all alignments/communication, Ego formula, field contract); `src/tests/augmentationRule.test.ts` (backward compat, mechanical + qualitative augmentations, CastingPanel fallback); `src/tests/maxDexBonus.test.ts` (no armor = 99, single cap, Mithral additive, multi-cap min-wins, zero cap).

- [ ] **Checkpoint #4 — Test Suite Exhaustiveness** (requires Phases 1–17): Run from `CHECKPOINTS.md`. Verify PHPUnit coverage (persistence, visibility, auth, GM overrides, sync) and Vitest coverage (all engine paths, all extension types, all edge cases). Resolve all CRITICAL and MAJOR gaps before proceeding.

### Phase 18: Tooling, Build Pipeline & Developer Experience

_Goal: Zero-dependency build and deployment pipeline. Developer can clone, build, test, debug, and deploy without global dependencies beyond Node.js._

- [ ] **18.1 Docker Build Pipeline:** Create multi-stage `Dockerfile` (node-deps → type-check → test → build → php-deps → php-test → artifact) and `docker-compose.yml` (configurable `APP_VERSION`, `NODE_VERSION`, `PHP_VERSION`, `OUTPUT_DIR`). Final stage: compressed tarball (SvelteKit build + PHP API + static assets + Apache `.htaccess`).

- [ ] **18.2 Native Build Script:** Create `scripts/build.sh`. Bootstrap portable tools in `.build-tools/` (static PHP binary if system PHP < 8.1, Composer PHAR). Full pipeline: npm install → Composer install → svelte-check → Vitest → PHPUnit → Vite build → artifact tarball. Options: `--env`, `--output`, `--deploy`, `--tag`, `--skip-tests`, `--no-clean`.

- [ ] **18.3 Docker Build Wrapper:** Create `scripts/build-docker.sh`. Detect Docker/docker-compose. Options: `--tag`, `--output`, `--no-cache`, `--push`, `--registry`. Verify output tarball after build.

- [ ] **18.4 Local Run Script (Native):** Create `run.sh`. Auto-locate latest artifact, resolve PHP binary, load `.env` (priority: shell env > `--env-file` > project `.env` > artifact `.env`), write PHP router script, auto-run `migrate.php` on first launch. Options: `--port`, `--dir`, `--env-file`.

- [ ] **18.5 Local Run Script (Docker):** Create `run-docker.sh`. Minimal `php:8.3-apache` run image (pdo_sqlite, mod_rewrite). Mount artifact read-only. Persist SQLite DB in named Docker volume (`character-vault-db`). Options: `--port`, `--dir`, `--env-file`, `--no-cache`.

- [ ] **18.6 VS Code Debug Configurations:** Create `.vscode/launch.json` (Chrome, Edge, Firefox frontend; PHP/Xdebug backend; compound full-stack sessions). Create `.vscode/tasks.json` (Vite dev server, PHP dev server, DB migrations, native build, local server as background tasks). All PHP configs use `scripts/php-dev.sh`. Presentation groups: fullstack → frontend → backend → tests → artifact.

- [ ] **18.7 VS Code Extensions:** Create/update `.vscode/extensions.json` (Svelte, PHP IntelliSense, Xdebug, ESLint, Prettier, Chrome/Edge DevTools, Firefox Debugger).

- [ ] **18.8 PHP Binary Resolver:** Create `scripts/php-dev.sh`. Resolution priority: (1) `CHAR_VAULT_PHP` env var, (2) system PHP with Xdebug when `XDEBUG_MODE` set, (3) `.build-tools/bin/php`, (4) system PHP ≥ 8.1. Warn if Xdebug requested but not found. Forward all args via `exec`.

- [ ] **18.9 Environment Variable Support:** Create `.env.example` documenting `APP_ENV`, `DB_PATH`, `CORS_ORIGIN`. Update `api/config.php` with priority loader (process env > .env file > built-in defaults). Update `run.sh`/`run-docker.sh` with `--env-file` and `.env` loading.

- [ ] **18.10 Version Control & Documentation:** Update `.gitignore` (exclude `dist/`, `dist-pkg/`, `.build-tools/`, `.env`, `*.sqlite*`). Rewrite `README.md` with comprehensive docs: structure, prerequisites, quick start, development, testing, VS Code debugging, building, running, env vars, production deployment.

- [ ] **Checkpoint #5 — Tooling & DX** (requires Phase 18): Run from `CHECKPOINTS.md`. Verify native build pipeline, Docker build, local run scripts, VS Code launch/task configs, PHP binary resolver, `.env` priority semantics, `.gitignore` completeness, README accuracy. Resolve all CRITICAL and MAJOR issues before proceeding.

### Phase 19: UI Excellence — Tailwind CSS, Theming, Responsive Design & Iconography

_Goal: Elevate the entire UI to professional quality. Tailwind CSS, light/dark theme, Lucide icons, full-height layout, responsive down to 320px, touch-friendly._

**Design decisions (locked in):** Tailwind CSS v4+, `lucide-svelte`, indigo accent palette, CSS class-based dark mode, collapsible sidebar navigation, full-viewport-height character sheet, 44px touch targets.

- [ ] **19.1 Tailwind CSS & PostCSS Setup:** Install Tailwind CSS v4+, PostCSS, autoprefixer. Configure `tailwind.config.ts`, `postcss.config.js`, `src/app.css`. Extend palette: `accent` scale (indigo), semantic aliases (`surface`, `surface-alt`, `border`, `text-primary`, `text-muted`). Breakpoints: sm/md/lg/xl/2xl. `darkMode: 'class'`. Import in root `+layout.svelte`.

- [ ] **19.2 Theme Engine & Cookie Persistence:** Create `src/lib/stores/ThemeManager.svelte.ts` — 3-state Svelte 5 rune (`'system'`, `'light'`, `'dark'`). Read/persist from `theme` cookie (`max-age=31536000`, `SameSite=Lax`). Live `prefers-color-scheme` listener. Create `ThemeToggle.svelte` (System/Light/Dark cycle). FOWT prevention: synchronous `<script>` in `src/app.html` `<head>` reads cookie and applies `dark` class. All theme colors as CSS custom properties.

- [ ] **19.3 Lucide Icons Integration:** Install `lucide-svelte`. Replace ALL emoji with Lucide components. Sizing: 16px inline, 20px buttons/nav, 24px headers. `currentColor` inheritance. Full icon mapping documented.

- [ ] **19.4 Global Layout Shell & Sidebar Navigation:** Refactor `+layout.svelte`. Create `AppShell.svelte` + `Sidebar.svelte`. Desktop ≥1024px: expanded (icon+label), collapsible to icon-only, state persisted in cookie. Tablet 768–1023px: icon-only default. Mobile <768px: hidden, slides in as overlay drawer with backdrop. Top bar on mobile (hamburger, page title, breadcrumbs). `transition-all duration-200` animations.

- [ ] **19.5 Design System — Base Component Classes:** Define reusable patterns in `src/app.css` and `src/lib/components/ui/`: `.card`, section headers, button variants (Primary/Secondary/Danger/Ghost), input style, badge variants, `Modal.svelte` (centered desktop, bottom sheet mobile, focus trap, Escape/backdrop close), `HorizontalScroll.svelte` (fade shadows, scroll-snap, thin scrollbar).

- [ ] **19.6 Character Sheet Full-Height Layout & Tab Redesign:** Refactor `src/routes/character/[id]/+page.svelte`. `100vh` minus sidebar/top-bar. Fixed tab bar (always visible), scrollable content area below (`flex-1 overflow-y-auto`). Mobile: icon-only tabs. Desktop ≥1280px: multi-column panel grid.

- [ ] **19.7 Core Tab Migration:** Migrate `BasicInfo`, `AbilityScoresSummary`, `SavingThrowsSummary`, `SkillsSummary`, `LoreAndLanguages` to Tailwind. Remove all scoped `<style>` blocks.

- [ ] **19.8 Abilities & Skills Tab Migration:** Migrate `AbilityScores`, `SavingThrows`, `SkillsMatrix` (sticky first column on mobile, `HorizontalScroll`), `PointBuyModal`, `RollStatsModal`, `ModifierBreakdownModal`, `DiceRollModal` to Tailwind.

- [ ] **19.9 Combat Tab Migration:** Migrate `HealthAndXP`, `ArmorClass`, `CoreCombat`, `Attacks`, `MovementSpeeds`, `Resistances`, `DamageReduction`, `ActionBudgetBar`, `EphemeralEffectsPanel` to Tailwind. Desktop ≥1280px: 2-column layout.

- [ ] **19.10 Feats & Magic Tabs Migration:** Migrate `FeatsTab`, `FeatSelectionModal` (full-screen on mobile), `Grimoire`, `CastingPanel`, `SpecialAbilities` to Tailwind.

- [ ] **19.11 Inventory Tab Migration:** Migrate `InventoryTab`, `PsionicItemCard`, `Encumbrance` to Tailwind. Mobile: swipe-to-reveal or action sheet for item actions.

- [ ] **19.12 Campaign Hub, Vault & GM Tools Migration:** Migrate all non-character-sheet pages (`/campaigns`, `/vault`, `/settings`, `/gm-dashboard`) to Tailwind.

- [ ] **19.13 Touch Adaptation, Accessibility & Cross-Device Polish:** `@media (pointer: coarse)` min 44px touch targets. `:focus-visible` focus rings. `prefers-reduced-motion` disables transitions. Thin scrollbars on desktop, hidden on mobile. Test at 320px, 375px, 414px, 768px, 1024px, 1280px, 1536px, 1920px — zero horizontal overflow.

- [ ] **19.14 Legacy CSS Cleanup, Performance Audit & Final QA:** Remove ALL remaining `<style>` blocks. Audit `src/app.css`. Verify CSS bundle purging. WCAG AA contrast ratios. Smoke-test full user flow (landing → campaigns → vault → character → all 6 tabs → back).

- [ ] **Checkpoint #6 — UI Excellence** (requires Phase 19): Run from `CHECKPOINTS.md`. Verify Tailwind migration completeness, theme system (FOWT, cookie, live listener), Lucide coverage, sidebar responsiveness, full-height layout, 320px–1920px breakpoints, touch targets, design system consistency, zero regressions. Resolve all CRITICAL and MAJOR issues before proceeding.

### Phase 20: Leveling Progression & Skill Points (SRD-Accurate)

_Goal: Complete the leveling UI: the Skills Matrix uses the per-class SP budget from Phase 3.8, the Leveling Journal modal makes all class contributions transparent, and dedicated tests validate SRD accuracy._

- [ ] **20.1 SkillsMatrix Update:** `SkillsMatrix.svelte` uses `engine.phase4_skillPointsBudget.totalAvailable` for budget display (correct multiclass + first-level 4× bonus). Rank input min = `getMinRanks(skill.id)`. Locked ranks display "Min" badge with `cursor-not-allowed`. "Journal" button opens Leveling Journal modal.

- [ ] **20.2 Leveling Journal Modal:** Create `src/lib/components/abilities/LevelingJournalModal.svelte`. Overview table (all active classes × BAB/Fort/Ref/Will/SP + totals row). Per-class detail: SP formula with first-level bonus annotation `(2+2)×3 + 12(×4 L1) = 24`, class skill badges, granted features per `levelProgression`. Lock/Unlock rank controls. First-level 4× bonus info note (already included in totals). Multiclass XP penalty warning with favored-class exemption.

- [ ] **20.3 i18n Strings:** Add `journal.*` namespace and `skills.rank_locked*` / `skills.journal_*` keys to `src/lib/i18n/ui-strings.ts` (EN + FR).

- [ ] **20.4 Vitest — Per-Class SP Budget Tests:** Extend `src/tests/multiclass.test.ts`. Cover: first-level 4× on first class only, INT floor (min 1/level), racial bonus per total level, three-class multiclass scenario, proof the pre-fix unified formula over-counts.

- [ ] **20.5 Vitest — Minimum Rank Enforcement Tests:** Extend `src/tests/multiclass.test.ts`. Cover: `setSkillRanks` floor clamping, `lockSkillRanksMin` max-merge (never lowers), absent `minimumSkillRanks` defaults to 0, cross-class cost (2 SP/rank).

- [ ] **20.6 Vitest — Character Build Integration Scenario:** Create `src/tests/characterBuildScenario.test.ts`. Validate complete Fighter 3 / Monk 3 / Psion 1 / Wizard 1 build: character level (8), ECL (8), ability scores + ASI tracking (CON 17→19), BAB (+5), saves (Fort +10/Ref +7/Will +10), SP budget (50 SP RAW), feat slots (5), HP (75 fixed dice, max at L1 then half+1), AC (15 unarmored + WIS Monk bonus), Wizard spells/day (3 cantrips/2 first-level), psionic PP (3), class skill union, level-gated features, multiclass XP penalty with favored-class exemption, caster/manifester level independence. 100+ assertions.

- [ ] **Checkpoint #7 — Leveling Progression** (requires Phase 20): Run from `CHECKPOINTS.md`. Verify per-class SP budget correctness, minimum rank enforcement, SkillsMatrix budget display, LevelingJournal SP formula and XP penalty, i18n completeness, Vitest Scenarios (SP budget, rank enforcement, full character build). Resolve all CRITICAL and MAJOR issues before proceeding.

### Phase 21: Custom Content Editors

_Goal: Build in-app editors so GMs and players can create homebrew content without touching JSON files directly._

- [ ] **21.1+ To be determined.** (Scope not yet defined — see `ARCHITECTURE.md` for future direction notes.)

---

### Final Review

- [ ] **Final Review** (complete system validation — before release): Run the full architecture conformance review from `CHECKPOINTS.md`. Covers: Part A — Architecture §1–20 sweep; Part B — cross-cutting concerns (zero hardcoding, i18n completeness, error handling, TypeScript strictness, PHP security); Part C — ANNEXES.md examples A.1–A.12 traced end-to-end and Annex B config tables B.1–B.12 verified; Part D — test coverage gap analysis; Part E — UI Excellence validation. All CRITICAL issues must be zero before release.
