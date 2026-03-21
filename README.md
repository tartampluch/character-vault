# Character Vault — D&D 3.5 Virtual Tabletop Engine

A data-driven D&D 3.5 character sheet and campaign management application built with **Svelte 5**, **TypeScript**, and **PHP/SQLite**.

## Architecture

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the full system specification.
See [`ANNEXES.md`](ANNEXES.md) for JSON rule file examples and configuration tables.
See [`PROGRESS.md`](PROGRESS.md) for the development checklist.
See [`FINAL_REVIEW.md`](FINAL_REVIEW.md) for the final review.

## Prerequisites

- **Node.js** 18+ and npm
- **PHP** 8.1+ (for the backend API and local dev server)
- **Composer** (for PHPUnit tests only — not needed on the production server)

> **Tip:** `scripts/build.sh` downloads Composer automatically into `.build-tools/`
> and can also download a portable PHP binary if no system PHP is found.
> You never need to install Composer globally.

## Setup

```sh
# Install frontend dependencies
npm install

# Install PHP test dependencies (Composer is downloaded automatically by build.sh)
# For manual setup or local dev:
composer install
```

## Developing

Start both the frontend dev server and the PHP API:

```sh
# Terminal 1: SvelteKit dev server (port 5173)
npm run dev

# Terminal 2: PHP built-in server (port 8080)
php -S localhost:8080 -t api api/index.php
```

The Vite proxy configuration in [`vite.config.ts`](vite.config.ts) forwards `/api` requests to the PHP server automatically.

## Database Setup

Run the migration script to create the SQLite database:

```sh
php api/migrate.php
```

This creates the `users`, `campaigns`, and `characters` tables.

## Running Tests

### Frontend Tests (Vitest)

```sh
# Run all Vitest unit tests
npm test

# Run tests in watch mode
npm run test -- --watch

# Run a specific test file
npm test -- src/tests/diceEngine.test.ts
```

Test suites (7 files, 219+ test cases):
- [`mathParser.test.ts`](src/tests/mathParser.test.ts) — Formula evaluation, `@`-path resolution, pipe operators
- [`logicEvaluator.test.ts`](src/tests/logicEvaluator.test.ts) — Logic tree evaluation (AND/OR/NOT/CONDITION)
- [`stackingRules.test.ts`](src/tests/stackingRules.test.ts) — D&D 3.5 modifier stacking rules
- [`diceEngine.test.ts`](src/tests/diceEngine.test.ts) — Dice rolling, situational bonuses, exploding 20s
- [`dagResolution.test.ts`](src/tests/dagResolution.test.ts) — DAG cascade, forbidden tags, formula-as-value
- [`multiclass.test.ts`](src/tests/multiclass.test.ts) — Multiclass BAB/saves, level-gated features
- [`mergeEngine.test.ts`](src/tests/mergeEngine.test.ts) — Data override merge engine (replace/partial/-prefix)

### Backend Tests (PHPUnit)

```sh
# Run all PHPUnit tests (Composer + PHPUnit must be installed)
./vendor/bin/phpunit

# Run a specific test file
./vendor/bin/phpunit tests/AuthTest.php
```

Test suites (6 files):
- [`AuthTest.php`](tests/AuthTest.php) — Login/logout, session persistence, wrong credentials
- [`CharacterControllerTest.php`](tests/CharacterControllerTest.php) — Character CRUD, JSON persistence
- [`VisibilityTest.php`](tests/VisibilityTest.php) — Role-based access control (GM vs player)
- [`GmOverrideTest.php`](tests/GmOverrideTest.php) — GM override visibility (merged vs raw)
- [`SyncTest.php`](tests/SyncTest.php) — Timestamp-based sync mechanism
- [`TestCase.php`](tests/TestCase.php) — Base test utilities with in-memory SQLite

## Debugging (VS Code)

The repository includes a [`launch.json`](.vscode/launch.json) with ready-to-use debug configurations.
Install the recommended extensions first (VS Code will prompt you automatically via [`.vscode/extensions.json`](.vscode/extensions.json)):

| Extension | Purpose |
|-----------|---------|
| `svelte.svelte-vscode` | Svelte language support |
| `xdebug.php-debug` | PHP / Xdebug debug adapter |
| `bmewburn.vscode-intelephense-client` | PHP IntelliSense |
| `ms-edgetools.vscode-edge-devtools` | Chrome / Edge debugger |

### Frontend (SvelteKit / Vite)

1. Start the dev server in a terminal: `npm run dev`
2. In VS Code, open **Run & Debug** (`⇧⌘D`) and select **🟠 Frontend — Chrome (SvelteKit / Vite)**
3. Press **F5** — Chrome opens with breakpoints and source-maps active

### Backend (PHP / Xdebug)

Add to your `php.ini` (one-time setup):

```ini
zend_extension=xdebug
xdebug.mode=debug
xdebug.start_with_request=yes
xdebug.client_host=127.0.0.1
xdebug.client_port=9003
```

Then either:

