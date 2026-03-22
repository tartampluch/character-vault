# Checkpoints

## Checkpoint Review #1 — After Phases 1-5 (Foundation + Engine + Test UI)

```markdown
You are a senior code reviewer specializing in TypeScript, Svelte 5, and data-driven ECS architectures.

I have attached the complete ARCHITECTURE.md document and all source files produced during Phases 1 through 5 of the project. The PROGRESS.md file shows which tasks have been completed.

Your job is to perform a **strict conformance review** of the codebase against the architecture document. Do NOT rewrite code. Instead, produce a **numbered checklist of issues** with file paths, line references, and severity (CRITICAL / MAJOR / MINOR).

Review the following aspects specifically:

### 1. Type Conformance (Phase 1 / 2.5a)
- Do the TypeScript interfaces in `src/lib/types/` exactly match the definitions in Architecture sections 2-8?
- Are `sourceId` and `sourceName` required (not optional) on every `Modifier`?
- Is `derivedModifier` present on `StatisticPipeline`?
- Does `Character` have `classLevels`, `gmOverrides`, and all UI metadata fields?
- Does `Character` have `levelAdjustment: number` (default 0) and `xp: number` (default 0) as per Architecture section 6 / Phase 1.5?
- Does `CampaignSettings` have a `variantRules: { vitalityWoundPoints: boolean; gestalt: boolean }` block per Architecture section 8.1 / Phase 2.5a–b?
- Does `createDefaultCampaignSettings()` initialize `variantRules: { vitalityWoundPoints: false, gestalt: false }`?
- Does `RollResult` have a required `targetPool: DamageTargetPool` field per Architecture section 8.3 / Phase 2.5b?
- Is `DamageTargetPool` exported from `diceEngine.ts` as `"res_hp" | "res_vitality" | "res_wound_points"`?
- Does `RollContext` have an optional `isCriticalHit?: boolean` field per Phase 2.5b?
- Does `ResourcePool.resetCondition` include ALL six values: `"long_rest"`, `"short_rest"`, `"encounter"`, `"never"`, `"per_turn"`, `"per_round"` per Architecture section 4.4 / Phase 1.6?
- Does `ResourcePool` have an optional `rechargeAmount?: number | string` field per Phase 1.6?
- Does `Campaign` have `gmGlobalOverrides`, `updatedAt`, `enabledRuleSources`, and `chapters`?
- Does `Feature` have `ruleSource`, `merge`, `levelProgression`, `classSkills`, `recommendedAttributes`, and `activation`?
- Does `ItemFeature` include the `two_hands` equipment slot?
- Does `MagicFeature` have `discipline?: PsionicDiscipline` with all 6 SRD discipline values per Architecture section 5.2.1 / Phase 1.3a?
- Does `MagicFeature` have `displays?: PsionicDisplay[]` with all 5 SRD display values per Architecture section 5.2.1 / Phase 1.3a?
- Are `PsionicDiscipline` and `PsionicDisplay` exported from `feature.ts` as typed unions (not plain `string`)?
- Are both fields `optional` (`undefined` for arcane/divine spells)?

### 1a. Type Conformance — Feature `actionBudget` (Phase 1.3c)
- Does the base `Feature` interface have an optional `actionBudget?: { standard?; move?; swift?; immediate?; free?; full_round? }` field per Architecture section 5.6 / Phase 1.3c?
- Are all six keys optional (`?`) with type `number`?
- Is `actionBudget` absent (`undefined`) on non-condition features (weapons, classes, etc.) by default?
- Does a feature with `actionBudget: {}` (empty) compile without error?
- Does a feature with `actionBudget: { standard: 0, move: 1, full_round: 0 }` match the Nauseated pattern from section 5.6?

### 1c. Type Conformance — ItemFeature Psionic Item Subtypes (Phase 1.3b)
- Is `PsionicItemType` a typed union of exactly 5 values: `"cognizance_crystal"`, `"dorje"`, `"power_stone"`, `"psicrown"`, `"psionic_tattoo"` per Architecture section 5.1.1 / Phase 1.3b?
- Is `PowerStoneEntry` an exported interface with `powerId: ID`, `manifesterLevel: number`, `usedUp: boolean`?
- Does `ItemFeature` have an optional `psionicItemData` block with the `psionicItemType` discriminant per section 5.1.1?
- Does `psionicItemData` include ALL ten sub-fields: `storedPP`, `maxPP`, `attuned`, `powerStored`, `charges`, `powersImprinted`, `powersKnown`, `manifesterLevel`, `activated`, and `psionicItemType`?
- Are ALL psionic item sub-fields optional (`?`) — only the discriminant `psionicItemType` is required within the block?
- For non-psionic items: does `psionicItemData` remain `undefined` without TypeScript error?
- Are `PsionicItemType` and `PowerStoneEntry` both exported from `src/lib/types/feature.ts`?

### 1d. Type Conformance — MagicFeature Psionic Fields (Phase 1.3a)
- Is `PsionicDiscipline` a typed union of exactly 6 values: `"clairsentience"`, `"metacreativity"`, `"psychokinesis"`, `"psychometabolism"`, `"psychoportation"`, `"telepathy"`?
- Is `PsionicDisplay` a typed union of exactly 5 values: `"auditory"`, `"material"`, `"mental"`, `"olfactory"`, `"visual"`?
- On a psionic `MagicFeature`: can `discipline` be `undefined` (optional) for non-psionic spells?
- On an arcane `MagicFeature`: does the TypeScript compiler accept `discipline: undefined` without error?
- Does the `school` field on psionic powers still function as a display/legacy string (not removed)?
- Are both `PsionicDiscipline` and `PsionicDisplay` exported from `src/lib/types/feature.ts`?

### 1e. Type Conformance — Modifier and ModifierType (Phase 2.4a)
- Does `ModifierType` include `"damage_reduction"` per Architecture section 4.5 / Phase 2.4a?
- Does `Modifier` have an optional `drBypassTags?: string[]` field per Phase 2.4a?
- Is `drBypassTags` documented as only meaningful when `type === "damage_reduction"`?

### 2. Math Parser (Phase 2.2)
- Does it handle all special paths listed in Architecture section 4.3 (`@characterLevel`, `@eclForXp`, `@classLevels.<id>`, `@activeTags`, `@selection.<choiceId>`, `@constant.<id>`, `@master.classLevels.<id>`)?
- Does `@eclForXp` correctly return `characterLevel + character.levelAdjustment` per Architecture section 4.3 and 6.4?
- Does `@characterLevel` correctly exclude `levelAdjustment` (returns class levels sum only)?
- Does it handle `|distance` and `|weight` pipes?
- Does it handle nested path resolution by splitting on `.`?
- Does it return `0` and log a warning for unresolved paths (not crash)?

### 3. Logic Evaluator (Phase 2.3)
- Does it handle AND, OR, NOT, and CONDITION nodes recursively?
- Does it support all LogicOperator values: `==`, `>=`, `<=`, `!=`, `includes`, `not_includes`, `has_tag`, `missing_tag`?
- Does it return `errorMessage` from failing CONDITION nodes?

### 4. Stacking Rules (Phase 2.4 / 2.4a)
- Does it correctly stack `dodge`, `circumstance`, `synergy`, and `untyped` (all stack)?
- Does it take only the highest for all other types?
- Does it handle `setAbsolute` correctly (overrides everything, last one wins)?
- Does `applyStackingRules()` handle `type: "damage_reduction"` modifiers as a SEPARATE pass from regular type stacking per Architecture section 4.5 / Phase 2.4a?
- Does it group DR modifiers by sorted `drBypassTags` signature (so `["silver","magic"]` and `["magic","silver"]` map to the same group)?
- Within each bypass group: does it keep only the HIGHEST DR value and suppress the rest?
- Do multiple groups with different bypass signatures coexist independently in `StackingResult.drEntries[]`?
- Does `StackingResult` include a `drEntries?: DREntry[]` field?
- Does each `DREntry` have `amount`, `bypassTags`, `sourceModifier`, and `suppressedModifiers`?
- Is `type: "damage_reduction"` excluded from the regular non-stacking pass (so it is NOT subject to the normal best-wins-for-same-type rule)?

### 5. Dice Engine (Phase 2.5)
- Does `parseAndRoll` match the signature in Architecture section 17?
- Does it accept an injectable `rng` parameter for testing?
- Does it handle Exploding 20s (recursive while loop)?
- Does it filter `situationalModifiers` by matching `situationalContext` against `RollContext.targetTags`?
- Does `RollResult` include `numberOfExplosions`?

### 5a. Vitality/Wound Points (Phase 2.5b)
- Does `parseAndRoll()` with `settings.variantRules.vitalityWoundPoints = false` return `targetPool = "res_hp"` for all rolls (standard mode)?
- Does `parseAndRoll()` with `vitalityWoundPoints = true` and a normal hit return `targetPool = "res_vitality"`?
- Does `parseAndRoll()` with `vitalityWoundPoints = true` and `isCriticalThreat = true` (forced natural 20 on d20) return `targetPool = "res_wound_points"`?
- Does `parseAndRoll()` with `vitalityWoundPoints = true` and `context.isCriticalHit = true` (separate damage roll for confirmed crit) return `targetPool = "res_wound_points"`, even when the damage roll itself has no d20 (non-crit dice)?
- Does a non-d20 damage roll (`"2d6"`) in standard mode return `targetPool = "res_hp"`?

### 5b. Gestalt Utility (Phase 2.5a)
- Does `src/lib/utils/gestaltRules.ts` export `computeGestaltBase(mods, classLevels, characterLevel)`?
- Does `computeGestaltBase()` return standard sum (not max) when only ONE class contributes?
- Does `computeGestaltBase()` apply max-per-level then sum when TWO+ classes contribute?
- Is `GESTALT_AFFECTED_PIPELINES` a Set containing `"combatStats.bab"`, `"saves.fort"`, `"saves.ref"`, `"saves.will"` (and NOT `"combatStats.max_hp"`)?
- Does `isGestaltAffectedPipeline()` return `true` for BAB/saves and `false` for HP and other pipelines?

### 6. DAG Resolution (Phase 3)
- Are the 5+ phases (0-4, plus Phase 0c/0c2) implemented as sequential `$derived` runes?
- Phase 0: Does it process both `activeFeatures` AND `gmOverrides`? Does it filter by `levelProgression` using `classLevels`? Does it check `prerequisitesNode` and `forbiddenTags`?
- Phase 0c: Is `phase0_characterLevel` computed as `Object.values(classLevels).reduce()` (excludes `levelAdjustment`)?
- Phase 0c2: Is `phase0_eclForXp` computed as `phase0_characterLevel + (character.levelAdjustment ?? 0)` per Architecture section 6.4 / Phase 3.5?
- Is `eclForXp` exposed in the `CharacterContext` snapshot (used by the Math Parser for `@eclForXp`)?
- Phase 2: Does it compute `derivedModifier` via `floor((totalValue - 10) / 2)` for the 6 ability scores only?
- Phase 3: Does the HP calculation use `phase0_characterLevel` (NOT `eclForXp`) for "CON mod × character level"?
- Phase 4: Does it auto-generate synergy modifiers from the skill synergies config table?
- Context sorting: Are modifiers with `situationalContext` routed to `situationalModifiers` instead of `activeModifiers`?
- Infinite loop detection: Is there a depth counter that cuts at 3 re-evaluations?
- **Gestalt Phase 3.7:** When `settings.variantRules.gestalt === true`, does Phase 3 call `computeGestaltBase()` for BAB and saves instead of passing all "base" mods to `applyStackingRules()`?
- Does gestalt mode leave HP calculation unaffected (still additive from hitDieResults)?
- Does gestalt mode leave non-"base" modifier types (enhancement, luck, morale, etc.) unaffected, still going to standard `applyStackingRules()`?
- Does Phase 3 correctly fall back to the standard (non-gestalt) path when `variantRules.gestalt === false`?

### 7. Resource Tick & Rest Methods (Phase 3.6)
- Are `triggerTurnTick()`, `triggerRoundTick()`, `triggerEncounterReset()`, `triggerShortRest()`, `triggerLongRest()` all present on the GameEngine as public methods per Architecture section 4.4 / Phase 3.6?
- Does `triggerTurnTick()` apply `rechargeAmount` ONLY to `"per_turn"` pools (not `"per_round"` or full-reset pools)?
- Does `triggerRoundTick()` apply `rechargeAmount` ONLY to `"per_round"` pools?
- Does each tick method cap `currentValue` at the effective max from `maxPipelineId`?
- Does `triggerLongRest()` reset BOTH `"long_rest"` AND `"short_rest"` pools (long rest includes short rest)?
- Is `rechargeAmount` resolved via the Math Parser when it is a formula string (not just a plain number)?
- Is `temporaryValue` (temporary HP) left unchanged by turn/round tick methods?
- Is `#getEffectiveMax()` looking up `maxPipelineId` across `attributes`, `combatStats`, and `saves`?

