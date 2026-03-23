# Checkpoints

Each checkpoint is a self-contained review prompt that can be executed **at any time** once its prerequisite phases are complete. Running Checkpoint #1 after Checkpoint #4 (or after all phases) is perfectly valid — it reviews only its own domain and remains accurate regardless of what else has been built. Prerequisites are listed at the top of each checkpoint.

---

## Checkpoint #1 — Engine & Foundation Conformance

**Prerequisites:** Phases 1–5 must be complete.

```markdown
You are a senior code reviewer specializing in TypeScript, Svelte 5, and data-driven ECS architectures.

I have attached `ARCHITECTURE.md`, `ANNEXES.md`, and all source files produced during Phases 1 through 5 of the project. `PROGRESS.md` shows which tasks are checked off.

Your job is to perform a **strict conformance review** against the architecture document. Do NOT rewrite code. Produce a **numbered checklist of issues** with file paths, line references, and severity (CRITICAL / MAJOR / MINOR).

---

## 1. Type Conformance — Primitives & Pipelines (Phase 1.1–1.2)

- Does `ModifierType` include ALL required values: `"damage_reduction"`, `"inherent"`, `"max_dex_cap"` in addition to the standard set?
- Is `"max_dex_cap"` documented as "minimum-wins" and scoped to `combatStats.max_dex_bonus` only?
- Are `sourceId` and `sourceName` required (not optional) on every `Modifier`?
- Does `Modifier` have optional `drBypassTags?: string[]` (only meaningful when `type === "damage_reduction"`)?
- Does `Modifier.targetId` JSDoc document the `"attacker.*"` prefix convention (roll-time only, never in static pipeline)?
- Does `StatisticPipeline` have `derivedModifier`?
- Does `ResourcePool.resetCondition` include ALL 8 values: `"short_rest"`, `"long_rest"`, `"encounter"`, `"never"`, `"per_turn"`, `"per_round"`, `"per_day"`, `"per_week"`?
- Does `ResourcePool` have optional `rechargeAmount?: number | string`?

## 2. Type Conformance — Feature Model (Phase 1.3)

- Does base `Feature` have `resourcePoolTemplates?: ResourcePoolTemplate[]`?
- Is `ResourcePoolTemplate` exported with fields: `poolId`, `label`, `maxPipelineId`, `defaultCurrent`, `resetCondition`, and optional `rechargeAmount?`?
- Does base `Feature` have `actionBudget?` with 6 optional numeric keys (standard, move, swift, immediate, free, full_round)?
- Does `activation.actionType` union include `"passive"` and `"reaction"` (10 values total)?
- Does `activation` have optional `triggerEvent?: string`?
- Does `activation` have optional `tieredResourceCosts?: ActivationTier[]`?
- Is `ActivationTier` exported with `label`, `targetPoolId`, `cost`, `grantedModifiers`?
- Does `ItemFeature` have the `"two_hands"` equipment slot value?
- Does `ItemFeature` have `psionicItemData?`? Is `PsionicItemType` a 5-value union? Is `PowerStoneEntry` exported with `powerId`, `manifesterLevel`, `usedUp`?
- Does `ItemFeature.weaponData` have optional `onCritDice?`? Is `OnCritDiceSpec` exported with `baseDiceFormula`, `damageType`, `scalesWithCritMultiplier`?
- Does `ItemFeature` have `metamagicEffect?` with 6-feat union and `maxSpellLevel: 3|6|9`?
- Does `ItemFeature` have `staffSpells?` with `chargeCost: 1|2|3|4|5`?
- Does `ItemFeature` have `wandSpell?` with `casterLevel: number` (plain, not enum) and optional `spellLevel?`?
- Does `ItemFeature` have `scrollSpells?` with required `spellLevel`, required `spellType: "arcane"|"divine"`?
- Does `ItemFeature` have `removalPrevention?` with `isCursed: true` discriminant and `removableBy` array?
- Does `ItemFeature` have `intelligentItemData?` (INT/WIS/CHA/egoScore, 9-value alignment, 3-value communication, senses)?
- Does `ItemFeature` have optional `isUnique?` and `artifactTier?`?
- Does `MagicFeature` have `discipline?: PsionicDiscipline` (6-value union, exported) and `displays?: PsionicDisplay[]` (5-value union, exported)?
- Does `AugmentationRule` have `effectDescription?: LocalizedString`?
- Does `FeatureChoice` have `choiceGrantedTagPrefix?: string`?

## 3. Type Conformance — Character & Campaign (Phase 1.4)

- Does `ActiveFeatureInstance` have `itemResourcePools?: Record<string, number>`?
- Does `ActiveFeatureInstance` have `ephemeral?: { isEphemeral: true; appliedAtRound?; sourceItemInstanceId?; durationHint? }`?
- Does `Character` have `minimumSkillRanks?: Record<ID, number>` (optional)?
- Does `Character` have `levelAdjustment: number` (default 0) and `xp: number` (default 0)?
- Does `Character` have all UI metadata fields: `campaignId`, `ownerId`, `isNPC`, `posterUrl`, `playerRealName`, `customSubtitle`?
- Is `LinkedEntity` serialization guard unidirectional (prevents circular back-references)?
- Does `CampaignSettings` have `variantRules: { vitalityWoundPoints: boolean; gestalt: boolean }`?
- Does `createDefaultCampaignSettings()` initialize `variantRules: { vitalityWoundPoints: false, gestalt: false }`?
- Does `Campaign` have `gmGlobalOverrides`, `enabledRuleSources`, `updatedAt`?

## 4. Math Parser (Phase 2.2)

- Are ALL special `@`-paths implemented per `ARCHITECTURE.md` §4.3: `@characterLevel`, `@eclForXp`, `@classLevels.<id>`, `@activeTags`, `@selection.<choiceId>`, `@constant.<id>`, `@master.classLevels.<id>`?
- Does `@eclForXp` return `characterLevel + levelAdjustment` (not just `characterLevel`)?
- Does `@characterLevel` exclude `levelAdjustment` (sum of `classLevels` only)?
- Are `|distance` and `|weight` pipes handled?
- Does an unresolved path return `0` and log a warning (not crash)?
- Is `CharacterContext` exported with an `eclForXp` field?

## 5. Logic Evaluator (Phase 2.3)

- Does it handle AND, OR, NOT, CONDITION node types recursively?
- Are all 8 `LogicOperator` values supported: `==`, `>=`, `<=`, `!=`, `includes`, `not_includes`, `has_tag`, `missing_tag`?
- Does it return `errorMessage` from failing CONDITION nodes?

## 6. Stacking Rules (Phase 2.4)

- Do `dodge`, `circumstance`, `synergy`, `untyped` stack additively?
- Does every other type keep only the highest value?
- Does `setAbsolute` override all other modifiers (last-set wins on ties)?
- Does `"damage_reduction"` have a SEPARATE pass from regular stacking?
  - Are DR modifiers grouped by sorted `drBypassTags` signature?
  - Within each group: is only the highest value kept (others go in `suppressedModifiers`)?
  - Do multiple groups coexist independently in `StackingResult.drEntries[]`?
  - Is `drEntries` absent/undefined when no `"damage_reduction"` modifiers exist?
  - Is `"damage_reduction"` excluded from the normal best-wins pass?
- Is `"inherent"` non-stacking within type (highest wins) but stacking with all other bonus types?
- Is `"max_dex_cap"` NOT handled in this function (it is intercepted in DAG Phase 3.5)?

## 7. Gestalt Rules (Phase 2.5)

- Does `src/lib/utils/gestaltRules.ts` export `computeGestaltBase()`, `groupBaseModifiersByClass()`, `GESTALT_AFFECTED_PIPELINES`, `isGestaltAffectedPipeline()`?
- Does `computeGestaltBase()` apply max-per-level (not sum) when 2+ classes contribute?
- Is `GESTALT_AFFECTED_PIPELINES` exactly `{ "combatStats.bab", "saves.fort", "saves.ref", "saves.will" }` (NOT `combatStats.max_hp`)?

## 8. Dice Engine (Phase 2.6)

- Does `parseAndRoll()` have all 10 parameters (formula, pipeline, context, settings, rng, situationalModifiers, defenderAttackerMods, defenderFortificationPct, weaponOnCritDice, critMultiplier)?
- Does it accept an injectable `rng` parameter for deterministic tests?
- Does it handle Exploding 20s (recursive while loop)?
- Is `DamageTargetPool` exported as `"res_hp" | "res_vitality" | "res_wound_points"`?
- Does `RollResult` have required `targetPool: DamageTargetPool`?
- Does `RollContext` have optional `isCriticalHit?: boolean`?
- V/WP routing: `vitalityWoundPoints: false` → always `"res_hp"`; `true` + normal hit → `"res_vitality"`; `true` + confirmed crit → `"res_wound_points"`; `context.isCriticalHit: true` on separate damage roll → `"res_wound_points"` regardless?
- Attacker mods: does `resolveAttackerMods()` strip `"attacker."` prefix before pipeline comparison? Does it correctly skip non-matching pipelines? Is `attackerPenaltiesApplied` ABSENT (not `[]`) when no penalties apply? Is the defender's `totalBonus` unchanged?
- Fortification: when `defenderFortificationPct > 0` and crit confirmed, is a d100 rolled? Is `critNegated: true` when roll ≤ pct? Is fortification-negated crit routed to `"res_vitality"` in V/WP mode? Is `RollResult.fortification` absent when pct = 0?
- On-crit burst dice: when `weaponOnCritDice` provided and crit is confirmed and NOT fort-negated: is `baseDiceFormula` parsed? Is dice count scaled by `(critMultiplier − 1)` when `scalesWithCritMultiplier: true`? Is rolled amount added to `finalTotal`? Is `onCritDiceRolled` absent when no crit or fort-negated?

## 9. DAG Resolution (Phase 3)

- Are phases implemented as sequential `$derived` runes (Phase 0 → 1 → 2 → 3 → 4 → 4b)?
- Phase 0: Does it check `prerequisitesNode` (Logic Evaluator), `forbiddenTags`, `classLevel` gating from `levelProgression`? Does it apply the full override chain (rule files → `gmGlobalOverrides` → `gmOverrides`)? Does `#computeActiveTags()` emit `<choiceGrantedTagPrefix><selectedId>` for each FeatureChoice selection?
- Phase 0: Is `phase0_characterLevel` computed as `Object.values(classLevels).reduce()` (excludes `levelAdjustment`)?
- Phase 0: Is `phase0_eclForXp` computed as `phase0_characterLevel + (character.levelAdjustment ?? 0)`?
- Phase 0: Is `eclForXp` exposed in the `CharacterContext` snapshot for the Math Parser to resolve `@eclForXp`?
- Phase 2: Is `derivedModifier = floor((totalValue − 10) / 2)` computed for the 6 ability scores?
- Phase 3: Is `max_hp` calculated using `phase0_characterLevel` (NOT `eclForXp`)?
- Phase 3: Does the `combatStats.max_dex_bonus` special case execute BEFORE the general stacking loop? Does it separate `"max_dex_cap"` modifiers and apply `Math.min(...)` as `effectiveBaseValue`?
- Phase 4: Does it auto-generate synergy modifiers from the skill synergies config table?
- Are modifiers with `situationalContext` routed to `situationalModifiers` (not `activeModifiers`)?
- Is there a depth counter for infinite loop detection (cuts at 3 re-evaluations)?
- Gestalt (Phase 3.7): when `gestalt: true`, does Phase 3 call `computeGestaltBase()` for BAB and saves? Does HP remain additive regardless?

