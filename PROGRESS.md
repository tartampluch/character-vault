# Character Vault — VTT RPG Engine Progress Tracker

---

## CRITICAL CODING GUIDELINES

> ⚠️ **These guidelines must be respected for EVERY task without exception.**

1. **Context Loading:** The architecture is split into two files. `ARCHITECTURE.md` must be loaded for EVERY task. `ANNEXES.md` (complete JSON examples and config tables) should be loaded when the current task requires reference data (Phases 1, 5, 17, or when explicitly instructed).
2. **Language:** All code, variables, and comments MUST be in English.
3. **Comments:** Comments must be exhaustive, educational, and explain the _why_ behind complex logic (especially for D&D 3.5 specificities like DAG resolution, stacking rules, or Exploding Dice mechanics).
4. **Quality:** Prioritize extreme readability, modularity, and strict TypeScript typing. Apply software engineering best practices so any other developer or AI can easily onboard and scale the project.
5. **Workflow & Source of Truth:** The official project checklist will reside in a `PROGRESS.md` file at the root of the project. At each iteration, I will explicitly instruct you which specific task to tackle next (e.g., "Execute Phase 1.2"). You must provide the complete code for the requested file(s) ensuring they perfectly respect the Architecture Document. Do not skip steps. Do not anticipate future steps.
6. **ZERO HARDCODING:** The engine and UI must be 100% agnostic. Never hardcode specific D&D terms (like "Fighter", "Elf", "Strength", or "Longsword") in your TypeScript logic or Svelte templates.
7. **Checkpoint Validation Standard:** A checkpoint is only fully passed when **all issues at all severity levels** (CRITICAL, MAJOR, and MINOR) are resolved. No issue should remain open when a checkpoint is marked `[x]`.
8. **Ask Questions Freely:** If anything is unclear — about the architecture, a requirement, or the intended behavior — ask the user for clarification or confirmation at any time, including during or after executing a prompt or checkpoint.
9. **QUOTA MANAGEMENT & ATOMIC WORKFLOW:** To prevent mid-task interruptions due to context limits, you must operate in strict, isolated steps.
    1. **One Task at a Time:** I will prompt you with a specific sub-task (e.g., "Do Phase 1.1"). You must ONLY execute that single sub-task. Do NOT chain multiple sub-tasks together unless explicitly commanded.
    2. **The Stable State Guarantee:** Before finishing your turn, you must ensure the codebase is completely stable. There must be no unresolved imports, no dangling functions, and no TypeScript errors. If a task requires modifying 3 files, do them all in the same turn so the project compiles perfectly at the end.
    3. **The Pause & Acknowledge Protocol:** When you finish the requested sub-task, stop completely. Do not anticipate the next step. End your response by stating: _"Task [X.X] is complete and stable. Ready for the next task."_
    4. **Progress Tracking (The Breadcrumb):** Create and update a `PROGRESS.md` file at the root of the project. Every time you complete a sub-task from the checklist, check it off in this file. This ensures that if our session is interrupted, you can instantly read this file upon reboot to know exactly where we left off.

---

## Checklist

- [x] Initialize Project & PROGRESS.md

### Phase 1: Typed Foundations (Data Models)

_Goal: Define the complete TypeScript type system up-front. All interfaces — including every sub-type extension — are established here so subsequent phases can build on a stable contract._

- [x] **1.1 Primitives & i18n:** Create `src/lib/types/primitives.ts` with `ID` (string alias), complete `ModifierType` union (enhancement, deflection, natural_armor, armor, shield, luck, morale, competence, racial, insight, sacred, profane, circumstance, dodge, synergy, untyped, resistance, base, setAbsolute, `"damage_reduction"`, `"inherent"`, `"max_dex_cap"`), and `LogicOperator`. Create `src/lib/types/i18n.ts` (`LocalizedString`, `UnitSystem`, `UNIT_SYSTEM_CONFIG`; backward-compat `I18N_CONFIG` alias). Per `ARCHITECTURE.md` §11.

- [x] **1.2 Logic & Pipeline Types:** Create `src/lib/types/logic.ts` (recursive `LogicNode` — AND, OR, NOT, CONDITION node types with all 8 `LogicOperator` values). Create `src/lib/types/pipeline.ts`: `Modifier` (required `sourceId`, `sourceName`, `targetId`, `value`, `type`; optional `drBypassTags?: string[]`, `situationalContext?`, JSDoc for the `"attacker.*"` target prefix convention); `StatisticPipeline` with `derivedModifier`; `SkillPipeline`; `ResourcePool` with 8-value `resetCondition` union: `"short_rest"`, `"long_rest"`, `"encounter"`, `"never"`, `"per_turn"`, `"per_round"`, `"per_day"`, `"per_week"` and optional `rechargeAmount?: number | string`. Per `ARCHITECTURE.md` §3–4.4.

- [x] **1.3 Unified Feature Model:** Create `src/lib/types/feature.ts` as the complete feature type system per `ARCHITECTURE.md` §5–5.7 and `ANNEXES.md` A.1–A.12. Base `Feature`: `levelProgression`, `resourcePoolTemplates?: ResourcePoolTemplate[]` (export `ResourcePoolTemplate` with `poolId`, `label`, `maxPipelineId`, `defaultCurrent`, `resetCondition`, `rechargeAmount?`), `actionBudget?` (6 optional numeric keys: standard, move, swift, immediate, free, full_round), `recommendedAttributes?`. `activation`: 10-value `actionType` union (standard, move, swift, immediate, free, full_round, passive, reaction), `triggerEvent?`, `tieredResourceCosts?: ActivationTier[]` (export `ActivationTier` with `label`, `targetPoolId`, `cost`, `grantedModifiers`). `ItemFeature`: `two_hands` slot; `psionicItemData?` (export `PsionicItemType` — 5-value union, `PowerStoneEntry` with `powerId`/`manifesterLevel`/`usedUp`); `weaponData.onCritDice?` (export `OnCritDiceSpec` with `baseDiceFormula`, `damageType`, `scalesWithCritMultiplier`); `metamagicEffect?` (6-feat union, `maxSpellLevel: 3|6|9`); `staffSpells?` (`chargeCost: 1|2|3|4|5`); `wandSpell?` (`casterLevel`, optional `spellLevel`); `scrollSpells?` (required `spellLevel`, `spellType: "arcane"|"divine"`); `removalPrevention?` (`isCursed: true`, `removableBy`); `intelligentItemData?` (INT/WIS/CHA scores, egoScore, 9-value alignment, 3-value communication, senses with discrete vision ranges); `isUnique?`; `artifactTier?`. `MagicFeature`: `discipline?: PsionicDiscipline` (export 6-value union), `displays?: PsionicDisplay[]` (export 5-value union). `AugmentationRule`: `effectDescription?: LocalizedString`. `FeatureChoice`: `choiceGrantedTagPrefix?`. All fields exhaustively documented with SRD authoring patterns per `ARCHITECTURE.md` §4.9–4.17, 15.3, 15.1, 5.3, 5.5b, 5.6, 5.7.

- [x] **1.4 Global State & Campaign Settings:** Create `src/lib/types/character.ts`: `ActiveFeatureInstance` with `itemResourcePools?: Record<string, number>` and `ephemeral?: { isEphemeral: true; appliedAtRound?: number; sourceItemInstanceId?: string; durationHint?: string }`; `LinkedEntity` with serialization guard; `Character` with `classLevels`, `gmOverrides`, `minimumSkillRanks?: Record<ID, number>`, `levelAdjustment: number`, `xp: number`, and all UI metadata fields (`campaignId`, `ownerId`, `isNPC`, `posterUrl`, `playerName`, `customSubtitle`). Create `src/lib/types/settings.ts`: `CampaignSettings` with `language`, `statGeneration`, `diceRules`, `enabledRuleSources`, `variantRules: { vitalityWoundPoints: boolean; gestalt: boolean }`. Create `src/lib/types/campaign.ts`: `Campaign` (with `gmGlobalOverrides`, `enabledRuleSources`, `updatedAt`), `Chapter`, `SceneState`. Per `ARCHITECTURE.md` §6–8.

### Phase 2: Pure Functions & Dice Engine (The Brain)

_Goal: Build all pure, stateless utility functions. These have no Svelte dependencies and can be tested in isolation._

- [x] **2.1 i18n Formatters:** Create `src/lib/utils/formatters.ts` (localization helpers and unit conversion). Key exports: `t()`, `getUnitSystem(lang)` (maps language code → `UnitSystem` via `LANG_UNIT_SYSTEM` from `ui-strings.ts`), `formatDistance()`, `formatWeight()`. Unit system is decoupled from language: both functions resolve via `getUnitSystem()` then look up `UNIT_SYSTEM_CONFIG`. Unknown community language codes default to `"imperial"`.

- [x] **2.2 Math Parser:** Create `src/lib/utils/mathParser.ts`. Evaluate formula strings, replace `@` placeholders with character context values. Support all paths per `ARCHITECTURE.md` §4.3: `@characterLevel`, `@eclForXp`, `@classLevels.<id>`, `@activeTags`, `@selection.<choiceId>`, `@constant.<id>`, `@master.classLevels.<id>`. Handle `|distance` and `|weight` pipes. Return 0 and log warning for unresolved paths. Export `CharacterContext` type with `eclForXp` field.

- [x] **2.3 Logic Evaluator:** Create `src/lib/utils/logicEvaluator.ts`. Recursive evaluation of `LogicNode` trees (AND, OR, NOT, CONDITION). Support all 8 `LogicOperator` values (`==`, `>=`, `<=`, `!=`, `includes`, `not_includes`, `has_tag`, `missing_tag`). Return `errorMessage` from failing CONDITION nodes.

- [x] **2.4 Stacking Rules:** Create `src/lib/utils/stackingRules.ts`. Standard stacking: `dodge`, `circumstance`, `synergy`, `untyped` stack additively; all other types keep highest only. `setAbsolute` overrides all (last wins). `"damage_reduction"` handled as a separate pass: group by sorted `drBypassTags` signature, keep highest per group, return `StackingResult.drEntries[]` with `amount`, `bypassTags`, `sourceModifier`, `suppressedModifiers`. Note: `"max_dex_cap"` is intercepted at DAG level (Phase 3.5), not subject to this function. Per `ARCHITECTURE.md` §4.2 and 4.5.

- [x] **2.5 Gestalt Rules:** Create `src/lib/utils/gestaltRules.ts`. Export `computeGestaltBase(modifiers, classLevels, characterLevel)` (max-per-level from each contributing class, then sum), `groupBaseModifiersByClass()`, `GESTALT_AFFECTED_PIPELINES` Set (`combatStats.base_attack_bonus`, `saves.fortitude`, `saves.reflex`, `saves.will` — NOT `combatStats.max_hp`), `isGestaltAffectedPipeline()`. Per `ARCHITECTURE.md` §8.1–8.2.

- [x] **2.6 Dice Engine (RNG):** Create `src/lib/utils/diceEngine.ts`. Implement `parseAndRoll(formula, pipeline, context, settings, rng?, situationalModifiers?, defenderAttackerMods?, defenderFortificationPct?, weaponOnCritDice?, critMultiplier?)` per `ARCHITECTURE.md` §17. Export `DamageTargetPool` (`"res_hp" | "res_vitality" | "res_wound_points"`), `OnCritDiceSpec` (re-export from feature.ts), `RollResult` (with required `targetPool`, optional `fortification?: { roll, pct, critNegated }`, `onCritDiceRolled?: { formula, rolls, totalAdded, damageType }`, `attackerPenaltiesApplied?: Modifier[]`), `RollContext` (with optional `isCriticalHit?`). Implement: injectable `rng` parameter for deterministic tests; Exploding 20s (recursive reroll + accumulate); Reroll 1s; V/WP routing (`"res_wound_points"` on confirmed crit, `"res_vitality"` otherwise, `"res_hp"` when V/WP disabled); `attacker.*` modifier resolution (strip prefix, match pipeline, apply `situationalContext` filtering, add to `finalTotal`, record in `attackerPenaltiesApplied`); fortification crit negation (roll 1d100 ≤ pct → `critNegated: true`, fortification-negated crits route to `"res_vitality"` in V/WP mode); on-crit burst dice (parse `baseDiceFormula`, scale dice count by `(critMultiplier − 1)` when `scalesWithCritMultiplier`, roll via RNG, add to `finalTotal`, absent when crit negated). Per `ARCHITECTURE.md` §4.6–4.7, 4.9, 8.2.

### Phase 3: Svelte 5 Reactive Engine (The DAG)

_Goal: Build the reactive game engine as a Svelte 5 store. Each DAG phase is a `$derived` rune that builds on the previous, forming a topological dependency graph._

- [x] **3.1 Store Skeleton & Default Pipelines:** Create `src/lib/engine/GameEngine.svelte.ts`. Initialize global Svelte 5 `$state` for `CampaignSettings` and active `Character`. Initialize all default pipeline maps: 6 ability score pipelines, full `combatStats` map including `combatStats.fortification` (baseValue 0), `combatStats.arcane_spell_failure` (baseValue 0), `combatStats.max_dexterity_bonus` (baseValue 99 = uncapped), `combatStats.ac_normal/touch/flat_footed`, `combatStats.base_attack_bonus`, `combatStats.initiative`, `combatStats.grapple`, `combatStats.max_hp`; `saves.fortitude/reflex/will`; all skill pipelines; feat slot pipeline; equipment slot pipelines (`slots.ring = 2`, `slots.head = 1`, etc.); character resource pools. Per `ARCHITECTURE.md` §9, 4.7–4.17.

- [x] **3.2 Flattening & Filtering (DAG Phase 0):** `$derived` producing flat validated modifier list. Per feature instance: check `prerequisitesNode` via Logic Evaluator against current context, check `forbiddenTags`, apply `classLevel` gating from `levelProgression`. Apply full Data Override resolution chain (rule files in `enabledRuleSources` order → `Campaign.gmGlobalOverrides` → `Character.gmOverrides`), respecting `merge` semantics. Implement `#computeActiveTags()` emitting `<choiceGrantedTagPrefix><selectedId>` for each active `FeatureChoice` selection. Derive `phase0_characterLevel` (sum of `classLevels` values, excludes `levelAdjustment`) and `phase0_eclForXp` (`phase0_characterLevel + (character.levelAdjustment ?? 0)`). Expose both in `CharacterContext` snapshot. Per `ARCHITECTURE.md` §9.2–9.4, 5.3, 6.4.

- [x] **3.3 Base Attributes (DAG Phases 1–2):** `$derived` pipelines for the 6 ability scores using `applyStackingRules()`. Compute `derivedModifier = floor((totalValue − 10) / 2)` for all 6 stats. Route modifiers with `situationalContext` to `situationalModifiers` array (separate from `activeModifiers`). Implement infinite loop detection (depth counter, cut at 3). Per `ARCHITECTURE.md` §9.6.

- [x] **3.4 Combat Stats & Skills (DAG Phases 3–4):** `$derived` pipelines for AC variants (normal/touch/flat-footed, ignoring Armor/Shield for touch), BAB with all iterative attack entries, initiative, grapple, save totals, max HP (CON mod × `phase0_characterLevel`, not ECL). `$derived` for all skill pipelines referencing Phase 2 attribute results to prevent circular dependencies. Auto-generate synergy modifier entries from `config_skill_synergies` config table where ranks threshold is met. Per `ARCHITECTURE.md` §9.7–9.8.

