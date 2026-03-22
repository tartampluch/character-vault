# Character Vault — D&D 3.5 Virtual Tabletop Engine

A data-driven D&D 3.5 character sheet and campaign management application built with **Svelte 5**, **TypeScript**, and **PHP/SQLite**.

The engine has **zero hardcoded rules**: every race, class, feat, spell, item, and condition is a plain JSON file that can be added, overridden, or removed without touching any code. See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the full system specification.

---

## Table of contents

- [Project structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Quick start](#quick-start)
- [Development](#development)
- [Testing](#testing)
- [VS Code — debugging](#vs-code--debugging)
- [Building & packaging](#building--packaging)
- [Running the application](#running-the-application)
- [Environment variables](#environment-variables)
- [Production deployment](#production-deployment)

---

## Project structure

```
character-vault/
├── src/                    # SvelteKit frontend (Svelte 5 + TypeScript)
│   ├── lib/                # Game engine, types, utilities
│   │   ├── engine/         # GameEngine (reactive DAG, Svelte 5 Runes)
│   │   ├── types/          # TypeScript interfaces (Feature, Character, Pipeline…)
│   │   └── utils/          # Math parser, dice engine, logic evaluator, merge engine
│   ├── routes/             # SvelteKit file-based routing (pages & API hooks)
│   └── tests/              # Vitest unit tests
├── api/                    # PHP backend (zero production dependencies)
│   ├── index.php           # Front-controller / router
│   ├── migrate.php         # SQLite schema migration runner
│   └── config.php          # Environment variable loader (.env + process env)
├── static/                 # Static assets served as-is
│   └── rules/              # JSON rule files (SRD, psionics, homebrew…)
├── tests/                  # PHPUnit integration tests
├── scripts/                # Build & dev helper scripts
│   ├── build.sh            # Native build pipeline (type-check → test → package)
│   ├── build-docker.sh     # Docker-based build (no host dependencies)
│   └── php-dev.sh          # PHP resolver used by VS Code launch configs
├── .vscode/                # VS Code workspace configuration
│   ├── launch.json         # Debug configurations (frontend, backend, full-stack)
│   ├── tasks.json          # Background task automation (Vite, PHP server…)
│   └── extensions.json     # Recommended extensions
├── run.sh                  # Serve the built artifact with PHP's built-in server
├── run-docker.sh           # Serve the built artifact with Docker (Apache + PHP)
├── docker-compose.yml      # Docker Compose for builder and runner services
└── Dockerfile              # Multi-stage image (builder + runner)
```

---

## Prerequisites

| Tool | Version | Required for |
|------|---------|--------------|
| **Node.js** | 18+ | Frontend build & dev server |
| **PHP** | 8.1+ with `pdo_sqlite` | Backend API & local dev server |
| **Composer** | any | PHPUnit tests only (downloaded automatically by `build.sh`) |
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

Run the migration script once to create the SQLite database:

```sh
php api/migrate.php
# Creates: users, campaigns, characters tables
```

Or use the VS Code task **Run: DB migrations** (see [VS Code — debugging](#vs-code--debugging)).

---

## Testing

### Frontend — Vitest

```sh
# Run all unit tests (13 test files, 558 tests)
npm test

# Watch mode
npm run test:watch

# Single test file
npm test -- src/tests/diceEngine.test.ts
```

| Test file | What it covers |
|-----------|----------------|
| [`mathParser.test.ts`](src/tests/mathParser.test.ts) | Formula evaluation, `@`-path resolution, pipe operators |
| [`logicEvaluator.test.ts`](src/tests/logicEvaluator.test.ts) | Logic tree evaluation (AND / OR / NOT / CONDITION) |
| [`stackingRules.test.ts`](src/tests/stackingRules.test.ts) | D&D 3.5 modifier stacking rules, DR best-wins grouping |
| [`diceEngine.test.ts`](src/tests/diceEngine.test.ts) | Dice rolling, situational bonuses, exploding 20s, V/WP pool routing |
| [`dagResolution.test.ts`](src/tests/dagResolution.test.ts) | DAG cascade, forbidden tags, formula-as-value, circular dep guard |
| [`multiclass.test.ts`](src/tests/multiclass.test.ts) | Multiclass BAB/saves, level-gated features, SP budget, rank locking |
| [`mergeEngine.test.ts`](src/tests/mergeEngine.test.ts) | Data override merge engine (replace / partial / `-` prefix) |
| [`gestaltRules.test.ts`](src/tests/gestaltRules.test.ts) | Gestalt variant: max-per-level BAB/saves algorithm |
| [`magicFeature.test.ts`](src/tests/magicFeature.test.ts) | Psionic discipline, display fields, augmentation rules |
| [`psionicItems.test.ts`](src/tests/psionicItems.test.ts) | All five psionic item types (dorje, crystal, stone, crown, tattoo) |
| [`resourcePool.test.ts`](src/tests/resourcePool.test.ts) | Resource pool tick/rest conditions, rechargeAmount formulas |
| [`actionBudget.test.ts`](src/tests/actionBudget.test.ts) | Combat action budget min-wins, XOR staggered/disabled rule |
| [`characterBuildScenario.test.ts`](src/tests/characterBuildScenario.test.ts) | Full Fighter 3/Monk 3/Psion 1/Wizard 1 build (103 tests) |

### Backend — PHPUnit

```sh
# Run all PHPUnit tests
./vendor/bin/phpunit

# Single test file
./vendor/bin/phpunit tests/AuthTest.php
```

| Test file | What it covers |
|-----------|----------------|
| [`AuthTest.php`](tests/AuthTest.php) | Login/logout, session persistence, wrong credentials (11 tests) |
| [`CharacterControllerTest.php`](tests/CharacterControllerTest.php) | Character CRUD, JSON persistence (6 tests) |
| [`VisibilityTest.php`](tests/VisibilityTest.php) | Role-based access control (GM vs player) (11 tests) |
| [`GmOverrideTest.php`](tests/GmOverrideTest.php) | GM override visibility (merged vs raw) (6 tests) |
| [`SyncTest.php`](tests/SyncTest.php) | Timestamp-based sync mechanism (6 tests) |

> **Total: 40 PHPUnit tests, 131 assertions.**
>
> `TestCase.php` and `TestPhpInputStream.php` are shared test utilities (base class + PHP stream mock), not test files themselves.
>
> Composer and PHPUnit are downloaded automatically by `scripts/build.sh`. Running `./vendor/bin/phpunit` directly requires `composer install` first.

---

## VS Code — debugging

The repository includes a complete, ready-to-use VS Code workspace ([`.vscode/`](.vscode/)).

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

### Launch configurations

Open **Run & Debug** (`⇧⌘D`) to find all configurations, organized in groups:

#### Full-stack (recommended — group `0-fullstack`)

| Configuration | What it does |
|---------------|-------------|
| **🚀 Full Stack — Vite + PHP + Chrome** | Starts Vite, spawns PHP server with Xdebug, attaches Chrome |
| **🚀 Full Stack — Vite + PHP + Edge** | Same with Edge |
| **🚀 Full Stack — Vite + PHP + Firefox** | Same with Firefox (requires `firefox-devtools` extension) |

**Press F5** on any Full Stack configuration — everything starts automatically.

#### Frontend only (group `1-frontend`)

| Configuration | What it does |
|---------------|-------------|
| **🟠 Frontend — Chrome** | Attaches Chrome to `http://localhost:5173` (Vite must already be running) |
| **🟠 Frontend — Edge** | Same with Edge |
| **🟠 Frontend — Firefox** | Same with Firefox |

Start Vite manually first: `npm run dev`.

#### Backend only (group `2-backend`)

| Configuration | What it does |
|---------------|-------------|
| **🐘 Backend — PHP (listen for Xdebug)** | Listens for an incoming Xdebug connection (port 9003); start PHP separately |
| **🐘 Backend — PHP (spawn server + Xdebug)** | Spawns the PHP server via `scripts/php-dev.sh` and listens for Xdebug simultaneously |

#### Tests (group `3-tests`)

| Configuration | What it does |
|---------------|-------------|
| **🧪 Tests — PHPUnit** | Runs PHPUnit via `scripts/php-dev.sh`; breakpoints work in both test files and API sources |

#### Run artifact (group `4-artifact`)

| Configuration | What it does |
|---------------|-------------|
| **🎮 Run artifact — Chrome / Edge / Firefox** | Starts `run.sh` as a background task and opens the built artifact at `http://localhost:8080` |

### VS Code tasks

The following tasks are available via **Terminal → Run Task**:

| Task | What it does |
|------|-------------|
| **Start: Vite dev server** | Starts `npm run dev` as a background server (used by full-stack compounds) |
| **Start: PHP dev server** | Starts `scripts/php-dev.sh` as a background server on port 8080 |
| **Run: DB migrations** | Executes `api/migrate.php` via `scripts/php-dev.sh` |
| **Run: Build (native)** | Runs `scripts/build.sh` |
| **Run: Local server (run.sh)** | Starts `run.sh` to serve the built artifact (used by "Run artifact" configs) |

### PHP binary resolution (`scripts/php-dev.sh`)

All PHP launch configs and tasks use [`scripts/php-dev.sh`](scripts/php-dev.sh) as the runtime. It automatically picks the best available PHP without hardcoding any path:

| Priority | Condition |
|----------|-----------|
| `CHAR_VAULT_PHP` env var | Explicit override — always wins |
| System PHP with Xdebug | When `XDEBUG_MODE` is set (debug sessions) |
| `.build-tools/bin/php` | Portable PHP cached by `build.sh` |
| System PHP ≥ 8.1 | Final fallback |

> **Xdebug note:** The portable binary in `.build-tools/` does **not** include Xdebug (Zend extensions cannot be statically compiled). For breakpoints to work, a system PHP with Xdebug is required.
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
>
> ```ini
> zend_extension=xdebug
> xdebug.mode=debug
> xdebug.start_with_request=yes
> xdebug.client_host=127.0.0.1
> xdebug.client_port=9003
> ```
>
> The **spawn** backend config injects these as environment variables automatically, so no permanent `php.ini` edit is required — only the extension itself must be installed.

---

## Building & packaging

Two strategies are available depending on what is installed on the host.

### Option A — Native build (`scripts/build.sh`)

No global Composer or PHP installation required. The script bootstraps everything into `.build-tools/`:

```sh
# Standard production build (type-check → Vitest → PHPUnit → vite build → package)
./scripts/build.sh

# Skip test suites (faster iterations)
./scripts/build.sh --skip-tests

# Custom version tag
./scripts/build.sh --tag v1.2.3

# Custom output directories
./scripts/build.sh --output /tmp/releases --deploy /tmp/deploy

# Staging environment
./scripts/build.sh --env staging --tag v1.2.3-rc1

# Keep intermediary build directory after packaging
./scripts/build.sh --no-clean

# All options
./scripts/build.sh --help
```

**What it does, step by step:**

| Step | Action |
|------|--------|
| 0 | Bootstrap `.build-tools/` — download portable PHP and Composer if not cached |
| 1 | `npm ci` + `composer install` (dev deps only) |
| 2 | `svelte-check` (TypeScript type-check) |
| 3 | Vitest (frontend unit tests) |
| 4 | PHPUnit (backend integration tests) |
| 5 | `vite build` (SvelteKit SPA) |
| 6–9 | Assemble artifact, generate `.htaccess`, create tarball |

**Outputs:**

| Path | Contents |
|------|----------|
| `dist/character-vault-<tag>/` | Extracted artifact — used directly by `run.sh` |
| `dist-pkg/character-vault-<tag>.tar.gz` | Compressed tarball — upload this to the server |

### Option B — Docker build (`scripts/build-docker.sh`)

Runs the entire pipeline inside Docker. **No Node.js, PHP, or Composer needed on the host.**

```sh
# Standard build (tag from git describe)
./scripts/build-docker.sh

# Custom version tag
./scripts/build-docker.sh --tag v1.2.3

# Force full rebuild (no Docker layer cache)
./scripts/build-docker.sh --no-cache

# Build and push the builder image to a registry
./scripts/build-docker.sh --push --registry ghcr.io/my-org

# All options
./scripts/build-docker.sh --help
```

**Outputs:** same as Option A — `dist/` and `dist-pkg/`.

### Artifact contents

```
character-vault-<tag>/
├── build/      # SvelteKit compiled SPA
├── api/        # PHP backend — zero external dependencies
├── static/     # Static assets (rules JSON, robots.txt…)
├── .htaccess   # Apache routing (/api/* → PHP, everything else → SvelteKit)
└── VERSION     # Version tag string
```

> **No `vendor/` in the artifact** — the PHP backend has zero production dependencies. Composer is only used during the build to run PHPUnit.

---

## Running the application

### Locally — PHP built-in server (`run.sh`)

Serves the latest artifact in `dist/` using PHP's built-in server with a custom router that dispatches `/api/*` to PHP and everything else to the SvelteKit SPA. Runs DB migrations automatically on first launch if no database is found.

```sh
# Run on default port 8080
./run.sh

# Custom port
./run.sh --port 9000

# Point to a specific artifact
./run.sh --dir dist/character-vault-v1.2.3

# Custom .env file
./run.sh --env-file /path/to/my.env

# All options
./run.sh --help
```

### Locally — Docker / Apache (`run-docker.sh`)

Provides a production-like environment (Apache + `mod_rewrite` + PHP + `pdo_sqlite`) without installing anything on the host beyond Docker.

```sh
# Run on default port 8080
./run-docker.sh

# Custom port
./run-docker.sh --port 9000

# Force rebuild of the runner image
./run-docker.sh --no-cache

# All options
./run-docker.sh --help
```

The run image (`character-vault-run:latest`) is built once and reused. The SQLite database is persisted in a Docker volume (`character-vault-db`).

---

## Environment variables

Configuration is resolved in this priority order (highest wins):

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

Server control panels rarely expose environment variable configuration. Place a `.env` file in the extracted artifact directory (next to `api/`):

```
character-vault-v1.2.3/
├── api/
├── build/
├── static/
├── .htaccess
└── .env   ← create this file on the server
```

Minimum production content:

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

# 2. Create .env with your production settings
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

## Further reading

| Document | Contents |
|----------|----------|
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Full system specification: ECS engine, DAG resolution, type system, math parser, dice engine, i18n, data override system |
| [`ANNEXES.md`](ANNEXES.md) | JSON rule file examples and configuration tables |
| [`PROGRESS.md`](PROGRESS.md) | Development checklist |