## 10. Default Pipelines (Phase 3.1)

- Is `combatStats.fortification` initialized with `baseValue: 0`?
- Is `combatStats.arcane_spell_failure` initialized with `baseValue: 0`?
- Is `combatStats.max_dex_bonus` initialized with `baseValue: 99` (uncapped by default)?
- Are equipment slot pipelines present with correct defaults (`slots.ring = 2`, `slots.head = 1`, etc.)?

## 11. Resource Pool & Action Methods (Phase 3.7)

- Are all tick/rest methods present: `triggerTurnTick()`, `triggerRoundTick()`, `triggerEncounterReset()`, `triggerShortRest()`, `triggerLongRest()`, `triggerDawnReset()`, `triggerWeeklyReset()`?
- Does `triggerTurnTick()` apply `rechargeAmount` ONLY to `"per_turn"` pools?
- Does `triggerRoundTick()` apply ONLY to `"per_round"` pools?
- Does `triggerLongRest()` reset BOTH `"long_rest"` AND `"short_rest"` pools?
- Does `triggerDawnReset()` call `#resetItemPoolsByCondition("per_day")`?
- Does `triggerWeeklyReset()` call `#resetItemPoolsByCondition("per_week")`?
- Is `rechargeAmount` resolved via Math Parser when it is a formula string?
- Is `initItemResourcePools()` idempotent (never overwrites existing values, even 0)?
- Does `spendItemPoolCharge()` floor at 0?
- Does `activateWithTier()` return `null` (not throw) for: out-of-range index, missing feature, missing pool, insufficient charges?
- Does `getReactionFeaturesByTrigger()` exclude `"passive"` features and inactive instances?
- Does `consumeItem()` atomically push ephemeral instance then remove source? Returns `null` for non-consumable?
- Does `expireEffect()` refuse to remove non-ephemeral instances (safety guard)?
- Does `removeFeature()` block cursed items (`removalPrevention.isCursed === true`) and log a warning?
- Does `tryRemoveCursedItem()` return `true`/`false`/`null` correctly?

## 12. Leveling Analytics (Phase 3.8)

