# Character Vault — D&D 3.5 Virtual Tabletop Engine

![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![Svelte](https://img.shields.io/badge/Svelte-5-FF3E00?logo=svelte&logoColor=white)
![PHP](https://img.shields.io/badge/PHP-8.1+-777BB4?logo=php&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-2193_tests-6E9F18?logo=vitest&logoColor=white)
![i18n](https://img.shields.io/badge/i18n-Language--agnostic-0EA5E9?logo=googletranslate&logoColor=white)
![Gemini Pro](https://img.shields.io/badge/Gemini-Pro-4285F4?logo=googlegemini&logoColor=white)
![Claude Sonnet](https://img.shields.io/badge/Claude-Sonnet-D97757?logo=anthropic&logoColor=white)
![Claude Opus](https://img.shields.io/badge/Claude-Opus-8B5CF6?logo=anthropic&logoColor=white)
[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey?logo=creativecommons&logoColor=white)](LICENSE.txt)

A data-driven D&D 3.5 character sheet and campaign management application built with **Svelte 5**, **TypeScript**, and **PHP/SQLite**.

The engine has **zero hardcoded rules**: every race, class, feat, spell, item, and condition is a plain JSON file. Rules can be added, overridden, or removed without touching any code. A homebrew splat is as simple as dropping a JSON file into `static/rules/`. See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the complete system specification.

---

## AI-Assisted Engineering

This project was architected and developed in collaboration with **Google Gemini Pro**, **Anthropic Claude Sonnet**, and **Anthropic Claude Opus**. The complete development prompt — including architecture guidelines, coding rules, and the full phase checklist — lives in [`PROMPT.md`](PROMPT.md). This document is the primary context fed to the AI at the start of each coding session to generate or extend the codebase from scratch.

---

## Features

- **Entity-Component-System engine** — Characters, items, spells, and conditions are all composable `Feature` entities carrying `Modifiers` and `Tags`.
- **Fully reactive DAG** — Svelte 5 `$derived` runes compute the entire character sheet in topological order (ability scores → combat stats → skills). Any change propagates instantly.
- **Math Parser** — Formula strings in JSON (`"floor(@classLevels.class_soulknife / 4)d8"`) are evaluated at runtime against the character context.
- **Logic Evaluator** — AND / OR / NOT condition trees gate modifiers and validate prerequisites at sheet-computation time.
- **Fully language-agnostic** — Every user-visible string is centralized in `src/lib/i18n/ui-strings.ts` (English baseline) and `static/locales/*.json` (translations). Zero hardcoded display strings in components or TypeScript logic. Adding a new language requires only dropping a JSON file — no code change.
- **D&D 3.5 SRD content** — Complete core races, classes, feats, spells, armor, and weapons included out of the box.
- **Psionic systems** — Full Expanded Psionics Handbook support: power points, augmentations, psionic items.
- **Gestalt & Vitality/WP variants** — Unearthed Arcana variant rules are first-class engine flags.
- **Multi-layer data override** — JSON rule files → GM global overrides → GM per-character overrides, all with partial-merge support.
- **Offline-first** — localStorage primary cache with a PHP/SQLite API as the secondary backend.
- **Full-stack debugging** — One-press F5 launch in VS Code starts Vite + PHP + Xdebug + Chrome simultaneously.

---

## Table of contents

- [Project structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Quick start](#quick-start)
- [Development](#development)
- [Testing](#testing)
- [VS Code — debugging & tasks](#vs-code--debugging--tasks)
- [Building & packaging](#building--packaging)
- [Running the application](#running-the-application)
- [Environment variables](#environment-variables)
- [Production deployment](#production-deployment)
- [d20srd folder — Third-Party Content Notice](#d20srd-folder--third-party-content-notice)
- [Further reading](#further-reading)

---

## Project structure

```
character-vault/
├── src/                        # SvelteKit frontend (Svelte 5 + TypeScript)
│   ├── lib/
│   │   ├── engine/             # GameEngine (reactive DAG), DataLoader, SessionContext, StorageManager
│   │   │   └── phases/         # Extracted DAG phase pure functions (phase0–4, saves, weapons…)
│   │   ├── i18n/               # UI string registry: ui-strings.ts (English baseline + locale loader)
│   │   ├── types/              # TypeScript interfaces — Feature, Character, Pipeline, Logic…
│   │   └── utils/              # Math parser, dice engine, stacking rules, logic evaluator, formatters
│   ├── routes/                 # SvelteKit file-based routing (pages, layouts, API hooks)
│   └── tests/                  # Vitest unit & integration tests
├── api/                        # PHP backend — zero production dependencies
│   ├── index.php               # Front-controller / router
│   ├── migrate.php             # SQLite schema migration runner
│   └── config.php              # Environment variable loader (.env + process env)
├── static/
│   ├── locales/                # UI locale files — drop a new {code}.json to add a language
│   │   └── fr.json             # French translation (1 900+ keys, ships with the app)
│   └── rules/                  # JSON rule files (SRD core, psionics, homebrew…)
│       ├── 00_d20srd_core/     # Config tables, races, classes, feats, spells, equipment
│       │   └── 00_d20srd_core_config_tables.json  # Loaded first: XP, skills, synergies…
│       ├── 01_d20srd_psionics/ # Psionic classes, powers, items
│       └── test/               # Unit-test fixtures ONLY — never loaded in any deployment
│           ├── test_mock.json     # Base entities for the Vitest test suite
│           └── test_override.json # Merge-engine test: partial/replace override fixtures
├── tests/                      # PHPUnit integration tests
├── scripts/
│   ├── build.sh                # Native build pipeline (type-check → test → package)
│   ├── build-docker.sh         # Docker-based build (no host dependencies required)
│   └── php-dev.sh              # PHP binary resolver used by VS Code launch configs
├── .vscode/
│   ├── launch.json             # Debug configurations (full-stack, frontend, backend, PHPUnit)
│   ├── tasks.json              # Background tasks (Vite, PHP server, DB migrations, test coverage)
│   └── extensions.json         # Recommended extensions
├── ARCHITECTURE.md             # Complete engine specification (types, DAG phases, data model)
├── ANNEXES.md                  # JSON rule file examples and config table reference
├── CONTENT_AUTHORING_GUIDE.md  # Human tutorial: how to write JSON rule content
├── AI_MIGRATION_GUIDE.md       # AI protocol: how to migrate data from PCGen/Hero Lab/SRD HTML
├── run.sh                      # Serve the built artifact with PHP's built-in server
├── run-docker.sh               # Serve the built artifact with Docker (Apache + PHP)
├── docker-compose.yml
└── Dockerfile                  # Multi-stage image (builder + runner)
```

---

## Prerequisites

| Tool | Version | Required for |
|------|---------|--------------|
| **Node.js** | 18+ | Frontend build & dev server |
| **PHP** | 8.1+ with `pdo_sqlite` | Backend API & local dev server |
| **Composer** | any | PHPUnit tests only — downloaded automatically by `build.sh` |
| **Docker** | Engine 24+ | Docker-based build/run (optional) |

> **Zero-dependency quick start:** `git clone` → `npm install` → `./scripts/build.sh` → `./run.sh`
>
> `build.sh` downloads Composer and, if needed, a portable PHP binary into `.build-tools/` automatically. Nothing is installed system-wide.

---

## Quick start

```sh
# 1. Install frontend dependencies
npm install

# 2. Copy the environment template (optional for local dev)
cp .env.example .env

# 3. Build & package
./scripts/build.sh

# 4. Run locally
./run.sh
# → http://localhost:8080
```

---

## Development

Start both servers in separate terminals:

```sh
# Terminal 1 — SvelteKit dev server (port 5173, hot-reload)
npm run dev

# Terminal 2 — PHP API server (port 8080)
scripts/php-dev.sh -S localhost:8080 -t api api/index.php
```

Vite automatically proxies `/api/*` requests to the PHP server (see [`vite.config.ts`](vite.config.ts)).

### Database setup

```sh
# Creates: users, campaigns, characters tables
php api/migrate.php
```

Or use the VS Code task **Run: DB migrations**.

---

## Testing

### Frontend — Vitest

```sh
npm test                          # Run all tests across all test files
npm run test:coverage             # Run with v8 coverage report → coverage/index.html
npm test -- --watch               # Watch mode — re-runs on file save
npm test -- diceEngine            # Single file (match by name)
```

> **i18n audit:** Every user-visible string in the codebase uses `ui()` / `uiN()` — zero hardcoded display strings exist in any Svelte component or TypeScript file. All 1 900+ translation keys in `ui-strings.ts` have matching entries in `fr.json`. See [ARCHITECTURE.md §11](ARCHITECTURE.md) for the i18n system spec and the Language-Agnostic UI guideline in [PROGRESS.md](PROGRESS.md) for the development rule.

The VS Code tasks **Test: Coverage report** (default test task, `⌘⇧B`) and **Test: Watch mode** are also available.

#### Test files

| File | What it covers |
|------|----------------|
| [`characterBuildScenario.test.ts`](src/tests/characterBuildScenario.test.ts) | Full Fighter 3/Monk 3/Psion 1/Wizard 1 build — BAB, saves, HP, SP budget, feats, AC, XP penalty |
| [`multiclass.test.ts`](src/tests/multiclass.test.ts) | Multiclass BAB/saves progression, level-gated features, skill rank locking |
| [`dagResolution.test.ts`](src/tests/dagResolution.test.ts) | DAG cascade, forbidden tags, formula-as-value, conditionNode, synergy auto-generation, circular dep guard |
| [`stackingRules.test.ts`](src/tests/stackingRules.test.ts) | D&D 3.5 stacking rules, DR best-wins grouping, multiplier, setAbsolute |
| [`mathParser.test.ts`](src/tests/mathParser.test.ts) | Formula evaluation, `@`-path resolution, dice notation, pipe operators (`\|distance`, `\|weight`) |
| [`logicEvaluator.test.ts`](src/tests/logicEvaluator.test.ts) | AND / OR / NOT / CONDITION logic trees, all 8 operators |
| [`diceEngine.test.ts`](src/tests/diceEngine.test.ts) | Dice rolling, situational bonuses, exploding 20s, crit range, V/WP pool routing |
| [`mergeEngine.test.ts`](src/tests/mergeEngine.test.ts) | Data override engine (replace / partial merge / `-` prefix array deletion) |
| [`dataLoaderDirect.test.ts`](src/tests/dataLoaderDirect.test.ts) | DataLoader cache API, queryFeatures, entity validation, GM overrides, filter by source |
| [`gestaltRules.test.ts`](src/tests/gestaltRules.test.ts) | Gestalt UA variant: max-per-level BAB/saves algorithm |
| [`onCritBurstDice.test.ts`](src/tests/onCritBurstDice.test.ts) | Flaming Burst / Thundering on-crit dice, critMultiplier scaling, Fortification interaction |
| [`fortificationAndASF.test.ts`](src/tests/fortificationAndASF.test.ts) | Fortification crit negation, Arcane Spell Failure pre-cast check |
| [`maxDexBonus.test.ts`](src/tests/maxDexBonus.test.ts) | `max_dex_cap` minimum-wins logic, Mithral additive stacking |
| [`attackerModifiers.test.ts`](src/tests/attackerModifiers.test.ts) | `attacker.*` target namespace (Ring of Elemental Command penalty pattern) |
| [`cursedItemRemoval.test.ts`](src/tests/cursedItemRemoval.test.ts) | `removeFeature()` guard, `tryRemoveCursedItem()` magic check |
| [`tieredActivation.test.ts`](src/tests/tieredActivation.test.ts) | Variable-cost activation (`activateWithTier` — Ring of the Ram pattern) |
| [`itemResourcePools.test.ts`](src/tests/itemResourcePools.test.ts) | Instance-scoped item charges, dawn/weekly resets, idempotent init |
| [`ephemeralEffects.test.ts`](src/tests/ephemeralEffects.test.ts) | `consumeItem()` two-phase atomic flow, `expireEffect()` guard |
| [`resourcePool.test.ts`](src/tests/resourcePool.test.ts) | All eight `resetCondition` values, `rechargeAmount` formula tick |
| [`actionBudget.test.ts`](src/tests/actionBudget.test.ts) | Combat action budget min-wins reduction, XOR staggered/disabled rule |
| [`magicFeature.test.ts`](src/tests/magicFeature.test.ts) | Psionic discipline field, display types, augmentation rules |
| [`psionicItems.test.ts`](src/tests/psionicItems.test.ts) | All five psionic item types (dorje, cognizance crystal, power stone, psicrown, tattoo) |
| [`scrollSpells.test.ts`](src/tests/scrollSpells.test.ts) | Scroll CL check, arcane/divine restriction, multi-spell scrolls |
| [`staffSpells.test.ts`](src/tests/staffSpells.test.ts) | Staff charge costs, heightened spells, wielder CL vs item CL |
| [`wandSpell.test.ts`](src/tests/wandSpell.test.ts) | Wand fixed CL, heightened wands, Magic Missile CL variants |
| [`metamagicRods.test.ts`](src/tests/metamagicRods.test.ts) | Metamagic rod `maxSpellLevel` filter, charge management |
| [`inherentBonus.test.ts`](src/tests/inherentBonus.test.ts) | Tome/Manual inherent bonuses, highest-wins among inherent type |
| [`intelligentItems.test.ts`](src/tests/intelligentItems.test.ts) | Intelligent item metadata, Ego formula, communication tiers |
| [`triggerActivation.test.ts`](src/tests/triggerActivation.test.ts) | `"reaction"` / `"passive"` actionTypes, `getReactionFeaturesByTrigger()` |
| [`formatters.test.ts`](src/tests/formatters.test.ts) | All i18n formatting and game-math utilities — `computeAbilityModifier()`, `computeIntelligentItemEgo()`, `computeCoinWeight()`, `computeWealthInGP()`, `previewWithTempMod()`, `computeBaseSave()`, `toDisplayPct()`, `getCharacterLevel()`, distance/weight per unit system (imperial & metric), modifier sign, currency, dice, situational labels |
| [`sessionContext.test.ts`](src/tests/sessionContext.test.ts) | GM / player profile switching, active campaign context |
| [`storageManager.test.ts`](src/tests/storageManager.test.ts) | localStorage CRUD, polling, async API methods, LinkedEntity depth guard |
| [`contextKeyFix.test.ts`](src/tests/contextKeyFix.test.ts) | **Regression** — `@combatStats.base_attack_bonus.totalValue` prerequisite paths resolve correctly |
| [`edgeCases.test.ts`](src/tests/edgeCases.test.ts) | Multiplier modifiers, `not_includes`/`missing_tag` operators, division by zero, `@constant` paths |
| [`coverageCompletion.test.ts`](src/tests/coverageCompletion.test.ts) | Non-stacking penalties, `has_tag` on non-array, pure constant dice formula, V/WP routing |
| [`sceneAndPrereqs.test.ts`](src/tests/sceneAndPrereqs.test.ts) | Scene global features, character level/ECL, HP adjustment, resource resets |
| [`userManagement.test.ts`](src/tests/userManagement.test.ts) | All `userApi` functions (list, create, update, role, suspend, reinstate, delete, campaign members, setup-password, `changePassword`, `resetUserPassword`); URL/method/body verification; 4xx `ApiError` throwing; fallback error fields |
| [`setupPasswordFlow.test.ts`](src/tests/setupPasswordFlow.test.ts) | `SessionContext.needsPasswordSetup` state transitions; `requirePasswordSetup` / `clearPasswordSetup`; `loadFromServer()` flag propagation; password-setup form validation (empty, short, mismatch, valid); redirect guard logic |
| [`componentSplits.test.ts`](src/tests/componentSplits.test.ts) | Component split contract: `GmOverridesPanel` JSON validation, `TieredCostsEditor` tier management, `MagicItemsCastingSubpanel` item filtering, `ModifierRow` source-field defaulting, structural line-count and file-existence checks for all 16 new sub-components |
| [`enginePhases.test.ts`](src/tests/enginePhases.test.ts) | Direct unit tests for all extracted DAG phase functions: `buildSizePipeline`, `buildAttributePipelines`, `buildPhase2Context`, `buildCombatStatPipelines`, `buildPhase3Context`, `buildEquipmentSlots`, `buildEquippedSlotCounts`, `computeFeatSlots`, `computeGrantedFeatIds`, `computeManualFeatCount`, `computeEffectiveActionBudget`, `computeActionBudgetHasXOR`, `computeActionBudgetBlockers`, `computeActiveTags`, `computePhase0Result`, `computeMulticlassXpPenaltyRisk`, `buildClassSkillSet`, `buildSkillPointsBudget`, `buildLevelingJournal`, `buildSkillPipelines` |
| [`utilsCoverage.test.ts`](src/tests/utilsCoverage.test.ts) | `languageCookie` (read/write, SSR fallback, localStorage legacy), `classProgressionPresets` (BAB/save increment arrays), `constants` barrel, `formatters` barrel, `CharacterFactory.normaliseModifierTargetId` (all prefix branches), `makeSkillPipeline`, `createEmptyCharacter` (all pipeline initialisation paths) |
| [`augmentationRule.test.ts`](src/tests/augmentationRule.test.ts) | Psionic `AugmentationRule.effectDescription` field — backward compat, mechanical augmentations with description, qualitative augmentations (empty `grantedModifiers`) |
| [`bannerImageUtils.test.ts`](src/tests/bannerImageUtils.test.ts) | `validateBannerFile()` (MIME + size), `fileToBase64DataUri()`, `isImageDataUri()`, `bannerCache` (get/set/evict) |
| [`characterFields.test.ts`](src/tests/characterFields.test.ts) | `Character.name`/`playerName` fields, StorageManager round-trip, `canDelete()` vault permission logic |
| [`choiceExclusions.test.ts`](src/tests/choiceExclusions.test.ts) | `FeatureChoice.excludedBy` mutual-exclusion mechanism (domain pair exclusion), `getExcludedOptionIds()` helper, language switching |
| [`conditionNodeBuilder.test.ts`](src/tests/conditionNodeBuilder.test.ts) | ConditionNodeBuilder serialization (single, AND, NOT, deeply nested); mutation helpers `patchCondition`, `handleAndOrChildChanged`, `addConditionToAndOr`, `swapChildren`, `switchAndOr` |
| [`contentLanguages.test.ts`](src/tests/contentLanguages.test.ts) | `KNOWN_CONTENT_LANGUAGES` integrity (no duplicates, valid BCP-47, sorted), `getContentLangDisplayName()` with regional-variant fallback |
| [`engineConfigTables.test.ts`](src/tests/engineConfigTables.test.ts) | Data-driven config table reads: `savingThrowConfig` from JSON, `getWeaponDefaults()` ability assignments, `getSpellSaveDC()` casting-ability detection |
| [`formulaBuilderInput.test.ts`](src/tests/formulaBuilderInput.test.ts) | `validateFormula()` — all result states (`valid`/`invalid`/`partial`/`empty`); `buildInsertSnippet()` — all token classes and pipeline namespaces |
| [`homebrewStore.test.ts`](src/tests/homebrewStore.test.ts) | `HomebrewStore` CRUD (`add`/`update`/`remove`/`getById`), `toJSON()`, `isDirty`/`isSaving` state, auto-save debounce, campaign vs global scope routing |
| [`localizationHelpers.test.ts`](src/tests/localizationHelpers.test.ts) | `getBaseLang()`, `isRegionalVariant()`, `t()` with 5-step BCP-47 fallback chain, `getUnitSystem()` with regional fallback |
| [`rawJsonPanel.test.ts`](src/tests/rawJsonPanel.test.ts) | `parseRawJson()` (valid/invalid/non-object roots), `featureToJson()` (prettify/minify modes), two-way sync round-trip |
| [`uiStrings.test.ts`](src/tests/uiStrings.test.ts) | `SUPPORTED_UI_LANGUAGES`, `LANG_UNIT_SYSTEM`, `registerLangUnitSystem()`, `loadUiLocale()` (fetch mock, cache, error paths), `ui()`/`uiN()` (baseline, override, fallback, plural, missing-key) |
| [`userApi.test.ts`](src/tests/userApi.test.ts) | `updateOwnDisplayName()`, `updateUsername()` (display-name / username rename API functions); `updatePlayerName()` regression guard |

#### Coverage

Coverage is measured with `npm run test:coverage` (V8 provider). Scope: `src/lib/engine/**`, `src/lib/i18n/**`, `src/lib/utils/**`, `src/lib/api/**`. Excluded: Svelte components, static JSON data files, `.svelte-kit/` artefacts, and pure type declarations.

**Overall (54 test files, 2193 tests): 94.13% statements · 86.47% branches · 94.53% functions · 95.93% lines**

| Module | Stmts | Branch | Notes |
|---|---|---|---|
| `engine/CharacterFactory.ts` | **100%** | **100%** | Pipeline normalization, skill pipeline factory, empty character creation |
| `engine/phases/phase1Size.ts` | **100%** | **100%** | Size modifier resolution |
| `engine/phases/phase2Attributes.ts` | **100%** | **100%** | Attribute pipeline resolution and context upgrade |
| `engine/phases/phaseEquipmentSlots.ts` | **100%** | **100%** | Slot count extraction and equipped item counting |
| `engine/phases/phaseSavingThrows.ts` | **100%** | 67% | Saving throw pipeline helpers |
| `utils/stackingRules.ts` | **100%** | 97% | D&D 3.5 stacking rules engine |
| `utils/localizationHelpers.ts` | **100%** | **100%** | All extracted i18n helpers |
| `utils/unitFormatters.ts` | **100%** | **100%** | Distance/weight formatters for both unit systems |
| `utils/logicEvaluator.ts` | **100%** | **100%** | |
| `utils/gestaltRules.ts` | **100%** | **100%** | |
| `utils/languageCookie.ts` | **100%** | **100%** | Cookie read/write, SSR guard, localStorage fallback |
| `utils/classProgressionPresets.ts` | **100%** | **100%** | BAB / save progression increment arrays |
| `utils/abilityConstants.ts` | **100%** | **100%** | Ability score constants and abbreviation helpers |
| `utils/itemConstants.ts` | **100%** | **100%** | Item slot constants and item-type helpers |
| `utils/bannerImageUtils.ts` | **100%** | 88% | Banner image validation, base64 conversion, data URI detection |
| `api/userApi.ts` | 79% | **100%** | Core paths covered; new display-name/username functions add uncovered error branches |
| `engine/DataLoader.ts` | 99% | 92% | Async fetch paths, locale discovery, homebrew rule injection — all exercised via fetch mock |
| `engine/MergeEngine.ts` | 98% | 93% | Data override engine (replace / partial / `-prefix` deletion) |
| `utils/diceEngine.ts` | 98% | 90% | One defensive edge-case branch |
| `engine/phases/phase0Modifiers.ts` | 90% | 76% | Feature flattening, forbidden tags, formula values, recursive grants |
| `engine/phases/phaseFeatSlots.ts` | 97% | 88% | Feat slot computation, granted feat detection, manual feat count |
| `engine/phases/phaseActionBudget.ts` | 98% | 79% | Action economy budget, XOR rule, blocker labels |
| `engine/phases/phase4Skills.ts` | 95% | 78% | Skill pipeline resolution, skill points budget, leveling journal, synergy |
| `engine/phases/phase3CombatStats.ts` | 90% | 89% | Combat stats including gestalt max-per-level and Max HP computation |
| `engine/StorageManager.ts` | 92% | 85% | localStorage CRUD, error catch branches, async API paths |
| `utils/mathParser.ts` | 89% | 85% | |
| `utils/contentLanguages.ts` | 95% | 92% | BCP-47 content-language registry and display name helpers |
| `utils/bannerCache.ts` | 95% | **100%** | sessionStorage banner cache (get/set/evict) |
| `utils/statFormatters.ts` | 96% | 93% | `computeAbilityModifier`, `computeIntelligentItemEgo`, `computeCoinWeight`, `computeWealthInGP`, situational labels |
| `i18n/ui-strings.ts` | 78% | 70% | English baseline + locale helpers; `loadUiLocaleFromCache` requires browser localStorage |

> **Note on barrel re-export files and zero-coverage utilities:** `utils/constants.ts` and `utils/formatters.ts` are pure `export *` barrel files containing no executable statements — V8 coverage correctly reports 0 executable lines for them. All exported symbols from their sub-modules are fully covered by the test suite. `utils/ruleSourceColors.ts` and `utils/ruleConstants.ts` are UI-colour/constant-only modules used exclusively in Svelte components (excluded from coverage scope); they appear in the covered scope due to `all: true` but have no test-exercised paths.

### Backend — PHPUnit

```sh
# Requires Composer (downloaded automatically during build, or run composer install manually)
./vendor/bin/phpunit

# Single file
./vendor/bin/phpunit tests/AuthTest.php
```

| File | What it covers |
|------|----------------|
| [`AuthTest.php`](tests/AuthTest.php) | Login/logout, session persistence, wrong credentials |
| [`CharacterControllerTest.php`](tests/CharacterControllerTest.php) | Character CRUD, JSON round-trip, ownership checks |
| [`VisibilityTest.php`](tests/VisibilityTest.php) | Role-based access: GM sees all, player sees own only |
| [`GmOverrideTest.php`](tests/GmOverrideTest.php) | GM override visibility — merged vs raw view |
| [`SyncTest.php`](tests/SyncTest.php) | Timestamp-based sync polling mechanism |
| [`GlobalRulesTest.php`](tests/GlobalRulesTest.php) | Global rule file CRUD, list, delete — GM-only enforcement |
| [`HomebrewRulesTest.php`](tests/HomebrewRulesTest.php) | Per-campaign homebrew rule storage, round-trip, access control |
| [`UiLocalesTest.php`](tests/UiLocalesTest.php) | UI locale file listing and content endpoints |
| [`UserManagementTest.php`](tests/UserManagementTest.php) | Admin bootstrap; no-password login + 7-day auto-suspend; `setup-password`; `change-password` (success, wrong password, empty, no-password skip); `reset-password` (admin success, self-allowed, non-admin 403, 404); UserController CRUD; self-edit guards |
| [`CampaignUsersTest.php`](tests/CampaignUsersTest.php) | Campaign membership: add/remove/list users (incl. suspended); duplicate 409; player 403 |
| [`DisplayNameTest.php`](tests/DisplayNameTest.php) | Self-service display-name rename (`PUT /api/auth/display-name`); admin username update via `PUT /api/users/{id}`; conflict detection, validation, session refresh |

**Total: 157 PHPUnit tests, 478 assertions.**

> `TestCase.php` and `TestPhpInputStream.php` are shared test utilities (base class + PHP stream mock).

---

## VS Code — debugging & tasks

The repository ships a complete, ready-to-use VS Code workspace ([`.vscode/`](.vscode/)).

### Recommended extensions

VS Code will prompt you to install them automatically via [`.vscode/extensions.json`](.vscode/extensions.json):

| Extension | Purpose |
|-----------|---------|
| `svelte.svelte-vscode` | Svelte language support & diagnostics |
| `xdebug.php-debug` | PHP / Xdebug debug adapter |
| `bmewburn.vscode-intelephense-client` | PHP IntelliSense |
| `ms-edgetools.vscode-edge-devtools` | Chrome & Edge debugger |
| `firefox-devtools.vscode-firefox-debug` | Firefox debugger (recommended on Linux) |
| `dbaeumer.vscode-eslint` | ESLint integration |
| `esbenp.prettier-vscode` | Prettier formatter |

### Tasks (`Terminal → Run Task`)

| Task | Command | Notes |
|------|---------|-------|
| **Test: Coverage report** *(default test task)* | `npm test -- --coverage` | Generates `coverage/index.html` |
| **Test: Run all tests** | `npm test` | Fast — no coverage overhead |
| **Test: Watch mode** | `npm test -- --watch` | Re-runs on file save; stays alive |
| **Start: Vite dev server** | `npm run dev` | Hot-reload frontend on port 5173 |
| **Start: PHP dev server** | `scripts/php-dev.sh` | API server on port 8080 |
| **Run: DB migrations** | `php api/migrate.php` | Create / update the SQLite schema |
| **Run: Build (native)** | `scripts/build.sh` | Full type-check → test → package pipeline |
| **Run: Local server** | `./run.sh` | Serve the built artifact on port 8080 |

### Launch configurations (`Run & Debug` — `⇧⌘D`)

#### Full-stack — group `0-fullstack` (recommended)

| Configuration | What it does |
|---------------|-------------|
| **🚀 Full Stack — Vite + PHP + Chrome** | Starts Vite, spawns PHP server with Xdebug, attaches Chrome |
| **🚀 Full Stack — Vite + PHP + Edge** | Same with Edge |
| **🚀 Full Stack — Vite + PHP + Firefox** | Same with Firefox |

**Press F5** on any Full Stack configuration — everything starts automatically.

#### Frontend only — group `1-frontend`

| Configuration | What it does |
|---------------|-------------|
| **🟠 Frontend — Chrome / Edge / Firefox** | Attaches browser devtools to `http://localhost:5173` |

Start Vite manually first: `npm run dev`.

#### Backend only — group `2-backend`

| Configuration | What it does |
|---------------|-------------|
| **🐘 Backend — PHP (listen for Xdebug)** | Listens for an incoming Xdebug connection on port 9003 |
| **🐘 Backend — PHP (spawn server + Xdebug)** | Spawns PHP via `scripts/php-dev.sh` and listens simultaneously |

#### Tests — group `3-tests`

| Configuration | What it does |
|---------------|-------------|
| **🧪 Tests — PHPUnit** | Runs PHPUnit with breakpoints in test files and API sources |

#### Run artifact — group `4-artifact`

| Configuration | What it does |
|---------------|-------------|
| **🎮 Run artifact — Chrome / Edge / Firefox** | Starts `run.sh` and opens the built artifact at `http://localhost:8080` |

### PHP binary resolution (`scripts/php-dev.sh`)

| Priority | Condition |
|----------|-----------|
| `CHAR_VAULT_PHP` env var | Explicit override — always wins |
| System PHP with Xdebug | When `XDEBUG_MODE` is set (debug sessions) |
| `.build-tools/bin/php` | Portable PHP cached by `build.sh` |
| System PHP ≥ 8.1 | Final fallback |

> **Xdebug note:** The portable binary in `.build-tools/` does not include Xdebug. For breakpoints to work, install a system PHP with Xdebug:
>
> ```sh
> # macOS
> pecl install xdebug   # after: brew install php
>
> # Linux
> apt install php-xdebug
> ```
>
> Then add to your `php.ini` / `xdebug.ini`:
> ```ini
> zend_extension=xdebug
> xdebug.mode=debug
> xdebug.start_with_request=yes
> xdebug.client_host=127.0.0.1
> xdebug.client_port=9003
> ```
> The **spawn** backend config injects `XDEBUG_MODE` automatically, so no permanent `php.ini` edit is required — only the extension itself must be installed.

---

## Building & packaging

Two strategies are available depending on what is installed on the host.

### Option A — Native build (`scripts/build.sh`)

No global Composer or PHP installation required. The script bootstraps everything into `.build-tools/`:

```sh
./scripts/build.sh                        # Standard production build
./scripts/build.sh --skip-tests           # Skip test suites (faster iterations)
./scripts/build.sh --tag v1.2.3           # Custom version tag
./scripts/build.sh --env staging          # Staging environment
./scripts/build.sh --output my-dist       # Custom tarball output directory
./scripts/build.sh --deploy my-artifact   # Custom extracted artifact directory
./scripts/build.sh --no-clean             # Keep intermediate build directory
./scripts/build.sh --help                 # All options
```

**Pipeline steps:**

| Step | Action |
|------|--------|
| 0 | Bootstrap `.build-tools/` — download portable PHP and Composer if not cached |
| 1 | `npm ci` + `composer install` (dev deps) |
| 2 | `svelte-check` — TypeScript type-check |
| 3 | Vitest — frontend unit tests |
| 4 | PHPUnit — backend integration tests |
| 5 | `vite build` — SvelteKit SPA |
| 6–9 | Assemble artifact, generate `.htaccess`, create tarball |

**Outputs:**

| Path | Contents |
|------|----------|
| `dist/character-vault-<tag>/` | Extracted artifact — used directly by `run.sh` |
| `dist-pkg/character-vault-<tag>.tar.gz` | Compressed tarball — upload to server |

### Option B — Docker build (`scripts/build-docker.sh`)

Runs the entire pipeline inside Docker. **No Node.js, PHP, or Composer needed on the host.**

```sh
./scripts/build-docker.sh                        # Standard build (tag from git describe)
./scripts/build-docker.sh --tag v1.2.3           # Custom version tag
./scripts/build-docker.sh --output my-dist       # Custom tarball output directory
./scripts/build-docker.sh --no-cache             # Force full rebuild
./scripts/build-docker.sh --push                 # Push builder image to registry
./scripts/build-docker.sh --registry ghcr.io/org # Custom registry URL (with --push)
./scripts/build-docker.sh --help                 # All options
```

**Outputs:** same as Option A — `dist/` and `dist-pkg/`.

### Artifact contents

```
character-vault-<tag>/
├── build/      # SvelteKit compiled SPA
├── api/        # PHP backend — zero external dependencies
├── static/     # Static assets (JSON rule files, etc.)
├── .htaccess   # Apache routing: /api/* → PHP, everything else → SvelteKit
└── VERSION     # Version tag string
```

> **No `vendor/` in the artifact** — the PHP backend has zero production dependencies. Composer is only used during the build to run PHPUnit.

---

## Running the application

### Locally — PHP built-in server (`run.sh`)

Serves the latest artifact in `dist/` using PHP's built-in server with a custom router. Runs DB migrations automatically on first launch.

```sh
./run.sh                           # Default port 8080
./run.sh --port 9000               # Custom port
./run.sh --dir dist/character-vault-v1.2.3
./run.sh --env-file /path/to/my.env
./run.sh --help
```

### Locally — Docker / Apache (`run-docker.sh`)

Production-like environment (Apache + `mod_rewrite` + PHP + `pdo_sqlite`) without installing anything on the host.

```sh
./run-docker.sh                             # Default port 8080
./run-docker.sh --port 9000                 # Custom port
./run-docker.sh --dir dist/character-vault-v1.2.3  # Custom artifact path
./run-docker.sh --env-file /path/to/my.env  # Custom .env file
./run-docker.sh --no-cache                  # Force rebuild of the runner image
./run-docker.sh --help
```

The SQLite database is persisted in a Docker volume (`character-vault-db`).

---

## Environment variables

Configuration priority (highest wins):

| Source | When to use |
|--------|-------------|
| Process / server environment | VPS, Docker, CI, shell `export` |
| `.env` file in the project root | Local dev, shared hosting |
| Built-in defaults in `api/config.php` | Out-of-the-box development (no setup needed) |

```sh
cp .env.example .env
# Edit .env as needed
```

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_ENV` | `development` | `development` \| `production` |
| `DB_PATH` | `<root>/database.sqlite` | Path to the SQLite database file |
| `CORS_ORIGIN` | *(localhost only)* | Extra allowed origin, e.g. `https://yourvtt.example.com` |

See [`.env.example`](.env.example) and [`api/config.php`](api/config.php) for the full list.

### On shared hosting (OVH, etc.)

Place a `.env` file next to `api/` in the extracted artifact directory:

```ini
APP_ENV=production
DB_PATH=/home/yourlogin/private/cvault.sqlite
CORS_ORIGIN=https://yourvtt.example.com
```

> The `.env` file is **never included in the build artifact** — it must be created manually on the server to keep secrets out of version control.

---

## Production deployment

```sh
# 1. Extract the tarball
tar -xzf character-vault-<tag>.tar.gz
cd character-vault-<tag>

# 2. Create .env with production settings
nano .env

# 3. Initialise / update the database
php api/migrate.php

# 4. Configure your web server
#    - Document root → extracted directory
#    - AllowOverride All  (so .htaccess is honoured)
#    - The included .htaccess handles all routing automatically
```

**Server requirements:**

- PHP ≥ 8.1 with `pdo_sqlite` (standard on all shared hosts including OVH)
- Apache with `mod_rewrite` and `AllowOverride All`
- **No Composer, no Node.js, no npm** needed on the server

---

## d20srd folder — Third-Party Content Notice

The `d20srd/` folder in this repository is a **mirror of content from [d20srd.org](https://www.d20srd.org)**, which publishes the System Reference Document (SRD) for the D&D 3.5 rules under the Open Game License (OGL).

- All content inside `d20srd/` is the **intellectual property of its respective owners** (Wizards of the Coast / d20srd.org). It is **not mine**.
- The `d20srd/` folder is **explicitly excluded from the CC BY-NC-SA 4.0 license** that governs the rest of this project. The owner's license (OGL) prevails for all content within that folder.
- [`D20SRD_CONVERSION.md`](D20SRD_CONVERSION.md) contains the AI prompt used to convert the HTML files from the `d20srd/` folder into valid JSON rule files compatible with this application.

---

## Authoring Content & Migrating Data

Character Vault is built around an open content model — every rule is a JSON file in `static/rules/`. Two dedicated documents explain how to create and migrate content:

### For humans — writing new content

**[`CONTENT_AUTHORING_GUIDE.md`](CONTENT_AUTHORING_GUIDE.md)** is a 24-section progressive tutorial covering everything you need to author valid JSON rule files:

- Start at **Sections 1–5** to understand core concepts (Features, Tags, Modifiers, IDs, stacking rules).
- Jump to the relevant section for the content type you are creating (Races, Classes, Feats, Spells, Items, Conditions…).
- Use **Section 24** as the main quick-reference cheat sheet (all modifier types, formula paths, category overview).
- Key reference tables are also distributed across earlier sections: **Section 6** (canonical `situationalContext` values), **Section 8** (complete skill ID list, all combat stat pipelines, energy resistance targets), **Section 9** (supported math functions, dice formula rules).

A good entry point is the [Feature base template](CONTENT_AUTHORING_GUIDE.md#3-the-feature-object--base-template) — once you understand the shape of a Feature, everything else is a variation on that pattern.

```
Races       → Section 11    Classes     → Section 12
Class Feats → Section 13    Feats       → Section 14
Spells      → Section 15    Weapons     → Section 16
Magic Items → Section 17    Consumables → Section 18
Conditions  → Section 19    Environments→ Section 20
```

### For AI agents — bulk data migration

**[`AI_MIGRATION_GUIDE.md`](AI_MIGRATION_GUIDE.md)** is a 20-section operational protocol for AI agents converting large data sets from external sources (PCGen `.lst` files, Hero Lab XML, d20 SRD HTML, PDFs):

- **Section 1** defines the 6-step migration protocol that must be followed for every task.
- **Section 2** is the validation checklist — run it on every converted entity before writing output.
- **Section 3** is a decision tree for identifying the correct `category` value.
- **Sections 4–12** provide per-entity field-mapping tables (race → JSON, class → JSON, spell → JSON, etc.).
- **Section 16** covers the PCGen LST format token-by-token mapping.
- **Section 17** covers d20 SRD HTML extraction heuristics with URL patterns.
- **Section 20** defines hard blockers — situations where the AI must stop and report rather than guess.

Both documents are also read by AI coding assistants at the start of each content-generation session. The recommended reading order for a full conversion context is:

1. [`ARCHITECTURE.md`](ARCHITECTURE.md) — engine internals and TypeScript interfaces
2. [`CONTENT_AUTHORING_GUIDE.md`](CONTENT_AUTHORING_GUIDE.md) — all canonical field values, ID tables, and examples
3. [`AI_MIGRATION_GUIDE.md`](AI_MIGRATION_GUIDE.md) — conversion protocol and field-mapping tables
4. [`ANNEXES.md`](ANNEXES.md) — additional complete worked examples for complex entity types

---

## Further reading

| Document | Contents |
|----------|----------|
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Full engine specification: ECS philosophy, all 19 sections covering primitives, logic engine, mathematical pipelines, feature model, character entity, campaign data model, DAG phases, dice engine, i18n, data override system |
| [`ANNEXES.md`](ANNEXES.md) | Complete JSON rule file examples (races, classes, feats, spells, items, psionics, environments) and configuration table reference |
| [`CONTENT_AUTHORING_GUIDE.md`](CONTENT_AUTHORING_GUIDE.md) | Progressive tutorial for humans and AI writing new JSON rule content — all field types, complete skill/pipeline ID tables, canonical tag and situationalContext values, modifier stacking rules, math function reference, and worked examples for every entity category |
| [`AI_MIGRATION_GUIDE.md`](AI_MIGRATION_GUIDE.md) | Operational migration protocol for AI agents converting from PCGen, Hero Lab, SRD HTML, PDF, or any structured source — includes corrected BAB/save increment tables, complete armor tag matrix, `saves.all` vs `combatStats.saving_throw_bonus` disambiguation, and a hard-blockers checklist |
| [`D20SRD_CONVERSION.md`](D20SRD_CONVERSION.md) | Prompt used to convert `d20srd/` HTML files into valid JSON rule files for this application |

---

## License

This project is licensed under the **Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International** license.

[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey?logo=creativecommons&logoColor=white)](LICENSE.txt)

**In plain terms:**
- **Free to use** — use, study, and modify the project at no cost.
- **Attribution required** — you must credit the original project.
- **Non-commercial** — neither this project nor any fork may be used for commercial purposes or monetary gain, in whole or in part.
- **ShareAlike** — any fork or derivative work must be distributed under the exact same license (CC BY-NC-SA 4.0), preserving all four conditions above.

This choice reflects the core mission of the project: giving players permanent, free ownership of their character data — with no risk of a service going paid, shutting down, or changing terms.

See [`LICENSE.txt`](LICENSE.txt) for the full legal text.