### 7. DataLoader & Merge Engine (Phase 4.2)
- Does it scan `static/rules/` recursively in alphabetical order?
- Does it filter entities by `enabledRuleSources`?
- Does it distinguish Features (`id` + `category`) from config tables (`tableId`)?
- Partial merge: Does it append arrays, merge `levelProgression` by level, merge `choices` by `choiceId`?
- Deletion: Does it handle the `-prefix` convention in arrays?
- Resolution chain: rule files → GM global overrides → GM per-character overrides?
- Config tables: Always replaced entirely (no partial merge)?

### 8. Test UI (Phase 5)
- Does the mock data cover: race, class with levelProgression, item, condition, and an Orc enemy?
- Does the override test file test both `merge: "partial"` and `merge: "replace"` with `-prefix` deletions?
- Does the test prove situational modifiers apply only at roll time?
- Does the test prove Exploding 20s work?

### 9. General Quality
- Are ALL comments in English?
- Are comments exhaustive and educational (explaining D&D 3.5 specifics)?
- Is there any hardcoded D&D term (class name, race name, stat name) in TypeScript or Svelte code?
- Are there any unresolved imports, dangling functions, or TypeScript compilation errors?

Output format: A numbered markdown checklist. For each issue:
- [ ] **[CRITICAL/MAJOR/MINOR]** `path/to/file.ts:lineNumber` — Description of the issue and what the architecture document requires instead. Reference the specific architecture section.

If no issues are found in a category, write: "✅ [Category]: No issues found."
```

---

## Checkpoint Review #2 — After Phases 6-13 (UI Construction)

```markdown
You are a senior code reviewer specializing in Svelte 5 components and UI architecture.

I have attached the complete ARCHITECTURE.md document and all source files produced during Phases 6 through 13 of the project. Phases 1-5 have already been reviewed and are stable.

Your job is to verify that the UI layer is **strictly "dumb"** (no game logic in .svelte files) and that all components correctly interface with the GameEngine. Do NOT rewrite code. Produce a **numbered checklist of issues**.

Review the following aspects specifically:

# 1. Zero Game Logic in Svelte Files
- Scan ALL `.svelte` files in `src/routes/` and `src/lib/components/`. Flag ANY file that contains:
  - Mathematical calculations (floor, ceil, addition of modifiers)
  - Stacking rule logic
  - Prerequisite evaluation
  - Direct manipulation of pipeline values
- All game logic MUST reside in `GameEngine.svelte.ts` or utility functions. Svelte components should only read `$derived` values and dispatch actions.

# 2. Zero Hardcoding Check
- Scan ALL `.svelte` and `.ts` files for hardcoded D&D terms. Flag ANY occurrence of specific class names ("Fighter", "Wizard"), race names ("Elf", "Human"), stat names ("Strength", "Dexterity"), item names ("Longsword"), or spell names in TypeScript logic or Svelte template logic (not in comments or test fixtures).
- All display text must come from `LocalizedString` via the `t()` formatter or from Feature JSON data.

# 3. Campaign & Session (Phase 6)
- Does `SessionContext.svelte.ts` expose `currentUserId`, `isGameMaster`, and `activeCampaignId`?
- Is it designed to be replaceable by a PHP-backed auth session later?
- Does the Campaign Hub (Phase 6.3) hide the "Create Campaign" button for non-GMs?

# 4. Character Vault (Phase 7)
- Does the visibility filter correctly implement all 3 rules (filter by campaign, GM sees all, player sees own + LinkedEntities)?
- Does the Character Card show `customSubtitle` → Race label (if NPC) → `playerRealName` (if PC) in that priority order?
- Does the Level Badge compute from `Object.values(classLevels).reduce()`?

# 5. Core Tab (Phase 8)
- Is Phase 8 read-only summaries only (not full editors)?
- Do dropdowns for Race/Class trigger `ActiveFeatureInstance` creation in the GameEngine (not local state)?
- Does `FeatureChoice` handling (Phase 8.4) use `optionsQuery` to fetch options from DataLoader?