- Does `phase4_featSlots` compute `1 + floor(@characterLevel / 3)` correctly?
- Does `phase4_skillPointsBudget` compute each class independently: `max(1, spPerLevel + intMod) × classLevel`?
- Is the first class (JS key insertion order) the ONLY one receiving the 4× first-level bonus (`3 × max(1, spPerLevel + intMod)` added)?
- Are racial/feat bonus SP applied per total character level (not per class level)?
- Are `ClassSkillPointsEntry` and `SkillPointsBudget` types exported?
- Does `setSkillRanks()` clamp to `max(minimumSkillRanks?.[skillId] ?? 0, 0)`?
- Does `lockSkillRanksMin()` apply max-merge (never lowers the floor)?
- Is `phase4_levelingJournal` derived? Are `LevelingJournalClassEntry` and `LevelingJournal` exported?

## 13. DataLoader & Merge Engine (Phase 4.2)

- Does it scan `static/rules/` recursively in alphabetical order?
- Does it filter entities by `enabledRuleSources`?
- Does it distinguish `Feature` entities (`id` + `category`) from config tables (`tableId`)?
- Partial merge: does it append arrays, merge `levelProgression` by level, merge `choices` by `choiceId`?
- Does `-prefix` deletion work in arrays?
- Is the resolution chain: rule files (last wins) → `gmGlobalOverrides` → `gmOverrides`?
- Are config tables always replaced entirely (no partial merge)?

## 14. Test UI (Phase 5)

- Does mock data cover: race with modifiers, class with `levelProgression`, armor with `"max_dex_cap"` modifier, condition, Orc enemy with `"attacker.*"` modifier?
- Does the override test file test both `merge: "partial"` and `merge: "replace"` with `-prefix` deletions?
- Does the test prove situational modifiers apply only at roll time?
- Does the test prove Exploding 20s works correctly?
- Does the test prove V/WP mode routes damage to the correct pool?
- Does the test prove the Orc's attacker modifier penalizes the attacker?

## 15. General Quality

- Are ALL comments in English?
- Are comments exhaustive and educational (explaining D&D 3.5 specifics)?
- Is there any hardcoded D&D term (class name, race name, stat name) in TypeScript or Svelte logic?
- Are there any unresolved imports, dangling functions, or TypeScript compilation errors?

---

Output format: A numbered markdown checklist. For each issue:
- [ ] **[CRITICAL/MAJOR/MINOR]** `path/to/file.ts:lineNumber` — Description and what the architecture requires. Reference the specific ARCHITECTURE.md section.

If no issues found in a category: "✅ [Category]: No issues found."
```

---

## Checkpoint #2 — UI Layer Conformance

**Prerequisites:** Phases 1–13 must be complete.

```markdown
You are a senior code reviewer specializing in Svelte 5 components and UI architecture.

I have attached `ARCHITECTURE.md`, `ANNEXES.md`, and all source files produced during Phases 6 through 13. Phases 1–5 have already been reviewed.

Your job is to verify the UI layer is **strictly "dumb"** (no game logic in .svelte files) and all components correctly interface with the GameEngine. Do NOT rewrite code. Produce a **numbered checklist of issues**.

---

## 1. Zero Game Logic in Svelte Files

Scan ALL `.svelte` files in `src/routes/` and `src/lib/components/`. Flag ANY file containing:
- Mathematical calculations (floor, ceil, addition of modifiers)
- Stacking rule logic
- Prerequisite evaluation
- Direct manipulation of pipeline values
All game logic MUST reside in `GameEngine.svelte.ts` or utility functions.

## 2. Zero Hardcoding Check

Scan ALL `.svelte` and `.ts` files for hardcoded D&D terms (class names, race names, stat names, item names, spell names) in logic or templates. Display text must come from `LocalizedString` via `t()` or from Feature JSON data.

## 3. Campaign & Session (Phase 6)

- Does `SessionContext.svelte.ts` expose `currentUserId`, `isGameMaster`, `activeCampaignId`?
- Is it designed as a drop-in replacement for PHP-backed auth?
- Does the Campaign Hub hide "Create Campaign" for non-GMs?

## 4. Character Vault (Phase 7)

- Does `visibleCharacters` implement all 3 rules (campaign filter, GM sees all, player sees own + LinkedEntities)?
- Does `CharacterCard` apply subtitle priority: `customSubtitle` → Race label (NPC) → `playerRealName` (PC)?
- Does the level badge compute from `Object.values(classLevels).reduce()`?

## 5. Core Tab (Phase 8)

- Are Phase 8 components read-only summaries only (not full editors)?
- Do Race/Class dropdowns trigger `ActiveFeatureInstance` creation in GameEngine (not local state)?
- Does FeatureChoice handling use `optionsQuery` to fetch from DataLoader?
- Does `FeatureModal` fetch from DataLoader and display all required fields (description, prerequisites, modifiers, granted features)?

## 6. Abilities Tab (Phase 9)

- Does `PointBuyModal` read `pointBuyBudget` from `CampaignSettings` and costs from config table?
- Does `RollStatsModal` respect `rerollOnes` from `CampaignSettings`?
- Does `SkillsMatrix` call `engine.setSkillRanks()` directly (not local state)?
- Do synergy bonuses appear in the Modifier Breakdown Modal?
- Does `SkillsMatrix` use `engine.phase4_skillPointsBudget.totalAvailable` for budget (not a manually computed value)?
- Does the "Min" badge appear when `minimumRanks > 0`?
- Is the "Journal" button present and functional?

## 7. Combat Tab (Phase 10)

- Does HealthAndXP deplete temporary HP first when taking damage?
- Does the XP bar use `@eclForXp` (not `@characterLevel`) for threshold lookup? (Required for monster PCs with LA > 0.)
- Do the 3 AC pipelines read from separate `combatStats` entries?
- Is the effective DEX to AC computed as `min(dexMod, combatStats.max_dex_bonus.totalValue)`?
- Does the weapons dropdown read from inventory (not a hardcoded list)?
- Does `ActionBudgetBar` collect all active features with `actionBudget`, compute min-wins per category, and use XOR for `action_budget_xor` tag?
- Are action buttons disabled/greyed when budget = 0 or count reached?
- Is a source-condition tooltip shown on disabled action buttons?
- Does `EphemeralEffectsPanel` show all active ephemeral effects? Is "Expire" a two-click confirmation?
- Does the DR panel render `drEntries` from `StackingResult`, showing suppressed DRs with strikethrough?
- Does the Fortification/ASF display read from `combatStats.fortification` and `combatStats.arcane_spell_failure` pipelines?

## 8. Feats Tab (Phase 11)

- Does feat slot count use `engine.phase4_featSlots.$derived` (not a hardcoded formula in .svelte)?
- Does prerequisite UI show failing `errorMessage`s in red (from Logic Evaluator)?
- Are granted feats (from class/race) displayed as read-only (no Delete button)?

## 9. Spells & Powers Tab (Phase 12)

- Does the Grimoire filter by `spellLists` and class level?
- Does Spell Save DC compute as `10 + spell level + key ability mod`?
- Does the psionic discipline tab bar appear for psionic characters?
- Does each power show `displays` badges with suppress-DC tooltip?
- Does the augmentation picker show `effectDescription` for qualitative augmentations (empty `grantedModifiers`)?
- Does a metamagic rod with `metamagicEffect` appear as a casting option for eligible spells?
- Does staff casting show per-spell charge costs from `staffSpells` array?
- Does wand casting use the item's `casterLevel`, not the wielder's?
- Does scroll casting enforce the `spellType` restriction and compute CL check DC correctly?

