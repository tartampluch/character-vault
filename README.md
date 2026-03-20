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

## Building

```sh
npm run build
```

Preview the production build:

```sh
npm run preview
```

## Production Deployment

For production, configure your web server (Apache/nginx) to:
- Route `/api/*` requests to PHP
- Route all other requests to the SvelteKit build output
- Store the SQLite database file outside the web root

See [`api/config.php`](api/config.php) for environment configuration options.