# 6. Abilities Tab (Phase 9)
- Does the Point Buy modal read `pointBuyBudget` from `CampaignSettings` and costs from the config table?
- Does the Roll Stats modal respect `rerollOnes` from `CampaignSettings`?
- Does the Skills Matrix update `ranks` directly in the GameEngine (not local component state)?
- Do synergy bonuses appear in the Modifier Breakdown Modal?

# 7. Combat Tab (Phase 10)
- Does the HP system deplete temporary HP first when taking damage?
- Are XP thresholds loaded from the config table (not hardcoded)?
- Does the XP progress bar and Level Up button use `@eclForXp` (not `@characterLevel`) to look up the XP threshold in `config_xp_table`? (This ensures monster PCs with LA > 0 require more XP to level up per Architecture section 6.4.)
- Do the 3 AC pipelines (normal, touch, flat-footed) read from separate pipelines?
- Does the weapon dropdown read from inventory (not a hardcoded list)?
- Does the Combat Turn UI read all active features with `actionBudget` defined per Architecture section 5.6 / Phase 1.3c?
- Does the effective budget per category use MIN across all active budgets (most restrictive wins)?
- Are action buttons disabled/greyed when budget = 0 or when the per-turn count has reached the budget limit?
- Is the XOR "standard OR move not both" rule applied when a feature has `"action_budget_xor"` tag?
- Is a tooltip shown on restricted action buttons identifying the source condition?

# 8. Feats Tab (Phase 11)
- Does feat slot calculation use the formula `1 + floor(characterLevel / 3)` plus bonus slots from Features?
- Does the prerequisite evaluation UI show failing conditions in red with `errorMessage`?
- Are granted feats (from class/race) displayed as read-only (no delete button)?

# 9. Spells Tab (Phase 12)
- Does the Grimoire filter spells by the character's active `spellLists` and class level?
- Does the Spell Save DC compute as `10 + Spell Level + Key Ability Mod`?
- Do augmentations respect the manifester level cost cap?

# 10. Inventory Tab (Phase 13)
- Does equipping a `two_hands` item check both `main_hand` and `off_hand` slots?
- Are encumbrance thresholds loaded from the carrying capacity config table?
- Does exceeding Medium load inject `condition_medium_load` into the engine?
- Is coin weight calculated at 50 coins = 1 lb?

# 11. Navigation & Routes
- Do all routes match the plan in Architecture section 20?
- Does `/character/[id]` use `?tab=` query parameter (not sub-routes)?
- Are `/campaigns/[id]/settings` and `/campaigns/[id]/gm-dashboard` GM-only with navigation guards?

Output format: A numbered markdown checklist. For each issue:
- [ ] **[CRITICAL/MAJOR/MINOR]** `path/to/file.ts:lineNumber` — Description of the issue and what the architecture document requires instead. Reference the specific architecture section.

If no issues are found in a category, write: "✅ [Category]: No issues found."
```

---

## Checkpoint Review #3 — After Phase 14-15 (PHP Backend + GM Tools)

```markdown
You are a senior code reviewer specializing in PHP security, REST API design, and SQLite.

I have attached the complete ARCHITECTURE.md document and all PHP files under `/api/` plus the frontend `StorageManager.ts` refactored in Phase 14.6. The GM Tools UI from Phase 15 is also included.

Your job is to verify security, data integrity, and correct implementation of the visibility/override system. Do NOT rewrite code. Produce a **numbered checklist of issues**.

# 1. Authentication & Security (Phase 14.2-14.3)
- Does login verify against bcrypt hashes (not plaintext)?
- Does `requireAuth()` return 401 for unauthenticated requests on ALL protected endpoints?
- Are CORS headers configurable (not hardcoded to `*`)?
- Is there CSRF protection on POST/PUT/DELETE?
- Is there any SQL injection vulnerability (all queries must use PDO prepared statements)?
- Is the SQLite database file stored outside the web root in production?

# 2. Database Schema (Phase 14.4)
- Does the `characters` table have both `character_json` AND `gm_overrides_json` as separate TEXT fields?
- Does `campaigns` table have `gm_global_overrides_text`, `enabled_rule_sources_json`, and `updated_at`?
- Are `updated_at` fields updated on every relevant modification?

# 3. Visibility Rules (Phase 14.5)
- `GET /api/characters?campaignId=X`: 
  - For a non-GM: does it return ONLY characters where `owner_id = session_user_id`?
  - For a non-GM: does the response include `gmOverrides` merged invisibly (player cannot see raw overrides)?
  - For a GM: does it return ALL characters with raw `gm_overrides_json` as a separate field?
- `PUT /api/characters/{id}`: Does it verify ownership OR GM status before allowing the update?
- `PUT /api/characters/{id}/gm-overrides`: Is it restricted to GM only?
- `DELETE /api/characters/{id}`: Does it verify ownership OR GM status?

# 4. Sync Mechanism (Phase 14.6)
- Does `GET /api/campaigns/{id}/sync-status` return both `campaignUpdatedAt` and per-character `characterTimestamps`?
- Does the frontend polling compare timestamps and only re-fetch changed data?
- Is there a debounce on auto-save (at least 2 seconds)?
- Is there a localStorage fallback when the API is unreachable?

# 5. GM Override System (Phase 15)
- Does the GM text area accept BOTH Feature objects (`id` + `category`) AND config tables (`tableId`)?
- Does the JSON validator highlight syntax errors with line numbers?
- Does structural validation warn (not block) on missing `id`/`category`/`tableId`?
- Is the override resolution chain correct: rule files → GM global → GM per-character?
- Does the GM Entity Dashboard show a read-only character summary before the override text area?

# 6. Proxy Configuration (Phase 14.7)
- Does `vite.config.ts` proxy `/api` to the PHP dev server?
- Is the proxy target configurable (not hardcoded to localhost:8080)?

# 7. Rule Source Discovery
- Does the PHP backend scan `static/rules/` recursively in alphabetical order?
- Does `GET /api/rules/list` return the sorted list of available source files?

Output format: A numbered markdown checklist. For each issue:
- [ ] **[CRITICAL/MAJOR/MINOR]** `path/to/file.ts:lineNumber` — Description of the issue and what the architecture document requires instead. Reference the specific architecture section.

If no issues are found in a category, write: "✅ [Category]: No issues found."
```

---

## Checkpoint Review #4 — After Phases 16-17 (All Tests)

```markdown
You are a senior QA engineer specializing in PHPUnit and Vitest testing for complex rule engines.

I have attached the complete ARCHITECTURE.md, ANNEXES.md, all source code, and all test files (PHPUnit under `tests/` and Vitest under `src/tests/`).

Your job is to verify that the test suite is **exhaustive** relative to the architecture document. Do NOT write tests. Produce a **numbered checklist of missing or inadequate test cases**.

# 1. PHPUnit Tests (Phase 16)
- **16.2 Persistence**: Do tests verify that deeply nested JSON (activeFeatures with selections, classLevels, gmOverrides) survives a save/load cycle without corruption?
- **16.3 Visibility**: Is there a test where a non-GM tries to access another player's character and gets 403?
- **16.4 Auth**: Is there a test for login with wrong password? Test for accessing protected endpoint without session?
- **16.5 GM Overrides**: Is there a test verifying a player receives merged data (cannot see raw gmOverrides)? Is there a test verifying a GM receives both base data and raw gmOverrides?
- **16.6 Sync**: Is there a test verifying `updated_at` changes when GM overrides are modified (not just when the player edits)?

# 2. Vitest — Math Parser (Phase 17.1)
- Is `@characterLevel` path tested?
- Is `@classLevels.<classId>` path tested?
- Is `@selection.<choiceId>` path tested?
- Is the `|distance` pipe tested with both "en" and "fr" locales?
- Is the `|weight` pipe tested?
- Is an unresolved path tested (should return 0, not crash)?
- Is a formula with `floor()` and nested paths tested?

# 3. Vitest — Logic Evaluator (Phase 17.2)
- Is a deeply nested AND > OR > NOT > CONDITION tree tested?
- Is `has_tag` tested on `@activeTags`?
- Is `missing_tag` tested?
- Is a numeric comparison (`>=`) on a pipeline value tested?
- Does the test verify that `errorMessage` is returned from the failing CONDITION?
- Is an OR node tested where the first condition fails but the second succeeds?