## 10. Inventory Tab (Phase 13)

- Does equipping a `two_hands` item check both `main_hand` and `off_hand` slots?
- Are encumbrance thresholds loaded from `config_carrying_capacity` (not hardcoded)?
- Does exceeding Medium load dispatch a `condition_encumbered` feature to the engine?
- Is coin weight calculated at 50 coins = 1 lb?
- Does `PsionicItemCard` correctly render per-type UI for all 5 psionic item types?
- Does the Brainburn warning display when wielder ML < power stone entry ML?
- Does the 20-tattoo limit block equipping additional psionic tattoos?
- Does the cursed item display prevent the Unequip button from appearing?

## 11. Navigation & Routes

- Do all routes match `ARCHITECTURE.md` §20?
- Does `/character/[id]` use `?tab=` query parameter (not sub-routes)?
- Are `/campaigns/[id]/settings` and `/campaigns/[id]/gm-dashboard` GM-only with navigation guards?

---

Output format: A numbered markdown checklist. For each issue:
- [ ] **[CRITICAL/MAJOR/MINOR]** `path/to/file.svelte:lineNumber` — Description. Reference the specific ARCHITECTURE.md section.

If no issues found in a category: "✅ [Category]: No issues found."
```

---

## Checkpoint #3 — Backend & GM Tools

**Prerequisites:** Phases 1–15 must be complete.

```markdown
You are a senior code reviewer specializing in PHP security, REST API design, and SQLite.

I have attached `ARCHITECTURE.md`, all PHP files under `/api/`, the frontend `StorageManager.ts` (Phase 14.6), and all GM Tools UI files from Phase 15.

Your job is to verify security, data integrity, and correct implementation of the visibility/override system. Do NOT rewrite code. Produce a **numbered checklist of issues**.

---

## 1. Authentication & Security (Phase 14.2–14.3)

- Does login verify against bcrypt hashes (not plaintext)?
- Does `requireAuth()` return 401 for unauthenticated requests on ALL protected endpoints?
- Are CORS headers configurable (not hardcoded to `*`)?
- Is CSRF protection implemented on POST/PUT/DELETE?
- Are there any SQL injection vulnerabilities? (All queries must use PDO prepared statements.)
- Is the SQLite database file stored outside the web root in production?

## 2. Database Schema (Phase 14.4)

- Does the `characters` table have both `character_json` AND `gm_overrides_json` as separate TEXT fields?
- Does `campaigns` have `gm_global_overrides_text`, `enabled_rule_sources_json`, and `updated_at`?
- Are `updated_at` fields updated on every relevant modification?

## 3. Visibility Rules (Phase 14.5)

- `GET /api/characters?campaignId=X` — for a non-GM: only own characters returned? `gmOverrides` merged invisibly (player cannot see raw overrides)?
- `GET /api/characters?campaignId=X` — for a GM: all characters returned with raw `gm_overrides_json` as separate field?
- `PUT /api/characters/{id}`: verifies ownership OR GM status?
- `PUT /api/characters/{id}/gm-overrides`: GM only?
- `DELETE /api/characters/{id}`: verifies ownership OR GM status?

## 4. Sync Mechanism (Phase 14.6)

- Does `GET /api/campaigns/{id}/sync-status` return both `campaignUpdatedAt` and per-character timestamps?
- Does the frontend compare timestamps and only re-fetch changed data?
- Is auto-save debounced (at least 2 seconds)?
- Is there a localStorage fallback when API is unreachable?

## 5. GM Override System (Phase 15)

- Does the GM textarea accept BOTH Feature objects (`id` + `category`) AND config table objects (`tableId`)?
- Does the JSON validator highlight syntax errors with line numbers?
- Is the override resolution chain correct: rule files → GM global → GM per-character?
- Does the GM Entity Dashboard show a read-only character summary before the override textarea?

## 6. Proxy Configuration (Phase 14.7)

- Does `vite.config.ts` proxy `/api` to the PHP dev server?
- Is the proxy target configurable (not hardcoded)?

## 7. Rule Source Discovery

- Does the PHP backend (or Vite endpoint) scan `static/rules/` recursively in alphabetical order?
- Is the sorted list of available source files accessible to the frontend?

---

Output format: A numbered markdown checklist. For each issue:
- [ ] **[CRITICAL/MAJOR/MINOR]** `path/to/file:lineNumber` — Description and what the architecture requires.

If no issues found in a category: "✅ [Category]: No issues found."
```

---

## Checkpoint #4 — Test Suite Exhaustiveness

**Prerequisites:** Phases 1–17 must be complete.

```markdown
You are a senior QA engineer specializing in PHPUnit and Vitest testing for complex rule engines.

I have attached `ARCHITECTURE.md`, `ANNEXES.md`, all source code, and all test files (PHPUnit under `tests/`, Vitest under `src/tests/`).

Your job is to verify the test suite is **exhaustive** relative to the architecture. Do NOT write tests. Produce a **numbered checklist of missing or inadequate test cases**.

---

## 1. PHPUnit Tests (Phase 16)

- **16.2 Persistence**: Do tests verify deeply nested JSON (activeFeatures with selections, classLevels, gmOverrides) survives save/load without corruption?
- **16.3 Visibility**: Is there a test where a non-GM fetches another player's character and gets 403?
- **16.4 Auth**: Is there a test for login with wrong password? For accessing protected endpoint without session?
- **16.5 GM Overrides**: Is there a test verifying a player receives merged data (raw gmOverrides not visible)? And a GM receiving both base data and raw overrides separately?
- **16.6 Sync**: Does a test verify `updated_at` changes when GM overrides are modified (not just player edits)?

## 2. Vitest — Math Parser (Phase 17.1)

- Is `@characterLevel` tested?
- Is `@classLevels.<classId>` tested?
- Is `@selection.<choiceId>` tested?
- Is `|distance` pipe tested with both "en" and "fr" locales?
- Is `|weight` pipe tested?
- Is an unresolved path tested (returns 0, no crash)?
- Is `@eclForXp` vs `@characterLevel` distinction tested (LA > 0 gives different values)?

## 3. Vitest — Logic Evaluator (Phase 17.2)

- Is a deeply nested AND > OR > NOT > CONDITION tree tested?
- Is `has_tag` tested on `@activeTags`?
- Is `missing_tag` tested?
- Is `choiceGrantedTagPrefix` sub-tag emission tested (does `has_tag: "feat_weapon_focus_sword_longsword"` match after selection)?
- Is `errorMessage` returned from the failing CONDITION node?
- Is an OR node tested where first condition fails but second succeeds?

## 4. Vitest — Stacking Rules (Phase 17.3)