- [x] **3.5 Max DEX Bonus Special Case (DAG Phase 3 intercept):** In Phase 3 `$derived`, intercept `combatStats.max_dexterity_bonus` before the general stacking loop: (1) separate all modifiers with `type === "max_dex_cap"`, (2) `effectiveBaseValue = Math.min(...caps)` (99 when no cap modifiers exist), (3) pass remaining untyped additive modifiers (e.g. Mithral's +2) through `applyStackingRules()` with this `effectiveBaseValue`, (4) `continue` to skip general processing. This implements minimum-wins cap logic without polluting the standard stacking path. Per `ARCHITECTURE.md` §4.17.

- [x] **3.6 Gestalt Mode Integration (DAG Phase 3.7):** In the Phase 3 `$derived`, read `settings.variantRules?.gestalt ?? false`. For each pipeline in `GESTALT_AFFECTED_PIPELINES`: when `true`, separate `"base"` type modifiers by class source, call `computeGestaltBase()`, inject gestalt total as `effectiveBaseValue` into `applyStackingRules()` with only non-`"base"` modifiers. HP pipeline always uses additive stacking regardless of gestalt mode. Standard path unchanged when `false`. Per `ARCHITECTURE.md` §8.1–8.2.

- [x] **3.7 Resource Pools, Action & Ephemeral Methods:** Add all runtime action methods to `GameEngine.svelte.ts`. _Resource ticks & rests:_ `triggerTurnTick()`, `triggerRoundTick()`, `triggerEncounterReset()`, `triggerShortRest()`, `triggerLongRest()`, `triggerDawnReset()` (resets `"per_day"` character pools + calls private `#resetItemPoolsByCondition("per_day")`), `triggerWeeklyReset()`. `rechargeAmount` formulas resolved via Math Parser. _Item pool management:_ `initItemResourcePools(instance, feature)` (idempotent — only adds absent pool keys, never overwrites existing values including 0), `getItemPoolValue(instanceId, poolId)` (falls back to `template.defaultCurrent`), `spendItemPoolCharge(instanceId, poolId, amount?)` (floors at 0), `#resetItemPoolsByCondition(condition)`. _Activation:_ `activateWithTier(instanceId, tierIndex)` (validates tier index, resolves `cost` via Math Parser, checks pool balance, deducts charges, returns tier `grantedModifiers` array or `null` on any failure). _Trigger dispatch:_ `getReactionFeaturesByTrigger(triggerEvent)` (returns active `"reaction"` features matching event, excludes `"passive"` and inactive instances). _Consumables & ephemeral:_ `consumeItem(sourceInstanceId, currentRound?)` (two-phase atomic: push ephemeral `ActiveFeatureInstance` → remove source item; returns `null` for non-consumable or missing instance), `expireEffect(instanceId)` (refuses to remove non-ephemeral instances), `getEphemeralEffects()` (sorted newest-round-first). _Removal guard:_ `removeFeature(instanceId)` (checks `removalPrevention.isCursed`, blocks cursed items with warning), `#removeFeatureUnchecked(instanceId)` (trusted internal callers), `tryRemoveCursedItem(instanceId, dispelMethod)` (returns `true`/`false`/`null`). Per `ARCHITECTURE.md` §4.4, 5.5b, 5.7, 6.5, 4.15.

- [x] **3.8 Feat Slots & Leveling Analytics (DAG Phase 4b):** Add `phase4_featSlots` `$derived` (base = `1 + floor(@characterLevel / 3)` + bonus slots from features). Add `phase4_skillPointsBudget` `$derived` computing SP independently per class: `max(1, spPerLevel + intMod) × classLevel` for each class; first class (JS key insertion order) receives 4× first-level bonus (`3 × max(1, spPerLevel + intMod)` added); racial/feat bonus SP (targeting `attributes.bonus_skill_points_per_level`) applied per total character level. Export `ClassSkillPointsEntry` and `SkillPointsBudget` types. Add `phase4_levelingJournal` `$derived` (per-class BAB/save totals from `phase0_flatModifiers` filtered by `sourceId`; XP penalty detection; multiclass XP penalty with favored-class exemption). Export `LevelingJournalClassEntry` and `LevelingJournal` types. Methods: `setSkillRanks(skillId, ranks)` with `max(minimumSkillRanks?.[skillId] ?? 0, 0)` floor clamping, `lockSkillRanksMin(skillId)` (max-merge, never lowers floor), `lockAllSkillRanks()`. Per `ARCHITECTURE.md` §9.8.

### Phase 4: Persistence & I/O

- [x] **4.1 Multi-Character & Settings Storage:** Create `src/lib/engine/StorageManager.ts`. Implement CRUD for multiple `Character` objects and `CampaignSettings` in `localStorage`. Connect to `GameEngine` via Svelte 5 `$effect` for auto-save. Implement `LinkedEntity` serialization guard to prevent circular back-references.

- [x] **4.2 Data Dictionary (DataLoader & Merge Engine):** Create `src/lib/engine/DataLoader.ts`. Fetch JSON rule files from `static/rules/` recursively in alphabetical directory order. Cache in memory. Filter entities by `CampaignSettings.enabledRuleSources`. Distinguish `Feature` entities (`id` + `category` fields) from config tables (`tableId` field). Implement **Merge Engine**: `"replace"` (default — fully overwrites entity), `"partial"` (append arrays, merge `levelProgression` by level key, merge `choices` by `choiceId`, `-prefix` convention for array deletions). Resolution chain: base rule files (last wins) → `Campaign.gmGlobalOverrides` → `Character.gmOverrides`. Config tables always replaced entirely (never partial-merged).

### Phase 5: Test UI (Validation)

_Goal: Build a minimal test harness that validates the core engine pipeline end-to-end before the full UI is built._

- [x] **5.1 Mock Data:** Create `static/rules/test_mock.json` (Race with racial ability modifiers and tags, Class with `levelProgression` and `classSkills`, Armor Item with `"max_dex_cap"` modifier, Condition, Orc Enemy with `"attacker.*"` modifier for −1 to attacker rolls). Create `static/rules/test_override.json` to test `merge: "partial"` (array append + `-prefix` deletion) and `merge: "replace"`.

- [x] **5.2 Settings & Character Sheet Component:** Create `src/routes/+page.svelte`. Add toggles for "Exploding 20s", "Reroll 1s", "Vitality/WP Mode", "Gestalt Mode". Display Total Strength pipeline total and Total AC pipeline total.

- [x] **5.3 Graph & Context Testing:** Add "Attack the Orc" button triggering `parseAndRoll()`. Prove: (1) situational modifier `"+2 vs Orcs"` applies ONLY during the roll, not to the static pipeline total; (2) "Exploding 20s" rerolls and accumulates consecutive 20s correctly; (3) V/WP mode routes crit damage to `"res_wound_points"` and normal hits to `"res_vitality"`; (4) the Orc's `"attacker.*"` modifier applies a −1 penalty to the attacker's roll.

- [x] **5.4 Merge Engine Testing:** Prove that enabling `test_override.json` as a rule source (after the base source) correctly applies partial merges (array append, `-prefix` deletion) and full replacement (`merge: "replace"`). Verify priority order: base → GM global → GM per-character.

- [x] **Checkpoint #1 — Engine & Foundation Conformance** (requires Phases 1–5): Run from `CHECKPOINTS.md`. Resolve ALL issues (CRITICAL, MAJOR, and MINOR) before proceeding.

### Phase 6: Campaign Management & User Context

_Goal: Establish the overarching container for characters. A Campaign groups characters, tracks story progression, and handles GM vs. Player visibility._

- [x] **6.1 User Context & Roles:** Create `src/lib/engine/SessionContext.svelte.ts` — mock user session with `currentUserId`, `isGameMaster` (boolean), `activeCampaignId`. Design as a drop-in replacement for a real PHP-backed auth session.

- [x] **6.2 Character Model UI Updates:** Update `src/lib/types/character.ts` to add UI metadata: `campaignId`, `ownerId`, `isNPC` (boolean), `posterUrl`, `playerName`, `customSubtitle`.

- [x] **6.3 Campaign Hub UI:** Create `src/routes/campaigns/+page.svelte`. Display campaign grid using `posterUrl`/`bannerUrl`. "Create Campaign" button visible only to GM.

- [x] **6.4 Campaign Details & Acts UI:** Create `src/routes/campaigns/[id]/+page.svelte`. Display campaign banner and summary. Render Chapters/Acts list. GM can toggle `isCompleted` on chapters.

### Phase 7: The Character Vault

_Goal: Build the character selection screen respecting GM vs. Player visibility rules._

- [x] **7.1 Visibility Logic:** In `GameEngine` or a `VaultStore`, create `$derived` array `visibleCharacters`. Rules: filter by `activeCampaignId`; if GM return all characters/NPCs/monsters; if player return only own characters plus their `LinkedEntity` companions.

- [x] **7.2 Character Card Component:** Create `src/lib/components/vault/CharacterCard.svelte`. Display `posterUrl` (fallback placeholder), character name, level badge (sum of `classLevels`). Subtitle priority: `customSubtitle` → Race label (if NPC) → `playerName` (if PC).

- [x] **7.3 Character Vault Page:** Create `src/routes/campaigns/[id]/vault/+page.svelte`. Responsive grid of `CharacterCard` components from `visibleCharacters`.

- [x] **7.4 Empty State & Creation Actions:** Empty state in vault page. "Create New Character" button. GM: additional "Add NPC/Monster" button. Both initialize a blank `Character` via `StorageManager` and navigate to the Phase 8 editor.

### Phase 8: UI Construction — "Core" Tab (Summary View)

_Goal: Build the fundamental character sheet. Components here are simplified read-only overviews. No game logic in .svelte files — UI only reads `$derived` values and dispatches intents to the engine._

- [x] **8.1 Tab Navigation & Layout Skeleton:** Create `src/routes/character/[id]/+page.svelte`. Tabbed navigation (Core, Abilities, Combat, Feats, Magic, Inventory). `GameEngine` loads character from URL via `StorageManager`.

- [x] **8.2 Generic Feature Modal (Data Display):** Create `src/lib/components/ui/FeatureModal.svelte`. Takes a Feature ID, fetches from `DataLoader`, displays localized description, prerequisites, modifiers as readable text, and granted features.

- [x] **8.3 Basic Information Component:** Create `src/lib/components/core/BasicInfo.svelte`. Dropdowns for Race, Class, Deity, Alignment, Size. Selecting Race/Class triggers engine to add `ActiveFeatureInstance` and initialize `classLevels`. Dynamic modifier badges (e.g. "+2 DEX") read from feature data.

- [x] **8.4 Dynamic Feature Choices:** Update `BasicInfo.svelte` to handle `FeatureChoice` arrays. For each choice, render a dropdown fetching options via `optionsQuery` from `DataLoader`. Bind selections to `ActiveFeatureInstance.selections`.

- [x] **8.5 Ability Scores Summary:** Create `src/lib/components/core/AbilityScoresSummary.svelte`. Compact read-only 6-stat grid showing `totalValue` and `derivedModifier`. Link to Abilities tab.

- [x] **8.6 Saving Throws Summary:** Create `src/lib/components/core/SavingThrowsSummary.svelte`. Compact Fort/Ref/Will total modifiers. Read-only.

- [x] **8.7 Skills Summary:** Create `src/lib/components/core/SkillsSummary.svelte`. Condensed skill name + total bonus list. Read-only, link to Abilities tab.

- [x] **8.8 Languages & Lore Component:** Create `src/lib/components/core/LoreAndLanguages.svelte`. Text areas for Personal Story and Appearance. Language system: calculate available languages (INT mod + Speak Language ranks), display auto-granted languages (from features), dropdown to add more until limit reached.

### Phase 9: UI Construction — "Abilities & Skills" Tab (Full Interactive Editor)

- [x] **9.1 Data Model Extensions:** Add `recommendedAttributes?: ID[]` to `Feature` interface in `feature.ts` (used by Point Buy UI to color-code preferred stats). Ensure `SkillPipeline` synergy bonuses auto-appear via DAG Phase 4 synergy generation (Phase 3.4).

- [x] **9.2 Breakdown & Dice Roll Modals:** Create `src/lib/components/ui/ModifierBreakdownModal.svelte` (reads pipeline `activeModifiers`, displays "Base + Modifiers = Final" math). Create `src/lib/components/ui/DiceRollModal.svelte` (calls `parseAndRoll()`, displays `RollResult` with crit/fumble highlighting; in V/WP mode shows `→ WOUND POINTS` or `→ Vitality Points` routing row).

- [x] **9.3 Ability Scores Panel:** Create `src/lib/components/abilities/AbilityScores.svelte`. 6 stat panels: `derivedModifier` (prominent), editable base score, temporary modifier. "i" (opens Breakdown modal) and dice (opens Roll modal) buttons per stat.

- [x] **9.4 Stat Generation Wizards:** Create `PointBuyModal.svelte` (D&D 3.5 point buy math, reads `pointBuyBudget` from `CampaignSettings`, color-codes stats using `recommendedAttributes`). Create `RollStatsModal.svelte` (4d6 drop lowest, respects `rerollOnes` setting, assigns rolled values to chosen attributes).

- [x] **9.5 Saving Throws Panel:** Create `src/lib/components/abilities/SavingThrows.svelte`. Fort/Ref/Will panels: final modifier, related ability modifier block (color-coded), misc modifier, editable temporary modifier. Breakdown and Roll buttons.

- [x] **9.6 Skills Matrix Panel:** Create `src/lib/components/abilities/SkillsMatrix.svelte`. Header showing SP Available (from `engine.phase4_skillPointsBudget.totalAvailable`) vs. SP Spent. Table: class-skill checkbox (read-only), skill name, total bonus, key ability, misc input, ranks input (clamped to `[minimumRanks, maxRanks]`, "Min" badge when floor active), cost per rank (1 or 2), max allowed ranks. Ranks input directly calls `engine.setSkillRanks()`. Synergy bonuses appear in Breakdown modal. "Journal" button opens Leveling Journal modal.

### Phase 10: UI Construction — "Combat" Tab

_Goal: Build the full Combat tab. Rely entirely on DAG pipelines. Engine handles all calculations._

- [x] **10.1 Health & Experience Panel:** Create `src/lib/components/combat/HealthAndXP.svelte`. HP bar (Current/Temporary/Nonlethal); Heal/Damage buttons (damage depletes temp HP first). XP bar with threshold from `config_xp_table` using `@eclForXp` (not `@characterLevel`). LA and ECL badges when `levelAdjustment > 0`. "Reduce LA" button per SRD conditions. "Start Turn" → `triggerTurnTick()`. "New Encounter" → `triggerEncounterReset()`. "Long Rest" → `triggerLongRest()`. In V/WP mode: dual VP/WP bars replace standard HP status.

- [x] **10.2 Armor Class Panel:** Create `src/lib/components/combat/ArmorClass.svelte`. Three pipelines: `combatStats.ac_normal`, `combatStats.ac_touch`, `combatStats.ac_flat_footed`. Breakdown modal on "i" icons (shows why Touch AC ignores Armor/Shield). Temp modifier input applies to all three pipelines. Effective DEX to AC = `min(dexMod, combatStats.max_dexterity_bonus.totalValue)`.

- [x] **10.3 Core Combat Stats:** Create `src/lib/components/combat/CoreCombat.svelte`. BAB (with iterative attacks), Initiative, Grapple pipelines. Roll and Breakdown buttons for Initiative and Grapple.

- [x] **10.4 Weapons & Attacks Panel:** Create `src/lib/components/combat/Attacks.svelte`. Main Hand, Off Hand, Ranged dropdowns reading from Inventory (`ItemFeature` with weapon tags) + Unarmed option. Dynamically calculate Total Attack Bonus and Damage based on weapon, STR/DEX mods, BAB, Size, enhancement. Roll buttons pass weapon damage dice to `DiceEngine`.

- [x] **10.5 Movement Speeds Panel:** Create `src/lib/components/combat/MovementSpeeds.svelte`. Land, Burrow, Climb, Fly, Swim speed pipelines. Explicit "Armor Penalty Effect" and "Load Penalty Effect" pipeline display.

- [x] **10.6 Energy & Special Resistances:** Create `src/lib/components/combat/Resistances.svelte`. Pipelines for Fire, Cold, Acid, Electricity, Sonic, SR, PR, Fortification (`combatStats.fortification`), Arcane Spell Failure (`combatStats.arcane_spell_failure`). User misc modifier inputs.

- [x] **10.7 Damage Reduction Builder:** Create `src/lib/components/combat/DamageReduction.svelte`. UI to construct DR entries (Value, bypass tags, type: "Innate/best-wins" vs "Class/additive"). "Add DR" generates a custom `ActiveFeatureInstance` pushed to engine. Active DRs shown with delete button. DR panel renders `StackingResult.drEntries` — suppressed DRs shown with strikethrough.

- [x] **10.8 Action Budget Bar & Ephemeral Effects Panel:** Create `src/lib/components/combat/ActionBudgetBar.svelte` — reads all active features with `actionBudget`, computes min-wins per action category, renders per-action buttons (Standard, Move, Swift, Full-Round, Free) with spent counter, blocked actions shown as disabled with source tooltip, XOR exclusion via `action_budget_xor` tag (Staggered/Disabled), "Reset Turn" button. Create `src/lib/components/combat/EphemeralEffectsPanel.svelte` — lists active ephemeral effects (source/duration badge/round); two-click "Expire" confirmation (single mis-click prevention). Both integrated into Combat tab left column. Per `ARCHITECTURE.md` §5.6, 6.5.

### Phase 11: UI Construction — "Feats" Tab

- [x] **11.1 Feat Capacity Pipeline:** In `GameEngine`, `phase4_featSlots` `$derived` (from Phase 3.8) — base `1 + floor(characterLevel / 3)` plus bonus slots from active features. "Feats Left" = total slots − manually selected feats count.

- [x] **11.2 Feats Tab Layout & Lists:** Create `src/lib/components/feats/FeatsTab.svelte`. Header showing "Feats Available" / "Feats Left" counters. Granted Feats section (auto-granted by Race/Class — read-only, shows source tag). Selected Feats section (player-chosen, with Delete button to free slot).

- [x] **11.3 Feat Catalog Modal:** Create `src/lib/components/feats/FeatSelectionModal.svelte`. Fetches all `category: "feat"` features from `DataLoader`. Text search (by title/description). Tag badges (e.g. "Fighter Bonus Feat", "Metamagic").

- [x] **11.4 Prerequisite Evaluation UI:** In `FeatSelectionModal`, run `prerequisitesNode` through `logicEvaluator` for each feat. Failed feats: row disabled, failing `errorMessage`s shown in red. Met prerequisites shown in green.

### Phase 12: UI Construction — "Spells & Powers" Tab

- [x] **12.1 Magic Resources & Limits:** In `GameEngine`, derive `Caster Level` and `Manifester Level` pipelines. Derive `Spell Slots` (per level 0–9) and `Power Points` max from class JSON formulas and the relevant key ability modifier.

- [x] **12.2 Spells/Powers Catalog (The Grimoire):** Create `src/lib/components/magic/Grimoire.svelte`. Interface to learn/add spells. Filters `MagicFeature` items by character's active `spellLists` and class level.

- [x] **12.3 Preparation & Casting Panel:** Create `src/lib/components/magic/CastingPanel.svelte`. Group known spells by level (0–9). For psionic characters: group by `discipline` (discipline tab bar). "Prepare" counter (Vancian) or "Cast/Manifest" button (spontaneous/psionic). Spell detail modal: School, Components, Range, Duration, Roll button, Save DC = `10 + spell level + key ability mod`. Psionic: `displays` badges with suppress-DC tooltip, augmentation picker (cost stepper, cap at manifester level), `effectDescription` shown for qualitative augmentations. Rod of Metamagic integration: identifies equipped rods via `metamagicEffect`, offers free metamagic up to `maxSpellLevel`. Staff: `staffSpells` array drives per-spell charge cost. Wand: `wandSpell` uses item `casterLevel` (not wielder's). Scroll: `scrollSpells` enforces arcane/divine restriction, CL check DC = `casterLevel + 1`.

- [x] **12.4 Special & Domain Abilities Panel:** Create `src/lib/components/magic/SpecialAbilities.svelte`. Filters active features for `class_feature` or `domain` category with `activation` type. Displays as cards tied to `ResourcePool`s. "Use" button calls `engine.spendItemPoolCharge()` or decrements the resource pool.

### Phase 13: UI Construction — "Inventory" Tab

- [x] **13.1 Equipment Slot Pipelines:** `GameEngine` default slot pipelines (from Phase 3.1) now used by UI: `slots.ring`, `slots.head`, `slots.body`, `slots.main_hand`, `slots.off_hand`, etc.

- [x] **13.2 Inventory Sections & Layout:** Create `src/lib/components/inventory/InventoryTab.svelte`. Three sections: Equipped/Readied, Backpack/Carried (contributes to weight), Storage/Stashed (does not).

- [x] **13.3 Equip, Slot Enforcement & Psionic Item Cards:** "Equip" checks `slots.*` pipeline total vs. currently equipped count; blocks with warning if full. Toggle `isActive` on success. `two_hands` items check both `main_hand` and `off_hand` free. Consumable items show "Drink"/"Apply"/"Use" button calling `engine.consumeItem()`. Create `src/lib/components/inventory/PsionicItemCard.svelte` for items with `psionicItemData`: per-type UI — Cognizance Crystal (PP bar, attunement toggle); Dorje (charge bar 0–50, Use button); Power Stone (per-power list, Brainburn ⚠ warning when wielder ML < stone ML); Psicrown (PP bar, Manifest buttons); Psionic Tattoo (activate button, fade indicator). Psionic tattoo equipping enforces 20-tattoo limit. Cursed items show removal-prevention indicator (no Unequip button). Per `ARCHITECTURE.md` §15.3, 4.15.

- [x] **13.4 Encumbrance & Wealth Calculator:** Create `src/lib/components/inventory/Encumbrance.svelte`. `$derived` total weight (Equipped + Backpack). Compare vs. STR carrying capacity thresholds from `config_carrying_capacity` table. Medium/Heavy load dispatches `condition_encumbered` feature to engine. CP/SP/GP/PP inputs with coin weight (50 coins = 1 lb).

- [x] **Checkpoint #2 — UI Layer Conformance** (requires Phases 1–13): Run from `CHECKPOINTS.md`. Resolve ALL issues (CRITICAL, MAJOR, and MINOR) before proceeding.

### Phase 14: PHP Backend & Frontend Integration

_Goal: Replace localStorage mock with a PHP/SQLite backend REST API designed for cheap shared hosting._

- [x] **14.1 Database Configuration & PDO Setup:** Create `/api` folder structure. `api/config.php` (SQLite DB path, env mode toggle). `api/Database.php` singleton with PDO/SQLite, falls back to `sqlite::memory:` during tests.

- [x] **14.2 Authentication System:** Create `api/auth.php`. `POST /api/auth/login` (bcrypt verify), `POST /api/auth/logout`, `GET /api/auth/me`. `requireAuth()` middleware returning 401 on unauthenticated requests.

- [x] **14.3 CORS & Security Middleware:** Create `api/middleware.php`. Configurable CORS headers (not wildcard `*`). CSRF protection on POST/PUT/DELETE. Simple rate limiting.

- [x] **14.4 Database Schema & Migrations:** Create `api/migrate.php`. Tables: `users` (id, username, password_hash, display_name, is_game_master), `campaigns` (id, title, poster_url, banner_url, owner_id, chapters_json, enabled_rule_sources_json, gm_global_overrides_text, updated_at), `characters` (id, campaign_id, owner_id, name, is_npc, character_json, gm_overrides_json, updated_at). `character_json` stores full ECS state. Backend never processes D&D rules.

- [x] **14.5 REST API Endpoints:** `GET/POST /api/campaigns`, `GET/PUT /api/campaigns/{id}`, `GET /api/campaigns/{id}/sync-status` (timestamps for polling), `GET /api/characters?campaignId=X` (visibility: GM gets all + raw overrides, players get own with overrides merged invisibly), `POST /api/characters`, `PUT /api/characters/{id}` (ownership/GM check), `PUT /api/characters/{id}/gm-overrides` (GM only), `DELETE /api/characters/{id}` (ownership/GM check).

- [x] **14.6 Frontend Integration (StorageManager):** Refactor `StorageManager.ts` to use async `fetch()` calls to PHP API. Debounced auto-save (2s). Graceful offline fallback to localStorage. Polling mechanism: check `sync-status` every 5–10s, selectively re-fetch only changed data.

- [x] **14.7 SvelteKit Proxy Configuration:** Configure `vite.config.ts` to proxy `/api` to PHP dev server. Target configurable (not hardcoded to localhost:8080).

### Phase 15: GM Tools — Rule Sources & Override Screens

- [x] **15.1 Rule Source Manager UI:** Create `src/routes/campaigns/[id]/settings/+page.svelte` (GM-only). List available JSON rule source files. Enable/disable and reorder via drag-and-drop. Save ordered list to `CampaignSettings.enabledRuleSources`. Variant Rules section: "Gestalt Characters" and "Vitality & Wound Points" checkboxes persisted in `settings.variantRules`.

- [x] **15.2 Global Override Text Area:** JSON text area for `gmGlobalOverrides` (array of Feature-like objects + config table objects). JSON validator with line-error highlighting. Saves to `Campaign.gmGlobalOverrides`.

- [x] **15.3 GM Entity Dashboard:** Create `src/routes/campaigns/[id]/gm-dashboard/+page.svelte` (GM-only). List all characters/NPCs/monsters. Click → read-only character summary. Below: per-character `gmOverrides` JSON text area with validator. Applied last in resolution chain.

- [x] **15.4 Override Resolution Chain:** Enforce the strict order in `DataLoader` and `GameEngine`: (1) rule source files (last-wins by order), (2) `Campaign.gmGlobalOverrides`, (3) `Character.gmOverrides`. Each layer respects `merge` semantics.

- [x] **Checkpoint #3 — Backend & GM Tools** (requires Phases 1–15): Run from `CHECKPOINTS.md`. Resolve ALL issues (CRITICAL, MAJOR, and MINOR) before proceeding.

### Phase 16: Backend Unit Testing (PHPUnit)

- [x] **16.1 PHPUnit & Memory DB Setup:** Install PHPUnit. Configure `phpunit.xml` with `sqlite::memory:` for tests.

- [x] **16.2 Character Persistence Tests:** Create `tests/CharacterControllerTest.php`. Test save/load round-trip of deeply nested character JSON (activeFeatures, classLevels, gmOverrides) without corruption.

- [x] **16.3 Visibility & Authorization Tests:** Create `tests/VisibilityTest.php`. Non-GM session attempting to fetch another player's character → 403 Forbidden.

- [x] **16.4 Authentication Tests:** Create `tests/AuthTest.php`. Valid/invalid login, protected endpoints return 401 without session, session persists across requests.

- [x] **16.5 GM Override Visibility Tests:** Create `tests/GmOverrideTest.php`. Player receives merged data (raw `gmOverrides` not exposed). GM receives base data + raw `gmOverrides` separately.

- [x] **16.6 Sync Timestamp Tests:** Create `tests/SyncTest.php`. Modifying a character updates `updated_at`. `sync-status` returns correct timestamps. Modifying GM overrides also updates character's `updated_at`.

### Phase 17: Frontend Engine & Rules Unit Testing (Vitest)

_Goal: Exhaustively test the engine Brain with deterministic tests using raw JSON inputs._

- [x] **17.1 Math & Placeholder Tests:** Create `src/tests/mathParser.test.ts`. Cover all `@`-paths, order-of-operations, `|distance`/`|weight` pipes in both locales, `@eclForXp` vs `@characterLevel` distinction, formula-as-value strings, unresolved path returning 0.

- [x] **17.2 Logic Evaluator Tests:** Create `src/tests/logicEvaluator.test.ts`. Deeply nested AND > OR > NOT > CONDITION trees. `has_tag`/`missing_tag` against `@activeTags`. All 8 operators. `choiceGrantedTagPrefix` sub-tag emission. `errorMessage` from failing nodes.

- [x] **17.3 Stacking Rules Tests:** Create `src/tests/stackingRules.test.ts`. All 4 stackable types (dodge, circumstance, synergy, untyped). `setAbsolute` override + last-wins tie. Negative modifier. DR best-wins grouping: same-bypass suppression, independent bypass coexistence, AND-bypass distinct group, sort-order consistency, `drEntries` absent when no DR modifiers. `"inherent"` within-type best-wins, cross-type stacking. `"max_dex_cap"` excluded from this function (handled in Phase 3.5).

- [x] **17.4 Dice Engine Tests:** Create `src/tests/diceEngine.test.ts`. Injectable RNG for all tests. Situational context match/no-match. Exploding 20s [20,20,5]. Natural 20/1 flags. Crit range. V/WP routing (standard/V/WP/`isCriticalHit` flag). Attacker mod resolution (correct pipeline, situational filter, wrong pipeline excluded, defender `totalBonus` unchanged, `attackerPenaltiesApplied` absent when no match). Fortification: no-pct absent, non-crit no-check, boundary values 25%/75%/100%, V/WP routing for negated vs. non-negated crits. On-crit burst dice: ×2/×3/×4 scaling, Thundering, `totalAdded` in `finalTotal`, `scalesWithCritMultiplier=false`, fort-negated → no burst, malformed formula → no crash.

- [x] **17.5 DAG Integration Tests:** Create `src/tests/dagResolution.test.ts`. Belt of CON +2 cascade (CON → Fort → HP). Formula-as-value (`"@attributes.stat_wisdom.derivedModifier"` for Monk AC). `forbiddenTags` blocking. `conditionNode` on modifier. Dual-gated modifier. Synergy auto-generation. Circular dependency guard (handled gracefully, no crash).

- [x] **17.6 Multiclass & Level Progression Tests:** Create `src/tests/multiclass.test.ts`. `characterLevel` sum. Multi-class BAB (full + half BAB contributions). Level-gated feature granting (granted at level X, not at X−1). `@eclForXp` for monster PC (Drow Rogue 3 LA+2 → `eclForXp = 5`, `@characterLevel = 3`). ECL equals `@characterLevel` for standard PCs.

- [x] **17.7 Merge Engine Tests:** Create `src/tests/mergeEngine.test.ts`. Full replace. Partial merge (array append, `levelProgression` by level, `choices` by `choiceId`). `-prefix` array deletion. Full 3-layer resolution chain (base → GM global → GM per-character). Config table replacement (same `tableId`, no partial merge).

- [x] **17.8 Engine Enhancement & Edge Case Tests:** Create / extend test files: `src/tests/resourcePool.test.ts` (all 8 `resetCondition` values, `triggerDawnReset` isolation from `"per_week"`/`"long_rest"`/`"never"`, `triggerWeeklyReset` isolation); `src/tests/itemResourcePools.test.ts` (`initItemResourcePools` idempotency including existing 0-values, `spendItemPoolCharge` floor, cross-instance independence, stashed instance excluded from reset); `src/tests/tieredActivation.test.ts` (charge deduction per tier, `grantedModifiers` returned, out-of-range/insufficient-charges → `null`); `src/tests/triggerActivation.test.ts` (`getReactionFeaturesByTrigger` returns matching reactions, excludes passive features and inactive instances); `src/tests/ephemeralEffects.test.ts` (`consumeItem` lifecycle + all guard paths, `expireEffect` safety, `getEphemeralEffects` sorting); `src/tests/inherentBonus.test.ts` (within-type best-wins, cross-type stacking); `src/tests/metamagicRods.test.ts` (all 6 feats, 3 tier levels); `src/tests/staffSpells.test.ts` (charge costs 1–5, coexistence); `src/tests/wandSpell.test.ts` (item CL, heightened wands, 5 MM variants); `src/tests/scrollSpells.test.ts` (arcane/divine restriction, spellLevel required, CL check DC); `src/tests/cursedItemRemoval.test.ts` (`removeFeature` guard, `tryRemoveCursedItem` return table, consumeItem/expireEffect unaffected); `src/tests/intelligentItems.test.ts` (all alignments/communication, Ego formula, field contract); `src/tests/augmentationRule.test.ts` (backward compat, mechanical + qualitative augmentations, CastingPanel fallback); `src/tests/maxDexBonus.test.ts` (no armor = 99, single cap, Mithral additive, multi-cap min-wins, zero cap).

- [x] **Checkpoint #4 — Test Suite Exhaustiveness** (requires Phases 1–17): Run from `CHECKPOINTS.md`. Resolve ALL issues (CRITICAL, MAJOR, and MINOR) before proceeding.

### Phase 18: Tooling, Build Pipeline & Developer Experience

_Goal: Zero-dependency build and deployment pipeline. Developer can clone, build, test, debug, and deploy without global dependencies beyond Node.js._

- [x] **18.1 Docker Build Pipeline:** Create multi-stage `Dockerfile` (node-deps → type-check → test → build → php-deps → php-test → artifact) and `docker-compose.yml` (configurable `APP_VERSION`, `NODE_VERSION`, `PHP_VERSION`, `OUTPUT_DIR`). Final stage: compressed tarball (SvelteKit build + PHP API + static assets + Apache `.htaccess`).

- [x] **18.2 Native Build Script:** Create `scripts/build.sh`. Bootstrap portable tools in `.build-tools/` (static PHP binary if system PHP < 8.1, Composer PHAR). Full pipeline: npm install → Composer install → svelte-check → Vitest → PHPUnit → Vite build → artifact tarball. Options: `--env`, `--output`, `--deploy`, `--tag`, `--skip-tests`, `--no-clean`.

- [x] **18.3 Docker Build Wrapper:** Create `scripts/build-docker.sh`. Detect Docker/docker-compose. Options: `--tag`, `--output`, `--no-cache`, `--push`, `--registry`. Verify output tarball after build.

- [x] **18.4 Local Run Script (Native):** Create `run.sh`. Auto-locate latest artifact, resolve PHP binary, load `.env` (priority: shell env > `--env-file` > project `.env` > artifact `.env`), write PHP router script, auto-run `migrate.php` on first launch. Options: `--port`, `--dir`, `--env-file`.

- [x] **18.5 Local Run Script (Docker):** Create `run-docker.sh`. Minimal `php:8.3-apache` run image (pdo_sqlite, mod_rewrite). Mount artifact read-only. Persist SQLite DB in named Docker volume (`character-vault-db`). Options: `--port`, `--dir`, `--env-file`, `--no-cache`.

- [x] **18.6 VS Code Debug Configurations:** Create `.vscode/launch.json` (Chrome, Edge, Firefox frontend; PHP/Xdebug backend; compound full-stack sessions). Create `.vscode/tasks.json` (Vite dev server, PHP dev server, DB migrations, native build, local server as background tasks). All PHP configs use `scripts/php-dev.sh`. Presentation groups: fullstack → frontend → backend → tests → artifact.

- [x] **18.7 VS Code Extensions:** Create/update `.vscode/extensions.json` (Svelte, PHP IntelliSense, Xdebug, ESLint, Prettier, Chrome/Edge DevTools, Firefox Debugger).

- [x] **18.8 PHP Binary Resolver:** Create `scripts/php-dev.sh`. Resolution priority: (1) `CHAR_VAULT_PHP` env var, (2) system PHP with Xdebug when `XDEBUG_MODE` set, (3) `.build-tools/bin/php`, (4) system PHP ≥ 8.1. Warn if Xdebug requested but not found. Forward all args via `exec`.

- [x] **18.9 Environment Variable Support:** Create `.env.example` documenting `APP_ENV`, `DB_PATH`, `CORS_ORIGIN`. Update `api/config.php` with priority loader (process env > .env file > built-in defaults). Update `run.sh`/`run-docker.sh` with `--env-file` and `.env` loading.

- [x] **18.10 Version Control & Documentation:** Update `.gitignore` (exclude `dist/`, `dist-pkg/`, `.build-tools/`, `.env`, `*.sqlite*`). Rewrite `README.md` with comprehensive docs: structure, prerequisites, quick start, development, testing, VS Code debugging, building, running, env vars, production deployment.

- [x] **Checkpoint #5 — Tooling & DX** (requires Phase 18): Run from `CHECKPOINTS.md`. Resolve ALL issues (CRITICAL, MAJOR, and MINOR) before proceeding.

### Phase 19: UI Excellence — Tailwind CSS, Theming, Responsive Design & Iconography

_Goal: Elevate the entire UI to professional quality. Tailwind CSS, light/dark theme, Lucide icons, full-height layout, responsive down to 320px, touch-friendly._

**Design decisions (locked in):** Tailwind CSS v4+, `lucide-svelte`, indigo accent palette, CSS class-based dark mode, collapsible sidebar navigation, full-viewport-height character sheet, 44px touch targets.

- [x] **19.1 Tailwind CSS & PostCSS Setup:** Install Tailwind CSS v4+, PostCSS, autoprefixer. Configure `tailwind.config.ts`, `postcss.config.js`, `src/app.css`. Extend palette: `accent` scale (indigo), semantic aliases (`surface`, `surface-alt`, `border`, `text-primary`, `text-muted`). Breakpoints: sm/md/lg/xl/2xl. `darkMode: 'class'`. Import in root `+layout.svelte`.

- [x] **19.2 Theme Engine & Cookie Persistence:** Create `src/lib/stores/ThemeManager.svelte.ts` — 3-state Svelte 5 rune (`'system'`, `'light'`, `'dark'`). Read/persist from `theme` cookie (`max-age=31536000`, `SameSite=Lax`). Live `prefers-color-scheme` listener. Create `ThemeToggle.svelte` (System/Light/Dark cycle). FOWT prevention: synchronous `<script>` in `src/app.html` `<head>` reads cookie and applies `dark` class. All theme colors as CSS custom properties.

- [x] **19.3 Lucide Icons Integration:** Install `lucide-svelte`. Replace ALL emoji with Lucide components. Sizing: 16px inline, 20px buttons/nav, 24px headers. `currentColor` inheritance. Full icon mapping documented.

- [x] **19.4 Global Layout Shell & Sidebar Navigation:** Refactor `+layout.svelte`. Create `AppShell.svelte` + `Sidebar.svelte`. Desktop ≥1024px: expanded (icon+label), collapsible to icon-only, state persisted in cookie. Tablet 768–1023px: icon-only default. Mobile <768px: hidden, slides in as overlay drawer with backdrop. Top bar on mobile (hamburger, page title, breadcrumbs). `transition-all duration-200` animations.

- [x] **19.5 Design System — Base Component Classes:** Define reusable patterns in `src/app.css` and `src/lib/components/ui/`: `.card`, section headers, button variants (Primary/Secondary/Danger/Ghost), input style, badge variants, `Modal.svelte` (centered desktop, bottom sheet mobile, focus trap, Escape/backdrop close), `HorizontalScroll.svelte` (fade shadows, scroll-snap, thin scrollbar).

- [x] **19.6 Character Sheet Full-Height Layout & Tab Redesign:** Refactor `src/routes/character/[id]/+page.svelte`. `100vh` minus sidebar/top-bar. Fixed tab bar (always visible), scrollable content area below (`flex-1 overflow-y-auto`). Mobile: icon-only tabs. Desktop ≥1280px: multi-column panel grid.

- [x] **19.7 Core Tab Migration:** Migrate `BasicInfo`, `AbilityScoresSummary`, `SavingThrowsSummary`, `SkillsSummary`, `LoreAndLanguages` to Tailwind. Remove all scoped `<style>` blocks.

- [x] **19.8 Abilities & Skills Tab Migration:** Migrate `AbilityScores`, `SavingThrows`, `SkillsMatrix` (sticky first column on mobile, `HorizontalScroll`), `PointBuyModal`, `RollStatsModal`, `ModifierBreakdownModal`, `DiceRollModal` to Tailwind.

- [x] **19.9 Combat Tab Migration:** Migrate `HealthAndXP`, `ArmorClass`, `CoreCombat`, `Attacks`, `MovementSpeeds`, `Resistances`, `DamageReduction`, `ActionBudgetBar`, `EphemeralEffectsPanel` to Tailwind. Desktop ≥1280px: 2-column layout.

- [x] **19.10 Feats & Magic Tabs Migration:** Migrate `FeatsTab`, `FeatSelectionModal` (full-screen on mobile), `Grimoire`, `CastingPanel`, `SpecialAbilities` to Tailwind.

- [x] **19.11 Inventory Tab Migration:** Migrate `InventoryTab`, `PsionicItemCard`, `Encumbrance` to Tailwind. Mobile: swipe-to-reveal or action sheet for item actions.

- [x] **19.12 Campaign Hub, Vault & GM Tools Migration:** Migrate all non-character-sheet pages (`/campaigns`, `/vault`, `/settings`, `/gm-dashboard`) to Tailwind.

- [x] **19.13 Touch Adaptation, Accessibility & Cross-Device Polish:** `@media (pointer: coarse)` min 44px touch targets. `:focus-visible` focus rings. `prefers-reduced-motion` disables transitions. Thin scrollbars on desktop, hidden on mobile. Test at 320px, 375px, 414px, 768px, 1024px, 1280px, 1536px, 1920px — zero horizontal overflow.

- [x] **19.14 Legacy CSS Cleanup, Performance Audit & Final QA:** Remove ALL remaining `<style>` blocks. Audit `src/app.css`. Verify CSS bundle purging. WCAG AA contrast ratios. Smoke-test full user flow (landing → campaigns → vault → character → all 6 tabs → back).

- [x] **Checkpoint #6 — UI Excellence** (requires Phase 19): Run from `CHECKPOINTS.md`. Resolve ALL issues (CRITICAL, MAJOR, and MINOR) before proceeding.

### Phase 20: Leveling Progression & Skill Points (SRD-Accurate)

_Goal: Complete the leveling UI: the Skills Matrix uses the per-class SP budget from Phase 3.8, the Leveling Journal modal makes all class contributions transparent, and dedicated tests validate SRD accuracy._

- [x] **20.1 SkillsMatrix Update:** `SkillsMatrix.svelte` uses `engine.phase4_skillPointsBudget.totalAvailable` for budget display (correct multiclass + first-level 4× bonus). Rank input min = `getMinRanks(skill.id)`. Locked ranks display "Min" badge with `cursor-not-allowed`. "Journal" button opens Leveling Journal modal.

- [x] **20.2 Leveling Journal Modal:** Create `src/lib/components/abilities/LevelingJournalModal.svelte`. Overview table (all active classes × BAB/Fort/Ref/Will/SP + totals row). Per-class detail: SP formula with first-level bonus annotation `(2+2)×3 + 12(×4 L1) = 24`, class skill badges, granted features per `levelProgression`. Lock/Unlock rank controls. First-level 4× bonus info note (already included in totals). Multiclass XP penalty warning with favored-class exemption.

- [x] **20.3 i18n Strings:** Add `journal.*` namespace and `skills.rank_locked*` / `skills.journal_*` keys to `src/lib/i18n/ui-strings.ts` (EN + FR).

- [x] **20.4 Vitest — Per-Class SP Budget Tests:** Extend `src/tests/multiclass.test.ts`. Cover: first-level 4× on first class only, INT floor (min 1/level), racial bonus per total level, three-class multiclass scenario, proof the pre-fix unified formula over-counts.

- [x] **20.5 Vitest — Minimum Rank Enforcement Tests:** Extend `src/tests/multiclass.test.ts`. Cover: `setSkillRanks` floor clamping, `lockSkillRanksMin` max-merge (never lowers), absent `minimumSkillRanks` defaults to 0, cross-class cost (2 SP/rank).

- [x] **20.6 Vitest — Character Build Integration Scenario:** Create `src/tests/characterBuildScenario.test.ts`. Validate complete Fighter 3 / Monk 3 / Psion 1 / Wizard 1 build: character level (8), ECL (8), ability scores + ASI tracking (CON 17→19), BAB (+5), saves (Fort +10/Ref +7/Will +10), SP budget (50 SP RAW), feat slots (5), HP (75 fixed dice, max at L1 then half+1), AC (15 unarmored + WIS Monk bonus), Wizard spells/day (3 cantrips/2 first-level), psionic PP (3), class skill union, level-gated features, multiclass XP penalty with favored-class exemption, caster/manifester level independence. 100+ assertions.

- [x] **Checkpoint #7 — Leveling Progression** (requires Phase 20): Run from `CHECKPOINTS.md`. Resolve ALL issues (CRITICAL, MAJOR, and MINOR) before proceeding.

### Phase 21: Custom Content Editors

_Goal: Build a fully graphical, form-driven content editor system so GMs can create, clone, and override any game entity — race, class, feat, spell, item, condition, etc. — without writing raw JSON. The UI is optimised for D&D 3.5 GMs: every field has D&D-meaningful labels, presets, and validation. List selections open in dedicated modals to avoid form clutter. A raw JSON panel is available for power users. Authored content is stored either as a campaign-scoped homebrew JSON (in the database) or a named server-side global JSON file — both of which participate in the normal DataLoader resolution chain. A `FormulaBuilderInput` component makes the `@`-path formula system approachable via click-to-insert, removing the need to memorise path syntax._

_See `ARCHITECTURE.md` §21 for the complete design specification._

#### 21.1 — Foundation: Homebrew Rule Source Backend & DataLoader Integration

- [x] **21.1.1 Database Migration (Campaign Scope):** Add `homebrew_rules_json TEXT DEFAULT '[]'` to the `campaigns` table. Create `GET /api/campaigns/{id}/homebrew-rules` (returns the JSON array; accessible to GM and players), and `PUT /api/campaigns/{id}/homebrew-rules` (replaces the entire array; GM only; returns 403 for non-GM, 422 for invalid JSON, 413 if body > 2 MB). Update `campaigns.updated_at` on PUT.

- [x] **21.1.2 Global Rule Source API:** Create `storage/rules/` as a writable server directory (outside the web root, served via a PHP router). Implement `GET /api/global-rules` (lists all `.json` files with filename and byte size; GM only), `PUT /api/global-rules/{filename}` (writes the file; validates filename as `[0-9a-z_-]+\.json`; GM only; 422 on invalid name; 413 if body > 2 MB), `DELETE /api/global-rules/{filename}` (GM only). Filenames set alphabetical load order alongside `static/rules/` files (e.g., `50_my_setting.json` loads after `01_d20srd_psionics`).

- [x] **21.1.3 DataLoader Integration (Dual Scope):** In `DataLoader.ts`, extend the resolution chain to inject both sources: (1) Files in `storage/rules/` are merged into the alphabetical file sort alongside `static/rules/` files — their position is determined by filename. (2) `campaigns.homebrew_rules_json` is injected as a virtual source named `user_homebrew` after all file sources (both `static/rules/` and `storage/rules/`) but before `gmGlobalOverrides`. Both injections are documented with JSDoc comments. Add `getHomebrewRules(scope: 'campaign' | 'global'): Feature[]` methods.

- [x] **21.1.4 HomebrewStore:** Create `src/lib/engine/HomebrewStore.svelte.ts`. A Svelte 5 `$state`-based store managing homebrew entities for the current campaign. Tracks `scope: 'campaign' | 'global'` and `filename: string` (used when `scope === 'global'`; validated as `[0-9a-z_-]+\.json`; default `"50_homebrew.json"`). Methods: `add(entity: Feature): void`, `update(id: ID, patch: Partial<Feature>): void`, `remove(id: ID): void`, `getById(id: ID): Feature | undefined`, `toJSON(): string`. Auto-saves via `$effect` (debounced 1 s) to the appropriate API endpoint based on `scope`. Exposes reactive `isDirty: boolean` and `isSaving: boolean` flags.

#### 21.2 — Shared Picker Modals

_These reusable modals keep editor forms clean. Each opens in a `Modal.svelte` wrapper with focus trap, Escape-to-close, and backdrop close._

- [x] **21.2.1 PipelinePickerModal:** Create `src/lib/components/content-editor/PipelinePickerModal.svelte`. Displays all known pipeline IDs grouped by namespace: `attributes.*`, `combatStats.*`, `saves.*`, `skills.*`, `resources.*`. Sections are collapsible. Text search filter. Each row shows the pipeline ID, a D&D-meaningful label, and the default base value. Allows typing a custom pipeline ID for homebrew pipelines not in the default set. Emits `pipeline-picked` with the chosen ID.

- [x] **21.2.2 FeaturePickerModal:** Create `src/lib/components/content-editor/FeaturePickerModal.svelte`. Searchable list of all Feature IDs from `DataLoader` (SRD + homebrew). Filter by category (multi-select checkboxes) and free-text search on `id` / `label`. Each row shows ID, category badge, label. Clicking a row previews the feature description in a side pane. Supports single-select and multi-select modes via a `multiple` prop. Emits `feature-picked` with `ID[]`.

- [x] **21.2.3 TagPickerModal:** Create `src/lib/components/content-editor/TagPickerModal.svelte`. Shows all tags in use across loaded features, grouped by prefix (e.g., `feat_*`, `item_*`, `weapon_*`), each with a usage count badge. GM can add a new custom tag. Emits `tags-picked` with `string[]`.

- [x] **21.2.4 EntitySearchModal:** Create `src/lib/components/content-editor/EntitySearchModal.svelte`. Full-text search across all loaded entities (SRD + homebrew). Debounced 200 ms. Results show ID, category badge, `ruleSource`, and one-line description excerpt. Clicking a result opens a preview card. "Clone this entity" emits `entity-clone-selected` with the complete `Feature` object. Keyboard navigation (↑↓ + Enter) required.

- [x] **21.2.5 ModifierTypePickerModal:** Create `src/lib/components/content-editor/ModifierTypePickerModal.svelte`. Shows all 23 `ModifierType` values in a grid with a stacking behavior badge (ALWAYS STACKS / BEST WINS / SPECIAL) and a plain-English D&D tooltip per type (e.g., "Dodge — always stacks; use for dodge bonuses from feats and tumbling"). Emits `modifier-type-picked`.

- [x] **21.2.6 ConditionNodeBuilder — Rendering & Serialization:** Create `src/lib/components/content-editor/ConditionNodeBuilder.svelte`. Renders an existing `LogicNode` tree as editable nested cards. AND/OR/NOT nodes render as labeled containers; CONDITION nodes render as a single row with: `targetPath` text input (autocomplete list sourced from `ARCHITECTURE.md §4.3` known `@`-paths), `operator` dropdown with all 8 `LogicOperator` values and plain-English labels (e.g., "has tag", "is at least", "does not include"), `value` field that adapts its type (number spinner for `>=`/`<=`, button opening `TagPickerModal` for `has_tag`/`missing_tag`, plain text otherwise). Each node has a Delete button that removes it and re-emits the updated tree. Emits `node-changed: CustomEvent<LogicNode | undefined>` on every change. Serializes a fully empty or fully deleted tree as `undefined` (not `null`). Depends on `TagPickerModal` (21.2.3).

- [x] **21.2.7 ConditionNodeBuilder — Add/Group/Reorder Interactions:** Extend `ConditionNodeBuilder.svelte`. Add: "+ Add Condition" button (appends a blank CONDITION node to the current AND/OR container), "+ Add Group" dropdown button (inserts a new AND or OR wrapper containing a blank CONDITION), node-type switcher on AND/OR container headers (toggle "All of these (AND)" ↔ "Any of these (OR)"). Add reorder controls (▲/▼ arrow buttons on each node performing index swap in the parent array — no native drag-and-drop API required). Enforce a maximum nesting depth of 4 levels; the "+ Add Group" button is hidden at depth 4, and a tooltip explains the raw JSON panel can be used for deeper trees. All state mutations emit `node-changed` after every operation.

#### 21.3 — Core Editor Forms

- [x] **21.3.1 FormulaBuilderInput:** Create `src/lib/components/content-editor/FormulaBuilderInput.svelte`. A compound text input for fields that accept either a plain number or a formula string (`@`-path expressions, dice notation, or arithmetic). Contains a standard `<input>` plus a collapsible **Formula Assistant** panel. The panel lists all known `@`-paths grouped by category (Ability Scores, Combat Stats, Saves, Skills, Class Levels, Constants & Special — per `ARCHITECTURE.md §4.3`). Clicking a path inserts it at the current cursor position via `input.setRangeText()`. After insert, focus returns to the input and the cursor is placed after the inserted text. **Validation indicator** (debounced 150 ms): a small icon at the right edge of the input — ✓ green for a fully resolved `@`-path or plain number/dice string, ✗ red for an unrecognized `@`-path, ⚠ amber for a partially-specified path (e.g., `@classLevels.` without a class ID). The input text itself is **plain and unstyled** — no inline token colouring (see `ARCHITECTURE.md §21.8` for rationale). A "×" clear button and a "Dice notation help" tooltip popover (`1d6`, `2d8+3`, `@attr+1d4`) are included. Used by `ModifierListEditor` (value field), `ActivationEditor` (resourceCost.cost), and `ResourcePoolEditor` (rechargeAmount, maxPipelineId).

- [x] **21.3.2 CoreFieldsSection:** Create `src/lib/components/content-editor/CoreFieldsSection.svelte`. Fields common to ALL entity types: `id` (kebab-case hint; turns amber with "⚠ This ID matches an existing SRD entity — it will be overridden" banner on collision), `category` (dropdown with D&D labels for all 11 `FeatureCategory` values), `label` (EN + FR inputs), `description` (EN + FR textareas with Markdown preview toggle), `ruleSource` (defaults to `"user_homebrew"`), `tags` (chip list — opens `TagPickerModal`), `forbiddenTags` (same), `merge` (radio: Replace / Partial with inline explanation).

- [x] **21.3.3 ModifierListEditor:** Create `src/lib/components/content-editor/ModifierListEditor.svelte`. List of `Modifier` entries. Each row: `targetId` (opens `PipelinePickerModal`), `type` (opens `ModifierTypePickerModal`), `value` (`FormulaBuilderInput` — detects numeric vs formula input), `conditionNode` (inline preview; opens `ConditionNodeBuilder` in modal on click), `situationalContext` (text input with tooltip), `drBypassTags` (visible only when `type === "damage_reduction"`; opens `TagPickerModal`), `sourceId` / `sourceName` auto-filled from the parent entity id/label. Row has duplicate and delete buttons. "+ Add Modifier" appends a blank row.

- [x] **21.3.4 GrantedFeaturesEditor:** Create `src/lib/components/content-editor/GrantedFeaturesEditor.svelte`. Renders `grantedFeatures: ID[]` as label chips (loads label from `DataLoader`). Each chip: clickable to preview in `FeatureModal`, has remove button. "+ Add Feature" opens `FeaturePickerModal` in multi-select mode.

- [x] **21.3.5 ChoicesEditor:** Create `src/lib/components/content-editor/ChoicesEditor.svelte`. Renders `choices?: FeatureChoice[]`. Each entry has: `choiceId`, `label` (EN+FR), `optionsQuery` (text input with syntax examples; "Test Query" button runs query live against `DataLoader` and displays result count), `maxSelections` (spinner), `choiceGrantedTagPrefix` (with tooltip). "+ Add Choice" appends blank entry.

- [x] **21.3.6 LevelProgressionEditor:** Create `src/lib/components/content-editor/LevelProgressionEditor.svelte` (class-only). Table of up to 20 level rows. Columns: Level (read-only), BAB increment, Fort / Ref / Will increments, granted features (chips; opens `FeaturePickerModal`), granted modifiers (compact count; "Edit" opens `ModifierListEditor` in modal). Preset fill buttons for entire columns: "Full BAB", "3/4 BAB", "1/2 BAB", "Good Save", "Poor Save" per `ARCHITECTURE.md §5.4`. Table scrolls horizontally on narrow viewports.

- [x] **21.3.7 ActivationEditor:** Create `src/lib/components/content-editor/ActivationEditor.svelte`. Collapsed toggle ("Has an activation cost or action type"). When open: `actionType` dropdown (all 10 values with plain-English D&D labels), `triggerEvent` (visible for `"reaction"` only; text input with suggested event strings), `resourceCost` (`targetId` via `PipelinePickerModal`; `cost` via `FormulaBuilderInput`), tiered costs section (expandable list of `ActivationTier` entries: label, cost, modifiers).

- [x] **21.3.8 ResourcePoolEditor:** Create `src/lib/components/content-editor/ResourcePoolEditor.svelte`. Renders `resourcePoolTemplates?: ResourcePoolTemplate[]`. Each entry: `poolId`, `label` (EN+FR), `maxPipelineId` (opens `PipelinePickerModal`), `defaultCurrent`, `resetCondition` (dropdown with all 8 values using plain names: Long Rest, Short Rest, Encounter, Per Day, Per Week, Per Turn, Per Round, Never), `rechargeAmount` (`FormulaBuilderInput`; visible only for Per Turn / Per Round). "+ Add Pool" appends blank entry.

- [x] **21.3.9 ActionBudgetEditor:** Create `src/lib/components/content-editor/ActionBudgetEditor.svelte`. Six number inputs (Standard, Move, Swift, Immediate, Free, Full-Round); blank = unlimited, `0` = blocked (tooltip on each). SRD preset buttons — "Staggered", "Nauseated", "Stunned", "Paralyzed" — fill the correct values per `ARCHITECTURE.md §5.6`.

#### 21.4 — Specialized Sub-Form Editors

- [x] **21.4.1 ItemDataEditor — Core Sections:** Create `src/lib/components/content-editor/ItemDataEditor.svelte` (`category: "item"` only). Reads/writes item fields via `EditorContext` (no props needed). Implements **4 collapsible sections**: **General** (equipment slot dropdown, weightLbs, costGp, hardness, hpMax, `isUnique` toggle, `artifactTier` dropdown); **Weapon Data** (collapse toggle; `wieldCategory`, `damageDice`, `damageType` tag chips via `TagPickerModal`, `critRange`, `critMultiplier`, `reachFt`, `rangeIncrementFt`, secondary weapon sub-form as a nested collapsible, `onCritDice` sub-form); **Armor Data** (toggle; `armorBonus`, `maxDex`, `armorCheckPenalty`, `arcaneSpellFailure`); **Consumable** (toggle; `isConsumable`, `durationHint`). The Charged Items, Cursed, and Intelligent Item sections are left as clearly-commented `<!-- TODO 21.4.4 -->` placeholders so the file compiles and exports cleanly.

- [x] **21.4.4 ItemDataEditor — Charged Items, Cursed & Intelligent:** Extend `ItemDataEditor.svelte` (remove the `<!-- TODO 21.4.4 -->` placeholders). Add **3 remaining collapsible sections**: **Charged Items** — four independently-toggleable tabs (Wand / Staff / Scroll / Metamagic Rod); toggling Wand on populates `wandSpell` (casterLevel spinner + optional spellLevel spinner); Staff populates `staffSpells` (entry list: spell ID via `FeaturePickerModal`, chargeCost spinner 1–5); Scroll populates `scrollSpells` (entry list: spell ID, spellLevel, spellType radio Arcane/Divine); Rod populates `metamagicEffect` (feat dropdown for the 6-value union + maxSpellLevel radio 3/6/9). **Cursed** — toggle activates: `removalPrevention.isCursed: true` flag, `removableBy` chip list (opens `TagPickerModal`), `preventionNote` text input. **Intelligent Item** — toggle activates: INT/WIS/CHA number spinners, `egoScore` display (auto-computed from the three stats + other fields per SRD formula, with a manual override toggle), 9-value `alignment` dropdown, 3-value `communication` dropdown, senses checkboxes (visionFt / darkvisionFt / blindsense), language chip list, `specialPurpose` text, `dedicatedPower` text.

- [x] **21.4.2 MagicDataEditor:** Create `src/lib/components/content-editor/MagicDataEditor.svelte` (`category: "magic"` only). Sections: **General** (`magicType` radio — Arcane / Divine / Psionic; `school` dropdown; spell component checkboxes V/S/M/F/DF/XP); **Spell Lists** (table of class IDs → level; opens `FeaturePickerModal` for class); **Psionic** (visible when `magicType === "psionic"`: `discipline` dropdown, `displays` multi-select, augmentations list — each entry has PP cost, `grantedModifiers` via `ModifierListEditor`, `effectDescription` textarea).

- [x] **21.4.3 RaceClassExtrasEditor:** Create `src/lib/components/content-editor/RaceClassExtrasEditor.svelte`. Race: `recommendedAttributes` chip list (attribute picker dropdown). Class: `classSkills` chip list (opens `FeaturePickerModal` filtered to skill category), `spPerLevel` number input, hit die dropdown (d4/d6/d8/d10/d12). Renders only when category is `"race"` or `"class"`.

#### 21.5 — Top-Level Editor Pages & Content Library

- [x] **21.5.1 ContentLibraryPage:** Create `src/routes/campaigns/[id]/content-editor/+page.svelte` (GM only; navigation guard redirects non-GMs). Header section: `HomebrewScopePanel` — scope toggle (Campaign / Global), `filename` text input visible when `scope === 'global'` (with load-order tooltip: "Files are loaded alphabetically — prefix with a number like `50_` to control priority"), save/load indicator. Main section: sortable, filterable table of all entities in `HomebrewStore` — columns: ID, Category badge, Label, Source, Actions (Edit / Clone / Delete). Toolbar: "New Entity" button, "Import JSON" button (modal with textarea for bulk-paste of a JSON array), "Export All" download button.

- [x] **21.5.2 NewEntityPage:** Create `src/routes/campaigns/[id]/content-editor/new/+page.svelte` and `+page.ts`. Step 1: `EntityTypeSelector.svelte` — card grid of all 11 `FeatureCategory` values with Lucide icons and one-line D&D descriptions. Step 2: "Start from Scratch" vs "Clone an existing entity" toggle. Cloning opens `EntitySearchModal` and pre-populates `EntityForm`. Step 3: Full `EntityForm` for the chosen category.

- [x] **21.5.3 EditEntityPage:** Create `src/routes/campaigns/[id]/content-editor/[entityId]/+page.svelte`. Loads entity from `HomebrewStore`. Renders `EntityForm` in `mode: 'edit'`. Save → `HomebrewStore.update()`. Delete → confirmation dialog → `HomebrewStore.remove()` → redirect to library.

- [x] **21.5.4 EntityForm (orchestrator):** Create `src/lib/components/content-editor/EntityForm.svelte` and `src/lib/components/content-editor/editorContext.ts`. The context module exports `EDITOR_CONTEXT_KEY` and the `EditorContext` interface (see `ARCHITECTURE.md §21.3`). `EntityForm` creates the context object with `$state` for the `Feature` draft and calls `setContext(EDITOR_CONTEXT_KEY, ctx)` — all child sub-forms read and mutate state via `getContext(EDITOR_CONTEXT_KEY)` with no prop-drilling. Props: `category: FeatureCategory`, `initialData?: Partial<Feature>`, `mode: 'create' | 'edit'`. Renders in order: `CoreFieldsSection` (sticky "Override Warning" banner when `ctx.hasOverrideWarning`), `ConditionNodeBuilder` (prerequisitesNode; collapsed when undefined), `ModifierListEditor`, `GrantedFeaturesEditor`, `ChoicesEditor`, then conditional sections — `LevelProgressionEditor` (class only), `ActivationEditor`, `ResourcePoolEditor`, `ActionBudgetEditor`, `ItemDataEditor` (item only), `MagicDataEditor` (magic only), `RaceClassExtrasEditor` (race/class only) — and finally `RawJsonPanel`. Save button validates required fields (id non-empty, category set) and calls `ctx.store.add/update()`. Shows `ctx.store.isSaving` spinner on the button.

- [x] **21.5.5 RawJsonPanel:** Create `src/lib/components/content-editor/RawJsonPanel.svelte`. Expandable `<details>` section at the bottom of `EntityForm`. Textarea pre-filled with prettified JSON. Two-way sync: form state changes update textarea immediately; textarea `input` events (debounced 300 ms) attempt parse — on valid parse update form state via `onRawJsonChange` callback, on invalid parse show red error banner without touching form state. "Prettify / Minify" toggle. "Copy to Clipboard" button.

#### 21.6 — Sidebar Navigation Link

- [x] **21.6.1 Sidebar Link:** Add "Content Editor" item to `Sidebar.svelte`. Visible only when `sessionContext.isGameMaster === true` and a campaign is active. Lucide `Pencil` icon (20 px). Route: `/campaigns/[activeCampaignId]/content-editor`. Positioned after "GM Dashboard" in the GM tools group.

#### 21.7 — Tests

- [x] **21.7.1 PHPUnit — Campaign-Scope Homebrew API:** Create `tests/HomebrewRulesTest.php`. Tests: fresh campaign returns `[]`; GM PUT saves and GET returns persisted data; non-GM PUT → 403; invalid JSON body → 422; body > 2 MB → 413; `campaigns.updated_at` changes after PUT; well-formed Feature with unknown extra fields is accepted (no over-validation on content).

- [x] **21.7.2 PHPUnit — Global Rule Source API:** Extend `tests/HomebrewRulesTest.php` (or create `tests/GlobalRulesTest.php`). Tests: GET lists files after PUT; valid PUT creates file in `storage/rules/`; invalid filename (e.g., `../escape.json`, `MY FILE.json`) → 422; body > 2 MB → 413; DELETE removes file; non-GM requests return 403 for PUT and DELETE.

- [x] **21.7.3 Vitest — HomebrewStore Unit Tests:** Create `src/tests/homebrewStore.test.ts`. Tests: `add()` inserts entity with `ruleSource: "user_homebrew"`; `update()` patches without clobbering unrelated fields; `remove()` deletes by ID; `toJSON()` produces valid parseable JSON array; `isDirty` becomes `true` after mutation and `false` after save; scope switching re-routes saves to the correct endpoint; filename validation rejects paths with invalid characters.

- [x] **21.7.4 Vitest — DataLoader Injection Tests:** Extend `src/tests/mergeEngine.test.ts`. Tests: campaign-homebrew entity with same ID as SRD entity wins (replace semantics); global-scope file interleaved alphabetically between SRD files (file named `00_z.json` loads before `01_*`; file named `99_z.json` loads after all SRD files); `user_homebrew` (campaign scope) ranks above global files; `gmGlobalOverrides` ranks above campaign homebrew; `merge: "partial"` homebrew extends SRD base without clobbering non-overridden fields.

- [x] **21.7.5 Vitest — ConditionNodeBuilder Logic Tests:** Create `src/tests/conditionNodeBuilder.test.ts`. Tests: single CONDITION node serializes and re-hydrates without data loss; AND tree with 3 children serializes correctly; NOT wrapping a CONDITION inverts correctly; `has_tag` operator serializes the correct operator string; empty tree serializes as `undefined` (not `null`); deeply nested AND → OR → NOT → CONDITION renders without crash (snapshot test via Svelte testing library).

- [x] **21.7.6 Vitest — FormulaBuilderInput Tests:** Create `src/tests/formulaBuilderInput.test.ts`. Use `@testing-library/svelte` for component rendering. Tests: recognized `@`-path produces `validationState === 'valid'` (green ✓ icon rendered); unrecognized path produces `validationState === 'error'` (red ✗ icon rendered); plain number produces `validationState === 'neutral'` (no icon); dice notation string (e.g., `"2d6+3"`) produces `validationState === 'neutral'`; partially-specified path `@classLevels.` produces `validationState === 'partial'` (amber ⚠ icon rendered); click-to-insert at cursor: simulate cursor at position 5 in input value `"2 + "` → click `@attributes.stat_strength.derivedModifier` in panel → verify resulting value is `"2 + @attributes.stat_strength.derivedModifier"` and cursor is at end; clear button resets value to `""`. Note: the input text itself carries **no border-colour or inline token styling** — tests assert only the indicator icon, not input CSS classes.

- [x] **21.7.7 Vitest — RawJsonPanel Two-Way Sync Tests:** Create `src/tests/rawJsonPanel.test.ts`. Tests: valid JSON pasted into textarea updates form label field; invalid JSON shows error banner and does NOT alter form state; form field mutation updates textarea content; prettify mode shows indented JSON; minify mode removes whitespace without changing values; `id` collision with SRD entity sets `hasOverrideWarning = true`.

- [x] **21.7.8 Vitest — Override-by-ID Integration Test:** Extend `src/tests/mergeEngine.test.ts`. Full cycle: entity with `id: "race_elf"` added to homebrew store → DataLoader injected → result is homebrew `race_elf` (not SRD) → SRD-only fields absent (replace semantics) → switch to `merge: "partial"` → SRD tags still present with homebrew tags appended.

- [x] **Checkpoint #8 — Content Editor System** (requires Phase 21): Run from `CHECKPOINTS.md`. Resolve ALL issues (CRITICAL, MAJOR, and MINOR) before proceeding.

---

### Phase 22: User Management Interface

_Goal: Replace direct database user management with a proper web interface. The database is initialized with an `admin` user (no password) on first launch. Admins manage all accounts via the UI; new users log in without a password but must set one immediately. Accounts that never log in within 7 days are automatically suspended on the next login attempt (no cron needed). Admins can suspend, reinstate, promote, and delete accounts. GMs and Admins can assign or remove users from campaigns, including suspended users (because they may have active characters)._

#### Backend

- [x] **22.1 DB Schema & Admin Bootstrap:** Update `users` table (additive migration via `PRAGMA table_info` guard): add `role TEXT NOT NULL DEFAULT 'player'` (values: `'admin'`, `'gm'`, `'player'`), `is_suspended INTEGER NOT NULL DEFAULT 0`, `last_login_at INTEGER` (nullable — `NULL` means never logged in). Add `campaign_users` join table: `(campaign_id TEXT, user_id TEXT, joined_at INTEGER, PRIMARY KEY (campaign_id, user_id))` with foreign keys to `campaigns` and `users`. Update `migrate.php` to seed an `admin` user (username: `admin`, empty password hash sentinel `''`, `role: 'admin'`, `is_suspended: 0`) **only if the `users` table is empty** after migrations run. Update all queries that read `is_game_master` to derive GM status from `role IN ('gm', 'admin')`.

- [x] **22.2 Authentication Updates:** Modify `handleLogin()` in `auth.php`: (1) Reject `is_suspended = 1` accounts with 403 + `{"error": "AccountSuspended"}` **before** any password check. (2) Detect no-password accounts by checking `password_hash === ''`; skip `password_verify` and allow login if the submitted password is also empty. (3) On empty-password login: if `(now − created_at) > 7 days`, set `is_suspended = 1` in DB and return 403 `{"error": "AccountExpired"}`. (4) On successful empty-password login: return `"needs_password_setup": true` in the login response and set `$_SESSION['needs_password_setup'] = true`. (5) Add `PUT /api/auth/setup-password` endpoint (requires auth + `$_SESSION['needs_password_setup'] === true`): body `{"password": "string"}`, non-empty validation, stores bcrypt hash via `hashPassword()`, clears `$_SESSION['needs_password_setup']`, returns updated user object. (6) Update `requireGameMaster()` to accept `role IN ('gm', 'admin')`. Add `requireAdmin()` function that gates on `role === 'admin'` only.

- [x] **22.3 User Management REST API:** Create `api/controllers/UserController.php`. All endpoints guarded by `requireAdmin()`. Endpoints: `GET /api/users` — list all users; each record includes `{id, username, player_name, role, is_suspended, created_at, last_login_at, campaigns: [{id, title, character_count}]}` (computed via LEFT JOIN on `campaign_users` + COUNT on `characters`). `POST /api/users` — body `{username, player_name}`: create user with empty password hash, `role: 'player'`, `is_suspended: 0`, generate UUID; return 409 on duplicate username. `PUT /api/users/{id}` — body `{player_name?}`: update `display_name`; return 400 if admin targets own account. `PUT /api/users/{id}/role` — body `{role}`: validate value is `'admin'|'gm'|'player'`; return 400 if admin targets own account. `POST /api/users/{id}/suspend` — set `is_suspended = 1`; return 400 if admin targets own account. `POST /api/users/{id}/reinstate` — set `is_suspended = 0`. `DELETE /api/users/{id}` — delete user and cascade; return 400 if admin targets own account. Register all routes in `api/index.php`.

- [x] **22.4 Campaign User Management API:** Add three endpoints (guarded by `requireAuth()` + GM-or-admin check). `GET /api/campaigns/{id}/users` — list campaign members: `{user_id, username, player_name, role, is_suspended, joined_at}`. `POST /api/campaigns/{id}/users` — body `{user_id}`: add user to campaign (succeeds for suspended users — they may have active characters); return 409 if already a member; return 404 if user or campaign not found. `DELETE /api/campaigns/{id}/users/{userId}` — remove user from campaign. Register routes in `api/index.php` alongside existing campaign routes.

#### Frontend

- [x] **22.5 Frontend Types, API Client & Session Updates:** Create `src/lib/types/user.ts`: `UserRole` type union (`'admin' | 'gm' | 'player'`), `User` interface (`id, username, player_name, role, is_suspended, created_at, last_login_at, campaigns: CampaignMembership[]`), `CampaignMembership` interface (`id, title, character_count`). Create `src/lib/api/userApi.ts`: typed `fetch` wrappers for all 7 user management endpoints and the 3 campaign user endpoints. Update `src/lib/engine/SessionContext.svelte.ts`: replace `isGameMaster: boolean` with `role: UserRole`; add `needsPasswordSetup: boolean`; derive `isGameMaster = role === 'gm' || role === 'admin'` and `isAdmin = role === 'admin'` as computed getters.

- [x] **22.6 Force Password Setup Flow:** Create `src/routes/setup-password/+page.svelte`: two password inputs ("New Password", "Confirm Password"); client-side validation (non-empty, min 8 characters, both fields match); on submit calls `PUT /api/auth/setup-password`; on success sets `session.needsPasswordSetup = false` and navigates to `/campaigns`. Add redirect guard in `src/routes/+layout.svelte` (or `+layout.ts`): if `session.isAuthenticated && session.needsPasswordSetup && currentPath !== '/setup-password'`, redirect to `/setup-password`; if `!session.isAuthenticated && currentPath !== '/login'`, redirect to `/login`.

- [x] **22.7 User Management Page — List View:** Create `src/routes/admin/users/+page.svelte` (admin-only guard — redirect non-admins to `/campaigns`). Render a table of all users from `userApi.listUsers()`: columns are username, player name, role badge (color-coded: Admin=red, GM=amber, Player=blue), assigned campaigns (names with character count per campaign shown as "Campaign Name (N chars)"), creation date, last login (formatted date or "Never"), suspended badge. Toolbar: "Add User" button. Per-row actions: Edit (pencil icon), Suspend or Reinstate toggle (lock/unlock icon), Delete (trash icon) — all three disabled and visually grayed out for the currently authenticated admin's own row.

- [x] **22.8 User Form, Role & Confirmation Modals:** Create `src/lib/components/admin/UserFormModal.svelte`: create mode shows username + player_name inputs with validation; edit mode shows player_name input + role dropdown (Admin/GM/Player) + suspend/reinstate toggle. Create `src/lib/components/admin/ConfirmDeleteModal.svelte`: reusable modal with a "This cannot be undone" warning, shows username being deleted, requires clicking a confirmation button. Wire all actions (create, edit, delete, suspend, reinstate) in the user management page to these modals and the `userApi` client; refresh list after each successful action.

- [x] **22.9 Campaign Member Management UI:** Add a "Members" collapsible section to `src/routes/campaigns/[id]/settings/+page.svelte` (visible when `session.isGameMaster` is true). Section shows the current member list: username, player name, role badge, and a "(Suspended)" indicator when `is_suspended` is true. "Add Member" button opens a searchable dropdown listing all users (including suspended) with suspended users shown in muted text; selecting a user calls `POST /api/campaigns/{id}/users`. Each member row has a "Remove" button that calls `DELETE /api/campaigns/{id}/users/{userId}`.

#### Tests

- [x] **22.10 PHPUnit — User Management & Auth Tests:** Create `tests/UserManagementTest.php`. Cover: (1) admin bootstrap — empty DB after migrate creates admin with empty hash; (2) no-password login within 7 days returns `needs_password_setup: true`; (3) no-password login after 7 days returns 403 `AccountExpired` and sets `is_suspended = 1`; (4) `PUT /api/auth/setup-password` stores bcrypt hash and clears flag; (5) subsequent login with password works normally; (6) suspended account login returns 403 `AccountSuspended`; (7) reinstated account login works; (8) admin creates user (username + player_name, no password, role=player); (9) duplicate username returns 409; (10) admin updates `player_name`; (11) admin changes role; (12) admin suspends a user; (13) admin reinstates a user; (14) admin deletes a user; (15) all self-edit/self-suspend/self-delete operations return 400; (16) non-admin user requesting any `/api/users` endpoint returns 403. Create `tests/CampaignUsersTest.php`. Cover: (17) GM adds user to campaign; (18) suspended user can be added to campaign; (19) adding duplicate member returns 409; (20) GM removes user from campaign; (21) player cannot manage campaign members (403).

- [x] **22.11 Vitest — Frontend Unit Tests:** Create `src/tests/userManagement.test.ts`: mock-`fetch` unit tests for every `userApi` function (list, create, updatePlayerName, updateRole, suspend, reinstate, delete, addToCampaign, removeFromCampaign); verify correct HTTP method, URL, and body for each call; verify 4xx responses throw typed errors. Create `src/tests/setupPasswordFlow.test.ts`: test `SessionContext` `needsPasswordSetup` flag state transitions; test setup-password form validation (rejects empty password, rejects mismatch, rejects < 8 chars, accepts valid input); test redirect guard logic (unauthenticated → `/login`, authenticated + needsSetup + not on `/setup-password` → `/setup-password`).

- [x] **22.12 Run All Tests:** Run `npm run test` (Vitest) and `./vendor/bin/phpunit` (PHPUnit). Fix any failures or TypeScript errors introduced by Phase 22 changes. Confirm all pre-existing tests (Phases 16–21) still pass. Resolve any import breakage caused by `SessionContext` role refactoring.

- [x] **22.13 Coverage Analysis & README Update:** Run `npm run test:coverage` and `./vendor/bin/phpunit --coverage-text`. Identify and fix obvious untested paths (target: every public API endpoint has at least one success test and one error test; every form validation branch is covered). Update `README.md` with the new total test count and updated coverage percentages for both PHPUnit and Vitest suites.

- [x] **22.14 Backend: Password Reset & Change-Password APIs:** Add two new password-management endpoints. (1) `POST /api/users/{id}/reset-password` (admin-only via `requireAdmin()`): blanks the target user's `password_hash` to `''`, forcing them through the first-login `setup-password` flow on next login. No self-edit restriction — an admin may reset their own password. Returns 200 `{id, password_reset: true}`; 404 if user not found; 403 if caller is not admin. Add `resetPassword(string $id): void` to `UserController.php`. (2) `PUT /api/auth/change-password` (any authenticated user via `requireAuth()`): body `{current_password, new_password}`. Validates `new_password` is non-empty (400). If the account already has a password (`password_hash !== ''`), validates `current_password` via `password_verify` (400 `WrongPassword` on mismatch). If account has no password (`password_hash === ''`), skips the current-password check (the user is still in first-login setup state). Stores the new bcrypt hash, clears `$_SESSION['needs_password_setup']`, returns updated user object. Add `handleChangePassword(): void` to `auth.php`. Register both routes in `api/index.php` with `verifyCsrfToken()`.

- [x] **22.15 Frontend: Change-Password Modal & Admin Reset UI:** (1) Add `changePassword(currentPassword: string, newPassword: string)` and `resetUserPassword(userId: string)` to `src/lib/api/userApi.ts`. (2) Create `src/lib/components/admin/ChangePasswordModal.svelte`: form with "Current Password" + "New Password" + "Confirm New Password" fields; validation (new ≥ 8 chars, both match; current password field shown but skipped server-side for no-password accounts); calls `changePassword()`; on success clears `session.needsPasswordSetup` and closes modal; on `WrongPassword` 400 shows "Current password is incorrect." error inline. (3) Add a "Change Password" button to the Sidebar footer user-info area (visible to all authenticated users, collapsed mode shows key icon only); clicking opens `ChangePasswordModal`. (4) Add a "Reset Password" icon-button to each row in `src/routes/admin/users/+page.svelte` (key icon, admin-only, no restriction on self); clicking calls `resetUserPassword(user.id)` directly (no modal — it's non-destructive since the user can still log in); after success refresh the user list with a brief "Password reset" toast-style inline notice.

- [x] **22.16 Tests & Final Coverage Update:** PHPUnit — add to `tests/UserManagementTest.php`: `handleChangePassword` success (stores hash, clears flag); `handleChangePassword` wrong current password → 400 `WrongPassword`; empty new password → 400; no-password account skips current-password check; `UserController::resetPassword` admin success (sets hash to ''); non-admin → 403; unknown user → 404. Vitest — add to `src/tests/userManagement.test.ts`: `changePassword()` API wrapper (correct URL/method/body, 400 error propagation); `resetUserPassword()` wrapper (correct URL/method). Run `npm run test` (Vitest) and `./vendor/bin/phpunit`; confirm all tests pass. Run `npm run test:coverage`; update `README.md` with final test counts and coverage percentages.

- [x] **Checkpoint #9 — User Management System** (requires Phase 22): Run from `CHECKPOINTS.md`. Resolve ALL issues (CRITICAL, MAJOR, and MINOR) before proceeding.

---

### Phase 23: UI/UX Polish, Engine Structure Enforcement & Component Architecture

_Goal: A three-part iteration that (1) polishes UI/UX for player-facing features, auth flows, character lore fields, seed data, and locale reliability; (2) enforces code structure by extracting engine logic into focused modules; and (3) splits oversized Svelte components into focused sub-components. The three workstreams run in series: UX polish first (23.1–23.16), engine extraction second (23.17–23.20), component splits third (23.21–23.26)._

- [x] **23.1 Campaign Description Localisation:** The campaign `description` field (plain TEXT in SQLite) now supports a JSON-encoded `LocalizedString` stored as text. `api/seed.php` writes `json_encode({"en":"…","fr":"…"})`. The campaign detail page (`src/routes/campaigns/[id]/+page.svelte`) adds a `resolveDescription(desc)` helper that safely parses the value: if it is a JSON object it is translated via `engine.t()`; otherwise the raw string is returned unchanged. Fully backward-compatible — existing plain-text descriptions continue to work.

- [x] **23.2 Player Spoiler Guard on Campaign Page:** Players no longer see chapters or tasks that the GM has not marked complete. The `{#each campaign.chapters}` and the inner `{#each chapter.tasks}` loops now gate on `sessionContext.isGameMaster || item.isCompleted`. GMs retain full interactive view (checkboxes, Mark Done buttons). Completed tasks shown to players are always rendered in read-only struck-through style (no ambiguous unchecked appearance).

- [x] **23.3 Sidebar-Free Login & Auth Pages:** `AppShell.svelte` gains an `isAuthPage` derived (`/login` and `/setup-password` paths). When true: (a) the `<Sidebar>` is not rendered; (b) the mobile top bar `<header>` is not rendered. The result is a full-screen, distraction-free login experience.

- [x] **23.4 Language & Theme Controls on Login Page:** `src/routes/login/+page.svelte` now shows a fixed overlay (top-right corner) with a three-state theme toggle button and a language selector dropdown. Controls mirror the sidebar equivalents: `themeManager.cycle()` for the toggle, `loadUiLocale + engine.settings.language` assignment for the dropdown. Both appear once `engine.availableLanguages` has more than one entry (i.e., after external locale files are discovered). `themeManager.init()` is called in the login page's `$effect` to ensure the toggle works immediately.

- [x] **23.5 Remove Dev Role-Switch Button:** The `{#if import.meta.env.DEV}` block in `Sidebar.svelte` that rendered a "→ Player / → GM" toggle button has been removed entirely. Role is determined exclusively by server-side authentication. Dev testing uses separate `player1`/`player2` accounts seeded by `api/seed.php`.

- [x] **23.6 Fix Saving Throws (and Combat Stats) Missing After DB Load:** `GameEngine.loadCharacter()` previously initialised `combatStats` and `saves` from `char.combatStats ?? {}` / `char.saves ?? {}`. Because `api/seed.php` characters do not include these maps in their JSON, both resolved to empty objects, causing `phase3_combatStats` to return `{}` — making AC, BAB, Fort, Ref, Will all invisible. The fix merges the **template** (`createEmptyCharacter()`) pipelines as the baseline: all standard pipeline keys are present with correct base values (10 for AC, 99 for max DEX cap, 0 for saves), and any stored `baseValue` from the persisted JSON is overlaid on top. Custom/homebrew pipelines absent from the template are preserved. This mirrors the existing attribute normalization pattern.

- [x] **23.7 Character Lore Fields — `notes` and `physicalTraits`:** Two new optional fields are added to the `Character` interface in `src/lib/types/character.ts`:
  - `notes?: string` — long-form personal story/backstory (replaces the `customSubtitle` repurposing).
  - `physicalTraits?: Record<string, string>` — flat key/value appearance map (`height`, `weight`, `age`, `eyes`, `hair`, `skin`).
  `src/lib/components/core/LoreAndLanguages.svelte` is updated to read/write both fields reactively via `$effect`. Physical trait inputs now persist across page reloads. `customSubtitle` reverts to its intended short-subtitle role (e.g. "Chaotic Neutral · Human Soulknife 7").

- [x] **23.8 Seed Data — Full Level-7 Character Sheets:** Both seed characters in `api/seed.php` are brought to "real level 7" standard:
  - **Kael Shadowstep** (Human Soulknife 7, Chaotic Neutral, player Matthieu Renard): `alignment_chaotic_neutral` feature; `language_common` (INT 10 = 0 bonus slots); full physical traits; personal backstory in `notes`; `customSubtitle` updated to include alignment.
  - **Sylara Moonwhisper** (Elf Druid 7, Neutral Good, player Sophie Delacourt): `alignment_neutral_good` feature; `language_common`, `language_elven`, `language_sylvan` (racial auto-grants), `language_draconic` (INT +1 bonus slot); full physical traits; personal backstory in `notes`; `customSubtitle` updated.
  - Campaign description upgraded to bilingual JSON (EN + FR).
  - Seed summary output updated to show player names and alignments.

- [x] **23.9 Language Dropdown — Full Runtime Discovery:** `fr` is removed from `SUPPORTED_UI_LANGUAGES` entirely. `SUPPORTED_UI_LANGUAGES` now contains only `en` — the one language that has no server-side locale file. `LANG_UNIT_SYSTEM` starts with only `en → imperial`; all other unit system mappings (including `fr → metric`) arrive at runtime via `registerLangUnitSystem()` called from `DataLoader.loadExternalLocales()`. `_availableLanguages` in `DataLoader` starts with `['en']` only; other codes enter at runtime from locale files or rule-file `supportedLanguages` arrays. The `[i18n] Missing UI string key: "lang.fr"` warning is eliminated: the dropdown never shows a language before its display name is confirmed. Removing `fr.json` from a deployed server has zero compile-time impact. Updated `uiStrings.test.ts`, `formatters.test.ts`, and `dataLoaderDirect.test.ts` to reflect the new contract; added `beforeAll(() => registerLangUnitSystem('fr', 'metric'))` to formatter and math-parser test files to simulate runtime locale registration.

- [x] **23.10 Language Dropdown — Fix Reactive Signal Path:** `loadExternalLocales()` was updating `dataLoader._availableLanguages` but no Svelte reactive signal was fired, so `engine.availableLanguages` never recomputed and the login page dropdown stayed hidden. Root cause: `bumpDataLoaderVersion()` mirrors `dataLoader.loadVersion`, which is only incremented by `loadRuleSources()` — never by `loadExternalLocales()`. Fix: added a dedicated `DataLoader.localesVersion` counter (incremented at the end of each successful `loadExternalLocales()` call), a matching `engine.localesVersion = $state(0)` reactive counter, and `engine.bumpLocalesVersion()` to sync them. `engine.availableLanguages` now depends on BOTH `dataLoaderVersion` (rule files) and `localesVersion` (locale files) — the separation avoids triggering the heavy game-mechanics `$derived` pipelines on locale discovery. `AppShell.onMount` and the login page `$effect` both call `bumpLocalesVersion()` after `loadExternalLocales()`. Dev hint (`login.dev_hint`) removed from login page, `ui-strings.ts`, and `fr.json`. Two new tests added: `localesVersion` starts at 0, increments per successful call, stays 0 on failure.

- [x] **23.11 Sidebar UX Overhaul — User Menu, Flag Picker, Collapsed Layout:**
  - **GM View pills removed** from vault, GM dashboard, and campaign settings pages.
  - **View-as-player dev toggle** removed from campaign list and `SessionContext` — role is server-authoritative only.
  - **User section** moved from the sidebar footer to just below the header, with a click-to-open dropdown containing "Change Password" and "Log out" actions. `logout()` added to `userApi.ts` (`POST /api/auth/logout`).
  - **Sidebar footer** redesigned: theme icon + language picker on one row (expanded) or stacked vertically flag-only (collapsed).
  - **`ThemeLanguagePicker.svelte`** created as a shared component used by both the sidebar and the login page. Handles cookie-based language persistence (`cv_language` cookie, replacing the `cv_user_language` localStorage key). Shows a "currently unavailable" disabled entry when the stored language preference is not yet loaded.
  - **Country flags** added to the language picker via `flag-icons` (npm, SVG-based, cross-platform — works on Windows unlike emoji flags). `flag-icons/css/flag-icons.min.css` imported in `app.css`.
  - **`$meta.countryCode`** added as a mandatory field to all locale JSON files (ISO 3166-1 alpha-2). `UiLocalesController.php` now requires and returns `countryCode`; `DataLoader` stores it; `GameEngine.getLanguageCountryCode()` exposes it.
  - **Collapsed sidebar header** fixed: when `collapsed=true` at desktop (lg+), only the expand chevron is shown (logo hidden to prevent overlap). Logo visible on tablet/mobile and in expanded mode.
  - **Overflow fix:** `overflow-x-hidden` moved from `<aside>` to `<nav>` so that user and language dropdowns can escape the 64 px collapsed sidebar bounds without clipping.
  - **Login page**: `ThemeLanguagePicker` moved from fixed top-right corner to centered below the login card; dropdown opens upward.
  - **Language persistence**: migrated from `localStorage` (`cv_user_language`) to cookie (`cv_language`). `src/lib/utils/languageCookie.ts` created. Unavailable-language logic: cookie preference preserved without overwriting when the locale is not yet available; auto-applied when the campaign locale loads.

- [x] **23.12 Locale Flash Fix — Disable SSR:** Create `src/routes/+layout.ts` with `export const ssr = false`. Character Vault is a fully auth-gated SPA; SSR provides no SEO value and is the root cause of a "flash of English" on first render. During SSR, `readLanguageCookie()` cannot access `document.cookie` (unavailable in Node.js), always returning `'en'`, so the server renders the full page in English. When the client hydrates and applies the user's actual language (e.g. French), a visible flash occurs. With CSR-only rendering the browser always has `document.cookie` and `localStorage` available, so `loadUiLocaleFromCache()` can restore the locale synchronously before the first paint. Note: the PHP backend cannot run Node anyway, making SSR impractical by definition.

- [x] **23.13 AppShell Locale Gate Simplification:** Simplify `AppShell.onMount` to release `localeReady` as soon as the locale is ready — before `loadExternalLocales()` completes. The spinner must not remain visible for the duration of the external-locales API call since that call only populates the language dropdown (not content). Move external locales loading to fire-and-forget background (`.then()`).

- [x] **23.14 ThemeLanguagePicker — Remove Redundant Locale Logic:** Remove the synchronous pre-render locale-restore block and mount-time `applyLanguage` calls from `ThemeLanguagePicker.svelte`. AppShell gates all content behind `localeReady` and owns locale loading; by the time `ThemeLanguagePicker` renders, the locale is already applied. The picker manages only `pendingLang` (dropdown UI state for not-yet-available languages) and responds to explicit user selection via `selectLanguage`.

- [x] **23.15 DataLoader.loadExternalLocales() — Concurrent-Call Deduplication:** Add `_localesLoadPromise: Promise<void> | null` to `DataLoader`. Concurrent callers (login page `$effect` and AppShell `onMount` both fire at startup) must share the same in-flight GET /api/locales request. Clear the promise in a `finally` block so deliberate re-calls (e.g. after a campaign switch) still trigger a fresh fetch.

- [x] **23.16 Architecture Documentation — SPA/CSR and Electron Roadmap:** Update `ARCHITECTURE.md` §11.2 to reflect that `SUPPORTED_UI_LANGUAGES` contains only `en`. Add §11.9 documenting the CSR-only rendering choice and locale loading lifecycle (warm/cold cache table). Add §11.10 documenting the multi-backend architecture vision: a future Electron desktop app can use a local Node.js backend (standalone mode) or a remote PHP server (connected mode) — the frontend requires zero changes since all API calls already use relative URLs.

- [x] **Checkpoint #10 — SPA Rendering, Locale Loading & Architecture Integrity** (requires Phase 23 tasks 23.12–23.16): Run from `CHECKPOINTS.md`. Resolve ALL issues (CRITICAL, MAJOR, and MINOR) before proceeding.

#### Engine Code Structure Enforcement

_Goal: Reduce the size of monolithic files by extracting cohesive logic into focused modules. Rule: extracted `.ts` files contain pure functions with explicit parameters; `$derived.by` wrappers remain in `GameEngine.svelte.ts`. All existing tests must continue to pass after each extraction step._

- [x] **23.17 Engine Type Separation:** Extract engine-internal types and pure factory functions out of `GameEngine.svelte.ts`. Create `src/lib/types/engine.ts` containing: `ClassSkillPointsEntry`, `LevelingJournalClassEntry`, `LevelingJournal`, `SkillPointsBudget`, `SaveConfigEntry`, `WeaponDefaults`, `FlatModifierEntry`, `MAX_RESOLUTION_DEPTH`. Create `src/lib/engine/CharacterFactory.ts` containing: `makeSkillPipeline()`, `createEmptyCharacter()`, `normaliseModifierTargetId()`. Update all consumer imports in `GameEngine.svelte.ts` and any other files that import from it. Verify: `npx tsc --noEmit` + `npx vitest run`.

- [x] **23.18 Feature Type File Split:** Split the monolithic `src/lib/types/feature.ts` into three focused modules in the same directory: `feature-base.ts` (base `Feature` interface, `FeatureCategory`, `MergeStrategy`, `FeatureChoice`, `LevelProgressionEntry`, `ResourcePoolTemplate`, `ActivationTier`), `feature-items.ts` (`OnCritDiceSpec`, `ItemFeature` with all sub-types), `feature-magic.ts` (`PsionicItemType`, `PowerStoneEntry`, `PsionicDiscipline`, `PsionicDisplay`, `AugmentationRule`, `MagicFeature`). `feature.ts` becomes a pure barrel: `export * from './feature-base'; export * from './feature-items'; export * from './feature-magic'`. No consumer import paths need to change. Verify: `npx tsc --noEmit` + `npx vitest run`.

- [x] **23.19 DataLoader Merge Engine Extraction & Utility Splits:** Extract merge logic from `DataLoader.ts` into `src/lib/engine/MergeEngine.ts` (exports: `mergeFeatures()`, `mergePartial()`, `mergeArray()`, `mergeLevelProgression()`, `mergeChoices()`). Update `DataLoader.ts` imports and `mergeEngine.test.ts` import path if needed. Verify: `npx vitest run src/tests/mergeEngine.test.ts` + `npx vitest run`. Split `src/lib/utils/constants.ts` into domain modules: `abilityConstants.ts`, `itemConstants.ts`, `ruleConstants.ts`; `constants.ts` becomes a barrel. Split `src/lib/utils/formatters.ts` into: `localizationHelpers.ts`, `unitFormatters.ts`, `statFormatters.ts`; `formatters.ts` becomes a barrel. Verify: `npx tsc --noEmit` + `npx vitest run`.

- [x] **23.20 GameEngine Phase & Method Extraction:** Extract all computational phases out of `GameEngine.svelte.ts` into plain `.ts` files under `src/lib/engine/phases/`. Each file exports pure functions accepting explicit parameters; `$derived.by` wrappers remain in `GameEngine.svelte.ts`. Phase files to create: `phase0Modifiers.ts` (exports: `computePhase0Result()`, `computeActiveTags()`), `phase1Size.ts` (`buildSizePipeline()`), `phase2Attributes.ts` (`buildAttributePipelines()`, `buildPhase2Context()`), `phase3CombatStats.ts` (`buildCombatStatPipelines()`, `buildPhase3Context()`, `computeMaxHp()`, `computeConHpContrib()`, `computeEffectiveDexToAC()`), `phase4Skills.ts` (`computeClassSkills()`, `computeSkillPointsBudget()`, `buildLevelingJournal()`, `buildSkillPipelines()`, `computeMulticlassXpPenaltyRisk()`), `phaseSavingThrows.ts`, `phaseWeapons.ts`, `phaseEquipmentSlots.ts`, `phaseMagicResources.ts`, `phaseFeatSlots.ts`, `phaseActionBudget.ts`. Additionally: create `src/lib/engine/CharacterMutations.ts` (pure functions returning new `Character` state, extracted from lines handling feature/skill mutations); create `src/lib/engine/ResourceManager.ts` (exports: `applySpellSlotUse()`, `applyPowerPointSpend()`, `applyLongRest()`, `resolveActivationCost()` etc.); create `src/lib/engine/FeatureManager.ts` (exports: `applyAddFeature()`, `applyRemoveFeature()`, `applyConsumeItem()`, `applyExpireEffect()`). Target: `GameEngine.svelte.ts` under 1500 lines (down from the ~5400-line monolith). Verify after each group: `npx tsc --noEmit` + `npx vitest run`.

#### Component Architecture Splits

_Goal: Split the six largest Svelte components into focused sub-components. Rule: no game logic in `.svelte` files (ARCHITECTURE.md §3); settings panels communicate via Svelte 5 `$bindable()` props; content-editor sub-forms use `EditorContext` (no prop-drilling of the `Feature` draft); magic sub-components use typed props + callbacks._

- [x] **23.21 Settings Page Component Split:** Split `src/routes/campaigns/[id]/settings/+page.svelte` (1430 lines) into six focused panel components in `src/lib/components/settings/` (new directory). Create: **`RuleSourcesPanel.svelte`** — encapsulates available-file loading (`loadAvailableSources`), `enabledSources` array, group-palette helper, `toggleFile`/`toggleGroup`/`enableAllSources`/`disableAllSources`, drag-to-reorder handlers, `availableGroups` derived, full section-1 template; prop: `bind:enabledSources: string[]`. **`CharacterCreationPanel.svelte`** — dice rules (exploding-twenties) + stat generation (allowed methods, reroll-ones, point-buy budget + preset buttons); props: `bind:explodingTwenties`, `bind:rerollOnes`, `bind:pointBuyBudget`, `bind:allowedRoll`, `bind:allowedPointBuy`, `bind:allowedStdArray`. **`VariantRulesPanel.svelte`** — gestalt + VWP toggles, VWP resource-ID warning; props: `bind:variantGestalt`, `bind:variantVWP`. **`ChaptersPanel.svelte`** — `EditableChapter`/`EditableTask` interfaces, `editableChapters` state, chapter+task drag-to-reorder, add/remove helpers; props: `bind:editableChapters`, `bind:chaptersAreDirty`. **`GmOverridesPanel.svelte`** — JSON textarea, `_jsonValidation`/`jsonError`/`jsonWarnings` derived, error/warning banners, examples collapsible; props: `bind:gmOverridesText`, `bind:isValidJson` (computed inside, exposed so parent can gate Save button). **`MembershipPanel.svelte`** — `members`/`membersLoading`/`membersError` state, user-picker, `loadMembers`/`handleAddMember`/`handleRemoveMember`; prop: `campaignId: string`. Parent page shrinks to ~300 lines (header, `$effect` initialisers, `saveSettings()`, panel composition). Verify: `npx tsc --noEmit`.

- [x] **23.22 ItemDataEditor Component Split:** Split `src/lib/components/content-editor/ItemDataEditor.svelte` (1257 lines) into five focused sub-editors in the same directory, all reading/writing via `EditorContext` (no new props for the `ItemFeature` draft). Create: **`WeaponFieldsEditor.svelte`** — `WIELD_OPTIONS`, `showDamageTypePicker`/`showSecDamageTypePicker` state, `toggleWeaponData`/`toggleSecondaryWeapon`/`toggleOnCritDice`, `TagPickerModal` for primary/secondary damage types, section-2 template (wield category, damage dice, crit range/multiplier, reach, range increment, secondary weapon collapsible, on-crit dice collapsible). **`ArmorFieldsEditor.svelte`** — `toggleArmorData`, section-3 template (armor bonus, max DEX, check penalty, arcane spell failure). **`ChargedItemsEditor.svelte`** — `METAMAGIC_FEATS`, independently-toggleable Wand/Staff/Scroll/Metamagic Rod tabs; toggling Wand populates `wandSpell`; Staff populates `staffSpells` (entry list with spell ID via `FeaturePickerModal`, chargeCost 1–5); Scroll populates `scrollSpells` (spell ID, spellLevel, spellType Arcane/Divine); Rod populates `metamagicEffect` (feat union + `maxSpellLevel` 3/6/9); `SpellPickerTarget` type + `spellPickerTarget` state; single `FeaturePickerModal` instance. **`CursedItemEditor.svelte`** — `toggleCursed`, `showCursedTagPicker` state, `TagPickerModal`, section-6 template (removable-by chip list, prevention note). **`IntelligentItemEditor.svelte`** — `toggleIntelligent`, `egoManualOverride` state, `autoEgo` derived (delegates to `computeIntelligentItemEgo()`), `ALIGNMENT_OPTIONS` derived, section-7 template (INT/WIS/CHA, ego display, 9-value alignment, 3-value communication, senses, language chips, special purpose, dedicated power). `ItemDataEditor.svelte` retains General (§1) + Consumable (§4), shrinking to ~300 lines. Verify: `npx tsc --noEmit`.

- [x] **23.23 CastingPanel Component Split:** Split `src/lib/components/magic/CastingPanel.svelte` (655 lines) into two sub-components using props + callbacks (not `EditorContext`). Create **`MagicItemsCastingSubpanel.svelte`**: encapsulates the equipped-wands/staves/scrolls section and the metamagic-rod sub-panel; receives `equippedItems: ItemFeature[]` and the active PP/spell-slot state as props; must NOT read any DAG pipeline directly (parent passes derived values); emits `onCastWand`, `onCastStaff`, `onCastScroll` callbacks. Create **`SpellRowItem.svelte`**: single spell/power row — localized name, school badge, psionic-display badges with suppress-DC tooltip, augmentation-steps stepper, info button, dice button, cast button(s); all per-spell state (`augSteps` entry) lives in the parent and is passed as a prop; props: `spell: MagicFeature`, `augStep: number`, `onAugChange: (n: number) => void`, `onCast`, `onInfo`, `onDice?` callbacks. All callback props typed (no `any`). Parent `CastingPanel.svelte` shrinks to ~260 lines. Verify: `npx tsc --noEmit`.

- [x] **23.24 ModifierListEditor Component Split:** Split `src/lib/components/content-editor/ModifierListEditor.svelte` (619 lines) by extracting **`ModifierRow.svelte`** for the full single-modifier editing UI: `targetId` button (opens `PipelinePickerModal`), type badge + picker (opens `ModifierTypePickerModal`), value `FormulaBuilderInput`, condition summary label + edit-condition modal (opens `ConditionNodeBuilder`), situational-context text input, DR bypass-tags picker (visible only when `type === "damage_reduction"`; opens `TagPickerModal`), `sourceId`/`sourceName` override inputs (auto-filled from parent entity), duplicate + delete buttons. Props: `modifier: Modifier`, `index: number`; callbacks: `onchange(updatedModifier: Modifier)`, `ondelete()`, `onduplicate()`. All modal instances (`PipelinePickerModal`, `ModifierTypePickerModal`, `FormulaBuilderInput`, `ConditionNodeBuilder`, `TagPickerModal`) are scoped locally inside `ModifierRow.svelte`. Parent `ModifierListEditor.svelte` shrinks to ~150 lines (only list container, `{#each modifiers}` loop calling `<ModifierRow>`, and "+ Add Modifier" button). Verify: `npx tsc --noEmit`.

- [x] **23.25 MagicDataEditor & ActivationEditor Component Splits:** Split `src/lib/components/content-editor/MagicDataEditor.svelte` (560 lines): extract **`SpellListsSection.svelte`** (class + spell-level table, "Add Class" `FeaturePickerModal` instance, add/remove/update class-level helpers; reads/writes via `EditorContext`) and **`PsionicDataSection.svelte`** (discipline dropdown, displays multi-select, augmentations list with add/remove augmentation, `costIncrement`, `isRepeatable`, `effectDescription` EN/FR inputs, `LevelModifierModal` for per-augmentation modifiers; `EditorContext`; rendered only when `magicType === 'psionic'`). Parent shrinks to ~190 lines (General section only). Split `src/lib/components/content-editor/ActivationEditor.svelte` (553 lines): extract **`TieredCostsEditor.svelte`** (tiered resource costs array editor — add tier, remove tier, label EN/FR inputs, `targetPoolId` via `PipelinePickerModal`, cost `FormulaBuilderInput`, modifier-count badge + `LevelModifierModal` for per-tier modifiers; reads/writes `ctx.feature.activation.tieredResourceCosts` via `EditorContext`). Parent retains fixed-cost fields and cost-mode radio selector, shrinks to ~365 lines. Verify both: `npx tsc --noEmit`.

- [x] **23.26 Component Split Tests & Final Verification:** Create `src/tests/componentSplits.test.ts` covering: `GmOverridesPanel` JSON validation (valid/invalid JSON, warning detection), `TieredCostsEditor` tier add/remove and label mutation, `MagicItemsCastingSubpanel` item-type filtering (wand vs staff vs scroll vs rod), `ModifierRow` source-field auto-defaulting from parent entity id/label, structural contract checks (all new sub-component files exist at expected paths, all parent orchestrators are within their post-split line-count targets). Run full verification: `npx tsc --noEmit` + `npx vitest run` — all tests pass.

- [x] **Checkpoint #11 — Component Architecture Conformance** (requires Phase 23 sub-tasks 23.17–23.26): Run from `CHECKPOINTS.md`. Resolve ALL issues (CRITICAL, MAJOR, and MINOR) before proceeding.

---

### Phase 24: NPC & Monster Template Management

_Goal: Develop a NPC (and Monster Template) Management System including a "Quick-Spawn" feature for the GM to instantiate templates in real-time._

### Phase 25: Rules Library Browser

_Goal: Develop a library for the GM and players to browse all data._

---

### Final Review

- [ ] **Final Review** (complete system validation — before release): Run from `CHECKPOINTS.md`. All issues at all severity levels must be zero before release.