# 4. Vitest — Stacking Rules (Phase 17.3 / 2.4a)
- Are all 4 stackable types tested (`dodge`, `circumstance`, `synergy`, `untyped`)?
- Is `setAbsolute` tested (overrides all other modifiers)?
- Are two conflicting `setAbsolute` modifiers tested (last wins)?
- Is a negative modifier tested (penalty)?
- Is a mix of positive and negative modifiers of the same type tested?
- Is `type: "damage_reduction"` best-wins-per-bypass-group tested (Phase 2.4a)?
  - Two DR/magic with different amounts: highest wins, lower suppressed?
  - DR/magic and DR/silver coexist as separate `drEntries`?
  - DR/— (empty bypass) is its own group and does not interfere with DR/magic?
  - AND bypass `["magic","silver"]` is treated as a different group from `["magic"]` alone?
  - Bypass tag sort order is consistent: `["silver","magic"]` equals `["magic","silver"]`?
  - DR modifiers do NOT affect `totalBonus` (they only appear in `drEntries`)?
  - `drEntries` is absent/undefined when no `damage_reduction` modifiers exist?

# 5. Vitest — Dice Engine (Phase 17.4)
- Is the injectable `rng` parameter used in ALL dice tests (no random results)?
- Is `situationalContext` matching tested (match vs no-match)?
- Is Exploding 20s tested with forced rolls [20, 20, 5]?
- Is `isAutomaticHit` (natural 20) tested?
- Is `isAutomaticMiss` (natural 1) tested?
- Is `isCriticalThreat` tested with a weapon crit range (e.g., 19-20)?

# 6. Vitest — DAG Integration (Phase 17.5)
- Is the Belt of Constitution cascade test present (CON → Fort save → HP)?
- Is the circular dependency test present (feature that grants CON based on HP)?
- Does the circular dependency test verify the engine doesn't crash (handles gracefully)?

# 7. Vitest — Multiclass (Phase 17.6)
- Is `characterLevel` sum tested for a multiclass character?
- Is BAB contribution from multiple classes tested (full + half BAB)?
- Is level-gated feature granting tested (granted at level X, not granted at level X-1)?
- Is `@eclForXp` tested for a monster PC character with `levelAdjustment > 0` (e.g., Drow Rogue 3 LA+2 → eclForXp = 5)?
- Is it verified that `@characterLevel` for the same character returns 3 (not 5), confirming LA is excluded from feat/HP math?
- Is it verified that `@eclForXp === @characterLevel` for standard PCs with `levelAdjustment = 0`?

# 8. Vitest — Merge Engine (Phase 17.7)
- Is full replace tested?
- Is partial merge with array append tested?
- Is `-prefix` deletion tested?
- Is `levelProgression` merge-by-level tested?
- Is `choices` merge-by-choiceId tested?
- Is the full 3-layer resolution chain tested (base → GM global → GM per-character)?
- Is a config table replacement tested (same `tableId` from different sources)?

# 9. Vitest — Psionic Item Subtypes (Phase 1.3b)
- Are all 5 `PsionicItemType` values tested as valid TypeScript assignments?
- Is `PowerStoneEntry` interface tested (all 3 fields: `powerId`, `manifesterLevel`, `usedUp`)?
- Is each psionic item type instantiated as an `ItemFeature` with the correct `psionicItemData` fields?
  - Cognizance Crystal: `storedPP`, `maxPP`, `attuned` — including odd-maxPP validation logic?
  - Dorje: `powerStored`, `charges` (50 default), `manifesterLevel`?
  - Power Stone: `powersImprinted[]` with ≥1 entry; `usedUp` depletes correctly?
  - Psicrown: `storedPP`, `maxPP` (`50 × ML`), `powersKnown[]`, `manifesterLevel`?
  - Psionic Tattoo: `powerStored`, `manifesterLevel`, `activated` (false → true after use)?
- Is `psionicItemData` absent (`undefined`) for non-psionic items (weapon, armour)?
- Do mutable fields (`storedPP`, `charges`, `activated`, `usedUp`) change correctly when depleted?
- Is the Brainburn risk condition detectable from `PowerStoneEntry.manifesterLevel` vs user ML?
- Is the 20-tattoo body-limit logic testable (count of unactivated tattoos)?

# 10. Missing Test Categories
Flag any architecture feature that has NO corresponding test:
- `forbiddenTags` conflict detection
- `conditionNode` evaluation on modifiers (e.g., Barbarian Fast Movement conditional)
- Dual-gated modifier (both `conditionNode` AND `situationalContext`, like Indomitable Will)
- Formula-as-value resolution (e.g., Monk WIS to AC: `"@attributes.stat_wis.derivedModifier"`)
- `setAbsolute` with string values (e.g., Monk unarmed damage `"1d8"`)
- Skill synergy auto-generation
- `classSkills` union across multiple active classes

Output format: A numbered markdown checklist. For each issue:
- [ ] **[CRITICAL/MAJOR/MINOR]** `path/to/file.ts:lineNumber` — Description of the issue and what the architecture document requires instead. Reference the specific architecture section.

If no issues are found in a category, write: "✅ [Category]: No issues found."
```

---

## Checkpoint Review #5 — After Phase 18 (Tooling, Build Pipeline & Developer Experience)

```markdown
You are a senior DevOps / DX engineer specializing in build pipelines, containerization, IDE integration, and developer tooling for full-stack web projects (Node.js + PHP).

I have attached all tooling-related files produced during Phase 18 of the project. The application code (Phases 1-17) has already been reviewed and is stable. Phase 18 adds build scripts, Docker pipeline, VS Code debug configurations, local run scripts, environment variable management, and a PHP binary resolver.

Your job is to verify that the tooling layer is **correct, portable, secure, and well-documented**. Do NOT rewrite code. Produce a **numbered checklist of issues** with file paths, line references, and severity (CRITICAL / MAJOR / MINOR).

Review the following aspects specifically:

# 1. Build Pipeline — Native (`scripts/build.sh`)
- Does it bootstrap portable build tools (PHP, Composer) in `.build-tools/` without requiring global installation?
- Does it execute the full pipeline in order: dependency install → type-check → Vitest → PHPUnit → Vite build → artifact assembly?
- Does the artifact include all required files (SvelteKit build, PHP API, static rules, `.htaccess`, VERSION file)?
- Does the `--skip-tests` flag work correctly (skipping Vitest + PHPUnit without breaking the build)?
- Does the `--deploy` flag correctly rsync to a remote target?
- Is the output tarball correctly structured for deployment on shared PHP hosting?

# 2. Build Pipeline — Docker (`Dockerfile` + `docker-compose.yml` + `scripts/build-docker.sh`)
- Does the Dockerfile use a proper multi-stage build (separate stages for deps, check, test, build, artifact)?
- Are Node.js and PHP versions pinnable via build arguments?
- Does `docker-compose.yml` correctly mount the output directory and pass through environment variables?
- Does `build-docker.sh` detect Docker/docker-compose availability and provide clear error messages?
- Is BuildKit inline cache configured correctly?
- Does `--no-cache` propagate to the Docker build?

# 3. Local Run Scripts
- **`run.sh`**: Does it auto-locate the latest artifact, resolve the PHP binary, load `.env` with correct priority, write a working PHP router, and auto-run migrations on first launch?
- **`run-docker.sh`**: Does it build a minimal Apache+PHP run image, mount the artifact read-only, persist the SQLite DB in a Docker volume, and support `--env-file`?
- Do both scripts support `--port`, `--dir`, and `--env-file` options with sane defaults?
- Do both scripts handle missing dependencies gracefully (no PHP, no Docker) with clear error messages?

# 4. VS Code Debug Configurations (`.vscode/launch.json`)
- Are there working configurations for: Chrome, Edge, Firefox (frontend), PHP/Xdebug (backend), and compound full-stack sessions?
- Do compound configurations start both Vite and PHP servers as preLaunchTasks?
- Do frontend configs attach to the correct port (5173 for dev, 8080 for artifact)?
- Does the PHP/Xdebug config use `scripts/php-dev.sh` as runtime for correct binary resolution?
- Are path mappings correct for Xdebug (`${workspaceFolder}/api` → `/api`)?
- Is the presentation grouping logical (fullstack → frontend → backend → tests → artifact)?

# 5. VS Code Tasks (`.vscode/tasks.json`)
- Are background server tasks (Vite, PHP) correctly configured with `isBackground: true` and appropriate `problemMatcher` patterns to detect server readiness?
- Do task dependencies form a correct chain (compound debug → preLaunchTask → server tasks)?