- Are all 4 stackable types tested (dodge, circumstance, synergy, untyped)?
- Is `setAbsolute` tested (overrides all other modifiers)?
- Are two conflicting `setAbsolute` modifiers tested (last wins)?
- Is a negative modifier (penalty) tested?
- DR best-wins: two DR/magic with different amounts → highest wins, lower suppressed?
- DR coexistence: DR/magic and DR/silver as separate `drEntries`?
- DR empty bypass: DR/— (empty `[]`) is its own group?
- DR sort consistency: `["silver","magic"]` equals `["magic","silver"]` (same group)?
- Do DR modifiers NOT affect `totalBonus`?
- Is `drEntries` absent when no `"damage_reduction"` modifiers exist?
- `"inherent"` within-type best-wins (two inherent → only highest)?
- `"inherent"` cross-type stacking (inherent + enhancement both apply)?
- Weaker inherent appears in `suppressedModifiers`?

## 5. Vitest — Dice Engine (Phase 17.4)

- Is the injectable `rng` used in ALL dice tests (no random results)?
- Is Exploding 20s tested with forced rolls `[20, 20, 5]`?
- Is natural 20 (`isAutomaticHit`) and natural 1 (`isAutomaticMiss`) tested?
- Is a weapon crit range (e.g. 19–20) tested for `isCriticalThreat`?
- V/WP: standard mode → `"res_hp"` always?
- V/WP: V/WP mode + normal hit → `"res_vitality"`?
- V/WP: V/WP mode + `isCriticalThreat: true` (nat 20 on d20) → `"res_wound_points"`?
- V/WP: `context.isCriticalHit: true` on separate damage roll → `"res_wound_points"`?
- Attacker mods: penalty applied to `finalTotal`? Wrong-pipeline excluded? `attackerPenaltiesApplied` absent (not `[]`) on no match? Defender `totalBonus` unchanged?
- Fortification: `pct=0` → `fortification` field absent? Non-crit → no check? Boundary `roll=pct` → `critNegated: true`? `roll=pct+1` → `false`? `pct=100` → always negated? V/WP: negated → `"res_vitality"`, non-negated → `"res_wound_points"`?
- On-crit burst: ×2 scale → 1 die, ×3 → 2 dice, ×4 → 3 dice? `scalesWithCritMultiplier: false` → always 1 die? `totalAdded` included in `finalTotal`? Fort-negated → no burst? Malformed formula → no crash? `"d10"` (no count prefix) parsed as 1d10?

## 6. Vitest — DAG Integration (Phase 17.5)

- Belt of CON +2 cascade: does injecting it update `stat_con` → Fort save → `max_hp`?
- Formula-as-value: does `"@attributes.stat_wis.derivedModifier"` on Monk AC bonus work?
- `forbiddenTags`: does a feature with a conflicting `forbiddenTag` get excluded?
- `conditionNode` on modifier: does the conditional modifier apply only when its condition is met?
- Dual-gated modifier (both `conditionNode` AND `situationalContext`): applies only when BOTH match?
- Synergy auto-generation: does 5+ ranks in one skill generate the synergy modifier for another?
- Circular dependency guard: does injecting a feature that grants +1 CON based on Max HP not crash the engine?

## 7. Vitest — Multiclass & Level Progression (Phase 17.6)

- Is `characterLevel` sum tested for a multiclass character?
- Is BAB from multiple classes tested (full BAB + half BAB contributions)?
- Is level-gated feature granting tested (granted at level X, not X−1)?
- Is `@eclForXp` tested for a monster PC with `levelAdjustment > 0` (e.g. Drow Rogue 3 LA+2 → `eclForXp = 5`)?
- Is `@characterLevel` verified to return 3 for the same character (not 5)?
- Is `@eclForXp === @characterLevel` verified for standard PCs with `levelAdjustment = 0`?

## 8. Vitest — Merge Engine (Phase 17.7)

- Full replace tested?
- Partial merge (array append) tested?
- `-prefix` deletion tested?
- `levelProgression` merge-by-level tested?
- `choices` merge-by-`choiceId` tested?
- Full 3-layer resolution chain (base → GM global → GM per-character) tested?
- Config table replacement (same `tableId` from different sources) tested?

## 9. Vitest — Engine Enhancement Tests (Phase 17.8)

- `resourcePool.test.ts`: all 8 `resetCondition` values represented? `triggerDawnReset` resets only `"per_day"` (not `"per_week"`, `"long_rest"`, `"never"`)? `triggerWeeklyReset` resets only `"per_week"`?
- `itemResourcePools.test.ts`: `initItemResourcePools` idempotency (never resets existing 0-valued pool)? `spendItemPoolCharge` floors at 0? Cross-instance independence (2 rings = 2 pools)? Stashed instance (`isActive: false`) excluded from reset?
- `tieredActivation.test.ts`: charge deduction per tier (0/1/2)? Tier-specific `grantedModifiers` returned? Out-of-range → `null`? Insufficient charges → `null`? `null` never throws?
- `triggerActivation.test.ts`: matching `"reaction"` features returned? `"passive"` features excluded (even with `triggerEvent` set)? Inactive instances excluded?
- `ephemeralEffects.test.ts`: `consumeItem()` removes source, creates ephemeral instance? Non-consumable → `null`? `expireEffect()` blocks non-ephemeral? `getEphemeralEffects()` sorted newest-round-first?
- `inherentBonus.test.ts`: two inherent mods → only highest? Inherent + enhancement → both apply? Weaker in `suppressedModifiers`?
- `metamagicRods.test.ts`: all 6 feat values compile? All 3 `maxSpellLevel` values (3/6/9) compile?
- `staffSpells.test.ts`: `chargeCost: 1|2|3|4|5` all valid? Coexists with `resourcePoolTemplates`?
- `wandSpell.test.ts`: `casterLevel` is plain `number`? `spellLevel` supported for heightened wands? 5 Magic Missile CL variants representable as distinct items?
- `scrollSpells.test.ts`: `spellType` is strict `"arcane"|"divine"` (not plain string)? `spellLevel` REQUIRED per entry? CL check DC = `casterLevel + 1`? Arcane/divine restriction enforced?
- `cursedItemRemoval.test.ts`: `removeFeature()` blocks cursed, allows non-cursed? Logs warning? `tryRemoveCursedItem()` returns true/false/null correctly? `consumeItem`/`expireEffect` unaffected?
- `intelligentItems.test.ts`: all 9 alignment values valid? All 3 communication values? `egoScore` stored pre-computed?
- `augmentationRule.test.ts`: `effectDescription` optional (backward compat)? Qualitative augmentation (empty `grantedModifiers`) compiles? CastingPanel fallback: `effectDescription` wins over `sourceName`?
- `maxDexBonus.test.ts`: no armor → totalValue = 99? Single `"max_dex_cap"` mod applied? Mithral untyped +2 adds to cap? Multiple caps → minimum wins? Mithral + full plate (2 cap) → totalValue = 4?

## 10. Missing Test Categories

