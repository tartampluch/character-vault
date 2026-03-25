# Character Vault — D&D 3.5 Virtual Tabletop Engine

![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![Svelte](https://img.shields.io/badge/Svelte-5-FF3E00?logo=svelte&logoColor=white)
![PHP](https://img.shields.io/badge/PHP-8.1+-777BB4?logo=php&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-1470_tests-6E9F18?logo=vitest&logoColor=white)
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
│   │   ├── types/              # TypeScript interfaces — Feature, Character, Pipeline, Logic…
│   │   └── utils/              # Math parser, dice engine, stacking rules, logic evaluator, formatters
│   ├── routes/                 # SvelteKit file-based routing (pages, layouts, API hooks)
│   └── tests/                  # Vitest unit & integration tests (37 files, 1 147 tests)
├── api/                        # PHP backend — zero production dependencies
│   ├── index.php               # Front-controller / router
│   ├── migrate.php             # SQLite schema migration runner
│   └── config.php              # Environment variable loader (.env + process env)
├── static/
│   └── rules/                  # JSON rule files (SRD core, psionics, homebrew…)
│       ├── 00_d20srd_core/     # Config tables, races, classes, feats, spells, equipment
│       │   └── 00_d20srd_core_config_tables.json  # Loaded first: XP, skills, synergies…
│       ├── 01_d20srd_psionics/ # Psionic classes, powers, items
│       └── test/               # Unit-test fixtures ONLY — never loaded in any deployment
│           ├── test_mock.json     # Base entities for the Vitest test suite
│           └── test_override.json # Merge-engine test: partial/replace override fixtures
├── tests/                      # PHPUnit integration tests (5 files, 40 tests)
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
npm test                          # Run all 1 147 tests across 37 files
npm test -- --coverage            # Run with v8 coverage report → coverage/index.html
npm test -- --watch               # Watch mode — re-runs on file save
npm test -- diceEngine            # Single file (match by name)
```

The VS Code tasks **Test: Coverage report** (default test task, `⌘⇧B`) and **Test: Watch mode** are also available.

#### Test files

| File | What it covers |
|------|----------------|
| [`characterBuildScenario.test.ts`](src/tests/characterBuildScenario.test.ts) | Full Fighter 3/Monk 3/Psion 1/Wizard 1 build — BAB, saves, HP, SP budget, feats, AC, XP penalty (103 assertions) |
| [`multiclass.test.ts`](src/tests/multiclass.test.ts) | Multiclass BAB/saves progression, level-gated features, skill rank locking |
| [`dagResolution.test.ts`](src/tests/dagResolution.test.ts) | DAG cascade, forbidden tags, formula-as-value, conditionNode, synergy auto-generation, circular dep guard |
| [`stackingRules.test.ts`](src/tests/stackingRules.test.ts) | D&D 3.5 stacking rules, DR best-wins grouping, multiplier, setAbsolute |
| [`mathParser.test.ts`](src/tests/mathParser.test.ts) | Formula evaluation, `@`-path resolution, dice notation, pipe operators (`\|distance`, `\|weight`) |
| [`logicEvaluator.test.ts`](src/tests/logicEvaluator.test.ts) | AND / OR / NOT / CONDITION logic trees, all six operators |
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
| [`formatters.test.ts`](src/tests/formatters.test.ts) | All i18n formatting utilities — `getUnitSystem()`, `SUPPORTED_UI_LANGUAGES` integrity, distance/weight per unit system (imperial & metric), modifier sign, currency, dice |
| [`sessionContext.test.ts`](src/tests/sessionContext.test.ts) | GM / player profile switching, active campaign context |
| [`storageManager.test.ts`](src/tests/storageManager.test.ts) | localStorage CRUD, polling, async API methods, LinkedEntity depth guard |
| [`contextKeyFix.test.ts`](src/tests/contextKeyFix.test.ts) | **Regression** — `@combatStats.base_attack_bonus.totalValue` prerequisite paths resolve correctly |
| [`edgeCases.test.ts`](src/tests/edgeCases.test.ts) | Multiplier modifiers, `not_includes`/`missing_tag` operators, division by zero, `@constant` paths |
| [`coverageCompletion.test.ts`](src/tests/coverageCompletion.test.ts) | Non-stacking penalties, `has_tag` on non-array, pure constant dice formula, V/WP routing |
| [`sceneAndPrereqs.test.ts`](src/tests/sceneAndPrereqs.test.ts) | Scene global features, character level/ECL, HP adjustment, resource resets |

#### Coverage

Coverage is measured with `npx vitest run --coverage` (V8 provider). Scope: `src/lib/engine/**`, `src/lib/i18n/**`, `src/lib/utils/**`. Excluded: Svelte components, static JSON data files, `.svelte-kit/` artefacts, and pure type declarations.

**Overall (43 test files, 1 470 tests): 93% statements · 87% branches · 96% functions · 94% lines**

| Module | Stmts | Branch | Notes |
|---|---|---|---|
| `i18n/ui-strings.ts` | **100%** | **100%** | Full UI chrome string coverage |
| `utils/constants.ts` | **100%** | **100%** | Ability abbreviations |
| `utils/stackingRules.ts` | **100%** | 94% | D&D 3.5 stacking rules engine |
| `engine/SessionContext.svelte.ts` | **100%** | **100%** | Session context reactive singleton |
| `utils/gestaltRules.ts` | 98% | 86% | |
| `utils/diceEngine.ts` | 98% | 88% | Two uncovered edge-case branches |
| `engine/DataLoader.ts` | 95% | 87% | Async fetch paths exercised via fetch mock |
| `utils/formatters.ts` | 93% | 86% | |
| `utils/logicEvaluator.ts` | 91% | 90% | |
| `utils/mathParser.ts` | 88% | 83% | |
| `engine/StorageManager.ts` | 89% | 86% | Async API methods tested via fetch mock |
| `engine/HomebrewStore.svelte.ts` | 97% | 97% | |
| `engine/GameEngine.svelte.ts` | ~17% | ~8% | See note below |

> **Why is `GameEngine.svelte.ts` coverage low?**
>
> `GameEngine.svelte.ts` is a 4 054-line Svelte 5 class. Its core logic — `phase0_flatModifiers`, `phase2_attributes`, `phase3_combatStats`, `phase4_skills` — lives inside `$derived` closures. These are **lazy**: they only execute when accessed AND when their reactive dependencies have changed.
>
> In Vitest's Node.js environment, the `$derived` phases do run (Svelte 5 runes are framework-agnostic), but they require *data*: a character with active features that exist in the `DataLoader` singleton. Without loading rule files (which requires HTTP or a mocked fetch at test setup), the phases iterate empty feature lists and most branches are never reached.
>
> This is **not a gap in logic coverage** — the engine's core algorithms (`applyStackingRules`, `evaluateFormula`, `checkCondition`, `computeDerivedModifier`) are each individual pure functions tested at 90–100% coverage. The `$derived` phases are thin wiring that calls those functions: they are verified end-to-end by the `characterBuildScenario.test.ts` integration suite (103 assertions covering the full DAG output) and by the `dagResolution.test.ts` scenarios.
>
> Achieving higher raw GameEngine line coverage would require an in-process DataLoader pre-load fixture (a future improvement) or a Svelte testing harness with jsdom. The current architecture intentionally isolates pure computation from reactive wiring to maximize testability of the logic itself.

### Backend — PHPUnit

```sh
# Requires Composer (downloaded automatically during build, or run composer install manually)
./vendor/bin/phpunit

# Single file
./vendor/bin/phpunit tests/AuthTest.php
```

| File | What it covers |
|------|----------------|
| [`AuthTest.php`](tests/AuthTest.php) | Login/logout, session persistence, wrong credentials (11 tests) |
| [`CharacterControllerTest.php`](tests/CharacterControllerTest.php) | Character CRUD, JSON round-trip, ownership checks (6 tests) |
| [`VisibilityTest.php`](tests/VisibilityTest.php) | Role-based access: GM sees all, player sees own only (11 tests) |
| [`GmOverrideTest.php`](tests/GmOverrideTest.php) | GM override visibility — merged vs raw view (6 tests) |
| [`SyncTest.php`](tests/SyncTest.php) | Timestamp-based sync polling mechanism (6 tests) |

**Total: 40 PHPUnit tests, 131 assertions.**

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
./scripts/build-docker.sh                 # Standard build (tag from git describe)
./scripts/build-docker.sh --tag v1.2.3   # Custom version tag
./scripts/build-docker.sh --no-cache     # Force full rebuild
./scripts/build-docker.sh --help         # All options
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
./run-docker.sh                    # Default port 8080
./run-docker.sh --port 9000
./run-docker.sh --no-cache         # Force rebuild of the runner image
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