# 6. PHP Binary Resolver (`scripts/php-dev.sh`)
- Is the resolution priority correct: explicit override → Xdebug-capable PHP → portable PHP → system PHP?
- Does it handle the case where Xdebug is requested but not found (clear warning + fallback)?
- Does it check PHP version >= 8.1?
- Are all arguments forwarded correctly via `exec`?

# 7. Environment Variable Support
- **`.env.example`**: Does it document all supported variables (`APP_ENV`, `DB_PATH`, `CORS_ORIGIN`) with clear descriptions?
- **`api/config.php`**: Does the `.env` loader correctly implement the priority chain (process env > .env file > defaults)? Does it never override existing process environment variables?
- **`run.sh` / `run-docker.sh`**: Do they load `.env` with the same priority semantics?
- Is `.env` listed in `.gitignore`? Is `.env.example` tracked?

# 8. `.gitignore` Completeness
- Are all generated artifacts excluded: `dist/`, `dist-pkg/`, `.build-tools/`, `build/`, `.svelte-kit/`, `node_modules/`, `vendor/`?
- Are sensitive files excluded: `.env`, `*.sqlite*`?
- Are IDE-specific files correctly handled (`.vscode/` settings tracked where appropriate)?

# 9. `extensions.json` Recommendations
- Are all recommended extensions relevant to the project stack (Svelte, PHP, Xdebug, ESLint, Prettier, browser debug tools)?
- Are there any missing extensions that would significantly improve the DX?

# 10. README Documentation
- Does the README cover: project structure, prerequisites, quick start, development setup, testing, debugging, building, running locally, environment variables, and production deployment?
- Are all CLI options for all scripts documented?
- Are VS Code debug configurations and tasks documented with tables?
- Is the information accurate and consistent with the actual scripts?

# 11. Security Considerations
- Does `run.sh` bind to `localhost` by default (not `0.0.0.0`)?
- Does `run-docker.sh` expose ports only on `localhost` by default?
- Are `.env` files excluded from Docker build contexts (via `.dockerignore` or equivalent)?
- Does the PHP router script in `run.sh` prevent directory traversal or access to sensitive files?

Output format: A numbered markdown checklist. For each issue:
- [ ] **[CRITICAL/MAJOR/MINOR]** `path/to/file:lineNumber` — Description of the issue and what is expected instead.

If no issues are found in a category, write: "✅ [Category]: No issues found."
```

---

## Checkpoint Review #6 — After Phase 19 (UI Excellence)

```markdown
You are a senior UI/UX engineer and front-end architect specializing in Svelte 5, Tailwind CSS, responsive design, accessibility, and design systems.

I have attached the complete ARCHITECTURE.md document, PROMPT.md (Phase 19 spec), and all source files modified during Phase 19 of the project. Phases 1-18 have already been reviewed and are stable. Phase 19 is the UI overhaul: Tailwind CSS migration, light/dark theming, Lucide Icons, responsive design, sidebar navigation, and accessibility.

Your job is to verify that the UI layer meets **professional-grade quality standards** and correctly implements all Phase 19 requirements. Do NOT rewrite code. Produce a **numbered checklist of issues**.

Review the following aspects specifically:

# 1. Tailwind CSS Migration Completeness
- Are ALL scoped `<style>` blocks removed from migrated components (except truly necessary animation keyframes or pseudo-element hacks)?
- Is there any remaining hardcoded CSS color value (hex, rgb) in `.svelte` files that should be a Tailwind utility?
- Is `src/app.css` clean and minimal (only Tailwind directives, CSS custom properties for theming, and minimal `@apply` rules)?
- Does the final CSS bundle contain only used utilities (proper purging)?

# 2. Theme System
- Does the `ThemeManager` support three states: `'system'`, `'light'`, `'dark'`?
- Is the theme preference persisted in a cookie (not localStorage)?
- Does the cookie have correct attributes: `path=/`, `max-age=31536000`, `SameSite=Lax`?
- Is there a synchronous pre-paint script in `src/app.html` that reads the cookie and applies the `dark` class BEFORE first render (no FOWT)?
- Does `window.matchMedia('(prefers-color-scheme: dark)')` have a change listener for live system theme changes?
- Does the `ThemeToggle` component cycle through System (Monitor icon) → Light (Sun icon) → Dark (Moon icon)?
- Are ALL theme-aware colors defined as CSS custom properties with separate light/dark values?
- Do both themes have adequate contrast ratios (WCAG AA: 4.5:1 normal text, 3:1 large text)?

# 3. Lucide Icons
- Are ALL emoji characters removed from the codebase (no 📋, ⚔️, 🌟, ✨, 🎒, etc. remaining)?
- Are Lucide icons imported as Svelte components (not raw SVG strings)?
- Are icon sizes consistent: 16px inline, 20px buttons/nav, 24px section headers?
- Do icons use `currentColor` to inherit text color?
- Is tree-shaking working (only imported icons included in the bundle)?

# 4. Sidebar Navigation
- Is the sidebar rendered on the left side of the layout?
- Desktop (≥1024px): Is it expanded by default with icon + label, with a collapse toggle?
- Tablet (768px-1023px): Is it icon-only by default?
- Mobile (<768px): Is it hidden by default, opening as a slide-in drawer with backdrop?
- Is the sidebar collapsed/expanded state persisted in a cookie?
- Does the active route get highlighted with an accent indicator?
- Is the theme toggle accessible from the sidebar?

# 5. Character Sheet Full-Height Layout
- Does the character sheet occupy `100vh` minus any top bar/sidebar?
- Is the tab bar always visible (never scrolled out of view)?
- Does only the tab content area scroll (not the entire page)?
- On mobile: Do tab labels hide, showing only icons?
- On wide screens (≥1280px): Does the content area use multi-column layout?
- Is `overflow-y: auto` applied to the correct content container?

# 6. Responsive Design
- Test at ALL breakpoints: 320px, 375px, 414px, 768px, 1024px, 1280px, 1536px, 1920px.
- Is there any horizontal overflow at any breakpoint?
- Do grids collapse appropriately (3-col → 2-col → 1-col)?
- Does the Skills Matrix have a sticky first column with horizontal scroll on mobile?
- Do large modals become full-screen sheets on mobile?
- Are long lists (skills, spells, feats) using horizontal scrolling where appropriate?

# 7. Touch Adaptation
- Are ALL interactive elements (buttons, links, inputs, tabs, dropdown items) at least 44px tall on `pointer: coarse` devices?
- Is there adequate spacing between adjacent interactive elements to prevent mis-taps?
- Are focus rings visible for keyboard navigation (`:focus-visible`)?
- Are focus rings hidden for mouse/touch users?
- Does `prefers-reduced-motion: reduce` disable transitions/animations?

# 8. Design System Consistency
- Is the card/panel pattern consistent across ALL components?
- Are buttons consistent (Primary/Secondary/Danger/Ghost variants)?
- Are inputs styled consistently (height, border, focus ring)?
- Are badges consistent (size, rounded, color variants)?
- Are section headers consistent (icon + uppercase label + action buttons)?
- Is spacing consistent (using Tailwind spacing scale, not arbitrary values)?

# 9. Component Quality
- Does `Modal.svelte` support: backdrop click to close, Escape to close, focus trap, smooth transitions, bottom sheet on mobile, configurable max-width?
- Does `HorizontalScroll.svelte` provide: fade-out edge shadows, scroll-snap, thin scrollbar styling?
- Do all form inputs have proper labels (explicit `<label>` or `aria-label`)?
- Are all images using `alt` attributes?
- Are ARIA roles correct on interactive elements (tabs, modals, navigation)?

# 10. Performance
- Is the CSS bundle size reasonable (< 50KB gzipped for Tailwind output)?
- Are Lucide icons tree-shaken (not importing the entire library)?
- Are transitions using `transform` and `opacity` (GPU-accelerated properties) rather than layout-triggering properties?
- Is there any layout thrashing or unnecessary reflows from the sidebar toggle?

# 11. Zero Regressions
- Do ALL existing features still work after the migration?
- Can a user complete the full flow: view campaigns → enter campaign → view vault → open character → navigate all 6 tabs → edit values → return to vault?
- Are GM-exclusive features still hidden from non-GM users?
- Does the tab query parameter (`?tab=`) still work correctly?
- Are all modals (FeatureModal, DiceRollModal, ModifierBreakdown, FeatSelection, Grimoire) functional?