Flag any engine feature with NO corresponding test:
- `forbiddenTags` conflict detection
- `conditionNode` on modifiers
- Dual-gated modifiers (conditionNode + situationalContext)
- Formula-as-value strings (e.g. `"@attributes.stat_wis.derivedModifier"`)
- `setAbsolute` with string values (e.g. Monk unarmed damage `"1d8"`)
- Skill synergy auto-generation
- `classSkills` union across multiple active classes

---

Output format: A numbered markdown checklist. For each issue:
- [ ] **[CRITICAL/MAJOR/MINOR]** `path/to/file.ts:lineNumber` — Description and what the architecture requires.

If no issues found in a category: "✅ [Category]: No issues found."
```

---

## Checkpoint #5 — Tooling & DX

**Prerequisites:** Phase 18 must be complete (Phases 1–17 already reviewed).

```markdown
You are a senior DevOps/DX engineer specializing in build pipelines, containerization, and IDE integration.

I have attached all tooling files produced during Phase 18: `scripts/build.sh`, `scripts/build-docker.sh`, `scripts/php-dev.sh`, `run.sh`, `run-docker.sh`, `Dockerfile`, `docker-compose.yml`, `.vscode/launch.json`, `.vscode/tasks.json`, `.vscode/extensions.json`, `.env.example`, `api/config.php`. The application code (Phases 1–17) is already reviewed and stable.

Your job is to verify the tooling is **correct, portable, secure, and well-documented**. Do NOT rewrite code. Produce a **numbered checklist of issues**.

---

## 1. Build Pipeline — Native (`scripts/build.sh`)

- Does it bootstrap portable tools in `.build-tools/` without requiring global installs?
- Does it execute in the correct order: deps → type-check → Vitest → PHPUnit → Vite build → artifact assembly → tarball?
- Does the artifact include: SvelteKit build, PHP API, static rules, `.htaccess`, VERSION file?
- Do `--skip-tests`, `--deploy`, `--output`, `--tag`, `--no-clean`, `--env` flags work correctly?
- Is the tarball correctly structured for shared PHP hosting?

## 2. Build Pipeline — Docker (`Dockerfile` + `docker-compose.yml` + `scripts/build-docker.sh`)

- Does the Dockerfile use proper multi-stage build (separate stages for deps, check, test, build, artifact)?
- Are Node.js and PHP versions pinnable via build arguments?
- Does `docker-compose.yml` correctly pass through `APP_VERSION`, `OUTPUT_DIR`?
- Does `build-docker.sh` detect Docker/docker-compose availability with clear errors?
- Is BuildKit cache configured? Does `--no-cache` propagate?

## 3. Local Run Scripts

- **`run.sh`**: Auto-locates artifact? Resolves PHP binary? Loads `.env` with priority? Writes PHP router? Auto-runs migrations on first launch? Supports `--port`, `--dir`, `--env-file`?
- **`run-docker.sh`**: Minimal Apache+PHP image? Mounts artifact read-only? DB volume persists? Supports `--port`, `--dir`, `--env-file`, `--no-cache`?
- Do both handle missing dependencies gracefully with clear error messages?

## 4. VS Code Debug Configurations (`.vscode/launch.json`)

- Are Chrome, Edge, Firefox frontend configs present (port 5173)?
- Is PHP/Xdebug backend config present (port 9003)?
- Are compound full-stack configs present?
- Do compound configs start Vite and PHP as `preLaunchTask`?
- Does PHP config use `scripts/php-dev.sh` as runtime?
- Are path mappings correct for Xdebug?
- Is presentation grouping logical (fullstack → frontend → backend → tests → artifact)?

## 5. VS Code Tasks (`.vscode/tasks.json`)

- Are Vite and PHP server tasks configured with `isBackground: true` and `problemMatcher` for server readiness notification?
- Do task dependencies form a correct chain (compound debug → preLaunchTask → server tasks)?

## 6. PHP Binary Resolver (`scripts/php-dev.sh`)

- Is priority correct: `CHAR_VAULT_PHP` → Xdebug PHP (when `XDEBUG_MODE` set) → `.build-tools/bin/php` → system PHP ≥ 8.1?
- Does it warn clearly if Xdebug is requested but not found?
- Does it check PHP version ≥ 8.1?
- Are all arguments forwarded via `exec`?

## 7. Environment Variable Support

- Does `.env.example` document `APP_ENV`, `DB_PATH`, `CORS_ORIGIN` with clear descriptions?
- Does `api/config.php` implement priority: process env > .env file > built-in defaults?
- Does it never override existing process environment variables?
- Is `.env` in `.gitignore`? Is `.env.example` tracked?

## 8. `.gitignore` Completeness

- Are `dist/`, `dist-pkg/`, `.build-tools/`, `build/`, `.svelte-kit/`, `node_modules/`, `vendor/` excluded?
- Are `.env`, `*.sqlite*` excluded?

## 9. README Documentation

- Does the README cover: project structure, prerequisites, quick start, development, testing, VS Code debugging, building, running locally, env vars, production deployment?
- Are all CLI options documented?
- Is information accurate and consistent with the actual scripts?

## 10. Security

- Does `run.sh` bind to `localhost` by default (not `0.0.0.0`)?
- Does the PHP router in `run.sh` prevent directory traversal?

---

Output format: A numbered markdown checklist. For each issue:
- [ ] **[CRITICAL/MAJOR/MINOR]** `path/to/file:lineNumber` — Description and what is expected.

If no issues found in a category: "✅ [Category]: No issues found."
```

---

## Checkpoint #6 — UI Excellence

**Prerequisites:** Phase 19 must be complete (Phases 1–18 already reviewed).

```markdown
You are a senior UI/UX engineer specializing in Svelte 5, Tailwind CSS, responsive design, accessibility, and design systems.

I have attached `ARCHITECTURE.md`, `PROMPT.md` (Phase 19 spec), and all source files modified during Phase 19. The application (Phases 1–18) is already reviewed and stable. Phase 19 is the full UI overhaul.

Your job is to verify the UI meets **professional-grade quality standards** and correctly implements all Phase 19 requirements. Do NOT rewrite code. Produce a **numbered checklist of issues**.

---

## 1. Tailwind CSS Migration Completeness

- Are ALL scoped `<style>` blocks removed from migrated components (except animation keyframes or pseudo-element hacks that cannot be expressed in Tailwind)?
- Is there any remaining hardcoded CSS color value (hex, rgb) in `.svelte` files?
- Is `src/app.css` minimal (Tailwind directives + CSS custom properties + necessary `@apply` only)?
- Is the final CSS bundle purged of unused utilities?

## 2. Theme System

- Does `ThemeManager` support 3 states: `'system'`, `'light'`, `'dark'`?
- Is preference persisted in a cookie (`path=/`, `max-age=31536000`, `SameSite=Lax`)?
- Is there a synchronous script in `src/app.html` `<head>` applying `dark` class BEFORE first render (no FOWT)?
- Does `window.matchMedia('(prefers-color-scheme: dark)')` have a live change listener?
- Does `ThemeToggle` cycle System (Monitor) → Light (Sun) → Dark (Moon)?
- Are all theme-aware colors defined as CSS custom properties with separate light/dark values?
- Do both themes meet WCAG AA contrast (4.5:1 normal text, 3:1 large text)?