- Select **🐘 Backend — PHP (Xdebug)** and press **F5** — VS Code listens for connections;
  start the PHP server manually in a terminal: `php -S localhost:8080 -t api api/index.php`
- **Or** select **🐘 Backend — PHP (spawn server + Xdebug)** — spawns both the server and Xdebug listener in one shot.

### Full-Stack

Select **🚀 Full Stack — Frontend + Backend** to launch frontend and backend debuggers simultaneously.

---

## Building & Packaging

Two build strategies are available.

### Option A — Native build (`scripts/build.sh`)

No global Composer installation required — the script downloads Composer into
`.build-tools/` automatically. If PHP is not found on the system, a portable
static binary is downloaded there too. Nothing is installed system-wide.

```sh
# Make executable once
chmod +x scripts/build.sh

# Standard production build (type-check → tests → vite build → PHPUnit → package)
./scripts/build.sh

# Skip all test suites (faster, useful for CI pre-checks)
./scripts/build.sh --skip-tests

# Custom version tag
./scripts/build.sh --tag v1.2.3

# Custom output directories
./scripts/build.sh --output /tmp/releases --deploy /tmp/deploy

# Staging environment
./scripts/build.sh --env staging --tag v1.2.3-rc1

# Keep the intermediate build directory after packaging
./scripts/build.sh --no-clean

# Show all options
./scripts/build.sh --help
```

**Outputs:**

| Path | Contents |
|------|----------|
| `dist/character-vault-<tag>/` | Extracted artifact — used directly by `run.sh` |
| `dist-pkg/character-vault-<tag>.tar.gz` | Compressed tarball — upload this to the server |

### Option B — Docker build (`scripts/build-docker.sh`)

Runs the entire pipeline inside Docker. **No Node.js, PHP or Composer needed on the host.**

```sh
# Make executable once
chmod +x scripts/build-docker.sh

# Standard build (tag from `git describe`)
./scripts/build-docker.sh

# Custom version tag
./scripts/build-docker.sh --tag v1.2.3

# Force full rebuild (no Docker layer cache)
./scripts/build-docker.sh --no-cache

# Build + push the builder image to a registry
./scripts/build-docker.sh --push --registry ghcr.io/my-org

# Show all options
./scripts/build-docker.sh --help
```

**Outputs:** same as Option A — `dist/` and `dist-pkg/`.

### Artefact contents

```
character-vault-<tag>/
├── build/      # SvelteKit compiled output (static SPA)
├── api/        # PHP backend — zero external dependencies
├── static/     # Static assets (rules JSON, robots.txt …)
├── .htaccess   # Apache routing (/api/* → PHP, rest → SvelteKit)
└── VERSION     # Version tag string
```

> **No `vendor/` directory** — there are no PHP production dependencies.
> Composer is only used during the build to run PHPUnit tests.

---

## Running the Application

### Locally — PHP built-in server (`run.sh`)

Serves the latest artifact from `dist/` using PHP's built-in server with a custom
router that dispatches `/api/*` to the PHP backend and everything else to the
SvelteKit static build.

```sh
# Make executable once
chmod +x run.sh

# Run using the latest artifact in dist/ (port 8080)
./run.sh

# Custom port
./run.sh --port 9000

# Point at a specific artifact directory
./run.sh --dir dist/character-vault-v1.2.3

# Show all options
./run.sh --help
```

PHP is located automatically: `.build-tools/bin/php` (cached by `build.sh`) → system PHP.

### Locally — Docker / Apache (`run-docker.sh`)

Provides a production-like environment (Apache + mod_rewrite + PHP + pdo_sqlite)
without installing anything on the host beyond Docker.

```sh
# Make executable once
chmod +x run-docker.sh

# Run using the latest artifact in dist/ (port 8080)
./run-docker.sh

# Custom port
./run-docker.sh --port 9000

# Force rebuild of the run image
./run-docker.sh --no-cache

# Show all options
./run-docker.sh --help
```

The run image (`character-vault-run:latest`) is built once and reused.
The SQLite database is persisted in a Docker volume (`character-vault-db`).

---

## Production Deployment

After extracting the tarball on the server:

```sh
# 1. Extract
tar -xzf character-vault-<tag>.tar.gz
cd character-vault-<tag>

# 2. Create / update the database
php api/migrate.php

# 3. Set the environment (edit api/config.php or use server env variables)
export APP_ENV=production

# 4. Configure your web server
#    - Document root → extracted directory
#    - AllowOverride All (so .htaccess is honoured)
#    - The included .htaccess handles all routing automatically
```

**Server requirements:**
- PHP ≥ 8.1 with `pdo_sqlite` enabled (standard on all shared hosts including OVH)
- Apache with `mod_rewrite` and `AllowOverride All`
- **No Composer, no Node.js, no npm** needed on the server

See [`api/config.php`](api/config.php) for the full list of environment variables
(DB path, session settings, CORS origins, etc.).

Preview the production build locally (without packaging):

```sh
npm run build && npm run preview
```