Output format: A numbered markdown checklist. For each issue:
- [ ] **[CRITICAL/MAJOR/MINOR]** `path/to/file.svelte:lineNumber` — Description of the issue and what Phase 19 spec requires instead.

If no issues are found in a category, write: "✅ [Category]: No issues found."
```

---

## Final Review — Complete System Validation

```markdown
You are a principal software architect performing a final acceptance review before v1.0 release of a D&D 3.5 Virtual Tabletop application built with Svelte 5, TypeScript, Tailwind CSS, and PHP/SQLite.

I have attached:
1. `ARCHITECTURE.md` — The complete architecture specification
2. `ANNEXES.md` — JSON examples and configuration tables
3. `PROMPT.md` — The complete checklist including Phase 19 (UI Excellence) spec
4. `PROGRESS.md` — All tasks checked off
5. ALL source code files (TypeScript, Svelte, PHP)
6. ALL test files (Vitest + PHPUnit) — all tests are passing

This is the FINAL review before release. Your job is comprehensive and covers EVERYTHING.

# Part A: Architecture Conformance (Full Sweep)

Walk through every section of ARCHITECTURE.md (sections 1-20) and verify the implementation:

1. **Section 1 (ECS Philosophy):** Is the codebase truly ECS? Are Features the only source of modifiers? Is the GameEngine the only system processing them?

2. **Section 2 (Primitives):** Do `ID`, `ModifierType`, and `LogicOperator` types match exactly?

3. **Section 3 (Logic Engine):** Does the implementation handle all 4 LogicNode types and all 8 LogicOperator values?

4. **Section 4 (Pipelines):** Do `Modifier`, `StatisticPipeline`, `SkillPipeline`, and `ResourcePool` match? Is `derivedModifier` computed correctly? Is `setAbsolute` behavior correct (section 4.2)? Are all special Math Parser paths (section 4.3) implemented? Does `ResourcePool.resetCondition` include all **8 values** (`long_rest`, `short_rest`, `encounter`, `never`, `per_turn`, `per_round`, `per_day`, `per_week`) per section 4.4 and Enhancement E-1? Does `GameEngine` expose `triggerDawnReset()` and `triggerWeeklyReset()` per E-1.3? Is `rechargeAmount` optional and formula-capable? Does `Modifier` include `drBypassTags?: string[]` per section 4.5 / Phase 2.4a? Does `Modifier.targetId` support the `"attacker.*"` prefix per section 4.6 / Enhancement E-5 (documented in JSDoc)? Does `parseAndRoll()` accept the optional `defenderAttackerMods` parameter and apply attacker penalties to `finalTotal`? Is `RollResult.attackerPenaltiesApplied?: Modifier[]` present?
5. **Section 5.1.1 (ItemFeature psionic item subtypes):** Does `ItemFeature.psionicItemData` include all five psionic item types with their fields per Phase 1.3b? Is the field matrix correct (cognizance crystal uses `storedPP/maxPP/attuned`; dorje uses `powerStored/charges/manifesterLevel`; power stone uses `powersImprinted[]`; psicrown uses `storedPP/maxPP/powersKnown/manifesterLevel`; tattoo uses `powerStored/manifesterLevel/activated`)? Are mutable vs immutable fields correctly labelled in the docs?
5a. **Section 5.6 (Feature `actionBudget`):** Does `Feature.actionBudget` exist as an optional field with six optional numeric keys per Phase 1.3c? Does the SRD condition table include Staggered (`{standard:1,move:1,full_round:0}`), Nauseated (`{standard:0,move:1,full_round:0}`), and Stunned (`{standard:0,move:0,full_round:0}`)? Is the minimum-wins UI resolution rule documented? Is the XOR mutual exclusion (`action_budget_xor` tag) described?
6. **Section 5.2.1 (MagicFeature psionic fields):** Does `MagicFeature` include `discipline?: PsionicDiscipline` and `displays?: PsionicDisplay[]` per Phase 1.3a? Are both types exported? Is `discipline` `undefined` for arcane/divine spells? Does the psionic casting panel (Phase 12.3) use `discipline` for grouping and `displays` for display suppression UI?