## 3. Lucide Icons

- Are ALL emoji characters removed from the codebase?
- Are icons imported as Svelte components (not raw SVG strings)?
- Are sizes consistent: 16px inline, 20px buttons/nav, 24px section headers?
- Do icons use `currentColor`?

## 4. Sidebar Navigation

- Desktop ≥1024px: default expanded (icon+label), collapsible to icon-only, state cookie-persisted?
- Tablet 768–1023px: icon-only default?
- Mobile <768px: hidden, opens as slide-in drawer with backdrop?
- Does active route receive accent highlight?

## 5. Character Sheet Full-Height Layout

- Does the character sheet occupy `100vh` minus sidebar/top-bar?
- Is the tab bar always visible (never scrolled out of view)?
- Does only the tab content area scroll (not the page)?
- Mobile: do tab labels hide, showing only icons?
- Desktop ≥1280px: does content area use multi-column grid?

## 6. Responsive Design

Test at: 320px, 375px, 414px, 768px, 1024px, 1280px, 1536px, 1920px.
- Is there any horizontal overflow at any breakpoint?
- Do grids collapse appropriately (3-col → 2-col → 1-col)?
- Does the Skills Matrix use a sticky first column with horizontal scroll on narrow viewports?
- Do large modals become full-screen sheets on mobile (<768px)?

## 7. Touch Adaptation

- Are ALL interactive elements (buttons, links, inputs, tabs, dropdown items) at least 44px tall on `pointer: coarse`?
- Are focus rings visible via `:focus-visible` (hidden for mouse users)?
- Does `prefers-reduced-motion: reduce` disable transitions/animations?

## 8. Design System Consistency

- Is the `.card` pattern consistent across ALL pages?
- Are button variants (Primary/Secondary/Danger/Ghost) consistent?
- Are inputs consistently styled with matching height and focus treatment?
- Are badges consistent (size, rounded, color variants)?
- Are section headers consistent (icon + uppercase label)?

## 9. Component Quality

- Does `Modal.svelte` support: backdrop close, Escape close, focus trap, smooth transitions, bottom sheet on mobile, configurable max-width?
- Does `HorizontalScroll.svelte` provide fade-out edge shadows and scroll-snap?
- Do all form inputs have proper labels or `aria-label`?

## 10. Zero Regressions

- Can a user complete the full flow: campaigns → vault → character sheet → all 6 tabs → back to vault?
- Are GM-exclusive pages still hidden from non-GM users?
- Does the `?tab=` query parameter work correctly?
- Are all modals (FeatureModal, DiceRollModal, ModifierBreakdown, FeatSelection, Grimoire) functional?

---

Output format: A numbered markdown checklist. For each issue:
- [ ] **[CRITICAL/MAJOR/MINOR]** `path/to/file.svelte:lineNumber` — Description and what Phase 19 requires.

If no issues found in a category: "✅ [Category]: No issues found."
```

---

## Checkpoint #7 — Leveling Progression

**Prerequisites:** Phase 20 must be complete (Phases 1–19 already reviewed).

```markdown
You are a senior game systems engineer specializing in D&D 3.5 SRD accuracy and Svelte 5 reactive engines.

I have attached `ARCHITECTURE.md` (including §9.8), `PROGRESS.md` (Phase 20 checked off), and all files modified in Phase 20: `SkillsMatrix.svelte`, `LevelingJournalModal.svelte`, `ui-strings.ts`, `multiclass.test.ts`, `characterBuildScenario.test.ts`.

The engine analytics (skill points budget, leveling journal derivations, skill rank locking) were implemented in Phase 3.8 and reviewed in Checkpoint #1. This checkpoint verifies the Phase 20 UI and test layer built on top of that engine.

Your job is to verify Phase 20 is **SRD-accurate** and correctly integrated. Do NOT rewrite code. Produce a **numbered checklist of issues**.

---

## 1. SkillsMatrix Update (Phase 20.1)

- Does `SkillsMatrix` use `engine.phase4_skillPointsBudget.totalAvailable` for budget display (not a manually computed value)?
- Is the rank input `min` attribute set to `getMinRanks(skill.id)` (not hardcoded to 0)?
- Does `handleRanksChange()` clamp to `[minRanks, maxRanks]` before calling `engine.setSkillRanks()`?
- Is a "Min" badge shown when `minimumRanks > 0` and current ranks equal the floor?
- Is the "Journal" button present and functional (sets `showJournal = true`)?

## 2. LevelingJournalModal (Phase 20.2)

- Is the overview table correct: one row per active class + bonus SP row + totals row?
- Does `formatSpFormula()` show the first-level bonus annotation when `firstLevelBonus > 0` (e.g. `(2+2)×3 + 12(×4 L1) = 24`)?
- Do class skill badges show active-status highlighting?
- Does the Lock button call `engine.lockAllSkillRanks()`?
- Does the Unlock button reset `engine.character.minimumSkillRanks = {}`?
- Does the XP penalty warning appear when any class is 2+ levels below the max active class level?
- Is the favored class correctly excluded from the penalty check?
- Is `isLockedRanks` derived correctly (any value in `minimumSkillRanks` > 0)?

## 3. i18n (Phase 20.3)

- Are all `journal.*` keys present with both `en` and `fr` translations?
- Are `skills.rank_locked`, `skills.rank_locked_tooltip`, `skills.journal_btn`, `skills.journal_tooltip` present?

## 4. Vitest — Per-Class SP Budget (Phase 20.4)

- Is `firstLevelBonus()` helper tested with INT floor (min 1/level)?
- Is the 4× first-level bonus applied ONLY to `isFirstClass: true` (0 for others)?
- Is the three-class multiclass scenario tested?
- Is the proof-of-broken-formula test present (shows old unified formula over-counts)?

## 5. Vitest — Minimum Rank Enforcement (Phase 20.5)

- Is `setSkillRanks` floor clamping tested (requested < floor → clamped to floor)?
- Is `lockSkillRanksMin` max-merge tested (existing min > current ranks → floor NOT lowered)?
- Is absent `minimumSkillRanks` tested (defaults to 0 = free editing)?
- Is cross-class skill cost (2 SP/rank) tested?

## 6. Vitest — Character Build Scenario (Phase 20.6)

- Does `characterBuildScenario.test.ts` cover Fighter 3 / Monk 3 / Psion 1 / Wizard 1 with STR 18/DEX 16/CON 17→19/INT 15/WIS 14/CHA 13?
- Is the SP total verified as **50 SP** (Fighter 24 + Monk 18 + Psion 4 + Wizard 4)?
- Is BAB (+5), saves (Fort +10 / Ref +7 / Will +10), HP (75), feat slots (5) verified?
- Is AC (15 unarmored + WIS Monk bonus) verified?
- Is PP (3) and Wizard spells/day (3/2) verified?
- Is multiclass XP penalty with favored-class exemption verified?
- Does the test count exceed 100 assertions?

