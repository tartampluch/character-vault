# Character Vault — D&D 3.5 Virtual Tabletop Engine

A data-driven D&D 3.5 character sheet and campaign management application built with **Svelte 5**, **TypeScript**, and **PHP/SQLite**.

## Architecture

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the full system specification.
See [`ANNEXES.md`](ANNEXES.md) for JSON rule file examples and configuration tables.
See [`PROGRESS.md`](PROGRESS.md) for the development checklist.
See [`FINAL_REVIEW.md`](FINAL_REVIEW.md) for the final review.

## Prerequisites

- **Node.js** 18+ and npm
- **PHP** 8.1+ (for the backend API)
- **Composer** (for PHPUnit tests)

## Setup

```sh
# Install frontend dependencies
npm install

# Install PHP test dependencies
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
# Run all PHPUnit tests
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

Two build strategies are available: **native** (requires Node.js + PHP + Composer on the host) and **Docker** (no dependencies required on the host).

### Option A — Native build (`scripts/build.sh`)

```sh
# Make executable once
chmod +x scripts/build.sh

# Standard production build (runs type-checker, tests, vite build, PHPUnit)
./scripts/build.sh

# Skip all test suites (faster, for CI pre-checks)
./scripts/build.sh --skip-tests

# Custom version tag
./scripts/build.sh --tag v1.2.3

# Custom output directory
./scripts/build.sh --output /tmp/releases

# Staging environment
./scripts/build.sh --env staging --tag v1.2.3-rc1

# No-clean (keep intermediate build directory)
./scripts/build.sh --no-clean

# Show all options
./scripts/build.sh --help
```

Output: `dist-pkg/character-vault-<tag>.tar.gz`

### Option B — Docker build (`scripts/build-docker.sh`)

Runs the entire pipeline (type-check → test → build → package) inside Docker.
**No Node.js, PHP or Composer needed on the host.**

```sh
# Make executable once
chmod +x scripts/build-docker.sh

# Standard build (tag from `git describe`)
./scripts/build-docker.sh

# Custom version tag
./scripts/build-docker.sh --tag v1.2.3

# Custom output directory
./scripts/build-docker.sh --output /tmp/releases

# Force full rebuild (no Docker layer cache)
./scripts/build-docker.sh --no-cache

# Build + push the builder image to a registry
./scripts/build-docker.sh --push --registry ghcr.io/my-org

# Show all options
./scripts/build-docker.sh --help
```

You can also call docker compose directly:

```sh
# Default (APP_VERSION=dev)
docker compose run --rm builder

# With a custom version tag
APP_VERSION=v1.2.3 docker compose run --rm builder

# Force rebuild
docker compose build --no-cache && docker compose run --rm builder
```

Output: `dist-pkg/character-vault-<tag>.tar.gz`

### Artefact contents

```
character-vault-<tag>/
├── build/          # SvelteKit compiled output
├── api/            # PHP backend (controllers, config, index.php …)
├── static/         # Static assets (rules JSON, robots.txt …)
├── composer.json   # Run `composer install --no-dev` on the server
├── .htaccess       # Apache routing (/api/* → PHP, rest → SvelteKit)
└── VERSION         # Version tag string
```

---

## Production Deployment

After extracting the artefact on the server:

```sh
# 1. Extract
tar -xzf character-vault-<tag>.tar.gz
cd character-vault-<tag>

# 2. Install PHP production dependencies
composer install --no-dev --optimize-autoloader

# 3. Set environment variables (or create a .env file)
export DB_HOST=localhost
export DB_NAME=character_vault
export DB_USER=app
export DB_PASS=secret
export JWT_SECRET=<long-random-string>

# 4. Run database migrations
php api/migrate.php

# 5. Configure your web server
#    - Document root → extracted directory
#    - /api/* → handled by PHP (see .htaccess)
#    - All other paths → build/index.html (SvelteKit)
```

See [`api/config.php`](api/config.php) for the full list of environment variables.

Preview the production build locally (without packaging):

```sh
npm run build && npm run preview
```