4b. **Section 4.6 + Enhancement E-5 (`attacker.*` modifiers):** Is `resolveAttackerMods()` correctly stripping the `"attacker."` prefix before pipeline matching? Does it respect `situationalContext` filtering (attacker's tags)? Does it never affect static pipeline `totalBonus` or `totalValue`? Does `attackerPenaltiesApplied` only appear in `RollResult` when there are actual applied penalties (not empty array)?

5. **Section 5 (Features):** Do `Feature`, `ItemFeature`, `MagicFeature`, `AugmentationRule`, `FeatureChoice`, `LevelProgressionEntry` match? Is `classSkills` implemented (section 5.5)? Is `optionsQuery` parsing correct (section 5.3)? Does `Feature` include `resourcePoolTemplates?: ResourcePoolTemplate[]` per E-2.3? Is `ResourcePoolTemplate` exported from `feature.ts` with all required fields (`poolId`, `label`, `maxPipelineId`, `defaultCurrent`, `resetCondition`, optional `rechargeAmount`)? Does `Feature.activation.actionType` include `"passive"` and `"reaction"` per E-4.2? Does `Feature.activation` include optional `tieredResourceCosts?: ActivationTier[]` per E-3.1 and optional `triggerEvent?: string` per E-4.2? Is `ActivationTier` exported with `label`, `targetPoolId`, `cost`, `grantedModifiers`?

5b. **Section 5.5b + Enhancement E-4 (trigger-based activation):** Does `GameEngine.getReactionFeaturesByTrigger(event)` correctly return only `"reaction"` features (not `"passive"`)? Does it exclude `isActive: false` instances? Does it return all features with the matching `triggerEvent` regardless of how many? Are `"on_fall"`, `"on_spell_targeted"`, `"on_damage_taken"`, `"on_attack_received"` documented as standard trigger events in ARCHITECTURE.md section 5.5b?

5c. **Section 5.7 + Enhancement E-2 (instance-scoped `itemResourcePools`):** Is `ActiveFeatureInstance.itemResourcePools?: Record<string, number>` present in `character.ts`? Is `GameEngine.initItemResourcePools()` correctly idempotent (only adds absent keys, never overwrites existing 0-values)? Does `spendItemPoolCharge()` floor at 0? Does `getItemPoolValue()` return `defaultCurrent` for uninitialised pools? Do `triggerDawnReset()` and `triggerWeeklyReset()` call `#resetItemPoolsByCondition()` to also reset item pools?

5d. **Enhancement E-3 (tiered activation):** Does `GameEngine.activateWithTier(instanceId, tierIndex)` return `null` (not throw) for out-of-range tier, missing feature, missing pool, and insufficient charges? Does it correctly prefer `itemResourcePools` (E-2) over `character.resources` when both could match? Does it return the tier's `grantedModifiers` array (may be empty) on success? Are tiers 0-indexed? Does a formula-string `cost` get resolved via the Math Parser?

6. **Section 6 (Character):** Does the `Character` interface match including `classLevels`, `gmOverrides`, all UI metadata, `levelAdjustment: number` (default 0), and `xp: number` (default 0)? Is `LinkedEntity` serialization unidirectional? Does the `createDefaultCharacter` factory initialize `levelAdjustment: 0` and `xp: 0`?

7. **Section 7 (Campaign):** Does the `Campaign` interface match including `gmGlobalOverrides`, `enabledRuleSources`, `updatedAt`?
8. **Section 8.1/8.2 (Gestalt variant):** Does `CampaignSettings.variantRules.gestalt` exist per Phase 2.5a? Does `gestaltRules.ts` export `computeGestaltBase()`, `isGestaltAffectedPipeline()`, `GESTALT_AFFECTED_PIPELINES`? Does GameEngine Phase 3.7 apply gestalt max-per-level for BAB/saves when the flag is true? Is HP still additive in gestalt mode?
9. **Section 8.3 (V/WP variant):** Does `CampaignSettings.variantRules.vitalityWoundPoints` exist per Phase 2.5b? Does `RollResult.targetPool` correctly route to `"res_hp"` / `"res_vitality"` / `"res_wound_points"` based on crit status and variant flag? Is `DamageTargetPool` exported? Does `RollContext.isCriticalHit?` exist for two-roll combat flow?

8. **Section 8 (Settings):** Does `CampaignSettings` match including `statGeneration`, `diceRules`, `enabledRuleSources`?

9. **Section 9 (DAG):** Are all 5 phases implemented in order? Is infinite loop detection present? Is HP calculation correct?

10. **Section 10 (Examples A-H):** Can the engine process every example scenario described? Pay special attention to Example H (Monk AC formula-as-value).

11. **Sections 11-17 (i18n, Monsters, Environment, Epic, Psionics, Variants, Dice):** Are these features at least structurally supported, even if not fully exercised by the current UI?

12. **Section 18 (Data Override Engine):** Is the complete resolution chain implemented? File discovery in alphabetical order? Partial merge with `-prefix` deletion? Config table replacement? GM global + per-character overrides?

13. **Sections 19-20 (Polling, Routes):** Do routes match section 20? Is polling implemented per section 19?

# Part B: Cross-Cutting Concerns

14. **Zero Hardcoding:** Scan the ENTIRE codebase for any hardcoded D&D terms in logic or templates (not in comments or test fixtures).

15. **i18n Completeness:** Is every user-facing string either a `LocalizedString` resolved via `t()`, or derived from Feature JSON data?

16. **Error Handling:** Does the engine handle gracefully: missing Feature JSON, unresolved formula paths, circular dependencies, invalid JSON in GM overrides, network failures (offline mode)?

17. **TypeScript Strictness:** Are there any `any` types that should be narrower? Any `as` casts that bypass type safety? Any optional fields that are treated as required without null checks?

18. **Security:** In the PHP backend, are there any SQL injection vectors, missing auth checks, or information leaks (GM data exposed to players)?

# Part C: Annex Compatibility

19. **Annex A:** Pick 3 diverse examples from Annex A (one class, one item, one environment Feature) and trace their complete resolution through the engine code. Verify that every field is correctly processed.

20. **Annex B:** Verify that all 13 config tables (B.1 through B.13) are loadable by the DataLoader and accessible via `getConfigTable(tableId)`. Verify that the engine uses them where documented (XP thresholds in Combat tab, carrying capacity in Inventory tab, skill synergies in DAG Phase 4, etc.).

# Part C2: Engine Enhancement Conformance (E-1 through E-5)

21. **E-1 Calendar Resets:** Are both `"per_day"` and `"per_week"` present in `ResourcePool.resetCondition` union? Do `triggerDawnReset()` and `triggerWeeklyReset()` exist on `GameEngine`? Do they correctly ignore `"long_rest"`, `"never"`, and the wrong calendar pool? Do they also reset matching item pools (E-2 integration)? Does `resourcePool.test.ts` cover all isolation permutations (dawn doesn't reset weekly, weekly doesn't reset daily, long-rest unaffected by both, `"never"` unaffected by both)?

22. **E-2 Instance-Scoped Item Pools:** Does `ActiveFeatureInstance.itemResourcePools` exist and is it optional? Is `ResourcePoolTemplate` exported from `feature.ts`? Is `Feature.resourcePoolTemplates` optional and does it default to `undefined` (not `[]`)? Does `initItemResourcePools` never reset an entry that is already present (even if its value is 0)? Does `spendItemPoolCharge` floor at 0 for over-spending? Is cross-instance independence verified (spending on one ring doesn't affect another instance of the same ring type)? Does `itemResourcePools.test.ts` cover stashed instance reset exclusion (`isActive: false`)?

23. **E-3 Tiered Activation:** Is `ActivationTier` exported from `feature.ts`? Is `tieredResourceCosts` optional on `activation`? Does `activateWithTier` handle: missing feature (returns `null`), no `tieredResourceCosts` (returns `null`), negative tier index (returns `null`), tier index ≥ array length (returns `null`), 0 charges (returns `null`), exactly-sufficient charges (succeeds, depletes pool), formula-string cost? Does `tieredActivation.test.ts` confirm that returning `null` never throws?

24. **E-4 Trigger-Based Activation:** Is `"passive"` in the `actionType` union? Is `"reaction"` in the `actionType` union? Does `triggerEvent` compile as an optional string on `activation`? Does `getReactionFeaturesByTrigger` exclude `"passive"` features even if they have a `triggerEvent` set? Does it exclude stashed/inactive instances? Is ARCHITECTURE.md section 5.5b present with the standard trigger event table?

25. **E-5 Attacker Modifiers:** Does `resolveAttackerMods` correctly strip the `"attacker."` prefix before pipeline comparison? Does it handle a modifier with NO `situationalContext` (unconditional — applies to all attackers)? Does it correctly skip modifiers whose stripped targetId doesn't match the rolled pipeline? Does it skip non-`"attacker.*"` modifiers entirely? Is `attackerPenaltiesApplied` absent (not an empty array) from `RollResult` when no penalties apply? Is the defender's static `totalBonus` provably unaffected by attacker modifier resolution?

26. **SRD JSON Conformance for Engine Enhancements:** Do the following rings in `12_d20srd_core_magic_items.json` have the correct new fields?
    - Ring of the Ram: `resourcePoolTemplates[0].resetCondition === "never"`, `activation.tieredResourceCosts` length 3, tier costs 1/2/3.
    - Ring of Spell Turning: `resourcePoolTemplates[0].resetCondition === "per_day"`, `defaultCurrent === 3`.
    - Ring of Djinni Calling: `resourcePoolTemplates[0].resetCondition === "per_day"`, `defaultCurrent === 1`.
    - Ring of Three Wishes: `resourcePoolTemplates[0].resetCondition === "never"`, `defaultCurrent === 3`.
    - Ring of Elemental Command (all 4): each has an `attacker.combatStats.attack_bonus` modifier with `value: -1` and appropriate `situationalContext` (e.g. `"air_elemental"`).
    - Ring of Elemental Command (Air): `resourcePoolTemplates` includes `chain_lightning` with `resetCondition: "per_week"`.
    - Ring of Shooting Stars: has both `"per_day"` and `"per_week"` templates.
    - Ring of Feather Falling: `activation.actionType === "reaction"`, `activation.triggerEvent === "on_fall"`.
    - Ring of Counterspells: `activation.actionType === "reaction"`, `activation.triggerEvent === "on_spell_targeted"`.
    - Skill rings (Swimming, Climbing, Jumping): `activation.actionType === "passive"`.

# Part D: Test Coverage Assessment

28. **Coverage Gaps:** List any architecture feature, edge case, or example scenario from ARCHITECTURE.md or ANNEXES.md that has NO corresponding test. Rank by risk. **Also check for E-series gaps:** any engine enhancement scenario not covered by `resourcePool.test.ts`, `itemResourcePools.test.ts`, `tieredActivation.test.ts`, `triggerActivation.test.ts`, `attackerModifiers.test.ts`.

# Part E: UI Excellence (Phase 19 Validation)

29. **Tailwind CSS Migration:** Is ALL styling done via Tailwind utility classes? Are there any remaining scoped `<style>` blocks or hardcoded CSS color values?

30. **Theme System:** Does the light/dark theme work correctly with system preference detection, cookie persistence, and no flash of wrong theme (FOWT)?

31. **Iconography:** Are ALL emoji characters replaced with Lucide Icons? Are icon sizes consistent (16/20/24px)?

32. **Responsive Layout:** Does the UI work at all breakpoints (320px to 1920px)? Is the sidebar collapsible? Does the character sheet use a full-height layout with always-visible tabs? Do long lists use horizontal scrolling on mobile?

33. **Touch & Accessibility:** Are all touch targets ≥44px on coarse pointer devices? Are focus rings visible for keyboard users? Does `prefers-reduced-motion` disable animations? Are WCAG AA contrast ratios met?

34. **Design System Consistency:** Are cards, buttons, inputs, badges, section headers, and modals visually consistent across ALL pages and components?

# Output Format

Produce a structured report with 4 sections:

**🔴 CRITICAL ISSUES** (Must fix before release — incorrect behavior, security vulnerability, data corruption risk)

**🟡 MAJOR ISSUES** (Should fix — deviations from architecture, missing edge cases, incomplete implementations)

**🟢 MINOR ISSUES** (Nice to fix — code style, missing comments, non-blocking inconsistencies)

**✅ VALIDATION PASSED** (Categories that are fully conformant)

For each issue: file path, line reference, architecture section or enhancement reference (e.g. "E-2", "section 4.6"), and specific description of what's wrong vs what's expected.

**Scope reminder:** This review now covers 34 check items — Architecture sections 1–20, Engine Enhancements E-1 through E-5 (checks 21–26), Test Coverage (check 27), and UI Excellence (checks 28–33).
```

---

## Checkpoint Review #7a — After Phase 20 (Leveling Progression & Skill Points)

```markdown
You are a senior game systems engineer specializing in D&D 3.5 SRD accuracy and Svelte 5 reactive engines.

I have attached ARCHITECTURE.md (including the new section 9.6), PROGRESS.md (Phase 20 checked off), and all source files modified in Phase 20: `GameEngine.svelte.ts`, `character.ts`, `SkillsMatrix.svelte`, `LevelingJournalModal.svelte`, `ui-strings.ts`, `icons.ts`, `multiclass.test.ts`, `characterBuildScenario.test.ts`.

Your job is to verify that Phase 20 is **fully SRD-accurate** and correctly integrated into the engine. Do NOT rewrite code. Produce a **numbered checklist of issues**.

# 1. Skill Point Budget (Phase 20.1 / ARCHITECTURE.md section 9.6.1–9.6.3)

### Per-class independence
- Does `phase4_skillPointsBudget` compute each class's SP contribution independently? (Verify: no summing of SP/level across classes before multiplying.)
- Does each entry use `max(1, spPerLevel + intMod)` as the effective points-per-level?
- Is the INT modifier read from `phase2_attributes['stat_int']?.derivedModifier` (not base value)?

### First-level 4× bonus (section 9.6.2)
- Is the first class identified via `Object.keys(character.classLevels)[0]`?
- Is `firstLevelBonus = 3 × max(1, spPerLevel + intMod)` for the first class (and 0 for all others)?
- Is `totalPoints = (pointsPerLevel × classLevel) + firstLevelBonus` for each entry?

### Racial/feat bonus SP (section 9.6.1)
- Are modifiers targeting `attributes.bonus_skill_points_per_level` accumulated as `bonusSpPerLevel`?
- Is `totalBonusPoints = bonusSpPerLevel × phase0_characterLevel`?
- Are non-class sources targeting `attributes.skill_points_per_level` (no matching `classLevels` entry) treated as bonus-per-total-level (not per-class)?

### Types
- Does `ClassSkillPointsEntry` have all required fields: `classId`, `classLabel`, `spPerLevel`, `classLevel`, `intModifier`, `pointsPerLevel`, `firstLevelBonus`, `totalPoints`?
- Does `SkillPointsBudget` have: `perClassBreakdown`, `bonusSpPerLevel`, `totalBonusPoints`, `totalClassPoints`, `totalAvailable`, `intModifier`?

# 2. Minimum Rank Enforcement (Phase 20.2 / ARCHITECTURE.md section 9.6.4)

- Does `Character.minimumSkillRanks?: Record<ID, number>` exist in `src/lib/types/character.ts`?
- Is it `optional` (absent for new characters, not initialized to `{}`)?
- Does `GameEngine.setSkillRanks()` clamp to `max(minimumSkillRanks?.[skillId] ?? 0, 0)`?
- Does `lockSkillRanksMin(skillId)` set the floor to `max(existingFloor, currentRanks)` (never lowers the floor)?
- Does `lockAllSkillRanks()` call `lockSkillRanksMin` for every key in `character.skills`?
- Is `minimumSkillRanks` absent (not initialized) in `createEmptyCharacter()`?

# 3. SkillsMatrix.svelte (Phase 20.3)

- Does it use `engine.phase4_skillPointsBudget.totalAvailable` for the SP budget (not a manually computed value)?
- Is the rank input `min` attribute set to `getMinRanks(skill.id)` (not hardcoded to 0)?
- Does `handleRanksChange()` clamp to `[minRanks, maxRanks]` before calling `engine.setSkillRanks()`?
- Is a "Min" badge shown when `skill.ranks <= minimumRanks && minimumRanks > 0`?
- Is the "Journal" button present and does it set `showJournal = true`?

# 4. LevelingJournalModal.svelte (Phase 20.4)

- Is the overview table correct: one row per active class + bonus SP row + totals row?
- Does `formatSpFormula()` include `firstLevelBonus` in the display when > 0 (e.g. `(2 +2) × 3 + 12 (×4 L1) = 24`)?
- Are class skill badges shown with active-status highlighting (green if the skill is loaded, dimmed if not)?
- Does `lockAllRanks()` call `engine.lockAllSkillRanks()`?
- Does `unlockAllRanks()` set `engine.character.minimumSkillRanks = {}`?
- Does the XP penalty warning show correctly when any class is 2+ levels below the max?
- Is `hasLockedRanks` derived correctly (some value in `minimumSkillRanks` > 0)?
- Is `IconJournal` (`BookOpen`) correctly imported from `icons.ts`?

# 5. phase4_levelingJournal (Phase 20.5)

- Does it build per-class BAB totals by filtering `phase0_flatModifiers` where `modifier.sourceId === classId && modifier.targetId === 'combatStats.bab' && modifier.type === 'base'`?
- Same for Fort/Ref/Will saves?
- Does each `LevelingJournalClassEntry` include `firstLevelBonus` and `spPointsPerLevel` from the SP budget map?
- Does `LevelingJournal.totalSp` include both class SP and bonus SP from `phase4_skillPointsBudget`?

# 6. i18n (Phase 20.6)

- Are all `journal.*` keys present with both `en` and `fr` translations?
- Are `skills.rank_locked`, `skills.rank_locked_tooltip`, `skills.journal_btn`, `skills.journal_tooltip` present?
- Is the `journal.sp_first_level_note` updated to say the bonus is already included (not a manual reminder)?

# 7. Vitest Tests (Phase 20.7–20.9)

### Scenario 7 — Per-class SP budget (`multiclass.test.ts`)
- Is `firstLevelBonus()` helper tested with INT floor (min 1/level)?
- Is the 4× first-level bonus applied ONLY to `isFirstClass: true` class (and 0 for others)?
- Is the three-class multiclass tested (Fighter 2 / Rogue 3 / Wizard 4)?
- Is the proof-of-broken-formula test still present (`computeWrongSkillPointBudget` gives 96)?
- Does the racial bonus test now include `isFirstClass: true` on the first class and verify the correct total with first-level bonus?

### Scenario 8 — Minimum rank enforcement (`multiclass.test.ts`)
- Is `simulateSetSkillRanks(currentRanks, requestedRanks, minimumRanks)` helper tested with floor > 0?
- Is `simulateLockRanks(existingMin, currentRanks)` tested for the case where existing min is HIGHER (floor cannot be lowered)?
- Is the character creation mode (absent `minimumSkillRanks`) tested returning 0?

### Character Build Scenario (`characterBuildScenario.test.ts`)
- Does the test cover Fighter 3 / Monk 3 / Psion 1 / Wizard 1 with STR 18 / DEX 16 / CON 17→19 / INT 15 / WIS 14 / CHA 13?
- Is the SP total correct at **50 SP** (Fighter 24 + Monk 18 + Psion 4 + Wizard 4)?
- Is the proof that CON 18→19 does NOT improve HP (same +4 modifier) present?
- Is the Monk WIS-to-AC modifier verified as `type: "untyped"` (stacks with DEX)?
- Is the Wizard 1 bonus spell slot at 2nd level verified as inaccessible (base slots = 0)?
- Is the favored class XP penalty exemption tested (e.g. Wizard as favored → only −20% penalty)?
- Is the Monk "Evasion" and "Still Mind" verified as class features (not feat slots)?
- Is the cross-class skill cost (2 SP/rank) tested explicitly?
- Does the total test count exceed 100?

# 8. SRD Accuracy Cross-Check

- **First-level bonus:** Does the engine correctly give `4 × max(1, spPerLevel + intMod)` for character level 1 (not `4 × spPerLevel + intMod`)?
- **INT retroactivity:** Is the current INT modifier used for ALL previous levels (retroactive per SRD)? Is this documented?
- **XP penalty boundary:** Is the threshold "more than 1 level below" (i.e. 2+ levels = penalty; 1 level below = no penalty) correctly implemented in the journal warning?
- **Favored class exemption:** Is the favored class excluded from the penalty check (not just from the offender count)?
- **Max ranks cross-class:** Is `floor((characterLevel + 3) / 2)` used for cross-class (not `(characterLevel + 3) / 2` without floor)?

Output format: A numbered markdown checklist. For each issue:
- [ ] **[CRITICAL/MAJOR/MINOR]** `path/to/file.ts:lineNumber` — Description and what section 9.6 / SRD requires instead.

If no issues are found in a category, write: "✅ [Category]: No issues found."
```