## 7. SRD Accuracy Cross-Check

- Does the first-level bonus apply `4 × max(1, spPerLevel + intMod)` (not `4 × spPerLevel + intMod`)?
- Is INT retroactivity documented (current INT used for ALL previous levels per SRD)?
- Is the XP penalty boundary "2+ levels below highest" (not "1+ level below")?
- Is `floor((characterLevel + 3) / 2)` used for cross-class max ranks (not the unflored version)?

---

Output format: A numbered markdown checklist. For each issue:
- [ ] **[CRITICAL/MAJOR/MINOR]** `path/to/file.ts:lineNumber` — Description and what §9.6/SRD requires.

If no issues found in a category: "✅ [Category]: No issues found."
```

---

## Final Review — Complete System Validation

**Prerequisites:** All phases (1–20+) must be complete.

```markdown
You are a principal software architect performing a final acceptance review before v1.0 release.

I have attached:
1. `ARCHITECTURE.md` — complete engine specification
2. `ANNEXES.md` — JSON examples and configuration tables
3. `PROMPT.md` — the complete development checklist
4. `PROGRESS.md` — all tasks checked off
5. ALL source code files (TypeScript, Svelte, PHP)
6. ALL test files (Vitest + PHPUnit) — all tests passing

This is the FINAL review before release. It is comprehensive.

---

## Part A: Architecture Conformance (Full Sweep)

Walk through every section of `ARCHITECTURE.md` (§1–20) and verify the implementation:

1. **§1 (ECS Philosophy):** Are Features the only source of modifiers? Is GameEngine the only processing system?
2. **§2 (Primitives):** Do `ID`, `ModifierType` (all 23 values including "damage_reduction", "inherent", "max_dex_cap"), and `LogicOperator` match exactly?
3. **§3 (Logic Engine):** All 4 `LogicNode` types and all 8 `LogicOperator` values handled?
4. **§4 (Pipelines):** `Modifier`, `StatisticPipeline`, `SkillPipeline`, `ResourcePool` match? `derivedModifier` correct? `setAbsolute` behavior (§4.2)? All Math Parser paths (§4.3)? All 8 `resetCondition` values (§4.4)? `drBypassTags` (§4.5)? `attacker.*` prefix (§4.6)? Fortification (§4.7)? ASF (§4.8)? On-crit burst (§4.9)? Inherent bonuses (§4.10)? Metamagic rods (§4.11)? Staves (§4.12)? Wands (§4.13)? Scrolls (§4.14)? Cursed items (§4.15)? Intelligent items (§4.16)? Max DEX bonus (§4.17)?
5. **§5 (Features):** Complete `Feature`, `ItemFeature`, `MagicFeature`, `AugmentationRule`, `FeatureChoice` match? `classSkills` (§5.5)? `optionsQuery` parsing (§5.3)? `actionBudget` (§5.6)? Instance-scoped pools (§5.7)? Trigger-based activation (§5.5b)?
6. **§5.1.1 (Psionic items):** All 5 item types with correct field matrices?
7. **§5.2.1 (Psionic power fields):** `discipline` and `displays` present? `AugmentationRule.effectDescription` present?
8. **§6 (Character):** `Character` interface complete? `ActiveFeatureInstance` with `itemResourcePools` and `ephemeral`? `LinkedEntity` serialization guard?
9. **§7 (Campaign):** `Campaign` with `gmGlobalOverrides`, `enabledRuleSources`, `updatedAt`?
10. **§8 (Settings & Variants):** `variantRules.gestalt` and `variantRules.vitalityWoundPoints`? Gestalt (§8.1) and V/WP (§8.2) implementations correct?
11. **§9 (DAG):** All phases (0–4b) implemented in order? Gestalt Phase 3.7? Max DEX bonus intercept? Infinite loop detection? HP uses `characterLevel` not ECL?
12. **§10 (Examples A–H):** Can the engine resolve all examples? Especially Example F (Monk WIS AC formula-as-value) and Example H (Indomitable Will dual-gated modifier).
13. **§11–17 (i18n, Monsters, Environment, Epic, Psionics, Variants, Dice):** Structurally supported?
14. **§18 (Data Override Engine):** Complete resolution chain? Partial merge and `-prefix` deletion? Config table replacement? GM override layers?
15. **§19–20 (Polling, Routes):** Routes match §20? Polling (§19) implemented in `StorageManager`?

## Part B: Cross-Cutting Concerns

16. **Zero Hardcoding:** Scan ENTIRE codebase for hardcoded D&D terms in logic or templates (not comments or test fixtures).
17. **i18n Completeness:** Is every user-facing string either a `LocalizedString` via `t()` or derived from Feature JSON?
18. **Error Handling:** Does the engine handle gracefully: missing Feature JSON, unresolved formula paths, circular dependencies, invalid GM override JSON, network failures (offline mode)?
19. **TypeScript Strictness:** Any `any` types that should be narrower? Any unsafe `as` casts?
20. **PHP Security:** SQL injection vectors? Missing auth checks? GM data exposed to players?

## Part C: ANNEXES.md Compatibility

21. **Annex A:** Pick 3 diverse examples (one class, one item, one psionic power). Trace complete resolution through the engine. Verify every field is correctly processed.
22. **Annex B:** Verify all config tables (B.1–B.12: XP thresholds, carrying capacity, point buy costs, ability modifier table, base speed, skill synergies, standard array, size categories, multiclass XP penalty, bonus spells, TWF penalties, movement/encumbrance) are loadable via `getConfigTable(tableId)` and used where documented.

## Part D: Test Coverage Assessment

23. **Coverage Gaps:** List any architecture feature, edge case, or scenario from `ARCHITECTURE.md` or `ANNEXES.md` with NO corresponding test. Rank by risk.

## Part E: UI Excellence (Phase 19 Validation)

24. **Tailwind Migration:** All styling via Tailwind? No remaining scoped `<style>` blocks?
25. **Theme System:** Light/dark works with FOWT prevention and cookie persistence?
26. **Iconography:** All emoji replaced? Icon sizes consistent (16/20/24px)?
27. **Responsive Layout:** Works at 320px–1920px? Sidebar collapsible? Full-height character sheet?
28. **Touch & Accessibility:** Touch targets ≥44px on coarse pointer? Focus rings (`prefers-reduced-motion`)?
29. **Design Consistency:** Cards, buttons, inputs, badges, headers, modals all consistent?

---

Produce a structured report with 4 sections:

**🔴 CRITICAL ISSUES** (Must fix before release — incorrect behavior, security vulnerability, data corruption risk)

**🟡 MAJOR ISSUES** (Should fix — deviations from architecture, missing edge cases, incomplete implementations)

**🟢 MINOR ISSUES** (Nice to fix — code style, missing comments, non-blocking inconsistencies)

**✅ VALIDATION PASSED** (Categories that are fully conformant)

For each issue: file path, line reference, architecture section, and specific description of what's wrong vs. what's expected.
```
